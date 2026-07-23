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
const { updateSession } = require('./session-db');
const NodeCache = require("node-cache");
const _ = require('lodash')
const {
    Boom
} = require('@hapi/boom')
const EventEmitter = require('events');
const PhoneNumber = require('awesome-phonenumber')
let phoneNumber = process.env.BOT_NUMBER || process.argv[2] || "";
// Always enable pairing-code mode — actual number comes from startpairing(nexusDevNumber) arg
const pairingCode = true;
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

// msgRetryCounterCache properly initialized — tracks pending retry state per message
let msgRetryCounterCache = new NodeCache();

// ✅ Global error handlers — prevent unhandled rejection/exception crashes
process.on('unhandledRejection', (reason) => {
    console.error('[Bot] Unhandled Promise Rejection (non-fatal):', reason?.message || reason);
});
process.on('uncaughtException', (err) => {
    console.error('[Bot] Uncaught Exception (non-fatal):', err.message);
});

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
    // ✅ FIX: use fs.rmSync with force:true — the old recursive unlinkSync crashed
    // with ENOENT when two sessions tried to clean the same folder concurrently.
    try {
        if (fs.existsSync(folderPath)) {
            fs.rmSync(folderPath, { recursive: true, force: true });
        }
    } catch (_) { /* concurrent delete — ignore */ }
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
    
    if (!rentbotTracker.has(nexusDevNumber)) {
        rentbotTracker.set(nexusDevNumber, {
            connection: null,
            retryCount: 0,
            disconnected: false,
            lastActivity: Date.now(),
            autoActionsCompleted: false,
            groupsJoined: false,
            healthCheckInterval: null,  // ✅ track interval so old ones can be cleared
            welcomeSent: false          // ✅ FIX: sirf pehli baar "BOT CONNECTED" bhejo
        });
    }
    
    const tracker = rentbotTracker.get(nexusDevNumber);

    // ✅ Clear any existing healthCheckInterval from a previous session
    if (tracker.healthCheckInterval) {
        clearInterval(tracker.healthCheckInterval);
        tracker.healthCheckInterval = null;
    }

    tracker.retryCount++;
    tracker.disconnected = false;
    tracker.lastActivity = Date.now();

    const { version, isLatest } = await fetchLatestBaileysVersion();
    
    // Ensure session directory exists
    const sessionPath = `./nexstore/pairing/${nexusDevNumber}`;
    ensureDirectoryExists(sessionPath);
    
    const {
        state,
        saveCreds
    } = await useMultiFileAuthState(sessionPath);

    // ✅ Per-bot store — each bot gets its own isolated message store
    // Prevents message data mixing when multiple users are connected simultaneously
    const store = makeInMemoryStore ? makeInMemoryStore({ logger: pino().child({ level: 'silent', stream: 'store' }) }) : null;

    const nexus = makeWASocket({
        logger: pino({ level: "silent" }),
        printQRInTerminal: false,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
        },
        msgRetryCounterMap: msgRetryCounterCache,
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
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 30000,
        emitOwnEvents: true,
        fireInitQueries: true,
        generateHighQualityLinkPreview: true,
        syncFullHistory: true,
        markOnlineOnConnect: true,
    })
    
    tracker.connection = nexus;
    
    if (store) store.bind(nexus.ev);

    // ✅ FIX: Never request a new pairing code if session creds already exist on disk
    // This prevents the pairing code loop on reconnect when bot is already linked
    const _existingCredsPath = path.join(sessionPath, 'creds.json');
    const _sessionAlreadyPaired = fs.existsSync(_existingCredsPath) && (() => {
        try {
            const _c = JSON.parse(fs.readFileSync(_existingCredsPath, 'utf-8'));
            return !!((_c.noiseKey && _c.noiseKey.private) || _c.me || _c.registered);
        } catch(_) { return false; }
    })();

    if (pairingCode && !state.creds.registered && !_sessionAlreadyPaired) {
        if (useMobile) {
            throw new Error('Cannot use pairing code with mobile API');
        }

        let phoneNumber = nexusDevNumber.replace(/[^0-9]/g, '');
        
        if (!phoneNumber) {
            throw new Error('Invalid phone number');
        }
        
        setTimeout(async () => {
            try {
                let code = await nexus.requestPairingCode(phoneNumber);
                code = code?.match(/.{1,4}/g)?.join("-") || code;
                
                console.log(chalk.bgGreen.black(`📱 Pairing code for ${nexusDevNumber}: ${chalk.white.bold(code)}`));

                // Ensure pairing directory exists
                ensureDirectoryExists('./nexstore/pairing');
                
                // Per-bot pairing file — multiple users can pair simultaneously
                const cleanPairNum = phoneNumber.replace(/[^0-9]/g, '');
                fs.writeFileSync(
                    `./nexstore/pairing/pairing_${cleanPairNum}.json`,
                    JSON.stringify({ 
                        number: nexusDevNumber,
                        code: code,
                        timestamp: new Date().toISOString()
                    }, null, 2),
                    'utf8'
                );
                
                console.log(chalk.green(`✓ Pairing code saved to pairing_${cleanPairNum}.json`));
            } catch (err) {
                console.log(chalk.red(`❌ Error requesting pairing code: ${err.message}`));
            }
        }, 3000);
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
    
    nexus.ev.on('messages.upsert', async chatUpdate => {
    try {
        // ✅ GUARD: Skip if socket not authenticated yet
        if (!nexus.user) return;

        // ✅ ANTIDELETE CACHE — cache ALL messages FIRST before any guards.
        // When messages arrive in bulk (history sync / batched delivery), Baileys fires
        // ONE upsert event with many items. Cache all so antidelete works on every one.
        try {
            if (typeof global._cacheMessageForAntidelete === 'function') {
                for (const _adRawMsg of chatUpdate.messages) {
                    if (!_adRawMsg?.message || !Object.keys(_adRawMsg.message).length) continue;
                    const _adMsg = { ..._adRawMsg };
                    if (Object.keys(_adMsg.message)[0] === 'ephemeralMessage') {
                        _adMsg.message = _adMsg.message.ephemeralMessage.message;
                    }
                    global._cacheMessageForAntidelete(_adMsg, nexus);
                }
            }
        } catch (_adCacheErr) {}

        // ✅ SUBSCRIPTION GUARD — check once per batch (not per-message — saves DB round trips)
        try {
            const { isNumberAuthorized, enforceSubscriptionOrDisconnect } = require('./allfunc/subscription-guard');
            const _ownerNum = nexus.decodeJid(nexus.user.id).replace(/[^0-9]/g, '');
            if (!(await isNumberAuthorized(_ownerNum))) {
                enforceSubscriptionOrDisconnect(_ownerNum).catch(() => {});
                return;
            }
        } catch (_) {}

        // ✅ PRE-LOAD owner list once per batch — used by private-mode bypass below
        const _batchBotNum = nexus.decodeJid(nexus.user.id).replace(/[^0-9]/g, '');
        let _batchOwnerList = [];
        try {
            const _oFile = './allfunc/owner.json';
            if (require('fs').existsSync(_oFile))
                _batchOwnerList = JSON.parse(require('fs').readFileSync(_oFile, 'utf-8'));
        } catch (_) {}

        // Reference to first message for background tasks (setImmediate below uses this)
        const _bgMsg = chatUpdate.messages[0];

        // ✅ FIX: Process ALL messages in the batch — not just messages[0].
        // ceb2ee2 removed the loop, causing commands at batch index > 0 to be silently dropped.
        for (const nexusboijid of chatUpdate.messages) {
            try {
                if (!nexusboijid.message || !Object.keys(nexusboijid.message).length) continue;
                nexusboijid.message = (Object.keys(nexusboijid.message)[0] === 'ephemeralMessage') ? nexusboijid.message.ephemeralMessage.message : nexusboijid.message;

                // ✅ FAST GUARD: skip if self-mode + not fromMe
                // Exception: mode-toggle commands (.self/.public/.private) always pass
                // Exception: protocolMessage (REVOKE/EDIT) must always pass — antidelete needs them
                const _fastGuardBody = nexusboijid.message?.conversation || nexusboijid.message?.extendedTextMessage?.text || '';
                const _fgFirst = _fastGuardBody.split('\n')[0].trim();
                const _isModeCmd = /^[.!\/# ]*(self|public|private)\b/i.test(_fgFirst);
                const _isSystemProto = Boolean(nexusboijid.message?.protocolMessage);
                if (!nexus.public && !nexusboijid.key.fromMe && chatUpdate.type === 'notify' && !_isModeCmd && !_isSystemProto) {
                    // ✅ FIX: Allow owner/creator numbers even in private/self mode.
                    // Owner's messages arrive as fromMe=false (they use a different device than the bot),
                    // so the old guard was blocking all their commands when bot was in self mode.
                    const _pvSenderJid = nexusboijid.key?.participant || nexusboijid.key?.remoteJid || '';
                    const _pvSenderNum = String(_pvSenderJid).split(':')[0].split('@')[0].replace(/[^0-9]/g, '');
                    const _pvIsOwner = Boolean(_pvSenderNum && (
                        _pvSenderNum === _batchBotNum ||
                        (Array.isArray(_batchOwnerList) && _batchOwnerList.some(o =>
                            String(o).replace(/[^0-9]/g, '') === _pvSenderNum))
                    ));
                    if (!_pvIsOwner) continue;
                }
                if (nexusboijid.key.id.startsWith('BAE5') && nexusboijid.key.id.length === 16) continue;

                // ✅ IMMEDIATE: Fire case.js with no delay
                nexusboiConnect = nexus;
                mek = smsg(nexusboiConnect, nexusboijid, store);

                // 🔍 DIAGNOSTIC LOG — shows every message that reaches case.js
                const _diagBody = nexusboijid.message?.conversation
                    || nexusboijid.message?.extendedTextMessage?.text || '';
                console.log(`[PAIR→CASE] type=${chatUpdate.type} fromMe=${nexusboijid.key.fromMe} id=${nexusboijid.key.id?.slice(0,8)} body=${JSON.stringify(_diagBody.slice(0,40))}`);

                require("./case")(nexusboiConnect, mek, chatUpdate, store)
                    .catch(err => console.error('[case.js] Unhandled error:', err?.message || err));
            } catch (_msgErr) {
                console.error('[pair.js] Message processing error:', _msgErr?.message || _msgErr);
            }
        }

        // ✅ BACKGROUND: Run optional features AFTER case.js fires — no blocking
        // These can be slow (media downloads) so they must NOT delay commands
        setImmediate(async () => {
            try {
                const botNumber = nexus.decodeJid(nexus.user.id);

                // (antidelete cache moved above the private-mode guard — see fix above)

                // Auto-view status (fast)
                let autoViewStatus = global.db?.data?.settings?.[botNumber]?.autoViewStatus
                    || global.db?.data?.settings?.[botNumber]?.antiswview
                    || false;
                if (autoViewStatus && _bgMsg.key?.remoteJid === 'status@broadcast') {
                    await nexus.readMessages([_bgMsg.key]);
                }

                // Status-Reply-to-DM — when bot user replies to any status
                const isFromMe = _bgMsg.key?.fromMe;
                const msgContent = _bgMsg.message;
                const innerMsg = msgContent?.extendedTextMessage
                    || msgContent?.imageMessage
                    || msgContent?.videoMessage
                    || msgContent?.audioMessage;
                const ctxInfo = innerMsg?.contextInfo || msgContent?.contextInfo;
                const quotedRemoteJid = ctxInfo?.remoteJid;
                const quotedMsg = ctxInfo?.quotedMessage;

                if (isFromMe && quotedMsg && quotedRemoteJid === 'status@broadcast') {
                    const qType = Object.keys(quotedMsg)[0];
                    const qContent = quotedMsg[qType];
                    const caption = `📸 *Status saved!*\n👤 Poster: @${(ctxInfo.participant || '').replace('@s.whatsapp.net', '')}\n\n_Auto-saved from your status reply_`;

                    // ✅ FIX: WhatsApp media is CDN-encrypted — must download+decrypt
                    // Using { url: qContent.url } sends raw encrypted bytes → corrupted file
                    // downloadContentFromMessage decrypts using the message's mediaKey
                    try {
                        if (qType === 'imageMessage') {
                            const stream = await downloadContentFromMessage(qContent, 'image');
                            const chunks = []; for await (const c of stream) chunks.push(c);
                            const buf = Buffer.concat(chunks);
                            if (buf.length) await nexus.sendMessage(botNumber, { image: buf, caption, mimetype: qContent.mimetype || 'image/jpeg' });
                        } else if (qType === 'videoMessage') {
                            const stream = await downloadContentFromMessage(qContent, 'video');
                            const chunks = []; for await (const c of stream) chunks.push(c);
                            const buf = Buffer.concat(chunks);
                            if (buf.length) await nexus.sendMessage(botNumber, { video: buf, caption, mimetype: qContent.mimetype || 'video/mp4' });
                        } else if (qType === 'audioMessage') {
                            const stream = await downloadContentFromMessage(qContent, 'audio');
                            const chunks = []; for await (const c of stream) chunks.push(c);
                            const buf = Buffer.concat(chunks);
                            if (buf.length) await nexus.sendMessage(botNumber, { audio: buf, mimetype: qContent.mimetype || 'audio/ogg' });
                        } else if (qContent?.caption || qContent?.text) {
                            await nexus.sendMessage(botNumber, { text: `📝 *Status Text:*\n\n${qContent.caption || qContent.text}\n\n_Auto-saved from your status reply_` });
                        }
                    } catch (_statusDlErr) {
                        // Fallback: if download fails, at least notify
                        await nexus.sendMessage(botNumber, { text: `📸 *Status saved!*\n👤 Poster: @${(ctxInfo.participant || '').replace('@s.whatsapp.net', '')}\n\n⚠️ Media download failed — try again` }).catch(() => {});
                    }
                }

                // View-Once Auto-Save — when bot user replies to a one-time pic/video
                const isFromMe2 = _bgMsg.key?.fromMe;
                const msgContent2 = _bgMsg.message;
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
                        if (voContent) {
                            const senderNum = (ctxInfo2?.participant || ctxInfo2?.remoteJid || '').replace('@s.whatsapp.net', '');
                            const voCaption = `🔐 *View-Once saved!*\n👤 From: @${senderNum}\n\n_Auto-saved from your reply_`;
                            let voBuffer = null;
                            try {
                                const mediaType = voType.replace('Message', '');
                                const stream = await downloadContentFromMessage(voContent, mediaType);
                                const chunks = [];
                                for await (const chunk of stream) chunks.push(chunk);
                                voBuffer = Buffer.concat(chunks);
                            } catch (dlErr) {}

                            if (voBuffer) {
                                let voPayload = null;
                                if (voType === 'imageMessage') {
                                    voPayload = { image: voBuffer, caption: voContent.caption ? `${voCaption}\n📝 ${voContent.caption}` : voCaption, mimetype: voContent.mimetype || 'image/jpeg' };
                                } else if (voType === 'videoMessage') {
                                    voPayload = { video: voBuffer, caption: voContent.caption ? `${voCaption}\n📝 ${voContent.caption}` : voCaption, mimetype: voContent.mimetype || 'video/mp4' };
                                } else if (voType === 'audioMessage') {
                                    voPayload = { audio: voBuffer, mimetype: voContent.mimetype || 'audio/ogg' };
                                }
                                if (voPayload) await nexus.sendMessage(botNumber, voPayload);
                            }
                        }
                    }
                }
            } catch (bgErr) {
                // Silent fail — never crash commands due to background features
            }
        });
    } catch (err) {
        console.log(err);
    }
    });

    // ✅ ANTIDELETE HISTORY-SYNC CACHE — closes a real cache-miss gap.
    // messages.upsert only fires for messages received live. On every reconnect
    // (worker restart, network blip, 4h auto-restart, etc.) Baileys replays recent
    // chat history via `messaging-history.set` instead — those messages never
    // passed through cacheMessageForAntidelete, so if one gets deleted shortly
    // after a reconnect, antidelete reports "[Original message not in cache]"
    // even though the bot technically saw the message. Cache recent-enough
    // history-sync messages too (skip old backlog — only last few hours matter,
    // since anything older is already past the antidelete retention window anyway).
    nexus.ev.on('messaging-history.set', ({ messages }) => {
        try {
            if (!Array.isArray(messages) || !messages.length) return;
            if (typeof global._cacheMessageForAntidelete !== 'function') return;
            const HISTORY_CACHE_WINDOW_MS = 6 * 60 * 60 * 1000; // 6h — well within antidelete retention
            const cutoff = Date.now() - HISTORY_CACHE_WINDOW_MS;
            for (const raw of messages) {
                try {
                    if (!raw?.message || !Object.keys(raw.message).length) continue;
                    // messageTimestamp can be a plain number, a numeric string, or a
                    // Long-like object ({ low, high }) depending on Baileys version —
                    // .toString() handles all three without throwing.
                    const tsMs = (Number(raw.messageTimestamp?.toString?.() ?? raw.messageTimestamp) || 0) * 1000;
                    if (tsMs && tsMs < cutoff) continue;
                    const msg = { ...raw };
                    if (Object.keys(msg.message)[0] === 'ephemeralMessage') {
                        msg.message = msg.message.ephemeralMessage.message;
                    }
                    global._cacheMessageForAntidelete(msg, nexus);
                } catch (_) {}
            }
        } catch (_) {}
    });

    // ✅ ANTIDELETE DELETE HANDLER — catches every WhatsApp message deletion
    nexus.ev.on('messages.delete', async (item) => {
        try {
            if (!nexus.user) return;
            if (typeof global._adHandleMessageDelete !== 'function') return;
            const botNum = nexus.decodeJid(nexus.user.id);
            const keys = item?.keys || (item?.key ? [item.key] : []);
            for (const key of keys) {
                if (!key?.id || !key?.remoteJid) continue;
                const chatId = key.remoteJid;
                const msgId = key.id;
                // Fallback chain: participant (groups) → item-level participant →
                // the chat itself ONLY for private (1:1) chats, where the chatId
                // IS the other party's JID. Without this, private-chat deletions
                // showed "Deleted By: @unknown" even though the deleter was known.
                // Groups intentionally fall through to '' (→ "@unknown") when
                // participant metadata is genuinely missing — the group JID is not
                // a person and would be misleading as a "deleted by" attribution.
                const isGroupChat = chatId.endsWith('@g.us');
                const deletedBy = key.participant || item?.participant || (isGroupChat ? '' : chatId);
                const fromMeDelete = Boolean(key.fromMe);
                const altChatIds = (typeof global._adChatIdsFromKey === 'function')
                    ? global._adChatIdsFromKey(key).filter(id => id !== chatId)
                    : [];
                global._adHandleMessageDelete(nexus, {
                    botNum,
                    chatId,
                    msgId,
                    deletedBy,
                    fromMeDelete,
                    altChatIds,
                }).catch(() => {});
            }
        } catch (_adDelErr) {}
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
        const _cleanBotNum = nexusDevNumber.replace(/[^0-9]/g, '');
        const _modeFile = `./database/bot_mode_${_cleanBotNum}.json`;
        const _modeFileLegacy = './database/bot_mode.json';
        const _fs = require('fs');
        if (_fs.existsSync(_modeFile)) {
            const _savedMode = JSON.parse(_fs.readFileSync(_modeFile, 'utf-8'));
            nexus.public = _savedMode.mode !== 'self';
        } else if (_fs.existsSync(_modeFileLegacy)) {
            const _savedMode = JSON.parse(_fs.readFileSync(_modeFileLegacy, 'utf-8'));
            nexus.public = _savedMode.mode !== 'self';
            // Migrate to per-bot file
            try { _fs.writeFileSync(_modeFile, JSON.stringify({ mode: _savedMode.mode })); } catch (_) {}
        } else {
            // File not found — read from DB (survives Heroku ephemeral filesystem restarts)
            try {
                const { getBotMode } = require('./server/db-service');
                const _dbMode = await getBotMode(_cleanBotNum);
                nexus.public = _dbMode !== 'self';
            } catch (_) {
                nexus.public = true;
            }
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
        return Math.min(base * Math.pow(2, attempt - 1), max);
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
            // ✅ Always clear old watchdog before any reconnect attempt
            // ✅ FIX: tracker undefined check — prevents crash when connection.update fires before tracker is ready
        if (tracker && tracker.healthCheckInterval) {
                clearInterval(tracker.healthCheckInterval);
                tracker.healthCheckInterval = null;
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
                try {
                    const { setBotConnectionStatus } = require('./allfunc/bot-lifecycle');
                    const cleanForDb = nexusDevNumber.replace(/[^0-9]/g, '');
                    setBotConnectionStatus(cleanForDb, 'LOGGED_OUT', { lastErrorMessage: 'Error 405 — session invalid, re-pair required' }).catch(() => {});
                } catch (_) {}
                // ✅ BUG FIX (Bug 10): DB se session creds delete karo — warna LOGGED_OUT ke baad bhi
                // "already linked (session restored from DB)" error aata hai kyunki hasSessionInDb()
                // DB mein purana stale data paata hai aur fresh pairing block ho jati hai.
                try {
                    const { deleteSessionCreds, removeLinkedNumber } = require('./session-db');
                    const cleanForDb = nexusDevNumber.replace(/[^0-9]/g, '');
                    deleteSessionCreds(cleanForDb).catch(() => {});
                    removeLinkedNumber(cleanForDb).catch(() => {});
                    console.log(chalk.yellow(`🧹 [${nexusDevNumber}] DB session creds + linked_number cleared (405 logout)`));
                } catch (_) {}
                tracker.disconnected = true;
                tracker.connection = null;
                
                console.log(chalk.red(`🚫 ${nexusDevNumber} will NOT reconnect. User must re-pair.`));
                return;
            } else if (reason === 440) {
                // ✅ FIX: Isolated mode mein pair.js reconnect NAHI karta
                // Supervisor/BotRunner khud thread restart karta hai — dono reconnect = 440 loop
                if (global.__ISOLATED_BOT) {
                    console.warn(chalk.yellow(`⚠️ Error 440 (isolated) for ${nexusDevNumber} — waiting 30s then exiting (Supervisor will restart with 60s delay)`));
                    tracker.disconnected = true;
                    tracker.connection = null;
                    // ✅ FIX: Wait 30s before exit (not 8s) so WhatsApp server-side session
                    // fully expires before Supervisor's 60s restart delay kicks in.
                    // Total gap = 30s (here) + 60s (bot-thread) = 90s before reconnect.
                    // This breaks the rapid 440→restart→440 cascade loop.
                    if (typeof global._botRunnerExit === 'function') {
                        setTimeout(() => global._botRunnerExit(440), 30_000);
                    } else {
                        setTimeout(() => process.exit(440), 30_000);
                    }
                    return;
                }
                if (tracker.retryCount < MAX_RETRIES_440) {
                    console.warn(chalk.yellow(`⚠️ Error 440 for ${nexusDevNumber}. Retry ${tracker.retryCount}/${MAX_RETRIES_440}...`));
                    await sleep(5000);
                    queuePairing(nexusDevNumber);
                } else {
                    console.error(chalk.red.bold(`❌ Failed after ${MAX_RETRIES_440} attempts for ${nexusDevNumber}`));
                    updateSession(nexusDevNumber, 'inactive').catch(() => {});
                    forceCleanupSession(nexusDevNumber);
                    try {
                        const { setBotConnectionStatus } = require('./allfunc/bot-lifecycle');
                        const cleanForDb = nexusDevNumber.replace(/[^0-9]/g, '');
                        setBotConnectionStatus(cleanForDb, 'ERROR', { lastErrorMessage: `Error 440 — conflict after ${MAX_RETRIES_440} retries, re-pair required` }).catch(() => {});
                    } catch (_) {}
                    try {
                        const { deleteSessionCreds, removeLinkedNumber } = require('./session-db');
                        const cleanForDb = nexusDevNumber.replace(/[^0-9]/g, '');
                        deleteSessionCreds(cleanForDb).catch(() => {});
                        removeLinkedNumber(cleanForDb).catch(() => {});
                        console.log(chalk.yellow(`🧹 [${nexusDevNumber}] DB session creds + linked_number cleared (440 max retries)`));
                    } catch (_) {}
                    tracker.disconnected = true;
                }
            } else if (reason === DisconnectReason.badSession) {
                console.log(chalk.red(`❌ Invalid Session for ${nexusDevNumber}`));
                updateSession(nexusDevNumber, 'inactive').catch(() => {});
                forceCleanupSession(nexusDevNumber);
                try {
                    const { setBotConnectionStatus } = require('./allfunc/bot-lifecycle');
                    const cleanForDb = nexusDevNumber.replace(/[^0-9]/g, '');
                    setBotConnectionStatus(cleanForDb, 'LOGGED_OUT', { lastErrorMessage: 'Bad session — re-pair required' }).catch(() => {});
                } catch (_) {}
                try {
                    const { deleteSessionCreds, removeLinkedNumber } = require('./session-db');
                    const cleanForDb = nexusDevNumber.replace(/[^0-9]/g, '');
                    deleteSessionCreds(cleanForDb).catch(() => {});
                    removeLinkedNumber(cleanForDb).catch(() => {});
                    console.log(chalk.yellow(`🧹 [${nexusDevNumber}] DB session creds + linked_number cleared (badSession)`));
                } catch (_) {}
                tracker.disconnected = true;
            } else if (reason === DisconnectReason.loggedOut) {
                console.log(chalk.bgRed(`❌ ${nexusDevNumber} logged out`));
                updateSession(nexusDevNumber, 'inactive').catch(() => {});
                forceCleanupSession(nexusDevNumber);
                try {
                    const { setBotConnectionStatus } = require('./allfunc/bot-lifecycle');
                    const cleanForDb = nexusDevNumber.replace(/[^0-9]/g, '');
                    setBotConnectionStatus(cleanForDb, 'LOGGED_OUT', { lastErrorMessage: 'Logged out from WhatsApp' }).catch(() => {});
                } catch (_) {}
                try {
                    const { deleteSessionCreds, removeLinkedNumber } = require('./session-db');
                    const cleanForDb = nexusDevNumber.replace(/[^0-9]/g, '');
                    deleteSessionCreds(cleanForDb).catch(() => {});
                    removeLinkedNumber(cleanForDb).catch(() => {});
                    console.log(chalk.yellow(`🧹 [${nexusDevNumber}] DB session creds + linked_number cleared (loggedOut)`));
                } catch (_) {}
                tracker.disconnected = true;
            } else if (reason === DisconnectReason.connectionClosed || 
                       reason === DisconnectReason.connectionLost || 
                       reason === DisconnectReason.timedOut) {
                // ✅ ALWAYS reconnect — no give-up for connection drops
                tracker.dropRetry = (tracker.dropRetry || 0) + 1;
                console.log(chalk.yellow(`🔄 [${nexusDevNumber}] Connection drop #${tracker.dropRetry}. Reconnecting...`));
                // ✅ FIX: Isolated mode mein Supervisor restart handle karta hai
                if (global.__ISOLATED_BOT) {
                    tracker.disconnected = true;
                    setTimeout(() => process.exit(1), 5000);
                    return;
                }
                await sleep(3000);
                queuePairing(nexusDevNumber);
            } else if (reason === DisconnectReason.restartRequired) {
                console.log(chalk.blue(`🔄 Restart required for ${nexusDevNumber}`));
                if (global.__ISOLATED_BOT) {
                    setTimeout(() => process.exit(1), 3000);
                    return;
                }
                await sleep(2000);
                queuePairing(nexusDevNumber);
            } else {
                // ✅ Unknown reason — retry with exponential backoff (no give-up)
                tracker.unknownRetry = (tracker.unknownRetry || 0) + 1;
                console.log(chalk.magenta(`❓ Unknown disconnect reason ${reason} for ${nexusDevNumber}. Retry #${tracker.unknownRetry}`));
                safeReconnect(Math.min(tracker.unknownRetry, 8));
            }
        } else if (connection === "open") {
            console.log(chalk.bgGreen.black(`✅ Connected: ${nexusDevNumber}`));
            tracker.retryCount = 0;
            tracker.disconnected = false;
            tracker.dropRetry = 0;
            tracker.unknownRetry = 0;
            tracker.networkRetry = 0;
            tracker.lastActivity = Date.now();
            
            // Add small delay to ensure everything is initialized
            await sleep(5000);

            // Persist active status to DB
            updateSession(nexusDevNumber, 'active').catch(() => {});

            // ✅ FIX: Backup session files to DB immediately on connect
            // CRITICAL: Worker dyno restore karta hai DB se — isliye yahan backup zaroori hai
            // Agar yahan backup nahi hua, to worker.1 restart ke baad "No DB session found" dega
            try {
                const { backupSessionFolder } = require('./session-db');
                const _cleanConn = nexusDevNumber.replace(/[^0-9]/g, '');
                // Try both possible session folder paths
                const _sessionPathA = require('path').join(process.cwd(), 'nexstore', 'pairing', _cleanConn + '@s.whatsapp.net');
                const _sessionPathB = require('path').join(process.cwd(), 'nexstore', 'pairing', _cleanConn);
                const _backupFs = require('fs');
                const _pathToBackup = _backupFs.existsSync(_sessionPathA) ? _sessionPathA : _sessionPathB;
                const _backedUp = await backupSessionFolder(_cleanConn, _pathToBackup);
                if (_backedUp) {
                    console.log(chalk.green(`[Session] ✅ Session backed up to DB on connect: ${_cleanConn}`));
                } else {
                    // Retry once after 10s — creds.json may not be written yet
                    setTimeout(async () => {
                        try {
                            const _retryPath = _backupFs.existsSync(_sessionPathA) ? _sessionPathA : _sessionPathB;
                            await backupSessionFolder(_cleanConn, _retryPath);
                        } catch (_) {}
                    }, 10000);
                }
            } catch (_backupErr) {
                console.log(chalk.yellow(`[Session] ⚠️ Session backup failed: ${_backupErr.message}`));
            }

            // Update connectionStatus to CONNECTED so the dashboard shows
            // ONLINE instead of a stale ERROR from a previous crash/restart.
            try {
                const { setBotConnectionStatus } = require('./allfunc/bot-lifecycle');
                const cleanForDb = nexusDevNumber.replace(/[^0-9]/g, '');
                setBotConnectionStatus(cleanForDb, 'CONNECTED', {
                    lastErrorMessage: null,
                    reconnectAttempts: 0,
                }).catch(() => {});
            } catch (_) {}

            // Write connected flag so web panel can auto-save the number
            try {
                const cleanNum = nexusDevNumber.replace(/[^0-9]/g, '');
                const flagDir  = path.join(process.cwd(), 'nexstore', 'pairing', cleanNum);
                if (!fs.existsSync(flagDir)) fs.mkdirSync(flagDir, { recursive: true });
                fs.writeFileSync(path.join(flagDir, 'connected.flag'), JSON.stringify({ connected: true, number: cleanNum, ts: Date.now() }));
            } catch (_) {}

            // ✅ AUTO-DETECT: Emit global event so bot.js knows user is connected
            global.pairEmitter.emit('connected', nexusDevNumber);

            // Send a connected confirmation message to the linked number
            // ✅ FIX (persistent): disk flag check — server restart ke baad bhi ek baar hi bhejo
            const _cleanWelcome = nexusDevNumber.replace(/[^0-9]/g, '');
            const _welcomeFlagPath = path.join(process.cwd(), 'nexstore', 'pairing', _cleanWelcome, 'welcomed.flag');
            const _alreadyWelcomed = fs.existsSync(_welcomeFlagPath) || tracker.welcomeSent;

            if (!_alreadyWelcomed) {
                tracker.welcomeSent = true;
                try {
                    const userJid = nexusDevNumber.includes('@') ? nexusDevNumber : nexusDevNumber + '@s.whatsapp.net';
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
                    // ✅ Disk pe flag likho — server restart ke baad bhi dobara nahi bhejega
                    try { fs.writeFileSync(_welcomeFlagPath, JSON.stringify({ ts: Date.now(), number: _cleanWelcome })); } catch (_) {}
                    console.log(chalk.green(`📨 Connected message sent to ${nexusDevNumber}`));
                } catch (msgErr) {
                    console.log(chalk.yellow(`⚠️ Could not send connected message: ${msgErr.message}`));
                    tracker.welcomeSent = false; // retry next time agar message fail hua
                }
            } else {
                console.log(chalk.gray(`[${nexusDevNumber}] ℹ️  Reconnected — welcome message already sent (flag exists), skipping.`));
            }

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
        } else if (connection === "connecting") {
            console.log(chalk.blue(`🔄 Connecting ${nexusDevNumber}...`));
        }
    });

    nexus.ev.on('creds.update', saveCreds);
    
    // ✅ IMPROVED 24/7 WATCHDOG — stored in tracker so it can be cleared on reconnect
    tracker.healthCheckInterval = setInterval(async () => {
        if (tracker.disconnected) {
            clearInterval(tracker.healthCheckInterval);
            tracker.healthCheckInterval = null;
            return;
        }
        
        tracker.lastActivity = Date.now();
        
        const wsState = nexus.ws?.readyState;
        if (wsState === 1) {
            // WebSocket open — keep alive
            nexus.sendPresenceUpdate('available').catch(() => {});
            // ✅ BUG FIX (Bug 11): Watchdog mein touchBotHeartbeat call karo
            // Warna agar chat quiet hai (koi message nahi) to lastActive update nahi hota
            // aur website per "BOT OFFLINE" dikhta rehta hai. Watchdog har 30s pe chalta hai;
            // touchBotHeartbeat ka DB throttle 60s hai to effective DB update = har 60s.
            try {
                const { touchBotHeartbeat } = require('./allfunc/bot-heartbeat');
                const cleanForDb = nexusDevNumber.replace(/[^0-9]/g, '');
                touchBotHeartbeat(cleanForDb, { event: 'watchdog', wsState: 1, ready: true });
            } catch (_) {}
            // ✅ TRIAL/BAN ENFORCEMENT — catches idle bots too (no incoming
            // messages to trigger the per-message guard). Runs every 30s so an
            // expired/banned number is force-disconnected even in silent chats.
            try {
                const { enforceSubscriptionOrDisconnect } = require('./allfunc/subscription-guard');
                const cleanForSub = nexusDevNumber.replace(/[^0-9]/g, '');
                enforceSubscriptionOrDisconnect(cleanForSub).catch(() => {});
            } catch (_) {}
        } else if (wsState !== undefined && wsState !== 0) {
            // Not connecting and not open — dead connection, force reconnect
            console.log(chalk.red(`💀 [${nexusDevNumber}] Dead WebSocket (state=${wsState}). Force reconnecting...`));
            clearInterval(tracker.healthCheckInterval);
            tracker.healthCheckInterval = null;
            try { nexus.ws?.close(); } catch (_) {}
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
        // Normalize self-chat/device JIDs before every command and reply.
        // WhatsApp may deliver the chat as number:device@s.whatsapp.net;
        // sending to that raw JID silently drops messages in Message yourself.
        const _rawJid = m.key.remoteJid || '';
        m.chat = /:\d+@/.test(_rawJid)
            ? _rawJid.replace(/:\d+@/, '@')
            : _rawJid;
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