---
name: Pairing browser identity
description: Browser identity required for the current WhatsApp phone-number linking flow.
---

The phone-number pairing socket should identify itself as an Ubuntu Chrome companion, not Safari. Keep this profile aligned with the working pairing flow and Baileys' documented/default Chrome behavior.

**Why:** The UI displayed a correctly formatted code, but WhatsApp rejected the same code with “Couldn't link device” while the socket advertised a Safari companion profile. The pairing flow already used Ubuntu Chrome in the separate working-style flow.

**How to apply:** Use `Browsers.ubuntu('Chrome')` for phone-number pairing sockets. If production still rejects codes after deploying this change, inspect the single-host runtime logs for duplicate sockets or the pairing socket closing before `connection.open`; do not change the UI code formatting first.