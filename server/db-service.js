'use strict';

const bcrypt = require('bcryptjs');
const { isMongoMode, getPool } = require('./db');

function M() {
  return {
    User:         require('./models/User'),
    LinkedNumber: require('./models/LinkedNumber'),
    BotSession:   require('./models/BotSession'),
  };
}

function normUser(u) {
  if (!u) return null;
  const o = u.toObject ? u.toObject({ getters: true }) : u;
  return {
    id:                (o._id || o.id) ? String(o._id || o.id) : undefined,
    username:          o.username,
    email:             o.email,
    password:          o.password,
    role:              o.role,
    subscription_plan: o.subscriptionPlan || o.subscription_plan,
    plan_expires_at:   o.planExpiresAt    || o.plan_expires_at   || null,
    trial_expires_at:  o.trialExpiresAt   || o.trial_expires_at  || null,
    license_key:       o.licenseKey       || o.license_key       || null,
    upgrade_request:   o.upgradeRequest   || o.upgrade_request   || 'none',
    upgrade_request_at: o.upgradeRequestAt || o.upgrade_request_at || null,
    banned:            o.banned,
    last_active:       o.lastActive  || o.last_active,
    created_at:        o.createdAt   || o.created_at,
  };
}

function normNumber(n) {
  if (!n) return null;
  const o = n.toObject ? n.toObject({ getters: true }) : n;
  return {
    _id:       String(o._id || o.id),
    number:    o.number,
    botName:   o.botName   || o.bot_name,
    status:    o.status,
    ownerId:   o.ownerId   ? String(o.ownerId) : String(o.owner_id),
    lastActive: o.lastActive || o.last_active,
    createdAt:  o.createdAt  || o.created_at,
  };
}

const pg = () => getPool();

// ════════════════════════════════════════════════════════════════════════════
// USER METHODS
// ════════════════════════════════════════════════════════════════════════════

async function findUserByEmail(email, includePassword = false) {
  if (isMongoMode()) {
    const { User } = M();
    let q = User.findOne({ email: email.toLowerCase() });
    if (includePassword) q = q.select('+password');
    return normUser(await q);
  }
  const { rows } = await pg().query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
  return rows[0] || null;
}

async function findUserById(id) {
  if (isMongoMode()) {
    const { User } = M();
    try { return normUser(await User.findById(id)); } catch { return null; }
  }
  const { rows } = await pg().query('SELECT * FROM users WHERE id = $1', [id]);
  return rows[0] || null;
}

async function findUserByEmailOrUsername(email, username) {
  if (isMongoMode()) {
    const { User } = M();
    return normUser(await User.findOne({ $or: [{ email: email.toLowerCase() }, { username }] }));
  }
  const { rows } = await pg().query(
    'SELECT id FROM users WHERE email = $1 OR username = $2',
    [email.toLowerCase(), username]
  );
  return rows[0] || null;
}

async function findUserByUsername(username, excludeId) {
  if (isMongoMode()) {
    const { User } = M();
    const filter = { username };
    if (excludeId) filter._id = { $ne: excludeId };
    return normUser(await User.findOne(filter));
  }
  const { rows } = await pg().query(
    'SELECT id FROM users WHERE username = $1 AND id != $2',
    [username, excludeId]
  );
  return rows[0] || null;
}

async function createUser(username, email, rawPassword) {
  if (isMongoMode()) {
    const { User } = M();
    const user = new User({ username, email: email.toLowerCase(), password: rawPassword });
    await user.save();
    return normUser(user);
  }
  const hashed = await bcrypt.hash(rawPassword, 12);
  const { rows } = await pg().query(
    `INSERT INTO users (username, email, password) VALUES ($1, $2, $3)
     RETURNING id, username, email, role, subscription_plan, created_at`,
    [username, email.toLowerCase(), hashed]
  );
  return rows[0];
}

async function updateUserLastActive(id) {
  if (isMongoMode()) {
    const { User } = M();
    await User.findByIdAndUpdate(id, { lastActive: new Date() });
    return;
  }
  await pg().query('UPDATE users SET last_active = NOW() WHERE id = $1', [id]);
}

async function updateUsername(id, username) {
  if (isMongoMode()) {
    const { User } = M();
    await User.findByIdAndUpdate(id, { username });
    return;
  }
  await pg().query('UPDATE users SET username = $1 WHERE id = $2', [username, id]);
}

async function setAdminRole(id) {
  if (isMongoMode()) {
    const { User } = M();
    await User.findByIdAndUpdate(id, { role: 'admin' });
    return;
  }
  await pg().query("UPDATE users SET role = 'admin' WHERE id = $1", [id]);
}

async function updatePassword(id, rawPassword) {
  const hashed = await bcrypt.hash(rawPassword, 12);
  if (isMongoMode()) {
    const { User } = M();
    await User.findByIdAndUpdate(id, { password: hashed });
    return;
  }
  await pg().query('UPDATE users SET password = $1 WHERE id = $2', [hashed, id]);
}

async function banUser(id, banned) {
  if (isMongoMode()) {
    const { User } = M();
    await User.findByIdAndUpdate(id, { banned });
    return;
  }
  await pg().query('UPDATE users SET banned = $1 WHERE id = $2', [banned, id]);
}

async function deleteUser(id) {
  if (isMongoMode()) {
    const { User, LinkedNumber } = M();
    await LinkedNumber.deleteMany({ ownerId: id });
    await User.findByIdAndDelete(id);
    return;
  }
  await pg().query('DELETE FROM users WHERE id = $1', [id]);
}

async function updateUserPlan(id, plan) {
  if (isMongoMode()) {
    const { User } = M();
    const u = await User.findByIdAndUpdate(id, { subscriptionPlan: plan, upgradeRequest: 'none' }, { new: true });
    return u ? normUser(u) : null;
  }
  const { rows } = await pg().query(
    "UPDATE users SET subscription_plan = $1, upgrade_request = 'none' WHERE id = $2 RETURNING id, username, email, subscription_plan",
    [plan, id]
  );
  return rows[0] || null;
}

async function setPlanExpiry(id, expiresAt) {
  if (isMongoMode()) {
    const { User } = M();
    await User.findByIdAndUpdate(id, { planExpiresAt: expiresAt });
    return;
  }
  await pg().query('UPDATE users SET plan_expires_at = $1 WHERE id = $2', [expiresAt, id]);
}

async function setTrialExpiry(id, expiresAt) {
  if (isMongoMode()) {
    const { User } = M();
    await User.findByIdAndUpdate(id, { trialExpiresAt: expiresAt });
    return;
  }
  await pg().query('UPDATE users SET trial_expires_at = $1 WHERE id = $2', [expiresAt, id]);
}

function isPlanExpired(user) {
  if (!user) return false;
  const now = new Date();
  // Paid plans (pro / enterprise) are NOT expired by trial expiry
  if (user.subscription_plan === 'pro' || user.subscription_plan === 'enterprise') {
    // Only check if explicit plan_expires_at exists AND is in the past
    if (user.plan_expires_at && new Date(user.plan_expires_at) < now) return true;
    // If no plan expiry set, paid plans are considered active
    return false;
  }
  // Free / trial users: check plan expiry first
  if (user.plan_expires_at && new Date(user.plan_expires_at) < now) return true;
  // Check free trial expiry
  if (user.trial_expires_at && new Date(user.trial_expires_at) < now) return true;
  return false;
}

function isTrialExpired(user) {
  if (!user || !user.trial_expires_at) return false;
  if (user.subscription_plan === 'pro' || user.subscription_plan === 'enterprise') return false;
  return new Date(user.trial_expires_at) < new Date();
}

async function getExpiredUsers() {
  if (isMongoMode()) {
    const { User } = M();
    const all = await User.find({});
    return all.map(normUser).filter(isPlanExpired);
  }
  const { rows } = await pg().query('SELECT * FROM users');
  return rows.map(normUser).filter(isPlanExpired);
}

async function disconnectAllUserDevices(userId) {
  const numbers = await getNumbersByOwner(userId, null);
  if (!numbers.length) return { disconnected: 0 };

  let pairMod = null;
  try { pairMod = require('../../pair'); } catch (_) {}

  for (const n of numbers) {
    if (pairMod) {
      try { if (typeof pairMod.stopBot === 'function') pairMod.stopBot(n.number); } catch (_) {}
      try { if (typeof pairMod.clearSession === 'function') pairMod.clearSession(n.number); } catch (_) {}
    }
    try { await deleteNumber(n._id, userId); } catch (_) {}
  }

  return { disconnected: numbers.length };
}

async function setLicenseKey(id, key) {
  if (isMongoMode()) {
    const { User } = M();
    await User.findByIdAndUpdate(id, { licenseKey: key || null });
    return;
  }
  await pg().query('UPDATE users SET license_key = $1 WHERE id = $2', [key || null, id]);
}

async function requestUpgrade(id, plan) {
  if (isMongoMode()) {
    const { User } = M();
    await User.findByIdAndUpdate(id, { upgradeRequest: plan, upgradeRequestAt: new Date() });
    return;
  }
  await pg().query(
    'UPDATE users SET upgrade_request = $1, upgrade_request_at = NOW() WHERE id = $2',
    [plan, id]
  );
}

async function getPendingUpgradeRequests() {
  if (isMongoMode()) {
    const { User } = M();
    const users = await User.find({ upgradeRequest: { $in: ['pro', 'enterprise'] } }).sort({ upgradeRequestAt: -1 });
    return users.map(u => ({
      id: String(u._id), username: u.username, email: u.email,
      subscriptionPlan: u.subscriptionPlan,
      upgradeRequest: u.upgradeRequest,
      upgradeRequestAt: u.upgradeRequestAt,
    }));
  }
  const { rows } = await pg().query(
    `SELECT id, username, email, subscription_plan, upgrade_request, upgrade_request_at
     FROM users WHERE upgrade_request IN ('pro','enterprise')
     ORDER BY upgrade_request_at DESC`
  );
  return rows.map(r => ({
    id: r.id, username: r.username, email: r.email,
    subscriptionPlan: r.subscription_plan,
    upgradeRequest: r.upgrade_request,
    upgradeRequestAt: r.upgrade_request_at,
  }));
}

async function approveUpgrade(id, plan) {
  if (isMongoMode()) {
    const { User } = M();
    const u = await User.findByIdAndUpdate(id, { subscriptionPlan: plan, upgradeRequest: 'none' }, { new: true });
    return u ? normUser(u) : null;
  }
  const { rows } = await pg().query(
    "UPDATE users SET subscription_plan = $1, upgrade_request = 'none', upgrade_request_at = NULL WHERE id = $2 RETURNING id, username, email, subscription_plan",
    [plan, id]
  );
  return rows[0] || null;
}

async function rejectUpgrade(id) {
  if (isMongoMode()) {
    const { User } = M();
    await User.findByIdAndUpdate(id, { upgradeRequest: 'none', upgradeRequestAt: null });
    return;
  }
  await pg().query(
    "UPDATE users SET upgrade_request = 'none', upgrade_request_at = NULL WHERE id = $1",
    [id]
  );
}

async function getAllUsers(search, page, limit) {
  const offset = (page - 1) * limit;
  if (isMongoMode()) {
    const { User } = M();
    const filter = search
      ? { $or: [{ username: { $regex: search, $options: 'i' } }, { email: { $regex: search, $options: 'i' } }] }
      : {};
    const [users, total] = await Promise.all([
      User.find(filter).sort({ createdAt: -1 }).skip(offset).limit(limit),
      User.countDocuments(filter),
    ]);
    return { users: users.map(normUser), total, pages: Math.ceil(total / limit) };
  }
  let query, countQuery, params, countParams;
  if (search) {
    query      = `SELECT id,username,email,role,subscription_plan,plan_expires_at,trial_expires_at,license_key,upgrade_request,upgrade_request_at,banned,last_active,created_at FROM users WHERE username ILIKE $1 OR email ILIKE $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`;
    countQuery = 'SELECT COUNT(*) FROM users WHERE username ILIKE $1 OR email ILIKE $1';
    params      = [`%${search}%`, parseInt(limit), offset];
    countParams = [`%${search}%`];
  } else {
    query      = `SELECT id,username,email,role,subscription_plan,plan_expires_at,trial_expires_at,license_key,upgrade_request,upgrade_request_at,banned,last_active,created_at FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2`;
    countQuery = 'SELECT COUNT(*) FROM users';
    params      = [parseInt(limit), offset];
    countParams = [];
  }
  const [{ rows: users }, countRes] = await Promise.all([
    pg().query(query, params),
    pg().query(countQuery, countParams),
  ]);
  const total = parseInt(countRes.rows[0].count);
  return { users, total, pages: Math.ceil(total / parseInt(limit)) };
}

async function getStats() {
  if (isMongoMode()) {
    const { User, LinkedNumber } = M();
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const [totalUsers, totalNumbers, bannedUsers, activeNumbers, onlineUsers, planBreakdown] = await Promise.all([
      User.countDocuments(),
      LinkedNumber.countDocuments(),
      User.countDocuments({ banned: true }),
      LinkedNumber.countDocuments({ status: 'active' }),
      User.countDocuments({ lastActive: { $gte: fiveMinAgo } }),
      User.aggregate([{ $group: { _id: '$subscriptionPlan', count: { $sum: 1 } } }]),
    ]);
    return { totalUsers, totalNumbers, bannedUsers, activeNumbers, onlineUsers, planBreakdown };
  }
  const pool = pg();
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const [tu, tn, bu, an, ou, pb] = await Promise.all([
    pool.query('SELECT COUNT(*) FROM users').then(r => parseInt(r.rows[0].count)),
    pool.query('SELECT COUNT(*) FROM linked_numbers').then(r => parseInt(r.rows[0].count)),
    pool.query('SELECT COUNT(*) FROM users WHERE banned = true').then(r => parseInt(r.rows[0].count)),
    pool.query("SELECT COUNT(*) FROM linked_numbers WHERE status = 'active'").then(r => parseInt(r.rows[0].count)),
    pool.query('SELECT COUNT(*) FROM users WHERE last_active >= $1', [fiveMinAgo]).then(r => parseInt(r.rows[0].count)),
    pool.query('SELECT subscription_plan AS _id, COUNT(*) AS count FROM users GROUP BY subscription_plan')
      .then(r => r.rows.map(x => ({ _id: x._id, count: parseInt(x.count) }))),
  ]);
  return { totalUsers: tu, totalNumbers: tn, bannedUsers: bu, activeNumbers: an, onlineUsers: ou, planBreakdown: pb };
}

// ════════════════════════════════════════════════════════════════════════════
// LINKED NUMBER METHODS
// ════════════════════════════════════════════════════════════════════════════

async function getNumbersByOwner(userId, search) {
  if (isMongoMode()) {
    const { LinkedNumber } = M();
    const filter = { ownerId: userId };
    if (search) filter.$or = [
      { number:  { $regex: search, $options: 'i' } },
      { botName: { $regex: search, $options: 'i' } },
    ];
    return (await LinkedNumber.find(filter).sort({ createdAt: -1 })).map(normNumber);
  }
  let query, params;
  if (search) {
    query  = `SELECT * FROM linked_numbers WHERE owner_id=$1 AND (number ILIKE $2 OR bot_name ILIKE $2) ORDER BY created_at DESC`;
    params = [userId, `%${search}%`];
  } else {
    query  = 'SELECT * FROM linked_numbers WHERE owner_id=$1 ORDER BY created_at DESC';
    params = [userId];
  }
  const { rows } = await pg().query(query, params);
  return rows.map(r => ({ _id: r.id, number: r.number, botName: r.bot_name, status: r.status, ownerId: r.owner_id, lastActive: r.last_active, createdAt: r.created_at }));
}

async function countNumbersByOwner(userId) {
  if (isMongoMode()) {
    const { LinkedNumber } = M();
    return LinkedNumber.countDocuments({ ownerId: userId });
  }
  const { rows } = await pg().query('SELECT COUNT(*) FROM linked_numbers WHERE owner_id=$1', [userId]);
  return parseInt(rows[0].count);
}

async function getUserLinkedCount(userId) {
  return countNumbersByOwner(userId);
}

async function addNumber(number, botName, userId) {
  const cleanNum = String(number).replace(/[^0-9]/g, '');
  if (isMongoMode()) {
    const { LinkedNumber } = M();
    const n = await LinkedNumber.findOneAndUpdate(
      { ownerId: userId, number: { $regex: cleanNum } },
      { $setOnInsert: { number, botName, ownerId: userId, status: 'active', createdAt: new Date(), lastActive: new Date() } },
      { upsert: true, new: true }
    );
    return normNumber(n);
  }
  const { rows: existing } = await pg().query(
    'SELECT * FROM linked_numbers WHERE owner_id=$1 AND number LIKE $2',
    [userId, `%${cleanNum}%`]
  );
  if (existing.length > 0) {
    const r = existing[0];
    return { _id: r.id, number: r.number, botName: r.bot_name, status: r.status, ownerId: r.owner_id, lastActive: r.last_active, createdAt: r.created_at };
  }
  const { rows } = await pg().query(
    'INSERT INTO linked_numbers (number, bot_name, owner_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING *',
    [number, botName, userId]
  );
  if (!rows.length) {
    const { rows: r2 } = await pg().query(
      'SELECT * FROM linked_numbers WHERE owner_id=$1 AND number LIKE $2',
      [userId, `%${cleanNum}%`]
    );
    if (!r2.length) return null;
    const r = r2[0];
    return { _id: r.id, number: r.number, botName: r.bot_name, status: r.status, ownerId: r.owner_id, lastActive: r.last_active, createdAt: r.created_at };
  }
  const r = rows[0];
  return { _id: r.id, number: r.number, botName: r.bot_name, status: r.status, ownerId: r.owner_id, lastActive: r.last_active, createdAt: r.created_at };
}

async function toggleNumber(id, userId) {
  if (isMongoMode()) {
    const { LinkedNumber } = M();
    try {
      const n = await LinkedNumber.findOne({ _id: id, ownerId: userId });
      if (!n) return null;
      n.status = n.status === 'active' ? 'inactive' : 'active';
      n.lastActive = new Date();
      await n.save();
      return normNumber(n);
    } catch { return null; }
  }
  const check = await pg().query('SELECT * FROM linked_numbers WHERE id=$1 AND owner_id=$2', [id, userId]);
  if (!check.rows.length) return null;
  const newStatus = check.rows[0].status === 'active' ? 'inactive' : 'active';
  const { rows } = await pg().query(
    "UPDATE linked_numbers SET status=$1, last_active=NOW() WHERE id=$2 RETURNING *",
    [newStatus, id]
  );
  const r = rows[0];
  return { _id: r.id, number: r.number, botName: r.bot_name, status: r.status, ownerId: r.owner_id, lastActive: r.last_active, createdAt: r.created_at };
}

async function deleteNumber(id, userId) {
  if (isMongoMode()) {
    const { LinkedNumber } = M();
    try {
      const n = await LinkedNumber.findById(id);
      if (!n) return null;
      if (String(n.ownerId) !== String(userId)) return null;
      await n.deleteOne();
      return { number: n.number };
    } catch { return null; }
  }
  const { rows } = await pg().query(
    'DELETE FROM linked_numbers WHERE id=$1 AND owner_id=$2 RETURNING *',
    [id, userId]
  );
  if (!rows.length) return null;
  return { number: rows[0].number };
}

async function getAllNumbers() {
  if (isMongoMode()) {
    const { LinkedNumber } = M();
    const nums = await LinkedNumber.find().sort({ createdAt: -1 }).limit(100).populate('ownerId', 'username email');
    return nums.map(n => ({
      _id: n._id.toString(), number: n.number, botName: n.botName, status: n.status, createdAt: n.createdAt,
      ownerId: { username: n.ownerId?.username, email: n.ownerId?.email },
    }));
  }
  const { rows } = await pg().query(`
    SELECT ln.*, u.username, u.email
    FROM linked_numbers ln JOIN users u ON ln.owner_id = u.id
    ORDER BY ln.created_at DESC LIMIT 100
  `);
  return rows.map(r => ({
    _id: r.id, number: r.number, botName: r.bot_name, status: r.status, createdAt: r.created_at,
    ownerId: { username: r.username, email: r.email },
  }));
}

// ════════════════════════════════════════════════════════════════════════════
// BOT SESSION METHODS
// ════════════════════════════════════════════════════════════════════════════

async function upsertBotSession(number, status) {
  const clean = number.replace(/[^0-9]/g, '');
  if (!clean) return;
  if (isMongoMode()) {
    const { BotSession } = M();
    await BotSession.findOneAndUpdate(
      { number: clean },
      { status, lastActive: new Date(), ...(status === 'active' ? { connectedAt: new Date() } : {}) },
      { upsert: true, new: true }
    );
    return;
  }
  await pg().query(
    `INSERT INTO bot_sessions (number, status, connected_at, last_active)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (number) DO UPDATE
       SET status = $2, last_active = NOW(),
           connected_at = CASE WHEN $2='active' THEN NOW() ELSE bot_sessions.connected_at END`,
    [clean, status, status === 'active' ? new Date() : null]
  );
}

async function markFirstConnected(number) {
  const clean = number.replace(/[^0-9]/g, '');
  if (!clean) return;
  if (isMongoMode()) {
    const { BotSession } = M();
    await BotSession.findOneAndUpdate(
      { number: clean },
      { firstConnectedAt: new Date() },
      { upsert: true }
    );
    return;
  }
  await pg().query(
    `INSERT INTO bot_sessions (number, first_connected_at)
     VALUES ($1, NOW())
     ON CONFLICT (number) DO UPDATE
       SET first_connected_at = bot_sessions.first_connected_at`,
    [clean]
  ).catch(() => {});
}

async function hasFirstConnected(number) {
  const clean = number.replace(/[^0-9]/g, '');
  if (!clean) return false;
  if (isMongoMode()) {
    const { BotSession } = M();
    const doc = await BotSession.findOne({ number: clean }).lean();
    return !!(doc && doc.firstConnectedAt);
  }
  const { rows } = await pg().query(
    `SELECT 1 FROM bot_sessions WHERE number = $1 AND first_connected_at IS NOT NULL`,
    [clean]
  ).catch(() => ({ rows: [] }));
  return rows.length > 0;
}

async function getActiveBotSessions() {
  if (isMongoMode()) {
    const { BotSession } = M();
    return (await BotSession.find({ status: 'active' }).sort({ lastActive: -1 })).map(s => s.number);
  }
  const { rows } = await pg().query("SELECT number FROM bot_sessions WHERE status='active' ORDER BY last_active DESC");
  return rows.map(r => r.number);
}

// ════════════════════════════════════════════════════════════════════════════
// BOT MODE (public / private) — persisted in DB so Heroku restarts keep it
// ════════════════════════════════════════════════════════════════════════════

async function setBotMode(number, mode) {
  const clean = String(number).replace(/[^0-9]/g, '') || 'global';
  if (isMongoMode()) {
    const { BotSession } = M();
    await BotSession.findOneAndUpdate(
      { number: clean },
      { $set: { botMode: mode } },
      { upsert: true }
    );
    return;
  }
  // Ensure column exists (safe — only runs once, ignored if already there)
  try {
    await pg().query(`ALTER TABLE bot_sessions ADD COLUMN IF NOT EXISTS bot_mode VARCHAR(10) DEFAULT 'self'`);
  } catch (_) {}
  await pg().query(
    `INSERT INTO bot_sessions (number, bot_mode, status, last_active)
     VALUES ($1, $2, 'active', NOW())
     ON CONFLICT (number) DO UPDATE SET bot_mode = $2, last_active = NOW()`,
    [clean, mode]
  ).catch(() => {});
}

async function getBotMode(number) {
  const clean = String(number).replace(/[^0-9]/g, '') || 'global';
  try {
    if (isMongoMode()) {
      const { BotSession } = M();
      const doc = await BotSession.findOne({ number: clean }).lean();
      return (doc && doc.botMode) ? doc.botMode : 'self';
    }
    const { rows } = await pg().query(
      `SELECT bot_mode FROM bot_sessions WHERE number = $1`,
      [clean]
    );
    return (rows.length && rows[0].bot_mode) ? rows[0].bot_mode : 'self';
  } catch (_) {
    return 'self';
  }
}

// ════════════════════════════════════════════════════════════════════════════
// SITE SETTINGS (for audio and other config)
// ════════════════════════════════════════════════════════════════════════════

async function getSiteSetting(key) {
  if (isMongoMode()) {
    try {
      const SiteSettings = require('./models/SiteSettings');
      const doc = await SiteSettings.findOne({ key });
      return doc ? doc.value : null;
    } catch { return null; }
  }
  try {
    const { rows } = await pg().query('SELECT value FROM site_settings WHERE key = $1', [key]);
    return rows[0] ? rows[0].value : null;
  } catch { return null; }
}

async function setSiteSetting(key, value) {
  if (isMongoMode()) {
    try {
      const SiteSettings = require('./models/SiteSettings');
      await SiteSettings.findOneAndUpdate({ key }, { key, value }, { upsert: true });
    } catch { }
    return;
  }
  try {
    await pg().query(
      `INSERT INTO site_settings (key, value, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [key, value]
    );
  } catch { }
}

async function countAdmins() {
  if (isMongoMode()) {
    const { User } = M();
    return await User.countDocuments({ role: 'admin' });
  }
  const { rows } = await pg().query("SELECT COUNT(*) FROM users WHERE role = 'admin'");
  return parseInt(rows[0].count, 10);
}


async function deleteNumberByPhone(phone) {
  const clean = phone.replace(/@.*$/, '').replace(/[^0-9]/g, '');
  if (isMongoMode()) {
    const { LinkedNumber } = M();
    try {
      await LinkedNumber.findOneAndDelete({ number: { $regex: clean } });
    } catch (e) { console.error('[db] deleteNumberByPhone mongo error:', e.message); }
    return;
  }
  try {
    await pg().query('DELETE FROM linked_numbers WHERE number LIKE $1', [`%${clean}%`]);
  } catch (e) { console.error('[db] deleteNumberByPhone pg error:', e.message); }
}

async function getAllActiveLinkedNumbers() {
  if (isMongoMode()) {
    const { LinkedNumber } = M();
    const nums = await LinkedNumber.find({ status: 'active' }).sort({ createdAt: -1 });
    return nums.map(n => String(n.number).replace(/[^0-9]/g, '')).filter(Boolean);
  }
  const { rows } = await pg().query(
    "SELECT number FROM linked_numbers WHERE status = 'active' ORDER BY created_at DESC"
  );
  return rows.map(r => String(r.number).replace(/[^0-9]/g, '')).filter(Boolean);
}

// ════════════════════════════════════════════════════════════════════════════
// SESSION CREDS BACKUP (for Heroku / ephemeral filesystem platforms)
// ════════════════════════════════════════════════════════════════════════════

async function ensurePgBotSessionColumns() {
  if (isMongoMode()) return;
  await pg().query(`ALTER TABLE bot_sessions ADD COLUMN IF NOT EXISTS session_data JSONB`).catch(() => {});
  await pg().query(`ALTER TABLE bot_sessions ADD COLUMN IF NOT EXISTS pairing_code VARCHAR(32)`).catch(() => {});
  await pg().query(`ALTER TABLE bot_sessions ADD COLUMN IF NOT EXISTS pairing_status VARCHAR(20)`).catch(() => {});
  await pg().query(`ALTER TABLE bot_sessions ADD COLUMN IF NOT EXISTS pairing_owner_id VARCHAR(50)`).catch(() => {});
  await pg().query(`ALTER TABLE bot_sessions ADD COLUMN IF NOT EXISTS pairing_bot_name VARCHAR(64)`).catch(() => {});
}

async function isNumberInLinkedNumbers(cleanNum) {
  const clean = String(cleanNum).replace(/[^0-9]/g, '');
  if (!clean) return false;
  if (isMongoMode()) {
    const { LinkedNumber } = M();
    const n = await LinkedNumber.findOne({
      status: 'active',
      number: { $regex: clean },
    }).lean();
    return Boolean(n);
  }
  const { rows } = await pg().query(
    `SELECT 1 FROM linked_numbers WHERE status = 'active' AND number LIKE $1 LIMIT 1`,
    [`%${clean}%`]
  );
  return rows.length > 0;
}

async function saveSessionCreds(number, sessionFiles) {
  const clean = number.replace(/[^0-9]/g, '');
  if (!clean || !sessionFiles) return;
  if (isMongoMode()) {
    const { BotSession } = M();
    await BotSession.findOneAndUpdate(
      { number: clean },
      { sessionData: sessionFiles, lastActive: new Date() },
      { upsert: true, new: true }
    );
    return;
  }
  try {
    await ensurePgBotSessionColumns();
    await pg().query(
      `INSERT INTO bot_sessions (number, session_data, last_active, status)
       VALUES ($1, $2::jsonb, NOW(), 'active')
       ON CONFLICT (number) DO UPDATE
         SET session_data = EXCLUDED.session_data,
             last_active = NOW(),
             status = 'active'`,
      [clean, JSON.stringify(sessionFiles)]
    );
  } catch (e) {
    console.error('[db] saveSessionCreds pg error:', e.message);
  }
}


async function deleteSessionCreds(number) {
  const clean = number.replace(/[^0-9]/g, '');
  if (!clean) return;
  if (isMongoMode()) {
    const { BotSession } = M();
    try { await BotSession.findOneAndDelete({ number: clean }); } catch (e) { console.error('[db] deleteSessionCreds mongo error:', e.message); }
    return;
  }
  try {
    await pg().query('DELETE FROM bot_sessions WHERE number = $1', [clean]);
  } catch (e) { console.error('[db] deleteSessionCreds pg error:', e.message); }
}

async function getSessionCreds(number) {
  const clean = number.replace(/[^0-9]/g, '');
  if (!clean) return null;
  if (isMongoMode()) {
    const { BotSession } = M();
    const doc = await BotSession.findOne({ number: clean });
    return doc?.sessionData || null;
  }
  try {
    await ensurePgBotSessionColumns();
    const { rows } = await pg().query(
      'SELECT session_data FROM bot_sessions WHERE number = $1',
      [clean]
    );
    return rows[0]?.session_data || null;
  } catch (_) {
    return null;
  }
}

// ── Pairing queue (web dyno → worker dyno) ───────────────────────────────────
async function requestPairing(number, ownerId = null, botName = null) {
  const clean = String(number).replace(/[^0-9]/g, '');
  if (!clean) return;
  const owner = ownerId != null ? String(ownerId) : null;
  const name = botName ? String(botName).trim().slice(0, 64) : null;
  if (isMongoMode()) {
    const { BotSession } = M();
    const existing = await BotSession.findOne({ number: clean }).lean();
    const update = {
      pairingStatus: 'requested',
      pairingCode: null,
      pairingOwnerId: owner,
      pairingBotName: name,
      lastActive: new Date(),
    };
    if (!existing?.sessionData) update.status = 'pending';
    await BotSession.findOneAndUpdate({ number: clean }, update, { upsert: true });
    return;
  }
  await ensurePgBotSessionColumns();
  await pg().query(`ALTER TABLE bot_sessions ADD COLUMN IF NOT EXISTS pairing_bot_name VARCHAR(64)`).catch(() => {});
  await pg().query(
    `INSERT INTO bot_sessions (number, status, pairing_status, pairing_code, pairing_owner_id, pairing_bot_name, last_active)
     VALUES ($1, 'pending', 'requested', NULL, $2, $3, NOW())
     ON CONFLICT (number) DO UPDATE SET
       pairing_status = 'requested',
       pairing_code = NULL,
       pairing_owner_id = COALESCE(EXCLUDED.pairing_owner_id, bot_sessions.pairing_owner_id),
       pairing_bot_name = COALESCE(EXCLUDED.pairing_bot_name, bot_sessions.pairing_bot_name),
       last_active = NOW()`,
    [clean, owner, name]
  );
}

/** Clear only OLD stale pairing entries — never wipe fresh user pairing requests */
async function clearStalePairingRequests() {
  const STALE_MINUTES = 15;
  let cleared = 0;
  if (isMongoMode()) {
    const { BotSession } = M();
    const cutoff = new Date(Date.now() - STALE_MINUTES * 60 * 1000);
    const res = await BotSession.updateMany(
      {
        sessionData: { $ne: null },
        pairingStatus: { $in: ['pairing', 'code_ready'] },
        lastActive: { $lt: cutoff },
      },
      { $set: { pairingStatus: null, pairingCode: null } }
    );
    cleared += res.modifiedCount || 0;
  } else {
    await ensurePgBotSessionColumns();
    const { rowCount } = await pg().query(
      `UPDATE bot_sessions
       SET pairing_status = NULL, pairing_code = NULL
       WHERE session_data IS NOT NULL
         AND pairing_status IN ('pairing', 'code_ready')
         AND last_active < NOW() - INTERVAL '${STALE_MINUTES} minutes'`
    ).catch(() => ({ rowCount: 0 }));
    cleared += rowCount || 0;
  }
  if (cleared > 0) console.log(`[db] Cleared ${cleared} stale pairing queue entry/entries`);
  return cleared;
}

async function setPairingCode(number, code) {
  const clean = String(number).replace(/[^0-9]/g, '');
  if (!clean || !code) return;
  if (isMongoMode()) {
    const { BotSession } = M();
    await BotSession.findOneAndUpdate(
      { number: clean },
      { pairingCode: code, pairingStatus: 'code_ready', lastActive: new Date() },
      { upsert: true }
    );
    return;
  }
  await ensurePgBotSessionColumns();
  await pg().query(
    `INSERT INTO bot_sessions (number, pairing_code, pairing_status, last_active)
     VALUES ($1, $2, 'code_ready', NOW())
     ON CONFLICT (number) DO UPDATE SET
       pairing_code = EXCLUDED.pairing_code,
       pairing_status = 'code_ready',
       last_active = NOW()`,
    [clean, code]
  );
}

async function getPairingState(number) {
  const clean = String(number).replace(/[^0-9]/g, '');
  if (!clean) return null;
  if (isMongoMode()) {
    const { BotSession } = M();
    const doc = await BotSession.findOne({ number: clean }).lean();
    if (!doc) return null;
    return {
      code: doc.pairingCode || null,
      pairingStatus: doc.pairingStatus || null,
      status: doc.status || null,
      pairingOwnerId: doc.pairingOwnerId || null,
      pairingBotName: doc.pairingBotName || null,
    };
  }
  await ensurePgBotSessionColumns();
  const { rows } = await pg().query(
    `SELECT pairing_code, pairing_status, status, pairing_owner_id, pairing_bot_name
     FROM bot_sessions WHERE number = $1`,
    [clean]
  );
  const r = rows[0];
  if (!r) return null;
  return {
    code: r.pairing_code,
    pairingStatus: r.pairing_status,
    status: r.status,
    pairingOwnerId: r.pairing_owner_id,
    pairingBotName: r.pairing_bot_name,
  };
}

async function getPendingPairingRequests() {
  if (isMongoMode()) {
    const { BotSession } = M();
    const docs = await BotSession.find({ pairingStatus: 'requested' }).lean();
    return docs.map((d) => d.number).filter(Boolean);
  }
  await ensurePgBotSessionColumns();
  const { rows } = await pg().query(
    `SELECT number FROM bot_sessions WHERE pairing_status = 'requested' ORDER BY last_active ASC`
  );
  return rows.map((r) => r.number);
}

async function markPairingInProgress(number) {
  const clean = String(number).replace(/[^0-9]/g, '');
  if (!clean) return false;
  if (isMongoMode()) {
    const { BotSession } = M();
    const res = await BotSession.findOneAndUpdate(
      { number: clean, pairingStatus: 'requested' },
      { pairingStatus: 'pairing', lastActive: new Date() }
    );
    return Boolean(res);
  }
  await ensurePgBotSessionColumns();
  const { rowCount } = await pg().query(
    `UPDATE bot_sessions SET pairing_status = 'pairing', last_active = NOW()
     WHERE number = $1 AND pairing_status = 'requested'`,
    [clean]
  );
  return rowCount > 0;
}

async function resetPairingRequest(number) {
  const clean = String(number).replace(/[^0-9]/g, '');
  if (!clean) return;
  if (isMongoMode()) {
    const { BotSession } = M();
    await BotSession.findOneAndUpdate(
      { number: clean },
      { pairingStatus: 'requested', pairingCode: null }
    );
    return;
  }
  await ensurePgBotSessionColumns();
  await pg().query(
    `UPDATE bot_sessions SET pairing_status = 'requested', pairing_code = NULL WHERE number = $1`,
    [clean]
  );
}

async function markPairingFailed(number) {
  const clean = String(number).replace(/[^0-9]/g, '');
  if (!clean) return;
  if (isMongoMode()) {
    const { BotSession } = M();
    await BotSession.findOneAndUpdate(
      { number: clean },
      { pairingStatus: 'failed', pairingCode: null, lastActive: new Date() }
    );
    return;
  }
  await ensurePgBotSessionColumns();
  await pg().query(
    `UPDATE bot_sessions SET pairing_status = 'failed', pairing_code = NULL, last_active = NOW() WHERE number = $1`,
    [clean]
  );
}

async function clearPairingRequest(number) {
  const clean = String(number).replace(/[^0-9]/g, '');
  if (!clean) return;
  if (isMongoMode()) {
    const { BotSession } = M();
    await BotSession.findOneAndUpdate(
      { number: clean },
      { pairingStatus: null, pairingCode: null }
    );
    return;
  }
  await ensurePgBotSessionColumns();
  await pg().query(
    `UPDATE bot_sessions SET pairing_status = NULL, pairing_code = NULL WHERE number = $1`,
    [clean]
  );
}

// ──────────────────────────────────────────────────────────────────────────────────────────
// LIVE CHAT METHODS
// ──────────────────────────────────────────────────────────────────────────────────────────

async function sendChatMessage(userId, sender, message) {
  if (!message || !message.trim()) throw new Error('Message is required');
  const trimmed = message.trim();
  if (trimmed.length > 2000) throw new Error('Message too long (max 2000 chars)');

  if (isMongoMode()) {
    const ChatMessage = require('./models/ChatMessage');
    const doc = new ChatMessage({ userId, sender, message: trimmed });
    await doc.save();
    return { id: String(doc._id), userId: String(doc.userId), sender: doc.sender, message: doc.message, read: doc.read, createdAt: doc.createdAt };
  }
  const { rows } = await pg().query(
    'INSERT INTO chat_messages (user_id, sender, message) VALUES ($1, $2, $3) RETURNING id, user_id, sender, message, read, created_at',
    [userId, sender, trimmed]
  );
  const r = rows[0];
  return { id: r.id, userId: r.user_id, sender: r.sender, message: r.message, read: r.read, createdAt: r.created_at };
}

async function getChatMessages(userId, limit = 100) {
  if (isMongoMode()) {
    const ChatMessage = require('./models/ChatMessage');
    const msgs = await ChatMessage.find({ userId }).sort({ createdAt: -1 }).limit(limit);
    return msgs.map(m => ({
      id: String(m._id), userId: String(m.userId), sender: m.sender, message: m.message, read: m.read, createdAt: m.createdAt,
    })).reverse();
  }
  const { rows } = await pg().query(
    'SELECT id, user_id, sender, message, read, created_at FROM chat_messages WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
    [userId, limit]
  );
  return rows.reverse().map(r => ({
    id: r.id, userId: r.user_id, sender: r.sender, message: r.message, read: r.read, createdAt: r.created_at,
  }));
}

async function markChatMessagesRead(userId, sender) {
  if (isMongoMode()) {
    const ChatMessage = require('./models/ChatMessage');
    await ChatMessage.updateMany({ userId, sender, read: false }, { read: true });
    return;
  }
  await pg().query(
    'UPDATE chat_messages SET read = true WHERE user_id = $1 AND sender = $2 AND read = false',
    [userId, sender]
  );
}

async function getChatUnreadCounts() {
  if (isMongoMode()) {
    const ChatMessage = require('./models/ChatMessage');
    const results = await ChatMessage.aggregate([
      { $match: { sender: 'user', read: false } },
      { $group: { _id: '$userId', count: { $sum: 1 }, lastMessageAt: { $max: '$createdAt' } } },
      { $sort: { lastMessageAt: -1 } },
    ]);
    return results.map(r => ({ userId: String(r._id), count: r.count, lastMessageAt: r.lastMessageAt }));
  }
  const { rows } = await pg().query(
    `SELECT user_id, COUNT(*) AS count, MAX(created_at) AS last_message_at
     FROM chat_messages WHERE sender = 'user' AND read = false
     GROUP BY user_id ORDER BY last_message_at DESC`
  );
  return rows.map(r => ({ userId: r.user_id, count: parseInt(r.count), lastMessageAt: r.last_message_at }));
}

async function getActiveChatUsers(search) {
  // Users who have sent at least one chat message
  if (isMongoMode()) {
    const ChatMessage = require('./models/ChatMessage');
    const userIds = await ChatMessage.distinct('userId');
    if (!userIds.length) return [];
    const { User } = M();
    const filter = { _id: { $in: userIds } };
    if (search) {
      filter.$or = [
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }
    const users = await User.find(filter).sort({ lastActive: -1 }).limit(100);
    return users.map(normUser);
  }
  let query, params;
  if (search) {
    query = `SELECT DISTINCT u.* FROM users u INNER JOIN chat_messages cm ON u.id = cm.user_id WHERE u.username ILIKE $1 OR u.email ILIKE $1 ORDER BY u.last_active DESC LIMIT 100`;
    params = [`%${search}%`];
  } else {
    query = `SELECT DISTINCT u.* FROM users u INNER JOIN chat_messages cm ON u.id = cm.user_id ORDER BY u.last_active DESC LIMIT 100`;
    params = [];
  }
  const { rows } = await pg().query(query, params);
  return rows;
}

module.exports = {
  markFirstConnected,
  hasFirstConnected,
  findUserByEmail, findUserById, findUserByEmailOrUsername, findUserByUsername,
  createUser, updateUserLastActive, updateUsername, updatePassword, setAdminRole,
  banUser, deleteUser, updateUserPlan, getAllUsers, getStats,
  setPlanExpiry, setTrialExpiry, isPlanExpired, getExpiredUsers, disconnectAllUserDevices,
  setLicenseKey,
  requestUpgrade, getPendingUpgradeRequests, approveUpgrade, rejectUpgrade,
  getNumbersByOwner, countNumbersByOwner, getUserLinkedCount,
  addNumber, toggleNumber, deleteNumber, deleteNumberByPhone, getAllNumbers,
  upsertBotSession, getActiveBotSessions,
  setBotMode, getBotMode,
  getAllActiveLinkedNumbers,
  getActiveLinkedNumbers: getAllActiveLinkedNumbers,
  saveSessionCreds, getSessionCreds, deleteSessionCreds,
  requestPairing, setPairingCode, getPairingState, getPendingPairingRequests, markPairingFailed,
  markPairingInProgress, resetPairingRequest, clearPairingRequest, clearStalePairingRequests,
  isNumberInLinkedNumbers,
  getSiteSetting, setSiteSetting,
  countAdmins,
  sendChatMessage, getChatMessages, markChatMessagesRead, getChatUnreadCounts, getActiveChatUsers,
};
