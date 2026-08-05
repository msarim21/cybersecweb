---
name: Pairing login handoff
description: WhatsApp phone-code acceptance and post-login promotion requirements.
---

Pairing has two phases: generating `code_ready` and completing the phone login. The pairing child must remain alive after code generation until WhatsApp emits `connection.open`, the first credentials are flushed to the database, ownership creates or activates the linked number, and the pairing state becomes active.

**Why:** Stopping or promoting the child immediately after generating the code interrupts the phone-side handshake and leaves WhatsApp stuck on “Logging in…”. Clearing the pairing record before connection.open also removes the owner metadata needed to save the linked number.

**How to apply:** Treat `code_ready` as a waiting state, not success. Use a bounded post-code connection wait, preserve pairing owner data, commit session/active state in the connection-open handler, then promote the pairing socket to the normal bot lifecycle.