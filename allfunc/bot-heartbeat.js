'use strict';

const fs = require('fs');
const path = require('path');
const { cleanBotNum } = require('./bot-workspace');

const DEFAULT_MAX_AGE_MS = 15 * 60 * 1000;
const DB_UPSERT_MIN_MS = 3 * 60 * 1000;

const _lastFileWrite = new Map();
const _lastDbUpsert = new Map();
const _lastReadyState = new Map();

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

    const readyChanged = extra.ready !== undefined && extra.ready !== _lastReadyState.get(clean);
    const forceDb = readyChanged || extra.event === 'ready' || extra.event === 'open' || extra.event === 'message';
    const lastDb = _lastDbUpsert.get(clean) || 0;
    if (!forceDb && now - lastDb < DB_UPSERT_MIN_MS) return;
    _lastDbUpsert.set(clean, now);
    if (extra.ready !== undefined) _lastReadyState.set(clean, extra.ready);

    setImmediate(async () => {
        try {
            const { upsertBotSession } = require('../server/db-service');
            const meta = {};
            if (extra.ready !== undefined) meta.commandReady = extra.ready;
            if (extra.wsState !== undefined) meta.wsState = extra.wsState;
            const status = extra.ready === false ? 'active' : 'active';
            await upsertBotSession(clean, status, meta);
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

function isBotCommandReady(botNum) {
    const hb = readBotHeartbeat(botNum);
    if (!hb) return false;
    if (hb.ready === true) return true;
    if (hb.ready === false) return false;
    return hb.event === 'ready' || hb.event === 'message';
}

module.exports = {
    touchBotHeartbeat,
    readBotHeartbeat,
    getBotHeartbeatAgeMs,
    isBotHeartbeatFresh,
    isBotCommandReady,
    DEFAULT_MAX_AGE_MS,
};
