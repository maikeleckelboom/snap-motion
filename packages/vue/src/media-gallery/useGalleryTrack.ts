import { useRafFn } from "@vueuse/core";
import { ref, watch, type ComputedRef, type Ref } from "vue";

import { resolveGalleryVisibleIndex } from "./media-gallery-math";
import { MEDIA_GALLERY_TUNING } from "./media-gallery-tuning";

function cubicTrackCoordinate(t: number, first: number, second: number): number {
  const remaining = 1 - t;
  return 3 * remaining * remaining * t * first + 3 * remaining * t * t * second + t * t * t;
}

/** Match the former CSS cubic-bezier(0.22, 0.8, 0.2, 1) travel curve. */
function easeTrack(progress: number): number {
  if (progress <= 0) return 0;
  if (progress >= 1) return 1;

  let lower = 0;
  let upper = 1;
  for (let iteration = 0; iteration < 20; iteration += 1) {
    const t = (lower + upper) / 2;
    if (cubicTrackCoordinate(t, 0.22, 0.2) < progress) lower = t;
    else upper = t;
  }
  return cubicTrackCoordinate((lower + upper) / 2, 0.8, 1);
}

interface TrackTravel {
  readonly from: number;
  readonly to: number;
  readonly onComplete: () => void;
  startedAt?: number;
}

export function useGalleryTrack(options: {
  currentIndex: () => number;
  destinationIndex: () => number | undefined;
  itemCount: () => number;
  pitch: () => number;
  reducedMotion: ComputedRef<boolean>;
  track: Ref<HTMLElement | undefined>;
}) {
  let offset = 0;
  const visibleIndex = ref(options.currentIndex());
  let travel: TrackTravel | undefined;

  function setOffset(value: number) {
    offset = value;
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

  const { pause, resume } = useRafFn(
    ({ timestamp }) => {
      const current = travel;
      if (!current) return;
      current.startedAt ??= timestamp;
      const progress = Math.min(
        1,
        (timestamp - current.startedAt) / MEDIA_GALLERY_TUNING.trackDuration,
      );
      setOffset(current.from + (current.to - current.from) * easeTrack(progress));
      if (progress < 1) return;
      travel = undefined;
      pause();
      current.onComplete();
    },
    { immediate: false },
  );

  function stop() {
    travel = undefined;
    pause();
  }

  function reset() {
    stop();
    setOffset(0);
    visibleIndex.value = options.currentIndex();
  }

  function animateTo(to: number, onComplete: () => void) {
    stop();
    if (options.reducedMotion.value || Math.abs(to - offset) < 0.01) {
      setOffset(to);
      onComplete();
      return;
    }
    travel = { from: offset, to, onComplete };
    resume();
  }

  watch(
    options.reducedMotion,
    (reduced) => {
      if (!reduced || !travel) return;
      const current = travel;
      stop();
      setOffset(current.to);
      current.onComplete();
    },
    { flush: "sync" },
  );

  return { animateTo, getOffset: () => offset, reset, setOffset, stop, visibleIndex };
}
