# Future maikel.site integration

The first intended production consumer is `maikel.site`, but no application integration is part of
this repository's current work.

The future source-level boundary is:

Snap Motion owns:

- scalar physics and interruption
- semantic carousel and page geometry
- release projection and target policy
- Vue motion, gesture, resize, and reduced-motion primitives
- style-light semantic carousel, native dialog, and multi-edge sheet components
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
`MutableStackedDeckTraversal` and one `MutableStackedDeckFrame`. Feed every controller snapshot to
`resolveStackedDeckTraversal` using `physicalIndex = -position / pitch`, then pass that traversal to
`resolveStackedDeckFrame`. The traversal retains the visual top between snapshots and completes an
adjacent handoff whenever a full anchor is crossed; it never issues controller commands or resets
controller motion. `resolveStackedDeckTuning` owns responsive pile and reduced-motion tuning.

Visible caption, counter, and current-card semantics may follow `visualTopIndex` after each completed
handoff. Route state, durable selection, inspection eligibility, and announcements remain tied to
the controller's final settled selection. Inspection stays disabled while motion is unstable, and
the final item is announced once on idle. Applications must not derive horizontal slots or paint
order from global relative item index, model a multi-anchor movement as one non-adjacent pair, or
announce intermediate visual tops.

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
