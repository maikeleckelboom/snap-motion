---
"@snap-motion/core": minor
"@snap-motion/vue": minor
---

Stacked Deck now reconciles a changed `items` collection physically instead of redrawing the new
canonical pile at once. Membership, the reconciled `activeId`, settlement and the controller still
change immediately and exactly as before. Every card keeps its identity and continues from the pose
it was last drawn with — at rest, mid-Shuffle, held or parking in Direct, landing, or still
reconciling an earlier change. It reaches the new canonical frame exactly, over two natural periods
of the deck's spring:

- The new top rises.
- The card that was in front yields clear of the pile, on the side away from the rising top, before
  it changes depth.
- Every other shell changes depth only while contained beneath the new top.
- An added card emerges from beneath the front card.

Translation, rotation, scale and shadow are continuous, and paint order never changes where two
bodies still overlap. A later change starts from the frame the earlier one reached; nothing queues.
Reduced motion adopts the new collection at once.

A removed card leaves as a departure. It keeps its element and slot content, but it is `inert` and
`aria-hidden`, has no role, label or hit target, and is no longer an item. It ends contained beneath
the front card and is then removed. Focus inside it moves to the deck. No card is interactive until
it has arrived.

`@snap-motion/core` adds `applyStackedDeckReconciliation` and `StackedDeckReconciliation`.
`@snap-motion/vue` adds:

- `departures` and `reconciling` to `useStackedDeckMotion`
- `reconciling` to `StackedDeckHandle` and a `data-reconciling` attribute on the root
- `exiting` to `StackedDeckCardState` (departing cards render through the same `#card` slot with
  `index: -1`)
- the `StackedDeckDeparture` type

`StackedDeck` no longer releases `will-change: transform` on the frame it comes to rest. Chromium
rasterizes a promoted card differently from the same card painted into its parent, so releasing the
hint at settlement repainted the card and its cast shadow with no physical change. A promotion is
now held by the cards the last transaction moved, and passes to new cards on the frame they begin to
move: at most three layers at rest, never one per item.

Inside the first pile slot, a shell's tilt now follows a quadratic with a finite slope at the top,
instead of the square root that was vertical there. The spring's last fraction of a pixel no longer
becomes a tenth-of-a-degree tilt that snaps away on the frame a Shuffle comes to rest. Every rest pose
is unchanged.
