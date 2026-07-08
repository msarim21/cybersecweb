'use strict';

// ════════════════════════════════════════════════════════════════════════════
// STORAGE GUARD JOB — keeps MongoDB usage bounded as the user base grows.
//
// Problem: ChatMessage and PairingRequest collections have no retention limit
// and grow forever; BotSession.sessionData stores large WhatsApp credential
// blobs for numbers that unlinked/expired long ago. On the free/shared Atlas
// tier this fills the storage quota (the "555MB used" warning) well before
// ~100 active users, because most of that space is old chat history and
// abandoned session blobs nobody reads again.
//
// Fix: run on a timer (default every 6h) and:
//   1. Archive ChatMessage docs older than CHAT_MESSAGE_RETENTION_DAYS to a
//      local JSON file under database/archives/, then delete them from Mongo.
//   2. Delete resolved PairingRequest docs (completed/failed/expired) older
//      than PAIRING_REQUEST_RETENTION_DAYS — these are transient by nature
//      and have no long-term value, so no archive is written.
//   3. Archive + delete BotSession docs for numbers that are no longer
//      linked to any user (orphaned) and have been inactive for
//      ORPHAN_SESSION_RETENTION_DAYS — the credential blob (sessionData) is
//      stripped from the archive since a dead session's creds are useless
//      and shouldn't be kept around even on disk.
//
// This also has a TTL-index counterpart (see models/ChatMessage.js and
// models/PairingRequest.js) so the collections self-trim going forward even
// if this job is ever disabled — the job exists mainly to clean up backlog
// that already accumulated before the TTL indexes were added, and to give
// us a JSON archive (which a plain Mongo TTL delete would not).
// ════════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const { isMongoMode } = require('../db');

const ARCHIVE_DIR = path.join(__dirname, '../../database/archives');

const CHAT_MESSAGE_RETENTION_DAYS   = parseInt(process.env.CHAT_MESSAGE_RETENTION_DAYS   || '30', 10);
const PAIRING_REQUEST_RETENTION_DAYS = parseInt(process.env.PAIRING_REQUEST_RETENTION_DAYS || '2', 10);
const ORPHAN_SESSION_RETENTION_DAYS  = parseInt(process.env.ORPHAN_SESSION_RETENTION_DAYS  || '14', 10);

function ensureDir(p) {
  try { fs.mkdirSync(p, { recursive: true }); } catch (_) {}
}

function writeArchive(subDir, filename, records) {
  if (!records || !records.length) return;
  const dir = path.join(ARCHIVE_DIR, subDir);
  ensureDir(dir);
  const filePath = path.join(dir, filename);
  // Append if a file for this run already exists (defensive — shouldn't happen
  // given timestamped filenames, but avoids clobbering on rare double-runs).
  let existing = [];
  try {
    if (fs.existsSync(filePath)) existing = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (_) {}
  fs.writeFileSync(filePath, JSON.stringify(existing.concat(records), null, 0));
}

let _running = false;

async function runStorageGuard() {
  if (!isMongoMode()) return; // storage quota pressure is a MongoDB-specific concern here
  if (_running) return;
  _running = true;
  const stamp = new Date().toISOString().slice(0, 10);
  const summary = { chatMessagesArchived: 0, pairingRequestsDeleted: 0, orphanSessionsArchived: 0 };

  try {
    const ChatMessage    = require('../models/ChatMessage');
    const PairingRequest = require('../models/PairingRequest');
    const BotSession     = require('../models/BotSession');
    const LinkedNumber   = require('../models/LinkedNumber');

    // ── 1. Archive + prune old chat messages ────────────────────────────────
    const chatCutoff = new Date(Date.now() - CHAT_MESSAGE_RETENTION_DAYS * 86400_000);
    const oldChats = await ChatMessage.find({ createdAt: { $lt: chatCutoff } }).lean();
    if (oldChats.length) {
      writeArchive('chat-messages', `chat-messages-${stamp}.json`, oldChats);
      const ids = oldChats.map(d => d._id);
      await ChatMessage.deleteMany({ _id: { $in: ids } });
      summary.chatMessagesArchived = oldChats.length;
    }

    // ── 2. Archive + prune resolved pairing requests ────────────────────────
    const pairingCutoff = new Date(Date.now() - PAIRING_REQUEST_RETENTION_DAYS * 86400_000);
    const oldPairing = await PairingRequest.find({
      status: { $in: ['code_ready', 'failed', 'expired'] },
      updatedAt: { $lt: pairingCutoff },
    }).lean();
    if (oldPairing.length) {
      writeArchive('pairing-requests', `pairing-requests-${stamp}.json`, oldPairing);
      await PairingRequest.deleteMany({ _id: { $in: oldPairing.map(d => d._id) } });
      summary.pairingRequestsDeleted = oldPairing.length;
    }

    // ── 3. Archive + delete orphaned bot sessions (unlinked, long inactive) ─
    const sessionCutoff = new Date(Date.now() - ORPHAN_SESSION_RETENTION_DAYS * 86400_000);
    const staleSessions = await BotSession.find({
      status: 'inactive',
      lastActive: { $lt: sessionCutoff },
    }).lean();
    if (staleSessions.length) {
      const activeNumbers = new Set(
        (await LinkedNumber.find({}).select('number').lean()).map(l => String(l.number).replace(/[^0-9]/g, ''))
      );
      const orphaned = staleSessions.filter(s => !activeNumbers.has(String(s.number).replace(/[^0-9]/g, '')));
      if (orphaned.length) {
        // Strip sessionData (raw WhatsApp creds) before archiving — a dead,
        // unlinked session's credentials have no legitimate future use and
        // must not be kept around even in a local file.
        const stripped = orphaned.map(({ sessionData, ...rest }) => rest);
        writeArchive('bot-sessions', `bot-sessions-${stamp}.json`, stripped);
        await BotSession.deleteMany({ _id: { $in: orphaned.map(d => d._id) } });
        summary.orphanSessionsArchived = orphaned.length;
      }
    }

    if (summary.chatMessagesArchived || summary.pairingRequestsDeleted || summary.orphanSessionsArchived) {
      console.log(`[StorageGuard] Archived ${summary.chatMessagesArchived} chat message(s), ` +
        `deleted ${summary.pairingRequestsDeleted} pairing request(s), ` +
        `archived ${summary.orphanSessionsArchived} orphan session(s).`);
    }

    // Log current storage usage so admins can see the effect over time.
    try {
      const stats = await require('mongoose').connection.db.stats();
      const usedMB = (stats.storageSize / (1024 * 1024)).toFixed(1);
      const dataMB = (stats.dataSize / (1024 * 1024)).toFixed(1);
      console.log(`[StorageGuard] Mongo storage: ${usedMB}MB storage / ${dataMB}MB data`);
    } catch (_) {}
  } catch (err) {
    console.error('[StorageGuard] Cleanup failed:', err.message);
  } finally {
    _running = false;
  }
  return summary;
}

function startStorageGuardJob(intervalMs = 6 * 60 * 60 * 1000) {
  ensureDir(ARCHIVE_DIR);
  // Run once shortly after boot (delayed so it doesn't compete with startup),
  // then on the regular interval.
  setTimeout(() => runStorageGuard().catch(() => {}), 60_000);
  const interval = setInterval(() => runStorageGuard().catch(() => {}), intervalMs);
  console.log(`[StorageGuard] Storage cleanup job started (checks every ${intervalMs / 3600000}h)`);
  return interval;
}

module.exports = { startStorageGuardJob, runStorageGuard };
