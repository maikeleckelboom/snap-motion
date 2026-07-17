<script setup lang="ts" generic="Id extends string">
import { computed, inject, onBeforeUnmount, watchEffect } from "vue";

import { carouselContextKey } from "./carousel-context";

const props = defineProps<{ id: Id; label: string }>();
const context = inject(carouselContextKey);
if (!context) throw new Error("CarouselSlide must be used inside CarouselRoot.");
const inactive = computed(() => context.activeId.value !== props.id);
watchEffect(() => context.registerSlide(props.id, props.label));
onBeforeUnmount(() => context.unregisterSlide(props.id));
</script>

<template>
  <div
    :aria-label="label"
    aria-roledescription="slide"
    class="snap-motion-carousel-slide"
    :data-slide-id="id"
    :inert="inactive"
    role="group"
  >
    <slot />
  </div>
</template>
