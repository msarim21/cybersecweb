'use strict';

/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  BOT SUPERVISOR — Master Process (worker_threads architecture)          ║
 * ╠══════════════════════════════════════════════════════════════════════════╣
 * ║  Design:                                                                 ║
 * ║   • Master spawns ONE worker_thread per bot (bot-thread.js)             ║
 * ║   • Each thread internally forks bot-runner.js (Baileys process)        ║
 * ║   • SharedArrayBuffer → zero-copy real-time metrics from all threads    ║
 * ║   • parentPort.postMessage → microsecond IPC master ↔ threads           ║
 * ║   • Thread crash → master instantly re-spawns only that thread          ║
 * ║   • Bot process crash inside thread → thread auto-restarts the child    ║
 * ║   • Dyno sharding — TOTAL_WORKER_DYNOS distributes bots across dynos    ║
 * ║   • Memory-aware spawning + LRU rotation when RAM is under pressure     ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

const { Worker }  = require('worker_threads');
const path        = require('path');
const fs          = require('fs');
const chalk       = require('chalk');

const { cleanBotNum, ensureBotWorkspace }  = require('../allfunc/bot-workspace');
const { getDynoIndex, getTotalWorkerDynos } = require('../allfunc/whatsapp-host');
const { canSpawnBot, getMemSummary, getMaxConcurrentBots } = require('./mem-guard');
const {
    createSharedBuffer,
    wrapSlot,
    getActiveBotCount,
    setActiveBotCount,
} = require('./shared-state');

// ── Rotation timing (env-tunable — BOT_TURBO_ROTATION=1 for max speed on 1GB) ─
function _numEnv(key, fallback) {
    const v = Number(process.env[key]);
    return Number.isFinite(v) && v >= 0 ? v : fallback;
}

function getSyncIntervalMs() {
    if (process.env.BOT_TURBO_ROTATION === '1') return _numEnv('BOT_SYNC_INTERVAL_MS', 2000);
    return _numEnv('BOT_SYNC_INTERVAL_MS', 8000);
}

function getRotationIntervalMs() {
    const hours = Number(process.env.BOT_ROTATION_HOURS);
    if (Number.isFinite(hours) && hours > 0) return hours * 60 * 60 * 1000;
    if (process.env.BOT_TURBO_ROTATION === '1') {
        return _numEnv('BOT_ROTATION_INTERVAL_SEC', 20) * 1000;
    }
    return _numEnv('BOT_ROTATION_INTERVAL_SEC', 45) * 1000;
}

function getRotationSwapMs() {
    // Too low → WhatsApp 440; 400–600ms is the safe floor for kill→spawn.
    return Math.max(400, _numEnv('BOT_ROTATION_SWAP_MS', process.env.BOT_TURBO_ROTATION === '1' ? 500 : 1200));
}

function getRotationsPerSync() {
    if (process.env.BOT_TURBO_ROTATION === '1') {
        return Math.max(1, _numEnv('BOT_ROTATIONS_PER_SYNC', 1));
    }
    return Math.max(1, _numEnv('BOT_ROTATIONS_PER_SYNC', 1));
}

function getMinRotationUptimeMs() {
    return Math.max(60_000, _numEnv('BOT_MIN_UPTIME_MS', 30 * 60 * 1000));
}

/** Only time-share bots when there are more linked numbers than RAM allows live at once. */
function _shouldUseRotation(myBots, runningNow) {
    const maxConcurrent = getMaxConcurrentBots();
    if (!myBots || myBots.size <= maxConcurrent) return false;
    return runningNow >= maxConcurrent;
}

const THREAD_RESTART_DELAY  = 5_000;
const MAX_RESTARTS_PER_HOUR = 12;
const BOT_RUNNER_SCRIPT     = path.join(__dirname, 'bot-runner.js');

// ── Shared memory (zero-copy metrics from all threads) ───────────────────────
const sharedBuffer = createSharedBuffer();

// ── State ─────────────────────────────────────────────────────────────────────
/** @type {Map<string, { thread: Worker, slotIndex: number, pairing: boolean, spawnedAt: number, restartTimes: number[] }>} */
const threads     = new Map();
const lastActivity = new Map();

let _slotCounter = 0;
let _active      = false;
let _syncTimer   = null;
let _lastRotationAt = Date.now();

// ── Global error handlers (Master process) ───────────────────────────────────
const IGNORED_ERRORS = [
    'Socket connection timeout', 'Connection Closed', 'Timed Out',
    'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'Bad MAC', 'Connection lost',
    'WebSocket closed', '440', 'EKEYTYPE', 'rate-overlimit',
];

process.on('uncaughtException', (err) => {
    if (IGNORED_ERRORS.some((e) => String(err).includes(e))) return;
    console.error(chalk.red(`[Supervisor] ⚡ uncaughtException: ${err.message}`));
});

process.on('unhandledRejection', (reason) => {
    if (IGNORED_ERRORS.some((e) => String(reason).includes(e))) return;
    console.error(chalk.red(`[Supervisor] ⚡ unhandledRejection: ${String(reason).substring(0, 200)}`));
});

process.on('SIGTERM', () => { stopSupervisor(); setTimeout(() => process.exit(0), 3000); });
process.on('SIGINT',  () => { stopSupervisor(); setTimeout(() => process.exit(0), 3000); });

// ── Helpers ───────────────────────────────────────────────────────────────────
function isSupervisorActive() { return _active; }

function _nextSlot() {
    return (_slotCounter++) % 300;
}

function _buildThreadEnv(extra = {}) {
    const childHeap  = process.env.BOT_CHILD_HEAP_MB || '128';
    const existing   = String(process.env.NODE_OPTIONS || '');
    const heapFlag   = `--max-old-space-size=${childHeap}`;
    const nodeOpts   = existing.includes('max-old-space-size') ? existing : `${existing} ${heapFlag}`.trim();
    return { ...process.env, NODE_OPTIONS: nodeOpts, ...extra };
}

function _hasRegisteredCreds(clean) {
    const paths = [
        path.join(__dirname, '..', 'nexstore', 'pairing', `${clean}@s.whatsapp.net`, 'creds.json'),
        path.join(__dirname, '..', 'nexstore', 'pairing', clean, 'creds.json'),
    ];
    for (const p of paths) {
        try {
            if (!fs.existsSync(p)) continue;
            const creds = JSON.parse(fs.readFileSync(p, 'utf8'));
            if (creds?.registered || creds?.me?.id) return true;
        } catch (_) {}
    }
    return false;
}

function _isThreadAlive(entry) {
    if (!entry?.thread) return false;
    const slot = wrapSlot(sharedBuffer, entry.slotIndex);
    return slot.isRunning();
}

function _isThreadHealthy(clean, entry) {
    if (!entry?.thread) return false;
    const gracePeriod = 10 * 60 * 1000;
    if (Date.now() - (entry.spawnedAt || 0) < gracePeriod) return true;

    try {
        const { isBotHeartbeatFresh, readBotHeartbeat } = require('../allfunc/bot-heartbeat');
        const hb = readBotHeartbeat(clean);
        if (hb?.wsState === 1) return true;
        if (isBotHeartbeatFresh(clean, 20 * 60 * 1000)) return true;
    } catch (_) {}

    return false;
}

function _getLruRunningBot(botSet) {
    let lruNum = null;
    let lruTime = Infinity;
    const minUptime = getMinRotationUptimeMs();
    for (const [clean, entry] of threads) {
        if (!botSet.has(clean)) continue;
        if (entry?.pairing) continue;
        if (global._pairingInFlight?.has(clean)) continue;
        if (Date.now() - (entry.spawnedAt || 0) < minUptime) continue;
        try {
            const { readBotHeartbeat } = require('../allfunc/bot-heartbeat');
            const hb = readBotHeartbeat(clean);
            if (hb?.ready === false || hb?.syncing === true) continue;
        } catch (_) {}
        const t = lastActivity.get(clean) || (entry.spawnedAt || 0);
        if (t < lruTime) { lruTime = t; lruNum = clean; }
    }
    return lruNum;
}

/** Swap one running bot out for the next sleeping bot (LRU rotation). */
async function _rotateOneBot(myBots, sleepingList, runningNow) {
    if (!_shouldUseRotation(myBots, runningNow)) return false;

    const pending = (sleepingList || []).filter((c) => !threads.has(c));
    if (!pending.length) return false;

    const lru = _getLruRunningBot(myBots);
    const next = pending[0];
    if (!lru || !next || lru === next) return false;

    console.log(chalk.cyan(`[Supervisor] ⚡ Rotate +${lru} → +${next} | ${getMemSummary(runningNow)}`));
    lastActivity.set(lru, 0);
    killBot(lru, 'SIGTERM');
    await new Promise((r) => setTimeout(r, getRotationSwapMs()));

    const ready = await _ensureBotSessionReady(next);
    if (!ready) return false;
    spawnBot(next);
    lastActivity.set(next, Date.now());
    return true;
}

async function _ensureBotSessionReady(clean) {
    if (_hasRegisteredCreds(clean)) return true;
    try {
        const { ensureSessionRestored } = require('../session-db');
        const ok = await ensureSessionRestored(clean);
        if (ok) console.log(chalk.cyan(`[Supervisor] 📥 Session restored from DB: +${clean}`));
        return ok;
    } catch (e) {
        console.log(chalk.yellow(`[Supervisor] Session restore failed for +${clean}: ${e.message}`));
        return false;
    }
}

function _updateActiveBotCount() {
    const count = [...threads.values()].filter((e) => !e.pairing && wrapSlot(sharedBuffer, e.slotIndex).isRunning()).length;
    setActiveBotCount(sharedBuffer, count);
}

// ── Thread management ─────────────────────────────────────────────────────────
function _onThreadMessage(clean, msg) {
    if (!msg?.type) return;
    switch (msg.type) {
        case 'heartbeat':
        case 'spawned':
            lastActivity.set(clean, Date.now());
            _updateActiveBotCount();
            break;
        case 'exit':
            console.log(chalk.gray(
                `[Supervisor] Bot +${clean} child exited (code=${msg.code}, restarts=${msg.restarts})`
            ));
            _updateActiveBotCount();
            break;
        case 'restartLimitReached':
            console.log(chalk.red(`[Supervisor] +${clean} hit restart limit (${msg.recent}/hr) — pausing`));
            break;
        case 'threadError':
            console.log(chalk.red(`[Supervisor] Thread error for +${clean}: ${msg.message}`));
            break;
        case 'threadStopped':
            threads.delete(clean);
            _updateActiveBotCount();
            break;
    }
}

function _spawnThread(clean, opts = {}) {
    if (!clean) return null;
    if (threads.has(clean) && !opts.force) return threads.get(clean).thread;

    ensureBotWorkspace(clean);

    const slotIndex = _nextSlot();

    const thread = new Worker(path.join(__dirname, 'bot-thread.js'), {
        workerData: {
            botNumber       : clean,
            slotIndex,
            sharedBuffer,
            botRunnerScript : BOT_RUNNER_SCRIPT,
            env             : _buildThreadEnv({ BOT_PAIRING: opts.pairing ? '1' : '0' }),
            maxRestartsPerHour: MAX_RESTARTS_PER_HOUR,
            restartDelayMs  : 10_000,
        },
    });

    const entry = {
        thread,
        slotIndex,
        pairing   : Boolean(opts.pairing),
        spawnedAt : Date.now(),
        restartTimes: [],
    };
    threads.set(clean, entry);
    lastActivity.set(clean, Date.now());

    thread.on('message', (msg) => _onThreadMessage(clean, msg));

    thread.on('error', (err) => {
        console.log(chalk.red(`[Supervisor] Worker thread error for +${clean}: ${err.message}`));
    });

    thread.on('exit', (code) => {
        const wasEntry = threads.get(clean);
        if (wasEntry?.thread === thread) threads.delete(clean);
        wrapSlot(sharedBuffer, slotIndex).clear();
        _updateActiveBotCount();

        if (opts.noRestart || !_active) return;
        if (code === 0) return;

        const hourAgo = Date.now() - 60 * 60 * 1000;
        const recentRestarts = (wasEntry?.restartTimes || []).filter((t) => t > hourAgo);
        if (recentRestarts.length >= MAX_RESTARTS_PER_HOUR) {
            console.log(chalk.red(`[Supervisor] +${clean} thread restart limit — skip`));
            return;
        }

        console.log(chalk.yellow(`[Supervisor] Thread for +${clean} died (code=${code}) — respawning in ${THREAD_RESTART_DELAY / 1000}s`));
        setTimeout(async () => {
            if (!_active) return;
            const ready = await _ensureBotSessionReady(clean).catch(() => false);
            if (ready) _spawnThread(clean);
        }, THREAD_RESTART_DELAY);
    });

    console.log(chalk.green(`[Supervisor] ▶ Thread started for +${clean}${opts.pairing ? ' (pairing)' : ''} | ${getMemSummary()}`));
    return thread;
}

function killBot(botNum, signal = 'SIGTERM') {
    const clean = cleanBotNum(botNum);
    const entry = threads.get(clean);
    if (!entry?.thread) return false;
    try { entry.thread.postMessage({ cmd: signal === 'SIGKILL' ? 'kill' : 'stop' }); } catch (_) {}
    try { entry.thread.terminate(); } catch (_) {}
    threads.delete(clean);
    wrapSlot(sharedBuffer, entry.slotIndex).clear();
    _updateActiveBotCount();
    console.log(chalk.yellow(`[Supervisor] Stopped +${clean}`));
    return true;
}

function spawnBot(botNum, opts = {}) {
    const clean = cleanBotNum(botNum);
    if (!clean) return null;
    if (threads.has(clean) && !opts.force) return threads.get(clean).thread;
    if (opts.force) killBot(clean);
    return _spawnThread(clean, opts);
}

// ── Promotion: pairing complete → full bot ────────────────────────────────────
function markBotPromoted(botNum) {
    const entry = threads.get(cleanBotNum(botNum));
    if (entry) entry.pairing = false;
}

function promotePairingToNormal(botNum) {
    const clean = cleanBotNum(botNum);
    if (!clean) return false;
    const entry = threads.get(clean);
    if (!entry?.pairing) return false;
    if (!_hasRegisteredCreds(clean)) return false;

    console.log(chalk.cyan(`[Supervisor] 🔄 Promoting +${clean}: pairing → full bot`));
    killBot(clean, 'SIGTERM');
    setTimeout(() => {
        if (!_active || threads.has(clean)) return;
        spawnBot(clean);
    }, 2500);
    return true;
}

// ── syncBots ─────────────────────────────────────────────────────────────────
async function syncBots() {
    try {
        const { syncStoppedWithLinkedNumbers } = require('../allfunc/stopped-bots');
        await syncStoppedWithLinkedNumbers();
    } catch (_) {}

    const { getActiveLinkedNumbers } = require('../session-db');
    const { readStopped }            = require('../allfunc/stopped-bots');
    const { shardLinkedSet }           = require('../allfunc/dyno-shard');

    const linked = (await getActiveLinkedNumbers().catch(() => []))
        .map((n) => cleanBotNum(n)).filter(Boolean);
    const stopped    = new Set(readStopped());
    const linkedSet  = new Set(linked.filter((n) => !stopped.has(n)));

    const { getTotalWorkerDynos } = require('../allfunc/whatsapp-host');
    const totalDynos = getTotalWorkerDynos();
    const myBots = shardLinkedSet([...linkedSet]);

    if (totalDynos > 1) {
        const dynoIndex = getDynoIndex();
        console.log(chalk.cyan(
            `[Supervisor] 🔀 Dyno ${dynoIndex + 1}/${totalDynos}: managing ${myBots.size}/${linkedSet.size} bots`
        ));
    } else if (linkedSet.size > 0) {
        const maxConcurrent = getMaxConcurrentBots();
        console.log(chalk.cyan(
            `[Supervisor] Managing ${linkedSet.size} bot(s) | max ${maxConcurrent} concurrent | ${getMemSummary()}`
        ));
    }

    const { isConnected } = require('../allfunc/connected-flag');

    // 1. Promote stuck pairing threads → full bots
    for (const [clean, entry] of [...threads]) {
        if (!entry?.pairing) continue;
        if (global._pairingInFlight?.has(clean)) continue;
        if (!myBots.has(clean)) continue;
        if (_hasRegisteredCreds(clean) && isConnected(clean)) promotePairingToNormal(clean);
    }

    // 2. Restart unhealthy threads
    for (const [clean, entry] of [...threads]) {
        if (entry?.pairing) continue;
        if (global._pairingInFlight?.has(clean)) continue;
        if (!myBots.has(clean)) continue;
        if (_isThreadHealthy(clean, entry)) continue;

        console.log(chalk.red(`[Supervisor] 💀 +${clean} unhealthy — restarting thread`));
        killBot(clean, 'SIGTERM');
        const ready = await _ensureBotSessionReady(clean);
        if (ready) spawnBot(clean);
    }

    // 3. Scheduled memory restart
    let maxAgeMs = 0;
    try {
        const { getBotRestartHours } = require('../keepalive');
        const hrs = getBotRestartHours();
        if (hrs > 0) maxAgeMs = hrs * 60 * 60 * 1000;
    } catch (_) {}
    if (maxAgeMs > 0) {
        for (const [clean, entry] of [...threads]) {
            if (entry?.pairing) continue;
            if (!myBots.has(clean)) continue;
            if (!entry.spawnedAt || Date.now() - entry.spawnedAt < maxAgeMs) continue;
            console.log(chalk.cyan(`[Supervisor] 🔄 +${clean} memory restart (${Math.round((Date.now()-entry.spawnedAt)/3600000)}h uptime)`));
            killBot(clean, 'SIGTERM');
            const ready = await _ensureBotSessionReady(clean);
            if (ready) spawnBot(clean);
        }
    }

    // 4. Update lastActivity from heartbeat files
    try {
        const { readBotHeartbeat } = require('../allfunc/bot-heartbeat');
        for (const [clean] of threads) {
            const hb = readBotHeartbeat(clean);
            if (hb?.ts && hb.ts > (lastActivity.get(clean) || 0)) lastActivity.set(clean, hb.ts);
        }
    } catch (_) {}

    // 5. Start sleeping bots (memory-aware + LRU eviction)
    const sleepingBots = [...myBots]
        .filter((c) => !threads.has(c) && !global._pairingInFlight?.has(c))
        .sort((a, b) => (lastActivity.get(a) || 0) - (lastActivity.get(b) || 0));

    let runningNow = [...threads.values()].filter((e) => !e?.pairing).length;
    const maxConcurrent = getMaxConcurrentBots();
    const rotationsPerSync = getRotationsPerSync();
    const useRotation = _shouldUseRotation(myBots, runningNow);
    let turboSwaps = 0;

    if (!useRotation && myBots.size <= maxConcurrent) {
        for (const clean of sleepingBots) {
            const ready = await _ensureBotSessionReady(clean);
            if (ready) spawnBot(clean);
        }
    } else for (const clean of sleepingBots) {
        if (runningNow >= maxConcurrent) {
            if (turboSwaps < rotationsPerSync) {
                const ok = await _rotateOneBot(myBots, sleepingBots, runningNow);
                if (ok) {
                    turboSwaps += 1;
                    runningNow = Math.max(0, runningNow - 1);
                    continue;
                }
            }
            if (turboSwaps === 0) {
                console.log(chalk.yellow(
                    `[Supervisor] ⏸ At cap (${runningNow}/${maxConcurrent}) — ${sleepingBots.length} queued (next sync in ${getSyncIntervalMs()}ms)`
                ));
            }
            break;
        }

        const memOk = canSpawnBot(runningNow);
        if (!memOk) {
            if (runningNow === 0 && threads.size === 0) {
                console.log(chalk.yellow(`[Supervisor] ⚠️ RAM pressure — no threads running, starting first bot anyway`));
            } else if (runningNow >= maxConcurrent && turboSwaps < rotationsPerSync) {
                const ok = await _rotateOneBot(myBots, sleepingBots, runningNow);
                if (ok) {
                    turboSwaps += 1;
                    runningNow = Math.max(0, runningNow - 1);
                    continue;
                }
                console.log(chalk.yellow(
                    `[Supervisor] ⚠️ RAM full (${getMemSummary(runningNow)}) — queue paused`
                ));
                break;
            } else {
                break;
            }
        }

        const ready = await _ensureBotSessionReady(clean);
        if (ready) {
            spawnBot(clean);
            runningNow += 1;
        }
    }

    if (turboSwaps > 0) {
        console.log(chalk.green(`[Supervisor] ⚡ Turbo: ${turboSwaps} bot(s) rotated this sync`));
    }

    // 6. Scheduled LRU rotation — ONLY when at concurrent cap (never kill live bots early)
    const rotationInterval = getRotationIntervalMs();
    runningNow = [...threads.values()].filter((e) => !e?.pairing).length;
    if (
        useRotation &&
        rotationInterval > 0 &&
        Date.now() - _lastRotationAt >= rotationInterval &&
        runningNow >= maxConcurrent
    ) {
        _lastRotationAt = Date.now();
        let scheduledSwaps = 0;
        while (scheduledSwaps < rotationsPerSync) {
            const stillSleeping = [...myBots]
                .filter((c) => !threads.has(c) && !global._pairingInFlight?.has(c))
                .sort((a, b) => (lastActivity.get(a) || 0) - (lastActivity.get(b) || 0));
            if (!stillSleeping.length) break;
            runningNow = [...threads.values()].filter((e) => !e?.pairing).length;
            const ok = await _rotateOneBot(myBots, stillSleeping, runningNow);
            if (!ok) break;
            scheduledSwaps += 1;
        }
        if (scheduledSwaps > 0) {
            console.log(chalk.cyan(`[Supervisor] ⏰ Scheduled rotation: ${scheduledSwaps} swap(s)`));
        }
    }

    // 7. Stop threads not in myBots
    for (const [clean, entry] of threads) {
        if (entry?.pairing) continue;
        if (global._pairingInFlight?.has(clean)) continue;
        if (!myBots.has(clean)) killBot(clean);
    }

    _updateActiveBotCount();
}

// ── Pairing handler ───────────────────────────────────────────────────────────
function _deleteFolderRecursive(p) {
    if (!fs.existsSync(p)) return;
    for (const f of fs.readdirSync(p)) {
        const cur = path.join(p, f);
        fs.lstatSync(cur).isDirectory() ? _deleteFolderRecursive(cur) : fs.unlinkSync(cur);
    }
    try { fs.rmdirSync(p); } catch (_) {}
}

async function handlePairingRequest(clean) {
    const num = cleanBotNum(clean);
    if (!num) return;
    if (!global._pairingInFlight) global._pairingInFlight = new Set();
    if (global._pairingInFlight.has(num)) return;
    global._pairingInFlight.add(num);

    console.log(chalk.cyan(`[Supervisor] 🔗 Pairing +${num} — spawning isolated thread`));

    try {
        const { removeFromStoppedBots } = require('../allfunc/stopped-bots');
        removeFromStoppedBots(num);
        killBot(num, 'SIGKILL');

        // pair.js writes auth to nexstore/pairing/<digits>; some legacy paths
        // also created <digits>@s.whatsapp.net. Wipe both so the new pairing
        // request doesn't reuse stale creds.
        const sessionPathAlt = path.join(__dirname, '..', 'nexstore', 'pairing', `${num}@s.whatsapp.net`);
        const sessionPath    = path.join(__dirname, '..', 'nexstore', 'pairing', num);
        if (fs.existsSync(sessionPathAlt)) _deleteFolderRecursive(sessionPathAlt);
        if (fs.existsSync(sessionPath))    _deleteFolderRecursive(sessionPath);

        try { const { deleteSessionCreds } = require('../session-db'); await deleteSessionCreds(num); } catch (_) {}
        try {
            const pjson = path.join(__dirname, '..', 'nexstore', 'pairing', 'pairing.json');
            if (fs.existsSync(pjson)) fs.unlinkSync(pjson);
        } catch (_) {}
        try { const { removeConnectedFlag } = require('../allfunc/connected-flag'); removeConnectedFlag(num); } catch (_) {}

        ensureBotWorkspace(num);
        spawnBot(num, { pairing: true, force: true, noRestart: true });

        const { getPairingState, markPairingFailed } = require('../server/db-service');
        const deadline = Date.now() + 120_000;
        let gotCode = false;
        while (Date.now() < deadline) {
            const st = await getPairingState(num).catch(() => null);
            if (st?.code) { gotCode = true; break; }
            await new Promise((r) => setTimeout(r, 200));
        }
        if (!gotCode) {
            console.log(chalk.red(`[Supervisor] Pairing timeout for +${num}`));
            await require('../server/db-service').markPairingFailed(num).catch(() => {});
            killBot(num, 'SIGTERM');
        } else {
            console.log(chalk.green(`[Supervisor] ✅ Pairing code ready for +${num}`));
        }
    } finally {
        global._pairingInFlight.delete(num);
    }
}

// ── External controls ─────────────────────────────────────────────────────────
function stopBotExternal(number) {
    killBot(cleanBotNum(number), 'SIGKILL');
}

// ── Start / Stop ──────────────────────────────────────────────────────────────
function startSupervisor() {
    if (_active) return;
    _active = true;

    console.log(chalk.cyan('\n╔════════════════════════════════════════════════════╗'));
    console.log(chalk.cyan('║  BOT SUPERVISOR — worker_threads + shared memory   ║'));
    console.log(chalk.cyan('║  One thread per bot · instant crash recovery       ║'));
    console.log(chalk.cyan('╚════════════════════════════════════════════════════╝\n'));
    console.log(chalk.gray(`  SharedArrayBuffer: ${sharedBuffer.byteLength} bytes | MAX_BOTS: 300`));
    console.log(chalk.gray(`  IPC: parentPort.postMessage (microsecond latency)`));
    console.log(chalk.gray(`  Dyno: ${process.env.DYNO || 'local'} | Index: ${getDynoIndex()}/${getTotalWorkerDynos()}`));
    console.log(chalk.gray(
        `  Rotation: sync=${getSyncIntervalMs()}ms swap=${getRotationSwapMs()}ms interval=${getRotationIntervalMs()}ms ×${getRotationsPerSync()}${process.env.BOT_TURBO_ROTATION === '1' ? ' [TURBO]' : ''}\n`
    ));

    const runSync = () => syncBots().catch((e) => {
        console.log(chalk.yellow(`[Supervisor] syncBots error: ${e.message}`));
    });

    const syncMs = getSyncIntervalMs();
    runSync();
    [500, 1500, 3500, 7000].forEach((ms) => setTimeout(runSync, ms));
    _syncTimer = setInterval(runSync, syncMs);

    try {
        const pairMod = require('../pair');
        const origStop = pairMod.stopBot?.bind(pairMod);
        pairMod.stopBot = function patchedStopBot(number) {
            const clean = cleanBotNum(number);
            const entry = threads.get(clean);
            if (entry?.pairing || global._pairingInFlight?.has(clean)) {
                console.log(chalk.yellow(`[Supervisor] stopBot skipped — pairing in progress for +${clean}`));
                return;
            }
            stopBotExternal(number);
            if (typeof origStop === 'function') origStop(number);
        };
    } catch (_) {}

    return {
        isActive         : () => _active,
        syncBots,
        spawnBot,
        killBot,
        stopBotExternal,
        handlePairingRequest,
        getThreads       : () => [...threads.keys()],
        getSharedBuffer  : () => sharedBuffer,
        getActiveBotCount: () => getActiveBotCount(sharedBuffer),
    };
}

function stopSupervisor() {
    _active = false;
    if (_syncTimer) clearInterval(_syncTimer);
    for (const clean of [...threads.keys()]) killBot(clean);
    console.log(chalk.yellow('[Supervisor] All threads stopped.'));
}

module.exports = {
    startSupervisor,
    stopSupervisor,
    isSupervisorActive,
    syncBots,
    spawnBot,
    killBot,
    stopBotExternal,
    handlePairingRequest,
    markBotPromoted,
    promotePairingToNormal,
    getSharedBuffer  : () => sharedBuffer,
    getActiveBotCount: () => getActiveBotCount(sharedBuffer),
};
