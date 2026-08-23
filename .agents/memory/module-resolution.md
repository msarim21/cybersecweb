---
name: Module resolution
description: Root node_modules lacks runtime deps — commands silently fail to load. modules-setup.js symlinks whatsapp-bot/node_modules.
---
## Problem
`case.js` (724+ commands) uses `require("@whiskeysockets/baileys")` and other packages that only exist in `whatsapp-bot/node_modules/`. When loaded from root via `require('./case')`, Node resolution fails and every command silently breaks.

## Fix
`modules-setup.js` creates symlinks from root `node_modules/` → `whatsapp-bot/node_modules/` for all 23+ missing packages. Called from `server/index.js` at startup.

**Why:** npm install is blocked by security policy (403), so a postinstall script isn't feasible. Symlinks are the only reliable workaround.

**How to apply:** The file auto-runs on backend start. If adding more deps, add the package name to the `PACKAGES` array in `modules-setup.js`.
