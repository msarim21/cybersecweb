'use strict';

const https = require('https');
const http = require('http');

let _timer = null;
let _noopTimer = null;
let _started = false;

function getAppUrl() {
    // Heroku: check multiple env vars
    if (process.env.APP_URL)                       return process.env.APP_URL;
    if (process.env.HEROKU_APP_NAME)               return `https://${process.env.HEROKU_APP_NAME}.herokuapp.com`;
    if (process.env.HEROKU_APP_DEFAULT_DOMAIN_NAME) return `https://${process.env.HEROKU_APP_DEFAULT_DOMAIN_NAME}`;
    if (process.env.RENDER_EXTERNAL_URL)            return process.env.RENDER_EXTERNAL_URL;
    if (process.env.RAILWAY_PUBLIC_DOMAIN)          return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
    // Replit
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
        console.log('[KeepAlive] ⚠️  APP_URL nahi mila! Heroku Config Vars mein APP_URL set karo.');
        // Still do a local noop so Node process stays warm
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
// Every 20 min: reconnect any bots whose WebSocket is silently dead but
// not yet detected by the per-session watchdog (handles Heroku network resets).
async function refreshBotSessions() {
    try {
        const pairMod = require('./pair');
        const { getActiveLinkedNumbers } = require('./session-db');
        const nums = await getActiveLinkedNumbers().catch(() => []);
        if (!nums || !nums.length) return;

        for (const n of nums) {
            const clean = String(n).replace(/[^0-9]/g, '');
            if (!clean) continue;
            const jid = clean + '@s.whatsapp.net';
            const tracker = global._rentbotTracker && global._rentbotTracker.get
                ? global._rentbotTracker.get(jid) || global._rentbotTracker.get(clean)
                : null;
            if (!tracker) continue; // not running — autoload handles it

            const ws = tracker.connection && tracker.connection.ws;
            const wsState = ws ? ws.readyState : -1;
            // readyState 3 = CLOSED, -1 = no ws
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
// global.stoppedBots is set only in the bot's index.js — not in the web server.
function isBotProcess() {
    return typeof global.stoppedBots !== 'undefined';
}

// ── Scheduled bot restart ─────────────────────────────────────────────────────
// Bot ko har 30 min baad gracefully restart karo taake memory leaks aur
// dead WhatsApp connections accumulate na hon. PM2 autorestart: true hai
// is liye process.exit(0) ke baad PM2 immediately restart kar deta hai.
function scheduledBotRestart() {
    if (!isBotProcess()) return; // web server mein restart mat karo
    console.log('[KeepAlive] 🔁 30-min scheduled restart — bot gracefully restarting...');
    setTimeout(() => {
        process.exit(0); // PM2 will auto-restart
    }, 2000);
}

function startKeepAlive() {
    if (_started) return;
    _started = true;

    // Website ping every 14 min — Heroku sleep threshold se pehle
    _timer = setInterval(selfPing, 14 * 60 * 1000);

    // Every 10 min: silently reconnect any dead WhatsApp sessions
    setInterval(refreshBotSessions, 10 * 60 * 1000);

    // Node.js event loop alive rakhne ke liye
    _noopTimer = setInterval(() => {}, 5 * 60 * 1000);

    // Bot restart every 30 min — sirf bot process mein
    if (isBotProcess()) {
        setInterval(scheduledBotRestart, 30 * 60 * 1000);
        console.log('[KeepAlive] 🔁 Bot auto-restart: every 30 min');
    }

    const appUrl = getAppUrl();
    if (appUrl) {
        console.log(`[KeepAlive] 🔄 Started — pinging ${appUrl} every 30 min`);
    } else {
        console.log('[KeepAlive] ⚠️  Started but NO APP_URL detected.');
        console.log('[KeepAlive] 👉 Heroku pe: heroku config:set APP_URL=https://your-app.herokuapp.com');
    }

    // First ping after 5 seconds
    setTimeout(selfPing, 5000);
}

function stopKeepAlive() {
    if (_timer) { clearInterval(_timer); _timer = null; }
    if (_noopTimer) { clearInterval(_noopTimer); _noopTimer = null; }
    _started = false;
    console.log('[KeepAlive] ⛔ Stopped.');
}

module.exports = { startKeepAlive, stopKeepAlive };
