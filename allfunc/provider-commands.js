'use strict';
const providers = require('./public-providers');
const commands = new Set(['apimenu', 'apistatus', 'kyioai', 'omegaai', 'ytfind', 'wikifind', 'weatherplus']);
async function handle({ command, text, prefix, reply, isCreator }, api = providers) {
    if (!commands.has(command)) return false;
    if (command === 'apimenu') {
        await reply(['*Public API Commands*', `${prefix}kyioai <question>`, `${prefix}omegaai <question>`, `${prefix}ytfind <query>`, `${prefix}wikifind <topic>`, `${prefix}weatherplus <city>`, `${prefix}pinterest <query>`, `${prefix}tiktoksearch <query>`, `${prefix}tt <link>`, `${prefix}apistatus`].join('\n'));
        return true;
    }
    if (command === 'apistatus') {
        if (!isCreator) { await reply('Owner only'); return true; }
        await reply((await api.health()).join('\n'));
        return true;
    }
    if (!String(text || '').trim()) { await reply(`Usage: ${prefix}${command} <query>`); return true; }
    try {
        if (command === 'kyioai' || command === 'omegaai') await reply(await api.askAI(text, { provider: command === 'kyioai' ? 'kyio' : 'omega' }));
        else if (command === 'ytfind') {
            const rows = await api.youtubeSearch(text);
            await reply(rows.map((r, i) => `${i + 1}. ${r.title}\n${r.duration || '?'}\n${r.url}`).join('\n\n'));
        } else if (command === 'wikifind') {
            const rows = await api.wikipedia(text);
            await reply(rows.map(r => `*${r.title}*\n${r.text}\n${r.url}`).join('\n\n'));
        } else {
            const w = await api.weather(text);
            await reply(`*${w.location.nameEn || w.location.city}*\nTemperature: ${w.current.temp}°C\nFeels like: ${w.current.realfeel}°C\nHumidity: ${w.current.humidity}%\nWind: ${w.current.windSpeed} km/h\nUpdated: ${w.current.localTime}`);
        }
    } catch (e) { await reply(`API unavailable: ${e.message}`); }
    return true;
}
module.exports = { handle, commands };