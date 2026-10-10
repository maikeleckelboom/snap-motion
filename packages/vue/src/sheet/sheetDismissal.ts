import type { SheetSide } from "./sheet-contracts";

type Bounds = Pick<DOMRectReadOnly, "top" | "right" | "bottom" | "left">;

/** Conservative outward paint envelope on the panel's free edge. */
export function sheetExitPaintOutset(style: CSSStyleDeclaration, side: SheetSide): number {
  // A consumer filter can paint outside the box with unknown reach. Keep native rest completion.
  if (style.filter && style.filter !== "none") return Infinity;
  let outset =
    style.outlineStyle && style.outlineStyle !== "none"
      ? Math.max(0, parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset))
      : 0;
  for (const shadow of style.boxShadow.replace(/\([^)]*\)/g, "").split(",")) {
    if (!shadow.trim() || shadow.trim() === "none" || shadow.includes("inset")) continue;
    const lengths = shadow.match(/-?\d*\.?\d+px/g)?.map(parseFloat);
    if (!lengths || lengths.length < 2 || lengths.length > 4) return Infinity;
    const [x = 0, y = 0, blur = 0, spread = 0] = lengths;
    const offset = side === "bottom" ? -y : side === "top" ? y : side === "right" ? -x : x;
    // Twice the blur radius conservatively contains the meaningful Gaussian tail.
    outset = Math.max(outset, offset + 2 * blur + spread);
  }
  return Number.isFinite(outset) ? Math.max(0, outset) : Infinity;
}

/** At most half a device pixel of panel/outline/shadow may remain inside the dialog clip. */
export function sheetVisuallyDismissed(
  side: SheetSide,
  panel: Bounds,
  clip: Bounds,
  paintOutset: number,
  devicePixelRatio: number,
): boolean {
  const overlap =
    side === "bottom"
      ? clip.bottom - panel.top
      : side === "top"
        ? panel.bottom - clip.top
        : side === "right"
          ? clip.right - panel.left
          : panel.right - clip.left;
  return (
    Number.isFinite(overlap) &&
    Number.isFinite(paintOutset) &&
    overlap + paintOutset <= 0.5 / Math.max(1, devicePixelRatio)
  );
}
