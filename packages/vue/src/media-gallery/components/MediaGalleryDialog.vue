<script setup lang="ts">
import { useEventListener, useResizeObserver, useScrollLock, useTimeoutFn } from "@vueuse/core";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, useId, watch } from "vue";

import {
  captureFocusOpener,
  focusInitial,
  maintainModalTabOrder,
  restoreFocus,
} from "../../internal/accessibility/focus";
import {
  fittedMediaTransform,
  type GalleryMediaAction,
  type GalleryTap,
  type MediaGalleryCloseReason,
  type MediaGalleryDialogProps,
  type MediaGalleryItem,
  type MediaGalleryNavigationReason,
  type MediaPoint,
  type MediaTransform,
  type MediaTransformContext,
} from "../media-gallery-contracts";
import {
  canonicalMediaGalleryTransform,
  clampGalleryIndex,
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

const props = withDefaults(defineProps<MediaGalleryDialogProps>(), {
  eyebrow: "Media",
  initialFocus: "close",
  initialIndex: 0,
  reducedMotionOverride: undefined,
  title: "Gallery",
});

const emit = defineEmits<{
  (event: "update:open", open: boolean): void;
  (event: "requestClose", finalIndex: number, reason: MediaGalleryCloseReason): void;
  (event: "opened", index: number): void;
  (event: "closed", finalIndex: number): void;
  (event: "indexChanged", index: number, reason: MediaGalleryNavigationReason): void;
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
const galleryIndex = ref(clampIndex(props.initialIndex));
const dialogState = ref<DialogState>("closed");
const imageLoadStateByItem = ref<Record<string, ImageLoadState>>({});
const imageRetryAttemptByItem = ref<Record<string, number>>({});
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
let closeRequested = false;
let pendingTrackDestination: number | undefined;
let pendingTrackDestinationId: string | undefined;
let pendingTrackAnnouncement = true;
let pendingTrackReason: MediaGalleryNavigationReason | undefined;
let pendingTrackGeneration: number | undefined;
let navigationGeneration = 0;
let closeGeneration = 0;
let capturedOpener: HTMLElement | undefined;
let geometry = {
  height: 0,
  left: 0,
  top: 0,
  width: 0,
};

const activeItem = computed(() => items.value[galleryIndex.value] ?? items.value[0]);
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
const activeAspectRatio = computed(() => {
  const item = activeItem.value;
  return item && item.height > 0 ? item.width / item.height : 1;
});
const activeImageLoadState = computed<ImageLoadState>(() => {
  const item = activeItem.value;
  return item ? (imageLoadStateByItem.value[item.id] ?? imageLoadDefault(item)) : "preview";
});
const viewportStyle = computed(() => ({
  "--_gallery-aspect-ratio": String(activeAspectRatio.value),
}));
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
): boolean {
  return (
    mounted.value &&
    props.open &&
    dialog.value?.open === true &&
    openGeneration === openCycleGeneration.value &&
    collectionGeneration === itemCollectionGeneration.value &&
    items.value.some((candidate) => candidate.id === item.id) &&
    (attempt === undefined || attempt === imageRetryAttempt(item))
  );
}

function clampIndex(index: number): number {
  return clampGalleryIndex(index, items.value.length);
}

function activeContext(): MediaTransformContext {
  const item = activeItem.value;
  return {
    intrinsicSize: item ? { height: item.height, width: item.width } : { height: 1, width: 1 },
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
  return item.fullSrc ? "pending" : "preview";
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
  if (!item.fullSrc) return "";
  const attempt = imageRetryAttempt(item);
  if (attempt === 0) return item.fullSrc;
  const separator = item.fullSrc.includes("?") ? "&" : "?";
  return `${item.fullSrc}${separator}retry=${attempt}`;
}

function setImageLoadState(item: MediaGalleryItem, state: ImageLoadState) {
  imageLoadStateByItem.value = { ...imageLoadStateByItem.value, [item.id]: state };
}

async function onFullImageLoad(event: Event, item: MediaGalleryItem) {
  const image = event.currentTarget;
  if (!(image instanceof HTMLImageElement)) {
    return;
  }
  const attempt = Number(image.dataset.retryAttempt);
  const openGeneration = Number(image.dataset.openCycle);
  const collectionGeneration = Number(image.dataset.itemCollection);
  if (!isMediaOperationCurrent(openGeneration, collectionGeneration, item, attempt)) return;
  try {
    await image.decode();
  } catch {
    if (isMediaOperationCurrent(openGeneration, collectionGeneration, item, attempt)) {
      setImageLoadState(item, "failed");
    }
    return;
  }
  if (
    !isMediaOperationCurrent(openGeneration, collectionGeneration, item, attempt) ||
    !image.complete ||
    image.naturalWidth <= 0 ||
    image.naturalHeight <= 0
  ) {
    return;
  }
  setImageLoadState(item, "loaded");
  if (item.id === activeItem.value?.id) {
    await nextTick();
    if (!isMediaOperationCurrent(openGeneration, collectionGeneration, item, attempt)) return;
    measureGeometry();
  }
}

function onFullImageError(event: Event, item: MediaGalleryItem) {
  const image = event.currentTarget;
  if (
    image instanceof HTMLImageElement &&
    isMediaOperationCurrent(
      Number(image.dataset.openCycle),
      Number(image.dataset.itemCollection),
      item,
      Number(image.dataset.retryAttempt),
    )
  ) {
    setImageLoadState(item, "failed");
  }
}

function onPreviewImageError(event: Event, item: MediaGalleryItem) {
  const image = event.currentTarget;
  if (
    image instanceof HTMLImageElement &&
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
  if (!item) return;
  imageRetryAttemptByItem.value = {
    ...imageRetryAttemptByItem.value,
    [item.id]: imageRetryAttempt(item) + 1,
  };
  setImageLoadState(item, "pending");
}

function setMediaTransformElement(itemId: string, element: Element | null) {
  if (element instanceof HTMLElement) mediaTransformElements.set(itemId, element);
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
  reason?: MediaGalleryNavigationReason,
  generation = navigationGeneration,
  destinationId?: string,
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
    if (reason) emit("indexChanged", galleryIndex.value, reason);
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
  reason: MediaGalleryNavigationReason,
  announcement = true,
): Promise<boolean> {
  const nextIndex = clampIndex(index);
  if (nextIndex === galleryIndex.value || galleryBusy.value) return false;
  clearPointerState();
  const generation = beginNavigation();
  const destinationId = items.value[nextIndex]?.id;
  if (!destinationId) return false;
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

function previous() {
  if (canGoPrevious.value) void changeIndex(galleryIndex.value - 1, "previous");
}

function next() {
  if (canGoNext.value) void changeIndex(galleryIndex.value + 1, "next");
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
    (event.target instanceof Element && event.target.closest("button")) ||
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
    trackDestinationIndex.value = destination;
    ensureTrackImageStates();
    beginTrackSettlement(destination, true, "swipe", generation, destinationId);
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
    previous();
  } else if (event.key === "ArrowRight") {
    next();
  } else if (event.key === "Home") {
    void changeIndex(0, "home");
  } else if (event.key === "End") {
    void changeIndex(items.value.length - 1, "end");
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

async function openDialog() {
  const target = dialog.value;
  if (!mounted.value || !target || target.open) return;
  const generation = invalidateOpenCycle();
  invalidateNavigation();
  invalidateClose();
  capturedOpener = props.focusReturn?.opener ?? captureFocusOpener(target.ownerDocument);
  if (items.value.length === 0) {
    requestClose("programmatic");
    return;
  }
  closeRequested = false;
  galleryIndex.value = clampIndex(props.initialIndex);
  trackDestinationIndex.value = undefined;
  trackOffsetX.value = 0;
  trackTransitionEnabled.value = false;
  trackNavigationState.value = "idle";
  mediaTransitionMode.value = "direct";
  resetTransform();
  dialogState.value = "opening";
  target.showModal();
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
  emit("opened", galleryIndex.value);
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

function requestClose(reason: MediaGalleryCloseReason = "programmatic") {
  if (closeRequested || (!dialog.value?.open && !props.open)) return;
  closeRequested = true;
  invalidateOpenCycle();
  invalidateNavigation();
  clearPointerState();
  emit("requestClose", galleryIndex.value, reason);
  emit("update:open", false);
}

function onCancel(event: Event) {
  event.preventDefault();
  requestClose("escape");
}

function startClose() {
  if (!dialog.value?.open || dialogState.value === "closing") return;
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
  if (
    !mounted.value ||
    generation !== closeGeneration ||
    dialogState.value !== "closing" ||
    !dialog.value?.open
  ) {
    return;
  }
  stopCloseFallback();
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

function onClose() {
  if (dialog.value?.open) return;
  invalidateOpenCycle();
  invalidateNavigation();
  invalidateClose();
  clearPointerState();
  dialogState.value = "closed";
  closeRequested = false;
  mediaTransitionMode.value = "direct";
  resetTransform();
  unlockDocumentScroll();
  if (!mounted.value) return;
  restoreFocus({
    fallback: props.focusReturn?.fallback,
    opener: capturedOpener ?? props.focusReturn?.opener,
  });
  capturedOpener = undefined;
  emit("closed", galleryIndex.value);
  if (props.open) void openDialog();
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
  if (closes) requestClose("backdrop");
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
  if (props.open) void openDialog();
});

watch(
  () => props.open,
  (open) => {
    if (open) void openDialog();
    else {
      if (dialog.value?.open && !closeRequested) requestClose("programmatic");
      startClose();
    }
  },
);

watch(
  () => props.initialIndex,
  (index) => {
    if (!props.open) ensureImageState(items.value[clampIndex(index)]);
  },
  { immediate: true },
);

watch(items, (nextItems, previousItems) => {
  itemCollectionGeneration.value += 1;
  const collectionGeneration = itemCollectionGeneration.value;
  const openGeneration = openCycleGeneration.value;
  const navigation = invalidateNavigation();
  const previousId = previousItems[galleryIndex.value]?.id;
  const nextIds = new Set(nextItems.map((item) => item.id));
  imageLoadStateByItem.value = Object.fromEntries(
    Object.entries(imageLoadStateByItem.value).filter(([id]) => nextIds.has(id)),
  );
  imageRetryAttemptByItem.value = Object.fromEntries(
    Object.entries(imageRetryAttemptByItem.value).filter(([id]) => nextIds.has(id)),
  );
  previewFailedByItem.value = Object.fromEntries(
    Object.entries(previewFailedByItem.value).filter(([id]) => nextIds.has(id)),
  );
  for (const id of mediaTransformElements.keys()) {
    if (!nextIds.has(id)) mediaTransformElements.delete(id);
  }

  if (nextItems.length === 0) {
    if (props.open) {
      invalidateOpenCycle();
      requestClose("programmatic");
    }
    galleryIndex.value = 0;
    return;
  }

  galleryIndex.value = resolvePreservedGalleryIndex(previousId, galleryIndex.value, nextItems);
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
      measureGeometry();
    }
  })();
});

onBeforeUnmount(() => {
  mounted.value = false;
  invalidateOpenCycle();
  invalidateNavigation();
  invalidateClose();
  clearPointerState();
  unlockDocumentScroll();
  mediaTransformElements.clear();
  if (dialog.value?.open) dialog.value.close();
  restoreFocus({
    fallback: props.focusReturn?.fallback,
    opener: capturedOpener ?? props.focusReturn?.opener,
  });
});

defineExpose({
  dialog,
  activeIndex: galleryIndex,
  previous,
  next,
  resetToFit,
  requestClose,
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
    :data-gallery-index="galleryIndex"
    :data-image-state="activeImageLoadState"
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
      <header class="snap-motion-media-gallery-header">
        <div>
          <p v-if="eyebrow">{{ eyebrow }}</p>
          <h2 :id="titleId" ref="titleHeading" tabindex="-1">{{ title }}</h2>
        </div>
        <div class="snap-motion-media-gallery-identity" aria-live="off">
          <strong data-testid="snap-motion-media-gallery-title">{{ activeItem?.title }}</strong>
          <span class="tabular" data-testid="snap-motion-media-gallery-position">
            {{ galleryPosition }}
          </span>
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
          :style="viewportStyle"
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
                  v-if="mounted && open"
                  class="snap-motion-media-gallery-media snap-motion-media-gallery-preview"
                  :class="{ concealed: imageLoadState(slot.item) === 'loaded' }"
                  :src="slot.item.previewSrc"
                  :alt="
                    slot.item.id === activeItem?.id && imageLoadState(slot.item) !== 'loaded'
                      ? slot.item.alt
                      : ''
                  "
                  :aria-hidden="
                    slot.item.id !== activeItem?.id || imageLoadState(slot.item) === 'loaded'
                      ? 'true'
                      : undefined
                  "
                  :data-item-collection="itemCollectionGeneration"
                  :data-open-cycle="openCycleGeneration"
                  decoding="async"
                  draggable="false"
                  :height="slot.item.height"
                  :width="slot.item.width"
                  @error="onPreviewImageError($event, slot.item)"
                />
                <img
                  v-if="
                    mounted && open && slot.item.fullSrc && imageLoadState(slot.item) !== 'failed'
                  "
                  :key="`${openCycleGeneration}-${itemCollectionGeneration}-${slot.item.id}-${imageRetryAttempt(slot.item)}`"
                  class="snap-motion-media-gallery-media snap-motion-media-gallery-full"
                  :class="{ revealed: imageLoadState(slot.item) === 'loaded' }"
                  :data-item-collection="itemCollectionGeneration"
                  :data-open-cycle="openCycleGeneration"
                  :data-retry-attempt="imageRetryAttempt(slot.item)"
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
                  :height="slot.item.height"
                  :width="slot.item.width"
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
            <button type="button" @click="retryImage">{{ messages.retry }}</button>
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
