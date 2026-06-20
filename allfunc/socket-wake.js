'use strict';

/**
 * Wake stale WhatsApp sockets after idle — fixes:
 * - first antidelete alert missing after ~1h silence (and multi-day silence)
 * - first command taking ~1 minute
 */

const IDLE_WARM_MS = Number(process.env.WA_IDLE_WARM_MS) || 60 * 1000;
const LONG_IDLE_LOG_MS = 60 * 60 * 1000;
const PRESENCE_TIMEOUT_MS = Number(process.env.WA_PRESENCE_TIMEOUT_MS) || 4000;
const HEAVY_PRESENCE_TIMEOUT_MS = 8000;

/** Fast presence-only wake — safe on command hot path and 60s keepalive ticks */
async function lightWakeSocket(nexus, tracker) {
    if (!nexus?.user) return false;
    try {
        await Promise.race([
            nexus.sendPresenceUpdate('available'),
            new Promise((_, rej) => setTimeout(() => rej(new Error('presence timeout')), PRESENCE_TIMEOUT_MS)),
        ]);
        if (tracker) tracker.lastActivity = Date.now();
        return true;
    } catch (_) {
        return false;
    }
}

async function ensureWhatsAppSocketHot(nexus, tracker, opts = {}) {
    if (!nexus?.user) return false;

    const last = tracker?.lastWAMessage || tracker?.lastActivity || 0;
    const silentMs = last ? Date.now() - last : Infinity;
    const force = Boolean(opts.force);
    const light = Boolean(opts.light);
    if (!force && silentMs < IDLE_WARM_MS) return true;

    if (light) {
        return lightWakeSocket(nexus, tracker);
    }

    let woke = false;
    try {
        await Promise.race([
            nexus.sendPresenceUpdate('available').then(() => { woke = true; }),
            new Promise((_, rej) => setTimeout(() => rej(new Error('presence timeout')), HEAVY_PRESENCE_TIMEOUT_MS)),
        ]);
    } catch (_) {}

    // Refresh antidelete disk cache — background only (never block commands)
    void (async () => {
        try {
            const botNumEarly = typeof global._adResolveBotNum === 'function'
                ? global._adResolveBotNum(nexus)
                : String(nexus._sessionPhoneNumber || '').replace(/[^0-9]/g, '');
            if (botNumEarly) {
                const { getAntideleteSession } = require('./antidelete-session');
                getAntideleteSession(botNumEarly)?.refreshFromDisk();
            }
        } catch (_) {}
    })();

    if (!woke) return false;
    if (tracker) tracker.lastActivity = Date.now();

    void (async () => {
        try {
            const { initDb, isDbReady, isMongoMode } = require('../server/db');
            if (isMongoMode() && !isDbReady()) await initDb().catch(() => {});
            if (isMongoMode()) {
                const mongoose = require('mongoose');
                if (mongoose.connection?.db) await mongoose.connection.db.admin().ping().catch(() => {});
            }
        } catch (_) {}

        try {
            const botNum = typeof global._adResolveBotNum === 'function'
                ? global._adResolveBotNum(nexus)
                : String(nexus._sessionPhoneNumber || '').replace(/[^0-9]/g, '');
            if (botNum) {
                const { getAntideleteSession } = require('./antidelete-session');
                const session = getAntideleteSession(botNum);
                if (session?.refreshFromDisk) session.refreshFromDisk();

                if (force && typeof global._adFlushMongoSavesNow === 'function') {
                    await global._adFlushMongoSavesNow().catch(() => {});
                }
                if (force && typeof global._adFlushPendingReports === 'function') {
                    const jid = nexus._cachedBotNumber || `${botNum}@s.whatsapp.net`;
                    await global._adFlushPendingReports(nexus, botNum, jid).catch(() => {});
                }
            }
        } catch (_) {}
    })();

    if (silentMs >= LONG_IDLE_LOG_MS) {
        const clean = String(nexus._sessionPhoneNumber || '').replace(/[^0-9]/g, '') || '?';
        const unit = silentMs >= 24 * 60 * 60 * 1000 ? 'd' : 'h';
        const val = unit === 'd'
            ? Math.round(silentMs / (24 * 60 * 60 * 1000))
            : Math.round(silentMs / (60 * 60 * 1000));
        console.log(`[SocketWake] ✅ Hot after ${val}${unit} idle (+${clean})`);
    }
    return true;
}

/** Light presence wake for all bots — keeps WA delivering messages after hours of silence */
async function wakeAllSocketsLight(trackerMap) {
    if (!trackerMap?.size) return 0;
    let n = 0;
    for (const [, tracker] of trackerMap.entries()) {
        if (!tracker || tracker.disconnected) continue;
        const nexus = tracker.connection;
        if (!nexus?.user) continue;
        if ((nexus.ws?.readyState ?? -1) !== 1) continue;
        const ok = await lightWakeSocket(nexus, tracker).catch(() => false);
        if (ok) n++;
    }
    return n;
}

/** Proactive wake for all connected bots — heavy path for antidelete disk/mongo refresh */
async function wakeAllAntideleteSockets(trackerMap) {
    if (!trackerMap?.size) return 0;
    let n = 0;
    for (const [, tracker] of trackerMap.entries()) {
        if (!tracker || tracker.disconnected) continue;
        const nexus = tracker.connection;
        if (!nexus?.user) continue;
        const wsState = nexus.ws?.readyState ?? -1;
        if (wsState !== 1) continue;
        const ok = await ensureWhatsAppSocketHot(nexus, tracker, { force: true }).catch(() => false);
        if (ok) n++;
    }
    return n;
}

module.exports = {
    ensureWhatsAppSocketHot,
    lightWakeSocket,
    wakeAllSocketsLight,
    wakeAllAntideleteSockets,
    IDLE_WARM_MS,
};
