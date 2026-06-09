'use strict';

/**
 * Wake stale WhatsApp sockets after idle — fixes:
 * - first antidelete alert missing after ~1h silence (and multi-day silence)
 * - first command taking ~1 minute
 */

const IDLE_WARM_MS = Number(process.env.WA_IDLE_WARM_MS) || 60 * 1000;
const LONG_IDLE_LOG_MS = 60 * 60 * 1000;

async function ensureWhatsAppSocketHot(nexus, tracker, opts = {}) {
    if (!nexus?.user) return false;

    const last = tracker?.lastWAMessage || tracker?.lastActivity || 0;
    const silentMs = last ? Date.now() - last : Infinity;
    const force = Boolean(opts.force);
    if (!force && silentMs < IDLE_WARM_MS) return true;

    let woke = false;
    try {
        await Promise.race([
            nexus.sendPresenceUpdate('available').then(() => { woke = true; }),
            new Promise((_, rej) => setTimeout(() => rej(new Error('presence timeout')), 10_000)),
        ]);
    } catch (_) {}

    if (!woke) return false;
    if (tracker) tracker.lastActivity = Date.now();

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

/** Proactive wake for all connected bots — keeps delete events flowing during long silence. */
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

module.exports = { ensureWhatsAppSocketHot, wakeAllAntideleteSockets, IDLE_WARM_MS };
