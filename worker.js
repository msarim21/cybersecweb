'use strict';

// ── Suppress libsignal / Baileys session-dump spam ───────────────────────────
// MUST be the very first code — before any require() — so process.stdout.write
// is patched before libsignal loads. Without this, flat mode (BOT_ISOLATION=0)
// floods logs with "Closing session: SessionEntry { _chains: … privKey: … }"
// which exposes private keys and can trigger R14→R15→SIGKILL on Heroku Eco.
;(function _suppressLibsignalSpam() {
    const NOISY = [
        'Bad MAC', 'Session error:', 'Failed to decrypt',
        'Closing session:', 'Closing open session', 'Removing old closed session',
        'SessionEntry {', '_chains:', 'registrationId:', 'currentRatchet:',
        'indexInfo:', 'ephemeralKeyPair:', 'lastRemoteEphemeralKey:',
        'baseKey:', 'baseKeyType:', 'remoteIdentityKey:', 'previousCounter:',
        'pendingPreKey:', 'signedKeyId:', 'preKeyId:',
    ];
    const _origOut = process.stdout.write.bind(process.stdout);
    const _origErr = process.stderr.write.bind(process.stderr);
    const _makeFilter = (orig) => function(chunk, enc, cb) {
        const s = typeof chunk === 'string' ? chunk : (chunk ? chunk.toString() : '');
        if (NOISY.some(n => s.includes(n))) {
            if (typeof enc === 'function') enc();
            else if (typeof cb === 'function') cb();
            return true;
        }
        return orig(chunk, enc, cb);
    };
    process.stdout.write = _makeFilter(_origOut);
    process.stderr.write = _makeFilter(_origErr);
})();

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

function getUniqueTrackerCount() {
  try {
    const tracker = global._rentbotTracker;
    if (!tracker?.entries) return 0;
    const seen = new Set();
    for (const [, entry] of tracker.entries()) {
      if (!entry || seen.has(entry)) continue;
      seen.add(entry);
    }
    return seen.size;
  } catch (_) {
    return 0;
  }
}

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

process.on('SIGTERM', async () => {
  console.log(chalk.yellow('[Worker] SIGTERM received — flushing session keys before shutdown...'));
  try {
    // ── Supervisor (isolated) mode: ask each worker_thread to SIGTERM its
    //    bot-runner child gracefully so each child can flush its own session
    //    folder to DB. Parent's _sessionFlushFns is empty in this mode because
    //    each bot lives in its own child process.
    try {
      const { isSupervisorActive, stopSupervisorGraceful } = require('./worker/supervisor');
      if (isSupervisorActive()) {
        await stopSupervisorGraceful(15000).catch(() => {});
      }
    } catch (_) {}

    // ── Flat mode (BOT_ISOLATION=0): all bots run in this process.
    //    Flush registered session-flush fns (registered by pair.js on connect).
    //    Signal keys (pre-keys, sessions, sender-keys) change during msg
    //    processing WITHOUT triggering creds.update so they must be
    //    force-flushed on shutdown — otherwise Bad MAC errors on restart.
    if (global._sessionFlushFns && global._sessionFlushFns.size > 0) {
      console.log(chalk.yellow('[Worker] Flushing ' + global._sessionFlushFns.size + ' in-process bot session(s) to DB...'));
      const _flushJobs = [...global._sessionFlushFns.values()].map(fn => fn().catch(() => {}));
      await Promise.race([Promise.allSettled(_flushJobs), new Promise(r => setTimeout(r, 8000))]);
      console.log(chalk.green('[Worker] ✅ Sessions flushed — shutting down.'));
    }
  } catch (_) {}
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
  // Flat mode: all bots are different numbers — safe to connect concurrently.
  // Isolated mode uses serial batches to avoid error 440 from child-process race.
  const useConcurrent = process.env.BOT_ISOLATION !== '1';
  let lastResult = { successful: 0, total: 0 };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await syncStoppedWithLinkedNumbers();
    } catch (_) {}

    const linked = await getActiveLinkedNumbers().catch(() => []);
    lastResult = useConcurrent
      ? await autoLoadPairs({ concurrent: true })
      : await autoLoadPairs({ batchSize: 3 });

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

/**
 * FLAT-mode boot reconnect diagnostic. For each linked+active number, prints
 * whether the bot is ONLINE / CONNECTING / STOPPED / PENDING / NEED RE-PAIR,
 * with the source of its session creds (disk / DB / NONE). Mirrors the
 * supervisor's bootReconnectReport so operators get the same clarity
 * regardless of BOT_ISOLATION mode.
 */
async function flatBootReconnectReport() {
  try {
    const path = require('path');
    const { getActiveLinkedNumbers, hasSessionInDb } = require('./session-db');
    const { readStopped } = require('./allfunc/stopped-bots');

    const linked = (await getActiveLinkedNumbers().catch(() => []))
      .map(n => String(n).replace(/[^0-9]/g, '')).filter(Boolean);
    const stopped = new Set(readStopped());

    if (!linked.length) {
      console.log(chalk.gray('[Worker] 📋 Boot report: no linked numbers in DB'));
      return;
    }

    const tracker = global._rentbotTracker;
    const hasValidLocalCreds = (clean) => {
      for (const dir of [
        path.join(__dirname, 'nexstore', 'pairing', clean),
        path.join(__dirname, 'nexstore', 'pairing', `${clean}@s.whatsapp.net`),
      ]) {
        try {
          const credsFile = path.join(dir, 'creds.json');
          if (!require('fs').existsSync(credsFile)) continue;
          const creds = JSON.parse(require('fs').readFileSync(credsFile, 'utf8'));
          if (creds?.registered || creds?.me?.id) return true;
        } catch (_) {}
      }
      return false;
    };

    console.log(chalk.cyan(`\n[Worker] 📋 Boot reconnect report (${linked.length} linked number${linked.length === 1 ? '' : 's'}):`));

    let onlineCount = 0;
    let needPairCount = 0;
    for (const clean of linked) {
      const isStopped = stopped.has(clean);
      const credsLocal = hasValidLocalCreds(clean);
      const credsDb = await hasSessionInDb(clean).catch(() => false);
      const t = tracker?.get?.(`${clean}@s.whatsapp.net`) || tracker?.get?.(clean);
      const ws = t?.connection?.ws;
      const wsOpen = ws?.readyState === 1;
      const ready = Boolean(t?.commandReady);
      const live = wsOpen && Boolean(t?.connection?.user);

      const tag = (live && ready) ? chalk.green('✅ ONLINE & READY')
        : live                    ? chalk.yellow('⏳ ONLINE (syncing/not ready)')
        : t?.connection           ? chalk.yellow('🔄 CONNECTING')
        : isStopped               ? chalk.gray('⏸ STOPPED (manual)')
        : (credsLocal || credsDb) ? chalk.yellow('🔄 PENDING (creds present)')
        : chalk.red('❌ NEED RE-PAIR');

      const credsStr = credsLocal ? 'disk' : credsDb ? 'DB' : 'NONE';
      console.log(chalk.gray(`   +${clean}  ${tag}  creds=${credsStr}  ws=${ws ? ws.readyState : 'none'}  ready=${ready}`));

      if (live) onlineCount++;
      if (!credsLocal && !credsDb && !isStopped) needPairCount++;
    }

    if (needPairCount > 0) {
      console.log(chalk.red(`[Worker] ⚠️  ${needPairCount} number(s) have NO session in DB or disk — pair once via website to enable auto-reconnect`));
    }
    console.log(chalk.cyan(`[Worker] 📊 Auto-reconnect: ${onlineCount}/${linked.length} bot(s) online\n`));
  } catch (e) {
    console.log(chalk.yellow(`[Worker] flatBootReconnectReport error: ${e.message}`));
  }
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

  // ── Step 1: Is this dyno supposed to host WhatsApp at all? ────────────────
  if (!shouldRunWhatsAppSupervisor()) {
    console.log(chalk.cyan(`ℹ️  WhatsApp bots hosted on ${getWhatsAppHostDyno()} dyno — this dyno on standby`));
    startKeepAlive();
    return;
  }

  // ── Step 2: Choose mode — BEFORE starting any supervisor ──────────────────
  // BOT_ISOLATION=0  → FLAT mode: all bots in ONE process (default from now on)
  // BOT_ISOLATION=1  → Isolated mode: supervisor forks one child per bot
  const useIsolation = process.env.BOT_ISOLATION === '1';

  if (useIsolation) {
    // ── Isolated mode (legacy): supervisor forks one Node process per bot ───
    console.log(chalk.magenta('🔒 Isolated mode: har number ka alag child process'));
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
      try { const { syncBots } = require('./worker/supervisor'); await syncBots(); } catch (_) {}
    }, 2 * 60 * 1000);
    return;
  }

  // ── FLAT mode: ALL bots in ONE process, parallel sockets ──────────────────
  // Each Baileys connection uses ~50-80 MB (shared Node/V8 runtime).
  // 100 bots → add worker dynos + set TOTAL_WORKER_DYNOS accordingly.
  console.log(chalk.green('\n╔══════════════════════════════════════════╗'));
  console.log(chalk.green('║  FLAT MODE — Sab bots ek hi process mein  ║'));
  console.log(chalk.green('╚══════════════════════════════════════════╝\n'));

  try {
    require('./case');
    console.log(chalk.green('✅ WhatsApp command handler loaded'));
  } catch (e) {
    console.log(chalk.yellow('[Worker] case.js load warning:', e.message));
  }

  console.log(chalk.blue('\n🔄 Loading all paired WhatsApp sessions (concurrent)...'));
  try {
    await runAutoLoadWithRetries(5);
  } catch (e) {
    console.log(chalk.red('[Worker] Auto-load error:', e.message));
  }

  startKeepAlive();
  console.log(chalk.green('\n🟢 Worker is running — ALL bots live, 24/7'));

  // One-shot boot reconnect diagnostic ~35s after autoload — shows per-number
  // status so we can see exactly which linked numbers reconnected and which
  // need re-pairing after a restart (FLAT mode equivalent of the supervisor
  // bootReconnectReport).
  setTimeout(() => flatBootReconnectReport().catch(() => {}), 35_000);

  // ── Auto-scaler: RAM > 85% → spin up extra worker dyno automatically ──────
  // Requires HEROKU_API_KEY + HEROKU_APP_NAME in Heroku config vars.
  try {
    const { autoScale } = require('./worker/heroku-scaler');
    setInterval(async () => { try { await autoScale(); } catch (_) {} }, 3 * 60 * 1000);
    console.log(chalk.cyan('[AutoScaler] ✅ Memory auto-scaler armed — checks every 3 min'));
  } catch (e) {
    console.log(chalk.yellow('[AutoScaler] ⚠️  Could not load scaler:', e.message));
  }

  // ── Memory monitor: log RSS every 5 min, warn when nearing dyno limit ─────
  // If RSS > 85%: add more worker dynos:
  //   heroku ps:scale worker=N  (e.g. N=10 for 100 bots)
  //   heroku config:set TOTAL_WORKER_DYNOS=N
  const DYNO_RAM_MB = parseInt(process.env.DYNO_TOTAL_RAM_MB, 10) || 1024;
  setInterval(() => {
    const rss = Math.round(process.memoryUsage().rss / 1024 / 1024);
    const pct = Math.round(rss / DYNO_RAM_MB * 100);
    const icon = pct > 85 ? '🔴' : pct > 70 ? '🟡' : '🟢';
    const warn = pct > 85
      ? chalk.red(' ⚠️  Memory high! Scale: heroku ps:scale worker=N + TOTAL_WORKER_DYNOS=N')
      : '';
    console.log(chalk.cyan(`[Mem] ${icon} ${rss}/${DYNO_RAM_MB}MB (${pct}%)${warn}`));
  }, 5 * 60 * 1000);

  const { startPairingProcessor } = require('./worker/pairing-processor');
  startPairingProcessor(150);

  const { startOrphanDisconnectJob } = require('./server/jobs/orphanDisconnectJob');
  startOrphanDisconnectJob(30_000);

  // ✅ FIX: Auto-restarter — har BOT_RESTART_HOURS ghante mein graceful restart
  // Session DB mein flush hoti hai restart se pehle — no data loss on Heroku/Replit
  try {
    const { startAutoRestarter } = require('./worker/auto-restarter');
    startAutoRestarter();
    const _restartHours = parseInt(process.env.BOT_RESTART_HOURS || '4', 10);
    console.log(chalk.gray(`[Worker] ⏰ Auto-restarter armed — restarts every ${_restartHours} hours`));
  } catch (e) {
    console.log(chalk.yellow('[Worker] Auto-restarter warning:', e.message));
  }

  // Reconnect sweep: first 15 min after restart (every 2 min), picks up any missed bots
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
      // Skip autoload if bots are running in pairing child processes (prevents Error 440)
      const hasPairingChildren = global._pairingChildPids && global._pairingChildPids.size > 0
        && [...global._pairingChildPids.values()].some(c => c && c.exitCode === null);
      if (!isRunning() && getUniqueTrackerCount() === 0 && !hasPairingChildren) {
        await autoLoadPairs({ concurrent: true });
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
      const PAIRING_GRACE_MS = 20 * 60 * 1000; // 20 min grace before auto-disconnect
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
