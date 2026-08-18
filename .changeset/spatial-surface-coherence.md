---
"@snap-motion/core": minor
"@snap-motion/vue": minor
---

Make the spatial surfaces coherent before release: correctness, provenance, and one published
contract per layer.

**Synchronization is atomic.** `SettledSelection` gains `adopt(index, { announce })`, which owns
the durable selection, the pending destination, the settling target, and what has already been
announced in one operation. `StackedDeckModel.synchronize()` and `CoverflowModel.synchronize()` now
go through it, so a model that synchronizes to one item no longer reverts its durable selection
when its next snapshot is a drag or a settle rather than an idle repair. A public core model is
correct under `synchronize → beginInteraction → dragging snapshot` with no remeasure in between.
An announced synchronization publishes its announcement from the adoption itself, which is what it
was already documented to do.

**Navigation reasons name what actually happened.** A reason changes only when that input was
accepted as the movement now in flight, resolved through `useCarouselMotion`'s
`onTargetSelected`. A pointerdown a nested control refuses, an unsupported or right-click pointer,
a vertical page scroll, and a wheel gesture owned by a descendant can no longer rewrite the
settlement reason of a spring something else started. `synchronizeId()` states `route` rather than
inheriting whatever was in flight.

**Click suppression follows what the surface consumed.** Displacement alone no longer arms it, so a
vertical touch scroll leaves a following button or link click intact. Suppression is still exactly
one click for a real horizontal drag, and it now expires instead of latching when the browser never
produces the compatibility click it was armed for.

**Dynamic direction.** `CarouselRoot` resolves writing direction freshly for key handling instead of
reading the memoized `direction`, so a page that turns right-to-left mirrors Arrow keys immediately
without a remount. An `auto` carousel no longer stamps a stale explicit `dir` onto its slides.

**Empty collections have one convention.** `-1` means "no item" on every published ordinal, at every
layer, and ID-valued fields are `undefined`. Empty mount, populated→empty, empty→populated, and
commands while empty are all defined and tested.

**Breaking:**

- `previous()` and `next()` on both handles and both composables take no `reason`. A consumer cannot
  claim that `next()` was a drag. `requestId()` likewise takes no reason and reports the new
  `programmatic` `NavigationReason`; `picker` is now reserved for actual discrete selection (a tap
  on an item, a pagination dot).
- `useStackedDeckMotion` and `useCoverflowMotion` publish explicit `UseStackedDeckMotionReturn<Id>`
  and `UseCoverflowMotionReturn<Id>` interfaces instead of `ReturnType<typeof …>`. `requestIndex`,
  `synchronizeIndex`, and `applyControlledId` are no longer returned; controlled selection is now
  the `controlledId` option. `model` and `motion` remain, and `motion` is typed as the new named
  `CarouselMotion<Id>`. `anchorsById` is `Map<Id, number>` rather than `Map<string, number>`.
- `useCoverflowMotion` publishes one `state` of type `CoverflowModelState` in place of the separate
  `visualIndex`, `settledIndex`, `pendingTargetIndex`, `commandIndex`, and `liveIndex` refs;
  `CoverflowHandle` exposes `state` on the same terms as `StackedDeckHandle`.
- The stacked deck's `releasePolicy` input is `StackedDeckReleasePolicy` — the generic policy minus
  `maxAnchorSkip`, which the deck fixes at one adjacent card. The invariant is now stated in the
  type rather than enforced by silently overwriting a consumer's value.
- `OrderedIdCollection` and `resolvePreservedIndex` are no longer exported from `@snap-motion/core`.
  They are how the surface models hold their items, not a contract to build against; everything an
  application needs from them is published by the models. The owned ID array is now frozen at
  runtime as well as `readonly` in the type, so it cannot be desynchronized from its index map.
