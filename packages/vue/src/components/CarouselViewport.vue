<script setup lang="ts">
import { inject, onBeforeUnmount, ref, watchEffect } from "vue";

import { carouselContextKey } from "./carousel-context";

const context = inject(carouselContextKey);
if (!context) throw new Error("CarouselViewport must be used inside CarouselRoot.");
const element = ref<HTMLElement>();
watchEffect(() => context.registerViewport(element.value));
onBeforeUnmount(() => context.registerViewport(undefined));
</script>

<template>
  <div
    ref="element"
    :aria-describedby="context.instructionId"
    class="snap-motion-carousel-viewport"
    :data-active-id="context.activeId.value"
    :data-phase="context.phase.value"
    :style="context.surfaceStyle"
    tabindex="0"
    @keydown="context.onKeyDown"
    @pointerdown="context.onPointerDown"
    @wheel="context.onWheel"
  >
    <slot />
  </div>
</template>
