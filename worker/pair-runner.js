'use strict';

/**
 * Dedicated pairing process — ONE number, nothing else.
 *
 *   node worker/pair-runner.js 923001234567
 *
 * It only performs WhatsApp companion registration. No commands, no plugins,
 * no media pipeline: the registration socket cannot be disturbed by bot logic.
 * When registration succeeds the credentials are already in the database, so
 * the supervisor/autoload can boot the real bot from them.
 *
 * Exit codes:
 *   0  paired successfully (or number was already registered)
 *   1  pairing failed / timed out (reason recorded in the database)
 */

process.env.WHATSAPP_WORKER = '1';
process.env.BOT_PAIRING = '1';

const number = String(process.argv[2] || process.env.BOT_NUMBER || '').replace(/[^0-9]/g, '');

if (!number) {
  console.error('[pair-runner] no number given');
  process.exit(1);
}

process.on('unhandledRejection', (r) => console.error('[pair-runner] unhandled:', r?.message || r));
process.on('uncaughtException', (e) => console.error('[pair-runner] uncaught:', e?.message || e));

(async () => {
  try {
    const { initDb } = require('../server/db');
    await initDb();
  } catch (err) {
    console.error('[pair-runner] database init failed:', err.message);
    process.exit(1);
  }

  const { runPairing } = require('../lib/pairing-engine');

  let result;
  try {
    result = await runPairing(number);
  } catch (err) {
    console.error('[pair-runner] fatal:', err.message);
    try {
      await require('../server/db-service').markPairingFailed(number, err.message);
    } catch (_) {}
    process.exit(1);
  }

  if (result.ok) {
    console.log(`[pair-runner] ✅ ${number} paired`);
    // Let the final creds.update flush before the process goes away.
    setTimeout(() => process.exit(0), 2000);
  } else {
    console.error(`[pair-runner] ❌ ${number} failed: ${result.reason}`);
    setTimeout(() => process.exit(1), 500);
  }
})();
