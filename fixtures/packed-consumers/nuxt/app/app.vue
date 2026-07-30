<script setup lang="ts">
import { CarouselRoot, CarouselViewport } from "@snap-motion/vue";
import { MediaGalleryDialog } from "@snap-motion/vue/media-gallery";

const galleryItems = [
  {
    id: "one",
    title: "Packed Nuxt media",
    alt: "Packed Nuxt media",
    previewSrc: "/preview.jpg",
    width: 1_600,
    height: 1_000,
  },
];
</script>

<template>
  <main data-packed-nuxt-ready>
    <CarouselRoot active-id="one" :ids="['one']">
      <CarouselViewport>One packed Nuxt item</CarouselViewport>
    </CarouselRoot>
    <MediaGalleryDialog :items="galleryItems" :open="false" />
  </main>
</template>
