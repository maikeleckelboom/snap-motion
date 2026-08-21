# Stacked Deck cyclic physical topology

Stacked Deck semantic IDs remain the consumer's finite ordered collection. Physical navigation is
a ring over that collection. The implementation keeps five facts separate:

- semantic ordinal and ID;
- interaction-local physical position;
- forward ring depth and its signed visual slot;
- explicit physical direction;
- visual, durable-selection, input, and presentation ownership.

## Local physical coordinates

Every interaction is measured from a local origin. That origin is `0`; its backward and forward
ring neighbours are `-1` and `+1`. The Vue adapter rotates the generic controller's finite anchors
around the interaction origin and rebases the scalar by the same anchor displacement. Rest rebases
again around the settled item. Controller coordinates therefore stay bounded, wrapped neighbours
are one pitch apart, and repeated revolutions cannot accumulate scalar growth.

The two-item deck deliberately chooses the anchor rotation from interaction direction. Both
physical directions name the same other semantic ID, but they retain different local signs and
therefore different choreography.

## Ring order and pile depth

For `N > 0`, the forward neighbour of ordinal `i` is `(i + 1) mod N`; the backward neighbour is
`(i - 1 + N) mod N`. Forward depth from a resting top is the non-negative cyclic distance in that
canonical order, and it decides identity: which item occupies which place in the pile.

It does not decide what that place costs physically. The pile folds forward depth into a signed
slot around the deck's centre, and physical depth is that slot's own distance from the centre. A
pile is a neighbourhood, so the nearest neighbour on either side is the nearest to the eye on that
side, and mirrored slots are equally deep because neither side of a pile is favoured. The ring
answers which card; the slot answers what it looks like. Reading forward ring depth as physical
depth instead inverts one side of the fold — the immediately previous card is painted behind the
whole pile while sitting closest to it — and the exchange choreography then has to work around a
pile that no longer reads as one object.

At rest the physical pile is the canonical ring rotated to the current item. Reconfiguration
preserves the current semantic ID where possible, then rebuilds this order from the new collection.

## Concurrent interrupted releases

Presentation settlement is its own channel. A hand pressing the deck opens a new interaction; it
does not cancel or freeze whatever previous releases are still carrying. Each unfinished release is
owned by its persistent shell, keeps the budget it started with, and advances independently under
one shared animation lifecycle. A later release adds another concurrent body; it cannot replace an
older unfinished one. Each body lands in the slot the deck is drawing for that shell at the moment
it arrives, which moves because new interactions may exchange the deck underneath it.

Release chronology explicitly orders simultaneous airborne bodies: an older body remains above a
newer one until their trajectories provide physical clearance for the required depth crossover.
Collection iteration and DOM order do not decide paint. A shell gives up an airborne rank only once
its own path has carried it clear of the pile and every body it crosses.

When the live hand reverses toward an airborne shell, Direct resolves the target and the landing
through the same persistent pose. If that shell becomes the interactive top and is pressed again,
the landing record is absorbed into the hand with its exact translation, scale, rotation, shadow,
and chronology. The collection can therefore contain at most one landing per shell without a
duplicate card, restart from nominal rest, or teleport. Item reconfiguration, mode changes,
controlled synchronization, and teardown clear the complete presentation collection atomically
under the component's existing cancellation policy; normal completion removes only the body that
arrived. Disabling the deck rejects new input but does not erase physical presentation already in
flight.

## Traversal and navigation

Relative commands carry `-1 | 1` as first-class direction and resolve exactly one ring neighbour.
Pointer and wheel interactions use the same local one-card envelope; travel beyond one pitch is
resistant overdrag and cannot open another exchange. Empty and one-item decks have no exchange.

Absolute navigation is not a directional throw. An unambiguous cyclic neighbour may use one normal
exchange. A non-neighbour synchronizes directly. In a two-item deck the other item is both cyclic
neighbours, so a named absolute destination synchronizes unless the initiating action already
supplies direction.

## Presentation mapping

Shuffle evaluates the canonical forward top-to-rear exchange. Backward evaluates that physical
exchange in reverse, retaining Shuffle's detour and depth crossover. Direct uses the same endpoint
ring order while retaining its existing pointer-owned shell, two-axis hand vector, release parking,
clear-body crossover, interruption continuity, and per-rendered-frame material authority.

There is no wrap-specific path, pose, layer rule, or shell recycling. Interior and ordinal-wrap
exchanges use the same normalized progression after remapping item identities.

Stacked Deck exposes no pagination rail or pagination-derived state. Finite ordinal information may
remain in accessible labels and settlement announcements.
