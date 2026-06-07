'use strict';

const path = require('path');
const fs = require('fs');

const PAIRING_BASE = path.join(__dirname, '../../nexstore/pairing');
// Web pairing: user may take several minutes to enter code + dashboard auto-save
const PAIRING_GRACE_MS = 15 * 60 * 1000;

let _running = false;

function isWorkerProcess() {
  return process.env.WHATSAPP_WORKER === '1' || process.env.DYNO?.startsWith('worker');
}

async function runOrphanDisconnectCheck() {
  if (!isWorkerProcess()) return;
  if (_running) return;
  _running = true;
  try {
    if (!fs.existsSync(PAIRING_BASE)) return;

    const { readStopped } = require('../../allfunc/stopped-bots');
    const stoppedNums = new Set(readStopped());

    const dirs = fs.readdirSync(PAIRING_BASE, { withFileTypes: true })
      .filter(d => d.isDirectory() && d.name.endsWith('@s.whatsapp.net'))
      .map(d => d.name);

    if (!dirs.length) return;

    const { getAllActiveLinkedNumbers, upsertBotSession } = require('../db-service');
    let dbNumbers = [];
    try {
      const raw = await getAllActiveLinkedNumbers();
      dbNumbers = (raw || []).map(n => String(n).replace(/[^0-9]/g, ''));
    } catch (_) {}

    const dbSet = new Set(dbNumbers);
    const { isConnected: isBotConnected, readConnectedFlag, removeConnectedFlag } = require('../../allfunc/connected-flag');

    for (const dir of dirs) {
      const cleanNum = dir.replace('@s.whatsapp.net', '').replace(/[^0-9]/g, '');
      const isConnected = isBotConnected(cleanNum);
      const inDb = dbSet.has(cleanNum);
      const isStopped = stoppedNums.has(cleanNum);

      if (!isConnected || inDb || isStopped) continue;

      // Web dashboard pairing — number not in linked_numbers until user saves; never orphan-kill
      try {
        const { getPairingState } = require('../db-service');
        const pst = await getPairingState(cleanNum).catch(() => null);
        if (pst?.pairingOwnerId) continue;
        if (pst?.pairingStatus && ['requested', 'pairing', 'code_ready'].includes(pst.pairingStatus)) continue;
        if (pst?.status === 'active') continue;
      } catch (_) {}

      try {
        const flag = readConnectedFlag(cleanNum);
        if (flag?.ts && (Date.now() - flag.ts) < PAIRING_GRACE_MS) continue;
      } catch (_) {}

      console.log(`[OrphanDisconnect] Orphan bot found: ${cleanNum} — active but not in DB. Disconnecting...`);
      try {
        const pairMod = require('../../pair');
        if (typeof pairMod.stopBot === 'function') pairMod.stopBot(cleanNum + '@s.whatsapp.net');
      } catch (_) {}
      try { removeConnectedFlag(cleanNum); } catch (_) {}
      try {
        const { deleteSessionCreds } = require('../../session-db');
        await deleteSessionCreds(cleanNum);
        await upsertBotSession(cleanNum, 'inactive');
      } catch (_) {}
      try {
        const { addToStoppedBots } = require('../../allfunc/stopped-bots');
        addToStoppedBots(cleanNum);
      } catch (_) {}
      console.log(`[OrphanDisconnect] ${cleanNum} disconnected and marked stopped.`);
    }
  } catch (err) {
    console.error('[OrphanDisconnect] Check failed:', err.message);
  } finally {
    _running = false;
  }
}

function startOrphanDisconnectJob(intervalMs = 30_000) {
  if (!isWorkerProcess()) {
    console.log('[OrphanDisconnect] Skipped on web dyno — worker handles orphan cleanup');
    return null;
  }
  setTimeout(() => runOrphanDisconnectCheck().catch(() => {}), 60_000);
  const interval = setInterval(() => {
    runOrphanDisconnectCheck().catch(() => {});
  }, intervalMs);
  console.log(`[OrphanDisconnect] Auto-disconnect job started on worker (${intervalMs / 1000}s interval)`);
  return interval;
}

module.exports = { startOrphanDisconnectJob, runOrphanDisconnectCheck };
