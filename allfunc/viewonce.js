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

// The reply that must be served: any message quoting a captured view-once id.
// Returns the entry, or null when this reply is not one to deliver.
function pendingViewOnceReply(m) {
    if (!m?.quoted || !m?.key?.id) return null;
    if (!global._viewOnceBufferMap?.size) return null;
    const quotedId = m.quoted.id || m.msg?.contextInfo?.stanzaId || null;
    if (!quotedId || !global._viewOnceBufferMap.has(quotedId)) return null;
    if (global._viewOnceHandledIds?.has(m.key.id)) return null;
    return global._viewOnceBufferMap.get(quotedId);
}

// Deliver a captured view-once to the bot's own chat. Returns true when sent.
async function deliverViewOnceOnReply(devtrust, m, botNumber, opts = {}) {
    const entry = pendingViewOnceReply(m);
    if (!entry) return false;

    const { download } = opts;
    try {
        // The capture may have failed (revoked too fast) — retry once from the
        // stored message reference before giving up.
        if (!entry.buffer?.length && entry.type && entry.msg?.[entry.type] && typeof download === 'function') {
            const stream = await download(entry.msg[entry.type], entry.type.replace('Message', ''));
            const chunks = [];
            for await (const chunk of stream) chunks.push(chunk);
            const buf = Buffer.concat(chunks);
            if (buf.length) entry.buffer = buf;
        }

        const time = new Date().toLocaleString('en-US', {
            timeZone: process.env.TIMEZONE || 'Africa/Harare', hour12: true,
            hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric'
        });
        const from = entry.sender || String(m.quoted?.sender || m.sender || '').split('@')[0];
        const chatLabel = String(entry.chat || m.chat).includes('g.us') ? 'Group' : 'Private';
        const caption = `🔐 *View-Once Saved!*\n👤 From: @${from}\n💬 Chat: ${chatLabel}\n🕒 ${time}`
            + (entry.caption ? `\n\n📝 ${entry.caption}` : '');

        const payload = buildPayload(entry, caption);
        if (!payload) {
            console.log('[viewonce] reply matched a view-once but no buffer was captured');
            return false;
        }

        await devtrust.sendMessage(botNumber, payload);
        // Mark only after a real send so .vv / the emoji path can still retry a failure.
        global._viewOnceHandledIds.set(m.key.id, Date.now());
        console.log(`[viewonce] delivered ${entry.type} on reply ${m.key.id}`);
        return true;
    } catch (err) {
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
    MAX_ENTRIES,
    TTL_MS,
    MAX_BYTES
};
