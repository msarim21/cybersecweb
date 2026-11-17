/**
 * allfunc/ytdl-local.js
 *
 * Local media downloader built on yt-dlp (no third-party API dependency).
 *
 * Why: every YouTube / Facebook / Twitter command used to call
 * api.princetechn.com, which is dead (TLS handshake never completes).
 * yt-dlp is an open-source downloader that talks to the sites directly, so
 * these commands keep working no matter what any hosted API does.
 *
 * Requirements: `yt-dlp` on PATH (the Dockerfile installs the standalone
 * binary) OR the python module `yt_dlp` OR a local copy at
 * allfunc/bin/yt-dlp. If none exist, `available()` is false and callers
 * reply with a clear message instead of crashing.
 *
 * Exports:
 *   available()               -> boolean
 *   ytInfo(url)               -> { title, duration, thumbnail, id, uploader, filesize }
 *   ytAudio(url, opts)        -> { buffer, title, thumbnail, duration, quality, filesize }
 *   ytVideo(url, opts)        -> { buffer, title, thumbnail, duration, filesize }
 *   ytAny(url, opts)          -> { buffer, title, thumbnail, duration, mimetype, kind }
 *   ytThumbnail(url)          -> string url (or '')
 */

const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// ── yt-dlp resolution (cached) ──────────────────────────────────────────────
let _cmd = null;   // { file: 'yt-dlp', prefixArgs: [] } | null

function resolveCmd() {
  if (_cmd !== null) return _cmd;

  const candidates = [
    { file: 'yt-dlp', prefixArgs: [] },
    { file: path.join(__dirname, 'bin', 'yt-dlp'), prefixArgs: [] },
    { file: 'python3', prefixArgs: ['-m', 'yt_dlp'] },
    { file: 'python', prefixArgs: ['-m', 'yt_dlp'] },
  ];

  for (const c of candidates) {
    try {
      const r = spawnSync(c.file, [...c.prefixArgs, '--version'], {
        timeout: 20000,
        encoding: 'utf8',
      });
      if (r && r.status === 0 && /\d{4}\.\d{2}\.\d{2}/.test(r.stdout || '')) {
        _cmd = c;
        console.log('[ytdl-local] using yt-dlp:', c.file, c.prefixArgs.join(' '));
        return _cmd;
      }
    } catch (e) {
      /* try next candidate */
    }
  }

  _cmd = false;
  console.warn('[ytdl-local] yt-dlp not found — install it (Dockerfile does) or put a copy at allfunc/bin/yt-dlp');
  return _cmd;
}

function available() {
  return Boolean(resolveCmd());
}

// ── core runner ─────────────────────────────────────────────────────────────
function runYtDlp(args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const c = resolveCmd();
    if (!c) return reject(new Error('yt-dlp is not installed on this server'));

    const child = spawn(c.file, [...c.prefixArgs, ...args], {
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
    });

    let out = '';
    let err = '';
    let killed = false;

    const timer = setTimeout(() => {
      killed = true;
      try { child.kill('SIGKILL'); } catch (e) {}
      reject(new Error('yt-dlp timeout after ' + timeoutMs + 'ms'));
    }, timeoutMs);

    child.stdout.on('data', (d) => { out += d.toString(); });
    child.stderr.on('data', (d) => { err += d.toString(); });

    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (killed) return;
      if (code === 0) return resolve(out);
      const msg = (err || out || '').split('\n').filter(Boolean).slice(-4).join(' | ');
      reject(new Error('yt-dlp failed (code ' + code + '): ' + msg.slice(0, 400)));
    });
  });
}

// ── info ────────────────────────────────────────────────────────────────────
async function ytInfo(url) {
  const out = await runYtDlp(
    ['-J', '--no-warnings', '--no-playlist', '--newline', url],
    60000
  );
  const data = JSON.parse(out);
  return {
    title: data.title || 'Unknown',
    duration: Math.round(data.duration || 0),
    thumbnail: data.thumbnail || '',
    id: data.id || '',
    uploader: data.uploader || data.channel || '',
    filesize: data.filesize || data.filesize_approx || 0,
    isLive: Boolean(data.is_live),
  };
}

// ── download helpers ────────────────────────────────────────────────────────
function makeTmpDir(tag) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ytdl-' + tag + '-'));
  return dir;
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
}

function pickFile(dir, wantedExts, maxBytes) {
  const files = fs.readdirSync(dir)
    .map((f) => path.join(dir, f))
    .filter((f) => {
      try { return fs.statSync(f).isFile(); } catch (e) { return false; }
    })
    .sort((a, b) => {
      const sa = fs.statSync(a).size;
      const sb = fs.statSync(b).size;
      return sb - sa;
    });

  for (const f of files) {
    const ext = path.extname(f).replace('.', '').toLowerCase();
    const size = fs.statSync(f).size;
    if (size < 1024) continue;
    if (wantedExts && !wantedExts.includes(ext)) continue;
    if (maxBytes && size > maxBytes) continue;
    return f;
  }
  return null;
}

/**
 * Download best audio, converted to MP3.
 * opts: { maxBytes, timeoutMs, quality }
 */
async function ytAudio(url, opts = {}) {
  const maxBytes = opts.maxBytes || 25 * 1024 * 1024;
  const timeoutMs = opts.timeoutMs || 300000;
  const quality = opts.quality || '192';
  const dir = makeTmpDir('a');

  try {
    await runYtDlp([
      '--no-warnings', '--no-playlist', '--newline',
      '-f', 'bestaudio/best',
      '-x', '--audio-format', 'mp3', '--audio-quality', quality,
      '--no-mtime',
      '-o', path.join(dir, '%(title)s.%(ext)s'),
      url,
    ], timeoutMs);

    const file = pickFile(dir, ['mp3'], maxBytes);
    if (!file) throw new Error('audio file nahi bana (bohot bari ya unsupported)');

    const buffer = fs.readFileSync(file);
    let meta = {};
    try { meta = await ytInfo(url); } catch (e) {}

    return {
      buffer,
      title: meta.title || path.basename(file, path.extname(file)),
      thumbnail: meta.thumbnail || '',
      duration: meta.duration || 0,
      quality: 'MP3 ' + quality + 'kbps',
      filesize: buffer.length,
      mimetype: 'audio/mpeg',
      fileName: (meta.title || 'audio').replace(/[<>:"/\\|?*]+/g, '').substring(0, 60) + '.mp3',
    };
  } finally {
    cleanup(dir);
  }
}

/**
 * Download video as MP4.
 * opts: { maxBytes, timeoutMs, maxHeight }
 */
async function ytVideo(url, opts = {}) {
  const maxBytes = opts.maxBytes || 65 * 1024 * 1024;
  const timeoutMs = opts.timeoutMs || 420000;
  const maxH = opts.maxHeight || 720;
  const dir = makeTmpDir('v');

  try {
    await runYtDlp([
      '--no-warnings', '--no-playlist', '--newline',
      '-f', `bestvideo[height<=${maxH}]+bestaudio/best[height<=${maxH}]/best`,
      '--merge-output-format', 'mp4',
      '--no-mtime',
      '-o', path.join(dir, '%(title)s.%(ext)s'),
      url,
    ], timeoutMs);

    const file = pickFile(dir, ['mp4', 'mkv', 'webm'], maxBytes);
    if (!file) throw new Error('video file nahi bana (bohot bari ya unsupported)');

    const buffer = fs.readFileSync(file);
    let meta = {};
    try { meta = await ytInfo(url); } catch (e) {}

    return {
      buffer,
      title: meta.title || path.basename(file, path.extname(file)),
      thumbnail: meta.thumbnail || '',
      duration: meta.duration || 0,
      filesize: buffer.length,
      mimetype: 'video/mp4',
      fileName: (meta.title || 'video').replace(/[<>:"/\\|?*]+/g, '').substring(0, 60) + '.mp4',
    };
  } finally {
    cleanup(dir);
  }
}

/**
 * Smart pick: audio-only pages (e.g. music) come back as audio, everything
 * else as video. Used by the generic .ytdown style commands.
 */
async function ytAny(url, opts = {}) {
  let meta = {};
  try { meta = await ytInfo(url); } catch (e) {}

  // Very long or audio-ish content -> audio, otherwise video.
  const wantAudio = opts.prefer === 'audio' || (meta.duration && meta.duration > 1200 && opts.prefer !== 'video');
  if (wantAudio) {
    const a = await ytAudio(url, opts);
    return { ...a, kind: 'audio' };
  }
  const v = await ytVideo(url, opts);
  return { ...v, kind: 'video' };
}

async function ytThumbnail(url) {
  try {
    const m = await ytInfo(url);
    return m.thumbnail || '';
  } catch (e) {
    return '';
  }
}

module.exports = { available, ytInfo, ytAudio, ytVideo, ytAny, ytThumbnail };
