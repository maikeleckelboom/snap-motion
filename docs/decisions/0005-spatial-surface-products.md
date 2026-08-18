# 0005: Ship stacked deck and coverflow as surface products

Status: accepted.

## Decision

Own each proven spatial surface at three layers instead of one. `@snap-motion/core` owns a
framework-neutral **surface model** — `StackedDeckModel`, `CoverflowModel` — that composes the
generic scalar controller's snapshots into selection, authority, interaction envelopes, command
policy, direct synchronization, and announcement timing. `@snap-motion/vue/stacked-deck` and
`@snap-motion/vue/coverflow` bind that model to a browser and publish one style-light component
above one surface composable. An application supplies typed items, stable IDs, controlled state,
content, and theme.

Keep the generic controller generic. A deck is a deck because its model opens one bounded
transaction per interaction, not because `SnapController` or `resolveStackedDeckTraversal` was
narrowed; both keep their full multi-anchor capability for every other surface.

## Rationale

The behaviour was already correct and already certified, but it lived in the lab. That made the lab
a privileged implementation environment: an application wanting the same deck had to allocate
mutable traversal and frame storage, compute a physical index, open and close interaction
transactions, bound the projection to `origin ± 1`, fix `maxAnchorSkip`, distinguish visual from
authoritative from settled index, and route non-adjacent destinations through a hand-written
synchronization. Every one of those is a way to get it wrong.

Splitting the model out of the adapter is what makes the guarantees testable without a DOM, and what
keeps the Vue layer honest about owning only what genuinely needs a browser: element measurement,
pointer and wheel binding, hit testing, reduced-motion preference, frame scheduling, and CSS
projection.

`<script setup generic>` is part of the API rather than polish. The consumer's item type and
semantic ID union survive `items`, `v-model:active-id`, slot props, events, and the exposed handle —
through the published declaration rollup — so ordinary typed usage needs no cast and no explicit
generic argument. Each component therefore takes **one** type parameter, the item, and derives the
ID union from it as `TItem["id"]`: a second parameter for the ID could only be inferred from
`activeId`, which an uncontrolled surface does not have, so it would have silently widened to
`string` exactly where inference matters most. Packed single-file fixtures type-checked by
`vue-tsc` are what hold that line.

The public component handle is a product surface, not the composable's return value. It publishes
read-only motion telemetry and the surface's own navigation, and deliberately no controller: a deck
whose handle offered a generic `moveTo` would be documenting a way around the one-card transaction
the component exists to guarantee. Consumers who need that compose the surface composable instead,
which still returns `motion` and `model`.

## Consequences

The lab became a normal consumer: its two demos lost roughly 1,900 lines and every generic
interaction helper, and now describe a showcase rather than reimplementing an interaction system.
The physical tuning that makes these surfaces work moved into the package; the visual theme that
makes them _this_ showcase stayed in the lab.

Each model owns its item collection rather than freezing an initial count. Reconfiguration is
therefore a model operation with defined semantics — preserve the current item, else hold the
ordinal position — instead of component-local array surgery, and an ID the collection does not
contain is refused rather than clamped to item zero.

Lower layers remain public. A custom renderer may still use the traversal, frame, pile, rail,
pagination, bounded-spring, and gesture primitives directly — but ordinary integration no longer has
to.
