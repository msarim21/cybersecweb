'use strict';
/**
 * YouTube Downloader — Updated May 2026
 * File: allfunc/ytdownload.js
 *
 * Strategy:
 *  1. VidsSave API (primary — fast, gives direct URLs)
 *  2. @distube/ytdl-core (fallback — always available, no external API needed)
 */

const axios = require('axios');

/* ─────────────────── helpers ─────────────────── */
function extractVideoId(url) {
  try {
    if (!url || typeof url !== 'string') throw new Error('Invalid URL');
    if (url.includes('youtu.be/'))  return url.split('youtu.be/')[1].split(/[?&]/)[0];
    if (url.includes('watch?v='))   return url.split('watch?v=')[1].split('&')[0];
    if (url.includes('/shorts/'))   return url.split('/shorts/')[1].split('?')[0];
    if (url.includes('/embed/'))    return url.split('/embed/')[1].split('?')[0];
    throw new Error('Unrecognized YouTube URL format');
  } catch (e) {
    throw new Error('Video ID extract error: ' + e.message);
  }
}

function buildResult(info) {
  return {
    code: 200,
    status: 'success',
    timestamp: Date.now(),
    data: info,
    error: false,
  };
}

function errorResult(msg) {
  return { code: 500, status: 'error', timestamp: Date.now(), message: msg, error: true };
}

/* ─────────────────── 1. VidsSave API ─────────────────── */
async function viaVidsSave(videoUrl) {
  const body = new URLSearchParams();
  body.append('auth',   '20250901majwlqo');
  body.append('domain', 'api-ak.vidssave.com');
  body.append('origin', 'cache');
  body.append('link',   videoUrl);

  const res = await axios.post(
    'https://api.vidssave.com/api/contentsite_api/media/parse',
    body.toString(),
    {
      headers: {
        'content-type':  'application/x-www-form-urlencoded',
        'origin':        'https://vidssave.com',
        'referer':       'https://vidssave.com/',
        'user-agent':    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'accept':        '*/*',
      },
      timeout: 20000,
    }
  );

  const data = res.data;
  if (!data)                              throw new Error('VidsSave: empty response');
  if (data.status !== 1 || !data.data)   throw new Error(data.message || 'VidsSave: no data');

  const info      = data.data;
  const resources = info.resources || [];

  const fmt = (r) => ({
    quality:      r.quality || 'Unknown',
    format:       r.format  || 'MP4',
    size:         r.size    || 0,
    size_mb:      ((r.size || 0) / 1024 / 1024).toFixed(2) + ' MB',
    download_url: r.download_url || null,
  });

  const ORDER_VID = ['2160P','1440P','1080P','720P','480P','360P','240P','144P'];
  const ORDER_AUD = ['320KBPS','256KBPS','192KBPS','128KBPS','96KBPS','64KBPS','48KBPS'];

  const sortIdx = (arr, val) => { const i = arr.indexOf(val); return i === -1 ? 999 : i; };

  const videoFmts = resources
    .filter(r => r?.type === 'video' && r.download_url)
    .map(fmt)
    .sort((a, b) => sortIdx(ORDER_VID, a.quality) - sortIdx(ORDER_VID, b.quality));

  const audioFmts = resources
    .filter(r => r?.type === 'audio' && r.download_url)
    .map(fmt)
    .sort((a, b) => sortIdx(ORDER_AUD, a.quality) - sortIdx(ORDER_AUD, b.quality));

  const dur = info.duration || 0;
  const duration_formatted = dur ? new Date(dur * 1000).toISOString().slice(11, 19) : '00:00:00';

  const bv = videoFmts[0] || null;
  const ba = audioFmts[0] || null;

  return buildResult({
    id:                  info.id       || null,
    title:               info.title    || 'Unknown Title',
    thumbnail:           info.thumbnail|| null,
    duration: dur, duration_formatted,
    video_formats:       videoFmts,
    audio_formats:       audioFmts,
    best_video: bv ? { quality: bv.quality, format: bv.format, size: bv.size_mb, url: bv.download_url } : null,
    best_audio: ba ? { quality: ba.quality, format: ba.format, size: ba.size_mb, url: ba.download_url } : null,
    total_video_formats: videoFmts.length,
    total_audio_formats: audioFmts.length,
  });
}

/* ─────────────────── 2. @distube/ytdl-core ─────────────────── */
async function viaYtdlCore(videoUrl) {
  let ytdl;
  try {
    ytdl = require('@distube/ytdl-core');
  } catch {
    throw new Error('ytdl-core not installed');
  }

  const info = await ytdl.getInfo(videoUrl, {
    requestOptions: {
      headers: {
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    },
  });

  const details = info.videoDetails;
  const formats = info.formats || [];

  // Filter usable video formats (have both video + audio, or just video)
  const videoFmts = ytdl.filterFormats(formats, 'videoandaudio')
    .filter(f => f.url)
    .sort((a, b) => (parseInt(b.qualityLabel) || 0) - (parseInt(a.qualityLabel) || 0))
    .slice(0, 6)
    .map(f => ({
      quality:      f.qualityLabel || f.quality || 'Unknown',
      format:       (f.container || 'mp4').toUpperCase(),
      size:         f.contentLength || 0,
      size_mb:      f.contentLength ? (f.contentLength / 1024 / 1024).toFixed(2) + ' MB' : 'N/A',
      download_url: f.url,
    }));

  // Audio only formats
  const audioFmts = ytdl.filterFormats(formats, 'audioonly')
    .filter(f => f.url && f.mimeType?.includes('audio'))
    .sort((a, b) => (b.audioBitrate || 0) - (a.audioBitrate || 0))
    .slice(0, 4)
    .map(f => ({
      quality:      (f.audioBitrate ? f.audioBitrate + 'KBPS' : f.quality || 'Unknown'),
      format:       (f.container || 'm4a').toUpperCase(),
      size:         f.contentLength || 0,
      size_mb:      f.contentLength ? (f.contentLength / 1024 / 1024).toFixed(2) + ' MB' : 'N/A',
      download_url: f.url,
    }));

  if (!videoFmts.length && !audioFmts.length) throw new Error('ytdl-core: no downloadable formats found');

  const dur = parseInt(details.lengthSeconds) || 0;
  const duration_formatted = dur ? new Date(dur * 1000).toISOString().slice(11, 19) : '00:00:00';

  const bv = videoFmts[0] || null;
  const ba = audioFmts[0] || null;

  return buildResult({
    id:              details.videoId    || null,
    title:           details.title      || 'Unknown Title',
    thumbnail:       details.thumbnails?.slice(-1)[0]?.url || null,
    duration: dur,   duration_formatted,
    video_formats:   videoFmts,
    audio_formats:   audioFmts,
    best_video: bv ? { quality: bv.quality, format: bv.format, size: bv.size_mb, url: bv.download_url } : null,
    best_audio: ba ? { quality: ba.quality, format: ba.format, size: ba.size_mb, url: ba.download_url } : null,
    total_video_formats: videoFmts.length,
    total_audio_formats: audioFmts.length,
  });
}

/* ─────────────────── MAIN ─────────────────── */
async function ytDownload(videoUrl) {
  if (!videoUrl) return errorResult('URL khali nahi ho sakta');

  const providers = [
    ['VidsSave',  viaVidsSave],
    ['ytdl-core', viaYtdlCore],
  ];

  const errors = [];
  for (const [name, fn] of providers) {
    try {
      const result = await fn(videoUrl);
      if (result?.data) return result;
    } catch (e) {
      errors.push(`${name}: ${e.message?.slice(0, 80)}`);
    }
  }

  return errorResult('All providers failed → ' + errors.join(' | '));
}

module.exports = { ytDownload, extractVideoId };
