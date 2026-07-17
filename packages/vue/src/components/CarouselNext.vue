<script setup lang="ts">
import { inject, ref } from "vue";

import { carouselContextKey } from "./carousel-context.js";
const props = defineProps<{ label?: string }>();
const context = inject(carouselContextKey);
if (!context) throw new Error("CarouselNext must be used inside CarouselRoot.");
const focused = ref(false);
</script>
<template>
  <button
    :aria-disabled="!context.canNext.value"
    :aria-label="props.label ?? context.messages.value.nextItem"
    class="snap-motion-carousel-next"
    :disabled="!context.canNext.value && !focused"
    type="button"
    @blur="focused = false"
    @click="context.canNext.value && context.next()"
    @focus="focused = true"
  >
    <slot :disabled="!context.canNext.value" :next="context.next">
      {{ context.messages.value.nextItem }}
    </slot>
  </button>
</template>
