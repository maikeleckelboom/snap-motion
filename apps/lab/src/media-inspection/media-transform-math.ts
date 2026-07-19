import {
  fittedMediaTransform,
  mediaTransformLimits,
  type MediaPoint,
  type MediaSize,
  type MediaTransform,
  type MediaTransformBounds,
  type MediaTransformContext,
  type MediaTransformLimits,
} from "./media-transform-contracts";

const finiteOr = (value: number, fallback: number) => (Number.isFinite(value) ? value : fallback);

function nonNegative(value: number): number {
  return Math.max(0, finiteOr(value, 0));
}

function positive(value: number): number {
  return Math.max(Number.EPSILON, nonNegative(value));
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
    x: Math.min(bounds.maxX, Math.max(-bounds.maxX, finiteOr(transform.x, 0))),
    y: Math.min(bounds.maxY, Math.max(-bounds.maxY, finiteOr(transform.y, 0))),
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
  const amount = Math.min(1, Math.max(0, finiteOr(progress, 0)));
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
