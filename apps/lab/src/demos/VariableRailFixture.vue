<script setup lang="ts">
import { createVariableWidthGeometry, type MeasuredItemBox } from "@snap-motion/core";
import { useCarouselMotion } from "@snap-motion/vue";
import { computed, nextTick, ref, watch } from "vue";

import DiagnosticsPanel from "@/components/DiagnosticsPanel.vue";
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

const railItems = [
  { id: "rail-alpha", label: "Alpha", width: 180 },
  { id: "rail-beta", label: "Beta / wide", width: 310 },
  { id: "rail-gamma", label: "Gamma", width: 140 },
  { id: "rail-delta", label: "Delta / wide", width: 360 },
  { id: "rail-epsilon", label: "Epsilon", width: 210 },
];
const gap = 12;
const viewport = ref<HTMLElement>();
const track = ref<HTMLElement>();
const reducedOverride = computed(() => props.reducedMotionOverride);
const measuredViewportSize = ref(Math.max(1, props.stageWidth));
const railInsetStyle = computed(() => ({
  paddingInlineStart: `${Math.max(0, (measuredViewportSize.value - railItems[0]!.width) / 2)}px`,
  paddingInlineEnd: `${Math.max(0, (measuredViewportSize.value - railItems.at(-1)!.width) / 2)}px`,
}));

function fallbackBoxes(): MeasuredItemBox<string>[] {
  let start = 0;
  return railItems.map((item, order) => {
    const box = { id: item.id, order, size: item.width, start };
    start += item.width + gap;
    return box;
  });
}

function measureBoxes() {
  const cells = track.value?.querySelectorAll<HTMLElement>("[data-rail-id]");
  if (!cells?.length) {
    return fallbackBoxes();
  }
  return Array.from(cells, (cell, order) => ({
    id: cell.dataset.railId ?? `rail-${order}`,
    order,
    size: cell.offsetWidth,
    start: cell.offsetLeft,
  }));
}

function geometry() {
  const boxes = measureBoxes();
  const last = boxes.at(-1);
  const viewportSize = Math.max(1, viewport.value?.clientWidth ?? props.stageWidth);
  measuredViewportSize.value = viewportSize;
  const trackExtent = track.value?.scrollWidth ?? (last ? last.start + last.size : 0);
  return createVariableWidthGeometry({
    alignment: "center",
    items: boxes,
    trackExtent,
    viewportSize,
  });
}

const initialGeometry = geometry();
const motion = useCarouselMotion({
  anchors: initialGeometry.anchors,
  bounds: initialGeometry.bounds,
  elasticity: symmetricElasticityFromSettings(props.settings),
  initialTargetId: railItems[0]!.id,
  measure: geometry,
  programmaticImpulse: props.settings.programmaticImpulse,
  reducedMotionOverride: reducedOverride,
  releasePolicy: carouselReleaseFromSettings(props.settings),
  spring: springFromSettings(props.settings),
  track,
  viewport,
});

const stageStyle = computed(() => ({
  "--lab-stage-inline": `${Math.min(props.stageWidth, 1_280)}px`,
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
  () => props.stageWidth,
  () => void nextTick(motion.remeasure),
);
</script>

<template>
  <section class="variable-fixture" aria-labelledby="variable-title">
    <header>
      <div>
        <p>Secondary geometry fixture</p>
        <h3 id="variable-title">Unequal-width centered rail</h3>
      </div>
      <div class="rail-controls">
        <button
          aria-label="Previous rail item"
          data-testid="variable-previous"
          :disabled="!motion.canPrevious.value"
          type="button"
          @click="motion.previous()"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
            <path d="m15 5-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" />
          </svg>
        </button>
        <button
          aria-label="Next rail item"
          data-testid="variable-next"
          :disabled="!motion.canNext.value"
          type="button"
          @click="motion.next()"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
            <path d="m9 5 7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" />
          </svg>
        </button>
      </div>
    </header>

    <div
      ref="viewport"
      aria-label="Variable-width geometry rail"
      aria-roledescription="carousel"
      class="rail-viewport"
      data-testid="variable-rail"
      :data-active-id="motion.targetId.value ?? motion.activeId.value"
      :style="[stageStyle, motion.surfaceStyle]"
      tabindex="0"
      @keydown="motion.onKeyDown"
      @pointerdown="motion.onPointerDown"
      @wheel="motion.onWheel"
    >
      <div ref="track" class="rail-track" :style="[railInsetStyle, motion.trackStyle.value]">
        <article
          v-for="(item, index) in railItems"
          :key="item.id"
          :aria-label="`${item.label}, ${index + 1} of ${railItems.length}`"
          aria-roledescription="slide"
          class="rail-cell"
          :data-rail-id="item.id"
          :style="{ inlineSize: `${item.width}px` }"
        >
          <span class="tabular">{{ String(index + 1).padStart(2, "0") }}</span>
          <strong>{{ item.label }}</strong>
        </article>
      </div>
    </div>

    <DiagnosticsPanel :diagnostics="diagnostics" />
  </section>
</template>

<style scoped>
.variable-fixture {
  display: grid;
  min-inline-size: 0;
  gap: 1rem;
  padding-block-start: 2rem;
  border-block-start: 1px solid var(--strong);
}

header {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 1rem;
}

header p,
header h3 {
  margin: 0;
}

header p {
  margin-block-end: 0.25rem;
  color: var(--muted);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

header h3 {
  font-size: 1rem;
}

.rail-controls {
  display: flex;
}

.rail-controls button {
  display: grid;
  place-items: center;
  inline-size: 2.25rem;
  block-size: 2.25rem;
  padding: 0;
  margin-inline-end: -1px;
}

.rail-viewport {
  inline-size: min(100%, var(--lab-stage-inline));
  max-inline-size: 100%;
  min-inline-size: 0;
  margin-inline: auto;
  border: 1px solid var(--strong);
  background: var(--paper);
  overflow: hidden;
  cursor: grab;
}

.rail-track {
  display: flex;
  align-items: stretch;
  gap: 12px;
  inline-size: max-content;
  padding-block: 1rem;
}

.rail-cell {
  display: grid;
  grid-template-rows: auto 1fr;
  flex: 0 0 auto;
  min-inline-size: 0;
  min-block-size: 9rem;
  padding: 0.8rem;
  border: 1px solid var(--line);
  background: #ececec;
}

.rail-cell span {
  color: var(--muted);
  font-size: 0.7rem;
}

.rail-cell strong {
  align-self: end;
  font-size: 0.92rem;
}
</style>
