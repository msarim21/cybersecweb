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
  return videoId
}

/* ─────────────────────────────────────────────────
   Provider 1: VidsSave API (primary — video + audio)
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
      timeout: 30000,
      maxRedirects: 5
    }
  )

  const data = res.data
  // Accept status 1 OR any response that has usable data
  if (!data || (!data.data && data.status !== 1)) {
    throw new Error("vidssave: bad response (status=" + data?.status + ")")
  }
  if (!data.data) throw new Error("vidssave: no data in response")

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

  const bestVideo = videoFormats.find(v => v.quality === "720P") || videoFormats[0] || null
  // Prefer MP3 for audio if available, else OPUS, else any
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
   Provider 2: DavidCyril API (audio-only fallback)
   ───────────────────────────────────────────────── */
async function viaDavidCyril(query) {
  // If it's a YouTube URL, extract search terms from it; otherwise use as-is
  let searchQuery = query
  if (query.includes("youtu")) {
    // Use the URL directly - API supports YouTube URLs
    searchQuery = query
  }

  const res = await axios.get("https://apis.davidcyril.name.ng/play", {
    params: { query: searchQuery, apikey: "" },
    headers: { "User-Agent": "Mozilla/5.0" },
    timeout: 30000
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
   MAIN — try providers in order
   ───────────────────────────────────────────────── */
async function ytDownload(videoUrl) {
  if (!videoUrl) throw new Error("URL required")

  const errors = []

  // Provider 1: VidsSave (video + audio)
  try {
    return await viaVidssave(videoUrl)
  } catch (e) {
    errors.push("vidssave: " + e.message.slice(0, 80))
    console.error("[ytDownload] VidsSave failed:", e.message)
  }

  // Provider 2: DavidCyril (audio-only fallback)
  try {
    return await viaDavidCyril(videoUrl)
  } catch (e) {
    errors.push("davidcyril: " + e.message.slice(0, 60))
    console.error("[ytDownload] DavidCyril failed:", e.message)
  }

  throw new Error("All YouTube providers failed: " + errors.join(" | "))
}

module.exports = { ytDownload, extractVideoId }
