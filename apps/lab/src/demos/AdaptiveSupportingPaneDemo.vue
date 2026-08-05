<script setup lang="ts">
import { Sheet } from "@snap-motion/vue/sheet";
import { useBreakpoints } from "@vueuse/core";
import { computed, nextTick, ref, watch } from "vue";

import SheetInspectorContent from "./SheetInspectorContent.vue";

interface SheetInstance {
  closeForPresentationChange: () => boolean;
}

defineProps<{ reducedMotionOverride: boolean | undefined }>();

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
const name = ref("Motion review");
const density = ref("calm");
const notifications = ref(true);

watch(presentation, async (next, previous) => {
  if (next === "inline") {
    const transferFocus = sheet.value?.closeForPresentationChange() ?? false;
    sheetOpen.value = false;
    await nextTick();
    if (transferFocus) inlineHeading.value?.focus({ preventScroll: true });
    return;
  }
  if (previous === "inline") sheetOpen.value = false;
});
</script>

<template>
  <section class="adaptive-fixture" data-testid="adaptive-sheet-fixture">
    <div class="adaptive-copy">
      <p>Host-owned responsive composition</p>
      <h3>One inspector state, one mounted semantic host</h3>
      <span>
        Wide is an inline aside; medium chooses a right-side sheet; compact chooses a bottom-side
        sheet.
      </span>
    </div>

    <aside
      v-if="presentation === 'inline'"
      class="supporting-pane"
      data-testid="inline-supporting-pane"
    >
      <h4 ref="inlineHeading" data-testid="inline-inspector-heading" tabindex="-1">Inspector</h4>
      <SheetInspectorContent
        v-model:density="density"
        v-model:name="name"
        v-model:notifications="notifications"
      />
    </aside>

    <template v-else>
      <button data-testid="adaptive-sheet-trigger" type="button" @click="sheetOpen = true">
        Open inspector
      </button>
      <Sheet
        ref="sheet"
        v-model:open="sheetOpen"
        data-testid="adaptive-sheet"
        :reduced-motion-override="reducedMotionOverride"
        :side="presentation"
      >
        <template #title>Inspector</template>
        <SheetInspectorContent
          v-model:density="density"
          v-model:name="name"
          v-model:notifications="notifications"
        />
      </Sheet>
    </template>
  </section>
</template>

<style scoped>
.adaptive-fixture {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(18rem, 24rem);
  gap: clamp(1.5rem, 4vw, 4rem);
  align-items: start;
  padding-block: clamp(2rem, 5vw, 4rem);
  border-block-start: 1px solid var(--strong);
}
.adaptive-copy :is(p, h3, span),
.supporting-pane h4 {
  margin: 0;
}
.adaptive-copy p {
  color: var(--muted);
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.adaptive-copy h3 {
  margin-block-start: 0.4rem;
  font-size: clamp(1.25rem, 2.4vw, 2rem);
}
.adaptive-copy span {
  display: block;
  max-inline-size: 42rem;
  margin-block-start: 0.75rem;
  color: var(--muted);
}
.supporting-pane {
  padding: 1.25rem;
  border: 1px solid var(--strong);
  background: color-mix(in srgb, var(--paper) 94%, var(--ink));
}
.supporting-pane h4 {
  font-size: 1rem;
}
.adaptive-fixture > button {
  justify-self: end;
  min-block-size: 2.75rem;
  padding-inline: 1rem;
}
@media (max-width: 69.99rem) {
  .adaptive-fixture {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: end;
  }
}
</style>
