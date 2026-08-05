---
name: Heroku pairing topology
description: Production constraints for cross-dyno WhatsApp pairing on Heroku.
---

Production is intentionally a single-owner web formation: the web dyno serves the API and owns the WhatsApp supervisor, pairing processor, pairing socket, and bot sessions. The worker process type must not be running alongside it.

**Why:** A split web/worker deployment has separate processes and filesystems. It can return a pairing code from one runtime while a second socket or stale worker invalidates the WhatsApp linking handshake, producing “Couldn’t link device” and repeated generation failures.

**How to apply:** Keep `WHATSAPP_HOST_DYNO=web`, `WEB_API_ONLY=0`, and one `web` formation. Start the supervisor and pairing processor from the web server after DB readiness. Before spawning a pairing socket, reserve a normal bot slot when `MAX_CONCURRENT_BOTS` is full, and never let a worker dyno run concurrently.