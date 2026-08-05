import { describe, expect, it } from "vitest";

import type { SheetSide } from "../src/sheet/sheet-contracts";
import {
  createDefaultSheetSnapPoints,
  createFixedSheetSnapPoints,
  createViewportSheetSnapPoints,
  resolveSheetReleaseAnchor,
  resolveSheetScrimOpacity,
  resolveSheetSnapAnchors,
  resolveSheetSnapPoints,
  sheetSnapVisibleExtent,
  type SheetMeasureContext,
} from "../src/sheet/sheet-policy";
import {
  getSheetSideDescriptor,
  sheetSides,
  sheetTransform,
  toCanonicalSheetDelta,
} from "../src/sheet/sheet-side";

const hiddenId = "__hidden__" as const;

function contextFor(side: SheetSide, overrides: Partial<SheetMeasureContext> = {}) {
  const axis = getSheetSideDescriptor(side).axis;
  const visualViewportInlineSize = 400;
  const visualViewportBlockSize = 800;
  return {
    axis,
    crossViewportExtent: axis === "y" ? 400 : 800,
    hiddenOvershoot: 160,
    intrinsicContentPrimaryExtent: 300,
    layoutViewportBlockSize: 800,
    layoutViewportInlineSize: 400,
    oppositeEdgeGap: 24,
    panelCrossExtent: axis === "y" ? 400 : 800,
    panelPrimaryExtent: axis === "y" ? 800 : 376,
    primaryViewportExtent: axis === "y" ? 800 : 400,
    safeAreaInsets: { bottom: 0, left: 0, right: 0, top: 0 },
    side,
    visualViewportBlockSize,
    visualViewportInlineSize,
    ...overrides,
  } satisfies SheetMeasureContext;
}

describe("sheet side descriptors", () => {
  it.each([
    {
      attachedEdge: "bottom",
      axis: "y",
      handleEdge: "top",
      inwardDelta: -80,
      outwardDelta: 80,
      side: "bottom",
      transform: "translate3d(0, 120px, 0)",
      transformSign: 1,
    },
    {
      attachedEdge: "top",
      axis: "y",
      handleEdge: "bottom",
      inwardDelta: 80,
      outwardDelta: -80,
      side: "top",
      transform: "translate3d(0, -120px, 0)",
      transformSign: -1,
    },
    {
      attachedEdge: "right",
      axis: "x",
      handleEdge: "left",
      inwardDelta: -80,
      outwardDelta: 80,
      side: "right",
      transform: "translate3d(120px, 0, 0)",
      transformSign: 1,
    },
    {
      attachedEdge: "left",
      axis: "x",
      handleEdge: "right",
      inwardDelta: 80,
      outwardDelta: -80,
      side: "left",
      transform: "translate3d(-120px, 0, 0)",
      transformSign: -1,
    },
  ] as const)(
    "$side maps physical geometry into canonical closing motion",
    ({
      attachedEdge,
      axis,
      handleEdge,
      inwardDelta,
      outwardDelta,
      side,
      transform,
      transformSign,
    }) => {
      expect(getSheetSideDescriptor(side)).toMatchObject({
        attachedEdge,
        axis,
        handleEdge,
        transformSign,
      });
      expect(toCanonicalSheetDelta(side, outwardDelta)).toBe(80);
      expect(toCanonicalSheetDelta(side, inwardDelta)).toBe(-80);
      expect(sheetTransform(side, 120)).toBe(transform);
    },
  );

  it("covers every public physical side exactly once", () => {
    expect(sheetSides).toEqual(["top", "right", "bottom", "left"]);
  });
});

describe("sheet snap policy", () => {
  it.each(["top", "bottom"] as const)(
    "%s retains full, comfortable, and compact viewport anchors",
    (side) => {
      const anchors = resolveSheetSnapAnchors(
        createViewportSheetSnapPoints(),
        contextFor(side),
        hiddenId,
      );
      expect(anchors).toEqual([
        { id: "full", order: 0, position: 24 },
        { id: "comfortable", order: 1, position: 180 },
        { id: "compact", order: 2, position: 440 },
        { id: hiddenId, order: 3, position: 960 },
      ]);
      expect(anchors.at(-1)?.position).toBe(Math.max(...anchors.map(({ position }) => position)));
    },
  );

  it.each(["left", "right"] as const)(
    "%s uses one fully open fixed-surface anchor by default",
    (side) => {
      const anchors = resolveSheetSnapAnchors(
        createFixedSheetSnapPoints(),
        contextFor(side),
        hiddenId,
      );
      expect(anchors).toEqual([
        { id: "open", order: 0, position: 0 },
        { id: hiddenId, order: 1, position: 536 },
      ]);
    },
  );

  it("maps all four safe areas through the physical opposite edge", () => {
    const safeAreaInsets = { top: 11, right: 13, bottom: 17, left: 19 };
    const positions = Object.fromEntries(
      sheetSides.map((side) => {
        const point = resolveSheetSnapPoints(
          createDefaultSheetSnapPoints(side),
          contextFor(side, { safeAreaInsets }),
        )[0]!;
        return [side, point.position];
      }),
    );
    expect(positions).toEqual({ bottom: 35, left: 13, right: 19, top: 41 });
  });

  it("resolves custom visible extents without exposing transform signs", () => {
    const context = contextFor("right", {
      intrinsicContentPrimaryExtent: 280,
      layoutViewportInlineSize: 600,
      panelPrimaryExtent: 400,
      primaryViewportExtent: 600,
      visualViewportInlineSize: 600,
    });
    const points = resolveSheetSnapPoints(
      [
        { id: "peek", label: "Peek", resolveVisibleExtent: sheetSnapVisibleExtent.pixels(120) },
        {
          id: "content",
          label: "Content",
          resolveVisibleExtent: sheetSnapVisibleExtent.intrinsicContent,
        },
        {
          id: "duplicate",
          label: "Duplicate",
          resolveVisibleExtent: sheetSnapVisibleExtent.pixels(120),
          disabled: ({ layoutViewportInlineSize }) => layoutViewportInlineSize < 700,
        },
      ] as const,
      context,
    );
    expect(
      points.map(({ disabled, id, position, visibleExtent }) => ({
        disabled,
        id,
        position,
        visibleExtent,
      })),
    ).toEqual([
      { disabled: false, id: "peek", position: 280, visibleExtent: 120 },
      { disabled: false, id: "content", position: 120, visibleExtent: 280 },
      { disabled: true, id: "duplicate", position: 280, visibleExtent: 120 },
    ]);
  });

  it("bounds consumer resolvers by the physical opposite-edge gap and safe area", () => {
    const point = resolveSheetSnapPoints(
      [
        {
          id: "full",
          label: "Full",
          resolveVisibleExtent: sheetSnapVisibleExtent.viewportFraction(1),
        },
      ],
      contextFor("bottom", { safeAreaInsets: { bottom: 0, left: 0, right: 0, top: 18 } }),
    )[0]!;
    expect(point.visibleExtent).toBe(758);
    expect(point.position).toBe(42);
  });

  it.each([
    ["bottom", "top"],
    ["right", "left"],
  ] as const)("%s and %s settle to the same semantic target under mirrored input", (a, b) => {
    const points = [
      { id: "open", label: "Open", resolveVisibleExtent: sheetSnapVisibleExtent.pixels(376) },
      { id: "peek", label: "Peek", resolveVisibleExtent: sheetSnapVisibleExtent.pixels(160) },
    ] as const;
    const anchorsA = resolveSheetSnapAnchors(points, contextFor(a), hiddenId);
    const anchorsB = resolveSheetSnapAnchors(points, contextFor(b), hiddenId);
    const canonicalVelocityA = toCanonicalSheetDelta(
      a,
      700 * getSheetSideDescriptor(a).transformSign,
    );
    const canonicalVelocityB = toCanonicalSheetDelta(
      b,
      700 * getSheetSideDescriptor(b).transformSign,
    );
    expect(resolveSheetReleaseAnchor(anchorsA, hiddenId, 120, canonicalVelocityA).id).toBe(
      resolveSheetReleaseAnchor(anchorsB, hiddenId, 120, canonicalVelocityB).id,
    );
  });

  it("derives direction-independent scrim progress from canonical open to hidden", () => {
    const opacities = sheetSides.map((side) => {
      const anchors = resolveSheetSnapAnchors(
        createDefaultSheetSnapPoints(side),
        contextFor(side),
        hiddenId,
      );
      const open = Math.min(...anchors.map(({ position }) => position));
      const hidden = anchors.find(({ id }) => id === hiddenId)!;
      return resolveSheetScrimOpacity(anchors, hiddenId, open + (hidden.position - open) / 2);
    });
    expect(opacities).toEqual([0.28, 0.28, 0.28, 0.28]);
  });
});
