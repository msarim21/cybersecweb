'use strict';

const chalk = require('chalk');
const { shouldRunWhatsAppSupervisor, getWhatsAppHostDyno } = require('../allfunc/whatsapp-host');

let _started = false;

function startWhatsAppStack() {
    if (_started) return false;
    if (!shouldRunWhatsAppSupervisor()) return false;

    _started = true;
    process.env.WHATSAPP_WORKER = '1';

    const host = getWhatsAppHostDyno();
    console.log(chalk.magenta(`\n🤖 WhatsApp supervisor on ${process.env.DYNO || host} dyno (WHATSAPP_HOST_DYNO=${host})\n`));

    const { startSupervisor } = require('./supervisor');
    startSupervisor();

    const { startKeepAlive } = require('../keepalive');
    startKeepAlive();

    const { startPairingProcessor } = require('./pairing-processor');
    startPairingProcessor(150);

    const { startOrphanDisconnectJob } = require('../server/jobs/orphanDisconnectJob');
    startOrphanDisconnectJob(30_000);

    // ✅ FIX: Auto-restarter — har BOT_RESTART_HOURS ghante mein graceful restart
    // Session DB mein flush hoti hai restart se pehle — no data loss
    try {
        const { startAutoRestarter } = require('./auto-restarter');
        startAutoRestarter();
        const hours = parseInt(process.env.BOT_RESTART_HOURS || '4', 10);
        console.log(chalk.gray(`[WhatsApp] ⏰ Auto-restarter armed — restarts every ${hours} hours`));
    } catch (e) {
        console.log(chalk.yellow('[WhatsApp] Auto-restarter warning:', e.message));
    }

    // ── Auto-reconnect sweep ──────────────────────────────────────────────
    // Har 5 minute mein check karta hai koi bot offline to nahi gaya.
    // Agar offline hai, DB mein session hai, aur user ne manually disconnect
    // nahi kiya — to automatically reconnect karta hai.
    // User ko website pe ja ke RECONNECT button nahi dabaana parta.
    try {
        const { startAutoReconnectSweep, triggerBootReconnectSweep } = require('../allfunc/auto-reconnect-sweep');
        startAutoReconnectSweep();
        triggerBootReconnectSweep();
        console.log(chalk.green('[WhatsApp] ✅ Auto-reconnect sweep armed — offline bots will reconnect automatically'));
    } catch (e) {
        console.log(chalk.yellow('[WhatsApp] Auto-reconnect sweep warning:', e.message));
    }

    return true;
}

module.exports = { startWhatsAppStack };
