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

  // ✅ FIX 1: Check local filesystem first (connected.flag + creds.json)
  const connectedFlagPath = path.join(sessionPath, 'connected.flag');
  const existingCredsPath = path.join(sessionPath, 'creds.json');
  const isAlreadyPairedLocal = fsSync.existsSync(connectedFlagPath) || (fsSync.existsSync(existingCredsPath) && (() => {
    try {
      const c = JSON.parse(fsSync.readFileSync(existingCredsPath, 'utf-8'));
      return !!(c.noiseKey?.private || c.me);
    } catch(_) { return false; }
  })());

  if (isAlreadyPairedLocal) {
    console.log(`[Pairing] ${clean}: Already paired (local files found) — blocking new pairing code`);
    return res.status(409).json({ error: 'This number is already linked. Unlink it first before re-pairing.', alreadyLinked: true });
  }

  // ✅ FIX 2: Check DATABASE session — Heroku/Replit ephemeral disk wipes local
  // files on every restart. If session creds exist in DB, the number IS paired.
  // Without this check, restart → files gone → new pairing code → WhatsApp spam.
  //
  // ✅ BUG FIX (Bug 10): LOGGED_OUT/ERROR status check added.
  // Problem: Number WhatsApp se logout hone ke baad bhi DB mein session creds rahte hain.
  // hasSessionInDb() true return karta hai → "already linked" error aata hai.
  // Dashboard mein number nahi dikhta (linked_numbers inactive hai) lekin pairing block hoti hai.
  // Fix: connection_status LOGGED_OUT/ERROR ho to session auto-clear karo aur fresh pairing allow karo.
  try {
    const { hasSessionInDb, ensureSessionRestored, deleteSessionCreds, removeLinkedNumber } = require('../../session-db');
    const inDb = await hasSessionInDb(clean);
    if (inDb) {
      // Check connection_status — LOGGED_OUT/ERROR means stale session, allow re-pairing
      let connStatus = null;
      try {
        const { getPool, isMongoMode } = require('../db');
        const pool = getPool();
        if (pool && !isMongoMode?.()) {
          const r = await pool.query(
            `SELECT connection_status FROM bot_sessions WHERE REGEXP_REPLACE(number,'[^0-9]','','g') = $1 ORDER BY last_active DESC NULLS LAST LIMIT 1`,
            [clean]
          );
          connStatus = r.rows[0]?.connection_status || null;
        } else if (isMongoMode?.()) {
          const BotSession = require('../models/BotSession');
          const bs = await BotSession.findOne({ number: { $in: [clean, clean + '@s.whatsapp.net'] } })
            .sort({ lastActive: -1 }).select('connectionStatus').lean();
          connStatus = bs?.connectionStatus || null;
        }
      } catch (_) {}

      // ✅ WHITELIST approach — sirf clearly CONNECTED status mein block karo.
      // Blacklist approach (stale check) ka bug: connStatus === null hone par bhi block hota tha.
      // e.g. bot_sessions row nahi hai, ya connection_status null/empty → old code blocked pairing!
      // Fix: ONLY block when bot is confirmed ACTIVELY CONNECTED. Everything else → allow re-pair.
      const activeStatuses = ['CONNECTED', 'OPEN'];
      const isReallyActive = connStatus && activeStatuses.includes(connStatus.toUpperCase());
      if (!isReallyActive) {
        // null / LOGGED_OUT / ERROR / DISCONNECTED / inactive / unknown → stale, allow fresh pairing
        console.log(`[Pairing] ${clean}: Session not active (connection_status=${connStatus ?? 'null'}) — auto-clearing DB creds for fresh pairing`);
        await deleteSessionCreds(clean).catch(() => {});
        await removeLinkedNumber(clean).catch(() => {});
        // Fall through to generate fresh pairing code below
      } else {
        console.log(`[Pairing] ${clean}: Bot is CONNECTED (connection_status=${connStatus}) — blocking re-pairing`);
        // Restore from DB so bot can auto-reconnect without re-pairing
        await ensureSessionRestored(clean).catch(() => {});
        return res.status(409).json({
          error: 'This number is already linked and connected. Unlink it first before re-pairing.',
          alreadyLinked: true
        });
      }
    }
  } catch (dbErr) {
    // DB check failed — log and continue (do not block pairing if DB is down)
    console.warn(`[Pairing] DB session check failed for ${clean}: ${dbErr.message}`);
  }

  // ✅ FIX 3: Check active bot session status in DB (BotSession model)
  try {
    const { upsertBotSession } = require('../db-service');
    // Check if there's an active session in bot_sessions table
    const { getPool, isMongoMode } = require('../db');
    const pool = getPool();
    if (pool && !isMongoMode?.()) {
      const result = await pool.query(
        `SELECT status FROM bot_sessions WHERE REGEXP_REPLACE(number,'[^0-9]','','g') = $1 AND status = 'active' LIMIT 1`,
        [clean]
      );
      if (result.rows.length > 0) {
        console.log(`[Pairing] ${clean}: Active bot_session in PostgreSQL — blocking new pairing code`);
        return res.status(409).json({
          error: 'This number is already active. Unlink it first before re-pairing.',
          alreadyLinked: true
        });
      }
    } else if (isMongoMode?.()) {
      const BotSession = require('../models/BotSession');
      const existing = await BotSession.findOne({
        number: { $in: [clean, clean + '@s.whatsapp.net'] },
        status: 'active'
      });
      if (existing) {
        console.log(`[Pairing] ${clean}: Active BotSession in MongoDB — blocking new pairing code`);
        return res.status(409).json({
          error: 'This number is already active. Unlink it first before re-pairing.',
          alreadyLinked: true
        });
      }
    }
  } catch (sessionCheckErr) {
    console.warn(`[Pairing] Session status check failed for ${clean}: ${sessionCheckErr.message}`);
  }

  // ── Number is NOT paired — proceed with fresh pairing ─────────────────────
  console.log(`[Pairing] ${clean}: No existing session found — generating fresh pairing code`);

  // Wipe any stale/partial session so pair.js always issues a fresh code
  if (fsSync.existsSync(sessionPath)) deleteFolderRecursive(sessionPath);
  ensureDir(PAIRING_BASE);
  ensureDir(sessionPath);

  // Remove old per-bot pairing file so we don't return a stale code
  const PAIRING_JSON = path.join(PAIRING_BASE, `pairing_${clean}.json`);
  try { await fs.unlink(PAIRING_JSON); } catch (_) {}

  // ✅ FIX 4: Save pairing ownership BEFORE starting pair.js
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

    // Wait for pair.js to write pairing.json (max 40 seconds)
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
