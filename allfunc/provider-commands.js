'use strict';
const providers = require('./public-providers');
// NOTE: handle() runs BEFORE the case.js switch, so every name here shadows a
// same-named case.js command. All names were grepped against case.js first;
// colliding names were renamed (nexgemini, ytaudio, ytvid, makeqr, ghstalk,
// quotecard, livefact, ytseek, igdown, song, agents, fbdown, quotecanvas,
// narutologo, asciify). The consolidated commands
// (tiktok/tt, tiktoksearch, pinterest/imnxmxg) intentionally replace the
// case.js cases that were removed when they moved here.
const commands = new Set([
    'apimenu', 'apistatus',
    // Existing Kyio/Omega commands
    'kyioai', 'omegaai', 'ytfind', 'wikifind', 'weatherplus',
    // Consolidated from case.js (media sending preserved)
    'tiktok', 'tt', 'tiktoksearch', 'pinterest', 'imnxmxg',
    // Nexray AI
    'nexai', 'claude', 'nexgemini', 'grammar', 'tts', 'ideogram',
    // Kyio AI models
    'haiku', 'deepflash', 'gpt41', 'kyiochat', 'chatai', 'kyogemini', 'freeai', 's5', 'maritaca',
    // Omega AI
    'omegachat', 'chatgptv2', 'deepai', 'agents',
    // Omega AI media
    'imagine', 'logo', 'enhance',
    // Downloaders
    'ytaudio', 'ytvid', 'song', 'spotifyplay', 'spotifydl', 'aio', 'igdown', 'pindl',
    'fbdown', 'deezer',
    // Search
    'lyrics', 'bingimage', 'ytseek', 'spotifysearch', 'soundcloud', 'wallpaper', 'stickerly',
    'pinvideo', 'ttphoto', 'tttrend',
    'fbsearch', 'ytmusic', 'applemusic', 'pixiv', 'mcaddon', 'tstickers', 'ttuser', 'findsong', 'webtoon',
    // Tools
    'makeqr', 'removebg', 'remini', 'upscale', 'yttranscribe', 'ytsummary', 'ssweb', 'urlcheck', 'usernamegen',
    'convert', 'shazam', 'antinsfw',
    // Info
    'sholat', 'cuaca', 'currency', 'gempa', 'bola', 'ghstalk',
    // Sports
    'sportsnews', 'leagues',
    // Makers / fun
    'quotecard', 'quotly', 'brat', 'attp', 'ttp', 'nulis', 'codesnap', 'musiccard', 'ytthumb',
    'blackpink', 'glitch', 'ghibli', 'wasted', 'emojipng', 'emojigif',
    'quotecanvas', 'avengers', 'narutologo', 'wanted', 'nowplaying', 'watermark', 'asciify', 'ephoto',
    'tekateki', 'tebaklirik', 'livefact', 'cnn',
]);
const NO_ARG_COMMANDS = new Set(['tekateki', 'tebaklirik', 'cnn', 'gempa', 'bola', 'tttrend', 'sportsnews', 'leagues']);
const DEFAULT_AVATAR = 'https://picsum.photos/200';
const QC_COLORS = 'merah, putih, hijau, biru, kuning, oranye, ungu, hitam';
function usageFor(command, prefix) {
    const u = {
        tiktok: `🎵 *Usage:* ${prefix}${command} <tiktok link>\nExample: ${prefix}${command} https://www.tiktok.com/@user/video/123`,
        tt: `🎵 *Usage:* ${prefix}${command} <tiktok link>\nExample: ${prefix}${command} https://www.tiktok.com/@user/video/123`,
        currency: `Usage: ${prefix}currency <amount> <from> <to>\nExample: ${prefix}currency 100 USD PKR`,
        usernamegen: `Usage: ${prefix}usernamegen <name> [instans|ai]\nExample: ${prefix}usernamegen elrayy ai`,
        quotecard: `Usage: ${prefix}quotecard <text> | <name> | <avatar-url> | <color>\nColors: ${QC_COLORS}\nExample: ${prefix}quotecard hello world | NexRay | https://picsum.photos/200 | hijau`,
        quotly: `Usage: ${prefix}quotly <text> | <name> | <avatar-url> | <color>\nColors: ${QC_COLORS}\nExample: ${prefix}quotly hello world | NexRay | https://picsum.photos/200 | hijau`,
        musiccard: `Usage: ${prefix}musiccard <title> | <artist> | <image-url>\nExample: ${prefix}musiccard Shape of You | Ed Sheeran | https://picsum.photos/400`,
        ytthumb: `Usage: ${prefix}ytthumb <title> | <artist> | <cover-url>\nExample: ${prefix}ytthumb My Song | Artist | https://picsum.photos/400`,
        removebg: `Usage: ${prefix}removebg <image-url>`,
        remini: `Usage: ${prefix}remini <image-url>`,
        upscale: `Usage: ${prefix}upscale <image-url>`,
        ghibli: `Usage: ${prefix}ghibli <image-url>`,
        wasted: `Usage: ${prefix}wasted <image-url>`,
        ytaudio: `Usage: ${prefix}ytaudio <youtube-url>`,
        ytvid: `Usage: ${prefix}ytvid <youtube-url>`,
        yttranscribe: `Usage: ${prefix}yttranscribe <youtube-url>`,
        ytsummary: `Usage: ${prefix}ytsummary <youtube-url>`,
        ssweb: `Usage: ${prefix}ssweb <url>\nExample: ${prefix}ssweb https://example.com`,
        urlcheck: `Usage: ${prefix}urlcheck <url>\nExample: ${prefix}urlcheck https://example.com`,
        aio: `Usage: ${prefix}aio <url>`,
        igdown: `Usage: ${prefix}igdown <instagram-post-url>`,
        pindl: `Usage: ${prefix}pindl <pinterest-pin-url>`,
        spotifydl: `Usage: ${prefix}spotifydl <spotify-track-url>`,
        livefact: `Usage: ${prefix}livefact <birthdate YYYY-MM-DD>\nExample: ${prefix}livefact 2000-01-01`,
        sholat: `Usage: ${prefix}sholat <city> (Indonesian cities only)\nExample: ${prefix}sholat jakarta`,
        cuaca: `Usage: ${prefix}cuaca <city> (Indonesian cities only)\nExample: ${prefix}cuaca jakarta`,
        ghstalk: `Usage: ${prefix}ghstalk <github-username>`,
        emojipng: `Usage: ${prefix}emojipng <emoji>\nExample: ${prefix}emojipng 😂`,
        emojigif: `Usage: ${prefix}emojigif <emoji>\nExample: ${prefix}emojigif 😂`,
        song: `Usage: ${prefix}song <song name>\nExample: ${prefix}song never gonna give you up`,
        fbdown: `Usage: ${prefix}fbdown <facebook-video-url>\nExample: ${prefix}fbdown https://www.facebook.com/watch/?v=123`,
        deezer: `Usage: ${prefix}deezer <song name>\nExample: ${prefix}deezer never gonna give you up`,
        convert: `Usage: ${prefix}convert <image-url> <from> <to>\nExample: ${prefix}convert https://example.com/a.png png jpg`,
        shazam: `Usage: ${prefix}shazam <audio-url>\nExample: ${prefix}shazam https://p.scdn.co/mp3-preview/abc`,
        antinsfw: `Usage: ${prefix}antinsfw <image-url>`,
        enhance: `Usage: ${prefix}enhance <image-url>`,
        quotecanvas: `Usage: ${prefix}quotecanvas <quote> | <author>\nPut [words] in brackets to highlight them.\nExample: ${prefix}quotecanvas Life is [beautiful] | Tester`,
        avengers: `Usage: ${prefix}avengers <text1> | <text2>\nExample: ${prefix}avengers HELLO | WORLD`,
        wanted: `Usage: ${prefix}wanted <image-url> | <name>\nExample: ${prefix}wanted https://picsum.photos/200 | TESTER`,
        nowplaying: `Usage: ${prefix}nowplaying <title> | <artist> | <image-url>\nExample: ${prefix}nowplaying Test Song | Tester | https://picsum.photos/200`,
        watermark: `Usage: ${prefix}watermark <image-url> | <text>\nExample: ${prefix}watermark https://picsum.photos/200 | TEST`,
        asciify: `Usage: ${prefix}asciify <image-url>`,
        ephoto: `Usage: ${prefix}ephoto <effect> | <text>\nExample: ${prefix}ephoto neon | HELLO`,
    };
    return u[command] || `Usage: ${prefix}${command} <query>`;
}
function menu(prefix) {
    return [
        '*Public API Commands*',
        '',
        '🤖 *AI*',
        `${prefix}nexai <question> — Nexray AI chat`,
        `${prefix}claude <question> — Claude AI chat`,
        `${prefix}nexgemini <question> — Gemini AI chat`,
        `${prefix}grammar <text> — fix grammar`,
        `${prefix}tts <text> — text to speech (audio)`,
        `${prefix}ideogram <prompt> — AI image`,
        `${prefix}kyioai <question> — Kyio AI`,
        `${prefix}omegaai <question> — Omega AI`,
        `${prefix}haiku <question> — Claude Haiku 4.5 (Kyio)`,
        `${prefix}deepflash <question> — DeepSeek V4 Flash (Kyio)`,
        `${prefix}gpt41 <question> — GPT-4.1 (Kyio)`,
        `${prefix}kyiochat <question> — Kyio AI chat`,
        `${prefix}chatai <question> — GPT-5.6 Luna (Kyio)`,
        `${prefix}kyogemini <question> — Gemini chat (Kyio)`,
        `${prefix}freeai <question> — free AI (Kyio)`,
        `${prefix}s5 <question> — S5 AI (Kyio)`,
        `${prefix}maritaca <question> — Maritaca AI (Kyio, answers in Indonesian)`,
        `${prefix}omegachat <question> — Omega chatbot`,
        `${prefix}chatgptv2 <question> — ChatGPT v2 (Omega)`,
        `${prefix}deepai <question> — DeepAI (Omega)`,
        `${prefix}agents <question> — Qwen3 agents (Omega)`,
        `${prefix}imagine <prompt> — text-to-image (Omega)`,
        `${prefix}logo <keyword> — logo designs (Omega)`,
        '',
        '⬇️ *Downloaders*',
        `${prefix}tt <tiktok-link> — TikTok video, no watermark (alias: ${prefix}tiktok)`,
        `${prefix}ytaudio <youtube-url> — YouTube to MP3`,
        `${prefix}ytvid <youtube-url> — YouTube to MP4 (720p)`,
        `${prefix}song <song name> — search + MP3 in one go`,
        `${prefix}spotifyplay <song> — Spotify search + MP3`,
        `${prefix}spotifydl <spotify-url> — Spotify track to MP3`,
        `${prefix}aio <url> — all-in-one downloader`,
        `${prefix}igdown <instagram-url> — Instagram photo/video`,
        `${prefix}pindl <pinterest-url> — Pinterest pin media`,
        `${prefix}fbdown <facebook-url> — Facebook video`,
        `${prefix}deezer <song> — Deezer MP3`,
        '',
        '🔍 *Search*',
        `${prefix}tiktoksearch <query> — TikTok video search`,
        `${prefix}ttphoto <query> — TikTok photo posts`,
        `${prefix}tttrend — trending TikToks`,
        `${prefix}pinterest <query> — Pinterest images (alias: ${prefix}imnxmxg)`,
        `${prefix}pinvideo <query> — Pinterest videos`,
        `${prefix}ytseek <query> — YouTube search`,
        `${prefix}ytfind <query> — YouTube search (Omega)`,
        `${prefix}lyrics <song> — song lyrics`,
        `${prefix}bingimage <query> — image search`,
        `${prefix}wallpaper <query> — wallpapers`,
        `${prefix}spotifysearch <query> — Spotify track search`,
        `${prefix}soundcloud <query> — SoundCloud search`,
        `${prefix}stickerly <query> — sticker packs`,
        `${prefix}wikifind <topic> — Wikipedia`,
        `${prefix}fbsearch <query> — Facebook video search`,
        `${prefix}ytmusic <query> — YouTube Music search`,
        `${prefix}applemusic <query> — Apple Music search`,
        `${prefix}pixiv <query> — Pixiv art (safe mode)`,
        `${prefix}mcaddon <query> — Minecraft PE addons`,
        `${prefix}tstickers <query> — Telegram sticker packs`,
        `${prefix}ttuser <query> — TikTok user lookup`,
        `${prefix}findsong <lyrics> — identify song by lyrics`,
        `${prefix}webtoon <query> — Webtoon search`,
        '',
        '🛠️ *Tools*',
        `${prefix}makeqr <text> — QR code image`,
        `${prefix}removebg <image-url> — remove background`,
        `${prefix}remini <image-url> — enhance image (2x)`,
        `${prefix}upscale <image-url> — upscale image`,
        `${prefix}yttranscribe <youtube-url> — video transcript`,
        `${prefix}ytsummary <youtube-url> — video summary (Indonesian)`,
        `${prefix}ssweb <url> — website screenshot`,
        `${prefix}urlcheck <url> — phishing/malware check`,
        `${prefix}usernamegen <name> [instans|ai] — username ideas`,
        `${prefix}enhance <image-url> — HD image enhance (Omega)`,
        `${prefix}convert <image-url> <from> <to> — convert image format`,
        `${prefix}shazam <audio-url> — identify song from audio`,
        `${prefix}antinsfw <image-url> — image safety check`,
        '',
        '🎨 *Makers / Fun*',
        `${prefix}quotecard <text> | <name> | <avatar-url> | <color> — quote card`,
        `${prefix}quotly <text> | <name> | <avatar-url> | <color> — quote image`,
        `${prefix}brat <text> — brat meme image`,
        `${prefix}ttp <text> — text sticker`,
        `${prefix}attp <text> — animated text GIF`,
        `${prefix}nulis <text> — handwriting notebook image`,
        `${prefix}codesnap <code> — code snippet card`,
        `${prefix}musiccard <title> | <artist> | <image-url> — music card`,
        `${prefix}ytthumb <title> | <artist> | <cover-url> — YouTube thumbnail`,
        `${prefix}blackpink <text> — Blackpink text effect`,
        `${prefix}glitch <text> — glitch text effect`,
        `${prefix}ghibli <image-url> — Ghibli-style photo`,
        `${prefix}wasted <image-url> — GTA WASTED effect`,
        `${prefix}emojipng <emoji> — emoji as image`,
        `${prefix}emojigif <emoji> — emoji as animated sticker`,
        `${prefix}quotecanvas <quote> | <author> — quote card image`,
        `${prefix}avengers <text1> | <text2> — Avengers logo`,
        `${prefix}narutologo <text> — Naruto logo`,
        `${prefix}wanted <image-url> | <name> — wanted poster`,
        `${prefix}nowplaying <title> | <artist> | <image-url> — music player frame`,
        `${prefix}watermark <image-url> | <text> — watermark image`,
        `${prefix}asciify <image-url> — ASCII art`,
        `${prefix}ephoto <effect> | <text> — ePhoto text effect`,
        `${prefix}tekateki — Indonesian riddle`,
        `${prefix}tebaklirik — guess-the-lyric quiz (Indonesian)`,
        `${prefix}livefact <birthdate> — life-in-numbers fun facts`,
        `${prefix}cnn — CNN Indonesia headlines`,
        '',
        'ℹ️ *Info*',
        `${prefix}sholat <city> — prayer times (Indonesian cities)`,
        `${prefix}cuaca <city> — weather (Indonesian cities)`,
        `${prefix}currency <amount> <from> <to> — currency converter`,
        `${prefix}gempa — latest earthquake (Indonesia)`,
        `${prefix}bola — football fixtures`,
        `${prefix}ghstalk <username> — public GitHub profile`,
        `${prefix}weatherplus <city> — weather (Omega)`,
        '',
        '⚽ *Sports*',
        `${prefix}sportsnews — latest sports news`,
        `${prefix}leagues — sports leagues list`,
        '',
        '📊 *Status*',
        `${prefix}apistatus — provider health (owner only)`,
    ].join('\n');
}
function parsePipe(query, keys) {
    const parts = String(query).split('|').map(s => s.trim());
    const out = {};
    keys.forEach((k, i) => { out[k] = parts[i] || ''; });
    return out;
}
function fileName(title, ext) {
    const clean = String(title || 'file').replace(/[^\w\- ]+/g, '').trim().slice(0, 60) || 'file';
    return `${clean}.${ext}`;
}
async function handle({ command, text, prefix, reply, isCreator, send }, api = providers) {
    if (!commands.has(command)) return false;
    if (command === 'apimenu') {
        await reply(menu(prefix));
        return true;
    }
    if (command === 'apistatus') {
        if (!isCreator) { await reply('Owner only'); return true; }
        await reply((await api.health()).join('\n'));
        return true;
    }
    const query = String(text || '').trim();
    if (!query && !NO_ARG_COMMANDS.has(command)) {
        await reply(usageFor(command, prefix));
        return true;
    }
    // Media goes through `send` when case.js provides it; without it (tests)
    // the URL is replied as text instead.
    const sendMedia = async (content, fallbackText) => {
        if (typeof send === 'function') await send(content);
        else await reply(fallbackText);
    };
    const sendImage = (url, caption) => sendMedia({ image: { url }, caption }, caption ? `${caption}\n${url}` : url);
    const sendVideo = (url, caption) => sendMedia({ video: { url }, caption }, caption ? `${caption}\n${url}` : url);
    const sendAudio = (url, name, fallbackText) => sendMedia({ audio: { url }, mimetype: 'audio/mpeg', fileName: name }, fallbackText);
    const sendMedias = async (medias, caption) => {
        for (const m of medias) {
            if (m.type === 'video') await sendVideo(m.url, caption);
            else await sendImage(m.url, caption);
        }
    };
    try {
        switch (command) {
            // ---- Existing Kyio/Omega commands (unchanged behavior) ----
            case 'kyioai':
            case 'omegaai':
                await reply(await api.askAI(query, { provider: command === 'kyioai' ? 'kyio' : 'omega' }));
                break;
            case 'ytfind': {
                const rows = await api.youtubeSearch(query);
                await reply(rows.map((r, i) => `${i + 1}. ${r.title}\n${r.duration || '?'}\n${r.url}`).join('\n\n'));
                break;
            }
            case 'wikifind': {
                const rows = await api.wikipedia(query);
                await reply(rows.map(r => `*${r.title}*\n${r.text}\n${r.url}`).join('\n\n'));
                break;
            }
            case 'weatherplus': {
                const w = await api.weather(query);
                await reply(`*${w.location.nameEn || w.location.city}*\nTemperature: ${w.current.temp}°C\nFeels like: ${w.current.realfeel}°C\nHumidity: ${w.current.humidity}%\nWind: ${w.current.windSpeed} km/h\nUpdated: ${w.current.localTime}`);
                break;
            }
            // ---- Consolidated from case.js (media sending preserved) ----
            case 'tiktok':
            case 'tt': {
                if (!query.includes('tiktok.com') && !query.includes('vm.tiktok') && !query.includes('vt.tiktok')) {
                    await reply('❌ *Invalid TikTok link* • Send a valid TikTok URL');
                    break;
                }
                const result = await api.tiktokDownload(query);
                await sendVideo(result.video, `🎵 *${String(result.title).substring(0, 100)}*\n\n✅ *No Watermark*`);
                break;
            }
            case 'tiktoksearch': {
                const rows = await api.tiktokSearch(query);
                for (const row of rows) await sendVideo(row.video, `${row.title}\nViews: ${row.views}`);
                break;
            }
            case 'pinterest':
            case 'imnxmxg': {
                const rows = await api.pinterest(query);
                for (const row of rows) await sendImage(row.image, `${row.title}\n${row.url}`);
                break;
            }
            // ---- Nexray AI ----
            case 'nexai':
                await reply(await api.nexrayAI(query));
                break;
            case 'claude':
                await reply(await api.claudeAI(query));
                break;
            case 'nexgemini':
                await reply(await api.geminiAI(query));
                break;
            case 'grammar': {
                const g = await api.grammarCheck(query);
                await reply(`✏️ *Grammar check*\n\nOriginal: ${g.original}\nCorrected: *${g.corrected}*\nErrors fixed: ${g.errorCount}`);
                break;
            }
            case 'tts': {
                const r = await api.geminiTTS(query);
                await sendAudio(r.audio, 'tts.mp3', r.audio);
                break;
            }
            case 'ideogram': {
                const r = await api.ideogram(query);
                await sendImage(r.image, `🎨 ${query}`);
                break;
            }
            // ---- Downloaders ----
            case 'ytaudio': {
                const r = await api.youtubeMp3(query);
                await sendAudio(r.audio, fileName(r.title, 'mp3'), `🎵 ${r.title}\n${r.audio}`);
                break;
            }
            case 'ytvid': {
                const r = await api.youtubeMp4(query);
                await sendVideo(r.video, `🎬 ${r.title}`);
                break;
            }
            case 'song': {
                const r = await api.faaYtPlay(query);
                await sendAudio(r.audio, fileName(r.title, 'mp3'), `🎵 ${r.title}\n${r.url || r.audio}`);
                break;
            }
            case 'spotifyplay': {
                const r = await api.spotifyPlay(query);
                await sendAudio(r.audio, fileName(r.title, 'mp3'), `🎵 ${r.title} — ${r.artist}\n${r.audio}`);
                break;
            }
            case 'spotifydl': {
                const r = await api.spotifyDownload(query);
                await sendAudio(r.audio, fileName(r.title, 'mp3'), `🎵 ${r.title} — ${r.artist}\n${r.audio}`);
                break;
            }
            case 'aio': {
                const r = await api.aioDownload(query);
                await sendVideo(r.video, `⬇️ ${r.title}`);
                break;
            }
            case 'igdown': {
                const r = await api.instagramDownload(query);
                await sendMedias(r.medias, '📸 Instagram');
                break;
            }
            case 'pindl': {
                const r = await api.pinterestDownload(query);
                await sendMedias(r.medias, `📌 ${r.title}`);
                break;
            }
            // ---- Search ----
            case 'lyrics': {
                const r = await api.lyrics(query);
                await reply(`🎵 *${r.title}* — ${r.artist}\n${r.album ? `💿 ${r.album}\n` : ''}\n${r.text.slice(0, 6000)}`);
                break;
            }
            case 'bingimage': {
                const rows = await api.bingImage(query);
                for (const url of rows) await sendImage(url, `🖼️ ${query}`);
                break;
            }
            case 'ytseek': {
                const rows = await api.faaYoutubeSearch(query);
                await reply(rows.map((r, i) => `${i + 1}. ${r.title}\n${r.channel} • ${r.duration}\n${r.url}`).join('\n\n'));
                break;
            }
            case 'spotifysearch': {
                const rows = await api.spotifySearch(query);
                await reply(rows.map((r, i) => `${i + 1}. ${r.title} — ${r.artist}\n${r.duration}\n${r.url}`).join('\n\n'));
                break;
            }
            case 'soundcloud': {
                const rows = await api.soundcloudSearch(query);
                await reply(rows.map((r, i) => `${i + 1}. ${r.title}\n${r.author || ''} • ${r.duration}\n${r.url}`).join('\n\n'));
                break;
            }
            case 'wallpaper': {
                const rows = await api.wallpaperSearch(query);
                for (const row of rows) await sendImage(row.image, `🖼️ ${row.description || query}${row.author ? `\nBy ${row.author}` : ''}`);
                break;
            }
            case 'stickerly': {
                const rows = await api.stickerlySearch(query);
                await reply(rows.map((r, i) => `${i + 1}. *${r.name}* by ${r.author}\n${r.stickerCount} stickers\n${r.url}`).join('\n\n'));
                break;
            }
            case 'pinvideo': {
                const rows = await api.pinterestVideoSearch(query);
                for (const row of rows) await sendImage(row.thumbnail, `📌 ${row.title}\n▶️ Video (HLS): ${row.videoUrl}`);
                break;
            }
            case 'ttphoto': {
                const rows = await api.tiktokPhotoSearch(query);
                for (const row of rows) await sendImage(row.image, `📷 ${row.title}`);
                break;
            }
            case 'tttrend': {
                const rows = await api.tiktokTrend();
                for (const row of rows) await sendImage(row.image, `🔥 ${row.title}${row.duration ? `\n${row.duration}` : ''}`);
                break;
            }
            // ---- Tools ----
            case 'makeqr': {
                const r = await api.qrCode(query);
                await sendImage(r.image, `🔲 ${query}`);
                break;
            }
            case 'removebg': {
                const r = await api.removeBg(query);
                await sendImage(r.image, '✂️ Background removed');
                break;
            }
            case 'remini': {
                const r = await api.remini(query);
                await sendImage(r.image, '✨ Enhanced');
                break;
            }
            case 'upscale': {
                const r = await api.upscale(query);
                await sendImage(r.image, '🔍 Upscaled');
                break;
            }
            case 'yttranscribe': {
                const r = await api.ytTranscribe(query);
                await reply(`📝 *Transcript*\n${r.url}\n\n${r.transcript.slice(0, 6000)}${r.transcript.length > 6000 ? '\n…(truncated)' : ''}`);
                break;
            }
            case 'ytsummary': {
                const r = await api.ytSummarize(query);
                await reply(`📋 *Video summary (Indonesian)*\n\n${r.content.slice(0, 6000)}`);
                break;
            }
            case 'ssweb': {
                const r = await api.ssweb(query);
                await sendImage(r.image, `🌐 *${r.title}*\n${r.description}\n${r.url}`);
                break;
            }
            case 'urlcheck': {
                const r = await api.urlSafety(query);
                await reply(`🔒 *URL safety check*\n${r.url}\n\n${r.status}\nPhishing: ${r.isPhishing ? '⚠️ YES' : '✅ No'}\nMalware: ${r.hasMalware ? '⚠️ YES' : '✅ No'}\nHarmful redirects: ${r.sendsToHarmful ? '⚠️ Yes' : '✅ No'}\nMalicious downloads: ${r.installsMalware ? '⚠️ Yes' : '✅ No'}`);
                break;
            }
            case 'usernamegen': {
                const parts = query.split(/\s+/);
                const last = parts[parts.length - 1].toLowerCase();
                const hasMode = (last === 'ai' || last === 'instans') && parts.length > 1;
                const mode = hasMode ? last : 'instans';
                const name = hasMode ? parts.slice(0, -1).join(' ') : query;
                const rows = await api.usernameGen(name, { mode });
                await reply(`👤 *Username ideas for ${name}:*\n\n${rows.map((u, i) => `${i + 1}. ${u}`).join('\n')}`);
                break;
            }
            // ---- Info ----
            case 'sholat': {
                const r = await api.prayerTimes(query);
                const j = r.schedule;
                await reply(`🕌 *Prayer times — ${r.city}* (Indonesia)\n${r.period} ${r.date}\n\nImsyak: ${j.imsyak}\nSubuh: ${j.subuh}\nTerbit: ${j.terbit}\nDhuha: ${j.dhuha}\nDzuhur: ${j.dzuhur}\nAshar: ${j.ashar}\nMaghrib: ${j.maghrib}\nIsya: ${j.isya}`);
                break;
            }
            case 'cuaca': {
                const r = await api.idWeather(query);
                const loc = [r.location.desa, r.location.kecamatan, r.location.provinsi].filter(Boolean).join(', ');
                await reply(`🌤️ *Weather — ${loc || query}* (Indonesia, BMKG)\n\n${r.forecasts.map(f => `${f.waktu} — ${f.cuaca}, ${f.suhu}, humidity ${f.kelembaban}, wind ${f.kecepatan_angin} ${f.arah_angin}`).join('\n')}`);
                break;
            }
            case 'currency': {
                const [amount, source, target] = query.split(/\s+/);
                const r = await api.currencyConvert({ amount, source, target });
                await reply(`💱 ${r.amount} ${r.source} = *${r.value} ${r.target}*\nRate: 1 ${r.source} = ${r.rate} ${r.target}`);
                break;
            }
            case 'gempa': {
                const r = await api.earthquake();
                await reply(`🌋 *Latest earthquake (Indonesia, BMKG)*\n\n📅 ${r.date} ${r.time}\n📍 ${r.area}\nMagnitude: *${r.magnitude}*\nDepth: ${r.depth}\nCoordinates: ${r.coordinates}${r.potential ? `\nPotential: ${r.potential}` : ''}${r.felt ? `\nFelt: ${r.felt}` : ''}`);
                break;
            }
            case 'bola': {
                const rows = await api.footballFixtures();
                await reply(`⚽ *Football fixtures*\n\n${rows.map((f, i) => `${i + 1}. ${f}`).join('\n')}`);
                break;
            }
            case 'ghstalk': {
                const r = await api.githubStalk(query);
                const caption = `🐙 *${r.name || r.username}* (@${r.username})\n${r.bio ? `${r.bio}\n` : ''}${r.company ? `🏢 ${r.company}\n` : ''}${r.location ? `📍 ${r.location}\n` : ''}📦 Public repos: ${r.repos}\n${r.url}`;
                if (r.avatar) await sendImage(r.avatar, caption);
                else await reply(caption);
                break;
            }
            // ---- Makers / fun ----
            case 'quotecard': {
                const p = parsePipe(query, ['text', 'name', 'avatar', 'color']);
                const r = await api.quoteCard({ text: p.text, name: p.name || 'User', avatar: p.avatar || DEFAULT_AVATAR, color: p.color || 'hijau' });
                await sendImage(r.image, '');
                break;
            }
            case 'quotly': {
                const p = parsePipe(query, ['text', 'name', 'avatar', 'color']);
                const r = await api.quotly({ text: p.text, name: p.name || 'User', avatar: p.avatar || DEFAULT_AVATAR, color: p.color || 'hijau' });
                await sendImage(r.image, '');
                break;
            }
            case 'brat': {
                const r = await api.brat(query);
                await sendImage(r.image, '');
                break;
            }
            case 'ttp': {
                const r = await api.ttp(query);
                await sendImage(r.image, '');
                break;
            }
            case 'attp': {
                const r = await api.attp(query);
                await sendMedia({ video: { url: r.image }, gifPlayback: true }, r.image);
                break;
            }
            case 'nulis': {
                const r = await api.nulis(query);
                await sendImage(r.image, '✍️');
                break;
            }
            case 'codesnap': {
                const r = await api.codeSnap(query);
                await sendImage(r.image, '💻');
                break;
            }
            case 'musiccard': {
                const p = parsePipe(query, ['title', 'artist', 'image']);
                const r = await api.musicCard({ title: p.title, artist: p.artist, image: p.image || DEFAULT_AVATAR });
                await sendImage(r.image, '');
                break;
            }
            case 'ytthumb': {
                const p = parsePipe(query, ['title', 'artist', 'cover']);
                const r = await api.ytThumbnail({ title: p.title, artist: p.artist, cover: p.cover || DEFAULT_AVATAR });
                await sendImage(r.image, '');
                break;
            }
            case 'blackpink': {
                const r = await api.blackpink(query);
                await sendImage(r.image, '');
                break;
            }
            case 'glitch': {
                const r = await api.glitch(query);
                await sendImage(r.image, '');
                break;
            }
            case 'ghibli': {
                const r = await api.ghibli(query);
                await sendImage(r.image, '🎨 Ghibli style');
                break;
            }
            case 'wasted': {
                const r = await api.wasted(query);
                await sendImage(r.image, '💀 WASTED');
                break;
            }
            case 'emojipng': {
                const r = await api.emojiPng(query);
                await sendImage(r.image, query);
                break;
            }
            case 'emojigif': {
                const r = await api.emojiGif(query);
                await sendMedia({ sticker: { url: r.image } }, r.image);
                break;
            }
            case 'tekateki': {
                const r = await api.tekateki();
                await reply(`🧩 *Tekateki (Indonesian riddle)*\n\n${r.question}\n\n💡 Jawaban: ${r.answer}`);
                break;
            }
            case 'tebaklirik': {
                const r = await api.tebakLirik();
                await reply(`🎤 *Tebak Lirik (Indonesian lyrics quiz)*\n\n${r.question}\n\n💡 Jawaban: ${r.answer}`);
                break;
            }
            case 'livefact': {
                const r = await api.liveFunFact(query);
                const n = v => (Number.isFinite(Number(v)) ? Number(v).toLocaleString('en-US') : '?');
                const b = r.basic_info || {};
                const c = r.cardiovascular || {};
                const resp = r.respiratory || {};
                const d = r.digestive || {};
                await reply(`🎂 *Life in numbers — born ${r.birth_date}*\n\nAge: ${b.age_in_years} years (${n(b.age_in_days)} days)\n❤️ Heartbeats: ${n(c.heart_beats_total)}\n🩸 Blood pumped: ${n(c.blood_pumped_l)} L\n🫁 Breaths: ${n(resp.total_breaths)}\n💧 Saliva produced: ${n(d.saliva_produced_l)} L\n\n⚠️ Fun estimates from medical-research averages, not personal health data.`);
                break;
            }
            case 'cnn': {
                const rows = await api.cnnNews();
                await reply(`📰 *CNN Indonesia headlines*\n\n${rows.map((r, i) => `${i + 1}. ${r.title}${r.url ? `\n${r.url}` : ''}`).join('\n\n')}`);
                break;
            }
            // ---- Kyio AI models ----
            case 'haiku':
                await reply(await api.claudeHaikuAI(query));
                break;
            case 'deepflash':
                await reply(await api.deepseekFlashAI(query));
                break;
            case 'gpt41':
                await reply(await api.gpt41AI(query));
                break;
            case 'kyiochat':
                await reply(await api.kyioChatAI(query));
                break;
            case 'chatai':
                await reply(await api.chataiAI(query));
                break;
            case 'kyogemini':
                await reply(await api.geminiChatAI(query));
                break;
            case 'freeai':
                await reply(await api.freeAI(query));
                break;
            case 's5':
                await reply(await api.s5AI(query));
                break;
            case 'maritaca':
                await reply(await api.maritacaAI(query));
                break;
            // ---- Omega AI ----
            case 'omegachat':
                await reply(await api.omegaChatbotAI(query));
                break;
            case 'chatgptv2':
                await reply(await api.omegaChatgptV2AI(query));
                break;
            case 'deepai':
                await reply(await api.omegaDeepAI(query));
                break;
            case 'agents':
                await reply(await api.omegaAgentsAI(query));
                break;
            // ---- Omega AI media ----
            case 'imagine': {
                const r = await api.omegaTxt2Img(query);
                await sendImage(r.image, `🎨 ${query}`);
                break;
            }
            case 'logo': {
                const rows = await api.omegaLogo(query);
                for (const row of rows) await sendImage(row.image, `🎨 ${row.designName} (design preview)`);
                break;
            }
            case 'enhance': {
                const r = await api.omegaEnhance(query);
                await sendImage(r.image, '✨ Enhanced (HD)');
                break;
            }
            // ---- Omega downloaders ----
            case 'fbdown': {
                const r = await api.facebookDownload(query);
                await sendVideo(r.video, '📘 Facebook video');
                break;
            }
            case 'fbsearch': {
                const rows = await api.facebookSearch(query);
                await reply(rows.map((r, i) => `${i + 1}. ${r.title}\n${r.url}`).join('\n\n'));
                break;
            }
            case 'deezer': {
                const r = await api.deezerDownload(query);
                await sendAudio(r.audio, fileName(r.title, 'mp3'), `🎵 ${r.title} — ${r.artist}\n${r.audio}`);
                break;
            }
            case 'ytmusic': {
                const rows = await api.ytMusicSearch(query);
                await reply(rows.map((r, i) => `${i + 1}. ${r.title}${r.artist ? ` — ${r.artist}` : ''}${r.top ? ' ⭐ top result' : ''}\n${r.url}`).join('\n\n'));
                break;
            }
            // ---- Omega search ----
            case 'applemusic': {
                const rows = await api.appleMusicSearch(query);
                await reply(rows.map((r, i) => `${i + 1}. ${r.title} — ${r.artist}\n${r.url}`).join('\n\n'));
                break;
            }
            case 'pixiv': {
                const r = await api.pixivSearch(query);
                const caption = `🎨 *${r.title}*${r.author ? `\nBy ${r.author}` : ''}${r.tags.length ? `\nTags: ${r.tags.join(', ')}` : ''}`;
                for (let i = 0; i < r.images.length; i++) await sendImage(r.images[i], i === 0 ? caption : '');
                break;
            }
            case 'mcaddon': {
                const rows = await api.mcpeSearch(query);
                await reply(rows.map((r, i) => `${i + 1}. *${r.title}*${r.author ? ` by ${r.author}` : ''}\n${r.summary ? `${r.summary.slice(0, 150)}\n` : ''}⬇️ ${r.downloads ?? '?'} downloads${r.rating ? ` • ⭐ ${r.rating}` : ''}\n${r.url}`).join('\n\n'));
                break;
            }
            case 'tstickers': {
                const rows = await api.teleStickerSearch(query);
                await reply(rows.map((r, i) => `${i + 1}. *${r.title}*\n${r.telegramUrl}`).join('\n\n'));
                break;
            }
            case 'ttuser': {
                const rows = await api.tiktokUserSearch(query);
                await reply(`👤 *TikTok users* (video search not available)\n\n${rows.map((r, i) => `${i + 1}. *${r.nickname}* (@${r.uniqueId})${r.verified ? ' ✅' : ''}${r.signature ? `\n${r.signature}` : ''}\nhttps://www.tiktok.com/@${r.uniqueId}`).join('\n\n')}`);
                break;
            }
            case 'findsong': {
                const r = await api.findSong(query);
                await reply(`🎵 *${r.song}*${r.artist ? ` — ${r.artist}` : ''}${r.previewUrl ? '\n\n▶️ Sending 30-second preview…' : ''}`);
                if (r.previewUrl) await sendAudio(r.previewUrl, fileName(r.song, 'mp3'), r.previewUrl);
                break;
            }
            // ---- Omega tools / fun ----
            case 'convert': {
                const parts = query.split(/\s+/);
                if (parts.length < 3) { await reply(usageFor('convert', prefix)); break; }
                const [url, from, to] = parts;
                const r = await api.imageConvert({ url, from, to });
                if (['jpeg', 'jpg', 'png', 'webp', 'gif', 'bmp'].includes(r.to)) await sendImage(r.file, `🔄 Converted ${r.from} → ${r.to}`);
                else await sendMedia({ document: { url: r.file }, fileName: r.filename, mimetype: r.mimeType || 'application/octet-stream' }, r.file);
                break;
            }
            case 'shazam': {
                const r = await api.shazamRecognize(query);
                const caption = `🎵 *${r.title}* — ${r.artist}\n${r.album ? `💿 ${r.album}${r.year ? ` (${r.year})` : ''}\n` : ''}${r.label ? `🏷️ ${r.label}\n` : ''}${r.genres.length ? `🎶 ${r.genres.join(', ')}\n` : ''}${r.spotifyUrl ? `\nSpotify: ${r.spotifyUrl}` : ''}${r.appleMusicUrl ? `\nApple Music: ${r.appleMusicUrl}` : ''}${r.lyrics ? `\n\n${r.lyrics.slice(0, 1000)}` : ''}`;
                if (r.cover) await sendImage(r.cover, caption);
                else await reply(caption);
                break;
            }
            case 'webtoon': {
                const rows = await api.webtoonSearch(query);
                await reply(rows.map((r, i) => `${i + 1}. *${r.title}* (${r.genre})\n${r.authors.length ? `By ${r.authors.join(', ')}\n` : ''}${r.readCount ? `👁️ ${Number(r.readCount).toLocaleString('en-US')} reads\n` : ''}${r.url}`).join('\n\n'));
                break;
            }
            case 'antinsfw': {
                const r = await api.antinsfw(query);
                await reply(`${r.isNsfw ? '🚨 *NSFW detected*' : '✅ *Safe image*'}\nLabel: ${r.label}\nConfidence: ${r.confidence}${r.action ? `\nAction: ${r.action}` : ''}${r.violations.length ? `\nViolations: ${r.violations.join(', ')}` : ''}`);
                break;
            }
            // ---- Omega makers ----
            case 'quotecanvas': {
                const p = parsePipe(query, ['quote', 'author']);
                const r = await api.quoteCanvas({ quote: p.quote, author: p.author });
                await sendImage(r.image, '');
                break;
            }
            case 'avengers': {
                const p = parsePipe(query, ['text1', 'text2']);
                const r = await api.avengersLogo({ text1: p.text1, text2: p.text2 });
                await sendImage(r.image, '');
                break;
            }
            case 'narutologo': {
                const r = await api.narutoLogo(query);
                await sendImage(r.image, '');
                break;
            }
            case 'wanted': {
                const p = parsePipe(query, ['image', 'text']);
                const r = await api.bountyPoster({ image: p.image || DEFAULT_AVATAR, text: p.text });
                await sendImage(r.image, '');
                break;
            }
            case 'nowplaying': {
                const p = parsePipe(query, ['title', 'artist', 'image']);
                const r = await api.musicFrame({ title: p.title, artist: p.artist, image: p.image || DEFAULT_AVATAR });
                await sendImage(r.image, '');
                break;
            }
            case 'watermark': {
                const p = parsePipe(query, ['image', 'text']);
                const r = await api.watermarkImage({ image: p.image, text: p.text });
                await sendImage(r.image, '');
                break;
            }
            case 'asciify': {
                const r = await api.asciiArt(query);
                await reply(`\`\`\`\n${r.text.slice(0, 6000)}\n\`\`\``);
                break;
            }
            case 'ephoto': {
                const p = parsePipe(query, ['effect', 'text']);
                const r = await api.ephoto({ effect: p.effect, text: p.text });
                await sendImage(r.image, `✨ ${r.effectTitle}`);
                break;
            }
            // ---- Sports ----
            case 'sportsnews': {
                const rows = await api.sportsNews();
                await reply(`🏅 *Sports news*\n\n${rows.map((r, i) => `${i + 1}. *${r.title}*${r.category ? ` (${r.category})` : ''}${r.summary ? `\n${r.summary.slice(0, 200)}` : ''}`).join('\n\n')}`);
                break;
            }
            case 'leagues': {
                const rows = await api.sportLeagues();
                await reply(`🏆 *Sports leagues*\n\n${rows.map((r, i) => `${i + 1}. ${r.name}`).join('\n')}`);
                break;
            }
            default:
                // Unreachable if the commands Set and this switch stay in sync.
                await reply('Unknown API command');
                break;
        }
    } catch (e) { await reply(`API unavailable: ${e.message}`); }
    return true;
}
module.exports = { handle, commands };
