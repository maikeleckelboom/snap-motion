import { describe, expect, it } from "vitest";

import { resolveBottomSheetGeometry } from "../src/bottom-sheet/bottom-sheet-geometry";

describe("bottom-sheet geometry", () => {
  const visualViewportHeight = 1_312;
  const measuredChromeHeight = 152;

  it.each([
    { label: "full", physicalSheetY: 24, visibleSheetHeight: 1_288 },
    { label: "comfortable", physicalSheetY: 692, visibleSheetHeight: 620 },
    { label: "compact", physicalSheetY: 952, visibleSheetHeight: 360 },
    { label: "hidden", physicalSheetY: 1_472, visibleSheetHeight: 0 },
  ])(
    "resolves $label from the physical sheet coordinate",
    ({ physicalSheetY, visibleSheetHeight }) => {
      const geometry = resolveBottomSheetGeometry({
        measuredChromeHeight,
        physicalSheetY,
        visualViewportHeight,
      });

      expect(geometry.visibleSheetHeight).toBe(visibleSheetHeight);
      expect(geometry.visibleBodyHeight).toBe(
        Math.max(0, visibleSheetHeight - measuredChromeHeight),
      );
    },
  );

  it("keeps temporary top elasticity attached to the viewport bottom", () => {
    const geometry = resolveBottomSheetGeometry({
      measuredChromeHeight,
      physicalSheetY: -32,
      visualViewportHeight,
    });

    expect(geometry.visibleSheetHeight).toBe(1_344);
    expect(geometry.physicalSheetY + geometry.visibleSheetHeight).toBe(visualViewportHeight);
  });

  it("uses a custom topmost physical Y instead of normalizing it to 24px", () => {
    const geometry = resolveBottomSheetGeometry({
      measuredChromeHeight,
      physicalSheetY: 80,
      visualViewportHeight,
    });

    expect(geometry.physicalSheetY).toBe(80);
    expect(geometry.visibleSheetHeight).toBe(1_232);
  });

  it("resolves intrinsic size and the native maximum scroll offset", () => {
    const geometry = resolveBottomSheetGeometry({
      bodyClientHeight: 468,
      bodyScrollHeight: 1_740,
      bodyScrollTop: 211,
      intrinsicBodyContentHeight: 1_740,
      measuredChromeHeight,
      physicalSheetY: 692,
      visualViewportHeight,
    });

    expect(geometry.intrinsicSheetHeight).toBe(1_892);
    expect(geometry.maximumBodyScrollTop).toBe(1_272);
    expect(geometry.bodyScrollTop).toBe(211);
  });

  it("does not create scrolling for zero-height or short content", () => {
    expect(
      resolveBottomSheetGeometry({
        bodyClientHeight: 0,
        bodyScrollHeight: 0,
        measuredChromeHeight: 0,
        physicalSheetY: 0,
        visualViewportHeight: 0,
      }),
    ).toMatchObject({
      maximumBodyScrollTop: 0,
      visibleBodyHeight: 0,
      visibleSheetHeight: 0,
    });

    expect(
      resolveBottomSheetGeometry({
        bodyClientHeight: 500,
        bodyScrollHeight: 320,
        physicalSheetY: 100,
        visualViewportHeight: 800,
      }).maximumBodyScrollTop,
    ).toBe(0);
  });

  it("normalizes invalid values to a safe hidden or zero boundary", () => {
    expect(
      resolveBottomSheetGeometry({
        bodyClientHeight: Number.NaN,
        bodyScrollHeight: Number.POSITIVE_INFINITY,
        bodyScrollTop: Number.NaN,
        intrinsicBodyContentHeight: Number.NEGATIVE_INFINITY,
        measuredChromeHeight: Number.NaN,
        physicalSheetY: Number.NaN,
        visualViewportHeight: Number.POSITIVE_INFINITY,
      }),
    ).toEqual({
      bodyClientHeight: 0,
      bodyScrollHeight: 0,
      bodyScrollTop: 0,
      intrinsicBodyContentHeight: 0,
      intrinsicSheetHeight: 0,
      maximumBodyScrollTop: 0,
      measuredChromeHeight: 0,
      physicalSheetY: 0,
      visibleBodyHeight: 0,
      visibleSheetHeight: 0,
      visualViewportHeight: 0,
    });
  });

  it("retains subpixel browser geometry within normal rounding tolerance", () => {
    const geometry = resolveBottomSheetGeometry({
      bodyClientHeight: 467.667,
      bodyScrollHeight: 1_739.333,
      measuredChromeHeight: 152.333,
      physicalSheetY: 691.667,
      visualViewportHeight,
    });

    expect(geometry.visibleSheetHeight).toBeCloseTo(620.333, 3);
    expect(geometry.visibleBodyHeight).toBeCloseTo(468, 3);
    expect(geometry.maximumBodyScrollTop).toBeCloseTo(1_271.666, 3);
  });
});
