<script setup lang="ts">
import { inject } from "vue";
import { ref } from "vue";

import { carouselContextKey } from "./carousel-context";
const props = withDefaults(defineProps<{ label?: string }>(), { label: "Previous item" });
const context = inject(carouselContextKey);
if (!context) throw new Error("CarouselPrevious must be used inside CarouselRoot.");
const focused = ref(false);
</script>
<template>
  <button
    :aria-disabled="!context.canPrevious.value"
    :aria-label="props.label"
    class="snap-motion-carousel-previous"
    :disabled="!context.canPrevious.value && !focused"
    type="button"
    @blur="focused = false"
    @click="context.canPrevious.value && context.previous()"
    @focus="focused = true"
  >
    <slot>Previous</slot>
  </button>
</template>
