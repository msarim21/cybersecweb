const axios = require('axios');
const { spawn } = require('child_process');

const PRINCE_AI_BASE = 'https://api.princetechn.com/api/ai';
const PRINCE_AI_KEY = 'prince';

const ENDPOINTS = {
    openai: 'openai',
    // PrinceTech's currently working text endpoint is OpenAI. Keep the
    // provider names as public aliases so every AI command has one stable
    // implementation and does not break when the optional model routes
    // return 404/500.
    gemini: 'openai',
    deepseek: 'openai',
};

function normalizeResult(data) {
    if (typeof data === 'string') return data.trim();
    if (!data || typeof data !== 'object') return '';
    if (data.error && typeof data.error === 'string') return '';

    const candidates = [
        data.result,
        data.response,
        data.answer,
        data.data,
        data.message,
        data.text,
    ];

    for (const value of candidates) {
        if (typeof value === 'string' && value.trim()) return value.trim();
        if (value && typeof value === 'object') {
            if (typeof value.error === 'string') continue;
            const nested = normalizeResult(value);
            if (nested) return nested;
        }
    }

    return '';
}

// PrinceTech is the primary provider; when it is down (it has gone offline
// before) every AI command falls back to Pollinations' free text endpoint.
const FALLBACK_TEXT_BASE = 'https://text.pollinations.ai';
const FALLBACK_MODELS = { openai: 'openai', gemini: 'openai', deepseek: 'deepseek' };

async function askPrinceTech(provider, query, options) {
    const endpoint = ENDPOINTS[provider] || ENDPOINTS.openai;
    const { data } = await axios.get(`${PRINCE_AI_BASE}/${endpoint}`, {
        params: { apikey: PRINCE_AI_KEY, q: query },
        timeout: options.primaryTimeout || 15000,
        validateStatus: status => status >= 200 && status < 300,
    });
    const answer = normalizeResult(data);
    if (!answer || answer.startsWith('<')) throw new Error(`PrinceTech ${provider} API returned no answer`);
    return answer;
}

async function askFallback(provider, query, options) {
    const model = FALLBACK_MODELS[provider] || 'openai';
    const tryModel = async (m) => {
        const { data } = await axios.get(`${FALLBACK_TEXT_BASE}/${encodeURIComponent(query.slice(0, 3500))}`, {
            params: { model: m },
            timeout: options.timeout || 45000,
            responseType: 'text',
            validateStatus: status => status >= 200 && status < 300,
        });
        const answer = normalizeResult(typeof data === 'string' ? data : data);
        if (!answer || answer.startsWith('<') || /reached its budget|rate limit/i.test(answer)) {
            throw new Error('Fallback AI returned no answer');
        }
        return answer;
    };
    try { return await tryModel(model); }
    catch (e) { if (model !== 'openai') return tryModel('openai'); throw e; }
}

async function askPrinceAI(provider, prompt, options = {}) {
    const query = String(prompt || '').trim();
    if (!query) throw new Error('AI prompt is empty');
    // Try verified providers before the old offline service. Keep legacy fallbacks.
    try {
        return await require('./public-providers').askAI(query, options);
    } catch (providerErr) {
        console.warn(`[AI] Public providers unavailable (${providerErr.message}) — trying legacy fallbacks`);
    }
    try {
        return await askPrinceTech(provider, query, options);
    } catch (primaryErr) {
        console.warn(`[AI] PrinceTech ${provider} failed (${primaryErr.message}) — using fallback`);
        return askFallback(provider, query, options);
    }
}

async function fetchPrinceTTS(query, voice, options) {
    const response = await axios.get(`${PRINCE_AI_BASE}/tts`, {
        params: { apikey: PRINCE_AI_KEY, text: query, voice: voice || 'en_us_female' },
        responseType: 'arraybuffer',
        timeout: options.primaryTimeout || 20000,
        validateStatus: status => status >= 200 && status < 300,
    });
    const contentType = String(response.headers?.['content-type'] || '').toLowerCase();
    const audio = Buffer.from(response.data || []);
    if (!audio.length || (!contentType.startsWith('audio/') && !contentType.includes('octet-stream'))) {
        throw new Error('PrinceTech TTS API did not return audio');
    }
    return audio;
}

// Fallback: Google Translate TTS (free, 200 chars per request → chunked)
async function fetchGoogleTTS(query, voice, options) {
    const lang = /^ur|urdu/i.test(String(voice)) ? 'ur' : /^hi|hindi/i.test(String(voice)) ? 'hi'
        : (String(voice).match(/^([a-z]{2})[_-]/i)?.[1] || 'en').toLowerCase();
    const chunks = query.match(/[\s\S]{1,190}(\s|$)/g) || [query];
    const parts = [];
    for (const c of chunks.slice(0, 10)) {
        const r = await axios.get('https://translate.google.com/translate_tts', {
            params: { ie: 'UTF-8', client: 'tw-ob', tl: lang, q: c.trim() },
            responseType: 'arraybuffer',
            timeout: options.timeout || 30000,
            headers: { 'User-Agent': 'Mozilla/5.0' },
        });
        parts.push(Buffer.from(r.data));
    }
    const audio = Buffer.concat(parts);
    if (!audio.length) throw new Error('Google TTS returned no audio');
    return audio;
}

async function synthesizePrinceTTS(text, voice = 'en_us_female', options = {}) {
    const query = String(text || '').trim();
    if (!query) throw new Error('TTS text is empty');

    let audio;
    try {
        audio = await fetchPrinceTTS(query, voice, options);
    } catch (primaryErr) {
        console.warn(`[TTS] PrinceTech failed (${primaryErr.message}) — using Google TTS`);
        audio = await fetchGoogleTTS(query, voice, options);
    }
    // Try OGG/Opus conversion for best WhatsApp voice note compatibility.
    // If ffmpeg is unavailable on the hosting server, fall back to raw MP3.
    try {
        const opusAudio = await convertToWhatsAppVoiceNote(audio, options);
        return { audio: opusAudio, mimetype: 'audio/ogg; codecs=opus', fileName: 'cyber-tts.ogg' };
    } catch (ffmpegErr) {
        console.warn('[TTS] ffmpeg conversion failed, falling back to MP3:', ffmpegErr.message);
        return { audio, mimetype: 'audio/mpeg', fileName: 'cyber-tts.mp3' };
    }
}

function convertToWhatsAppVoiceNote(input, options = {}) {
    return new Promise((resolve, reject) => {
        const ffmpeg = spawn(options.ffmpegPath || 'ffmpeg', [
            '-hide_banner',
            '-loglevel', 'error',
            '-i', 'pipe:0',
            '-vn',
            '-ac', '1',
            '-ar', '48000',
            '-c:a', 'libopus',
            '-b:a', '32k',
            '-application', 'voip',
            '-f', 'ogg',
            'pipe:1',
        ], { stdio: ['pipe', 'pipe', 'pipe'] });

        const chunks = [];
        const errors = [];
        ffmpeg.stdout.on('data', chunk => chunks.push(chunk));
        ffmpeg.stderr.on('data', chunk => errors.push(chunk));
        ffmpeg.once('error', error => reject(error));
        ffmpeg.once('close', code => {
            if (code !== 0) {
                reject(new Error(`TTS audio conversion failed: ${Buffer.concat(errors).toString().trim()}`));
                return;
            }
            const output = Buffer.concat(chunks);
            if (!output.length) {
                reject(new Error('TTS audio conversion returned an empty file'));
                return;
            }
            resolve(output);
        });
        ffmpeg.stdin.end(input);
    });
}

module.exports = {
    askPrinceAI,
    synthesizePrinceTTS,
    PRINCE_AI_BASE,
    ENDPOINTS,
};