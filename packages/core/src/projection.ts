import { assertFiniteNumber, assertNonNegative } from "./bounds";

export function projectPosition(
  position: number,
  velocityPixelsPerSecond: number,
  durationSeconds: number,
): number {
  assertFiniteNumber(position, "position");
  assertFiniteNumber(velocityPixelsPerSecond, "velocityPixelsPerSecond");
  assertNonNegative(durationSeconds, "durationSeconds");
  return position + velocityPixelsPerSecond * durationSeconds;
}
