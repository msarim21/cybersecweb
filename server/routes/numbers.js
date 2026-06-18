const express = require('express');
const router  = express.Router();
const path    = require('path');
const { protect } = require('../middleware/auth');
const {
  getNumbersByOwner,
  countNumbersByOwner,
  addNumber,
  toggleNumber,
  deleteNumber,
  findUserById,
  banUser,
  getSiteSetting,
} = require('../db-service');

// ── Abuse / Auto-Ban tracker ─────────────────────────────────────────────────
const abuseTracker = new Map();
const ABUSE_WINDOW_MS = 24 * 60 * 60 * 1000;

async function getAbuseThreshold() {
  try {
    const val = await getSiteSetting('abuse_threshold');
    const n = parseInt(val, 10);
    return (!isNaN(n) && n > 0) ? n : 3;
  } catch { return 3; }
}

function recordViolation(userId) {
  const now = Date.now();
  const entry = abuseTracker.get(userId) || { count: 0, resetAt: now + ABUSE_WINDOW_MS };
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + ABUSE_WINDOW_MS; }
  entry.count += 1;
  abuseTracker.set(userId, entry);
  return entry.count;
}

const { removeConnectedFlag } = require('../../allfunc/connected-flag');
const { addToStoppedBots } = require('../../allfunc/stopped-bots');

// Lazy-load stopBot from pair.js
function tryStopBot(numberStr) {
  try {
    const pairMod = require('../../pair');
    if (typeof pairMod.stopBot === 'function') pairMod.stopBot(numberStr);
  } catch (_) {}
}

// Wipe auth files from filesystem
function tryClearSession(numberStr) {
  try {
    const pairMod = require('../../pair');
    if (typeof pairMod.clearSession === 'function') pairMod.clearSession(numberStr);
  } catch (_) {}
}

// Wipe saved credentials from DB so the number cannot auto-reconnect after Heroku restart
async function tryDeleteDbCreds(numberStr) {
  try {
    const { deleteSessionCreds } = require('../../session-db');
    const clean = String(numberStr).replace(/@.*$/, '').replace(/[^0-9]/g, '');
    await deleteSessionCreds(clean);
  } catch (_) {}
}

function cleanupDisconnectedNumber(clean, numberStr) {
  tryStopBot(numberStr);
  tryClearSession(numberStr);
  try { removeConnectedFlag(clean); } catch (_) {}
  try { addToStoppedBots(clean); } catch (_) {}
}

function getPlanLimit(plan) {
  if (plan === 'pro') return 5;
  if (plan === 'enterprise') return 999;
  return 1;
}

function isTrialExpired(user) {
  if (!user.trial_expires_at) return false;
  if (user.subscription_plan === 'pro' || user.subscription_plan === 'enterprise') return false;
  return new Date(user.trial_expires_at) < new Date();
}

// GET /api/numbers
router.get('/', protect, async (req, res) => {
  try {
    const numbers = await getNumbersByOwner(req.user.id, req.query.search || null);
    const { isBotHeartbeatFresh, isBotCommandReady } = require('../../allfunc/bot-heartbeat');
    const { getBotSessionsByNumbers } = require('../db-service');

    const BOT_ONLINE_MAX_AGE_MS = 15 * 60 * 1000;
    const BOT_STARTING_GRACE_MS = 10 * 60 * 1000;
    const cleans = numbers.map(n => String(n.number || '').replace(/[^0-9]/g, '')).filter(Boolean);
    const dbSessionMap = await getBotSessionsByNumbers(cleans).catch(() => ({}));

    const enriched = numbers.map((n) => {
      const clean = String(n.number || '').replace(/[^0-9]/g, '');
      const sess = dbSessionMap[clean];
      const botPhase = (() => {
        if (!clean) return 'offline';
        const hbFresh = isBotHeartbeatFresh(clean);
        const hbReady = isBotCommandReady(clean);
        const dbReady = sess?.commandReady === true;
        const dbSyncing = sess?.status === 'active' && sess?.commandReady === false;

        if ((hbFresh && hbReady) || (sess?.status === 'active' && dbReady && sess?.lastActive &&
            (Date.now() - new Date(sess.lastActive).getTime() <= BOT_ONLINE_MAX_AGE_MS))) {
          return 'online';
        }
        if (dbSyncing || (hbFresh && !hbReady && sess?.status === 'active')) return 'syncing';
        if (sess?.status === 'active') {
          const connectedAtFresh = sess?.connectedAt &&
            (Date.now() - new Date(sess.connectedAt).getTime() <= BOT_STARTING_GRACE_MS);
          const lastActiveFresh = sess?.lastActive &&
            (Date.now() - new Date(sess.lastActive).getTime() <= BOT_STARTING_GRACE_MS);
          if (connectedAtFresh || lastActiveFresh) return 'starting';
        }
        return 'offline';
      })();
      const botOnline = botPhase === 'online';
      // Keep the badge tied to the user's linked record. Short WhatsApp
      // reconnects should not make a successfully paired number look inactive;
      // botOnline carries the live connection signal separately.
      return { ...n, status: n.status, botOnline, botPhase, connectionStatus: sess?.status || null };
    });
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/numbers
router.post('/', protect, async (req, res) => {
  try {
    const { number, botName } = req.body;
    if (!number || !botName)
      return res.status(400).json({ error: 'Number and bot name are required.' });

    const user = await findUserById(req.user.id);

    if (isTrialExpired(user)) {
      return res.status(403).json({
        error:   'TRIAL_EXPIRED',
        message: 'Your 24-hour free trial has expired. Please upgrade to Pro or Enterprise.',
      });
    }

    const plan  = user.subscription_plan;
    const limit = getPlanLimit(plan);
    const count = await countNumbersByOwner(req.user.id);

    if (count >= limit) {
      const violations = recordViolation(req.user.id);
      const threshold  = await getAbuseThreshold();
      if (violations >= threshold) {
        try { await banUser(req.user.id, true); } catch (_) {}
        abuseTracker.delete(req.user.id);
        return res.status(403).json({
          error:   'AUTO_BANNED',
          message: `Account suspended for repeated slot abuse (${violations} attempts). Contact admin.`,
        });
      }
      return res.status(403).json({
        error:    'PLAN_LIMIT_REACHED',
        message:  `You have reached the ${plan.toUpperCase()} plan limit of ${limit} number(s).`,
        limit, plan,
        abuseWarning: violations >= Math.ceil(threshold / 2)
          ? `Warning: ${threshold - violations} more attempt(s) before auto-ban.`
          : undefined,
      });
    }

    // Remove from stopped_bots.json if re-adding a previously disconnected number
    try {
      const clean = String(number).replace(/[^0-9]/g, '');
      const stopFile = path.join(__dirname, '../../database/stopped_bots.json');
      const fs = require('fs');
      if (fs.existsSync(stopFile)) {
        const stopped = JSON.parse(fs.readFileSync(stopFile, 'utf8'));
        const idx = stopped.indexOf(clean);
        if (idx !== -1) {
          stopped.splice(idx, 1);
          fs.writeFileSync(stopFile, JSON.stringify(stopped));
        }
      }
    } catch (_) {}

    const newNumber = await addNumber(number, botName, req.user.id);
    // Auto-scale worker dynos if bot capacity is exceeded (non-blocking, non-fatal)
    try {
      const { autoScaleWorkers } = require('../../allfunc/heroku-scaler');
      autoScaleWorkers().catch(() => {});
    } catch (_) {}
    res.status(201).json(newNumber);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/numbers/:id/toggle
router.put('/:id/toggle', protect, async (req, res) => {
  try {
    const updated = await toggleNumber(req.params.id, req.user.id);
    if (!updated) return res.status(404).json({ error: 'Number not found.' });
    if (updated.number) {
      const clean = String(updated.number).replace(/[^0-9]/g, '');
      if (updated.status === 'inactive') {
        tryStopBot(updated.number);
        try {
          const { upsertBotSession } = require('../db-service');
          await upsertBotSession(clean, 'inactive');
        } catch (_) {}
      }
    }
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/numbers/:id/disconnect
// Stops bot, wipes filesystem session, wipes DB credentials, frees the slot.
router.post('/:id/disconnect', protect, async (req, res) => {
  try {
    const deleted = await deleteNumber(req.params.id, req.user.id);
    if (!deleted) return res.status(404).json({ error: 'Number not found.' });
    if (deleted.number) {
      const clean = String(deleted.number).replace(/[^0-9]/g, '');
      cleanupDisconnectedNumber(clean, deleted.number);
      await tryDeleteDbCreds(deleted.number);
      try {
        const { upsertBotSession } = require('../db-service');
        await upsertBotSession(clean, 'inactive');
      } catch (_) {}
    }
    res.json({ message: 'Number disconnected. Bot stopped, session files deleted, slot is now free.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/numbers/:id/force-disconnect
// More aggressive: kills bot, wipes filesystem AND DB creds — use when number is stuck.
router.post('/:id/force-disconnect', protect, async (req, res) => {
  try {
    const numbers = await getNumbersByOwner(req.user.id);
    const target  = numbers.find(n => String(n._id) === req.params.id);
    if (!target) return res.status(404).json({ error: 'Number not found.' });

    const clean = String(target.number).replace(/[^0-9]/g, '');
    cleanupDisconnectedNumber(clean, target.number);
    await tryDeleteDbCreds(target.number);
    try {
      const { upsertBotSession, clearPairingRequest } = require('../db-service');
      await upsertBotSession(clean, 'inactive');
      await clearPairingRequest(clean);
    } catch (_) {}

    res.json({ message: 'Force disconnected. Session fully cleared — re-pair to reconnect.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/numbers/:id
router.delete('/:id', protect, async (req, res) => {
  try {
    const deleted = await deleteNumber(req.params.id, req.user.id);
    if (!deleted) return res.status(404).json({ error: 'Number not found.' });
    if (deleted.number) {
      const clean = String(deleted.number).replace(/[^0-9]/g, '');
      cleanupDisconnectedNumber(clean, deleted.number);
      await tryDeleteDbCreds(deleted.number);
      try {
        const { upsertBotSession } = require('../db-service');
        await upsertBotSession(clean, 'inactive');
      } catch (_) {}
    }
    res.json({ message: 'Number deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
