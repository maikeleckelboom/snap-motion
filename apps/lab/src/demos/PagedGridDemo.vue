<script setup lang="ts">
import { createPagedGridGeometry } from "@snap-motion/core";
import { useCarouselMotion } from "@snap-motion/vue";
import { computed, nextTick, ref, watch } from "vue";

import DiagnosticsPanel from "@/components/DiagnosticsPanel.vue";
import VariableRailFixture from "@/demos/VariableRailFixture.vue";
import {
  carouselReleaseFromSettings,
  springFromSettings,
  symmetricElasticityFromSettings,
} from "@/fixtures/lab-settings";
import type { LabDiagnostics, LabPhysicsSettings } from "@/fixtures/lab-types";

const props = defineProps<{
  reducedMotionOverride: boolean | undefined;
  settings: LabPhysicsSettings;
  stageWidth: number;
}>();

interface GridItem {
  id: string;
  label: string;
}

const rows = ref(2);
const columns = ref(2);
const gap = ref(16);
const items = ref<GridItem[]>(
  Array.from({ length: 9 }, (_, index) => ({
    id: `item-${index + 1}`,
    label: `Study ${String(index + 1).padStart(2, "0")}`,
  })),
);
let nextItemNumber = 10;
const viewport = ref<HTMLElement>();
const track = ref<HTMLElement>();
const liveMessage = ref("");
const previousFocused = ref(false);
const nextFocused = ref(false);
const reducedOverride = computed(() => props.reducedMotionOverride);
const pageCapacity = computed(() => rows.value * columns.value);
const pages = computed(() => {
  const result: { id: string; items: GridItem[] }[] = [];
  for (let index = 0; index < items.value.length; index += pageCapacity.value) {
    result.push({
      id: `page-${result.length + 1}`,
      items: items.value.slice(index, index + pageCapacity.value),
    });
  }
  return result;
});

function geometry() {
  return createPagedGridGeometry({
    columns: columns.value,
    gap: gap.value,
    getPageId: ({ pageIndex }) => `page-${pageIndex + 1}`,
    itemIds: items.value.map((item) => item.id),
    rows: rows.value,
    viewportSize: Math.max(1, viewport.value?.clientWidth ?? props.stageWidth),
  });
}

const initialGeometry = geometry();
const motion = useCarouselMotion({
  anchors: initialGeometry.anchors,
  bounds: initialGeometry.bounds,
  elasticity: symmetricElasticityFromSettings(props.settings),
  initialTargetId: initialGeometry.anchors[0]!.id,
  measure: geometry,
  programmaticImpulse: props.settings.programmaticImpulse,
  reducedMotionOverride: reducedOverride,
  releasePolicy: carouselReleaseFromSettings(props.settings),
  spring: springFromSettings(props.settings),
  track,
  viewport,
});

const currentPageId = computed(() => motion.targetId.value ?? motion.activeId.value ?? "page-1");
const currentPageIndex = computed(() => {
  const index = pages.value.findIndex((page) => page.id === currentPageId.value);
  return index < 0 ? 0 : index;
});
const stageStyle = computed(() => ({
  "--lab-stage-inline": `${Math.min(props.stageWidth, 1_280)}px`,
}));
const gridStyle = computed(() => ({
  "--grid-columns": String(columns.value),
  "--grid-gap": `${gap.value}px`,
  "--grid-rows": String(rows.value),
}));
const diagnostics = computed<LabDiagnostics>(() => {
  const measured = geometry();
  return {
    ...(motion.activeId.value ? { activeId: motion.activeId.value } : {}),
    anchors: motion.snapshot.value.anchors,
    bounds: motion.snapshot.value.bounds,
    isAnimating: motion.isAnimating.value,
    phase: motion.phase.value,
    pointerOwned: motion.pointerOwned.value,
    position: motion.position.value,
    reducedMotion: motion.reducedMotion.value,
    ...(motion.targetId.value ? { targetId: motion.targetId.value } : {}),
    trackExtent: measured.trackExtent,
    velocity: motion.velocity.value,
    viewportSize: measured.viewportSize,
  };
});

function announce() {
  liveMessage.value = `Page ${currentPageIndex.value + 1} of ${pages.value.length}`;
}

function previous() {
  motion.previous();
}

function next() {
  motion.next();
}

function onKeyDown(event: KeyboardEvent) {
  if (event.target !== event.currentTarget) {
    return;
  }
  motion.onKeyDown(event);
}

function addItem() {
  const id = `item-${nextItemNumber}`;
  items.value.push({ id, label: `Study ${String(nextItemNumber).padStart(2, "0")}` });
  nextItemNumber += 1;
}

function removeItem() {
  if (items.value.length > 1) {
    items.value.pop();
  }
}

watch(
  () => props.settings,
  (settings) => {
    motion.configure({
      elasticity: symmetricElasticityFromSettings(settings),
      programmaticImpulse: settings.programmaticImpulse,
      releasePolicy: carouselReleaseFromSettings(settings),
      spring: springFromSettings(settings),
    });
  },
  { deep: true },
);

watch(
  [rows, columns, gap, () => items.value.length, () => props.stageWidth],
  () => void nextTick(motion.remeasure),
  { flush: "post" },
);

watch([motion.activeId, motion.phase], ([activeId, phase], [previousId]) => {
  if (phase === "idle" && activeId !== undefined && activeId !== previousId) {
    announce();
  }
});
</script>

<template>
  <div class="grid-demo">
    <section class="grid-tool" aria-labelledby="grid-title">
      <header class="grid-tool-header">
        <div>
          <p>Recovered interaction</p>
          <h3 id="grid-title">Explicit pages, internal grids</h3>
        </div>
        <div class="page-status tabular" aria-hidden="true">
          {{ currentPageIndex + 1 }} / {{ pages.length }}
        </div>
      </header>

      <div class="fixture-controls">
        <label
          >Rows <input v-model.number="rows" data-testid="grid-rows" max="3" min="1" type="number"
        /></label>
        <label
          >Columns
          <input v-model.number="columns" data-testid="grid-columns" max="4" min="1" type="number"
        /></label>
        <label
          >Gap
          <input
            v-model.number="gap"
            data-testid="grid-gap"
            max="40"
            min="0"
            step="2"
            type="number"
        /></label>
        <span class="item-count tabular">{{ items.length }} items</span>
        <button data-testid="add-grid-item" type="button" @click="addItem">Add item</button>
        <button
          data-testid="remove-grid-item"
          :disabled="items.length <= 1"
          type="button"
          @click="removeItem"
        >
          Remove item
        </button>
      </div>

      <div
        aria-labelledby="grid-title"
        aria-roledescription="carousel"
        class="grid-stage"
        role="group"
        :style="stageStyle"
      >
        <button
          aria-label="Previous page"
          :aria-disabled="!motion.canPrevious.value"
          class="page-control"
          data-testid="grid-previous"
          :disabled="!motion.canPrevious.value && !previousFocused"
          type="button"
          @blur="previousFocused = false"
          @click="motion.canPrevious.value && previous()"
          @focus="previousFocused = true"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20">
            <path d="m15 5-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" />
          </svg>
        </button>

        <section
          ref="viewport"
          aria-describedby="grid-keyboard-help"
          class="grid-viewport"
          data-testid="paged-grid"
          :data-active-id="currentPageId"
          :data-columns="columns"
          :data-gap="gap"
          :data-page-count="pages.length"
          :data-phase="motion.phase.value"
          :data-rows="rows"
          :style="motion.surfaceStyle"
          tabindex="0"
          @keydown="onKeyDown"
          @pointerdown="motion.onPointerDown"
          @wheel="motion.onWheel"
        >
          <div ref="track" class="page-track" :style="motion.trackStyle.value">
            <section
              v-for="(page, pageIndex) in pages"
              :key="page.id"
              :aria-label="`Page ${pageIndex + 1} of ${pages.length}`"
              aria-roledescription="slide"
              class="grid-page"
              :data-page-id="page.id"
              :inert="currentPageId !== page.id"
              role="group"
            >
              <div class="item-grid" :style="gridStyle">
                <article
                  v-for="(item, itemIndex) in page.items"
                  :key="item.id"
                  class="grid-item"
                  :data-item-id="item.id"
                >
                  <span class="tabular">{{
                    String(pageIndex * pageCapacity + itemIndex + 1).padStart(2, "0")
                  }}</span>
                  <strong>{{ item.label }}</strong>
                  <button type="button">Inspect</button>
                </article>
              </div>
            </section>
          </div>
        </section>

        <button
          aria-label="Next page"
          :aria-disabled="!motion.canNext.value"
          class="page-control"
          data-testid="grid-next"
          :disabled="!motion.canNext.value && !nextFocused"
          type="button"
          @blur="nextFocused = false"
          @click="motion.canNext.value && next()"
          @focus="nextFocused = true"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20">
            <path d="m9 5 7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" />
          </svg>
        </button>
        <p id="grid-keyboard-help" class="sr-only">
          Use Left and Right Arrow to move between pages. Use Home and End to jump.
        </p>
      </div>
      <p class="sr-only" aria-atomic="true" role="status">{{ liveMessage }}</p>
    </section>

    <DiagnosticsPanel :diagnostics="diagnostics" />
    <VariableRailFixture
      :reduced-motion-override="reducedMotionOverride"
      :settings="settings"
      :stage-width="stageWidth"
    />
  </div>
</template>

<style scoped>
.grid-demo,
.grid-tool {
  display: grid;
  min-inline-size: 0;
  gap: 1.25rem;
}

.grid-tool {
  padding-block: 1.25rem;
  border-block: 1px solid var(--strong);
}

.grid-tool-header {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 1rem;
}

.grid-tool-header p,
.grid-tool-header h3 {
  margin: 0;
}

.grid-tool-header p {
  margin-block-end: 0.25rem;
  color: var(--muted);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.grid-tool-header h3 {
  font-size: 1.1rem;
}

.page-status {
  font-size: 0.8rem;
  font-weight: 700;
}

.fixture-controls {
  display: flex;
  min-inline-size: 0;
  flex-wrap: wrap;
  align-items: end;
  gap: 0.6rem;
  padding-block: 0.75rem;
  border-block: 1px solid var(--line);
}

.fixture-controls label {
  display: grid;
  gap: 0.25rem;
  color: var(--muted);
  font-size: 0.68rem;
}

.fixture-controls input {
  inline-size: 4.5rem;
  min-block-size: 2rem;
  border: 1px solid var(--line);
  border-radius: 0;
  background: var(--paper);
  text-align: end;
}

.fixture-controls button {
  min-block-size: 2rem;
  padding-inline: 0.65rem;
  font-size: 0.72rem;
}

.item-count {
  align-self: center;
  margin-inline-start: auto;
  color: var(--muted);
  font-size: 0.72rem;
}

.grid-stage {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  inline-size: min(100%, var(--lab-stage-inline));
  max-inline-size: 100%;
  margin-inline: auto;
}

.page-control {
  display: grid;
  place-items: center;
  inline-size: 2.75rem;
  block-size: 3.5rem;
  padding: 0;
}

.grid-viewport {
  min-inline-size: 0;
  border-block: 1px solid var(--strong);
  background: var(--paper);
  overflow: hidden;
  cursor: grab;
}

.grid-viewport[data-phase="dragging"] {
  cursor: grabbing;
}

.page-track {
  display: flex;
  align-items: stretch;
  transform: translate3d(0, 0, 0);
}

.grid-page {
  flex: 0 0 100%;
  inline-size: 100%;
  min-inline-size: 0;
}

.item-grid {
  display: grid;
  grid-template-columns: repeat(var(--grid-columns), minmax(0, 1fr));
  grid-template-rows: repeat(var(--grid-rows), minmax(7.5rem, 1fr));
  gap: var(--grid-gap);
}

.grid-item {
  display: grid;
  grid-template-rows: auto 1fr auto;
  min-inline-size: 0;
  min-block-size: 7.5rem;
  padding: 0.65rem;
  border: 1px solid var(--line);
  background: #ededed;
}

.grid-item > span {
  color: var(--muted);
  font-size: 0.68rem;
}

.grid-item strong {
  align-self: center;
  overflow-wrap: anywhere;
  font-size: clamp(0.78rem, 1.2vw, 0.95rem);
}

.grid-item button {
  justify-self: start;
  min-block-size: 1.85rem;
  padding-inline: 0.5rem;
  font-size: 0.68rem;
}

@media (max-width: 42rem) {
  .fixture-controls {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
  }

  .item-count {
    margin-inline-start: 0;
  }

  .grid-stage {
    grid-template-columns: 2.35rem minmax(0, 1fr) 2.35rem;
  }

  .page-control {
    inline-size: 2.35rem;
  }
}
</style>
