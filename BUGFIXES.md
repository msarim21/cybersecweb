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
---

## Bug 7 - Paired Numbers Disappear from Dashboard (Critical Fix)
**Problem:** When a WhatsApp number is paired via the website, it disappears from the dashboard after ~1 minute and is never permanently saved in the database.

**Root Cause (3 separate bugs):**
1. `savePairingOwner()` in `server/db-service.js` had NO MongoDB support — only PostgreSQL code. If app uses MongoDB, the pairing owner info was never stored, so auto-save on connect had no owner to attribute the number to.
2. `getAndClearPairingOwner()` in `server/db-service.js` had NO MongoDB support — always called `pg()` which returns `null` in MongoDB mode, causing silent failure.
3. `session-db.js` parsed `userId` as `parseInt(pending.user_id, 10)`, which returns `NaN` for MongoDB ObjectId strings (e.g. `"507f1f77bcf86cd799439011"`). The `!isNaN(userId)` guard then blocked the auto-save entirely.
4. `isNumberInLinkedNumbers()` was missing from `module.exports` in `db-service.js`, causing `orphanDisconnectJob` to crash with a TypeError on every check.

**Fix:**
- `server/db-service.js`:
  - Added full MongoDB support to `savePairingOwner()` (uses `BotSession.findOneAndUpdate` with `pairingOwnerId`/`pairingBotName` fields)
  - Added full MongoDB support to `getAndClearPairingOwner()` (reads and clears `pairingOwnerId`/`pairingBotName` from BotSession)
  - Added new `isNumberInLinkedNumbers(number)` function (supports both MongoDB and PostgreSQL)
  - Exported `isNumberInLinkedNumbers` from module.exports
- `session-db.js`:
  - Replaced `parseInt(pending.user_id, 10)` + `!isNaN(userId)` guard with a smart parser: uses integer for numeric IDs (PostgreSQL), keeps as-is for ObjectId strings (MongoDB)
  - Replaced inline duplicate-check SQL with call to `isNumberInLinkedNumbers()` — works for both DB modes
  - Added MongoDB LinkedNumber activate path in the "already exists" branch

**Result:** When any WhatsApp number successfully pairs (connection opens), its number is immediately and permanently saved to `linked_numbers` in the database. The dashboard shows it on the next refresh and it never disappears.

**Files:** `server/db-service.js`, `session-db.js`

## Bug 8 - BOT OFFLINE on Dashboard (Critical Fix)
**Problem:** Bot is running and connected to WhatsApp but dashboard shows "BOT OFFLINE".

**Root Cause:**
On Heroku, the **web dyno** and **worker dyno** have separate ephemeral filesystems. Heartbeat files written by the worker dyno (`database/bots/<num>/heartbeat.json`) are completely invisible to the web dyno — so `isBotHeartbeatFresh()` always returns `false` on the web dyno. The only cross-dyno liveness signal is the database `lastActive` timestamp.

In `server/routes/numbers.js`, the bot is shown as `online` only when:
```js
if (sess?.connectionStatus === 'CONNECTED' && lastFresh) return 'online';
```
Where `lastFresh = Date.now() - sess.lastActive <= 15 minutes`.

The bug was in `allfunc/bot-heartbeat.js` — inside `touchBotHeartbeat()`, there was an early `return` when `extra.ready === false`:
```js
if (extra.ready === false) return;   // ← BUG: skips upsertBotSession
await upsertBotSession(clean, 'active', meta);
```
This meant `upsertBotSession()` (which updates `lastActive` in the DB) was NEVER called when the bot was in a non-ready state (e.g. still syncing, wsState not yet 1). After 15 minutes, `lastActive` became stale → `lastFresh = false` → dashboard showed "BOT OFFLINE" forever.

**Fix:**
- `allfunc/bot-heartbeat.js`: Removed the `if (extra.ready === false) return;` guard. `upsertBotSession` is now always called when the DB throttle window passes, keeping `lastActive` fresh every ~60 seconds regardless of ready state. The `commandReady` field is still only set when `ready === true`, preserving existing behavior.

**Files:** `allfunc/bot-heartbeat.js`

## Bug 9 - Antidelete "Original Message Not in Cache" (Critical Fix)
**Problem:** Antidelete frequently shows `[Original message not in cache]` when someone deletes a message, even though the bot was running and online.

**Root Cause:**
In `pair.js`, the `messages.upsert` event handler had this order:

```js
// 1. Ephemeral unwrap
nexusboijid.message = ...ephemeralMessage...

// 2. ❌ PRIVATE MODE GUARD — early return here
if (!nexus.public && !nexusboijid.key.fromMe && chatUpdate.type === 'notify') return;

// 3. case.js fires...

// 4. setImmediate() {
//      cacheMessageForAntidelete(nexusboijid, nexus);  ← NEVER REACHED in private mode
// }
```

When the bot is in **private/self mode** (`.self` command), any message received from another person hits the guard at step 2 and returns immediately — the `cacheMessageForAntidelete` call inside `setImmediate` at step 4 is **never executed**. The message is never stored in the antidelete cache. When the sender deletes it, the bot has no record of it and reports `[Original message not in cache]`.

**Fix:**
- `pair.js`: Moved `cacheMessageForAntidelete` call to BEFORE the private-mode guard (but after the ephemeral unwrap). The cache now runs for every valid incoming message regardless of bot mode. Removed the duplicate call from inside `setImmediate`.

**Result:** Antidelete now correctly caches messages from all senders in all bot modes (public, private, group-only, etc.), so delete events reliably recover the original message content.

**Files:** `pair.js`
