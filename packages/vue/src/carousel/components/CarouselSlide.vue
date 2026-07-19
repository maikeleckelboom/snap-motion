<script setup lang="ts" generic="Id extends string">
import { computed, inject, onBeforeUnmount, ref, watchEffect } from "vue";

import { carouselContextKey } from "../carousel-context";

const props = defineProps<{ id: Id; label: string }>();
const context = inject(carouselContextKey);
if (!context) throw new Error("CarouselSlide must be used inside CarouselRoot.");
const inactive = computed(() => context.activeId.value !== props.id);
const element = ref<HTMLElement>();
watchEffect(() => context.registerSlide(props.id, props.label, element.value));
onBeforeUnmount(() => context.unregisterSlide(props.id));
</script>

<template>
  <div
    ref="element"
    :aria-label="label"
    aria-roledescription="slide"
    class="snap-motion-carousel-slide"
    :data-slide-id="id"
    :dir="context.direction.value"
    :inert="inactive"
    role="group"
  >
    <slot />
  </div>
</template>
