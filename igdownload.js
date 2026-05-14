'use strict';
/**
 * Instagram Downloader — Updated Nov 2025
 * Replace: allfunc/igdownload.js
 *
 * Returns: { caption: string, medias: [{ type: 'video'|'image', url: string }] }
 * Supports: posts, reels, IGTV, carousels
 *
 * Strategy: try multiple working public APIs + snapsave HTML scrape as final fallback.
 */

const axios = require('axios');
const cheerio = require('cheerio'); // npm i cheerio  (already in most baileys bots)

const UA =
  'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';

const headers = {
  'User-Agent': UA,
  'Accept': '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
};

function detectType(url) {
  if (!url) return 'image';
  const u = url.toLowerCase();
  if (u.includes('.mp4') || u.includes('/video') || u.includes('video_dashinit')) return 'video';
  return 'image';
}

function buildResult(caption, items) {
  const medias = (items || [])
    .map((i) => ({ type: i.type || detectType(i.url), url: i.url }))
    .filter((m) => m.url && /^https?:\/\//.test(m.url));
  if (!medias.length) throw new Error('No media URLs found');
  return { caption: caption || '', medias };
}

/* ─────────────────────────  PROVIDERS  ───────────────────────── */

// 1) SaveInsta (very stable, public POST endpoint)
async function viaSaveInsta(url) {
  const { data } = await axios.post(
    'https://saveinsta.app/api/ajaxSearch',
    new URLSearchParams({ q: url, t: 'media', lang: 'en' }).toString(),
    {
      headers: {
        ...headers,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': 'https://saveinsta.app',
        'Referer': 'https://saveinsta.app/',
        'X-Requested-With': 'XMLHttpRequest',
      },
      timeout: 25000,
    }
  );
  if (!data?.data) throw new Error('saveinsta empty');
  const $ = cheerio.load(data.data);
  const items = [];
  $('a.download-media, a.button__download, a[href*="cdninstagram"], a[href*=".mp4"], a[href*=".jpg"]').each(
    (_, el) => {
      const href = $(el).attr('href');
      if (href && /^https?:\/\//.test(href)) items.push({ url: href, type: detectType(href) });
    }
  );
  return buildResult('', items);
}

// 2) SnapSave (mirror of above, different host)
async function viaSnapSave(url) {
  const { data } = await axios.post(
    'https://v3.snapsave.app/api/ajaxSearch',
    new URLSearchParams({ q: url, t: 'media', lang: 'en' }).toString(),
    {
      headers: {
        ...headers,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': 'https://snapsave.app',
        'Referer': 'https://snapsave.app/',
        'X-Requested-With': 'XMLHttpRequest',
      },
      timeout: 25000,
    }
  );
  if (!data?.data) throw new Error('snapsave empty');
  const $ = cheerio.load(data.data);
  const items = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (href && /^https?:\/\/.*(cdninstagram|fbcdn|\.mp4|\.jpg|\.jpeg|\.webp)/i.test(href)) {
      items.push({ url: href, type: detectType(href) });
    }
  });
  return buildResult('', items);
}

// 3) Vreden (still alive as of late 2025)
async function viaVreden(url) {
  const { data } = await axios.get('https://api.vreden.my.id/api/igdownload', {
    params: { url }, headers, timeout: 20000,
  });
  const items = data?.result?.data || data?.result || data?.data;
  if (!Array.isArray(items) || !items.length) throw new Error('vreden empty');
  return buildResult(data?.result?.caption || '', items.map((i) => ({ url: i.url || i.download || i, type: i.type })));
}

// 4) Nayan (Bangladesh dev, fast)
async function viaNayan(url) {
  const { data } = await axios.get('https://api.nayan-videos-downloader.vercel.app/alldown', {
    params: { url }, headers, timeout: 20000,
  });
  const r = data?.data;
  if (!r) throw new Error('nayan empty');
  const list = [];
  if (r.high) list.push({ url: r.high, type: 'video' });
  else if (r.low) list.push({ url: r.low, type: 'video' });
  if (r.thumbnail && !list.length) list.push({ url: r.thumbnail, type: 'image' });
  return buildResult(r.title || '', list);
}

// 5) Direct embed scrape (last resort, no API)
async function viaEmbed(url) {
  const m = url.match(/\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
  if (!m) throw new Error('no shortcode');
  const embedUrl = `https://www.instagram.com/p/${m[1]}/embed/captioned/`;
  const { data } = await axios.get(embedUrl, { headers, timeout: 20000 });
  const $ = cheerio.load(data);
  const items = [];
  $('img[src], video[src], source[src]').each((_, el) => {
    const src = $(el).attr('src');
    if (src && /^https?:\/\//.test(src) && !src.includes('static.cdninstagram.com/rsrc')) {
      items.push({ url: src, type: detectType(src) });
    }
  });
  if (!items.length) throw new Error('embed empty');
  return buildResult('', items);
}

/* ─────────────────────────  MAIN  ───────────────────────── */

async function igDownload(url) {
  if (!url || !url.includes('instagram.com')) throw new Error('Invalid Instagram URL');

  const providers = [
    ['saveinsta', viaSaveInsta],
    ['snapsave',  viaSnapSave],
    ['vreden',    viaVreden],
    ['nayan',     viaNayan],
    ['embed',     viaEmbed],
  ];

  const errors = [];
  for (const [name, fn] of providers) {
    try {
      const res = await fn(url);
      if (res?.medias?.length) return res;
    } catch (e) {
      errors.push(`${name}: ${String(e.message).slice(0, 60)}`);
    }
  }
  throw new Error('All Instagram providers failed → ' + errors.join(' | '));
}

module.exports = { igDownload };
