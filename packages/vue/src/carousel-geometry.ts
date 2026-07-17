import {
  createFixedStageGeometry,
  createVariableWidthGeometry,
  type ControllerMeasurement,
} from "@snap-motion/core";

export interface CarouselGeometryMeasureContext<Id extends string> {
  readonly ids: readonly Id[];
  readonly viewport: HTMLElement;
  readonly track?: HTMLElement;
  readonly slides: ReadonlyMap<Id, HTMLElement>;
}

/** Public, framework-light measurement boundary for semantic carousel layouts. */
export interface CarouselGeometryStrategy<Id extends string> {
  measure(context: CarouselGeometryMeasureContext<Id>): ControllerMeasurement<Id>;
}

export interface FixedStageCarouselGeometryOptions {
  readonly gap?: number;
}

/** Creates the default one-viewport-per-semantic-item geometry strategy. */
export function createFixedStageCarouselGeometryStrategy<Id extends string>(
  options: FixedStageCarouselGeometryOptions = {},
): CarouselGeometryStrategy<Id> {
  return {
    measure({ ids, viewport }) {
      return createFixedStageGeometry({
        itemIds: ids,
        viewportSize: viewport.clientWidth,
        ...(options.gap === undefined ? {} : { gap: options.gap }),
      });
    },
  };
}

export interface VariableWidthCenteredCarouselGeometryOptions {
  readonly startGutter?: number;
  readonly endGutter?: number;
}

/** Measures registered slide layout boxes and centers variable-width items. */
export function createVariableWidthCenteredCarouselGeometryStrategy<Id extends string>(
  options: VariableWidthCenteredCarouselGeometryOptions = {},
): CarouselGeometryStrategy<Id> {
  return {
    measure({ ids, slides, track, viewport }) {
      const items = ids.flatMap((id, order) => {
        const slide = slides.get(id);
        return slide ? [{ id, order, size: slide.offsetWidth, start: slide.offsetLeft }] : [];
      });
      return createVariableWidthGeometry({
        alignment: "center",
        items,
        trackExtent: track?.scrollWidth ?? 0,
        viewportSize: viewport.clientWidth,
        ...(options.startGutter === undefined ? {} : { startGutter: options.startGutter }),
        ...(options.endGutter === undefined ? {} : { endGutter: options.endGutter }),
      });
    },
  };
}
