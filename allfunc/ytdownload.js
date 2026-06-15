'use strict';
/**
 * YouTube Downloader — allfunc/ytdownload.js
 *
 * Provider order (fastest first):
 *  1. VidsSave API  — single POST, fast, reliable
 *  2. Prince API    — fallback, tries 360p only (15s timeout)
 *  3. ytdl-core     — last resort
 */

const axios = require('axios');

const VIDSSAVE_URL  = 'https://api.vidssave.com/api/contentsite_api/media/parse';
const VIDSSAVE_AUTH = '20250901majwlqo';
const PRINCE_API    = 'https://api.princetechn.com/api/download';
const PRINCE_KEY    = 'prince';

let ytdl = null;
try { ytdl = require('@distube/ytdl-core'); } catch (_) {
  try { ytdl = require('ytdl-core'); } catch (_2) {}
}

// ── In-memory cache (10 min TTL) ────────────────────────────────────────────
const _cache   = new Map();
const CACHE_TTL = 10 * 60 * 1000;

function getCached(key) {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) { _cache.delete(key); return null; }
  return entry.data;
}

function setCache(key, data) {
  if (_cache.size > 100) {
    const oldest = [..._cache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
    if (oldest) _cache.delete(oldest[0]);
  }
  _cache.set(key, { data, ts: Date.now() });
}

function extractVideoId(url) {
  let id = '';
  if (url.includes('youtu.be/'))    id = url.split('youtu.be/')[1].split('?')[0];
  else if (url.includes('watch?v=')) id = url.split('watch?v=')[1].split('&')[0];
  else if (url.includes('/shorts/')) id = url.split('/shorts/')[1].split('?')[0];
  return id.trim();
}

// ── Provider 1: VidsSave ─────────────────────────────────────────────────────
async function viaVidsSave(videoUrl, wantAudio = false) {
  const body = `auth=${VIDSSAVE_AUTH}&domain=api-ak.vidssave.com&origin=cache&link=${encodeURIComponent(videoUrl)}`;
  const { data: d } = await axios.post(VIDSSAVE_URL, body, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Origin':  'https://vidssave.com',
      'Referer': 'https://vidssave.com/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
    },
    timeout: 20000,
  });

  const videoId   = extractVideoId(videoUrl);
  const title     = d?.title || d?.data?.title || 'YouTube Video';
  const thumbnail = d?.thumbnail || d?.data?.thumbnail ||
    `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  // Normalise — API returns different shapes depending on content type
  const rawLinks  = d?.links || d?.data?.links || d?.medias || d?.data?.medias || [];
  const singleUrl = d?.url   || d?.data?.url;

  const videoFormats = [];
  const audioFormats = [];

  for (const lk of rawLinks) {
    const url = lk.url || lk.download_url || lk.link;
    if (!url) continue;
    const quality = (lk.quality || lk.resolution || lk.label || '360p').toString();
    const type    = (lk.type || lk.format || lk.ext || '').toString().toLowerCase();
    if (type === 'mp3' || quality.toLowerCase().includes('kbps')) {
      audioFormats.push({ resource_id: 'vs_audio', quality, format: 'MP3', size_mb: '? MB', download_url: url });
    } else {
      videoFormats.push({ resource_id: 'vs_' + quality, quality, format: 'MP4', size_mb: '? MB', download_url: url });
    }
  }

  // Single-URL fallback (some endpoints return just one link)
  if (!videoFormats.length && !audioFormats.length && singleUrl) {
    videoFormats.push({ resource_id: 'vs_360p', quality: '360P', format: 'MP4', size_mb: '? MB', download_url: singleUrl });
  }

  if (!videoFormats.length && !audioFormats.length) throw new Error('VidsSave: no usable links in response');

  const bestVideo = videoFormats[0] || null;
  const bestAudio = audioFormats[0] || null;

  return {
    code: 200, timestamp: Date.now(),
    data: {
      id: videoId, title, thumbnail, duration: null, duration_formatted: null,
      video_formats: videoFormats,
      audio_formats: audioFormats,
      best_video: bestVideo ? { quality: bestVideo.quality, format: bestVideo.format, size: bestVideo.size_mb, url: bestVideo.download_url } : null,
      best_audio: bestAudio ? { quality: bestAudio.quality, format: bestAudio.format, size: bestAudio.size_mb, url: bestAudio.download_url } : null,
    },
  };
}

// ── Provider 2: Prince API (360p only, fast fallback) ────────────────────────
async function viaPrince(videoUrl, type = 'video') {
  const endpoint = type === 'audio' ? 'ytmp3' : 'ytvideo';
  const params   = { apikey: PRINCE_KEY, url: videoUrl };
  if (type !== 'audio') params.quality = '360p';

  const { data: d } = await axios.get(`${PRINCE_API}/${endpoint}`, {
    params,
    headers: { 'User-Agent': 'Mozilla/5.0' },
    timeout: 15000,
  });
  const r = d?.result;
  if (!d?.success || !r?.download_url || r?.error) throw new Error('Prince: ' + (r?.error || 'no download url'));

  const videoId = extractVideoId(videoUrl);
  if (type === 'audio') {
    return {
      code: 200, timestamp: Date.now(),
      data: {
        id: videoId, title: r.title || 'YouTube Audio',
        thumbnail: r.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        duration: null, duration_formatted: r.duration || null,
        video_formats: [], audio_formats: [{
          resource_id: 'pr_audio', quality: r.quality || '320KBPS', format: 'MP3', size_mb: '? MB', download_url: r.download_url,
        }],
        best_video: null,
        best_audio: { quality: r.quality || '320KBPS', format: 'MP3', size: '? MB', url: r.download_url },
      },
    };
  }
  const q = (r.quality || '360p').replace('p', 'P');
  return {
    code: 200, timestamp: Date.now(),
    data: {
      id: videoId, title: r.title || 'YouTube Video',
      thumbnail: r.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      duration: null, duration_formatted: r.duration || null,
      video_formats: [{ resource_id: 'pr_360p', quality: q, format: 'MP4', size_mb: '? MB', download_url: r.download_url }],
      audio_formats: [],
      best_video: { quality: q, format: 'MP4', size: '? MB', url: r.download_url },
      best_audio: null,
    },
  };
}

// ── Provider 3: ytdl-core ────────────────────────────────────────────────────
async function viaYtdlCore(videoUrl) {
  if (!ytdl) throw new Error('ytdl-core: package not installed');
  const info = await ytdl.getInfo(videoUrl, {
    requestOptions: {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    },
  });
  const videoId   = info.videoDetails.videoId;
  const title     = info.videoDetails.title;
  const duration  = parseInt(info.videoDetails.lengthSeconds) || null;
  const thumbnail = info.videoDetails.thumbnails?.slice(-1)[0]?.url ||
    `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  const videoFormats = ytdl.filterFormats(info.formats, 'videoandaudio')
    .map(f => ({
      resource_id: String(f.itag), quality: f.qualityLabel || '360p',
      format: (f.container || 'mp4').toUpperCase(),
      size: f.contentLength ? parseInt(f.contentLength) : null,
      size_mb: f.contentLength ? (parseInt(f.contentLength) / 1048576).toFixed(2) + ' MB' : '? MB',
      download_url: f.url,
    }))
    .sort((a, b) => Math.abs(720 - (parseInt(a.quality) || 0)) - Math.abs(720 - (parseInt(b.quality) || 0)));

  const audioFormats = ytdl.filterFormats(info.formats, 'audioonly')
    .map(f => ({
      resource_id: String(f.itag), quality: f.audioBitrate ? f.audioBitrate + 'KBPS' : '128KBPS',
      format: (f.container === 'webm' || f.mimeType?.includes('opus')) ? 'WEBM' : 'M4A',
      size: f.contentLength ? parseInt(f.contentLength) : null,
      size_mb: f.contentLength ? (parseInt(f.contentLength) / 1048576).toFixed(2) + ' MB' : '? MB',
      download_url: f.url,
    }))
    .sort((a, b) => parseInt(b.quality) - parseInt(a.quality));

  const bestVideo = videoFormats[0] || null;
  const bestAudio = audioFormats[0] || null;
  if (!bestVideo && !bestAudio) throw new Error('ytdl-core: no formats found');

  return {
    code: 200, timestamp: Date.now(),
    data: {
      id: videoId, title, thumbnail, duration,
      duration_formatted: duration ? new Date(duration * 1000).toISOString().slice(11, 19) : null,
      video_formats: videoFormats, audio_formats: audioFormats,
      best_video: bestVideo ? { quality: bestVideo.quality, format: bestVideo.format, size: bestVideo.size_mb, url: bestVideo.download_url } : null,
      best_audio: bestAudio ? { quality: bestAudio.quality, format: bestAudio.format, size: bestAudio.size_mb, url: bestAudio.download_url } : null,
    },
  };
}

// ── Public API ───────────────────────────────────────────────────────────────
async function ytDownload(videoUrl) {
  if (!videoUrl) throw new Error('URL required');
  const cacheKey = 'vid:' + videoUrl;
  const cached   = getCached(cacheKey);
  if (cached) return cached;

  const errors = [];

  try {
    const r = await viaVidsSave(videoUrl, false);
    if (r.data?.best_video || r.data?.video_formats?.length) { setCache(cacheKey, r); return r; }
  } catch (e) { errors.push('VidsSave: ' + e.message.slice(0, 80)); }

  try {
    const r = await viaPrince(videoUrl, 'video');
    if (r.data?.best_video) { setCache(cacheKey, r); return r; }
  } catch (e) { errors.push('Prince: ' + e.message.slice(0, 80)); }

  try {
    const r = await viaYtdlCore(videoUrl);
    if (r.data?.best_video || r.data?.best_audio) { setCache(cacheKey, r); return r; }
  } catch (e) { errors.push('ytdl: ' + e.message.slice(0, 80)); }

  throw new Error('YouTube download failed — ' + errors.join(' | '));
}

async function ytAudio(videoUrl) {
  if (!videoUrl) throw new Error('URL required');
  const cacheKey = 'aud:' + videoUrl;
  const cached   = getCached(cacheKey);
  if (cached) return cached;

  const errors = [];

  try {
    const r = await viaVidsSave(videoUrl, true);
    if (r.data?.best_audio || r.data?.audio_formats?.length) { setCache(cacheKey, r); return r; }
    // VidsSave may return video links only for audio request — still usable
    if (r.data?.best_video) { setCache(cacheKey, r); return r; }
  } catch (e) { errors.push('VidsSave: ' + e.message.slice(0, 80)); }

  try {
    const r = await viaPrince(videoUrl, 'audio');
    if (r.data?.best_audio) { setCache(cacheKey, r); return r; }
  } catch (e) { errors.push('Prince: ' + e.message.slice(0, 80)); }

  try {
    const r = await viaYtdlCore(videoUrl);
    if (r.data?.best_audio || r.data?.best_video) { setCache(cacheKey, r); return r; }
  } catch (e) { errors.push('ytdl: ' + e.message.slice(0, 80)); }

  throw new Error('YouTube audio failed — ' + errors.join(' | '));
}

module.exports = { ytDownload, ytAudio, extractVideoId };
