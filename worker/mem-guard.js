'use strict';

const os = require('os');
const fs = require('fs');

/**
 * Memory guard — prevents OOM crashes by checking available RAM before spawning.
 *
 * On Heroku, /proc/meminfo and os.totalmem() reflect the HOST machine (e.g. 63 GB),
 * not the dyno container limit (512 MB Eco). Use DYNO_TOTAL_RAM_MB env var to tell
 * the guard the real dyno size. It then projects usage as:
 *   parent RSS  +  (activeChildCount × BOT_CHILD_HEAP_MB)
 * and blocks spawning when that projection exceeds MAX_MEM_PERCENT of the dyno limit.
 *
 * Env vars (all optional):
 *   DYNO_TOTAL_RAM_MB   — actual dyno RAM ceiling (default: 512 for Heroku Eco)
 *   MAX_MEM_PERCENT     — stop spawning when projected usage exceeds this %  (default: 78)
 *   BOT_CHILD_HEAP_MB   — estimated RSS per bot child process in MB           (default: 130)
 *   BOT_ROTATION_HOURS  — hours between automatic bot rotation cycles         (default: 6)
 */

const MAX_MEM_PERCENT = Math.min(95, Math.max(50, Number(process.env.MAX_MEM_PERCENT) || 78));

/**
 * Returns available memory in MB.
 * On Linux: reads MemAvailable from /proc/meminfo (accurate, includes reclaimable cache).
 * On other platforms: falls back to os.freemem().
 * NOTE: On Heroku this reflects HOST machine memory, not dyno limit.
 */
function getAvailableMemMB() {
    try {
        if (process.platform === 'linux') {
            const info = fs.readFileSync('/proc/meminfo', 'utf8');
            const match = info.match(/^MemAvailable:\s+(\d+)\s+kB/m);
            if (match) return Math.floor(parseInt(match[1], 10) / 1024);
        }
    } catch (_) {}
    return Math.floor(os.freemem() / 1024 / 1024);
}

function getTotalMemMB() {
    return Math.floor(os.totalmem() / 1024 / 1024);
}

function getUsedMemMB() {
    return getTotalMemMB() - getAvailableMemMB();
}

/** 0-100 percentage of RAM currently in use (based on available, not just free) */
function getMemPressurePct() {
    const total = getTotalMemMB();
    if (!total) return 0;
    return Math.round((getUsedMemMB() / total) * 100);
}

/**
 * Returns the dyno RAM ceiling in MB.
 * Set DYNO_TOTAL_RAM_MB in Heroku config vars to match your dyno size.
 * Defaults to 512 (Heroku Eco / Basic dyno).
 */
function getDynoLimitMB() {
    return Number(process.env.DYNO_TOTAL_RAM_MB) || 512;
}

/**
 * Returns the current process RSS in MB (parent server process only).
 */
function getParentRssMB() {
    return Math.floor(process.memoryUsage().rss / 1024 / 1024);
}

/**
 * Projects total dyno memory usage:
 *   parent RSS  +  activeChildCount × estimated RSS per child
 */
function getProjectedDynoUsageMB(activeChildCount = 0) {
    const parentRss  = getParentRssMB();
    const childEstMB = Number(process.env.BOT_CHILD_HEAP_MB) || 130;
    return parentRss + (activeChildCount * childEstMB);
}

/**
 * Returns true when it is safe to spawn another bot child process.
 *
 * Uses dyno-aware projection (DYNO_TOTAL_RAM_MB) when set.
 * Falls back to host /proc/meminfo check for non-container environments.
 *
 * @param {number} activeChildCount — number of bot children currently running
 */
function canSpawnBot(activeChildCount = 0) {
    const dynoLimit = getDynoLimitMB();
    const thresholdMB = Math.floor(dynoLimit * (MAX_MEM_PERCENT / 100));
    const projectedMB = getProjectedDynoUsageMB(activeChildCount);
    return projectedMB < thresholdMB;
}

/** Human-readable memory summary for log lines (dyno-aware) */
function getMemSummary(activeChildCount = 0) {
    const dynoLimit   = getDynoLimitMB();
    const projected   = getProjectedDynoUsageMB(activeChildCount);
    const pct         = Math.round((projected / dynoLimit) * 100);
    const parentRss   = getParentRssMB();
    return `Dyno ~${projected}/${dynoLimit} MB projected (${pct}%) — parent RSS ${parentRss} MB`;
}

module.exports = {
    getAvailableMemMB,
    getTotalMemMB,
    getUsedMemMB,
    getMemPressurePct,
    getDynoLimitMB,
    getParentRssMB,
    getProjectedDynoUsageMB,
    canSpawnBot,
    getMemSummary,
    MAX_MEM_PERCENT,
};
