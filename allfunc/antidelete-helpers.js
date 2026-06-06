const fs = require('fs');
const path = require('path');

const ANTIDELETE_DISK_STORE = './database/antidelete_store.json';
const ANTIDELETE_PENDING_FILE = './database/antidelete_pending.json';
const ANTIDELETE_PENDING_MAX = 500;

function _adEnsureDbDir() {
    if (!fs.existsSync('./database')) fs.mkdirSync('./database', { recursive: true });
}

function _adExtractText(msg) {
    if (!msg) return '';
    return msg.conversation
        || msg.extendedTextMessage?.text
        || msg.imageMessage?.caption
        || msg.videoMessage?.caption
        || msg.documentMessage?.caption
        || msg.audioMessage?.caption
        || '';
}

function _adMediaTypeFromMsg(msg) {
    if (!msg) return '';
    if (msg.imageMessage) return 'image';
    if (msg.videoMessage) return 'video';
    if (msg.audioMessage) return 'audio';
    if (msg.stickerMessage) return 'sticker';
    if (msg.documentMessage) return 'document';
    return '';
}

function _readDiskEntry(key) {
    try {
        if (!fs.existsSync(ANTIDELETE_DISK_STORE)) return null;
        const entries = JSON.parse(fs.readFileSync(ANTIDELETE_DISK_STORE, 'utf-8'));
        if (!Array.isArray(entries)) return null;
        const found = entries.find(([k]) => k === key);
        return found ? found[1] : null;
    } catch (_) { return null; }
}

function _adStoreKeys(botNum, chatId, msgId) {
    const shared = `${chatId}::${msgId}`;
    const botKey = botNum ? `${botNum}::${shared}` : shared;
    return [botKey, shared, msgId];
}

function _adEntryFromLoadedMessage(loaded, chatId) {
    const msg = loaded?.message || {};
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

// Lookup cached message: memory → disk → Baileys store (works when bot user phone is offline)
async function _adLookupCachedMessage(sock, botNum, chatId, msgId) {
    for (const k of _adStoreKeys(botNum, chatId, msgId)) {
        const mem = global._antideleteStore?.get(k);
        if (mem) return mem;
    }
    for (const k of _adStoreKeys(botNum, chatId, msgId)) {
        const disk = _readDiskEntry(k);
        if (disk) return disk;
    }
    const store = global._baileysMsgStore;
    if (store?.loadMessage && chatId && msgId) {
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
        console.log(`[ANTIDELETE] Queued offline report for bot ${botNum} (user phone may be offline)`);
    } catch (e) {
        console.error('[ANTIDELETE] pending queue error:', e.message);
    }
}

async function _adDeliverAntideleteReport(sock, { targetJid, text, mediaOriginal, sender, deletedBy, botNum }) {
    if (!sock || !targetJid || !text) return false;
    const mentions = [deletedBy, sender].filter(Boolean);
    try {
        await sock.sendMessage(targetJid, { text, mentions });
        if (mediaOriginal) await _adForwardDeletedMedia(sock, targetJid, mediaOriginal, sender);
        return true;
    } catch (e) {
        console.error('[ANTIDELETE] deliver failed, queuing for later:', e.message);
        if (botNum) {
            _adQueuePendingReport(botNum, { targetJid, text, mediaOriginal, sender, deletedBy });
        }
        return false;
    }
}

// Flush pending reports when bot reconnects — delivers to saved messages even if user was offline
async function _adFlushPendingReports(sock, botNum, botJid) {
    if (!sock || !botNum || !fs.existsSync(ANTIDELETE_PENDING_FILE)) return;
    let pending = [];
    try { pending = JSON.parse(fs.readFileSync(ANTIDELETE_PENDING_FILE, 'utf-8')); } catch (_) { return; }
    if (!Array.isArray(pending) || !pending.length) return;

    const clean = String(botNum).replace(/[^0-9]/g, '');
    const mine = pending.filter(p => String(p.botNum).replace(/[^0-9]/g, '') === clean);
    if (!mine.length) return;

    const remaining = pending.filter(p => String(p.botNum).replace(/[^0-9]/g, '') !== clean);
    let flushed = 0;

    for (const item of mine) {
        const target = item.targetJid || botJid;
        if (!target) continue;
        try {
            const mentions = [item.deletedBy, item.sender].filter(Boolean);
            await sock.sendMessage(target, { text: item.text, mentions });
            if (item.mediaOriginal) await _adForwardDeletedMedia(sock, target, item.mediaOriginal, item.sender);
            flushed++;
        } catch (e) {
            item.attempts = (item.attempts || 0) + 1;
            if (item.attempts < 15) remaining.push(item);
        }
    }

    try {
        _adEnsureDbDir();
        fs.writeFileSync(ANTIDELETE_PENDING_FILE, JSON.stringify(remaining.slice(-ANTIDELETE_PENDING_MAX), null, 2));
        if (flushed > 0) console.log(`[ANTIDELETE] Flushed ${flushed} pending report(s) to ${clean} saved messages`);
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

async function _adForwardDeletedMedia(sock, targetJid, mediaOriginal, sender) {
    if (!sock || !targetJid || !mediaOriginal) return;
    const _info = _adResolveMediaInfo(mediaOriginal);
    const _hasFile = mediaOriginal.mediaPath && mediaOriginal.mediaPath !== '__redownload__' && fs.existsSync(mediaOriginal.mediaPath);
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
        console.error('[ANTIDELETE] media send error:', e.message);
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

module.exports = {
    _serializeRawMedia,
    _adResolveMediaInfo,
    _adForwardDeletedMedia,
    _adLookupCachedMessage,
    _adDeliverAntideleteReport,
    _adFlushPendingReports,
    _adQueuePendingReport,
};
