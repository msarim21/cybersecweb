#!/usr/bin/env node
'use strict';
// Offline checks for anti-delete / anti-edit config + cache logic (no WhatsApp needed).
const fs = require('fs');
const path = require('path');
const assert = require('assert');
process.chdir(path.join(__dirname, '..'));
const helpers = require('../allfunc/antidelete-helpers');

let failed = 0;
function ok(name, fn) {
    try { fn(); console.log('  ✓', name); }
    catch (e) { failed++; console.log('  ✗', name, '\n   ', e.message); }
}
const BOT = '920000000001';
const cfgFile = `./database/antidelete_config_${BOT}.json`;
const fakeSock = { user: { id: `${BOT}:5@s.whatsapp.net` }, decodeJid: (j) => j.replace(/:\d+@/, '@') };

console.log('\n=== Antidelete / Antiedit tests ===\n');

ok('explicit "off" config is respected', () => {
    fs.writeFileSync(cfgFile, JSON.stringify({ mode: 'off', enabled: false }));
    global._antideleteConfigs = {};
    assert.strictEqual(helpers.loadAntideleteCfg(BOT).mode, 'off');
});
ok('legacy {enabled:false} stays off', () => {
    fs.writeFileSync(cfgFile, JSON.stringify({ enabled: false }));
    global._antideleteConfigs = {};
    assert.strictEqual(helpers.loadAntideleteCfg(BOT).mode, 'off');
});
ok('legacy {enabled:true} becomes private', () => {
    fs.writeFileSync(cfgFile, JSON.stringify({ enabled: true }));
    global._antideleteConfigs = {};
    assert.strictEqual(helpers.loadAntideleteCfg(BOT).mode, 'private');
});
ok('cached message is found by exact chat + id', () => {
    const chat = '923001112222@s.whatsapp.net';
    helpers.cacheMessageForAntidelete({ key: { id: 'TESTMSG0001', remoteJid: chat }, message: { conversation: 'hello' } }, fakeSock);
    const s = helpers.getAntideleteSession(BOT);
    assert.ok(s.get(chat, 'TESTMSG0001'), 'entry missing');
});
ok('chat-id aliases include remoteJidAlt', () => {
    const ids = helpers._adChatIdsFromKey({ remoteJid: '123@lid', remoteJidAlt: '923001112222@s.whatsapp.net' });
    assert.ok(ids.includes('923001112222@s.whatsapp.net'));
});

try { fs.unlinkSync(cfgFile); } catch (_) {}
console.log(failed ? `\n${failed} test(s) failed\n` : '\nAll tests passed\n');
process.exit(failed ? 1 : 0);
