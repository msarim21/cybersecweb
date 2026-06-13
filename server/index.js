require('dotenv').config();
const compression = require('compression');

// ── Crash Logging — detailed errors taake Heroku logs mein exact problem pata chale ──
process.on('uncaughtException', err => {
  console.error('');
  console.error('╔══════════════════════════════════════════════════╗');
  console.error('║         UNCAUGHT EXCEPTION (staying alive)       ║');
  console.error('╚══════════════════════════════════════════════════╝');
  console.error('Error   :', err.message);
  console.error('Stack   :', err.stack);
  console.error('Time    :', new Date().toISOString());
  console.error('');
});

process.on('unhandledRejection', (reason, promise) => {
  // Sirf log karo — exit mat karo. Server chalta rahe.
  console.error('');
  console.error('⚠️  UNHANDLED PROMISE REJECTION (server continues running)');
  console.error('   Reason :', reason?.message || reason);
  if (reason?.stack) console.error('   Stack  :', reason.stack);
  console.error('   Time   :', new Date().toISOString());
  console.error('');
});

// ── Startup Diagnostics — Heroku logs mein dikh jaega kya set hai kya nahi ──
(function printStartupDiagnostics() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║           CYBERSECPRO — STARTUP CHECK            ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('Node.js  :', process.version);
  console.log('Env      :', process.env.NODE_ENV || 'development');
  console.log('Port     :', process.env.PORT || '3001 (default)');
  console.log('');

  const checks = [
    { key: 'MONGO_URL',          label: 'MongoDB URL',          required: false },
    { key: 'DATABASE_URL',       label: 'PostgreSQL URL',       required: false },
    { key: 'JWT_SECRET',         label: 'JWT Secret',           required: true  },
    { key: 'TELEGRAM_BOT_TOKEN', label: 'Telegram Bot Token',   required: false },
    { key: 'ADMIN_EMAIL',        label: 'Admin Email',          required: false },
    { key: 'ADMIN_PASSWORD',     label: 'Admin Password',       required: false },
  ];

  let hasDatabase = !!(process.env.MONGO_URL || process.env.DATABASE_URL);
  let hasCriticalError = false;

  checks.forEach(({ key, label, required }) => {
    const val = process.env[key];
    if (val) {
      console.log(`  ✅ ${label.padEnd(22)} SET`);
    } else if (required) {
      console.error(`  ❌ ${label.padEnd(22)} MISSING — app will crash!`);
      hasCriticalError = true;
    } else {
      console.log(`  ⚠️  ${label.padEnd(22)} not set (optional)`);
    }
  });

  if (!hasDatabase) {
    console.error('  ❌ Database URL         MISSING — set MONGO_URL or DATABASE_URL in Heroku config vars!');
    hasCriticalError = true;
  }

  console.log('');
  if (hasCriticalError) {
    console.error('💥 Critical config missing — please set the above vars in Heroku Dashboard → Settings → Config Vars');
    console.error('   Then restart dynos.');
  } else {
    console.log('✅ All required config vars are set. Starting server...');
  }
  console.log('');
})();

const path          = require('path');
const fs            = require('fs');
const express       = require('express');
const cors          = require('cors');
const helmet        = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const rateLimit     = require('express-rate-limit');
const bcrypt        = require('bcryptjs');

const { initDb, isDbReady }  = require('./db');

// ── Security threat log (in-memory ring buffer, last 300 events) ───────────
global.securityThreats = global.securityThreats || [];
function logThreat({ type, severity, ip, path: p, detail }) {
  global.securityThreats.unshift({
    id:        Date.now() + '-' + Math.random().toString(36).slice(2,7),
    type,
    severity,
    ip:        ip || 'unknown',
    path:      p  || '',
    detail:    detail || '',
    timestamp: new Date().toISOString(),
  });
  if (global.securityThreats.length > 300) global.securityThreats.pop();
}
global.logThreat = logThreat;
const svc         = require('./db-service');
const { countAdmins, createUser, setAdminRole, findUserByEmail, findUserByEmailOrUsername } = require('./db-service');

const authRoutes     = require('./routes/auth');
const userRoutes     = require('./routes/user');
const numbersRoutes  = require('./routes/numbers');
const adminRoutes    = require('./routes/admin');
const pairingRoutes  = require('./routes/pairing');
const { startPlanExpiryJob } = require('./jobs/planExpiryJob');
const { protect: protectAuth, adminOnly } = require('./middleware/auth');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Trust proxy (for correct IP behind load balancer/Heroku) ───────────────
app.set('trust proxy', 1);

// ── Allowed origins (CORS) ─────────────────────────────────────────────────
// In production on Heroku, same-origin requests don't need CORS.
// We allow '*' if ALLOWED_ORIGINS is not explicitly set in production.
const isProduction = process.env.NODE_ENV === 'production';
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : isProduction
    ? [] // production: same-origin only unless explicitly configured
    : ['http://localhost:3000', 'http://localhost:5173'];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    // Allow same-host requests in production when ALLOWED_ORIGINS not set
    if (isProduction && ALLOWED_ORIGINS.length === 0) {
      return callback(null, true);
    }
    console.warn(`[SECURITY] CORS blocked request from origin: ${origin}`);
    logThreat({ type: 'CORS_VIOLATION', severity: 'MEDIUM', ip: 'proxy', path: '/', detail: `Blocked origin: ${origin}` });
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

// ── Compression — gzip/brotli for all responses (major speed boost) ────────
app.use(compression({ level: 6, threshold: 1024 }));

// ── Helmet — strong security headers ──────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      styleSrc:    ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'],
      fontSrc:     ["'self'", 'https://fonts.gstatic.com'],
      imgSrc:      ["'self'", 'data:', 'https:', 'blob:'],
      connectSrc:  ["'self'"],
      frameSrc:    ["'none'"],
      objectSrc:   ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  noSniff: true,
  frameguard: { action: 'deny' },
  xssFilter: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

// ── MongoDB injection protection ───────────────────────────────────────────
app.use(mongoSanitize({ replaceWith: '_' }));

// ── CORS ────────────────────────────────────────────────────────────────────
app.use(cors(corsOptions));

// ── Body parser with tight size limit ─────────────────────────────────────
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false, limit: '10kb' }));

// ── Global API rate limiter ────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    const p = req.originalUrl || req.url || '';
    if (p.startsWith('/api/health')) return true;
    // Status/code polling during pairing — must not count toward global cap
    if (req.method === 'GET' && /\/api\/pairing\/(status|code)\//.test(p)) return true;
    return false;
  },
  handler: (req, res) => {
    logThreat({ type: 'RATE_LIMIT_EXCEEDED', severity: 'MEDIUM', ip: req.ip, path: req.path, detail: 'Global rate limit hit' });
    res.status(429).json({ error: 'Too many requests. Please try again later.' });
  },
});

// ── Auth rate limiter — tighter (10 per 15 min) ───────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logThreat({ type: 'BRUTE_FORCE', severity: 'HIGH', ip: req.ip, path: req.path, detail: 'Auth rate limit exceeded — possible brute force' });
    res.status(429).json({ error: 'Too many login attempts. Please wait 15 minutes.' });
  },
});

// ── Admin rate limiter ─────────────────────────────────────────────────────
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many admin requests.' },
});

app.use('/api/',       globalLimiter);
app.use('/api/auth/',  authLimiter);
app.use('/api/admin/', adminLimiter);

// ── Security: Remove X-Powered-By header ──────────────────────────────────
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

// Block common exploit/scanner paths
app.use((req, res, next) => {
  const p = (req.path || '').toLowerCase();
  const blocked = ['/.env', '/wp-admin', '/wp-login', '/phpmyadmin', '/.git', '/config.php', '/admin.php', '/shell'];
  if (blocked.some(b => p.includes(b))) {
    logThreat({ type: 'SCANNER_BLOCK', severity: 'HIGH', ip: req.ip, path: req.path, detail: 'Blocked scanner path' });
    return res.status(404).json({ error: 'Not found.' });
  }
  next();
});

// ── Uploads directory ────────────────────────────────────────────────────────
const UPLOADS_DIR = path.join(__dirname, '../uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOADS_DIR));

// ── DB ready check middleware for API routes ─────────────────────────────────
const requireDb = async (req, res, next) => {
  if (!isDbReady()) {
    try {
      await initDb();
    } catch (err) {
      console.error('[requireDb] initDb failed:', err.message);
    }
  }
  if (!isDbReady()) {
    return res.status(503).json({
      error: 'Database temporarily unavailable. Retrying in a moment…',
      retry: true,
    });
  }
  next();
};

// ══════════════════════════════════════════════════════════════════════════════
// AUDIO SYSTEM — PostgreSQL/MongoDB (survives Heroku dyno restart & refresh)
// Admin upload: POST /api/admin/audio via server/routes/admin.js
// ══════════════════════════════════════════════════════════════════════════════
const audioStore = require('./audio-store');

app.get('/api/site/audio', async (req, res) => {
  try {
    if (!isDbReady()) return res.json({ filename: '', original: '' });
    const meta = await audioStore.getAudioMeta();
    res.json(meta);
  } catch {
    res.json({ filename: '', original: '' });
  }
});

app.get('/api/site/audio/file', async (req, res) => {
  try {
    if (!isDbReady()) return res.status(404).json({ error: 'No audio uploaded.' });
    const meta = await audioStore.getAudioMeta();
    if (!meta?.filename) return res.status(404).json({ error: 'No audio uploaded.' });
    const buffer = await audioStore.loadAudioBuffer();
    if (!buffer?.length) return res.status(404).json({ error: 'Audio file not found.' });
    const contentType = await audioStore.getAudioMimetype();
    audioStore.streamAudioBuffer(res, buffer, contentType, req.headers.range);
  } catch (err) {
    console.error('[Audio] stream error:', err.message);
    res.status(500).json({ error: 'Audio playback failed.' });
  }
});

// ── Public Broadcast Message ─────────────────────────────────────────────────
app.get('/api/site/broadcast', requireDb, async (req, res) => {
  try {
    const raw = await svc.getSiteSetting('broadcast_message');
    if (!raw) return res.json({ active: false });
    const data = JSON.parse(raw);
    res.json({ active: true, ...data });
  } catch { res.json({ active: false }); }
});

// ── Suspicious payload detector (SQLi / XSS) ──────────────────────────────
const SQLI_RE = /('|-{2}|;\s*(select|drop|insert|update|delete|exec)|union\s+select|xp_|char\s*\(|0x[0-9a-f]{4,})/i;
const XSS_RE  = /<script|javascript:|on(error|load|click)\s*=|eval\s*\(|document\.cookie/i;
app.use((req, _res, next) => {
  const raw = [req.originalUrl, JSON.stringify(req.body || {}), JSON.stringify(req.query || {})].join(' ');
  if (SQLI_RE.test(raw)) {
    logThreat({ type: 'SQL_INJECTION', severity: 'CRITICAL', ip: req.ip, path: req.path, detail: `SQLi in ${req.method} ${req.originalUrl}` });
  } else if (XSS_RE.test(raw)) {
    logThreat({ type: 'XSS_ATTEMPT', severity: 'HIGH', ip: req.ip, path: req.path, detail: `XSS in ${req.method} ${req.originalUrl}` });
  }
  next();
});

// ── First-run setup endpoints (works ONLY when no admin exists) ─────────────
app.get('/api/setup/status', requireDb, async (req, res) => {
  try {
    const adminCount = await countAdmins();
    res.json({ needsSetup: adminCount === 0 });
  } catch (err) {
    res.status(500).json({ error: 'Could not check setup status.' });
  }
});

app.post('/api/setup', requireDb, async (req, res) => {
  try {
    const adminCount = await countAdmins();
    if (adminCount > 0) {
      return res.status(403).json({ error: 'Setup already completed. Admin account exists.' });
    }
    const { username, email, password } = req.body;
    if (!username || !email || !password)
      return res.status(400).json({ error: 'Username, email and password are required.' });
    if (password.length < 6)
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    const existing = await findUserByEmailOrUsername(email, username);
    if (existing) return res.status(409).json({ error: 'Username or email already taken.' });
    const user = await createUser(username, email, password);
    await setAdminRole(user.id);
    console.log(`✅ First-run admin created: ${email}`);
    res.status(201).json({ success: true, message: 'Admin account created. You can now login.' });
  } catch (err) {
    console.error('Setup error:', err.message);
    res.status(500).json({ error: 'Server error during setup.' });
  }
});

// ── API routes ────────────────────────────────────────────────────
app.use('/api/auth',    requireDb, authRoutes);
app.use('/api/user',    requireDb, userRoutes);
app.use('/api/numbers', requireDb, numbersRoutes);
app.use('/api/admin',   requireDb, adminRoutes);
app.use('/api/pairing', requireDb, pairingRoutes);

// ── Ultra-lightweight ping — no DB needed, used by keepalive self-pinger ────
app.get('/api/ping', (req, res) => {
  res.json({ ok: true, t: Date.now() });
});

app.get('/api/health', (req, res) => {
  // Count active WhatsApp sessions from nexstore/pairing
  let sessionCount = 0;
  try {
    const pairingDir = path.join(__dirname, '../nexstore/pairing');
    if (fs.existsSync(pairingDir)) {
      sessionCount = fs.readdirSync(pairingDir, { withFileTypes: true })
        .filter(d => d.isDirectory() && d.name.endsWith('@s.whatsapp.net'))
        .length;
    }
  } catch (_) {}

  const uptimeSec = Math.floor(process.uptime());
  const hrs  = Math.floor(uptimeSec / 3600);
  const mins = Math.floor((uptimeSec % 3600) / 60);
  const secs = uptimeSec % 60;
  const uptime = `${hrs}h ${mins}m ${secs}s`;

  res.json({
    status: 'online',
    app: 'CYBERSECPRO',
    db: isDbReady() ? (process.env.MONGO_URL ? 'MongoDB' : 'PostgreSQL') : 'disconnected',
    sessions: sessionCount,
    uptime,
    timestamp: new Date().toISOString(),
  });
});

// ── 404 handler ─────────────────────────────────────────────────────────────
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found.' });
});

// ── Global error handler ────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'CORS policy violation.' });
  }
  console.error('[Server Error]', err.message);
  res.status(500).json({ error: 'Internal server error.' });
});

// ── Serve compiled React frontend (production) ──────────────────────────────
const clientDist = path.join(__dirname, '../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist, {
    maxAge: '7d',
    setHeaders: (res, filePath) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      // Never cache index.html — browser must always fetch fresh
      if (filePath.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }
    }
  }));
  app.get('*', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.join(clientDist, 'index.html'));
  });
} else {
  console.warn('⚠️  client/dist not found — frontend will not be served. Run the build step first.');
}

// ── Auto-create admin from env vars ────────────────────────────────────────
async function ensureAdminAccount() {
  const email    = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return;

  try {
    let user = await svc.findUserByEmail(email);
    if (!user) {
      let username = email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '').slice(0, 28) || 'admin';
      const existing = await svc.findUserByUsername(username, null);
      if (existing) username = username + '_admin';

      user = await svc.createUser(username, email, password);
      console.log(`✅ Admin account created: ${email} (username: ${username})`);
    } else {
      // Always sync the password from env var so changing ADMIN_PASSWORD takes effect
      await svc.updatePassword(user.id, password);
      console.log(`🔑 Admin password synced for: ${email}`);
    }
    if (user.role !== 'admin') {
      await svc.setAdminRole(user.id);
      console.log(`✅ Admin role granted to: ${email}`);
    }
  } catch (err) {
    console.error('⚠️  Admin auto-create failed:', err.message);
  }
}

// ── Warn if JWT_SECRET is weak/default ─────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || '';
if (!JWT_SECRET || JWT_SECRET.includes('default') || JWT_SECRET.length < 32) {
  console.warn('⚠️  [SECURITY] JWT_SECRET is weak or not set! Set a strong random secret in your Heroku config vars.');
}

// ── Boot sequence ───────────────────────────────────────────────────────────
// Start server immediately so Heroku's health check passes,
// then connect to the database in the background.
const { startKeepAlive, stopKeepAlive } = require('../keepalive');

const server = app.listen(PORT, '0.0.0.0', () => {
  // ── Server-level timeout — audio upload jaise bade requests ke liye ──
  // Default Node.js timeout 120s hai; hum 10 min karte hain.
  // Audio upload route apna timeout khud 0 (unlimited) set karta hai.
  server.timeout = 10 * 60 * 1000;        // 10 minutes
  server.keepAliveTimeout = 65000;         // Heroku load balancer ke saath sync
  server.headersTimeout   = 66000;         // keepAliveTimeout se thoda zyada

  console.log(`🚀 CYBERSECPRO API running on port ${PORT}`);
  if (!process.env.DYNO?.startsWith('web')) startKeepAlive();

  // Start Telegram bot (OPTIONAL — only if TELEGRAM_BOT_TOKEN is set)
  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_TOKEN.trim() !== '') {
    try {
      require("../bot");
      console.log("✅ Telegram bot started successfully");
    } catch (err) {
      console.error("⚠️  Telegram bot failed to start:", err.message);
    }
  } else {
    console.log("ℹ️  Telegram bot disabled — set TELEGRAM_BOT_TOKEN env var to enable");
  }

    const { getWhatsAppHostDyno } = require('../allfunc/whatsapp-host');
    console.log(`ℹ️  WhatsApp host dyno: ${getWhatsAppHostDyno()} (WHATSAPP_HOST_DYNO env to override)`);

});

// ── Graceful shutdown (fixes Heroku R12 Exit Timeout error) ─────────────────
// Heroku sends SIGTERM before restarting/scaling. We must exit within 30 sec.
function gracefulShutdown(signal) {
  console.log(`[Shutdown] ${signal} received — shutting down gracefully...`);
  stopKeepAlive();
  server.close(() => {
    console.log('[Shutdown] HTTP server closed. Bye!');
    process.exit(0);
  });
  // Force exit after 20 seconds if server.close() hangs
  setTimeout(() => {
    console.error('[Shutdown] Forced exit after 20s timeout');
    process.exit(1);
  }, 20000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

initDb()
  .then(async () => {
    await ensureAdminAccount();
    console.log('✅ Database initialised successfully');

    try {
      const { startWhatsAppStack } = require('../worker/start-whatsapp');
      const { getWhatsAppHostDyno, shouldRunWhatsAppSupervisor } = require('../allfunc/whatsapp-host');
      if (startWhatsAppStack()) {
        console.log(`✅ WhatsApp bots started on web dyno (WHATSAPP_HOST_DYNO=${getWhatsAppHostDyno()})`);
      } else if (!shouldRunWhatsAppSupervisor()) {
        const { startKeepAlive } = require('../keepalive');
        startKeepAlive();
      }
    } catch (err) {
      console.log('ℹ️  WhatsApp supervisor on web:', err.message);
      try { require('../keepalive').startKeepAlive(); } catch (_) {}
    }

    // Start plan expiry auto-disconnect cron (every 60 seconds)
    startPlanExpiryJob(60_000);
    // Orphan disconnect runs on worker dyno only (worker.js)
  })
  .catch(err => {
    console.error('❌ Database connection failed:', err.message);
    console.error('   → Set MONGO_URL or DATABASE_URL in your Heroku config vars.');
    console.error('   → The website frontend is still running but API features are disabled.');
  });


