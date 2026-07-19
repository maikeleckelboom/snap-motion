<script setup lang="ts">
import { useBottomSheetMotion, type BottomSheetOpenSnapId } from "@snap-motion/vue/bottom-sheet";
import {
  captureFocusOpener,
  focusInitial,
  maintainModalTabOrder,
  restoreFocus,
} from "@snap-motion/vue/dialog";
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from "vue";

import DiagnosticsPanel from "@/components/DiagnosticsPanel.vue";
import { springFromSettings } from "@/fixtures/lab-settings";
import type { LabDiagnostics, LabPhysicsSettings } from "@/fixtures/lab-types";

const props = defineProps<{
  reducedMotionOverride: boolean | undefined;
  settings: LabPhysicsSettings;
  stageWidth: number;
}>();

const dialog = ref<HTMLDialogElement>();
const closeButton = ref<HTMLButtonElement>();
const panel = ref<HTMLElement>();
const opener = ref<HTMLButtonElement>();
const sheetBody = ref<HTMLElement>();
const reducedOverride = computed(() => props.reducedMotionOverride);
const liveMessage = ref("");
const titleId = `bottom-sheet-title-${useId()}`;
const snapPickerName = `bottom-sheet-snap-${useId()}`;
let storedOpener: HTMLElement | undefined;
let closingFromMotion = false;
let focusRestoreFrame: number | undefined;

function sheetElasticity(settings: LabPhysicsSettings) {
  return {
    min: {
      resistance: settings.elasticResistance,
      maxDistance: settings.maxElasticDistance,
    },
    max: false as const,
  };
}

function sheetRelease(settings: LabPhysicsSettings) {
  return {
    projectionSeconds: settings.projectionSeconds,
    flingVelocity: settings.flingVelocity,
    maxAnchorSkip: Math.max(1, Math.round(settings.maxAnchorSkip)),
    forwardSign: 1 as const,
  };
}

const motion = useBottomSheetMotion({
  elasticity: sheetElasticity(props.settings),
  onHidden: completeClose,
  onSnap(id) {
    liveMessage.value = `Bottom sheet settled at ${id}`;
  },
  panel,
  programmaticImpulse: props.settings.programmaticImpulse,
  reducedMotionOverride: reducedOverride,
  releasePolicy: sheetRelease(props.settings),
  spring: springFromSettings(props.settings),
});

const dialogStyle = computed(() => ({
  "--sheet-max-inline": `${Math.min(props.stageWidth, 1_120)}px`,
}));
const scrimStyle = computed(() => ({ opacity: motion.scrimOpacity.value }));
const diagnostics = computed<LabDiagnostics>(() => ({
  ...(motion.activeId.value ? { activeId: motion.activeId.value } : {}),
  anchors: motion.snapshot.value.anchors,
  bounds: motion.snapshot.value.bounds,
  isAnimating: motion.isAnimating.value,
  phase: motion.sheetState.value,
  pointerOwned: motion.pointerOwned.value,
  position: motion.position.value,
  reducedMotion: motion.reducedMotion.value,
  ...(motion.targetId.value ? { targetId: motion.targetId.value } : {}),
  trackExtent: motion.viewportHeight.value,
  velocity: motion.velocity.value,
  viewportSize: motion.viewportHeight.value,
}));

async function openSheet() {
  const target = dialog.value;
  if (!target || target.open) {
    return;
  }

  storedOpener = opener.value ?? captureFocusOpener(document);
  document.documentElement.dataset.snapMotionSheetOpen = "true";
  sheetBody.value?.scrollTo(0, 0);
  target.showModal();
  target.scrollTop = 0;
  await nextTick();
  motion.remeasure();
  motion.open();
  focusInitial("close", { close: closeButton.value, container: panel.value });
  target.scrollTop = 0;
}

function requestClose() {
  if (!dialog.value?.open) {
    cleanupModalState();
    return;
  }
  motion.close();
}

function completeClose() {
  closingFromMotion = true;
  if (dialog.value?.open) {
    dialog.value.close();
  } else {
    cleanupModalState();
  }
}

function cleanupModalState() {
  delete document.documentElement.dataset.snapMotionSheetOpen;
  sheetBody.value?.scrollTo(0, 0);
  const openerToRestore = storedOpener;
  storedOpener = undefined;
  focusRestoreFrame = window.requestAnimationFrame(() => {
    focusRestoreFrame = undefined;
    restoreFocus(openerToRestore);
  });
}

function onNativeClose() {
  if (!closingFromMotion) {
    motion.interrupt();
  }
  closingFromMotion = false;
  cleanupModalState();
}

function onCancel(event: Event) {
  event.preventDefault();
  requestClose();
}

function snapTo(id: BottomSheetOpenSnapId) {
  motion.snapTo(id);
}

watch(
  () => props.settings,
  (settings) => {
    motion.configure({
      elasticity: sheetElasticity(settings),
      programmaticImpulse: settings.programmaticImpulse,
      releasePolicy: sheetRelease(settings),
      spring: springFromSettings(settings),
    });
  },
  { deep: true },
);

onBeforeUnmount(() => {
  motion.interrupt();
  if (dialog.value?.open) {
    dialog.value.close();
  }
  if (typeof document !== "undefined") {
    delete document.documentElement.dataset.snapMotionSheetOpen;
  }
  if (focusRestoreFrame !== undefined) {
    window.cancelAnimationFrame(focusRestoreFrame);
    focusRestoreFrame = undefined;
  }
  restoreFocus(storedOpener);
});
</script>

<template>
  <div class="sheet-demo">
    <section class="sheet-launch">
      <div>
        <p>Reference modal</p>
        <h3>One scalar drives sheet and scrim</h3>
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
      <div><strong>Full</strong><span>24 px top gap</span></div>
      <div><strong>Comfortable</strong><span>620 px height cap</span></div>
      <div><strong>Compact</strong><span>360 px height cap</span></div>
      <div><strong>Hidden</strong><span>Viewport + 160 px</span></div>
    </div>

    <DiagnosticsPanel :diagnostics="diagnostics" />

    <dialog
      ref="dialog"
      :aria-labelledby="titleId"
      class="sheet-dialog"
      data-testid="bottom-sheet"
      :data-sheet-snap="motion.activeSnapId.value"
      :data-sheet-state="motion.sheetState.value"
      :style="dialogStyle"
      @cancel="onCancel"
      @close="onNativeClose"
      @keydown="maintainModalTabOrder($event, dialog)"
    >
      <div
        aria-hidden="true"
        class="sheet-scrim"
        data-testid="sheet-scrim"
        :style="scrimStyle"
        @click="requestClose"
      />

      <section
        ref="panel"
        class="sheet-panel"
        data-testid="sheet-panel"
        :data-pointer-owned="motion.pointerOwned.value"
        :data-sheet-state="motion.sheetState.value"
        :style="motion.panelStyle.value"
        tabindex="-1"
      >
        <header class="sheet-header">
          <div
            class="sheet-drag-region"
            data-testid="sheet-handle"
            :style="motion.surfaceStyle"
            @pointerdown="motion.onPointerDown"
          >
            <span class="sheet-handle" aria-hidden="true" />
            <div>
              <p>Viewport-defined sheet</p>
              <h2 :id="titleId">Motion tuning notes</h2>
            </div>
          </div>
          <button
            ref="closeButton"
            aria-label="Close bottom sheet"
            class="close-button"
            data-testid="close-sheet"
            type="button"
            @click="requestClose"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20">
              <path d="M5 5l14 14M19 5 5 19" fill="none" stroke="currentColor" stroke-width="2" />
            </svg>
          </button>
        </header>

        <fieldset class="snap-actions">
          <legend class="sr-only">Sheet height</legend>
          <label>
            <input
              data-testid="snap-full"
              :name="snapPickerName"
              type="radio"
              value="full"
              :checked="motion.activeSnapId.value === 'full'"
              @change="snapTo('full')"
            />
            <span>Full</span>
          </label>
          <label>
            <input
              data-testid="snap-comfortable"
              :name="snapPickerName"
              type="radio"
              value="comfortable"
              :checked="motion.activeSnapId.value === 'comfortable'"
              @change="snapTo('comfortable')"
            />
            <span>Comfortable</span>
          </label>
          <label>
            <input
              data-testid="snap-compact"
              :name="snapPickerName"
              type="radio"
              value="compact"
              :checked="motion.activeSnapId.value === 'compact'"
              @change="snapTo('compact')"
            />
            <span>Compact</span>
          </label>
        </fieldset>

        <div ref="sheetBody" class="sheet-body" data-testid="sheet-body" tabindex="0">
          <p class="sheet-lede">
            The handle owns vertical drag. This body owns its scroll. Settling always uses the same
            physical spring and carries release velocity into Motion.
          </p>
          <section v-for="index in 8" :key="index" class="note-row">
            <span class="tabular">{{ String(index).padStart(2, "0") }}</span>
            <div>
              <h3>
                {{
                  ["Release projection", "Top elasticity", "Semantic resize", "Focus restoration"][
                    index % 4
                  ]
                }}
              </h3>
              <p>
                This deliberately tall content proves that normal body scrolling remains usable
                while the dedicated header region owns sheet dragging.
              </p>
            </div>
          </section>
        </div>
      </section>
      <p class="sr-only" aria-atomic="true" role="status">{{ liveMessage }}</p>
    </dialog>
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

.sheet-dialog {
  position: fixed;
  inset: 0;
  inline-size: 100%;
  max-inline-size: none;
  block-size: 100%;
  max-block-size: none;
  padding: 0;
  border: 0;
  margin: 0;
  background: transparent;
  color: var(--ink);
  overflow: clip;
  pointer-events: none;
}

.sheet-dialog::backdrop {
  background: transparent;
}

.sheet-scrim {
  position: absolute;
  inset: 0;
  inline-size: 100%;
  block-size: 100%;
  padding: 0;
  border: 0;
  background: #000;
  pointer-events: auto;
  touch-action: none;
  will-change: opacity;
}

.sheet-panel {
  position: absolute;
  inset-inline: max(0px, calc((100vw - var(--sheet-max-inline)) / 2));
  inset-block-start: 24px;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  min-inline-size: 0;
  block-size: calc(100dvh - 24px);
  border: 1px solid var(--strong);
  border-block-end: 0;
  background: var(--paper);
  outline: none;
  overflow: visible;
  pointer-events: auto;
}

.sheet-panel::after {
  position: absolute;
  inset-block-start: 100%;
  inset-inline: -1px;
  block-size: 100dvh;
  border-inline: 1px solid var(--strong);
  background: var(--paper);
  content: "";
  pointer-events: none;
}

.sheet-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  border-block-end: 1px solid var(--strong);
}

.sheet-drag-region {
  display: grid;
  min-inline-size: 0;
  gap: 0.65rem;
  padding: 0.65rem clamp(1rem, 3vw, 1.5rem) 0.9rem;
  cursor: grab;
  user-select: none;
}

.sheet-panel[data-sheet-state="dragging"] .sheet-drag-region {
  cursor: grabbing;
}

.sheet-handle {
  justify-self: center;
  inline-size: 3rem;
  block-size: 0.28rem;
  background: var(--ink);
}

.sheet-drag-region p,
.sheet-drag-region h2 {
  margin: 0;
}

.sheet-drag-region p {
  margin-block-end: 0.2rem;
  color: var(--muted);
  font-size: 0.67rem;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}

.sheet-drag-region h2 {
  font-size: 1rem;
}

.close-button {
  display: grid;
  place-items: center;
  inline-size: 2.75rem;
  block-size: 2.75rem;
  padding: 0;
  margin: 0.75rem clamp(1rem, 3vw, 1.5rem) 0 0;
}

.snap-actions {
  display: flex;
  gap: 0.5rem;
  padding: 0.65rem clamp(1rem, 3vw, 1.5rem);
  border-block-end: 1px solid var(--line);
  border-inline: 0;
  border-block-start: 0;
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
  min-block-size: 2.75rem;
  place-items: center;
  min-block-size: 2rem;
  padding-inline: 0.65rem;
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

.sheet-body {
  min-block-size: 0;
  padding: clamp(1rem, 3vw, 1.5rem) clamp(1rem, 3vw, 1.5rem)
    calc(2rem + env(safe-area-inset-bottom));
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}

.sheet-lede {
  max-inline-size: 46rem;
  margin: 0 0 2rem;
  font-size: clamp(1rem, 2vw, 1.35rem);
  line-height: 1.35;
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

:global(html[data-snap-motion-sheet-open="true"]),
:global(html[data-snap-motion-sheet-open="true"] body) {
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

  .sheet-panel {
    inset-inline: 0;
  }
}
</style>
