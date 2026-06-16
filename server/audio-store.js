'use strict';

const zlib = require('zlib');
const { getSiteSetting, setSiteSetting } = require('./db-service');

const KEYS = {
  data: 'site_audio_data',
  mimetype: 'site_audio_mimetype',
  original: 'site_audio_original',
  compressed: 'site_audio_compressed',
};

async function getAudioMeta() {
  try {
    // Only fetch the small `original` filename — NOT the multi-MB base64 blob.
    // Both fields are always written/cleared together in saveAudio/deleteAudio,
    // so `original` being non-empty reliably means audio data exists.
    const original = await getSiteSetting(KEYS.original);
    return {
      filename: original ? 'db' : '',
      original: original || '',
    };
  } catch {
    return { filename: '', original: '' };
  }
}

async function loadAudioBuffer() {
  const [b64, compressed] = await Promise.all([
    getSiteSetting(KEYS.data),
    getSiteSetting(KEYS.compressed),
  ]);
  if (!b64) return null;
  const raw = Buffer.from(b64, 'base64');
  if (compressed === 'true') {
    return await new Promise((resolve, reject) => {
      zlib.gunzip(raw, (err, buf) => (err ? reject(err) : resolve(buf)));
    });
  }
  return raw;
}

async function getAudioMimetype() {
  return (await getSiteSetting(KEYS.mimetype)) || 'audio/mpeg';
}

async function saveAudio(buffer, mimetype, originalname) {
  const compressed = await new Promise((resolve, reject) => {
    zlib.gzip(buffer, { level: 6 }, (err, buf) => (err ? reject(err) : resolve(buf)));
  });
  const base64 = compressed.toString('base64');
  await Promise.all([
    setSiteSetting(KEYS.data, base64),
    setSiteSetting(KEYS.mimetype, mimetype || 'audio/mpeg'),
    setSiteSetting(KEYS.original, originalname || 'audio'),
    setSiteSetting(KEYS.compressed, 'true'),
  ]);
}

async function deleteAudio() {
  await Promise.all([
    setSiteSetting(KEYS.data, ''),
    setSiteSetting(KEYS.mimetype, ''),
    setSiteSetting(KEYS.original, ''),
    setSiteSetting(KEYS.compressed, ''),
  ]);
}

function streamAudioBuffer(res, buffer, contentType, rangeHeader) {
  const total = buffer.length;
  const range = rangeHeader;
  if (range) {
    const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
    const start = parseInt(startStr, 10);
    const end = endStr ? parseInt(endStr, 10) : total - 1;
    res.status(206);
    res.set({
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      'Content-Type': contentType,
      'Cache-Control': 'no-cache',
    });
    res.end(buffer.subarray(start, end + 1));
    return;
  }
  res.set({
    'Content-Type': contentType,
    'Content-Length': total,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-cache',
  });
  res.end(buffer);
}

module.exports = {
  getAudioMeta,
  loadAudioBuffer,
  getAudioMimetype,
  saveAudio,
  deleteAudio,
  streamAudioBuffer,
};
