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
const { addNumber } = require('./server/db-service');
const { getSetting } = require('./setting/Settings');
const NodeCache = require("node-cache");
const _ = require('lodash')
const {
    Boom
} = require('@hapi/boom')
const EventEmitter = require('events');
const PhoneNumber = require('awesome-phonenumber')
let phoneNumber = "923417022212";
const pairingCode = !!phoneNumber || process.argv.includes("--pairing-code");
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
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ────────────────────────────────────────────────────────
// 🛡️  MILITARY SECURITY GUARD  — Anti-Restriction / Anti-Detection Layer
// ────────────────────────────────────────────────────────
const SecurityGuard = {
    // Per-chat message buckets (tokens replenish over time)
    _buckets: new Map(),
    _pending: new Map(), // queued messages per chat
    _processing: new Set(),

    // Rate limits: max messages per window per chat
    MAX_BURST: 8,       // allow quick burst of replies
    WINDOW_MS: 60000,   // 1 minute window
    REFILL_RATE: 8000,  // 1 msg per 8 seconds refill

    // Check if sending is allowed (fast path — no delay for commands)
    canSend(chatId) {
        const now = Date.now();
        let bucket = this._buckets.get(chatId);
        if (!bucket) {
            bucket = { tokens: this.MAX_BURST, lastRefill: now };
            this._buckets.set(chatId, bucket);
        }
        // Refill tokens based on time elapsed
        const elapsed = now - bucket.lastRefill;
        const refill = Math.floor(elapsed / this.REFILL_RATE);
        if (refill > 0) {
            bucket.tokens = Math.min(this.MAX_BURST, bucket.tokens + refill);
            bucket.lastRefill = now;
        }
        if (bucket.tokens > 0) {
            bucket.tokens--;
            return { allowed: true, delay: 0 };
        }
        // Over limit: tiny jitter delay (invisible to user, but spaces out WA traffic)
        const jitter = 300 + Math.floor(Math.random() * 700);
        return { allowed: true, delay: jitter };
    },

    // Queue a message for rate-limited sending (non-blocking)
    async sendWithGuard(nexus, chatId, payload, options = {}) {
        const { allowed, delay } = this.canSend(chatId);
        if (delay > 0) {
            await sleep(delay);
        }
        return nexus.sendMessage(chatId, payload, options);
    },

    // Human-like presence cycling (makes bot look like real user)
    startPresenceCycle(nexus, botJid) {
        const cycle = async () => {
            try {
                // Random online/offline pattern
                const onlineDuration = 5 * 60 * 1000 + Math.floor(Math.random() * 10 * 60 * 1000); // 5-15 min
                const offlineDuration = 30 * 1000 + Math.floor(Math.random() * 120 * 1000); // 30s-2.5min
                await nexus.sendPresenceUpdate('available');
                await sleep(onlineDuration);
                await nexus.sendPresenceUpdate('unavailable');
                await sleep(offlineDuration);
            } catch (e) { /* silent */ }
            // Schedule next cycle (random 1-3 hour gap between cycles)
            const gap = 60 * 60 * 1000 + Math.floor(Math.random() * 2 * 60 * 60 * 1000);
            setTimeout(() => cycle(), gap);
        };
        // Start after random initial delay
        setTimeout(cycle, Math.floor(Math.random() * 30000));
    },

    // Jitter for reconnect delays (prevents predictable patterns)
    jitterDelay(baseMs) {
        const jitter = Math.floor(Math.random() * baseMs * 0.3);
        return baseMs + jitter;
    },

    // Random device status update (looks like real WhatsApp Web)
    async sendDeviceStatus(nexus) {
        try {
            const statuses = ['available', 'unavailable', 'composing', 'recording', 'paused'];
            const status = statuses[Math.floor(Math.random() * statuses.length)];
            await nexus.sendPresenceUpdate(status);
        } catch (e) { /* silent */ }
    }
};
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
    try {
        const { SocksProxyAgent } = require('socks-proxy-agent');
        const https = require('https');

        for (const proxyUrl of PK_PROXY_LIST) {
            try {
                const agent = new SocksProxyAgent(proxyUrl, { timeout: 6000 });
                // Quick test — check if proxy responds
                await new Promise((resolve, reject) => {
                    const req = https.get({
                        hostname: 'web.whatsapp.com',
                        path: '/',
                        agent,
                        timeout: 6000,
                    }, resolve);
                    req.on('error', reject);
                    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
                });
                _pkProxyAgent = agent;
                console.log(chalk.bgGreen.black(`[PROXY] 🇵🇰 Pakistani proxy connected: ${proxyUrl}`));
                return;
            } catch (_) {
                console.log(chalk.yellow(`[PROXY] ❌ Failed: ${proxyUrl}`));
            }
        }
        console.log(chalk.yellow('[PROXY] ⚠️  Koi bhi Pakistani proxy kaam nahi kiya — direct connect ho raha hai'));
    } catch (e) {
        console.log(chalk.yellow('[PROXY] socks-proxy-agent available nahi — direct connect'));
    }
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
let msgRetryCounterCache = new NodeCache();

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
        if (!creds.me || !creds.me.id) {
            console.log(chalk.yellow(`⚠️ Invalid session for ${nexusDevNumber}, cleaning up...`));
            deleteFolderRecursive(sessionPath);
            return false;
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
function cleanupExpiredSessions() {
    const sessionDir = './nexstore/pairing';
    if (!fs.existsSync(sessionDir)) return;
    
    const now = Date.now();
    const oneDayAgo = now - (24 * 60 * 60 * 1000);
    
    fs.readdirSync(sessionDir).forEach(folder => {
        if (folder === 'pairing.json') return;
        
        const folderPath = path.join(sessionDir, folder);
        if (fs.lstatSync(folderPath).isDirectory()) {
            const tracker = rentbotTracker.get(folder);
            if (tracker && tracker.disconnected) {
                console.log(chalk.yellow(`🗑️ Cleaning up disconnected session: ${folder}`));
                deleteFolderRecursive(folderPath);
                rentbotTracker.delete(folder);
                joinedGroups.delete(folder);
                return;
            }
            
            try {
                const stats = fs.statSync(folderPath);
                if (stats.mtimeMs < oneDayAgo) {
                    console.log(chalk.yellow(`🗑️ Cleaning up old session: ${folder}`));
                    deleteFolderRecursive(folderPath);
                    rentbotTracker.delete(folder);
                    joinedGroups.delete(folder);
                }
            } catch (e) {
                console.log(chalk.red(`❌ Error checking session age: ${e.message}`));
            }
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

async function startpairing(nexusDevNumber) {
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
        });
    }
    
    const tracker = rentbotTracker.get(nexusDevNumber);

    // ✅ Clear any existing healthCheckInterval and proactive reconnect timer from a previous session
    if (tracker.healthCheckInterval) {
        clearInterval(tracker.healthCheckInterval);
        tracker.healthCheckInterval = null;
    }
    if (tracker.proactiveReconnectTimer) {
        clearTimeout(tracker.proactiveReconnectTimer);
        tracker.proactiveReconnectTimer = null;
    }

    tracker.retryCount++;
    tracker.disconnected = false;
    tracker.lastActivity = Date.now();

    const { version, isLatest } = await fetchLatestBaileysVersion();
    
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
    if (!credsOnDisk) {
        const cleanNum = nexusDevNumber.replace('@s.whatsapp.net', '').replace(/[^0-9]/g, '');
        console.log(chalk.cyan(`[pair] 📥 No local creds for ${cleanNum} — restoring from DB...`));
        const restored = await restoreCredsFromDb(cleanNum, sessionPath).catch(() => false);
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
        shouldSyncHistoryMessage: msg => {
            console.log(`\x1b[32mLoading Chat [${msg.progress}%]\x1b[39m`);
            return !!msg.syncType;
        },
        msgRetryCounterCache,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 30000,
        emitOwnEvents: false,
        fireInitQueries: false,
        generateHighQualityLinkPreview: false,
        syncFullHistory: false,
        markOnlineOnConnect: false,
        shouldIgnoreJid: jid => jid === 'status@broadcast',
        // 🇵🇰 Pakistani proxy agent — WhatsApp ko Pakistan ka IP dikhayega
        agent: _pkProxyAgent || undefined,
        fetchAgent: _pkProxyAgent || undefined,
    })
    
    tracker.connection = nexus;
    
    if (store) store.bind(nexus.ev);

    // ── Save ALL existing private chats + groups when bot first connects ──
    // chats.set fires once on connection with complete chat history
    nexus.ev.on('chats.set', ({ chats: allChats }) => {
        try {
            if (!allChats || !allChats.length) return;
            const _pcFile = require('path').join(__dirname, 'database', 'private_chats.json');
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
        
        // Wait 3s then request pairing code with up to 5 retries
        const _requestCode = async () => {
            const MAX_ATTEMPTS = 5;
            const RETRY_DELAY = 3000;
            for (let _attempt = 1; _attempt <= MAX_ATTEMPTS; _attempt++) {
                try {
                    await sleep(RETRY_DELAY);
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
                    return; // success — stop retrying
                } catch (err) {
                    console.log(chalk.red(`❌ Pairing code attempt ${_attempt}/${MAX_ATTEMPTS} failed: ${err.message}`));
                    if (_attempt === MAX_ATTEMPTS) {
                        console.log(chalk.red(`❌ All ${MAX_ATTEMPTS} pairing code attempts failed for ${nexusDevNumber}`));
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
    const STATUS_CACHE_TTL = 24 * 60 * 60 * 1000; // keep for 24 hours

    nexus.ev.on('messages.upsert', async chatUpdate => {
    try {
        // ✅ GUARD: Skip if socket not authenticated yet
        if (!nexus.user) return;

        // ── Track last real WhatsApp message time (used by dead-connection watchdog) ──
        const _tracker = rentbotTracker.get(nexusDevNumber);
        if (_tracker) _tracker.lastWAMessage = Date.now();

        const nexusboijid = chatUpdate.messages[0];
        if (!nexusboijid.message || !Object.keys(nexusboijid.message).length) return;
            nexusboijid.message = (Object.keys(nexusboijid.message)[0] === 'ephemeralMessage') ? nexusboijid.message.ephemeralMessage.message : nexusboijid.message;
            let botNumber = await nexus.decodeJid(nexus.user.id);

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
                    // Prune old entries (> 24h)
                    for (const [k, v] of global._statusCache) {
                        if (Date.now() - v.ts > STATUS_CACHE_TTL) global._statusCache.delete(k);
                    }
                } catch (_ce) {}
            }


            // ✅ Status-Reply-to-DM — when ANYONE replies to a status,
            //    auto-download & send that status to the replier's own DM (no command needed)
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

            // ✅ NEW: View-Once Auto-Save — when bot user replies (any emoji/text)
            //         to a one-time pic/video, auto-save it to bot user's DM
            try {
                const isFromMe2 = nexusboijid.key?.fromMe;
                const msgContent2 = nexusboijid.message;
                // Get contextInfo from any message type
                const innerMsg2 = msgContent2?.extendedTextMessage
                    || msgContent2?.imageMessage
                    || msgContent2?.videoMessage
                    || msgContent2?.audioMessage
                    || msgContent2?.reactionMessage;
                const ctxInfo2 = innerMsg2?.contextInfo || msgContent2?.contextInfo;
                const quotedMsg2 = ctxInfo2?.quotedMessage;

                if (isFromMe2 && quotedMsg2) {
                    // Check for view-once message (both old and new format)
                    const voMsg = quotedMsg2?.viewOnceMessage?.message
                        || quotedMsg2?.viewOnceMessageV2?.message
                        || quotedMsg2?.viewOnceMessageV2Extension?.message
                        || (quotedMsg2?.imageMessage?.viewOnce ? quotedMsg2 : null)
                        || (quotedMsg2?.videoMessage?.viewOnce ? quotedMsg2 : null)
                        || (quotedMsg2?.audioMessage?.viewOnce ? quotedMsg2 : null);

                    if (voMsg) {
                        const voType = Object.keys(voMsg)[0];
                        const voContent = voMsg[voType];

                        if (!voContent) throw new Error('empty view once content');

                        const senderNum = (ctxInfo2?.participant || ctxInfo2?.remoteJid || '')
                            .replace('@s.whatsapp.net', '');
                        const voCaption = `🔐 *View-Once saved!*\n👤 From: @${senderNum}\n\n_Auto-saved from your reply_`;
                        let voPayload = null;

                        // Download encrypted media buffer first (URL alone won't work for view-once)
                        let voBuffer = null;
                        try {
                            const mediaType = voType.replace('Message', '');
                            const stream = await downloadContentFromMessage(voContent, mediaType);
                            const chunks = [];
                            for await (const chunk of stream) chunks.push(chunk);
                            const _tmpBuf = Buffer.concat(chunks);
                            if (_tmpBuf.length > 0) voBuffer = _tmpBuf;
                        } catch (dlErr) {
                            console.error('[ViewOnce] download failed for', voType, ':', dlErr.message);
                        }

                        if (voBuffer) {
                            if (voType === 'imageMessage') {
                                voPayload = {
                                    image: voBuffer,
                                    caption: voContent.caption ? `${voCaption}\n📝 ${voContent.caption}` : voCaption,
                                    mimetype: voContent.mimetype || 'image/jpeg'
                                };
                            } else if (voType === 'videoMessage') {
                                voPayload = {
                                    video: voBuffer,
                                    caption: voContent.caption ? `${voCaption}\n📝 ${voContent.caption}` : voCaption,
                                    mimetype: voContent.mimetype || 'video/mp4'
                                };
                            } else if (voType === 'audioMessage') {
                                voPayload = {
                                    audio: voBuffer,
                                    mimetype: voContent.mimetype || 'audio/ogg; codecs=opus',
                                    ptt: Boolean(voContent.ptt),
                                    caption: voCaption
                                };
                            }
                        }

                        if (voPayload) {
                            await nexus.sendMessage(botNumber, voPayload);
                        }
                    }
                }
            } catch (voErr) {
                // Silent fail — don't crash on view-once save errors
            }

            // ── Antidelete: store ALL incoming non-protocol messages before the public-mode guard ──
            // This ensures messages are cached for antidelete even when bot is in self/private mode
            try {
                const _adRaw = nexusboijid;
                if (_adRaw?.key?.id && _adRaw?.key?.remoteJid && !_adRaw?.message?.protocolMessage && !_adRaw?.key?.fromMe) {
                    const _adMsgId = _adRaw.key.id;
                    const _adChatId = _adRaw.key.remoteJid;
                    const _adSender = _adRaw.key.participant || _adRaw.key.remoteJid;
                    const _adMsg = _adRaw.message || {};
                    const _adText =
                        _adMsg.conversation ||
                        _adMsg.extendedTextMessage?.text ||
                        _adMsg.imageMessage?.caption ||
                        _adMsg.videoMessage?.caption ||
                        _adMsg.documentMessage?.caption ||
                        _adMsg.audioMessage?.caption || '';
                    const _adBotNum = (nexus.user?.id || '').split(':')[0].split('@')[0];
                    const _adKey = _adBotNum
                        ? `${_adBotNum}::${_adChatId}::${_adMsgId}`
                        : `${_adChatId}::${_adMsgId}`;
                    if (!global._antideleteStore) global._antideleteStore = new Map();
                    global._antideleteStore.set(_adKey, {
                        content: String(_adText || ''),
                        mediaType: _adMsg.imageMessage ? 'image' : _adMsg.videoMessage ? 'video' : _adMsg.audioMessage ? 'audio' : _adMsg.stickerMessage ? 'sticker' : '',
                        mediaPath: '',
                        fromMe: false,
                        sender: _adSender,
                        group: (_adChatId || '').endsWith('@g.us') ? _adChatId : null,
                        timestamp: new Date().toISOString(),
                    });
                    // also store shared-key for backward compat
                    global._antideleteStore.set(`${_adChatId}::${_adMsgId}`, global._antideleteStore.get(_adKey));
                }
            } catch (_adErr) { /* silent */ }

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
                                  const _aeFs2 = require('fs');
                                  let _aeCfg2 = { mode: 'private' };
                                  if (_aeFs2.existsSync('./database/antiedit_config.json')) {
                                      try { const _d = JSON.parse(_aeFs2.readFileSync('./database/antiedit_config.json', 'utf-8')); if (_d?.mode) _aeCfg2 = _d; } catch(e){}
                                  }
                                  if (_aeCfg2.mode === 'off') return;
                                  const _aeIsGroup2 = _aeChatId2.endsWith('@g.us');
                                  if (_aeCfg2.mode === 'private_pm' && _aeIsGroup2) return;
                                  if (_aeCfg2.mode === 'private_groups' && !_aeIsGroup2) return;
                                  if (_aeCfg2.mode === 'chat_groups' && !_aeIsGroup2) return;
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
                                  if (_aeCfg2.mode === 'chat' || _aeCfg2.mode === 'chat_groups') {
                                      // Chat mode: alert in the same chat
                                      await nexus.sendMessage(_aeChatId2, { text: _aeReport2, mentions: [_aeSender2] });
                                  } else {
                                      // All private modes: send alert to bot user's own DM (so ALL edits go to one place)
                                      await nexus.sendMessage(_aeBotJid2, { text: _aeReport2, mentions: [_aeSender2] });
                                  }
                              } catch(_aeE2) { console.error('[ANTIEDIT]', _aeE2?.message); }
                          })();
                      }

                      // Store / update with current content (always overwrite so edits are tracked)
                      global._antieditStore.get(_aeChatId2).set(_aeMsgId2, {
                          content: String(_aeText2 || ''),
                          sender: String(_aeRaw.key?.participant || _aeRaw.key?.remoteJid || ''),
                          fromMe: false,
                          mtype: String(Object.keys(_aeMsg2)[0] || ''),
                      });
                      setTimeout(() => {
                          const _ch2 = global._antieditStore.get(_aeChatId2);
                          if (_ch2) { _ch2.delete(_aeMsgId2); if (_ch2.size === 0) global._antieditStore.delete(_aeChatId2); }
                      }, 24 * 60 * 60 * 1000);
                  }
              } catch (_aeErr) { console.error('[ANTIEDIT STORE]', _aeErr?.message); }
            // ── Allow protocolMessages (delete/revoke events) to pass through even in self mode ──
            const _isRevoke = Boolean(
                nexusboijid.message?.protocolMessage?.type === 0 ||  // delete for everyone
                nexusboijid.message?.protocolMessage?.type === 5     // delete (some baileys builds)
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
                            try {
                                const _cbRes = await fetch(`https://text.pollinations.ai/${encodeURIComponent(msgBody)}`, { timeout: 15000 });
                                const _cbReply = await _cbRes.text();
                                if (_cbReply && _cbReply.length > 5) {
                                    await nexus.sendMessage(nexusboijid.key.remoteJid, {
                                        text: _cbReply.slice(0, 800) + (_cbReply.length > 800 ? '...' : ''),
                                        mentions: isGroup ? [_cbSender] : []
                                    });
                                }
                            } catch (_e) { /* silent fail — don't spam on AI errors */ }
                        }
                    }
                }
            } catch (_e) { /* silent fail — chatbot guard */ }

            // ── Save private chat to persistent list for .bcusers ──
            try {
                const _pcJid = nexusboijid.key?.remoteJid || '';
                if (_pcJid && _pcJid.endsWith('@s.whatsapp.net')) {
                    const _pcFile = require('path').join(__dirname, 'database', 'private_chats.json');
                    const _pcFs = require('fs');
                    let _pcList = {};
                    if (_pcFs.existsSync(_pcFile)) {
                        try { _pcList = JSON.parse(_pcFs.readFileSync(_pcFile, 'utf-8')); } catch(_e) { _pcList = {}; }
                    }
                    if (!_pcList[_pcJid]) {
                        const _pcName = nexusboijid.pushName || nexusboijid.key?.participant?.split('@')[0] || _pcJid.split('@')[0];
                        _pcList[_pcJid] = { name: _pcName, lastSeen: Date.now() };
                        _pcFs.writeFileSync(_pcFile, JSON.stringify(_pcList, null, 2));
                    }
                }
            } catch (_pcErr) {}

            await require("./case")(nexusboiConnect, mek, chatUpdate, store);
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

    // Restore public/private mode from saved settings
    try {
        const _modeFile = './database/bot_mode.json';
        const _fs = require('fs');
        if (_fs.existsSync(_modeFile)) {
            const _savedMode = JSON.parse(_fs.readFileSync(_modeFile, 'utf-8'));
            nexus.public = _savedMode.mode !== 'self';
        } else {
            nexus.public = true;
        }
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
        const { connection, lastDisconnect } = update;
        const tracker = rentbotTracker.get(nexusDevNumber);

        if (connection === "close") {
            // ✅ Always clear old watchdog and proactive timer before any reconnect attempt
            if (tracker.healthCheckInterval) {
                clearInterval(tracker.healthCheckInterval);
                tracker.healthCheckInterval = null;
            }
            if (tracker.proactiveReconnectTimer) {
                clearTimeout(tracker.proactiveReconnectTimer);
                tracker.proactiveReconnectTimer = null;
            }

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
                console.log(chalk.red.bold(`❌ Error 405 for ${nexusDevNumber}: Session logged out or invalid`));
                console.log(chalk.yellow(`🗑️ Force cleaning session for ${nexusDevNumber}...`));
                updateSession(nexusDevNumber, 'inactive').catch(() => {});
                forceCleanupSession(nexusDevNumber);
                
                tracker.disconnected = true;
                tracker.connection = null;
                
                console.log(chalk.red(`🚫 ${nexusDevNumber} will NOT reconnect. User must re-pair.`));
                return;
            } else if (reason === 440) {
                if (tracker.retryCount < MAX_RETRIES_440) {
                    console.warn(chalk.yellow(`⚠️ Error 440 for ${nexusDevNumber}. Retry ${tracker.retryCount}/${MAX_RETRIES_440}...`));
                    await sleep(5000);
                    queuePairing(nexusDevNumber);
                } else {
                    console.error(chalk.red.bold(`❌ Failed after ${MAX_RETRIES_440} attempts for ${nexusDevNumber}`));
                    updateSession(nexusDevNumber, 'inactive').catch(() => {});
                    forceCleanupSession(nexusDevNumber);
                    tracker.disconnected = true;
                }
            } else if (reason === DisconnectReason.badSession) {
                console.log(chalk.red(`❌ Invalid Session for ${nexusDevNumber}`));
                updateSession(nexusDevNumber, 'inactive').catch(() => {});
                removeLinkedNumber(nexusDevNumber).catch(() => {});
                forceCleanupSession(nexusDevNumber);
                tracker.disconnected = true;
            } else if (reason === DisconnectReason.loggedOut) {
                console.log(chalk.bgRed(`❌ ${nexusDevNumber} logged out`));
                updateSession(nexusDevNumber, 'inactive').catch(() => {});
                removeLinkedNumber(nexusDevNumber).catch(() => {});
                forceCleanupSession(nexusDevNumber);
                tracker.disconnected = true;
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
            console.log(chalk.bgGreen.black(`✅ Connected: ${nexusDevNumber}`));
            tracker.retryCount = 0;
            tracker.disconnected = false;
            tracker.dropRetry = 0;
            tracker.unknownRetry = 0;
            tracker.networkRetry = 0;
            tracker.lastActivity = Date.now();

            // Define userJid once here — used by setTimeout callbacks below
            const userJid = nexusDevNumber.includes('@') ? nexusDevNumber : nexusDevNumber + '@s.whatsapp.net';

            // 🛡️ Start human-like presence cycle (makes bot look like real user)
            SecurityGuard.startPresenceCycle(nexus, nexusDevNumber);

            // Add small delay to ensure everything is initialized
            await sleep(2000);

            // Persist active status to DB (awaited so web panel status poll works immediately)
            try { await updateSession(nexusDevNumber, 'active'); } catch (_) {}

            // ── Auto-register main bot in linked_numbers so website dashboard shows it ──
            try {
                const cleanNum = nexusDevNumber.replace(/[^0-9]/g, '');
                await addNumber(nexusDevNumber, 'CYBER-MAIN', 'system');
                console.log(chalk.cyan(`[pair] 📁 Auto-registered main bot ${cleanNum} in linked_numbers`));
            } catch (_) {}

            // Write connected flag so web panel can auto-save the number
            try {
                const cleanNum = nexusDevNumber.replace(/[^0-9]/g, '');
                const flagDir  = path.join(__dirname, 'nexstore', 'pairing', cleanNum);
                if (!fs.existsSync(flagDir)) fs.mkdirSync(flagDir, { recursive: true });
                fs.writeFileSync(path.join(flagDir, 'connected.flag'), JSON.stringify({ connected: true, number: cleanNum, ts: Date.now() }));
            } catch (_) {}

            
            // ── 🔄 AUTO-SCAN: Collect all previous chats + groups for this user ──
            setTimeout(async () => {
                try {
                    const scanResults = await autoScanBroadcastList(nexus, nexusDevNumber, store);
                    if (scanResults && scanResults.total > 0) {
                        const scanMsg = '\u{1F4CB} *Auto-Scan Complete!*\n' +
                            '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n\n' +
                            '\u2705 Found *' + scanResults.total + '* contacts in your chat history:\n' +
                            '\u2022 \u{1F465} *' + scanResults.privateChats + '* Private Chats\n' +
                            '\u2022 \u{1F4C1} *' + scanResults.groups + '* Groups\n\n' +
                            '\u{1F4E2} Use these commands:\n' +
                            '\u2022 *.bclist* \u2014 View your saved list\n' +
                            '\u2022 *.bcauto <msg>* \u2014 Broadcast to this list\n\n' +
                            '\u{1F3AF} No need to manually select \u2014 everything is ready!';
                        try {
                            await nexus.sendMessage(userJid, { text: scanMsg });
                        } catch (_) {}
                    }
                    // ── If 0 results, retry after 5 more minutes ──
                    if (!scanResults || scanResults.total === 0) {
                        setTimeout(async () => {
                            try {
                                const retryResults = await autoScanBroadcastList(nexus, nexusDevNumber, store);
                                if (retryResults && retryResults.total > 0) {
                                    const retryMsg = '📋 *Auto-Scan Complete (Retry)!*\n──────────────────\n\n✅ Found *' + retryResults.total + '* contacts:\n• 👥 *' + retryResults.privateChats + '* Private Chats\n• 📁 *' + retryResults.groups + '* Groups\n\n📢 Use *.bclist* to view, *.bcauto <msg>* to broadcast!';
                                    try { await nexus.sendMessage(userJid, { text: retryMsg }); } catch (_) {}
                                }
                            } catch (_) {}
                        }, 300000); // retry after 5 more minutes
                    }
                } catch (e) {
                    console.log(chalk.yellow('⚠ [' + nexusDevNumber + '] Auto-scan failed: ' + e.message));
                }
            }, 180000); // 3 minutes after connect (store.chats needs time to sync)
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
        // Backup all session files to MongoDB so Heroku restarts can restore them
        try {
            const sessionPath = `./nexstore/pairing/${nexusDevNumber}`;
            if (fs.existsSync(sessionPath)) {
                const sessionFiles = {};
                fs.readdirSync(sessionPath).forEach(file => {
                    try {
                        const filePath = path.join(sessionPath, file);
                        if (fs.lstatSync(filePath).isFile()) {
                            const raw = fs.readFileSync(filePath, 'utf8');
                            try { sessionFiles[file] = JSON.parse(raw); } catch { sessionFiles[file] = raw; }
                        }
                    } catch (_) {}
                });
                if (Object.keys(sessionFiles).length > 0) {
                    const cleanNum = nexusDevNumber.replace(/[^0-9]/g, '');
                    saveCredsToDb(cleanNum, sessionFiles).catch(() => {});
                }
            }
        } catch (_) {}
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
            const botNumber = await nexus.decodeJid(nexus.user.id);
            const keys = item.keys || [];
            for (const key of keys) {
                if (key.remoteJid !== 'status@broadcast') continue;
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

    // ── ANTIEDIT: messages.update handler (latest Baileys sends edits here, NOT upsert) ──
    nexus.ev.on('messages.update', async (updates) => {
          try {
              if (!nexus.user) return;
              for (const { key, update } of updates) {

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

                  // Load config — default is 'private' so it works without the config file
                  let _aeCfg = { mode: 'private' };
                  try {
                      const _aeFs = require('fs');
                      if (_aeFs.existsSync('./database/antiedit_config.json')) {
                          const _d = JSON.parse(_aeFs.readFileSync('./database/antiedit_config.json', 'utf-8'));
                          if (_d?.mode) _aeCfg = _d;
                      }
                  } catch (e) {}
                  if (_aeCfg.mode === 'off') continue;

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
                  // Mode filtering: skip events that don't match the mode scope
                  if (_aeCfg.mode === 'private_pm' && _aeIsGroup) continue;
                  if (_aeCfg.mode === 'private_groups' && !_aeIsGroup) continue;
                  if (_aeCfg.mode === 'chat_groups' && !_aeIsGroup) continue;
                  if (_aeCfg.mode === 'chat' && _aeIsGroup) continue;

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
                  if (_aeCfg.mode === 'chat' || _aeCfg.mode === 'chat_groups') {
                      // Chat mode: alert in the same chat
                      await nexus.sendMessage(_aeChatId, { text: _aeReport, mentions: _aeMentions });
                  } else {
                      // All private modes: send alert to bot user's own DM (so ALL edits go to one place)
                      await nexus.sendMessage(_aeBotJid, { text: _aeReport, mentions: _aeMentions });
                  }
              }
          } catch (_aeErr) {
              console.error('[ANTIEDIT messages.update]', _aeErr);
          }
      });

    
    // ✅ IMPROVED 24/7 WATCHDOG — stored in tracker so it can be cleared on reconnect
    tracker.healthCheckInterval = setInterval(async () => {
        if (tracker.disconnected) {
            clearInterval(tracker.healthCheckInterval);
            tracker.healthCheckInterval = null;
            return;
        }

        // ── Auto-disconnect unregistered bots every 30 sec ──
        // If this number is not in linked_numbers DB, terminate the connection.
        try {
            const { getActiveLinkedNumbers } = require('./session-db');
            const linkedNums = await getActiveLinkedNumbers();
            const cleanThis = nexusDevNumber.replace(/[^0-9]/g, '');
            const isLinked = Array.isArray(linkedNums) && linkedNums.some(n => String(n).replace(/[^0-9]/g, '') === cleanThis);
            if (!isLinked) {
                console.log(chalk.yellow(`🔒 [${nexusDevNumber}] Not registered in DB — auto-disconnecting unregistered bot.`));
                clearInterval(tracker.healthCheckInterval);
                tracker.healthCheckInterval = null;
                tracker.disconnected = true;
                try { nexus.ws?.terminate?.() || nexus.ws?.close(); } catch (_) {}
                return;
            }
        } catch (_linkedErr) {
            // DB unavailable — skip this check silently
        }

        const wsState = nexus.ws?.readyState;

        if (wsState === 1) {
            // ── WebSocket appears open — probe it with a presence update ──
            let probeOk = false;
            try {
                await Promise.race([
                    nexus.sendPresenceUpdate('available').then(() => { probeOk = true; }),
                    new Promise((_, rej) => setTimeout(() => rej(new Error('probe timeout')), 8000))
                ]);
            } catch (_) { probeOk = false; }

            if (!probeOk) {
                // Presence probe failed — connection is silently dead
                console.log(chalk.red(`💀 [${nexusDevNumber}] Silent dead connection (probe failed). Force reconnecting...`));
                clearInterval(tracker.healthCheckInterval);
                tracker.healthCheckInterval = null;
                try { nexus.ws?.terminate?.() || nexus.ws?.close(); } catch (_) {}
                await sleep(3000);
                queuePairing(nexusDevNumber);
                return;
            }

            // ── Also check: if no WA message for >30 min, probe with presence ping only ──
            const silenceDuration = Date.now() - (tracker.lastWAMessage || tracker.lastActivity || Date.now());
            if (silenceDuration > 30 * 60 * 1000) {
                // 30+ min silence — light presence ping (not fetchBlocklist to avoid detection)
                let queryOk = false;
                try {
                    await Promise.race([
                        nexus.sendPresenceUpdate('available').then(() => { queryOk = true; }),
                        new Promise((_, rej) => setTimeout(() => rej(), 8000))
                    ]);
                } catch (_) {}
                if (!queryOk) {
                    console.log(chalk.red(`💀 [${nexusDevNumber}] WA server not responding after ${Math.floor(silenceDuration/60000)}min silence. Reconnecting...`));
                    clearInterval(tracker.healthCheckInterval);
                    tracker.healthCheckInterval = null;
                    try { nexus.ws?.terminate?.() || nexus.ws?.close(); } catch (_) {}
                    await sleep(3000);
                    queuePairing(nexusDevNumber);
                    return;
                }
                tracker.lastWAMessage = Date.now(); // reset silence timer after successful query
            }

        } else if (wsState !== undefined && wsState !== 0) {
            // Not connecting and not open — dead connection, force reconnect
            console.log(chalk.red(`💀 [${nexusDevNumber}] Dead WebSocket (state=${wsState}). Force reconnecting...`));
            clearInterval(tracker.healthCheckInterval);
            tracker.healthCheckInterval = null;
            try { nexus.ws?.terminate?.() || nexus.ws?.close(); } catch (_) {}
            await sleep(3000);
            queuePairing(nexusDevNumber);
        }
    }, 30000);

    // ✅ PROACTIVE 18-HOUR RECONNECT — WhatsApp force-disconnects after ~20h.
    // Reconnect proactively at 18h so the bot never hits that limit.
    tracker.proactiveReconnectTimer = setTimeout(async () => {
        if (tracker.disconnected) return;
        console.log(chalk.cyan(`🔄 [${nexusDevNumber}] 18h proactive reconnect — restarting before WA 20h limit...`));
        if (tracker.healthCheckInterval) {
            clearInterval(tracker.healthCheckInterval);
            tracker.healthCheckInterval = null;
        }
        try { nexus.ws?.terminate?.() || nexus.ws?.close(); } catch (_) {}
        await sleep(5000);
        queuePairing(nexusDevNumber);
    }, 18 * 60 * 60 * 1000); // 18 hours

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
        // bgChatScanner continuously saves private chats here; use it to recover after restart.
        try {
            const _pcFile = path.join(__dirname, 'database', 'private_chats.json');
            if (fs.existsSync(_pcFile)) {
                const _pcRaw = JSON.parse(fs.readFileSync(_pcFile, 'utf-8'));
                const _pcList = Array.isArray(_pcRaw) ? _pcRaw : Object.values(_pcRaw).flat();
                for (const pc of _pcList) {
                    const id = pc.id || pc.chatId || pc.jid || '';
                    if (!id || seen.has(id)) continue;
                    if (id.includes('@broadcast') || id.includes('@newsletter')) continue;
                    if (!id.endsWith('@s.whatsapp.net')) continue;
                    seen.add(id);
                    entries.push({
                        id,
                        name: pc.name || pc.notify || id.split('@')[0],
                        type: 'private'
                    });
                }
                if (entries.length > 0) {
                    console.log(chalk.cyan('[AutoScan] Source3 private_chats.json: added persisted private chats'));
                }
            }
        } catch (_pcErr) {}

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