import type { FocusReturnOptions, InitialFocus } from "../internal/accessibility/focus";

export interface MediaGalleryItem {
  readonly id: string;
  readonly title: string;
  readonly alt: string;
  readonly previewSrc: string;
  readonly fullSrc?: string;
  readonly width: number;
  readonly height: number;
  readonly description?: string;
}

export type MediaGalleryCloseReason = "backdrop" | "close-button" | "escape" | "programmatic";

export type MediaGalleryNavigationReason = "previous" | "next" | "swipe" | "home" | "end";

export interface MediaGalleryMessages {
  closeGallery: string;
  previousItem(context: { title: string | undefined }): string;
  nextItem(context: { title: string | undefined }): string;
  position(context: { index: number; count: number }): string;
  zoomIn: string;
  zoomOut: string;
  fit: string;
  retry: string;
  loadingFullImage: string;
  fullImageUnavailable: string;
  previewFallback: string;
  previewUnavailable: string;
  zoomControls: string;
  zoomLabel: string;
  currentItem(context: { title: string; index: number; count: number }): string;
  gestureInstructions: string;
}

export interface MediaGalleryDialogProps {
  open: boolean;
  items: readonly MediaGalleryItem[];
  initialIndex?: number;
  reducedMotionOverride?: boolean;
  messages?: Partial<MediaGalleryMessages>;
  focusReturn?: FocusReturnOptions;
  initialFocus?: InitialFocus;
  eyebrow?: string;
  title?: string;
  descriptionId?: string;
}

export type { FocusReturnOptions, InitialFocus };

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

export interface GallerySwipeInput {
  readonly cancelled: boolean;
  readonly deltaX: number;
  readonly deltaY: number;
  readonly elapsedMs: number;
  readonly index: number;
  readonly itemCount: number;
  readonly scale: number;
  readonly viewportWidth: number;
}

export interface GalleryTap {
  readonly time: number;
  readonly x: number;
  readonly y: number;
}

export type GallerySlotPosition = -1 | 0 | 1;

export interface GalleryTrackSlot {
  readonly itemIndex: number;
  readonly position: GallerySlotPosition;
}

export interface GalleryMediaVisibility {
  readonly fullMounted: boolean;
  readonly fullVisible: boolean;
  readonly previewVisible: boolean;
}

export type GalleryMediaAction =
  | "button"
  | "double-click"
  | "double-tap"
  | "fit"
  | "keyboard"
  | "pan"
  | "pinch"
  | "swipe";

export interface PinchTransformInput {
  readonly context: MediaTransformContext;
  readonly currentCenter: MediaPoint;
  readonly currentDistance: number;
  readonly initialCenter: MediaPoint;
  readonly initialDistance: number;
  readonly initialTransform: MediaTransform;
}
