<script setup lang="ts">
import {
  Sheet,
  SheetSnapPicker,
  createFixedSheetSnapPoints,
  createViewportSheetSnapPoints,
  sheetSnapVisibleExtent,
  type SheetNavigationReason,
  type SheetOpenSnapId,
  type SheetSide,
  type SheetSnapPoint,
  type UseSheetMotionReturn,
} from "@snap-motion/vue/sheet";
import { computed, ref, watch } from "vue";

import DiagnosticsPanel from "@/components/DiagnosticsPanel.vue";
import { springFromSettings } from "@/fixtures/lab-settings";
import type { LabDiagnostics, LabPhysicsSettings } from "@/fixtures/lab-types";

type ContentMode = "prose" | "short" | "tall";
type SnapMode = "custom" | "default";

interface SheetInstance {
  motion: UseSheetMotionReturn<SheetOpenSnapId>;
  requestSnap: (id: SheetOpenSnapId, reason: SheetNavigationReason) => void;
}

const props = defineProps<{
  reducedMotionOverride: boolean | undefined;
  settings: LabPhysicsSettings;
  stageWidth: number;
}>();

const sheet = ref<SheetInstance>();
const opener = ref<HTMLButtonElement>();
const sheetOpen = ref(false);
const activeId = ref<SheetOpenSnapId>("comfortable");
const side = ref<SheetSide>("bottom");
const contentMode = ref<ContentMode>("tall");
const snapMode = ref<SnapMode>("default");
const noteCount = ref(8);

const horizontal = computed(() => side.value === "left" || side.value === "right");
const elasticity = computed(() => ({
  min: {
    resistance: props.settings.elasticResistance,
    maxDistance: props.settings.maxElasticDistance,
  },
  max: false as const,
}));
const releasePolicy = computed(() => ({
  projectionSeconds: props.settings.projectionSeconds,
  flingVelocity: props.settings.flingVelocity,
  maxAnchorSkip: Math.max(1, Math.round(props.settings.maxAnchorSkip)),
  forwardSign: 1 as const,
}));
const spring = computed(() => springFromSettings(props.settings));
const focusReturn = computed(() => (opener.value ? { opener: opener.value } : {}));
const dialogStyle = computed(() => ({
  "--snap-motion-sheet-content-max-inline-size": contentMode.value === "prose" ? "48rem" : "none",
  "--snap-motion-sheet-content-padding-inline": "clamp(1rem, 4vw, 2rem)",
  "--snap-motion-sheet-inline-size": `${Math.min(Math.max(320, props.stageWidth * 0.42), 480)}px`,
}));
const snapPoints = computed<readonly SheetSnapPoint<SheetOpenSnapId>[]>(() => {
  if (horizontal.value) {
    const points = createFixedSheetSnapPoints();
    return snapMode.value === "default"
      ? points
      : [
          ...points,
          {
            id: "compact",
            label: "Peek",
            resolveVisibleExtent: sheetSnapVisibleExtent.pixels(176),
          },
        ];
  }
  const points = createViewportSheetSnapPoints();
  if (snapMode.value === "default") return points;
  return points.map((point) =>
    point.id === "full"
      ? {
          ...point,
          resolveVisibleExtent: (context) => context.primaryViewportExtent - 80,
        }
      : point,
  );
});
const diagnostics = computed<LabDiagnostics>(() => {
  const motion = sheet.value?.motion;
  if (!motion) {
    return {
      anchors: [],
      bounds: { min: 0, max: 0 },
      isAnimating: false,
      phase: "closed",
      pointerOwned: false,
      position: 0,
      reducedMotion: Boolean(props.reducedMotionOverride),
      trackExtent: 0,
      velocity: 0,
      viewportSize: 0,
    };
  }

  const geometry = motion.geometry.value;
  return {
    ...(motion.activeId.value ? { activeId: motion.activeId.value } : {}),
    anchors: motion.snapshot.value.anchors,
    bodyClientBlockExtent: geometry.bodyClientBlockExtent,
    bodyScrollBlockExtent: geometry.bodyScrollBlockExtent,
    bodyScrollOffset: geometry.bodyScrollOffset,
    bounds: motion.snapshot.value.bounds,
    canonicalPosition: geometry.canonicalPosition,
    intrinsicContentPrimaryExtent: geometry.intrinsicContentPrimaryExtent,
    isAnimating: motion.isAnimating.value,
    maximumBodyScrollOffset: geometry.maximumBodyScrollOffset,
    measuredChromeBlockExtent: geometry.measuredChromeBlockExtent,
    phase: motion.sheetState.value,
    physicalTransform: geometry.physicalTransform,
    pointerOwned: motion.pointerOwned.value,
    position: motion.position.value,
    reducedMotion: motion.reducedMotion.value,
    ...(motion.targetId.value ? { targetId: motion.targetId.value } : {}),
    trackExtent: motion.primarySurfaceExtent.value,
    velocity: motion.velocity.value,
    viewportSize: motion.primarySurfaceExtent.value,
    visiblePrimaryExtent: geometry.visiblePrimaryExtent,
    visualViewportPrimaryExtent: motion.primarySurfaceExtent.value,
  };
});

watch(side, () => {
  if (!snapPoints.value.some((point) => point.id === activeId.value)) {
    activeId.value = horizontal.value ? "open" : "comfortable";
  }
});

function openSheet() {
  activeId.value = horizontal.value ? "open" : "comfortable";
  sheetOpen.value = true;
}

function snapTo(id: SheetOpenSnapId) {
  sheet.value?.requestSnap(id, "picker");
}
</script>

<template>
  <div class="sheet-demo">
    <section class="sheet-launch">
      <div>
        <p>Multi-edge modal</p>
        <h3>One canonical closing coordinate, four physical sides</h3>
        <span>
          Change sides while open, drag only the inner handle, interrupt a settle, or select a
          semantic visible extent.
        </span>
      </div>
      <button
        ref="opener"
        class="open-button"
        data-testid="open-sheet"
        type="button"
        @click="openSheet"
      >
        Open {{ side }} sheet
      </button>
    </section>

    <div class="sheet-fixture-controls" aria-label="Sheet fixture">
      <label>
        <span>Physical side</span>
        <select v-model="side" data-testid="sheet-side-select">
          <option value="top">Top</option>
          <option value="right">Right</option>
          <option value="bottom">Bottom</option>
          <option value="left">Left</option>
        </select>
      </label>
      <label>
        <span>Content</span>
        <select v-model="contentMode" data-testid="sheet-content-mode">
          <option value="tall">Tall scroll</option>
          <option value="short">Short</option>
          <option value="prose">Centered prose</option>
        </select>
      </label>
      <label>
        <span>Snap policy</span>
        <select v-model="snapMode" data-testid="sheet-snap-mode">
          <option value="default">Axis default</option>
          <option value="custom">Custom visible extent</option>
        </select>
      </label>
    </div>

    <div class="side-reference" aria-label="Sheet side mapping">
      <div><strong>Bottom</strong><span>Y · + · top handle</span></div>
      <div><strong>Top</strong><span>Y · − · bottom handle</span></div>
      <div><strong>Right</strong><span>X · + · left handle</span></div>
      <div><strong>Left</strong><span>X · − · right handle</span></div>
    </div>

    <DiagnosticsPanel :diagnostics="diagnostics" />

    <Sheet
      ref="sheet"
      v-model:active-id="activeId"
      v-model:open="sheetOpen"
      close-label="Close sheet"
      data-testid="sheet"
      :elasticity="elasticity"
      :focus-return="focusReturn"
      initial-focus="close"
      :programmatic-impulse="settings.programmaticImpulse"
      :reduced-motion-override="reducedMotionOverride"
      :release-policy="releasePolicy"
      :side="side"
      :snap-points="snapPoints"
      :spring="spring"
      :style="dialogStyle"
    >
      <template #title>
        <div class="sheet-title">
          <p>{{ horizontal ? "Fixed-width surface" : "Full-bleed surface" }}</p>
          <h2>Motion tuning notes</h2>
        </div>
      </template>

      <template #close>
        <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20">
          <path d="M5 5l14 14M19 5 5 19" fill="none" stroke="currentColor" stroke-width="2" />
        </svg>
      </template>

      <template v-if="snapMode === 'custom'" #picker>
        <div class="custom-picker">
          <p>Custom slot · visible extent</p>
          <fieldset class="snap-actions">
            <legend class="sr-only">Sheet position</legend>
            <label v-for="point in snapPoints" :key="point.id">
              <input
                :checked="activeId === point.id"
                :data-testid="`snap-${point.id}`"
                name="sheet-lab-snap"
                type="radio"
                :value="point.id"
                @change="snapTo(point.id)"
              />
              <span>{{ point.label }}</span>
            </label>
          </fieldset>
        </div>
      </template>

      <div class="sheet-content">
        <p class="sheet-lede">
          The handle owns primary-axis drag. This body remains a native vertical scrollport, while
          the surface and editorial measure stay independent.
        </p>
        <template v-if="contentMode === 'prose'">
          <p v-for="index in 5" :key="index">
            Full-bleed material can reach both viewport edges while this prose, the title, and the
            snap controls share one consumer-defined centered measure.
          </p>
        </template>
        <template v-else-if="contentMode === 'tall'">
          <button
            class="add-note"
            data-testid="add-sheet-note"
            type="button"
            @click="noteCount += 1"
          >
            Add note
          </button>
          <section
            v-for="index in noteCount"
            :key="index"
            class="note-row"
            :data-testid="index === noteCount ? 'final-note-row' : undefined"
          >
            <span class="tabular">{{ String(index).padStart(2, "0") }}</span>
            <div>
              <h3>
                {{
                  ["Release projection", "Edge elasticity", "Semantic resize", "Focus restoration"][
                    index % 4
                  ]
                }}
              </h3>
              <p>Native body scrolling remains independent while the inner handle owns dragging.</p>
            </div>
          </section>
        </template>
        <p v-else>Short content proves that the surface does not invent a phantom scroll range.</p>
      </div>
    </Sheet>
  </div>
</template>

<style scoped>
.sheet-demo {
  display: grid;
  gap: 1.5rem;
}
.sheet-launch {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 2rem;
  padding-block: clamp(1.5rem, 4vw, 3.5rem);
  border-block: 1px solid var(--strong);
}
.sheet-launch :is(p, h3, span) {
  margin: 0;
}
.sheet-launch p,
.sheet-title p,
.custom-picker > p {
  color: var(--muted);
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.sheet-launch h3 {
  font-size: clamp(1.3rem, 2.5vw, 2.4rem);
  line-height: 1.05;
}
.sheet-launch span {
  display: block;
  max-inline-size: 42rem;
  margin-block-start: 0.8rem;
  color: var(--muted);
  font-size: 0.86rem;
}
.open-button {
  min-block-size: 2.8rem;
  padding: 0.7rem 1rem;
  background: var(--ink);
  color: var(--paper);
  font-weight: 700;
}
.sheet-fixture-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  padding-block-end: 0.75rem;
  border-block-end: 1px solid var(--line);
}
.sheet-fixture-controls label {
  display: grid;
  gap: 0.3rem;
  color: var(--muted);
  font-size: 0.7rem;
  font-weight: 700;
}
.sheet-fixture-controls select {
  min-block-size: 2rem;
  border: 1px solid var(--line);
  background: var(--paper);
}
.side-reference {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border-block-end: 1px solid var(--line);
}
.side-reference div {
  display: grid;
  gap: 0.25rem;
  padding: 0 0.8rem 0.8rem;
  border-inline-end: 1px solid var(--line);
  font-size: 0.72rem;
}
.side-reference div:last-child {
  border-inline-end: 0;
}
.side-reference span {
  color: var(--muted);
}
:deep(.snap-motion-sheet-scrim) {
  background: #000;
  touch-action: none;
}
:deep(.snap-motion-sheet-panel) {
  min-inline-size: 0;
  border: 1px solid var(--strong);
  background: var(--paper);
  color: var(--ink);
  outline: none;
}
:deep(.snap-motion-sheet-panel::after),
:deep(.snap-motion-sheet-viewport) {
  background: var(--paper);
}
:deep(.snap-motion-sheet-header) {
  border-block-end: 1px solid var(--strong);
}
:deep(.snap-motion-sheet-handle) {
  background: var(--ink);
}
.sheet-title :is(p, h2) {
  margin: 0;
}
.sheet-title h2 {
  font-size: 1rem;
}
:deep(.snap-motion-sheet-close) {
  display: grid;
  place-items: center;
  padding: 0;
}
.custom-picker {
  border-block-end: 1px solid var(--line);
}
.custom-picker > p {
  padding-block-start: 0.5rem;
  margin: 0;
}
.snap-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 0.45rem 0 0.65rem;
  border: 0;
  margin: 0;
}
.snap-actions label {
  position: relative;
  display: inline-grid;
  min-block-size: 2.75rem;
  place-items: center;
}
.snap-actions input {
  position: absolute;
  inset: 0;
  opacity: 0;
}
.snap-actions span {
  display: grid;
  min-block-size: 2rem;
  padding-inline: 0.65rem;
  place-items: center;
  border: 1px solid var(--strong);
  font-size: 0.72rem;
}
.snap-actions input:checked + span {
  background: var(--ink);
  color: var(--paper);
}
.snap-actions input:focus-visible + span {
  outline: 2px solid var(--ink);
  outline-offset: 2px;
}
:deep(.snap-motion-sheet-picker) {
  flex-wrap: wrap;
  border-block-end: 1px solid var(--line);
}
.sheet-content {
  padding-block: clamp(1rem, 3vw, 1.5rem);
}
.sheet-lede {
  max-inline-size: 46rem;
  margin: 0 0 1rem;
  font-size: clamp(1rem, 2vw, 1.35rem);
  line-height: 1.35;
}
.add-note {
  min-block-size: 2.5rem;
  padding-inline: 0.8rem;
  margin-block-end: 1rem;
}
.note-row {
  display: grid;
  grid-template-columns: 2.5rem minmax(0, 1fr);
  gap: 1rem;
  padding-block: 1rem;
  border-block-start: 1px solid var(--line);
}
.note-row > span {
  color: var(--muted);
  font-size: 0.72rem;
}
.note-row :is(h3, p) {
  margin: 0;
}
.note-row h3 {
  font-size: 0.9rem;
}
.note-row p {
  max-inline-size: 40rem;
  margin-block-start: 0.35rem;
  color: var(--muted);
  font-size: 0.78rem;
  line-height: 1.5;
}
:global(html:has(.snap-motion-sheet[open])),
:global(html:has(.snap-motion-sheet[open]) body) {
  overflow: hidden;
}
@media (max-width: 42rem) {
  .sheet-launch {
    grid-template-columns: minmax(0, 1fr);
  }
  .side-reference {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
