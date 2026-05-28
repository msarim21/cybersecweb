'use strict';
const axios = require('axios');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cookie': 'age_confirmed=1',
  'Referer': 'https://www.xnxx.com/',
};

function pick(html, ...patterns) {
  for (const p of patterns) {
    const m = html.match(p);
    if (m && m[1]) return m[1];
  }
  return null;
}

async function xnxxDownload(url) {
  if (!url || !url.includes('xnxx.com')) throw new Error('Invalid XNXX URL');

  const res = await axios.get(url, {
    headers: HEADERS,
    timeout: 25000,
    maxRedirects: 5,
  });

  const html = res.data;

  const title = pick(html,
    /html5player\.setVideoTitle\('([^']+)'\)/,
    /html5player\.setVideoTitle\("([^"]+)"\)/,
    /<title>([^<]+?)\s*-\s*XNXX/
  ) || 'XNXX Video';

  const thumb = pick(html,
    /html5player\.setThumbUrl\('([^']+)'\)/,
    /html5player\.setThumbUrl169\('([^']+)'\)/,
    /html5player\.setThumbUrl\("([^"]+)"\)/
  );

  const low = pick(html,
    /html5player\.setVideoUrlLow\('([^']+)'\)/,
    /html5player\.setVideoUrlLow\("([^"]+)"\)/
  );

  const high = pick(html,
    /html5player\.setVideoUrlHigh\('([^']+)'\)/,
    /html5player\.setVideoUrlHigh\("([^"]+)"\)/
  );

  const hls = pick(html,
    /html5player\.setHlsUrl\('([^']+)'\)/,
    /html5player\.setHlsUrl\("([^"]+)"\)/
  );

  if (!low && !high && !hls) {
    throw new Error('Could not extract video URL from page. The video may be private or removed.');
  }

  return {
    title: title.trim(),
    thumbnail: thumb || null,
    sources: { low: low || null, high: high || null, hls: hls || null },
    best: high || low || hls,
  };
}

async function xnxxSearch(query) {
  const searchUrl = `https://www.xnxx.com/search/${encodeURIComponent(query)}/1`;
  const res = await axios.get(searchUrl, {
    headers: HEADERS,
    timeout: 20000,
    maxRedirects: 5,
  });

  const html = res.data;
  const results = [];
  const regex = /href="(\/video-[^"]+)"[^>]*>.*?<img[^>]+data-src="([^"]+)"[^>]*>.*?<p class="metadata">([^<]*)<\/p>.*?<strong[^>]*>([^<]*)<\/strong>/gis;

  let match;
  while ((match = regex.exec(html)) !== null && results.length < 10) {
    results.push({
      url: 'https://www.xnxx.com' + match[1],
      thumb: match[2],
      duration: match[3].trim(),
      title: match[4].trim(),
    });
  }

  if (results.length === 0) {
    const hrefRe = /href="(\/video-[^"]+)"/g;
    const thumbRe = /data-src="(https:\/\/thumb[^"]+)"/g;
    const titleRe = /<strong[^>]*>([^<]+)<\/strong>/g;
    const hrefs = [], thumbs = [], titles = [];
    let m;
    while ((m = hrefRe.exec(html)) !== null) hrefs.push(m[1]);
    while ((m = thumbRe.exec(html)) !== null) thumbs.push(m[1]);
    while ((m = titleRe.exec(html)) !== null) titles.push(m[1]);
    for (let i = 0; i < Math.min(hrefs.length, 8); i++) {
      results.push({
        url: 'https://www.xnxx.com' + hrefs[i],
        thumb: thumbs[i] || null,
        title: titles[i] || 'Unknown',
        duration: null,
      });
    }
  }

  return results;
}

module.exports = { xnxxDownload, xnxxSearch };
