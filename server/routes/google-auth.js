const express = require('express');
const router  = express.Router();
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const crypto = require('crypto');
const { generateToken } = require('../middleware/auth');
const {
  findUserById,
  findUserByEmail,
  findUserByGoogleId,
  createUser,
  setUserGoogleId,
  setTrialExpiry,
} = require('../db-service');

const GOOGLE_CLIENT_ID     = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID:     GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    callbackURL:  '/api/auth/google/callback',
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      const email    = profile.emails?.[0]?.value;
      const googleId = profile.id;
      const name     = profile.displayName || email?.split('@')[0] || 'user';

      if (!email) return done(null, false, { message: 'No email from Google' });

      let user = await findUserByGoogleId(googleId);

      if (!user) {
        user = await findUserByEmail(email);
        if (user) {
          await setUserGoogleId(user.id, googleId);
          user.google_id = googleId;
        }
      }

      if (!user) {
        const suffix = crypto.randomBytes(3).toString('hex');
        const username = `${name.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20) || 'user'}_${suffix}`;
        const dummyPw  = crypto.randomBytes(32).toString('base64url');
        const newUser  = await createUser(username, email, dummyPw);
        await setUserGoogleId(newUser.id, googleId);

        const trialExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await setTrialExpiry(newUser.id, trialExpiry);

        user = { ...newUser, google_id: googleId, trial_expires_at: trialExpiry };
      }

      if (user.banned) return done(null, false, { message: 'Account banned' });
      done(null, user);
    } catch (err) { done(err, null); }
  }));

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id, done) => {
    try { const user = await findUserById(id); done(null, user); }
    catch (err) { done(err, null); }
  });
}

// GET /api/auth/google — redirect to Google
router.get('/google',
  (req, res, next) => {
    if (!GOOGLE_CLIENT_ID) return res.status(503).json({ error: 'Google OAuth not configured' });
    next();
  },
  passport.authenticate('google', { scope: ['profile', 'email'], prompt: 'select_account' })
);

// GET /api/auth/google/callback
router.get('/google/callback',
  (req, res, next) => {
    if (!GOOGLE_CLIENT_ID) return res.status(503).json({ error: 'Google OAuth not configured' });
    next();
  },
  passport.authenticate('google', { session: false, failureRedirect: '/login?error=google_failed' }),
  (req, res) => {
    const user = req.user;
    const token = generateToken(user.id);
    const userData = {
      id: user.id, username: user.username, email: user.email, role: user.role,
      subscriptionPlan: user.subscription_plan, trialExpiresAt: user.trial_expires_at || null,
      licenseKey: user.license_key || null, upgradeRequest: user.upgrade_request || 'none',
      createdAt: user.created_at,
    };
    const base = process.env.FRONTEND_URL || (req.get('origin') || `${req.protocol}://${req.get('host')}`);
    const url = base.replace(/\/$/, '') + '/login?google_token=' + encodeURIComponent(token) + '&google_user=' + encodeURIComponent(JSON.stringify(userData));
    res.redirect(url);
  }
);

module.exports = router;
