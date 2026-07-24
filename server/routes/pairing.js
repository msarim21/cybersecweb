const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');

const PAIRING_BASE = path.join(__dirname, '../../nexstore/pairing');
const PAIR_MODULE = path.join(__dirname, '../../pair');

function ensureDir(p) {
  if (!fsSync.existsSync(p)) fsSync.mkdirSync(p, { recursive: true });
}

function deleteFolderRecursive(p) {
  if (!fsSync.existsSync(p)) return;
  fsSync.readdirSync(p).forEach(f => {
    const cur = path.join(p, f);
    fsSync.lstatSync(cur).isDirectory() ? deleteFolderRecursive(cur) : fsSync.unlinkSync(cur);
  });
  try { fsSync.rmdirSync(p); } catch (_) {}
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── POST /api/pairing/request ─────────────────────────────────────────────────
router.post('/request', protect, async (req, res) => {
  const { phoneNumber } = req.body;
  if (!phoneNumber) return res.status(400).json({ error: 'Phone number required.' });

  const clean = phoneNumber.replace(/[^0-9]/g, '');
  if (clean.length < 7 || clean.length > 15)
    return res.status(400).json({ error: 'Invalid phone number format.' });

  const sessionPath = path.join(PAIRING_BASE, clean);

  // ✅ CHECK 1: Local filesystem (connected.flag + valid creds.json)
  // On Heroku the disk is ephemeral — this check only catches bots running on the SAME dyno restart cycle.
  // IMPORTANT: Also cross-check DB — if NOT in linked_numbers, local files are stale and should be cleared.
  const connectedFlagPath = path.join(sessionPath, 'connected.flag');
  const existingCredsPath = path.join(sessionPath, 'creds.json');
  const isAlreadyPairedLocal = fsSync.existsSync(connectedFlagPath) || (fsSync.existsSync(existingCredsPath) && (() => {
    try {
      const c = JSON.parse(fsSync.readFileSync(existingCredsPath, 'utf-8'));
      return !!(c.noiseKey?.private || c.me);
    } catch(_) { return false; }
  })());

  if (isAlreadyPairedLocal) {
    // Cross-check DB: local files exist, but is the number actually in linked_numbers?
    // If NOT in DB, local files are stale (e.g. after logout that didn't clean up disk)
    // → clear them and allow fresh pairing instead of blocking forever.
    let isInLinkedNumbersDb = false;
    try {
      const { isNumberInLinkedNumbers } = require('../db-service');
      isInLinkedNumbersDb = await isNumberInLinkedNumbers(clean);
    } catch (_) {
      // DB check failed — fall back to safe block (assume in DB)
      isInLinkedNumbersDb = true;
    }

    if (isInLinkedNumbersDb) {
      console.log(`[Pairing] ${clean}: Already paired (local files + DB confirmed) — blocking new pairing code`);
      return res.status(409).json({ error: 'This number is already linked. Unlink it first before re-pairing.', alreadyLinked: true });
    } else {
      // Stale local files — number was logged out/removed from DB but local disk wasn't cleaned.
      // Clear the stale files so fresh pairing proceeds cleanly.
      console.log(`[Pairing] ${clean}: Local files found but NOT in DB (stale state) — clearing local files for fresh pairing`);
      try { deleteFolderRecursive(sessionPath); } catch (_) {}
    }
  }

  // ── ACTIVE CONNECTION CHECK ───────────────────────────────────────────────
  // ✅ KEY FIX: Block re-pairing ONLY when the bot is BOTH shown as active in
  // the dashboard (linked_numbers.status = 'active') AND connection_status = 'CONNECTED'.
  //
  // Why: Previous code checked session_creds in DB regardless of actual connection state.
  // If bot was LOGGED_OUT but session_creds still in DB, and connection_status was null
  // or not checked, it blocked pairing even though dashboard showed "NO NUMBERS LINKED".
  //
  // New logic: If dashboard shows "NO NUMBERS LINKED" (linked_numbers not active) → ALWAYS
  // allow re-pairing and auto-clear any stale DB data. Only block when bot is provably live.
  try {
    const { deleteSessionCreds, removeLinkedNumber } = require('../../session-db');
    const { getPool, isMongoMode } = require('../db');
    const pool = getPool();
    let isActivelyConnected = false;

    if (pool && !isMongoMode?.()) {
      // PostgreSQL: two-step check
      // Step 1: Is this number shown as ACTIVE in the dashboard (linked_numbers)?
      const lnResult = await pool.query(
        `SELECT status FROM linked_numbers
         WHERE REGEXP_REPLACE(number,'[^0-9]','','g') = $1
           AND status = 'active'
         LIMIT 1`,
        [clean]
      );
      if (lnResult.rows.length > 0) {
        // Step 2: Is the bot actually CONNECTED right now (bot_sessions)?
        const bsResult = await pool.query(
          `SELECT connection_status, last_active FROM bot_sessions
           WHERE REGEXP_REPLACE(number,'[^0-9]','','g') = $1
           ORDER BY last_active DESC NULLS LAST
           LIMIT 1`,
          [clean]
        );
        const connStatus = bsResult.rows[0]?.connection_status;
        const lastActive = bsResult.rows[0]?.last_active;
        // Only block if: CONNECTED status + lastActive within 20 minutes (stale detection)
        const isRecent = lastActive && (Date.now() - new Date(lastActive).getTime() < 20 * 60 * 1000);
        if (connStatus === 'CONNECTED' && isRecent) {
          isActivelyConnected = true;
        }
      }
    } else if (isMongoMode?.()) {
      try {
        const BotSession = require('../models/BotSession');
        const LinkedNumberModel = require('../models/LinkedNumber');
        const ln = await LinkedNumberModel.findOne({
          number: { $in: [clean, clean + '@s.whatsapp.net'] },
          status: 'active'
        }).lean();
        if (ln) {
          const bs = await BotSession.findOne({
            number: { $in: [clean, clean + '@s.whatsapp.net'] }
          }).sort({ lastActive: -1 }).select('connectionStatus lastActive').lean();
          const isRecent = bs?.lastActive && (Date.now() - new Date(bs.lastActive).getTime() < 20 * 60 * 1000);
          if (bs?.connectionStatus === 'CONNECTED' && isRecent) {
            isActivelyConnected = true;
          }
        }
      } catch (_) {}
    }

    if (isActivelyConnected) {
      console.log(`[Pairing] ${clean}: Bot is actively CONNECTED (in dashboard + recent heartbeat) — blocking re-pairing`);
      return res.status(409).json({
        error: 'This number is already linked and connected. Unlink it first before re-pairing.',
        alreadyLinked: true
      });
    }

    // Not actively connected — clear any stale DB data so fresh pairing works cleanly
    console.log(`[Pairing] ${clean}: No active connection found — clearing stale DB session for fresh pairing`);
    await deleteSessionCreds(clean).catch(() => {});
    await removeLinkedNumber(clean).catch(() => {});

  } catch (dbCheckErr) {
    // DB check failed — log and continue (never block pairing due to DB failure)
    console.warn(`[Pairing] Active connection check failed for ${clean}: ${dbCheckErr.message}`);
  }

  // ── Number is NOT actively connected — proceed with fresh pairing ──────────
  console.log(`[Pairing] ${clean}: Generating fresh pairing code`);

  // Wipe any stale/partial session so pair.js always issues a fresh code
  if (fsSync.existsSync(sessionPath)) deleteFolderRecursive(sessionPath);
  ensureDir(PAIRING_BASE);
  ensureDir(sessionPath);

  // Remove old per-bot pairing file so we don't return a stale code
  const PAIRING_JSON = path.join(PAIRING_BASE, `pairing_${clean}.json`);
  try { await fs.unlink(PAIRING_JSON); } catch (_) {}

  // ✅ Save pairing ownership BEFORE starting pair.js
  // So that when WhatsApp confirms pairing, session-db.js auto-saves to linked_numbers
  try {
    const { savePairingOwner } = require('../db-service');
    if (req.user?.id) {
      await savePairingOwner(clean, req.user.id, req.body.botName || 'CYBER PRO');
      console.log(`[Pairing] ${clean}: Pairing owner saved (userId=${req.user.id})`);
    }
  } catch (ownerErr) {
    console.warn(`[Pairing] savePairingOwner failed for ${clean}: ${ownerErr.message}`);
  }

  try {
    // Clear require cache so a fresh connection is created each time
    delete require.cache[require.resolve(PAIR_MODULE)];
    const startpairing = require(PAIR_MODULE);

    const jid = clean + '@s.whatsapp.net';

    // Fire and forget — pair.js keeps the socket alive in the background
    startpairing(jid).catch(err => {
      console.error(`[Pairing] startpairing error for ${clean}:`, err.message);
    });

    // Wait for pair.js to write pairing.json (max 90 seconds — matches Baileys connectTimeoutMs + retry budget)
    let code = null;
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      await sleep(1000);
      try {
        const raw = await fs.readFile(PAIRING_JSON, 'utf-8');
        const obj = JSON.parse(raw);
        const savedNum = (obj.number || '').replace(/[^0-9]/g, '');
        if (obj.code && savedNum === clean) {
          code = obj.code;
          break;
        }
      } catch (_) {}
    }

    if (!code) {
      return res.status(500).json({ error: 'Timed out waiting for pairing code. Check the number and try again.' });
    }

    console.log(`[Pairing] ${clean}: Pairing code generated successfully`);
    return res.json({ code, number: clean });

  } catch (err) {
    console.error('[Pairing]', err.message);
    return res.status(500).json({ error: err.message || 'Could not generate pairing code. Please try again.' });
  }
});

// ── GET /api/pairing/status/:number ──────────────────────────────────────────
router.get('/status/:number', protect, (req, res) => {
  const clean    = req.params.number.replace(/[^0-9]/g, '');
  const flagFile = path.join(PAIRING_BASE, clean, 'connected.flag');
  if (fsSync.existsSync(flagFile)) {
    try {
      const data = JSON.parse(fsSync.readFileSync(flagFile, 'utf-8'));
      return res.json({ connected: true, ts: data.ts });
    } catch (_) {}
    return res.json({ connected: true });
  }
  res.json({ connected: false });
});

// ── GET /api/pairing/code/:number ────────────────────────────────────────────
// Returns the current pairing code for a number (for polling)
router.get('/code/:number', protect, (req, res) => {
  const clean = req.params.number.replace(/[^0-9]/g, '');
  const PAIRING_JSON = path.join(PAIRING_BASE, `pairing_${clean}.json`);
  if (!fsSync.existsSync(PAIRING_JSON)) {
    return res.json({ code: null });
  }
  try {
    const obj = JSON.parse(fsSync.readFileSync(PAIRING_JSON, 'utf-8'));
    return res.json({ code: obj.code || null, number: clean });
  } catch (_) {
    return res.json({ code: null });
  }
});

module.exports = router;
