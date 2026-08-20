import { expect, test, type Page } from "@playwright/test";

import { expectCarouselAt, openLabDemo } from "./helpers";
import {
  STACKED_DECK_IDS,
  beginHeldTraversal,
  destinations,
  finishPointer,
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
