'use strict';

/**
 * Per-bot isolated workspace — each connected number gets its own directory:
 *   database/bots/<botNum>/
 *
 * All commands, settings, mute lists, prefixes, etc. live inside that folder.
 * Used when BOT_NUMBER is set (one process per bot on the worker dyno).
 */

const fs = require('fs');
const path = require('path');

const GLOBAL_DATABASE = './database';
const BOTS_ROOT = path.join(GLOBAL_DATABASE, 'bots');

function cleanBotNum(value) {
    return String(value || '').replace(/[^0-9]/g, '');
}

function isBotIsolated() {
    return Boolean(cleanBotNum(process.env.BOT_NUMBER));
}

function getBotDir(botNum = process.env.BOT_NUMBER) {
    const clean = cleanBotNum(botNum);
    if (!clean) return null;
    return path.join(BOTS_ROOT, clean);
}

function getBotConfigPaths(botNum = process.env.BOT_NUMBER) {
    const dir = getBotDir(botNum);
    if (!dir) return null;
    return {
        root: dir,
        meta: path.join(dir, 'bot_meta.json'),
        muted: path.join(dir, 'muted.json'),
        sudo: path.join(dir, 'sudo.json'),
        prefixes: path.join(dir, 'prefixes.json'),
        antilink: path.join(dir, 'antilink_settings.json'),
        anticall: path.join(dir, 'anticall_config.json'),
        anticallMsg: path.join(dir, 'anticall_msg.json'),
        stickerCmds: path.join(dir, 'stickercmds.json'),
        warnLimit: path.join(dir, 'warnlimit.json'),
        lockSettings: path.join(dir, 'lock_settings.json'),
        antigroupmention: path.join(dir, 'antigroupmention.json'),
        antiedit: path.join(dir, 'antiedit_config.json'),
        antidelete: path.join(dir, 'antidelete_config.json'),
        setting: path.join(dir, 'setting.json'),
        broadcastSettings: path.join(dir, 'broadcast_settings.json'),
        privateChats: path.join(dir, 'private_chats.json'),
        groups: path.join(dir, 'groups.json'),
        antideleteStore: path.join(dir, 'antidelete_store.json'),
        antideletePending: path.join(dir, 'antidelete_pending.json'),
    };
}

function _writeDefault(file, data) {
    if (!fs.existsSync(file)) {
        fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
    }
}

function ensureBotWorkspace(botNum) {
    const clean = cleanBotNum(botNum);
    if (!clean) throw new Error('ensureBotWorkspace requires a valid bot number');

    const paths = getBotConfigPaths(clean);
    fs.mkdirSync(paths.root, { recursive: true });
    fs.mkdirSync(path.join('tmp', 'antidelete_media', clean), { recursive: true });

    _writeDefault(paths.muted, {});
    _writeDefault(paths.sudo, []);
    _writeDefault(paths.prefixes, {});
    _writeDefault(paths.antilink, {});
    _writeDefault(paths.anticall, { mode: 'off' });
    _writeDefault(paths.anticallMsg, { msg: null });
    _writeDefault(paths.stickerCmds, {});
    _writeDefault(paths.warnLimit, {});
    _writeDefault(paths.lockSettings, { locked: false });
    _writeDefault(paths.antigroupmention, {});
    _writeDefault(paths.antiedit, { mode: 'off' });
    _writeDefault(paths.antidelete, { mode: 'private', enabled: true, autoEnabled: true });
    _writeDefault(paths.setting, {});
    _writeDefault(paths.broadcastSettings, {});
    _writeDefault(paths.privateChats, {});
    _writeDefault(paths.groups, {});

    const meta = {
        botNum: clean,
        createdAt: fs.existsSync(paths.meta)
            ? (JSON.parse(fs.readFileSync(paths.meta, 'utf-8')).createdAt || new Date().toISOString())
            : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isolated: true,
    };
    fs.writeFileSync(paths.meta, JSON.stringify(meta, null, 2), 'utf-8');

    console.log(`[BotWorkspace] ✅ Isolated workspace ready: ${paths.root}`);
    return paths;
}

/** Resolve a path — per-bot when isolated, global otherwise */
function resolveBotPath(globalRelPath, botRelName) {
    if (!isBotIsolated()) return globalRelPath;
    const paths = getBotConfigPaths();
    if (botRelName && paths[botRelName]) return paths[botRelName];
    return path.join(paths.root, path.basename(globalRelPath));
}

module.exports = {
    cleanBotNum,
    isBotIsolated,
    getBotDir,
    getBotConfigPaths,
    ensureBotWorkspace,
    resolveBotPath,
    BOTS_ROOT,
};
