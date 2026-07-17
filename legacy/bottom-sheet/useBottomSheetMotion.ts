import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { animate, easeOut } from "popmotion";

export type BottomSheetOpenSnapPoint = "compact" | "comfortable" | "full";
export type BottomSheetSnapPoint = BottomSheetOpenSnapPoint | "hidden";
export type BottomSheetState =
  | "closed"
  | "opening"
  | "open"
  | "dragging"
  | "settling"
  | "closing";

export interface BottomSheetSnapTarget {
  name: BottomSheetSnapPoint;
  offset: number;
}

interface UseBottomSheetMotionOptions {
  onHidden?: () => void;
  onSnap?: (point: BottomSheetSnapPoint) => void;
}

interface BottomSheetSnapMeasure {
  panelHeight?: number;
  viewportHeight: number;
}

type AnimationPlayback = ReturnType<typeof animate<number>>;

export const defaultBottomSheetSnapPoint: BottomSheetOpenSnapPoint =
  "comfortable";

const animationDurationMs = 280;
const closedOffset = 160;
const comfortableMaxHeight = 620;
const compactMaxHeight = 360;
const elasticResistance = 120;
const flingSnapVelocity = 1.1;
const maxElasticOverscroll = 64;
const maxScrimOpacity = 0.56;
const minMeasuredSize = 1;
const minUsableViewportHeight = 240;
const releaseProjectionMs = 120;
const reducedMotionQuery = "(prefers-reduced-motion: reduce)";
const topGap = 24;

const openSnapOrder: readonly BottomSheetOpenSnapPoint[] = [
  "full",
  "comfortable",
  "compact",
];

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

function viewportValue(value: number) {
  return Math.max(topGap + minMeasuredSize, Math.round(value));
}

export function yForBottomSheetSnap(
  snap: BottomSheetOpenSnapPoint,
  viewportHeight: number,
) {
  const viewport = viewportValue(viewportHeight);
  const maxHeight = viewport - topGap;
  const heights: Record<BottomSheetOpenSnapPoint, number> = {
    compact: Math.min(compactMaxHeight, maxHeight),
    comfortable: Math.min(comfortableMaxHeight, maxHeight),
    full: maxHeight,
  };

  return viewport - heights[snap];
}

export function minBottomSheetY() {
  return topGap;
}

export function maxBottomSheetY(viewportHeight: number) {
  return viewportValue(viewportHeight);
}

export function closedBottomSheetY(viewportHeight: number) {
  return maxBottomSheetY(viewportHeight) + closedOffset;
}

export function resolveBottomSheetSnapTargets({
  viewportHeight,
}: BottomSheetSnapMeasure): BottomSheetSnapTarget[] {
  const viewport = viewportValue(viewportHeight);

  return [
    ...openSnapOrder.map((name) => ({
      name,
      offset: yForBottomSheetSnap(name, viewport),
    })),
    { name: "hidden" as const, offset: closedBottomSheetY(viewport) },
  ];
}

function openSnapTargets(targets: BottomSheetSnapTarget[]) {
  return targets.filter(
    (target): target is BottomSheetSnapTarget & {
      name: BottomSheetOpenSnapPoint;
    } => target.name !== "hidden",
  );
}

export function nearestBottomSheetSnapTarget(
  targets: BottomSheetSnapTarget[],
  offset: number,
) {
  const [firstTarget] = targets;

  if (!firstTarget) {
    throw new Error("Expected at least one bottom-sheet snap target.");
  }

  return targets.reduce((nearest, target) => {
    const nearestDistance = Math.abs(nearest.offset - offset);
    const targetDistance = Math.abs(target.offset - offset);

    return targetDistance < nearestDistance ? target : nearest;
  }, firstTarget);
}

interface ElasticDragOptions {
  elasticResistance?: number;
  maxElasticOverscroll?: number;
}

export function resolveElasticDragOffset(
  rawOffset: number,
  minOffset: number,
  maxOffset: number,
  options: ElasticDragOptions = {},
) {
  const boundedMinOffset = Math.max(0, minOffset);
  const boundedMaxOffset = Math.max(boundedMinOffset, maxOffset);

  if (rawOffset >= boundedMinOffset) {
    return clamp(rawOffset, boundedMinOffset, boundedMaxOffset);
  }

  const elasticLimit = Math.max(
    0,
    options.maxElasticOverscroll ?? maxElasticOverscroll,
  );

  if (elasticLimit === 0) {
    return boundedMinOffset;
  }

  const resistance = Math.max(
    minMeasuredSize,
    options.elasticResistance ?? elasticResistance,
  );
  const overscroll = boundedMinOffset - rawOffset;
  const elasticOffset = (elasticLimit * overscroll) / (overscroll + resistance);

  return boundedMinOffset - clamp(elasticOffset, 0, elasticLimit);
}

export function releasedBottomSheetSnapTarget(
  targets: BottomSheetSnapTarget[],
  offset: number,
  velocity: number,
) {
  const legalTargets = openSnapTargets(targets);
  const hiddenTarget = targets.find((target) => target.name === "hidden");

  if (velocity >= flingSnapVelocity && hiddenTarget) {
    return hiddenTarget;
  }

  if (velocity <= -flingSnapVelocity) {
    return (
      snapTargetByName(legalTargets, "full") ??
      nearestBottomSheetSnapTarget(legalTargets, minBottomSheetY())
    );
  }

  const projectedY = offset + velocity * releaseProjectionMs;
  const compactTarget = snapTargetByName(legalTargets, "compact");

  if (hiddenTarget && compactTarget) {
    const closeBoundary =
      compactTarget.offset + (hiddenTarget.offset - compactTarget.offset) / 2;

    if (projectedY >= closeBoundary) {
      return hiddenTarget;
    }
  }

  const maxLegalY = hiddenTarget
    ? hiddenTarget.offset - closedOffset
    : Math.max(...legalTargets.map((target) => target.offset));
  const legalY = clamp(projectedY, minBottomSheetY(), maxLegalY);

  return nearestBottomSheetSnapTarget(legalTargets, legalY);
}

function snapTargetByName(
  targets: BottomSheetSnapTarget[],
  name: BottomSheetSnapPoint,
) {
  return targets.find((target) => target.name === name);
}

export function useBottomSheetMotion(options: UseBottomSheetMotionOptions) {
  const offset = ref(closedBottomSheetY(minMeasuredSize));
  const viewportHeight = ref(minMeasuredSize);
  const isDragging = ref(false);
  const isAnimating = ref(false);
  const prefersReducedMotion = ref(false);
  const activeSnapPoint = ref<BottomSheetSnapPoint>(
    defaultBottomSheetSnapPoint,
  );
  const state = ref<BottomSheetState>("closed");

  let activeAnimation: AnimationPlayback | undefined;
  let dragPointerId: number | undefined;
  let dragTarget: HTMLElement | undefined;
  let dragStartOffset = 0;
  let dragStartY = 0;
  let lastDragSampleTime = 0;
  let lastDragSampleY = 0;
  let motionQuery: MediaQueryList | undefined;
  let releaseVelocity = 0;

  const hiddenOffset = computed(() => closedBottomSheetY(viewportHeight.value));

  const maxLegalSheetY = computed(() => maxBottomSheetY(viewportHeight.value));

  const transform = computed(
    () => `translate3d(0, ${offset.value - topGap}px, 0)`,
  );

  const scrimOpacity = computed(() => {
    const range = Math.max(minMeasuredSize, hiddenOffset.value - topGap);
    const progress = 1 - clamp((offset.value - topGap) / range, 0, 1);

    return Number((progress * maxScrimOpacity).toFixed(3));
  });

  function measure() {
    if (typeof window === "undefined") {
      return;
    }

    const visualViewportHeight = window.visualViewport?.height;
    const viewport =
      visualViewportHeight && visualViewportHeight >= minUsableViewportHeight
        ? visualViewportHeight
        : window.innerHeight;
    viewportHeight.value = viewportValue(viewport);
  }

  function snapTargets() {
    return resolveBottomSheetSnapTargets({
      viewportHeight: viewportHeight.value,
    });
  }

  function snapTarget(name: BottomSheetSnapPoint) {
    const targets = snapTargets();

    return (
      targets.find((target) => target.name === name) ??
      nearestBottomSheetSnapTarget(
        targets,
        yForBottomSheetSnap("full", viewportHeight.value),
      )
    );
  }

  function setBoundedOffset(value: number) {
    offset.value = clamp(value, minBottomSheetY(), hiddenOffset.value);
  }

  function setElasticDragOffset(value: number) {
    offset.value = resolveElasticDragOffset(
      value,
      minBottomSheetY(),
      maxLegalSheetY.value,
    );
  }

  function setAnimatedOffset(value: number) {
    offset.value =
      value < minBottomSheetY()
        ? Math.max(value, minBottomSheetY() - maxElasticOverscroll)
        : clamp(value, minBottomSheetY(), hiddenOffset.value);
  }

  function resetTransientState() {
    releaseVelocity = 0;
    dragStartOffset = 0;
    dragStartY = 0;
    lastDragSampleTime = 0;
    lastDragSampleY = 0;
    isDragging.value = false;
  }

  function completeSnap(point: BottomSheetSnapPoint) {
    if (point === "hidden") {
      state.value = "closed";
      activeSnapPoint.value = defaultBottomSheetSnapPoint;
      setBoundedOffset(hiddenOffset.value);
      resetTransientState();
      options.onHidden?.();
      return;
    }

    activeSnapPoint.value = point;
    state.value = "open";
    resetTransientState();
    options.onSnap?.(point);
  }

  function stopAnimation() {
    activeAnimation?.stop();
    activeAnimation = undefined;
    isAnimating.value = false;
  }

  function motionStateForTarget(
    point: BottomSheetSnapPoint,
    nextState?: BottomSheetState,
  ) {
    if (nextState) {
      return nextState;
    }

    if (point === "hidden") {
      return "closing";
    }

    return state.value === "closed" ? "opening" : "settling";
  }

  function animateTo(
    point: BottomSheetSnapPoint,
    onComplete?: () => void,
    nextState?: BottomSheetState,
  ) {
    measure();
    syncReducedMotion();
    stopAnimation();

    const target = snapTarget(point);
    const distance = Math.abs(target.offset - offset.value);
    state.value = motionStateForTarget(target.name, nextState);
    activeSnapPoint.value = target.name;

    if (prefersReducedMotion.value || distance < 1) {
      setBoundedOffset(target.offset);
      completeSnap(target.name);
      onComplete?.();
      return;
    }

    isAnimating.value = true;
    activeAnimation = animate({
      from: offset.value,
      to: target.offset,
      type: "keyframes",
      duration: animationDurationMs,
      ease: easeOut,
      onUpdate: setAnimatedOffset,
      onStop: () => {
        activeAnimation = undefined;
        isAnimating.value = false;
      },
      onComplete: () => {
        activeAnimation = undefined;
        isAnimating.value = false;
        setBoundedOffset(target.offset);
        completeSnap(target.name);
        onComplete?.();
      },
    });
  }

  function prepareOpen() {
    stopAnimation();
    cleanupDrag();
    measure();
    resetTransientState();
    activeSnapPoint.value = defaultBottomSheetSnapPoint;
    state.value = "opening";
    setBoundedOffset(hiddenOffset.value);
  }

  function open(onComplete?: () => void) {
    if (state.value !== "opening") {
      prepareOpen();
    }

    animateTo(defaultBottomSheetSnapPoint, onComplete, "opening");
  }

  function close() {
    stopAnimation();
    cleanupDrag();
    resetTransientState();
    animateTo("hidden", undefined, "closing");
  }

  function snapTo(point: BottomSheetSnapPoint) {
    animateTo(point, undefined, point === "hidden" ? "closing" : "settling");
  }

  function snapToNearest() {
    measure();
    const target = nearestBottomSheetSnapTarget(
      openSnapTargets(snapTargets()),
      offset.value,
    ).name;

    animateTo(target, undefined, "settling");
  }

  function snapAfterRelease() {
    measure();
    const target = releasedBottomSheetSnapTarget(
      snapTargets(),
      offset.value,
      releaseVelocity,
    ).name;

    resetTransientState();
    animateTo(target, undefined, "settling");
  }

  function cleanupDrag() {
    if (dragTarget && dragPointerId !== undefined) {
      try {
        dragTarget.releasePointerCapture(dragPointerId);
      } catch {
        // Pointer capture may already be released by the browser.
      }
    }

    if (typeof window !== "undefined") {
      window.removeEventListener("pointermove", onDragPointerMove);
      window.removeEventListener("pointerup", onDragPointerEnd);
      window.removeEventListener("pointercancel", onDragPointerEnd);
    }

    dragPointerId = undefined;
    dragTarget = undefined;
    isDragging.value = false;
  }

  function shouldIgnoreDragStart(event: PointerEvent) {
    return (
      event.target instanceof Element &&
      event.target.closest("[data-sheet-no-drag]") !== null
    );
  }

  function sampleDragVelocity(event: PointerEvent) {
    const elapsed = event.timeStamp - lastDragSampleTime;

    if (elapsed > 0) {
      releaseVelocity = (event.clientY - lastDragSampleY) / elapsed;
    }

    lastDragSampleTime = event.timeStamp;
    lastDragSampleY = event.clientY;
  }

  function onDragPointerMove(event: PointerEvent) {
    if (!isDragging.value || event.pointerId !== dragPointerId) {
      return;
    }

    event.preventDefault();
    sampleDragVelocity(event);
    setElasticDragOffset(dragStartOffset + event.clientY - dragStartY);
  }

  function onDragPointerEnd(event: PointerEvent) {
    if (!isDragging.value || event.pointerId !== dragPointerId) {
      return;
    }

    event.preventDefault();
    sampleDragVelocity(event);
    cleanupDrag();
    snapAfterRelease();
  }

  function onDragPointerDown(event: PointerEvent) {
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) {
      return;
    }

    if (shouldIgnoreDragStart(event)) {
      return;
    }

    const target = event.currentTarget;

    if (!(target instanceof HTMLElement)) {
      return;
    }

    event.preventDefault();
    stopAnimation();
    measure();

    dragPointerId = event.pointerId;
    dragTarget = target;
    dragStartOffset = offset.value;
    dragStartY = event.clientY;
    isDragging.value = true;
    lastDragSampleTime = event.timeStamp;
    lastDragSampleY = event.clientY;
    releaseVelocity = 0;
    state.value = "dragging";
    target.setPointerCapture(event.pointerId);

    window.addEventListener("pointermove", onDragPointerMove, { passive: false });
    window.addEventListener("pointerup", onDragPointerEnd);
    window.addEventListener("pointercancel", onDragPointerEnd);
  }

  function syncReducedMotion() {
    prefersReducedMotion.value = motionQuery?.matches ?? false;
  }

  function syncCurrentSnap() {
    if (isDragging.value || isAnimating.value) {
      return;
    }

    measure();

    if (state.value === "closed") {
      setBoundedOffset(hiddenOffset.value);
      return;
    }

    setBoundedOffset(snapTarget(activeSnapPoint.value).offset);
  }

  onMounted(() => {
    if (typeof window === "undefined") {
      return;
    }

    measure();
    setBoundedOffset(hiddenOffset.value);
    motionQuery = window.matchMedia(reducedMotionQuery);
    syncReducedMotion();
    motionQuery.addEventListener("change", syncReducedMotion);
    window.addEventListener("resize", syncCurrentSnap);
    window.visualViewport?.addEventListener("resize", syncCurrentSnap);
  });

  onBeforeUnmount(() => {
    stopAnimation();
    cleanupDrag();
    motionQuery?.removeEventListener("change", syncReducedMotion);

    if (typeof window !== "undefined") {
      window.removeEventListener("resize", syncCurrentSnap);
      window.visualViewport?.removeEventListener("resize", syncCurrentSnap);
    }
  });

  return {
    activeSnapPoint,
    close,
    hiddenOffset,
    isAnimating,
    isDragging,
    measure,
    offset,
    onDragPointerDown,
    open,
    prepareOpen,
    scrimOpacity,
    snapTo,
    snapToNearest,
    state,
    stopAnimation,
    transform,
  };
}
