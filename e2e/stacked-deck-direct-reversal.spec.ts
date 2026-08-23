import { expect, test, type Page } from "@playwright/test";

import { expectCarouselAt, openLabDemo } from "./helpers";
import {
  STACKED_DECK_IDS,
  beginHeldTraversal,
  destinations,
  finishPointer,
  finishPointerBy,
  holdPhysicalIndex,
  holdPointerAt,
  movePointerBy,
  readFrame,
  viewport,
  type HeldTraversal,
} from "./stackedDeckHarness";
import {
  capturePileSnapshot,
  expectPileSnapshotWithinEndpointEnvelope,
  installHighContrastPileFixture,
  type PileSnapshot,
} from "./stackedDeckPileTrace";

test.describe.configure({ timeout: 120_000 });

test.beforeEach(async ({ page }) => {
  await openLabDemo(page, "stacked-deck", "no-preference");
  await installHighContrastPileFixture(page);
});

function neighbourIndex(index: number, direction: -1 | 1) {
  return (index + direction + STACKED_DECK_IDS.length) % STACKED_DECK_IDS.length;
}

async function restAt(page: Page, index: number): Promise<PileSnapshot> {
  await destinations(page).nth(index).click();
  await expectCarouselAt(viewport(page), STACKED_DECK_IDS[index]!);
  return capturePileSnapshot(page);
}

/** The three resting decks one held reversal moves between, plus a hand on the source. */
async function openReversal(page: Page, sourceIndex: number) {
  await page.getByTestId("stacked-deck-exchange-direct").click();
  const source = await restAt(page, sourceIndex);
  const forward = await restAt(page, neighbourIndex(sourceIndex, 1));
  const backward = await restAt(page, neighbourIndex(sourceIndex, -1));
  await restAt(page, sourceIndex);
  return { backward, forward, held: await beginHeldTraversal(page, sourceIndex), source };
}

/**
 * Asserts one held frame is a physical consequence of where the hand is.
 *
 * The pile is checked against the endpoints of whichever exchange this travel is on, exactly as the
 * monotone pile suite checks a one-way traversal. The neighbour on the *other* side is checked
 * separately, because a reversal is the only gesture that can put a hand on both of them, and the
 * defect this covers was that one of them arrived far ahead of the hand.
 */
function expectHeldFrameSupportedByHand(
  snapshot: PileSnapshot,
  rests: {
    readonly backward: PileSnapshot;
    readonly forward: PileSnapshot;
    readonly source: PileSnapshot;
  },
  sourceIndex: number,
  travel: number,
) {
  const tolerance =
    Math.ceil(rests.source.painted.materials[STACKED_DECK_IDS[sourceIndex]!]!.pixelCount * 0.002) +
    4;
  const idleId = STACKED_DECK_IDS[neighbourIndex(sourceIndex, travel >= 0 ? -1 : 1)]!;
  expect(
    snapshot.painted.materials[idleId]!.pixelCount,
    `${idleId} is on the side the hand left, at travel ${travel}`,
  ).toBeLessThanOrEqual(rests.source.painted.materials[idleId]!.pixelCount + tolerance);
  if (travel === 0) return;
  const direction = travel > 0 ? 1 : -1;
  expectPileSnapshotWithinEndpointEnvelope(
    snapshot,
    rests.source,
    direction > 0 ? rests.forward : rests.backward,
    sourceIndex,
    direction,
  );
}

function expectPointerLocked(
  frame: Awaited<ReturnType<typeof readFrame>>,
  held: HeldTraversal,
  travel: number,
  verticalHand = 0,
) {
  const top = frame.poses[held.startIndex]!;
  expect(top.translateX, `held shell X at travel ${travel}`).toBeCloseTo(-travel * held.pitch, 3);
  expect(top.translateY, `held shell Y at travel ${travel}`).toBeCloseTo(verticalHand, 3);
}

const DENSE_CROSSING = [
  0.6, 0.4, 0.2, 0.1, 0.05, 0.02, 0, -0.02, -0.05, -0.1, -0.2, -0.4, -0.6,
] as const;

type BrowserFrame = Awaited<ReturnType<typeof readFrame>> & {
  readonly centreCoveringIndices: readonly number[];
  readonly centreOwnerIndex: number;
  readonly pointerId: number;
  readonly requestedTravel: number;
  readonly sourceCoversCentre: boolean;
};

function poseCoversDeckCentre(
  frame: Awaited<ReturnType<typeof readFrame>>,
  index: number,
  cardHeight: number,
) {
  const pose = frame.poses[index]!;
  if (!pose.visible || pose.opacity <= 0 || pose.scale <= 0) return false;
  const radians = (-pose.rotate * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const localX = (-pose.translateX * cosine + pose.translateY * sine) / pose.scale;
  const localY = (-pose.translateX * sine - pose.translateY * cosine) / pose.scale;
  return Math.abs(localX) <= frame.cardWidth / 2 && Math.abs(localY) <= cardHeight / 2;
}

function captureCentreOwnership(
  frame: Awaited<ReturnType<typeof readFrame>>,
  cardHeight: number,
  pointerId: number,
  requestedTravel: number,
): BrowserFrame {
  const centreCoveringIndices = frame.poses.flatMap((_pose, index) =>
    poseCoversDeckCentre(frame, index, cardHeight) ? [index] : [],
  );
  const centreOwnerIndex = centreCoveringIndices.reduce((owner, index) => {
    if (owner < 0) return index;
    const ownerLayer = frame.poses[owner]!.layer;
    const candidateLayer = frame.poses[index]!.layer;
    return candidateLayer > ownerLayer || (candidateLayer === ownerLayer && index > owner)
      ? index
      : owner;
  }, -1);
  return {
    ...frame,
    centreCoveringIndices,
    centreOwnerIndex,
    pointerId,
    requestedTravel,
    sourceCoversCentre: centreCoveringIndices.includes(3),
  };
}

function exposedCentrePaintViolations(frames: readonly BrowserFrame[]) {
  const violations: {
    after: number;
    before: number;
    from: number;
    higherBodyOccludedAfter: boolean;
    higherBodyOccludedBefore: boolean;
    overlapAfter: boolean;
    overlapBefore: boolean;
    to: number;
  }[] = [];
  for (let index = 1; index < frames.length; index += 1) {
    const previous = frames[index - 1]!;
    const current = frames[index]!;
    const before = previous.centreOwnerIndex;
    const after = current.centreOwnerIndex;
    if (before < 0 || after < 0 || before === after) continue;
    const overlapBefore =
      previous.centreCoveringIndices.includes(before) &&
      previous.centreCoveringIndices.includes(after);
    const overlapAfter =
      current.centreCoveringIndices.includes(before) &&
      current.centreCoveringIndices.includes(after);
    if (!overlapBefore || !overlapAfter) continue;
    const higherBodyOccludedBefore = previous.centreCoveringIndices.some(
      (candidate) =>
        candidate !== before &&
        candidate !== after &&
        previous.poses[candidate]!.layer >
          Math.max(previous.poses[before]!.layer, previous.poses[after]!.layer),
    );
    const higherBodyOccludedAfter = current.centreCoveringIndices.some(
      (candidate) =>
        candidate !== before &&
        candidate !== after &&
        current.poses[candidate]!.layer >
          Math.max(current.poses[before]!.layer, current.poses[after]!.layer),
    );
    if (higherBodyOccludedBefore && higherBodyOccludedAfter) continue;
    violations.push({
      after,
      before,
      from: index - 1,
      higherBodyOccludedAfter,
      higherBodyOccludedBefore,
      overlapAfter,
      overlapBefore,
      to: index,
    });
  }
  return violations;
}

function exposedFailureReport(frames: readonly BrowserFrame[], violations: readonly unknown[]) {
  const first = violations[0] as
    | {
        readonly after: number;
        readonly before: number;
        readonly from: number;
        readonly to: number;
      }
    | undefined;
  if (first === undefined) return "no exposed centre paint violation";
  return JSON.stringify(
    {
      firstViolation: {
        ...first,
        afterId: STACKED_DECK_IDS[first.after],
        beforeId: STACKED_DECK_IDS[first.before],
      },
      frames: frames.slice(Math.max(0, first.from - 2), first.to + 3).map((frame) => ({
        authoritativeIndex: frame.authoritativeIndex,
        centreCoveringIds: frame.centreCoveringIndices.map((index) => STACKED_DECK_IDS[index]),
        centreOwnerId: STACKED_DECK_IDS[frame.centreOwnerIndex],
        controllerPhase: frame.controllerPhase,
        directProjection: frame.directProjection,
        interactionDirection: frame.interactionDirection,
        interactionOwned: frame.interactionOwned,
        landingCount: frame.landingCount,
        physicalIndex: frame.physicalIndex,
        physicalPosition: frame.physicalPosition,
        pointerId: frame.pointerId,
        progress: frame.progress,
        requestedTravel: frame.requestedTravel,
        shells: frame.poses.map((pose) => ({
          id: pose.id,
          interactive: pose.interactive,
          layer: pose.layer,
          role: pose.role,
          rotate: pose.rotate,
          scale: pose.scale,
          translateX: pose.translateX,
          translateY: pose.translateY,
          visibility: pose.visibility,
          visible: pose.visible,
        })),
        sourceCoversCentre: frame.sourceCoversCentre,
        traversalDirection: frame.direction,
        visualTopIndex: frame.visualTopIndex,
      })),
    },
    null,
    2,
  );
}

test("one held Direct reversal traces a single physical path through neutral", async ({ page }) => {
  const stage = viewport(page);
  const rests = await openReversal(page, 2);
  const { held } = rests;
  try {
    for (const travel of DENSE_CROSSING) {
      const frame = await holdPhysicalIndex(page, held, held.startIndex + travel, 40);
      expectPointerLocked(frame, held, travel);
      expectHeldFrameSupportedByHand(await capturePileSnapshot(page), rests, 2, travel);
    }
    // The same scalars, retraced. Nothing about having been the other way may change them.
    for (const travel of DENSE_CROSSING.toReversed()) {
      const frame = await holdPhysicalIndex(page, held, held.startIndex + travel, 40);
      expectPointerLocked(frame, held, travel);
      expectHeldFrameSupportedByHand(await capturePileSnapshot(page), rests, 2, travel);
    }
  } finally {
    await finishPointer(page, held.origin, 0, held.elapsedMs + 80, "pointercancel");
  }
  await expectCarouselAt(stage, STACKED_DECK_IDS[2]!);
});

test("a coalesced sample out of resistance lands the pile where the hand is", async ({ page }) => {
  const stage = viewport(page);
  const rests = await openReversal(page, 2);
  const { held } = rests;
  try {
    for (const [overdrag, crossing] of [
      [1.8, -0.25],
      [-1.8, 0.25],
      [2.6, -0.6],
    ] as const) {
      // Well past the one-card envelope, where the deck answers with resistance rather than travel.
      const resisted = await holdPointerAt(page, held, held.startIndex + overdrag, 40);
      expect(Math.abs(resisted.physicalPosition)).toBeLessThan(Math.abs(overdrag));
      // One sample straight across the press point, as a coalesced move reports it.
      const frame = await holdPhysicalIndex(page, held, held.startIndex + crossing, 16);
      expectPointerLocked(frame, held, crossing);
      expectHeldFrameSupportedByHand(await capturePileSnapshot(page), rests, 2, crossing);
      // And the press point is still the origin, however far resistance was pushed.
      const neutral = await holdPhysicalIndex(page, held, held.startIndex, 40);
      expect(neutral.physicalPosition).toBeCloseTo(0, 6);
      expectPointerLocked(neutral, held, 0);
    }
  } finally {
    await finishPointer(page, held.origin, 0, held.elapsedMs + 80, "pointercancel");
  }
  await expectCarouselAt(stage, STACKED_DECK_IDS[2]!);
});

test("a held reversal across the cyclic boundary is the same physical path", async ({ page }) => {
  const stage = viewport(page);
  const rests = await openReversal(page, 0);
  const { held } = rests;
  try {
    for (const travel of [0.5, 0.1, 0, -0.1, -0.5, 0, 0.5, -0.5]) {
      const frame = await holdPhysicalIndex(page, held, held.startIndex + travel, 40);
      expectPointerLocked(frame, held, travel);
      expectHeldFrameSupportedByHand(await capturePileSnapshot(page), rests, 0, travel);
    }
  } finally {
    await finishPointer(page, held.origin, 0, held.elapsedMs + 80, "pointercancel");
  }
  await expectCarouselAt(stage, STACKED_DECK_IDS[0]!);
});

test("a reversing hand keeps its grip on the card in both axes", async ({ page }) => {
  const stage = viewport(page);
  await page.getByTestId("stacked-deck-exchange-direct").click();
  const held = await beginHeldTraversal(page, 2);
  try {
    for (const [travel, verticalHand] of [
      [0.45, 18],
      [0.02, -9],
      [0, -9],
      [-0.02, -9],
      [-0.45, 26],
      [1.9, 4],
      [-0.3, 4],
    ] as const) {
      held.elapsedMs += 40;
      await movePointerBy(page, held.origin, -travel * held.pitch, verticalHand, held.elapsedMs);
      expectPointerLocked(await readFrame(page), held, travel, verticalHand);
    }
  } finally {
    await finishPointer(page, held.origin, 0, held.elapsedMs + 80, "pointercancel");
  }
  await expectCarouselAt(stage, STACKED_DECK_IDS[2]!);
});

test("an exposed held two-axis reversal changes centre material only by physical motion", async ({
  page,
}) => {
  const stage = viewport(page);
  await page.getByTestId("stacked-deck-exchange-direct").click();
  const held = await beginHeldTraversal(page, 3);
  const initial = await readFrame(page);
  const cardHeight = initial.poses[3]!.height;
  const verticalClearance = cardHeight / 2 + Math.max(32, cardHeight * 0.12);
  const path = [
    0.7, 0.6, 0.56, 0.54, 0.5, 0.2, 0.05, 0.02, 0.005, 0, -0.005, -0.02, -0.05, -0.2, -0.5, -0.54,
    -0.56, -0.6, -0.7,
  ] as const;
  const frames: BrowserFrame[] = [];
  const sampled: BrowserFrame[] = [];
  let currentTravel = 0;

  async function capture(travel: number) {
    held.elapsedMs += 34;
    await movePointerBy(page, held.origin, -travel * held.pitch, verticalClearance, held.elapsedMs);
    await page.waitForTimeout(24);
    const frame = captureCentreOwnership(
      await readFrame(page),
      cardHeight,
      held.origin.pointerId,
      travel,
    );
    frames.push(frame);
    return frame;
  }

  try {
    // The source leaves vertically before scalar navigation begins. The displacement is derived
    // from the rendered card body, so the same proof works across deck profiles.
    for (let step = 1; step <= 6; step += 1) {
      held.elapsedMs += 34;
      await movePointerBy(page, held.origin, 0, (verticalClearance * step) / 6, held.elapsedMs);
      await page.waitForTimeout(24);
      frames.push(
        captureCentreOwnership(await readFrame(page), cardHeight, held.origin.pointerId, 0),
      );
    }
    await capture(0);
    await capture(0);
    const crossingStart = 0;

    const reversePath = path.map((_checkpoint, index) => path[path.length - 1 - index]!);
    for (const checkpoint of [...path, ...reversePath]) {
      const steps = Math.max(
        1,
        Math.ceil((Math.abs(checkpoint - currentTravel) * held.pitch) / 18),
      );
      for (let step = 1; step <= steps; step += 1) {
        await capture(currentTravel + ((checkpoint - currentTravel) * step) / steps);
      }
      await capture(checkpoint);
      sampled.push(await capture(checkpoint));
      currentTravel = checkpoint;
    }

    const crossing = frames.slice(crossingStart);
    expect(
      crossing.every(
        (frame) =>
          frame.controllerPhase === "dragging" &&
          frame.interactionOwned &&
          frame.directProjection?.phase === "held",
      ),
      "the same held pointer did not own the complete crossing",
    ).toBe(true);
    expect(new Set(crossing.map((frame) => frame.pointerId))).toEqual(
      new Set([held.origin.pointerId]),
    );
    expect(
      crossing.every((frame) => frame.landingCount === 0),
      "a held crossing opened a release or landing",
    ).toBe(true);
    const interactionDirections = new Set(crossing.map((frame) => frame.interactionDirection));
    expect(interactionDirections.has(-1) && interactionDirections.has(1)).toBe(true);
    const projectionDirections = new Set(
      crossing.map((frame) => frame.directProjection?.direction),
    );
    expect(projectionDirections.has(-1) && projectionDirections.has(1)).toBe(true);
    const targetIndices = new Set(crossing.map((frame) => frame.directProjection?.targetIndex));
    expect(targetIndices.has(2) && targetIndices.has(4)).toBe(true);

    for (const frame of sampled) {
      expect(frame.poses[3]!.translateX, `team X at ${frame.requestedTravel}`).toBeCloseTo(
        -frame.requestedTravel * held.pitch,
        3,
      );
      expect(frame.poses[3]!.translateY, `team Y at ${frame.requestedTravel}`).toBeCloseTo(
        verticalClearance,
        3,
      );
      expect(frame.physicalPosition, `physical travel at ${frame.requestedTravel}`).toBeCloseTo(
        frame.requestedTravel,
        3,
      );
      expect(frame.directProjection?.signedTravel).toBeCloseTo(frame.requestedTravel, 3);
      expect(frame.sourceCoversCentre, `team covered centre at ${frame.requestedTravel}`).toBe(
        false,
      );
    }

    const violations = exposedCentrePaintViolations(crossing);
    expect(violations, exposedFailureReport(crossing, violations)).toEqual([]);
  } finally {
    await finishPointerBy(
      page,
      held.origin,
      -currentTravel * held.pitch,
      verticalClearance,
      held.elapsedMs + 80,
      "pointercancel",
    );
  }
  await expectCarouselAt(stage, STACKED_DECK_IDS[3]!);
});

test("a reversing touch contact tracks the same physical path as a mouse", async ({ page }) => {
  const stage = viewport(page);
  await page.getByTestId("stacked-deck-exchange-direct").click();
  const held = await beginHeldTraversal(page, 2, "touch");
  try {
    for (const travel of [0.35, 0.1, 0, -0.1, -0.35, 1.7, -0.2, 0]) {
      const frame = await holdPointerAt(page, held, held.startIndex + travel, 40);
      if (Math.abs(travel) <= 1) {
        expect(frame.physicalPosition, `touch travel ${travel}`).toBeCloseTo(travel, 3);
        expectPointerLocked(frame, held, travel);
      }
    }
  } finally {
    await finishPointer(page, held.origin, 0, held.elapsedMs + 80, "pointercancel");
  }
  await expectCarouselAt(stage, STACKED_DECK_IDS[2]!);
});
