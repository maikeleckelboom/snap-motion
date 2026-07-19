export interface NormalizedWheelDelta {
  x: number;
  y: number;
}

export function normalizeWheelDelta(
  event: Pick<WheelEvent, "deltaMode" | "deltaX" | "deltaY">,
  pageSize: number,
  lineSize = 16,
): NormalizedWheelDelta {
  const multiplier = event.deltaMode === 1 ? lineSize : event.deltaMode === 2 ? pageSize : 1;

  return {
    x: event.deltaX * multiplier,
    y: event.deltaY * multiplier,
  };
}

export function horizontalWheelDelta(
  event: Pick<WheelEvent, "deltaMode" | "deltaX" | "deltaY" | "shiftKey">,
  pageSize: number,
  lineSize = 16,
) {
  const delta = normalizeWheelDelta(event, pageSize, lineSize);
  if (Math.abs(delta.x) > Math.abs(delta.y)) return delta.x;
  if (event.shiftKey && delta.y !== 0) return delta.y;
  return undefined;
}

/** Returns true when a descendant or nested scroll container owns a wheel gesture. */
export function elementOwnsSnapMotionWheel(target: EventTarget | null) {
  if (typeof Element === "undefined" || !(target instanceof Element)) return false;
  if (
    target.closest(
      "input, textarea, select, option, video[controls], audio[controls], [role='slider'], [role='spinbutton'], [role='combobox'], [role='listbox'], [role='menu'], [role='tree'], [role='grid'], [role='tablist'], [role='radiogroup'], [data-snap-motion-wheel-owner]",
    )
  ) {
    return true;
  }

  for (let element: Element | null = target; element; element = element.parentElement) {
    if (!(element instanceof HTMLElement)) continue;
    const view: Window | null = element.ownerDocument.defaultView;
    const style = view?.getComputedStyle(element);
    const scrollableX =
      element.scrollWidth > element.clientWidth && /auto|scroll/.test(style?.overflowX ?? "");
    const scrollableY =
      element.scrollHeight > element.clientHeight && /auto|scroll/.test(style?.overflowY ?? "");
    if (scrollableX || scrollableY) return true;
    if (element.hasAttribute("data-snap-motion-carousel-root")) break;
  }
  return false;
}
