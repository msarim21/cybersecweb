#!/usr/bin/env node
'use strict';
// Offline checks for the ytmp3pc YouTube converter module + command wiring.
// No network and no node_modules needed: fetch is injected as a mock.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const yt = require('../allfunc/ytmp3pc');

let failed = 0;
async function ok(name, fn) {
    try {
        await fn();
        console.log('  ✓', name);
    } catch (e) {
        failed++;
        console.log('  ✗', name, '\n   ', e.message);
    }
}

const VID = 'jNQXAC9IVRw';
const VID2 = '60ItHLz5WEA';

function jsonResponse(data, { ok = true, status = 200 } = {}) {
    return {
        ok,
        status,
        text: async () => JSON.stringify(data),
        json: async () => data,
        headers: { get: () => null },
        body: {},
    };
}

function audioResponse(bytes) {
    const buf = Buffer.from(bytes);
    return {
        ok: true,
        status: 200,
        headers: { get: (k) => (k.toLowerCase() === 'content-length' ? String(buf.length) : null) },
        body: {},
        arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    };
}

(async () => {
    await ok('extractYouTubeId handles all URL forms + bad input', () => {
        assert.equal(yt.extractYouTubeId('https://www.youtube.com/watch?v=' + VID + '&t=5s'), VID);
        assert.equal(yt.extractYouTubeId('https://youtu.be/' + VID + '?si=x'), VID);
        assert.equal(yt.extractYouTubeId('https://www.youtube.com/shorts/' + VID), VID);
        assert.equal(yt.extractYouTubeId('https://www.youtube.com/embed/' + VID), VID);
        assert.equal(yt.extractYouTubeId(VID), VID);
        assert.equal(yt.extractYouTubeId('  ' + VID + '  '), VID);
        assert.equal(yt.extractYouTubeId(null), null);
        assert.equal(yt.extractYouTubeId(''), null);
        assert.equal(yt.extractYouTubeId('not a url'), null);
        assert.equal(yt.extractYouTubeId('https://example.com/watch?v=short'), null);
    });

    await ok('computeToken is deterministic with known vectors', () => {
        assert.equal(yt.computeToken(VID), 430615924);
        assert.equal(yt.computeToken(VID2), 388507632);
        assert.equal(yt.computeToken(VID), yt.computeToken(VID));
        assert.notEqual(yt.computeToken(VID), yt.computeToken(VID2));
    });

    await ok('getFormats mp3 hits music API with token', async () => {
        const seen = [];
        const fetch = async (url) => {
            seen.push(String(url));
            return jsonResponse({ success: true, data: { title: 'T', duration: 19, detail: [{ quality: 192 }] } });
        };
        const d = await yt.getFormats(VID, 'mp3', { fetch });
        assert.equal(d.title, 'T');
        const u = new URL(seen[0]);
        assert.equal(u.hostname, 'ytzyar.cc');
        assert.equal(u.pathname, '/music/available-music');
        assert.equal(u.searchParams.get('v'), VID);
        assert.equal(u.searchParams.get('token'), '430615924');
    });

    await ok('getFormats mp4 hits bucket API with token', async () => {
        const seen = [];
        const fetch = async (url) => {
            seen.push(String(url));
            return jsonResponse({ success: true, data: { title: 'T', duration: 19, detail: [] } });
        };
        await yt.getFormats(VID, 'mp4', { fetch });
        const u = new URL(seen[0]);
        assert.equal(u.hostname, 'bucketx3.ytzyar.cc');
        assert.equal(u.pathname, '/video/available-video');
        assert.equal(u.searchParams.get('token'), '430615924');
    });

    await ok('convert happy path polls to download_url', async () => {
        let polls = 0;
        const fetch = async (url, init = {}) => {
            const u = new URL(String(url));
            if (u.pathname.endsWith('/pre-progress')) {
                assert.equal(init.method, 'POST');
                const body = JSON.parse(init.body);
                assert.equal(body.video_id, VID);
                assert.equal(body.quality, '192');
                return jsonResponse({ success: true, data: { job_id: 'job1' } });
            }
            polls++;
            if (polls === 1) return jsonResponse({ status: 'processing', data: { percent: 10 } });
            return jsonResponse({ status: 'complete', download_url: 'https://cdn.example/t.mp3' });
        };
        const r = await yt.convert(VID, { type: 'mp3', quality: 192, fetch, pollIntervalMs: 5, pollTimeoutMs: 5000 });
        assert.equal(r.downloadUrl, 'https://cdn.example/t.mp3');
        assert.equal(r.jobId, 'job1');
        assert.equal(polls, 2);
    });

    await ok('convert returns cached pre-progress URL without polling', async () => {
        let polls = 0;
        const fetch = async (url) => {
            const u = new URL(String(url));
            if (u.pathname.endsWith('/pre-progress')) {
                return jsonResponse({ success: true, cached: true, download_url: 'https://cdn.example/cached.mp3', message: 'Success, file ready to download' });
            }
            polls++;
            return jsonResponse({ status: 'processing' });
        };
        const r = await yt.convert(VID, { type: 'mp3', quality: 128, fetch, pollIntervalMs: 5, pollTimeoutMs: 1000 });
        assert.equal(r.downloadUrl, 'https://cdn.example/cached.mp3');
        assert.equal(r.status, 'cached');
        assert.equal(polls, 0);
    });

    await ok('convert surfaces job failure', async () => {
        const fetch = async (url) => {
            const u = new URL(String(url));
            if (u.pathname.endsWith('/pre-progress')) return jsonResponse({ success: true, data: { job_id: 'j9' } });
            return jsonResponse({ status: 'failed', message: 'Download process exited with error code 1' });
        };
        await assert.rejects(
            yt.convert(VID, { type: 'mp3', quality: 320, fetch, pollIntervalMs: 5, pollTimeoutMs: 5000 }),
            /Download process exited with error code 1/
        );
    });

    await ok('convert times out on a stuck job', async () => {
        const fetch = async (url) => {
            const u = new URL(String(url));
            if (u.pathname.endsWith('/pre-progress')) return jsonResponse({ success: true, data: { job_id: 'j8' } });
            return jsonResponse({ status: 'processing', data: { percent: 0 } });
        };
        await assert.rejects(
            yt.convert(VID, { type: 'mp3', quality: 192, fetch, pollIntervalMs: 5, pollTimeoutMs: 30 }),
            /Timed out waiting for job j8/
        );
    });

    await ok('downloadYouTubeAudio falls down the quality ladder (192 fails, 128 works)', async () => {
        const calls = [];
        const fetch = async (url, init = {}) => {
            const u = new URL(String(url));
            calls.push(u.hostname + u.pathname);
            if (u.pathname.endsWith('/available-music')) {
                return jsonResponse({ success: true, data: { title: 'Test Song', duration: 19, detail: [{ quality: 192 }] } });
            }
            if (u.pathname.endsWith('/pre-progress')) {
                const body = JSON.parse(init.body);
                if (body.quality === '192') return jsonResponse({ success: false, message: 'transcode failed' });
                return jsonResponse({ success: true, cached: true, download_url: 'https://cdn.example/t128.mp3' });
            }
            if (u.hostname === 'cdn.example') return audioResponse('FAKEAUDIO');
            throw new Error('unexpected ' + u.href);
        };
        const r = await yt.downloadYouTubeAudio('https://youtu.be/' + VID, {
            fetch,
            pollIntervalMs: 5,
            pollTimeoutMs: 5000,
            ytdl: { available: () => false },
        });
        assert.equal(r.title, 'Test Song');
        assert.equal(r.quality, 'MP3 128kbps');
        assert.equal(r.buffer.toString(), 'FAKEAUDIO');
        assert.equal(r.fileName, 'Test Song.mp3');
    });

    await ok('downloadYouTubeAudio rejects over-long videos before converting', async () => {
        let converted = false;
        const fetch = async (url) => {
            const u = new URL(String(url));
            if (u.pathname.endsWith('/available-music')) {
                return jsonResponse({ success: true, data: { title: 'Long', duration: 3600, detail: [{ quality: 192 }] } });
            }
            if (u.pathname.endsWith('/pre-progress')) converted = true;
            throw new Error('unexpected ' + u.href);
        };
        await assert.rejects(
            yt.downloadYouTubeAudio('https://youtu.be/' + VID, { fetch, ytdl: { available: () => false } }),
            /too long/
        );
        assert.equal(converted, false);
    });

    await ok('downloadBuffer enforces the size cap', async () => {
        const fetch = async () => ({
            ok: true,
            status: 200,
            headers: { get: (k) => (k.toLowerCase() === 'content-length' ? String(99 * 1024 * 1024) : null) },
            body: {},
            arrayBuffer: async () => new ArrayBuffer(8),
        });
        await assert.rejects(
            yt.downloadBuffer('https://cdn.example/big.mp3', { maxBytes: 25 * 1024 * 1024, fetch }),
            /too large/
        );
    });

    await ok('resolveVideo uses ytmp3pc search for queries', async () => {
        const fetch = async (url) => {
            const u = new URL(String(url));
            if (u.hostname === 'ytmp3pc.com') {
                return jsonResponse({ query: 'faded', items: [{ title: 'Alan Walker - Faded', videoId: VID2, thumbnail: 'https://i.yt/img.jpg', author: 'Alan Walker', duration: '3:33' }] });
            }
            throw new Error('unexpected ' + u.href);
        };
        const r = await yt.resolveVideo('faded alan walker', { fetch });
        assert.equal(r.videoId, VID2);
        assert.equal(r.title, 'Alan Walker - Faded');
        assert.equal(r.duration, 213);
    });

    await ok('resolveVideo passes URLs straight through', async () => {
        let searched = false;
        const fetch = async () => { searched = true; throw new Error('should not search'); };
        const r = await yt.resolveVideo('https://www.youtube.com/watch?v=' + VID, { fetch });
        assert.equal(r.videoId, VID);
        assert.equal(searched, false);
    });

    await ok('parseDuration handles seconds and m:ss / h:mm:ss', () => {
        assert.equal(yt.parseDuration(19), 19);
        assert.equal(yt.parseDuration('0:19'), 19);
        assert.equal(yt.parseDuration('3:33'), 213);
        assert.equal(yt.parseDuration('1:02:03'), 3723);
        assert.equal(yt.parseDuration('garbage'), null);
        assert.equal(yt.parseDuration(null), null);
    });

    await ok('case.js YT handlers use ytmp3pc (no yt-dlp gate left)', () => {
        const src = fs.readFileSync(path.join(__dirname, '..', 'case.js'), 'utf8');
        const slice = (from, to) => {
            const a = src.indexOf(from);
            const b = src.indexOf(to, a + 1);
            assert.ok(a !== -1 && b !== -1, `markers missing: ${from} / ${to}`);
            return src.slice(a, b);
        };
        const play = slice("case 'play':", "case 'bomb':");
        assert.ok(play.includes('downloadYouTubeAudio'), 'play uses downloadYouTubeAudio');
        assert.ok(!play.includes('ytdl-local'), 'play has no ytdl-local');
        assert.ok(!play.includes('yt-dlp installed nahi hai'), 'play has no yt-dlp gate');
        const play2 = slice("case 'play2':", "case 'ytmp4':");
        assert.ok(play2.includes('downloadYouTubeAudio'), 'play2 uses downloadYouTubeAudio');
        assert.ok(!play2.includes('ytdl-local'), 'play2 has no ytdl-local');
        const ytmp4 = slice("case 'ytmp4':", "case 'ytdl':");
        assert.ok(ytmp4.includes('downloadYouTubeVideo'), 'ytmp4 uses downloadYouTubeVideo');
        assert.ok(!ytmp4.includes('ytdl-local'), 'ytmp4 has no ytdl-local');
        const ytdl = slice("case 'ytdl':", "case 'dlstatus':");
        assert.ok(ytdl.includes('getYouTubeInfo'), 'ytdl uses getYouTubeInfo');
        assert.ok(ytdl.includes('downloadYouTubeVideo'), 'ytdl uses downloadYouTubeVideo');
        assert.ok(ytdl.includes('downloadYouTubeAudio'), 'ytdl uses downloadYouTubeAudio');
        assert.ok(!ytdl.includes('ytdl-local'), 'ytdl has no ytdl-local');
    });

    await ok('public-providers youtubeMp3/youtubeMp4 lead with ytmp3pc', () => {
        const src = fs.readFileSync(path.join(__dirname, '..', 'allfunc', 'public-providers.js'), 'utf8');
        assert.ok(src.includes("require('./ytmp3pc')"), 'ytmp3pc required');
        const mp3 = src.slice(src.indexOf('async function youtubeMp3'), src.indexOf('async function youtubeMp4'));
        assert.ok(mp3.includes('getYouTubeAudioUrl'), 'youtubeMp3 calls getYouTubeAudioUrl');
        assert.ok(mp3.indexOf('getYouTubeAudioUrl') < mp3.indexOf('NEXRAY_API_BASE'), 'ytmp3pc is first in youtubeMp3');
        const mp4 = src.slice(src.indexOf('async function youtubeMp4'), src.indexOf('async function faaYtPlay'));
        assert.ok(mp4.includes('getYouTubeVideoUrl'), 'youtubeMp4 calls getYouTubeVideoUrl');
        assert.ok(mp4.indexOf('getYouTubeVideoUrl') < mp4.indexOf('NEXRAY_API_BASE'), 'ytmp3pc is first in youtubeMp4');
    });

    if (failed) {
        console.log(`\n${failed} ytmp3pc test(s) failed`);
        process.exit(1);
    }
    console.log('\nAll ytmp3pc tests passed\n');
})();
