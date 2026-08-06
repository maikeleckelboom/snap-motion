<script setup lang="ts">
import {
  createCoverflowGeometry,
  createStackedDeckFrame,
  resolveStackedDeckFrame,
  resolveStackedDeckTuning,
} from "@snap-motion/core";
import { useCarouselMotion } from "@snap-motion/vue/carousel";
import { MediaGalleryDialog, type FocusReturnOptions } from "@snap-motion/vue/media-gallery";
import { useElementSize, useEventListener } from "@vueuse/core";
import {
  computed,
  nextTick,
  onBeforeUnmount,
  ref,
  shallowRef,
  triggerRef,
  watch,
  watchEffect,
} from "vue";

import DiagnosticsPanel from "@/components/DiagnosticsPanel.vue";
import {
  carouselReleaseFromSettings,
  springFromSettings,
  symmetricElasticityFromSettings,
} from "@/fixtures/lab-settings";
import type { LabDiagnostics, LabPhysicsSettings } from "@/fixtures/lab-types";

import {
  COVERFLOW_GALLERY_TUNING,
  isCoverflowGalleryEligible,
  resolveCoverflowGesture,
} from "./coverflowGallery";
import {
  COVERFLOW_MOTION_TUNING,
  COVERFLOW_PAGINATION_TUNING,
  CoverflowSettledSelection,
  resolveAdjacentCoverflowIndex,
  resolveCoverflowKeyboardAction,
  resolveCoverflowPaginationIndicator,
  resolveCoverflowVisualIndex,
  resolveSpeedInCards,
  useBoundedCoverflowDriver,
  type CoverflowPaginationIndicatorState,
} from "./coverflowMotion";
import { showcaseScreens, type ShowcaseScreenId } from "./showcaseScreens";

type ScreenId = ShowcaseScreenId;

const props = defineProps<{
  reducedMotionOverride: boolean | undefined;
  settings: LabPhysicsSettings;
  stageWidth: number;
}>();

const screens = showcaseScreens;

const ids = screens.map((screen) => screen.id);
const coverflowRoot = ref<HTMLElement>();
const viewport = ref<HTMLElement>();
const track = ref<HTMLElement>();
const galleryOpen = ref(false);
const galleryInitialIndex = ref(0);
const galleryFinalIndex = ref(0);
const reducedOverride = computed(() => props.reducedMotionOverride);
const { width: viewportWidth } = useElementSize(viewport);
const inspectControl = ref<HTMLButtonElement>();
const galleryFocusReturn = computed<FocusReturnOptions>(() => ({
  opener: inspectControl.value,
  fallback: () => viewport.value,
}));
const activeCarouselPointers = new Set<number>();
let suppressedCarouselAnnouncementIndex: number | undefined;
let selectionFrame: number | undefined;

interface CarouselGesture {
  readonly focusWasOutside: boolean;
  readonly openEligibleAtStart: boolean;
  readonly originElement: HTMLElement | undefined;
  readonly originIndex: number | undefined;
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  cancelled: boolean;
  deltaX: number;
  deltaY: number;
  involvedMultiplePointers: boolean;
  maximumDisplacement: number;
}

let carouselGesture: CarouselGesture | undefined;

const stageWidthPx = computed(() =>
  Math.max(320, viewportWidth.value || Math.min(props.stageWidth, 1_280)),
);

const stageHeightPx = computed(() => clamp(stageWidthPx.value * 0.56, 320, 640));
const stackedTuning = computed(() =>
  resolveStackedDeckTuning({
    stageWidth: stageWidthPx.value,
    stageHeight: stageHeightPx.value,
  }),
);
const reducedStackedTuning = computed(() =>
  resolveStackedDeckTuning({
    stageWidth: stageWidthPx.value,
    stageHeight: stageHeightPx.value,
    reducedMotion: true,
  }),
);

const cardWidth = computed(() => stackedTuning.value.cardWidth);
const cardHeight = computed(() => stackedTuning.value.cardHeight);

/** One pitch remains the scalar controller's direct-manipulation distance. */
const pitch = computed(() => stackedTuning.value.motionPitch);

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function measureGeometry() {
  return createCoverflowGeometry({
    itemIds: ids,
    pitch: pitch.value,
    viewportSize: Math.max(1, viewport.value?.clientWidth ?? props.stageWidth),
  });
}

const initialGeometry = measureGeometry();
const driver = useBoundedCoverflowDriver(() => pitch.value);
const motion = useCarouselMotion({
  anchors: initialGeometry.anchors,
  bounds: initialGeometry.bounds,
  driver,
  elasticity: symmetricElasticityFromSettings(props.settings),
  initialTargetId: ids[Math.floor(ids.length / 2)]!,
  measure: measureGeometry,
  programmaticImpulse: props.settings.programmaticImpulse,
  reducedMotionOverride: reducedOverride,
  releasePolicy: carouselReleaseFromSettings(props.settings),
  spring: springFromSettings(props.settings),
  track,
  viewport,
});

const initialIndex = Math.floor(ids.length / 2);
galleryInitialIndex.value = initialIndex;
galleryFinalIndex.value = initialIndex;
const settledSelection = new CoverflowSettledSelection(initialIndex, ids.length);
const visualIndex = ref(initialIndex);
const settledIndex = ref(initialIndex);
const pendingTargetIndex = ref<number | null>(null);
const focusedPaginationIndex = ref<number | null>(null);
const liveMessage = ref("");
const visualId = computed(() => ids[visualIndex.value] ?? ids[initialIndex]!);
const settledId = computed(() => ids[settledIndex.value] ?? ids[initialIndex]!);
const visualScreen = computed(() => screens[visualIndex.value] ?? screens[0]!);
const settledScreen = computed(() => screens[settledIndex.value] ?? screens[0]!);

/** Continuous physical index. It projects motion but never controls the carousel mass. */
const rawPhysicalIndex = computed(() =>
  pitch.value <= 0 ? 0 : -motion.position.value / pitch.value,
);
const physicalIndex = computed(() => {
  const max = Math.max(0, ids.length - 1);
  return clamp(rawPhysicalIndex.value, 0, max);
});
const speedInCards = computed(() => resolveSpeedInCards(motion.velocity.value, pitch.value));

const paginationDots = computed(() =>
  screens.map((screen, index) => ({
    id: screen.id,
    title: screen.title,
    current: index === visualIndex.value,
  })),
);

watch(
  motion.snapshot,
  (snapshot) => {
    const currentPitch = Math.max(1, pitch.value);
    const currentPhysicalIndex = clamp(-snapshot.position / currentPitch, 0, ids.length - 1);
    const targetIndex =
      snapshot.target === null ? null : Math.max(0, ids.indexOf(snapshot.target.id));
    const nearestIndex =
      snapshot.active === null ? settledIndex.value : Math.max(0, ids.indexOf(snapshot.active.id));
    const nextVisualIndex = resolveCoverflowVisualIndex(
      currentPhysicalIndex,
      visualIndex.value,
      ids.length,
    );
    const announcementIndex = settledSelection.update({
      phase: snapshot.phase,
      targetIndex,
      activeIndex: nearestIndex,
    });

    if (visualIndex.value !== nextVisualIndex) {
      visualIndex.value = nextVisualIndex;
    }
    if (settledIndex.value !== settledSelection.settledIndex) {
      settledIndex.value = settledSelection.settledIndex;
    }
    if (pendingTargetIndex.value !== settledSelection.pendingTargetIndex) {
      pendingTargetIndex.value = settledSelection.pendingTargetIndex;
    }
    if (announcementIndex !== null) {
      const suppressAnnouncement = announcementIndex === suppressedCarouselAnnouncementIndex;
      suppressedCarouselAnnouncementIndex = undefined;
      if (!suppressAnnouncement) {
        const screen = screens[announcementIndex];
        if (screen) {
          liveMessage.value = `${screen.title}, ${announcementIndex + 1} of ${screens.length}`;
        }
      }
    }
  },
  { immediate: true },
);

const anchorsById = computed(() => {
  const map = new Map<string, number>();
  for (const anchor of motion.snapshot.value.anchors) {
    map.set(anchor.id, anchor.position);
  }
  return map;
});

function isCardGalleryEligible(index: number): boolean {
  const screen = screens[index];
  if (!screen || galleryOpen.value || motion.isDragging.value || motion.pointerOwned.value) {
    return false;
  }
  return isCoverflowGalleryEligible({
    activeId: motion.activeId.value,
    expectedId: screen.id,
    index,
    phase: motion.phase.value,
    physicalIndex: physicalIndex.value,
    position: motion.position.value,
    settledIndex: settledIndex.value,
    targetId: motion.targetId.value,
    velocity: motion.velocity.value,
    restDistance: props.settings.restDistance,
    restSpeed: props.settings.restSpeed,
    targetPosition: anchorsById.value.get(screen.id),
  });
}

interface SlideStyle {
  opacity: number;
  transformOrigin?: string;
  transform: string;
  zIndex: number;
  visibility: "visible" | "hidden";
  pointerEvents: "auto" | "none";
  willChange?: "auto" | "transform";
  [customProperty: `--${string}`]: string;
}

const stackedFrameOutput = createStackedDeckFrame(ids.length);
const stackedFrame = shallowRef(stackedFrameOutput);
watchEffect(() => {
  const tuning = motion.reducedMotion.value ? reducedStackedTuning.value : stackedTuning.value;
  resolveStackedDeckFrame(
    {
      itemCount: ids.length,
      physicalIndex: rawPhysicalIndex.value,
      tuning,
    },
    stackedFrameOutput,
  );
  triggerRef(stackedFrame);
});

function stackedPose(index: number) {
  return stackedFrame.value.poses[index];
}

const slideStyles = computed(() => {
  const styles = {} as Record<ScreenId, SlideStyle>;
  const frame = stackedFrame.value;
  for (let index = 0; index < screens.length; index += 1) {
    const screen = screens[index]!;
    const pose = frame.poses[index]!;
    styles[screen.id] = {
      opacity: 1,
      transform: `translate3d(-50%, -50%, 0) translate3d(${pose.translateX.toFixed(3)}px, ${pose.translateY.toFixed(3)}px, 0) scale(${pose.projectedScale.toFixed(5)})`,
      transformOrigin: "center center",
      zIndex: pose.layer,
      visibility: pose.visible ? "visible" : "hidden",
      pointerEvents: pose.interactive ? "auto" : "none",
      willChange: pose.visible ? "transform" : "auto",
      "--screen-accent": screen.accent,
      "--deck-edge-offset": `${(Math.sign(pose.rotateY) * -1.5).toFixed(3)}px`,
      "--deck-occlusion-angle": pose.translateX < 0 ? "90deg" : "270deg",
      "--deck-rotate-y": `${pose.rotateY.toFixed(3)}deg`,
      "--deck-shadow-strength": pose.shadowStrength.toFixed(4),
      "--deck-veil": pose.veil.toFixed(4),
    };
  }
  return styles;
});

const stageStyle = computed(() => ({
  "--coverflow-stage-width": `${Math.min(props.stageWidth, 1_280)}px`,
  "--coverflow-card-width": `${cardWidth.value}px`,
  "--coverflow-card-height": `${cardHeight.value}px`,
}));

const paginationIndicator = computed<CoverflowPaginationIndicatorState>(() =>
  resolveCoverflowPaginationIndicator(
    physicalIndex.value,
    motion.velocity.value,
    pitch.value,
    ids.length,
    {
      position: 0,
      x: 0,
      scaleX: 1,
      stretchRatio: 0,
      speedInCards: 0,
      softDirection: 0,
      leftStretch: 0,
      rightStretch: 0,
    },
  ),
);

const paginationStyle = computed(() => ({
  "--_pagination-slot-size": `${COVERFLOW_PAGINATION_TUNING.slotSize}px`,
  "--_pagination-slot-gap": `${COVERFLOW_PAGINATION_TUNING.slotGap}px`,
  "--_pagination-indicator-width": `${COVERFLOW_PAGINATION_TUNING.restingWidth}px`,
  "--_pagination-indicator-height": `${COVERFLOW_PAGINATION_TUNING.height}px`,
  "--_pagination-indicator-x": `${paginationIndicator.value.x.toFixed(4)}px`,
  "--_pagination-indicator-scale-x": paginationIndicator.value.scaleX.toFixed(5),
}));

const keyboardTargetIndex = computed(() => {
  const semanticId = motion.targetId.value ?? motion.activeId.value ?? settledId.value;
  const index = ids.indexOf(semanticId);
  return index < 0 ? settledIndex.value : index;
});
const canGoPrevious = computed(() => keyboardTargetIndex.value > 0);
const canGoNext = computed(() => keyboardTargetIndex.value < ids.length - 1);

const diagnostics = computed<LabDiagnostics>(() => {
  const geometry = measureGeometry();
  const targetIndex = motion.targetId.value === undefined ? -1 : ids.indexOf(motion.targetId.value);
  return {
    ...(motion.activeId.value ? { activeId: motion.activeId.value } : {}),
    anchors: motion.snapshot.value.anchors,
    bounds: motion.snapshot.value.bounds,
    isAnimating: motion.isAnimating.value,
    phase: motion.phase.value,
    pointerOwned: motion.pointerOwned.value,
    position: motion.position.value,
    physicalIndex: rawPhysicalIndex.value,
    motionPitch: pitch.value,
    ownerIndex: stackedFrame.value.ownerIndex,
    pairFraction: stackedFrame.value.pairFraction,
    tuningProfile: stackedTuning.value.profile,
    visualIndex: visualIndex.value,
    settledIndex: settledIndex.value,
    ...(focusedPaginationIndex.value === null
      ? {}
      : { focusedPaginationIndex: focusedPaginationIndex.value }),
    indicatorX: paginationIndicator.value.x,
    indicatorScale: paginationIndicator.value.scaleX,
    keyboardTargetIndex: keyboardTargetIndex.value,
    maxAnchorSkip: props.settings.maxAnchorSkip,
    releaseVelocityCapActive:
      motion.phase.value === "settling" &&
      speedInCards.value >= COVERFLOW_MOTION_TUNING.maximumFreeVelocity - 0.05,
    reducedMotion: motion.reducedMotion.value,
    speedInCards: speedInCards.value,
    ...(motion.targetId.value ? { targetId: motion.targetId.value } : {}),
    ...(targetIndex < 0 ? {} : { targetIndex }),
    trackExtent: geometry.trackExtent,
    velocity: motion.velocity.value,
    viewportSize: geometry.viewportSize,
  };
});

function goToIndex(index: number): boolean {
  if (galleryOpen.value || motion.isDragging.value || motion.pointerOwned.value) return false;
  const targetIndex = clamp(index, 0, ids.length - 1);
  const id = ids[targetIndex];
  if (!id || targetIndex === keyboardTargetIndex.value) return false;
  motion.moveTo(id);
  return true;
}

function goToPrevious(): boolean {
  return goToIndex(resolveAdjacentCoverflowIndex(keyboardTargetIndex.value, -1, ids.length));
}

function goToNext(): boolean {
  return goToIndex(resolveAdjacentCoverflowIndex(keyboardTargetIndex.value, 1, ids.length));
}

function onCoverflowKeyDown(event: KeyboardEvent) {
  if (galleryOpen.value) return;
  const action = resolveCoverflowKeyboardAction(event);
  if (!action) return;

  event.preventDefault();
  if (action === "previous") {
    goToPrevious();
  } else if (action === "next") {
    goToNext();
  } else {
    goToIndex(action === "home" ? 0 : ids.length - 1);
  }
}

function synchronizeCarouselExactly(index: number): boolean {
  const targetIndex = clamp(index, 0, ids.length - 1);
  const id = ids[targetIndex];
  const anchorPosition = id ? anchorsById.value.get(id) : undefined;
  if (!id || anchorPosition === undefined) return false;
  const alreadySynchronized =
    motion.phase.value === "idle" &&
    motion.activeId.value === id &&
    motion.targetId.value === id &&
    Math.abs(motion.position.value - anchorPosition) <= Number.EPSILON * 16 &&
    Math.abs(motion.velocity.value) <= Number.EPSILON * 16 &&
    visualIndex.value === targetIndex &&
    settledIndex.value === targetIndex;
  if (alreadySynchronized) return true;

  motion.interrupt();
  suppressedCarouselAnnouncementIndex = targetIndex;
  motion.controller.remeasure({
    ...measureGeometry(),
    activeId: id,
  });
  visualIndex.value = targetIndex;
  settledIndex.value = targetIndex;
  pendingTargetIndex.value = null;
  return true;
}

function openGallery(index: number, capturedEligibility = false) {
  if (
    galleryOpen.value ||
    (!capturedEligibility && !isCardGalleryEligible(index)) ||
    !synchronizeCarouselExactly(index)
  ) {
    return;
  }
  galleryInitialIndex.value = index;
  galleryFinalIndex.value = index;
  galleryOpen.value = true;
}

function releaseMatchesOrigin(gesture: CarouselGesture, event: PointerEvent): boolean {
  const origin = gesture.originElement;
  if (!origin) return false;
  const releaseCard =
    event.target instanceof Element
      ? (event.target.closest<HTMLElement>(".coverflow-card") ?? undefined)
      : undefined;
  if (releaseCard) return releaseCard === origin;
  const documentTarget = origin.ownerDocument;
  const hitCards = documentTarget
    .elementsFromPoint(event.clientX, event.clientY)
    .map((element) => element.closest<HTMLElement>(".coverflow-card"))
    .filter((element): element is HTMLElement => element !== null);
  if (hitCards.some((element) => element === origin)) return true;
  if (hitCards.length > 0) return false;
  const rect = origin.getBoundingClientRect();
  return (
    event.clientX >= rect.left &&
    event.clientX <= rect.right &&
    event.clientY >= rect.top &&
    event.clientY <= rect.bottom
  );
}

function resolveCompletedCarouselGesture(completed: CarouselGesture, releasedOnOrigin: boolean) {
  const horizontalIntent =
    Math.abs(completed.deltaX) >=
    Math.abs(completed.deltaY) * COVERFLOW_GALLERY_TUNING.horizontalIntentRatio;
  const resolution = resolveCoverflowGesture({
    cancelled: completed.cancelled,
    crossedDragThreshold:
      completed.maximumDisplacement >= COVERFLOW_GALLERY_TUNING.carouselActivationThreshold,
    horizontalIntent,
    involvedMultiplePointers: completed.involvedMultiplePointers,
    openEligibleAtStart: completed.openEligibleAtStart,
    releasedOnOrigin,
  });
  if (resolution.action === "swipe") {
    const root = coverflowRoot.value;
    const activeElement = root?.ownerDocument.activeElement;
    if (
      resolution.shouldFocusStage &&
      completed.focusWasOutside &&
      root &&
      (!activeElement || !root.contains(activeElement))
    ) {
      viewport.value?.focus({ preventScroll: true });
    }
  } else if (resolution.action === "open" && completed.originIndex !== undefined) {
    openGallery(completed.originIndex, true);
  } else if (resolution.action === "select" && completed.originIndex !== undefined) {
    const originIndex = completed.originIndex;
    if (selectionFrame !== undefined) cancelAnimationFrame(selectionFrame);
    selectionFrame = requestAnimationFrame(() => {
      selectionFrame = undefined;
      goToIndex(originIndex);
    });
  }
}

function onCoverflowPointerDown(event: PointerEvent) {
  if (galleryOpen.value) return;
  if (carouselGesture && !activeCarouselPointers.has(event.pointerId)) {
    carouselGesture.involvedMultiplePointers = true;
    activeCarouselPointers.add(event.pointerId);
    motion.onPointerDown(event);
    return;
  }
  if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) {
    return;
  }

  const root = coverflowRoot.value;
  const activeElement = root?.ownerDocument.activeElement;
  const eventCard =
    event.target instanceof Element
      ? (event.target.closest<HTMLElement>(".coverflow-card") ?? undefined)
      : undefined;
  const originElement =
    eventCard ??
    root?.ownerDocument
      .elementsFromPoint(event.clientX, event.clientY)
      .map((element) => element.closest<HTMLElement>(".coverflow-card"))
      .find((element): element is HTMLElement => element !== null);
  const originIndex = originElement
    ? screens.findIndex((screen) => screen.id === originElement.dataset.screenId)
    : -1;
  carouselGesture = {
    focusWasOutside: Boolean(root && (!activeElement || !root.contains(activeElement))),
    openEligibleAtStart: originIndex >= 0 && isCardGalleryEligible(originIndex),
    originElement,
    originIndex: originIndex >= 0 ? originIndex : undefined,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    cancelled: false,
    deltaX: 0,
    deltaY: 0,
    involvedMultiplePointers: false,
    maximumDisplacement: 0,
  };
  activeCarouselPointers.add(event.pointerId);
  motion.onPointerDown(event);
}

function onCarouselPointerMove(event: PointerEvent) {
  const gesture = carouselGesture;
  if (!gesture || event.pointerId !== gesture.pointerId) return;
  gesture.deltaX = event.clientX - gesture.startX;
  gesture.deltaY = event.clientY - gesture.startY;
  gesture.maximumDisplacement = Math.max(
    gesture.maximumDisplacement,
    Math.hypot(gesture.deltaX, gesture.deltaY),
  );
}

function onCarouselPointerUp(event: PointerEvent) {
  activeCarouselPointers.delete(event.pointerId);
  const gesture = carouselGesture;
  if (!gesture || event.pointerId !== gesture.pointerId) return;
  gesture.deltaX = event.clientX - gesture.startX;
  gesture.deltaY = event.clientY - gesture.startY;
  gesture.maximumDisplacement = Math.max(
    gesture.maximumDisplacement,
    Math.hypot(gesture.deltaX, gesture.deltaY),
  );
  const releasedOnOrigin = releaseMatchesOrigin(gesture, event);
  carouselGesture = undefined;
  queueMicrotask(() => resolveCompletedCarouselGesture(gesture, releasedOnOrigin));
}

function onCarouselPointerCancel(event: PointerEvent) {
  activeCarouselPointers.delete(event.pointerId);
  const gesture = carouselGesture;
  if (!gesture || event.pointerId !== gesture.pointerId) return;
  gesture.cancelled = true;
  carouselGesture = undefined;
  queueMicrotask(() => resolveCompletedCarouselGesture(gesture, false));
}

function onCoverflowWheel(event: WheelEvent) {
  if (!galleryOpen.value) motion.onWheel(event);
}

function onGalleryRequestClose(finalIndex: number) {
  const synchronizedIndex = clamp(finalIndex, 0, ids.length - 1);
  galleryFinalIndex.value = synchronizedIndex;
  if (synchronizedIndex !== galleryInitialIndex.value) {
    synchronizeCarouselExactly(synchronizedIndex);
  }
  galleryOpen.value = false;
}

function onPaginationFocus(index: number) {
  focusedPaginationIndex.value = index;
}

function onPaginationBlur(index: number) {
  if (focusedPaginationIndex.value === index) {
    focusedPaginationIndex.value = null;
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
  () => [props.stageWidth, pitch.value, cardWidth.value] as const,
  () => void nextTick(motion.remeasure),
);

useEventListener("pointermove", onCarouselPointerMove, { passive: true });
useEventListener("pointerup", onCarouselPointerUp);
useEventListener("pointercancel", onCarouselPointerCancel);

onBeforeUnmount(() => {
  if (selectionFrame !== undefined) cancelAnimationFrame(selectionFrame);
});
</script>

<template>
  <section
    ref="coverflowRoot"
    aria-labelledby="stacked-deck-title"
    class="coverflow-demo stacked-deck-demo"
    @keydown="onCoverflowKeyDown"
  >
    <header class="coverflow-header">
      <div>
        <p class="eyebrow">Spatial carousel</p>
        <h3 id="stacked-deck-title">Stacked deck</h3>
        <p class="lede">
          One top screen remains authoritative while the next approaches beneath it and takes
          ownership only after reaching the visual center.
        </p>
      </div>
      <div class="coverflow-controls">
        <button
          aria-label="Previous screen"
          data-testid="stacked-deck-previous"
          :disabled="galleryOpen || !canGoPrevious"
          type="button"
          @click="goToPrevious"
        >
          <svg aria-hidden="true" height="18" viewBox="0 0 24 24" width="18">
            <path d="m15 5-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" />
          </svg>
        </button>
        <button
          aria-label="Next screen"
          data-testid="stacked-deck-next"
          :disabled="galleryOpen || !canGoNext"
          type="button"
          @click="goToNext"
        >
          <svg aria-hidden="true" height="18" viewBox="0 0 24 24" width="18">
            <path d="m9 5 7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" />
          </svg>
        </button>
      </div>
    </header>

    <div
      ref="viewport"
      aria-label="Product screen stacked deck"
      aria-roledescription="carousel"
      class="coverflow-viewport"
      data-testid="stacked-deck-viewport"
      :data-active-id="settledId"
      :data-card-width="cardWidth"
      :data-gallery-open="galleryOpen ? 'true' : 'false'"
      :data-keyboard-target-index="keyboardTargetIndex"
      :data-motion-pitch="pitch"
      :data-handoff-backward="stackedTuning.handoffBackward"
      :data-handoff-forward="stackedTuning.handoffForward"
      :data-owner-index="stackedFrame.ownerIndex"
      :data-pair-fraction="stackedFrame.pairFraction"
      :data-pair-start-index="stackedFrame.pairStartIndex"
      :data-pending-index="pendingTargetIndex"
      :data-phase="motion.phase.value"
      :data-physical-index="rawPhysicalIndex"
      :data-position="motion.position.value"
      :data-profile="stackedTuning.profile"
      :data-settled-index="settledIndex"
      :data-speed-in-cards="speedInCards"
      :data-target-id="motion.targetId.value"
      :data-visual-id="visualId"
      :data-visual-index="visualIndex"
      :style="[stageStyle, motion.surfaceStyle]"
      tabindex="0"
      @pointerdown="onCoverflowPointerDown"
      @wheel="onCoverflowWheel"
    >
      <div ref="track" class="coverflow-stage stacked-deck-stage">
        <article
          v-for="(screen, index) in screens"
          :key="screen.id"
          :aria-current="screen.id === visualId ? 'true' : undefined"
          :aria-hidden="slideStyles[screen.id]?.visibility === 'hidden' ? 'true' : undefined"
          :aria-label="`${screen.title}, ${index + 1} of ${screens.length}`"
          aria-roledescription="slide"
          class="coverflow-card stacked-deck-card"
          :class="[
            `tone-${screen.tone}`,
            `layout-${screen.layout}`,
            {
              active: screen.id === visualId,
              inspectable: isCardGalleryEligible(index),
            },
          ]"
          :data-interactive="stackedPose(index)?.interactive"
          :data-layer="stackedPose(index)?.layer"
          :data-projected-scale="stackedPose(index)?.projectedScale"
          :data-role="stackedPose(index)?.role"
          :data-rotate-y="stackedPose(index)?.rotateY"
          :data-screen-id="screen.id"
          :data-shadow-strength="stackedPose(index)?.shadowStrength"
          :data-translate-x="stackedPose(index)?.translateX"
          :data-veil="stackedPose(index)?.veil"
          :data-virtual-z="stackedPose(index)?.virtualZ"
          :data-visible="stackedPose(index)?.visible"
          :style="slideStyles[screen.id]"
          @click.prevent
        >
          <div class="screen-chrome">
            <img
              alt=""
              aria-hidden="true"
              class="stacked-screen-image"
              draggable="false"
              :height="screen.height"
              :src="screen.previewSrc"
              :width="screen.width"
            />
          </div>
        </article>
      </div>
    </div>

    <div class="coverflow-meta">
      <p>
        <span class="tabular" data-testid="stacked-deck-counter">{{ visualIndex + 1 }}</span>
        /
        <span class="tabular">{{ screens.length }}</span>
        <strong data-testid="stacked-deck-caption">{{ visualScreen.title }}</strong>
      </p>
      <button
        ref="inspectControl"
        :aria-label="`Inspect ${settledScreen.title} in screen gallery, ${settledIndex + 1} of ${screens.length}`"
        class="coverflow-inspect"
        data-testid="stacked-deck-inspect"
        :disabled="!isCardGalleryEligible(settledIndex)"
        type="button"
        @click="openGallery(settledIndex)"
      >
        <svg aria-hidden="true" height="20" viewBox="0 0 24 24" width="20">
          <path
            d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"
            fill="none"
            stroke="currentColor"
            stroke-linecap="square"
            stroke-width="2"
          />
        </svg>
        <span>Inspect screen</span>
      </button>
      <div
        aria-label="Stacked deck screens"
        class="dots"
        :data-focused-index="focusedPaginationIndex"
        :style="paginationStyle"
        role="group"
      >
        <span
          aria-hidden="true"
          class="coverflow-pagination-indicator"
          :data-position="paginationIndicator.position.toFixed(5)"
          :data-scale-x="paginationIndicator.scaleX.toFixed(5)"
          :data-soft-direction="paginationIndicator.softDirection.toFixed(5)"
          :data-stretch-ratio="paginationIndicator.stretchRatio.toFixed(5)"
          data-testid="stacked-deck-pagination-indicator"
        />
        <button
          v-for="(dot, index) in paginationDots"
          :key="dot.id"
          :aria-current="dot.current ? 'true' : undefined"
          :aria-label="`${dot.title}, ${index + 1} of ${screens.length}`"
          class="dot"
          :disabled="galleryOpen"
          type="button"
          @blur="onPaginationBlur(index)"
          @click="goToIndex(index)"
          @focus="onPaginationFocus(index)"
        >
          <span aria-hidden="true" class="dot-indicator" />
        </button>
      </div>
    </div>

    <p class="sr-only" aria-atomic="true" data-testid="stacked-deck-status" role="status">
      {{ liveMessage }}
    </p>
    <DiagnosticsPanel :diagnostics="diagnostics" />
    <MediaGalleryDialog
      v-model:open="galleryOpen"
      eyebrow="Screen inspection"
      :focus-return="galleryFocusReturn"
      :initial-index="galleryOpen ? galleryInitialIndex : settledIndex"
      :items="screens"
      :reduced-motion-override="motion.reducedMotion.value"
      title="Screen gallery"
      @request-close="onGalleryRequestClose"
    />
  </section>
</template>

<style scoped>
.coverflow-demo {
  display: grid;
  gap: 1rem;
  min-inline-size: 0;
}

.coverflow-demo :deep(.snap-motion-media-gallery) {
  --snap-motion-gallery-surface: #11161f;
  --snap-motion-gallery-canvas: #090d13;
  --snap-motion-gallery-text: #eef2f7;
  --snap-motion-gallery-muted: #aab4c2;
  --snap-motion-gallery-line: rgb(255 255 255 / 0.14);
  --snap-motion-gallery-control-surface: #202936;
  --snap-motion-gallery-control-border: rgb(255 255 255 / 0.24);
  --snap-motion-gallery-control-hover-surface: #2a3545;
  --snap-motion-gallery-disabled-surface: #171e29;
  --snap-motion-gallery-disabled-text: #667286;
  --snap-motion-gallery-focus: #73b3ff;
  --snap-motion-gallery-backdrop: rgb(3 7 18 / 0.92);
  --snap-motion-gallery-chrome-surface: #151b25;
  --snap-motion-gallery-radius: 1rem;
}

.coverflow-header {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 1rem;
}

.coverflow-header .eyebrow,
.coverflow-meta p {
  margin: 0;
}

.coverflow-header .eyebrow {
  color: var(--muted);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.coverflow-header h3 {
  margin: 0.2rem 0 0.35rem;
  font-size: 1.35rem;
}

.lede {
  margin: 0;
  color: var(--muted);
  max-inline-size: 40rem;
  line-height: 1.45;
}

.coverflow-controls {
  display: inline-flex;
  gap: 0.5rem;
}

.coverflow-controls button,
.dot {
  display: inline-grid;
  place-items: center;
  min-inline-size: 2.75rem;
  min-block-size: 2.75rem;
  border-radius: 999px;
}

.coverflow-viewport {
  position: relative;
  inline-size: min(100%, var(--coverflow-stage-width));
  min-block-size: calc(var(--coverflow-card-height) + 7rem);
  margin-inline: auto;
  border-radius: 1.5rem;
  background: linear-gradient(180deg, #eef2f7 0%, #e5ebf3 100%);
  overflow: hidden;
  /* One camera for the whole stage. Every panel receives only its own rigid transform. */
  perspective: 900px;
  perspective-origin: 50% 46%;
  touch-action: pan-y;
  user-select: none;
  cursor: grab;
}

.coverflow-viewport:active {
  cursor: grabbing;
}

.coverflow-viewport::before {
  content: "";
  position: absolute;
  inset-inline-start: 50%;
  inset-block-end: 2.15rem;
  inline-size: min(64%, 38rem);
  block-size: 5.25rem;
  transform: translateX(-50%);
  border-radius: 50%;
  background: radial-gradient(
    ellipse at center,
    rgb(15 23 42 / 0.13) 0%,
    rgb(15 23 42 / 0.055) 42%,
    rgb(15 23 42 / 0) 74%
  );
  pointer-events: none;
}

.coverflow-stage {
  position: relative;
  z-index: 1;
  inline-size: 100%;
  block-size: calc(var(--coverflow-card-height) + 7rem);
  transform-style: preserve-3d;
}

.coverflow-card {
  --depth: 0;
  --deep-rail: 0;
  --center-influence: 1;
  --kinetic-focus: 0;
  --settledness: 1;
  --contact-shadow: 1;
  --yaw: 0;
  --sheen: 0;
  --surface-shade: 0;
  --sheen-angle: 100deg;
  --occlusion: 0;
  --occlusion-angle: 90deg;
  --edge-offset: 0px;
  --edge-near: #d4dbe4;
  --edge-deep: #b9c2ce;
  --edge-face: var(--edge-near);
  --surface-darken: 0.06;
  --surface-highlight: 0.03;

  position: absolute;
  inset-block-start: 50%;
  inset-inline-start: 50%;
  inline-size: var(--coverflow-card-width);
  block-size: var(--coverflow-card-height);
  margin: 0;
  border: 0;
  padding: 0;
  background: transparent;
  transform-style: preserve-3d;
  transform-origin: center center;
  will-change: transform;
  cursor: pointer;
}

.tone-ink {
  --edge-near: #536174;
  --edge-deep: #414d5e;
  --surface-darken: 0.035;
  --surface-highlight: 0.025;
}

.screen-chrome {
  position: relative;
  inline-size: 100%;
  block-size: 100%;
  border: 1px solid rgb(15 23 42 / 0.14);
  border-radius: 1.15rem;
  overflow: hidden;
  background: #fff;
  /*
   * The first layer is the rounded side surface. The second is a fixed-geometry contact shadow
   * whose opacity is earned by center proximity and settledness. The final narrow, yaw-directed
   * layer supplies local occlusion where the foreground panel overlaps the rail behind it.
   */
  box-shadow:
    var(--edge-offset) 0 0 0 var(--edge-face),
    0 9px 20px -9px rgb(15 23 42 / calc(0.32 * var(--contact-shadow))),
    calc(var(--yaw) * -8px) 1px 10px -5px rgb(15 23 42 / calc(0.22 * var(--occlusion)));
  color: #0f172a;
}

/* Matte incident light, a ten-pixel overlap edge, and a weak neutral deep-rail tint. */
.screen-chrome::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image:
    linear-gradient(
      var(--occlusion-angle),
      rgb(2 6 23 / calc(0.16 * var(--occlusion))),
      rgb(2 6 23 / 0) 10px
    ),
    linear-gradient(
      var(--sheen-angle),
      rgb(255 255 255 / calc(var(--surface-highlight) * var(--sheen))),
      rgb(255 255 255 / 0) 28%,
      rgb(2 6 23 / calc(var(--surface-darken) * var(--surface-shade)))
    ),
    linear-gradient(
      rgb(100 116 139 / calc(0.025 * var(--deep-rail))),
      rgb(100 116 139 / calc(0.025 * var(--deep-rail)))
    );
}

.tone-mist .screen-chrome {
  background: #f8fafc;
}

.tone-ink .screen-chrome {
  background: #0f172a;
  color: #e2e8f0;
  border-color: rgb(255 255 255 / 0.08);
}

.stacked-deck-demo .coverflow-viewport {
  background:
    radial-gradient(circle at 50% 28%, rgb(255 255 255 / 0.92), transparent 56%),
    linear-gradient(180deg, #f1f4f8 0%, #e7ecf2 100%);
  perspective: none;
}

.stacked-deck-demo .coverflow-viewport::before {
  inset-block-end: 1.1rem;
  inline-size: min(72%, 46rem);
  block-size: 4.5rem;
  background: radial-gradient(
    ellipse at center,
    rgb(15 23 42 / 0.16) 0%,
    rgb(15 23 42 / 0.06) 46%,
    rgb(15 23 42 / 0) 74%
  );
}

.stacked-deck-stage,
.stacked-deck-card {
  transform-style: flat;
}

.stacked-deck-card {
  --deck-edge-offset: 0px;
  --deck-occlusion-angle: 90deg;
  --deck-rotate-y: 0deg;
  --deck-shadow-strength: 1;
  --deck-veil: 0;
}

.stacked-deck-card .screen-chrome {
  border-color: rgb(15 23 42 / 0.16);
  border-radius: 0.8rem;
  background: #fff;
  box-shadow:
    var(--deck-edge-offset) 0 0 1px rgb(100 116 139 / 0.5),
    0 18px 38px -18px rgb(15 23 42 / calc(0.38 * var(--deck-shadow-strength))),
    0 4px 10px -6px rgb(15 23 42 / calc(0.32 * var(--deck-shadow-strength)));
  filter: none;
  transform: perspective(1100px) rotateY(var(--deck-rotate-y));
  transform-origin: center;
}

.stacked-deck-card[data-role="foreground"] .screen-chrome {
  border-color: rgb(15 23 42 / 0.23);
}

.stacked-deck-card[data-role="incoming"] .screen-chrome,
.stacked-deck-card[data-role="outgoing"] .screen-chrome,
.stacked-deck-card[data-role="rear"] .screen-chrome {
  border-color: rgb(71 85 105 / 0.16);
}

.stacked-deck-card .screen-chrome::after {
  background-image:
    linear-gradient(
      var(--deck-occlusion-angle),
      rgb(15 23 42 / calc(0.12 * var(--deck-veil))),
      rgb(15 23 42 / 0) 8%,
      rgb(255 255 255 / calc(0.1 * var(--deck-veil))) 72%,
      rgb(255 255 255 / 0) 100%
    ),
    linear-gradient(
      rgb(226 232 240 / var(--deck-veil)),
      rgb(241 245 249 / calc(0.78 * var(--deck-veil)))
    );
}

.stacked-screen-image {
  display: block;
  inline-size: 100%;
  block-size: 100%;
  object-fit: cover;
  pointer-events: none;
}

.coverflow-meta,
.dots {
  display: flex;
}

.coverflow-meta {
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.coverflow-meta p {
  display: flex;
  flex: 1 1 auto;
  align-items: baseline;
  gap: 0.35rem;
  min-inline-size: 0;
  color: var(--muted);
  font-size: 0.9rem;
}

.coverflow-inspect {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  gap: 0.55rem;
  min-inline-size: 2.75rem;
  min-block-size: 2.75rem;
  padding: 0.55rem 0.85rem;
  border: 1px solid color-mix(in srgb, var(--ink) 24%, transparent);
  border-radius: 0.65rem;
  background: transparent;
  color: var(--ink);
  font: inherit;
  font-size: 0.85rem;
  font-weight: 650;
}

.coverflow-inspect:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--ink) 42%, transparent);
  background: color-mix(in srgb, var(--ink) 5%, transparent);
}

.coverflow-inspect:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.coverflow-inspect:disabled {
  cursor: default;
  opacity: 0.42;
}

.coverflow-meta strong {
  color: var(--ink);
  font-size: 1rem;
}

.dots {
  --_pagination-slot-size: 44px;
  --_pagination-slot-gap: 2px;
  --_pagination-indicator-width: 22.4px;
  --_pagination-indicator-height: 8.8px;
  --_pagination-indicator-x: 0px;
  --_pagination-indicator-scale-x: 1;

  position: relative;
  display: flex;
  align-items: center;
  gap: var(--_pagination-slot-gap);
  isolation: isolate;
}

.dot {
  position: relative;
  display: grid;
  inline-size: var(--_pagination-slot-size);
  block-size: var(--_pagination-slot-size);
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 0.5rem;
  background: transparent;
}

.dot:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.coverflow-pagination-indicator {
  position: absolute;
  z-index: 1;
  inset-block-start: 50%;
  inset-inline-start: calc((var(--_pagination-slot-size) - var(--_pagination-indicator-width)) / 2);
  inline-size: var(--_pagination-indicator-width);
  block-size: var(--_pagination-indicator-height);
  border-radius: 999px;
  background: var(--ink);
  pointer-events: none;
  transform: translate3d(var(--_pagination-indicator-x), -50%, 0)
    scaleX(var(--_pagination-indicator-scale-x));
  transform-origin: center;
  transition: none;
  will-change: transform;
}

.dot-indicator {
  inline-size: var(--_pagination-indicator-height);
  min-inline-size: var(--_pagination-indicator-height);
  block-size: var(--_pagination-indicator-height);
  min-block-size: var(--_pagination-indicator-height);
  border-radius: 999px;
  background: #c9d2de;
  pointer-events: none;
  transition: none;
}

@media (max-width: 48rem) {
  .coverflow-header {
    align-items: start;
    flex-direction: column;
  }

  .coverflow-meta {
    flex-wrap: wrap;
  }

  .coverflow-meta p {
    flex-basis: calc(100% - 4.5rem);
  }

  .coverflow-inspect span {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
}
</style>
