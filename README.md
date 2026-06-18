<div align="center">

# ⚡ CYBERSECPRO

### WhatsApp Bot Management Platform

**Link numbers · Run 650+ commands · Manage everything from one cyber dashboard**

[![Deploy to Heroku](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy?template=https://github.com/msarim21/cybersecweb)
[![Node.js 20](https://img.shields.io/badge/Node.js-20.x-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Baileys](https://img.shields.io/badge/WhatsApp-Baileys-25D366?style=for-the-badge&logo=whatsapp&logoColor=white)](https://github.com/WhiskeySockets/Baileys)
[![React](https://img.shields.io/badge/Dashboard-React_18-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-8b5cf6?style=for-the-badge)](LICENSE)

[Live Demo](https://cybersecpro.site) · [Features](#-features) · [Deploy](#-deployment) · [Commands](#-bot-commands) · [Support](#-support)

---

*A full-stack SaaS platform — pair WhatsApp via code, control bots from the web, scale to 60+ numbers on Heroku.*

</div>

---

## ✨ Features

| | |
|---|---|
| 🔗 **Pairing Code Linking** | Connect any number from the dashboard — no QR scan on desktop |
| 🎛️ **Control Center** | Real-time bot status: `STARTING` → `SYNCING` → `ONLINE` |
| 🤖 **650+ Commands** | AI, downloaders, group tools, stickers, games, anime & more |
| 👥 **Multi-Tenant SaaS** | Free trial, Pro & Enterprise plans with slot limits |
| 🛡️ **Isolated Bot Workers** | One process per number — stable on 1 GB Heroku worker dynos |
| 🔄 **Session Persistence** | Credentials saved to DB — survives dyno restarts |
| 📊 **Admin Panel** | User management, support chat, pairing queue, site settings |
| ⚡ **Smart Rotation** | LRU turbo rotation runs 60 bots on limited RAM without crashes |

---

## 🏗 Architecture

```
                         ┌─────────────────────────────────────┐
                         │           CYBERSECPRO CLOUD          │
                         └─────────────────────────────────────┘
                                              │
              ┌───────────────────────────────┼───────────────────────────────┐
              │                               │                               │
     ┌────────▼────────┐            ┌─────────▼─────────┐          ┌─────────▼─────────┐
     │   Web Dyno      │   /api     │   MongoDB /       │          │  Worker Dyno      │
     │  Express +      │◄──────────►│  PostgreSQL       │◄────────►│  Supervisor       │
     │  React (Vite)   │            │  (sessions, users)│          │  + bot-runner × N   │
     └────────┬────────┘            └───────────────────┘          └─────────┬─────────┘
              │                                                                │
              │  Dashboard · Auth · Pairing API                                │  Baileys
              └────────────────────────────────────────────────────────────────┘
                                              │
                                    ┌─────────▼─────────┐
                                    │  WhatsApp (MD)    │
                                    │  pair.js + case.js│
                                    └───────────────────┘
```

**How it works**

1. User signs up and links a WhatsApp number via **pairing code**
2. **Web dyno** serves the React dashboard and REST API
3. **Worker dyno** runs an isolated Baileys session per bot (supervisor + LRU rotation)
4. Session files are backed up to the database — reconnect after Heroku restart

---

## 🛠 Tech Stack

| Layer | Technology |
|:------|:-----------|
| **Frontend** | React 18 · Vite · Tailwind CSS · Framer Motion |
| **Backend** | Node.js 20 · Express.js · JWT Auth |
| **Database** | MongoDB Atlas **or** PostgreSQL (Heroku Postgres) |
| **WhatsApp** | [@whiskeysockets/baileys](https://github.com/WhiskeySockets/Baileys) multi-device |
| **Workers** | `worker_threads` supervisor · per-bot isolation |
| **Security** | Helmet · rate limiting · bcrypt · mongo-sanitize |

> **Requires Node.js 20.x** — Baileys does not run on Node 18.

---

## 🚀 Quick Start (Local)

```bash
# 1. Clone
git clone https://github.com/msarim21/cybersecweb.git
cd cybersecweb

# 2. Install
npm install --legacy-peer-deps
cd client && npm install && npm run build && cd ..

# 3. Configure
cp .env.example .env
# Edit .env — set MONGO_URL (or DATABASE_URL) and JWT_SECRET

# 4. Run
npm start
# Open http://localhost:3001
```

---

## 🌐 Deployment

### Heroku (Recommended)

#### One-click

Click **Deploy to Heroku** at the top of this README, then set your config vars.

#### Manual CLI

```bash
heroku login
heroku create your-app-name

# Required
heroku config:set MONGO_URL="mongodb+srv://user:pass@cluster.mongodb.net/cybersecpro"
heroku config:set JWT_SECRET="$(openssl rand -hex 64)"
heroku config:set NODE_ENV=production
heroku config:set NPM_CONFIG_LEGACY_PEER_DEPS=true

# WhatsApp worker (1 GB Standard-2X recommended)
heroku config:set WHATSAPP_HOST_DYNO=worker
heroku config:set BOT_ISOLATION=1
heroku config:set DYNO_TOTAL_RAM_MB=1024
heroku config:set BOT_CHILD_HEAP_MB=96
heroku config:set MAX_CONCURRENT_BOTS=7
heroku config:set SYNC_FULL_HISTORY=0

heroku ps:resize worker=standard-2x
git push heroku main
```

#### Procfile processes

| Process | Command | Role |
|:--------|:--------|:-----|
| `web` | `server/index.js` | API + React dashboard |
| `worker` | `worker.js` | WhatsApp bot supervisor |

> Sessions are stored in the database. After a dyno restart, bots auto-reconnect — no re-pairing needed.

#### Scaling 60 bots on 1 GB

The worker uses **LRU turbo rotation**: up to `MAX_CONCURRENT_BOTS` run live at once; others queue and rotate in safely. Tune via `.env.example` vars.

---

### Railway

Best for **persistent disk** if you prefer local session files.

1. [railway.app](https://railway.app) → **Deploy from GitHub**
2. Set env vars (see [Environment Variables](#-environment-variables))
3. Add volume: mount path `/app/nexstore`, size 1 GB
4. Set `NIXPACKS_NODE_VERSION=20`

---

### Render

1. [render.com](https://render.com) → **Web Service** from repo
2. Build: `npm install --legacy-peer-deps && npm run build`
3. Start: `node server/index.js`
4. Add disk at `/opt/render/project/src/nexstore` (1 GB)

---

### VPS (Ubuntu / Debian)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs nginx
git clone https://github.com/msarim21/cybersecweb /var/www/cybersecpro
cd /var/www/cybersecpro
npm install --legacy-peer-deps
cd client && npm install && npm run build && cd ..
cp .env.example .env && nano .env

sudo npm install -g pm2
pm2 start server/index.js --name cybersecpro-web
pm2 start worker.js --name cybersecpro-worker
pm2 save && pm2 startup
```

Use Nginx as reverse proxy on port 3001 and Certbot for HTTPS.

---

## 🔐 Environment Variables

### Required

| Variable | Description |
|:---------|:------------|
| `MONGO_URL` | MongoDB Atlas connection string **or** use `DATABASE_URL` for PostgreSQL |
| `JWT_SECRET` | Random secret for JWT — `openssl rand -hex 64` |

### Admin (first boot)

| Variable | Description |
|:---------|:------------|
| `ADMIN_EMAIL` | Auto-created admin email |
| `ADMIN_PASSWORD` | Admin password (min 6 chars) |

### WhatsApp worker tuning

| Variable | Default | Description |
|:---------|:--------|:------------|
| `WHATSAPP_HOST_DYNO` | `worker` | Run bots on worker dyno |
| `BOT_ISOLATION` | `1` | One isolated process per bot |
| `DYNO_TOTAL_RAM_MB` | `1024` | Worker dyno RAM budget |
| `BOT_CHILD_HEAP_MB` | `96` | Heap per bot child |
| `MAX_CONCURRENT_BOTS` | `7` | Live bots at once on 1 GB |
| `SYNC_FULL_HISTORY` | `0` | Keep `0` — prevents phone sync hang |
| `BOT_TURBO_ROTATION` | `1` | Fast LRU when linked bots **exceed** `MAX_CONCURRENT`; if ≤7 bots, all run 24/7 with no swap |
| `BOT_MIN_UPTIME_MS` | `300000` | Min 5 min live before a bot can be rotated out (only when at RAM cap) |
| `TOTAL_WORKER_DYNOS` | `1` | Shard bots across worker dynos |

See [`.env.example`](.env.example) for the full list.

---

## 📱 Linking a WhatsApp Number

1. Sign up at `/signup` and log in
2. Click **Link New WhatsApp Number**
3. Enter number with country code, **no `+`** — e.g. `923001234567`
4. On your phone: **WhatsApp → Linked Devices → Link a Device → Link with phone number**
5. Enter the 8-digit pairing code from the dashboard
6. Wait for status **SYNCING** → **ONLINE**, then send `.menu`

---

## 🤖 Bot Commands

**650+ commands** across 15 categories. Type `.menu` or `.allmenu` in WhatsApp for the full list.

| Category | Examples |
|:---------|:---------|
| 📋 Menu | `.menu` `.allmenu` `.aimenu` `.downloadmenu` |
| 🤖 AI | `.ai` `.metaai` `.codeai` `.gpt3` |
| ⬇️ Download | `.ytmp3` `.ytmp4` `.tiktok` `.igdl` `.fbdl` |
| 👥 Group | `.add` `.kick` `.tagall` `.antilink` `.warns` |
| 🎭 Sticker | `.sticker` `.steal` `.tosticker` |
| 🎮 Fun | `.flirt` `.roast` `.ship` `.truth` `.dare` |
| 🛠 Tools | `.ping` `.alive` `.weather` `.wiki` |
| 🌸 Anime | `.waifu` `.naruto` `.sasuke` `.animemenu` |
| 👑 Owner | `.broadcast` `.mode` `.setsudo` `.pair` |

Default prefix: `.` — change per user with `.setprefix`

---

## 👑 Admin Access

**Option A — Environment variables (recommended)**

Set `ADMIN_EMAIL` + `ADMIN_PASSWORD` before first boot. Log in at `/login`.

**Option B — Promote existing user**

```bash
node -e "
require('dotenv').config();
const { initDb } = require('./server/db');
const svc = require('./server/db-service');
initDb().then(async () => {
  const user = await svc.findUserByEmail('user@example.com');
  if (!user) return console.log('User not found');
  await svc.setAdminRole(user.id);
  console.log('Admin granted:', user.email);
  process.exit(0);
});
"
```

---

## ✅ Post-Deploy Checklist

- [ ] `GET /api/health` returns API online + DB connected
- [ ] Sign up and dashboard loads
- [ ] Pair a test number — code appears within ~40s
- [ ] Bot status shows **ONLINE** and `.menu` responds
- [ ] Restart worker dyno — bot reconnects without re-pairing
- [ ] `SYNC_FULL_HISTORY=0` is set (prevents WhatsApp sync hang)

---

## 🔧 Troubleshooting

<details>
<summary><strong>Pairing code not generating</strong></summary>

- Use country code only, no `+` or spaces: `923001234567`
- Wait up to 40 seconds; increase Nginx `proxy_read_timeout` to 60s
- Disconnect the number and retry — stale sessions are cleared automatically
</details>

<details>
<summary><strong>Bot shows ONLINE but commands don't respond</strong></summary>

- Wait for **SYNCING** to finish (~3 seconds after connect)
- Ensure `SYNC_FULL_HISTORY=0` in Heroku config
- Restart the **worker** dyno: `heroku ps:restart worker`
- Check worker logs: `heroku logs --tail --dyno worker`
</details>

<details>
<summary><strong>WhatsApp stuck on "Syncing. Keep app open."</strong></summary>

- Set `SYNC_FULL_HISTORY=0` and restart worker
- Do not enable full history sync on production — it hangs the phone
</details>

<details>
<summary><strong>Sessions lost after restart</strong></summary>

- Ensure MongoDB/Postgres is connected — sessions backup to DB
- On Railway/Render/VPS, mount a volume at `nexstore/` for local files
</details>

<details>
<summary><strong>Heap / memory errors (R14/R15)</strong></summary>

- Use Standard-2X (1 GB) worker dyno
- Lower `MAX_CONCURRENT_BOTS` to `5` if needed
- Set `BOT_CHILD_HEAP_MB=96` and `BOT_DISABLE_CHAT_STORE=1`
</details>

<details>
<summary><strong>Blank dashboard page</strong></summary>

```bash
cd client && npm install && npm run build
```
Express serves `client/dist/` automatically in production.
</details>

---

## 📂 Project Structure

```
cybersecweb/
├── client/           # React dashboard (Vite)
├── server/           # Express API, routes, models
├── worker/           # Bot supervisor + isolated bot-runner
├── pair.js           # Baileys connection & pairing
├── case.js           # 650+ WhatsApp command handlers
├── autoload.js       # Auto-start linked bots on boot
├── session-db.js     # Session backup / restore
└── nexstore/         # Local auth state (paired with DB backup)
```

---

## 🤝 Support

| Channel | Link |
|:--------|:-----|
| Telegram | [@gamechanger2007](https://t.me/gamechanger2007) |
| Instagram | [@msarim21](https://www.instagram.com/msarim21) |
| Website | [cybersecpro.site](https://cybersecpro.site) |

---

## 📄 License

MIT © [msarim21](https://www.instagram.com/msarim21)

---

<div align="center">

**Built with ⚡ by CYBERSECPRO**

*Pair once. Command forever.*

</div>
