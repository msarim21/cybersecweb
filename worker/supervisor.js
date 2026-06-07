'use strict';

/**
 * Bot supervisor — one child Node process per linked WhatsApp number.
 * Each child is fully isolated (separate memory, globals, config files).
 */

const { fork } = require('child_process');
const path = require('path');
const fs = require('fs');
const chalk = require('chalk');

const { cleanBotNum } = require('../allfunc/bot-workspace');
const { ensureBotWorkspace } = require('../allfunc/bot-workspace');

const SYNC_INTERVAL_MS = 25_000;
const RESTART_DELAY_MS = 12_000;
const MAX_RESTARTS_PER_HOUR = 20;

/** @type {Map<string, { child: import('child_process').ChildProcess, restarts: number[], pairing: boolean }>} */
const children = new Map();

let _syncTimer = null;
let _active = false;

function isSupervisorActive() {
    return _active;
}

function _botRunnerScript() {
    return path.join(__dirname, 'bot-runner.js');
}

function _spawnEnv(extra = {}) {
    return {
        ...process.env,
        WHATSAPP_WORKER: '1',
        BOT_ISOLATION: '1',
        ...extra,
    };
}

function killBot(botNum, signal = 'SIGTERM') {
    const clean = cleanBotNum(botNum);
    const entry = children.get(clean);
    if (!entry?.child) return false;
    try {
        entry.child.kill(signal);
    } catch (_) {}
    children.delete(clean);
    console.log(chalk.yellow(`[Supervisor] Stopped isolated bot +${clean}`));
    return true;
}

function spawnBot(botNum, opts = {}) {
    const clean = cleanBotNum(botNum);
    if (!clean) return null;

    if (children.has(clean)) {
        if (!opts.force) return children.get(clean).child;
        killBot(clean);
    }

    ensureBotWorkspace(clean);

    const child = fork(_botRunnerScript(), [clean], {
        env: _spawnEnv({
            BOT_NUMBER: clean,
            BOT_PAIRING: opts.pairing ? '1' : '0',
        }),
        stdio: 'inherit',
        cwd: path.join(__dirname, '..'),
    });

    const restarts = [];
    children.set(clean, { child, restarts, pairing: Boolean(opts.pairing) });

    child.on('exit', (code, sig) => {
        const wasPairing = children.get(clean)?.pairing;
        children.delete(clean);
        console.log(chalk.gray(`[Supervisor] Bot +${clean} exited (code=${code}, sig=${sig})`));
        if (opts.noRestart) {
            // Pairing child finished — spawn full bot if session exists and number is linked
            if (wasPairing) {
                setTimeout(() => syncBots().catch(() => {}), 2500);
            }
            return;
        }
        _scheduleRestart(clean);
    });

    child.on('error', (err) => {
        console.log(chalk.red(`[Supervisor] Bot +${clean} error: ${err.message}`));
    });

    console.log(chalk.green(`[Supervisor] ▶ Started isolated bot +${clean}${opts.pairing ? ' (pairing)' : ''}`));
    return child;
}

function _scheduleRestart(clean) {
    setTimeout(async () => {
        if (!_active) return;
        try {
            const { readStopped } = require('../allfunc/stopped-bots');
            if (readStopped().includes(clean)) return;

            const { getActiveLinkedNumbers } = require('../session-db');
            const linked = await getActiveLinkedNumbers().catch(() => []);
            const linkedClean = linked.map((n) => cleanBotNum(n));
            if (!linkedClean.includes(clean)) return;

            const entry = children.get(clean);
            if (entry) return;

            const hourAgo = Date.now() - 60 * 60 * 1000;
            const recent = (global._supervisorRestarts?.[clean] || []).filter((t) => t > hourAgo);
            if (recent.length >= MAX_RESTARTS_PER_HOUR) {
                console.log(chalk.red(`[Supervisor] +${clean} restart limit reached — skipping`));
                return;
            }
            if (!global._supervisorRestarts) global._supervisorRestarts = {};
            global._supervisorRestarts[clean] = [...recent, Date.now()];

            const ready = await _ensureBotSessionReady(clean);
            if (ready) spawnBot(clean);
        } catch (e) {
            console.log(chalk.yellow(`[Supervisor] Restart check failed for +${clean}: ${e.message}`));
        }
    }, RESTART_DELAY_MS);
}

function _hasRegisteredCreds(clean) {
    const sessionPath = path.join(__dirname, '..', 'nexstore', 'pairing', `${clean}@s.whatsapp.net`, 'creds.json');
    const altPath = path.join(__dirname, '..', 'nexstore', 'pairing', clean, 'creds.json');
    for (const p of [sessionPath, altPath]) {
        try {
            if (!fs.existsSync(p)) continue;
            const creds = JSON.parse(fs.readFileSync(p, 'utf8'));
            if (creds?.registered || creds?.me?.id) return true;
        } catch (_) {}
    }
    return false;
}

/** Local creds OR restore from MongoDB/PostgreSQL after dyno restart */
async function _ensureBotSessionReady(clean) {
    if (_hasRegisteredCreds(clean)) return true;
    try {
        const { ensureSessionRestored } = require('../session-db');
        const ok = await ensureSessionRestored(clean);
        if (ok) {
            console.log(chalk.cyan(`[Supervisor] 📥 Restored +${clean} session from DB for auto-reconnect`));
        }
        return ok;
    } catch (e) {
        console.log(chalk.yellow(`[Supervisor] Session restore failed for +${clean}: ${e.message}`));
        return false;
    }
}

function markBotPromoted(botNum) {
    const clean = cleanBotNum(botNum);
    const entry = children.get(clean);
    if (entry) entry.pairing = false;
}

function promotePairingToNormal(botNum) {
    const clean = cleanBotNum(botNum);
    if (!clean) return false;
    const entry = children.get(clean);
    if (!entry?.pairing) return false;
    if (!_hasRegisteredCreds(clean)) return false;

    console.log(chalk.cyan(`[Supervisor] 🔄 Promoting +${clean} pairing child → full bot`));
    killBot(clean, 'SIGTERM');
    setTimeout(() => {
        if (!_active || children.has(clean)) return;
        spawnBot(clean);
    }, 2500);
    return true;
}

async function syncBots() {
    try {
        const { syncStoppedWithLinkedNumbers } = require('../allfunc/stopped-bots');
        await syncStoppedWithLinkedNumbers();
    } catch (_) {}

    const { getActiveLinkedNumbers } = require('../session-db');
    const { readStopped } = require('../allfunc/stopped-bots');

    const linked = (await getActiveLinkedNumbers().catch(() => []))
        .map((n) => cleanBotNum(n))
        .filter(Boolean);
    const stopped = new Set(readStopped());
    const linkedSet = new Set(linked.filter((n) => !stopped.has(n)));

    const { isConnected } = require('../allfunc/connected-flag');

    // Backup: restart pairing-only child as full bot once linked + registered (stuck state)
    for (const [clean, entry] of [...children]) {
        if (!entry?.pairing) continue;
        if (global._pairingInFlight?.has(clean)) continue;
        if (!linkedSet.has(clean)) continue;
        if (_hasRegisteredCreds(clean) && isConnected(clean)) {
            promotePairingToNormal(clean);
        }
    }

    // Start bots that should be running (restore DB session after Heroku/dyno restart)
    for (const clean of linkedSet) {
        if (global._pairingInFlight?.has(clean)) continue;
        if (!children.has(clean)) {
            const ready = await _ensureBotSessionReady(clean);
            if (ready) spawnBot(clean);
        }
    }

    // Stop bots no longer linked or stopped (never kill active pairing children)
    for (const [clean, entry] of children) {
        if (entry?.pairing) continue;
        if (global._pairingInFlight?.has(clean)) continue;
        if (!linkedSet.has(clean)) killBot(clean);
    }
}

function deleteFolderRecursive(p) {
    if (!fs.existsSync(p)) return;
    for (const f of fs.readdirSync(p)) {
        const cur = path.join(p, f);
        if (fs.lstatSync(cur).isDirectory()) deleteFolderRecursive(cur);
        else fs.unlinkSync(cur);
    }
    try { fs.rmdirSync(p); } catch (_) {}
}

async function handlePairingRequest(clean) {
    const num = cleanBotNum(clean);
    if (!num) return;

    if (!global._pairingInFlight) global._pairingInFlight = new Set();
    if (global._pairingInFlight.has(num)) return;
    global._pairingInFlight.add(num);
    console.log(chalk.cyan(`[Supervisor] 🔗 Pairing request for +${num} — spawning isolated pairing process`));

    try {
        const { removeFromStoppedBots } = require('../allfunc/stopped-bots');
        removeFromStoppedBots(num);

        killBot(num, 'SIGKILL');

        const jid = `${num}@s.whatsapp.net`;
        const sessionPath = path.join(__dirname, '..', 'nexstore', 'pairing', jid);
        if (fs.existsSync(sessionPath)) deleteFolderRecursive(sessionPath);

        try {
            const { deleteSessionCreds } = require('../session-db');
            await deleteSessionCreds(num);
        } catch (_) {}

        try {
            const pairingJson = path.join(__dirname, '..', 'nexstore', 'pairing', 'pairing.json');
            if (fs.existsSync(pairingJson)) fs.unlinkSync(pairingJson);
        } catch (_) {}

        ensureBotWorkspace(num);
        spawnBot(num, { pairing: true, force: true, noRestart: true });

        const { getPairingState, markPairingFailed } = require('../server/db-service');
        const deadline = Date.now() + 120_000;
        let gotCode = false;
        while (Date.now() < deadline) {
            const st = await getPairingState(num).catch(() => null);
            if (st?.code) { gotCode = true; break; }
            await new Promise((r) => setTimeout(r, 200));
        }
        if (!gotCode) {
            console.log(chalk.red(`[Supervisor] Pairing timeout for +${num} — no code in DB`));
            await markPairingFailed(num).catch(() => {});
            killBot(num, 'SIGTERM');
        } else {
            console.log(chalk.green(`[Supervisor] Pairing code ready for +${num}`));
        }
    } finally {
        global._pairingInFlight.delete(num);
    }
}

function stopBotExternal(number) {
    const clean = cleanBotNum(number);
    killBot(clean, 'SIGKILL');
}

function startSupervisor() {
    if (_active) return;
    _active = true;

    console.log(chalk.cyan('\n╔══════════════════════════════════════════╗'));
    console.log(chalk.cyan('║  BOT SUPERVISOR — One Process Per Number  ║'));
    console.log(chalk.cyan('╚══════════════════════════════════════════╝\n'));

    const runSync = () => syncBots().catch((e) => {
        console.log(chalk.yellow(`[Supervisor] syncBots: ${e.message}`));
    });
    runSync();
    // Fast reconnect sweep after worker/dyno restart (ephemeral disk is empty)
    [3000, 8000, 20000, 45000].forEach((ms) => setTimeout(runSync, ms));
    _syncTimer = setInterval(runSync, SYNC_INTERVAL_MS);

    // Patch pair.js stopBot so web/worker cleanup kills child processes
    try {
        const pairMod = require('../pair');
        const origStop = pairMod.stopBot?.bind(pairMod);
        pairMod.stopBot = function patchedStopBot(number) {
            const clean = cleanBotNum(number);
            const entry = children.get(clean);
            if (entry?.pairing || global._pairingInFlight?.has(clean)) {
                console.log(chalk.yellow(`[Supervisor] stopBot ignored during pairing for +${clean}`));
                return;
            }
            stopBotExternal(number);
            if (typeof origStop === 'function') origStop(number);
        };
    } catch (_) {}

    return {
        isActive: () => _active,
        syncBots,
        spawnBot,
        killBot,
        stopBotExternal,
        handlePairingRequest,
        getChildren: () => [...children.keys()],
    };
}

function stopSupervisor() {
    _active = false;
    if (_syncTimer) clearInterval(_syncTimer);
    for (const clean of [...children.keys()]) killBot(clean);
}

module.exports = {
    startSupervisor,
    stopSupervisor,
    isSupervisorActive,
    syncBots,
    spawnBot,
    killBot,
    stopBotExternal,
    handlePairingRequest,
    markBotPromoted,
    promotePairingToNormal,
};
