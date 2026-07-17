<script setup lang="ts">
import { inject, onBeforeUnmount, ref, watchEffect } from "vue";

import { carouselContextKey } from "./carousel-context";

const context = inject(carouselContextKey);
if (!context) throw new Error("CarouselTrack must be used inside CarouselRoot.");
const element = ref<HTMLElement>();
watchEffect(() => context.registerTrack(element.value));
onBeforeUnmount(() => context.registerTrack(undefined));
</script>

<template>
  <div ref="element" class="snap-motion-carousel-track" :style="context.trackStyle.value">
    <slot />
  </div>
</template>
