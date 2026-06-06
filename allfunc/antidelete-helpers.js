const fs = require('fs');
const path = require('path');
const { getAntideleteSession, cleanBotNum } = require('./antidelete-session');

const ANTIDELETE_PENDING_FILE = './database/antidelete_pending.json';
const ANTIDELETE_PENDING_MAX = 500;
const ANTIDELETE_MONGO_TTL_MS = 48 * 60 * 60 * 1000;

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
    return msg;
}

function _adExtractText(msg) {
    const m = unwrapWaMessage(msg);
    if (!m) return '';
    return m.conversation
        || m.extendedTextMessage?.text
        || m.imageMessage?.caption
        || m.videoMessage?.caption
        || m.documentMessage?.caption
        || m.audioMessage?.caption
        || '';
}

function _adMediaTypeFromMsg(msg) {
    const m = unwrapWaMessage(msg);
    if (!m) return '';
    if (m.imageMessage) return 'image';
    if (m.videoMessage) return 'video';
    if (m.audioMessage) return 'audio';
    if (m.stickerMessage) return 'sticker';
    if (m.documentMessage) return 'document';
    return '';
}

async function _adMongoGet(botNum, chatId, msgId) {
    try {
        const { isMongoMode, initDb } = require('../server/db');
        if (!isMongoMode()) return null;
        await initDb();
        const AntideleteCache = require('../server/models/AntideleteCache');
        const clean = cleanBotNum(botNum);
        const doc = await AntideleteCache.findOne({ botNum: clean, chatId, msgId }).lean();
        return doc?.data || null;
    } catch (_) { return null; }
}

function _adMongoSave(botNum, chatId, msgId, entry) {
    const clean = cleanBotNum(botNum);
    if (!clean) return;
    (async () => {
        try {
            const { isMongoMode, initDb } = require('../server/db');
            if (!isMongoMode()) return;
            await initDb();
            const AntideleteCache = require('../server/models/AntideleteCache');
            const session = getAntideleteSession(clean);
            const key = session ? session.mongoKey(chatId, msgId) : `${clean}::${chatId}::${msgId}`;
            await AntideleteCache.findOneAndUpdate(
                { botNum: clean, chatId, msgId },
                {
                    key,
                    botNum: clean,
                    chatId: String(chatId || ''),
                    msgId: String(msgId || ''),
                    data: entry,
                    expiresAt: new Date(Date.now() + ANTIDELETE_MONGO_TTL_MS),
                },
                { upsert: true }
            );
        } catch (_) {}
    })();
}

function _adMongoDelete(botNum, chatId, msgId) {
    const clean = cleanBotNum(botNum);
    if (!clean) return;
    setImmediate(async () => {
        try {
            const { isMongoMode, initDb } = require('../server/db');
            if (!isMongoMode()) return;
            await initDb();
            const AntideleteCache = require('../server/models/AntideleteCache');
            await AntideleteCache.deleteOne({ botNum: clean, chatId, msgId });
        } catch (_) {}
    });
}

function _adPrefetchMedia(botNum, chatId, msgId, mediaContent, mtype, session) {
    if (!mediaContent || !mtype || !msgId || !session || !chatId) return;
    const ext = mtype === 'video' ? 'mp4' : mtype === 'audio' ? 'ogg' : mtype === 'sticker' ? 'webp' : 'jpg';
    const filePath = session.mediaFilePath(msgId, ext);
    setImmediate(async () => {
        try {
            const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
            const stream = await downloadContentFromMessage(mediaContent, mtype);
            const chunks = [];
            for await (const ch of stream) chunks.push(ch);
            const buf = Buffer.concat(chunks);
            if (!buf.length) return;
            await fs.promises.writeFile(filePath, buf);
            const ex = session.get(chatId, msgId);
            if (ex) {
                ex.mediaPath = filePath;
                session.set(chatId, msgId, ex);
                _adMongoSave(botNum, chatId, msgId, ex);
            }
            session.scheduleDiskSave();
        } catch (_) {}
    });
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
        const botNum = cleanBotNum(sock?.user?.id || sock?._cachedBotNumber || '');
        if (!botNum) return;

        const session = getAntideleteSession(botNum);
        if (!session) return;

        const unwrapped = unwrapWaMessage(rawMsg.message || {});
        const sender = rawMsg.key.participant || rawMsg.key.remoteJid;
        const existing = session.get(chatId, msgId);

        let content = _adExtractText(unwrapped) || existing?.content || '';
        let mediaType = _adMediaTypeFromMsg(unwrapped) || existing?.mediaType || '';
        let mediaPath = existing?.mediaPath || '';
        const rawMediaMsg = _serializeRawMedia(unwrapped) || existing?.rawMediaMsg || null;

        if (unwrapped.audioMessage) {
            content = content || (unwrapped.audioMessage.ptt ? '🎤 Voice Note' : '🎵 Audio');
            mediaType = 'audio';
            mediaPath = mediaPath || '__redownload__';
            _adPrefetchMedia(botNum, chatId, msgId, unwrapped.audioMessage, 'audio', session);
        } else if (unwrapped.videoMessage) {
            mediaType = 'video';
            mediaPath = mediaPath || '__redownload__';
            _adPrefetchMedia(botNum, chatId, msgId, unwrapped.videoMessage, 'video', session);
        } else if (unwrapped.imageMessage) {
            mediaType = 'image';
            mediaPath = mediaPath || '__redownload__';
            _adPrefetchMedia(botNum, chatId, msgId, unwrapped.imageMessage, 'image', session);
        } else if (unwrapped.stickerMessage) {
            content = content || '🎭 Sticker';
            mediaType = 'sticker';
            mediaPath = mediaPath || '__redownload__';
            _adPrefetchMedia(botNum, chatId, msgId, unwrapped.stickerMessage, 'sticker', session);
        } else if (unwrapped.documentMessage) {
            const docName = unwrapped.documentMessage.fileName || unwrapped.documentMessage.title || 'File';
            content = content || `📄 Document: ${docName}`;
            mediaType = 'document';
            mediaPath = mediaPath || '__redownload__';
        }

        const entry = {
            content,
            rawMsg: unwrapped,
            rawMediaMsg,
            mediaType,
            mediaPath,
            isPtt: Boolean(unwrapped.audioMessage?.ptt || existing?.isPtt),
            fromMe: Boolean(rawMsg.key.fromMe),
            sender,
            group: chatId.endsWith('@g.us') ? chatId : null,
            timestamp: new Date().toISOString(),
            _ts: Date.now(),
            botNum,
        };

        session.set(chatId, msgId, entry);
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
        rawMsg: msg,
        rawMediaMsg: _serializeRawMedia(msg),
        mediaType: _adMediaTypeFromMsg(msg),
        mediaPath: '',
        fromMe: Boolean(loaded?.key?.fromMe),
        sender: loaded?.key?.participant || chatId,
        timestamp: new Date().toISOString(),
        _ts: Date.now(),
    };
}

/**
 * Lookup cached message scoped to ONE bot session:
 * session RAM → session disk → MongoDB (botNum+chatId+msgId) → this socket's Baileys store
 */
async function _adLookupCachedMessage(sock, botNum, chatId, msgId) {
    const clean = cleanBotNum(botNum);
    if (!clean || !chatId || !msgId) return null;

    const session = getAntideleteSession(clean);
    if (session) {
        const mem = session.get(chatId, msgId);
        if (mem) return mem;
        const disk = session.readDiskEntry(chatId, msgId);
        if (disk) {
            session.set(chatId, msgId, disk);
            return disk;
        }
    }

    const mongo = await _adMongoGet(clean, chatId, msgId);
    if (mongo) {
        session?.set(chatId, msgId, mongo);
        return mongo;
    }

    // Per-socket Baileys store — never use a global shared store
    const store = sock?._baileysMsgStore;
    if (store?.loadMessage) {
        try {
            const loaded = await store.loadMessage(chatId, msgId);
            if (loaded?.message) return _adEntryFromLoadedMessage(loaded, chatId);
        } catch (_) {}
    }
    if (sock?.loadMessage) {
        try {
            const loaded = await sock.loadMessage(chatId, msgId);
            if (loaded?.message) return _adEntryFromLoadedMessage(loaded, chatId);
        } catch (_) {}
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
        if (mediaOriginal) await _adForwardDeletedMedia(sock, targetJid, mediaOriginal, sender, botNum);
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
            if (item.mediaOriginal) await _adForwardDeletedMedia(sock, target, item.mediaOriginal, item.sender, clean);
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
    const _am = msg?.audioMessage || null;
    const _vm = msg?.videoMessage || null;
    const _im = msg?.imageMessage || null;
    const _sm = msg?.stickerMessage || null;
    const _dm = msg?.documentMessage || null;
    const _mm = _am || _vm || _im || _sm || _dm;
    const _mtype = _am ? 'audio' : _vm ? 'video' : _im ? 'image' : _sm ? 'sticker' : _dm ? 'document' : null;
    if (!_mm || !_mtype) return null;
    try {
        const _buf = (v) => (v ? (Buffer.isBuffer(v) ? v.toString('base64') : String(v)) : null);
        return {
            type: _mtype,
            url: _mm.url || null,
            directPath: _mm.directPath || null,
            mediaKey: _mm.mediaKey ? _buf(_mm.mediaKey) : null,
            fileEncSha256: _mm.fileEncSha256 ? _buf(_mm.fileEncSha256) : null,
            fileSha256: _mm.fileSha256 ? _buf(_mm.fileSha256) : null,
            mimetype: _mm.mimetype || (_mtype === 'audio' ? 'audio/ogg; codecs=opus' : _mtype === 'sticker' ? 'image/webp' : _mtype === 'image' ? 'image/jpeg' : 'video/mp4'),
            ptt: Boolean(_mm.ptt),
            caption: _mm.caption || null,
            isAnimated: Boolean(_mm.isAnimated),
            fileName: _mm.fileName || _mm.title || null,
        };
    } catch (_rme) { return null; }
}

function _adResolveMediaInfo(mediaOriginal) {
    if (!mediaOriginal) return null;
    if (mediaOriginal.rawMediaMsg?.mediaKey) {
        return {
            raw: mediaOriginal.rawMediaMsg,
            mtype: mediaOriginal.rawMediaMsg.type,
            mediaType: mediaOriginal.mediaType || mediaOriginal.rawMediaMsg.type,
            isPtt: Boolean(mediaOriginal.isPtt || mediaOriginal.rawMediaMsg.ptt),
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
        const _buf = (v) => (v ? (Buffer.isBuffer(v) ? v.toString('base64') : String(v)) : null);
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
    if (!raw?.mediaKey && !protoMsg) return null;
    try {
        const { downloadContentFromMessage: _dlcR } = require('@whiskeysockets/baileys');
        const _toBuf = (v) => {
            if (!v) return null;
            if (Buffer.isBuffer(v)) return v;
            try { return Buffer.from(v, 'base64'); } catch (_) { return null; }
        };
        const _rc = protoMsg || {
            url: raw.url,
            directPath: raw.directPath,
            mediaKey: _toBuf(raw.mediaKey),
            fileEncSha256: _toBuf(raw.fileEncSha256),
            fileSha256: _toBuf(raw.fileSha256),
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
    let _hasFile = mediaOriginal.mediaPath && mediaOriginal.mediaPath !== '__redownload__' && fs.existsSync(mediaOriginal.mediaPath);
    if (!_info && !_hasFile) return;

    const _senderTag = sender ? sender.split('@')[0] : 'unknown';
    const _adMO = { caption: `*Deleted ${mediaOriginal.mediaType || _info?.mediaType || 'media'}*\nFrom: @${_senderTag}`, mentions: sender ? [sender] : [] };

    try {
        const _mtype = _info?.mtype || mediaOriginal.mediaType;
        let _buf = null;
        if (_info) {
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
        if (!_buf && _hasFile) _buf = fs.readFileSync(mediaOriginal.mediaPath);

        if (!_buf || !_buf.length) return;

        if (_mtype === 'audio') {
            const _mime = _info?.raw?.mimetype || 'audio/ogg; codecs=opus';
            await sock.sendMessage(targetJid, { audio: _buf, mimetype: _mime, ptt: Boolean(_info?.isPtt) });
        } else if (_mtype === 'video') {
            await sock.sendMessage(targetJid, {
                video: _buf,
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

global._serializeRawMedia = _serializeRawMedia;
global._adResolveMediaInfo = _adResolveMediaInfo;
global._adForwardDeletedMedia = _adForwardDeletedMedia;
global._adLookupCachedMessage = _adLookupCachedMessage;
global._adDeliverAntideleteReport = _adDeliverAntideleteReport;
global._adFlushPendingReports = _adFlushPendingReports;
global._adQueuePendingReport = _adQueuePendingReport;
global._cacheMessageForAntidelete = cacheMessageForAntidelete;
global._adRemoveCachedMessage = _adRemoveCachedMessage;
global._adMongoDelete = _adMongoDelete;
global.unwrapWaMessage = unwrapWaMessage;
global.getAntideleteSession = getAntideleteSession;

module.exports = {
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
