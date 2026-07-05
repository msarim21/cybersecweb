'use strict';
/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  AUTO-RESTARTER — Scheduled restart with session flush      ║
 * ╠══════════════════════════════════════════════════════════════╣
 * ║  • Every BOT_RESTART_HOURS (default: 4) hours               ║
 * ║  • Gracefully flushes all bot sessions to DB                ║
 * ║  • Then exits — Heroku/Replit auto-restarts the process     ║
 * ║  • On restart: supervisor auto-reconnects from DB           ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

const chalk = require('chalk');
const path  = require('path');
const fs    = require('fs');

let _restartTimer = null;
let _started = false;

/**
 * Flush all active session folders to DB before restart.
 * This ensures sessions survive the ephemeral disk wipe.
 */
async function flushAllSessionsToDb() {
  try {
    const { backupSessionFolder } = require('../session-db');
    const pairingDir = path.join(__dirname, '..', 'nexstore', 'pairing');
    if (!fs.existsSync(pairingDir)) return;

    const dirs = fs.readdirSync(pairingDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    let saved = 0;
    let failed = 0;

    for (const dir of dirs) {
      const cleanNum = dir.replace(/[^0-9]/g, '');
      if (!cleanNum) continue;
      const sessionPath = path.join(pairingDir, dir);
      try {
        const ok = await backupSessionFolder(cleanNum, sessionPath);
        if (ok) {
          saved++;
          console.log(chalk.green(`[AutoRestarter] ✅ Session saved: +${cleanNum}`));
        }
      } catch (e) {
        failed++;
        console.log(chalk.yellow(`[AutoRestarter] ⚠️  Save failed: +${cleanNum} — ${e.message}`));
      }
    }

    console.log(chalk.cyan(`[AutoRestarter] 📊 Flush complete: ${saved} saved, ${failed} failed`));
  } catch (err) {
    console.error('[AutoRestarter] flushAllSessionsToDb error:', err.message);
  }
}

/**
 * Perform graceful restart:
 *  1. Stop accepting new connections (supervisor stops)
 *  2. Flush all sessions to DB
 *  3. Wait for writes to complete
 *  4. Exit — process manager (Heroku/Replit) auto-restarts
 */
async function performGracefulRestart(reason = 'scheduled') {
  console.log(chalk.cyan(`\n[AutoRestarter] 🔄 Restart triggered: ${reason}`));
  console.log(chalk.cyan('[AutoRestarter] Step 1/3: Stopping supervisor gracefully...'));

  try {
    // Tell supervisor to stop spawning new bots + flush sessions
    const { stopSupervisorGraceful, isSupervisorActive } = require('./supervisor');
    if (isSupervisorActive()) {
      await stopSupervisorGraceful(8000);
    }
  } catch (e) {
    console.log(chalk.yellow(`[AutoRestarter] Supervisor stop warning: ${e.message}`));
  }

  console.log(chalk.cyan('[AutoRestarter] Step 2/3: Flushing sessions to DB...'));
  await flushAllSessionsToDb();

  console.log(chalk.cyan('[AutoRestarter] Step 3/3: Exiting — process will auto-restart...'));
  await new Promise(r => setTimeout(r, 2000)); // 2s for writes to complete

  process.exit(0);
}

/**
 * Start the auto-restart timer.
 * @param {object} [opts]
 * @param {number} [opts.hours]   Override restart interval hours
 * @param {Function} [opts.onRestart]  Extra callback before restart
 */
function startAutoRestarter(opts = {}) {
  if (_started) return;
  _started = true;
  // Signal keepalive.js so it skips its own duplicate scheduleAutoRestart timer
  global._autoRestarterScheduled = true;

  const hours = opts.hours
    || parseInt(process.env.BOT_RESTART_HOURS || '4', 10);
  const ms = hours * 60 * 60 * 1000;

  console.log(chalk.gray(`[AutoRestarter] ⏰ Scheduled restart every ${hours} hours`));

  _restartTimer = setTimeout(async () => {
    if (typeof opts.onRestart === 'function') {
      try { await opts.onRestart(); } catch (_) {}
    }
    await performGracefulRestart(`${hours}h scheduled`);
  }, ms);

  // Unref so the timer doesn't keep process alive alone
  if (_restartTimer.unref) _restartTimer.unref();
}

function stopAutoRestarter() {
  if (_restartTimer) {
    clearTimeout(_restartTimer);
    _restartTimer = null;
  }
  _started = false;
}

module.exports = {
  startAutoRestarter,
  stopAutoRestarter,
  flushAllSessionsToDb,
  performGracefulRestart,
};
