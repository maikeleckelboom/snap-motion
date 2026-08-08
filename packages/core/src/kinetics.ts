import { clamp } from "./bounds";
import type { SpringConfiguration } from "./types";

/**
 * Autonomous limits for a settling surface, expressed in cards rather than viewport pixels so the
 * same numbers describe the same felt motion at every card width.
 *
 * These are physical tuning, not visual theme: they bound how violently an unattended spring may
 * travel, which is what keeps a throw readable as one object moving rather than a jump cut.
 */
export const BOUNDED_SPRING_TUNING = {
  /** Cards per second the autonomous phase may never exceed. */
  maximumFreeVelocity: 12,
  /** Cards per second squared the autonomous phase may never exceed. */
  maximumFreeAcceleration: 520,
  /** Release speed below which the limiter is exactly the identity. */
  releaseVelocityKnee: 6.5,
  /** Largest frame delta integrated at once, so a stalled tab cannot teleport the surface. */
  maximumFrameDelta: 0.05,
  /** Fixed integration step. Sub-stepping keeps a stiff spring stable on a slow frame. */
  integrationStep: 1 / 120,
} as const;

/** Explicit mutable storage so a per-frame integrator never allocates. */
export interface MutableSpringState {
  position: number;
  velocity: number;
}

/** Absolute speed in cards per second. Zero whenever the inputs cannot describe a speed. */
export function resolveSpeedInCards(velocityPxPerSecond: number, cardPitchPx: number): number {
  if (!Number.isFinite(velocityPxPerSecond) || !Number.isFinite(cardPitchPx) || cardPitchPx <= 0) {
    return 0;
  }
  return Math.abs(velocityPxPerSecond) / cardPitchPx;
}

/**
 * Keeps low release speeds exact and compresses only the high-speed tail. Target resolution uses
 * the original pointer velocity before this release-only limiter is applied, so a violent flick
 * still selects the destination it earned — it simply may not travel there at an unreadable speed.
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
  const { maximumFreeVelocity, releaseVelocityKnee } = BOUNDED_SPRING_TUNING;
  if (speedInCards <= releaseVelocityKnee) {
    return velocityPxPerSecond;
  }

  const headroom = maximumFreeVelocity - releaseVelocityKnee;
  const excess = speedInCards - releaseVelocityKnee;
  const limitedSpeed = releaseVelocityKnee + headroom * (1 - Math.exp(-excess / headroom));
  return direction * Math.min(maximumFreeVelocity, limitedSpeed) * cardPitchPx;
}

/**
 * Advances the same scalar mass-spring-damper model the controller settles with, under autonomous
 * acceleration and velocity limits expressed in cards. Direct manipulation is deliberately not
 * limited here; only an unattended spring is.
 */
export function advanceBoundedSpring(
  state: MutableSpringState,
  target: number,
  spring: SpringConfiguration,
  cardPitchPx: number,
  deltaTime: number,
): void {
  if (deltaTime <= 0 || cardPitchPx <= 0) {
    return;
  }

  const maximumAcceleration = BOUNDED_SPRING_TUNING.maximumFreeAcceleration * cardPitchPx;
  const maximumVelocity = BOUNDED_SPRING_TUNING.maximumFreeVelocity * cardPitchPx;
  const stepCount = Math.max(1, Math.ceil(deltaTime / BOUNDED_SPRING_TUNING.integrationStep));
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
