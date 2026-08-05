---
name: Mongo quota pairing fallback
description: Production pairing behavior when the external MongoDB Atlas cluster is over its storage quota.
---

When the Atlas cluster is over its storage quota, Mongo writes fail even though the Baileys WebSocket can still connect and generate a pairing code. In the single-web topology, the local pairing JSON and connected flag are a valid temporary handoff for code polling and connection detection.

**Why:** Pairing must not kill a live WhatsApp handshake just because `setPairingCode`, session backup, or active-state writes are temporarily rejected. The local files are on the same web dyno as the pairing socket and remain available until the dyno restarts.

**How to apply:** Keep the local-file fallback enabled for code/status polling, but treat it as temporary only. Restore Mongo capacity before relying on session persistence, linked-number activation, reconnects after dyno restart, or dashboard writes.