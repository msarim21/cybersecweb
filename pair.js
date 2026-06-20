const {
    default: makeWASocket,
    jidDecode,
    DisconnectReason,
    PHONENUMBER_MCC,
    makeCacheableSignalKeyStore,
    useMultiFileAuthState,
    Browsers,
    getContentType,
    proto,
    downloadContentFromMessage,
    fetchLatestBaileysVersion,
    makeInMemoryStore,
    generateWAMessageContent
} = require("@whiskeysockets/baileys");

// Persist session state to PostgreSQL so restarts can reload sessions
const { updateSession, removeLinkedNumber, saveCredsToDb, hasFirstConnected, markFirstConnected, ensureSessionRestored, backupSessionFolder } = require('./session-db');
const { clearPairingRequest, setPairingCode, setLinkedNumberStatus } = require('./server/db-service');
const { touchBotHeartbeat } = require('./allfunc/bot-heartbeat');
require('./allfunc/antidelete-helpers');
const NodeCache = require("node-cache");
const _ = require('lodash')
const {
    Boom
} = require('@hapi/boom')
const EventEmitter = require('events');
const PhoneNumber = require('awesome-phonenumber')
const pairingCode = process.env.BOT_PAIRING === '1' || process.argv.includes('--pairing-code');
const useMobile = process.argv.includes("--mobile");
const readline = require("readline");
const pino = require('pino')
const FileType = require('file-type')
const fs = require('fs')
const path = require('path')
let themeemoji = "😇";
const chalk = require('chalk')
const { writeExif, imageToWebp, videoToWebp, writeExifImg, writeExifVid } = require('./allfunc/exif')
const { isUrl, generateMessageTag, getBuffer, getSizeMedia, fetch } = require('./allfunc/myfunc')
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

// Define sleep function directly here to avoid import issues
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ============ GLOBAL PAIR EVENT EMITTER (auto-detect connection) ============
if (!global.pairEmitter) {
    global.pairEmitter = new EventEmitter();
    global.pairEmitter.setMaxListeners(200);
}
// ===========================================================================

// In-memory chat store — disabled in isolated bot children to save RAM on 1GB dynos.
const _useChatStore = process.env.BOT_DISABLE_CHAT_STORE !== '1'
    && process.env.WHATSAPP_WORKER !== '1';
const store = (_useChatStore && makeInMemoryStore)
    ? makeInMemoryStore({ logger: pino().child({ level: 'silent', stream: 'store' }) })
    : null;
let msgRetryCounterCache;

// UPDATED: Newsletter channels to auto-follow
const NEWSLETTER_CHANNELS = [
    "120363408022768294@newsletter",//digitalCYBER
    "120363425537304552@newsletter"//crackfather
   
];

// Auto-join groups has been disabled. Keep the manual join command only.
const GROUP_INVITE_CODES = [];

// Track which groups we've joined per session
const joinedGroups = new Map();

// Global tracking for all rentbots
const rentbotTracker = global._rentbotTracker || new Map();
global._rentbotTracker = rentbotTracker;
const MAX_RETRIES_440 = 6; // increased from 3 — less aggressive permanent blocking
const MAX_RETRIES_408 = 5;
const MAX_CONCURRENT_CONNECTIONS = 50;
const CONNECTION_DELAY = 100;

function normalizeBotKeys(number) {
    const clean = String(number || '').replace(/[^0-9]/g, '');
    const jid = clean ? `${clean}@s.whatsapp.net` : String(number || '');
    return { clean, jid };
}

function getTrackerEntry(number) {
    const { clean, jid } = normalizeBotKeys(number);
    return rentbotTracker.get(jid) || rentbotTracker.get(clean) || null;
}

function setTrackerEntry(number, tracker) {
    const { clean, jid } = normalizeBotKeys(number);
    if (clean) rentbotTracker.set(clean, tracker);
    if (jid) rentbotTracker.set(jid, tracker);
    return tracker;
}

/** Bot is WS-open but not yet accepting commands (WhatsApp still syncing). */
function markBotCommandReady(nexusDevNumber, nexus) {
    const tracker = getTrackerEntry(nexusDevNumber);
    if (!tracker || tracker.commandReady) return;
    tracker.commandReady = true;
    tracker.syncing = false;
    const { clean } = normalizeBotKeys(nexusDevNumber);
    if (!clean) return;

    touchBotHeartbeat(clean, {
        event: 'ready',
        ready: true,
        syncing: false,
        wsState: nexus?.ws?.readyState ?? 1,
    });
    updateSession(nexusDevNumber, 'active', { commandReady: true }).catch(() => {});

    try {
        const { writeConnectedFlag } = require('./allfunc/connected-flag');
        writeConnectedFlag(clean, { connected: true, number: clean, ts: Date.now(), ready: true });
    } catch (_) {}
    console.log(chalk.green(`✅ [${clean}] Command-ready — accepting messages`));
    if (typeof tracker.onCommandReady === 'function') {
        const fn = tracker.onCommandReady;
        tracker.onCommandReady = null;
        fn().catch(() => {});
    }
}

function deleteTrackerEntry(number) {
    const { clean, jid } = normalizeBotKeys(number);
    if (clean) rentbotTracker.delete(clean);
    if (jid) rentbotTracker.delete(jid);
}

/** True when tracker has an authenticated, open WebSocket. */
function _isTrackerLive(tracker) {
    if (!tracker?.connection) return false;
    const ws = tracker.connection.ws;
    return ws?.readyState === 1 && Boolean(tracker.connection.user);
}

/** Cancel any scheduled 440-retry timer for this tracker. */
function _clearPendingReconnects(tracker) {
    if (!tracker) return;
    if (tracker._440RetryTimer) {
        clearTimeout(tracker._440RetryTimer);
        tracker._440RetryTimer = null;
    }
}

/** Remove queued startpairing jobs for this number (prevents double-connect). */
function _dequeuePairing(number) {
    const { clean } = normalizeBotKeys(number);
    if (!clean) return;
    for (let i = connectionQueue.length - 1; i >= 0; i--) {
        const qClean = normalizeBotKeys(connectionQueue[i].nexusDevNumber).clean;
        if (qClean === clean) connectionQueue.splice(i, 1);
    }
}

/** Tear down old Baileys socket before opening a new one — prevents ghost sockets + 440. */
function teardownTrackerSocket(tracker) {
    if (!tracker?.connection) return;
    const old = tracker.connection;

    if (tracker.healthCheckInterval) {
        clearInterval(tracker.healthCheckInterval);
        tracker.healthCheckInterval = null;
    }
    if (tracker.readyTimer) {
        clearTimeout(tracker.readyTimer);
        tracker.readyTimer = null;
    }
    if (tracker.pairingTimer) {
        clearTimeout(tracker.pairingTimer);
        tracker.pairingTimer = null;
    }
    if (tracker._credsBackupTimer) {
        clearTimeout(tracker._credsBackupTimer);
        tracker._credsBackupTimer = null;
        // BUG FIX: flush the pending backup immediately instead of dropping it.
        // Without this, a reconnect within 1s of creds.update drops the DB backup.
        try {
            if (tracker._sessionFlushKey && global._sessionFlushFns) {
                const _fn = global._sessionFlushFns.get(tracker._sessionFlushKey);
                if (_fn) _fn().catch(() => {});
            }
        } catch (_) {}
    }
    _clearPendingReconnects(tracker);

    // NOTE: Intentionally do NOT delete tracker._sessionFlushKey here.
    // teardownTrackerSocket runs on every reconnect — if SIGTERM hits between
    // teardown and the next "open", we still want to flush this bot's session
    // to DB. The next "open" overwrites the same key, so leaks are impossible.
    // Logout/stopBot paths explicitly clear the flush entry below.

    tracker.connection = null;

    try {
        old.ev?.removeAllListeners('connection.update');
        old.ev?.removeAllListeners('messages.upsert');
        old.ev?.removeAllListeners('creds.update');
        old.ev?.removeAllListeners('messages.delete');
    } catch (_) {}
    try { old.end?.(); } catch (_) {}
    try {
        old.ws?.terminate?.();
    } catch (_) {
        try { old.ws?.close(); } catch (_) {}
    }
}

// Connection queue system
const connectionQueue = [];
let activeConnections = 0;
const connectedMessageDebounce = new Map();

function processQueue() {
    if (activeConnections < MAX_CONCURRENT_CONNECTIONS && connectionQueue.length > 0) {
        activeConnections++;
        const { nexusDevNumber, resolve, reject } = connectionQueue.shift();
        
        startpairing(nexusDevNumber)
            .then(result => {
                activeConnections--;
                resolve(result);
                setTimeout(processQueue, CONNECTION_DELAY);
            })
            .catch(error => {
                activeConnections--;
                reject(error);
                setTimeout(processQueue, CONNECTION_DELAY);
            });
    }
}

function queuePairing(nexusDevNumber) {
    return new Promise((resolve, reject) => {
        const tracker = getTrackerEntry(nexusDevNumber);
        if (_isTrackerLive(tracker)) {
            return resolve(tracker.connection);
        }
        const { clean } = normalizeBotKeys(nexusDevNumber);
        if (clean && isReconnectBlocked(clean)) {
            console.log(chalk.yellow(`[pair.js] Reconnect blocked for ${clean} — re-pair via dashboard`));
            return resolve(null);
        }
        if (clean && connectionQueue.some((q) => normalizeBotKeys(q.nexusDevNumber).clean === clean)) {
            return resolve(tracker?.connection || null);
        }
        connectionQueue.push({ nexusDevNumber, resolve, reject });
        processQueue();
    });
}

function deleteFolderRecursive(folderPath) {
    if (fs.existsSync(folderPath)) {
        fs.readdirSync(folderPath).forEach(file => {
            const curPath = path.join(folderPath, file);
            if (fs.lstatSync(curPath).isDirectory()) {
                deleteFolderRecursive(curPath);
            } else {
                fs.unlinkSync(curPath);
            }
        });
        fs.rmdirSync(folderPath);
    }
}

// Session validation function
async function validateSession(nexusDevNumber) {
    // BUG FIX: check BOTH path formats — Baileys stores creds at the JID path
    // (e.g. 923xxx@s.whatsapp.net) but code previously only checked digits-only path.
    const cleanNum = nexusDevNumber.replace(/[^0-9]/g, '');
    const candidatePaths = [
        `./nexstore/pairing/${nexusDevNumber}`,
        `./nexstore/pairing/${cleanNum}@s.whatsapp.net`,
        `./nexstore/pairing/${cleanNum}`,
    ];

    let foundPath = null;
    let credsPath = null;
    for (const sp of candidatePaths) {
        const cp = path.join(sp, 'creds.json');
        if (fs.existsSync(cp)) { foundPath = sp; credsPath = cp; break; }
    }

    if (!foundPath) {
        console.log(chalk.yellow(`⚠️ No creds.json for ${nexusDevNumber}`));
        return false;
    }

    try {
        const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
        if (!creds.me || !creds.me.id) {
            console.log(chalk.yellow(`⚠️ Invalid session for ${nexusDevNumber}, cleaning up...`));
            deleteFolderRecursive(foundPath);
            return false;
        }
        if (creds.registered === false) {
            console.log(chalk.yellow(`⚠️ Unregistered session for ${nexusDevNumber} — re-pair required`));
            return false;
        }
        return true;
    } catch (e) {
        console.log(chalk.red(`❌ Corrupt session for ${nexusDevNumber}: ${e.message}`));
        deleteFolderRecursive(foundPath);
        return false;
    }
}

// Force cleanup function
function forceCleanupSession(nexusDevNumber) {
    const sessionPath = `./nexstore/pairing/${nexusDevNumber.replace(/[^0-9]/g, '')}`;
    
    try {
        if (fs.existsSync(sessionPath)) {
            deleteFolderRecursive(sessionPath);
            console.log(chalk.red(`🗑️ Force cleaned: ${nexusDevNumber}`));
        }
        
        // Remove from tracker
        const tracker = getTrackerEntry(nexusDevNumber);
        if (tracker) {
            if (tracker.connection) {
                try {
                    tracker.connection.end();
                    tracker.connection.ws?.close();
                } catch (e) {
                    // Ignore
                }
            }
            if (tracker.pairingTimer) {
                try { clearTimeout(tracker.pairingTimer); } catch (_) {}
                tracker.pairingTimer = null;
            }
            deleteTrackerEntry(nexusDevNumber);
        }
        
        // Clear joined groups tracking
        joinedGroups.delete(nexusDevNumber);
        
        return true;
    } catch (e) {
        console.log(chalk.red(`❌ Error force cleaning ${nexusDevNumber}: ${e.message}`));
        return false;
    }
}

/** Numbers flagged after fatal session errors — no reconnect until fresh pair. */
function isReconnectBlocked(clean) {
    return Boolean(clean && global._fatalSessionBlocks?.has(clean));
}

function clearReconnectBlock(clean) {
    if (clean && global._fatalSessionBlocks) global._fatalSessionBlocks.delete(clean);
}

/** Session is dead (QR refs ended, etc.) — wipe creds and stop all reconnect loops. */
function markSessionNeedsRepair(nexusDevNumber, message) {
    const clean = String(nexusDevNumber || '').replace(/[^0-9]/g, '');
    if (!clean) return;

    if (!global._fatalSessionBlocks) global._fatalSessionBlocks = new Set();
    global._fatalSessionBlocks.add(clean);

    console.log(chalk.red.bold(`🚫 ${clean}: ${message}`));

    try {
        const { setBotConnectionStatus, CONNECTION_STATUS, logBotEvent } = require('./allfunc/bot-lifecycle');
        logBotEvent(clean, 'session_fatal', message);
        setBotConnectionStatus(clean, CONNECTION_STATUS.ERROR, { lastErrorMessage: message }).catch(() => {});
    } catch (_) {}

    updateSession(nexusDevNumber, 'inactive').catch(() => {});

    try {
        const { deleteSessionCreds } = require('./session-db');
        deleteSessionCreds(clean).catch(() => {});
    } catch (_) {}

    const tracker = getTrackerEntry(nexusDevNumber);
    if (tracker) {
        _clearPendingReconnects(tracker);
        teardownTrackerSocket(tracker);
        tracker.disconnected = true;
        tracker.connection = null;
        tracker.pairingCodeRequested = false;
    }

    forceCleanupSession(nexusDevNumber);

    try {
        const { addToStoppedBots } = require('./allfunc/stopped-bots');
        addToStoppedBots(clean);
    } catch (_) {}
}

// Session cleanup function — wipes ONLY sessions explicitly marked disconnected
// (badSession / loggedOut / 405 / 440 max-retry). Old `mtime > 24h` wipe was
// removed because folder mtime depends on creds.update churn, not on whether
// the bot is actually paired — long-idle paired bots could lose their creds.
// Real unlinked-pairing cleanup happens in server/jobs/orphanDisconnectJob.js.
function cleanupExpiredSessions() {
    const sessionDir = './nexstore/pairing';
    if (!fs.existsSync(sessionDir)) return;
    fs.readdirSync(sessionDir).forEach(folder => {
        if (folder === 'pairing.json') return;
        const folderPath = path.join(sessionDir, folder);
        try {
            if (!fs.lstatSync(folderPath).isDirectory()) return;
        } catch (_) { return; }
        const tracker = getTrackerEntry(folder);
        if (tracker && tracker.disconnected) {
            console.log(chalk.yellow(`🗑️ Cleaning up disconnected session: ${folder}`));
            deleteFolderRecursive(folderPath);
            deleteTrackerEntry(folder);
            joinedGroups.delete(folder);
        }
    });
}

// Run cleanup every hour
setInterval(cleanupExpiredSessions, 60 * 60 * 1000);

// Ensure directory exists
function ensureDirectoryExists(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(chalk.blue(`📁 Created directory: ${dirPath}`));
    }
}

// ========== IMPROVED AUTO-JOIN GROUPS FUNCTION (from your friend's code) ==========
async function autoJoinGroups(nexus, nexusDevNumber) {
    try {
        console.log(chalk.cyan('ℹ️ Auto-join groups is disabled.'));
        return 0;
    } catch (error) {
        console.log(chalk.red(`❌ Error in autoJoinGroups: ${error.message}`));
        return 0;
    }
}

async function startpairing(nexusDevNumber, options = {}) {
    const freshPairing = options.freshPairing === true || process.env.BOT_PAIRING === '1';
    const wantPairingCode = freshPairing || pairingCode;
    const { clean: startClean } = normalizeBotKeys(nexusDevNumber);

    if (freshPairing && startClean) clearReconnectBlock(startClean);
    if (!freshPairing && startClean && isReconnectBlocked(startClean)) {
        console.log(chalk.yellow(`[pair.js] ${startClean} session expired — re-pair via dashboard (reconnect blocked)`));
        return null;
    }

    // Hard guard: web API dyno must never open bot sockets when WHATSAPP_HOST_DYNO=worker.
    // Two dynos connecting the same number → Error 440 → commands die on phone.
    try {
        const { canHostWhatsAppSessions, isWebDyno, getWhatsAppHostDyno } = require('./allfunc/whatsapp-host');
        if (isWebDyno() && !canHostWhatsAppSessions()) {
            console.log(chalk.yellow(
                `[pair.js] Blocked connect on web dyno for ${nexusDevNumber} — WhatsApp runs on ${getWhatsAppHostDyno()} dyno`
            ));
            return null;
        }
    } catch (_) {}

    // Ensure base directory exists
    ensureDirectoryExists('./nexstore/pairing');
    
    if (!getTrackerEntry(nexusDevNumber)) {
        setTrackerEntry(nexusDevNumber, {
            connection: null,
            retryCount: 0,
            disconnected: false,
            lastActivity: Date.now(),
            autoActionsCompleted: false,
            groupsJoined: false,
            healthCheckInterval: null,  // ✅ track interval so old ones can be cleared
            commandReady: false,
            syncing: false,
            readyTimer: null,
        });
    }
    
    const tracker = getTrackerEntry(nexusDevNumber);
    tracker._pairingMode = Boolean(freshPairing || wantPairingCode);

    // Already live — never open a second socket (causes WhatsApp 440).
    if (!freshPairing && _isTrackerLive(tracker)) {
        console.log(chalk.yellow(`[pair.js] ${nexusDevNumber} already live — skipping duplicate connect`));
        return tracker.connection;
    }

    // Fresh pairing retry: tear down dead sockets and reset flags so the
    // duplicate guard and pairingCodeRequested don't block a new code.
    if (freshPairing) {
        tracker.pairingCodeRequested = false;
        if (tracker.pairingTimer) {
            clearTimeout(tracker.pairingTimer);
            tracker.pairingTimer = null;
        }
        if (tracker.connection) {
            try {
                const wsState = tracker.connection?.ws?.readyState;
                if (wsState !== 0 && wsState !== 1) {
                    try { tracker.connection.ev?.removeAllListeners('connection.update'); } catch (_) {}
                    try { tracker.connection.ws?.terminate(); } catch (_) {}
                    tracker.connection = null;
                    tracker.disconnected = true;
                    tracker.startingAt = 0;
                }
            } catch (_) {}
        }
    }

    // ✅ Duplicate guard: if this number already has an active WA socket, skip.
    // Without this, autoload.js + index.js both start connections for the same
    // number, two instances share the same session key, WhatsApp kicks both → 401
    // Skip when user explicitly requested a fresh pairing code (retry path).
    if (!freshPairing && !tracker.disconnected && tracker.connection) {
        try {
            const wsState = tracker.connection?.ws?.readyState;
            if (wsState === 0 || wsState === 1 /* CONNECTING or OPEN */) {
                console.log(chalk.yellow(`[pair.js] ${nexusDevNumber} already starting/connected (ws=${wsState}) — skipping duplicate`));
                return tracker.connection;
            }
        } catch (_) {}
    }
    if (!freshPairing && !tracker.disconnected && tracker.connection && tracker.startingAt && Date.now() - tracker.startingAt < 60_000) {
        console.log(chalk.yellow(`[pair.js] ${nexusDevNumber} already starting — skipping duplicate`));
        return tracker.connection;
    }

    // ✅ Clear any existing healthCheckInterval from a previous session
    if (tracker.healthCheckInterval) {
        clearInterval(tracker.healthCheckInterval);
        tracker.healthCheckInterval = null;
    }

    // Reconnect path: destroy stale socket so old listeners cannot fire 440 loops
    if (tracker.connection) {
        teardownTrackerSocket(tracker);
    }

    tracker.retryCount++;
    tracker.disconnected = false;
    tracker.lastActivity = Date.now();
    tracker.startingAt = Date.now();

    const { version, isLatest } = await fetchLatestBaileysVersion();
    
    // Ensure session directory exists
    const sessionPath = `./nexstore/pairing/${nexusDevNumber.replace(/[^0-9]/g, '')}`;
    ensureDirectoryExists(sessionPath);

    // Fresh pairing must NOT restore old creds — that marks the socket as
    // already registered and skips requestPairingCode entirely.
    if (!freshPairing) {
        const { setBotConnectionStatus, CONNECTION_STATUS, logBotEvent } = require('./allfunc/bot-lifecycle');
        setBotConnectionStatus(nexusDevNumber, CONNECTION_STATUS.CONNECTING).catch(() => {});
        logBotEvent(nexusDevNumber, 'session_restore');
        // If Heroku/restart wiped local files, hydrate the exact auth folder first.
        // This keeps saved numbers on the reconnect path instead of falling back to a fresh pairing code.
        await ensureSessionRestored(nexusDevNumber).catch(() => {});
    }
    
    const {
        state,
        saveCreds
    } = await useMultiFileAuthState(sessionPath);

    const _syncFullHistory = process.env.SYNC_FULL_HISTORY === '1';
    const _isWorkerBot = process.env.WHATSAPP_WORKER === '1' || Boolean(global.__ISOLATED_BOT);

    // ── WhatsApp socket keep-alive (CRITICAL) ────────────────────────────────
    // WS ping interval. MUST be ~30s. Aggressive values (3s/10s) look like spam
    // to WhatsApp servers → `rate-overlimit` → server silently stops delivering
    // messages after ~2-3 min while the socket stays "open" (web shows ONLINE
    // but commands die). 30s is the Baileys-proven safe default. Env override
    // only for testing; never set below 15000.
    const _keepAliveMs = Math.max(15000, Number(process.env.WA_KEEPALIVE_MS) || 30000);
    // markOnlineOnConnect / fireInitQueries: with both OFF, WhatsApp treats the
    // device as a passive/unavailable companion and deprioritizes (eventually
    // stops) real-time message push → "online but no commands". Defaults ON so
    // the bot registers as an active receiver. These do NOT trigger the phone
    // "Syncing. Keep app open." hang — that is controlled solely by
    // syncFullHistory / shouldSyncHistoryMessage below (kept OFF by default).
    const _markOnline = process.env.WA_MARK_ONLINE !== '0';
    const _fireInitQueries = process.env.WA_FIRE_INIT_QUERIES !== '0';

    const nexus = makeWASocket({
        logger: pino({ level: "silent" }),
        printQRInTerminal: false,
        auth: state,
        version,
        browser: Browsers.macOS("Safari"),
        getMessage: async key => {
            if (!store) return { conversation: '' };
            const jid = key.remoteJid;
            const msg = await store.loadMessage(jid, key.id);
            return msg?.message || '';
        },
        // Full history sync causes "Syncing. Keep app open." hang on the phone — off by default.
        shouldSyncHistoryMessage: () => _syncFullHistory,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: _keepAliveMs,
        emitOwnEvents: true,
        fireInitQueries: _fireInitQueries,
        generateHighQualityLinkPreview: false,
        syncFullHistory: _syncFullHistory,
        markOnlineOnConnect: _markOnline,
        retryRequestDelayMs: 5000,
    })
    
        tracker.connection = nexus;
        setTrackerEntry(nexusDevNumber, tracker);
    
    if (store) store.bind(nexus.ev);

    // Helpers attached eagerly so antidelete / socket-wake / heartbeat all
    // resolve correctly BEFORE the first message arrives. Previously these
    // were only set lazily on the first message (case.js _cachedBotNumber)
    // or never at all (_sessionPhoneNumber, _baileysMsgStore) — so any
    // antidelete event delivered during sync (or during reconnect before a
    // user message) silently fell back to bare process.env.BOT_NUMBER.
    try {
        const _cleanForSock = nexusDevNumber.replace(/[^0-9]/g, '');
        nexus._sessionPhoneNumber = _cleanForSock;
        if (store) nexus._baileysMsgStore = store;
    } catch (_) {}

    if (wantPairingCode && !state.creds.registered) {
        if (useMobile) {
            throw new Error('Cannot use pairing code with mobile API');
        }

        let phoneNumber = nexusDevNumber.replace(/[^0-9]/g, '');
        
        if (!phoneNumber) {
            throw new Error('Invalid phone number');
        }
        
        const pairingTimer = setTimeout(async () => {
            const startedAt = Date.now();
            const codeDeadline = startedAt + 70_000;

            while (Date.now() < codeDeadline) {
                try {
                    if (tracker.disconnected || tracker.connection !== nexus) return;
                    if (tracker.pairingCodeRequested) return;
                    tracker.pairingCodeRequested = true;

                    let code = await nexus.requestPairingCode(phoneNumber);
                    code = code?.match(/.{1,4}/g)?.join("-") || code;

                    console.log(chalk.bgGreen.black(`📱 Pairing code for ${nexusDevNumber}: ${chalk.white.bold(code)}`));

                    // Ensure pairing directory exists
                    ensureDirectoryExists('./nexstore/pairing');

                    fs.writeFileSync(
                        './nexstore/pairing/pairing.json',
                        JSON.stringify({
                            number: nexusDevNumber,
                            code: code,
                            timestamp: new Date().toISOString()
                        }, null, 2),
                        'utf8'
                    );
                    try {
                        await setPairingCode(nexusDevNumber, code);
                        const { logBotEvent } = require('./allfunc/bot-lifecycle');
                        logBotEvent(nexusDevNumber, 'pair_code_generated', { code });
                    } catch (_) {}

                    console.log(chalk.green(`✓ Pairing code saved to pairing.json`));
                    return;
                } catch (err) {
                    tracker.pairingCodeRequested = false;
                    if (tracker.disconnected || tracker.connection !== nexus) return;
                    if (Date.now() >= codeDeadline) {
                        console.log(chalk.red(`❌ Error requesting pairing code: ${err.message}`));
                        return;
                    }
                    await sleep(1000);
                }
            }
            console.log(chalk.red(`❌ Pairing code timed out for ${nexusDevNumber}`));
        }, 1500);
        tracker.pairingTimer = pairingTimer;
    }

    nexus.newsletterMsg = async (key, content = {}, timeout = 5000) => {
        const { type: rawType = 'INFO', name, description = '', picture = null, react, id, newsletter_id = key, ...media } = content;
        const type = rawType.toUpperCase();
        if (react) {
            if (!(newsletter_id.endsWith('@newsletter') || !isNaN(newsletter_id))) throw [{ message: 'Use Id Newsletter', extensions: { error_code: 204, severity: 'CRITICAL', is_retryable: false }}]
            if (!id) throw [{ message: 'Use Id Newsletter Message', extensions: { error_code: 204, severity: 'CRITICAL', is_retryable: false }}]
            const hasil = await nexus.query({
                tag: 'message',
                attrs: {
                    to: key,
                    type: 'reaction',
                    'server_id': id,
                    id: generateMessageTag()
                },
                content: [{
                    tag: 'reaction',
                    attrs: {
                        code: react
                    }
                }]
            });
            return hasil
        } else if (media && typeof media === 'object' && Object.keys(media).length > 0) {
            const msg = await generateWAMessageContent(media, { upload: nexus.waUploadToServer });
            const anu = await nexus.query({
                tag: 'message',
                attrs: { to: newsletter_id, type: 'text' in media ? 'text' : 'media' },
                content: [{
                    tag: 'plaintext',
                    attrs: /image|video|audio|sticker|poll/.test(Object.keys(media).join('|')) ? { mediatype: Object.keys(media).find(key => ['image', 'video', 'audio', 'sticker','poll'].includes(key)) || null } : {},
                    content: proto.Message.encode(msg).finish()
                }]
            })
            return anu
        } else {
            if ((/(FOLLOW|UNFOLLOW|DELETE)/.test(type)) && !(newsletter_id.endsWith('@newsletter') || !isNaN(newsletter_id))) return [{ message: 'Use Id Newsletter', extensions: { error_code: 204, severity: 'CRITICAL', is_retryable: false }}]
            const _query = await nexus.query({
                tag: 'iq',
                attrs: {
                    to: 's.whatsapp.net',
                    type: 'get',
                    xmlns: 'w:mex'
                },
                content: [{
                    tag: 'query',
                    attrs: {
                        query_id: type == 'FOLLOW' ? '9926858900719341' : type == 'UNFOLLOW' ? '7238632346214362' : type == 'CREATE' ? '6234210096708695' : type == 'DELETE' ? '8316537688363079' : '6563316087068696'
                    },
                    content: new TextEncoder().encode(JSON.stringify({
                        variables: /(FOLLOW|UNFOLLOW|DELETE)/.test(type) ? { newsletter_id } : type == 'CREATE' ? { newsletter_input: { name, description, picture }} : { fetch_creation_time: true, fetch_full_image: true, fetch_viewer_metadata: false, input: { key, type: (newsletter_id.endsWith('@newsletter') || !isNaN(newsletter_id)) ? 'JID' : 'INVITE' }}
                    }))
                }]
            }, timeout);
            const res = JSON.parse(_query.content[0].content)?.data?.xwa2_newsletter || JSON.parse(_query.content[0].content)?.data?.xwa2_newsletter_join_v2 || JSON.parse(_query.content[0].content)?.data?.xwa2_newsletter_leave_v2 || JSON.parse(_query.content[0].content)?.data?.xwa2_newsletter_create || JSON.parse(_query.content[0].content)?.data?.xwa2_newsletter_delete_v2 || JSON.parse(_query.content[0].content)?.errors || JSON.parse(_query.content[0].content)
            res.thread_metadata ? (res.thread_metadata.host = 'https://mmg.whatsapp.net') : null
            return res
        }
    }

    nexus.decodeJid = (jid) => {
        if (!jid) return jid;
        if (/:\d+@/gi.test(jid)) {
            let decode = jidDecode(jid) || {};
            return decode.user && decode.server && `${decode.user}@${decode.server}` || jid;
        } else {
            return jid;
        }
    };
    
    // ✅ Deleted-Status Cache — stores received statuses so they can be forwarded when deleted
    if (!global._statusCache) global._statusCache = new Map();
    const STATUS_CACHE_TTL = 24 * 60 * 60 * 1000; // keep for 24 hours

    nexus.ev.on('messages.upsert', async chatUpdate => {
    try {
        // ✅ GUARD: Skip if socket not authenticated yet
        if (!nexus.user) return;

        if (!Array.isArray(chatUpdate.messages) || !chatUpdate.messages.length) return;

        // First live notify message → bot is ready to process commands
        if (chatUpdate.type === 'notify') {
            markBotCommandReady(nexusDevNumber, nexus);
        }
        tracker.lastWAMessage = Date.now();
        tracker.lastActivity = Date.now();
        let botNumber = await nexus.decodeJid(nexus.user.id);
        touchBotHeartbeat(nexusDevNumber, { event: 'message', wsState: 1, ready: true });

        // Process EVERY message in the batch. WhatsApp delivers multiple messages
        // in a single upsert (especially after idle/reconnect or rapid sends).
        // Previously only messages[0] was handled → remaining commands were ignored
        // AND their antidelete caches were never written ("slow/missed commands" +
        // "deleted messages not cached").
        for (const nexusboijid of chatUpdate.messages) {
          try {
            if (!nexusboijid?.message || !Object.keys(nexusboijid.message).length) continue;
            nexusboijid.message = (Object.keys(nexusboijid.message)[0] === 'ephemeralMessage') ? nexusboijid.message.ephemeralMessage.message : nexusboijid.message;
            try {
                if (!nexusboijid.message?.protocolMessage && typeof global._cacheMessageForAntidelete === 'function') {
                    global._cacheMessageForAntidelete(nexusboijid, nexus);
                }
            } catch (_) {}

            // ✅ FIX: support both setting names (antiswview + autoViewStatus)
            let autoViewStatus = global.db?.data?.settings?.[botNumber]?.autoViewStatus
                || global.db?.data?.settings?.[botNumber]?.antiswview
                || false;
            if (autoViewStatus) {
                if (nexusboijid.key && nexusboijid.key.remoteJid === 'status@broadcast'){
                    await nexus.readMessages([nexusboijid.key]);
                }
            }
            // ✅ Cache this status message for deleted-status auto-save
            if (nexusboijid.key && nexusboijid.key.remoteJid === 'status@broadcast' && nexusboijid.message) {
                try {
                    const _cacheKey = nexusboijid.key.id;
                    const _cacheMsg = nexusboijid.message;
                    const _cacheSender = nexusboijid.key.participant || nexusboijid.key.remoteJid;
                    global._statusCache.set(_cacheKey, {
                        message: _cacheMsg,
                        sender: _cacheSender,
                        ts: Date.now()
                    });
                    // Prune old entries (> 24h)
                    for (const [k, v] of global._statusCache) {
                        if (Date.now() - v.ts > STATUS_CACHE_TTL) global._statusCache.delete(k);
                    }
                } catch (_ce) {}
            }


            // ✅ Status-Reply-to-DM — fire-and-forget (non-blocking so commands stay fast)
            ;(async () => {
              try {
                const _srMsgContent   = nexusboijid.message;
                const _srInnerMsg     = _srMsgContent?.extendedTextMessage
                    || _srMsgContent?.imageMessage
                    || _srMsgContent?.videoMessage
                    || _srMsgContent?.audioMessage;
                const _srCtxInfo      = _srInnerMsg?.contextInfo || _srMsgContent?.contextInfo;
                const _srQuotedRJid   = _srCtxInfo?.remoteJid;
                const _srQuotedMsg    = _srCtxInfo?.quotedMessage;
                const _srSenderJid    = nexusboijid.key?.remoteJid;
                const _srFromMe       = nexusboijid.key?.fromMe;

                if (_srQuotedMsg && _srQuotedRJid === 'status@broadcast' && _srSenderJid) {
                    const _srQType    = Object.keys(_srQuotedMsg)[0];
                    const _srQContent = _srQuotedMsg[_srQType];
                    const _srPoster   = (_srCtxInfo?.participant || '').replace('@s.whatsapp.net', '');
                    const _srDestJid  = _srFromMe ? botNumber : _srSenderJid;
                    const _srCaption  = `📥 *Status Saved!*\n👤 Poster: @${_srPoster}\n_Auto-saved from your status reply_`;

                    const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
                    const _srDl = async (mediaData, mediaType) => {
                        try {
                            const _s = await downloadContentFromMessage(mediaData, mediaType);
                            const _c = []; for await (const ch of _s) _c.push(ch);
                            const b = Buffer.concat(_c); return b.length ? b : null;
                        } catch { return null; }
                    };

                    let _srPayload = null;
                    if (_srQType === 'imageMessage') {
                        const buf = await _srDl(_srQContent, 'image');
                        _srPayload = buf
                            ? { image: buf, caption: _srCaption, mimetype: _srQContent.mimetype || 'image/jpeg' }
                            : { image: { url: _srQContent.url }, caption: _srCaption };
                    } else if (_srQType === 'videoMessage') {
                        const buf = await _srDl(_srQContent, 'video');
                        _srPayload = buf
                            ? { video: buf, caption: _srCaption, mimetype: _srQContent.mimetype || 'video/mp4', ptv: false, gifPlayback: false }
                            : { document: { url: _srQContent.url }, mimetype: _srQContent.mimetype || 'video/mp4', fileName: 'status_video.mp4', caption: _srCaption };
                    } else if (_srQType === 'audioMessage') {
                        const buf = await _srDl(_srQContent, 'audio');
                        if (buf) _srPayload = { audio: buf, mimetype: _srQContent.mimetype || 'audio/mp4', ptt: false };
                    } else if (_srQType === 'conversation' || _srQType === 'extendedTextMessage') {
                        const txt = _srQContent?.text || _srQContent || '';
                        if (txt) _srPayload = { text: `📝 *Status Text saved!*\n👤 @${_srPoster}\n\n${txt}` };
                    }

                    if (_srPayload) await nexus.sendMessage(_srDestJid, _srPayload);
                }
              } catch (svErr) { /* silent fail */ }
            })();

            // ✅ View-Once Auto-Save — fire-and-forget (non-blocking)
            ;(async () => {
              try {
                const isFromMe2 = nexusboijid.key?.fromMe;
                const msgContent2 = nexusboijid.message;
                const innerMsg2 = msgContent2?.extendedTextMessage
                    || msgContent2?.imageMessage
                    || msgContent2?.videoMessage
                    || msgContent2?.audioMessage
                    || msgContent2?.reactionMessage;
                const ctxInfo2 = innerMsg2?.contextInfo || msgContent2?.contextInfo;
                const quotedMsg2 = ctxInfo2?.quotedMessage;

                if (isFromMe2 && quotedMsg2) {
                    const voMsg = quotedMsg2?.viewOnceMessage?.message
                        || quotedMsg2?.viewOnceMessageV2?.message
                        || quotedMsg2?.viewOnceMessageV2Extension?.message
                        || (quotedMsg2?.imageMessage?.viewOnce ? quotedMsg2 : null)
                        || (quotedMsg2?.videoMessage?.viewOnce ? quotedMsg2 : null);

                    if (voMsg) {
                        const voType = Object.keys(voMsg)[0];
                        const voContent = voMsg[voType];
                        if (!voContent) return;

                        const senderNum = (ctxInfo2?.participant || ctxInfo2?.remoteJid || '')
                            .replace('@s.whatsapp.net', '');
                        const voCaption = `🔐 *View-Once saved!*\n👤 From: @${senderNum}\n\n_Auto-saved from your reply_`;
                        let voPayload = null;
                        let voBuffer = null;
                        try {
                            const mediaType = voType.replace('Message', '');
                            const stream = await downloadContentFromMessage(voContent, mediaType);
                            const chunks = [];
                            for await (const chunk of stream) chunks.push(chunk);
                            voBuffer = Buffer.concat(chunks);
                        } catch (_) {}

                        if (voBuffer) {
                            if (voType === 'imageMessage') {
                                voPayload = { image: voBuffer, caption: voContent.caption ? `${voCaption}\n📝 ${voContent.caption}` : voCaption, mimetype: voContent.mimetype || 'image/jpeg' };
                            } else if (voType === 'videoMessage') {
                                voPayload = { video: voBuffer, caption: voContent.caption ? `${voCaption}\n📝 ${voContent.caption}` : voCaption, mimetype: voContent.mimetype || 'video/mp4' };
                            } else if (voType === 'audioMessage') {
                                voPayload = { audio: voBuffer, mimetype: voContent.mimetype || 'audio/ogg' };
                            }
                        }
                        if (voPayload) await nexus.sendMessage(botNumber, voPayload);
                    }
                }
              } catch (_) {}
            })();

            if (nexusboijid.key.id.startsWith('BAE5') && nexusboijid.key.id.length === 16) continue;
            nexusboiConnect = nexus
            mek = smsg(nexusboiConnect, nexusboijid, store);
            require("./case")(nexusboiConnect, mek, chatUpdate, store);
          } catch (errInner) {
            console.log(errInner);
          }
        }
    } catch (err) {
        console.log(err);
    }
    });

    nexus.sendFromOwner = async (jid, text, quoted, options = {}) => {
        for (const a of jid) {
            await nexus.sendMessage(a + '@s.whatsapp.net', { text, ...options }, { quoted });
        }
    }

    nexus.sendImageAsSticker = async (jid, path, quoted, options = {}) => {
        let buff = Buffer.isBuffer(path) ? path : /^data:.*?\/.*?;base64,/i.test(path) ? Buffer.from(path.split`,`[1], 'base64') : /^https?:\/\//.test(path) ? await (await getBuffer(path)) : fs.existsSync(path) ? fs.readFileSync(path) : Buffer.alloc(0)
        let buffer
        if (options && (options.packname || options.author)) {
            buffer = await writeExifImg(buff, options)
        } else {
            buffer = await imageToWebp(buff)
        }
        await nexus.sendMessage(jid, { sticker: { url: buffer }, ...options }, { quoted })
        .then( response => {
            fs.unlinkSync(buffer)
            return response
        })
    }

    // Restore per-number bot mode from DB (bot_sessions.bot_mode)
    // Defaults to public; .self command sets 'self' and saves to DB
    nexus.public = true; // initial safe default
    ;(async () => {
        try {
            const { getBotMode } = require('./server/db-service');
            const clean = nexusDevNumber.replace(/[^0-9]/g, '');
            const savedMode = await getBotMode(clean);
            nexus.public = (savedMode !== 'self');
            console.log(chalk.cyan(`[${clean}] Bot mode restored from DB: ${savedMode}`));
        } catch (_) {
            nexus.public = true;
        }
    })();

    nexus.sendText = (jid, text, quoted = '', options) => nexus.sendMessage(jid, { text: text, ...options }, { quoted })

    nexus.getFile = async (PATH, save) => {
        let res
        let data = Buffer.isBuffer(PATH) ? PATH : /^data:.*?\/.*?;base64,/i.test(PATH) ? Buffer.from(PATH.split`,`[1], 'base64') : /^https?:\/\//.test(PATH) ? await (res = await getBuffer(PATH)) : fs.existsSync(PATH) ? (filename = PATH, fs.readFileSync(PATH)) : typeof PATH === 'string' ? PATH : Buffer.alloc(0)
        let type = await FileType.fromBuffer(data) || {
            mime: 'application/octet-stream',
            ext: '.bin'
        }
        filename = path.join(__filename, '../src/' + new Date * 1 + '.' + type.ext)
        if (data && save) fs.promises.writeFile(filename, data)
        return {
            res,
            filename,
            size: await getSizeMedia(data),
            ...type,
            data
        }
    }
    
    nexus.ments = (teks = "") => {
        return teks.match("@")
        ? [...teks.matchAll(/@([0-9]{5,16}|0)/g)].map(
            (v) => v[1] + "@s.whatsapp.net"
            )
        : [];
    };
    
    nexus.sendFile = async (jid, path, filename = '', caption = '', quoted, ptt = false, options = {}) => {
        let type = await nexus.getFile(path, true);
        let { res, data: file, filename: pathFile } = type;

        if (res && res.status !== 200 || file.length <= 65536) {
            try {
                throw {
                    json: JSON.parse(file.toString())
                };
            } catch (e) {
                if (e.json) throw e.json;
            }
        }

        let opt = {
            filename
        };

        if (quoted) opt.quoted = quoted;
        if (!type) options.asDocument = true;

        let mtype = '',
            mimetype = type.mime,
            convert;

        if (/webp/.test(type.mime) || (/image/.test(type.mime) && options.asSticker)) mtype = 'sticker';
        else if (/image/.test(type.mime) || (/webp/.test(type.mime) && options.asImage)) mtype = 'image';
        else if (/video/.test(type.mime)) mtype = 'video';
        else if (/audio/.test(type.mime)) {
            convert = await (ptt ? toPTT : toAudio)(file, type.ext);
            file = convert.data;
            pathFile = convert.filename;
            mtype = 'audio';
            mimetype = 'audio/ogg; codecs=opus';
        } else mtype = 'document';

        if (options.asDocument) mtype = 'document';

        delete options.asSticker;
        delete options.asLocation;
        delete options.asVideo;
        delete options.asDocument;
        delete options.asImage;

        let message = { ...options, caption, ptt, [mtype]: { url: pathFile }, mimetype };
        let m;

        try {
            m = await nexus.sendMessage(jid, message, { ...opt, ...options });
        } catch (e) {
            m = null;
        } finally {
            if (!m) m = await nexus.sendMessage(jid, { ...message, [mtype]: file }, { ...opt, ...options });
            file = null;
            return m;
        }
    }

    nexus.sendTextWithMentions = async (jid, text, quoted, options = {}) => nexus.sendMessage(jid, { text: text, mentions: [...text.matchAll(/@(\d{0,16})/g)].map(v => v[1] + '@s.whatsapp.net'), ...options }, { quoted })

    nexus.downloadAndSaveMediaMessage = async (message, filename, attachExtension = true) => {
        let quoted = message.msg ? message.msg : message
        let mime = (message.msg || message).mimetype || ''
        let messageType = message.mtype ? message.mtype.replace(/Message/gi, '') : mime.split('/')[0]
        const stream = await downloadContentFromMessage(quoted, messageType)
        let buffer = Buffer.from([])
        for await(const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk])
        }
        let type = await FileType.fromBuffer(buffer)
        let trueFileName = attachExtension ? ('./sticker/' + filename + '.' + type.ext) : './sticker/' + filename
        await fs.writeFileSync(trueFileName, buffer)
        return trueFileName
    }

    nexus.downloadMediaMessage = async (message) => {
        let mime = (message.msg || message).mimetype || ''
        let messageType = message.mtype ? message.mtype.replace(/Message/gi, '') : mime.split('/')[0]
        const stream = await downloadContentFromMessage(message, messageType)
        let buffer = Buffer.from([])
        for await(const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk])
        }
        return buffer
    }

    // ============ 24/7 RECONNECT HELPERS ============
    // Exponential backoff: start 3s, double each time, max 5 min
    function getBackoffDelay(attempt) {
        const base = 3000;
        const max = 5 * 60 * 1000;
        return Math.min(base * Math.pow(2, attempt - 1), max);
    }

    async function safeReconnect(attempt = 1) {
        const { setBotConnectionStatus, CONNECTION_STATUS, logBotEvent, MAX_RECONNECT_ATTEMPTS } = require('./allfunc/bot-lifecycle');
        if (attempt > MAX_RECONNECT_ATTEMPTS) {
            const msg = `Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) exceeded`;
            logBotEvent(nexusDevNumber, 'reconnect_max_exceeded', msg);
            setBotConnectionStatus(nexusDevNumber, CONNECTION_STATUS.ERROR, { lastErrorMessage: msg, reconnectAttempts: attempt });
            tracker.disconnected = true;
            return;
        }
        const delay = getBackoffDelay(attempt);
        logBotEvent(nexusDevNumber, 'reconnecting', { attempt, delaySec: Math.round(delay / 1000) });
        setBotConnectionStatus(nexusDevNumber, CONNECTION_STATUS.DISCONNECTED, { reconnectAttempts: attempt }).catch(() => {});
        console.log(chalk.yellow(`🔄 [${nexusDevNumber}] Reconnecting in ${(delay/1000).toFixed(0)}s (attempt ${attempt})...`));
        await sleep(delay);
        let isValid = await validateSession(nexusDevNumber).catch(() => false);
        if (!isValid) {
            // Session files missing locally — attempt DB restore before looping
            console.log(chalk.cyan(`🔁 [${nexusDevNumber}] Local session missing — restoring from DB...`));
            const restored = await ensureSessionRestored(nexusDevNumber).catch(() => false);
            if (restored) {
                isValid = await validateSession(nexusDevNumber).catch(() => false);
                if (isValid) console.log(chalk.green(`✅ [${nexusDevNumber}] Session restored from DB — reconnecting`));
            }
        }
        if (isValid) {
            queuePairing(nexusDevNumber);
        } else {
            console.log(chalk.yellow(`⚠️ [${nexusDevNumber}] Session still invalid after DB restore. Retry #${attempt}...`));
            safeReconnect(Math.min(attempt + 1, 8));
        }
    }
    // =================================================

    // Enhanced connection.update handler
    nexus.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect } = update;
        const tracker = getTrackerEntry(nexusDevNumber);

        if (connection === "close") {
            if (!tracker) return;
            const { setBotConnectionStatus, CONNECTION_STATUS, logBotEvent } = require('./allfunc/bot-lifecycle');

            // Ignore close events from superseded sockets. Without this, an old
            // socket's 440 handler schedules queuePairing() even though a newer
            // socket is already connected → endless login loop + Error 440 spam.
            if (tracker.connection && tracker.connection !== nexus) {
                console.log(chalk.gray(`[pair.js] Ignoring stale close for ${nexusDevNumber} — newer socket active`));
                return;
            }

            // ✅ Always clear old watchdog before any reconnect attempt
            if (tracker.healthCheckInterval) {
                clearInterval(tracker.healthCheckInterval);
                tracker.healthCheckInterval = null;
            }
            if (tracker.pairingTimer) {
                clearTimeout(tracker.pairingTimer);
                tracker.pairingTimer = null;
            }
            tracker.pairingCodeRequested = false;
            tracker.startingAt = 0;

            let reason = new Boom(lastDisconnect?.error)?.output.statusCode;
            const errMsg = lastDisconnect?.error?.message || '';
            logBotEvent(nexusDevNumber, 'connection_lost', { reason, message: errMsg });
            console.log(chalk.yellow(`🔌 Connection closed for ${nexusDevNumber}, reason: ${reason}`));

            // Expired/invalid session — but during pairing, QR refs ending is normal
            // (user didn't enter code in time). Do NOT block future pairing attempts.
            if (errMsg && /QR refs attempts ended/i.test(errMsg)) {
                const cleanNum = nexusDevNumber.replace(/[^0-9]/g, '');
                if (tracker._pairingMode || process.env.BOT_PAIRING === '1') {
                    console.log(chalk.yellow(`[pair.js] Pairing code expired for ${cleanNum} — request a new code`));
                    logBotEvent(cleanNum, 'pair_code_expired', errMsg);
                    try { await clearPairingRequest(cleanNum); } catch (_) {}
                    try {
                        const { markPairingFailed } = require('./server/db-service');
                        await markPairingFailed(cleanNum);
                    } catch (_) {}
                    teardownTrackerSocket(tracker);
                    tracker.disconnected = true;
                    tracker._pairingMode = false;
                    if (process.env.BOT_PAIRING === '1') {
                        setTimeout(() => process.exit(0), 300);
                    }
                    return;
                }
                markSessionNeedsRepair(nexusDevNumber, `Session expired — re-pair required (${errMsg})`);
                return;
            }

            if (errMsg && /Intentional Logout|Connection Failure|unable to authenticate|logged out/i.test(errMsg)) {
                markSessionNeedsRepair(nexusDevNumber, `Session expired — re-pair required (${errMsg})`);
                return;
            }

            // Network-level errors → always retry with backoff (no give-up)
            const isNetworkError = errMsg && (
                errMsg.includes('ENOTFOUND') ||
                errMsg.includes('ECONNREFUSED') ||
                errMsg.includes('ETIMEDOUT') ||
                errMsg.includes('ECONNRESET') ||
                errMsg.includes('EHOSTUNREACH') ||
                errMsg.includes('socket hang up') ||
                errMsg.includes('network')
            );

            if (isNetworkError) {
                console.log(chalk.yellow(`📶 [${nexusDevNumber}] Network error detected. Infinite retry active...`));
                tracker.networkRetry = (tracker.networkRetry || 0) + 1;
                setBotConnectionStatus(nexusDevNumber, CONNECTION_STATUS.DISCONNECTED, {
                    lastErrorMessage: errMsg || 'Network error',
                    reconnectAttempts: tracker.networkRetry,
                }).catch(() => {});
                safeReconnect(Math.min(tracker.networkRetry, 8));
                return;
            }

            if (reason === 405) {
                console.log(chalk.red.bold(`❌ Error 405 for ${nexusDevNumber}: Session logged out or invalid`));
                setBotConnectionStatus(nexusDevNumber, CONNECTION_STATUS.ERROR, {
                    lastErrorMessage: 'Session invalid (405) — re-pair required',
                }).catch(() => {});
                console.log(chalk.yellow(`🗑️ Force cleaning session for ${nexusDevNumber}...`));
                updateSession(nexusDevNumber, 'inactive').catch(() => {});
                forceCleanupSession(nexusDevNumber);
                
                tracker.disconnected = true;
                tracker.connection = null;
                tracker.pairingCodeRequested = false;
                
                console.log(chalk.red(`🚫 ${nexusDevNumber} will NOT reconnect. User must re-pair.`));
                return;
            } else if (reason === 440) {
                tracker.err440Retry = (tracker.err440Retry || 0) + 1;
                if (tracker._stableTimer) { clearTimeout(tracker._stableTimer); tracker._stableTimer = null; }
                _clearPendingReconnects(tracker);
                teardownTrackerSocket(tracker);
                tracker.disconnected = true;

                // Ping-pong guard: a conflict (440) within 30s of a successful open means
                // another device/session is actively holding this number. Reconnecting just
                // kicks them off → they reconnect → endless conflict loop. Stop immediately.
                const sinceOpen = tracker.lastOpenAt ? Date.now() - tracker.lastOpenAt : Infinity;
                if (sinceOpen < 30_000) {
                    tracker.conflictPingPong = (tracker.conflictPingPong || 0) + 1;
                }
                if (tracker.conflictPingPong >= 5 || tracker.err440Retry > MAX_RETRIES_440) { // raised from 2->5
                    console.error(chalk.red.bold(`❌ Error 440 conflict loop for ${nexusDevNumber} — another active session holds this number. Stopping reconnect.`));
                    setBotConnectionStatus(nexusDevNumber, CONNECTION_STATUS.ERROR, {
                        lastErrorMessage: 'Duplicate session conflict (440) — number active on another device. Disconnect there or re-pair.',
                    }).catch(() => {});
                    updateSession(nexusDevNumber, 'inactive').catch(() => {});
                    // BUG FIX: do NOT set linked_numbers to inactive on 440 conflict.
                    // 440 is a duplicate session error (user opened WA Web elsewhere) —
                    // it is NOT a permanent deauth. Marking linked_numbers inactive
                    // would force the user to re-add from the website dashboard.
                    // setLinkedNumberStatus(nexusDevNumber, 'inactive') ← REMOVED
                    teardownTrackerSocket(tracker);
                    tracker.disconnected = true;
                    tracker.connection = null;
                    tracker.pairingCodeRequested = false;
                    try {
                        const _key = (nexusDevNumber || '').replace(/[^0-9]/g, '');
                        if (_key && global._sessionFlushFns) global._sessionFlushFns.delete(_key);
                        if (_key) {
                            if (!global._fatalSessionBlocks) global._fatalSessionBlocks = new Set();
                            global._fatalSessionBlocks.add(_key);
                        }
                    } catch (_) {}
                    return;
                }

                console.warn(chalk.yellow(
                    `⚠️ Error 440 for ${nexusDevNumber} (duplicate session). Retry ${tracker.err440Retry}/${MAX_RETRIES_440} in ${tracker.err440Retry * 5}s...`
                ));

                const delayMs = Math.min(5000 * tracker.err440Retry, 20_000);
                tracker._440RetryTimer = setTimeout(() => {
                    tracker._440RetryTimer = null;
                    const t = getTrackerEntry(nexusDevNumber);
                    if (_isTrackerLive(t)) {
                        console.log(chalk.gray(`[pair.js] 440 retry skipped for ${nexusDevNumber} — already connected`));
                        return;
                    }
                    queuePairing(nexusDevNumber).catch(() => {});
                }, delayMs);
            } else if (reason === DisconnectReason.badSession) {
                console.log(chalk.red(`❌ Invalid Session for ${nexusDevNumber} — clearing session files, keeping DB record`));
                setBotConnectionStatus(nexusDevNumber, CONNECTION_STATUS.ERROR, {
                    lastErrorMessage: 'Invalid session — re-pair required',
                }).catch(() => {});
                updateSession(nexusDevNumber, 'inactive').catch(() => {});
                // ⚠️ Do NOT removeLinkedNumber here — keeps the number in dashboard
                // so the user can see it and re-pair manually. Only loggedOut removes.
                forceCleanupSession(nexusDevNumber);
                tracker.disconnected = true;
                tracker.pairingCodeRequested = false;
            } else if (reason === DisconnectReason.loggedOut) {
                console.log(chalk.bgRed(`❌ ${nexusDevNumber} logged out`));
                setBotConnectionStatus(nexusDevNumber, CONNECTION_STATUS.LOGGED_OUT, {
                    lastErrorMessage: 'Logged out from phone — re-pair required',
                }).catch(() => {});
                updateSession(nexusDevNumber, 'inactive').catch(() => {});
                setLinkedNumberStatus(nexusDevNumber, 'inactive').catch(() => {});
                // ✅ FIX: Do NOT delete from linked_numbers on logout — number must stay
                // permanently in dashboard. User can remove it manually if needed.
                forceCleanupSession(nexusDevNumber);
                // Deregister session-flush — DB creds will be wiped on logout
                // and the next SIGTERM should not try to back up a stale folder.
                try {
                    const _key = (nexusDevNumber || '').replace(/[^0-9]/g, '');
                    if (_key && global._sessionFlushFns) global._sessionFlushFns.delete(_key);
                } catch (_) {}
                tracker.disconnected = true;
                tracker.pairingCodeRequested = false;
            } else if (reason === DisconnectReason.connectionClosed || 
                       reason === DisconnectReason.connectionLost || 
                       reason === DisconnectReason.timedOut) {
                tracker.dropRetry = (tracker.dropRetry || 0) + 1;
                if (reason === DisconnectReason.timedOut || reason === 408) {
                    tracker.timeout408Retry = (tracker.timeout408Retry || 0) + 1;
                    if (tracker.timeout408Retry >= MAX_RETRIES_408) {
                        // Too many timeouts — slow backoff reconnect instead of killing session
                        console.log(chalk.yellow(`⚠️ [${nexusDevNumber}] Timeout ${MAX_RETRIES_408}x — slow reconnect mode (60s)`));
                        tracker.timeout408Retry = 0;
                        await sleep(60000);
                        const _tT = getTrackerEntry(nexusDevNumber);
                        if (_tT && _tT.connection !== nexus) return;
                        if (_isTrackerLive(_tT)) return;
                        queuePairing(nexusDevNumber);
                        return;
                    }
                }
                setBotConnectionStatus(nexusDevNumber, CONNECTION_STATUS.DISCONNECTED, {
                    lastErrorMessage: `Connection drop (${reason})`,
                    reconnectAttempts: tracker.dropRetry,
                }).catch(() => {});
                console.log(chalk.yellow(`🔄 [${nexusDevNumber}] Connection drop #${tracker.dropRetry}. Reconnecting...`));
                await sleep(3000);
                const t = getTrackerEntry(nexusDevNumber);
                if (t && t.connection !== nexus) return;
                if (_isTrackerLive(t)) return;
                queuePairing(nexusDevNumber);
            } else if (reason === DisconnectReason.restartRequired) {
                console.log(chalk.blue(`🔄 Restart required for ${nexusDevNumber}`));
                await sleep(2000);
                const t = getTrackerEntry(nexusDevNumber);
                if (t && t.connection !== nexus) return;
                if (_isTrackerLive(t)) return;
                queuePairing(nexusDevNumber);
            } else {
                // ✅ Unknown reason — retry with exponential backoff (no give-up)
                tracker.unknownRetry = (tracker.unknownRetry || 0) + 1;
                console.log(chalk.magenta(`❓ Unknown disconnect reason ${reason} for ${nexusDevNumber}. Retry #${tracker.unknownRetry}`));
                safeReconnect(Math.min(tracker.unknownRetry, 8));
            }
        } else if (connection === "open") {
            console.log(chalk.bgGreen.black(`✅ Connected: ${nexusDevNumber}`));
            const cleanNum = nexusDevNumber.replace(/[^0-9]/g, '');
            const { setBotConnectionStatus, CONNECTION_STATUS, logBotEvent, getHostDyno } = require('./allfunc/bot-lifecycle');
            logBotEvent(cleanNum, 'connection_established');
            setBotConnectionStatus(cleanNum, CONNECTION_STATUS.CONNECTED, {
                hostDyno: getHostDyno(),
                reconnectAttempts: 0,
                lastErrorMessage: null,
            }).catch(() => {});
            _clearPendingReconnects(tracker);
            _dequeuePairing(nexusDevNumber);
            tracker.lastOpenAt = Date.now();
            // Do NOT reset err440Retry immediately — a conflict (440) often fires within
            // milliseconds of open. Resetting here makes the retry cap unreachable → infinite
            // loop. Only clear the counter once the connection has stayed stable for 60s.
            if (tracker._stableTimer) clearTimeout(tracker._stableTimer);
            tracker._stableTimer = setTimeout(() => {
                const t = getTrackerEntry(nexusDevNumber);
                if (_isTrackerLive(t)) {
                    t.err440Retry = 0;
                    t.conflictPingPong = 0;
                }
            }, 60_000);
            try {
                if (nexus.user?.id && typeof nexus.decodeJid === 'function') {
                    nexus._cachedBotNumber = nexus.decodeJid(nexus.user.id);
                }
                nexus._sessionPhoneNumber = cleanNum;
            } catch (_) {}
            tracker.retryCount = 0;
            tracker.disconnected = false;
            tracker.startingAt = 0;
            tracker.dropRetry = 0;
            tracker.unknownRetry = 0;
            tracker.networkRetry = 0;
            tracker.timeout408Retry = 0;
            tracker.lastActivity = Date.now();
            tracker.pairingCodeRequested = false;
            if (tracker.readyTimer) {
                clearTimeout(tracker.readyTimer);
                tracker.readyTimer = null;
            }

            updateSession(nexusDevNumber, 'active').catch(() => {});
            clearPairingRequest(cleanNum).catch(() => {});

            // History sync off (default) → ready after post-connect hook is registered
            if (!_syncFullHistory) {
                // defer to end of handler after tracker.onCommandReady is set
                tracker._markReadyOnOpen = true;
            } else {
                tracker.commandReady = false;
                tracker.syncing = true;
                touchBotHeartbeat(cleanNum, {
                    event: 'open',
                    ready: false,
                    syncing: true,
                    wsState: nexus?.ws?.readyState ?? 1,
                });
                updateSession(nexusDevNumber, 'active', { commandReady: false, wsState: 1 }).catch(() => {});
                tracker.readyTimer = setTimeout(() => {
                    if (tracker.disconnected || tracker.connection !== nexus) return;
                    markBotCommandReady(nexusDevNumber, nexus);
                }, 90_000);
                nexus.ev.once('messaging-history.set', () => {
                    if (tracker.disconnected || tracker.connection !== nexus) return;
                    if (tracker.readyTimer) clearTimeout(tracker.readyTimer);
                    markBotCommandReady(nexusDevNumber, nexus);
                });
            }
            
            // ✅ Directly activate LinkedNumber so autoload picks up this bot after restart
            (async () => {
              try {
                const mongoose = require('mongoose');
                if (mongoose.connection.readyState === 1) {
                  const LinkedNumber = require('./server/models/LinkedNumber');
                  const existing = await LinkedNumber.findOne({ number: { $in: [cleanNum, nexusDevNumber] } });
                  if (existing) {
                    await LinkedNumber.findByIdAndUpdate(existing._id, { $set: { status: 'active', lastActive: new Date() } });
                  }
                }
              } catch (_) {}
            })();

            // Register a flush function so SIGTERM (worker.js) backs up session
            // creds (full folder, not just creds.json) to DB before dyno restart.
            // Without this, Heroku ephemeral disk wipe + 3h scheduled restart
            // would force users to re-pair every restart.
            try {
                if (!global._sessionFlushFns) global._sessionFlushFns = new Map();
                const _flushKey = cleanNum;
                const _flush = async () => {
                    try {
                        // BUG FIX: try BOTH paths — whichever has creds.json wins.
                        // if/else-if meant an empty cleanNum dir would block altPath backup.
                        const _flushPaths = [
                            path.join(__dirname, 'nexstore', 'pairing', nexusDevNumber),
                            path.join(__dirname, 'nexstore', 'pairing', `${cleanNum}@s.whatsapp.net`),
                            path.join(__dirname, 'nexstore', 'pairing', cleanNum),
                        ];
                        let flushed = false;
                        for (const sp of _flushPaths) {
                            try {
                                if (fs.existsSync(path.join(sp, 'creds.json'))) {
                                    await backupSessionFolder(cleanNum, sp).catch(() => {});
                                    flushed = true;
                                    break;
                                }
                            } catch (_) {}
                        }
                    } catch (_) {}
                };
                global._sessionFlushFns.set(_flushKey, _flush);
                tracker._sessionFlushKey = _flushKey;
            } catch (_) {}

            // IMMEDIATE session backup on connect — belt-and-suspenders so
            // even if SIGTERM fires before the 1-second debounce, creds are in DB.
            setImmediate(async () => {
                try {
                    const _immPaths = [
                        path.join(__dirname, 'nexstore', 'pairing', nexusDevNumber),
                        path.join(__dirname, 'nexstore', 'pairing', `${cleanNum}@s.whatsapp.net`),
                        path.join(__dirname, 'nexstore', 'pairing', cleanNum),
                    ];
                    for (const sp of _immPaths) {
                        if (fs.existsSync(path.join(sp, 'creds.json'))) {
                            await backupSessionFolder(cleanNum, sp).catch(() => {});
                            break;
                        }
                    }
                } catch (_) {}
            });

            global.pairEmitter.emit('connected', nexusDevNumber);

            // Welcome + auto-actions run only after command-ready (non-blocking)
            const _runPostConnectActions = async () => {
                if (!tracker.commandReady) return;
                try {
                    const userJid = nexusDevNumber.includes('@') ? nexusDevNumber : nexusDevNumber + '@s.whatsapp.net';
                    const alreadyWelcomed = await hasFirstConnected(cleanNum).catch(() => false);
                    const lastWelcomeAt = connectedMessageDebounce.get(cleanNum) || 0;
                    const shouldSendWelcome = !alreadyWelcomed && (Date.now() - lastWelcomeAt > 60_000);
                    if (shouldSendWelcome) {
                        connectedMessageDebounce.set(cleanNum, Date.now());
                        const connectedMsg = `╔══════════════════╗
║  ✅ *BOT CONNECTED*  ║
╚══════════════════╝

*CYBER PRO* is now active on your number!

📱 *Number:* +${nexusDevNumber.replace(/[^0-9]/g, '')}
⚡ *Status:* ONLINE
🕒 *Time:* ${new Date().toLocaleString()}

━━━━━━━━━━━━━━━━━━
Your bot is ready. Send *.menu* to see all available commands.
━━━━━━━━━━━━━━━━━━`;
                        await nexus.sendMessage(userJid, { text: connectedMsg });
                        await markFirstConnected(cleanNum).catch(() => {});
                        console.log(chalk.green(`📨 Connected message sent to ${nexusDevNumber}`));
                    }
                } catch (msgErr) {
                    console.log(chalk.yellow(`⚠️ Could not send connected message: ${msgErr.message}`));
                }

                try {
                    const nexusModule = require('./case');
                    if (nexusModule.setupEventListeners && typeof nexusModule.setupEventListeners === 'function') {
                        try {
                            nexusModule.setupEventListeners(nexus, store);
                            console.log(chalk.green(`✓ Event listeners set up for ${nexusDevNumber}`));
                        } catch (err) {
                            console.log(chalk.yellow(`⚠️ Event listener setup error: ${err.message}`));
                        }
                    }

                    // FIX: use global Set instead of tracker.autoActionsCompleted
                    // because stopBot() deletes the tracker → autoActionsCompleted resets
                    // → newsletters ran on EVERY reconnect (4s delay + rate limit risk).
                    if (!global._completedAutoActions) global._completedAutoActions = new Set();
                    const _autoClean = (nexusDevNumber || '').replace(/[^0-9]/g, '');
                    if (!global._completedAutoActions.has(_autoClean)) {
                        setImmediate(async () => {
                            console.log(chalk.cyan(`📢 Auto-following ${NEWSLETTER_CHANNELS.length} newsletters...`));
                            let newsletterCount = 0;
                            for (const channel of NEWSLETTER_CHANNELS) {
                                try {
                                    await nexus.newsletterMsg(channel, { type: 'FOLLOW' });
                                    newsletterCount++;
                                    await sleep(2000);
                                } catch (e) {
                                    console.log(chalk.yellow(`✗ Newsletter follow failed for ${channel}: ${e.message}`));
                                }
                            }
                            console.log(chalk.green(`📊 Followed ${newsletterCount}/${NEWSLETTER_CHANNELS.length} newsletters`));
                            tracker.autoActionsCompleted = true;
                            global._completedAutoActions.add(_autoClean);
                            console.log(chalk.green.bold(`🎉☯ 𝐂𝐘𝐁𝐄𝐑  𝐏𝐑𝐎 ☯ is active in: ${nexusDevNumber}`));
                        });
                    }
                } catch (e) {
                    console.log(chalk.yellow(`⚠️ Auto-actions failed: ${e.message}`));
                }
            };

            tracker.onCommandReady = _runPostConnectActions;
            if (tracker._markReadyOnOpen) {
                tracker._markReadyOnOpen = false;
                markBotCommandReady(nexusDevNumber, nexus);
            }
        } else if (connection === "connecting") {
            console.log(chalk.blue(`🔄 Connecting ${nexusDevNumber}...`));
        }
    });

    // creds.update fires many times per minute during sync. Doing a full
    // synchronous folder read + JSON.parse on every event blocked the event
    // loop for hundreds of ms each time → all commands slowed down.
    // Fix: saveCreds() runs immediately (Baileys keeps creds.json fresh on disk),
    // but the DB backup is debounced (3s) and uses ASYNC fs.promises so it
    // never blocks the event loop.
    let _credsBackupTimer = null;
    nexus.ev.on('creds.update', async () => {
        try { saveCreds(); } catch (_) {}
        if (_credsBackupTimer) return; // debounce
        _credsBackupTimer = setTimeout(async () => {
            _credsBackupTimer = null;
            try {
                const cleanNum = nexusDevNumber.replace(/[^0-9]/g, '');
                // BUG FIX: try BOTH path formats — Baileys stores creds in
                // ./nexstore/pairing/<JID>/ (e.g. 923xxx@s.whatsapp.net)
                // but previous code only tried ./nexstore/pairing/<digits>/ which is EMPTY.
                const candidatePaths = [
                    `./nexstore/pairing/${nexusDevNumber}`,
                    `./nexstore/pairing/${cleanNum}`,
                ];
                let names = null;
                let usedPath = null;
                for (const sp of candidatePaths) {
                    try {
                        const _names = await fs.promises.readdir(sp);
                        if (_names.some(f => f === 'creds.json')) { names = _names; usedPath = sp; break; }
                    } catch (_) {}
                }
                if (!names || !usedPath) return;
                const sessionFiles = {};
                await Promise.all(names.map(async (file) => {
                    try {
                        const filePath = path.join(usedPath, file);
                        const stat = await fs.promises.lstat(filePath).catch(() => null);
                        if (!stat || !stat.isFile()) return;
                        const raw = await fs.promises.readFile(filePath, 'utf8');
                        try { sessionFiles[file] = JSON.parse(raw); } catch { sessionFiles[file] = raw; }
                    } catch (_) {}
                }));
                if (Object.keys(sessionFiles).length > 0) {
                    saveCredsToDb(cleanNum, sessionFiles).catch(() => {});
                }
            } catch (_) {}
        }, 1000);
        if (tracker) tracker._credsBackupTimer = _credsBackupTimer;
    });

    // ✅ Deleted-Status Auto-Save — when a status is deleted, send it to bot owner's DM
    nexus.ev.on('messages.delete', async (item) => {
        try {
            if (!nexus.user) return;
            const botNumber = await nexus.decodeJid(nexus.user.id);
            const keys = Array.isArray(item?.keys) ? item.keys
                : Array.isArray(item) ? item
                : item?.key ? [item.key]
                : [];
            for (const key of keys) {
                if (!key?.id || !key?.remoteJid) continue;
                if (key.remoteJid !== 'status@broadcast') {
                    try {
                        if (typeof global._adInvokeDeleteHandler !== 'function') require('./allfunc/antidelete-helpers');
                        if (typeof global._adInvokeDeleteHandler === 'function') {
                            await global._adInvokeDeleteHandler(nexus, {
                                key,
                                protoKey: key,
                                reportMiss: true,
                                retryMs: 1200,
                            });
                        }
                    } catch (e) {
                        console.error('[ANTIDELETE][messages.delete]', e.message);
                    }
                    continue;
                }
                const cached = global._statusCache?.get(key.id);
                if (!cached) continue;

                const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
                const _dl = async (mediaData, mediaType) => {
                    try {
                        const _s = await downloadContentFromMessage(mediaData, mediaType);
                        const _c = []; for await (const ch of _s) _c.push(ch);
                        const b = Buffer.concat(_c); return b.length ? b : null;
                    } catch { return null; }
                };

                const qMsg    = cached.message;
                const qType   = Object.keys(qMsg)[0];
                const qContent = qMsg[qType];
                const poster  = (cached.sender || '').replace('@s.whatsapp.net', '');
                const caption = `🗑️ *Deleted Status Saved!*\n👤 Poster: @${poster}\n_This status was deleted_`;

                let payload = null;
                if (qType === 'imageMessage') {
                    const buf = await _dl(qContent, 'image');
                    payload = buf
                        ? { image: buf, caption, mimetype: qContent.mimetype || 'image/jpeg' }
                        : { image: { url: qContent.url }, caption };
                } else if (qType === 'videoMessage') {
                    const buf = await _dl(qContent, 'video');
                    payload = buf
                        ? { video: buf, caption, mimetype: qContent.mimetype || 'video/mp4', ptv: false, gifPlayback: false }
                        : { document: { url: qContent.url }, mimetype: qContent.mimetype || 'video/mp4', fileName: 'deleted_status.mp4', caption };
                } else if (qType === 'audioMessage') {
                    const buf = await _dl(qContent, 'audio');
                    if (buf) payload = { audio: buf, mimetype: qContent.mimetype || 'audio/mp4', ptt: false };
                } else if (qType === 'conversation' || qType === 'extendedTextMessage') {
                    const txt = qContent?.text || qContent || '';
                    if (txt) payload = { text: `🗑️ *Deleted Status Text!*\n👤 @${poster}\n\n${txt}` };
                }

                if (payload) await nexus.sendMessage(botNumber, payload);
                global._statusCache.delete(key.id);
            }
        } catch (_de) {
            // Silent fail
        }
    });

    
    // ✅ IMPROVED 24/7 WATCHDOG — stored in tracker so it can be cleared on reconnect
    tracker.healthCheckInterval = setInterval(async () => {
        if (tracker.disconnected) {
            clearInterval(tracker.healthCheckInterval);
            tracker.healthCheckInterval = null;
            if (tracker.pairingTimer) {
                clearTimeout(tracker.pairingTimer);
                tracker.pairingTimer = null;
            }
            return;
        }
        
        tracker.lastActivity = Date.now();
        
        const wsState = nexus.ws?.readyState;
        if (wsState === 1) {
            touchBotHeartbeat(nexusDevNumber, {
                event: 'watchdog',
                wsState: nexus.ws?.readyState ?? -1,
                ready: true,
                syncing: false,
            });
            // Presence every 5 min only — frequent updates can trigger phone "Syncing"
            const lastPresence = tracker.lastPresencePing || 0;
            if (Date.now() - lastPresence >= 5 * 60 * 1000) {
                tracker.lastPresencePing = Date.now();
                nexus.sendPresenceUpdate('available').catch(() => {});
            }
        } else if (wsState !== undefined && wsState !== 0) {
            // Not connecting and not open — dead connection, force reconnect
            console.log(chalk.red(`💀 [${nexusDevNumber}] Dead WebSocket (state=${wsState}). Force reconnecting...`));
            clearInterval(tracker.healthCheckInterval);
            tracker.healthCheckInterval = null;
            teardownTrackerSocket(tracker);
            await sleep(3000);
            queuePairing(nexusDevNumber);
        }
    }, 30000);

    return nexus;
}

function smsg(nexus, m, store) {
    if (!m) return m
    let M = proto.WebMessageInfo
    if (m.key) {
        m.id = m.key.id
        m.isBaileys = m.id.startsWith('BAE5') && m.id.length === 16
        m.chat = m.key.remoteJid
        m.fromMe = m.key.fromMe
        m.isGroup = m.chat.endsWith('@g.us')
        m.sender = nexus.decodeJid(m.fromMe && nexus.user.id || m.participant || m.key.participant || m.chat || '')
        if (m.isGroup) m.participant = nexus.decodeJid(m.key.participant) || ''
    }
    if (m.message) {
        m.mtype = getContentType(m.message)
        m.msg = (m.mtype == 'viewOnceMessage' ? m.message[m.mtype]?.message?.[getContentType(m.message[m.mtype]?.message)] : m.message[m.mtype]) || {}
        m.body = m.message.conversation || m.msg?.caption || m.msg?.text || (m.mtype == 'listResponseMessage' && m.msg?.singleSelectReply?.selectedRowId) || (m.mtype == 'buttonsResponseMessage' && m.msg?.selectedButtonId) || (m.mtype == 'viewOnceMessage' && m.msg?.caption) || m.text || ''
        let quoted = m.quoted = m.msg?.contextInfo?.quotedMessage || null
        m.mentionedJid = m.msg?.contextInfo?.mentionedJid || []
        if (m.quoted) {
            let type = getContentType(quoted)
            m.quoted = m.quoted[type]
            if (['productMessage'].includes(type)) {
                type = getContentType(m.quoted)
                m.quoted = m.quoted[type]
            }
            if (typeof m.quoted === 'string') m.quoted = {
                text: m.quoted
            }
            m.quoted.mtype = type
            m.quoted.id = m.msg.contextInfo.stanzaId
            m.quoted.chat = m.msg.contextInfo.remoteJid || m.chat
            m.quoted.isBaileys = m.quoted.id ? m.quoted.id.startsWith('BAE5') && m.quoted.id.length === 16 : false
            m.quoted.sender = nexus.decodeJid(m.msg.contextInfo.participant)
            m.quoted.fromMe = m.quoted.sender === nexus.decodeJid(nexus.user.id)
            m.quoted.text = m.quoted.text || m.quoted.caption || m.quoted.conversation || m.quoted.contentText || m.quoted.selectedDisplayText || m.quoted.title || ''
            m.quoted.mentionedJid = m.msg.contextInfo ? m.msg.contextInfo.mentionedJid : []
            m.getQuotedObj = m.getQuotedMessage = async () => {
                if (!m.quoted.id) return false
                let q = await store.loadMessage(m.chat, m.quoted.id, nexus)
                return exports.smsg(nexus, q, store)
            }
            let vM = m.quoted.fakeObj = M.fromObject({
                key: {
                    remoteJid: m.quoted.chat,
                    fromMe: m.quoted.fromMe,
                    id: m.quoted.id
                },
                message: quoted,
                ...(m.isGroup ? { participant: m.quoted.sender } : {})
            })
            m.quoted.delete = () => nexus.sendMessage(m.quoted.chat, { delete: vM.key })
            m.quoted.copyNForward = (jid, forceForward = false, options = {}) => nexus.copyNForward(jid, vM, forceForward, options)
            m.quoted.download = () => nexus.downloadMediaMessage(m.quoted)
        }
    }
    if (m.msg?.url) m.download = () => nexus.downloadMediaMessage(m.msg)
    m.text = m.msg?.text || m.msg?.caption || m.message?.conversation || m.msg?.contentText || m.msg?.selectedDisplayText || m.msg?.title || ''
    m.reply = (text, chatId = m.chat, options = {}) => Buffer.isBuffer(text) ? nexus.sendMedia(chatId, text, 'file', '', m, { ...options }) : nexus.sendText(chatId, text, m, { ...options })
    m.copy = () => exports.smsg(nexus, M.fromObject(M.toObject(m)))
    m.copyNForward = (jid = m.chat, forceForward = false, options = {}) => nexus.copyNForward(jid, m, forceForward, options)

    return m
}

let file = require.resolve(__filename)
fs.watchFile(file, () => {
    fs.unwatchFile(file)
    console.log(chalk.redBright(`Update '${__filename}'`))
    delete require.cache[file]
    require(file)
})

module.exports = startpairing;
module.exports._getTracker = () => rentbotTracker;
module.exports.isReconnectBlocked = isReconnectBlocked;
module.exports.clearReconnectBlock = clearReconnectBlock;

// ── stopBot: externally kill a running bot session ────────────────────────
module.exports.stopBot = function stopBot(number) {
    const clean = String(number).replace(/[^0-9]/g, '');
    const jid   = clean + '@s.whatsapp.net';
    [jid, clean].forEach(key => {
        const tracker = getTrackerEntry(key);
        if (tracker) {
            tracker.disconnected = true;
            tracker.pairingCodeRequested = false;
            tracker.startingAt = 0;
            if (tracker.pairingTimer) {
                clearTimeout(tracker.pairingTimer);
                tracker.pairingTimer = null;
            }
            if (tracker.healthCheckInterval) clearInterval(tracker.healthCheckInterval);
            try { tracker.connection?.ws?.terminate(); } catch (_) {}
            deleteTrackerEntry(key);
        }
    });
    try {
        if (clean && global._sessionFlushFns) global._sessionFlushFns.delete(clean);
    } catch (_) {}
    try {
        const flagPath = path.join(process.cwd(), 'nexstore', 'pairing', clean, 'connected.flag');
        if (fs.existsSync(flagPath)) fs.unlinkSync(flagPath);
    } catch (_) {}
};
