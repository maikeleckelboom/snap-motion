<script setup lang="ts">
import { useCarouselWindow } from "@snap-motion/vue";
import { computed, ref } from "vue";

const ids = Array.from({ length: 100 }, (_, index) => `media-${index + 1}`);
const activeIndex = ref(0);
const activeId = computed(() => ids[activeIndex.value]);
const window = useCarouselWindow(ids, activeId, {
  mountAfter: 2,
  mountBefore: 2,
  preloadAfter: 4,
  preloadBefore: 4,
});
</script>

<template>
  <section class="render-window-fixture" aria-labelledby="render-window-title">
    <header>
      <div>
        <p>Semantic media window</p>
        <h3 id="render-window-title">100 items, bounded mounting</h3>
      </div>
      <span class="tabular">{{ activeIndex + 1 }} / {{ ids.length }}</span>
    </header>
    <div class="render-window-controls">
      <button
        :disabled="activeIndex === 0"
        type="button"
        @click="activeIndex = Math.max(0, activeIndex - 1)"
      >
        Previous
      </button>
      <button
        :disabled="activeIndex === ids.length - 1"
        type="button"
        @click="activeIndex = Math.min(ids.length - 1, activeIndex + 1)"
      >
        Next
      </button>
    </div>
    <ol data-testid="render-window-mounted">
      <li
        v-for="id in window.mountedIds.value"
        :key="id"
        :aria-current="id === activeId ? 'true' : undefined"
      >
        {{ id }}
      </li>
    </ol>
    <p>
      Mounted: {{ window.mountedIds.value.size }}. Preload candidates:
      {{ [...window.preloadIds.value].join(", ") }}.
    </p>
  </section>
</template>

<style scoped>
.render-window-fixture {
  display: grid;
  gap: 0.75rem;
  padding-block: 1.25rem;
  border-block: 1px solid var(--strong);
}

header,
.render-window-controls,
ol {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

header {
  justify-content: space-between;
}

header p,
header h3,
.render-window-fixture > p {
  margin: 0;
}

header p,
.render-window-fixture > p {
  color: var(--muted);
  font-size: 0.72rem;
}

ol {
  flex-wrap: wrap;
  padding: 0;
  margin: 0;
  list-style: none;
}

li {
  padding: 0.45rem 0.65rem;
  border: 1px solid var(--line);
  font-size: 0.72rem;
}

li[aria-current="true"] {
  border-color: var(--strong);
  background: var(--ink);
  color: var(--paper);
}
</style>
