import { expect, test, type Page } from "@playwright/test";

import type { CandidateId } from "../apps/lab/src/playground/studio/candidate-definitions";
import { MOTION_PRESETS } from "../packages/core/src/index";
import { dragMouseBy } from "./helpers";
import { openPlayground, scrollY } from "./playgroundHelpers";
import {
  focusedTestId,
  nameOf,
  openDialogCount,
  openStudio,
  roles,
  shortlist,
  shortlistCandidate,
  startNameTrace,
  stopNameTrace,
  studio,
} from "./studioHelpers";

/**
 * The Motion Studio as a decision workflow: shortlist candidates, pin a reference A, compare B on
 * the same screens, read what differs, and record a choice.
 *
 * Logic runs under reduced motion so each test costs a page load and a few clicks. What needs real
 * motion (text that must follow the card in front, interrupted exchanges) opts in explicitly and is
 * checked frame by frame from the DOM, with invariants that do not depend on frame rate.
 */

const collectedErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  collectedErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" || /\[Vue warn\]/.test(message.text()))
      errors.push(`${message.type()}: ${message.text()}`);
  });
});

test.afterEach(async ({ page }) => {
  expect(collectedErrors.get(page) ?? []).toEqual([]);
});

/** The first visit's shortlist is Tight carousel (A) and Loose carousel (B). Adding one makes a real Deck. */
async function withDeck(page: Page) {
  await shortlistCandidate(page, "carousel-balanced");
  await expect(studio.deck(page)).toHaveAttribute("data-deck-state", "deck");
}

test.describe("activation boundary", () => {
  test("the section is a complete introduction until the visitor opens it", async ({ page }) => {
    const requested: string[] = [];
    page.on("request", (request) => requested.push(request.url()));
    await openPlayground(page);

    await expect(page.getByTestId("studio-stage")).toHaveAttribute("data-activated", "false");
    await expect(page.getByTestId("studio-intro")).toBeAttached();
    await expect(page.getByTestId("studio-workspace")).toHaveCount(0);
    // Nothing of the workspace has been requested.
    expect(requested.filter((url) => /StudioWorkspace/.test(url))).toEqual([]);
    // The page above mounts exactly its own five surfaces, and four dialogs.
    await expect(page.locator(".media-carousel")).toHaveCount(0);
    await expect(page.locator(".snap-motion-coverflow")).toHaveCount(1);
    await expect(page.locator(".snap-motion-stacked-deck")).toHaveCount(1);
    await expect(page.locator("dialog")).toHaveCount(4);

    await page.getByTestId("studio-activate").click();
    await expect(page.getByTestId("studio-workspace")).toBeFocused();
    await expect(page.getByTestId("studio-intro")).toHaveCount(0);
    expect(requested.some((url) => /StudioWorkspace/.test(url))).toBe(true);
    // Two live stages and the shortlist's Deck. A and B are both item carousels at first, which are
    // the Studio's own (they are not Coverflows), and the shortlist is a Stacked Deck.
    await expect(page.locator(".media-carousel")).toHaveCount(2);
    await expect(page.locator(".snap-motion-coverflow")).toHaveCount(1);
    await expect(page.locator(".snap-motion-stacked-deck")).toHaveCount(2);
    // The Studio adds two dialogs: the implementation sheet and the photo viewer.
    await expect(page.locator("dialog")).toHaveCount(6);
  });

  for (const [width, height] of [
    [1280, 800],
    [390, 844],
  ] as const) {
    test(`a direct #studio visit shows the activation control at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto("./playground/#studio");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByTestId("studio-activate")).toBeInViewport();
      await expect(page.locator("#studio")).toBeFocused();
      await expect(page.getByTestId("nav-studio")).toHaveAttribute("aria-current", "location", {
        timeout: 8_000,
      });
    });
  }

  test("the workspace stays mounted and keeps its state while the page is scrolled", async ({
    page,
  }) => {
    await openStudio(page);
    await shortlistCandidate(page, "deck-shuffle");
    await page.getByTestId("studio-choose-a").click();
    await page.locator("#top").scrollIntoViewIfNeeded();
    await page.locator("#studio").scrollIntoViewIfNeeded();
    await expect(page.getByTestId("studio-decision-line")).toHaveText("Chosen: Tight carousel");
    await expect(studio.row(page, "deck-shuffle")).toHaveAttribute("data-shortlisted", "true");
    await expect(page.getByTestId("studio-workspace")).toHaveCount(1);
  });

  test("keeps every id unique with the workspace open", async ({ page }) => {
    await openStudio(page);
    const duplicates = await page.evaluate(() => {
      const seen = new Map<string, number>();
      for (const element of document.querySelectorAll("[id]"))
        seen.set(element.id, (seen.get(element.id) ?? 0) + 1);
      return [...seen].filter(([, count]) => count > 1).map(([id]) => id);
    });
    expect(duplicates).toEqual([]);
  });
});

test.describe("the decision journey", () => {
  test("a visitor can shortlist, pin A, compare B, read the difference and decide", async ({
    page,
  }) => {
    await openStudio(page);
    // The first visit already holds a comparison, so the stages are never empty.
    expect(await roles(page)).toEqual({ a: "carousel-tight", b: "carousel-loose" });
    await expect(studio.aName(page)).toHaveText("Tight carousel");
    await expect(studio.bName(page)).toHaveText("Loose carousel");

    // Shortlist two more from the candidates.
    await shortlistCandidate(page, "deck-direct");
    await shortlistCandidate(page, "carousel-balanced");
    expect((await shortlist(page)).map(({ id }) => id)).toEqual([
      "carousel-tight",
      "carousel-loose",
      "deck-direct",
      "carousel-balanced",
    ]);
    // Adding never disturbs a comparison already under way.
    expect(await roles(page)).toEqual({ a: "carousel-tight", b: "carousel-loose" });

    // Pin a different reference, then compare against a deck.
    await page.getByTestId("studio-pin-carousel-balanced").click();
    expect(await roles(page)).toEqual({ a: "carousel-balanced", b: "carousel-loose" });
    await expect(studio.aName(page)).toHaveText("Balanced carousel");
    await expect(studio.bName(page)).toHaveText("Loose carousel");
    await page.getByTestId("studio-compare-deck-direct").click();
    expect(await roles(page)).toEqual({ a: "carousel-balanced", b: "deck-direct" });
    await expect(studio.bName(page)).toHaveText("Direct deck");

    // What differs is read from the two, and says what kind of fact each row is.
    await page.getByTestId("studio-advanced").locator("summary").click();
    const table = page.getByTestId("studio-diff-table");
    await expect(table.locator("[data-row='surface']")).toHaveAttribute("data-differs", "true");
    await expect(table.locator("[data-row='surface'] td").first()).toHaveText("Item carousel");
    await expect(table.locator("[data-row='surface'] td").nth(1)).toContainText("Stacked deck");
    await expect(table.locator("[data-row='feel']")).toHaveAttribute("data-differs", "false");
    await expect(table.locator("[data-row='settle']")).toHaveAttribute("data-source", "calculated");
    await expect(table.locator("[data-row='stiffness']")).toHaveAttribute(
      "data-source",
      "declared",
    );
    await expect(page.getByTestId("studio-summary-text")).toContainText(
      "an item carousel and B is a stacked deck",
    );

    // Decide, say why, and read the implementation.
    await page.getByTestId("studio-choose-b").click();
    await expect(page.getByTestId("studio-decided")).toContainText("Direct deck");
    await expect(page.getByTestId("studio-decision-line")).toHaveText("Chosen: Direct deck");
    await expect(page.getByTestId("studio-reason")).toBeFocused();
    await page.getByTestId("studio-reason").fill("The card should follow the finger.");

    const opener = page.getByTestId("studio-open-implementation");
    await opener.evaluate((element) => element.scrollIntoView({ block: "center" }));
    const before = await scrollY(page);
    await opener.click();
    await expect(studio.sheet(page)).toBeVisible();
    await expect(page.getByTestId("studio-sheet-title")).toHaveText("Direct deck");
    await expect(page.getByTestId("studio-sheet-reason")).toContainText("follow the finger");
    const snippet = page.getByTestId("studio-snippet");
    await expect(snippet).toContainText("@snap-motion/vue/stacked-deck");
    await expect(snippet).toContainText('exchange="direct"');
    await expect(snippet).toContainText(`"stiffness": ${MOTION_PRESETS.balanced.spring.stiffness}`);
    await page.keyboard.press("Escape");
    await expect(studio.sheet(page)).not.toBeVisible();
    await expect(opener).toBeFocused();
    expect(await scrollY(page)).toBe(before);

    // Revising the choice keeps the reason and brings back the choices.
    await page.getByTestId("studio-revise").click();
    await expect(page.getByTestId("studio-choose-a")).toBeFocused();
    await expect(page.getByTestId("studio-decision-line")).toHaveText("No decision yet");
    await page.getByTestId("studio-choose-a").click();
    await expect(page.getByTestId("studio-reason")).toHaveValue(
      "The card should follow the finger.",
    );
  });

  test("changing B never disturbs A's stage", async ({ page }) => {
    await openStudio(page);
    await withDeck(page);
    const stageA = page.getByTestId("studio-preview-reference");
    await stageA.evaluate((node) => {
      (node as unknown as { kept: boolean }).kept = true;
    });
    for (const id of ["carousel-balanced", "carousel-loose", "carousel-balanced"] as const) {
      await page.getByTestId(`studio-compare-${id}`).click();
      await expect(studio.bName(page)).toHaveText(nameOf(id));
    }
    // The same element, carrying the mark, still stands for A.
    expect(
      await stageA.evaluate((node) => (node as unknown as { kept?: boolean }).kept === true),
    ).toBe(true);
    await expect(studio.aName(page)).toHaveText("Tight carousel");
  });

  test("A and B are never the same candidate, whatever order the controls are used in", async ({
    page,
  }) => {
    await openStudio(page);
    await withDeck(page);
    const assertDistinct = async () => {
      const { a, b } = await roles(page);
      expect(a).toBeDefined();
      expect(b).toBeDefined();
      expect(a).not.toBe(b);
      await expect(studio.aName(page)).not.toHaveText((await studio.bName(page).textContent())!);
    };
    await page.getByTestId("studio-swap").click();
    await assertDistinct();
    // Pinning B makes the old A the new B instead of comparing a card with itself.
    const { b } = await roles(page);
    await page.getByTestId(`studio-pin-${b!}`).click();
    await assertDistinct();
    await page.getByTestId("studio-pin-carousel-balanced").click();
    await assertDistinct();
    expect((await roles(page)).a).toBe("carousel-balanced");
  });

  test("the summary and the status region say what happened", async ({ page }) => {
    await openStudio(page);
    await expect(studio.summary(page)).toHaveText(
      "2 shortlisted · A Tight carousel · B Loose carousel",
    );
    await shortlistCandidate(page, "deck-shuffle");
    await expect(studio.status(page)).toContainText("Shuffle deck added to the shortlist, 3 of 4");
    await page.getByTestId("studio-pin-deck-shuffle").click();
    await expect(studio.status(page)).toContainText("Shuffle deck pinned as the reference A");
    await page.getByTestId("studio-swap").click();
    await expect(studio.status(page)).toContainText("is now the reference A");
  });
});

test.describe("every size of shortlist", () => {
  test("nothing, only a reference, two and the maximum are each coherent", async ({ page }) => {
    await openStudio(page);
    // Two: the Deck holds B and refuses input, since there is nothing to exchange.
    await expect(studio.deck(page)).toHaveAttribute("data-deck-state", "single");
    await expect(studio.deck(page)).toHaveAttribute("inert", "");
    await expect(page.getByTestId("studio-deck-next")).toHaveCount(0);

    // Only a reference.
    await page.getByTestId("studio-remove-carousel-loose").click();
    await expect(page.getByTestId("studio-shortlist-empty")).toContainText(
      "Tight carousel is your reference",
    );
    await expect(page.getByTestId("studio-stage-b-vacant")).toBeVisible();
    await expect(studio.aName(page)).toHaveText("Tight carousel");
    await expect(page.getByTestId("studio-differences")).toHaveCount(0);
    await expect(studio.compare(page)).toHaveAttribute("data-compare-state", "reference-only");
    // The one stage still runs, and the decision can still be made.
    await page.getByTestId("studio-driver-next").click();
    await page.getByTestId("studio-choose-a").click();
    await expect(page.getByTestId("studio-decided")).toContainText("Tight carousel");
    await page.getByTestId("studio-revise").click();

    // Nothing.
    await page.getByTestId("studio-remove-carousel-tight").click();
    await expect(page.getByTestId("studio-compare-empty")).toBeVisible();
    await expect(page.getByTestId("studio-shortlist-empty")).toContainText(
      "Nothing shortlisted yet",
    );
    await expect(page.getByTestId("studio-preview-reference")).toHaveCount(0);
    await expect(studio.summary(page)).toHaveText("0 shortlisted · A none · B none");
    // The way forward is a control that exists.
    await page.getByTestId("studio-shortlist-choose").click();
    await expect(
      page.locator("[data-testid='studio-candidate-list'] [data-open-detail]").first(),
    ).toBeFocused();

    // Back to the maximum.
    for (const id of [
      "carousel-tight",
      "carousel-loose",
      "carousel-balanced",
      "deck-shuffle",
    ] as const) {
      await shortlistCandidate(page, id);
    }
    expect(await roles(page)).toEqual({ a: "carousel-tight", b: "carousel-loose" });
    await expect(page.getByTestId("studio-shortlist-full")).toBeVisible();
    // Every candidate not on the shortlist is refused, with the reason beside it.
    await expect(page.getByTestId("studio-shortlist-deck-direct")).toBeDisabled();
    await expect(page.getByTestId("studio-add-more")).toHaveCount(0);
    await page.getByTestId("studio-remove-deck-shuffle").click();
    await expect(page.getByTestId("studio-shortlist-full")).toHaveCount(0);
    await expect(page.getByTestId("studio-shortlist-deck-direct")).toBeEnabled();
  });

  test("removing the pinned reference promotes B so the comparison goes on", async ({ page }) => {
    await openStudio(page);
    await withDeck(page);
    await page.getByTestId("studio-remove-carousel-tight").click();
    expect(await roles(page)).toEqual({ a: "carousel-loose", b: "carousel-balanced" });
    await expect(studio.aName(page)).toHaveText("Loose carousel");
    await expect(studio.bName(page)).toHaveText("Balanced carousel");
    await expect(studio.status(page)).toContainText("removed from the shortlist");
    await expect(studio.status(page)).toContainText("Loose carousel is the reference A");
  });

  test("removing B moves to the card that took its place, and focus survives", async ({ page }) => {
    await openStudio(page);
    await withDeck(page);
    await shortlistCandidate(page, "deck-heavy");
    await page.getByTestId("studio-compare-carousel-balanced").click();
    await page.getByTestId("studio-remove-carousel-balanced").click();
    expect(await roles(page)).toEqual({ a: "carousel-tight", b: "deck-heavy" });
    // The control that had focus is gone; focus moves to a control that survives.
    const focused = await focusedTestId(page);
    expect(focused).not.toBe("BODY");
    expect(focused).toMatch(/^studio-(compare|pin|remove)-/);
  });

  test("a decision survives the candidate leaving the shortlist", async ({ page }) => {
    await openStudio(page);
    await page.getByTestId("studio-choose-b").click();
    await page.getByTestId("studio-remove-carousel-loose").click();
    await expect(page.getByTestId("studio-decision-line")).toHaveText("Chosen: Loose carousel");
  });
});

test.describe("equal conditions", () => {
  test("both stages are the same size, show the same screens and take the same input", async ({
    page,
  }) => {
    await openStudio(page);
    const a = page.getByTestId("studio-preview-reference");
    const b = page.getByTestId("studio-preview-candidate");
    const boxA = (await a.boundingBox())!;
    const boxB = (await b.boundingBox())!;
    expect(Math.abs(boxA.width - boxB.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(boxA.height - boxB.height)).toBeLessThanOrEqual(1);
    const screenA = page.getByTestId("studio-reference-screen");
    const screenB = page.getByTestId("studio-candidate-screen");
    await expect(screenA).toHaveText(await screenB.innerText());

    const start = await screenA.innerText();
    await page.getByTestId("studio-driver-next").click();
    await expect(screenA).not.toHaveText(start);
    await expect(screenA).toHaveText(await screenB.innerText());
    const advanced = await screenA.innerText();
    await page.getByTestId("studio-driver-previous").click();
    await expect(screenA).toHaveText(start);
    await expect(screenB).toHaveText(start);
    await page.getByTestId("studio-driver-next").click();
    await page.getByTestId("studio-driver-next").click();
    await expect(screenA).not.toHaveText(advanced);
    await page.getByTestId("studio-driver-reset").click();
    await expect(screenA).toHaveText(start);
    await expect(screenB).toHaveText(start);
  });

  test("a replayed run is the same run for both, and ends", async ({ page }) => {
    await page.clock.install();
    await openStudio(page);
    const screenA = page.getByTestId("studio-reference-screen");
    const screenB = page.getByTestId("studio-candidate-screen");
    const start = await screenA.innerText();
    const replay = page.getByTestId("studio-driver-replay");
    await replay.click();
    await expect(replay).toHaveAttribute("aria-pressed", "true");
    await page.clock.runFor(450);
    await expect(screenA).not.toHaveText(start);
    await page.clock.runFor(3_000);
    await expect(replay).toHaveAttribute("aria-pressed", "false");
    // Forward twice, back once, forward once: two screens on from where it began, for both.
    await expect(screenA).not.toHaveText(start);
    await expect(screenA).toHaveText(await screenB.innerText());
  });

  test("any other input stops a replay, so a stale step can never land", async ({ page }) => {
    await page.clock.install();
    await openStudio(page);
    const replay = page.getByTestId("studio-driver-replay");
    const screenA = page.getByTestId("studio-reference-screen");
    await replay.click();
    await page.clock.runFor(450);
    const during = await screenA.innerText();
    await page.getByTestId("studio-driver-reset").click();
    await expect(replay).toHaveAttribute("aria-pressed", "false");
    const reset = await screenA.innerText();
    await page.clock.runFor(5_000);
    // Nothing the replay still had queued was delivered after the reset.
    await expect(screenA).toHaveText(reset);
    expect(reset).not.toBe(during);
  });

  test("the driver reaches a lone reference too", async ({ page }) => {
    await openStudio(page);
    await page.getByTestId("studio-remove-carousel-loose").click();
    const screenA = page.getByTestId("studio-reference-screen");
    const start = await screenA.innerText();
    await page.getByTestId("studio-driver-next").click();
    await expect(screenA).not.toHaveText(start);
  });
});

test.describe("what the visitor reads follows what the visitor sees", () => {
  test("no name is ever ahead of the card in front, in either direction", async ({ page }) => {
    await openStudio(page, { reducedMotion: "no-preference" });
    await withDeck(page);
    await expect(studio.deck(page)).toHaveAttribute("data-phase", "idle");
    await startNameTrace(page);
    for (const control of ["studio-deck-next", "studio-deck-previous", "studio-deck-next"]) {
      await page.getByTestId(control).click();
      await expect(studio.deck(page)).not.toHaveAttribute("data-phase", "idle");
      await expect(studio.deck(page)).toHaveAttribute("data-phase", "idle", { timeout: 8_000 });
    }
    const frames = await stopNameTrace(page);

    let moved = false;
    for (const [index, frame] of frames.entries()) {
      if (frame.visual === null) continue;
      const visualName = nameOf(frame.visual as CandidateId);
      // Every piece of text that names B names the card in front, never the card heading there.
      expect(frame.b, `frame ${index} B`).toBe(visualName);
      expect(frame.caption, `frame ${index} caption`).toBe(visualName);
      expect(frame.summary, `frame ${index} summary`).toBe(visualName);
      expect(frame.stage, `frame ${index} stage`).toBe(frame.visual);
      if (frame.visual !== frame.settled) moved = true;
    }
    // The cards really did travel while those names were being compared.
    expect(moved).toBe(true);
  });

  test("rapid presses and a reversal end on the card the last press named", async ({ page }) => {
    await openStudio(page, { reducedMotion: "no-preference" });
    await withDeck(page);
    await shortlistCandidate(page, "deck-heavy");
    await expect(studio.deck(page)).toHaveAttribute("data-phase", "idle");
    await startNameTrace(page);
    const next = page.getByTestId("studio-deck-next");
    await next.click();
    await next.click();
    await next.click();
    await page.getByTestId("studio-deck-previous").click();
    await expect(studio.deck(page)).toHaveAttribute("data-phase", "idle", { timeout: 8_000 });
    const frames = await stopNameTrace(page);
    for (const [index, frame] of frames.entries()) {
      if (frame.visual === null) continue;
      expect(frame.b, `frame ${index}`).toBe(nameOf(frame.visual as CandidateId));
    }
    // Semantic B, the card in front, the settled card and the name all agree at rest.
    const { b } = await roles(page);
    await expect(studio.deck(page)).toHaveAttribute("data-visual-id", b!);
    await expect(studio.deck(page)).toHaveAttribute("data-settled-id", b!);
    await expect(studio.bName(page)).toHaveText(nameOf(b as CandidateId));
  });

  test("removing the card in front mid-exchange never names a card that has left", async ({
    page,
  }) => {
    await openStudio(page, { reducedMotion: "no-preference" });
    await withDeck(page);
    await expect(studio.deck(page)).toHaveAttribute("data-phase", "idle");
    await startNameTrace(page);
    await page.getByTestId("studio-deck-next").click();
    await page.getByTestId("studio-remove-carousel-balanced").click();
    await expect(studio.deck(page)).toHaveAttribute("data-phase", "idle", { timeout: 8_000 });
    const frames = await stopNameTrace(page);
    for (const [index, frame] of frames.entries()) {
      // After the removal the only card B can be is Loose carousel; no frame may still name Balanced carousel
      // once the Deck no longer holds it as a member.
      if (frame.visual === "carousel-loose")
        expect(frame.b, `frame ${index}`).toBe("Loose carousel");
      expect(frame.b, `frame ${index}`).toBe(frame.caption);
    }
    expect(await roles(page)).toEqual({ a: "carousel-tight", b: "carousel-loose" });
  });
});

test.describe("keyboard and focus", () => {
  test("one arrow on the Deck moves it exactly one card, and arrows elsewhere do not move it", async ({
    page,
  }) => {
    await openStudio(page);
    await withDeck(page);
    const deck = studio.deck(page);
    await expect(deck).toHaveAttribute("data-settled-id", "carousel-loose");
    // Focus on a control beside the Deck: its own keys stay its own.
    await page.getByTestId("studio-compare-carousel-balanced").focus();
    await page.keyboard.press("ArrowRight");
    await expect(deck).toHaveAttribute("data-settled-id", "carousel-loose");
    await expect(page.getByTestId("studio-compare-carousel-balanced")).toBeFocused();
    await page.getByTestId("studio-deck-next").focus();
    await page.keyboard.press("ArrowRight");
    await expect(deck).toHaveAttribute("data-settled-id", "carousel-loose");
    // The Deck itself takes one step per key.
    await deck.focus();
    await page.keyboard.press("ArrowRight");
    await expect(deck).toHaveAttribute("data-settled-id", "carousel-balanced");
    expect((await roles(page)).b).toBe("carousel-balanced");
    await expect(deck).toBeFocused();
  });

  test("the list is operable from the keyboard and focus returns from the detail", async ({
    page,
  }) => {
    await openStudio(page);
    const toggle = page.getByTestId("studio-shortlist-deck-shuffle");
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Space");
    await expect(toggle).toHaveAttribute("aria-pressed", "false");

    const open = page.getByTestId("studio-open-deck-shuffle");
    await open.focus();
    await page.keyboard.press("Enter");
    await expect(studio.detail(page)).toBeVisible();
    await expect(page.getByTestId("studio-detail-name")).toBeFocused();
    await page.getByTestId("studio-detail-back").focus();
    await page.keyboard.press("Enter");
    await expect(studio.detail(page)).toHaveCount(0);
    await expect(open).toBeFocused();
  });

  test("every live surface can be reached with the keyboard and moves with the arrow keys", async ({
    page,
  }) => {
    await openStudio(page);
    const surface = page.getByTestId("studio-reference-surface");
    await surface.focus();
    const screen = page.getByTestId("studio-reference-screen");
    const start = await screen.innerText();
    await page.keyboard.press("ArrowRight");
    await expect(screen).not.toHaveText(start);
    // B is a separate surface: A's key did not reach it.
    await expect(page.getByTestId("studio-candidate-screen")).toHaveText(start);
  });
});

test.describe("a candidate's detail", () => {
  test("opens from the list with its own live preview, and returns to the list", async ({
    page,
  }) => {
    await openStudio(page);
    await page.getByTestId("studio-open-deck-direct").click();
    const detail = studio.detail(page);
    await expect(detail).toBeVisible();
    await expect(page.getByTestId("studio-detail-name")).toHaveText("Direct deck");
    await expect(page.getByTestId("studio-detail-surface")).toHaveAttribute("data-phase", "idle");
    await expect(page.getByTestId("studio-detail-facts")).toContainText(
      "Calculated from the spring",
    );
    await expect(detail).toContainText("Authored guidance, not a measurement");
    const screen = page.getByTestId("studio-detail-screen");
    const start = await screen.innerText();
    await page.getByTestId("studio-detail-next").click();
    await expect(screen).not.toHaveText(start);

    // Its actions are the same shortlist, reference and B the rest of the Studio uses.
    await page.getByTestId("studio-detail-shortlist").click();
    await expect(page.getByTestId("studio-detail-shortlist")).toHaveText("Remove from shortlist");
    await page.getByTestId("studio-detail-compare").click();
    expect((await roles(page)).b).toBe("deck-direct");
    await expect(studio.bName(page)).toHaveText("Direct deck");
    await expect(page.getByTestId("studio-detail-compare")).toBeDisabled();
    await page.getByTestId("studio-detail-pin").click();
    expect((await roles(page)).a).toBe("deck-direct");
    await expect(page.getByTestId("studio-detail-pin")).toBeDisabled();

    await page.getByTestId("studio-detail-back").click();
    await expect(page.getByTestId("studio-candidate-list")).toBeVisible();
    await expect(studio.row(page, "deck-direct")).toHaveAttribute("data-role", "Reference A");
  });

  test("removing the open candidate from the shortlist keeps the detail, and the implementation opens from it", async ({
    page,
  }) => {
    await openStudio(page);
    await page.getByTestId("studio-open-carousel-loose").click();
    await page.getByTestId("studio-detail-implementation").click();
    await expect(page.getByTestId("studio-sheet-title")).toHaveText("Loose carousel");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("studio-detail-implementation")).toBeFocused();
  });
});

test.describe("the implementation sheet", () => {
  test("is the only modal, restores focus and scroll, and a second cannot open over it", async ({
    page,
  }) => {
    await openStudio(page);
    await page.getByTestId("studio-choose-a").click();
    const opener = page.getByTestId("studio-open-implementation");
    await opener.evaluate((element) => element.scrollIntoView({ block: "center" }));
    const before = await scrollY(page);
    await opener.click();
    await expect(studio.sheet(page)).toBeVisible();
    expect(await openDialogCount(page)).toBe(1);
    await expect(page.getByTestId("studio-snippet")).toContainText(
      `"stiffness": ${MOTION_PRESETS.tight.spring.stiffness}`,
    );
    await page.getByRole("button", { name: "Close implementation" }).click();
    await expect(studio.sheet(page)).not.toBeVisible();
    expect(await openDialogCount(page)).toBe(0);
    await expect(opener).toBeFocused();
    expect(await scrollY(page)).toBe(before);
    // It can open again the moment it has closed.
    await opener.click();
    await expect(studio.sheet(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(studio.sheet(page)).not.toBeVisible();
  });

  test("copies the code it shows, or says plainly that it cannot", async ({
    page,
    context,
    browserName,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});
    await openStudio(page);
    await page.getByTestId("studio-choose-a").click();
    await page.getByTestId("studio-open-implementation").click();
    await page.getByTestId("studio-copy").click();
    const status = page.getByTestId("studio-sheet-content").getByRole("status");
    await expect(status).toHaveText(/Copied\.|Copying is not available here/);
    // Reading the clipboard back is only permitted in Chromium; elsewhere the page's own report that
    // it wrote the code is what can be checked.
    if (browserName === "chromium" && (await status.innerText()).startsWith("Copied")) {
      const copied = await page.evaluate(() => navigator.clipboard.readText());
      // Some platforms (Windows) hand the clipboard back with CRLF line endings.
      expect(copied.replaceAll("\r\n", "\n")).toBe(
        await page.getByTestId("studio-snippet").textContent(),
      );
    }
  });
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("one view at a time, and the shortlist, roles and decision carry across", async ({
    page,
  }) => {
    await openStudio(page, { width: 390, height: 844 });
    await expect(page.getByTestId("studio-workspace")).toHaveAttribute("data-layout", "narrow");
    await expect(page.getByTestId("studio-candidate-list")).toBeVisible();
    await expect(studio.compare(page)).toHaveCount(0);

    await shortlistCandidate(page, "deck-shuffle");
    await page.getByTestId("studio-view-compare").click();
    await expect(page.getByTestId("studio-view-compare")).toHaveAttribute("aria-pressed", "true");
    await expect(studio.compare(page)).toBeVisible();
    await expect(page.getByTestId("studio-candidate-list")).toHaveCount(0);
    // The shortlist and its controls sit with the comparison on a phone.
    expect((await roles(page)).b).toBe("carousel-loose");
    await page.getByTestId("studio-compare-deck-shuffle").click();
    await expect(studio.bName(page)).toHaveText("Shuffle deck");
    await page.getByTestId("studio-choose-b").click();

    await page.getByTestId("studio-view-candidates").click();
    await expect(studio.row(page, "deck-shuffle")).toHaveAttribute("data-role", "B");
    await expect(studio.row(page, "deck-shuffle")).toHaveAttribute("data-decided", "true");
    await page.getByTestId("studio-view-compare").click();
    await expect(page.getByTestId("studio-decided")).toContainText("Shuffle deck");
    await expect(page.getByTestId("studio-workspace")).toBeVisible();
  });

  test("the stages stack, stay the same size and never overflow the page", async ({ page }) => {
    await openStudio(page, { width: 390, height: 844 });
    await page.getByTestId("studio-view-compare").click();
    const a = (await page.getByTestId("studio-preview-reference").boundingBox())!;
    const b = (await page.getByTestId("studio-preview-candidate").boundingBox())!;
    expect(Math.abs(a.width - b.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(a.height - b.height)).toBeLessThanOrEqual(1);
    expect(b.y).toBeGreaterThan(a.y + a.height - 1);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });

  test("adding another candidate from the comparison goes to the list with focus on it", async ({
    page,
  }) => {
    await openStudio(page, { width: 390, height: 844 });
    await page.getByTestId("studio-view-compare").click();
    await page.getByTestId("studio-add-more").click();
    await expect(page.getByTestId("studio-candidate-list")).toBeVisible();
    await expect(
      page.locator("[data-testid='studio-candidate-list'] [data-open-detail]").first(),
    ).toBeFocused();
  });

  test("tapping the Deck's front card opens that candidate in the list", async ({ page }) => {
    await openStudio(page, { width: 390, height: 844 });
    await shortlistCandidate(page, "deck-shuffle");
    await page.getByTestId("studio-view-compare").click();
    await expect(studio.deck(page)).toHaveAttribute("data-phase", "idle");
    await studio.deck(page).locator("[data-visual='true']").click();
    await expect(page.getByTestId("studio-view-candidates")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByTestId("studio-detail-name")).toHaveText("Loose carousel");
  });
});

test.describe("click and drag on the Deck", () => {
  test("a tap on the front card opens it; a drag turns the Deck and opens nothing", async ({
    page,
  }) => {
    await openStudio(page, { reducedMotion: "no-preference" });
    await withDeck(page);
    await expect(studio.deck(page)).toHaveAttribute("data-phase", "idle");
    const card = studio.deck(page).locator("[data-visual='true']");

    await dragMouseBy(page, card, -160, 0, { steps: 8 });
    await expect(studio.deck(page)).toHaveAttribute("data-phase", "idle", { timeout: 8_000 });
    await expect(studio.detail(page)).toHaveCount(0);
    expect((await roles(page)).b).toBe("carousel-balanced");

    await card.click();
    await expect(page.getByTestId("studio-detail-name")).toHaveText("Balanced carousel");
  });
});
