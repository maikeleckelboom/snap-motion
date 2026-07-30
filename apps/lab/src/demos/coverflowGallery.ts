import type {
  MediaPoint,
  MediaTransform,
  MediaTransformContext,
} from "../media-inspection/media-transform-contracts";
import {
  constrainMediaTransform,
  zoomMediaTransform,
} from "../media-inspection/media-transform-math";

export interface CoverflowGalleryItem {
  readonly id: string;
  readonly title: string;
  readonly alt: string;
  readonly thumbnailSrc: string;
  readonly fullSrc: string;
  readonly width: number;
  readonly height: number;
}

export const COVERFLOW_GALLERY_TUNING = {
  carouselActivationThreshold: 8,
  horizontalIntentRatio: 1.25,
  gallerySwipeThreshold: 8,
  gallerySwipeDistanceRatio: 0.14,
  gallerySwipeVelocity: 460,
  doubleTapDelay: 320,
  doubleTapDistance: 24,
  zoomStep: 0.5,
  doubleTapScale: 2,
  closeDuration: 220,
} as const;

export type CoverflowGestureAction = "none" | "open" | "select" | "swipe";

export interface CoverflowGestureResolution {
  readonly action: CoverflowGestureAction;
  readonly shouldFocusStage: boolean;
}

export interface CoverflowGestureInput {
  readonly cancelled: boolean;
  readonly crossedDragThreshold: boolean;
  readonly horizontalIntent: boolean;
  readonly involvedMultiplePointers: boolean;
  readonly openEligibleAtStart: boolean;
  readonly releasedOnOrigin: boolean;
}

export interface CoverflowOpenEligibilityInput {
  readonly activeId: string | undefined;
  readonly expectedId: string;
  readonly index: number;
  readonly phase: string;
  readonly physicalIndex: number;
  readonly position: number;
  readonly settledIndex: number;
  readonly targetId: string | undefined;
  readonly velocity: number;
  readonly restDistance: number;
  readonly restSpeed: number;
  readonly targetPosition: number | undefined;
}

export interface GallerySwipeInput {
  readonly cancelled: boolean;
  readonly deltaX: number;
  readonly deltaY: number;
  readonly elapsedMs: number;
  readonly index: number;
  readonly itemCount: number;
  readonly scale: number;
  readonly viewportWidth: number;
}

export interface GalleryTap {
  readonly time: number;
  readonly x: number;
  readonly y: number;
}

export type GallerySlotPosition = -1 | 0 | 1;

export interface GalleryTrackSlot {
  readonly itemIndex: number;
  readonly position: GallerySlotPosition;
}

export interface GalleryMediaVisibility {
  readonly fullMounted: boolean;
  readonly fullVisible: boolean;
  readonly previewVisible: boolean;
}

export type GalleryMediaAction =
  | "button"
  | "double-click"
  | "double-tap"
  | "fit"
  | "keyboard"
  | "pan"
  | "pinch"
  | "swipe";

export interface PinchTransformInput {
  readonly context: MediaTransformContext;
  readonly currentCenter: MediaPoint;
  readonly currentDistance: number;
  readonly initialCenter: MediaPoint;
  readonly initialDistance: number;
  readonly initialTransform: MediaTransform;
}

export interface CoverflowSynchronization {
  readonly physicalIndex: number;
  readonly settledIndex: number;
  readonly targetIndex: number;
  readonly velocity: number;
  readonly visualIndex: number;
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

export function resolveCoverflowGesture(input: CoverflowGestureInput): CoverflowGestureResolution {
  if (input.cancelled || input.involvedMultiplePointers) {
    return { action: "none", shouldFocusStage: false };
  }
  if (input.crossedDragThreshold) {
    return input.horizontalIntent
      ? { action: "swipe", shouldFocusStage: true }
      : { action: "none", shouldFocusStage: false };
  }
  if (!input.releasedOnOrigin) {
    return { action: "none", shouldFocusStage: false };
  }
  return input.openEligibleAtStart
    ? { action: "open", shouldFocusStage: false }
    : { action: "select", shouldFocusStage: false };
}

export function isCoverflowGalleryEligible(input: CoverflowOpenEligibilityInput): boolean {
  const targetPosition = input.targetPosition;
  return (
    input.phase === "idle" &&
    input.activeId === input.expectedId &&
    input.targetId === input.expectedId &&
    input.settledIndex === input.index &&
    Math.abs(input.physicalIndex - input.index) <= Number.EPSILON * 16 &&
    targetPosition !== undefined &&
    Math.abs(input.position - targetPosition) <= Math.max(0, input.restDistance) &&
    Math.abs(input.velocity) <= Math.max(0, input.restSpeed)
  );
}

export function resolveGallerySwipe(input: GallerySwipeInput): -1 | 0 | 1 {
  if (input.cancelled || input.scale > 1.001 || input.itemCount <= 1 || input.viewportWidth <= 0) {
    return 0;
  }

  const horizontal = Math.abs(input.deltaX);
  const vertical = Math.abs(input.deltaY);
  if (
    horizontal < COVERFLOW_GALLERY_TUNING.gallerySwipeThreshold ||
    horizontal < vertical * COVERFLOW_GALLERY_TUNING.horizontalIntentRatio
  ) {
    return 0;
  }

  const elapsedSeconds = Math.max(1, input.elapsedMs) / 1_000;
  const velocity = horizontal / elapsedSeconds;
  const displacement =
    horizontal >= input.viewportWidth * COVERFLOW_GALLERY_TUNING.gallerySwipeDistanceRatio;
  if (!displacement && velocity < COVERFLOW_GALLERY_TUNING.gallerySwipeVelocity) {
    return 0;
  }

  const direction = input.deltaX < 0 ? 1 : -1;
  const nextIndex = clamp(input.index + direction, 0, input.itemCount - 1);
  return nextIndex === input.index ? 0 : direction;
}

export function galleryPreloadIndices(index: number, itemCount: number): number[] {
  if (itemCount <= 0) return [];
  const current = clamp(Math.round(index), 0, itemCount - 1);
  return [current - 1, current, current + 1].filter(
    (candidate, position, candidates) =>
      candidate >= 0 && candidate < itemCount && candidates.indexOf(candidate) === position,
  );
}

export function resolveGalleryTrackSlots(
  index: number,
  itemCount: number,
  destinationIndex?: number,
): GalleryTrackSlot[] {
  if (itemCount <= 0) return [];
  const current = clamp(Math.round(index), 0, itemCount - 1);
  const destination =
    destinationIndex === undefined
      ? current
      : clamp(Math.round(destinationIndex), 0, itemCount - 1);
  const direction = Math.sign(destination - current) as GallerySlotPosition;
  const positions = new Map<number, GallerySlotPosition>();

  if (direction !== 0 && Math.abs(destination - current) > 1) {
    const opposite = current - direction;
    if (opposite >= 0 && opposite < itemCount)
      positions.set(opposite, -direction as GallerySlotPosition);
    positions.set(current, 0);
    positions.set(destination, direction);
  } else {
    for (const candidate of galleryPreloadIndices(current, itemCount)) {
      positions.set(candidate, (candidate - current) as GallerySlotPosition);
    }
  }

  const slots = [...positions].map(([itemIndex, position]) => ({ itemIndex, position }));
  return ([-1, 0, 1] as const).flatMap((position) =>
    slots.filter((slot) => slot.position === position),
  );
}

export function resolveGalleryTrackOffset(
  dragOffset: number,
  viewportWidth: number,
  index: number,
  itemCount: number,
): number {
  if (viewportWidth <= 0 || itemCount <= 0) return 0;
  const beyondStart = index <= 0 && dragOffset > 0;
  const beyondEnd = index >= itemCount - 1 && dragOffset < 0;
  const resolved = beyondStart || beyondEnd ? dragOffset * 0.08 : dragOffset;
  const limit = beyondStart || beyondEnd ? Math.min(24, viewportWidth * 0.05) : viewportWidth;
  return clamp(resolved, -limit, limit);
}

export function resolveGalleryCommitOffset(direction: -1 | 1, viewportWidth: number): number {
  return -direction * Math.max(0, viewportWidth);
}

export function shouldTransitionGalleryMedia(
  action: GalleryMediaAction,
  reducedMotion: boolean,
): boolean {
  return (
    !reducedMotion &&
    (action === "button" ||
      action === "double-click" ||
      action === "double-tap" ||
      action === "fit" ||
      action === "keyboard")
  );
}

export function resolveGalleryMediaVisibility(
  state: "failed" | "loaded" | "pending",
): GalleryMediaVisibility {
  return {
    fullMounted: state !== "failed",
    fullVisible: state === "loaded",
    previewVisible: state !== "loaded",
  };
}

export function isRepeatedGalleryTap(
  previous: GalleryTap | undefined,
  current: GalleryTap,
): boolean {
  if (!previous) return false;
  return (
    current.time - previous.time >= 0 &&
    current.time - previous.time <= COVERFLOW_GALLERY_TUNING.doubleTapDelay &&
    Math.hypot(current.x - previous.x, current.y - previous.y) <=
      COVERFLOW_GALLERY_TUNING.doubleTapDistance
  );
}

export function resolvePinchTransform(input: PinchTransformInput): MediaTransform {
  const initialDistance = Math.max(Number.EPSILON, input.initialDistance);
  const scale = input.initialTransform.scale * (input.currentDistance / initialDistance);
  const zoomed = zoomMediaTransform(
    input.initialTransform,
    scale,
    input.initialCenter,
    input.context,
  );
  return constrainMediaTransform(
    {
      scale: zoomed.scale,
      x: zoomed.x + input.currentCenter.x - input.initialCenter.x,
      y: zoomed.y + input.currentCenter.y - input.initialCenter.y,
    },
    input.context,
  );
}

export function canonicalCoverflowGalleryTransform(
  transform: MediaTransform,
  context: MediaTransformContext,
): MediaTransform {
  const constrained = constrainMediaTransform(transform, context);
  return constrained.scale <= 1.001 ? { scale: 1, x: 0, y: 0 } : constrained;
}

export function resolveCoverflowSynchronization(
  index: number,
  itemCount: number,
): CoverflowSynchronization {
  const synchronizedIndex = clamp(Math.round(index), 0, Math.max(0, itemCount - 1));
  return {
    physicalIndex: synchronizedIndex,
    visualIndex: synchronizedIndex,
    targetIndex: synchronizedIndex,
    settledIndex: synchronizedIndex,
    velocity: 0,
  };
}
