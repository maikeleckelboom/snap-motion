<script setup lang="ts">
import {
  createCoverflowGeometry,
  createStackedCoverflowFrame,
  resolveCoverflowPresentation,
  resolveCoverflowProgress,
  resolveStackedCoverflowFrame,
  resolveStackedCoverflowTuning,
} from "@snap-motion/core";
import { useCarouselMotion } from "@snap-motion/vue/carousel";
import {
  MediaGalleryDialog,
  type FocusReturnOptions,
  type MediaGalleryItem,
} from "@snap-motion/vue/media-gallery";
import { useElementSize, useEventListener } from "@vueuse/core";
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";

import mapGalleryUrl from "@/assets/coverflow-gallery/map.svg?url";
import projectGalleryUrl from "@/assets/coverflow-gallery/project.svg?url";
import settingsGalleryUrl from "@/assets/coverflow-gallery/settings.svg?url";
import teamGalleryUrl from "@/assets/coverflow-gallery/team.svg?url";
import templatesGalleryUrl from "@/assets/coverflow-gallery/templates.svg?url";
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
  resolveCoverflowKinetics,
  resolveCoverflowPaginationIndicator,
  resolveCoverflowVisualIndex,
  resolveSpeedInCards,
  useBoundedCoverflowDriver,
  type CoverflowKineticState,
  type CoverflowPaginationIndicatorState,
} from "./coverflowMotion";

type ScreenId = "templates" | "project" | "map" | "team" | "settings";

/**
 * Each screen gets a different skeleton. Identical wireframes at identical heights fuse across
 * an overlap however correct the geometry is: the rows line up, and the eye reads one continuous
 * surface instead of two panels.
 */
type ScreenLayout = "gallery" | "detail" | "canvas" | "roster" | "console";

interface ShowcaseScreen extends MediaGalleryItem {
  readonly id: ScreenId;
  readonly accent: string;
  readonly eyebrow: string;
  readonly layout: ScreenLayout;
  readonly tone: "light" | "mist" | "ink";
}

const props = defineProps<{
  presentation?: "coverflow" | "stacked-deck";
  reducedMotionOverride: boolean | undefined;
  settings: LabPhysicsSettings;
  stageWidth: number;
}>();

const isStackedDeck = computed(() => props.presentation === "stacked-deck");
const surfaceId = computed(() => (isStackedDeck.value ? "stacked-deck" : "coverflow"));
const surfaceTitle = computed(() => (isStackedDeck.value ? "Stacked deck" : "Coverflow stack"));
const surfaceDescription = computed(() =>
  isStackedDeck.value
    ? "Large screens rest closely behind the current screen. A bounded passing lane reveals the foreground handoff without introducing a second motion authority."
    : "Center face stays solid. Neighbors park in left/right rails with real perspective. Drag and spring still own one scalar position.",
);

function testId(suffix: string): string {
  return `${surfaceId.value}-${suffix}`;
}

const screens: readonly ShowcaseScreen[] = [
  {
    id: "templates",
    title: "Projectsjablonen",
    eyebrow: "Yoot Portaal",
    accent: "#2f6fed",
    tone: "light",
    layout: "gallery",
    alt: "Projects template gallery with a featured project structure and six template cards.",
    previewSrc: `${templatesGalleryUrl}?thumbnail`,
    fullSrc: `${templatesGalleryUrl}?full`,
    width: 1_600,
    height: 1_000,
  },
  {
    id: "project",
    title: "Project 24031 — Horizon",
    eyebrow: "Projectdetail",
    accent: "#1f9d7a",
    tone: "mist",
    layout: "detail",
    alt: "Project Horizon detail screen with project settings, status rows, and progress.",
    previewSrc: `${projectGalleryUrl}?thumbnail`,
    fullSrc: `${projectGalleryUrl}?full`,
    width: 1_600,
    height: 1_000,
  },
  {
    id: "map",
    title: "Locatie & planning",
    eyebrow: "Kaartweergave",
    accent: "#d9480f",
    tone: "light",
    layout: "canvas",
    alt: "Location and planning screen with a map, route lines, and a selected location.",
    previewSrc: `${mapGalleryUrl}?thumbnail`,
    fullSrc: `${mapGalleryUrl}?full`,
    width: 1_600,
    height: 1_000,
  },
  {
    id: "team",
    title: "Team & rollen",
    eyebrow: "Organisatie",
    accent: "#7048e8",
    tone: "mist",
    layout: "roster",
    alt: "Team and roles screen with six member cards arranged in a roster.",
    previewSrc: `${teamGalleryUrl}?thumbnail`,
    fullSrc: `${teamGalleryUrl}?full`,
    width: 1_600,
    height: 1_000,
  },
  {
    id: "settings",
    title: "Werkruimte-instellingen",
    eyebrow: "Beheer",
    accent: "#0b7285",
    tone: "ink",
    layout: "console",
    alt: "Dark workspace settings screen with four administrative setting rows.",
    previewSrc: `${settingsGalleryUrl}?thumbnail`,
    fullSrc: `${settingsGalleryUrl}?full`,
    width: 1_600,
    height: 1_000,
  },
];

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
  resolveStackedCoverflowTuning({
    stageWidth: stageWidthPx.value,
    stageHeight: stageHeightPx.value,
  }),
);
const reducedStackedTuning = computed(() =>
  resolveStackedCoverflowTuning({
    stageWidth: stageWidthPx.value,
    stageHeight: stageHeightPx.value,
    reducedMotion: true,
  }),
);

const cardWidth = computed(() =>
  isStackedDeck.value
    ? stackedTuning.value.cardWidth
    : Math.round(clamp(stageWidthPx.value * 0.4, 280, 420)),
);
const cardHeight = computed(() =>
  isStackedDeck.value ? stackedTuning.value.cardHeight : Math.round(cardWidth.value * 0.7),
);

/**
 * X of the first side slot, and so the gap between the crossing pair for the whole step.
 *
 * This has to clear a *foreshortened* card, not a flat one. Set below that and the panels tile
 * the stage edge to edge — each one ending exactly where the next begins, with no background
 * between them — which reads as a concertina no matter how the individual panels are shaded.
 * Above it the focused face sits in a clearing and the two crossing panels never touch at all,
 * so there is no seam to misread.
 */
const sidePeakX = computed(() => Math.round(cardWidth.value * 0.8));

/** Gap between parked cards, measured the way a stack of records is: along their shared normal. */
const stackGap = computed(() => Math.round(cardWidth.value * 0.34));

/** Pitch equals the rail travel, so a drag of N px moves the focused card exactly N px. */
const pitch = computed(() =>
  isStackedDeck.value ? stackedTuning.value.motionPitch : sidePeakX.value,
);

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
const runtimePhysicalIndex = computed(() =>
  isStackedDeck.value ? rawPhysicalIndex.value : physicalIndex.value,
);
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

/** How thick a panel is, in CSS pixels. Read as a side surface once the panel turns. */
const EDGE_THICKNESS = 1.5;

/**
 * Ceiling on the in-plane offset. `tan` runs away as a panel approaches broadside, and past
 * this point the side surface is wider than anything a screen this thin should show.
 */
const MAX_EDGE_OFFSET = 8;

/** Camera distance. Must match the stage's `perspective`, or the rails project wrong. */
const STAGE_PERSPECTIVE = 900;

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

const kineticState: CoverflowKineticState = {
  speedInCards: 0,
  centerInfluence: 1,
  kinetic: 0,
  kineticFocus: 0,
  settledness: 1,
  scaleLoss: 0,
  recess: 0,
  retainedYaw: 0,
  contactShadowStrength: 1,
};

const stackedFrameOutput = createStackedCoverflowFrame(ids.length);
const stackedFrame = computed(() => {
  const tuning = motion.reducedMotion.value ? reducedStackedTuning.value : stackedTuning.value;
  return resolveStackedCoverflowFrame(
    {
      itemCount: ids.length,
      physicalIndex: rawPhysicalIndex.value,
      tuning,
    },
    stackedFrameOutput,
  );
});

function stackedPose(index: number) {
  return isStackedDeck.value ? stackedFrame.value.poses[index] : undefined;
}

const slideStyles = computed(() => {
  const reduced = motion.reducedMotion.value;
  const position = motion.position.value;
  const velocity = motion.velocity.value;
  const currentPitch = pitch.value;
  const styles = {} as Record<ScreenId, SlideStyle>;

  if (isStackedDeck.value) {
    const frame = stackedFrame.value;
    const tuning = motion.reducedMotion.value ? reducedStackedTuning.value : stackedTuning.value;
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
        "--deck-blur": `${pose.blur.toFixed(3)}px`,
        "--deck-edge-offset": `${(Math.sign(pose.rotateY) * -1.5).toFixed(3)}px`,
        "--deck-occlusion-angle": pose.translateX < 0 ? "90deg" : "270deg",
        "--deck-rotate-y": `${pose.rotateY.toFixed(3)}deg`,
        "--deck-shadow-strength": clamp(
          1 - Math.abs(index - frame.physicalIndex) * 0.12,
          0.55,
          1,
        ).toFixed(4),
        "--deck-veil": pose.veil.toFixed(4),
      };
    }
    return styles;
  }

  for (const screen of screens) {
    const anchorPosition = anchorsById.value.get(screen.id) ?? 0;
    const progress = resolveCoverflowProgress({
      anchorPosition,
      pitch: currentPitch,
      position,
    });
    const presentation = resolveCoverflowPresentation({
      progress,
      reducedMotion: reduced,
      sidePeakX: sidePeakX.value,
      perspective: STAGE_PERSPECTIVE,
      // Steep enough that a parked card foreshortens to a narrow sliver. A shallow wall keeps
      // every panel nearly full width, which is what lets them tile edge to edge.
      maxRotateY: 62,
      // Parked cards are a stack of parallel panels, so they share one angle and one spacing.
      stackGapRotateY: 0,
      stackGap: stackGap.value,
      sideDepth: -300,
      sideScale: 1,
      stackGapScale: 0,
      sideOpacity: 1,
      hideAfter: 3.05,
    });

    resolveCoverflowKinetics(progress, velocity, currentPitch, kineticState);
    const correctedRotateY = presentation.rotateY + kineticState.retainedYaw;
    const correctedScale = presentation.scale - kineticState.scaleLoss;
    const correctedTranslateZ = presentation.translateZ - kineticState.recess;
    const correctedYaw = correctedRotateY / 62;
    const correctedEdgeStrength = Math.abs(Math.sin((correctedRotateY * Math.PI) / 180));
    const correctedEdgeSide = correctedRotateY < 0 ? 1 : correctedRotateY > 0 ? -1 : 0;

    // Material cues are read off the panel's orientation, not off raw gesture progress.
    const depth = clamp(presentation.depth, 0, 1);
    const deepRail = clamp((presentation.depth - 1) / 2.05, 0, 1);
    const sheen = clamp(Math.abs(correctedYaw), 0, 1);
    const facesLeft = correctedEdgeSide < 0;
    // Signed so the side surface lands on whichever edge the yaw has turned toward the camera.
    const edgeOffset = clamp(
      -Math.tan((correctedRotateY * Math.PI) / 180) * EDGE_THICKNESS,
      -MAX_EDGE_OFFSET,
      MAX_EDGE_OFFSET,
    );

    styles[screen.id] = {
      opacity: 1,
      transform: reduced
        ? `translate3d(-50%, -50%, 0) translate3d(${presentation.translateX.toFixed(3)}px, 0, 0) scale(${correctedScale.toFixed(4)})`
        : `translate3d(-50%, -50%, 0) translate3d(${presentation.translateX.toFixed(3)}px, 0, ${correctedTranslateZ.toFixed(3)}px) rotateY(${correctedRotateY.toFixed(3)}deg) scale(${correctedScale.toFixed(4)})`,
      zIndex: presentation.zIndex,
      visibility: presentation.visible ? "visible" : "hidden",
      pointerEvents: presentation.visible && Math.abs(progress) < 1.2 ? "auto" : "none",
      "--screen-accent": screen.accent,
      "--depth": depth.toFixed(4),
      "--deep-rail": deepRail.toFixed(4),
      "--center-influence": kineticState.centerInfluence.toFixed(4),
      "--kinetic-focus": kineticState.kineticFocus.toFixed(4),
      "--settledness": kineticState.settledness.toFixed(4),
      "--contact-shadow": kineticState.contactShadowStrength.toFixed(4),
      // Signed yaw throws the cast shadow off the panel's near edge, onto whatever is behind it.
      "--yaw": correctedYaw.toFixed(4),
      "--sheen": sheen.toFixed(4),
      "--surface-shade": clamp(sheen * 0.72 + deepRail * 0.28, 0, 1).toFixed(4),
      // The gradient reverses with yaw so it reads as incident light, not gloss.
      "--sheen-angle": facesLeft ? "100deg" : "260deg",
      // Darken the edge that the neighbouring panel passes in front of.
      "--occlusion-angle": presentation.progress > 0 ? "90deg" : "270deg",
      "--occlusion": (
        clamp(1 - Math.abs(progress), 0, 1) *
        (0.32 + 0.68 * sheen) *
        (1 - kineticState.kineticFocus * 0.25)
      ).toFixed(4),
      "--edge-offset": `${edgeOffset.toFixed(3)}px`,
      // A side surface catches less light the more obliquely it is seen.
      "--edge-face": correctedEdgeStrength > 0.5 ? "var(--edge-deep)" : "var(--edge-near)",
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
  const currentPitch = Math.max(1, pitch.value);
  const foregroundProgress = physicalIndex.value - Math.round(physicalIndex.value);
  const targetIndex = motion.targetId.value === undefined ? -1 : ids.indexOf(motion.targetId.value);
  resolveCoverflowKinetics(foregroundProgress, motion.velocity.value, currentPitch, kineticState);
  return {
    ...(motion.activeId.value ? { activeId: motion.activeId.value } : {}),
    anchors: motion.snapshot.value.anchors,
    bounds: motion.snapshot.value.bounds,
    isAnimating: motion.isAnimating.value,
    phase: motion.phase.value,
    pointerOwned: motion.pointerOwned.value,
    position: motion.position.value,
    physicalIndex: runtimePhysicalIndex.value,
    motionPitch: pitch.value,
    ...(isStackedDeck.value
      ? {
          ownerIndex: stackedFrame.value.ownerIndex,
          pairFraction: stackedFrame.value.pairFraction,
          passingLane: stackedFrame.value.passingLane,
          tuningProfile: stackedTuning.value.profile,
        }
      : {}),
    visualIndex: visualIndex.value,
    settledIndex: settledIndex.value,
    ...(focusedPaginationIndex.value === null
      ? {}
      : { focusedPaginationIndex: focusedPaginationIndex.value }),
    indicatorX: paginationIndicator.value.x,
    indicatorScale: paginationIndicator.value.scaleX,
    keyboardTargetIndex: keyboardTargetIndex.value,
    centerInfluence: kineticState.centerInfluence,
    kineticFocus: kineticState.kineticFocus,
    maxAnchorSkip: props.settings.maxAnchorSkip,
    releaseVelocityCapActive:
      motion.phase.value === "settling" &&
      kineticState.speedInCards >= COVERFLOW_MOTION_TUNING.maximumFreeVelocity - 0.05,
    reducedMotion: motion.reducedMotion.value,
    settledness: kineticState.settledness,
    speedInCards: kineticState.speedInCards,
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
    class="coverflow-demo"
    :class="{ 'stacked-deck-demo': isStackedDeck }"
    :aria-labelledby="`${surfaceId}-title`"
    @keydown="onCoverflowKeyDown"
  >
    <header class="coverflow-header">
      <div>
        <p class="eyebrow">Spatial carousel</p>
        <h3 :id="`${surfaceId}-title`">{{ surfaceTitle }}</h3>
        <p class="lede">{{ surfaceDescription }}</p>
      </div>
      <div class="coverflow-controls">
        <button
          aria-label="Previous screen"
          :data-testid="testId('previous')"
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
          :data-testid="testId('next')"
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
      :aria-label="isStackedDeck ? 'Product screen stacked deck' : 'Product screen coverflow'"
      aria-roledescription="carousel"
      class="coverflow-viewport"
      :data-testid="testId('viewport')"
      :data-active-id="settledId"
      :data-card-width="cardWidth"
      :data-gallery-open="galleryOpen ? 'true' : 'false'"
      :data-keyboard-target-index="keyboardTargetIndex"
      :data-motion-pitch="pitch"
      :data-owner-index="isStackedDeck ? stackedFrame.ownerIndex : undefined"
      :data-pair-fraction="isStackedDeck ? stackedFrame.pairFraction : undefined"
      :data-pending-index="pendingTargetIndex"
      :data-passing-lane="isStackedDeck ? stackedFrame.passingLane : undefined"
      :data-phase="motion.phase.value"
      :data-physical-index="runtimePhysicalIndex"
      :data-position="motion.position.value"
      :data-profile="isStackedDeck ? stackedTuning.profile : undefined"
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
      <div ref="track" class="coverflow-stage" :class="{ 'stacked-deck-stage': isStackedDeck }">
        <article
          v-for="(screen, index) in screens"
          :key="screen.id"
          :aria-current="screen.id === visualId ? 'true' : undefined"
          :aria-hidden="slideStyles[screen.id]?.visibility === 'hidden' ? 'true' : undefined"
          :aria-label="`${screen.title}, ${index + 1} of ${screens.length}`"
          aria-roledescription="slide"
          class="coverflow-card"
          :class="[
            `tone-${screen.tone}`,
            `layout-${screen.layout}`,
            {
              active: screen.id === visualId,
              inspectable: isCardGalleryEligible(index),
              'stacked-deck-card': isStackedDeck,
            },
          ]"
          :data-interactive="stackedPose(index)?.interactive"
          :data-layer="stackedPose(index)?.layer"
          :data-projected-scale="stackedPose(index)?.projectedScale"
          :data-rotate-y="stackedPose(index)?.rotateY"
          :data-screen-id="screen.id"
          :data-translate-x="stackedPose(index)?.translateX"
          :data-veil="stackedPose(index)?.veil"
          :data-visible="stackedPose(index)?.visible"
          :style="slideStyles[screen.id]"
          @click.prevent
        >
          <div class="screen-chrome">
            <img
              v-if="isStackedDeck"
              alt=""
              aria-hidden="true"
              class="stacked-screen-image"
              draggable="false"
              :height="screen.height"
              :src="screen.previewSrc"
              :width="screen.width"
            />
            <template v-else>
              <header class="screen-top">
                <div class="brand-row">
                  <span class="brand-mark">Y</span>
                  <div>
                    <p>{{ screen.eyebrow }}</p>
                    <strong>{{ screen.title }}</strong>
                  </div>
                </div>
                <div class="chrome-actions" aria-hidden="true">
                  <span />
                  <span />
                  <span class="avatar">MV</span>
                </div>
              </header>

              <div class="screen-body">
                <aside class="screen-nav" aria-hidden="true">
                  <span class="nav-pill" />
                  <span />
                  <span />
                  <span class="active-nav" />
                  <span />
                  <span />
                </aside>

                <div class="screen-main">
                  <div class="toolbar" aria-hidden="true">
                    <span class="search" />
                    <span class="chip" />
                    <span class="chip" />
                    <span class="cta" />
                  </div>

                  <div class="feature-card" aria-hidden="true">
                    <span class="feature-icon" />
                    <div>
                      <strong>Yoot Project Structuur V2.1</strong>
                      <p>Standaard projectstructuur met complete documentatie.</p>
                    </div>
                    <span class="ghost-btn">Bekijken</span>
                  </div>

                  <div class="card-grid" aria-hidden="true">
                    <span v-for="slot in 6" :key="slot" class="mini-card">
                      <i />
                      <b />
                      <em />
                    </span>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </article>
      </div>
    </div>

    <div class="coverflow-meta">
      <p>
        <span class="tabular" :data-testid="testId('counter')">{{ visualIndex + 1 }}</span>
        /
        <span class="tabular">{{ screens.length }}</span>
        <strong :data-testid="testId('caption')">{{ visualScreen.title }}</strong>
      </p>
      <button
        ref="inspectControl"
        :aria-label="`Inspect ${settledScreen.title} in screen gallery, ${settledIndex + 1} of ${screens.length}`"
        class="coverflow-inspect"
        :data-testid="testId('inspect')"
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
        :aria-label="isStackedDeck ? 'Stacked deck screens' : 'Coverflow screens'"
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
          :data-testid="testId('pagination-indicator')"
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

    <p class="sr-only" aria-atomic="true" :data-testid="testId('status')" role="status">
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
  --deck-blur: 0px;
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
  transform: perspective(900px) rotateY(var(--deck-rotate-y));
  transform-origin: center;
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

.screen-top,
.brand-row,
.chrome-actions,
.screen-body,
.toolbar,
.feature-card,
.card-grid,
.coverflow-meta,
.dots {
  display: flex;
}

.screen-top {
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  min-block-size: 18%;
  padding: 0.75rem 0.9rem;
  border-block-end: 1px solid rgb(15 23 42 / 0.07);
  background: inherit;
}

.tone-ink .screen-top {
  border-block-end-color: rgb(255 255 255 / 0.08);
}

.brand-row {
  align-items: center;
  gap: 0.55rem;
  min-inline-size: 0;
}

.brand-mark {
  display: grid;
  place-items: center;
  inline-size: 1.55rem;
  block-size: 1.55rem;
  flex: 0 0 auto;
  border-radius: 0.45rem;
  background: var(--screen-accent);
  color: #fff;
  font-size: 0.72rem;
  font-weight: 800;
}

.brand-row p,
.brand-row strong,
.feature-card p {
  margin: 0;
}

.brand-row p {
  color: #64748b;
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.tone-ink .brand-row p {
  color: #94a3b8;
}

.brand-row strong {
  display: block;
  font-size: clamp(0.72rem, 1.4vw, 0.92rem);
  line-height: 1.15;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-inline-size: 16rem;
}

.chrome-actions {
  align-items: center;
  gap: 0.35rem;
}

.chrome-actions span {
  inline-size: 0.9rem;
  block-size: 0.9rem;
  border-radius: 999px;
  background: #e2e8f0;
}

.chrome-actions .avatar {
  display: grid;
  place-items: center;
  inline-size: 1.35rem;
  block-size: 1.35rem;
  background: #0f172a;
  color: #fff;
  font-size: 0.48rem;
  font-weight: 700;
}

.tone-ink .chrome-actions span {
  background: #334155;
}

.tone-ink .chrome-actions .avatar {
  background: #e2e8f0;
  color: #0f172a;
}

.screen-body {
  align-items: stretch;
  block-size: 82%;
  min-block-size: 0;
  background: inherit;
}

.screen-nav {
  display: grid;
  align-content: start;
  gap: 0.35rem;
  inline-size: 18%;
  padding: 0.65rem 0.45rem;
  border-inline-end: 1px solid rgb(15 23 42 / 0.07);
  background: #f8fafc;
}

.tone-ink .screen-nav {
  background: #111827;
  border-inline-end-color: rgb(255 255 255 / 0.08);
}

.screen-nav span {
  display: block;
  block-size: 0.55rem;
  border-radius: 999px;
  background: #dbe3ee;
}

.screen-nav .nav-pill {
  block-size: 1.1rem;
  margin-block-end: 0.35rem;
  background: #cfd8e6;
}

.screen-nav .active-nav {
  background: var(--screen-accent);
}

.tone-ink .screen-nav span {
  background: #334155;
}

.tone-ink .screen-nav .nav-pill {
  background: #475569;
}

.screen-main {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  gap: 0.55rem;
  min-inline-size: 0;
  flex: 1;
  padding: 0.7rem;
  background: inherit;
}

.toolbar {
  align-items: center;
  gap: 0.35rem;
}

.toolbar .search {
  flex: 1;
  block-size: 0.85rem;
  border-radius: 999px;
  background: #e8eef6;
}

.toolbar .chip {
  inline-size: 2.2rem;
  block-size: 0.85rem;
  border-radius: 999px;
  background: #e2e8f0;
}

.toolbar .cta {
  inline-size: 3.2rem;
  block-size: 0.9rem;
  border-radius: 0.45rem;
  background: var(--screen-accent);
}

.tone-ink .toolbar .search,
.tone-ink .toolbar .chip {
  background: #334155;
}

.feature-card {
  align-items: center;
  gap: 0.55rem;
  padding: 0.55rem 0.65rem;
  border: 1px solid rgb(47 111 237 / 0.18);
  border-radius: 0.7rem;
  background: #f4f8ff;
}

.tone-ink .feature-card {
  border-color: rgb(148 163 184 / 0.2);
  background: #1e293b;
}

.feature-icon {
  inline-size: 1.5rem;
  block-size: 1.5rem;
  flex: 0 0 auto;
  border-radius: 0.4rem;
  background: var(--screen-accent);
  opacity: 0.85;
}

.feature-card strong {
  display: block;
  font-size: 0.68rem;
}

.feature-card p {
  color: #64748b;
  font-size: 0.58rem;
  line-height: 1.25;
}

.tone-ink .feature-card p {
  color: #94a3b8;
}

.ghost-btn {
  margin-inline-start: auto;
  padding: 0.28rem 0.45rem;
  border: 1px solid rgb(15 23 42 / 0.12);
  border-radius: 0.4rem;
  background: #fff;
  font-size: 0.55rem;
  font-weight: 700;
  white-space: nowrap;
}

.tone-ink .ghost-btn {
  border-color: rgb(226 232 240 / 0.16);
  background: #0f172a;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  /* Rows must be free to shrink, or the tiles overflow the screen and get clipped mid-card. */
  grid-template-rows: repeat(2, minmax(0, 1fr));
  gap: 0.45rem;
  min-block-size: 0;
}

.mini-card {
  display: grid;
  gap: 0.28rem;
  align-content: start;
  min-block-size: 0;
  overflow: hidden;
  padding: 0.45rem;
  border: 1px solid rgb(15 23 42 / 0.08);
  border-radius: 0.55rem;
  background: #fff;
}

.tone-ink .mini-card {
  background: #1e293b;
  border-color: rgb(255 255 255 / 0.06);
}

.mini-card i,
.mini-card b,
.mini-card em {
  display: block;
  border-radius: 999px;
}

.mini-card i {
  inline-size: 1rem;
  block-size: 1rem;
  border-radius: 0.3rem;
  background: var(--screen-accent);
  opacity: 0.35;
}

.mini-card b {
  block-size: 0.42rem;
  inline-size: 72%;
  background: #cbd5e1;
}

.mini-card em {
  block-size: 0.35rem;
  inline-size: 48%;
  background: #e2e8f0;
}

.tone-ink .mini-card b {
  background: #64748b;
}

.tone-ink .mini-card em {
  background: #475569;
}

/*
 * Per-screen skeletons. Two panels showing the same wireframe at the same height fuse across an
 * overlap no matter how the geometry behaves, so no two adjacent screens share a silhouette.
 */
.layout-gallery .screen-nav {
  inline-size: 12%;
}

.layout-gallery .feature-card {
  display: none;
}

.layout-gallery .card-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  grid-template-rows: repeat(2, minmax(0, 1fr));
}

.layout-detail .screen-nav {
  inline-size: 30%;
}

.layout-detail .card-grid {
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: repeat(3, minmax(0, 1fr));
}

.layout-detail .mini-card:nth-child(n + 4) {
  display: none;
}

.layout-canvas .screen-nav {
  display: none;
}

.layout-canvas .card-grid {
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
}

.layout-canvas .mini-card:nth-child(n + 3) {
  display: none;
}

.layout-canvas .mini-card:first-child {
  background: color-mix(in srgb, var(--screen-accent) 12%, #fff);
}

.layout-roster .toolbar {
  display: none;
}

.layout-roster .card-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-template-rows: repeat(3, minmax(0, 1fr));
}

.layout-console .screen-nav {
  inline-size: 26%;
}

.layout-console .feature-card {
  display: none;
}

.layout-console .card-grid {
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: repeat(4, minmax(0, 1fr));
}

.layout-console .mini-card:nth-child(n + 5) {
  display: none;
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

  .brand-row strong {
    max-inline-size: 10rem;
  }

  .feature-card p,
  .ghost-btn {
    display: none;
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
