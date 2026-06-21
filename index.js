
const fs = require('fs');
const path = require('path');
// Shared stop list — blocks reconnect across all pair.js module instances
if (!global.stoppedBots) global.stoppedBots = new Set();
const readline = require('readline');
const chalk = require('chalk');
const figlet = require('figlet');
const { startupPassword } = require('./nexstore/token');
const { startKeepAlive } = require('./keepalive');

const AUTH_FILE = './auth.json';
const PAIRING_DIR = './nexstore/pairing/';
const startpairing = require('./pair');
const { getActiveLinkedNumbers, ensureSessionRestored } = require('./session-db');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function isAuthenticated() {
    if (!fs.existsSync(AUTH_FILE)) return false;
    try {
        const data = JSON.parse(fs.readFileSync(AUTH_FILE));
        return Boolean(data && data.authenticated);
    } catch (err) {
        console.log(chalk.yellow(`⚠️  auth.json could not be parsed (${err.message}); treating as unauthenticated`));
        return false;
    }
}

function setAuthenticated(value) {
    fs.writeFileSync(AUTH_FILE, JSON.stringify({ authenticated: value }));
}

const autoLoadPairs = async () => {
    // ✅ FIX: Supervisor chal raha hai to direct pair() band karo — 440 loop rokne ke liye
    // start-whatsapp.js ne Supervisor start kar diya hai jo isolated threads mein bots chalata hai
    // Index.js ka apna autoLoadPairs bhi chale to = 2 connections → Error 440 loop
    const { shouldRunWhatsAppSupervisor } = require('./allfunc/whatsapp-host');
    if (shouldRunWhatsAppSupervisor()) {
        console.log(chalk.gray('[index.js] ℹ️  Supervisor chal raha hai — autoLoadPairs skip (Supervisor handles bots)'));
        return;
    }
    console.log(chalk.cyan('🔄 Auto-loading all paired users...'));

    let allUsers = [];
    for (let attempt = 1; attempt <= 5; attempt++) {
        try {
            const webLinked = await getActiveLinkedNumbers();
            allUsers = (webLinked || []).map(n => {
                const clean = String(n).replace(/[^0-9]/g, '');
                return clean ? `${clean}@s.whatsapp.net` : null;
            }).filter(Boolean);
            if (allUsers.length > 0) {
                console.log(chalk.green(`🌐 Found ${allUsers.length} web-linked number(s) to reconnect.`));
                break;
            }
        } catch (e) {
            console.log(chalk.yellow(`⚠️  Could not read web-linked numbers (attempt ${attempt}/5): ${e.message}`));
        }
        if (allUsers.length === 0 && attempt < 5) {
            console.log(chalk.yellow(`⏳ DB returned 0 numbers (attempt ${attempt}/5) — retrying in 8s...`));
            await delay(8000);
        }
    }

    if (allUsers.length === 0) {
        console.log(chalk.yellow('ℹ️  No web-linked active numbers found after 5 attempts. Nothing to reconnect.'));
        return;
    }

    console.log(chalk.green(`✅ Total ${allUsers.length} user(s) to reconnect.`));
    await delay(500);

    const connectOne = async (userNumber, idx) => {
        const cleanNum   = userNumber.replace(/[^0-9]/g, '');
        const sessionPath = path.join(PAIRING_DIR, cleanNum);
        try {
            const credsPath = path.join(sessionPath, 'creds.json');
            if (!fs.existsSync(credsPath)) {
                console.log(chalk.blue(`🔁 Restoring session from DB for ${userNumber}...`));
                const restored = await ensureSessionRestored(cleanNum);
                if (!restored) {
                    console.log(chalk.yellow(`⚠️  No DB backup for ${userNumber} — skipping (needs re-pair).`));
                    return;
                }
            }
            // ✅ FIX: Validate creds before connecting — skip if invalid/corrupt
            try {
                const creds = JSON.parse(fs.readFileSync(path.join(sessionPath, 'creds.json'), 'utf-8'));
                if (!creds || (!creds.registered && !creds.me && !creds.noiseKey)) {
                    console.log(chalk.yellow(`⚠️  Creds invalid for ${userNumber} — skipping (needs re-pair).`));
                    return;
                }
            } catch (parseErr) {
                console.log(chalk.yellow(`⚠️  Creds corrupt for ${userNumber} — skipping.`));
                return;
            }
            console.log(chalk.blue(`🔄 Connecting [${idx + 1}/${allUsers.length}]: ${userNumber}`));
            await startpairing(userNumber);
            console.log(chalk.green(`✅ Connected: ${userNumber}`));
        } catch (error) {
            console.log(chalk.red(`❌ Failed for ${userNumber}: ${error.message}`));
        }
    };

    const BATCH_SIZE = 3;
    for (let b = 0; b < allUsers.length; b += BATCH_SIZE) {
        const batch = allUsers.slice(b, b + BATCH_SIZE);
        await Promise.allSettled(batch.map((num, j) => connectOne(num, b + j)));
        if (b + BATCH_SIZE < allUsers.length) {
            console.log(chalk.cyan(`⏳ Batch done — next batch in 2s...`));
            await delay(2000);
        }
    }

    console.log(chalk.green('✅ All paired users processed.'));
};

const initializeBot = async () => {
    console.clear();
    console.log(chalk.cyan(figlet.textSync('ʀᴏʙɪɴ x ʙᴏᴛ ᴀᴄᴛɪᴠᴇ', {
        font: 'Standard',
        horizontalLayout: 'default',
        verticalLayout: 'default'
    })));
    
    console.log(chalk.yellow('\n⚄︎══════════════════════⚄︎'));
    console.log(chalk.green('𝗗𝗜𝗚𝗜𝗧Λ𝗟 𝗗𝗢𝗡'));
    console.log(chalk.yellow('⚄︎═════════════════════⚄︎\n'));

    await autoLoadPairs();

    if (isAuthenticated()) {
        console.log(chalk.green('✅ Welcome back! Skipping password...'));
        launchBot();
    } else if (process.env.STARTUP_PASSWORD) {
        if (process.env.STARTUP_PASSWORD === startupPassword) {
            console.log(chalk.green('✅ Heroku Config Var se auto-authenticate. Bot start ho raha hai...'));
            setAuthenticated(true);
            launchBot();
        } else {
            console.log(chalk.red('❌ STARTUP_PASSWORD galat hai!'));
            process.exit(1);
        }
    } else {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        rl.stdoutMuted = true;
        console.log(chalk.bold.yellow('🔐 Enter password to start bot:'));

        rl.question(chalk.green('Password: '), function (input) {
            if (input !== startupPassword) {
                console.log(chalk.red('\n❌ Incorrect password. Exiting...'));
                process.exit(1);
            }

            console.log(chalk.green('\n✅ Password correct. Starting bot system...'));
            setAuthenticated(true);
            rl.close();
            launchBot();
        });

        rl._writeToOutput = function _writeToOutput(stringToWrite) {
            if (rl.stdoutMuted) {
                rl.output.write(chalk.cyan('*'));
            } else {
                rl.output.write(stringToWrite);
            }
        };
    }
};

function launchBot() {
    console.clear();
    console.log(chalk.green('𝗗𝗜𝗚𝗜𝗧Λ𝗟 𝗗𝗢𝗡 sᴏʟᴏs ᴀʟʟ....\n'));

    try { startKeepAlive(); } catch (e) {}

    let telegramLoaded = false;
    let whatsappLoaded = false;

    const botPath = path.join(__dirname, 'bot.js');
    if (fs.existsSync(botPath)) {
        try {
            console.log(chalk.blue('📱 Loading Telegram pairing system...'));
            require('./bot');
            telegramLoaded = true;
            console.log(chalk.green('✅ 𝗗𝗜𝗚𝗜𝗧Λ𝗟 𝗗𝗢𝗡 ɪs sᴜᴄᴄᴇssғᴜʟʟʏ ᴀᴄᴛɪᴠᴇ'));
        } catch (error) {
            console.log(chalk.red('❌ Failed to load Telegram bot (bot.js):'));
            console.log(chalk.red('   Error:', error.message));
            console.log(chalk.yellow('⚠️  Continuing without Telegram bot...\n'));
        }
    } else {
        console.log(chalk.yellow('⚠️  bot.js not found, skipping Telegram bot...\n'));
    }

    const nexusPath = path.join(__dirname, 'case.js');
    if (fs.existsSync(nexusPath)) {
        try {
            console.log(chalk.blue('💬 Loading WhatsApp commands system...'));
            const nexusModule = require('./case');
            whatsappLoaded = true;
            console.log(chalk.green('✅ WhatsApp commands loaded successfully!'));
        } catch (error) {
            console.log(chalk.red('❌ Failed to load WhatsApp commands (case.js):'));
            console.log(chalk.red('   Error:', error.message));
            console.log(chalk.yellow('⚠️  Continuing without WhatsApp commands...\n'));
        }
    } else {
        console.log(chalk.yellow('⚠️  case.js not found, skipping WhatsApp commands...\n'));
    }

    console.log(chalk.cyan('\n⚄︎═══════════════════════════════⚄︎'));
    console.log(chalk.bold.white('  ʙᴏᴛ ɪɴɪᴛɪᴀʟɪᴢᴀᴛɪᴏɴ sᴜᴍᴍᴀʀʀʏ        '));
    console.log(chalk.cyan('⚄︎════════════════════════════════⚄︎'));
    console.log(telegramLoaded ? chalk.green( '𝗗𝗜𝗚𝗜𝗧Λ𝗟 𝗗𝗢𝗡: ᴀᴄᴛɪᴠᴇ ✅') : chalk.red('❌ 𝗗𝗜𝗚𝗜𝗧Λ𝗟 𝗗𝗢𝗡 2025'));
    console.log(whatsappLoaded ? chalk.green('✅ ᴡʜᴀᴛsᴀᴘᴘ ᴄᴏᴍᴍᴀɴᴅs: ᴀᴄᴛɪᴠᴇ') : chalk.red('❌ ᴡʜᴀᴛsᴀᴘᴘ ᴄᴏᴍᴍᴀᴍᴅs : ɪɴᴀᴄʏɪᴠᴇ'));
    console.log(chalk.cyan('⚄︎════════════════════════════════⚄︎\n'));

    if (!telegramLoaded && !whatsappLoaded) {
        console.log(chalk.red('⚠️  Warning: No bot systems loaded! Check your files.\n'));
    } else {
        console.log(chalk.green('✅ 𝗗𝗜𝗚𝗜𝗧Λ𝗟 𝗗𝗢𝗡 ᴀᴄᴛɪᴠᴇ!\n'));
    }

    const ignoredErrors = [
        'Socket connection timeout', 'EKEYTYPE', 'item-not-found',
        'rate-overlimit', 'Connection Closed', 'Timed Out', 'Value not found',
        'Connection Failure', 'ENOTFOUND', 'ECONNRESET', 'ETIMEDOUT',
        'ECONNREFUSED', 'socket hang up', 'stream ended unexpectedly',
        'Closing stale open session', 'Request timeout', 'Bad MAC',
        'Lost connection', 'connect ETIMEDOUT', 'read ECONNRESET',
        'write ECONNRESET', 'Connection reset', 'WebSocket closed',
        'Tag not found', 'Connection lost'
    ];

    process.on('unhandledRejection', (reason, promise) => {
        if (ignoredErrors.some(e => String(reason).includes(e))) return;
        console.log(chalk.red('\n⚠️  Unhandled Promise Rejection:'));
        console.log(chalk.yellow('Reason:'), String(reason).substring(0, 200));
    });

    process.on('uncaughtException', (error) => {
        if (ignoredErrors.some(e => String(error).includes(e))) return;
        console.log(chalk.red('\n❌ Uncaught Exception (bot staying alive):'));
        console.log(chalk.yellow('Error:'), error.message);
    });

    const originalConsoleError = console.error;
    console.error = function (message, ...optionalParams) {
        if (typeof message === 'string' && ignoredErrors.some(e => message.includes(e))) return;
        originalConsoleError.apply(console, [message, ...optionalParams]);
    };

    const originalStderrWrite = process.stderr.write;
    process.stderr.write = function (message, encoding, fd) {
        if (typeof message === 'string' && ignoredErrors.some(e => message.includes(e))) return;
        originalStderrWrite.apply(process.stderr, arguments);
    };

    console.log(chalk.blue('📊 Bot monitoring active...'));
    console.log(chalk.gray('Press Ctrl+C to stop the bot\n'));
}

// ✅ FIX: AUTO-RESTART har 4 ghante — 8 se 4 kar diya
// Session DB mein flush hoti hai (supervisor graceful shutdown se)
// Heroku/Replit automatically process restart karta hai process.exit(0) ke baad
const _RESTART_HOURS = parseInt(process.env.BOT_RESTART_HOURS || '4', 10);
const _RESTART_MS = _RESTART_HOURS * 60 * 60 * 1000;

setTimeout(async () => {
    console.log(chalk.cyan(`\n🔄 Auto-restart: ${_RESTART_HOURS} hours elapsed — flushing sessions then restarting...`));
    
    // ✅ FIX: Session DB mein save karo restart se pehle
    try {
        const { backupSessionFolder } = require('./session-db');
        const pairingDir = './nexstore/pairing';
        if (fs.existsSync(pairingDir)) {
            const dirs = fs.readdirSync(pairingDir, { withFileTypes: true })
                .filter(d => d.isDirectory())
                .map(d => d.name);
            
            for (const dir of dirs) {
                const cleanNum = dir.replace(/[^0-9]/g, '');
                if (!cleanNum) continue;
                const sessionPath = `${pairingDir}/${dir}`;
                try {
                    await backupSessionFolder(cleanNum, sessionPath);
                    console.log(chalk.green(`✅ Session backed up: ${cleanNum}`));
                } catch (e) {
                    console.log(chalk.yellow(`⚠️  Backup failed for ${cleanNum}: ${e.message}`));
                }
            }
        }
    } catch (flushErr) {
        console.log(chalk.yellow(`⚠️  Pre-restart session flush error: ${flushErr.message}`));
    }
    
    console.log(chalk.cyan('✅ Sessions flushed. Restarting now...'));
    await new Promise(r => setTimeout(r, 1000)); // 1s wait for writes to complete
    process.exit(0);
}, _RESTART_MS);

console.log(chalk.gray(`⏰ Auto-restart scheduled in ${_RESTART_HOURS} hours (env: BOT_RESTART_HOURS)`));

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log(chalk.yellow('\n\n⚠️  Shutting down gracefully...'));
    console.log(chalk.green('👋 Goodbye!'));
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log(chalk.yellow('\n\n⚠️  Received termination signal...'));
    process.exit(0);
});

initializeBot().catch((error) => {
    console.log(chalk.red('\n❌ Fatal error during initialization:'));
    console.log(chalk.yellow('Error:'), error.message);
    if (error.stack) console.log(chalk.gray(error.stack));
    process.exit(1);
});
