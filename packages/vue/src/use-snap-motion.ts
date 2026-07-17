import {
  SnapController,
  VelocityTracker,
  type AnimationDriver,
  type ControllerMeasurement,
  type ControllerSnapshot,
  type SnapControllerOptions,
} from "@snap-motion/core";
import { computed, onScopeDispose, shallowRef, watch, type Ref } from "vue";

import { createMotionDriver } from "./motion-driver";
import { usePointerDrag } from "./pointer-drag";
import { useReducedMotionPreference } from "./reduced-motion";

export interface UseSnapMotionOptions<Id extends string> extends Omit<
  SnapControllerOptions<Id>,
  "driver" | "onChange" | "reducedMotion"
> {
  axis: "x" | "y";
  driver?: AnimationDriver;
  onChange?: (snapshot: ControllerSnapshot<Id>) => void;
  pointerIntent?: "horizontal" | "immediate";
  reducedMotionOverride?: Readonly<Ref<boolean | undefined>>;
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
    reducedMotionOverride,
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

  const pointer = usePointerDrag({
    axis,
    intent: pointerIntent,
    onBegin(sample) {
      controller.beginDrag();
      dragOrigin = controller.getSnapshot().position;
      velocityTracker.reset();
      velocityTracker.add(sample.position, sample.time);
    },
    onMove(sample) {
      velocityTracker.add(sample.position, sample.time);
      controller.dragTo(dragOrigin + sample.delta);
    },
    onEnd(sample) {
      velocityTracker.add(sample.position, sample.time);
      const releaseVelocity = velocityTracker.getVelocity();
      const targetId = resolveReleaseTarget?.({
        controller,
        snapshot: controller.getSnapshot(),
        velocity: releaseVelocity,
      });
      if (targetId === undefined) {
        controller.release(releaseVelocity);
      } else {
        controller.moveTo(targetId, { initialVelocity: releaseVelocity });
      }
    },
    onCancel() {
      velocityTracker.reset();
      controller.release(0);
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

  const activeId = computed(() => snapshot.value.active?.id);
  const targetId = computed(() => snapshot.value.target?.id);
  const phase = computed(() => snapshot.value.phase);
  const position = computed(() => snapshot.value.position);
  const velocity = computed(() => snapshot.value.velocity);
  const isAnimating = computed(() => snapshot.value.isAnimating);

  function remeasure(measurement: ControllerMeasurement<Id>) {
    return controller.remeasure(measurement);
  }

  return {
    activeId,
    configure: controller.configure.bind(controller),
    controller,
    interrupt: () => controller.interrupt(),
    isAnimating,
    isDragging: pointer.isDragging,
    moveBy: controller.moveBy.bind(controller),
    moveTo: controller.moveTo.bind(controller),
    next: controller.next.bind(controller),
    onNativeDragStart: pointer.onNativeDragStart,
    onPointerDown: pointer.onPointerDown,
    phase,
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
