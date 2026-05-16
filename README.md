# CYBERSECPRO — Futuristic WhatsApp Bot Management System

  > 🔐 A full-stack cyberpunk SaaS platform where users sign up, link their WhatsApp numbers via pairing codes, and manage their bot sessions through a holographic web dashboard.

  [![Deploy to Heroku](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy?template=https://github.com/msarim21/cybersecweb)

  ---

  ## ✨ Features

  ### 👤 User Panel
  - Signup / Login with JWT authentication
  - Link WhatsApp numbers via pairing code (Baileys multi-device)
  - Real-time session management dashboard
  - Subscription plans: Free (1 number) → Pro (5 numbers) → Enterprise (unlimited)
  - 24-hour free trial with countdown timer
  - Request plan upgrade — admin approves/rejects

  ### 🛡️ Admin Panel
  - **Overview** — live stats: users, numbers, active sessions
  - **Users** — ban/unban, delete, change plans
  - **Numbers** — view all linked WhatsApp numbers
  - **Upgrades** — approve or reject user upgrade requests
  - **Security** — real-time threat log (SQLi, XSS, brute-force, CORS violations)
  - **Audio** — upload background music that plays on the user dashboard
  - **🔞 Access Control** — set/change the 18+ secret code, view & manage unlocked users

  ### 🤖 WhatsApp Bot (200+ commands)
  - **Status Tools** — download status media, auto-status reply
  - **Media** — stickers, image editing, video conversion
  - **Social** — YouTube, TikTok, Instagram, Twitter downloader
  - **AI** — ChatGPT, image generation, TTS
  - **Group Tools** — antilink, tagall, mute/unmute members
  - **Security** — anti-spam, anti-stale, rate limiting
  - **🔞 18+ System** — adult commands hidden by default, unlocked via secret code

  ### 🔞 18+ Secret Unlock System
  - All adult commands (`.xnxx`, `.xvideos`, etc.) are **completely hidden** from menus by default
  - Admin sets a global secret code from the Admin Panel → ACCESS tab
  - Users type `.addsecret [code]` to unlock — no admin action needed per user
  - Admin can change the code anytime, view all unlocked users, and revoke access

  ---

  ## 🏗️ Architecture

  ```
  ┌──────────────────────────────────────────────────────┐
  │                    CYBERSECPRO                       │
  │                                                      │
  │  ┌─────────────────┐     ┌──────────────────────┐   │
  │  │  React + Vite   │────▶│  Express.js API      │   │
  │  │   (Frontend)    │/api │  server/index.js     │   │
  │  └─────────────────┘     │  Port: $PORT         │   │
  │                          └──────────┬───────────┘   │
  │                                     │               │
  │                          ┌──────────▼───────────┐   │
  │                          │   MongoDB (Mongoose)  │   │
  │                          │   via MONGO_URL       │   │
  │                          └──────────────────────┘   │
  │                                                      │
  │  ┌───────────────────────────────────────────────┐   │
  │  │  pair.js  (Baileys — WhatsApp multi-session)  │   │
  │  │  Sessions → nexstore/pairing/                 │   │
  │  │  Auto-reconnects on every server restart      │   │
  │  └───────────────────────────────────────────────┘   │
  └──────────────────────────────────────────────────────┘
  ```

  ---

  ## 🛠️ Tech Stack

  | Layer | Technology |
  |---|---|
  | Frontend | React 19, Vite 7, Tailwind CSS, Framer Motion |
  | Backend | Node.js 20, Express.js |
  | Database | MongoDB (Mongoose) |
  | WhatsApp | @whiskeysockets/baileys (multi-device) |
  | Auth | JWT (jsonwebtoken) + bcryptjs |
  | Security | Helmet, express-rate-limit, CORS protection |

  ---

  ## ⚙️ Environment Variables

  | Variable | Required | Description |
  |---|---|---|
  | `MONGO_URL` | **Yes** | MongoDB Atlas connection string |
  | `JWT_SECRET` | **Yes** | Long random string for auth tokens |
  | `ADMIN_EMAIL` | No | Email for auto-created admin account |
  | `ADMIN_PASSWORD` | No | Password for auto-created admin account |
  | `PORT` | No | API port — defaults to `3001` |
  | `NODE_ENV` | No | Set to `production` on live deployments |

  ---

  ## 🚀 Deployment Guides

  ### Heroku

  ```bash
  heroku login
  heroku create your-app-name
  heroku config:set MONGO_URL="..." JWT_SECRET="..." ADMIN_EMAIL="..." ADMIN_PASSWORD="..." NODE_ENV="production"
  git push heroku main
  ```

  > ⚠️ Heroku has ephemeral storage — WhatsApp sessions are lost on dyno restart. Use Railway or VPS for persistent sessions.

  ---

  ### Railway *(Recommended)*

  1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**
  2. Set environment variables in the **Variables** tab
  3. Add a volume: **Settings → Volumes** → mount at `/app/nexstore` (1 GB)
  4. Set `NIXPACKS_NODE_VERSION=20`

  ---

  ### Render

  1. **New → Web Service** → connect repo
  2. Build: `npm install --legacy-peer-deps && npm run build`
  3. Start: `node server/index.js`
  4. Add disk: mount at `/opt/render/project/src/nexstore` (1 GB)

  ---

  ### VPS (Ubuntu / Debian)

  ```bash
  # Install Node 20
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt install -y nodejs

  # Clone & install
  git clone https://github.com/msarim21/cybersecweb
  cd cybersecweb
  npm install --legacy-peer-deps
  cd client && npm install && npm run build && cd ..
  cd server && npm install && cd ..

  # Create .env and run with PM2
  pm2 start server/index.js --name cybersecpro
  pm2 save && pm2 startup
  ```

  ---

  ## 🔐 Admin Access

  Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` before first boot — admin account is auto-created on startup.

  Log in at `/login` and navigate to `/admin`.

  ---

  ## ✅ Post-Deployment Checklist

  - [ ] `GET /api/health` returns `{ "status": "CYBERSECPRO API Online" }`
  - [ ] Logs show `✅ MongoDB connected`
  - [ ] Sign up and log in — dashboard loads correctly
  - [ ] Link a WhatsApp number via pairing code
  - [ ] Bot sends welcome message after linking
  - [ ] Admin panel accessible at `/admin`
  - [ ] 18+ Access Control tab visible in admin panel

  ---

  ## 🔧 Troubleshooting

  | Problem | Solution |
  |---|---|
  | `Cannot find module '@whiskeysockets/baileys'` | Run `npm install --legacy-peer-deps` with Node 20 |
  | Pairing code never arrives | Wait 2 min and retry; check `proxy_read_timeout 60s` on Nginx |
  | Sessions lost after restart | Mount persistent volume at `nexstore/` |
  | Frontend shows blank page | Run `cd client && npm run build` first |
  | MongoDB connection error | Verify `MONGO_URL` in your env vars |

  ---

  ## 📞 Contact & Credits

  - 📲 WhatsApp Channel: [CYBERSECPRO](https://whatsapp.com/channel/0029Vb5jIRv6xCSQAhlsYQ1D)
  - 👨‍💻 Developer: [@msarim21](https://github.com/msarim21)

  ---

  <p align="center">
    <b>⚡ CYBERSECPRO © 2026 — All Rights Reserved ⚡</b>
  </p>
  