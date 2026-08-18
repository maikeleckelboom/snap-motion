---
"@snap-motion/core": minor
"@snap-motion/vue": minor
---

Correct the final private-beta authority and overlay lifecycle edge cases. Controlled acknowledgements
now update rollback authority before motion can settle, controlled ownership handoff cannot accept a
pending request, stale native dialog close events cannot finalize newer lifecycles, and Media Gallery
normalization widens repaired base fields without losing literal IDs or consumer metadata.
