#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
process.chdir(ROOT);

const helpers = require('../allfunc/antidelete-helpers');

const TEST_BOT = '919900001111';
const TEST_CFG = `./database/antidelete_config_${TEST_BOT}.json`;
const OWNER_NUM = '923417022212';
const OWNER_JID = `${OWNER_NUM}@s.whatsapp.net`;

function cleanup() {
    try { fs.unlinkSync(TEST_CFG); } catch (_) {}
    if (global._antideleteConfigs) delete global._antideleteConfigs[TEST_BOT];
}

function mockSock(overrides = {}) {
    return {
        _cachedBotNumber: `${TEST_BOT}@s.whatsapp.net`,
        user: { id: `${TEST_BOT}:99@s.whatsapp.net` },
        authState: { creds: { me: { id: `${TEST_BOT}:99@s.whatsapp.net` } } },
        decodeJid: (id) => String(id).split(':')[0] + '@' + String(id).split('@')[1],
        groupMetadata: async () => ({ participants: [{ id: OWNER_JID }] }),
        ...overrides,
    };
}

async function run() {
    let passed = 0;
    const ok = (name, fn) => {
        try {
            const r = fn();
            if (r && typeof r.then === 'function') {
                return r.then(() => { passed++; console.log(`  ✓ ${name}`); });
            }
            passed++;
            console.log(`  ✓ ${name}`);
        } catch (e) {
            console.error(`  ✗ ${name}`);
            throw e;
        }
    };

    console.log('\n=== Antidelete unit tests ===\n');

    await ok('_adNormalizeCfg: enabled only → private', () => {
        const cfg = helpers._adNormalizeCfg({ enabled: true });
        assert.strictEqual(cfg.mode, 'private');
        assert.strictEqual(cfg.enabled, true);
    });

    await ok('_adNormalizeCfg: mode off respected', () => {
        const cfg = helpers._adNormalizeCfg({ mode: 'off' });
        assert.strictEqual(cfg.mode, 'off');
        assert.strictEqual(cfg.enabled, false);
    });

    await ok('loadAntideleteCfg: default private without command', () => {
        delete global._antideleteConfigs;
        const cfg = helpers.loadAntideleteCfg('15556667777');
        assert.strictEqual(cfg.mode, 'private');
        assert.strictEqual(cfg.enabled, true);
    });

    cleanup();
    await ok('ensureAntideletePrivateDefault: creates per-bot private config', () => {
        assert.ok(!fs.existsSync(TEST_CFG));
        const cfg = helpers.ensureAntideletePrivateDefault(TEST_BOT);
        assert.strictEqual(cfg.mode, 'private');
        assert.ok(fs.existsSync(TEST_CFG));
        const disk = JSON.parse(fs.readFileSync(TEST_CFG, 'utf-8'));
        assert.strictEqual(disk.mode, 'private');
    });

    fs.writeFileSync(TEST_CFG, JSON.stringify({ mode: 'off', enabled: false }));
    delete global._antideleteConfigs?.[TEST_BOT];
    await ok('ensureAntideletePrivateDefault: keeps user mode off', () => {
        const cfg = helpers.ensureAntideletePrivateDefault(TEST_BOT);
        assert.strictEqual(cfg.mode, 'off');
    });

    await ok('_adSelfJidOrderedTries: cached JID first, @lid last', () => {
        const sock = mockSock();
        const tries = helpers._adSelfJidOrderedTries(sock, TEST_BOT);
        assert.ok(tries.length >= 2);
        assert.strictEqual(tries[0], `${TEST_BOT}@s.whatsapp.net`);
        assert.ok(tries[tries.length - 1].endsWith('@lid'));
    });

    await ok('_adPrivateReportTargets: user DM → bot self only', async () => {
        const sock = mockSock();
        const targets = await helpers._adPrivateReportTargets(sock, TEST_BOT, '923008888888@s.whatsapp.net');
        assert.strictEqual(targets.length, 1);
        assert.ok(targets[0].includes(TEST_BOT));
    });

    await ok('_adPrivateReportTargets: owner DM → bot user Message Yourself', async () => {
        const sock = mockSock();
        const targets = await helpers._adPrivateReportTargets(sock, TEST_BOT, OWNER_JID);
        assert.strictEqual(targets.length, 1);
        assert.ok(targets[0].includes(TEST_BOT));
    });

    await ok('cacheMessageForAntidelete: remoteJidAlt-only messages cached', () => {
        cleanup();
        helpers.ensureAntideletePrivateDefault(TEST_BOT);
        const session = helpers.getAntideleteSession(TEST_BOT);
        const sock = mockSock();
        helpers.cacheMessageForAntidelete({
            key: { id: 'LIDMSG1', remoteJidAlt: '923008888888@lid' },
            message: { conversation: 'lid era hello' },
        }, sock);
        const hit = session.get('923008888888@lid', 'LIDMSG1');
        assert.ok(hit);
        assert.strictEqual(hit.content, 'lid era hello');
    });

    await ok('_adPrivateReportTargets: owner group → bot user + owner', async () => {
        const sock = mockSock();
        const targets = await helpers._adPrivateReportTargets(sock, TEST_BOT, '120363999@g.us');
        const nums = targets.map((t) => t.split('@')[0].replace(/\D/g, ''));
        assert.ok(nums.some((n) => n.includes(TEST_BOT) || n === TEST_BOT));
        assert.ok(nums.some((n) => n.includes(OWNER_NUM) || n === OWNER_NUM));
        assert.ok(targets.length >= 2);
    });

    await ok('_adDeliverAntideleteReport: one send per recipient (JID fallback chain)', async () => {
        const sent = [];
        const sock = mockSock({
            sendMessage: async (jid) => {
                sent.push(jid);
                if (jid.endsWith('@lid')) throw new Error('lid blocked');
                return {};
            },
        });
        const okDeliver = await helpers._adDeliverAntideleteReport(sock, {
            targetJid: `${TEST_BOT}@s.whatsapp.net`,
            text: 'test report',
            mediaOriginal: null,
            sender: '923008888888@s.whatsapp.net',
            deletedBy: '923008888888@s.whatsapp.net',
            botNum: TEST_BOT,
            useMessageYourself: true,
            chatId: '923008888888@s.whatsapp.net',
        });
        assert.strictEqual(okDeliver, true);
        const selfSends = sent.filter((j) => j.includes(TEST_BOT));
        assert.strictEqual(selfSends.length, 1);
        assert.ok(selfSends[0].endsWith('@s.whatsapp.net'));
    });

    await ok('_adResolveDeleteContext: merges proto key + lid aliases', () => {
        const sock = mockSock();
        const ctx = helpers._adResolveDeleteContext(sock, {
            remoteJid: '923008888888@lid',
            id: 'MSG123',
        }, {
            remoteJid: '923008888888@s.whatsapp.net',
            remoteJidAlt: '923008888888@lid',
            id: 'MSG123',
        });
        assert.strictEqual(ctx.msgId, 'MSG123');
        assert.ok(ctx.altChatIds.some((j) => j.includes('923008888888')));
    });

    await ok('_adInvokeDeleteHandler: retries when first lookup misses', async () => {
        cleanup();
        helpers.ensureAntideletePrivateDefault(TEST_BOT);
        const chatId = '923008888888@s.whatsapp.net';
        const msgId = 'RETRYMSG01';
        const delivered = [];
        const sock = mockSock({
            sendMessage: async (jid, payload) => {
                delivered.push({ jid, text: payload.text });
                return {};
            },
        });
        setTimeout(() => {
            helpers.getAntideleteSession(TEST_BOT).set(chatId, msgId, {
                content: 'late cache fill',
                sender: chatId,
                fromMe: false,
                _ts: Date.now(),
            });
        }, 400);
        const result = await helpers._adInvokeDeleteHandler(sock, {
            key: { remoteJid: chatId, id: msgId },
            protoKey: { remoteJid: chatId, id: msgId },
            reportMiss: true,
            retryMs: 800,
        });
        assert.strictEqual(result, true);
        assert.ok(delivered.some((d) => d.text.includes('late cache fill')));
    });

    await ok('_adHandleMessageDelete: private mode delivers to Message Yourself', async () => {
        cleanup();
        helpers.ensureAntideletePrivateDefault(TEST_BOT);
        const session = helpers.getAntideleteSession(TEST_BOT);
        const chatId = '923008888888@s.whatsapp.net';
        const msgId = 'TESTMSG001';
        session.set(chatId, msgId, {
            content: 'hello deleted',
            sender: '923008888888@s.whatsapp.net',
            fromMe: false,
            _ts: Date.now(),
        });

        const delivered = [];
        const sock = mockSock({
            sendMessage: async (jid, payload) => {
                delivered.push({ jid, text: payload.text });
                return {};
            },
        });

        const result = await helpers._adHandleMessageDelete(sock, {
            botNum: TEST_BOT,
            chatId,
            msgId,
            deletedBy: '923008888888@s.whatsapp.net',
            fromMeDelete: false,
            altChatIds: [chatId],
            reportMiss: true,
        });
        assert.strictEqual(result, true);
        assert.ok(delivered.length >= 1);
        assert.ok(delivered[0].text.includes('ANTIDELETE REPORT'));
        assert.ok(delivered[0].text.includes('hello deleted'));
        assert.ok(delivered[0].jid.includes(TEST_BOT));
    });

    cleanup();
    console.log(`\n=== ${passed} tests passed ===\n`);
    process.exit(0);
}

run().catch((e) => {
    cleanup();
    console.error(e);
    process.exit(1);
});
