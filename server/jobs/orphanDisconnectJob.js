'use strict';

const path = require('path');
const fs = require('fs');

const PAIRING_BASE = path.join(__dirname, '../../nexstore/pairing');
const STOPPED_FILE = path.join(__dirname, '../../database/stopped_bots.json');

let _running = false;

function getStoppedNumbers() {
  try {
    if (fs.existsSync(STOPPED_FILE)) {
      return new Set(JSON.parse(fs.readFileSync(STOPPED_FILE, 'utf-8')).map(n => String(n).replace(/[^0-9]/g, '')));
    }
  } catch (_) {}
  return new Set();
}

async function runOrphanDisconnectCheck() {
  if (_running) return;
  _running = true;
  try {
    if (!fs.existsSync(PAIRING_BASE)) { _running = false; return; }

    const stoppedNums = getStoppedNumbers();
    const dirs = fs.readdirSync(PAIRING_BASE, { withFileTypes: true })
      .filter(d => d.isDirectory() && d.name.endsWith('@s.whatsapp.net'))
      .map(d => d.name);

    if (!dirs.length) { _running = false; return; }

    const { getAllActiveLinkedNumbers, upsertBotSession } = require('../db-service');
    let dbNumbers = [];
    try {
      const raw = await getAllActiveLinkedNumbers();
      dbNumbers = (raw || []).map(n => String(n).replace(/[^0-9]/g, ''));
    } catch (_) {}

    const dbSet = new Set(dbNumbers);

    for (const dir of dirs) {
      const cleanNum = dir.replace('@s.whatsapp.net', '').replace(/[^0-9]/g, '');
      const flagCandidates = [
        path.join(PAIRING_BASE, cleanNum, 'connected.flag'),
        path.join(PAIRING_BASE, dir, 'connected.flag'),
      ];
      const flagFile = flagCandidates.find((p) => fs.existsSync(p));
      const isConnected = Boolean(flagFile);
      const inDb = dbSet.has(cleanNum);
      const isStopped = stoppedNums.has(cleanNum);

      if (isConnected && !inDb && !isStopped) {
        console.log(`[OrphanDisconnect] Orphan bot found: ${cleanNum} — active but not in DB. Disconnecting...`);
        try {
          const pairMod = require('../../pair');
          if (typeof pairMod.stopBot === 'function') pairMod.stopBot(cleanNum + '@s.whatsapp.net');
        } catch (_) {}
        for (const candidate of flagCandidates) {
          try {
            if (fs.existsSync(candidate)) fs.unlinkSync(candidate);
          } catch (_) {}
        }
        try {
          const { deleteSessionCreds } = require('../../session-db');
          await deleteSessionCreds(cleanNum);
          await upsertBotSession(cleanNum, 'inactive');
        } catch (_) {}
        try {
          const stopped = getStoppedNumbers();
          const arr = [...stopped, cleanNum];
          fs.mkdirSync(path.dirname(STOPPED_FILE), { recursive: true });
          fs.writeFileSync(STOPPED_FILE, JSON.stringify([...new Set(arr)]));
        } catch (_) {}
        console.log(`[OrphanDisconnect] ${cleanNum} disconnected and marked stopped.`);
      }
    }
  } catch (err) {
    console.error('[OrphanDisconnect] Check failed:', err.message);
  } finally {
    _running = false;
  }
}

function startOrphanDisconnectJob(intervalMs = 30_000) {
  setTimeout(() => runOrphanDisconnectCheck().catch(() => {}), 60_000);
  const interval = setInterval(() => {
    runOrphanDisconnectCheck().catch(() => {});
  }, intervalMs);
  console.log(`[OrphanDisconnect] Auto-disconnect job started (${intervalMs / 1000}s interval)`);
  return interval;
}

module.exports = { startOrphanDisconnectJob, runOrphanDisconnectCheck };
