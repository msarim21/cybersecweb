'use strict';

const fs = require('fs');
const path = require('path');
const { cleanBotNum } = require('./bot-workspace');

const DEFAULT_MAX_AGE_MS = 6 * 60 * 1000;

function _heartbeatPath(botNum) {
    const clean = cleanBotNum(botNum);
    return path.join('database', 'bots', clean, 'heartbeat.json');
}

function touchBotHeartbeat(botNum, extra = {}) {
    const clean = cleanBotNum(botNum);
    if (!clean) return;
    const file = _heartbeatPath(clean);
    try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        const payload = {
            botNum: clean,
            ts: Date.now(),
            pid: process.pid,
            dyno: process.env.DYNO || '',
            ...extra,
        };
        fs.writeFileSync(file, JSON.stringify(payload));
    } catch (_) {}
    (async () => {
        try {
            const { upsertBotSession } = require('../server/db-service');
            await upsertBotSession(clean, 'active');
        } catch (_) {}
    })();
}

function readBotHeartbeat(botNum) {
    const file = _heartbeatPath(botNum);
    try {
        if (!fs.existsSync(file)) return null;
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
        return null;
    }
}

function getBotHeartbeatAgeMs(botNum) {
    const hb = readBotHeartbeat(botNum);
    if (!hb?.ts) return Infinity;
    return Date.now() - Number(hb.ts);
}

function isBotHeartbeatFresh(botNum, maxAgeMs = DEFAULT_MAX_AGE_MS) {
    return getBotHeartbeatAgeMs(botNum) <= maxAgeMs;
}

module.exports = {
    touchBotHeartbeat,
    readBotHeartbeat,
    getBotHeartbeatAgeMs,
    isBotHeartbeatFresh,
    DEFAULT_MAX_AGE_MS,
};
