const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  findUserById,
  isPlanExpired,
  getNumbersByOwner,
  requestPairing,
  getPairingState,
} = require('../db-service');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');

const PAIRING_BASE = path.join(__dirname, '../../nexstore/pairing');
const PAIRING_JSON  = path.join(PAIRING_BASE, 'pairing.json');
const PAIR_MODULE   = path.join(__dirname, '../../pair');
const SESSION_DB    = path.join(__dirname, '../../session-db');

function isWebDyno() {
  return Boolean(process.env.DYNO) && process.env.WHATSAPP_WORKER !== '1';
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

async function pollPairingCode(clean, deadlineMs = 60_000) {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    try {
      const state = await getPairingState(clean);
      if (state?.code) return state.code;
    } catch (_) {}
    if (!isWebDyno()) {
      try {
        const raw = await fs.readFile(PAIRING_JSON, 'utf-8');
        const obj = JSON.parse(raw);
        const savedNum = (obj.number || '').replace(/[^0-9]/g, '');
        if (obj.code && savedNum === clean) return obj.code;
      } catch (_) {}
    }
    await sleep(400);
  }
  return null;
}

// ── POST /api/pairing/request ─────────────────────────────────────────────────
router.post('/request', protect, async (req, res) => {
  const { phoneNumber } = req.body;
  if (!phoneNumber) return res.status(400).json({ error: 'Phone number required.' });

  const user = await findUserById(req.user.id);
  if (user.role !== 'admin' && isPlanExpired(user)) {
    return res.status(403).json({ error: 'Plan expired. Contact admin to renew.' });
  }

  const clean = phoneNumber.replace(/[^0-9]/g, '');
  if (clean.length < 7 || clean.length > 15) {
    return res.status(400).json({ error: 'Invalid phone number format.' });
  }

  const jid = clean + '@s.whatsapp.net';
  const sessionPath = path.join(PAIRING_BASE, jid);

  const { removeFromStoppedBots } = require('../../allfunc/stopped-bots');
  removeFromStoppedBots(clean);

  try {
    const pairMod = require(PAIR_MODULE);
    if (pairMod && typeof pairMod.stopBot === 'function') {
      pairMod.stopBot(jid);
      pairMod.stopBot(clean);
    }
  } catch (_) {}

  await sleep(2000);

  try {
    const { deleteSessionCreds } = require(SESSION_DB);
    await deleteSessionCreds(clean);
  } catch (_) {}

  try { await fs.unlink(PAIRING_JSON); } catch (_) {}

  // Web dyno (Heroku): queue pairing for worker — do NOT run pair.js here
  if (isWebDyno()) {
    try {
      await requestPairing(clean, req.user.id);
      const code = await pollPairingCode(clean);
      if (!code) {
        return res.status(500).json({
          error: 'Timed out waiting for pairing code. Worker dyno check karein — dubara try karein.',
        });
      }
      return res.json({ code, number: clean });
    } catch (err) {
      console.error('[Pairing/web]', err.message);
      return res.status(500).json({ error: err.message || 'Could not queue pairing request.' });
    }
  }

  // Worker or local dev: run pair.js directly
  if (fsSync.existsSync(sessionPath)) deleteFolderRecursive(sessionPath);
  ensureDir(PAIRING_BASE);
  ensureDir(sessionPath);

  try {
    const startpairing = require(PAIR_MODULE);
    startpairing(jid).catch(err => {
      console.error(`[Pairing] startpairing error for ${clean}:`, err.message);
    });

    const code = await pollPairingCode(clean);
    if (!code) {
      return res.status(500).json({ error: 'Timed out waiting for pairing code. WhatsApp server slow hai — dubara try karein.' });
    }
    return res.json({ code, number: clean });
  } catch (err) {
    console.error('[Pairing]', err.message);
    return res.status(500).json({ error: err.message || 'Could not generate pairing code. Please try again.' });
  }
});

// ── GET /api/pairing/status/:number ──────────────────────────────────────────
router.get('/status/:number', protect, async (req, res) => {
  const clean = req.params.number.replace(/[^0-9]/g, '');

  const owned = await getNumbersByOwner(req.user.id, null);
  const isOwner = owned.some((n) => String(n.number).replace(/[^0-9]/g, '') === clean);
  if (!isOwner && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'You do not own this number.' });
  }

  const { readConnectedFlag, isConnected } = require('../../allfunc/connected-flag');
  if (isConnected(clean)) {
    try {
      const data = readConnectedFlag(clean);
      if (data?.ts) return res.json({ connected: true, ts: data.ts });
    } catch (_) {}
    return res.json({ connected: true });
  }

  try {
    const state = await getPairingState(clean);
    if (state?.status === 'active') return res.json({ connected: true });
  } catch (_) {}

  try {
    const svc = require('../db-service');
    const activeSessions = await svc.getActiveBotSessions();
    if (activeSessions.some(n => String(n).replace(/[^0-9]/g, '') === clean)) {
      return res.json({ connected: true });
    }
  } catch (_) {}

  res.json({ connected: false });
});

module.exports = router;
