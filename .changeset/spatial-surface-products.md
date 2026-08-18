---
"@snap-motion/core": minor
"@snap-motion/vue": minor
---

Ship the stacked deck and coverflow as products rather than as parts to assemble.

`@snap-motion/vue/stacked-deck` and `@snap-motion/vue/coverflow` are new capability entrypoints,
each with one style-light surface component over one surface composable. Ordinary integration is the
component plus typed domain items:

```vue
<StackedDeck v-model:active-id="activeId" :items="screens" label="Project screens">
  <template #card="{ item }">
    <ProjectScreen :screen="item" />
  </template>
</StackedDeck>
```

Nothing about physical indices, mutable traversal or frame storage, interaction envelopes,
`maxAnchorSkip`, controller phases, authority migration, or synchronization internals is part of
that contract any more. The deck still resolves at most one adjacent card per gesture, flick, wheel
burst, or command; still starts the next interaction on the card already on top; still chains
distinct rapid commands one card each; still synchronizes a non-adjacent destination instead of
throwing through every intermediate card; and still keeps durable selection, announcements, and
inspection eligibility on their separate, correct clocks. It is simply the component's job now.

Both components are `<script setup generic="TId extends string, TItem extends { id: TId }">`, so the
consumer's item type and semantic ID union survive `items`, `v-model:active-id`, slot props, events,
and the exposed `StackedDeckHandle` / `CoverflowHandle` — through the published declaration rollup,
with no cast and no explicit generic argument in ordinary usage.

`@snap-motion/core` gains the framework-neutral half. `StackedDeckModel` and `CoverflowModel`
compose the generic controller's snapshots into a surface's semantics — selection, visual authority,
the one-adjacent-card interaction envelope, relative versus absolute command policy, direct
synchronization, and announcement timing — without touching a controller or a DOM. Beside them,
shared deterministic policy becomes public: `SettledSelection`, `resolveHystereticIndex`,
`resolveCommandOriginIndex`, `resolveAdjacentIndex`, `resolvePaginationIndicator`,
`advanceBoundedSpring`, `resolveAutonomousReleaseVelocity`, `resolveSpeedInCards`,
`resolveCoverflowKinetics`, `resolveCoverflowTuning`, `resolveDirectManipulationGesture`,
`resolveSnapKeyboardAction`, `isStackedDeckAuthorityStable`, `isStackedDeckInspectEligible`,
`isSettledOnAnchor`, and their tunings.

The generic controller stays generic. `SnapController` and `resolveStackedDeckTraversal` keep their
full multi-anchor capability; a deck is a deck because its model opens one bounded transaction per
interaction, not because anything underneath was narrowed. Every lower-level primitive stays public
for custom renderers.

`@snap-motion/vue/motion` also gains `useBoundedSpringDriver`, the frame-scheduled driver that
integrates a settle under acceleration and velocity limits expressed in cards, and
`createPagedGridGeometry` accepts `pageGap` so a paged rail can separate whole pages without
composing a second geometry over the first.
