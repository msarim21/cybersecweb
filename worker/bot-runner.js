'use strict';

/**
 * Single-bot worker process — ONE WhatsApp number per Node.js process.
 * Complete isolation: own memory, own globals, own config files.
 *
 * Started by worker/supervisor.js with:
 *   BOT_NUMBER=923001234567 node worker/bot-runner.js
 */

process.env.WHATSAPP_WORKER = '1';

const botNumArg = process.argv[2] || process.env.BOT_NUMBER || '';
const { cleanBotNum, ensureBotWorkspace } = require('../allfunc/bot-workspace');

const BOT_NUMBER = cleanBotNum(botNumArg);
if (!BOT_NUMBER) {
    console.error('[BotRunner] ❌ BOT_NUMBER missing — exiting');
    process.exit(1);
}

process.env.BOT_NUMBER = BOT_NUMBER;
global.__ISOLATED_BOT = BOT_NUMBER;

const chalk = require('chalk');
const path = require('path');
const fs = require('fs');

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

const ignoredErrors = [
    'Socket connection timeout', 'EKEYTYPE', 'item-not-found',
    'rate-overlimit', 'Connection Closed', 'Timed Out',
    'Connection Failure', 'ENOTFOUND', 'ECONNRESET', 'ETIMEDOUT',
    'Bad MAC', 'WebSocket closed', 'Connection lost', '440',
];

process.on('unhandledRejection', (reason) => {
    if (ignoredErrors.some((e) => String(reason).includes(e))) return;
    console.log(chalk.yellow(`[BotRunner:${BOT_NUMBER}] Unhandled rejection:`, String(reason).substring(0, 120)));
});

process.on('uncaughtException', (err) => {
    if (ignoredErrors.some((e) => String(err).includes(e))) return;
    console.log(chalk.yellow(`[BotRunner:${BOT_NUMBER}] Uncaught exception:`, err.message));
});

let _shuttingDown = false;

async function ensureDbReady(maxWaitMs = 60000) {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
        try {
            const { initDb, isDbReady } = require('../server/db');
            await initDb();
            if (isDbReady()) return true;
        } catch (e) {
            console.log(chalk.yellow(`[BotRunner:${BOT_NUMBER}] DB wait: ${e.message}`));
        }
        await delay(3000);
    }
    return false;
}

function hasValidCreds(sessionPath) {
    const credsFile = path.join(sessionPath, 'creds.json');
    if (!fs.existsSync(credsFile)) return false;
    try {
        JSON.parse(fs.readFileSync(credsFile, 'utf8'));
        return true;
    } catch {
        return false;
    }
}

async function restoreSessionIfNeeded(jid) {
    try {
        const { ensureSessionRestored } = require('../session-db');
        const ok = await ensureSessionRestored(BOT_NUMBER);
        if (ok) console.log(chalk.green(`[BotRunner:${BOT_NUMBER}] ✅ Session ready (local or restored from DB)`));
        return ok;
    } catch (e) {
        console.log(chalk.yellow(`[BotRunner:${BOT_NUMBER}] Restore failed: ${e.message}`));
        return false;
    }
}

async function runBot() {
    console.log(chalk.cyan(`\n╔══════════════════════════════════════╗`));
    console.log(chalk.cyan(`║  ISOLATED BOT: +${BOT_NUMBER}`.padEnd(39) + `║`));
    console.log(chalk.cyan(`╚══════════════════════════════════════╝\n`));

    ensureBotWorkspace(BOT_NUMBER);

    require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
    require('../setting/config');

    const isPairing = process.env.BOT_PAIRING === '1';

    await ensureDbReady(isPairing ? 15000 : 60000);

    // Skip heavy case.js during pairing — only pair.js needed (~3–5s faster)
    if (!isPairing) {
        try {
            require('../case');
            console.log(chalk.green(`[BotRunner:${BOT_NUMBER}] ✅ Command handler loaded`));
        } catch (e) {
            console.log(chalk.yellow(`[BotRunner:${BOT_NUMBER}] case.js warning: ${e.message}`));
        }
    } else {
        console.log(chalk.cyan(`[BotRunner:${BOT_NUMBER}] ⚡ Pairing mode — skipping case.js for speed`));
    }

    const jid = `${BOT_NUMBER}@s.whatsapp.net`;

    if (!isPairing) {
        const { readStopped } = require('../allfunc/stopped-bots');
        if (readStopped().includes(BOT_NUMBER)) {
            console.log(chalk.yellow(`[BotRunner:${BOT_NUMBER}] Stopped — exiting`));
            process.exit(0);
        }
    }

    if (!isPairing) {
        const restored = await restoreSessionIfNeeded(jid);
        if (!restored) {
            console.log(chalk.yellow(`[BotRunner:${BOT_NUMBER}] No saved session in DB — pair once via website`));
            process.exit(0);
        }
    }

    const startpairing = require('../pair');

    console.log(chalk.blue(`[BotRunner:${BOT_NUMBER}] Connecting WhatsApp...`));
    await startpairing(jid);

    // Minimal keepalive — only this bot's socket
    const { startBotChildKeepAlive } = require('../keepalive');
    startBotChildKeepAlive();

    // Flush pending antidelete reports for this bot
    try {
        const sock = startpairing._getTracker?.()?.get(jid)?.connection
            || startpairing._getTracker?.()?.get(BOT_NUMBER)?.connection;
        if (sock && typeof global._adFlushPendingReports === 'function') {
            global._adFlushPendingReports(sock, BOT_NUMBER, `${BOT_NUMBER}@s.whatsapp.net`).catch(() => {});
        }
    } catch (_) {}

    const { touchBotHeartbeat } = require('../allfunc/bot-heartbeat');
    touchBotHeartbeat(BOT_NUMBER, { phase: 'started' });
    if (!global._botHeartbeatTimer) {
        global._botHeartbeatTimer = setInterval(() => {
            try {
                const pairMod = require('../pair');
                const jid = `${BOT_NUMBER}@s.whatsapp.net`;
                const tracker = pairMod._getTracker?.()?.get(jid) || pairMod._getTracker?.()?.get(BOT_NUMBER);
                const ws = tracker?.connection?.ws;
                touchBotHeartbeat(BOT_NUMBER, {
                    wsState: ws?.readyState ?? -1,
                    connected: Boolean(tracker?.connection?.user),
                });
            } catch (_) {
                touchBotHeartbeat(BOT_NUMBER);
            }
        }, 60_000);
    }

    console.log(chalk.green(`[BotRunner:${BOT_NUMBER}] 🟢 Running in isolated mode`));
}

async function shutdown() {
    if (_shuttingDown) return;
    _shuttingDown = true;
    console.log(chalk.yellow(`[BotRunner:${BOT_NUMBER}] Shutting down...`));
    try {
        const { backupSessionFolder } = require('../session-db');
        const jid = `${BOT_NUMBER}@s.whatsapp.net`;
        const sessionPath = path.join(__dirname, '..', 'nexstore', 'pairing', jid);
        await backupSessionFolder(BOT_NUMBER, sessionPath).catch(() => {});
    } catch (_) {}
    try {
        const pairMod = require('../pair');
        if (typeof pairMod.stopBot === 'function') pairMod.stopBot(BOT_NUMBER);
    } catch (_) {}
    setTimeout(() => process.exit(0), 1500);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

runBot().catch((err) => {
    console.error(chalk.red(`[BotRunner:${BOT_NUMBER}] Fatal:`, err.message));
    setTimeout(() => process.exit(1), 5000);
});
