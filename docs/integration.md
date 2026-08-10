# Future maikel.site integration

The first intended production consumer is `maikel.site`, but no application integration is part of
this repository's current work.

The future source-level boundary is:

Snap Motion owns:

- scalar physics and interruption
- semantic carousel and page geometry
- release projection and target policy
- Vue motion, gesture, resize, and reduced-motion primitives
- style-light semantic carousel, spatial stacked-deck and coverflow surfaces, native dialog, and
  multi-edge sheet components
- the reusable media-gallery composition, including preview/full-image loading, zoom, pan, and
  swipe behavior
- stable IDs, focus policy, inertness, status completion, and native snap-picker semantics

`maikel.site` owns:

- the media-gallery trigger, controlled selection, route mapping, project media, and theme
- project-specific media and captions
- portfolio visual treatment
- routing and project data

Private integration and dogfooding should install the checksummed core and Vue tarballs from one
verified local release candidate. This exercises the package surface consumers will receive without
claiming a published npm package or copying lab implementation code. The application should import
the relevant capability entry points, including `@snap-motion/vue/media-gallery`,
`@snap-motion/vue/coverflow`, and `@snap-motion/vue/style.css`.

The application should supply stable media IDs and presentation data. It must not add CSS
transitions, smooth scrolling, native scroll snap, or another animation library to the same
carousel or media-gallery transform. Private integration does not authorize public production
activation; the manual certification gate in [production certification](production-certification.md)
still applies.

When an application needs the stacked-deck or coverflow model, it mounts the surface and supplies
domain items:

```vue
<StackedDeck v-model:active-id="activeId" :items="screens" label="Project screens">
  <template #card="{ item }">
    <ProjectScreen :screen="item" />
  </template>
</StackedDeck>
```

The deck's interaction contract — **one adjacent card per interaction**, a re-grab that starts on the
card already on top, distinct rapid commands that chain one card each, and a non-adjacent
destination that synchronizes rather than throwing through every intermediate card — is the
component's, not the application's. So are visual authority, durable selection, announcement timing,
inspection eligibility, and the pile. An application does not allocate traversal or frame storage,
does not compute a physical index, does not open interaction transactions, and does not configure
`maxAnchorSkip`: the surface fixes its own effective skip, and the generic controller keeps its
multi-anchor capability for every other surface. See [Spatial surfaces](spatial-surfaces.md).

Two things do remain the application's. Route state and durable selection follow `update:activeId`
and `settled`, which fire only at mechanical rest. And a change another surface already made and
already reported — closing an inspection gallery on a different item — is a direct synchronization
via `synchronizeId()`, not a navigation: it adopts the destination exactly and announces nothing it
did not earn.

Applications must not add a midpoint arc that returns an outgoing card toward neutral before it
loses ownership, derive horizontal slots or paint order from global relative item index, model a
multi-anchor movement as one non-adjacent pair, or announce intermediate visual tops.

Import the essential component CSS once:

```ts
import "@snap-motion/vue/style.css";
```

## Controlled routing

Production components never import Vue Router or Nuxt routing. The application maps a route media
parameter or query to `open` and `activeId`, handles `requestClose` and `requestActiveId`, and chooses
history behavior:

- push when opening from the underlying page
- replace while moving between items
- Back to close when the base page is the preceding history entry
- replace to the base route when a direct overlay entry has no valid base entry

`apps/router-fixture` proves that history policy. `apps/nuxt-fixture` proves a query-controlled SSR
overlay and a meaningful full-page direct media route. Neither fixture uses `ClientOnly`.
