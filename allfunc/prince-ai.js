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

async function askPrinceAI(provider, prompt, options = {}) {
    const endpoint = ENDPOINTS[provider] || ENDPOINTS.openai;
    const query = String(prompt || '').trim();
    if (!query) throw new Error('AI prompt is empty');

    const { data } = await axios.get(`${PRINCE_AI_BASE}/${endpoint}`, {
        params: {
            apikey: PRINCE_AI_KEY,
            q: query,
        },
        timeout: options.timeout || 40000,
        validateStatus: status => status >= 200 && status < 300,
    });

    const answer = normalizeResult(data);
    if (!answer || answer.startsWith('<')) {
        throw new Error(`PrinceTech ${provider} API returned no answer`);
    }
    return answer;
}

async function synthesizePrinceTTS(text, voice = 'en_us_female', options = {}) {
    const query = String(text || '').trim();
    if (!query) throw new Error('TTS text is empty');

    const response = await axios.get(`${PRINCE_AI_BASE}/tts`, {
        params: {
            apikey: PRINCE_AI_KEY,
            text: query,
            voice: voice || 'en_us_female',
        },
        responseType: 'arraybuffer',
        timeout: options.timeout || 60000,
        validateStatus: status => status >= 200 && status < 300,
    });

    const contentType = String(response.headers?.['content-type'] || '').toLowerCase();
    const audio = Buffer.from(response.data || []);
    if (!audio.length || (!contentType.startsWith('audio/') && !contentType.includes('octet-stream'))) {
        throw new Error('PrinceTech TTS API did not return audio');
    }
    // WhatsApp voice notes are most reliable as mono OGG/Opus. Sending the
    // provider's MP3 directly with `ptt: true` can show "audio unavailable"
    // on Android/linked clients even when the MP3 itself is valid.
    const opusAudio = await convertToWhatsAppVoiceNote(audio, options);
    return {
        audio: opusAudio,
        mimetype: 'audio/ogg; codecs=opus',
        fileName: 'cyber-tts.ogg',
    };
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