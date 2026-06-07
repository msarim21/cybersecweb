'use strict';

const fs = require('fs');
const path = require('path');
const { cleanBotNum } = require('./bot-workspace');

const DEFAULT_MAX_AGE_MS = 6 * 60 * 1000;
const DB_UPSERT_MIN_MS = 3 * 60 * 1000;

const _lastFileWrite = new Map();
const _lastDbUpsert = new Map();

function _heartbeatPath(botNum) {
    const clean = cleanBotNum(botNum);
    return path.join('database', 'bots', clean, 'heartbeat.json');
}

function touchBotHeartbeat(botNum, extra = {}) {
    const clean = cleanBotNum(botNum);
    if (!clean) return;

    const now = Date.now();
    const lastFile = _lastFileWrite.get(clean) || 0;
    if (now - lastFile >= 30_000) {
        _lastFileWrite.set(clean, now);
        const file = _heartbeatPath(clean);
        const payload = {
            botNum: clean,
            ts: now,
            pid: process.pid,
            dyno: process.env.DYNO || '',
            ...extra,
        };
        try {
            fs.mkdirSync(path.dirname(file), { recursive: true });
            fs.promises.writeFile(file, JSON.stringify(payload)).catch(() => {});
        } catch (_) {}
    }

    const lastDb = _lastDbUpsert.get(clean) || 0;
    if (now - lastDb < DB_UPSERT_MIN_MS) return;
    _lastDbUpsert.set(clean, now);

    setImmediate(async () => {
        try {
            const { upsertBotSession } = require('../server/db-service');
            await upsertBotSession(clean, 'active');
        } catch (_) {}
    });
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
