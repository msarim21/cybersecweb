'use strict';
/**
 * allfunc/anticall.js — auto-decline (and optionally block) incoming calls.
 *
 * ROOT CAUSE (fixed 2026-11-19): the .anticall toggle command saved its mode
 * to anticall_config.json, but NOTHING ever listened for calls — there was no
 * `sock.ev.on('call', ...)` anywhere in the repo (pair.js only registered
 * messages/connection/creds listeners, and the case.js:8925 comment claiming
 * the handler lived in pair.js was stale). The toggle changed a setting that
 * no code read. The listener is now registered in pair.js next to the other
 * socket listeners and calls handleCallEvent() here.
 *
 * Designed behaviour (from the .anticall help + setanticallmsg):
 *  - mode 'off'     → calls pass through, nothing happens.
 *  - mode 'decline' → reject the call, then send the caller the custom (or
 *                     default) anti-call message.
 *  - mode 'block'   → reject, send the message, then block the caller.
 * Only 1:1 incoming call OFFERS are handled (status 'offer', not a group
 * call). Each call id is handled once — Baileys can emit 'offer' more than
 * once for the same call. Malformed events are skipped, never thrown.
 *
 * Config is re-read on EVERY event (in-memory cache first, config file as
 * fallback), so `.anticall decline` takes effect immediately with no restart.
 */

const fs = require('fs');
const path = require('path');
const { isBotIsolated, getBotConfigPaths } = require('./bot-workspace');

const DEFAULT_MESSAGE = "📵 Hey {user}, please don't {calltype} call me. Send a message instead!";
const HANDLED_TTL_MS = 5 * 60 * 1000;

// callId -> timestamp, so a repeated 'offer' for one call is handled once.
const handledCallIds = new Map();

function configPaths() {
    if (isBotIsolated()) {
        const p = getBotConfigPaths();
        return { config: p.anticall, message: p.anticallMsg };
    }
    return {
        config: path.join('./database', 'anticall_config.json'),
        message: path.join('./database', 'anticall_msg.json'),
    };
}

function readJson(file, fallback) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (_) {
        return fallback;
    }
}

/** Live mode: case.js's in-memory cache (updated by the toggle) wins; the
 *  config file is the fallback for before case.js has loaded. */
function loadConfig() {
    const cached = global._cfgCache && global._cfgCache.anticallCfg;
    if (cached && typeof cached.mode === 'string') return cached;
    const data = readJson(configPaths().config, { mode: 'off' });
    if (data && typeof data.mode === 'string') return data;
    return { mode: 'off' };
}

function loadMessage() {
    const cached = global._cfgCache && global._cfgCache.anticallMsg;
    if (cached && typeof cached.msg === 'string' && cached.msg) return cached.msg;
    const data = readJson(configPaths().message, { msg: null });
    if (data && typeof data.msg === 'string' && data.msg) return data.msg;
    return null;
}

function formatMessage(template, callerJid, isVideo) {
    const user = '@' + String(callerJid || '').split('@')[0].split(':')[0];
    const calltype = isVideo ? 'video' : 'voice';
    return String(template || DEFAULT_MESSAGE)
        .replace(/\{user\}/g, user)
        .replace(/\{calltype\}/g, calltype);
}

function alreadyHandled(callId) {
    const now = Date.now();
    const at = handledCallIds.get(callId);
    if (at && now - at < HANDLED_TTL_MS) return true;
    handledCallIds.set(callId, now);
    if (handledCallIds.size > 500) {
        for (const [id, ts] of handledCallIds) {
            if (now - ts >= HANDLED_TTL_MS) handledCallIds.delete(id);
        }
    }
    return false;
}

/**
 * Handle one Baileys 'call' event batch.
 * @param {object} sock - Baileys socket (rejectCall / sendMessage /
 *   updateBlockStatus). Each action is tried independently so one failure
 *   does not block the others.
 * @param {Array} calls - WACallEvent[].
 * @param {object} [deps] - injectable for tests: { getConfig, getMessage, log }.
 * @returns {Promise<Array>} per-call outcomes: { id, from, action } where
 *   action is 'declined' | 'declined+blocked' | 'ignored' | 'skipped'.
 */
async function handleCallEvent(sock, calls, deps = {}) {
    const outcomes = [];
    const getConfig = deps.getConfig || loadConfig;
    const getMessage = deps.getMessage || loadMessage;
    const log = deps.log || (() => {});
    if (!sock || !Array.isArray(calls)) return outcomes;

    for (const call of calls) {
        try {
            if (!call || typeof call !== 'object') { outcomes.push({ id: null, from: null, action: 'skipped' }); continue; }
            const { id, from } = call;
            if (!id || !from || call.status !== 'offer' || call.isGroup) {
                outcomes.push({ id: id || null, from: from || null, action: 'ignored' });
                continue;
            }
            if (alreadyHandled(id)) {
                outcomes.push({ id, from, action: 'ignored' });
                continue;
            }
            const mode = (getConfig() || {}).mode || 'off';
            if (mode !== 'decline' && mode !== 'block') {
                outcomes.push({ id, from, action: 'ignored' });
                continue;
            }
            if (typeof sock.rejectCall === 'function') {
                try { await sock.rejectCall(id, from); } catch (e) { log(`[anticall] reject failed for ${from}: ${e.message}`); }
            }
            const text = formatMessage(getMessage() || DEFAULT_MESSAGE, from, call.isVideo);
            if (typeof sock.sendMessage === 'function') {
                try { await sock.sendMessage(from, { text }); } catch (e) { log(`[anticall] message failed for ${from}: ${e.message}`); }
            }
            if (mode === 'block' && typeof sock.updateBlockStatus === 'function') {
                try { await sock.updateBlockStatus(from, 'block'); } catch (e) { log(`[anticall] block failed for ${from}: ${e.message}`); }
            }
            log(`[anticall] ${mode === 'block' ? 'declined + blocked' : 'declined'} ${call.isVideo ? 'video' : 'voice'} call from ${from}`);
            outcomes.push({ id, from, action: mode === 'block' ? 'declined+blocked' : 'declined' });
        } catch (e) {
            log(`[anticall] handler error: ${e.message}`);
            outcomes.push({ id: (call && call.id) || null, from: (call && call.from) || null, action: 'ignored' });
        }
    }
    return outcomes;
}

/** Register the listener on a Baileys socket (called from pair.js). */
function registerAnticallListener(sock) {
    if (!sock || !sock.ev || typeof sock.ev.on !== 'function') return false;
    sock.ev.on('call', (calls) => {
        handleCallEvent(sock, calls).catch(() => {});
    });
    return true;
}

module.exports = {
    DEFAULT_MESSAGE,
    loadConfig,
    loadMessage,
    formatMessage,
    handleCallEvent,
    registerAnticallListener,
    _handledCallIds: handledCallIds,
};
