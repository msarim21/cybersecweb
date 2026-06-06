'use strict';

const fs = require('fs');
const path = require('path');

const STOPPED_FILE = path.join(__dirname, '..', 'database', 'stopped_bots.json');

function cleanNum(number) {
    return String(number || '').replace(/[^0-9]/g, '');
}

function readStopped() {
    try {
        if (fs.existsSync(STOPPED_FILE)) {
            const data = JSON.parse(fs.readFileSync(STOPPED_FILE, 'utf-8'));
            if (Array.isArray(data)) return data.map(cleanNum).filter(Boolean);
        }
    } catch (_) {}
    return [];
}

function writeStopped(list) {
    try {
        const dir = path.dirname(STOPPED_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const unique = [...new Set(list.map(cleanNum).filter(Boolean))];
        fs.writeFileSync(STOPPED_FILE, JSON.stringify(unique));
    } catch (_) {}
}

function addToStoppedBots(number) {
    const c = cleanNum(number);
    if (!c) return;
    const list = readStopped();
    if (!list.includes(c)) {
        list.push(c);
        writeStopped(list);
    }
}

function removeFromStoppedBots(number) {
    const c = cleanNum(number);
    if (!c) return;
    writeStopped(readStopped().filter((n) => n !== c));
}

function isStopped(number) {
    return readStopped().includes(cleanNum(number));
}

/** Remove any website-linked numbers from stopped list so restart can reconnect them */
async function syncStoppedWithLinkedNumbers() {
    try {
        const { getActiveLinkedNumbers } = require('../session-db');
        const linked = await getActiveLinkedNumbers();
        if (!linked || !linked.length) return 0;
        const stopped = readStopped();
        const linkedSet = new Set(linked.map(cleanNum).filter(Boolean));
        const kept = stopped.filter((n) => !linkedSet.has(n));
        if (kept.length !== stopped.length) {
            writeStopped(kept);
            console.log(`[stopped-bots] Cleared ${stopped.length - kept.length} linked number(s) from stopped list`);
        }
        return stopped.length - kept.length;
    } catch (e) {
        console.error('[stopped-bots] sync failed:', e.message);
        return 0;
    }
}

module.exports = {
    STOPPED_FILE,
    readStopped,
    writeStopped,
    addToStoppedBots,
    removeFromStoppedBots,
    isStopped,
    syncStoppedWithLinkedNumbers,
};
