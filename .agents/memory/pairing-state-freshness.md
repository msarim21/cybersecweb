---
name: Pairing state freshness
description: Fresh WhatsApp pairing attempts must invalidate shared and local state before a new socket starts.
---

Pairing state is attempt-scoped, not reusable account state. Before starting a new pairing socket, clear the previous database `code_ready`/code value and the per-number local pairing handoff; reset again at the supervisor ownership boundary as a defensive measure.

**Why:** A stale `code_ready` record or local JSON file can make the UI display an old code while the new socket is still negotiating. That code is rejected by WhatsApp, and the real socket may then time out with a 408 before `connection.open`.

**How to apply:** Keep local and shared state reset in lockstep at request start and supervisor spawn. Only expose `code_ready` when the current attempt has actually written a code, and keep the pairing child alive until phone login reaches `connection.open`.