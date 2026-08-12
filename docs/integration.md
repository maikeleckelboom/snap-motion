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
snap. A component asks the host to change it through `activeIdRequest`; a router can accept, delay,
refuse, or replace that request according to its own guards. `settled` is a later mechanical fact
for the confirmed ID. Applications update route state from requests, not from settlement.

Use `v-model:active-id` only when every emitted update should be accepted immediately. Vue assigns
the emitted ID through the model binding before a separate request handler can guard it. A guarded,
delayed, refusable, or replacement-driven owner must instead bind `:active-id` one way and publish
its decision later. The same rule applies to overlay `open`: use `v-model:open` for immediate
acceptance and `:open` plus `openRequest` when the host owns a close policy.

```vue
<StackedDeck
  :active-id="routeActiveId"
  :items="screens"
  label="Project screens"
  @active-id-request="(id) => replaceRouteMedia(id)"
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
parameter or query to `open` and `activeId`, responds to `activeIdRequest` and `openRequest`, and owns
history behavior:

- push when opening from an underlying page;
- replace while moving between items;
- Back to close only when the base page is the real preceding history entry;
- replace to the base route when a direct overlay entry has no valid base-history entry.

Back/Forward and query updates are authoritative prop changes. Snap Motion adopts them without
emitting the same semantic request back. `apps/router-fixture` certifies history behavior plus
accepted, delayed, and refused requests, including an accepted B destination followed by a refused
C destination and rollback to B. `apps/nuxt-fixture` certifies the same multi-step authority
boundary for a query-controlled SSR gallery, initially open valid IDs, hydration, and direct-entry
fallback. Neither fixture uses `ClientOnly`.

An application control that must remain usable while `MediaGalleryDialog` is open belongs in its
no-prop `#actions` slot. A locale switch or similarly scoped action outside the native modal is
correctly inert and is not a viable duplicate control. The application keeps ownership of the
action and any route update while the Gallery keeps modal focus and DOM order coherent.

## TypeScript handoff

Before integrating the tarballs into `maikel.site`:

1. record its installed Nuxt, Vue, `vue-tsc`, and TypeScript versions;
2. upgrade that application to the newest mutually compatible Nuxt/Vue tooling without changing
   Snap Motion contracts;
3. run its real application typecheck with the current TypeScript 7 toolchain;
4. if Vue SFC checking reaches the same removed compiler-API boundary as this repository, use Vue
   Language Tools' official `@typescript/typescript6` bridge rather than a local loader patch;
5. keep the rest of the application tooling on the current TypeScript line; and
6. verify the application build, generated routes, SSR hydration, and the integrated interaction in
   real browsers.

This is handoff guidance, not authorization to modify `maikel.site` in this repository pass.

The host must not add CSS transitions, native smooth scrolling, native scroll snap, or another
animation library to the same transform. Private integration does not authorize public activation;
the manual gate in [production certification](production-certification.md) still applies.
