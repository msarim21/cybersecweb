const axios = require("axios")
const ytdl = require("@distube/ytdl-core")

function extractVideoId(url) {
  let videoId = ""
  if (url.includes("youtu.be/")) {
    videoId = url.split("youtu.be/")[1].split("?")[0]
  } else if (url.includes("watch?v=")) {
    videoId = url.split("watch?v=")[1].split("&")[0]
  } else if (url.includes("/shorts/")) {
    videoId = url.split("/shorts/")[1].split("?")[0]
  }
  return videoId
}

/* ─────────────────────────────────────────────────
   Provider 1: vidssave API (primary)
   ───────────────────────────────────────────────── */
async function viaVidssave(videoUrl) {
  const headers = {
    "accept": "*/*",
    "accept-language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
    "content-type": "application/x-www-form-urlencoded",
    "origin": "https://vidssave.com",
    "referer": "https://vidssave.com/",
    "user-agent": "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36"
  }

  const body = new URLSearchParams()
  body.append("auth", "20250901majwlqo")
  body.append("domain", "api-ak.vidssave.com")
  body.append("origin", "cache")
  body.append("link", videoUrl)

  const res = await axios.post(
    "https://api.vidssave.com/api/contentsite_api/media/parse",
    body.toString(),
    { headers, timeout: 20000 }
  )

  const data = res.data
  if (!data.data || data.status !== 1) throw new Error("vidssave: bad response")

  const info = data.data
  const resources = info.resources || []

  const videoFormats = resources
    .filter(r => r.type === "video")
    .map(r => ({
      resource_id: r.resource_id,
      quality: r.quality,
      format: r.format,
      size: r.size,
      size_mb: (r.size / 1024 / 1024).toFixed(2) + " MB",
      download_url: r.download_url
    }))
    .sort((a, b) => {
      const order = ["2160P", "1440P", "1080P", "720P", "480P", "240P", "144P"]
      return order.indexOf(a.quality) - order.indexOf(b.quality)
    })

  const audioFormats = resources
    .filter(r => r.type === "audio")
    .map(r => ({
      resource_id: r.resource_id,
      quality: r.quality,
      format: r.format,
      size: r.size,
      size_mb: (r.size / 1024 / 1024).toFixed(2) + " MB",
      download_url: r.download_url
    }))

  const bestVideo = videoFormats.find(v => v.quality === "720P") || videoFormats[0] || null
  const bestAudio = audioFormats.find(a => a.quality === "256KBPS") || audioFormats[0] || null

  return {
    code: 200,
    timestamp: Date.now(),
    data: {
      id: info.id || null,
      title: info.title || null,
      thumbnail: info.thumbnail || null,
      duration: info.duration || null,
      duration_formatted: info.duration ? new Date(info.duration * 1000).toISOString().slice(11, 19) : null,
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
   Provider 2: @distube/ytdl-core  (same approach
   as pytubefix — direct googlevideo stream URLs,
   no third-party API needed)
   ───────────────────────────────────────────────── */
async function viaYtdlCore(videoUrl) {
  const info = await ytdl.getInfo(videoUrl, { requestOptions: { timeout: 25000 } })
  const details = info.videoDetails

  // Progressive = video+audio in one stream (like pytubefix progressive=True, mp4)
  const progressive = info.formats
    .filter(f => f.hasVideo && f.hasAudio && f.container === "mp4" && f.url)
    .sort((a, b) => (parseInt(b.qualityLabel) || 0) - (parseInt(a.qualityLabel) || 0))

  const videoOnly = info.formats
    .filter(f => f.hasVideo && !f.hasAudio && f.container === "mp4" && f.url)
    .sort((a, b) => (parseInt(b.qualityLabel) || 0) - (parseInt(a.qualityLabel) || 0))

  const audioOnly = info.formats
    .filter(f => !f.hasVideo && f.hasAudio && f.url)
    .sort((a, b) => (parseInt(b.audioBitrate) || 0) - (parseInt(a.audioBitrate) || 0))

  const allVideoFormats = [...progressive, ...videoOnly].map(f => ({
    quality: f.qualityLabel || "unknown",
    format: f.container || "mp4",
    size_mb: f.contentLength ? (parseInt(f.contentLength) / 1024 / 1024).toFixed(2) + " MB" : "unknown",
    download_url: f.url,
    has_audio: f.hasAudio
  }))

  const allAudioFormats = audioOnly.map(f => ({
    quality: (f.audioBitrate || "?") + "kbps",
    format: f.container || "webm",
    size_mb: f.contentLength ? (parseInt(f.contentLength) / 1024 / 1024).toFixed(2) + " MB" : "unknown",
    download_url: f.url
  }))

  const bestVideo = progressive[0] || videoOnly[0] || null
  const bestAudio = audioOnly[0] || null

  if (!bestVideo) throw new Error("ytdl-core: no usable video stream found")

  const thumb = details.thumbnails?.sort((a, b) => (b.width || 0) - (a.width || 0))[0]?.url || null
  const durationSec = parseInt(details.lengthSeconds) || 0

  return {
    code: 200,
    timestamp: Date.now(),
    data: {
      id: details.videoId || null,
      title: details.title || null,
      thumbnail: thumb,
      duration: durationSec,
      duration_formatted: durationSec ? new Date(durationSec * 1000).toISOString().slice(11, 19) : null,
      video_formats: allVideoFormats,
      audio_formats: allAudioFormats,
      best_video: bestVideo ? {
        quality: bestVideo.qualityLabel || "360p",
        format: bestVideo.container || "mp4",
        size: bestVideo.contentLength ? (parseInt(bestVideo.contentLength) / 1024 / 1024).toFixed(2) + " MB" : "unknown",
        url: bestVideo.url
      } : null,
      best_audio: bestAudio ? {
        quality: (bestAudio.audioBitrate || "?") + "kbps",
        format: bestAudio.container || "webm",
        size: bestAudio.contentLength ? (parseInt(bestAudio.contentLength) / 1024 / 1024).toFixed(2) + " MB" : "unknown",
        url: bestAudio.url
      } : null
    }
  }
}

/* ─────────────────────────────────────────────────
   MAIN — try providers in order
   ───────────────────────────────────────────────── */
async function ytDownload(videoUrl) {
  if (!videoUrl) throw new Error("URL tidak boleh kosong")

  const errors = []

  try {
    return await viaVidssave(videoUrl)
  } catch (e) {
    errors.push("vidssave: " + e.message.slice(0, 60))
  }

  try {
    return await viaYtdlCore(videoUrl)
  } catch (e) {
    errors.push("ytdl-core: " + e.message.slice(0, 60))
  }

  throw new Error("All YouTube providers failed: " + errors.join(" | "))
}

module.exports = { ytDownload, extractVideoId }
