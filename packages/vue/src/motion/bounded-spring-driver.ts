import {
  advanceBoundedSpring,
  BOUNDED_SPRING_TUNING,
  resolveAutonomousReleaseVelocity,
  type AnimationDriver,
  type MutableSpringState,
  type ScalarAnimationRequest,
} from "@snap-motion/core";
import { useRafFn } from "@vueuse/core";

interface ActiveSpring {
  readonly token: number;
  readonly request: ScalarAnimationRequest;
  readonly pitch: number;
  readonly state: MutableSpringState;
}

/**
 * A driver that integrates the settle itself, under autonomous acceleration and velocity limits
 * expressed in cards.
 *
 * The default Motion driver is unbounded on purpose: a plain rail should honour whatever the
 * release earned. A spatial surface — a coverflow rail, a stacked deck — needs a ceiling instead,
 * because past a few cards per second the frames stop reading as one object moving. The
 * mathematics is framework-neutral; only the frame scheduling is not, which is all this owns.
 */
export function useBoundedSpringDriver(cardPitchPx: () => number): AnimationDriver {
  let token = 0;
  let active: ActiveSpring | undefined;

  const { pause, resume } = useRafFn(
    ({ delta }) => {
      const current = active;
      if (!current) {
        pause();
        return;
      }

      const deltaTime = Math.min(
        Math.max(0, delta / 1_000),
        BOUNDED_SPRING_TUNING.maximumFrameDelta,
      );
      advanceBoundedSpring(
        current.state,
        current.request.to,
        current.request.spring,
        current.pitch,
        deltaTime,
      );

      const distance = Math.abs(current.state.position - current.request.to);
      const speed = Math.abs(current.state.velocity);
      if (
        distance <= current.request.spring.restDistance &&
        speed <= current.request.spring.restSpeed
      ) {
        active = undefined;
        pause();
        current.request.onUpdate(current.request.to, 0);
        current.request.onComplete();
        return;
      }

      current.request.onUpdate(current.state.position, current.state.velocity);
    },
    { immediate: false },
  );

  return {
    animate(request) {
      const previous = active;
      active = undefined;
      if (previous) {
        previous.request.onStop?.();
      }

      const currentToken = ++token;
      const pitch = Math.max(1, cardPitchPx());
      const state = {
        position: request.from,
        velocity: resolveAutonomousReleaseVelocity(request.initialVelocity, pitch, false),
      };
      active = { token: currentToken, request, pitch, state };
      request.onUpdate(state.position, state.velocity);
      resume();

      return {
        stop() {
          const current = active;
          if (!current || current.token !== currentToken) {
            return;
          }
          active = undefined;
          pause();
          request.onStop?.();
        },
      };
    },
  };
}
