'use strict';

const https = require('https');
const http = require('http');

let _timer = null;
let _noopTimer = null;
let _started = false;

function getAppUrl() {
    return process.env.RENDER_EXTERNAL_URL ||
           process.env.APP_URL ||
           (process.env.HEROKU_APP_NAME ? `https://${process.env.HEROKU_APP_NAME}.herokuapp.com` : null) ||
           (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null) ||
           null;
}

function ping(url) {
    return new Promise((resolve) => {
        try {
            const mod = url.startsWith('https') ? https : http;
            const req = mod.get(url, { timeout: 15000 }, (res) => {
                res.resume();
                console.log(`[KeepAlive] ✅ ${url} → HTTP ${res.statusCode}`);
                resolve(true);
            });
            req.on('error', (e) => {
                console.log(`[KeepAlive] ⚠️  ${url} → ${e.message}`);
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
        console.log('[KeepAlive] ⚠️  Heroku par APP_URL set nahi hai!');
        console.log('[KeepAlive] 💡 Heroku Config Vars mein add karo: APP_URL = https://yourappname.herokuapp.com');
        return;
    }

    const base = appUrl.replace(/\/$/, '');

    // Primary: ping lightweight /api/ping (no DB needed, instant response)
    const ok = await ping(`${base}/api/ping`);
    // Fallback: ping /api/health, then root
    if (!ok) {
        const ok2 = await ping(`${base}/api/health`);
        if (!ok2) await ping(`${base}/`);
    }

    // Also ping any additional URLs set in EXTRA_PING_URLS (comma-separated)
    const extra = process.env.EXTRA_PING_URLS;
    if (extra) {
        for (const url of extra.split(',').map(u => u.trim()).filter(Boolean)) {
            await ping(url);
        }
    }
}

function startKeepAlive() {
    if (_started) return;
    _started = true;

    // Ping every 20 minutes — Heroku sleeps after 30 min, so 20 min is safe margin
    _timer = setInterval(selfPing, 20 * 60 * 1000);

    // Keep Node.js event loop alive — prevents process exit on empty queue
    _noopTimer = setInterval(() => {}, 10 * 60 * 1000);

    const appUrl = getAppUrl();
    if (appUrl) {
        console.log(`[KeepAlive] 🔄 Started — pinging ${appUrl} every 20 min (Heroku dyno stays awake)`);
    } else {
        console.log('[KeepAlive] ⚠️  Started but NO APP_URL — set APP_URL in Heroku Config Vars!');
    }

    // First ping after 5 seconds (give server time to fully start)
    setTimeout(selfPing, 5000);
}

function stopKeepAlive() {
    if (_timer) { clearInterval(_timer); _timer = null; }
    if (_noopTimer) { clearInterval(_noopTimer); _noopTimer = null; }
    _started = false;
    console.log('[KeepAlive] ⛔ Stopped.');
}

module.exports = { startKeepAlive, stopKeepAlive };
