---
name: Anti-delete storage boundary
description: Durable storage policy for deleted-message recovery data versus account and WhatsApp session data
---

Anti-delete message recovery data is disposable cache data, not account state or WhatsApp credentials. Keep it in bounded per-bot local JSON stores with short retention; MongoDB should not receive those payloads by default.

**Why:** A busy deployment accumulated thousands of anti-delete documents containing message and media payloads, consuming nearly the entire Atlas quota while BotSession and pairing data remained small. Mongo write blocking then affected unrelated connection-state and session-backup writes.

**How to apply:** Preserve MongoDB for users, linked numbers, pairing requests, compact BotSession/session backups, and other application metadata. If Mongo fallback is ever enabled for anti-delete, use an explicitly larger-tier deployment and enforce strict TTL/cap cleanup.