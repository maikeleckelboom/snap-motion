import { transition } from "@vueuse/core";
import { ref, watch, type ComputedRef, type Ref } from "vue";

import { resolveGalleryVisibleIndex } from "./media-gallery-math";
import { MEDIA_GALLERY_TUNING } from "./media-gallery-tuning";

interface TrackTravel {
  readonly to: number;
  readonly onComplete: () => void;
}

export function useGalleryTrack(options: {
  currentIndex: () => number;
  destinationIndex: () => number | undefined;
  itemCount: () => number;
  pitch: () => number;
  reducedMotion: ComputedRef<boolean>;
  track: Ref<HTMLElement | undefined>;
}) {
  const offset = ref(0);
  const visibleIndex = ref(options.currentIndex());
  let travel: TrackTravel | undefined;

  function renderOffset(value: number) {
    options.track.value?.style.setProperty("--_gallery-track-x", `${value.toFixed(3)}px`);
    visibleIndex.value = resolveGalleryVisibleIndex({
      currentIndex: options.currentIndex(),
      destinationIndex: options.destinationIndex(),
      itemCount: options.itemCount(),
      offset: value,
      pitch: options.pitch(),
      visibleIndex: visibleIndex.value,
    });
  }

  watch(offset, renderOffset, { flush: "sync" });

  function renderAt(value: number) {
    if (offset.value === value) renderOffset(value);
    else offset.value = value;
  }

  function stop() {
    travel = undefined;
  }

  function setOffset(value: number) {
    stop();
    renderAt(value);
  }

  function reset() {
    stop();
    renderAt(0);
    visibleIndex.value = options.currentIndex();
  }

  async function runTravel(current: TrackTravel) {
    await transition(offset, offset.value, current.to, {
      duration: MEDIA_GALLERY_TUNING.trackDuration,
      easing: [0.22, 0.8, 0.2, 1],
      abort: () => travel !== current,
    });
    if (travel !== current) return;
    travel = undefined;
    current.onComplete();
  }

  function animateTo(to: number, onComplete: () => void) {
    stop();
    if (options.reducedMotion.value || Math.abs(to - offset.value) < 0.01) {
      renderAt(to);
      onComplete();
      return;
    }
    const current = { to, onComplete };
    travel = current;
    void runTravel(current);
  }

  watch(
    options.reducedMotion,
    (reduced) => {
      if (!reduced || !travel) return;
      const current = travel;
      stop();
      renderAt(current.to);
      current.onComplete();
    },
    { flush: "sync" },
  );

  return { animateTo, getOffset: () => offset.value, reset, setOffset, stop, visibleIndex };
}
