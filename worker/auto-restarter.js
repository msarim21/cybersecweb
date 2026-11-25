'use strict';
/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  AUTO-RESTARTER — Scheduled restart with session flush      ║
 * ╠══════════════════════════════════════════════════════════════╣
 * ║  • Every BOT_RESTART_HOURS (default: 4) hours               ║
 * ║  • Gracefully flushes all bot sessions to DB                ║
 * ║  • Then exits — Heroku/Replit auto-restarts the process     ║
 * ║  • On restart: supervisor auto-reconnects from DB           ║
 * ║                                                             ║
 * ║  ⚠️  SUPERVISOR MODE (Railway, BOT_ISOLATION=1): the parent ║
 * ║  process ALSO hosts the Express website. A whole-process    ║
 * ║  exit here kills the website + every bot at once — that is  ║
 * ║  the "3–4h ke baad sab crash" reported 26 Nov 2026. Each   ║
 * ║  bot child already self-restarts every BOT_RESTART_HOURS   ║
 * ║  via keepalive (scheduleBotMemoryRestart, ~10s respawn,     ║
 * ║  website untouched), so in supervisor mode the scheduled    ║
 * ║  whole-process restart is SKIPPED (unless the admin sets    ║
 * ║  BOT_RESTART_HOURS explicitly — that always wins).          ║
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

// True when the admin explicitly asked for whole-process restarts via env.
// An explicit BOT_RESTART_HOURS / AUTO_RESTART_HOURS always wins — the
// supervisor-mode skip below only applies to the DEFAULT (unset) interval.
function _explicitRestartHours() {
  const bot = Number(process.env.BOT_RESTART_HOURS);
  if (Number.isFinite(bot) && bot > 0) return true;
  const legacy = Number(process.env.AUTO_RESTART_HOURS);
  if (Number.isFinite(legacy) && legacy > 0) return true;
  return false;
}

function _supervisorActive() {
  try { return require('./supervisor').isSupervisorActive(); } catch (_) { return false; }
}

function _armTimer(ms, hours, opts) {
  _restartTimer = setTimeout(async () => {
    if (typeof opts.onRestart === 'function') {
      try { await opts.onRestart(); } catch (_) {}
    }
    // ── Railway fix (26 Nov 2026) ──────────────────────────────────────
    // In supervisor/isolated mode the parent process ALSO hosts the Express
    // website. A whole-process exit here kills the website + every bot at
    // once — that is the "3–4h ke baad sab crash" the owner reported.
    // Each bot child already self-restarts every BOT_RESTART_HOURS via
    // keepalive's scheduleBotMemoryRestart (~10s respawn, website untouched),
    // so the parent must stay up. Skip the exit and re-arm the timer; an
    // explicit BOT_RESTART_HOURS env var still forces the old behaviour.
    if (_supervisorActive() && !_explicitRestartHours()) {
      console.log(chalk.yellow('[AutoRestarter] ⏭️  Supervisor mode — skipping whole-process restart (bot children self-restart; website stays up). Re-arming timer.'));
      _armTimer(ms, hours, opts);
      return;
    }
    await performGracefulRestart(`${hours}h scheduled`);
  }, ms);

  // Unref so the timer doesn't keep process alive alone
  if (_restartTimer.unref) _restartTimer.unref();
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

  const configuredHours = Number(process.env.BOT_RESTART_HOURS);
  const hours = Number.isFinite(opts.hours) && opts.hours > 0
    ? opts.hours
    : (Number.isFinite(configuredHours) && configuredHours > 0 ? configuredHours : 4);
  const ms = hours * 60 * 60 * 1000;

  if (_supervisorActive() && !_explicitRestartHours()) {
    console.log(chalk.gray(`[AutoRestarter] ⏰ Timer armed (every ${hours}h) — supervisor mode: whole-process restarts SKIPPED, bot children self-restart instead`));
  } else {
    console.log(chalk.gray(`[AutoRestarter] ⏰ Scheduled restart every ${hours} hours`));
  }

  _armTimer(ms, hours, opts);
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
