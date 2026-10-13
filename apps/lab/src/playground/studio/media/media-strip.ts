import { createVariableWidthGeometry, type ControllerMeasurement } from "@snap-motion/core";

/**
 * Geometry of the item carousel: a strip of unequal-width items with the selected one centred.
 *
 * It is a custom {@link ControllerMeasurement} built from the public core factory, not the package's
 * `CarouselRoot` strategy. That strategy reads items registered by `CarouselSlide`, which makes every
 * non-current slide `inert`: right for a gallery whose neighbours are decoration, wrong for a strip
 * whose neighbours are things a visitor taps. The strip owns its items instead, and the motion
 * engine only needs their layout boxes.
 */

export interface StripBox<Id extends string = string> {
  readonly id: Id;
  /** Layout start relative to the track's content origin, in CSS pixels. */
  readonly start: number;
  /** Layout size, in CSS pixels. */
  readonly size: number;
}

export interface StripMeasurement {
  readonly boxes: readonly StripBox[];
  readonly viewportSize: number;
  readonly trackExtent: number;
}

/**
 * Anchors that put each item's centre on the viewport's. The track's own inset (half the viewport
 * less half the first or last item) makes the first and last centre reachable, so no two anchors
 * collapse onto one clamped boundary position and a step never moves nothing.
 */
export function stripMeasurement<Id extends string>(
  measurement: StripMeasurement,
): ControllerMeasurement<Id> {
  const { boxes, trackExtent, viewportSize } = measurement;
  const last = boxes.at(-1);
  const geometry = createVariableWidthGeometry({
    alignment: "center",
    // Layout reports whole pixels while a track's extent is rounded separately, so the last item can
    // appear to end a pixel past it. The extent is never allowed to be less than the content.
    items: boxes.map((box, order) => ({ ...box, order })),
    trackExtent: Math.max(trackExtent, last ? last.start + last.size : 0),
    viewportSize,
  });
  return {
    anchors: geometry.anchors as ControllerMeasurement<Id>["anchors"],
    bounds: geometry.bounds,
  };
}

/** Reads each item's layout box in `ids` order. Visual transforms never reach these. */
export function readStripBoxes<Id extends string>(
  track: HTMLElement,
  ids: readonly Id[],
): StripBox<Id>[] {
  const byId = new Map<string, HTMLElement>();
  for (const element of track.querySelectorAll<HTMLElement>("[data-media-id]")) {
    const id = element.dataset.mediaId;
    if (id !== undefined) byId.set(id, element);
  }
  return ids.flatMap((id) => {
    const element = byId.get(id);
    return element ? [{ id, size: element.offsetWidth, start: element.offsetLeft }] : [];
  });
}

/**
 * How wide an item is, as CSS. Height is the strip's one responsive quantity; width follows from the
 * aspect ratio, capped so the next item always shows beyond the selected one. The strip's insets use
 * this same expression for the first and last item, so the two cannot disagree.
 */
export function itemWidthCss(aspect: string): string {
  return `max(var(--strip-min-item), min(calc(var(--strip-item-height) * ${aspect}), var(--strip-max-item)))`;
}
