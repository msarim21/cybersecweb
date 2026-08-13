'use strict';

/**
 * CYBERSECPRO — Clean-room WhatsApp pairing engine.
 *
 * This module does ONE thing: take a phone number, obtain a pairing code from
 * WhatsApp, and drive the registration socket until the phone accepts it.
 * It deliberately contains no bot/command logic, so the pairing socket can
 * never be disturbed by message handlers, media plugins or group joins.
 *
 * Design rules (these are what previously broke):
 *  1. Exactly ONE live socket per number at any moment.
 *  2. `restartRequired` (515) after the phone accepts the code is NORMAL.
 *     Baileys just wants a fresh socket with the SAME auth state — we do that
 *     in-process instead of exiting and hoping a supervisor restarts us.
 *  3. Every terminal outcome is written to the database, so the dashboard can
 *     never sit on "CONNECTING" forever.
 *  4. Auth state lives on disk while pairing, and is mirrored to the database
 *     as soon as the session is registered so a dyno restart cannot lose it.
 */

const fs = require('fs');
const path = require('path');
const pino = require('pino');
const NodeCache = require('node-cache');

const {
  default: makeWASocket,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
  DisconnectReason,
  Browsers,
} = require('@whiskeysockets/baileys');

const ROOT = path.join(__dirname, '..');
const PAIR_ROOT = path.join(ROOT, 'nexstore', 'pairing');

const logger = pino({ level: 'silent' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── helpers ────────────────────────────────────────────────────

function cleanNumber(n) {
  return String(n || '').replace(/[^0-9]/g, '');
}

function sessionDir(number) {
  return path.join(PAIR_ROOT, cleanNumber(number));
}

function rmrf(target) {
  try {
    fs.rmSync(target, { recursive: true, force: true });
  } catch (_) {
    /* ignore */
  }
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function formatCode(code) {
  const raw = String(code || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  return raw.length === 8 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw;
}

function statusCodeOf(update) {
  const err = update?.lastDisconnect?.error;
  return err?.output?.statusCode ?? err?.status ?? null;
}

function db() {
  // Required lazily: the database module pulls in mongoose/pg and we want the
  // engine to stay importable from tooling/tests without a live database.
  return require(path.join(ROOT, 'server', 'db-service'));
}

/** Read every file of an auth folder into a plain object for DB storage. */
function readAuthFolder(dir) {
  const out = {};
  if (!fs.existsSync(dir)) return out;
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;
    try {
      out[file] = fs.readFileSync(path.join(dir, file), 'utf8');
    } catch (_) {
      /* skip unreadable file */
    }
  }
  return out;
}

/** Write a DB-stored auth folder snapshot back to disk. */
function writeAuthFolder(dir, files) {
  if (!files || typeof files !== 'object') return false;
  const names = Object.keys(files);
  if (!names.length) return false;
  ensureDir(dir);
  for (const name of names) {
    const value = files[name];
    fs.writeFileSync(
      path.join(dir, name),
      typeof value === 'string' ? value : JSON.stringify(value),
      'utf8',
    );
  }
  return true;
}

async function persistAuth(number, dir) {
  const files = readAuthFolder(dir);
  if (!Object.keys(files).length) return;
  try {
    await db().saveSessionCreds(cleanNumber(number), files);
  } catch (err) {
    console.error(`[pairing] persist creds failed for ${number}:`, err.message);
  }
}

/**
 * Does the database already hold a registered session for this number?
 * If yes, pairing must be skipped entirely — asking for a new code on an
 * already-linked number is what made WhatsApp answer "Couldn't link device".
 */
async function hasRegisteredSession(number) {
  try {
    const files = await db().getSessionCreds(cleanNumber(number));
    if (!files || !files['creds.json']) return false;
    const raw = files['creds.json'];
    const creds = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Boolean(creds?.registered || creds?.me?.id);
  } catch (_) {
    return false;
  }
}

// ─── the engine ──────────────────────────────────────────────────

const DEFAULTS = {
  // Time allowed for WhatsApp to hand us a pairing code.
  codeTimeoutMs: 60_000,
  // Time the user has to type the code on their phone.
  acceptTimeoutMs: 180_000,
  // How many fresh sockets we will open across the whole attempt.
  maxSockets: 6,
};

/**
 * Run one complete pairing attempt for `number`.
 *
 * @returns {Promise<{ok:boolean, code?:string, reason?:string}>}
 */
async function runPairing(number, options = {}) {
  const opts = { ...DEFAULTS, ...options };
  const clean = cleanNumber(number);
  if (!clean || clean.length < 8) {
    return { ok: false, reason: 'Invalid phone number' };
  }

  const dir = sessionDir(clean);
  const service = db();

  // Already linked? Restore and report success without touching WhatsApp.
  if (await hasRegisteredSession(clean)) {
    const files = await service.getSessionCreds(clean).catch(() => null);
    writeAuthFolder(dir, files);
    await service.markPairingConnected(clean).catch(() => {});
    return { ok: true, reason: 'already-registered' };
  }

  // A pairing attempt MUST start from an empty auth state. Half-written keys
  // from an expired code are rejected by the phone.
  rmrf(dir);
  rmrf(path.join(PAIR_ROOT, `${clean}@s.whatsapp.net`)); // legacy layout
  rmrf(path.join(PAIR_ROOT, `pairing_${clean}.json`));
  ensureDir(dir);
  await service.deleteSessionCreds(clean).catch(() => {});

  const { state, saveCreds } = await useMultiFileAuthState(dir);
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));

  const deadline = Date.now() + opts.codeTimeoutMs + opts.acceptTimeoutMs;
  let issuedCode = null;
  let sockets = 0;

  while (sockets < opts.maxSockets && Date.now() < deadline) {
    sockets += 1;
    const result = await runSocket({
      clean,
      dir,
      state,
      saveCreds,
      version,
      opts,
      issuedCode,
      deadline,
    });

    if (result.code) issuedCode = result.code;

    if (result.outcome === 'open') {
      await persistAuth(clean, dir);
      await service.markPairingConnected(clean).catch(() => {});
      return { ok: true, code: issuedCode };
    }

    if (result.outcome === 'restart') {
      // 515 — expected right after the phone accepts. Reconnect immediately
      // with the same (now registered) credentials.
      await persistAuth(clean, dir);
      await sleep(1500);
      continue;
    }

    if (result.outcome === 'retry') {
      await sleep(2000);
      continue;
    }

    // Terminal failure.
    await service.markPairingFailed(clean, result.reason).catch(() => {});
    return { ok: false, code: issuedCode, reason: result.reason };
  }

  const reason = issuedCode
    ? 'Code was not accepted in time — request a new one'
    : 'WhatsApp did not issue a pairing code — try again';
  await service.markPairingFailed(clean, reason).catch(() => {});
  return { ok: false, code: issuedCode, reason };
}

/**
 * Open a single socket and resolve with the first meaningful outcome.
 * Guarantees the socket is torn down before resolving, so the caller can
 * safely open the next one.
 */
function runSocket({ clean, dir, state, saveCreds, version, opts, issuedCode, deadline }) {
  return new Promise((resolve) => {
    let settled = false;
    let code = issuedCode;
    let sock;
    let timer;

    const finish = (outcome, reason) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        sock?.ev?.removeAllListeners?.('connection.update');
        sock?.ev?.removeAllListeners?.('creds.update');
      } catch (_) {}
      try {
        sock?.end?.(undefined);
      } catch (_) {}
      // Give the websocket a tick to close before the next socket opens.
      setTimeout(() => resolve({ outcome, reason, code }), 300);
    };

    try {
      sock = makeWASocket({
        version,
        logger,
        printQRInTerminal: false,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        // Chrome companion profile: the profile WhatsApp expects for
        // phone-number (companion) registration.
        browser: Browsers.ubuntu('Chrome'),
        markOnlineOnConnect: false,
        syncFullHistory: false,
        generateHighQualityLinkPreview: false,
        msgRetryCounterCache: new NodeCache(),
        connectTimeoutMs: 60_000,
        keepAliveIntervalMs: 25_000,
        defaultQueryTimeoutMs: 60_000,
      });
    } catch (err) {
      return finish('fatal', `Socket creation failed: ${err.message}`);
    }

    sock.ev.on('creds.update', async () => {
      try {
        await saveCreds();
      } catch (_) {}
    });

    const budget = Math.max(5_000, Math.min(deadline - Date.now(), opts.acceptTimeoutMs));
    timer = setTimeout(() => finish('timeout', 'Pairing timed out'), budget);

    sock.ev.on('connection.update', async (update) => {
      const { connection } = update;

      if (connection === 'open') return finish('open');

      if (connection !== 'close') return;

      const status = statusCodeOf(update);

      // 515: WhatsApp asks for a reconnect. After the phone accepts a code
      // this is the SUCCESS path, not a failure.
      if (status === DisconnectReason.restartRequired || status === 515) {
        return finish('restart');
      }

      if (
        status === DisconnectReason.loggedOut ||
        status === 401 ||
        status === 403 ||
        status === DisconnectReason.forbidden
      ) {
        return finish('fatal', 'WhatsApp rejected the link (logged out) — request a new code');
      }

      if (status === DisconnectReason.connectionReplaced || status === 440) {
        return finish('fatal', 'Session replaced by another connection');
      }

      if (status === DisconnectReason.badSession) {
        return finish('fatal', 'Corrupted session — request a new code');
      }

      // Transient (408/428/500/503/undefined): try a fresh socket.
      return finish('retry', `Connection closed (${status ?? 'unknown'})`);
    });

    // Request the code only when the socket is actually open and the account
    // is not registered yet.
    if (!state.creds.registered && !code) {
      void (async () => {
        const codeDeadline = Date.now() + opts.codeTimeoutMs;
        try {
          if (typeof sock.waitForSocketOpen === 'function') {
            await sock.waitForSocketOpen();
          } else {
            while (sock.ws?.readyState !== 1 && Date.now() < codeDeadline) await sleep(150);
          }
          if (settled) return;
          // Small settle delay — requesting on the very first tick after the
          // handshake occasionally yields a code the phone refuses.
          await sleep(1500);
          if (settled) return;

          const raw = await sock.requestPairingCode(clean);
          code = formatCode(raw);
          console.log(`[pairing] code for +${clean}: ${code}`);

          ensureDir(PAIR_ROOT);
          fs.writeFileSync(
            path.join(PAIR_ROOT, `pairing_${clean}.json`),
            JSON.stringify(
              {
                number: clean,
                code,
                timestamp: new Date().toISOString(),
                expiresAt: new Date(Date.now() + 120_000).toISOString(),
              },
              null,
              2,
            ),
            'utf8',
          );

          await db().setPairingCode(clean, code).catch((e) => {
            console.error('[pairing] setPairingCode failed:', e.message);
          });
        } catch (err) {
          if (!settled) finish('retry', `Code request failed: ${err.message}`);
        }
      })();
    }
  });
}

module.exports = {
  runPairing,
  cleanNumber,
  sessionDir,
  hasRegisteredSession,
  writeAuthFolder,
  readAuthFolder,
  formatCode,
};
