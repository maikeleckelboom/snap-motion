import {
  resolveCoverflowPresentation,
  resolveReleaseTarget,
  type SpringConfiguration,
} from "@snap-motion/core";
import { describe, expect, it } from "vitest";

import {
  advanceBoundedCoverflowSpring,
  COVERFLOW_MOTION_TUNING,
  COVERFLOW_PAGINATION_TUNING,
  CoverflowSettledSelection,
  resolveAdjacentCoverflowIndex,
  resolveAutonomousReleaseVelocity,
  resolveCoverflowKeyboardAction,
  resolveCoverflowKinetics,
  resolveCoverflowPaginationIndicator,
  resolveCoverflowVisualIndex,
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
  }

  return { elapsed, maximumSpeed, state };
}

function paginationIndicator(physicalIndex: number, physicalVelocityInCards = 0, itemCount = 5) {
  return resolveCoverflowPaginationIndicator(
    physicalIndex,
    -physicalVelocityInCards * CARD_PITCH,
    CARD_PITCH,
    itemCount,
    {
      position: 0,
      x: 0,
      scaleX: 1,
      stretchRatio: 0,
      speedInCards: 0,
      softDirection: 0,
      leftStretch: 0,
      rightStretch: 0,
    },
  );
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

describe("Coverflow fluid pagination", () => {
  const slotPitch = COVERFLOW_PAGINATION_TUNING.slotSize + COVERFLOW_PAGINATION_TUNING.slotGap;

  it("aligns every resting index exactly with scale one", () => {
    for (let index = 0; index < 5; index += 1) {
      const indicator = paginationIndicator(index);
      expect(indicator.position).toBe(index);
      expect(indicator.x).toBe(index * slotPitch);
      expect(indicator.scaleX).toBe(1);
      expect(indicator.stretchRatio).toBe(0);
    }
  });

  it("places halfway physical positions halfway between fixed slot centers", () => {
    expect(paginationIndicator(1.5).x).toBe(1.5 * slotPitch);
  });

  it("remains continuous across integer boundaries", () => {
    const before = paginationIndicator(0.999).x;
    const after = paginationIndicator(1.001).x;
    expect(after - before).toBeCloseTo(slotPitch * 0.002, 10);
  });

  it("is symmetric for positive and negative physical travel", () => {
    const restingX = paginationIndicator(2).x;
    const forward = paginationIndicator(2, 3);
    const backward = paginationIndicator(2, -3);

    expect(forward.scaleX).toBeCloseTo(backward.scaleX, 10);
    expect(forward.x - restingX).toBeCloseTo(restingX - backward.x, 10);
    expect(forward.softDirection).toBeCloseTo(-backward.softDirection, 10);
  });

  it("increases stretch smoothly with speed and keeps it bounded", () => {
    const resting = paginationIndicator(2, 0);
    const low = paginationIndicator(2, 0.75);
    const medium = paginationIndicator(2, 2.5);
    const high = paginationIndicator(2, 8);

    expect(resting.stretchRatio).toBe(0);
    expect(low.stretchRatio).toBeGreaterThan(0);
    expect(low.stretchRatio).toBeLessThan(medium.stretchRatio);
    expect(medium.stretchRatio).toBeLessThan(high.stretchRatio);
    expect(high.stretchRatio).toBe(COVERFLOW_PAGINATION_TUNING.maximumStretchRatio);
    expect(high.scaleX).toBeLessThanOrEqual(1 + COVERFLOW_PAGINATION_TUNING.maximumStretchRatio);
  });

  it("reverses its directional edge bias", () => {
    const forward = paginationIndicator(2, 3);
    const backward = paginationIndicator(2, -3);

    expect(forward.rightStretch).toBeGreaterThan(forward.leftStretch);
    expect(backward.leftStretch).toBeGreaterThan(backward.rightStretch);
    expect(forward.rightStretch).toBeCloseTo(backward.leftStretch, 10);
    expect(forward.leftStretch).toBeCloseTo(backward.rightStretch, 10);
  });

  it("crosses zero velocity without a directional discontinuity", () => {
    const barelyForward = paginationIndicator(2, 0.001);
    const barelyBackward = paginationIndicator(2, -0.001);

    expect(barelyForward.x).toBeCloseTo(barelyBackward.x, 10);
    expect(barelyForward.scaleX).toBeCloseTo(barelyBackward.scaleX, 10);
  });

  it("clamps physical position at the first and last item", () => {
    expect(paginationIndicator(-0.5).position).toBe(0);
    expect(paginationIndicator(-0.5).x).toBe(0);
    expect(paginationIndicator(4.5).position).toBe(4);
    expect(paginationIndicator(4.5).x).toBe(4 * slotPitch);
  });
});

describe("Coverflow visual and settled selection", () => {
  it("follows the nearest physical card with narrow midpoint hysteresis", () => {
    expect(resolveCoverflowVisualIndex(2.53, 2, 5)).toBe(2);
    expect(resolveCoverflowVisualIndex(2.541, 2, 5)).toBe(3);
    expect(resolveCoverflowVisualIndex(2.47, 3, 5)).toBe(3);
    expect(resolveCoverflowVisualIndex(2.459, 3, 5)).toBe(2);
  });

  it("prevents midpoint chatter without perceptible source retention", () => {
    const switchPoint = 0.5 + COVERFLOW_PAGINATION_TUNING.visualHysteresis;
    expect(switchPoint).toBeLessThanOrEqual(0.55);
    expect(resolveCoverflowVisualIndex(switchPoint - 0.001, 0, 5)).toBe(0);
    expect(resolveCoverflowVisualIndex(switchPoint + 0.001, 0, 5)).toBe(1);
    expect(resolveCoverflowVisualIndex(3.8, 0, 5)).toBe(4);
  });

  it("keeps settled selection independent until final idle", () => {
    const selection = new CoverflowSettledSelection(0, 5);

    expect(selection.update({ phase: "settling", targetIndex: 4, activeIndex: 1 })).toBeNull();
    expect(selection.settledIndex).toBe(0);
    expect(selection.update({ phase: "settling", targetIndex: 4, activeIndex: 3 })).toBeNull();
    expect(selection.settledIndex).toBe(0);
    expect(selection.update({ phase: "idle", targetIndex: 4, activeIndex: 4 })).toBe(4);
    expect(selection.settledIndex).toBe(4);
    expect(selection.update({ phase: "idle", targetIndex: 4, activeIndex: 4 })).toBeNull();
  });

  it("cancels obsolete pending announcements on re-grab and retarget", () => {
    const selection = new CoverflowSettledSelection(0, 5);

    selection.update({ phase: "settling", targetIndex: 4, activeIndex: 1 });
    expect(selection.pendingTargetIndex).toBe(4);
    selection.update({ phase: "dragging", targetIndex: null, activeIndex: 1 });
    expect(selection.pendingTargetIndex).toBeNull();
    expect(selection.settledIndex).toBe(0);

    selection.update({ phase: "settling", targetIndex: 4, activeIndex: 2 });
    selection.update({ phase: "settling", targetIndex: 2, activeIndex: 2 });
    expect(selection.pendingTargetIndex).toBe(2);
    expect(selection.update({ phase: "idle", targetIndex: 2, activeIndex: 2 })).toBe(2);
  });
});

describe("Coverflow keyboard navigation", () => {
  it("resolves previous and next as exactly one adjacent item", () => {
    expect(resolveAdjacentCoverflowIndex(2, -1, 5)).toBe(1);
    expect(resolveAdjacentCoverflowIndex(2, 1, 5)).toBe(3);
  });

  it("keeps boundary actions as no-ops", () => {
    expect(resolveAdjacentCoverflowIndex(0, -1, 5)).toBe(0);
    expect(resolveAdjacentCoverflowIndex(4, 1, 5)).toBe(4);
  });

  it("maps arrows, Home, and End while leaving unrelated keys untouched", () => {
    const target = { closest: () => null } as unknown as EventTarget;
    expect(resolveCoverflowKeyboardAction({ key: "ArrowLeft", target })).toBe("previous");
    expect(resolveCoverflowKeyboardAction({ key: "ArrowRight", target })).toBe("next");
    expect(resolveCoverflowKeyboardAction({ key: "Home", target })).toBe("home");
    expect(resolveCoverflowKeyboardAction({ key: "End", target })).toBe("end");
    expect(resolveCoverflowKeyboardAction({ key: "PageDown", target })).toBeUndefined();
  });

  it("excludes form controls and contenteditable owners", () => {
    const ownedTarget = {
      closest: () => ({ tagName: "INPUT" }),
    } as unknown as EventTarget;
    expect(
      resolveCoverflowKeyboardAction({ key: "ArrowRight", target: ownedTarget }),
    ).toBeUndefined();
  });
});
