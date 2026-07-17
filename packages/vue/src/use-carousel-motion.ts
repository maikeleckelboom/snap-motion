import { sortAnchors, type ControllerMeasurement } from "@snap-motion/core";
import { computed, type Ref } from "vue";

import { carouselKeyAction, isSupportedPrimaryPointerStart } from "./input-policy";
import { useRemeasurement } from "./remeasurement";
import { useSnapMotion, type UseSnapMotionOptions } from "./use-snap-motion";
import { useHorizontalWheel } from "./wheel";

export interface UseCarouselMotionOptions<Id extends string> extends Omit<
  UseSnapMotionOptions<Id>,
  "axis" | "pointerIntent"
> {
  measure: () => ControllerMeasurement<Id>;
  track?: Ref<HTMLElement | undefined>;
  viewport: Ref<HTMLElement | undefined>;
  wheelSettleDelay?: number;
}

export function useCarouselMotion<Id extends string>(options: UseCarouselMotionOptions<Id>) {
  const { measure, track, viewport, wheelSettleDelay, ...snapOptions } = options;
  const motion = useSnapMotion({
    ...snapOptions,
    axis: "x",
    pointerIntent: "horizontal",
  });
  let wheelActive = false;
  let wheelRawPosition = motion.position.value;

  function remeasure() {
    const measurement = measure();
    const semanticId = motion.snapshot.value.target?.id ?? motion.snapshot.value.active?.id;
    const preservesSemanticId =
      semanticId !== undefined && measurement.anchors.some((anchor) => anchor.id === semanticId);

    const target = motion.remeasure({
      ...measurement,
      ...(preservesSemanticId ? { activeId: semanticId } : {}),
    });
    if (wheelActive) {
      wheelRawPosition = motion.position.value;
    }
    return target;
  }

  useRemeasurement({
    target: viewport,
    measure: remeasure,
    ...(track ? { additionalTargets: [track] } : {}),
  });

  const wheel = useHorizontalWheel({
    pageSize: () => Math.max(1, viewport.value?.clientWidth ?? 1),
    ...(wheelSettleDelay === undefined ? {} : { settleDelay: wheelSettleDelay }),
    disabled: () => motion.isDragging.value,
    onDelta(delta) {
      if (!wheelActive) {
        motion.controller.beginDrag();
        wheelActive = true;
        wheelRawPosition = motion.position.value;
      }
      wheelRawPosition -= delta;
      motion.controller.dragTo(wheelRawPosition);
    },
    onSettle() {
      if (!wheelActive) {
        return;
      }
      wheelActive = false;
      motion.controller.release(0);
    },
  });

  const orderedAnchors = computed(() => sortAnchors(motion.snapshot.value.anchors));
  const semanticAnchor = computed(
    () => motion.snapshot.value.target ?? motion.snapshot.value.active,
  );
  const canPrevious = computed(() => {
    const current = semanticAnchor.value;
    const first = orderedAnchors.value[0];
    return Boolean(current && first && current.order > first.order);
  });
  const canNext = computed(() => {
    const current = semanticAnchor.value;
    const last = orderedAnchors.value.at(-1);
    return Boolean(current && last && current.order < last.order);
  });

  function onKeyDown(event: KeyboardEvent) {
    let action = carouselKeyAction(event);
    if (!action) {
      return;
    }

    const direction = viewport.value
      ? viewport.value.ownerDocument.defaultView?.getComputedStyle(viewport.value).direction
      : "ltr";
    if (direction === "rtl") {
      if (action === "previous") action = "next";
      else if (action === "next") action = "previous";
    }

    const anchors = orderedAnchors.value;
    const target = action === "home" ? anchors[0] : anchors.at(-1);
    const current = semanticAnchor.value;
    const canHandle =
      (action === "previous" && canPrevious.value) ||
      (action === "next" && canNext.value) ||
      ((action === "home" || action === "end") &&
        target !== undefined &&
        target.id !== current?.id);
    if (!canHandle) {
      return;
    }
    event.preventDefault();
    wheel.stopWheel();
    wheelActive = false;

    if (action === "previous") {
      motion.previous();
    } else if (action === "next") {
      motion.next();
    } else if (target) {
      motion.moveTo(target.id);
    }
  }

  function stopWheelGesture() {
    wheel.stopWheel();
    wheelActive = false;
    wheelRawPosition = motion.position.value;
  }

  function onPointerDown(event: PointerEvent) {
    if (
      wheelActive &&
      isSupportedPrimaryPointerStart(event) &&
      event.currentTarget instanceof HTMLElement
    ) {
      stopWheelGesture();
      motion.controller.interrupt();
    }
    motion.onPointerDown(event);
  }

  function interrupt(...args: Parameters<typeof motion.interrupt>) {
    stopWheelGesture();
    return motion.interrupt(...args);
  }

  function moveBy(...args: Parameters<typeof motion.moveBy>) {
    stopWheelGesture();
    return motion.moveBy(...args);
  }

  function moveTo(...args: Parameters<typeof motion.moveTo>) {
    stopWheelGesture();
    return motion.moveTo(...args);
  }

  function next(...args: Parameters<typeof motion.next>) {
    stopWheelGesture();
    return motion.next(...args);
  }

  function previous(...args: Parameters<typeof motion.previous>) {
    stopWheelGesture();
    return motion.previous(...args);
  }

  const trackStyle = computed(() => ({
    transform: `translate3d(${motion.position.value}px, 0, 0)`,
    willChange: motion.isAnimating.value || motion.isDragging.value ? "transform" : "auto",
  }));

  return {
    ...motion,
    canNext,
    canPrevious,
    isWheeling: wheel.isWheeling,
    interrupt,
    moveBy,
    moveTo,
    next,
    onKeyDown,
    onPointerDown,
    onWheel: wheel.onWheel,
    previous,
    remeasure,
    surfaceStyle: { touchAction: "pan-y" },
    trackStyle,
  };
}
