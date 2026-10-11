import { expect, test, type Page } from "@playwright/test";

import {
  analyseReconciliation,
  mutateTraced,
  startDeckTrace,
  stopDeckTrace,
  waitForDeckRest,
  type ReconciliationAnalysis,
} from "./deckReconciliationTrace";
import { openStudio, studio } from "./studioHelpers";

/**
 * Comparison membership changes at once; the cards reconcile continuously.
 *
 * These run with full motion on the real Studio and read every rendered frame back from the DOM.
 * The invariants are frame-rate independent — a change starts exactly from the frame it
 * interrupted, depth never swaps where two bodies both still are, nothing appears or vanishes while
 * any of it can be seen, a departing card is never an item, and no compositor hint changes on the
 * frame the deck comes to rest — so they hold on every engine, however slowly it renders.
 */

async function openCompare(page: Page, width: number, exchange: "shuffle" | "direct") {
  await openStudio(page, { reducedMotion: "no-preference", width, height: 900 });
  if ((await page.getByTestId("studio-workspace").getAttribute("data-layout")) !== "wide") {
    await page.getByTestId("studio-view-compare").click();
  }
  const deck = studio.deck(page);
  await deck.evaluate((element) => element.scrollIntoView({ block: "center" }));
  if (exchange === "direct") await page.getByTestId("studio-exchange-direct").click();
  await waitForDeckRest(page);
  await startDeckTrace(page);
}

function expectContinuous(analysis: ReconciliationAnalysis, step: string) {
  expect(analysis.firstFrameJump, `${step}: first frame`).toBeLessThanOrEqual(0.01);
  expect(analysis.paintSwaps, `${step}: paint order`).toEqual([]);
  expect(analysis.visibleAppearances, `${step}: appearance`).toEqual([]);
  expect(analysis.stillHintChanges, `${step}: compositor hint at rest`).toEqual([]);
  expect(analysis.exposedDepartures, `${step}: departures`).toEqual([]);
}

async function trayIds(page: Page) {
  return page
    .locator(".tray-item")
    .evaluateAll((items) => items.map((item) => item.getAttribute("data-testid")!.slice(12)));
}

for (const width of [1280, 390]) {
  for (const exchange of ["shuffle", "direct"] as const) {
    test(`${exchange} at ${width}px: removing and adding comparison cards reorganizes one coherent stack`, async ({
      page,
    }) => {
      await openCompare(page, width, exchange);
      const steps: string[] = [];
      const exchanges = new Set(["next-to-arc", "exchange-in-flight"]);
      async function step(testId: string, name: string, settle = true) {
        await mutateTraced(page, testId, name);
        steps.push(name);
        if (settle) await waitForDeckRest(page);
      }

      // Arc on top, then removed with its X.
      await step("studio-deck-next", "next-to-arc");
      await expect(studio.deck(page)).toHaveAttribute("data-active-id", "arc");
      await mutateTraced(page, "studio-remove-arc", "remove-current");
      steps.push("remove-current");
      // Membership, cursor and focus change at once, while the cards are still moving.
      expect(await trayIds(page)).toEqual(["fold", "relay"]);
      await expect(studio.deck(page).locator("[data-snap-motion-stacked-deck-card]")).toHaveCount(
        2,
      );
      await expect(studio.deck(page)).toHaveAttribute("data-active-id", "relay");
      await expect(studio.activeName(page)).toHaveText("Arc");
      await expect(studio.tray(page, "relay").locator(".tray-name")).toBeFocused();
      await waitForDeckRest(page);

      // Arc again, then a card behind the current one, then down to one card and back to two.
      await step("studio-toggle-compare", "add-current");
      await expect(studio.deck(page)).toHaveAttribute("data-active-id", "arc");
      await step("studio-remove-fold", "remove-behind");
      await step("studio-remove-arc", "remove-to-one");
      await expect(studio.deck(page)).toHaveAttribute("data-deck-state", "single");
      await expect(page.getByTestId("studio-compare-single")).toBeVisible();
      await step("studio-compare-add", "add-to-two");
      await expect(studio.deck(page)).toHaveAttribute("data-deck-state", "deck");

      // A change while an exchange is still settling, and two changes in quick succession.
      await step("studio-deck-next", "exchange-in-flight", false);
      await page.waitForTimeout(90);
      await step("studio-remove-relay", "remove-during-exchange");
      await step("studio-compare-add", "rapid-add", false);
      await page.waitForTimeout(60);
      await step("studio-remove-relay", "rapid-remove", false);
      await page.waitForTimeout(60);
      await step("studio-compare-add", "rapid-add-again");

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
      // Exact canonical arrival: the final pile is the one a fresh deck draws for it.
      await expect(studio.deck(page).locator(".snap-motion-stacked-deck-exit")).toHaveCount(0);
      await expect(studio.deck(page)).toHaveAttribute("data-reconciling", "false");
    });
  }
}

test("a change while a pointer holds the deck releases the hand and continues from its card", async ({
  page,
}) => {
  await openCompare(page, 1280, "direct");
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
  await mutateTraced(page, "studio-remove-relay", "remove-while-held");
  await expect(studio.deck(page)).toHaveAttribute("data-owned", "false");
  await page.mouse.up();
  await waitForDeckRest(page);
  expectContinuous(analyseReconciliation(await stopDeckTrace(page), "remove-while-held"), "held");
});

test("in Chromium no card moves faster than the deck's own exchange moves it", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "per-frame speed needs a renderer that keeps frame pace");
  await openCompare(page, 1280, "shuffle");
  for (const [testId, name] of [
    ["studio-deck-next", "exchange"],
    ["studio-remove-arc", "remove-current"],
    ["studio-toggle-compare", "add-current"],
    ["studio-remove-fold", "remove-behind"],
  ] as const) {
    await mutateTraced(page, testId, name);
    await waitForDeckRest(page);
  }
  const frames = await stopDeckTrace(page);
  const exchange = analyseReconciliation(frames, "exchange");
  for (const name of ["remove-current", "add-current", "remove-behind"]) {
    const analysis = analyseReconciliation(frames, name);
    expect(analysis.largestJump, name).toBeLessThanOrEqual(exchange.largestJump);
    expect(analysis.largestShadowJump, name).toBeLessThanOrEqual(exchange.largestShadowJump);
  }
});

test("under reduced motion the new collection is adopted at once", async ({ page }) => {
  await openStudio(page);
  await page.getByTestId("studio-deck-next").click();
  await expect(studio.deck(page)).toHaveAttribute("data-active-id", "arc");
  await page.getByTestId("studio-remove-arc").click();
  await expect(studio.deck(page)).toHaveAttribute("data-reconciling", "false");
  await expect(studio.deck(page).locator(".snap-motion-stacked-deck-exit")).toHaveCount(0);
  await expect(studio.deck(page)).toHaveAttribute("data-active-id", "relay");
});
