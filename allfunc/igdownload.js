'use strict';
const axios = require('axios');

async function igDownload(url) {
  const errors = [];

  // Provider 1: Ryzen API
  try {
    const res = await axios.get(`https://api.ryzendesu.vip/api/downloader/igdl`, {
      params: { url },
      timeout: 15000,
    });
    const d = res.data;
    if (d && d.data && Array.isArray(d.data) && d.data.length > 0) {
      const medias = d.data.map(item => ({
        type: item.type === 'video' || (item.url && item.url.includes('.mp4')) ? 'video' : 'image',
        url: item.url,
      }));
      return { caption: '', medias };
    }
    throw new Error('ryzen: no media');
  } catch (e) {
    errors.push('ryzen: ' + e.message);
  }

  // Provider 2: Vreden API
  try {
    const res = await axios.get(`https://api.vreden.my.id/api/igdl`, {
      params: { url },
      timeout: 15000,
    });
    const d = res.data;
    const items = d?.result?.response || d?.data || [];
    if (Array.isArray(items) && items.length > 0) {
      const medias = items.map(item => ({
        type: item.type === 'video' || (item.url && item.url.includes('.mp4')) ? 'video' : 'image',
        url: item.url,
      }));
      return { caption: d?.result?.caption || '', medias };
    }
    throw new Error('vreden: no media');
  } catch (e) {
    errors.push('vreden: ' + e.message);
  }

  // Provider 3: SnapSave (saveig style)
  try {
    const res = await axios.get(`https://api.princetechn.com/api/download/instagram`, {
      params: { apikey: 'prince', url },
      timeout: 15000,
    });
    const d = res.data;
    if (d && d.status === 200 && d.result) {
      const r = d.result;
      const mediaUrl = r.video_url || r.image_url || r.url;
      if (mediaUrl) {
        const isVideo = !!(r.video_url || mediaUrl.includes('.mp4'));
        return {
          caption: r.caption || r.title || '',
          medias: [{ type: isVideo ? 'video' : 'image', url: mediaUrl }],
        };
      }
    }
    throw new Error('princetechn: no media');
  } catch (e) {
    errors.push('princetechn: ' + e.message);
  }

  // Provider 4: Gifted Tech
  try {
    const res = await axios.get(`https://api.giftedtech.co.ke/api/download/igdl`, {
      params: { apikey: 'gifted', url },
      timeout: 15000,
    });
    const d = res.data;
    const items = d?.result || [];
    if (Array.isArray(items) && items.length > 0) {
      const medias = items.map(item => ({
        type: item.type === 'video' || (item.url && item.url.includes('.mp4')) ? 'video' : 'image',
        url: item.url,
      }));
      return { caption: '', medias };
    }
    throw new Error('gifted: no media');
  } catch (e) {
    errors.push('gifted: ' + e.message);
  }

  throw new Error('All Instagram providers failed: ' + errors.join(' | '));
}

module.exports = { igDownload };
