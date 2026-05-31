'use strict';

const https = require('https');
const http = require('http');

let _timer = null;
let _noopTimer = null;
let _started = false;
let _restartInProgress = false;

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

// ── Silent bot-session refresh ────────────────────────────────────────────────
// Every 10 min: reconnect dead sessions AND trigger full autoload if nothing loaded.
async function refreshBotSessions() {
    // Skip during 60-min restart — it handles reconnect itself
    if (_restartInProgress) return;

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

// ── Bot process detector ──────────────────────────────────────────────────────
function isBotProcess() {
    return typeof global.stoppedBots !== 'undefined';
}

// ── 60-min silent background bot restart ─────────────────────────────────────
// Sirf WhatsApp connections restart hoti hain — web server nahi rukta.
// Mode (self/public) automatically restore hota hai DB se har reconnect pe.
// User ko kuch dikhta nahi — background mein silently hota hai.
async function scheduledBotRestart() {
    // Sirf bot process mein chale — web-only process mein skip
    if (!isBotProcess()) return;

    // Agar restart pehle se chal raha hai to skip karo
    if (_restartInProgress) {
        console.log('[KeepAlive] ⏭️  60-min restart: already in progress, skipping this cycle.');
        return;
    }

    // Agar autoload chal raha hai to skip karo
    try {
        const { isRunning } = require('./autoload');
        if (typeof isRunning === 'function' && isRunning()) {
            console.log('[KeepAlive] ⏭️  60-min restart: autoload running, skipping this cycle.');
            return;
        }
    } catch (_) {}

    _restartInProgress = true;
    console.log('[KeepAlive] 🔄 60-min background restart shuru — WhatsApp sessions reload ho rahe hain...');

    try {
        // Step 1: Saare active sessions gracefully band karo
        const trackerMap = global._rentbotTracker;
        if (trackerMap && trackerMap.size > 0) {
            let pairMod = null;
            try { pairMod = require('./pair'); } catch (_) {}

            const jids = [...trackerMap.keys()];
            console.log(`[KeepAlive] 🛑 ${jids.length} session(s) band ho rahe hain...`);

            for (const jid of jids) {
                try {
                    if (pairMod && typeof pairMod.stopBot === 'function') {
                        pairMod.stopBot(jid);
                    }
                } catch (_) {}
            }

            // Sessions ko close hone ka waqt do
            await new Promise(r => setTimeout(r, 4000));

            // pair.js module cache clear karo taakay fresh instances banein
            try {
                const pairPath = require.resolve('./pair');
                delete require.cache[pairPath];
            } catch (_) {}
        }

        // Step 2: Tracker map clear karo (fresh start)
        if (trackerMap && typeof trackerMap.clear === 'function') {
            trackerMap.clear();
        }

        // Step 3: Thodi aur wait karo DB mode restore ke liye
        await new Promise(r => setTimeout(r, 2000));

        // Step 4: autoLoadPairs se sab reconnect karo
        // Har number ka mode AUTOMATIC DB se restore hoga (pair.js mein getBotMode() call hai)
        console.log('[KeepAlive] 🔌 autoLoadPairs chal rahi hai — mode DB se restore hoga...');
        const { autoLoadPairs } = require('./autoload');
        const result = await autoLoadPairs({ batchSize: 5 });

        console.log(`[KeepAlive] ✅ 60-min restart complete — ${result.successful || 0}/${result.total || 0} users reconnected`);

    } catch (err) {
        console.log(`[KeepAlive] ⚠️  60-min restart mein error: ${err.message}`);

        // Error pe bhi reconnect try karo
        try {
            await new Promise(r => setTimeout(r, 3000));
            const { autoLoadPairs } = require('./autoload');
            autoLoadPairs({ batchSize: 3 }).catch(() => {});
        } catch (_) {}
    } finally {
        _restartInProgress = false;
    }
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

function startKeepAlive() {
    if (_started) return;
    _started = true;

    // Website ping every 14 min — hosting platform sleep se bachao
    _timer = setInterval(selfPing, 14 * 60 * 1000);

    // Every 10 min: dead sessions silently reconnect karo
    setInterval(refreshBotSessions, 10 * 60 * 1000);

    // Har 60 min: background mein WhatsApp connections silently restart
    // Web server nahi rukta — sirf bot sessions reload hote hain
    // Mode (self/public) DB se automatically restore hota hai
    setInterval(scheduledBotRestart, 60 * 60 * 1000);

    // Node.js event loop alive rakhne ke liye
    _noopTimer = setInterval(() => {}, 5 * 60 * 1000);

    // Prince AI APIs warmup — every 20 min warm raho
    warmupPrinceAPIs();
    setInterval(warmupPrinceAPIs, 20 * 60 * 1000);

    const appUrl = getAppUrl();
    if (appUrl) {
        console.log(`[KeepAlive] 🔄 Started — pinging ${appUrl} every 14 min | bot restart every 60 min`);
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
