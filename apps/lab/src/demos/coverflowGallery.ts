export const COVERFLOW_GALLERY_TUNING = {
  carouselActivationThreshold: 8,
  horizontalIntentRatio: 1.25,
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

export interface CoverflowSynchronization {
  readonly physicalIndex: number;
  readonly settledIndex: number;
  readonly targetIndex: number;
  readonly velocity: number;
  readonly visualIndex: number;
}

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

export function resolveCoverflowSynchronization(
  index: number,
  itemCount: number,
): CoverflowSynchronization {
  const synchronizedIndex = Math.min(
    Math.max(0, itemCount - 1),
    Math.max(0, Math.round(Number.isFinite(index) ? index : 0)),
  );
  return {
    physicalIndex: synchronizedIndex,
    visualIndex: synchronizedIndex,
    targetIndex: synchronizedIndex,
    settledIndex: synchronizedIndex,
    velocity: 0,
  };
}
