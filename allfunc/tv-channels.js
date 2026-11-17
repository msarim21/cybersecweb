'use strict';
// Pakistan live TV list. PrinceTech API is primary; iptv-org public
// playlist is the fallback (PrinceTech went down Nov 2026).
const axios = require('axios');
let _cache = null, _cacheAt = 0;

function parseM3u(txt) {
  const out = [], lines = String(txt).split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.startsWith('#EXTINF')) continue;
    let url = '';
    for (let j = i + 1; j < lines.length; j++) { const u = lines[j].trim(); if (!u) continue; if (u.startsWith('#')) continue; url = u; i = j; break; }
    if (!/^https?:\/\//.test(url)) continue;
    const name = (l.split(',').slice(1).join(',') || '').replace(/\s*\(\d+p\)/g, '').replace(/\s*\[.*?\]/g, '').trim();
    const logo = (l.match(/tvg-logo="([^"]*)"/) || [])[1] || '';
    let cat = ((l.match(/group-title="([^"]*)"/) || [])[1] || 'Other').split(';')[0] || 'Other';
    if (cat === 'Undefined') cat = 'Other';
    if (cat === 'Religious' || cat === 'Religion') cat = 'Religious';
    if (name) out.push({ name, logo, category: cat, url });
  }
  const seen = new Set();
  return out.filter(c => { const k = c.name.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
}

async function getPkChannels() {
  if (_cache && Date.now() - _cacheAt < 6 * 3600 * 1000) return _cache;
  let list = null;
  try {
    const r = await axios.get('https://api.princetechn.com/api/newsstreaming/country/pk?apikey=prince', { timeout: 8000 });
    if (r.data?.result?.channels?.length) list = r.data.result.channels;
  } catch (_) {}
  if (!list) {
    const r = await axios.get('https://iptv-org.github.io/iptv/countries/pk.m3u', { timeout: 15000, responseType: 'text' });
    list = parseM3u(r.data);
  }
  if (!list || !list.length) throw new Error('No channels found');
  _cache = list; _cacheAt = Date.now();
  return list;
}

module.exports = { getPkChannels, parseM3u };
