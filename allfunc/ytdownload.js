const axios = require("axios")

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
   Provider 1: VidsSave API (primary — cached popular videos)
   ───────────────────────────────────────────────── */
async function viaVidssave(videoUrl) {
  const body = new URLSearchParams()
  body.append("auth", "20250901majwlqo")
  body.append("domain", "api-ak.vidssave.com")
  body.append("origin", "cache")
  body.append("link", videoUrl)

  const res = await axios.post(
    "https://api.vidssave.com/api/contentsite_api/media/parse",
    body.toString(),
    {
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "origin": "https://vidssave.com",
        "referer": "https://vidssave.com/",
        "user-agent": "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36",
        "accept": "application/json, text/plain, */*",
        "accept-language": "en-US,en;q=0.9"
      },
      timeout: 25000,
      maxRedirects: 5
    }
  )

  const data = res.data
  if (!data) throw new Error("vidssave: empty response")
  if (data.status_code === "not_result" || data.status === "not_result" || String(data.status_code).includes("not_result")) {
    throw new Error("vidssave: not_result — video not in cache")
  }
  if (!data.data) throw new Error("vidssave: no data (status=" + data?.status_code + ")")

  const info = data.data
  const resources = info.resources || []

  const videoFormats = resources
    .filter(r => r.type === "video")
    .map(r => ({
      resource_id: r.resource_id,
      quality: r.quality,
      format: r.format || "MP4",
      size: r.size,
      size_mb: r.size ? (r.size / 1024 / 1024).toFixed(2) + " MB" : "? MB",
      download_url: r.download_url || r.url
    }))
    .sort((a, b) => {
      const order = ["720P", "480P", "360P", "1080P", "1440P", "2160P", "240P", "144P"]
      const ai = order.indexOf(a.quality), bi = order.indexOf(b.quality)
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
    })

  const audioFormats = resources
    .filter(r => r.type === "audio")
    .map(r => ({
      resource_id: r.resource_id,
      quality: r.quality,
      format: r.format || "OPUS",
      size: r.size,
      size_mb: r.size ? (r.size / 1024 / 1024).toFixed(2) + " MB" : "? MB",
      download_url: r.download_url || r.url
    }))

  if (!videoFormats.length) throw new Error("vidssave: no video formats found")

  const bestVideo = videoFormats.find(v => v.quality === "720P") || videoFormats[0] || null
  const bestAudio = audioFormats.find(a => a.format === "MP3") || audioFormats.find(a => a.format === "OPUS") || audioFormats[0] || null

  return {
    code: 200,
    timestamp: Date.now(),
    data: {
      id: info.id || extractVideoId(videoUrl) || null,
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
   Provider 2: Invidious open-source instances
   (works for ALL videos including restricted/age-gated)
   ───────────────────────────────────────────────── */
async function viaInvidious(videoUrl) {
  const videoId = extractVideoId(videoUrl)
  if (!videoId) throw new Error("invidious: invalid YouTube URL")

  // Multiple public Invidious instances — tried in order
  const instances = [
    "https://invidious.fdn.fr",
    "https://yewtu.be",
    "https://invidious.perennialte.ch",
    "https://iv.datura.network",
    "https://yt.artemislena.eu",
    "https://invidious.nerdvpn.de",
    "https://inv.nadeko.net",
    "https://invidious.private.coffee"
  ]

  for (const instance of instances) {
    try {
      const res = await axios.get(
        `${instance}/api/v1/videos/${videoId}?fields=title,videoThumbnails,lengthSeconds,formatStreams`,
        {
          headers: {
            "User-Agent": "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36",
            "Accept": "application/json"
          },
          timeout: 18000
        }
      )

      const data = res.data
      if (!data || data.error || !data.formatStreams) continue

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

      if (!formatStreams.length) continue

      // Sort highest quality first
      formatStreams.sort((a, b) => parseInt(b.quality) - parseInt(a.quality))

      const thumb = data.videoThumbnails?.find(t => t.quality === "maxres")?.url ||
                    data.videoThumbnails?.find(t => t.quality === "high")?.url ||
                    data.videoThumbnails?.[0]?.url ||
                    `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`

      const bestVideo = formatStreams.find(v => parseInt(v.quality) <= 720) || formatStreams[0]

      console.log(`[ytDownload] Invidious OK via ${instance}`)
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
          audio_formats: [],
          best_video: bestVideo ? {
            quality: bestVideo.quality,
            format: "MP4",
            size: "? MB",
            url: bestVideo.download_url
          } : null,
          best_audio: null
        }
      }
    } catch (e) {
      console.error(`[ytDownload] Invidious ${instance} failed: ${e.message}`)
      continue
    }
  }

  throw new Error("All Invidious instances failed")
}

/* ─────────────────────────────────────────────────
   Provider 3: cobalt.tools public API
   ───────────────────────────────────────────────── */
async function viaCobalt(videoUrl) {
  const instances = [
    "https://co.wuk.sh",
    "https://cobalt.api.onrender.com"
  ]

  for (const base of instances) {
    try {
      const res = await axios.post(
        `${base}/api/json`,
        { url: videoUrl, vQuality: "720", isAudioOnly: false, filenamePattern: "basic" },
        {
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          timeout: 15000
        }
      )
      const d = res.data
      if (!d || d.status === "error" || d.status === "rate-limit" || !d.url) continue

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
          video_formats: [{ resource_id: "cobalt", quality: "720P", format: "MP4", size: null, size_mb: "? MB", download_url: d.url }],
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
   Provider 4: DavidCyril API (audio-only last resort)
   ───────────────────────────────────────────────── */
async function viaDavidCyril(query) {
  const res = await axios.get("https://apis.davidcyril.name.ng/play", {
    params: { query, apikey: "" },
    headers: { "User-Agent": "Mozilla/5.0" },
    timeout: 25000
  })

  const data = res.data
  if (!data.status || !data.result?.download_url) {
    throw new Error("davidcyril: no audio download url")
  }

  const r = data.result
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
        download_url: r.download_url
      }],
      best_video: null,
      best_audio: {
        quality: "128KBPS",
        format: "MP3",
        size: "? MB",
        url: r.download_url
      }
    }
  }
}

/* ─────────────────────────────────────────────────
   MAIN — try 4 providers in order, fallback chain
   ───────────────────────────────────────────────── */
async function ytDownload(videoUrl) {
  if (!videoUrl) throw new Error("URL required")

  const errors = []

  // Provider 1: VidsSave (fast for popular/cached videos)
  try {
    const r = await viaVidssave(videoUrl)
    if (r.data?.video_formats?.length || r.data?.best_video) return r
  } catch (e) {
    errors.push("vidssave: " + e.message.slice(0, 80))
    console.error("[ytDownload] VidsSave failed:", e.message)
  }

  // Provider 2: Invidious (works for all videos — most reliable)
  try {
    const r = await viaInvidious(videoUrl)
    if (r.data?.video_formats?.length || r.data?.best_video) return r
  } catch (e) {
    errors.push("invidious: " + e.message.slice(0, 80))
    console.error("[ytDownload] Invidious failed:", e.message)
  }

  // Provider 3: cobalt.tools
  try {
    const r = await viaCobalt(videoUrl)
    if (r.data?.best_video) return r
  } catch (e) {
    errors.push("cobalt: " + e.message.slice(0, 60))
    console.error("[ytDownload] Cobalt failed:", e.message)
  }

  // Provider 4: DavidCyril (audio-only last resort)
  try {
    return await viaDavidCyril(videoUrl)
  } catch (e) {
    errors.push("davidcyril: " + e.message.slice(0, 60))
    console.error("[ytDownload] DavidCyril failed:", e.message)
  }

  throw new Error("Sab YouTube providers fail: " + errors.join(" | "))
}

module.exports = { ytDownload, extractVideoId }
