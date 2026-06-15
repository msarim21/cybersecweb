'use strict';

/**
 * Bot supervisor — one child Node process per linked WhatsApp number.
 * Each child is fully isolated (separate memory, globals, config files).
 */

const { fork } = require('child_process');
const path = require('path');
const fs = require('fs');
const chalk = require('chalk');

const { cleanBotNum } = require('../allfunc/bot-workspace');
const { ensureBotWorkspace } = require('../allfunc/bot-workspace');
const { getDynoIndex, getTotalWorkerDynos } = require('../allfunc/whatsapp-host');
const { canSpawnBot, getMemSummary } = require('./mem-guard');

const SYNC_INTERVAL_MS = 25_000;
const RESTART_DELAY_MS = 12_000;
const MAX_RESTARTS_PER_HOUR = 12;

// Rotation: how often to cycle one sleeping bot in (so all bots share uptime fairly).
// Set BOT_ROTATION_HOURS=0 to disable rotation entirely.
const ROTATION_INTERVAL_MS = (Number(process.env.BOT_ROTATION_HOURS) ?? 6) * 60 * 60 * 1000;

/**
 * Tracks the last known activity time per bot number.
 * Updated on spawn and on IPC 'activity' messages from child.
 * Used to pick the LRU bot for eviction when RAM is full.
 * @type {Map<string, number>}
 */
const lastActivity = new Map();

let _lastRotationAt = Date.now();

/** @type {Map<string, { child: import('child_process').ChildProcess, restarts: number[], pairing: boolean }>} */
const children = new Map();

/**
 * Bots currently being evicted by the RAM-rotation logic.
 * _scheduleRestart skips these so they don't immediately re-spawn and
 * cause a memory spike (evicted bot exits → _scheduleRestart fires →
 * restarts the bot we just killed → 4-5 simultaneous processes → R14/R15).
 */
const _evictedBots = new Set();

let _syncTimer  = null;
let _syncBusy   = false;   // mutex — prevents concurrent syncBots calls
let _active     = false;

function isSupervisorActive() {
    return _active;
}

function _botRunnerScript() {
    return path.join(__dirname, 'bot-runner.js');
}

function _spawnEnv(extra = {}) {
    const childHeap = process.env.BOT_CHILD_HEAP_MB || '256';
    const existing = String(process.env.NODE_OPTIONS || '');
    const heapFlag = `--max-old-space-size=${childHeap}`;
    const nodeOpts = existing.includes('max-old-space-size') ? existing : `${existing} ${heapFlag}`.trim();
    return {
        ...process.env,
        NODE_OPTIONS: nodeOpts,
        WHATSAPP_WORKER: '1',
        BOT_ISOLATION: '1',
        ...extra,
    };
}

/**
 * @param {string}  botNum
 * @param {string}  [signal='SIGTERM']
 * @param {boolean} [evict=false]  — true when called from RAM-rotation so that
 *                                   _scheduleRestart does NOT re-spawn this bot
 *                                   automatically (we want syncBots to decide).
 */
function killBot(botNum, signal = 'SIGTERM', evict = false) {
    const clean = cleanBotNum(botNum);
    const entry = children.get(clean);
    if (!entry?.child) return false;
    if (evict) _evictedBots.add(clean);
    try {
        entry.child.kill(signal);
    } catch (_) {}
    children.delete(clean);
    console.log(chalk.yellow(`[Supervisor] Stopped isolated bot +${clean}`));
    return true;
}

function spawnBot(botNum, opts = {}) {
    const clean = cleanBotNum(botNum);
    if (!clean) return null;

    if (children.has(clean)) {
        if (!opts.force) return children.get(clean).child;
        killBot(clean);
    }

    ensureBotWorkspace(clean);

    const child = fork(_botRunnerScript(), [clean], {
        env: _spawnEnv({
            BOT_NUMBER: clean,
            BOT_PAIRING: opts.pairing ? '1' : '0',
        }),
        stdio: 'inherit',
        cwd: path.join(__dirname, '..'),
    });

    const restarts = [];
    children.set(clean, {
        child,
        restarts,
        pairing: Boolean(opts.pairing),
        spawnedAt: Date.now(),
    });

    // Track activity — any IPC message from the child counts as "active"
    lastActivity.set(clean, Date.now());
    child.on('message', () => { lastActivity.set(clean, Date.now()); });

    child.on('exit', (code, sig) => {
        const wasPairing = children.get(clean)?.pairing;
        children.delete(clean);
        console.log(chalk.gray(`[Supervisor] Bot +${clean} exited (code=${code}, sig=${sig})`));
        if (opts.noRestart) {
            // Pairing child finished — spawn full bot if session exists and number is linked
            if (wasPairing) {
                setTimeout(() => syncBots().catch(() => {}), 2500);
            }
            return;
        }
        _scheduleRestart(clean);
    });

    child.on('error', (err) => {
        console.log(chalk.red(`[Supervisor] Bot +${clean} error: ${err.message}`));
    });

    console.log(chalk.green(`[Supervisor] ▶ Started isolated bot +${clean}${opts.pairing ? ' (pairing)' : ''}`));
    return child;
}

function _scheduleRestart(clean) {
    setTimeout(async () => {
        if (!_active) return;

        // If this bot was evicted by RAM-rotation, skip self-restart.
        // syncBots will pick it up in the next rotation slot — no immediate re-spawn.
        if (_evictedBots.has(clean)) {
            _evictedBots.delete(clean);
            console.log(chalk.gray(`[Supervisor] +${clean} evicted — skipping auto-restart, syncBots will rotate`));
            return;
        }

        try {
            const { readStopped } = require('../allfunc/stopped-bots');
            if (readStopped().includes(clean)) return;

            const { getActiveLinkedNumbers } = require('../session-db');
            const linked = await getActiveLinkedNumbers().catch(() => []);
            const linkedClean = linked.map((n) => cleanBotNum(n));
            if (!linkedClean.includes(clean)) return;

            const entry = children.get(clean);
            if (entry) return;

            const hourAgo = Date.now() - 60 * 60 * 1000;
            const recent = (global._supervisorRestarts?.[clean] || []).filter((t) => t > hourAgo);
            if (recent.length >= MAX_RESTARTS_PER_HOUR) {
                console.log(chalk.red(`[Supervisor] +${clean} restart limit reached — skipping`));
                return;
            }
            if (!global._supervisorRestarts) global._supervisorRestarts = {};
            global._supervisorRestarts[clean] = [...recent, Date.now()];

            // Check RAM before self-restart — prevents simultaneous restarts from blowing past limit.
            const runningNow = [...children.values()].filter((e) => !e?.pairing).length;
            if (!canSpawnBot(runningNow)) {
                console.log(chalk.yellow(
                    `[Supervisor] +${clean} restart deferred — RAM full (${getMemSummary(runningNow)})`
                ));
                return;
            }

            const ready = await _ensureBotSessionReady(clean);
            if (ready) spawnBot(clean);
        } catch (e) {
            console.log(chalk.yellow(`[Supervisor] Restart check failed for +${clean}: ${e.message}`));
        }
    }, RESTART_DELAY_MS);
}

function _hasRegisteredCreds(clean) {
    const sessionPath = path.join(__dirname, '..', 'nexstore', 'pairing', `${clean}@s.whatsapp.net`, 'creds.json');
    const altPath = path.join(__dirname, '..', 'nexstore', 'pairing', clean, 'creds.json');
    for (const p of [sessionPath, altPath]) {
        try {
            if (!fs.existsSync(p)) continue;
            const creds = JSON.parse(fs.readFileSync(p, 'utf8'));
            if (creds?.registered || creds?.me?.id) return true;
        } catch (_) {}
    }
    return false;
}

function _isChildProcessAlive(entry) {
    if (!entry?.child) return false;
    if (entry.child.killed) return false;
    if (entry.child.exitCode !== null) return false;
    return true;
}

function _isChildHealthy(clean, entry) {
    if (!_isChildProcessAlive(entry)) return false;

    const graceMs = 5 * 60 * 1000;
    const spawnedAt = entry.spawnedAt || 0;
    if (spawnedAt && Date.now() - spawnedAt < graceMs) return true;

    try {
        const { isBotHeartbeatFresh, readBotHeartbeat } = require('../allfunc/bot-heartbeat');
        const hb = readBotHeartbeat(clean);
        if (hb?.wsState === 1) return true;
        if (isBotHeartbeatFresh(clean, 15 * 60 * 1000)) return true;
    } catch (_) {}

    return false;
}

/**
 * Returns the bot number (from botSet) that has been least recently active
 * among currently running, non-pairing, non-pairingInFlight children.
 * Returns null if no eviction candidate exists.
 * @param {Set<string>} botSet
 * @returns {string|null}
 */
function _getLruRunningBot(botSet) {
    let lruNum = null;
    let lruTime = Infinity;
    for (const [clean, entry] of children) {
        if (!botSet.has(clean)) continue;
        if (entry?.pairing) continue;
        if (global._pairingInFlight?.has(clean)) continue;
        const t = lastActivity.get(clean) || (entry.spawnedAt || 0);
        if (t < lruTime) { lruTime = t; lruNum = clean; }
    }
    return lruNum;
}

/** Local creds OR restore from MongoDB/PostgreSQL after dyno restart */
async function _ensureBotSessionReady(clean) {
    if (_hasRegisteredCreds(clean)) return true;
    try {
        const { ensureSessionRestored } = require('../session-db');
        const ok = await ensureSessionRestored(clean);
        if (ok) {
            console.log(chalk.cyan(`[Supervisor] 📥 Restored +${clean} session from DB for auto-reconnect`));
        }
        return ok;
    } catch (e) {
        console.log(chalk.yellow(`[Supervisor] Session restore failed for +${clean}: ${e.message}`));
        return false;
    }
}

function markBotPromoted(botNum) {
    const clean = cleanBotNum(botNum);
    const entry = children.get(clean);
    if (entry) entry.pairing = false;
}

function promotePairingToNormal(botNum) {
    const clean = cleanBotNum(botNum);
    if (!clean) return false;
    const entry = children.get(clean);
    if (!entry?.pairing) return false;
    if (!_hasRegisteredCreds(clean)) return false;

    console.log(chalk.cyan(`[Supervisor] 🔄 Promoting +${clean} pairing child → full bot`));
    killBot(clean, 'SIGTERM');
    setTimeout(() => {
        if (!_active || children.has(clean)) return;
        spawnBot(clean);
    }, 2500);
    return true;
}

async function syncBots() {
    // Mutex: drop concurrent calls — timers can fire while a previous syncBots is
    // still awaiting DB / session checks, causing duplicate spawns.
    if (_syncBusy) return;
    _syncBusy = true;
    try {
        try {
            const { syncStoppedWithLinkedNumbers } = require('../allfunc/stopped-bots');
            await syncStoppedWithLinkedNumbers();
        } catch (_) {}

    const { getActiveLinkedNumbers } = require('../session-db');
    const { readStopped } = require('../allfunc/stopped-bots');

    const linked = (await getActiveLinkedNumbers().catch(() => []))
        .map((n) => cleanBotNum(n))
        .filter(Boolean);
    const stopped = new Set(readStopped());
    const linkedSet = new Set(linked.filter((n) => !stopped.has(n)));

    // ── Dyno sharding — distribute bots evenly across multiple worker dynos ──────
    // When TOTAL_WORKER_DYNOS > 1, each worker dyno only manages its own shard.
    // Sorted list ensures stable, deterministic assignment across restarts.
    // Setup: heroku ps:scale worker=N  +  Config Var TOTAL_WORKER_DYNOS=N
    const dynoIndex   = getDynoIndex();
    const totalDynos  = getTotalWorkerDynos();
    const sortedLinked = [...linkedSet].sort();
    const myBots = new Set(
        sortedLinked.filter((_, i) => i % totalDynos === dynoIndex)
    );

    if (totalDynos > 1) {
        console.log(chalk.cyan(
            `[Supervisor] Dyno ${dynoIndex + 1}/${totalDynos} — ` +
            `managing ${myBots.size} of ${linkedSet.size} bots (shard ${dynoIndex})`
        ));
    } else if (linkedSet.size > 0) {
        console.log(chalk.cyan(`[Supervisor] Managing ${linkedSet.size} bot(s)`));
    }

    const { isConnected } = require('../allfunc/connected-flag');

    // Backup: restart pairing-only child as full bot once linked + registered (stuck state)
    for (const [clean, entry] of [...children]) {
        if (!entry?.pairing) continue;
        if (global._pairingInFlight?.has(clean)) continue;
        if (!myBots.has(clean)) continue;
        if (_hasRegisteredCreds(clean) && isConnected(clean)) {
            promotePairingToNormal(clean);
        }
    }

    // Restart unhealthy children (process alive but WA socket dead / no heartbeat)
    for (const [clean, entry] of [...children]) {
        if (entry?.pairing) continue;
        if (global._pairingInFlight?.has(clean)) continue;
        if (!myBots.has(clean)) continue;
        if (_isChildHealthy(clean, entry)) continue;

        console.log(chalk.red(`[Supervisor] 💀 +${clean} unhealthy — auto-restarting`));
        killBot(clean, 'SIGTERM');
        const ready = await _ensureBotSessionReady(clean);
        if (ready) spawnBot(clean);
    }

    // Scheduled memory restart — backup if child self-exit timer did not fire
    let maxAgeMs = 0;
    try {
        const { getBotRestartHours } = require('../keepalive');
        const hrs = getBotRestartHours();
        if (hrs > 0) maxAgeMs = hrs * 60 * 60 * 1000;
    } catch (_) {}
    if (maxAgeMs > 0) {
        for (const [clean, entry] of [...children]) {
            if (entry?.pairing) continue;
            if (global._pairingInFlight?.has(clean)) continue;
            if (!myBots.has(clean)) continue;
            const spawnedAt = entry.spawnedAt || 0;
            if (!spawnedAt || Date.now() - spawnedAt < maxAgeMs) continue;

            console.log(chalk.cyan(
                `[Supervisor] 🔄 +${clean} memory restart (${Math.round((Date.now() - spawnedAt) / 3600000)}h uptime)`
            ));
            killBot(clean, 'SIGTERM');
            const ready = await _ensureBotSessionReady(clean);
            if (ready) spawnBot(clean);
        }
    }

    // ── Memory-aware bot start + LRU eviction ────────────────────────────────
    // Update lastActivity from heartbeat files for every running bot.
    // This gives the LRU eviction real data even before IPC messages arrive.
    try {
        const { readBotHeartbeat } = require('../allfunc/bot-heartbeat');
        for (const [clean] of children) {
            const hb = readBotHeartbeat(clean);
            if (hb?.ts && hb.ts > (lastActivity.get(clean) || 0)) {
                lastActivity.set(clean, hb.ts);
            }
        }
    } catch (_) {}

    // Sort sleeping bots: longest offline first (fairest rotation — bots offline
    // the longest get the next available RAM slot before recently-evicted ones).
    const sleepingBots = [...myBots]
        .filter((c) => !children.has(c) && !global._pairingInFlight?.has(c))
        .sort((a, b) => (lastActivity.get(a) || 0) - (lastActivity.get(b) || 0));

    for (const clean of sleepingBots) {
        // Re-compute runningNow on EVERY iteration — it changes after each
        // killBot() call because children.delete() runs synchronously inside killBot.
        // Using a stale count causes the post-eviction canSpawnBot check to wrongly
        // report "RAM still tight" while all bots have actually been killed, then
        // _scheduleRestart fires them all simultaneously → 5 × 200 MB memory spike.
        const runningNow = [...children.values()].filter((e) => !e?.pairing).length;

        // Pass runningNow so canSpawnBot() can project dyno memory accurately.
        // On Heroku, /proc/meminfo shows HOST machine RAM (e.g. 63 GB), not the
        // 512 MB dyno limit — without activeChildCount the guard always returns true.
        const memOk = canSpawnBot(runningNow);

        if (!memOk) {
            // If NO bots are running at all, start anyway — an empty dyno should
            // always have at least one bot regardless of RAM reading.
            if (runningNow === 0 && children.size === 0) {
                console.log(chalk.yellow(
                    `[Supervisor] ⚠️ RAM pressure high but no bots running — starting first bot anyway | ${getMemSummary(runningNow)}`
                ));
                // Fall through to spawn below
            } else {
                // RAM is full and bots are running — evict LRU to make room,
                // but only if the LRU bot has been running long enough.
                const BOT_MIN_RUN_MS = Number(process.env.BOT_MIN_RUN_MINUTES ?? 5) * 60_000;
                const lru = _getLruRunningBot(myBots);
                if (!lru) {
                    // No eviction candidate — all bots are too recent to evict.
                    console.log(chalk.yellow(
                        `[Supervisor] ⚠️ RAM full (${getMemSummary(runningNow)}) — ` +
                        `${sleepingBots.length - sleepingBots.indexOf(clean)} bot(s) queued for next slot`
                    ));
                    break;
                }
                const lruEntry = children.get(lru);
                const lruAge = lruEntry?.spawnedAt ? Date.now() - lruEntry.spawnedAt : Infinity;
                if (lruAge < BOT_MIN_RUN_MS) {
                    const remSec = Math.ceil((BOT_MIN_RUN_MS - lruAge) / 1000);
                    console.log(chalk.yellow(
                        `[Supervisor] ⏳ RAM full but +${lru} too young to evict (${remSec}s remaining) — waiting for next sync`
                    ));
                    break;
                }
                console.log(chalk.yellow(
                    `[Supervisor] 🔄 RAM full — rotating +${lru} out, +${clean} in | ${getMemSummary(runningNow)}`
                ));
                lastActivity.set(lru, 0);
                killBot(lru, 'SIGTERM', true);   // evict=true → _scheduleRestart will skip re-spawn
                // Wait 4 s so the killed process has time to actually exit and free
                // RSS before we re-project. (SIGTERM → graceful exit takes ~1-3 s.)
                await new Promise((r) => setTimeout(r, 4000));
                // IMPORTANT: re-read children AFTER the kill — children.delete() ran
                // synchronously inside killBot so this count is accurate.
                const runningAfterEviction = [...children.values()].filter((e) => !e?.pairing).length;
                if (!canSpawnBot(runningAfterEviction)) {
                    console.log(chalk.yellow(
                        `[Supervisor] ⚠️ RAM still tight after eviction — skipping +${clean} | ${getMemSummary(runningAfterEviction)}`
                    ));
                    continue;
                }
            }
        }

        const ready = await _ensureBotSessionReady(clean);
        if (ready) {
            spawnBot(clean);
            const freshCount = [...children.values()].filter((e) => !e?.pairing).length;
            console.log(chalk.green(`[Supervisor] ▶ +${clean} started | ${getMemSummary(freshCount)}`));
        }
        // If we spawned under memory pressure (forced first-bot), stop here.
        // Without this break the loop continues, sees RAM still full, and immediately
        // evicts the bot we just started — causing a pointless rotation storm.
        if (!memOk) break;
    }

    // ── Scheduled rotation ────────────────────────────────────────────────────
    // Every BOT_ROTATION_HOURS (default 6h), cycle one sleeping bot in so that
    // ALL registered bots get uptime over time — even when RAM is always full.
    if (ROTATION_INTERVAL_MS > 0 && Date.now() - _lastRotationAt >= ROTATION_INTERVAL_MS) {
        _lastRotationAt = Date.now();
        const stillSleeping = [...myBots]
            .filter((c) => !children.has(c) && !global._pairingInFlight?.has(c));
        if (stillSleeping.length > 0) {
            // Longest-sleeping bot gets priority for the rotation slot.
            const nextBot = stillSleeping.sort((a, b) => (lastActivity.get(a) || 0) - (lastActivity.get(b) || 0))[0];
            const lru = _getLruRunningBot(myBots);
            if (lru) {
                console.log(chalk.cyan(
                    `[Supervisor] ⏰ Rotation: pausing +${lru} → waking +${nextBot}`
                ));
                lastActivity.set(lru, 0);
                killBot(lru, 'SIGTERM', true);   // evict=true → _scheduleRestart will skip re-spawn
            }
        }
    }

    // Stop bots NOT assigned to this dyno, or no longer linked / stopped
    for (const [clean, entry] of children) {
        if (entry?.pairing) continue;
        if (global._pairingInFlight?.has(clean)) continue;
        if (!myBots.has(clean)) killBot(clean);
    }
    } finally {
        _syncBusy = false;
    }
}

function deleteFolderRecursive(p) {
    if (!fs.existsSync(p)) return;
    for (const f of fs.readdirSync(p)) {
        const cur = path.join(p, f);
        if (fs.lstatSync(cur).isDirectory()) deleteFolderRecursive(cur);
        else fs.unlinkSync(cur);
    }
    try { fs.rmdirSync(p); } catch (_) {}
}

async function handlePairingRequest(clean) {
    const num = cleanBotNum(clean);
    if (!num) return;

    if (!global._pairingInFlight) global._pairingInFlight = new Set();
    if (global._pairingInFlight.has(num)) return;
    global._pairingInFlight.add(num);
    console.log(chalk.cyan(`[Supervisor] 🔗 Pairing request for +${num} — spawning isolated pairing process`));

    try {
        const { removeFromStoppedBots } = require('../allfunc/stopped-bots');
        removeFromStoppedBots(num);

        killBot(num, 'SIGKILL');

        const jid = `${num}@s.whatsapp.net`;
        const sessionPath = path.join(__dirname, '..', 'nexstore', 'pairing', jid);
        if (fs.existsSync(sessionPath)) deleteFolderRecursive(sessionPath);

        try {
            const { deleteSessionCreds } = require('../session-db');
            await deleteSessionCreds(num);
        } catch (_) {}

        try {
            const pairingJson = path.join(__dirname, '..', 'nexstore', 'pairing', 'pairing.json');
            if (fs.existsSync(pairingJson)) fs.unlinkSync(pairingJson);
        } catch (_) {}

        try {
            const { removeConnectedFlag } = require('../allfunc/connected-flag');
            removeConnectedFlag(num);
        } catch (_) {}

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
            console.log(chalk.red(`[Supervisor] Pairing timeout for +${num} — no code in DB`));
            await markPairingFailed(num).catch(() => {});
            killBot(num, 'SIGTERM');
        } else {
            console.log(chalk.green(`[Supervisor] Pairing code ready for +${num}`));
        }
    } finally {
        global._pairingInFlight.delete(num);
    }
}

function stopBotExternal(number) {
    const clean = cleanBotNum(number);
    killBot(clean, 'SIGKILL');
}

function startSupervisor() {
    if (_active) return;
    _active = true;

    console.log(chalk.cyan('\n╔══════════════════════════════════════════╗'));
    console.log(chalk.cyan('║  BOT SUPERVISOR — One Process Per Number  ║'));
    console.log(chalk.cyan('╚══════════════════════════════════════════╝\n'));

    const runSync = () => syncBots().catch((e) => {
        console.log(chalk.yellow(`[Supervisor] syncBots: ${e.message}`));
    });
    runSync();
    // Fast reconnect sweep after worker/dyno restart (ephemeral disk is empty)
    [3000, 8000, 20000, 45000, 90000].forEach((ms) => setTimeout(runSync, ms));
    _syncTimer = setInterval(runSync, SYNC_INTERVAL_MS);
    if (!global._supervisorHealthTimer) {
        global._supervisorHealthTimer = setInterval(runSync, 3 * 60 * 1000);
    }

    // Patch pair.js stopBot so web/worker cleanup kills child processes
    try {
        const pairMod = require('../pair');
        const origStop = pairMod.stopBot?.bind(pairMod);
        pairMod.stopBot = function patchedStopBot(number) {
            const clean = cleanBotNum(number);
            const entry = children.get(clean);
            if (entry?.pairing || global._pairingInFlight?.has(clean)) {
                console.log(chalk.yellow(`[Supervisor] stopBot ignored during pairing for +${clean}`));
                return;
            }
            stopBotExternal(number);
            if (typeof origStop === 'function') origStop(number);
        };
    } catch (_) {}

    return {
        isActive: () => _active,
        syncBots,
        spawnBot,
        killBot,
        stopBotExternal,
        handlePairingRequest,
        getChildren: () => [...children.keys()],
    };
}

function stopSupervisor() {
    _active = false;
    if (_syncTimer) clearInterval(_syncTimer);
    for (const clean of [...children.keys()]) killBot(clean);
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
};
