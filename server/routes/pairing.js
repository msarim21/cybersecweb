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
  return process.env.BOT_ISOLATION === '1'
    && String(process.env.WHATSAPP_HOST_DYNO || '').toLowerCase() === 'worker'
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

  const sessionPath = path.join(PAIRING_BASE, clean);
  const sessionPathAlt = path.join(PAIRING_BASE, clean + '@s.whatsapp.net');

  const {
    savePairingOwner,
    ensurePairingRequest,
    getPairingState,
    getActiveBotSessions,
    isNumberInLinkedNumbers,
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

  const existingState = await getPairingState(clean).catch(() => null);
  if (existingState?.status === 'code_ready' && existingState.code) {
    return res.json({ code: existingState.code, number: clean, reused: true });
  }

  try {
    const botName = req.body.botName || 'CYBER PRO';
    await savePairingOwner(clean, req.user.id, botName);
    await ensurePairingRequest(clean);
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
      const code = await waitForDbPairingCode(clean, PAIRING_CODE_WAIT_MS);
      if (!code) {
        return res.status(500).json({ error: 'Timed out waiting for pairing code. Check the number and try again.' });
      }
      return res.json({ code, number: clean });
    }

    delete require.cache[require.resolve(PAIR_MODULE)];
    const startpairing = require(PAIR_MODULE);
    const jid = clean + '@s.whatsapp.net';

    startpairing(jid).catch((err) => {
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
    const { getPool } = require('../db');
    const pool = getPool();
    if (pool) {
      const { rows } = await pool.query(
        "SELECT status, connected_at FROM bot_sessions WHERE number=$1 AND status='active' LIMIT 1",
        [clean]
      );
      if (rows.length > 0) {
        return res.json({ connected: true, ts: rows[0].connected_at });
      }
    }
  } catch (_) {}

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

module.exports = router;
