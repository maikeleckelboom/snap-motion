<script setup lang="ts">
import {
  CarouselNext,
  CarouselRoot,
  CarouselSlide,
  CarouselTrack,
  CarouselViewport,
} from "@snap-motion/vue/carousel";
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
</script>

<template>
  <main data-packed-ready :data-active-id="activeId">
    <CarouselRoot v-model:active-id="activeId" :ids="ids" reduced-motion-override>
      <CarouselViewport>
        <CarouselTrack>
          <CarouselSlide v-for="id in ids" :id="id" :key="id" :label="id">{{ id }}</CarouselSlide>
        </CarouselTrack>
      </CarouselViewport>
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
        <p class="packed-screen">{{ item.title }}</p>
      </template>
    </StackedDeck>
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
  inline-size: 100%;
  block-size: 100%;
  background: #eef2f7;
}
</style>
