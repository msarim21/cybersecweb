// ============================================================
// CYBERSECPRO — Security Middleware
// Brute force protection + XSS prevention + Input sanitization
// ============================================================

const loginAttempts = new Map();

const BRUTE_CONFIG = {
  maxAttempts: 5,
  lockoutMs: 15 * 60 * 1000,
  cleanupMs: 60 * 60 * 1000,
};

setInterval(() => {
  const now = Date.now();
  for (const [key, data] of loginAttempts.entries()) {
    if (now - data.lastAttempt > BRUTE_CONFIG.cleanupMs) {
      loginAttempts.delete(key);
    }
  }
}, BRUTE_CONFIG.cleanupMs);

const getClientKey = (req) => {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const email = req.body?.email || '';
  return `${ip}:${email.toLowerCase().trim()}`;
};

const bruteForceProtect = (req, res, next) => {
  const key = getClientKey(req);
  const record = loginAttempts.get(key) || { count: 0, lastAttempt: 0, lockedUntil: 0 };

  if (record.lockedUntil && Date.now() < record.lockedUntil) {
    const remaining = Math.ceil((record.lockedUntil - Date.now()) / 1000 / 60);
    return res.status(429).json({
      error: `Too many failed attempts. Account temporarily locked. Try again in ${remaining} minute(s).`,
    });
  }

  req._bruteKey = key;
  next();
};

const recordFailedLogin = (req) => {
  const key = req._bruteKey || getClientKey(req);
  const record = loginAttempts.get(key) || { count: 0, lastAttempt: 0, lockedUntil: 0 };

  record.count += 1;
  record.lastAttempt = Date.now();

  if (record.count >= BRUTE_CONFIG.maxAttempts) {
    record.lockedUntil = Date.now() + BRUTE_CONFIG.lockoutMs;
    record.count = 0;
    console.warn(`[SECURITY] Account locked after ${BRUTE_CONFIG.maxAttempts} failed attempts: ${key}`);
  }

  loginAttempts.set(key, record);
};

const clearLoginAttempts = (req) => {
  const key = req._bruteKey || getClientKey(req);
  loginAttempts.delete(key);
};

const XSS_PATTERNS = [
  /<script[\s\S]*?>/i,
  /javascript:/i,
  /on\w+\s*=/i,
  /<iframe/i,
  /<object/i,
  /<embed/i,
  /eval\s*\(/i,
  /document\.cookie/i,
  /window\.location/i,
  /\$\{.*\}/,
];

const SQLI_PATTERNS = [
  /('\s*(or|and)\s*'?\d)/i,
  /(;\s*drop\s+table)/i,
  /(union\s+select)/i,
  /(insert\s+into)/i,
  /(exec\s*\()/i,
  /(-{2})/,
];

const sanitizeString = (str) => {
  if (typeof str !== 'string') return str;
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
    .trim();
};

const isCleanInput = (value) => {
  if (typeof value !== 'string') return true;
  for (const pattern of [...XSS_PATTERNS, ...SQLI_PATTERNS]) {
    if (pattern.test(value)) return false;
  }
  return true;
};

const sanitizeBody = (req, res, next) => {
  if (!req.body || typeof req.body !== 'object') return next();

  for (const [key, value] of Object.entries(req.body)) {
    if (typeof value === 'string') {
      if (!isCleanInput(value)) {
        console.warn(`[SECURITY] Suspicious input blocked from IP ${req.ip} — field: ${key}`);
        return res.status(400).json({ error: 'Invalid characters detected in request.' });
      }
    }
  }

  next();
};

const validateEmail = (email) => {
  const emailRegex = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email) && email.length <= 254;
};

const validatePassword = (password) => {
  const errors = [];
  if (password.length < 8) errors.push('at least 8 characters');
  if (!/[A-Z]/.test(password)) errors.push('one uppercase letter');
  if (!/[0-9]/.test(password)) errors.push('one number');
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) errors.push('one special character (!@#$%...)');
  return errors;
};

const logSuspiciousActivity = (req, action) => {
  const ip = req.ip || 'unknown';
  const ua = req.headers['user-agent'] || 'unknown';
  console.warn(`[SECURITY] ${action} | IP: ${ip} | UA: ${ua} | Path: ${req.path} | ${new Date().toISOString()}`);
};

module.exports = {
  bruteForceProtect,
  recordFailedLogin,
  clearLoginAttempts,
  sanitizeBody,
  validateEmail,
  validatePassword,
  logSuspiciousActivity,
  sanitizeString,
};
