'use strict';

// ════════════════════════════════════════════════════════════════════════════
// SUBSCRIPTION GUARD — DISABLED for self-hosted mode.
//
// This was a SaaS-style subscription check. For self-hosted deployment,
// all numbers are authorized — no database check needed.
// ════════════════════════════════════════════════════════════════════════════

/**
 * Always returns true in self-hosted mode.
 * No subscription or trial check — all numbers are authorized.
 */
async function isNumberAuthorized(number) {
  return true;
}

/**
 * No-op in self-hosted mode.
 */
async function enforceSubscriptionOrDisconnect(number) {
  return true;
}

/** No-op cache clear */
function invalidateCache(number) {
  // nothing to clear
}

module.exports = { isNumberAuthorized, enforceSubscriptionOrDisconnect, invalidateCache };
