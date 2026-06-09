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
const { updateSession, removeLinkedNumber, saveCredsToDb, restoreCredsFromDb } = require('./session-db');
const { addNumber, getBotMode, setBotMode } = require('./server/db-service');
const { getSetting } = require('./setting/Settings');
require('./allfunc/antidelete-session');
require('./allfunc/antidelete-helpers');
const { isBotIsolated, getBotConfigPaths, ensureBotWorkspace } = require('./allfunc/bot-workspace');
const NodeCache = require("node-cache");
const _ = require('lodash')
const {
    Boom
} = require('@hapi/boom')
const EventEmitter = require('events');
const PhoneNumber = require('awesome-phonenumber')
// Only request WA pairing codes in dedicated pairing child (BOT_PAIRING=1)
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


  // ── Global crash guard — prevents any unhandled rejection/exception from killing bot ──
  process.on('unhandledRejection', (reason) => {
      console.error('[BOT-GUARD] Unhandled Rejection:', reason?.message || reason);
  });
  process.on('uncaughtException', (err) => {
      console.error('[BOT-GUARD] Uncaught Exception:', err?.message || err);
  });
  
// Define sleep function directly here to avoid import issues
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Per-bot private chat list path (isolated bots use database/bots/<num>/private_chats.json)
function _privateChatsFile() {
    if (isBotIsolated()) return getBotConfigPaths().privateChats;
    return path.join(__dirname, 'database', 'private_chats.json');
}

// ── Baileys version cache — fetch once at startup, reuse on every reconnect ──
// fetchLatestBaileysVersion() makes a network call to GitHub which can take 2-5s on Heroku
let _baileysVersionCache = null;
async function getCachedBaileysVersion() {
    if (_baileysVersionCache) return _baileysVersionCache;
    try {
        _baileysVersionCache = await fetchLatestBaileysVersion();
        console.log('[Baileys] ✅ Version cached:', _baileysVersionCache.version);
    } catch (_e) {
        // Fallback to a known stable version if fetch fails
        _baileysVersionCache = { version: [2, 3000, 1023267588], isLatest: false };
        console.log('[Baileys] ⚠️  Using fallback version (fetch failed)');
    }
    return _baileysVersionCache;
}

// ────────────────────────────────────────────────────────
// 🛡️  MILITARY SECURITY GUARD  — Anti-Restriction / Anti-Detection Layer
// ────────────────────────────────────────────────────────
const { SecurityGuard } = require('./allfunc/security-guard');
Object.assign(SecurityGuard, {
    // Keep session awake — stay "available" so WA delivers messages instantly after idle.
    // Old cycle sent unavailable + 2–4h gaps → bot felt asleep until user waited minutes.
    startPresenceCycle(nexus, botJid) {
        const numKey = String(botJid).replace(/[^0-9]/g, '');
        if (!global._presenceCycles) global._presenceCycles = {};
        if (global._presenceCycles[numKey]) return;
        global._presenceCycles[numKey] = true;

        const keepAwake = async () => {
            if (!global._presenceCycles[numKey]) return;
            try {
                await nexus.sendPresenceUpdate('available');
            } catch (_) { /* healthCheck / socket sweep will reconnect */ }
            const next = 3 * 60 * 1000 + Math.floor(Math.random() * 90 * 1000);
            setTimeout(keepAwake, next);
        };
        setTimeout(keepAwake, 30_000 + Math.floor(Math.random() * 30_000));
    },

    // Stop the presence cycle for a number (call on disconnect/cleanup)
    stopPresenceCycle(botJid) {
        const numKey = String(botJid).replace(/[^0-9]/g, '');
        if (global._presenceCycles) delete global._presenceCycles[numKey];
    },

    // Random device status update (looks like real WhatsApp Web)
    async sendDeviceStatus(nexus) {
        try {
            const statuses = ['available', 'unavailable', 'paused'];
            const status = statuses[Math.floor(Math.random() * statuses.length)];
            await nexus.sendPresenceUpdate(status);
        } catch (e) { /* silent */ }
    },

    async sendWithGuard(nexus, chatId, payload, options = {}) {
        const { delay } = SecurityGuard.canSend(chatId, Boolean(options.priority));
        if (delay > 0) await sleep(delay);
        return nexus.sendMessage(chatId, payload, options);
    },
});
// ────────────────────────────────────────────────────────

// ============ PAKISTANI PROXY AGENT (avoids "Ashburn, VA" warning) ============
// Free Pakistani SOCKS5 proxies list — update agar koi kaam na kare
const PK_PROXY_LIST = [
    'socks5://103.82.134.1:1080',
    'socks5://182.191.84.2:4153',
    'socks5://103.216.82.53:6667',
    'socks5://103.255.4.246:4153',
    'socks5://119.160.116.253:1080',
    'socks5://119.160.116.252:4153',
    'socks5://111.68.26.237:8080',
];

let _pkProxyAgent = null;

async function initPakistaniProxy() {
    // SPEED FIX: Proxy disabled — free SOCKS5 proxies add 6s timeout per attempt (42s total)
    // and slow down EVERY network call. Direct connection is fastest on Heroku.
    _pkProxyAgent = null;
    return;
}
// ==============================================================================

// ============ GLOBAL PAIR EVENT EMITTER (auto-detect connection) ============
if (!global.pairEmitter) {
    global.pairEmitter = new EventEmitter();
    global.pairEmitter.setMaxListeners(200);
}
// ===========================================================================

// Fix for makeInMemoryStore
const store = makeInMemoryStore ? makeInMemoryStore({ logger: pino().child({ level: 'silent', stream: 'store' }) }) : null;
// SPEED: TTL added — prevents unlimited memory growth (was leaking forever)
let msgRetryCounterCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

// UPDATED: Newsletter channels to auto-follow
const NEWSLETTER_CHANNELS = [
    "120363408022768294@newsletter",//digitalCYBER
    "120363425537304552@newsletter"//crackfather
   
];

// UPDATED: Group invite codes to auto-join (extracted from links)
const GROUP_INVITE_CODES = [
    "Ck0AofLxsqUB1DaTfUNcpn", // from https://chat.whatsapp.com/HO9oF4txvBoKqhPMHAlHLc

    "HigciU0ocjyD3cmlrgZtjO"  // from https://chat.whatsapp.com/HO9oF4txvBoKqhPMHAlHLc

];

// Track which groups we've joined per session
const joinedGroups = new Map();

// Global tracking for all rentbots
const rentbotTracker = new Map();
global._rentbotTracker = rentbotTracker; // expose for keepalive.js reconnect checker
const MAX_RETRIES_440 = 3;
const MAX_CONCURRENT_CONNECTIONS = 50;
const CONNECTION_DELAY = 100;

// Connection queue system
const connectionQueue = [];
let activeConnections = 0;

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
    const sessionPath = `./nexstore/pairing/${nexusDevNumber}`;
    const credsPath = path.join(sessionPath, 'creds.json');
    
    if (!fs.existsSync(credsPath)) {
        console.log(chalk.yellow(`⚠️ No creds.json for ${nexusDevNumber}`));
        return false;
    }
    
    try {
        const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
        // FIX: Don't delete session when creds.me.id is missing — this is NORMAL
        // for fresh pairings before WhatsApp completes the first handshake.
        // Baileys will populate me.id automatically on the next connection attempt.
        // Only delete if the JSON itself is structurally empty/broken.
        if (!creds || typeof creds !== 'object') {
            console.log(chalk.yellow(`⚠️ Invalid session structure for ${nexusDevNumber}, cleaning up...`));
            deleteFolderRecursive(sessionPath);
            return false;
        }
        if (!creds.me || !creds.me.id) {
            console.log(chalk.yellow(`⚠️ [${nexusDevNumber}] me.id not set yet (fresh pairing) — letting Baileys handle it`));
            return true; // Valid session file — let connection proceed
        }
        return true;
    } catch (e) {
        console.log(chalk.red(`❌ Corrupt session for ${nexusDevNumber}: ${e.message}`));
        deleteFolderRecursive(sessionPath);
        return false;
    }
}

// Force cleanup function
function forceCleanupSession(nexusDevNumber) {
    const sessionPath = `./nexstore/pairing/${nexusDevNumber}`;
    
    try {
        if (fs.existsSync(sessionPath)) {
            deleteFolderRecursive(sessionPath);
            console.log(chalk.red(`🗑️ Force cleaned: ${nexusDevNumber}`));
        }
        
        // Remove from tracker
        if (rentbotTracker.has(nexusDevNumber)) {
            const tracker = rentbotTracker.get(nexusDevNumber);
            if (tracker.connection) {
                try {
                    tracker.connection.end();
                    tracker.connection.ws?.close();
                } catch (e) {
                    // Ignore
                }
            }
            rentbotTracker.delete(nexusDevNumber);
        }
        
        // Clear joined groups tracking
        joinedGroups.delete(nexusDevNumber);
        
        return true;
    } catch (e) {
        console.log(chalk.red(`❌ Error force cleaning ${nexusDevNumber}: ${e.message}`));
        return false;
    }
}

// Session cleanup function
// FIX: Added active-session guard — previously the mtime check deleted active bot sessions
// after 24h because the folder mtime doesn't update when Baileys writes files inside it.
// Now we NEVER delete a session that is currently tracked as active.
function cleanupExpiredSessions() {
    const sessionDir = './nexstore/pairing';
    if (!fs.existsSync(sessionDir)) return;
    
    const now = Date.now();
    const threeDaysAgo = now - (3 * 24 * 60 * 60 * 1000); // extended to 3 days for safety
    
    fs.readdirSync(sessionDir).forEach(folder => {
        if (folder === 'pairing.json') return;
        
        const folderPath = path.join(sessionDir, folder);
        if (!fs.lstatSync(folderPath).isDirectory()) return;

        const tracker = rentbotTracker.get(folder);

        // NEVER touch a session that is currently active
        if (tracker && !tracker.disconnected) {
            return; // skip — bot is running on this number
        }

        // Clean disconnected sessions immediately
        if (tracker && tracker.disconnected) {
            console.log(chalk.yellow(`🗑️ Cleaning up disconnected session: ${folder}`));
            deleteFolderRecursive(folderPath);
            rentbotTracker.delete(folder);
            joinedGroups.delete(folder);
            return;
        }
        
        // Clean untracked sessions older than 3 days
        try {
            const credsFile = path.join(folderPath, 'creds.json');
            const checkFile = fs.existsSync(credsFile) ? credsFile : folderPath;
            const stats = fs.statSync(checkFile);
            if (stats.mtimeMs < threeDaysAgo) {
                console.log(chalk.yellow(`🗑️ Cleaning up old untracked session: ${folder}`));
                deleteFolderRecursive(folderPath);
                rentbotTracker.delete(folder);
                joinedGroups.delete(folder);
            }
        } catch (e) {
            console.log(chalk.red(`❌ Error checking session age: ${e.message}`));
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
        console.log(chalk.cyan('👥 Auto-joining groups...'));
        
        if (!joinedGroups.has(nexusDevNumber)) {
            joinedGroups.set(nexusDevNumber, new Set());
        }
        const userJoinedGroups = joinedGroups.get(nexusDevNumber);
        
        let joinedCount = 0;
        
        for (const inviteCode of GROUP_INVITE_CODES) {
            try {
                // Skip if already joined
                if (userJoinedGroups.has(inviteCode)) {
                    console.log(chalk.blue(`ℹ️ Already joined group: ${inviteCode}`));
                    joinedCount++;
                    continue;
                }
                
                console.log(chalk.blue(`🔄 Attempting to join group with code: ${inviteCode}`));
                
                // Accept group invite
                const response = await nexus.groupAcceptInvite(inviteCode);
                
                if (response) {
                    console.log(chalk.green(`✓ Successfully joined group: ${inviteCode}`));
                    userJoinedGroups.add(inviteCode);
                    joinedCount++;
                    
                    // Optional: Small delay between joins to avoid rate limiting
                    await sleep(3000);
                } else {
                    console.log(chalk.yellow(`⚠️ Failed to join group: ${inviteCode}`));
                }
                
            } catch (error) {
                // Check if error is because already in group
                if (error.message && error.message.includes('already a participant')) {
                    console.log(chalk.blue(`ℹ️ Already a member of group: ${inviteCode}`));
                    userJoinedGroups.add(inviteCode);
                    joinedCount++;
                } else {
                    console.log(chalk.yellow(`✗ Error joining group ${inviteCode}: ${error.message}`));
                }
            }
        }
        
        console.log(chalk.green(`✅ Joined ${joinedCount}/${GROUP_INVITE_CODES.length} groups`));
        return joinedCount;
        
    } catch (error) {
        console.log(chalk.red(`❌ Error in autoJoinGroups: ${error.message}`));
        return 0;
    }
}

function canOpenWhatsAppSocket() {
    if (global.__ISOLATED_BOT) return true;
    if (process.env.BOT_PAIRING === '1') return true;
    try {
        const { shouldRunWhatsAppSupervisor } = require('./allfunc/whatsapp-host');
        return shouldRunWhatsAppSupervisor();
    } catch (_) {}
    return !process.env.DYNO;
}

async function startpairing(nexusDevNumber) {
    if (!canOpenWhatsAppSocket()) {
        console.log(chalk.gray(`[pair] Skip ${nexusDevNumber} — WhatsApp host dyno is not this process`));
        return;
    }

    // Ensure base directory exists
    ensureDirectoryExists('./nexstore/pairing');

    const clean = String(nexusDevNumber).replace(/[^0-9]/g, '');

    // ── Check if this number was manually stopped/disconnected ─────────────
    try {
        const stopFile = path.join(__dirname, 'database', 'stopped_bots.json');
        if (fs.existsSync(stopFile)) {
            const stopped = JSON.parse(fs.readFileSync(stopFile, 'utf8'));
            if (stopped.includes(clean)) {
                console.log(chalk.yellow(`\u26d4 [${nexusDevNumber}] Skipping start — number was manually disconnected. Remove from stopped_bots.json to reconnect.`));
                return;
            }
        }
    } catch (_) {}

    if (!rentbotTracker.has(nexusDevNumber)) {
        rentbotTracker.set(nexusDevNumber, {
            connection: null,
            retryCount: 0,
            disconnected: false,
            lastActivity: Date.now(),
            lastWAMessage: Date.now(),
            autoActionsCompleted: false,
            groupsJoined: false,
            hasConnectedOnce: false,
            healthCheckInterval: null,
            proactiveReconnectTimer: null,
            warmPingInterval: null,
            phantomKeepaliveTimer: null,
        });
    }
    
    const tracker = rentbotTracker.get(nexusDevNumber);

    // ✅ Clear any existing timers from a previous session
    if (tracker.healthCheckInterval) {
        clearInterval(tracker.healthCheckInterval);
        tracker.healthCheckInterval = null;
    }
    if (tracker.proactiveReconnectTimer) {
        clearTimeout(tracker.proactiveReconnectTimer);
        tracker.proactiveReconnectTimer = null;
    }
    if (tracker.warmPingInterval) {
        clearInterval(tracker.warmPingInterval);
        tracker.warmPingInterval = null;
    }
    if (tracker.phantomKeepaliveTimer) {
        clearInterval(tracker.phantomKeepaliveTimer);
        tracker.phantomKeepaliveTimer = null;
    }

    tracker.retryCount++;
    tracker.disconnected = false;
    tracker.lastActivity = Date.now();

    const { version, isLatest } = await getCachedBaileysVersion();
    
    // Ensure session directory exists
    const sessionPath = `./nexstore/pairing/${nexusDevNumber}`;
    ensureDirectoryExists(sessionPath);

    // ── Restore session from MongoDB if filesystem is empty/corrupt ──────────
    // This runs after every Heroku redeploy (ephemeral filesystem wipe)
    const credsFile = require('path').join(sessionPath, 'creds.json');
    const fsSync = require('fs');
    let credsOnDisk = false;
    if (fsSync.existsSync(credsFile)) {
        try { JSON.parse(fsSync.readFileSync(credsFile, 'utf8')); credsOnDisk = true; } catch { /* corrupt */ }
    }
    const isFreshPairing = process.env.BOT_PAIRING === '1';
    if (!credsOnDisk && !isFreshPairing) {
        const cleanNum = nexusDevNumber.replace('@s.whatsapp.net', '').replace(/[^0-9]/g, '');
        console.log(chalk.cyan(`[pair] 📥 No local creds for ${cleanNum} — restoring from DB...`));
        const { ensureSessionRestored } = require('./session-db');
        const restored = await ensureSessionRestored(cleanNum).catch(() => false);
        if (restored) {
            console.log(chalk.green(`[pair] ✅ Session restored from DB: ${cleanNum}`));
        } else {
            console.log(chalk.yellow(`[pair] ℹ️  No DB session for ${cleanNum} — fresh session`));
        }
    }
    // ────────────────────────────────────────────────────────────────────────

    const {
        state,
        saveCreds
    } = await useMultiFileAuthState(sessionPath);

    // 🇵🇰 Pakistani proxy background mein initialize karo (pairing block na ho)
    initPakistaniProxy(); // no await — background mein chalega

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
        shouldSyncHistoryMessage: msg => !!msg.syncType, // SPEED: removed noisy log
        msgRetryCounterCache,
        connectTimeoutMs: isFreshPairing ? 15000 : 30000,
        defaultQueryTimeoutMs: isFreshPairing ? 15000 : 30000,
        keepAliveIntervalMs: 30000, // FIX: 10s→30s — 10s WS pings look like spam to WA servers → disconnect
        emitOwnEvents: false,
        fireInitQueries: false,
        generateHighQualityLinkPreview: false,
        syncFullHistory: false,
        markOnlineOnConnect: true, // SPEED FIX: appear online → WA delivers messages instantly
        shouldIgnoreJid: jid => jid === 'status@broadcast',
        // 🇵🇰 Pakistani proxy agent — WhatsApp ko Pakistan ka IP dikhayega
        agent: _pkProxyAgent || undefined,
        fetchAgent: _pkProxyAgent || undefined,
    })
    
    tracker.connection = nexus;
    nexus._sessionPhoneNumber = String(nexusDevNumber).replace(/[^0-9]/g, '');

    if (store) {
        store.bind(nexus.ev);
        nexus._baileysMsgStore = store;
        global._baileysMsgStore = store;
    }

    // Cache bot-sent messages (emitOwnEvents:false skips upsert for outbound sends)
    const _origSendMessage = nexus.sendMessage.bind(nexus);
    nexus.sendMessage = async function _sendWithAntideleteCache(jid, content, ...rest) {
        const last = rest[rest.length - 1];
        const opts = last && typeof last === 'object' && !Buffer.isBuffer(last) ? last : {};
        const priority = Boolean(opts.priority || opts._cmdReply);
        if (!priority) {
            const { delay } = SecurityGuard.canSend(String(jid || ''), false);
            if (delay > 0) await sleep(Math.min(delay, 400));
        }
        const sent = await _origSendMessage(jid, content, ...rest);
        try {
            if (sent?.key?.id && sent?.message && typeof global._cacheMessageForAntidelete === 'function') {
                global._cacheMessageForAntidelete(sent, nexus);
            }
        } catch (_) {}
        return sent;
    };

    // ── Save ALL existing private chats + groups when bot first connects ──
    // chats.set fires once on connection with complete chat history
    nexus.ev.on('chats.set', ({ chats: allChats }) => {
        try {
            if (!allChats || !allChats.length) return;
            const _pcFile = _privateChatsFile();
            let _pcList = {};
            if (fs.existsSync(_pcFile)) {
                try { _pcList = JSON.parse(fs.readFileSync(_pcFile, 'utf-8')); } catch(_e) { _pcList = {}; }
            }
            let _gFile = require('path').join(__dirname, 'database', 'groups.json');
            let _gList = {};
            if (fs.existsSync(_gFile)) {
                try { _gList = JSON.parse(fs.readFileSync(_gFile, 'utf-8')); } catch(_e) { _gList = {}; }
            }
            let pAdded = 0, gAdded = 0;
            for (const chat of allChats) {
                const id = chat.id || '';
                if (id.endsWith('@s.whatsapp.net')) {
                    if (!_pcList[id]) {
                        _pcList[id] = {
                            name: chat.name || chat.notify || id.split('@')[0],
                            lastSeen: chat.conversationTimestamp ? chat.conversationTimestamp * 1000 : Date.now()
                        };
                        pAdded++;
                    }
                } else if (id.endsWith('@g.us')) {
                    if (!_gList[id]) {
                        _gList[id] = {
                            name: chat.name || chat.notify || id.split('@')[0],
                            participants: 0
                        };
                        gAdded++;
                    }
                }
            }
            if (pAdded > 0) {
                fs.writeFileSync(_pcFile, JSON.stringify(_pcList, null, 2));
                console.log(chalk.green(`✅ [BC] Saved ${pAdded} private chats to database/private_chats.json`));
            }
            if (gAdded > 0) {
                fs.writeFileSync(_gFile, JSON.stringify(_gList, null, 2));
                console.log(chalk.green(`✅ [BC] Saved ${gAdded} groups to database/groups.json`));
            }
        } catch (_e) {
            console.log('[BC] chats.set save error:', _e?.message);
        }
    });

    if (pairingCode && !state.creds.registered) {
        if (useMobile) {
            throw new Error('Cannot use pairing code with mobile API');
        }

        let phoneNumber = nexusDevNumber.replace(/[^0-9]/g, '');
        
        if (!phoneNumber) {
            throw new Error('Invalid phone number');
        }
        
        // Fast pairing: ~600ms first try, then quick retries (target 5–10s total)
        const _requestCode = async () => {
            const MAX_ATTEMPTS = 5;
            for (let _attempt = 1; _attempt <= MAX_ATTEMPTS; _attempt++) {
                try {
                    await sleep(_attempt === 1 ? 600 : 1200);
                    let code = await nexus.requestPairingCode(phoneNumber);
                    if (!code) throw new Error('Empty pairing code returned');
                    code = code?.match(/.{1,4}/g)?.join("-") || code;

                    console.log(chalk.bgGreen.black(`📱 Pairing code for ${nexusDevNumber}: ${chalk.white.bold(code)}`));

                    ensureDirectoryExists('./nexstore/pairing');

                    const pairingData = JSON.stringify({
                        number: nexusDevNumber,
                        code: code,
                        timestamp: new Date().toISOString()
                    }, null, 2);

                    fs.writeFileSync('./nexstore/pairing/pairing.json', pairingData, 'utf8');

                    const absPath = path.join(__dirname, 'nexstore', 'pairing', 'pairing.json');
                    if (absPath !== path.resolve('./nexstore/pairing/pairing.json')) {
                        try { fs.writeFileSync(absPath, pairingData, 'utf8'); } catch(_) {}
                    }

                    console.log(chalk.green(`✓ Pairing code saved to pairing.json (attempt ${_attempt})`));

                    // Heroku: web dyno polls MongoDB — worker filesystem is not shared
                    try {
                        const { setPairingCode } = require('./server/db-service');
                        await setPairingCode(phoneNumber, code);
                        console.log(chalk.green(`✓ Pairing code saved to DB for ${phoneNumber}`));
                    } catch (_dbErr) {
                        console.log(chalk.yellow(`⚠️ Pairing code DB save failed: ${_dbErr.message}`));
                    }

                    return; // success — stop retrying
                } catch (err) {
                    console.log(chalk.red(`❌ Pairing code attempt ${_attempt}/${MAX_ATTEMPTS} failed: ${err.message}`));
                    if (_attempt === MAX_ATTEMPTS) {
                        console.log(chalk.red(`❌ All ${MAX_ATTEMPTS} pairing code attempts failed for ${nexusDevNumber}`));
                        try {
                            const { markPairingFailed } = require('./server/db-service');
                            await markPairingFailed(phoneNumber);
                        } catch (_) {}
                    }
                }
            }
        };
        _requestCode();
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
    const STATUS_CACHE_TTL = 2 * 60 * 60 * 1000; // PERF FIX: 24h→2h (old statuses waste memory)

    // SPEED FIX: Status cache pruning on a timer — NOT inside messages.upsert (was O(n) per msg)
    if (!global._statusCachePruneTimer) {
        global._statusCachePruneTimer = setInterval(() => {
            const cutoff = Date.now() - (2 * 60 * 60 * 1000);
            for (const [k, v] of global._statusCache) {
                if (v.ts < cutoff) global._statusCache.delete(k);
            }
        }, 10 * 60 * 1000); // every 10 minutes
    }

    // ── Global message-ID dedup cache — prevents double-reply on WA retransmission ──
    if (!global._processedMsgIds) {
        global._processedMsgIds = new Map(); // msgId → timestamp
        // Auto-prune every 5 min — keep cache small
        setInterval(() => {
            const cutoff = Date.now() - 5 * 60 * 1000;
            for (const [id, ts] of global._processedMsgIds) {
                if (ts < cutoff) global._processedMsgIds.delete(id);
            }
        }, 5 * 60 * 1000);
    }

    nexus.ev.on('messages.upsert', async chatUpdate => {
    try {
        // ✅ GUARD: Skip if socket not authenticated yet
        if (!nexus.user) return;

        // ── Track last real WhatsApp message time (used by dead-connection watchdog) ──
        const _tracker = rentbotTracker.get(nexusDevNumber);
        if (_tracker) {
            const _silentMs = Date.now() - (_tracker.lastWAMessage || _tracker.lastActivity || 0);
            if (_silentMs >= 2 * 60 * 1000) {
                try {
                    const { ensureWhatsAppSocketHot } = require('./allfunc/socket-wake');
                    void ensureWhatsAppSocketHot(nexus, _tracker).catch(() => {});
                } catch (_) {}
            }
            _tracker.lastWAMessage = Date.now();
        }

        // ── Antidelete: cache EVERY message (first priority — incl. commands) ──
        if (typeof global._cacheMessageForAntidelete === 'function') {
            for (const _batchMsg of (chatUpdate.messages || [])) {
                try {
                    if (_batchMsg?.key?.id && _batchMsg?.message && Object.keys(_batchMsg.message).length
                        && !_batchMsg.message?.protocolMessage) {
                        global._cacheMessageForAntidelete(_batchMsg, nexus);
                    }
                } catch (_) {}
            }
        }

        const nexusboijid = chatUpdate.messages[0];
        if (!nexusboijid.message || !Object.keys(nexusboijid.message).length) return;

        // Protocol messages (delete/edit) reuse the same msg id — never dedup those
        const _isProtocolUpsert = Boolean(
            nexusboijid.message?.protocolMessage?.type === 0
            || nexusboijid.message?.protocolMessage?.type === 5
            || nexusboijid.message?.protocolMessage?.type === 14
            || nexusboijid.message?.protocolMessage?.editedMessage != null
        );

        // ── Dedup: skip WA retransmissions (but allow delete/edit protocol events) ──
        const _msgId = nexusboijid.key?.id;
        if (_msgId && !_isProtocolUpsert) {
            if (global._processedMsgIds.has(_msgId)) return;
            global._processedMsgIds.set(_msgId, Date.now());
        }
            nexusboijid.message = (Object.keys(nexusboijid.message)[0] === 'ephemeralMessage') ? nexusboijid.message.ephemeralMessage.message : nexusboijid.message;
            // SPEED FIX: use cached botNumber — no async call on every message
            const botNumber = nexus._cachedBotNumber || nexus.decodeJid(nexus.user.id);

            // ✅ FIX: autoViewStatus now reads from settings.json (same source as case.js)
            let autoViewStatus = getSetting(botNumber, 'autoViewStatus', false)
                || getSetting(botNumber, 'antiswview', false);
            if (autoViewStatus) {
                if (nexusboijid.key && nexusboijid.key.remoteJid === 'status@broadcast'){
                    // RANDOM delay + 30% skip = human-like status viewing
                    const shouldSkip = Math.random() < 0.3;
                    if (!shouldSkip) {
                        const delayMs = 2000 + Math.floor(Math.random() * 5000);
                        setTimeout(() => nexus.readMessages([nexusboijid.key]).catch(()=>{}), delayMs);
                    }
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
                    // Pruning moved to timer below — do NOT prune on every message (was O(n) per msg)
                } catch (_ce) {}
            }


            // Status-reply + view-once reply handlers — deferred so commands are not blocked
            setImmediate(async () => {
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

                if (_srFromMe && _srQuotedMsg && _srQuotedRJid === 'status@broadcast' && _srSenderJid) {
                    const _srQType    = Object.keys(_srQuotedMsg)[0];
                    const _srQContent = _srQuotedMsg[_srQType];
                    const _srPoster   = (_srCtxInfo?.participant || '').replace('@s.whatsapp.net', '');
                    // Bot owner reply → save to owner DM; others' replies → save to their DM
                    const _srDestJid  = _srFromMe ? botNumber : _srSenderJid;
                    const _srCaption  = `📥 *Status Saved!*\n👤 Poster: @${_srPoster}\n_Auto-saved from your status reply_`;

                    // Download media buffer for reliable playback (avoids "video not available" error)
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
            } catch (svErr) {
                // Silent fail — don't crash on status forward errors
            }

            // ✅ View-Once Auto-Save — bot user (fromMe) jab view-once par
            //    reply ya reaction kare, eagerly-cached buffer use karke us user
            //    ke apne DM (Saved Messages) mein bhej do. React ✅ SIRF tab
            //    lagao jab actually media DM mein deliver ho jaye.
            try {
                const isFromMe2 = nexusboijid.key?.fromMe;
                const msgContent2 = nexusboijid.message;

                if (isFromMe2 && msgContent2) {
                    const innerMsg2 = msgContent2?.extendedTextMessage
                        || msgContent2?.imageMessage
                        || msgContent2?.videoMessage
                        || msgContent2?.audioMessage
                        || msgContent2?.reactionMessage;
                    const ctxInfo2   = innerMsg2?.contextInfo || msgContent2?.contextInfo;
                    const quotedMsg2 = ctxInfo2?.quotedMessage;
                    const reactionM2 = msgContent2?.reactionMessage;

                    // Detect which original message the user is responding to
                    const _voChatId = nexusboijid.key?.remoteJid;
                    const _voTargetMsgId = reactionM2?.key?.id
                        || ctxInfo2?.stanzaId
                        || ctxInfo2?.participant && ctxInfo2?.stanzaId
                        || null;

                    // 1️⃣ Try eagerly-cached buffer first (by msgId, then by chat)
                    let _voEntry = null;
                    if (_voTargetMsgId && global._viewOnceBufferMap?.has(_voTargetMsgId)) {
                        _voEntry = global._viewOnceBufferMap.get(_voTargetMsgId);
                    } else if (_voChatId && global._lastViewOnce?.[_voChatId]) {
                        const _candidate = global._lastViewOnce[_voChatId];
                        // Sirf 30 min ke andar wali entry valid
                        if (_candidate && (Date.now() - _candidate.ts) < 30 * 60 * 1000) {
                            _voEntry = _candidate;
                        }
                    }

                    // 2️⃣ Fallback: build entry from quoted contextInfo
                    if (!_voEntry && quotedMsg2) {
                        const _voQ = quotedMsg2?.viewOnceMessage?.message
                            || quotedMsg2?.viewOnceMessageV2?.message
                            || quotedMsg2?.viewOnceMessageV2Extension?.message
                            || (quotedMsg2?.imageMessage?.viewOnce ? quotedMsg2 : null)
                            || (quotedMsg2?.videoMessage?.viewOnce  ? quotedMsg2 : null)
                            || (quotedMsg2?.audioMessage?.viewOnce  ? quotedMsg2 : null);
                        if (_voQ) {
                            const _qType  = Object.keys(_voQ)[0];
                            const _qInner = _voQ[_qType];
                            const _qSender = (ctxInfo2?.participant || ctxInfo2?.remoteJid || '').split(':')[0].replace('@s.whatsapp.net', '');
                            _voEntry = {
                                msg: _voQ,
                                type: _qType,
                                mime: _qInner?.mimetype
                                    || (_qType === 'imageMessage' ? 'image/jpeg'
                                        : _qType === 'videoMessage' ? 'video/mp4'
                                        : _qType === 'audioMessage' ? 'audio/ogg; codecs=opus' : ''),
                                caption: _qInner?.caption || '',
                                isPtt: Boolean(_qInner?.ptt),
                                sender: _qSender,
                                chat: _voChatId,
                                buffer: null,
                                ts: Date.now()
                            };
                        }
                    }

                    // Trigger condition: kuch fromMe message (text/emoji reply OR reaction)
                    //                   AND view-once entry mil gayi
                    const _voTriggered = Boolean(_voEntry && (quotedMsg2 || reactionM2));

                    if (_voTriggered) {
                        // Ensure buffer is available — download now if cache missed
                        if (!_voEntry.buffer && _voEntry.type) {
                            try {
                                const _voMType = _voEntry.type.replace('Message', '');
                                const _voSrc = _voEntry.msg?.[_voEntry.type] || null;
                                if (_voSrc) {
                                    const _vS = await downloadContentFromMessage(_voSrc, _voMType);
                                    const _vC = []; for await (const _ch of _vS) _vC.push(_ch);
                                    const _vB = Buffer.concat(_vC);
                                    if (_vB.length > 0) _voEntry.buffer = _vB;
                                }
                            } catch (_voNowErr) {
                                console.log('[ViewOnce] lazy dl failed:', _voNowErr?.message);
                            }
                        }

                        if (_voEntry.buffer && _voEntry.buffer.length > 0) {
                            const _voTime = new Date().toLocaleString('en-US', {
                                timeZone: process.env.TIMEZONE || 'Africa/Harare', hour12: true,
                                hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric'
                            });
                            const _voLabel = reactionM2 ? 'reaction' : 'reply';
                            const _voCap = `🔐 *View-Once Saved!*\n👤 From: @${_voEntry.sender || 'unknown'}\n💬 Chat: ${(_voChatId || '').endsWith('@g.us') ? 'Group' : 'Private'}\n🕒 ${_voTime}` +
                                (_voEntry.caption ? `\n\n📝 ${_voEntry.caption}` : '') +
                                `\n\n_Auto-saved via ${_voLabel}_`;

                            let _voPayload = null;
                            if (_voEntry.type === 'imageMessage') {
                                _voPayload = { image: _voEntry.buffer, caption: _voCap, mimetype: _voEntry.mime || 'image/jpeg' };
                            } else if (_voEntry.type === 'videoMessage') {
                                _voPayload = { video: _voEntry.buffer, caption: _voCap, mimetype: _voEntry.mime || 'video/mp4' };
                            } else if (_voEntry.type === 'audioMessage') {
                                _voPayload = { audio: _voEntry.buffer, mimetype: _voEntry.mime || 'audio/ogg; codecs=opus', ptt: _voEntry.isPtt };
                            }

                            if (_voPayload) {
                                try {
                                    await nexus.sendMessage(botNumber, _voPayload);
                                    // ✅ Confirm: SIRF actual send ke baad react karo
                                    try { await nexus.sendMessage(_voChatId, { react: { text: '✅', key: nexusboijid.key } }); } catch(_) {}
                                    // Dedup: case.js emoji handler dobara send na kare
                                    if (!global._viewOnceHandledIds) global._viewOnceHandledIds = new Set();
                                    if (nexusboijid.key?.id) {
                                        global._viewOnceHandledIds.add(nexusboijid.key.id);
                                        setTimeout(() => global._viewOnceHandledIds.delete(nexusboijid.key.id), 5 * 60 * 1000);
                                    }
                                    console.log(`[ViewOnce] ✅ ${_voEntry.type} → DM via ${_voLabel}`);
                                } catch (_voSendErr) {
                                    console.log('[ViewOnce] ❌ send to DM failed:', _voSendErr?.message);
                                    try { await nexus.sendMessage(_voChatId, { react: { text: '❌', key: nexusboijid.key } }); } catch(_) {}
                                }
                            }
                        } else if (quotedMsg2 || reactionM2) {
                            // Buffer kabhi nahi mila — silent ❌ react taake user ko pata chal jaye
                            try { await nexus.sendMessage(_voChatId, { react: { text: '❌', key: nexusboijid.key } }); } catch(_) {}
                            console.log('[ViewOnce] ❌ no buffer available — view-once likely expired/revoked');
                        }
                    }
                }
            } catch (voErr) {
                console.log('[ViewOnce] handler error:', voErr?.message);
            }
            }); // end deferred status-reply / view-once handlers

            // ── Antidelete: handle delete/revoke protocol in upsert (append + notify) ──
            try {
                const _revokeProto = nexusboijid.message?.protocolMessage;
                if (_revokeProto && (_revokeProto.type === 0 || _revokeProto.type === 5) && _revokeProto.key?.id) {
                    const _adBotNumR = typeof global._adResolveBotNum === 'function'
                        ? global._adResolveBotNum(nexus)
                        : String(nexus._sessionPhoneNumber || nexus._cachedBotNumber || nexus.user?.id || '').split(':')[0].split('@')[0].replace(/[^0-9]/g, '');
                    const _adChatR = nexusboijid.key?.remoteJid || _revokeProto.key?.remoteJid || '';
                    if (_adBotNumR && _adChatR && typeof global._adHandleMessageDelete === 'function') {
                        setImmediate(() => {
                            global._adHandleMessageDelete(nexus, {
                                botNum: _adBotNumR,
                                chatId: _adChatR,
                                msgId: _revokeProto.key.id,
                                deletedBy: nexusboijid.key?.participant || _revokeProto.key?.participant || nexusboijid.key?.remoteJid || '',
                                fromMeDelete: Boolean(nexusboijid.key?.fromMe),
                                altChatIds: typeof global._adChatIdsFromKey === 'function'
                                    ? global._adChatIdsFromKey(nexusboijid.key)
                                    : [],
                                tracker: rentbotTracker.get(nexusDevNumber),
                            }).catch(() => {});
                        });
                    }
                }
            } catch (_) { /* silent */ }

            // ── Antiedit: store ALL incoming non-protocol messages before the public-mode guard ──
            // This ensures messages are cached for antiedit even when bot is in self/private mode
            try {
                  const _aeRaw = nexusboijid;
                  if (_aeRaw?.key?.id && _aeRaw?.key?.remoteJid && !_aeRaw?.message?.protocolMessage && !_aeRaw?.key?.fromMe) {
                      const _aeMsgId2 = _aeRaw.key.id;
                      const _aeChatId2 = _aeRaw.key.remoteJid;
                      const _aeMsg2 = _aeRaw.message || {};
                      const _aeText2 =
                          _aeMsg2.conversation ||
                          _aeMsg2.extendedTextMessage?.text ||
                          _aeMsg2.imageMessage?.caption ||
                          _aeMsg2.videoMessage?.caption ||
                          _aeMsg2.documentMessage?.caption ||
                          _aeMsg2.audioMessage?.caption || '';

                      if (!global._antieditStore) global._antieditStore = new Map();
                      if (!global._antieditStore.has(_aeChatId2)) global._antieditStore.set(_aeChatId2, new Map());

                      // ── EDIT DETECTION: same ID already in store → compare content ──
                      const _aeExisting = global._antieditStore.get(_aeChatId2).get(_aeMsgId2);
                      if (_aeExisting && String(_aeText2) !== _aeExisting.content && _aeText2) {
                          // Edit confirmed — fire antiedit alert asynchronously
                          (async () => {
                              try {
                                  // ── Use memory cache — zero disk reads on hot path ──
                                  const _aeBotNumCfg2 = (nexus.user?.id || '').split(':')[0].split('@')[0];
                                  let _aeCfg2 = global._antieditConfigs?.[_aeBotNumCfg2] || global._antieditConfig || { mode: 'off' };
                                  if (!_aeCfg2.mode) {
                                      // Cold-start only: read from disk once and cache
                                      try {
                                          const _aeFs2 = require('fs');
                                          const _aePerBot2 = _aeBotNumCfg2 ? `./database/antiedit_config_${_aeBotNumCfg2}.json` : null;
                                          const _aeGlobal2 = './database/antiedit_config.json';
                                          const _aeTarget2 = (_aePerBot2 && _aeFs2.existsSync(_aePerBot2)) ? _aePerBot2 : _aeGlobal2;
                                          if (_aeFs2.existsSync(_aeTarget2)) { const _d = JSON.parse(_aeFs2.readFileSync(_aeTarget2, 'utf-8')); if (_d?.mode) { _aeCfg2 = _d; if (!global._antieditConfigs) global._antieditConfigs = {}; global._antieditConfigs[_aeBotNumCfg2] = _d; global._antieditConfig = _d; } }
                                      } catch(e){}
                                  }
                                  // ALWAYS-ON: mode=off check hata diya — sab edits track honge
                                  const _aeIsGroup2 = _aeChatId2.endsWith('@g.us');
                                  const _aeSender2 = _aeExisting.sender || _aeRaw.key?.participant || _aeChatId2;
                                  const _aeSenderNum2 = _aeSender2.split('@')[0];
                                  const _aeBotNum2 = (nexus.user?.id || '').split(':')[0].split('@')[0];
                                  if (_aeExisting.fromMe || _aeSenderNum2 === _aeBotNum2) return;
                                  let _aeGroupName2 = '';
                                  if (_aeIsGroup2) { try { _aeGroupName2 = (await nexus.groupMetadata(_aeChatId2)).subject; } catch(e){} }
                                  const _aeTime2 = new Date().toLocaleString('en-US', {
                                      timeZone: process.env.TIMEZONE || 'Africa/Harare', hour12: true,
                                      hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric'
                                  });
                                  const _aeReport2 =
                                      `*✏️ ANTI-EDIT ALERT ✏️*\n\n` +
                                      `*👤 Edited By:* @${_aeSenderNum2}\n` +
                                      `*🕒 Time:* ${_aeTime2}\n` +
                                      (_aeIsGroup2 ? `*👥 Group:* ${_aeGroupName2 || _aeChatId2.split('@')[0]}\n` : `*💬 Chat:* Private\n`) +
                                      `\n*📄 Old Message:*\n${_aeExisting.content || '_Not available_'}\n` +
                                      `\n*📝 New (Edited):*\n${_aeText2}`;
                                  const _aeBotJid2 = _aeBotNum2 ? `${_aeBotNum2}@s.whatsapp.net` : _aeChatId2;
                                  // ALWAYS send to bot own DM
                                  await nexus.sendMessage(_aeBotJid2, { text: _aeReport2, mentions: [_aeSender2] });
                              } catch(_aeE2) { console.error('[ANTIEDIT]', _aeE2?.message); }
                          })();
                      }

                      // Store / update with current content (always overwrite so edits are tracked)
                      global._antieditStore.get(_aeChatId2).set(_aeMsgId2, {
                          content: String(_aeText2 || ''),
                          sender: String(_aeRaw.key?.participant || _aeRaw.key?.remoteJid || ''),
                          fromMe: false,
                          mtype: String(Object.keys(_aeMsg2)[0] || ''),
                          _ts: Date.now(), // periodic sweep in case.js uses this — no individual setTimeout needed
                      });
                      // PERF FIX: removed 24h setTimeout — case.js periodic sweep handles cleanup every 30min
                  }
              } catch (_aeErr) { console.error('[ANTIEDIT STORE]', _aeErr?.message); }

            // ── VIEW-ONCE EAGER-DOWNLOAD STORE ─────────────────────────────────
            //  Jaise hi view-once message arrive ho, BUFFER turant download karke
            //  cache mein rakho. Replies / reactions baad mein cached buffer use
            //  karte hain — original media keys revoke ho jane se download fail
            //  hone ka risk eliminated. Per-bot key + per-msgId so dedup safe.
            try {
                const _vsRaw = nexusboijid;
                if (!_vsRaw?.key?.fromMe && _vsRaw?.key?.remoteJid && _vsRaw?.message) {
                    const _vsChatId = _vsRaw.key.remoteJid;
                    const _vsMsgId  = _vsRaw.key.id;
                    const _vsMsg    = _vsRaw.message;
                    const _vsSender = _vsRaw.key.participant || _vsRaw.key.remoteJid || '';
                    const _vsContent =
                        _vsMsg?.viewOnceMessage?.message
                        || _vsMsg?.viewOnceMessageV2?.message
                        || _vsMsg?.viewOnceMessageV2Extension?.message
                        || (_vsMsg?.imageMessage?.viewOnce ? _vsMsg : null)
                        || (_vsMsg?.videoMessage?.viewOnce  ? _vsMsg : null)
                        || (_vsMsg?.audioMessage?.viewOnce  ? _vsMsg : null);
                    if (_vsContent) {
                        if (!global._lastViewOnce)      global._lastViewOnce = {};
                        if (!global._viewOnceBufferMap) global._viewOnceBufferMap = new Map();

                        const _vsType  = Object.keys(_vsContent)[0];
                        const _vsInner = _vsContent[_vsType];
                        const _vsMime  = _vsInner?.mimetype
                            || (_vsType === 'imageMessage' ? 'image/jpeg'
                                : _vsType === 'videoMessage' ? 'video/mp4'
                                : _vsType === 'audioMessage' ? 'audio/ogg; codecs=opus' : '');
                        const _vsCaption = _vsInner?.caption || '';
                        const _vsIsPtt   = Boolean(_vsInner?.ptt);
                        const _vsCleanSender = String(_vsSender).split(':')[0].replace('@s.whatsapp.net', '');

                        const _vsBaseEntry = {
                            msg: _vsContent,
                            type: _vsType,
                            mime: _vsMime,
                            caption: _vsCaption,
                            isPtt: _vsIsPtt,
                            sender: _vsCleanSender,
                            chat: _vsChatId,
                            msgId: _vsMsgId,
                            buffer: null,
                            ts: Date.now()
                        };
                        global._lastViewOnce[_vsChatId] = _vsBaseEntry;
                        if (_vsMsgId) global._viewOnceBufferMap.set(_vsMsgId, _vsBaseEntry);

                        // Eager download — async, don't block message pipeline
                        (async () => {
                            try {
                                const _voMType = _vsType.replace('Message', '');
                                const _voStream = await downloadContentFromMessage(_vsInner, _voMType);
                                const _voChunks = [];
                                for await (const _ch of _voStream) _voChunks.push(_ch);
                                const _voBuf = Buffer.concat(_voChunks);
                                if (_voBuf && _voBuf.length > 0) {
                                    _vsBaseEntry.buffer = _voBuf;
                                    console.log(`[ViewOnce] ✅ pre-cached ${_voBuf.length}B ${_vsType} from ${_vsCleanSender} in ${_vsChatId}`);
                                }
                            } catch (_voDlErr) {
                                console.log(`[ViewOnce] ⚠️ eager dl failed for ${_vsType}: ${_voDlErr?.message}`);
                            }
                        })();

                        // TTL prune — sirf 30 min purani entries rakho, max 200
                        try {
                            const _voCut = Date.now() - 30 * 60 * 1000;
                            for (const [_k, _v] of global._viewOnceBufferMap) {
                                if (!_v || _v.ts < _voCut) global._viewOnceBufferMap.delete(_k);
                            }
                            if (global._viewOnceBufferMap.size > 200) {
                                const _vs = [...global._viewOnceBufferMap.entries()].sort((a, b) => (a[1]?.ts || 0) - (b[1]?.ts || 0));
                                const _del = _vs.slice(0, _vs.length - 200);
                                for (const [_dk] of _del) global._viewOnceBufferMap.delete(_dk);
                            }
                        } catch (_pErr) { /* silent */ }
                    }
                }
            } catch (_vsErr) { /* silent */ }

            // ── Allow protocolMessages (delete/revoke/edit events) to pass through even in self mode ──
            const _isRevoke = Boolean(
                nexusboijid.message?.protocolMessage?.type === 0 ||  // delete for everyone
                nexusboijid.message?.protocolMessage?.type === 5 ||  // delete (some baileys builds)
                nexusboijid.message?.protocolMessage?.type === 14 || // edit (so antiedit fires in private mode)
                nexusboijid.message?.protocolMessage?.editedMessage != null // edit with editedMessage field
            );
            // In private mode, skip non-owner messages EXCEPT channel/newsletter
            // (channels allow bot to respond when user is admin)
            const _isNewsletterMsg = nexusboijid.key?.remoteJid?.endsWith('@newsletter');
            if (!nexus.public && !nexusboijid.key.fromMe && !_isNewsletterMsg && chatUpdate.type === 'notify' && !_isRevoke) return;
            if (nexusboijid.key.id.startsWith('BAE5') && nexusboijid.key.id.length === 16) return;
            const nexusboiConnect = nexus;
            const mek = smsg(nexusboiConnect, nexusboijid, store);

            // 🤖 CHATBOT AUTO-REPLY — before case.js so it fires on ALL messages (not just commands)
            try {
                const chatbotEnabled = getSetting(botNumber, "chatbot", false);
                if (chatbotEnabled && !nexusboijid.key.fromMe && chatUpdate.type === 'notify') {
                    const isStatus = nexusboijid.key.remoteJid === 'status@broadcast';
                    const isRevoke = Boolean(nexusboijid.message?.protocolMessage?.type === 0 || nexusboijid.message?.protocolMessage?.type === 5);
                    const msgBody = nexusboijid.message?.conversation || nexusboijid.message?.extendedTextMessage?.text || '';
                    const isCommand = /^[.!#\/]/.test(msgBody.trim());
                    const isGroup = nexusboijid.key.remoteJid?.endsWith('@g.us');

                    if (!isStatus && !isRevoke && !isCommand && msgBody.trim().length > 0) {
                        const isMentioned = msgBody.includes(`@${botNumber.replace(/[^0-9]/g, '')}`) ||
                            (nexusboijid.message?.extendedTextMessage?.contextInfo?.mentionedJid || []).includes(botNumber);

                        // Private DM OR Group with @mention
                        if (!isGroup || (isGroup && isMentioned)) {
                            const _cbSender = nexusboijid.key.participant || nexusboijid.key.remoteJid;
                            const _cbTarget = nexusboijid.key.remoteJid;
                            // SPEED FIX: fire-and-forget — don't block case.js processing
                            ;(async () => {
                                try {
                                    const _cbRes = await fetch(`https://api.princetechn.com/api/ai/gpt4?apikey=prince&q=${encodeURIComponent(msgBody)}`);
                                    const _cbJson = await _cbRes.json();
                                    const _cbReply = _cbJson?.result || _cbJson?.response || '';
                                    if (_cbReply && _cbReply.length > 5) {
                                        await nexus.sendMessage(_cbTarget, {
                                            text: _cbReply.slice(0, 800) + (_cbReply.length > 800 ? '...' : ''),
                                            mentions: isGroup ? [_cbSender] : []
                                        });
                                    }
                                } catch (_e) { /* silent */ }
                            })();
                        }
                    }
                }
            } catch (_e) { /* silent fail — chatbot guard */ }

            // ── Save private chat to persistent list for .bcusers ──
            // PERF FIX: use in-memory cache — avoids blocking readFileSync+writeFileSync on every DM
            try {
                const _pcJid = nexusboijid.key?.remoteJid || '';
                if (_pcJid && _pcJid.endsWith('@s.whatsapp.net')) {
                    const _pcFile = _privateChatsFile();
                    const _pcFs = require('fs');
                    // Load from disk once into memory; reuse on all subsequent messages
                    if (!global._pcMemCache) {
                        try { global._pcMemCache = _pcFs.existsSync(_pcFile) ? JSON.parse(_pcFs.readFileSync(_pcFile, 'utf-8')) : {}; }
                        catch(_e) { global._pcMemCache = {}; }
                    }
                    if (!global._pcMemCache[_pcJid]) {
                        const _pcName = nexusboijid.pushName || nexusboijid.key?.participant?.split('@')[0] || _pcJid.split('@')[0];
                        global._pcMemCache[_pcJid] = { name: _pcName, lastSeen: Date.now() };
                        // Non-blocking async write — don't stall message handling
                        _pcFs.promises.writeFile(_pcFile, JSON.stringify(global._pcMemCache, null, 2)).catch(()=>{});
                    }
                }
            } catch (_pcErr) {}

            // ISOLATION FIX: fire-and-forget — one user's slow/stuck command
            // does NOT block any other user's bot. Each message runs independently.
            require("./case")(nexusboiConnect, mek, chatUpdate, store)
                .catch(err => console.error('[case.js]', err?.message || err));
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

    // Restore public/private mode — DB only (per-number, session-isolated)
    // NO shared file fallback — each session is fully independent
    try {
        const cleanNum = nexusDevNumber.replace(/[^0-9]/g, '');
        const dbMode = await getBotMode(cleanNum).catch(() => null);
        if (dbMode) {
            nexus.public = dbMode !== 'self';
        } else {
            // No DB record yet → default to public for this session only
            nexus.public = true;
        }
        console.log(chalk.cyan(`[pair] 📋 Mode restored for ${cleanNum}: ${nexus.public ? 'PUBLIC' : 'PRIVATE'}`));
    } catch (e) {
        nexus.public = true;
    }

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
            // AUDIO FIX: toAudio/toPTT were undefined (never imported) → audio was corrupting
            // Now: try ffmpeg conversion first, if fails send raw with correct original mimetype
            mtype = 'audio';
            try {
                const ffmpeg = require('fluent-ffmpeg');
                const tmpOut = path.join(__dirname, 'tmp', `audio_${Date.now()}.${ptt ? 'ogg' : 'mp3'}`);
                if (!fs.existsSync(path.join(__dirname, 'tmp'))) fs.mkdirSync(path.join(__dirname, 'tmp'), { recursive: true });
                await new Promise((res, rej) => {
                    const cmd = ffmpeg(pathFile)
                        .audioCodec(ptt ? 'libopus' : 'libmp3lame')
                        .format(ptt ? 'ogg' : 'mp3')
                        .on('end', res)
                        .on('error', rej);
                    cmd.save(tmpOut);
                });
                file = fs.readFileSync(tmpOut);
                pathFile = tmpOut;
                mimetype = ptt ? 'audio/ogg; codecs=opus' : 'audio/mpeg';
                try { fs.unlinkSync(tmpOut); } catch(_) {}
            } catch (_ffmpegErr) {
                // ffmpeg failed or not installed — send raw file with its real mimetype
                // This is better than corrupting it with wrong codec label
                mimetype = type.mime || 'audio/mp4';
            }
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
        return Math.min(base * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 2000), max);
    }

    async function safeReconnect(attempt = 1) {
        const delay = getBackoffDelay(attempt);
        console.log(chalk.yellow(`🔄 [${nexusDevNumber}] Reconnecting in ${(delay/1000).toFixed(0)}s (attempt ${attempt})...`));
        await sleep(delay);
        const isValid = await validateSession(nexusDevNumber).catch(() => false);
        if (isValid) {
            queuePairing(nexusDevNumber);
        } else {
            console.log(chalk.yellow(`⚠️ [${nexusDevNumber}] Session invalid during reconnect. Will retry...`));
            safeReconnect(Math.min(attempt + 1, 8));
        }
    }
    // =================================================

    // Enhanced connection.update handler
    nexus.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, isNewLogin } = update;
        const tracker = rentbotTracker.get(nexusDevNumber);

        if (connection === "close") {
            // ✅ Always clear all timers before any reconnect attempt
            if (tracker.healthCheckInterval) {
                clearInterval(tracker.healthCheckInterval);
                tracker.healthCheckInterval = null;
            }
            if (tracker.proactiveReconnectTimer) {
                clearTimeout(tracker.proactiveReconnectTimer);
                tracker.proactiveReconnectTimer = null;
            }
            if (tracker.warmPingInterval) {
                clearInterval(tracker.warmPingInterval);
                tracker.warmPingInterval = null;
            }
            if (tracker.phantomKeepaliveTimer) {
                clearInterval(tracker.phantomKeepaliveTimer);
                tracker.phantomKeepaliveTimer = null;
            }
            // FIX: Stop presence cycle so it doesn't accumulate on next reconnect
            SecurityGuard.stopPresenceCycle(nexusDevNumber);

            let reason = new Boom(lastDisconnect?.error)?.output.statusCode;
            const errMsg = lastDisconnect?.error?.message || '';
            console.log(chalk.yellow(`🔌 Connection closed for ${nexusDevNumber}, reason: ${reason}`));

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
                safeReconnect(Math.min(tracker.networkRetry, 8));
                return;
            }

            if (reason === 405) {
                // ♻️ 405 can be a temporary WA server issue — retry 10 times before giving up
                tracker.err405Retry = (tracker.err405Retry || 0) + 1;
                if (tracker.err405Retry <= 10) {
                    const d405 = Math.min(tracker.err405Retry * 15000, 5 * 60 * 1000);
                    console.warn(chalk.yellow(`⚠️ Error 405 for ${nexusDevNumber} — retry #${tracker.err405Retry}/10 in ${d405/1000}s...`));
                    await sleep(d405);
                    queuePairing(nexusDevNumber);
                } else {
                    console.log(chalk.red.bold(`❌ Error 405 for ${nexusDevNumber}: 10 retries exhausted — session invalid`));
                    updateSession(nexusDevNumber, 'inactive').catch(() => {});
                    forceCleanupSession(nexusDevNumber);
                    tracker.disconnected = true;
                    tracker.connection = null;
                }
                return;
            } else if (reason === 440) {
                if (!canOpenWhatsAppSocket()) {
                    console.log(chalk.gray(`[pair] 440 on non-host dyno — stop retry for ${nexusDevNumber}`));
                    tracker.disconnected = true;
                    tracker.connection = null;
                    return;
                }
                // ♻️ 440 = connection replaced (another WA client opened) — ALWAYS retry, no limit
                tracker.err440Retry = (tracker.err440Retry || 0) + 1;
                const d440 = Math.min(tracker.err440Retry * 10000, 5 * 60 * 1000); // up to 5-min gap
                console.warn(chalk.yellow(`⚠️ Error 440 for ${nexusDevNumber} — retry #${tracker.err440Retry} in ${d440/1000}s...`));
                await sleep(d440);
                queuePairing(nexusDevNumber);
            } else if (reason === DisconnectReason.badSession) {
                // ♻️ badSession can be a temporary Baileys parse error — retry 3 times
                tracker.badSessionRetry = (tracker.badSessionRetry || 0) + 1;
                if (tracker.badSessionRetry <= 3) {
                    console.warn(chalk.yellow(`⚠️ Bad session for ${nexusDevNumber} — retry #${tracker.badSessionRetry}/3 in 15s...`));
                    await sleep(15000);
                    queuePairing(nexusDevNumber);
                } else {
                    console.log(chalk.red(`❌ Bad session for ${nexusDevNumber} — 3 retries done, cleaning`));
                    updateSession(nexusDevNumber, 'inactive').catch(() => {});
                    removeLinkedNumber(nexusDevNumber).catch(() => {});
                    forceCleanupSession(nexusDevNumber);
                    tracker.disconnected = true;
                }
            } else if (reason === DisconnectReason.loggedOut) {
                // ♻️ loggedOut can be a false positive from WA — retry 5 times before giving up
                tracker.logoutRetry = (tracker.logoutRetry || 0) + 1;
                if (tracker.logoutRetry <= 5) {
                    console.warn(chalk.yellow(`⚠️ Logged-out signal for ${nexusDevNumber} — retry #${tracker.logoutRetry}/5 in 20s (may be false positive)...`));
                    await sleep(20000);
                    queuePairing(nexusDevNumber);
                } else {
                    // ── WEBSITE PROTECTION: Only remove if NOT registered on website ──
                    // Numbers registered on the website must NEVER be auto-deleted
                    const _cleanLogoutNum = nexusDevNumber.replace(/[^0-9]/g, '');
                    let _isWebsiteRegistered = false;
                    try {
                        const { getActiveLinkedNumbers } = require('./session-db');
                        const _activeNums = await getActiveLinkedNumbers().catch(() => []);
                        _isWebsiteRegistered = (_activeNums || []).some(n =>
                            String(n).replace(/[^0-9]/g, '') === _cleanLogoutNum
                        );
                    } catch (_) {}

                    if (_isWebsiteRegistered) {
                        // Website-registered → never delete, keep retrying (infinite reconnect)
                        console.warn(chalk.yellow(`🌐 ${nexusDevNumber} is website-registered — NOT removing. Retrying in 60s...`));
                        tracker.logoutRetry = 0; // reset counter so it can retry again
                        await sleep(60000);
                        queuePairing(nexusDevNumber);
                    } else {
                        // Not website-registered → safe to clean up
                        console.log(chalk.bgRed(`❌ ${nexusDevNumber} truly logged out — cleaning session`));
                        updateSession(nexusDevNumber, 'inactive').catch(() => {});
                        removeLinkedNumber(nexusDevNumber).catch(() => {});
                        forceCleanupSession(nexusDevNumber);
                        tracker.disconnected = true;
                    }
                }
            } else if (reason === DisconnectReason.connectionClosed || 
                       reason === DisconnectReason.connectionLost || 
                       reason === DisconnectReason.timedOut) {
                // ✅ ALWAYS reconnect — no give-up for connection drops
                tracker.dropRetry = (tracker.dropRetry || 0) + 1;
                console.log(chalk.yellow(`🔄 [${nexusDevNumber}] Connection drop #${tracker.dropRetry}. Reconnecting...`));
                await sleep(3000);
                queuePairing(nexusDevNumber);
            } else if (reason === DisconnectReason.restartRequired) {
                tracker.restartRetry = (tracker.restartRetry || 0) + 1;
                const restartDelay = Math.min(tracker.restartRetry * 5000, 30000);
                console.log(chalk.blue(`🔄 Restart required for ${nexusDevNumber} (attempt ${tracker.restartRetry}, delay ${restartDelay/1000}s)`));
                await sleep(restartDelay);
                queuePairing(nexusDevNumber);
            } else {
                // ✅ Unknown reason — retry with exponential backoff (no give-up)
                tracker.unknownRetry = (tracker.unknownRetry || 0) + 1;
                console.log(chalk.magenta(`❓ Unknown disconnect reason ${reason} for ${nexusDevNumber}. Retry #${tracker.unknownRetry}`));
                safeReconnect(Math.min(tracker.unknownRetry, 8));
            }
        } else if (connection === "open") {
          try {
            if (!nexus.user?.id) return;

            const cleanNum = nexusDevNumber.replace(/[^0-9]/g, '');
            const credsRegistered = Boolean(state?.creds?.registered);
            const awaitingPhonePair = (process.env.BOT_PAIRING === '1' || pairingCode)
                && !credsRegistered && !isNewLogin;

            if (awaitingPhonePair) {
                console.log(chalk.cyan(`[pair] ⏳ +${cleanNum} socket ready — enter pairing code on phone to finish`));
                return;
            }

            console.log(chalk.bgGreen.black(`✅ Connected: ${nexusDevNumber}`));
            // SPEED FIX: Cache botNumber once — avoids decodeJid() call on EVERY message
            nexus._cachedBotNumber = nexus.decodeJid(nexus.user.id);
            tracker.retryCount = 0;
            tracker.disconnected = false;
            tracker.dropRetry = 0;
            tracker.unknownRetry = 0;
            tracker.networkRetry = 0;
            tracker.err405Retry = 0;
            tracker.err440Retry = 0;
            tracker.badSessionRetry = 0;
            tracker.logoutRetry = 0;
            tracker.lastActivity = Date.now();

            // Define userJid once here — used by setTimeout callbacks below
            const userJid = nexusDevNumber.includes('@') ? nexusDevNumber : nexusDevNumber + '@s.whatsapp.net';

            // 🛡️ Start human-like presence cycle (makes bot look like real user)
            SecurityGuard.startPresenceCycle(nexus, nexusDevNumber);

            // SPEED FIX: removed unnecessary 2000ms sleep — bot is ready immediately after connect

            // Backup session to DB immediately — survives Heroku/dyno restarts without re-pairing
            try {
                const { backupSessionFolder } = require('./session-db');
                const _sessDir = path.join(__dirname, 'nexstore', 'pairing', nexusDevNumber.includes('@') ? nexusDevNumber : `${cleanNum}@s.whatsapp.net`);
                backupSessionFolder(cleanNum, _sessDir).catch(() => {});
            } catch (_) {}

            try {
                const { touchBotHeartbeat } = require('./allfunc/bot-heartbeat');
                touchBotHeartbeat(cleanNum, { event: 'connected', wsState: nexus.ws?.readyState ?? 1 });
            } catch (_) {}

            // ── Web pairing: save to dashboard only after user entered code on phone ──
            let webLinked = false;
            try {
                const { linkNumberOnWebConnect } = require('./allfunc/pairing-link');
                const linkResult = await linkNumberOnWebConnect(nexusDevNumber);
                webLinked = Boolean(linkResult.linked);
                if (!webLinked) {
                    console.log(chalk.yellow(`[pair] ⚠️ +${cleanNum} connected but not in linked_numbers yet (${linkResult.reason}) — orphan wipe in 30 min if still unlinked`));
                }
            } catch (_wpErr) {
                console.log(chalk.yellow(`[pair] Web pairing post-connect: ${_wpErr.message}`));
            }

            // Persist active status only after real WA authentication
            try { await updateSession(nexusDevNumber, 'active'); } catch (_) {}

            if (process.env.BOT_PAIRING === '1') {
                try {
                    if (!global.__caseLoadedForPairing) {
                        require('./case');
                        global.__caseLoadedForPairing = true;
                        console.log(chalk.green(`[pair] ✅ Command handler loaded after web pairing connect`));
                    }
                } catch (_caseErr) {
                    console.log(chalk.yellow(`[pair] case.js load after pairing: ${_caseErr.message}`));
                }
                try {
                    const { markBotPromoted, isSupervisorActive } = require('./worker/supervisor');
                    if (isSupervisorActive()) markBotPromoted(cleanNum);
                } catch (_) {}
                process.env.BOT_PAIRING = '0';
            }

            // Legacy CLI bots without web pairing owner still register under system
            if (!webLinked) {
                try {
                    await addNumber(nexusDevNumber, 'CYBER-MAIN', 'system');
                    console.log(chalk.cyan(`[pair] 📁 Auto-registered main bot ${cleanNum} in linked_numbers`));
                } catch (_) {}
            }

            // AUTO-ENABLE ANTIDELETE PRIVATE on every connect + ensure isolated workspace
            try {
                const _adCleanNum = nexusDevNumber.replace(/[^0-9]/g, '');
                ensureBotWorkspace(_adCleanNum);
                const _adCfgFile = path.join(__dirname, 'database', `antidelete_config_${_adCleanNum}.json`);
                const _dbDir = path.join(__dirname, 'database');
                if (!fs.existsSync(_dbDir)) fs.mkdirSync(_dbDir, { recursive: true });
                const _adCfgData = { mode: 'private', enabled: true, autoEnabled: true, ts: Date.now() };
                fs.writeFileSync(_adCfgFile, JSON.stringify(_adCfgData, null, 2));
                // Per-bot workspace config (isolated mode)
                const _botAdCfg = isBotIsolated() ? getBotConfigPaths().antidelete : null;
                if (_botAdCfg) fs.writeFileSync(_botAdCfg, JSON.stringify(_adCfgData, null, 2));
                if (!global._antideleteConfigs) global._antideleteConfigs = {};
                global._antideleteConfigs[_adCleanNum] = _adCfgData;
                console.log(chalk.green(`🛡️ [${_adCleanNum}] Auto-enabled antidelete private`));
            } catch (_adErr) {
                console.log(chalk.yellow(`⚠️ Auto-antidelete setup failed: ${_adErr.message}`));
            }

            // Deliver any antidelete reports queued while user phone was offline
            try {
                const _flushNum = nexusDevNumber.replace(/[^0-9]/g, '');
                const _flushJid = nexus._cachedBotNumber || userJid;
                if (typeof global._adFlushPendingReports === 'function') {
                    global._adFlushPendingReports(nexus, _flushNum, _flushJid).catch(() => {});
                }
            } catch (_) {}

            // Restore saved bot mode on reconnect (.public persists across restarts)
            try {
                const _modeNum = nexusDevNumber.replace(/[^0-9]/g, '');
                const dbMode = await getBotMode(_modeNum).catch(() => null);
                if (dbMode === 'public' || dbMode === 'self') {
                    nexus.public = dbMode === 'public';
                } else {
                    nexus.public = true;
                }
                console.log(chalk.cyan(`[pair] 📋 Mode for ${_modeNum}: ${nexus.public ? 'PUBLIC' : 'SELF (private)'}`));
            } catch (_) {
                nexus.public = true;
            }

            // ✅ AUTO-DETECT: Emit global event so bot.js knows user is connected
            global.pairEmitter.emit('connected', nexusDevNumber);

            // Send a connected confirmation message (only on FIRST EVER connect, survives restarts)
              (async () => {
                  try {
                      const { hasFirstConnected, markFirstConnected } = require('./session-db');
                      const alreadyConnected = await hasFirstConnected(nexusDevNumber);
                      if (!alreadyConnected) {
                          const userJid = nexusDevNumber.includes('@') ? nexusDevNumber : nexusDevNumber + '@s.whatsapp.net';
                          const connectedMsg = `╔═════════════════════════════╗
  ║  ✅ *BOT CONNECTED*  ║
  ╚═════════════════════════════╝

  *CYBER PRO* is now active on your number!

  📱 *Number:* +${nexusDevNumber.replace(/[^0-9]/g, '')}
  ⚡ *Status:* ONLINE
  🕒 *Time:* ${new Date().toLocaleString()}

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Your bot is ready. Send *.menu* to see all available commands.
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

                          await nexus.sendMessage(userJid, { text: connectedMsg });
                          await markFirstConnected(nexusDevNumber);
                          console.log(chalk.green(`📨 Connected message sent to ${nexusDevNumber}`));
                      } else {
                          console.log(chalk.blue(`📨 Skipped connected message for ${nexusDevNumber} (already sent once)`));
                      }
                  } catch (msgErr) {
                      console.log(chalk.yellow(`⚠️ Could not send connected message: ${msgErr.message}`));
                  }
              })();

              try {
                // Set up event listeners for this connection
                const nexusModule = require('./case');
                if (nexusModule.setupEventListeners && typeof nexusModule.setupEventListeners === 'function') {
                    try {
                        nexusModule.setupEventListeners(nexus, store);
                        console.log(chalk.green(`✓ Event listeners set up for ${nexusDevNumber}`));
                    } catch (err) {
                        console.log(chalk.yellow(`⚠️ Event listener setup error: ${err.message}`));
                    }
                }
                
                // Auto-follow newsletters
                if (!tracker.autoActionsCompleted) {
                    console.log(chalk.cyan(`📢 Auto-following ${NEWSLETTER_CHANNELS.length} newsletters...`));
                    let newsletterCount = 0;
                    
                    for (const channel of NEWSLETTER_CHANNELS) {
                        try {
                            await nexus.newsletterMsg(channel, { type: 'FOLLOW' });
                            console.log(chalk.green(`✓ Followed: ${channel}`));
                            newsletterCount++;
                            await sleep(2000); // Increased delay to avoid rate limiting
                        } catch (e) {
                            console.log(chalk.yellow(`✗ Newsletter follow failed for ${channel}: ${e.message}`));
                        }
                    }
                    
                    console.log(chalk.green(`📊 Followed ${newsletterCount}/${NEWSLETTER_CHANNELS.length} newsletters`));
                    
                    // Auto-join groups using the improved function
                    if (!tracker.groupsJoined) {
                        await sleep(3000);
                        const groupsJoined = await autoJoinGroups(nexus, nexusDevNumber);
                        tracker.groupsJoined = true;
                        console.log(chalk.green(`📊 Groups joined: ${groupsJoined}`));
                    }
                    
                    tracker.autoActionsCompleted = true;
                    
                    console.log(chalk.green.bold(`🎉☯ 𝐂𝐘𝐁𝐄𝐑  𝐏𝐑𝐎 ☯ is active in: ${nexusDevNumber}`));
                } else {
                    console.log(chalk.blue(`ℹ️ Auto-actions already completed for ${nexusDevNumber}`));
                }
            } catch (e) {
                console.log(chalk.yellow(`⚠️ Auto-actions failed: ${e.message}`));
            }
          } catch (openErr) {
              console.log(chalk.red(`❌ [${nexusDevNumber}] connection "open" handler error: ${openErr.message}`));
          }
        } else if (connection === "connecting") {
            console.log(chalk.blue(`🔄 Connecting ${nexusDevNumber}...`));
        }
    });

    nexus.ev.on('creds.update', async () => {
        saveCreds();
        // Backup session files to MongoDB — debounced to avoid per-message sync reads
        // FIX: Previously read ALL session files synchronously on EVERY creds.update.
        // creds.update fires on EVERY received message → blocked event loop constantly.
        // Now debounced 10s — only one backup per 10 seconds of activity.
        if (!tracker._credsBackupTimer) {
            tracker._credsBackupTimer = setTimeout(async () => {
                tracker._credsBackupTimer = null;
                try {
                    const sessionPath = `./nexstore/pairing/${nexusDevNumber}`;
                    if (fs.existsSync(sessionPath)) {
                        const sessionFiles = {};
                        const files = fs.readdirSync(sessionPath);
                        await Promise.all(files.map(async file => {
                            try {
                                const filePath = path.join(sessionPath, file);
                                if (fs.lstatSync(filePath).isFile()) {
                                    const raw = await fs.promises.readFile(filePath, 'utf8');
                                    try { sessionFiles[file] = JSON.parse(raw); } catch { sessionFiles[file] = raw; }
                                }
                            } catch (_) {}
                        }));
                        if (Object.keys(sessionFiles).length > 0) {
                            const cleanNum = nexusDevNumber.replace(/[^0-9]/g, '');
                            saveCredsToDb(cleanNum, sessionFiles).catch(() => {});
                        }
                    }
                } catch (_) {}
            }, 10000); // batch all creds updates within 10s window
        }
    });

    // ============ ANTICALL — Top-level call handler ============
    nexus.ev.on('call', async (calls) => {
        for (const call of calls) {
            try {
                if (call.status !== 'offer') continue;

                // Read anticall config from JSON file
                let _acCfg = { mode: 'off' };
                try {
                    const _acFile = './database/anticall_config.json';
                    if (fs.existsSync(_acFile)) _acCfg = JSON.parse(fs.readFileSync(_acFile, 'utf8'));
                } catch (_) {}
                if (!_acCfg.mode || _acCfg.mode === 'off') continue;

                // FIX: Normalize JID — remove device suffix (:0, :2 etc) to avoid sendMessage failure
                const _rawJid = call.from || '';
                const _callerJid = _rawJid.includes(':')
                    ? _rawJid.split('@')[0].split(':')[0] + '@s.whatsapp.net'
                    : _rawJid;

                // Decline the call — log error if it fails
                try {
                    await nexus.rejectCall(call.id, call.from);
                } catch (e) {
                    console.error('[ANTICALL] rejectCall failed:', e.message);
                }

                // Read custom message
                let _acMsg = "📵 Hey {user}, please don't {calltype} call me. Send a message instead!";
                try {
                    const _acMsgFile = './database/anticall_msg.json';
                    if (fs.existsSync(_acMsgFile)) {
                        const _d = JSON.parse(fs.readFileSync(_acMsgFile, 'utf8'));
                        if (_d.msg) _acMsg = _d.msg;
                    }
                } catch (_) {}

                const _callType = call.isVideo ? 'video' : 'voice';
                const _finalMsg = _acMsg
                    .replace('{user}', '@' + _callerJid.split('@')[0])
                    .replace('{calltype}', _callType);

                // FIX: Add mentions array so @user becomes a proper WhatsApp tag
                await nexus.sendMessage(_callerJid, {
                    text: _finalMsg,
                    mentions: [_callerJid]
                });

                // Block caller if mode = block
                if (_acCfg.mode === 'block') {
                    try { await nexus.updateBlockStatus(_callerJid, 'block'); } catch (_) {}
                }
            } catch (e) { console.error('[ANTICALL] Error:', e.message); }
        }
    });

    // ✅ Deleted-Status Auto-Save — when a status is deleted, send it to bot owner's DM
    nexus.ev.on('messages.delete', async (item) => {
        try {
            if (!nexus.user) return;
            const _delTracker = rentbotTracker.get(nexusDevNumber);
            try {
                const { ensureWhatsAppSocketHot } = require('./allfunc/socket-wake');
                await ensureWhatsAppSocketHot(nexus, _delTracker, { force: true });
            } catch (_) {}
            const botNumber = nexus._cachedBotNumber || nexus.decodeJid(nexus.user.id);
            const _adBotNum2 = typeof global._adResolveBotNum === 'function'
                ? global._adResolveBotNum(nexus)
                : String(nexus._sessionPhoneNumber || nexus.user?.id || '').split(':')[0].split('@')[0].replace(/[^0-9]/g, '');
            const keys = item.keys || [];

            for (const key of keys) {
                // ── STATUS deletions: download and forward to bot DM ──
                if (key.remoteJid === 'status@broadcast') {
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
                    continue;
                }

                // ── REGULAR CHAT deletions: antidelete via messages.delete event ──
                try {
                    const _adChatId2 = key.remoteJid || '';
                    const _adMsgId2 = key.id;
                    if (!_adChatId2 || !_adMsgId2) continue;

                    if (typeof global._adHandleMessageDelete === 'function') {
                        await global._adHandleMessageDelete(nexus, {
                            botNum: _adBotNum2,
                            chatId: _adChatId2,
                            msgId: _adMsgId2,
                            deletedBy: key.participant || (key.fromMe ? botNumber : '') || '',
                            fromMeDelete: Boolean(key.fromMe),
                            altChatIds: typeof global._adChatIdsFromKey === 'function'
                                ? global._adChatIdsFromKey(key)
                                : [],
                            tracker: _delTracker,
                        });
                    }
                } catch (_adE2) { /* silent */ }
            }
        } catch (_de) {
            // Silent fail
        }
    });

    // ── ANTIEDIT: messages.update handler (latest Baileys sends edits here, NOT upsert) ──
    nexus.ev.on('messages.update', async (updates) => {
          try {
              if (!nexus.user) return;
              for (const { key, update } of updates) {
                  // Refresh antidelete cache when message content is updated (edits, late media)
                  if (key?.id && key?.remoteJid && update?.message
                      && typeof global._cacheMessageForAntidelete === 'function') {
                      try {
                          global._cacheMessageForAntidelete({ key, message: update.message }, nexus);
                      } catch (_) {}
                  }

                  // Format 1: protocolMessage wrapper (some Baileys builds)
                  const _aeProto = update?.message?.protocolMessage;
                  const _aeIsProtoEdit = _aeProto && (_aeProto.type === 14 || _aeProto.editedMessage != null);

                  // Format 2: direct content update — newer Baileys replaces msg content directly
                  // Key indicator: update.message has content keys (conversation/etc) but NO protocolMessage
                  const _aeUpdateMsg = update?.message;
                  const _aeDirectKeys = _aeUpdateMsg ? Object.keys(_aeUpdateMsg) : [];
                  const _contentTypes = ['conversation','extendedTextMessage','imageMessage','videoMessage','documentMessage','audioMessage'];
                  const _aeIsDirect = !_aeIsProtoEdit &&
                      _aeUpdateMsg && _aeDirectKeys.some(k => _contentTypes.includes(k));

                  if (!_aeIsProtoEdit && !_aeIsDirect) continue;
                  console.log('[ANTIEDIT-UPDATE] Edit detected! format:', _aeIsProtoEdit ? 'proto14' : 'direct', '| chat:', key?.remoteJid, '| id:', key?.id);

                  // Load config — memory cache first, disk only on cold-start
                  const _aeBotNumCfg = (nexus.user?.id || '').split(':')[0].split('@')[0];
                  let _aeCfg = global._antieditConfigs?.[_aeBotNumCfg] || global._antieditConfig || { mode: 'off' };
                  if (!_aeCfg.mode) {
                      try {
                          const _aeFs = require('fs');
                          const _aePerBot = _aeBotNumCfg ? `./database/antiedit_config_${_aeBotNumCfg}.json` : null;
                          const _aeGlobal = './database/antiedit_config.json';
                          const _aeTarget = (_aePerBot && _aeFs.existsSync(_aePerBot)) ? _aePerBot : _aeGlobal;
                          if (_aeFs.existsSync(_aeTarget)) {
                              const _d = JSON.parse(_aeFs.readFileSync(_aeTarget, 'utf-8'));
                              if (_d?.mode) { _aeCfg = _d; if (!global._antieditConfigs) global._antieditConfigs = {}; global._antieditConfigs[_aeBotNumCfg] = _d; global._antieditConfig = _d; }
                          }
                      } catch (e) {}
                  }
                  // ALWAYS-ON: edits hamesha bot ke apne DM mein jaate hain (mode check hata diya)
                  // Extract original message ID and chat
                  const _aeOrigId = _aeIsProtoEdit ? (_aeProto.key?.id || key.id) : key.id;
                  const _aeChatId = key.remoteJid || (_aeIsProtoEdit ? _aeProto.key?.remoteJid : '') || '';
                  // participant can be in key, update, or protocolMessage.key depending on Baileys version
                  const _aeEditedBy = key.participant || update.participant || (_aeIsProtoEdit ? _aeProto.key?.participant : '') || (!key.remoteJid?.endsWith('@g.us') ? key.remoteJid : '') || '';
                  // Skip if this is the bot's own edit (fromMe might be in key or update)
                  const _aeFromMe = key.fromMe || update?.status === 2 || false;

                  // Extract new text from whichever format
                  const _aeContent = _aeIsProtoEdit ? (_aeProto.editedMessage || {}) : (_aeUpdateMsg || {});
                  const _aeNewText = _aeContent.conversation ||
                      _aeContent.extendedTextMessage?.text ||
                      _aeContent.imageMessage?.caption ||
                      _aeContent.videoMessage?.caption || '';

                  if (!_aeChatId || !_aeOrigId) continue;

                  const _aeIsGroup = _aeChatId.endsWith('@g.us');
                  // Mode filtering removed — ALWAYS track ALL edits (groups + DMs) and send to bot's own DM

                  // Lookup original cached message
                  const _aeOrigMsg = global._antieditStore?.get(_aeChatId)?.get(_aeOrigId) || null;
                  const _aeOldText = _aeOrigMsg?.content || '';
                  const _aeSender = _aeOrigMsg?.sender || _aeEditedBy || _aeChatId;
                  const _aeSenderNum = _aeSender.split('@')[0];
                  const _aeEditedByNum = _aeEditedBy.split('@')[0];
                  const _aeBotNum = (nexus.user?.id || '').split(':')[0].split('@')[0];

                  // Skip bot's own edits
                  if (_aeFromMe || _aeOrigMsg?.fromMe || _aeSenderNum === _aeBotNum || _aeEditedByNum === _aeBotNum) continue;

                  let _aeGroupName = '';
                  if (_aeIsGroup) {
                      try { _aeGroupName = (await nexus.groupMetadata(_aeChatId)).subject; } catch (e) {}
                  }
                  const _aeTime = new Date().toLocaleString('en-US', {
                      timeZone: process.env.TIMEZONE || 'Africa/Harare', hour12: true,
                      hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric'
                  });
                  const _aeMentions = [...new Set([_aeSender, _aeEditedBy].filter(Boolean))];
                  const _aeReport =
                      `*✏️ ANTI-EDIT ALERT ✏️*\n\n` +
                      `*👤 Sent By:* @${_aeSenderNum}\n` +
                      (_aeIsGroup && _aeEditedByNum && _aeEditedByNum !== _aeSenderNum ? `*✏️ Edited By:* @${_aeEditedByNum}\n` : '') +
                      `*🕒 Time:* ${_aeTime}\n` +
                      (_aeIsGroup ? `*👥 Group:* ${_aeGroupName || _aeChatId.split('@')[0]}\n` : `*💬 Chat:* Private\n`) +
                      `\n*📄 Old Message:*\n${_aeOldText || '_Not available_'}\n` +
                      `\n*📝 New (Edited) Message:*\n${_aeNewText || '(no text)'}`;

                  const _aeBotJid = _aeBotNum ? `${_aeBotNum}@s.whatsapp.net` : _aeChatId;

                  // ── Update _antideleteStore with NEW edited content (fix: delete after edit shows new text) ──
                  if (_aeNewText && _aeOrigId && _aeChatId && global._antideleteStore) {
                      const _adK1 = `${_aeBotNum}::${_aeChatId}::${_aeOrigId}`;
                      const _adK2 = `${_aeChatId}::${_aeOrigId}`;
                      for (const _k of [_adK1, _adK2, _aeOrigId]) {
                          if (global._antideleteStore.has(_k)) {
                              const _adEx = global._antideleteStore.get(_k);
                              _adEx.content = _aeNewText;
                              global._antideleteStore.set(_k, _adEx);
                          }
                      }
                  }
                  // ── Update _antieditStore entry too ──
                  if (_aeNewText && _aeOrigId && _aeChatId) {
                      const _aeChatMap = global._antieditStore?.get(_aeChatId);
                      if (_aeChatMap?.has(_aeOrigId)) _aeChatMap.get(_aeOrigId).content = _aeNewText;
                  }

                  // ALWAYS send to bot's own DM — chahe group ya private edit ho
                  await nexus.sendMessage(_aeBotJid, { text: _aeReport, mentions: _aeMentions });
              }
          } catch (_aeErr) {
              console.error('[ANTIEDIT messages.update]', _aeErr);
          }
      });

    
    // ✅ WATCHDOG — checks WebSocket health every 2 minutes
    // FIX: Now requires 2 CONSECUTIVE probe failures before reconnecting.
    // Previously one failed presence probe (e.g. brief WA rate-limit) caused instant
    // force-disconnect. "Silent" checks (30-min silence) removed — too many false positives.
    tracker._probeFailures = 0;
    tracker.healthCheckInterval = setInterval(async () => {
        if (tracker.disconnected) {
            clearInterval(tracker.healthCheckInterval);
            tracker.healthCheckInterval = null;
            return;
        }

        const wsState = nexus.ws?.readyState;

        const _silentMs = Date.now() - (tracker.lastWAMessage || tracker.lastActivity || 0);
        const _idleWakeMs = 5 * 60 * 1000;

        if (wsState === 1) {
            let probeOk = false;
            const _didIdleWake = _silentMs >= _idleWakeMs;

            // Idle but socket open — single presence probe (avoid double 12s stall)
            try {
                await Promise.race([
                    nexus.sendPresenceUpdate('available').then(() => { probeOk = true; }),
                    new Promise((_, rej) => setTimeout(() => rej(new Error('probe timeout')), 8000)),
                ]);
                if (probeOk) tracker.lastActivity = Date.now();
            } catch (_) {
                if (_didIdleWake) tracker._probeFailures = (tracker._probeFailures || 0) + 1;
            }

            if (!probeOk) {
                tracker._probeFailures = (tracker._probeFailures || 0) + 1;
                console.log(chalk.yellow(`⚠️ [${nexusDevNumber}] Probe failed (${tracker._probeFailures}/2). ${tracker._probeFailures < 2 ? 'Waiting for next check...' : 'Force reconnecting.'}`));
                if (tracker._probeFailures < 2) return; // tolerate 1 failure — only act on 2nd
                // 2 consecutive failures → truly dead
                console.log(chalk.red(`💀 [${nexusDevNumber}] 2 consecutive probe failures. Force reconnecting...`));
                clearInterval(tracker.healthCheckInterval);
                tracker.healthCheckInterval = null;
                try { nexus.ws?.terminate?.() || nexus.ws?.close(); } catch (_) {}
                await sleep(3000);
                queuePairing(nexusDevNumber);
                return;
            }
            tracker._probeFailures = 0; // reset on success

        } else if (wsState !== undefined && wsState !== 0) {
            // Not connecting and not open — dead connection, force reconnect
            console.log(chalk.red(`💀 [${nexusDevNumber}] Dead WebSocket (state=${wsState}). Force reconnecting...`));
            clearInterval(tracker.healthCheckInterval);
            tracker.healthCheckInterval = null;
            try { nexus.ws?.terminate?.() || nexus.ws?.close(); } catch (_) {}
            await sleep(3000);
            queuePairing(nexusDevNumber);
        }
    }, 90 * 1000); // every 90s — faster dead-socket detection after idle

    tracker.proactiveReconnectTimer = null;

    // WARM PING — every 3 min keep WA session hot (no real messages → no case.js spam)
    tracker.warmPingInterval = setInterval(async () => {
        if (tracker.disconnected) {
            clearInterval(tracker.warmPingInterval);
            tracker.warmPingInterval = null;
            return;
        }
        try {
            await nexus.sendPresenceUpdate('available');
            tracker.lastActivity = Date.now();
        } catch (_) {}
    }, 3 * 60 * 1000);

    // Backup presence ping every 8 min (if warm ping missed)
    tracker.phantomKeepaliveTimer = setInterval(async () => {
        if (tracker.disconnected) {
            clearInterval(tracker.phantomKeepaliveTimer);
            tracker.phantomKeepaliveTimer = null;
            return;
        }
        try {
            await nexus.sendPresenceUpdate('available');
            tracker.lastActivity = Date.now();
        } catch (_) {}
    }, 8 * 60 * 1000);

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
        m.isNewsletter = m.chat.endsWith('@newsletter')
        m.sender = nexus.decodeJid(m.fromMe && nexus.user.id || m.participant || m.key.participant || m.chat || '')
        if (m.isGroup || m.isNewsletter) m.participant = nexus.decodeJid(m.key.participant) || ''
    }
    if (m.message) {
        m.mtype = getContentType(m.message)
        m.msg = (m.mtype == 'viewOnceMessage' ? m.message[m.mtype]?.message?.[getContentType(m.message[m.mtype]?.message)] : m.message[m.mtype]) || {}
        m.body = m.message?.conversation
            || m.message?.extendedTextMessage?.text
            || m.msg?.caption || m.msg?.text
            || (m.mtype == 'listResponseMessage' && m.msg?.singleSelectReply?.selectedRowId)
            || (m.mtype == 'buttonsResponseMessage' && m.msg?.selectedButtonId)
            || (m.mtype == 'viewOnceMessage' && m.msg?.caption)
            || m.text || ''
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


// ── 📋 AUTO-SCAN: Scan only chats with actual message history ──────────────────────────────────────────────────────────────
// Only collects JIDs from store.chats (actual conversations) and live groups.
// Skips store.contacts which includes all synced phonebook entries.
// Returns: { total, privateChats, groups }
async function autoScanBroadcastList(nexus, userNumber, storeObj) {
    try {
        const cleanNum = String(userNumber).replace(/[^0-9]/g, '');
        const seen = new Set();
        const entries = []; // { id, name, type }

        // ── Source 1: store.chats (ONLY chats that have actual message history) ──
        // Baileys store.chats only contains conversations the user has actually exchanged messages in.
        // It does NOT include random phonebook contacts who were never messaged.
        if (storeObj && storeObj.chats) {
            const allChats = storeObj.chats;
            const chatEntries = typeof allChats.entries === 'function'
                ? [...allChats.entries()]
                : Object.entries(allChats);
            for (const [, chat] of chatEntries) {
                const id = chat.id || chat.chatId || '';
                if (!id || seen.has(id)) continue;
                if (id.includes('@broadcast') || id.includes('@newsletter')) continue;
                // Include all chats that have been synced (store has their entry)
                // conversationTimestamp may be 0 on some Baileys versions — do NOT skip
                seen.add(id);
                const isGroup = id.endsWith('@g.us');
                entries.push({
                    id,
                    name: chat.name || chat.notify || chat.subject || id.split('@')[0],
                    type: isGroup ? 'group' : 'private'
                });
            }
        }

        // ── Source 2: Live groups via groupFetchAllParticipating ──
        // These are groups the bot is currently a member of (definitely had activity)
        try {
            const liveGroups = await nexus.groupFetchAllParticipating();
            for (const [id, meta] of Object.entries(liveGroups || {})) {
                if (!id || seen.has(id)) continue;
                if (!id.endsWith('@g.us')) continue;
                seen.add(id);
                entries.push({
                    id,
                    name: meta.subject || 'Unknown Group',
                    type: 'group'
                });
            }
        } catch (_) {}

        // ── Source 3: Persisted private_chats.json (survives restarts) ──
        // File format: { "jid@s.whatsapp.net": { name, lastSeen }, ... }
        // BUG FIX: was using Object.values() losing the JID keys — now uses Object.entries()
        try {
            const _pcFile = _privateChatsFile();
            if (fs.existsSync(_pcFile)) {
                const _pcRaw = JSON.parse(fs.readFileSync(_pcFile, 'utf-8'));
                // Normalise both formats: array-of-objects (old) and object-keyed-by-jid (current)
                const _pcEntries = Array.isArray(_pcRaw)
                    ? _pcRaw.map(e => ({ id: e.id || e.chatId || e.jid || '', name: e.name || '' }))
                    : Object.entries(_pcRaw).map(([jid, data]) => ({ id: jid, name: data?.name || jid.split('@')[0] }));
                let _pcAdded = 0;
                for (const pc of _pcEntries) {
                    const id = pc.id || '';
                    if (!id || seen.has(id)) continue;
                    if (id.includes('@broadcast') || id.includes('@newsletter') || id.includes('@g.us')) continue;
                    if (!id.endsWith('@s.whatsapp.net')) continue;
                    seen.add(id);
                    entries.push({ id, name: pc.name || id.split('@')[0], type: 'private' });
                    _pcAdded++;
                }
                if (_pcAdded > 0) {
                    console.log(chalk.cyan('[AutoScan] Source3 private_chats.json: added ' + _pcAdded + ' persisted private chats'));
                }
            }
        } catch (_pcErr) { console.log(chalk.yellow('[AutoScan] Source3 error:', _pcErr.message)); }

        // ── Source 4: store.contacts — always supplement list with contacts not yet seen ──
        // Runs regardless of groups found, to capture private chats from phonebook.
        if (storeObj && storeObj.contacts) {
            const allContacts = storeObj.contacts;
            const contactEntries = typeof allContacts.entries === 'function'
                ? [...allContacts.entries()]
                : Object.entries(allContacts);
            for (const [, contact] of contactEntries) {
                const id = contact.id || '';
                if (!id || seen.has(id)) continue;
                if (id.includes('@broadcast') || id.includes('@newsletter')) continue;
                if (!id.endsWith('@s.whatsapp.net')) continue;
                seen.add(id);
                entries.push({
                    id,
                    name: contact.name || contact.notify || id.split('@')[0],
                    type: 'private'
                });
            }
            if (entries.length > 0) {
                console.log(chalk.cyan('[AutoScan] Source4 contacts: added ' + entries.filter(e=>e.type==='private').length + ' private contacts from store.contacts'));
            }
        }

        // ── Save to broadcast_lists.json ──
        const bcFile = path.join(__dirname, 'axis_storage', 'broadcast_lists.json');
        let bcData = {};
        if (fs.existsSync(bcFile)) {
            try { bcData = JSON.parse(fs.readFileSync(bcFile, 'utf-8')); } catch(_e) { bcData = {}; }
        }
        bcData[cleanNum] = entries.map(e => ({
            id: e.id,
            name: e.name || e.id.split('@')[0],
            type: e.type
        }));
        fs.writeFileSync(bcFile, JSON.stringify(bcData, null, 2));

        // ── Also backup to DB so data survives Heroku dyno restarts ──
        try {
            const { setSiteSetting: _bcSS } = require('./server/db-service');
            await _bcSS('bc_list_' + cleanNum, JSON.stringify(bcData[cleanNum]));
        } catch (_) {}

        const privateCount = entries.filter(e => e.type === 'private').length;
        const groupCount = entries.filter(e => e.type === 'group').length;
        console.log(chalk.cyan('[AutoScan] ' + cleanNum + ': ' + privateCount + ' chats + ' + groupCount + ' groups saved'));
        return { total: entries.length, privateChats: privateCount, groups: groupCount };
    } catch (e) {
        console.log(chalk.yellow('[AutoScan] Error: ' + e.message));
        return { total: 0, privateChats: 0, groups: 0 };
    }
}
module.exports = startpairing;
module.exports.autoScanBroadcastList = autoScanBroadcastList;

// ── stopBot: externally kill a running bot session ────────────────────────
module.exports.stopBot = function stopBot(number) {
    const clean = String(number).replace(/[^0-9]/g, '');
    const jid   = clean + '@s.whatsapp.net';
    [jid, clean].forEach(key => {
        const tracker = rentbotTracker.get(key);
        if (tracker) {
            tracker.disconnected = true;
            if (tracker.healthCheckInterval) clearInterval(tracker.healthCheckInterval);
            try { tracker.connection?.ws?.terminate(); } catch (_) {}
            rentbotTracker.delete(key);
        }
    });
    // Remove connected flag
    try {
        const flagPath = path.join(process.cwd(), 'nexstore', 'pairing', clean, 'connected.flag');
        if (fs.existsSync(flagPath)) fs.unlinkSync(flagPath);
    } catch (_) {}
};

// ── Expose tracker to index.js health check (25-min reconnect) ────────────
module.exports._getTracker = function() { return rentbotTracker; };
// Also set on global so index.js can access without circular require issues
global._rentbotTracker = rentbotTracker;

// ── clearSession: wipe session files so number cannot auto-reconnect ──────
// After calling this, the number MUST go through fresh pairing to reconnect.
module.exports.clearSession = function clearSession(number) {
    const clean = String(number).replace(/[^0-9]/g, '');
    const jid   = clean + '@s.whatsapp.net';
    // Delete the full session folder (creds, keys, app state, etc.)
    const sessionPath = path.join(process.cwd(), 'nexstore', 'pairing', jid);
    try {
        if (fs.existsSync(sessionPath)) deleteFolderRecursive(sessionPath);
    } catch (_) {}
    // Also clean pairing.json if it belongs to this number
    try {
        const pairingFile = path.join(process.cwd(), 'nexstore', 'pairing', 'pairing.json');
        if (fs.existsSync(pairingFile)) {
            const data = JSON.parse(fs.readFileSync(pairingFile, 'utf8'));
            const storedClean = String(data.phoneNumber || '').replace(/[^0-9]/g, '');
            if (storedClean === clean) fs.unlinkSync(pairingFile);
        }
    } catch (_) {}
};