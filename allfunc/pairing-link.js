'use strict';

const chalk = require('chalk');

/**
 * On WhatsApp connect: save number to linked_numbers immediately (dashboard + DB).
 */
async function linkNumberOnWebConnect(nexusDevNumber) {
    const cleanNum = String(nexusDevNumber).replace(/[^0-9]/g, '');
    if (!cleanNum) return { linked: false, reason: 'invalid_number' };

    try {
        const { getPairingState, addNumber, isNumberInLinkedNumbers } = require('../server/db-service');
        const pst = await getPairingState(cleanNum).catch(() => null);

        if (await isNumberInLinkedNumbers(cleanNum)) {
            try {
                const { clearPairingRequest } = require('../server/db-service');
                await clearPairingRequest(cleanNum);
            } catch (_) {}
            return { linked: true, reason: 'already_linked' };
        }

        const ownerId = pst?.pairingOwnerId;
        if (!ownerId || ownerId === 'system') {
            // Re-check: pairing process may have already linked the number and cleared the state
            if (await isNumberInLinkedNumbers(clean)) {
                return { linked: true, reason: 'already_linked_late' };
            }
            return { linked: false, reason: 'no_pairing_owner' };
        }

        const botName = pst?.pairingBotName || 'CYBER-BOT';
        const saved = await addNumber(
            nexusDevNumber.includes('@') ? nexusDevNumber : `${cleanNum}@s.whatsapp.net`,
            botName,
            ownerId
        );

        if (saved) {
            console.log(chalk.green(`[pair] ✅ Auto-saved +${cleanNum} to linked_numbers (${botName}) after phone pairing`));
            try {
                const { writeConnectedFlag } = require('./connected-flag');
                writeConnectedFlag(cleanNum, { connected: true, number: cleanNum, ts: Date.now(), linked: true });
            } catch (_) {}
            try {
                const { clearPairingRequest, markFirstConnected } = require('../server/db-service');
                await clearPairingRequest(cleanNum);
                await markFirstConnected(cleanNum);
            } catch (_) {}
            return { linked: true, reason: 'saved', record: saved };
        }

        return { linked: false, reason: 'add_failed' };
    } catch (e) {
        console.log(chalk.yellow(`[pair] linkNumberOnWebConnect: ${e.message}`));
        return { linked: false, reason: e.message };
    }
}

module.exports = { linkNumberOnWebConnect };
