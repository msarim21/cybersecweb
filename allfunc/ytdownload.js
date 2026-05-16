const axios = require("axios")

const PRINCE_API = "https://api.princetechn.com/api/download"
const PRINCE_KEY = "prince"

// Fallback: @distube/ytdl-core
let ytdl = null
try { ytdl = require('@distube/ytdl-core') } catch (e) {
  try { ytdl = require('ytdl-core') } catch (e2) {}
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

/* ─────────────────────────────────────────────────
   Provider 1: Prince Tech API — Audio (ytmp3)
   Works reliably for audio/play commands
   ───────────────────────────────────────────────── */
async function viaPrinceAudio(videoUrl) {
  const res = await axios.get(`${PRINCE_API}/ytmp3`, {
    params: { apikey: PRINCE_KEY, url: videoUrl },
    headers: { "User-Agent": "Mozilla/5.0" },
    timeout: 30000
  })

  const d = res.data
  const downloadUrl = d?.result?.download_url
  if (!d?.success || !downloadUrl || d?.result?.error) {
    throw new Error("prince: ytmp3 failed — " + (d?.result?.error || "no download url"))
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
      best_audio: {
        quality: r.quality || "320KBPS",
        format: "MP3",
        size: "? MB",
        url: downloadUrl
      }
    }
  }
}

/* ─────────────────────────────────────────────────
   Provider 2: @distube/ytdl-core — Video + Audio
   Primary for video downloads
   ───────────────────────────────────────────────── */
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

  if (!bestVideo && !bestAudio) throw new Error("ytdl-core: no downloadable formats found")

  return {
    code: 200,
    timestamp: Date.now(),
    data: {
      id: videoId,
      title,
      thumbnail,
      duration,
      duration_formatted: duration ? new Date(duration * 1000).toISOString().slice(11, 19) : null,
      video_formats: videoFormats,
      audio_formats: audioFormats,
      best_video: bestVideo ? {
        quality: bestVideo.quality,
        format: bestVideo.format,
        size: bestVideo.size_mb,
        url: bestVideo.download_url
      } : null,
      best_audio: bestAudio ? {
        quality: bestAudio.quality,
        format: bestAudio.format,
        size: bestAudio.size_mb,
        url: bestAudio.download_url
      } : null
    }
  }
}

/* ─────────────────────────────────────────────────
   MAIN ytDownload
   Used by: .video, .mp4, .ytdl, .ytdown commands
   Flow: ytdl-core (video+audio) → Prince audio fallback
   ───────────────────────────────────────────────── */
async function ytDownload(videoUrl) {
  if (!videoUrl) throw new Error("URL required")

  const errors = []

  // Primary: ytdl-core (best for video)
  try {
    const r = await viaYtdlCore(videoUrl)
    if (r.data?.best_video || r.data?.best_audio) return r
  } catch (e) {
    errors.push("ytdl: " + e.message.slice(0, 80))
  }

  // Fallback: Prince API audio (at least get audio if video fails)
  try {
    const r = await viaPrinceAudio(videoUrl)
    if (r.data?.best_audio) return r
  } catch (e) {
    errors.push("prince_audio: " + e.message.slice(0, 80))
  }

  throw new Error("Sab YouTube providers fail: " + errors.join(" | "))
}

/* ─────────────────────────────────────────────────
   ytAudio — audio-only download
   Used by: .play, .ytmp3 commands
   Flow: Prince ytmp3 (best quality 320kbps) → ytdl-core fallback
   ───────────────────────────────────────────────── */
async function ytAudio(videoUrl) {
  if (!videoUrl) throw new Error("URL required")

  const errors = []

  // Primary: Prince API ytmp3 (320kbps, fast)
  try {
    const r = await viaPrinceAudio(videoUrl)
    if (r.data?.best_audio) return r
  } catch (e) {
    errors.push("prince: " + e.message.slice(0, 80))
  }

  // Fallback: ytdl-core
  try {
    const r = await viaYtdlCore(videoUrl)
    if (r.data?.best_audio || r.data?.best_video) return r
  } catch (e) {
    errors.push("ytdl: " + e.message.slice(0, 80))
  }

  throw new Error("Audio download fail: " + errors.join(" | "))
}

module.exports = { ytDownload, ytAudio, extractVideoId }
