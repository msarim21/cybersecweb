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

## Bug 10 - "Already Linked" Error After WhatsApp Logout (Critical Fix)
**Problem:** Jab WhatsApp se number logout ho jata hai (Error 405, bad session, ya explicit logout), to dashboard mein "NO NUMBERS LINKED YET" dikhta hai lekin re-pair karne par yeh error aata hai:
```
This number is already linked (session restored from DB). Unlink it first before re-pairing.
```

**Root Cause:**
Jab WhatsApp disconnect ya logout event fire hota tha (`pair.js` mein), ye cheezein hoti thi:
1. `forceCleanupSession()` → local filesystem session delete hota (nexstore/pairing/)
2. `setBotConnectionStatus('LOGGED_OUT')` → bot_sessions.connection_status update hota
3. `linked_numbers.status` → 'inactive' set hota (dashboard se number gayab)

**Lekin yeh nahi hota:**
- `deleteSessionCreds()` — **kabhi nahi call hota** → `session_creds` table mein purana stale data rehta tha!

Jab user dobara pair karne ki koshish karta:
1. `pairing.js` → `hasSessionInDb(clean)` → `session_creds` mein purana data milta → `true` return
2. Bina `connection_status` check kiye BLOCK kar deta → "already linked" error
3. Dashboard mein number nahi dikhta (linked_numbers inactive) lekin pairing bhi nahi ho sakti

**Fix:**
**Part A — `pair.js` (4 handlers fixed):** Har LOGGED_OUT event (405, 440 max retries, badSession, loggedOut) pe `deleteSessionCreds()` + `removeLinkedNumber()` call added:
```js
try {
    const { deleteSessionCreds, removeLinkedNumber } = require('./session-db');
    const cleanForDb = nexusDevNumber.replace(/[^0-9]/g, '');
    deleteSessionCreds(cleanForDb).catch(() => {});   // DB session creds delete
    removeLinkedNumber(cleanForDb).catch(() => {});   // linked_numbers cleanup
} catch (_) {}
```

**Part B — `server/routes/pairing.js` (smart status check):** `hasSessionInDb()` true return karne par seedha block karne ki jagah pehle `connection_status` check karo. Agar LOGGED_OUT/ERROR/DISCONNECTED/inactive ho to auto-clear karo aur fresh pairing allow karo:
```js
const staleStatuses = ['LOGGED_OUT', 'ERROR', 'DISCONNECTED', 'inactive'];
if (connStatus && staleStatuses.includes(connStatus)) {
    await deleteSessionCreds(clean).catch(() => {});
    await removeLinkedNumber(clean).catch(() => {});
    // Fall through — fresh pairing allowed
} else {
    return res.status(409).json({ error: 'This number is already linked...' });
}
```

**Files:** `pair.js`, `server/routes/pairing.js`

---

## Bug 11 - Bot Shows Offline When No Messages Coming (Watchdog Gap)
**Problem:** Bot WhatsApp se connected hota hai (wsState=1) lekin agar chat quiet ho (koi incoming message nahi) to website per "BOT OFFLINE" dikhna shuru ho jata hai kuch time baad.

**Root Cause:**
`allfunc/bot-heartbeat.js` ka `touchBotHeartbeat()` sirf tab call hota tha jab koi event fire ho:
- Message receive ho
- Connection open/ready event ho

Lekin agar bot connected hai aur koi message nahi aa raha to `touchBotHeartbeat` call nahi hota. `lastActive` DB mein update nahi hota. 15 minute ke baad `lastFresh = false` → dashboard "BOT OFFLINE" dikhaane lagta.

`pair.js` ka 30-second watchdog sirf `sendPresenceUpdate()` call karta tha — `touchBotHeartbeat()` nahi.

**Fix:**
`pair.js` watchdog (`setInterval` jo har 30s pe chalta hai) mein `touchBotHeartbeat` call added kiya jab `wsState === 1` (WebSocket open):
```js
if (wsState === 1) {
    nexus.sendPresenceUpdate('available').catch(() => {});
    // NEW: DB mein lastActive update karo (DB throttle = 60s, watchdog = 30s → har 60s DB update)
    try {
        const { touchBotHeartbeat } = require('./allfunc/bot-heartbeat');
        touchBotHeartbeat(cleanForDb, { event: 'watchdog', wsState: 1, ready: true });
    } catch (_) {}
}
```

**Result:** Jab tak bot ka WebSocket open hai, har 60 seconds mein DB `lastActive` update hota hai. 15-minute online window ke andar bot always "ONLINE" dikhega, chahe koi message na aaye.

**Files:** `pair.js`

---

## Bug 12 - Bot Keeps Working After Trial Expires (Delayed / Missed Disconnect)
**Problem:** User ka free trial khatam hone ke baad bhi uska bot kaam karta rehta tha aur number disconnect nahi hota tha turant — sirf `server/jobs/planExpiryJob.js` (har 60s) database state update karta tha, lekin live WhatsApp socket alag process/dyno (worker) mein chalta hai, isliye DB update se socket foran band nahi hota tha.

**Root Cause:** Trial-expiry enforcement sirf ek periodic DB sweep tha jo cross-process live connection ko force-kill nahi karta. Agar bot idle bhi ho (koi incoming message nahi), to us process ke andar koi check hi nahi tha jo owner ka subscription status dobara verify kare.

**Fix:**
- `allfunc/force-disconnect.js` (new): shared helper jo ek number ko turant socket-kill + DB creds wipe + `stopped-bots` list mein add + connected-flag remove karta hai (idempotent, planExpiryJob ki wipe-logic se consistent).
- `allfunc/subscription-guard.js` (new): `isNumberAuthorized(number)` — 20s cache ke saath owner ka ban/trial-expiry status check karta hai; `enforceSubscriptionOrDisconnect()` agar unauthorized ho to foran `forceDisconnectNumber()` call karta hai.
- `pair.js`: har incoming message se pehle aur 30s watchdog tick per (idle bots ke liye) subscription guard call hoti hai — expired/banned number ka reply turant drop ho jata hai aur socket turant disconnect ho jata hai (max ~30s latency for idle bots, near-instant for active ones).
- `server/db-service.js`: naya `getOwnerSubscriptionByNumber()` — number se seedha owner ka banned/subscriptionStatus/trialExpiresAt resolve karta hai (Mongo + Postgres dono).
- `server/routes/admin.js`: Ban toggle ab turant `forceDisconnectNumber()` call karta hai (pehle sirf DB flag set hota tha). Trial-extend / upgrade-approve / plan-update / plan-expiry endpoints ab `_reenableUserNumbers()` call karte hain jo `stopped-bots` clear karta hai aur guard cache invalidate karta hai, taake admin ke allow karne ke turant baad number dobara pair/reconnect ho sake.

**Result:** Trial expire hote hi (ya admin ban karte hi) bot turant band ho jata hai aur number disconnect ho jata hai — chahe woh live message process kar raha ho ya idle ho. Number tab tak reconnect nahi ho sakta jab tak admin trial extend ya upgrade approve na kare.

**Files:** `allfunc/force-disconnect.js` (new), `allfunc/subscription-guard.js` (new), `pair.js`, `server/db-service.js`, `server/routes/admin.js`

---

## Bug 13 - MongoDB Storage Quota Fills Up (~100 Users Ke Liye Scale Nahi Karta)
**Problem:** Admin panel mein MongoDB Atlas storage quota warning (555MB used) aa rahi thi. `ChatMessage` aur `PairingRequest` collections ki koi retention limit nahi thi, aur unlinked/expired numbers ke `BotSession.sessionData` (WhatsApp credential blobs) bhi hamesha ke liye DB mein pade rehte the.

**Root Cause:** Koi bhi automatic cleanup/archiving job nahi tha in teeno collections ke liye (sirf `antideletecaches` ka apna cleanup job tha), is liye storage sirf badhta hi jata tha.

**Fix:**
- `server/jobs/storageGuardJob.js` (new): har 6 ghante mein chalta hai —
  1. 30 din se purane `ChatMessage` docs ko `database/archives/chat-messages/*.json` mein archive karke Mongo se delete karta hai.
  2. 2 din se purane resolved `PairingRequest` docs (transient data, archive ki zarurat nahi) delete karta hai.
  3. Unlinked numbers ke 14+ din purane inactive `BotSession` docs ko (credentials strip karke) `database/archives/bot-sessions/*.json` mein archive karke delete karta hai.
- `server/models/ChatMessage.js` aur `server/models/PairingRequest.js`: TTL indexes add kiye taake collections khud-ba-khud bounded rahen (backlog cleanup ke liye job zaroori hai, lekin aage se TTL index bhi apna kaam karega).
- Retention windows env vars se configurable hain: `CHAT_MESSAGE_RETENTION_DAYS` (default 30), `PAIRING_REQUEST_RETENTION_DAYS` (default 2), `ORPHAN_SESSION_RETENTION_DAYS` (default 14).
- `database/archives/` (`.gitignore`'d, sirf disk per rehta hai) — purana data delete karne se pehle yahan JSON files mein save hota hai, is se MongoDB storage khali hoti hai lekin data zaya nahi hota.

**Result:** MongoDB mein sirf recent/active data rehta hai (chat history 30 din, pairing requests 2 din, dead sessions 14 din), extra/purana data local JSON archives mein move ho jata hai — DB ~100 users ke liye scale karta hai bina quota hit kiye.

**Files:** `server/jobs/storageGuardJob.js` (new), `server/models/ChatMessage.js`, `server/models/PairingRequest.js`, `server/index.js`, `.gitignore`
