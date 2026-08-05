import type { SheetAxis, SheetSide } from "./sheet-contracts";
import { getSheetSideDescriptor, toPhysicalSheetPosition } from "./sheet-side";

export interface SheetGeometryInput {
  readonly bodyClientBlockExtent?: number;
  readonly bodyScrollBlockExtent?: number;
  readonly bodyScrollOffset?: number;
  readonly canonicalPosition: number;
  readonly intrinsicBodyContentBlockExtent?: number;
  /** Authoritative natural sheet extent on its primary axis. */
  readonly intrinsicContentPrimaryExtent?: number;
  readonly measuredChromeBlockExtent?: number;
  readonly primarySurfaceExtent: number;
  readonly side: SheetSide;
  readonly viewportBlockSize: number;
  readonly viewportInlineSize: number;
}

export interface SheetGeometry {
  readonly axis: SheetAxis;
  /** Latest measured body client block extent; not read on every motion frame. */
  readonly bodyClientBlockExtent: number;
  /** Latest measured body scroll block extent; not read on every motion frame. */
  readonly bodyScrollBlockExtent: number;
  /** Latest measured body scroll offset; not read on every motion frame. */
  readonly bodyScrollOffset: number;
  readonly canonicalPosition: number;
  readonly intrinsicBodyContentBlockExtent: number;
  readonly intrinsicContentPrimaryExtent: number;
  readonly maximumBodyScrollOffset: number;
  readonly measuredChromeBlockExtent: number;
  readonly physicalTransform: number;
  readonly primarySurfaceExtent: number;
  readonly side: SheetSide;
  readonly viewportBlockSize: number;
  readonly viewportInlineSize: number;
  readonly visibleBodyBlockExtent: number;
  readonly visiblePrimaryExtent: number;
  readonly visibleSheetBlockExtent: number;
  readonly visibleSheetInlineExtent: number;
}

function finiteNonNegative(value: number | undefined) {
  return value !== undefined && Number.isFinite(value) ? Math.max(0, value) : 0;
}

/** Resolves frame-live sheet extent and latest-measured native scroll geometry. */
export function resolveSheetGeometry(input: SheetGeometryInput): SheetGeometry {
  const descriptor = getSheetSideDescriptor(input.side);
  const viewportInlineSize = finiteNonNegative(input.viewportInlineSize);
  const viewportBlockSize = finiteNonNegative(input.viewportBlockSize);
  const primarySurfaceExtent = finiteNonNegative(input.primarySurfaceExtent);
  const canonicalPosition = Number.isFinite(input.canonicalPosition)
    ? input.canonicalPosition
    : primarySurfaceExtent;
  const measuredChromeBlockExtent = finiteNonNegative(input.measuredChromeBlockExtent);
  const bodyClientBlockExtent = finiteNonNegative(input.bodyClientBlockExtent);
  const bodyScrollBlockExtent = finiteNonNegative(input.bodyScrollBlockExtent);
  const bodyScrollOffset = Number.isFinite(input.bodyScrollOffset) ? input.bodyScrollOffset! : 0;
  const intrinsicBodyContentBlockExtent = finiteNonNegative(input.intrinsicBodyContentBlockExtent);
  const intrinsicContentPrimaryExtent =
    input.intrinsicContentPrimaryExtent === undefined
      ? descriptor.axis === "y"
        ? measuredChromeBlockExtent + intrinsicBodyContentBlockExtent
        : primarySurfaceExtent
      : finiteNonNegative(input.intrinsicContentPrimaryExtent);
  const visiblePrimaryExtent = Math.max(0, primarySurfaceExtent - canonicalPosition);
  const visibleSheetBlockExtent =
    descriptor.axis === "y" ? visiblePrimaryExtent : viewportBlockSize;
  const visibleSheetInlineExtent =
    descriptor.axis === "x" ? visiblePrimaryExtent : viewportInlineSize;
  const visibleBodyBlockExtent = Math.max(0, visibleSheetBlockExtent - measuredChromeBlockExtent);

  return {
    axis: descriptor.axis,
    bodyClientBlockExtent,
    bodyScrollBlockExtent,
    bodyScrollOffset,
    canonicalPosition,
    intrinsicBodyContentBlockExtent,
    intrinsicContentPrimaryExtent,
    maximumBodyScrollOffset: Math.max(0, bodyScrollBlockExtent - bodyClientBlockExtent),
    measuredChromeBlockExtent,
    physicalTransform: toPhysicalSheetPosition(input.side, canonicalPosition),
    primarySurfaceExtent,
    side: input.side,
    viewportBlockSize,
    viewportInlineSize,
    visibleBodyBlockExtent,
    visiblePrimaryExtent,
    visibleSheetBlockExtent,
    visibleSheetInlineExtent,
  };
}
