import { computed, nextTick, ref, shallowRef, watch, type ComputedRef, type Ref } from "vue";

import { isHTMLImageElement } from "../internal/dom/realm";
import type { MediaGalleryItem, MediaGalleryPreloadPolicy } from "./media-gallery-contracts";
import { hasDistinctMediaGallerySource } from "./media-gallery-math";

type ImageLoadState = "failed" | "loaded" | "pending" | "preview";
interface ImageRetry {
  readonly attempt: number;
  readonly authority: number;
  readonly request: string;
}

function hasDistinctFullSource(item: MediaGalleryItem): boolean {
  return hasDistinctMediaGallerySource(item.full, item.preview);
}

export function useGalleryImages(options: {
  activeItem: ComputedRef<MediaGalleryItem | undefined>;
  dialog: Ref<HTMLDialogElement | undefined>;
  isOpen: () => boolean;
  items: ComputedRef<readonly MediaGalleryItem[]>;
  onActiveLoad: () => void;
  openCycleGeneration: Ref<number>;
  preloadPolicy: () => MediaGalleryPreloadPolicy;
}) {
  const itemCollectionGeneration = ref(0);
  const imageLoadStateByItem = shallowRef<Record<string, ImageLoadState>>({});
  const retryByItem = shallowRef<Record<string, ImageRetry>>({});
  const selectedFullSourceByItem = shallowRef<Record<string, string>>({});
  const previewFailedByItem = shallowRef<Record<string, boolean>>({});
  let activeAuthorityGeneration = 0;
  let retryRequestIdentity = 0;

  function imageLoadDefault(item: MediaGalleryItem): ImageLoadState {
    return hasDistinctFullSource(item) ? "pending" : "preview";
  }

  function shouldMountFull(item: MediaGalleryItem): boolean {
    return (
      hasDistinctFullSource(item) &&
      (options.preloadPolicy() === "adjacent-full" || item.id === options.activeItem.value?.id)
    );
  }

  function imageLoadState(item: MediaGalleryItem): ImageLoadState {
    return imageLoadStateByItem.value[item.id] ?? imageLoadDefault(item);
  }

  function imageRetryAttempt(item: MediaGalleryItem): number {
    return retryByItem.value[item.id]?.attempt ?? 0;
  }

  function imageRetryAuthority(item: MediaGalleryItem): number {
    return retryByItem.value[item.id]?.authority ?? 0;
  }

  const activeImageLoadState = computed<ImageLoadState>(() => {
    const item = options.activeItem.value;
    return item ? imageLoadState(item) : "preview";
  });

  function resolveRetryRequestUrl(source: string): URL | undefined {
    let url: URL;
    try {
      url = new URL(source, options.dialog.value?.ownerDocument.baseURI);
    } catch {
      return undefined;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    return url;
  }

  const canRetryActiveImage = computed(() => {
    const item = options.activeItem.value;
    if (!item) return false;
    const selectedSource = selectedFullSourceByItem.value[item.id];
    return selectedSource !== undefined && resolveRetryRequestUrl(selectedSource) !== undefined;
  });

  function visibleFullSrc(item: MediaGalleryItem): string {
    return retryByItem.value[item.id]?.request ?? item.full.src;
  }

  function visibleFullSrcset(item: MediaGalleryItem): string | undefined {
    return imageRetryAttempt(item) === 0 ? item.full.srcset : undefined;
  }

  function isCurrent(
    openGeneration: number,
    collectionGeneration: number,
    item: MediaGalleryItem,
    attempt?: number,
    retryAuthority?: number,
  ): boolean {
    return (
      options.isOpen() &&
      openGeneration === options.openCycleGeneration.value &&
      collectionGeneration === itemCollectionGeneration.value &&
      options.items.value.some((candidate) => candidate.id === item.id) &&
      (attempt === undefined || attempt === imageRetryAttempt(item)) &&
      (attempt === undefined ||
        attempt === 0 ||
        (retryAuthority === activeAuthorityGeneration && item.id === options.activeItem.value?.id))
    );
  }

  function captureSelectedFullSource(
    image: HTMLImageElement,
    item: MediaGalleryItem,
    attempt: number,
  ) {
    if (attempt !== 0 || selectedFullSourceByItem.value[item.id]) return;
    const source = image.currentSrc.trim();
    if (!source) return;
    selectedFullSourceByItem.value = { ...selectedFullSourceByItem.value, [item.id]: source };
  }

  function setImageLoadState(item: MediaGalleryItem, state: ImageLoadState) {
    imageLoadStateByItem.value = { ...imageLoadStateByItem.value, [item.id]: state };
  }

  async function onFullImageLoad(event: Event, item: MediaGalleryItem) {
    const image = event.currentTarget;
    if (!isHTMLImageElement(image) || !shouldMountFull(item)) return;
    const attempt = Number(image.dataset.retryAttempt);
    const retryAuthority = Number(image.dataset.retryAuthority);
    const openGeneration = Number(image.dataset.openCycle);
    const collectionGeneration = Number(image.dataset.itemCollection);
    if (!isCurrent(openGeneration, collectionGeneration, item, attempt, retryAuthority)) return;
    captureSelectedFullSource(image, item, attempt);
    try {
      await image.decode();
    } catch {
      if (isCurrent(openGeneration, collectionGeneration, item, attempt, retryAuthority)) {
        setImageLoadState(item, "failed");
      }
      return;
    }
    if (
      !shouldMountFull(item) ||
      !isCurrent(openGeneration, collectionGeneration, item, attempt, retryAuthority) ||
      !image.complete ||
      image.naturalWidth <= 0 ||
      image.naturalHeight <= 0
    ) {
      return;
    }
    setImageLoadState(item, "loaded");
    if (item.id === options.activeItem.value?.id) {
      await nextTick();
      if (isCurrent(openGeneration, collectionGeneration, item, attempt, retryAuthority)) {
        options.onActiveLoad();
      }
    }
  }

  function onFullImageError(event: Event, item: MediaGalleryItem) {
    const image = event.currentTarget;
    const attempt = isHTMLImageElement(image) ? Number(image.dataset.retryAttempt) : Number.NaN;
    if (
      isHTMLImageElement(image) &&
      shouldMountFull(item) &&
      isCurrent(
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
      isCurrent(Number(image.dataset.openCycle), Number(image.dataset.itemCollection), item)
    ) {
      previewFailedByItem.value = { ...previewFailedByItem.value, [item.id]: true };
    }
  }

  function retryImage() {
    const item = options.activeItem.value;
    if (!item || !shouldMountFull(item)) return;
    const selectedSource = selectedFullSourceByItem.value[item.id];
    if (!selectedSource) return;
    const url = resolveRetryRequestUrl(selectedSource);
    if (!url) return;
    const attempt = imageRetryAttempt(item) + 1;
    retryRequestIdentity += 1;
    url.searchParams.append(
      "snap-motion-retry",
      `${options.openCycleGeneration.value}-${itemCollectionGeneration.value}-${retryRequestIdentity}`,
    );
    retryByItem.value = {
      ...retryByItem.value,
      [item.id]: { attempt, authority: activeAuthorityGeneration, request: url.href },
    };
    setImageLoadState(item, "pending");
  }

  function resetMediaSourceState() {
    imageLoadStateByItem.value = {};
    retryByItem.value = {};
    selectedFullSourceByItem.value = {};
    previewFailedByItem.value = {};
  }

  function beginOpenCycle() {
    activeAuthorityGeneration += 1;
    resetMediaSourceState();
  }

  function replaceCollection() {
    itemCollectionGeneration.value += 1;
    activeAuthorityGeneration += 1;
    resetMediaSourceState();
  }

  watch(
    () => options.activeItem.value?.id,
    (id, previousId) => {
      if (id === previousId) return;
      activeAuthorityGeneration += 1;
      if (!id) return;
      const item = options.items.value.find((candidate) => candidate.id === id);
      if (!item || !selectedFullSourceByItem.value[id]) return;
      retryByItem.value = withoutKey(retryByItem.value, id);
      selectedFullSourceByItem.value = withoutKey(selectedFullSourceByItem.value, id);
      setImageLoadState(item, imageLoadDefault(item));
    },
    { flush: "sync" },
  );

  return {
    activeImageLoadState,
    beginOpenCycle,
    canRetryActiveImage,
    imageLoadState,
    imageRetryAttempt,
    imageRetryAuthority,
    itemCollectionGeneration,
    onFullImageError,
    onFullImageLoad,
    onPreviewImageError,
    previewFailedByItem,
    replaceCollection,
    retryImage,
    shouldMountFull,
    visibleFullSrc,
    visibleFullSrcset,
  };
}

function withoutKey<TValue>(record: Record<string, TValue>, key: string): Record<string, TValue> {
  const remaining = { ...record };
  delete remaining[key];
  return remaining;
}
