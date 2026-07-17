<script setup lang="ts">
import { inject, ref } from "vue";

import { carouselContextKey } from "./carousel-context.js";
const props = defineProps<{ label?: string }>();
const context = inject(carouselContextKey);
if (!context) throw new Error("CarouselPrevious must be used inside CarouselRoot.");
const focused = ref(false);
</script>
<template>
  <button
    :aria-disabled="!context.canPrevious.value"
    :aria-label="props.label ?? context.messages.value.previousItem"
    class="snap-motion-carousel-previous"
    :disabled="!context.canPrevious.value && !focused"
    type="button"
    @blur="focused = false"
    @click="context.canPrevious.value && context.previous()"
    @focus="focused = true"
  >
    <slot :disabled="!context.canPrevious.value" :previous="context.previous">
      {{ context.messages.value.previousItem }}
    </slot>
  </button>
</template>
