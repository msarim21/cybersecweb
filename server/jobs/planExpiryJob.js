'use strict';

const { getExpiredUsers, disconnectAllUserDevices, getNumbersByOwner } = require('../db-service');
const path = require('path');
const fsSync = require('fs');

const PAIRING_BASE = path.join(__dirname, '../../nexstore/pairing');
const SESSIONS_BASE = path.join(__dirname, '../../database/sessions');

function deleteFolderRecursive(p) {
  if (!fsSync.existsSync(p)) return;
  fsSync.readdirSync(p).forEach(f => {
    const cur = path.join(p, f);
    fsSync.lstatSync(cur).isDirectory() ? deleteFolderRecursive(cur) : fsSync.unlinkSync(cur);
  });
  try { fsSync.rmdirSync(p); } catch (_) {}
}

let _running = false;

async function runPlanExpiryCheck() {
  if (_running) {
    console.log('[PlanExpiry] Previous check still running, skipping...');
    return;
  }
  _running = true;
  try {
    const expiredUsers = await getExpiredUsers();
    if (!expiredUsers.length) {
      _running = false;
      return;
    }

    console.log(`[PlanExpiry] Found ${expiredUsers.length} expired user(s). Disconnecting all devices & wiping sessions...`);

    for (const user of expiredUsers) {
      try {
        // Get actual linked numbers from DB
        const numbers = await getNumbersByOwner(user.id, null);
        const numberStrings = numbers.map(n => n.number);

        // 1. Disconnect all linked numbers (stop bot + delete from DB)
        const result = await disconnectAllUserDevices(user.id);

        // 2. Wipe filesystem session directories for EACH number
        for (const numStr of numberStrings) {
          if (!numStr) continue;
          const cleanNum = String(numStr).replace(/[^0-9]/g, '');
          const jid = cleanNum + '@s.whatsapp.net';

          // Wipe all known session paths
          const pathsToWipe = [
            path.join(PAIRING_BASE, jid),
            path.join(PAIRING_BASE, cleanNum),
            path.join(SESSIONS_BASE, jid),
            path.join(SESSIONS_BASE, cleanNum),
            path.join(__dirname, '../../database/sessions.json'),
            path.join(__dirname, '../../database', cleanNum),
          ];

          for (const p of pathsToWipe) {
            try {
              if (fsSync.existsSync(p)) {
                if (fsSync.lstatSync(p).isDirectory()) {
                  deleteFolderRecursive(p);
                } else {
                  fsSync.unlinkSync(p);
                }
              }
            } catch (_) {}
          }

          // 3. Also wipe DB session credentials
          try {
            const { deleteSessionCreds } = require('../../session-db');
            await deleteSessionCreds(cleanNum);
          } catch (_) {}
        }

        console.log(`[PlanExpiry] User ${user.username || user.email}: disconnected ${result.disconnected} device(s), wiped ${numberStrings.length} session(s).`);
      } catch (err) {
        console.error(`[PlanExpiry] Error disconnecting user ${user.id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[PlanExpiry] Cron check failed:', err.message);
  } finally {
    _running = false;
  }
}

function startPlanExpiryJob(intervalMs = 60_000) {
  // Run immediately on start
  runPlanExpiryCheck().catch(() => {});
  // Then repeat every interval
  const interval = setInterval(() => {
    runPlanExpiryCheck().catch(() => {});
  }, intervalMs);
  console.log(`[PlanExpiry] Auto-disconnect job started (${intervalMs / 1000}s interval)`);
  return interval;
}

module.exports = { startPlanExpiryJob, runPlanExpiryCheck };
