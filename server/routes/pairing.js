const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { protect } = require('../middleware/auth');

// Only limit actual pairing *requests* — not status/code polling (every 0.6–3s during link flow)
const pairingRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 6,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip,
  handler: (req, res) => {
    if (typeof global.logThreat === 'function') {
      global.logThreat({ type: 'PAIRING_ABUSE', severity: 'HIGH', ip: req.ip, path: req.path, detail: 'Pairing request rate limit exceeded' });
    }
    res.status(429).json({ error: 'Too many pairing attempts. Please wait 15 minutes.' });
  },
});
const {
  findUserById,
  isPlanExpired,
  getNumbersByOwner,
  requestPairing,
  getPairingState,
  isNumberInLinkedNumbers,
  clearPairingRequest,
} = require('../db-service');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const { fork } = require('child_process');

const PAIRING_BASE = path.join(__dirname, '../../nexstore/pairing');
const PAIRING_JSON  = path.join(PAIRING_BASE, 'pairing.json');
const PAIR_MODULE   = path.join(__dirname, '../../pair');
const SESSION_DB    = path.join(__dirname, '../../session-db');

/**
 * Pairing must run in a child with BOT_PAIRING=1 (pair.js reads that at load time).
 * On Heroku / supervisor hosts, pairing-processor + supervisor own that path.
 */
function shouldDelegatePairing() {
  try {
    const { shouldRunWhatsAppSupervisor } = require('../../allfunc/whatsapp-host');
    if (shouldRunWhatsAppSupervisor()) return true;
  } catch (_) {}
  if (process.env.DYNO) return true;
  if (process.env.RENDER === 'true') return true;
  return false;
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

async function readCodeFromFile(clean) {
  try {
    const raw = await fs.readFile(PAIRING_JSON, 'utf-8');
    const obj = JSON.parse(raw);
    const savedNum = (obj.number || '').replace(/[^0-9]/g, '');
    if (obj.code && savedNum === clean) return obj.code;
  } catch (_) {}
  return null;
}

async function prepareFreshPairing(clean) {
  const jid = `${clean}@s.whatsapp.net`;
  const sessionPath = path.join(PAIRING_BASE, jid);

  const { removeFromStoppedBots } = require('../../allfunc/stopped-bots');
  removeFromStoppedBots(clean);

  try {
    const pairMod = require(PAIR_MODULE);
    if (pairMod?.stopBot) {
      pairMod.stopBot(jid);
      pairMod.stopBot(clean);
    }
    if (pairMod?.clearSession) pairMod.clearSession(clean);
  } catch (_) {}

  if (fsSync.existsSync(sessionPath)) deleteFolderRecursive(sessionPath);

  try {
    const { deleteSessionCreds } = require(SESSION_DB);
    await deleteSessionCreds(clean);
  } catch (_) {}

  try { await fs.unlink(PAIRING_JSON); } catch (_) {}

  ensureDir(PAIRING_BASE);
  ensureDir(sessionPath);
}

/** Local dev fallback: fork isolated child so pair.js loads with BOT_PAIRING=1. */
function spawnPairingChild(clean) {
  const runner = path.join(__dirname, '../../worker/bot-runner.js');
  fork(runner, [clean], {
    env: {
      ...process.env,
      WHATSAPP_WORKER: '1',
      BOT_ISOLATION: '1',
      BOT_NUMBER: clean,
      BOT_PAIRING: '1',
    },
    stdio: 'inherit',
    cwd: path.join(__dirname, '../..'),
  });
}

function nudgePairingProcessor() {
  try {
    const { processPairingQueue } = require('../../worker/pairing-processor');
    processPairingQueue().catch(() => {});
  } catch (_) {}
}

// ── POST /api/pairing/request — start pairing, return immediately ─────────────
router.post('/request', protect, pairingRequestLimiter, async (req, res) => {
  const { phoneNumber, botName } = req.body;
  if (!phoneNumber) return res.status(400).json({ error: 'Phone number required.' });

  const user = await findUserById(req.user.id);
  if (user.role !== 'admin' && isPlanExpired(user)) {
    return res.status(403).json({ error: 'Plan expired. Contact admin to renew.' });
  }

  const clean = phoneNumber.replace(/[^0-9]/g, '');
  if (clean.length < 7 || clean.length > 15) {
    return res.status(400).json({ error: 'Invalid phone number format.' });
  }

  try {
    await requestPairing(clean, req.user.id, botName || 'CYBER-BOT');

    try {
      const { removeConnectedFlag } = require('../../allfunc/connected-flag');
      removeConnectedFlag(clean);
    } catch (_) {}

    if (shouldDelegatePairing()) {
      // Supervisor spawns BOT_PAIRING=1 child — never call pair() in this web process
      nudgePairingProcessor();
      return res.json({ status: 'queued', number: clean });
    }

    await prepareFreshPairing(clean);
    spawnPairingChild(clean);
    return res.json({ status: 'started', number: clean });
  } catch (err) {
    console.error('[Pairing/request]', err.message);
    return res.status(500).json({ error: err.message || 'Could not start pairing.' });
  }
});

// ── GET /api/pairing/code/:number — client polls for pairing code ─────────────
router.get('/code/:number', protect, async (req, res) => {
  const clean = req.params.number.replace(/[^0-9]/g, '');
  if (!clean) return res.status(400).json({ error: 'Invalid number.' });

  try {
    const state = await getPairingState(clean);
    if (state?.code) {
      return res.json({ code: state.code, status: 'ready', number: clean });
    }

    const fileCode = await readCodeFromFile(clean);
    if (fileCode) {
      return res.json({ code: fileCode, status: 'ready', number: clean });
    }

    const status = state?.pairingStatus || 'pending';
    return res.json({ code: null, status, number: clean });
  } catch (err) {
    console.error('[Pairing/code]', err.message);
    return res.status(500).json({ error: 'Could not read pairing status.' });
  }
});

const PAIRING_IN_FLIGHT = new Set(['requested', 'pairing', 'code_ready']);

// ── GET /api/pairing/status/:number ──────────────────────────────────────────
router.get('/status/:number', protect, async (req, res) => {
  const clean = req.params.number.replace(/[^0-9]/g, '');

  let pairingState = null;
  try {
    pairingState = await getPairingState(clean);
  } catch (_) {}

  const owned = await getNumbersByOwner(req.user.id, null);
  const isOwner = owned.some((n) => String(n.number).replace(/[^0-9]/g, '') === clean);
  const isPairingOwner = pairingState?.pairingOwnerId
    && String(pairingState.pairingOwnerId) === String(req.user.id);
  if (!isOwner && !isPairingOwner && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'You do not own this number.' });
  }

  const canView = isOwner || isPairingOwner || req.user.role === 'admin';
  const { readConnectedFlag } = require('../../allfunc/connected-flag');
  const flag = readConnectedFlag(clean);
  const pairingInFlight = PAIRING_IN_FLIGHT.has(pairingState?.pairingStatus);

  const clearStalePairing = async () => {
    if (!pairingInFlight) await clearPairingRequest(clean).catch(() => {});
  };

  // FIX: Pairing in-flight MUST be checked first — prevents re-pair from immediately
  // returning connected:true because an old linked_numbers row still exists.
  // EXCEPTION: If the connected flag was set within the last 30s while status is 'code_ready',
  // the user JUST entered the code → return connected immediately (don't wait for clearPairingRequest).
  if (pairingInFlight) {
    const flagTs = flag?.ts || 0;
    const freshConnect = pairingState?.pairingStatus === 'code_ready'
      && Boolean(flag?.linked)
      && (Date.now() - flagTs < 30000);
    if (freshConnect && canView) {
      await clearPairingRequest(clean).catch(() => {});
      return res.json({ connected: true, ts: flag.ts, linked: true, status: 'linked', syncing: false });
    }
    return res.json({
      connected: false,
      pairing: true,
      status: pairingState.pairingStatus,
      syncing: pairingState.pairingStatus === 'code_ready',
    });
  }

  // Once pairing is no longer in-flight, check real connection signals
  try {
    if (await isNumberInLinkedNumbers(clean)) {
      await clearStalePairing();
      if (canView) {
        return res.json({ connected: true, ts: flag?.ts || Date.now(), linked: true, status: 'linked' });
      }
    }
  } catch (_) {}

  if (pairingState?.status === 'active' && canView) {
    let linked = false;
    try { linked = await isNumberInLinkedNumbers(clean); } catch (_) {}
    await clearStalePairing();
    return res.json({
      connected: true,
      linked: Boolean(linked),
      ts: flag?.ts || Date.now(),
      status: 'active',
      syncing: !linked,
    });
  }

  if (flag?.linked && canView) {
    await clearStalePairing();
    return res.json({ connected: true, ts: flag.ts || Date.now(), linked: true });
  }

  res.json({ connected: false });
});

module.exports = router;
