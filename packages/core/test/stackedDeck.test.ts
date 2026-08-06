import { describe, expect, it } from "vitest";

import {
  createStackedDeckFrame,
  createStackedDeckTraversal,
  resolveStackedDeckFrame,
  resolveStackedDeckTraversal,
  resolveStackedDeckTuning,
  type MutableStackedDeckFrame,
  type MutableStackedDeckTraversal,
  type StackedDeckTraversal,
  type StackedDeckTuning,
} from "../src";

const WIDE_TUNING = resolveStackedDeckTuning({ stageWidth: 1_120, stageHeight: 620 });

function traversal(overrides: Partial<StackedDeckTraversal> = {}): StackedDeckTraversal {
  return {
    settledIndex: 2,
    visualTopIndex: 2,
    segmentOriginIndex: 2,
    segmentTargetIndex: null,
    direction: 0,
    signedLocalDistance: 0,
    localProgress: 0,
    phase: "idle",
    ...overrides,
  };
}

function segment(originIndex: number, direction: -1 | 1, progress: number): StackedDeckTraversal {
  return traversal({
    settledIndex: originIndex,
    visualTopIndex: originIndex,
    segmentOriginIndex: originIndex,
    segmentTargetIndex: originIndex + direction,
    direction,
    signedLocalDistance: direction * progress,
    localProgress: progress,
    phase: "traversing",
  });
}

function resolveFrame(
  activeTraversal: StackedDeckTraversal = traversal(),
  itemCount = 5,
  tuning: StackedDeckTuning = WIDE_TUNING,
  output: MutableStackedDeckFrame = createStackedDeckFrame(itemCount),
) {
  return resolveStackedDeckFrame({ itemCount, traversal: activeTraversal, tuning }, output);
}

function resolveTraversal(
  output: MutableStackedDeckTraversal,
  physicalIndex: number,
  controllerPhase: "idle" | "dragging" | "settling" = "dragging",
  settledIndex = output.settledIndex,
) {
  return resolveStackedDeckTraversal(
    { controllerPhase, itemCount: 5, physicalIndex, settledIndex },
    output,
  );
}

function frameIsFinite(frame: ReturnType<typeof resolveFrame>) {
  return frame.poses.every((pose) =>
    [
      pose.translateX,
      pose.translateY,
      pose.scale,
      pose.rotate,
      pose.opacity,
      pose.layer,
      pose.stackDepth,
      pose.shadowStrength,
    ].every(Number.isFinite),
  );
}

describe("stacked deck tuning", () => {
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

  it("keeps narrow cards inside a bleed-capable physical envelope", () => {
    const compact = resolveStackedDeckTuning({ stageWidth: 360, stageHeight: 420 });
    const medium = resolveStackedDeckTuning({ stageWidth: 768, stageHeight: 520 });
    const wide = resolveStackedDeckTuning({ stageWidth: 1_120, stageHeight: 620 });
    expect(compact.cardWidth / 360).toBeCloseTo(0.6, 2);
    expect(medium.cardWidth / 768).toBeCloseTo(0.62, 2);
    expect(wide.cardWidth / 1_120).toBeCloseTo(0.61, 2);
    expect(compact.motionPitch).toBeGreaterThan(compact.cardWidth * 0.5);
    expect(medium.motionPitch).toBeGreaterThan(compact.motionPitch);
    expect(wide.motionPitch).toBeGreaterThan(medium.motionPitch);
    for (const tuning of [compact, medium, wide]) {
      expect(tuning.backingOffsetX / tuning.cardWidth).toBeLessThan(0.012);
      expect(tuning.maximumBackingLayers).toBe(3);
    }
  });

  it("keeps direct translation while removing secondary motion in reduced motion", () => {
    const reduced = resolveStackedDeckTuning({
      stageWidth: 1_120,
      stageHeight: 620,
      reducedMotion: true,
    });
    expect(reduced.motionPitch).toBe(WIDE_TUNING.motionPitch);
    expect(reduced.backingRotate).toBe(0);
    expect(reduced.topRotate).toBe(0);
    expect(reduced.topTravelY).toBe(0);
    expect(reduced.topScaleReduction).toBe(0);
    const frame = resolveFrame(segment(2, 1, 0.6), 5, reduced);
    expect(frame.poses[2]!.translateX).toBeCloseTo(-reduced.motionPitch * 0.6);
    expect(frame.poses.every((pose) => pose.rotate === 0)).toBe(true);
  });
});

describe("segment-local stacked deck traversal", () => {
  it("maps either signed side of the visual top onto one adjacent segment", () => {
    const state = createStackedDeckTraversal(2, 5);
    const forward = resolveTraversal(state, 2.4);
    expect(forward).toMatchObject({
      visualTopIndex: 2,
      segmentOriginIndex: 2,
      segmentTargetIndex: 3,
      direction: 1,
      phase: "traversing",
    });
    expect(forward.signedLocalDistance).toBeCloseTo(0.4);
    expect(forward.localProgress).toBeCloseTo(0.4);
    expect(resolveTraversal(state, 2)).toMatchObject({
      visualTopIndex: 2,
      segmentTargetIndex: null,
      direction: 0,
      phase: "neutral",
    });
    const reverse = resolveTraversal(state, 1.6);
    expect(reverse).toMatchObject({
      visualTopIndex: 2,
      segmentOriginIndex: 2,
      segmentTargetIndex: 1,
      direction: -1,
    });
    expect(reverse.signedLocalDistance).toBeCloseTo(-0.4);
    expect(reverse.localProgress).toBeCloseTo(0.4);
  });

  it("hands visual ownership across every crossed anchor without an idle reset", () => {
    const state = createStackedDeckTraversal(0, 5);
    const samples = [0.2, 0.8, 1, 1.35, 1.9, 2.05, 2.8, 3.1, 3.9, 4].map((position) => ({
      position,
      traversal: { ...resolveTraversal(state, position, "settling", 0) },
    }));
    const visualTops = samples
      .map((sample) => sample.traversal.visualTopIndex)
      .filter((value, index, values) => index === 0 || value !== values[index - 1]);
    expect(visualTops).toEqual([0, 1, 2, 3, 4]);
    expect(samples.every((sample) => sample.traversal.phase !== "idle")).toBe(true);
    expect(
      samples.every(
        ({ traversal: sample }) =>
          sample.segmentTargetIndex === null ||
          Math.abs(sample.segmentTargetIndex - sample.segmentOriginIndex) === 1,
      ),
    ).toBe(true);
  });

  it("reverses a partial segment through the exact neutral origin", () => {
    const state = createStackedDeckTraversal(2, 5);
    const forward = { ...resolveTraversal(state, 2.6) };
    const retraced = { ...resolveTraversal(state, 2.2) };
    const neutral = { ...resolveTraversal(state, 2) };
    const reverse = { ...resolveTraversal(state, 1.8) };
    expect(forward).toMatchObject({ segmentOriginIndex: 2, segmentTargetIndex: 3, direction: 1 });
    expect(retraced).toMatchObject({ segmentOriginIndex: 2, segmentTargetIndex: 3, direction: 1 });
    expect(retraced.localProgress).toBeLessThan(forward.localProgress);
    expect(neutral).toMatchObject({
      visualTopIndex: 2,
      segmentTargetIndex: null,
      direction: 0,
      localProgress: 0,
      phase: "neutral",
    });
    expect(reverse).toMatchObject({ segmentOriginIndex: 2, segmentTargetIndex: 1, direction: -1 });
  });

  it("unwinds completed handoffs in physical order", () => {
    const state = createStackedDeckTraversal(2, 5);
    const positions = [2.7, 3.15, 3.7, 3.2, 3, 2.75, 2.1, 2, 1.8];
    const samples = positions.map((position) => ({ ...resolveTraversal(state, position) }));
    expect(samples.map((sample) => sample.visualTopIndex)).toEqual([2, 3, 3, 3, 3, 3, 3, 2, 2]);
    expect(samples[2]).toMatchObject({ segmentOriginIndex: 3, segmentTargetIndex: 4 });
    expect(samples[4]).toMatchObject({ visualTopIndex: 3, phase: "neutral" });
    expect(samples[5]).toMatchObject({ segmentOriginIndex: 3, segmentTargetIndex: 2 });
    expect(samples[7]).toMatchObject({ visualTopIndex: 2, phase: "neutral" });
    expect(samples[8]).toMatchObject({ segmentOriginIndex: 2, segmentTargetIndex: 1 });
  });

  it("retains edge elasticity without inventing a target", () => {
    const first = createStackedDeckTraversal(0, 5);
    expect(resolveTraversal(first, -0.25)).toMatchObject({
      visualTopIndex: 0,
      segmentTargetIndex: null,
      direction: -1,
      signedLocalDistance: -0.25,
      phase: "elastic",
    });
    const last = createStackedDeckTraversal(4, 5);
    expect(resolveTraversal(last, 4.2, "dragging", 4)).toMatchObject({
      visualTopIndex: 4,
      segmentTargetIndex: null,
      direction: 1,
      phase: "elastic",
    });
  });

  it("makes settled selection authoritative only when the controller becomes idle", () => {
    const state = createStackedDeckTraversal(0, 5);
    resolveTraversal(state, 3.6, "settling", 0);
    expect(state).toMatchObject({ settledIndex: 0, visualTopIndex: 3 });
    resolveTraversal(state, 4, "idle", 4);
    expect(state).toMatchObject({
      settledIndex: 4,
      visualTopIndex: 4,
      phase: "idle",
    });
  });
});

describe("symmetric stacked deck frame", () => {
  it("rests as one top card over a compact pile with hidden nonparticipants", () => {
    const frame = resolveFrame();
    expect(frame.poses.filter((pose) => pose.role === "top")).toHaveLength(1);
    expect(frame.poses.filter((pose) => pose.role === "backing")).toHaveLength(3);
    expect(frame.poses.filter((pose) => pose.role === "hidden")).toHaveLength(1);
    expect(frame.poses[3]).toMatchObject({ role: "backing", stackDepth: 1 });
    expect(frame.poses[2]).toMatchObject({
      translateX: 0,
      translateY: 0,
      scale: 1,
      rotate: 0,
      opacity: 1,
      layer: 500,
      role: "top",
      interactive: true,
      visible: true,
    });
  });

  it("maps local physical distance to opposite screen-space translation exactly", () => {
    for (const progress of [0.1, 0.25, 0.5, 0.75, 0.99]) {
      const forward = resolveFrame(segment(2, 1, progress));
      const backward = resolveFrame(segment(2, -1, progress));
      expect(forward.poses[2]!.translateX).toBeCloseTo(-WIDE_TUNING.motionPitch * progress);
      expect(backward.poses[2]!.translateX).toBeCloseTo(WIDE_TUNING.motionPitch * progress);
      expect(forward.poses[2]!.translateX).toBeCloseTo(-backward.poses[2]!.translateX);
      expect(forward.poses[2]!.translateY).toBeCloseTo(backward.poses[2]!.translateY);
      expect(forward.poses[2]!.rotate).toBeCloseTo(-backward.poses[2]!.rotate);
    }
  });

  it("puts only the adjacent target beneath the top and never creates a rail", () => {
    for (const direction of [-1, 1] as const) {
      const frame = resolveFrame(segment(2, direction, 0.55), 9);
      expect(frame.poses[2]).toMatchObject({ role: "top", layer: 500 });
      expect(frame.poses[2 + direction]).toMatchObject({ role: "target", layer: 400 });
      expect(frame.poses.filter((pose) => pose.visible)).toHaveLength(4);
      expect(
        frame.poses
          .filter((pose) => pose.role === "backing" || pose.role === "target")
          .every((pose) => Math.abs(pose.translateX) < WIDE_TUNING.cardWidth * 0.03),
      ).toBe(true);
      expect(frame.poses.filter((pose) => pose.interactive)).toHaveLength(0);
    }
  });

  it("keeps the visual top authoritative until the exact handoff boundary", () => {
    const frame = resolveFrame(segment(2, 1, 0.999));
    expect(frame.visualTopIndex).toBe(2);
    expect(frame.poses[2]).toMatchObject({ role: "top", opacity: 1, visible: true, layer: 500 });
    expect(frame.poses[3]).toMatchObject({ role: "target", opacity: 1, visible: true, layer: 400 });
  });

  it("starts a forward target at the first backing card geometry", () => {
    const rest = resolveFrame();
    const start = resolveFrame(segment(2, 1, 0.0001));
    for (const key of ["translateX", "translateY", "scale", "rotate"] as const) {
      expect(start.poses[3]![key]).toBeCloseTo(rest.poses[3]![key], 5);
    }
    expect(rest.poses[3]).toMatchObject({ role: "backing", stackDepth: 1 });
    expect(start.poses[3]).toMatchObject({ role: "target", stackDepth: 1 });
  });

  it("arrives at exact target rest geometry before a handoff", () => {
    const final = resolveFrame(segment(2, 1, 1));
    const target = final.poses[3]!;
    expect(target).toMatchObject({
      translateX: 0,
      translateY: 0,
      scale: 1,
      rotate: 0,
      opacity: 1,
      role: "target",
    });
    expect(final.poses[2]).toMatchObject({ opacity: 0, visible: false });
    const settled = resolveFrame(
      traversal({ settledIndex: 3, visualTopIndex: 3, segmentOriginIndex: 3 }),
    );
    for (const key of ["translateX", "translateY", "scale", "rotate", "opacity"] as const) {
      expect(target[key]).toBe(settled.poses[3]![key]);
    }
  });

  it("projects elastic edge movement from the same signed mapping", () => {
    const edge = traversal({
      settledIndex: 0,
      visualTopIndex: 0,
      segmentOriginIndex: 0,
      direction: -1,
      signedLocalDistance: -0.25,
      localProgress: 0.25,
      phase: "elastic",
    });
    const frame = resolveFrame(edge);
    expect(frame.segmentTargetIndex).toBeNull();
    expect(frame.poses[0]!.translateX).toBeCloseTo(WIDE_TUNING.motionPitch * 0.25);
    expect(frame.poses.filter((pose) => pose.role === "target")).toHaveLength(0);
  });

  it("keeps every value finite and reuses caller storage", () => {
    const output = createStackedDeckFrame(5);
    const poseIdentities = [...output.poses];
    for (let step = 1; step <= 200; step += 1) {
      expect(frameIsFinite(resolveFrame(segment(2, 1, step / 200), 5, WIDE_TUNING, output))).toBe(
        true,
      );
      expect(frameIsFinite(resolveFrame(segment(2, -1, step / 200), 5, WIDE_TUNING, output))).toBe(
        true,
      );
    }
    expect(output.poses.every((pose, index) => pose === poseIdentities[index])).toBe(true);
  });

  it("handles empty and single-item frames and rejects invalid segments", () => {
    const emptyTraversal = createStackedDeckTraversal(-1, 0);
    const empty = resolveFrame(emptyTraversal, 0);
    expect(empty).toMatchObject({ visualTopIndex: -1, poses: [] });
    const singleTraversal = createStackedDeckTraversal(0, 1);
    const single = resolveFrame(singleTraversal, 1);
    expect(single.poses[0]).toMatchObject({ role: "top", interactive: true });
    expect(() => createStackedDeckTraversal(1, 1)).toThrow(RangeError);
    expect(() => resolveFrame({ ...segment(2, 1, 0.5), segmentTargetIndex: 4 })).toThrow(
      RangeError,
    );
    expect(() => resolveFrame({ ...segment(2, 1, 0.5), signedLocalDistance: Number.NaN })).toThrow(
      TypeError,
    );
  });
});
