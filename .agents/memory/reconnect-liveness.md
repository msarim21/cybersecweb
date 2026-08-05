---
name: Reconnect liveness
description: The liveness signals and recovery rules required for reliable isolated WhatsApp reconnects.
---

In isolated WhatsApp mode, a surviving worker thread, a recent database timestamp, or a leftover connected.flag does not prove that the Baileys WebSocket is live. Recovery decisions must use a fresh heartbeat with `wsState === 1`; filesystem flags are only a flat-mode fallback and must be removed when the socket closes.

**Why:** A worker can remain alive after its socket dies, and an abrupt process termination can leave the liveness flag behind. Treating either as online leaves the dashboard stuck in reconnecting/recovering without another spawn attempt.

**How to apply:** Keep reconnect sweeps bounded and idempotent, mark socket close/connecting states in the database, prevent intentional worker kills from hidden respawns, and let capacity-deferred attempts be retried by the next sweep.