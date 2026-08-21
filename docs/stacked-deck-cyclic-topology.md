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

## Interrupted releases

Presentation settlement is its own channel. A hand pressing the deck opens a new interaction; it
does not cancel, freeze, or inherit whatever a previous release is still carrying. That release
keeps the budget it started with and finishes independently, landing its shell in the slot the deck
is drawing for it at the moment it arrives — which moves, because the new interaction is exchanging
the deck underneath it, and which is the top of the deck when the new hand reverses back onto that
same shell.

A shell in the air is nearer the eye than the card a hand is holding, because that card is still on
the deck and this one is not yet. It gives that rank up on the terms every release changes depth
on: once its own path has carried it clear of both the pile and the card it is going under. The
consequence is that a hand moving faster than cards can move will not be shown every exchange it
commits — the deck's semantics are unaffected, but the picture is bounded by material.

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
