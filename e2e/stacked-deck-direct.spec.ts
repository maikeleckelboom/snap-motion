import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve as resolvePath } from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";

import { expectCarouselAt, openLabDemo, type ReducedMotionMode } from "./helpers";
import {
  STACKED_DECK_IDS,
  beginPointer,
  beginPointerAt,
  fastFlick,
  finishPointerBy,
  motionPitch,
  movePointer,
  movePointerBy,
  finishPointer,
  destinations,
  readFrame,
  viewport,
  waitForAuthority,
} from "./stackedDeckHarness";

async function nextFrame(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
}

async function waitForRenderedPoseRest(surface: Locator): Promise<number> {
  let previous: number | undefined;
  let stableSamples = 0;
  await expect
    .poll(
      async () => {
        const current = Number(await surface.getAttribute("data-translate-x"));
        stableSamples =
          previous !== undefined && Math.abs(current - previous) <= 0.01 ? stableSamples + 1 : 0;
        previous = current;
        return stableSamples;
      },
      { timeout: 5_000 },
    )
    .toBeGreaterThanOrEqual(3);
  return previous!;
}

async function prepareDirect(
  page: Page,
  index = 3,
  reducedMotion: ReducedMotionMode = "no-preference",
) {
  await openLabDemo(page, "stacked-deck", reducedMotion);
  const directControl = page.getByTestId("stacked-deck-exchange-direct");
  await directControl.click();
  const stage = viewport(page);
  await expect(directControl).toHaveAttribute("aria-pressed", "true");
  await destinations(page).nth(index).click();
  await expectCarouselAt(stage, STACKED_DECK_IDS[index]!);
  return stage;
}

type DirectFrame = Awaited<ReturnType<typeof readFrame>>;

const takeoverFractions = [0, 0.1, 0.2, 0.4, 0.6, 0.8, 0.95] as const;

async function selectStable(page: Page, index: number): Promise<void> {
  const stage = viewport(page);
  await destinations(page).nth(index).click();
  await expectCarouselAt(stage, STACKED_DECK_IDS[index]!);
  await expect(stage).toHaveAttribute("data-phase", "idle", { timeout: 8_000 });
}

function adjacentIndex(index: number, direction: -1 | 1, itemCount = STACKED_DECK_IDS.length) {
  return (index + direction + itemCount) % itemCount;
}

function paintedAuthority(frame: DirectFrame): string {
  return (
    frame.poses
      .filter(
        (pose) =>
          pose.visible &&
          pose.opacity > 0 &&
          pose.left <= frame.stageLeft + frame.stageWidth / 2 &&
          pose.right >= frame.stageLeft + frame.stageWidth / 2 &&
          pose.top <= (frame.stageTop + frame.stageBottom) / 2 &&
          pose.bottom >= (frame.stageTop + frame.stageBottom) / 2,
      )
      .reduce<(typeof frame.poses)[number] | null>(
        // Later DOM order wins equal-layer ties, exactly as CSS stacking paints these siblings.
        (front, pose) => (front === null || pose.layer >= front.layer ? pose : front),
        null,
      )?.id ?? ""
  );
}

async function beginFreshHand(page: Page, index: number) {
  await selectStable(page, index);
  const stage = viewport(page);
  const before = await readFrame(page);
  const origin = await beginPointer(
    stage.locator(
      `[data-snap-motion-stacked-deck-card][data-item-id='${STACKED_DECK_IDS[index]}']`,
    ),
  );
  const owned = await readFrame(page);
  expect(owned.physicalPosition).toBeCloseTo(0, 6);
  expect(owned.interactionOriginIndex).toBe(index);
  return { before, origin, owned, pitch: await motionPitch(stage) };
}

async function commitAndTakeOver(page: Page, startIndex: number, direction: -1 | 1) {
  await selectStable(page, startIndex);
  const stage = viewport(page);
  const pitch = await motionPitch(stage);
  const first = await beginPointer(
    stage.locator(
      `[data-snap-motion-stacked-deck-card][data-item-id='${STACKED_DECK_IDS[startIndex]}']`,
    ),
  );
  const deltaX = -direction * pitch * 0.501;
  await movePointer(page, first, deltaX, 600);
  await nextFrame(page);
  await finishPointer(page, first, deltaX, 1_100, "pointerup");

  const destinationIndex = adjacentIndex(startIndex, direction);
  await waitForAuthority(page, destinationIndex);
  const card = stage.locator(
    `[data-snap-motion-stacked-deck-card][data-item-id='${STACKED_DECK_IDS[destinationIndex]}']`,
  );
  await expect(card).toHaveAttribute("data-deck-interactive", "true");
  const before = await readFrame(page);
  expect(before.visualId).toBe(STACKED_DECK_IDS[destinationIndex]);
  expect(before.authoritativeIndex).toBe(destinationIndex);
  expect(before.settledId).toBe(STACKED_DECK_IDS[startIndex]);
  expect(before.controllerPhase).toBe("settling");

  const origin = await beginPointer(card);
  const owned = await readFrame(page);
  expect(owned.interactionOriginIndex).toBe(destinationIndex);
  expect(owned.physicalPosition).toBeCloseTo(0, 6);
  expect(owned.controllerPosition).toBeCloseTo(
    owned.controllerAnchors.find((anchor) => anchor.id === STACKED_DECK_IDS[destinationIndex])!
      .position,
    6,
  );
  return { before, destinationIndex, origin, owned, pitch };
}

async function driveDenseRelease(
  page: Page,
  origin: Awaited<ReturnType<typeof beginPointer>>,
  pitch: number,
  direction: -1 | 1,
  zero = 0,
) {
  const samples: Array<{ fraction: number; frame: DirectFrame; painted: string }> = [];
  let elapsed = 0;
  for (const fraction of takeoverFractions) {
    if (fraction > 0) {
      elapsed += 120;
      await movePointer(page, origin, -direction * pitch * fraction, elapsed);
      await nextFrame(page);
    }
    const frame = await readFrame(page);
    expect(frame.physicalPosition, `new hand at ${fraction} pitch`).toBeCloseTo(
      zero + direction * fraction,
      3,
    );
    samples.push({ fraction, frame, painted: paintedAuthority(frame) });
  }
  elapsed += 120;
  await movePointer(page, origin, -direction * pitch * 0.8, elapsed);
  await nextFrame(page);
  const beforeRelease = await readFrame(page);
  expect(beforeRelease.physicalPosition).toBeCloseTo(zero + direction * 0.8, 3);
  elapsed += 500;
  await finishPointer(page, origin, -direction * pitch * 0.8, elapsed, "pointerup");
  const release = await readFrame(page);
  return { beforeRelease, release, samples };
}

async function installHighContrastCards(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `
      .stacked-deck-demo .snap-motion-stacked-deck-card-motion,
      .stacked-deck-demo .screen-chrome { border: 0 !important; border-radius: 0 !important; box-shadow: none !important; }
      .stacked-deck-demo .screen-chrome { display: grid !important; place-items: center !important; }
      .stacked-deck-demo .screen-chrome::after,
      .stacked-deck-demo .stacked-screen-image { display: none !important; }
      .stacked-deck-demo .screen-chrome::before { position: relative; z-index: 1; padding: .65rem .85rem; border: 2px solid currentColor; background: rgb(0 0 0 / .3); color: white; font: 800 1.4rem/1 system-ui,sans-serif; }
      .snap-motion-stacked-deck-card[data-item-id="templates"] .screen-chrome { background: rgb(220 38 38) !important; }
      .snap-motion-stacked-deck-card[data-item-id="templates"] .screen-chrome::before { content: "A / TEMPLATES"; }
      .snap-motion-stacked-deck-card[data-item-id="project"] .screen-chrome { background: rgb(37 99 235) !important; }
      .snap-motion-stacked-deck-card[data-item-id="project"] .screen-chrome::before { content: "B / PROJECT"; }
      .snap-motion-stacked-deck-card[data-item-id="map"] .screen-chrome { background: rgb(22 163 74) !important; }
      .snap-motion-stacked-deck-card[data-item-id="map"] .screen-chrome::before { content: "C / MAP"; }
      .snap-motion-stacked-deck-card[data-item-id="team"] .screen-chrome { background: rgb(234 88 12) !important; }
      .snap-motion-stacked-deck-card[data-item-id="team"] .screen-chrome::before { content: "D / TEAM"; }
      .snap-motion-stacked-deck-card[data-item-id="settings"] .screen-chrome { background: rgb(88 28 135) !important; }
      .snap-motion-stacked-deck-card[data-item-id="settings"] .screen-chrome::before { content: "E / SETTINGS"; }
    `,
  });
}

test("Direct gives identical fresh and chained hands the same transaction zero", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  const stage = await prepareDirect(page);
  const report: Record<string, unknown> = {};

  for (const fixture of ["realistic", "high-contrast"] as const) {
    if (fixture === "high-contrast") await installHighContrastCards(page);

    const fresh = await beginFreshHand(page, 4);
    const freshGesture = await driveDenseRelease(page, fresh.origin, fresh.pitch, 1);
    expect(freshGesture.beforeRelease.visualId).toBe("templates");
    expect(paintedAuthority(freshGesture.beforeRelease)).toBe("templates");
    await expectCarouselAt(stage, "templates");
    await expect(stage).toHaveAttribute("data-phase", "idle", { timeout: 8_000 });

    await selectStable(page, 3);
    await startAuthorityTrace(page);
    const chained = await commitAndTakeOver(page, 3, 1);
    expect(chained.destinationIndex).toBe(4);
    const chainedGesture = await driveDenseRelease(
      page,
      chained.origin,
      chained.pitch,
      1,
      chained.owned.physicalPosition,
    );
    expect(chainedGesture.beforeRelease.visualId).toBe("templates");
    expect(paintedAuthority(chainedGesture.beforeRelease)).toBe("templates");
    await expectCarouselAt(stage, "templates");
    await expect(stage).toHaveAttribute("data-phase", "idle", { timeout: 8_000 });

    const authorityTrace = await readAuthorityTrace(page);
    const painted = runsOf(authorityTrace, (frame) => frame.authority);
    const firstTemplates = painted.indexOf("templates");
    expect(firstTemplates).toBeGreaterThanOrEqual(0);
    expect(painted.slice(firstTemplates)).not.toContain("settings");
    expect(chainedGesture.release.controllerTargetId).toBe("templates");
    expect(freshGesture.release.controllerTargetId).toBe("templates");

    report[fixture] = {
      authorityRuns: painted,
      chained,
      chainedGesture,
      fresh,
      freshGesture,
    };
  }

  const directory = resolvePath(
    import.meta.dirname,
    "..",
    ".artifacts",
    "stacked-deck-chained-takeover",
  );
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, `post-fix-${testInfo.project.name}.json`),
    `${JSON.stringify(report, null, 2)}\n`,
  );
});

interface OwnedCard {
  readonly index: number;
  readonly origin: Awaited<ReturnType<typeof beginPointer>>;
  readonly pitch: number;
  /**
   * Interaction-local travel this hand started from. A press is not a physical event, so a hand
   * that takes over an unfinished release begins on the travel that release had genuinely
   * completed rather than on an invented zero, and its own travel is measured from there.
   */
  readonly zero: number;
}

function expectCompletePhysicalFrame(frame: DirectFrame, itemIds = STACKED_DECK_IDS): void {
  expect(frame.poses.map((pose) => pose.id)).toEqual(itemIds);
  expect(frame.poses.every((pose) => pose.opacity === 1 && Number.isFinite(pose.translateX))).toBe(
    true,
  );
  const coveringLayers = frame.poses
    .filter(
      (pose) =>
        pose.visible &&
        pose.left <= frame.stageLeft + frame.stageWidth / 2 &&
        pose.right >= frame.stageLeft + frame.stageWidth / 2,
    )
    .map((pose) => pose.layer);
  // Exactly one shell paints this point. Ranks below the topmost are covered by it, and a pile is
  // a neighbourhood rather than a queue: mirrored slots are equally deep on purpose, so ordering
  // them against each other would be inventing a fact the deck does not have.
  const frontLayer = Math.max(...coveringLayers);
  expect(coveringLayers.filter((layer) => layer === frontLayer)).toHaveLength(1);
}

async function releaseAndTakeOver(
  page: Page,
  held: OwnedCard,
  direction: -1 | 1,
): Promise<{ owned: OwnedCard; release: DirectFrame; takeover: DirectFrame }> {
  const deltaX = -direction * held.pitch * 0.8;
  await movePointer(page, held.origin, deltaX, 600);
  await nextFrame(page);
  const heldFrame = await readFrame(page);
  expect(heldFrame.physicalPosition).toBeCloseTo(held.zero + direction * 0.8, 3);
  expectCompletePhysicalFrame(heldFrame);
  await finishPointer(page, held.origin, deltaX, 1_100, "pointerup");

  const targetIndex = adjacentIndex(held.index, direction);
  await waitForAuthority(page, targetIndex);
  const release = await readFrame(page);
  expect(release.visualId).toBe(STACKED_DECK_IDS[targetIndex]);
  expect(release.activeId).toBe(STACKED_DECK_IDS[targetIndex]);
  expect(release.authoritativeIndex).toBe(targetIndex);
  expectCompletePhysicalFrame(release);

  const card = viewport(page).locator(
    `[data-snap-motion-stacked-deck-card][data-item-id='${STACKED_DECK_IDS[targetIndex]}']`,
  );
  await expect(card).toHaveAttribute("data-deck-interactive", "true");
  const origin = await beginPointer(card);
  const takeover = await readFrame(page);
  expect(takeover.interactionOriginIndex).toBe(targetIndex);
  // The scalar mass keeps the position the unfinished release left it at. A press is not a physical
  // event, so it cannot move the deck to an invented zero; the travel this hand starts from is the
  // travel that release had genuinely completed, and the capture is the frame belonging to it.
  expect(takeover.physicalPosition).toBeCloseTo(0, 6);
  expect(takeover.controllerPosition).toBeCloseTo(
    takeover.controllerAnchors.find((anchor) => anchor.id === STACKED_DECK_IDS[targetIndex])!
      .position,
    6,
  );
  expectCompletePhysicalFrame(takeover);
  return {
    owned: { index: targetIndex, origin, pitch: held.pitch, zero: takeover.physicalPosition },
    release,
    takeover,
  };
}

test("Direct chains interior and wrap exchanges for two revolutions without scalar debt", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const stage = await prepareDirect(page, 0);
  const initial = await beginFreshHand(page, 0);
  let held: OwnedCard = { index: 0, origin: initial.origin, pitch: initial.pitch, zero: 0 };
  const itinerary = [STACKED_DECK_IDS[0]];

  for (let exchange = 0; exchange < STACKED_DECK_IDS.length * 2; exchange += 1) {
    const result = await releaseAndTakeOver(page, held, 1);
    held = result.owned;
    itinerary.push(STACKED_DECK_IDS[held.index]!);
  }
  expect(itinerary).toEqual([
    "templates",
    "project",
    "map",
    "team",
    "settings",
    "templates",
    "project",
    "map",
    "team",
    "settings",
    "templates",
  ]);

  for (let exchange = 0; exchange < STACKED_DECK_IDS.length * 2; exchange += 1) {
    const result = await releaseAndTakeOver(page, held, -1);
    held = result.owned;
    itinerary.push(STACKED_DECK_IDS[held.index]!);
  }
  expect(itinerary.slice(-11)).toEqual([
    "templates",
    "settings",
    "team",
    "map",
    "project",
    "templates",
    "settings",
    "team",
    "map",
    "project",
    "templates",
  ]);
  await finishPointer(page, held.origin, 0, 100, "pointercancel");
  await expectCarouselAt(stage, "templates");
});

test("Direct takeover preserves same-hand reversal and the two-item physical direction", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const stage = await prepareDirect(page, 0);
  const initial = await beginFreshHand(page, 0);
  const held = (
    await releaseAndTakeOver(
      page,
      { index: 0, origin: initial.origin, pitch: initial.pitch, zero: 0 },
      1,
    )
  ).owned;

  // B travels toward C from wherever the release left it, reverses back through its own press
  // point, and commits toward A. Every one of those is the hand's own travel, added to that zero.
  await movePointer(page, held.origin, -held.pitch * 0.6, 180);
  await nextFrame(page);
  expect((await readFrame(page)).physicalPosition).toBeCloseTo(held.zero + 0.6, 3);
  await movePointer(page, held.origin, 0, 360);
  await nextFrame(page);
  expect((await readFrame(page)).physicalPosition).toBeCloseTo(held.zero, 3);
  await movePointer(page, held.origin, held.pitch * 0.8, 540);
  await nextFrame(page);
  const reversed = await readFrame(page);
  expect(reversed.physicalPosition).toBeCloseTo(held.zero - 0.8, 3);
  expect(reversed.direction).toBe(-1);
  await finishPointer(page, held.origin, held.pitch * 0.8, 1_040, "pointerup");
  await expectCarouselAt(stage, "templates");

  await expect(stage).toHaveAttribute("data-phase", "idle", { timeout: 8_000 });
  await page.getByTestId("stacked-deck-two-items").click();
  await page.getByTestId("stacked-deck-destination").selectOption("team");
  await expectCarouselAt(stage, "team");
  await expect(stage).toHaveAttribute("data-phase", "idle", { timeout: 8_000 });
  const pitch = await motionPitch(stage);
  let origin = await beginPointer(
    stage.locator("[data-snap-motion-stacked-deck-card][data-item-id='team']"),
  );
  expect((await readFrame(page)).physicalPosition).toBeCloseTo(0, 6);
  await movePointer(page, origin, -pitch * 0.8, 600);
  await finishPointer(page, origin, -pitch * 0.8, 1_100, "pointerup");
  await waitForAuthority(page, 1);
  await expect(stage).toHaveAttribute("data-phase", "settling");
  origin = await beginPointer(
    stage.locator("[data-snap-motion-stacked-deck-card][data-item-id='settings']"),
  );
  expect((await readFrame(page)).physicalPosition).toBeCloseTo(0, 6);
  await movePointer(page, origin, pitch * 0.8, 600);
  await nextFrame(page);
  const twoItemReverse = await readFrame(page);
  expect(twoItemReverse.physicalPosition).toBeCloseTo(-0.8, 3);
  expect(twoItemReverse.direction).toBe(-1);
  expect(twoItemReverse.segmentTargetIndex).toBe(0);
  await finishPointer(page, origin, pitch * 0.8, 1_100, "pointerup");
  await expectCarouselAt(stage, "team");
});

async function surfaceTranslateX(page: Page, id: string): Promise<number> {
  return Number(
    await page
      .locator(`[data-snap-motion-stacked-deck-card][data-item-id='${id}'] .screen-chrome`)
      .getAttribute("data-translate-x"),
  );
}

async function waitForRenderedSettlement(
  page: Page,
  id: string,
  startX: number,
  finalX: number,
  wanted: number,
): Promise<number> {
  return page
    .locator(`[data-snap-motion-stacked-deck-card][data-item-id='${id}'] .screen-chrome`)
    .evaluate(
      (surface, input) =>
        new Promise<number>((resolve, reject) => {
          let remaining = 300;
          const tick = () => {
            const current = Number((surface as HTMLElement).dataset.translateX);
            const progress = (current - input.startX) / (input.finalX - input.startX);
            if (progress >= input.wanted) resolve(progress);
            else if ((remaining -= 1) <= 0) reject(new Error("parking never reached sample"));
            else requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }),
      { finalX, startX, wanted },
    );
}

test("Direct establishes a new zero throughout parking and after parking outruns the spring", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const stage = await prepareDirect(page, 4);
  await selectStable(page, 4);
  const parkedTeamX = await surfaceTranslateX(page, "team");

  for (const wanted of [0.1, 0.3, 0.5, 0.8]) {
    await selectStable(page, 3);
    const pitch = await motionPitch(stage);
    const team = stage.locator("[data-snap-motion-stacked-deck-card][data-item-id='team']");
    const first = await beginPointer(team);
    await movePointer(page, first, -pitch, 600);
    await nextFrame(page);
    const releaseX = await surfaceTranslateX(page, "team");
    await finishPointer(page, first, -pitch, 1_100, "pointerup");
    await waitForAuthority(page, 4);
    const actualSettlement = await waitForRenderedSettlement(
      page,
      "team",
      releaseX,
      parkedTeamX,
      wanted,
    );
    expect(actualSettlement).toBeGreaterThanOrEqual(wanted);
    // A full-pitch release leaves the controller idle while Direct presentation is still parking.
    expect((await readFrame(page)).controllerPhase).toBe("idle");
    const takeover = await beginPointer(
      stage.locator("[data-snap-motion-stacked-deck-card][data-item-id='settings']"),
    );
    expect((await readFrame(page)).physicalPosition).toBeCloseTo(0, 6);
    await finishPointer(page, takeover, 0, 100, "pointercancel");
  }

  // A threshold commit leaves more scalar spring travel than the 230ms parking presentation.
  await selectStable(page, 3);
  const pitch = await motionPitch(stage);
  const first = await beginPointer(
    stage.locator("[data-snap-motion-stacked-deck-card][data-item-id='team']"),
  );
  await movePointer(page, first, -pitch * 0.501, 600);
  await nextFrame(page);
  const releaseX = await surfaceTranslateX(page, "team");
  await finishPointer(page, first, -pitch * 0.501, 1_100, "pointerup");
  await waitForAuthority(page, 4);
  await waitForRenderedSettlement(page, "team", releaseX, parkedTeamX, 0.999);
  const presentationComplete = await readFrame(page);
  expect(presentationComplete.controllerPhase).toBe("settling");
  expect(await surfaceTranslateX(page, "team")).toBeCloseTo(parkedTeamX, 1);
  const takeover = await beginPointer(
    stage.locator("[data-snap-motion-stacked-deck-card][data-item-id='settings']"),
  );
  expect((await readFrame(page)).physicalPosition).toBeCloseTo(0, 6);
  await finishPointer(page, takeover, 0, 100, "pointercancel");
});

test("Direct dark-to-light takeover preserves overlapping paint order at new-hand zero", async ({
  page,
}) => {
  const stage = await prepareDirect(page, 4);
  const pitch = await motionPitch(stage);
  const settings = stage.locator("[data-snap-motion-stacked-deck-card][data-item-id='settings']");
  const origin = await beginPointer(settings);
  await movePointer(page, origin, -pitch, 600);
  await nextFrame(page);
  await finishPointer(page, origin, -pitch, 1_100, "pointerup");
  const templates = stage.locator("[data-snap-motion-stacked-deck-card][data-item-id='templates']");
  // Waiting for the deck to offer its new top, reading the frame, and pressing — all in one page
  // task. Split across round trips, the release can finish in between, and then the comparison is
  // against a deck that no longer exists rather than the one the press actually landed on.
  const pressed = await templates.evaluate(async (element, pointerId) => {
    const deck = element.closest<HTMLElement>("[data-testid='stacked-deck-viewport']")!;
    for (let remaining = 300; Number(deck.dataset.authoritativeIndex) !== 0; remaining -= 1) {
      if (remaining <= 0) throw new Error("the deck never named its new top");
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    const before = Object.fromEntries(
      [...document.querySelectorAll<HTMLElement>(".snap-motion-stacked-deck-card")].map((card) => {
        const box = card.querySelector<HTMLElement>(".screen-chrome")!.getBoundingClientRect();
        return [
          card.dataset.itemId ?? "",
          { layer: Number(getComputedStyle(card).zIndex), left: box.left, right: box.right },
        ] as const;
      }),
    );
    const box = element.getBoundingClientRect();
    const press = {
      pointerId,
      pointerType: "mouse" as const,
      timestamp: performance.now(),
      x: box.left + box.width / 2,
      y: box.top + box.height / 2,
    };
    element.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        button: 0,
        buttons: 1,
        clientX: press.x,
        clientY: press.y,
        isPrimary: true,
        pointerId,
        pointerType: "mouse",
      }),
    );
    return { before, press };
  }, 7_401);
  const takeover = pressed.press;
  await nextFrame(page);
  const owned = await readFrame(page);
  const darkBefore = pressed.before.settings!;
  const lightBefore = pressed.before.templates!;
  // The premise: the release is still carrying Settings over the deck, and the two bodies overlap.
  expect(darkBefore.layer).toBeGreaterThan(lightBefore.layer);
  expect(
    Math.min(darkBefore.right, lightBefore.right) - Math.max(darkBefore.left, lightBefore.left),
  ).toBeGreaterThan(0);

  const darkOwned = owned.poses.find((pose) => pose.id === "settings")!;
  const lightOwned = owned.poses.find((pose) => pose.id === "templates")!;
  // A press cannot land a shell a release is still carrying: the pixels the two of them share
  // still belong to the card they belonged to on the frame before it.
  expect(owned.physicalPosition).toBeCloseTo(0, 6);
  expect(
    Math.sign(darkOwned.layer - lightOwned.layer),
    "pointerdown repainted overlapping Settings and Templates pixels",
  ).toBe(Math.sign(darkBefore.layer - lightBefore.layer));
  await movePointer(page, takeover, -1, 16);
  await nextFrame(page);
  const firstMovement = await readFrame(page);
  const darkMoved = firstMovement.poses.find((pose) => pose.id === "settings")!;
  const lightMoved = firstMovement.poses.find((pose) => pose.id === "templates")!;
  const firstMovementOverlap =
    Math.min(darkMoved.right, lightMoved.right) - Math.max(darkMoved.left, lightMoved.left);
  if (firstMovementOverlap > 0) {
    expect(
      Math.sign(darkMoved.layer - lightMoved.layer),
      "the first new-hand pixel repainted overlapping Settings and Templates",
    ).toBe(Math.sign(darkBefore.layer - lightBefore.layer));
  }
  await finishPointer(page, takeover, -1, 100, "pointercancel");
});

interface ShellSample {
  readonly layer: number;
  readonly opacity: number;
  readonly role: string;
  readonly x: number;
  readonly y: number;
}

async function startShellRecorder(page: Page, id: string): Promise<void> {
  await page.evaluate((itemId) => {
    const shell = document.querySelector<HTMLElement>(
      `[data-snap-motion-stacked-deck-card][data-item-id='${itemId}']`,
    )!;
    const motion = shell.querySelector<HTMLElement>(".snap-motion-stacked-deck-card-motion")!;
    const samples: ShellSample[] = [];
    Object.assign(window, { snapMotionDirectShellSamples: samples });
    let remaining = 120;
    const record = () => {
      const matrix = new DOMMatrixReadOnly(getComputedStyle(motion).transform);
      samples.push({
        layer: Number(shell.dataset.deckLayer),
        opacity: Number(getComputedStyle(shell).opacity),
        role: shell.dataset.deckRole ?? "unknown",
        x: matrix.m41,
        y: matrix.m42,
      });
      if ((remaining -= 1) > 0) requestAnimationFrame(record);
    };
    requestAnimationFrame(record);
  }, id);
}

async function shellSamples(page: Page): Promise<readonly ShellSample[]> {
  return page.evaluate(
    () =>
      (
        window as typeof window & {
          snapMotionDirectShellSamples?: readonly ShellSample[];
        }
      ).snapMotionDirectShellSamples ?? [],
  );
}

function expectContinuousOpaqueSettlement(samples: readonly ShellSample[]): void {
  expect(samples.length).toBeGreaterThan(8);
  expect(samples.every((sample) => sample.opacity === 1)).toBe(true);
  expect(samples.some((sample) => sample.role === "hidden")).toBe(true);
}

async function grabPointError(
  page: Page,
  id: string,
  origin: { x: number; y: number },
  deltaX: number,
  deltaY: number,
) {
  return page.evaluate(
    ({ deltaX: pointerDeltaX, deltaY: pointerDeltaY, itemId, origin: pointerOrigin }) => {
      const root = document.querySelector<HTMLElement>("[data-testid='stacked-deck-viewport']")!;
      const card = document.querySelector<HTMLElement>(
        `[data-snap-motion-stacked-deck-card][data-item-id='${itemId}']`,
      )!;
      const motion = card.querySelector<HTMLElement>(".snap-motion-stacked-deck-card-motion")!;
      const rootBox = root.getBoundingClientRect();
      const box = motion.getBoundingClientRect();
      const pointerX = pointerOrigin.x + pointerDeltaX;
      const pointerY = pointerOrigin.y + pointerDeltaY;
      const grabX = pointerOrigin.x - (rootBox.left + rootBox.width / 2);
      const grabY = pointerOrigin.y - (rootBox.top + rootBox.height / 2);
      const transformedX = box.left + box.width / 2 + grabX;
      const transformedY = box.top + box.height / 2 + grabY;
      const errorX = transformedX - pointerX;
      const errorY = transformedY - pointerY;
      return {
        error: Math.hypot(errorX, errorY),
        errorX,
        errorY,
      };
    },
    { deltaX, deltaY, itemId: id, origin },
  );
}

/**
 * One rendered frame of a release, read from the DOM the way an eye reads it: painted boxes and
 * paint order, not the numbers the deck believes in.
 */
interface ReleaseShellFrame {
  readonly layer: number;
  /** Painted edges of the card body, which is what "these two overlap" is a fact about. */
  readonly left: number;
  readonly opacity: number;
  /** Deck-space translation, which is what a destination pile slot is expressed in. */
  readonly poseX: number;
  readonly poseY: number;
  readonly right: number;
  readonly role: string;
  readonly rotate: number;
  readonly scale: number;
}

interface ReleaseFrame {
  readonly authoritativeIndex: number;
  readonly incoming: ReleaseShellFrame;
  readonly originIndex: number;
  readonly outgoing: ReleaseShellFrame;
  readonly owned: boolean;
  readonly physicalIndex: number;
  readonly t: number;
}

interface ReleaseEvent {
  readonly frame: number;
  readonly sequence: number;
  readonly t: number;
  readonly type: string;
}

interface ReleaseTrace {
  readonly cardWidth: number;
  readonly events: readonly ReleaseEvent[];
  readonly frames: readonly ReleaseFrame[];
}

declare global {
  interface Window {
    snapMotionReleaseTrace?: ReleaseTrace;
  }
}

/**
 * Records every rendered frame across a release, plus the pointer events that produced them.
 *
 * Everything measured here is observable: the painted box of each shell, its paint order, and the
 * deck's own published diagnostics. That is deliberate — the defect under test is what the eye
 * sees on one frame, so the evidence has to be read from the same place.
 */
async function startReleaseTrace(
  page: Page,
  outgoingId: string,
  incomingId: string,
  frames = 160,
): Promise<void> {
  await page.evaluate(
    ({ frames: frameBudget, incomingId: incoming, outgoingId: outgoing }) => {
      const root = document.querySelector<HTMLElement>("[data-testid='stacked-deck-viewport']")!;
      const readShell = (id: string) => {
        const shell = root.querySelector<HTMLElement>(
          `[data-snap-motion-stacked-deck-card][data-item-id='${id}']`,
        )!;
        const motion = shell.querySelector<HTMLElement>(".snap-motion-stacked-deck-card-motion")!;
        const surface = shell.querySelector<HTMLElement>(".screen-chrome")!;
        // Painted boxes and published poses only. Resolving computed styles here would flush style
        // for both shells on every frame and starve the very frames this is measuring.
        const box = motion.getBoundingClientRect();
        return {
          layer: Number(shell.dataset.deckLayer),
          left: box.left,
          opacity: Number(shell.style.opacity),
          poseX: Number(surface.dataset.translateX),
          poseY: Number(surface.dataset.translateY),
          right: box.right,
          role: shell.dataset.deckRole ?? "",
          rotate: Number(surface.dataset.rotate),
          scale: Number(surface.dataset.scale),
        };
      };
      const trace = {
        cardWidth: Number(root.dataset.cardWidth),
        events: [] as unknown[],
        frames: [] as unknown[],
      };
      window.snapMotionReleaseTrace = trace as never;
      let sequence = 0;
      for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel"]) {
        window.addEventListener(
          type,
          () => {
            trace.events.push({
              frame: trace.frames.length,
              sequence: (sequence += 1),
              t: performance.now(),
              type,
            });
          },
          { capture: true },
        );
      }
      let remaining = frameBudget;
      const record = () => {
        const originIndex = Number(root.dataset.interactionOriginIndex);
        const settledIndex = Number(root.dataset.settledIndex);
        const diagnosticOrigin = originIndex >= 0 ? originIndex : settledIndex;
        trace.frames.push({
          authoritativeIndex: Number(root.dataset.authoritativeIndex),
          incoming: readShell(incoming),
          originIndex,
          outgoing: readShell(outgoing),
          owned: root.dataset.interactionOwned === "true",
          physicalIndex: diagnosticOrigin + Number(root.dataset.physicalIndex),
          t: performance.now(),
        });
        if ((remaining -= 1) > 0) requestAnimationFrame(record);
      };
      requestAnimationFrame(record);
    },
    { frames, incomingId, outgoingId },
  );
}

async function readReleaseTrace(page: Page): Promise<ReleaseTrace> {
  return page.evaluate(
    () => window.snapMotionReleaseTrace ?? { cardWidth: 0, events: [], frames: [] },
  );
}

/** Painted horizontal overlap of the two card bodies. Positive means they share pixel columns. */
function bodyOverlap(frame: ReleaseFrame): number {
  return (
    Math.min(frame.outgoing.right, frame.incoming.right) -
    Math.max(frame.outgoing.left, frame.incoming.left)
  );
}

interface ReleaseReview {
  readonly crossovers: readonly {
    readonly frame: number;
    /** Milliseconds between the frame before the swap and the frame it happened on. */
    readonly intervalMs: number;
    readonly overlap: number;
    readonly overlapBefore: number;
  }[];
  readonly finalOutgoing: ReleaseShellFrame;
  readonly frameCount: number;
  /** Mean rendered frame interval across the release, in milliseconds. */
  readonly frameIntervalMs: number;
  readonly maximumStep: number;
  readonly minimumOpacity: number;
  readonly overlapAtRelease: number;
  readonly overlappedWhileInFront: number;
  readonly longestStall: number;
  readonly restIntrusions: number;
  readonly stalledFrames: number;
}

/**
 * Reduces one recorded release to the facts the physical model claims.
 *
 * A crossover is a frame where paint order between the two shells inverts. A stall is a stretch of
 * frames where a shell that has not arrived does not move at all. A rest intrusion is a frame that
 * draws the released shell at the deck's nominal rest geometry while it is still travelling —
 * which is what a presentation being cleared out from under an unfinished path looks like.
 */
function reviewRelease(trace: ReleaseTrace, restX: number, from: number): ReleaseReview {
  const frames = trace.frames.slice(from);
  const crossovers: { frame: number; overlap: number; overlapBefore: number }[] = [];
  let maximumStep = 0;
  let minimumOpacity = 1;
  let overlappedWhileInFront = 0;
  let restIntrusions = 0;
  let stalledFrames = 0;
  let longestStall = 0;
  let currentStall = 0;
  for (let index = 0; index < frames.length; index += 1) {
    const frame = frames[index]!;
    minimumOpacity = Math.min(minimumOpacity, frame.outgoing.opacity, frame.incoming.opacity);
    const behind = frame.outgoing.layer < frame.incoming.layer;
    if (!behind && bodyOverlap(frame) > 0) overlappedWhileInFront += 1;
    const previous = frames[index - 1];
    if (previous === undefined) continue;
    maximumStep = Math.max(
      maximumStep,
      Math.hypot(
        frame.outgoing.poseX - previous.outgoing.poseX,
        frame.outgoing.poseY - previous.outgoing.poseY,
      ),
    );
    if (behind !== previous.outgoing.layer < previous.incoming.layer) {
      crossovers.push({
        frame: index,
        intervalMs: frame.t - previous.t,
        overlap: bodyOverlap(frame),
        overlapBefore: bodyOverlap(previous),
      });
    }
    const arrived = Math.abs(frame.outgoing.poseX - restX) <= 0.5;
    if (
      !arrived &&
      frame.outgoing.poseX === previous.outgoing.poseX &&
      frame.outgoing.poseY === previous.outgoing.poseY
    ) {
      stalledFrames += 1;
      currentStall += 1;
      longestStall = Math.max(longestStall, currentStall);
    } else {
      currentStall = 0;
    }
    // Nominal rest is the pose the deck draws with no release in flight at all. Passing through it
    // is normal at the end; being drawn there while still hundreds of pixels of path remain is the
    // presentation having been taken away mid-flight.
    if (
      !arrived &&
      Math.abs(frame.outgoing.poseX) <= 0.5 &&
      Math.abs(previous.outgoing.poseX) > 8
    ) {
      restIntrusions += 1;
    }
  }
  return {
    crossovers,
    finalOutgoing: frames.at(-1)!.outgoing,
    frameCount: frames.length,
    frameIntervalMs: (frames.at(-1)!.t - frames[0]!.t) / Math.max(1, frames.length - 1),
    longestStall,
    maximumStep,
    minimumOpacity,
    overlapAtRelease: bodyOverlap(frames[0]!),
    overlappedWhileInFront,
    restIntrusions,
    stalledFrames,
  };
}

test("Direct keeps three local grab points attached through diagonal owned movement", async ({
  page,
}) => {
  const stage = await prepareDirect(page);
  const pitch = await motionPitch(stage);

  for (const [relativeX, relativeY] of [
    [0.5, 0.5],
    [0.2, 0.2],
    [0.8, 0.75],
  ] as const) {
    await destinations(page).nth(3).click();
    await expectCarouselAt(stage, "team");
    const card = page.locator("[data-snap-motion-stacked-deck-card][data-item-id='team']");
    const origin = await beginPointerAt(card, relativeX, relativeY);
    await movePointerBy(page, origin, -pitch * 0.42, 96, 120);
    await nextFrame(page);

    await expect(stage).toHaveAttribute("data-owned", "true");
    const error = await grabPointError(page, "team", origin, -pitch * 0.42, 96);
    expect(error.error).toBeLessThanOrEqual(0.5);

    await finishPointerBy(page, origin, -pitch * 0.42, 96, 180, "pointercancel");
    await expectCarouselAt(stage, "team");
  }
});

test("Direct reports touch catch-up and owns a former-edge gesture normally", async ({ page }) => {
  const stage = await prepareDirect(page);
  const pitch = await motionPitch(stage);
  let card = page.locator("[data-snap-motion-stacked-deck-card][data-item-id='team']");
  let origin = await beginPointerAt(card, 0.35, 0.65, "touch");
  await movePointerBy(page, origin, -pitch * 0.38, 72, 100);
  await nextFrame(page);

  const catchUp = await grabPointError(page, "team", origin, -pitch * 0.38, 72);
  expect(catchUp.error).toBeLessThanOrEqual(0.5);
  expect(Number(await stage.getAttribute("data-physical-index"))).toBeGreaterThan(0.2);
  await finishPointerBy(page, origin, -pitch * 0.38, 72, 140, "pointercancel");
  await expectCarouselAt(stage, "team");

  await destinations(page).first().click();
  await expectCarouselAt(stage, "templates");
  card = page.locator("[data-snap-motion-stacked-deck-card][data-item-id='templates']");
  origin = await beginPointerAt(card, 0.5, 0.5);
  await movePointerBy(page, origin, pitch * 0.7, 90, 100);
  await nextFrame(page);
  await expect(card).toHaveAttribute("data-deck-role", "top");
  await finishPointerBy(page, origin, pitch * 0.7, 90, 150, "pointercancel");
  await expectCarouselAt(stage, "templates");
});

test("Direct overdrag and reversal keep one stable origin with only an adjacent target", async ({
  page,
}) => {
  const stage = await prepareDirect(page);
  const pitch = await motionPitch(stage);
  const card = page.locator("[data-snap-motion-stacked-deck-card][data-item-id='team']");
  const origin = await beginPointerAt(card, 0.5, 0.5);

  for (const [deltaX, allowed] of [
    [-pitch * 3, ["team", "settings"]],
    [pitch * 3, ["map", "team"]],
  ] as const) {
    await movePointerBy(page, origin, deltaX, 60, deltaX < 0 ? 100 : 200);
    await nextFrame(page);
    await expect(card).toHaveAttribute("data-deck-role", "top");
    const exchanging = await page
      .locator("[data-snap-motion-stacked-deck-card]")
      .evaluateAll((elements) =>
        elements
          .filter((element) =>
            ["top", "target"].includes((element as HTMLElement).dataset.deckRole ?? ""),
          )
          .map((element) => (element as HTMLElement).dataset.itemId),
      );
    expect(exchanging.every((id) => id !== undefined && allowed.includes(id as never))).toBe(true);
  }

  await finishPointerBy(page, origin, pitch * 3, 60, 240, "pointercancel");
  await expectCarouselAt(stage, "team");
});

test("Direct parks opaquely behind the new top and keeps immediate reversal continuous", async ({
  page,
}) => {
  const stage = await prepareDirect(page);
  const pitch = await motionPitch(stage);
  const outgoing = page.locator("[data-snap-motion-stacked-deck-card][data-item-id='team']");
  await startShellRecorder(page, "team");
  let origin = await beginPointerAt(outgoing, 0.2, 0.75);
  await movePointerBy(page, origin, -pitch * 0.76, 180, 140);
  await nextFrame(page);
  await finishPointerBy(page, origin, -pitch * 0.76, 180, 180, "pointerup");
  await waitForAuthority(page, 4);
  await expect(outgoing).toHaveAttribute("data-deck-role", "hidden");
  const outgoingLayer = Number(await outgoing.getAttribute("data-deck-layer"));

  const incoming = page.locator("[data-snap-motion-stacked-deck-card][data-item-id='settings']");
  await expect(incoming).toHaveAttribute("data-deck-interactive", "true");
  // Authority is semantic and may publish after the physically safe depth crossover has already
  // rendered. At this observation point the released shell must be behind the new interactive top;
  // the dedicated per-frame handoff trace below proves that the earlier crossover replaced no
  // visible material.
  const incomingLayer = Number(await incoming.getAttribute("data-deck-layer"));
  expect(outgoingLayer).toBeLessThan(incomingLayer);
  origin = await beginPointerAt(incoming, 0.75, 0.25);
  await movePointerBy(page, origin, pitch * 0.22, -45, 80);
  await nextFrame(page);
  await expect(incoming).toHaveAttribute("data-deck-role", "top");
  expect(
    (await grabPointError(page, "settings", origin, pitch * 0.22, -45)).error,
  ).toBeLessThanOrEqual(0.5);
  await finishPointerBy(page, origin, pitch * 0.22, -45, 120, "pointercancel");
  await expectCarouselAt(stage, "settings");
  await page.waitForTimeout(350);

  expectContinuousOpaqueSettlement(await shellSamples(page));

  await startShellRecorder(page, "settings");
  const reverse = await beginPointerAt(incoming, 0.8, 0.25);
  await movePointerBy(page, reverse, pitch * 0.76, -180, 140);
  await nextFrame(page);
  await finishPointerBy(page, reverse, pitch * 0.76, -180, 180, "pointerup");
  await expectCarouselAt(stage, "team");
  await page.waitForTimeout(350);
  expectContinuousOpaqueSettlement(await shellSamples(page));

  await startShellRecorder(page, "team");
  const flick = await beginPointerAt(outgoing, 0.5, 0.5);
  await movePointerBy(page, flick, -pitch * 0.18, 35, 8);
  await movePointerBy(page, flick, -pitch * 0.48, 80, 16);
  await nextFrame(page);
  await finishPointerBy(page, flick, -pitch * 0.48, 80, 24, "pointerup");
  await expectCarouselAt(stage, "settings");
  await page.waitForTimeout(350);
  expectContinuousOpaqueSettlement(await shellSamples(page));
});

test("Direct keyboard, controls, wheel, and programmatic navigation share the physical model", async ({
  page,
}) => {
  for (const reducedMotion of ["no-preference", "reduce"] as const) {
    const stage = await prepareDirect(page, 2, reducedMotion);
    await stage.press("ArrowRight");
    await expectCarouselAt(stage, "team");
    await page.getByTestId("stacked-deck-previous").click();
    await expectCarouselAt(stage, "map");
    await destinations(page).nth(3).click();
    await expectCarouselAt(stage, "team");
    const pitch = await motionPitch(stage);
    await stage.evaluate((element, deltaX) => {
      element.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaX }));
    }, pitch * 0.65);
    await expectCarouselAt(stage, "settings");
    expect(
      await stage
        .locator("[data-snap-motion-stacked-deck-card]")
        .evaluateAll((cards) => cards.every((card) => getComputedStyle(card).opacity === "1")),
    ).toBe(true);
  }
});

test("Direct preserves nested controls on the new top and accepts controlled takeover", async ({
  page,
}) => {
  await openLabDemo(page, "defaults", "no-preference");
  await page.getByTestId("defaults-deck-direct").click();
  const stage = page.getByTestId("defaults-deck");
  const initialId = await stage.getAttribute("data-active-id");
  expect(initialId).not.toBeNull();
  let card = stage.locator(`[data-snap-motion-stacked-deck-card][data-item-id='${initialId}']`);
  let origin = await beginPointerAt(card, 0.5, 0.5);
  await movePointerBy(page, origin, -700, 120, 120);
  await finishPointerBy(page, origin, -700, 120, 150, "pointerup");
  await expect(stage).not.toHaveAttribute("data-active-id", initialId!);
  const nextId = await stage.getAttribute("data-active-id");
  card = stage.locator(`[data-snap-motion-stacked-deck-card][data-item-id='${nextId}']`);
  await expect(card).toHaveAttribute("data-deck-interactive", "true");
  await card
    .getByTestId("defaults-card-button")
    .evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.getByTestId("defaults-activations")).toHaveText("1");

  // External authority can take over committed parking without waiting for presentation settlement.
  await page
    .getByTestId("defaults-route-first")
    .evaluate((button: HTMLButtonElement) => button.click());
  await expect(stage).toHaveAttribute("data-active-id", STACKED_DECK_IDS[0]);
  await expect(stage).toHaveAttribute("data-phase", "idle");

  // A cancelled two-axis return is equally interruptible.
  card = stage.locator(
    `[data-snap-motion-stacked-deck-card][data-item-id='${STACKED_DECK_IDS[0]}']`,
  );
  origin = await beginPointerAt(card, 0.5, 0.5);
  await movePointerBy(page, origin, -180, 75, 90);
  await finishPointerBy(page, origin, -180, 75, 110, "pointercancel");
  await expect(card).toHaveAttribute("data-deck-role", "top");
  await page
    .getByTestId("defaults-route-last")
    .evaluate((button: HTMLButtonElement) => button.click());
  await expect(stage).toHaveAttribute("data-active-id", STACKED_DECK_IDS.at(-1)!);
  await expect(stage).toHaveAttribute("data-phase", "idle");

  card = stage.locator(
    `[data-snap-motion-stacked-deck-card][data-item-id='${STACKED_DECK_IDS.at(-1)}']`,
  );
  origin = await beginPointerAt(card, 0.5, 0.5);
  await movePointerBy(page, origin, 180, -60, 90);
  await expect(card).toHaveAttribute("data-deck-role", "top");
  await page
    .getByTestId("defaults-route-first")
    .evaluate((button: HTMLButtonElement) => button.click());
  await expect(stage).toHaveAttribute("data-active-id", STACKED_DECK_IDS[0]);
  await expect(stage).toHaveAttribute("data-phase", "idle");
  await finishPointerBy(page, origin, 180, -60, 130, "pointerup");
  await expect(stage).toHaveAttribute("data-active-id", STACKED_DECK_IDS[0]);
});

/**
 * Drives one release with every rendered frame recorded across it, and reduces the recording to the
 * physical claims the model makes. The hold before the release is deliberate: it puts the last
 * hand-owned frames in the same recording as the first parked ones, which is the seam under test.
 */
async function traceDirectRelease(
  page: Page,
  options: {
    readonly dragX: number;
    readonly dragY: number;
    readonly incomingId: string;
    readonly outgoingId: string;
    readonly startIndex: number;
  },
): Promise<{
  readonly restX: number;
  readonly review: ReleaseReview;
  readonly trace: ReleaseTrace;
}> {
  const stage = viewport(page);
  await destinations(page).nth(options.startIndex).click();
  await expectCarouselAt(stage, STACKED_DECK_IDS[options.startIndex]!);
  await page.waitForTimeout(220);
  const card = page.locator(
    `[data-snap-motion-stacked-deck-card][data-item-id='${options.outgoingId}']`,
  );
  const origin = await beginPointerAt(card, 0.35, 0.6);
  await movePointerBy(page, origin, options.dragX * 0.4, options.dragY * 0.4, 60);
  await movePointerBy(page, origin, options.dragX, options.dragY, 130);
  await startReleaseTrace(page, options.outgoingId, options.incomingId);
  await page.waitForTimeout(140);
  await finishPointerBy(page, origin, options.dragX, options.dragY, 200, "pointerup");
  await expect(stage).toHaveAttribute("data-segment-phase", "idle", { timeout: 5_000 });
  const surface = card.locator(".screen-chrome");
  const restX = await waitForRenderedPoseRest(surface);
  await nextFrame(page);
  const trace = await readReleaseTrace(page);
  const release = trace.events.find((event) => event.type === "pointerup");
  expect(release).toBeDefined();
  return { restX, review: reviewRelease(trace, restX, Math.max(0, release!.frame - 1)), trace };
}

function expectContinuousHandoff(review: ReleaseReview, restX: number): void {
  // One shell, always opaque, and it may never pass behind the new top more than once. A browser may
  // render only the exact settled frame; pairwise crossover and stall claims begin only when it
  // actually presents a second frame to compare.
  expect(review.frameCount).toBeGreaterThanOrEqual(1);
  expect(review.minimumOpacity).toBe(1);
  // It arrives, exactly, at the slot it owns in the destination pile.
  expect(review.finalOutgoing.poseX).toBeCloseTo(restX, 1);
  expect(Number.isFinite(review.finalOutgoing.poseY)).toBe(true);
  if (review.frameCount < 2) return;

  expect(review.crossovers.length).toBeLessThanOrEqual(1);
  // A single repeated sample is the recorder reading a frame before the deck's own callback ran.
  // A stall is a shell that stops while it still has path left, which is what the eye reported.
  expect(review.longestStall).toBeLessThanOrEqual(2);
  // Nothing is ever drawn at nominal rest while it still has path left, either.
  expect(review.restIntrusions).toBe(0);

  // The rest is a claim about single frames, so it can only be judged where the browser rendered
  // the two frames it is about close enough together to be a pair. The settlement is 230ms long;
  // headless WebKit renders this harness in steps of that order, which is a jump cut whatever the
  // deck does with the frames in between.
  if (review.frameIntervalMs > 40) return;
  // Depth changes exactly once, and only on a frame where the two painted bodies share no pixel
  // column — so the swap itself repaints nothing. The frame before it may well overlap: the shell
  // is in front there, and what changes between the two frames is where the card is, not what the
  // shared pixels are made of.
  expect(review.crossovers).toHaveLength(1);
  if (review.crossovers[0]!.intervalMs > 40) return;
  expect(review.crossovers[0]!.overlap).toBeLessThanOrEqual(0);
  // A release that still overlapped the new top stays in front for as long as it does, which is
  // what makes the swap invisible. One that was already clear of it crosses over straight away.
  expect(review.overlappedWhileInFront > 0).toBe(review.overlapAtRelease > 0);
  expect(review.maximumStep).toBeLessThan(300);
}

test("Direct hands one shell over continuously and passes it behind only between clear bodies", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const stage = await prepareDirect(page);
  const pitch = await motionPitch(stage);
  const scenarios = [
    {
      dragX: -pitch * 0.72,
      dragY: 150,
      incomingId: "settings",
      name: "release-handoff-forward",
      outgoingId: "team",
      startIndex: 3,
    },
    {
      dragX: pitch * 0.72,
      dragY: -150,
      incomingId: "team",
      name: "release-handoff-reverse",
      outgoingId: "settings",
      startIndex: 4,
    },
    {
      dragX: -pitch,
      dragY: 90,
      incomingId: "settings",
      name: "full-pitch-release",
      outgoingId: "team",
      startIndex: 3,
    },
    {
      dragX: -pitch * 1.9,
      dragY: -120,
      incomingId: "settings",
      name: "overdrag-release",
      outgoingId: "team",
      startIndex: 3,
    },
  ] as const;

  const report: Record<string, unknown> = {};
  for (const scenario of scenarios) {
    const { restX, review, trace } = await traceDirectRelease(page, scenario);
    const releaseFrame = trace.events.find((event) => event.type === "pointerup")!.frame;
    expectContinuousHandoff(review, restX);
    await expectCarouselAt(stage, scenario.incomingId);
    report[scenario.name] = {
      crossovers: review.crossovers,
      events: trace.events,
      finalOutgoing: review.finalOutgoing,
      frameCount: review.frameCount,
      frameIntervalMs: review.frameIntervalMs,
      frames: trace.frames.slice(Math.max(0, releaseFrame - 2)),
      longestStall: review.longestStall,
      maximumStep: review.maximumStep,
      minimumOpacity: review.minimumOpacity,
      overlapAtRelease: review.overlapAtRelease,
      overlappedWhileInFront: review.overlappedWhileInFront,
      restIntrusions: review.restIntrusions,
      restX,
      stalledFrames: review.stalledFrames,
    };
  }

  const directory = resolvePath(
    import.meta.dirname,
    "..",
    ".artifacts",
    "stacked-deck-direct-review",
    "release-trace",
  );
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, `${testInfo.project.name}.json`),
    `${JSON.stringify(report, null, 2)}\n`,
  );
});

test("Direct release stays finite and completes after the deck itself has stopped", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const stage = await prepareDirect(page);
  const pitch = await motionPitch(stage);
  // A commit at and past a whole pitch: logical travel is already finished at the release frame, so
  // anything deriving parking from remaining scalar distance divides by nothing here.
  for (const dragX of [-pitch, -pitch * 2.4]) {
    const { restX, review, trace } = await traceDirectRelease(page, {
      dragX,
      dragY: 60,
      incomingId: "settings",
      outgoingId: "team",
      startIndex: 3,
    });
    for (const frame of trace.frames) {
      expect(Number.isFinite(frame.outgoing.poseX)).toBe(true);
      expect(Number.isFinite(frame.outgoing.poseY)).toBe(true);
      expect(Number.isFinite(frame.outgoing.scale)).toBe(true);
      expect(Number.isFinite(frame.outgoing.rotate)).toBe(true);
      expect(Number.isFinite(frame.outgoing.left)).toBe(true);
      expect(frame.outgoing.scale).toBeGreaterThan(0);
    }
    // The deck reports rest before the shell has arrived; the shell still arrives.
    expect(trace.frames.some((frame) => !frame.owned)).toBe(true);
    expect(review.longestStall).toBeLessThanOrEqual(2);
    expect(review.finalOutgoing.poseX).toBeCloseTo(restX, 1);
    await expectCarouselAt(stage, "settings");
  }
});

test("Direct grab takes ownership without a frame drawn from the wrong presentation", async ({
  page,
}) => {
  const stage = await prepareDirect(page);
  const pitch = await motionPitch(stage);
  const card = page.locator("[data-snap-motion-stacked-deck-card][data-item-id='team']");
  await startReleaseTrace(page, "team", "settings", 60);
  await page.waitForTimeout(60);
  const origin = await beginPointerAt(card, 0.4, 0.5);
  await page.waitForTimeout(60);
  await movePointerBy(page, origin, -pitch * 0.3, 40, 80);
  await page.waitForTimeout(120);
  const trace = await readReleaseTrace(page);
  const down = trace.events.find((event) => event.type === "pointerdown")!;
  // Before the press the deck is at rest: the card about to be grabbed is the top card, at rest.
  for (const frame of trace.frames.slice(0, down.frame)) {
    expect(frame.outgoing.poseX).toBeCloseTo(0, 1);
    expect(frame.outgoing.layer).toBeGreaterThan(frame.incoming.layer);
  }
  // Across the press and the first owned movement the grabbed shell keeps the front and moves only
  // where the hand moved it: no frame is drawn from the resting projection instead.
  const owned = trace.frames.slice(down.frame);
  let maximumStep = 0;
  for (let index = 1; index < owned.length; index += 1) {
    expect(owned[index]!.outgoing.layer).toBeGreaterThan(owned[index]!.incoming.layer);
    expect(owned[index]!.outgoing.opacity).toBe(1);
    maximumStep = Math.max(
      maximumStep,
      Math.abs(owned[index]!.outgoing.poseX - owned[index - 1]!.outgoing.poseX),
    );
  }
  expect(maximumStep).toBeLessThanOrEqual(pitch * 0.31 + 1);
  await finishPointerBy(page, origin, -pitch * 0.3, 40, 140, "pointercancel");
  await expectCarouselAt(stage, "team");
});

/**
 * One shell as a rendered frame holds it: the transform the browser was handed, its paint order,
 * and whether its painted body covers the deck's centre.
 */
interface AuthorityShell {
  readonly covers: boolean;
  readonly id: string;
  readonly layer: number;
  readonly opacity: number;
  readonly role: string;
  readonly rotate: number;
  readonly scale: number;
  readonly x: number;
  readonly y: number;
}

interface AuthorityFrame {
  readonly authoritativeIndex: number;
  /** The card a user reads as the deck's current one. See {@link startAuthorityTrace}. */
  readonly authority: string;
  readonly interactionOriginIndex: number;
  readonly n: number;
  readonly owned: boolean;
  readonly phase: string;
  readonly physicalIndex: number;
  readonly segmentPhase: string;
  readonly segmentProgress: number;
  readonly segmentTargetIndex: number | null;
  readonly settledIndex: number;
  readonly shells: readonly AuthorityShell[];
  readonly t: number;
  readonly visualId: string;
  readonly visualTopIndex: number;
}

interface AuthorityTrace {
  readonly events: readonly ReleaseEvent[];
  readonly frames: readonly AuthorityFrame[];
}

declare global {
  interface Window {
    snapMotionAuthorityTrace?: AuthorityTrace;
  }
}

/**
 * Records which card is visually authoritative on every rendered frame.
 *
 * Authority is read the way an eye reads it and nothing else: of the shells whose painted body
 * covers the deck's centre — which is where a resting top card's own centre is — the one painted
 * in front. Nothing here consults what the deck believes about itself. The pose is parsed from the
 * transform declaration the browser was handed, so each frame's answer is that frame's own.
 */
async function startAuthorityTrace(page: Page, frames = 700): Promise<void> {
  await page.evaluate((frameBudget) => {
    const root = document.querySelector<HTMLElement>("[data-testid='stacked-deck-viewport']")!;
    const shells = [
      ...root.querySelectorAll<HTMLElement>("[data-snap-motion-stacked-deck-card]"),
    ].map((shell) => ({
      shell,
      motion: shell.querySelector<HTMLElement>(".snap-motion-stacked-deck-card-motion")!,
    }));
    // One card's untransformed size is layout, and layout does not change across a gesture.
    // Reading it once keeps the recorder from flushing style every frame, which would starve the
    // very frames it exists to observe.
    const cardWidth = shells[0]!.motion.offsetWidth;
    const cardHeight = shells[0]!.motion.offsetHeight;
    // A shell's transform centres it on the deck in percentages first; this matches what follows,
    // which is the pose itself.
    const pose =
      /translate3d\((?<x>-?[\d.]+)px,\s*(?<y>-?[\d.]+)px[^)]*\)\s*scale\((?<scale>[\d.]+)\)\s*rotate\((?<rotate>-?[\d.]+)deg\)/u;
    const trace = { events: [] as unknown[], frames: [] as unknown[] };
    window.snapMotionAuthorityTrace = trace as never;
    let sequence = 0;
    for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel"]) {
      window.addEventListener(
        type,
        () => {
          trace.events.push({
            frame: trace.frames.length,
            sequence: (sequence += 1),
            t: performance.now(),
            type,
          });
        },
        { capture: true },
      );
    }
    let remaining = frameBudget;
    const record = () => {
      const measured = shells.map(({ motion, shell }) => {
        const groups = pose.exec(motion.style.transform)?.groups;
        const x = Number(groups?.["x"] ?? Number.NaN);
        const y = Number(groups?.["y"] ?? Number.NaN);
        const scale = Number(groups?.["scale"] ?? Number.NaN);
        const rotate = Number(groups?.["rotate"] ?? Number.NaN);
        const opacity = Number(shell.style.opacity);
        // The deck's centre, expressed in this shell's own unrotated, unscaled frame.
        const radians = (-rotate * Math.PI) / 180;
        const localX = -x * Math.cos(radians) + y * Math.sin(radians);
        const localY = -x * Math.sin(radians) - y * Math.cos(radians);
        return {
          covers:
            shell.dataset.deckVisible === "true" &&
            opacity > 0 &&
            Math.abs(localX) <= (cardWidth * scale) / 2 &&
            Math.abs(localY) <= (cardHeight * scale) / 2,
          id: shell.dataset.itemId ?? "",
          layer: Number(shell.dataset.deckLayer),
          opacity,
          role: shell.dataset.deckRole ?? "",
          rotate,
          scale,
          x,
          y,
        };
      });
      let authority = "";
      let front = Number.NEGATIVE_INFINITY;
      for (const shell of measured) {
        // Equal z-index siblings paint in DOM order, so the later shell owns an exact tie.
        if (shell.covers && shell.layer >= front) {
          front = shell.layer;
          authority = shell.id;
        }
      }
      const targetAttribute = root.getAttribute("data-segment-target-index");
      const interactionOriginIndex = Number(root.dataset.interactionOriginIndex);
      const settledIndex = Number(root.dataset.settledIndex);
      const diagnosticOrigin = interactionOriginIndex >= 0 ? interactionOriginIndex : settledIndex;
      trace.frames.push({
        authoritativeIndex: Number(root.dataset.authoritativeIndex),
        authority,
        interactionOriginIndex,
        n: trace.frames.length,
        owned: root.dataset.interactionOwned === "true",
        phase: root.dataset.phase ?? "",
        physicalIndex: diagnosticOrigin + Number(root.dataset.physicalIndex),
        segmentPhase: root.dataset.segmentPhase ?? "",
        segmentProgress: Number(root.dataset.segmentProgress),
        segmentTargetIndex: targetAttribute === null ? null : Number(targetAttribute),
        settledIndex,
        shells: measured,
        t: performance.now(),
        visualId: root.dataset.visualId ?? "",
        visualTopIndex: Number(root.dataset.visualTopIndex),
      });
      if ((remaining -= 1) > 0) requestAnimationFrame(record);
    };
    requestAnimationFrame(record);
  }, frames);
}

async function readAuthorityTrace(page: Page): Promise<AuthorityTrace> {
  return page.evaluate(() => window.snapMotionAuthorityTrace ?? { events: [], frames: [] });
}

/** Successive distinct values of one per-frame reading, which is the sequence it actually forms. */
function runsOf(trace: AuthorityTrace, read: (frame: AuthorityFrame) => string): readonly string[] {
  const runs: string[] = [];
  for (const frame of trace.frames) {
    const value = read(frame);
    if (value !== runs.at(-1)) runs.push(value);
  }
  return runs;
}

/**
 * The painted authorities inside each gesture, a gesture being everything from one press up to the
 * next one — the frames before the first press included, because a deck nobody has touched yet is
 * a gesture that has not happened.
 *
 * One Direct interaction exchanges exactly one adjacent card however far it travels, so the card a
 * user reads as the deck's current one may change at most once inside each of these. That is the
 * whole claim, and it is frame-rate independent in the direction that matters: a browser that
 * skipped the offending frame reports fewer changes, never more.
 */
function authorityRunsPerGesture(trace: AuthorityTrace): readonly (readonly string[])[] {
  const presses = new Set(
    trace.events.filter((event) => event.type === "pointerdown").map((event) => event.frame),
  );
  const gestures: string[][] = [[]];
  for (const frame of trace.frames) {
    if (presses.has(frame.n)) gestures.push([]);
    const runs = gestures.at(-1)!;
    if (frame.authority !== runs.at(-1)) runs.push(frame.authority);
  }
  return gestures.filter((runs) => runs.length > 0);
}

test("Direct visual authority only ever advances, however fast the hand is", async ({
  page,
}, testInfo) => {
  test.setTimeout(240_000);
  const stage = await prepareDirect(page);
  const pitch = await motionPitch(stage);
  const templates = STACKED_DECK_IDS[0];
  const team = STACKED_DECK_IDS[3];
  const settings = STACKED_DECK_IDS[4];
  const scenarios = [
    // Both fast scenarios are alternating bursts at a hundred and fifty milliseconds, which is
    // inside the travel a committed release still has left. Every press after the first therefore
    // opens while the deck is moving, which is the state only a hand this fast reaches. What each
    // flick resolves to is deliberately not asserted: a browser that resolves this burst some
    // other way is still a browser the claim below is about.
    {
      itinerary: null,
      name: "fast-flick-forward",
      startIndex: 2,
      async run() {
        for (const direction of [1, -1, 1, -1, 1, -1] as const) {
          await fastFlick(page, direction, pitch);
          await page.waitForTimeout(150);
        }
      },
    },
    {
      itinerary: null,
      name: "fast-flick-reverse",
      startIndex: 3,
      async run() {
        for (const direction of [-1, 1, -1, 1, -1, 1] as const) {
          await fastFlick(page, direction, pitch);
          await page.waitForTimeout(150);
        }
      },
    },
    {
      itinerary: [settings, templates, settings, templates],
      name: "fast-alternating-wrap",
      startIndex: 4,
      async run() {
        for (const [direction, targetIndex] of [
          [1, 0],
          [-1, 4],
          [1, 0],
        ] as const) {
          await fastFlick(page, direction, pitch);
          await waitForAuthority(page, targetIndex);
          // Authority crosses before the release tail ends. The following press therefore tests
          // the atomic origin-plus-hand takeover at the semantic wrap, not a settled restart.
          await expect(stage).toHaveAttribute("data-phase", "settling");
        }
      },
    },
    {
      itinerary: [team, settings],
      name: "normal-release",
      startIndex: 3,
      async run() {
        const origin = await beginPointerAt(stage, 0.35, 0.6);
        await movePointerBy(page, origin, -pitch * 0.3, 60, 60);
        await movePointerBy(page, origin, -pitch * 0.72, 150, 130);
        await page.waitForTimeout(140);
        await finishPointerBy(page, origin, -pitch * 0.72, 150, 200, "pointerup");
      },
    },
    {
      itinerary: [team, settings],
      name: "full-pitch-release",
      startIndex: 3,
      async run() {
        const origin = await beginPointerAt(stage, 0.35, 0.6);
        await movePointerBy(page, origin, -pitch * 0.4, 40, 60);
        await movePointerBy(page, origin, -pitch, 90, 140);
        await page.waitForTimeout(140);
        await finishPointerBy(page, origin, -pitch, 90, 200, "pointerup");
      },
    },
    {
      itinerary: [team, settings],
      name: "overdrag-release",
      startIndex: 3,
      async run() {
        const origin = await beginPointerAt(stage, 0.35, 0.6);
        await movePointerBy(page, origin, -pitch * 0.8, -50, 60);
        await movePointerBy(page, origin, -pitch * 1.9, -120, 140);
        await page.waitForTimeout(140);
        await finishPointerBy(page, origin, -pitch * 1.9, -120, 200, "pointerup");
      },
    },
  ] as const;

  const report: Record<string, unknown> = {};
  for (const scenario of scenarios) {
    await destinations(page).nth(scenario.startIndex).click();
    await expectCarouselAt(stage, STACKED_DECK_IDS[scenario.startIndex]!);
    await page.waitForTimeout(320);
    await startAuthorityTrace(page);
    await page.waitForTimeout(120);
    await scenario.run();
    await page.waitForTimeout(900);
    await expect(stage).toHaveAttribute("data-phase", "idle", { timeout: 8_000 });
    const trace = await readAuthorityTrace(page);
    // What the eye read, and what the deck said it was reading. The itinerary is the deck's own
    // account of the exchange, so the claim below is about the picture agreeing with it rather
    // than about either of them separately — which is also why a browser that resolves these
    // gestures differently still tests the same thing.
    const painted = runsOf(trace, (frame) => frame.authority);
    const gestures = authorityRunsPerGesture(trace);

    // Every card the deck rendered is opaque and finitely placed on every frame of every one of
    // these gestures. A handoff hidden behind a fade, or performed by a shell nothing can
    // transform, is not a handoff this test would be able to say anything about.
    for (const frame of trace.frames) {
      const coveringLayers = frame.shells
        .filter((shell) => shell.covers)
        .map((shell) => shell.layer);
      const frontLayer = Math.max(...coveringLayers);
      expect(
        coveringLayers.filter((layer) => layer === frontLayer),
        `${scenario.name} frame ${frame.n} left the front of the deck to DOM paint order`,
      ).toHaveLength(1);
      for (const shell of frame.shells) {
        expect(shell.opacity, `${scenario.name} frame ${frame.n} ${shell.id}`).toBe(1);
        expect(
          Number.isFinite(shell.x) && Number.isFinite(shell.y) && shell.scale > 0,
          `${scenario.name} frame ${frame.n} ${shell.id}`,
        ).toBe(true);
      }
    }
    // The deck exchanged something, and at both ends of it — where it is at rest — the card the
    // eye reads is the card the deck names.
    expect(painted.length, scenario.name).toBeGreaterThan(1);
    expect(painted[0], scenario.name).toBe(trace.frames[0]!.visualId);
    expect(painted.at(-1), scenario.name).toBe(trace.frames.at(-1)!.visualId);
    if (scenario.itinerary !== null) expect(painted, scenario.name).toEqual(scenario.itinerary);
    // The claim itself. Obsolete visual authority never comes back: one rendered frame of it is
    // one change too many inside the gesture that owns it, whether it lasted a frame or a second.
    //
    // Two reads is one exchange. A gesture pressed while a previous release is still in the air
    // can have three, and only in one shape: the card that release is still carrying is in front
    // because it has not landed yet, it gives way to this gesture's own source as it lands, and it
    // comes back only by being this gesture's own destination. Any other third read is authority
    // returning after the exchange that replaced it, which is what this excludes.
    for (const [index, runs] of gestures.entries()) {
      const where = `${scenario.name}: gesture ${index} read ${runs.join(" -> ")}, whole exchange ${painted.join(" -> ")}`;
      expect(runs.length, where).toBeLessThanOrEqual(3);
      if (runs.length === 3) expect(runs[0], where).toBe(runs[2]);
    }

    report[scenario.name] = {
      events: trace.events,
      frameCount: trace.frames.length,
      frameIntervalMs:
        (trace.frames.at(-1)!.t - trace.frames[0]!.t) / Math.max(1, trace.frames.length - 1),
      frames: trace.frames,
      gestures,
      painted,
    };
  }

  const directory = resolvePath(
    import.meta.dirname,
    "..",
    ".artifacts",
    "stacked-deck-direct-review",
    "authority-trace",
  );
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, `${testInfo.project.name}.json`),
    `${JSON.stringify(report, null, 2)}
`,
  );
});
