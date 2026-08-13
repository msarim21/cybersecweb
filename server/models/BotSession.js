const mongoose = require('mongoose');

const botSessionSchema = new mongoose.Schema({
  number: { type: String, unique: true, required: true, trim: true },
  status: {
    type: String,
    enum: ['active', 'inactive', 'pending'],
    default: 'pending'
  },
  sessionData: { type: mongoose.Schema.Types.Mixed, default: null },
  pairingCode:      { type: String, default: null },
  pairingStatus:    { type: String, default: null },
  pairingAttemptId: { type: String, default: null },
  pairingError:     { type: String, default: null },
  pairingOwnerId:   { type: String, default: null },
  pairingBotName:   { type: String, default: null },
  connectedAt:      { type: Date },
  firstConnectedAt: { type: Date },
  lastActive:       { type: Date, default: Date.now },
  createdAt:        { type: Date, default: Date.now },
  /** false while WhatsApp is still syncing — dashboard should show SYNCING not ONLINE */
  commandReady:     { type: Boolean, default: false },
  wsState:          { type: Number, default: -1 },
  /** public = everyone; self = owner + linked number only — set only via .public / .private */
  botMode:          { type: String, enum: ['public', 'self'] },
  botModeLocked:    { type: Boolean, default: false },
  /** WhatsApp number that enabled self mode — that user's commands pass even if not in owner.json */
  sessionOwner:     { type: String, default: null },
  /** CONNECTED | DISCONNECTED | LOGGED_OUT | ERROR | CONNECTING */
  connectionStatus: { type: String, default: null },
  lastErrorMessage: { type: String, default: null },
  reconnectAttempts:{ type: Number, default: 0 },
  hostDyno:         { type: String, default: null },
});

// Indexes for the dashboard/worker hot queries (status listings, pairing
// lookups, per-dyno ownership). Without these Atlas does a COLLSCAN on every
// dashboard poll, which is the main source of UI lag.
botSessionSchema.index({ status: 1, lastActive: -1 });
botSessionSchema.index({ pairingStatus: 1, lastActive: -1 });
botSessionSchema.index({ pairingOwnerId: 1 });
botSessionSchema.index({ hostDyno: 1 });

module.exports = mongoose.model('BotSession', botSessionSchema);
