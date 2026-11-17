'use strict';
// View-once ("one time") media capture + delivery.
//
// WhatsApp strips the media payload out of a quoted view-once message, so a reply
// sent later can never re-download it. The only reliable window is at delivery
// time: captureViewOnce() grabs the buffer while the message arrives, and
// deliverViewOnceOnReply() replays it to the bot's own chat when the user replies
// under that message (any reply — emoji, text, or .vv).
//
// baileys is never required here: the caller injects download() / getContentType()
// so this module stays dependency-free and testable offline.

const MAX_ENTRIES = 20;
const TTL_MS = 30 * 60 * 1000;
const MAX_BYTES = 25 * 1024 * 1024;
const NOTICE_TTL_MS = 24 * 60 * 60 * 1000;
const VIEWONCE_BLOCKED_NOTICE = (from) => `⚠️ *One-time photo save nahi ho sakti*\n👤 From: @${from}\n\nWhatsApp ab one-time photo/video sirf phone par bhejta hai — bot (linked device) ko sirf khali nishaan milta hai, photo nahi. Ye WhatsApp ki taraf se band hai, bot is ko nahi khol sakta.`;

function _defaultType(obj) {
    return obj && typeof obj === 'object' ? Object.keys(obj)[0] : null;
}

// Unwrap every view-once wrapper WhatsApp uses. Returns { type, inner } or null.
function unwrapViewOnce(message, getContentType) {
    if (!message || typeof message !== 'object') return null;
    const gt = typeof getContentType === 'function' ? getContentType : _defaultType;
    const wrapped =
        message.viewOnceMessage?.message
        || message.viewOnceMessageV2?.message
        || message.viewOnceMessageV2Extension?.message
        || (message.imageMessage?.viewOnce ? message : null)
        || (message.videoMessage?.viewOnce ? message : null)
        || (message.audioMessage?.viewOnce ? message : null);
    if (!wrapped) return null;
    const type = gt(wrapped) || _defaultType(wrapped);
    const inner = type ? wrapped[type] : null;
    return inner && typeof inner === 'object' ? { type, inner } : null;
}

function _ensureGlobals() {
    if (!global._viewOnceBufferMap) global._viewOnceBufferMap = new Map();
    if (!global._lastViewOnce) global._lastViewOnce = {};
    if (!global._viewOnceHandledIds) global._viewOnceHandledIds = new Map();
    return {
        bufferMap: global._viewOnceBufferMap,
        last: global._lastViewOnce,
        handled: global._viewOnceHandledIds
    };
}

// Drop entries older than TTL_MS and keep the map under MAX_ENTRIES.
function _prune(bufferMap, now) {
    for (const [k, v] of bufferMap) {
        if (now - (v?.ts || 0) > TTL_MS) bufferMap.delete(k);
    }
    while (bufferMap.size > MAX_ENTRIES) {
        bufferMap.delete(bufferMap.keys().next().value);
    }
    for (const [k, v] of global._viewOnceHandledIds) {
        if (now - v > TTL_MS) global._viewOnceHandledIds.delete(k);
    }
}

// Capture one incoming message. Returns the stored entry, or null when the
// message was not view-once media.
async function captureViewOnce(rawMsg, opts = {}) {
    const { download, getContentType } = opts;
    const message = rawMsg?.message;
    const found = unwrapViewOnce(message, getContentType);
    if (!found || !rawMsg?.key?.id) return null;

    const { bufferMap, last } = _ensureGlobals();
    const rawJid = rawMsg.key.remoteJid || '';
    const chat = /:\d+@/.test(rawJid) ? rawJid.replace(/:\d+@/, '@') : rawJid;
    const entry = {
        msg: { [found.type]: found.inner },
        type: found.type,
        mime: found.inner.mimetype
            || (found.type === 'imageMessage' ? 'image/jpeg'
                : found.type === 'videoMessage' ? 'video/mp4'
                : 'audio/ogg; codecs=opus'),
        caption: found.inner.caption || '',
        isPtt: Boolean(found.inner.ptt),
        sender: String(rawMsg.key.participant || rawJid)
            .split(':')[0].replace('@s.whatsapp.net', ''),
        chat,
        buffer: null,
        ts: Date.now()
    };

    if (typeof download === 'function') {
        try {
            const stream = await download(found.inner, found.type.replace('Message', ''));
            const chunks = [];
            for await (const chunk of stream) chunks.push(chunk);
            const buf = Buffer.concat(chunks);
            // 25 MB ceiling — a runaway group must not exhaust worker memory.
            if (buf.length > 0 && buf.length <= MAX_BYTES) entry.buffer = buf;
        } catch (err) {
            console.log('[viewonce] capture download failed:', err?.message);
        }
    }

    bufferMap.set(rawMsg.key.id, entry);
    last[chat] = entry;
    _prune(bufferMap, Date.now());
    console.log(`[viewonce] captured ${entry.type} ${entry.buffer ? entry.buffer.length + 'B' : 'NO-BUFFER'} from ${entry.sender} in ${chat}`);
    return entry;
}

// Build the sendMessage payload for a captured entry, or null if unsupported.
function buildPayload(entry, caption) {
    if (!entry?.buffer?.length) return null;
    if (entry.type === 'imageMessage') {
        return { image: entry.buffer, caption, mimetype: entry.mime || 'image/jpeg' };
    }
    if (entry.type === 'videoMessage') {
        return { video: entry.buffer, caption, mimetype: entry.mime || 'video/mp4' };
    }
    if (entry.type === 'audioMessage') {
        return { audio: entry.buffer, mimetype: entry.mime || 'audio/ogg; codecs=opus', ptt: entry.isPtt };
    }
    return null;
}

// Quoted message id of a reply, or null.
function _quotedId(m) {
    return m?.quoted?.id || m?.msg?.contextInfo?.stanzaId || null;
}

// Raw quoted message object (the WhatsApp proto the reply carries), or null.
function _quotedRaw(m) {
    return m?.msg?.contextInfo?.quotedMessage || null;
}

// The reply that must be served from the in-memory capture map.
function pendingViewOnceReply(m) {
    if (!m?.key?.id) return null;
    const quotedId = _quotedId(m);
    if (!quotedId || !global._viewOnceBufferMap?.has(quotedId)) return null;
    if (global._viewOnceHandledIds?.has(m.key.id)) return null;
    return global._viewOnceBufferMap.get(quotedId);
}

async function _readStream(stream) {
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
}

// Find the media for a reply. Order: in-memory capture -> stored copy (antidelete
// cache, survives restarts) -> the media keys the phone puts in the quoted reply.
// Returns { entry, source } or null when the quoted message is not view-once.
async function resolveViewOnceForReply(m, opts = {}) {
    const { download, lookupStored, getContentType } = opts;
    if (!m?.key?.id) return null;
    const quotedId = _quotedId(m);
    if (!quotedId) return null;
    if (global._viewOnceHandledIds?.has(m.key.id)) return null;

    const memEntry = global._viewOnceBufferMap?.get(quotedId) || null;
    const quotedVo = unwrapViewOnce(_quotedRaw(m), getContentType);
    let stored = null;
    if (typeof lookupStored === 'function') {
        try { stored = await lookupStored(quotedId); } catch (_) { stored = null; }
    }
    const isViewOnce = Boolean(memEntry || quotedVo || stored?.isViewOnce);
    if (!isViewOnce) return null;

    const base = memEntry || {
        type: quotedVo?.type || stored?.type || 'imageMessage',
        mime: quotedVo?.inner?.mimetype || stored?.mime || '',
        caption: quotedVo?.inner?.caption || stored?.caption || '',
        isPtt: Boolean(quotedVo?.inner?.ptt || stored?.isPtt),
        sender: String(m.quoted?.sender || '').split('@')[0],
        chat: m.chat,
        msg: quotedVo ? { [quotedVo.type]: quotedVo.inner } : null,
        buffer: null,
        ts: Date.now()
    };
    if (base.buffer?.length) return { entry: base, source: 'memory' };

    if (stored?.buffer?.length) {
        base.buffer = stored.buffer;
        if (stored.type) base.type = stored.type;
        if (!base.mime && stored.mime) base.mime = stored.mime;
        return { entry: base, source: 'stored' };
    }

    const candidates = [];
    if (base.msg?.[base.type]) candidates.push({ type: base.type, inner: base.msg[base.type] });
    if (quotedVo && quotedVo.inner !== base.msg?.[base.type]) candidates.push(quotedVo);
    if (typeof download === 'function') {
        for (const c of candidates) {
            if (!c.inner?.mediaKey && !c.inner?.directPath && !c.inner?.url) continue;
            try {
                const buf = await _readStream(await download(c.inner, c.type.replace('Message', '')));
                if (buf.length && buf.length <= MAX_BYTES) {
                    base.buffer = buf;
                    base.type = c.type;
                    if (!base.mime) base.mime = c.inner.mimetype || '';
                    return { entry: base, source: 'quoted' };
                }
            } catch (err) {
                console.log('[viewonce] quoted download failed:', err?.message);
            }
        }
    }
    console.log(`[viewonce] reply ${m.key.id} quotes view-once ${quotedId} but no media found (mem=${Boolean(memEntry)} stored=${Boolean(stored)} quotedKeys=${Boolean(quotedVo?.inner?.mediaKey)})`);
    return { entry: base, source: 'none' };
}

// Deliver a view-once to the bot's own chat when the user replies under it.
// Returns true when sent.
async function deliverViewOnceOnReply(devtrust, m, botNumber, opts = {}) {
    const found = await resolveViewOnceForReply(m, opts);
    if (!found) return false;
    const { entry } = found;
    _ensureGlobals();
    // Mark early so the .vv / emoji handlers in the same message don't send it twice.
    global._viewOnceHandledIds.set(m.key.id, Date.now());

    const time = new Date().toLocaleString('en-US', {
        timeZone: process.env.TIMEZONE || 'Asia/Karachi', hour12: true,
        hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric'
    });
    const from = entry.sender || String(m.quoted?.sender || m.sender || '').split('@')[0];
    const chatLabel = String(entry.chat || m.chat).includes('g.us') ? 'Group' : 'Private';
    const caption = `🔐 *View-Once Saved!*\n👤 From: @${from}\n💬 Chat: ${chatLabel}\n🕒 ${time}`
        + (entry.caption ? `\n\n📝 ${entry.caption}` : '');

    const payload = buildPayload(entry, caption);
    try {
        if (!payload) {
            // WhatsApp no longer delivers view-once media to linked devices (the bot only
            // gets a stub, and the quoted copy has an empty media key). Say so ONCE per
            // photo — never spam the owner's chat on every emoji/text reply.
            if (!global._viewOnceNoticeIds) global._viewOnceNoticeIds = new Map();
            const qid = _quotedId(m);
            const now = Date.now();
            for (const [k, t] of global._viewOnceNoticeIds) if (now - t > NOTICE_TTL_MS) global._viewOnceNoticeIds.delete(k);
            if (qid && !global._viewOnceNoticeIds.has(qid)) {
                global._viewOnceNoticeIds.set(qid, now);
                await devtrust.sendMessage(botNumber, { text: VIEWONCE_BLOCKED_NOTICE(from) });
            }
            return false;
        }
        await devtrust.sendMessage(botNumber, payload);
        console.log(`[viewonce] delivered ${entry.type} (${found.source}) on reply ${m.key.id}`);
        return true;
    } catch (err) {
        global._viewOnceHandledIds.delete(m.key.id);
        console.error('[viewonce] reply delivery failed:', err?.message);
        return false;
    }
}

module.exports = {
    unwrapViewOnce,
    captureViewOnce,
    buildPayload,
    pendingViewOnceReply,
    deliverViewOnceOnReply,
    resolveViewOnceForReply,
    MAX_ENTRIES,
    TTL_MS,
    MAX_BYTES,
    NOTICE_TTL_MS
};
