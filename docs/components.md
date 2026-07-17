# Components

All components are available from `@snap-motion/vue` and `@snap-motion/vue/components`. Components
are semantic and style-light; application markup inside slides remains consumer-owned.

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

## Carousel inside a bottom sheet

```vue
<BottomSheet v-model:open="open" v-model:active-id="sheetId">
  <template #title>Choose media</template>
  <CarouselRoot v-model:active-id="mediaId" :ids="mediaIds" keyboard-scope="carousel">
    <CarouselViewport data-snap-motion-ignore-drag>
      <CarouselTrack>...</CarouselTrack>
    </CarouselViewport>
  </CarouselRoot>
</BottomSheet>
```

Keep the sheet's drag region separate from the carousel viewport. Add
`data-snap-motion-ignore-drag` to any descendant that must never begin a Snap Motion drag.
