const axios = require("axios");

function extractVideoId(url) {
  try {
    let videoId = "";
    if (!url || typeof url !== "string") throw new Error("Invalid URL");

    if (url.includes("youtu.be/")) {
      videoId = url.split("youtu.be/")[1].split("?")[0].split("&")[0];
    } else if (url.includes("watch?v=")) {
      videoId = url.split("watch?v=")[1].split("&")[0];
    } else if (url.includes("/shorts/")) {
      videoId = url.split("/shorts/")[1].split("?")[0];
    } else if (url.includes("/embed/")) {
      videoId = url.split("/embed/")[1].split("?")[0];
    }

    if (!videoId || videoId.length < 10) throw new Error("Video ID nahi mila");
    return videoId;
  } catch (error) {
    throw new Error(`Video ID extract error: ${error.message}`);
  }
}

async function ytDownload(videoUrl) {
  try {
    if (!videoUrl) throw new Error("URL khali nahi ho sakta");

    const headers = {
      "accept": "*/*",
      "accept-language": "en-US,en;q=0.9",
      "content-type": "application/x-www-form-urlencoded",
      "origin": "https://vidssave.com",
      "referer": "https://vidssave.com/",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    };

    const body = new URLSearchParams();
    body.append("auth", "20250901majwlqo");
    body.append("domain", "api-ak.vidssave.com");
    body.append("origin", "cache");
    body.append("link", videoUrl);

    const res = await axios.post(
      "https://api.vidssave.com/api/contentsite_api/media/parse",
      body.toString(),
      { headers, timeout: 15000 }
    );

    if (!res.data) throw new Error("API se koi response nahi aya");
    const data = res.data;
    if (data.status !== 1 || !data.data) throw new Error(data.message || "YouTube se video nahi mil saka");

    const info = data.data;
    const resources = info.resources || [];

    const videoFormats = resources
      .filter((r) => r && r.type === "video")
      .map((r) => ({
        quality: r.quality || "Unknown",
        format: r.format || "MP4",
        size: r.size || 0,
        size_mb: ((r.size || 0) / 1024 / 1024).toFixed(2) + " MB",
        download_url: r.download_url || null
      }))
      .filter((v) => v.download_url !== null)
      .sort((a, b) => {
        const order = ["2160P", "1440P", "1080P", "720P", "480P", "360P", "240P", "144P"];
        const iA = order.indexOf(a.quality), iB = order.indexOf(b.quality);
        return (iA === -1 ? 999 : iA) - (iB === -1 ? 999 : iB);
      });

    const audioFormats = resources
      .filter((r) => r && r.type === "audio")
      .map((r) => ({
        quality: r.quality || "Unknown",
        format: r.format || "M4A",
        size: r.size || 0,
        size_mb: ((r.size || 0) / 1024 / 1024).toFixed(2) + " MB",
        download_url: r.download_url || null
      }))
      .filter((a) => a.download_url !== null)
      .sort((a, b) => {
        const order = ["320KBPS", "256KBPS", "192KBPS", "128KBPS", "96KBPS", "64KBPS", "48KBPS"];
        const iA = order.indexOf(a.quality), iB = order.indexOf(b.quality);
        return (iA === -1 ? 999 : iA) - (iB === -1 ? 999 : iB);
      });

    const bestVideo = videoFormats[0] || null;
    const bestAudio = audioFormats[0] || null;
    const duration = info.duration || 0;
    const duration_formatted = duration ? new Date(duration * 1000).toISOString().slice(11, 19) : "00:00:00";

    return {
      code: 200,
      status: "success",
      timestamp: Date.now(),
      data: {
        id: info.id || null,
        title: info.title || "Unknown Title",
        thumbnail: info.thumbnail || null,
        duration,
        duration_formatted,
        video_formats: videoFormats,
        audio_formats: audioFormats,
        best_video: bestVideo ? { quality: bestVideo.quality, format: bestVideo.format, size: bestVideo.size_mb, url: bestVideo.download_url } : null,
        best_audio: bestAudio ? { quality: bestAudio.quality, format: bestAudio.format, size: bestAudio.size_mb, url: bestAudio.download_url } : null,
        total_video_formats: videoFormats.length,
        total_audio_formats: audioFormats.length
      }
    };
  } catch (error) {
    return { code: 500, status: "error", timestamp: Date.now(), message: error.message, error: true };
  }
}

module.exports = { ytDownload, extractVideoId };
