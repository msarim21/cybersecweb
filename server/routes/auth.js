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
    if (pwErrors.length > 0)
      return res.status(400).json({ error: `Password must contain: ${pwErrors.join(', ')}.` });

    const existing = await findUserByEmailOrUsername(email, username);
    if (existing) return res.status(409).json({ error: 'Username or email already taken.' });

    const user = await createUser(username, email, password);

    const trialExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await setTrialExpiry(user.id, trialExpiry);

    const token = generateToken(user.id);
    res.status(201).json({
      token,
      user: {
        id:               user.id,
        username:         user.username,
        email:            user.email,
        role:             user.role,
        subscriptionPlan: user.subscription_plan,
        trialExpiresAt:   trialExpiry.toISOString(),
        createdAt:        user.created_at,
      },
    });
  } catch (err) {
    console.error('Signup error:', err.message);
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
        id:               user.id,
        username:         user.username,
        email:            user.email,
        role:             user.role,
        subscriptionPlan: user.subscription_plan,
        trialExpiresAt:   user.trial_expires_at || null,
        upgradeRequest:   user.upgrade_request || 'none',
        createdAt:        user.created_at,
      },
    });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Server error during login.' });
  }
});

module.exports = router;
