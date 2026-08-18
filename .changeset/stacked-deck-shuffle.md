---
"@snap-motion/core": minor
"@snap-motion/vue": minor
---

Rework the experimental stacked-deck compositor around a physical handoff. The renderer still
consumes continuous physical index through adjacent visual segments, supports multi-anchor traversal
and reversal without controller resets, and keeps direct one-to-one pointer translation. What
changed is the dominance model: one motion pitch now spans most of a card width, the outgoing card's
scale, rotation, drop, and shadow subordinate monotonically instead of returning toward neutral
through a midpoint arc, and the adjacent target rises from the first pile slot to exact top rest
geometry. The final presentation removes the outgoing screenshot by
fading the whole face out rather than cutting it, and brings its decorative pile material in on
exactly the complementary envelope, so the card is always fully accounted for and neither
representation is ever switched on. Visual authority therefore migrates before an anchor crossing
transfers ownership, and a crossing only confirms it.

Depth moves out of the item poses into `resolveStackedDeckPile`, which returns deterministic
decorative layers with ordered source provenance through `itemIndex`. Gesture direction, segment
changes, and reversal therefore cannot mirror or reorder the pile. Vue carries that provenance into
the full `useStackedDeckMotion().pileLayers` projection and associates each layer with the matching
ordered item. The higher-level `StackedDeck` component exposes only `{ item, id, index, side, slot }`
to decorative pile content after verifying the current item and projection still agree.

Frames now render at most one top and one adjacent target. `StackedDeckRole` drops `"backing"`, poses
drop `stackDepth`, and the `backing*`/`topTravelY` tuning fields become `pile*`/`topDropY`. Decorative
pile nodes retain item identity while their resolved physical slots change, so arbitrary
consumer-rendered material moves through compaction instead of changing in place. Card semantics,
interaction, selection, and motion remain unchanged.
