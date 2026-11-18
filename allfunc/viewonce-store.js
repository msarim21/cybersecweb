'use strict';
// Looks up a view-once message in the antidelete cache (memory + disk + Mongo),
// which already saves every incoming media file. This is what lets a reply work
// even after the bot restarted / redeployed since the photo arrived.
const fs = require('fs');

function makeStoredLookup(sock) {
    return async function lookupStored(msgId) {
        let H;
        try { H = require('./antidelete-helpers'); } catch (_) { return null; }
        const botNum = H._adResolveBotNum(sock);
        const session = botNum && H.getAntideleteSession(botNum);
        if (!session) return null;
        // Media may still be downloading in the background — wait briefly.
        const job = global._adPrefetchPromises?.get(`${botNum}::${msgId}`);
        if (job) { try { await Promise.race([job, new Promise(r => setTimeout(r, 8000))]); } catch (_) {} }
        const hit = session.findByMsgId(msgId);
        const e = hit?.entry;
        if (!e) return null;
        const kind = e.mediaType || '';
        const type = kind === 'image' ? 'imageMessage'
            : (kind === 'video' || kind === 'ptv') ? 'videoMessage'
            : kind === 'audio' ? 'audioMessage' : null;
        if (!type) return null;
        let buffer = null;
        if (e.mediaPath && e.mediaPath !== '__redownload__' && fs.existsSync(e.mediaPath)) {
            try { buffer = fs.readFileSync(e.mediaPath); } catch (_) {}
        }
        if (!buffer?.length && e.mediaBufferB64) {
            try { buffer = Buffer.from(e.mediaBufferB64, 'base64'); } catch (_) {}
        }
        if (!buffer?.length && typeof H._adRedownloadMedia === 'function') {
            const info = H._adResolveMediaInfo(e);
            if (info) { try { buffer = await H._adRedownloadMedia(info.raw, info.mtype, info.protoMsg); } catch (_) {} }
        }
        return {
            // Prefer the explicit boolean stored since the view-once fix; the
            // content-prefix regex stays as a fallback for entries cached
            // before the boolean existed.
            isViewOnce: Boolean(e.isViewOnce) || /View Once/i.test(String(e.content || '')),
            type,
            mime: e.rawMediaMsg?.mimetype || '',
            caption: e.rawMediaMsg?.caption || '',
            isPtt: Boolean(e.isPtt),
            buffer: buffer?.length ? buffer : null,
        };
    };
}

module.exports = { makeStoredLookup };
