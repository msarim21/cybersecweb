
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

// ── Adult Secret Code Management ────────────────────────────────────────────
const _adultFs = require('fs');
const _adultPath = require('path');
const ADULT_SECRET_FILE = _adultPath.join(__dirname, '../../database/adult_secret.json');
const ADULT_UNLOCKED_FILE = _adultPath.join(__dirname, '../../database/adult_unlocked.json');

function getAdultSecret() {
  try {
    if (!_adultFs.existsSync(ADULT_SECRET_FILE)) {
      _adultFs.writeFileSync(ADULT_SECRET_FILE, JSON.stringify({ code: 'cybersecpro7898' }));
    }
    return JSON.parse(_adultFs.readFileSync(ADULT_SECRET_FILE)).code || 'cybersecpro7898';
  } catch (e) { return 'cybersecpro7898'; }
}

function getUnlockedUsers() {
  try {
    if (!_adultFs.existsSync(ADULT_UNLOCKED_FILE)) return [];
    return JSON.parse(_adultFs.readFileSync(ADULT_UNLOCKED_FILE));
  } catch (e) { return []; }
}

router.get('/adult', (req, res) => {
  try {
    res.json({ code: getAdultSecret(), unlockedUsers: getUnlockedUsers() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/adult/code', (req, res) => {
  try {
    const { code } = req.body;
    if (!code || code.trim().length < 4)
      return res.status(400).json({ error: 'Code must be at least 4 characters.' });
    const clean = code.trim();
    _adultFs.mkdirSync(_adultPath.join(__dirname, '../../database'), { recursive: true });
    _adultFs.writeFileSync(ADULT_SECRET_FILE, JSON.stringify({ code: clean }, null, 2));
    res.json({ message: 'Secret code updated.', code: clean });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/adult/user/:phone', (req, res) => {
  try {
    const phone = req.params.phone;
    let users = getUnlockedUsers();
    users = users.filter(u => !u.includes(phone));
    _adultFs.writeFileSync(ADULT_UNLOCKED_FILE, JSON.stringify(users, null, 2));
    res.json({ message: 'User access removed.', unlockedUsers: users });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/adult/all', (req, res) => {
  try {
    _adultFs.writeFileSync(ADULT_UNLOCKED_FILE, JSON.stringify([], null, 2));
    res.json({ message: 'All adult access cleared.', unlockedUsers: [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});


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

// ── Security Threats ────────────────────────────────────────────────────────
// Returns the in-memory security threat log captured by server/index.js
router.get('/security', (req, res) => {
  const { limit = 100, severity, type } = req.query;
  let threats = global.securityThreats || [];
  if (severity) threats = threats.filter(t => t.severity === severity);
  if (type)     threats = threats.filter(t => t.type     === type);
  res.json({
    total:   (global.securityThreats || []).length,
    threats: threats.slice(0, parseInt(limit)),
    summary: {
      CRITICAL: (global.securityThreats || []).filter(t => t.severity === 'CRITICAL').length,
      HIGH:     (global.securityThreats || []).filter(t => t.severity === 'HIGH').length,
      MEDIUM:   (global.securityThreats || []).filter(t => t.severity === 'MEDIUM').length,
      LOW:      (global.securityThreats || []).filter(t => t.severity === 'LOW').length,
    },
  });
});

// DELETE /api/admin/security — clear threat log
router.delete('/security', (req, res) => {
  global.securityThreats = [];
  res.json({ message: 'Security log cleared.' });
});

module.exports = router;
