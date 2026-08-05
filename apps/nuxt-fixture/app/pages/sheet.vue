<script setup lang="ts">
import { Sheet } from "@snap-motion/vue/sheet";
import { useBreakpoints } from "@vueuse/core";
import { computed, nextTick, ref, watch } from "vue";

interface SheetInstance {
  closeForPresentationChange: () => boolean;
}

const breakpoints = useBreakpoints({ compact: 0, medium: 720, wide: 1120 }, { ssrWidth: 1280 });
const activeBreakpoint = breakpoints.active();
const presentation = computed<"bottom" | "inline" | "right">(() => {
  if (activeBreakpoint.value === "wide") return "inline";
  if (activeBreakpoint.value === "medium") return "right";
  return "bottom";
});
const sheet = ref<SheetInstance>();
const inlineHeading = ref<HTMLElement>();
const sheetOpen = ref(false);
const name = ref("Hydrated inspector");

watch(presentation, async (next, previous) => {
  if (next === "inline") {
    const transferFocus = sheet.value?.closeForPresentationChange() ?? false;
    sheetOpen.value = false;
    await nextTick();
    if (transferFocus) inlineHeading.value?.focus({ preventScroll: true });
  } else if (previous === "inline") {
    sheetOpen.value = false;
  }
});
</script>

<template>
  <main data-testid="nuxt-adaptive-sheet">
    <h1>Adaptive inspector fixture</h1>
    <aside v-if="presentation === 'inline'" data-testid="nuxt-inline-inspector">
      <h2 ref="inlineHeading" data-testid="nuxt-inline-heading" tabindex="-1">Inspector</h2>
      <AdaptiveInspectorContent v-model:name="name" />
    </aside>
    <template v-else>
      <button data-testid="nuxt-sheet-trigger" type="button" @click="sheetOpen = true">
        Open inspector
      </button>
      <Sheet ref="sheet" v-model:open="sheetOpen" data-testid="nuxt-sheet" :side="presentation">
        <template #title>Inspector</template>
        <AdaptiveInspectorContent v-model:name="name" />
      </Sheet>
    </template>
  </main>
</template>

<style scoped>
main {
  max-inline-size: 72rem;
  padding: 2rem;
  margin-inline: auto;
  font-family: system-ui, sans-serif;
}
aside {
  max-inline-size: 26rem;
  padding: 1rem;
  border: 1px solid currentColor;
}
label {
  display: grid;
  gap: 0.5rem;
}
input,
button {
  min-block-size: 2.75rem;
}
</style>
