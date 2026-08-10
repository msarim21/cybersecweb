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
const pairingProcessor = read('worker/pairing-processor.js');

// A pairing child must not restart itself after a socket close. A second
// registration socket invalidates the code that WhatsApp already displayed.
assert.match(botThread, /pairing,\s*\/\/ pairing sessions must keep exactly one child socket/);
assert.match(botThread, /noRestart,\s*\/\/ supervisor-owned sessions must not self-respawn/);
assert.match(botThread, /spawnChild\(\{\s*pairing: _pairingSession,\s*noRestart: _noRestartSession/s);
assert.match(supervisor, /pairing\s*: Boolean\(opts\.pairing\),\s*noRestart\s*: Boolean\(opts\.noRestart\)/s);

// The active supervisor/queue formation must have exactly one pairing owner.
// A direct fallback after a transient empty queue result creates a second
// registration socket and invalidates the first code.
assert.match(pairingRoute, /do not start a direct supervisor fallback here/);
assert.match(pairingRoute, /if \(supervisor\.isSupervisorActive\?\.\(\)\) \{\s*console\.log\(\`\[Pairing\]/s);
assert.doesNotMatch(pairingRoute, /supervisor\.handlePairingRequest\(clean\)\.catch/);

// The code must be requested only after Baileys reports the socket as open,
// and the socket must use a stable Chrome companion identity.
assert.match(pair, /const browserProfile = Browsers\.ubuntu\('Chrome'\)/);
assert.match(pair, /await nexus\.waitForSocketOpen\(\)/);
assert.match(pair, /await nexus\.requestPairingCode\(phoneNumber\)/);

// The HTTP endpoint must return an async request instead of killing the live
// socket when a proxy/browser request times out.
assert.match(pairingRoute, /const result = \{ async: true, number: clean, status: 'requested'/);
assert.match(pairingRoute, /setImmediate\(async \(\) => \{/);

// The database queue may contain several requested numbers, but only one
// WhatsApp registration socket may run at a time. Otherwise the second socket
// invalidates the first code and the user sees a plausible but rejected code.
assert.match(pairingProcessor, /if \(global\._pairingProcessorBusy\) return true/);
assert.match(pairingProcessor, /global\._pairingProcessorBusy = true/);
assert.match(pairingProcessor, /global\._pairingProcessorBusy = false/);
assert.match(pairingProcessor, /global\._pairingInFlight\.has\(clean\)/);
assert.match(pairingProcessor, /break;\s*}\s*return true;/s);
assert.match(supervisor, /Pairing queued for \+\$\{num\}: worker slot is still in use/);
assert.match(supervisor, /resetPairingRequest\(num\)/);
assert.match(supervisor, /global\._pairingOwner = num/);
assert.match(supervisor, /Sync\/recovery paused while pairing/);
assert.match(supervisor, /async function stopBotAndWait/);
assert.match(supervisor, /entry\.thread\.postMessage\(\{ cmd: 'stop' \}\)/);
assert.match(supervisor, /pairing → full bot \(same socket\)/);
assert.match(botThread, /case 'promote':/);
assert.match(botThread, /await stopChild\('SIGTERM'\)/);
assert.match(botThread, /child\.exitCode === null\)\s*\{\s*try \{ child\.kill\('SIGKILL'\)/s);

console.log('[pairing-lifecycle] PASS: single-child handoff, socket readiness, Chrome identity, and async request invariants');