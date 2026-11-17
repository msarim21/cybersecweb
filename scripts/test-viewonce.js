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

    await ok('a reply with no captured buffer sends nothing', async () => {
        resetGlobals();
        await vo.captureViewOnce(rawMsg('VO11', CHAT, voImageMessage()), { download: failingDownload });
        const sent = [];
        const sock = { sendMessage: async (jid, p) => sent.push(p) };
        const done = await vo.deliverViewOnceOnReply(sock, { key: { id: 'R11' }, chat: CHAT, quoted: { id: 'VO11' } }, BOT);
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

    console.log(failed ? `\n${failed} test(s) FAILED\n` : '\nAll view-once tests passed\n');
    process.exit(failed ? 1 : 0);
})();
