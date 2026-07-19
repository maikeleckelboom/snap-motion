export type PointerIntent = "horizontal" | "pending" | "vertical";

export interface PointerIntentOptions {
  dominanceRatio?: number;
  threshold?: number;
}

export function isSupportedPrimaryPointerStart(
  event: Pick<PointerEvent, "button" | "isPrimary" | "pointerType">,
) {
  return event.isPrimary && (event.pointerType !== "mouse" || event.button === 0);
}

export function resolvePointerIntent(
  deltaX: number,
  deltaY: number,
  options: PointerIntentOptions = {},
): PointerIntent {
  const threshold = Math.max(0, options.threshold ?? 8);
  const dominanceRatio = Math.max(1, options.dominanceRatio ?? 1.25);
  const horizontal = Math.abs(deltaX);
  const vertical = Math.abs(deltaY);

  if (Math.max(horizontal, vertical) < threshold) {
    return "pending";
  }
  if (horizontal >= vertical * dominanceRatio) {
    return "horizontal";
  }
  if (vertical >= horizontal * dominanceRatio) {
    return "vertical";
  }
  return "pending";
}

/** Returns true when a descendant has explicitly retained pointer-drag ownership. */
export function elementOwnsSnapMotionDrag(target: EventTarget | null) {
  if (typeof Element === "undefined" || !(target instanceof Element)) {
    return false;
  }
  return (
    target.closest(
      "input, textarea, select, option, button, a[href], video[controls], audio[controls], [contenteditable]:not([contenteditable='false']), [role='slider'], [role='spinbutton'], [role='combobox'], [role='listbox'], [role='menu'], [role='tree'], [role='grid'], [role='tablist'], [role='radiogroup'], [data-snap-motion-ignore-drag]",
    ) !== null
  );
}
