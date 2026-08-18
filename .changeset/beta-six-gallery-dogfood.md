---
"@snap-motion/core": minor
"@snap-motion/vue": minor
---

Align core and Vue provenance for the beta.6 private candidate. Core has no runtime or public API
change in this candidate. Vue renders mechanically settled Media Gallery descriptions, adds one
optional no-prop `actions` slot inside the native modal, and keeps the expanded header bounded at
narrow allocations. Its bounded native-dialog focus verifier also preserves an immediate keyboard,
pointer, or application focus handoff across late browser cleanup without reclaiming focus after
that handoff stabilizes or disconnects. A configured opener takes priority over focus assigned by
native cleanup, while an immediate application handoff from that opener is preserved even when it
precedes verifier registration. Stacked Deck now applies layout containment at its public root
while preserving visible overflow, and gains exact frame-sampled narrow-consumer regression
coverage for both directions.
