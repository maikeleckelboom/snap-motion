import type { ScalarBounds } from "./types";

export function assertFiniteNumber(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number`);
  }
}

export function assertNonNegative(value: number, name: string): void {
  assertFiniteNumber(value, name);
  if (value < 0) {
    throw new RangeError(`${name} must be greater than or equal to zero`);
  }
}

export function createBounds(min: number, max: number): ScalarBounds {
  assertFiniteNumber(min, "min");
  assertFiniteNumber(max, "max");
  if (min > max) {
    throw new RangeError(`min (${min}) must not be greater than max (${max})`);
  }

  return { min, max };
}

export function normalizeBounds(min: number, max: number): ScalarBounds {
  assertFiniteNumber(min, "min");
  assertFiniteNumber(max, "max");
  return min <= max ? { min, max } : { min: max, max: min };
}

export function getTrackBounds(viewportSize: number, trackExtent: number): ScalarBounds {
  assertNonNegative(viewportSize, "viewportSize");
  assertNonNegative(trackExtent, "trackExtent");
  return { min: Math.min(0, viewportSize - trackExtent), max: 0 };
}

export function clampToBounds(position: number, bounds: ScalarBounds): number {
  assertFiniteNumber(position, "position");
  const validBounds = createBounds(bounds.min, bounds.max);
  const clamped = Math.min(validBounds.max, Math.max(validBounds.min, position));
  return Object.is(clamped, -0) ? 0 : clamped;
}

export function isWithinBounds(position: number, bounds: ScalarBounds): boolean {
  assertFiniteNumber(position, "position");
  const validBounds = createBounds(bounds.min, bounds.max);
  return position >= validBounds.min && position <= validBounds.max;
}
