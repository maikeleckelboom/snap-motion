<script setup lang="ts">
import { CarouselRoot, CarouselViewport } from "@snap-motion/vue";
</script>

<template>
  <main data-packed-nuxt-ready>
    <CarouselRoot active-id="one" :ids="['one']">
      <CarouselViewport>One packed Nuxt item</CarouselViewport>
    </CarouselRoot>
  </main>
</template>
