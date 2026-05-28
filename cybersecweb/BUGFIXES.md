# CYBERSECPRO - Bug Fixes (6 Bugs)

## Status: All Fixed & Pushed to GitHub

### Bug 1 - Audio Upload Fails (Admin Panel)
**Problem:** Audio files fail to upload in Admin Panel.
**Root Cause:**
- Multer `fileFilter` rejected `application/octet-stream` MIME type (sent by some browsers for audio files)
- Frontend had incorrect `Content-Type: undefined` header and 25s timeout
**Fix:**
- `server/routes/admin.js`: Multer now accepts `application/octet-stream` + valid audio extension
- `client/src/pages/Admin.jsx`: Removed bad `Content-Type` header, increased timeout to 60s
**Files:** `server/routes/admin.js`, `client/src/pages/Admin.jsx`

### Bug 2 - Pair Code Auto-Save Never Works
**Problem:** After scanning QR code, number never auto-saves to the dashboard.
**Root Cause:** `autoSaved.current = true` was set BEFORE the status check, so if the first poll returned `connected=false`, it never retried.
**Fix:** `client/src/pages/Dashboard.jsx`: Moved `autoSaved.current = true` to ONLY execute after `data.connected === true` is confirmed.
**Files:** `client/src/pages/Dashboard.jsx`

### Bug 3 - Orphan Bot Auto-Disconnect (30s)
**Problem:** Active bots not linked to the database were never auto-disconnected.
**Root Cause:** No job existed to periodically scan for orphan bots.
**Fix:**
- Created `server/jobs/orphanDisconnectJob.js` - scans every 30 seconds, checks `connected.flag` vs DB, disconnects orphans
- Registered in `server/index.js` alongside `planExpiryJob`
**Files:** `server/jobs/orphanDisconnectJob.js` (new), `server/index.js`

### Bug 4 - Broadcast List Missing Private Chats
**Problem:** After server restart, `.bclist` only shows groups, no private chats.
**Root Cause:** `autoScanBroadcastList` only used `store.chats` which is empty after restart.
**Fix:** `pair.js`: Added `database/private_chats.json` as a new source (Source 3) - `bgChatScanner` continuously saves here, so it survives restarts.
**Files:** `pair.js`

### Bug 5 - Anti-Edit Not Working (DMs & Groups)
**Problem:** Anti-edit notifications are missing or incorrectly sent.
**Root Cause:** In DMs, `_aeEditedBy` was incorrectly set to `m.key.participant` (which is undefined in DMs), and `m.key.remoteJid` (bot's own number) caused false matches. Also `:1` device suffix on JIDs caused wrong number comparisons.
**Fix:** `case.js`:
- DMs: Use `_aeChatId` as `_aeEditedBy` (since remoteJid IS the sender)
- Groups: Use `m.key.participant` as before
- Strip `:1` device suffix from JIDs for proper number comparison
- Mentions only include valid JIDs (with `@`)
**Files:** `case.js`

### Bug 6 - Channel Commands No Response
**Problem:** Channel/newsletter commands don't respond even from the owner.
**Root Cause:** `isCreator` check failed because channel sender JIDs have `:1` suffix (e.g., `923001234567:1@s.whatsapp.net`), so the number comparison with `owner` array failed.
**Fix:** `case.js`: Strip `:1` suffix from `m.sender` before matching against `owner` array for channel messages.
**Files:** `case.js`

---
Pushed to: https://github.com/msarim21/cybersecweb
