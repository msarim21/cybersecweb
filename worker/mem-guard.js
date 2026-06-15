'use strict';

const os = require('os');
const fs = require('fs');

/**
 * Memory guard — prevents OOM crashes by checking available RAM before spawning.
 *
 * IMPORTANT: Uses /proc/meminfo MemAvailable on Linux (Heroku) instead of
 * os.freemem(), because os.freemem() only counts truly-free pages and ignores
 * cached/buffered memory that the OS can instantly reclaim. On a Heroku dyno
 * os.freemem() can show only 10-30 MB "free" even with 300 MB actually available,
 * which would block ALL bots from starting. MemAvailable is the correct metric.
 *
 * Env vars (all optional):
 *   MAX_MEM_PERCENT     — stop spawning when total usage exceeds this %   (default: 88)
 *   BOT_ROTATION_HOURS  — hours between automatic bot rotation cycles     (default: 6)
 */

const MAX_MEM_PERCENT = Math.min(98, Math.max(50, Number(process.env.MAX_MEM_PERCENT) || 88));

/**
 * Returns available memory in MB.
 * On Linux: reads MemAvailable from /proc/meminfo (accurate, includes reclaimable cache).
 * On other platforms: falls back to os.freemem().
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
 * Returns true when it is safe to spawn another bot child process.
 * Blocks only when overall memory usage exceeds MAX_MEM_PERCENT.
 * This prevents OOM kills without blocking bots on healthy dynos.
 */
function canSpawnBot() {
    return getMemPressurePct() < MAX_MEM_PERCENT;
}

/** Human-readable memory summary for log lines */
function getMemSummary() {
    const avail = getAvailableMemMB();
    const total = getTotalMemMB();
    const pct   = getMemPressurePct();
    return `RAM ${total - avail}/${total} MB used (${pct}%) — ${avail} MB avail`;
}

module.exports = {
    getAvailableMemMB,
    getTotalMemMB,
    getUsedMemMB,
    getMemPressurePct,
    canSpawnBot,
    getMemSummary,
    MAX_MEM_PERCENT,
};
