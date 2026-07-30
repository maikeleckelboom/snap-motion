import type {
  AnimationDriver,
  ControllerPhase,
  ScalarAnimationRequest,
  SpringConfiguration,
} from "@snap-motion/core";
import { useRafFn } from "@vueuse/core";

export const COVERFLOW_MOTION_TUNING = {
  kineticStartSpeed: 1.5,
  kineticFullSpeed: 5.5,
  centerInnerRadius: 0.08,
  centerOuterRadius: 0.42,
  maximumKineticScaleLoss: 0.014,
  maximumKineticRecess: 16,
  maximumKineticYaw: 1.5,
  maximumShadowAttenuation: 0.55,
  settledSpeedStart: 0.75,
  settledSpeedEnd: 2.5,
  maximumFreeVelocity: 12,
  maximumFreeAcceleration: 520,
  releaseVelocityKnee: 6.5,
  dragHysteresis: 0.07,
  semanticAuthorityRadius: 0.28,
  semanticAuthoritySpeed: 2.5,
  maximumFrameDelta: 0.05,
  integrationStep: 1 / 120,
} as const;

export interface CoverflowKineticState {
  speedInCards: number;
  centerInfluence: number;
  kinetic: number;
  kineticFocus: number;
  settledness: number;
  scaleLoss: number;
  recess: number;
  retainedYaw: number;
  contactShadowStrength: number;
}

export interface MutableSpringState {
  position: number;
  velocity: number;
}

interface ActiveSpring {
  readonly token: number;
  readonly request: ScalarAnimationRequest;
  readonly pitch: number;
  readonly state: MutableSpringState;
}

interface SemanticUpdate {
  readonly phase: ControllerPhase;
  readonly physicalIndex: number;
  readonly targetIndex: number | null;
  readonly activeIndex: number;
  readonly speedInCards: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function smoothstep(minimum: number, maximum: number, value: number): number {
  if (maximum <= minimum) {
    return value < minimum ? 0 : 1;
  }
  const normalized = clamp((value - minimum) / (maximum - minimum), 0, 1);
  return normalized * normalized * (3 - 2 * normalized);
}

export function resolveSpeedInCards(velocityPxPerSecond: number, cardPitchPx: number): number {
  if (!Number.isFinite(velocityPxPerSecond) || !Number.isFinite(cardPitchPx) || cardPitchPx <= 0) {
    return 0;
  }
  return Math.abs(velocityPxPerSecond) / cardPitchPx;
}

/**
 * Resolves visual commitment without changing horizontal position. The caller supplies a reusable
 * output object so the per-card frame path does not need another allocation.
 */
export function resolveCoverflowKinetics(
  relativePosition: number,
  velocityPxPerSecond: number,
  cardPitchPx: number,
  output: CoverflowKineticState,
): CoverflowKineticState {
  const speedInCards = resolveSpeedInCards(velocityPxPerSecond, cardPitchPx);
  const kinetic = smoothstep(
    COVERFLOW_MOTION_TUNING.kineticStartSpeed,
    COVERFLOW_MOTION_TUNING.kineticFullSpeed,
    speedInCards,
  );
  const centerInfluence =
    1 -
    smoothstep(
      COVERFLOW_MOTION_TUNING.centerInnerRadius,
      COVERFLOW_MOTION_TUNING.centerOuterRadius,
      Math.abs(relativePosition),
    );
  const kineticFocus = kinetic * centerInfluence;
  const settledness =
    1 -
    smoothstep(
      COVERFLOW_MOTION_TUNING.settledSpeedStart,
      COVERFLOW_MOTION_TUNING.settledSpeedEnd,
      speedInCards,
    );

  output.speedInCards = speedInCards;
  output.centerInfluence = centerInfluence;
  output.kinetic = kinetic;
  output.kineticFocus = kineticFocus;
  output.settledness = settledness;
  output.scaleLoss = COVERFLOW_MOTION_TUNING.maximumKineticScaleLoss * kineticFocus;
  output.recess = COVERFLOW_MOTION_TUNING.maximumKineticRecess * kineticFocus;
  output.retainedYaw =
    Math.sign(velocityPxPerSecond) * COVERFLOW_MOTION_TUNING.maximumKineticYaw * kineticFocus;
  output.contactShadowStrength =
    centerInfluence *
    settledness *
    (1 - COVERFLOW_MOTION_TUNING.maximumShadowAttenuation * kineticFocus);
  return output;
}

/**
 * Keeps low release speeds exact and compresses only the high-speed tail. Target resolution uses
 * the original pointer velocity before this release-only limiter is applied.
 */
export function resolveAutonomousReleaseVelocity(
  velocityPxPerSecond: number,
  cardPitchPx: number,
  isDragging: boolean,
): number {
  if (isDragging || !Number.isFinite(velocityPxPerSecond) || cardPitchPx <= 0) {
    return velocityPxPerSecond;
  }

  const direction = Math.sign(velocityPxPerSecond);
  const speedInCards = resolveSpeedInCards(velocityPxPerSecond, cardPitchPx);
  const { maximumFreeVelocity, releaseVelocityKnee } = COVERFLOW_MOTION_TUNING;
  if (speedInCards <= releaseVelocityKnee) {
    return velocityPxPerSecond;
  }

  const headroom = maximumFreeVelocity - releaseVelocityKnee;
  const excess = speedInCards - releaseVelocityKnee;
  const limitedSpeed = releaseVelocityKnee + headroom * (1 - Math.exp(-excess / headroom));
  return direction * Math.min(maximumFreeVelocity, limitedSpeed) * cardPitchPx;
}

/**
 * Advances the same scalar mass-spring-damper model used by the rest of the lab, with autonomous
 * acceleration and velocity limits expressed in cards rather than viewport pixels.
 */
export function advanceBoundedCoverflowSpring(
  state: MutableSpringState,
  target: number,
  spring: SpringConfiguration,
  cardPitchPx: number,
  deltaTime: number,
): void {
  if (deltaTime <= 0 || cardPitchPx <= 0) {
    return;
  }

  const maximumAcceleration = COVERFLOW_MOTION_TUNING.maximumFreeAcceleration * cardPitchPx;
  const maximumVelocity = COVERFLOW_MOTION_TUNING.maximumFreeVelocity * cardPitchPx;
  const stepCount = Math.max(1, Math.ceil(deltaTime / COVERFLOW_MOTION_TUNING.integrationStep));
  const step = deltaTime / stepCount;

  for (let index = 0; index < stepCount; index += 1) {
    const springForce = -spring.stiffness * (state.position - target);
    const dampingForce = -spring.damping * state.velocity;
    const acceleration = clamp(
      (springForce + dampingForce) / spring.mass,
      -maximumAcceleration,
      maximumAcceleration,
    );
    state.velocity = clamp(state.velocity + acceleration * step, -maximumVelocity, maximumVelocity);
    state.position += state.velocity * step;
  }
}

export function useBoundedCoverflowDriver(cardPitchPx: () => number): AnimationDriver {
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
        COVERFLOW_MOTION_TUNING.maximumFrameDelta,
      );
      advanceBoundedCoverflowSpring(
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

function resolveHystereticIndex(
  physicalIndex: number,
  currentIndex: number,
  itemCount: number,
): number {
  let nextIndex = clamp(currentIndex, 0, Math.max(0, itemCount - 1));
  const boundary = 0.5 + COVERFLOW_MOTION_TUNING.dragHysteresis;

  while (nextIndex < itemCount - 1 && physicalIndex >= nextIndex + boundary) {
    nextIndex += 1;
  }
  while (nextIndex > 0 && physicalIndex <= nextIndex - boundary) {
    nextIndex -= 1;
  }
  return nextIndex;
}

export class CoverflowSemanticCommitment {
  committedIndex: number;
  pendingTargetIndex: number | null = null;

  readonly #itemCount: number;
  #lastAnnouncedIndex: number;
  #settlingTargetIndex: number | null = null;

  constructor(initialIndex: number, itemCount: number) {
    this.#itemCount = Math.max(1, itemCount);
    this.committedIndex = clamp(initialIndex, 0, this.#itemCount - 1);
    this.#lastAnnouncedIndex = this.committedIndex;
  }

  /**
   * Returns the index to announce only when an autonomous settle completes. Drag feedback and
   * intermediate cards never write to the live region.
   */
  update(input: SemanticUpdate): number | null {
    if (input.phase === "dragging") {
      this.pendingTargetIndex = null;
      this.#settlingTargetIndex = null;
      this.committedIndex = resolveHystereticIndex(
        input.physicalIndex,
        this.committedIndex,
        this.#itemCount,
      );
      return null;
    }

    if (input.phase === "settling") {
      if (input.targetIndex !== null && input.targetIndex !== this.#settlingTargetIndex) {
        this.#settlingTargetIndex = input.targetIndex;
        this.pendingTargetIndex = input.targetIndex;
      }

      if (this.pendingTargetIndex !== null) {
        const destinationHasAuthority =
          Math.abs(input.physicalIndex - this.pendingTargetIndex) <=
            COVERFLOW_MOTION_TUNING.semanticAuthorityRadius &&
          input.speedInCards <= COVERFLOW_MOTION_TUNING.semanticAuthoritySpeed;
        if (destinationHasAuthority) {
          this.committedIndex = this.pendingTargetIndex;
        }
      }
      return null;
    }

    this.pendingTargetIndex = null;
    this.#settlingTargetIndex = null;
    this.committedIndex = clamp(input.activeIndex, 0, this.#itemCount - 1);
    if (this.committedIndex === this.#lastAnnouncedIndex) {
      return null;
    }

    this.#lastAnnouncedIndex = this.committedIndex;
    return this.committedIndex;
  }
}
