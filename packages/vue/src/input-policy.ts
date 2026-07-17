export type PointerIntent = "horizontal" | "pending" | "vertical";

export interface PointerIntentOptions {
  dominanceRatio?: number;
  threshold?: number;
}

export interface NormalizedWheelDelta {
  x: number;
  y: number;
}

const KEYBOARD_OWNER_SELECTOR = [
  "input",
  "textarea",
  "select",
  "option",
  "video[controls]",
  "audio[controls]",
  "[contenteditable]:not([contenteditable='false'])",
  "[role='slider']",
  "[role='spinbutton']",
  "[role='combobox']",
  "[role='listbox']",
  "[role='menu']",
  "[role='menubar']",
  "[role='tree']",
  "[role='grid']",
  "[role='tablist']",
  "[role='radiogroup']",
  "[data-snap-motion-keyboard-owner]",
].join(", ");

const SLIDE_INTERACTIVE_SELECTOR = ["a[href]", "button", "[role='button']", "[role='link']"].join(
  ", ",
);

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

  if (target.closest("[data-snap-motion-keyboard-navigation]")) {
    return false;
  }
  if (target.closest(KEYBOARD_OWNER_SELECTOR)) {
    return true;
  }
  const slide = target.closest("[data-slide-id]");
  const interactive = target.closest(SLIDE_INTERACTIVE_SELECTOR);
  return Boolean(slide && interactive && slide.contains(interactive));
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

export function carouselKeyAction(
  event: Pick<KeyboardEvent, "key" | "target"> &
    Partial<Pick<KeyboardEvent, "altKey" | "ctrlKey" | "defaultPrevented" | "metaKey">>,
): "end" | "home" | "next" | "previous" | undefined {
  if (
    event.defaultPrevented ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    elementOwnsCarouselKeyboard(event.target)
  ) {
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
