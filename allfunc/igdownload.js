'use strict';
/**
 * Instagram Downloader — Updated May 2026
 * File: allfunc/igdownload.js
 *
 * Provider order:
 *  1. Instagram embed page  — no external service, extracts video_url from JSON
 *  2. saveinsta.to          — 3-step (tokens → cftoken → ajaxSearch), TESTED WORKING
 *  3. SaveInsta.app         — simple ajaxSearch
 *  4. SnapSave              — action.php
 *  5. IgDownloader.app      — ajaxSearch
 *  6. InstaVideoSave        — ajaxSearch
 *  7. Ryzen API
 *  8. Vreden API
 */

const axios = require('axios');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36';

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
  if (!medias.length) throw new Error('No valid media URLs found');
  return { caption: caption || '', medias };
}

/* ─────────────────────────────────────────────────────────────
   1. INSTAGRAM EMBED PAGE
   Extracts video_url from JSON inside Instagram's own embed page.
   ───────────────────────────────────────────────────────────── */
async function viaEmbed(url) {
  const m = url.match(/\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
  if (!m) throw new Error('embed: could not extract shortcode');
  const shortcode = m[1];

  const { data } = await axios.get(
    `https://www.instagram.com/p/${shortcode}/embed/captioned/`,
    {
      headers: {
        'User-Agent':      UA,
        'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer':         'https://www.instagram.com/',
      },
      timeout: 25000,
    }
  );

  const items = [];
  const videoUrlMatch = data.match(/"video_url"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (videoUrlMatch) {
    try {
      const cleanUrl = JSON.parse('"' + videoUrlMatch[1] + '"');
      if (/^https?:\/\//.test(cleanUrl)) items.push({ url: cleanUrl, type: 'video' });
    } catch { }
  }

  if (!items.length) {
    for (const key of ['"display_url"', '"thumbnail_src"']) {
      const r = data.match(new RegExp(key + '\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"'));
      if (r) {
        try {
          const cleanUrl = JSON.parse('"' + r[1] + '"');
          if (/^https?:\/\//.test(cleanUrl)) { items.push({ url: cleanUrl, type: 'image' }); break; }
        } catch { }
      }
    }
  }

  if (!items.length) {
    for (const s of [...data.matchAll(/"((?:[^"\\]|\\.)*)"/g)]) {
      try {
        const val = JSON.parse('"' + s[1] + '"');
        if (/^https?:\/\/[^\s]+(?:cdninstagram|fbcdn)[^\s]*\.(?:mp4|jpg|jpeg|png)/i.test(val)) {
          items.push({ url: val, type: detectType(val) });
          if (items.length >= 3) break;
        }
      } catch { }
    }
  }

  return buildResult('', items);
}

/* ─────────────────────────────────────────────────────────────
   2. SAVEINSTA.TO — 3-step (tokens → cftoken → ajaxSearch)
   TESTED WORKING: returns direct CDN video download links.
   ───────────────────────────────────────────────────────────── */
async function viaSaveInstaDotTo(url) {
  // Step 1: Get page tokens
  const page = await axios.get('https://saveinsta.to/en/highlights', {
    headers: {
      'User-Agent':      UA,
      'Accept':          'text/html,application/xhtml+xml,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer':         'https://www.google.com/',
    },
    timeout: 20000,
  });
  const html1 = page.data;
  const k_exp   = (html1.match(/k_exp\s*=\s*"([^"]+)"/)   || [])[1];
  const k_token = (html1.match(/k_token\s*=\s*"([^"]+)"/) || [])[1];
  if (!k_exp || !k_token) throw new Error('saveinsta.to: tokens not found on page');

  // Step 2: Get CF JWT token
  const cfRes = await axios.post(
    'https://saveinsta.to/api/userverify',
    `url=${encodeURIComponent(url)}`,
    {
      headers: {
        'Content-Type':     'application/x-www-form-urlencoded; charset=UTF-8',
        'Origin':           'https://saveinsta.to',
        'Referer':          'https://saveinsta.to/en/video',
        'User-Agent':       UA,
        'X-Requested-With': 'XMLHttpRequest',
      },
      timeout: 15000,
    }
  );
  const cftoken = cfRes.data?.token;
  if (!cftoken) throw new Error('saveinsta.to: no CF token returned');

  // Step 3: Fetch download HTML
  const body = new URLSearchParams({ k_exp, k_token, q: url, t: 'media', lang: 'en', v: 'v2', cftoken }).toString();
  const finalRes = await axios.post('https://saveinsta.to/api/ajaxSearch', body, {
    headers: {
      'Content-Type':     'application/x-www-form-urlencoded; charset=UTF-8',
      'Origin':           'https://saveinsta.to',
      'Referer':          'https://saveinsta.to/en/highlights',
      'User-Agent':       UA,
      'X-Requested-With': 'XMLHttpRequest',
    },
    timeout: 20000,
  });

  const fd = finalRes.data;
  if (fd?.status !== 'ok' || !fd?.data) throw new Error('saveinsta.to: bad final response');

  // Parse download links from returned HTML
  const html = fd.data;
  const items = [];

  // Find <a> tags with video attribute or "Download Video" text
  for (const m of html.matchAll(/<a\s[^>]*href="([^"]+)"[^>]*video[^>]*>/gi)) {
    items.push({ url: m[1].replace(/&amp;/g, '&'), type: 'video' });
  }
  for (const m of html.matchAll(/<a\s[^>]*video[^>]*href="([^"]+)"[^>]*>/gi)) {
    items.push({ url: m[1].replace(/&amp;/g, '&'), type: 'video' });
  }
  // Also find any direct CDN links
  for (const m of html.matchAll(/href="(https?:\/\/(?:dl\.snapcdn\.app|cdninstagram|scontent)[^"]+)"/gi)) {
    items.push({ url: m[1].replace(/&amp;/g, '&'), type: detectType(m[1]) });
  }

  return buildResult('', items);
}

/* ─────────────────────────────────────────────────────────────
   3. SAVEINSTA.APP — simple ajaxSearch
   ───────────────────────────────────────────────────────────── */
async function viaSaveInstaApp(url) {
  const { data } = await axios.post(
    'https://saveinsta.app/api/ajaxSearch',
    new URLSearchParams({ q: url, t: 'media', lang: 'en' }).toString(),
    {
      headers: {
        'User-Agent':       UA,
        'Content-Type':     'application/x-www-form-urlencoded',
        'Origin':           'https://saveinsta.app',
        'Referer':          'https://saveinsta.app/',
        'X-Requested-With': 'XMLHttpRequest',
      },
      timeout: 20000,
    }
  );
  const html = data?.data;
  if (!html || typeof html !== 'string') throw new Error('saveinsta.app: empty response');
  const items = [];
  for (const m of html.matchAll(/href=["']([^"']*(?:cdninstagram|fbcdn|\.mp4)[^"']*?)["']/g)) {
    items.push({ url: m[1].replace(/&amp;/g, '&'), type: detectType(m[1]) });
  }
  return buildResult('', items);
}

/* ─────────────────────────────────────────────────────────────
   4. SNAPSAVE — action.php
   ───────────────────────────────────────────────────────────── */
async function viaSnapSave(url) {
  const { data } = await axios.post(
    'https://snapsave.app/action.php',
    new URLSearchParams({ url }).toString(),
    {
      headers: {
        'User-Agent':   UA,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin':       'https://snapsave.app',
        'Referer':      'https://snapsave.app/',
      },
      timeout: 20000,
    }
  );
  const html = typeof data === 'string' ? data : (data?.data || '');
  if (!html) throw new Error('snapsave: empty response');
  const items = [];
  for (const m of html.matchAll(/href=["'](https?:\/\/[^"']*(?:cdninstagram|fbcdn|\.mp4)[^"']*?)["']/g)) {
    items.push({ url: m[1].replace(/&amp;/g, '&'), type: detectType(m[1]) });
  }
  return buildResult('', items);
}

/* ─────────────────────────────────────────────────────────────
   5. IGDOWNLOADER.APP
   ───────────────────────────────────────────────────────────── */
async function viaIgDownloader(url) {
  const { data } = await axios.post(
    'https://igdownloader.app/api/ajaxSearch',
    new URLSearchParams({ q: url, t: 'media', lang: 'en' }).toString(),
    {
      headers: {
        'User-Agent':       UA,
        'Content-Type':     'application/x-www-form-urlencoded',
        'Origin':           'https://igdownloader.app',
        'Referer':          'https://igdownloader.app/',
        'X-Requested-With': 'XMLHttpRequest',
      },
      timeout: 20000,
    }
  );
  const html = data?.data;
  if (!html || typeof html !== 'string') throw new Error('igdownloader: empty');
  const items = [];
  for (const m of html.matchAll(/["'](https?:\/\/[^"']*(?:cdninstagram|fbcdn)[^"']*\.(?:mp4|jpg|jpeg|png)[^"']*?)["']/g)) {
    if (!m[1].includes('static.cdninstagram')) items.push({ url: m[1], type: detectType(m[1]) });
  }
  return buildResult('', items);
}

/* ─────────────────────────────────────────────────────────────
   6. INSTAVIDEOSAVE.COM
   ───────────────────────────────────────────────────────────── */
async function viaInstaVideoSave(url) {
  const { data } = await axios.post(
    'https://instavideosave.com/api/ajaxSearch',
    new URLSearchParams({ q: url, t: 'media', lang: 'en' }).toString(),
    {
      headers: {
        'User-Agent':       UA,
        'Content-Type':     'application/x-www-form-urlencoded',
        'Origin':           'https://instavideosave.com',
        'Referer':          'https://instavideosave.com/',
        'X-Requested-With': 'XMLHttpRequest',
      },
      timeout: 20000,
    }
  );
  const html = data?.data;
  if (!html || typeof html !== 'string') throw new Error('instavideosave: empty');
  const items = [];
  for (const m of html.matchAll(/["'](https?:\/\/[^"']*(?:cdninstagram|fbcdn|\.mp4)[^"']*?)["']/g)) {
    items.push({ url: m[1], type: detectType(m[1]) });
  }
  return buildResult('', items);
}

/* ─────────────────────────────────────────────────────────────
   7. RYZEN API
   ───────────────────────────────────────────────────────────── */
async function viaRyzen(url) {
  const r = await axios.get('https://api.ryzendesu.vip/api/downloader/igdl', {
    params: { url }, headers: { 'User-Agent': UA }, timeout: 15000,
  });
  const d = r.data;
  if (d?.data?.length > 0) return buildResult('', d.data);
  throw new Error('ryzen: empty');
}

/* ─────────────────────────────────────────────────────────────
   8. VREDEN API
   ───────────────────────────────────────────────────────────── */
async function viaVreden(url) {
  const r = await axios.get('https://api.vreden.my.id/api/igdl', {
    params: { url }, headers: { 'User-Agent': UA }, timeout: 15000,
  });
  const d = r.data;
  const items = d?.result?.response || d?.data || [];
  if (items.length > 0) return buildResult(d?.result?.caption || '', items);
  throw new Error('vreden: empty');
}

/* ─────────────────────────────────────────────────────────────
   MAIN
   ───────────────────────────────────────────────────────────── */
async function igDownload(url) {
  if (!url || typeof url !== 'string') throw new Error('Invalid URL');
  if (!url.includes('instagram.com'))  throw new Error('Not an Instagram URL');

  const cleanUrl = url.split('?')[0].replace(/\/+$/, '') + '/';

  const providers = [
    ['embed',          viaEmbed],
    ['saveinsta.to',   viaSaveInstaDotTo],
    ['saveinsta.app',  viaSaveInstaApp],
    ['snapsave',       viaSnapSave],
    ['igdownloader',   viaIgDownloader],
    ['instavideosave', viaInstaVideoSave],
    ['ryzen',          viaRyzen],
    ['vreden',         viaVreden],
  ];

  const errors = [];
  for (const [name, fn] of providers) {
    try {
      const result = await fn(cleanUrl);
      if (result?.medias?.length) return result;
    } catch (e) {
      errors.push(`${name}: ${String(e.message).slice(0, 60)}`);
    }
  }

  throw new Error('All Instagram providers failed:\n' + errors.join('\n'));
}

module.exports = { igDownload };
