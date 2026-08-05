---
name: Async pairing request
description: Pairing endpoint timing and handoff behavior for the single-web WhatsApp host.
---

The pairing request endpoint must return after starting the supervisor-owned pairing runtime. It must not wait for the Baileys registration socket or kill the runtime when an HTTP wait expires; code delivery happens through the polling endpoint.

**Why:** Slot rotation and the Baileys handshake can exceed browser/proxy request timeouts. A synchronous request made a valid socket look like a failed pairing and stopped it before the local pairing JSON was available.

**How to apply:** Preserve the single-flight guard, start exactly one supervisor-owned pairing socket, return an async `requested` response, and let `/code/:number` read the local file first with the database as the shared fallback.