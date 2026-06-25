'use strict';

/**
 * db-cleanup.js — Auto-cleanup job for MongoDB
 * ─────────────────────────────────────────────
 * Runs two cleanup tasks on a schedule:
 *
 *  1. antideletecaches  — deletes docs older than ANTIDELETE_RETENTION_DAYS (default 1 day).
 *     MongoDB TTL index handles most of it, but this is a safety net in case
 *     TTL daemon misses anything (network blip, restart, etc.).
 *
 *  2. Orphan antidelete entries — caps collection at MAX_ANTIDELETE_DOCS (default 500)
 *     by removing oldest extras when the cap is exceeded.
 *
 *  Schedule: every day at 03:00 AM UTC (configurable via DB_CLEANUP_CRON env var)
 *  Default:  '0 3 * * *'
 */

const cron = require('node-cron');

const DEFAULT_CRON      = process.env.DB_CLEANUP_CRON     || '0 3 * * *';
const MAX_ANTIDELETE    = parseInt(process.env.MAX_ANTIDELETE_DOCS, 10) || 500;
const RETENTION_DAYS    = Math.max(1, parseInt(process.env.ANTIDELETE_RETENTION_DAYS, 10) || 1);
const RETENTION_MS      = RETENTION_DAYS * 24 * 60 * 60 * 1000;

let _cleanupRunning = false;

async function runCleanup() {
    if (_cleanupRunning) {
        console.log('[db-cleanup] Previous run still in progress — skipping');
        return;
    }
    _cleanupRunning = true;
    const startTime = Date.now();
    console.log('[db-cleanup] ▶ Starting scheduled DB cleanup...');

    try {
        const { isMongoMode, getPool } = require('../server/db');

        if (isMongoMode()) {
            await _cleanMongo();
        } else {
            await _cleanPostgres(getPool());
        }

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[db-cleanup] ✅ Done in ${elapsed}s`);
    } catch (err) {
        console.error('[db-cleanup] ❌ Cleanup error:', err.message);
    } finally {
        _cleanupRunning = false;
    }
}

async function _cleanMongo() {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) {
        console.log('[db-cleanup] MongoDB not ready — skipping');
        return;
    }

    const db = mongoose.connection.db;
    const col = db.collection('antideletecaches');

    // 1. Delete docs where expiresAt has passed (safety net for TTL daemon)
    const cutoff = new Date(Date.now() - RETENTION_MS);
    const expiredResult = await col.deleteMany({
        $or: [
            { expiresAt: { $lt: new Date() } },                    // TTL field expired
            { createdAt: { $lt: cutoff } },                        // older than retention window
            { updatedAt: { $lt: cutoff } },
        ]
    }).catch(e => { console.warn('[db-cleanup] expiry delete warn:', e.message); return { deletedCount: 0 }; });

    console.log(`[db-cleanup] Mongo: deleted ${expiredResult.deletedCount} expired antideletecache docs`);

    // 2. Cap at MAX_ANTIDELETE — delete oldest if over cap
    const total = await col.countDocuments().catch(() => 0);
    if (total > MAX_ANTIDELETE) {
        const excess = total - MAX_ANTIDELETE;
        // Get the _ids of the oldest `excess` docs via allowDiskUse
        const oldest = await col.find({})
            .sort({ createdAt: 1 })
            .limit(excess)
            .project({ _id: 1 })
            .allowDiskUse(true)
            .toArray()
            .catch(() => []);

        if (oldest.length > 0) {
            const ids = oldest.map(d => d._id);
            const capResult = await col.deleteMany({ _id: { $in: ids } })
                .catch(e => { console.warn('[db-cleanup] cap delete warn:', e.message); return { deletedCount: 0 }; });
            console.log(`[db-cleanup] Mongo: trimmed ${capResult.deletedCount} excess antideletecache docs (cap=${MAX_ANTIDELETE})`);
        }
    } else {
        console.log(`[db-cleanup] Mongo: antideletecaches within cap (${total}/${MAX_ANTIDELETE}) — no trim needed`);
    }

    // 3. Report final size
    const remaining = await col.countDocuments().catch(() => '?');
    console.log(`[db-cleanup] Mongo: antideletecaches remaining: ${remaining}`);
}

async function _cleanPostgres(pool) {
    if (!pool) {
        console.log('[db-cleanup] PostgreSQL pool not ready — skipping');
        return;
    }
    // PostgreSQL doesn't have a TTL index — manually prune old session logs or temp data if needed
    console.log('[db-cleanup] PostgreSQL: no antideleteache table (in-memory/disk only) — nothing to clean');
}

/**
 * Start the cleanup cron job.
 * Called once from server/index.js after DB is initialised.
 */
function startDbCleanupJob() {
    if (!cron.validate(DEFAULT_CRON)) {
        console.error(`[db-cleanup] Invalid cron expression: "${DEFAULT_CRON}" — job not started`);
        return;
    }

    cron.schedule(DEFAULT_CRON, () => {
        runCleanup().catch(err => console.error('[db-cleanup] Unhandled error:', err.message));
    }, { timezone: 'UTC' });

    console.log(`✅ DB auto-cleanup job scheduled: "${DEFAULT_CRON}" UTC (retention=${RETENTION_DAYS}d, cap=${MAX_ANTIDELETE} docs)`);

    // Also run once at startup after a short delay (cleans any leftover bloat immediately)
    setTimeout(() => {
        console.log('[db-cleanup] Running startup cleanup pass...');
        runCleanup().catch(err => console.error('[db-cleanup] Startup cleanup error:', err.message));
    }, 15_000);
}

module.exports = { startDbCleanupJob, runCleanup };
