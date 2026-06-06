'use strict';

// Mark this process as the sole WhatsApp worker — keepalive uses this to avoid
// web dyno reconnecting the same numbers (causes 440 / random disconnects).
process.env.WHATSAPP_WORKER = '1';

// ============================================================
// WORKER DYNO — WhatsApp Bot Keep-Alive
// Sirf WhatsApp connections zinda rakhta hai.
// Telegram ka koi jawab NAHI deta.
// Web dyno ke sone ke baad bhi bot active rahta hai.
// ============================================================

require('dotenv').config();
require('./setting/config');

const chalk = require('chalk');
const { autoLoadPairs } = require('./autoload');
const { startKeepAlive } = require('./keepalive');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

const ignoredErrors = [
  'Socket connection timeout', 'EKEYTYPE', 'item-not-found',
  'rate-overlimit', 'Connection Closed', 'Timed Out',
  'Value not found', 'Connection Failure', 'ENOTFOUND',
  'ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'socket hang up',
  'stream ended unexpectedly', 'Closing stale open session',
  'Request timeout', 'Bad MAC', 'Lost connection',
  'connect ETIMEDOUT', 'read ECONNRESET', 'write ECONNRESET',
  'Connection reset', 'WebSocket closed', 'Tag not found', 'Connection lost'
];

process.on('unhandledRejection', (reason) => {
  if (ignoredErrors.some(e => String(reason).includes(e))) return;
  console.log(chalk.yellow('[Worker] Unhandled rejection (staying alive):', String(reason).substring(0, 150)));
});

process.on('uncaughtException', (error) => {
  if (ignoredErrors.some(e => String(error).includes(e))) return;
  console.log(chalk.yellow('[Worker] Uncaught exception (staying alive):', error.message));
});

process.on('SIGTERM', () => {
  console.log(chalk.yellow('[Worker] SIGTERM received — shutting down gracefully.'));
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log(chalk.yellow('[Worker] SIGINT received — shutting down.'));
  process.exit(0);
});

async function startWorker() {
  console.log(chalk.cyan('\n╔══════════════════════════════════╗'));
  console.log(chalk.cyan('║   CYBER PRO — BOT WORKER DYNO   ║'));
  console.log(chalk.cyan('╚══════════════════════════════════╝\n'));
  console.log(chalk.green('✅ Worker dyno started — WhatsApp bot keep-alive mode'));
  console.log(chalk.yellow('⚠️  Telegram commands are DISABLED in this dyno (silent mode)\n'));

  // Load WhatsApp commands module (needed by pair.js internally)
  try {
    require('./case');
    console.log(chalk.green('✅ WhatsApp command handler loaded'));
  } catch (e) {
    console.log(chalk.yellow('[Worker] case.js load warning:', e.message));
  }

  // Auto-load all paired WhatsApp sessions
  console.log(chalk.blue('\n🔄 Loading all paired WhatsApp sessions...'));
  try {
    const result = await autoLoadPairs({ batchSize: 5 });
    console.log(chalk.green(`✅ Auto-load done — ${result.successful || 0}/${result.total || 0} sessions connected`));
  } catch (e) {
    console.log(chalk.red('[Worker] Auto-load error:', e.message));
  }

  // Keep Node.js event loop alive + self-ping web dyno every 14 min
  // (prevents web dyno sleep, reconnects dead sessions, warms up AI APIs)
  startKeepAlive();
  console.log(chalk.green('\n🟢 Worker is running — bot will stay alive 24/7'));

  const { startPairingProcessor } = require('./worker/pairing-processor');
  startPairingProcessor(3000);

  const { startOrphanDisconnectJob } = require('./server/jobs/orphanDisconnectJob');
  startOrphanDisconnectJob(30_000);

  // ──────────────────────────────────────────────────────────────────────────
  // AUTO-DISCONNECT: Every 30s — koi bhi bot jo web pe save nahi, disconnect
  // ──────────────────────────────────────────────────────────────────────────
  // Wait 60s on startup before first check (let sessions load first)
  await delay(60000);

  const { stopBot } = require('./pair');

  setInterval(async () => {
    try {
      const svc = require('./server/db-service');
      const [activeSessions, linkedNumbers] = await Promise.all([
        svc.getActiveBotSessions().catch(() => []),
        svc.getAllActiveLinkedNumbers().catch(() => [])
      ]);
      // 🛡️ SAFETY GUARD: if DB returned 0 linked numbers, it's a DB blip —
      // killing every active bot would be catastrophic, so skip this cycle.
      if (!linkedNumbers || linkedNumbers.length === 0) {
        console.log(chalk.yellow('[Worker] Auto-disconnect skipped — DB returned 0 linked numbers (likely DB issue)'));
        return;
      }
      // 🛡️ SAFETY GUARD: if activeSessions is empty, nothing to check
      if (!activeSessions || activeSessions.length === 0) return;

      const linkedSet = new Set(linkedNumbers.map(n => String(n).replace(/[^0-9]/g, '')));
      const { readConnectedFlag } = require('./allfunc/connected-flag');
      const PAIRING_GRACE_MS = 3 * 60 * 1000; // allow website auto-save after fresh pair
      for (const num of activeSessions) {
        const clean = String(num).replace(/[^0-9]/g, '');
        if (!clean || linkedSet.has(clean)) continue;
        // Skip if user just paired — dashboard saves number within ~10s but allow 3 min buffer
        try {
          const flag = readConnectedFlag(clean);
          if (flag?.ts && (Date.now() - flag.ts) < PAIRING_GRACE_MS) continue;
        } catch (_) {}
        console.log(chalk.yellow('[Worker] Auto-disconnect unsaved bot: ' + clean));
        try { stopBot(clean); } catch (_) {}
        svc.upsertBotSession(clean, 'inactive').catch(() => {});
      }
    } catch (_) {
      // Silent — DB may not be ready on worker startup
    }
  }, 30 * 1000);
}

startWorker().catch(err => {
  console.error(chalk.red('[Worker] Fatal startup error:'), err.message);
  // Restart after 10 seconds instead of dying
  setTimeout(() => startWorker(), 10000);
});
