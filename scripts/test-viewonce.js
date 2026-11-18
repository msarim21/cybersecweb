#!/usr/bin/env node
'use strict';
// Offline checks for view-once ("one time") media capture + reply delivery.
// No WhatsApp connection and no node_modules needed: allfunc/viewonce.js takes
// the downloader as an argument, so a fake stream stands in for the real one.
const assert = require('assert');
const vo = require('../allfunc/viewonce');

let failed = 0;
function ok(name, fn) {
    try {
        const r = fn();
        if (r && typeof r.then === 'function') return r.then(
            () => console.log('  \u2713', name),
            (e) => { failed++; console.log('  \u2717', name, '\n   ', e.message); }
        );
        console.log('  \u2713', name);
    } catch (e) {
        failed++;
        console.log('  \u2717', name, '\n   ', e.message);
    }
    return Promise.resolve();
}

function resetGlobals() {
    global._viewOnceBufferMap = undefined;
    global._lastViewOnce = undefined;
    global._viewOnceHandledIds = undefined;
    global._viewOnceNoticeIds = undefined;
    global._viewOnceCaptureInflight = undefined;
}

// A fake Baileys downloader: returns the given bytes as one async-iterable chunk.
function fakeDownload(bytes) {
    return async () => ({
        [Symbol.asyncIterator]() {
            let done = false;
            return {
                next: async () => (done
                    ? { done: true, value: undefined }
                    : (done = true, { done: false, value: bytes }))
            };
        }
    });
}

const failingDownload = async () => { throw new Error('media revoked'); };

function voImageMessage(caption) {
    return {
        viewOnceMessageV2: {
            message: {
                imageMessage: { url: 'x', mimetype: 'image/jpeg', caption: caption || '', viewOnce: true }
            }
        }
    };
}

function rawMsg(id, remoteJid, message, participant) {
    return { key: { id, remoteJid, participant: participant || remoteJid }, message };
}

const CHAT = '923001112222@s.whatsapp.net';
const BOT = '920000000001@s.whatsapp.net';

console.log('\n=== View-once capture / reply tests ===\n');

(async () => {
    await ok('viewOnceMessageV2 image is detected', () => {
        const f = vo.unwrapViewOnce(voImageMessage('hi'));
        assert.strictEqual(f.type, 'imageMessage');
        assert.strictEqual(f.inner.mimetype, 'image/jpeg');
    });

    await ok('plain imageMessage with viewOnce:true is detected', () => {
        const f = vo.unwrapViewOnce({ imageMessage: { viewOnce: true, mimetype: 'image/png' } });
        assert.strictEqual(f.type, 'imageMessage');
    });

    await ok('a normal (not one-time) photo is NOT captured', () => {
        assert.strictEqual(vo.unwrapViewOnce({ imageMessage: { mimetype: 'image/jpeg' } }), null);
    });

    await ok('a text message is NOT captured', () => {
        assert.strictEqual(vo.unwrapViewOnce({ conversation: 'hello' }), null);
    });

    await ok('capture stores the buffer under the message id', async () => {
        resetGlobals();
        const e = await vo.captureViewOnce(rawMsg('VO1', CHAT, voImageMessage('secret')), {
            download: fakeDownload(Buffer.from('IMGDATA'))
        });
        assert.strictEqual(e.buffer.toString(), 'IMGDATA');
        assert.ok(global._viewOnceBufferMap.has('VO1'), 'buffer map missing the id');
        assert.strictEqual(global._lastViewOnce[CHAT], e, '_lastViewOnce not updated');
        assert.strictEqual(e.type, 'imageMessage');
        assert.strictEqual(e.chat, CHAT);
    });

    await ok('capture keeps the entry when the download fails', async () => {
        resetGlobals();
        const e = await vo.captureViewOnce(rawMsg('VO2', CHAT, voImageMessage()), { download: failingDownload });
        assert.strictEqual(e.buffer, null, 'buffer should stay empty');
        assert.ok(global._viewOnceBufferMap.has('VO2'), 'entry must survive a failed download');
    });

    await ok('a buffer over 25 MB is not kept in memory', async () => {
        resetGlobals();
        const big = Buffer.alloc(vo.MAX_BYTES + 10, 7);
        const e = await vo.captureViewOnce(rawMsg('VO3', CHAT, voImageMessage()), { download: fakeDownload(big) });
        assert.strictEqual(e.buffer, null, 'oversized buffer must be dropped');
    });

    await ok('buffer map is capped so memory cannot grow forever', async () => {
        resetGlobals();
        for (let i = 0; i < vo.MAX_ENTRIES + 25; i++) {
            await vo.captureViewOnce(rawMsg('M' + i, CHAT, voImageMessage()), { download: fakeDownload(Buffer.from('x')) });
        }
        assert.ok(global._viewOnceBufferMap.size <= vo.MAX_ENTRIES,
            `map grew to ${global._viewOnceBufferMap.size}, cap is ${vo.MAX_ENTRIES}`);
    });

    await ok('a reply under the one-time photo is picked up', async () => {
        resetGlobals();
        await vo.captureViewOnce(rawMsg('VO4', CHAT, voImageMessage()), { download: fakeDownload(Buffer.from('IMG')) });
        const m = { key: { id: 'REPLY1' }, chat: CHAT, quoted: { id: 'VO4', sender: '923001112222@s.whatsapp.net' } };
        assert.strictEqual(vo.pendingViewOnceReply(m)?.type, 'imageMessage');
    });

    await ok('a reply under an unknown message is ignored', async () => {
        resetGlobals();
        await vo.captureViewOnce(rawMsg('VO5', CHAT, voImageMessage()), { download: fakeDownload(Buffer.from('IMG')) });
        const m = { key: { id: 'REPLY2' }, chat: CHAT, quoted: { id: 'NOPE' } };
        assert.strictEqual(vo.pendingViewOnceReply(m), null);
    });

    await ok('a message with no quote is ignored', async () => {
        resetGlobals();
        await vo.captureViewOnce(rawMsg('VO6', CHAT, voImageMessage()), { download: fakeDownload(Buffer.from('IMG')) });
        assert.strictEqual(vo.pendingViewOnceReply({ key: { id: 'R3' }, chat: CHAT }), null);
    });

    await ok('replying sends the photo to the bot chat', async () => {
        resetGlobals();
        await vo.captureViewOnce(rawMsg('VO7', CHAT, voImageMessage('note')), { download: fakeDownload(Buffer.from('IMG')) });
        const sent = [];
        const sock = { sendMessage: async (jid, p) => sent.push({ jid, p }) };
        const m = { key: { id: 'REPLY7' }, chat: CHAT, sender: '923001112222@s.whatsapp.net', quoted: { id: 'VO7' } };
        const done = await vo.deliverViewOnceOnReply(sock, m, BOT);
        assert.strictEqual(done, true, 'delivery reported failure');
        assert.strictEqual(sent.length, 1, 'expected exactly one send');
        assert.strictEqual(sent[0].jid, BOT, 'must go to the bot chat');
        assert.strictEqual(sent[0].p.image.toString(), 'IMG');
        assert.ok(sent[0].p.caption.includes('View-Once Saved!'), 'caption missing');
        assert.ok(sent[0].p.caption.includes('note'), 'original caption missing');
    });

    await ok('the same reply is never delivered twice', async () => {
        resetGlobals();
        await vo.captureViewOnce(rawMsg('VO8', CHAT, voImageMessage()), { download: fakeDownload(Buffer.from('IMG')) });
        const sent = [];
        const sock = { sendMessage: async (jid, p) => sent.push({ jid, p }) };
        const m = { key: { id: 'REPLY8' }, chat: CHAT, sender: '923001112222@s.whatsapp.net', quoted: { id: 'VO8' } };
        await vo.deliverViewOnceOnReply(sock, m, BOT);
        const again = await vo.deliverViewOnceOnReply(sock, m, BOT);
        assert.strictEqual(again, false, 'second call must not re-send');
        assert.strictEqual(sent.length, 1, `expected 1 send, got ${sent.length}`);
    });

    await ok('a video reply is sent as a video', async () => {
        resetGlobals();
        const msg = { viewOnceMessageV2: { message: { videoMessage: { mimetype: 'video/mp4', viewOnce: true } } } };
        await vo.captureViewOnce(rawMsg('VO9', CHAT, msg), { download: fakeDownload(Buffer.from('VID')) });
        const sent = [];
        const sock = { sendMessage: async (jid, p) => sent.push(p) };
        await vo.deliverViewOnceOnReply(sock, { key: { id: 'R9' }, chat: CHAT, quoted: { id: 'VO9' } }, BOT);
        assert.strictEqual(sent[0].video.toString(), 'VID');
        assert.strictEqual(sent[0].mimetype, 'video/mp4');
    });

    await ok('a voice reply is sent as audio with ptt', async () => {
        resetGlobals();
        const msg = { viewOnceMessageV2Extension: { message: { audioMessage: { mimetype: 'audio/ogg; codecs=opus', ptt: true, viewOnce: true } } } };
        await vo.captureViewOnce(rawMsg('VO10', CHAT, msg), { download: fakeDownload(Buffer.from('AUD')) });
        const sent = [];
        const sock = { sendMessage: async (jid, p) => sent.push(p) };
        await vo.deliverViewOnceOnReply(sock, { key: { id: 'R10' }, chat: CHAT, quoted: { id: 'VO10' } }, BOT);
        assert.strictEqual(sent[0].audio.toString(), 'AUD');
        assert.strictEqual(sent[0].ptt, true);
    });

    await ok('a reply with no media found sends a clear notice, not media', async () => {
        resetGlobals();
        await vo.captureViewOnce(rawMsg('VO11', CHAT, voImageMessage()), { download: failingDownload });
        const sent = [];
        const sock = { sendMessage: async (jid, p) => sent.push(p) };
        const done = await vo.deliverViewOnceOnReply(sock, { key: { id: 'R11' }, chat: CHAT, quoted: { id: 'VO11' } }, BOT, { download: failingDownload });
        assert.strictEqual(done, false);
        assert.strictEqual(sent.length, 1);
        assert.ok(!sent[0].image && sent[0].text.includes('One-time photo'));
    });

    await ok('after a bot restart, a reply still delivers from the stored copy', async () => {
        resetGlobals(); // memory empty, like a fresh deploy
        const sent = [];
        const sock = { sendMessage: async (jid, p) => sent.push({ jid, p }) };
        const lookupStored = async (id) => id === 'OLD1'
            ? { isViewOnce: true, type: 'imageMessage', mime: 'image/jpeg', buffer: Buffer.from('DISK') } : null;
        const done = await vo.deliverViewOnceOnReply(sock, { key: { id: 'R13' }, chat: CHAT, quoted: { id: 'OLD1' } }, BOT, { lookupStored });
        assert.strictEqual(done, true);
        assert.strictEqual(sent[0].jid, BOT);
        assert.strictEqual(sent[0].p.image.toString(), 'DISK');
    });

    await ok('reply downloads from the quoted view-once keys when nothing was stored', async () => {
        resetGlobals();
        const sent = [];
        const sock = { sendMessage: async (jid, p) => sent.push(p) };
        const m = { key: { id: 'R14' }, chat: CHAT, quoted: { id: 'Q14' },
            msg: { contextInfo: { stanzaId: 'Q14', quotedMessage: { imageMessage: { viewOnce: true, mediaKey: 'k', mimetype: 'image/jpeg' } } } } };
        const done = await vo.deliverViewOnceOnReply(sock, m, BOT, { download: fakeDownload(Buffer.from('QIMG')) });
        assert.strictEqual(done, true);
        assert.strictEqual(sent[0].image.toString(), 'QIMG');
    });

    await ok('a reply under a normal (not one-time) photo is ignored', async () => {
        resetGlobals();
        const sent = [];
        const sock = { sendMessage: async (jid, p) => sent.push(p) };
        const lookupStored = async () => ({ isViewOnce: false, type: 'imageMessage', buffer: Buffer.from('X') });
        const m = { key: { id: 'R15' }, chat: CHAT, quoted: { id: 'N15' },
            msg: { contextInfo: { stanzaId: 'N15', quotedMessage: { imageMessage: { mediaKey: 'k' } } } } };
        const done = await vo.deliverViewOnceOnReply(sock, m, BOT, { lookupStored, download: fakeDownload(Buffer.from('X')) });
        assert.strictEqual(done, false);
        assert.strictEqual(sent.length, 0);
    });

    await ok('group chats are labelled Group in the caption', async () => {
        resetGlobals();
        const g = '1234567890-1234567890@g.us';
        await vo.captureViewOnce(rawMsg('VO12', g, voImageMessage()), { download: fakeDownload(Buffer.from('IMG')) });
        const sent = [];
        const sock = { sendMessage: async (jid, p) => sent.push(p) };
        await vo.deliverViewOnceOnReply(sock, { key: { id: 'R12' }, chat: g, quoted: { id: 'VO12' } }, BOT);
        assert.ok(sent[0].caption.includes('Chat: Group'), `caption was: ${sent[0].caption}`);
    });

    await ok('many replies under the same blocked photo send the notice only once', async () => {
        resetGlobals();
        const sent = [];
        const sock = { sendMessage: async (jid, p) => sent.push(p) };
        const quotedMessage = { imageMessage: { viewOnce: true, mimetype: 'image/jpeg' } };
        for (const id of ['RA', 'RB', 'RC']) {
            await vo.deliverViewOnceOnReply(sock, { key: { id }, chat: CHAT, quoted: { id: 'BLK1' },
                msg: { contextInfo: { stanzaId: 'BLK1', quotedMessage } } }, BOT, { download: failingDownload });
        }
        assert.strictEqual(sent.length, 1);
        assert.ok(sent[0].text.includes('WhatsApp'));
    });

    await ok('viewOnceMessage (v1) wrapper is detected', () => {
        const f = vo.unwrapViewOnce({ viewOnceMessage: { message: { imageMessage: { mimetype: 'image/jpeg' } } } });
        assert.strictEqual(f.type, 'imageMessage');
    });

    await ok('viewOnceMessageV2Extension audio is detected', () => {
        const f = vo.unwrapViewOnce({ viewOnceMessageV2Extension: { message: { audioMessage: { mimetype: 'audio/ogg; codecs=opus' } } } });
        assert.strictEqual(f.type, 'audioMessage');
    });

    await ok('ephemeralMessage wrapping viewOnceMessageV2 is detected (disappearing chat)', () => {
        const f = vo.unwrapViewOnce({ ephemeralMessage: { message: voImageMessage('hi') } });
        assert.strictEqual(f.type, 'imageMessage');
        assert.strictEqual(f.inner.mimetype, 'image/jpeg');
    });

    await ok('viewOnceMessageV2 wrapping ephemeralMessage is detected', () => {
        const msg = { viewOnceMessageV2: { message: { ephemeralMessage: { message: { imageMessage: { mimetype: 'image/jpeg' } } } } } };
        assert.strictEqual(vo.unwrapViewOnce(msg).type, 'imageMessage');
    });

    await ok('documentWithCaptionMessage inside a view-once wrapper is detected', () => {
        const msg = { viewOnceMessageV2: { message: { documentWithCaptionMessage: { message: { imageMessage: { mimetype: 'image/jpeg' } } } } } };
        assert.strictEqual(vo.unwrapViewOnce(msg).type, 'imageMessage');
    });

    await ok('ephemeralMessage wrapping a NORMAL photo is NOT view-once', () => {
        const f = vo.unwrapViewOnce({ ephemeralMessage: { message: { imageMessage: { mimetype: 'image/jpeg' } } } });
        assert.strictEqual(f, null);
    });

    await ok('a reply quoting an ephemeral-wrapped view-once is recognised (was silently ignored)', async () => {
        resetGlobals();
        const quotedMessage = { ephemeralMessage: { message: voImageMessage() } };
        const m = { key: { id: 'R16' }, chat: CHAT, quoted: { id: 'EPH1' },
            msg: { contextInfo: { stanzaId: 'EPH1', quotedMessage } } };
        const found = await vo.resolveViewOnceForReply(m, { download: failingDownload });
        assert.ok(found, 'resolve must not return null for an ephemeral-wrapped view-once quote');
        assert.strictEqual(found.source, 'none');
        assert.strictEqual(found.entry.type, 'imageMessage');
    });

    await ok('the shared blocked notice sends once per photo across callers', async () => {
        resetGlobals();
        const sent = [];
        const sock = { sendMessage: async (jid, p) => sent.push({ jid, p }) };
        assert.strictEqual(await vo.sendViewOnceBlockedNotice(sock, BOT, 'PH1', '923001112222'), true);
        assert.strictEqual(await vo.sendViewOnceBlockedNotice(sock, BOT, 'PH1', '923001112222'), false, 'same photo must not re-send');
        assert.strictEqual(await vo.sendViewOnceBlockedNotice(sock, BOT, 'PH2', '923001112222'), true, 'a different photo must send');
        assert.strictEqual(sent.length, 2);
        assert.strictEqual(sent[0].jid, BOT);
        assert.ok(sent[0].p.text.includes('One-time photo'));
        assert.ok(sent[0].p.text.includes('923001112222'));
    });

    // ── Deep-fix regression tests (offline E2E + failure reasons) ──────────

    await ok('END-TO-END: realistic V2 photo captures and delivers on reply (only the network is mocked)', async () => {
        resetGlobals();
        // Real-shaped envelope: every field Baileys' downloader reads.
        const real = {
            viewOnceMessageV2: {
                message: {
                    imageMessage: {
                        url: 'https://mmg.whatsapp.net/d/f/ABC123.enc',
                        directPath: '/d/f/ABC123.enc',
                        mediaKey: Buffer.alloc(32, 9),
                        mimetype: 'image/jpeg',
                        fileSha256: Buffer.alloc(32, 1),
                        fileEncSha256: Buffer.alloc(32, 2),
                        mediaKeyTimestamp: 1794900000,
                        fileLength: 123456,
                        caption: 'real photo',
                        viewOnce: true
                    }
                }
            }
        };
        const photoBytes = Buffer.from('REAL-PHOTO-BYTES');
        const e = await vo.captureViewOnce(rawMsg('E2E1', CHAT, real, '923001112222@s.whatsapp.net'), { download: fakeDownload(photoBytes) });
        assert.strictEqual(e.buffer.toString(), 'REAL-PHOTO-BYTES');
        assert.strictEqual(e.msg.imageMessage.directPath, '/d/f/ABC123.enc', 'envelope must survive in the entry');
        const sent = [];
        const sock = { sendMessage: async (jid, p) => sent.push({ jid, p }) };
        const m = { key: { id: 'R-E2E' }, chat: CHAT, sender: '923001112222@s.whatsapp.net',
            quoted: { id: 'E2E1', sender: '923001112222@s.whatsapp.net' },
            msg: { contextInfo: { stanzaId: 'E2E1', quotedMessage: real } } };
        const done = await vo.deliverViewOnceOnReply(sock, m, BOT, { download: fakeDownload(photoBytes) });
        assert.strictEqual(done, true, 'delivery must succeed from the captured buffer');
        assert.strictEqual(sent.length, 1);
        assert.strictEqual(sent[0].jid, BOT);
        assert.strictEqual(sent[0].p.image.toString(), 'REAL-PHOTO-BYTES');
        assert.ok(sent[0].p.caption.includes('real photo'));
    });

    await ok('a keyless stub capture records the failure and the reply names it', async () => {
        resetGlobals();
        const stubMsg = { viewOnceMessageV2: { message: { imageMessage: { mimetype: 'image/jpeg', viewOnce: true } } } };
        const noKeyDownload = async () => { throw new Error('Cannot derive from empty media key'); };
        const e = await vo.captureViewOnce(rawMsg('STUB1', CHAT, stubMsg), { download: noKeyDownload });
        assert.strictEqual(e.buffer, null);
        assert.ok(e.captureError && e.captureError.includes('empty media key'), 'capture error must be recorded on the entry');
        const found = await vo.resolveViewOnceForReply({ key: { id: 'R-STUB' }, chat: CHAT, quoted: { id: 'STUB1' } }, { download: noKeyDownload });
        assert.strictEqual(found.reason, 'capture-failed');
        assert.ok(found.detail.includes('empty media key'));
    });

    await ok('a keyless quoted media message is treated as a stripped view-once quote (no silent skip)', async () => {
        resetGlobals();
        const sent = [];
        const sock = { sendMessage: async (jid, p) => sent.push(p) };
        // No memory entry, no stored entry, quoted image with NO keys and NO viewOnce flag.
        const m = { key: { id: 'R-K' }, chat: CHAT, quoted: { id: 'K1', sender: '923001112222@s.whatsapp.net' },
            msg: { contextInfo: { stanzaId: 'K1', quotedMessage: { imageMessage: { mimetype: 'image/jpeg', caption: '' } } } } };
        const found = await vo.resolveViewOnceForReply(m, {});
        assert.ok(found, 'resolve must not return null for a keyless media quote');
        assert.strictEqual(found.reason, 'no-keys');
        const done = await vo.deliverViewOnceOnReply(sock, m, BOT, {});
        assert.strictEqual(done, false);
        assert.strictEqual(sent.length, 1, 'the notice must be sent instead of silence');
        assert.ok(sent[0].text.includes('media key'), 'notice must name the missing-key cause');
    });

    await ok('.vv2 silent mode sends no notice when the bytes are gone', async () => {
        resetGlobals();
        await vo.captureViewOnce(rawMsg('VO-S', CHAT, voImageMessage()), { download: failingDownload });
        const sent = [];
        const sock = { sendMessage: async (jid, p) => sent.push(p) };
        const done = await vo.deliverViewOnceOnReply(sock, { key: { id: 'R-S' }, chat: CHAT, quoted: { id: 'VO-S' } }, BOT, { download: failingDownload, silent: true });
        assert.strictEqual(done, false);
        assert.strictEqual(sent.length, 0, 'silent mode must send nothing');
    });

    await ok('a 404 from the quoted download is reported as server-gone, not a generic failure', async () => {
        resetGlobals();
        const sent = [];
        const sock = { sendMessage: async (jid, p) => sent.push(p) };
        const boom404 = async () => { const e = new Error('Failed to fetch stream'); e.output = { statusCode: 404 }; throw e; };
        const m = { key: { id: 'R404' }, chat: CHAT, quoted: { id: 'Q404' },
            msg: { contextInfo: { stanzaId: 'Q404', quotedMessage: { imageMessage: { viewOnce: true, mediaKey: 'k', directPath: '/d/x.enc', mimetype: 'image/jpeg' } } } } };
        const found = await vo.resolveViewOnceForReply(m, { download: boom404 });
        assert.ok(found, 'resolve must return an entry');
        assert.strictEqual(found.reason, 'server-gone');
        const done = await vo.deliverViewOnceOnReply(sock, m, BOT, { download: boom404 });
        assert.strictEqual(done, false);
        assert.strictEqual(sent.length, 1);
        assert.ok(sent[0].text.includes('khul chuki'), `notice must say the media is gone from the server, got: ${sent[0].text}`);
    });

    await ok('a stale memory entry is pruned on resolve, not served', async () => {
        resetGlobals();
        await vo.captureViewOnce(rawMsg('OLD9', CHAT, voImageMessage()), { download: fakeDownload(Buffer.from('IMG')) });
        const e = global._viewOnceBufferMap.get('OLD9');
        e.ts = Date.now() - vo.TTL_MS - 1000; // force-expire
        const found = await vo.resolveViewOnceForReply({ key: { id: 'R-OLD' }, chat: CHAT, quoted: { id: 'OLD9' } }, {});
        assert.strictEqual(found, null, 'stale entry must be pruned, not served');
        assert.ok(!global._viewOnceBufferMap.has('OLD9'), 'stale entry must be removed from the map');
    });

    await ok('concurrent captures of the same message download only once', async () => {
        resetGlobals();
        let calls = 0;
        const counting = async () => { calls++; return fakeDownload(Buffer.from('IMG'))(); };
        const [a, b] = await Promise.all([
            vo.captureViewOnce(rawMsg('DEDUP1', CHAT, voImageMessage()), { download: counting }),
            vo.captureViewOnce(rawMsg('DEDUP1', CHAT, voImageMessage()), { download: counting }),
        ]);
        assert.strictEqual(calls, 1, `download ran ${calls} times`);
        assert.strictEqual(a, b, 'both callers must share one capture');
    });

    await ok('group reply resolves with a @lid remoteJidAlt (key match regression)', async () => {
        resetGlobals();
        const g = '120363012345678@g.us';
        await vo.captureViewOnce({ key: { id: 'GRP1', remoteJid: g, remoteJidAlt: '123456789@lid', participant: '923001112222@s.whatsapp.net' }, message: voImageMessage() }, { download: fakeDownload(Buffer.from('GIMG')) });
        const sent = [];
        const sock = { sendMessage: async (jid, p) => sent.push(p) };
        const m = { key: { id: 'R-GRP', remoteJid: g }, chat: g, quoted: { id: 'GRP1' } };
        const done = await vo.deliverViewOnceOnReply(sock, m, BOT);
        assert.strictEqual(done, true);
        assert.strictEqual(sent[0].image.toString(), 'GIMG');
    });

    await ok('stored lookup finds a view-once entry via the real antidelete store (boolean flag, @lid alias)', async () => {
        resetGlobals();
        const { getAntideleteSession } = require('../allfunc/antidelete-session');
        const { makeStoredLookup } = require('../allfunc/viewonce-store');
        const BOTNUM = '920000000001';
        const session = getAntideleteSession(BOTNUM);
        session.set('923001112222@s.whatsapp.net', 'STORE1', {
            content: 'photo', // NOTE: no '🔒 View Once — ' prefix — the boolean must carry it
            mediaType: 'image', mediaPath: '', mediaBufferB64: Buffer.from('STOREDBYTES').toString('base64'),
            isViewOnce: true, rawMediaMsg: { mimetype: 'image/jpeg', caption: '' },
        }, ['923001112222@lid']);
        assert.ok(session.get('923001112222@lid', 'STORE1'), 'lid alias key missing');
        const lookupStored = makeStoredLookup({ user: { id: BOTNUM + '@s.whatsapp.net' } });
        const hit = await lookupStored('STORE1');
        assert.ok(hit, 'stored lookup must find the entry by bare msg id');
        assert.strictEqual(hit.isViewOnce, true, 'boolean isViewOnce must survive the lookup');
        assert.strictEqual(hit.buffer.toString(), 'STOREDBYTES');
        assert.strictEqual(hit.type, 'imageMessage');
    });

    await ok('every failure reason has distinct user-facing text', () => {
        const texts = ['server-gone', 'download-failed', 'capture-failed', 'no-keys', 'expired'].map(r => vo.viewOnceReasonText(r, 'boom'));
        assert.ok(texts.every(t => t.length > 10), 'each reason needs real text');
        assert.strictEqual(new Set(texts).size, 5, 'reason texts must be distinct');
        assert.strictEqual(vo.viewOnceReasonText('unknown'), '');
    });

    console.log(failed ? `\n${failed} test(s) FAILED\n` : '\nAll view-once tests passed\n');
    process.exit(failed ? 1 : 0);
})();
