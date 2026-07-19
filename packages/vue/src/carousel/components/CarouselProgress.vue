<script setup lang="ts">
import { computed, inject } from "vue";

import { carouselContextKey } from "../carousel-context";

defineProps<{ label?: string }>();
const context = inject(carouselContextKey);
if (!context) throw new Error("CarouselProgress must be used inside CarouselRoot.");
const index = computed(() => {
  const activeId = context.activeId.value;
  return activeId === undefined ? -1 : context.ids.value.indexOf(activeId);
});
</script>

<template>
  <slot :count="context.count.value" :index="index" :value="index + 1">
    <progress
      :aria-label="label ?? context.messages.value.progressLabel"
      class="snap-motion-carousel-progress"
      :max="Math.max(1, context.count.value)"
      :value="Math.max(0, index + 1)"
    />
  </slot>
</template>
