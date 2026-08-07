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
controller motion. `resolveStackedDeckTuning` owns responsive pitch and reduced-motion tuning.

The deck's interaction contract is **one adjacent card per interaction**. Open a transaction when the
controller takes physical ownership — `useSnapMotion`'s `resolveDragOrigin` is called exactly once
per pointer drag and per coalesced wheel burst, and returning the current visual top both declares
the controller's drag origin and marks the start of the transaction. Close it when the controller
returns to idle with no pointer or wheel ownership. While it is open, configure
`releasePolicy.maxAnchorSkip = 1` and pass `traversalBounds` of `origin ± 1`; set
`dragEnvelopeElasticity` so travel past the adjacent anchor resists instead of dying at a frozen
card. Ignore a second relative command until the current transaction settles, and route any
non-adjacent destination through a direct synchronization rather than a chain of physical throws.
This is a presentation policy: do not lower the generic `maxAnchorSkip`, and do not remove generic
multi-anchor `moveTo()` support — a plain carousel or Coverflow surface keeps both.

A frame only ever exposes content-bearing roles: the manipulated top and one adjacent target. Depth
belongs to `resolveStackedDeckPile`, which is a pure function of tuning, so backing layers carry no
item identity and no gesture direction, segment change, or reversal can mirror or reorder them.
Render those layers as inert `aria-hidden` surfaces behind the cards. One motion pitch spans most of
a card width, so visual authority has already migrated to the target before an anchor crossing
transfers ownership: the outgoing card translates one-to-one with the pointer while its scale,
rotation, drop, shadow, and opacity fall monotonically to a fully dissolved handoff pose, and the
target rises from the first pile slot to exact top rest geometry. Applications must not reintroduce
a midpoint arc that returns an outgoing card toward neutral before it loses ownership.

Visible caption, counter, and current-card semantics may follow `visualTopIndex` after each completed
handoff. Route state, durable selection, inspection eligibility, and announcements remain tied to
the controller's final settled selection. Inspection stays disabled while motion is unstable, and
the final item is announced once on idle. Applications must not derive horizontal slots or paint
order from global relative item index, model a multi-anchor movement as one non-adjacent pair, or
announce intermediate visual tops. A direct absolute synchronization is the exception that proves the
rule: it is not a traversal, so it announces its destination immediately and truthfully.

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
