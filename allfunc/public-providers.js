'use strict';

// Only documented endpoints with successful live response validation are enabled.
const ytmp3pc = require('./ytmp3pc');
const DEFAULTS = {
    KYIO_API_BASE: 'https://api.kyio.web.id',
    OMEGA_API_BASE: 'https://api.omegatech.app',
    NEXRAY_API_BASE: 'https://api.nexray.eu.cc',
    AZBRY_API_BASE: 'https://api.azbry.com',
    FAA_API_BASE: 'https://api-faa.my.id',
};
function base(name) {
    const value = String(process.env[name] || DEFAULTS[name]).trim().replace(/\/+$/, '');
    const url = new URL(value);
    if (url.protocol !== 'https:') throw new Error('Provider base must use HTTPS');
    return value;
}
function extractAnswer(data) {
    if (!data || data.success === false || data.status === false || data.error) return '';
    if (typeof data === 'string') {
        const text = data.trim();
        return /^(<|\{)|older version of the app|rate limit|update to the latest/i.test(text) ? '' : text;
    }
    // Never treat echoed message/prompt fields as an AI answer.
    for (const key of ['answer', 'reply', 'response', 'text', 'result', 'data']) {
        const answer = extractAnswer(data[key]);
        if (answer) return answer;
    }
    return '';
}
function httpsUrl(value) {
    try { const u = new URL(value); return u.protocol === 'https:' ? u.href : ''; }
    catch (_) { return ''; }
}
function list(data) {
    const rows = data?.results || data?.result || data?.data;
    return Array.isArray(rows) ? rows : [];
}
function nonEmpty(value) {
    return typeof value === 'string' && value.trim().length > 0;
}
function requireHttpsUrl(input, label) {
    const href = httpsUrl(String(input || '').trim());
    if (!href) throw new Error(`${label || 'URL'} must be an https:// link`);
    return href;
}
function requireHost(input, hosts, label) {
    const href = requireHttpsUrl(input, label);
    const host = new URL(href).hostname.toLowerCase();
    const ok = hosts.some(h => host === h || host.endsWith('.' + h));
    if (!ok) throw new Error(`Invalid ${label || 'URL'} — expected ${hosts.join(' or ')}`);
    return href;
}
function requireQuery(query, label) {
    const q = String(query || '').trim();
    if (!q) throw new Error(`${label || 'Query'} is empty`);
    return q;
}
async function request(name, path, params, options = {}) {
    const url = new URL(base(name) + path);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
    const res = await (options.fetch || fetch)(url, {
        headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(options.timeout || 25000),
    });
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
    const data = await res.json();
    if (data?.success === false || data?.status === false || data?.error || Number(data?.statusCode) >= 400) {
        throw new Error(`${name}: provider rejected request`);
    }
    return data;
}
// Kyio free tier is 10 requests/minute per IP. Serialize Kyio calls with a
// ~6 s minimum gap so bursts of bot commands cannot trip the limit. The wait
// is skipped when a custom fetch is injected (tests), where no real network
// traffic happens.
let kyioAvailableAt = 0;
let kyioQueue = Promise.resolve();
async function kyioThrottle(options = {}) {
    if (options.fetch) return;
    const run = kyioQueue.then(async () => {
        const wait = kyioAvailableAt - Date.now();
        if (wait > 0) await new Promise(r => setTimeout(r, wait));
        kyioAvailableAt = Date.now() + 6000;
    });
    kyioQueue = run.catch(() => {});
    return run;
}
async function kyioRequest(path, params, options = {}) {
    await kyioThrottle(options);
    return request('KYIO_API_BASE', path, params, options);
}
// Binary endpoints return the image/audio/video directly instead of JSON.
// Never download bytes here: return the URL and let Baileys fetch it on send.
// The HEAD check is deliberately lenient: it only rejects a 200 response whose
// content-type is not image/video (a JSON error payload). A failed HEAD never
// rejects — some hosts answer HEAD differently than GET, and every endpoint
// here was already validated live by the probe. Pass { head: false } for
// AI generation / transform endpoints, where a HEAD would run the (slow,
// non-deterministic) job twice.
async function mediaUrl(name, path, params, options = {}) {
    const url = new URL(base(name) + path);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
    if (options.head === false) return url.href;
    try {
        const res = await (options.fetch || fetch)(url, {
            method: 'HEAD', headers: { Accept: 'image/*,video/*,*/*' },
            signal: AbortSignal.timeout(options.timeout || 15000),
        });
        if (res.ok && typeof res.headers?.get === 'function') {
            const type = res.headers.get('content-type') || '';
            if (type && !/^(image|video)\//i.test(type)) throw new Error(`${name}: unexpected media type ${type}`);
        }
    } catch (e) {
        if (/unexpected media type/.test(e.message)) throw e;
        // HEAD unsupported or unreachable: trust the live probe validation.
    }
    return url.href;
}
async function fallback(tasks) {
    const errors = [];
    for (const task of tasks) {
        try { return await task(); } catch (e) { errors.push(e.message); }
    }
    throw new Error(errors.join('; '));
}
async function askAI(prompt, options = {}) {
    const query = String(prompt || '').trim();
    if (!query) throw new Error('AI prompt is empty');
    const providers = options.provider ? [options.provider] :
        (process.env.EXTRA_PROVIDERS === 'false' ? ['kyio'] : ['kyio', 'omega']);
    return fallback(providers.map(provider => async () => {
        let data;
        if (provider === 'kyio') data = await kyioRequest('/api/ai/deepseek-r1', { q: query }, options);
        else if (provider === 'omega') data = await request('OMEGA_API_BASE', '/api/ai/Deepseek', { message: query, model: 'v32' }, options);
        else throw new Error('Unsupported AI provider');
        const answer = extractAnswer(data);
        if (!answer) throw new Error(`${provider}: empty or invalid AI answer`);
        return answer;
    }));
}
// ---- Kyio AI (each model returns its answer under a different field —
// read the field the probe verified per endpoint, never a generic guess) ----
async function kyioAI(path, field, prompt, options = {}) {
    const query = requireQuery(prompt, 'AI prompt');
    const data = await kyioRequest(path, { q: query }, options);
    const text = data?.result?.[field];
    if (!nonEmpty(text)) throw new Error('Kyio: empty or invalid AI answer');
    return text.trim();
}
async function claudeHaikuAI(prompt, options = {}) { return kyioAI('/api/ai/claude-haiku-4-5', 'answer', prompt, options); }
async function deepseekFlashAI(prompt, options = {}) { return kyioAI('/api/v2/ai/deepseek-v4-flash', 'answer', prompt, options); }
async function gpt41AI(prompt, options = {}) { return kyioAI('/api/v2/ai/gpt-4-1', 'response', prompt, options); }
async function kyioChatAI(prompt, options = {}) { return kyioAI('/api/v2/ai/ai', 'data', prompt, options); }
async function chataiAI(prompt, options = {}) { return kyioAI('/api/ai/chatai', 'content', prompt, options); }
async function geminiChatAI(prompt, options = {}) { return kyioAI('/api/ai/geminichat', 'result', prompt, options); }
async function freeAI(prompt, options = {}) { return kyioAI('/api/ai/free', 'answer', prompt, options); }
async function s5AI(prompt, options = {}) { return kyioAI('/api/ai/s5', 'answer', prompt, options); }
// Maritaca answers in Indonesian.
async function maritacaAI(prompt, options = {}) { return kyioAI('/api/ai/maritaca', 'answer', prompt, options); }
// ---- Nexray AI ----
async function nexrayAI(prompt, options = {}) {
    const query = requireQuery(prompt, 'AI prompt');
    const data = await request('NEXRAY_API_BASE', '/ai/nexray', { text: query }, options);
    const answer = extractAnswer(data);
    if (!answer) throw new Error('Nexray: empty or invalid AI answer');
    return answer;
}
async function claudeAI(prompt, options = {}) {
    const query = requireQuery(prompt, 'AI prompt');
    const data = await request('NEXRAY_API_BASE', '/ai/claude', { text: query }, options);
    const answer = extractAnswer(data);
    if (!answer) throw new Error('Nexray Claude: empty or invalid AI answer');
    return answer;
}
async function geminiAI(prompt, options = {}) {
    const query = requireQuery(prompt, 'AI prompt');
    const data = await request('NEXRAY_API_BASE', '/ai/gemini', { text: query }, options);
    // result.text is the answer. result.session_id is a cookie bundle for
    // follow-ups — never log it, never return it, never pass it on.
    const text = data?.result?.text;
    if (!nonEmpty(text) || /older version of the app|update to the latest/i.test(text)) {
        throw new Error('Nexray Gemini: empty or invalid AI answer');
    }
    return text.trim();
}
async function grammarCheck(text, options = {}) {
    const query = requireQuery(text, 'Text');
    const data = await request('NEXRAY_API_BASE', '/ai/grammarcheck', { text: query }, options);
    const result = data?.result || {};
    if (!nonEmpty(result.corrected)) throw new Error('Nexray: no corrected text');
    return { original: result.original || query, corrected: result.corrected.trim(), errorCount: Number(result.error_count) || 0 };
}
async function geminiTTS(text, options = {}) {
    const query = requireQuery(text, 'Text');
    const data = await request('NEXRAY_API_BASE', '/ai/gemini-tts', { text: query }, options);
    const audio = httpsUrl(data?.result);
    if (!audio) throw new Error('Nexray: no audio URL');
    return { audio };
}
async function ideogram(prompt, options = {}) {
    const query = requireQuery(prompt, 'Image prompt');
    return { image: await mediaUrl('NEXRAY_API_BASE', '/ai/ideogram', { prompt: query }, { ...options, head: false }) };
}
// ---- Pinterest (Omega -> Nexray -> Azbry) ----
async function pinterestAzbry(query, options = {}) {
    const data = await request('AZBRY_API_BASE', '/api/search/pinterest', { q: query }, options);
    const rows = list(data).map(r => ({ image: httpsUrl(r.image), title: r.title || query, url: httpsUrl(r.source) })).filter(r => r.image).slice(0, 3);
    if (!rows.length) throw new Error('Azbry: no Pinterest images');
    return rows;
}
async function pinterest(query, options = {}) {
    const tasks = [async () => {
        const data = await request('OMEGA_API_BASE', '/api/Search/pinterest', { query, limit: 3 }, options);
        const rows = list(data).map(r => ({ image: httpsUrl(r.image), title: r.title || query, url: httpsUrl(r.pinUrl) })).filter(r => r.image);
        if (!rows.length) throw new Error('Omega: no Pinterest images');
        return rows;
    }];
    if (process.env.EXTRA_PROVIDERS !== 'false') {
        tasks.push(async () => {
            const data = await request('NEXRAY_API_BASE', '/search/pinterest', { q: query }, options);
            const rows = list(data).map(r => ({ image: httpsUrl(r.images_url), title: r.grid_title || query, url: httpsUrl(r.pin) })).filter(r => r.image).slice(0, 3);
            if (!rows.length) throw new Error('Nexray: no Pinterest images');
            return rows;
        });
        tasks.push(async () => pinterestAzbry(query, options));
    }
    return fallback(tasks);
}
async function kyioTiktokSearch(query, options = {}) {
    const data = await kyioRequest('/api/tiktok', { q: query }, options);
    const r = data?.result || {};
    const video = httpsUrl(r.video?.no_watermark);
    if (!video) throw new Error('Kyio: no playable TikTok video');
    return [{ video, title: r.title || 'TikTok', views: r.stats?.views ?? '?', author: r.author?.unique_id || '' }];
}
async function tiktokSearch(query, options = {}) {
    return fallback([
        async () => {
            const data = await request('NEXRAY_API_BASE', '/search/tiktok', { q: query }, options);
            const rows = list(data).map(r => ({ video: httpsUrl(r.data), title: r.title || 'TikTok', views: r.stats?.views || '?' })).filter(r => r.video).slice(0, 3);
            if (!rows.length) throw new Error('No playable TikTok results');
            return rows;
        },
        async () => kyioTiktokSearch(query, options),
    ]);
}
async function tiktokDownload(input, options = {}) {
    const url = new URL(String(input).trim());
    if (url.protocol !== 'https:' || !(url.hostname === 'tiktok.com' || url.hostname.endsWith('.tiktok.com'))) throw new Error('Invalid TikTok URL');
    return fallback([
        async () => {
            const data = await request('NEXRAY_API_BASE', '/downloader/tiktok', { url: url.href }, options);
            const video = httpsUrl(data?.result?.data);
            if (!video) throw new Error('Nexray: no playable TikTok video');
            return { video, title: data.result.title || 'TikTok' };
        },
        async () => {
            const data = await request('AZBRY_API_BASE', '/api/download/tiktok', { url: url.href }, options);
            const links = Array.isArray(data?.result?.links) ? data.result.links : [];
            const video = httpsUrl(links[0]);
            if (!video) throw new Error('Azbry: no playable TikTok video');
            return { video, title: data.result.title || 'TikTok', audio: httpsUrl(data.result.music?.url) };
        },
        async () => {
            // Legacy tikwm fallback, moved from the old case.js 'tt' handler.
            const res = await (options.fetch || fetch)('https://www.tikwm.com/api/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ url: url.href, count: '12', cursor: '0', hd: '1' }),
                signal: AbortSignal.timeout(options.timeout || 15000),
            });
            if (!res.ok) throw new Error(`tikwm: HTTP ${res.status}`);
            const d = (await res.json())?.data;
            const video = httpsUrl(d?.hdplay || d?.play);
            if (!video) throw new Error('tikwm: no playable TikTok video');
            return { video, title: d?.title || 'TikTok', audio: httpsUrl(d?.music) };
        },
        async () => {
            const data = await kyioRequest('/api/tiktok', { url: url.href }, options);
            const r = data?.result || {};
            const video = httpsUrl(r.video?.no_watermark);
            if (!video) throw new Error('Kyio: no playable TikTok video');
            return { video, title: r.title || 'TikTok', audio: httpsUrl(r.music?.url) };
        },
    ]);
}
// ---- YouTube / music downloaders ----
function youtubeId(input) {
    try {
        const u = new URL(String(input).trim());
        if (u.hostname === 'youtu.be') return u.pathname.replace(/^\//, '').split('/')[0];
        return u.searchParams.get('v') || '';
    } catch (_) { return ''; }
}
// ---- Kyio + Omega YouTube downloaders (fallbacks for ytaudio/ytvid) ----
// Signed download URLs expire (Omega ~10 min) — fetched and forwarded
// immediately, never stored.
async function kyioYtFast(url, options = {}) {
    const data = await kyioRequest('/api/v2/downloader/yt-fast', { url }, options);
    const r = data?.result || {};
    const media = Array.isArray(r.media) ? r.media : [];
    const audio = httpsUrl(r.audio) || httpsUrl(media.find(m => m.type === 'audio')?.url);
    const video = httpsUrl(r.video) || httpsUrl(media.find(m => m.type === 'video')?.url);
    if (!audio && !video) throw new Error('Kyio yt-fast: no media links');
    return { audio, video, title: r.title || 'YouTube', duration: r.duration };
}
async function kyioYtdl(url, options = {}) {
    // Flaky: the probe saw one 25 s timeout, then success in 2 s on retry.
    // Param is `q`, not `url`.
    let data;
    try {
        data = await kyioRequest('/api/v2/ytdl', { q: url }, options);
    } catch (e) {
        if (e.name === 'TimeoutError' || /timeout|timed out|abort/i.test(e.message)) {
            data = await kyioRequest('/api/v2/ytdl', { q: url }, options);
        } else throw e;
    }
    const r = data?.result || {};
    const media = Array.isArray(r.media) ? r.media : [];
    const audio = httpsUrl(media.find(m => m.type === 'audio')?.url);
    const video = httpsUrl(media.find(m => m.type === 'video')?.url);
    if (!audio && !video) throw new Error('Kyio ytdl: no media links');
    return { audio, video, title: r.title || 'YouTube', thumbnail: httpsUrl(r.thumbnail) };
}
async function omegaYouTube(url, options = {}) {
    const data = await request('OMEGA_API_BASE', '/api/download/YouTube', { action: 'download', url, type: 'video', quality: 720 }, options);
    const r = data?.data || {};
    const video = httpsUrl(r.video?.downloadUrl);
    const audio = httpsUrl(r.audio?.mp3?.downloadUrl);
    if (!audio && !video) throw new Error('Omega YouTube: no download links');
    return { audio, video, title: r.title || 'YouTube' };
}
async function omegaYouplay(url, options = {}) {
    const data = await request('OMEGA_API_BASE', '/api/download/Youplay', { action: 'url', url }, options);
    const r = data?.data || {};
    const video = httpsUrl(r.video);
    const audio = httpsUrl(r.audio);
    if (!audio && !video) throw new Error('Omega Youplay: no media links');
    return { audio, video, title: r.title || 'YouTube', duration: r.duration };
}
async function omegaYtultra(url, options = {}) {
    const id = youtubeId(url);
    if (!id) throw new Error('Omega ytultra: could not parse YouTube video ID');
    const data = await request('OMEGA_API_BASE', '/api/download/ytultra', { action: 'download', url: id }, options);
    const r = data?.data || {};
    const mp4 = Array.isArray(r.mp4) ? r.mp4 : [];
    const mp3 = Array.isArray(r.mp3) ? r.mp3 : [];
    const video = httpsUrl(mp4[0]?.url);
    const audio = httpsUrl(mp3[0]?.url);
    if (!audio && !video) throw new Error('Omega ytultra: no media links');
    return { audio, video, title: r.title || 'YouTube' };
}
async function omegaYtLite(url, options = {}) {
    const id = youtubeId(url);
    if (!id) throw new Error('Omega Yt-lite: could not parse YouTube video ID');
    const data = await request('OMEGA_API_BASE', '/api/download/Yt-lite', { action: 'info', url: id }, options);
    const r = data?.data || {};
    // Prefer mp4/m4a streams (WhatsApp-friendly); direct googlevideo URLs.
    const pick = rows => {
        const entries = (Array.isArray(rows) ? rows : []).filter(x => httpsUrl(x.url));
        return httpsUrl(entries.find(x => /mp4/i.test(x.mimeType || ''))?.url) || httpsUrl(entries[0]?.url);
    };
    const audio = pick(r.audio);
    const video = pick(r.video);
    if (!audio && !video) throw new Error('Omega Yt-lite: no streams');
    return { audio, video, title: r.title || 'YouTube', duration: r.durationSeconds };
}
async function omegaDownloadAll(url, options = {}) {
    const data = await request('OMEGA_API_BASE', '/api/download/all', { action: 'resolve', url, quality: 720 }, options);
    const r = data?.data || {};
    const video = httpsUrl((Array.isArray(r.video) ? r.video : [])[0]?.url);
    const audio = httpsUrl((Array.isArray(r.audio) ? r.audio : [])[0]?.url);
    if (!audio && !video) throw new Error('Omega download/all: no media links');
    return { audio, video, title: r.title || 'YouTube' };
}
async function omegaAllDownloaderV2(url, options = {}) {
    const data = await request('OMEGA_API_BASE', '/api/download/All-downloader-v2', { action: 'resolve', url }, options);
    const video = httpsUrl(data?.data?.videoUrl);
    if (!video) throw new Error('Omega All-downloader-v2: no video link');
    return { video, title: data.data.title || 'YouTube' };
}
async function youtubeMp3(input, options = {}) {
    const url = requireHost(input, ['youtube.com', 'youtu.be'], 'YouTube URL');
    const audioOnly = (label, fn) => async () => {
        const r = await fn(url, options);
        if (!r.audio) throw new Error(`${label}: no audio link`);
        return { audio: r.audio, title: r.title || 'YouTube audio', duration: r.duration };
    };
    return fallback([
        // ytmp3pc converter API first (shozi's scraper, live-verified 2026-11-19).
        async () => {
            const r = await ytmp3pc.getYouTubeAudioUrl(url, options);
            if (!r.audio) throw new Error('ytmp3pc: no mp3 link');
            return { audio: r.audio, title: r.title || 'YouTube audio', duration: r.duration };
        },
        async () => {
            const data = await request('NEXRAY_API_BASE', '/downloader/ytmp3', { url }, options);
            const audio = httpsUrl(data?.result?.url);
            if (!audio) throw new Error('Nexray: no mp3 link');
            return { audio, title: data.result.title || 'YouTube audio', duration: data.result.duration, filesize: data.result.filesize };
        },
        async () => {
            const data = await request('FAA_API_BASE', '/faa/ytmp3', { url }, options);
            const audio = httpsUrl(data?.result?.mp3);
            if (!audio) throw new Error('FAA: no mp3 link');
            return { audio, title: data.result.title || 'YouTube audio', duration: data.result.duration, thumbnail: httpsUrl(data.result.thumbnail) };
        },
        audioOnly('Omega YouTube', omegaYouTube),
        audioOnly('Omega download/all', omegaDownloadAll),
        audioOnly('Omega ytultra', omegaYtultra),
        audioOnly('Kyio yt-fast', kyioYtFast),
        audioOnly('Kyio ytdl', kyioYtdl),
        audioOnly('Omega Youplay', omegaYouplay),
        audioOnly('Omega Yt-lite', omegaYtLite),
    ]);
}
async function youtubeMp4(input, options = {}) {
    const url = requireHost(input, ['youtube.com', 'youtu.be'], 'YouTube URL');
    const videoOnly = (label, fn) => async () => {
        const r = await fn(url, options);
        if (!r.video) throw new Error(`${label}: no video link`);
        return { video: r.video, title: r.title || 'YouTube video', duration: r.duration, thumbnail: httpsUrl(r.thumbnail) };
    };
    return fallback([
        // ytmp3pc converter API first (shozi's scraper, live-verified 2026-11-19).
        async () => {
            const r = await ytmp3pc.getYouTubeVideoUrl(url, options);
            if (!r.video) throw new Error('ytmp3pc: no mp4 link');
            return { video: r.video, title: r.title || 'YouTube video', duration: r.duration };
        },
        async () => {
            const data = await request('NEXRAY_API_BASE', '/downloader/savetube', { url, quality: 720 }, options);
            const video = httpsUrl(data?.result?.url);
            if (!video) throw new Error('Nexray: no mp4 link');
            return { video, title: data.result.title || 'YouTube video', duration: data.result.duration, thumbnail: httpsUrl(data.result.thumbnail) };
        },
        async () => {
            const data = await request('FAA_API_BASE', '/faa/ytmp4', { url }, options);
            const video = httpsUrl(data?.result?.download_url);
            if (!video) throw new Error('FAA: no mp4 link');
            return { video, title: 'YouTube video', format: data.result.format || 'mp4' };
        },
        videoOnly('Omega YouTube', omegaYouTube),
        videoOnly('Omega download/all', omegaDownloadAll),
        videoOnly('Omega All-downloader-v2', omegaAllDownloaderV2),
        videoOnly('Omega ytultra', omegaYtultra),
        videoOnly('Kyio yt-fast', kyioYtFast),
        videoOnly('Kyio ytdl', kyioYtdl),
        videoOnly('Omega Youplay', omegaYouplay),
        videoOnly('Omega Yt-lite', omegaYtLite),
    ]);
}
async function faaYtPlay(query, options = {}) {
    const q = requireQuery(query, 'Song query');
    const data = await request('FAA_API_BASE', '/faa/ytplay', { query: q }, options);
    const audio = httpsUrl(data?.result?.mp3);
    if (!audio) throw new Error('FAA: no mp3 link');
    return { audio, title: data.result.title || q, url: httpsUrl(data.result.url), thumbnail: httpsUrl(data.result.thumbnail), duration: data.result.duration_timestamp || data.result.duration };
}
async function kyioSpotifyPlay(query, options = {}) {
    // Search by song name — no Spotify URL needed.
    const data = await kyioRequest('/api/dl/spotify-play', { q: query }, options);
    const r = data?.result || {};
    const audio = httpsUrl(r.download_url);
    if (!audio) throw new Error('Kyio: no Spotify audio link');
    return { audio, title: r.title || query, artist: r.artist || '', thumbnail: httpsUrl(r.cover), url: httpsUrl(r.url) };
}
async function spotifyPlay(query, options = {}) {
    const q = requireQuery(query, 'Song query');
    return fallback([
        async () => {
            const data = await request('NEXRAY_API_BASE', '/downloader/spotifyplay', { q }, options);
            const audio = httpsUrl(data?.result?.download_url);
            if (!audio) throw new Error('Nexray: no Spotify audio link');
            return { audio, title: data.result.title || q, artist: data.result.artist || '', thumbnail: httpsUrl(data.result.thumbnail), duration: data.result.duration };
        },
        async () => kyioSpotifyPlay(q, options),
    ]);
}
async function kyioSpotifyDownload(url, options = {}) {
    // `q` must be a Spotify URL — a plain song name is rejected.
    const data = await kyioRequest('/api/downloader/spotify', { q: url }, options);
    const r = data?.result || {};
    const audio = httpsUrl(r.download_url);
    if (!audio) throw new Error('Kyio: no Spotify audio link');
    return { audio, title: r.title || 'Spotify track', artist: r.artist || '', cover: httpsUrl(r.cover) };
}
async function spotifyDownload(input, options = {}) {
    const url = requireHost(input, ['open.spotify.com', 'spotify.com'], 'Spotify URL');
    return fallback([
        async () => {
            const data = await request('AZBRY_API_BASE', '/api/download/spotify', { url }, options);
            const rel = data?.downloadLink || data?.rawLink || '';
            const audio = httpsUrl(rel.startsWith('/') ? base('AZBRY_API_BASE') + rel : rel);
            if (!audio) throw new Error('Azbry: no Spotify audio link');
            return { audio, title: data.title || 'Spotify track', artist: data.author || '', cover: httpsUrl(data.cover) };
        },
        async () => kyioSpotifyDownload(url, options),
    ]);
}
async function aioDownload(input, options = {}) {
    const url = requireHttpsUrl(input, 'URL');
    const data = await request('NEXRAY_API_BASE', '/downloader/aio', { url }, options);
    const medias = Array.isArray(data?.result?.medias) ? data.result.medias : [];
    const pick = medias.find(m => Number(m.itag) === 22 && httpsUrl(m.url))
        || medias.find(m => Number(m.itag) === 18 && httpsUrl(m.url))
        || medias.find(m => httpsUrl(m.url));
    const video = httpsUrl(pick?.url);
    if (!video) throw new Error('Nexray: no downloadable media');
    return { video, title: data.result.title || 'Download', thumbnail: httpsUrl(data.result.thumbnail), duration: data.result.duration };
}
async function instagramDownload(input, options = {}) {
    const url = requireHost(input, ['instagram.com'], 'Instagram URL');
    return fallback([
        async () => {
            const data = await request('FAA_API_BASE', '/faa/igdl', { url }, options);
            const urls = (Array.isArray(data?.result?.url) ? data.result.url : []).map(httpsUrl).filter(Boolean);
            if (!urls.length) throw new Error('FAA: no Instagram media');
            return { medias: urls.map(u => ({ url: u, type: /\.mp4(\?|$)/i.test(u) ? 'video' : 'image' })) };
        },
        async () => {
            const data = await request('AZBRY_API_BASE', '/api/download/instagram', { url }, options);
            const videos = (Array.isArray(data?.videos) ? data.videos : []).map(httpsUrl).filter(Boolean);
            const images = (Array.isArray(data?.images) ? data.images : []).map(httpsUrl).filter(Boolean);
            const medias = videos.map(u => ({ url: u, type: 'video' })).concat(images.map(u => ({ url: u, type: 'image' })));
            if (!medias.length) throw new Error('Azbry: no Instagram media');
            return { medias };
        },
    ]);
}
async function pinterestDownload(input, options = {}) {
    const url = requireHost(input, ['pinterest.com', 'pin.it'], 'Pinterest URL');
    const data = await request('FAA_API_BASE', '/faa/pin-down', { url }, options);
    const medias = (Array.isArray(data?.result?.medias) ? data.result.medias : [])
        .map(m => ({ url: httpsUrl(m.url), type: m.type === 'video' ? 'video' : 'image' }))
        .filter(m => m.url);
    if (!medias.length) throw new Error('FAA: no Pinterest media');
    return { medias, title: data.result.title || 'Pinterest', thumbnail: httpsUrl(data.result.thumbnail) };
}
// ---- Search ----
async function omegaLyrics(query, options = {}) {
    const data = await request('OMEGA_API_BASE', '/api/tools/lyrics', { query }, options);
    if (data?.found === false || !nonEmpty(data?.lyrics)) throw new Error('Omega: no lyrics found');
    return { title: data.title || query, artist: data.artist || '', album: '', duration: undefined, thumbnail: '', text: data.lyrics.trim() };
}
async function lyrics(query, options = {}) {
    const q = requireQuery(query, 'Lyrics query');
    return fallback([
        async () => {
            const data = await request('NEXRAY_API_BASE', '/search/lyrics', { q }, options);
            const r = data?.result || {};
            const text = r.lyrics?.plain_lyrics;
            if (!nonEmpty(text)) throw new Error('Nexray: no lyrics found');
            return { title: r.title || q, artist: r.artist || '', album: r.lyrics.album_name || '', duration: r.lyrics.duration, thumbnail: httpsUrl(r.thumbnail), text: text.trim() };
        },
        async () => omegaLyrics(q, options),
    ]);
}
async function bingImage(query, options = {}) {
    const q = requireQuery(query, 'Image query');
    const data = await request('NEXRAY_API_BASE', '/search/bingimage', { q }, options);
    const rows = list(data).map(httpsUrl).filter(Boolean).slice(0, 3);
    if (!rows.length) throw new Error('Nexray: no images found');
    return rows;
}
async function faaYoutubeSearch(query, options = {}) {
    const q = requireQuery(query, 'YouTube query');
    const data = await request('FAA_API_BASE', '/faa/youtube', { q }, options);
    const rows = list(data).map(r => ({ title: r.title, channel: r.channel, duration: r.duration, thumbnail: httpsUrl(r.imageUrl), url: httpsUrl(r.link) })).filter(r => r.title && r.url).slice(0, 5);
    if (!rows.length) throw new Error('FAA: no YouTube results');
    return rows;
}
async function omegaSpotifySearch(query, options = {}) {
    const data = await request('OMEGA_API_BASE', '/api/Search/Spotify', { query, type: 'tracks', limit: 5 }, options);
    const rows = (Array.isArray(data?.tracks) ? data.tracks : []).map(r => ({ title: r.title, artist: r.artist, duration: r.duration, thumbnail: httpsUrl(r.thumb), url: httpsUrl(r.url), previewUrl: httpsUrl(r.previewUrl) })).filter(r => r.title && r.url).slice(0, 5);
    if (!rows.length) throw new Error('Omega: no Spotify results');
    return rows;
}
async function spotifySearch(query, options = {}) {
    const q = requireQuery(query, 'Spotify query');
    return fallback([
        async () => {
            const data = await request('NEXRAY_API_BASE', '/search/spotify', { q }, options);
            const rows = list(data).map(r => ({ title: r.title, artist: r.artist, duration: r.duration, thumbnail: httpsUrl(r.thumbnail), url: httpsUrl(r.url) })).filter(r => r.title && r.url).slice(0, 5);
            if (!rows.length) throw new Error('Nexray: no Spotify results');
            return rows;
        },
        async () => omegaSpotifySearch(q, options),
    ]);
}
async function soundcloudSearch(query, options = {}) {
    const q = requireQuery(query, 'SoundCloud query');
    const data = await request('NEXRAY_API_BASE', '/search/soundcloud', { q }, options);
    const rows = list(data).map(r => ({ title: r.title, author: r.author?.name || '', duration: r.duration, thumbnail: httpsUrl(r.thumbnail), url: httpsUrl(r.url) })).filter(r => r.title && r.url).slice(0, 5);
    if (!rows.length) throw new Error('Nexray: no SoundCloud results');
    return rows;
}
async function wallpaperSearch(query, options = {}) {
    const q = requireQuery(query, 'Wallpaper query');
    const data = await request('NEXRAY_API_BASE', '/search/wallcraft', { q }, options);
    const rows = list(data).map(r => ({ image: httpsUrl(r.url), description: r.description || '', author: r.author || '' })).filter(r => r.image).slice(0, 3);
    if (!rows.length) throw new Error('Nexray: no wallpapers found');
    return rows;
}
async function omegaStickerSearch(query, options = {}) {
    const data = await request('OMEGA_API_BASE', '/api/tools/Sticker', { action: 'search', keyword: query }, options);
    const packs = Array.isArray(data?.data?.result?.stickerPacks) ? data.data.result.stickerPacks : [];
    // Huge payload (334 KB) — take the first packs only.
    const rows = packs.slice(0, 5).map(p => {
        const files = Array.isArray(p.resourceFiles) ? p.resourceFiles : [];
        const first = typeof files[0] === 'string' ? files[0] : (files[0]?.fileName || files[0]?.name || '');
        return { name: p.name || 'Sticker pack', author: p.user?.userName || '', stickerCount: files.length, thumbnail: httpsUrl((p.resourceUrlPrefix || '') + first), url: httpsUrl(p.shareUrl) };
    }).filter(r => r.name && r.url);
    if (!rows.length) throw new Error('Omega: no sticker packs found');
    return rows;
}
async function stickerlySearch(query, options = {}) {
    const q = requireQuery(query, 'Sticker query');
    return fallback([
        async () => {
            const data = await request('NEXRAY_API_BASE', '/search/stickerly', { q }, options);
            const rows = list(data).map(r => ({ name: r.name, author: r.author || '', stickerCount: r.sticker_count, thumbnail: httpsUrl(r.thumbnail), url: httpsUrl(r.url) })).filter(r => r.name && r.url).slice(0, 5);
            if (!rows.length) throw new Error('Nexray: no sticker packs found');
            return rows;
        },
        async () => omegaStickerSearch(q, options),
    ]);
}
async function pinterestVideoSearch(query, options = {}) {
    const q = requireQuery(query, 'Pinterest query');
    const data = await request('NEXRAY_API_BASE', '/search/pinterestvideo', { q }, options);
    // video_url is HLS (.m3u8) — not directly sendable; send the thumbnail + link.
    const rows = list(data).map(r => ({ title: r.title || 'Pinterest video', videoUrl: httpsUrl(r.video_url), thumbnail: httpsUrl(r.thumbnail), duration: r.duration })).filter(r => r.thumbnail).slice(0, 3);
    if (!rows.length) throw new Error('Nexray: no Pinterest videos found');
    return rows;
}
async function tiktokPhotoSearch(query, options = {}) {
    const q = requireQuery(query, 'TikTok query');
    const data = await request('NEXRAY_API_BASE', '/search/tiktokphoto', { q }, options);
    const rows = list(data).map(r => ({ title: r.title || 'TikTok photo', image: httpsUrl(r.cover), id: r.id })).filter(r => r.image).slice(0, 3);
    if (!rows.length) throw new Error('Nexray: no TikTok photos found');
    return rows;
}
async function tiktokTrend(options = {}) {
    const data = await request('NEXRAY_API_BASE', '/search/tiktoktrend', { id: 'ID' }, options);
    const rows = list(data).map(r => ({ title: r.title || 'TikTok', image: httpsUrl(r.cover), duration: r.duration })).filter(r => r.image).slice(0, 3);
    if (!rows.length) throw new Error('Nexray: no trending TikToks');
    return rows;
}
async function youtubeSearch(query, options = {}) {
    const data = await request('OMEGA_API_BASE', '/api/Search/yt-mp3', { query, limit: 5 }, options);
    const rows = list(data).filter(r => httpsUrl(r.url)).slice(0, 5);
    if (!rows.length) throw new Error('No YouTube results');
    return rows;
}
async function wikipedia(query, options = {}) {
    const data = await request('NEXRAY_API_BASE', '/search/wikipedia', { q: query }, options);
    const rows = list(data).filter(r => r.title && r.pageid).slice(0, 3);
    if (!rows.length) throw new Error('No Wikipedia results');
    return rows.map(r => ({ title: r.title, text: String(r.snippet || '').replace(/<[^>]*>/g, ''), url: `https://en.wikipedia.org/?curid=${r.pageid}` }));
}
async function weather(query, options = {}) {
    const data = await request('OMEGA_API_BASE', '/api/Search/weather', { action: 'byCity', query, lang: 'en' }, options);
    if (typeof data.data?.current?.temp !== 'number') throw new Error('Weather response missing temperature');
    return data.data;
}
// ---- Tools ----
async function qrCode(text, options = {}) {
    const query = requireQuery(text, 'QR text');
    return { image: await mediaUrl('NEXRAY_API_BASE', '/tools/qrcode', { text: query }, options) };
}
async function removeBg(input, options = {}) {
    const url = requireHttpsUrl(input, 'Image URL');
    return { image: await mediaUrl('NEXRAY_API_BASE', '/tools/removebg', { url }, { ...options, head: false }) };
}
async function remini(input, options = {}) {
    const url = requireHttpsUrl(input, 'Image URL');
    return { image: await mediaUrl('NEXRAY_API_BASE', '/tools/remini', { url }, { ...options, head: false }) };
}
async function upscale(input, options = {}) {
    const url = requireHttpsUrl(input, 'Image URL');
    return { image: await mediaUrl('NEXRAY_API_BASE', '/tools/v1/upscale', { url }, { ...options, head: false }) };
}
async function ytTranscribe(input, options = {}) {
    const url = requireHost(input, ['youtube.com', 'youtu.be'], 'YouTube URL');
    const data = await request('NEXRAY_API_BASE', '/tools/yt-transcribe', { url }, options);
    // NOTE: the payload is under `data`, not `result`.
    const transcript = data?.data?.transcript;
    if (!nonEmpty(transcript)) throw new Error('Nexray: no transcript found');
    return { url: data.data.url || url, transcript: transcript.trim() };
}
async function ytSummarize(input, options = {}) {
    const url = requireHost(input, ['youtube.com', 'youtu.be'], 'YouTube URL');
    const data = await request('NEXRAY_API_BASE', '/tools/v1/youtube-summarize', { url }, options);
    const content = data?.result?.content;
    if (!nonEmpty(content)) throw new Error('Nexray: no summary found');
    return { content: content.trim() }; // Summary is in Indonesian.
}
async function ssweb(input, options = {}) {
    const url = requireHttpsUrl(input, 'URL');
    const data = await request('NEXRAY_API_BASE', '/tools/ssweb', { url }, options);
    const image = httpsUrl(data?.result?.screenshot?.url || data?.result?.file_url);
    if (!image) throw new Error('Nexray: no screenshot');
    return { image, title: data.result.title || url, description: data.result.description || '', url: httpsUrl(data.result.url) || url };
}
async function urlSafety(input, options = {}) {
    const url = requireHttpsUrl(input, 'URL');
    const data = await request('NEXRAY_API_BASE', '/tools/webphishing', { url }, options);
    const r = data?.result;
    if (!r || typeof r.is_phishing !== 'boolean') throw new Error('Nexray: no safety verdict');
    return { url: r.scanned_url || url, isPhishing: r.is_phishing, hasMalware: r.contains_malware, status: r.status_description || '', sendsToHarmful: r.sends_to_harmful_sites, installsMalware: r.installs_malicious_software, uncommonDownloads: r.uncommon_downloads };
}
async function usernameGen(name, options = {}) {
    const n = requireQuery(name, 'Name');
    const mode = options.mode === 'ai' ? 'ai' : 'instans';
    const data = await request('NEXRAY_API_BASE', '/tools/usernamegen', { name: n, mode }, options);
    const rows = (Array.isArray(data?.result?.result) ? data.result.result : []).filter(nonEmpty);
    if (!rows.length) throw new Error('Nexray: no usernames generated');
    return rows.slice(0, 10);
}
// ---- Information (Nexray is Indonesian: prayer times, weather, earthquake,
// news and games return Indonesian data — the commands say so) ----
async function prayerTimes(city, options = {}) {
    const kota = requireQuery(city, 'City');
    const data = await request('NEXRAY_API_BASE', '/information/jadwalsholat', { kota }, options);
    const r = data?.result;
    if (!r?.jadwal?.subuh) throw new Error('Nexray: no prayer times for this city (Indonesian cities only)');
    return { city: r.kota || kota, period: r.periode || '', date: r.tanggal || '', schedule: r.jadwal };
}
async function idWeather(city, options = {}) {
    const kota = requireQuery(city, 'City');
    const data = await request('NEXRAY_API_BASE', '/information/cuaca', { kota }, options);
    const r = data?.result;
    const forecasts = Array.isArray(r?.forecasts) ? r.forecasts : [];
    if (!forecasts.length) throw new Error('Nexray: no weather for this city (Indonesian cities only)');
    return { location: r.location || {}, forecasts: forecasts.slice(0, 4) };
}
async function currencyConvert(input, options = {}) {
    const amount = Number(input?.amount);
    const source = String(input?.source || '').trim().toUpperCase();
    const target = String(input?.target || '').trim().toUpperCase();
    if (!Number.isFinite(amount) || !source || !target) throw new Error('Currency needs <amount> <from> <to> (e.g. 100 USD PKR)');
    const data = await request('NEXRAY_API_BASE', '/information/curs', { amount, source, target }, options);
    if (typeof data?.result?.value !== 'number') throw new Error('Nexray: no conversion result');
    // Live-verified: the endpoint returns the per-unit exchange RATE and ignores
    // the amount (amount=1/50/100 all return the same value), so convert here.
    const rate = data.result.value;
    return { amount, source, target, value: Math.round(rate * amount * 100) / 100, rate };
}
async function earthquake(options = {}) {
    const data = await request('NEXRAY_API_BASE', '/information/gempa', {}, options);
    const r = data?.result;
    if (!r?.Magnitude) throw new Error('Nexray: no earthquake data');
    return { date: r.Tanggal, time: r.Jam, coordinates: r.Coordinates, magnitude: r.Magnitude, depth: r.Kedalaman, area: r.Wilayah, potential: r.Potensi, felt: r.Dirasakan };
}
async function footballFixtures(options = {}) {
    const data = await request('NEXRAY_API_BASE', '/information/jadwalbola', {}, options);
    const rows = list(data).filter(nonEmpty);
    if (!rows.length) throw new Error('Nexray: no fixtures');
    return rows.slice(0, 10);
}
async function githubStalk(username, options = {}) {
    const user = requireQuery(username, 'GitHub username').replace(/^@/, '');
    const data = await request('NEXRAY_API_BASE', '/stalker/github', { username: user }, options);
    const r = data?.result;
    if (!r?.username) throw new Error('Nexray: GitHub user not found');
    return { username: r.username, name: r.nickname || '', bio: r.bio || '', company: r.company || '', location: r.location || '', repos: r.public_repo, url: httpsUrl(r.url), avatar: httpsUrl(r.profile_pic) };
}
// ---- Makers / fun (binary image endpoints) ----
async function textMaker(path, text, options) {
    const query = requireQuery(text, 'Text');
    return { image: await mediaUrl('NEXRAY_API_BASE', path, { text: query }, options) };
}
async function brat(text, options = {}) { return textMaker('/maker/brat', text, options); }
async function ttp(text, options = {}) { return textMaker('/maker/ttp', text, options); }
async function attp(text, options = {}) { return textMaker('/maker/attp', text, options); } // Animated GIF — send with gifPlayback.
async function nulis(text, options = {}) { return textMaker('/maker/nulis', text, options); }
async function blackpink(text, options = {}) { return textMaker('/textpro/blackpink', text, options); }
async function glitch(text, options = {}) { return textMaker('/textpro/glitch', text, options); }
async function codeSnap(code, options = {}) {
    const query = requireQuery(code, 'Code');
    return { image: await mediaUrl('NEXRAY_API_BASE', '/maker/codesnap', { code: query }, options) };
}
const QC_COLORS = ['merah', 'putih', 'hijau', 'biru', 'kuning', 'oranye', 'ungu', 'hitam'];
function quoteParams(input) {
    const text = requireQuery(input?.text, 'Quote text');
    const color = String(input?.color || 'hijau').trim().toLowerCase();
    if (!QC_COLORS.includes(color)) throw new Error(`Color must be one of: ${QC_COLORS.join(', ')}`);
    return { text, name: String(input?.name || 'User').trim() || 'User', avatar: requireHttpsUrl(input?.avatar, 'Avatar URL'), color };
}
async function quoteCard(input, options = {}) {
    return { image: await mediaUrl('NEXRAY_API_BASE', '/maker/qc', quoteParams(input), options) };
}
async function quotly(input, options = {}) {
    return { image: await mediaUrl('NEXRAY_API_BASE', '/canvas/quotly', quoteParams(input), options) };
}
async function musicCard(input, options = {}) {
    const judul = requireQuery(input?.title, 'Song title');
    return { image: await mediaUrl('NEXRAY_API_BASE', '/canvas/musiccard', { judul, nama: String(input?.artist || 'Unknown Artist').trim(), image_url: requireHttpsUrl(input?.image, 'Image URL') }, options) };
}
async function ytThumbnail(input, options = {}) {
    const title = requireQuery(input?.title, 'Video title');
    return { image: await mediaUrl('NEXRAY_API_BASE', '/canvas/youtube', { title, artist: String(input?.artist || '').trim(), coverurl: requireHttpsUrl(input?.cover, 'Cover URL') }, options) };
}
async function ghibli(input, options = {}) {
    const url = requireHttpsUrl(input, 'Image URL');
    return { image: await mediaUrl('NEXRAY_API_BASE', '/ephoto/ghibli', { url }, { ...options, head: false }) };
}
async function wasted(input, options = {}) {
    const url = requireHttpsUrl(input, 'Image URL');
    return { image: await mediaUrl('NEXRAY_API_BASE', '/editor/wasted', { url }, { ...options, head: false }) };
}
async function emojiPng(emoji, options = {}) {
    const e = requireQuery(emoji, 'Emoji');
    return { image: await mediaUrl('NEXRAY_API_BASE', '/tools/emojipedia', { emoji: e }, options) };
}
async function emojiGif(emoji, options = {}) {
    const e = requireQuery(emoji, 'Emoji');
    return { image: await mediaUrl('NEXRAY_API_BASE', '/tools/emojigif', { emoji: e }, options) }; // Animated WebP — send as a sticker.
}
// ---- Games / news / fun ----
async function tekateki(options = {}) {
    const data = await request('NEXRAY_API_BASE', '/games/tekateki', {}, options);
    if (!nonEmpty(data?.result?.soal)) throw new Error('Nexray: no riddle');
    return { question: data.result.soal, answer: data.result.jawaban || '' }; // Indonesian riddle.
}
async function tebakLirik(options = {}) {
    const data = await request('NEXRAY_API_BASE', '/games/tebaklirik', {}, options);
    if (!nonEmpty(data?.result?.soal)) throw new Error('Nexray: no lyrics quiz');
    return { question: data.result.soal, answer: data.result.jawaban || '' }; // Indonesian songs.
}
async function cnnNews(options = {}) {
    const data = await request('NEXRAY_API_BASE', '/berita/cnn', {}, options);
    const rows = list(data).map(r => ({ title: r.title, image: httpsUrl(r.image_full || r.image_thumbnail), url: httpsUrl(r.url || r.link) })).filter(r => r.title).slice(0, 5);
    if (!rows.length) throw new Error('Nexray: no headlines');
    return rows; // CNN Indonesia headlines (Indonesian).
}
async function liveFunFact(birthdate, options = {}) {
    const date = String(birthdate || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Birthdate must be YYYY-MM-DD');
    const data = await request('NEXRAY_API_BASE', '/fun/livefunfact', { birthdate: date }, options);
    const r = data?.result;
    if (!r || typeof r.basic_info?.age_in_days !== 'number') throw new Error('Nexray: no fun facts');
    return r;
}
// ---- Omega AI ----
async function omegaChatbotAI(prompt, options = {}) {
    const query = requireQuery(prompt, 'AI prompt');
    const data = await request('OMEGA_API_BASE', '/api/ai/Chatbot', { action: 'chat', message: query }, options);
    if (!nonEmpty(data?.reply)) throw new Error('Omega Chatbot: empty or invalid AI answer');
    return data.reply.trim();
}
async function omegaChatgptV2AI(prompt, options = {}) {
    const query = requireQuery(prompt, 'AI prompt');
    const data = await request('OMEGA_API_BASE', '/api/ai/Chatgpt-v2', { action: 'chat', message: query }, options);
    if (!nonEmpty(data?.data?.reply)) throw new Error('Omega ChatGPT-v2: empty or invalid AI answer');
    return data.data.reply.trim();
}
async function omegaDeepAI(prompt, options = {}) {
    const query = requireQuery(prompt, 'AI prompt');
    const data = await request('OMEGA_API_BASE', '/api/ai/Deep-ai', { action: 'chat', message: query }, options);
    if (!nonEmpty(data?.data?.reply)) throw new Error('Omega Deep-ai: empty or invalid AI answer');
    return data.data.reply.trim();
}
async function omegaAgentsAI(prompt, options = {}) {
    const query = requireQuery(prompt, 'AI prompt');
    const data = await request('OMEGA_API_BASE', '/api/ai/Agents', { action: 'chat', prompt: query }, options);
    if (!nonEmpty(data?.data?.text)) throw new Error('Omega Agents: empty or invalid AI answer');
    return data.data.text.trim();
}
// ---- Omega AI media ----
async function omegaTxt2Img(prompt, options = {}) {
    const query = requireQuery(prompt, 'Image prompt');
    return { image: await mediaUrl('OMEGA_API_BASE', '/api/ai/Ai', { action: 'txt2img', prompt: query, model: 'flux-schnell', width: 512, height: 512 }, { ...options, head: false }) };
}
async function omegaLogo(prompt, options = {}) {
    const query = requireQuery(prompt, 'Logo keyword');
    const data = await request('OMEGA_API_BASE', '/api/ai/Ai-logo', { action: 'generate', prompt: query, limit: 3 }, options);
    const rows = (Array.isArray(data?.data?.logos) ? data.data.logos : []).map(l => ({ image: httpsUrl(l.imageUrl), designName: l.designName || query })).filter(r => r.image).slice(0, 3);
    if (!rows.length) throw new Error('Omega: no logos generated');
    return rows;
}
async function omegaEnhance(input, options = {}) {
    const url = requireHttpsUrl(input, 'Image URL');
    const data = await request('OMEGA_API_BASE', '/api/ai/Morphai', { action: 'enhance', imageUrl: url }, options);
    const image = httpsUrl(data?.data?.url);
    if (!image) throw new Error('Omega Morphai: no enhanced image');
    return { image };
}
// ---- Omega downloaders (new commands) ----
async function facebookDownload(input, options = {}) {
    const url = requireHost(input, ['facebook.com', 'fb.watch'], 'Facebook URL');
    const data = await request('OMEGA_API_BASE', '/api/download/Facebook', { action: 'resolve', url, quality: 'hd' }, options);
    const video = httpsUrl(data?.data?.directUrl);
    if (!video) throw new Error('Omega: no Facebook video link');
    return { video, videoId: data.data.videoId || '' };
}
async function facebookSearch(query, options = {}) {
    const q = requireQuery(query, 'Facebook query');
    const data = await request('OMEGA_API_BASE', '/api/download/Facebook', { action: 'search', query: q, limit: 5 }, options);
    const rows = (Array.isArray(data?.data?.videos) ? data.data.videos : []).map(v => ({ title: v.title || 'Facebook video', url: httpsUrl(v.url) })).filter(r => r.url).slice(0, 5);
    if (!rows.length) throw new Error('Omega: no Facebook videos found');
    return rows;
}
async function deezerDownload(query, options = {}) {
    const q = requireQuery(query, 'Song query');
    // `url` takes a song title here (fuzzy match — may return a remix).
    const data = await request('OMEGA_API_BASE', '/api/download/Deezer', { action: 'download', url: q, quality: 'MP3_128' }, options);
    const r = data?.data || {};
    const audio = httpsUrl(r.downloadUrl);
    if (!audio) throw new Error('Omega Deezer: no audio link');
    return { audio, title: r.title || q, artist: r.artist || '', album: r.album || '', duration: r.duration || '', thumbnail: httpsUrl(r.thumbnail), sourceUrl: httpsUrl(r.sourceUrl) };
}
async function ytMusicSearch(query, options = {}) {
    const q = requireQuery(query, 'Music query');
    // Search action only — the download action is broken (audio_conversion_failed).
    const data = await request('OMEGA_API_BASE', '/api/download/play', { action: 'search', query: q }, options);
    const r = data?.data || {};
    const rows = [];
    if (r.topResult?.videoId) rows.push({ title: r.topResult.title || q, artist: '', url: httpsUrl(r.topResult.url) || `https://music.youtube.com/watch?v=${r.topResult.videoId}`, top: true });
    for (const s of (Array.isArray(r.songs) ? r.songs : [])) {
        if (s.videoId) rows.push({ title: s.title || q, artist: s.artist || '', url: `https://music.youtube.com/watch?v=${s.videoId}` });
    }
    const out = rows.filter(x => x.url).slice(0, 5);
    if (!out.length) throw new Error('Omega: no YouTube Music results');
    return out;
}
// ---- Omega search (new commands) ----
async function appleMusicSearch(query, options = {}) {
    const q = requireQuery(query, 'Apple Music query');
    const data = await request('OMEGA_API_BASE', '/api/Search/Applemusic', { action: 'search', query: q, limit: 5 }, options);
    const rows = (Array.isArray(data?.data?.results) ? data.data.results : []).map(r => ({ title: r.title, artist: r.artist || '', cover: httpsUrl(r.cover), url: httpsUrl(r.url) })).filter(r => r.title && r.url).slice(0, 5);
    if (!rows.length) throw new Error('Omega: no Apple Music results');
    return rows;
}
async function pixivSearch(query, options = {}) {
    const q = requireQuery(query, 'Pixiv query');
    // ALWAYS mode=safe — Pixiv hosts R18 content; never use mode=r18.
    const data = await request('OMEGA_API_BASE', '/api/Search/Pixv', { action: 'search', query: q, mode: 'safe', randomPick: false }, options);
    const r = data?.data?.result || {};
    const images = (Array.isArray(r.images) ? r.images : []).map(httpsUrl).filter(Boolean).slice(0, 3);
    if (!images.length) throw new Error('Omega: no Pixiv artwork found');
    const tags = (Array.isArray(r.tags) ? r.tags : []).map(t => typeof t === 'string' ? t : (t?.name || '')).filter(Boolean).slice(0, 8);
    return { images, title: r.title || q, author: r.author || '', tags };
}
async function mcpeSearch(query, options = {}) {
    const q = requireQuery(query, 'Minecraft query');
    const data = await request('OMEGA_API_BASE', '/api/Search/Mcpedl', { action: 'search', query: q }, options);
    const rows = list(data).map(r => ({ title: r.title, url: httpsUrl(r.url), summary: r.summary || '', downloads: r.downloads_count, rating: r.rating, author: r.author || '' })).filter(r => r.title && r.url).slice(0, 5);
    if (!rows.length) throw new Error('Omega: no Minecraft addons found');
    return rows;
}
async function teleStickerSearch(query, options = {}) {
    const q = requireQuery(query, 'Sticker query');
    const data = await request('OMEGA_API_BASE', '/api/Search/Tele-sticker', { action: 'search', keyword: q }, options);
    const packs = Array.isArray(data?.data?.packs) ? data.data.packs : [];
    // Huge payload (172 KB) — take the first packs only.
    const rows = packs.slice(0, 5).map(p => ({ title: p.title || 'Sticker pack', telegramUrl: httpsUrl(p.telegramUrl), cover: httpsUrl(p.cover?.url) })).filter(r => r.telegramUrl);
    if (!rows.length) throw new Error('Omega: no Telegram sticker packs found');
    return rows;
}
async function tiktokUserSearch(query, options = {}) {
    const q = requireQuery(query, 'TikTok query');
    const data = await request('OMEGA_API_BASE', '/api/Search/Tiktok-Search', { action: 'search', query: q, limit: 5 }, options);
    // Only data.users[] works — videos[] came back empty in the probe.
    const rows = (Array.isArray(data?.data?.users) ? data.data.users : []).map(u => ({ uniqueId: u.uniqueId, nickname: u.nickname || u.uniqueId, signature: u.signature || '', verified: !!u.verified, avatar: httpsUrl(u.avatar) })).filter(r => r.uniqueId).slice(0, 5);
    if (!rows.length) throw new Error('Omega: no TikTok users found');
    return rows;
}
async function findSong(query, options = {}) {
    const q = requireQuery(query, 'Lyrics snippet');
    const data = await request('OMEGA_API_BASE', '/api/Search/searchthatsong', { action: 'search', query: q }, options);
    const r = data?.data || {};
    // lyrics/album/genre were null in the probe — song/artist/preview only.
    if (!nonEmpty(r.song)) throw new Error('Omega: no song identified');
    return { song: r.song, artist: r.artist || '', previewUrl: httpsUrl(r.previewUrl) };
}
// ---- Omega tools / fun (new commands) ----
const IMAGE_FORMATS = ['jpeg', 'jpg', 'png', 'webp', 'avif', 'gif', 'bmp', 'tiff', 'ico', 'svg', 'pdf', 'heic'];
async function imageConvert(input, options = {}) {
    const url = requireHttpsUrl(input?.url, 'Image URL');
    const from = String(input?.from || '').trim().toLowerCase();
    const to = String(input?.to || '').trim().toLowerCase();
    if (!IMAGE_FORMATS.includes(from) || !IMAGE_FORMATS.includes(to)) throw new Error(`Formats must be one of: ${IMAGE_FORMATS.join(', ')}`);
    const data = await request('OMEGA_API_BASE', '/api/tools/Image-converter', { fileUrl: url, from, to }, options);
    const file = httpsUrl(data?.resultUrl);
    if (!file) throw new Error('Omega: no converted file');
    return { file, filename: data.outputFilename || `converted.${to}`, mimeType: data.mimeType || '', from, to };
}
async function shazamRecognize(input, options = {}) {
    const url = requireHttpsUrl(input, 'Audio URL');
    const data = await request('OMEGA_API_BASE', '/api/Fun/Shazam', { action: 'recognize', url }, options);
    const r = data?.data || {};
    if (!r.matched || !r.track?.title) throw new Error('Omega Shazam: no match for this audio');
    const t = r.track;
    return { title: t.title, artist: t.artist || '', album: t.album || '', label: t.label || '', year: t.release_year || '', genres: Array.isArray(t.genres) ? t.genres : [], cover: httpsUrl(t.cover), lyrics: t.lyrics || '', spotifyUrl: httpsUrl(t.spotify_url), appleMusicUrl: httpsUrl(t.apple_music_url) };
}
async function webtoonSearch(query, options = {}) {
    const q = requireQuery(query, 'Webtoon query');
    const data = await request('OMEGA_API_BASE', '/api/Fun/webtoon', { action: 'search', query: q }, options);
    const rows = (Array.isArray(data?.data?.results) ? data.data.results : []).map(r => ({ title: r.title, genre: r.genre || '', thumbnail: httpsUrl(r.thumbnail), authors: Array.isArray(r.authors) ? r.authors : [], readCount: r.readCount, url: r.url ? `https://www.webtoons.com${r.url}` : '' })).filter(r => r.title).slice(0, 5);
    if (!rows.length) throw new Error('Omega: no webtoons found');
    return rows;
}
async function antinsfw(input, options = {}) {
    const url = requireHttpsUrl(input, 'Image URL');
    const data = await kyioRequest('/api/v2/tools/antinsfw', { url }, options);
    const r = data?.result || {};
    if (typeof r.isNsfw !== 'boolean' && typeof r.is_nsfw !== 'boolean') throw new Error('Kyio: no moderation verdict');
    return { isNsfw: r.isNsfw ?? r.is_nsfw, label: r.label || '', confidence: r.confidence || '', score: r.score, action: r.action || '', violations: Array.isArray(r.violations) ? r.violations : [] };
}
// ---- Omega makers (binary image endpoints — URLs only, never bytes) ----
async function quoteCanvas(input, options = {}) {
    const quote = requireQuery(input?.quote, 'Quote text');
    return { image: await mediaUrl('OMEGA_API_BASE', '/api/Maker/quote-canvas', { quote, author: String(input?.author || '').trim() }, { ...options, head: false }) };
}
async function avengersLogo(input, options = {}) {
    const text1 = requireQuery(input?.text1, 'Text 1');
    return { image: await mediaUrl('OMEGA_API_BASE', '/api/Maker/avengers', { text1, text2: String(input?.text2 || '').trim() }, { ...options, head: false }) };
}
async function narutoLogo(text, options = {}) {
    const query = requireQuery(text, 'Text');
    return { image: await mediaUrl('OMEGA_API_BASE', '/api/Maker/naruto', { text: query }, { ...options, head: false }) };
}
async function bountyPoster(input, options = {}) {
    const image = requireHttpsUrl(input?.image, 'Image URL');
    const text = requireQuery(input?.text, 'Name');
    return { image: await mediaUrl('OMEGA_API_BASE', '/api/Maker/Bounty', { action: 'generate', image, text }, { ...options, head: false }) };
}
async function musicFrame(input, options = {}) {
    const title = requireQuery(input?.title, 'Song title');
    return { image: await mediaUrl('OMEGA_API_BASE', '/api/Maker/Music', { action: 'generate', image: requireHttpsUrl(input?.image, 'Image URL'), title, artist: String(input?.artist || '').trim() }, { ...options, head: false }) };
}
async function watermarkImage(input, options = {}) {
    const image = requireHttpsUrl(input?.image, 'Image URL');
    const text = requireQuery(input?.text, 'Watermark text');
    return { image: await mediaUrl('OMEGA_API_BASE', '/api/Maker/watermark', { action: 'watermark', image, text }, { ...options, head: false }) };
}
function decodeEntities(text) {
    return String(text || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}
async function asciiArt(input, options = {}) {
    const url = requireHttpsUrl(input, 'Image URL');
    const data = await request('OMEGA_API_BASE', '/api/Maker/ascii', { url }, options);
    const art = decodeEntities(data?.result);
    if (!nonEmpty(art)) throw new Error('Omega: no ASCII art');
    return { text: art.trim() };
}
async function ephoto(input, options = {}) {
    const text = requireQuery(input?.text, 'Text');
    const effectQuery = requireQuery(input?.effect, 'Effect');
    const search = await request('OMEGA_API_BASE', '/api/Maker/Ephoto', { action: 'search', query: effectQuery }, options);
    const effects = Array.isArray(search) ? search : (Array.isArray(search?.data) ? search.data : []);
    const effect = effects.find(e => httpsUrl(e.url));
    if (!effect) throw new Error(`Omega: no ePhoto effect found for "${effectQuery}"`);
    const data = await request('OMEGA_API_BASE', '/api/Maker/Ephoto', { action: 'generate', effect: effect.url, texts: text }, options);
    const image = httpsUrl(data?.data?.image_url);
    if (!image) throw new Error('Omega: ePhoto generation failed');
    return { image, effectTitle: effect.title || effectQuery };
}
// ---- Omega sports ----
async function sportsNews(options = {}) {
    const data = await request('OMEGA_API_BASE', '/api/Sport/sport-trend', { page: 1, perPage: 5 }, options);
    const rows = (Array.isArray(data?.news) ? data.news : []).map(n => ({ title: n.title, summary: n.summary || '', category: n.category || '', cover: httpsUrl(n.cover), createdAt: n.createdAt || '' })).filter(r => r.title).slice(0, 5);
    if (!rows.length) throw new Error('Omega: no sports news');
    return rows;
}
async function sportLeagues(options = {}) {
    const data = await request('OMEGA_API_BASE', '/api/Sport/Sport', { action: 'leagues' }, options);
    const rows = (Array.isArray(data?.data?.leagues) ? data.data.leagues : []).map(l => ({ id: l.id, name: l.name || l.localName || '' })).filter(r => r.name).slice(0, 20);
    if (!rows.length) throw new Error('Omega: no leagues found');
    return rows;
}
async function health(options = {}) {
    return Promise.all(Object.keys(DEFAULTS).map(async name => {
        const start = Date.now();
        try {
            if (name === 'KYIO_API_BASE') await askAI('Reply with hello', { ...options, provider: 'kyio' });
            else if (name === 'OMEGA_API_BASE') await youtubeSearch('NASA', options);
            else if (name === 'NEXRAY_API_BASE') await wikipedia('NASA', options);
            // Azbry + FAA homepages are Cloudflare-403 from datacenter IPs,
            // so check them with a real API route instead of '/'.
            else if (name === 'AZBRY_API_BASE') await pinterestAzbry('cat', options);
            else if (name === 'FAA_API_BASE') await faaYoutubeSearch('lofi', options);
            else {
                const r = await (options.fetch || fetch)(base(name), { signal: AbortSignal.timeout(options.timeout || 15000) });
                return `${name}: HTTP ${r.status} — no verified integration`;
            }
            return `${name}: OK (${Date.now() - start}ms)`;
        } catch (e) { return `${name}: ${e.message}`; }
    }));
}
module.exports = {
    askAI, pinterest, pinterestAzbry, tiktokSearch, tiktokDownload, youtubeSearch, wikipedia, weather, health, extractAnswer, DEFAULTS,
    nexrayAI, claudeAI, geminiAI, grammarCheck, geminiTTS, ideogram,
    claudeHaikuAI, deepseekFlashAI, gpt41AI, kyioChatAI, chataiAI, geminiChatAI, freeAI, s5AI, maritacaAI,
    omegaChatbotAI, omegaChatgptV2AI, omegaDeepAI, omegaAgentsAI, omegaTxt2Img, omegaLogo, omegaEnhance,
    youtubeMp3, youtubeMp4, faaYtPlay, spotifyPlay, spotifyDownload, aioDownload, instagramDownload, pinterestDownload,
    kyioYtFast, kyioYtdl, omegaYouTube, omegaYouplay, omegaYtultra, omegaYtLite, omegaDownloadAll, omegaAllDownloaderV2,
    kyioSpotifyPlay, kyioSpotifyDownload, kyioTiktokSearch, omegaLyrics, omegaSpotifySearch, omegaStickerSearch,
    facebookDownload, facebookSearch, deezerDownload, ytMusicSearch,
    lyrics, bingImage, faaYoutubeSearch, spotifySearch, soundcloudSearch, wallpaperSearch, stickerlySearch,
    pinterestVideoSearch, tiktokPhotoSearch, tiktokTrend,
    appleMusicSearch, pixivSearch, mcpeSearch, teleStickerSearch, tiktokUserSearch, findSong,
    qrCode, removeBg, remini, upscale, ytTranscribe, ytSummarize, ssweb, urlSafety, usernameGen,
    imageConvert, shazamRecognize, webtoonSearch, antinsfw,
    prayerTimes, idWeather, currencyConvert, earthquake, footballFixtures, githubStalk,
    brat, ttp, attp, nulis, blackpink, glitch, codeSnap, quoteCard, quotly, musicCard, ytThumbnail,
    ghibli, wasted, emojiPng, emojiGif,
    quoteCanvas, avengersLogo, narutoLogo, bountyPoster, musicFrame, watermarkImage, asciiArt, ephoto,
    tekateki, tebakLirik, cnnNews, liveFunFact, sportsNews, sportLeagues,
};
