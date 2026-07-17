import { describe, expect, it } from "vitest";

import {
  applyElasticity,
  clampToBounds,
  createBounds,
  createSymmetricElasticity,
  getTrackBounds,
  isWithinBounds,
  nonlinearElasticDistance,
  normalizeBounds,
} from "../src";

describe("scalar bounds", () => {
  it("creates an ordered finite range", () => {
    expect(createBounds(-300, 0)).toEqual({ min: -300, max: 0 });
    expect(() => createBounds(1, 0)).toThrow(/must not be greater/);
    expect(() => createBounds(Number.NaN, 0)).toThrow(/finite/);
  });

  it("normalizes a deliberately unordered range", () => {
    expect(normalizeBounds(20, -40)).toEqual({ min: -40, max: 20 });
  });

  it("derives normalized transform bounds for long and short tracks", () => {
    expect(getTrackBounds(320, 920)).toEqual({ min: -600, max: 0 });
    expect(getTrackBounds(320, 200)).toEqual({ min: 0, max: 0 });
  });

  it("clamps and tests legal values including degenerate bounds", () => {
    const bounds = createBounds(-100, 0);
    expect(clampToBounds(-120, bounds)).toBe(-100);
    expect(clampToBounds(20, bounds)).toBe(0);
    expect(isWithinBounds(-50, bounds)).toBe(true);
    expect(isWithinBounds(-101, bounds)).toBe(false);
    expect(clampToBounds(3, createBounds(0, 0))).toBe(0);
  });
});

describe("nonlinear elastic overdrag", () => {
  const bounds = createBounds(-100, 0);
  const elasticity = createSymmetricElasticity({ resistance: 2, maxDistance: 40 });

  it("leaves legal direct manipulation unchanged", () => {
    expect(applyElasticity(-100, bounds, elasticity)).toBe(-100);
    expect(applyElasticity(-40, bounds, elasticity)).toBe(-40);
    expect(applyElasticity(0, bounds, elasticity)).toBe(0);
  });

  it("resists minimum and maximum overdrag independently", () => {
    expect(applyElasticity(-140, bounds, elasticity)).toBeCloseTo(-113.333333, 5);
    expect(applyElasticity(40, bounds, elasticity)).toBeCloseTo(13.333333, 5);
  });

  it("clamps a disabled boundary while keeping the other elastic", () => {
    const asymmetric = {
      min: { resistance: 3, maxDistance: 30 },
      max: false as const,
    };
    expect(applyElasticity(-130, bounds, asymmetric)).toBeCloseTo(-107.5);
    expect(applyElasticity(30, bounds, asymmetric)).toBe(0);
  });

  it("is nonlinear rather than a fixed overdrag multiplier", () => {
    const small = nonlinearElasticDistance(10, { resistance: 2, maxDistance: 40 });
    const large = nonlinearElasticDistance(100, { resistance: 2, maxDistance: 40 });
    expect(small / 10).toBeGreaterThan(large / 100);
  });

  it("never reaches the configured maximum elastic distance", () => {
    expect(nonlinearElasticDistance(1_000_000, { resistance: 2, maxDistance: 40 })).toBeLessThan(
      40,
    );
  });

  it("is position-continuous at both legal boundaries", () => {
    expect(applyElasticity(-100 - 1e-7, bounds, elasticity)).toBeCloseTo(-100, 6);
    expect(applyElasticity(1e-7, bounds, elasticity)).toBeCloseTo(0, 6);
  });

  it("supports different resistance and travel per side", () => {
    const asymmetric = {
      min: { resistance: 4, maxDistance: 20 },
      max: { resistance: 1, maxDistance: 80 },
    };
    const minimumTravel = Math.abs(applyElasticity(-180, bounds, asymmetric) - bounds.min);
    const maximumTravel = applyElasticity(80, bounds, asymmetric) - bounds.max;
    expect(maximumTravel).toBeGreaterThan(minimumTravel);
  });

  it("rejects invalid physical parameters", () => {
    expect(() => nonlinearElasticDistance(10, { resistance: 0.5, maxDistance: 40 })).toThrow(
      /resistance/,
    );
    expect(() => nonlinearElasticDistance(10, { resistance: 2, maxDistance: -1 })).toThrow(
      /maxDistance/,
    );
  });
});
