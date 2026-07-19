import { describe, expect, it } from "vitest";

import type { MediaTransformContext } from "../src/media-inspection/media-transform-contracts";
import {
  constrainMediaTransform,
  fitMediaWithinViewport,
  interpolateMediaTransform,
  panMediaTransform,
  resolveMediaTransformBounds,
  zoomMediaTransform,
} from "../src/media-inspection/media-transform-math";

const landscapeContext: MediaTransformContext = {
  intrinsicSize: { height: 600, width: 1_000 },
  viewportSize: { height: 600, width: 1_000 },
};

describe("media transform math", () => {
  it("fits intrinsic media without changing the viewport contract", () => {
    expect(
      fitMediaWithinViewport({ height: 500, width: 800 }, { height: 1_600, width: 12_000 }),
    ).toEqual({ height: 106.66666666666667, width: 800 });
    const tallFit = fitMediaWithinViewport(
      { height: 500, width: 800 },
      { height: 12_000, width: 1_600 },
    );
    expect(tallFit.height).toBe(500);
    expect(tallFit.width).toBeCloseTo(66.6667, 4);
  });

  it("derives axis-specific pan bounds from fitted media", () => {
    expect(resolveMediaTransformBounds(landscapeContext, 2)).toEqual({ maxX: 500, maxY: 300 });
    expect(
      resolveMediaTransformBounds(
        {
          intrinsicSize: { height: 1_600, width: 12_000 },
          viewportSize: { height: 500, width: 800 },
        },
        2,
      ),
    ).toEqual({ maxX: 400, maxY: 0 });
  });

  it("keeps the focal media point stationary while zooming", () => {
    expect(
      zoomMediaTransform({ scale: 1, x: 0, y: 0 }, 2, { x: 200, y: -100 }, landscapeContext),
    ).toEqual({ scale: 2, x: -200, y: 100 });
  });

  it("clamps pan and scale instead of handing an edge drag to the carousel", () => {
    expect(
      panMediaTransform({ scale: 2, x: 0, y: 0 }, { x: 5_000, y: -5_000 }, landscapeContext),
    ).toEqual({ scale: 2, x: 500, y: -300 });
    expect(
      constrainMediaTransform(
        { scale: Number.POSITIVE_INFINITY, x: Number.NaN, y: 8 },
        landscapeContext,
      ),
    ).toEqual({ scale: 1, x: 0, y: 0 });
  });

  it("interpolates the one authoritative transform deterministically", () => {
    expect(
      interpolateMediaTransform({ scale: 1, x: 0, y: 0 }, { scale: 3, x: -120, y: 80 }, 0.25),
    ).toEqual({ scale: 1.5, x: -30, y: 20 });
  });
});
