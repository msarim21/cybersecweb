# CYBERSECPRO — production image (Railway / any Docker host)
FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    NPM_CONFIG_LEGACY_PEER_DEPS=true \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false \
    WHATSAPP_HOST_DYNO=web \
    WEB_API_ONLY=0 \
    BOT_ISOLATION=1

# ffmpeg: stickers/audio/video commands · python3: yt-dlp helper · git: some npm deps
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg python3 git ca-certificates webp imagemagick curl \
 && rm -rf /var/lib/apt/lists/*

# yt-dlp: standalone binary (no pip needed) — powers .play/.ytmp3/.ytvideo/.ytdown/.facebook/.xdl
RUN curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
      -o /usr/local/bin/yt-dlp \
 && chmod +x /usr/local/bin/yt-dlp \
 && yt-dlp --version

WORKDIR /app

# One dependency tree for server + bot (no duplicate Baileys copies)
COPY package.json package-lock.json* .npmrc ./
RUN npm install --omit=dev --legacy-peer-deps

# Dashboard build (dev deps only exist in this layer)
COPY client/package.json client/
RUN npm install --legacy-peer-deps --include=dev --prefix client
COPY . .
RUN npm run build --prefix client && rm -rf client/node_modules

EXPOSE 3001
CMD ["sh", "-c", "node --max-old-space-size=${NODE_HEAP_MB:-384} server/index.js"]
