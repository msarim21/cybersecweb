require('dotenv').config();

process.on('uncaughtException',  err => { console.error('[Server] Uncaught exception:', err.message); console.error('[Server] Stack:', err.stack); });
process.on('unhandledRejection', err => { console.error('[Server] Unhandled rejection:', err?.message || err); if (err?.stack) console.error('[Server] Stack:', err.stack); });

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

const authRoutes    = require('./routes/auth');
const userRoutes    = require('./routes/user');
const numbersRoutes = require('./routes/numbers');
const adminRoutes   = require('./routes/admin');
const pairingRoutes = require('./routes/pairing');

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
    ? ['*']
    : ['http://localhost:3000', 'http://localhost:5173'];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin)) {
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
  max: 150,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/api/health',
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
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many admin requests.' },
});

app.use('/api/',       globalLimiter);
app.use('/api/auth/',  authLimiter);
app.use('/api/admin/', adminLimiter);

// ── Security: Remove X-Powered-By header ──────────────────────────────────
app.disable('x-powered-by');

// ── Serve uploaded audio files ──────────────────────────────────────────────
const UPLOADS_DIR = path.join(__dirname, '../uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOADS_DIR));

// ── DB ready check middleware for API routes ────────────────────────────────
const requireDb = (req, res, next) => {
  if (!isDbReady()) {
    return res.status(503).json({
      error: 'Database not connected. Please set MONGO_URL or DATABASE_URL in Heroku config vars.',
    });
  }
  next();
};

// ── Public audio info endpoint (no auth required) ───────────────────────────
app.get('/api/site/audio', requireDb, async (req, res) => {
  try {
    const data     = await svc.getSiteSetting('site_audio_data');
    const original = await svc.getSiteSetting('site_audio_original');
    res.json({ filename: data ? 'db' : '', original: original || '' });
  } catch (err) {
    res.json({ filename: '', original: '' });
  }
});

// Stream audio file from database (no ephemeral filesystem dependency)
app.get('/api/site/audio/file', requireDb, async (req, res) => {
  try {
    const data     = await svc.getSiteSetting('site_audio_data');
    const mimetype = await svc.getSiteSetting('site_audio_mimetype');
    if (!data) return res.status(404).json({ error: 'No audio uploaded.' });
    const buf = Buffer.from(data, 'base64');
    res.set('Content-Type',   mimetype || 'audio/mpeg');
    res.set('Content-Length', buf.length);
    res.set('Accept-Ranges',  'bytes');
    res.set('Cache-Control',  'no-cache');
    res.send(buf);
  } catch (err) {
    res.status(500).json({ error: 'Failed to serve audio.' });
  }
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

// ── API routes ──────────────────────────────────────────────────────────────
app.use('/api/auth',    requireDb, authRoutes);
app.use('/api/user',    requireDb, userRoutes);
app.use('/api/numbers', requireDb, numbersRoutes);
app.use('/api/admin',   requireDb, adminRoutes);
app.use('/api/pairing', requireDb, pairingRoutes);

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
    setHeaders: (res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
    }
  }));
  app.get('*', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
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
const { startKeepAlive } = require('../keepalive');

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 CYBERSECPRO API running on port ${PORT}`);
  startKeepAlive();

});

initDb()
  .then(async () => {
    await ensureAdminAccount();
    console.log('✅ Database initialised successfully');

    setTimeout(async () => {
      try {
        const { autoLoadPairs } = require('../autoload');
        const result = await autoLoadPairs({ batchSize: 3 });
        console.log(`🔄 Sessions restored: ${result.successful}/${result.total}`);
      } catch (err) {
        console.error('⚠️  Session auto-load error:', err.message);
      }
    }, 5000);
  })
  .catch(err => {
    console.error('❌ Database connection failed:', err.message);
    console.error('   → Set MONGO_URL or DATABASE_URL in your Heroku config vars.');
    console.error('   → The website frontend is still running but API features are disabled.');
  });
