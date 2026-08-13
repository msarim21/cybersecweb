'use strict';

/**
 * Pairing queue processor — rewritten around lib/pairing-engine.js.
 *
 * Responsibilities (and nothing else):
 *   1. Claim ONE pending pairing request at a time from the database.
 *   2. Run it in a dedicated `worker/pair-runner.js` child process.
 *   3. When it succeeds, hand the number over to the bot supervisor/autoload.
 *   4. Guarantee a terminal database state so the dashboard never hangs.
 *
 * Only one registration socket may exist across the whole dyno: a WhatsApp
 * pairing code is socket-scoped, so a second socket silently invalidates the
 * first one's code. That invariant is enforced here by the single-flight lock.
 */

const path = require('path');
const fs = require('fs');
const { fork } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PAIR_ROOT = path.join(ROOT, 'nexstore', 'pairing');
const RUNNER = path.join(__dirname, 'pair-runner.js');

// A pairing attempt can legitimately take: code issue (≤60s) + user typing the
// code (≤180s) + login handshake. Anything past this is a hung child.
const ATTEMPT_TIMEOUT_MS = 300_000;
const LOCK_WATCHDOG_MS = ATTEMPT_TIMEOUT_MS + 60_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function rmrf(target) {
  try {
    fs.rmSync(target, { recursive: true, force: true });
  } catch (_) {}
}

function isPairingHost() {
  try {
    const { shouldRunWhatsAppSupervisor } = require('../allfunc/whatsapp-host');
    return shouldRunWhatsAppSupervisor();
  } catch {
    return false;
  }
}

function releaseLock() {
  global._pairingProcessorBusy = false;
  global._pairingProcessorBusySince = 0;
  global._pairingOwner = null;
}

function lockHeld() {
  if (!global._pairingProcessorBusy) return false;
  const since = global._pairingProcessorBusySince || 0;
  if (since && Date.now() - since > LOCK_WATCHDOG_MS) {
    console.warn('[PairingQueue] Stale busy lock — force releasing');
    releaseLock();
    return false;
  }
  return true;
}

/** Kill any pairing child still running for this number. */
function killExistingChild(clean) {
  const child = global._pairingChildPids?.get(clean);
  if (!child) return;
  try {
    child.kill('SIGKILL');
  } catch (_) {}
  global._pairingChildPids.delete(clean);
}

/** Run pair-runner.js for one number; resolves with its exit code. */
function runPairChild(clean) {
  return new Promise((resolve) => {
    let done = false;
    const child = fork(RUNNER, [clean], {
      cwd: ROOT,
      stdio: 'inherit',
      env: {
        ...process.env,
        WHATSAPP_WORKER: '1',
        BOT_ISOLATION: '1',
        BOT_PAIRING: '1',
        BOT_NUMBER: clean,
      },
    });

    if (!global._pairingChildPids) global._pairingChildPids = new Map();
    global._pairingChildPids.set(clean, child);

    const timer = setTimeout(() => {
      if (done) return;
      console.warn(`[PairingQueue] ${clean} pairing child timed out — killing`);
      try {
        child.kill('SIGKILL');
      } catch (_) {}
    }, ATTEMPT_TIMEOUT_MS);

    const settle = (code) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (global._pairingChildPids?.get(clean) === child) {
        global._pairingChildPids.delete(clean);
      }
      resolve(code);
    };

    child.on('exit', (code) => settle(code ?? 1));
    child.on('error', (err) => {
      console.error(`[PairingQueue] ${clean} child error:`, err.message);
      settle(1);
    });
  });
}

/** Boot the full bot for a freshly paired number. */
async function startBotFor(clean) {
  try {
    const { removeFromStoppedBots } = require('../allfunc/stopped-bots');
    removeFromStoppedBots(clean);
  } catch (_) {}

  try {
    const { isSupervisorActive, spawnBot } = require('./supervisor');
    if (isSupervisorActive()) {
      spawnBot(clean, { force: true });
      return;
    }
  } catch (_) {}

  try {
    const { autoLoadPairs } = require('../autoload');
    await autoLoadPairs({ concurrent: true }).catch(() => {});
  } catch (err) {
    console.error(`[PairingQueue] Could not start bot for ${clean}:`, err.message);
  }
}

/**
 * Handle exactly one claimed number end to end.
 */
async function handleNumber(clean, service) {
  const {
    clearPairingRequest,
    markPairingFailed,
    getPairingState,
    isNumberInLinkedNumbers,
    getBotSessionsByNumbers,
  } = service;

  // Already linked → never request a new code.
  const linked = await isNumberInLinkedNumbers(clean).catch(() => false);
  if (linked) {
    console.log(`[PairingQueue] ${clean} already linked — clearing request`);
    await clearPairingRequest(clean).catch(() => {});
    return;
  }

  const sessions = await getBotSessionsByNumbers([clean]).catch(() => ({}));
  const session = sessions?.[clean];
  if (session?.connectionStatus === 'CONNECTED' && session?.status === 'active') {
    await clearPairingRequest(clean).catch(() => {});
    return;
  }

  // A session already stored in the database means "reconnect", not "pair".
  try {
    const { hasRegisteredSession } = require('../lib/pairing-engine');
    if (await hasRegisteredSession(clean)) {
      console.log(`[PairingQueue] ${clean} has stored credentials — reconnecting instead of pairing`);
      const { restoreCredsFromDb } = require('../session-db');
      await restoreCredsFromDb(clean, path.join(PAIR_ROOT, clean)).catch(() => {});
      await clearPairingRequest(clean).catch(() => {});
      await startBotFor(clean);
      return;
    }
  } catch (_) {}

  // Fresh pairing: stop everything that could hold a socket for this number.
  killExistingChild(clean);
  try {
    const { isSupervisorActive, stopBotAndWait } = require('./supervisor');
    if (isSupervisorActive()) await stopBotAndWait(clean).catch(() => {});
  } catch (_) {}
  rmrf(path.join(PAIR_ROOT, `pairing_${clean}.json`));
  await sleep(500);

  console.log(`[PairingQueue] ▶ starting pairing for +${clean}`);
  const exitCode = await runPairChild(clean);

  if (exitCode === 0) {
    console.log(`[PairingQueue] ✅ +${clean} paired — starting bot`);
    await clearPairingRequest(clean).catch(() => {});
    await sleep(1500);
    await startBotFor(clean);
    return;
  }

  // The runner records its own reason; only fill in a terminal state if it
  // died before it could (crash, OOM, SIGKILL).
  const state = await getPairingState(clean).catch(() => null);
  if (state && state.status !== 'active' && state.status !== 'failed') {
    await markPairingFailed(clean, 'Pairing stopped unexpectedly — request a new code').catch(() => {});
  }
  console.warn(`[PairingQueue] ❌ +${clean} pairing failed (exit ${exitCode})`);
}

async function processPairingQueue() {
  if (!isPairingHost()) return false;
  if (global._pairingProcessorTickBusy) return true;
  global._pairingProcessorTickBusy = true;

  try {
    const service = require('../server/db-service');
    const { getPendingPairingRequests, markPairingInProgress, reclaimStalePairingClaims } = service;

    // Return orphaned in_progress rows (from a crashed dyno) to the queue.
    await reclaimStalePairingClaims?.(5 * 60_000).catch(() => {});

    if (lockHeld()) return true;

    const pending = await getPendingPairingRequests();
    if (!pending.length) return false;

    const clean = pending.find(Boolean);
    if (!clean) return false;

    const claimed = await markPairingInProgress(clean).catch(() => false);
    if (!claimed) return true;

    global._pairingProcessorBusy = true;
    global._pairingProcessorBusySince = Date.now();
    global._pairingOwner = clean;

    try {
      const { logBotEvent } = require('../allfunc/bot-lifecycle');
      logBotEvent(clean, 'pair_request_received', { source: 'pairing-processor' });
    } catch (_) {}

    // Run detached from the tick so the poller stays responsive; the lock keeps
    // any other number from opening a second registration socket.
    void handleNumber(clean, service)
      .catch(async (err) => {
        console.error(`[PairingQueue] ${clean} failed:`, err.message);
        await service.markPairingFailed(clean, `Pairing error: ${err.message}`).catch(() => {});
      })
      .finally(() => {
        killExistingChild(clean);
        releaseLock();
      });

    return true;
  } catch (err) {
    console.error('[PairingQueue] Error:', err.message);
    return false;
  } finally {
    global._pairingProcessorTickBusy = false;
  }
}

function startPairingProcessor(intervalMs = 1000) {
  if (!isPairingHost()) return null;

  processPairingQueue().catch(() => {});
  const timer = setInterval(() => {
    processPairingQueue().catch(() => {});
  }, intervalMs);

  let host = 'web';
  try {
    host = require('../allfunc/whatsapp-host').getWhatsAppHostDyno();
  } catch (_) {}
  console.log(`[PairingQueue] pairing processor started on ${host} dyno (${intervalMs}ms poll)`);
  return timer;
}

module.exports = { processPairingQueue, startPairingProcessor };
