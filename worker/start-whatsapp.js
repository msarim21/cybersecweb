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

    return true;
}

module.exports = { startWhatsAppStack };
