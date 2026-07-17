export type PointerIntent = "horizontal" | "pending" | "vertical";

export interface PointerIntentOptions {
  dominanceRatio?: number;
  threshold?: number;
}

export interface NormalizedWheelDelta {
  x: number;
  y: number;
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
  if (Math.abs(delta.x) > Math.abs(delta.y)) {
    return delta.x;
  }
  if (event.shiftKey && delta.y !== 0) {
    return delta.y;
  }
  return undefined;
}

export function elementOwnsCarouselKeyboard(target: EventTarget | null) {
  if (typeof Element === "undefined" || !(target instanceof Element)) {
    return false;
  }

  return (
    target.closest(
      "input, textarea, select, [contenteditable='true'], [role='slider'], [role='menu'], [role='listbox'], [data-snap-motion-keyboard-owner]",
    ) !== null
  );
}

export function carouselKeyAction(
  event: Pick<KeyboardEvent, "key" | "target"> &
    Partial<Pick<KeyboardEvent, "altKey" | "ctrlKey" | "metaKey">>,
): "end" | "home" | "next" | "previous" | undefined {
  if (event.altKey || event.ctrlKey || event.metaKey || elementOwnsCarouselKeyboard(event.target)) {
    return undefined;
  }

  switch (event.key) {
    case "ArrowLeft":
      return "previous";
    case "ArrowRight":
      return "next";
    case "Home":
      return "home";
    case "End":
      return "end";
    default:
      return undefined;
  }
}
