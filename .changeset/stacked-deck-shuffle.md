---
"@snap-motion/core": minor
---

Replace the experimental stacked-deck pair compositor with a segment-local direct-manipulation
projection. The renderer consumes continuous physical index through adjacent visual handoffs,
supports multi-anchor traversal and reversal without controller resets, and uses one symmetric
translation-led geometry in both directions. Visual ownership is distinct from final settled
selection, while responsive render bleed avoids clipping without creating page overflow.
