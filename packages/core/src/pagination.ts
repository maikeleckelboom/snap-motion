import { clamp } from "./bounds";
import { resolveSpeedInCards } from "./kinetics";

/**
 * Geometry and responsiveness of the fixed pagination rail.
 *
 * `slotSize` and `slotGap` describe a hit target rather than a look, and the stretch response is
 * physical tuning: the indicator reports how fast the surface behind it is moving. A product theme
 * still owns colour, radius, and whether the rail is drawn at all.
 */
export const PAGINATION_INDICATOR_TUNING = {
  slotSize: 44,
  slotGap: 2,
  restingWidth: 22.4,
  height: 8.8,
  maximumStretchRatio: 0.42,
  stretchStartSpeed: 0.35,
  stretchFullSpeed: 4.5,
  directionSofteningSpeed: 1.5,
  directionalBias: 0.18,
  visualHysteresis: 0.04,
} as const;

export interface PaginationIndicatorState {
  position: number;
  x: number;
  scaleX: number;
  stretchRatio: number;
  speedInCards: number;
  softDirection: number;
  leftStretch: number;
  rightStretch: number;
}

function smoothstepRange(minimum: number, maximum: number, value: number): number {
  if (maximum <= minimum) {
    return value < minimum ? 0 : 1;
  }
  const normalized = clamp((value - minimum) / (maximum - minimum), 0, 1);
  return normalized * normalized * (3 - 2 * normalized);
}

/** Neutral indicator storage, so a caller that has no velocity to report still starts from rest. */
export function createPaginationIndicatorState(): PaginationIndicatorState {
  return {
    position: 0,
    x: 0,
    scaleX: 1,
    stretchRatio: 0,
    speedInCards: 0,
    softDirection: 0,
    leftStretch: 0,
    rightStretch: 0,
  };
}

/**
 * Projects the physical carousel mass onto the fixed pagination rail. The physical position owns
 * translation; velocity contributes only a bounded, directionally biased capsule stretch.
 */
export function resolvePaginationIndicator(
  physicalIndex: number,
  velocityPxPerSecond: number,
  cardPitchPx: number,
  itemCount: number,
  output: PaginationIndicatorState,
): PaginationIndicatorState {
  const maximumIndex = Math.max(0, itemCount - 1);
  const position = clamp(Number.isFinite(physicalIndex) ? physicalIndex : 0, 0, maximumIndex);
  const speedInCards = resolveSpeedInCards(velocityPxPerSecond, cardPitchPx);
  const stretchProgress = smoothstepRange(
    PAGINATION_INDICATOR_TUNING.stretchStartSpeed,
    PAGINATION_INDICATOR_TUNING.stretchFullSpeed,
    speedInCards,
  );
  const stretchRatio = PAGINATION_INDICATOR_TUNING.maximumStretchRatio * stretchProgress;
  const totalStretch = PAGINATION_INDICATOR_TUNING.restingWidth * stretchRatio;
  const signedSpeedInCards =
    Number.isFinite(velocityPxPerSecond) && cardPitchPx > 0
      ? -velocityPxPerSecond / cardPitchPx
      : 0;
  const softDirection = clamp(
    signedSpeedInCards / PAGINATION_INDICATOR_TUNING.directionSofteningSpeed,
    -1,
    1,
  );
  const leftStretch =
    totalStretch * (0.5 - PAGINATION_INDICATOR_TUNING.directionalBias * softDirection);
  const rightStretch =
    totalStretch * (0.5 + PAGINATION_INDICATOR_TUNING.directionalBias * softDirection);
  const slotPitch = PAGINATION_INDICATOR_TUNING.slotSize + PAGINATION_INDICATOR_TUNING.slotGap;

  output.position = position;
  output.x = position * slotPitch + (rightStretch - leftStretch) / 2;
  output.scaleX = 1 + stretchRatio;
  output.stretchRatio = stretchRatio;
  output.speedInCards = speedInCards;
  output.softDirection = softDirection;
  output.leftStretch = leftStretch;
  output.rightStretch = rightStretch;
  return output;
}
