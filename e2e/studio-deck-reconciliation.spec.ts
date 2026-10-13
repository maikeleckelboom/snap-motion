import { expect, test, type Page } from "@playwright/test";

import {
  analyseReconciliation,
  mutateTraced,
  startDeckTrace,
  stopDeckTrace,
  waitForDeckRest,
  type ReconciliationAnalysis,
} from "./deckReconciliationTrace";
import { openStudio, roles, shortlist, shortlistCandidate, studio } from "./studioHelpers";

/**
 * The shortlist changes at once; the Deck's cards reconcile continuously.
 *
 * The Deck holds every shortlisted candidate except the reference A, and the card in front is B.
 * Adding, removing, swapping and re-pinning change its membership while it may still be moving.
 * These run with full motion on the real Studio and read every rendered frame back from the DOM.
 * The invariants are frame-rate independent: a change starts exactly from the frame it interrupted,
 * depth never swaps where two bodies both still are, nothing appears or vanishes while any of it can
 * be seen, a departing card is never an item, and no compositor hint changes on the frame the Deck
 * comes to rest. So they hold on every engine, however slowly it renders.
 *
 * The Studio's Deck is always a Shuffle deck. Direct is a candidate's own behaviour, previewed on a
 * stage whose membership never changes; the package suites certify Direct reconciliation.
 */

/** A shortlist of four: Tight is A, and Loose, Balanced and Shuffle ride the Deck. */
async function openShortlistDeck(page: Page, width: number) {
  await openStudio(page, { reducedMotion: "no-preference", width, height: 900 });
  await shortlistCandidate(page, "carousel-balanced");
  await shortlistCandidate(page, "deck-shuffle");
  const narrow =
    (await page.getByTestId("studio-workspace").getAttribute("data-layout")) !== "wide";
  if (narrow) await page.getByTestId("studio-view-compare").click();
  await expect(studio.deck(page)).toHaveAttribute("data-deck-state", "deck");
  await studio.deck(page).evaluate((element) => element.scrollIntoView({ block: "center" }));
  await waitForDeckRest(page);
  await startDeckTrace(page);
  return !narrow;
}

function expectContinuous(analysis: ReconciliationAnalysis, step: string) {
  expect(analysis.firstFrameJump, `${step}: first frame`).toBeLessThanOrEqual(0.01);
  expect(analysis.paintSwaps, `${step}: paint order`).toEqual([]);
  expect(analysis.visibleAppearances, `${step}: appearance`).toEqual([]);
  expect(analysis.stillHintChanges, `${step}: compositor hint at rest`).toEqual([]);
  expect(analysis.exposedDepartures, `${step}: departures`).toEqual([]);
}

/** The members of the Deck, by id, in shortlist order. */
async function deckMembers(page: Page) {
  const members = await shortlist(page);
  return members.filter(({ role }) => role !== "a").map(({ id }) => id);
}

for (const width of [1280, 390]) {
  test(`at ${width}px: removing, adding and swapping candidates reorganizes one coherent stack`, async ({
    page,
  }) => {
    const wide = await openShortlistDeck(page, width);
    const steps: string[] = [];
    const exchanges = new Set(["next", "exchange-in-flight"]);
    async function step(testId: string, name: string, settle = true) {
      await mutateTraced(page, testId, name);
      steps.push(name);
      if (settle) await waitForDeckRest(page);
    }

    // Balanced on top, then removed with its own control.
    await step("studio-deck-next", "next");
    expect((await roles(page)).b).toBe("carousel-balanced");
    await mutateTraced(page, "studio-remove-carousel-balanced", "remove-current");
    steps.push("remove-current");
    // Membership, B and focus change at once, while the cards are still moving.
    expect(await deckMembers(page)).toEqual(["carousel-loose", "deck-shuffle"]);
    await expect(studio.deck(page).locator("[data-snap-motion-stacked-deck-card]")).toHaveCount(2);
    expect((await roles(page)).b).toBe("deck-shuffle");
    await waitForDeckRest(page);

    // Swapping the roles changes the Deck's members: B leaves it and the old reference joins.
    await step("studio-swap", "swap-roles");
    expect(await deckMembers(page)).toEqual(["carousel-tight", "carousel-loose"]);
    await step("studio-swap", "swap-back");

    // Remove the card behind the current one, then down to one card.
    const { b } = await roles(page);
    const behind = (await deckMembers(page)).find((id) => id !== b)!;
    await step(`studio-remove-${behind}`, "remove-behind");
    await expect(studio.deck(page)).toHaveAttribute("data-deck-state", "single");
    if (wide) {
      // Back to two, and then a change while an exchange is settling, and two in quick succession.
      await step("studio-shortlist-carousel-balanced", "add-to-two");
      await expect(studio.deck(page)).toHaveAttribute("data-deck-state", "deck");
      await step("studio-deck-next", "exchange-in-flight", false);
      await page.waitForTimeout(90);
      await step(`studio-remove-${(await roles(page)).b}`, "remove-during-exchange");
      await step("studio-shortlist-carousel-balanced", "rapid-add", false);
      await page.waitForTimeout(60);
      await step("studio-shortlist-carousel-balanced", "rapid-remove", false);
      await page.waitForTimeout(60);
      await step("studio-shortlist-carousel-balanced", "rapid-add-again");
    }

    const frames = await stopDeckTrace(page);
    for (const name of steps) {
      const analysis = analyseReconciliation(frames, name);
      if (exchanges.has(name)) {
        // An ordinary exchange is certified by the Stacked Deck suites; here it only must not
        // release a compositor hint as it comes to rest.
        expect(analysis.stillHintChanges, `${name}: compositor hint at rest`).toEqual([]);
      } else {
        expectContinuous(analysis, name);
      }
    }
    // Exact canonical arrival: the final pile is the one a fresh Deck draws for it.
    await expect(studio.deck(page).locator(".snap-motion-stacked-deck-exit")).toHaveCount(0);
    await expect(studio.deck(page)).toHaveAttribute("data-reconciling", "false");
  });
}

test("an interrupted exchange survives another change and a re-addition", async ({ page }) => {
  await page.clock.install();
  await openShortlistDeck(page, 1280);
  await page.clock.pauseAt(new Date((await page.evaluate(() => Date.now())) + 1000));
  await mutateTraced(page, "studio-deck-next", "exchange");
  await page.clock.runFor(96);
  await mutateTraced(page, "studio-remove-carousel-balanced", "remove-moving-current");
  await page.clock.runFor(64);
  await mutateTraced(page, "studio-remove-carousel-loose", "second-mutation");
  await page.clock.runFor(48);
  await mutateTraced(page, "studio-shortlist-carousel-balanced", "readd-departing");
  await page.clock.runFor(64);
  await mutateTraced(page, "studio-remove-deck-shuffle", "remove-with-departures");
  await page.clock.runFor(800);
  await expect(studio.deck(page)).toHaveAttribute("data-deck-state", "single");
  await mutateTraced(page, "studio-shortlist-deck-shuffle", "restore-second");
  await page.clock.runFor(800);
  await expect(page.getByTestId("studio-deck-next")).toBeEnabled();
  await mutateTraced(page, "studio-deck-next", "navigate-when-ready");
  await page.clock.runFor(1200);
  const frames = await stopDeckTrace(page);
  for (const name of [
    "remove-moving-current",
    "second-mutation",
    "readd-departing",
    "remove-with-departures",
    "restore-second",
  ]) {
    expectContinuous(analyseReconciliation(frames, name), name);
  }
  await expect(studio.deck(page).locator(".snap-motion-stacked-deck-exit")).toHaveCount(0);
});

test("a change while a pointer holds the Deck releases the hand and continues from its card", async ({
  page,
}) => {
  await openShortlistDeck(page, 1280);
  const top = studio
    .deck(page)
    .locator("[data-snap-motion-stacked-deck-card][data-deck-role='top']");
  const box = (await top.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2);
  await page.mouse.down();
  for (let index = 1; index <= 8; index += 1) {
    await page.mouse.move(box.x + box.width * (0.6 - index * 0.03), box.y + box.height / 2);
  }
  await expect(studio.deck(page)).toHaveAttribute("data-owned", "true");
  await mutateTraced(page, "studio-remove-deck-shuffle", "remove-while-held");
  await expect(studio.deck(page)).toHaveAttribute("data-owned", "false");
  await page.mouse.up();
  await waitForDeckRest(page);
  expectContinuous(analyseReconciliation(await stopDeckTrace(page), "remove-while-held"), "held");
});

test("in Chromium no card moves faster than the Deck's own exchange moves it", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "per-frame speed needs a renderer that keeps frame pace");
  await openShortlistDeck(page, 1280);
  for (const [testId, name] of [
    ["studio-deck-next", "exchange"],
    ["studio-remove-carousel-balanced", "remove-current"],
    ["studio-shortlist-carousel-balanced", "add-again"],
    ["studio-remove-carousel-loose", "remove-behind"],
  ] as const) {
    await mutateTraced(page, testId, name);
    await waitForDeckRest(page);
  }
  const frames = await stopDeckTrace(page);
  const exchange = analyseReconciliation(frames, "exchange");
  for (const name of ["remove-current", "add-again", "remove-behind"]) {
    const analysis = analyseReconciliation(frames, name);
    expect(analysis.largestJump, name).toBeLessThanOrEqual(exchange.largestJump);
    expect(analysis.largestShadowJump, name).toBeLessThanOrEqual(exchange.largestShadowJump);
  }
});

test("under reduced motion the new collection is adopted at once", async ({ page }) => {
  await openStudio(page);
  await shortlistCandidate(page, "carousel-balanced");
  await page.getByTestId("studio-deck-next").click();
  await expect(studio.deck(page)).toHaveAttribute("data-active-id", "carousel-balanced");
  await page.getByTestId("studio-remove-carousel-balanced").click();
  await expect(studio.deck(page)).toHaveAttribute("data-reconciling", "false");
  await expect(studio.deck(page).locator(".snap-motion-stacked-deck-exit")).toHaveCount(0);
  await expect(studio.deck(page)).toHaveAttribute("data-active-id", "carousel-loose");
});
