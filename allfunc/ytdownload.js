
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

;(async () => {
  return await ytDownload("https://youtu.be/B1ynHmn0XZ4?si=ZzDFPACjGOiA2okW")
})()


{
  "code": 200,
  "timestamp": 1777908816000,
  "data": {
    "id": "B1ynHmn0XZ4",
    "title": "NOAH - Bintang di Surga (Official Music Video)",
    "thumbnail": "https://i.ytimg.com/vi/B1ynHmn0XZ4/sddefault.jpg?v=684a65be",
    "duration": 306,
    "duration_formatted": "00:05:06",
    "video_formats": [
      { "quality": "2160P", "format": "MP4", "size": 169630819, "size_mb": "161.77 MB" },
      { "quality": "1440P", "format": "MP4", "size": 92511366, "size_mb": "88.23 MB" },
      { "quality": "1080P", "format": "MP4", "size": 81804585, "size_mb": "78.01 MB" },
      { "quality": "720P", "format": "MP4", "size": 36402241, "size_mb": "34.72 MB" },
      { "quality": "480P", "format": "MP4", "size": 22008890, "size_mb": "20.99 MB" },
      { "quality": "240P", "format": "MP4", "size": 10342095, "size_mb": "9.86 MB" },
      { "quality": "144P", "format": "MP4", "size": 7402677, "size_mb": "7.06 MB" }
    ],
    "audio_formats": [
      { "quality": "48KBPS", "format": "M4A", "size": 1869780, "size_mb": "1.78 MB" },
      { "quality": "128KBPS", "format": "M4A", "size": 4959703, "size_mb": "4.73 MB" },
      { "quality": "256KBPS", "format": "OPUS", "size": 4992119, "size_mb": "4.76 MB" },
      { "quality": "LOW", "format": "WEBM", "size": 1180147, "size_mb": "1.13 MB" }
    ],
    "best_video": {
      "quality": "2160P",
      "format": "MP4",
      "size": "161.77 MB",
      "url": "https://api.vidssave.com/api/contentsite_api/media/download_redirect?request=..."
    },
    "best_audio": {
      "quality": "256KBPS",
      "format": "OPUS",
      "size": "4.76 MB",
      "url": "https://api.vidssave.com/api/contentsite_api/media/download_redirect?request=..."
    }
  }
}
