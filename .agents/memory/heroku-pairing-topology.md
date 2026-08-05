---
name: Heroku pairing topology
description: Production constraints for cross-dyno WhatsApp pairing on Heroku.
---

The web dyno must be API-only and enqueue pairing requests in shared Mongo/Postgres state. A dedicated worker dyno must be present and scaled; otherwise the request stays `requested` forever because no process claims it.

**Why:** Heroku app formation can contain a `worker` process type with quantity zero, and the web/worker filesystems are separate. A web-only deployment can return success while never opening WhatsApp.

**How to apply:** Keep explicit web/worker roles in the Procfile and config. The worker pairing processor must start after DB readiness. Before spawning a pairing socket, the supervisor must reserve a normal bot slot when `MAX_CONCURRENT_BOTS` is already full, then let the worker publish `code_ready` through the shared DB.