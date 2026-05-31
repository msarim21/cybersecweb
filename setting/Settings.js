const fs = require('fs');
const SETTINGS_PATH = './setting.json';

let settings = {};
try {
  if (fs.existsSync(SETTINGS_PATH)) {
    settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8') || '{}');
  } else {
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify({}, null, 2));
    settings = {};
  }
} catch (e) {
  console.error('Failed to load settings.json', e);
  settings = {};
}

// PERF FIX: Debounced async write — instead of blocking sync write on every
// setSetting() call, we batch all changes and write once after 500ms idle.
// Prevents event loop blocking when many settings change in quick succession.
let _saveTimer = null;
function saveSettings() {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    _saveTimer = null;
    fs.writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2), (err) => {
      if (err) console.error('[Settings] Failed to save:', err.message);
    });
  }, 500);
}

// Force immediate flush (e.g. on process exit so no settings are lost)
function flushSettings() {
  if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null; }
  try { fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2)); } catch (_) {}
}
process.once('exit',   flushSettings);
process.once('SIGINT', flushSettings);
process.once('SIGTERM', flushSettings);

/**
 * Get a setting for a user, group, or bot.
 * @param {string} jid - User JID, group JID, or 'bot' for global bot settings
 * @param {string} key - Setting key
 * @param {*} defaultValue - Default value if key doesn't exist
 */
function getSetting(jid, key, defaultValue = false) {
  if (!settings[jid]) return defaultValue;
  return settings[jid][key] !== undefined ? settings[jid][key] : defaultValue;
}

/**
 * Set a setting for a user, group, or bot.
 * @param {string} jid - User JID, group JID, or 'bot' for global bot settings
 * @param {string} key - Setting key
 * @param {*} value - Value to save
 */
function setSetting(jid, key, value) {
  if (!settings[jid]) settings[jid] = {};
  settings[jid][key] = value;
  saveSettings();
}

module.exports = { getSetting, setSetting, flushSettings };

