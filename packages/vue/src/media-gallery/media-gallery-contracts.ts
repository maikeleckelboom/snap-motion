import type {
  CloseReason,
  FocusReturnOptions,
  InitialFocus,
  OpenRequestDetails,
} from "@snap-motion/vue/dialog";

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

export interface MediaGalleryOpenRequestDetails<
  Id extends string = string,
> extends OpenRequestDetails {
  /** Final semantic media identity, independent of collection order. */
  readonly activeId: Id | undefined;
}

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

export interface MediaGalleryDialogProps<TItem extends MediaGalleryItem = MediaGalleryItem> {
  open: boolean;
  items: readonly TItem[];
  /** Application-authoritative semantic media identity. Controlled when supplied. */
  activeId?: TItem["id"];
  reducedMotionOverride?: boolean | undefined;
  messages?: Partial<MediaGalleryMessages>;
  focusReturn?: FocusReturnOptions;
  initialFocus?: InitialFocus;
  eyebrow?: string;
  title?: string;
  descriptionId?: string;
}

/** The read-only state and commands exposed by a mounted media gallery template ref. */
export interface MediaGalleryHandle<Id extends string = string> {
  readonly activeId: Id | undefined;
  readonly dialog: HTMLDialogElement | undefined;
  readonly settledId: Id | undefined;
  navigateTo(id: Id): boolean;
  next(): void;
  previous(): void;
  resetToFit(): void;
  requestClose(reason?: CloseReason): void;
  synchronizeTo(id: Id): boolean;
}

export type { CloseReason, FocusReturnOptions, InitialFocus, OpenRequestDetails };

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
