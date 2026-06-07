'use strict';

const path = require('path');
const fs = require('fs');
const { ORPHAN_GRACE_MS, wipeUnlinkedBotSession } = require('../../allfunc/orphan-bot-cleanup');

const PAIRING_BASE = path.join(__dirname, '../../nexstore/pairing');

let _running = false;

function shouldRunOrphanJob() {
  try {
    const { shouldRunWhatsAppSupervisor } = require('../../allfunc/whatsapp-host');
    return shouldRunWhatsAppSupervisor();
  } catch {
    return false;
  }
}

async function runOrphanDisconnectCheck() {
  if (!shouldRunOrphanJob()) return;
  if (_running) return;
  _running = true;
  try {
    if (!fs.existsSync(PAIRING_BASE)) return;

    const { readStopped } = require('../../allfunc/stopped-bots');
    const stoppedNums = new Set(readStopped());
    const { isNumberInLinkedNumbers } = require('../db-service');
    const { isConnected: isBotConnected, readConnectedFlag } = require('../../allfunc/connected-flag');

    const dirs = fs.readdirSync(PAIRING_BASE, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name.endsWith('@s.whatsapp.net'))
      .map((d) => d.name);

    if (!dirs.length) return;

    for (const dir of dirs) {
      const cleanNum = dir.replace('@s.whatsapp.net', '').replace(/[^0-9]/g, '');
      if (!cleanNum || stoppedNums.has(cleanNum)) continue;

      const connected = isBotConnected(cleanNum);
      if (!connected) continue;

      const inLinked = await isNumberInLinkedNumbers(cleanNum).catch(() => false);
      if (inLinked) continue;

      const flag = readConnectedFlag(cleanNum);
      const connectedAt = flag?.ts || 0;
      if (!connectedAt) continue;

      const age = Date.now() - connectedAt;
      if (age < ORPHAN_GRACE_MS) {
        const leftMin = Math.ceil((ORPHAN_GRACE_MS - age) / 60000);
        if (age > ORPHAN_GRACE_MS - 60_000) {
          console.log(`[OrphanDisconnect] +${cleanNum} unlinked — wipe in ~${leftMin} min if not saved to dashboard`);
        }
        continue;
      }

      await wipeUnlinkedBotSession(cleanNum);
    }
  } catch (err) {
    console.error('[OrphanDisconnect] Check failed:', err.message);
  } finally {
    _running = false;
  }
}

function startOrphanDisconnectJob(intervalMs = 60_000) {
  if (!shouldRunOrphanJob()) {
    console.log('[OrphanDisconnect] Skipped — WhatsApp host dyno not active');
    return null;
  }
  setTimeout(() => runOrphanDisconnectCheck().catch(() => {}), 30_000);
  const interval = setInterval(() => {
    runOrphanDisconnectCheck().catch(() => {});
  }, intervalMs);
  console.log(`[OrphanDisconnect] Unlinked pairing wipe job started (${ORPHAN_GRACE_MS / 60000} min grace, poll ${intervalMs / 1000}s)`);
  return interval;
}

module.exports = { startOrphanDisconnectJob, runOrphanDisconnectCheck, ORPHAN_GRACE_MS };
