'use strict';
/**
 * YouTube Downloader — Updated Nov 2025
 * Replace: allfunc/ytdownload.js
 *
 * Exports:
 *   ytDownload(url)            -> resolves { data: { title, thumbnail, video_formats:[], best_video, audio:{} } }
 *   ytAudio(url)               -> shortcut for mp3
 *   ytVideo(url, quality?)     -> shortcut for mp4 with desired quality (default 720p)
 *
 * Strategy: @distube/ytdl-core direct extract (most reliable in 2025)
 *           + 3 public API fallbacks if YT signature breaks.
 *
 * Install (run once on server):
 *   npm i @distube/ytdl-core@latest axios
 */

const axios = require('axios');
const ytdl = require('@distube/ytdl-core');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const headers = { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' };

/* ───── helpers ───── */

function pickQualityLabel(itag) {
  const map = { 17: '144P', 18: '360P', 22: '720P', 37: '1080P', 137: '1080P', 136: '720P', 135: '480P', 134: '360P', 133: '240P', 160: '144P' };
  return map[itag] || 'AUTO';
}

function normaliseFromYtdl(info) {
  const formats = info.formats || [];
  const videoCombined = formats.filter((f) => f.hasVideo && f.hasAudio && f.url);

  const video_formats = videoCombined.map((f) => ({
    quality: (f.qualityLabel || pickQualityLabel(f.itag)).toUpperCase(),
    container: f.container,
    download_url: f.url,
    size_mb: f.contentLength ? +(f.contentLength / 1048576).toFixed(2) : null,
  }));

  const audio = formats
    .filter((f) => f.hasAudio && !f.hasVideo && f.url)
    .sort((a, b) => (b.audioBitrate || 0) - (a.audioBitrate || 0))[0];

  return {
    title: info.videoDetails.title,
    thumbnail: info.videoDetails.thumbnails?.pop()?.url,
    duration: +info.videoDetails.lengthSeconds,
    youtube_id: info.videoDetails.videoId,
    video_formats,
    best_video: video_formats[0] || null,
    audio: audio
      ? { quality: 'AUDIO', container: audio.container, download_url: audio.url, bitrate: audio.audioBitrate }
      : null,
  };
}

/* ───── primary: ytdl-core direct ───── */

async function viaYtdl(url) {
  const info = await ytdl.getInfo(url, { requestOptions: { headers } });
  return { data: normaliseFromYtdl(info) };
}

/* ───── fallback APIs ───── */

async function viaVreden(url) {
  const { data } = await axios.get('https://api.vreden.my.id/api/ytmp4', { params: { url }, timeout: 60000 });
  const dl = data?.result?.download?.url || data?.result?.url;
  if (!dl) throw new Error('vreden empty');
  const meta = data?.result?.metadata || {};
  return {
    data: {
      title: meta.title || 'video',
      thumbnail: meta.thumbnail,
      duration: meta.duration,
      youtube_id: meta.videoId,
      video_formats: [{ quality: '720P', container: 'mp4', download_url: dl }],
      best_video: { quality: '720P', container: 'mp4', download_url: dl },
      audio: null,
    },
  };
}

async function viaDavidcyril(url) {
  const { data } = await axios.get('https://api.davidcyriltech.my.id/download/ytmp4', { params: { url }, timeout: 60000 });
  const dl = data?.result?.download_url;
  if (!dl) throw new Error('davidcyril empty');
  return {
    data: {
      title: data.result.title,
      thumbnail: data.result.thumbnail,
      youtube_id: data.result.videoId,
      video_formats: [{ quality: '720P', container: 'mp4', download_url: dl }],
      best_video: { quality: '720P', container: 'mp4', download_url: dl },
      audio: null,
    },
  };
}

async function viaSiputzx(url) {
  const { data } = await axios.get('https://api.siputzx.my.id/api/d/ytmp4', { params: { url }, timeout: 60000 });
  const dl = data?.data?.dl;
  if (!dl) throw new Error('siputzx empty');
  return {
    data: {
      title: data.data.title,
      thumbnail: data.data.thumbnail,
      video_formats: [{ quality: '720P', container: 'mp4', download_url: dl }],
      best_video: { quality: '720P', container: 'mp4', download_url: dl },
      audio: null,
    },
  };
}

/* ───── audio fallback ───── */

async function viaPrexzy(url) {
  const { data } = await axios.get('https://apis.prexzyvilla.site/download/ytmp3', { params: { url }, timeout: 60000 });
  if (!data?.success) throw new Error('prexzy empty');
  return {
    data: {
      title: data.result.title,
      thumbnail: data.result.thumbnail,
      audio: { quality: 'AUDIO', container: 'mp3', download_url: data.result.download_url },
      video_formats: [],
      best_video: null,
    },
  };
}

/* ───── main entry ───── */

async function ytDownload(url) {
  if (!url) throw new Error('YouTube URL required');
  if (!ytdl.validateURL(url)) throw new Error('Invalid YouTube URL');

  const order = [viaYtdl, viaVreden, viaDavidcyril, viaSiputzx];
  const errs = [];
  for (const fn of order) {
    try {
      const r = await fn(url);
      if (r?.data) return r;
    } catch (e) {
      errs.push(`${fn.name}: ${String(e.message).slice(0, 80)}`);
    }
  }
  throw new Error('All YT video providers failed → ' + errs.join(' | '));
}

async function ytAudio(url) {
  // try ytdl audio first
  try {
    const info = await ytdl.getInfo(url, { requestOptions: { headers } });
    const data = normaliseFromYtdl(info);
    if (data.audio) return { data };
  } catch (_) { /* fall through */ }
  return viaPrexzy(url);
}

async function ytVideo(url, quality = '720p') {
  const result = await ytDownload(url);
  const want = quality.toUpperCase();
  const fmt =
    result.data.video_formats.find((f) => f.quality === want) ||
    result.data.best_video ||
    result.data.video_formats[0];
  if (!fmt) throw new Error('No video format available');
  return { ...result, chosen: fmt };
}

module.exports = { ytDownload, ytAudio, ytVideo };
