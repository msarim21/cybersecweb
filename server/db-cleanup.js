'use strict';

/**
 * Purge bot WhatsApp message caches from MongoDB.
 * Keeps web data: users, linked numbers, site settings, bot session creds.
 */
async function purgeBotMessageData() {
  const { isMongoMode, isDbReady } = require('./db');
  if (!isMongoMode() || !isDbReady()) {
    return { skipped: true, reason: 'db_not_ready' };
  }

  const results = { antideleteCache: 0 };
  const db = require('mongoose').connection.db;

  try {
    const cols = await db.listCollections({ name: 'antideletecaches' }).toArray();
    if (cols.length) {
      await db.dropCollection('antideletecaches');
      results.antideleteCache = -1; // dropped entire collection
    } else {
      const AntideleteCache = require('./models/AntideleteCache');
      const res = await AntideleteCache.deleteMany({});
      results.antideleteCache = res.deletedCount || 0;
    }
  } catch (err) {
    results.antideleteError = err.message;
  }

  return results;
}

module.exports = { purgeBotMessageData };
