<script setup lang="ts">
import { createFixedStageGeometry } from "@snap-motion/core";
import {
  captureFocusOpener,
  focusInitial,
  maintainModalTabOrder,
  restoreFocus,
  useCarouselMotion,
} from "@snap-motion/vue";
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from "vue";

import DiagnosticsPanel from "@/components/DiagnosticsPanel.vue";
import {
  carouselReleaseFromSettings,
  springFromSettings,
  symmetricElasticityFromSettings,
} from "@/fixtures/lab-settings";
import type { LabDiagnostics, LabPhysicsSettings } from "@/fixtures/lab-types";
import { mediaFixtures } from "@/fixtures/media";

const props = defineProps<{
  reducedMotionOverride: boolean | undefined;
  settings: LabPhysicsSettings;
  stageWidth: number;
}>();

const dialog = ref<HTMLDialogElement>();
const closeButton = ref<HTMLButtonElement>();
const previousFocused = ref(false);
const nextFocused = ref(false);
const opener = ref<HTMLButtonElement>();
const viewport = ref<HTMLElement>();
const track = ref<HTMLElement>();
const delayedReady = ref(false);
const fixtureMode = ref<"all" | "one">("all");
const directionMode = ref<"ltr" | "rtl">("ltr");
const liveMessage = ref("");
const titleId = `media-lightbox-title-${useId()}`;
const isOpen = ref(false);
const reducedOverride = computed(() => props.reducedMotionOverride);
const direction = computed(() => directionMode.value);
let storedOpener: HTMLElement | undefined;
let decodeTimer: ReturnType<typeof setTimeout> | undefined;
let focusRestoreFrame: number | undefined;

const visibleFixtures = computed(() =>
  fixtureMode.value === "one" ? mediaFixtures.slice(0, 1) : mediaFixtures,
);
const fixtureIds = computed(() => visibleFixtures.value.map((fixture) => fixture.id));
const initialGeometry = createFixedStageGeometry({
  viewportSize: Math.max(1, props.stageWidth),
  itemIds: fixtureIds.value,
});

function measureGeometry() {
  return createFixedStageGeometry({
    viewportSize: Math.max(1, viewport.value?.clientWidth ?? props.stageWidth),
    itemIds: fixtureIds.value,
  });
}

const motion = useCarouselMotion({
  anchors: initialGeometry.anchors,
  bounds: initialGeometry.bounds,
  direction,
  elasticity: symmetricElasticityFromSettings(props.settings),
  initialTargetId: fixtureIds.value[0]!,
  measure: measureGeometry,
  programmaticImpulse: props.settings.programmaticImpulse,
  reducedMotionOverride: reducedOverride,
  releasePolicy: carouselReleaseFromSettings(props.settings),
  spring: springFromSettings(props.settings),
  track,
  viewport,
});

const semanticId = computed(
  () => motion.targetId.value ?? motion.activeId.value ?? fixtureIds.value[0],
);
const activeIndex = computed(() => {
  const index = fixtureIds.value.indexOf(semanticId.value ?? "");
  return index < 0 ? 0 : index;
});
const activeFixture = computed(
  () => visibleFixtures.value[activeIndex.value] ?? visibleFixtures.value[0],
);
const stageStyle = computed(() => ({
  "--lab-stage-width": `${props.stageWidth}px`,
}));
const diagnostics = computed<LabDiagnostics>(() => {
  const geometry = measureGeometry();
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
    trackExtent: geometry.trackExtent,
    velocity: motion.velocity.value,
    viewportSize: geometry.viewportSize,
  };
});

function announceCurrent() {
  const fixture = activeFixture.value;
  if (fixture) {
    liveMessage.value = `${fixture.title}, ${activeIndex.value + 1} of ${visibleFixtures.value.length}`;
  }
}

function previous() {
  motion.previous();
}

function next() {
  motion.next();
}

function onViewportKeyDown(event: KeyboardEvent) {
  motion.onKeyDown(event);
}

function onDialogKeyDown(event: KeyboardEvent) {
  maintainModalTabOrder(event, dialog.value);
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") motion.onKeyDown(event);
}

async function openLightbox() {
  const target = dialog.value;
  if (!target || target.open) {
    return;
  }

  storedOpener = opener.value ?? captureFocusOpener(document);
  target.showModal();
  isOpen.value = true;
  delayedReady.value = false;
  decodeTimer = setTimeout(() => {
    delayedReady.value = true;
    void nextTick(motion.remeasure);
  }, 450);

  await nextTick();
  motion.remeasure();
  focusInitial("close", { close: closeButton.value, container: target });
  announceCurrent();
}

function closeLightbox() {
  motion.interrupt();
  if (dialog.value?.open) {
    dialog.value.close();
  }
}

function onCancel(event: Event) {
  event.preventDefault();
  closeLightbox();
}

function onDialogClose() {
  isOpen.value = false;
  if (decodeTimer !== undefined) {
    clearTimeout(decodeTimer);
    decodeTimer = undefined;
  }
  const openerToRestore = storedOpener;
  storedOpener = undefined;
  focusRestoreFrame = window.requestAnimationFrame(() => {
    focusRestoreFrame = undefined;
    restoreFocus(openerToRestore);
  });
}

function onDialogSurfaceClick(event: MouseEvent) {
  if (event.target === dialog.value) {
    closeLightbox();
  }
}

watch(fixtureMode, async () => {
  await nextTick();
  motion.remeasure();
  announceCurrent();
});

watch([motion.activeId, motion.phase], ([activeId, phase], [previousId]) => {
  if (phase === "idle" && activeId !== undefined && activeId !== previousId) {
    announceCurrent();
  }
});

onBeforeUnmount(() => {
  if (decodeTimer !== undefined) {
    clearTimeout(decodeTimer);
  }
  if (dialog.value?.open) {
    dialog.value.close();
  }
  if (focusRestoreFrame !== undefined) {
    window.cancelAnimationFrame(focusRestoreFrame);
    focusRestoreFrame = undefined;
  }
  restoreFocus(storedOpener);
});
</script>

<template>
  <div class="media-demo">
    <section class="media-launch">
      <div>
        <p class="fixture-label">Reference modal</p>
        <h3>Contain media without surrendering stage geometry</h3>
        <p>
          The five fixtures include extreme intrinsic ratios, a transformed child, and a delayed
          source. Every one remains exactly one semantic stage.
        </p>
      </div>
      <button
        ref="opener"
        class="open-button"
        data-testid="open-lightbox"
        type="button"
        @click="openLightbox"
      >
        Open lightbox
      </button>
    </section>

    <label class="fixture-mode">
      <span>Fixture set</span>
      <select v-model="fixtureMode" data-testid="media-fixture-mode">
        <option value="all">All five media cases</option>
        <option value="one">One-item boundary</option>
      </select>
    </label>

    <label class="fixture-mode">
      <span>Direction</span>
      <select v-model="directionMode" data-testid="media-direction-mode">
        <option value="ltr">LTR</option>
        <option value="rtl">RTL</option>
      </select>
    </label>

    <div class="fixture-index" aria-label="Included media fixtures">
      <span v-for="(fixture, index) in visibleFixtures" :key="fixture.id">
        <strong class="tabular">{{ String(index + 1).padStart(2, "0") }}</strong>
        {{ fixture.title }}
      </span>
    </div>

    <DiagnosticsPanel :diagnostics="diagnostics" />

    <dialog
      ref="dialog"
      :aria-labelledby="titleId"
      class="lightbox-dialog"
      :dir="directionMode"
      data-testid="media-lightbox"
      :data-open-state="isOpen ? 'open' : 'closed'"
      @cancel="onCancel"
      @close="onDialogClose"
      @click="onDialogSurfaceClick"
      @keydown="onDialogKeyDown"
    >
      <div class="lightbox-shell" :style="stageStyle">
        <header class="lightbox-header">
          <div>
            <p>Media inspection</p>
            <h2 :id="titleId" data-testid="media-title">{{ activeFixture?.title }}</h2>
          </div>
          <p class="media-position tabular" data-testid="media-count">
            {{ activeIndex + 1 }} / {{ visibleFixtures.length }}
          </p>
          <button
            ref="closeButton"
            aria-label="Close media lightbox"
            class="icon-button"
            data-testid="close-lightbox"
            type="button"
            @click="closeLightbox"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20">
              <path
                d="M5 5l14 14M19 5 5 19"
                fill="none"
                stroke="currentColor"
                stroke-linecap="square"
                stroke-width="2"
              />
            </svg>
          </button>
        </header>

        <section
          aria-label="Media"
          aria-roledescription="carousel"
          class="carousel-frame"
          role="group"
        >
          <button
            aria-label="Previous media"
            :aria-disabled="!motion.canPrevious.value"
            class="carousel-control previous-control"
            data-testid="media-previous"
            :disabled="!motion.canPrevious.value && !previousFocused"
            type="button"
            @blur="previousFocused = false"
            @click="motion.canPrevious.value && previous()"
            @focus="previousFocused = true"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22">
              <path
                d="m15 5-7 7 7 7"
                fill="none"
                stroke="currentColor"
                stroke-linecap="square"
                stroke-linejoin="miter"
                stroke-width="2"
              />
            </svg>
          </button>

          <section
            ref="viewport"
            aria-describedby="media-keyboard-help"
            class="carousel-viewport"
            data-testid="media-carousel"
            :data-active-id="semanticId"
            :data-phase="motion.phase.value"
            :style="motion.surfaceStyle"
            tabindex="0"
            @keydown="onViewportKeyDown"
            @pointerdown="motion.onPointerDown"
            @wheel="motion.onWheel"
          >
            <div ref="track" class="media-track" dir="ltr" :style="motion.trackStyle.value">
              <div
                v-for="(fixture, index) in visibleFixtures"
                :key="fixture.id"
                :aria-label="`${fixture.title}, ${index + 1} of ${visibleFixtures.length}`"
                aria-roledescription="slide"
                class="media-slide"
                :data-slide-id="fixture.id"
                :data-fixture="fixture.mode"
                :dir="directionMode"
                :inert="semanticId !== fixture.id"
                role="group"
              >
                <div class="media-frame">
                  <div
                    :class="['media-layer', { 'is-transformed': fixture.mode === 'transformed' }]"
                  >
                    <img
                      v-if="fixture.mode !== 'delayed' || delayedReady"
                      :alt="fixture.description"
                      class="media-image"
                      draggable="false"
                      :src="fixture.src"
                      @dragstart="motion.onNativeDragStart"
                      @load="motion.remeasure"
                    />
                    <div
                      v-else
                      class="decode-placeholder"
                      aria-label="Waiting for delayed media decode"
                    >
                      <span>Waiting for source</span>
                    </div>
                  </div>
                  <button
                    class="slide-action"
                    :data-testid="`slide-action-${fixture.id}`"
                    type="button"
                  >
                    Inspect details
                  </button>
                </div>
              </div>
            </div>
          </section>

          <button
            aria-label="Next media"
            :aria-disabled="!motion.canNext.value"
            class="carousel-control next-control"
            data-testid="media-next"
            :disabled="!motion.canNext.value && !nextFocused"
            type="button"
            @blur="nextFocused = false"
            @click="motion.canNext.value && next()"
            @focus="nextFocused = true"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22">
              <path
                d="m9 5 7 7-7 7"
                fill="none"
                stroke="currentColor"
                stroke-linecap="square"
                stroke-linejoin="miter"
                stroke-width="2"
              />
            </svg>
          </button>
          <p id="media-keyboard-help" class="sr-only">
            Use Left and Right Arrow to move between items. Use Home and End to jump.
          </p>
          <p class="sr-only" aria-atomic="true" role="status">{{ liveMessage }}</p>
        </section>

        <footer class="lightbox-footer">
          <p>{{ activeFixture?.description }}</p>
          <div aria-label="Keyboard ownership probes" class="ownership-probes" role="group">
            <button data-testid="caption-action" type="button">Caption details</button>
            <label>
              Note
              <input aria-label="Caption note" data-testid="caption-input" type="text" />
            </label>
            <label>
              <input data-testid="caption-radio" name="caption-mode" type="radio" value="pinned" />
              Pin
            </label>
            <video aria-label="Media controls" controls data-testid="media-controls" muted />
            <button data-testid="ownership-end" type="button">Done</button>
          </div>
          <p class="tabular">x {{ motion.position.value.toFixed(2) }} px</p>
        </footer>
      </div>
    </dialog>
  </div>
</template>

<style scoped>
.media-demo {
  display: grid;
  gap: 1.5rem;
}

.media-launch {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 2rem;
  padding-block: clamp(1.5rem, 4vw, 3.5rem);
  border-block: 1px solid var(--strong);
}

.fixture-label,
.lightbox-header p {
  margin: 0 0 0.35rem;
  color: var(--muted);
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.media-launch h3 {
  max-inline-size: 38rem;
  margin: 0;
  font-size: clamp(1.3rem, 2.5vw, 2.4rem);
  line-height: 1.05;
}

.media-launch p:last-child {
  max-inline-size: 42rem;
  margin: 0.8rem 0 0;
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

.fixture-index {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  border-block-end: 1px solid var(--line);
}

.fixture-mode {
  display: grid;
  grid-template-columns: auto minmax(12rem, 18rem);
  align-items: center;
  justify-content: end;
  gap: 0.75rem;
  color: var(--muted);
  font-size: 0.72rem;
}

.fixture-mode select {
  min-block-size: 2.1rem;
  border: 1px solid var(--line);
  border-radius: 0;
  background: var(--paper);
}

.fixture-index span {
  display: grid;
  gap: 0.25rem;
  min-inline-size: 0;
  padding: 0 0.8rem 0.8rem;
  border-inline-end: 1px solid var(--line);
  color: var(--muted);
  font-size: 0.7rem;
}

.fixture-index span:first-child {
  padding-inline-start: 0;
}

.fixture-index span:last-child {
  border-inline-end: 0;
}

.fixture-index strong {
  color: var(--ink);
  font-size: 0.78rem;
}

.lightbox-dialog {
  inline-size: 100vw;
  max-inline-size: none;
  block-size: 100dvh;
  max-block-size: none;
  padding: 0;
  border: 0;
  margin: 0;
  background: #090909;
  color: #fff;
  overflow: auto;
}

.lightbox-dialog::backdrop {
  background: rgb(0 0 0 / 0.78);
}

.lightbox-shell {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  min-block-size: 100dvh;
}

.lightbox-header,
.lightbox-footer {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 1rem;
  padding: 0.8rem clamp(0.8rem, 2vw, 1.5rem);
  border-block-end: 1px solid #444;
}

.lightbox-header h2 {
  margin: 0;
  font-size: 1rem;
}

.lightbox-header p {
  color: #aaa;
}

.media-position {
  margin: 0;
  color: #bbb;
  font-size: 0.78rem;
}

.icon-button,
.carousel-control {
  display: grid;
  place-items: center;
  inline-size: 2.7rem;
  block-size: 2.7rem;
  padding: 0;
  border-color: #666;
  background: #111;
  color: #fff;
}

.carousel-frame {
  position: relative;
  display: grid;
  place-items: center;
  min-block-size: 25rem;
  padding: clamp(0.75rem, 2vw, 1.5rem) clamp(3.75rem, 7vw, 6rem);
  overflow: hidden;
}

.carousel-viewport {
  position: relative;
  inline-size: min(var(--lab-stage-width), calc(100vw - clamp(7.5rem, 14vw, 12rem)));
  min-inline-size: 0;
  max-inline-size: 100%;
  aspect-ratio: 16 / 10;
  border: 1px solid #555;
  background: #181818;
  overflow: hidden;
  cursor: grab;
}

.carousel-viewport[data-phase="dragging"] {
  cursor: grabbing;
}

.media-track {
  display: flex;
  block-size: 100%;
  transform: translate3d(0, 0, 0);
}

.media-slide {
  display: grid;
  place-items: stretch;
  flex: 0 0 100%;
  inline-size: 100%;
  min-inline-size: 0;
  block-size: 100%;
  overflow: clip;
}

.media-frame,
.media-layer {
  position: relative;
  display: grid;
  place-items: center;
  min-inline-size: 0;
  min-block-size: 0;
  inline-size: 100%;
  block-size: 100%;
  overflow: clip;
}

.slide-action {
  position: absolute;
  z-index: 1;
  inset-block-end: 0.75rem;
  inset-inline-start: 0.75rem;
  min-block-size: 2.25rem;
}

.media-layer {
  position: relative;
  transform-origin: center;
}

.media-layer.is-transformed {
  transform: scale(1.16) rotate(-1.5deg);
}

.media-image {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
  user-select: none;
  -webkit-user-drag: none;
}

.decode-placeholder {
  display: grid;
  place-items: center;
  inline-size: 100%;
  block-size: 100%;
  border: 1px dashed #777;
  color: #aaa;
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.carousel-control {
  position: absolute;
  z-index: 2;
  inset-block-start: 50%;
  transform: translateY(-50%);
}

.carousel-control:disabled {
  color: #555;
  border-color: #333;
  background: #0b0b0b;
}

.previous-control {
  inset-inline-start: clamp(0.75rem, 2vw, 1.5rem);
}

.next-control {
  inset-inline-end: clamp(0.75rem, 2vw, 1.5rem);
}

.lightbox-footer {
  grid-template-columns: minmax(12rem, 1fr) auto auto;
  border-block: 1px solid #444;
}

.ownership-probes {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.ownership-probes label {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.ownership-probes input[type="text"] {
  inline-size: 7rem;
}

.ownership-probes video {
  inline-size: 7rem;
  block-size: 2.25rem;
}

.lightbox-footer p {
  margin: 0;
  color: #bbb;
  font-size: 0.75rem;
}

@media (max-width: 42rem) {
  .media-launch {
    grid-template-columns: minmax(0, 1fr);
  }

  .fixture-index {
    grid-template-columns: 1fr;
  }

  .fixture-index span {
    grid-template-columns: 2.5rem 1fr;
    padding: 0.5rem 0;
    border-inline-end: 0;
    border-block-end: 1px solid var(--line);
  }

  .carousel-frame {
    padding-inline: 3.5rem;
  }

  .carousel-viewport {
    inline-size: calc(100vw - 7rem);
    aspect-ratio: 3 / 4;
  }

  .lightbox-footer {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .ownership-probes {
    grid-column: 1 / -1;
    flex-wrap: wrap;
  }
}

@media (forced-colors: active) {
  .lightbox-dialog,
  .icon-button,
  .carousel-control {
    background: Canvas;
    color: CanvasText;
  }

  .lightbox-header p,
  .media-position,
  .lightbox-footer p {
    color: CanvasText;
  }
}
</style>
