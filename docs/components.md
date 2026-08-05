# Components

All components are available from `@snap-motion/vue`. Capability imports use
`@snap-motion/vue/carousel`, `@snap-motion/vue/sheet`, `@snap-motion/vue/dialog`, or
`@snap-motion/vue/media-gallery`.
Components are semantic and style-light; application markup inside slides remains consumer-owned.

The media gallery is a higher-level, interaction-complete composition. Its public item, lifecycle,
loading, focus, responsive, message, and theme contracts are documented in
[Media gallery](./media-gallery.md).

## Modal lightbox

`keyboardScope="auto"` is the default. When one carousel is inside an open native dialog, Left and
Right Arrow work while the close button retains focus.

```vue
<ModalDialog v-model:open="open" label="Project media">
  <CarouselRoot v-model:active-id="activeId" :ids="ids" keyboard-primary>
    <CarouselViewport>
      <CarouselTrack>
        <CarouselSlide v-for="id in ids" :id="id" :key="id" :label="labels[id]">
          <img :alt="labels[id]" :src="sources[id]" />
        </CarouselSlide>
      </CarouselTrack>
    </CarouselViewport>
    <CarouselPrevious />
    <CarouselNext />
    <CarouselActivePosition />
  </CarouselRoot>
</ModalDialog>
```

## Route-controlled state

Routing stays outside the package. Treat `requestActiveId` as the request to replace route state;
the resulting prop change is a `route` target and is not echoed back.

```vue
<CarouselRoot
  :active-id="routeMediaId"
  :ids="ids"
  @request-active-id="(id) => router.replace({ query: { media: id } })"
/>
```

Use push when opening an overlay, replace while changing items, and Back when the underlying route
is a real history predecessor. The Router and Nuxt fixtures certify this policy.

## Pagination

```vue
<CarouselPagination v-slot="{ ids }">
  <CarouselPaginationItem v-for="id in ids" :id="id" :key="id" :label="labels[id]">
    <img :alt="labels[id]" :src="thumbs[id]" />
  </CarouselPaginationItem>
</CarouselPagination>
<CarouselProgress />
```

`CarouselPaginationItem` is a native button and applies `aria-current="page"` to the active item.
The same primitive supports numbered, dot, and thumbnail presentations. Previous and next slots
expose `disabled` and their action for custom rendering.

## Sheet

`Sheet` is always a modal native `<dialog>`. `side` accepts the physical values `top`, `right`,
`bottom`, and `left`; it never changes meaning in RTL. Top and bottom use the default `full`,
`comfortable`, and `compact` points. Left and right use one `open` point and a fixed-width surface.

```vue
<Sheet v-model:open="open" v-model:active-id="activeId" side="bottom">
  <template #title>Filters</template>
  ...
</Sheet>
```

```vue
<Sheet v-model:open="open" side="right">
  <template #title>Inspector</template>
  ...
</Sheet>
```

The handle is the only drag surface and sits on the inner movable edge. The body remains a native
vertical scrollport. Dynamic `side` changes interrupt current motion, retain the active semantic
snap ID when the new point set contains it, remeasure, and atomically remap the scalar. Otherwise
the side default, then the first configured point, is used.

Responsive presentation belongs to the host. Mount either an inline `<aside>` or a `Sheet`, hoist
the feature state above both hosts, and never keep two live copies hidden with CSS. When replacing
an open modal with an inline pane, `closeForPresentationChange()` provides the focused-inside signal,
closes immediately without an exit spring, and suppresses focus return to an unmounting trigger.
The host can then focus the corresponding inline heading. Narrowing from inline leaves the modal
closed. The lab and Nuxt fixtures certify this composition.

## Carousel inside a sheet

```vue
<Sheet v-model:open="open" v-model:active-id="sheetId" side="bottom">
  <template #title>Choose media</template>
  <CarouselRoot v-model:active-id="mediaId" :ids="mediaIds" keyboard-scope="carousel">
    <CarouselViewport data-snap-motion-ignore-drag>
      <CarouselTrack>...</CarouselTrack>
    </CarouselViewport>
  </CarouselRoot>
</Sheet>
```

Keep the sheet's drag region separate from the carousel viewport. Add
`data-snap-motion-ignore-drag` to any descendant that must never begin a Snap Motion drag.
