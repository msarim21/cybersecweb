'use strict';

/** How long cached messages survive (memory, disk load, Mongo TTL, media files). Default: 7 days. */
const ANTIDELETE_RETENTION_DAYS = Math.max(
    1,
    Number(process.env.ANTIDELETE_RETENTION_DAYS) || 7
);
const ANTIDELETE_RETENTION_MS = ANTIDELETE_RETENTION_DAYS * 24 * 60 * 60 * 1000;

/** LRU cap — busy groups may evict oldest before TTL; raise for long silence windows. */
const ANTIDELETE_MAX_ENTRIES = Math.max(
    500,
    Number(process.env.ANTIDELETE_MAX_ENTRIES) || 5000
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
