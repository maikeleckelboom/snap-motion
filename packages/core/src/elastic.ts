import { assertFiniteNumber, assertNonNegative, createBounds } from "./bounds.js";
import type { ElasticBoundaryOptions, ElasticityOptions, ScalarBounds } from "./types.js";

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

export function applyElasticity(
  position: number,
  bounds: ScalarBounds,
  elasticity: ElasticityOptions = {},
): number {
  assertFiniteNumber(position, "position");
  const validBounds = createBounds(bounds.min, bounds.max);

  if (position < validBounds.min) {
    const boundary = validateBoundary(elasticity.min, "elasticity.min");
    return boundary === false
      ? validBounds.min
      : validBounds.min - nonlinearElasticDistance(validBounds.min - position, boundary);
  }

  if (position > validBounds.max) {
    const boundary = validateBoundary(elasticity.max, "elasticity.max");
    return boundary === false
      ? validBounds.max
      : validBounds.max + nonlinearElasticDistance(position - validBounds.max, boundary);
  }

  return position;
}

export function validateElasticityOptions(elasticity: ElasticityOptions): void {
  validateBoundary(elasticity.min, "elasticity.min");
  validateBoundary(elasticity.max, "elasticity.max");
}

export function createSymmetricElasticity(boundary: ElasticBoundaryOptions): ElasticityOptions {
  validateBoundary(boundary, "boundary");
  return { min: { ...boundary }, max: { ...boundary } };
}
