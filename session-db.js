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
  } catch (_) {}
  _ready = true;
}

/**
 * Upsert a session row.
 */
async function updateSession(number, status) {
  try {
    await _init();
    const { upsertBotSession } = require('./server/db-service');
    await upsertBotSession(number, status);
    const clean = String(number).replace(/[^0-9]/g, '');

    // ── AUTO-SAVE: When bot connects, save to linked_numbers immediately ────
    // pair.js stores owner info in bot_sessions.pairing_owner_id/pairing_bot_name
    // via savePairingOwner() called in POST /api/pairing/request.
    // We read + clear it here so the number appears in the dashboard on refresh
    // without needing the frontend to poll and call POST /api/numbers.
    if (status === 'active' && clean) {
      try {
        const { getAndClearPairingOwner, addNumber } = require('./server/db-service');
        const pending = await getAndClearPairingOwner(clean);
        if (pending && pending.user_id) {
          const userId = parseInt(pending.user_id, 10);
          if (!isNaN(userId)) {
            // Check if already in linked_numbers to avoid duplicates
            const { getPool } = require('./server/db');
            const pool = getPool();
            let alreadyExists = false;
            if (pool) {
              const { rows } = await pool.query(
                `SELECT id FROM linked_numbers WHERE REGEXP_REPLACE(number,'[^0-9]','','g') = $1 LIMIT 1`,
                [clean]
              );
              alreadyExists = rows.length > 0;
            }
            if (!alreadyExists) {
              await addNumber(clean, pending.bot_name || 'CYBER PRO', userId);
              console.log('[session-db] ✅ Auto-saved number to linked_numbers:', clean);
            } else {
              // Already exists — just activate it
              if (pool) {
                await pool.query(
                  `UPDATE linked_numbers SET status='active', last_active=NOW()
                   WHERE REGEXP_REPLACE(number,'[^0-9]','','g') = $1`,
                  [clean]
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

    // Sync MongoDB LinkedNumber if available
    if (clean) {
      try {
        const mongoose = require('mongoose');
        if (mongoose.connection.readyState === 1) {
          const LinkedNumber = require('./server/models/LinkedNumber');
          await LinkedNumber.findOneAndUpdate(
            { number: { $in: [clean, number, clean + '@s.whatsapp.net'] } },
            { $set: { status: (status === 'active' ? 'active' : 'inactive'), lastActive: new Date() } }
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
 * Save full session creds (all files in the auth folder) to MongoDB.
 * @param {string} number - phone number digits
 * @param {object} sessionFiles - key=filename, value=file content (parsed JSON)
 */
async function saveCredsToDb(number, sessionFiles) {
  try {
    await _init();
    const { saveSessionCreds } = require('./server/db-service');
    await saveSessionCreds(number, sessionFiles);
  } catch (err) {
    console.error('[session-db] saveCredsToDb failed:', err.message);
  }
}

/**
 * Restore session creds from MongoDB to filesystem.
 * @param {string} number - phone number digits
 * @param {string} sessionPath - directory to write files into
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
 */
async function removeLinkedNumber(number) {
  try {
    await _init();
    const { deleteNumberByPhone } = require('./server/db-service');
    const clean = number.replace(/@.*$/, '').replace(/[^0-9]/g, '');
    await deleteNumberByPhone(clean);
    console.log(`[session-db] ✅ Auto-removed linked number on logout: ${clean}`);
  } catch (err) {
    console.error('[session-db] removeLinkedNumber failed:', err.message);
  }
}

/**
 * Return all numbers that are actively linked in the web panel (LinkedNumber collection).
 * This is the source of truth — if a number is linked on the web, the bot should connect.
 * @returns {Promise<string[]>} array of clean phone number strings (digits only)
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
 * Check if this number has ever been connected (for first-connect message suppression).
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
 * Mark number as first-connected (so next restart skips welcome message).
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

function _hasValidLocalCreds(sessionPath) {
  const fs = require('fs');
  const path = require('path');
  const credsFile = path.join(sessionPath, 'creds.json');
  if (!fs.existsSync(credsFile)) return false;
  try {
    const creds = JSON.parse(fs.readFileSync(credsFile, 'utf8'));
    return Boolean(creds?.registered || creds?.me?.id);
  } catch {
    return false;
  }
}

/**
 * True when MongoDB/PostgreSQL has saved session files for this number.
 */
async function hasSessionInDb(number) {
  try {
    await _init();
    const { getSessionCreds } = require('./server/db-service');
    const clean = String(number).replace(/[^0-9]/g, '');
    const data = await getSessionCreds(clean);
    return Boolean(data && Object.keys(data).length > 0);
  } catch {
    return false;
  }
}

/**
 * Restore session from DB when Heroku/ephemeral disk was wiped (worker/web restart).
 * @returns {boolean}
 */
async function ensureSessionRestored(number) {
  const clean = String(number).replace(/[^0-9]/g, '');
  if (!clean) return false;

  for (const dir of _sessionDirs(clean)) {
    if (_hasValidLocalCreds(dir)) return true;
  }

  const inDb = await hasSessionInDb(clean);
  if (!inDb) return false;

  for (const dir of _sessionDirs(clean)) {
    const ok = await restoreCredsFromDb(clean, dir);
    if (ok && _hasValidLocalCreds(dir)) return true;
  }
  return false;
}

/**
 * Backup all session files from filesystem to DB (for Heroku/ephemeral disk restarts).
 */
async function backupSessionFolder(number, sessionPath) {
  try {
    await _init();
    const fs = require('fs');
    const path = require('path');
    const clean = String(number).replace(/[^0-9]/g, '');
    const dir = sessionPath || path.join(__dirname, 'nexstore', 'pairing', `${clean}@s.whatsapp.net`);
    if (!fs.existsSync(dir)) return false;

    const sessionFiles = {};
    for (const file of fs.readdirSync(dir)) {
      const filePath = path.join(dir, file);
      if (!fs.lstatSync(filePath).isFile()) continue;
      try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        try { sessionFiles[file] = JSON.parse(raw); } catch { sessionFiles[file] = raw; }
      } catch (_) {}
    }
    if (!Object.keys(sessionFiles).length) return false;
    await saveCredsToDb(clean, sessionFiles);
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
