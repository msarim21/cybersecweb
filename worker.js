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

async function ensureDbReady(maxWaitMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const { initDb, isDbReady } = require('./server/db');
      await initDb();
      if (isDbReady()) {
        console.log(chalk.green('✅ [Worker] Database ready'));
        return true;
      }
    } catch (e) {
      console.log(chalk.yellow(`[Worker] Waiting for DB: ${e.message}`));
    }
    await delay(3000);
  }
  console.log(chalk.red('[Worker] ⚠️  Database not ready after timeout — autoload may fail'));
  return false;
}

async function runAutoLoadWithRetries(maxAttempts = 5) {
  const { syncStoppedWithLinkedNumbers } = require('./allfunc/stopped-bots');
  const { getActiveLinkedNumbers } = require('./session-db');
  let lastResult = { successful: 0, total: 0 };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await syncStoppedWithLinkedNumbers();
    } catch (_) {}

    const linked = await getActiveLinkedNumbers().catch(() => []);
    lastResult = await autoLoadPairs({ batchSize: 3 });

    console.log(chalk.green(
      `[Worker] Auto-load attempt ${attempt}/${maxAttempts}: ${lastResult.successful || 0}/${lastResult.total || 0} connected (DB linked: ${linked.length})`
    ));

    if (!linked.length && !lastResult.total) return lastResult;
    if (linked.length > 0 && (lastResult.successful || 0) >= linked.length) return lastResult;
    if (lastResult.total > 0 && (lastResult.successful || 0) >= lastResult.total) return lastResult;

    if (attempt < maxAttempts) {
      console.log(chalk.yellow('[Worker] Retrying auto-load in 12s...'));
      await delay(12000);
    }
  }
  return lastResult;
}

async function startWorker() {
  console.log(chalk.cyan('\n╔══════════════════════════════════╗'));
  console.log(chalk.cyan('║   CYBER PRO — BOT WORKER DYNO   ║'));
  console.log(chalk.cyan('╚══════════════════════════════════╝\n'));
  console.log(chalk.green('✅ Worker dyno started — WhatsApp bot keep-alive mode'));
  console.log(chalk.yellow('⚠️  Telegram commands are DISABLED in this dyno (silent mode)\n'));

  await ensureDbReady();

  try {
    const { clearStalePairingRequests } = require('./server/db-service');
    await clearStalePairingRequests();
  } catch (e) {
    console.log(chalk.yellow('[Worker] clearStalePairingRequests:', e.message));
  }

  const { shouldRunWhatsAppSupervisor, getWhatsAppHostDyno } = require('./allfunc/whatsapp-host');
  const { startWhatsAppStack } = require('./worker/start-whatsapp');

  if (startWhatsAppStack()) {
    console.log(chalk.green(`\n🟢 Supervisor running on worker (WHATSAPP_HOST_DYNO=${getWhatsAppHostDyno()})`));
    return;
  }

  if (getWhatsAppHostDyno() === 'web') {
    console.log(chalk.cyan('ℹ️  WhatsApp bots hosted on web dyno (Eco keepalive) — worker standby'));
    startKeepAlive();
    return;
  }

  // ── Per-bot isolation: one Node process per linked number ─────────────────
  const useIsolation = process.env.BOT_ISOLATION !== '0';

  if (useIsolation) {
    console.log(chalk.magenta('🔒 Isolated mode: har number ka alag process + alag config folder'));
    const { startSupervisor } = require('./worker/supervisor');
    startSupervisor();

    startKeepAlive();
    console.log(chalk.green('\n🟢 Supervisor running — har bot apne process mein chalega'));

    const { startPairingProcessor } = require('./worker/pairing-processor');
    startPairingProcessor(150);

    const { startOrphanDisconnectJob } = require('./server/jobs/orphanDisconnectJob');
    startOrphanDisconnectJob(30_000);

    let sweepCount = 0;
    const startupSweep = setInterval(async () => {
      sweepCount += 1;
      if (sweepCount > 8) { clearInterval(startupSweep); return; }
      try {
        const { syncBots } = require('./worker/supervisor');
        await syncBots();
      } catch (_) {}
    }, 2 * 60 * 1000);

    return;
  }

  // ── Legacy: all bots in one process ───────────────────────────────────────
  try {
    require('./case');
    console.log(chalk.green('✅ WhatsApp command handler loaded'));
  } catch (e) {
    console.log(chalk.yellow('[Worker] case.js load warning:', e.message));
  }

  console.log(chalk.blue('\n🔄 Loading all paired WhatsApp sessions...'));
  try {
    await runAutoLoadWithRetries(5);
  } catch (e) {
    console.log(chalk.red('[Worker] Auto-load error:', e.message));
  }

  startKeepAlive();
  console.log(chalk.green('\n🟢 Worker is running — bot will stay alive 24/7'));

  const { startPairingProcessor } = require('./worker/pairing-processor');
  startPairingProcessor(150);

  const { startOrphanDisconnectJob } = require('./server/jobs/orphanDisconnectJob');
  startOrphanDisconnectJob(30_000);

  // Aggressive reconnect sweep first 15 min after restart (every 2 min)
  let sweepCount = 0;
  const startupSweep = setInterval(async () => {
    sweepCount += 1;
    if (sweepCount > 8) {
      clearInterval(startupSweep);
      return;
    }
    try {
      const { syncStoppedWithLinkedNumbers } = require('./allfunc/stopped-bots');
      await syncStoppedWithLinkedNumbers();
      const { isRunning } = require('./autoload');
      if (!isRunning()) {
        await autoLoadPairs({ batchSize: 3 });
      }
    } catch (_) {}
  }, 2 * 60 * 1000);

  await delay(60000);

  const { stopBot } = require('./pair');

  setInterval(async () => {
    try {
      const svc = require('./server/db-service');
      const [activeSessions, linkedNumbers] = await Promise.all([
        svc.getActiveBotSessions().catch(() => []),
        svc.getAllActiveLinkedNumbers().catch(() => [])
      ]);
      if (!linkedNumbers || linkedNumbers.length === 0) {
        console.log(chalk.yellow('[Worker] Auto-disconnect skipped — DB returned 0 linked numbers (likely DB issue)'));
        return;
      }
      if (!activeSessions || activeSessions.length === 0) return;

      const linkedSet = new Set(linkedNumbers.map(n => String(n).replace(/[^0-9]/g, '')));
      const { readConnectedFlag } = require('./allfunc/connected-flag');
      const PAIRING_GRACE_MS = 3 * 60 * 1000;
      for (const num of activeSessions) {
        const clean = String(num).replace(/[^0-9]/g, '');
        if (!clean || linkedSet.has(clean)) continue;
        try {
          const flag = readConnectedFlag(clean);
          if (flag?.ts && (Date.now() - flag.ts) < PAIRING_GRACE_MS) continue;
        } catch (_) {}
        console.log(chalk.yellow('[Worker] Auto-disconnect unsaved bot: ' + clean));
        try { stopBot(clean); } catch (_) {}
        svc.upsertBotSession(clean, 'inactive').catch(() => {});
      }
    } catch (_) {}
  }, 30 * 1000);
}

startWorker().catch(err => {
  console.error(chalk.red('[Worker] Fatal startup error:'), err.message);
  setTimeout(() => startWorker(), 10000);
});
