import {
  SnapController,
  VelocityTracker,
  type AnimationDriver,
  type ControllerMeasurement,
  type ControllerSnapshot,
  type SnapControllerOptions,
} from "@snap-motion/core";
import { computed, onScopeDispose, shallowRef, watch, type Ref } from "vue";

import { usePointerDrag } from "../internal/input/pointer-drag";
import { createMotionDriver } from "./motion-driver";
import { useReducedMotionPreference } from "./reduced-motion";

/** Optional two-axis sample from the existing accepted pointer-drag lifecycle. */
export interface PointerMovementSample {
  /** Active scalar-axis displacement since pointer-down. */
  readonly delta: number;
  /** Horizontal displacement since pointer-down. */
  readonly deltaX: number;
  /** Vertical displacement since pointer-down. */
  readonly deltaY: number;
  /** Current coordinate on the active scalar axis. */
  readonly position: number;
  /** Pointer event timestamp. */
  readonly time: number;
  /** Current client X coordinate. */
  readonly x: number;
  /** Current client Y coordinate. */
  readonly y: number;
}

export interface UseSnapMotionOptions<Id extends string> extends Omit<
  SnapControllerOptions<Id>,
  "driver" | "onChange" | "reducedMotion"
> {
  axis: "x" | "y" | (() => "x" | "y");
  driver?: AnimationDriver;
  onChange?: (snapshot: ControllerSnapshot<Id>) => void;
  pointerIntent?: "horizontal" | "immediate";
  pointerDeltaMultiplier?: () => number;
  /** Keeps optional two-axis sampling dormant for surfaces that do not request it. */
  pointerMovementEnabled?: () => boolean;
  /** Publishes accepted direct-manipulation samples without changing scalar controller ownership. */
  onPointerMovement?: (
    phase: "begin" | "move" | "end" | "cancel",
    sample: PointerMovementSample,
    event: PointerEvent,
  ) => void;
  onReleaseTargetSelected?: (id: Id | undefined) => void;
  reducedMotionOverride?: Readonly<Ref<boolean | undefined>>;
  /**
   * Resolves the anchor a new drag is measured from. It is called once when the controller takes
   * physical ownership, so a presentation may also treat it as the start of an interaction
   * transaction. Returning `undefined` keeps the controller's own nearest-anchor default.
   */
  resolveDragOrigin?: () => Id | undefined;
  resolveReleaseTarget?: (context: {
    controller: SnapController<Id>;
    snapshot: ControllerSnapshot<Id>;
    velocity: number;
  }) => Id | undefined;
}

export function useSnapMotion<Id extends string>(options: UseSnapMotionOptions<Id>) {
  const {
    axis,
    driver = createMotionDriver(),
    onChange,
    pointerIntent = "immediate",
    pointerDeltaMultiplier,
    pointerMovementEnabled,
    onPointerMovement,
    onReleaseTargetSelected,
    reducedMotionOverride,
    resolveDragOrigin,
    resolveReleaseTarget,
    ...controllerOptions
  } = options;
  const reducedMotion = useReducedMotionPreference(
    reducedMotionOverride ? { override: reducedMotionOverride } : {},
  );

  let pendingSnapshot: ControllerSnapshot<Id> | undefined;
  let publishSnapshot = (nextSnapshot: ControllerSnapshot<Id>) => {
    pendingSnapshot = nextSnapshot;
  };

  const controller = new SnapController<Id>({
    ...controllerOptions,
    driver,
    reducedMotion: reducedMotion.value,
    onChange(nextSnapshot) {
      publishSnapshot(nextSnapshot);
      onChange?.(nextSnapshot);
    },
  });
  const snapshot = shallowRef<ControllerSnapshot<Id>>(pendingSnapshot ?? controller.getSnapshot());
  publishSnapshot = (nextSnapshot) => {
    snapshot.value = nextSnapshot;
  };

  const velocityTracker = new VelocityTracker();
  let dragOrigin = snapshot.value.position;
  let dragOriginId: Id | undefined;

  const pointer = usePointerDrag({
    axis,
    intent: pointerIntent,
    onBegin(sample, event) {
      const current = controller.getSnapshot();
      dragOriginId = resolveDragOrigin?.() ?? current.target?.id ?? current.active?.id;
      controller.beginDrag(dragOriginId === undefined ? {} : { originId: dragOriginId });
      dragOrigin = controller.getSnapshot().position;
      velocityTracker.reset();
      velocityTracker.add(sample.position, sample.time);
      if (pointerMovementEnabled?.() ?? false) onPointerMovement?.("begin", sample, event);
    },
    onMove(sample, event) {
      velocityTracker.add(sample.position, sample.time);
      controller.dragTo(dragOrigin + sample.delta * (pointerDeltaMultiplier?.() ?? 1));
      if (pointerMovementEnabled?.() ?? false) onPointerMovement?.("move", sample, event);
    },
    onEnd(sample, event) {
      velocityTracker.add(sample.position, sample.time);
      const releaseVelocity = velocityTracker.getVelocity() * (pointerDeltaMultiplier?.() ?? 1);
      const targetId = resolveReleaseTarget?.({
        controller,
        snapshot: controller.getSnapshot(),
        velocity: releaseVelocity,
      });
      if (targetId === undefined) {
        const target = controller.release(releaseVelocity);
        dragOriginId = undefined;
        onReleaseTargetSelected?.(target?.id);
      } else {
        const target = controller.moveTo(targetId, { initialVelocity: releaseVelocity });
        dragOriginId = undefined;
        onReleaseTargetSelected?.(target?.id);
      }
      if (pointerMovementEnabled?.() ?? false) onPointerMovement?.("end", sample, event);
    },
    onCancel(sample, event) {
      velocityTracker.reset();
      const originId = dragOriginId;
      dragOriginId = undefined;
      if (originId === undefined) controller.release(0);
      else controller.moveTo(originId, { initialVelocity: 0 });
      if (pointerMovementEnabled?.() ?? false) onPointerMovement?.("cancel", sample, event);
    },
  });

  const stopReducedMotionWatch = watch(
    reducedMotion,
    (isReduced) => controller.setReducedMotion(isReduced),
    { immediate: true },
  );

  onScopeDispose(() => {
    stopReducedMotionWatch();
    velocityTracker.reset();
    controller.dispose();
  });

  const nearestId = computed(() => snapshot.value.active?.id);
  const targetId = computed(() => snapshot.value.target?.id);
  const phase = computed(() => snapshot.value.phase);
  const position = computed(() => snapshot.value.position);
  const velocity = computed(() => snapshot.value.velocity);
  const isAnimating = computed(() => snapshot.value.isAnimating);

  function remeasure(measurement: ControllerMeasurement<Id>) {
    return controller.remeasure(measurement);
  }

  return {
    configure: controller.configure.bind(controller),
    controller,
    interrupt: () => {
      dragOriginId = undefined;
      pointer.stop();
      controller.interrupt();
    },
    isAnimating,
    isDragging: pointer.isDragging,
    moveBy: controller.moveBy.bind(controller),
    moveTo: controller.moveTo.bind(controller),
    nearestId,
    next: controller.next.bind(controller),
    onNativeDragStart: pointer.onNativeDragStart,
    onPointerDown: pointer.onPointerDown,
    phase,
    pointerInteractionActive: pointer.pointerInteractionActive,
    pointerIntent: pointer.pointerIntent,
    pointerOwned: pointer.pointerOwned,
    position,
    previous: controller.previous.bind(controller),
    reducedMotion,
    remeasure,
    snapshot,
    targetId,
    velocity,
  };
}
