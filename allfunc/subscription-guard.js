'use strict';

// ════════════════════════════════════════════════════════════════════════════
// SUBSCRIPTION GUARD — real-time trial/ban enforcement.
//
// server/jobs/planExpiryJob.js sweeps expired trials every 60s, but that only
// touches the database — it can't reach into a live WhatsApp socket running
// in another dyno/process. This guard is called directly from pair.js (on
// every incoming message + on the 30s watchdog tick) so an expired/banned
// number is disconnected within moments, not "eventually".
//
// Results are cached briefly per-number so we don't hit the DB on every
// single message — a bot can receive many messages per second.
// ════════════════════════════════════════════════════════════════════════════

const CACHE_TTL_MS = 20_000; // re-check DB at most every 20s per number
const _cache = new Map(); // clean number -> { ok, ts }

function _isExpiredTrial(sub) {
  if (!sub) return false;
  if (sub.activatedByAdmin) return false;
  if (['active_pro', 'active_enterprise'].includes(sub.subscriptionStatus)) return false;
  if (!sub.trialExpiresAt) return false;
  return new Date(sub.trialExpiresAt).getTime() < Date.now();
}

/**
 * Returns true if the number is currently authorized to run (not banned,
 * not an expired trial, still linked). Cached for CACHE_TTL_MS.
 */
async function isNumberAuthorized(number) {
  const clean = String(number || '').replace(/[^0-9]/g, '');
  if (!clean) return true; // nothing to enforce without a number

  const cached = _cache.get(clean);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.ok;

  let ok = true;
  let dbError = false;
  try {
    const { getOwnerSubscriptionByNumber } = require('../server/db-service');
    const sub = await getOwnerSubscriptionByNumber(clean);
    if (sub) {
      if (sub.banned) ok = false;
      else if (sub.subscriptionStatus === 'expired') ok = false;
      else if (_isExpiredTrial(sub)) ok = false;
    }
    // If sub is null (no owner record found), leave ok=true — this guard
    // only enforces trial/ban state, it never blocks unlinked/legacy bots.
  } catch (err) {
    // DB hiccup — fail open so a transient DB error never kills a paying
    // customer's live bot session. Don't cache this result though: caching
    // a fail-open verdict would extend a real ban/expiry's grace period by
    // up to CACHE_TTL_MS every time the DB happens to hiccup.
    ok = true;
    dbError = true;
  }

  if (!dbError) _cache.set(clean, { ok, ts: Date.now() });
  return ok;
}

/**
 * Checks authorization and, if the number is no longer allowed to run,
 * immediately force-disconnects it (kills the live socket, wipes creds,
 * marks it stopped). Safe to call frequently — disconnect itself is
 * idempotent and force-disconnect only actually runs work once.
 */
async function enforceSubscriptionOrDisconnect(number) {
  const clean = String(number || '').replace(/[^0-9]/g, '');
  if (!clean) return true;
  const ok = await isNumberAuthorized(clean);
  if (!ok) {
    try {
      const { forceDisconnectNumber } = require('./force-disconnect');
      await forceDisconnectNumber(clean, { reason: 'subscription_expired_or_banned' });
    } catch (_) {}
  }
  return ok;
}

/** Clear the cached decision for a number — call after an admin action
 *  (extend trial / upgrade / unban) so the next check reflects it instantly
 *  instead of waiting up to CACHE_TTL_MS. */
function invalidateCache(number) {
  const clean = String(number || '').replace(/[^0-9]/g, '');
  if (clean) _cache.delete(clean);
  else _cache.clear();
}

module.exports = { isNumberAuthorized, enforceSubscriptionOrDisconnect, invalidateCache };
