---
"@snap-motion/core": minor
---

Rework the experimental stacked-deck compositor around a physical handoff. The renderer still
consumes continuous physical index through adjacent visual segments, supports multi-anchor traversal
and reversal without controller resets, and keeps direct one-to-one pointer translation. What
changed is the dominance model: one motion pitch now spans most of a card width, the outgoing card's
scale, rotation, drop, shadow, and opacity fall monotonically to a fully dissolved handoff pose
instead of returning toward neutral through a midpoint arc, and the adjacent target rises from the
first pile slot to exact top rest geometry. Visual authority therefore migrates before an anchor
crossing transfers ownership, and a crossing only confirms it.

Depth moves out of the item poses into `resolveStackedDeckPile`, a pure function of tuning that
returns deterministic decorative layers. Backing surfaces no longer carry item identity, so gesture
direction, segment changes, and reversal cannot mirror, reorder, or re-identify the pile. Frames now
render at most one top and one adjacent target. `StackedDeckRole` drops `"backing"`, poses drop
`stackDepth`, and the `backing*`/`topTravelY` tuning fields become `pile*`/`topDropY`.
