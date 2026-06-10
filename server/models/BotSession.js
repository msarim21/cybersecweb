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
  pairingOwnerId:   { type: String, default: null },
  pairingBotName:   { type: String, default: null },
  connectedAt:      { type: Date },
  firstConnectedAt: { type: Date },
  lastActive:       { type: Date, default: Date.now },
  createdAt:        { type: Date, default: Date.now },
  /** public = everyone; self = owner + linked number only — set only via .public / .private */
  botMode:          { type: String, enum: ['public', 'self'] },
  botModeLocked:    { type: Boolean, default: false },
});

module.exports = mongoose.model('BotSession', botSessionSchema);
