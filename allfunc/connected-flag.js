'use strict';

const path = require('path');
const fs = require('fs');

const PAIRING_BASE = path.join(__dirname, '..', 'nexstore', 'pairing');

function cleanNum(number) {
    return String(number || '').replace(/[^0-9]/g, '');
}

function flagPaths(number) {
    const c = cleanNum(number);
    if (!c) return [];
    return [
        path.join(PAIRING_BASE, c, 'connected.flag'),
        path.join(PAIRING_BASE, `${c}@s.whatsapp.net`, 'connected.flag'),
    ];
}

function writeConnectedFlag(number, data) {
    const c = cleanNum(number);
    const payload = JSON.stringify(data || { connected: true, number: c, ts: Date.now() });
    for (const fp of flagPaths(c)) {
        try {
            fs.mkdirSync(path.dirname(fp), { recursive: true });
            fs.writeFileSync(fp, payload);
        } catch (_) {}
    }
}

function readConnectedFlag(number) {
    for (const fp of flagPaths(number)) {
        try {
            if (fs.existsSync(fp)) return JSON.parse(fs.readFileSync(fp, 'utf-8'));
        } catch (_) {}
    }
    return null;
}

function removeConnectedFlag(number) {
    for (const fp of flagPaths(number)) {
        try {
            if (fs.existsSync(fp)) fs.unlinkSync(fp);
        } catch (_) {}
    }
}

function isConnected(number) {
    return flagPaths(number).some((fp) => fs.existsSync(fp));
}

module.exports = {
    cleanNum,
    flagPaths,
    writeConnectedFlag,
    readConnectedFlag,
    removeConnectedFlag,
    isConnected,
};
