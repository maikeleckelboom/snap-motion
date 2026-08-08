import { describe, expect, it } from "vitest";

import {
  advanceBoundedSpring,
  BOUNDED_SPRING_TUNING,
  resolveAutonomousReleaseVelocity,
  resolveSpeedInCards,
  type MutableSpringState,
} from "../src/kinetics";
import { resolveReleaseTarget } from "../src/snap-targets";
import type { SpringConfiguration } from "../src/types";

const CARD_PITCH = 300;
const BALANCED_SPRING: SpringConfiguration = {
  stiffness: 400,
  damping: 36,
  mass: 0.85,
  restSpeed: 10,
  restDistance: 0.6,
};

function advanceUnboundedSpring(
  state: MutableSpringState,
  target: number,
  deltaTime: number,
): void {
  const stepCount = Math.max(1, Math.ceil(deltaTime / BOUNDED_SPRING_TUNING.integrationStep));
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

  while (
    elapsed < 3 &&
    (Math.abs(state.position - target) > BALANCED_SPRING.restDistance ||
      Math.abs(state.velocity) > BALANCED_SPRING.restSpeed)
  ) {
    if (bounded) {
      advanceBoundedSpring(state, target, BALANCED_SPRING, CARD_PITCH, frame);
    } else {
      advanceUnboundedSpring(state, target, frame);
    }
    maximumSpeed = Math.max(maximumSpeed, Math.abs(state.velocity));
    elapsed += frame;
  }

  return { elapsed, maximumSpeed, state };
}

describe("speed in cards", () => {
  it("is unsigned and reports nothing when the inputs cannot describe a speed", () => {
    expect(resolveSpeedInCards(-600, 300)).toBe(2);
    expect(resolveSpeedInCards(600, 300)).toBe(2);
    expect(resolveSpeedInCards(600, 0)).toBe(0);
    expect(resolveSpeedInCards(Number.NaN, 300)).toBe(0);
  });
});

describe("autonomous release envelope", () => {
  it("does not apply release-only velocity limiting while dragging", () => {
    const rawVelocity = -CARD_PITCH * 20;
    expect(resolveAutonomousReleaseVelocity(rawVelocity, CARD_PITCH, true)).toBe(rawVelocity);
  });

  it("leaves an ordinary release exactly alone", () => {
    const rawVelocity = -CARD_PITCH * 4;
    expect(resolveAutonomousReleaseVelocity(rawVelocity, CARD_PITCH, false)).toBe(rawVelocity);
  });

  it("does not materially slow a one-card balanced release", () => {
    const bounded = simulateSettle(1, true);
    const unbounded = simulateSettle(1, false);

    expect(Math.abs(bounded.elapsed - unbounded.elapsed)).toBeLessThanOrEqual(1 / 120);
    expect(bounded.maximumSpeed / CARD_PITCH).toBeLessThan(
      BOUNDED_SPRING_TUNING.maximumFreeVelocity,
    );
  });

  it("bounds multi-card free velocity while keeping a physical settle", () => {
    const traversal = simulateSettle(4, true);

    expect(traversal.maximumSpeed / CARD_PITCH).toBeLessThanOrEqual(
      BOUNDED_SPRING_TUNING.maximumFreeVelocity,
    );
    expect(traversal.elapsed).toBeLessThan(0.7);
    expect(Math.abs(traversal.state.position + 4 * CARD_PITCH)).toBeLessThanOrEqual(
      BALANCED_SPRING.restDistance,
    );
  });

  it("preserves raw-velocity destination resolution before limiting autonomous motion", () => {
    const anchors = Array.from({ length: 5 }, (_unused, order) => ({
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
      BOUNDED_SPRING_TUNING.maximumFreeVelocity,
    );
  });

  it("refuses to integrate a frame that cannot describe motion", () => {
    const state = { position: 0, velocity: 0 };
    advanceBoundedSpring(state, -CARD_PITCH, BALANCED_SPRING, CARD_PITCH, 0);
    advanceBoundedSpring(state, -CARD_PITCH, BALANCED_SPRING, 0, 1 / 60);
    expect(state).toEqual({ position: 0, velocity: 0 });
  });
});
