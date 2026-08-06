import { describe, expect, it } from "vitest";

import {
  createStackedDeckFrame,
  resolveStackedDeckFrame,
  resolveStackedDeckTuning,
  type MutableStackedDeckFrame,
  type StackedDeckTuning,
} from "../src";

const WIDE_TUNING = resolveStackedDeckTuning({ stageWidth: 1_120, stageHeight: 620 });

function resolveFrame(
  physicalIndex: number,
  itemCount = 5,
  previousOwnerIndex?: number,
  tuning: StackedDeckTuning = WIDE_TUNING,
  output: MutableStackedDeckFrame = createStackedDeckFrame(itemCount),
) {
  return resolveStackedDeckFrame(
    {
      physicalIndex,
      itemCount,
      tuning,
      ...(previousOwnerIndex === undefined ? {} : { previousOwnerIndex }),
    },
    output,
  );
}

function expectFiniteFrame(frame: ReturnType<typeof resolveFrame>) {
  expect(Number.isFinite(frame.physicalIndex)).toBe(true);
  expect(Number.isFinite(frame.pairFraction)).toBe(true);
  for (const pose of frame.poses) {
    expect(
      [
        pose.translateX,
        pose.translateY,
        pose.projectedScale,
        pose.rotateY,
        pose.virtualZ,
        pose.layer,
        pose.veil,
        pose.shadowStrength,
      ].every(Number.isFinite),
    ).toBe(true);
  }
}

function overlapRatio(
  first: ReturnType<typeof resolveFrame>["poses"][number],
  second: ReturnType<typeof resolveFrame>["poses"][number],
  cardWidth = WIDE_TUNING.cardWidth,
) {
  const firstWidth = cardWidth * first.projectedScale;
  const secondWidth = cardWidth * second.projectedScale;
  const left = Math.max(first.translateX - firstWidth / 2, second.translateX - secondWidth / 2);
  const right = Math.min(first.translateX + firstWidth / 2, second.translateX + secondWidth / 2);
  return Math.max(0, right - left) / Math.min(firstWidth, secondWidth);
}

describe("stacked deck responsive tuning", () => {
  it("selects deliberate compact, medium, and wide profiles at exact boundaries", () => {
    expect(resolveStackedDeckTuning({ stageWidth: 599.999, stageHeight: 500 }).profile).toBe(
      "compact",
    );
    expect(resolveStackedDeckTuning({ stageWidth: 600, stageHeight: 500 }).profile).toBe("medium");
    expect(resolveStackedDeckTuning({ stageWidth: 959.999, stageHeight: 600 }).profile).toBe(
      "medium",
    );
    expect(resolveStackedDeckTuning({ stageWidth: 960, stageHeight: 600 }).profile).toBe("wide");
  });

  it("preserves the calibrated center width, side exposure, and neighbor scale", () => {
    const wide = resolveStackedDeckTuning({ stageWidth: 1_120, stageHeight: 620 });
    const medium = resolveStackedDeckTuning({ stageWidth: 768, stageHeight: 520 });
    const compact = resolveStackedDeckTuning({ stageWidth: 360, stageHeight: 420 });
    const wideNeighborScale = wide.perspective / (wide.perspective - wide.sideVirtualZ);
    expect(wide.cardWidth / 1_120).toBeCloseTo(0.6, 2);
    expect(wide.sideProjectedX / wide.cardWidth).toBeCloseTo(0.35, 2);
    expect(wideNeighborScale).toBeGreaterThanOrEqual(0.7);
    expect(wideNeighborScale).toBeLessThanOrEqual(0.78);
    expect(medium.cardWidth / 768).toBeCloseTo(0.7, 2);
    expect(medium.sideProjectedX / medium.cardWidth).toBeCloseTo(0.34, 2);
    expect(compact.cardWidth / 360).toBeCloseTo(0.87, 2);
    expect(compact.sideProjectedX / compact.cardWidth).toBeCloseTo(0.3, 2);
    expect(compact.sideRotateY).toBeLessThan(medium.sideRotateY);
    expect(compact.hideAfter).toBeLessThan(medium.hideAfter);
  });

  it("keeps reduced motion hierarchical without yaw or secondary excess", () => {
    const full = resolveStackedDeckTuning({ stageWidth: 1_120, stageHeight: 620 });
    const reduced = resolveStackedDeckTuning({
      stageWidth: 1_120,
      stageHeight: 620,
      reducedMotion: true,
    });
    const frame = resolveFrame(2.5, 5, 2, reduced);
    expect(reduced.sideRotateY).toBe(0);
    expect(Math.abs(reduced.sideLift)).toBeLessThan(Math.abs(full.sideLift));
    expect(Math.abs(reduced.stackStrideX)).toBeLessThan(Math.abs(full.stackStrideX));
    expect(frame.poses.every((pose) => pose.rotateY === 0)).toBe(true);
    expect(frame.poses[2]!.role).toBe("foreground");
    expect(frame.poses[3]!.role).toBe("incoming");
    expect(frame.poses[2]!.projectedScale).toBeGreaterThan(frame.poses[3]!.projectedScale);
    expect(overlapRatio(frame.poses[2]!, frame.poses[3]!, reduced.cardWidth)).toBeGreaterThan(0.45);
  });

  it("rejects invalid stage dimensions", () => {
    expect(() => resolveStackedDeckTuning({ stageWidth: 0, stageHeight: 600 })).toThrow(RangeError);
    expect(() => resolveStackedDeckTuning({ stageWidth: Number.NaN, stageHeight: 600 })).toThrow(
      TypeError,
    );
  });
});

describe("stacked deck frame", () => {
  it("resolves exact settled geometry with one authoritative center", () => {
    const frame = resolveFrame(2, 5, 2);
    const [left, center, right] = frame.poses.slice(1, 4);
    expect(frame).toMatchObject({ pairStartIndex: 2, pairFraction: 0, ownerIndex: 2 });
    expect(center).toMatchObject({
      translateX: 0,
      translateY: 0,
      projectedScale: 1,
      rotateY: 0,
      virtualZ: 0,
      role: "foreground",
      veil: 0,
      shadowStrength: 1,
      visible: true,
      interactive: true,
    });
    expect(left!.translateX).toBeCloseTo(-WIDE_TUNING.sideProjectedX);
    expect(right!.translateX).toBeCloseTo(WIDE_TUNING.sideProjectedX);
    expect(left!.virtualZ).toBeCloseTo(WIDE_TUNING.sideVirtualZ);
    expect(right!.virtualZ).toBeCloseTo(WIDE_TUNING.sideVirtualZ);
    expect(center!.layer).toBeGreaterThan(left!.layer);
    expect(center!.layer).toBeGreaterThan(right!.layer);
  });

  it("keeps every value finite through legal motion and elastic overscroll", () => {
    for (const physicalIndex of [-0.45, -0.01, 0, 0.5, 2, 3.75, 4, 4.45]) {
      expectFiniteFrame(resolveFrame(physicalIndex));
    }
    expect(resolveFrame(-0.45).ownerIndex).toBe(0);
    expect(resolveFrame(4.45, 5, 4).ownerIndex).toBe(4);
  });

  it("returns exact center and rear-stack endpoints for every semantic step", () => {
    for (let index = 0; index < 5; index += 1) {
      const frame = resolveFrame(index, 5, index);
      const center = frame.poses[index]!;
      expect(center.translateX).toBe(0);
      expect(center.translateY).toBe(0);
      expect(center.projectedScale).toBe(1);
      expect(center.rotateY).toBe(0);
      expect(center.virtualZ).toBe(0);
      expect(center.veil).toBe(0);
      expect(center.role).toBe("foreground");
      expect(
        frame.poses
          .filter((_, poseIndex) => poseIndex !== index)
          .every((pose) => pose.role === "rear"),
      ).toBe(true);
    }
  });

  it("moves outgoing and incoming X, scale, and depth monotonically", () => {
    let owner = 0;
    let previousOutgoingX = 0;
    let previousIncomingX = WIDE_TUNING.sideProjectedX;
    let previousOutgoingScale = 1;
    let previousIncomingScale =
      WIDE_TUNING.perspective / (WIDE_TUNING.perspective - WIDE_TUNING.sideVirtualZ);
    for (let step = 0; step <= 400; step += 1) {
      const frame = resolveFrame(step / 400, 5, owner);
      owner = frame.ownerIndex;
      const outgoing = frame.poses[0]!;
      const incoming = frame.poses[1]!;
      expect(outgoing.translateX).toBeLessThanOrEqual(previousOutgoingX + 1e-9);
      expect(incoming.translateX).toBeLessThanOrEqual(previousIncomingX + 1e-9);
      expect(outgoing.projectedScale).toBeLessThanOrEqual(previousOutgoingScale + 1e-9);
      expect(incoming.projectedScale).toBeGreaterThanOrEqual(previousIncomingScale - 1e-9);
      previousOutgoingX = outgoing.translateX;
      previousIncomingX = incoming.translateX;
      previousOutgoingScale = outgoing.projectedScale;
      previousIncomingScale = incoming.projectedScale;
    }
  });

  it("keeps the active pair heavily overlapped and one card near visual center", () => {
    let owner = 0;
    for (let step = 0; step <= 200; step += 1) {
      const frame = resolveFrame(step / 200, 5, owner);
      owner = frame.ownerIndex;
      const outgoing = frame.poses[0]!;
      const incoming = frame.poses[1]!;
      expect(overlapRatio(outgoing, incoming)).toBeGreaterThanOrEqual(0.45);
      expect(
        Math.min(Math.abs(outgoing.translateX), Math.abs(incoming.translateX)),
      ).toBeLessThanOrEqual(WIDE_TUNING.cardWidth * 0.12);
      expect(incoming.translateX - outgoing.translateX).toBeLessThanOrEqual(
        WIDE_TUNING.sideProjectedX + 1e-9,
      );
    }
  });

  it("never resolves an extended dual-authority state", () => {
    let owner = 0;
    let dualAuthorityFrames = 0;
    for (let step = 1; step < 200; step += 1) {
      const frame = resolveFrame(step / 200, 5, owner);
      owner = frame.ownerIndex;
      const outgoing = frame.poses[0]!;
      const incoming = frame.poses[1]!;
      const nearlyEqualAcrossEveryAuthorityChannel =
        Math.abs(outgoing.projectedScale - incoming.projectedScale) < 0.01 &&
        Math.abs(outgoing.virtualZ - incoming.virtualZ) < 12 &&
        Math.abs(outgoing.veil - incoming.veil) < 0.015 &&
        Math.abs(Math.abs(outgoing.rotateY) - Math.abs(incoming.rotateY)) < 1 &&
        Math.abs(Math.abs(outgoing.translateX) - Math.abs(incoming.translateX)) <
          WIDE_TUNING.cardWidth * 0.03;
      if (nearlyEqualAcrossEveryAuthorityChannel) dualAuthorityFrames += 1;
    }
    expect(dualAuthorityFrames).toBe(0);
  });

  it("keeps midpoint scale, depth, yaw, veil, and center distance asymmetric", () => {
    const midpoint = resolveFrame(0.5, 5, 0);
    const outgoing = midpoint.poses[0]!;
    const incoming = midpoint.poses[1]!;
    expect(outgoing.projectedScale).toBeGreaterThan(incoming.projectedScale);
    expect(outgoing.virtualZ).toBeGreaterThan(incoming.virtualZ);
    expect(outgoing.veil).toBeLessThan(incoming.veil);
    expect(Math.abs(outgoing.rotateY)).not.toBeCloseTo(Math.abs(incoming.rotateY), 1);
    expect(Math.abs(outgoing.translateX)).not.toBeCloseTo(Math.abs(incoming.translateX), 1);
  });

  it("hands foreground ownership over exactly once forward and backward", () => {
    let owner = 0;
    let forwardHandoffs = 0;
    for (let step = 0; step <= 200; step += 1) {
      const nextOwner = resolveFrame(step / 200, 5, owner).ownerIndex;
      if (nextOwner !== owner) forwardHandoffs += 1;
      owner = nextOwner;
    }
    expect(owner).toBe(1);
    expect(forwardHandoffs).toBe(1);

    let reverseHandoffs = 0;
    for (let step = 200; step >= 0; step -= 1) {
      const nextOwner = resolveFrame(step / 200, 5, owner).ownerIndex;
      if (nextOwner !== owner) reverseHandoffs += 1;
      owner = nextOwner;
    }
    expect(owner).toBe(0);
    expect(reverseHandoffs).toBe(1);
  });

  it("keeps ownership stable under repeated reversal inside the late handoff band", () => {
    let owner = 0;
    for (const position of [0.61, 0.63, 0.65, 0.625, 0.655]) {
      owner = resolveFrame(position, 5, owner).ownerIndex;
      expect(owner).toBe(0);
    }
    owner = resolveFrame(0.665, 5, owner).ownerIndex;
    expect(owner).toBe(1);
    for (const position of [0.65, 0.63, 0.625, 0.645]) {
      owner = resolveFrame(position, 5, owner).ownerIndex;
      expect(owner).toBe(1);
    }
    expect(resolveFrame(0.615, 5, owner).ownerIndex).toBe(0);
  });

  it("assigns globally unique layers with the owner foremost", () => {
    for (const position of [0, 0.4, 0.64, 0.67, 1, 2.8, 4]) {
      const frame = resolveFrame(position, 5, position >= 0.66 ? Math.ceil(position) : 0);
      const layers = frame.poses.map((pose) => pose.layer);
      expect(new Set(layers).size).toBe(layers.length);
      expect(frame.poses[frame.ownerIndex]!.layer).toBe(Math.max(...layers));
    }
  });

  it("catches ownership up across multi-item frame jumps in either direction", () => {
    expect(resolveFrame(3.8, 5, 0).ownerIndex).toBe(4);
    expect(resolveFrame(0.2, 5, 4).ownerIndex).toBe(0);
  });

  it("converges the rear stack and removes far-card hit eligibility", () => {
    const frame = resolveFrame(4, 9, 4);
    const x = [frame.poses[5]!, frame.poses[6]!, frame.poses[7]!].map((pose) => pose.translateX);
    expect(x[2]! - x[1]!).toBeLessThan(x[1]! - x[0]!);
    expect(frame.poses[5]!.interactive).toBe(true);
    expect(frame.poses[6]!.interactive).toBe(false);
    expect(frame.poses[7]!.visible).toBe(false);
  });

  it("handles empty and single-item frames", () => {
    const empty = resolveFrame(0, 0, -1);
    expect(empty).toMatchObject({ pairStartIndex: -1, ownerIndex: -1, poses: [] });
    const single = resolveFrame(0.25, 1, 0);
    expect(single).toMatchObject({ pairStartIndex: 0, pairFraction: 0, ownerIndex: 0 });
    expect(single.poses).toHaveLength(1);
    expectFiniteFrame(single);
  });

  it("reuses caller storage without mutating tuning input", () => {
    const tuningSnapshot = structuredClone(WIDE_TUNING);
    const output = createStackedDeckFrame(5);
    const poseIdentities = [...output.poses];
    const first = resolveFrame(1.25, 5, 1, WIDE_TUNING, output);
    const second = resolveFrame(1.75, 5, first.ownerIndex, WIDE_TUNING, output);
    expect(first).toBe(output);
    expect(second).toBe(output);
    expect(output.poses.every((pose, index) => pose === poseIdentities[index])).toBe(true);
    expect(WIDE_TUNING).toEqual(tuningSnapshot);
  });

  it("rejects invalid frame inputs and handoff tuning", () => {
    expect(() => createStackedDeckFrame(1.5)).toThrow(RangeError);
    expect(() => resolveFrame(Number.POSITIVE_INFINITY)).toThrow(TypeError);
    expect(() =>
      resolveStackedDeckFrame(
        { physicalIndex: 0, itemCount: 5, tuning: WIDE_TUNING },
        createStackedDeckFrame(4),
      ),
    ).toThrow(RangeError);
    expect(() =>
      resolveFrame(0.5, 5, 0, {
        ...WIDE_TUNING,
        handoffBackward: WIDE_TUNING.handoffForward,
      }),
    ).toThrow(RangeError);
  });
});
