'use strict';

const fs = require('fs');
const fsAsync = require('fs').promises;
const path = require('path');
const chalk = require('chalk');

// ── Memory guard: check RAM before connecting each bot ───────────────────────
function getRssMb() {
  return Math.round(process.memoryUsage().rss / 1024 / 1024);
}
function isDynoMemFull() {
  const totalMb = parseInt(process.env.DYNO_TOTAL_RAM_MB, 10) || 512;
  const maxPct  = parseInt(process.env.MAX_MEM_PERCENT,   10) || 80;
  return getRssMb() >= Math.floor(totalMb * maxPct / 100);
}

let isAutoLoadRunning = false;
let isShuttingDown = false;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

process.on('message', (msg) => {
  if (msg === 'shutdown') {
    console.log(chalk.yellow('🛑 Received PM2 shutdown signal'));
    isShuttingDown = true;
  }
});

process.on('SIGINT', () => {
  console.log(chalk.yellow('🛑 Received SIGINT signal'));
  isShuttingDown = true;
});

process.on('SIGTERM', () => {
  console.log(chalk.yellow('🛑 Received SIGTERM signal'));
  isShuttingDown = true;
});

// ── Restore session creds from MongoDB → filesystem before connecting ────────
function hasValidCreds(sessionPath) {
  const credsFile = path.join(sessionPath, 'creds.json');
  if (!fs.existsSync(credsFile)) return false;
  try {
    JSON.parse(fs.readFileSync(credsFile, 'utf8'));
    return true;
  } catch {
    return false;
  }
}

async function restoreSessionBeforeConnect(number) {
  try {
    const { restoreCredsFromDb } = require('./session-db');
    const clean = number.replace('@s.whatsapp.net', '').replace(/[^0-9]/g, '');
    const sessionPath = path.join(__dirname, 'nexstore', 'pairing', number);
    const altPath = path.join(__dirname, 'nexstore', 'pairing', clean);

    if (hasValidCreds(sessionPath) || hasValidCreds(altPath)) {
      return true;
    }

    console.log(chalk.cyan(`[AutoLoad] 📥 Restoring session from DB for ${clean}...`));
    let restored = await restoreCredsFromDb(clean, sessionPath);
    if (!restored) restored = await restoreCredsFromDb(clean, altPath);
    if (restored) {
      const { logBotEvent } = require('./allfunc/bot-lifecycle');
      logBotEvent(clean, 'session_restored', { source: 'autoload' });
      console.log(chalk.green(`[AutoLoad] ✅ Session restored from DB: ${clean}`));
    } else {
      console.log(chalk.yellow(`[AutoLoad] ⚠️  No DB session found for ${clean} — fresh connect`));
    }
    return restored;
  } catch (err) {
    console.error(`[AutoLoad] ❌ restoreSession error: ${err.message}`);
    return false;
  }
}

function getLiveTracker(clean) {
  try {
    const pairMod = require('./pair');
    const trackerMap = pairMod._getTracker?.();
    if (!trackerMap?.get) return null;
    return trackerMap.get(`${clean}@s.whatsapp.net`) || trackerMap.get(clean) || null;
  } catch (_) {
    return null;
  }
}

async function waitForBotReady(clean, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const tracker = getLiveTracker(clean);
    const wsState = tracker?.connection?.ws?.readyState;
    if (tracker?.connection?.user && wsState === 1) return true;

    try {
      const { isBotHeartbeatFresh } = require('./allfunc/bot-heartbeat');
      if (isBotHeartbeatFresh(clean, 5 * 60 * 1000)) return true;
    } catch (_) {}

    await delay(1000);
  }
  return false;
}

// ── Process a single user ───────────────────────────────────────────────────
async function processUser(user, index, total) {
  if (isShuttingDown) throw new Error('Shutdown in progress');

  // ── Memory guard: if dyno RAM is nearly full, skip this bot ──────────────
  // runAutoLoadWithRetries sees it as failed → retries → auto-scaler adds dyno
  if (isDynoMemFull()) {
    const rss     = getRssMb();
    const totalMb = parseInt(process.env.DYNO_TOTAL_RAM_MB, 10) || 512;
    const maxPct  = parseInt(process.env.MAX_MEM_PERCENT, 10) || 80;
    const limitMb = Math.floor(totalMb * maxPct / 100);
    const clean   = user.replace('@s.whatsapp.net', '').replace(/[^0-9]/g, '');
    console.log(chalk.yellow(`[AutoLoad] ⚠️  RAM ${rss}/${limitMb}MB full — queuing ${clean} for extra dyno`));
    if (!global._memSkippedBots) global._memSkippedBots = new Set();
    global._memSkippedBots.add(clean);
    return { skipped: true, user };
  }

  console.log(chalk.blue(`⌛ Connecting ${index + 1}/${total}: ${user}`));

  // Restore creds from MongoDB before handing off to pair.js
  await restoreSessionBeforeConnect(user);

  const clean = user.replace('@s.whatsapp.net', '').replace(/[^0-9]/g, '');
  const sessionPath = path.join(__dirname, 'nexstore', 'pairing', user);
  const altPath = path.join(__dirname, 'nexstore', 'pairing', clean);
  if (!hasValidCreds(sessionPath) && !hasValidCreds(altPath)) {
    const { getSessionCreds } = require('./server/db-service');
    const dbCreds = await getSessionCreds(clean).catch(() => null);
    if (!dbCreds || !Object.keys(dbCreds).length) {
      throw new Error(`No saved session for ${clean} — pair once via website to save creds to DB`);
    }
    throw new Error(`Could not restore session files for ${clean} from DB`);
  }

  try {
    const startpairing = require('./pair');

    // ⏱ 90-second timeout: agar connection hang ho to baaki bots block na hon
    const connectWithTimeout = () => new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Connection timeout after 90s for ${clean}`));
      }, 90000);

      Promise.resolve(startpairing(user))
        .then(sock => { clearTimeout(timer); resolve(sock); })
        .catch(err  => { clearTimeout(timer); reject(err); });
    });

    const sock = await connectWithTimeout();
    if (!sock) throw new Error('Connection skipped (stopped or duplicate socket)');

    const ready = await waitForBotReady(clean, 90_000);
    if (!ready) {
      throw new Error(`Bot did not become ready after connect for ${clean}`);
    }

    console.log(chalk.green(`✅ Connected: ${user}`));
    return user;
  } catch (error) {
    console.log(chalk.red(`❌ Failed for ${user}: ${error.message}`));
    throw error;
  }
}

// ── Batch processor ─────────────────────────────────────────────────────────
async function processBatch(users, batchSize = 10) {
  const results = [];

  for (let i = 0; i < users.length; i += batchSize) {
    if (isShuttingDown) {
      console.log(chalk.yellow('⏹️ Stopping batch processing due to shutdown'));
      break;
    }

    const batch = users.slice(i, i + batchSize);
    const batchNumber = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(users.length / batchSize);

    console.log(chalk.cyan(`🔄 Processing batch ${batchNumber}/${totalBatches} (${batch.length} users)`));

    // Serialize within batch — parallel connects caused error 440 and ghost sockets
    for (let j = 0; j < batch.length; j++) {
      const user = batch[j];
      try {
        const value = await processUser(user, i + j, users.length);
        results.push({ status: 'fulfilled', value });
      } catch (error) {
        results.push({ status: 'fulfilled', value: { user, error: error.message, success: false } });
      }
    }

    if (i + batchSize < users.length && !isShuttingDown) {
      console.log(chalk.gray(`⏳ Waiting 2 seconds before next batch...`));
      await delay(2000);
    }
  }

  return results;
}

function countSuccessful(results) {
  return results.filter(r => r.status === 'fulfilled' && typeof r.value === 'string').length;
}

async function waitForDbReady(maxWaitMs = 45000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const { initDb, isDbReady } = require('./server/db');
      await initDb();
      if (isDbReady()) return true;
    } catch (e) {
      console.log(chalk.yellow(`[AutoLoad] DB wait: ${e.message}`));
    }
    await delay(3000);
  }
  return false;
}

// ── Dyno sharding: each worker dyno handles only ITS assigned bots ───────────
// Block assignment — dyno N gets bots[N*B .. (N+1)*B-1]
// Block assignment — must match worker/supervisor.js (see allfunc/dyno-shard.js)
function shardJids(jids) {
    const { shardLinkedNumbers } = require('./allfunc/dyno-shard');
    const { getDynoIndex, getTotalWorkerDynos } = require('./allfunc/whatsapp-host');
    const total = getTotalWorkerDynos();
    const bpd = Math.max(1, parseInt(process.env.BOTS_PER_DYNO, 10) || 5);
    const cleanList = jids.map((j) => String(j).replace(/[^0-9]/g, '')).filter(Boolean);
    const mine = shardLinkedNumbers(cleanList);
    const mineSet = new Set(mine);
    const result = jids.filter((j) => mineSet.has(String(j).replace(/[^0-9]/g, '')));

    if (total > 1) {
        const myIdx = getDynoIndex();
        console.log(chalk.cyan(
            `[AutoLoad] 🔀 Dyno ${myIdx + 1}/${total}: managing ${result.length} / ${jids.length} bots (block ${myIdx * bpd}–${myIdx * bpd + result.length - 1}, max ${bpd}/dyno)`
        ));
        if (result.length === 0) {
            console.log(chalk.yellow(
                `[AutoLoad] ℹ️  No bots assigned to this dyno (${myIdx + 1}/${total}) — it will idle.`
            ));
        }
    }
    return result;
}

// ── Build user list: DB first, filesystem fallback ──────────────────────────
async function buildUserList() {
  const pairingDir = path.join(__dirname, 'nexstore', 'pairing');

  await waitForDbReady();

  try {
    const { syncStoppedWithLinkedNumbers } = require('./allfunc/stopped-bots');
    await syncStoppedWithLinkedNumbers();
  } catch (_) {}

  // ── Load stopped-bots list (numbers manually disconnected should NOT reconnect) ──
  let stoppedNumbers = new Set();
  try {
    const { readStopped } = require('./allfunc/stopped-bots');
    stoppedNumbers = new Set(readStopped());
  } catch (_) {}

  // ── Primary: load from DB — retry 5 times if 0 returned (DB slow on startup) ──
  try {
    const { getActiveLinkedNumbers } = require('./session-db');
    const { removeFromStoppedBots } = require('./allfunc/stopped-bots');
    let dbNumbers = [];
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        dbNumbers = await getActiveLinkedNumbers();
      } catch (e) {
        console.log(chalk.yellow(`[AutoLoad] ⚠️  DB query error attempt ${attempt}/5: ${e.message}`));
      }
      if (dbNumbers && dbNumbers.length > 0) break;
      if (attempt < 5) {
        console.log(chalk.yellow(`[AutoLoad] ⏳ DB returned 0 numbers (attempt ${attempt}/5) — retrying in 5s...`));
        await delay(5000);
      }
    }

    if (dbNumbers && dbNumbers.length > 0) {
      for (const n of dbNumbers) removeFromStoppedBots(String(n).replace(/[^0-9]/g, ''));
      const jids = dbNumbers
        .map(n => {
          const clean = String(n).replace(/[^0-9]/g, '');
          return clean + '@s.whatsapp.net';
        })
        .filter(jid => {
          const clean = jid.replace('@s.whatsapp.net', '');
          return !stoppedNumbers.has(clean);
        });
      if (jids.length < dbNumbers.length) {
        console.log(chalk.yellow(`[AutoLoad] 🚫 Skipped ${dbNumbers.length - jids.length} stopped number(s)`));
      }
      console.log(chalk.green(`[AutoLoad] 📦 DB source: found ${jids.length} linked numbers`));
      return shardJids(jids);
    }
    console.log(chalk.yellow('[AutoLoad] ⚠️  DB returned 0 linked numbers after 5 attempts — falling back to filesystem'));
  } catch (err) {
    console.error(`[AutoLoad] ⚠️  DB query failed (${err.message}) — falling back to filesystem`);
  }

  // ── Fallback: read from nexstore/pairing directory ───────────────────────
  try {
    await fsAsync.access(pairingDir);
  } catch {
    console.log(chalk.red('[AutoLoad] ❌ Pairing directory not found and DB returned nothing.'));
    return [];
  }

  const files = await fsAsync.readdir(pairingDir, { withFileTypes: true });
  const jids = files
    .filter(d => d.isDirectory())
    .map(d => {
      const name = d.name;
      if (name.endsWith('@s.whatsapp.net')) return name;
      if (/^[0-9]+$/.test(name)) return name + '@s.whatsapp.net';
      return null;
    })
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i)
    .filter(jid => {
      const plain = jid.replace('@s.whatsapp.net', '');
      if (stoppedNumbers.has(plain)) return false;
      const pathA = path.join(pairingDir, jid, 'creds.json');
      const pathB = path.join(pairingDir, plain, 'creds.json');
      return fs.existsSync(pathA) || fs.existsSync(pathB);
    });

  console.log(chalk.yellow(`[AutoLoad] 📁 Filesystem source: found ${jids.length} sessions`));
  return shardJids(jids);
}

// ── Main export ──────────────────────────────────────────────────────────────
module.exports = {
  autoLoadPairs: async (options = {}) => {
    if (isShuttingDown) {
      console.log(chalk.yellow('⚠️ Skipping auto-load (shutdown in progress)'));
      return { success: false, message: 'Shutdown in progress' };
    }

    if (!global.__ISOLATED_BOT) {
      try {
        const { shouldRunWhatsAppSupervisor } = require('./allfunc/whatsapp-host');
        if (!shouldRunWhatsAppSupervisor()) {
          return { success: false, message: 'Auto-load skipped — not WhatsApp host dyno' };
        }
      } catch (_) {}
    }

    if (isAutoLoadRunning) {
      console.log(chalk.yellow('⚠️ Auto-load already in progress. Skipping...'));
      return { success: false, message: 'Auto-load already running' };
    }

    isAutoLoadRunning = true;
    console.log(chalk.yellow('🔄 Auto-loading all paired users...'));

    try {
      const pairUsers = await buildUserList();

      if (pairUsers.length === 0) {
        console.log(chalk.yellow('ℹ️ No paired users found.'));
        return { success: true, message: 'No users to load', total: 0, successful: 0 };
      }

      console.log(chalk.green(`✅ Found ${pairUsers.length} user(s). Starting connections...`));

      const startTime = Date.now();
      let results;
      let successful = 0;

      if (options.concurrent === true) {
        console.log(chalk.cyan('🚀 Processing all users concurrently...'));
        const promises = pairUsers.map((user, index) =>
          processUser(user, index, pairUsers.length).catch(error => ({ user, error: error.message, success: false }))
        );
        results = await Promise.allSettled(promises);
        successful = countSuccessful(results);
      } else {
        const batchSize = options.batchSize || 5;
        console.log(chalk.cyan(`🔄 Processing users in batches of ${batchSize}...`));
        results = await processBatch(pairUsers, batchSize);
        successful = countSuccessful(results);
      }

      const duration = (((Date.now() - startTime)) / 1000).toFixed(2);
      const failed = pairUsers.length - successful;

      console.log(chalk.green(`🎉 Auto-load done in ${duration}s — ✅ ${successful} connected, ❌ ${failed} failed`));

      return { success: true, total: pairUsers.length, successful, failed, duration };

    } catch (error) {
      console.error(chalk.red('❌ Auto-load error:'), error);
      return { success: false, message: error.message, total: 0, successful: 0 };
    } finally {
      isAutoLoadRunning = false;
    }
  },

  isRunning: () => isAutoLoadRunning,
  isShuttingDown: () => isShuttingDown,
};
