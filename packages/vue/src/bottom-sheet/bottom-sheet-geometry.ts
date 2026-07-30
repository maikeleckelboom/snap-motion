export interface BottomSheetGeometryInput {
  readonly bodyClientHeight?: number;
  readonly bodyScrollHeight?: number;
  readonly bodyScrollTop?: number;
  readonly intrinsicBodyContentHeight?: number;
  readonly measuredChromeHeight?: number;
  readonly physicalSheetY: number;
  readonly visualViewportHeight: number;
}

export interface BottomSheetGeometry {
  readonly bodyClientHeight: number;
  readonly bodyScrollHeight: number;
  readonly bodyScrollTop: number;
  readonly intrinsicBodyContentHeight: number;
  readonly intrinsicSheetHeight: number;
  readonly maximumBodyScrollTop: number;
  readonly measuredChromeHeight: number;
  readonly physicalSheetY: number;
  readonly visibleBodyHeight: number;
  readonly visibleSheetHeight: number;
  readonly visualViewportHeight: number;
}

function finiteNonNegative(value: number | undefined) {
  return value !== undefined && Number.isFinite(value) ? Math.max(0, value) : 0;
}

/**
 * Resolves the visible and intrinsic bottom-sheet geometry from one physical coordinate system.
 * A finite negative Y remains valid so temporary top elasticity still reaches the viewport bottom.
 */
export function resolveBottomSheetGeometry(input: BottomSheetGeometryInput): BottomSheetGeometry {
  const visualViewportHeight = finiteNonNegative(input.visualViewportHeight);
  const physicalSheetY = Number.isFinite(input.physicalSheetY)
    ? input.physicalSheetY
    : visualViewportHeight;
  const measuredChromeHeight = finiteNonNegative(input.measuredChromeHeight);
  const bodyClientHeight = finiteNonNegative(input.bodyClientHeight);
  const bodyScrollHeight = finiteNonNegative(input.bodyScrollHeight);
  const bodyScrollTop =
    input.bodyScrollTop !== undefined && Number.isFinite(input.bodyScrollTop)
      ? input.bodyScrollTop
      : 0;
  const intrinsicBodyContentHeight = finiteNonNegative(input.intrinsicBodyContentHeight);
  const visibleSheetHeight = Math.max(0, visualViewportHeight - physicalSheetY);
  const visibleBodyHeight = Math.max(0, visibleSheetHeight - measuredChromeHeight);

  return {
    bodyClientHeight,
    bodyScrollHeight,
    bodyScrollTop,
    intrinsicBodyContentHeight,
    intrinsicSheetHeight: measuredChromeHeight + intrinsicBodyContentHeight,
    maximumBodyScrollTop: Math.max(0, bodyScrollHeight - bodyClientHeight),
    measuredChromeHeight,
    physicalSheetY,
    visibleBodyHeight,
    visibleSheetHeight,
    visualViewportHeight,
  };
}
