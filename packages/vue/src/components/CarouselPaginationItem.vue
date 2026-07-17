<script setup lang="ts" generic="Id extends string">
import { computed, inject } from "vue";

import { carouselContextKey } from "./carousel-context.js";

const props = defineProps<{ id: Id; label?: string }>();
const context = inject(carouselContextKey);
if (!context) throw new Error("CarouselPaginationItem must be used inside CarouselRoot.");
const active = computed(() => context.activeId.value === props.id);
</script>

<template>
  <button
    class="snap-motion-carousel-pagination-item"
    type="button"
    v-bind="{
      ...(active ? { 'aria-current': 'page' as const } : {}),
      ...(label ? { 'aria-label': label } : {}),
    }"
    @click="context.navigate(id, 'picker')"
  >
    <slot :active="active" :id="id">{{ label ?? id }}</slot>
  </button>
</template>
