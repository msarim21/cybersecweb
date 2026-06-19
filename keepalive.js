'use strict';

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

let _timer = null;
let _noopTimer = null;
let _started = false;

function getAppUrl() {
    if (process.env.APP_URL)                       return process.env.APP_URL;
    if (process.env.HEROKU_APP_NAME)               return `https://${process.env.HEROKU_APP_NAME}.herokuapp.com`;
    if (process.env.HEROKU_APP_DEFAULT_DOMAIN_NAME) return `https://${process.env.HEROKU_APP_DEFAULT_DOMAIN_NAME}`;
    if (process.env.RENDER_EXTERNAL_URL)            return process.env.RENDER_EXTERNAL_URL;
    if (process.env.RAILWAY_PUBLIC_DOMAIN)          return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
    if (process.env.REPLIT_DEV_DOMAIN)             return `https://${process.env.REPLIT_DEV_DOMAIN}`;
    if (process.env.REPL_SLUG && process.env.REPL_OWNER) {
        return `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;
    }
    return null;
}

function ping(url) {
    return new Promise((resolve) => {
        try {
            const mod = url.startsWith('https') ? https : http;
            const req = mod.get(url, { timeout: 15000 }, (res) => {
                res.resume();
                console.log(`[KeepAlive] ✅ ping ${url} → HTTP ${res.statusCode}`);
                resolve(true);
            });
            req.on('error', (e) => {
                console.log(`[KeepAlive] ⚠️  ping ${url} → ${e.message}`);
                resolve(false);
            });
            req.setTimeout(15000, () => { try { req.destroy(); } catch (_) {} resolve(false); });
        } catch (e) {
            resolve(false);
        }
    });
}

async function selfPing() {
    const appUrl = getAppUrl();
    if (!appUrl) {
        console.log('[KeepAlive] ⚠️  APP_URL nahi mila! Config Vars mein APP_URL set karo.');
        return;
    }

    const base = appUrl.replace(/\/$/, '');

    const ok = await ping(`${base}/api/ping`);
    if (!ok) {
        const ok2 = await ping(`${base}/api/health`);
        if (!ok2) await ping(`${base}/`);
    }

    const extra = process.env.EXTRA_PING_URLS;
    if (extra) {
        for (const url of extra.split(',').map(u => u.trim()).filter(Boolean)) {
            await ping(url);
        }
    }
}

function isWhatsAppWorker() {
    try {
        const { shouldRunWhatsAppSupervisor } = require('./allfunc/whatsapp-host');
        return shouldRunWhatsAppSupervisor();
    } catch (_) {}
    return false;
}

const WA_STALE_MS = Number(process.env.WA_STALE_MS) || 10 * 60 * 1000;
const WA_ZOMBIE_MS = Number(process.env.WA_ZOMBIE_MS) || 45 * 60 * 1000;

function _supervisorActive() {
    try {
        const { isSupervisorActive } = require('./worker/supervisor');
        return isSupervisorActive();
    } catch (_) {
        return false;
    }
}

function uniqueTrackerEntries(trackerMap) {
    const seen = new Set();
    const rows = [];
    if (!trackerMap?.entries) return rows;
    for (const [key, tracker] of trackerMap.entries()) {
        if (!tracker || seen.has(tracker)) continue;
        seen.add(tracker);
        rows.push([key, tracker]);
    }
    return rows;
}

/** Persist antidelete RAM → disk → Mongo so dyno restarts don't lose cache */
async function backupAntideleteSessions() {
    try {
        const trackerMap = global._rentbotTracker;
        if (!trackerMap?.size) return;
        const { getAntideleteSession } = require('./allfunc/antidelete-session');
        for (const [key, tracker] of uniqueTrackerEntries(trackerMap)) {
            if (!tracker || tracker.disconnected) continue;
            const nexus = tracker.connection;
            if (!nexus?.user) continue;
            const clean = String(key).replace(/[^0-9]/g, '');
            if (!clean) continue;
            const session = getAntideleteSession(clean);
            session?.saveDiskNow();
        }
        if (typeof global._adFlushMongoSavesNow === 'function') {
            await global._adFlushMongoSavesNow().catch(() => {});
        }
    } catch (_) {}
}

/** Wake idle WhatsApp sockets so first command/delete after silence is instant */
async function sweepStaleWhatsAppSockets() {
    // Never open or reconnect WhatsApp sockets on the web/API dyno when bots
    // are hosted on worker — doing so causes Error 440 (duplicate session).
    if (!isWhatsAppWorker()) return;
    // In supervisor mode the parent process must never open WhatsApp sockets.
    // Each bot runs as an isolated child (bot-runner.js) that manages its own socket.
    // Calling pair() here from the parent would load every bot in-process → R14/R15.
    if (_supervisorActive()) return;
    // In an isolated child process only manage THIS child's own bot — never call
    // pair() for a different JID inside this sweep (would fork a second bot in-process).
    const _ownBot = global.__ISOLATED_BOT ? String(global.__ISOLATED_BOT) : null;
    const trackerMap = global._rentbotTracker;
    if (!trackerMap?.size) return;

    let pairMod;
    let ensureHot;
    try {
        pairMod = require('./pair');
        ensureHot = require('./allfunc/socket-wake').ensureWhatsAppSocketHot;
    } catch (_) { return; }

    for (const [key, tracker] of uniqueTrackerEntries(trackerMap)) {
        if (!tracker || tracker.disconnected) continue;
        const nexus = tracker.connection;
        if (!nexus?.user) continue;

        const clean = String(key).replace(/[^0-9]/g, '');
        const jid = key.includes('@') ? key : (clean ? `${clean}@s.whatsapp.net` : '');
        if (!jid) continue;

        // In an isolated child process, only manage this child's own bot number.
        // Skip any other bot that somehow ends up in _rentbotTracker (prevents
        // loading foreign bots in-process via pairMod() below → memory explosion).
        if (_ownBot && clean !== _ownBot) continue;

        const wsState = nexus.ws?.readyState ?? -1;

        // Isolated child: light wake only — never stopBot+pair (causes WA "Syncing" hang)
        if (_ownBot) {
            if (wsState === 1) {
                const silentMs = Date.now() - (tracker.lastWAMessage || tracker.lastActivity || 0);
                if (silentMs >= WA_STALE_MS) {
                    const { lightWakeSocket } = require('./allfunc/socket-wake');
                    await lightWakeSocket(nexus, tracker).catch(() => false);
                }
            }
            continue;
        }

        const lastWa = tracker.lastWAMessage || tracker.lastActivity || 0;
        const silentMs = Date.now() - lastWa;

        if (wsState === 3 || wsState === -1) {
            // If pair.js is already handling a 440-retry loop, don't interfere —
            // a second reconnect attempt would cause another 440 and extend the loop.
            if (tracker.err440Retry > 0) continue;

            // Cooldown: skip reconnect if we already tried within last 45s
            if (!global._socketKACooldown) global._socketKACooldown = new Map();
            const lastTry = global._socketKACooldown.get(clean) || 0;
            if (Date.now() - lastTry < 45_000) continue;
            global._socketKACooldown.set(clean, Date.now());
            console.log(`[SocketKeepAlive] ${clean} ws closed (${wsState}) — reconnecting`);
            try {
                if (typeof pairMod.stopBot === 'function') pairMod.stopBot(jid);
                await new Promise((r) => setTimeout(r, 1500));
                pairMod(jid).catch(() => {});
            } catch (_) {}
            continue;
        }

        if (wsState !== 1) continue;

        // Stale socket — light wake first; reconnect only if zombie (45min+ silence) or wake fails twice
        if (silentMs >= WA_STALE_MS) {
            const { lightWakeSocket } = require('./allfunc/socket-wake');
            const woke = await lightWakeSocket(nexus, tracker).catch(() => false);
            if (!woke) {
                tracker._staleWakeFails = (tracker._staleWakeFails || 0) + 1;
            } else {
                tracker._staleWakeFails = 0;
            }
            const zombie = silentMs >= WA_ZOMBIE_MS;
            const failLimit = zombie ? 2 : 3;
            if (!woke && (tracker._staleWakeFails || 0) >= failLimit) {
                console.log(`[SocketKeepAlive] 💀 ${clean} zombie socket (${Math.round(silentMs / 60000)}m idle) — reconnecting`);
                tracker._staleWakeFails = 0;
                try { nexus.ws?.terminate?.() || nexus.ws?.close(); } catch (_) {}
                await new Promise((r) => setTimeout(r, 2000));
                try {
                    if (typeof pairMod.stopBot === 'function') pairMod.stopBot(jid);
                } catch (_) {}
                pairMod(jid).catch(() => {});
            }
            continue;
        }
    }
}

// ── Full memory cleanup before scheduled restart ─────────────────────────────
function cleanupBotMemory() {
    try {
        // Keep antidelete/antiedit caches — data survives restarts via Mongo/disk
        if (global._antieditStore?.clear) global._antieditStore.clear();
        if (global._statusCache?.clear) global._statusCache.clear();
        if (global._processedMsgIds?.clear) global._processedMsgIds.clear();
        global._lastViewOnce = {};
        global._pcMemCache = null;
        // Keep antidelete/antiedit configs — reloaded from disk on next use
        if (typeof global.gc === 'function') global.gc();
        console.log('[AutoRestart] 🧹 Memory caches cleared — fresh start');
    } catch (e) {
        console.log('[AutoRestart] cleanup warning:', e.message);
    }
}

// ── Silent bot-session refresh ────────────────────────────────────────────────
// Every 10 min: reconnect dead sessions AND trigger full autoload if nothing loaded.
// ONLY on worker dyno — web dyno must never touch WhatsApp sockets (440 disconnects).
async function refreshBotSessions() {
    // Hard guard: supervisor owns all bots — never load them in-process here.
    if (_supervisorActive()) return;
    // In an isolated bot child process, this function must never run — each child
    // manages only its own single bot; loading others causes per-child memory explosion.
    if (global.__ISOLATED_BOT) return;
    if (!isWhatsAppWorker()) return;
    try {
        // Isolated supervisor mode: sync child processes instead of autoload
        try {
            const { isSupervisorActive, syncBots } = require('./worker/supervisor');
            if (isSupervisorActive()) {
                await syncBots();
                return;
            }
        } catch (_) {}

        const pairMod = require('./pair');
        const { getActiveLinkedNumbers } = require('./session-db');
        const allNums = await getActiveLinkedNumbers().catch(() => []);
        if (!allNums || !allNums.length) return;

        // ── Dyno sharding: only manage bots assigned to THIS dyno ──────────────
        // Must mirror shardJids() in autoload.js exactly:
        //   Block assignment — dyno N → bots[N*bpd .. (N+1)*bpd - 1]
        // Without this, every dyno tries to reconnect ALL bots → Error 440 flood.
        let nums = allNums;
        try {
            const { shardLinkedNumbers } = require('./allfunc/dyno-shard');
            nums = shardLinkedNumbers(allNums);
        } catch (_) {}

        const trackerMap = global._rentbotTracker;
        const hasTracker = Boolean(trackerMap && typeof trackerMap.size === 'number');
        const trackerSize = hasTracker ? trackerMap.size : 0;

        // If tracker exists but is empty while DB has linked numbers → autoload missed bots
        if (hasTracker && trackerSize === 0) {
            if (nums.length > 0) {
                console.log(`[KeepAlive] 🔄 Tracker empty but DB has ${nums.length} assigned number(s) — triggering autoload...`);
                try {
                    const { syncStoppedWithLinkedNumbers } = require('./allfunc/stopped-bots');
                    await syncStoppedWithLinkedNumbers();
                    const { autoLoadPairs } = require('./autoload');
                    autoLoadPairs({ batchSize: 3 }).catch(() => {});
                } catch (_) {}
            }
            return;
        }

        for (const n of nums) {
            const clean = String(n).replace(/[^0-9]/g, '');
            if (!clean) continue;
            const jid = clean + '@s.whatsapp.net';
            const tracker = trackerMap && trackerMap.get
                ? trackerMap.get(jid) || trackerMap.get(clean)
                : null;
            if (!tracker) {
                console.log(`[KeepAlive] 🔌 ${clean} not in tracker — reconnecting missed session...`);
                try {
                    const { restoreCredsFromDb } = require('./session-db');
                    const sessionPath = require('path').join(__dirname, 'nexstore', 'pairing', jid);
                    await restoreCredsFromDb(clean, sessionPath).catch(() => {});
                    await new Promise(r => setTimeout(r, 1500));
                    require('./pair')(jid).catch(() => {});
                } catch (_) {}
                continue;
            }

            // Skip bots that pair.js gave up on (440 conflict loop / re-pair required).
            if (tracker.disconnected && (tracker.err440Retry > 0 || tracker.conflictPingPong > 0)) continue;
            if (tracker.err440Retry > 0 || tracker.conflictPingPong > 0) continue;
            try {
                const pairMod = require('./pair');
                const cleanCheck = String(clean);
                if (typeof pairMod.isReconnectBlocked === 'function' && pairMod.isReconnectBlocked(cleanCheck)) continue;
            } catch (_) {}

            const ws = tracker.connection && tracker.connection.ws;
            const wsState = ws ? ws.readyState : -1;
            if (wsState === 3 || wsState === -1) {
                console.log(`[KeepAlive] 🔄 Silent reconnect for ${clean} (ws state=${wsState})`);
                try {
                    if (typeof pairMod.stopBot === 'function') pairMod.stopBot(jid);
                    await new Promise(r => setTimeout(r, 2000));
                    require('./pair')(jid).catch(() => {});
                } catch (_) {}
            }
        }
    } catch (_) {}
}

// ── Prince AI API warmup — prevent first-command cold-start delay ─────────────
async function warmupPrinceAPIs() {
    const endpoints = [
        'https://api.princetechn.com/api/ai/gpt4?apikey=prince&q=hi',
        'https://api.princetechn.com/api/ai/geminiaipro?apikey=prince&q=hi',
        'https://api.princetechn.com/api/ai/deepseek-llm?apikey=prince&q=hi',
    ];
    for (const url of endpoints) {
        try {
            const req = https.get(url, { timeout: 20000 }, (res) => { res.resume(); });
            req.on('error', () => {});
            req.setTimeout(20000, () => { try { req.destroy(); } catch (_) {} });
        } catch (_) {}
    }
    console.log('[KeepAlive] 🔥 Prince AI APIs warmup triggered');
}

/** Bot memory restart interval (hours). 0 = off. Default 3h — clears per-bot heap leaks. */
function getBotRestartHours() {
    const bot = Number(process.env.BOT_RESTART_HOURS);
    if (Number.isFinite(bot)) return bot;
    const legacy = Number(process.env.AUTO_RESTART_HOURS);
    if (Number.isFinite(legacy) && legacy > 0) return legacy;
    return 3;
}

// ── Per-bot child restart (supervisor mode — web dyno stays up) ─────────────
function scheduleBotMemoryRestart(intervalMs) {
    const ms = Number(intervalMs) || 0;
    if (ms <= 0) return;

    const restartAt = Date.now() + ms;
    const nextStr = new Date(restartAt).toLocaleTimeString('en-PK', {
        hour: '2-digit', minute: '2-digit', hour12: true,
    });

    setTimeout(async () => {
        console.log('[AutoRestart] 🔄 Scheduled bot memory restart — graceful shutdown...');
        cleanupBotMemory();
        try {
            await backupAntideleteSessions();
        } catch (_) {}
        // Force a session backup right before exit so the next boot's
        // ensureSessionRestored finds the freshest Signal keys → no Bad MAC,
        // no re-pair required after the 3h scheduled restart.
        try {
            await _backupOwnSession();
        } catch (_) {}
        try {
            process.kill(process.pid, 'SIGTERM');
        } catch (_) {
            process.exit(0);
        }
    }, ms);

    console.log(`[AutoRestart] ✅ Bot memory restart at ${nextStr} (every ${Math.round(ms / 3600000)}h)`);
}

// ── Full dyno restart (legacy single-process worker only) ───────────────────
function scheduleAutoRestart(intervalMs) {
    const ms = Number(intervalMs) || 0;
    if (ms <= 0) return;

    const warnings = [
        { before: 10 * 60 * 1000, label: '10 minutes' },
        { before:  5 * 60 * 1000, label: '5 minutes'  },
        { before:  1 * 60 * 1000, label: '1 minute'   },
    ];
    const restartAt = Date.now() + ms;

    for (const w of warnings) {
        const fireAt = ms - w.before;
        if (fireAt > 0) {
            setTimeout(() => {
                console.log(`[AutoRestart] ⏰ Bot & website ${w.label} mein restart hoga`);
            }, fireAt);
        }
    }

    setTimeout(() => {
        console.log('[AutoRestart] 🔄 Scheduled auto-restart — full memory cleanup. Restarting now...');
        cleanupBotMemory();
        setTimeout(() => process.exit(0), 500);
    }, ms);

    const nextStr = new Date(restartAt).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', hour12: true });
    console.log(`[AutoRestart] ✅ Scheduled — restart at ${nextStr} (every ${Math.round(ms / 3600000)}h)`);
}

/** Light presence wake — every 60s so first command after hours of silence is instant */
async function proactiveSocketLightWake() {
    try {
        const { wakeAllSocketsLight } = require('./allfunc/socket-wake');
        await wakeAllSocketsLight(global._rentbotTracker);
    } catch (_) {}
}

/** Heavy antidelete disk/mongo refresh — every 4 min */
async function proactiveAntideleteWake() {
    try {
        const { wakeAllAntideleteSockets } = require('./allfunc/socket-wake');
        await wakeAllAntideleteSockets(global._rentbotTracker);
    } catch (_) {}
}

/** Isolated bot child — periodic session-folder backup so a sudden SIGKILL
 *  (Heroku R15 / dyno crash / 3h scheduled restart) still has fresh creds in
 *  DB for auto-reconnect on next boot. Without this, Signal keys (pre-keys,
 *  sessions, sender-keys) accumulate on disk between debounced creds.update
 *  saves and can be lost on hard kill → Bad MAC after restart.
 */
async function _backupOwnSession() {
    try {
        if (!global.__ISOLATED_BOT) return;
        const clean = String(global.__ISOLATED_BOT).replace(/[^0-9]/g, '');
        if (!clean) return;
        const tracker = global._rentbotTracker;
        const t = tracker?.get?.(`${clean}@s.whatsapp.net`) || tracker?.get?.(clean);
        const ws = t?.connection?.ws;
        if (!ws || ws.readyState !== 1) return;

        const { backupSessionFolder } = require('./session-db');
        const sessionDigits = path.join(__dirname, 'nexstore', 'pairing', clean);
        const sessionJid    = path.join(__dirname, 'nexstore', 'pairing', `${clean}@s.whatsapp.net`);
        if (fs.existsSync(sessionDigits)) {
            await backupSessionFolder(clean, sessionDigits).catch(() => {});
        } else if (fs.existsSync(sessionJid)) {
            await backupSessionFolder(clean, sessionJid).catch(() => {});
        }
    } catch (_) {}
}

/** Isolated bot child — minimal keepalive (no presence spam — causes 1min WA throttle) */
function startBotChildKeepAlive() {
    if (_started) return;
    _started = true;
    _noopTimer = setInterval(() => {}, 5 * 60 * 1000);
    // NO proactiveSocketLightWake / proactiveAntideleteWake here.
    // Those send sendPresenceUpdate every 90s which stacks with markOnlineOnConnect
    // + keepAlive WS pings → WhatsApp rate-overlimit → commands die ~1 min after connect.
    // TCP keepalive (30s) + pair.js watchdog presence (5min) is sufficient.
    setInterval(() => backupAntideleteSessions().catch(() => {}), 5 * 60 * 1000);

    // Session-folder backup every 10 min — keeps DB creds fresh so a hard kill
    // never loses more than ~10 min of Signal-key churn. Auto-reconnect after
    // restart depends on this being current.
    setInterval(() => _backupOwnSession().catch(() => {}), 10 * 60 * 1000);
    setTimeout(() => _backupOwnSession().catch(() => {}), 60 * 1000);

    const restartHours = getBotRestartHours();
    if (restartHours > 0) {
        scheduleBotMemoryRestart(restartHours * 60 * 60 * 1000);
    } else {
        console.log('[KeepAlive] Bot memory restart disabled (BOT_RESTART_HOURS=0)');
    }

    console.log('[KeepAlive] Bot-child keepalive (antidelete + session backup 10min, no presence spam)');
}

function startKeepAlive() {
    if (_started) return;
    _started = true;

    const supervisorMode = _supervisorActive();
    const waHost = isWhatsAppWorker();

    // Website ping every 8 min — Heroku Eco sleeps ~30min without HTTP traffic
    _timer = setInterval(selfPing, 8 * 60 * 1000);

    if (!supervisorMode && waHost) {
        // Legacy single-process on the WhatsApp host dyno only
        setInterval(async () => {
            await sweepStaleWhatsAppSockets().catch(() => {});
            await refreshBotSessions().catch(() => {});
        }, 90 * 1000);
        setInterval(() => proactiveSocketLightWake().catch(() => {}), 60 * 1000);
        setInterval(() => proactiveAntideleteWake().catch(() => {}), 4 * 60 * 1000);
        setInterval(() => backupAntideleteSessions().catch(() => {}), 10 * 60 * 1000);
        setInterval(async () => {
            try {
                const { backupSessionFolder } = require('./session-db');
                const tracker = global._rentbotTracker;
                if (!tracker || !tracker.size) return;
                for (const [key, t] of uniqueTrackerEntries(tracker)) {
                    if (!key.includes('@')) continue;
                    const ws = t?.connection?.ws;
                    if (!ws || ws.readyState !== 1) continue;
                    const clean = key.replace('@s.whatsapp.net', '').replace(/[^0-9]/g, '');
                    await backupSessionFolder(clean, require('path').join(__dirname, 'nexstore', 'pairing', key));
                }
            } catch (_) {}
        }, 5 * 60 * 1000);
        setTimeout(() => sweepStaleWhatsAppSockets().catch(() => {}), 25_000);
    } else if (!supervisorMode && !waHost) {
        try {
            const { getWhatsAppHostDyno } = require('./allfunc/whatsapp-host');
            console.log(`[KeepAlive] Web/API dyno — website ping only (WhatsApp on ${getWhatsAppHostDyno()} dyno, no socket sweep)`);
        } catch (_) {}
    } else {
        console.log('[KeepAlive] Supervisor mode — parent only pings website (bots managed in child processes)');
    }

    // Node.js event loop alive rakhne ke liye
    _noopTimer = setInterval(() => {}, 5 * 60 * 1000);

    // Prince AI APIs warmup — every 20 min warm raho
    warmupPrinceAPIs();
    setInterval(warmupPrinceAPIs, 20 * 60 * 1000);

    const restartHours = getBotRestartHours();
    if (supervisorMode) {
        // Full worker dyno restart every BOT_RESTART_HOURS
        if (restartHours > 0) {
            scheduleAutoRestart(restartHours * 60 * 60 * 1000);
            console.log(`[KeepAlive] ✅ Full worker dyno restart every ${restartHours}h (supervisor mode)`);
        }
    } else if (waHost && restartHours > 0) {
        scheduleAutoRestart(restartHours * 60 * 60 * 1000);
    } else if (restartHours <= 0) {
        console.log('[KeepAlive] Bot memory restart disabled (BOT_RESTART_HOURS=0)');
    }

    const appUrl = getAppUrl();
    if (appUrl) {
        const waNote = waHost ? 'WA socket wake every 90s' : 'website ping only (no WhatsApp on this dyno)';
        console.log(`[KeepAlive] 🔄 Started — pinging ${appUrl} every 8 min | ${waNote}`);
    } else {
        console.log('[KeepAlive] ⚠️  Started but NO APP_URL detected.');
        console.log('[KeepAlive] 👉 Config Vars mein APP_URL=https://your-app.com set karo');
    }

    // First ping 5 second baad
    setTimeout(selfPing, 5000);
}

function stopKeepAlive() {
    if (_timer) { clearInterval(_timer); _timer = null; }
    if (_noopTimer) { clearInterval(_noopTimer); _noopTimer = null; }
    _started = false;
    console.log('[KeepAlive] ⛔ Stopped.');
}

module.exports = {
    startKeepAlive,
    startBotChildKeepAlive,
    stopKeepAlive,
    getBotRestartHours,
    scheduleBotMemoryRestart,
    scheduleAutoRestart,
    sweepStaleWhatsAppSockets,
    backupAntideleteSessions,
    proactiveAntideleteWake,
};
