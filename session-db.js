// Thin database client used by pair.js (root level) to persist session state.
// Supports both MongoDB (via db-service) and PostgreSQL (via pg pool).
// All failures are non-fatal — the filesystem session is the source of truth.

let _ready = false;

async function _init() {
  if (_ready) return;
  try {
    require('./server/db');
    const { initDb } = require('./server/db');
    await initDb();
    _ready = true;
  } catch (err) {
    // Leave _ready false so the next call retries DB init.
    console.error('[session-db] _init failed, will retry on next call:', err.message);
  }
}

/**
 * Upsert a session row.
 */
async function updateSession(number, status, meta = {}) {
  try {
    await _init();
    const { upsertBotSession } = require('./server/db-service');
    await upsertBotSession(number, status, meta);
    const clean = String(number).replace(/[^0-9]/g, '');

    // ── AUTO-SAVE: When bot connects, save to linked_numbers immediately ──
    if (status === 'active' && clean) {
      try {
        const { getAndClearPairingOwner, addNumber } = require('./server/db-service');
        const pending = await getAndClearPairingOwner(clean);
        if (pending && pending.user_id) {
          const rawId = pending.user_id;
          const userId = /^\d+$/.test(rawId) ? parseInt(rawId, 10) : rawId;
          if (userId) {
            const { isNumberInLinkedNumbers } = require('./server/db-service');
            const alreadyExists = await isNumberInLinkedNumbers(clean);
            if (!alreadyExists) {
              await addNumber(clean, pending.bot_name || 'CYBER PRO', userId);
              console.log('[session-db] ✅ Auto-saved number to linked_numbers:', clean);
            } else {
              const { getPool, isMongoMode: _isMongo } = require('./server/db');
              const pool = getPool();
              if (pool) {
                await pool.query(
                  `UPDATE linked_numbers SET status='active', last_active=NOW()
                   WHERE REGEXP_REPLACE(number,'[^0-9]','','g') = $1`,
                  [clean]
                );
              } else if (_isMongo && _isMongo()) {
                const { LinkedNumber } = require('./server/models/LinkedNumber');
                await LinkedNumber.findOneAndUpdate(
                  { number: { $regex: clean, $options: 'i' } },
                  { $set: { status: 'active', lastActive: new Date() } }
                );
              }
              console.log('[session-db] ✅ Activated existing linked_number:', clean);
            }
          }
        }
      } catch (autoSaveErr) {
        console.error('[session-db] Auto-save to linked_numbers failed:', autoSaveErr.message);
      }
    }

    if (clean && status === 'active') {
      try {
        const mongoose = require('mongoose');
        if (mongoose.connection.readyState === 1) {
          const LinkedNumber = require('./server/models/LinkedNumber');
          await LinkedNumber.findOneAndUpdate(
            { number: { $in: [clean, number, clean + '@s.whatsapp.net'] } },
            { $set: { status: 'active', lastActive: new Date() } }
          );
        }
      } catch (_) {}
    }
  } catch (err) {
    console.error('[session-db] update failed:', err.message);
  }
}

/**
 * Return all numbers currently marked active.
 */
async function getActiveSessions() {
  try {
    await _init();
    const { getActiveBotSessions } = require('./server/db-service');
    return await getActiveBotSessions();
  } catch (err) {
    console.error('[session-db] getActiveSessions failed:', err.message);
    return [];
  }
}

/**
 * Save full session creds (all files in the auth folder) to DB.
 */
async function saveCredsToDb(number, sessionFiles) {
  try {
    await _init();
    const { saveSessionCreds } = require('./server/db-service');
    await saveSessionCreds(number, sessionFiles);
    return true; // ✅ FIX: explicitly return true on success
  } catch (err) {
    console.error('[session-db] saveCredsToDb failed:', err.message);
    return false; // ✅ FIX: return false so callers know it failed
  }
}

/**
 * Restore session creds from DB to filesystem.
 * @returns {boolean} true if creds were restored successfully
 */
async function restoreCredsFromDb(number, sessionPath) {
  try {
    await _init();
    const { getSessionCreds } = require('./server/db-service');
    const sessionFiles = await getSessionCreds(number);
    if (!sessionFiles || Object.keys(sessionFiles).length === 0) return false;

    const fs = require('fs');
    const path = require('path');
    if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath, { recursive: true });

    for (const [filename, content] of Object.entries(sessionFiles)) {
      fs.writeFileSync(
        path.join(sessionPath, filename),
        typeof content === 'string' ? content : JSON.stringify(content),
        'utf8'
      );
    }
    console.log(`[session-db] ✅ Restored session files for ${number}`);
    return true;
  } catch (err) {
    console.error('[session-db] restoreCredsFromDb failed:', err.message);
    return false;
  }
}

/**
 * Remove a linked number from the database when WhatsApp logout is detected.
 * Also clears local filesystem session files so re-pairing works cleanly.
 */
async function removeLinkedNumber(number) {
  const clean = number.replace(/@.*$/, '').replace(/[^0-9]/g, '');
  if (!clean) return;
  try {
    await _init();
    const { deleteNumberByPhone } = require('./server/db-service');
    await deleteNumberByPhone(clean);
    console.log(`[session-db] ✅ Auto-removed linked number on logout: ${clean}`);
  } catch (err) {
    console.error('[session-db] removeLinkedNumber DB failed:', err.message);
  }
  // Always clear local filesystem session files — even if DB call failed.
  // This prevents "already linked" error on re-pair after logout.
  for (const dir of _sessionDirs(clean)) {
    try {
      const fs = require('fs');
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          try { fs.unlinkSync(require('path').join(dir, file)); } catch (_) {}
        }
        try { fs.rmdirSync(dir); } catch (_) {}
        console.log(`[session-db] 🗑️  Cleared local session files for ${clean}: ${dir}`);
      }
    } catch (_) {}
  }
}

/**
 * Return all numbers that are actively linked in the web panel.
 */
async function getActiveLinkedNumbers() {
  try {
    await _init();
    const { getAllActiveLinkedNumbers } = require('./server/db-service');
    return await getAllActiveLinkedNumbers();
  } catch (err) {
    console.error('[session-db] getActiveLinkedNumbers failed:', err.message);
    return [];
  }
}

/**
 * Delete session creds from DB so fresh pairing always starts clean.
 */
async function deleteSessionCreds(number) {
  try {
    await _init();
    const { deleteSessionCreds: dbDelete } = require('./server/db-service');
    const clean = String(number).replace(/@.*$/, '').replace(/[^0-9]/g, '');
    await dbDelete(clean);
    console.log(`[session-db] ✅ Session creds deleted from DB: ${clean}`);
  } catch (err) {
    console.error('[session-db] deleteSessionCreds failed:', err.message);
  }
}

/**
 * Check if this number has ever been connected.
 */
async function hasFirstConnected(number) {
  try {
    await _init();
    const { hasFirstConnected: dbHas } = require('./server/db-service');
    return await dbHas(number);
  } catch (err) {
    console.error('[session-db] hasFirstConnected failed:', err.message);
    return false;
  }
}

/**
 * Mark number as first-connected.
 */
async function markFirstConnected(number) {
  try {
    await _init();
    const { markFirstConnected: dbMark } = require('./server/db-service');
    return await dbMark(number);
  } catch (err) {
    console.error('[session-db] markFirstConnected failed:', err.message);
  }
}

function _sessionDirs(clean) {
  const path = require('path');
  const base = path.join(__dirname, 'nexstore', 'pairing');
  return [
    path.join(base, `${clean}@s.whatsapp.net`),
    path.join(base, clean),
  ];
}

// ✅ FIX: Strict creds validation — creds.json ke andar content bhi check karo
// Sirf file exist karna kafi nahi — andar registered/me/noiseKey hona chahiye
function _hasValidLocalCreds(sessionPath) {
  const fs = require('fs');
  const path = require('path');
  const credsFile = path.join(sessionPath, 'creds.json');
  if (!fs.existsSync(credsFile)) return false;
  try {
    const creds = JSON.parse(fs.readFileSync(credsFile, 'utf8'));
    // ✅ Strict check: at least one of these must exist for valid session
    return Boolean(
      creds?.registered === true ||
      (creds?.me && creds?.me?.id) ||
      (creds?.noiseKey && creds?.noiseKey?.private)
    );
  } catch {
    return false;
  }
}

/**
 * True when DB has saved session files for this number.
 */
async function hasSessionInDb(number) {
  try {
    await _init();
    const { getSessionCreds } = require('./server/db-service');
    const clean = String(number).replace(/[^0-9]/g, '');
    const data = await getSessionCreds(clean);
    if (!data || Object.keys(data).length === 0) return false;
    // ✅ FIX: DB mein creds.json ho aur valid bhi ho
    const credsInDb = data['creds.json'];
    if (!credsInDb) return false;
    try {
      const creds = typeof credsInDb === 'string' ? JSON.parse(credsInDb) : credsInDb;
      return Boolean(
        creds?.registered === true ||
        (creds?.me && creds?.me?.id) ||
        (creds?.noiseKey && creds?.noiseKey?.private)
      );
    } catch {
      return false;
    }
  } catch {
    return false;
  }
}

/**
 * ✅ FIX: Restore session from DB when ephemeral disk was wiped.
 * Pehle local check — phir DB se restore karo.
 * @returns {boolean}
 */
async function ensureSessionRestored(number) {
  const clean = String(number).replace(/[^0-9]/g, '');
  if (!clean) return false;

  // 1. Local disk mein valid creds hain? Direct return true
  for (const dir of _sessionDirs(clean)) {
    if (_hasValidLocalCreds(dir)) {
      console.log(`[session-db] ✅ Valid local creds found for ${clean}: ${dir}`);
      return true;
    }
  }

  // 2. DB mein session hai?
  const inDb = await hasSessionInDb(clean);
  if (!inDb) {
    console.log(`[session-db] ⚠️  No valid session in DB for ${clean}`);
    return false;
  }

  // 3. DB se restore karo — DONO directories mein restore karo
  // Bug fix: index.js autoLoadPairs `cleanNum` dir dhundta hai, lekin ensureSessionRestored
  // pehle `cleanNum@s.whatsapp.net` mein restore karta tha aur wapas return ho jaata tha.
  // Ab DONO dirs mein restore hoga taake chahe koi bhi path check kare — creds milenge.
  console.log(`[session-db] 📥 Restoring session from DB for ${clean} (all dirs)...`);
  let anySuccess = false;
  for (const dir of _sessionDirs(clean)) {
    const ok = await restoreCredsFromDb(clean, dir);
    if (ok && _hasValidLocalCreds(dir)) {
      console.log(`[session-db] ✅ Session restored to ${dir}`);
      anySuccess = true;
      // Do NOT return here — continue to restore to remaining dirs too
    }
  }

  if (anySuccess) {
    console.log(`[session-db] ✅ Session restore complete for ${clean}`);
    return true;
  }

  console.log(`[session-db] ❌ Restore failed — creds invalid after DB restore for ${clean}`);
  return false;
}

/**
 * Backup all session files from filesystem to DB.
 */
async function backupSessionFolder(number, sessionPath) {
  try {
    await _init();
    const fs = require('fs');
    const path = require('path');
    const clean = String(number).replace(/[^0-9]/g, '');
    // ✅ FIX: default to the digits-only folder (the one pair.js actually uses);
    // fall back to the legacy JID folder only if it still exists.
    const digitsDir = path.join(__dirname, 'nexstore', 'pairing', clean);
    const legacyDir = path.join(__dirname, 'nexstore', 'pairing', `${clean}@s.whatsapp.net`);
    const dir = sessionPath || (fs.existsSync(digitsDir) ? digitsDir : legacyDir);
    if (!fs.existsSync(dir)) return false;

    // ✅ FIX: Sirf essential files backup karo — MongoDB 16MB limit se bachne ke liye
    // Full session (4000+ files) → 16MB+ → silent fail → restore fail → har baar re-pair!
    // Essential: creds.json (identity) + app-state-sync-key files (message sync state, max 100)
    // Sender-key-* files skip karo — WhatsApp automatically re-negotiate karta hai
    const ESSENTIAL_FILE = /^(creds\.json|app-state-sync-key-[\w-]+\.json|pre-key-\d+\.json|session-[\w-]+\.json)$/;
    const MAX_SYNC_KEYS = 100;
    const sessionFiles = {};
    let syncKeyCount = 0;

    // Sort reverse so newest keys are included first
    const allFiles = fs.readdirSync(dir).sort().reverse();
    for (const file of allFiles) {
      if (!ESSENTIAL_FILE.test(file)) continue; // skip sender-key-*, other large files
      if (file !== 'creds.json' && file.startsWith('app-state-sync-key')) {
        if (syncKeyCount >= MAX_SYNC_KEYS) continue;
        syncKeyCount++;
      }
      const filePath = path.join(dir, file);
      if (!fs.lstatSync(filePath).isFile()) continue;
      try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        try { sessionFiles[file] = JSON.parse(raw); } catch { sessionFiles[file] = raw; }
      } catch (_) {}
    }
    if (!Object.keys(sessionFiles).length) return false;
    console.log(`[session-db] 📦 Compacted backup: ${Object.keys(sessionFiles).length} essential files (was ${allFiles.length} total)`);

    // ✅ FIX: Backup se pehle validate karo — invalid creds DB mein mat save karo
    const creds = sessionFiles['creds.json'];
    if (creds) {
      const credsObj = typeof creds === 'string' ? JSON.parse(creds) : creds;
      const isValid = Boolean(
        credsObj?.registered === true ||
        (credsObj?.me && credsObj?.me?.id) ||
        (credsObj?.noiseKey && credsObj?.noiseKey?.private)
      );
      if (!isValid) {
        console.log(`[session-db] ⚠️  Skipping backup for ${clean} — creds.json invalid`);
        return false;
      }
    }

    const saved = await saveCredsToDb(clean, sessionFiles);
    if (!saved) {
      console.error(`[session-db] ❌ Backup FAILED for ${clean} — DB save error (check size/connection)`);
      return false;
    }
    console.log(`[session-db] ✅ Session backed up to DB: ${clean} (${Object.keys(sessionFiles).length} essential files)`);
    return true;
  } catch (err) {
    console.error('[session-db] backupSessionFolder failed:', err.message);
    return false;
  }
}

module.exports = {
  updateSession,
  getActiveSessions,
  getActiveLinkedNumbers,
  saveCredsToDb,
  restoreCredsFromDb,
  hasSessionInDb,
  ensureSessionRestored,
  backupSessionFolder,
  removeLinkedNumber,
  deleteSessionCreds,
  hasFirstConnected,
  markFirstConnected,
};
