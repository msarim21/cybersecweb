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
  if (!user) return false;
  // Check subscriptionStatus field first (new system — highest priority)
  const subStatus = user.subscription_status || user.subscriptionStatus || null;
  if (subStatus === 'expired') return true;
  if (subStatus === 'active_pro' || subStatus === 'active_enterprise') return false;
  // Admin-activated paid users are never expired
  if (user.activated_by_admin || user.activatedByAdmin) return false;
  // Paid plan with no status set — not expired
  if (user.subscription_plan === 'pro' || user.subscription_plan === 'enterprise') return false;
  // Free trial fallback
  if (!user.trial_expires_at) return false;
  return new Date(user.trial_expires_at) < new Date();
}

function deriveSessionHealth(connStatus, botPhase) {
  if (connStatus === 'ERROR' || connStatus === 'LOGGED_OUT') return 'critical';
  if (connStatus === 'CONNECTED' && botPhase === 'online') return 'healthy';
  if (botPhase === 'syncing' || botPhase === 'starting' || connStatus === 'CONNECTING') return 'recovering';
  if (connStatus === 'DISCONNECTED') return 'degraded';
  return 'unknown';
}

// GET /api/numbers
router.get('/', protect, async (req, res) => {
  try {
    const numbers = await getNumbersByOwner(req.user.id, req.query.search || null);
    const { isBotHeartbeatFresh, isBotCommandReady, readBotHeartbeat } = require('../../allfunc/bot-heartbeat');
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
        const wsOpen = sess?.wsState === 1 || (hbFresh && readBotHeartbeat(clean)?.wsState === 1);
        const lastFresh = sess?.lastActive &&
            (Date.now() - new Date(sess.lastActive).getTime() <= BOT_ONLINE_MAX_AGE_MS);

        if (wsOpen && lastFresh) return 'online';
        if ((hbFresh && hbReady) || (sess?.status === 'active' && dbReady && lastFresh)) {
          return 'online';
        }
        // Trust DB connectionStatus === 'CONNECTED' as an authoritative online signal.
        // Heartbeat files are written by the worker dyno and are NOT visible to the web
        // dyno on Heroku (separate ephemeral filesystems), so hbFresh is always false on
        // the web dyno. The DB connectionStatus field is the only cross-dyno signal.
        if (sess?.connectionStatus === 'CONNECTED' && lastFresh) return 'online';
        if (sess?.status === 'active' && sess?.commandReady === false && lastFresh) return 'syncing';
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
      const waConnStatus = sess?.connectionStatus || null;
      const sessionHealth = deriveSessionHealth(waConnStatus, botPhase);
      // Keep the badge tied to the user's linked record. Short WhatsApp
      // reconnects should not make a successfully paired number look inactive;
      // botOnline carries the live connection signal separately.
      return {
        ...n,
        status: n.status,
        botOnline,
        botPhase,
        connectionStatus: waConnStatus,
        lastError: sess?.lastErrorMessage || null,
        hostDyno: sess?.hostDyno || null,
        lastConnectedAt: sess?.connectedAt || null,
        sessionHealth,
        reconnectAttempts: sess?.reconnectAttempts ?? 0,
      };
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

    const clean = String(number).replace(/[^0-9]/g, '');
    if (clean.length < 7 || clean.length > 15)
      return res.status(400).json({ error: 'Invalid phone number format.' });
    if (String(botName).trim().length > 50)
      return res.status(400).json({ error: 'Bot name cannot exceed 50 characters.' });

    const ownNumbers = await getNumbersByOwner(req.user.id);
    const existing = ownNumbers.find((n) => String(n.number).replace(/[^0-9]/g, '') === clean);
    if (existing) return res.status(200).json(existing);

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
        // Also update connectionStatus so the dashboard reflects the real state
        // instead of leaving a stale CONNECTED badge on a manually stopped bot.
        try {
          const { setBotConnectionStatus } = require('../../allfunc/bot-lifecycle');
          setBotConnectionStatus(clean, 'DISCONNECTED').catch(() => {});
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

// POST /api/numbers/:id/reconnect
// Restores session from DB and reconnects the bot — no re-pairing needed.
router.post('/:id/reconnect', protect, async (req, res) => {
  try {
    const numbers = await getNumbersByOwner(req.user.id);
    const target  = numbers.find(n => String(n._id) === req.params.id);
    if (!target) return res.status(404).json({ error: 'Number not found.' });

    const clean = String(target.number).replace(/[^0-9]/g, '');
    const jid   = `${clean}@s.whatsapp.net`;

    // Step 1: Restore session from DB (writes to BOTH cleanNum and cleanNum@s.whatsapp.net dirs)
    const { ensureSessionRestored } = require('../../session-db');
    const restored = await ensureSessionRestored(clean);
    if (!restored) {
      return res.status(400).json({
        error: 'No valid session found in database. Please re-pair this number.',
        needsRepair: true,
      });
    }

    // Step 2: Remove from stopped_bots so autoLoadPairs / supervisor won't skip it
    try {
      const { removeFromStoppedBots } = require('../../allfunc/stopped-bots');
      if (typeof removeFromStoppedBots === 'function') removeFromStoppedBots(clean);
      if (global.stoppedBots) global.stoppedBots.delete(clean);
    } catch (_) {}

    // Step 3: Mark bot_session active so dashboard reflects reconnecting state
    try {
      const { upsertBotSession, setBotConnectionStatus: dbSetStatus } = require('../db-service');
      await upsertBotSession(clean, 'active');
      await dbSetStatus(clean, 'CONNECTING', {
        commandReady: false,
        wsState: 0,
        lastErrorMessage: 'Reconnect requested',
      });
    } catch (_) {}

    // Step 4: Start exactly one reconnect owner. When the supervisor is active,
    // calling pair.js directly here creates a second socket outside the
    // supervisor and can produce WhatsApp "Stream Errored (conflict)".
    try {
      const supervisor = require('../../worker/supervisor');
      if (supervisor.isSupervisorActive?.()) {
        const recovered = await supervisor.recoverBotExternal?.(clean, 'web-reconnect');
        if (!recovered) {
          return res.status(503).json({ error: 'Reconnect queued by bot supervisor. It will retry automatically.' });
        }
      } else {
        const startpairing = require('../../pair');
        startpairing(jid).catch(err => {
          console.error(`[reconnect] startpairing error for ${clean}:`, err.message);
        });
      }
    } catch (pairErr) {
      console.error(`[reconnect] could not load pair.js:`, pairErr.message);
      return res.status(500).json({ error: 'Failed to start bot reconnect. Try again.' });
    }

    res.json({ message: `Reconnect initiated for ${clean}. Bot will be online in a few seconds.` });
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
