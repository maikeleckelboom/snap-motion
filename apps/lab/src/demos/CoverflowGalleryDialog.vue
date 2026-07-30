<script setup lang="ts">
import { focusInitial, maintainModalTabOrder } from "@snap-motion/vue/dialog";
import {
  useEventListener,
  useImage,
  useResizeObserver,
  useScrollLock,
  useTimeoutFn,
} from "@vueuse/core";
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
  galleryPreloadIndices,
  isRepeatedGalleryTap,
  resolveGallerySwipe,
  resolvePinchTransform,
  type CoverflowGalleryItem,
  type GalleryTap,
} from "./coverflowGallery";

type CloseReason = "backdrop" | "close-button" | "escape";
type DialogState = "closed" | "closing" | "open" | "opening";
type ImageLoadState = "failed" | "loaded" | "pending";
type PointerMode = "blocked" | "pan" | "pending" | "swipe";

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
const imageLoadState = ref<ImageLoadState>("pending");
const imageRetryGeneration = ref(0);
const imageRetryAttempt = ref(0);
const liveMessage = ref("");
const pointerMode = ref<PointerMode | "idle">("idle");
const pointerCount = ref(0);
const transform = shallowRef<MediaTransform>({ ...fittedMediaTransform });
const swipeOffsetX = ref(0);
const swipeSettling = ref(false);
const previousFocused = ref(false);
const nextFocused = ref(false);
const zoomInFocused = ref(false);
const zoomOutFocused = ref(false);
const resetFocused = ref(false);
const titleId = `coverflow-gallery-title-${useId()}`;
const activePointers = new Map<number, PointerSample>();
const documentElement = computed(() => dialog.value?.ownerDocument.documentElement);
const scrollLocked = useScrollLock(documentElement);
const preloaders = new Map(
  props.items.map((item) => [
    item.id,
    useImage(
      () => ({
        alt: item.alt,
        decoding: "async",
        height: item.height,
        src: item.fullSrc,
        width: item.width,
      }),
      { immediate: false, resetOnExecute: false },
    ),
  ]),
);

let gesture: GestureSession | undefined;
let pinch: PinchSession | undefined;
let previousTap: GalleryTap | undefined;
let backdropPointerId: number | undefined;
let openingFrame: number | undefined;
let swipeFrame: number | undefined;
let lockedRoot: HTMLElement | undefined;
let previousPaddingInlineEnd = "";
let closeRequested = false;
let geometry = {
  height: 0,
  left: 0,
  top: 0,
  width: 0,
};

const activeItem = computed(() => props.items[galleryIndex.value] ?? props.items[0]);
const canGoPrevious = computed(() => galleryIndex.value > 0);
const canGoNext = computed(() => galleryIndex.value < props.items.length - 1);
const isZoomed = computed(() => transform.value.scale > 1.001);
const canZoomIn = computed(() => transform.value.scale < 4 - 0.001);
const canZoomOut = computed(() => isZoomed.value);
const scalePercentage = computed(() => Math.round(transform.value.scale * 100));
const activeAspectRatio = computed(() => {
  const item = activeItem.value;
  return item && item.height > 0 ? item.width / item.height : 1;
});
const visibleFullSrc = computed(() => {
  const item = activeItem.value;
  if (!item || imageRetryAttempt.value === 0) return item?.fullSrc;
  const separator = item.fullSrc.includes("?") ? "&" : "?";
  return `${item.fullSrc}${separator}retry=${imageRetryAttempt.value}`;
});
const viewportStyle = computed(() => ({
  "--_gallery-aspect-ratio": String(activeAspectRatio.value),
}));
const transformStyle = computed(() => ({
  "--_gallery-pan-x": `${transform.value.x.toFixed(3)}px`,
  "--_gallery-pan-y": `${transform.value.y.toFixed(3)}px`,
  "--_gallery-scale": transform.value.scale.toFixed(4),
}));
const swipeStyle = computed(() => ({
  "--_gallery-swipe-x": `${swipeOffsetX.value.toFixed(3)}px`,
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
const { start: startSwipeReset, stop: stopSwipeReset } = useTimeoutFn(
  () => {
    swipeSettling.value = false;
  },
  190,
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

function zoomTo(scale: number, focalPoint: MediaPoint = { x: 0, y: 0 }) {
  commitTransform(zoomMediaTransform(transform.value, scale, focalPoint, activeContext()));
}

function zoomIn() {
  if (!canZoomIn.value) return;
  zoomTo(transform.value.scale + COVERFLOW_GALLERY_TUNING.zoomStep);
}

function zoomOut() {
  if (!canZoomOut.value) return;
  zoomTo(transform.value.scale - COVERFLOW_GALLERY_TUNING.zoomStep);
}

function resetToFit() {
  resetTransform();
}

function announceCurrent() {
  const item = activeItem.value;
  if (item) {
    liveMessage.value = `${item.title}, ${galleryIndex.value + 1} of ${props.items.length}`;
  }
}

async function preloadIndex(index: number) {
  const item = props.items[index];
  const preloader = item ? preloaders.get(item.id) : undefined;
  if (!preloader) return;
  try {
    const image = await preloader.execute();
    await image?.decode();
  } catch {
    // The visible image owns the accessible failure state and retry path.
  }
}

function preloadAround(index: number) {
  for (const candidate of galleryPreloadIndices(index, props.items.length)) {
    void preloadIndex(candidate);
  }
}

function resetImageLoading(resetRetryAttempt = true) {
  if (resetRetryAttempt) imageRetryAttempt.value = 0;
  imageLoadState.value = "pending";
  imageRetryGeneration.value += 1;
}

async function onFullImageLoad(event: Event) {
  const image = event.currentTarget;
  if (!(image instanceof HTMLImageElement)) {
    imageLoadState.value = "failed";
    return;
  }
  const generation = Number(image.dataset.loadGeneration);
  try {
    await image.decode();
  } catch {
    if (generation === imageRetryGeneration.value) imageLoadState.value = "failed";
    return;
  }
  if (
    generation !== imageRetryGeneration.value ||
    !image.complete ||
    image.naturalWidth <= 0 ||
    image.naturalHeight <= 0
  ) {
    return;
  }
  imageLoadState.value = "loaded";
  await nextTick();
  measureGeometry();
}

function onFullImageError(event: Event) {
  const image = event.currentTarget;
  if (
    image instanceof HTMLImageElement &&
    Number(image.dataset.loadGeneration) === imageRetryGeneration.value
  ) {
    imageLoadState.value = "failed";
  }
}

function retryImage() {
  imageRetryAttempt.value += 1;
  resetImageLoading(false);
}

function beginSwipeReset(initialOffset = swipeOffsetX.value) {
  stopSwipeReset();
  swipeOffsetX.value = initialOffset;
  swipeSettling.value = true;
  if (swipeFrame !== undefined) cancelAnimationFrame(swipeFrame);
  swipeFrame = requestAnimationFrame(() => {
    swipeFrame = undefined;
    swipeOffsetX.value = 0;
    startSwipeReset();
  });
}

async function changeIndex(index: number, announcement = true): Promise<boolean> {
  const nextIndex = clampIndex(index);
  if (nextIndex === galleryIndex.value) return false;
  const previousOffset = swipeOffsetX.value;
  galleryIndex.value = nextIndex;
  resetTransform();
  resetImageLoading();
  clearPointerState();
  preloadAround(nextIndex);
  await nextTick();
  measureGeometry();
  beginSwipeReset(Math.max(-32, Math.min(32, previousOffset)));
  if (announcement) announceCurrent();
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
  swipeOffsetX.value = 0;
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
  swipeOffsetX.value = 0;
  for (const pointerId of pointerIds) safeReleasePointer(pointerId);
}

function onImagePointerDown(event: PointerEvent) {
  if (
    dialogState.value !== "open" ||
    (event.target instanceof Element && event.target.closest("button")) ||
    (event.pointerType === "mouse" && event.button !== 0)
  ) {
    return;
  }
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
      const beyondStart = galleryIndex.value === 0 && deltaX > 0;
      const beyondEnd = galleryIndex.value === props.items.length - 1 && deltaX < 0;
      const resisted = beyondStart || beyondEnd ? deltaX * 0.22 : deltaX;
      swipeOffsetX.value = Math.max(
        geometry.width * -0.45,
        Math.min(geometry.width * 0.45, resisted),
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
      swipeOffsetX.value = 0;
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
    void changeIndex(galleryIndex.value + direction);
  } else {
    beginSwipeReset();
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
  beginSwipeReset();
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
    zoomIn();
  } else if (event.key === "-") {
    zoomOut();
  } else if (event.key === "0") {
    resetToFit();
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
  resetTransform();
  resetImageLoading();
  dialogState.value = "opening";
  target.showModal();
  lockDocumentScroll();
  preloadAround(galleryIndex.value);
  await nextTick();
  measureGeometry();
  focusInitial("close", { close: closeButton.value, container: shell.value });
  announceCurrent();

  if (props.reducedMotion) {
    dialogState.value = "open";
    return;
  }
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
  resetTransform();
  resetImageLoading();
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
    if (!props.open) void preloadIndex(clampIndex(index));
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  stopCloseFallback();
  stopSwipeReset();
  if (openingFrame !== undefined) cancelAnimationFrame(openingFrame);
  if (swipeFrame !== undefined) cancelAnimationFrame(swipeFrame);
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
    :data-image-state="imageLoadState"
    :data-pan-x="transform.x.toFixed(3)"
    :data-pan-y="transform.y.toFixed(3)"
    :data-reduced-motion="reducedMotion ? 'true' : 'false'"
    :data-scale="transform.scale.toFixed(4)"
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
          :aria-disabled="!canGoPrevious"
          :aria-label="previousLabel"
          class="gallery-icon-button gallery-previous"
          data-testid="coverflow-gallery-previous"
          :disabled="!canGoPrevious && !previousFocused"
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
          :aria-busy="imageLoadState === 'pending'"
          class="coverflow-gallery-viewport"
          data-testid="coverflow-gallery-viewport"
          :data-pointer-mode="pointerMode"
          :data-swipe-settling="swipeSettling ? 'true' : 'false'"
          :style="viewportStyle"
          @dblclick="onDoubleClick"
          @pointerdown="onImagePointerDown"
        >
          <div
            class="coverflow-gallery-swipe-surface"
            :class="{ settling: swipeSettling }"
            :style="swipeStyle"
          >
            <div
              class="coverflow-gallery-transform"
              :class="{ manipulating: pointerCount > 0 }"
              :style="transformStyle"
            >
              <img
                v-if="activeItem && open"
                class="gallery-image gallery-image-placeholder"
                :class="{ concealed: imageLoadState === 'loaded' }"
                :src="activeItem.thumbnailSrc"
                :alt="imageLoadState === 'loaded' ? '' : activeItem.alt"
                :aria-hidden="imageLoadState === 'loaded' ? 'true' : undefined"
                decoding="async"
                draggable="false"
                :height="activeItem.height"
                :width="activeItem.width"
              />
              <img
                v-if="activeItem && open && imageLoadState !== 'failed'"
                :key="`${activeItem.id}-${imageRetryGeneration}`"
                class="gallery-image gallery-image-full"
                :class="{ revealed: imageLoadState === 'loaded' }"
                :data-load-generation="imageRetryGeneration"
                :src="visibleFullSrc"
                :alt="imageLoadState === 'loaded' ? activeItem.alt : ''"
                :aria-hidden="imageLoadState === 'loaded' ? undefined : 'true'"
                decoding="async"
                draggable="false"
                fetchpriority="high"
                :height="activeItem.height"
                :width="activeItem.width"
                @error="onFullImageError"
                @load="onFullImageLoad"
              />
            </div>
          </div>

          <p
            v-if="imageLoadState === 'pending'"
            class="gallery-load-state"
            data-testid="coverflow-gallery-loading"
          >
            Loading full image…
          </p>
          <div
            v-if="imageLoadState === 'failed'"
            class="gallery-load-state gallery-load-error"
            data-testid="coverflow-gallery-error"
            role="status"
          >
            <span>Full image unavailable. Showing the preview.</span>
            <button type="button" @click="retryImage">Retry</button>
          </div>
        </div>

        <button
          :aria-disabled="!canGoNext"
          :aria-label="nextLabel"
          class="gallery-icon-button gallery-next"
          data-testid="coverflow-gallery-next"
          :disabled="!canGoNext && !nextFocused"
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
        <div class="gallery-zoom-controls" aria-label="Image zoom controls" role="group">
          <button
            :aria-disabled="!canZoomOut"
            aria-label="Zoom out"
            data-testid="coverflow-gallery-zoom-out"
            :disabled="!canZoomOut && !zoomOutFocused"
            type="button"
            @blur="zoomOutFocused = false"
            @click="zoomOut"
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
            @click="zoomIn"
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
            @click="resetToFit"
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
.gallery-load-error button {
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
.gallery-load-error button:hover:not(:disabled) {
  background: #2a3545;
  border-color: rgb(255 255 255 / 0.42);
}

.gallery-icon-button:focus-visible,
.gallery-zoom-controls button:focus-visible,
.gallery-load-error button:focus-visible {
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
  inline-size: min(100%, calc((100dvh - 11rem) * var(--_gallery-aspect-ratio)));
  max-block-size: 100%;
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

.coverflow-gallery-swipe-surface,
.coverflow-gallery-transform,
.gallery-image {
  position: absolute;
  inset: 0;
  inline-size: 100%;
  block-size: 100%;
}

.coverflow-gallery-swipe-surface {
  transform: translate3d(var(--_gallery-swipe-x), 0, 0);
}

.coverflow-gallery-swipe-surface.settling {
  transition: transform 180ms cubic-bezier(0.22, 0.8, 0.2, 1);
}

.coverflow-gallery-transform {
  transform: translate3d(var(--_gallery-pan-x), var(--_gallery-pan-y), 0)
    scale(var(--_gallery-scale));
  transform-origin: center;
  will-change: auto;
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

.gallery-load-state {
  position: absolute;
  inset-inline-start: 50%;
  inset-block-end: 0.75rem;
  z-index: 2;
  max-inline-size: calc(100% - 1.5rem);
  padding: 0.45rem 0.7rem;
  margin: 0;
  border-radius: 0.45rem;
  background: rgb(5 7 10 / 0.86);
  color: #d7dee8;
  font-size: 0.8rem;
  text-align: center;
  transform: translateX(-50%);
}

.gallery-load-error {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.gallery-load-error button {
  min-inline-size: auto;
  min-block-size: 2.75rem;
  padding-inline: 0.9rem;
  border-radius: 0.55rem;
}

.coverflow-gallery-toolbar {
  display: grid;
  grid-template-columns: minmax(8rem, 1fr) auto minmax(8rem, 1fr);
  align-items: center;
  gap: 1rem;
  padding: 0.75rem max(0.75rem, env(safe-area-inset-right))
    max(0.75rem, env(safe-area-inset-bottom)) max(0.75rem, env(safe-area-inset-left));
  border-block-start: 1px solid rgb(255 255 255 / 0.1);
  background: #151b25;
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

  .coverflow-gallery-viewport {
    inline-size: min(100%, calc((100dvh - 14.5rem) * var(--_gallery-aspect-ratio)));
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
    grid-template-columns: auto minmax(0, 1fr);
  }

  .gallery-zoom-controls {
    justify-self: end;
  }

  .coverflow-gallery-toolbar p {
    grid-column: 1 / -1;
    justify-self: start;
    text-align: start;
  }
}

@media (max-width: 30rem) {
  .coverflow-gallery-toolbar p {
    display: none;
  }

  .coverflow-gallery-viewport {
    inline-size: min(100%, calc((100dvh - 12rem) * var(--_gallery-aspect-ratio)));
  }
}

@media (prefers-reduced-motion: reduce) {
  .coverflow-gallery-dialog::backdrop,
  .coverflow-gallery-shell,
  .coverflow-gallery-swipe-surface,
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
.coverflow-gallery-dialog[data-reduced-motion="true"] .coverflow-gallery-swipe-surface,
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
