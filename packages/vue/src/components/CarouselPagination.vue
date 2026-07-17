<script setup lang="ts">
import { inject } from "vue";

import { carouselContextKey } from "./carousel-context.js";

defineProps<{ label?: string }>();
const context = inject(carouselContextKey);
if (!context) throw new Error("CarouselPagination must be used inside CarouselRoot.");
</script>

<template>
  <nav
    :aria-label="label ?? context.messages.value.paginationLabel"
    class="snap-motion-carousel-pagination"
  >
    <slot
      :active-id="context.activeId.value"
      :direction="context.direction.value"
      :ids="context.ids.value"
      :navigate="context.navigate"
    />
  </nav>
</template>
