---
name: Production deploy access
description: Deployment access boundary discovered while shipping production fixes
---

The repository's GitHub `main` branch is the reliable handoff point for production changes. A Heroku credential may be present but still lack access to the production app.

**Why:** Direct Heroku API and Git deployment attempts returned access-denied responses, while the same fix was safely pushed to the private GitHub repository without force-pushing.

**How to apply:** Before claiming a Heroku deploy, verify app access and the resulting release from Heroku. If access is denied, push the tested commit to GitHub and report that an app-owner-scoped Heroku credential or configured GitHub auto-deploy is required.