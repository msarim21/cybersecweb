---
name: Config file deduplication
description: setting/config.js had its entire content duplicated — second copy overwrote globals set by the first.
---
## Problem
`setting/config.js` was 78 lines but contained two full copies of all `global.*` assignments. The second copy's `global.prefa` definition (line 17) overwrote the first (line 6), and every other global was assigned twice — harmless but confusing on read.

## Fix
Rewrote to a single clean 42-line config with no duplicates.

**Why:** Likely caused by the auto-watch reload mechanism at the bottom re-requiring the file and appending rather than replacing. The hot-reload (`fs.watchFile` + `delete require.cache`) works correctly now.
