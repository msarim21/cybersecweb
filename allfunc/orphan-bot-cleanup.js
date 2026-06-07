'use strict';

const path = require('path');
const fs = require('fs');

const ORPHAN_GRACE_MS = 30 * 60 * 1000;

function deleteFolderRecursive(p) {
    if (!fs.existsSync(p)) return;
    for (const f of fs.readdirSync(p)) {
        const cur = path.join(p, f);
        if (fs.lstatSync(cur).isDirectory()) deleteFolderRecursive(cur);
        else fs.unlinkSync(cur);
    }
    try { fs.rmdirSync(p); } catch (_) {}
}

/**
 * Full wipe: stop bot, delete FS session, DB creds, flags — unlinked pairing cleanup.
 */
async function wipeUnlinkedBotSession(cleanNum) {
    const clean = String(cleanNum || '').replace(/[^0-9]/g, '');
    if (!clean) return false;

    const jid = `${clean}@s.whatsapp.net`;
    console.log(`[OrphanDisconnect] Wiping unlinked bot +${clean} (not in linked_numbers after grace)`);

    try {
        const { killBot, isSupervisorActive } = require('../worker/supervisor');
        if (isSupervisorActive()) killBot(clean, 'SIGKILL');
    } catch (_) {}

    try {
        const pairMod = require('../pair');
        if (typeof pairMod.stopBot === 'function') {
            pairMod.stopBot(jid);
            pairMod.stopBot(clean);
        }
        if (typeof pairMod.clearSession === 'function') pairMod.clearSession(clean);
    } catch (_) {}

    try {
        const { removeConnectedFlag } = require('./connected-flag');
        removeConnectedFlag(clean);
    } catch (_) {}

    const sessionPaths = [
        path.join(process.cwd(), 'nexstore', 'pairing', jid),
        path.join(process.cwd(), 'nexstore', 'pairing', clean),
    ];
    for (const p of sessionPaths) {
        try { if (fs.existsSync(p)) deleteFolderRecursive(p); } catch (_) {}
    }

    try {
        const { deleteSessionCreds } = require('../session-db');
        await deleteSessionCreds(clean);
    } catch (_) {}

    try {
        const { upsertBotSession, clearPairingRequest } = require('../server/db-service');
        await upsertBotSession(clean, 'inactive');
        await clearPairingRequest(clean);
    } catch (_) {}

    try {
        const { addToStoppedBots } = require('./stopped-bots');
        addToStoppedBots(clean);
    } catch (_) {}

    try {
        const hb = path.join('database', 'bots', clean, 'heartbeat.json');
        if (fs.existsSync(hb)) fs.unlinkSync(hb);
    } catch (_) {}

    return true;
}

module.exports = {
    ORPHAN_GRACE_MS,
    wipeUnlinkedBotSession,
};
