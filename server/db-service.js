'use strict';

const bcrypt = require('bcryptjs');
const { isMongoMode, getPool } = require('./db');

function M() {
  return {
    User:           require('./models/User'),
    LinkedNumber:   require('./models/LinkedNumber'),
    BotSession:     require('./models/BotSession'),
    PairingRequest: require('./models/PairingRequest'),
    ChatMessage:    require('./models/ChatMessage'),
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
  if (excludeId != null && excludeId !== '') {
    const { rows } = await pg().query(
      'SELECT id FROM users WHERE username = $1 AND id != $2',
      [username, excludeId]
    );
    return rows[0] || null;
  }
  const { rows } = await pg().query(
    'SELECT id FROM users WHERE username = $1 LIMIT 1',
    [username]
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
  // User deletion is a destructive operation, so remove every runtime/session
  // artifact before deleting the owner record. Otherwise an autoload sweep can
  // resurrect a deleted WhatsApp number from a stale BotSession or disk creds.
  const cleanNumbers = [];
  const clean = (value) => String(value || '').replace(/[^0-9]/g, '');
  const wipeLocalNumber = (number) => {
    const n = clean(number);
    if (!n) return;
    const fs = require('fs');
    const path = require('path');
    const base = path.join(process.cwd(), 'nexstore', 'pairing');
    for (const dir of [path.join(base, n), path.join(base, `${n}@s.whatsapp.net`)]) {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
    }
    try { fs.rmSync(path.join(base, `pairing_${n}.json`), { force: true }); } catch (_) {}
    try { fs.rmSync(path.join(base, 'pairing.json'), { force: true }); } catch (_) {}
    try {
      const { removeConnectedFlag } = require('../allfunc/connected-flag');
      removeConnectedFlag(n);
    } catch (_) {}
    try {
      // Keep deleted numbers blocked from automatic reconnect. A future
      // pairing request explicitly removes this marker after it has wiped the
      // old session.
      const { addToStoppedBots } = require('../allfunc/stopped-bots');
      addToStoppedBots(n);
    } catch (_) {}
  };

  const stopRuntimeNumber = (number) => {
    const n = clean(number);
    if (!n) return;
    // The supervisor wraps pair.stopBot() and intentionally ignores normal
    // stops while a pairing child is in flight. Admin deletion must override
    // that guard, otherwise the deleted account can finish pairing later.
    try {
      const { stopBotExternal } = require('../worker/supervisor');
      if (typeof stopBotExternal === 'function') stopBotExternal(n);
    } catch (_) {}
    try {
      const { stopBot } = require('../pair');
      if (typeof stopBot === 'function') stopBot(n);
    } catch (_) {}
    wipeLocalNumber(n);
    cleanNumbers.push(n);
  };

  if (isMongoMode()) {
    const { User, LinkedNumber, BotSession, PairingRequest } = M();
    const owned = await LinkedNumber.find({ ownerId: id }).select('number').lean().catch(() => []);
    const pendingOwned = await BotSession.find({ pairingOwnerId: String(id) })
      .select('number').lean().catch(() => []);
    owned.push(...pendingOwned);
    for (const row of owned) stopRuntimeNumber(row.number);
    const numbers = [...new Set(cleanNumbers)];
    if (numbers.length) {
      await BotSession.deleteMany({ number: { $in: numbers } }).catch(() => {});
      await PairingRequest.deleteMany({ number: { $in: numbers } }).catch(() => {});
    }
    await BotSession.deleteMany({ pairingOwnerId: String(id) }).catch(() => {});
    await LinkedNumber.deleteMany({ ownerId: id });
    await User.findByIdAndDelete(id);
    return;
  }
  const { rows: owned } = await pg().query(
    `SELECT number FROM linked_numbers WHERE owner_id = $1`,
    [id]
  );
  const { rows: pendingOwned } = await pg().query(
    `SELECT number FROM bot_sessions WHERE pairing_owner_id = $1`,
    [String(id)]
  );
  owned.push(...pendingOwned);
  for (const row of owned) stopRuntimeNumber(row.number);
  const numbers = [...new Set(cleanNumbers)];
  if (numbers.length) {
    await pg().query(
      `DELETE FROM bot_sessions
       WHERE REGEXP_REPLACE(number, '[^0-9]', '', 'g') = ANY($1::text[])`,
      [numbers]
    );
  }
  await pg().query(
    `DELETE FROM bot_sessions WHERE pairing_owner_id = $1`,
    [String(id)]
  );
  await pg().query('DELETE FROM users WHERE id = $1', [id]);
}

async function updateUserPlan(id, plan, opts = {}) {
  const { activatedByAdmin = true, subscriptionExpiry = null } = opts;
  const subStatus = plan === 'pro' ? 'active_pro'
    : plan === 'enterprise' ? 'active_enterprise'
    : 'trial';
  if (isMongoMode()) {
    const { User } = M();
    const update = {
      subscriptionPlan: plan,
      subscriptionStatus: subStatus,
      upgradeRequest: 'none',
      activatedByAdmin: plan !== 'free' ? true : false,
    };
    // When upgrading to paid: clear trial expiry so trial logic never fires
    if (plan === 'pro' || plan === 'enterprise') {
      update.trialExpiresAt = null;
      if (subscriptionExpiry) update.subscriptionExpiry = subscriptionExpiry;
    }
    const u = await User.findByIdAndUpdate(id, update, { new: true });
    return u ? normUser(u) : null;
  }
  let query, params;
  if (plan === 'pro' || plan === 'enterprise') {
    query = `UPDATE users SET
      subscription_plan = $1,
      subscription_status = $2,
      upgrade_request = 'none',
      activated_by_admin = true,
      trial_expires_at = NULL,
      subscription_expiry = $3
    WHERE id = $4
    RETURNING id, username, email, subscription_plan, subscription_status`;
    params = [plan, subStatus, subscriptionExpiry, id];
  } else {
    query = `UPDATE users SET subscription_plan = $1, subscription_status = $2, upgrade_request = 'none' WHERE id = $3
    RETURNING id, username, email, subscription_plan, subscription_status`;
    params = [plan, subStatus, id];
  }
  const { rows } = await pg().query(query, params);
  return rows[0] || null;
}

async function setTrialExpiry(id, expiresAt) {
  const trialStart = new Date();
  if (isMongoMode()) {
    const { User } = M();
    await User.findByIdAndUpdate(id, {
      trialExpiresAt: expiresAt,
      trialStart: trialStart,
      subscriptionStatus: 'trial',
    });
    return;
  }
  await pg().query(
    'UPDATE users SET trial_expires_at = $1, trial_start = $2, subscription_status = $3 WHERE id = $4',
    [expiresAt, trialStart, 'trial', id]
  );
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
  const subStatus = plan === 'pro' ? 'active_pro' : 'active_enterprise';
  if (isMongoMode()) {
    const { User } = M();
    const u = await User.findByIdAndUpdate(id, {
      subscriptionPlan: plan,
      subscriptionStatus: subStatus,
      upgradeRequest: 'none',
      upgradeRequestAt: null,
      activatedByAdmin: true,
      trialExpiresAt: null,   // clear trial so it never re-triggers expiry
    }, { new: true });
    return u ? normUser(u) : null;
  }
  const { rows } = await pg().query(
    `UPDATE users SET
      subscription_plan = $1,
      subscription_status = $2,
      upgrade_request = 'none',
      upgrade_request_at = NULL,
      activated_by_admin = true,
      trial_expires_at = NULL
    WHERE id = $3
    RETURNING id, username, email, subscription_plan, subscription_status`,
    [plan, subStatus, id]
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
      {
        $set: {
          status: 'requested',
          code: null,
          attemptId: null,
          error: null,
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true, new: true }
    );
    try {
      await BotSession.findOneAndUpdate(
        { number: clean },
          {
            $set: {
              status: 'pending',
              pairingStatus: 'requested',
              pairingCode: null,
              pairingAttemptId: null,
              pairingError: null,
              lastActive: new Date(),
            },
          },
        { upsert: true, new: true }
      );
    } catch (_) {}
    return doc ? {
      number: doc.number,
      status: doc.status,
      code: doc.code,
      attemptId: doc.attemptId || null,
      updatedAt: doc.updatedAt,
    } : null;
  }
  try {
    if (force) {
      await pg().query(
        `INSERT INTO bot_sessions (number, status, pairing_status, pairing_code, last_active)
         VALUES ($1, 'pending', 'requested', NULL, NOW())
         ON CONFLICT (number) DO UPDATE
           SET pairing_status = 'requested',
               pairing_code = NULL,
               pairing_attempt_id = NULL,
               pairing_error = NULL,
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
               pairing_attempt_id = NULL,
               pairing_error = NULL,
               status = CASE WHEN bot_sessions.status = 'active' THEN bot_sessions.status ELSE 'pending' END,
               last_active = NOW()`,
        [clean]
      );
    }
  } catch (_) {}
  return { number: clean, status: 'requested', code: null };
}

async function setPairingCode(number, code, options = {}) {
  const clean = String(number).replace(/[^0-9]/g, '');
  if (!clean || !code) return null;
  const attemptId = options.attemptId ? String(options.attemptId) : null;
  if (isMongoMode()) {
    const { PairingRequest, BotSession } = M();
    const reqDoc = await PairingRequest.findOneAndUpdate(
      { number: clean },
      {
        $set: { status: 'code_ready', code, attemptId, error: null, updatedAt: new Date() },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true, new: true }
    );
    try {
      await BotSession.findOneAndUpdate(
        { number: clean },
        {
          $set: {
            pairingCode: code,
            pairingStatus: 'code_ready',
            pairingAttemptId: attemptId,
            pairingError: null,
            lastActive: new Date(),
          },
        },
        { upsert: true, new: true }
      );
    } catch (_) {}
    return reqDoc ? {
      number: reqDoc.number,
      status: reqDoc.status,
      code: reqDoc.code,
      attemptId: reqDoc.attemptId,
    } : null;
  }
  try {
    await pg().query(
      `INSERT INTO bot_sessions
         (number, status, pairing_code, pairing_status, pairing_attempt_id, pairing_error, last_active)
       VALUES ($1, 'pending', $2, 'code_ready', $3, NULL, NOW())
       ON CONFLICT (number) DO UPDATE
         SET pairing_code = $2,
             pairing_status = 'code_ready',
             pairing_attempt_id = $3,
             pairing_error = NULL,
             status = CASE WHEN bot_sessions.status = 'active' THEN bot_sessions.status ELSE 'pending' END,
             last_active = NOW()`,
      [clean, code, attemptId]
    );
  } catch (_) {}
  return { number: clean, status: 'code_ready', code, attemptId };
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
  if (isMongoMode()) {
    try {
      const { BotSession } = M();
      const doc = await BotSession.findOne({ number: clean }).select('botMode').lean();
      return doc?.botMode || 'public';
    } catch (_) { return 'public'; }
  }
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
  if (isMongoMode()) {
    try {
      const { BotSession } = M();
      await BotSession.findOneAndUpdate(
        { number: clean },
        { $set: { botMode: safeMode, lastActive: new Date() } },
        { upsert: true }
      );
    } catch (_) {}
    return;
  }
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

/** Persist WhatsApp socket connection state for dashboard + recovery. */
async function setBotConnectionStatus(number, connectionStatus, meta = {}) {
  const clean = String(number).replace(/[^0-9]/g, '');
  if (!clean || !connectionStatus) return;
  const now = new Date();
  if (isMongoMode()) {
    const { BotSession } = M();
    const $set = { connectionStatus, lastActive: now };
    if (meta.lastErrorMessage !== undefined) $set.lastErrorMessage = meta.lastErrorMessage;
    if (meta.reconnectAttempts !== undefined) $set.reconnectAttempts = meta.reconnectAttempts;
    if (meta.hostDyno !== undefined) $set.hostDyno = meta.hostDyno;
      if (meta.commandReady !== undefined) $set.commandReady = meta.commandReady;
      if (meta.wsState !== undefined) $set.wsState = meta.wsState;
    if (connectionStatus === 'CONNECTED') {
      $set.connectedAt = now;
      if (meta.lastErrorMessage === null) $set.lastErrorMessage = null;
      if (meta.reconnectAttempts === 0) $set.reconnectAttempts = 0;
    }
    await BotSession.findOneAndUpdate({ number: clean }, { $set }, { upsert: true });
    return;
  }
  try {
    const errMsg = meta.lastErrorMessage !== undefined ? meta.lastErrorMessage : null;
    const attempts = meta.reconnectAttempts !== undefined ? meta.reconnectAttempts : null;
    const hostDyno = meta.hostDyno !== undefined ? meta.hostDyno : null;
    await pg().query(
      `INSERT INTO bot_sessions (number, status, connection_status, last_error_message, reconnect_attempts, host_dyno, connected_at, last_active)
       VALUES ($1, 'pending', $2, $3, COALESCE($4, 0), $5, CASE WHEN $2 = 'CONNECTED' THEN NOW() ELSE NULL END, NOW())
       ON CONFLICT (number) DO UPDATE SET
         connection_status = $2,
         last_error_message = CASE
           WHEN $2 = 'CONNECTED' THEN NULL
           WHEN $3 IS NOT NULL THEN $3
           ELSE bot_sessions.last_error_message
         END,
          reconnect_attempts = COALESCE($4, bot_sessions.reconnect_attempts),
          host_dyno = COALESCE($5, bot_sessions.host_dyno),
          command_ready = COALESCE($6, bot_sessions.command_ready),
          ws_state = COALESCE($7, bot_sessions.ws_state),
         connected_at = CASE WHEN $2 = 'CONNECTED' THEN NOW() ELSE bot_sessions.connected_at END,
         last_active = NOW()`,
       [clean, connectionStatus, errMsg, attempts, hostDyno,
        meta.commandReady !== undefined ? meta.commandReady : null,
        meta.wsState !== undefined ? meta.wsState : null]
    );
  } catch (err) {
    console.error('[db-service] setBotConnectionStatus:', err.message);
  }
}

async function upsertBotSession(number, status, meta = {}) {
  const clean = number.replace(/[^0-9]/g, '');
  if (!clean) return;
  const now = new Date();
  const setFields = { status, lastActive: now };
  if (meta.commandReady !== undefined) {
    if (meta.commandReady === true) setFields.commandReady = true;
    // Never downgrade commandReady to false on reconnect
  }
  if (meta.wsState !== undefined) setFields.wsState = meta.wsState;
  if (status === 'active' && meta.commandReady === true) {
    setFields.connectedAt = now;
  } else if (status === 'active' && meta.commandReady === undefined) {
    setFields.connectedAt = now;
  }
  if (isMongoMode()) {
    const { BotSession, LinkedNumber } = M();
    await BotSession.findOneAndUpdate(
      { number: clean },
      setFields,
      { upsert: true, new: true }
    );
    if (status === 'active') {
      try {
        await LinkedNumber.findOneAndUpdate(
          { number: { $regex: `^${clean}` } },
          { $set: { status: 'active', lastActive: now } }
        );
      } catch (_) {}
    }
    return;
  }
  await pg().query(
    `INSERT INTO bot_sessions (number, status, connected_at, last_active, command_ready, ws_state)
     VALUES ($1, $2, $3, NOW(), $4, $5)
     ON CONFLICT (number) DO UPDATE
       SET status = $2,
           last_active = NOW(),
           command_ready = CASE WHEN $4 IS TRUE THEN TRUE ELSE bot_sessions.command_ready END,
           ws_state = COALESCE($5, bot_sessions.ws_state),
           connected_at = CASE
             WHEN $2='active' AND $4 IS TRUE THEN NOW()
             WHEN $2='active' AND $4 IS NULL THEN NOW()
             ELSE bot_sessions.connected_at
           END`,
    [
      clean,
      status,
      meta.commandReady === true || (status === 'active' && meta.commandReady === undefined) ? now : null,
      meta.commandReady !== undefined ? meta.commandReady : null,
      meta.wsState !== undefined ? meta.wsState : null,
    ]
  );
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

async function getBotSessionsByNumbers(numbers) {
  const cleans = [...new Set((numbers || []).map((n) => String(n).replace(/[^0-9]/g, '')).filter(Boolean))];
  if (!cleans.length) return {};
  const map = {};
  if (isMongoMode()) {
    const { BotSession } = M();
    const docs = await BotSession.find({ number: { $in: cleans } })
      .select('number status lastActive connectedAt commandReady wsState connectionStatus lastErrorMessage reconnectAttempts hostDyno')
      .lean();
    for (const s of docs) {
      map[s.number] = s;
    }
    return map;
  }
  const { rows } = await pg().query(
    `SELECT number, status, last_active AS "lastActive", connected_at AS "connectedAt",
            command_ready AS "commandReady", ws_state AS "wsState",
            connection_status AS "connectionStatus", last_error_message AS "lastErrorMessage",
            reconnect_attempts AS "reconnectAttempts", host_dyno AS "hostDyno"
     FROM bot_sessions WHERE number = ANY($1::text[])`,
    [cleans]
  );
  for (const r of rows) map[r.number] = r;
  return map;
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
  if (!clean) return;
  if (isMongoMode()) {
    const { LinkedNumber, BotSession } = M();
    try {
      // deleteMany handles duplicates; matches both "923..." and "923...@s.whatsapp.net"
      await LinkedNumber.deleteMany({
        number: { $regex: clean, $options: 'i' }
      });
    } catch (e) { console.error('[db] deleteNumberByPhone mongo LinkedNumber error:', e.message); }
    // Also mark bot_session as logged_out and clear session_data so restart won't auto-reconnect
    try {
      await BotSession.findOneAndUpdate(
        { number: clean },
        { $set: { status: 'inactive', connectionStatus: 'LOGGED_OUT', sessionData: null } }
      );
    } catch (e) { console.error('[db] deleteNumberByPhone mongo BotSession error:', e.message); }
    return;
  }
  try {
    await pg().query('DELETE FROM linked_numbers WHERE REGEXP_REPLACE(number,\'[^0-9]\',\'\',\'g\') = $1', [clean]);
  } catch (e) { console.error('[db] deleteNumberByPhone pg error:', e.message); }
  try {
    await pg().query(
      `UPDATE bot_sessions SET status='inactive', connection_status='LOGGED_OUT', session_data=NULL
       WHERE REGEXP_REPLACE(number,'[^0-9]','','g') = $1`,
      [clean]
    );
  } catch (e) { console.error('[db] deleteNumberByPhone pg BotSession clear error:', e.message); }
}

async function getAllActiveLinkedNumbers() {
  if (isMongoMode()) {
    const { LinkedNumber } = M();
    const linked = await LinkedNumber.find({ status: 'active' }).lean();
    return linked
      .map(n => String(n.number).replace(/[^0-9]/g, ''))
      .filter(Boolean);
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
    // Find users on 'trial' or 'free' plan whose trial has expired
    // AND who have NOT been upgraded to a paid plan by admin
    const users = await User.find({
      trialExpiresAt: { $lt: now, $ne: null },
      activatedByAdmin: { $ne: true },             // skip admin-activated paid users
      subscriptionStatus: { $nin: ['active_pro', 'active_enterprise', 'expired'] },
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
      `SELECT id, username, email, subscription_plan, subscription_status, trial_expires_at FROM users
       WHERE trial_expires_at < $1 AND trial_expires_at IS NOT NULL
         AND (activated_by_admin IS NULL OR activated_by_admin = false)
         AND (subscription_status IS NULL OR subscription_status NOT IN ('active_pro','active_enterprise','expired'))
         AND (banned IS NULL OR banned = false)`,
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

/**
 * Resolve the owning user's subscription status directly from a WhatsApp
 * number. Used by allfunc/subscription-guard.js to enforce trial-expiry
 * disconnects in real time (not just via the periodic planExpiryJob sweep).
 *
 * Returns null if the number isn't linked to any user (caller should treat
 * that as "not authorized" — a bot with no owner has nothing to protect).
 */
async function getOwnerSubscriptionByNumber(number) {
  const clean = String(number || '').replace(/[^0-9]/g, '');
  if (!clean) return null;
  try {
    if (isMongoMode()) {
      const { LinkedNumber, User } = M();
      // Prefix regex only narrows candidates (numbers are stored in varying
      // formats, e.g. with/without country-code prefix or '@s.whatsapp.net'
      // suffix) — the exact match below prevents disconnecting the wrong
      // owner when two numbers share a prefix (e.g. "923001234567" vs
      // "923001234567890").
      const candidates = await LinkedNumber.find({ number: { $regex: clean } })
        .sort({ createdAt: -1 }).lean();
      const linked = candidates.find(c => String(c.number).replace(/[^0-9]/g, '') === clean);
      if (!linked) return null;
      const user = await User.findById(linked.ownerId).lean();
      if (!user) return null;
      return {
        userId: String(user._id),
        banned: Boolean(user.banned),
        subscriptionStatus: user.subscriptionStatus || null,
        activatedByAdmin: Boolean(user.activatedByAdmin),
        trialExpiresAt: user.trialExpiresAt || null,
        linkedNumberStatus: linked.status,
      };
    }
    const { rows } = await pg().query(
      `SELECT u.id, u.banned, u.subscription_status, u.activated_by_admin, u.trial_expires_at, ln.status AS linked_status
       FROM linked_numbers ln
       JOIN users u ON u.id = ln.owner_id
       WHERE REGEXP_REPLACE(ln.number, '[^0-9]', '', 'g') = $1
       ORDER BY ln.created_at DESC LIMIT 1`,
      [clean]
    );
    if (!rows.length) return null;
    const r = rows[0];
    return {
      userId: String(r.id),
      banned: Boolean(r.banned),
      subscriptionStatus: r.subscription_status || null,
      activatedByAdmin: Boolean(r.activated_by_admin),
      trialExpiresAt: r.trial_expires_at || null,
      linkedNumberStatus: r.linked_status,
    };
  } catch (err) {
    console.error('[db-service] getOwnerSubscriptionByNumber:', err.message);
    return null;
  }
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
      await User.findByIdAndUpdate(userId, { $set: { subscriptionPlan: 'free', subscriptionStatus: 'expired', trialExpiresAt: null } });
    } else {
      const { rows } = await pg().query(
        "UPDATE linked_numbers SET status='inactive', last_active=NOW() WHERE owner_id=$1 AND status='active' RETURNING id",
        [userId]
      );
      disconnected = rows.length;
      await pg().query(
        "UPDATE users SET subscription_plan='free', subscription_status='expired', trial_expires_at=NULL WHERE id=$1",
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

/**
 * Requests stuck in `in_progress` are orphaned when the process that claimed
 * them restarts or crashes — the number then becomes permanently unpairable.
 * Return anything older than 5 minutes back to `requested`.
 */
async function reclaimStalePairingClaims(staleMs = 5 * 60_000) {
  try {
    const cutoff = new Date(Date.now() - staleMs);
    if (isMongoMode()) {
      const { PairingRequest } = M();
      const res = await PairingRequest.updateMany(
        { status: 'in_progress', updatedAt: { $lt: cutoff } },
        { $set: { status: 'requested', updatedAt: new Date() } }
      );
      if (res?.modifiedCount) {
        console.log(`[db-service] Reclaimed ${res.modifiedCount} stale pairing claim(s)`);
      }
      return res?.modifiedCount || 0;
    }
    const { rowCount } = await pg().query(
      `UPDATE bot_sessions
       SET pairing_status = 'requested'
       WHERE pairing_status = 'in_progress'
         AND (last_active IS NULL OR last_active < NOW() - INTERVAL '5 minutes')`
    );
    if (rowCount) console.log(`[db-service] Reclaimed ${rowCount} stale pairing claim(s)`);
    return rowCount;
  } catch (err) {
    console.error('[db-service] reclaimStalePairingClaims:', err.message);
    return 0;
  }
}

async function getPendingPairingRequests() {
  try {
    await reclaimStalePairingClaims();
    if (isMongoMode()) {
      const { PairingRequest, LinkedNumber } = M();
      const docs = await PairingRequest.find({ status: 'requested' })
        .sort({ createdAt: 1 }).limit(20).lean();
      const candidates = docs.map(d => String(d.number).replace(/[^0-9]/g, '')).filter(Boolean);
      if (!candidates.length) return [];

      // Filter out numbers that are already active in linked_numbers (source of truth).
      // This prevents sending a fresh pairing code to a number that is already paired.
      const activeLinked = await LinkedNumber.find({
        $or: candidates.map(n => ({ number: { $regex: `^${n}` } })),
        status: 'active',
      }).select('number').lean().catch(() => []);
      const activeSet = new Set(
        activeLinked.map(d => String(d.number).replace(/[^0-9]/g, ''))
      );

      // Clear stale pairing requests for already-active numbers (fire-and-forget)
      for (const n of candidates) {
        if (activeSet.has(n)) {
          PairingRequest.deleteOne({ number: n }).catch(() => {});
        }
      }

      return candidates.filter(n => !activeSet.has(n)).slice(0, 5);
    }

    // PostgreSQL: exclude numbers already active in linked_numbers
    const { rows } = await pg().query(
      `SELECT bs.number FROM bot_sessions bs
       WHERE bs.pairing_status = 'requested'
         AND NOT EXISTS (
           SELECT 1 FROM linked_numbers ln
           WHERE REGEXP_REPLACE(ln.number,'[^0-9]','','g')
               = REGEXP_REPLACE(bs.number,'[^0-9]','','g')
             AND ln.status = 'active'
         )
       ORDER BY bs.last_active ASC NULLS LAST
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
    if (isMongoMode()) {
      const { PairingRequest } = M();
      await PairingRequest.findOneAndUpdate(
        { number: clean },
        { $set: { status: 'requested', code: null, attemptId: null, error: null, updatedAt: new Date() } }
      );
      return;
    }
    await pg().query(
      `UPDATE bot_sessions
         SET pairing_status = 'requested',
             pairing_code = NULL,
             pairing_attempt_id = NULL,
             pairing_error = NULL,
             last_active = NOW()
       WHERE number = $1`,
      [clean]
    );
  } catch (err) {
    console.error('[db-service] resetPairingRequest:', err.message);
  }
}

async function markPairingFailed(clean, reason = null) {
  const number = String(clean).replace(/[^0-9]/g, '');
  const error = reason ? String(reason).slice(0, 500) : null;
  try {
    if (isMongoMode()) {
      const { PairingRequest, BotSession } = M();
      await PairingRequest.findOneAndUpdate(
        { number },
        { $set: { status: 'failed', code: null, error, updatedAt: new Date() } }
      );
      try {
        await BotSession.findOneAndUpdate(
          { number },
          {
            $set: {
              pairingStatus: 'failed',
              pairingCode: null,
              pairingError: error,
              lastActive: new Date(),
            },
          }
        );
      } catch (_) {}
      return;
    }
    await pg().query(
      `UPDATE bot_sessions
       SET pairing_status = 'failed',
           pairing_code = NULL,
           pairing_error = $2,
           last_active = NOW()
       WHERE number = $1`,
      [number, error]
    );
  } catch (err) {
    console.error('[db-service] markPairingFailed:', err.message);
  }
}

async function markPairingConnected(clean) {
  const number = String(clean).replace(/[^0-9]/g, '');
  if (!number) return;
  try {
    if (isMongoMode()) {
      const { PairingRequest, BotSession } = M();
      await PairingRequest.findOneAndUpdate(
        { number },
        {
          $set: { status: 'active', code: null, attemptId: null, error: null, updatedAt: new Date() },
        },
        { upsert: false }
      ).catch(() => {});
      await BotSession.findOneAndUpdate(
        { number },
        {
          $set: {
            pairingStatus: 'active',
            pairingCode: null,
            pairingAttemptId: null,
            pairingError: null,
            lastActive: new Date(),
          },
        },
        { upsert: false }
      ).catch(() => {});
      return;
    }
    await pg().query(
      `UPDATE bot_sessions
       SET pairing_status = 'active',
           pairing_code = NULL,
           pairing_attempt_id = NULL,
           pairing_error = NULL,
           last_active = NOW()
       WHERE number = $1`,
      [number]
    );
  } catch (err) {
    console.error('[db-service] markPairingConnected:', err.message);
  }
}

async function getPairingState(clean) {
  try {
    if (isMongoMode()) {
      const { PairingRequest } = M();
      const reqDoc = await PairingRequest.findOne({ number: clean }).lean();
      if (reqDoc) {
        const code = ['code_ready'].includes(reqDoc.status) ? reqDoc.code : null;
        return {
          code,
          status: reqDoc.status,
          attemptId: reqDoc.attemptId || null,
          error: reqDoc.error || null,
          updatedAt: reqDoc.updatedAt || reqDoc.createdAt || null,
        };
      }
      const { BotSession } = M();
      const botDoc = await BotSession.findOne({ number: clean }).lean().catch(() => null);
      if (!botDoc) return null;
      const ps = botDoc.pairingStatus || null;
      const code = ps === 'code_ready' ? (botDoc.pairingCode || null) : null;
      return {
        code,
        status: ps || botDoc.status || null,
        attemptId: botDoc.pairingAttemptId || null,
        error: botDoc.pairingError || null,
        updatedAt: botDoc.lastActive || null,
      };
    }
    const { rows } = await pg().query(
      `SELECT pairing_code, pairing_status, pairing_attempt_id, pairing_error, last_active
       FROM bot_sessions WHERE number=$1 LIMIT 1`,
      [clean]
    );
    if (!rows[0]) return null;
    const row = rows[0];
    const code = row.pairing_status === 'code_ready' ? (row.pairing_code || null) : null;
    return {
      code,
      status: row.pairing_status || null,
      attemptId: row.pairing_attempt_id || null,
      error: row.pairing_error || null,
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
        {
          $unset: {
            pairingCode: 1,
            pairingStatus: 1,
             pairingAttemptId: 1,
             pairingError: 1,
            pairingOwnerId: 1,
            pairingBotName: 1,
          },
          $set: { lastActive: new Date() }
        },
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
           pairing_attempt_id = NULL,
           pairing_error = NULL,
           pairing_owner_id = NULL,
           pairing_bot_name = NULL,
           last_active = NOW()
       WHERE number = $1`,
      [number]
    );
  } catch (_) {}
}

async function clearStalePairingRequests() {
  try {
    const cutoff = new Date(Date.now() - 15 * 60 * 1000);
    if (isMongoMode()) {
      const { PairingRequest } = M();
      await PairingRequest.deleteMany({
        status: { $in: ['requested', 'in_progress', 'failed'] },
        updatedAt: { $lt: cutoff }
      });
      return;
    }
    await pg().query(
      `UPDATE bot_sessions
       SET pairing_code = NULL, pairing_status = NULL
       WHERE pairing_status IN ('requested', 'in_progress', 'failed', 'code_ready')
         AND last_active < NOW() - INTERVAL '15 minutes'
         AND status != 'active'`
    );
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

  // ── Priority 1: subscriptionStatus field (new system) ──
  const subStatus = user.subscription_status || user.subscriptionStatus || null;
  if (subStatus === 'expired') return true;
  if (subStatus === 'active_pro' || subStatus === 'active_enterprise') return false;

  // ── Priority 2: activatedByAdmin flag — paid users are never downgraded ──
  const adminActivated = user.activated_by_admin || user.activatedByAdmin || false;
  if (adminActivated) return false;

  const plan = user.subscription_plan || user.subscriptionPlan || 'free';

  // ── Priority 3: Paid plans — check plan_expires_at if admin set an end date ──
  if (plan === 'pro' || plan === 'enterprise') {
    const planExp = user.plan_expires_at || user.planExpiresAt || null;
    if (!planExp) return false;   // no expiry set = lifetime plan
    return new Date(planExp) < new Date();
  }

  // ── Priority 4: Free trial — check trial_expires_at ──
  const expiresAt = user.trial_expires_at || user.trialExpiresAt || null;
  if (!expiresAt) return false;   // no trial set = no expiry
  return new Date(expiresAt) < new Date();
}

// ── Live chat (Support tab + admin chat) ─────────────────────────────────────

function _chatUserFilter(userId) {
  if (isMongoMode()) {
    const mongoose = require('mongoose');
    if (mongoose.Types.ObjectId.isValid(String(userId))) {
      return new mongoose.Types.ObjectId(String(userId));
    }
    return userId;
  }
  return /^\d+$/.test(String(userId)) ? parseInt(String(userId), 10) : userId;
}

function _normChatMessage(doc) {
  if (!doc) return null;
  return {
    id: doc.id ?? doc._id,
    userId: String(doc.userId ?? doc.user_id),
    sender: doc.sender,
    message: doc.message,
    read: Boolean(doc.read),
    createdAt: doc.createdAt ?? doc.created_at,
  };
}

async function sendChatMessage(userId, sender, message) {
  const text = String(message || '').trim();
  if (!text) throw new Error('Message is required');
  if (!['user', 'admin'].includes(sender)) throw new Error('Invalid sender');

  if (isMongoMode()) {
    const { ChatMessage } = M();
    const doc = await ChatMessage.create({
      userId: _chatUserFilter(userId),
      sender,
      message: text,
      read: false,
    });
    return _normChatMessage(doc.toObject ? doc.toObject() : doc);
  }

  const uid = _chatUserFilter(userId);
  const { rows } = await pg().query(
    `INSERT INTO chat_messages (user_id, sender, message, read)
     VALUES ($1, $2, $3, false)
     RETURNING id, user_id, sender, message, read, created_at`,
    [uid, sender, text]
  );
  return _normChatMessage(rows[0]);
}

async function getChatMessages(userId, limit = 100) {
  const lim = Math.min(200, Math.max(1, parseInt(limit, 10) || 100));
  const uid = _chatUserFilter(userId);

  if (isMongoMode()) {
    const { ChatMessage } = M();
    const docs = await ChatMessage.find({ userId: uid })
      .sort({ createdAt: 1 })
      .limit(lim)
      .lean();
    return docs.map(_normChatMessage);
  }

  const { rows } = await pg().query(
    `SELECT id, user_id, sender, message, read, created_at
     FROM chat_messages WHERE user_id=$1 ORDER BY created_at ASC LIMIT $2`,
    [uid, lim]
  );
  return rows.map(_normChatMessage);
}

async function markChatMessagesRead(userId, senderToMark) {
  if (!['user', 'admin'].includes(senderToMark)) return;
  const uid = _chatUserFilter(userId);

  if (isMongoMode()) {
    const { ChatMessage } = M();
    await ChatMessage.updateMany(
      { userId: uid, sender: senderToMark, read: false },
      { $set: { read: true } }
    );
    return;
  }

  await pg().query(
    `UPDATE chat_messages SET read=true WHERE user_id=$1 AND sender=$2 AND read=false`,
    [uid, senderToMark]
  );
}

async function getActiveChatUsers(search) {
  if (isMongoMode()) {
    const { ChatMessage, User } = M();
    const userIds = await ChatMessage.distinct('userId');
    if (!userIds.length) return [];
    const filter = { _id: { $in: userIds } };
    if (search && String(search).trim()) {
      const re = new RegExp(String(search).trim(), 'i');
      filter.$or = [{ username: re }, { email: re }];
    }
    const users = await User.find(filter).select('username email').sort({ username: 1 }).lean();
    return users.map((u) => ({ id: u._id, username: u.username, email: u.email }));
  }

  let q = `
    SELECT DISTINCT u.id, u.username, u.email
    FROM chat_messages c
    JOIN users u ON u.id = c.user_id`;
  const params = [];
  if (search && String(search).trim()) {
    q += ` WHERE u.username ILIKE $1 OR u.email ILIKE $1`;
    params.push(`%${String(search).trim()}%`);
  }
  q += ` ORDER BY u.username ASC`;
  const { rows } = await pg().query(q, params);
  return rows;
}

async function getChatUnreadCounts() {
  if (isMongoMode()) {
    const { ChatMessage } = M();
    const agg = await ChatMessage.aggregate([
      { $match: { read: false, sender: 'user' } },
      { $group: { _id: '$userId', count: { $sum: 1 }, lastMessageAt: { $max: '$createdAt' } } },
    ]);
    return agg.map((a) => ({
      userId: a._id,
      count: a.count,
      lastMessageAt: a.lastMessageAt,
    }));
  }

  const { rows } = await pg().query(`
    SELECT user_id AS "userId", COUNT(*)::int AS count, MAX(created_at) AS "lastMessageAt"
    FROM chat_messages WHERE read=false AND sender='user'
    GROUP BY user_id
  `);
  return rows;
}

/** Cross-dyno pairing status — web dyno reads DB, not worker filesystem. */
async function getBotPairingStatus(clean) {
  const digits = String(clean).replace(/[^0-9]/g, '');
  if (!digits) return { connected: false };

  const FRESH_MS = 5 * 60 * 1000;

  if (isMongoMode()) {
    try {
      const { BotSession } = M();
      const doc = await BotSession.findOne({ number: digits })
        .select('status lastActive connectedAt pairingStatus commandReady')
        .lean();
      if (doc) {
        const ps = doc.pairingStatus || doc.pairing_status;
        if (ps === 'code_ready' || ps === 'in_progress' || ps === 'requested') {
          return { connected: false, pairing: true, syncing: ps !== 'code_ready', status: ps };
        }
        if (doc.status === 'active') {
          const last = doc.lastActive ? new Date(doc.lastActive).getTime() : 0;
          const fresh = last > 0 && (Date.now() - last) <= FRESH_MS;
          if (fresh && doc.commandReady === false) {
            return { connected: false, pairing: false, syncing: true, status: 'syncing' };
          }
          if (fresh && doc.commandReady !== false) {
            return {
              connected: true,
              ts: doc.connectedAt || doc.lastActive,
            };
          }
        }
      }
    } catch (_) {}
  } else {
    try {
      const { rows } = await pg().query(
        `SELECT status, last_active, connected_at, pairing_status
         FROM bot_sessions WHERE number=$1 LIMIT 1`,
        [digits]
      );
      const row = rows[0];
      if (row) {
        if (['code_ready', 'in_progress', 'requested'].includes(row.pairing_status)) {
          return {
            connected: false,
            pairing: true,
            syncing: row.pairing_status !== 'code_ready',
            status: row.pairing_status,
          };
        }
        if (row.status === 'active') {
          const last = row.last_active ? Date.parse(row.last_active) : 0;
          const fresh = last > 0 && (Date.now() - last) <= FRESH_MS;
          if (fresh && row.command_ready === false) {
            return { connected: false, pairing: false, syncing: true, status: 'syncing' };
          }
          if (fresh && row.command_ready !== false) {
            return { connected: true, ts: row.connected_at || row.last_active };
          }
        }
      }
    } catch (_) {}
  }

  const st = await getPairingState(digits).catch(() => null);
  if (st?.status === 'active') {
    return {
      connected: true,
      pairing: false,
      syncing: false,
      status: 'active',
      ts: st.updatedAt || null,
    };
  }
  if (st?.status === 'code_ready') {
    return { connected: false, pairing: true, syncing: true, status: st.status };
  }
  if (st?.status === 'in_progress' || st?.status === 'requested') {
    return { connected: false, pairing: true, syncing: true, status: st.status };
  }

  return { connected: false };
}

/**
 * Reset stale bot_session connection statuses on startup.
 * After a restart, previously CONNECTED sessions are stale — the bot process
 * is gone. We reset them to RECONNECTING so the dashboard shows an accurate
 * status until the supervisor reconnects them.
 */
async function resetStaleConnectionStatuses() {
  if (isMongoMode()) {
    try {
      const { BotSession } = M();
      await BotSession.updateMany(
        { connectionStatus: 'CONNECTED' },
        {
          $set: {
            connectionStatus: 'RECONNECTING',
            commandReady: false,
            wsState: 0,
          },
        }
      );
    } catch (e) {
      console.error('[db] resetStaleConnectionStatuses mongo error:', e.message);
    }
    return;
  }
  try {
    await pg().query(
      `UPDATE bot_sessions
       SET connection_status = 'RECONNECTING',
           command_ready = FALSE,
           ws_state = 0
       WHERE connection_status = 'CONNECTED'`
    );
  } catch (err) {
    console.error('[db-service] resetStaleConnectionStatuses:', err.message);
  }
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
  upsertBotSession, getActiveBotSessions, getBotSessionsByNumbers, setBotConnectionStatus,
  getAllActiveLinkedNumbers,
  saveSessionCreds, getSessionCreds,
  getSiteSetting, setSiteSetting,
  countAdmins,
  getPendingPairingRequests, reclaimStalePairingClaims, markPairingInProgress, resetPairingRequest,
  markPairingFailed, markPairingConnected, getPairingState, clearPairingRequest, ensurePairingRequest,
  setPairingCode, clearStalePairingRequests,
  getExpiredUsers, disconnectAllUserDevices, getOwnerSubscriptionByNumber,
  deleteSessionCreds,
  hasFirstConnected, markFirstConnected,
  resetStaleConnectionStatuses,
  isPlanExpired,
  setLicenseKey,
  sendChatMessage, getChatMessages, markChatMessagesRead,
  getActiveChatUsers, getChatUnreadCounts,
  getBotPairingStatus,
};
