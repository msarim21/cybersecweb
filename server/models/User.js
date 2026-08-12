const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
    minlength: [3, 'Username must be at least 3 characters'],
    maxlength: [30, 'Username cannot exceed 30 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false
  },
  googleId: {
    type: String,
    default: null,
    unique: true,
    sparse: true
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },

  // ── Subscription fields ──────────────────────────────────────────────────
  /** High-level subscription status — single source of truth for access checks */
  subscriptionStatus: {
    type: String,
    enum: ['trial', 'active_pro', 'active_enterprise', 'expired'],
    default: 'trial'
  },
  /** Legacy plan field — kept for backward compat with old code */
  subscriptionPlan: {
    type: String,
    enum: ['free', 'pro', 'enterprise'],
    default: 'free'
  },
  /** When the 24-hour free trial started */
  trialStart: {
    type: Date,
    default: null
  },
  /** When the free trial expires — null means no trial set */
  trialExpiresAt: {
    type: Date,
    default: null
  },
  /** When a paid plan expires — null means lifetime / no expiry */
  subscriptionExpiry: {
    type: Date,
    default: null
  },
  /** Legacy field — same as subscriptionExpiry, kept for compat */
  planExpiresAt: {
    type: Date,
    default: null
  },
  /** True when an admin manually assigned a Pro/Enterprise plan.
   *  Users with this flag are NEVER downgraded back to trial. */
  activatedByAdmin: {
    type: Boolean,
    default: false
  },
  // ── Upgrade requests ─────────────────────────────────────────────────────
  upgradeRequest: {
    type: String,
    enum: ['none', 'pro', 'enterprise'],
    default: 'none'
  },
  upgradeRequestAt: {
    type: Date,
    default: null
  },
  licenseKey: {
    type: String,
    default: null,
    trim: true
  },
  banned: {
    type: Boolean,
    default: false
  },
  lastActive: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
