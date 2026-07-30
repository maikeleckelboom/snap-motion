import { describe, expect, it } from "vitest";

import {
  COVERFLOW_GALLERY_TUNING,
  canonicalCoverflowGalleryTransform,
  galleryPreloadIndices,
  isCoverflowGalleryEligible,
  isRepeatedGalleryTap,
  resolveCoverflowGesture,
  resolveCoverflowSynchronization,
  resolveGallerySwipe,
  resolvePinchTransform,
  type CoverflowOpenEligibilityInput,
  type GallerySwipeInput,
} from "../src/demos/coverflowGallery";
import type { MediaTransformContext } from "../src/media-inspection/media-transform-contracts";
import {
  constrainMediaTransform,
  panMediaTransform,
  resolveMediaTransformBounds,
  zoomMediaTransform,
} from "../src/media-inspection/media-transform-math";

const settledEligibility: CoverflowOpenEligibilityInput = {
  activeId: "map",
  expectedId: "map",
  index: 2,
  phase: "idle",
  physicalIndex: 2,
  position: -560,
  settledIndex: 2,
  targetId: "map",
  velocity: 0,
  restDistance: 0.6,
  restSpeed: 10,
  targetPosition: -560,
};

const swipeAtFit: GallerySwipeInput = {
  cancelled: false,
  deltaX: -120,
  deltaY: 8,
  elapsedMs: 400,
  index: 2,
  itemCount: 5,
  scale: 1,
  viewportWidth: 800,
};

const landscapeContext: MediaTransformContext = {
  intrinsicSize: { height: 1_000, width: 1_600 },
  viewportSize: { height: 625, width: 1_000 },
};

describe("coverflow pointer arbitration", () => {
  it("opens only a settled active card released on its origin", () => {
    expect(
      resolveCoverflowGesture({
        cancelled: false,
        crossedDragThreshold: false,
        horizontalIntent: false,
        involvedMultiplePointers: false,
        openEligibleAtStart: true,
        releasedOnOrigin: true,
      }),
    ).toEqual({ action: "open", shouldFocusStage: false });
  });

  it("selects an inactive card without opening it", () => {
    expect(
      resolveCoverflowGesture({
        cancelled: false,
        crossedDragThreshold: false,
        horizontalIntent: false,
        involvedMultiplePointers: false,
        openEligibleAtStart: false,
        releasedOnOrigin: true,
      }),
    ).toEqual({ action: "select", shouldFocusStage: false });
  });

  it("assigns stage focus only to a genuine horizontal swipe", () => {
    expect(
      resolveCoverflowGesture({
        cancelled: false,
        crossedDragThreshold: true,
        horizontalIntent: true,
        involvedMultiplePointers: false,
        openEligibleAtStart: true,
        releasedOnOrigin: true,
      }),
    ).toEqual({ action: "swipe", shouldFocusStage: true });
  });

  it.each([
    ["vertical movement", false, true, false],
    ["pointer cancellation", true, true, false],
    ["multiple pointers", false, true, true],
  ])(
    "does nothing after %s",
    (_label, cancelled, crossedDragThreshold, involvedMultiplePointers) => {
      expect(
        resolveCoverflowGesture({
          cancelled,
          crossedDragThreshold,
          horizontalIntent: false,
          involvedMultiplePointers,
          openEligibleAtStart: true,
          releasedOnOrigin: true,
        }),
      ).toEqual({ action: "none", shouldFocusStage: false });
    },
  );

  it("does nothing when a tap is released over a different card", () => {
    expect(
      resolveCoverflowGesture({
        cancelled: false,
        crossedDragThreshold: false,
        horizontalIntent: false,
        involvedMultiplePointers: false,
        openEligibleAtStart: true,
        releasedOnOrigin: false,
      }),
    ).toEqual({ action: "none", shouldFocusStage: false });
  });
});

describe("coverflow gallery eligibility", () => {
  it("accepts the exact settled identity and physical state", () => {
    expect(isCoverflowGalleryEligible(settledEligibility)).toBe(true);
  });

  it.each([
    ["phase", { phase: "settling" }],
    ["active identity", { activeId: "project" }],
    ["target identity", { targetId: "team" }],
    ["settled index", { settledIndex: 1 }],
    ["physical index", { physicalIndex: 2.01 }],
    ["position", { position: -558 }],
    ["velocity", { velocity: 12 }],
  ])("rejects a mismatch in %s", (_label, change) => {
    expect(isCoverflowGalleryEligible({ ...settledEligibility, ...change })).toBe(false);
  });
});

describe("gallery navigation gestures", () => {
  it("navigates by sufficient displacement at fit", () => {
    expect(resolveGallerySwipe(swipeAtFit)).toBe(1);
    expect(resolveGallerySwipe({ ...swipeAtFit, deltaX: 120 })).toBe(-1);
  });

  it("navigates by velocity without requiring the distance threshold", () => {
    expect(resolveGallerySwipe({ ...swipeAtFit, deltaX: -48, elapsedMs: 60 })).toBe(1);
  });

  it.each([
    ["zoom ownership", { scale: 2 }],
    ["vertical intent", { deltaX: -100, deltaY: 120 }],
    ["cancellation", { cancelled: true }],
    ["short slow motion", { deltaX: -48, elapsedMs: 600 }],
    ["leading boundary", { deltaX: 120, index: 0 }],
    ["trailing boundary", { deltaX: -120, index: 4 }],
  ])("does not navigate during %s", (_label, change) => {
    expect(resolveGallerySwipe({ ...swipeAtFit, ...change })).toBe(0);
  });

  it("preloads only the current item and its immediate neighbors", () => {
    expect(galleryPreloadIndices(0, 5)).toEqual([0, 1]);
    expect(galleryPreloadIndices(2, 5)).toEqual([1, 2, 3]);
    expect(galleryPreloadIndices(4, 5)).toEqual([3, 4]);
    expect(galleryPreloadIndices(0, 0)).toEqual([]);
  });
});

describe("gallery zoom and synchronization", () => {
  it("recognizes a repeated touch within the time and distance envelope", () => {
    const previous = { time: 100, x: 50, y: 80 };
    expect(isRepeatedGalleryTap(previous, { time: 400, x: 68, y: 92 })).toBe(true);
    expect(
      isRepeatedGalleryTap(previous, {
        time: 100 + COVERFLOW_GALLERY_TUNING.doubleTapDelay + 1,
        x: 50,
        y: 80,
      }),
    ).toBe(false);
    expect(isRepeatedGalleryTap(previous, { time: 200, x: 90, y: 80 })).toBe(false);
  });

  it("combines pinch scale and center movement in one constrained transform", () => {
    expect(
      resolvePinchTransform({
        context: landscapeContext,
        currentCenter: { x: 60, y: -15 },
        currentDistance: 300,
        initialCenter: { x: 40, y: -20 },
        initialDistance: 150,
        initialTransform: { scale: 1, x: 0, y: 0 },
      }),
    ).toEqual({ scale: 2, x: -20, y: 25 });
  });

  it("clamps pinch zoom and pan to the media bounds", () => {
    expect(
      resolvePinchTransform({
        context: landscapeContext,
        currentCenter: { x: 4_000, y: -4_000 },
        currentDistance: 2_000,
        initialCenter: { x: 0, y: 0 },
        initialDistance: 100,
        initialTransform: { scale: 1, x: 0, y: 0 },
      }),
    ).toEqual({ scale: 4, x: 1_500, y: -937.5 });
  });

  it("canonicalizes every carousel owner to the final gallery index", () => {
    expect(resolveCoverflowSynchronization(4, 5)).toEqual({
      physicalIndex: 4,
      settledIndex: 4,
      targetIndex: 4,
      velocity: 0,
      visualIndex: 4,
    });
    expect(resolveCoverflowSynchronization(12, 5)).toEqual({
      physicalIndex: 4,
      settledIndex: 4,
      targetIndex: 4,
      velocity: 0,
      visualIndex: 4,
    });
  });
});

describe("gallery transform geometry", () => {
  it("clamps scale below fit to the exact canonical fit state", () => {
    expect(
      canonicalCoverflowGalleryTransform({ scale: 0.25, x: 0.125, y: -0.25 }, landscapeContext),
    ).toEqual({ scale: 1, x: 0, y: 0 });
  });

  it("clamps scale to the gallery maximum", () => {
    expect(constrainMediaTransform({ scale: 8, x: 0, y: 0 }, landscapeContext)).toEqual({
      scale: 4,
      x: 0,
      y: 0,
    });
  });

  it("preserves the center focal point", () => {
    expect(
      zoomMediaTransform({ scale: 1, x: 0, y: 0 }, 2, { x: 0, y: 0 }, landscapeContext),
    ).toEqual({ scale: 2, x: 0, y: 0 });
  });

  it("preserves an off-center focal point", () => {
    expect(
      zoomMediaTransform({ scale: 1, x: 0, y: 0 }, 2, { x: 180, y: -90 }, landscapeContext),
    ).toEqual({ scale: 2, x: -180, y: 90 });
  });

  it("clamps positive pan symmetrically", () => {
    expect(
      panMediaTransform({ scale: 2, x: 0, y: 0 }, { x: 2_000, y: 2_000 }, landscapeContext),
    ).toEqual({ scale: 2, x: 500, y: 312.5 });
  });

  it("clamps negative pan symmetrically", () => {
    expect(
      panMediaTransform({ scale: 2, x: 0, y: 0 }, { x: -2_000, y: -2_000 }, landscapeContext),
    ).toEqual({ scale: 2, x: -500, y: -312.5 });
  });

  it("derives horizontal letterbox bounds from contain-fit geometry", () => {
    expect(
      resolveMediaTransformBounds(
        {
          intrinsicSize: { height: 500, width: 1_600 },
          viewportSize: { height: 625, width: 1_000 },
        },
        2,
      ),
    ).toEqual({ maxX: 500, maxY: 0 });
  });

  it("derives vertical letterbox bounds from contain-fit geometry", () => {
    expect(
      resolveMediaTransformBounds(
        {
          intrinsicSize: { height: 1_600, width: 1_000 },
          viewportSize: { height: 625, width: 1_000 },
        },
        2,
      ),
    ).toEqual({ maxX: 0, maxY: 312.5 });
  });

  it("reclamps an existing transform after resize", () => {
    expect(
      constrainMediaTransform(
        { scale: 4, x: 1_500, y: 900 },
        {
          intrinsicSize: { height: 1_000, width: 1_600 },
          viewportSize: { height: 800, width: 800 },
        },
      ),
    ).toEqual({ scale: 4, x: 1_200, y: 600 });
  });

  it("removes subpixel pan residue when returning to fit", () => {
    expect(
      zoomMediaTransform(
        { scale: 1.5, x: 0.001, y: -0.001 },
        1,
        { x: 120, y: 80 },
        landscapeContext,
      ),
    ).toEqual({ scale: 1, x: 0, y: 0 });
  });
});

describe("pinch edge cases", () => {
  it("increases scale with distance", () => {
    expect(
      resolvePinchTransform({
        context: landscapeContext,
        currentCenter: { x: 0, y: 0 },
        currentDistance: 180,
        initialCenter: { x: 0, y: 0 },
        initialDistance: 120,
        initialTransform: { scale: 1, x: 0, y: 0 },
      }).scale,
    ).toBe(1.5);
  });

  it("decreases scale to exact fit with distance", () => {
    expect(
      resolvePinchTransform({
        context: landscapeContext,
        currentCenter: { x: 0, y: 0 },
        currentDistance: 100,
        initialCenter: { x: 0, y: 0 },
        initialDistance: 200,
        initialTransform: { scale: 2, x: 0, y: 0 },
      }),
    ).toEqual({ scale: 1, x: 0, y: 0 });
  });

  it("moves pan with an unchanged-distance pinch center", () => {
    expect(
      resolvePinchTransform({
        context: landscapeContext,
        currentCenter: { x: 50, y: -25 },
        currentDistance: 100,
        initialCenter: { x: 0, y: 0 },
        initialDistance: 100,
        initialTransform: { scale: 2, x: 0, y: 0 },
      }),
    ).toEqual({ scale: 2, x: 50, y: -25 });
  });

  it("bounds scale when pointer distance becomes extreme", () => {
    expect(
      resolvePinchTransform({
        context: landscapeContext,
        currentCenter: { x: 0, y: 0 },
        currentDistance: 10_000,
        initialCenter: { x: 0, y: 0 },
        initialDistance: 1,
        initialTransform: { scale: 1, x: 0, y: 0 },
      }).scale,
    ).toBe(4);
  });
});

describe("gallery boundary invariants", () => {
  it("keeps zoomed edge motion owned by pan", () => {
    expect(
      resolveGallerySwipe({
        ...swipeAtFit,
        deltaX: -4_000,
        elapsedMs: 20,
        index: 4,
        scale: 4,
      }),
    ).toBe(0);
  });

  it("resolves at most one item for an extreme fit-scale swipe", () => {
    expect(resolveGallerySwipe({ ...swipeAtFit, deltaX: -4_000, elapsedMs: 20 })).toBe(1);
  });

  it("clamps close synchronization at the leading boundary", () => {
    expect(resolveCoverflowSynchronization(-8, 5).targetIndex).toBe(0);
  });

  it("produces a stable empty-collection synchronization payload", () => {
    expect(resolveCoverflowSynchronization(8, 0)).toEqual({
      physicalIndex: 0,
      settledIndex: 0,
      targetIndex: 0,
      velocity: 0,
      visualIndex: 0,
    });
  });
});
