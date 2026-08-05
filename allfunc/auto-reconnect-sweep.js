'use strict';

/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  AUTO-RECONNECT SWEEP                                            ║
 * ╠══════════════════════════════════════════════════════════════════╣
 * ║  Runs every AUTO_RECONNECT_INTERVAL_MS (default 5 min).         ║
 * ║  For every linked bot that:                                      ║
 * ║    1. Is NOT in stopped_bots (user manually disconnected)        ║
 * ║    2. Has a valid session saved in DB                            ║
 * ║    3. Has been offline for longer than BOT_OFFLINE_GRACE_MS      ║
 * ║  → triggers reconnection automatically without any user action.  ║
 * ║                                                                  ║
 * ║  Works in both modes:                                            ║
 * ║    • Supervisor (isolated) — calls spawnBot() via supervisor     ║
 * ║    • Flat mode (BOT_ISOLATION=0) — calls queuePairing() in pair  ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

const chalk = require('chalk');

// ── Tuning constants (all overridable via env) ───────────────────────────────

/** How often to run the sweep (ms). Default: 1 minute. */
const SWEEP_INTERVAL_MS = Number(process.env.AUTO_RECONNECT_INTERVAL_MS) || 60 * 1000;

/**
 * A bot must be continuously offline for at least this long before
 * the sweep reconnects it. Prevents fighting with a bot that is
 * mid-connect (e.g. still syncing history after a restart).
 * Default: 45 seconds.
 */
const BOT_OFFLINE_GRACE_MS = Number(process.env.AUTO_RECONNECT_GRACE_MS) || 45 * 1000;

/**
 * After triggering a reconnect for a bot, don't try again for this
 * long even if it still appears offline (give it time to come up).
 * Default: 2 minutes.
 */
const RECONNECT_COOLDOWN_MS = Number(process.env.AUTO_RECONNECT_COOLDOWN_MS) || 2 * 60 * 1000;

// ── Internal state ───────────────────────────────────────────────────────────

/** clean → timestamp of last reconnect attempt for this sweep */
const _lastReconnectAttempt = new Map();

let _sweepTimer = null;
let _sweepRunning = false;
let _started = false;

// ── Helpers ──────────────────────────────────────────────────────────────────

function cleanNum(n) {
    return String(n || '').replace(/[^0-9]/g, '');
}

/** Returns true if the DB lastActive for this bot is within maxAgeMs. */
function _isSessionFresh(sess, maxAgeMs) {
    if (!sess?.lastActive) return false;
    return (Date.now() - new Date(sess.lastActive).getTime()) <= maxAgeMs;
}

/**
 * Returns true if the bot is currently live.
 * In isolated mode, the supervisor heartbeat/WS state is authoritative.
 * A connected.flag can survive an abrupt process crash, so it is only used
 * as a fallback in flat mode where no supervisor runtime exists.
 */
function _isBotOnline(clean, sess) {
    // ── 1. Supervisor runtime health — thread existence alone is not live ─
    try {
        const sup = require('../worker/supervisor');
        if (sup.isSupervisorActive && sup.isSupervisorActive() &&
            typeof sup.getBotRuntimeStatus === 'function') {
            const runtime = sup.getBotRuntimeStatus(clean);
            if (runtime?.healthy) return true;
            // Supervisor is authoritative while it is running. Do not fall
            // through to stale CONNECTED/lastActive values from the DB.
            return false;
        }
    } catch (_) {}

    // ── 2. Flat-mode filesystem marker ────────────────────────────────────
    try {
        const { isConnected } = require('../allfunc/connected-flag');
        if (isConnected(clean)) return true;
    } catch (_) {}

    // ── 3. DB session fallback ────────────────────────────────────────────
    const BOT_ONLINE_MAX_AGE_MS = 15 * 60 * 1000;
    if (!sess) return false;
    const fresh = _isSessionFresh(sess, BOT_ONLINE_MAX_AGE_MS);
    if (sess.connectionStatus === 'CONNECTED' && fresh) return true;
    if (sess.wsState === 1 && fresh) return true;
    if (sess.commandReady === true && fresh) return true;
    return false;
}

/** Returns true if the bot has been offline long enough to attempt reconnect. */
function _isOfflineLongEnough(sess) {
    if (!sess?.lastActive) return true; // never connected — try now
    const offlineMs = Date.now() - new Date(sess.lastActive).getTime();
    // Boot-time override: reduce grace period so reconnects start sooner after restart
    const graceMs = global.__BOOT_RECONNECT_GRACE || BOT_OFFLINE_GRACE_MS;
    return offlineMs >= graceMs;
}

/** Returns true if we recently triggered a reconnect for this bot. */
function _isCoolingDown(clean) {
    const last = _lastReconnectAttempt.get(clean) || 0;
    const cooldownMs = global.__BOOT_RECONNECT_COOLDOWN || RECONNECT_COOLDOWN_MS;
    return (Date.now() - last) < cooldownMs;
}

/**
 * Attempt to reconnect a single bot.
 * Returns 'spawned' | 'queued' | 'deferred' | 'skipped' | 'error'.
 */
async function _reconnectOne(clean) {
    const jid = `${clean}@s.whatsapp.net`;

    // ── Restore session from DB to filesystem before connect ──────────────
    try {
        const { ensureSessionRestored } = require('../session-db');
        const ok = await ensureSessionRestored(clean);
        if (!ok) {
            console.log(chalk.yellow(`[AutoReconnect] ⚠️  +${clean} — no valid DB session, skipping (re-pair required)`));
            return 'skipped';
        }
    } catch (e) {
        console.log(chalk.yellow(`[AutoReconnect] ⚠️  +${clean} — session restore error: ${e.message}`));
        return 'error';
    }

    // ── Remove from stopped_bots so connect isn't blocked ─────────────────
    try {
        const { removeFromStoppedBots } = require('./stopped-bots');
        removeFromStoppedBots(clean);
    } catch (_) {}

    // ── FINAL live-check before touching anything ─────────────────────────
    // The runtime may have become healthy after the candidate list was built.
    // In supervisor mode, do not let a stale connected.flag hide that fact.
    try {
        const sup = require('../worker/supervisor');
        if (sup.isSupervisorActive?.() && sup.getBotRuntimeStatus) {
            if (sup.getBotRuntimeStatus(clean)?.healthy) {
                console.log(chalk.gray(`[AutoReconnect] ℹ️  +${clean} supervisor reports healthy — already online, skipping`));
                return 'skipped';
            }
        } else {
            const { isConnected } = require('../allfunc/connected-flag');
            if (isConnected(clean)) {
                console.log(chalk.gray(`[AutoReconnect] ℹ️  +${clean} connected.flag exists — already online, skipping`));
                return 'skipped';
            }
        }
    } catch (_) {}

    // ── Mark the socket as reconnecting only after the final live-check ────
    // This avoids overwriting a fast recovery with CONNECTING immediately
    // before returning 'skipped'.
    try {
        const { setBotConnectionStatus } = require('../server/db-service');
        await setBotConnectionStatus(clean, 'CONNECTING', {
            commandReady: false,
            wsState: 0,
            lastErrorMessage: 'Automatic reconnect in progress',
        });
    } catch (_) {}

    // ── Supervisor (isolated) mode — use spawnBot ─────────────────────────
    try {
        const { isSupervisorActive, spawnBot, killBot, _clearNoSessionBot } = require('../worker/supervisor');
        if (isSupervisorActive()) {
            // Clear _noSessionBots so supervisor doesn't skip this bot
            if (typeof _clearNoSessionBot === 'function') _clearNoSessionBot(clean);

            // Kill any stale thread first, then spawn fresh. A spawn can be
            // deferred by MAX_CONCURRENT_BOTS; never report that as success or
            // the bot can remain stuck until a long cooldown expires.
            const killed = killBot(clean, 'SIGTERM');
            if (killed) await new Promise(r => setTimeout(r, 800));
            const thread = spawnBot(clean);
            return thread ? 'spawned' : 'deferred';
        }
    } catch (_) {}

    // ── Flat mode — connected.flag is ground truth; if present, skip ──────
    try {
        const { isConnected } = require('../allfunc/connected-flag');
        if (isConnected(clean)) {
            console.log(chalk.gray(`[AutoReconnect] ℹ️  +${clean} flag appeared mid-reconnect — already online, skipping`));
            return 'skipped';
        }
    } catch (_) {}

    // ── Flat mode — use pair.js to reconnect ──────────────────────────────
    try {
        const pairMod = require('../pair');

        // Stop any zombie session first
            if (typeof pairMod.stopBot === 'function') pairMod.stopBot(clean);
        await new Promise(r => setTimeout(r, 500));

            await pairMod(jid);
            return 'queued';
    } catch (e) {
        console.log(chalk.red(`[AutoReconnect] ❌ +${clean} pair error: ${e.message}`));
        return 'error';
    }
}

// ── Main sweep ───────────────────────────────────────────────────────────────

async function runSweep() {
    if (_sweepRunning) return;
    _sweepRunning = true;

    try {
        // ── 1. Get linked numbers from DB ─────────────────────────────────
        const { getActiveLinkedNumbers } = require('../session-db');
        const linked = (await getActiveLinkedNumbers().catch(() => [])).map(cleanNum).filter(Boolean);

        if (!linked.length) return;

        // ── 2. Load stopped-bots (manually disconnected by user → no auto-reconnect) ─
        let stoppedSet = new Set();
        try {
            const { readStopped } = require('./stopped-bots');
            stoppedSet = new Set(readStopped());
        } catch (_) {}

        // ── 3. Get DB session map for all bots ────────────────────────────
        let dbSessionMap = {};
        try {
            const { getBotSessionsByNumbers } = require('../server/db-service');
            dbSessionMap = await getBotSessionsByNumbers(linked).catch(() => ({}));
        } catch (_) {}

        // ── 4. Find candidates for auto-reconnect ─────────────────────────
        const candidates = linked.filter(clean => {
            if (stoppedSet.has(clean)) return false;         // manually stopped
            if (_isCoolingDown(clean)) return false;         // recently attempted
            const sess = dbSessionMap[clean];
            if (_isBotOnline(clean, sess)) return false;     // already online (flag or DB)
            if (!_isOfflineLongEnough(sess)) return false;   // too early to retry
            return true;
        });

        if (!candidates.length) return;

        console.log(chalk.cyan(`[AutoReconnect] 🔍 Sweep found ${candidates.length} offline bot(s) to reconnect`));

        // ── 5. Reconnect each candidate ────────────────────────────────────
        let spawned = 0, skipped = 0, deferred = 0, errors = 0;

        for (const clean of candidates) {
            _lastReconnectAttempt.set(clean, Date.now());

            console.log(chalk.yellow(`[AutoReconnect] 🔄 Auto-reconnecting +${clean}...`));
            const result = await _reconnectOne(clean);

            if (result === 'spawned' || result === 'queued') spawned++;
            else if (result === 'skipped') skipped++;
            else if (result === 'deferred') {
                deferred++;
                // A capacity-deferred reconnect was not attempted. Let the
                // next sweep reconsider it instead of hiding it in cooldown.
                _lastReconnectAttempt.delete(clean);
            }
            else errors++;

            // Small delay between bots to avoid thundering herd
            if (candidates.indexOf(clean) < candidates.length - 1) {
                await new Promise(r => setTimeout(r, 3000));
            }
        }

        if (spawned > 0) {
            console.log(chalk.green(`[AutoReconnect] ✅ Reconnect started for ${spawned} bot(s) | deferred ${deferred} | skipped ${skipped} | errors ${errors}`));
        } else if (deferred > 0) {
            console.log(chalk.yellow(`[AutoReconnect] ⏸ ${deferred} reconnect(s) deferred by the concurrent-bot cap; will retry automatically`));
        }

    } catch (err) {
        console.error('[AutoReconnect] Sweep error:', err.message);
    } finally {
        _sweepRunning = false;
    }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Start the auto-reconnect background sweep.
 * Safe to call multiple times — only one timer is active.
 */
function startAutoReconnectSweep() {
    if (_started) return;
    _started = true;

    const intervalMin = Math.round(SWEEP_INTERVAL_MS / 60000);
    console.log(chalk.green(`[AutoReconnect] 🚀 Auto-reconnect sweep started (every ${intervalMin} min, grace ${BOT_OFFLINE_GRACE_MS / 60000} min, cooldown ${RECONNECT_COOLDOWN_MS / 60000} min)`));

    // First sweep runs after 30 seconds (give normal startup a short head start)
    const firstDelay = Number(process.env.AUTO_RECONNECT_FIRST_DELAY_MS) || 30 * 1000;
    setTimeout(() => {
        runSweep().catch(() => {});
        _sweepTimer = setInterval(() => {
            runSweep().catch(() => {});
        }, SWEEP_INTERVAL_MS);
    }, firstDelay);
}

/** Stop the sweep (for graceful shutdown). */
function stopAutoReconnectSweep() {
    if (_sweepTimer) {
        clearInterval(_sweepTimer);
        _sweepTimer = null;
    }
    _started = false;
}

/** Run a sweep immediately (for testing/manual trigger). */
async function triggerImmediateSweep() {
    return runSweep();
}

/**
 * Run a BOOT-TIME sweep with reduced grace and cooldown so bots reconnect
 * FAST after a restart instead of waiting 3+ minutes for the first periodic sweep.
 * Keeps re-trying every 30s for the first 5 minutes, then falls back to normal.
 */
function triggerBootReconnectSweep() {
    const origGrace   = BOT_OFFLINE_GRACE_MS;
    const origCooldown = RECONNECT_COOLDOWN_MS;
    const origFirst   = Number(process.env.AUTO_RECONNECT_FIRST_DELAY_MS) || 2 * 60 * 1000;

    // Use aggressive settings for boot
    process.env.AUTO_RECONNECT_FIRST_DELAY_MS = '5000';
    try {
        Object.assign(global, {
            __BOOT_RECONNECT_GRACE: 30_000,    // only 30s offline needed during boot
            __BOOT_RECONNECT_COOLDOWN: 15_000,  // 15s cooldown during boot
        });
    } catch (_) {}

    // Rush: 1st sweep after 5s, then every 30s for 5 min
    let bootCount = 0;
    const maxBootSweeps = 10;
    setTimeout(() => {
        _runBootSweep();
    }, 5000);

    async function _runBootSweep() {
        if (bootCount >= maxBootSweeps) {
            // Restore original constants after boot window
            try {
                delete global.__BOOT_RECONNECT_GRACE;
                delete global.__BOOT_RECONNECT_COOLDOWN;
            } catch (_) {}
            return;
        }
        bootCount++;
        try {
            await runSweep();
        } catch (_) {}
        if (bootCount < maxBootSweeps) {
            setTimeout(_runBootSweep, 30_000);
        }
    }

    // Restore env after boot window (5 min max)
    setTimeout(() => {
        try {
            delete global.__BOOT_RECONNECT_GRACE;
            delete global.__BOOT_RECONNECT_COOLDOWN;
        } catch (_) {}
    }, 5 * 60 * 1000);
}

module.exports = {
    startAutoReconnectSweep,
    stopAutoReconnectSweep,
    triggerImmediateSweep,
    triggerBootReconnectSweep,
};
