---
name: Pairing child ownership
description: Process ownership invariant for WhatsApp pairing handshakes.
---

Pairing is a single-socket registration handshake. The supervisor's noRestart contract must reach the worker thread's initial child spawn, not only later child-exit handling.

**Why:** If the initial pairing child self-respawns after a socket close, the replacement opens a second registration socket and WhatsApp invalidates the code already shown to the user, commonly surfacing 440 or “Couldn't link device”.

**How to apply:** Pass pairing/noRestart through supervisor workerData and use those flags on the worker's initial spawn. Pairing children should exit for supervisor-owned replacement rather than self-respawn.