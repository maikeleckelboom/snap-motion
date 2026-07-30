<script setup lang="ts">
import { focusInitial, maintainModalTabOrder } from "@snap-motion/vue/dialog";
import { useEventListener, useResizeObserver, useScrollLock, useTimeoutFn } from "@vueuse/core";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, useId, watch } from "vue";

import {
  fittedMediaTransform,
  type MediaPoint,
  type MediaTransform,
  type MediaTransformContext,
} from "@/media-inspection/media-transform-contracts";
import { panMediaTransform, zoomMediaTransform } from "@/media-inspection/media-transform-math";

import {
  COVERFLOW_GALLERY_TUNING,
  canonicalCoverflowGalleryTransform,
  isRepeatedGalleryTap,
  resolveGalleryCommitOffset,
  resolveGallerySwipe,
  resolveGalleryTrackOffset,
  resolveGalleryTrackSlots,
  resolvePinchTransform,
  shouldTransitionGalleryMedia,
  type CoverflowGalleryItem,
  type GalleryMediaAction,
  type GalleryTap,
} from "./coverflowGallery";

type CloseReason = "backdrop" | "close-button" | "escape";
type DialogState = "closed" | "closing" | "open" | "opening";
type ImageLoadState = "failed" | "loaded" | "pending";
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

const props = defineProps<{
  readonly initialIndex: number;
  readonly items: readonly CoverflowGalleryItem[];
  readonly open: boolean;
  readonly reducedMotion: boolean;
}>();

const emit = defineEmits<{
  (event: "closed", finalIndex: number): void;
  (event: "requestClose", finalIndex: number, reason: CloseReason): void;
}>();

const dialog = ref<HTMLDialogElement>();
const shell = ref<HTMLElement>();
const closeButton = ref<HTMLButtonElement>();
const imageViewport = ref<HTMLElement>();
const galleryIndex = ref(clampIndex(props.initialIndex));
const dialogState = ref<DialogState>("closed");
const imageLoadStateByItem = ref<Record<string, ImageLoadState>>({});
const imageRetryAttemptByItem = ref<Record<string, number>>({});
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
const titleId = `coverflow-gallery-title-${useId()}`;
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
let pendingTrackAnnouncement = true;
let geometry = {
  height: 0,
  left: 0,
  top: 0,
  width: 0,
};

const activeItem = computed(() => props.items[galleryIndex.value] ?? props.items[0]);
const trackSlots = computed(() =>
  resolveGalleryTrackSlots(galleryIndex.value, props.items.length, trackDestinationIndex.value).map(
    (slot) => ({ ...slot, item: props.items[slot.itemIndex] }),
  ),
);
const canGoPrevious = computed(() => galleryIndex.value > 0);
const canGoNext = computed(() => galleryIndex.value < props.items.length - 1);
const galleryBusy = computed(() => trackNavigationState.value !== "idle");
const canNavigatePrevious = computed(() => canGoPrevious.value && !galleryBusy.value);
const canNavigateNext = computed(() => canGoNext.value && !galleryBusy.value);
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
  return item ? (imageLoadStateByItem.value[item.id] ?? "pending") : "pending";
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
const galleryPosition = computed(() => `${galleryIndex.value + 1} / ${props.items.length}`);
const previousLabel = computed(() => {
  const item = props.items[galleryIndex.value - 1];
  return item ? `Previous screen: ${item.title}` : "Previous screen";
});
const nextLabel = computed(() => {
  const item = props.items[galleryIndex.value + 1];
  return item ? `Next screen: ${item.title}` : "Next screen";
});

const { start: startCloseFallback, stop: stopCloseFallback } = useTimeoutFn(
  finishClose,
  COVERFLOW_GALLERY_TUNING.closeDuration + 80,
  { immediate: false },
);
const { start: startTrackFallback, stop: stopTrackFallback } = useTimeoutFn(
  completeTrackSettlement,
  240,
  { immediate: false },
);

function clampIndex(index: number): number {
  return Math.min(Math.max(0, props.items.length - 1), Math.max(0, Math.round(index)));
}

function activeContext(): MediaTransformContext {
  const item = activeItem.value;
  return {
    intrinsicSize: item ? { height: item.height, width: item.width } : { height: 1, width: 1 },
    viewportSize: { height: geometry.height, width: geometry.width },
  };
}

function canonicalTransform(nextTransform: MediaTransform): MediaTransform {
  return canonicalCoverflowGalleryTransform(nextTransform, activeContext());
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
  if (!target) return;
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
  mediaTransitionMode.value = shouldTransitionGalleryMedia(action, props.reducedMotion)
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
  zoomTo(transform.value.scale + COVERFLOW_GALLERY_TUNING.zoomStep, { x: 0, y: 0 }, action);
}

function zoomOut(action: GalleryMediaAction = "button") {
  if (!canZoomOut.value) return;
  zoomTo(transform.value.scale - COVERFLOW_GALLERY_TUNING.zoomStep, { x: 0, y: 0 }, action);
}

function resetToFit(action: GalleryMediaAction = "fit") {
  setMediaTransition(action);
  resetTransform();
}

function announceCurrent() {
  const item = activeItem.value;
  if (item) {
    liveMessage.value = `${item.title}, ${galleryIndex.value + 1} of ${props.items.length}`;
  }
}

function ensureImageState(item: CoverflowGalleryItem | undefined) {
  if (!item || imageLoadStateByItem.value[item.id]) return;
  imageLoadStateByItem.value = { ...imageLoadStateByItem.value, [item.id]: "pending" };
}

function ensureTrackImageStates() {
  for (const slot of trackSlots.value) {
    ensureImageState(slot.item);
  }
}

function imageLoadState(item: CoverflowGalleryItem): ImageLoadState {
  return imageLoadStateByItem.value[item.id] ?? "pending";
}

function imageRetryAttempt(item: CoverflowGalleryItem): number {
  return imageRetryAttemptByItem.value[item.id] ?? 0;
}

function visibleFullSrc(item: CoverflowGalleryItem): string {
  const attempt = imageRetryAttempt(item);
  if (attempt === 0) return item.fullSrc;
  const separator = item.fullSrc.includes("?") ? "&" : "?";
  return `${item.fullSrc}${separator}retry=${attempt}`;
}

function setImageLoadState(item: CoverflowGalleryItem, state: ImageLoadState) {
  imageLoadStateByItem.value = { ...imageLoadStateByItem.value, [item.id]: state };
}

async function onFullImageLoad(event: Event, item: CoverflowGalleryItem) {
  const image = event.currentTarget;
  if (!(image instanceof HTMLImageElement)) {
    setImageLoadState(item, "failed");
    return;
  }
  const attempt = Number(image.dataset.retryAttempt);
  try {
    await image.decode();
  } catch {
    if (attempt === imageRetryAttempt(item)) setImageLoadState(item, "failed");
    return;
  }
  if (
    attempt !== imageRetryAttempt(item) ||
    !image.complete ||
    image.naturalWidth <= 0 ||
    image.naturalHeight <= 0
  ) {
    return;
  }
  setImageLoadState(item, "loaded");
  if (item.id === activeItem.value?.id) {
    await nextTick();
    measureGeometry();
  }
}

function onFullImageError(event: Event, item: CoverflowGalleryItem) {
  const image = event.currentTarget;
  if (
    image instanceof HTMLImageElement &&
    Number(image.dataset.retryAttempt) === imageRetryAttempt(item)
  ) {
    setImageLoadState(item, "failed");
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
  const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
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

function beginTrackSettlement(destinationIndex?: number, announcement = true) {
  stopTrackFallback();
  pendingTrackDestination = destinationIndex;
  pendingTrackAnnouncement = announcement;
  trackTransitionEnabled.value = true;
  trackNavigationState.value = "settling";
  if (destinationIndex === undefined) {
    trackOffsetX.value = 0;
  } else {
    const direction = Math.sign(destinationIndex - galleryIndex.value) as -1 | 1;
    trackOffsetX.value = resolveGalleryCommitOffset(direction, geometry.width);
  }
  startTrackFallback();
}

async function completeTrackSettlement() {
  if (trackNavigationState.value !== "settling") return;
  stopTrackFallback();
  const destination = pendingTrackDestination;
  const announcement = pendingTrackAnnouncement;
  pendingTrackDestination = undefined;
  pendingTrackAnnouncement = true;

  if (destination === undefined) {
    trackTransitionEnabled.value = false;
    trackNavigationState.value = "idle";
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
  measureGeometry();
  if (trackFrame !== undefined) cancelAnimationFrame(trackFrame);
  trackFrame = requestAnimationFrame(() => {
    trackFrame = undefined;
    trackNavigationState.value = "idle";
    if (announcement) announceCurrent();
  });
}

function onTrackTransitionEnd(event: TransitionEvent) {
  if (event.currentTarget === event.target && event.propertyName === "transform") {
    void completeTrackSettlement();
  }
}

async function changeIndex(index: number, announcement = true): Promise<boolean> {
  const nextIndex = clampIndex(index);
  if (nextIndex === galleryIndex.value || galleryBusy.value) return false;
  clearPointerState();
  trackDestinationIndex.value = nextIndex;
  ensureTrackImageStates();
  await nextTick();
  if (trackFrame !== undefined) cancelAnimationFrame(trackFrame);
  trackFrame = requestAnimationFrame(() => {
    trackFrame = undefined;
    beginTrackSettlement(nextIndex, announcement);
  });
  return true;
}

function previous() {
  if (canGoPrevious.value) void changeIndex(galleryIndex.value - 1);
}

function next() {
  if (canGoNext.value) void changeIndex(galleryIndex.value + 1);
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
      Math.max(horizontal, vertical) >= COVERFLOW_GALLERY_TUNING.gallerySwipeThreshold
    ) {
      gesture.mode =
        horizontal >= vertical * COVERFLOW_GALLERY_TUNING.horizontalIntentRatio
          ? "swipe"
          : vertical >= horizontal * COVERFLOW_GALLERY_TUNING.horizontalIntentRatio
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
        props.items.length,
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
      isZoomed.value ? 1 : COVERFLOW_GALLERY_TUNING.doubleTapScale,
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
    itemCount: props.items.length,
    scale: gesture.startScale,
    viewportWidth: geometry.width,
  });
  const wasTap = Math.hypot(deltaX, deltaY) < COVERFLOW_GALLERY_TUNING.gallerySwipeThreshold;
  if (direction !== 0) {
    const destination = galleryIndex.value + direction;
    trackDestinationIndex.value = destination;
    ensureTrackImageStates();
    beginTrackSettlement(destination);
  } else {
    if (Math.abs(trackOffsetX.value) > 0.01) beginTrackSettlement();
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
  beginTrackSettlement();
}

function onLostPointerCapture(event: PointerEvent) {
  if (!activePointers.has(event.pointerId)) return;
  onWindowPointerCancel(event);
}

function onDoubleClick(event: MouseEvent) {
  if (event.button !== 0) return;
  event.preventDefault();
  zoomTo(
    isZoomed.value ? 1 : COVERFLOW_GALLERY_TUNING.doubleTapScale,
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
    void changeIndex(0);
  } else if (event.key === "End") {
    void changeIndex(props.items.length - 1);
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
  if (!target || target.open || props.items.length === 0) return;
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
  ensureTrackImageStates();
  await nextTick();
  measureGeometry();
  focusInitial("close", { close: closeButton.value, container: shell.value });
  announceCurrent();

  if (props.reducedMotion) {
    dialogState.value = "open";
    return;
  }
  target.getBoundingClientRect();
  if (openingFrame !== undefined) cancelAnimationFrame(openingFrame);
  openingFrame = requestAnimationFrame(() => {
    openingFrame = undefined;
    dialogState.value = "open";
  });
}

function requestClose(reason: CloseReason) {
  if (closeRequested || !dialog.value?.open) return;
  closeRequested = true;
  clearPointerState();
  emit("requestClose", galleryIndex.value, reason);
}

function onCancel(event: Event) {
  event.preventDefault();
  requestClose("escape");
}

function startClose() {
  if (!dialog.value?.open || dialogState.value === "closing") return;
  clearPointerState();
  stopTrackFallback();
  trackTransitionEnabled.value = false;
  trackNavigationState.value = "idle";
  resetTransform();
  dialogState.value = "closing";
  if (props.reducedMotion) {
    finishClose();
  } else {
    startCloseFallback();
  }
}

function finishClose() {
  stopCloseFallback();
  if (dialog.value?.open) dialog.value.close();
}

function onShellTransitionEnd(event: TransitionEvent) {
  if (
    dialogState.value === "closing" &&
    event.currentTarget === event.target &&
    event.propertyName === "opacity"
  ) {
    finishClose();
  }
}

function onClose() {
  dialogState.value = "closed";
  closeRequested = false;
  stopTrackFallback();
  trackDestinationIndex.value = undefined;
  trackOffsetX.value = 0;
  trackTransitionEnabled.value = false;
  trackNavigationState.value = "idle";
  mediaTransitionMode.value = "direct";
  resetTransform();
  unlockDocumentScroll();
  emit("closed", galleryIndex.value);
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

useEventListener("pointermove", onWindowPointerMove, { passive: false });
useEventListener("pointerup", onWindowPointerUp);
useEventListener("pointercancel", onWindowPointerCancel);
useEventListener("blur", clearPointerState);
useEventListener(imageViewport, "lostpointercapture", onLostPointerCapture);
useResizeObserver(imageViewport, measureGeometry);

onMounted(() => {
  if (props.open) void openDialog();
});

watch(
  () => props.open,
  (open) => {
    if (open) void openDialog();
    else startClose();
  },
);

watch(
  () => props.initialIndex,
  (index) => {
    if (!props.open) ensureImageState(props.items[clampIndex(index)]);
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  stopCloseFallback();
  stopTrackFallback();
  if (openingFrame !== undefined) cancelAnimationFrame(openingFrame);
  if (trackFrame !== undefined) cancelAnimationFrame(trackFrame);
  clearPointerState();
  unlockDocumentScroll();
  if (dialog.value?.open) dialog.value.close();
});
</script>

<template>
  <dialog
    ref="dialog"
    :aria-labelledby="titleId"
    class="coverflow-gallery-dialog"
    data-testid="coverflow-gallery"
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
      class="coverflow-gallery-shell"
      data-testid="coverflow-gallery-shell"
      @transitionend="onShellTransitionEnd"
    >
      <header class="coverflow-gallery-header">
        <div>
          <p>Screen inspection</p>
          <h2 :id="titleId">Screen gallery</h2>
        </div>
        <div class="coverflow-gallery-identity" aria-live="off">
          <strong data-testid="coverflow-gallery-title">{{ activeItem?.title }}</strong>
          <span class="tabular" data-testid="coverflow-gallery-position">
            {{ galleryPosition }}
          </span>
        </div>
        <button
          ref="closeButton"
          aria-label="Close screen gallery"
          class="gallery-icon-button gallery-close"
          data-testid="coverflow-gallery-close"
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

      <div class="coverflow-gallery-workspace">
        <button
          :aria-disabled="!canNavigatePrevious"
          :aria-label="previousLabel"
          class="gallery-icon-button gallery-previous"
          data-testid="coverflow-gallery-previous"
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
          class="coverflow-gallery-viewport"
          data-testid="coverflow-gallery-viewport"
          :data-pointer-mode="pointerMode"
          :data-track-state="trackNavigationState"
          :style="viewportStyle"
          @dblclick="onDoubleClick"
          @pointerdown="onImagePointerDown"
        >
          <div
            class="coverflow-gallery-track"
            :class="{ transitioning: trackTransitionEnabled }"
            :style="trackStyle"
            data-testid="coverflow-gallery-track"
            @transitionend="onTrackTransitionEnd"
          >
            <div
              v-for="slot in trackSlots"
              :key="slot.item?.id"
              class="coverflow-gallery-slot"
              :data-item-id="slot.item?.id"
              :data-slot-position="slot.position"
              :style="{ '--_gallery-slot-position': slot.position }"
            >
              <div
                v-if="slot.item"
                :ref="
                  (element) => setMediaTransformElement(slot.item!.id, element as Element | null)
                "
                class="coverflow-gallery-transform"
                :class="{
                  manipulating: pointerCount > 0 && slot.item.id === activeItem?.id,
                  transitioning:
                    mediaTransitionMode === 'discrete' && slot.item.id === activeItem?.id,
                }"
                :style="slot.item.id === activeItem?.id ? transformStyle : undefined"
              >
                <img
                  v-if="open"
                  class="gallery-image gallery-image-placeholder"
                  :class="{ concealed: imageLoadState(slot.item) === 'loaded' }"
                  :src="slot.item.thumbnailSrc"
                  :alt="imageLoadState(slot.item) === 'loaded' ? '' : slot.item.alt"
                  :aria-hidden="imageLoadState(slot.item) === 'loaded' ? 'true' : undefined"
                  decoding="async"
                  draggable="false"
                  :height="slot.item.height"
                  :width="slot.item.width"
                />
                <img
                  v-if="open && imageLoadState(slot.item) !== 'failed'"
                  :key="`${slot.item.id}-${imageRetryAttempt(slot.item)}`"
                  class="gallery-image gallery-image-full"
                  :class="{ revealed: imageLoadState(slot.item) === 'loaded' }"
                  :data-retry-attempt="imageRetryAttempt(slot.item)"
                  :src="visibleFullSrc(slot.item)"
                  :alt="imageLoadState(slot.item) === 'loaded' ? slot.item.alt : ''"
                  :aria-hidden="imageLoadState(slot.item) === 'loaded' ? undefined : 'true'"
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
          class="gallery-icon-button gallery-next"
          data-testid="coverflow-gallery-next"
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

      <footer class="coverflow-gallery-toolbar">
        <div class="gallery-zoom-readout">
          <span>Zoom</span>
          <strong class="tabular" data-testid="coverflow-gallery-zoom">
            {{ scalePercentage }}%
          </strong>
        </div>
        <div class="gallery-media-status" role="status">
          <span v-if="activeImageLoadState === 'pending'" data-testid="coverflow-gallery-loading">
            Loading full image…
          </span>
          <template v-else-if="activeImageLoadState === 'failed'">
            <span data-testid="coverflow-gallery-error">
              Full image unavailable. Showing the preview.
            </span>
            <button type="button" @click="retryImage">Retry</button>
          </template>
        </div>
        <div class="gallery-zoom-controls" aria-label="Image zoom controls" role="group">
          <button
            :aria-disabled="!canZoomOut"
            aria-label="Zoom out"
            data-testid="coverflow-gallery-zoom-out"
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
            aria-label="Zoom in"
            data-testid="coverflow-gallery-zoom-in"
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
            aria-label="Reset image to fit"
            data-testid="coverflow-gallery-reset"
            :disabled="!canZoomOut && !resetFocused"
            type="button"
            @blur="resetFocused = false"
            @click="resetToFit()"
            @focus="resetFocused = true"
          >
            Fit
          </button>
        </div>
        <p>Swipe at fit · drag to pan when zoomed · pinch or double-tap to zoom</p>
      </footer>

      <p class="sr-only" aria-atomic="true" data-testid="coverflow-gallery-status" role="status">
        {{ liveMessage }}
      </p>
    </section>
  </dialog>
</template>

<style scoped>
.coverflow-gallery-dialog {
  inline-size: 100vw;
  max-inline-size: none;
  block-size: 100dvh;
  max-block-size: none;
  padding: max(0.5rem, env(safe-area-inset-top)) max(0.5rem, env(safe-area-inset-right))
    max(0.5rem, env(safe-area-inset-bottom)) max(0.5rem, env(safe-area-inset-left));
  margin: 0;
  border: 0;
  background: transparent;
  color: #eef2f7;
  overflow: hidden;
}

.coverflow-gallery-dialog::backdrop {
  background: rgb(3 7 18 / 0.92);
  transition: background-color 220ms cubic-bezier(0.22, 0.8, 0.2, 1);
}

.coverflow-gallery-dialog[data-dialog-state="opening"]::backdrop,
.coverflow-gallery-dialog[data-dialog-state="closing"]::backdrop {
  background: rgb(3 7 18 / 0);
}

.coverflow-gallery-dialog[data-dialog-state="opening"]::backdrop {
  transition: none;
}

.coverflow-gallery-shell {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  inline-size: min(100%, 96rem);
  block-size: 100%;
  margin-inline: auto;
  border: 1px solid rgb(255 255 255 / 0.14);
  border-radius: 1rem;
  overflow: hidden;
  background: #11161f;
  box-shadow: 0 24px 80px rgb(0 0 0 / 0.42);
  opacity: 1;
  transform: scale(1);
  transition:
    opacity 220ms cubic-bezier(0.22, 0.8, 0.2, 1),
    transform 220ms cubic-bezier(0.22, 0.8, 0.2, 1);
}

.coverflow-gallery-dialog[data-dialog-state="opening"] .coverflow-gallery-shell,
.coverflow-gallery-dialog[data-dialog-state="closing"] .coverflow-gallery-shell {
  opacity: 0;
  transform: scale(0.99);
}

.coverflow-gallery-dialog[data-dialog-state="opening"] .coverflow-gallery-shell {
  transition: none;
}

.coverflow-gallery-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(2.75rem, 1fr);
  align-items: center;
  gap: 1rem;
  padding: 0.75rem clamp(0.75rem, 2vw, 1.25rem);
  border-block-end: 1px solid rgb(255 255 255 / 0.1);
  background: #151b25;
}

.coverflow-gallery-header p,
.coverflow-gallery-header h2,
.coverflow-gallery-identity,
.coverflow-gallery-toolbar p {
  margin: 0;
}

.coverflow-gallery-header p {
  color: #99a5b5;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.coverflow-gallery-header h2 {
  margin-block-start: 0.15rem;
  font-size: 1rem;
}

.coverflow-gallery-identity {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 0.75rem;
  min-inline-size: 0;
  text-align: center;
}

.coverflow-gallery-identity strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.coverflow-gallery-identity span {
  color: #aab4c2;
  white-space: nowrap;
}

.gallery-icon-button,
.gallery-zoom-controls button,
.gallery-media-status button {
  display: inline-grid;
  min-inline-size: 2.75rem;
  min-block-size: 2.75rem;
  padding: 0;
  place-items: center;
  border: 1px solid rgb(255 255 255 / 0.24);
  border-radius: 999px;
  background: #202936;
  color: #f8fafc;
}

.gallery-icon-button:hover:not(:disabled),
.gallery-zoom-controls button:hover:not(:disabled),
.gallery-media-status button:hover:not(:disabled) {
  background: #2a3545;
  border-color: rgb(255 255 255 / 0.42);
}

.gallery-icon-button:focus-visible,
.gallery-zoom-controls button:focus-visible,
.gallery-media-status button:focus-visible {
  outline-color: #73b3ff;
}

.gallery-close {
  justify-self: end;
}

.coverflow-gallery-workspace {
  position: relative;
  display: grid;
  grid-template-columns: 3.5rem minmax(0, 1fr) 3.5rem;
  align-items: center;
  gap: 0.75rem;
  min-block-size: 0;
  padding: clamp(0.75rem, 2vw, 1.5rem);
  background: #090d13;
  container-type: size;
}

.gallery-previous,
.gallery-next {
  position: relative;
  z-index: 2;
  justify-self: center;
}

.coverflow-gallery-viewport {
  --_gallery-aspect-ratio: 1.6;

  position: relative;
  inline-size: min(100%, calc(100cqb * var(--_gallery-aspect-ratio)));
  aspect-ratio: var(--_gallery-aspect-ratio);
  justify-self: center;
  border: 1px solid rgb(255 255 255 / 0.14);
  border-radius: 0.65rem;
  overflow: hidden;
  background: #05070a;
  contain: layout paint;
  touch-action: none;
  user-select: none;
  cursor: grab;
}

.coverflow-gallery-viewport:active {
  cursor: grabbing;
}

.coverflow-gallery-track,
.coverflow-gallery-slot,
.coverflow-gallery-transform,
.gallery-image {
  position: absolute;
  inset: 0;
  inline-size: 100%;
  block-size: 100%;
}

.coverflow-gallery-track {
  transform: translate3d(var(--_gallery-track-x), 0, 0);
  will-change: transform;
}

.coverflow-gallery-track.transitioning {
  transition: transform 180ms cubic-bezier(0.22, 0.8, 0.2, 1);
}

.coverflow-gallery-slot {
  transform: translate3d(calc(var(--_gallery-slot-position) * 100%), 0, 0);
}

.coverflow-gallery-transform {
  transform: translate3d(var(--_gallery-pan-x), var(--_gallery-pan-y), 0)
    scale(var(--_gallery-scale));
  transform-origin: center;
  will-change: auto;
}

.coverflow-gallery-transform.transitioning {
  transition: transform 180ms cubic-bezier(0.22, 1, 0.36, 1);
}

.coverflow-gallery-transform.manipulating {
  will-change: transform;
}

.gallery-image {
  object-fit: contain;
  pointer-events: none;
  -webkit-user-drag: none;
}

.gallery-image-placeholder {
  opacity: 1;
  transition: opacity 120ms linear;
}

.gallery-image-placeholder.concealed {
  opacity: 0;
}

.gallery-image-full {
  opacity: 0;
}

.gallery-image-full.revealed {
  opacity: 1;
}

.coverflow-gallery-toolbar {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto minmax(8rem, 1fr);
  align-items: center;
  gap: 1rem;
  padding: 0.75rem max(0.75rem, env(safe-area-inset-right))
    max(0.75rem, env(safe-area-inset-bottom)) max(0.75rem, env(safe-area-inset-left));
  border-block-start: 1px solid rgb(255 255 255 / 0.1);
  background: #151b25;
}

.gallery-media-status {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-inline-size: 0;
  min-block-size: 2.75rem;
  color: #b8c2d0;
  font-size: 0.8rem;
}

.gallery-media-status span {
  min-inline-size: 0;
}

.gallery-media-status button {
  min-block-size: 2.75rem;
  padding-inline: 0.9rem;
  border-radius: 0.55rem;
}

.gallery-zoom-readout {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  color: #aab4c2;
}

.gallery-zoom-readout strong {
  color: #f8fafc;
}

.gallery-zoom-controls {
  display: inline-flex;
  justify-content: center;
  gap: 0.5rem;
}

.gallery-zoom-controls button {
  border-radius: 0.55rem;
}

.gallery-zoom-controls button:last-child {
  min-inline-size: 3.5rem;
  padding-inline: 0.75rem;
}

.gallery-icon-button:disabled,
.gallery-zoom-controls button:disabled {
  border-color: rgb(255 255 255 / 0.1);
  background: #171e29;
  color: #667286;
}

.coverflow-gallery-toolbar p {
  justify-self: end;
  color: #8f9bac;
  font-size: 0.75rem;
  text-align: end;
}

@media (max-width: 48rem) {
  .coverflow-gallery-dialog {
    padding: 0;
  }

  .coverflow-gallery-shell {
    border: 0;
    border-radius: 0;
  }

  .coverflow-gallery-header {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .coverflow-gallery-identity {
    grid-column: 1 / -1;
    grid-row: 2;
    justify-content: start;
    text-align: start;
  }

  .gallery-close {
    grid-column: 2;
    grid-row: 1;
  }

  .coverflow-gallery-workspace {
    grid-template-columns: minmax(0, 1fr);
    padding: 0.75rem;
  }

  .gallery-previous,
  .gallery-next {
    position: absolute;
    inset-block-end: 1.25rem;
  }

  .gallery-previous {
    inset-inline-start: 1.25rem;
  }

  .gallery-next {
    inset-inline-end: 1.25rem;
  }

  .coverflow-gallery-toolbar {
    grid-template-columns: auto minmax(0, 1fr) auto;
  }

  .gallery-media-status {
    grid-column: 1 / -1;
    grid-row: 2;
  }

  .gallery-zoom-controls {
    grid-column: 3;
    justify-self: end;
  }

  .coverflow-gallery-toolbar p {
    grid-column: 1 / -1;
    grid-row: 3;
    justify-self: start;
    text-align: start;
  }
}

@media (max-width: 30rem) {
  .coverflow-gallery-toolbar p {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .coverflow-gallery-dialog::backdrop,
  .coverflow-gallery-shell,
  .coverflow-gallery-track,
  .coverflow-gallery-transform,
  .gallery-image-placeholder {
    transition-duration: 0.001ms;
  }

  .coverflow-gallery-dialog[data-dialog-state="opening"] .coverflow-gallery-shell,
  .coverflow-gallery-dialog[data-dialog-state="closing"] .coverflow-gallery-shell {
    transform: none;
  }
}

.coverflow-gallery-dialog[data-reduced-motion="true"]::backdrop,
.coverflow-gallery-dialog[data-reduced-motion="true"] .coverflow-gallery-shell,
.coverflow-gallery-dialog[data-reduced-motion="true"] .coverflow-gallery-track,
.coverflow-gallery-dialog[data-reduced-motion="true"] .coverflow-gallery-transform,
.coverflow-gallery-dialog[data-reduced-motion="true"] .gallery-image-placeholder {
  transition-duration: 0.001ms;
}

.coverflow-gallery-dialog[data-reduced-motion="true"][data-dialog-state="opening"]
  .coverflow-gallery-shell,
.coverflow-gallery-dialog[data-reduced-motion="true"][data-dialog-state="closing"]
  .coverflow-gallery-shell {
  transform: none;
}
</style>
