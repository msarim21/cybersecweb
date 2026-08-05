const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');

const PAIRING_BASE = path.join(__dirname, '../../nexstore/pairing');
const PAIR_MODULE = path.join(__dirname, '../../pair');
const pairingFlights = new Map(); // clean number -> code-generation promise

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

function stopPairingRuntime(clean) {
  // The supervisor deliberately ignores pair.stopBot() while a pairing is
  // in flight. A timed-out HTTP request must override that guard, otherwise
  // the child/socket can keep running after the UI reports failure.
  try {
    const { stopBotExternal } = require('../../worker/supervisor');
    if (typeof stopBotExternal === 'function') stopBotExternal(clean);
  } catch (_) {}
  try {
    const pairMod = require(PAIR_MODULE);
    if (typeof pairMod.stopBot === 'function') pairMod.stopBot(clean);
  } catch (_) {}
}

// ── POST /api/pairing/request ─────────────────────────────────────────────────
router.post('/request', protect, async (req, res) => {
  const { phoneNumber } = req.body;
  if (!phoneNumber) return res.status(400).json({ error: 'Phone number required.' });

  const clean = phoneNumber.replace(/[^0-9]/g, '');
  if (clean.length < 7 || clean.length > 15)
    return res.status(400).json({ error: 'Invalid phone number format.' });

  // Do not let double-clicks or frontend retries create two WhatsApp
  // sockets for the same number. The phone may receive a code from the first
  // socket while the second socket invalidates its linking handshake.
  const existingFlight = pairingFlights.get(clean);
  if (existingFlight) {
    try {
      const result = await existingFlight;
      if (result?.httpStatus) return res.status(result.httpStatus).json(result.body);
      return res.json(result);
    } catch (err) {
      return res.status(500).json({ error: err.message || 'Could not generate pairing code. Please try again.' });
    }
  }

  let resolveFlight;
  let rejectFlight;
  const flight = new Promise((resolve, reject) => {
    resolveFlight = resolve;
    rejectFlight = reject;
  });
  pairingFlights.set(clean, flight);

  try {
    return await _requestPairingCode(req, res, clean, phoneNumber, resolveFlight, rejectFlight);
  } catch (err) {
    rejectFlight(err);
    if (!res.headersSent) {
      return res.status(500).json({ error: err.message || 'Could not generate pairing code. Please try again.' });
    }
    return;
  } finally {
    if (pairingFlights.get(clean) === flight) pairingFlights.delete(clean);
  }
});

async function _requestPairingCode(req, res, clean, phoneNumber, resolveFlight, rejectFlight) {
  // pair.js receives a WhatsApp JID and Baileys therefore uses the JID
  // directory. Older code only inspected the digits directory, allowing a
  // stale JID session to make pair.js skip requestPairingCode().
  const sessionPaths = [
    path.join(PAIRING_BASE, clean),
    path.join(PAIRING_BASE, `${clean}@s.whatsapp.net`),
  ];

  // ✅ CHECK 1: Local filesystem (connected.flag + valid creds.json)
  // On Heroku the disk is ephemeral — this check only catches bots running on the SAME dyno restart cycle.
  // IMPORTANT: Also cross-check DB — if NOT in linked_numbers, local files are stale and should be cleared.
  const isValidCredsFile = (credsPath) => fsSync.existsSync(credsPath) && (() => {
    try {
      const c = JSON.parse(fsSync.readFileSync(credsPath, 'utf-8'));
      return !!(c.noiseKey?.private || c.me || c.registered === true);
    } catch(_) { return false; }
  })();
  const isAlreadyPairedLocal = sessionPaths.some((sessionPath) =>
    fsSync.existsSync(path.join(sessionPath, 'connected.flag')) ||
    isValidCredsFile(path.join(sessionPath, 'creds.json'))
  );

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
      const body = { error: 'This number is already linked. Unlink it first before re-pairing.', alreadyLinked: true };
      resolveFlight({ httpStatus: 409, body });
      return res.status(409).json(body);
    } else {
      // Stale local files — number was logged out/removed from DB but local disk wasn't cleaned.
      // Clear the stale files so fresh pairing proceeds cleanly.
      console.log(`[Pairing] ${clean}: Local files found but NOT in DB (stale state) — clearing local files for fresh pairing`);
      for (const sessionPath of sessionPaths) {
        try { deleteFolderRecursive(sessionPath); } catch (_) {}
      }
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
      const body = {
        error: 'This number is already linked and connected. Unlink it first before re-pairing.',
        alreadyLinked: true
      };
      resolveFlight({ httpStatus: 409, body });
      return res.status(409).json(body);
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

  // Stop any old pairing/reconnect runtime before touching its auth files.
  // This is important when the previous request generated a code but never
  // completed the link: the old socket must not race the new one.
  stopPairingRuntime(clean);
  await sleep(800);

  // Wipe any stale/partial session so pair.js always issues a fresh code
  for (const sessionPath of sessionPaths) {
    if (fsSync.existsSync(sessionPath)) deleteFolderRecursive(sessionPath);
  }
  try {
    const { removeFromStoppedBots } = require('../../allfunc/stopped-bots');
    removeFromStoppedBots(clean);
  } catch (_) {}
  ensureDir(PAIRING_BASE);

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
    // In isolated deployment the supervisor is the only owner allowed to
    // create a WhatsApp socket. Calling pair.js directly from the web route
    // creates a second socket in the web process; that socket can generate a
    // code but loses the link handshake when the worker-owned socket starts.
    const supervisor = require('../../worker/supervisor');
    if (supervisor.isSupervisorActive?.()) {
      // handlePairingRequest also waits for its internal 120s supervisor
      // timeout. Do not await it here: the HTTP route must poll the code file
      // immediately and return as soon as the child generates a code.
      supervisor.handlePairingRequest(clean).catch((err) => {
        console.error(`[Pairing] supervisor pairing error for ${clean}:`, err.message);
      });
    } else {
      // Use the canonical cached module. Clearing require.cache here created a
      // second pair.js instance alongside the supervisor's instance.
      const startpairing = require(PAIR_MODULE);
      const jid = clean + '@s.whatsapp.net';
      startpairing(jid).catch(err => {
        console.error(`[Pairing] startpairing error for ${clean}:`, err.message);
      });
    }

    // Wait for the supervisor child/pair.js to write pairing_<number>.json.
    // The DB state is also updated by pair.js, so this remains reliable when
    // the pairing child runs in a separate isolated process.
    let code = null;
    const deadline = Date.now() + 40_000;
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
      // Do not leave a live socket or owner/request state behind when code
      // generation fails. Otherwise the next attempt sees CONNECTING forever
      // or is rejected as already linked.
      stopPairingRuntime(clean);
      for (const sessionPath of sessionPaths) {
        try { deleteFolderRecursive(sessionPath); } catch (_) {}
      }
      try { await fs.unlink(PAIRING_JSON); } catch (_) {}
      try {
        const { clearPairingRequest, deleteSessionCreds } = require('../db-service');
        await clearPairingRequest(clean);
        await deleteSessionCreds(clean);
      } catch (_) {}
      const result = { error: 'Timed out waiting for pairing code. Check the number and try again.' };
      rejectFlight(new Error(result.error));
      return res.status(500).json(result);
    }

    console.log(`[Pairing] ${clean}: Pairing code generated successfully`);
    const result = { code, number: clean };
    resolveFlight(result);
    return res.json(result);

  } catch (err) {
    console.error('[Pairing]', err.message);
    stopPairingRuntime(clean);
    try {
      const { clearPairingRequest } = require('../db-service');
      await clearPairingRequest(clean);
    } catch (_) {}
    rejectFlight(err);
    return res.status(500).json({ error: err.message || 'Could not generate pairing code. Please try again.' });
  }
}

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
