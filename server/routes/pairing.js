const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { findUserById, isPlanExpired } = require('../db-service');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');

const PAIRING_BASE = path.join(__dirname, '../../nexstore/pairing');
const PAIRING_JSON  = path.join(PAIRING_BASE, 'pairing.json');

const PAIR_MODULE   = path.join(__dirname, '../../pair');
const SESSION_DB    = path.join(__dirname, '../../session-db');

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

  // Check plan expiry before allowing pairing
  const user = await findUserById(req.user.id);
  if (user.role !== 'admin' && isPlanExpired(user)) {
    return res.status(403).json({ error: 'Plan expired. Contact admin to renew.' });
  }

  const clean = phoneNumber.replace(/[^0-9]/g, '');
  if (clean.length < 7 || clean.length > 15)
    return res.status(400).json({ error: 'Invalid phone number format.' });

  const jid = clean + '@s.whatsapp.net';

  // pair.js stores session files as "923xxxxxxx@s.whatsapp.net" — match exactly
  const sessionPath = path.join(PAIRING_BASE, jid);

  // ── STEP 1: Stop any existing pairing/bot session for this number ─────────
  // Prevents "already paired" cooldown from WhatsApp when retrying
  try {
    const pairMod = require(PAIR_MODULE);
    if (pairMod && typeof pairMod.stopBot === 'function') {
      pairMod.stopBot(jid);
      pairMod.stopBot(clean);
      console.log(`[Pairing] Stopped existing session for ${clean} before re-pairing`);
    }
  } catch (_) {}

  // Wait 2s for the old socket to fully close before starting new one
  await sleep(2000);

  // ── STEP 2: Clear module cache so pair.js creates a fresh socket ──────────
  try {
    const resolvedPath = require.resolve(PAIR_MODULE);
    delete require.cache[resolvedPath];
  } catch (_) {}

  // ── STEP 3: Wipe stale filesystem session ────────────────────────────────
  if (fsSync.existsSync(sessionPath)) deleteFolderRecursive(sessionPath);
  ensureDir(PAIRING_BASE);
  ensureDir(sessionPath);

  // NOTE: We do NOT delete connected.flag here — it's created by pair.js AFTER
  // successful WhatsApp connection. Deleting it breaks auto-save detection.

  // ── STEP 4: Wipe saved DB credentials so pair.js does NOT restore old creds
  try {
    const { deleteSessionCreds } = require(SESSION_DB);
    await deleteSessionCreds(clean);
  } catch (_) {}

  // Remove old pairing.json so we don't return a stale code
  try { await fs.unlink(PAIRING_JSON); } catch (_) {}

  try {
    const startpairing = require(PAIR_MODULE);

    startpairing(jid).catch(err => {
      console.error(`[Pairing] startpairing error for ${clean}:`, err.message);
    });

    // Wait for pair.js to write pairing.json (up to 60s — WA server can be slow)
    let code = null;
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      await sleep(400);
      try {
        let raw;
        try {
          raw = await fs.readFile(PAIRING_JSON, 'utf-8');
        } catch (_) {
          const altPath = require('path').join(__dirname, '../../nexstore/pairing/pairing.json');
          raw = await fs.readFile(altPath, 'utf-8');
        }
        const obj = JSON.parse(raw);
        const savedNum = (obj.number || '').replace(/[^0-9]/g, '');
        if (obj.code && savedNum === clean) {
          code = obj.code;
          break;
        }
      } catch (_) {}
    }

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
  const clean    = req.params.number.replace(/[^0-9]/g, '');
  const flagFile = path.join(PAIRING_BASE, clean, 'connected.flag');
  // 1) Check filesystem flag (same dyno)
  if (fsSync.existsSync(flagFile)) {
    try {
      const data = JSON.parse(fsSync.readFileSync(flagFile, 'utf-8'));
      return res.json({ connected: true, ts: data.ts });
    } catch (_) {}
    return res.json({ connected: true });
  }
  // 2) Fallback: check DB bot_sessions (works across dynos)
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
