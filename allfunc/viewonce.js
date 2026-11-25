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

const MAX_ENTRIES = 50;
const TTL_MS = 60 * 60 * 1000;
const MAX_BYTES = 25 * 1024 * 1024;
const NOTICE_TTL_MS = 24 * 60 * 60 * 1000;
const VIEWONCE_BLOCKED_NOTICE = (from) => `⚠️ *One-time photo save nahi ho sakti*\n👤 From: @${from}\n\nWhatsApp ab one-time photo/video sirf phone par bhejta hai — bot (linked device) ko sirf khali nishaan milta hai, photo nahi. Ye WhatsApp ki taraf se band hai, bot is ko nahi khol sakta.`;

// One-line reason appended to the blocked notice so the owner can tell "WhatsApp
// blocked it" apart from "photo too old / bot restarted / download failed".
// Reasons: server-gone (404/410 from WhatsApp CDN), download-failed (other error),
// capture-failed (no bytes at delivery time), no-keys (quoted media has no keys),
// expired (nothing found anywhere — too old, evicted, or never captured).
function viewOnceReasonText(reason, detail) {
    switch (reason) {
        case 'server-gone': return 'Wajah: WhatsApp server se media khatam ho chuki hai — photo khul chuki hai ya expire ho gayi.';
        case 'download-failed': return `Wajah: download fail hua${detail ? ` (${detail})` : ''}.`;
        case 'capture-failed': return `Wajah: photo aate waqt hi media nahi mila${detail ? ` (${detail})` : ''} — WhatsApp ne bot ko bytes diye hi nahi.`;
        case 'no-keys': return 'Wajah: is photo ki media key bot ko mili hi nahi — WhatsApp linked device ko sirf khali nishaan bhejta hai.';
        case 'expired': return 'Wajah: photo ka capture ab nahi hai — buhat purani hai, ya bot restart hua tha.';
        default: return '';
    }
}

function _defaultType(obj) {
    return obj && typeof obj === 'object' ? Object.keys(obj)[0] : null;
}

// Unwrap every view-once wrapper WhatsApp uses. Returns { type, inner } or null.
//
// Wrappers can NEST: in a disappearing-message chat a one-time photo arrives as
// ephemeralMessage -> viewOnceMessageV2 -> imageMessage, and a quoted copy can
// carry the same nesting. So peel containers one layer at a time (same set the
// antidelete unwrapper handles) and remember whether any layer was view-once —
// a bare media message only counts when it is wrapped or itself flagged viewOnce.
function unwrapViewOnce(message, getContentType) {
    if (!message || typeof message !== 'object') return null;
    const gt = typeof getContentType === 'function' ? getContentType : _defaultType;
    let node = message;
    let sawViewOnce = false;
    for (let i = 0; i < 10 && node && typeof node === 'object'; i++) {
        const vo = node.viewOnceMessage?.message
            || node.viewOnceMessageV2?.message
            || node.viewOnceMessageV2Extension?.message;
        if (vo) {
            sawViewOnce = true;
            node = vo;
            continue;
        }
        const container = node.ephemeralMessage?.message
            || node.documentWithCaptionMessage?.message
            || node.editedMessage?.message;
        if (container) {
            node = container;
            continue;
        }
        break;
    }
    if (!node || typeof node !== 'object') return null;
    const type = gt(node) || _defaultType(node);
    const inner = type ? node[type] : null;
    if (!inner || typeof inner !== 'object') return null;
    if (!sawViewOnce && !inner.viewOnce) return null;
    return { type, inner };
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
//
// pair.js fires this twice per message — once before the subscription guard and
// once (awaited) in the message loop — so in-flight attempts are deduped by
// message id and both callers share a single download.
async function captureViewOnce(rawMsg, opts = {}) {
    const { getContentType } = opts;
    const message = rawMsg?.message;
    const found = unwrapViewOnce(message, getContentType);
    if (!found || !rawMsg?.key?.id) return null;
    if (!global._viewOnceCaptureInflight) global._viewOnceCaptureInflight = new Map();
    const inflight = global._viewOnceCaptureInflight;
    const existing = inflight.get(rawMsg.key.id);
    if (existing) return existing;
    const job = _captureViewOnceInner(rawMsg, found, opts);
    inflight.set(rawMsg.key.id, job);
    try { return await job; } finally { inflight.delete(rawMsg.key.id); }
}

async function _captureViewOnceInner(rawMsg, found, opts = {}) {
    const { download } = opts;
    const { bufferMap, last } = _ensureGlobals();
    const rawJid = rawMsg.key.remoteJid || '';
    const chat = /:\d+@/.test(rawJid) ? rawJid.replace(/:\d+@/, '@') : rawJid;
    // Diagnostic: log exactly which download keys WhatsApp served. A linked-device
    // view-once stub carries NONE of these — that one line tells live logs apart
    // from every other failure mode (network, revoked, oversized).
    const _inner = found.inner || {};
    console.log(`[viewonce] capture ${found.type} id=${rawMsg.key.id} keys: mediaKey=${Boolean(_inner.mediaKey)} directPath=${Boolean(_inner.directPath)} url=${Boolean(_inner.url)}`);
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
        captureError: null,
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
            // Kept on the entry so the reply path can tell the owner WHY the
            // photo was never captured, instead of a generic "blocked" notice.
            entry.captureError = err?.message || String(err);
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

// Peel non-view-once container wrappers (ephemeral / documentWithCaption /
// edited) so a stripped quote can still be recognised as media. View-once
// wrappers are NOT peeled here — unwrapViewOnce already handles those.
function _peelContainers(node) {
    let cur = node;
    for (let i = 0; i < 3 && cur && typeof cur === 'object'; i++) {
        const inner = cur.ephemeralMessage?.message
            || cur.documentWithCaptionMessage?.message
            || cur.editedMessage?.message;
        if (!inner) break;
        cur = inner;
    }
    return cur;
}

// Find the media for a reply. Order: in-memory capture -> stored copy (antidelete
// cache, survives restarts) -> the media keys the phone puts in the quoted reply.
// Returns { entry, source, reason?, detail? } or null when the quoted message is
// not view-once. When no buffer is found anywhere, `reason` says WHY (see
// viewOnceReasonText) — never a silent null, never a generic error.
async function resolveViewOnceForReply(m, opts = {}) {
    const { download, lookupStored, getContentType } = opts;
    if (!m?.key?.id) return null;
    const quotedId = _quotedId(m);
    if (!quotedId) return null;
    if (global._viewOnceHandledIds?.has(m.key.id)) return null;

    // Enforce the TTL here too — _prune used to run only when a NEW view-once
    // arrived, so a stale entry could linger and be served long past its TTL.
    const { bufferMap } = _ensureGlobals();
    _prune(bufferMap, Date.now());

    const memEntry = global._viewOnceBufferMap?.get(quotedId) || null;
    const quotedVo = unwrapViewOnce(_quotedRaw(m), getContentType);
    let stored = null;
    if (typeof lookupStored === 'function') {
        try { stored = await lookupStored(quotedId); } catch (_) { stored = null; }
    }

    // The quoted copy may arrive wrapper-stripped (no viewOnce flag at all) — a
    // media-typed quote with ZERO media keys is the signature of a stripped
    // view-once quote, since ordinary media quotes always carry keys. Without
    // this, a reply whose capture expired AND whose quote was stripped AND whose
    // stored entry lost its label was silently ignored with no notice at all.
    const peeledQuoted = _peelContainers(_quotedRaw(m));
    const quotedMediaType = quotedVo?.type
        || (peeledQuoted?.imageMessage ? 'imageMessage'
            : peeledQuoted?.videoMessage ? 'videoMessage'
            : peeledQuoted?.audioMessage ? 'audioMessage' : null);
    const quotedInner = quotedVo?.inner || (quotedMediaType ? peeledQuoted[quotedMediaType] : null);
    const quotedHasNoKeys = Boolean(quotedMediaType) && quotedInner
        && !quotedInner.mediaKey && !quotedInner.directPath && !quotedInner.url;

    const isViewOnce = Boolean(memEntry || quotedVo || stored?.isViewOnce || quotedHasNoKeys);
    if (!isViewOnce) return null;

    const base = memEntry || {
        type: quotedVo?.type || quotedMediaType || stored?.type || 'imageMessage',
        mime: quotedVo?.inner?.mimetype || quotedInner?.mimetype || stored?.mime || '',
        caption: quotedVo?.inner?.caption || quotedInner?.caption || stored?.caption || '',
        isPtt: Boolean(quotedVo?.inner?.ptt || quotedInner?.ptt || stored?.isPtt),
        sender: String(m.quoted?.sender || '').split('@')[0],
        chat: m.chat,
        msg: quotedVo ? { [quotedVo.type]: quotedVo.inner }
            : (quotedMediaType && quotedInner ? { [quotedMediaType]: quotedInner } : null),
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
    let lastDownloadError = null;
    let lastDownloadStatus = null;
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
                // Kept (not swallowed) so the failure reason can name the real
                // cause — a 404/410 means WhatsApp's server no longer has it.
                lastDownloadError = err;
                lastDownloadStatus = err?.output?.statusCode || err?.statusCode || err?.status || null;
                console.log('[viewonce] quoted download failed:', err?.message);
            }
        }
    }

    // No buffer from any source — work out WHY so the notice tells the truth.
    let reason = 'expired';
    let detail = '';
    if (lastDownloadStatus === 404 || lastDownloadStatus === 410) {
        reason = 'server-gone';
    } else if (lastDownloadError) {
        reason = 'download-failed';
        detail = lastDownloadError.message || '';
    } else if (memEntry && !memEntry.buffer) {
        reason = 'capture-failed';
        detail = memEntry.captureError || '';
    } else if (stored && !stored.buffer) {
        reason = 'capture-failed';
    } else if (quotedHasNoKeys) {
        reason = 'no-keys';
    }
    console.log(`[viewonce] reply ${m.key.id} quotes view-once ${quotedId} but no media found (mem=${Boolean(memEntry)} stored=${Boolean(stored)} quotedKeys=${Boolean(quotedVo?.inner?.mediaKey)} reason=${reason})`);
    return { entry: base, source: 'none', reason, detail };
}

// Tell the owner a one-time photo could not be saved (WhatsApp never served the
// media to this linked device, or it was already opened). Sent ONCE per photo —
// the reply path, .vv and the emoji handler all share this dedup map, so the
// owner never gets the same notice twice for one photo. Returns true when sent.
// `reason`/`detail` (see viewOnceReasonText) append one honest line naming the
// actual cause instead of blaming the linked-device block for everything.
async function sendViewOnceBlockedNotice(sock, botNumber, quotedId, from, reason, detail) {
    if (!sock || !botNumber) return false;
    if (!global._viewOnceNoticeIds) global._viewOnceNoticeIds = new Map();
    const now = Date.now();
    for (const [k, t] of global._viewOnceNoticeIds) {
        if (now - t > NOTICE_TTL_MS) global._viewOnceNoticeIds.delete(k);
    }
    if (quotedId && global._viewOnceNoticeIds.has(quotedId)) return false;
    if (quotedId) global._viewOnceNoticeIds.set(quotedId, now);
    const reasonLine = reason ? viewOnceReasonText(reason, detail) : '';
    const text = VIEWONCE_BLOCKED_NOTICE(from || '') + (reasonLine ? `\n\n${reasonLine}` : '');
    try {
        await sock.sendMessage(botNumber, { text });
        return true;
    } catch (err) {
        console.log('[viewonce] blocked notice failed:', err?.message);
        return false;
    }
}

// Deliver a view-once to the bot's own chat when the user replies under it.
// Returns true when sent. opts.silent (.vv2 / readviewonce2) suppresses the
// blocked notice — previously the reply path sent it anyway, defeating .vv2.
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
            // No bytes from any source. Say WHY (found.reason) ONCE per photo —
            // never spam the owner's chat on every emoji/text reply, and never
            // blame the linked-device block when the real cause is expiry or a
            // failed download. Silent mode (.vv2) sends nothing at all.
            if (!opts.silent) {
                await sendViewOnceBlockedNotice(devtrust, botNumber, _quotedId(m), from, found.reason, found.detail);
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

// Commands owned by the unified save handler (case.js switch). The reply path
// (deliverViewOnceOnReply) skips these so the handler owns their UX.
// Two families share the handler:
//  • Legacy aliases (keep/lol/nice/rvo/vvgh/vv2/readviewonce2): media to the
//    bot's own DM with NO caption, ⏳/❤️/❌ reactions (unchanged behaviour).
//  • Pasted save.js family (save/vv/vvdm/viewonce, 26 Nov 2026 — owner-only,
//    gated in case.js): vv/viewonce send to the SAME CHAT with the quoted
//    caption, save/vvdm send to the sender's DM; working react 💾 (save) / ⏳,
//    ✅ on success; save also forwards a text quote as text to the DM.
// '🔥' is deliberately NOT here — it belongs to the emoji view-once handler.
const SAVE_COMMANDS = ['vv', 'vvgh', 'vv2', 'readviewonce2', 'keep', 'lol', 'nice', 'rvo', 'viewonce', 'save', 'vvdm'];

// Send payload for the save handler. Legacy aliases send a bare save (NO
// caption); the pasted save.js family passes opts.caption and it is included
// for image/video/document. Document support (with fileName) comes from the
// pasted code — previously documents were rejected. Returns null when there
// is nothing sendable.
function buildSavePayload(type, buffer, mime, isPtt, opts = {}) {
    if (!Buffer.isBuffer(buffer) || !buffer.length) return null;
    const caption = typeof opts.caption === 'string' && opts.caption ? opts.caption : '';
    if (type === 'imageMessage') return { image: buffer, mimetype: mime || 'image/jpeg', ...(caption ? { caption } : {}) };
    if (type === 'videoMessage') return { video: buffer, mimetype: mime || 'video/mp4', ...(caption ? { caption } : {}) };
    if (type === 'audioMessage') return { audio: buffer, mimetype: mime || 'audio/ogg; codecs=opus', ptt: Boolean(isPtt) };
    if (type === 'stickerMessage') return { sticker: buffer };
    if (type === 'documentMessage') {
        return { document: buffer, mimetype: mime || 'application/octet-stream', fileName: opts.fileName || 'document', ...(caption ? { caption } : {}) };
    }
    return null;
}

// Unified save command (.vv / .keep / .lol / .nice / .rvo / .viewonce / .vv2
// + the pasted save.js family: save / vvdm).
// Reply to any media and it is saved — WHERE depends on the command:
//  • Legacy aliases (keep/lol/nice/rvo/vvgh/vv2/readviewonce2): the bot's own
//    DM with NO caption (unchanged behaviour).
//  • save/vvdm (pasted code): the sender's DM, WITH the quoted caption.
//  • vv/viewonce (pasted code): the SAME CHAT, WITH the quoted caption.
//  • save with a text quote: the text goes to the sender's DM.
//
// Two paths, because WhatsApp treats them differently:
//  A. View-once: a quoted view-once carries NO media keys, so it can never be
//     re-downloaded — the ONLY source is the arrival-time capture store
//     (resolveViewOnceForReply: memory -> stored copy -> quoted keys). When no
//     bytes exist anywhere, the shared blocked notice names the real reason.
//     This is the part the pasted code alone cannot do: its quoted.download()
//     + getStoredMessage fallback is exactly resolveViewOnceForReply's job here
//     (the bot's stored lookup is the getStoredMessage equivalent), so the
//     capture system is kept, not replaced.
//  B. Regular media: the quote still carries keys, so download it straight
//     from the quote (m.quoted.download(), falling back to downloadContentFromMessage)
//     and forward it.
// Reactions: ⏳ (💾 for save) while working, ❤️ (✅ for the pasted family) on
// success, ❌ on failure. The silent variants (.vv2 / .readviewonce2) send no
// text and no reactions at all.
// Options (set by case.js): dest ('bot' | 'sender' | 'chat'), withCaption,
// allowText, workingReact, successReact, noQuoteText.
// Returns { handled, source?, reason? } so tests (and callers) can tell the
// paths apart without parsing chat output.
async function handleSaveCommand(ctx = {}) {
    const { sock, m, botNumber, command, download, lookupStored, reply } = ctx;
    const silent = command === 'vv2' || command === 'readviewonce2';
    const dest = ctx.dest || 'bot';
    const withCaption = Boolean(ctx.withCaption);
    const allowText = Boolean(ctx.allowText);
    const workingReact = ctx.workingReact || '⏳';
    const successReact = ctx.successReact || '❤️';
    const noQuoteText = ctx.noQuoteText || '❗ Reply to a media message.';
    const destJid = dest === 'sender' ? String(m?.sender || '')
        : dest === 'chat' ? String(m?.chat || '') : botNumber;
    const say = async (text) => {
        if (!silent && typeof reply === 'function') { try { await reply(text); } catch (_) {} }
    };
    const react = async (emoji) => {
        if (silent || !sock || !m?.key) return;
        try { await sock.sendMessage(m.chat, { react: { text: emoji, key: m.key } }); } catch (_) {}
    };
    try {
        _ensureGlobals();
        // The reply path (or pair.js) already served this exact reply — never twice.
        if (m?.key?.id && global._viewOnceHandledIds.has(m.key.id)) {
            return { handled: false, reason: 'already-handled' };
        }
        if (!m?.quoted) {
            await say(noQuoteText);
            return { handled: false, reason: 'no-quote' };
        }
        await react(workingReact);
        const quotedId = _quotedId(m);
        const from = String(m.quoted?.sender || m.sender || '').split('@')[0];

        // ── Path A: view-once (capture store only — a quote has no keys) ──
        const found = await resolveViewOnceForReply(m, { download, lookupStored });
        if (found) {
            const { entry } = found;
            if (found.source !== 'none' && entry?.buffer?.length) {
                const payload = buildSavePayload(entry.type, entry.buffer, entry.mime, entry.isPtt,
                    { caption: withCaption ? (entry.caption || '') : '' });
                if (payload) {
                    await sock.sendMessage(destJid, payload);
                    global._viewOnceHandledIds.set(m.key.id, Date.now());
                    console.log(`[viewonce] save delivered ${entry.type} (${found.source}) on ${command} ${m.key.id}`);
                    await react(successReact);
                    return { handled: true, source: found.source };
                }
                await react('❌');
                await say('❌ Error saving media.');
                return { handled: false, reason: 'unsupported-type' };
            }
            // Bytes gone from every source — name the real cause, once per photo.
            if (!silent) await sendViewOnceBlockedNotice(sock, botNumber, quotedId, from, found.reason, found.detail);
            await react('❌');
            return { handled: false, reason: found.reason || 'expired' };
        }

        // ── Path B: regular quoted media — download from the quote ──
        let qType = m.quoted?.mtype || '';
        if (!qType) {
            const peeled = _peelContainers(_quotedRaw(m));
            qType = peeled?.imageMessage ? 'imageMessage'
                : peeled?.videoMessage ? 'videoMessage'
                : peeled?.audioMessage ? 'audioMessage'
                : peeled?.stickerMessage ? 'stickerMessage'
                : peeled?.documentMessage ? 'documentMessage' : '';
        }
        // Pasted save.js: .save with a text quote forwards the text to the DM.
        if (allowText && ['conversation', 'extendedTextMessage'].includes(m.quoted?.mtype) && m.quoted?.text) {
            await sock.sendMessage(destJid, { text: m.quoted.text }, { quoted: m });
            global._viewOnceHandledIds.set(m.key.id, Date.now());
            console.log(`[viewonce] save delivered text on ${command} ${m.key.id}`);
            await react(successReact);
            return { handled: true, source: 'text' };
        }
        if (!['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage', 'documentMessage'].includes(qType)) {
            await react('❌');
            await say('❗ Only images, videos, audio, stickers, or documents.');
            return { handled: false, reason: 'not-media' };
        }
        let buffer = null;
        if (typeof m.quoted.download === 'function') {
            try { const b = await m.quoted.download(); if (Buffer.isBuffer(b) && b.length) buffer = b; } catch (_) {}
        }
        if (!buffer && typeof download === 'function') {
            try {
                // smsg already unwrapped the quote to the inner media object.
                const stream = await download(m.quoted, qType.replace('Message', ''));
                const buf = await _readStream(stream);
                if (buf.length) buffer = buf;
            } catch (err) { console.log('[viewonce] save download failed:', err?.message); }
        }
        if (!buffer) {
            await react('❌');
            await say('❌ Failed to download media.');
            return { handled: false, reason: 'download-failed' };
        }
        const caption = withCaption ? (m.quoted?.msg?.caption || m.quoted?.caption || '') : '';
        const payload = buildSavePayload(qType, buffer, m.quoted?.mimetype || '', m.quoted?.ptt,
            { caption, fileName: m.quoted?.msg?.fileName || 'document' });
        if (!payload) {
            await react('❌');
            await say('❌ Failed to download media.');
            return { handled: false, reason: 'download-failed' };
        }
        await sock.sendMessage(destJid, payload);
        global._viewOnceHandledIds.set(m.key.id, Date.now());
        console.log(`[viewonce] save delivered ${qType} (quoted) on ${command} ${m.key.id}`);
        await react(successReact);
        return { handled: true, source: 'quoted' };
    } catch (err) {
        console.error('Save VV Error:', err?.message);
        await react('❌');
        await say('❌ Error saving media.');
        return { handled: false, reason: 'error' };
    }
}

module.exports = {
    unwrapViewOnce,
    captureViewOnce,
    buildPayload,
    buildSavePayload,
    handleSaveCommand,
    SAVE_COMMANDS,
    pendingViewOnceReply,
    deliverViewOnceOnReply,
    resolveViewOnceForReply,
    sendViewOnceBlockedNotice,
    viewOnceReasonText,
    VIEWONCE_BLOCKED_NOTICE,
    MAX_ENTRIES,
    TTL_MS,
    MAX_BYTES,
    NOTICE_TTL_MS
};
