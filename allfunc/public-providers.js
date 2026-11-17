'use strict';

// Only documented endpoints with successful live response validation are enabled.
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
        if (provider === 'kyio') data = await request('KYIO_API_BASE', '/api/ai/deepseek-r1', { q: query }, options);
        else if (provider === 'omega') data = await request('OMEGA_API_BASE', '/api/ai/Deepseek', { message: query, model: 'v32' }, options);
        else throw new Error('Unsupported AI provider');
        const answer = extractAnswer(data);
        if (!answer) throw new Error(`${provider}: empty or invalid AI answer`);
        return answer;
    }));
}
async function pinterest(query, options = {}) {
    const tasks = [async () => {
        const data = await request('OMEGA_API_BASE', '/api/Search/pinterest', { query, limit: 3 }, options);
        const rows = list(data).map(r => ({ image: httpsUrl(r.image), title: r.title || query, url: httpsUrl(r.pinUrl) })).filter(r => r.image);
        if (!rows.length) throw new Error('Omega: no Pinterest images');
        return rows;
    }];
    if (process.env.EXTRA_PROVIDERS !== 'false') tasks.push(async () => {
        const data = await request('NEXRAY_API_BASE', '/search/pinterest', { q: query }, options);
        const rows = list(data).map(r => ({ image: httpsUrl(r.images_url), title: r.grid_title || query, url: httpsUrl(r.pin) })).filter(r => r.image).slice(0, 3);
        if (!rows.length) throw new Error('Nexray: no Pinterest images');
        return rows;
    });
    return fallback(tasks);
}
async function tiktokSearch(query, options = {}) {
    const data = await request('NEXRAY_API_BASE', '/search/tiktok', { q: query }, options);
    const rows = list(data).map(r => ({ video: httpsUrl(r.data), title: r.title || 'TikTok', views: r.stats?.views || '?' })).filter(r => r.video).slice(0, 3);
    if (!rows.length) throw new Error('No playable TikTok results');
    return rows;
}
async function tiktokDownload(input, options = {}) {
    const url = new URL(String(input).trim());
    if (url.protocol !== 'https:' || !(url.hostname === 'tiktok.com' || url.hostname.endsWith('.tiktok.com'))) throw new Error('Invalid TikTok URL');
    const data = await request('NEXRAY_API_BASE', '/downloader/tiktok', { url: url.href }, options);
    const result = data.result;
    const video = httpsUrl(result?.data);
    if (!video) throw new Error('No playable TikTok video');
    return { video, title: result.title || 'TikTok' };
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
async function health(options = {}) {
    return Promise.all(Object.keys(DEFAULTS).map(async name => {
        const start = Date.now();
        try {
            if (name === 'KYIO_API_BASE') await askAI('Reply with hello', { ...options, provider: 'kyio' });
            else if (name === 'OMEGA_API_BASE') await youtubeSearch('NASA', options);
            else if (name === 'NEXRAY_API_BASE') await wikipedia('NASA', options);
            else {
                const r = await (options.fetch || fetch)(base(name), { signal: AbortSignal.timeout(options.timeout || 15000) });
                return `${name}: HTTP ${r.status} — no verified integration`;
            }
            return `${name}: OK (${Date.now() - start}ms)`;
        } catch (e) { return `${name}: ${e.message}`; }
    }));
}
module.exports = { askAI, pinterest, tiktokSearch, tiktokDownload, youtubeSearch, wikipedia, weather, health, extractAnswer, DEFAULTS };