export interface MediaSize {
  height: number;
  width: number;
}

export interface MediaPoint {
  x: number;
  y: number;
}

export interface MediaTransform {
  scale: number;
  x: number;
  y: number;
}

export interface MediaTransformBounds {
  maxX: number;
  maxY: number;
}

export interface MediaTransformContext {
  intrinsicSize: MediaSize;
  viewportSize: MediaSize;
}

export interface MediaTransformLimits {
  maxScale: number;
  minScale: number;
}

export const fittedMediaTransform: Readonly<MediaTransform> = {
  scale: 1,
  x: 0,
  y: 0,
};

export const mediaTransformLimits: Readonly<MediaTransformLimits> = {
  maxScale: 4,
  minScale: 1,
};
