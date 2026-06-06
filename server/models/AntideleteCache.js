const mongoose = require('mongoose');

const antideleteCacheSchema = new mongoose.Schema({
  key:       { type: String, required: true, unique: true, index: true },
  botNum:    { type: String, default: '', index: true },
  chatId:    { type: String, default: '' },
  msgId:     { type: String, default: '', index: true },
  data:      { type: mongoose.Schema.Types.Mixed, required: true },
  expiresAt: { type: Date, required: true, index: true },
}, { timestamps: true });

antideleteCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.models.AntideleteCache
  || mongoose.model('AntideleteCache', antideleteCacheSchema);
