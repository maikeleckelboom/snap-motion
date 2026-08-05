import { describe, expect, it } from "vitest";

import { resolveSheetGeometry } from "../src/sheet/sheet-geometry";

describe("sheet geometry", () => {
  it.each([
    { side: "bottom", physicalTransform: 440, visiblePrimaryExtent: 360 },
    { side: "top", physicalTransform: -440, visiblePrimaryExtent: 360 },
    { side: "right", physicalTransform: 120, visiblePrimaryExtent: 280 },
    { side: "left", physicalTransform: -120, visiblePrimaryExtent: 280 },
  ] as const)("resolves $side from canonical geometry", (expected) => {
    const horizontal = expected.side === "left" || expected.side === "right";
    const geometry = resolveSheetGeometry({
      canonicalPosition: horizontal ? 120 : 440,
      measuredChromeBlockExtent: 120,
      primarySurfaceExtent: horizontal ? 400 : 800,
      side: expected.side,
      viewportBlockSize: 800,
      viewportInlineSize: 400,
    });
    expect(geometry).toMatchObject(expected);
    expect(geometry.visibleBodyBlockExtent).toBe(horizontal ? 680 : 240);
    expect(geometry.visibleSheetInlineExtent).toBe(horizontal ? 280 : 400);
    expect(geometry.visibleSheetBlockExtent).toBe(horizontal ? 800 : 360);
  });

  it.each(["top", "right", "bottom", "left"] as const)(
    "keeps %s attached through open-edge elasticity",
    (side) => {
      const horizontal = side === "left" || side === "right";
      const surface = horizontal ? 400 : 800;
      const geometry = resolveSheetGeometry({
        canonicalPosition: -32,
        primarySurfaceExtent: surface,
        side,
        viewportBlockSize: 800,
        viewportInlineSize: 400,
      });
      expect(geometry.visiblePrimaryExtent).toBe(surface + 32);
      expect(Math.abs(geometry.physicalTransform)).toBe(32);
    },
  );

  it("resolves intrinsic primary size and native scroll offsets", () => {
    const geometry = resolveSheetGeometry({
      bodyClientBlockExtent: 468,
      bodyScrollBlockExtent: 1_740,
      bodyScrollOffset: 211,
      canonicalPosition: 180,
      intrinsicBodyContentBlockExtent: 1_740,
      measuredChromeBlockExtent: 152,
      primarySurfaceExtent: 800,
      side: "bottom",
      viewportBlockSize: 800,
      viewportInlineSize: 400,
    });
    expect(geometry.intrinsicContentPrimaryExtent).toBe(1_892);
    expect(geometry.maximumBodyScrollOffset).toBe(1_272);
    expect(geometry.bodyScrollOffset).toBe(211);
  });

  it("normalizes invalid geometry to safe finite boundaries", () => {
    expect(
      resolveSheetGeometry({
        bodyClientBlockExtent: Number.NaN,
        bodyScrollBlockExtent: Number.POSITIVE_INFINITY,
        bodyScrollOffset: Number.NaN,
        canonicalPosition: Number.NaN,
        primarySurfaceExtent: Number.POSITIVE_INFINITY,
        side: "left",
        viewportBlockSize: Number.NaN,
        viewportInlineSize: Number.NEGATIVE_INFINITY,
      }),
    ).toMatchObject({
      bodyClientBlockExtent: 0,
      bodyScrollBlockExtent: 0,
      bodyScrollOffset: 0,
      canonicalPosition: 0,
      maximumBodyScrollOffset: 0,
      primarySurfaceExtent: 0,
      visibleBodyBlockExtent: 0,
      visiblePrimaryExtent: 0,
      visibleSheetBlockExtent: 0,
      visibleSheetInlineExtent: 0,
    });
  });
});
