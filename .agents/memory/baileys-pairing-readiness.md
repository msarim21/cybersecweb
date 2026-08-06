---
name: Baileys pairing readiness
description: Readiness behavior required by current Baileys pairing-code flow.
---

Baileys 7 may not expose a reliable `socket.ws.readyState` on the object returned by `makeWASocket`. Pairing-code requests must wait for the socket's public `waitForSocketOpen()` helper when available, with a bounded retry while the tracked socket remains current.

**Why:** `requestPairingCode()` sends its registration IQ immediately. Issuing it before the underlying WebSocket is open can produce a code that WhatsApp rejects even though the UI displays it correctly.

**How to apply:** Wait on `waitForSocketOpen()` before requesting the code and retain the explicit `readyState` check only as an older-version fallback. Keep the request bounded by the pairing deadline and verify the tracker still owns the socket.