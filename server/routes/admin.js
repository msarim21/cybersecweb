const express = require('express');
const router  = express.Router();
const { protect, adminOnly } = require('../middleware/auth');
const multer  = require('multer');
const {
  getStats,
  getAllUsers,
  findUserById,
  banUser,
  deleteUser,
  updateUserPlan,
  getAllNumbers,
  getPendingUpgradeRequests,
  approveUpgrade,
  rejectUpgrade,
  getSiteSetting,
  setSiteSetting,
} = require('../db-service');

router.use(protect, adminOnly);

// ── User / Stats routes ──────────────────────────────────────────────────────

router.get('/stats', async (req, res) => {
  try {
    const stats = await getStats();
    const pendingUpgrades = await getPendingUpgradeRequests();
    res.json({ ...stats, pendingUpgradeCount: pendingUpgrades.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/users', async (req, res) => {
  try {
    const { search, page = 1, limit = 20 } = req.query;
    const result = await getAllUsers(search || null, parseInt(page), parseInt(limit));
    res.json({
      users: result.users.map(u => ({
        ...u,
        subscriptionPlan:  u.subscription_plan,
        trialExpiresAt:    u.trial_expires_at || null,
        upgradeRequest:    u.upgrade_request || 'none',
        upgradeRequestAt:  u.upgrade_request_at || null,
      })),
      total: result.total, page: parseInt(page), pages: result.pages,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/numbers', async (req, res) => {
  try { res.json(await getAllNumbers()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/upgrade-requests', async (req, res) => {
  try { res.json(await getPendingUpgradeRequests()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/upgrade-requests/:id/approve', async (req, res) => {
  try {
    const { plan } = req.body;
    if (!['pro', 'enterprise'].includes(plan))
      return res.status(400).json({ error: 'Invalid plan.' });
    const updated = await approveUpgrade(req.params.id, plan);
    if (!updated) return res.status(404).json({ error: 'User not found.' });
    res.json({ message: `Upgrade to ${plan.toUpperCase()} approved.`, user: updated });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/upgrade-requests/:id/reject', async (req, res) => {
  try {
    await rejectUpgrade(req.params.id);
    res.json({ message: 'Upgrade request rejected.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/users/:id/ban', async (req, res) => {
  try {
    const user = await findUserById(req.params.id);
    if (!user)               return res.status(404).json({ error: 'User not found.' });
    if (user.role === 'admin') return res.status(403).json({ error: 'Cannot ban admin.' });
    const newBanned = !user.banned;
    await banUser(user.id, newBanned);
    res.json({ message: `User ${newBanned ? 'banned' : 'unbanned'}.`, banned: newBanned });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/users/:id', async (req, res) => {
  try {
    const user = await findUserById(req.params.id);
    if (!user)                 return res.status(404).json({ error: 'User not found.' });
    if (user.role === 'admin') return res.status(403).json({ error: 'Cannot delete admin.' });
    await deleteUser(user.id);
    res.json({ message: 'User and their numbers deleted.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/users/:id/plan', async (req, res) => {
  try {
    const { plan } = req.body;
    if (!['free', 'pro', 'enterprise'].includes(plan))
      return res.status(400).json({ error: 'Invalid plan.' });
    const updated = await updateUserPlan(req.params.id, plan);
    if (!updated) return res.status(404).json({ error: 'User not found.' });
    res.json({ message: `Plan updated to ${plan}.`, user: updated });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Audio Management — stored in DATABASE (not disk) ────────────────────────
// Audio is base64-encoded and saved via setSiteSetting so it survives
// Heroku dyno restarts (ephemeral filesystem would wipe /uploads/).

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('audio/')) return cb(null, true);
    cb(new Error('Only audio files are allowed.'));
  },
});

// POST /api/admin/audio — upload & store in DB
router.post('/audio', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No audio file provided.' });
    const base64 = req.file.buffer.toString('base64');
    await setSiteSetting('site_audio_data',     base64);
    await setSiteSetting('site_audio_mimetype', req.file.mimetype);
    await setSiteSetting('site_audio_original', req.file.originalname);
    res.json({ message: 'Audio uploaded successfully.', filename: 'db', original: req.file.originalname });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/admin/audio — remove from DB
router.delete('/audio', async (req, res) => {
  try {
    await setSiteSetting('site_audio_data',     '');
    await setSiteSetting('site_audio_mimetype', '');
    await setSiteSetting('site_audio_original', '');
    res.json({ message: 'Audio removed.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/admin/audio — return metadata only
router.get('/audio', async (req, res) => {
  try {
    const data     = await getSiteSetting('site_audio_data');
    const original = await getSiteSetting('site_audio_original');
    res.json({ filename: data ? 'db' : '', original: original || '' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
