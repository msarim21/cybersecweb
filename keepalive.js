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
        console.log('[KeepAlive] ⚠️  No APP_URL found. Set HEROKU_APP_NAME or APP_URL env var.');
        return;
    }

    const base = appUrl.replace(/\/$/, '');

    // Ping health endpoint — if it fails, ping root as fallback
    const ok = await ping(`${base}/api/health`);
    if (!ok) await ping(`${base}/`);

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

    // Ping every 14 minutes — keeps Heroku/Render dynos alive 24/7
    _timer = setInterval(selfPing, 14 * 60 * 1000);

    // Keep Node.js event loop alive — prevents process exit on empty queue
    _noopTimer = setInterval(() => {}, 10 * 60 * 1000);

    console.log('[KeepAlive] 🔄 24/7 keep-alive started (ping every 14 min — bot stays alive on Heroku)');

    // First ping immediately after 3 seconds
    setTimeout(selfPing, 3000);
}

function stopKeepAlive() {
    if (_timer) { clearInterval(_timer); _timer = null; }
    if (_noopTimer) { clearInterval(_noopTimer); _noopTimer = null; }
    _started = false;
    console.log('[KeepAlive] ⛔ Stopped.');
}

module.exports = { startKeepAlive, stopKeepAlive };
