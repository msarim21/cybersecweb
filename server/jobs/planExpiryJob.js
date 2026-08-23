'use strict';

const { getExpiredUsers, disconnectAllUserDevices, getNumbersByOwner } = require('../db-service');
const path = require('path');
const fsSync = require('fs');

const PAIRING_BASE = path.join(__dirname, '../../nexstore/pairing');
const SESSIONS_BASE = path.join(__dirname, '../../nexstore/pairing');

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
    // getExpiredUsers now correctly returns users on 'trial' status with expired trialExpiresAt
    // and excludes users who were activated by admin (paid plans)
    const expiredUsers = await getExpiredUsers();
    if (!expiredUsers.length) {
      _running = false;
      return;
    }

    console.log(`[PlanExpiry] Found ${expiredUsers.length} expired trial user(s). Disconnecting devices & wiping sessions...`);

    for (const user of expiredUsers) {
      try {
        // Get actual linked numbers from DB before disconnecting
        const numbers = await getNumbersByOwner(user.id, null);
        const numberStrings = numbers.map(n => n.number);

        // 1. Disconnect all linked numbers — this also sets subscriptionStatus = 'expired'
        const result = await disconnectAllUserDevices(user.id);

        // 2. Wipe filesystem session directories for EACH number so bot can't reconnect
        for (const numStr of numberStrings) {
          if (!numStr) continue;
          const cleanNum = String(numStr).replace(/[^0-9]/g, '');
          const jid = cleanNum + '@s.whatsapp.net';

          const pathsToWipe = [
            path.join(PAIRING_BASE, jid),
            path.join(PAIRING_BASE, cleanNum),
            path.join(SESSIONS_BASE, jid),
            path.join(SESSIONS_BASE, cleanNum),
          ];

          // Add to stopped-bots so auto-reconnect sweep ignores this number
          try {
            const { addToStoppedBots } = require('../../allfunc/stopped-bots');
            addToStoppedBots(cleanNum);
          } catch (_) {}

          // Remove connected flag so dashboard shows offline
          try {
            const { removeConnectedFlag } = require('../../allfunc/connected-flag');
            removeConnectedFlag(cleanNum);
          } catch (_) {}

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

          // 3. Wipe DB session credentials to prevent auto-reconnect
          try {
            const { deleteSessionCreds } = require('../../session-db');
            await deleteSessionCreds(cleanNum);
          } catch (_) {}
        }

        console.log(`[PlanExpiry] ✅ Trial expired — User ${user.username || user.email}: disconnected ${result.disconnected} device(s), wiped ${numberStrings.length} session(s). Status set to 'expired'.`);
      } catch (err) {
        console.error(`[PlanExpiry] Error processing user ${user.id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[PlanExpiry] Cron check failed:', err.message);
  } finally {
    _running = false;
  }
}

function startPlanExpiryJob(intervalMs = 60_000) {
  // Run immediately on start to catch any trials that expired while server was down
  runPlanExpiryCheck().catch(() => {});
  // Then repeat every interval (default: every 60 seconds)
  const interval = setInterval(() => {
    runPlanExpiryCheck().catch(() => {});
  }, intervalMs);
  console.log(`[PlanExpiry] Trial auto-disconnect job started (checks every ${intervalMs / 1000}s)`);
  return interval;
}

module.exports = { startPlanExpiryJob, runPlanExpiryCheck };
