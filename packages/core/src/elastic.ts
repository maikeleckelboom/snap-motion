import { assertFiniteNumber, assertNonNegative, createBounds } from "./bounds";
import type { ElasticBoundaryOptions, ElasticityOptions, ScalarBounds } from "./types";

function validateBoundary(
  boundary: ElasticBoundaryOptions | false | undefined,
  name: string,
): ElasticBoundaryOptions | false {
  if (boundary === false || boundary === undefined) {
    return false;
  }

  assertFiniteNumber(boundary.resistance, `${name}.resistance`);
  assertNonNegative(boundary.maxDistance, `${name}.maxDistance`);
  if (boundary.resistance < 1) {
    throw new RangeError(`${name}.resistance must be greater than or equal to one`);
  }
  return boundary;
}

export function nonlinearElasticDistance(
  distance: number,
  boundary: ElasticBoundaryOptions,
): number {
  assertNonNegative(distance, "distance");
  const validBoundary = validateBoundary(boundary, "boundary");
  if (validBoundary === false || distance === 0 || validBoundary.maxDistance === 0) {
    return 0;
  }

  const { maxDistance, resistance } = validBoundary;
  return (maxDistance * distance) / (distance + maxDistance * resistance);
}

/**
 * Constrains a position to an envelope, resisting rather than clamping wherever the matching
 * boundary is configured. A disabled side passes straight through, which lets a temporary
 * interaction envelope resist only its interior limits while the physical bounds keep their own.
 */
export function applyEnvelopeElasticity(
  position: number,
  envelope: ScalarBounds,
  elasticity: ElasticityOptions = {},
  activeMin = true,
  activeMax = true,
): number {
  assertFiniteNumber(position, "position");
  const validEnvelope = createBounds(envelope.min, envelope.max);

  if (activeMin && position < validEnvelope.min) {
    const boundary = validateBoundary(elasticity.min, "elasticity.min");
    return boundary === false
      ? validEnvelope.min
      : validEnvelope.min - nonlinearElasticDistance(validEnvelope.min - position, boundary);
  }

  if (activeMax && position > validEnvelope.max) {
    const boundary = validateBoundary(elasticity.max, "elasticity.max");
    return boundary === false
      ? validEnvelope.max
      : validEnvelope.max + nonlinearElasticDistance(position - validEnvelope.max, boundary);
  }

  return position;
}

export function applyElasticity(
  position: number,
  bounds: ScalarBounds,
  elasticity: ElasticityOptions = {},
): number {
  return applyEnvelopeElasticity(position, bounds, elasticity);
}

export function validateElasticityOptions(elasticity: ElasticityOptions): void {
  validateBoundary(elasticity.min, "elasticity.min");
  validateBoundary(elasticity.max, "elasticity.max");
}

export function createSymmetricElasticity(boundary: ElasticBoundaryOptions): ElasticityOptions {
  validateBoundary(boundary, "boundary");
  return { min: { ...boundary }, max: { ...boundary } };
}
