'use strict';
/**
 * Auto-scaler: Heroku worker dynos ko memory ke mutabiq scale karta hai.
 *
 * Kaise kaam karta hai:
 *   - Har 3 min RSS check karta hai
 *   - RAM > 85% → naya worker dyno add kar deta hai (scale-up)
 *   - RAM < 25% AND dynos > 1 → extra dyno hata deta hai (scale-down)
 *   - TOTAL_WORKER_DYNOS config var update karta hai taake shardJids() correct rahe
 *
 * Required env vars (set karo Heroku config mein):
 *   HEROKU_API_KEY  — apka Heroku API token
 *   HEROKU_APP_NAME — cybersecpro
 *   MAX_WORKER_DYNOS — maximum dynos allowed (default 10)
 *   BOTS_PER_DYNO    — bots per dyno for sharding (default 12)
 */

const https = require('https');
const chalk = require('chalk');

const APP        = process.env.HEROKU_APP_NAME || 'cybersecpro';
const MAX_DYNOS  = parseInt(process.env.MAX_WORKER_DYNOS, 10) || 10;

let _lastScaleUp   = 0;
let _lastScaleDown = 0;
const COOLUP   = 5  * 60 * 1000; // 5 min between scale-ups
const COOLDOWN = 15 * 60 * 1000; // 15 min between scale-downs

// ── Heroku API helper ────────────────────────────────────────────────────────
function herokuCall(method, path, body) {
  const API_KEY = process.env.HEROKU_API_KEY;
  if (!API_KEY) return Promise.reject(new Error('HEROKU_API_KEY not set'));
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'api.heroku.com', path, method,
      headers: {
        'Authorization': 'Bearer ' + API_KEY,
        'Accept': 'application/vnd.heroku+json; version=3',
        'Content-Type': 'application/json',
        'User-Agent': 'cybersecpro-autoscaler',
        ...(data && { 'Content-Length': Buffer.byteLength(data) })
      }
    };
    const req = https.request(opts, res => {
      let b = ''; res.on('data', c => b += c);
      res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(b) }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function getWorkerCount() {
  try {
    const r = await herokuCall('GET', '/apps/' + APP + '/formation/worker', null);
    return (r.data && r.data.quantity) ? r.data.quantity : 1;
  } catch {
    return parseInt(process.env.TOTAL_WORKER_DYNOS, 10) || 1;
  }
}

async function setWorkerCount(n) {
  await herokuCall('PATCH', '/apps/' + APP + '/formation', {
    updates: [{ type: 'worker', quantity: n }]
  });
  // Update config var so new dynos know the total count for sharding
  await herokuCall('PATCH', '/apps/' + APP + '/config-vars', {
    TOTAL_WORKER_DYNOS: String(n)
  });
  process.env.TOTAL_WORKER_DYNOS = String(n);
}

// ── Main auto-scale function — call every 3 minutes ─────────────────────────
async function autoScale() {
  if (!process.env.HEROKU_API_KEY) return; // skip silently if no key

  const totalMb = parseInt(process.env.DYNO_TOTAL_RAM_MB, 10) || 1024;
  const rss     = Math.round(process.memoryUsage().rss / 1024 / 1024);
  const pct     = (rss / totalMb) * 100;
  const now     = Date.now();

  // ── Scale UP ──────────────────────────────────────────────────────────────
  if (pct > 85 && (now - _lastScaleUp) > COOLUP) {
    const current = await getWorkerCount();
    if (current < MAX_DYNOS) {
      const next = current + 1;
      console.log(chalk.red(
        `[AutoScaler] 🔴 RAM ${rss}/${totalMb}MB (${pct.toFixed(0)}%) — scale UP worker ${current} → ${next}`
      ));
      await setWorkerCount(next);
      _lastScaleUp = now;
      console.log(chalk.green(`[AutoScaler] ✅ worker dyno count = ${next} | TOTAL_WORKER_DYNOS=${next}`));
    } else {
      console.log(chalk.red(
        `[AutoScaler] 🔴 RAM ${pct.toFixed(0)}% but already at MAX_WORKER_DYNOS=${MAX_DYNOS}`
      ));
    }
  }

  // ── Scale DOWN ────────────────────────────────────────────────────────────
  if (pct < 25 && (now - _lastScaleDown) > COOLDOWN) {
    const current = await getWorkerCount();
    if (current > 1) {
      const next = current - 1;
      console.log(chalk.green(
        `[AutoScaler] 🟢 RAM ${rss}/${totalMb}MB (${pct.toFixed(0)}%) — scale DOWN worker ${current} → ${next}`
      ));
      await setWorkerCount(next);
      _lastScaleDown = now;
    }
  }
}

module.exports = { autoScale };
