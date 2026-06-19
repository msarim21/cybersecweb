const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');

const PAIRING_BASE = path.join(__dirname, '../../nexstore/pairing');
const PAIRING_JSON = path.join(PAIRING_BASE, 'pairing.json');
const PAIR_MODULE = path.join(__dirname, '../../pair');
const PAIRING_ACTIVE_MAX_AGE_MS = 5 * 60 * 1000;
const PAIRING_CODE_WAIT_MS = 75_000;
const PAIRING_CODE_REUSE_MAX_MS = 3 * 60 * 1000;

function ensureDir(p) {
  if (!fsSync.existsSync(p)) fsSync.mkdirSync(p, { recursive: true });
}

function deleteFolderRecursive(p) {
  if (!fsSync.existsSync(p)) return;
  fsSync.readdirSync(p).forEach((f) => {
    const cur = path.join(p, f);
    fsSync.lstatSync(cur).isDirectory() ? deleteFolderRecursive(cur) : fsSync.unlinkSync(cur);
  });
  try { fsSync.rmdirSync(p); } catch (_) {}
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isRemoteWorkerPairingMode() {
  // When bots run on worker, web dyno must NEVER call pair.js — it would
  // open a WhatsApp socket on web and fight the worker (Error 440).
  // Works for both BOT_ISOLATION=0 (flat) and BOT_ISOLATION=1 (supervisor).
  return String(process.env.WHATSAPP_HOST_DYNO || '').toLowerCase() === 'worker'
    && String(process.env.DYNO || '').startsWith('web');
}

async function waitForDbPairingCode(clean, deadlineMs = PAIRING_CODE_WAIT_MS) {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    await sleep(500);
    try {
      const { getPairingState } = require('../db-service');
      const st = await getPairingState(clean).catch(() => null);
      if (st?.status === 'code_ready' && st.code) return st.code;
      if (st?.status === 'active') return null;
    } catch (_) {}
  }
  return null;
}

async function isFreshlyConnectedNumber(clean, getActiveBotSessions, getPairingState) {
  const activeSessions = await getActiveBotSessions().catch(() => []);
  if (!activeSessions.map((n) => String(n).replace(/[^0-9]/g, '')).includes(clean)) {
    return false;
  }

  const state = await getPairingState(clean).catch(() => null);
  if (state?.status === 'code_ready' || state?.status === 'requested' || state?.status === 'in_progress') {
    return false;
  }

  try {
    const { getPool } = require('../db');
    const pool = getPool();
    if (!pool) {
      try {
        const mongoose = require('mongoose');
        if (mongoose.connection.readyState !== 1) return false;
        const BotSession = require('../models/BotSession');
        const doc = await BotSession.findOne({ number: clean }).select('status lastActive connectedAt').lean();
        if (!doc || doc.status !== 'active') return false;
        const lastActive = doc.lastActive ? new Date(doc.lastActive).getTime() : 0;
        const connectedAt = doc.connectedAt ? new Date(doc.connectedAt).getTime() : 0;
        const fresh = Math.max(lastActive, connectedAt);
        return fresh > 0 && (Date.now() - fresh) <= PAIRING_ACTIVE_MAX_AGE_MS;
      } catch (_) {
        return false;
      }
    }
    const { rows } = await pool.query(
      "SELECT status, last_active, connected_at FROM bot_sessions WHERE number=$1 LIMIT 1",
      [clean]
    );
    const row = rows[0];
    if (!row || row.status !== 'active') return false;
    const lastActive = row.last_active ? Date.parse(row.last_active) : 0;
    const connectedAt = row.connected_at ? Date.parse(row.connected_at) : 0;
    const fresh = Math.max(lastActive, connectedAt);
    return fresh > 0 && (Date.now() - fresh) <= PAIRING_ACTIVE_MAX_AGE_MS;
  } catch (_) {
    return false;
  }
}

// POST /api/pairing/request
router.post('/request', protect, async (req, res) => {
  const { phoneNumber } = req.body;
  if (!phoneNumber) return res.status(400).json({ error: 'Phone number required.' });

  const clean = phoneNumber.replace(/[^0-9]/g, '');
  if (clean.length < 7 || clean.length > 15) {
    return res.status(400).json({ error: 'Invalid phone number format.' });
  }

  try {
    const { logBotEvent } = require('../../allfunc/bot-lifecycle');
    logBotEvent(clean, 'pair_request_received', { userId: req.user?.id });
  } catch (_) {}

  const sessionPath = path.join(PAIRING_BASE, clean);
  const sessionPathAlt = path.join(PAIRING_BASE, clean + '@s.whatsapp.net');

  const {
    savePairingOwner,
    ensurePairingRequest,
    getPairingState,
    getActiveBotSessions,
    isNumberInLinkedNumbers,
    clearPairingRequest,
    upsertBotSession,
  } = require('../db-service');

  const alreadyLinked = await isNumberInLinkedNumbers(clean).catch(() => false);
  if (alreadyLinked) {
    return res.status(409).json({
      error: 'This number is already linked. The bot will reconnect using the saved session; disconnect it first to pair again.'
    });
  }

  const alreadyLive = await isFreshlyConnectedNumber(clean, getActiveBotSessions, getPairingState);
  if (alreadyLive) {
    return res.status(409).json({ error: 'This number is already connected. Re-pair only after disconnecting it.' });
  }

  // Stop any in-process pairing socket so a retry isn't blocked by the
  // duplicate guard (dead ws + startingAt within 60s).
  try {
    const pairMod = require(PAIR_MODULE);
    if (typeof pairMod.stopBot === 'function') {
      pairMod.stopBot(clean);
      pairMod.stopBot(clean + '@s.whatsapp.net');
    }
  } catch (_) {}

  const existingState = await getPairingState(clean).catch(() => null);
  if (existingState?.status === 'code_ready' && existingState.code) {
    const updatedAt = existingState.updatedAt ? new Date(existingState.updatedAt).getTime() : 0;
    const freshEnough = updatedAt > 0 && (Date.now() - updatedAt) <= PAIRING_CODE_REUSE_MAX_MS;
    if (freshEnough) {
      return res.json({ code: existingState.code, number: clean, reused: true });
    }
    // Stale code from a failed/expired attempt — wipe and generate a new one.
    await clearPairingRequest(clean).catch(() => {});
  }

  try {
    const botName = req.body.botName || 'CYBER PRO';
    await savePairingOwner(clean, req.user.id, botName);
    await ensurePairingRequest(clean, { force: true });
    // Mark session inactive so a stale active row doesn't block re-pair.
    await upsertBotSession(clean, 'inactive').catch(() => {});
  } catch (_) {}

  if (fsSync.existsSync(sessionPath)) deleteFolderRecursive(sessionPath);
  if (fsSync.existsSync(sessionPathAlt)) deleteFolderRecursive(sessionPathAlt);
  ensureDir(PAIRING_BASE);
  ensureDir(sessionPath);
  try { await fs.unlink(PAIRING_JSON); } catch (_) {}

  // Drop any stale session creds from the DB. pair.js → ensureSessionRestored()
  // would otherwise rehydrate the deleted auth folder from these creds, which
  // marks the socket as already registered and skips pairing-code generation —
  // causing the request to time out for any number that was previously paired
  // and later disconnected.
  try {
    const { deleteSessionCreds } = require('../../session-db');
    await deleteSessionCreds(clean);
  } catch (_) {}

  try {
    if (isRemoteWorkerPairingMode()) {
      // Worker generates the code asynchronously — dashboard polls GET /api/pairing/code/:number
      return res.json({ accepted: true, async: true, number: clean, status: 'requested' });
    }

    delete require.cache[require.resolve(PAIR_MODULE)];
    const startpairing = require(PAIR_MODULE);
    const jid = clean + '@s.whatsapp.net';

    startpairing(jid, { freshPairing: true }).catch((err) => {
      console.error(`[Pairing] startpairing error for ${clean}:`, err.message);
    });

    let code = null;
    const deadline = Date.now() + PAIRING_CODE_WAIT_MS;
    while (Date.now() < deadline) {
      await sleep(500);
      try {
        const st = await getPairingState(clean).catch(() => null);
        if (st?.status === 'code_ready' && st.code) {
          code = st.code;
          break;
        }
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
      await clearPairingRequest(clean).catch(() => {});
      try {
        const pairMod = require(PAIR_MODULE);
        if (typeof pairMod.stopBot === 'function') pairMod.stopBot(clean);
      } catch (_) {}
      return res.status(500).json({ error: 'Timed out waiting for pairing code. Check the number and try again.' });
    }

    return res.json({ code, number: clean });
  } catch (err) {
    console.error('[Pairing]', err.message);
    return res.status(500).json({ error: err.message || 'Could not generate pairing code. Please try again.' });
  }
});

// GET /api/pairing/status/:number
router.get('/status/:number', protect, async (req, res) => {
  const clean = req.params.number.replace(/[^0-9]/g, '');

  try {
    const { getBotPairingStatus, isNumberInLinkedNumbers } = require('../db-service');
    const status = await getBotPairingStatus(clean);

    if (status.connected) {
      const linked = await isNumberInLinkedNumbers(clean).catch(() => false);
      return res.json({ ...status, linked });
    }

    if (status.pairing || status.syncing) {
      return res.json(status);
    }
  } catch (_) {}

  // Same-dyno fallback (local dev / single process)
  try {
    const { readConnectedFlag } = require('../../allfunc/connected-flag');
    const flag = readConnectedFlag(clean);
    if (flag?.connected) {
      return res.json({ connected: true, ts: flag.ts, linked: Boolean(flag.linked) });
    }
  } catch (_) {}

  res.json({ connected: false });
});

// GET /api/pairing/code/:number — poll pairing code from worker (async flow)
router.get('/code/:number', protect, async (req, res) => {
  const clean = req.params.number.replace(/[^0-9]/g, '');
  if (!clean) return res.status(400).json({ error: 'Invalid number' });

  try {
    const { getPairingState } = require('../db-service');
    const st = await getPairingState(clean).catch(() => null);

    if (st?.status === 'failed') {
      return res.status(500).json({ error: 'Pairing failed on worker. Try again.', status: 'failed' });
    }
    if (st?.status === 'code_ready' && st.code) {
      return res.json({ code: st.code, number: clean, status: 'code_ready' });
    }
    return res.json({
      code: null,
      number: clean,
      status: st?.status || 'pending',
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Could not fetch pairing code' });
  }
});

module.exports = router;
