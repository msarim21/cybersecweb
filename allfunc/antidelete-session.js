'use strict';

/**
 * Anti-Delete session isolation layer
 * ───────────────────────────────────
 * Each connected WhatsApp bot number gets its OWN:
 *   • in-memory message cache (Map)
 *   • disk persistence file (database/antidelete_store_<botNum>.json)
 *   • media prefetch directory (tmp/antidelete_media/<botNum>/)
 *   • debounced disk-save timer
 *
 * NEVER use a global shared Map or bare msgId keys — that caused cross-session
 * overwrites when multiple bots run on the same worker dyno.
 */

const fs = require('fs');
const path = require('path');
const {
    ANTIDELETE_MAX_ENTRIES,
    ANTIDELETE_RETENTION_MS,
    getRetentionCutoffTs,
    isEntryExpired,
} = require('./antidelete-retention');
const LEGACY_DISK_STORE = './database/antidelete_store.json';
const DISK_DEBOUNCE_MS = 550;

function cleanBotNum(value) {
    const raw = String(value || '');
    if (!raw) return '';
    // WhatsApp JIDs include device suffix (e.g. 92300:12@s.whatsapp.net) — strip before digit extraction
    if (raw.includes('@') || raw.includes(':')) {
        return raw.split(':')[0].split('@')[0].replace(/[^0-9]/g, '');
    }
    return raw.replace(/[^0-9]/g, '');
}

class AntideleteSessionStore {
    constructor(botNum) {
        this.botNum = cleanBotNum(botNum);
        if (!this.botNum) throw new Error('AntideleteSessionStore requires botNum');
        /** @type {Map<string, object>} chatId::msgId → entry */
        this.memory = new Map();
        /** msgId → primary chatId (fallback when JID format differs, e.g. @lid vs @s.whatsapp.net) */
        this.msgIdIndex = new Map();
        let diskPath = path.join('database', `antidelete_store_${this.botNum}.json`);
        try {
            const { isBotIsolated, getBotConfigPaths } = require('./bot-workspace');
            if (isBotIsolated()) {
                const isolated = getBotConfigPaths(this.botNum);
                if (isolated?.antideleteStore) diskPath = isolated.antideleteStore;
            }
        } catch (_) {}
        this.diskPath = diskPath;
        this.mediaDir = path.join('tmp', 'antidelete_media', this.botNum);
        this._diskTimer = null;
        this._loaded = false;
        this._diskMtimeMs = 0;
    }

    /** Session-local key — unique within this bot only */
    cacheKey(chatId, msgId) {
        return `${chatId}::${msgId}`;
    }

    /** Mongo / cross-process key — globally unique */
    mongoKey(chatId, msgId) {
        return `${this.botNum}::${this.cacheKey(chatId, msgId)}`;
    }

    ensureDirs() {
        if (!fs.existsSync('database')) fs.mkdirSync('database', { recursive: true });
        if (!fs.existsSync(this.mediaDir)) fs.mkdirSync(this.mediaDir, { recursive: true });
    }

    /**
     * Re-read disk ONLY if the file changed since last read (mtime check).
     * Antidelete delete-handling calls this repeatedly in a retry loop; without
     * the mtime guard each call did a full sync readFileSync + JSON.parse of a
     * store that can be many MB (inline media base64) → event-loop stalls that
     * slowed every command. The guard makes repeat refreshes near-free.
     */
    refreshFromDisk() {
        try {
            const st = fs.statSync(this.diskPath);
            if (this._loaded && st.mtimeMs === this._diskMtimeMs) return;
        } catch (_) {
            if (this._loaded) return; // file missing — keep RAM cache
        }
        this._loaded = false;
        this.loadFromDisk();
    }

    loadFromDisk() {
        if (this._loaded) return;
        this._loaded = true;
        this.ensureDirs();
        try {
            if (!fs.existsSync(this.diskPath)) return;
            try { this._diskMtimeMs = fs.statSync(this.diskPath).mtimeMs; } catch (_) {}
            const entries = JSON.parse(fs.readFileSync(this.diskPath, 'utf-8'));
            if (!Array.isArray(entries)) return;
            const now = Date.now();
            for (const [key, val] of entries) {
                if (isEntryExpired(val, now)) continue;
                if (!val._ts) val._ts = val.timestamp ? new Date(val.timestamp).getTime() : now;
                this.memory.set(key, val);
            }
        } catch (_) {}
    }

    get(chatId, msgId) {
        this.loadFromDisk();
        return this.memory.get(this.cacheKey(chatId, msgId)) || null;
    }

    set(chatId, msgId, entry, aliasChatIds = []) {
        this.loadFromDisk();
        this.memory.set(this.cacheKey(chatId, msgId), entry);
        this.msgIdIndex.set(String(msgId), String(chatId));
        for (const alt of aliasChatIds) {
            if (!alt || alt === chatId) continue;
            this.memory.set(this.cacheKey(alt, msgId), entry);
        }
        // Keep RAM bounded — trim oldest when over limit
        if (this.memory.size > ANTIDELETE_MAX_ENTRIES * 1.5) {
            const sorted = [...this.memory.entries()]
                .sort((a, b) => (a[1]?._ts || 0) - (b[1]?._ts || 0));
            const drop = sorted.slice(0, Math.floor(ANTIDELETE_MAX_ENTRIES * 0.25));
            for (const [k, v] of drop) {
                this.memory.delete(k);
                const mid = k.split('::').slice(1).join('::');
                if (mid && this.msgIdIndex.get(mid) === k.split('::')[0]) {
                    this.msgIdIndex.delete(mid);
                }
                void v;
            }
        }
    }

    delete(chatId, msgId) {
        const key = this.cacheKey(chatId, msgId);
        this.memory.delete(key);
        if (this.msgIdIndex.get(String(msgId)) === String(chatId)) {
            this.msgIdIndex.delete(String(msgId));
        }
        // Remove alias keys for same msgId
        for (const [k] of this.memory) {
            if (k.endsWith(`::${msgId}`)) this.memory.delete(k);
        }
    }

    findByMsgId(msgId) {
        this.loadFromDisk();
        const primaryChat = this.msgIdIndex.get(String(msgId));
        if (primaryChat) {
            const hit = this.memory.get(this.cacheKey(primaryChat, msgId));
            if (hit) return { chatId: primaryChat, entry: hit };
        }
        for (const [k, v] of this.memory) {
            if (k.endsWith(`::${msgId}`)) {
                const chatId = k.slice(0, -(String(msgId).length + 2));
                return { chatId, entry: v };
            }
        }
        return null;
    }

    readDiskEntry(chatId, msgId) {
        try {
            if (!fs.existsSync(this.diskPath)) return null;
            const key = this.cacheKey(chatId, msgId);
            const entries = JSON.parse(fs.readFileSync(this.diskPath, 'utf-8'));
            if (!Array.isArray(entries)) return null;
            const found = entries.find(([k]) => k === key);
            return found ? found[1] : null;
        } catch (_) { return null; }
    }

    scheduleDiskSave() {
        if (this._diskTimer) return;
        this._diskTimer = setTimeout(() => {
            this._diskTimer = null;
            this.saveDiskNow();
        }, DISK_DEBOUNCE_MS);
    }

    saveDiskNow() {
        if (this._diskTimer) {
            clearTimeout(this._diskTimer);
            this._diskTimer = null;
        }
        try {
            this.ensureDirs();
            const entries = [];
            const B64_MAX = 8 * 1024 * 1024;
            for (const [key, val] of this.memory.entries()) {
                const row = {
                    content: val?.content || '',
                    rawMediaMsg: val?.rawMediaMsg || null,
                    mediaType: val?.mediaType || '',
                    mediaPath: val?.mediaPath || '',
                    mediaBufferB64: val?.mediaBufferB64 || null,
                    extraPayload: val?.extraPayload || null,
                    msgKind: val?.msgKind || '',
                    isPtt: Boolean(val?.isPtt),
                    fromMe: Boolean(val?.fromMe),
                    sender: val?.sender || '',
                    group: val?.group || null,
                    timestamp: val?.timestamp || new Date().toISOString(),
                    _ts: val?._ts || Date.now(),
                    botNum: val?.botNum || this.botNum,
                };
                if (row.mediaBufferB64 && row.mediaBufferB64.length > B64_MAX * 1.4) {
                    delete row.mediaBufferB64;
                }
                entries.push([key, row]);
            }
            fs.writeFileSync(this.diskPath, JSON.stringify(entries.slice(-ANTIDELETE_MAX_ENTRIES)), 'utf-8');
            try { this._diskMtimeMs = fs.statSync(this.diskPath).mtimeMs; } catch (_) {}
        } catch (_) {}
    }

    mediaFilePath(msgId, ext) {
        this.ensureDirs();
        return path.join(this.mediaDir, `${msgId}.${ext}`);
    }

    sweep(cutoffTs) {
        for (const [k, v] of this.memory) {
            if (v?._ts && v._ts < cutoffTs) this.memory.delete(k);
        }
    }

    sweepMediaFiles(cutoffTs) {
        try {
            if (!fs.existsSync(this.mediaDir)) return;
            for (const name of fs.readdirSync(this.mediaDir)) {
                const p = path.join(this.mediaDir, name);
                try {
                    const st = fs.statSync(p);
                    if (st.isFile() && st.mtimeMs < cutoffTs) fs.unlinkSync(p);
                } catch (_) {}
            }
        } catch (_) {}
    }
}

/** botNum → AntideleteSessionStore */
function getAntideleteSession(botNum) {
    const clean = cleanBotNum(botNum);
    if (!clean) return null;
    if (!global._antideleteSessions) global._antideleteSessions = new Map();
    if (!global._antideleteSessions.has(clean)) {
        global._antideleteSessions.set(clean, new AntideleteSessionStore(clean));
    }
    return global._antideleteSessions.get(clean);
}

/** One-time migration from legacy monolithic antidelete_store.json */
function migrateLegacyAntideleteStore() {
    if (global._antideleteLegacyMigrated) return;
    global._antideleteLegacyMigrated = true;
    try {
        if (!fs.existsSync(LEGACY_DISK_STORE)) return;
        const entries = JSON.parse(fs.readFileSync(LEGACY_DISK_STORE, 'utf-8'));
        if (!Array.isArray(entries)) return;
        let moved = 0;
        for (const [key, val] of entries) {
            // Legacy keys: botNum::chatId::msgId OR chatId::msgId OR bare msgId
            const parts = String(key).split('::');
            let botNum = '';
            let chatId = '';
            let msgId = '';
            if (parts.length >= 3 && /^\d+$/.test(parts[0])) {
                botNum = parts[0];
                chatId = parts[1];
                msgId = parts.slice(2).join('::');
            } else if (parts.length === 2) {
                chatId = parts[0];
                msgId = parts[1];
            } else {
                continue; // bare msgId — cannot attribute safely, skip
            }
            if (!chatId || !msgId) continue;
            const session = botNum ? getAntideleteSession(botNum) : null;
            if (!session) continue;
            if (!session.memory.has(session.cacheKey(chatId, msgId))) {
                session.set(chatId, msgId, val);
                moved++;
            }
        }
        if (moved > 0) {
            for (const s of global._antideleteSessions.values()) s.saveDiskNow();
            console.log(`[ANTIDELETE] Migrated ${moved} legacy cache entries into per-session stores`);
        }
    } catch (e) {
        console.error('[ANTIDELETE] Legacy migration error:', e.message);
    }
}

// Per-session sweep (replaces global _antideleteStore sweep)
if (!global._antideleteSessionSweepStarted) {
    global._antideleteSessionSweepStarted = true;
    setInterval(() => {
        const cutoff = getRetentionCutoffTs();
        for (const session of (global._antideleteSessions?.values() || [])) {
            session.sweep(cutoff);
            session.sweepMediaFiles(cutoff);
        }
    }, 30 * 60 * 1000);
}

// Media temp sweep on boot + every 6h (per-bot dirs)
if (!global._antideleteMediaSweepStarted) {
    global._antideleteMediaSweepStarted = true;
    const _sweepAllMedia = () => {
        const cutoff = getRetentionCutoffTs();
        for (const session of (global._antideleteSessions?.values() || [])) {
            session.sweepMediaFiles(cutoff);
        }
    };
    setTimeout(_sweepAllMedia, 90 * 1000);
    setInterval(_sweepAllMedia, 6 * 60 * 60 * 1000);
}

migrateLegacyAntideleteStore();

if (!global._antideleteRetentionLogged) {
    global._antideleteRetentionLogged = true;
    const days = ANTIDELETE_RETENTION_MS / (24 * 60 * 60 * 1000);
    const retentionLabel = days === 1 ? '24h' : `${Math.round(days)} days`;
    console.log(`[ANTIDELETE] Cache retention: ${retentionLabel} | max ${ANTIDELETE_MAX_ENTRIES} entries per bot`);
}

module.exports = {
    refreshFromDisk: (botNum) => getAntideleteSession(botNum)?.refreshFromDisk(),
    AntideleteSessionStore,
    getAntideleteSession,
    cleanBotNum,
    migrateLegacyAntideleteStore,
    DISK_DEBOUNCE_MS,
    ANTIDELETE_MAX_ENTRIES,
    ANTIDELETE_RETENTION_MS,
};
