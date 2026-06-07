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
function isPairingHost() {
    try {
        const { shouldRunWhatsAppSupervisor } = require('../allfunc/whatsapp-host');
        return shouldRunWhatsAppSupervisor();
    } catch {
        return false;
    }
}

async function processPairingQueue() {
    if (!isPairingHost()) return false;

    try {
        const {
            getPendingPairingRequests,
            markPairingInProgress,
            resetPairingRequest,
            markPairingFailed,
            getPairingState,
        } = require('../server/db-service');

        const pending = await getPendingPairingRequests();
        if (!pending.length) return false;

        if (!global._pairingInFlight) global._pairingInFlight = new Set();

        for (const clean of pending) {
            if (!clean || global._pairingInFlight.has(clean)) continue;

            const claimed = await markPairingInProgress(clean).catch(() => false);
            if (!claimed) continue;

            (async () => {
                try {
                    // Isolated mode: supervisor spawns a dedicated pairing child
                    const { isSupervisorActive, handlePairingRequest } = require('./supervisor');
                    if (isSupervisorActive()) {
                        await handlePairingRequest(clean);
                        return;
                    }

                    global._pairingInFlight.add(clean);

                    const jid = `${clean}@s.whatsapp.net`;
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

                    pairMod(jid).catch((err) => {
                        console.error(`[PairingQueue] pair() error for ${clean}:`, err.message);
                    });

                    const deadline = Date.now() + 90_000;
                    while (Date.now() < deadline) {
                        const st = await getPairingState(clean).catch(() => null);
                        if (st?.code) break;
                        await new Promise((r) => setTimeout(r, 400));
                    }
                } catch (err) {
                    console.error(`[PairingQueue] Failed for ${clean}:`, err.message);
                    try {
                        await markPairingFailed(clean);
                    } catch (_) {}
                } finally {
                    global._pairingInFlight.delete(clean);
                }
            })();
        }
        return true;
    } catch (err) {
        console.error('[PairingQueue] Error:', err.message);
        return false;
    }
}

function startPairingProcessor(intervalMs = 150) {
    if (!isPairingHost()) return null;

    const tick = async () => {
        const hadWork = await processPairingQueue().catch(() => false);
        if (hadWork) {
            setTimeout(tick, 80);
        }
    };

    processPairingQueue().catch(() => {});
    const timer = setInterval(() => tick().catch(() => {}), intervalMs);
    console.log(`[PairingQueue] Worker pairing processor started (${intervalMs}ms fast poll)`);
    return timer;
}

module.exports = { processPairingQueue, startPairingProcessor };
