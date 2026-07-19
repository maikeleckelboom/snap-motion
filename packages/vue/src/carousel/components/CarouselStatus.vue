<script setup lang="ts">
import { inject } from "vue";

import { carouselContextKey } from "../carousel-context";
const context = inject(carouselContextKey);
if (!context) throw new Error("CarouselStatus must be used inside CarouselRoot.");
</script>
<template>
  <p :id="context.statusId" aria-atomic="true" class="snap-motion-visually-hidden" role="status">
    <slot :text="context.statusText.value">{{ context.statusText.value }}</slot>
  </p>
</template>
