const axios = require("axios")

// Primary: @distube/ytdl-core (direct YouTube access, no 3rd party API needed)
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
   Provider 1: @distube/ytdl-core  (direct, most reliable)
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
    .sort((a, b) => {
      const diff = (q) => Math.abs(720 - (parseInt(q) || 0))
      return diff(a.quality) - diff(b.quality)
    })

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
   Provider 2: Invidious open-source instances
   ───────────────────────────────────────────────── */
async function viaInvidious(videoUrl) {
  const videoId = extractVideoId(videoUrl)
  if (!videoId) throw new Error("invidious: invalid YouTube URL")

  const instances = [
    "https://inv.nadeko.net",
    "https://invidious.privacydev.net",
    "https://yt.artemislena.eu",
    "https://invidious.fdn.fr",
    "https://yewtu.be",
    "https://invidious.perennialte.ch",
    "https://iv.datura.network",
    "https://invidious.private.coffee",
    "https://invidious.nerdvpn.de"
  ]

  for (const instance of instances) {
    try {
      const res = await axios.get(
        `${instance}/api/v1/videos/${videoId}?fields=title,videoThumbnails,lengthSeconds,formatStreams,adaptiveFormats`,
        {
          headers: {
            "User-Agent": "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36",
            "Accept": "application/json"
          },
          timeout: 15000
        }
      )

      const data = res.data
      if (!data || data.error) continue

      const formatStreams = (data.formatStreams || [])
        .filter(f => f.container === "mp4" && f.url)
        .map(f => ({
          resource_id: String(f.itag || ""),
          quality: f.qualityLabel || "360p",
          format: "MP4",
          size: null,
          size_mb: "? MB",
          download_url: f.url
        }))

      const adaptiveAudio = (data.adaptiveFormats || [])
        .filter(f => f.type?.startsWith("audio/") && f.url)
        .map(f => ({
          resource_id: String(f.itag || ""),
          quality: f.bitrate ? Math.round(f.bitrate / 1000) + "KBPS" : "128KBPS",
          format: f.container?.toUpperCase() === 'WEBM' ? 'WEBM' : 'M4A',
          size: null,
          size_mb: "? MB",
          download_url: f.url
        }))
        .sort((a, b) => parseInt(b.quality) - parseInt(a.quality))

      if (!formatStreams.length && !adaptiveAudio.length) continue

      formatStreams.sort((a, b) => parseInt(b.quality) - parseInt(a.quality))

      const thumb = data.videoThumbnails?.find(t => t.quality === "maxres")?.url ||
        data.videoThumbnails?.find(t => t.quality === "high")?.url ||
        data.videoThumbnails?.[0]?.url ||
        `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`

      const bestVideo = formatStreams.find(v => parseInt(v.quality) <= 720) || formatStreams[0] || null
      const bestAudio = adaptiveAudio[0] || null

      return {
        code: 200,
        timestamp: Date.now(),
        data: {
          id: videoId,
          title: data.title || null,
          thumbnail: thumb,
          duration: data.lengthSeconds ? parseInt(data.lengthSeconds) : null,
          duration_formatted: data.lengthSeconds
            ? new Date(parseInt(data.lengthSeconds) * 1000).toISOString().slice(11, 19)
            : null,
          video_formats: formatStreams,
          audio_formats: adaptiveAudio,
          best_video: bestVideo ? {
            quality: bestVideo.quality,
            format: "MP4",
            size: "? MB",
            url: bestVideo.download_url
          } : null,
          best_audio: bestAudio ? {
            quality: bestAudio.quality,
            format: bestAudio.format,
            size: "? MB",
            url: bestAudio.download_url
          } : null
        }
      }
    } catch (e) {
      continue
    }
  }

  throw new Error("All Invidious instances failed")
}

/* ─────────────────────────────────────────────────
   Provider 3: Cobalt v10 API
   ───────────────────────────────────────────────── */
async function viaCobalt(videoUrl) {
  const instances = [
    "https://cobalt.api.void.cat",
    "https://cobalt.ggtyler.dev",
    "https://cobalt.drgns.space",
    "https://cobalt.privacyredirect.com"
  ]

  for (const base of instances) {
    try {
      const res = await axios.post(
        `${base}/`,
        { url: videoUrl, videoQuality: "720", filenameStyle: "basic" },
        {
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
          },
          timeout: 15000
        }
      )
      const d = res.data
      if (!d || d.status === "error" || !d.url) continue

      const videoId = extractVideoId(videoUrl)
      return {
        code: 200,
        timestamp: Date.now(),
        data: {
          id: videoId,
          title: d.filename?.replace(/\.[^.]+$/, "") || "YouTube Video",
          thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          duration: null,
          duration_formatted: null,
          video_formats: [{
            resource_id: "cobalt",
            quality: "720P",
            format: "MP4",
            size: null,
            size_mb: "? MB",
            download_url: d.url
          }],
          audio_formats: [],
          best_video: { quality: "720P", format: "MP4", size: "? MB", url: d.url },
          best_audio: null
        }
      }
    } catch (e) {
      continue
    }
  }
  throw new Error("cobalt: all instances failed")
}

/* ─────────────────────────────────────────────────
   Provider 4: DavidCyril API (audio search fallback)
   ───────────────────────────────────────────────── */
async function viaDavidCyril(query) {
  const endpoints = [
    `https://apis.davidcyriltech.my.id/play?query=${encodeURIComponent(query)}`,
    `https://apis.davidcyril.name.ng/play?query=${encodeURIComponent(query)}&apikey=`
  ]

  for (const url of endpoints) {
    try {
      const res = await axios.get(url, {
        headers: { "User-Agent": "Mozilla/5.0" },
        timeout: 20000
      })
      const data = res.data
      const downloadUrl = data?.result?.download_url || data?.download_url || data?.url
      if (!downloadUrl) continue

      const r = data.result || data
      return {
        code: 200,
        timestamp: Date.now(),
        data: {
          id: null,
          title: r.title || "Unknown",
          thumbnail: r.thumbnail || null,
          duration: null,
          duration_formatted: r.duration || null,
          video_formats: [],
          audio_formats: [{
            resource_id: "dc_audio",
            quality: "128KBPS",
            format: "MP3",
            size: null,
            size_mb: "? MB",
            download_url: downloadUrl
          }],
          best_video: null,
          best_audio: {
            quality: "128KBPS",
            format: "MP3",
            size: "? MB",
            url: downloadUrl
          }
        }
      }
    } catch (e) {
      continue
    }
  }
  throw new Error("davidcyril: no audio download url")
}

/* ─────────────────────────────────────────────────
   MAIN — try providers in order, fallback chain
   ───────────────────────────────────────────────── */
async function ytDownload(videoUrl) {
  if (!videoUrl) throw new Error("URL required")

  const errors = []

  // Provider 1: @distube/ytdl-core (best — direct, no API limits)
  try {
    const r = await viaYtdlCore(videoUrl)
    if (r.data?.best_video || r.data?.best_audio) return r
  } catch (e) {
    errors.push("ytdl: " + e.message.slice(0, 80))
  }

  // Provider 2: Invidious
  try {
    const r = await viaInvidious(videoUrl)
    if (r.data?.best_video || r.data?.best_audio) return r
  } catch (e) {
    errors.push("invidious: " + e.message.slice(0, 80))
  }

  // Provider 3: Cobalt
  try {
    const r = await viaCobalt(videoUrl)
    if (r.data?.best_video) return r
  } catch (e) {
    errors.push("cobalt: " + e.message.slice(0, 60))
  }

  // Provider 4: DavidCyril (audio search)
  try {
    return await viaDavidCyril(videoUrl)
  } catch (e) {
    errors.push("davidcyril: " + e.message.slice(0, 60))
  }

  throw new Error("Sab YouTube providers fail: " + errors.join(" | "))
}

module.exports = { ytDownload, extractVideoId }
