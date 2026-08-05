import { describe, expect, it } from "vitest";

import {
  createStackedCoverflowFrame,
  resolveStackedCoverflowFrame,
  resolveStackedCoverflowTuning,
  type MutableStackedCoverflowFrame,
  type StackedCoverflowTuning,
} from "../src";

const WIDE_TUNING = resolveStackedCoverflowTuning({
  stageWidth: 1_120,
  stageHeight: 620,
});

function resolveFrame(
  physicalIndex: number,
  itemCount = 5,
  previousOwnerIndex?: number,
  tuning: StackedCoverflowTuning = WIDE_TUNING,
  output: MutableStackedCoverflowFrame = createStackedCoverflowFrame(itemCount),
) {
  return resolveStackedCoverflowFrame(
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
  expect(Number.isFinite(frame.passingLane)).toBe(true);
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
        pose.blur,
      ].every(Number.isFinite),
    ).toBe(true);
  }
}

function projectedScale(tuning: StackedCoverflowTuning) {
  return tuning.perspective / (tuning.perspective - tuning.sideVirtualZ);
}

describe("stacked Coverflow responsive tuning", () => {
  it("selects deliberate compact, medium, and wide profiles at exact boundaries", () => {
    expect(resolveStackedCoverflowTuning({ stageWidth: 599.999, stageHeight: 500 }).profile).toBe(
      "compact",
    );
    expect(resolveStackedCoverflowTuning({ stageWidth: 600, stageHeight: 500 }).profile).toBe(
      "medium",
    );
    expect(resolveStackedCoverflowTuning({ stageWidth: 959.999, stageHeight: 600 }).profile).toBe(
      "medium",
    );
    expect(resolveStackedCoverflowTuning({ stageWidth: 960, stageHeight: 600 }).profile).toBe(
      "wide",
    );
  });

  it("matches the calibrated center-width and projected-neighbor targets", () => {
    const wide = resolveStackedCoverflowTuning({ stageWidth: 1_120, stageHeight: 620 });
    const medium = resolveStackedCoverflowTuning({ stageWidth: 768, stageHeight: 520 });
    const compact = resolveStackedCoverflowTuning({ stageWidth: 360, stageHeight: 420 });
    expect(wide.cardWidth / 1_120).toBeCloseTo(0.6, 2);
    expect(wide.sideProjectedX / wide.cardWidth).toBeCloseTo(0.35, 2);
    expect(medium.cardWidth / 768).toBeCloseTo(0.7, 2);
    expect(medium.sideProjectedX / medium.cardWidth).toBeCloseTo(0.34, 2);
    expect(compact.cardWidth / 360).toBeCloseTo(0.87, 2);
    expect(compact.sideProjectedX / compact.cardWidth).toBeCloseTo(0.3, 2);
    expect(projectedScale(wide)).toBeGreaterThanOrEqual(0.7);
    expect(projectedScale(wide)).toBeLessThanOrEqual(0.78);
    expect(projectedScale(medium)).toBeGreaterThan(projectedScale(wide));
    expect(compact.sideRotateY).toBeLessThan(medium.sideRotateY);
    expect(compact.hideAfter).toBeLessThan(medium.hideAfter);
  });

  it("flattens the passing and material motion without losing a usable deck", () => {
    const full = resolveStackedCoverflowTuning({ stageWidth: 1_120, stageHeight: 620 });
    const reduced = resolveStackedCoverflowTuning({
      stageWidth: 1_120,
      stageHeight: 620,
      reducedMotion: true,
    });
    const frame = resolveFrame(2.5, 5, 2, reduced);

    expect(reduced.sideRotateY).toBe(0);
    expect(reduced.passingX).toBe(0);
    expect(reduced.passingRotateY).toBe(0);
    expect(reduced.passingRecess).toBe(0);
    expect(reduced.sideBlur).toBe(0);
    expect(Math.abs(reduced.sideLift)).toBeLessThan(Math.abs(full.sideLift));
    expect(frame.poses.every((pose) => pose.rotateY === 0 && pose.blur === 0)).toBe(true);
    expect(new Set(frame.poses.map((pose) => pose.layer)).size).toBe(5);
  });

  it("rejects invalid stage dimensions", () => {
    expect(() => resolveStackedCoverflowTuning({ stageWidth: 0, stageHeight: 600 })).toThrow(
      RangeError,
    );
    expect(() =>
      resolveStackedCoverflowTuning({ stageWidth: Number.NaN, stageHeight: 600 }),
    ).toThrow(TypeError);
  });
});

describe("stacked Coverflow frame", () => {
  it("resolves exact settled geometry with a solid authoritative center", () => {
    const frame = resolveFrame(2, 5, 2);
    const [left, center, right] = frame.poses.slice(1, 4);

    expect(frame.pairStartIndex).toBe(2);
    expect(frame.pairFraction).toBe(0);
    expect(frame.passingLane).toBe(0);
    expect(frame.ownerIndex).toBe(2);
    expect(center).toMatchObject({
      translateX: 0,
      translateY: 0,
      projectedScale: 1,
      rotateY: 0,
      virtualZ: 0,
      veil: 0,
      blur: 0,
      visible: true,
      interactive: true,
    });
    expect(left!.translateX).toBeCloseTo(-WIDE_TUNING.sideProjectedX);
    expect(right!.translateX).toBeCloseTo(WIDE_TUNING.sideProjectedX);
    expect(left!.translateY).toBeCloseTo(WIDE_TUNING.sideLift);
    expect(right!.translateY).toBeCloseTo(WIDE_TUNING.sideLift);
    expect(left!.rotateY).toBeCloseTo(WIDE_TUNING.sideRotateY);
    expect(right!.rotateY).toBeCloseTo(-WIDE_TUNING.sideRotateY);
    expect(left!.virtualZ).toBeCloseTo(WIDE_TUNING.sideVirtualZ);
    expect(right!.virtualZ).toBeCloseTo(WIDE_TUNING.sideVirtualZ);
    expect(center!.layer).toBeGreaterThan(left!.layer);
    expect(center!.layer).toBeGreaterThan(right!.layer);
  });

  it("keeps every frame value finite through legal motion and elastic overscroll", () => {
    for (const physicalIndex of [-0.45, -0.01, 0, 0.5, 2, 3.75, 4, 4.45]) {
      expectFiniteFrame(resolveFrame(physicalIndex));
    }
    expect(resolveFrame(-0.45).ownerIndex).toBe(0);
    expect(resolveFrame(4.45, 5, 4).ownerIndex).toBe(4);
  });

  it("uses a quartic passing corridor with zero endpoints and a bounded midpoint peak", () => {
    const start = resolveFrame(0, 5, 0);
    const midpoint = resolveFrame(0.5, 5, 0);
    const end = resolveFrame(1, 5, 1);
    const nearStart = resolveFrame(0.0001, 5, 0);

    expect(start.passingLane).toBe(0);
    expect(midpoint.passingLane).toBe(1);
    expect(end.passingLane).toBe(0);
    expect(nearStart.passingLane / 0.0001).toBeLessThan(0.01);
  });

  it("keeps both crossing cards monotonic in horizontal travel", () => {
    let previousOutgoing = Number.POSITIVE_INFINITY;
    let previousIncoming = Number.POSITIVE_INFINITY;
    for (let step = 0; step <= 200; step += 1) {
      const frame = resolveFrame(step / 200, 5, step / 200 >= 0.54 ? 1 : 0);
      const outgoing = frame.poses[0]!.translateX;
      const incoming = frame.poses[1]!.translateX;
      expect(outgoing).toBeLessThanOrEqual(previousOutgoing + 1e-9);
      expect(incoming).toBeLessThanOrEqual(previousIncoming + 1e-9);
      previousOutgoing = outgoing;
      previousIncoming = incoming;
    }
  });

  it("keeps virtual depth and projected scale coherent across the passing pair", () => {
    const pairDepthDifferences: number[] = [];
    for (let step = 0; step <= 100; step += 1) {
      const frame = resolveFrame(step / 100, 5, step >= 54 ? 1 : 0);
      const outgoing = frame.poses[0]!;
      const incoming = frame.poses[1]!;
      expect(outgoing.virtualZ).toBeLessThanOrEqual(0);
      expect(incoming.virtualZ).toBeLessThanOrEqual(0);
      expect(outgoing.virtualZ).toBeGreaterThanOrEqual(
        WIDE_TUNING.sideVirtualZ - WIDE_TUNING.passingRecess,
      );
      expect(incoming.virtualZ).toBeGreaterThanOrEqual(
        WIDE_TUNING.sideVirtualZ - WIDE_TUNING.passingRecess,
      );
      pairDepthDifferences.push(outgoing.virtualZ - incoming.virtualZ);
      expect(outgoing.projectedScale).toBeCloseTo(
        WIDE_TUNING.perspective / (WIDE_TUNING.perspective - outgoing.virtualZ),
      );
      expect(incoming.projectedScale).toBeCloseTo(
        WIDE_TUNING.perspective / (WIDE_TUNING.perspective - incoming.virtualZ),
      );
    }
    expect(pairDepthDifferences.slice(0, 46).every((difference) => difference > 0)).toBe(true);
    expect(
      pairDepthDifferences.slice(46, 55).every((difference) => Math.abs(difference) < 1e-9),
    ).toBe(true);
    expect(pairDepthDifferences.slice(55).every((difference) => difference < 0)).toBe(true);
  });

  it("hands foreground ownership over exactly once in forward and reverse travel", () => {
    let owner = 0;
    let forwardHandoffs = 0;
    for (let step = 0; step <= 100; step += 1) {
      const nextOwner = resolveFrame(step / 100, 5, owner).ownerIndex;
      if (nextOwner !== owner) forwardHandoffs += 1;
      owner = nextOwner;
    }
    expect(owner).toBe(1);
    expect(forwardHandoffs).toBe(1);

    let reverseHandoffs = 0;
    for (let step = 100; step >= 0; step -= 1) {
      const nextOwner = resolveFrame(step / 100, 5, owner).ownerIndex;
      if (nextOwner !== owner) reverseHandoffs += 1;
      owner = nextOwner;
    }
    expect(owner).toBe(0);
    expect(reverseHandoffs).toBe(1);
  });

  it("does not chatter during repeated reversal inside the handoff band", () => {
    let owner = 0;
    for (const position of [0.49, 0.51, 0.48, 0.52, 0.5, 0.53]) {
      owner = resolveFrame(position, 5, owner).ownerIndex;
      expect(owner).toBe(0);
    }
    owner = resolveFrame(0.55, 5, owner).ownerIndex;
    expect(owner).toBe(1);
    for (const position of [0.51, 0.49, 0.52, 0.48, 0.5, 0.47]) {
      owner = resolveFrame(position, 5, owner).ownerIndex;
      expect(owner).toBe(1);
    }
    expect(resolveFrame(0.45, 5, owner).ownerIndex).toBe(0);
  });

  it("assigns globally unique layers with the owner always foremost", () => {
    for (const position of [0, 0.45, 0.5, 0.55, 1, 2.8, 4]) {
      const frame = resolveFrame(position, 5, position >= 0.55 ? Math.ceil(position) : 0);
      const layers = frame.poses.map((pose) => pose.layer);
      expect(new Set(layers).size).toBe(layers.length);
      expect(frame.poses[frame.ownerIndex]!.layer).toBe(Math.max(...layers));
    }
  });

  it("catches ownership up safely across multi-item frame jumps in either direction", () => {
    expect(resolveFrame(3.8, 5, 0).ownerIndex).toBe(4);
    expect(resolveFrame(0.2, 5, 4).ownerIndex).toBe(0);
  });

  it("converges the far stack and removes far-card hit eligibility", () => {
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
    expect(single.pairStartIndex).toBe(0);
    expect(single.pairFraction).toBe(0);
    expect(single.ownerIndex).toBe(0);
    expect(single.poses).toHaveLength(1);
    expectFiniteFrame(single);
  });

  it("reuses caller storage without mutating tuning input", () => {
    const tuningSnapshot = structuredClone(WIDE_TUNING);
    const output = createStackedCoverflowFrame(5);
    const poseIdentities = [...output.poses];
    const first = resolveFrame(1.25, 5, 1, WIDE_TUNING, output);
    const second = resolveFrame(1.75, 5, first.ownerIndex, WIDE_TUNING, output);

    expect(first).toBe(output);
    expect(second).toBe(output);
    for (let index = 0; index < output.poses.length; index += 1) {
      expect(output.poses[index]).toBe(poseIdentities[index]);
    }
    expect(WIDE_TUNING).toEqual(tuningSnapshot);
  });

  it("rejects invalid frame inputs and non-monotonic passing tuning", () => {
    expect(() => createStackedCoverflowFrame(1.5)).toThrow(RangeError);
    expect(() => resolveFrame(Number.POSITIVE_INFINITY)).toThrow(TypeError);
    expect(() =>
      resolveStackedCoverflowFrame(
        { physicalIndex: 0, itemCount: 5, tuning: WIDE_TUNING },
        createStackedCoverflowFrame(4),
      ),
    ).toThrow(RangeError);
    expect(() =>
      resolveFrame(0.5, 5, 0, {
        ...WIDE_TUNING,
        passingX: WIDE_TUNING.sideProjectedX,
      }),
    ).toThrow(RangeError);
  });
});
