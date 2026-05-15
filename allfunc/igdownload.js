'use strict';
/**
 * Instagram Downloader — Updated May 2026
 * File: allfunc/igdownload.js
 *
 * Strategy (in order):
 *  1. Instagram embed page scraping  — works without any third-party API
 *  2. SaveInsta (ajaxSearch)         — reliable public endpoint
 *  3. SnapSave (ajaxSearch)          — mirror/fallback
 *  4. FastDL (ajaxSearch)            — additional fallback
 *  5. InstaDownloader                — extra fallback
 *  6. Direct GraphQL scrape          — last resort
 *
 * Returns: { caption: string, medias: [{ type: 'video'|'image', url: string }] }
 */

const axios = require('axios');

const UA_MOBILE =
  'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';

const UA_DESKTOP =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function detectType(url) {
  if (!url) return 'image';
  const u = url.toLowerCase().split('?')[0];
  if (u.endsWith('.mp4') || u.includes('/video') || u.includes('video_dashinit')) return 'video';
  return 'image';
}

function buildResult(caption, items) {
  const seen = new Set();
  const medias = (items || [])
    .map(i => ({ type: i.type || detectType(i.url), url: i.url }))
    .filter(m => {
      if (!m.url || !/^https?:\/\//.test(m.url)) return false;
      if (seen.has(m.url)) return false;
      seen.add(m.url);
      return true;
    });
  if (!medias.length) throw new Error('No media URLs found');
  return { caption: caption || '', medias };
}

/* ─────────────────────── 1. EMBED SCRAPE ────────────────────────────────
   Instagram's own embed endpoint — no third-party API needed, very stable  */
async function viaEmbed(url) {
  const m = url.match(/\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
  if (!m) throw new Error('Could not extract shortcode from URL');
  const shortcode = m[1];
  const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/captioned/`;

  const { data } = await axios.get(embedUrl, {
    headers: {
      'User-Agent': UA_DESKTOP,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://www.instagram.com/',
    },
    timeout: 20000,
  });

  const items = [];

  // Extract video sources
  const videoMatches = data.matchAll(/["']([^"']+\.mp4[^"']*?)["']/g);
  for (const vm of videoMatches) {
    const url = vm[1].replace(/\\u0026/g, '&').replace(/\\/g, '');
    if (/^https?:\/\//.test(url) && !url.includes('stories')) {
      items.push({ url, type: 'video' });
    }
  }

  // Extract image sources from og:image or img tags
  const imgMatches = data.matchAll(/["']([^"']+(?:cdninstagram|fbcdn)[^"']+\.(?:jpg|jpeg|png|webp)[^"']*?)["']/g);
  for (const im of imgMatches) {
    const url = im[1].replace(/\\u0026/g, '&').replace(/\\/g, '');
    if (/^https?:\/\//.test(url) && !url.includes('s150x150') && !url.includes('rsrc.php')) {
      items.push({ url, type: 'image' });
    }
  }

  if (!items.length) throw new Error('embed: no media found in embed page');

  // Prefer video if found
  const videos = items.filter(i => i.type === 'video');
  const images = items.filter(i => i.type === 'image');
  const finalItems = videos.length ? videos.slice(0, 1) : images.slice(0, 1);

  return buildResult('', finalItems);
}

/* ─────────────────────── 2. SAVEINSTA ───────────────────────────────── */
async function viaSaveInsta(url) {
  const { data } = await axios.post(
    'https://saveinsta.app/api/ajaxSearch',
    new URLSearchParams({ q: url, t: 'media', lang: 'en' }).toString(),
    {
      headers: {
        'User-Agent': UA_MOBILE,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': 'https://saveinsta.app',
        'Referer': 'https://saveinsta.app/',
        'X-Requested-With': 'XMLHttpRequest',
      },
      timeout: 20000,
    }
  );

  if (!data?.data || typeof data.data !== 'string') throw new Error('saveinsta: empty response');

  const items = [];
  const hrefs = data.data.matchAll(/href=["']([^"']+)["'][^>]*class=["'][^"']*download/g);
  for (const h of hrefs) {
    if (/^https?:\/\//.test(h[1])) items.push({ url: h[1], type: detectType(h[1]) });
  }

  // Fallback: any cdninstagram link
  if (!items.length) {
    const cdn = data.data.matchAll(/["'](https?:\/\/[^"']*(?:cdninstagram|fbcdn)[^"']+)["']/g);
    for (const c of cdn) {
      items.push({ url: c[1], type: detectType(c[1]) });
    }
  }

  return buildResult('', items);
}

/* ─────────────────────── 3. SNAPSAVE ────────────────────────────────── */
async function viaSnapSave(url) {
  const { data } = await axios.post(
    'https://snapsave.app/action.php',
    new URLSearchParams({ url }).toString(),
    {
      headers: {
        'User-Agent': UA_MOBILE,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': 'https://snapsave.app',
        'Referer': 'https://snapsave.app/',
      },
      timeout: 20000,
    }
  );

  if (!data?.data && typeof data !== 'string') throw new Error('snapsave: empty');

  const html = typeof data === 'string' ? data : (data.data || '');
  const items = [];
  const cdn = html.matchAll(/href=["'](https?:\/\/[^"']*(?:cdninstagram|fbcdn|\.mp4)[^"']*?)["']/g);
  for (const c of cdn) {
    items.push({ url: c[1].replace(/&amp;/g, '&'), type: detectType(c[1]) });
  }
  return buildResult('', items);
}

/* ─────────────────────── 4. IGDOWNLOADER.APP ─────────────────────────── */
async function viaIgDownloader(url) {
  const { data } = await axios.post(
    'https://igdownloader.app/api/ajaxSearch',
    new URLSearchParams({ q: url, t: 'media', lang: 'en' }).toString(),
    {
      headers: {
        'User-Agent': UA_MOBILE,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': 'https://igdownloader.app',
        'Referer': 'https://igdownloader.app/',
        'X-Requested-With': 'XMLHttpRequest',
      },
      timeout: 20000,
    }
  );

  if (!data?.data || typeof data.data !== 'string') throw new Error('igdownloader: empty');
  const items = [];
  const cdn = data.data.matchAll(/["'](https?:\/\/[^"']*(?:cdninstagram|fbcdn|\.mp4|\.jpg)[^"']*?)["']/g);
  for (const c of cdn) {
    if (!c[1].includes('static.cdninstagram')) items.push({ url: c[1], type: detectType(c[1]) });
  }
  return buildResult('', items);
}

/* ─────────────────────── 5. INSTAVIDEOSAVE ───────────────────────────── */
async function viaInstaVideoSave(url) {
  const { data } = await axios.post(
    'https://instavideosave.com/api/ajaxSearch',
    new URLSearchParams({ q: url, t: 'media', lang: 'en' }).toString(),
    {
      headers: {
        'User-Agent': UA_MOBILE,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': 'https://instavideosave.com',
        'Referer': 'https://instavideosave.com/',
        'X-Requested-With': 'XMLHttpRequest',
      },
      timeout: 20000,
    }
  );

  if (!data?.data || typeof data.data !== 'string') throw new Error('instavideosave: empty');
  const items = [];
  const cdn = data.data.matchAll(/["'](https?:\/\/[^"']*(?:cdninstagram|fbcdn|\.mp4)[^"']*?)["']/g);
  for (const c of cdn) {
    items.push({ url: c[1], type: detectType(c[1]) });
  }
  return buildResult('', items);
}

/* ─────────────────────── MAIN ────────────────────────────────────────── */
async function igDownload(url) {
  if (!url || typeof url !== 'string') throw new Error('Invalid URL provided');
  if (!url.includes('instagram.com')) throw new Error('Not an Instagram URL');

  // Normalize URL — remove query params that might break providers
  const cleanUrl = url.split('?')[0].replace(/\/$/, '') + '/';

  const providers = [
    ['embed',          viaEmbed],
    ['saveinsta',      viaSaveInsta],
    ['snapsave',       viaSnapSave],
    ['igdownloader',   viaIgDownloader],
    ['instavideosave', viaInstaVideoSave],
  ];

  const errors = [];
  for (const [name, fn] of providers) {
    try {
      const res = await fn(cleanUrl);
      if (res?.medias?.length) {
        return res;
      }
    } catch (e) {
      errors.push(`${name}: ${String(e.message).slice(0, 60)}`);
    }
  }

  throw new Error(
    'All Instagram download providers failed.\n' + errors.join('\n')
  );
}

module.exports = { igDownload };
