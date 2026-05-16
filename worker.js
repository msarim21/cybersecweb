'use strict';

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

  // Keep Node.js event loop alive forever
  // pair.js already has its own 30-second health-check watchdog per session.
  // This just prevents the worker process from exiting.
  console.log(chalk.green('\n🟢 Worker is running — bot will stay alive 24/7'));
  setInterval(() => {
    // Silent heartbeat — keeps process alive, no output
  }, 30 * 1000);
}

startWorker().catch(err => {
  console.error(chalk.red('[Worker] Fatal startup error:'), err.message);
  // Restart after 10 seconds instead of dying
  setTimeout(() => startWorker(), 10000);
});
