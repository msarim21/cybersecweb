require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URL = process.env.MONGO_URL;
const PG_URL    = process.env.DATABASE_URL ||
  (process.env.NODE_ENV !== 'production'
    ? 'postgresql://postgres:password@helium/heliumdb?sslmode=disable'
    : null);

let _pool      = null;
let _mongoMode = false;
let _dbReady   = false;
let _initPromise = null;
let _mongoHandlersAttached = false;

const isMongoMode = () => _mongoMode;
const getPool     = () => _pool;
const isDbReady   = () => _dbReady;

const MONGO_OPTS = {
  serverSelectionTimeoutMS: 15000,
  socketTimeoutMS:          60000,
  connectTimeoutMS:         20000,
  heartbeatFrequencyMS:     10000,
  retryWrites:              true,
  retryReads:               true,
  maxPoolSize:              20,
  minPoolSize:              2,
};

function _attachMongoHandlers() {
  if (_mongoHandlersAttached || !MONGO_URL) return;
  _mongoHandlersAttached = true;
  mongoose.connection.on('disconnected', () => {
    console.warn('⚠️  MongoDB disconnected — auto-reconnecting...');
    _dbReady = false;
    setTimeout(() => {
      mongoose.connect(MONGO_URL, MONGO_OPTS).catch((err) => {
        console.error('MongoDB reconnect failed:', err.message);
      });
    }, 3000);
  });
  mongoose.connection.on('error', (err) => {
    console.error('MongoDB error:', err.message);
  });
  mongoose.connection.on('reconnected', () => {
    _dbReady = true;
    console.log('✅ MongoDB reconnected');
  });
}

const initDb = async () => {
  if (_dbReady) return;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
  if (MONGO_URL) {
    _mongoMode = true;
    if (mongoose.connection.readyState === 1) {
      _attachMongoHandlers();
      _dbReady = true;
      return;
    }
    await mongoose.connect(MONGO_URL, MONGO_OPTS);
    _attachMongoHandlers();
    _dbReady = true;
    console.log('✅ MongoDB connected');
    return;
  }

  if (!PG_URL) {
    throw new Error('No database configured! Set MONGO_URL or DATABASE_URL in Heroku config vars.');
  }

  const { Pool } = require('pg');
  _pool = new Pool({
    connectionString: PG_URL,
    ssl: PG_URL.includes('sslmode=require') || PG_URL.includes('amazonaws') || process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : false,
    max:                    10,
    idleTimeoutMillis:      60000,
    connectionTimeoutMillis: 10000,
    keepAlive:              true,
    keepAliveInitialDelayMillis: 10000,
  });
  // Log pool errors so they don't silently crash the process
  _pool.on('error', (err) => {
    console.error('PostgreSQL pool error:', err.message);
  });

  const client = await _pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id                SERIAL PRIMARY KEY,
        username          VARCHAR(30)  UNIQUE NOT NULL,
        email             VARCHAR(255) UNIQUE NOT NULL,
        password          VARCHAR(255) NOT NULL,
        role              VARCHAR(10)  DEFAULT 'user'  CHECK (role IN ('user','admin')),
        subscription_plan VARCHAR(20)  DEFAULT 'free'  CHECK (subscription_plan IN ('free','pro','enterprise')),
        plan_expires_at   TIMESTAMPTZ  DEFAULT NULL,
        trial_expires_at  TIMESTAMPTZ  DEFAULT NULL,
        google_id         VARCHAR(50)    DEFAULT NULL UNIQUE,
        license_key       VARCHAR(100)   DEFAULT NULL,
        upgrade_request   VARCHAR(20)  DEFAULT 'none'  CHECK (upgrade_request IN ('none','pro','enterprise')),
        upgrade_request_at TIMESTAMPTZ DEFAULT NULL,
        banned            BOOLEAN      DEFAULT false,
        last_active       TIMESTAMPTZ  DEFAULT NOW(),
        created_at        TIMESTAMPTZ  DEFAULT NOW()
      )
    `);

    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ DEFAULT NULL`).catch(() => {});
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_expires_at TIMESTAMPTZ DEFAULT NULL`).catch(() => {});
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(50) DEFAULT NULL`).catch(() => {});
  await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS license_key VARCHAR(100) DEFAULT NULL`).catch(() => {});
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS upgrade_request VARCHAR(20) DEFAULT 'none'`).catch(() => {});
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS upgrade_request_at TIMESTAMPTZ DEFAULT NULL`).catch(() => {});

    await client.query(`
      CREATE TABLE IF NOT EXISTS linked_numbers (
        id          SERIAL PRIMARY KEY,
        number      VARCHAR(50) NOT NULL,
        bot_name    VARCHAR(50) NOT NULL,
        status      VARCHAR(10) DEFAULT 'active' CHECK (status IN ('active','inactive')),
        owner_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        last_active TIMESTAMPTZ DEFAULT NOW(),
        created_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS bot_sessions (
        id                  SERIAL PRIMARY KEY,
        number              VARCHAR(50) UNIQUE NOT NULL,
        status              VARCHAR(10) DEFAULT 'pending' CHECK (status IN ('active','inactive','pending')),
        connected_at        TIMESTAMPTZ,
        first_connected_at  TIMESTAMPTZ,
        last_active         TIMESTAMPTZ DEFAULT NOW(),
        created_at          TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    // Migrate: add first_connected_at if table already exists without it
    await client.query(`
      ALTER TABLE bot_sessions
      ADD COLUMN IF NOT EXISTS first_connected_at TIMESTAMPTZ
    `).catch(() => {});
    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id         SERIAL PRIMARY KEY,
        user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        sender     VARCHAR(10) NOT NULL CHECK (sender IN ('user','admin')),
        message    TEXT NOT NULL,
        read       BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_chat_user_created ON chat_messages(user_id, created_at DESC)`).catch(() => {});

    await client.query(`
      CREATE TABLE IF NOT EXISTS site_settings (
        key   VARCHAR(100) PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    _dbReady = true;
    console.log('✅ PostgreSQL tables ready');
  } finally {
    client.release();
  }
  })();

  try {
    await _initPromise;
  } catch (err) {
    _initPromise = null;
    throw err;
  }
};

module.exports = { initDb, isMongoMode, getPool, isDbReady };
