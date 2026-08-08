#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const botThread = read('worker/bot-thread.js');
const supervisor = read('worker/supervisor.js');
const pair = read('pair.js');
const pairingRoute = read('server/routes/pairing.js');

// A pairing child must not restart itself after a socket close. A second
// registration socket invalidates the code that WhatsApp already displayed.
assert.match(botThread, /pairing,\s*\/\/ pairing sessions must keep exactly one child socket/);
assert.match(botThread, /noRestart,\s*\/\/ supervisor-owned sessions must not self-respawn/);
assert.match(botThread, /spawnChild\(\{\s*pairing: Boolean\(pairing\),\s*noRestart: Boolean\(noRestart\)/s);
assert.match(supervisor, /pairing\s*: Boolean\(opts\.pairing\),\s*noRestart\s*: Boolean\(opts\.noRestart\)/s);

// The code must be requested only after Baileys reports the socket as open,
// and the socket must use a stable Chrome companion identity.
assert.match(pair, /const browserProfile = Browsers\.ubuntu\('Chrome'\)/);
assert.match(pair, /await nexus\.waitForSocketOpen\(\)/);
assert.match(pair, /await nexus\.requestPairingCode\(phoneNumber\)/);

// The HTTP endpoint must return an async request instead of killing the live
// socket when a proxy/browser request times out.
assert.match(pairingRoute, /const result = \{ async: true, number: clean, status: 'requested'/);
assert.match(pairingRoute, /setImmediate\(async \(\) => \{/);

console.log('[pairing-lifecycle] PASS: single-child handoff, socket readiness, Chrome identity, and async request invariants');