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

module.exports = { updateSession, getActiveSessions, saveCredsToDb, restoreCredsFromDb, removeLinkedNumber };
