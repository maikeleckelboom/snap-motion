<script setup lang="ts">
import {
  CarouselNext,
  CarouselRoot,
  CarouselSlide,
  CarouselTrack,
  CarouselViewport,
} from "@snap-motion/vue/carousel";
import { ref } from "vue";

const ids = ["one", "two"] as const;
const activeId = ref<(typeof ids)[number]>("one");
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
</style>
