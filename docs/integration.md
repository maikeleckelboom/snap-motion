# Future maikel.site integration

The first intended production consumer is `maikel.site`, but application integration is outside
this repository pass.

Snap Motion owns physics, interruption, geometry, target policy, measurement, accessibility,
structural components, stable-ID reconciliation, and the complete Media Gallery interaction. The
host owns media content, route/query mapping, history policy, theme, and product composition.

Private dogfooding should install the checksummed core and Vue tarballs from one verified release
candidate. Import public capability entrypoints such as `@snap-motion/vue/media-gallery`,
`@snap-motion/vue/coverflow`, and `@snap-motion/vue/style.css`; never copy lab code or deep-import
package source.

## Semantic selection

All selection surfaces use stable IDs. `activeId` is the application-authoritative semantic item or
snap and changes when a destination is accepted, before animation finishes. `settled` is a later
mechanical fact. Applications must not wait for settlement to update route state.

```vue
<StackedDeck
  v-model:active-id="activeId"
  :items="screens"
  label="Project screens"
  @active-id-change="(id) => replaceRouteMedia(id)"
>
  <template #card="{ item }">
    <ProjectScreen :screen="item" />
  </template>
</StackedDeck>
```

When state has already changed elsewhere, call `synchronizeTo(id)` instead of `navigateTo(id)`.
For example, if the gallery closes on another media ID, synchronize the inline surface so it adopts
the exact ID without replaying a navigation event or announcement.

The surface owns adjacent traversal, interruption, visual authority, announcement timing, and
inspection eligibility. An application does not allocate controller frames, calculate physical
indices, or derive paint order from a global relative item index.

Import the structural CSS once:

```ts
import "@snap-motion/vue/style.css";
```

## Controlled routing

Production components never import Vue Router or Nuxt routing. The application maps a route media
parameter or query to `open` and `activeId`, responds to `activeIdChange` and `openChange`, and owns
history behavior:

- push when opening from an underlying page;
- replace while moving between items;
- Back to close only when the base page is the real preceding history entry;
- replace to the base route when a direct overlay entry has no valid base-history entry.

Back/Forward and query updates are authoritative prop changes. Snap Motion adopts them without
emitting the same semantic request back. `apps/router-fixture` certifies history behavior;
`apps/nuxt-fixture` certifies a query-controlled SSR gallery, initially open valid IDs, hydration,
and direct-entry fallback. Neither fixture uses `ClientOnly`.

The host must not add CSS transitions, native smooth scrolling, native scroll snap, or another
animation library to the same transform. Private integration does not authorize public activation;
the manual gate in [production certification](production-certification.md) still applies.
