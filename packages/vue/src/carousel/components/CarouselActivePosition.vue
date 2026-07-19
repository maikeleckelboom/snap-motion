<script setup lang="ts">
import { computed, inject } from "vue";

import { carouselContextKey } from "../carousel-context";

const context = inject(carouselContextKey);
if (!context) throw new Error("CarouselActivePosition must be used inside CarouselRoot.");
const index = computed(() => {
  const activeId = context.activeId.value;
  return activeId === undefined ? -1 : context.ids.value.indexOf(activeId);
});
</script>

<template>
  <span class="snap-motion-carousel-position">
    <slot :count="context.count.value" :index="index" :value="index + 1">
      {{ Math.max(0, index + 1) }} / {{ context.count.value }}
    </slot>
  </span>
</template>
