import { useEventListener, useResizeObserver } from "@vueuse/core";
import { animate } from "motion";
import {
  computed,
  onBeforeUnmount,
  shallowRef,
  toValue,
  watch,
  type CSSProperties,
  type MaybeRefOrGetter,
  type Ref,
} from "vue";

import {
  fittedMediaTransform,
  mediaTransformLimits,
  type MediaPoint,
  type MediaSize,
  type MediaTransform,
  type MediaTransformContext,
} from "./media-transform-contracts";
import {
  constrainMediaTransform,
  interpolateMediaTransform,
  isFittedMediaTransform,
  panMediaTransform,
  zoomMediaTransform,
} from "./media-transform-math";

interface PlaybackControls {
  stop: () => void;
}

interface TransformCommitOptions {
  animated?: boolean;
}

export interface UseMediaTransformOptions {
  enabled: MaybeRefOrGetter<boolean>;
  intrinsicSize: MaybeRefOrGetter<MediaSize>;
  reducedMotion: MaybeRefOrGetter<boolean>;
  surface: Ref<HTMLElement | undefined>;
}

const zoomStep = 0.5;
const keyboardPanStep = 48;
const zoomAnimationDuration = 0.2;

function isInteractiveTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest("button, input, select, textarea, video, audio, a[href]") !== null
  );
}

export function useMediaTransform(options: UseMediaTransformOptions) {
  const transform = shallowRef<MediaTransform>({ ...fittedMediaTransform });
  const isAnimating = shallowRef(false);
  const isPanning = shallowRef(false);
  let animation: PlaybackControls | undefined;
  let animationTarget: MediaTransform | undefined;
  let activePointerId: number | undefined;
  let previousPointer: MediaPoint | undefined;

  const enabled = computed(() => toValue(options.enabled));
  const reducedMotion = computed(() => toValue(options.reducedMotion));
  const intrinsicSize = computed(() => toValue(options.intrinsicSize));
  const isZoomed = computed(() => !isFittedMediaTransform(transform.value));
  const canZoomIn = computed(
    () => enabled.value && transform.value.scale < mediaTransformLimits.maxScale - 0.001,
  );
  const canZoomOut = computed(
    () => enabled.value && transform.value.scale > mediaTransformLimits.minScale + 0.001,
  );
  const scalePercentage = computed(() => Math.round(transform.value.scale * 100));
  const transformStyle = computed<CSSProperties>(() => ({
    transform: `translate3d(${transform.value.x.toFixed(3)}px, ${transform.value.y.toFixed(3)}px, 0) scale(${transform.value.scale.toFixed(4)})`,
    transformOrigin: "center",
    willChange: isAnimating.value || isPanning.value ? "transform" : "auto",
  }));

  function context(): MediaTransformContext {
    return {
      intrinsicSize: intrinsicSize.value,
      viewportSize: {
        height: options.surface.value?.clientHeight ?? 0,
        width: options.surface.value?.clientWidth ?? 0,
      },
    };
  }

  function stopAnimation() {
    animation?.stop();
    animation = undefined;
    animationTarget = undefined;
    isAnimating.value = false;
  }

  function commit(target: MediaTransform, commitOptions: TransformCommitOptions = {}) {
    stopAnimation();
    const constrained = constrainMediaTransform(target, context());
    if (reducedMotion.value || commitOptions.animated === false) {
      transform.value = constrained;
      return;
    }

    const from = transform.value;
    animationTarget = constrained;
    isAnimating.value = true;
    animation = animate(0, 1, {
      duration: zoomAnimationDuration,
      ease: [0.22, 0.8, 0.2, 1],
      onComplete() {
        transform.value = constrained;
        animation = undefined;
        animationTarget = undefined;
        isAnimating.value = false;
      },
      onUpdate(progress) {
        transform.value = interpolateMediaTransform(from, constrained, progress);
      },
    });
  }

  function focalPoint(event: Pick<MouseEvent, "clientX" | "clientY">): MediaPoint {
    const rect = options.surface.value?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: event.clientX - rect.left - rect.width / 2,
      y: event.clientY - rect.top - rect.height / 2,
    };
  }

  function zoomTo(scale: number, point: MediaPoint = { x: 0, y: 0 }, animated = true) {
    if (!enabled.value) return;
    commit(zoomMediaTransform(transform.value, scale, point, context()), { animated });
  }

  function zoomIn() {
    zoomTo((animationTarget?.scale ?? transform.value.scale) + zoomStep);
  }

  function zoomOut() {
    zoomTo((animationTarget?.scale ?? transform.value.scale) - zoomStep);
  }

  function reset({ animated = true }: TransformCommitOptions = {}) {
    commit({ ...fittedMediaTransform }, { animated });
  }

  function panBy(delta: MediaPoint) {
    if (!enabled.value || !isZoomed.value) return;
    stopAnimation();
    transform.value = panMediaTransform(transform.value, delta, context());
  }

  function onPointerDown(event: PointerEvent): boolean {
    if (
      !enabled.value ||
      !isZoomed.value ||
      event.button !== 0 ||
      isInteractiveTarget(event.target)
    ) {
      return false;
    }

    stopAnimation();
    activePointerId = event.pointerId;
    previousPointer = { x: event.clientX, y: event.clientY };
    isPanning.value = true;
    options.surface.value?.setPointerCapture?.(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
    return true;
  }

  function onPointerMove(event: PointerEvent) {
    if (event.pointerId !== activePointerId || !previousPointer) return;
    const nextPointer = { x: event.clientX, y: event.clientY };
    panBy({
      x: nextPointer.x - previousPointer.x,
      y: nextPointer.y - previousPointer.y,
    });
    previousPointer = nextPointer;
    event.preventDefault();
    event.stopPropagation();
  }

  function endPointerPan(event?: PointerEvent) {
    if (event && event.pointerId !== activePointerId) return;
    if (
      activePointerId !== undefined &&
      options.surface.value?.hasPointerCapture?.(activePointerId)
    ) {
      options.surface.value.releasePointerCapture(activePointerId);
    }
    activePointerId = undefined;
    previousPointer = undefined;
    isPanning.value = false;
  }

  function onWheel(event: WheelEvent): boolean {
    if (!enabled.value || event.deltaY === 0) return false;
    const delta =
      event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? event.deltaY * 16
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? event.deltaY * (options.surface.value?.clientHeight ?? 1)
          : event.deltaY;
    const scale = transform.value.scale * Math.exp(-delta * 0.0015);
    event.preventDefault();
    event.stopPropagation();
    zoomTo(scale, focalPoint(event), false);
    return true;
  }

  function onDoubleClick(event: MouseEvent): boolean {
    if (!enabled.value || isInteractiveTarget(event.target)) return false;
    event.preventDefault();
    event.stopPropagation();
    zoomTo(isZoomed.value ? 1 : 2, focalPoint(event));
    return true;
  }

  function onKeyDown(event: KeyboardEvent): boolean {
    if (!enabled.value || isInteractiveTarget(event.target)) return false;

    if (event.key === "+" || event.key === "=") {
      zoomIn();
    } else if (event.key === "-") {
      zoomOut();
    } else if (event.key === "0") {
      reset();
    } else if (isZoomed.value && event.key === "ArrowLeft") {
      panBy({ x: keyboardPanStep, y: 0 });
    } else if (isZoomed.value && event.key === "ArrowRight") {
      panBy({ x: -keyboardPanStep, y: 0 });
    } else if (isZoomed.value && event.key === "ArrowUp") {
      panBy({ x: 0, y: keyboardPanStep });
    } else if (isZoomed.value && event.key === "ArrowDown") {
      panBy({ x: 0, y: -keyboardPanStep });
    } else {
      return false;
    }

    event.preventDefault();
    event.stopPropagation();
    return true;
  }

  useEventListener("pointermove", onPointerMove, { passive: false });
  useEventListener("pointerup", endPointerPan);
  useEventListener("pointercancel", endPointerPan);
  useEventListener(options.surface, "lostpointercapture", endPointerPan);
  useEventListener("blur", () => endPointerPan());
  useResizeObserver(options.surface, () => {
    transform.value = constrainMediaTransform(transform.value, context());
  });

  watch([enabled, intrinsicSize], ([isEnabled]) => {
    if (!isEnabled) {
      reset({ animated: false });
      return;
    }
    transform.value = constrainMediaTransform(transform.value, context());
  });

  onBeforeUnmount(() => {
    stopAnimation();
    endPointerPan();
  });

  return {
    canZoomIn,
    canZoomOut,
    isAnimating,
    isPanning,
    isZoomed,
    onDoubleClick,
    onKeyDown,
    onPointerDown,
    onWheel,
    panBy,
    reset,
    scalePercentage,
    transform,
    transformStyle,
    zoomIn,
    zoomOut,
    zoomTo,
  };
}
