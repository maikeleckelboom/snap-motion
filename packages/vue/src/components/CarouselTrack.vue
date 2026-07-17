<script setup lang="ts">
import { computed, inject, onBeforeUnmount, ref, watchEffect } from "vue";

import { carouselContextKey } from "./carousel-context.js";

const context = inject(carouselContextKey);
if (!context) throw new Error("CarouselTrack must be used inside CarouselRoot.");
const props = defineProps<{ endInset?: number | string; startInset?: number | string }>();
const element = ref<HTMLElement>();
const insetStyle = computed(() => ({
  ...(props.startInset === undefined
    ? {}
    : {
        paddingInlineStart:
          typeof props.startInset === "number" ? `${props.startInset}px` : props.startInset,
      }),
  ...(props.endInset === undefined
    ? {}
    : {
        paddingInlineEnd:
          typeof props.endInset === "number" ? `${props.endInset}px` : props.endInset,
      }),
}));
watchEffect(() => context.registerTrack(element.value));
onBeforeUnmount(() => context.registerTrack(undefined));
</script>

<template>
  <div
    ref="element"
    class="snap-motion-carousel-track"
    :data-end-inset="endInset"
    :data-start-inset="startInset"
    dir="ltr"
    :style="[insetStyle, context.trackStyle.value]"
  >
    <slot />
  </div>
</template>
