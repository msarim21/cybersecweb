'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const api = require('../allfunc/public-providers');
const { handle, commands } = require('../allfunc/provider-commands');
const response = data => ({ ok: true, json: async () => data });
test('Kyio nested answer is extracted, not the prompt echo', () => {
    assert.equal(api.extractAnswer({ status: true, result: { response: 'hello' } }), 'hello');
    assert.equal(api.extractAnswer({ success: true, message: 'hello', reply: '' }), '');
    assert.equal(api.extractAnswer({ status: true, result: 'It looks like you’re using an older version of the app.' }), '');
});
test('AI uses Omega when Kyio is unavailable', async () => {
    const urls = [];
    const answer = await api.askAI('hello', { fetch: async url => {
        urls.push(url.href);
        if (url.hostname === 'api.kyio.web.id') return response({ status: false, error: 'offline' });
        return response({ success: true, message: 'echo', answer: 'actual answer' });
    } });
    assert.equal(answer, 'actual answer');
    assert.equal(urls.length, 2);
    assert.equal(new URL(urls[1]).pathname, '/api/ai/Deepseek');
});
test('Pinterest falls back for malformed success and rejects non-HTTPS images', async () => {
    const rows = await api.pinterest('mountain', { fetch: async url =>
        response(url.hostname === 'api.omegatech.app' ? { success: true, results: [] } :
            { status: true, result: [{ images_url: 'https://i.pinimg.com/a.jpg', pin: 'https://pinterest.com/pin/1' }, { images_url: 'javascript:alert(1)' }] }) });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].image, 'https://i.pinimg.com/a.jpg');
});
test('TikTok input requires the actual TikTok hostname', async () => {
    let called = false;
    await assert.rejects(api.tiktokDownload('https://tiktok.com.attacker.example/video/123', { fetch: async () => { called = true; } }), /Invalid TikTok/);
    assert.equal(called, false);
});
test('TikTok search reads Nexray playable data', async () => {
    const rows = await api.tiktokSearch('nature', { fetch: async () => response({ result: [{ data: 'https://cdn.example/video.mp4', title: 'Nature', stats: { views: '1K' } }] }) });
    assert.equal(rows[0].video, 'https://cdn.example/video.mp4');
    assert.equal(rows[0].views, '1K');
});
test('apistatus is owner-only and cannot run probes for other users', async () => {
    let called = false;
    const handled = await handle({ command: 'apistatus', isCreator: false, reply: async () => {} }, { health: async () => { called = true; } });
    assert.equal(handled, true);
    assert.equal(called, false);
});
test('new command executes with real input and sends returned results', async () => {
    const replies = [];
    await handle({ command: 'ytfind', text: 'NASA', prefix: '.', reply: async r => replies.push(r) }, {
        youtubeSearch: async query => { assert.equal(query, 'NASA'); return [{ title: 'NASA live', duration: '1:23', url: 'https://youtube.com/watch?v=abc' }]; }
    });
    assert.equal(replies.length, 1);
    assert.ok(replies[0].includes('https://youtube.com/watch?v=abc'));
});
test('unknown commands are left to existing command handlers', async () => {
    assert.equal(await handle({ command: 'play' }), false);
});
// ---------------------------------------------------------------------------
// Extended coverage for the ~110 public-provider commands (offline, mocked).
// Mock payloads follow the probe-verified shapes in /tmp/probe-*.md.
// ---------------------------------------------------------------------------

const IMG = 'https://cdn.example/img.png';
const headImage = async () => ({ ok: true, headers: { get: () => 'image/png' } });

// Canned provider results shaped like the real probe payloads, so the command
// handlers format them exactly as they would live data.
function mockApi() {
    const image = async () => ({ image: IMG });
    const ai = async () => 'Mock AI answer';
    const audio = async () => ({ audio: 'https://cdn.example/a.mp3', title: 'Song', artist: 'Artist' });
    return {
        health: async () => ['KYIO_API_BASE: OK (1ms)', 'OMEGA_API_BASE: OK (1ms)'],
        askAI: ai,
        youtubeSearch: async () => [{ title: 'NASA live', duration: '1:23', url: 'https://youtube.com/watch?v=abc' }],
        wikipedia: async () => [{ title: 'NASA', text: 'Space agency.', url: 'https://en.wikipedia.org/?curid=1' }],
        weather: async () => ({ location: { nameEn: 'Lahore', city: 'Lahore' }, current: { temp: 25, realfeel: 27, humidity: 60, windSpeed: 10, localTime: '2026-11-18 10:00' } }),
        tiktokDownload: async () => ({ video: 'https://cdn.example/tt.mp4', title: 'TikTok test' }),
        tiktokSearch: async () => [{ video: 'https://cdn.example/tt.mp4', title: 'Nature', views: '1K' }],
        pinterest: async () => [{ image: 'https://i.pinimg.com/a.jpg', title: 'Pin', url: 'https://pinterest.com/pin/1' }],
        nexrayAI: ai, claudeAI: ai, geminiAI: ai,
        grammarCheck: async () => ({ original: 'She go', corrected: 'She goes', errorCount: 1 }),
        geminiTTS: async () => ({ audio: 'https://cdn.example/tts.mp3' }),
        ideogram: image,
        youtubeMp3: async () => ({ audio: 'https://cdn.example/a.mp3', title: 'Song', duration: 213 }),
        youtubeMp4: async () => ({ video: 'https://cdn.example/v.mp4', title: 'Video', duration: 213 }),
        faaYtPlay: async () => ({ audio: 'https://cdn.example/a.mp3', title: 'Song', url: 'https://youtube.com/watch?v=abc' }),
        spotifyPlay: audio, spotifyDownload: audio, deezerDownload: audio,
        aioDownload: async () => ({ video: 'https://cdn.example/v.mp4', title: 'Download' }),
        instagramDownload: async () => ({ medias: [{ url: 'https://cdn.example/m.jpg', type: 'image' }] }),
        pinterestDownload: async () => ({ medias: [{ url: 'https://cdn.example/m.jpg', type: 'image' }], title: 'Pin' }),
        lyrics: async () => ({ title: 'Shape of You', artist: 'Ed Sheeran', album: '÷', text: 'The club...' }),
        bingImage: async () => ['https://cdn.example/i1.jpg'],
        faaYoutubeSearch: async () => [{ title: 'Lofi', channel: 'Ch', duration: '1:00', url: 'https://youtube.com/watch?v=abc' }],
        spotifySearch: async () => [{ title: 'Perfect', artist: 'Ed Sheeran', duration: '4:23', url: 'https://open.spotify.com/track/abc' }],
        soundcloudSearch: async () => [{ title: 'Lofi', author: 'DJ', duration: '4:04', url: 'https://soundcloud.com/x' }],
        wallpaperSearch: async () => [{ image: 'https://cdn.example/w.jpg', description: 'Mountains', author: 'A' }],
        stickerlySearch: async () => [{ name: 'Cats', author: 'millo', stickerCount: 30, url: 'https://sticker.ly/s/abc' }],
        pinterestVideoSearch: async () => [{ title: 'Cat', thumbnail: 'https://cdn.example/t.jpg', videoUrl: 'https://cdn.example/v.m3u8' }],
        tiktokPhotoSearch: async () => [{ title: 'Photo', image: 'https://cdn.example/p.jpg' }],
        tiktokTrend: async () => [{ title: 'Trend', image: 'https://cdn.example/t.jpg', duration: '5 seconds' }],
        qrCode: image, removeBg: image, remini: image, upscale: image, ghibli: image, wasted: image,
        emojiPng: image, emojiGif: image, brat: image, ttp: image, attp: image, nulis: image,
        blackpink: image, glitch: image, codeSnap: image, quoteCard: image, quotly: image,
        musicCard: image, ytThumbnail: image, omegaTxt2Img: image, omegaEnhance: image,
        quoteCanvas: image, avengersLogo: image, narutoLogo: image, bountyPoster: image,
        musicFrame: image, watermarkImage: image,
        ephoto: async () => ({ image: IMG, effectTitle: 'Neon' }),
        ytTranscribe: async () => ({ url: 'https://youtube.com/watch?v=abc', transcript: 'Hello world transcript' }),
        ytSummarize: async () => ({ content: 'Summary text' }),
        ssweb: async () => ({ image: IMG, title: 'Example', description: 'Desc', url: 'https://example.com' }),
        urlSafety: async () => ({ url: 'https://example.com', isPhishing: false, hasMalware: false, status: 'Aman', sendsToHarmful: false, installsMalware: false }),
        usernameGen: async () => ['UserOne', 'UserTwo'],
        prayerTimes: async () => ({ city: 'Jakarta', period: 'November 2026', date: '18', schedule: { imsyak: '03:55', subuh: '04:05', terbit: '05:24', dhuha: '05:48', dzuhur: '11:40', ashar: '15:02', maghrib: '17:52', isya: '19:06' } }),
        idWeather: async () => ({ location: { desa: 'D', kecamatan: 'K', provinsi: 'P' }, forecasts: [{ waktu: '12:00', cuaca: 'Berawan', suhu: '29°C', kelembaban: '77%', kecepatan_angin: '6.9', arah_angin: 'N' }] }),
        currencyConvert: async () => ({ amount: 100, source: 'USD', target: 'PKR', value: 28000, rate: 280 }),
        earthquake: async () => ({ date: '18 Nov 2026', time: '11:41', coordinates: '-8.17,120.54', magnitude: '5.8', depth: '10 km', area: 'Laut', potential: '', felt: '' }),
        footballFixtures: async () => ['18 Nov - Croatia U21 vs Germany U21'],
        githubStalk: async () => ({ username: 'torvalds', name: 'Linus Torvalds', bio: '', company: 'Linux Foundation', location: 'Portland', repos: 12, url: 'https://github.com/torvalds', avatar: 'https://avatars.githubusercontent.com/u/1' }),
        tekateki: async () => ({ question: 'Soal?', answer: 'Jawaban' }),
        tebakLirik: async () => ({ question: 'Soal?', answer: 'Jawaban' }),
        liveFunFact: async () => ({ birth_date: '2000-01-01', basic_info: { age_in_years: 26, age_in_days: 9793 }, cardiovascular: { heart_beats_total: 1000000000, blood_pumped_l: 200000 }, respiratory: { total_breaths: 500000000 }, digestive: { saliva_produced_l: 10000 } }),
        cnnNews: async () => [{ title: 'Headline', url: 'https://cnnindonesia.com/x' }],
        claudeHaikuAI: ai, deepseekFlashAI: ai, gpt41AI: ai, kyioChatAI: ai, chataiAI: ai,
        geminiChatAI: ai, freeAI: ai, s5AI: ai, maritacaAI: ai,
        omegaChatbotAI: ai, omegaChatgptV2AI: ai, omegaDeepAI: ai, omegaAgentsAI: ai,
        omegaLogo: async () => [{ image: IMG, designName: 'Business Card' }],
        facebookDownload: async () => ({ video: 'https://cdn.example/fb.mp4' }),
        facebookSearch: async () => [{ title: 'FB video', url: 'https://www.facebook.com/watch/?v=123' }],
        ytMusicSearch: async () => [{ title: 'Song', artist: 'Artist', url: 'https://music.youtube.com/watch?v=abc', top: true }],
        appleMusicSearch: async () => [{ title: 'Perfect', artist: 'Ed Sheeran', url: 'https://music.apple.com/x' }],
        pixivSearch: async () => ({ images: [IMG], title: 'Cat art', author: 'Artist', tags: ['cat'] }),
        mcpeSearch: async () => [{ title: 'Solar Shaders', author: 'A', summary: 'Nice', downloads: 1000, rating: 4.5, url: 'https://mcpedl.com/x' }],
        teleStickerSearch: async () => [{ title: 'Cat pack', telegramUrl: 'https://t.me/addstickers/x' }],
        tiktokUserSearch: async () => [{ uniqueId: 'cats', nickname: 'Cats', verified: false, signature: 'sig' }],
        findSong: async () => ({ song: 'Never Gonna Give You Up', artist: 'Rick Astley', previewUrl: 'https://cdn.example/preview.mp3' }),
        imageConvert: async () => ({ file: 'https://cdn.example/converted.jpg', filename: 'converted.jpg', mimeType: 'image/jpeg', from: 'png', to: 'jpg' }),
        shazamRecognize: async () => ({ title: 'Perfect', artist: 'Ed Sheeran', album: '÷', label: 'Atlantic', year: '2017', genres: ['Pop'], cover: IMG, lyrics: '', spotifyUrl: '', appleMusicUrl: '' }),
        webtoonSearch: async () => [{ title: 'Tower of God', genre: 'FANTASY', authors: ['SIU'], readCount: 2425019, url: 'https://www.webtoons.com/x' }],
        antinsfw: async () => ({ isNsfw: false, label: 'Safe', confidence: '99.65%', action: 'allow', violations: [] }),
        asciiArt: async () => ({ text: '@@&&##' }),
        sportsNews: async () => [{ title: 'Match news', category: 'Football', summary: 'Summary text' }],
        sportLeagues: async () => [{ id: '1', name: 'UEFA Nations League' }],
    };
}
const YT_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const PIC_URL = 'https://picsum.photos/200';
const DISPATCH_TEXT = {
    tiktok: 'https://www.tiktok.com/@user/video/123',
    tt: 'https://www.tiktok.com/@user/video/123',
    currency: '100 USD PKR',
    usernamegen: 'elrayy ai',
    quotecard: 'hello world | NexRay | https://picsum.photos/200 | hijau',
    quotly: 'hello world | NexRay | https://picsum.photos/200 | hijau',
    musiccard: 'Shape of You | Ed Sheeran | https://picsum.photos/400',
    ytthumb: 'My Song | Artist | https://picsum.photos/400',
    convert: 'https://example.com/a.png png jpg',
    quotecanvas: 'Life is [beautiful] | Tester',
    avengers: 'HELLO | WORLD',
    wanted: 'https://picsum.photos/200 | TESTER',
    nowplaying: 'Test Song | Tester | https://picsum.photos/200',
    watermark: 'https://picsum.photos/200 | TEST',
    ephoto: 'neon | HELLO',
    livefact: '2000-01-01',
    ytaudio: YT_URL, ytvid: YT_URL, yttranscribe: YT_URL, ytsummary: YT_URL,
    removebg: PIC_URL, remini: PIC_URL, upscale: PIC_URL, ghibli: PIC_URL, wasted: PIC_URL,
    enhance: PIC_URL, asciify: PIC_URL, antinsfw: PIC_URL,
    shazam: 'https://p.scdn.co/mp3-preview/abc',
    ssweb: 'https://example.com', urlcheck: 'https://example.com', aio: 'https://example.com',
    igdown: 'https://www.instagram.com/p/BsOGulcndj-/',
    pindl: 'https://www.pinterest.com/pin/123/',
    spotifydl: 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC',
    fbdown: 'https://www.facebook.com/watch/?v=123',
    sholat: 'jakarta', cuaca: 'jakarta',
    ghstalk: 'torvalds',
    emojipng: '😂', emojigif: '😂',
    song: 'never gonna give you up', deezer: 'never gonna give you up', spotifyplay: 'never gonna give you up',
};
const NO_ARG_COMMANDS = new Set(['tekateki', 'tebaklirik', 'cnn', 'gempa', 'bola', 'tttrend', 'sportsnews', 'leagues']);
const MEDIA_COMMANDS = new Set([
    'tiktok', 'tt', 'tiktoksearch', 'pinterest', 'imnxmxg', 'tts', 'ideogram',
    'ytaudio', 'ytvid', 'song', 'spotifyplay', 'spotifydl', 'aio', 'igdown', 'pindl',
    'fbdown', 'deezer', 'bingimage', 'wallpaper', 'pinvideo', 'ttphoto', 'tttrend',
    'makeqr', 'removebg', 'remini', 'upscale', 'ssweb', 'ghstalk',
    'quotecard', 'quotly', 'brat', 'ttp', 'attp', 'nulis', 'codesnap', 'musiccard', 'ytthumb',
    'blackpink', 'glitch', 'ghibli', 'wasted', 'emojipng', 'emojigif',
    'imagine', 'logo', 'enhance', 'pixiv', 'findsong', 'convert', 'shazam',
    'quotecanvas', 'avengers', 'narutologo', 'wanted', 'nowplaying', 'watermark', 'ephoto',
]);

// ---- A. Dispatch meta-test: wiring coverage for every command in the Set ----
test('dispatch: every command in the Set handles with and without text', async () => {
    const failures = [];
    assert.ok(commands.size >= 100, `expected ~110 commands, got ${commands.size}`);
    for (const command of commands) {
        for (const withText of [true, false]) {
            const replies = [];
            const sends = [];
            const handled = await handle({
                command,
                text: withText ? (DISPATCH_TEXT[command] || 'hello world') : '',
                prefix: '.',
                isCreator: true,
                reply: async r => replies.push(r),
                send: async c => sends.push(c),
            }, mockApi());
            const label = `${command} (text=${withText})`;
            if (handled !== true) { failures.push(`${label}: handled=${handled}`); continue; }
            if (replies.length + sends.length === 0) { failures.push(`${label}: no reply and no send`); continue; }
            const leaked = replies.find(r => String(r).startsWith('API unavailable'));
            if (leaked) { failures.push(`${label}: provider error leaked: ${leaked}`); continue; }
            if (!withText && !NO_ARG_COMMANDS.has(command) && command !== 'apimenu' && command !== 'apistatus'
                && !replies.some(r => /Usage:/i.test(String(r)))) {
                failures.push(`${label}: expected usage reply, got ${JSON.stringify(replies[0])}`);
            }
            if (withText && MEDIA_COMMANDS.has(command) && sends.length === 0) {
                failures.push(`${label}: media command did not use send()`);
            }
        }
    }
    assert.deepEqual(failures, []);
});
test('colliding command names are left to case.js', async () => {
    for (const command of ['play', 'gemini', 'ytmp3', 'ytmp4', 'qrcode', 'github', 'qc', 'funfact', 'ytsearch', 'igdl', 'qwen', 'fbdl', 'quote', 'naruto', 'ascii']) {
        assert.equal(await handle({ command }), false, command);
    }
});

// ---- B. Parser / validator tests ----
// Kyio AI models each return the answer under a different result field
// (probe-kyio-omega.md §2a) — the wrapper must read its own field only.
test('Kyio AI models read their own probe-verified result field', async () => {
    const cases = [
        ['claudeHaikuAI', { answer: 'Four', model: 'claude-haiku-4-5' }, 'Four'],
        ['deepseekFlashAI', { answer: 'Four', reasoning: null }, 'Four'],
        ['gpt41AI', { model: 'gpt-4.1', response: 'Four' }, 'Four'],
        ['kyioChatAI', { sessionId: 's1', data: 'Four' }, 'Four'],
        ['chataiAI', { model: 'openai/gpt-5.6-luna', content: 'Four' }, 'Four'],
        ['geminiChatAI', { model: 'gemini-3.8-flash-low', reasoning: 'verbose reasoning', result: 'Four' }, 'Four'],
        ['freeAI', { answer: 'Four.', result: 'Four.' }, 'Four.'],
        ['s5AI', { response: '4', answer: '4' }, '4'],
        ['maritacaAI', { response: 'Empat.', answer: 'Empat.' }, 'Empat.'],
    ];
    for (const [fn, result, expected] of cases) {
        const got = await api[fn]('What is 2+2?', { fetch: async () => response({ status: true, result }) });
        assert.equal(got, expected, fn);
    }
    // gpt-4.1 reads `response`, not `answer`: an answer-only payload must fail.
    await assert.rejects(api.gpt41AI('hi', { fetch: async () => response({ status: true, result: { answer: 'Four' } }) }), /empty or invalid AI answer/);
    // geminichat reads `result`, not the verbose `reasoning`.
    await assert.rejects(api.geminiChatAI('hi', { fetch: async () => response({ status: true, result: { reasoning: 'only reasoning' } }) }), /empty or invalid AI answer/);
});
// Omega AI models each return the reply under a different field (O1–O4).
test('Omega AI models read their probe-verified reply fields', async () => {
    assert.equal(await api.omegaChatbotAI('hi', { fetch: async () => response({ statusCode: 200, success: true, reply: 'Four.' }) }), 'Four.');
    assert.equal(await api.omegaChatgptV2AI('hi', { fetch: async () => response({ statusCode: 200, success: true, data: { reply: 'Four', sessionId: 's' } }) }), 'Four');
    assert.equal(await api.omegaDeepAI('hi', { fetch: async () => response({ statusCode: 200, success: true, data: { model: 'standard', reply: 'Four.' } }) }), 'Four.');
    assert.equal(await api.omegaAgentsAI('hi', { fetch: async () => response({ statusCode: 200, success: true, data: { text: 'Four', model: 'Qwen/Qwen3-30B-A3B-Instruct' } }) }), 'Four');
    await assert.rejects(api.omegaChatbotAI('hi', { fetch: async () => response({ statusCode: 200, success: true, reply: '' }) }), /empty or invalid AI answer/);
    await assert.rejects(api.omegaAgentsAI('hi', { fetch: async () => response({ statusCode: 200, success: true, data: {} }) }), /empty or invalid AI answer/);
});
test('downloader URL extraction rejects empty or missing links', async () => {
    const mp3 = await api.youtubeMp3(YT_URL, { fetch: async () => response({ status: true, result: { title: 'Rick Astley - Never Gonna Give You Up', duration: 212.06, filesize: 3876430, url: 'https://gamma.123tokyo.xyz/x.mp3' } }) });
    assert.equal(mp3.audio, 'https://gamma.123tokyo.xyz/x.mp3');
    const mp4 = await api.youtubeMp4(YT_URL, { fetch: async () => response({ status: true, result: { title: 'Rick Astley', quality: '720', duration: '3:33', url: 'https://cdn405.savetube.vip/x.mp4' } }) });
    assert.equal(mp4.video, 'https://cdn405.savetube.vip/x.mp4');
    const tt = await api.tiktokDownload('https://www.tiktok.com/@user/video/123', { fetch: async () => response({ status: true, result: { title: 'Vid', data: 'https://cdn.example/tt.mp4' } }) });
    assert.equal(tt.video, 'https://cdn.example/tt.mp4');
    const ig = await api.instagramDownload('https://www.instagram.com/p/BsOGulcndj-/', { fetch: async () => response({ status: true, result: { url: ['https://scontent.cdninstagram.com/x.jpg'] } }) });
    assert.equal(ig.medias.length, 1);
    assert.equal(ig.medias[0].type, 'image');
    const pin = await api.pinterestDownload('https://www.pinterest.com/pin/123/', { fetch: async () => response({ status: true, result: { title: 'Pin', medias: [{ type: 'image', url: 'https://i.pinimg.com/x.png' }] } }) });
    assert.equal(pin.medias[0].url, 'https://i.pinimg.com/x.png');
    // Host validation rejects before any fetch is made.
    let called = false;
    const spy = async () => { called = true; return response({}); };
    await assert.rejects(api.youtubeMp3('https://vimeo.com/123', { fetch: spy }), /Invalid YouTube/);
    await assert.rejects(api.spotifyDownload('https://example.com/track', { fetch: spy }), /Invalid Spotify/);
    await assert.rejects(api.aioDownload('http://example.com/x', { fetch: spy }), /must be an https/);
    await assert.rejects(api.instagramDownload('https://example.com/p/1', { fetch: spy }), /Invalid Instagram/);
    assert.equal(called, false);
});
test('search lists are filtered to HTTPS URLs and capped', async () => {
    const yt = await api.faaYoutubeSearch('lofi', { fetch: async () => response({ status: true, result: [
        { title: 'A', channel: 'C', duration: '1:00', link: 'https://youtube.com/watch?v=1' },
        { title: 'B', channel: 'C', duration: '1:00', link: 'http://youtube.com/watch?v=2' },
        { title: '', channel: 'C', duration: '1:00', link: 'https://youtube.com/watch?v=3' },
        ...[4, 5, 6, 7].map(n => ({ title: 'T' + n, channel: 'C', duration: '1:00', link: `https://youtube.com/watch?v=${n}` })),
    ] }) });
    assert.equal(yt.length, 5);
    assert.ok(yt.every(r => r.url.startsWith('https://')));
    const imgs = await api.bingImage('cat', { fetch: async () => response({ status: true, result: ['http://a.example/1.png', 'https://b.example/2.png', 'https://c.example/3.png', 'https://d.example/4.png', 'https://e.example/5.png'] }) });
    assert.deepEqual(imgs, ['https://b.example/2.png', 'https://c.example/3.png', 'https://d.example/4.png']);
    const walls = await api.wallpaperSearch('nature', { fetch: async () => response({ status: true, result: [1, 2, 3, 4, 5].map(n => ({ url: `https://images.wallpaperscraft.com/${n}.jpg`, description: 'd', author: 'a' })) }) });
    assert.equal(walls.length, 3);
    const mc = await api.mcpeSearch('shaders', { fetch: async () => response({ statusCode: 200, success: true, results: [
        { title: 'No URL' },
        ...[1, 2, 3, 4, 5, 6].map(n => ({ title: 'Addon' + n, url: `https://mcpedl.com/a${n}/`, summary: 's', downloads_count: 10, rating: 4, author: 'x' })),
    ] }) });
    assert.equal(mc.length, 5);
    const users = await api.tiktokUserSearch('cats', { fetch: async () => response({ statusCode: 200, success: true, data: { users: [
        { nickname: 'NoId' },
        ...[1, 2, 3, 4, 5, 6].map(n => ({ uniqueId: 'u' + n, nickname: 'User' + n, signature: '', verified: false, avatar: `https://cdn.example/a${n}.jpg` })),
    ] } }) });
    assert.equal(users.length, 5);
    assert.ok(users.every(u => u.uniqueId));
});
test('binary mediaUrl HEAD rejects JSON errors and tolerates failed HEAD', async () => {
    // 200 with a JSON content-type means the provider returned an error body.
    await assert.rejects(api.qrCode('hello', { fetch: async () => ({ ok: true, headers: { get: () => 'application/json; charset=utf-8' } }) }), /unexpected media type/);
    // A real image content-type passes.
    const r = await api.qrCode('hello', { fetch: headImage });
    assert.ok(r.image.startsWith('https://api.nexray.eu.cc/tools/qrcode'));
    assert.equal(new URL(r.image).searchParams.get('text'), 'hello');
    // HEAD unsupported (throws) or non-OK: trust the live probe, return the URL.
    const r2 = await api.qrCode('hello', { fetch: async () => { throw new Error('HEAD not supported'); } });
    assert.ok(r2.image.includes('/tools/qrcode'));
    const r3 = await api.qrCode('hello', { fetch: async () => ({ ok: false, status: 405 }) });
    assert.ok(r3.image.includes('/tools/qrcode'));
    // Generation endpoints skip HEAD entirely (head: false) — no fetch at all.
    let called = false;
    const r4 = await api.ideogram('a sunset', { fetch: async () => { called = true; return {}; } });
    assert.equal(called, false);
    assert.ok(r4.image.includes('/ai/ideogram'));
});
test('currency converter validates amount and currency codes', async () => {
    const r = await api.currencyConvert({ amount: '100', source: 'usd', target: 'pkr' }, { fetch: async url => {
        assert.equal(url.searchParams.get('source'), 'USD');
        assert.equal(url.searchParams.get('target'), 'PKR');
        // Live behavior: the endpoint returns the per-unit rate, not the converted amount.
        return response({ status: true, result: { amount: 100, source: 'USD', target: 'PKR', value: 276.613 } });
    } });
    assert.deepEqual(r, { amount: 100, source: 'USD', target: 'PKR', value: 27661.3, rate: 276.613 });
    await assert.rejects(api.currencyConvert({ amount: 'abc', source: 'USD', target: 'PKR' }, { fetch: headImage }), /Currency needs/);
    await assert.rejects(api.currencyConvert({ amount: '100', source: 'USD' }, { fetch: headImage }), /Currency needs/);
    await assert.rejects(api.currencyConvert({}, { fetch: headImage }), /Currency needs/);
    await assert.rejects(api.currencyConvert({ amount: '100', source: 'USD', target: 'PKR' }, { fetch: async () => response({ status: true, result: {} }) }), /no conversion result/);
});
test('prayer times parse the Nexray jadwal payload', async () => {
    const r = await api.prayerTimes('jakarta', { fetch: async () => response({ status: true, result: { kota: 'Jakarta', periode: 'November 2026', tanggal: '18', jadwal: { imsyak: '03:55', subuh: '04:05', terbit: '05:24', dhuha: '05:48', dzuhur: '11:40', ashar: '15:02', maghrib: '17:52', isya: '19:06' } } }) });
    assert.equal(r.city, 'Jakarta');
    assert.equal(r.period, 'November 2026');
    assert.equal(r.schedule.subuh, '04:05');
    assert.equal(r.schedule.maghrib, '17:52');
    await assert.rejects(api.prayerTimes('', { fetch: headImage }), /City is empty/);
    await assert.rejects(api.prayerTimes('nowhere', { fetch: async () => response({ status: true, result: {} }) }), /no prayer times/);
});
test('quotecard color allow-list rejects non-Indonesian colors', async () => {
    const good = { text: 'hello world', name: 'NexRay', avatar: 'https://picsum.photos/200', color: 'hijau' };
    const r = await api.quoteCard(good, { fetch: headImage });
    const url = new URL(r.image);
    assert.equal(url.searchParams.get('color'), 'hijau');
    assert.equal(url.searchParams.get('text'), 'hello world');
    // Default color is hijau when omitted.
    const r2 = await api.quoteCard({ text: 'hi', name: 'X', avatar: 'https://picsum.photos/200' }, { fetch: headImage });
    assert.equal(new URL(r2.image).searchParams.get('color'), 'hijau');
    // Hex and English color names are rejected (probe: hex → HTTP 400).
    await assert.rejects(api.quoteCard({ ...good, color: 'red' }, { fetch: headImage }), /Color must be one of/);
    await assert.rejects(api.quoteCard({ ...good, color: '#00ff00' }, { fetch: headImage }), /Color must be one of/);
    await assert.rejects(api.quotly({ ...good, color: 'blue' }, { fetch: headImage }), /Color must be one of/);
    // Avatar must be an https URL.
    await assert.rejects(api.quoteCard({ ...good, avatar: '' }, { fetch: headImage }), /Avatar URL must be an https/);
});
test('livefact requires a YYYY-MM-DD birthdate', async () => {
    const r = await api.liveFunFact('2000-01-01', { fetch: async () => response({ status: true, result: { birth_date: '2000-01-01', basic_info: { age_in_days: 9793, age_in_years: 26 }, cardiovascular: { heart_beats_total: 1 }, respiratory: {}, digestive: {} } }) });
    assert.equal(r.basic_info.age_in_days, 9793);
    await assert.rejects(api.liveFunFact('01-01-2000', { fetch: headImage }), /YYYY-MM-DD/);
    await assert.rejects(api.liveFunFact('2000/01/01', { fetch: headImage }), /YYYY-MM-DD/);
    await assert.rejects(api.liveFunFact('', { fetch: headImage }), /YYYY-MM-DD/);
    await assert.rejects(api.liveFunFact('2000-01-01', { fetch: async () => response({ status: true, result: { basic_info: {} } }) }), /no fun facts/);
});
test('ascii art decodes HTML entities', async () => {
    const r = await api.asciiArt('https://picsum.photos/200', { fetch: async () => response({ statusCode: 200, success: true, result: '@@&amp;&amp;## &lt;tag&gt; &#39;q&#39; &quot;d&quot;' }) });
    assert.equal(r.text, "@@&&## <tag> 'q' \"d\"");
    await assert.rejects(api.asciiArt('https://picsum.photos/200', { fetch: async () => response({ statusCode: 200, success: true, result: '' }) }), /no ASCII art/);
    await assert.rejects(api.asciiArt('http://example.com/x.png', { fetch: headImage }), /must be an https/);
});
test('pixiv search always sends mode=safe', async () => {
    let seen;
    const r = await api.pixivSearch('cat', { fetch: async url => {
        seen = url;
        return response({ statusCode: 200, success: true, data: { result: { title: 'Cat', author: 'A', images: ['https://i.pximg.net/1.png', 'https://i.pximg.net/2.png', 'https://i.pximg.net/3.png', 'https://i.pximg.net/4.png'], tags: ['cat', 'cute', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'] } } });
    } });
    assert.equal(seen.searchParams.get('mode'), 'safe');
    assert.equal(seen.searchParams.get('randomPick'), 'false');
    assert.equal(r.images.length, 3);
    assert.equal(r.tags.length, 8);
    assert.equal(r.title, 'Cat');
});
test('gemini session_id is never exposed in returned values', async () => {
    const text = await api.geminiAI('What is 2+2?', { fetch: async () => response({ status: true, result: { text: 'Two plus two is four.', session_id: 'SECRET_COOKIE_BUNDLE_XYZ' } }) });
    assert.equal(text, 'Two plus two is four.');
    assert.ok(!text.includes('SECRET_COOKIE_BUNDLE_XYZ'));
    // Kyio's sessioned chat model also keeps its sessionId out of the answer.
    const chat = await api.kyioChatAI('hi', { fetch: async () => response({ status: true, result: { sessionId: 'SESSION_ABC_123', data: 'Four' } }) });
    assert.equal(chat, 'Four');
    assert.ok(!chat.includes('SESSION_ABC_123'));
    // Nexray Gemini also rejects the junk "update the app" payload.
    await assert.rejects(api.geminiAI('hi', { fetch: async () => response({ status: true, result: { text: 'It looks like you’re using an older version of the app. Update to the latest version for the best experience.' } }) }), /empty or invalid AI answer/);
});

// ---- C. Fallback chain tests ----
test('tiktokDownload chains Nexray → Azbry → tikwm → Kyio', async () => {
    const hosts = [];
    const mkFetch = tikwmData => async url => {
        const u = new URL(String(url));
        hosts.push(u.hostname);
        if (u.hostname === 'api.nexray.eu.cc') return response({ status: true, result: {} });
        if (u.hostname === 'api.azbry.com') return response({ creator: 'FebryWesker', status: true, result: { links: [] } });
        if (u.hostname === 'www.tikwm.com') return response(tikwmData);
        return response({ status: true, result: { video: { no_watermark: 'https://cdn.example/kyio.mp4' }, title: 'Kyio vid' } });
    };
    const r = await api.tiktokDownload('https://www.tiktok.com/@user/video/123', { fetch: mkFetch({ data: { hdplay: 'https://cdn.example/tikwm.mp4', title: 'TikTok vid' } }) });
    assert.equal(r.video, 'https://cdn.example/tikwm.mp4');
    assert.deepEqual(hosts, ['api.nexray.eu.cc', 'api.azbry.com', 'www.tikwm.com']);
    hosts.length = 0;
    const r2 = await api.tiktokDownload('https://www.tiktok.com/@user/video/123', { fetch: mkFetch({ data: {} }) });
    assert.equal(r2.video, 'https://cdn.example/kyio.mp4');
    assert.deepEqual(hosts, ['api.nexray.eu.cc', 'api.azbry.com', 'www.tikwm.com', 'api.kyio.web.id']);
});
test('ytaudio chain advances past failing providers to FAA, then Omega', async () => {
    const hosts = [];
    const fetch = async (url, init = {}) => {
        if (init.method === 'HEAD') return { status: 200 };
        hosts.push(url.hostname + url.pathname);
        // ytmp3pc is first in the chain: both ladder qualities fail here.
        if (url.hostname === 'bucketx3.ytzyar.cc') return response({ success: false, message: 'ytmp3pc down' });
        if (url.hostname === 'api.nexray.eu.cc') return response({ status: true, result: {} });
        if (url.hostname === 'api-faa.my.id') return { ok: false, status: 500, json: async () => ({}) };
        if (url.pathname === '/api/download/YouTube') return response({ statusCode: 200, success: true, data: { title: 'Rick Astley', video: { downloadUrl: 'https://ytdownloader.tech/v.mp4' }, audio: { mp3: { downloadUrl: 'https://ytdownloader.tech/a.mp3' } } } });
        throw new Error('unexpected provider ' + url.href);
    };
    const r = await api.youtubeMp3(YT_URL, { fetch });
    assert.equal(r.audio, 'https://ytdownloader.tech/a.mp3');
    assert.deepEqual(hosts, ['bucketx3.ytzyar.cc/music/pre-progress', 'bucketx3.ytzyar.cc/music/pre-progress', 'api.nexray.eu.cc/downloader/ytmp3', 'api-faa.my.id/faa/ytmp3', 'api.omegatech.app/api/download/YouTube']);
    // FAA alone is enough when Nexray fails.
    const r2 = await api.youtubeMp3(YT_URL, { fetch: async url => {
        if (url.hostname === 'bucketx3.ytzyar.cc') return response({ success: false, message: 'ytmp3pc down' });
        if (url.hostname === 'api.nexray.eu.cc') return response({ status: true, result: {} });
        return response({ status: true, creator: 'Faa', result: { title: 'Rick Astley', mp3: 'https://cdn.aceimg.com/x.mp3', thumbnail: 'https://i.ytimg.com/x.jpg', duration: '3:33' } });
    } });
    assert.equal(r2.audio, 'https://cdn.aceimg.com/x.mp3');
});
test('ytvid chain advances past failing providers to FAA, then Omega download/all', async () => {
    const hosts = [];
    const fetch = async (url, init = {}) => {
        if (init.method === 'HEAD') return { status: 200 };
        hosts.push(url.hostname + url.pathname);
        // ytmp3pc is first in the chain: both ladder qualities fail here.
        if (url.hostname === 'bucketx3.ytzyar.cc' && url.pathname.endsWith('/pre-progress')) return response({ success: false, message: 'ytmp3pc down' });
        if (url.hostname === 'api.nexray.eu.cc') return response({ status: true, result: {} });
        if (url.hostname === 'api-faa.my.id') return response({ status: true, result: {} });
        // Omega YouTube returns audio only — the video chain must move past it.
        if (url.pathname === '/api/download/YouTube') return response({ statusCode: 200, success: true, data: { title: 'Rick Astley', audio: { mp3: { downloadUrl: 'https://ytdownloader.tech/a.mp3' } } } });
        if (url.pathname === '/api/download/all') return response({ statusCode: 200, success: true, data: { title: 'Rick Astley', video: [{ url: 'https://ytdownloader.tech/v.mp4' }], audio: [] } });
        throw new Error('unexpected provider ' + url.href);
    };
    const r = await api.youtubeMp4(YT_URL, { fetch });
    assert.equal(r.video, 'https://ytdownloader.tech/v.mp4');
    assert.deepEqual(hosts, ['bucketx3.ytzyar.cc/video/pre-progress', 'bucketx3.ytzyar.cc/video/pre-progress', 'api.nexray.eu.cc/downloader/savetube', 'api-faa.my.id/faa/ytmp4', 'api.omegatech.app/api/download/YouTube', 'api.omegatech.app/api/download/all']);
});
test('ytaudio/ytvid use ytmp3pc first when it succeeds', async () => {
    const hosts = [];
    const fetch = async (url, init = {}) => {
        if (init.method === 'HEAD') return { status: 200 };
        hosts.push(url.hostname + url.pathname);
        if (url.pathname.endsWith('/pre-progress')) {
            return response({ success: true, cached: true, download_url: 'https://bucketx3.ytzyar.cc/x/download?v=cached1' });
        }
        if (url.pathname.endsWith('/available-music') || url.pathname.endsWith('/available-video')) {
            return response({ success: true, data: { title: 'Rick Astley', duration: 212 } });
        }
        throw new Error('unexpected provider ' + url.href);
    };
    const r = await api.youtubeMp3(YT_URL, { fetch });
    assert.equal(r.audio, 'https://bucketx3.ytzyar.cc/x/download?v=cached1');
    assert.equal(r.title, 'Rick Astley');
    assert.deepEqual(hosts, ['bucketx3.ytzyar.cc/music/pre-progress', 'ytzyar.cc/music/available-music']);
    hosts.length = 0;
    const r2 = await api.youtubeMp4(YT_URL, { fetch });
    assert.equal(r2.video, 'https://bucketx3.ytzyar.cc/x/download?v=cached1');
    assert.deepEqual(hosts, ['bucketx3.ytzyar.cc/video/pre-progress', 'bucketx3.ytzyar.cc/video/available-video']);
});
test('youtubeMp3/youtubeMp4 skipYtmp3pc goes straight to providers', async () => {
    // The play pipeline already tried (and failed) ytmp3pc — it must not be
    // retried here. Live probe 2026-11-26: ytmp3pc convert was down while
    // Nexray still returned links.
    const hosts = [];
    const fetch = async (url, init = {}) => {
        if (init.method === 'HEAD') return { status: 200 };
        hosts.push(url.hostname + url.pathname);
        if (url.hostname === 'api.nexray.eu.cc') return response({ status: true, result: { title: 'Rick Astley', duration: 212, url: 'https://gamma.123tokyo.xyz/x.mp3' } });
        throw new Error('unexpected provider ' + url.href);
    };
    const r = await api.youtubeMp3(YT_URL, { fetch, skipYtmp3pc: true });
    assert.equal(r.audio, 'https://gamma.123tokyo.xyz/x.mp3');
    assert.deepEqual(hosts, ['api.nexray.eu.cc/downloader/ytmp3']);
    hosts.length = 0;
    const fetch4 = async (url, init = {}) => {
        if (init.method === 'HEAD') return { status: 200 };
        hosts.push(url.hostname + url.pathname);
        if (url.hostname === 'api.nexray.eu.cc') return response({ status: true, result: { title: 'Rick Astley', duration: '3:33', url: 'https://cdn405.savetube.vip/x.mp4' } });
        throw new Error('unexpected provider ' + url.href);
    };
    const r2 = await api.youtubeMp4(YT_URL, { fetch: fetch4, skipYtmp3pc: true });
    assert.equal(r2.video, 'https://cdn405.savetube.vip/x.mp4');
    assert.deepEqual(hosts, ['api.nexray.eu.cc/downloader/savetube']);
});
test('youtubeMp3 skips a provider whose link 404s on HEAD (dead Nexray link)', async () => {
    // Live probe 2026-11-26: Nexray ytmp3 answered 200 but its mp3 link 404s.
    const fetch = async (url, init = {}) => {
        if (init.method === 'HEAD') {
            return { status: String(url).includes('123tokyo') ? 404 : 200 };
        }
        if (url.hostname === 'api.nexray.eu.cc') return response({ status: true, result: { title: 'Rick Astley', duration: 212, url: 'https://mu.123tokyo.xyz/x.mp3' } });
        return response({ status: true, creator: 'Faa', result: { title: 'Rick Astley', mp3: 'https://cdn.aceimg.com/x.mp3', thumbnail: 'https://i.ytimg.com/x.jpg', duration: '3:33' } });
    };
    const r = await api.youtubeMp3(YT_URL, { fetch, skipYtmp3pc: true });
    assert.equal(r.audio, 'https://cdn.aceimg.com/x.mp3');
});
test('pinterest falls through Omega → Nexray → Azbry', async () => {
    const hosts = [];
    const rows = await api.pinterest('cat', { fetch: async url => {
        hosts.push(url.hostname);
        if (url.hostname === 'api.omegatech.app') return response({ statusCode: 200, success: true, results: [] });
        if (url.hostname === 'api.nexray.eu.cc') return response({ status: true, result: [] });
        return response({ creator: 'FebryWesker', status: true, result: [{ id: 'e1', title: 'a cat', image: 'https://i.pinimg.com/474x/x.jpg', source: 'https://id.pinterest.com/pin/1/' }] });
    } });
    assert.deepEqual(hosts, ['api.omegatech.app', 'api.nexray.eu.cc', 'api.azbry.com']);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].image, 'https://i.pinimg.com/474x/x.jpg');
});
test('lyrics falls back to Omega when Nexray has no lyrics', async () => {
    const hosts = [];
    const r = await api.lyrics('shape of you', { fetch: async url => {
        hosts.push(url.hostname);
        if (url.hostname === 'api.nexray.eu.cc') return response({ status: true, result: { title: 'Shape of You', artist: 'Ed Sheeran' } });
        return response({ statusCode: 200, success: true, found: true, title: 'Ed Sheeran - Shape Of You', artist: 'Ed Sheeran', lyrics: "The club isn't the best place to find a lover" });
    } });
    assert.deepEqual(hosts, ['api.nexray.eu.cc', 'api.omegatech.app']);
    assert.equal(r.artist, 'Ed Sheeran');
    assert.ok(r.text.startsWith("The club isn't"));
});

// ---- D. Kyio throttle is skipped for injected (test) fetch ----
test('Kyio calls with injected fetch do not wait for the throttle', async () => {
    const fetch = async () => response({ status: true, result: { answer: 'Four' } });
    const start = Date.now();
    assert.equal(await api.deepseekFlashAI('2+2?', { fetch }), 'Four');
    assert.equal(await api.freeAI('2+2?', { fetch }), 'Four');
    assert.equal(await api.s5AI('2+2?', { fetch }), 'Four');
    const elapsed = Date.now() - start;
    // A throttled run would take >= 12 s (two 6 s gaps between three calls).
    assert.ok(elapsed < 5000, `Kyio calls waited ${elapsed}ms`);
});

// ---- E. apimenu lists every command ----
test('apimenu lists every command in the Set', async () => {
    const replies = [];
    await handle({ command: 'apimenu', prefix: '.', reply: async r => replies.push(r) }, {});
    assert.equal(replies.length, 1);
    const missing = [...commands].filter(c => c !== 'apimenu' && c !== 'apistatus' && !replies[0].includes('.' + c));
    assert.deepEqual(missing, []);
});
