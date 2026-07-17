# Render and preload windows

`useCarouselWindow` keeps large item sets semantic without coupling the package to media loading.

```ts
const window = useCarouselWindow(ids, activeId, {
  mountBefore: 2,
  mountAfter: 2,
  preloadBefore: 4,
  preloadAfter: 4,
});
```

It returns computed `mountedIds`, `preloadIds`, `activeId`, `previousIds`, and `nextIds`. Non-wrapping
is the default; `wrap` changes window collection only and does not create cloned slides or infinite
carousel behavior.

```vue
<CarouselSlide v-for="id in ids" :id="id" :key="id">
  <MediaCard v-if="window.mountedIds.value.has(id)" :id="id" />
</CarouselSlide>
```

The active ID is always mounted. A missing active ID falls back deterministically to the first ID,
empty and one-item arrays are safe, and route-provided IDs produce the same server/client result.
The lab includes 100 semantic items while mounting at most five; fetching and decoding stay with the
consumer.
