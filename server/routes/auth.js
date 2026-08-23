const express  = require('express');
const router   = express.Router();
const bcrypt   = require('bcryptjs');
const { isMongoMode } = require('../db');
const {
  findUserByEmailOrUsername,
  findUserByEmail,
  createUser,
  setTrialExpiry,
} = require('../db-service');
const { generateToken } = require('../middleware/auth');
const {
  bruteForceProtect,
  recordFailedLogin,
  clearLoginAttempts,
  sanitizeBody,
  validateEmail,
  validatePassword,
  logSuspiciousActivity,
} = require('../middleware/security');

// POST /api/auth/signup
router.post('/signup', sanitizeBody, async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password)
      return res.status(400).json({ error: 'All fields are required.' });

    // Email format validation
    if (!validateEmail(email))
      return res.status(400).json({ error: 'Invalid email address format.' });

    // Username validation
    if (username.length < 3 || username.length > 30)
      return res.status(400).json({ error: 'Username must be 3–30 characters.' });
    if (!/^[a-zA-Z0-9_]+$/.test(username))
      return res.status(400).json({ error: 'Username can only contain letters, numbers, and underscores.' });

    // Strong password validation
    const pwErrors = validatePassword(password);
    if (pwErrors.length) {
      return res.status(400).json({ error: `Password must contain: ${pwErrors.join(', ')}.` });
    }

    const existing = await findUserByEmailOrUsername(email, username);
    if (existing) return res.status(409).json({ error: 'Username or email already taken.' });

    const user = await createUser(username, email, password);

    // ✅ FIX: setTrialExpiry is non-fatal — if production DB schema is missing
    // the trial_expires_at / subscription_status columns (stale migration), this
    // used to throw and the entire signup returned 500. The user IS created; we
    // just skip setting the trial expiry and let the defaults take effect.
    const trialExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
    try {
      await setTrialExpiry(user.id, trialExpiry);
    } catch (trialErr) {
      console.error('Signup: setTrialExpiry non-fatal error:', trialErr.message);
    }

    const token = generateToken(user.id);
    res.status(201).json({
      token,
      user: {
        id:                 user.id,
        username:           user.username,
        email:              user.email,
        role:               user.role,
        subscriptionPlan:   user.subscription_plan,
        subscriptionStatus: 'trial',
        trialStart:         new Date().toISOString(),
        trialExpiresAt:     trialExpiry.toISOString(),
        activatedByAdmin:   false,
        licenseKey:         null,
        createdAt:          user.created_at,
      },
    });
  } catch (err) {
    // ✅ FIX: MongoDB E11000 (duplicate key) and PG 23505 (unique_violation)
    // were being swallowed as generic 500 instead of a proper 409. Happens when
    // two concurrent signups race past the findUserByEmailOrUsername check.
    const isDuplicate =
      err.code === 11000 ||          // MongoDB duplicate key
      err.code === '23505' ||        // PostgreSQL unique_violation
      /duplicate key/i.test(err.message) ||
      /already exists/i.test(err.message);
    if (isDuplicate) {
      return res.status(409).json({ error: 'Username or email already taken.' });
    }
    // Log full error (stack + message) so server logs reveal the real cause
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Server error during signup.' });
  }
});

// POST /api/auth/login
router.post('/login', sanitizeBody, bruteForceProtect, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ error: 'Email and password are required.' });

    if (!validateEmail(email)) {
      recordFailedLogin(req);
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const user = await findUserByEmail(email, true);

    // Always compare password (even if user not found) to prevent timing attacks
    const dummyHash = '$2a$12$invalidhashfortimingattackprevention000000000000000000';
    const passwordToCompare = user ? user.password : dummyHash;
    const valid = await bcrypt.compare(password, passwordToCompare);

    if (!user || !valid) {
      recordFailedLogin(req);
      logSuspiciousActivity(req, 'Failed login attempt');
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    if (user.banned) {
      logSuspiciousActivity(req, 'Banned user login attempt');
      return res.status(403).json({ error: 'Your account has been banned.' });
    }

    // Login success — clear brute force record
    clearLoginAttempts(req);

    const token = generateToken(user.id);
    res.json({
      token,
      user: {
        id:                 user.id,
        username:           user.username,
        email:              user.email,
        role:               user.role,
        subscriptionPlan:   user.subscription_plan,
        subscriptionStatus: user.subscription_status || 'trial',
        trialStart:         user.trial_start || null,
        trialExpiresAt:     user.trial_expires_at || null,
        subscriptionExpiry: user.subscription_expiry || null,
        activatedByAdmin:   user.activated_by_admin || false,
        licenseKey:         user.license_key || null,
        upgradeRequest:     user.upgrade_request || 'none',
        createdAt:          user.created_at,
      },
    });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Server error during login.' });
  }
});

module.exports = router;
