const mongoose = require('mongoose');

const pairingRequestSchema = new mongoose.Schema({
  number:    { type: String, required: true, trim: true, index: true },
  status:    { type: String, enum: ['requested', 'in_progress', 'code_ready', 'failed', 'expired'], default: 'requested' },
  code:      { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

pairingRequestSchema.index({ number: 1, status: 1 });
pairingRequestSchema.index({ updatedAt: 1 });

module.exports = mongoose.model('PairingRequest', pairingRequestSchema);
