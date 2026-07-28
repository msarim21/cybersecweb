const axios = require('axios');

const PRINCE_AI_BASE = 'https://api.princetechn.com/api/ai';
const PRINCE_AI_KEY = 'prince';

const ENDPOINTS = {
    openai: 'openai',
    gemini: 'geminiai',
    deepseek: 'deepseek-v3',
};

function normalizeResult(data) {
    if (typeof data === 'string') return data.trim();
    if (!data || typeof data !== 'object') return '';

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

module.exports = {
    askPrinceAI,
    PRINCE_AI_BASE,
    ENDPOINTS,
};