import { describe, expect, it } from "vitest";

import {
  createCoverflowGeometry,
  resolveCoverflowPresentation,
  resolveCoverflowProgress,
} from "../src";

describe("coverflow geometry", () => {
  it("places equal-pitch anchors on one scalar axis", () => {
    const geometry = createCoverflowGeometry({
      itemIds: ["a", "b", "c"],
      pitch: 240,
      viewportSize: 800,
    });
    expect(geometry.pitch).toBe(240);
    expect(geometry.bounds).toEqual({ min: -480, max: 0 });
    expect(geometry.anchors.map((anchor) => anchor.position)).toEqual([0, -240, -480]);
  });
});

describe("coverflow presentation", () => {
  it("keeps progress linear with controller position", () => {
    expect(
      resolveCoverflowProgress({ position: -120, anchorPosition: 0, pitch: 240 }),
    ).toBeCloseTo(-0.5);
    expect(
      resolveCoverflowProgress({ position: -120, anchorPosition: -240, pitch: 240 }),
    ).toBeCloseTo(0.5);
  });

  it("keeps the center face solid and clear of side bleed", () => {
    const center = resolveCoverflowPresentation({ progress: 0, sidePeakX: 200 });
    expect(center.opacity).toBe(1);
    expect(center.translateX).toBe(0);
    expect(center.rotateY).toBe(0);
    expect(center.scale).toBe(1);
  });

  it("parks the first side card at the rail, then stacks deeper cards behind it", () => {
    const side = resolveCoverflowPresentation({
      progress: 1,
      sidePeakX: 200,
      stackGapX: 30,
      maxRotateY: 50,
      sideDepth: -120,
      stackGapZ: -40,
    });
    const deeper = resolveCoverflowPresentation({
      progress: 2,
      sidePeakX: 200,
      stackGapX: 30,
      maxRotateY: 50,
      sideDepth: -120,
      stackGapZ: -40,
    });

    expect(side.translateX).toBeCloseTo(200);
    expect(Math.abs(side.rotateY)).toBeCloseTo(50);
    expect(deeper.translateX).toBeCloseTo(230);
    expect(Math.abs(deeper.rotateY)).toBeCloseTo(50);
    expect(deeper.translateZ).toBeLessThan(side.translateZ);
    expect(deeper.zIndex).toBeLessThan(side.zIndex);
  });

  it("clears the center during the first half-step instead of piling cards", () => {
    const half = resolveCoverflowPresentation({
      progress: 0.5,
      sidePeakX: 200,
      maxRotateY: 50,
      sideOpacity: 1,
    });
    expect(half.translateX).toBeGreaterThan(50);
    expect(Math.abs(half.rotateY)).toBeGreaterThan(10);
    expect(half.opacity).toBe(1);
  });

  it("flattens under reduced motion", () => {
    const reduced = resolveCoverflowPresentation({
      progress: 1,
      reducedMotion: true,
      sidePeakX: 200,
    });
    expect(reduced.rotateY).toBe(0);
    expect(reduced.translateZ).toBe(0);
    expect(reduced.translateX).toBeCloseTo(200);
  });
});
