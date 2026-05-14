'use strict';
const axios = require('axios');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function detectType(url) {
  if (!url) return 'image';
  return (url.includes('.mp4') || url.includes('/video') || url.includes('/v/')) ? 'video' : 'image';
}

function buildResult(caption, items) {
  const medias = items.map(item => ({
    type: item.type || detectType(item.url),
    url: item.url,
  })).filter(m => m.url);
  if (!medias.length) throw new Error('No media URLs found');
  return { caption: caption || '', medias };
}

async function igDownload(url) {
  const errors = [];

  // ── 0. SaveFrom (most reliable) ──
  try {
    const r = await axios.post('https://worker.saveform.net/api/convert',
      JSON.stringify({ url }),
      {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': UA,
          'Referer': 'https://en.savefrom.net/',
          'Origin': 'https://en.savefrom.net',
        },
        timeout: 15000,
      }
    );
    const d = r.data;
    const items = d?.result || d?.data || d?.links || [];
    const filtered = Array.isArray(items) ? items.filter(x => (x.url || x.href || '').includes('mp4') || (x.type || '').includes('video')) : [];
    if (filtered.length > 0) {
      const best = filtered[0];
      return buildResult('', [{ type: 'video', url: best.url || best.href }]);
    }
    throw new Error('no mp4');
  } catch (e) { errors.push('savefrom:' + e.message.slice(0, 30)); }

  // ── 0b. InstaDownloader ──
  try {
    const r = await axios.get('https://instadownloader.co/api.php', {
      params: { url },
      headers: { 'User-Agent': UA, 'Referer': 'https://instadownloader.co/' },
      timeout: 15000,
    });
    const d = r.data;
    const mediaUrl = d?.url || d?.video_url || d?.media;
    if (mediaUrl) return buildResult(d?.caption || '', [{ type: 'video', url: mediaUrl }]);
    throw new Error('no url');
  } catch (e) { errors.push('instadownloader:' + e.message.slice(0, 30)); }

  // ── 1. Ryzen ──
  try {
    const r = await axios.get('https://api.ryzendesu.vip/api/downloader/igdl', {
      params: { url }, headers: { 'User-Agent': UA }, timeout: 15000,
    });
    const d = r.data;
    if (d?.data?.length > 0) return buildResult('', d.data);
    throw new Error('empty');
  } catch (e) { errors.push('ryzen:' + e.message.slice(0, 30)); }

  // ── 2. Vreden ──
  try {
    const r = await axios.get('https://api.vreden.my.id/api/igdl', {
      params: { url }, headers: { 'User-Agent': UA }, timeout: 15000,
    });
    const d = r.data;
    const items = d?.result?.response || d?.data || [];
    if (items.length > 0) return buildResult(d?.result?.caption || '', items);
    throw new Error('empty');
  } catch (e) { errors.push('vreden:' + e.message.slice(0, 30)); }

  // ── 3. PrinceTechn ──
  try {
    const r = await axios.get('https://api.princetechn.com/api/download/instagram', {
      params: { apikey: 'prince', url }, headers: { 'User-Agent': UA }, timeout: 15000,
    });
    const d = r.data;
    if (d?.status === 200 && d.result) {
      const res = d.result;
      const mediaUrl = res.video_url || res.image_url || res.url;
      if (mediaUrl) return buildResult(res.caption || '', [{ type: res.video_url ? 'video' : detectType(mediaUrl), url: mediaUrl }]);
    }
    throw new Error('no media');
  } catch (e) { errors.push('prince:' + e.message.slice(0, 30)); }

  // ── 4. GiftedTech ──
  try {
    const r = await axios.get('https://api.giftedtech.co.ke/api/download/igdl', {
      params: { apikey: 'gifted', url }, headers: { 'User-Agent': UA }, timeout: 15000,
    });
    const d = r.data;
    if (d?.result?.length > 0) return buildResult('', d.result);
    throw new Error('empty/limit');
  } catch (e) { errors.push('gifted:' + e.message.slice(0, 30)); }

  // ── 5. Agatz ──
  try {
    const r = await axios.get('https://api.agatz.xyz/api/igdl', {
      params: { url }, headers: { 'User-Agent': UA }, timeout: 15000,
    });
    const d = r.data;
    if (d?.status === 200 && d?.data?.length > 0) return buildResult('', d.data);
    throw new Error('empty');
  } catch (e) { errors.push('agatz:' + e.message.slice(0, 30)); }

  // ── 6. Dreaded ──
  try {
    const r = await axios.get('https://api.dreaded.site/api/igdl', {
      params: { url }, headers: { 'User-Agent': UA }, timeout: 15000,
    });
    const d = r.data;
    if (d?.status === 200 && d?.data?.length > 0) return buildResult('', d.data);
    throw new Error('empty');
  } catch (e) { errors.push('dreaded:' + e.message.slice(0, 30)); }

  // ── 7. BotCahx ──
  try {
    const r = await axios.get('https://api.botcahx.eu.org/api/download-url/instagram', {
      params: { url }, headers: { 'User-Agent': UA }, timeout: 15000,
    });
    const d = r.data;
    const items = d?.result || d?.data || [];
    const urls = Array.isArray(items) ? items : (typeof items === 'string' ? [items] : []);
    if (urls.length > 0) return buildResult('', urls.map(u => ({ url: u?.url || u, type: detectType(u?.url || u) })));
    throw new Error('empty');
  } catch (e) { errors.push('botcahx:' + e.message.slice(0, 30)); }

  // ── 8. Nekorinn ──
  try {
    const r = await axios.get('https://api.nekorinn.my.id/downloader/ig', {
      params: { url }, headers: { 'User-Agent': UA }, timeout: 15000,
    });
    const d = r.data;
    const items = d?.result || d?.data || [];
    if (Array.isArray(items) && items.length > 0) return buildResult('', items);
    throw new Error('empty');
  } catch (e) { errors.push('nekorinn:' + e.message.slice(0, 30)); }

  // ── 9. YanzBotz ──
  try {
    const r = await axios.get('https://api.yanzbotz.live/api/downloader/ig', {
      params: { url }, headers: { 'User-Agent': UA }, timeout: 15000,
    });
    const d = r.data;
    const items = d?.result || d?.data || [];
    if (Array.isArray(items) && items.length > 0) return buildResult('', items);
    throw new Error('empty');
  } catch (e) { errors.push('yanzbotz:' + e.message.slice(0, 30)); }

  // ── 10. Cenominali ──
  try {
    const r = await axios.get('https://api.cenominali.my.id/api/downloader/igdl', {
      params: { url }, headers: { 'User-Agent': UA }, timeout: 15000,
    });
    const d = r.data;
    const items = d?.result || d?.data || [];
    if (Array.isArray(items) && items.length > 0) return buildResult('', items);
    throw new Error('empty');
  } catch (e) { errors.push('cenominali:' + e.message.slice(0, 30)); }

  // ── 11. Naufals ──
  try {
    const r = await axios.get('https://api.naufals.site/ig', {
      params: { url }, headers: { 'User-Agent': UA }, timeout: 15000,
    });
    const d = r.data;
    const items = d?.result || d?.data || [];
    if (Array.isArray(items) && items.length > 0) return buildResult('', items);
    throw new Error('empty');
  } catch (e) { errors.push('naufals:' + e.message.slice(0, 30)); }

  // ── 12. Webjsa ──
  try {
    const r = await axios.get('https://api.webjsa.my.id/igdl', {
      params: { url }, headers: { 'User-Agent': UA }, timeout: 15000,
    });
    const d = r.data;
    const items = d?.result || d?.data || [];
    if (Array.isArray(items) && items.length > 0) return buildResult('', items);
    throw new Error('empty');
  } catch (e) { errors.push('webjsa:' + e.message.slice(0, 30)); }

  // ── 13. SnapSave ajaxSearch (HTML parse) ──
  try {
    const enc = encodeURIComponent(url);
    const r = await axios.post('https://v3.snapsave.app/api/ajaxSearch',
      `q=${enc}&t=media&lang=en`,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': 'https://snapsave.app/',
          'Origin': 'https://snapsave.app',
          'User-Agent': UA,
          'X-Requested-With': 'XMLHttpRequest',
        },
        timeout: 15000,
      }
    );
    const d = r.data;
    if (d?.data) {
      const cheerio = require('cheerio');
      const $ = cheerio.load(d.data);
      const medias = [];
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href');
        if (href && href.startsWith('http') && (href.includes('.mp4') || href.includes('/v/') || href.includes('cdninstagram') || href.includes('fbcdn'))) {
          medias.push({ type: detectType(href), url: href });
        }
      });
      if (medias.length > 0) return { caption: '', medias };
    }
    throw new Error('no media in html');
  } catch (e) { errors.push('snapsave:' + e.message.slice(0, 30)); }

  // ── 14. SaveIG ajaxSearch ──
  try {
    const enc = encodeURIComponent(url);
    const r = await axios.post('https://v3.saveig.app/api/ajaxSearch',
      `q=${enc}&t=media&lang=en`,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': 'https://saveig.app/',
          'User-Agent': UA,
          'X-Requested-With': 'XMLHttpRequest',
        },
        timeout: 15000,
      }
    );
    const d = r.data;
    if (d?.data) {
      const cheerio = require('cheerio');
      const $ = cheerio.load(d.data);
      const medias = [];
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href');
        if (href && href.startsWith('http') && (href.includes('.mp4') || href.includes('cdninstagram') || href.includes('fbcdn'))) {
          medias.push({ type: detectType(href), url: href });
        }
      });
      if (medias.length > 0) return { caption: '', medias };
    }
    throw new Error('no media in html');
  } catch (e) { errors.push('saveig:' + e.message.slice(0, 30)); }

  // ── 15. Lolhuman ──
  try {
    const r = await axios.get('https://api.lolhuman.xyz/api/igdl', {
      params: { apikey: 'lolhuman_free', url }, headers: { 'User-Agent': UA }, timeout: 15000,
    });
    const d = r.data;
    const items = d?.result || d?.data || [];
    if (Array.isArray(items) && items.length > 0) return buildResult('', items);
    throw new Error('empty');
  } catch (e) { errors.push('lolhuman:' + e.message.slice(0, 30)); }

  throw new Error('All Instagram providers failed. Try again later.\n' + errors.slice(0, 5).join(' | '));
}

module.exports = { igDownload };
