'use strict';

const https = require('https');
const http = require('http');

let _timer = null;
let _started = false;

function selfPing() {
    const appUrl = process.env.RENDER_EXTERNAL_URL ||
                   process.env.APP_URL ||
                   (process.env.HEROKU_APP_NAME ? `https://${process.env.HEROKU_APP_NAME}.herokuapp.com` : null) ||
                   (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null);

    if (!appUrl) return;

    const url = `${appUrl.replace(/\/$/, '')}/api/health`;
    const mod = url.startsWith('https') ? https : http;

    try {
        const req = mod.get(url, { timeout: 10000 }, (res) => {
            console.log(`[KeepAlive] ✅ Pinged ${url} → HTTP ${res.statusCode}`);
        });
        req.on('error', () => {});
        req.setTimeout(10000, () => { try { req.destroy(); } catch (_) {} });
    } catch (e) {}
}

function startKeepAlive() {
    if (_started) return;
    _started = true;

    // Ping every 25 minutes — prevents Render/Railway/Heroku from sleeping
    _timer = setInterval(selfPing, 25 * 60 * 1000);

    // Also keep Node.js alive with a no-op timer
    const _noopTimer = setInterval(() => {}, 60 * 60 * 1000);

    console.log('[KeepAlive] 🔄 24/7 keep-alive started (ping every 25 min)');

    // First ping after 10 seconds
    setTimeout(selfPing, 10000);
}

function stopKeepAlive() {
    if (_timer) { clearInterval(_timer); _timer = null; _started = false; }
}

module.exports = { startKeepAlive, stopKeepAlive };
