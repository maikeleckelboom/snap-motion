import { sortAnchors, type ControllerMeasurement } from "@snap-motion/core";
import { computed, isRef, type Ref } from "vue";

import { isSupportedPrimaryPointerStart } from "../internal/input/pointer-policy";
import { useRemeasurement } from "../internal/layout/remeasurement";
import { useSnapMotion, type UseSnapMotionOptions } from "../motion/use-snap-motion";
import type { SnapMotionDirection } from "./carousel-contracts";
import { carouselKeyAction } from "./carousel-keyboard";
import { useHorizontalWheel } from "./carousel-wheel";

const MIN_STEPPED_WHEEL_DELTA = 16;

export interface UseCarouselMotionOptions<Id extends string> extends Omit<
  UseSnapMotionOptions<Id>,
  "axis" | "pointerIntent"
> {
  measure: () => ControllerMeasurement<Id>;
  direction?: SnapMotionDirection | Readonly<Ref<SnapMotionDirection>>;
  onTargetSelected?: (id: Id, reason: "drag" | "wheel") => void;
  track?: Ref<HTMLElement | undefined>;
  viewport: Ref<HTMLElement | undefined>;
  wheelSettleDelay?: number;
}

export function useCarouselMotion<Id extends string>(options: UseCarouselMotionOptions<Id>) {
  const {
    direction = "auto",
    measure,
    onTargetSelected,
    track,
    viewport,
    wheelSettleDelay,
    ...snapOptions
  } = options;

  function resolvedDirection(): "ltr" | "rtl" {
    const requested = isRef(direction) ? direction.value : direction;
    if (requested !== "auto") return requested;
    const surface = viewport.value;
    return surface?.ownerDocument.defaultView?.getComputedStyle(surface).direction === "rtl"
      ? "rtl"
      : "ltr";
  }

  const motion = useSnapMotion({
    ...snapOptions,
    axis: "x",
    pointerIntent: "horizontal",
    pointerDeltaMultiplier: () => (resolvedDirection() === "rtl" ? -1 : 1),
    onReleaseTargetSelected(id) {
      if (id !== undefined) onTargetSelected?.(id, "drag");
    },
  });
  let wheelActive = false;
  let wheelRawPosition = motion.position.value;
  let wheelOriginId: Id | undefined;

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
        // One coalesced burst is one drag, so it resolves its origin exactly like a pointer gesture
        // and receives the same drag envelope.
        wheelOriginId =
          snapOptions.resolveDragOrigin?.() ??
          motion.snapshot.value.target?.id ??
          motion.snapshot.value.active?.id;
        motion.controller.beginDrag(wheelOriginId === undefined ? {} : { originId: wheelOriginId });
        wheelActive = true;
        wheelRawPosition = motion.position.value;
      }
      wheelRawPosition -= delta * (resolvedDirection() === "rtl" ? -1 : 1);
      motion.controller.dragTo(wheelRawPosition);
    },
    onSettle(gesture) {
      if (!wheelActive) {
        return;
      }
      wheelActive = false;
      const originId = wheelOriginId;
      wheelOriginId = undefined;
      let target;

      // High-resolution trackpads emit a burst and retain direct manipulation. A physical wheel
      // notch is commonly one isolated line-sized event. Resolve that notch semantically from the
      // already-requested target so interrupting its spring cannot repeat, skip, or reverse based
      // on how far the previous animation happened to render.
      if (
        gesture.eventCount === 1 &&
        Math.abs(gesture.delta) >= MIN_STEPPED_WHEEL_DELTA &&
        originId !== undefined
      ) {
        const anchors = sortAnchors(motion.snapshot.value.anchors);
        const originIndex = anchors.findIndex((anchor) => anchor.id === originId);
        const logicalDirection =
          Math.sign(gesture.delta) * (resolvedDirection() === "rtl" ? -1 : 1);
        const steppedTarget = originIndex < 0 ? undefined : anchors[originIndex + logicalDirection];
        target = steppedTarget
          ? motion.controller.moveTo(steppedTarget.id, { initialVelocity: 0 })
          : motion.controller.release(0);
      } else {
        target = motion.controller.release(0);
      }
      if (target) onTargetSelected?.(target.id, "wheel");
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

    if (resolvedDirection() === "rtl") {
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
    wheelOriginId = undefined;
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
    direction: computed(resolvedDirection),
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
