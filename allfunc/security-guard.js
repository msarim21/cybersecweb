'use strict';

/**
 * Outbound send rate limiter — spaces bulk traffic to reduce WA restriction risk.
 * Command replies use { priority: true } and skip delay entirely.
 */
const SecurityGuard = {
    _buckets: new Map(),
    MAX_BURST: 20,
    WINDOW_MS: 60_000,
    REFILL_RATE: 3_000,

    canSend(chatId, priority = false) {
        if (priority) return { allowed: true, delay: 0 };
        const now = Date.now();
        const key = String(chatId || 'global');
        let bucket = this._buckets.get(key);
        if (!bucket) {
            bucket = { tokens: this.MAX_BURST, lastRefill: now };
            this._buckets.set(key, bucket);
        }
        const elapsed = now - bucket.lastRefill;
        const refill = Math.floor(elapsed / this.REFILL_RATE);
        if (refill > 0) {
            bucket.tokens = Math.min(this.MAX_BURST, bucket.tokens + refill);
            bucket.lastRefill = now;
        }
        if (bucket.tokens > 0) {
            bucket.tokens--;
            return { allowed: true, delay: 0 };
        }
        return { allowed: true, delay: 150 + Math.floor(Math.random() * 250) };
    },

    jitterDelay(baseMs) {
        return baseMs + Math.floor(Math.random() * baseMs * 0.3);
    },
};

// Periodic cleanup — remove buckets inactive for 10+ minutes to prevent memory leak
setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of SecurityGuard._buckets.entries()) {
        if (now - bucket.lastRefill > 10 * 60 * 1000) {
            SecurityGuard._buckets.delete(key);
        }
    }
}, 10 * 60 * 1000).unref();

module.exports = { SecurityGuard };
