import { describe, expect, it } from "vitest";

import {
  createStackedDeckFrame,
  createStackedDeckTraversal,
  isStackedDeckAuthorityStable,
  resolveStackedDeckFrame,
  resolveStackedDeckPile,
  resolveStackedDeckTraversal,
  resolveStackedDeckTuning,
  type MutableStackedDeckFrame,
  type MutableStackedDeckTraversal,
  type StackedDeckDirectProjection,
  type StackedDeckPose,
  type StackedDeckTraversal,
  type StackedDeckTuning,
} from "../src";

const WIDE_TUNING = resolveStackedDeckTuning({ stageWidth: 1_120, stageHeight: 620 });
const SEGMENT_SAMPLES = [0.1, 0.25, 0.5, 0.7, 0.85, 0.95] as const;
const TARGET_LAYER_VALUE = 400;

/** Half width of one transformed card body, bounded axis-aligned exactly as the projection bounds it. */
function cardHalfWidth(pose: Pick<StackedDeckPose, "scale" | "rotate">): number {
  const radians = Math.abs(pose.rotate) * (Math.PI / 180);
  return (
    (pose.scale *
      (WIDE_TUNING.cardWidth * Math.cos(radians) + WIDE_TUNING.cardHeight * Math.sin(radians))) /
    2
  );
}

/** Lateral gap between two card bodies. Negative wherever they cover the same pixels. */
function bodySeparation(
  left: Pick<StackedDeckPose, "scale" | "rotate" | "translateX">,
  right: Pick<StackedDeckPose, "scale" | "rotate" | "translateX">,
): number {
  return Math.abs(left.translateX - right.translateX) - cardHalfWidth(left) - cardHalfWidth(right);
}

function traversal(overrides: Partial<StackedDeckTraversal> = {}): StackedDeckTraversal {
  return {
    settledIndex: 2,
    visualTopIndex: 2,
    // The physical projection never reads authority, so it defaults to the segment-origin card.
    authoritativeIndex: overrides.visualTopIndex ?? 2,
    segmentOriginIndex: overrides.visualTopIndex ?? 2,
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

function directProjection(
  originIndex: number,
  _scalarDistance: number,
  overrides: Partial<StackedDeckDirectProjection> & { settlementProgress?: number } = {},
): StackedDeckDirectProjection {
  const { settlementProgress, ...projection } = overrides;
  return {
    originIndex,
    phase: "held",
    translateX: 0,
    translateY: 0,
    settlement: settlementProgress ?? 0,
    ...projection,
  };
}

function resolveDirectFrame(
  activeTraversal: StackedDeckTraversal,
  direct: StackedDeckDirectProjection,
  itemCount = 5,
) {
  return resolveStackedDeckFrame(
    {
      itemCount,
      traversal: activeTraversal,
      tuning: WIDE_TUNING,
      direct,
    },
    createStackedDeckFrame(itemCount),
  );
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

/** Resolves inside the one-anchor envelope a stacked-deck interaction transaction opens. */
function resolveBounded(
  output: MutableStackedDeckTraversal,
  physicalIndex: number,
  originIndex: number,
  controllerPhase: "idle" | "dragging" | "settling" = "dragging",
  settledIndex = output.settledIndex,
) {
  return resolveStackedDeckTraversal(
    {
      controllerPhase,
      itemCount: 5,
      physicalIndex,
      settledIndex,
      traversalBounds: {
        minIndex: Math.max(0, originIndex - 1),
        maxIndex: Math.min(4, originIndex + 1),
      },
    },
    output,
  );
}

function transformedHorizontalSpan(pose: StackedDeckPose, tuning: StackedDeckTuning) {
  const radians = (pose.rotate * Math.PI) / 180;
  const half =
    (Math.abs(Math.cos(radians)) * tuning.cardWidth * pose.scale +
      Math.abs(Math.sin(radians)) * tuning.cardHeight * pose.scale) /
    2;
  return { left: pose.translateX - half, right: pose.translateX + half, width: half * 2 };
}

function physicalValues(
  pose: Pick<
    StackedDeckPose,
    "translateX" | "translateY" | "scale" | "rotate" | "opacity" | "shadowStrength"
  >,
) {
  return {
    translateX: rounded(pose.translateX),
    translateY: rounded(pose.translateY),
    scale: rounded(pose.scale),
    rotate: rounded(pose.rotate),
    opacity: rounded(pose.opacity),
    shadowStrength: rounded(pose.shadowStrength),
  };
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

  it("keeps a reachable direct-manipulation pitch and clears the stack at the depth crossing", () => {
    const compact = resolveStackedDeckTuning({ stageWidth: 360, stageHeight: 420 });
    const medium = resolveStackedDeckTuning({ stageWidth: 768, stageHeight: 520 });
    const wide = resolveStackedDeckTuning({ stageWidth: 1_120, stageHeight: 620 });
    for (const tuning of [compact, medium, wide]) {
      const ratio = tuning.motionPitch / tuning.cardWidth;
      // The rejected build handed ownership over after well under two thirds of a card width.
      expect(ratio).toBeGreaterThan(0.75);
      expect(ratio).toBeLessThan(0.95);
      const crossing = resolveFrame(segment(2, 1, 0.5), 5, tuning);
      const outgoing = transformedHorizontalSpan(crossing.poses[2]!, tuning);
      const target = transformedHorizontalSpan(crossing.poses[3]!, tuning);
      expect(
        Math.min(outgoing.right, target.right) - Math.max(outgoing.left, target.left),
      ).toBeLessThanOrEqual(0);
    }
    // Narrow screens keep the absolute drag distance reachable by one thumb sweep.
    expect(compact.motionPitch).toBeLessThan(medium.motionPitch);
    expect(medium.motionPitch).toBeLessThan(wide.motionPitch);
  });

  it("keeps the physical path while removing secondary motion in reduced motion", () => {
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
    const full = resolveFrame(segment(2, 1, 0.6));
    const frame = resolveFrame(segment(2, 1, 0.6), 5, reduced);
    expect(frame.poses[2]!.translateX).toBeCloseTo(full.poses[2]!.translateX);
    expect(frame.poses.every((pose) => pose.rotate === 0)).toBe(true);
    expect(frame.poses[2]).toMatchObject({ opacity: 1, visible: true });
    expect(frame.poses[3]).toMatchObject({ opacity: 1, visible: true });
    expect(frame.poses[2]!.translateY).toBeLessThan(full.poses[2]!.translateY);
    expect(frame.poses[2]!.scale).toBeGreaterThan(full.poses[2]!.scale);
  });
});

function resolvePile(
  activeTraversal: StackedDeckTraversal = traversal(),
  itemCount = 5,
  tuning: StackedDeckTuning = WIDE_TUNING,
) {
  return resolveStackedDeckPile({
    frame: resolveFrame(activeTraversal, itemCount, tuning),
    tuning,
  });
}

function rounded(value: number) {
  return Number(value.toFixed(6));
}

/** Layers arrive in index order, so the mirror of one deck is the other read back to front. */
function mirrorOf<T>(source: readonly T[], read: (layer: T) => number) {
  return source.map((_unused, index) => -read(source[source.length - 1 - index]!));
}

/** Exposed edge of a parked shell beyond the top card, which is all a compact deck shows of it. */
function exposedEdge(pose: { translateX: number; scale: number }, tuning = WIDE_TUNING) {
  return Math.abs(pose.translateX) + (tuning.cardWidth * pose.scale) / 2 - tuning.cardWidth / 2;
}

function transformedCorner(
  pose: Pick<StackedDeckPose, "rotate" | "scale" | "translateX" | "translateY">,
  tuning: StackedDeckTuning,
  horizontal: -1 | 1,
  vertical: -1 | 1,
) {
  const radians = (pose.rotate * Math.PI) / 180;
  const x = (horizontal * tuning.cardWidth * pose.scale) / 2;
  const y = (vertical * tuning.cardHeight * pose.scale) / 2;
  return {
    x: pose.translateX + x * Math.cos(radians) - y * Math.sin(radians),
    y: pose.translateY + x * Math.sin(radians) + y * Math.cos(radians),
  };
}

describe("stacked deck thickness projection", () => {
  it("describes one non-dominant shell per remaining screen on its ordered side", () => {
    // Position is legible from thickness alone: nothing behind the first screen, nothing ahead of
    // the last, and an even split in the middle. The deck always accounts for every screen exactly
    // once, whatever its length.
    for (const [index, itemIndexes, slots] of [
      [0, [1, 2, 3, 4], [1, 2, 3, 4]],
      [2, [0, 1, 3, 4], [-2, -1, 1, 2]],
      [4, [0, 1, 2, 3], [-4, -3, -2, -1]],
    ] as const) {
      const pile = resolvePile(traversal({ settledIndex: index, visualTopIndex: index }));
      expect(pile.map((layer) => layer.itemIndex)).toEqual(itemIndexes);
      expect(pile.map((layer) => layer.slot)).toEqual(slots);
      expect(pile).toHaveLength(4);
    }
    for (const itemCount of [1, 2, 9, 40]) {
      expect(
        resolvePile(traversal({ settledIndex: 0, visualTopIndex: 0 }), itemCount),
      ).toHaveLength(itemCount - 1);
    }
    expect(resolvePile(traversal({ settledIndex: 0, visualTopIndex: 0 }), 2)).toMatchObject([
      { itemIndex: 1, slot: 1 },
    ]);
  });

  it("places every layer from index order alone, so a reversal cannot mirror the deck", () => {
    // A layer's slot is `index - centre` and nothing else. Travelling either way from the same
    // position therefore retraces the same slots rather than flipping the deck around.
    for (const direction of [1, -1] as const) {
      for (const progress of SEGMENT_SAMPLES) {
        const active = segment(2, direction, progress);
        const centre = 2 + direction * progress;
        const dominantIndex = progress >= 0.5 ? 2 + direction : 2;
        const expectedItems = [0, 1, 2, 3, 4].filter((index) => index !== dominantIndex);
        const pile = resolvePile(active);
        expect(pile.map((layer) => layer.itemIndex)).toEqual(expectedItems);
        expect(pile.map((layer) => layer.slot)).toEqual(
          expectedItems.map((index) => index - centre),
        );
      }
    }
    // Mirrored positions produce mirrored slots, from the item ordering being genuinely reversed.
    const forward = resolvePile(traversal({ settledIndex: 1, visualTopIndex: 1 }));
    const backward = resolvePile(traversal({ settledIndex: 3, visualTopIndex: 3 }));
    expect(forward.map((layer) => layer.slot)).toEqual(mirrorOf(backward, (layer) => layer.slot));
    expect(forward.map((layer) => rounded(layer.translateX))).toEqual(
      mirrorOf(backward, (layer) => rounded(layer.translateX)),
    );
  });

  it("exposes a mirrored outer-corner wedge instead of a parallel bottom outline", () => {
    const tunings = [
      resolveStackedDeckTuning({ stageWidth: 360, stageHeight: 420 }),
      resolveStackedDeckTuning({ stageWidth: 768, stageHeight: 520 }),
      WIDE_TUNING,
    ];
    for (const tuning of tunings) {
      const pile = resolvePile(traversal(), 5, tuning);
      for (const side of [-1, 1] as const) {
        const nearest = pile.find((layer) => layer.slot === side)!;
        const innerSide = side === 1 ? -1 : 1;
        const topOuter = transformedCorner(nearest, tuning, side, -1);
        const bottomOuter = transformedCorner(nearest, tuning, side, 1);
        const bottomInner = transformedCorner(nearest, tuning, innerSide, 1);

        // The whole outer edge clears the foreground card and visibly changes angle along its run.
        expect(side * topOuter.x).toBeGreaterThan(tuning.cardWidth / 2);
        expect(side * bottomOuter.x).toBeGreaterThan(tuning.cardWidth / 2);
        expect(side * (topOuter.x - bottomOuter.x)).toBeGreaterThan(tuning.cardWidth * 0.015);
        // Only the outer part of the bottom edge emerges. A full-width parallel strip would read as
        // the foreground card's border or shadow instead of another shell's transformed corner.
        expect(bottomOuter.y).toBeGreaterThan(tuning.cardHeight / 2);
        expect(bottomInner.y).toBeLessThan(tuning.cardHeight / 2);
      }
    }
  });

  it("stays a compact stack of exposed edges rather than a horizontal rail", () => {
    const pile = resolvePile();
    for (const layer of pile) {
      const side = layer.slot < 0 ? -1 : 1;
      // Every layer leans and offsets outward on its own side, and recedes as it goes.
      expect(Math.sign(layer.translateX)).toBe(side);
      expect(Math.sign(layer.rotate)).toBe(side);
      expect(layer.translateY).toBeGreaterThan(0);
      expect(layer.scale).toBeLessThan(1);
      expect(exposedEdge(layer)).toBeGreaterThan(0);
    }
    // Within a side, depth ordering is strict: each layer shows an edge beyond the one above it.
    // Layers arrive in index order, so the left side runs outward backwards and the right forwards.
    for (const side of [-1, 1] as const) {
      const onSide = pile.filter((layer) => Math.sign(layer.slot) === side);
      const outward = side < 0 ? onSide.map((_u, index) => onSide.at(-1 - index)!) : onSide;
      expect(outward.length).toBeGreaterThan(1);
      for (let index = 1; index < outward.length; index += 1) {
        expect(exposedEdge(outward[index]!)).toBeGreaterThan(exposedEdge(outward[index - 1]!));
        expect(outward[index]!.layer).toBeLessThan(outward[index - 1]!.layer);
      }
    }
    // Mirrored slots are exactly as deep as one another: neither side is favoured.
    const mirroredEdges = pile.map((layer) => {
      const mirrored = pile.find((other) => other.slot === -layer.slot);
      return mirrored === undefined ? null : exposedEdge(mirrored) - exposedEdge(layer);
    });
    expect(
      mirroredEdges.every((difference) => difference === null || Math.abs(difference) < 1e-9),
    ).toBe(true);
    expect(Math.max(...pile.map((layer) => exposedEdge(layer)))).toBeLessThan(
      WIDE_TUNING.cardWidth * 0.07,
    );
    const near = pile.find((layer) => layer.slot === 1)!;
    const farther = pile.find((layer) => layer.slot === 2)!;
    expect(farther.rotate / near.rotate).toBeGreaterThan(1);
    expect(farther.rotate / near.rotate).toBeLessThan(farther.translateX / near.translateX);
    // The spread converges, so even a very deep deck cannot walk off the stage or invert.
    const deep = resolvePile(traversal({ settledIndex: 0, visualTopIndex: 0 }), 40);
    expect(Math.max(...deep.map((layer) => exposedEdge(layer)))).toBeLessThan(
      WIDE_TUNING.cardWidth * 0.09,
    );
    expect(deep.every((layer) => layer.scale > 0.7 && Number.isFinite(layer.translateX))).toBe(
      true,
    );
  });

  it("projects the same physical poses through the compatibility pile surface", () => {
    for (const direction of [1, -1] as const) {
      const opening = resolveFrame(segment(2, direction, 0.0001));
      const target = opening.poses[2 + direction]!;
      const restingPile = resolveStackedDeckPile({
        frame: resolveFrame(traversal()),
        tuning: WIDE_TUNING,
      });
      const nearest = restingPile.find((layer) => layer.slot === direction)!;
      expect(nearest.itemIndex).toBe(2 + direction);
      for (const key of ["translateX", "translateY", "scale", "rotate"] as const) {
        expect(target[key]).toBeCloseTo(nearest[key], 2);
      }
      expect(target.layer).toBeGreaterThan(nearest.layer);

      for (const progress of SEGMENT_SAMPLES) {
        const frame = resolveFrame(segment(2, direction, progress));
        const activePile = resolvePile(segment(2, direction, progress));
        expect(activePile).toHaveLength(4);
        for (const projection of activePile) {
          expect(physicalValues(projection)).toEqual(
            physicalValues(frame.poses[projection.itemIndex]!),
          );
        }
      }
    }
  });

  it("retraces the same physical item poses through reversal", () => {
    const outbound = [0.2, 0.55, 0.8].map((progress) =>
      resolveFrame(segment(2, 1, progress)).poses.map(physicalValues),
    );
    const retraced = [0.8, 0.55, 0.2].map((progress) =>
      resolveFrame(segment(2, 1, progress)).poses.map(physicalValues),
    );
    expect(retraced).toEqual(outbound.map((_sample, index) => outbound.at(-1 - index)));
  });

  it("mirrors the physical exchange from item order rather than direction-specific paths", () => {
    const forward = resolveFrame(segment(2, 1, 0.3)).poses;
    const backward = resolveFrame(segment(2, -1, 0.3)).poses;
    for (let offset = -2; offset <= 2; offset += 1) {
      const left = backward[2 - offset]!;
      const right = forward[2 + offset]!;
      expect(right.translateX).toBeCloseTo(-left.translateX, 8);
      expect(right.rotate).toBeCloseTo(-left.rotate, 8);
      expect(right.translateY).toBeCloseTo(left.translateY, 8);
      expect(right.scale).toBeCloseTo(left.scale, 8);
      expect(right.shadowStrength).toBeCloseTo(left.shadowStrength, 8);
    }
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

  // The projection primitive itself stays multi-anchor capable: the one-card contract belongs to
  // the presentation, which supplies the envelope its interaction transaction began with.
  it("hands visual ownership across every crossed anchor when no envelope is supplied", () => {
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

  it("hands interaction authority over at the segment midpoint, latched by a dead band", () => {
    const state = createStackedDeckTraversal(2, 5);
    // Below the band, at it, and above it. Authority is separate from ownership throughout: the
    // visual top does not move until the whole pitch is complete.
    expect(resolveTraversal(state, 2.45)).toMatchObject({
      authoritativeIndex: 2,
      visualTopIndex: 2,
    });
    expect(resolveTraversal(state, 2.535).authoritativeIndex).toBe(2);
    expect(resolveTraversal(state, 2.54).authoritativeIndex).toBe(3);
    // Latched: nothing inside the band hands it back, in either direction of travel.
    for (const position of [2.99, 2.54, 2.5, 2.465, 2.7, 2.465]) {
      expect(resolveTraversal(state, position)).toMatchObject({
        authoritativeIndex: 3,
        visualTopIndex: 2,
      });
    }
    expect(resolveTraversal(state, 2.455).authoritativeIndex).toBe(2);
    for (const position of [2.465, 2.5, 2.535]) {
      expect(resolveTraversal(state, position).authoritativeIndex).toBe(2);
    }
    // Completing the pitch moves ownership; authority is already there and does not flicker.
    expect(resolveTraversal(state, 3)).toMatchObject({ authoritativeIndex: 3, visualTopIndex: 3 });
    expect(resolveTraversal(state, 3.6)).toMatchObject({
      authoritativeIndex: 4,
      visualTopIndex: 3,
    });
    // A reversal through neutral cannot strand authority on a card the segment no longer names: the
    // new outgoing card holds it until the new segment passes its own midpoint.
    expect(resolveTraversal(state, 3).authoritativeIndex).toBe(3);
    expect(resolveTraversal(state, 2.6)).toMatchObject({
      authoritativeIndex: 3,
      segmentTargetIndex: 2,
      visualTopIndex: 3,
    });
    expect(resolveTraversal(state, 2.4)).toMatchObject({
      authoritativeIndex: 2,
      segmentTargetIndex: 2,
      visualTopIndex: 3,
    });
  });

  it("never lets authority leave the interaction envelope", () => {
    const state = createStackedDeckTraversal(2, 5);
    for (const position of [2.6, 3, 3.4, 4.5, 40, 3.2, 2.9, 2.1, 1.6, -40]) {
      const bounded = resolveBounded(state, position, 2);
      expect(Math.abs(bounded.authoritativeIndex - 2)).toBeLessThanOrEqual(1);
      // Authority always names a card of the segment actually on screen.
      expect(
        bounded.authoritativeIndex === bounded.visualTopIndex ||
          bounded.authoritativeIndex === bounded.segmentTargetIndex,
      ).toBe(true);
    }
    // Idle resets authority to the settled selection along with everything else.
    expect(resolveBounded(state, 3, 2, "idle", 3)).toMatchObject({
      authoritativeIndex: 3,
      settledIndex: 3,
      visualTopIndex: 3,
    });
  });

  it("rejects a traversal whose authority names a card outside the active segment", () => {
    expect(() => resolveFrame(segment(2, 1, 0.7))).not.toThrow();
    expect(() =>
      resolveFrame(traversal({ ...segment(2, 1, 0.7), authoritativeIndex: 3 })),
    ).not.toThrow();
    expect(() => resolveFrame(traversal({ ...segment(2, 1, 0.7), authoritativeIndex: 1 }))).toThrow(
      RangeError,
    );
    expect(() => resolveFrame(traversal({ authoritativeIndex: 3 }))).toThrow(RangeError);
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

  it("stops promoting at the envelope and renders the remainder as elastic overdrag", () => {
    const state = createStackedDeckTraversal(2, 5);
    const samples = [2.4, 3, 3.2, 5, 40].map((position) => ({
      position,
      ...resolveBounded(state, position, 2),
    }));
    expect(samples.map((sample) => sample.visualTopIndex)).toEqual([2, 3, 3, 3, 3]);
    expect(samples[0]).toMatchObject({ segmentTargetIndex: 3, phase: "traversing" });
    expect(samples[1]).toMatchObject({ segmentTargetIndex: null, phase: "neutral" });
    for (const sample of samples.slice(2)) {
      // No second same-direction segment, no invented target, and the top card keeps translating.
      expect(sample).toMatchObject({ segmentTargetIndex: null, phase: "elastic", direction: 1 });
      expect(sample.signedLocalDistance).toBeGreaterThan(0);
    }
    const overdrag = resolveFrame({ ...samples.at(-1)! });
    expect(overdrag.poses.filter((pose) => pose.role === "top")).toHaveLength(1);
    expect(overdrag.poses[3]).toMatchObject({ role: "top", opacity: 1 });
  });

  it("keeps reversal free across the whole envelope in either direction", () => {
    const state = createStackedDeckTraversal(2, 5);
    const positions = [2.5, 9, 2.5, 2, 1.5, -9];
    const samples = positions.map((position) => ({ ...resolveBounded(state, position, 2) }));
    expect(samples.map((sample) => sample.visualTopIndex)).toEqual([2, 3, 3, 2, 2, 1]);
    expect(samples[0]).toMatchObject({ segmentOriginIndex: 2, segmentTargetIndex: 3 });
    expect(samples[2]).toMatchObject({ segmentOriginIndex: 3, segmentTargetIndex: 2 });
    expect(samples[3]).toMatchObject({ phase: "neutral", visualTopIndex: 2 });
    expect(samples[4]).toMatchObject({ segmentOriginIndex: 2, segmentTargetIndex: 1 });
    expect(samples[5]).toMatchObject({ visualTopIndex: 1, phase: "elastic" });
    // Nothing in a single transaction may ever leave the origin's adjacent envelope.
    expect(samples.every((sample) => Math.abs(sample.visualTopIndex - 2) <= 1)).toBe(true);
  });

  it("clamps the envelope to the deck and rejects an inverted one", () => {
    const state = createStackedDeckTraversal(0, 5);
    expect(resolveBounded(state, -5, 0)).toMatchObject({
      visualTopIndex: 0,
      segmentTargetIndex: null,
      phase: "elastic",
    });
    expect(() =>
      resolveStackedDeckTraversal(
        {
          controllerPhase: "dragging",
          itemCount: 5,
          physicalIndex: 2,
          settledIndex: 2,
          traversalBounds: { minIndex: 3, maxIndex: 1 },
        },
        state,
      ),
    ).toThrow(RangeError);
    expect(() =>
      resolveStackedDeckTraversal(
        {
          controllerPhase: "dragging",
          itemCount: 5,
          physicalIndex: 2,
          settledIndex: 2,
          traversalBounds: { minIndex: 0, maxIndex: 5 },
        },
        state,
      ),
    ).toThrow(RangeError);
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

describe("stacked deck persistent physical cards", () => {
  it("rests as one interactive top card over compact persistent shells", () => {
    const frame = resolveFrame();
    expect(frame.poses).toHaveLength(5);
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

  it("responds directly near the pointer origin and mirrors both traversal directions", () => {
    for (const progress of [0.001, 0.1, 0.25, 0.5, 0.75, 0.99]) {
      const forward = resolveFrame(segment(2, 1, progress)).poses[2]!;
      const backward = resolveFrame(segment(2, -1, progress)).poses[2]!;
      expect(forward.translateX).toBeCloseTo(-backward.translateX);
      expect(forward.translateY).toBeCloseTo(backward.translateY);
      expect(forward.scale).toBeCloseTo(backward.scale);
      expect(forward.rotate).toBeCloseTo(-backward.rotate);
      expect(forward.opacity).toBe(1);
      expect(backward.opacity).toBe(1);
    }
    const firstStep = Math.abs(resolveFrame(segment(2, 1, 0.001)).poses[2]!.translateX) / 0.001;
    expect(firstStep).toBeGreaterThan(WIDE_TUNING.motionPitch * 0.9);
    expect(firstStep).toBeLessThan(WIDE_TUNING.motionPitch * 1.2);
    const derivativeStep = 0.00001;
    const initialDerivative =
      Math.abs(resolveFrame(segment(2, 1, derivativeStep)).poses[2]!.translateX) / derivativeStep;
    expect(initialDerivative).toBeCloseTo(WIDE_TUNING.motionPitch, 3);
  });

  it("keeps the outgoing path differentiable at its corner boundaries", () => {
    const outgoingX = (direction: -1 | 1, progress: number) =>
      resolveFrame(segment(2, direction, progress)).poses[2]!.translateX;
    const slopeJump = (direction: -1 | 1, boundary: number, step: number) => {
      const boundaryX = outgoingX(direction, boundary);
      const before = (boundaryX - outgoingX(direction, boundary - step)) / step;
      const after = (outgoingX(direction, boundary + step) - boundaryX) / step;
      return Math.abs(after - before);
    };

    for (const direction of [-1, 1] as const) {
      for (const boundary of [0.2, 0.5]) {
        const coarseJump = slopeJump(direction, boundary, 0.001);
        const fineJump = slopeJump(direction, boundary, 0.0001);
        // A real derivative discontinuity would survive smaller sampling. The smooth path's secant
        // mismatch instead converges toward zero with the sampling interval.
        expect(fineJump).toBeLessThan(coarseJump * 0.2);
      }
    }
  });

  it("keeps one pose per item while the exchanging pair stays opaque", () => {
    for (const direction of [-1, 1] as const) {
      for (const progress of [0.0001, ...SEGMENT_SAMPLES, 1]) {
        const frame = resolveFrame(segment(2, direction, progress), 9);
        expect(frame.poses).toHaveLength(9);
        expect(frame.poses.filter((pose) => pose.interactive)).toHaveLength(0);
        expect(frame.poses[2]).toMatchObject({ opacity: 1, role: "top", visible: true });
        expect(frame.poses[2 + direction]).toMatchObject({
          opacity: 1,
          role: "target",
          visible: true,
        });
        expect(frame.poses.filter((pose) => pose.layer === 500)).toHaveLength(1);
      }
    }
  });

  it("changes depth only with transformed-body clearance and no crossing cast shadow", () => {
    for (const direction of [-1, 1] as const) {
      const before = resolveFrame(segment(2, direction, 0.4999));
      const crossing = resolveFrame(segment(2, direction, 0.5));
      const after = resolveFrame(segment(2, direction, 0.5001));
      const outgoingSpan = transformedHorizontalSpan(crossing.poses[2]!, WIDE_TUNING);
      const targetSpan = transformedHorizontalSpan(crossing.poses[2 + direction]!, WIDE_TUNING);
      expect(outgoingSpan.right <= targetSpan.left || targetSpan.right <= outgoingSpan.left).toBe(
        true,
      );
      expect(before.poses[2]!.layer).toBeGreaterThan(before.poses[2 + direction]!.layer);
      expect(after.poses[2]!.layer).toBeLessThan(after.poses[2 + direction]!.layer);
      expect(crossing.poses[2]!.shadowStrength).toBe(0);
      expect(crossing.poses[2 + direction]!.shadowStrength).toBe(0);
      for (const progress of [0.45, 0.47, 0.49, 0.5, 0.51, 0.53, 0.55]) {
        const frame = resolveFrame(segment(2, direction, progress));
        expect(frame.poses[2]!.shadowStrength).toBeLessThanOrEqual(0.025);
        expect(frame.poses[2 + direction]!.shadowStrength).toBeLessThanOrEqual(0.025);
      }
      expect(crossing.poses[2]!.opacity).toBe(1);
      expect(crossing.poses[2 + direction]!.opacity).toBe(1);
    }
  });

  it("uses the compatibility pile surface as a projection of the same physical poses", () => {
    for (const progress of [0.0001, 0.25, 0.5, 0.75, 1]) {
      const frame = resolveFrame(segment(2, 1, progress));
      const pile = resolvePile(segment(2, 1, progress));
      expect(pile).toHaveLength(4);
      for (const layer of pile) {
        expect(physicalValues(layer)).toEqual(physicalValues(frame.poses[layer.itemIndex]!));
      }
      const dominantIndex = progress < 0.5 ? 2 : 3;
      expect(pile.some((layer) => layer.itemIndex === dominantIndex)).toBe(false);
    }
  });

  it("separates semantic authority from continuous physical geometry", () => {
    expect(isStackedDeckAuthorityStable(segment(2, 1, 0.25))).toBe(false);
    expect(isStackedDeckAuthorityStable({ ...segment(2, 1, 0.55), authoritativeIndex: 3 })).toBe(
      true,
    );
    expect(
      isStackedDeckAuthorityStable(
        traversal({
          phase: "elastic",
          segmentTargetIndex: null,
          direction: -1,
          signedLocalDistance: -0.2,
          localProgress: 0.2,
        }),
      ),
    ).toBe(false);
    expect(isStackedDeckAuthorityStable(traversal())).toBe(true);
  });
});

describe("Direct stacked deck projection", () => {
  it("constructs exact source and destination rest decks from accepted Shuffle geometry", () => {
    for (const direction of [-1, 1] as const) {
      const source = resolveFrame(traversal());
      const directSource = resolveStackedDeckFrame(
        { itemCount: 5, traversal: traversal(), tuning: WIDE_TUNING },
        createStackedDeckFrame(5),
      );
      expect(directSource).toEqual(source);

      const endpoint = resolveDirectFrame(
        { ...segment(2, direction, 1), authoritativeIndex: 2 + direction },
        directProjection(2, direction, { phase: "parking", settlementProgress: 1 }),
      );
      const destination = resolveFrame(
        traversal({
          settledIndex: 2 + direction,
          visualTopIndex: 2 + direction,
          authoritativeIndex: 2 + direction,
          segmentOriginIndex: 2 + direction,
        }),
      );
      expect(endpoint.poses).toEqual(destination.poses);
    }
  });

  it("keeps the held origin on the raw vector while Y cannot move target or pile geometry", () => {
    for (const direction of [-1, 1] as const) {
      for (let step = 0; step <= 1_000; step += 1) {
        const progress = step / 1_000;
        const active =
          progress === 0
            ? traversal()
            : {
                ...segment(2, direction, progress),
                authoritativeIndex: progress >= 0.55 ? 2 + direction : 2,
              };
        const rawX = -direction * (80 + progress * 420);
        const low = resolveDirectFrame(
          active,
          directProjection(2, direction * progress, {
            phase: "held",
            translateX: rawX,
            translateY: -220,
          }),
        );
        const high = resolveDirectFrame(
          active,
          directProjection(2, direction * progress, {
            phase: "held",
            translateX: rawX,
            translateY: 260,
          }),
        );
        expect(low.poses[2]).toMatchObject({
          translateX: rawX,
          translateY: -220,
          scale: 1,
          rotate: 0,
          opacity: 1,
        });
        expect(high.poses[2]).toMatchObject({
          translateX: rawX,
          translateY: 260,
          scale: 1,
          rotate: 0,
          opacity: 1,
        });
        for (let index = 0; index < low.poses.length; index += 1) {
          if (index === 2) continue;
          expect(physicalValues(low.poses[index]!)).toEqual(physicalValues(high.poses[index]!));
        }
      }
    }
  });

  it("moves every non-held item monotonically between the two exact rest decks", () => {
    for (const direction of [-1, 1] as const) {
      let previousDistance = Number.POSITIVE_INFINITY;
      for (let step = 0; step <= 1_000; step += 1) {
        const progress = step / 1_000;
        const active =
          progress === 0
            ? traversal()
            : {
                ...segment(2, direction, progress),
                authoritativeIndex: progress >= 0.55 ? 2 + direction : 2,
              };
        const frame = resolveDirectFrame(
          active,
          directProjection(2, direction * progress, {
            phase: "held",
            translateX: -direction * progress * 500,
            translateY: progress * 160,
          }),
        );
        expect(frameIsFinite(frame)).toBe(true);
        const target = frame.poses[2 + direction]!;
        const distance = Math.hypot(
          target.translateX,
          target.translateY,
          target.rotate,
          1 - target.scale,
        );
        expect(distance).toBeLessThanOrEqual(previousDistance + Number.EPSILON * 32);
        previousDistance = distance;
      }
    }
  });

  it("keeps hidden same-side paint order invariant through dense held reversals", () => {
    for (const direction of [-1, 1] as const) {
      const sameSidePair = direction === 1 ? ([0, 1] as const) : ([3, 4] as const);
      let expectedSign: number | undefined;
      for (const progress of [
        ...Array.from({ length: 1_001 }, (_, index) => index / 1_000),
        0.7,
        0.35,
        0.9,
        0.15,
        0.6,
      ]) {
        const frame = resolveDirectFrame(
          progress === 0 ? traversal() : segment(2, direction, progress),
          directProjection(2, direction * progress, {
            phase: "held",
            translateX: -direction * progress * 600,
            translateY: 120,
          }),
        );
        const [backIndex, frontIndex] = sameSidePair;
        const sign = Math.sign(frame.poses[frontIndex]!.layer - frame.poses[backIndex]!.layer);
        expectedSign ??= sign;
        expect(sign).toBe(expectedSign);
        expect(frame.poses[backIndex]!.role).toBe("hidden");
        expect(frame.poses[frontIndex]!.role).toBe("hidden");
      }
    }
  });

  it("keeps interior overdrag attached to one origin and one adjacent destination", () => {
    for (const direction of [-1, 1] as const) {
      const frame = resolveDirectFrame(
        { ...segment(2, direction, 1), authoritativeIndex: 2 + direction },
        directProjection(2, direction * 4, {
          phase: "held",
          translateX: direction * -1_700,
          translateY: 190,
        }),
      );
      expect(frame.poses[2]).toMatchObject({
        translateX: direction * -1_700,
        translateY: 190,
        layer: 501,
      });
      expect(frame.poses[2 + direction]).toMatchObject({
        translateX: 0,
        translateY: 0,
        scale: 1,
        rotate: 0,
        layer: 500,
      });
      expect(frame.poses.filter((pose) => pose.role === "target")).toHaveLength(0);
    }
  });

  it("parks the same released shell continuously and crosses depth only between clear bodies", () => {
    // A release that still overlaps the new top, and one already clear of it. Both park from the
    // exact release frame into the exact destination pile frame; only where they may pass behind
    // the new top differs, and both pass behind it exactly once.
    for (const direction of [-1, 1] as const) {
      for (const releaseX of [direction * -540, direction * -900]) {
        const releaseY = 180;
        let previous: StackedDeckPose | undefined;
        let firstOutgoing: StackedDeckPose | undefined;
        let maximumStepDistance = 0;
        let crossovers = 0;
        let crossoverSeparation = Number.POSITIVE_INFINITY;
        let overlappedWhileAbove = false;
        let previousBehind = false;
        for (let step = 0; step <= 1_000; step += 1) {
          const settlement = step / 1_000;
          const frame = resolveDirectFrame(
            { ...segment(2, direction, 1), authoritativeIndex: 2 + direction },
            directProjection(2, direction, {
              phase: "parking",
              translateX: releaseX,
              translateY: releaseY,
              settlementProgress: settlement,
            }),
          );
          const outgoing = frame.poses[2]!;
          const target = frame.poses[2 + direction]!;
          expect(frame.poses.every((pose) => pose.opacity === 1)).toBe(true);
          expect(outgoing).toMatchObject({ role: "hidden", visible: true });
          expect(Number.isFinite(outgoing.translateX)).toBe(true);
          expect(Number.isFinite(outgoing.translateY)).toBe(true);
          const behind = outgoing.layer < target.layer;
          const separation = bodySeparation(outgoing, target);
          if (previous === undefined) firstOutgoing = outgoing;
          // The hand released it in front of the new top, so the very first parking frame is
          // already a depth change if it paints behind.
          if (behind !== previousBehind) {
            crossovers += 1;
            crossoverSeparation = Math.min(crossoverSeparation, separation);
          }
          if (!behind && separation < 0) overlappedWhileAbove = true;
          if (previous !== undefined) {
            maximumStepDistance = Math.max(
              maximumStepDistance,
              Math.hypot(
                outgoing.translateX - previous.translateX,
                outgoing.translateY - previous.translateY,
              ),
            );
          }
          previous = { ...outgoing };
          previousBehind = behind;
        }

        // Exactly one depth change, and the two card bodies are clear where it happens. A release
        // that still overlapped stays above until it is clear; one already clear crosses at once.
        expect(crossovers).toBe(1);
        expect(crossoverSeparation).toBeGreaterThanOrEqual(0);
        expect(overlappedWhileAbove).toBe(Math.abs(releaseX) < 682);
        expect(previous!.layer).toBeLessThan(TARGET_LAYER_VALUE);

        expect(firstOutgoing?.translateX).toBe(releaseX);
        expect(firstOutgoing?.translateY).toBe(releaseY);
        expect(firstOutgoing?.scale).toBe(1);
        expect(maximumStepDistance).toBeLessThan(4);

        const destination = resolveFrame(
          traversal({
            settledIndex: 2 + direction,
            visualTopIndex: 2 + direction,
            authoritativeIndex: 2 + direction,
            segmentOriginIndex: 2 + direction,
          }),
        );
        expect(physicalValues(previous!)).toEqual(physicalValues(destination.poses[2]!));
      }
    }
  });

  it("keeps the released shell above the new top for as long as their bodies overlap", () => {
    // The one frame the flash lived in: identical geometry either side of a depth change. Depth
    // may only change where the swap can repaint nothing, so a release that still overlaps must
    // still be the card in front on the frame after the hand let go.
    for (const direction of [-1, 1] as const) {
      const releaseX = direction * -370;
      const held = resolveDirectFrame(
        { ...segment(2, direction, 0.62), authoritativeIndex: 2 + direction },
        directProjection(2, direction * 0.62, {
          phase: "held",
          translateX: releaseX,
          translateY: 120,
        }),
      );
      const released = resolveDirectFrame(
        { ...segment(2, direction, 0.62), authoritativeIndex: 2 + direction },
        directProjection(2, direction * 0.62, {
          phase: "parking",
          translateX: releaseX,
          translateY: 120,
          settlementProgress: 0,
        }),
      );
      expect(physicalValues(released.poses[2]!)).toEqual(physicalValues(held.poses[2]!));
      expect(bodySeparation(released.poses[2]!, released.poses[2 + direction]!)).toBeLessThan(0);
      expect(released.poses[2]!.layer).toBe(held.poses[2]!.layer);
      expect(released.poses[2]!.layer).toBeGreaterThan(released.poses[2 + direction]!.layer);
    }
  });

  it("parks a full-pitch and an overdragged commit with finite geometry and no stall", () => {
    // The scalar controller has already crossed a whole pitch — or more — by the time the hand
    // lets go, so remaining logical travel is zero and cannot drive anything. Presentation
    // settlement still moves both releases, and both still finish exactly in the pile.
    for (const direction of [-1, 1] as const) {
      for (const releaseX of [direction * -598, direction * -1_400]) {
        let previous: StackedDeckPose | undefined;
        let travelled = 0;
        for (let step = 0; step <= 200; step += 1) {
          const frame = resolveDirectFrame(
            { ...segment(2, direction, 1), authoritativeIndex: 2 + direction },
            directProjection(2, direction, {
              phase: "parking",
              translateX: releaseX,
              translateY: -240,
              settlementProgress: step / 200,
            }),
          );
          const outgoing = frame.poses[2]!;
          for (const pose of frame.poses) {
            expect(Number.isFinite(pose.translateX)).toBe(true);
            expect(Number.isFinite(pose.translateY)).toBe(true);
            expect(Number.isFinite(pose.scale)).toBe(true);
            expect(Number.isFinite(pose.rotate)).toBe(true);
            expect(Number.isFinite(pose.shadowStrength)).toBe(true);
          }
          if (previous !== undefined) {
            travelled += Math.hypot(
              outgoing.translateX - previous.translateX,
              outgoing.translateY - previous.translateY,
            );
          }
          previous = { ...outgoing };
        }
        expect(travelled).toBeGreaterThan(Math.abs(releaseX) / 4);
        const destination = resolveFrame(
          traversal({
            settledIndex: 2 + direction,
            visualTopIndex: 2 + direction,
            authoritativeIndex: 2 + direction,
            segmentOriginIndex: 2 + direction,
          }),
        );
        expect(physicalValues(previous!)).toEqual(physicalValues(destination.poses[2]!));
      }
    }
  });

  it("never renders a settlement a transform could not express", () => {
    // The old parking coordinate could divide zero by zero. An unusable settlement now resolves to
    // the release frame, which is finite and continuous, rather than to a shell nothing can move.
    for (const invalid of [Number.NaN, -1, 4]) {
      const frame = resolveDirectFrame(
        { ...segment(2, 1, 1), authoritativeIndex: 3 },
        directProjection(2, 1, {
          phase: "parking",
          translateX: -480,
          translateY: 90,
          settlementProgress: invalid,
        }),
      );
      for (const pose of frame.poses) {
        expect(Number.isFinite(pose.translateX)).toBe(true);
        expect(Number.isFinite(pose.translateY)).toBe(true);
        expect(Number.isFinite(pose.scale)).toBe(true);
        expect(Number.isFinite(pose.rotate)).toBe(true);
        expect(Number.isFinite(pose.shadowStrength)).toBe(true);
      }
    }
  });

  it("returns a cancelled shell continuously to the exact source top", () => {
    for (const direction of [-1, 1] as const) {
      const releaseX = direction * -430;
      const releaseY = -170;
      let previousDistance = Number.POSITIVE_INFINITY;
      for (let step = 0; step <= 1_000; step += 1) {
        const progress = step / 1_000;
        const scalarDistance = direction * (1 - progress) * 0.42;
        const frame = resolveDirectFrame(
          scalarDistance === 0 ? traversal() : segment(2, direction, Math.abs(scalarDistance)),
          directProjection(2, scalarDistance, {
            phase: "returning",
            translateX: releaseX,
            translateY: releaseY,
            settlementProgress: progress,
          }),
        );
        const outgoing = frame.poses[2]!;
        const distance = Math.hypot(outgoing.translateX, outgoing.translateY);
        expect(distance).toBeLessThanOrEqual(previousDistance + Number.EPSILON * 32);
        expect(outgoing).toMatchObject({ opacity: 1, role: "top", layer: 501 });
        previousDistance = distance;
      }
      const returned = resolveDirectFrame(
        traversal(),
        directProjection(2, 0, {
          phase: "returning",
          translateX: releaseX,
          translateY: releaseY,
          settlementProgress: 1,
        }),
      );
      expect(physicalValues(returned.poses[2]!)).toEqual(
        physicalValues(resolveFrame(traversal()).poses[2]!),
      );
    }
  });

  it("promotes a still-parking shell from its current resolved pose on immediate reversal", () => {
    const parking = resolveDirectFrame(
      { ...segment(2, 1, 0.7), authoritativeIndex: 3 },
      directProjection(2, 0.7, {
        phase: "parking",
        translateX: -520,
        translateY: 190,
        settlementProgress: 0.24,
      }),
    );
    const interrupted = resolveDirectFrame(
      { ...segment(3, -1, 0.3), authoritativeIndex: 3 },
      directProjection(3, -0.3, {
        phase: "held",
        translateX: 0,
        translateY: 0,
        continuity: {
          itemIndex: 2,
          progress: 0.216,
          pose: { ...parking.poses[2]! },
        },
      }),
    );

    // Settings becomes the one hand-owned shell; every other transform begins exactly where the
    // prior frame left it. Team changes paint role discretely from destination-hidden to target.
    for (let index = 0; index < parking.poses.length; index += 1) {
      if (index === 3) continue;
      expect(physicalValues(interrupted.poses[index]!)).toEqual(
        physicalValues(parking.poses[index]!),
      );
    }
    expect(interrupted.poses[2]).toMatchObject({ role: "target", layer: 500, opacity: 1 });
    expect(interrupted.poses).toHaveLength(parking.poses.length);
  });
});

describe("stacked deck physical continuity", () => {
  it("arrives at the exact physical geometry of the next resting deck", () => {
    for (const direction of [-1, 1] as const) {
      const targetIndex = 2 + direction;
      const crossing = resolveFrame(segment(2, direction, 1));
      const settled = resolveFrame(
        traversal({
          settledIndex: targetIndex,
          visualTopIndex: targetIndex,
          authoritativeIndex: targetIndex,
          segmentOriginIndex: targetIndex,
        }),
      );
      for (let index = 0; index < crossing.poses.length; index += 1) {
        expect(physicalValues(crossing.poses[index]!)).toEqual(
          physicalValues(settled.poses[index]!),
        );
      }
    }
  });

  it("remains valid when rendered samples skip one or more anchor boundaries", () => {
    const state = createStackedDeckTraversal(0, 5);
    const output = createStackedDeckFrame(5);
    for (const physicalIndex of [0.15, 0.62, 1.17, 1.71, 2.14, 2.89, 3.22]) {
      const active = resolveTraversal(state, physicalIndex, "settling", 0);
      const frame = resolveFrame({ ...active }, 5, WIDE_TUNING, output);
      expect(frameIsFinite(frame)).toBe(true);
      expect(frame.poses.filter((pose) => pose.layer === 500)).toHaveLength(1);
    }
    expect(state.visualTopIndex).toBe(3);
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
    // A single-item deck has nothing behind its one card, and an empty one has nothing at all.
    // A two-item exchange projects only its non-dominant physical card through the legacy surface.
    expect(resolvePile(createStackedDeckTraversal(0, 1), 1)).toEqual([]);
    expect(resolvePile(segment(0, 1, 0.5), 2).map((layer) => layer.itemIndex)).toEqual([0]);
    expect(() => resolvePile(traversal(), 5, { ...WIDE_TUNING, pileScaleStep: -1 })).toThrow(
      RangeError,
    );
    expect(() => resolvePile({ ...segment(2, 1, 0.5), authoritativeIndex: 0 })).toThrow(RangeError);
  });
});
