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
  it.each([
    [320, 280, 196, 224, 95],
    [850, 340, 238, 272, 116],
    [1120, 420, 294, 336, 143],
    [4000, 420, 294, 336, 143],
  ])("preserves the default geometry at %s", (stageWidth, width, height, pitch, gap) => {
    expect(resolveCoverflowTuning({ stageWidth })).toEqual({
      cardWidth: width,
      cardHeight: height,
      pitch,
      sidePeakX: pitch,
      stackGap: gap,
      perspective: 900,
      maxRotateY: 62,
      sideDepth: -300,
      hideAfter: 3.05,
    });
  });

  it("keeps subpixel requests and tiny allocations mechanically positive", () => {
    for (const options of [
      { stageWidth: 1120, cardWidth: 0.1 },
      { stageWidth: 1, cardWidth: 720 },
    ]) {
      const tuning = resolveCoverflowTuning(options);
      for (const key of ["cardWidth", "cardHeight", "pitch", "stackGap"] as const) {
        expect(tuning[key]).toBeGreaterThan(0);
        expect(Number.isFinite(tuning[key])).toBe(true);
      }
    }
  });

  it("allocates a wider face while scaling the camera and rail together", () => {
    const tuning = resolveCoverflowTuning({ stageWidth: 1120, cardWidth: 720 });
    expect(tuning.cardWidth).toBeGreaterThan(600);
    expect(tuning.cardWidth).toBeLessThanOrEqual(720);
    expect(tuning.pitch).toBe(tuning.sidePeakX);
    expect(tuning.sidePeakX).toBeGreaterThan(tuning.cardWidth / 2);
    expect(tuning.perspective / tuning.cardWidth).toBeCloseTo(900 / 420);
    expect(tuning.sideDepth / tuning.cardWidth).toBeCloseTo(-300 / 420);
    const side = resolveCoverflowPresentation({ ...tuning, progress: 1 });
    const next = resolveCoverflowPresentation({ ...tuning, progress: 2 });
    expect(Math.abs(side.rotateY)).toBe(62);
    expect(next.translateZ).toBeLessThan(side.translateZ);
    expect(next.translateX).toBeGreaterThan(side.translateX);
    // The focused plane tracks exactly one pointer pixel per controller pixel.
    for (const delta of [-100, 100]) {
      const pose = resolveCoverflowPresentation({ ...tuning, progress: delta / tuning.pitch });
      const projectedX =
        (pose.translateX * tuning.perspective) / (tuning.perspective - pose.translateZ);
      expect(projectedX).toBeCloseTo(delta);
    }
  });

  it.each([160, 280, 320, 390, 700, 1120, 1280, 4000])(
    "bounds preferred sizing at allocation %s",
    (stageWidth) => {
      const tuning = resolveCoverflowTuning({ stageWidth, cardWidth: 720 });
      expect(tuning.cardWidth).toBeLessThanOrEqual(Math.min(720, stageWidth - 32));
      for (const key of ["cardWidth", "cardHeight", "pitch", "stackGap", "perspective"] as const) {
        expect(Number.isFinite(tuning[key])).toBe(true);
        expect(tuning[key]).toBeGreaterThan(0);
      }
    },
  );

  it.each([320, 390])("retains the compact card with an explicit request at %s", (stageWidth) => {
    expect(resolveCoverflowTuning({ stageWidth, cardWidth: 720 }).cardWidth).toBe(280);
  });

  it.each([0, -1, NaN, Infinity])("rejects invalid preferred width %s", (cardWidth) => {
    expect(() => resolveCoverflowTuning({ stageWidth: 1120, cardWidth })).toThrow(
      /cardWidth must be a finite number|coverflow dimensions must be positive/,
    );
  });

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
