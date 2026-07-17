import type {
  AnimationDriver,
  AnimationPlaybackControls,
  ScalarAnimationRequest,
} from "@snap-motion/core";
import { animate, motionValue } from "motion";

interface MotionControls {
  stop: () => void;
}

interface MotionSpringOptions {
  damping: number;
  mass: number;
  onComplete: () => void;
  restDelta: number;
  restSpeed: number;
  stiffness: number;
  type: "spring";
  velocity: number;
}

export interface NumericMotionValueAdapter {
  animateTo: (target: number, options: MotionSpringOptions) => MotionControls;
  destroy: () => void;
  getVelocity: () => number;
  onChange: (listener: (value: number) => void) => () => void;
}

export type NumericMotionValueFactory = (initialValue: number) => NumericMotionValueAdapter;

const defaultMotionValueFactory: NumericMotionValueFactory = (initialValue) => {
  const value = motionValue(initialValue);

  return {
    animateTo(target, options) {
      return animate(value, target, options);
    },
    destroy() {
      value.destroy();
    },
    getVelocity() {
      return value.getVelocity();
    },
    onChange(listener) {
      return value.on("change", listener);
    },
  };
};

export function createMotionDriver(
  createMotionValue: NumericMotionValueFactory = defaultMotionValueFactory,
): AnimationDriver {
  return {
    animate(request: ScalarAnimationRequest): AnimationPlaybackControls {
      const value = createMotionValue(request.from);
      let cleaned = false;
      let finished = false;
      let controls: MotionControls | undefined;

      const unsubscribe = value.onChange((position) => {
        if (!finished) {
          request.onUpdate(position, value.getVelocity());
        }
      });

      function cleanup() {
        if (cleaned) {
          return;
        }
        cleaned = true;
        unsubscribe();
        value.destroy();
      }

      function stop() {
        if (finished) {
          return;
        }

        finished = true;
        try {
          controls?.stop();
        } finally {
          cleanup();
          request.onStop?.();
        }
      }

      try {
        controls = value.animateTo(request.to, {
          type: "spring",
          stiffness: request.spring.stiffness,
          damping: request.spring.damping,
          mass: request.spring.mass,
          restSpeed: request.spring.restSpeed,
          restDelta: request.spring.restDistance,
          velocity: request.initialVelocity,
          onComplete() {
            if (finished) {
              return;
            }

            finished = true;
            try {
              request.onUpdate(request.to, 0);
            } finally {
              cleanup();
            }
            request.onComplete();
          },
        });
      } catch (error) {
        finished = true;
        cleanup();
        throw error;
      }

      return { stop };
    },
  };
}
