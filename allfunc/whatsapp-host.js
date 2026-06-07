'use strict';

/**
 * Heroku Eco worker dynos sleep (no HTTP traffic). Web dyno stays awake via keepalive ping.
 * Default: host WhatsApp bots on the web dyno so linked numbers keep working 24/7.
 *
 * Set WHATSAPP_HOST_DYNO=worker to use the worker dyno instead (Basic/Performance plans).
 */
function getWhatsAppHostDyno() {
    if (process.env.WHATSAPP_HOST_DYNO) {
        return String(process.env.WHATSAPP_HOST_DYNO).toLowerCase();
    }
    if (process.env.DYNO) return 'web';
    return 'worker';
}

function isWebDyno() {
    return String(process.env.DYNO || '').startsWith('web');
}

function isWorkerDyno() {
    return String(process.env.DYNO || '').startsWith('worker');
}

function shouldRunWhatsAppSupervisor() {
    const host = getWhatsAppHostDyno();
    if (host === 'web') return isWebDyno();
    if (host === 'worker') return isWorkerDyno();
    return isWorkerDyno();
}

/** True only on the dyno that may open WhatsApp sockets (prevents 440 duplicate sessions). */
function canHostWhatsAppSessions() {
    return shouldRunWhatsAppSupervisor();
}

module.exports = {
    getWhatsAppHostDyno,
    shouldRunWhatsAppSupervisor,
    canHostWhatsAppSessions,
    isWebDyno,
    isWorkerDyno,
};
