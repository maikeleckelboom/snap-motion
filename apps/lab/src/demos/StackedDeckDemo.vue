<script setup lang="ts">
import {
  createCoverflowGeometry,
  createStackedDeckFrame,
  createStackedDeckTraversal,
  resolveStackedDeckFrame,
  resolveStackedDeckPile,
  resolveStackedDeckTraversal,
  resolveStackedDeckTuning,
  type StackedDeckTraversal,
  type StackedDeckTraversalBounds,
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
  springFromSettings,
  STACKED_DECK_MAX_ANCHOR_SKIP,
  stackedDeckReleaseFromSettings,
  symmetricElasticityFromSettings,
} from "@/fixtures/lab-settings";
import type { LabDiagnostics, LabPhysicsSettings } from "@/fixtures/lab-types";

import { COVERFLOW_GALLERY_TUNING, resolveCoverflowGesture } from "./coverflowGallery";
import {
  COVERFLOW_MOTION_TUNING,
  COVERFLOW_PAGINATION_TUNING,
  CoverflowSettledSelection,
  resolveAdjacentCoverflowIndex,
  resolveCoverflowKeyboardAction,
  resolveCoverflowPaginationIndicator,
  resolveSpeedInCards,
  useBoundedCoverflowDriver,
  type CoverflowPaginationIndicatorState,
} from "./coverflowMotion";
import { showcaseScreens, type ShowcaseScreenId } from "./showcaseScreens";
import {
  isStackedDeckAuthorityStable,
  isStackedDeckInspectEligible,
  resolveStackedDeckCommandOrigin,
} from "./stackedDeckInteraction";

type ScreenId = ShowcaseScreenId;

const props = defineProps<{
  reducedMotionOverride: boolean | undefined;
  settings: LabPhysicsSettings;
  stageWidth: number;
}>();

const screens = showcaseScreens;

const ids = screens.map((screen) => screen.id);
const deckRoot = ref<HTMLElement>();
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

/**
 * The interaction currently responsible for the deck, and the envelope its resolution must honour.
 *
 * It opens when an input device takes physical ownership or when a relative command is issued, and
 * the next distinct interaction *replaces* it rather than queueing behind it. It deliberately does
 * not gate input: a previous interaction's spring tail is not a reason to refuse the next one.
 */
interface DeckInteraction {
  readonly originIndex: number;
}

const deckInteraction = shallowRef<DeckInteraction | null>(null);

/**
 * Opens an interaction and reports the anchor the controller must measure the drag from. Passing
 * the interaction-authoritative card rather than the nearest anchor keeps the drag envelope, the
 * release cap, and the card under the hand on one origin — including during a re-grab made while
 * the previous spring is still running, where the two would otherwise be a whole card apart.
 */
function beginDeckInteraction(): ScreenId {
  const originIndex = authoritativeIndex.value;
  deckInteraction.value = { originIndex };
  return ids[originIndex]!;
}

const motion = useCarouselMotion({
  anchors: initialGeometry.anchors,
  bounds: initialGeometry.bounds,
  driver,
  dragEnvelopeElasticity: symmetricElasticityFromSettings(props.settings),
  elasticity: symmetricElasticityFromSettings(props.settings),
  initialTargetId: ids[Math.floor(ids.length / 2)]!,
  measure: measureGeometry,
  programmaticImpulse: props.settings.programmaticImpulse,
  reducedMotionOverride: reducedOverride,
  releasePolicy: stackedDeckReleaseFromSettings(props.settings),
  resolveDragOrigin: beginDeckInteraction,
  spring: springFromSettings(props.settings),
  track,
  viewport,
});

/**
 * True only while an input device physically holds the deck. This is the sole reason to refuse a
 * competing input; residual settlement deliberately is not, because a spring the user can no longer
 * see must never behave like a cooldown.
 */
const deckOwned = computed(
  () => motion.isDragging.value || motion.pointerOwned.value || motion.isWheeling.value,
);

/** Mechanical rest. It governs durable selection and announcements, never input admission. */
const deckAtRest = computed(() => !deckOwned.value && motion.phase.value === "idle");

watch(
  deckAtRest,
  (atRest) => {
    if (atRest) deckInteraction.value = null;
  },
  { flush: "sync" },
);

/**
 * The envelope one interaction may resolve inside. Outside an interaction the projection is free,
 * so the primitive itself keeps its generic multi-anchor capability.
 */
const deckTraversalBounds = computed<StackedDeckTraversalBounds | undefined>(() => {
  const interaction = deckInteraction.value;
  if (interaction === null) return undefined;
  const lastIndex = ids.length - 1;
  return {
    minIndex: clamp(interaction.originIndex - STACKED_DECK_MAX_ANCHOR_SKIP, 0, lastIndex),
    maxIndex: clamp(interaction.originIndex + STACKED_DECK_MAX_ANCHOR_SKIP, 0, lastIndex),
  };
});

const initialIndex = Math.floor(ids.length / 2);
galleryInitialIndex.value = initialIndex;
galleryFinalIndex.value = initialIndex;
const settledSelection = new CoverflowSettledSelection(initialIndex, ids.length);
const settledIndex = ref(initialIndex);
const pendingTargetIndex = ref<number | null>(null);
const focusedPaginationIndex = ref<number | null>(null);
const liveMessage = ref("");
const settledId = computed(() => ids[settledIndex.value] ?? ids[initialIndex]!);
const deckTraversalOutput = createStackedDeckTraversal(initialIndex, ids.length);
const deckTraversal = shallowRef<StackedDeckTraversal>(deckTraversalOutput);
const visualTopIndex = computed(() => deckTraversal.value.visualTopIndex);

/**
 * The one answer to "which card is current". Every part of the surface that names a card — caption,
 * counter, pagination, `aria-current`, the re-grab origin, inspection — reads this, so none of them
 * can invent its own. It equals the visual top except inside a handoff, where it names the card the
 * eye already reads as current while the outgoing one finishes vacating.
 */
const authoritativeIndex = computed(() => deckTraversal.value.authoritativeIndex);
const authoritativeId = computed(() => ids[authoritativeIndex.value] ?? settledId.value);
const authoritativeScreen = computed(() => screens[authoritativeIndex.value] ?? screens[0]!);

/** Continuous physical index. It projects motion but never controls the carousel mass. */
const rawPhysicalIndex = computed(() =>
  pitch.value <= 0 ? 0 : -motion.position.value / pitch.value,
);
const speedInCards = computed(() => resolveSpeedInCards(motion.velocity.value, pitch.value));

const paginationDots = computed(() =>
  screens.map((screen, index) => ({
    id: screen.id,
    title: screen.title,
    current: index === authoritativeIndex.value,
  })),
);

watch(
  motion.snapshot,
  (snapshot) => {
    const currentPitch = Math.max(1, pitch.value);
    const targetIndex =
      snapshot.target === null ? null : Math.max(0, ids.indexOf(snapshot.target.id));
    const nearestIndex =
      snapshot.active === null ? settledIndex.value : Math.max(0, ids.indexOf(snapshot.active.id));
    const announcementIndex = settledSelection.update({
      phase: snapshot.phase,
      targetIndex,
      activeIndex: nearestIndex,
    });

    if (settledIndex.value !== settledSelection.settledIndex) {
      settledIndex.value = settledSelection.settledIndex;
    }
    if (pendingTargetIndex.value !== settledSelection.pendingTargetIndex) {
      pendingTargetIndex.value = settledSelection.pendingTargetIndex;
    }
    const traversalBounds = deckTraversalBounds.value;
    resolveStackedDeckTraversal(
      {
        controllerPhase: snapshot.phase,
        itemCount: ids.length,
        physicalIndex: -snapshot.position / currentPitch,
        settledIndex: settledSelection.settledIndex,
        ...(traversalBounds === undefined ? {} : { traversalBounds }),
      },
      deckTraversalOutput,
    );
    triggerRef(deckTraversal);
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

/**
 * Inspection follows the same authority the surface displays, not the controller's mechanical rest.
 * The rail's rest-distance rule does not apply here: the deck's compositor decouples card pose from
 * controller position, so past the handoff the card is already parked and remaining travel is
 * invisible.
 */
function isCardGalleryEligible(index: number): boolean {
  return (
    screens[index] !== undefined &&
    isStackedDeckInspectEligible({
      dragging: motion.isDragging.value,
      frame: stackedFrame.value,
      galleryOpen: galleryOpen.value,
      index,
      pointerOwned: motion.pointerOwned.value,
    })
  );
}

interface SlideStyle {
  container: {
    opacity: number;
    zIndex: number;
    visibility: "visible" | "hidden";
  };
  motion: {
    pointerEvents: "auto" | "none";
    transformOrigin: string;
    transform: string;
    willChange: "auto" | "transform";
  };
  screen: {
    [customProperty: `--${string}`]: string;
  };
}

const stackedFrameOutput = createStackedDeckFrame(ids.length);
const stackedFrame = shallowRef(stackedFrameOutput);
const activeTuning = computed(() =>
  motion.reducedMotion.value ? reducedStackedTuning.value : stackedTuning.value,
);

/**
 * Deck thickness. One backing layer per screen still in the deck, fanned to the side its index lies
 * on, so the deck shows both what is behind and what is ahead. Layers are keyed by their rank within
 * a side rather than by screen, because a layer stands for "one more card that way" and never for a
 * particular screen — no gesture direction or reversal can mirror, reorder, or re-identify one.
 */
const pileLayers = computed(() => {
  let before = 0;
  let after = 0;
  return resolveStackedDeckPile({ frame: stackedFrame.value, tuning: activeTuning.value }).map(
    (pose) => {
      const side = pose.slot < 0 ? -1 : 1;
      const rank = side < 0 ? (before += 1) : (after += 1);
      return {
        key: `${side}:${rank}`,
        layer: pose.layer,
        side,
        slot: Number(pose.slot.toFixed(3)),
        style: {
          opacity: pose.opacity,
          transform: `translate3d(-50%, -50%, 0) translate3d(${pose.translateX.toFixed(3)}px, ${pose.translateY.toFixed(3)}px, 0) scale(${pose.scale.toFixed(5)}) rotate(${pose.rotate.toFixed(3)}deg)`,
          zIndex: pose.layer,
          "--_deck-shadow-strength": pose.shadowStrength.toFixed(4),
        },
      };
    },
  );
});

watchEffect(() => {
  resolveStackedDeckFrame(
    {
      itemCount: ids.length,
      traversal: deckTraversal.value,
      tuning: activeTuning.value,
    },
    stackedFrameOutput,
  );
  triggerRef(stackedFrame);
});

/**
 * Whether the deck currently shows one card or two. Authority names the card the user is acting on
 * from the segment midpoint; identity only stops being *contestable* once the vacated face is gone.
 * Actions that open another surface wait for the second, everything else follows the first.
 */
const authorityStable = computed(() => isStackedDeckAuthorityStable(stackedFrame.value));

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
      container: {
        opacity: pose.opacity,
        zIndex: pose.layer,
        visibility: pose.visible ? "visible" : "hidden",
      },
      motion: {
        pointerEvents: pose.interactive ? "auto" : "none",
        transform: `translate3d(-50%, -50%, 0) translate3d(${pose.translateX.toFixed(3)}px, ${pose.translateY.toFixed(3)}px, 0) scale(${pose.scale.toFixed(5)}) rotate(${pose.rotate.toFixed(3)}deg)`,
        transformOrigin: "center center",
        willChange: pose.visible ? "transform" : "auto",
      },
      screen: {
        "--screen-accent": screen.accent,
        "--_deck-shadow-strength": pose.shadowStrength.toFixed(4),
      },
    };
  }
  return styles;
});

const stageStyle = computed(() => ({
  "--_deck-stage-width": `${Math.min(props.stageWidth, 1_280)}px`,
  "--_deck-card-width": `${cardWidth.value}px`,
  "--_deck-card-height": `${cardHeight.value}px`,
}));

const paginationVisualIndex = computed(() => {
  const traversal = deckTraversal.value;
  return clamp(traversal.visualTopIndex + traversal.signedLocalDistance, 0, ids.length - 1);
});

const paginationIndicator = computed<CoverflowPaginationIndicatorState>(() =>
  resolveCoverflowPaginationIndicator(paginationVisualIndex.value, 0, pitch.value, ids.length, {
    position: 0,
    x: 0,
    scaleX: 1,
    stretchRatio: 0,
    speedInCards: 0,
    softDirection: 0,
    leftStretch: 0,
    rightStretch: 0,
  }),
);

const paginationStyle = computed(() => ({
  "--_pagination-slot-size": `${COVERFLOW_PAGINATION_TUNING.slotSize}px`,
  "--_pagination-slot-gap": `${COVERFLOW_PAGINATION_TUNING.slotGap}px`,
  "--_pagination-indicator-width": `${COVERFLOW_PAGINATION_TUNING.restingWidth}px`,
  "--_pagination-indicator-height": `${COVERFLOW_PAGINATION_TUNING.height}px`,
  "--_pagination-indicator-x": `${paginationIndicator.value.x.toFixed(4)}px`,
  "--_pagination-indicator-scale-x": paginationIndicator.value.scaleX.toFixed(5),
}));

/**
 * Where the next Previous/Next, arrow key, or adjacent dot steps from. Once the deck is committed to
 * a destination that destination is the origin, so distinct rapid commands chain one card each.
 */
const commandOriginIndex = computed(() =>
  resolveStackedDeckCommandOrigin(authoritativeIndex.value, pendingTargetIndex.value),
);
const canGoPrevious = computed(() => commandOriginIndex.value > 0);
const canGoNext = computed(() => commandOriginIndex.value < ids.length - 1);

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
    segmentDirection: deckTraversal.value.direction,
    segmentOriginIndex: deckTraversal.value.segmentOriginIndex,
    segmentPhase: deckTraversal.value.phase,
    segmentProgress: deckTraversal.value.localProgress,
    ...(deckTraversal.value.segmentTargetIndex === null
      ? {}
      : { segmentTargetIndex: deckTraversal.value.segmentTargetIndex }),
    signedLocalDistance: deckTraversal.value.signedLocalDistance,
    tuningProfile: stackedTuning.value.profile,
    settledIndex: settledIndex.value,
    visualTopIndex: visualTopIndex.value,
    authoritativeIndex: authoritativeIndex.value,
    authorityStable: authorityStable.value,
    ...(focusedPaginationIndex.value === null
      ? {}
      : { focusedPaginationIndex: focusedPaginationIndex.value }),
    indicatorX: paginationIndicator.value.x,
    indicatorScale: paginationIndicator.value.scaleX,
    keyboardTargetIndex: commandOriginIndex.value,
    maxAnchorSkip: STACKED_DECK_MAX_ANCHOR_SKIP,
    maxAnchorSkipFixed: true,
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

/**
 * One relative command is one adjacent card, measured from the destination the deck is committed to.
 * It re-bases the spring rather than queueing, so distinct rapid commands each resolve their own
 * card without ever letting a single command travel further than one.
 */
function requestRelative(direction: -1 | 1): boolean {
  if (galleryOpen.value || deckOwned.value) return false;
  const originIndex = commandOriginIndex.value;
  const targetIndex = resolveAdjacentCoverflowIndex(originIndex, direction, ids.length);
  const id = ids[targetIndex];
  if (!id || targetIndex === originIndex) return false;
  deckInteraction.value = { originIndex };
  motion.moveTo(id);
  return true;
}

/**
 * Absolute navigation names a destination; it is not a throw. An adjacent destination may still use
 * the normal one-card interaction, but anything further synchronizes directly instead of animating
 * through every intermediate card.
 */
function requestAbsolute(index: number): boolean {
  if (galleryOpen.value) return false;
  const targetIndex = clamp(index, 0, ids.length - 1);
  const distance = targetIndex - commandOriginIndex.value;
  if (distance === 0 && deckAtRest.value) return false;
  if (!deckOwned.value && Math.abs(distance) === 1) {
    return requestRelative(distance as -1 | 1);
  }
  return synchronizeCarouselExactly(targetIndex, { announce: true });
}

function goToPrevious(): boolean {
  return requestRelative(-1);
}

function goToNext(): boolean {
  return requestRelative(1);
}

function onDeckKeyDown(event: KeyboardEvent) {
  if (galleryOpen.value) return;
  const action = resolveCoverflowKeyboardAction(event);
  if (!action) return;

  event.preventDefault();
  if (action === "previous") {
    goToPrevious();
  } else if (action === "next") {
    goToNext();
  } else {
    requestAbsolute(action === "home" ? 0 : ids.length - 1);
  }
}

function synchronizeCarouselExactly(index: number, options: { announce?: boolean } = {}): boolean {
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
    settledIndex.value === targetIndex &&
    authoritativeIndex.value === targetIndex &&
    visualTopIndex.value === targetIndex;
  if (alreadySynchronized) return true;

  motion.interrupt();
  deckInteraction.value = null;
  if (options.announce !== true) suppressedCarouselAnnouncementIndex = targetIndex;
  motion.controller.remeasure({
    ...measureGeometry(),
    activeId: id,
  });
  settledIndex.value = targetIndex;
  pendingTargetIndex.value = null;
  resolveStackedDeckTraversal(
    {
      controllerPhase: "idle",
      itemCount: ids.length,
      physicalIndex: targetIndex,
      settledIndex: targetIndex,
    },
    deckTraversalOutput,
  );
  triggerRef(deckTraversal);
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
      ? (event.target.closest<HTMLElement>(".stacked-deck-card") ?? undefined)
      : undefined;
  if (releaseCard) return releaseCard === origin;
  const documentTarget = origin.ownerDocument;
  const hitCards = documentTarget
    .elementsFromPoint(event.clientX, event.clientY)
    .map((element) => element.closest<HTMLElement>(".stacked-deck-card"))
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
  if (completed.cancelled) {
    // A cancelled gesture undoes itself, which means returning to the card it began on. That is the
    // interaction's own origin, not the settled selection: a gesture that took over a running spring
    // began on a card the controller had not committed to yet.
    const restoreIndex = deckInteraction.value?.originIndex ?? settledIndex.value;
    motion.moveTo(ids[restoreIndex] ?? settledId.value, { initialVelocity: 0 });
    return;
  }
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
    const root = deckRoot.value;
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
      requestAbsolute(originIndex);
    });
  }
}

function onDeckPointerDown(event: PointerEvent) {
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

  const root = deckRoot.value;
  const activeElement = root?.ownerDocument.activeElement;
  const eventCard =
    event.target instanceof Element
      ? (event.target.closest<HTMLElement>(".stacked-deck-card") ?? undefined)
      : undefined;
  const originElement =
    eventCard ??
    root?.ownerDocument
      .elementsFromPoint(event.clientX, event.clientY)
      .map((element) => element.closest<HTMLElement>(".stacked-deck-card"))
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

function onCarouselLostPointerCapture(event: PointerEvent) {
  const gesture = carouselGesture;
  if (!gesture || event.pointerId !== gesture.pointerId) return;
  activeCarouselPointers.delete(event.pointerId);
  gesture.cancelled = true;
  carouselGesture = undefined;
  queueMicrotask(() => resolveCompletedCarouselGesture(gesture, false));
}

/**
 * Wheel ownership follows the coalescing lifecycle, not raw events: the first delta of a burst opens
 * one interaction and every later delta inside it shares the same envelope, so a burst can never
 * chain into a second card. The burst boundary is the whole gate — once a burst has ended, the next
 * one begins immediately, interrupting whatever is left of the previous spring.
 */
function onDeckWheel(event: WheelEvent) {
  if (galleryOpen.value) return;
  if (!motion.isWheeling.value && deckOwned.value) return;
  motion.onWheel(event);
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
      dragEnvelopeElasticity: symmetricElasticityFromSettings(settings),
      elasticity: symmetricElasticityFromSettings(settings),
      programmaticImpulse: settings.programmaticImpulse,
      releasePolicy: stackedDeckReleaseFromSettings(settings),
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
    ref="deckRoot"
    aria-labelledby="stacked-deck-title"
    class="stacked-deck-demo"
    @keydown="onDeckKeyDown"
  >
    <header class="stacked-deck-header">
      <div>
        <h3 id="stacked-deck-title">Stacked deck</h3>
        <p class="lede">
          Drag the top screen to reveal one adjacent screen. Every gesture, flick, or wheel burst
          resolves at most one screen away from where it began, no matter how far it travels — and
          the next one starts on the card you can already see, without waiting for the spring.
        </p>
      </div>
      <div class="stacked-deck-controls">
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
      class="stacked-deck-viewport"
      data-testid="stacked-deck-viewport"
      :data-active-id="authoritativeId"
      :data-authoritative-index="authoritativeIndex"
      :data-authority-stable="authorityStable ? 'true' : 'false'"
      :data-card-width="cardWidth"
      :data-gallery-open="galleryOpen ? 'true' : 'false'"
      :data-interaction-origin-index="deckInteraction?.originIndex ?? -1"
      :data-interaction-owned="deckOwned ? 'true' : 'false'"
      :data-keyboard-target-index="commandOriginIndex"
      :data-max-anchor-skip="STACKED_DECK_MAX_ANCHOR_SKIP"
      :data-motion-pitch="pitch"
      :data-pending-index="pendingTargetIndex"
      :data-phase="motion.phase.value"
      :data-physical-index="rawPhysicalIndex"
      :data-position="motion.position.value"
      :data-profile="stackedTuning.profile"
      :data-segment-direction="deckTraversal.direction"
      :data-segment-origin-index="deckTraversal.segmentOriginIndex"
      :data-segment-phase="deckTraversal.phase"
      :data-segment-progress="deckTraversal.localProgress"
      :data-segment-target-index="deckTraversal.segmentTargetIndex"
      :data-settled-index="settledIndex"
      :data-settled-id="settledId"
      :data-signed-local-distance="deckTraversal.signedLocalDistance"
      :data-speed-in-cards="speedInCards"
      :data-target-id="motion.targetId.value"
      :data-visual-top-index="visualTopIndex"
      :style="[stageStyle, motion.surfaceStyle]"
      tabindex="0"
      @lostpointercapture="onCarouselLostPointerCapture"
      @pointerdown="onDeckPointerDown"
      @wheel="onDeckWheel"
    >
      <div aria-hidden="true" class="stacked-deck-backdrop" />
      <div ref="track" class="stacked-deck-stage">
        <div
          v-for="layer in pileLayers"
          :key="layer.key"
          aria-hidden="true"
          class="stacked-deck-pile-layer"
          :data-pile-layer="layer.layer"
          :data-pile-opacity="layer.style.opacity"
          :data-pile-side="layer.side"
          :data-pile-slot="layer.slot"
          :style="layer.style"
        />
        <article
          v-for="(screen, index) in screens"
          :key="screen.id"
          :aria-current="screen.id === authoritativeId ? 'true' : undefined"
          :aria-hidden="screen.id === authoritativeId ? undefined : 'true'"
          :aria-label="`${screen.title}, ${index + 1} of ${screens.length}`"
          aria-roledescription="slide"
          class="stacked-deck-card"
          :class="[
            `tone-${screen.tone}`,
            `layout-${screen.layout}`,
            {
              active: screen.id === authoritativeId,
              inspectable: isCardGalleryEligible(index),
            },
          ]"
          :data-interactive="stackedPose(index)?.interactive"
          :data-layer="stackedPose(index)?.layer"
          :data-opacity="stackedPose(index)?.opacity"
          :data-role="stackedPose(index)?.role"
          :data-rotate="stackedPose(index)?.rotate"
          :data-scale="stackedPose(index)?.scale"
          :data-screen-id="screen.id"
          :data-shadow-strength="stackedPose(index)?.shadowStrength"
          :data-translate-x="stackedPose(index)?.translateX"
          :data-translate-y="stackedPose(index)?.translateY"
          :data-visible="stackedPose(index)?.visible"
          :style="slideStyles[screen.id].container"
          @click.prevent
        >
          <div class="stacked-deck-card-motion" :style="slideStyles[screen.id].motion">
            <div class="screen-chrome" :style="slideStyles[screen.id].screen">
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
          </div>
        </article>
      </div>
    </div>

    <div class="stacked-deck-meta">
      <p>
        <span class="tabular" data-testid="stacked-deck-counter">{{ authoritativeIndex + 1 }}</span>
        /
        <span class="tabular">{{ screens.length }}</span>
        <strong data-testid="stacked-deck-caption">{{ authoritativeScreen.title }}</strong>
      </p>
      <button
        ref="inspectControl"
        :aria-label="`Inspect ${authoritativeScreen.title} in screen gallery, ${authoritativeIndex + 1} of ${screens.length}`"
        class="stacked-deck-inspect"
        data-testid="stacked-deck-inspect"
        :disabled="!isCardGalleryEligible(authoritativeIndex)"
        type="button"
        @click="openGallery(authoritativeIndex)"
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
          class="stacked-deck-pagination-indicator"
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
          @click="requestAbsolute(index)"
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
.stacked-deck-demo {
  position: relative;
  display: grid;
  gap: 1rem;
  min-inline-size: 0;
}

:global(html:has(.stacked-deck-demo)),
:global(body:has(.stacked-deck-demo)) {
  overflow-x: clip;
}

.stacked-deck-demo :deep(.snap-motion-media-gallery) {
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

.stacked-deck-header {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 1rem;
}

.stacked-deck-meta p {
  margin: 0;
}

.stacked-deck-header h3 {
  margin: 0.2rem 0 0.35rem;
  font-size: 1.35rem;
}

.lede {
  margin: 0;
  color: var(--muted);
  max-inline-size: 40rem;
  line-height: 1.45;
}

.stacked-deck-controls {
  display: inline-flex;
  gap: 0.5rem;
}

.stacked-deck-controls button,
.dot {
  display: inline-grid;
  place-items: center;
  min-inline-size: 2.75rem;
  min-block-size: 2.75rem;
  border-radius: 999px;
}

.stacked-deck-viewport {
  position: relative;
  inline-size: min(100%, var(--_deck-stage-width));
  min-block-size: calc(var(--_deck-card-height) + 5.5rem);
  margin-inline: auto;
  overflow: visible;
  isolation: isolate;
  touch-action: pan-y;
  user-select: none;
  cursor: grab;
}

.stacked-deck-viewport:active {
  cursor: grabbing;
}

.stacked-deck-backdrop {
  position: absolute;
  z-index: 0;
  inset: 0;
  overflow: hidden;
  border-radius: 1.5rem;
  background:
    radial-gradient(circle at 50% 28%, rgb(255 255 255 / 0.92), transparent 56%),
    linear-gradient(180deg, #f1f4f8 0%, #e7ecf2 100%);
  pointer-events: none;
}

.stacked-deck-backdrop::before {
  content: "";
  position: absolute;
  inset-inline-start: 50%;
  inset-block-end: 1.1rem;
  inline-size: min(72%, 46rem);
  block-size: 4.5rem;
  transform: translateX(-50%);
  border-radius: 50%;
  background: radial-gradient(
    ellipse at center,
    rgb(15 23 42 / 0.16) 0%,
    rgb(15 23 42 / 0.06) 46%,
    rgb(15 23 42 / 0) 74%
  );
  pointer-events: none;
}

.stacked-deck-stage {
  position: relative;
  z-index: 1;
  inline-size: 100%;
  block-size: calc(var(--_deck-card-height) + 5.5rem);
  transform-style: flat;
}

.stacked-deck-card {
  position: absolute;
  inset: 0;
  margin: 0;
  border: 0;
  padding: 0;
  background: transparent;
  pointer-events: none;
}

/* Decorative depth only. These layers never carry item identity, content, or semantics. */
.stacked-deck-pile-layer {
  --_deck-shadow-strength: 1;

  position: absolute;
  inset-block-start: 50%;
  inset-inline-start: 50%;
  inline-size: var(--_deck-card-width);
  block-size: var(--_deck-card-height);
  transform-origin: center center;
  border: 1px solid rgb(71 85 105 / 0.16);
  border-radius: 0.8rem;
  background: linear-gradient(158deg, #fdfefe 0%, #eef1f6 62%, #e4e9f0 100%);
  box-shadow:
    0 18px 38px -18px rgb(15 23 42 / calc(0.38 * var(--_deck-shadow-strength))),
    0 4px 10px -6px rgb(15 23 42 / calc(0.32 * var(--_deck-shadow-strength)));
  backface-visibility: hidden;
  pointer-events: none;
}

.stacked-deck-card-motion {
  --_deck-shadow-strength: 1;

  position: absolute;
  inset-block-start: 50%;
  inset-inline-start: 50%;
  inline-size: var(--_deck-card-width);
  block-size: var(--_deck-card-height);
  transform-style: flat;
  transform-origin: center center;
  backface-visibility: hidden;
  cursor: pointer;
}

.screen-chrome {
  position: relative;
  inline-size: 100%;
  block-size: 100%;
  border: 1px solid rgb(15 23 42 / 0.16);
  border-radius: 0.8rem;
  overflow: hidden;
  background: #fff;
  box-shadow:
    0 18px 38px -18px rgb(15 23 42 / calc(0.38 * var(--_deck-shadow-strength))),
    0 4px 10px -6px rgb(15 23 42 / calc(0.32 * var(--_deck-shadow-strength)));
  color: #0f172a;
  filter: none;
}

.screen-chrome::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  border-radius: inherit;
  background: linear-gradient(135deg, rgb(255 255 255 / 0.11), transparent 34%);
}

.tone-mist .screen-chrome {
  background: #f8fafc;
}

.tone-ink .screen-chrome {
  background: #0f172a;
  color: #e2e8f0;
  border-color: rgb(255 255 255 / 0.08);
}

.stacked-deck-card[data-role="top"] .screen-chrome {
  border-color: rgb(15 23 42 / 0.23);
}

.stacked-deck-card[data-role="target"] .screen-chrome {
  border-color: rgb(71 85 105 / 0.16);
}

.stacked-screen-image {
  display: block;
  inline-size: 100%;
  block-size: 100%;
  object-fit: cover;
  pointer-events: none;
}

.stacked-deck-meta,
.dots {
  display: flex;
}

.stacked-deck-meta {
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.stacked-deck-meta p {
  display: flex;
  flex: 1 1 auto;
  align-items: baseline;
  gap: 0.35rem;
  min-inline-size: 0;
  color: var(--muted);
  font-size: 0.9rem;
}

.stacked-deck-inspect {
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

.stacked-deck-inspect:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--ink) 42%, transparent);
  background: color-mix(in srgb, var(--ink) 5%, transparent);
}

.stacked-deck-inspect:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.stacked-deck-inspect:disabled {
  cursor: default;
  opacity: 0.42;
}

.stacked-deck-meta strong {
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

.stacked-deck-pagination-indicator {
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
  .stacked-deck-header {
    align-items: start;
    flex-direction: column;
  }

  .stacked-deck-meta {
    flex-wrap: wrap;
  }

  .stacked-deck-meta p {
    flex-basis: calc(100% - 4.5rem);
  }

  .stacked-deck-inspect span {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
}
</style>
