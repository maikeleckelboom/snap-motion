import { describe, expect, it } from "vitest";

import {
  type GallerySwipeInput,
  type MediaGalleryItem,
  type MediaTransformContext,
} from "../src/media-gallery/media-gallery-contracts";
import {
  canonicalMediaGalleryTransform,
  clampGalleryIndex,
  constrainMediaTransform,
  galleryPreloadIndices,
  isRepeatedGalleryTap,
  resolveGalleryCommitOffset,
  resolveGalleryMediaVisibility,
  resolvePreservedGalleryIndex,
  resolveGallerySwipe,
  resolveGalleryTrackOffset,
  resolveGalleryTrackSlots,
  resolvePinchTransform,
  shouldTransitionGalleryMedia,
  normalizeMediaGalleryItems,
  panMediaTransform,
  resolveMediaTransformBounds,
  zoomMediaTransform,
} from "../src/media-gallery/media-gallery-math";
import { MEDIA_GALLERY_TUNING } from "../src/media-gallery/media-gallery-tuning";

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

const galleryItem = (changes: Partial<MediaGalleryItem> = {}): MediaGalleryItem => ({
  id: "one",
  title: "One",
  alt: "One",
  previewSrc: "/one-preview.jpg",
  fullSrc: "/one-full.jpg",
  width: 1_600,
  height: 1_000,
  ...changes,
});

describe("gallery three-slot track", () => {
  it("resolves previous, current, and next around a middle index", () => {
    expect(resolveGalleryTrackSlots(2, 5)).toEqual([
      { itemIndex: 1, position: -1 },
      { itemIndex: 2, position: 0 },
      { itemIndex: 3, position: 1 },
    ]);
  });

  it("omits only the invalid previous slot at the first item", () => {
    expect(resolveGalleryTrackSlots(0, 5)).toEqual([
      { itemIndex: 0, position: 0 },
      { itemIndex: 1, position: 1 },
    ]);
  });

  it("omits only the invalid next slot at the last item", () => {
    expect(resolveGalleryTrackSlots(4, 5)).toEqual([
      { itemIndex: 3, position: -1 },
      { itemIndex: 4, position: 0 },
    ]);
  });

  it("keeps rest and half-viewport drag offsets exact and symmetric", () => {
    expect(resolveGalleryTrackOffset(0, 800, 2, 5)).toBe(0);
    expect(resolveGalleryTrackOffset(400, 800, 2, 5)).toBe(400);
    expect(resolveGalleryTrackOffset(-400, 800, 2, 5)).toBe(-400);
  });

  it("settles next and previous commitments by exactly one viewport", () => {
    expect(resolveGalleryCommitOffset(1, 800)).toBe(-800);
    expect(resolveGalleryCommitOffset(-1, 800)).toBe(800);
  });

  it("recentered slots preserve the newly current item identity", () => {
    const before = resolveGalleryTrackSlots(2, 5);
    const after = resolveGalleryTrackSlots(3, 5);
    expect(before.find((slot) => slot.position === 1)?.itemIndex).toBe(3);
    expect(after.find((slot) => slot.position === 0)?.itemIndex).toBe(3);
  });

  it("restrains boundary movement without selecting an invalid slot", () => {
    expect(resolveGalleryTrackOffset(800, 800, 0, 5)).toBe(24);
    expect(resolveGalleryTrackOffset(-800, 800, 4, 5)).toBe(-24);
    expect(resolveGalleryTrackSlots(-8, 5).every((slot) => slot.itemIndex >= 0)).toBe(true);
    expect(resolveGalleryTrackSlots(12, 5).every((slot) => slot.itemIndex < 5)).toBe(true);
  });

  it("stages Home and End destinations in the directional incoming slot", () => {
    expect(resolveGalleryTrackSlots(3, 5, 0)).toEqual([
      { itemIndex: 0, position: -1 },
      { itemIndex: 3, position: 0 },
      { itemIndex: 4, position: 1 },
    ]);
    expect(resolveGalleryTrackSlots(1, 5, 4)).toEqual([
      { itemIndex: 0, position: -1 },
      { itemIndex: 1, position: 0 },
      { itemIndex: 4, position: 1 },
    ]);
  });

  it("keeps the preload candidate set bounded to current and adjacent", () => {
    expect(galleryPreloadIndices(2, 100)).toEqual([1, 2, 3]);
  });
});

describe("gallery media transition eligibility", () => {
  it.each(["button", "keyboard", "fit", "double-click", "double-tap"] as const)(
    "animates the discrete %s action",
    (action) => {
      expect(shouldTransitionGalleryMedia(action, false)).toBe(true);
    },
  );

  it.each(["pan", "pinch", "swipe"] as const)("keeps %s direct", (action) => {
    expect(shouldTransitionGalleryMedia(action, false)).toBe(false);
  });

  it("makes every action immediate under reduced motion", () => {
    expect(shouldTransitionGalleryMedia("button", true)).toBe(false);
    expect(shouldTransitionGalleryMedia("fit", true)).toBe(false);
  });
});

describe("gallery preview lifecycle", () => {
  it("keeps the preview visible while full media loads", () => {
    expect(resolveGalleryMediaVisibility("pending")).toEqual({
      fullMounted: true,
      fullVisible: false,
      previewVisible: true,
    });
  });

  it("reveals decoded full media before concealing the preview", () => {
    expect(resolveGalleryMediaVisibility("loaded")).toEqual({
      fullMounted: true,
      fullVisible: true,
      previewVisible: false,
    });
  });

  it("retains the preview and removes a failed full-media attempt", () => {
    expect(resolveGalleryMediaVisibility("failed")).toEqual({
      fullMounted: false,
      fullVisible: false,
      previewVisible: true,
    });
  });

  it("always exposes a preview or decoded full layer, including a shared source", () => {
    for (const state of ["pending", "loaded", "failed", "preview"] as const) {
      const visibility = resolveGalleryMediaVisibility(state);
      expect(visibility.previewVisible || visibility.fullVisible).toBe(true);
    }
  });

  it("treats preview-only media as complete without mounting a duplicate full layer", () => {
    expect(resolveGalleryMediaVisibility("preview")).toEqual({
      fullMounted: false,
      fullVisible: false,
      previewVisible: true,
    });
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
        time: 100 + MEDIA_GALLERY_TUNING.doubleTapDelay + 1,
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
});

describe("gallery transform geometry", () => {
  it("clamps scale below fit to the exact canonical fit state", () => {
    expect(
      canonicalMediaGalleryTransform({ scale: 0.25, x: 0.125, y: -0.25 }, landscapeContext),
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
});

describe("gallery item normalization", () => {
  it("clamps invalid and out-of-range indices", () => {
    expect(clampGalleryIndex(Number.NaN, 3)).toBe(0);
    expect(clampGalleryIndex(-8, 3)).toBe(0);
    expect(clampGalleryIndex(8, 3)).toBe(2);
    expect(clampGalleryIndex(8, 0)).toBe(0);
  });

  it("preserves a valid positive finite intrinsic-dimension pair", () => {
    expect(normalizeMediaGalleryItems([galleryItem()])[0]).toMatchObject({
      height: 1_000,
      width: 1_600,
    });
  });

  it.each([
    ["invalid height", 1_600, -1],
    ["invalid width", Number.NaN, 1_000],
    ["NaN", Number.NaN, Number.NaN],
    ["infinity", Number.POSITIVE_INFINITY, 1_000],
    ["zero", 0, 0],
    ["negative values", -20, -30],
    ["mixed invalid values", 1_600, Number.NEGATIVE_INFINITY],
  ])("falls back the complete pair for %s", (_label, width, height) => {
    const normalized = normalizeMediaGalleryItems([galleryItem({ width, height })])[0]!;
    expect({ height: normalized.height, width: normalized.width }).toEqual({
      height: 1,
      width: 1,
    });
    expect(Number.isFinite(normalized.width / normalized.height)).toBe(true);
    expect(normalized.width / normalized.height).toBeGreaterThan(0);
  });

  it.each([
    ["empty", ""],
    ["whitespace-only", "   "],
  ])("rejects an %s ID", (_label, id) => {
    expect(() => normalizeMediaGalleryItems([galleryItem({ id })])).toThrowError(
      new RangeError(
        "Media gallery item IDs must be unique non-empty strings; item at index 0 has an empty ID.",
      ),
    );
  });

  it("rejects an exact duplicate ID without returning a filtered collection", () => {
    const input = [galleryItem(), galleryItem({ title: "Duplicate" })];
    expect(() => normalizeMediaGalleryItems(input)).toThrowError(
      /"one" at index 1 duplicates an earlier item/,
    );
    expect(input).toHaveLength(2);
  });

  it("validates every ID before partially normalizing item fields", () => {
    let previewReads = 0;
    const first = galleryItem();
    Object.defineProperty(first, "previewSrc", {
      configurable: true,
      get() {
        previewReads += 1;
        return "/one-preview.jpg";
      },
    });

    expect(() => normalizeMediaGalleryItems([first, galleryItem()])).toThrowError(RangeError);
    expect(previewReads).toBe(0);
  });

  it("rejects a duplicate after trimming", () => {
    expect(() =>
      normalizeMediaGalleryItems([galleryItem(), galleryItem({ id: " one " })]),
    ).toThrowError(/"one" at index 1 duplicates an earlier item/);
  });

  it("trims unique IDs while preserving item order", () => {
    expect(
      normalizeMediaGalleryItems([
        galleryItem({ id: " first ", title: "First" }),
        galleryItem({ id: " second ", title: "Second" }),
      ]).map(({ id, title }) => ({ id, title })),
    ).toEqual([
      { id: "first", title: "First" },
      { id: "second", title: "Second" },
    ]);
  });

  it("does not duplicate a full layer when full and preview sources match", () => {
    const { fullSrc: _fullSrc, ...previewOnly } = galleryItem({ id: "two" });
    expect(
      normalizeMediaGalleryItems([galleryItem({ fullSrc: "/one-preview.jpg" }), previewOnly]).map(
        ({ fullSrc }) => fullSrc,
      ),
    ).toEqual([undefined, undefined]);
  });

  it("preserves the current item by identity and otherwise clamps its prior index", () => {
    const next = [
      galleryItem({ id: "zero" }),
      galleryItem({ id: "one" }),
      galleryItem({ id: "two" }),
    ];
    expect(resolvePreservedGalleryIndex("one", 0, next)).toBe(1);
    expect(resolvePreservedGalleryIndex("removed", 8, next)).toBe(2);
  });
});
