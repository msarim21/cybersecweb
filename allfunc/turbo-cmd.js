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

// NOTE: 'menu' and 'cyber' removed from turbo set.
// They are handled exclusively by the switch in case.js using plain sendMessage
// so they work reliably on "message yourself" (self-chat / append messages).
const TURBO_COMMANDS = new Set([
    'ping', 'speed', 'alive', 'runtime', 'uptime',
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
        const _t1 = Date.now();
        await send({ text: `⚡ *CYBER Ping*\n\n📡 Calculating...` });
        const _ms = Date.now() - _t1;
        const up = process.uptime();
        const h = Math.floor(up / 3600);
        const min = Math.floor((up % 3600) / 60);
        await send({ text: `⚡ *CYBER BOT - PING*\n\n📡 Response: *${_ms}ms*\n⏱ Uptime: ${h}h ${min}m\n✅ Bot is Online!` });
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

    return false;
}

// ── also make ping/alive robust ──────────────────────────────────────

module.exports = { tryTurboCommand, isTurboCommand, buildMenuText, TURBO_COMMANDS };
