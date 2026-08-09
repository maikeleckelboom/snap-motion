---
"@snap-motion/core": minor
"@snap-motion/vue": minor
---

Associate each decorative Stacked Deck pile layer with the ordered item it physically represents.
Core pile poses now retain `itemIndex`; Vue pile projections expose the matching `id` and `index`,
and `StackedDeck` adds a `#pile-layer` slot for decorative material inside the component-owned
`aria-hidden`, inert, non-interactive physical layer. Topology keys, card semantics, interaction,
selection, and motion remain unchanged.
