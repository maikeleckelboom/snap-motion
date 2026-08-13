<script setup lang="ts" generic="TItem extends MediaGalleryItem">
import type { ActiveIdRequestDetails, SettlementDetails } from "@snap-motion/core";
import type { CloseReason, FocusReturnOptions, InitialFocus } from "@snap-motion/vue/dialog";
import { useEventListener, useResizeObserver, useScrollLock, useTimeoutFn } from "@vueuse/core";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, useId, watch } from "vue";

import {
  captureFocusOpener,
  focusInitial,
  maintainModalTabOrder,
  restoreFocus,
} from "../../internal/accessibility/focus";
import {
  observeFocusHandoffFromOpener,
  scheduleVerifiedFocusRestore,
  type FocusHandoffObservation,
  type FocusRestoreVerification,
} from "../../internal/accessibility/focus-restore";
import { isElement, isHTMLElement, isHTMLImageElement } from "../../internal/dom/realm";
import {
  fittedMediaTransform,
  type GalleryMediaAction,
  type GalleryTap,
  type MediaGalleryItem,
  type MediaGalleryMessages,
  type MediaGalleryOpenRequestDetails,
  type MediaGalleryPreloadPolicy,
  type MediaPoint,
  type MediaTransform,
  type MediaTransformContext,
} from "../media-gallery-contracts";
import {
  canonicalMediaGalleryTransform,
  clampGalleryIndex,
  hasDistinctMediaGallerySource,
  isRepeatedGalleryTap,
  normalizeMediaGalleryItems,
  panMediaTransform,
  resolveGalleryCommitOffset,
  resolvePreservedGalleryIndex,
  resolveGallerySwipe,
  resolveGalleryTrackOffset,
  resolveGalleryTrackSlots,
  resolvePinchTransform,
  shouldTransitionGalleryMedia,
  zoomMediaTransform,
} from "../media-gallery-math";
import { createEnglishMediaGalleryMessages } from "../media-gallery-messages";
import { MEDIA_GALLERY_TUNING } from "../media-gallery-tuning";

type DialogState = "closed" | "closing" | "open" | "opening";
type ImageLoadState = "failed" | "loaded" | "pending" | "preview";
type MediaTransitionMode = "direct" | "discrete";
type PointerMode = "blocked" | "pan" | "pending" | "swipe";
type TrackNavigationState = "idle" | "recentering" | "settling";
type TId = TItem["id"];

interface PointerSample {
  readonly id: number;
  readonly pointerType: string;
  x: number;
  y: number;
}

interface GestureSession {
  readonly pointerId: number;
  readonly pointerType: string;
  readonly startPan: MediaPoint;
  readonly startScale: number;
  readonly startTime: number;
  readonly startX: number;
  readonly startY: number;
  cancelled: boolean;
  involvedMultiplePointers: boolean;
  mode: PointerMode;
}

interface PinchSession {
  readonly initialCenter: MediaPoint;
  readonly initialDistance: number;
  readonly initialTransform: MediaTransform;
  readonly pointerIds: readonly [number, number];
}

const props = withDefaults(
  defineProps<{
    activeId?: TId;
    descriptionId?: string;
    eyebrow?: string;
    focusReturn?: FocusReturnOptions;
    initialFocus?: InitialFocus;
    items: readonly TItem[];
    messages?: Partial<MediaGalleryMessages>;
    open: boolean;
    preloadPolicy?: MediaGalleryPreloadPolicy;
    reducedMotionOverride?: boolean | undefined;
    title?: string;
  }>(),
  {
    eyebrow: "Media",
    initialFocus: "close",
    preloadPolicy: "current-only",
    reducedMotionOverride: undefined,
    title: "Gallery",
  },
);

const emit = defineEmits<{
  (event: "update:open", open: boolean): void;
  (event: "update:activeId", id: TId | undefined): void;
  (event: "openRequest", open: false, details: MediaGalleryOpenRequestDetails<TId>): void;
  (event: "activeIdRequest", id: TId | undefined, details: ActiveIdRequestDetails): void;
  (event: "opened", id: TId | undefined): void;
  (event: "closed", finalId: TId | undefined): void;
  (event: "settled", id: TId, details: SettlementDetails): void;
}>();
const slots = defineSlots<{
  actions?: () => unknown;
}>();

const items = computed(() => normalizeMediaGalleryItems(props.items));
const messages = computed(() => createEnglishMediaGalleryMessages(props.messages));
const systemReducedMotion = ref(false);
const reducedMotionQuery = shallowRef<MediaQueryList>();
const reducedMotion = computed(() => props.reducedMotionOverride ?? systemReducedMotion.value);
const dialog = ref<HTMLDialogElement>();
const shell = ref<HTMLElement>();
const closeButton = ref<HTMLButtonElement>();
const titleHeading = ref<HTMLElement>();
const imageViewport = ref<HTMLElement>();
const intendedActiveId = shallowRef<TId | undefined>(props.activeId ?? items.value[0]?.id);
const internalActiveId = shallowRef<TId | undefined>(intendedActiveId.value);
const latestValidAuthorityId = shallowRef<TId | undefined>(
  props.activeId !== undefined && items.value.some((item) => item.id === props.activeId)
    ? props.activeId
    : undefined,
);
const mechanicalAnchorId = shallowRef<TId | undefined>(intendedActiveId.value);
const galleryIndex = ref(indexForId(intendedActiveId.value));
const dialogState = ref<DialogState>("closed");
const imageLoadStateByItem = ref<Record<string, ImageLoadState>>({});
const imageRetryAttemptByItem = ref<Record<string, number>>({});
const imageRetryAuthorityByItem = ref<Record<string, number>>({});
const imageRetryRequestByItem = ref<Record<string, string>>({});
const selectedFullSourceByItem = ref<Record<string, string>>({});
const previewFailedByItem = ref<Record<string, boolean>>({});
const mounted = ref(false);
const openCycleGeneration = ref(0);
const itemCollectionGeneration = ref(0);
const liveMessage = ref("");
const pointerMode = ref<PointerMode | "idle">("idle");
const pointerCount = ref(0);
const transform = shallowRef<MediaTransform>({ ...fittedMediaTransform });
const mediaTransitionMode = ref<MediaTransitionMode>("direct");
const trackOffsetX = ref(0);
const trackNavigationState = ref<TrackNavigationState>("idle");
const trackTransitionEnabled = ref(false);
const trackDestinationIndex = ref<number>();
const previousFocused = ref(false);
const nextFocused = ref(false);
const zoomInFocused = ref(false);
const zoomOutFocused = ref(false);
const resetFocused = ref(false);
const titleId = `snap-motion-media-gallery-title-${useId()}`;
const activePointers = new Map<number, PointerSample>();
const documentElement = computed(() => dialog.value?.ownerDocument.documentElement);
const scrollLocked = useScrollLock(documentElement);
const mediaTransformElements = new Map<string, HTMLElement>();

let gesture: GestureSession | undefined;
let pinch: PinchSession | undefined;
let previousTap: GalleryTap | undefined;
let backdropPointerId: number | undefined;
let openingFrame: number | undefined;
let trackFrame: number | undefined;
let lockedRoot: HTMLElement | undefined;
let previousPaddingInlineEnd = "";
let pendingTrackDestination: number | undefined;
let pendingTrackDestinationId: TId | undefined;
let pendingTrackAnnouncement = true;
let pendingTrackReason: ActiveIdRequestDetails["reason"] | undefined;
let pendingTrackGeneration: number | undefined;
let navigationGeneration = 0;
let closeGeneration = 0;
let activeAuthorityGeneration = 0;
let retryRequestIdentity = 0;
let capturedOpener: HTMLElement | undefined;
let capturedOpenerGeneration = 0;
let capturedOpenerWasExplicit = false;
let focusRestoreVerification: FocusRestoreVerification | undefined;
let lifecycleGeneration = 0;
let openedLifecycleGeneration = 0;
let finalizedLifecycleGeneration = 0;
let closingLifecycleGeneration: number | undefined;
const nativeCloseLifecycles: {
  focusHandoff: FocusHandoffObservation;
  generation: number;
}[] = [];
let geometry = {
  height: 0,
  left: 0,
  top: 0,
  width: 0,
};

function explicitOpenerForCurrentLifecycle() {
  if (capturedOpener) return capturedOpenerWasExplicit ? capturedOpener : undefined;
  return props.focusReturn?.opener;
}

function cancelPendingCloseHandoffs() {
  for (const lifecycle of nativeCloseLifecycles) lifecycle.focusHandoff.cancel();
}

function clearPendingCloseHandoffs() {
  cancelPendingCloseHandoffs();
  nativeCloseLifecycles.length = 0;
}

const activeItem = computed(() => items.value[galleryIndex.value] ?? items.value[0]);
const semanticActiveId = computed<TId | undefined>(() => props.activeId ?? internalActiveId.value);
const settledId = computed<TId | undefined>(() => activeItem.value?.id);
const trackSlots = computed(() =>
  resolveGalleryTrackSlots(galleryIndex.value, items.value.length, trackDestinationIndex.value).map(
    (slot) => ({ ...slot, item: items.value[slot.itemIndex] }),
  ),
);
const canGoPrevious = computed(() => galleryIndex.value > 0);
const canGoNext = computed(() => galleryIndex.value < items.value.length - 1);
const galleryBusy = computed(() => trackNavigationState.value !== "idle");
const canNavigatePrevious = canGoPrevious;
const canNavigateNext = canGoNext;
const isZoomed = computed(() => transform.value.scale > 1.001);
const canZoomIn = computed(() => transform.value.scale < 4 - 0.001);
const canZoomOut = computed(() => isZoomed.value);
const scalePercentage = computed(() => Math.round(transform.value.scale * 100));
const activeImageLoadState = computed<ImageLoadState>(() => {
  const item = activeItem.value;
  return item ? (imageLoadStateByItem.value[item.id] ?? imageLoadDefault(item)) : "preview";
});
const canRetryActiveImage = computed(() => {
  const item = activeItem.value;
  return item !== undefined && selectedFullSourceByItem.value[item.id] !== undefined;
});
const transformStyle = computed(() => ({
  "--_gallery-pan-x": `${transform.value.x.toFixed(3)}px`,
  "--_gallery-pan-y": `${transform.value.y.toFixed(3)}px`,
  "--_gallery-scale": transform.value.scale.toFixed(4),
}));
const trackStyle = computed(() => ({
  "--_gallery-track-x": `${trackOffsetX.value.toFixed(3)}px`,
}));
const galleryPosition = computed(() =>
  messages.value.position({ index: galleryIndex.value, count: items.value.length }),
);
const previousLabel = computed(() => {
  const item = items.value[galleryIndex.value - 1];
  return messages.value.previousItem({ title: item?.title });
});
const nextLabel = computed(() => {
  const item = items.value[galleryIndex.value + 1];
  return messages.value.nextItem({ title: item?.title });
});

const { start: startCloseFallback, stop: stopCloseFallback } = useTimeoutFn(
  (generation: number) => finishClose(generation),
  MEDIA_GALLERY_TUNING.closeDuration + 80,
  { immediate: false },
);
const { start: startTrackFallback, stop: stopTrackFallback } = useTimeoutFn(
  (generation: number) => void completeTrackSettlement(generation),
  MEDIA_GALLERY_TUNING.trackDuration + 80,
  { immediate: false },
);

function cancelOpeningWork() {
  if (openingFrame === undefined) return;
  cancelAnimationFrame(openingFrame);
  openingFrame = undefined;
}

function resetTrackState() {
  pendingTrackDestination = undefined;
  pendingTrackDestinationId = undefined;
  pendingTrackAnnouncement = true;
  pendingTrackReason = undefined;
  pendingTrackGeneration = undefined;
  trackDestinationIndex.value = undefined;
  trackOffsetX.value = 0;
  trackTransitionEnabled.value = false;
  trackNavigationState.value = "idle";
}

function cancelTrackWork() {
  stopTrackFallback();
  if (trackFrame !== undefined) {
    cancelAnimationFrame(trackFrame);
    trackFrame = undefined;
  }
  resetTrackState();
}

function invalidateOpenCycle(): number {
  openCycleGeneration.value += 1;
  cancelOpeningWork();
  return openCycleGeneration.value;
}

function invalidateNavigation(): number {
  navigationGeneration += 1;
  cancelTrackWork();
  return navigationGeneration;
}

function beginNavigation(preserveTrackOffset = false): number {
  const currentTrackOffset = trackOffsetX.value;
  const generation = invalidateNavigation();
  if (preserveTrackOffset) trackOffsetX.value = currentTrackOffset;
  return generation;
}

function invalidateClose(): number {
  closeGeneration += 1;
  stopCloseFallback();
  return closeGeneration;
}

function isOpenCycleCurrent(
  generation: number,
  target: HTMLDialogElement | undefined = dialog.value,
): boolean {
  return (
    mounted.value &&
    generation === openCycleGeneration.value &&
    props.open &&
    target !== undefined &&
    target === dialog.value &&
    target.open &&
    dialogState.value === "opening"
  );
}

function isNavigationCurrent(generation: number): boolean {
  return (
    mounted.value &&
    generation === navigationGeneration &&
    props.open &&
    dialog.value?.open === true &&
    (dialogState.value === "open" || dialogState.value === "opening")
  );
}

function isMediaOperationCurrent(
  openGeneration: number,
  collectionGeneration: number,
  item: MediaGalleryItem,
  attempt?: number,
  retryAuthority?: number,
): boolean {
  return (
    mounted.value &&
    props.open &&
    dialog.value?.open === true &&
    openGeneration === openCycleGeneration.value &&
    collectionGeneration === itemCollectionGeneration.value &&
    items.value.some((candidate) => candidate.id === item.id) &&
    (attempt === undefined || attempt === imageRetryAttempt(item)) &&
    (attempt === undefined ||
      attempt === 0 ||
      (retryAuthority === activeAuthorityGeneration && item.id === activeItem.value?.id))
  );
}

function clampIndex(index: number): number {
  return clampGalleryIndex(index, items.value.length);
}

function indexForId(id: TId | undefined): number {
  if (id === undefined) return 0;
  const index = items.value.findIndex((item) => item.id === id);
  return index < 0 ? 0 : index;
}

function hasItem(id: TId | undefined): id is TId {
  return id !== undefined && items.value.some((item) => item.id === id);
}

function resolveRollbackId(): TId | undefined {
  if (hasItem(latestValidAuthorityId.value)) return latestValidAuthorityId.value;
  if (hasItem(mechanicalAnchorId.value)) return mechanicalAnchorId.value;
  return items.value[0]?.id;
}

function acceptActiveId(id: TId | undefined, reason: ActiveIdRequestDetails["reason"]): void {
  if (id === intendedActiveId.value) return;
  intendedActiveId.value = id;
  if (props.activeId === undefined) {
    internalActiveId.value = id;
    mechanicalAnchorId.value = id;
  }
  emit("update:activeId", id);
  emit("activeIdRequest", id, { reason });
}

function activeContext(): MediaTransformContext {
  const item = activeItem.value;
  return {
    intrinsicSize: item
      ? { height: item.intrinsicHeight, width: item.intrinsicWidth }
      : { height: 1, width: 1 },
    viewportSize: { height: geometry.height, width: geometry.width },
  };
}

function canonicalTransform(nextTransform: MediaTransform): MediaTransform {
  return canonicalMediaGalleryTransform(nextTransform, activeContext());
}

function commitTransform(nextTransform: MediaTransform) {
  transform.value = canonicalTransform(nextTransform);
}

function resetTransform() {
  transform.value = { ...fittedMediaTransform };
}

function localPoint(clientX: number, clientY: number): MediaPoint {
  return {
    x: clientX - geometry.left - geometry.width / 2,
    y: clientY - geometry.top - geometry.height / 2,
  };
}

function measureGeometry() {
  const target = imageViewport.value;
  if (!mounted.value || !props.open || !dialog.value?.open || !target) return;
  const rect = target.getBoundingClientRect();
  geometry = {
    height: rect.height,
    left: rect.left,
    top: rect.top,
    width: rect.width,
  };
  commitTransform(transform.value);
}

function setMediaTransition(action: GalleryMediaAction) {
  mediaTransitionMode.value = shouldTransitionGalleryMedia(action, reducedMotion.value)
    ? "discrete"
    : "direct";
}

function zoomTo(
  scale: number,
  focalPoint: MediaPoint = { x: 0, y: 0 },
  action: GalleryMediaAction = "button",
) {
  setMediaTransition(action);
  commitTransform(zoomMediaTransform(transform.value, scale, focalPoint, activeContext()));
}

function zoomIn(action: GalleryMediaAction = "button") {
  if (!canZoomIn.value) return;
  zoomTo(transform.value.scale + MEDIA_GALLERY_TUNING.zoomStep, { x: 0, y: 0 }, action);
}

function zoomOut(action: GalleryMediaAction = "button") {
  if (!canZoomOut.value) return;
  zoomTo(transform.value.scale - MEDIA_GALLERY_TUNING.zoomStep, { x: 0, y: 0 }, action);
}

function resetToFit(action: GalleryMediaAction = "fit") {
  setMediaTransition(action);
  resetTransform();
}

function resetToFitPublic(): void {
  resetToFit();
}

function announceCurrent() {
  const item = activeItem.value;
  if (item) {
    liveMessage.value = messages.value.currentItem({
      title: item.title,
      index: galleryIndex.value,
      count: items.value.length,
    });
  }
}

function imageLoadDefault(item: MediaGalleryItem): ImageLoadState {
  return hasDistinctFullSource(item) ? "pending" : "preview";
}

function hasDistinctFullSource(item: MediaGalleryItem): boolean {
  return hasDistinctMediaGallerySource(item.full, item.preview);
}

function shouldMountFull(item: MediaGalleryItem): boolean {
  return (
    hasDistinctFullSource(item) &&
    (props.preloadPolicy === "adjacent-full" || item.id === activeItem.value?.id)
  );
}

function ensureImageState(item: MediaGalleryItem | undefined, reset = false) {
  if (!item || (!reset && imageLoadStateByItem.value[item.id])) return;
  imageLoadStateByItem.value = {
    ...imageLoadStateByItem.value,
    [item.id]: imageLoadDefault(item),
  };
}

function ensureTrackImageStates() {
  for (const slot of trackSlots.value) {
    ensureImageState(slot.item);
  }
}

function imageLoadState(item: MediaGalleryItem): ImageLoadState {
  return imageLoadStateByItem.value[item.id] ?? imageLoadDefault(item);
}

function imageRetryAttempt(item: MediaGalleryItem): number {
  return imageRetryAttemptByItem.value[item.id] ?? 0;
}

function visibleFullSrc(item: MediaGalleryItem): string {
  return imageRetryRequestByItem.value[item.id] ?? item.full.src;
}

function visibleFullSrcset(item: MediaGalleryItem): string | undefined {
  return imageRetryAttempt(item) === 0 ? item.full.srcset : undefined;
}

function selectedFullSource(image: HTMLImageElement): string | undefined {
  const source = image.currentSrc.trim();
  return source || undefined;
}

function captureSelectedFullSource(
  image: HTMLImageElement,
  item: MediaGalleryItem,
  attempt: number,
) {
  if (attempt !== 0 || selectedFullSourceByItem.value[item.id]) return;
  const source = selectedFullSource(image);
  if (!source) return;
  selectedFullSourceByItem.value = { ...selectedFullSourceByItem.value, [item.id]: source };
}

function createRetryRequestSource(source: string): string | undefined {
  let url: URL;
  try {
    url = new URL(source, dialog.value?.ownerDocument.baseURI);
  } catch {
    return undefined;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;

  retryRequestIdentity += 1;
  url.searchParams.append(
    "snap-motion-retry",
    `${openCycleGeneration.value}-${itemCollectionGeneration.value}-${retryRequestIdentity}`,
  );
  return url.href;
}

function clearItemRetry(itemId: string) {
  imageRetryAttemptByItem.value = withoutKey(imageRetryAttemptByItem.value, itemId);
  imageRetryAuthorityByItem.value = withoutKey(imageRetryAuthorityByItem.value, itemId);
  imageRetryRequestByItem.value = withoutKey(imageRetryRequestByItem.value, itemId);
  selectedFullSourceByItem.value = withoutKey(selectedFullSourceByItem.value, itemId);
}

function resetMediaSourceState() {
  imageLoadStateByItem.value = {};
  imageRetryAttemptByItem.value = {};
  imageRetryAuthorityByItem.value = {};
  imageRetryRequestByItem.value = {};
  selectedFullSourceByItem.value = {};
  previewFailedByItem.value = {};
}

function setImageLoadState(item: MediaGalleryItem, state: ImageLoadState) {
  imageLoadStateByItem.value = { ...imageLoadStateByItem.value, [item.id]: state };
}

async function onFullImageLoad(event: Event, item: MediaGalleryItem) {
  const image = event.currentTarget;
  if (!isHTMLImageElement(image)) {
    return;
  }
  if (!shouldMountFull(item)) return;
  const attempt = Number(image.dataset.retryAttempt);
  const retryAuthority = Number(image.dataset.retryAuthority);
  const openGeneration = Number(image.dataset.openCycle);
  const collectionGeneration = Number(image.dataset.itemCollection);
  if (
    !isMediaOperationCurrent(openGeneration, collectionGeneration, item, attempt, retryAuthority)
  ) {
    return;
  }
  captureSelectedFullSource(image, item, attempt);
  try {
    await image.decode();
  } catch {
    if (
      isMediaOperationCurrent(openGeneration, collectionGeneration, item, attempt, retryAuthority)
    ) {
      setImageLoadState(item, "failed");
    }
    return;
  }
  if (
    !shouldMountFull(item) ||
    !isMediaOperationCurrent(openGeneration, collectionGeneration, item, attempt, retryAuthority) ||
    !image.complete ||
    image.naturalWidth <= 0 ||
    image.naturalHeight <= 0
  ) {
    return;
  }
  setImageLoadState(item, "loaded");
  if (item.id === activeItem.value?.id) {
    await nextTick();
    if (
      !isMediaOperationCurrent(openGeneration, collectionGeneration, item, attempt, retryAuthority)
    ) {
      return;
    }
    measureGeometry();
  }
}

function onFullImageError(event: Event, item: MediaGalleryItem) {
  const image = event.currentTarget;
  const attempt = isHTMLImageElement(image) ? Number(image.dataset.retryAttempt) : Number.NaN;
  if (
    isHTMLImageElement(image) &&
    shouldMountFull(item) &&
    isMediaOperationCurrent(
      Number(image.dataset.openCycle),
      Number(image.dataset.itemCollection),
      item,
      attempt,
      Number(image.dataset.retryAuthority),
    )
  ) {
    captureSelectedFullSource(image, item, attempt);
    setImageLoadState(item, "failed");
  }
}

function onPreviewImageError(event: Event, item: MediaGalleryItem) {
  const image = event.currentTarget;
  if (
    isHTMLImageElement(image) &&
    isMediaOperationCurrent(
      Number(image.dataset.openCycle),
      Number(image.dataset.itemCollection),
      item,
    )
  ) {
    previewFailedByItem.value = { ...previewFailedByItem.value, [item.id]: true };
  }
}

function retryImage() {
  const item = activeItem.value;
  if (!item || !shouldMountFull(item)) return;
  const selectedSource = selectedFullSourceByItem.value[item.id];
  if (!selectedSource) return;
  const retrySource = createRetryRequestSource(selectedSource);
  if (!retrySource) return;
  const attempt = imageRetryAttempt(item) + 1;
  imageRetryRequestByItem.value = { ...imageRetryRequestByItem.value, [item.id]: retrySource };
  imageRetryAuthorityByItem.value = {
    ...imageRetryAuthorityByItem.value,
    [item.id]: activeAuthorityGeneration,
  };
  imageRetryAttemptByItem.value = {
    ...imageRetryAttemptByItem.value,
    [item.id]: attempt,
  };
  setImageLoadState(item, "pending");
}

function withoutKey<TValue>(record: Record<string, TValue>, key: string): Record<string, TValue> {
  const remaining = { ...record };
  delete remaining[key];
  return remaining;
}

function setMediaTransformElement(itemId: string, element: Element | null) {
  if (isHTMLElement(element)) mediaTransformElements.set(itemId, element);
  else mediaTransformElements.delete(itemId);
}

function interruptDiscreteTransform() {
  if (mediaTransitionMode.value !== "discrete") return;
  const item = activeItem.value;
  const element = item ? mediaTransformElements.get(item.id) : undefined;
  if (!element) {
    mediaTransitionMode.value = "direct";
    return;
  }
  const view = element.ownerDocument.defaultView;
  const Matrix = view?.DOMMatrixReadOnly;
  if (!Matrix) {
    mediaTransitionMode.value = "direct";
    return;
  }
  let matrix: DOMMatrixReadOnly;
  try {
    matrix = new Matrix(view.getComputedStyle(element).transform);
  } catch {
    mediaTransitionMode.value = "direct";
    return;
  }
  const rendered = canonicalTransform({
    scale: Math.hypot(matrix.a, matrix.b),
    x: matrix.e,
    y: matrix.f,
  });
  element.style.setProperty("--_gallery-pan-x", `${rendered.x.toFixed(3)}px`);
  element.style.setProperty("--_gallery-pan-y", `${rendered.y.toFixed(3)}px`);
  element.style.setProperty("--_gallery-scale", rendered.scale.toFixed(4));
  mediaTransitionMode.value = "direct";
  transform.value = rendered;
}

function beginTrackSettlement(
  destinationIndex?: number,
  announcement = true,
  reason?: ActiveIdRequestDetails["reason"],
  generation = navigationGeneration,
  destinationId?: TId,
) {
  if (!isNavigationCurrent(generation)) return;
  stopTrackFallback();
  pendingTrackDestination = destinationIndex;
  pendingTrackDestinationId = destinationId;
  pendingTrackAnnouncement = announcement;
  pendingTrackReason = reason;
  pendingTrackGeneration = generation;
  trackTransitionEnabled.value = true;
  trackNavigationState.value = "settling";
  if (destinationIndex === undefined) {
    trackOffsetX.value = 0;
  } else {
    const direction = Math.sign(destinationIndex - galleryIndex.value) as -1 | 1;
    trackOffsetX.value = resolveGalleryCommitOffset(direction, geometry.width);
  }
  if (reducedMotion.value) {
    trackTransitionEnabled.value = false;
    void completeTrackSettlement(generation);
    return;
  }
  startTrackFallback(generation);
}

async function completeTrackSettlement(generation = pendingTrackGeneration) {
  if (
    generation === undefined ||
    !isNavigationCurrent(generation) ||
    pendingTrackGeneration !== generation ||
    trackNavigationState.value !== "settling"
  ) {
    return;
  }
  stopTrackFallback();
  const destination = pendingTrackDestination;
  const destinationId = pendingTrackDestinationId;
  const announcement = pendingTrackAnnouncement;
  const reason = pendingTrackReason;
  pendingTrackDestination = undefined;
  pendingTrackDestinationId = undefined;
  pendingTrackAnnouncement = true;
  pendingTrackReason = undefined;

  if (destination === undefined) {
    trackTransitionEnabled.value = false;
    trackNavigationState.value = "idle";
    pendingTrackGeneration = undefined;
    return;
  }
  if (items.value[destination]?.id !== destinationId) {
    invalidateNavigation();
    return;
  }

  trackTransitionEnabled.value = false;
  trackNavigationState.value = "recentering";
  galleryIndex.value = destination;
  trackOffsetX.value = 0;
  trackDestinationIndex.value = undefined;
  mediaTransitionMode.value = "direct";
  resetTransform();
  ensureTrackImageStates();
  await nextTick();
  if (!isNavigationCurrent(generation) || pendingTrackGeneration !== generation) return;
  measureGeometry();
  if (trackFrame !== undefined) cancelAnimationFrame(trackFrame);
  trackFrame = requestAnimationFrame(() => {
    trackFrame = undefined;
    if (!isNavigationCurrent(generation) || pendingTrackGeneration !== generation) return;
    trackNavigationState.value = "idle";
    pendingTrackGeneration = undefined;
    const id = items.value[galleryIndex.value]?.id;
    if (props.activeId !== undefined && id !== props.activeId) {
      const authoritativeId = resolveRollbackId();
      if (authoritativeId !== undefined) synchronizeExact(authoritativeId, false);
      return;
    }
    mechanicalAnchorId.value = id;
    if (id && reason) emit("settled", id, { reason });
    if (announcement) announceCurrent();
  });
}

function onTrackTransitionEnd(event: TransitionEvent) {
  if (event.currentTarget === event.target && event.propertyName === "transform") {
    void completeTrackSettlement(pendingTrackGeneration);
  }
}

async function changeIndex(
  index: number,
  reason: ActiveIdRequestDetails["reason"],
  announcement = true,
): Promise<boolean> {
  const nextIndex = clampIndex(index);
  if (galleryBusy.value) return false;
  if (nextIndex === galleryIndex.value) {
    const id = items.value[nextIndex]?.id;
    if (!id || id === intendedActiveId.value) return false;
    acceptActiveId(id, reason);
    await nextTick();
    if (props.activeId === undefined || props.activeId === id) {
      mechanicalAnchorId.value = id;
      emit("settled", id, { reason });
      if (announcement) announceCurrent();
    } else {
      const authoritativeId = resolveRollbackId();
      if (authoritativeId !== undefined) synchronizeExact(authoritativeId, false);
    }
    return true;
  }
  clearPointerState();
  const generation = beginNavigation();
  const destinationId = items.value[nextIndex]?.id;
  if (!destinationId) return false;
  acceptActiveId(destinationId, reason);
  trackDestinationIndex.value = nextIndex;
  ensureTrackImageStates();
  await nextTick();
  if (
    !isNavigationCurrent(generation) ||
    items.value[nextIndex]?.id !== destinationId ||
    trackDestinationIndex.value !== nextIndex
  ) {
    return false;
  }
  if (trackFrame !== undefined) cancelAnimationFrame(trackFrame);
  trackFrame = requestAnimationFrame(() => {
    trackFrame = undefined;
    if (!isNavigationCurrent(generation) || items.value[nextIndex]?.id !== destinationId) return;
    beginTrackSettlement(nextIndex, announcement, reason, generation, destinationId);
  });
  return true;
}

function previous(): boolean {
  if (!canGoPrevious.value || galleryBusy.value) return false;
  void changeIndex(galleryIndex.value - 1, "previous");
  return true;
}

function next(): boolean {
  if (!canGoNext.value || galleryBusy.value) return false;
  void changeIndex(galleryIndex.value + 1, "next");
  return true;
}

function navigateTo(id: TId): boolean {
  const index = items.value.findIndex((item) => item.id === id);
  if (
    index < 0 ||
    galleryBusy.value ||
    (index === galleryIndex.value && id === intendedActiveId.value)
  ) {
    return false;
  }
  void changeIndex(index, "programmatic");
  return true;
}

/** Exact authoritative adoption: cancels interaction, emits no change, and never announces. */
function synchronizeExact(id: TId, reportSettlement = true): boolean {
  const index = items.value.findIndex((item) => item.id === id);
  if (index < 0) return false;
  mechanicalAnchorId.value = id;
  if (id === props.activeId) latestValidAuthorityId.value = id;
  intendedActiveId.value = id;
  invalidateNavigation();
  clearPointerState();
  galleryIndex.value = index;
  resetTransform();
  ensureTrackImageStates();
  if (reportSettlement && dialog.value?.open) emit("settled", id, { reason: "external" });
  return true;
}

function synchronizeTo(id: TId): boolean {
  if (props.activeId !== undefined && id !== props.activeId) return false;
  if (props.activeId === undefined) internalActiveId.value = id;
  return synchronizeExact(id);
}

function pointerDistance(first: PointerSample, second: PointerSample): number {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function pointerCenter(first: PointerSample, second: PointerSample): MediaPoint {
  return localPoint((first.x + second.x) / 2, (first.y + second.y) / 2);
}

function startPinch() {
  const pair = [...activePointers.values()].slice(0, 2);
  const first = pair[0];
  const second = pair[1];
  if (!first || !second) return;
  pinch = {
    initialCenter: pointerCenter(first, second),
    initialDistance: pointerDistance(first, second),
    initialTransform: { ...transform.value },
    pointerIds: [first.id, second.id],
  };
  setMediaTransition("pinch");
  trackOffsetX.value = 0;
}

function updatePinch() {
  if (!pinch) return;
  const first = activePointers.get(pinch.pointerIds[0]);
  const second = activePointers.get(pinch.pointerIds[1]);
  if (!first || !second) {
    pinch = undefined;
    return;
  }
  commitTransform(
    resolvePinchTransform({
      context: activeContext(),
      currentCenter: pointerCenter(first, second),
      currentDistance: pointerDistance(first, second),
      initialCenter: pinch.initialCenter,
      initialDistance: pinch.initialDistance,
      initialTransform: pinch.initialTransform,
    }),
  );
}

function safeReleasePointer(pointerId: number) {
  const target = imageViewport.value;
  if (!target?.hasPointerCapture?.(pointerId)) return;
  try {
    target.releasePointerCapture(pointerId);
  } catch {
    // The browser may have released capture during cancellation.
  }
}

function clearPointerState() {
  const pointerIds = [...activePointers.keys()];
  activePointers.clear();
  gesture = undefined;
  pinch = undefined;
  pointerCount.value = 0;
  pointerMode.value = "idle";
  for (const pointerId of pointerIds) safeReleasePointer(pointerId);
}

function onImagePointerDown(event: PointerEvent) {
  if (
    dialogState.value !== "open" ||
    galleryBusy.value ||
    (isElement(event.target) && event.target.closest("button")) ||
    (event.pointerType === "mouse" && event.button !== 0)
  ) {
    return;
  }
  interruptDiscreteTransform();
  measureGeometry();
  const sample: PointerSample = {
    id: event.pointerId,
    pointerType: event.pointerType,
    x: event.clientX,
    y: event.clientY,
  };
  activePointers.set(event.pointerId, sample);
  pointerCount.value = activePointers.size;
  try {
    imageViewport.value?.setPointerCapture(event.pointerId);
  } catch {
    // Global listeners still provide deterministic cleanup when capture is unavailable.
  }

  if (!gesture) {
    gesture = {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      startPan: { x: transform.value.x, y: transform.value.y },
      startScale: transform.value.scale,
      startTime: event.timeStamp,
      startX: event.clientX,
      startY: event.clientY,
      cancelled: false,
      involvedMultiplePointers: false,
      mode: isZoomed.value ? "pan" : "pending",
    };
  } else {
    gesture.involvedMultiplePointers = true;
  }

  if (activePointers.size >= 2) {
    if (gesture) gesture.involvedMultiplePointers = true;
    pointerMode.value = "pan";
    startPinch();
  } else {
    pointerMode.value = gesture?.mode ?? "idle";
  }
  event.preventDefault();
}

function onWindowPointerMove(event: PointerEvent) {
  const sample = activePointers.get(event.pointerId);
  if (!sample) return;
  sample.x = event.clientX;
  sample.y = event.clientY;
  if (pinch) {
    updatePinch();
    event.preventDefault();
    return;
  }
  if (!gesture || event.pointerId !== gesture.pointerId || gesture.involvedMultiplePointers) {
    return;
  }

  const deltaX = event.clientX - gesture.startX;
  const deltaY = event.clientY - gesture.startY;
  if (gesture.startScale > 1.001) {
    gesture.mode = "pan";
    pointerMode.value = "pan";
    setMediaTransition("pan");
    commitTransform(
      panMediaTransform(
        {
          scale: gesture.startScale,
          x: gesture.startPan.x,
          y: gesture.startPan.y,
        },
        { x: deltaX, y: deltaY },
        activeContext(),
      ),
    );
  } else {
    const horizontal = Math.abs(deltaX);
    const vertical = Math.abs(deltaY);
    if (
      gesture.mode === "pending" &&
      Math.max(horizontal, vertical) >= MEDIA_GALLERY_TUNING.swipeThreshold
    ) {
      gesture.mode =
        horizontal >= vertical * MEDIA_GALLERY_TUNING.horizontalIntentRatio
          ? "swipe"
          : vertical >= horizontal * MEDIA_GALLERY_TUNING.horizontalIntentRatio
            ? "blocked"
            : "pending";
      pointerMode.value = gesture.mode;
    }
    if (gesture.mode === "swipe") {
      setMediaTransition("swipe");
      trackOffsetX.value = resolveGalleryTrackOffset(
        deltaX,
        geometry.width,
        galleryIndex.value,
        items.value.length,
      );
    }
  }
  event.preventDefault();
}

function handleTouchTap(event: PointerEvent) {
  if (event.pointerType !== "touch" && event.pointerType !== "pen") return;
  const currentTap = { time: event.timeStamp, x: event.clientX, y: event.clientY };
  if (isRepeatedGalleryTap(previousTap, currentTap)) {
    previousTap = undefined;
    zoomTo(
      isZoomed.value ? 1 : MEDIA_GALLERY_TUNING.doubleTapScale,
      localPoint(event.clientX, event.clientY),
      "double-tap",
    );
  } else {
    previousTap = currentTap;
  }
}

function onWindowPointerUp(event: PointerEvent) {
  const sample = activePointers.get(event.pointerId);
  if (!sample) return;
  activePointers.delete(event.pointerId);
  pointerCount.value = activePointers.size;
  safeReleasePointer(event.pointerId);

  if (!gesture) return;
  if (pinch || gesture.involvedMultiplePointers) {
    if (activePointers.size < 2) pinch = undefined;
    if (activePointers.size === 0) {
      gesture = undefined;
      pointerMode.value = "idle";
      trackOffsetX.value = 0;
    }
    return;
  }
  if (event.pointerId !== gesture.pointerId) return;

  const deltaX = event.clientX - gesture.startX;
  const deltaY = event.clientY - gesture.startY;
  const direction = resolveGallerySwipe({
    cancelled: gesture.cancelled,
    deltaX,
    deltaY,
    elapsedMs: event.timeStamp - gesture.startTime,
    index: galleryIndex.value,
    itemCount: items.value.length,
    scale: gesture.startScale,
    viewportWidth: geometry.width,
  });
  const wasTap = Math.hypot(deltaX, deltaY) < MEDIA_GALLERY_TUNING.swipeThreshold;
  if (direction !== 0) {
    const destination = galleryIndex.value + direction;
    const generation = beginNavigation(true);
    const destinationId = items.value[destination]?.id;
    if (!destinationId) return;
    acceptActiveId(destinationId, "drag");
    trackDestinationIndex.value = destination;
    ensureTrackImageStates();
    beginTrackSettlement(destination, true, "drag", generation, destinationId);
  } else {
    if (Math.abs(trackOffsetX.value) > 0.01) {
      const generation = beginNavigation(true);
      beginTrackSettlement(undefined, true, undefined, generation);
    }
    if (wasTap) handleTouchTap(event);
  }
  gesture = undefined;
  pointerMode.value = "idle";
}

function onWindowPointerCancel(event: PointerEvent) {
  if (!activePointers.has(event.pointerId)) return;
  activePointers.delete(event.pointerId);
  safeReleasePointer(event.pointerId);
  if (gesture) gesture.cancelled = true;
  clearPointerState();
  const generation = beginNavigation(true);
  beginTrackSettlement(undefined, true, undefined, generation);
}

function onLostPointerCapture(event: PointerEvent) {
  if (!activePointers.has(event.pointerId)) return;
  onWindowPointerCancel(event);
}

function onDoubleClick(event: MouseEvent) {
  if (event.button !== 0) return;
  event.preventDefault();
  zoomTo(
    isZoomed.value ? 1 : MEDIA_GALLERY_TUNING.doubleTapScale,
    localPoint(event.clientX, event.clientY),
    "double-click",
  );
}

function onDialogKeyDown(event: KeyboardEvent) {
  maintainModalTabOrder(event, dialog.value);
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.key === "Escape" || event.key === "Tab") return;

  let handled = true;
  if (event.key === "ArrowLeft") {
    void changeIndex(galleryIndex.value - 1, "keyboard");
  } else if (event.key === "ArrowRight") {
    void changeIndex(galleryIndex.value + 1, "keyboard");
  } else if (event.key === "Home") {
    void changeIndex(0, "keyboard");
  } else if (event.key === "End") {
    void changeIndex(items.value.length - 1, "keyboard");
  } else if (event.key === "+" || event.key === "=") {
    zoomIn("keyboard");
  } else if (event.key === "-") {
    zoomOut("keyboard");
  } else if (event.key === "0") {
    resetToFit("keyboard");
  } else {
    handled = false;
  }

  if (handled) {
    event.preventDefault();
    event.stopPropagation();
  }
}

function lockDocumentScroll() {
  const root = documentElement.value;
  if (!root || lockedRoot) return;
  lockedRoot = root;
  previousPaddingInlineEnd = root.style.paddingInlineEnd;
  const view = root.ownerDocument.defaultView;
  const scrollbarWidth = Math.max(0, (view?.innerWidth ?? root.clientWidth) - root.clientWidth);
  if (scrollbarWidth > 0) {
    const currentPadding = Number.parseFloat(view?.getComputedStyle(root).paddingInlineEnd ?? "0");
    root.style.paddingInlineEnd = `${currentPadding + scrollbarWidth}px`;
  }
  scrollLocked.value = true;
}

function unlockDocumentScroll() {
  scrollLocked.value = false;
  if (lockedRoot) {
    lockedRoot.style.paddingInlineEnd = previousPaddingInlineEnd;
  }
  lockedRoot = undefined;
  previousPaddingInlineEnd = "";
}

function captureLifecycleOpener(target: HTMLDialogElement, generation: number) {
  if (capturedOpenerGeneration === generation) return;
  capturedOpenerGeneration = generation;
  const explicitOpener = props.focusReturn?.opener;
  if (explicitOpener) {
    capturedOpener = explicitOpener;
    capturedOpenerWasExplicit = true;
    return;
  }
  capturedOpenerWasExplicit = false;
  const activeElement = captureFocusOpener(target.ownerDocument);
  if (activeElement && !target.contains(activeElement)) {
    capturedOpener = activeElement;
  }
}

function emitCloseRequest(reason: CloseReason) {
  emit("update:open", false);
  emit("openRequest", false, { activeId: semanticActiveId.value, reason });
}

async function openDialog(lifecycle: number) {
  const target = dialog.value;
  if (!mounted.value || !props.open || lifecycle !== lifecycleGeneration || !target) return;
  if (target.open && dialogState.value === "open" && openedLifecycleGeneration === lifecycle) {
    return;
  }
  focusRestoreVerification?.cancel();
  focusRestoreVerification = undefined;
  const generation = invalidateOpenCycle();
  activeAuthorityGeneration += 1;
  resetMediaSourceState();
  invalidateNavigation();
  invalidateClose();
  closingLifecycleGeneration = undefined;
  captureLifecycleOpener(target, lifecycle);
  if (items.value.length === 0) {
    emitCloseRequest("programmatic");
    return;
  }
  const requestedIndex = items.value.findIndex((item) => item.id === intendedActiveId.value);
  galleryIndex.value = requestedIndex < 0 ? 0 : requestedIndex;
  trackDestinationIndex.value = undefined;
  trackOffsetX.value = 0;
  trackTransitionEnabled.value = false;
  trackNavigationState.value = "idle";
  mediaTransitionMode.value = "direct";
  resetTransform();
  dialogState.value = "opening";
  if (!target.open) target.showModal();
  lockDocumentScroll();
  for (const slot of trackSlots.value) ensureImageState(slot.item, true);
  await nextTick();
  if (!isOpenCycleCurrent(generation, target)) return;
  measureGeometry();
  focusInitial(props.initialFocus, {
    close: closeButton.value,
    container: shell.value,
    title: titleHeading.value,
  });
  if (!isOpenCycleCurrent(generation, target)) return;
  announceCurrent();
  if (openedLifecycleGeneration !== lifecycle) {
    openedLifecycleGeneration = lifecycle;
    emit("opened", semanticActiveId.value);
  }
  if (!isOpenCycleCurrent(generation, target)) return;

  if (reducedMotion.value) {
    dialogState.value = "open";
    return;
  }
  target.getBoundingClientRect();
  cancelOpeningWork();
  openingFrame = requestAnimationFrame(() => {
    openingFrame = undefined;
    if (!isOpenCycleCurrent(generation, target)) return;
    dialogState.value = "open";
  });
}

function beginOpenLifecycle() {
  cancelPendingCloseHandoffs();
  lifecycleGeneration += 1;
  void openDialog(lifecycleGeneration);
}

function requestClose(reason: CloseReason = "programmatic") {
  if (!props.open || !dialog.value?.open) return;
  emitCloseRequest(reason);
}

function onCancel(event: Event) {
  event.preventDefault();
  requestClose("escape");
}

function startClose() {
  if (!dialog.value?.open || dialogState.value === "closing") return;
  closingLifecycleGeneration = lifecycleGeneration;
  invalidateOpenCycle();
  invalidateNavigation();
  const generation = invalidateClose();
  clearPointerState();
  resetTransform();
  dialogState.value = "closing";
  if (reducedMotion.value) {
    finishClose(generation);
  } else {
    startCloseFallback(generation);
  }
}

function finishClose(generation = closeGeneration) {
  const lifecycle = closingLifecycleGeneration;
  if (
    !mounted.value ||
    generation !== closeGeneration ||
    lifecycle === undefined ||
    lifecycle !== lifecycleGeneration ||
    props.open ||
    dialogState.value !== "closing" ||
    !dialog.value?.open
  ) {
    return;
  }
  stopCloseFallback();
  closingLifecycleGeneration = undefined;
  nativeCloseLifecycles.push({
    focusHandoff: observeFocusHandoffFromOpener(explicitOpenerForCurrentLifecycle()),
    generation: lifecycle,
  });
  dialog.value.close();
}

function onShellTransitionEnd(event: TransitionEvent) {
  if (
    dialogState.value === "closing" &&
    event.currentTarget === event.target &&
    event.propertyName === "opacity"
  ) {
    finishClose(closeGeneration);
  }
}

async function onClose() {
  const nativeCloseLifecycle = nativeCloseLifecycles.shift();
  const closeLifecycle = nativeCloseLifecycle?.generation;
  const initialTransferredOwner = nativeCloseLifecycle?.focusHandoff.consume();
  if (dialog.value?.open) return;
  if (closeLifecycle !== undefined && closeLifecycle !== lifecycleGeneration) return;
  if (!mounted.value) return;
  // A reduced or very short close can beat Vue's parent-to-child prop flush. The same flush also
  // re-enables an opener disabled while the modal is present, so focus restoration waits for it.
  await nextTick();
  if (props.open && closeLifecycle === undefined) {
    emitCloseRequest("programmatic");
    await nextTick();
  }
  if (props.open) {
    await openDialog(lifecycleGeneration);
    return;
  }
  if (finalizedLifecycleGeneration === lifecycleGeneration) return;
  finalizedLifecycleGeneration = lifecycleGeneration;
  invalidateOpenCycle();
  invalidateNavigation();
  invalidateClose();
  clearPointerState();
  dialogState.value = "closed";
  mediaTransitionMode.value = "direct";
  resetTransform();
  unlockDocumentScroll();
  const opener = capturedOpener ?? props.focusReturn?.opener;
  const explicitOpener = capturedOpener ? capturedOpenerWasExplicit : opener !== undefined;
  const focusGeneration = lifecycleGeneration;
  capturedOpener = undefined;
  capturedOpenerWasExplicit = false;
  focusRestoreVerification = scheduleVerifiedFocusRestore({
    explicitOpener,
    fallback: props.focusReturn?.fallback,
    initialTransferredOwner,
    isCurrent: () => mounted.value && !props.open && focusGeneration === lifecycleGeneration,
    opener,
  });
  emit("closed", semanticActiveId.value);
}

function onBackdropPointerDown(event: PointerEvent) {
  backdropPointerId = event.target === dialog.value ? event.pointerId : undefined;
}

function onBackdropPointerUp(event: PointerEvent) {
  const closes =
    backdropPointerId === event.pointerId &&
    event.target === dialog.value &&
    activePointers.size === 0 &&
    gesture === undefined &&
    pinch === undefined;
  backdropPointerId = undefined;
  if (closes) requestClose("scrim");
}

function onReducedMotionChange(event: MediaQueryListEvent) {
  if (mounted.value) systemReducedMotion.value = event.matches;
}

useEventListener("pointermove", onWindowPointerMove, { passive: false });
useEventListener("pointerup", onWindowPointerUp);
useEventListener("pointercancel", onWindowPointerCancel);
useEventListener("blur", clearPointerState);
useEventListener(imageViewport, "lostpointercapture", onLostPointerCapture);
useEventListener(reducedMotionQuery, "change", onReducedMotionChange);
useResizeObserver(imageViewport, measureGeometry);

onMounted(() => {
  mounted.value = true;
  const ownerWindow = dialog.value?.ownerDocument.defaultView;
  if (typeof ownerWindow?.matchMedia === "function") {
    reducedMotionQuery.value = ownerWindow.matchMedia("(prefers-reduced-motion: reduce)");
    systemReducedMotion.value = reducedMotionQuery.value.matches;
  }
  if (props.open) beginOpenLifecycle();
});

watch(
  () => props.open,
  (open) => {
    if (open) beginOpenLifecycle();
    else {
      startClose();
    }
  },
);

watch(
  () => props.activeId,
  (id, previousId) => {
    // A host confirming the stable ID emitted by this navigation is acknowledgement, not an
    // external takeover. Keep the transition and its provenance intact.
    if (id === undefined) {
      const releasedId = resolveRollbackId() ?? intendedActiveId.value ?? activeItem.value?.id;
      internalActiveId.value = releasedId;
      if (previousId !== undefined && releasedId !== intendedActiveId.value && releasedId) {
        synchronizeExact(releasedId, false);
      }
      if (previousId !== undefined) {
        // The released authority seeds the uncontrolled identity, then its ownership epoch ends.
        latestValidAuthorityId.value = undefined;
      }
      return;
    }
    const index = items.value.findIndex((item) => item.id === id);
    if (index < 0) {
      const fallbackId = resolveRollbackId();
      if (fallbackId !== undefined) {
        // An accepted uncontrolled identity is already committed semantic state even when its
        // track transition has not settled. Preserve it as this unavailable epoch's mechanics.
        synchronizeExact(fallbackId, false);
        return;
      }
      invalidateNavigation();
      clearPointerState();
      intendedActiveId.value = undefined;
      mechanicalAnchorId.value = undefined;
      return;
    }
    latestValidAuthorityId.value = id;
    mechanicalAnchorId.value = id;
    if (id !== intendedActiveId.value) synchronizeExact(id);
  },
  { flush: "sync", immediate: true },
);

watch(
  () => activeItem.value?.id,
  (id, previousId) => {
    if (id === previousId) return;
    activeAuthorityGeneration += 1;
    if (!id) return;

    const item = items.value.find((candidate) => candidate.id === id);
    if (!item || !selectedFullSourceByItem.value[id]) return;
    clearItemRetry(id);
    setImageLoadState(item, imageLoadDefault(item));
  },
  { flush: "sync" },
);

watch(items, (nextItems, previousItems) => {
  itemCollectionGeneration.value += 1;
  activeAuthorityGeneration += 1;
  const collectionGeneration = itemCollectionGeneration.value;
  const openGeneration = openCycleGeneration.value;
  const navigation = invalidateNavigation();
  const previousId = previousItems[galleryIndex.value]?.id;
  const previousSemanticId = semanticActiveId.value;
  const nextIds = new Set(nextItems.map((item) => item.id));
  resetMediaSourceState();
  for (const id of mediaTransformElements.keys()) {
    if (!nextIds.has(id)) mediaTransformElements.delete(id);
  }

  if (nextItems.length === 0) {
    if (props.activeId === undefined && previousSemanticId !== undefined) {
      acceptActiveId(undefined, "reconcile");
    }
    if (props.open) {
      invalidateOpenCycle();
      emitCloseRequest("programmatic");
    }
    galleryIndex.value = 0;
    return;
  }

  const controlledIndex =
    props.activeId === undefined
      ? -1
      : nextItems.findIndex((candidate) => candidate.id === props.activeId);
  const semanticIndex =
    intendedActiveId.value === undefined
      ? -1
      : nextItems.findIndex((candidate) => candidate.id === intendedActiveId.value);
  if (controlledIndex >= 0) {
    intendedActiveId.value = props.activeId;
    latestValidAuthorityId.value = props.activeId;
    mechanicalAnchorId.value = props.activeId;
    galleryIndex.value = controlledIndex;
  } else if (semanticIndex >= 0) {
    galleryIndex.value = semanticIndex;
    if (props.activeId !== undefined) mechanicalAnchorId.value = intendedActiveId.value;
  } else {
    galleryIndex.value = resolvePreservedGalleryIndex(previousId, galleryIndex.value, nextItems);
    const fallbackId = nextItems[galleryIndex.value]?.id;
    if (props.activeId === undefined) acceptActiveId(fallbackId, "reconcile");
    else {
      intendedActiveId.value = fallbackId;
      mechanicalAnchorId.value = fallbackId;
    }
  }
  resetTransform();
  ensureTrackImageStates();
  void (async () => {
    await nextTick();
    if (
      mounted.value &&
      collectionGeneration === itemCollectionGeneration.value &&
      openGeneration === openCycleGeneration.value &&
      navigation === navigationGeneration
    ) {
      if (props.open && !dialog.value?.open) void openDialog(lifecycleGeneration);
      else measureGeometry();
    }
  })();
});

onBeforeUnmount(() => {
  mounted.value = false;
  lifecycleGeneration += 1;
  clearPendingCloseHandoffs();
  invalidateOpenCycle();
  invalidateNavigation();
  invalidateClose();
  clearPointerState();
  unlockDocumentScroll();
  mediaTransformElements.clear();
  if (dialog.value?.open) dialog.value.close();
  focusRestoreVerification?.cancel();
  focusRestoreVerification = undefined;
  restoreFocus({
    fallback: props.focusReturn?.fallback,
    opener: capturedOpener ?? props.focusReturn?.opener,
  });
});

defineExpose({
  dialog,
  activeId: semanticActiveId,
  settledId,
  navigateTo,
  next,
  previous,
  resetToFit: resetToFitPublic,
  requestClose,
  synchronizeTo,
});
</script>

<template>
  <dialog
    ref="dialog"
    :aria-describedby="descriptionId"
    :aria-labelledby="titleId"
    class="snap-motion-media-gallery"
    data-testid="snap-motion-media-gallery"
    :data-dialog-state="dialogState"
    :data-active-id="semanticActiveId"
    :data-gallery-index="galleryIndex"
    :data-settled-id="settledId"
    :data-image-state="activeImageLoadState"
    :data-preload-policy="preloadPolicy"
    :data-pan-x="transform.x.toFixed(3)"
    :data-pan-y="transform.y.toFixed(3)"
    :data-reduced-motion="reducedMotion ? 'true' : 'false'"
    :data-scale="transform.scale.toFixed(4)"
    :data-track-state="trackNavigationState"
    @cancel="onCancel"
    @close="onClose"
    @keydown="onDialogKeyDown"
    @pointerdown="onBackdropPointerDown"
    @pointerup="onBackdropPointerUp"
  >
    <section
      ref="shell"
      class="snap-motion-media-gallery-shell"
      data-testid="snap-motion-media-gallery-shell"
      @transitionend="onShellTransitionEnd"
    >
      <header class="snap-motion-media-gallery-header" :class="{ 'has-actions': slots.actions }">
        <div>
          <p v-if="eyebrow" class="snap-motion-media-gallery-eyebrow">{{ eyebrow }}</p>
          <h2 :id="titleId" ref="titleHeading" tabindex="-1">{{ title }}</h2>
        </div>
        <div class="snap-motion-media-gallery-identity" aria-live="off">
          <div class="snap-motion-media-gallery-item-heading">
            <strong data-testid="snap-motion-media-gallery-title">{{ activeItem?.title }}</strong>
            <span class="tabular" data-testid="snap-motion-media-gallery-position">
              {{ galleryPosition }}
            </span>
          </div>
          <p
            v-if="activeItem?.description"
            class="snap-motion-media-gallery-description"
            data-testid="snap-motion-media-gallery-description"
          >
            {{ activeItem.description }}
          </p>
        </div>
        <div class="snap-motion-media-gallery-header-actions">
          <div
            v-if="slots.actions"
            class="snap-motion-media-gallery-actions"
            data-testid="snap-motion-media-gallery-actions"
          >
            <slot name="actions" />
          </div>
          <button
            ref="closeButton"
            :aria-label="messages.closeGallery"
            class="snap-motion-media-gallery-control snap-motion-media-gallery-close"
            data-testid="snap-motion-media-gallery-close"
            type="button"
            @click="requestClose('close-button')"
          >
            <svg aria-hidden="true" height="20" viewBox="0 0 24 24" width="20">
              <path
                d="M5 5l14 14M19 5 5 19"
                fill="none"
                stroke="currentColor"
                stroke-linecap="square"
                stroke-width="2"
              />
            </svg>
          </button>
        </div>
      </header>

      <div class="snap-motion-media-gallery-workspace">
        <button
          :aria-disabled="!canNavigatePrevious"
          :aria-label="previousLabel"
          class="snap-motion-media-gallery-control snap-motion-media-gallery-previous"
          data-testid="snap-motion-media-gallery-previous"
          :disabled="!canNavigatePrevious && !previousFocused"
          type="button"
          @blur="previousFocused = false"
          @click="previous"
          @focus="previousFocused = true"
        >
          <svg aria-hidden="true" height="24" viewBox="0 0 24 24" width="24">
            <path d="m15 5-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" />
          </svg>
        </button>

        <div
          ref="imageViewport"
          :aria-busy="activeImageLoadState === 'pending'"
          class="snap-motion-media-gallery-viewport"
          data-testid="snap-motion-media-gallery-viewport"
          :data-pointer-mode="pointerMode"
          :data-track-state="trackNavigationState"
          @dblclick="onDoubleClick"
          @pointerdown="onImagePointerDown"
        >
          <div
            class="snap-motion-media-gallery-track"
            :class="{ transitioning: trackTransitionEnabled }"
            :style="trackStyle"
            data-testid="snap-motion-media-gallery-track"
            @transitionend="onTrackTransitionEnd"
          >
            <div
              v-for="slot in trackSlots"
              :key="slot.item?.id"
              :aria-hidden="slot.item?.id === activeItem?.id ? undefined : 'true'"
              class="snap-motion-media-gallery-slot"
              :data-item-id="slot.item?.id"
              :data-slot-position="slot.position"
              :style="{ '--_gallery-slot-position': slot.position }"
            >
              <div
                v-if="slot.item"
                :ref="
                  (element) => setMediaTransformElement(slot.item!.id, element as Element | null)
                "
                class="snap-motion-media-gallery-transform"
                :class="{
                  manipulating: pointerCount > 0 && slot.item.id === activeItem?.id,
                  transitioning:
                    mediaTransitionMode === 'discrete' && slot.item.id === activeItem?.id,
                }"
                :style="slot.item.id === activeItem?.id ? transformStyle : undefined"
              >
                <img
                  v-if="open"
                  class="snap-motion-media-gallery-media snap-motion-media-gallery-preview"
                  :class="{
                    concealed: shouldMountFull(slot.item) && imageLoadState(slot.item) === 'loaded',
                  }"
                  :sizes="slot.item.preview.sizes"
                  :srcset="slot.item.preview.srcset"
                  :src="slot.item.preview.src"
                  :alt="
                    slot.item.id === activeItem?.id &&
                    (!shouldMountFull(slot.item) || imageLoadState(slot.item) !== 'loaded')
                      ? slot.item.alt
                      : ''
                  "
                  :aria-hidden="
                    slot.item.id !== activeItem?.id ||
                    (shouldMountFull(slot.item) && imageLoadState(slot.item) === 'loaded')
                      ? 'true'
                      : undefined
                  "
                  :data-item-collection="itemCollectionGeneration"
                  :data-open-cycle="openCycleGeneration"
                  decoding="async"
                  draggable="false"
                  :height="slot.item.preview.height"
                  :width="slot.item.preview.width"
                  @error="onPreviewImageError($event, slot.item)"
                />
                <img
                  v-if="
                    open && shouldMountFull(slot.item) && imageLoadState(slot.item) !== 'failed'
                  "
                  :key="`${openCycleGeneration}-${itemCollectionGeneration}-${slot.item.id}-${imageRetryAttempt(slot.item)}`"
                  class="snap-motion-media-gallery-media snap-motion-media-gallery-full"
                  :class="{ revealed: imageLoadState(slot.item) === 'loaded' }"
                  :data-item-collection="itemCollectionGeneration"
                  :data-open-cycle="openCycleGeneration"
                  :data-retry-attempt="imageRetryAttempt(slot.item)"
                  :data-retry-authority="imageRetryAuthorityByItem[slot.item.id] ?? 0"
                  :sizes="slot.item.full.sizes"
                  :srcset="visibleFullSrcset(slot.item)"
                  :src="visibleFullSrc(slot.item)"
                  :alt="
                    slot.item.id === activeItem?.id && imageLoadState(slot.item) === 'loaded'
                      ? slot.item.alt
                      : ''
                  "
                  :aria-hidden="
                    slot.item.id === activeItem?.id && imageLoadState(slot.item) === 'loaded'
                      ? undefined
                      : 'true'
                  "
                  decoding="async"
                  draggable="false"
                  :fetchpriority="slot.item.id === activeItem?.id ? 'high' : 'low'"
                  :height="slot.item.full.height"
                  :width="slot.item.full.width"
                  @error="onFullImageError($event, slot.item)"
                  @load="onFullImageLoad($event, slot.item)"
                />
              </div>
            </div>
          </div>
        </div>

        <button
          :aria-disabled="!canNavigateNext"
          :aria-label="nextLabel"
          class="snap-motion-media-gallery-control snap-motion-media-gallery-next"
          data-testid="snap-motion-media-gallery-next"
          :disabled="!canNavigateNext && !nextFocused"
          type="button"
          @blur="nextFocused = false"
          @click="next"
          @focus="nextFocused = true"
        >
          <svg aria-hidden="true" height="24" viewBox="0 0 24 24" width="24">
            <path d="m9 5 7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" />
          </svg>
        </button>
      </div>

      <footer class="snap-motion-media-gallery-footer">
        <div class="snap-motion-media-gallery-zoom-readout">
          <span>{{ messages.zoomLabel }}</span>
          <strong class="tabular" data-testid="snap-motion-media-gallery-zoom">
            {{ scalePercentage }}%
          </strong>
        </div>
        <div class="snap-motion-media-gallery-status" role="status">
          <span
            v-if="previewFailedByItem[activeItem?.id ?? ''] && activeImageLoadState !== 'loaded'"
            data-testid="snap-motion-media-gallery-preview-error"
          >
            {{ messages.previewUnavailable }}
          </span>
          <span
            v-else-if="activeImageLoadState === 'pending'"
            data-testid="snap-motion-media-gallery-loading"
          >
            {{ messages.loadingFullImage }}
          </span>
          <template v-else-if="activeImageLoadState === 'failed'">
            <span data-testid="snap-motion-media-gallery-error">
              {{ messages.fullImageUnavailable }} {{ messages.previewFallback }}
            </span>
            <button type="button" :disabled="!canRetryActiveImage" @click="retryImage">
              {{ messages.retry }}
            </button>
          </template>
        </div>
        <div
          class="snap-motion-media-gallery-zoom-controls"
          :aria-label="messages.zoomControls"
          role="group"
        >
          <button
            :aria-disabled="!canZoomOut"
            :aria-label="messages.zoomOut"
            data-testid="snap-motion-media-gallery-zoom-out"
            :disabled="!canZoomOut && !zoomOutFocused"
            type="button"
            @blur="zoomOutFocused = false"
            @click="zoomOut()"
            @focus="zoomOutFocused = true"
          >
            <svg aria-hidden="true" height="20" viewBox="0 0 24 24" width="20">
              <path d="M5 12h14" fill="none" stroke="currentColor" stroke-width="2" />
            </svg>
          </button>
          <button
            :aria-disabled="!canZoomIn"
            :aria-label="messages.zoomIn"
            data-testid="snap-motion-media-gallery-zoom-in"
            :disabled="!canZoomIn && !zoomInFocused"
            type="button"
            @blur="zoomInFocused = false"
            @click="zoomIn()"
            @focus="zoomInFocused = true"
          >
            <svg aria-hidden="true" height="20" viewBox="0 0 24 24" width="20">
              <path d="M5 12h14M12 5v14" fill="none" stroke="currentColor" stroke-width="2" />
            </svg>
          </button>
          <button
            :aria-disabled="!canZoomOut"
            :aria-label="messages.fit"
            data-testid="snap-motion-media-gallery-reset"
            :disabled="!canZoomOut && !resetFocused"
            type="button"
            @blur="resetFocused = false"
            @click="resetToFit()"
            @focus="resetFocused = true"
          >
            {{ messages.fit }}
          </button>
        </div>
        <p>{{ messages.gestureInstructions }}</p>
      </footer>

      <p
        class="snap-motion-media-gallery-live"
        aria-atomic="true"
        data-testid="snap-motion-media-gallery-status"
        role="status"
      >
        {{ liveMessage }}
      </p>
    </section>
  </dialog>
</template>
