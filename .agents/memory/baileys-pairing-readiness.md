---
name: Baileys pairing readiness
description: Readiness behavior required by current Baileys pairing-code flow.
---

Baileys 7 may not expose a reliable `socket.ws.readyState` on the object returned by `makeWASocket`. An undefined readyState must be treated as unknown, not as a closed socket; pairing-code requests should use a bounded retry while the tracked socket remains current.

**Why:** Treating an absent internal WebSocket property as “not open” caused every pairing attempt to fail before `requestPairingCode()` ran, leaving the UI in its loading state.

**How to apply:** Prefer Baileys connection events for lifecycle state. If a low-level readiness guard is needed for compatibility with older releases, only wait when `readyState` is explicitly non-open and retry transient request failures within the existing pairing deadline.