import { describe, expect, it } from "vitest";

import {
  createStackedDeckFrame,
  createStackedDeckTraversal,
  resolveStackedDeckFrame,
  resolveStackedDeckPile,
  resolveStackedDeckTraversal,
  resolveStackedDeckTuning,
  type MutableStackedDeckFrame,
  type MutableStackedDeckTraversal,
  type StackedDeckPose,
  type StackedDeckTraversal,
  type StackedDeckTuning,
} from "../src";

const WIDE_TUNING = resolveStackedDeckTuning({ stageWidth: 1_120, stageHeight: 620 });
const SEGMENT_SAMPLES = [0.1, 0.25, 0.5, 0.7, 0.85, 0.95] as const;

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

function span(pose: StackedDeckPose, tuning: StackedDeckTuning) {
  const half = (tuning.cardWidth * pose.scale) / 2;
  return { left: pose.translateX - half, right: pose.translateX + half, width: half * 2 };
}

/**
 * Perceptual dominance of one local segment.
 *
 * `targetVisibility` is the share of the target rendered at full strength: area the outgoing card
 * no longer covers, plus covered area seen through whatever opacity the outgoing card has left.
 * `outgoingDominance` is the outgoing card's rendered visual weight relative to a resting card.
 */
function dominance(frame: ReturnType<typeof resolveFrame>, tuning: StackedDeckTuning) {
  const outgoing = frame.poses.find((pose) => pose.role === "top")!;
  const target = frame.poses.find((pose) => pose.role === "target")!;
  const outgoingSpan = span(outgoing, tuning);
  const targetSpan = span(target, tuning);
  const overlap = Math.max(
    0,
    Math.min(outgoingSpan.right, targetSpan.right) - Math.max(outgoingSpan.left, targetSpan.left),
  );
  const exposed = 1 - overlap / targetSpan.width;
  return {
    exposed,
    targetVisibility: 1 - (1 - exposed) * outgoing.opacity,
    outgoingDominance: outgoing.opacity * outgoing.scale * outgoing.scale,
  };
}

interface RenderedCrossing {
  readonly label: string;
  readonly vacatedOpacity: number;
  readonly vacatedScale: number;
  readonly vacatedStillVisible: boolean;
  readonly promotedWasTargetRole: string;
  readonly promotedWasTargetOpacity: number;
  readonly scaleJump: number;
  readonly rotateJump: number;
  readonly promotedLayerLead: number;
}

function expectCoherentCrossings(
  result: { crossings: readonly RenderedCrossing[]; visibleCounts: readonly number[] },
  limits: { opacity: number; scale: number; rotate: number },
) {
  const { crossings, visibleCounts } = result;
  expect(Math.max(...visibleCounts)).toBeLessThanOrEqual(2);
  // The vacated card always leaves from an already subordinate pose, never a normal one.
  expect(crossings.every((crossing) => crossing.vacatedOpacity < limits.opacity)).toBe(true);
  expect(crossings.every((crossing) => crossing.vacatedScale < 1)).toBe(true);
  expect(crossings.every((crossing) => !crossing.vacatedStillVisible)).toBe(true);
  // The promoted card was already the fully opaque adjacent target before it took ownership.
  expect(crossings.every((crossing) => crossing.promotedWasTargetRole === "target")).toBe(true);
  expect(crossings.every((crossing) => crossing.promotedWasTargetOpacity === 1)).toBe(true);
  expect(crossings.every((crossing) => crossing.scaleJump < limits.scale)).toBe(true);
  expect(crossings.every((crossing) => crossing.rotateJump < limits.rotate)).toBe(true);
  // Paint order can never invert: the promoted card is already the highest visible layer.
  expect(crossings.every((crossing) => crossing.promotedLayerLead > 0)).toBe(true);
  return crossings.map((crossing) => crossing.label);
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

  it("gives every profile a deck pitch long enough to clear the outgoing card", () => {
    const compact = resolveStackedDeckTuning({ stageWidth: 360, stageHeight: 420 });
    const medium = resolveStackedDeckTuning({ stageWidth: 768, stageHeight: 520 });
    const wide = resolveStackedDeckTuning({ stageWidth: 1_120, stageHeight: 620 });
    for (const tuning of [compact, medium, wide]) {
      const ratio = tuning.motionPitch / tuning.cardWidth;
      // The rejected build handed ownership over after well under two thirds of a card width.
      expect(ratio).toBeGreaterThan(0.75);
      expect(ratio).toBeLessThan(0.95);
      // A full pitch must leave the target essentially uncovered before ownership changes.
      const handoff = resolveFrame(segment(2, 1, 1), 5, tuning);
      const { exposed } = dominance(handoff, tuning);
      expect(exposed).toBeGreaterThan(0.85);
    }
    // Narrow screens keep the absolute drag distance reachable by one thumb sweep.
    expect(compact.motionPitch).toBeLessThan(medium.motionPitch);
    expect(medium.motionPitch).toBeLessThan(wide.motionPitch);
  });

  it("keeps direct translation while removing secondary motion in reduced motion", () => {
    const reduced = resolveStackedDeckTuning({
      stageWidth: 1_120,
      stageHeight: 620,
      reducedMotion: true,
    });
    expect(reduced.motionPitch).toBe(WIDE_TUNING.motionPitch);
    expect(reduced.pileRotate).toBe(0);
    expect(reduced.topRotate).toBe(0);
    expect(reduced.topDropY).toBe(0);
    expect(reduced.topScaleReduction).toBe(0);
    // Depth still has to read as a pile, and ownership still has to migrate.
    expect(reduced.pileScaleStep).toBe(WIDE_TUNING.pileScaleStep);
    const frame = resolveFrame(segment(2, 1, 0.6), 5, reduced);
    expect(frame.poses[2]!.translateX).toBeCloseTo(-reduced.motionPitch * 0.6);
    expect(frame.poses.every((pose) => pose.rotate === 0)).toBe(true);
    expect(frame.poses[2]!.opacity).toBeLessThan(1);
    expect(frame.poses[3]!.scale).toBeLessThan(1);
  });
});

describe("decorative stacked deck pile", () => {
  it("resolves deterministic depth that no gesture can reorder or mirror", () => {
    const pile = resolveStackedDeckPile(WIDE_TUNING);
    expect(pile).toHaveLength(WIDE_TUNING.pileLayers);
    expect(pile).toEqual(resolveStackedDeckPile(WIDE_TUNING));
    expect(pile.map((layer) => layer.depth)).toEqual([1, 2, 3]);
    for (const [index, layer] of pile.entries()) {
      expect(layer.translateX).toBeGreaterThan(0);
      expect(layer.translateY).toBeGreaterThan(0);
      expect(layer.scale).toBeLessThan(1);
      if (index === 0) continue;
      const previous = pile[index - 1]!;
      expect(layer.translateX).toBeGreaterThan(previous.translateX);
      expect(layer.translateY).toBeGreaterThan(previous.translateY);
      expect(layer.scale).toBeLessThan(previous.scale);
      expect(layer.layer).toBeLessThan(previous.layer);
      expect(layer.shadowStrength).toBeLessThanOrEqual(previous.shadowStrength);
      // Each deeper layer must still show an exposed edge beyond the one above it.
      const edge = (candidate: typeof layer) =>
        candidate.translateX + (WIDE_TUNING.cardWidth * candidate.scale) / 2;
      expect(edge(layer)).toBeGreaterThan(edge(previous));
    }
    expect(pile[0]!.translateX + (WIDE_TUNING.cardWidth * pile[0]!.scale) / 2).toBeGreaterThan(
      WIDE_TUNING.cardWidth / 2,
    );
  });

  it("starts either direction's target from the identical first pile slot", () => {
    const pile = resolveStackedDeckPile(WIDE_TUNING);
    const forward = resolveFrame(segment(2, 1, 0.0001)).poses[3]!;
    const backward = resolveFrame(segment(2, -1, 0.0001)).poses[1]!;
    for (const key of ["translateX", "translateY", "scale", "rotate"] as const) {
      expect(forward[key]).toBeCloseTo(pile[0]![key], 3);
      expect(backward[key]).toBeCloseTo(pile[0]![key], 3);
      expect(forward[key]).toBeCloseTo(backward[key], 6);
    }
    expect(forward.layer).toBe(backward.layer);
    expect(forward.layer).toBeGreaterThan(pile[0]!.layer);
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

describe("stacked deck visual dominance", () => {
  it("rests as one interactive top card with no other content-bearing face", () => {
    const frame = resolveFrame();
    expect(frame.poses.filter((pose) => pose.visible)).toHaveLength(1);
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
    expect(frame.poses.filter((pose) => pose.role === "hidden")).toHaveLength(4);
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
      expect(forward.poses[2]!.opacity).toBeCloseTo(backward.poses[2]!.opacity);
    }
  });

  it("renders only the manipulated top and one adjacent target", () => {
    for (const direction of [-1, 1] as const) {
      const frame = resolveFrame(segment(2, direction, 0.55), 9);
      expect(frame.poses[2]).toMatchObject({ role: "top", layer: 500 });
      expect(frame.poses[2 + direction]).toMatchObject({ role: "target", layer: 400 });
      expect(frame.poses.filter((pose) => pose.visible)).toHaveLength(2);
      expect(frame.poses.filter((pose) => pose.interactive)).toHaveLength(0);
      // The target rises in place; it never joins a horizontal rail.
      expect(Math.abs(frame.poses[2 + direction]!.translateX)).toBeLessThan(
        WIDE_TUNING.cardWidth * 0.06,
      );
    }
  });

  it("subordinates the outgoing card monotonically across the whole segment", () => {
    const outgoing = [0.0001, ...SEGMENT_SAMPLES, 1].map(
      (progress) => resolveFrame(segment(2, 1, progress)).poses[2]!,
    );
    const steps = outgoing.slice(1).map((pose, index) => {
      const before = outgoing[index]!;
      return {
        translateX: pose.translateX - before.translateX,
        translateY: pose.translateY - before.translateY,
        scale: pose.scale - before.scale,
        rotate: pose.rotate - before.rotate,
        opacity: pose.opacity - before.opacity,
        shadowStrength: pose.shadowStrength - before.shadowStrength,
      };
    });
    expect(steps.every((step) => step.translateX < 0)).toBe(true);
    expect(steps.every((step) => step.translateY > 0)).toBe(true);
    expect(steps.every((step) => step.scale < 0)).toBe(true);
    expect(steps.every((step) => step.rotate < 0)).toBe(true);
    expect(steps.every((step) => step.opacity <= 0)).toBe(true);
    expect(steps.every((step) => step.shadowStrength < 0)).toBe(true);
  });

  it("promotes the target monotonically to exact top rest geometry", () => {
    const targets = [0.0001, ...SEGMENT_SAMPLES, 1].map(
      (progress) => resolveFrame(segment(2, 1, progress)).poses[3]!,
    );
    const steps = targets.slice(1).map((pose, index) => {
      const before = targets[index]!;
      return {
        translateX: pose.translateX - before.translateX,
        translateY: pose.translateY - before.translateY,
        scale: pose.scale - before.scale,
        rotate: pose.rotate - before.rotate,
        shadowStrength: pose.shadowStrength - before.shadowStrength,
      };
    });
    expect(steps.every((step) => step.translateX < 0)).toBe(true);
    expect(steps.every((step) => step.translateY < 0)).toBe(true);
    expect(steps.every((step) => step.scale > 0)).toBe(true);
    expect(steps.every((step) => step.rotate < 0)).toBe(true);
    expect(steps.every((step) => step.shadowStrength > 0)).toBe(true);

    const arrival = resolveFrame(segment(2, 1, 1)).poses[3]!;
    const settled = resolveFrame(
      traversal({ settledIndex: 3, visualTopIndex: 3, segmentOriginIndex: 3 }),
    ).poses[3]!;
    for (const key of ["translateX", "translateY", "scale", "rotate", "opacity"] as const) {
      expect(arrival[key]).toBe(settled[key]);
    }
    expect(arrival).toMatchObject({
      translateX: 0,
      translateY: 0,
      scale: 1,
      rotate: 0,
      opacity: 1,
    });
  });

  it("migrates authority from the outgoing card to the target well before the handoff", () => {
    for (const direction of [-1, 1] as const) {
      const readings = SEGMENT_SAMPLES.map((progress) => ({
        progress,
        ...dominance(resolveFrame(segment(2, direction, progress)), WIDE_TUNING),
      }));

      const early = readings[0]!;
      expect(early.outgoingDominance).toBeGreaterThan(early.targetVisibility * 3);
      const quarter = readings[1]!;
      expect(quarter.outgoingDominance).toBeGreaterThan(quarter.targetVisibility * 2);

      const late = readings.at(-2)!;
      expect(late.targetVisibility).toBeGreaterThan(late.outgoingDominance * 3);
      const final = readings.at(-1)!;
      expect(final.outgoingDominance).toBeLessThan(0.05);
      expect(final.targetVisibility).toBeGreaterThan(0.95);

      for (let index = 1; index < readings.length; index += 1) {
        expect(readings[index]!.targetVisibility).toBeGreaterThan(
          readings[index - 1]!.targetVisibility,
        );
        expect(readings[index]!.outgoingDominance).toBeLessThan(
          readings[index - 1]!.outgoingDominance,
        );
      }

      const crossing = readings.findIndex(
        (reading) => reading.targetVisibility >= reading.outgoingDominance,
      );
      expect(crossing).toBeGreaterThan(0);
      expect(readings[crossing]!.progress).toBeLessThan(0.75);
    }
  });

  it("never lets both faces read as full-strength peers", () => {
    for (const direction of [-1, 1] as const) {
      for (let step = 1; step <= 200; step += 1) {
        const reading = dominance(resolveFrame(segment(2, direction, step / 200)), WIDE_TUNING);
        expect(Math.min(reading.targetVisibility, reading.outgoingDominance)).toBeLessThan(0.75);
      }
    }
  });

  it("finishes the outgoing dissolve before ownership can change", () => {
    // The default release policy caps travel near a fifth of a pitch per rendered frame, so the
    // last sample before an anchor crossing always lands inside the tail of the dissolve.
    for (const progress of [0.92, 0.95, 0.99, 1]) {
      const outgoing = resolveFrame(segment(2, 1, progress)).poses[2]!;
      expect(outgoing.opacity).toBe(0);
      expect(outgoing.visible).toBe(false);
    }
    expect(resolveFrame(segment(2, 1, 0.8)).poses[2]!.opacity).toBeLessThan(0.25);
    expect(resolveFrame(segment(2, 1, 0.4)).poses[2]!.opacity).toBe(1);
  });
});

describe("stacked deck handoff continuity", () => {
  it("keeps every promoted property continuous across an exact anchor crossing", () => {
    for (const direction of [-1, 1] as const) {
      const targetIndex = 2 + direction;
      const crossing = resolveFrame(segment(2, direction, 1));
      const before = crossing.poses[targetIndex]!;
      // One rendered frame past the boundary the promoted card owns the segment itself.
      const after = resolveFrame(segment(targetIndex, direction, 0.0004)).poses[targetIndex]!;
      expect(Math.abs(after.translateX - before.translateX)).toBeLessThan(0.5);
      for (const key of ["translateY", "scale", "rotate", "opacity", "shadowStrength"] as const) {
        expect(after[key]).toBeCloseTo(before[key], 4);
      }
      expect(before.layer).toBeLessThan(after.layer);
      // The vacated card is already invisible on the pre-boundary side, so nothing can pop.
      expect(crossing.poses[2]).toMatchObject({ opacity: 0, visible: false });
    }
  });

  /** Replays a rendering-sample sequence and collects what happened at each ownership change. */
  function traceCrossings(samples: readonly number[]) {
    const state = createStackedDeckTraversal(0, 5);
    const output = createStackedDeckFrame(5);
    const crossings: RenderedCrossing[] = [];
    const visibleCounts: number[] = [];
    let previous: { poses: StackedDeckPose[]; visualTopIndex: number } | undefined;
    for (const physicalIndex of samples) {
      const active = resolveTraversal(state, physicalIndex, "settling", 0);
      const frame = resolveFrame({ ...active }, 5, WIDE_TUNING, output);
      const poses = frame.poses.map((pose) => ({ ...pose }));
      const promoted = frame.visualTopIndex;
      const vacated = previous?.visualTopIndex ?? promoted;
      if (previous !== undefined && vacated !== promoted) {
        const wasTarget = previous.poses[promoted]!;
        crossings.push({
          label: `${vacated}->${promoted}`,
          vacatedOpacity: previous.poses[vacated]!.opacity,
          vacatedScale: previous.poses[vacated]!.scale,
          vacatedStillVisible: poses[vacated]!.visible,
          promotedWasTargetRole: wasTarget.role,
          promotedWasTargetOpacity: wasTarget.opacity,
          scaleJump: Math.abs(poses[promoted]!.scale - wasTarget.scale),
          rotateJump: Math.abs(poses[promoted]!.rotate - wasTarget.rotate),
          promotedLayerLead:
            poses[promoted]!.layer -
            Math.max(...poses.filter((pose) => pose.role !== "top").map((pose) => pose.layer)),
        });
      }
      visibleCounts.push(poses.filter((pose) => pose.visible).length);
      previous = { poses, visualTopIndex: frame.visualTopIndex };
    }
    return { crossings, visibleCounts };
  }

  it("stays continuous when a rendering sample skips the anchor entirely", () => {
    // Deliberately coarser than any velocity the default release policy can produce.
    const result = traceCrossings([
      0.15, 0.4, 0.62, 0.82, 1.17, 1.35, 1.71, 2.14, 2.55, 2.89, 3.22,
    ]);
    expect(expectCoherentCrossings(result, { opacity: 0.55, scale: 0.02, rotate: 0.5 })).toEqual([
      "0->1",
      "1->2",
      "2->3",
    ]);
  });

  it("keeps the fastest permitted traversal inside the dissolved tail", () => {
    // The capped release velocity crosses at most about a fifth of a pitch per rendered frame.
    const samples = Array.from({ length: 21 }, (_unused, step) => Number((step * 0.2).toFixed(2)));
    const result = traceCrossings(samples);
    expect(expectCoherentCrossings(result, { opacity: 0.25, scale: 0.01, rotate: 0.12 })).toEqual([
      "0->1",
      "1->2",
      "2->3",
      "3->4",
    ]);
  });

  it("retraces a reversed segment through the identical poses", () => {
    const forward = [0.2, 0.55, 0.8].map((progress) => resolveFrame(segment(2, 1, progress)));
    const reversed = [0.8, 0.55, 0.2].map((progress) => resolveFrame(segment(2, 1, progress)));
    for (let index = 0; index < forward.length; index += 1) {
      const outbound = forward[index]!.poses;
      const inbound = reversed[forward.length - 1 - index]!.poses;
      for (const key of ["translateX", "translateY", "scale", "rotate", "opacity"] as const) {
        expect(inbound[2]![key]).toBe(outbound[2]![key]);
        expect(inbound[3]![key]).toBe(outbound[3]![key]);
      }
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
    expect(frame.poses[0]).toMatchObject({ opacity: 1, scale: 1, rotate: 0, role: "top" });
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
    expect(() => resolveStackedDeckPile({ ...WIDE_TUNING, pileLayers: 0 })).toThrow(RangeError);
  });
});
