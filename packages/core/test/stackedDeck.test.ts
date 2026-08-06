import { describe, expect, it } from "vitest";

import {
  createStackedDeckFrame,
  resolveStackedDeckFrame,
  resolveStackedDeckTuning,
  type MutableStackedDeckFrame,
  type StackedDeckTransition,
  type StackedDeckTuning,
} from "../src";

const WIDE_TUNING = resolveStackedDeckTuning({ stageWidth: 1_120, stageHeight: 620 });

function idle(settledIndex: number): StackedDeckTransition {
  return {
    settledIndex,
    fromIndex: settledIndex,
    toIndex: settledIndex,
    direction: 0,
    progress: 0,
    phase: "idle",
  };
}

function exchange(fromIndex: number, toIndex: number, progress: number): StackedDeckTransition {
  return {
    settledIndex: fromIndex,
    fromIndex,
    toIndex,
    direction: Math.sign(toIndex - fromIndex) as -1 | 1,
    progress,
    phase: progress < 0.34 ? "peel" : progress < 0.78 ? "handoff" : "settle",
  };
}

function resolveFrame(
  transition: StackedDeckTransition = idle(2),
  itemCount = 5,
  tuning: StackedDeckTuning = WIDE_TUNING,
  output: MutableStackedDeckFrame = createStackedDeckFrame(itemCount),
) {
  return resolveStackedDeckFrame({ itemCount, transition, tuning }, output);
}

function frameIsFinite(frame: ReturnType<typeof resolveFrame>) {
  return frame.poses.every((pose) =>
    [
      pose.translateX,
      pose.translateY,
      pose.scale,
      pose.rotate,
      pose.opacity,
      pose.reveal,
      pose.layer,
      pose.stackDepth,
      pose.shadowStrength,
    ].every(Number.isFinite),
  );
}

describe("physical stacked deck tuning", () => {
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

  it("keeps the card responsive while the backing offsets remain restrained", () => {
    const wide = resolveStackedDeckTuning({ stageWidth: 1_120, stageHeight: 620 });
    const medium = resolveStackedDeckTuning({ stageWidth: 768, stageHeight: 520 });
    const compact = resolveStackedDeckTuning({ stageWidth: 360, stageHeight: 420 });
    expect(wide.cardWidth / 1_120).toBeCloseTo(0.61, 2);
    expect(medium.cardWidth / 768).toBeCloseTo(0.74, 2);
    expect(compact.cardWidth / 360).toBeCloseTo(0.9, 2);
    for (const tuning of [wide, medium, compact]) {
      expect(tuning.backingOffsetX / tuning.cardWidth).toBeLessThan(0.012);
      expect(tuning.backingOffsetY / tuning.cardHeight).toBeLessThanOrEqual(0.020_000_001);
      expect(tuning.maximumBackingLayers).toBe(3);
    }
  });

  it("removes rotation and compresses displacement under reduced motion", () => {
    const full = resolveStackedDeckTuning({ stageWidth: 1_120, stageHeight: 620 });
    const reduced = resolveStackedDeckTuning({
      stageWidth: 1_120,
      stageHeight: 620,
      reducedMotion: true,
    });
    expect(reduced.backingRotate).toBe(0);
    expect(reduced.forwardRotate).toBe(0);
    expect(reduced.reverseRotate).toBe(0);
    expect(reduced.forwardPeelX).toBeLessThan(full.forwardPeelX);
    expect(Math.abs(reduced.reverseExcursionX)).toBeLessThan(Math.abs(full.reverseExcursionX));
    expect(
      resolveFrame(exchange(2, 3, 0.6), 5, reduced).poses.every((pose) => pose.rotate === 0),
    ).toBe(true);
  });
});

describe("physical stacked deck frame", () => {
  it("rests as one top card over a compact, one-sided backing pile", () => {
    const frame = resolveFrame(idle(2));
    expect(frame).toMatchObject({
      settledIndex: 2,
      fromIndex: 2,
      toIndex: 2,
      direction: 0,
      progress: 0,
      phase: "idle",
    });
    expect(frame.poses.filter((pose) => pose.role === "top")).toHaveLength(1);
    expect(frame.poses.filter((pose) => pose.role === "backing")).toHaveLength(3);
    expect(frame.poses.filter((pose) => pose.role === "hidden")).toHaveLength(1);
    expect(frame.poses[2]).toMatchObject({
      translateX: 0,
      translateY: 0,
      scale: 1,
      rotate: 0,
      opacity: 1,
      reveal: 1,
      layer: 500,
      role: "top",
      interactive: true,
      visible: true,
    });
    const backing = frame.poses.filter((pose) => pose.role === "backing");
    expect(backing.every((pose) => pose.translateX > 0 && pose.translateY > 0)).toBe(true);
    expect(Math.max(...backing.map((pose) => pose.translateX))).toBeLessThan(
      WIDE_TUNING.cardWidth * 0.03,
    );
    expect(frame.poses.filter((pose) => pose.interactive)).toHaveLength(1);
  });

  it("does not assign every item a horizontal carousel slot", () => {
    const frame = resolveFrame(idle(0), 9);
    const visible = frame.poses.filter((pose) => pose.visible);
    expect(visible).toHaveLength(4);
    expect(visible.every((pose) => Math.abs(pose.translateX) < WIDE_TUNING.cardWidth * 0.03)).toBe(
      true,
    );
    expect(frame.poses.filter((pose) => pose.role === "hidden")).toHaveLength(5);
  });

  it("uses explicit outgoing and incoming roles for a forward reveal", () => {
    for (const progress of [0, 0.2, 0.5, 0.8, 0.99]) {
      const frame = resolveFrame(exchange(2, 3, progress));
      const outgoing = frame.poses[2]!;
      const incoming = frame.poses[3]!;
      expect(outgoing.role).toBe("outgoing");
      expect(incoming.role).toBe("incoming");
      expect(outgoing.layer).toBe(500);
      expect(incoming.layer).toBe(400);
      expect(Math.abs(incoming.translateX)).toBeLessThan(WIDE_TUNING.cardWidth * 0.012);
      expect(
        progress === 0 ||
          Math.abs(outgoing.translateX) >
            Math.abs(incoming.translateX - WIDE_TUNING.backingOffsetX),
      ).toBe(true);
      expect(
        frame.poses
          .filter((_, index) => index !== 2 && index !== 3)
          .every(
            (pose) => !pose.visible || Math.abs(pose.translateX) < WIDE_TUNING.cardWidth * 0.03,
          ),
      ).toBe(true);
    }
  });

  it("keeps forward displacement monotonic without a disproportionate late spike", () => {
    const displacements = Array.from(
      { length: 101 },
      (_, step) => resolveFrame(exchange(2, 3, step / 100)).poses[2]!.translateX,
    );
    const increments = displacements.slice(1).map((value, index) => value - displacements[index]!);
    expect(increments.every((increment) => increment >= 0)).toBe(true);
    const middlePeak = Math.max(...increments.slice(40, 80));
    const latePeak = Math.max(...increments.slice(90));
    expect(latePeak).toBeLessThanOrEqual(middlePeak);
    expect(displacements[10]! / WIDE_TUNING.forwardPeelX).toBeGreaterThan(0.015);
    expect(displacements[25]! / WIDE_TUNING.forwardPeelX).toBeGreaterThan(0.09);
  });

  it("conceals the forward outgoing card before the final layer transfer", () => {
    const late = resolveFrame(exchange(2, 3, 0.9995));
    const final = resolveFrame(exchange(2, 3, 1));
    expect(late.poses[2]!.layer).toBe(500);
    expect(late.poses[3]!.layer).toBe(400);
    expect(late.poses[2]!.opacity).toBeLessThan(0.001);
    expect(late.poses[2]!.reveal).toBe(1);
    expect(final.poses[2]!.visible).toBe(false);
    const settled = resolveFrame(idle(3));
    expect(final.poses[3]).toMatchObject({
      translateX: settled.poses[3]!.translateX,
      translateY: settled.poses[3]!.translateY,
      scale: settled.poses[3]!.scale,
      rotate: settled.poses[3]!.rotate,
      opacity: settled.poses[3]!.opacity,
      reveal: settled.poses[3]!.reveal,
    });
  });

  it("retrieves the previous card on one continuous upper layer", () => {
    let previousReveal = 0;
    for (const progress of [0, 0.001, 0.2, 0.42, 0.7, 0.99, 1]) {
      const frame = resolveFrame(exchange(2, 1, progress));
      const outgoing = frame.poses[2]!;
      const incoming = frame.poses[1]!;
      expect(outgoing.role).toBe("outgoing");
      expect(incoming.role).toBe("incoming");
      expect(incoming.layer).toBe(500);
      expect(outgoing.layer).toBe(400);
      expect(incoming.reveal).toBeGreaterThanOrEqual(previousReveal);
      previousReveal = incoming.reveal;
    }
    const concealedStart = resolveFrame(exchange(2, 1, 0));
    expect(concealedStart.poses[1]).toMatchObject({ opacity: 1, reveal: 0, visible: false });
    const settled = resolveFrame(idle(1));
    const final = resolveFrame(exchange(2, 1, 1));
    expect(final.poses[1]).toMatchObject({
      translateX: settled.poses[1]!.translateX,
      translateY: settled.poses[1]!.translateY,
      scale: settled.poses[1]!.scale,
      rotate: settled.poses[1]!.rotate,
      reveal: 1,
    });
    expect(final.poses[2]).toMatchObject({
      translateX: settled.poses[2]!.translateX,
      translateY: settled.poses[2]!.translateY,
      scale: settled.poses[2]!.scale,
      rotate: settled.poses[2]!.rotate,
      stackDepth: 1,
    });
  });

  it("holds the backward deck aperture at the pile during excursion before lifting it", () => {
    const early = resolveFrame(exchange(2, 1, 0.2)).poses[1]!;
    const liftStart = resolveFrame(exchange(2, 1, 0.28)).poses[1]!;
    const lifted = resolveFrame(exchange(2, 1, 0.65)).poses[1]!;
    expect(early.translateX).toBeLessThan(0);
    expect(early.reveal).toBe(0);
    expect(liftStart.reveal).toBe(0);
    expect(lifted.reveal).toBeGreaterThan(0);
    expect(lifted.reveal).toBeLessThan(1);
  });

  it("never switches visible exchange layers at a progress threshold", () => {
    for (const direction of [1, -1] as const) {
      const toIndex = 2 + direction;
      const layerPairs = [];
      for (let step = 1; step < 100; step += 1) {
        const frame = resolveFrame(exchange(2, toIndex, step / 100));
        layerPairs.push([frame.poses[2]!.layer, frame.poses[toIndex]!.layer]);
      }
      expect(new Set(layerPairs.map((layers) => layers.join(":"))).size).toBe(1);
    }
  });

  it("keeps backing cards compact and non-participating during either exchange", () => {
    for (const transition of [exchange(2, 3, 0.55), exchange(2, 1, 0.55)]) {
      const frame = resolveFrame(transition, 9);
      const pileLayers = frame.poses.filter(
        (pose) =>
          pose.role === "backing" ||
          (transition.direction === 1 ? pose.role === "incoming" : pose.role === "outgoing"),
      );
      expect(pileLayers).toHaveLength(3);
      expect(
        pileLayers.every(
          (pose) => pose.translateX > 0 && pose.translateX < WIDE_TUNING.cardWidth * 0.03,
        ),
      ).toBe(true);
      expect(pileLayers.every((pose) => !pose.interactive)).toBe(true);
    }
  });

  it("keeps every value finite across complete forward and backward exchanges", () => {
    for (let step = 0; step <= 200; step += 1) {
      expect(frameIsFinite(resolveFrame(exchange(2, 3, step / 200)))).toBe(true);
      expect(frameIsFinite(resolveFrame(exchange(2, 1, step / 200)))).toBe(true);
    }
  });

  it("handles empty and single-item frames", () => {
    const empty = resolveFrame(idle(-1), 0);
    expect(empty).toMatchObject({ settledIndex: -1, poses: [] });
    const single = resolveFrame(idle(0), 1);
    expect(single.poses).toHaveLength(1);
    expect(single.poses[0]).toMatchObject({ role: "top", interactive: true });
    expect(frameIsFinite(single)).toBe(true);
  });

  it("reuses caller storage without mutating tuning input", () => {
    const tuningSnapshot = structuredClone(WIDE_TUNING);
    const output = createStackedDeckFrame(5);
    const poseIdentities = [...output.poses];
    expect(resolveFrame(exchange(1, 2, 0.25), 5, WIDE_TUNING, output)).toBe(output);
    expect(resolveFrame(exchange(1, 2, 0.75), 5, WIDE_TUNING, output)).toBe(output);
    expect(output.poses.every((pose, index) => pose === poseIdentities[index])).toBe(true);
    expect(WIDE_TUNING).toEqual(tuningSnapshot);
  });

  it("rejects invalid frame, transition, and tuning inputs", () => {
    expect(() => createStackedDeckFrame(1.5)).toThrow(RangeError);
    expect(() =>
      resolveFrame({ ...exchange(0, 1, 0.5), progress: Number.POSITIVE_INFINITY }),
    ).toThrow(TypeError);
    expect(() =>
      resolveStackedDeckFrame(
        { itemCount: 5, transition: idle(2), tuning: WIDE_TUNING },
        createStackedDeckFrame(4),
      ),
    ).toThrow(RangeError);
    expect(() => resolveFrame({ ...idle(2), direction: 1 })).toThrow(RangeError);
    expect(() => resolveFrame({ ...exchange(2, 3, 0.5), direction: -1 })).toThrow(RangeError);
  });
});
