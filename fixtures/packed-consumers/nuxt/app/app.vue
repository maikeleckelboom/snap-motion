<script setup lang="ts">
import {
  CarouselRoot,
  CarouselSlide,
  CarouselTrack,
  CarouselViewport,
  ModalDialog,
  Sheet,
} from "@snap-motion/vue";
import { Coverflow } from "@snap-motion/vue/coverflow";
import { MediaGalleryDialog } from "@snap-motion/vue/media-gallery";
import { StackedDeck } from "@snap-motion/vue/stacked-deck";

const screens = [
  { id: "overview", title: "Overview" },
  { id: "outcome", title: "Outcome" },
] as const;
const activeCarouselId = ref<"one" | "two">("two");

const galleryItems = [
  {
    id: "one",
    title: "Packed Nuxt media",
    alt: "Packed Nuxt media",
    previewSrc:
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1600' height='1000'%3E%3Crect width='1600' height='1000' fill='%230b1220'/%3E%3C/svg%3E",
    width: 1_600,
    height: 1_000,
  },
];
</script>

<template>
  <main data-packed-nuxt-ready>
    <CarouselRoot v-model:active-id="activeCarouselId" :ids="['one', 'two']">
      <CarouselViewport>
        <CarouselTrack>
          <CarouselSlide id="one">One packed Nuxt item</CarouselSlide>
          <CarouselSlide id="two">Two packed Nuxt item</CarouselSlide>
        </CarouselTrack>
      </CarouselViewport>
    </CarouselRoot>
    <StackedDeck :items="screens" active-id="outcome" reduced-motion-override>
      <template #card="{ item }">{{ item.title }}</template>
    </StackedDeck>
    <Coverflow :items="screens" active-id="outcome" reduced-motion-override>
      <template #card="{ item }">{{ item.title }}</template>
    </Coverflow>
    <ModalDialog :open="false" />
    <Sheet :open="false" />
    <MediaGalleryDialog :items="galleryItems" :open="false" />
  </main>
</template>
