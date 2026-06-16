'use strict';

/**
 * Shared memory layer — zero-copy metrics visible to ALL worker threads.
 *
 * Layout per bot slot (20 bytes):
 *   [0]      Uint8   — isRunning (1 = yes)
 *   [1-2]    Uint16  — restart count
 *   [3-4]    Uint16  — heap used MB
 *   [5-6]    Uint16  — last ping age seconds (65535 = never)
 *   [7-19]   reserved
 *
 * First 4 bytes of the buffer = Uint32 total active bot count (header).
 */

const MAX_BOTS        = 300;
const BYTES_PER_SLOT  = 20;
const HEADER_BYTES    = 4;
const TOTAL_BYTES     = HEADER_BYTES + MAX_BOTS * BYTES_PER_SLOT;

function createSharedBuffer() {
    return new SharedArrayBuffer(TOTAL_BYTES);
}

function _slotOffset(index) {
    return HEADER_BYTES + index * BYTES_PER_SLOT;
}

function wrapSlot(sab, index) {
    if (index < 0 || index >= MAX_BOTS) throw new RangeError(`SharedState: slot ${index} out of range`);
    const offset = _slotOffset(index);
    const u8   = new Uint8Array(sab,   offset,     1);
    const u16r = new Uint16Array(sab,  offset + 2, 3);

    return {
        setRunning  : (v) => Atomics.store(u8,    0, v ? 1 : 0),
        isRunning   : ()  => Atomics.load(u8,     0) === 1,
        setRestarts : (v) => Atomics.store(u16r,  0, Math.min(v, 65535)),
        getRestarts : ()  => Atomics.load(u16r,   0),
        setHeapMB   : (v) => Atomics.store(u16r,  1, Math.min(v, 65535)),
        getHeapMB   : ()  => Atomics.load(u16r,   1),
        setPingAge  : (v) => Atomics.store(u16r,  2, Math.min(v, 65535)),
        getPingAge  : ()  => Atomics.load(u16r,   2),
        clear       : ()  => { Atomics.store(u8, 0, 0); for (let i = 0; i < 3; i++) Atomics.store(u16r, i, 0); },
    };
}

function getActiveBotCount(sab) {
    return Atomics.load(new Uint32Array(sab, 0, 1), 0);
}

function setActiveBotCount(sab, n) {
    Atomics.store(new Uint32Array(sab, 0, 1), 0, Math.min(n, 0xffffffff));
}

module.exports = {
    createSharedBuffer,
    wrapSlot,
    getActiveBotCount,
    setActiveBotCount,
    MAX_BOTS,
    BYTES_PER_SLOT,
    TOTAL_BYTES,
};
