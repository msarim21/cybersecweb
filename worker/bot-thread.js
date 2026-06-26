'use strict';

/**
 * Bot Thread — runs inside a worker_thread (one per WhatsApp bot).
 *
 * Responsibilities:
 *   1. Receive config from master via parentPort (workerData)
 *   2. Spawn + monitor bot-runner.js as a child_process (Baileys needs full isolation)
 *   3. Auto-restart child on crash with exponential back-off
 *   4. Report live status to master via parentPort.postMessage (microsecond IPC)
 *   5. Update SharedArrayBuffer slot with real-time metrics (zero-copy reads by master)
 *
 * Why child_process inside worker_thread?
 *   Baileys uses WebSockets, native crypto, and mutable globals — it must live in its
 *   own V8 isolate (child process).  The worker_thread gives us fast IPC + shared
 *   memory coordination without paying the overhead of an extra top-level process.
 */

const { workerData, parentPort } = require('worker_threads');
const { fork }                   = require('child_process');
const path                       = require('path');
const { wrapSlot }               = require('./shared-state');

const {
    botNumber,          // e.g. "923001234567"
    slotIndex,          // index into SharedArrayBuffer
    sharedBuffer,       // SharedArrayBuffer from master
    botRunnerScript,    // absolute path to worker/bot-runner.js
    env,                // env vars to forward to child
    maxRestartsPerHour, // default 12
    restartDelayMs,     // base delay before first restart
} = workerData;

const MAX_RESTARTS_PER_HOUR = maxRestartsPerHour ?? 12;
const BASE_RESTART_DELAY_MS = restartDelayMs     ?? 10_000;
const MAX_RESTART_DELAY_MS  = 5 * 60_000;

const slot = wrapSlot(sharedBuffer, slotIndex);

let _child          = null;
let _restartTimes   = [];
let _totalRestarts  = 0;
let _shuttingDown   = false;
let _pingInterval   = null;

function send(type, payload = {}) {
    try { parentPort.postMessage({ type, botNumber, ...payload }); } catch (_) {}
}

function updateSlot() {
    const nowSec = Math.floor(Date.now() / 1000);
    slot.setRunning(_child !== null && !_child.killed && _child.exitCode === null);
    slot.setRestarts(_totalRestarts);
    try {
        const usage = process.memoryUsage();
        slot.setHeapMB(Math.round(usage.heapUsed / 1024 / 1024));
    } catch (_) {}
}

function _restartDelay() {
    const attempt = Math.min(_totalRestarts, 8);
    return Math.min(BASE_RESTART_DELAY_MS * Math.pow(1.5, attempt), MAX_RESTART_DELAY_MS);
}

function _recentRestarts() {
    const hourAgo = Date.now() - 60 * 60 * 1000;
    _restartTimes = _restartTimes.filter((t) => t > hourAgo);
    return _restartTimes.length;
}

function spawnChild(opts = {}) {
    if (_shuttingDown) return;
    if (_child && !_child.killed && _child.exitCode === null) return;

    const childEnv = {
        ...env,
        BOT_NUMBER  : botNumber,
        BOT_PAIRING : opts.pairing ? '1' : (env.BOT_PAIRING === '1' ? '1' : '0'),
        WHATSAPP_WORKER: '1',
        BOT_ISOLATION  : '1',
    };

    _child = fork(botRunnerScript, [botNumber], {
        env    : childEnv,
        stdio  : 'inherit',
        cwd    : path.join(__dirname, '..'),
    });

    updateSlot();
    send('spawned', { pid: _child.pid, pairing: Boolean(opts.pairing) });

    _child.on('message', (msg) => {
        send('childMessage', { msg });
    });

    _child.on('exit', (code, signal) => {
        _child = null;
        updateSlot();
        send('exit', { code, signal, restarts: _totalRestarts });

        if (_shuttingDown || opts.noRestart) return;

        // ✅ FIX: code=0 = intentional clean exit (no session, bot stopped, or manual disconnect)
        // Do NOT restart — Supervisor syncBots() will re-evaluate. Restarting here causes
        // an infinite tight loop: no-session → exit(0) → restart → no-session → exit(0) → ...
        // This was the primary cause of R14 memory errors on Heroku.
        if (code === 0) {
            send('cleanExit', { reason: 'intentional exit (no-session or stopped)' });
            return;
        }

        const recent = _recentRestarts();
        if (recent >= MAX_RESTARTS_PER_HOUR) {
            send('restartLimitReached', { recent });
            return;
        }

        _totalRestarts++;
        _restartTimes.push(Date.now());
        slot.setRestarts(_totalRestarts);

        // ✅ FIX: Error 440 (session conflict) needs longer wait so WhatsApp server-side
        // session settles before we reconnect. Minimum 60s regardless of backoff formula.
        const baseDelay = _restartDelay();
        const delay = code === 440 ? Math.max(60_000, baseDelay) : baseDelay;
        send('scheduledRestart', { delayMs: delay, attempt: _totalRestarts, exitCode: code });

        setTimeout(() => {
            if (!_shuttingDown) spawnChild();
        }, delay);
    });

    _child.on('error', (err) => {
        send('childError', { message: err.message });
    });
}

function stopChild(signal = 'SIGTERM') {
    if (!_child || _child.killed) return;
    try { _child.kill(signal); } catch (_) {}
    _child = null;
    updateSlot();
}

function shutdown() {
    if (_shuttingDown) return;
    _shuttingDown = true;
    clearInterval(_pingInterval);
    stopChild('SIGTERM');
    slot.clear();
    send('threadStopped');
    setTimeout(() => process.exit(0), 2000);
}

parentPort.on('message', (msg) => {
    switch (msg?.cmd) {
        case 'start':
            spawnChild({ pairing: Boolean(msg.pairing) });
            break;
        case 'stop':
            _shuttingDown = true;
            stopChild('SIGTERM');
            break;
        case 'restart':
            stopChild('SIGTERM');
            setTimeout(() => {
                _shuttingDown = false;
                spawnChild();
            }, 2000);
            break;
        case 'kill':
            stopChild('SIGKILL');
            break;
        case 'ping':
            send('pong', { pid: _child?.pid, running: slot.isRunning() });
            break;
        case 'shutdown':
            shutdown();
            break;
    }
});

_pingInterval = setInterval(() => {
    updateSlot();
    send('heartbeat', {
        running  : slot.isRunning(),
        restarts : _totalRestarts,
        pid      : _child?.pid ?? null,
    });
}, 15_000);

process.on('uncaughtException', (err) => {
    send('threadError', { message: err.message, stack: err.stack?.substring(0, 500) });
});

process.on('unhandledRejection', (reason) => {
    send('threadError', { message: String(reason).substring(0, 300) });
});

process.on('SIGTERM', shutdown);
process.on('SIGINT',  shutdown);

send('ready');
spawnChild();
