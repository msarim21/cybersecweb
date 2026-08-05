'use strict';

/**
 * Heroku Eco web dynos stay awake via the HTTP process. Web dynos can also host
 * WhatsApp bots when configured with WHATSAPP_HOST_DYNO=web.
 *
 * Set WHATSAPP_HOST_DYNO=worker to use the worker dyno instead (Basic/Performance plans).
 *
 * Multiple worker dynos (bot sharding):
 *   heroku ps:scale worker=3          — scale to 3 worker dynos
 *   TOTAL_WORKER_DYNOS=3              — set in Heroku Config Vars
 *
 * Each worker dyno gets $DYNO = "worker.1", "worker.2", "worker.3".
 * The supervisor assigns each bot to exactly one dyno using round-robin.
 */
function getWhatsAppHostDyno() {
    if (process.env.WHATSAPP_HOST_DYNO) {
        return String(process.env.WHATSAPP_HOST_DYNO).toLowerCase();
    }
    if (process.env.DYNO) return 'web';
    return 'worker';
}

function isWebDyno() {
    return String(process.env.DYNO || '').startsWith('web')
        || process.env.WEB_API_ONLY === '1';
}

function isWorkerDyno() {
    return String(process.env.DYNO || '').startsWith('worker')
        || process.env.WHATSAPP_WORKER === '1';
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

/** Web dyno serving API only — WhatsApp bots run on worker (or another host dyno). */
function isWebApiOnlyDyno() {
    return (process.env.WEB_API_ONLY === '1'
        || String(process.env.DYNO || '').startsWith('web'))
        && getWhatsAppHostDyno() === 'worker';
}

/**
 * Returns this dyno's 0-based index.
 * $DYNO="worker.1" → 0, "worker.2" → 1, "worker.3" → 2, etc.
 * Returns 0 on local/non-Heroku environments.
 */
function getDynoIndex() {
    const dyno = String(process.env.DYNO || '');
    const match = dyno.match(/\.(\d+)$/);
    if (match) return Math.max(0, parseInt(match[1], 10) - 1);
    return 0;
}

/**
 * Total number of worker dynos running in parallel.
 * Set TOTAL_WORKER_DYNOS in Heroku Config Vars to match `heroku ps:scale worker=N`.
 * Defaults to 1 (single dyno, no sharding).
 */
function getTotalWorkerDynos() {
    const host = getWhatsAppHostDyno();
    const configured = host === 'web'
        ? (process.env.TOTAL_WEB_DYNOS || process.env.TOTAL_WORKER_DYNOS)
        : process.env.TOTAL_WORKER_DYNOS;
    const t = parseInt(configured, 10);
    return (t > 0) ? t : 1;
}

module.exports = {
    getWhatsAppHostDyno,
    shouldRunWhatsAppSupervisor,
    canHostWhatsAppSessions,
    isWebApiOnlyDyno,
    isWebDyno,
    isWorkerDyno,
    getDynoIndex,
    getTotalWorkerDynos,
};
