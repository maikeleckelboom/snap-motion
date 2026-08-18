---
"@snap-motion/core": minor
"@snap-motion/vue": minor
---

Add the extension points a presentation needs to bound one interaction to one adjacent item without
forking the controller or lowering any generic default.

`SnapController.beginDrag()` accepts an optional `originId`. The declared anchor, rather than the
nearest one, becomes both the temporary drag envelope's centre and the base `resolveReleaseTarget`
caps against, so a re-grab taken between the midpoint and a presentation's own handoff boundary
cannot let controller state run ahead of what the user can see. `dragEnvelopeElasticity` decides
what happens at that envelope's interior limits: the default `{}` keeps them the hard paint
boundaries every existing consumer already gets, and supplying boundaries turns overdrag past them
into the same bounded resistance the physical bounds use, so a very long drag resists instead of
dying against a frozen surface. Physical bounds keep using `elasticity` either way.

`resolveStackedDeckTraversal` accepts optional `traversalBounds`. Inside them the projection behaves
exactly as before, completing every crossed anchor in order; at the limit it stops promoting and
reports the remaining travel through the existing `elastic` phase, so no second target is invented
and no second visual top is promoted. Omitting the bounds keeps the primitive free to traverse the
whole deck.

`useSnapMotion` and `useCarouselMotion` accept `resolveDragOrigin`. It is called exactly once when
the controller takes physical ownership — a pointer drag, or the first delta of a coalesced wheel
burst — and its result is passed to `beginDrag()`, which also makes it the point where a consumer
can open an interaction transaction. The wheel path now resolves its own origin through the same
hook, so a burst's rendered envelope and its settled target always agree. Consumers that omit it are
unaffected: the controller keeps choosing the nearest anchor, and `maxAnchorSkip` defaults are
unchanged.
