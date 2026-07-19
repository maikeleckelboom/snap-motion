# Getting started

Snap Motion is currently installed only from a workspace or a reviewed release-candidate tarball.
It is not on npm. Import the base CSS exactly once; it contains structure and accessibility rules,
not a product theme.

```ts
import "@snap-motion/vue/style.css";
```

## Basic carousel

Use stable string IDs. A user action emits `targetChanged`, `requestActiveId`, and
`update:activeId` when the target is selected, followed by `settled` after physical completion.

```vue
<script setup lang="ts">
import {
  CarouselNext,
  CarouselPrevious,
  CarouselRoot,
  CarouselSlide,
  CarouselTrack,
  CarouselViewport,
} from "@snap-motion/vue/carousel";
import { ref } from "vue";

const ids = ["a", "b", "c"] as const;
const activeId = ref<(typeof ids)[number]>("a");
</script>

<template>
  <CarouselRoot v-model:active-id="activeId" :ids="ids" label="Examples">
    <CarouselPrevious />
    <CarouselViewport>
      <CarouselTrack>
        <CarouselSlide v-for="id in ids" :id="id" :key="id" :label="id">
          {{ id }}
        </CarouselSlide>
      </CarouselTrack>
    </CarouselViewport>
    <CarouselNext />
  </CarouselRoot>
</template>
```

`CarouselTrack` accepts logical `startInset` and `endInset` values as numbers in pixels or CSS
length strings. Use them with a track-measuring strategy when the first and last unequal-width item
need breathing room or must be centerable; margins do not reliably extend measured scroll geometry.

## Nuxt SSR

Add the CSS through Nuxt so the server and client receive the same structural contract:

```ts
export default defineNuxtConfig({
  css: ["@snap-motion/vue/style.css"],
});
```

Components do not access browser globals during SSR. Keep a route-provided `activeId` stable on
the server and client; `useCarouselWindow` will include that item in its deterministic SSR window.

## Next reading

- [Components](components.md)
- [Composables](composables.md)
- [Keyboard ownership](keyboard.md)
- [RTL](rtl.md)
- [Styling](styling.md)
