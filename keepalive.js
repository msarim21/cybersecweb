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
            const req = mod.get(url, { timeout: 12000 }, (res) => {
                res.resume();
                console.log(`[KeepAlive] ✅ ${url} → HTTP ${res.statusCode}`);
                resolve(true);
            });
            req.on('error', () => resolve(false));
            req.setTimeout(12000, () => { try { req.destroy(); } catch (_) {} resolve(false); });
        } catch (e) {
            resolve(false);
        }
    });
}

async function selfPing() {
    const appUrl = getAppUrl();
    if (!appUrl) return;

    const base = appUrl.replace(/\/$/, '');

    // Ping health endpoint first, fallback to root
    const ok = await ping(`${base}/api/health`);
    if (!ok) await ping(`${base}/`);
}

function startKeepAlive() {
    if (_started) return;
    _started = true;

    // Ping every 5 minutes — keeps Heroku eco dyno awake reliably
    _timer = setInterval(selfPing, 5 * 60 * 1000);

    // Keep Node.js event loop alive — prevents process exit on empty queue
    _noopTimer = setInterval(() => {}, 10 * 60 * 1000);

    console.log('[KeepAlive] 🔄 24/7 keep-alive started (ping every 5 min)');

    // First ping immediately after 5 seconds
    setTimeout(selfPing, 5000);
}

function stopKeepAlive() {
    if (_timer) { clearInterval(_timer); _timer = null; }
    if (_noopTimer) { clearInterval(_noopTimer); _noopTimer = null; }
    _started = false;
}

module.exports = { startKeepAlive, stopKeepAlive };
