---
"@snap-motion/core": minor
"@snap-motion/vue": minor
---

Align core and Vue provenance for the beta.6 private candidate. Core has no runtime or public API
change in this candidate. Vue renders mechanically settled Media Gallery descriptions, adds one
optional no-prop `actions` slot inside the native modal, and keeps the expanded header bounded at
narrow allocations. Stacked Deck runtime is unchanged and gains exact narrow-consumer regression
coverage for both directions.
