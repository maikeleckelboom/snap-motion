import {
  fittedMediaTransform,
  mediaTransformLimits,
  type GalleryMediaAction,
  type GalleryMediaVisibility,
  type GallerySlotPosition,
  type GallerySwipeInput,
  type GalleryTap,
  type GalleryTrackSlot,
  type MediaGalleryImageSource,
  type MediaGalleryItem,
  type MediaPoint,
  type MediaSize,
  type MediaTransform,
  type MediaTransformBounds,
  type MediaTransformContext,
  type MediaTransformLimits,
  type PinchTransformInput,
} from "./media-gallery-contracts";
import { MEDIA_GALLERY_TUNING } from "./media-gallery-tuning";

const finiteOr = (value: number, fallback: number) => (Number.isFinite(value) ? value : fallback);

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

function nonNegative(value: number): number {
  return Math.max(0, finiteOr(value, 0));
}

function positive(value: number): number {
  return Math.max(Number.EPSILON, nonNegative(value));
}

function normalizeIntrinsicSize(item: MediaGalleryItem): MediaSize {
  for (const source of [item.full, item.preview]) {
    if (
      Number.isFinite(source.width) &&
      Number(source.width) > 0 &&
      Number.isFinite(source.height) &&
      Number(source.height) > 0
    ) {
      return { height: Number(source.height), width: Number(source.width) };
    }
  }
  return { height: 1, width: 1 };
}

function normalizeImageSource(
  source: MediaGalleryImageSource,
  label: string,
): MediaGalleryImageSource {
  if (!source.src.trim()) throw new RangeError(`${label}.src must be a non-empty string.`);
  if (source.src !== source.src.trim()) {
    throw new RangeError(`${label}.src must not contain surrounding whitespace.`);
  }
  const hasIntrinsicSize =
    Number.isFinite(source.width) &&
    Number(source.width) > 0 &&
    Number.isFinite(source.height) &&
    Number(source.height) > 0;
  return {
    src: source.src,
    ...(source.srcset ? { srcset: source.srcset } : {}),
    ...(source.sizes ? { sizes: source.sizes } : {}),
    ...(hasIntrinsicSize ? { width: source.width, height: source.height } : {}),
  };
}

function normalizedLimits(limits: MediaTransformLimits): MediaTransformLimits {
  const minScale = positive(limits.minScale);
  return {
    minScale,
    maxScale: Math.max(minScale, positive(limits.maxScale)),
  };
}

export function clampMediaScale(
  scale: number,
  limits: MediaTransformLimits = mediaTransformLimits,
): number {
  const normalized = normalizedLimits(limits);
  return Math.min(normalized.maxScale, Math.max(normalized.minScale, finiteOr(scale, 1)));
}

export function fitMediaWithinViewport(
  viewportSize: MediaSize,
  intrinsicSize: MediaSize,
): MediaSize {
  const viewport = {
    height: nonNegative(viewportSize.height),
    width: nonNegative(viewportSize.width),
  };
  const intrinsic = {
    height: positive(intrinsicSize.height),
    width: positive(intrinsicSize.width),
  };
  const fitScale = Math.min(viewport.width / intrinsic.width, viewport.height / intrinsic.height);

  if (!Number.isFinite(fitScale) || fitScale <= 0) {
    return { height: 0, width: 0 };
  }

  return {
    height: intrinsic.height * fitScale,
    width: intrinsic.width * fitScale,
  };
}

export function resolveMediaTransformBounds(
  context: MediaTransformContext,
  scale: number,
): MediaTransformBounds {
  const fittedSize = fitMediaWithinViewport(context.viewportSize, context.intrinsicSize);
  const safeScale = positive(scale);

  return {
    maxX: Math.max(0, (fittedSize.width * safeScale - nonNegative(context.viewportSize.width)) / 2),
    maxY: Math.max(
      0,
      (fittedSize.height * safeScale - nonNegative(context.viewportSize.height)) / 2,
    ),
  };
}

export function constrainMediaTransform(
  transform: MediaTransform,
  context: MediaTransformContext,
  limits: MediaTransformLimits = mediaTransformLimits,
): MediaTransform {
  const scale = clampMediaScale(transform.scale, limits);
  const bounds = resolveMediaTransformBounds(context, scale);

  return {
    scale,
    x: clamp(finiteOr(transform.x, 0), -bounds.maxX, bounds.maxX),
    y: clamp(finiteOr(transform.y, 0), -bounds.maxY, bounds.maxY),
  };
}

export function zoomMediaTransform(
  transform: MediaTransform,
  requestedScale: number,
  focalPoint: MediaPoint,
  context: MediaTransformContext,
  limits: MediaTransformLimits = mediaTransformLimits,
): MediaTransform {
  const current = constrainMediaTransform(transform, context, limits);
  const scale = clampMediaScale(requestedScale, limits);
  const ratio = scale / current.scale;
  const focalX = finiteOr(focalPoint.x, 0);
  const focalY = finiteOr(focalPoint.y, 0);

  return constrainMediaTransform(
    {
      scale,
      x: focalX - (focalX - current.x) * ratio,
      y: focalY - (focalY - current.y) * ratio,
    },
    context,
    limits,
  );
}

export function panMediaTransform(
  transform: MediaTransform,
  delta: MediaPoint,
  context: MediaTransformContext,
  limits: MediaTransformLimits = mediaTransformLimits,
): MediaTransform {
  return constrainMediaTransform(
    {
      scale: transform.scale,
      x: transform.x + finiteOr(delta.x, 0),
      y: transform.y + finiteOr(delta.y, 0),
    },
    context,
    limits,
  );
}

export function interpolateMediaTransform(
  from: MediaTransform,
  to: MediaTransform,
  progress: number,
): MediaTransform {
  const amount = clamp(finiteOr(progress, 0), 0, 1);
  return {
    scale: from.scale + (to.scale - from.scale) * amount,
    x: from.x + (to.x - from.x) * amount,
    y: from.y + (to.y - from.y) * amount,
  };
}

export function isFittedMediaTransform(transform: MediaTransform): boolean {
  return (
    Math.abs(transform.scale - fittedMediaTransform.scale) < 0.001 &&
    Math.abs(transform.x) < 0.01 &&
    Math.abs(transform.y) < 0.01
  );
}

export function resolveGallerySwipe(input: GallerySwipeInput): -1 | 0 | 1 {
  if (input.cancelled || input.scale > 1.001 || input.itemCount <= 1 || input.viewportWidth <= 0) {
    return 0;
  }

  const horizontal = Math.abs(input.deltaX);
  const vertical = Math.abs(input.deltaY);
  if (
    horizontal < MEDIA_GALLERY_TUNING.swipeThreshold ||
    horizontal < vertical * MEDIA_GALLERY_TUNING.horizontalIntentRatio
  ) {
    return 0;
  }

  const elapsedSeconds = Math.max(1, input.elapsedMs) / 1_000;
  const velocity = horizontal / elapsedSeconds;
  const displacement = horizontal >= input.viewportWidth * MEDIA_GALLERY_TUNING.swipeDistanceRatio;
  if (!displacement && velocity < MEDIA_GALLERY_TUNING.swipeVelocity) {
    return 0;
  }

  const direction = input.deltaX < 0 ? 1 : -1;
  const nextIndex = clamp(input.index + direction, 0, input.itemCount - 1);
  return nextIndex === input.index ? 0 : direction;
}

export function galleryPreloadIndices(index: number, itemCount: number): number[] {
  if (itemCount <= 0) return [];
  const current = clampGalleryIndex(index, itemCount);
  return [current - 1, current, current + 1].filter(
    (candidate, position, candidates) =>
      candidate >= 0 && candidate < itemCount && candidates.indexOf(candidate) === position,
  );
}

export function resolveGalleryTrackSlots(
  index: number,
  itemCount: number,
  destinationIndex?: number,
): GalleryTrackSlot[] {
  if (itemCount <= 0) return [];
  const current = clampGalleryIndex(index, itemCount);
  const destination =
    destinationIndex === undefined ? current : clampGalleryIndex(destinationIndex, itemCount);
  const direction = Math.sign(destination - current) as GallerySlotPosition;
  const positions = new Map<number, GallerySlotPosition>();

  if (direction !== 0 && Math.abs(destination - current) > 1) {
    const opposite = current - direction;
    if (opposite >= 0 && opposite < itemCount) {
      positions.set(opposite, -direction as GallerySlotPosition);
    }
    positions.set(current, 0);
    positions.set(destination, direction);
  } else {
    for (const candidate of galleryPreloadIndices(current, itemCount)) {
      positions.set(candidate, (candidate - current) as GallerySlotPosition);
    }
  }

  const slots = [...positions].map(([itemIndex, position]) => ({ itemIndex, position }));
  return ([-1, 0, 1] as const).flatMap((position) =>
    slots.filter((slot) => slot.position === position),
  );
}

export function resolveGalleryTrackOffset(
  dragOffset: number,
  viewportWidth: number,
  index: number,
  itemCount: number,
): number {
  if (viewportWidth <= 0 || itemCount <= 0) return 0;
  const beyondStart = index <= 0 && dragOffset > 0;
  const beyondEnd = index >= itemCount - 1 && dragOffset < 0;
  const resolved = beyondStart || beyondEnd ? dragOffset * 0.08 : dragOffset;
  const limit = beyondStart || beyondEnd ? Math.min(24, viewportWidth * 0.05) : viewportWidth;
  return clamp(resolved, -limit, limit);
}

export function resolveGalleryCommitOffset(direction: -1 | 1, viewportWidth: number): number {
  return -direction * Math.max(0, viewportWidth);
}

export function shouldTransitionGalleryMedia(
  action: GalleryMediaAction,
  reducedMotion: boolean,
): boolean {
  return (
    !reducedMotion &&
    (action === "button" ||
      action === "double-click" ||
      action === "double-tap" ||
      action === "fit" ||
      action === "keyboard")
  );
}

export function resolveGalleryMediaVisibility(
  state: "failed" | "loaded" | "pending" | "preview",
): GalleryMediaVisibility {
  return {
    fullMounted: state === "loaded" || state === "pending",
    fullVisible: state === "loaded",
    previewVisible: state !== "loaded",
  };
}

export function isRepeatedGalleryTap(
  previous: GalleryTap | undefined,
  current: GalleryTap,
): boolean {
  if (!previous) return false;
  return (
    current.time - previous.time >= 0 &&
    current.time - previous.time <= MEDIA_GALLERY_TUNING.doubleTapDelay &&
    Math.hypot(current.x - previous.x, current.y - previous.y) <=
      MEDIA_GALLERY_TUNING.doubleTapDistance
  );
}

export function resolvePinchTransform(input: PinchTransformInput): MediaTransform {
  const initialDistance = Math.max(Number.EPSILON, input.initialDistance);
  const scale = input.initialTransform.scale * (input.currentDistance / initialDistance);
  const zoomed = zoomMediaTransform(
    input.initialTransform,
    scale,
    input.initialCenter,
    input.context,
  );
  return constrainMediaTransform(
    {
      scale: zoomed.scale,
      x: zoomed.x + input.currentCenter.x - input.initialCenter.x,
      y: zoomed.y + input.currentCenter.y - input.initialCenter.y,
    },
    input.context,
  );
}

export function canonicalMediaGalleryTransform(
  transform: MediaTransform,
  context: MediaTransformContext,
): MediaTransform {
  const constrained = constrainMediaTransform(transform, context);
  return constrained.scale <= 1.001 ? { scale: 1, x: 0, y: 0 } : constrained;
}

export function clampGalleryIndex(index: number, itemCount: number): number {
  return clamp(Math.round(finiteOr(index, 0)), 0, Math.max(0, itemCount - 1));
}

export type NormalizedMediaGalleryItem<TItem extends MediaGalleryItem> = Omit<
  TItem,
  keyof MediaGalleryItem
> &
  Omit<MediaGalleryItem, "id"> &
  Pick<TItem, "id"> & {
    readonly intrinsicHeight: number;
    readonly intrinsicWidth: number;
  };

export function normalizeMediaGalleryItems<TItem extends MediaGalleryItem>(
  items: readonly TItem[],
): Array<NormalizedMediaGalleryItem<TItem>> {
  const ids = new Set<string>();
  items.forEach((item, index) => {
    const trimmedId = item.id.trim();
    if (!trimmedId) {
      throw new RangeError(
        `Media gallery item IDs must be unique non-empty strings; item at index ${index} has an empty ID.`,
      );
    }
    if (trimmedId !== item.id) {
      throw new RangeError(
        `Media gallery item IDs must already be canonical; "${item.id}" at index ${index} has surrounding whitespace.`,
      );
    }
    if (ids.has(item.id)) {
      throw new RangeError(
        `Media gallery item IDs must be unique non-empty strings; "${item.id}" at index ${index} duplicates an earlier item.`,
      );
    }
    ids.add(item.id);
  });

  return items.map((item, index) => {
    const intrinsicSize = normalizeIntrinsicSize(item);
    return {
      ...item,
      id: item.id,
      preview: normalizeImageSource(item.preview, `Media gallery item ${index} preview`),
      full: normalizeImageSource(item.full, `Media gallery item ${index} full`),
      intrinsicWidth: intrinsicSize.width,
      intrinsicHeight: intrinsicSize.height,
    } as NormalizedMediaGalleryItem<TItem>;
  });
}

export function resolvePreservedGalleryIndex(
  previousId: string | undefined,
  previousIndex: number,
  items: readonly MediaGalleryItem[],
): number {
  const preserved = previousId ? items.findIndex((candidate) => candidate.id === previousId) : -1;
  return preserved >= 0 ? preserved : clampGalleryIndex(previousIndex, items.length);
}
