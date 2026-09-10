---
"@snap-motion/core": minor
"@snap-motion/vue": minor
---

Keep core and Vue candidate provenance aligned. Vue Coverflow pointer activation now preserves the
surface's focus ownership when the pointer originates outside a nested interactive control, while
nested controls keep their own focus behavior.

The shared native-dialog focus-return verifier also yields to a subsequent pointer interaction,
including one that intentionally leaves focus on the document body, instead of reclaiming the opener.
