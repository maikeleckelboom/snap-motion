<script setup lang="ts">
import {
  BottomSheet,
  BottomSheetSnapPicker,
  bottomSheetSnapPosition,
  createViewportBottomSheetSnapPoints,
  type BottomSheetOpenSnapId,
  type BottomSheetSnapPoint,
  type NavigationReason,
  type UseBottomSheetMotionReturn,
} from "@snap-motion/vue/bottom-sheet";
import { computed, ref } from "vue";

import DiagnosticsPanel from "@/components/DiagnosticsPanel.vue";
import { springFromSettings } from "@/fixtures/lab-settings";
import type { LabDiagnostics, LabPhysicsSettings } from "@/fixtures/lab-types";

type ContentMode = "short" | "tall";
type PickerMode = "custom" | "hidden" | "standard";
type SnapMode = "custom-top" | "default";

interface BottomSheetInstance {
  motion: UseBottomSheetMotionReturn<BottomSheetOpenSnapId>;
  requestSnap: (id: BottomSheetOpenSnapId, reason: NavigationReason) => void;
}

const props = defineProps<{
  reducedMotionOverride: boolean | undefined;
  settings: LabPhysicsSettings;
  stageWidth: number;
}>();

const sheet = ref<BottomSheetInstance>();
const opener = ref<HTMLButtonElement>();
const sheetOpen = ref(false);
const activeId = ref<BottomSheetOpenSnapId>("comfortable");
const contentMode = ref<ContentMode>("tall");
const pickerMode = ref<PickerMode>("custom");
const snapMode = ref<SnapMode>("default");
const noteCount = ref(8);

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
  "--sheet-max-inline": `${Math.min(props.stageWidth, 1_120)}px`,
}));
const snapPoints = computed<readonly BottomSheetSnapPoint<BottomSheetOpenSnapId>[]>(() => {
  const points = createViewportBottomSheetSnapPoints();
  if (snapMode.value === "default") return points;
  return points.map((point) =>
    point.id === "full" ? { ...point, resolve: bottomSheetSnapPosition.pixels(80) } : point,
  );
});
const sheetKey = computed(() => snapMode.value);
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
    bodyClientHeight: geometry.bodyClientHeight,
    bodyScrollHeight: geometry.bodyScrollHeight,
    bodyScrollTop: geometry.bodyScrollTop,
    bounds: motion.snapshot.value.bounds,
    chromeHeight: geometry.measuredChromeHeight,
    intrinsicSheetHeight: motion.panelIntrinsicSize.value,
    isAnimating: motion.isAnimating.value,
    maximumScrollTop: geometry.maximumBodyScrollTop,
    phase: motion.sheetState.value,
    physicalSheetY: geometry.physicalSheetY,
    pointerOwned: motion.pointerOwned.value,
    position: motion.position.value,
    reducedMotion: motion.reducedMotion.value,
    ...(motion.targetId.value ? { targetId: motion.targetId.value } : {}),
    trackExtent: motion.viewportHeight.value,
    velocity: motion.velocity.value,
    viewportSize: motion.viewportHeight.value,
    visibleSheetHeight: geometry.visibleSheetHeight,
    visualViewportHeight: geometry.visualViewportHeight,
  };
});

function openSheet() {
  activeId.value = "comfortable";
  sheetOpen.value = true;
}

function snapTo(id: BottomSheetOpenSnapId) {
  sheet.value?.requestSnap(id, "picker");
}

function addNote() {
  noteCount.value += 1;
}
</script>

<template>
  <div class="sheet-demo">
    <section class="sheet-launch">
      <div>
        <p>Reference modal</p>
        <h3>One physical coordinate drives sheet and scrollport</h3>
        <span>
          Open at comfortable, drag the dedicated handle, interrupt a settle, or choose a semantic
          snap directly.
        </span>
      </div>
      <button
        ref="opener"
        class="open-button"
        data-testid="open-sheet"
        type="button"
        @click="openSheet"
      >
        Open bottom sheet
      </button>
    </section>

    <div class="snap-reference" aria-label="Bottom sheet snap points">
      <div><strong>Full</strong><span>Configured top gap</span></div>
      <div><strong>Comfortable</strong><span>620 px visible cap</span></div>
      <div><strong>Compact</strong><span>360 px visible cap</span></div>
      <div><strong>Hidden</strong><span>Viewport + 160 px</span></div>
    </div>

    <div class="sheet-fixture-controls" aria-label="Bottom sheet fixture">
      <label>
        <span>Picker</span>
        <select v-model="pickerMode" data-testid="sheet-picker-mode">
          <option value="custom">Custom</option>
          <option value="standard">Standard</option>
          <option value="hidden">Hidden</option>
        </select>
      </label>
      <label>
        <span>Content</span>
        <select v-model="contentMode" data-testid="sheet-content-mode">
          <option value="tall">Tall</option>
          <option value="short">Short</option>
        </select>
      </label>
      <label>
        <span>Snap policy</span>
        <select v-model="snapMode" data-testid="sheet-snap-mode">
          <option value="default">Default</option>
          <option value="custom-top">80 px top</option>
        </select>
      </label>
    </div>

    <DiagnosticsPanel :diagnostics="diagnostics" />

    <BottomSheet
      :key="sheetKey"
      ref="sheet"
      :active-id="activeId"
      close-label="Close bottom sheet"
      data-testid="bottom-sheet"
      :elasticity="elasticity"
      :focus-return="focusReturn"
      initial-focus="close"
      :open="sheetOpen"
      :programmatic-impulse="settings.programmaticImpulse"
      :reduced-motion-override="reducedMotionOverride"
      :release-policy="releasePolicy"
      :show-snap-picker="pickerMode !== 'hidden'"
      :snap-points="snapPoints"
      :spring="spring"
      :style="dialogStyle"
      @update:active-id="activeId = $event"
      @update:open="sheetOpen = $event"
    >
      <template #title>
        <div class="sheet-title">
          <p>Viewport-defined sheet</p>
          <h2>Motion tuning notes</h2>
        </div>
      </template>

      <template #close>
        <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20">
          <path d="M5 5l14 14M19 5 5 19" fill="none" stroke="currentColor" stroke-width="2" />
        </svg>
      </template>

      <template #picker>
        <BottomSheetSnapPicker v-if="pickerMode === 'standard'" />
        <div v-else class="custom-picker">
          <p>Custom slot · measured chrome</p>
          <fieldset class="snap-actions">
            <legend class="sr-only">Sheet height</legend>
            <label v-for="id in ['full', 'comfortable', 'compact'] as const" :key="id">
              <input
                :checked="activeId === id"
                :data-testid="`snap-${id}`"
                name="bottom-sheet-lab-snap"
                type="radio"
                :value="id"
                @change="snapTo(id)"
              />
              <span>{{ id[0]?.toUpperCase() }}{{ id.slice(1) }}</span>
            </label>
          </fieldset>
        </div>
      </template>

      <div class="sheet-content">
        <p class="sheet-lede">
          The handle owns vertical drag. This body owns its native scroll. Its client height is the
          actual visible space below the measured chrome.
        </p>
        <button
          v-if="contentMode === 'tall'"
          class="add-note"
          data-testid="add-sheet-note"
          type="button"
          @click="addNote"
        >
          Add note
        </button>
        <section
          v-for="index in contentMode === 'tall' ? noteCount : 0"
          :key="index"
          class="note-row"
          :data-testid="index === noteCount ? 'final-note-row' : undefined"
        >
          <span class="tabular">{{ String(index).padStart(2, "0") }}</span>
          <div>
            <h3>
              {{
                ["Release projection", "Top elasticity", "Semantic resize", "Focus restoration"][
                  index % 4
                ]
              }}
            </h3>
            <p>Native body scrolling remains independent while the handle owns sheet dragging.</p>
          </div>
        </section>
      </div>
    </BottomSheet>
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

.sheet-launch p,
.sheet-launch h3,
.sheet-launch span {
  margin: 0;
}

.sheet-launch p {
  margin-block-end: 0.35rem;
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

.snap-reference {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border-block-end: 1px solid var(--line);
}

.snap-reference div {
  display: grid;
  gap: 0.25rem;
  padding: 0 0.8rem 0.8rem;
  border-inline-end: 1px solid var(--line);
  font-size: 0.72rem;
}

.snap-reference div:first-child {
  padding-inline-start: 0;
}

.snap-reference div:last-child {
  border-inline-end: 0;
}

.snap-reference span {
  color: var(--muted);
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

:deep(.snap-motion-sheet-scrim) {
  background: #000;
  touch-action: none;
  will-change: opacity;
}

:deep(.snap-motion-sheet-panel) {
  inset-inline: max(0px, calc((100vw - var(--sheet-max-inline)) / 2));
  min-inline-size: 0;
  border: 1px solid var(--strong);
  border-block-end: 0;
  background: var(--paper);
  color: var(--ink);
  outline: none;
}

:deep(.snap-motion-sheet-viewport) {
  background: var(--paper);
}

:deep(.snap-motion-sheet-header) {
  align-items: start;
  border-block-end: 1px solid var(--strong);
}

:deep(.snap-motion-sheet-drag-region) {
  display: grid;
  gap: 0.65rem;
  padding: 0.65rem clamp(1rem, 3vw, 1.5rem) 0.9rem;
}

:deep(.snap-motion-sheet[data-sheet-state="dragging"] .snap-motion-sheet-drag-region) {
  cursor: grabbing;
}

:deep(.snap-motion-sheet-handle) {
  background: var(--ink);
}

.sheet-title p,
.sheet-title h2 {
  margin: 0;
}

.sheet-title p {
  margin-block-end: 0.2rem;
  color: var(--muted);
  font-size: 0.67rem;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
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
  padding: 0.5rem clamp(1rem, 3vw, 1.5rem) 0;
  margin: 0;
  color: var(--muted);
  font-size: 0.67rem;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}

.snap-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 0.45rem clamp(1rem, 3vw, 1.5rem) 0.65rem;
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

:deep(.snap-motion-sheet-body-content) {
  padding: clamp(1rem, 3vw, 1.5rem);
  padding-block-end: env(safe-area-inset-bottom);
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

.note-row h3,
.note-row p {
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

  .snap-reference {
    grid-template-columns: 1fr 1fr;
  }

  .snap-reference div {
    padding: 0.6rem;
    border-block-end: 1px solid var(--line);
  }

  :deep(.snap-motion-sheet-panel) {
    inset-inline: 0;
  }
}
</style>
