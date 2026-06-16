'use strict';

/** Message cache TTL on disk/memory/Mongo/media. Default: 24 hours only. */
const ANTIDELETE_RETENTION_DAYS = Math.max(
    1,
    Number(process.env.ANTIDELETE_RETENTION_DAYS) || 1
);
const ANTIDELETE_RETENTION_MS = ANTIDELETE_RETENTION_DAYS * 24 * 60 * 60 * 1000;

/** LRU cap per bot — oldest dropped when full.
 *  Default 300 to keep per-bot memory low (~5 MB vs ~50 MB at 2000).
 *  Override via ANTIDELETE_MAX_ENTRIES env var (e.g. 1000 for more history). */
const ANTIDELETE_MAX_ENTRIES = Math.max(
    100,
    Number(process.env.ANTIDELETE_MAX_ENTRIES) || 300
);

function getRetentionCutoffTs(now = Date.now()) {
    return now - ANTIDELETE_RETENTION_MS;
}

function isEntryExpired(entry, now = Date.now()) {
    if (!entry) return true;
    const ts = entry._ts
        || (entry.timestamp ? new Date(entry.timestamp).getTime() : 0);
    if (!ts) return false;
    return now - ts > ANTIDELETE_RETENTION_MS;
}

module.exports = {
    ANTIDELETE_RETENTION_DAYS,
    ANTIDELETE_RETENTION_MS,
    ANTIDELETE_MAX_ENTRIES,
    getRetentionCutoffTs,
    isEntryExpired,
};
