const fs = require('fs');
const path = require('path');
const { getAntideleteSession, cleanBotNum } = require('./antidelete-session');
const { ANTIDELETE_RETENTION_MS } = require('./antidelete-retention');

const ANTIDELETE_PENDING_FILE = './database/antidelete_pending.json';
const ANTIDELETE_PENDING_MAX = 500;
const ANTIDELETE_MONGO_TTL_MS = ANTIDELETE_RETENTION_MS;
const ANTIDELETE_MEDIA_B64_MAX = 8 * 1024 * 1024; // 8MB — store inline for reliable recovery
const ANTIDELETE_DELETE_DEDUP_MS = 90 * 1000;

function _adToBuffer(v) {
    if (!v) return null;
    if (Buffer.isBuffer(v)) return v;
    if (typeof v === 'string') {
        try { return Buffer.from(v, 'base64'); } catch (_) { return null; }
    }
    if (v?.type === 'Buffer' && Array.isArray(v.data)) {
        try { return Buffer.from(v.data); } catch (_) { return null; }
    }
    return null;
}

function _adToB64(v) {
    const buf = _adToBuffer(v);
    return buf ? buf.toString('base64') : null;
}

function _adResolveBotNum(sock, hint = '') {
    const fromHint = cleanBotNum(hint);
    if (fromHint) return fromHint;
    const sessionPhone = cleanBotNum(sock?._sessionPhoneNumber || process.env.BOT_NUMBER || '');
    if (sessionPhone) return sessionPhone;
    const cached = String(sock?._cachedBotNumber || '');
    if (cached) return cleanBotNum(cached);
    const rawId = String(sock?.user?.id || sock?.authState?.creds?.me?.id || '');
    if (rawId) return cleanBotNum(rawId);
    return '';
}

function _adChatIdsFromKey(key) {
    const ids = new Set();
    if (key?.remoteJid) ids.add(String(key.remoteJid));
    if (key?.remoteJidAlt) ids.add(String(key.remoteJidAlt));
    if (key?.participant && !String(key.remoteJid || '').endsWith('@g.us')) {
        ids.add(String(key.participant));
    }
    return [...ids].filter(Boolean);
}

function _adExpandChatIds(sock, chatId, altChatIds = []) {
    const ids = new Set([chatId, ...altChatIds].filter(Boolean));
    const botPhone = _adResolveBotNum(sock);
    if (botPhone) {
        ids.add(`${botPhone}@s.whatsapp.net`);
        ids.add(`${botPhone}@lid`);
    }
    const cached = String(sock?._cachedBotNumber || '');
    if (cached.includes('@')) ids.add(cached);
    const rawUser = String(sock?.user?.id || '');
    if (rawUser.includes('@')) {
        const head = rawUser.split(':')[0];
        const domain = rawUser.split('@').slice(1).join('@') || 's.whatsapp.net';
        ids.add(`${head}@${domain}`);
        if (!domain.includes('lid')) ids.add(`${head}@lid`);
        if (domain !== 's.whatsapp.net') ids.add(`${head}@s.whatsapp.net`);
    }
    return [...ids].filter(Boolean);
}

function _adSanitizeEntryForPersistence(entry) {
    if (!entry) return entry;
    const out = {
        content: entry.content || '',
        rawMediaMsg: entry.rawMediaMsg || null,
        mediaType: entry.mediaType || '',
        mediaPath: entry.mediaPath || '',
        mediaBufferB64: entry.mediaBufferB64 || null,
        extraPayload: entry.extraPayload || null,
        msgKind: entry.msgKind || '',
        isPtt: Boolean(entry.isPtt),
        fromMe: Boolean(entry.fromMe),
        sender: entry.sender || '',
        group: entry.group || null,
        timestamp: entry.timestamp || new Date().toISOString(),
        _ts: entry._ts || Date.now(),
        botNum: entry.botNum || '',
    };
    if (out.mediaBufferB64) {
        const approx = Math.ceil(out.mediaBufferB64.length * 0.75);
        if (approx > ANTIDELETE_MEDIA_B64_MAX) delete out.mediaBufferB64;
    }
    return out;
}

function _adDeleteDedupKey(botNum, chatId, msgId) {
    return `${cleanBotNum(botNum)}::${chatId}::${msgId}`;
}

function _adCheckDeleteProcessed(botNum, chatId, msgId) {
    if (!global._adDeleteDedup) return false;
    const prev = global._adDeleteDedup.get(_adDeleteDedupKey(botNum, chatId, msgId));
    return Boolean(prev && Date.now() - prev < ANTIDELETE_DELETE_DEDUP_MS);
}

function _adMarkDeleteProcessed(botNum, chatId, msgId) {
    if (!global._adDeleteDedup) global._adDeleteDedup = new Map();
    const k = _adDeleteDedupKey(botNum, chatId, msgId);
    const now = Date.now();
    global._adDeleteDedup.set(k, now);
    if (global._adDeleteDedup.size > 8000) {
        for (const [dk, ts] of global._adDeleteDedup) {
            if (now - ts > ANTIDELETE_DELETE_DEDUP_MS) global._adDeleteDedup.delete(dk);
        }
    }
}

function loadAntideleteCfg(botNum) {
    const clean = cleanBotNum(botNum);
    if (!global._antideleteConfigs) global._antideleteConfigs = {};
    if (clean && global._antideleteConfigs[clean]) return global._antideleteConfigs[clean];
    const paths = clean
        ? [`./database/antidelete_config_${clean}.json`, './database/antidelete_config.json']
        : ['./database/antidelete_config.json'];
    for (const p of paths) {
        try {
            if (fs.existsSync(p)) {
                const d = JSON.parse(fs.readFileSync(p, 'utf-8'));
                const result = d.mode ? d : (d.enabled === true ? { mode: 'private', enabled: true } : { mode: 'off' });
                if (clean) global._antideleteConfigs[clean] = result;
                return result;
            }
        } catch (_) {}
    }
    const _default = { mode: 'private', enabled: true };
    if (clean) global._antideleteConfigs[clean] = _default;
    return _default;
}

function _adEnsureDbDir() {
    if (!fs.existsSync('./database')) fs.mkdirSync('./database', { recursive: true });
}

function unwrapWaMessage(msg) {
    if (!msg || typeof msg !== 'object') return {};
    if (msg.ephemeralMessage?.message) return unwrapWaMessage(msg.ephemeralMessage.message);
    if (msg.viewOnceMessage?.message) return unwrapWaMessage(msg.viewOnceMessage.message);
    if (msg.viewOnceMessageV2?.message) return unwrapWaMessage(msg.viewOnceMessageV2.message);
    if (msg.viewOnceMessageV2Extension?.message) return unwrapWaMessage(msg.viewOnceMessageV2Extension.message);
    if (msg.documentWithCaptionMessage?.message) return unwrapWaMessage(msg.documentWithCaptionMessage.message);
    if (msg.buttonsMessage?.message) return unwrapWaMessage(msg.buttonsMessage.message);
    if (msg.editedMessage?.message) return unwrapWaMessage(msg.editedMessage.message);
    if (msg.associatedChildMessage?.message) return unwrapWaMessage(msg.associatedChildMessage.message);
    if (msg.templateMessage?.hydratedTemplate?.hydratedContentText) {
        return { conversation: String(msg.templateMessage.hydratedTemplate.hydratedContentText) };
    }
    if (msg.templateMessage?.hydratedFourRowTemplate?.hydratedContentText) {
        return { conversation: String(msg.templateMessage.hydratedFourRowTemplate.hydratedContentText) };
    }
    if (msg.templateMessage?.fourRowTemplate?.content?.text) {
        return { conversation: String(msg.templateMessage.fourRowTemplate.content.text) };
    }
    return msg;
}

function _adIsViewOnce(rawMessage, unwrapped) {
    return Boolean(
        rawMessage?.viewOnceMessage ||
        rawMessage?.viewOnceMessageV2 ||
        rawMessage?.viewOnceMessageV2Extension ||
        unwrapped?.imageMessage?.viewOnce ||
        unwrapped?.videoMessage?.viewOnce ||
        unwrapped?.audioMessage?.viewOnce
    );
}

function _adExtractContent(rawMessage, unwrapped) {
    const m = unwrapped || {};
    const vo = _adIsViewOnce(rawMessage, m);
    const prefix = vo ? '🔒 View Once — ' : '';

    let text = m.conversation
        || m.extendedTextMessage?.text
        || m.imageMessage?.caption
        || m.videoMessage?.caption
        || m.documentMessage?.caption
        || m.audioMessage?.caption
        || '';

    const poll = m.pollCreationMessage || m.pollCreationMessageV2 || m.pollCreationMessageV3;
    if (poll) {
        const opts = (poll.options || [])
            .map((o, i) => `  ${i + 1}. ${o.optionName || o.name || 'Option'}`)
            .join('\n');
        return `${prefix}📊 Poll: ${poll.name || 'Untitled'}${opts ? `\n${opts}` : ''}`;
    }

    const loc = m.locationMessage || m.liveLocationMessage;
    if (loc) {
        const live = m.liveLocationMessage ? ' (live)' : '';
        const label = loc.name || loc.address || '';
        return `${prefix}📍 Location${live}${label ? `: ${label}` : ''}\nhttps://maps.google.com/?q=${loc.degreesLatitude},${loc.degreesLongitude}`;
    }

    if (m.contactMessage) {
        return `${prefix}👤 Contact: ${m.contactMessage.displayName || 'Unknown'}`;
    }
    if (m.contactsArrayMessage) {
        const names = (m.contactsArrayMessage.contacts || [])
            .map((c) => c.displayName).filter(Boolean).join(', ');
        return `${prefix}👥 Contacts: ${names || 'Multiple contacts'}`;
    }

    if (m.reactionMessage) {
        return `${m.reactionMessage.text || '❤️'} (reaction)`;
    }

    if (m.buttonsResponseMessage) {
        return `🔘 Button: ${m.buttonsResponseMessage.selectedDisplayText || m.buttonsResponseMessage.selectedButtonId || ''}`;
    }
    if (m.listResponseMessage) {
        return `📋 List: ${m.listResponseMessage.title || m.listResponseMessage.singleSelectReply?.selectedRowId || ''}`;
    }
    if (m.templateButtonReplyMessage) {
        return `🔘 Template: ${m.templateButtonReplyMessage.selectedDisplayText || m.templateButtonReplyMessage.selectedId || ''}`;
    }

    if (m.groupInviteMessage) {
        return `${prefix}🔗 Group invite: ${m.groupInviteMessage.groupName || m.groupInviteMessage.groupJid || 'Unknown'}`;
    }

    if (m.productMessage) {
        const title = m.productMessage.product?.title || m.productMessage.title || 'Product';
        return `${prefix}🛒 Product: ${title}`;
    }
    if (m.orderMessage) {
        return `${prefix}📦 Order: ${m.orderMessage.orderTitle || m.orderMessage.itemCount || 'Order'}`;
    }

    if (m.interactiveMessage) {
        const body = m.interactiveMessage.body?.text
            || m.interactiveMessage.header?.title
            || m.interactiveMessage.nativeFlowMessage?.buttons?.[0]?.name
            || '';
        return `${prefix}💬 Interactive${body ? `: ${body}` : ''}`;
    }
    if (m.listMessage) {
        return `${prefix}📋 List: ${m.listMessage.title || m.listMessage.description || 'Menu'}`;
    }
    if (m.buttonsMessage) {
        return `${prefix}🔘 Buttons: ${m.buttonsMessage.contentText || m.buttonsMessage.text || 'Options'}`;
    }

    if (m.eventMessage) {
        return `${prefix}📅 Event: ${m.eventMessage.name || 'Event'}`;
    }

    if (text) return vo ? `${prefix}${text}` : text;

    const known = Object.keys(m).filter((k) => k !== 'messageContextInfo' && k.endsWith('Message'));
    if (known.length) {
        return `${prefix}[${known[0].replace(/Message$/, '')}]`;
    }
    return '';
}

function _adBuildExtraPayload(unwrapped) {
    const m = unwrapped || {};
    const loc = m.locationMessage || m.liveLocationMessage;
    if (loc) {
        return {
            type: 'location',
            latitude: loc.degreesLatitude,
            longitude: loc.degreesLongitude,
            name: loc.name || loc.address || '',
            isLive: Boolean(m.liveLocationMessage),
        };
    }
    if (m.contactMessage?.vcard) {
        return {
            type: 'contact',
            displayName: m.contactMessage.displayName || 'Contact',
            vcard: m.contactMessage.vcard,
        };
    }
    if (m.groupInviteMessage) {
        return {
            type: 'groupInvite',
            groupJid: m.groupInviteMessage.groupJid || '',
            groupName: m.groupInviteMessage.groupName || '',
            caption: m.groupInviteMessage.caption || '',
        };
    }
    return null;
}

function _adExtractText(msg) {
    return _adExtractContent(null, unwrapWaMessage(msg));
}

function _adMediaTypeFromMsg(msg) {
    const m = unwrapWaMessage(msg);
    if (!m) return '';
    if (m.imageMessage) return 'image';
    if (m.videoMessage) return m.videoMessage.ptv ? 'ptv' : 'video';
    if (m.audioMessage) return 'audio';
    if (m.stickerMessage || m.lottieStickerMessage) return 'sticker';
    if (m.documentMessage) return 'document';
    return '';
}

const _adMongoSaveQueue = new Map();
let _adMongoFlushTimer = null;

async function _adEnsureMongoReady() {
    const { isMongoMode, isDbReady, initDb } = require('../server/db');
    if (!isMongoMode()) return false;
    if (!isDbReady()) await initDb().catch(() => {});
    return isDbReady();
}

async function _adFlushMongoSavesNow() {
    if (_adMongoFlushTimer) {
        clearTimeout(_adMongoFlushTimer);
        _adMongoFlushTimer = null;
    }
    await _adFlushMongoSaves();
}

async function _adFlushMongoSaves() {
    _adMongoFlushTimer = null;
    if (!(await _adEnsureMongoReady())) return;
    const batch = [..._adMongoSaveQueue.values()];
    _adMongoSaveQueue.clear();
    if (!batch.length) return;
    try {
        const AntideleteCache = require('../server/models/AntideleteCache');
        const ops = batch.map(({ botNum, chatId, msgId, entry, key }) =>
            AntideleteCache.findOneAndUpdate(
                { botNum, chatId, msgId },
                {
                    key,
                    botNum,
                    chatId: String(chatId || ''),
                    msgId: String(msgId || ''),
                    data: _adSanitizeEntryForPersistence(entry),
                    expiresAt: new Date(Date.now() + ANTIDELETE_MONGO_TTL_MS),
                },
                { upsert: true }
            )
        );
        await Promise.allSettled(ops);
    } catch (_) {}
}

function _adScheduleMongoFlush() {
    if (_adMongoFlushTimer) return;
    _adMongoFlushTimer = setTimeout(() => {
        _adFlushMongoSaves().catch(() => {});
    }, 2500);
}

async function _adMongoGet(botNum, chatId, msgId) {
    try {
        if (!(await _adEnsureMongoReady())) return null;
        const AntideleteCache = require('../server/models/AntideleteCache');
        const clean = cleanBotNum(botNum);
        let doc = await AntideleteCache.findOne({ botNum: clean, chatId, msgId }).lean();
        if (!doc?.data && msgId) {
            doc = await AntideleteCache.findOne({ botNum: clean, msgId }).sort({ updatedAt: -1 }).lean();
        }
        return doc?.data || null;
    } catch (_) { return null; }
}

function _adMongoSave(botNum, chatId, msgId, entry) {
    const clean = cleanBotNum(botNum);
    if (!clean) return;
    const session = getAntideleteSession(clean);
    const key = session ? session.mongoKey(chatId, msgId) : `${clean}::${chatId}::${msgId}`;
    _adMongoSaveQueue.set(key, { botNum: clean, chatId, msgId, entry, key });
    _adScheduleMongoFlush();
}

function _adMongoDelete(botNum, chatId, msgId) {
    const clean = cleanBotNum(botNum);
    if (!clean) return;
    const session = getAntideleteSession(clean);
    const key = session ? session.mongoKey(chatId, msgId) : `${clean}::${chatId}::${msgId}`;
    _adMongoSaveQueue.delete(key);
    setImmediate(async () => {
        try {
            if (!(await _adEnsureMongoReady())) return;
            const AntideleteCache = require('../server/models/AntideleteCache');
            await AntideleteCache.deleteOne({ botNum: clean, chatId, msgId });
        } catch (_) {}
    });
}

function _adPrefetchMedia(botNum, chatId, msgId, mediaContent, mtype, session) {
    if (!mediaContent || !mtype || !msgId || !session || !chatId) return;
    const ext = mtype === 'video' ? 'mp4'
        : mtype === 'audio' ? 'ogg'
        : mtype === 'sticker' ? 'webp'
        : mtype === 'document' ? 'bin'
        : 'jpg';
    const filePath = session.mediaFilePath(msgId, ext);
    const prefetchKey = `${botNum}::${msgId}`;
    if (!global._adPrefetchPromises) global._adPrefetchPromises = new Map();

    const job = (async () => {
        try {
            // ✅ FIX: skip download when mediaKey is empty — prevents 'Cannot derive from empty media key' log spam
            if (!mediaContent.mediaKey && !mediaContent.url && !mediaContent.directPath) return;
            const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
            const stream = await downloadContentFromMessage(mediaContent, mtype);
            const chunks = [];
            for await (const ch of stream) chunks.push(ch);
            const buf = Buffer.concat(chunks);
            if (!buf.length) return;
            await fs.promises.writeFile(filePath, buf);
            const ex = session.get(chatId, msgId) || session.findByMsgId(msgId)?.entry;
            if (ex) {
                ex.mediaPath = filePath;
                if (buf.length <= ANTIDELETE_MEDIA_B64_MAX) {
                    ex.mediaBufferB64 = buf.toString('base64');
                }
                const primaryChat = session.msgIdIndex.get(String(msgId)) || chatId;
                session.set(primaryChat, msgId, ex);
                _adMongoSave(botNum, primaryChat, msgId, ex);
            }
            session.saveDiskNow();
        } catch (e) {
            console.error(`[ANTIDELETE][${botNum}] prefetch ${mtype}:`, e.message);
        }
    })();

    global._adPrefetchPromises.set(prefetchKey, job);
    job.finally(() => {
        setTimeout(() => global._adPrefetchPromises?.delete(prefetchKey), 60_000);
    });
}

function _adApplyMediaCache(botNum, chatId, msgId, unwrapped, session, state) {
    const m = unwrapped || {};
    const sticker = m.stickerMessage || m.lottieStickerMessage;

    if (m.audioMessage) {
        state.content = state.content || (m.audioMessage.ptt ? '🎤 Voice Note' : '🎵 Audio');
        state.mediaType = 'audio';
        state.isPtt = Boolean(m.audioMessage.ptt);
        state.mediaPath = state.mediaPath || '__redownload__';
        _adPrefetchMedia(botNum, chatId, msgId, m.audioMessage, 'audio', session);
    } else if (m.videoMessage) {
        state.mediaType = m.videoMessage.ptv ? 'ptv' : 'video';
        state.isPtt = Boolean(m.videoMessage.ptv);
        state.mediaPath = state.mediaPath || '__redownload__';
        _adPrefetchMedia(botNum, chatId, msgId, m.videoMessage, 'video', session);
    } else if (m.imageMessage) {
        state.mediaType = 'image';
        state.mediaPath = state.mediaPath || '__redownload__';
        _adPrefetchMedia(botNum, chatId, msgId, m.imageMessage, 'image', session);
    } else if (sticker) {
        state.content = state.content || '🎭 Sticker';
        state.mediaType = 'sticker';
        state.mediaPath = state.mediaPath || '__redownload__';
        _adPrefetchMedia(botNum, chatId, msgId, sticker, 'sticker', session);
    } else if (m.documentMessage) {
        const docName = m.documentMessage.fileName || m.documentMessage.title || 'File';
        state.content = state.content || `📄 Document: ${docName}`;
        state.mediaType = 'document';
        state.mediaPath = state.mediaPath || '__redownload__';
        _adPrefetchMedia(botNum, chatId, msgId, m.documentMessage, 'document', session);
    }
}

/**
 * Cache a message inside THIS bot session only.
 * Never writes to a global shared Map.
 */
function cacheMessageForAntidelete(rawMsg, sock) {
    try {
        if (!rawMsg?.key?.id || !rawMsg?.key?.remoteJid) return;
        if (rawMsg.message?.protocolMessage) return;

        const chatId = rawMsg.key.remoteJid;
        const msgId = rawMsg.key.id;
        const aliasChatIds = _adChatIdsFromKey(rawMsg.key).filter((id) => id !== chatId);
        const botNum = _adResolveBotNum(sock);
        if (!botNum) return;

        const session = getAntideleteSession(botNum);
        if (!session) return;

        const rawMessage = rawMsg.message || {};
        const unwrapped = unwrapWaMessage(rawMessage);
        const sender = rawMsg.key.participant || rawMsg.key.remoteJid;
        const existing = session.get(chatId, msgId);

        const state = {
            content: _adExtractContent(rawMessage, unwrapped) || existing?.content || '',
            mediaType: _adMediaTypeFromMsg(unwrapped) || existing?.mediaType || '',
            mediaPath: existing?.mediaPath || '',
            mediaBufferB64: existing?.mediaBufferB64 || null,
            isPtt: existing?.isPtt || false,
        };

        _adApplyMediaCache(botNum, chatId, msgId, unwrapped, session, state);

        const rawMediaMsg = _serializeRawMedia(unwrapped) || existing?.rawMediaMsg || null;
        const extraPayload = _adBuildExtraPayload(unwrapped) || existing?.extraPayload || null;
        const msgKind = Object.keys(unwrapped).find((k) => k.endsWith('Message') && k !== 'messageContextInfo') || existing?.msgKind || '';

        const entry = {
            content: state.content,
            rawMediaMsg,
            mediaType: state.mediaType,
            mediaPath: state.mediaPath,
            mediaBufferB64: state.mediaBufferB64,
            extraPayload,
            msgKind,
            isPtt: Boolean(state.isPtt),
            fromMe: Boolean(rawMsg.key.fromMe),
            sender,
            group: chatId.endsWith('@g.us') ? chatId : null,
            timestamp: new Date().toISOString(),
            _ts: Date.now(),
            botNum,
        };

        session.set(chatId, msgId, entry, aliasChatIds);
        _adMongoSave(botNum, chatId, msgId, entry);
        session.scheduleDiskSave();
    } catch (e) {
        console.error('[ANTIDELETE] cache error:', e.message);
    }
}

function _adEntryFromLoadedMessage(loaded, chatId) {
    const msg = unwrapWaMessage(loaded?.message || {});
    return {
        content: _adExtractText(msg),
        rawMediaMsg: _serializeRawMedia(msg),
        mediaType: _adMediaTypeFromMsg(msg),
        mediaPath: '',
        mediaBufferB64: null,
        fromMe: Boolean(loaded?.key?.fromMe),
        sender: loaded?.key?.participant || chatId,
        timestamp: new Date().toISOString(),
        _ts: Date.now(),
    };
}

async function _adLookupCachedMessage(sock, botNum, chatId, msgId, altChatIds = []) {
    const clean = _adResolveBotNum(sock, botNum);
    if (!clean || !msgId) return null;

    const tryIds = _adExpandChatIds(sock, chatId, altChatIds);

    const _adScanSession = (session) => {
        if (!session) return null;
        const byId = session.findByMsgId(msgId);
        if (byId?.entry) return byId.entry;
        for (const cid of tryIds) {
            const mem = session.get(cid, msgId);
            if (mem) return mem;
        }
        for (const cid of tryIds) {
            const disk = session.readDiskEntry(cid, msgId);
            if (disk) {
                session.set(cid, msgId, disk);
                return disk;
            }
        }
        return null;
    };

    const session = getAntideleteSession(clean);
    let hit = _adScanSession(session);
    if (hit) return hit;

    // Pre-fix caches used full digit strip on user.id (device suffix included)
    const legacyKey = String(sock?.user?.id || '').replace(/[^0-9]/g, '');
    if (legacyKey && legacyKey !== clean) {
        hit = _adScanSession(getAntideleteSession(legacyKey));
        if (hit) return hit;
    }

    for (const cid of tryIds) {
        const mongo = await _adMongoGet(clean, cid, msgId);
        if (mongo) {
            session?.set(cid, msgId, mongo);
            return mongo;
        }
    }

    const store = sock?._baileysMsgStore;
    for (const cid of tryIds) {
        if (store?.loadMessage) {
            try {
                const loaded = await store.loadMessage(cid, msgId);
                if (loaded?.message) return _adEntryFromLoadedMessage(loaded, cid);
            } catch (_) {}
        }
        if (sock?.loadMessage) {
            try {
                const loaded = await sock.loadMessage(cid, msgId);
                if (loaded?.message) return _adEntryFromLoadedMessage(loaded, cid);
            } catch (_) {}
        }
    }
    return null;
}

function _adRemoveCachedMessage(botNum, chatId, msgId) {
    const clean = cleanBotNum(botNum);
    if (!clean) return;
    const session = getAntideleteSession(clean);
    session?.delete(chatId, msgId);
    session?.scheduleDiskSave();
    _adMongoDelete(clean, chatId, msgId);
}

function _adSerializeForPending(mediaOriginal) {
    if (!mediaOriginal) return null;
    return {
        content: mediaOriginal.content,
        mediaType: mediaOriginal.mediaType,
        mediaPath: mediaOriginal.mediaPath,
        mediaBufferB64: mediaOriginal.mediaBufferB64 || null,
        extraPayload: mediaOriginal.extraPayload || null,
        isPtt: mediaOriginal.isPtt,
        rawMediaMsg: mediaOriginal.rawMediaMsg,
        sender: mediaOriginal.sender,
    };
}

function _adQueuePendingReport(botNum, report) {
    try {
        _adEnsureDbDir();
        let pending = [];
        if (fs.existsSync(ANTIDELETE_PENDING_FILE)) {
            try { pending = JSON.parse(fs.readFileSync(ANTIDELETE_PENDING_FILE, 'utf-8')); } catch (_) { pending = []; }
        }
        if (!Array.isArray(pending)) pending = [];
        pending.push({
            id: `${botNum}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            botNum: String(botNum || ''),
            targetJid: report.targetJid,
            text: report.text,
            sender: report.sender || '',
            deletedBy: report.deletedBy || '',
            mediaOriginal: _adSerializeForPending(report.mediaOriginal),
            ts: Date.now(),
            attempts: 0,
        });
        if (pending.length > ANTIDELETE_PENDING_MAX) pending = pending.slice(-ANTIDELETE_PENDING_MAX);
        fs.writeFileSync(ANTIDELETE_PENDING_FILE, JSON.stringify(pending, null, 2));
        console.log(`[ANTIDELETE] Queued offline report for bot ${botNum}`);
    } catch (e) {
        console.error('[ANTIDELETE] pending queue error:', e.message);
    }
}

async function _adDeliverAntideleteReport(sock, { targetJid, text, mediaOriginal, sender, deletedBy, botNum }) {
    if (!sock || !targetJid || !text) return false;
    const mentions = [deletedBy, sender].filter(Boolean);
    try {
        await sock.sendMessage(targetJid, { text, mentions });
        if (mediaOriginal) {
            await _adForwardDeletedMedia(sock, targetJid, mediaOriginal, sender, botNum);
            await _adForwardDeletedExtras(sock, targetJid, mediaOriginal, sender);
        }
        return true;
    } catch (e) {
        console.error(`[ANTIDELETE][${botNum}] deliver failed, queuing:`, e.message);
        if (botNum) {
            _adQueuePendingReport(botNum, { targetJid, text, mediaOriginal, sender, deletedBy });
        }
        return false;
    }
}

async function _adFlushPendingReports(sock, botNum, botJid) {
    if (!sock || !botNum || !fs.existsSync(ANTIDELETE_PENDING_FILE)) return;
    let pending = [];
    try { pending = JSON.parse(fs.readFileSync(ANTIDELETE_PENDING_FILE, 'utf-8')); } catch (_) { return; }
    if (!Array.isArray(pending) || !pending.length) return;

    const clean = cleanBotNum(botNum);
    const mine = pending.filter(p => cleanBotNum(p.botNum) === clean);
    if (!mine.length) return;

    const remaining = pending.filter(p => cleanBotNum(p.botNum) !== clean);
    let flushed = 0;

    for (const item of mine) {
        const target = item.targetJid || botJid;
        if (!target) continue;
        try {
            const mentions = [item.deletedBy, item.sender].filter(Boolean);
            await sock.sendMessage(target, { text: item.text, mentions });
            if (item.mediaOriginal) {
                await _adForwardDeletedMedia(sock, target, item.mediaOriginal, item.sender, clean);
                await _adForwardDeletedExtras(sock, target, item.mediaOriginal, item.sender);
            }
            flushed++;
        } catch (e) {
            item.attempts = (item.attempts || 0) + 1;
            if (item.attempts < 15) remaining.push(item);
        }
    }

    try {
        _adEnsureDbDir();
        fs.writeFileSync(ANTIDELETE_PENDING_FILE, JSON.stringify(remaining.slice(-ANTIDELETE_PENDING_MAX), null, 2));
        if (flushed > 0) console.log(`[ANTIDELETE][${clean}] Flushed ${flushed} pending report(s)`);
    } catch (_) {}
}

function _serializeRawMedia(msg) {
    const m = unwrapWaMessage(msg);
    const _am = m?.audioMessage || null;
    const _vm = m?.videoMessage || null;
    const _im = m?.imageMessage || null;
    const _sm = m?.stickerMessage || m?.lottieStickerMessage || null;
    const _dm = m?.documentMessage || null;
    const _mm = _am || _vm || _im || _sm || _dm;
    const _mtype = _am ? 'audio' : _vm ? (_vm.ptv ? 'ptv' : 'video') : _im ? 'image' : _sm ? 'sticker' : _dm ? 'document' : null;
    if (!_mm || !_mtype) return null;
    try {
        const _buf = (v) => _adToB64(v);
        return {
            type: _mtype,
            url: _mm.url || null,
            directPath: _mm.directPath || null,
            mediaKey: _mm.mediaKey ? _buf(_mm.mediaKey) : null,
            fileEncSha256: _mm.fileEncSha256 ? _buf(_mm.fileEncSha256) : null,
            fileSha256: _mm.fileSha256 ? _buf(_mm.fileSha256) : null,
            mimetype: _mm.mimetype || (_mtype === 'audio' ? 'audio/ogg; codecs=opus' : _mtype === 'sticker' ? 'image/webp' : _mtype === 'image' ? 'image/jpeg' : 'video/mp4'),
            ptt: Boolean(_mm.ptt),
            ptv: Boolean(_mm.ptv),
            caption: _mm.caption || null,
            isAnimated: Boolean(_mm.isAnimated),
            fileName: _mm.fileName || _mm.title || null,
        };
    } catch (_rme) { return null; }
}

function _adResolveMediaInfo(mediaOriginal) {
    if (!mediaOriginal) return null;
    const _rawCached = mediaOriginal.rawMediaMsg;
    if (_rawCached && (_rawCached.mediaKey || _rawCached.url || _rawCached.directPath)) {
        return {
            raw: _rawCached,
            mtype: _rawCached.type || mediaOriginal.mediaType,
            mediaType: mediaOriginal.mediaType || _rawCached.type,
            isPtt: Boolean(mediaOriginal.isPtt || _rawCached.ptt),
        };
    }
    const _rawMsg = mediaOriginal.rawMsg;
    if (!_rawMsg) return null;
    const _map = [
        ['imageMessage', 'image'],
        ['videoMessage', 'video'],
        ['audioMessage', 'audio'],
        ['stickerMessage', 'sticker'],
        ['documentMessage', 'document'],
    ];
    for (const [_key, _mtype] of _map) {
        const _mm = _rawMsg[_key];
        if (!_mm) continue;
        const _buf = (v) => _adToB64(v);
        return {
            raw: {
                type: _mtype,
                url: _mm.url || null,
                directPath: _mm.directPath || null,
                mediaKey: _mm.mediaKey ? _buf(_mm.mediaKey) : null,
                fileEncSha256: _mm.fileEncSha256 ? _buf(_mm.fileEncSha256) : null,
                fileSha256: _mm.fileSha256 ? _buf(_mm.fileSha256) : null,
                mimetype: _mm.mimetype || null,
                ptt: Boolean(_mm.ptt),
                caption: _mm.caption || null,
                fileName: _mm.fileName || _mm.title || null,
            },
            mtype: _mtype,
            mediaType: mediaOriginal.mediaType || _mtype,
            isPtt: Boolean(mediaOriginal.isPtt || _mm.ptt),
            protoMsg: _mm,
        };
    }
    return null;
}

async function _adRedownloadMedia(raw, mtype, protoMsg) {
    if (!raw?.mediaKey && !protoMsg && !raw?.url && !raw?.directPath) return null;
    try {
        const { downloadContentFromMessage: _dlcR } = require('@whiskeysockets/baileys');
        const _rc = protoMsg || {
            url: raw.url,
            directPath: raw.directPath,
            mediaKey: _adToBuffer(raw.mediaKey),
            fileEncSha256: _adToBuffer(raw.fileEncSha256),
            fileSha256: _adToBuffer(raw.fileSha256),
            mimetype: raw.mimetype,
        };
        const _st = await _dlcR(_rc, mtype);
        const _chs = [];
        for await (const _ch of _st) _chs.push(_ch);
        const _b = Buffer.concat(_chs);
        return _b.length > 0 ? _b : null;
    } catch (_de) {
        console.error('[ANTIDELETE] re-dl error:', _de.message);
        return null;
    }
}

async function _adForwardDeletedMedia(sock, targetJid, mediaOriginal, sender, botNum) {
    if (!sock || !targetJid || !mediaOriginal) return;
    const _info = _adResolveMediaInfo(mediaOriginal);
    const _hasFile = mediaOriginal.mediaPath && mediaOriginal.mediaPath !== '__redownload__' && fs.existsSync(mediaOriginal.mediaPath);
    const _hasB64 = Boolean(mediaOriginal.mediaBufferB64);
    if (!_info && !_hasFile && !_hasB64) return;

    const _senderTag = sender ? sender.split('@')[0] : 'unknown';
    const _adMO = { caption: `*Deleted ${mediaOriginal.mediaType || _info?.mediaType || 'media'}*\nFrom: @${_senderTag}`, mentions: sender ? [sender] : [] };

    try {
        const _mtype = _info?.mtype || mediaOriginal.mediaType;
        let _buf = null;
        if (_hasB64) {
            _buf = _adToBuffer(mediaOriginal.mediaBufferB64);
        }
        if (!_buf && _hasFile) {
            try { _buf = fs.readFileSync(mediaOriginal.mediaPath); } catch (_) {}
        }
        if (!_buf && _info) {
            _buf = await _adRedownloadMedia(_info.raw, _info.mtype, _info.protoMsg);
            if (!_buf && _info.raw?.url) {
                try {
                    const _urlPayload = { [_mtype]: { url: _info.raw.url } };
                    if (_mtype === 'audio') {
                        _urlPayload.mimetype = _info.raw.mimetype || 'audio/ogg; codecs=opus';
                        _urlPayload.ptt = Boolean(_info.isPtt);
                    } else if (_mtype === 'video' || _mtype === 'image') {
                        _urlPayload.caption = _info.raw.caption || _adMO.caption;
                    } else if (_mtype === 'document') {
                        _urlPayload.mimetype = _info.raw.mimetype || 'application/octet-stream';
                        _urlPayload.fileName = _info.raw.fileName || 'deleted_file';
                    }
                    await sock.sendMessage(targetJid, { ..._urlPayload, mentions: _adMO.mentions });
                    return;
                } catch (_) {}
            }
        }

        if (!_buf || !_buf.length) {
            console.error(`[ANTIDELETE][${botNum || '?'}] no media buffer for ${_mtype}`);
            return;
        }

        if (_mtype === 'audio') {
            const _mime = _info?.raw?.mimetype || 'audio/ogg; codecs=opus';
            await sock.sendMessage(targetJid, { audio: _buf, mimetype: _mime, ptt: Boolean(_info?.isPtt) });
        } else if (_mtype === 'video' || _mtype === 'ptv') {
            const _isPtv = _mtype === 'ptv' || Boolean(_info?.raw?.ptv || mediaOriginal.isPtt);
            await sock.sendMessage(targetJid, {
                video: _buf,
                ptv: _isPtv,
                caption: _info?.raw?.caption || _adMO.caption,
                mentions: _adMO.mentions,
            });
        } else if (_mtype === 'image') {
            const _imgCap = _info?.raw?.caption || null;
            await sock.sendMessage(targetJid, _imgCap
                ? { image: _buf, caption: _imgCap, mentions: _adMO.mentions }
                : { image: _buf, ..._adMO });
        } else if (_mtype === 'sticker') {
            await sock.sendMessage(targetJid, { sticker: _buf });
        } else if (_mtype === 'document') {
            const _docName = _info?.raw?.fileName || 'deleted_file';
            const _docMime = _info?.raw?.mimetype || 'application/octet-stream';
            await sock.sendMessage(targetJid, {
                document: _buf,
                mimetype: _docMime,
                fileName: _docName,
                caption: `*Deleted Document*\nFrom: @${_senderTag}\n📄 ${_docName}`,
                mentions: sender ? [sender] : [],
            });
        }
    } catch (e) {
        console.error(`[ANTIDELETE][${botNum || '?'}] media send error:`, e.message);
    }
    if (_hasFile) { try { fs.unlinkSync(mediaOriginal.mediaPath); } catch (_) {} }
}

async function _adForwardDeletedExtras(sock, targetJid, mediaOriginal, sender) {
    if (!sock || !targetJid || !mediaOriginal?.extraPayload) return;
    const ex = mediaOriginal.extraPayload;
    const _senderTag = sender ? sender.split('@')[0] : 'unknown';
    try {
        if (ex.type === 'location' && ex.latitude != null && ex.longitude != null) {
            await sock.sendMessage(targetJid, {
                location: {
                    degreesLatitude: ex.latitude,
                    degreesLongitude: ex.longitude,
                    name: ex.name || `Deleted location from @${_senderTag}`,
                },
            });
        } else if (ex.type === 'contact' && ex.vcard) {
            await sock.sendMessage(targetJid, {
                contacts: {
                    displayName: ex.displayName || 'Contact',
                    contacts: [{ vcard: ex.vcard }],
                },
            });
        }
    } catch (e) {
        console.error('[ANTIDELETE] extra forward error:', e.message);
    }
}

function _adMediaNeedsWait(entry) {
    if (!entry?.mediaType) return false;
    const hasFile = entry.mediaPath && entry.mediaPath !== '__redownload__'
        && fs.existsSync(entry.mediaPath);
    const hasB64 = Boolean(entry.mediaBufferB64);
    const hasRaw = Boolean(entry.rawMediaMsg?.mediaKey || entry.rawMediaMsg?.url || entry.rawMediaMsg?.directPath);
    return entry.mediaPath === '__redownload__' && !hasFile && !hasB64 && !hasRaw;
}

async function _adLookupWithRetry(sock, clean, chatId, msgId, altIds) {
    try {
        const session = getAntideleteSession(clean);
        session?.refreshFromDisk();
    } catch (_) {}

    const prefetchKey = `${clean}::${msgId}`;
    const prefetch = global._adPrefetchPromises?.get(prefetchKey);
    if (prefetch) {
        await Promise.race([prefetch, new Promise((r) => setTimeout(r, 2000))]);
    }

    const deadline = Date.now() + 2800;
    let orig = null;
    while (Date.now() < deadline) {
        try {
            const session = getAntideleteSession(clean);
            session?.saveDiskNow();
        } catch (_) {}

        orig = await _adLookupCachedMessage(sock, clean, chatId, msgId, altIds);
        if (orig && !_adMediaNeedsWait(orig)) return orig;

        await _adFlushMongoSavesNow().catch(() => {});
        orig = await _adLookupCachedMessage(sock, clean, chatId, msgId, altIds);
        if (orig && !_adMediaNeedsWait(orig)) return orig;

        await new Promise((r) => setTimeout(r, 350));
    }

    return orig || _adLookupCachedMessage(sock, clean, chatId, msgId, altIds);
}

async function _adHandleMessageDelete(sock, opts = {}) {
    const {
        botNum,
        chatId,
        msgId,
        deletedBy = '',
        fromMeDelete = false,
        altChatIds = [],
        tracker = null,
    } = opts;
    const clean = _adResolveBotNum(sock, botNum);
    if (!sock || !clean || !chatId || !msgId) return false;
    if (_adCheckDeleteProcessed(clean, chatId, msgId)) return false;

    let _tracker = tracker;
    if (!_tracker) {
        try {
            const pairMod = require('../pair');
            const jid = `${clean}@s.whatsapp.net`;
            _tracker = pairMod._getTracker?.()?.get(jid) || pairMod._getTracker?.()?.get(clean);
        } catch (_) {}
    }
    try {
        const { ensureWhatsAppSocketHot } = require('./socket-wake');
        await ensureWhatsAppSocketHot(sock, _tracker, { force: true });
    } catch (_) {}

    const cfg = loadAntideleteCfg(clean);
    const mode = cfg.mode || 'off';
    if (mode === 'off') return false;

    const isGroup = String(chatId).endsWith('@g.us');
    if (mode === 'private_pm' && isGroup) return false;
    if (mode === 'private_groups' && !isGroup) return false;
    if (mode === 'chat' && isGroup) return false;
    if (mode === 'chat_groups' && !isGroup) return false;

    const deletedByNum = cleanBotNum(String(deletedBy).split(':')[0].split('@')[0] || deletedBy);
    if (fromMeDelete && deletedByNum === clean) {
        _adRemoveCachedMessage(clean, chatId, msgId);
        return false;
    }

    const altIds = [...new Set(altChatIds.filter(Boolean))];
    const orig = await _adLookupWithRetry(sock, clean, chatId, msgId, altIds);

    const ownerJid = `${clean}@s.whatsapp.net`;
    const timeStr = new Date().toLocaleString('en-US', {
        timeZone: process.env.TIMEZONE || 'Africa/Harare', hour12: true,
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        day: '2-digit', month: '2-digit', year: 'numeric',
    });

    let groupName = '';
    if (isGroup) {
        try { groupName = (await sock.groupMetadata(chatId)).subject; } catch (_) {}
    }

    const target = (mode === 'chat' || mode === 'chat_groups') ? chatId : ownerJid;

    if (!orig) {
        const text = `*🔰 ANTIDELETE REPORT 🔰*\n\n` +
            `*🗑️ Deleted By:* @${(deletedBy || 'unknown').split('@')[0]}\n` +
            `*🕒 Time:* ${timeStr}\n` +
            (isGroup ? `*👥 Group:* ${groupName || chatId.split('@')[0]}\n` : `*💬 Chat:* Private\n`) +
            `\n_[Original message not in cache]_`;
        await _adDeliverAntideleteReport(sock, {
            targetJid: target,
            text,
            mediaOriginal: null,
            sender: deletedBy,
            deletedBy,
            botNum: clean,
        });
        // Do NOT mark dedup on cache miss — messages.delete handler may retry with warm socket
        return false;
    }

    const sender = orig.sender || deletedBy || chatId;
    const senderNum = String(sender).split('@')[0];
    const senderNumClean = cleanBotNum(sender);

    if (orig.fromMe && fromMeDelete && deletedByNum === clean) {
        _adRemoveCachedMessage(clean, chatId, msgId);
        return false;
    }
    if (senderNumClean === clean && orig.fromMe) {
        _adRemoveCachedMessage(clean, chatId, msgId);
        return false;
    }

    const hasMedia = Boolean(
        orig.mediaType ||
        orig.rawMediaMsg ||
        orig.mediaBufferB64 ||
        orig.extraPayload ||
        (orig.mediaPath && orig.mediaPath !== '__redownload__')
    );

    const text = `*🔰 ANTIDELETE REPORT 🔰*\n\n` +
        `*🗑️ Deleted By:* @${(deletedBy || 'unknown').split('@')[0]}\n` +
        `*👤 Sender:* @${senderNum}\n` +
        `*🕒 Time:* ${timeStr}\n` +
        (isGroup ? `*👥 Group:* ${groupName || chatId.split('@')[0]}\n` : `*💬 Chat:* Private\n`) +
        `\n*💬 Deleted Message:*\n${orig.content || '_[media / no text]_'}`;

    const sent = await _adDeliverAntideleteReport(sock, {
        targetJid: target,
        text,
        mediaOriginal: hasMedia ? orig : null,
        sender,
        deletedBy,
        botNum: clean,
    });
    if (sent) {
        _adMarkDeleteProcessed(clean, chatId, msgId);
        _adRemoveCachedMessage(clean, chatId, msgId);
    }
    return sent;
}

global._serializeRawMedia = _serializeRawMedia;
global._adHandleMessageDelete = _adHandleMessageDelete;
global.loadAntideleteCfg = loadAntideleteCfg;
global._adResolveBotNum = _adResolveBotNum;
global._adExpandChatIds = _adExpandChatIds;
global._adChatIdsFromKey = _adChatIdsFromKey;
global._adResolveMediaInfo = _adResolveMediaInfo;
global._adForwardDeletedMedia = _adForwardDeletedMedia;
global._adLookupCachedMessage = _adLookupCachedMessage;
global._adDeliverAntideleteReport = _adDeliverAntideleteReport;
global._adFlushPendingReports = _adFlushPendingReports;
global._adFlushMongoSavesNow = _adFlushMongoSavesNow;
global._adQueuePendingReport = _adQueuePendingReport;
global._cacheMessageForAntidelete = cacheMessageForAntidelete;
global._adRemoveCachedMessage = _adRemoveCachedMessage;
global._adMongoDelete = _adMongoDelete;
global.unwrapWaMessage = unwrapWaMessage;
global.getAntideleteSession = getAntideleteSession;

module.exports = {
    _adHandleMessageDelete,
    loadAntideleteCfg,
    _adResolveBotNum,
    _adExpandChatIds,
    _adChatIdsFromKey,
    _serializeRawMedia,
    _adResolveMediaInfo,
    _adForwardDeletedMedia,
    _adLookupCachedMessage,
    _adDeliverAntideleteReport,
    _adFlushPendingReports,
    _adQueuePendingReport,
    cacheMessageForAntidelete,
    unwrapWaMessage,
    _adRemoveCachedMessage,
    _adMongoDelete,
    getAntideleteSession,
};
