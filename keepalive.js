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

const WA_STALE_MS = Number(process.env.WA_STALE_MS) || 2 * 60 * 1000;
const WA_ZOMBIE_MS = Number(process.env.WA_ZOMBIE_MS) || 45 * 60 * 1000;

/** Persist antidelete RAM → disk → Mongo so dyno restarts don't lose cache */
async function backupAntideleteSessions() {
    try {
        const trackerMap = global._rentbotTracker;
        if (!trackerMap?.size) return;
        const { getAntideleteSession } = require('./allfunc/antidelete-session');
        for (const [key, tracker] of trackerMap.entries()) {
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
    const trackerMap = global._rentbotTracker;
    if (!trackerMap?.size) return;

    let pairMod;
    let ensureHot;
    try {
        pairMod = require('./pair');
        ensureHot = require('./allfunc/socket-wake').ensureWhatsAppSocketHot;
    } catch (_) { return; }

    for (const [key, tracker] of trackerMap.entries()) {
        if (!tracker || tracker.disconnected) continue;
        const nexus = tracker.connection;
        if (!nexus?.user) continue;

        const clean = String(key).replace(/[^0-9]/g, '');
        const jid = key.includes('@') ? key : (clean ? `${clean}@s.whatsapp.net` : '');
        if (!jid) continue;

        const lastWa = tracker.lastWAMessage || tracker.lastActivity || 0;
        const silentMs = Date.now() - lastWa;
        const wsState = nexus.ws?.readyState ?? -1;

        if (wsState === 3 || wsState === -1) {
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
            const failLimit = zombie ? 1 : 2;
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
        const nums = await getActiveLinkedNumbers().catch(() => []);
        if (!nums || !nums.length) return;

        const trackerMap = global._rentbotTracker;
        const trackerSize = (trackerMap && typeof trackerMap.size === 'number') ? trackerMap.size : -1;

        // If tracker is empty but DB has linked numbers → initial autoload failed
        if (trackerSize === 0 || trackerSize === -1) {
            console.log(`[KeepAlive] 🔄 Tracker empty but DB has ${nums.length} number(s) — triggering autoload...`);
            try {
                const { syncStoppedWithLinkedNumbers } = require('./allfunc/stopped-bots');
                await syncStoppedWithLinkedNumbers();
                const { autoLoadPairs } = require('./autoload');
                autoLoadPairs({ batchSize: 3 }).catch(() => {});
            } catch (_) {}
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

// ── Auto-restart every 3 hours ────────────────────────────────────────────────
// process.exit(0) = clean exit → platform restarts dyno with fresh memory.
const AUTO_RESTART_MS = 3 * 60 * 60 * 1000; // 3 hours

function scheduleAutoRestart() {
    const warnings = [
        { before: 10 * 60 * 1000, label: '10 minutes' },
        { before:  5 * 60 * 1000, label: '5 minutes'  },
        { before:  1 * 60 * 1000, label: '1 minute'   },
    ];
    const restartAt = Date.now() + AUTO_RESTART_MS;

    for (const w of warnings) {
        const fireAt = AUTO_RESTART_MS - w.before;
        if (fireAt > 0) {
            setTimeout(() => {
                console.log(`[AutoRestart] ⏰ Bot & website ${w.label} mein restart hoga`);
            }, fireAt);
        }
    }

    setTimeout(() => {
        console.log('[AutoRestart] 🔄 3-hour auto-restart — full memory cleanup. Restarting now...');
        cleanupBotMemory();
        setTimeout(() => process.exit(0), 500);
    }, AUTO_RESTART_MS);

    const nextStr = new Date(restartAt).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', hour12: true });
    console.log(`[AutoRestart] ✅ Scheduled — fresh restart at ${nextStr} (every 3 hours)`);
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

/** Isolated bot child — wake idle WA socket + event loop (no dyno auto-restart) */
function startBotChildKeepAlive() {
    if (_started) return;
    _started = true;
    _noopTimer = setInterval(() => {}, 5 * 60 * 1000);
    setTimeout(() => sweepStaleWhatsAppSockets().catch(() => {}), 20_000);
    setInterval(() => sweepStaleWhatsAppSockets().catch(() => {}), 90 * 1000);
    setInterval(() => proactiveSocketLightWake().catch(() => {}), 60 * 1000);
    setInterval(() => proactiveAntideleteWake().catch(() => {}), 4 * 60 * 1000);
    setInterval(() => backupAntideleteSessions().catch(() => {}), 10 * 60 * 1000);
}

function startKeepAlive() {
    if (_started) return;
    _started = true;

    // Website ping every 8 min — Heroku Eco sleeps ~30min without HTTP traffic
    _timer = setInterval(selfPing, 8 * 60 * 1000);

    // Every 90s: wake idle WA sockets + dead session reconnect
    setInterval(async () => {
        await sweepStaleWhatsAppSockets().catch(() => {});
        await refreshBotSessions().catch(() => {});
    }, 90 * 1000);

    // Every 60s: light presence — prevents 1–2 min delay on first command after idle
    setInterval(() => proactiveSocketLightWake().catch(() => {}), 60 * 1000);

    // Every 4 min: heavy wake — antidelete disk/mongo refresh during long silence
    setInterval(() => proactiveAntideleteWake().catch(() => {}), 4 * 60 * 1000);

    // Every 10 min: flush antidelete cache to disk + Mongo (survives dyno restart)
    if (isWhatsAppWorker()) {
        setInterval(() => backupAntideleteSessions().catch(() => {}), 10 * 60 * 1000);
    }

    // Every 5 min: backup all connected sessions to DB (survives dyno restart)
    if (isWhatsAppWorker()) {
        setInterval(async () => {
            try {
                const { backupSessionFolder } = require('./session-db');
                const tracker = global._rentbotTracker;
                if (!tracker || !tracker.size) return;
                for (const [key, t] of tracker.entries()) {
                    if (!key.includes('@')) continue;
                    const ws = t?.connection?.ws;
                    if (!ws || ws.readyState !== 1) continue;
                    const clean = key.replace('@s.whatsapp.net', '').replace(/[^0-9]/g, '');
                    await backupSessionFolder(clean, require('path').join(__dirname, 'nexstore', 'pairing', key));
                }
            } catch (_) {}
        }, 5 * 60 * 1000);
    }

    // Node.js event loop alive rakhne ke liye
    _noopTimer = setInterval(() => {}, 5 * 60 * 1000);

    // Prince AI APIs warmup — every 20 min warm raho
    warmupPrinceAPIs();
    setInterval(warmupPrinceAPIs, 20 * 60 * 1000);

    // 3-hour auto-restart for speed & fresh memory
    scheduleAutoRestart();

    const appUrl = getAppUrl();
    if (appUrl) {
        console.log(`[KeepAlive] 🔄 Started — pinging ${appUrl} every 8 min | WA socket wake every 90s`);
    } else {
        console.log('[KeepAlive] ⚠️  Started but NO APP_URL detected.');
        console.log('[KeepAlive] 👉 Config Vars mein APP_URL=https://your-app.com set karo');
    }

    // First ping 5 second baad
    setTimeout(selfPing, 5000);
    setTimeout(() => sweepStaleWhatsAppSockets().catch(() => {}), 25_000);
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
    sweepStaleWhatsAppSockets,
    backupAntideleteSessions,
    proactiveAntideleteWake,
};
