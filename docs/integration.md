# Future maikel.site integration

The first intended production consumer is `maikel.site`, but no application integration is part of
this repository's current work.

The future source-level boundary is:

Snap Motion owns:

- scalar physics and interruption
- semantic carousel and page geometry
- release projection and target policy
- Vue motion, gesture, resize, and reduced-motion primitives
- style-light semantic carousel, native dialog, and bottom-sheet components
- the reusable media-gallery composition, including preview/full-image loading, zoom, pan, and
  swipe behavior
- stable IDs, focus policy, inertness, status completion, and native snap-picker semantics

`maikel.site` owns:

- the media-gallery trigger, controlled selection, route mapping, project media, and theme
- project-specific media and captions
- portfolio visual treatment
- routing and project data

Integration should consume workspace or source modules without claiming a published npm package.
The application should supply stable media IDs and presentation data. It must not add CSS
transitions, smooth scrolling, native scroll snap, or another animation library to the same
carousel or media-gallery transform.

When an application needs the stacked-deck visual model, it should allocate one
`MutableStackedCoverflowFrame`, resolve it from the carousel's live physical index, and render the
returned poses. `resolveStackedCoverflowTuning` owns responsive projection and reduced-motion
tuning. The application must not infer the paint owner from DOM 3D sorting or promote
`ownerIndex` into route, selection, focus, or announcement state.

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
