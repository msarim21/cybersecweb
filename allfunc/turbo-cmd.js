'use strict';

const os = require('os');

let _menuSkeleton = null;

function _menuCategories(prefix, bugUnlocked) {
    const bug = bugUnlocked ? `│❖ ${prefix}bugmenu\n│❖ ${prefix}simdatabase\n` : '';
    return `│❖ ${prefix}allmenu
│❖ ${prefix}aimenu
│❖ ${prefix}animemenu
${bug}│❖ ${prefix}downloadmenu
│❖ ${prefix}funmenu
│❖ ${prefix}gamemenu
│❖ ${prefix}groupmenu
│❖ ${prefix}logomenu
│❖ ${prefix}ownermenu
│❖ ${prefix}stickermenu
│❖ ${prefix}toolsmenu
│❖ ${prefix}tvmenu
│❖ ${prefix}tradingmenu
│❖ ${prefix}bcmenu
│❖ ${prefix}voicemenu
│❖ ${prefix}othermenu`;
}

function buildMenuText({ pushname, prefix, sender, botMode, totalCommands }) {
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening';
    const uptime = `${Math.floor(process.uptime() / 3600)}h ${Math.floor((process.uptime() % 3600) / 60)}m`;
    const ram = `${((os.totalmem() - os.freemem()) / 1073741824).toFixed(1)}GB / ${(os.totalmem() / 1073741824).toFixed(1)}GB`;
    const senderTag = String(sender || '').split('@')[0].split(':')[0];

    return `┏━━◆ *CYBER - 𝐌𝐀𝐈𝐍 𝐌𝐄𝐍𝐔* ◆━━┓
┃ ⧎ ʜᴇʟʟᴏ  ${pushname}
┃ ⧎ ʙᴏᴛ ɴᴀᴍᴇ 「 *CYBER* 」
┃ ⧎ ᴠᴇʀsɪᴏɴ : *1.1*
┃ ⧎ ᴏᴡɴᴇʀ : *GAME CHANGER*
┃ ⧎ ᴍᴏᴅᴇ : *${botMode}*
┃ ⧎ ʀᴜɴᴛɪᴍᴇ : ${uptime}
┃ ⧎ ᴘʀᴇғɪx : 「 ${prefix} 」
┃ ⧎ ʀᴀᴍ : ${ram}
┃ ⧎ ᴄᴏᴍᴍᴀɴᴅs : ${totalCommands || '500+'} total
┃ *${greeting}*, @${senderTag}
┗━━━━━━━━━━━━━━━━━━━━┛

┏━━◆ *CYBER - 𝐌𝐄𝐍𝐔 𝐂𝐀𝐓𝐄𝐆𝐎𝐑𝐈𝐄𝐒* ◆━━┓
${_menuCategories(prefix, false)}
┗━━━━━━━━━━━━━━━━━━━━┛

⚙️ *Powered by ❖ 𝐂𝐘𝐁𝐄𝐑 𝐒𝐄𝐂 𝐏𝐑𝐎 ❖* | © 2026`;
}

const TURBO_COMMANDS = new Set([
    'menu', 'cyber', 'ping', 'speed', 'alive', 'runtime', 'uptime',
]);

function isTurboCommand(cmd) {
    return TURBO_COMMANDS.has(String(cmd || '').toLowerCase());
}

/**
 * Handle hot commands without running the 4000-line case.js preamble.
 * Returns true if handled.
 */
async function tryTurboCommand(devtrust, m, ctx) {
    const cmd = String(ctx.command || '').toLowerCase();
    if (!isTurboCommand(cmd)) return false;

    const chat = m.chat || m.key?.remoteJid;
    if (!chat) return false;

    const send = (payload) => devtrust.sendMessage(chat, payload, { priority: true, quoted: m });

    if (cmd === 'ping' || cmd === 'speed') {
        const t1 = process.hrtime.bigint();
        const t2 = process.hrtime.bigint();
        const ms = Number(t2 - t1) / 1e6;
        await send({ text: `⚡ *CYBER Ping*\n\n📡 ${ms.toFixed(2)} ms` });
        return true;
    }

    if (cmd === 'alive' || cmd === 'runtime' || cmd === 'uptime') {
        const up = process.uptime();
        const h = Math.floor(up / 3600);
        const min = Math.floor((up % 3600) / 60);
        const sec = Math.floor(up % 60);
        await send({ text: `✅ *CYBER BOT ALIVE*\n\n⏱ Uptime: ${h}h ${min}m ${sec}s\n🤖 Mode: ${ctx.botMode || 'PUBLIC'}` });
        return true;
    }

    if (cmd === 'menu' || cmd === 'cyber') {
        const text = buildMenuText({
            pushname: ctx.pushname || m.pushName || 'User',
            prefix: ctx.prefix || '.',
            sender: m.sender,
            botMode: ctx.botMode || 'PUBLIC',
            totalCommands: ctx.totalCommands,
        });
        await send({ text });
        devtrust.sendMessage(chat, { react: { text: '🥀', key: m.key } }, { priority: true }).catch(() => {});
        return true;
    }

    return false;
}

module.exports = { tryTurboCommand, isTurboCommand, buildMenuText, TURBO_COMMANDS };
