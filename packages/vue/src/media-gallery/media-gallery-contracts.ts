import type {
  CloseReason,
  FocusReturnOptions,
  InitialFocus,
  OpenRequestDetails,
} from "@snap-motion/vue/dialog";

/** One responsive image candidate owned by the Gallery consumer. */
export interface MediaGalleryImageSource {
  /** Required fallback URL used for `src` and canonical download/error identity. */
  readonly src: string;
  /** Optional responsive candidate list forwarded to the rendered image's `srcset`. */
  readonly srcset?: string;
  /**
   * Optional responsive selection hint forwarded to the rendered image's `sizes`.
   * With a non-empty `srcset`, this participates in resource-selection identity. It does not
   * make a source network-distinct by itself when no candidate list exists.
   */
  readonly sizes?: string;
  /** Intrinsic pixel width. Supply it together with `height` to reserve stable geometry. */
  readonly width?: number;
  /** Intrinsic pixel height. Supply it together with `width` to reserve stable geometry. */
  readonly height?: number;
}

/** A stable semantic Gallery item with separate preview and full responsive sources. */
export interface MediaGalleryItem {
  /** Stable application identity. It must be unique, non-empty, and already trimmed. */
  readonly id: string;
  /** Visible and announced item title. */
  readonly title: string;
  /** Alternative text for the current image. */
  readonly alt: string;
  /** Lightweight source rendered for current and adjacent track slots. */
  readonly preview: MediaGalleryImageSource;
  /** High-quality source promoted according to `preloadPolicy`. */
  readonly full: MediaGalleryImageSource;
  /** Optional settled-item description rendered as non-live dialog content. */
  readonly description?: string;
}

/** Controls which mounted track slots may request their full responsive source. */
export type MediaGalleryPreloadPolicy = "adjacent-full" | "current-only";

export interface MediaGalleryOpenRequestDetails<
  Id extends string = string,
> extends OpenRequestDetails {
  /** Final semantic media identity, independent of collection order. */
  readonly activeId: Id | undefined;
}

export interface MediaGalleryMessages {
  /** Accessible name for the close control. */
  closeGallery: string;
  /** Accessible name for the previous control. */
  previousItem(context: { title: string | undefined }): string;
  /** Accessible name for the next control. */
  nextItem(context: { title: string | undefined }): string;
  /** Visible position text. `index` is zero-based. */
  position(context: { index: number; count: number }): string;
  /** Accessible name for increasing zoom. */
  zoomIn: string;
  /** Accessible name for decreasing zoom. */
  zoomOut: string;
  /** Accessible name for resetting the media to its fitted transform. */
  fit: string;
  /** Visible action label for retrying the failed current full source. */
  retry: string;
  /** Status text while the current full source loads and decodes. */
  loadingFullImage: string;
  /** Status text when the current full source cannot be used. */
  fullImageUnavailable: string;
  /** Status text confirming that the preview remains visible after full-source failure. */
  previewFallback: string;
  /** Status text when the preview source also fails. */
  previewUnavailable: string;
  /** Accessible name for the zoom control group. */
  zoomControls: string;
  /** Visible label for the zoom percentage. */
  zoomLabel: string;
  /** Settled-item announcement. `index` is zero-based. */
  currentItem(context: { title: string; index: number; count: number }): string;
  /** Concise non-live pointer and touch instructions. */
  gestureInstructions: string;
}

export interface MediaGalleryDialogProps<TItem extends MediaGalleryItem = MediaGalleryItem> {
  /** Host-authoritative open state. Changes emit requests and never silently mutate host state. */
  open: boolean;
  /** Ordered semantic item collection. */
  items: readonly TItem[];
  /** Application-authoritative semantic media identity. Controlled when supplied. */
  activeId?: TItem["id"];
  /** Deterministic application/test override for the system reduced-motion preference. */
  reducedMotionOverride?: boolean | undefined;
  /** Localized message overrides merged with the English defaults. */
  messages?: Partial<MediaGalleryMessages>;
  /** Bounded opener and fallback focus-return policy for close and unmount. */
  focusReturn?: FocusReturnOptions;
  /** Focus target selected after the native modal opens. */
  initialFocus?: InitialFocus;
  /** Small visible category label above the dialog title. */
  eyebrow?: string;
  /** Dialog heading. */
  title?: string;
  /** ID of host-owned descriptive content referenced by the dialog. */
  descriptionId?: string;
  /** Full-source request policy. The conservative default promotes only the settled current item. */
  preloadPolicy?: MediaGalleryPreloadPolicy;
}

/** The read-only state and commands exposed by a mounted media gallery template ref. */
export interface MediaGalleryHandle<Id extends string = string> {
  /** Current accepted application identity. */
  readonly activeId: Id | undefined;
  /** Native dialog element when mounted. */
  readonly dialog: HTMLDialogElement | undefined;
  /** Mechanically settled media identity that owns title, description, position, and media. */
  readonly settledId: Id | undefined;
  /** Requests navigation to an available ID. Returns false when unavailable or already busy. */
  navigateTo(id: Id): boolean;
  /** Requests one adjacent item. Returns false at the boundary or while busy. */
  next(): boolean;
  /** Requests one previous item. Returns false at the boundary or while busy. */
  previous(): boolean;
  /** Restores the current media to its fitted transform. */
  resetToFit(): void;
  /** Emits a close request without mutating controlled host state. */
  requestClose(reason?: CloseReason): void;
  /** Adopts an available controlled ID without emitting a user navigation request. */
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
