import { describe, expect, it } from "vitest";

import {
  createStackedDeckFrame,
  createStackedDeckTraversal,
  isStackedDeckAuthorityStable,
  resolveStackedDeckFrame,
  resolveStackedDeckNeighbor,
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
/** Sample pitch for painted-material checks that have to resolve a single uncovered strip. */
const PAINT_STEP = 4;
/** Travel either side of neutral over which a held reversal changes its direction and its target. */
const CROSSING_BAND = 0.02;
/** Ascending distances from neutral, so a reveal can be read as a function of travel alone. */
const MAGNITUDES = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.3] as const;
const SEGMENT_SAMPLES = [0.1, 0.25, 0.5, 0.7, 0.85, 0.95] as const;
const TARGET_LAYER_VALUE = 400;
/** The rank a resting top card takes; physical ownership ranks above it. */
const TOP_LAYER_VALUE = 500;

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

function cardBounds(pose: StackedDeckPose, tuning: StackedDeckTuning) {
  const radians = (pose.rotate * Math.PI) / 180;
  const cosine = Math.abs(Math.cos(radians));
  const sine = Math.abs(Math.sin(radians));
  const halfWidth = (pose.scale * (tuning.cardWidth * cosine + tuning.cardHeight * sine)) / 2;
  const halfHeight = (pose.scale * (tuning.cardWidth * sine + tuning.cardHeight * cosine)) / 2;
  return {
    bottom: pose.translateY + halfHeight,
    left: pose.translateX - halfWidth,
    right: pose.translateX + halfWidth,
    top: pose.translateY - halfHeight,
  };
}

function containsCardPoint(pose: StackedDeckPose, x: number, y: number, tuning: StackedDeckTuning) {
  if (!pose.visible || pose.opacity !== 1) return false;
  const radians = (-pose.rotate * Math.PI) / 180;
  const deltaX = x - pose.translateX;
  const deltaY = y - pose.translateY;
  const localX = (deltaX * Math.cos(radians) - deltaY * Math.sin(radians)) / pose.scale;
  const localY = (deltaX * Math.sin(radians) + deltaY * Math.cos(radians)) / pose.scale;
  return Math.abs(localX) <= tuning.cardWidth / 2 && Math.abs(localY) <= tuning.cardHeight / 2;
}

function paintedMaterialSamples(
  poses: readonly StackedDeckPose[],
  tuning: StackedDeckTuning,
  step = 8,
) {
  const samples = poses.map(() => ({ center: 0, left: 0, right: 0, total: 0 }));
  const horizontalExtent = tuning.cardWidth * 1.75;
  const verticalExtent = tuning.cardHeight;
  const centreHalfWidth = tuning.cardWidth * 0.04;
  for (let y = -verticalExtent; y <= verticalExtent; y += step) {
    for (let x = -horizontalExtent; x <= horizontalExtent; x += step) {
      let owner = -1;
      let ownerLayer = Number.NEGATIVE_INFINITY;
      for (let index = 0; index < poses.length; index += 1) {
        const pose = poses[index]!;
        if (!containsCardPoint(pose, x, y, tuning)) continue;
        if (pose.layer > ownerLayer || (pose.layer === ownerLayer && index > owner)) {
          owner = index;
          ownerLayer = pose.layer;
        }
      }
      if (owner < 0) continue;
      const sample = samples[owner]!;
      sample.total += 1;
      if (x < -centreHalfWidth) sample.left += 1;
      else if (x > centreHalfWidth) sample.right += 1;
      else sample.center += 1;
    }
  }
  return samples;
}

function expectPairPaintSwapSafe(
  poses: readonly StackedDeckPose[],
  firstIndex: number,
  secondIndex: number,
  tuning = WIDE_TUNING,
) {
  const first = poses[firstIndex]!;
  const second = poses[secondIndex]!;
  const firstBounds = cardBounds(first, tuning);
  const secondBounds = cardBounds(second, tuning);
  const left = Math.max(firstBounds.left, secondBounds.left);
  const right = Math.min(firstBounds.right, secondBounds.right);
  const top = Math.max(firstBounds.top, secondBounds.top);
  const bottom = Math.min(firstBounds.bottom, secondBounds.bottom);
  if (left >= right || top >= bottom) return;

  let overlappingSamples = 0;
  let uncoveredSamples = 0;
  for (let y = top; y <= bottom; y += 6) {
    for (let x = left; x <= right; x += 6) {
      if (!containsCardPoint(first, x, y, tuning) || !containsCardPoint(second, x, y, tuning)) {
        continue;
      }
      overlappingSamples += 1;
      const covered = poses.some(
        (pose, index) =>
          index !== firstIndex &&
          index !== secondIndex &&
          pose.layer > Math.max(first.layer, second.layer) &&
          containsCardPoint(pose, x, y, tuning),
      );
      if (!covered) uncoveredSamples += 1;
    }
  }
  expect({ overlappingSamples, uncoveredSamples }).toMatchObject({ uncoveredSamples: 0 });
}

function expectEveryPaintSwapSafe(
  frames: readonly { poses: readonly StackedDeckPose[]; progress: number }[],
  tuning = WIDE_TUNING,
) {
  for (let frameIndex = 1; frameIndex < frames.length; frameIndex += 1) {
    const previous = frames[frameIndex - 1]!;
    const current = frames[frameIndex]!;
    for (let first = 0; first < current.poses.length; first += 1) {
      for (let second = first + 1; second < current.poses.length; second += 1) {
        const previousOrder = Math.sign(
          previous.poses[first]!.layer - previous.poses[second]!.layer,
        );
        const currentOrder = Math.sign(current.poses[first]!.layer - current.poses[second]!.layer);
        if (previousOrder === currentOrder) continue;
        expectPairPaintSwapSafe(current.poses, first, second, tuning);
      }
    }
  }
}

/** Every shell's rank except the ones an interaction owns, which it is entitled to decide. */
function carriedLayers(poses: readonly StackedDeckPose[], owned: readonly number[]) {
  return poses.map((pose, index) => (owned.includes(index) ? "owned" : pose.layer));
}

/** The projection's own easing, so a test can name the progress a snapshot was captured at. */
function smooth(progress: number) {
  return progress * progress * (3 - 2 * progress);
}

/** Comparison is exact apart from the sign of zero, which no transform can express. */
function exact(value: number) {
  return value === 0 ? 0 : value;
}

/** What the eye reads of one shell, with none of the ordering a paint-order check owns. */
function poseGeometry(pose: StackedDeckPose) {
  return {
    opacity: exact(pose.opacity),
    rotate: exact(pose.rotate),
    scale: exact(pose.scale),
    translateX: exact(pose.translateX),
    translateY: exact(pose.translateY),
  };
}

/**
 * Relative paint order, which is the only thing a layer number means. Reported pair by pair so a
 * renumbering that preserves every relative order reads as the same order, because it is one.
 */
function paintOrder(poses: readonly { readonly layer: number }[]) {
  const order: string[] = [];
  for (let first = 0; first < poses.length; first += 1) {
    for (let second = first + 1; second < poses.length; second += 1) {
      const difference = poses[first]!.layer - poses[second]!.layer;
      order.push(`${first}${difference === 0 ? "=" : difference > 0 ? ">" : "<"}${second}`);
    }
  }
  return order;
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
  return segmentForCount(originIndex, direction, progress, 5);
}

function segmentForCount(
  originIndex: number,
  direction: -1 | 1,
  progress: number,
  itemCount: number,
): StackedDeckTraversal {
  return traversal({
    settledIndex: originIndex,
    visualTopIndex: originIndex,
    segmentOriginIndex: originIndex,
    segmentTargetIndex: resolveStackedDeckNeighbor(originIndex, direction, itemCount),
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
  itemCount = 5,
): StackedDeckDirectProjection {
  const { settlementProgress, ...projection } = overrides;
  return {
    direction: Math.sign(_scalarDistance) as -1 | 0 | 1,
    originIndex,
    phase: "held",
    translateX: 0,
    translateY: 0,
    settlement: settlementProgress ?? 0,
    signedTravel: _scalarDistance,
    targetIndex:
      _scalarDistance === 0
        ? null
        : resolveStackedDeckNeighbor(originIndex, Math.sign(_scalarDistance) as -1 | 1, itemCount),
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
    {
      controllerPhase,
      itemCount: 5,
      originIndex: output.settledIndex,
      physicalPosition: physicalIndex - output.settledIndex,
      settledIndex,
    },
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
      originIndex,
      physicalPosition: physicalIndex - originIndex,
      settledIndex,
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
  it("describes every non-dominant shell by canonical ring depth and a compact visual slot", () => {
    for (const [index, itemIndexes, depths, slots] of [
      [0, [1, 2, 3, 4], [1, 2, 3, 4], [1, 2, -2, -1]],
      [2, [0, 1, 3, 4], [3, 4, 1, 2], [-2, -1, 1, 2]],
      [4, [0, 1, 2, 3], [1, 2, 3, 4], [1, 2, -2, -1]],
    ] as const) {
      const pile = resolvePile(traversal({ settledIndex: index, visualTopIndex: index }));
      expect(pile.map((layer) => layer.itemIndex)).toEqual(itemIndexes);
      expect(pile.map((layer) => layer.depth)).toEqual(depths);
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

  it("updates ring depth from the dominant physical top without deriving it from ordinal delta", () => {
    for (const direction of [1, -1] as const) {
      for (const progress of SEGMENT_SAMPLES) {
        const active = segment(2, direction, progress);
        const dominantIndex = progress >= 0.5 ? resolveStackedDeckNeighbor(2, direction, 5) : 2;
        const expectedItems = [0, 1, 2, 3, 4].filter((index) => index !== dominantIndex);
        const pile = resolvePile(active);
        expect(pile.map((layer) => layer.itemIndex)).toEqual(expectedItems);
        expect(pile.map((layer) => layer.depth)).toEqual(
          expectedItems.map((index) => (index - dominantIndex + 5) % 5),
        );
      }
    }
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
    // Paint order follows forward ring depth even after the visual slots fold to the other side.
    for (let depth = 2; depth < pile.length; depth += 1) {
      const current = pile.find((layer) => layer.depth === depth)!;
      const previous = pile.find((layer) => layer.depth === depth - 1)!;
      expect(current.layer).toBeLessThan(previous.layer);
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
        expect(target[key]).toBeCloseTo(nearest[key], 1);
      }
      expect(target.opacity).toBe(1);

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

  it("evaluates backward as the exact inverse of the canonical forward choreography", () => {
    for (const progress of SEGMENT_SAMPLES) {
      const forward = resolveFrame(segment(2, 1, progress)).poses.map(physicalValues);
      const backward = resolveFrame(segment(3, -1, 1 - progress)).poses.map(physicalValues);
      expect(backward).toEqual(forward);
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
    // Completing the pitch consumes the transaction; travel beyond it is overdrag rather than a
    // second segment, so authority remains on the one cyclic neighbour.
    expect(resolveTraversal(state, 3)).toMatchObject({ authoritativeIndex: 3, visualTopIndex: 3 });
    expect(resolveTraversal(state, 3.6)).toMatchObject({
      authoritativeIndex: 3,
      visualTopIndex: 3,
      phase: "elastic",
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

  it("has cyclic neighbours where ordinal deck edges used to be", () => {
    const first = createStackedDeckTraversal(0, 5);
    expect(resolveTraversal(first, -0.25)).toMatchObject({
      visualTopIndex: 0,
      segmentTargetIndex: 4,
      direction: -1,
      signedLocalDistance: -0.25,
      phase: "traversing",
    });
    const last = createStackedDeckTraversal(4, 5);
    expect(resolveTraversal(last, 4.2, "dragging", 4)).toMatchObject({
      visualTopIndex: 4,
      segmentTargetIndex: 0,
      direction: 1,
      phase: "traversing",
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

  it("rejects invalid local origins and positions", () => {
    const state = createStackedDeckTraversal(2, 5);
    expect(() =>
      resolveStackedDeckTraversal(
        {
          controllerPhase: "dragging",
          itemCount: 5,
          originIndex: 5,
          physicalPosition: 0,
          settledIndex: 2,
        },
        state,
      ),
    ).toThrow(RangeError);
    expect(() =>
      resolveStackedDeckTraversal(
        {
          controllerPhase: "dragging",
          itemCount: 5,
          originIndex: 2,
          physicalPosition: Number.NaN,
          settledIndex: 2,
        },
        state,
      ),
    ).toThrow(TypeError);
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

  it("responds directly near the pointer origin and keeps backward physically inverse", () => {
    for (const progress of [0.001, 0.1, 0.25, 0.5, 0.75, 0.99]) {
      const forward = resolveFrame(segment(2, 1, progress));
      const backward = resolveFrame(segment(3, -1, 1 - progress));
      expect(backward.poses.map(physicalValues)).toEqual(forward.poses.map(physicalValues));
      expect(forward.poses[2]!.opacity).toBe(1);
      expect(backward.poses[2]!.opacity).toBe(1);
    }
    const firstStep = Math.abs(resolveFrame(segment(2, 1, 0.001)).poses[2]!.translateX) / 0.001;
    expect(firstStep).toBeGreaterThan(WIDE_TUNING.motionPitch * 0.9);
    expect(firstStep).toBeLessThan(WIDE_TUNING.motionPitch * 1.2);
    const derivativeStep = 0.00001;
    const initialDerivative =
      Math.abs(resolveFrame(segment(2, 1, derivativeStep)).poses[2]!.translateX) / derivativeStep;
    expect(initialDerivative).toBeGreaterThan(WIDE_TUNING.motionPitch * 0.9);
    expect(initialDerivative).toBeLessThan(WIDE_TUNING.motionPitch * 1.1);
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

  it("moves a side-switching background shell through physical occlusion, never the deck face", () => {
    const denseProgress = [
      0,
      0.0005,
      0.001,
      0.002,
      0.003,
      0.005,
      0.0075,
      ...Array.from({ length: 100 }, (_, index) => (index + 1) / 100),
    ];
    for (const exchange of ["shuffle", "direct"] as const) {
      for (const direction of [-1, 1] as const) {
        const frames = denseProgress.map((progress) => {
          const active = progress === 0 ? traversal() : segment(2, direction, progress);
          return exchange === "shuffle"
            ? resolveFrame(active)
            : resolveDirectFrame(
                active,
                directProjection(2, direction * progress, {
                  phase: "held",
                  translateX: -direction * progress * WIDE_TUNING.motionPitch,
                  translateY: 0,
                }),
              );
        });
        if (exchange === "direct") {
          frames.push(
            ...denseProgress.slice(1).map((settlementProgress) =>
              resolveDirectFrame(
                { ...segment(2, direction, 1), authoritativeIndex: 2 + direction },
                directProjection(2, direction, {
                  phase: "parking",
                  settlementProgress,
                  translateX: -direction * WIDE_TUNING.motionPitch,
                  translateY: 0,
                }),
              ),
            ),
          );
        }
        const targetIndex = resolveStackedDeckNeighbor(2, direction, 5);
        const switchingIndex = [0, 1, 2, 3, 4].find((index) => {
          if (index === 2 || index === targetIndex) return false;
          const sourceDepth = (index - 2 + 5) % 5;
          const destinationDepth = (index - targetIndex + 5) % 5;
          const sourceSlot = sourceDepth <= 2 ? sourceDepth : sourceDepth - 5;
          const destinationSlot = destinationDepth <= 2 ? destinationDepth : destinationDepth - 5;
          return Math.sign(sourceSlot) !== Math.sign(destinationSlot);
        });
        expect(switchingIndex).toBeTypeOf("number");
        const painted = frames.map((frame) => paintedMaterialSamples(frame.poses, WIDE_TUNING));
        const samples = painted.map((frame) => frame[switchingIndex!]!);
        const occluded = samples.map((sample) => sample.total === 0);
        const firstOccluded = occluded.indexOf(true);
        const lastOccluded = occluded.lastIndexOf(true);
        expect(firstOccluded).toBeGreaterThan(0);
        expect(lastOccluded).toBeLessThan(samples.length - 1);
        expect(samples.every((sample) => sample.center === 0)).toBe(true);

        const sourceDepth = (switchingIndex! - 2 + 5) % 5;
        const sourceSlot = sourceDepth <= 2 ? sourceDepth : sourceDepth - 5;
        for (const sample of samples.slice(0, firstOccluded)) {
          expect(sourceSlot < 0 ? sample.right : sample.left).toBe(0);
        }
        for (const sample of samples.slice(lastOccluded + 1)) {
          expect(sourceSlot < 0 ? sample.left : sample.right).toBe(0);
        }

        for (const cardIndex of [0, 1, 3, 4].filter(
          (candidateIndex) => candidateIndex !== targetIndex,
        )) {
          const endpointEnvelope = Math.max(
            painted[0]![cardIndex]!.total,
            painted.at(-1)![cardIndex]!.total,
          );
          const peak = Math.max(...painted.map((frame) => frame[cardIndex]!.total));
          expect(peak).toBeLessThanOrEqual(endpointEnvelope + 4);
        }
      }
    }
  });

  it("keeps the folded pile physical for small, odd, even, large, and reduced-motion decks", () => {
    const reduced = resolveStackedDeckTuning({
      stageWidth: 1_120,
      stageHeight: 620,
      reducedMotion: true,
    });
    for (const tuning of [WIDE_TUNING, reduced]) {
      for (const itemCount of [2, 3, 4, 5, 6, 7, 8]) {
        const originIndex = Math.floor(itemCount / 2);
        const source = resolveFrame(
          traversal({
            authoritativeIndex: originIndex,
            segmentOriginIndex: originIndex,
            settledIndex: originIndex,
            visualTopIndex: originIndex,
          }),
          itemCount,
          tuning,
        );
        for (const direction of [-1, 1] as const) {
          const targetIndex = resolveStackedDeckNeighbor(originIndex, direction, itemCount);
          const destination = resolveFrame(
            traversal({
              authoritativeIndex: targetIndex,
              segmentOriginIndex: targetIndex,
              settledIndex: targetIndex,
              visualTopIndex: targetIndex,
            }),
            itemCount,
            tuning,
          );
          const shuffleEndpoint = resolveFrame(
            segmentForCount(originIndex, direction, 1, itemCount),
            itemCount,
            tuning,
          );
          expect(shuffleEndpoint.poses.map(physicalValues)).toEqual(
            destination.poses.map(physicalValues),
          );
          const autonomousEndpoint = resolveStackedDeckFrame(
            {
              direct: {
                direction,
                originIndex,
                settlement: 0,
                signedTravel: direction,
                targetIndex,
                translateX: 0,
                translateY: 0,
              },
              itemCount,
              traversal: {
                ...segmentForCount(originIndex, direction, 1, itemCount),
                authoritativeIndex: targetIndex,
              },
              tuning,
            },
            createStackedDeckFrame(itemCount),
          );
          expect(autonomousEndpoint.poses).toEqual(destination.poses);

          const inverseMatches = (itemCount > 2 ? [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1] : []).every(
            (progress) => {
              const resolveExchangeFrame = (
                topIndex: number,
                exchangeDirection: -1 | 1,
                exchangeProgress: number,
              ) =>
                exchangeProgress === 0
                  ? resolveFrame(
                      traversal({
                        authoritativeIndex: topIndex,
                        segmentOriginIndex: topIndex,
                        settledIndex: topIndex,
                        visualTopIndex: topIndex,
                      }),
                      itemCount,
                      tuning,
                    )
                  : resolveFrame(
                      segmentForCount(topIndex, exchangeDirection, exchangeProgress, itemCount),
                      itemCount,
                      tuning,
                    );
              const forward = resolveExchangeFrame(originIndex, direction, progress);
              const inverse = resolveExchangeFrame(targetIndex, -direction as -1 | 1, 1 - progress);
              return (
                JSON.stringify(forward.poses.map(physicalValues)) ===
                JSON.stringify(inverse.poses.map(physicalValues))
              );
            },
          );
          expect(inverseMatches).toBe(true);
          expect(source.poses.every((pose) => pose.opacity === 1 && pose.visible)).toBe(true);
        }
      }
    }
  });

  it("changes every relative paint order only between clear or fully covered bodies", () => {
    const progress = [
      0,
      0.00005,
      0.0001,
      0.0002,
      0.0005,
      ...Array.from({ length: 1_000 }, (_, index) => (index + 1) / 1_000),
    ];
    expect(progress.at(-1)).toBe(1);
    for (const direction of [-1, 1] as const) {
      const shuffle = progress.map((value) => ({
        poses: resolveFrame(value === 0 ? traversal() : segment(2, direction, value)).poses,
        progress: value,
      }));
      expectEveryPaintSwapSafe(shuffle);

      const held = progress.map((value) => ({
        poses: resolveDirectFrame(
          value === 0 ? traversal() : segment(2, direction, value),
          directProjection(2, direction * value, {
            phase: "held",
            translateX: -direction * value * WIDE_TUNING.motionPitch,
            translateY: 0,
          }),
        ).poses,
        progress: value,
      }));
      expectEveryPaintSwapSafe(held);

      const autonomous = progress.map((value) => ({
        poses: resolveDirectFrame(value === 0 ? traversal() : segment(2, direction, value), {
          direction,
          originIndex: 2,
          settlement: 0,
          signedTravel: direction * value,
          targetIndex: 2 + direction,
          translateX: 0,
          translateY: 0,
        }).poses,
        progress: value,
      }));
      expectEveryPaintSwapSafe(autonomous);

      const parking = progress.map((value) => ({
        poses: resolveDirectFrame(
          { ...segment(2, direction, 1), authoritativeIndex: 2 + direction },
          directProjection(2, direction, {
            phase: "parking",
            settlementProgress: value,
            translateX: -direction * WIDE_TUNING.motionPitch,
            translateY: 120,
          }),
        ).poses,
        progress: value,
      }));
      expectEveryPaintSwapSafe(parking);
    }
  });
});

describe("Direct stacked deck projection", () => {
  it("keeps a direction-authoritative zero-travel command at exact source rest", () => {
    const source = resolveFrame(traversal());
    const commanded = resolveDirectFrame(traversal(), {
      direction: 1,
      originIndex: 2,
      settlement: 0,
      signedTravel: 0,
      targetIndex: 3,
      translateX: 0,
      translateY: 0,
    });
    expect(commanded.poses.map(physicalValues)).toEqual(source.poses.map(physicalValues));
    expect(commanded.poses.map(({ layer, role, visible }) => ({ layer, role, visible }))).toEqual(
      source.poses.map(({ layer, role, visible }) => ({ layer, role, visible })),
    );
  });

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
          for (const key of [
            "translateX",
            "translateY",
            "scale",
            "rotate",
            "opacity",
            "shadowStrength",
          ] as const) {
            expect(low.poses[index]![key]).toBeCloseTo(high.poses[index]![key], 5);
          }
        }
      }
    }
  });

  it("keeps every non-held item finite through its physically occluded route", () => {
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
        const frame = resolveDirectFrame(
          active,
          directProjection(2, direction * progress, {
            phase: "held",
            translateX: -direction * progress * 500,
            translateY: progress * 160,
          }),
        );
        expect(frameIsFinite(frame)).toBe(true);
        expect(frame.poses.every((pose) => pose.opacity === 1 && pose.visible)).toBe(true);
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

  it("crosses the neutral origin without an unoccluded neighbour handoff", () => {
    const pitch = WIDE_TUNING.motionPitch;
    const forwardIndex = resolveStackedDeckNeighbor(2, 1, 5);
    const backwardIndex = resolveStackedDeckNeighbor(2, -1, 5);
    const rest = resolveFrame(traversal());
    const restGeometry = rest.poses.map(poseGeometry);
    const restPainted = paintedMaterialSamples(rest.poses, WIDE_TUNING, PAINT_STEP);

    // The hand crosses its own press point once, densely enough that a single sample of it is a
    // fraction of a pixel. Direction and target change inside this sweep; the pile may not.
    // The hand walks in from one side, through the press point, and out of the other.
    const travels: number[] = [];
    for (let index = MAGNITUDES.length - 1; index >= 0; index -= 1)
      travels.push(MAGNITUDES[index]!);
    travels.push(0);
    for (const magnitude of MAGNITUDES) travels.push(-magnitude);
    const frames = travels.map((travel) => {
      // Zero is geometrically neutral, so the interaction keeps the direction it arrived on — which
      // is exactly the frame a held reversal renders at its turning point.
      const direction = travel < 0 ? -1 : 1;
      const poses = resolveDirectFrame(
        travel === 0 ? traversal() : segment(2, direction, Math.abs(travel)),
        directProjection(2, travel, {
          direction,
          targetIndex: resolveStackedDeckNeighbor(2, direction, 5),
          phase: "held",
          translateX: -travel * pitch,
          translateY: 0,
        }),
      ).poses.map((pose) => ({ ...pose }));
      return {
        painted: paintedMaterialSamples(poses, WIDE_TUNING, PAINT_STEP),
        poses,
        progress: travel,
      };
    });

    const neutral = frames[travels.indexOf(0)]!;
    expect(neutral.poses.map(poseGeometry)).toEqual(restGeometry);
    expect(paintOrder(neutral.poses)).toEqual(paintOrder(rest.poses));

    for (const frame of frames) {
      const far = frame.progress >= 0 ? backwardIndex : forwardIndex;
      // The neighbour this travel is not exchanging cannot gain a pixel from a direction change.
      expect(frame.painted[far]!.total, `idle neighbour at ${frame.progress}`).toBeLessThanOrEqual(
        restPainted[far]!.total,
      );
      if (Math.abs(frame.progress) > CROSSING_BAND) continue;
      // Everything the crossing is allowed to repaint is what the hand itself swept: the strip the
      // source uncovered on one side and the strip it newly covers on the other. Changing direction
      // and target inside this band moves no material of its own, so no shell may gain or lose more
      // than that area — which is what makes the rear neighbour's depth change invisible.
      const swept =
        (Math.abs(frame.progress) * pitch * WIDE_TUNING.cardHeight) / (PAINT_STEP * PAINT_STEP);
      const quantization = (2 * WIDE_TUNING.cardHeight) / PAINT_STEP;
      for (let index = 0; index < frame.painted.length; index += 1) {
        expect(
          Math.abs(frame.painted[index]!.total - restPainted[index]!.total),
          `shell ${index} repainted at ${frame.progress}`,
        ).toBeLessThanOrEqual(swept + quantization);
      }
    }

    // A neighbour is revealed by travel and by nothing else, so its painted area only ever grows
    // as the hand goes further — on whichever side of the crossing the hand is on.
    for (const side of [1, -1] as const) {
      const neighbour = side > 0 ? forwardIndex : backwardIndex;
      let previous = -1;
      for (const magnitude of MAGNITUDES) {
        const frame = frames.find((candidate) => candidate.progress === side * magnitude)!;
        const total = frame.painted[neighbour]!.total;
        expect(total, `reveal at ${side * magnitude}`).toBeGreaterThanOrEqual(previous);
        previous = total;
      }
    }

    // Each monotone half keeps the deck's own clear-or-covered crossover rule. The crossing itself
    // is governed by the swept-area bound above: a hand-held reversal exposes a strip of the card
    // beneath it from the first sub-pixel, which is the deck working, not a paint order changing
    // between bodies that share no pixel.
    expectEveryPaintSwapSafe(frames.filter((frame) => frame.progress >= 0));
    expectEveryPaintSwapSafe(frames.filter((frame) => frame.progress < 0));
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
          expect(outgoing).toMatchObject({ role: step < 1_000 ? "top" : "hidden", visible: true });
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

  it("keeps the hand's own paint layer to the one shell the hand is holding", () => {
    // A press that lands while the previous release is still parking captures that shell exactly as
    // rendered — including the paint layer physical ownership had given it. Restoring its geometry
    // is what keeps it continuous; restoring its ownership puts two shells in the layer that means
    // "the card in the hand", and which of them the browser paints in front is then a question
    // about document order rather than about the deck.
    for (const direction of [-1, 1] as const) {
      const interrupted = resolveDirectFrame(
        { ...segment(2, direction, 0.62), authoritativeIndex: 2 + direction },
        directProjection(2, direction * 0.62, {
          phase: "parking",
          translateX: direction * -370,
          translateY: 90,
          settlementProgress: 0.3,
        }),
      );
      const handLayer = interrupted.poses[2]!.layer;
      expect(handLayer).toBeGreaterThan(interrupted.poses[2 + direction]!.layer);
      const captured = interrupted.poses.map((pose) => ({ ...pose }));

      // The next interaction opens on the card that release was travelling to and goes back the way
      // it came, which makes its own target the very shell the previous one still owns.
      const origin = 2 + direction;
      const travel = -direction * 0.24;
      const frame = resolveDirectFrame(
        segment(origin, -direction as -1 | 1, Math.abs(travel)),
        directProjection(origin, travel, {
          phase: "held",
          translateX: direction * 140,
          translateY: 40,
          continuity: { poses: captured, progress: smooth(Math.abs(travel)) },
        }),
      );
      // Every shell that can cover the deck's centre has a rank of its own, so which one is in
      // front is a fact about the deck rather than about document order.
      const contested = frame.poses.filter((pose) => pose.layer >= TOP_LAYER_VALUE);
      expect(new Set(contested.map((pose) => pose.layer)).size).toBe(contested.length);
      // The card the new hand has taken is the one in front, on this frame and on every frame
      // after it, rather than for one frame being outranked by a hand that has let go.
      expect(frame.poses[origin]!.layer).toBe(handLayer);
      expect(frame.poses[2]!.layer).toBeLessThan(handLayer);
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
          progress: 0.216,
          poses: parking.poses.map((pose) => ({ ...pose })),
        },
      }),
    );

    // Settings becomes the one hand-owned shell; every other complete physical pose begins exactly
    // where the prior frame left it. Paint role and layer are captured with geometry instead of
    // being recomputed early from the destination ring.
    for (let index = 0; index < parking.poses.length; index += 1) {
      if (index === 3) continue;
      expect(physicalValues(interrupted.poses[index]!)).toEqual(
        physicalValues(parking.poses[index]!),
      );
      expect(interrupted.poses[index]).toMatchObject({
        interactive: parking.poses[index]!.interactive,
        role: parking.poses[index]!.role,
        visible: parking.poses[index]!.visible,
      });
    }
    expect(interrupted.poses).toHaveLength(parking.poses.length);
    // Captured paint order is kept relative to the rest of the pile it was captured with, rather
    // than being recomputed early from the destination ring. The shell the previous hand had hold
    // of is the one exception: it no longer outranks the card this hand has taken.
    // Index three is the card this hand has taken and index two is the one the last hand let go
    // of, so those two are the ranks this frame is entitled to decide; the rest are carried over.
    expect(carriedLayers(interrupted.poses, [2, 3])).toEqual(carriedLayers(parking.poses, [2, 3]));
    // Exactly one shell is the card in the hand, and it is the one the hand is on.
    expect(interrupted.poses.filter((pose) => pose.layer > TOP_LAYER_VALUE)).toHaveLength(1);
    expect(interrupted.poses[3]!.layer).toBeGreaterThan(interrupted.poses[2]!.layer);
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

  it("keeps skipped samples inside the one-card physical transaction", () => {
    const state = createStackedDeckTraversal(0, 5);
    const output = createStackedDeckFrame(5);
    for (const physicalIndex of [0.15, 0.62, 1.17, 1.71, 2.14, 2.89, 3.22]) {
      const active = resolveTraversal(state, physicalIndex, "settling", 0);
      const frame = resolveFrame({ ...active }, 5, WIDE_TUNING, output);
      expect(frameIsFinite(frame)).toBe(true);
      expect(frame.poses.filter((pose) => pose.layer === 500)).toHaveLength(1);
    }
    expect(state.visualTopIndex).toBe(1);
    expect(state.segmentTargetIndex).toBeNull();
    expect(state.phase).toBe("elastic");
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

  it("projects one-card envelope overdrag from the same signed mapping", () => {
    const overdrag = traversal({
      settledIndex: 0,
      visualTopIndex: 0,
      segmentOriginIndex: 0,
      direction: -1,
      signedLocalDistance: -0.25,
      localProgress: 0.25,
      phase: "elastic",
    });
    const frame = resolveFrame(overdrag);
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
    const heldSingle = resolveDirectFrame(
      singleTraversal,
      {
        direction: 0,
        originIndex: 0,
        phase: "held",
        translateX: 420,
        translateY: -180,
        settlement: 0,
        signedTravel: 0.8,
        targetIndex: null,
      },
      1,
    );
    expect(heldSingle.poses[0]).toMatchObject({
      role: "top",
      interactive: false,
      translateX: 0,
      translateY: 0,
    });
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
    expect(() =>
      resolveDirectFrame(segment(2, 1, 0.5), {
        ...directProjection(2, 0.5),
        targetIndex: 4,
      }),
    ).toThrowError("direct.targetIndex is not the directed cyclic neighbour");
  });
});
