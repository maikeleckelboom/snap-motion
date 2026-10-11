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

for (const width of [1280, 1440, 390, 320]) {
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

for (const width of [1280, 1440, 390, 320]) {
  for (const exchange of ["shuffle", "direct"] as const) {
    test(`${exchange} at ${width}px: the inspector remains painted above comparison travel`, async ({
      page,
    }) => {
      await page.clock.install();
      await openCompare(page, width, exchange);
      // Scrolling the inspector beneath a stationary pointer can update thumbnail hover paint
      // between the two screenshots (especially Firefox). Keep that input outside the crop.
      await page.mouse.move(0, 0);
      await page.clock.pauseAt(new Date((await page.evaluate(() => Date.now())) + 1000));
      const inspector = studio.inspector(page);
      let overlapsInspector = false;
      // Compare actual paint with and without the Deck in the SAME physical frame. Inert shells
      // are deliberately absent from hit testing, so elementFromPoint cannot prove this contract.
      async function expectProtected() {
        // The clock is paused. A locator's RAF-based stability wait can block here in WebKit;
        // scroll synchronously, then read the actual occupied region without advancing motion.
        await inspector.evaluate((element) =>
          element.scrollIntoView({ block: "center", behavior: "instant" }),
        );
        await inspector
          .locator("img")
          .evaluateAll((images) =>
            Promise.all(images.map((image) => (image as HTMLImageElement).decode())),
          );
        const bounds = (await inspector.boundingBox())!;
        overlapsInspector ||= await studio
          .deck(page)
          .locator(".snap-motion-stacked-deck-card-motion")
          .evaluateAll(
            (cards, inspectorBounds) =>
              cards.some((card) => {
                const body = card.getBoundingClientRect();
                return (
                  body.left < inspectorBounds.x + inspectorBounds.width &&
                  body.right > inspectorBounds.x &&
                  body.top < inspectorBounds.y + inspectorBounds.height &&
                  body.bottom > inspectorBounds.y
                );
              }),
            bounds,
          );
        // Exclude fractional edge pixels shared with the divider, not occupied inspector content.
        const clip = {
          x: Math.ceil(bounds.x) + 1,
          y: Math.ceil(bounds.y) + 1,
          width: Math.floor(bounds.width) - 2,
          height: Math.floor(bounds.height) - 2,
        };
        const painted = await page.screenshot({
          clip,
          animations: "allow",
          path: test.info().outputPath("painted.png"),
        });
        const withoutDeck = await page.screenshot({
          clip,
          animations: "allow",
          path: test.info().outputPath("without.png"),
          // Keep the composited surfaces alive: visibility:hidden changes sibling text antialiasing.
          style:
            ".studio-deck .snap-motion-stacked-deck-card-motion { opacity: 0.000001 !important; }",
        });
        if (!painted.equals(withoutDeck)) {
          await test
            .info()
            .attach("inspector-with-deck", { body: painted, contentType: "image/png" });
          await test
            .info()
            .attach("inspector-without-deck", { body: withoutDeck, contentType: "image/png" });
        }
        expect(painted.equals(withoutDeck), "Deck body or shadow painted over Active Study").toBe(
          true,
        );
        expect(
          await inspector.locator("button").evaluateAll((buttons) =>
            buttons.every((button) => {
              const rect = button.getBoundingClientRect();
              return button.contains(
                document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2),
              );
            }),
          ),
          "Active Study retains pointer ownership",
        ).toBe(true);
      }
      for (const control of [
        "studio-deck-next",
        "studio-remove-arc",
        "studio-toggle-compare",
        "studio-deck-previous",
      ]) {
        await mutateTraced(page, control, control);
        // Outbound, crossover clearance, and return. The trace suite samples every intervening RAF.
        for (const delta of [64, 144, 144]) {
          await page.clock.runFor(delta);
          await expectProtected();
        }
        await page.clock.runFor(1200);
      }
      await expect(studio.deck(page)).toHaveAttribute("data-reconciling", "false");
      if (width >= 992) expect(overlapsInspector, "exercise real cross-divider travel").toBe(true);
      // The opaque foreground remains an ordinary region, with its own pointer and keyboard owner.
      const details = page.getByTestId("studio-details");
      await details.focus();
      await expect(details).toBeFocused();
    });
  }
}

test("an interrupted Shuffle mutation survives another mutation, a mode change and re-addition", async ({
  page,
}) => {
  await page.clock.install();
  await openCompare(page, 1280, "shuffle");
  await page.clock.pauseAt(new Date((await page.evaluate(() => Date.now())) + 1000));
  await mutateTraced(page, "studio-deck-next", "exchange");
  await page.clock.runFor(96);
  await mutateTraced(page, "studio-remove-arc", "remove-moving-current");
  await page.clock.runFor(64);
  await mutateTraced(page, "studio-remove-fold", "second-mutation");
  await page.clock.runFor(48);
  // There is one member, so the mode control is absent; the shared standalone Deck control still
  // changes the same exchange owner. Use the real shared tuning control, not component internals.
  await page
    .locator("#stacked-deck")
    .getByRole("button", { name: "Direct", exact: true })
    .evaluate((el) => (el as HTMLElement).click());
  await mutateTraced(page, "studio-compare-add", "readd-departing-arc");
  await page.clock.runFor(64);
  await mutateTraced(page, "studio-remove-relay", "remove-with-departures");
  await page.clock.runFor(800);
  await expect(studio.deck(page)).toHaveAttribute("data-deck-state", "single");
  await page.getByTestId("studio-tile-relay").evaluate((el) => (el as HTMLElement).click());
  await mutateTraced(page, "studio-toggle-compare", "restore-second");
  await page.clock.runFor(800);
  await expect(page.getByTestId("studio-deck-next")).toBeEnabled();
  await mutateTraced(page, "studio-deck-next", "navigate-when-ready");
  await page.clock.runFor(1200);
  const frames = await stopDeckTrace(page);
  for (const name of [
    "remove-moving-current",
    "second-mutation",
    "readd-departing-arc",
    "remove-with-departures",
    "restore-second",
  ]) {
    expectContinuous(analyseReconciliation(frames, name), name);
  }
  await expect(studio.deck(page).locator(".snap-motion-stacked-deck-exit")).toHaveCount(0);
});

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
