---
"@snap-motion/core": minor
"@snap-motion/vue": minor
---

Add the opt-in `exchange="direct"` Stacked Deck presentation while preserving Shuffle as the exact
default. Direct keeps the originally grabbed local card point attached to the pointer after existing
horizontal gesture arbitration, separates raw two-axis hand motion from scalar one-card traversal,
and uses the same persistent shells, semantic model, pile geometry, release policy, and authoritative
core frame as Shuffle.

Committed far-away shells use a single-shell fade-to-rebase reconciliation whose deliberate pose
change is bracketed by exact zero-opacity frames. Cancel, reversal, re-grab, controlled takeover,
and collection reconciliation remain immediately interruptible; boundary overdrag is explicitly
reported as resisted rather than fabricated pointer lock. Autonomous and reduced-motion Direct
navigation use the same scalar projection without inventing a cursor.
