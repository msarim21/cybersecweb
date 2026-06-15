'use strict';

const os = require('os');

/**
 * Memory guard — prevents OOM crashes by checking free RAM before spawning a bot.
 *
 * Env vars (all optional):
 *   SERVER_RESERVE_MB   — MB to keep free for the web server itself     (default: 120)
 *   BOT_CHILD_HEAP_MB   — max heap given to each bot child process       (default: 256)
 *   BOT_ROTATION_HOURS  — hours between automatic bot rotation cycles    (default: 6)
 *
 * How to reduce Heroku bill:
 *   - Set WHATSAPP_HOST_DYNO=web to run bots on the web dyno (no extra worker dyno needed)
 *   - Use UptimeRobot (free) to ping the app every 5 min → Eco dyno never sleeps
 *   - This way: 1x Eco web dyno ($5/mah) runs the website + all bots (up to RAM limit)
 *   - RAM formula: total_RAM - SERVER_RESERVE_MB / BOT_CHILD_HEAP_MB = max concurrent bots
 *     e.g. 512MB dyno: (512 - 120) / 256 ≈ 1-2 bots always-on, or up to ~4 with rotation
 */

const SERVER_RESERVE_MB = Math.max(60, Number(process.env.SERVER_RESERVE_MB) || 120);
const BOT_ESTIMATE_MB   = Math.max(64, Number(process.env.BOT_CHILD_HEAP_MB)  || 256);

function getFreeMemMB() {
    return Math.floor(os.freemem() / 1024 / 1024);
}

function getTotalMemMB() {
    return Math.floor(os.totalmem() / 1024 / 1024);
}

function getUsedMemMB() {
    return getTotalMemMB() - getFreeMemMB();
}

/** 0-100 percentage of RAM currently in use */
function getMemPressurePct() {
    const total = getTotalMemMB();
    if (!total) return 0;
    return Math.round((getUsedMemMB() / total) * 100);
}

/**
 * Returns true if there is enough free RAM to safely spawn another bot child.
 * Formula: free memory > server reserve + one bot's estimated heap.
 */
function canSpawnBot() {
    return getFreeMemMB() >= (SERVER_RESERVE_MB + BOT_ESTIMATE_MB);
}

/** Human-readable memory summary for log lines */
function getMemSummary() {
    const free  = getFreeMemMB();
    const total = getTotalMemMB();
    const pct   = getMemPressurePct();
    return `RAM ${total - free}/${total} MB used (${pct}%) — ${free} MB free`;
}

module.exports = {
    getFreeMemMB,
    getTotalMemMB,
    getUsedMemMB,
    getMemPressurePct,
    canSpawnBot,
    getMemSummary,
    SERVER_RESERVE_MB,
    BOT_ESTIMATE_MB,
};
