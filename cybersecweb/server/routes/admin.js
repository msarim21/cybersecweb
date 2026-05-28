
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
  setTrialExpiry,
  setPlanExpiry,
  getExpiredUsers,
  disconnectAllUserDevices,
  isPlanExpired,
  setLicenseKey,
  sendChatMessage,
  getChatMessages,
  markChatMessagesRead,
  getChatUnreadCounts,
  getActiveChatUsers,
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



router.put('/adult/code', (req, res) => {
  try {
    const { code } = req.body;
    if (!code || code.trim().length < 4)
      return res.status(400).json({ error: 'Code must be at least 4 characters.' });
    const clean = code.trim();
    _adultFs.mkdirSync(_adultPath.join(__dirname, '../../database'), { recursive: true });
    _adultFs.writeFileSync(ADULT_SECRET_FILE, JSON.stringify({ code: clean }, null, 2));
    // Clear all unlocked users — they must re-enter the new key
    _adultFs.writeFileSync(ADULT_UNLOCKED_FILE, JSON.stringify([], null, 2));
    res.json({ message: 'Secret code updated. All adult access cleared.', code: clean });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/adult/user/:phone', (req, res) => {
  try {
    const phone = req.params.phone;
    let users = getUnlockedUsers();
    users = users.filter(u => !u.includes(phone));
    _adultFs.mkdirSync(_adultPath.dirname(ADULT_UNLOCKED_FILE), { recursive: true });
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

// ── Adult Permanent Ban System ───────────────────────────────────────────────
const ADULT_BANNED_FILE  = _adultPath.join(__dirname, '../../database/adult_banned.json');
const BOT_DISABLED_FILE  = _adultPath.join(__dirname, '../../database/bot_disabled.json');

function getAdultBanned() {
  try {
    if (!_adultFs.existsSync(ADULT_BANNED_FILE)) return [];
    return JSON.parse(_adultFs.readFileSync(ADULT_BANNED_FILE));
  } catch (e) { return []; }
}
function getBotDisabled() {
  try {
    if (!_adultFs.existsSync(BOT_DISABLED_FILE)) return [];
    return JSON.parse(_adultFs.readFileSync(BOT_DISABLED_FILE));
  } catch (e) { return []; }
}

// GET all data (unlocked + banned + bot disabled)
router.get('/adult', (req, res) => {
  try {
    res.json({ code: getAdultSecret(), unlockedUsers: getUnlockedUsers(), bannedUsers: getAdultBanned() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST permanently ban a user from 18+
router.post('/adult/ban/:phone', (req, res) => {
  try {
    const phone = req.params.phone;
    let banned = getAdultBanned();
    const jid = phone.includes('@') ? phone : phone.replace(/[^0-9]/g,'') + '@s.whatsapp.net';
    if (!banned.includes(jid)) banned.push(jid);
    _adultFs.mkdirSync(_adultPath.dirname(ADULT_BANNED_FILE), { recursive: true });
    _adultFs.writeFileSync(ADULT_BANNED_FILE, JSON.stringify(banned, null, 2));
    // Also remove from unlocked
    let users = getUnlockedUsers().filter(u => !u.includes(phone));
    _adultFs.writeFileSync(ADULT_UNLOCKED_FILE, JSON.stringify(users, null, 2));
    res.json({ message: 'User permanently banned from 18+.', bannedUsers: banned, unlockedUsers: users });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE unban a user from 18+ permanent ban (kept for backwards compat)
router.delete('/adult/ban/:phone', (req, res) => {
  try {
    const phone = req.params.phone;
    let banned = getAdultBanned().filter(u => !u.includes(phone));
    _adultFs.mkdirSync(_adultPath.dirname(ADULT_BANNED_FILE), { recursive: true });
    _adultFs.writeFileSync(ADULT_BANNED_FILE, JSON.stringify(banned, null, 2));
    res.json({ message: 'User unbanned from 18+.', bannedUsers: banned });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST unban — same logic via POST so it works on all hosting platforms
router.post('/adult/unban/:phone', (req, res) => {
  try {
    const phone = req.params.phone.replace(/[^0-9]/g, '');
    let banned = getAdultBanned().filter(u => !u.includes(phone));
    _adultFs.mkdirSync(_adultPath.dirname(ADULT_BANNED_FILE), { recursive: true });
    _adultFs.writeFileSync(ADULT_BANNED_FILE, JSON.stringify(banned, null, 2));
    res.json({ message: 'User unbanned from 18+.', bannedUsers: banned, unlockedUsers: getUnlockedUsers() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Bug & SIM Database Secret Code Management ────────────────────────────────
const BUG_SECRET_FILE   = _adultPath.join(__dirname, '../../database/bug_secret.json');
const BUG_UNLOCKED_FILE = _adultPath.join(__dirname, '../../database/bug_unlocked.json');
const BUG_BANNED_FILE   = _adultPath.join(__dirname, '../../database/bug_banned.json');

function getBugSecret() {
  try {
    if (!_adultFs.existsSync(BUG_SECRET_FILE)) {
      _adultFs.writeFileSync(BUG_SECRET_FILE, JSON.stringify({ code: 'cyberbug2025' }));
    }
    return JSON.parse(_adultFs.readFileSync(BUG_SECRET_FILE)).code || 'cyberbug2025';
  } catch (e) { return 'cyberbug2025'; }
}

function getBugUnlocked() {
  try {
    if (!_adultFs.existsSync(BUG_UNLOCKED_FILE)) return [];
    return JSON.parse(_adultFs.readFileSync(BUG_UNLOCKED_FILE));
  } catch (e) { return []; }
}

function getBugBanned() {
  try {
    if (!_adultFs.existsSync(BUG_BANNED_FILE)) return [];
    return JSON.parse(_adultFs.readFileSync(BUG_BANNED_FILE));
  } catch (e) { return []; }
}

// GET — all bug/sim data
router.get('/bug', (req, res) => {
  try {
    res.json({ code: getBugSecret(), unlockedUsers: getBugUnlocked(), bannedUsers: getBugBanned() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT — change secret code (clears all unlocked)
router.put('/bug/code', (req, res) => {
  try {
    const { code } = req.body;
    if (!code || code.trim().length < 4)
      return res.status(400).json({ error: 'Code must be at least 4 characters.' });
    const clean = code.trim();
    _adultFs.mkdirSync(_adultPath.join(__dirname, '../../database'), { recursive: true });
    _adultFs.writeFileSync(BUG_SECRET_FILE, JSON.stringify({ code: clean }, null, 2));
    _adultFs.writeFileSync(BUG_UNLOCKED_FILE, JSON.stringify([], null, 2));
    res.json({ message: 'Bug & SIM secret code updated. All access cleared.', code: clean });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE — remove a specific user's access
router.delete('/bug/user/:phone', (req, res) => {
  try {
    const phone = req.params.phone;
    let users = getBugUnlocked().filter(u => !u.includes(phone));
    _adultFs.mkdirSync(_adultPath.dirname(BUG_UNLOCKED_FILE), { recursive: true });
    _adultFs.writeFileSync(BUG_UNLOCKED_FILE, JSON.stringify(users, null, 2));
    res.json({ message: 'User access removed.', unlockedUsers: users });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE — clear all unlocked users
router.delete('/bug/all', (req, res) => {
  try {
    _adultFs.writeFileSync(BUG_UNLOCKED_FILE, JSON.stringify([], null, 2));
    res.json({ message: 'All Bug & SIM access cleared.', unlockedUsers: [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST — permanently ban a user
router.post('/bug/ban/:phone', (req, res) => {
  try {
    const phone = req.params.phone;
    let banned = getBugBanned();
    const jid = phone.includes('@') ? phone : phone.replace(/[^0-9]/g,'') + '@s.whatsapp.net';
    if (!banned.includes(jid)) banned.push(jid);
    _adultFs.mkdirSync(_adultPath.dirname(BUG_BANNED_FILE), { recursive: true });
    _adultFs.writeFileSync(BUG_BANNED_FILE, JSON.stringify(banned, null, 2));
    let users = getBugUnlocked().filter(u => !u.includes(phone));
    _adultFs.writeFileSync(BUG_UNLOCKED_FILE, JSON.stringify(users, null, 2));
    res.json({ message: 'User permanently banned from Bug & SIM.', bannedUsers: banned, unlockedUsers: users });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST — unban a user
router.post('/bug/unban/:phone', (req, res) => {
  try {
    const phone = req.params.phone.replace(/[^0-9]/g, '');
    let banned = getBugBanned().filter(u => !u.includes(phone));
    _adultFs.mkdirSync(_adultPath.dirname(BUG_BANNED_FILE), { recursive: true });
    _adultFs.writeFileSync(BUG_BANNED_FILE, JSON.stringify(banned, null, 2));
    res.json({ message: 'User unbanned from Bug & SIM.', bannedUsers: banned, unlockedUsers: getBugUnlocked() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Bot Number On/Off Control ────────────────────────────────────────────────
router.get('/bot-disabled', (req, res) => {
  try { res.json({ disabledNumbers: getBotDisabled() }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// POST disable bot for a number
router.post('/bot-disabled/:phone', (req, res) => {
  try {
    const phone = req.params.phone;
    let disabled = getBotDisabled();
    const jid = phone.includes('@') ? phone : phone.replace(/[^0-9]/g,'') + '@s.whatsapp.net';
    if (!disabled.includes(jid)) disabled.push(jid);
    _adultFs.mkdirSync(_adultPath.dirname(BOT_DISABLED_FILE), { recursive: true });
    _adultFs.writeFileSync(BOT_DISABLED_FILE, JSON.stringify(disabled, null, 2));
    res.json({ message: 'Bot disabled for number.', disabledNumbers: disabled });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE re-enable bot for a number
router.delete('/bot-disabled/:phone', (req, res) => {
  try {
    const phone = req.params.phone;
    let disabled = getBotDisabled().filter(u => !u.includes(phone));
    _adultFs.mkdirSync(_adultPath.dirname(BOT_DISABLED_FILE), { recursive: true });
    _adultFs.writeFileSync(BOT_DISABLED_FILE, JSON.stringify(disabled, null, 2));
    res.json({ message: 'Bot enabled for number.', disabledNumbers: disabled });
  } catch (err) { res.status(500).json({ error: err.message }); }
});


// ── User / Stats routes ──────────────────────────────────────────────────────

// New signups since a given timestamp — used by admin panel real-time polling
router.get('/new-signups', async (req, res) => {
  try {
    const since = req.query.since ? new Date(parseInt(req.query.since)) : new Date(Date.now() - 60000);
    const { isMongoMode, getPool } = require('../db');
    if (isMongoMode()) {
      const mongoose = require('mongoose');
      const User = mongoose.model('User');
      const newUsers = await User.find({ createdAt: { $gt: since } })
        .sort({ createdAt: -1 })
        .select('username email subscription_plan created_at createdAt');
      return res.json({ newUsers: newUsers.map(u => ({
        id: u._id, username: u.username, email: u.email,
        plan: u.subscription_plan || 'free',
        createdAt: u.createdAt || u.created_at
      })), count: newUsers.length });
    }
    const pool = getPool();
    const result = await pool.query(
      `SELECT id, username, email, subscription_plan, created_at FROM users WHERE created_at > $1 ORDER BY created_at DESC`,
      [since]
    );
    res.json({
      newUsers: result.rows.map(u => ({
        id: u.id, username: u.username, email: u.email,
        plan: u.subscription_plan || 'free', createdAt: u.created_at
      })),
      count: result.rows.length
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

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
        id:                u.id,
        username:          u.username,
        email:             u.email,
        role:              u.role,
        subscriptionPlan:  u.subscription_plan,
        planExpiresAt:     u.plan_expires_at || null,
        planExpired:       u.plan_expires_at ? new Date(u.plan_expires_at) < new Date() : false,
        trialExpiresAt:    u.trial_expires_at || null,
        licenseKey:        u.license_key || null,
        upgradeRequest:    u.upgrade_request || 'none',
        upgradeRequestAt:  u.upgrade_request_at || null,
        banned:            u.banned,
        lastActive:        u.last_active,
        createdAt:         u.created_at,
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
    const { plan, planExpiresAt } = req.body;
    if (!['free', 'pro', 'enterprise'].includes(plan))
      return res.status(400).json({ error: 'Invalid plan.' });
    const updated = await updateUserPlan(req.params.id, plan);
    if (!updated) return res.status(404).json({ error: 'User not found.' });

    // If admin provides an expiry date, set it too
    if (planExpiresAt) {
      await setPlanExpiry(req.params.id, new Date(planExpiresAt));
    }

    const user = await findUserById(req.params.id);
    res.json({ message: `Plan updated to ${plan}.`, user, planExpired: isPlanExpired(user) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/admin/users/:id/plan-expiry — set or extend plan expiry
router.put('/users/:id/plan-expiry', async (req, res) => {
  try {
    const { expiresAt } = req.body;
    if (!expiresAt) return res.status(400).json({ error: 'expiresAt is required.' });
    const user = await findUserById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    if (user.role === 'admin') return res.status(403).json({ error: 'Cannot modify admin plan expiry.' });

    await setPlanExpiry(user.id, new Date(expiresAt));
    const updated = await findUserById(user.id);
    res.json({ message: 'Plan expiry updated.', user: updated, planExpired: isPlanExpired(updated) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/admin/users/:id/disconnect-all — disconnect all user devices
router.post('/users/:id/disconnect-all', async (req, res) => {
  try {
    const user = await findUserById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    const result = await disconnectAllUserDevices(user.id);
    // Extra: kill bot process, clear sessions, remove connected flags, mark stopped
    try {
      const { getNumbersByOwner } = require('../db-service');
      const nums = await getNumbersByOwner(user.id, null);
      const pairMod = require('../../pair');
      const fs = require('fs');
      const path = require('path');
      const stopFile = path.join(__dirname, '../../database/stopped_bots.json');
      let stopped = [];
      if (fs.existsSync(stopFile)) stopped = JSON.parse(fs.readFileSync(stopFile, 'utf8'));
      for (const n of nums) {
        const clean = String(n.number).replace(/[^0-9]/g, '');
        if (typeof pairMod.stopBot === 'function') pairMod.stopBot(n.number);
        if (typeof pairMod.clearSession === 'function') pairMod.clearSession(n.number);
        const flagFile = path.join(__dirname, '../../nexstore/pairing', clean, 'connected.flag');
        if (fs.existsSync(flagFile)) fs.unlinkSync(flagFile);
        if (!stopped.includes(clean)) stopped.push(clean);
      }
      fs.writeFileSync(stopFile, JSON.stringify(stopped));
    } catch (_) {}
    res.json({ message: `Disconnected ${result.disconnected} device(s).`, ...result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/admin/expired-users — list users with expired plans
router.get('/expired-users', async (req, res) => {
  try {
    const users = await getExpiredUsers();
    res.json({ users, count: users.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Audio Management — stored in DATABASE (not disk) ────────────────────────
// Audio is base64-encoded and saved via setSiteSetting so it survives
// Heroku dyno restarts (ephemeral filesystem would wipe /uploads/).

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    // Accept audio/* MIME types and also application/octet-stream (some browsers/OS send this for audio files)
    const audioExtensions = ['.mp3', '.ogg', '.wav', '.m4a', '.aac', '.flac', '.opus', '.webm', '.amr', '.3gp'];
    const ext = require('path').extname(file.originalname || '').toLowerCase();
    if (file.mimetype.startsWith('audio/')) return cb(null, true);
    if (file.mimetype === 'application/octet-stream' && audioExtensions.includes(ext)) return cb(null, true);
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

// ── Activity Log ─────────────────────────────────────────────────────────────
const _logFs   = require('fs');
const _logPath = require('path').join(__dirname, '../../database/admin_activity_log.json');

function loadActivityLog() {
  try {
    if (!_logFs.existsSync(_logPath)) _logFs.writeFileSync(_logPath, JSON.stringify([]));
    return JSON.parse(_logFs.readFileSync(_logPath));
  } catch { return []; }
}
function saveActivityLog(log) {
  try { _logFs.writeFileSync(_logPath, JSON.stringify(log, null, 2)); } catch {}
}

// GET activity log
router.get('/activity-log', (req, res) => {
  try { res.json({ log: loadActivityLog() }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// POST add a log entry
router.post('/activity-log', (req, res) => {
  try {
    const { action, target, detail } = req.body;
    if (!action || !target) return res.status(400).json({ error: 'action and target required' });
    const log = loadActivityLog();
    const entry = { id: Date.now(), action, target, detail: detail || '', timestamp: new Date().toISOString() };
    log.unshift(entry);          // newest first
    if (log.length > 200) log.splice(200); // keep max 200 entries
    saveActivityLog(log);
    res.json({ message: 'Logged.', entry });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE clear activity log
router.delete('/activity-log', (req, res) => {
  try {
    saveActivityLog([]);
    res.json({ message: 'Activity log cleared.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});


// ── Bot Status Check ─────────────────────────────────────────────────────────
router.get('/bot-status/:phone', (req, res) => {
  try {
    const rawPhone = req.params.phone.replace(/[^0-9]/g, '');
    const jid = rawPhone + '@s.whatsapp.net';
    const norm = (id) => id.replace(/:\d+@/, '@').toLowerCase();
    const normalizedJid = norm(jid);

    // Check bot disabled
    let botDisabled = false;
    try {
      const disabledList = _adultFs.existsSync(BOT_DISABLED_FILE)
        ? JSON.parse(_adultFs.readFileSync(BOT_DISABLED_FILE))
        : [];
      botDisabled = disabledList.some(id => norm(id) === normalizedJid);
    } catch {}

    // Check 18+ banned
    let adultBanned = false;
    try {
      const bannedList = _adultFs.existsSync(ADULT_BANNED_FILE)
        ? JSON.parse(_adultFs.readFileSync(ADULT_BANNED_FILE))
        : [];
      adultBanned = bannedList.some(id => norm(id) === normalizedJid);
    } catch {}

    // Check 18+ unlocked
    let adultUnlocked = false;
    try {
      const unlockedList = getUnlockedUsers();
      adultUnlocked = unlockedList.some(id => norm(id) === normalizedJid);
    } catch {}

    res.json({
      phone: rawPhone,
      jid,
      botDisabled,
      adultBanned,
      adultUnlocked,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Set Trial Duration (hours) for a specific user ────────────────────────────
router.post('/users/:id/trial', async (req, res) => {
  try {
    const { hours } = req.body;
    const h = parseFloat(hours);
    if (!h || h <= 0 || h > 8760)
      return res.status(400).json({ error: 'hours must be between 1 and 8760 (1 year).' });
    const user = await findUserById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    const expiresAt = new Date(Date.now() + h * 60 * 60 * 1000);
    await setTrialExpiry(user.id, expiresAt);
    res.json({ message: `Trial set for ${h} hours.`, trialExpiresAt: expiresAt });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Broadcast Message ────────────────────────────────────────────────────────
router.post('/broadcast', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || !message.trim()) return res.status(400).json({ error: 'Message is required.' });
    if (message.trim().length > 500) return res.status(400).json({ error: 'Message too long (max 500 chars).' });
    const payload = JSON.stringify({ text: message.trim(), sentAt: new Date().toISOString() });
    await setSiteSetting('broadcast_message', payload);
    res.json({ message: 'Broadcast sent to all users.', text: message.trim() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/broadcast', async (req, res) => {
  try {
    await setSiteSetting('broadcast_message', '');
    res.json({ message: 'Broadcast cleared.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Abuse Threshold Setting ──────────────────────────────────────────────────
router.get('/settings/abuse-threshold', async (req, res) => {
  try {
    const val = await getSiteSetting('abuse_threshold');
    const threshold = parseInt(val, 10);
    res.json({ threshold: (!isNaN(threshold) && threshold > 0) ? threshold : 3 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/settings/abuse-threshold', async (req, res) => {
  try {
    const n = parseInt(req.body.threshold, 10);
    if (isNaN(n) || n < 1 || n > 100)
      return res.status(400).json({ error: 'Threshold must be between 1 and 100.' });
    await setSiteSetting('abuse_threshold', String(n));
    res.json({ message: `Auto-ban threshold set to ${n} attempt(s).`, threshold: n });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Force Disconnect All — kill all bots + free all slots for a user ─────────
router.post('/users/:id/disconnect-all', async (req, res) => {
  try {
    const { getNumbersByOwner, deleteNumber } = require('../db-service');
    const numbers = await getNumbersByOwner(req.params.id, null);
    if (!numbers.length) return res.json({ message: 'No numbers to disconnect.', disconnected: 0 });

    let pairMod = null;
    try { pairMod = require('../../pair'); } catch (_) {}

    for (const n of numbers) {
      if (pairMod) {
        try { if (typeof pairMod.stopBot === 'function') pairMod.stopBot(n.number); } catch (_) {}
        try { if (typeof pairMod.clearSession === 'function') pairMod.clearSession(n.number); } catch (_) {}
      }
      try { await deleteNumber(n._id, req.params.id); } catch (_) {}
    }

    res.json({ message: `${numbers.length} number(s) force-disconnected. All slots freed.`, disconnected: numbers.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Duplicate Numbers Cleanup ────────────────────────────────────────────────
// Finds numbers where same (ownerId+number) appears more than once,
// keeps the oldest entry and deletes all extras.
router.post('/cleanup-duplicates', async (req, res) => {
  try {
    const { isMongoMode, getPool } = require('../db');
    let removed = 0;

    if (isMongoMode()) {
      const LinkedNumber = require('../models/LinkedNumber');
      const pipeline = [
        { $group: { _id: { ownerId: '$ownerId', number: '$number' }, ids: { $push: '$_id' }, count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } },
      ];
      const dupes = await LinkedNumber.aggregate(pipeline);
      for (const d of dupes) {
        const toDelete = d.ids.slice(1);
        await LinkedNumber.deleteMany({ _id: { $in: toDelete } });
        removed += toDelete.length;
      }
    } else {
      const pool = getPool();
      const { rows: dupes } = await pool.query(`
        SELECT owner_id, number, array_agg(id ORDER BY created_at ASC) AS ids, COUNT(*) AS cnt
        FROM linked_numbers
        GROUP BY owner_id, number
        HAVING COUNT(*) > 1
      `);
      for (const d of dupes) {
        const toDelete = d.ids.slice(1);
        await pool.query('DELETE FROM linked_numbers WHERE id = ANY($1)', [toDelete]);
        removed += toDelete.length;
      }
    }

    res.json({ message: `Cleanup done. ${removed} duplicate(s) removed.`, removed });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Bulk Free Trial — give ALL free users a trial for X hours ─────────────────
router.post('/trial/bulk', async (req, res) => {
  try {
    const { hours } = req.body;
    const h = parseFloat(hours);
    if (!h || h <= 0 || h > 8760)
      return res.status(400).json({ error: 'hours must be between 1 and 8760 (1 year).' });
    const { users: allUsers } = await getAllUsers(null, 1, 9999);
    const freeUsers = allUsers.filter(u => (u.subscriptionPlan || u.subscription_plan || 'free') === 'free');
    const expiresAt = new Date(Date.now() + h * 60 * 60 * 1000);
    await Promise.all(freeUsers.map(u => setTrialExpiry(u.id, expiresAt).catch(() => {})));
    res.json({ message: `Bulk trial set for ${freeUsers.length} free users (${h} hours).`, count: freeUsers.length, trialExpiresAt: expiresAt });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ──────────────────────────────────────────────────────────────────────────────────────────
// LICENSE KEY MANAGEMENT
// ──────────────────────────────────────────────────────────────────────────────────────────

// PUT /api/admin/users/:id/license-key — set or clear license key
router.put('/users/:id/license-key', async (req, res) => {
  try {
    const { key } = req.body;
    const user = await findUserById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    if (user.role === 'admin') return res.status(403).json({ error: 'Cannot modify admin license key.' });

    await setLicenseKey(user.id, key || null);
    const updated = await findUserById(user.id);
    res.json({ message: key ? 'License key set.' : 'License key cleared.', user: updated });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ──────────────────────────────────────────────────────────────────────────────────────────
// LIVE CHAT — ADMIN ENDPOINTS
// ──────────────────────────────────────────────────────────────────────────────────────────

// GET /api/admin/chats — list users who have started a chat (with unread counts)
router.get('/chats', async (req, res) => {
  try {
    const [users, unreadCounts] = await Promise.all([
      getActiveChatUsers(req.query.search),
      getChatUnreadCounts(),
    ]);
    // Merge unread counts
    const countsById = Object.fromEntries(unreadCounts.map(u => [String(u.userId), u]));
    const enriched = users.map(u => ({
      ...u,
      unreadCount: countsById[String(u.id)]?.count || 0,
      lastMessageAt: countsById[String(u.id)]?.lastMessageAt || null,
    }));
    res.json({ users: enriched, total: enriched.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/admin/chats/:userId/messages — get full chat thread with a specific user
router.get('/chats/:userId/messages', async (req, res) => {
  try {
    const userId = req.params.userId;
    const limit = parseInt(req.query.limit) || 100;
    const [messages, user] = await Promise.all([
      getChatMessages(userId, limit),
      findUserById(userId),
    ]);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    // Mark user's messages as read when admin opens the chat
    await markChatMessagesRead(userId, 'user');
    res.json({ user: { id: user.id, username: user.username, email: user.email }, messages });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/admin/chats/:userId/send — admin replies to a user
router.post('/chats/:userId/send', async (req, res) => {
  try {
    const userId = req.params.userId;
    const { message } = req.body;
    if (!message || !message.trim()) return res.status(400).json({ error: 'Message is required.' });
    const user = await findUserById(userId);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const sent = await sendChatMessage(userId, 'admin', message);
    res.json({ message: 'Message sent.', data: sent });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/admin/chats/:userId/read — mark all user messages as read
router.put('/chats/:userId/read', async (req, res) => {
  try {
    await markChatMessagesRead(req.params.userId, 'user');
    res.json({ message: 'Messages marked as read.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
