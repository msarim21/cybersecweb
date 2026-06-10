const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/auth');
const {
  getUserLinkedCount,
  countNumbersByOwner,
  findUserByUsername,
  updateUsername,
  requestUpgrade,
  getNumbersByOwner,
  findUserById,
  isPlanExpired,
  sendChatMessage,
  getChatMessages,
  markChatMessagesRead,
} = require('../db-service');

function getPlanLimit(plan) {
  if (plan === 'pro') return 5;
  if (plan === 'enterprise') return 999;
  return 1;
}

// GET /api/user/profile
router.get('/profile', protect, async (req, res) => {
  try {
    const user = await findUserById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    const linkedCount = await getUserLinkedCount(user.id);
    res.json({
      id:               user.id,
      username:         user.username,
      email:            user.email,
      role:             user.role,
      subscriptionPlan: user.subscription_plan,
      planExpiresAt:    user.plan_expires_at || null,
      planExpired:      isPlanExpired(user),
      licenseKey:       user.license_key || null,
      trialExpiresAt:   user.trial_expires_at || null,
      upgradeRequest:   user.upgrade_request || 'none',
      banned:           user.banned,
      createdAt:        user.created_at,
      lastActive:       user.last_active,
      linkedCount,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/user/profile
router.put('/profile', protect, async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'Username required.' });

    const existing = await findUserByUsername(username, req.user.id);
    if (existing) return res.status(409).json({ error: 'Username already taken.' });

    await updateUsername(req.user.id, username);
    res.json({ message: 'Profile updated.', username });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/user/stats
router.get('/stats', protect, async (req, res) => {
  try {
    const userId = req.user.id;
    const user   = await findUserById(userId);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    const plan   = user.subscription_plan;
    const limit  = getPlanLimit(plan);

    const trialExpiresAt = user.trial_expires_at || null;
    const trialExpired   = trialExpiresAt && new Date(trialExpiresAt) < new Date() && plan === 'free';

    const numbers = await getNumbersByOwner(userId, null);
    const total   = numbers.length;
    const active  = numbers.filter(n => n.status === 'active').length;

    res.json({
      total, active, inactive: total - active, plan, limit,
      planExpiresAt: user.plan_expires_at || null,
      planExpired:   isPlanExpired(user),
      trialExpiresAt,
      trialExpired: !!trialExpired,
      upgradeRequest: user.upgrade_request || 'none',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/user/license-key — get user's license key
router.get('/license-key', protect, async (req, res) => {
  try {
    const user = await findUserById(req.user.id);
    res.json({ licenseKey: user.license_key || null });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ──────────────────────────────────────────────────────────────────────────────────────────
// LIVE CHAT — USER ENDPOINTS
// ──────────────────────────────────────────────────────────────────────────────────────────

// POST /api/user/chat/send — user sends a message to admin
router.post('/chat/send', protect, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || !message.trim()) return res.status(400).json({ error: 'Message is required.' });
    const sent = await sendChatMessage(req.user.id, 'user', message);
    res.json({ message: 'Message sent.', data: sent });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/user/chat/messages — get user's chat history
router.get('/chat/messages', protect, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const messages = await getChatMessages(req.user.id, limit);
    // Mark admin messages as read when user opens chat
    await markChatMessagesRead(req.user.id, 'admin');
    res.json({ messages });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/user/chat/read — mark admin messages as read
router.put('/chat/read', protect, async (req, res) => {
  try {
    await markChatMessagesRead(req.user.id, 'admin');
    res.json({ message: 'Messages marked as read.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/user/upgrade-request
router.post('/upgrade-request', protect, async (req, res) => {
  try {
    const { plan } = req.body;
    if (!['pro', 'enterprise'].includes(plan))
      return res.status(400).json({ error: 'Invalid plan. Must be pro or enterprise.' });

    const user = await findUserById(req.user.id);
    if (user.subscription_plan === 'pro' && plan === 'pro')
      return res.status(400).json({ error: 'You already have the Pro plan.' });
    if (user.subscription_plan === 'enterprise')
      return res.status(400).json({ error: 'You already have the Enterprise plan.' });

    await requestUpgrade(req.user.id, plan);
    res.json({ message: `Upgrade request to ${plan.toUpperCase()} submitted. Admin will review shortly.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
