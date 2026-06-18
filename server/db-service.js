'use strict';

const bcrypt = require('bcryptjs');
const { isMongoMode, getPool } = require('./db');

function M() {
  return {
    User:           require('./models/User'),
    LinkedNumber:   require('./models/LinkedNumber'),
    BotSession:     require('./models/BotSession'),
    PairingRequest: require('./models/PairingRequest'),
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
    trial_expires_at:  o.trialExpiresAt   || o.trial_expires_at  || null,
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

async function setTrialExpiry(id, expiresAt) {
  if (isMongoMode()) {
    const { User } = M();
    await User.findByIdAndUpdate(id, { trialExpiresAt: expiresAt });
    return;
  }
  await pg().query('UPDATE users SET trial_expires_at = $1 WHERE id = $2', [expiresAt, id]);
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
    query      = `SELECT id,username,email,role,subscription_plan,trial_expires_at,upgrade_request,upgrade_request_at,banned,last_active,created_at FROM users WHERE username ILIKE $1 OR email ILIKE $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`;
    countQuery = 'SELECT COUNT(*) FROM users WHERE username ILIKE $1 OR email ILIKE $1';
    params      = [`%${search}%`, parseInt(limit), offset];
    countParams = [`%${search}%`];
  } else {
    query      = `SELECT id,username,email,role,subscription_plan,trial_expires_at,upgrade_request,upgrade_request_at,banned,last_active,created_at FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2`;
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
  if (isMongoMode()) {
    const { LinkedNumber } = M();
    const n = new LinkedNumber({ number, botName, ownerId: userId });
    await n.save();
    return normNumber(n);
  }
  const { rows } = await pg().query(
    'INSERT INTO linked_numbers (number, bot_name, owner_id) VALUES ($1,$2,$3) RETURNING *',
    [number, botName, userId]
  );
  const r = rows[0];
  return { _id: r.id, number: r.number, botName: r.bot_name, status: r.status, ownerId: r.owner_id, lastActive: r.last_active, createdAt: r.created_at };
}

// ── Auto-save pairing owner info to bot_sessions so pair.js can save to linked_numbers ──
async function savePairingOwner(number, userId, botName) {
  const clean = String(number).replace(/[^0-9]/g, '');
  if (!clean) return;
  if (isMongoMode()) {
    const { BotSession } = M();
    try {
      await BotSession.findOneAndUpdate(
        { number: clean },
        { $set: { status: 'pending', pairingOwnerId: String(userId), pairingBotName: botName || 'CYBER PRO', lastActive: new Date() } },
        { upsert: true, new: true }
      );
    } catch (_) {}
    return;
  }
  try {
    await pg().query(
      `INSERT INTO bot_sessions (number, status, pairing_owner_id, pairing_bot_name, last_active)
       VALUES ($1, 'pending', $2, $3, NOW())
       ON CONFLICT (number) DO UPDATE
         SET pairing_owner_id = $2, pairing_bot_name = $3, last_active = NOW()`,
      [clean, String(userId), botName || 'CYBER PRO']
    );
  } catch (_) {}
}

async function ensurePairingRequest(number, opts = {}) {
  const force = opts.force === true;
  const clean = String(number).replace(/[^0-9]/g, '');
  if (!clean) return null;
  if (isMongoMode()) {
    const { PairingRequest, BotSession } = M();
    if (!force) {
      const existing = await PairingRequest.findOne({ number: clean }).lean().catch(() => null);
      if (existing && ['requested', 'in_progress', 'code_ready'].includes(existing.status)) {
        return existing;
      }
    }
    const doc = await PairingRequest.findOneAndUpdate(
      { number: clean },
      { $set: { status: 'requested', code: null, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
      { upsert: true, new: true }
    );
    try {
      await BotSession.findOneAndUpdate(
        { number: clean },
        { $set: { status: 'pending', pairingStatus: 'requested', pairingCode: null, lastActive: new Date() } },
        { upsert: true, new: true }
      );
    } catch (_) {}
    return doc ? { number: doc.number, status: doc.status, code: doc.code, updatedAt: doc.updatedAt } : null;
  }
  try {
    if (force) {
      await pg().query(
        `INSERT INTO bot_sessions (number, status, pairing_status, pairing_code, last_active)
         VALUES ($1, 'pending', 'requested', NULL, NOW())
         ON CONFLICT (number) DO UPDATE
           SET pairing_status = 'requested',
               pairing_code = NULL,
               status = CASE WHEN bot_sessions.status = 'active' THEN bot_sessions.status ELSE 'pending' END,
               last_active = NOW()`,
        [clean]
      );
    } else {
      await pg().query(
        `INSERT INTO bot_sessions (number, status, pairing_status, pairing_code, last_active)
         VALUES ($1, 'pending', 'requested', NULL, NOW())
         ON CONFLICT (number) DO UPDATE
           SET pairing_status = CASE
                 WHEN bot_sessions.pairing_status IN ('requested', 'in_progress', 'code_ready') THEN bot_sessions.pairing_status
                 ELSE 'requested'
               END,
               pairing_code = CASE
                 WHEN bot_sessions.pairing_status IN ('requested', 'in_progress', 'code_ready') THEN bot_sessions.pairing_code
                 ELSE NULL
               END,
               status = CASE WHEN bot_sessions.status = 'active' THEN bot_sessions.status ELSE 'pending' END,
               last_active = NOW()`,
        [clean]
      );
    }
  } catch (_) {}
  return { number: clean, status: 'requested', code: null };
}

async function setPairingCode(number, code) {
  const clean = String(number).replace(/[^0-9]/g, '');
  if (!clean || !code) return null;
  if (isMongoMode()) {
    const { PairingRequest, BotSession } = M();
    const reqDoc = await PairingRequest.findOneAndUpdate(
      { number: clean },
      { $set: { status: 'code_ready', code, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
      { upsert: true, new: true }
    );
    try {
      await BotSession.findOneAndUpdate(
        { number: clean },
        { $set: { pairingCode: code, pairingStatus: 'code_ready', lastActive: new Date() } },
        { upsert: true, new: true }
      );
    } catch (_) {}
    return reqDoc ? { number: reqDoc.number, status: reqDoc.status, code: reqDoc.code } : null;
  }
  try {
    await pg().query(
      `INSERT INTO bot_sessions (number, status, pairing_code, pairing_status, last_active)
       VALUES ($1, 'pending', $2, 'code_ready', NOW())
       ON CONFLICT (number) DO UPDATE
         SET pairing_code = $2,
             pairing_status = 'code_ready',
             status = CASE WHEN bot_sessions.status = 'active' THEN bot_sessions.status ELSE 'pending' END,
             last_active = NOW()`,
      [clean, code]
    );
  } catch (_) {}
  return { number: clean, status: 'code_ready', code };
}

async function getAndClearPairingOwner(number) {
  const clean = String(number).replace(/[^0-9]/g, '');
  if (!clean) return null;
  if (isMongoMode()) {
    const { BotSession } = M();
    try {
      const doc = await BotSession.findOneAndUpdate(
        { number: clean, pairingOwnerId: { $exists: true, $ne: null } },
        { $unset: { pairingOwnerId: 1, pairingBotName: 1 } },
        { new: false }
      );
      if (!doc) return null;
      return {
        user_id: doc.pairingOwnerId ? String(doc.pairingOwnerId) : null,
        bot_name: doc.pairingBotName || 'CYBER PRO',
      };
    } catch (_) { return null; }
  }
  try {
    const { rows } = await pg().query(
      `UPDATE bot_sessions
       SET pairing_owner_id = NULL, pairing_bot_name = NULL
       WHERE number = $1 AND pairing_owner_id IS NOT NULL
       RETURNING pairing_owner_id AS user_id, pairing_bot_name AS bot_name`,
      [clean]
    );
    return rows[0] || null;
  } catch (_) { return null; }
}

// ── Check if a number exists in linked_numbers table ────────────────────────
async function isNumberInLinkedNumbers(number) {
  const clean = String(number).replace(/[^0-9]/g, '');
  if (!clean) return false;
  if (isMongoMode()) {
    const { LinkedNumber } = M();
    try {
      const count = await LinkedNumber.countDocuments({
        number: { $regex: clean, $options: 'i' },
      });
      return count > 0;
    } catch (_) { return false; }
  }
  try {
    const { rows } = await pg().query(
      `SELECT id FROM linked_numbers WHERE REGEXP_REPLACE(number,'[^0-9]','','g') = $1 LIMIT 1`,
      [clean]
    );
    return rows.length > 0;
  } catch (_) { return false; }
}

// ── Per-number bot mode (self/public) stored in bot_sessions.bot_mode ───────
async function getBotMode(number) {
  const clean = String(number).replace(/[^0-9]/g, '');
  if (!clean) return 'public';
  try {
    const { rows } = await pg().query(
      'SELECT bot_mode FROM bot_sessions WHERE number=$1 LIMIT 1',
      [clean]
    );
    return rows[0]?.bot_mode || 'public';
  } catch (_) { return 'public'; }
}

async function setBotMode(number, mode) {
  const clean = String(number).replace(/[^0-9]/g, '');
  if (!clean) return;
  const safeMode = mode === 'self' ? 'self' : 'public';
  try {
    await pg().query(
      `INSERT INTO bot_sessions (number, status, bot_mode, last_active)
       VALUES ($1, 'active', $2, NOW())
       ON CONFLICT (number) DO UPDATE SET bot_mode=$2, last_active=NOW()`,
      [clean, safeMode]
    );
  } catch (_) {}
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
    const { BotSession, LinkedNumber } = M();
    await BotSession.findOneAndUpdate(
      { number: clean },
      { status, lastActive: new Date(), ...(status === 'active' ? { connectedAt: new Date() } : {}) },
      { upsert: true, new: true }
    );
    // ✅ Only sync 'active' to linked_numbers — never 'inactive'.
    // linked_numbers represents permanently enrolled numbers.
    // AutoLoad uses linked_numbers to find bots to restart after dyno boot.
    // Setting it to 'inactive' on disconnect would cause AutoLoad to find 0 bots → pairing loop.
    if (status === 'active') {
      try {
        await LinkedNumber.findOneAndUpdate(
          { number: { $regex: `^${clean}` } },
          { $set: { status: 'active', lastActive: new Date() } }
        );
      } catch (_) {}
    }
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
  // Only sync 'active' to linked_numbers for PostgreSQL too
  if (status === 'active') {
    try {
      await pg().query(
        `UPDATE linked_numbers SET status='active', last_active=NOW()
         WHERE REGEXP_REPLACE(number,'[^0-9]','','g')=$1`,
        [clean]
      );
    } catch (_) {}
  }
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
    const { LinkedNumber, BotSession } = M();
    // Check BOTH collections — BotSession catches bots that connected but have no LinkedNumber record
    const [linked, sessions] = await Promise.all([
      LinkedNumber.find({ status: 'active' }).lean(),
      BotSession.find({ status: 'active' }).lean(),
    ]);
    const numSet = new Set();
    linked.forEach(n => { const c = String(n.number).replace(/[^0-9]/g, ''); if (c) numSet.add(c); });
    sessions.forEach(s => { const c = String(s.number).replace(/[^0-9]/g, ''); if (c) numSet.add(c); });
    return [...numSet];
  }
  const { rows } = await pg().query(
    "SELECT number FROM linked_numbers WHERE status = 'active' ORDER BY created_at DESC"
  );
  return rows.map(r => String(r.number).replace(/[^0-9]/g, '')).filter(Boolean);
}

// ════════════════════════════════════════════════════════════════════════════
// SESSION CREDS BACKUP (for Heroku / ephemeral filesystem platforms)
// ════════════════════════════════════════════════════════════════════════════

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
  // PostgreSQL: store session files as JSONB so bot can restore after Heroku restart
  try {
    await pg().query(
      `INSERT INTO bot_sessions (number, status, session_data, last_active)
       VALUES ($1, 'active', $2::jsonb, NOW())
       ON CONFLICT (number) DO UPDATE
         SET session_data = $2::jsonb, last_active = NOW()`,
      [clean, JSON.stringify(sessionFiles)]
    );
  } catch (err) {
    // Non-fatal: log and continue — filesystem creds still usable locally
    console.error('[db-service] saveSessionCreds PG error:', err.message);
  }
}

async function getSessionCreds(number) {
  const clean = number.replace(/[^0-9]/g, '');
  if (!clean) return null;
  if (isMongoMode()) {
    const { BotSession } = M();
    const doc = await BotSession.findOne({ number: clean });
    return doc?.sessionData || null;
  }
  // PostgreSQL: read session_data JSONB column
  try {
    const { rows } = await pg().query(
      'SELECT session_data FROM bot_sessions WHERE number=$1 AND session_data IS NOT NULL LIMIT 1',
      [clean]
    );
    if (rows.length > 0 && rows[0].session_data) {
      return rows[0].session_data;
    }
  } catch (err) {
    console.error('[db-service] getSessionCreds PG error:', err.message);
  }
  return null;
}

// ════════════════════════════════════════════════════════════════════════════
// PLAN EXPIRY — used by server/jobs/planExpiryJob.js
// ════════════════════════════════════════════════════════════════════════════

async function getExpiredUsers() {
  const now = new Date();
  if (isMongoMode()) {
    const { User } = M();
    // Users whose trialExpiresAt has passed and plan is not 'free'
    const users = await User.find({
      trialExpiresAt: { $lt: now, $ne: null },
      subscriptionPlan: { $ne: 'free' },
      banned: { $ne: true },
    }).lean();
    return users.map(u => ({
      id: String(u._id),
      username: u.username,
      email: u.email,
      subscriptionPlan: u.subscriptionPlan,
      trialExpiresAt: u.trialExpiresAt,
    }));
  }
  // PostgreSQL fallback
  try {
    const { rows } = await pg().query(
      `SELECT id, username, email, subscription_plan, trial_expires_at FROM users
       WHERE trial_expires_at < $1 AND trial_expires_at IS NOT NULL
         AND subscription_plan != 'free' AND (banned IS NULL OR banned = false)`,
      [now]
    );
    return rows.map(r => ({
      id: String(r.id),
      username: r.username,
      email: r.email,
      subscriptionPlan: r.subscription_plan,
      trialExpiresAt: r.trial_expires_at,
    }));
  } catch (_) { return []; }
}

async function disconnectAllUserDevices(userId) {
  let disconnected = 0;
  try {
    if (isMongoMode()) {
      const { LinkedNumber } = M();
      const nums = await LinkedNumber.find({ ownerId: userId, status: 'active' }).lean();
      disconnected = nums.length;
      // Mark all linked numbers inactive
      await LinkedNumber.updateMany({ ownerId: userId }, { $set: { status: 'inactive', lastActive: new Date() } });
      // Also deactivate BotSessions so autoload doesn't reconnect them
      const { BotSession } = M();
      const numList = nums.map(n => String(n.number).replace(/[^0-9]/g, '')).filter(Boolean);
      if (numList.length > 0) {
        await BotSession.updateMany({ number: { $in: numList } }, { $set: { status: 'inactive', lastActive: new Date() } });
      }
      // Downgrade user plan to free
      const { User } = M();
      await User.findByIdAndUpdate(userId, { $set: { subscriptionPlan: 'free', trialExpiresAt: null } });
    } else {
      const { rows } = await pg().query(
        "UPDATE linked_numbers SET status='inactive', last_active=NOW() WHERE owner_id=$1 AND status='active' RETURNING id",
        [userId]
      );
      disconnected = rows.length;
      await pg().query(
        "UPDATE users SET subscription_plan='free', trial_expires_at=NULL WHERE id=$1",
        [userId]
      );
    }
  } catch (err) {
    console.error('[db-service] disconnectAllUserDevices:', err.message);
  }
  return { disconnected };
}

// ════════════════════════════════════════════════════════════════════════════
// PAIRING QUEUE — used by worker/pairing-processor.js (isolated mode)
// ════════════════════════════════════════════════════════════════════════════

async function getPendingPairingRequests() {
  try {
    if (isMongoMode()) {
      const { PairingRequest } = M();
      const docs = await PairingRequest.find({ status: 'requested' })
        .sort({ createdAt: 1 }).limit(5).lean();
      return docs.map(d => String(d.number).replace(/[^0-9]/g, '')).filter(Boolean);
    }
    const { rows } = await pg().query(
      `SELECT number FROM bot_sessions
       WHERE pairing_status = 'requested'
       ORDER BY last_active ASC NULLS LAST
       LIMIT 5`
    );
    return rows.map(r => String(r.number).replace(/[^0-9]/g, '')).filter(Boolean);
  } catch (err) {
    console.error('[db-service] getPendingPairingRequests:', err.message);
    return [];
  }
}

async function markPairingInProgress(clean) {
  try {
    if (isMongoMode()) {
      const { PairingRequest } = M();
      const res = await PairingRequest.findOneAndUpdate(
        { number: clean, status: 'requested' },
        { $set: { status: 'in_progress', updatedAt: new Date() } },
        { new: false }
      );
      return !!res;
    }
    const { rowCount } = await pg().query(
      `UPDATE bot_sessions
       SET pairing_status = 'in_progress', last_active = NOW()
       WHERE number = $1 AND pairing_status = 'requested'`,
      [clean]
    );
    return rowCount > 0;
  } catch (err) {
    console.error('[db-service] markPairingInProgress:', err.message);
    return false;
  }
}

async function resetPairingRequest(clean) {
  try {
    if (!isMongoMode()) return;
    const { PairingRequest } = M();
    await PairingRequest.findOneAndUpdate(
      { number: clean },
      { $set: { status: 'requested', updatedAt: new Date() } }
    );
  } catch (err) {
    console.error('[db-service] resetPairingRequest:', err.message);
  }
}

async function markPairingFailed(clean) {
  try {
    if (!isMongoMode()) return;
    const { PairingRequest } = M();
    await PairingRequest.findOneAndUpdate(
      { number: clean },
      { $set: { status: 'failed', updatedAt: new Date() } }
    );
  } catch (err) {
    console.error('[db-service] markPairingFailed:', err.message);
  }
}

async function getPairingState(clean) {
  try {
    if (isMongoMode()) {
      const { PairingRequest } = M();
      const reqDoc = await PairingRequest.findOne({ number: clean }).lean();
      if (reqDoc) {
        return {
          code: reqDoc.code,
          status: reqDoc.status,
          updatedAt: reqDoc.updatedAt || reqDoc.createdAt || null,
        };
      }
      const { BotSession } = M();
      const botDoc = await BotSession.findOne({ number: clean }).lean().catch(() => null);
      if (!botDoc) return null;
      return {
        code: botDoc.pairingCode || null,
        status: botDoc.pairingStatus || botDoc.status || null,
        updatedAt: botDoc.lastActive || null,
      };
    }
    const { rows } = await pg().query(
      'SELECT pairing_code, pairing_status, last_active FROM bot_sessions WHERE number=$1 LIMIT 1',
      [clean]
    );
    if (!rows[0]) return null;
    const row = rows[0];
    return {
      code: row.pairing_code || null,
      status: row.pairing_status || null,
      updatedAt: row.last_active || null,
    };
  } catch (err) {
    console.error('[db-service] getPairingState:', err.message);
    return null;
  }
}

async function setLinkedNumberStatus(phone, status) {
  const clean = String(phone).replace(/@.*$/, '').replace(/[^0-9]/g, '');
  if (!clean) return;
  const safeStatus = status === 'active' ? 'active' : 'inactive';
  if (isMongoMode()) {
    const { LinkedNumber } = M();
    try {
      await LinkedNumber.findOneAndUpdate(
        { number: { $regex: `^${clean}` } },
        { $set: { status: safeStatus, lastActive: new Date() } }
      );
    } catch (e) {
      console.error('[db] setLinkedNumberStatus mongo error:', e.message);
    }
    return;
  }
  try {
    await pg().query(
      `UPDATE linked_numbers SET status=$2, last_active=NOW()
       WHERE REGEXP_REPLACE(number,'[^0-9]','','g') = $1`,
      [clean, safeStatus]
    );
  } catch (e) {
    console.error('[db] setLinkedNumberStatus pg error:', e.message);
  }
}

async function clearPairingRequest(clean) {
  const number = String(clean).replace(/[^0-9]/g, '');
  if (!number) return;
  if (isMongoMode()) {
    const { PairingRequest, BotSession } = M();
    try { await PairingRequest.deleteOne({ number }); } catch (_) {}
    try {
      await BotSession.findOneAndUpdate(
        { number },
        { $unset: { pairingCode: 1, pairingStatus: 1 }, $set: { lastActive: new Date() } },
        { upsert: false }
      );
    } catch (_) {}
    return;
  }
  try {
    await pg().query(
      `UPDATE bot_sessions
       SET pairing_code = NULL,
           pairing_status = NULL,
           last_active = NOW()
       WHERE number = $1`,
      [number]
    );
  } catch (_) {}
}

async function clearStalePairingRequests() {
  try {
    if (!isMongoMode()) return;
    const { PairingRequest } = M();
    const cutoff = new Date(Date.now() - 15 * 60 * 1000);
    await PairingRequest.deleteMany({
      status: { $in: ['requested', 'in_progress', 'failed'] },
      updatedAt: { $lt: cutoff }
    });
  } catch (err) {
    console.error('[db-service] clearStalePairingRequests:', err.message);
  }
}


async function deleteSessionCreds(number) {
  const clean = String(number).replace(/[^0-9]/g, '');
  if (!clean) return;
  if (isMongoMode()) {
    try {
      const { BotSession } = M();
      await BotSession.findOneAndUpdate({ number: clean }, { $unset: { sessionData: 1 } });
    } catch (_) {}
    return;
  }
  // PostgreSQL: clear persisted session blob so the next pairing starts clean
  // and orphan/expiry cleanup can't be undone by a restored session.
  try {
    await pg().query(
      `UPDATE bot_sessions SET session_data = NULL WHERE number = $1`,
      [clean]
    );
  } catch (_) {}
}

async function hasFirstConnected(number) {
  const clean = String(number).replace(/[^0-9]/g, '');
  if (!clean) return false;
  if (isMongoMode()) {
    try {
      const { BotSession } = M();
      const doc = await BotSession.findOne({ number: clean }).select('firstConnectedAt').lean();
      return Boolean(doc?.firstConnectedAt);
    } catch (_) { return false; }
  }
  try {
    const { rows } = await pg().query(
      'SELECT first_connected_at FROM bot_sessions WHERE number=$1 LIMIT 1',
      [clean]
    );
    return Boolean(rows[0]?.first_connected_at);
  } catch (_) { return false; }
}

async function markFirstConnected(number) {
  const clean = String(number).replace(/[^0-9]/g, '');
  if (!clean) return;
  if (isMongoMode()) {
    try {
      const { BotSession } = M();
      await BotSession.findOneAndUpdate(
        { number: clean },
        [
          {
            $set: {
              number: clean,
              firstConnectedAt: { $ifNull: ['$firstConnectedAt', new Date()] },
              lastActive: new Date(),
            }
          }
        ],
        { upsert: true, new: true }
      );
    } catch (_) {}
    return;
  }
  try {
    await pg().query(
      `INSERT INTO bot_sessions (number, status, first_connected_at, last_active)
       VALUES ($1, 'active', NOW(), NOW())
       ON CONFLICT (number) DO UPDATE
         SET first_connected_at = COALESCE(bot_sessions.first_connected_at, NOW()),
             last_active = NOW()`,
      [clean]
    );
  } catch (_) {}
}

// ── isPlanExpired — used by auth middleware & routes ──────────────────────────
function isPlanExpired(user) {
  if (!user) return false;
  // Admins never expire
  if (user.role === 'admin') return false;
  const plan = user.subscription_plan || user.subscriptionPlan || 'free';
  // Paid plans expire via plan_expires_at if set by admin
  if (plan === 'pro' || plan === 'enterprise') {
    const planExp = user.plan_expires_at || user.planExpiresAt || null;
    if (!planExp) return false;
    return new Date(planExp) < new Date();
  }
  // Free trial: check trial_expires_at
  const expiresAt = user.trial_expires_at || user.trialExpiresAt || null;
  if (!expiresAt) return false;
  return new Date(expiresAt) < new Date();
}

module.exports = {
  findUserByEmail, findUserById, findUserByEmailOrUsername, findUserByUsername,
  createUser, updateUserLastActive, updateUsername, updatePassword, setAdminRole,
  banUser, deleteUser, updateUserPlan, getAllUsers, getStats,
  setTrialExpiry, requestUpgrade, getPendingUpgradeRequests, approveUpgrade, rejectUpgrade,
  getNumbersByOwner, countNumbersByOwner, getUserLinkedCount,
  addNumber, toggleNumber, deleteNumber, deleteNumberByPhone, getAllNumbers,
  setLinkedNumberStatus,
  savePairingOwner, getAndClearPairingOwner, isNumberInLinkedNumbers,
  getBotMode, setBotMode,
  upsertBotSession, getActiveBotSessions,
  getAllActiveLinkedNumbers,
  saveSessionCreds, getSessionCreds,
  getSiteSetting, setSiteSetting,
  countAdmins,
  getPendingPairingRequests, markPairingInProgress, resetPairingRequest,
  markPairingFailed, getPairingState, clearPairingRequest, ensurePairingRequest,
  setPairingCode, clearStalePairingRequests,
  getExpiredUsers, disconnectAllUserDevices,
  deleteSessionCreds,
  hasFirstConnected, markFirstConnected,
  isPlanExpired,
};
