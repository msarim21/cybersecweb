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

async function ytDownload(videoUrl) {
  if (!videoUrl) throw Error("URL tidak boleh kosong")

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
    { headers }
  )

  const data = res.data

  if (!data.data || data.status !== 1) {
    throw Error("Gagal mengambil video YouTube")
  }

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

  const bestVideo = videoFormats.find(v => v.quality === "2160P") || videoFormats[0] || null
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

module.exports = { ytDownload, extractVideoId }
