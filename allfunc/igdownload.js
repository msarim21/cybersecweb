'use strict';
/**
 * Instagram Downloader — Updated May 2026
 * File: allfunc/igdownload.js
 *
 * Strategy:
 *  1. Instagram embed page — extract video_url from JSON (works everywhere, no API key)
 *  2. SaveInsta ajaxSearch
 *  3. SnapSave action.php
 *  4. IgDownloader ajaxSearch
 *  5. InstaVideoSave ajaxSearch
 */

const axios = require('axios');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

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

/* ────────────────────────────────────────────────────────────
   1. INSTAGRAM EMBED PAGE
   Most reliable — Instagram's own embed endpoint. Video URL is
   inside JSON embedded in the page (properly escaped). ─────── */
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

  // ── Extract video_url from embedded JSON ─────────────────
  // HTML contains: "video_url":"https:\/\/scontent..." (JSON-escaped)
  const videoUrlMatch = data.match(/"video_url"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (videoUrlMatch) {
    try {
      const cleanUrl = JSON.parse('"' + videoUrlMatch[1] + '"');
      if (/^https?:\/\//.test(cleanUrl)) {
        items.push({ url: cleanUrl, type: 'video' });
      }
    } catch { /* ignore parse error */ }
  }

  // ── Extract display_url / thumbnail_src for images ───────
  if (!items.length) {
    const imgMatches = [
      data.match(/"display_url"\s*:\s*"((?:[^"\\]|\\.)*)"/),
      data.match(/"thumbnail_src"\s*:\s*"((?:[^"\\]|\\.)*)"/),
    ];
    for (const match of imgMatches) {
      if (match) {
        try {
          const cleanUrl = JSON.parse('"' + match[1] + '"');
          if (/^https?:\/\//.test(cleanUrl)) {
            items.push({ url: cleanUrl, type: 'image' });
            break;
          }
        } catch { /* ignore */ }
      }
    }
  }

  // ── Fallback: scan all JSON string values for CDN URLs ────
  if (!items.length) {
    const allStrings = [...data.matchAll(/"((?:[^"\\]|\\.)*)"/g)];
    for (const s of allStrings) {
      try {
        const val = JSON.parse('"' + s[1] + '"');
        if (/^https?:\/\/[^\s]+(?:cdninstagram|fbcdn)[^\s]*\.(?:mp4|jpg|jpeg|png)/i.test(val)) {
          items.push({ url: val, type: detectType(val) });
          if (items.length >= 3) break;
        }
      } catch { /* ignore */ }
    }
  }

  return buildResult('', items);
}

/* ──────────────────────────────────────────────
   2. SAVEINSTA ─────────────────────────────── */
async function viaSaveInsta(url) {
  const { data } = await axios.post(
    'https://saveinsta.app/api/ajaxSearch',
    new URLSearchParams({ q: url, t: 'media', lang: 'en' }).toString(),
    {
      headers: {
        'User-Agent':        UA,
        'Content-Type':      'application/x-www-form-urlencoded',
        'Origin':            'https://saveinsta.app',
        'Referer':           'https://saveinsta.app/',
        'X-Requested-With':  'XMLHttpRequest',
      },
      timeout: 20000,
    }
  );

  const html = data?.data;
  if (!html || typeof html !== 'string') throw new Error('saveinsta: empty response');

  const items = [];
  for (const m of html.matchAll(/href=["']([^"']*(?:cdninstagram|fbcdn|\.mp4)[^"']*?)["']/g)) {
    items.push({ url: m[1].replace(/&amp;/g, '&'), type: detectType(m[1]) });
  }
  return buildResult('', items);
}

/* ──────────────────────────────────────────────
   3. SNAPSAVE ─────────────────────────────── */
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

/* ──────────────────────────────────────────────
   4. IGDOWNLOADER.APP ─────────────────────── */
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

/* ──────────────────────────────────────────────
   5. INSTAVIDEOSAVE ───────────────────────── */
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

/* ──────────────────────────────────────────────
   MAIN ────────────────────────────────────── */
async function igDownload(url) {
  if (!url || typeof url !== 'string') throw new Error('Invalid URL');
  if (!url.includes('instagram.com'))  throw new Error('Not an Instagram URL');

  // Clean up — remove query params, normalize trailing slash
  const cleanUrl = url.split('?')[0].replace(/\/+$/, '') + '/';

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
      const result = await fn(cleanUrl);
      if (result?.medias?.length) return result;
    } catch (e) {
      errors.push(`${name}: ${String(e.message).slice(0, 60)}`);
    }
  }

  throw new Error('All Instagram providers failed:\n' + errors.join('\n'));
}

module.exports = { igDownload };
