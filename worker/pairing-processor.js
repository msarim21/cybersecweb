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
 * Process the DB pairing queue on whichever dyno is configured as the single
 * WhatsApp host. In the production web-only formation this runs inside the web
 * process, so the API route and pairing socket share one owner and filesystem.
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
    // The interval timer can overlap while a database query is in flight.
    // Serialize the claim phase so two ticks cannot each claim a different
    // number before _pairingProcessorBusy is set for the first runtime.
    if (global._pairingProcessorTickBusy) return true;
    global._pairingProcessorTickBusy = true;

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
        // A WhatsApp registration code is socket-scoped. Even though each
        // number has its own request record, opening two registration sockets
        // at the same time makes Baileys/WhatsApp invalidate one of them.
        // Keep the queue durable in the database and claim only one request;
        // the next interval will pick up the next number after this runtime
        // reaches connection.open or fails.
        if (global._pairingProcessorBusy) return true;

        for (const clean of pending) {
            if (!clean) continue;

            // Supersede stale pairing child when user requests a fresh code.
            if (global._pairingInFlight.has(clean)) {
                try {
                    const { killBot, isSupervisorActive } = require('./supervisor');
                    if (isSupervisorActive()) {
                        killBot(clean, 'SIGKILL');
                    } else if (global._pairingChildPids?.get(clean)) {
                        try { global._pairingChildPids.get(clean).kill('SIGKILL'); } catch (_) {}
                        global._pairingChildPids.delete(clean);
                    }
                } catch (_) {}
                global._pairingInFlight.delete(clean);
                await new Promise((r) => setTimeout(r, 500));
            }

            // Skip if bot is already linked/active — no new pairing code needed.
            // Check linked_numbers first (definitive source of truth): a number that is
            // already active there should NEVER receive another pairing code regardless of
            // what bot_sessions.connectionStatus says (it may be blank after a dyno restart).
            try {
                const {
                    getBotSessionsByNumbers,
                    clearPairingRequest,
                    isNumberInLinkedNumbers,
                } = require('../server/db-service');

                const alreadyLinked = await isNumberInLinkedNumbers(clean).catch(() => false);
                if (alreadyLinked) {
                    console.log(`[PairingQueue] ${clean} is already in linked_numbers — clearing stale pairing request`);
                    await clearPairingRequest(clean).catch(() => {});
                    continue;
                }

                // Fallback: check live connection status in bot_sessions
                const sessMap = await getBotSessionsByNumbers([clean]).catch(() => ({}));
                const sess = sessMap[clean];
                if (sess?.connectionStatus === 'CONNECTED' && sess?.status === 'active') {
                    await clearPairingRequest(clean).catch(() => {});
                    continue;
                }
            } catch (_) {}

            const claimed = await markPairingInProgress(clean).catch(() => false);
            if (!claimed) continue;

            global._pairingProcessorBusy = true;
            (async () => {
                try {
                    const { logBotEvent } = require('../allfunc/bot-lifecycle');
                    logBotEvent(clean, 'pair_request_received', { source: 'pairing-processor' });

                    // Isolated mode: supervisor spawns a dedicated pairing child
                    const { isSupervisorActive, handlePairingRequest } = require('./supervisor');
                    if (isSupervisorActive()) {
                        await handlePairingRequest(clean);
                        return;
                    }

                    global._pairingInFlight.add(clean);

                    const { fork } = require('child_process');
                    const runner = path.join(__dirname, 'bot-runner.js');
                    const { removeFromStoppedBots } = require('../allfunc/stopped-bots');
                    removeFromStoppedBots(clean);

                    // Use clean digits only — no @s.whatsapp.net suffix
                    const sessionPath = path.join(__dirname, '..', 'nexstore', 'pairing', clean);

                    // RECONNECT LOOP FIX: Before wiping creds, check if valid session
                    // creds exist in DB. If they do, restart bot via autoload instead of
                    // doing a destructive fresh pairing (which causes infinite reconnect loops).
                    let hasValidDbCreds = false;
                    try {
                        const { restoreCredsFromDb } = require('../session-db');
                        hasValidDbCreds = await restoreCredsFromDb(clean, sessionPath).catch(() => false);
                    } catch (_) {}

                    if (hasValidDbCreds) {
                        console.log(`[PairingQueue] ${clean} has valid session creds in DB — restarting bot instead of fresh pairing`);
                        try {
                            const { clearPairingRequest } = require('../server/db-service');
                            await clearPairingRequest(clean).catch(() => {});
                        } catch (_) {}
                        global._pairingInFlight.delete(clean);
                        try {
                            const { autoLoadPairs } = require('../autoload');
                            await autoLoadPairs({ concurrent: true }).catch(() => {});
                        } catch (_) {}
                        return;
                    }

                    // No valid creds in DB — proceed with destructive fresh pairing
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

                    const child = fork(runner, [clean], {
                        env: {
                            ...process.env,
                            WHATSAPP_WORKER: '1',
                            BOT_ISOLATION: '1',
                            BOT_NUMBER: clean,
                            BOT_PAIRING: '1',
                        },
                        stdio: 'inherit',
                        cwd: path.join(__dirname, '..'),
                    });
                    if (!global._pairingChildPids) global._pairingChildPids = new Map();
                    global._pairingChildPids.set(clean, child);
                    child.on('exit', () => global._pairingChildPids?.delete(clean));

                    // Phase 1: Wait for pairing code (max 90s)
                    const codeDeadline = Date.now() + 90_000;
                    while (Date.now() < codeDeadline) {
                        const st = await getPairingState(clean).catch(() => null);
                        if (st?.code || st?.status === 'active') break;
                        await new Promise((r) => setTimeout(r, 400));
                    }

                    // Phase 2: Wait for user to enter code → bot becomes active (max 3 min)
                    // Once active, kill the pairing child so the parent process manages the
                    // bot via autoload. Running in the parent avoids Error 440 caused by
                    // the parent keepalive triggering autoload on an already-connected child.
                    const connectDeadline = Date.now() + 180_000;
                    while (Date.now() < connectDeadline) {
                        const st = await getPairingState(clean).catch(() => null);
                        if (st?.status === 'active') {
                            // Give child 8s to flush Signal keys to DB before SIGTERM
                            await new Promise(r => setTimeout(r, 8000));
                            try { child.kill('SIGTERM'); } catch (_) {}
                            // Give parent autoload time to pick it up
                            await new Promise(r => setTimeout(r, 5000));
                            try {
                                const { autoLoadPairs } = require('../autoload');
                                autoLoadPairs({ concurrent: true }).catch(() => {});
                            } catch (_) {}
                            break;
                        }
                        // Bot session expired or failed — stop waiting
                        if (st?.status === 'failed' || !st) break;
                        await new Promise((r) => setTimeout(r, 1000));
                    }
                } catch (err) {
                    console.error(`[PairingQueue] Failed for ${clean}:`, err.message);
                    try {
                        await markPairingFailed(clean, `Pairing processor error: ${err.message}`);
                    } catch (_) {}
                } finally {
                    global._pairingInFlight.delete(clean);
                    global._pairingProcessorBusy = false;
                }
            })();
            // Do not claim another request during this poll. The runtime above
            // owns the only registration socket until its full login handoff
            // completes.
            break;
        }
        return true;
    } catch (err) {
        console.error('[PairingQueue] Error:', err.message);
        return false;
    } finally {
        global._pairingProcessorTickBusy = false;
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
    const host = require('../allfunc/whatsapp-host').getWhatsAppHostDyno();
    console.log(`[PairingQueue] Web-owned pairing processor started on ${host} dyno (${intervalMs}ms fast poll)`);
    return timer;
}

module.exports = { processPairingQueue, startPairingProcessor };
