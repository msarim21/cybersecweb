const mongoose = require('mongoose');

const pairingRequestSchema = new mongoose.Schema({
  number:    { type: String, required: true, trim: true, index: true },
  status:    { type: String, enum: ['requested', 'in_progress', 'code_ready', 'failed', 'expired'], default: 'requested' },
  code:      { type: String, default: null },
  attemptId: { type: String, default: null },
  error:     { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

pairingRequestSchema.index({ number: 1, status: 1 });

// ✅ STORAGE FIX: pairing requests are transient (resolved within minutes),
// so auto-expire after PAIRING_REQUEST_RETENTION_DAYS (default 2d) rather
// than accumulating forever. server/jobs/storageGuardJob.js also actively
// archives+deletes resolved backlog older than this window.
// NOTE: replaces the old plain `{ updatedAt: 1 }` index — Mongo rejects two
// indexes with the same key pattern but different options (IndexOptionsConflict),
// and this partial+TTL index still serves the same query shapes.
const PAIRING_REQUEST_TTL_SECONDS = (parseInt(process.env.PAIRING_REQUEST_RETENTION_DAYS || '2', 10)) * 86400;
pairingRequestSchema.index({ updatedAt: 1 }, { expireAfterSeconds: PAIRING_REQUEST_TTL_SECONDS, partialFilterExpression: { status: { $in: ['code_ready', 'failed', 'expired'] } } });

module.exports = mongoose.model('PairingRequest', pairingRequestSchema);
