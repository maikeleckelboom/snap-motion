<script setup lang="ts">
import { createFixedStageGeometry } from "@snap-motion/core";
import { useCarouselMotion } from "@snap-motion/vue/carousel";
import {
  captureFocusOpener,
  focusInitial,
  maintainModalTabOrder,
  restoreFocus,
} from "@snap-motion/vue/dialog";
import { until, useElementSize, useImage, useTimeoutFn } from "@vueuse/core";
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from "vue";

import DiagnosticsPanel from "@/components/DiagnosticsPanel.vue";
import {
  carouselReleaseFromSettings,
  springFromSettings,
  symmetricElasticityFromSettings,
} from "@/fixtures/lab-settings";
import type { LabDiagnostics, LabPhysicsSettings } from "@/fixtures/lab-types";
import { mediaFixtures, type MediaFixture, type MediaFixtureId } from "@/fixtures/media";
import type { MediaSize } from "@/media-inspection/media-transform-contracts";
import { runMediaTransition, supportsMediaTransition } from "@/media-inspection/media-transition";
import MediaZoomControls from "@/media-inspection/MediaZoomControls.vue";
import { useMediaTransform } from "@/media-inspection/use-media-transform";

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
const mediaIntrinsicSizes = ref<Partial<Record<MediaFixtureId, MediaSize>>>({});
const fixtureMode = ref<"all" | "one">("all");
const directionMode = ref<"ltr" | "rtl">("ltr");
const transitionMotionEnabled = ref(true);
const isTransitioning = ref(false);
const liveMessage = ref("");
const titleId = `media-lightbox-title-${useId()}`;
const isOpen = ref(false);
const reducedOverride = computed(() => props.reducedMotionOverride);
const direction = computed(() => directionMode.value);
const { height: renderedStageHeight, width: renderedStageWidth } = useElementSize(viewport);
const thumbnailElements = new Map<MediaFixtureId, HTMLElement>();
const mediaTransitionElements = new Map<MediaFixtureId, HTMLElement>();
const mediaPreloads = new Map(
  mediaFixtures.map((fixture) => [
    fixture.id,
    useImage({ decoding: "async", src: fixture.src }, { immediate: false, resetOnExecute: false }),
  ]),
);
const transitionSupported = supportsMediaTransition(globalThis.document);
let storedOpener: HTMLElement | undefined;
let openedFromThumbnailId: MediaFixtureId | undefined;
let focusRestoreFrame: number | undefined;
let closeRequestedDuringTransition = false;

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
    viewportSize: Math.max(
      1,
      track.value?.getBoundingClientRect().width ?? viewport.value?.clientWidth ?? props.stageWidth,
    ),
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
const activeIntrinsicSize = computed<MediaSize>(() => {
  const fixture = activeFixture.value;
  return fixture
    ? (mediaIntrinsicSizes.value[fixture.id] ?? { height: 0, width: 0 })
    : { height: 0, width: 0 };
});
const activeMediaReady = computed(() => {
  const fixture = activeFixture.value;
  return fixture !== undefined && fixtureLoadState(fixture) === "loaded";
});
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

const mediaTransform = useMediaTransform({
  enabled: activeMediaReady,
  intrinsicSize: activeIntrinsicSize,
  reducedMotion: computed(() => motion.reducedMotion.value),
  surface: viewport,
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
  mediaIntrinsicSizes.value = {};
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

  mediaIntrinsicSizes.value = {
    ...mediaIntrinsicSizes.value,
    [fixture.id]: { height: image.naturalHeight, width: image.naturalWidth },
  };
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
  if (mediaTransform.onKeyDown(event)) return;
  motion.onKeyDown(event);
}

function onViewportPointerDown(event: PointerEvent) {
  if (mediaTransform.onPointerDown(event)) return;
  motion.onPointerDown(event);
}

function onViewportWheel(event: WheelEvent) {
  if (mediaTransform.onWheel(event)) return;
  motion.onWheel(event);
}

function onDialogKeyDown(event: KeyboardEvent) {
  maintainModalTabOrder(event, dialog.value);
  if (event.defaultPrevented) return;
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") motion.onKeyDown(event);
}

function setThumbnailElement(fixtureId: MediaFixtureId, element: HTMLElement | null) {
  if (element) thumbnailElements.set(fixtureId, element);
  else thumbnailElements.delete(fixtureId);
}

function setMediaTransitionElement(fixtureId: MediaFixtureId, element: HTMLElement | null) {
  if (element) mediaTransitionElements.set(fixtureId, element);
  else mediaTransitionElements.delete(fixtureId);
}

function mediaTransitionStyle(fixture: MediaFixture): Record<string, string> {
  const stageAspectRatio = 16 / 10;
  const mediaAspectRatio = fixture.intrinsicSize.width / fixture.intrinsicSize.height;

  return {
    "--media-transition-aspect-ratio": `${fixture.intrinsicSize.width} / ${fixture.intrinsicSize.height}`,
    ...(mediaAspectRatio >= stageAspectRatio
      ? { "--media-transition-inline-size": "100%" }
      : { "--media-transition-block-size": "100%" }),
  };
}

async function preloadMediaForTransition(fixture: MediaFixture): Promise<boolean> {
  const preload = mediaPreloads.get(fixture.id);
  if (!preload) return false;

  const image = await preload.execute();
  if (!image) return false;

  try {
    await image.decode();
  } catch {
    return false;
  }

  return image.complete && image.naturalWidth > 0 && image.naturalHeight > 0;
}

function selectFixtureImmediately(fixtureId: MediaFixtureId) {
  const anchor = motion.snapshot.value.anchors.find(({ id }) => id === fixtureId);
  if (!anchor || semanticId.value === fixtureId) return;
  motion.interrupt();
  motion.controller.beginDrag();
  motion.controller.dragTo(anchor.position);
  motion.controller.release(0);
}

async function openLightbox(fixtureId?: MediaFixtureId) {
  const target = dialog.value;
  if (!target || target.open || isTransitioning.value) {
    return;
  }

  const thumbnailOpener = fixtureId ? thumbnailElements.get(fixtureId) : undefined;
  const transitionSource =
    thumbnailOpener?.querySelector<HTMLImageElement>(".media-transition-surface > img") ??
    undefined;
  const fixture = fixtureId ? mediaFixtures.find(({ id }) => id === fixtureId) : undefined;
  storedOpener = thumbnailOpener ?? opener.value ?? captureFocusOpener(document);
  openedFromThumbnailId = fixtureId;
  if (fixtureId) selectFixtureImmediately(fixtureId);
  isTransitioning.value = true;

  try {
    const openingMotionReady =
      transitionMotionEnabled.value &&
      transitionSupported &&
      !motion.reducedMotion.value &&
      fixture !== undefined &&
      fixture.mode !== "delayed" &&
      (await preloadMediaForTransition(fixture));
    let destinationReady = false;

    resetMediaLoading();
    mediaTransform.reset({ animated: false });
    await runMediaTransition({
      destination: () =>
        destinationReady
          ? mediaTransitionElements.get(fixtureId ?? semanticId.value ?? "regular")
          : undefined,
      document: target.ownerDocument,
      enabled: openingMotionReady,
      reducedMotion: motion.reducedMotion.value,
      source: transitionSource,
      update: async () => {
        target.showModal();
        isOpen.value = true;
        startDelayedSourceTimer();
        await nextTick();
        if (fixtureId) selectFixtureImmediately(fixtureId);
        if (openingMotionReady && fixture) {
          await until(() => fixtureLoadState(fixture)).toMatch((state) => state !== "pending", {
            timeout: 4_000,
          });
          destinationReady = fixtureLoadState(fixture) === "loaded";
        }
        motion.remeasure();
        focusInitial("close", { close: closeButton.value, container: target });
        announceCurrent();
      },
    });
  } finally {
    isTransitioning.value = false;
    if (closeRequestedDuringTransition && target.open) {
      closeRequestedDuringTransition = false;
      await closeLightbox();
    }
  }
}

async function closeLightbox() {
  const target = dialog.value;
  if (!target?.open) return;
  if (isTransitioning.value) {
    closeRequestedDuringTransition = true;
    return;
  }
  motion.interrupt();
  mediaTransform.reset({ animated: false });
  const activeId = semanticId.value;
  const canReturnToThumbnail =
    openedFromThumbnailId !== undefined && openedFromThumbnailId === activeId;
  const source = canReturnToThumbnail ? mediaTransitionElements.get(activeId) : undefined;
  isTransitioning.value = true;

  try {
    await runMediaTransition({
      destination: () =>
        canReturnToThumbnail
          ? (thumbnailElements
              .get(activeId)
              ?.querySelector<HTMLImageElement>(".media-transition-surface > img") ?? undefined)
          : undefined,
      document: target.ownerDocument,
      enabled: transitionMotionEnabled.value && canReturnToThumbnail,
      reducedMotion: motion.reducedMotion.value,
      source,
      update: () => target.close(),
    });
  } finally {
    isTransitioning.value = false;
  }
}

function onCancel(event: Event) {
  event.preventDefault();
  void closeLightbox();
}

function onDialogClose() {
  isOpen.value = false;
  mediaLoadGeneration.value += 1;
  mediaTransform.reset({ animated: false });
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
  mediaTransform.reset({ animated: false });
  await nextTick();
  motion.remeasure();
  announceCurrent();
});

watch(semanticId, () => mediaTransform.reset({ animated: false }));

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
        @click="openLightbox()"
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

    <label class="transition-option">
      <input
        v-model="transitionMotionEnabled"
        data-testid="media-transition-toggle"
        :disabled="!transitionSupported"
        type="checkbox"
      />
      <span>
        Thumbnail opening motion
        <small>{{ transitionSupported ? "View Transition" : "Unavailable in this browser" }}</small>
      </span>
    </label>

    <div class="fixture-index" aria-label="Included media fixtures">
      <button
        v-for="(fixture, index) in visibleFixtures"
        :key="fixture.id"
        :ref="(element) => setThumbnailElement(fixture.id, element as HTMLElement | null)"
        :aria-label="`Open ${fixture.title} in the media lightbox`"
        class="fixture-thumbnail"
        :data-testid="`media-thumbnail-${fixture.id}`"
        type="button"
        @click="openLightbox(fixture.id)"
      >
        <span class="media-thumbnail-visual">
          <span class="media-transition-surface" :style="mediaTransitionStyle(fixture)">
            <img
              :src="fixture.src"
              alt=""
              aria-hidden="true"
              :data-testid="`media-thumbnail-image-${fixture.id}`"
              draggable="false"
              :height="fixture.intrinsicSize.height"
              :width="fixture.intrinsicSize.width"
            />
          </span>
        </span>
        <span class="fixture-thumbnail-copy">
          <strong class="tabular">{{ String(index + 1).padStart(2, "0") }}</strong>
          <span>{{ fixture.title }}</span>
        </span>
      </button>
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
      <div class="lightbox-shell" data-testid="media-lightbox-shell" :style="stageStyle">
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

        <section
          class="stage-workspace"
          aria-label="Media stage workspace"
          data-testid="media-stage-workspace"
        >
          <div class="stage-instrument" data-testid="media-stage-instrument">
            <div class="stage-readout">
              <span>Fixed-stage geometry</span>
              <MediaZoomControls
                class="stage-zoom-controls"
                :can-zoom-in="mediaTransform.canZoomIn.value"
                :can-zoom-out="mediaTransform.canZoomOut.value"
                :is-panning="mediaTransform.isPanning.value"
                :scale-percentage="mediaTransform.scalePercentage.value"
                @reset="mediaTransform.reset()"
                @zoom-in="mediaTransform.zoomIn"
                @zoom-out="mediaTransform.zoomOut"
              />
              <span class="stage-dimensions">
                <span class="tabular">Target {{ props.stageWidth }} px</span>
                <span class="tabular" data-testid="media-rendered-size">
                  Rendered {{ Math.round(renderedStageWidth) }} ×
                  {{ Math.round(renderedStageHeight) }} px
                </span>
              </span>
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
                :data-transform-state="
                  mediaTransform.isPanning.value
                    ? 'panning'
                    : mediaTransform.isZoomed.value
                      ? 'zoomed'
                      : 'fitted'
                "
                :style="motion.surfaceStyle"
                tabindex="0"
                @dblclick="mediaTransform.onDoubleClick"
                @keydown="onViewportKeyDown"
                @pointerdown="onViewportPointerDown"
                @wheel="onViewportWheel"
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
                        <div
                          class="media-transform-surface"
                          :data-testid="`media-transform-${fixture.id}`"
                          :style="
                            semanticId === fixture.id
                              ? mediaTransform.transformStyle.value
                              : undefined
                          "
                        >
                          <div
                            class="media-transition-surface"
                            :style="mediaTransitionStyle(fixture)"
                          >
                            <img
                              v-if="isOpen && fixtureSourceReady(fixture)"
                              :ref="
                                (element) =>
                                  setMediaTransitionElement(
                                    fixture.id,
                                    element as HTMLElement | null,
                                  )
                              "
                              :alt="
                                fixtureLoadState(fixture) === 'loaded' ? fixture.description : ''
                              "
                              :aria-hidden="fixtureLoadState(fixture) !== 'loaded'"
                              class="media-image"
                              :data-load-generation="mediaLoadGeneration"
                              :data-media-state="fixtureLoadState(fixture)"
                              :data-testid="`media-image-${fixture.id}`"
                              decoding="async"
                              draggable="false"
                              :height="fixture.intrinsicSize.height"
                              :src="fixture.src"
                              :width="fixture.intrinsicSize.width"
                              @dragstart="motion.onNativeDragStart"
                              @error="onMediaError(fixture, $event)"
                              @load="onMediaLoad(fixture, $event)"
                            />
                          </div>
                        </div>
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
                        aria-label="Inspect details"
                        class="slide-action"
                        :data-testid="`slide-action-${fixture.id}`"
                        type="button"
                      >
                        <span aria-hidden="true" class="slide-action-wide">Inspect details</span>
                        <span aria-hidden="true" class="slide-action-compact">Inspect</span>
                        <svg
                          aria-hidden="true"
                          class="slide-action-icon"
                          viewBox="0 0 24 24"
                          width="16"
                          height="16"
                        >
                          <circle
                            cx="12"
                            cy="12"
                            r="8"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                          />
                          <path
                            d="M12 11v5m0-8v.5"
                            fill="none"
                            stroke="currentColor"
                            stroke-linecap="square"
                            stroke-width="2"
                          />
                        </svg>
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
                At fit, use Left and Right Arrow to move between items. When zoomed, Arrow keys pan
                the media. Use Plus and Minus to zoom, or Zero to return to fit.
              </p>
              <p class="sr-only" aria-atomic="true" role="status">{{ liveMessage }}</p>
            </section>
          </div>
        </section>

        <footer class="lightbox-footer" data-testid="media-lightbox-footer">
          <section
            class="caption-rail"
            aria-labelledby="caption-rail-title"
            data-testid="media-caption-rail"
          >
            <div>
              <p id="caption-rail-title" class="rail-label">Caption</p>
              <p class="caption-copy">{{ activeFixture?.description }}</p>
            </div>
            <button class="caption-action" data-testid="caption-action" type="button">
              Caption details
            </button>
          </section>

          <section
            class="test-rail"
            aria-labelledby="ownership-rail-title"
            data-testid="media-test-rail"
          >
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
  gap: 1px;
  background: var(--line);
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

.transition-option {
  display: flex;
  align-items: center;
  justify-content: end;
  gap: 0.7rem;
  color: var(--ink);
  font-size: 0.75rem;
  font-weight: 700;
}

.transition-option input {
  inline-size: 1.1rem;
  block-size: 1.1rem;
  margin: 0;
  accent-color: var(--ink);
}

.transition-option span {
  display: grid;
  gap: 0.1rem;
}

.transition-option small {
  color: var(--muted);
  font-size: 0.65rem;
  font-weight: 600;
}

.fixture-thumbnail {
  display: grid;
  gap: 0.65rem;
  inline-size: 100%;
  min-inline-size: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: var(--paper);
  color: var(--muted);
  font-size: 0.7rem;
  text-align: start;
}

.fixture-thumbnail:hover .media-thumbnail-visual {
  border-color: var(--ink);
}

.fixture-thumbnail:focus-visible {
  position: relative;
  z-index: 1;
  outline: 3px solid var(--ink);
  outline-offset: 3px;
}

.media-thumbnail-visual {
  position: relative;
  display: grid;
  place-items: center;
  inline-size: 100%;
  min-inline-size: 0;
  aspect-ratio: 16 / 10;
  border: 1px solid var(--line);
  background: color-mix(in srgb, var(--paper) 92%, var(--ink));
  overflow: clip;
}

.media-thumbnail-visual img {
  position: absolute;
  inset: 0;
  display: block;
  inline-size: 100%;
  min-inline-size: 0;
  max-inline-size: 100%;
  block-size: 100%;
  object-fit: contain;
}

.media-transition-surface {
  position: relative;
  display: grid;
  place-items: center;
  inline-size: var(--media-transition-inline-size, auto);
  block-size: var(--media-transition-block-size, auto);
  aspect-ratio: var(--media-transition-aspect-ratio);
}

.fixture-thumbnail-copy {
  display: grid;
  grid-template-columns: 2rem minmax(0, 1fr);
  gap: 0.35rem;
  min-inline-size: 0;
  padding: 0 0.65rem 0.8rem;
}

.fixture-thumbnail-copy strong {
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

  position: fixed;
  inset: 0;
  inline-size: 100%;
  max-inline-size: none;
  block-size: 100vh;
  block-size: 100dvb;
  max-block-size: 100svb;
  padding: 0;
  border: 0;
  margin: 0;
  background: var(--lightbox-canvas);
  color: var(--lightbox-text);
  color-scheme: dark;
  overflow: clip;
  overscroll-behavior: none;
}

.lightbox-dialog::backdrop {
  background: var(--lightbox-canvas);
}

.lightbox-shell {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  block-size: 100%;
  min-block-size: 0;
  max-block-size: 100%;
  background: var(--lightbox-canvas);
  color: var(--lightbox-text);
  overflow: clip;
}

.lightbox-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: clamp(0.75rem, 2vw, 1.5rem);
  min-block-size: 4.5rem;
  padding-block: 0.75rem;
  padding-block-start: max(0.75rem, env(safe-area-inset-top));
  padding-inline: clamp(0.75rem, 2vw, 1.5rem);
  padding-inline-start: max(clamp(0.75rem, 2vw, 1.5rem), env(safe-area-inset-left));
  padding-inline-end: max(clamp(0.75rem, 2vw, 1.5rem), env(safe-area-inset-right));
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
  min-block-size: 0;
  padding: clamp(0.5rem, 1.5vw, 1rem);
  background: var(--lightbox-canvas);
  overflow: clip;
  container-type: size;
}

.stage-instrument {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  inline-size: min(calc(var(--lab-stage-width) + 10rem), 100%);
  min-inline-size: 0;
  block-size: 100%;
  min-block-size: 0;
  max-block-size: 100%;
  border: 1px solid var(--lightbox-control-border);
  background: var(--lightbox-surface);
  overflow: clip;
}

.stage-readout {
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr);
  align-items: center;
  gap: 1rem;
  min-block-size: 2.25rem;
  padding: 0.45rem 0.75rem;
  border-block-end: 1px solid var(--lightbox-separator);
  color: var(--lightbox-text-secondary);
  font-size: 0.8125rem;
  font-weight: 650;
}

.stage-dimensions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  justify-self: end;
  gap: 0.25rem 1rem;
}

.carousel-frame {
  display: grid;
  grid-template-columns: 2.75rem minmax(0, 1fr) 2.75rem;
  align-items: center;
  justify-items: center;
  gap: clamp(0.5rem, 1.5vw, 1rem);
  min-inline-size: 0;
  block-size: 100%;
  min-block-size: 0;
  max-block-size: 100%;
  padding: clamp(0.5rem, 1.5vw, 1rem);
  overflow: clip;
  container-type: size;
}

.carousel-viewport {
  position: relative;
  inline-size: min(var(--lab-stage-width), 100%, 160cqb);
  min-inline-size: 0;
  max-inline-size: 100%;
  min-block-size: 0;
  max-block-size: 100%;
  aspect-ratio: 16 / 10;
  border: 1px solid var(--lightbox-control-border);
  background: var(--lightbox-surface-raised);
  overflow: clip;
  cursor: grab;
  container-type: size;
}

.carousel-viewport[data-phase="dragging"] {
  cursor: grabbing;
}

.carousel-viewport[data-transform-state="zoomed"] {
  cursor: grab;
}

.carousel-viewport[data-transform-state="panning"] {
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

.media-transform-surface {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  inline-size: 100%;
  block-size: 100%;
  pointer-events: none;
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

.slide-action-compact {
  display: none;
}

.slide-action-icon {
  display: none;
}

@container (max-width: 10rem) {
  .slide-action {
    padding-inline: 0.55rem;
  }

  .slide-action-wide {
    display: none;
  }

  .slide-action-compact {
    display: inline;
  }
}

@container (max-width: 4rem) or (max-height: 3rem) {
  .lightbox-dialog .slide-action {
    display: grid;
    place-items: center;
    inset: 0.2rem 0.2rem auto auto;
    inline-size: 1.5rem;
    min-inline-size: 1.5rem;
    block-size: 1.5rem;
    min-block-size: 1.5rem;
    padding: 0;
  }

  .slide-action-wide,
  .slide-action-compact {
    display: none;
  }

  .slide-action-icon {
    display: block;
  }
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
  grid-template-rows: auto minmax(0, 1fr);
  min-block-size: 0;
  max-block-size: min(34dvb, 22rem);
  padding-block-end: env(safe-area-inset-bottom);
  border-block-start: 1px solid var(--lightbox-separator);
  background: var(--lightbox-surface);
  overflow: clip;
}

.caption-rail {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 1rem;
  min-inline-size: 0;
  min-block-size: 0;
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
  min-block-size: 0;
  padding: 0.75rem clamp(0.75rem, 2vw, 1.5rem);
  border-block-start: 1px solid var(--lightbox-separator);
  background: var(--lightbox-canvas);
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
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

  .fixture-thumbnail {
    grid-template-columns: minmax(6rem, 0.4fr) minmax(0, 1fr);
    align-items: center;
  }

  .fixture-thumbnail-copy {
    padding: 0.75rem;
  }

  .transition-option {
    justify-content: start;
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
    padding: 0.5rem;
  }

  .stage-instrument {
    inline-size: 100%;
  }

  .stage-readout {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .stage-readout > span:first-child,
  .stage-dimensions > span:first-child {
    display: none;
  }

  .stage-zoom-controls {
    justify-self: start;
  }

  .carousel-frame {
    grid-template-columns: 2.75rem minmax(0, 1fr) 2.75rem;
    padding: 0.5rem;
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

@media (max-height: 36rem) {
  .lightbox-header {
    grid-template-columns: minmax(0, 1fr) auto;
    min-block-size: 3.5rem;
    padding-block: 0.375rem;
    padding-block-start: max(0.375rem, env(safe-area-inset-top));
  }

  .lightbox-eyebrow,
  .header-diagnostics {
    display: none;
  }

  .icon-button {
    grid-column: 2;
    grid-row: 1;
  }

  .stage-workspace,
  .carousel-frame {
    padding: 0.25rem;
  }

  .stage-readout {
    min-block-size: 1.75rem;
    padding-block: 0.2rem;
  }

  .stage-readout > span:first-child,
  .stage-dimensions > span:first-child {
    display: none;
  }

  .caption-rail {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.5rem;
    padding-block: 0.375rem;
  }

  .caption-rail .rail-label {
    display: none;
  }

  .caption-copy {
    line-height: 1.25;
  }

  .test-rail {
    padding-block: 0.375rem;
  }
}

:global(html:has(.lightbox-dialog[open])),
:global(html:has(.lightbox-dialog[open]) body) {
  overflow: clip;
}

:global(::view-transition-group(media-inspection-media)) {
  z-index: 2147483647;
  animation-duration: 340ms;
  animation-timing-function: cubic-bezier(0.22, 0.8, 0.2, 1);
}

:global(::view-transition-old(root)),
:global(::view-transition-new(root)) {
  animation: none;
  mix-blend-mode: normal;
}

:global(::view-transition-old(media-inspection-media)),
:global(::view-transition-new(media-inspection-media)) {
  animation-duration: 340ms;
  animation-timing-function: cubic-bezier(0.22, 0.8, 0.2, 1);
  object-fit: contain;
}

@media (prefers-reduced-motion: reduce) {
  :global(::view-transition-group(media-inspection-media)),
  :global(::view-transition-old(media-inspection-media)),
  :global(::view-transition-new(media-inspection-media)) {
    animation-duration: 0.01ms;
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
