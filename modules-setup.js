#!/usr/bin/env node
/**
 * Module resolution fix — creates symlinks from root node_modules to
 * whatsapp-bot/node_modules so case.js and all routes can resolve
 * @whiskeysockets/baileys and other packages.
 *
 * Run: node modules-setup.js
 * Called automatically from server/index.js and replit workflows.
 */

const fs = require('fs');
const path = require('path');

const ROOT_NM    = path.join(__dirname, 'node_modules');
const WB_NM      = path.join(__dirname, 'whatsapp-bot', 'node_modules');

const PACKAGES = [
  '@whiskeysockets',
  '@hapi',
  'chalk', 'axios', 'fs-extra', 'human-readable', 'pino',
  'libsignal', 'ws', 'uuid', 'node-webpmux',
  'google-tts-api', 'fluent-ffmpeg', 'performance-now',
  'jimp', 'moment-timezone', 'yt-search', 'form-data',
  'wa-sticker-formatter', 'sharp', 'figlet',
  'awesome-phonenumber', 'lodash', 'node-cache'
];

let fixed = 0;
for (const pkg of PACKAGES) {
  const src = path.join(WB_NM, pkg);
  const dst = path.join(ROOT_NM, pkg);
  if (fs.existsSync(src) && !fs.existsSync(dst)) {
    try {
      // Ensure parent directory exists
      const parentDir = path.dirname(dst);
      if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir, { recursive: true });
      fs.symlinkSync(src, dst, 'junction');
      fixed++;
    } catch (e) {
      // ignore
    }
  }
}

if (fixed > 0) {
  console.log(`[modules-setup] Created ${fixed} symlink(s) — modules resolved`);
}
