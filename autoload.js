'use strict';

const fs = require('fs');
const fsAsync = require('fs').promises;
const path = require('path');
const chalk = require('chalk');

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
async function restoreSessionBeforeConnect(number) {
  try {
    const { restoreCredsFromDb } = require('./session-db');
    const clean = number.replace('@s.whatsapp.net', '').replace(/[^0-9]/g, '');
    const sessionPath = path.join(__dirname, 'nexstore', 'pairing', number);
    const credsFile = path.join(sessionPath, 'creds.json');

    // Already on filesystem and valid — no need to restore
    if (fs.existsSync(credsFile)) {
      try {
        JSON.parse(fs.readFileSync(credsFile, 'utf8'));
        return true; // filesystem is fine
      } catch {
        // corrupt — fall through to restore from DB
      }
    }

    console.log(chalk.cyan(`[AutoLoad] 📥 Restoring session from DB for ${clean}...`));
    const restored = await restoreCredsFromDb(clean, sessionPath);
    if (restored) {
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

// ── Process a single user ───────────────────────────────────────────────────
async function processUser(user, index, total) {
  if (isShuttingDown) throw new Error('Shutdown in progress');

  console.log(chalk.blue(`⌛ Connecting ${index + 1}/${total}: ${user}`));

  // Restore creds from MongoDB before handing off to pair.js
  await restoreSessionBeforeConnect(user);

  try {
    const startpairing = require('./pair');
    await startpairing(user);
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

// ── Build user list: DB first, filesystem fallback ──────────────────────────
async function buildUserList() {
  const pairingDir = path.join(__dirname, 'nexstore', 'pairing');

  // ── Load stopped-bots list (numbers manually disconnected should NOT reconnect) ──
  let stoppedNumbers = new Set();
  try {
    const stopFile = path.join(__dirname, 'database', 'stopped_bots.json');
    if (fs.existsSync(stopFile)) {
      const stopped = JSON.parse(fs.readFileSync(stopFile, 'utf8'));
      stoppedNumbers = new Set(stopped.map(s => String(s).replace(/[^0-9]/g, '')));
    }
  } catch (_) {}

  // ── Primary: load from DB — retry 3 times if 0 returned (DB slow on startup) ──
  try {
    const { getActiveLinkedNumbers } = require('./session-db');
    let dbNumbers = [];
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        dbNumbers = await getActiveLinkedNumbers();
      } catch (e) {
        console.log(chalk.yellow(`[AutoLoad] ⚠️  DB query error attempt ${attempt}/3: ${e.message}`));
      }
      if (dbNumbers && dbNumbers.length > 0) break;
      if (attempt < 3) {
        console.log(chalk.yellow(`[AutoLoad] ⏳ DB returned 0 numbers (attempt ${attempt}/3) — retrying in 6s...`));
        await delay(6000);
      }
    }

    if (dbNumbers && dbNumbers.length > 0) {
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
      return jids;
    }
    console.log(chalk.yellow('[AutoLoad] ⚠️  DB returned 0 linked numbers after 3 attempts — falling back to filesystem'));
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
      // Skip numbers that were manually stopped/disconnected
      if (stoppedNumbers.has(plain)) return false;
      const pathA = path.join(pairingDir, jid, 'creds.json');
      const pathB = path.join(pairingDir, plain, 'creds.json');
      return fs.existsSync(pathA) || fs.existsSync(pathB);
    });

  console.log(chalk.yellow(`[AutoLoad] 📁 Filesystem source: found ${jids.length} sessions`));
  return jids;
}

// ── Main export ──────────────────────────────────────────────────────────────
module.exports = {
  autoLoadPairs: async (options = {}) => {
    if (isShuttingDown) {
      console.log(chalk.yellow('⚠️ Skipping auto-load (shutdown in progress)'));
      return { success: false, message: 'Shutdown in progress' };
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
