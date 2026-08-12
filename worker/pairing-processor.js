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

/**
 * Wait until a claimed number reaches a terminal pairing outcome (active/failed)
 * or the deadline passes. Used in supervisor mode so only one registration
 * socket is ever open at a time.
 */
async function waitForPairingOutcome(clean, getPairingState, timeoutMs = 240_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const st = await getPairingState(clean).catch(() => null);
        if (!st) break;
        if (st.status === 'active' || st.status === 'failed') break;
        await new Promise((r) => setTimeout(r, 1000));
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
        // Watchdog: if a previous runtime crashed before releasing the lock,
        // the queue would stay blocked forever. Force-release after 5 minutes.
        if (global._pairingProcessorBusy) {
            const since = global._pairingProcessorBusySince || 0;
            if (since && Date.now() - since > 5 * 60_000) {
                console.warn('[PairingQueue] Busy lock held >5min — force releasing');
                global._pairingProcessorBusy = false;
                global._pairingProcessorBusySince = 0;
            } else {
                return true;
            }
        }

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
            global._pairingProcessorBusySince = Date.now();
            (async () => {
                try {
                    const { logBotEvent } = require('../allfunc/bot-lifecycle');
                    logBotEvent(clean, 'pair_request_received', { source: 'pairing-processor' });

                    // Isolated mode: supervisor spawns a dedicated pairing child
                    const { isSupervisorActive, handlePairingRequest } = require('./supervisor');
                    if (isSupervisorActive()) {
                        global._pairingInFlight.add(clean);
                        await handlePairingRequest(clean);
                        // Hold the single-socket lock until this number reaches a
                        // terminal outcome, otherwise the next tick opens a second
                        // registration socket and WhatsApp invalidates the code.
                        await waitForPairingOutcome(clean, getPairingState);
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

                    // No valid creds in DB — proceed with destructive fresh pairing.
                    // Wipe BOTH the digits folder and the legacy
                    // `<digits>@s.whatsapp.net` folder; leaving the legacy one
                    // behind made pair.js reuse stale auth keys and the phone
                    // answered "Couldn't link device".
                    const legacySessionPath = path.join(
                        __dirname, '..', 'nexstore', 'pairing', `${clean}@s.whatsapp.net`
                    );
                    if (fs.existsSync(sessionPath)) {
                        deleteFolderRecursive(sessionPath);
                    }
                    if (fs.existsSync(legacySessionPath)) {
                        deleteFolderRecursive(legacySessionPath);
                    }
                    try {
                        const staleCode = path.join(
                            __dirname, '..', 'nexstore', 'pairing', `pairing_${clean}.json`
                        );
                        if (fs.existsSync(staleCode)) fs.unlinkSync(staleCode);
                    } catch (_) {}

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
                    let activeChild = child;
                    if (!global._pairingChildPids) global._pairingChildPids = new Map();
                    global._pairingChildPids.set(clean, child);
                    child.on('exit', (code) => {
                        if (activeChild === child) {
                            global._pairingChildPids?.delete(clean);
                            activeChild = null;
                        }
                        // Exit code 75 = pairing accepted but WhatsApp closed the
                        // socket with 515 (restartRequired). Nothing else restarts
                        // this fork, so relaunch once WITHOUT pairing mode to
                        // finish login with the freshly registered credentials.
                        if (code !== 75) return;
                        try {
                            const restarted = fork(runner, [clean], {
                                env: {
                                    ...process.env,
                                    WHATSAPP_WORKER: '1',
                                    BOT_ISOLATION: '1',
                                    BOT_NUMBER: clean,
                                    BOT_PAIRING: '0',
                                },
                                stdio: 'inherit',
                                cwd: path.join(__dirname, '..'),
                            });
                            activeChild = restarted;
                            global._pairingChildPids.set(clean, restarted);
                            restarted.on('exit', () => {
                                if (activeChild !== restarted) return;
                                global._pairingChildPids?.delete(clean);
                                activeChild = null;
                            });
                        } catch (e) {
                            console.error(`[PairingQueue] Restart after pairing failed for ${clean}:`, e.message);
                        }
                    });

                    // Phase 1: Wait for pairing code (max 90s)
                    const codeDeadline = Date.now() + 90_000;
                    let gotCode = false;
                    while (Date.now() < codeDeadline) {
                        const st = await getPairingState(clean).catch(() => null);
                        if (st?.code || st?.status === 'active') { gotCode = true; break; }
                        await new Promise((r) => setTimeout(r, 400));
                    }

                    // No code within 90s means the registration socket is stuck.
                    // Kill it and surface a real error instead of leaving the UI
                    // spinning on CONNECTING forever.
                    if (!gotCode) {
                        try { activeChild?.kill('SIGKILL'); } catch (_) {}
                        await markPairingFailed(
                            clean,
                            'No pairing code issued within 90s — please try again'
                        ).catch(() => {});
                        return;
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
                            const childToStop = activeChild;
                            activeChild = null;
                            try { childToStop?.kill('SIGTERM'); } catch (_) {}
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

                    // Never leave the UI spinning: if the number never went
                    // active within the window, record a real failure.
                    try {
                        const finalSt = await getPairingState(clean).catch(() => null);
                        if (finalSt && finalSt.status !== 'active' && finalSt.status !== 'failed') {
                            try { activeChild?.kill('SIGKILL'); } catch (_) {}
                            await markPairingFailed(
                                clean,
                                'Pairing not completed in time — please request a new code'
                            ).catch(() => {});
                        }
                    } catch (_) {}
                } catch (err) {
                    console.error(`[PairingQueue] Failed for ${clean}:`, err.message);
                    try {
                        await markPairingFailed(clean, `Pairing processor error: ${err.message}`);
                    } catch (_) {}
                } finally {
                    const trackedChild = global._pairingChildPids?.get(clean);
                    if (trackedChild && trackedChild.exitCode == null && !trackedChild.killed) {
                        try { trackedChild.kill('SIGTERM'); } catch (_) {}
                    }
                    global._pairingChildPids?.delete(clean);
                    global._pairingInFlight.delete(clean);
                    global._pairingProcessorBusy = false;
                    global._pairingProcessorBusySince = 0;
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
