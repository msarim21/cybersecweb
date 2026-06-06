'use strict';

/**
 * Worker-only: process DB pairing queue (web dyno cannot run pair.js on Heroku).
 * IMPORTANT: Never wipe existing session creds for linked numbers — only fresh pairs.
 */
async function processPairingQueue() {
    if (process.env.WHATSAPP_WORKER !== '1') return;

    try {
        const {
            getPendingPairingRequests,
            markPairingInProgress,
            getPairingState,
            getAllActiveLinkedNumbers,
            getSessionCreds,
            clearPairingRequest,
        } = require('../server/db-service');

        const pending = await getPendingPairingRequests();
        if (!pending.length) return;

        if (!global._pairingInFlight) global._pairingInFlight = new Set();
        const linkedSet = new Set(
            (await getAllActiveLinkedNumbers().catch(() => [])).map((n) => String(n).replace(/[^0-9]/g, ''))
        );

        for (const clean of pending) {
            if (!clean || global._pairingInFlight.has(clean)) continue;

            const jid = `${clean}@s.whatsapp.net`;
            const tracker = global._rentbotTracker?.get(jid) || global._rentbotTracker?.get(clean);
            const ws = tracker?.connection?.ws;
            if (ws && (ws.readyState === 0 || ws.readyState === 1)) {
                await clearPairingRequest(clean).catch(() => {});
                continue;
            }

            const state = await getPairingState(clean).catch(() => null);
            if (state?.status === 'active' && state?.pairingStatus !== 'requested') {
                await clearPairingRequest(clean).catch(() => {});
                continue;
            }

            const creds = await getSessionCreds(clean).catch(() => null);
            const hasDbCreds = creds && Object.keys(creds).length > 0;

            // Linked number with saved creds = stale queue entry → reconnect, DO NOT wipe
            if (linkedSet.has(clean) && hasDbCreds) {
                await clearPairingRequest(clean).catch(() => {});
                if (global._pairingInFlight.has(clean)) continue;
                global._pairingInFlight.add(clean);
                (async () => {
                    try {
                        const { restoreCredsFromDb } = require('../session-db');
                        const sessionPath = require('path').join(__dirname, '..', 'nexstore', 'pairing', jid);
                        await restoreCredsFromDb(clean, sessionPath);
                        const pair = require('../pair');
                        await pair(jid);
                    } catch (err) {
                        console.error(`[PairingQueue] Reconnect ${clean} failed:`, err.message);
                    } finally {
                        global._pairingInFlight.delete(clean);
                    }
                })();
                continue;
            }

            const claimed = await markPairingInProgress(clean).catch(() => false);
            if (!claimed) continue;

            global._pairingInFlight.add(clean);

            (async () => {
                try {
                    const { removeFromStoppedBots } = require('../allfunc/stopped-bots');
                    removeFromStoppedBots(clean);

                    const sessionPath = require('path').join(__dirname, '..', 'nexstore', 'pairing', jid);
                    const fs = require('fs');

                    // Fresh pairing only — wipe when no DB creds (user requested new pair code)
                    if (!hasDbCreds) {
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
                    }

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
    setTimeout(() => processPairingQueue().catch(() => {}), 15000);
    const timer = setInterval(() => processPairingQueue().catch(() => {}), intervalMs);
    console.log(`[PairingQueue] Worker pairing processor started (${intervalMs / 1000}s, delayed 15s after boot)`);
    return timer;
}

module.exports = { processPairingQueue, startPairingProcessor };
