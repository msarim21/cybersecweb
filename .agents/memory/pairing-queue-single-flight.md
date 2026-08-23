---
name: Pairing queue single-flight
description: Production pairing requests must share one registration socket and retry capacity failures.
---

The pairing queue may contain many phone numbers, but it must claim only one request at a time. A full supervisor slot is a temporary capacity condition, so the request must return to the durable queue instead of becoming a user-visible failure.

**Why:** WhatsApp invalidates competing registration sockets, while a one-bot dyno can legitimately be full. Parallel claims create rejected codes; hard-failing the next request creates the “no worker slot” loop.

**How to apply:** Keep the processor globally single-flight, hold that lock through the full pairing/login handoff, and reset a capacity-blocked request to `requested` for a later poll.