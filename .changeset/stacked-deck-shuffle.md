---
"@snap-motion/core": minor
"@snap-motion/vue": minor
---

Reset the experimental Stacked Deck to one persistent physical shell and one `#card` subtree per
item. Each shell now keeps its own material while it moves between a compact parked slot and the
active exchange, including interrupted, reversed, and repeated interactions. The outgoing and target
bodies clear one another at the depth crossover, and their cast-shadow elevation collapses smoothly
at that instant so the discrete paint-order swap remains visually continuous without changing the
direct one-to-one travel path.

The high-level `#pile-layer` renderer and `StackedDeckPileLayerSlotState` contract are removed before
publication because they duplicate the persistent shell model. Advanced renderers can still observe
`useStackedDeckMotion().pileLayers` and the core `resolveStackedDeckPile` projection; both describe the
same non-dominant physical poses and grant no semantic or interaction ownership.

`StackedDeckRole` drops `"backing"`, poses drop `stackDepth`, and the `backing*`/`topTravelY` tuning
fields become `pile*`/`topDropY`. Card semantics, one-adjacent interaction bounds, selection, and
motion-controller contracts remain unchanged. Explicit compositor promotion is bounded to the
exchanging pair and is removed at rest, while the persistent DOM and pose work remain linear in item
count.
