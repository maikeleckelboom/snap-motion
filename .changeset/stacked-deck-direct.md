---
"@snap-motion/core": minor
"@snap-motion/vue": minor
---

Add the opt-in `exchange="direct"` Stacked Deck presentation while preserving Shuffle as the exact
default. Direct keeps the originally grabbed local card point attached to the pointer after existing
horizontal gesture arbitration, separates raw two-axis hand motion from scalar one-card traversal,
and uses the same persistent shells, semantic model, pile geometry, release policy, and authoritative
core frame as Shuffle.

Every non-held shell interpolates between exact source-rest and destination-rest deck poses with
stable hidden ordering. A committed far-away shell takes its destination hidden depth and travels
continuously behind the new top into its exact pile slot without fading, rebasing, or duplication.
Cancel, reversal, re-grab, controlled takeover, and collection changes remain immediately
interruptible; boundary overdrag is explicitly reported as resisted rather than fabricated pointer
lock. Autonomous and reduced-motion Direct navigation use the same endpoint model without inventing
a cursor.
