const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');

const PAIRING_BASE = path.join(__dirname, '../../nexstore/pairing');
const PAIR_MODULE = path.join(__dirname, '../../pair');
const pairingFlights = new Map(); // clean number -> code-generation promise

async function requirePairingOwner(req, res, next) {
  try {
    const clean = String(req.params.number || req.body?.phoneNumber || '').replace(/[^0-9]/g, '');
    if (!clean) return res.status(400).json({ error: 'Invalid phone number format.' });
    const { isNumberOwnedByUser } = require('../db-service');
    if (!(await isNumberOwnedByUser(clean, req.user.id))) {
      return res.status(404).json({ error: 'Pairing request not found.' });
    }
    req.pairingNumber = clean;
    next();
  } catch (err) {
    console.error('[Pairing] Ownership check failed:', err.message);
    res.status(500).json({ error: 'Could not verify pairing request ownership.' });
  }
}

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

function normalizePairingCode(rawCode) {
  const compact = String(rawCode || '').replace(/[^a-z0-9]/gi, '').toUpperCase();
  if (compact.length !== 8) return null;
  return `${compact.slice(0, 4)}-${compact.slice(4)}`;
}

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

  const { getNumberClaimOwner } = require('../db-service');
  const claimOwner = await getNumberClaimOwner(clean);
  if (claimOwner && claimOwner !== String(req.user.id)) {
    return res.status(409).json({ error: 'This number is already linked or being paired by another account.' });
  }

  // Do not let double-clicks or frontend retries create two WhatsApp
  // sockets for the same number. The phone may receive a code from the first
  // socket while the second socket invalidates its linking handshake.
  const flightKey = clean;
  const existingFlight = pairingFlights.get(flightKey);
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
  pairingFlights.set(flightKey, flight);

  try {
    return await _requestPairingCode(req, res, clean, phoneNumber, resolveFlight, rejectFlight);
  } catch (err) {
    rejectFlight(err);
    if (!res.headersSent) {
      return res.status(500).json({ error: err.message || 'Could not generate pairing code. Please try again.' });
    }
    return;
  } finally {
    if (pairingFlights.get(flightKey) === flight) pairingFlights.delete(flightKey);
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
      const { isNumberOwnedByUser } = require('../db-service');
      isInLinkedNumbersDb = await isNumberOwnedByUser(clean, req.user.id);
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
            AND owner_id = $2
           AND status = 'active'
         LIMIT 1`,
         [clean, req.user.id]
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
           number: { $regex: `^${clean}(?:@s\\.whatsapp\\.net)?$`, $options: 'i' },
           ownerId: req.user.id,
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

  // Reset the shared request state before the new socket is spawned. A
  // previous attempt can leave status=code_ready in Mongo; if that record is
  // not cleared first, the polling endpoint can expose a stale code while the
  // new socket is still negotiating.
  try {
    const { ensurePairingRequest } = require('../db-service');
    await ensurePairingRequest(clean, { force: true, ownerId: req.user.id });
    console.log(`[Pairing] ${clean}: Pairing state reset for this request`);
  } catch (stateErr) {
    // Pairing can still use the local JSON handoff when Mongo is unavailable.
    console.warn(`[Pairing] ${clean}: Could not reset shared pairing state: ${stateErr.message}`);
  }

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
    const { getWhatsAppHostDyno, isWebApiOnlyDyno } = require('../../allfunc/whatsapp-host');
    const apiOnlyDyno = isWebApiOnlyDyno?.() === true;

    if (apiOnlyDyno) {
      // Never silently queue pairing on another dyno. The web process owns the
      // browser request, while the remote worker has a separate filesystem and
      // socket lifecycle; that handoff leaves the UI stuck in CONNECTING.
      const host = getWhatsAppHostDyno();
      const error = `Pairing host misconfigured: this web process is API-only, but WhatsApp pairing is configured for ${host}. Set WHATSAPP_HOST_DYNO=web and WEB_API_ONLY=0.`;
      console.error(`[Pairing] ${clean}: ${error}`);
      await require('../db-service').markPairingFailed(clean).catch(() => {});
      const body = { error, code: 'PAIRING_HOST_MISCONFIGURED' };
      resolveFlight({ httpStatus: 503, body });
      return res.status(503).json(body);
    }

    // Do not hold this HTTP request open while WhatsApp negotiates the
    // registration socket. On the single-web dyno, slot rotation plus the
    // Baileys handshake can take longer than a browser/proxy request timeout.
    // More importantly, timing out here used to call stopPairingRuntime() and
    // kill the live socket before it could publish its local pairing JSON.
    //
    // The client already polls /code/:number. That endpoint reads the local
    // JSON first, so this works even while MongoDB is read-only or contains a
    // stale `failed` pairing record.
    // The web route only enqueues the request. The web-owned pairing processor
    // is the single caller of supervisor.handlePairingRequest(). Starting a
    // socket here as well creates two runtimes for the same number; the second
    // one kills the first before it can publish a code.
    const result = { async: true, number: clean, status: 'requested', host: getWhatsAppHostDyno() };
    console.log(`[Pairing] ${clean}: request queued for web-owned pairing processor on ${getWhatsAppHostDyno()} dyno`);

    // Kick the processor immediately instead of waiting for its next interval.
    // This removes a race during startup where the API is ready but the first
    // 150ms queue tick has not yet run.
    //
    // IMPORTANT: do not start a direct supervisor fallback here. The queue and
    // this HTTP route run in the same web process, and a delayed DB read can
    // make the queue return false even though the request becomes claimable a
    // moment later. Starting a supervisor directly in that gap creates two
    // registration owners for the same number; the second socket invalidates
    // the first pairing code and WhatsApp reports "Couldn't link device".
    // The processor remains the single owner on the configured WhatsApp host.
    setImmediate(async () => {
      let queueHadWork = false;
      try {
        const { processPairingQueue } = require('../../worker/pairing-processor');
        queueHadWork = await processPairingQueue();
      } catch (kickErr) {
        console.error(`[Pairing] ${clean}: processor kick failed:`, kickErr.message);
      }

      if (queueHadWork) return;

      // In API-only/non-supervisor mode there is no worker queue owner, so the
      // legacy local fallback remains valid. Never use it while the supervisor
      // is active: that would be a second socket owner too.
      try {
        const supervisor = require('../../worker/supervisor');
        if (supervisor.isSupervisorActive?.()) {
          console.log(`[Pairing] ${clean}: queue has no claim yet; waiting for the next processor tick`);
          return;
        }

        const startpairing = require(PAIR_MODULE);
        startpairing(`${clean}@s.whatsapp.net`).catch((runtimeErr) => {
          console.error(`[Pairing] ${clean}: local pairing fallback failed:`, runtimeErr.message);
        });
      } catch (runtimeErr) {
        console.error(`[Pairing] ${clean}: could not start pairing runtime:`, runtimeErr.message);
      }
    });

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
router.get('/status/:number', protect, requirePairingOwner, async (req, res) => {
  const clean    = req.pairingNumber;
  const flagFile = path.join(PAIRING_BASE, clean, 'connected.flag');
  if (fsSync.existsSync(flagFile)) {
    try {
      const data = JSON.parse(fsSync.readFileSync(flagFile, 'utf-8'));
      return res.json({ connected: true, ts: data.ts });
    } catch (_) {}
    return res.json({ connected: true });
  }
  // The worker owns the WhatsApp socket, so its connected.flag is not visible
  // on the web dyno. Read the shared DB state for cross-dyno status.
  try {
    const { getBotPairingStatus } = require('../db-service');
    return res.json(await getBotPairingStatus(clean));
  } catch (_) {
    return res.json({ connected: false });
  }
});

// ── GET /api/pairing/code/:number ────────────────────────────────────────────
// Returns the current pairing code for a number (for polling)
router.get('/code/:number', protect, requirePairingOwner, async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  const clean = req.pairingNumber;
  const PAIRING_JSON = path.join(PAIRING_BASE, `pairing_${clean}.json`);

  // In the web-only formation this file is written by the same pairing
  // process. Prefer it when present: Mongo can be temporarily read-only
  // after an Atlas quota breach, while the live Baileys socket still has a
  // valid code. The request handler removes this file before each fresh
  // attempt, so it cannot be an old code from a previous request.
  try {
    const raw = await fs.readFile(PAIRING_JSON, 'utf-8');
    const obj = JSON.parse(raw);
    const localCode = normalizePairingCode(obj.code);
    if (localCode) {
      const expiresAt = obj.expiresAt ? Date.parse(obj.expiresAt) : (
        obj.timestamp ? Date.parse(obj.timestamp) + 120_000 : 0
      );
      if (expiresAt && expiresAt <= Date.now()) {
        try { await fs.unlink(PAIRING_JSON); } catch (_) {}
        try {
          const { markPairingFailed } = require('../db-service');
          await markPairingFailed(clean, 'Pairing code expired before it was entered');
        } catch (_) {}
        return res.status(409).json({
          code: null,
          number: clean,
          status: 'expired',
          error: 'Pairing code expired. Generate a new code and enter it immediately.',
        });
      }
      const { getWhatsAppHostDyno } = require('../../allfunc/whatsapp-host');
      return res.json({
        code: localCode,
        number: clean,
        status: 'code_ready',
        host: getWhatsAppHostDyno(),
        updatedAt: obj.timestamp || null,
        expiresInSec: Math.max(1, Math.ceil((expiresAt - Date.now()) / 1000)),
        attemptId: obj.attemptId || null,
      });
    }
  } catch (_) {}

  // Primary source: DB shared by the web and worker dynos.
  try {
    const { getPairingState } = require('../db-service');
    const state = await getPairingState(clean);
    if (state?.status === 'failed') {
      return res.status(409).json({
        code: null,
        status: 'failed',
        error: state.error || 'WhatsApp pairing code generation failed. Please try again.',
      });
    }
    if (state?.code && state.status === 'code_ready') {
      const code = normalizePairingCode(state.code);
      if (!code) {
        return res.status(409).json({
          code: null,
          status: 'failed',
          error: 'WhatsApp returned an invalid pairing code. Please request a new code.'
        });
      }
      const updatedAtMs = state.updatedAt ? new Date(state.updatedAt).getTime() : 0;
      if (updatedAtMs && updatedAtMs + 120_000 <= Date.now()) {
        const { markPairingFailed } = require('../db-service');
        await markPairingFailed(clean, 'Pairing code expired before it was entered');
        return res.status(409).json({
          code: null,
          number: clean,
          status: 'expired',
          error: 'Pairing code expired. Generate a new code and enter it immediately.',
        });
      }
      return res.json({
        code,
        number: clean,
        status: state.status,
        host: require('../../allfunc/whatsapp-host').getWhatsAppHostDyno(),
        updatedAt: state.updatedAt || null,
        expiresInSec: Math.max(1, Math.ceil((updatedAtMs + 120_000 - Date.now()) / 1000)),
        attemptId: state.attemptId || null,
      });
    }
    if (state?.status) {
      return res.json({
        code: null,
        number: clean,
        status: state.status,
        host: require('../../allfunc/whatsapp-host').getWhatsAppHostDyno(),
        error: state.error || null,
        updatedAt: state.updatedAt || null
      });
    }
  } catch (_) {}

  // Fallback for same-dyno/non-supervisor deployments.
  if (!fsSync.existsSync(PAIRING_JSON)) {
    return res.json({ code: null, number: clean, status: 'requested' });
  }
  try {
    const obj = JSON.parse(fsSync.readFileSync(PAIRING_JSON, 'utf-8'));
    const code = normalizePairingCode(obj.code);
    const expiresAt = obj.expiresAt ? Date.parse(obj.expiresAt) : (
      obj.timestamp ? Date.parse(obj.timestamp) + 120_000 : 0
    );
    if (expiresAt && expiresAt <= Date.now()) {
      return res.status(409).json({
        code: null,
        number: clean,
        status: 'expired',
        error: 'Pairing code expired. Generate a new code and enter it immediately.',
      });
    }
    return res.json({
      code,
      number: clean,
      status: code ? 'code_ready' : 'in_progress',
      updatedAt: obj.timestamp || null,
      expiresInSec: code && expiresAt ? Math.max(1, Math.ceil((expiresAt - Date.now()) / 1000)) : 120,
      attemptId: obj.attemptId || null,
    });
  } catch (_) {
    return res.json({ code: null, number: clean, status: 'in_progress' });
  }
});

module.exports = router;
