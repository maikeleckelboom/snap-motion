import {
  resolveCoverflowPresentation,
  resolveReleaseTarget,
  type SpringConfiguration,
} from "@snap-motion/core";
import { describe, expect, it } from "vitest";

import {
  advanceBoundedCoverflowSpring,
  COVERFLOW_MOTION_TUNING,
  CoverflowSemanticCommitment,
  resolveAutonomousReleaseVelocity,
  resolveCoverflowKinetics,
  type CoverflowKineticState,
  type MutableSpringState,
} from "../src/demos/coverflowMotion";

const CARD_PITCH = 300;
const BALANCED_SPRING: SpringConfiguration = {
  stiffness: 400,
  damping: 36,
  mass: 0.85,
  restSpeed: 10,
  restDistance: 0.6,
};

function kineticState(
  relativePosition: number,
  velocityPxPerSecond: number,
): CoverflowKineticState {
  return resolveCoverflowKinetics(relativePosition, velocityPxPerSecond, CARD_PITCH, {
    speedInCards: 0,
    centerInfluence: 0,
    kinetic: 0,
    kineticFocus: 0,
    settledness: 0,
    scaleLoss: 0,
    recess: 0,
    retainedYaw: 0,
    contactShadowStrength: 0,
  });
}

function advanceUnboundedSpring(
  state: MutableSpringState,
  target: number,
  deltaTime: number,
): void {
  const stepCount = Math.max(1, Math.ceil(deltaTime / COVERFLOW_MOTION_TUNING.integrationStep));
  const step = deltaTime / stepCount;
  for (let index = 0; index < stepCount; index += 1) {
    const springForce = -BALANCED_SPRING.stiffness * (state.position - target);
    const dampingForce = -BALANCED_SPRING.damping * state.velocity;
    state.velocity += ((springForce + dampingForce) / BALANCED_SPRING.mass) * step;
    state.position += state.velocity * step;
  }
}

function simulateSettle(cardDistance: number, bounded: boolean) {
  const state = { position: 0, velocity: 0 };
  const target = -cardDistance * CARD_PITCH;
  const frame = 1 / 120;
  let elapsed = 0;
  let maximumSpeed = 0;
  let authorityTime: number | null = null;

  while (
    elapsed < 3 &&
    (Math.abs(state.position - target) > BALANCED_SPRING.restDistance ||
      Math.abs(state.velocity) > BALANCED_SPRING.restSpeed)
  ) {
    if (bounded) {
      advanceBoundedCoverflowSpring(state, target, BALANCED_SPRING, CARD_PITCH, frame);
    } else {
      advanceUnboundedSpring(state, target, frame);
    }
    maximumSpeed = Math.max(maximumSpeed, Math.abs(state.velocity));
    elapsed += frame;
    if (
      authorityTime === null &&
      Math.abs(state.position - target) <=
        COVERFLOW_MOTION_TUNING.semanticAuthorityRadius * CARD_PITCH &&
      Math.abs(state.velocity) / CARD_PITCH <= COVERFLOW_MOTION_TUNING.semanticAuthoritySpeed
    ) {
      authorityTime = elapsed;
    }
  }

  return { authorityTime, elapsed, maximumSpeed, state };
}

describe("Coverflow kinetic focus", () => {
  it("is zero at zero velocity and preserves the exact resting card pose", () => {
    const presentation = resolveCoverflowPresentation({ progress: 0 });
    const kinetic = kineticState(0, 0);

    expect(kinetic.kineticFocus).toBe(0);
    expect(presentation.scale - kinetic.scaleLoss).toBe(presentation.scale);
    expect(presentation.translateZ - kinetic.recess).toBe(presentation.translateZ);
    expect(presentation.rotateY + kinetic.retainedYaw).toBe(presentation.rotateY);
    expect(kinetic.contactShadowStrength).toBe(1);
  });

  it("is approximately zero away from center", () => {
    expect(kineticState(0.7, CARD_PITCH * 8).kineticFocus).toBe(0);
  });

  it("increases smoothly with velocity", () => {
    const low = kineticState(0, CARD_PITCH * 2).kineticFocus;
    const medium = kineticState(0, CARD_PITCH * 3.5).kineticFocus;
    const high = kineticState(0, CARD_PITCH * 5).kineticFocus;

    expect(low).toBeGreaterThan(0);
    expect(low).toBeLessThan(medium);
    expect(medium).toBeLessThan(high);
    expect(high).toBeLessThanOrEqual(1);
  });

  it("is symmetric for travel direction and uses velocity sign only for retained yaw", () => {
    const forward = kineticState(0.05, CARD_PITCH * 5);
    const backward = kineticState(0.05, -CARD_PITCH * 5);

    expect(forward.kineticFocus).toBeCloseTo(backward.kineticFocus, 10);
    expect(forward.scaleLoss).toBeCloseTo(backward.scaleLoss, 10);
    expect(forward.recess).toBeCloseTo(backward.recess, 10);
    expect(forward.contactShadowStrength).toBeCloseTo(backward.contactShadowStrength, 10);
    expect(forward.retainedYaw).toBeCloseTo(-backward.retainedYaw, 10);
  });

  it("leaves direct slow dragging visually unmodified", () => {
    const slowDrag = kineticState(0.2, 0);

    expect(slowDrag.scaleLoss).toBe(0);
    expect(slowDrag.recess).toBe(0);
    expect(slowDrag.retainedYaw).toBe(0);
  });
});

describe("Coverflow autonomous release envelope", () => {
  it("does not apply release-only velocity limiting while dragging", () => {
    const rawVelocity = -CARD_PITCH * 20;
    expect(resolveAutonomousReleaseVelocity(rawVelocity, CARD_PITCH, true)).toBe(rawVelocity);
  });

  it("does not materially slow a one-card balanced release", () => {
    const bounded = simulateSettle(1, true);
    const unbounded = simulateSettle(1, false);

    expect(Math.abs(bounded.elapsed - unbounded.elapsed)).toBeLessThanOrEqual(1 / 120);
    expect(bounded.maximumSpeed / CARD_PITCH).toBeLessThan(
      COVERFLOW_MOTION_TUNING.maximumFreeVelocity,
    );
  });

  it("bounds multi-card free velocity while keeping a physical settle", () => {
    const traversal = simulateSettle(4, true);

    expect(traversal.maximumSpeed / CARD_PITCH).toBeLessThanOrEqual(
      COVERFLOW_MOTION_TUNING.maximumFreeVelocity,
    );
    expect(traversal.authorityTime).toBeGreaterThan(0.35);
    expect(traversal.authorityTime).toBeLessThan(0.6);
    expect(traversal.elapsed).toBeLessThan(0.7);
    expect(Math.abs(traversal.state.position + 4 * CARD_PITCH)).toBeLessThanOrEqual(
      BALANCED_SPRING.restDistance,
    );
  });

  it("preserves raw-velocity destination resolution before limiting autonomous motion", () => {
    const anchors = Array.from({ length: 5 }, (_, order) => ({
      id: String(order),
      order,
      position: -order * CARD_PITCH,
    }));
    const rawVelocity = -CARD_PITCH * 20;
    const target = resolveReleaseTarget({
      anchors,
      position: 0,
      velocity: rawVelocity,
      activeId: "0",
      policy: {
        projectionSeconds: 0.22,
        flingVelocity: 460,
        maxAnchorSkip: 5,
        forwardSign: -1,
      },
    });
    const limitedVelocity = resolveAutonomousReleaseVelocity(rawVelocity, CARD_PITCH, false);

    expect(target?.id).toBe("4");
    expect(Math.abs(limitedVelocity)).toBeLessThan(Math.abs(rawVelocity));
    expect(Math.abs(limitedVelocity) / CARD_PITCH).toBeLessThanOrEqual(
      COVERFLOW_MOTION_TUNING.maximumFreeVelocity,
    );
  });
});

describe("Coverflow semantic commitment", () => {
  it("uses hysteresis while directly dragging", () => {
    const commitment = new CoverflowSemanticCommitment(2, 5);

    commitment.update({
      phase: "dragging",
      physicalIndex: 2.52,
      targetIndex: null,
      activeIndex: 3,
      speedInCards: 0,
    });
    expect(commitment.committedIndex).toBe(2);

    commitment.update({
      phase: "dragging",
      physicalIndex: 2.58,
      targetIndex: null,
      activeIndex: 3,
      speedInCards: 0,
    });
    expect(commitment.committedIndex).toBe(3);

    commitment.update({
      phase: "dragging",
      physicalIndex: 2.48,
      targetIndex: null,
      activeIndex: 2,
      speedInCards: 0,
    });
    expect(commitment.committedIndex).toBe(3);
  });

  it("cancels pending semantic commitment when re-grabbed", () => {
    const commitment = new CoverflowSemanticCommitment(0, 5);

    commitment.update({
      phase: "settling",
      physicalIndex: 1,
      targetIndex: 4,
      activeIndex: 1,
      speedInCards: 8,
    });
    expect(commitment.pendingTargetIndex).toBe(4);
    expect(commitment.committedIndex).toBe(0);

    commitment.update({
      phase: "dragging",
      physicalIndex: 1.1,
      targetIndex: null,
      activeIndex: 1,
      speedInCards: 0,
    });
    expect(commitment.pendingTargetIndex).toBeNull();
    expect(commitment.committedIndex).toBe(1);
  });

  it("announces the settled destination only", () => {
    const commitment = new CoverflowSemanticCommitment(0, 5);

    expect(
      commitment.update({
        phase: "settling",
        physicalIndex: 1,
        targetIndex: 4,
        activeIndex: 1,
        speedInCards: 8,
      }),
    ).toBeNull();
    expect(
      commitment.update({
        phase: "settling",
        physicalIndex: 3.8,
        targetIndex: 4,
        activeIndex: 4,
        speedInCards: 2,
      }),
    ).toBeNull();
    expect(commitment.committedIndex).toBe(4);
    expect(
      commitment.update({
        phase: "idle",
        physicalIndex: 4,
        targetIndex: 4,
        activeIndex: 4,
        speedInCards: 0,
      }),
    ).toBe(4);
    expect(
      commitment.update({
        phase: "idle",
        physicalIndex: 4,
        targetIndex: 4,
        activeIndex: 4,
        speedInCards: 0,
      }),
    ).toBeNull();
  });
});
