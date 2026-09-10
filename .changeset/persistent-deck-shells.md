---
"@snap-motion/core": minor
"@snap-motion/vue": minor
---

Render Stacked Deck with one persistent physical shell and one `#card` subtree per item. Each card
keeps its material through parked, exchanging, interrupted, and reversed states. Shuffle transfers
depth under physical occlusion instead of dissolving card content. The high-level `#pile-layer`
slot and `StackedDeckPileLayerSlotState` are removed; render material through `#card` instead.
Advanced renderers retain `useStackedDeckMotion().pileLayers` and `resolveStackedDeckPile`, which
describe non-dominant physical poses without granting semantic or interaction ownership.
