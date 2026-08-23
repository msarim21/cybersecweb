'use strict';

/** WhatsApp connection states persisted in bot_sessions.connection_status */
const CONNECTION_STATUS = Object.freeze({
  CONNECTED: 'CONNECTED',
  DISCONNECTED: 'DISCONNECTED',
  LOGGED_OUT: 'LOGGED_OUT',
  ERROR: 'ERROR',
  CONNECTING: 'CONNECTING',
});

const MAX_RECONNECT_ATTEMPTS = 25;

// ── Configurable bot restart guard ────────────────────────────────────────────
// Tracks when each bot was last FULLY restarted (not just reconnected).
// Auto-reconnect for dropped connections is separate and not affected by this.
const configuredRestartHours = Number(process.env.BOT_RESTART_HOURS);
const configuredRestartMs = Number(process.env.BOT_RESTART_INTERVAL_MS);
const BOT_RESTART_INTERVAL_MS = Number.isFinite(configuredRestartMs) && configuredRestartMs > 0
  ? configuredRestartMs
  : (Number.isFinite(configuredRestartHours) && configuredRestartHours > 0
    ? configuredRestartHours * 60 * 60 * 1000
    : 4 * 60 * 60 * 1000);
const _lastFullRestart = new Map(); // cleanNum -> timestamp

/**
 * Returns true if enough time has passed since the last full restart.
 * Use this before triggering a complete bot restart (not auto-reconnect).
 * @param {string} number - the bot phone number
 */
function canFullyRestartBot(number) {
  const clean = String(number || '').replace(/[^0-9]/g, '');
  if (!clean) return true;
  const last = _lastFullRestart.get(clean) || 0;
  return (Date.now() - last) >= BOT_RESTART_INTERVAL_MS;
}

/**
 * Call this whenever a full bot restart happens (not auto-reconnect).
 * Records the restart timestamp so canFullyRestartBot() works correctly.
 * @param {string} number - the bot phone number
 */
function recordBotRestart(number) {
  const clean = String(number || '').replace(/[^0-9]/g, '');
  if (!clean) return;
  _lastFullRestart.set(clean, Date.now());
}

/**
 * Get the time in ms until the next restart is allowed for this bot.
 * Returns 0 if restart is allowed now.
 */
function msUntilNextRestart(number) {
  const clean = String(number || '').replace(/[^0-9]/g, '');
  if (!clean) return 0;
  const last = _lastFullRestart.get(clean) || 0;
  const elapsed = Date.now() - last;
  return Math.max(0, BOT_RESTART_INTERVAL_MS - elapsed);
}

function getHostDyno() {
  return process.env.DYNO || 'local';
}

function logBotEvent(number, event, detail = {}) {
  const clean = String(number || '').replace(/[^0-9]/g, '');
  const msg = typeof detail === 'string'
    ? detail
    : (detail.message || detail.reason || (Object.keys(detail).length ? JSON.stringify(detail) : ''));
  console.log(`[BotLifecycle] ${event} | ${clean || '?'}${msg ? ` | ${msg}` : ''}`);
}

async function setBotConnectionStatus(number, connectionStatus, meta = {}) {
  const clean = String(number || '').replace(/[^0-9]/g, '');
  if (!clean || !connectionStatus) return;
  try {
    const { setBotConnectionStatus: dbSet } = require('../server/db-service');
    await dbSet(clean, connectionStatus, meta);
  } catch (err) {
    console.error('[bot-lifecycle] setBotConnectionStatus failed:', err.message);
  }
}

module.exports = {
  CONNECTION_STATUS,
  MAX_RECONNECT_ATTEMPTS,
  BOT_RESTART_INTERVAL_MS,
  canFullyRestartBot,
  recordBotRestart,
  msUntilNextRestart,
  getHostDyno,
  logBotEvent,
  setBotConnectionStatus,
};
