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
        return _numEnv('BOT_ROTATION_INTERVAL_SEC', 30) * 1000;
    }
    return _numEnv('BOT_ROTATION_INTERVAL_SEC', 45) * 1000;
}

function getRotationSwapMs() {
    // Too low → WhatsApp 440; 400–600ms is the safe floor for kill→spawn.
    return Math.max(400, _numEnv('BOT_ROTATION_SWAP_MS', process.env.BOT_TURBO_ROTATION === '1' ? 500 : 1200));
}

function getRotationsPerSync() {
    if (process.env.BOT_TURBO_ROTATION === '1') {
        return Math.max(1, _numEnv('BOT_ROTATIONS_PER_SYNC', 2));
    }
    return Math.max(1, _numEnv('BOT_ROTATIONS_PER_SYNC', 1));
}

function getMinRotationUptimeMs() {
    const fallback = process.env.BOT_TURBO_ROTATION === '1' ? 5 * 60 * 1000 : 30 * 60 * 1000;
    return Math.max(60_000, _numEnv('BOT_MIN_UPTIME_MS', fallback));
}

function getPrimaryBotNumber() {
    return cleanBotNum(
        process.env.PRIMARY_BOT_NUMBER
        || process.env.BOT_PRIMARY_NUMBER
        || ''
    );
}

/** Only time-share bots when there are more linked numbers than RAM allows live at once. */
function _shouldUseRotation(myBots, runningNow) {
    if (process.env.BOT_ROTATION_ENABLED === '0') return false;
    const maxConcurrent = getMaxConcurrentBots();
    if (!myBots || myBots.size <= maxConcurrent) return false;
    return runningNow >= maxConcurrent;
}

/**
 * On a single Eco dyno, one stable command bot is more useful than rotating
 * several linked accounts. If an older/non-primary thread survived a restart,
 * reclaim its slot before the normal sleeping-bot queue is evaluated.
 */
async function _ensurePrimaryBotActive(myBots) {
    const primary = getPrimaryBotNumber();
    if (!primary || !myBots?.has(primary)) return false;
    if (threads.has(primary) || global._pairingInFlight?.has(primary)) return true;

    const current = [...threads.entries()].find(([clean, entry]) =>
        myBots.has(clean) && !entry?.pairing && !global._pairingInFlight?.has(clean)
    );
    if (current) {
        console.log(chalk.cyan(
            `[Supervisor] ⭐ Promoting primary +${primary} — replacing active +${current[0]}`
        ));
        killBot(current[0], 'SIGTERM');
        await new Promise((resolve) => setTimeout(resolve, getRotationSwapMs()));
    }

    if (_isBotPaused(primary)) {
        console.log(chalk.yellow(
            `[Supervisor] ⚠️ Primary +${primary} is paused — keeping current queue unchanged`
        ));
        return false;
    }

    const ready = await _ensureBotSessionReady(primary);
    if (!ready) return false;
    return Boolean(spawnBot(primary));
}

const THREAD_RESTART_DELAY  = 5_000;
const MAX_RESTARTS_PER_HOUR = 12;
const BOT_RUNNER_SCRIPT     = path.join(__dirname, 'bot-runner.js');

// ── Shared memory (zero-copy metrics from all threads) ───────────────────────
const sharedBuffer = createSharedBuffer();

function getLocalPairingState(number) {
    const clean = cleanBotNum(number);
    if (!clean) return { code: null, connected: false };
    const base = path.join(__dirname, '..', 'nexstore', 'pairing');
    const codeFile = path.join(base, `pairing_${clean}.json`);
    const connectedFile = path.join(base, clean, 'connected.flag');
    let code = null;
    try {
        const saved = JSON.parse(fs.readFileSync(codeFile, 'utf8'));
        if (cleanBotNum(saved.number) === clean) code = saved.code || null;
    } catch (_) {}
    return { code, connected: fs.existsSync(connectedFile) };
}

// ── State ─────────────────────────────────────────────────────────────────────
/** @type {Map<string, { thread: Worker, slotIndex: number, pairing: boolean, spawnedAt: number, restartTimes: number[] }>} */
const threads     = new Map();
const lastActivity = new Map();
// Persistent restart-time log — survives thread object replacement so the
// MAX_RESTARTS_PER_HOUR circuit-breaker actually works (wasEntry.restartTimes
// resets to [] on every new _spawnThread call, making the old check useless).
const _restartHistory = new Map(); // clean → number[]

let _slotCounter = 0;
let _active      = false;
let _syncTimer   = null;
let _lastRotationAt = Date.now();

// ── Crash-loop protection ─────────────────────────────────────────────────────
// Tracks bots that should NOT be spawned right now:
//   _noSessionBots  — exited code=0 (no session / stopped). Pause 30 min.
//   _restartLimitBots — hit MAX_RESTARTS_PER_HOUR. Pause 30 min then retry.
const _noSessionBots    = new Map(); // clean → timestamp of last clean exit
const _restartLimitBots = new Map(); // clean → timestamp when limit was hit
const _unhealthyStreak  = new Map(); // clean → consecutive unhealthy sync-tick count (debounce before recovery)
const _lastUnhealthyRecovery = new Map(); // clean → timestamp of latest confirmed recovery
const _intentionalStops = new Set(); // clean → worker termination requested by supervisor
const _recoveryInFlight = new Map(); // clean → supervisor-owned recovery promise
const _restartJitterMs  = new Map(); // clean → random 0-30min jitter so scheduled memory restarts never bunch up
let _syncInFlight = false;
let _syncQueued = false;
const NO_SESSION_PAUSE_MS    = 30 * 60 * 1000; // 30 minutes
const RESTART_LIMIT_PAUSE_MS = 30 * 60 * 1000; // 30 minutes

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
    // A child can take a few seconds to boot and write its first heartbeat,
    // but ten minutes is long enough to leave a dead socket invisible.
    const gracePeriod = 2 * 60 * 1000;
    if (Date.now() - (entry.spawnedAt || 0) < gracePeriod) return true;

    try {
        const { getBotHeartbeatAgeMs, readBotHeartbeat } = require('../allfunc/bot-heartbeat');
        const hb = readBotHeartbeat(clean);
        // A fresh heartbeat with wsState=0/-1 means the process is alive but
        // the WhatsApp socket is not. Treat only an open WS as healthy.
        if (hb?.wsState === 1 && getBotHeartbeatAgeMs(clean) <= 2 * 60 * 1000) return true;
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

function _activeThreadCount() {
    return [...threads.values()].filter((entry) => entry?.thread).length;
}

// ── Thread management ─────────────────────────────────────────────────────────
function _onThreadMessage(clean, msg) {
    if (!msg?.type) return;
    switch (msg.type) {
        case 'heartbeat':
        case 'spawned':
            lastActivity.set(clean, Date.now());
            // If bot is back up after being paused, clear pause flags
            _noSessionBots.delete(clean);
            _updateActiveBotCount();
            break;
        case 'exit':
            console.log(chalk.gray(
                `[Supervisor] Bot +${clean} child exited (code=${msg.code}, restarts=${msg.restarts})`
            ));
            _updateActiveBotCount();
            break;
        case 'cleanExit':
            // ✅ FIX: code=0 exit = no session or manually stopped
            // Mark as "no session" so syncBots step 5 skips respawning for 30 min
            console.log(chalk.yellow(`[Supervisor] +${clean} clean exit (no session/stopped) — pausing spawn for 30min`));
            _noSessionBots.set(clean, Date.now());
            _updateActiveBotCount();
            break;
        case 'restartLimitReached':
            // ✅ FIX: Bot hit crash-restart limit. Pause spawning to prevent OOM loops.
            console.log(chalk.red(`[Supervisor] +${clean} hit restart limit (${msg.recent}/hr) — pausing 30min`));
            _restartLimitBots.set(clean, Date.now());
            _updateActiveBotCount();
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

/** Check if a bot is currently in a crash-loop pause. Returns reason string or null. */
function _isBotPaused(clean) {
    const now = Date.now();
    // Check no-session pause — BUT clear if session now exists (user re-paired)
    if (_noSessionBots.has(clean)) {
        if (now - _noSessionBots.get(clean) < NO_SESSION_PAUSE_MS) {
            if (!_hasRegisteredCreds(clean)) return 'no-session';
            // Session appeared (re-paired) — clear pause
            _noSessionBots.delete(clean);
        } else {
            _noSessionBots.delete(clean); // Pause expired, try again
        }
    }
    // Check restart-limit pause
    if (_restartLimitBots.has(clean)) {
        if (now - _restartLimitBots.get(clean) < RESTART_LIMIT_PAUSE_MS) {
            return 'restart-limit';
        }
        _restartLimitBots.delete(clean); // Pause expired, try again
    }
    return null;
}

function _spawnThread(clean, opts = {}) {
    if (!clean) return null;
    if (threads.has(clean) && !opts.force) return threads.get(clean).thread;
    const maxConcurrent = getMaxConcurrentBots();
    const activeThreads = _activeThreadCount();
    if (activeThreads >= maxConcurrent) {
        console.log(chalk.gray(
            `[Supervisor] ⏸ Spawn blocked at hard cap (${activeThreads}/${maxConcurrent}) — +${clean} queued`
        ));
        return null;
    }

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

        // killBot() marks intentional shutdowns so terminating a stale worker
        // cannot trigger the old thread's delayed hidden respawn.
        const intentionallyStopped = _intentionalStops.delete(clean);
        if (opts.noRestart || wasEntry?.noRestart || intentionallyStopped || !_active) return;
        if (code === 0) return;

        // Track restart times in a persistent Map so the circuit-breaker works
        // across successive _spawnThread calls (wasEntry.restartTimes always
        // resets to [] on each new spawn, so the old check was always 0).
        const now = Date.now();
        const hourAgo = now - 60 * 60 * 1000;
        const history = (_restartHistory.get(clean) || [])
        .filter(t => t > Date.now() - 3600_000); // prune entries older than 1h (memory leak fix)
    history.push(now);
        const recentRestarts = history.filter((t) => t > hourAgo);
        _restartHistory.set(clean, recentRestarts); // prune entries older than 1h
        if (recentRestarts.length >= MAX_RESTARTS_PER_HOUR) {
            console.log(chalk.red(`[Supervisor] +${clean} thread restart limit (${recentRestarts.length}/${MAX_RESTARTS_PER_HOUR}/hr) — pausing`));
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
    entry.noRestart = true;
    _intentionalStops.add(clean);
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

/**
 * Pairing needs a real WhatsApp socket, even when the dyno is already at its
 * normal bot cap. Reserve one supervisor slot for the pairing child by
 * intentionally stopping the least-recently-active normal bot first.
 *
 * This is deliberately supervisor-owned rather than a second ad-hoc socket:
 * killBot() marks the old thread intentional, clears its slot, and prevents a
 * delayed crash handler from respawning it while the pairing handshake runs.
 */
async function preparePairingSlot(botNum, waitMs = 15_000) {
    const clean = cleanBotNum(botNum);
    if (!clean) return false;

    const deadline = Date.now() + waitMs;
    const maxConcurrent = getMaxConcurrentBots();

    while (Date.now() < deadline) {
        const activeEntries = [...threads.entries()]
            .filter(([number, entry]) => number !== clean && entry?.thread);
        const normalEntries = activeEntries
            .filter(([, entry]) => !entry?.pairing && !entry?.noRestart)
            .sort(([a], [b]) => (lastActivity.get(a) || 0) - (lastActivity.get(b) || 0));

        // _spawnThread counts pairing entries too, so wait until the previous
        // pairing child has actually left before trying to claim its slot.
        if (threads.size < maxConcurrent && !activeEntries.some(([, entry]) => entry?.pairing)) {
            return true;
        }

        const victim = normalEntries.find(([number]) =>
            !global._pairingInFlight?.has(number)
        );
        if (victim) {
            const [victimNumber] = victim;
            console.log(chalk.yellow(
                `[Supervisor] 🔗 Reserving slot for pairing +${clean} — rotating out +${victimNumber}`
            ));
            killBot(victimNumber, 'SIGTERM');
            // Give Baileys time to close its WebSocket before the new
            // registration socket is created; otherwise WhatsApp can return
            // stream conflict 440 even though the old thread was terminated.
            await new Promise((resolve) => setTimeout(resolve, 1_500));
            continue;
        }

        await new Promise((resolve) => setTimeout(resolve, 500));
    }

    console.log(chalk.yellow(
        `[Supervisor] ⏸ Pairing slot unavailable for +${clean} after ${waitMs}ms`
    ));
    return false;
}

/**
 * Single supervisor owner for replacing a dead or conflicted bot worker.
 * The health sync, auto-reconnect sweep, and reconnect endpoint all use this
 * path so they cannot kill/spawn the same number concurrently.
 */
function recoverBotExternal(botNum, reason = 'auto-reconnect') {
    const clean = cleanBotNum(botNum);
    if (!clean || !_active) return Promise.resolve(false);

    const existing = _recoveryInFlight.get(clean);
    if (existing) return existing;

    let recovery;
    recovery = (async () => {
        try {
            _clearNoSessionBot(clean);
            const stopped = killBot(clean, 'SIGTERM');
            if (stopped) await new Promise((resolve) => setTimeout(resolve, 1500));

            const ready = await _ensureBotSessionReady(clean);
            if (!ready) {
                console.log(chalk.yellow(`[Supervisor] ⏸ Recovery deferred for +${clean} (${reason}) — no valid session`));
                return false;
            }

            const thread = spawnBot(clean);
            if (!thread) {
                console.log(chalk.yellow(`[Supervisor] ⏸ Recovery deferred for +${clean} (${reason}) — concurrent-bot cap`));
                return false;
            }

            console.log(chalk.green(`[Supervisor] 🔁 Recovery started for +${clean} (${reason})`));
            return true;
        } finally {
            if (_recoveryInFlight.get(clean) === recovery) {
                _recoveryInFlight.delete(clean);
            }
        }
    })();

    _recoveryInFlight.set(clean, recovery);
    return recovery;
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
        const turbo = process.env.BOT_TURBO_ROTATION === '1';
        const rotateNote = linkedSet.size > maxConcurrent
            ? `turbo LRU ON (${linkedSet.size} linked > ${maxConcurrent} slots)`
            : `all ${linkedSet.size} bot(s) run 24/7 — turbo idle (no swap needed)`;
        console.log(chalk.cyan(
            `[Supervisor] Managing ${linkedSet.size} bot(s) | max ${maxConcurrent} concurrent | ${rotateNote} | ${getMemSummary()}`
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

    // 2. Restart unhealthy threads — debounced, staggered, and rate-limited.
    // A single stale heartbeat read is often just a slow-network moment, not a
    // dead socket, so we require 2 consecutive unhealthy sync ticks (~16s+)
    // before acting, and try a light wake first. Each bot is isolated in its
    // own worker_thread, so healing/restarting one never touches the others,
    // and we cap full restarts to 1 per sync tick so a network blip that makes
    // several bots look stale at once can never mass-restart the fleet.
    const { canFullyRestartBot, recordBotRestart } = require('../allfunc/bot-lifecycle');
    let unhealthyRestarts = 0;
    for (const [clean, entry] of [...threads]) {
        if (entry?.pairing) continue;
        if (global._pairingInFlight?.has(clean)) continue;
        if (_recoveryInFlight.has(clean)) continue;
        if (!myBots.has(clean)) continue;

        if (_isThreadHealthy(clean, entry)) {
            _unhealthyStreak.delete(clean);
            continue;
        }

        const streak = (_unhealthyStreak.get(clean) || 0) + 1;
        _unhealthyStreak.set(clean, streak);
        if (streak < 2) {
            console.log(chalk.yellow(`[Supervisor] ⚠️ +${clean} looks unstable — light wake attempt (streak ${streak}, no restart yet)`));
            // child self-heals its own idle/stale socket via startBotChildKeepAlive() sweep — just wait
            continue;
        }

        // ✅ FIX: Don't restart a paused bot — it would just re-enter the crash loop
        const pauseReason = _isBotPaused(clean);
        if (pauseReason) {
            console.log(chalk.gray(`[Supervisor] ⏸ +${clean} unhealthy but paused (${pauseReason}) — skipping restart`));
            killBot(clean, 'SIGTERM'); // Clean up dead thread, but don't respawn
            _unhealthyStreak.delete(clean);
            continue;
        }

        // Reconnect recovery is separate from the scheduled memory-restart
        // guard. A dead socket must not wait 2.5h after an earlier restart.
        const lastRecovery = _lastUnhealthyRecovery.get(clean) || 0;
        if (Date.now() - lastRecovery < 60_000) {
            console.log(chalk.gray(`[Supervisor] ⏳ +${clean} recovery recently attempted — waiting before another restart`));
            continue;
        }

        if (unhealthyRestarts >= 1) {
            console.log(chalk.gray(`[Supervisor] ⏭ +${clean} unhealthy too, but deferring restart to next sync (max 1/tick)`));
            continue;
        }
        unhealthyRestarts += 1;

        console.log(chalk.red(`[Supervisor] 💀 +${clean} confirmed unhealthy — restarting thread (isolated; other bots unaffected)`));
        _lastUnhealthyRecovery.set(clean, Date.now());
        recordBotRestart(clean);
        _unhealthyStreak.delete(clean);
        await recoverBotExternal(clean, 'unhealthy-sync');
    }

    // 3. Scheduled memory restart — staggered + configurable-interval guarded so bots spawned
    // around the same time (e.g. dyno boot) never all cross maxAgeMs and get
    // killed in the same sync tick. Each bot gets a random 0-30min jitter added
    // to its threshold, and only 1 bot per sync tick actually gets restarted.
    let maxAgeMs = 0;
    try {
        const { getBotRestartHours } = require('../keepalive');
        const hrs = getBotRestartHours();
        if (hrs > 0) maxAgeMs = hrs * 60 * 60 * 1000;
    } catch (_) {}
    if (maxAgeMs > 0) {
        const { canFullyRestartBot: canFullyRestart3, recordBotRestart: recordRestart3 } = require('../allfunc/bot-lifecycle');
        let memRestarts = 0;
        for (const [clean, entry] of [...threads]) {
            if (entry?.pairing) continue;
            if (!myBots.has(clean)) continue;
            if (!entry.spawnedAt) continue;

            if (!_restartJitterMs.has(clean)) {
                _restartJitterMs.set(clean, Math.floor(Math.random() * 30 * 60 * 1000));
            }
            const jitter = _restartJitterMs.get(clean);
            if (Date.now() - entry.spawnedAt < maxAgeMs + jitter) continue;

            // Respect the configured full-restart interval so a bot is not
            // restarted more often than BOT_RESTART_HOURS allows.
            if (!canFullyRestart3(clean)) continue;

            if (memRestarts >= 1) break; // max 1 scheduled memory restart per sync tick
            memRestarts += 1;

            console.log(chalk.cyan(`[Supervisor] 🔄 +${clean} memory restart (${Math.round((Date.now()-entry.spawnedAt)/3600000)}h uptime) — isolated, other bots unaffected`));
            recordRestart3(clean);
            _restartJitterMs.delete(clean);
            killBot(clean, 'SIGTERM');
            const ready = await _ensureBotSessionReady(clean);
            if (ready) spawnBot(clean);
        }
    }

    // Keep the configured command/self-chat account in the sole live slot.
    // This is intentionally before the regular queue so a restart cannot
    // leave a different linked number active indefinitely.
    if (process.env.BOT_ROTATION_ENABLED === '0') {
        await _ensurePrimaryBotActive(myBots);
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
        .filter((c) => {
            if (threads.has(c)) return false;
            if (global._pairingInFlight?.has(c)) return false;
            // ✅ FIX: Skip paused bots (no-session loop or restart-limit loop)
            // This prevents the infinite spawn→exit(0)→spawn cycle that caused R14 OOM
            const pauseReason = _isBotPaused(c);
            if (pauseReason) {
                // Only log occasionally (not every 8s sync) to avoid log spam
                if (!_isBotPaused._loggedAt) _isBotPaused._loggedAt = {};
                const lastLog = _isBotPaused._loggedAt[c] || 0;
                if (Date.now() - lastLog > 5 * 60 * 1000) {
                    console.log(chalk.gray(`[Supervisor] ⏸ +${c} sleeping but paused (${pauseReason}) — skipping spawn`));
                    _isBotPaused._loggedAt[c] = Date.now();
                }
                return false;
            }
            return true;
        })
        .sort((a, b) => {
            const primary = getPrimaryBotNumber();
            if (primary) {
                if (a === primary && b !== primary) return -1;
                if (b === primary && a !== primary) return 1;
            }
            return (lastActivity.get(a) || 0) - (lastActivity.get(b) || 0);
        });

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

    // User requested a fresh code — supersede any in-flight pairing child.
    if (global._pairingInFlight.has(num)) {
        console.log(chalk.yellow(`[Supervisor] Superseding in-flight pairing for +${num}`));
        killBot(num, 'SIGKILL');
        global._pairingInFlight.delete(num);
        await new Promise((r) => setTimeout(r, 800));
    }
    global._pairingInFlight.add(num);

    console.log(chalk.cyan(`[Supervisor] 🔗 Pairing +${num} — spawning isolated thread`));

    try {
        const { removeFromStoppedBots } = require('../allfunc/stopped-bots');
        removeFromStoppedBots(num);
        killBot(num, 'SIGKILL');

        // The route/queue claim already reset this attempt to `requested` and
        // atomically claimed it as `in_progress`. Do not reset it here:
        // the web-owned pairing processor polls every 150ms, so changing it
        // back to `requested` makes the same request get claimed again and
        // kills the live socket before it can generate a code.
        //
        // Do not clear the pairing record here. It contains the owner and bot
        // name that session-db uses when connection.open saves linked_numbers.
        // Clearing it before the phone accepts the code loses that ownership
        // and leaves the phone spinning at "Logging in...".

        // pair.js writes auth to nexstore/pairing/<digits>; some legacy paths
        // also created <digits>@s.whatsapp.net. Wipe both so the new pairing
        // request doesn't reuse stale creds.
        const sessionPathAlt = path.join(__dirname, '..', 'nexstore', 'pairing', `${num}@s.whatsapp.net`);
        const sessionPath    = path.join(__dirname, '..', 'nexstore', 'pairing', num);
        if (fs.existsSync(sessionPathAlt)) _deleteFolderRecursive(sessionPathAlt);
        if (fs.existsSync(sessionPath))    _deleteFolderRecursive(sessionPath);

        try { const { deleteSessionCreds } = require('../session-db'); await deleteSessionCreds(num); } catch (_) {}
        try {
            // Remove both the legacy shared handoff and the current
            // per-number handoff. The API prefers the local per-number file,
            // so leaving it behind could expose the previous attempt's code
            // even after the Mongo pairing state was reset.
            const pairingDir = path.join(__dirname, '..', 'nexstore', 'pairing');
            for (const pjson of [
                path.join(pairingDir, 'pairing.json'),
                path.join(pairingDir, `pairing_${num}.json`),
            ]) {
                if (fs.existsSync(pjson)) fs.unlinkSync(pjson);
            }
        } catch (_) {}
        try { const { removeConnectedFlag } = require('../allfunc/connected-flag'); removeConnectedFlag(num); } catch (_) {}

        ensureBotWorkspace(num);
        const slotReady = await preparePairingSlot(num);
        if (!slotReady) {
            console.log(chalk.red(`[Supervisor] Pairing aborted for +${num}: no worker slot available`));
            await require('../server/db-service').markPairingFailed(num).catch(() => {});
            return;
        }

        const pairingThread = spawnBot(num, { pairing: true, force: true, noRestart: true });
        if (!pairingThread) {
            console.log(chalk.red(`[Supervisor] Pairing aborted for +${num}: pairing thread did not start`));
            await require('../server/db-service').markPairingFailed(num).catch(() => {});
            return;
        }

        const { getPairingState, markPairingFailed } = require('../server/db-service');
        const deadline = Date.now() + 120_000;
        let gotCode = false;
        while (Date.now() < deadline) {
            const st = await getPairingState(num).catch(() => null);
            const local = getLocalPairingState(num);
            if (st?.code || local.code) { gotCode = true; break; }
            await new Promise((r) => setTimeout(r, 200));
        }
        if (!gotCode) {
            console.log(chalk.red(`[Supervisor] Pairing timeout for +${num}`));
            await require('../server/db-service').markPairingFailed(num).catch(() => {});
            killBot(num, 'SIGTERM');
        } else {
            console.log(chalk.green(`[Supervisor] ✅ Pairing code ready for +${num}`));

            // Code generation is only phase one. Keep the pairing socket alive
            // while the user enters the code on the phone. Promoting/killing
            // the child immediately after code_ready interrupts the WhatsApp
            // login handshake and leaves the phone on "Logging in...".
            const connectDeadline = Date.now() + 180_000;
            let connected = false;
            while (Date.now() < connectDeadline) {
                const state = await getPairingState(num).catch(() => null);
                const local = getLocalPairingState(num);
                if (state?.status === 'active' || local.connected) {
                    connected = true;
                    break;
                }
                await new Promise((resolve) => setTimeout(resolve, 1_000));
            }

            if (!connected) {
                console.log(chalk.red(`[Supervisor] Pairing login timeout for +${num} — phone did not reach connection.open`));
                await require('../server/db-service').markPairingFailed(num).catch(() => {});
                killBot(num, 'SIGTERM');
                return;
            }

            // Give creds.update/session backup and linked_numbers ownership
            // time to finish before handing the socket to normal bot mode.
            await new Promise((resolve) => setTimeout(resolve, 10_000));
            console.log(chalk.green(`[Supervisor] ✅ Phone login confirmed for +${num}; promoting after session flush`));
            promotePairingToNormal(num);
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

/**
 * Boot reconnect diagnostic — runs ~30s after supervisor start. Prints a
 * per-number breakdown so the operator can immediately see why any linked
 * number failed to auto-reconnect after restart:
 *
 *   linked  ✓  status=active in linked_numbers
 *   creds   ✓  session files present in DB or local disk
 *   stopped ✗  in stopped_bots.json (manually disconnected)
 *   thread  ✓  supervisor thread spawned
 *   running ✓  bot-runner reports a healthy WhatsApp socket
 *
 * If a number lacks creds in DB + disk, the user MUST re-pair once via the
 * website — then the new flushFns + periodic backup will keep DB current.
 */
async function bootReconnectReport() {
    try {
        const { getActiveLinkedNumbers, hasSessionInDb } = require('../session-db');
        const { readStopped }  = require('../allfunc/stopped-bots');
        const { isBotHeartbeatFresh } = require('../allfunc/bot-heartbeat');

        const linked  = (await getActiveLinkedNumbers().catch(() => []))
            .map((n) => cleanBotNum(n)).filter(Boolean);
        const stopped = new Set(readStopped());

        if (!linked.length) {
            console.log(chalk.gray('[Supervisor] 📋 Boot report: no linked numbers in DB (paired numbers ka koi record nahi)'));
            return;
        }

        console.log(chalk.cyan(`\n[Supervisor] 📋 Boot reconnect report (${linked.length} linked number${linked.length === 1 ? '' : 's'}):`));

        let okCount = 0;
        let needPairCount = 0;
        for (const clean of linked) {
            const isStopped  = stopped.has(clean);
            const credsLocal = _hasRegisteredCreds(clean);
            const credsDb    = await hasSessionInDb(clean).catch(() => false);
            const entry      = threads.get(clean);
            const threadUp   = Boolean(entry && !entry.pairing);
            const heartbeat  = isBotHeartbeatFresh(clean, 5 * 60 * 1000);
            const running    = threadUp && heartbeat;

            const tag = running ? chalk.green('✅ ONLINE')
                : threadUp     ? chalk.yellow('⏳ CONNECTING')
                : isStopped    ? chalk.gray('⏸ STOPPED (manual)')
                : (credsLocal || credsDb) ? chalk.yellow('🔄 PENDING')
                : chalk.red('❌ NEED RE-PAIR');

            const credsStr = credsLocal ? 'disk' : credsDb ? 'DB' : 'NONE';
            console.log(chalk.gray(`   +${clean}  ${tag}  creds=${credsStr}  thread=${threadUp ? 'up' : 'down'}`));

            if (running || threadUp) okCount++;
            if (!credsLocal && !credsDb && !isStopped) needPairCount++;
        }

        if (needPairCount > 0) {
            console.log(chalk.red(`[Supervisor] ⚠️  ${needPairCount} number(s) have NO session in DB or disk — pair once via website to enable auto-reconnect`));
        }
        console.log(chalk.cyan(`[Supervisor] 📊 Auto-reconnect: ${okCount}/${linked.length} bot(s) online or connecting\n`));
    } catch (e) {
        console.log(chalk.yellow(`[Supervisor] bootReconnectReport error: ${e.message}`));
    }
}

async function _waitForDbReady(maxWaitMs = 60000) {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
        try {
            const { initDb, isDbReady } = require('../server/db');
            await initDb();
            if (isDbReady()) return true;
        } catch (_) {}
        await new Promise((r) => setTimeout(r, 1500));
    }
    return false;
}

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

    const runSync = async () => {
        if (_syncInFlight) {
            _syncQueued = true;
            return;
        }
        _syncInFlight = true;
        try {
            await syncBots();
        } catch (e) {
            console.log(chalk.yellow(`[Supervisor] syncBots error: ${e.message}`));
        } finally {
            _syncInFlight = false;
            if (_syncQueued) {
                _syncQueued = false;
                setImmediate(runSync);
            }
        }
    };

    const syncMs = getSyncIntervalMs();

    // ── Wait for DB ready before the first syncBots ──────────────────────
    // syncBots() reads getActiveLinkedNumbers() — if the DB is still
    // initializing on cold start it returns [] and no bots are spawned.
    // Subsequent retries are scheduled below; this just speeds up the FIRST
    // pass which is what users see in the boot log.
    (async () => {
        const ok = await _waitForDbReady(45_000);
        if (!ok) {
            console.log(chalk.yellow('[Supervisor] ⚠️  DB not ready after 45s — first syncBots may return 0 numbers (will retry)'));
        }
        runSync();
    })();

    [2000, 5000, 10_000, 20_000].forEach((ms) => setTimeout(runSync, ms));
    _syncTimer = setInterval(runSync, syncMs);

    // One-shot diagnostic ~30s after start so the operator can see exactly
    // which linked numbers reconnected and which need re-pairing.
    setTimeout(() => bootReconnectReport().catch(() => {}), 30_000);

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

/**
 * Return the actual runtime health for a bot. The auto-reconnect sweep must
 * use this instead of treating a surviving worker_thread as an online bot.
 */
function getBotRuntimeStatus(botNum) {
    const clean = cleanBotNum(botNum);
    const entry = threads.get(clean);
    if (!entry?.thread) return { thread: false, healthy: false };

    let heartbeat = null;
    try {
        heartbeat = require('../allfunc/bot-heartbeat').readBotHeartbeat(clean);
    } catch (_) {}

    const heartbeatAge = heartbeat?.ts ? Date.now() - Number(heartbeat.ts) : Infinity;
    const childRunning = wrapSlot(sharedBuffer, entry.slotIndex).isRunning();
    const withinStartupGrace = Date.now() - (entry.spawnedAt || 0) < 2 * 60 * 1000;
    const healthy = !entry.pairing && childRunning && (
        withinStartupGrace ||
        (heartbeat?.wsState === 1 && heartbeatAge <= 2 * 60 * 1000)
    );

    return {
        thread: true,
        childRunning,
        heartbeatFresh: heartbeatAge <= 2 * 60 * 1000,
        withinStartupGrace,
        wsState: heartbeat?.wsState ?? -1,
        ready: heartbeat?.ready === true,
        healthy,
    };
}

/**
 * Graceful shutdown — sends 'shutdown' message to each worker_thread so it can
 * SIGTERM its bot-runner child and let it flush session creds to DB before
 * exit. Used by worker.js on SIGTERM (Heroku dyno restart, scheduled
 * BOT_RESTART_HOURS exit). Without this the children are SIGKILL'd by
 * thread.terminate() with no chance to backupSessionFolder() — sessions are
 * lost on ephemeral disk wipe and users must re-pair.
 *
 * @param {number} timeoutMs - hard deadline before forcing terminate
 */
async function stopSupervisorGraceful(timeoutMs = 9000) {
    _active = false;
    if (_syncTimer) clearInterval(_syncTimer);

    const entries = [...threads.entries()];
    if (!entries.length) return;

    console.log(chalk.yellow(`[Supervisor] Graceful shutdown — flushing ${entries.length} bot session(s) to DB (${timeoutMs}ms max)...`));

    const exitPromises = entries.map(([clean, entry]) => new Promise((resolve) => {
        try {
            entry.thread.once('exit', resolve);
            entry.thread.postMessage({ cmd: 'shutdown' });
        } catch (_) { resolve(); }
    }));

    await Promise.race([
        Promise.all(exitPromises),
        new Promise((r) => setTimeout(r, timeoutMs)),
    ]);

    for (const [clean, entry] of threads) {
        try { entry.thread.terminate(); } catch (_) {}
        wrapSlot(sharedBuffer, entry.slotIndex).clear();
    }
    threads.clear();
    console.log(chalk.green('[Supervisor] ✅ All threads exited.'));
}

/**
 * Clear a bot from the _noSessionBots / _restartLimitBots pause maps
 * so the next syncBots() cycle will attempt to spawn it again.
 * Used by the auto-reconnect sweep to override the 30-min hold.
 */
function _clearNoSessionBot(clean) {
    const c = cleanBotNum(clean);
    if (c) {
        _noSessionBots.delete(c);
        _restartLimitBots.delete(c);
    }
}

module.exports = {
    startSupervisor,
    stopSupervisor,
    stopSupervisorGraceful,
    isSupervisorActive,
    syncBots,
    spawnBot,
    killBot,
    stopBotExternal,
    recoverBotExternal,
    handlePairingRequest,
    markBotPromoted,
    promotePairingToNormal,
    bootReconnectReport,
    _clearNoSessionBot,
    getBotRuntimeStatus,
    getSharedBuffer  : () => sharedBuffer,
    getActiveBotCount: () => getActiveBotCount(sharedBuffer),
};
