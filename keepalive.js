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
    return process.env.WHATSAPP_WORKER === '1' || process.env.DYNO?.startsWith('worker');
}

// ── Full memory cleanup before scheduled restart ─────────────────────────────
function cleanupBotMemory() {
    try {
        if (global._antideleteStore?.clear) global._antideleteStore.clear();
        if (global._antieditStore?.clear) global._antieditStore.clear();
        if (global._statusCache?.clear) global._statusCache.clear();
        if (global._processedMsgIds?.clear) global._processedMsgIds.clear();
        global._lastViewOnce = {};
        global._pcMemCache = null;
        global._antideleteConfigs = {};
        global._antieditConfigs = {};
        const tmpDir = path.join(__dirname, 'tmp', 'antidelete_media');
        if (fs.existsSync(tmpDir)) {
            for (const f of fs.readdirSync(tmpDir)) {
                try { fs.unlinkSync(path.join(tmpDir, f)); } catch (_) {}
            }
        }
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

function startKeepAlive() {
    if (_started) return;
    _started = true;

    // Website ping every 14 min — hosting platform sleep se bachao
    _timer = setInterval(selfPing, 14 * 60 * 1000);

    // Every 10 min: dead sessions silently reconnect karo
    setInterval(refreshBotSessions, 10 * 60 * 1000);

    // Node.js event loop alive rakhne ke liye
    _noopTimer = setInterval(() => {}, 5 * 60 * 1000);

    // Prince AI APIs warmup — every 20 min warm raho
    warmupPrinceAPIs();
    setInterval(warmupPrinceAPIs, 20 * 60 * 1000);

    // 3-hour auto-restart for speed & fresh memory
    scheduleAutoRestart();

    const appUrl = getAppUrl();
    if (appUrl) {
        console.log(`[KeepAlive] 🔄 Started — pinging ${appUrl} every 14 min | dead session reconnect every 10 min`);
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

module.exports = { startKeepAlive, stopKeepAlive };
