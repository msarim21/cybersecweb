const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  sender: {
    type: String,
    enum: ['user', 'admin'],
    required: true,
  },
  message: {
    type: String,
    required: [true, 'Message is required'],
    trim: true,
    maxlength: [2000, 'Message cannot exceed 2000 characters'],
  },
  read: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Index for fast queries by userId + createdAt
chatMessageSchema.index({ userId: 1, createdAt: -1 });

// ✅ STORAGE FIX: auto-expire chat history after CHAT_MESSAGE_RETENTION_DAYS
// (default 30d) so this collection can't grow unbounded and exhaust the
// MongoDB quota as the user base grows. server/jobs/storageGuardJob.js also
// archives+deletes older backlog to a local JSON file before this TTL index
// would otherwise silently discard it going forward.
const CHAT_MESSAGE_TTL_SECONDS = (parseInt(process.env.CHAT_MESSAGE_RETENTION_DAYS || '30', 10)) * 86400;
chatMessageSchema.index({ createdAt: 1 }, { expireAfterSeconds: CHAT_MESSAGE_TTL_SECONDS });

module.exports = mongoose.model('ChatMessage', chatMessageSchema);
