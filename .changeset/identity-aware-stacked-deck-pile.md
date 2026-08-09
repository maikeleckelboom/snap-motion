---
"@snap-motion/core": minor
"@snap-motion/vue": minor
---

Associate each decorative Stacked Deck pile layer with the ordered item it physically represents.
Core pile poses retain `itemIndex` as structural ordered provenance, while the composable's full
physical pile projection adds the matching `id` and `index` for custom renderers. `StackedDeck` adds
a narrower `#pile-layer` scope — `{ item, id, index, side, slot }` — for decorative material inside
the component-owned `aria-hidden`, inert, non-interactive layer. The component publishes the scope
only when the current item and model projection agree on identity and position. Topology keys, card
semantics, interaction, selection, and motion remain unchanged.
