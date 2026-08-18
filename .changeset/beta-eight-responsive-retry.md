---
"@snap-motion/core": minor
"@snap-motion/vue": minor
---

Keep core and Vue provenance aligned for the private beta.8 candidate. Vue Gallery retries now
capture the browser-selected responsive `currentSrc`, issue a distinct request for that exact
resource, and invalidate retry work across authority, collection, and open-cycle changes. Gallery
source distinctness now includes `sizes` only when a shared `srcset` can select different resources,
while intrinsic geometry remains outside network identity.
