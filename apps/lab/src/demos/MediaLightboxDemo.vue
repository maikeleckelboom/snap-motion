<script setup lang="ts">
import { createFixedStageGeometry } from "@snap-motion/core";
import { useCarouselMotion } from "@snap-motion/vue/carousel";
import {
  captureFocusOpener,
  focusInitial,
  maintainModalTabOrder,
  restoreFocus,
} from "@snap-motion/vue/dialog";
import { useTimeoutFn } from "@vueuse/core";
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from "vue";

import DiagnosticsPanel from "@/components/DiagnosticsPanel.vue";
import {
  carouselReleaseFromSettings,
  springFromSettings,
  symmetricElasticityFromSettings,
} from "@/fixtures/lab-settings";
import type { LabDiagnostics, LabPhysicsSettings } from "@/fixtures/lab-types";
import { mediaFixtures, type MediaFixture, type MediaFixtureId } from "@/fixtures/media";

type MediaLoadState = "pending" | "loaded" | "failed";

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
const delayedSourceReady = ref(false);
const mediaLoadGeneration = ref(0);
const mediaLoadStates = ref<Record<MediaFixtureId, MediaLoadState>>(createMediaLoadStates());
const fixtureMode = ref<"all" | "one">("all");
const directionMode = ref<"ltr" | "rtl">("ltr");
const liveMessage = ref("");
const titleId = `media-lightbox-title-${useId()}`;
const isOpen = ref(false);
const reducedOverride = computed(() => props.reducedMotionOverride);
const direction = computed(() => directionMode.value);
let storedOpener: HTMLElement | undefined;
let focusRestoreFrame: number | undefined;

const { start: startDelayedSourceTimer, stop: stopDelayedSourceTimer } = useTimeoutFn(
  () => {
    delayedSourceReady.value = true;
  },
  450,
  { immediate: false },
);

function createMediaLoadStates(): Record<MediaFixtureId, MediaLoadState> {
  return Object.fromEntries(mediaFixtures.map((fixture) => [fixture.id, "pending"])) as Record<
    MediaFixtureId,
    MediaLoadState
  >;
}

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
  const currentId = semanticId.value;
  const index = currentId === undefined ? -1 : fixtureIds.value.indexOf(currentId);
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

function resetMediaLoading() {
  mediaLoadGeneration.value += 1;
  mediaLoadStates.value = createMediaLoadStates();
  delayedSourceReady.value = false;
}

function fixtureLoadState(fixture: MediaFixture): MediaLoadState {
  return mediaLoadStates.value[fixture.id];
}

function fixtureSourceReady(fixture: MediaFixture): boolean {
  return fixture.mode !== "delayed" || delayedSourceReady.value;
}

function setMediaLoadState(fixture: MediaFixture, state: MediaLoadState) {
  mediaLoadStates.value[fixture.id] = state;
}

function isCurrentMediaLoad(image: HTMLImageElement): boolean {
  return isOpen.value && Number(image.dataset.loadGeneration) === mediaLoadGeneration.value;
}

async function onMediaLoad(fixture: MediaFixture, event: Event) {
  const image = event.currentTarget;
  if (!(image instanceof HTMLImageElement)) {
    setMediaLoadState(fixture, "failed");
    return;
  }

  try {
    await image.decode();
  } catch {
    if (isCurrentMediaLoad(image)) {
      setMediaLoadState(fixture, "failed");
    }
    return;
  }

  if (!isCurrentMediaLoad(image)) {
    return;
  }

  if (!image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
    setMediaLoadState(fixture, "failed");
    return;
  }

  setMediaLoadState(fixture, "loaded");
  await nextTick();
  motion.remeasure();
}

function onMediaError(fixture: MediaFixture, event: Event) {
  const image = event.currentTarget;
  if (image instanceof HTMLImageElement && isCurrentMediaLoad(image)) {
    setMediaLoadState(fixture, "failed");
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
  resetMediaLoading();
  target.showModal();
  isOpen.value = true;
  startDelayedSourceTimer();

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
  mediaLoadGeneration.value += 1;
  stopDelayedSourceTimer();
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
  stopDelayedSourceTimer();
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
          <div class="lightbox-title">
            <p class="lightbox-eyebrow">Media inspection</p>
            <h2 :id="titleId" data-testid="media-title">{{ activeFixture?.title }}</h2>
          </div>
          <dl class="header-diagnostics">
            <div>
              <dt>Fixture</dt>
              <dd class="tabular" data-testid="media-count">
                {{ activeIndex + 1 }} / {{ visibleFixtures.length }}
              </dd>
            </div>
            <div>
              <dt>Stage target</dt>
              <dd class="tabular">{{ props.stageWidth }} px</dd>
            </div>
          </dl>
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

        <section class="stage-workspace" aria-label="Media stage workspace">
          <div class="stage-instrument" data-testid="media-stage-instrument">
            <div class="stage-readout">
              <span>Fixed-stage geometry</span>
              <span class="tabular">{{ props.stageWidth }} px target</span>
            </div>
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
                    <div
                      class="media-frame"
                      :data-media-state="fixtureLoadState(fixture)"
                      :data-testid="`media-frame-${fixture.id}`"
                    >
                      <div
                        :class="[
                          'media-layer',
                          {
                            'media-layer--transformed': fixture.mode === 'transformed',
                          },
                        ]"
                      >
                        <img
                          v-if="isOpen && fixtureSourceReady(fixture)"
                          :alt="fixtureLoadState(fixture) === 'loaded' ? fixture.description : ''"
                          :aria-hidden="fixtureLoadState(fixture) !== 'loaded'"
                          class="media-image"
                          :data-load-generation="mediaLoadGeneration"
                          :data-media-state="fixtureLoadState(fixture)"
                          :data-testid="`media-image-${fixture.id}`"
                          decoding="async"
                          draggable="false"
                          :src="fixture.src"
                          @dragstart="motion.onNativeDragStart"
                          @error="onMediaError(fixture, $event)"
                          @load="onMediaLoad(fixture, $event)"
                        />
                        <div
                          v-if="fixtureLoadState(fixture) === 'pending'"
                          class="media-status"
                          :data-testid="`media-pending-${fixture.id}`"
                          role="status"
                        >
                          <span>
                            {{
                              fixture.mode === "delayed" && !delayedSourceReady
                                ? "Waiting for delayed source"
                                : "Decoding media"
                            }}
                          </span>
                        </div>
                        <div
                          v-else-if="fixtureLoadState(fixture) === 'failed'"
                          class="media-error"
                          :data-testid="`media-error-${fixture.id}`"
                          role="alert"
                        >
                          <strong>{{ fixture.title }}</strong>
                          <span>Media could not be loaded.</span>
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
          </div>
        </section>

        <footer class="lightbox-footer">
          <section class="caption-rail" aria-labelledby="caption-rail-title">
            <div>
              <p id="caption-rail-title" class="rail-label">Caption</p>
              <p class="caption-copy">{{ activeFixture?.description }}</p>
            </div>
            <button class="caption-action" data-testid="caption-action" type="button">
              Caption details
            </button>
          </section>

          <section class="test-rail" aria-labelledby="ownership-rail-title">
            <div class="test-rail-intro">
              <p id="ownership-rail-title" class="rail-label">Keyboard ownership test rail</p>
              <p>Interactive descendants retain their directional keys.</p>
            </div>
            <div aria-labelledby="ownership-rail-title" class="ownership-probes" role="group">
              <label class="text-probe">
                <span>Note</span>
                <input aria-label="Caption note" data-testid="caption-input" type="text" />
              </label>
              <label class="radio-probe">
                <input
                  data-testid="caption-radio"
                  name="caption-mode"
                  type="radio"
                  value="pinned"
                />
                <span>Pin</span>
              </label>
              <div class="media-control-probe">
                <span>Media</span>
                <video aria-label="Media controls" controls data-testid="media-controls" muted />
              </div>
              <button class="done-action" data-testid="ownership-end" type="button">Done</button>
            </div>
            <dl class="lightbox-diagnostics" aria-label="Carousel diagnostics">
              <div>
                <dt>Semantic ID</dt>
                <dd data-testid="media-semantic-id">{{ semanticId }}</dd>
              </div>
              <div>
                <dt>Phase</dt>
                <dd>{{ motion.phase.value }}</dd>
              </div>
              <div>
                <dt>Position</dt>
                <dd class="tabular">x {{ motion.position.value.toFixed(2) }} px</dd>
              </div>
            </dl>
          </section>
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

.fixture-label {
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
  --lightbox-canvas: #080b0e;
  --lightbox-surface: #111820;
  --lightbox-surface-raised: #1a2530;
  --lightbox-control-hover: #263746;
  --lightbox-text: #f4f7fa;
  --lightbox-text-secondary: #b7c2cc;
  --lightbox-control-border: #718496;
  --lightbox-separator: #556878;
  --lightbox-focus: #66b8ff;
  --lightbox-disabled: #8e9ba6;
  --lightbox-error-text: #ffd8d8;
  --lightbox-error-border: #ff8a8a;

  inline-size: 100vw;
  max-inline-size: none;
  block-size: 100dvh;
  max-block-size: none;
  padding: 0;
  border: 0;
  margin: 0;
  background: var(--lightbox-canvas);
  color: var(--lightbox-text);
  color-scheme: dark;
  overflow: auto;
}

.lightbox-dialog::backdrop {
  background: var(--lightbox-canvas);
}

.lightbox-shell {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  min-block-size: 100dvh;
  background: var(--lightbox-canvas);
  color: var(--lightbox-text);
}

.lightbox-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: clamp(0.75rem, 2vw, 1.5rem);
  min-block-size: 4.5rem;
  padding: 0.75rem clamp(0.75rem, 2vw, 1.5rem);
  border-block-end: 1px solid var(--lightbox-separator);
  background: var(--lightbox-surface);
}

.lightbox-header h2 {
  margin: 0;
  font-size: clamp(1.05rem, 2vw, 1.4rem);
  line-height: 1.15;
}

.lightbox-eyebrow,
.rail-label {
  margin: 0 0 0.25rem;
  color: var(--lightbox-text-secondary);
  font-size: 0.75rem;
  font-weight: 750;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.header-diagnostics,
.header-diagnostics div,
.lightbox-diagnostics,
.lightbox-diagnostics div {
  margin: 0;
}

.header-diagnostics {
  display: flex;
  align-items: center;
  gap: clamp(1rem, 2vw, 2rem);
}

.header-diagnostics div,
.lightbox-diagnostics div {
  display: grid;
  gap: 0.15rem;
}

.header-diagnostics dt,
.lightbox-diagnostics dt {
  color: var(--lightbox-text-secondary);
  font-size: 0.75rem;
  font-weight: 650;
}

.header-diagnostics dd,
.lightbox-diagnostics dd {
  margin: 0;
  color: var(--lightbox-text);
  font-size: 0.8125rem;
  font-weight: 700;
}

.lightbox-dialog button,
.lightbox-dialog input[type="text"] {
  min-block-size: 2.5rem;
  border: 1px solid var(--lightbox-control-border);
  border-radius: 0;
  background: var(--lightbox-surface-raised);
  color: var(--lightbox-text);
}

.lightbox-dialog button:not(:disabled):hover {
  background: var(--lightbox-control-hover);
}

.lightbox-dialog button:disabled {
  border-color: var(--lightbox-control-border);
  background: var(--lightbox-canvas);
  color: var(--lightbox-disabled);
  opacity: 1;
}

.lightbox-dialog :focus-visible {
  outline: 3px solid var(--lightbox-focus);
  outline-offset: 3px;
  box-shadow: 0 0 0 8px var(--lightbox-canvas);
}

.icon-button,
.carousel-control {
  display: grid;
  place-items: center;
  inline-size: 2.75rem;
  block-size: 2.75rem;
  padding: 0;
}

.stage-workspace {
  display: grid;
  place-items: center;
  min-inline-size: 0;
  min-block-size: 25rem;
  padding: clamp(0.75rem, 2vw, 1.5rem);
  background: var(--lightbox-canvas);
  overflow: hidden;
}

.stage-instrument {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  inline-size: min(calc(var(--lab-stage-width) + 10rem), 100%);
  min-inline-size: 0;
  border: 1px solid var(--lightbox-control-border);
  background: var(--lightbox-surface);
}

.stage-readout {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  min-block-size: 2.25rem;
  padding: 0.45rem 0.75rem;
  border-block-end: 1px solid var(--lightbox-separator);
  color: var(--lightbox-text-secondary);
  font-size: 0.8125rem;
  font-weight: 650;
}

.carousel-frame {
  display: grid;
  grid-template-columns: 2.75rem minmax(0, 1fr) 2.75rem;
  align-items: center;
  gap: clamp(0.5rem, 1.5vw, 1rem);
  min-inline-size: 0;
  padding: clamp(0.5rem, 1.5vw, 1rem);
}

.carousel-viewport {
  position: relative;
  inline-size: min(var(--lab-stage-width), 100%);
  min-inline-size: 0;
  max-inline-size: 100%;
  aspect-ratio: 16 / 10;
  border: 1px solid var(--lightbox-control-border);
  background: var(--lightbox-surface-raised);
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
  padding: 0.55rem 0.75rem;
  font-size: 0.8125rem;
  font-weight: 700;
}

.media-layer {
  position: relative;
  transform-origin: center;
}

.media-layer--transformed {
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

.media-image:not([data-media-state="loaded"]) {
  visibility: hidden;
}

.media-status,
.media-error {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 0.4rem;
  padding: 1rem;
  background: var(--lightbox-surface-raised);
  text-align: center;
}

.media-status {
  border: 1px dashed var(--lightbox-control-border);
  color: var(--lightbox-text-secondary);
  font-size: 0.8125rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.media-error {
  border: 2px solid var(--lightbox-error-border);
  color: var(--lightbox-error-text);
  font-size: 0.875rem;
}

.media-error strong {
  font-size: 1rem;
}

.carousel-control {
  position: relative;
  z-index: 2;
}

.lightbox-footer {
  display: grid;
  border-block-start: 1px solid var(--lightbox-separator);
  background: var(--lightbox-surface);
}

.caption-rail {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 1rem;
  min-inline-size: 0;
  padding: 0.75rem clamp(0.75rem, 2vw, 1.5rem);
}

.caption-copy,
.test-rail-intro p:last-child {
  margin: 0;
  color: var(--lightbox-text-secondary);
  font-size: 0.875rem;
  line-height: 1.45;
}

.caption-copy {
  max-inline-size: 65ch;
  color: var(--lightbox-text);
  font-size: 0.9375rem;
}

.caption-action,
.done-action {
  padding: 0.55rem 0.8rem;
  font-size: 0.8125rem;
  font-weight: 700;
}

.test-rail {
  display: grid;
  grid-template-columns: minmax(13rem, 0.75fr) minmax(24rem, 1.6fr) auto;
  align-items: center;
  gap: clamp(0.75rem, 2vw, 1.5rem);
  min-inline-size: 0;
  padding: 0.75rem clamp(0.75rem, 2vw, 1.5rem);
  border-block-start: 1px solid var(--lightbox-separator);
  background: var(--lightbox-canvas);
}

.ownership-probes {
  display: grid;
  grid-template-columns: minmax(10rem, 1fr) auto minmax(9rem, auto) auto;
  align-items: center;
  gap: 0.5rem;
  min-inline-size: 0;
}

.text-probe,
.radio-probe,
.media-control-probe {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-block-size: 2.5rem;
  color: var(--lightbox-text);
  font-size: 0.8125rem;
  font-weight: 650;
}

.text-probe {
  min-inline-size: 0;
}

.text-probe input {
  inline-size: 100%;
  min-inline-size: 5rem;
  padding-inline: 0.6rem;
  caret-color: var(--lightbox-text);
}

.radio-probe,
.media-control-probe {
  padding: 0 0.65rem;
  border: 1px solid var(--lightbox-control-border);
  background: var(--lightbox-surface-raised);
}

.radio-probe input[type="radio"] {
  inline-size: 1.125rem;
  block-size: 1.125rem;
  margin: 0;
  accent-color: var(--lightbox-focus);
  color: var(--lightbox-text);
}

.media-control-probe video {
  inline-size: 8rem;
  block-size: 2rem;
  border: 1px solid var(--lightbox-control-border);
  background: var(--lightbox-canvas);
  color: var(--lightbox-text);
}

.lightbox-diagnostics {
  display: grid;
  grid-template-columns: repeat(3, max-content);
  gap: 0.8rem;
  padding-inline-start: 1rem;
  border-inline-start: 1px solid var(--lightbox-separator);
}

@media (max-width: 70rem) {
  .test-rail {
    grid-template-columns: minmax(0, 1fr);
  }

  .lightbox-diagnostics {
    padding-block-start: 0.75rem;
    padding-inline-start: 0;
    border-block-start: 1px solid var(--lightbox-separator);
    border-inline-start: 0;
  }
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

  .lightbox-header {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .header-diagnostics {
    grid-column: 1 / -1;
    grid-row: 2;
    justify-content: space-between;
  }

  .icon-button {
    grid-column: 2;
    grid-row: 1;
  }

  .stage-workspace {
    min-block-size: 20rem;
    padding: 0.5rem;
  }

  .stage-instrument {
    inline-size: 100%;
  }

  .carousel-frame {
    grid-template-columns: 2.75rem minmax(0, 1fr) 2.75rem;
    padding: 0.5rem;
  }

  .carousel-viewport {
    grid-column: 1 / -1;
    grid-row: 1;
    inline-size: 100%;
    aspect-ratio: 3 / 4;
  }

  .previous-control,
  .next-control {
    grid-row: 2;
  }

  .previous-control {
    grid-column: 1;
  }

  .next-control {
    grid-column: 3;
  }

  .caption-rail {
    grid-template-columns: minmax(0, 1fr);
  }

  .ownership-probes {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .text-probe,
  .media-control-probe {
    grid-column: 1 / -1;
  }

  .media-control-probe {
    justify-content: space-between;
  }

  .lightbox-diagnostics {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (forced-colors: active) {
  .lightbox-dialog {
    --lightbox-canvas: Canvas;
    --lightbox-surface: Canvas;
    --lightbox-surface-raised: ButtonFace;
    --lightbox-control-hover: Highlight;
    --lightbox-text: CanvasText;
    --lightbox-text-secondary: CanvasText;
    --lightbox-control-border: ButtonText;
    --lightbox-separator: GrayText;
    --lightbox-focus: Highlight;
    --lightbox-disabled: GrayText;
    --lightbox-error-text: CanvasText;
    --lightbox-error-border: LinkText;
  }
}
</style>
