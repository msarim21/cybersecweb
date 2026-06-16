'use strict';

/**
 * ╔═══════════════════════════════════════════════════════╗
 * ║         HEROKU AUTO-SCALER — CYBER PRO BOT          ║
 * ║                                                       ║
 * ║  Naya bot link → auto check capacity → scale up      ║
 * ║  Har dyno max BOTS_PER_DYNO bots chalata hai         ║
 * ║                                                       ║
 * ║  Required Heroku Config Vars:                         ║
 * ║    HEROKU_API_TOKEN  — Heroku API token               ║
 * ║    HEROKU_APP_NAME   — app name (e.g. cybersecpro)   ║
 * ║    BOTS_PER_DYNO     — max bots per dyno (default 5) ║
 * ╚═══════════════════════════════════════════════════════╝
 */

const https = require('https');
const chalk = require('chalk');

function cfg() {
    return {
        token: process.env.HEROKU_API_TOKEN,
        app:   process.env.HEROKU_APP_NAME || process.env.HEROKU_APP,
        bpd:   Math.max(1, parseInt(process.env.BOTS_PER_DYNO, 10) || 5),
        size:  process.env.WORKER_DYNO_SIZE || 'standard-1x',
    };
}

/** Heroku Platform API v3 request */
function herokuAPI(method, path, body) {
    return new Promise((resolve, reject) => {
        const { token } = cfg();
        const data = body ? JSON.stringify(body) : null;
        const req = https.request({
            hostname: 'api.heroku.com',
            path,
            method,
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.heroku+json; version=3',
                'Content-Type': 'application/json',
                ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
            },
        }, (res) => {
            let raw = '';
            res.on('data', c => { raw += c; });
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
                catch (_) { resolve({ status: res.statusCode, body: raw }); }
            });
        });
        req.on('error', reject);
        req.setTimeout(20000, () => { req.destroy(new Error('Heroku API timeout')); });
        if (data) req.write(data);
        req.end();
    });
}

/** Current worker dyno count from Heroku formation */
async function getCurrentWorkerCount() {
    const { app } = cfg();
    const res = await herokuAPI('GET', `/apps/${app}/formation`);
    if (res.status !== 200) throw new Error(`Formation GET failed: HTTP ${res.status}`);
    const f = Array.isArray(res.body) ? res.body.find(x => x.type === 'worker') : null;
    return f ? f.quantity : 1;
}

/** Scale Heroku worker formation to target quantity */
async function scaleWorkerDynos(count) {
    const { app, size } = cfg();
    const res = await herokuAPI('PATCH', `/apps/${app}/formation/worker`, {
        quantity: count,
        size,
    });
    if (res.status !== 200 && res.status !== 202) {
        throw new Error(`Formation PATCH failed: HTTP ${res.status} → ${JSON.stringify(res.body)}`);
    }
    return res.body;
}

/**
 * Update a Heroku config var.
 * NOTE: This triggers a rolling restart of all dynos — dynos pick up new TOTAL_WORKER_DYNOS
 * and each reloads its correct shard of bots.
 */
async function updateHerokuConfigVar(key, value) {
    const { app } = cfg();
    const res = await herokuAPI('PATCH', `/apps/${app}/config-vars`, { [key]: String(value) });
    if (res.status !== 200) throw new Error(`Config PATCH failed: HTTP ${res.status}`);
    return res.body;
}

/** Minimum dynos needed for given bot count */
function requiredDynos(botCount) {
    const { bpd } = cfg();
    if (botCount <= 0) return 1;
    return Math.ceil(botCount / bpd);
}

/** Max bots the current formation can hold */
function currentCapacity(dynoCount) {
    const { bpd } = cfg();
    return dynoCount * bpd;
}

/**
 * Auto-scale worker dynos based on total active linked bots.
 *
 * Call this after any new bot is successfully linked.
 *
 * Sharding logic (in autoload.js shardJids):
 *   Block assignment — dyno N → bots[N*BPD .. (N+1)*BPD - 1]
 *   dyno.1 → bots 0-4 | dyno.2 → bots 5-9 | dyno.3 → bots 10-14 | ...
 *
 * Scale up only — never auto scale down (safety: downscaling is manual).
 * Non-fatal: bot linking succeeds even if auto-scale fails.
 */
async function autoScaleWorkers() {
    const { token, app, bpd } = cfg();

    if (!token || !app) {
        console.log(chalk.yellow('[HerokuScaler] ⚠️  HEROKU_API_TOKEN / HEROKU_APP_NAME not set — auto-scale disabled'));
        return;
    }

    try {
        const { getAllActiveLinkedNumbers } = require('../server/db-service');
        const bots   = await getAllActiveLinkedNumbers().catch(() => []);
        const bCnt   = bots.length;
        const needed = requiredDynos(bCnt);
        const running = await getCurrentWorkerCount();
        const cfgN   = parseInt(process.env.TOTAL_WORKER_DYNOS, 10) || running;

        console.log(chalk.cyan(
            `[HerokuScaler] 📊 Bots: ${bCnt} | Running dynos: ${running} | Needed dynos: ${needed} | Capacity: ${currentCapacity(running)} | BOTS_PER_DYNO: ${bpd}`
        ));

        const needsScale = needed > running;
        const needsCfg   = needed !== cfgN;

        if (!needsScale && !needsCfg) {
            console.log(chalk.green('[HerokuScaler] ✅ Capacity sufficient — no change needed'));
            return;
        }

        if (needsScale) {
            console.log(chalk.green(`[HerokuScaler] 🚀 Scaling workers: ${running} → ${needed} (for ${bCnt} bots @ ${bpd}/dyno)`));
            await scaleWorkerDynos(needed);
            console.log(chalk.green(`[HerokuScaler] ✅ Scaled to ${needed} worker dynos → capacity: ${currentCapacity(needed)} bots`));
        }

        if (needsCfg) {
            // Updating TOTAL_WORKER_DYNOS triggers rolling dyno restart
            // Each dyno reloads → shardJids() distributes bots across new total
            // New dyno(s) start → load their assigned bots automatically
            await updateHerokuConfigVar('TOTAL_WORKER_DYNOS', String(needed));
            process.env.TOTAL_WORKER_DYNOS = String(needed);
            console.log(chalk.cyan(`[HerokuScaler] 🔄 TOTAL_WORKER_DYNOS: ${cfgN} → ${needed}`));
        }

    } catch (err) {
        // Non-fatal: log and continue — bot linking should never fail due to scaling error
        console.error(chalk.red(`[HerokuScaler] ❌ Auto-scale error (non-fatal): ${err.message}`));
    }
}

module.exports = {
    autoScaleWorkers,
    requiredDynos,
    currentCapacity,
    scaleWorkerDynos,
    updateHerokuConfigVar,
};
