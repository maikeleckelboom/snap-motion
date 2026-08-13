<script setup lang="ts">
import {
  CarouselNext,
  CarouselPrevious,
  CarouselRoot,
  CarouselSlide,
  CarouselTrack,
  CarouselViewport,
} from "@snap-motion/vue/carousel";
import { Coverflow } from "@snap-motion/vue/coverflow";
import { ModalDialog } from "@snap-motion/vue/dialog";
import { MediaGalleryDialog } from "@snap-motion/vue/media-gallery";
import { Sheet } from "@snap-motion/vue/sheet";
import { StackedDeck } from "@snap-motion/vue/stacked-deck";
import { ref } from "vue";

const ids = ["one", "two"] as const;
const activeId = ref<(typeof ids)[number]>("one");

// Ordinary typed usage: domain items, no casts, no explicit generic arguments.
const screens = [
  { id: "overview", title: "Overview" },
  { id: "system", title: "System" },
  { id: "outcome", title: "Outcome" },
] as const;
const screenId = ref<(typeof screens)[number]["id"]>("system");
const coverflowId = ref<(typeof screens)[number]["id"]>("system");
const cardClicks = ref(0);
const controlClicks = ref(0);
const documentDirection = ref<"ltr" | "rtl">("ltr");
const sheetOpen = ref(false);
const galleryOpen = ref(false);
const galleryItems = [
  {
    id: "preview",
    title: "Packed preview",
    alt: "Packed preview",
    preview: {
      src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='500'%3E%3Crect width='800' height='500' fill='%230b1220'/%3E%3C/svg%3E",
      width: 800,
      height: 500,
    },
    full: {
      src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1600' height='1000'%3E%3Crect width='1600' height='1000' fill='%230b1220'/%3E%3C/svg%3E",
      width: 1_600,
      height: 1_000,
    },
  },
] as const;

function toggleDirection() {
  documentDirection.value = documentDirection.value === "ltr" ? "rtl" : "ltr";
}

function selectOverview() {
  screenId.value = "overview";
  coverflowId.value = "overview";
}
</script>

<template>
  <main
    :dir="documentDirection"
    data-packed-ready
    :data-active-id="activeId"
    :data-card-clicks="cardClicks"
    :data-control-clicks="controlClicks"
    :data-coverflow-id="coverflowId"
    :data-deck-id="screenId"
    :data-direction="documentDirection"
    :data-gallery-open="galleryOpen"
    :data-sheet-open="sheetOpen"
  >
    <button type="button" @click="toggleDirection">Toggle direction</button>
    <button type="button" @click="selectOverview">Select overview surfaces</button>
    <button type="button" @click="sheetOpen = true">Open sheet</button>
    <button type="button" @click="galleryOpen = true">Open gallery</button>
    <CarouselRoot v-model:active-id="activeId" :ids="ids" reduced-motion-override>
      <CarouselViewport>
        <CarouselTrack>
          <CarouselSlide v-for="id in ids" :id="id" :key="id" :label="id">{{ id }}</CarouselSlide>
        </CarouselTrack>
      </CarouselViewport>
      <CarouselPrevious />
      <CarouselNext />
    </CarouselRoot>

    <StackedDeck
      v-model:active-id="screenId"
      :items="screens"
      :item-label="(screen) => screen.title"
      label="Project screens"
      reduced-motion-override
      :data-packed-deck-id="screenId"
    >
      <template #card="{ item }">
        <article class="packed-screen" @click="cardClicks += 1">
          <p>{{ item.title }}</p>
          <button type="button" @click.stop="controlClicks += 1">Card action</button>
        </article>
      </template>
    </StackedDeck>

    <Coverflow
      v-model:active-id="coverflowId"
      :items="screens"
      :item-label="(screen) => screen.title"
      label="Packed coverflow"
      reduced-motion-override
    >
      <template #card="{ item }">
        <p>{{ item.title }}</p>
      </template>
    </Coverflow>

    <ModalDialog :open="false" />
    <Sheet
      v-model:open="sheetOpen"
      :initial-viewport-dimensions="{ blockSize: 800, inlineSize: 1200 }"
      reduced-motion-override
    >
      <template #title>Packed settings</template>
      <p>Sheet content from the packed dependency.</p>
    </Sheet>
    <MediaGalleryDialog v-model:open="galleryOpen" :items="galleryItems" reduced-motion-override />
  </main>
</template>

<style>
.snap-motion-carousel-viewport {
  inline-size: 20rem;
  overflow: hidden;
}
.snap-motion-carousel-track {
  display: flex;
}
.snap-motion-carousel-slide {
  flex: 0 0 20rem;
}
.packed-screen {
  box-sizing: border-box;
  inline-size: 100%;
  block-size: 100%;
  background: #eef2f7;
}
</style>
