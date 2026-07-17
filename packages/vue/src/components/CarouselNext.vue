<script setup lang="ts">
import { inject } from "vue";
import { ref } from "vue";

import { carouselContextKey } from "./carousel-context";
const props = withDefaults(defineProps<{ label?: string }>(), { label: "Next item" });
const context = inject(carouselContextKey);
if (!context) throw new Error("CarouselNext must be used inside CarouselRoot.");
const focused = ref(false);
</script>
<template>
  <button
    :aria-disabled="!context.canNext.value"
    :aria-label="props.label"
    class="snap-motion-carousel-next"
    :disabled="!context.canNext.value && !focused"
    type="button"
    @blur="focused = false"
    @click="context.canNext.value && context.next()"
    @focus="focused = true"
  >
    <slot>Next</slot>
  </button>
</template>
