'use strict';

// ════════════════════════════════════════════════════════════════════════════
// FORCE-DISCONNECT — shared helper to fully kill + unlink a WhatsApp number.
//
// Used by:
//   - server/jobs/planExpiryJob.js (periodic sweep for expired trials)
//   - allfunc/subscription-guard.js (immediate, per-message / watchdog check)
//   - server/routes/admin.js (manual "DC ALL" / ban actions)
//
// Wipes local session files, deletes DB session creds, marks the number
// stopped (so auto-reconnect sweeps skip it), and removes the connected
// flag so the dashboard immediately shows the bot as offline.
// ════════════════════════════════════════════════════════════════════════════

const path = require('path');
const fsSync = require('fs');

const PAIRING_BASE = path.join(__dirname, '..', 'nexstore', 'pairing');

function deleteFolderRecursive(p) {
  if (!fsSync.existsSync(p)) return;
  fsSync.readdirSync(p).forEach((f) => {
    const cur = path.join(p, f);
    try {
      fsSync.lstatSync(cur).isDirectory() ? deleteFolderRecursive(cur) : fsSync.unlinkSync(cur);
    } catch (_) {}
  });
  try { fsSync.rmdirSync(p); } catch (_) {}
}

/**
 * Fully disconnect + unlink a single WhatsApp number so it cannot reconnect
 * on its own. Safe to call repeatedly (idempotent).
 *
 * @param {string} number - raw or clean WhatsApp number
 * @param {object} [opts]
 * @param {string} [opts.reason] - short reason for logging (e.g. 'trial_expired')
 */
async function forceDisconnectNumber(number, opts = {}) {
  const cleanNum = String(number || '').replace(/[^0-9]/g, '');
  if (!cleanNum) return false;
  const reason = opts.reason || 'unauthorized';
  const jid = cleanNum + '@s.whatsapp.net';

  // 1. Kill the live socket if one is running in this process (flat mode,
  //    or the isolated child process that owns this exact number).
  try {
    const { stopBot } = require('../pair');
    if (typeof stopBot === 'function') stopBot(cleanNum);
  } catch (_) {}

  // 2. Add to stopped-bots so no sweep/supervisor tries to bring it back.
  try {
    const { addToStoppedBots } = require('./stopped-bots');
    addToStoppedBots(cleanNum);
  } catch (_) {}

  // 3. Remove the connected flag so the dashboard reflects offline instantly.
  try {
    const { removeConnectedFlag } = require('./connected-flag');
    removeConnectedFlag(cleanNum);
  } catch (_) {}

  // 4. Wipe local session folders so a stale creds.json can't be reused.
  const pathsToWipe = [
    path.join(PAIRING_BASE, jid),
    path.join(PAIRING_BASE, cleanNum),
  ];
  for (const p of pathsToWipe) {
    try {
      if (fsSync.existsSync(p)) {
        fsSync.lstatSync(p).isDirectory() ? deleteFolderRecursive(p) : fsSync.unlinkSync(p);
      }
    } catch (_) {}
  }

  // 5. Wipe DB session credentials so auto-reconnect / restore can't revive it.
  try {
    const { deleteSessionCreds } = require('../session-db');
    await deleteSessionCreds(cleanNum);
  } catch (_) {}

  console.log(`[force-disconnect] ${cleanNum} disconnected (${reason})`);
  return true;
}

module.exports = { forceDisconnectNumber, deleteFolderRecursive };
