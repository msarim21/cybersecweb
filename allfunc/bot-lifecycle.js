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
  getHostDyno,
  logBotEvent,
  setBotConnectionStatus,
};
