'use strict';
// Anime reaction GIFs: multi-source fetch + GIF→MP4 conversion.
// WhatsApp only plays "gifPlayback" when the bytes are MP4, so raw GIF
// buffers were silently failing before.
const axios = require('axios');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const UA = 'Mozilla/5.0 (X11; Linux x86_64) WhatsApp-Bot/1.0';
const OTAKU = new Set(['airkiss','angrystare','bite','bleh','blush','brofist','celebrate','cheers','clap','confused','cool','cry','cuddle','dance','drool','evillaugh','facepalm','handhold','happy','headbang','hug','huh','kiss','laugh','lick','love','mad','nervous','no','nom','nosebleed','nuzzle','nyah','pat','peek','pinch','poke','pout','punch','roll','run','sad','scared','shout','shrug','shy','sigh','sip','slap','sleep','slowclap','smack','smile','smug','sneeze','sorry','stare','stop','surprised','sweat','thumbsup','tickle','tired','wave','wink','woah','yawn','yay','yes']);
const OTAKU_ALIAS = { highfive: 'clap', glomp: 'hug', bonk: 'smack', bully: 'punch', yeet: 'punch', kill: 'punch', kick: 'punch', cringe: 'facepalm', shoot: 'punch', nya: 'nyah', awoo: 'nyah' };
const LIFE = { kiss: 'kiss', hug: 'hug', slap: 'slap', pat: 'pat', smug: 'smug', cuddle: 'cuddle', tickle: 'tickle', feed: 'feed', poke: 'poke' };

async function getJson(url) {
  const { data } = await axios.get(url, { timeout: 10000, headers: { 'User-Agent': UA } });
  return data;
}

async function getReactionGifUrl(action) {
  const a = String(action || '').toLowerCase();
  try { const d = await getJson(`https://nekos.best/api/v2/${a}?amount=1`); if (d?.results?.[0]?.url) return d.results[0].url; } catch (_) {}
  const o = OTAKU.has(a) ? a : (OTAKU_ALIAS[a] || 'pat');
  try { const d = await getJson(`https://api.otakugifs.xyz/gif?reaction=${o}`); if (d?.url) return d.url; } catch (_) {}
  try { const d = await getJson(`https://nekos.life/api/v2/img/${LIFE[a] || 'pat'}`); if (d?.url) return d.url; } catch (_) {}
  return null;
}

function gifToMp4(buf) {
  return new Promise((resolve) => {
    const id = Date.now() + '_' + Math.random().toString(36).slice(2);
    const inF = path.join(os.tmpdir(), `ag_${id}.gif`), outF = path.join(os.tmpdir(), `ag_${id}.mp4`);
    try { fs.writeFileSync(inF, buf); } catch (_) { return resolve(null); }
    execFile('ffmpeg', ['-y', '-i', inF, '-movflags', 'faststart', '-pix_fmt', 'yuv420p', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-an', outF], { timeout: 45000 }, (err) => {
      let out = null;
      if (!err) { try { out = fs.readFileSync(outF); } catch (_) {} }
      for (const f of [inF, outF]) { try { fs.unlinkSync(f); } catch (_) {} }
      resolve(out && out.length ? out : null);
    });
  });
}

async function sendAnimeReaction(sock, m, action, caption) {
  const url = await getReactionGifUrl(action);
  if (!url) throw new Error('All anime GIF APIs down');
  const { data } = await axios.get(url, { responseType: 'arraybuffer', timeout: 20000, headers: { 'User-Agent': UA } });
  const buf = Buffer.from(data);
  const isGif = buf.slice(0, 3).toString() === 'GIF';
  const mp4 = isGif ? await gifToMp4(buf) : buf;
  if (mp4) return sock.sendMessage(m.chat, { video: mp4, gifPlayback: true, mimetype: 'video/mp4', caption }, { quoted: m });
  return sock.sendMessage(m.chat, { image: buf, caption }, { quoted: m });
}

module.exports = { getReactionGifUrl, gifToMp4, sendAnimeReaction };
