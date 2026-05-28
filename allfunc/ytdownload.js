const axios = require("axios")

const PRINCE_API = "https://api.princetechn.com/api/download"
const PRINCE_KEY = "prince"

let ytdl = null
try { ytdl = require('@distube/ytdl-core') } catch (e) {
  try { ytdl = require('ytdl-core') } catch (e2) {}
}

// In-memory result cache (10 min TTL) — avoids repeat API calls
const _cache = new Map()
const CACHE_TTL = 10 * 60 * 1000

function getCached(key) {
  const entry = _cache.get(key)
  if (!entry) return null
  if (Date.now() - entry.ts > CACHE_TTL) { _cache.delete(key); return null }
  return entry.data
}

function setCache(key, data) {
  if (_cache.size > 100) {
    const oldest = [..._cache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0]
    if (oldest) _cache.delete(oldest[0])
  }
  _cache.set(key, { data, ts: Date.now() })
}

function extractVideoId(url) {
  let videoId = ""
  if (url.includes("youtu.be/")) {
    videoId = url.split("youtu.be/")[1].split("?")[0]
  } else if (url.includes("watch?v=")) {
    videoId = url.split("watch?v=")[1].split("&")[0]
  } else if (url.includes("/shorts/")) {
    videoId = url.split("/shorts/")[1].split("?")[0]
  }
  return videoId.trim()
}

async function viaPrinceVideo(videoUrl) {
  const qualities = ["720p", "480p", "360p", "1080p"]
  for (const q of qualities) {
    try {
      const res = await axios.get(`${PRINCE_API}/ytvideo`, {
        params: { apikey: PRINCE_KEY, quality: q, url: videoUrl },
        headers: { "User-Agent": "Mozilla/5.0" },
        timeout: 30000
      })
      const d = res.data
      const r = d?.result
      if (d?.success && r?.available_qualities?.length && !r?.download_url) continue
      if (!d?.success || !r?.download_url || r?.error) continue
      const videoId = extractVideoId(videoUrl)
      const qualityLabel = (r.quality || q).replace("p", "P")
      return {
        code: 200,
        timestamp: Date.now(),
        data: {
          id: videoId,
          title: r.title || "YouTube Video",
          thumbnail: r.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          duration: null,
          duration_formatted: r.duration || null,
          video_formats: (r.available_qualities || [q]).map(aq => ({
            resource_id: "prince_" + aq,
            quality: aq.replace("p", "P"),
            format: "MP4",
            size: null,
            size_mb: "? MB",
            download_url: aq === (r.quality || q) ? r.download_url : null
          })).filter(f => f.download_url),
          audio_formats: [],
          best_video: { quality: qualityLabel, format: "MP4", size: "? MB", url: r.download_url },
          best_audio: null
        }
      }
    } catch (e) { continue }
  }
  throw new Error("prince_video: all qualities failed")
}

async function viaPrinceAudio(videoUrl) {
  const res = await axios.get(`${PRINCE_API}/ytmp3`, {
    params: { apikey: PRINCE_KEY, url: videoUrl },
    headers: { "User-Agent": "Mozilla/5.0" },
    timeout: 30000
  })
  const d = res.data
  const downloadUrl = d?.result?.download_url
  if (!d?.success || !downloadUrl || d?.result?.error) {
    throw new Error("prince_audio: " + (d?.result?.error || "no download url"))
  }
  const r = d.result
  const videoId = extractVideoId(videoUrl)
  return {
    code: 200,
    timestamp: Date.now(),
    data: {
      id: videoId,
      title: r.title || "YouTube Audio",
      thumbnail: r.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      duration: null,
      duration_formatted: r.duration || null,
      video_formats: [],
      audio_formats: [{
        resource_id: "prince_audio",
        quality: r.quality || "320KBPS",
        format: "MP3",
        size: null,
        size_mb: "? MB",
        download_url: downloadUrl
      }],
      best_video: null,
      best_audio: { quality: r.quality || "320KBPS", format: "MP3", size: "? MB", url: downloadUrl }
    }
  }
}

async function viaYtdlCore(videoUrl) {
  if (!ytdl) throw new Error("ytdl-core: package not found")
  const info = await ytdl.getInfo(videoUrl, {
    requestOptions: {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    }
  })
  const videoId = info.videoDetails.videoId
  const title = info.videoDetails.title
  const duration = parseInt(info.videoDetails.lengthSeconds) || null
  const thumbnail = info.videoDetails.thumbnails?.slice(-1)[0]?.url ||
    `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
  const videoFormats = ytdl.filterFormats(info.formats, 'videoandaudio')
    .map(f => ({
      resource_id: String(f.itag),
      quality: f.qualityLabel || f.quality || "360p",
      format: (f.container || "mp4").toUpperCase(),
      size: f.contentLength ? parseInt(f.contentLength) : null,
      size_mb: f.contentLength ? (parseInt(f.contentLength) / 1024 / 1024).toFixed(2) + " MB" : "? MB",
      download_url: f.url
    }))
    .sort((a, b) => Math.abs(720 - (parseInt(a.quality) || 0)) - Math.abs(720 - (parseInt(b.quality) || 0)))
  const audioFormats = ytdl.filterFormats(info.formats, 'audioonly')
    .map(f => ({
      resource_id: String(f.itag),
      quality: f.audioBitrate ? f.audioBitrate + 'KBPS' : "128KBPS",
      format: (f.container === 'webm' || f.mimeType?.includes('opus')) ? 'WEBM' : 'M4A',
      size: f.contentLength ? parseInt(f.contentLength) : null,
      size_mb: f.contentLength ? (parseInt(f.contentLength) / 1024 / 1024).toFixed(2) + " MB" : "? MB",
      download_url: f.url
    }))
    .sort((a, b) => parseInt(b.quality) - parseInt(a.quality))
  const bestVideo = videoFormats[0] || null
  const bestAudio = audioFormats[0] || null
  if (!bestVideo && !bestAudio) throw new Error("ytdl-core: no formats found")
  return {
    code: 200,
    timestamp: Date.now(),
    data: {
      id: videoId, title, thumbnail, duration,
      duration_formatted: duration ? new Date(duration * 1000).toISOString().slice(11, 19) : null,
      video_formats: videoFormats,
      audio_formats: audioFormats,
      best_video: bestVideo ? { quality: bestVideo.quality, format: bestVideo.format, size: bestVideo.size_mb, url: bestVideo.download_url } : null,
      best_audio: bestAudio ? { quality: bestAudio.quality, format: bestAudio.format, size: bestAudio.size_mb, url: bestAudio.download_url } : null
    }
  }
}

async function ytDownload(videoUrl) {
  if (!videoUrl) throw new Error("URL required")
  const cacheKey = "vid:" + videoUrl
  const cached = getCached(cacheKey)
  if (cached) return cached

  const errors = []
  try {
    const r = await viaPrinceVideo(videoUrl)
    if (r.data?.best_video) { setCache(cacheKey, r); return r }
  } catch (e) { errors.push("prince_video: " + e.message.slice(0, 80)) }

  try {
    const r = await viaYtdlCore(videoUrl)
    if (r.data?.best_video || r.data?.best_audio) { setCache(cacheKey, r); return r }
  } catch (e) { errors.push("ytdl: " + e.message.slice(0, 80)) }

  throw new Error("Sab YouTube providers fail: " + errors.join(" | "))
}

async function ytAudio(videoUrl) {
  if (!videoUrl) throw new Error("URL required")
  const cacheKey = "aud:" + videoUrl
  const cached = getCached(cacheKey)
  if (cached) return cached

  const errors = []
  try {
    const r = await viaPrinceAudio(videoUrl)
    if (r.data?.best_audio) { setCache(cacheKey, r); return r }
  } catch (e) { errors.push("prince_audio: " + e.message.slice(0, 80)) }

  try {
    const r = await viaYtdlCore(videoUrl)
    if (r.data?.best_audio || r.data?.best_video) { setCache(cacheKey, r); return r }
  } catch (e) { errors.push("ytdl: " + e.message.slice(0, 80)) }

  throw new Error("Audio download fail: " + errors.join(" | "))
}

module.exports = { ytDownload, ytAudio, extractVideoId }
