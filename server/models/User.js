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
    // NOTE: no `default: null` and no field-level unique index.
    // A sparse unique index still indexes explicit nulls, so every
    // password-signup (googleId = null) collided with E11000 after the
    // first one — surfacing as a bogus "Username or email already taken".
    type: String
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

// Unique only for real Google IDs; documents without googleId are not indexed.
userSchema.index(
  { googleId: 1 },
  { unique: true, partialFilterExpression: { googleId: { $type: 'string' } } }
);

// One-time repair for existing databases: older deployments created a
// `sparse unique` index on googleId. Sparse still indexes explicit nulls, so
// only ONE user could have googleId: null — every later signup threw E11000,
// which the API reported as "Username or email already taken".
async function repairGoogleIdIndex(conn) {
  try {
    const coll = conn.db.collection('users');
    const indexes = await coll.indexes();
    const legacy = indexes.find((i) => i.key && i.key.googleId === 1 && !i.partialFilterExpression);
    if (legacy) {
      await coll.dropIndex(legacy.name);
      console.log('Dropped legacy users.googleId index:', legacy.name);
    }
    const r = await coll.updateMany({ googleId: null }, { $unset: { googleId: '' } });
    if (r.modifiedCount) console.log('Cleared googleId:null on ' + r.modifiedCount + ' users');
    await coll.createIndex(
      { googleId: 1 },
      { unique: true, partialFilterExpression: { googleId: { $type: 'string' } }, background: true }
    );
  } catch (e) {
    console.error('googleId index repair skipped:', e.message);
  }
}

if (mongoose.connection.readyState === 1) {
  repairGoogleIdIndex(mongoose.connection);
} else {
  mongoose.connection.once('connected', () => repairGoogleIdIndex(mongoose.connection));
}

module.exports = mongoose.model('User', userSchema);
