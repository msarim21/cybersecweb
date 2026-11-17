'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const api = require('../allfunc/public-providers');
const { handle } = require('../allfunc/provider-commands');
const response = data => ({ ok: true, json: async () => data });
test('Kyio nested answer is extracted, not the prompt echo', () => {
    assert.equal(api.extractAnswer({ status: true, result: { response: 'hello' } }), 'hello');
    assert.equal(api.extractAnswer({ success: true, message: 'hello', reply: '' }), '');
    assert.equal(api.extractAnswer({ status: true, result: 'It looks like you’re using an older version of the app.' }), '');
});
test('AI uses Omega when Kyio is unavailable', async () => {
    const urls = [];
    const answer = await api.askAI('hello', { fetch: async url => {
        urls.push(url.href);
        if (url.hostname === 'api.kyio.web.id') return response({ status: false, error: 'offline' });
        return response({ success: true, message: 'echo', answer: 'actual answer' });
    } });
    assert.equal(answer, 'actual answer');
    assert.equal(urls.length, 2);
    assert.equal(new URL(urls[1]).pathname, '/api/ai/Deepseek');
});
test('Pinterest falls back for malformed success and rejects non-HTTPS images', async () => {
    const rows = await api.pinterest('mountain', { fetch: async url =>
        response(url.hostname === 'api.omegatech.app' ? { success: true, results: [] } :
            { status: true, result: [{ images_url: 'https://i.pinimg.com/a.jpg', pin: 'https://pinterest.com/pin/1' }, { images_url: 'javascript:alert(1)' }] }) });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].image, 'https://i.pinimg.com/a.jpg');
});
test('TikTok input requires the actual TikTok hostname', async () => {
    let called = false;
    await assert.rejects(api.tiktokDownload('https://tiktok.com.attacker.example/video/123', { fetch: async () => { called = true; } }), /Invalid TikTok/);
    assert.equal(called, false);
});
test('TikTok search reads Nexray playable data', async () => {
    const rows = await api.tiktokSearch('nature', { fetch: async () => response({ result: [{ data: 'https://cdn.example/video.mp4', title: 'Nature', stats: { views: '1K' } }] }) });
    assert.equal(rows[0].video, 'https://cdn.example/video.mp4');
    assert.equal(rows[0].views, '1K');
});
test('apistatus is owner-only and cannot run probes for other users', async () => {
    let called = false;
    const handled = await handle({ command: 'apistatus', isCreator: false, reply: async () => {} }, { health: async () => { called = true; } });
    assert.equal(handled, true);
    assert.equal(called, false);
});
test('new command executes with real input and sends returned results', async () => {
    const replies = [];
    await handle({ command: 'ytfind', text: 'NASA', prefix: '.', reply: async r => replies.push(r) }, {
        youtubeSearch: async query => { assert.equal(query, 'NASA'); return [{ title: 'NASA live', duration: '1:23', url: 'https://youtube.com/watch?v=abc' }]; }
    });
    assert.equal(replies.length, 1);
    assert.ok(replies[0].includes('https://youtube.com/watch?v=abc'));
});
test('unknown commands are left to existing command handlers', async () => {
    assert.equal(await handle({ command: 'play' }), false);
});