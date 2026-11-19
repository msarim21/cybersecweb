#!/usr/bin/env node
'use strict';
// Offline checks for .anticall: a mocked Baileys socket stands in for the real
// one, so no WhatsApp connection and no node_modules are needed.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ac = require('../allfunc/anticall');

let failed = 0;
async function ok(name, fn) {
    try {
        await fn();
        console.log('  ✓', name);
    } catch (e) {
        failed++;
        console.log('  ✗', name, '\n   ', e.message);
    }
}

function mockSock() {
    const calls = { reject: [], messages: [], blocks: [] };
    return {
        calls,
        rejectCall: async (id, from) => { calls.reject.push([id, from]); },
        sendMessage: async (jid, content) => { calls.messages.push([jid, content]); return { key: { id: 'm1' } }; },
        updateBlockStatus: async (jid, action) => { calls.blocks.push([jid, action]); },
    };
}

function offer(id, from, extra = {}) {
    return [{ id, from, status: 'offer', isVideo: false, isGroup: false, ...extra }];
}

(async () => {
    await ok('decline mode: rejects + messages, does not block', async () => {
        ac._handledCallIds.clear();
        const sock = mockSock();
        const out = await ac.handleCallEvent(sock, offer('c1', '923001234567@s.whatsapp.net'), {
            getConfig: () => ({ mode: 'decline' }),
            getMessage: () => null,
        });
        assert.deepEqual(out, [{ id: 'c1', from: '923001234567@s.whatsapp.net', action: 'declined' }]);
        assert.deepEqual(sock.calls.reject, [['c1', '923001234567@s.whatsapp.net']]);
        assert.equal(sock.calls.messages.length, 1);
        assert.equal(sock.calls.messages[0][0], '923001234567@s.whatsapp.net');
        assert.ok(sock.calls.messages[0][1].text.includes('@923001234567'), 'message mentions caller');
        assert.ok(sock.calls.messages[0][1].text.includes('voice'), 'message says voice call');
        assert.equal(sock.calls.blocks.length, 0);
    });

    await ok('block mode: rejects + messages + blocks', async () => {
        ac._handledCallIds.clear();
        const sock = mockSock();
        const out = await ac.handleCallEvent(sock, offer('c2', '923007654321@s.whatsapp.net', { isVideo: true }), {
            getConfig: () => ({ mode: 'block' }),
            getMessage: () => null,
        });
        assert.equal(out[0].action, 'declined+blocked');
        assert.equal(sock.calls.reject.length, 1);
        assert.equal(sock.calls.messages.length, 1);
        assert.ok(sock.calls.messages[0][1].text.includes('video'), 'message says video call');
        assert.deepEqual(sock.calls.blocks, [['923007654321@s.whatsapp.net', 'block']]);
    });

    await ok('off mode: call passes through untouched', async () => {
        ac._handledCallIds.clear();
        const sock = mockSock();
        const out = await ac.handleCallEvent(sock, offer('c3', '923001111111@s.whatsapp.net'), {
            getConfig: () => ({ mode: 'off' }),
            getMessage: () => null,
        });
        assert.equal(out[0].action, 'ignored');
        assert.equal(sock.calls.reject.length, 0);
        assert.equal(sock.calls.messages.length, 0);
        assert.equal(sock.calls.blocks.length, 0);
    });

    await ok('custom message uses {user} and {calltype} placeholders', async () => {
        ac._handledCallIds.clear();
        const sock = mockSock();
        await ac.handleCallEvent(sock, offer('c4', '923009999999@s.whatsapp.net'), {
            getConfig: () => ({ mode: 'decline' }),
            getMessage: () => 'Hi {user}, no {calltype} calls please!',
        });
        assert.equal(sock.calls.messages[0][1].text, 'Hi @923009999999, no voice calls please!');
    });

    await ok('toggle takes effect without restart (config re-read per event)', async () => {
        ac._handledCallIds.clear();
        const sock = mockSock();
        let mode = 'off';
        const deps = { getConfig: () => ({ mode }), getMessage: () => null };
        await ac.handleCallEvent(sock, offer('c5a', '923001234567@s.whatsapp.net'), deps);
        assert.equal(sock.calls.reject.length, 0);
        mode = 'decline'; // user runs `.anticall decline` — no restart
        await ac.handleCallEvent(sock, offer('c5b', '923001234567@s.whatsapp.net'), deps);
        assert.equal(sock.calls.reject.length, 1);
        mode = 'off';
        await ac.handleCallEvent(sock, offer('c5c', '923001234567@s.whatsapp.net'), deps);
        assert.equal(sock.calls.reject.length, 1);
    });

    await ok('malformed call events never crash and do nothing', async () => {
        ac._handledCallIds.clear();
        const sock = mockSock();
        const deps = { getConfig: () => ({ mode: 'decline' }), getMessage: () => null };
        for (const bad of [null, undefined, 'nope', 42, [null], [undefined], [{}], [{ id: 'x' }], [{ from: 'y@s.whatsapp.net' }], [{ id: 'x', from: 'y@s.whatsapp.net' }]]) {
            await ac.handleCallEvent(sock, bad, deps);
        }
        assert.equal(sock.calls.reject.length, 0);
        assert.equal(sock.calls.messages.length, 0);
    });

    await ok('non-offer statuses are ignored', async () => {
        ac._handledCallIds.clear();
        const sock = mockSock();
        const deps = { getConfig: () => ({ mode: 'decline' }), getMessage: () => null };
        for (const status of ['accept', 'reject', 'timeout', 'ringing', 'terminate']) {
            await ac.handleCallEvent(sock, [{ id: 's-' + status, from: '923001234567@s.whatsapp.net', status, isVideo: false, isGroup: false }], deps);
        }
        assert.equal(sock.calls.reject.length, 0);
    });

    await ok('group calls are ignored', async () => {
        ac._handledCallIds.clear();
        const sock = mockSock();
        await ac.handleCallEvent(sock, offer('c6', '123456@g.us', { isGroup: true }), {
            getConfig: () => ({ mode: 'decline' }),
            getMessage: () => null,
        });
        assert.equal(sock.calls.reject.length, 0);
    });

    await ok('a repeated offer for one call is handled once', async () => {
        ac._handledCallIds.clear();
        const sock = mockSock();
        const deps = { getConfig: () => ({ mode: 'decline' }), getMessage: () => null };
        await ac.handleCallEvent(sock, offer('c7', '923001234567@s.whatsapp.net'), deps);
        await ac.handleCallEvent(sock, offer('c7', '923001234567@s.whatsapp.net'), deps);
        assert.equal(sock.calls.reject.length, 1);
        assert.equal(sock.calls.messages.length, 1);
    });

    await ok('a failing reject still sends the message and blocks', async () => {
        ac._handledCallIds.clear();
        const sock = mockSock();
        sock.rejectCall = async () => { throw new Error('socket hiccup'); };
        const out = await ac.handleCallEvent(sock, offer('c8', '923001234567@s.whatsapp.net'), {
            getConfig: () => ({ mode: 'block' }),
            getMessage: () => null,
        });
        assert.equal(out[0].action, 'declined+blocked');
        assert.equal(sock.calls.messages.length, 1);
        assert.equal(sock.calls.blocks.length, 1);
    });

    await ok('registerAnticallListener wires the call event', async () => {
        ac._handledCallIds.clear();
        const handlers = {};
        const sock = mockSock();
        sock.ev = { on: (evt, fn) => { handlers[evt] = fn; } };
        assert.equal(ac.registerAnticallListener(sock), true);
        assert.equal(typeof handlers.call, 'function');
        // The registered handler uses live config (file fallback: off in this
        // repo checkout) — with no config it must simply do nothing, not crash.
        await handlers.call(offer('c9', '923001234567@s.whatsapp.net'));
        assert.equal(ac.registerAnticallListener(null), false);
        assert.equal(ac.registerAnticallListener({}), false);
    });

    await ok('formatMessage replaces placeholders', () => {
        assert.equal(
            ac.formatMessage('Hey {user}, no {calltype}!', '923001234567@s.whatsapp.net', true),
            'Hey @923001234567, no video!'
        );
        assert.equal(
            ac.formatMessage('Hey {user}, no {calltype}!', '923001234567:12@s.whatsapp.net', false),
            'Hey @923001234567, no voice!'
        );
        assert.ok(ac.formatMessage(null, '923001234567@s.whatsapp.net', false).includes("@923001234567"));
    });

    await ok('pair.js registers the call listener (wiring)', () => {
        const pair = fs.readFileSync(path.join(__dirname, '..', 'pair.js'), 'utf8');
        assert.ok(pair.includes("require('./allfunc/anticall')"), 'pair.js requires anticall');
        assert.ok(pair.includes("ev.on('call'"), 'pair.js registers ev.on(call)');
        assert.ok(pair.includes('handleCallEvent(nexus, calls)'), 'listener calls handleCallEvent');
        const cs = fs.readFileSync(path.join(__dirname, '..', 'case.js'), 'utf8');
        assert.ok(cs.includes('allfunc/anticall.js'), 'case.js anticall comment points at the module');
    });

    if (failed) {
        console.log(`\n${failed} anticall test(s) failed`);
        process.exit(1);
    }
    console.log('\nAll anticall tests passed\n');
})();
