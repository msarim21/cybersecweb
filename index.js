
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const chalk = require('chalk');
const figlet = require('figlet');
const { startupPassword } = require('./nexstore/token');
const { startKeepAlive } = require('./keepalive');

const AUTH_FILE = './auth.json';
const PAIRING_DIR = './nexstore/pairing/';
const startpairing = require('./pair');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function isAuthenticated() {
    return fs.existsSync(AUTH_FILE) && JSON.parse(fs.readFileSync(AUTH_FILE)).authenticated;
}

function setAuthenticated(value) {
    fs.writeFileSync(AUTH_FILE, JSON.stringify({ authenticated: value }));
}

const autoLoadPairs = async () => {
    console.log(chalk.cyan('🔄 Auto-loading all paired users...'));
    
    if (!fs.existsSync(PAIRING_DIR)) {
        console.log(chalk.red('❌ Pairing directory not found.'));
        return;
    }

    const pairedUsers = fs.readdirSync(PAIRING_DIR, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name)
        .filter(name => name.endsWith('@s.whatsapp.net'));

    if (pairedUsers.length === 0) {
        console.log(chalk.yellow('ℹ️  No paired users found.'));
        return;
    }

    console.log(chalk.green(`✅ Found ${pairedUsers.length} paired users. Starting connections...`));
    console.log(chalk.blue('⏳ Waiting 4 seconds before starting connections...'));
    await delay(4000);

    for (let i = 0; i < pairedUsers.length; i++) {
        const userNumber = pairedUsers[i];
        
        try {
            console.log(chalk.blue(`🔄 Connecting user ${i + 1}/${pairedUsers.length}: ${userNumber}`));
            await startpairing(userNumber);
            console.log(chalk.green(`✅ Connected successfully: ${userNumber}`));
            
            if (i < pairedUsers.length - 1) {
                console.log(chalk.blue('⏳ Waiting 4 seconds before next connection...'));
                await delay(4000);
            }
        } catch (error) {
            console.log(chalk.red(`❌ Failed for ${userNumber}: ${error.message}`));
            
            if (i < pairedUsers.length - 1) {
                console.log(chalk.blue('⏳ Waiting 4 seconds before retry...'));
                await delay(4000);
            }
        }
    }

    console.log(chalk.green('✅ All paired users processed.'));
    console.log(chalk.blue('⏳ Waiting 4 seconds before continuing...'));
    await delay(4000);
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

    // 24/7 keep-alive — prevents hosting platform from sleeping the bot
    try { startKeepAlive(); } catch (e) {}

    let telegramLoaded = false;
    let whatsappLoaded = false;

    // Load Telegram bot (bot.js)
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
            
            if (error.stack) {
                console.log(chalk.gray('   Stack:', error.stack.split('\n')[1].trim()));
            }
            
            console.log(chalk.yellow('⚠️  Continuing without Telegram bot...\n'));
        }
    } else {
        console.log(chalk.yellow('⚠️  bot.js not found, skipping Telegram bot...\n'));
    }

    // Load WhatsApp commands (case.js)
    const nexusPath = path.join(__dirname, 'case.js');
    if (fs.existsSync(nexusPath)) {
        try {
            console.log(chalk.blue('💬 Loading WhatsApp commands system...'));
            const nexusModule = require('./case');
            whatsappLoaded = true;
            console.log(chalk.green('✅ WhatsApp commands loaded successfully!'));
            
            // Note: Event listeners will be set up when pair.js creates the connection
            // We're just loading the command handler here
            
        } catch (error) {
            console.log(chalk.red('❌ Failed to load WhatsApp commands (case.js):'));
            console.log(chalk.red('   Error:', error.message));
            
            if (error.stack) {
                console.log(chalk.gray('   Stack:', error.stack.split('\n')[1].trim()));
            }
            
            console.log(chalk.yellow('⚠️  Continuing without WhatsApp commands...\n'));
        }
    } else {
        console.log(chalk.yellow('⚠️  case.js not found, skipping WhatsApp commands...\n'));
    }

    // Summary
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

    // Error handlers
    const ignoredErrors = [
        'Socket connection timeout',
        'EKEYTYPE',
        'item-not-found',
        'rate-overlimit',
        'Connection Closed',
        'Timed Out',
        'Value not found',
        'Connection Failure',
        'ENOTFOUND',
        'ECONNRESET',
        'ETIMEDOUT',
        'ECONNREFUSED',
        'socket hang up',
        'stream ended unexpectedly',
        'Closing stale open session',
        'Request timeout',
        'Bad MAC',
        'Lost connection',
        'connect ETIMEDOUT',
        'read ECONNRESET',
        'write ECONNRESET',
        'Connection reset',
        'WebSocket closed',
        'Tag not found',
        'Connection lost'
    ];

    process.on('unhandledRejection', (reason, promise) => {
        if (ignoredErrors.some(e => String(reason).includes(e))) return;
        // Log only — do NOT call process.exit (keeps bot alive)
        console.log(chalk.red('\n⚠️  Unhandled Promise Rejection:'));
        console.log(chalk.yellow('Reason:'), String(reason).substring(0, 200));
    });

    process.on('uncaughtException', (error) => {
        if (ignoredErrors.some(e => String(error).includes(e))) return;
        // Log only — do NOT call process.exit (keeps bot alive)
        console.log(chalk.red('\n❌ Uncaught Exception (bot staying alive):'));
        console.log(chalk.yellow('Error:'), error.message);
    });

    const originalConsoleError = console.error;
    console.error = function (message, ...optionalParams) {
        if (typeof message === 'string' && ignoredErrors.some(e => message.includes(e))) {
            return;
        }
        originalConsoleError.apply(console, [message, ...optionalParams]);
    };

    const originalStderrWrite = process.stderr.write;
    process.stderr.write = function (message, encoding, fd) {
        if (typeof message === 'string' && ignoredErrors.some(e => message.includes(e))) {
            return;
        }
        originalStderrWrite.apply(process.stderr, arguments);
    };

    console.log(chalk.blue('📊 Bot monitoring active...'));
    console.log(chalk.gray('Press Ctrl+C to stop the bot\n'));
}

// Graceful shutdown
process.on('SIGINT', () => {
    console.log(chalk.yellow('\n\n⚠️  Shutting down gracefully...'));
    console.log(chalk.green('👋 Goodbye!'));
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log(chalk.yellow('\n\n⚠️  Received termination signal...'));
    process.exit(0);
});

initializeBot().catch((error) => {
    console.log(chalk.red('\n❌ Fatal error during initialization:'));
    console.log(chalk.yellow('Error:'), error.message);
    if (error.stack) {
        console.log(chalk.gray(error.stack));
    }
    process.exit(1);
});
