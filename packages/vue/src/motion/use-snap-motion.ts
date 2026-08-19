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

export interface UseSnapMotionOptions<Id extends string> extends Omit<
  SnapControllerOptions<Id>,
  "driver" | "onChange" | "reducedMotion"
> {
  axis: "x" | "y" | (() => "x" | "y");
  driver?: AnimationDriver;
  onChange?: (snapshot: ControllerSnapshot<Id>) => void;
  pointerIntent?: "horizontal" | "immediate";
  pointerDeltaMultiplier?: () => number;
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
    onBegin(sample) {
      const current = controller.getSnapshot();
      dragOriginId = resolveDragOrigin?.() ?? current.target?.id ?? current.active?.id;
      controller.beginDrag(dragOriginId === undefined ? {} : { originId: dragOriginId });
      dragOrigin = controller.getSnapshot().position;
      velocityTracker.reset();
      velocityTracker.add(sample.position, sample.time);
    },
    onMove(sample) {
      velocityTracker.add(sample.position, sample.time);
      controller.dragTo(dragOrigin + sample.delta * (pointerDeltaMultiplier?.() ?? 1));
    },
    onEnd(sample) {
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
    },
    onCancel() {
      velocityTracker.reset();
      const originId = dragOriginId;
      dragOriginId = undefined;
      if (originId === undefined) controller.release(0);
      else controller.moveTo(originId, { initialVelocity: 0 });
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
