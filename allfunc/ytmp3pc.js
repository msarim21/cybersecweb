'use strict';
/**
 * allfunc/ytmp3pc.js — YouTube audio/video downloads via the ytmp3pc.com /
 * ytzyar.cc converter APIs (scraper supplied by shozi, 2026-11-19).
 *
 * Why this exists: the .play / .ytmp3 / .play2 / .ytmp4 / .ytdl commands used
 * to depend on a LOCAL yt-dlp binary (allfunc/ytdl-local.js). The Dockerfile
 * installs yt-dlp, but the bot's Render (render.yaml: env node) and Heroku
 * (Procfile) deploys do NOT use the Dockerfile, so yt-dlp is missing there
 * and every downloader command just replied "yt-dlp installed nahi hai".
 * This module converts through a hosted API instead, so no local binary is
 * needed. yt-dlp stays as a fallback ONLY when it is actually installed
 * (ytdl-local.available()).
 *
 * Live-probe notes (2026-11-19, video jNQXAC9IVRw "Me at the zoo", 19 s):
 *  - search/info/getFormats all respond; getFormats exposes numeric
 *    `duration` (seconds) — used for the too-long guard.
 *  - mp3 convert at 320 kbps FAILED twice server-side ("Download process
 *    exited with error code 1"); 128 kbps SUCCEEDED. Default ladder is
 *    [192, 128, 256, 320] so a broken quality falls through to a working one.
 *  - mp4 getFormats can return an empty `detail` array even though mp4
 *    conversion with an explicit quality (720) SUCCEEDS — so mp4 uses an
 *    explicit quality ladder [720, 480, 360] and never depends on `detail`.
 *  - pre-progress for an already-converted file returns
 *    {cached: true, download_url, success: true} with NO job_id. The pasted
 *    scraper threw on that shape ("Success, file ready to download" as an
 *    error); convert() below returns the cached URL directly.
 *
 * Live-probe notes (2026-11-26, same video): ytmp3pc BROKE again — convert
 * fails for every quality ("Failed to obtain and cache metadata JSON") and
 * mp4 getFormats fails server-side (its yt-dlp is outdated: "Video
 * unavailable"). The public-provider fallbacks (Nexray/FAA/Omega/Kyio in
 * public-providers.js) still returned links the same day, so
 * downloadYouTubeAudio/Video now fall back to them (skipYtmp3pc: true, the
 * converter was already tried) after local yt-dlp, instead of failing
 * outright. That is what Sarim asked for in his 2026-11-26 voice note:
 * video + audio downloaders were both down, use the APIs as fallback.
 *
 * All functions accept `options.fetch` (default: global fetch) so tests can
 * inject a mock. fetch is always called with a URL object (the repo's
 * provider-test mocks read url.hostname).
 */

const { Readable } = require('node:stream');
const fs = require('node:fs');
const path = require('node:path');
const { pipeline } = require('node:stream/promises');

const CONFIG = {
    siteOrigin: 'https://ytmp3pc.com',
    searchPath: '/J0GPK30qWps',
    infoPath: '/hP2pPvYldCo',
    musicApiOrigin: 'https://ytzyar.cc',
    bucketOrigin: 'https://bucketx3.ytzyar.cc',
    widgetOrigin: 'https://nodex3.ytzyar.cc',
    userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    pollIntervalMs: 1500,
    pollTimeoutMs: 180000,
};

// Bot-level guards (WhatsApp size caps are 25 MB audio / 65 MB video).
const MAX_AUDIO_SECONDS = 25 * 60; // 25 min
const MAX_VIDEO_SECONDS = 15 * 60; // 15 min
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const MAX_VIDEO_BYTES = 65 * 1024 * 1024;
// 320 kbps failed twice in live probes; 192 first (matches the bot's
// "MP3 192kbps" label), 128 is the proven-working fallback.
const MP3_QUALITY_LADDER = [192, 128, 256, 320];
const MP4_QUALITY_LADDER = [720, 480, 360];

function extractYouTubeId(input) {
    if (!input || typeof input !== 'string') return null;
    const trimmed = input.trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
    const match = trimmed.match(
        /^.*(?:youtu\.be\/|v\/|\/u\/\w\/|embed\/|shorts\/|watch\?(?:.*&)?v=)([a-zA-Z0-9_-]{11})/
    );
    return match ? match[1] : null;
}

function computeToken(videoId) {
    const s = videoId.toLowerCase();
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h += s.charCodeAt(i);
        h += h << 10;
        h ^= h >>> 6;
    }
    h += h << 3;
    h ^= h >>> 11;
    h += h << 15;
    return h >>> 0;
}

function siteHeaders() {
    return {
        Accept: 'application/json',
        Referer: `${CONFIG.siteOrigin}/`,
        'User-Agent': CONFIG.userAgent,
    };
}

function converterHeaders(videoId, accept = 'application/json') {
    return {
        Accept: accept,
        'Content-Type': 'application/json',
        Origin: CONFIG.widgetOrigin,
        Referer: `${CONFIG.widgetOrigin}/${videoId}`,
        'User-Agent': CONFIG.userAgent,
    };
}

function fetchImpl(options = {}) {
    return options.fetch || fetch;
}

async function fetchJson(url, options = {}) {
    const res = await fetchImpl(options)(new URL(url), options.init || {});
    // Prefer .text() (better error context), fall back to .json() for minimal
    // mocks that only implement json().
    let text;
    if (typeof res.text === 'function') {
        text = await res.text();
    } else if (typeof res.json === 'function') {
        return res.json();
    } else {
        throw new Error(`No readable body from ${url}`);
    }
    let data;
    try {
        data = JSON.parse(text);
    } catch {
        throw new Error(`HTTP ${res.status} non-JSON from ${url}: ${text.slice(0, 200)}`);
    }
    if (!res.ok) {
        const msg = data?.message || `HTTP ${res.status}`;
        throw new Error(`Request failed (${res.status}): ${msg}`);
    }
    return data;
}

async function search(query, options = {}) {
    const url = `${CONFIG.siteOrigin}${CONFIG.searchPath}?query=${encodeURIComponent(query)}`;
    const data = await fetchJson(url, { ...options, init: { headers: siteHeaders() } });
    return {
        query: data.query || query,
        items: Array.isArray(data.items) ? data.items : [],
    };
}

async function getInfo(input, options = {}) {
    const videoId = extractYouTubeId(input);
    if (!videoId) throw new Error(`Invalid YouTube URL or ID: ${input}`);
    const url = `${CONFIG.siteOrigin}${CONFIG.infoPath}?v=${encodeURIComponent(videoId)}`;
    const data = await fetchJson(url, { ...options, init: { headers: siteHeaders() } });
    return {
        videoId,
        ...data,
        formats: {
            mp3: data.formats?.mp3 ? `${CONFIG.siteOrigin}${data.formats.mp3}` : null,
            mp4: data.formats?.mp4 ? `${CONFIG.siteOrigin}${data.formats.mp4}` : null,
        },
    };
}

async function getFormats(input, type = 'mp3', options = {}) {
    const videoId = extractYouTubeId(input);
    if (!videoId) throw new Error(`Invalid YouTube URL or ID: ${input}`);
    const token = computeToken(videoId);
    const kind = type.toLowerCase();
    if (kind !== 'mp3' && kind !== 'mp4') {
        throw new Error(`Unsupported format type: ${type} (use "mp3" or "mp4")`);
    }

    const url =
        kind === 'mp3'
            ? `${CONFIG.musicApiOrigin}/music/available-music?v=${encodeURIComponent(videoId)}&token=${token}`
            : `${CONFIG.bucketOrigin}/video/available-video?v=${encodeURIComponent(videoId)}&token=${token}`;

    const data = await fetchJson(url, { ...options, init: { headers: converterHeaders(videoId) } });
    if (!data.success) {
        throw new Error(data.message || 'Failed to fetch available formats');
    }
    return data.data;
}

async function convert(input, options = {}) {
    const videoId = extractYouTubeId(input);
    if (!videoId) throw new Error(`Invalid YouTube URL or ID: ${input}`);

    const type = (options.type || 'mp3').toLowerCase();
    if (type !== 'mp3' && type !== 'mp4') {
        throw new Error(`Unsupported format type: ${type} (use "mp3" or "mp4")`);
    }

    const pollIntervalMs = options.pollIntervalMs ?? CONFIG.pollIntervalMs;
    const pollTimeoutMs = options.pollTimeoutMs ?? CONFIG.pollTimeoutMs;
    const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
    const sig = computeToken(videoId);

    let quality = options.quality;
    let meta = null;
    if (quality === undefined || quality === null) {
        meta = await getFormats(videoId, type, options);
        const first = meta.detail?.[0];
        if (!first) throw new Error(`No ${type} qualities available for ${videoId}`);
        quality = first.quality;
    }

    const endpointPrefix = type === 'mp3' ? 'music' : 'video';
    const payload = {
        video_id: videoId,
        quality: type === 'mp3' ? String(quality) : Number(quality),
        sig,
    };

    const preUrl = `${CONFIG.bucketOrigin}/${endpointPrefix}/pre-progress`;
    const prep = await fetchJson(preUrl, {
        ...options,
        init: {
            method: 'POST',
            headers: converterHeaders(videoId, 'text/event-stream'),
            body: JSON.stringify(payload),
        },
    });

    // Cached conversion: the API answers with the file URL directly and no
    // job_id. (The pasted scraper threw here — see header notes.)
    const cachedUrl = prep.download_url || prep.data?.download_url;
    if (prep.success && cachedUrl) {
        return {
            videoId,
            type,
            quality: payload.quality,
            jobId: prep.data?.job_id || null,
            title: meta?.title || null,
            author: meta?.author || null,
            downloadUrl: cachedUrl,
            status: 'cached',
        };
    }

    if (!prep.success || !prep.data?.job_id) {
        throw new Error(prep.message || 'Failed to enqueue conversion job');
    }

    const jobId = prep.data.job_id;
    const progressUrl = `${CONFIG.bucketOrigin}/${endpointPrefix}/progress?job_id=${encodeURIComponent(jobId)}`;
    const deadline = Date.now() + pollTimeoutMs;

    while (Date.now() < deadline) {
        const state = await fetchJson(progressUrl, {
            ...options,
            init: { headers: converterHeaders(videoId) },
        });

        if (onProgress) onProgress(state);

        const status = (state.status || state.data?.status || '').toLowerCase();
        if (state.download_url) {
            return {
                videoId,
                type,
                quality: payload.quality,
                jobId,
                title: meta?.title || null,
                author: meta?.author || null,
                downloadUrl: state.download_url,
                status,
            };
        }

        if (status === 'failed' || status === 'error') {
            throw new Error(state.message || `Conversion failed for ${videoId}`);
        }

        await new Promise((r) => setTimeout(r, pollIntervalMs));
    }

    throw new Error(`Timed out waiting for job ${jobId}`);
}

async function downloadFile(downloadUrl, outPath, options = {}) {
    const res = await fetchImpl(options)(new URL(downloadUrl), {
        headers: {
            Origin: CONFIG.widgetOrigin,
            Referer: `${CONFIG.widgetOrigin}/`,
            'User-Agent': CONFIG.userAgent,
        },
    });
    if (!res.ok || !res.body) {
        throw new Error(`Download failed: HTTP ${res.status}`);
    }

    let targetPath = outPath;
    if (!targetPath) {
        const disp = res.headers.get('content-disposition') || '';
        const m =
            disp.match(/filename\*=UTF-8''([^;]+)/i) ||
            disp.match(/filename="?([^";]+)"?/i);
        const filename = m ? decodeURIComponent(m[1]).replace(/[<>:"/\\|?*]/g, '_') : `download_${Date.now()}`;
        targetPath = path.resolve(process.cwd(), filename);
    }

    await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(targetPath));
    return {
        path: targetPath,
        bytes: fs.statSync(targetPath).size,
        contentType: res.headers.get('content-type') || null,
    };
}

// ── Bot-level helpers ───────────────────────────────────────────────────────

/** "3:33" / "1:02:03" / 213 → seconds (number), or null when unparseable. */
function parseDuration(value) {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return Math.round(value);
    if (typeof value !== 'string') return null;
    const parts = value.trim().split(':').map((p) => Number(p));
    if (!parts.length || parts.some((p) => !Number.isFinite(p) || p < 0)) return null;
    return parts.reduce((acc, p) => acc * 60 + p, 0);
}

function safeFileName(title, ext) {
    const base = String(title || 'YouTube').replace(/[<>:\"/\\|?*]+/g, '').trim().substring(0, 50) || 'YouTube';
    return `${base}.${ext}`;
}

function thumbnailFor(videoId) {
    return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

/**
 * Resolve a YouTube URL or a search query to a video.
 * URL/bare ID → direct. Query → ytmp3pc search (first item), falling back to
 * yt-search when the API returns nothing.
 */
async function resolveVideo(input, options = {}) {
    const directId = extractYouTubeId(input);
    if (directId) {
        return { videoId: directId, url: `https://youtu.be/${directId}`, title: null, thumbnail: thumbnailFor(directId), duration: null };
    }
    const query = String(input || '').trim();
    if (!query) throw new Error('Empty YouTube query');
    try {
        const { items } = await search(query, options);
        const first = (items || []).find((it) => it && extractYouTubeId(it.videoId || it.id || it.url || ''));
        if (first) {
            const videoId = extractYouTubeId(first.videoId || first.id || first.url);
            return {
                videoId,
                url: `https://youtu.be/${videoId}`,
                title: first.title || null,
                thumbnail: first.thumbnail || thumbnailFor(videoId),
                duration: parseDuration(first.duration),
            };
        }
    } catch (_) { /* fall through to yt-search */ }
    try {
        const yts = require('yt-search');
        const { videos } = await yts(query);
        const pick = (videos || []).filter((v) => !v.live)[0] || (videos || [])[0];
        if (pick) {
            const videoId = extractYouTubeId(pick.url || pick.videoId || '');
            if (videoId) {
                return { videoId, url: pick.url, title: pick.title || null, thumbnail: pick.thumbnail || thumbnailFor(videoId), duration: parseDuration(pick.timestamp) };
            }
        }
    } catch (_) { /* fall through to the error below */ }
    throw new Error(`No results found for "${query}"`);
}

/** Download a converted file into memory with a hard size cap. */
async function downloadBuffer(downloadUrl, { maxBytes, fetch: fetchOpt } = {}) {
    const res = await (fetchOpt || fetch)(new URL(downloadUrl), {
        headers: {
            Origin: CONFIG.widgetOrigin,
            Referer: `${CONFIG.widgetOrigin}/`,
            'User-Agent': CONFIG.userAgent,
        },
        signal: AbortSignal.timeout(300000),
    });
    if (!res.ok || !res.body) {
        throw new Error(`Download failed: HTTP ${res.status}`);
    }
    const contentLength = Number(res.headers?.get?.('content-length'));
    if (maxBytes && Number.isFinite(contentLength) && contentLength > maxBytes) {
        throw new Error(`File too large (${(contentLength / 1024 / 1024).toFixed(1)} MB). Max ${(maxBytes / 1024 / 1024).toFixed(0)} MB.`);
    }
    let buffer;
    if (typeof res.arrayBuffer === 'function') {
        buffer = Buffer.from(await res.arrayBuffer());
    } else {
        const stream = typeof res.body.getReader === 'function' ? Readable.fromWeb(res.body) : res.body;
        const chunks = [];
        let total = 0;
        for await (const chunk of stream) {
            chunks.push(chunk);
            total += chunk.length;
            if (maxBytes && total > maxBytes) {
                throw new Error(`File too large (over ${(maxBytes / 1024 / 1024).toFixed(0)} MB).`);
            }
        }
        buffer = Buffer.concat(chunks);
    }
    if (maxBytes && buffer.length > maxBytes) {
        throw new Error(`File too large (${(buffer.length / 1024 / 1024).toFixed(1)} MB). Max ${(maxBytes / 1024 / 1024).toFixed(0)} MB.`);
    }
    return { buffer, bytes: buffer.length, contentType: res.headers?.get?.('content-type') || null };
}

function ytdlLocal(options = {}) {
    if (options.ytdl) return options.ytdl;
    try { return require('./ytdl-local'); } catch (_) { return null; }
}

/** Try each quality in order until one converts; returns the first success. */
async function convertWithLadder(videoId, type, ladder, options = {}) {
    const errors = [];
    for (const quality of ladder) {
        try {
            const r = await convert(videoId, { ...options, type, quality });
            return { ...r, usedQuality: quality };
        } catch (e) {
            errors.push(`${quality}: ${e.message}`);
        }
    }
    throw new Error(`All ${type} qualities failed — ${errors.join(' | ')}`);
}

// ── Public-provider fallback ──────────────────────────────────────────────
// public-providers.js requires this module at the top, so require it lazily
// here (at call time both modules are fully loaded — no circular-load risk).
// options.providers lets tests inject a stub instead of the real module.
function providerModule(options = {}) {
    if (options.providers) return options.providers;
    return require('./public-providers');
}

async function downloadViaProviderAudio(resolved, { maxBytes, options, duration }) {
    const providers = providerModule(options);
    const r = await providers.youtubeMp3(resolved.url, { ...options, skipYtmp3pc: true });
    if (!r.audio) throw new Error('Provider fallback: no mp3 link');
    const dur = parseDuration(r.duration) ?? duration ?? null;
    if (dur != null && dur > MAX_AUDIO_SECONDS) {
        throw new Error(`Video too long (${Math.round(dur / 60)} min). Max ${MAX_AUDIO_SECONDS / 60} min for audio.`);
    }
    const dl = await downloadBuffer(r.audio, { maxBytes, fetch: options.fetch });
    const title = r.title || resolved.title || 'Unknown';
    return {
        buffer: dl.buffer,
        title,
        thumbnail: resolved.thumbnail,
        duration: dur,
        quality: 'MP3 (fallback)',
        filesize: dl.bytes,
        fileName: safeFileName(title, 'mp3'),
    };
}

async function downloadViaProviderVideo(resolved, { maxBytes, options, duration }) {
    const providers = providerModule(options);
    const r = await providers.youtubeMp4(resolved.url, { ...options, skipYtmp3pc: true });
    if (!r.video) throw new Error('Provider fallback: no mp4 link');
    const dur = parseDuration(r.duration) ?? duration ?? null;
    if (dur != null && dur > MAX_VIDEO_SECONDS) {
        throw new Error(`Video too long (${Math.round(dur / 60)} min). Max ${MAX_VIDEO_SECONDS / 60} min for video.`);
    }
    const dl = await downloadBuffer(r.video, { maxBytes, fetch: options.fetch });
    const title = r.title || resolved.title || 'Unknown';
    return {
        buffer: dl.buffer,
        title,
        thumbnail: r.thumbnail || resolved.thumbnail,
        duration: dur,
        quality: 'MP4 (fallback)',
        filesize: dl.bytes,
        fileName: safeFileName(title, 'mp4'),
    };
}

/**
 * Full audio pipeline: resolve → duration guard → convert (quality ladder) →
 * download to memory. Falls back to local yt-dlp when it is installed, then
 * to the public providers (Nexray/FAA/Omega/Kyio) — the Railway/Render
 * deploys have no yt-dlp, so without the provider step a broken ytmp3pc
 * meant every .play/.ytmp3 failed outright.
 * Return shape matches ytdl-local ytAudio() so case.js handlers need no
 * changes beyond the backend call.
 */
async function downloadYouTubeAudio(input, options = {}) {
    const maxBytes = options.maxBytes || MAX_AUDIO_BYTES;
    const resolved = await resolveVideo(input, options);
    let meta = null;
    try { meta = await getFormats(resolved.videoId, 'mp3', options); } catch (_) { /* duration unknown — proceed */ }
    const duration = meta?.duration ?? resolved.duration;
    if (duration != null && duration > MAX_AUDIO_SECONDS) {
        throw new Error(`Video too long (${Math.round(duration / 60)} min). Max ${MAX_AUDIO_SECONDS / 60} min for audio.`);
    }
    try {
        const conv = await convertWithLadder(resolved.videoId, 'mp3', options.qualityLadder || MP3_QUALITY_LADDER, {
            ...options,
            pollTimeoutMs: options.pollTimeoutMs || 120000,
        });
        const dl = await downloadBuffer(conv.downloadUrl, { maxBytes, fetch: options.fetch });
        const title = meta?.title || resolved.title || 'Unknown';
        return {
            buffer: dl.buffer,
            title,
            thumbnail: resolved.thumbnail,
            duration: duration ?? null,
            quality: `MP3 ${conv.usedQuality}kbps`,
            filesize: dl.bytes,
            fileName: safeFileName(title, 'mp3'),
        };
    } catch (apiErr) {
        const local = ytdlLocal(options);
        if (local && typeof local.available === 'function' && local.available()) {
            try {
                console.log('[ytmp3pc] API failed, falling back to local yt-dlp:', apiErr.message);
                return await local.ytAudio(resolved.url, { maxBytes });
            } catch (localErr) {
                console.log('[ytmp3pc] local yt-dlp failed too, trying providers:', localErr.message);
            }
        }
        try {
            console.log('[ytmp3pc] API failed, falling back to providers:', apiErr.message);
            return await downloadViaProviderAudio(resolved, { maxBytes, options, duration });
        } catch (provErr) {
            throw new Error(`YouTube audio failed — ytmp3pc: ${apiErr.message}; providers: ${provErr.message}`);
        }
    }
}

/** Same pipeline for video (mp4). Return shape matches ytdl-local ytVideo(). */
async function downloadYouTubeVideo(input, options = {}) {
    const maxBytes = options.maxBytes || MAX_VIDEO_BYTES;
    const resolved = await resolveVideo(input, options);
    let meta = null;
    try { meta = await getFormats(resolved.videoId, 'mp4', options); } catch (_) { /* duration unknown — proceed */ }
    const duration = meta?.duration ?? resolved.duration;
    if (duration != null && duration > MAX_VIDEO_SECONDS) {
        throw new Error(`Video too long (${Math.round(duration / 60)} min). Max ${MAX_VIDEO_SECONDS / 60} min for video.`);
    }
    try {
        const conv = await convertWithLadder(resolved.videoId, 'mp4', options.qualityLadder || MP4_QUALITY_LADDER, {
            ...options,
            pollTimeoutMs: options.pollTimeoutMs || 120000,
        });
        const dl = await downloadBuffer(conv.downloadUrl, { maxBytes, fetch: options.fetch });
        const title = meta?.title || resolved.title || 'Unknown';
        return {
            buffer: dl.buffer,
            title,
            thumbnail: resolved.thumbnail,
            duration: duration ?? null,
            quality: `${conv.usedQuality}p`,
            filesize: dl.bytes,
            fileName: safeFileName(title, 'mp4'),
        };
    } catch (apiErr) {
        const local = ytdlLocal(options);
        if (local && typeof local.available === 'function' && local.available()) {
            try {
                console.log('[ytmp3pc] API failed, falling back to local yt-dlp:', apiErr.message);
                return await local.ytVideo(resolved.url, { maxBytes, maxHeight: 720 });
            } catch (localErr) {
                console.log('[ytmp3pc] local yt-dlp failed too, trying providers:', localErr.message);
            }
        }
        try {
            console.log('[ytmp3pc] API failed, falling back to providers:', apiErr.message);
            return await downloadViaProviderVideo(resolved, { maxBytes, options, duration });
        } catch (provErr) {
            throw new Error(`YouTube video failed — ytmp3pc: ${apiErr.message}; providers: ${provErr.message}`);
        }
    }
}

/** Metadata for menus (ytdl): title, thumbnail, duration in seconds. */
async function getYouTubeInfo(input, options = {}) {
    const resolved = await resolveVideo(input, options);
    try {
        const info = await getInfo(resolved.videoId, options);
        return {
            id: resolved.videoId,
            url: resolved.url,
            title: info.title || resolved.title || 'Unknown',
            thumbnail: info.thumbnail || resolved.thumbnail,
            duration: parseDuration(info.duration) ?? resolved.duration,
            uploader: info.author || null,
        };
    } catch (_) {
        return {
            id: resolved.videoId,
            url: resolved.url,
            title: resolved.title || 'Unknown',
            thumbnail: resolved.thumbnail,
            duration: resolved.duration,
            uploader: null,
        };
    }
}

/** URL-only variants for the public-providers fallback chains (ytaudio/ytvid). */
async function getYouTubeAudioUrl(input, options = {}) {
    const resolved = await resolveVideo(input, options);
    const conv = await convertWithLadder(resolved.videoId, 'mp3', [192, 128], {
        ...options,
        pollTimeoutMs: options.pollTimeoutMs || 90000,
    });
    let duration = resolved.duration;
    let title = conv.title || resolved.title;
    try {
        const f = await getFormats(resolved.videoId, 'mp3', options);
        duration = f?.duration ?? duration;
        title = f?.title || title;
    } catch (_) {}
    return { audio: conv.downloadUrl, title: title || 'YouTube audio', duration: duration ?? null };
}

async function getYouTubeVideoUrl(input, options = {}) {
    const resolved = await resolveVideo(input, options);
    const conv = await convertWithLadder(resolved.videoId, 'mp4', [720, 480], {
        ...options,
        pollTimeoutMs: options.pollTimeoutMs || 90000,
    });
    let duration = resolved.duration;
    let title = conv.title || resolved.title;
    try {
        const f = await getFormats(resolved.videoId, 'mp4', options);
        duration = f?.duration ?? duration;
        title = f?.title || title;
    } catch (_) {}
    return { video: conv.downloadUrl, title: title || 'YouTube video', duration: duration ?? null };
}

module.exports = {
    CONFIG,
    MAX_AUDIO_SECONDS,
    MAX_VIDEO_SECONDS,
    MAX_AUDIO_BYTES,
    MAX_VIDEO_BYTES,
    MP3_QUALITY_LADDER,
    MP4_QUALITY_LADDER,
    extractYouTubeId,
    computeToken,
    search,
    getInfo,
    getFormats,
    convert,
    downloadFile,
    parseDuration,
    resolveVideo,
    downloadBuffer,
    downloadYouTubeAudio,
    downloadYouTubeVideo,
    getYouTubeInfo,
    getYouTubeAudioUrl,
    getYouTubeVideoUrl,
};
