---
"@snap-motion/core": minor
"@snap-motion/vue": minor
---

Harden the stacked deck and coverflow surface products before release.

**Item collections are semantic.** `StackedDeckModel` and `CoverflowModel` are now generic over
their semantic ID and own an ordered ID collection, constructed with `{ ids, initialId }` and
reconfigured with `reconfigure(nextIds)`. Adding, removing, replacing, reordering, emptying, and
repopulating items are all defined operations that preserve the item the surface was on, rather than
leaving model and frame sizes stale or letting indexes and IDs name different cards. An index or ID
the collection does not contain is refused instead of clamped, so an unknown ID can no longer
resolve to item zero. `OrderedIdCollection` and `resolvePreservedIndex` are public.

**Zero-config decks behave like the product.** `STACKED_DECK_INTERIOR_ELASTICITY` is the deck's own
default for interior overdrag, so `<StackedDeck :items="items">` resists past the adjacent screen
instead of hard-clamping at the one-card envelope. Supplying `elasticity` customizes that
resistance without weakening the one-card invariant.

**Controlled selection is not user input.** A change to `activeId` is applied even while a surface
is `disabled` or physically held, under an explicit interruption policy, and is never echoed back as
a user-originated `update:activeId` / `requestActiveId`.

**Navigation reasons tell the truth.** `requestActiveId` reports `previous`, `next`, `keyboard`,
`drag`, `wheel`, or `picker` instead of labelling every settled change a drag.

**Input agrees with itself.** Pointer, wheel, and keyboard now resolve writing direction through one
shared directional policy, so the three surfaces cannot drift under RTL. Interactive descendants of
a `#card` slot keep their own clicks, pointer, and Arrow keys; blanket click prevention is gone and
only a completed manipulation suppresses the click it produced.

**Accessible structure.** Both roots are a labelled `group` — or a `region` via the new `landmark`
prop — so `aria-roledescription="carousel"` sits on a role it is valid for. Cards are `group`s with
`aria-roledescription="slide"`, and a card hidden from assistive technology is also `inert`.

**Breaking:** `StackedDeck` and `Coverflow` take one generic parameter (the item) and derive the ID
union from it, so `StackedDeck<Id, Item>` becomes `StackedDeck<Item>` — ordinary template usage
needs no generic arguments at all. The component handles publish read-only `diagnostics` instead of
`motion`; the surface composables still return `motion` and `model`. `StackedDeckModel` and
`CoverflowModel` take `{ ids, initialId }` instead of `{ itemCount, initialIndex }`.
