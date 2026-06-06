'use strict';

/**
 * Worker-only: process DB pairing queue (web dyno cannot run pair.js on Heroku).
 */
async function processPairingQueue() {
    if (process.env.WHATSAPP_WORKER !== '1') return;

    try {
        const {
            getPendingPairingRequests,
            markPairingInProgress,
            getPairingState,
        } = require('../server/db-service');

        const pending = await getPendingPairingRequests();
        if (!pending.length) return;

        if (!global._pairingInFlight) global._pairingInFlight = new Set();

        for (const clean of pending) {
            if (!clean || global._pairingInFlight.has(clean)) continue;

            const state = await getPairingState(clean).catch(() => null);
            if (state?.pairingStatus === 'code_ready' || state?.status === 'active') continue;

            const claimed = await markPairingInProgress(clean).catch(() => false);
            if (!claimed) continue;

            global._pairingInFlight.add(clean);
            const jid = `${clean}@s.whatsapp.net`;

            (async () => {
                try {
                    const { removeFromStoppedBots } = require('../allfunc/stopped-bots');
                    removeFromStoppedBots(clean);

                    const sessionPath = require('path').join(__dirname, '..', 'nexstore', 'pairing', jid);
                    const fs = require('fs');
                    if (fs.existsSync(sessionPath)) {
                        const deleteFolder = (p) => {
                            if (!fs.existsSync(p)) return;
                            for (const f of fs.readdirSync(p)) {
                                const cur = require('path').join(p, f);
                                if (fs.lstatSync(cur).isDirectory()) deleteFolder(cur);
                                else fs.unlinkSync(cur);
                            }
                            try { fs.rmdirSync(p); } catch (_) {}
                        };
                        deleteFolder(sessionPath);
                    }

                    try {
                        const { deleteSessionCreds } = require('../session-db');
                        await deleteSessionCreds(clean);
                    } catch (_) {}

                    const pair = require('../pair');
                    await pair(jid);
                } catch (err) {
                    console.error(`[PairingQueue] Failed for ${clean}:`, err.message);
                    try {
                        const { resetPairingRequest } = require('../server/db-service');
                        await resetPairingRequest(clean);
                    } catch (_) {}
                } finally {
                    global._pairingInFlight.delete(clean);
                }
            })();
        }
    } catch (err) {
        console.error('[PairingQueue] Error:', err.message);
    }
}

function startPairingProcessor(intervalMs = 3000) {
    if (process.env.WHATSAPP_WORKER !== '1') return null;
    setTimeout(() => processPairingQueue().catch(() => {}), 5000);
    const timer = setInterval(() => processPairingQueue().catch(() => {}), intervalMs);
    console.log(`[PairingQueue] Worker pairing processor started (${intervalMs / 1000}s)`);
    return timer;
}

module.exports = { processPairingQueue, startPairingProcessor };
