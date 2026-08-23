'use strict';

/**
 * Heroku Eco web dynos stay awake via the HTTP process. Web dynos can also host
 * WhatsApp bots when configured with WHATSAPP_HOST_DYNO=web.
 *
 * Set WHATSAPP_HOST_DYNO=web to keep the dashboard, pairing, and bots on one
 * web dyno. A worker host is supported for larger formations but must not run
 * at the same time as a web host.
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
    if (process.env.DYNO) return String(process.env.DYNO).startsWith('web') ? 'web' : 'worker';
    return 'web';
}

function isWebDyno() {
    const dyno = String(process.env.DYNO || '');
    if (dyno.startsWith('web')) return true;
    if (process.env.WEB_API_ONLY === '1') return true;

    // Heroku may not expose DYNO metadata. In the single-web formation the
    // explicit host setting is the authoritative role signal. The stack sets
    // WHATSAPP_WORKER=1 internally after this check to reuse worker modules;
    // that flag does not change the configured host.
    if (process.env.WHATSAPP_HOST_DYNO === 'web') return true;

    // Local/Replit processes do not provide Heroku's DYNO metadata. When no
    // host was explicitly configured, the only safe default is the local
    // process itself; otherwise the API starts successfully but the WhatsApp
    // supervisor and pairing processor never start.
    if (!dyno && !process.env.WHATSAPP_HOST_DYNO) return true;

    return false;
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

/** True only when this web process is intentionally API-only. */
function isWebApiOnlyDyno() {
    if (getWhatsAppHostDyno() !== 'worker') return false;

    // Prefer explicit role flags, but also infer the API role whenever this
    // process is not the worker. This matters on Heroku when Dyno Metadata is
    // disabled and DYNO is therefore unavailable: the web Procfile command
    // must still never create a WhatsApp socket.
    return process.env.WEB_API_ONLY === '1'
        || !isWorkerDyno();
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
