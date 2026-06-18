'use strict';

/**
 * Shared dyno sharding — autoload.js and worker/supervisor.js MUST use the same
 * formula or bots land on the wrong dyno (440 duplicate sessions / missed bots).
 *
 * Block assignment (BOTS_PER_DYNO):
 *   dyno 0 → bots[0 .. bpd-1]
 *   dyno 1 → bots[bpd .. 2*bpd-1]
 *   ...
 *
 * With TOTAL_WORKER_DYNOS=1 every bot is assigned to the sole worker dyno.
 */

function getBotsPerDyno() {
  return Math.max(1, parseInt(process.env.BOTS_PER_DYNO, 10) || 5);
}

function cleanDigits(value) {
  return String(value || '').replace(/[^0-9]/g, '');
}

/** Sorted unique clean phone numbers for this dyno. */
function shardLinkedNumbers(numbers) {
  const { getDynoIndex, getTotalWorkerDynos } = require('./whatsapp-host');
  const total = getTotalWorkerDynos();
  const bpd = getBotsPerDyno();
  const sorted = [...new Set(
    (numbers || []).map(cleanDigits).filter(Boolean)
  )].sort();

  if (total <= 1) return sorted;

  const myIdx = getDynoIndex();
  return sorted.filter((_, i) => Math.floor(i / bpd) === myIdx);
}

/** Same as shardLinkedNumbers but returns a Set for supervisor lookups. */
function shardLinkedSet(numbers) {
  return new Set(shardLinkedNumbers(numbers));
}

module.exports = {
  getBotsPerDyno,
  shardLinkedNumbers,
  shardLinkedSet,
};
