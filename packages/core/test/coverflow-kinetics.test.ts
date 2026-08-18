import { describe, expect, it } from "vitest";

import {
  createCoverflowKineticState,
  resolveCoverflowKinetics,
  resolveCoverflowPresentation,
  resolveCoverflowTuning,
  type CoverflowKineticState,
} from "../src/coverflow";

const CARD_PITCH = 300;

function kineticState(
  relativePosition: number,
  velocityPxPerSecond: number,
): CoverflowKineticState {
  return resolveCoverflowKinetics(
    relativePosition,
    velocityPxPerSecond,
    CARD_PITCH,
    createCoverflowKineticState(),
  );
}

describe("coverflow kinetic focus", () => {
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

describe("coverflow responsive tuning", () => {
  it("keeps drag literal by making the pitch the first side slot", () => {
    const tuning = resolveCoverflowTuning({ stageWidth: 1_120 });
    expect(tuning.pitch).toBe(tuning.sidePeakX);
    expect(tuning.sidePeakX).toBeGreaterThan(tuning.cardWidth / 2);
  });

  it("clamps the card box on very small and very large stages", () => {
    expect(resolveCoverflowTuning({ stageWidth: 320 }).cardWidth).toBe(280);
    expect(resolveCoverflowTuning({ stageWidth: 4_000 }).cardWidth).toBe(420);
  });

  it("rejects a stage that cannot hold a card", () => {
    expect(() => resolveCoverflowTuning({ stageWidth: 0 })).toThrow(RangeError);
  });
});
