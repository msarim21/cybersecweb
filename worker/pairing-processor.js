'use strict';

const path = require('path');
const fs = require('fs');

function deleteFolderRecursive(p) {
    if (!fs.existsSync(p)) return;
    for (const f of fs.readdirSync(p)) {
        const cur = path.join(p, f);
        if (fs.lstatSync(cur).isDirectory()) deleteFolderRecursive(cur);
        else fs.unlinkSync(cur);
    }
    try { fs.rmdirSync(p); } catch (_) {}
}

/**
 * Worker-only: process DB pairing queue (web dyno cannot run pair.js on Heroku).
 * When pairing_status = 'requested', ALWAYS generate a fresh pairing code:
 * stop socket → wipe FS session → delete DB creds → pair().
 */
async function processPairingQueue() {
    if (process.env.WHATSAPP_WORKER !== '1') return;

    try {
        const {
            getPendingPairingRequests,
            markPairingInProgress,
            resetPairingRequest,
        } = require('../server/db-service');

        const pending = await getPendingPairingRequests();
        if (!pending.length) return;

        if (!global._pairingInFlight) global._pairingInFlight = new Set();

        for (const clean of pending) {
            if (!clean || global._pairingInFlight.has(clean)) continue;

            const claimed = await markPairingInProgress(clean).catch(() => false);
            if (!claimed) continue;

            global._pairingInFlight.add(clean);

            (async () => {
                const jid = `${clean}@s.whatsapp.net`;
                try {
                    const { removeFromStoppedBots } = require('../allfunc/stopped-bots');
                    removeFromStoppedBots(clean);

                    const pairMod = require('../pair');
                    if (typeof pairMod.stopBot === 'function') {
                        pairMod.stopBot(jid);
                        pairMod.stopBot(clean);
                    }
                    if (typeof pairMod.clearSession === 'function') {
                        pairMod.clearSession(clean);
                    }

                    const sessionPath = path.join(__dirname, '..', 'nexstore', 'pairing', jid);
                    if (fs.existsSync(sessionPath)) {
                        deleteFolderRecursive(sessionPath);
                    }

                    try {
                        const { deleteSessionCreds } = require('../session-db');
                        await deleteSessionCreds(clean);
                    } catch (_) {}

                    try {
                        const pairingJson = path.join(__dirname, '..', 'nexstore', 'pairing', 'pairing.json');
                        if (fs.existsSync(pairingJson)) fs.unlinkSync(pairingJson);
                    } catch (_) {}

                    await new Promise((r) => setTimeout(r, 1500));

                    await pairMod(jid);
                } catch (err) {
                    console.error(`[PairingQueue] Failed for ${clean}:`, err.message);
                    try {
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

function startPairingProcessor(intervalMs = 2000) {
    if (process.env.WHATSAPP_WORKER !== '1') return null;
    setTimeout(() => processPairingQueue().catch(() => {}), 2000);
    const timer = setInterval(() => processPairingQueue().catch(() => {}), intervalMs);
    console.log(`[PairingQueue] Worker pairing processor started (${intervalMs / 1000}s poll)`);
    return timer;
}

module.exports = { processPairingQueue, startPairingProcessor };
