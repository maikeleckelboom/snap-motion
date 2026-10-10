import { expect, test, type Page } from "@playwright/test";

import { dragMouseBy, dragSyntheticPointerBy } from "./helpers";
import {
  editor,
  expectEveryBarShows,
  field,
  openEditor,
  openPlayground,
  scrollY,
  section,
  tuningState,
} from "./playgroundHelpers";
import {
  expectActiveStudy,
  expectGalleryClosed,
  expectGalleryOpen,
  expectSheetClosed,
  expectStudioIdle,
  focusedTestId,
  openDialogCount,
  openStudio,
  selectStudy,
  studio,
} from "./studioHelpers";

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

/** The comparison as the tray shows it, in order. */
async function trayNames(page: Page): Promise<string[]> {
  return page.locator(".tray-name span").allTextContents();
}

async function deckCardName(page: Page): Promise<string | null> {
  return page.getByTestId("studio-deck-caption").textContent();
}

test.describe("activation boundary", () => {
  test("the section is a complete introduction until the visitor opens it", async ({ page }) => {
    const requested: string[] = [];
    page.on("request", (request) => requested.push(request.url()));
    await openPlayground(page);

    await expect(page.getByTestId("studio-stage")).toHaveAttribute("data-activated", "false");
    await expect(page.getByTestId("studio-intro")).toBeAttached();
    await expect(page.getByTestId("studio-workspace")).toHaveCount(0);
    // Nothing of the workspace has been requested: not its code, not its collection, not a plate.
    expect(
      requested.filter((url) => /StudioWorkspace|studio\/catalog|-cover\.svg/.test(url)),
    ).toEqual([]);
    // The page above mounts exactly its own five surfaces.
    await expect(page.locator(".snap-motion-coverflow")).toHaveCount(1);
    await expect(page.locator(".snap-motion-stacked-deck")).toHaveCount(1);
    // Four dialogs belong to the page's own demonstrations: two galleries, a lightbox and a sheet.
    await expect(page.locator("dialog")).toHaveCount(4);

    await page.getByTestId("studio-activate").click();
    await expect(page.getByTestId("studio-workspace")).toBeFocused();
    await expect(page.getByTestId("studio-stage")).toHaveAttribute("data-activated", "true");
    await expect(page.getByTestId("studio-intro")).toHaveCount(0);
    expect(requested.some((url) => /StudioWorkspace/.test(url))).toBe(true);
    await expect(page.locator(".snap-motion-coverflow")).toHaveCount(2);
    await expect(page.locator(".snap-motion-stacked-deck")).toHaveCount(2);
    // The Studio adds a gallery and a sheet of its own, and nothing else is a dialog.
    await expect(page.locator("dialog")).toHaveCount(6);
    await expectStudioIdle(page);
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
      // The sticky bar names the section it landed on.
      await expect(page.getByTestId("nav-studio")).toHaveAttribute("aria-current", "location", {
        timeout: 8_000,
      });
    });
  }

  test("the workspace stays mounted and keeps its state while the page is scrolled", async ({
    page,
  }) => {
    await openStudio(page);
    await studio.tile(page, "traverse").click();
    await expectActiveStudy(page, "traverse", "Traverse");
    await page.locator("#top").scrollIntoViewIfNeeded();
    await page.locator("#studio").scrollIntoViewIfNeeded();
    await expectActiveStudy(page, "traverse", "Traverse");
    await expect(page.getByTestId("studio-workspace")).toHaveCount(1);
  });

  test("keeps every id unique and the document clean with the workspace and its overlays open", async ({
    page,
  }) => {
    await openStudio(page);
    const duplicates = () =>
      page.evaluate(() => {
        const seen = new Map<string, number>();
        for (const element of document.querySelectorAll("[id]"))
          seen.set(element.id, (seen.get(element.id) ?? 0) + 1);
        return [...seen].filter(([, count]) => count > 1).map(([id]) => id);
      });
    expect(await duplicates()).toEqual([]);
    await page.getByTestId("studio-details").click();
    await expect(studio.sheet(page)).toBeVisible();
    expect(await duplicates()).toEqual([]);
  });
});

test.describe("one selection across the workspace", () => {
  test("a study selected anywhere is the active study everywhere", async ({ page }) => {
    await openStudio(page);
    await expectActiveStudy(page, "fold", "Fold");

    // Grid -> everything.
    await studio.tile(page, "traverse").click();
    await expectActiveStudy(page, "traverse", "Traverse");
    await expect(page.getByTestId("studio-coverflow-caption")).toHaveText("Traverse");

    // Coverflow -> everything.
    await studio.coverflow(page).focus();
    await page.keyboard.press("ArrowRight");
    await expectActiveStudy(page, "fold", "Fold");
    await page.keyboard.press("ArrowRight");
    await expectActiveStudy(page, "relay", "Relay");
    await expect(studio.deck(page)).toHaveAttribute("data-active-id", "relay");

    // Deck -> everything. The comparison is Fold, Arc, Relay, and the ring wraps from Relay to Fold.
    await page.getByTestId("studio-deck-next").click();
    await expect(studio.deck(page)).toHaveAttribute("data-active-id", "fold");
    await expectActiveStudy(page, "fold", "Fold");
    await expect(studio.coverflow(page)).toHaveAttribute("data-active-id", "fold");
  });

  test("the Grid follows a study chosen elsewhere to the page that holds it", async ({ page }) => {
    await openStudio(page);
    await expect(studio.grid(page)).toHaveAttribute("data-active-page", "page-1");
    await studio.coverflow(page).focus();
    for (let step = 0; step < 3; step += 1) await page.keyboard.press("ArrowRight");
    await expectActiveStudy(page, "return", "Return");
    // Fold, Relay, Drift, Return: the sixth study lies on the second page of three.
    await expect(studio.grid(page)).toHaveAttribute("data-active-page", "page-2");
    await expect(studio.tile(page, "return")).toHaveAttribute("aria-current", "true");
  });

  test("selecting a study outside the comparison never adds it or retargets the Deck", async ({
    page,
  }) => {
    await openStudio(page);
    await expect(studio.deck(page)).toHaveAttribute("data-active-id", "fold");
    await studio.tile(page, "orbit").click();
    await expectActiveStudy(page, "orbit", "Orbit");
    // The Deck keeps its own card and the comparison is untouched.
    await expect(studio.deck(page)).toHaveAttribute("data-active-id", "fold");
    expect(await trayNames(page)).toEqual(["Fold", "Arc", "Relay"]);
    await expect(page.getByTestId("studio-membership")).toHaveText("Not in comparison");
    await expect(page.getByTestId("studio-deck-note")).toContainText(
      "Fold is on top. Orbit is the active study",
    );
    // The Deck's card can be made the active study without a gesture.
    await page.getByRole("button", { name: "Make Fold active" }).click();
    await expectActiveStudy(page, "fold", "Fold");
    await expect(page.getByTestId("studio-deck-note")).toHaveCount(0);
  });

  test("tiles are named, keyboard operable and show the current study", async ({ page }) => {
    await openStudio(page);
    const tile = studio.tile(page, "traverse");
    await expect(tile).toHaveAccessibleName("Traverse, point to point");
    await expect(studio.tile(page, "fold")).toHaveAccessibleName(
      "Fold, surface study, in comparison",
    );
    await tile.focus();
    await page.keyboard.press("Enter");
    await expectActiveStudy(page, "traverse", "Traverse");
    await studio.tile(page, "orbit").focus();
    await page.keyboard.press("Space");
    await expectActiveStudy(page, "orbit", "Orbit");
    await expect(studio.tile(page, "traverse")).not.toHaveAttribute("aria-current", "true");
  });

  test("the collection filters by motion type without changing the selection", async ({ page }) => {
    await openStudio(page);
    await expect(page.getByTestId("studio-collection-count")).toHaveText("12 studies");
    await page.getByTestId("studio-filter-sequence").click();
    await expect(page.getByTestId("studio-collection-count")).toHaveText("3 of 12 studies");
    await expect(studio.tile(page, "relay")).toBeVisible();
    await expect(studio.tile(page, "orbit")).toHaveCount(0);
    await expect(studio.grid(page)).toHaveAttribute("data-page-count", "1");
    // Fold is active but filtered out: it is still the active study and still in the Coverflow.
    await expectActiveStudy(page, "fold", "Fold");
    await studio.tile(page, "step").click();
    await expectActiveStudy(page, "step", "Step");
    await page.getByTestId("studio-filter-all").click();
    await expect(page.getByTestId("studio-collection-count")).toHaveText("12 studies");
    await expect(studio.tile(page, "step")).toHaveAttribute("aria-current", "true");
  });

  test("a denser layout changes the pages and keeps the active study on screen", async ({
    page,
  }) => {
    await openStudio(page);
    await expect(studio.grid(page)).toHaveAttribute("data-page-count", "3");
    await page.getByTestId("studio-grid-next").click();
    await studio.tile(page, "drift").click();
    await expectActiveStudy(page, "drift", "Drift");
    await page.getByTestId("studio-density-compact").click();
    await expect(studio.grid(page)).toHaveAttribute("data-page-count", "2");
    await expect(studio.grid(page)).toHaveAttribute("data-columns", "3");
    // Drift is the fifth study: on the first nine-up page, and that page is the current one.
    await expect(studio.grid(page)).toHaveAttribute("data-active-page", "page-1");
    await expect(studio.tile(page, "drift")).toBeVisible();
    await expect(studio.tile(page, "drift")).toHaveAttribute("aria-current", "true");
    await page.getByTestId("studio-density-comfortable").click();
    await expect(studio.grid(page)).toHaveAttribute("data-page-count", "3");
    await expect(studio.grid(page)).toHaveAttribute("data-active-page", "page-2");
  });

  test("paging the Grid does not change the selection", async ({ page }) => {
    await openStudio(page);
    await page.getByTestId("studio-grid-next").click();
    await expect(studio.grid(page)).toHaveAttribute("data-active-page", "page-2");
    await expect(page.getByTestId("studio-grid-page")).toHaveText("Page 2 / 3");
    await expectActiveStudy(page, "fold", "Fold");
    await page.getByTestId("studio-grid-previous").click();
    await expect(studio.grid(page)).toHaveAttribute("data-active-page", "page-1");
  });
});

test.describe("comparison", () => {
  test("adds and removes studies, announces each change and keeps the Deck on the card in hand", async ({
    page,
  }) => {
    await openStudio(page);
    expect(await trayNames(page)).toEqual(["Fold", "Arc", "Relay"]);
    await expect(page.getByTestId("studio-comparison-count")).toHaveText("3 of 5");

    await studio.tile(page, "traverse").click();
    await page.getByTestId("studio-toggle-compare").click();
    expect(await trayNames(page)).toEqual(["Fold", "Arc", "Relay", "Traverse"]);
    await expect(studio.status(page)).toHaveText("Traverse added to comparison, 4 of 5");
    await expect(page.getByTestId("studio-membership")).toHaveText("In comparison, 4 of 4");
    // The study just added is the one in hand: the Deck shows it.
    await expect(studio.deck(page)).toHaveAttribute("data-active-id", "traverse");
    await expect(studio.summary(page)).toHaveText("12 studies · 4 in comparison");
    await expect(studio.tile(page, "traverse")).toHaveAttribute("data-compared", "true");

    await page.getByTestId("studio-toggle-compare").click();
    await expect(studio.status(page)).toContainText("Traverse removed from comparison");
    expect(await trayNames(page)).toEqual(["Fold", "Arc", "Relay"]);
    await expect(studio.tile(page, "traverse")).toHaveAttribute("data-compared", "false");
  });

  test("stops at five and explains why", async ({ page }) => {
    await openStudio(page);
    for (const id of ["traverse", "orbit"]) {
      await studio.tile(page, id).click();
      await page.getByTestId("studio-toggle-compare").click();
    }
    await expect(page.getByTestId("studio-comparison-count")).toHaveText("5 of 5");
    await selectStudy(page, "drift");
    const add = page.getByTestId("studio-toggle-compare");
    await expect(add).toBeDisabled();
    await expect(page.getByTestId("studio-comparison-full")).toHaveText(
      "The comparison holds 5 studies. Remove one to add Drift.",
    );
    await expect(add).toHaveAccessibleDescription(/holds 5 studies/);
    // Removing one makes room.
    await page.getByTestId("studio-remove-orbit").click();
    await expect(add).toBeEnabled();
    await add.click();
    expect(await trayNames(page)).toEqual(["Fold", "Arc", "Relay", "Traverse", "Drift"]);
    await expect(page.getByTestId("studio-comparison-count")).toHaveText("5 of 5");
  });

  test("removing the Deck's current card moves it to the card that took its place", async ({
    page,
  }) => {
    await openStudio(page);
    await page.getByTestId("studio-deck-next").click();
    await expect(studio.deck(page)).toHaveAttribute("data-active-id", "arc");
    await expectActiveStudy(page, "arc", "Arc");
    await page.getByTestId("studio-remove-arc").click();
    expect(await trayNames(page)).toEqual(["Fold", "Relay"]);
    await expect(studio.deck(page)).toHaveAttribute("data-active-id", "relay");
    // The removed study stays active: removal edits the comparison, not the selection.
    await expectActiveStudy(page, "arc", "Arc");
    await expect(page.getByTestId("studio-membership")).toHaveText("Not in comparison");
    // Focus moves to the card that took its place in the tray.
    await expect(studio.tray(page, "relay").locator(".tray-name")).toBeFocused();
  });

  test("one and zero studies are plain states, and the Deck returns with two", async ({ page }) => {
    await openStudio(page);
    await page.getByTestId("studio-remove-arc").click();
    await page.getByTestId("studio-remove-relay").click();
    await expect(studio.deck(page)).toHaveCount(0);
    const single = page.getByTestId("studio-compare-single");
    await expect(single).toBeVisible();
    await expect(single).toContainText("The Deck exchanges cards, so it needs two.");
    await expect(studio.status(page)).toContainText("Relay removed");

    await page.getByTestId("studio-remove-fold").click();
    const empty = page.getByTestId("studio-compare-empty");
    await expect(empty).toBeVisible();
    await expect(empty).toContainText("Nothing to compare yet");
    await expect(page.getByTestId("studio-comparison-count")).toHaveText("0 of 5");
    await expect(page.getByTestId("studio-compare-add")).toBeFocused();
    await expect(studio.summary(page)).toHaveText("12 studies · 0 in comparison");

    // Fold is still active, so the empty state offers it.
    await page.getByTestId("studio-compare-add").click();
    await expect(single).toBeVisible();
    await studio.tile(page, "orbit").click();
    await page.getByTestId("studio-toggle-compare").click();
    await expect(studio.deck(page)).toBeVisible();
    await expect(studio.deck(page)).toHaveAttribute("data-active-id", "orbit");
    expect(await trayNames(page)).toEqual(["Fold", "Orbit"]);
  });

  test("the tray jumps to a card and the Deck makes it the active study", async ({ page }) => {
    await openStudio(page);
    await studio.tray(page, "relay").locator(".tray-name").click();
    await expect(studio.deck(page)).toHaveAttribute("data-active-id", "relay");
    await expectActiveStudy(page, "relay", "Relay");
    await expect(studio.tray(page, "relay")).toHaveAttribute("data-current", "true");
  });

  test("Shuffle and Direct are both available and the choice is shared with the Deck section", async ({
    page,
  }) => {
    await openStudio(page);
    const direct = page.getByTestId("studio-exchange-direct");
    const shuffle = page.getByTestId("studio-exchange-shuffle");
    await expect(shuffle).toHaveAttribute("aria-pressed", "true");
    await direct.click();
    await expect(direct).toHaveAttribute("aria-pressed", "true");
    await expect(shuffle).toHaveAttribute("aria-pressed", "false");
    // The page owns the exchange, so the Stacked Deck section agrees.
    await expect(
      section(page, "stacked-deck").getByTestId("stacked-deck-exchange-direct"),
    ).toHaveAttribute("aria-pressed", "true");
    // And the Deck still exchanges.
    await page.getByTestId("studio-deck-next").click();
    await expect(studio.deck(page)).toHaveAttribute("data-active-id", "arc");
    await page.getByTestId("studio-deck-previous").click();
    await expect(studio.deck(page)).toHaveAttribute("data-active-id", "fold");
  });
});

test.describe("inspection in the Gallery", () => {
  test("opens on the study's plate, browses its plates and returns focus and context", async ({
    page,
  }) => {
    await openStudio(page);
    await studio.tile(page, "traverse").click();
    await page.getByTestId("studio-inspect").scrollIntoViewIfNeeded();
    const before = await scrollY(page);
    await page.getByTestId("studio-inspect").click();
    await expectGalleryOpen(page, "Traverse — Study plate");
    expect(await openDialogCount(page)).toBe(1);
    const gallery = studio.gallery(page);
    await expect(gallery.getByTestId("snap-motion-media-gallery-close")).toBeFocused();

    await gallery.getByTestId("snap-motion-media-gallery-next").click();
    await expect(gallery.getByTestId("snap-motion-media-gallery-title")).toHaveText(
      "Traverse — Route",
    );
    await gallery.getByTestId("snap-motion-media-gallery-zoom-in").click();
    await expect(gallery).not.toHaveAttribute("data-scale", "1.0000");
    expect(Number(await gallery.getAttribute("data-scale"))).toBeGreaterThan(1);

    await page.keyboard.press("Escape");
    await expectGalleryClosed(page);
    await expect(page.getByTestId("studio-inspect")).toBeFocused();
    await expectActiveStudy(page, "traverse", "Traverse");
    expect(Math.abs((await scrollY(page)) - before)).toBeLessThanOrEqual(1);
    expect(await openDialogCount(page)).toBe(0);
  });

  test("closing on another study's plate makes that study active everywhere", async ({ page }) => {
    await openStudio(page);
    await studio.tile(page, "traverse").click();
    await page.getByTestId("studio-inspect").click();
    const gallery = studio.gallery(page);
    const next = gallery.getByTestId("snap-motion-media-gallery-next");
    // Study plate, Route, Timing, then the next study's first plate: Fold.
    for (const title of ["Traverse — Route", "Traverse — Timing", "Fold — Study plate"]) {
      await next.click();
      await expect(gallery.getByTestId("snap-motion-media-gallery-title")).toHaveText(title);
    }
    await page.keyboard.press("Escape");
    await expectGalleryClosed(page);
    await expectActiveStudy(page, "fold", "Fold");
    await expect(studio.deck(page)).toHaveAttribute("data-active-id", "fold");
    await expect(page.getByTestId("studio-inspect")).toBeFocused();
    await expect(page.getByTestId("studio-status")).toHaveText("Back to Fold");
  });

  test("opens from a plate chip and from tapping the front Coverflow card", async ({ page }) => {
    await openStudio(page);
    await page.getByTestId("studio-plate-timing").click();
    await expectGalleryOpen(page, "Fold — Timing");
    await studio.gallery(page).getByTestId("snap-motion-media-gallery-close").click();
    await expectGalleryClosed(page);
    await expect(page.getByTestId("studio-plate-timing")).toBeFocused();

    // A tap on the settled front card asks to inspect it, and focus returns to the rail.
    await studio.coverflow(page).locator('[data-item-id="fold"]').click();
    await expectGalleryOpen(page, "Fold — Study plate");
    await page.keyboard.press("Escape");
    await expectGalleryClosed(page);
    await expect(studio.coverflow(page)).toBeFocused();
  });

  test("a Deck card opens the Gallery on the card in hand, which is where the study returns", async ({
    page,
  }) => {
    await openStudio(page);
    await studio.tile(page, "orbit").click();
    // Orbit is active but outside the comparison; the Deck holds Fold.
    await studio.deck(page).locator('[data-item-id="fold"]').click();
    await expectGalleryOpen(page, "Fold — Study plate");
    await page.keyboard.press("Escape");
    await expectGalleryClosed(page);
    await expect(studio.deck(page)).toBeFocused();
    await expectActiveStudy(page, "fold", "Fold");
  });

  test("reopens immediately after dismissal, repeatedly, without stale state", async ({ page }) => {
    await openStudio(page);
    const open = page.getByTestId("studio-inspect");
    for (let cycle = 0; cycle < 4; cycle += 1) {
      await open.click();
      await expectGalleryOpen(page, "Fold — Study plate");
      await page.keyboard.press("Escape");
      await expectGalleryClosed(page);
      await expect(open).toBeFocused();
    }
    await expect(page.locator("html")).not.toHaveCSS("overflow", "hidden");
    expect(await openDialogCount(page)).toBe(0);
    // The page is usable at once.
    await studio.tile(page, "orbit").click();
    await expectActiveStudy(page, "orbit", "Orbit");
  });

  test("the surfaces behind the Gallery are inert and take no input", async ({ page }) => {
    await openStudio(page);
    await page.getByTestId("studio-inspect").click();
    await expectGalleryOpen(page, "Fold — Study plate");
    await expect(studio.coverflow(page)).toHaveAttribute("data-phase", "idle");
    await expect(page.getByTestId("studio-coverflow-next")).toBeDisabled();
    await expect(page.getByTestId("studio-deck-next")).toBeDisabled();
    await page.keyboard.press("Escape");
    await expectGalleryClosed(page);
    await expect(page.getByTestId("studio-coverflow-next")).toBeEnabled();
  });
});

test.describe("details and notes in the Sheet", () => {
  test("opens beside the page on a wide layout and returns focus to Details", async ({ page }) => {
    await openStudio(page);
    await page.getByTestId("studio-details").scrollIntoViewIfNeeded();
    const before = await scrollY(page);
    await page.getByTestId("studio-details").click();
    const sheet = studio.sheet(page);
    await expect(sheet).toBeVisible();
    await expect(sheet).toHaveAttribute("data-sheet-state", "open", { timeout: 8_000 });
    await expect(sheet).toHaveAttribute("data-sheet-side", "right");
    await expect(page.getByTestId("studio-sheet-title")).toHaveText("Fold");
    expect(await openDialogCount(page)).toBe(1);
    await page.keyboard.press("Escape");
    await expectSheetClosed(page);
    await expect(page.getByTestId("studio-details")).toBeFocused();
    expect(Math.abs((await scrollY(page)) - before)).toBeLessThanOrEqual(1);
  });

  test("an edit made in the Sheet is visible everywhere once it closes", async ({ page }) => {
    await openStudio(page);
    await studio.tile(page, "traverse").click();
    await page.getByTestId("studio-details").click();
    await expect(studio.sheet(page)).toBeVisible();
    const note = page.getByTestId("studio-note");
    await expect(note).toBeEmpty();
    await note.fill("Reverse before it settles.");
    await page.getByTestId("studio-sheet-toggle-compare").click();
    await expect(page.getByTestId("studio-sheet-membership")).toContainText("In the comparison");
    await note.press("Tab");
    await expect(studio.status(page)).toHaveText("Note saved for Traverse");
    await page.keyboard.press("Escape");
    await expectSheetClosed(page);

    await expect(page.getByTestId("studio-active-note")).toHaveText(
      "Note Reverse before it settles.",
    );
    await expect(studio.tile(page, "traverse")).toHaveAccessibleName(
      "Traverse, point to point, in comparison, has a note",
    );
    expect(await trayNames(page)).toContain("Traverse");
    await expect(studio.deck(page)).toHaveAttribute("data-active-id", "traverse");

    // Leave and come back: the edit belongs to the study, not to what was on screen.
    await studio.tile(page, "orbit").click();
    await expect(page.getByTestId("studio-active-note")).toHaveCount(0);
    await studio.tile(page, "traverse").click();
    await expect(page.getByTestId("studio-active-note")).toBeVisible();
    await page.getByTestId("studio-details").click();
    await expect(page.getByTestId("studio-note")).toHaveValue("Reverse before it settles.");
  });

  test("the note is bounded and counted", async ({ page }) => {
    await openStudio(page);
    await page.getByTestId("studio-details").click();
    const note = page.getByTestId("studio-note");
    await note.fill("x".repeat(400));
    expect((await note.inputValue()).length).toBe(240);
    await expect(page.getByText("240 / 240")).toBeVisible();
  });

  test("a Sheet action opens the Gallery only after the Sheet has finished closing", async ({
    page,
  }) => {
    await openStudio(page);
    await page.getByTestId("studio-details").click();
    await expect(studio.sheet(page)).toBeVisible();

    // Sample the open dialogs through the whole handoff: modality never has two owners.
    await page.evaluate(() => {
      const samples: number[] = [];
      let live = true;
      const tick = () => {
        samples.push(document.querySelectorAll("dialog[open]").length);
        if (live) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      (window as unknown as { stopSampling: () => number[] }).stopSampling = () => {
        live = false;
        return samples;
      };
    });
    await page.getByTestId("studio-sheet-plate-route").click();
    await expectGalleryOpen(page, "Fold — Route");
    const samples = await page.evaluate(() =>
      (window as unknown as { stopSampling: () => number[] }).stopSampling(),
    );
    expect(Math.max(...samples)).toBeLessThanOrEqual(1);
    await expectSheetClosed(page);

    await page.keyboard.press("Escape");
    await expectGalleryClosed(page);
    // The visitor started from Details, so that is where focus returns.
    await expect(page.getByTestId("studio-details")).toBeFocused();
    expect(await openDialogCount(page)).toBe(0);
  });

  test("another action can begin as soon as a dialog has closed", async ({ page }) => {
    await openStudio(page);
    for (let cycle = 0; cycle < 3; cycle += 1) {
      await page.getByTestId("studio-details").click();
      await expect(studio.sheet(page)).toBeVisible();
      await page.keyboard.press("Escape");
      await expectSheetClosed(page);
      await page.getByTestId("studio-inspect").click();
      await expectGalleryOpen(page, "Fold — Study plate");
      await page.keyboard.press("Escape");
      await expectGalleryClosed(page);
    }
    expect(await openDialogCount(page)).toBe(0);
  });

  test("the Sheet keeps its native scrolling and dismissal", async ({ page }) => {
    await openStudio(page, { width: 390, height: 640 });
    await page.getByTestId("studio-view-explore").click();
    await page.getByTestId("studio-details").click();
    const sheet = studio.sheet(page);
    await expect(sheet).toBeVisible();
    await expect(sheet).toHaveAttribute("data-sheet-side", "bottom");
    await expect(sheet).toHaveAttribute("data-sheet-state", "open", { timeout: 8_000 });
    const body = sheet.locator(".snap-motion-sheet-body");
    const scrollable = await body.evaluate(
      (element) => element.scrollHeight > element.clientHeight,
    );
    expect(scrollable).toBe(true);
    await body.evaluate((element) => element.scrollTo(0, element.scrollHeight));
    await expect(page.getByTestId("studio-sheet-plate-timing")).toBeInViewport();
    await page.getByRole("button", { name: "Close details" }).click();
    await expectSheetClosed(page);
    await expect(page.getByTestId("studio-details")).toBeFocused();
  });
});

/** How far a held 240px drag past the first page's edge is allowed to travel: the shared elasticity. */
async function heldOverdrag(page: Page, grid: ReturnType<typeof studio.grid>): Promise<number> {
  let held = Number.NaN;
  await dragSyntheticPointerBy(page, grid, 240, 0, {
    beforeRelease: async () => {
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      held = await grid
        .locator(".grid-track")
        .evaluate((track) => new DOMMatrix(getComputedStyle(track).transform).m41);
    },
    steps: 8,
  });
  await expect(grid).toHaveAttribute("data-active-page", "page-1");
  return held;
}

test.describe("shared motion", () => {
  test("an edit made in another section reaches the Studio, and the Studio's reaches the others", async ({
    page,
  }) => {
    await openStudio(page);
    const studioGrid = studio.grid(page);
    const demoGrid = page.getByTestId("paged-grid");

    const balanced = await heldOverdrag(page, studioGrid);
    expect(balanced).toBeGreaterThan(8);

    // Made beside the Sheet demonstration, felt in the Studio's Grid.
    await openEditor(page, "sheet");
    await field(page, "Elastic limit").fill("0");
    await field(page, "Elastic limit").blur();
    await expect(tuningState(page, "studio")).toHaveText("Modified (1)");
    expect(await heldOverdrag(page, studioGrid)).toBe(0);

    // Reset from the Studio's own bar restores every surface, including the standalone Grid.
    await section(page, "studio").getByTestId("tuning-reset").click();
    await expectEveryBarShows(page, "balanced");
    expect(await heldOverdrag(page, studioGrid)).toBeGreaterThan(8);

    // Made in the Studio's own editor, felt by the standalone Paged Grid.
    await openEditor(page, "studio");
    await expect(editor(page)).toBeVisible();
    await field(page, "Elastic limit").fill("0");
    await field(page, "Elastic limit").blur();
    await expectEveryBarShows(page, "balanced", 1);
    await demoGrid.scrollIntoViewIfNeeded();
    await dragSyntheticPointerBy(page, demoGrid, 240, 0, {
      beforeRelease: async () => {
        await page.evaluate(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
            ),
        );
        const held = await demoGrid
          .locator(".page-track")
          .evaluate((track) => new DOMMatrix(getComputedStyle(track).transform).m41);
        expect(held).toBe(0);
      },
      steps: 8,
    });
  });

  test("a preset chosen in the Studio's bar is the preset of every section and Studio surface", async ({
    page,
  }) => {
    await openStudio(page);
    const balanced = await heldOverdrag(page, studio.grid(page));
    await section(page, "studio").getByTestId("preset-loose").click();
    await expectEveryBarShows(page, "loose");
    expect(await heldOverdrag(page, studio.grid(page))).toBeGreaterThan(balanced);
    await section(page, "coverflow").getByTestId("preset-tight").click();
    await expectEveryBarShows(page, "tight");
    await expect(page.getByTestId("studio-motion")).toContainText("Tight");
  });

  test("the compact indicator names the preset and leads to the shared tuning", async ({
    page,
  }) => {
    await openStudio(page);
    const chip = page.getByTestId("studio-motion");
    await expect(chip).toContainText("Balanced");
    await section(page, "sheet").getByTestId("preset-heavy").click();
    await expect(chip).toContainText("Heavy");
    await openEditor(page, "sheet");
    await field(page, "Stiffness").fill("333");
    await field(page, "Stiffness").blur();
    await expect(chip).toContainText("Heavy · modified");
    await chip.click();
    await expect(page).toHaveURL(/#studio-tuning$/);
    await expect(page.locator("#studio-tuning")).toBeFocused();
    await expect(page.locator("#studio-tuning").getByTestId("preset-heavy")).toBeVisible();
  });

  test("reduced motion is shared: every Studio surface reports it and still takes input", async ({
    page,
  }) => {
    await openStudio(page, { reducedMotion: "reduce" });
    await expect(studio.coverflow(page)).toHaveAttribute("data-reduced-motion", "true");
    await expect(studio.deck(page)).toHaveAttribute("data-reduced-motion", "true");
    await studio.tile(page, "orbit").click();
    await expectActiveStudy(page, "orbit", "Orbit");
    await page.getByTestId("studio-inspect").click();
    await expect(studio.gallery(page)).toHaveAttribute("data-reduced-motion", "true");
    await page.keyboard.press("Escape");
    await expectGalleryClosed(page);

    // Choosing Full motion from the shared editor reaches the Studio without a reload.
    await openEditor(page, "studio");
    await page.getByTestId("motion-full").click();
    await expect(studio.coverflow(page)).toHaveAttribute("data-reduced-motion", "false");
    await expect(studio.deck(page)).toHaveAttribute("data-reduced-motion", "false");
  });
});

test.describe("keyboard", () => {
  test("arrow keys move only the surface that owns focus", async ({ page }) => {
    await openStudio(page);
    const gridPage = await studio.grid(page).getAttribute("data-active-page");

    await studio.deck(page).focus();
    await page.keyboard.press("ArrowRight");
    await expect(studio.deck(page)).toHaveAttribute("data-active-id", "arc");
    await expectActiveStudy(page, "arc", "Arc");

    await studio.coverflow(page).focus();
    await page.keyboard.press("ArrowLeft");
    // One key press is one step: the Coverflow's own handler ran once, and no other surface's did.
    await expectActiveStudy(page, "return", "Return");

    await studio.grid(page).focus();
    await page.keyboard.press("ArrowRight");
    await expect(studio.grid(page)).toHaveAttribute("data-active-page", "page-3");
    await expectActiveStudy(page, "return", "Return");
    expect(gridPage).toBe("page-1");
  });

  test("the whole journey needs no pointer: keys, tiles and buttons only", async ({ page }) => {
    await openStudio(page);
    await studio.tile(page, "traverse").focus();
    await page.keyboard.press("Enter");
    await expectActiveStudy(page, "traverse", "Traverse");
    await page.getByTestId("studio-toggle-compare").focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("studio-membership")).toContainText("In comparison");
    await page.getByTestId("studio-inspect").focus();
    await page.keyboard.press("Enter");
    await expectGalleryOpen(page, "Traverse — Study plate");
    await page.keyboard.press("ArrowRight");
    await expect(studio.gallery(page).getByTestId("snap-motion-media-gallery-title")).toHaveText(
      "Traverse — Route",
    );
    await page.keyboard.press("Escape");
    await expectGalleryClosed(page);
    await page.getByTestId("studio-details").focus();
    await page.keyboard.press("Enter");
    await expect(studio.sheet(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expectSheetClosed(page);
    await expect(page.getByTestId("studio-details")).toBeFocused();
  });

  test("every control shows a visible focus indicator", async ({ page }) => {
    await openStudio(page);
    for (const testid of [
      "studio-filter-path",
      "studio-density-compact",
      "studio-grid-next",
      "studio-coverflow-next",
      "studio-toggle-compare",
      "studio-inspect",
      "studio-details",
      "studio-exchange-direct",
      "studio-deck-next",
    ]) {
      const control = page.getByTestId(testid);
      await control.focus();
      await page.keyboard.press("Shift+Tab");
      await page.keyboard.press("Tab");
      await expect(control).toBeFocused();
      const outline = await control.evaluate((element) => {
        const style = getComputedStyle(element);
        return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
      });
      expect(outline.style, testid).not.toBe("none");
      expect(outline.width, testid).toBeGreaterThanOrEqual(2);
    }
  });
});

test.describe("narrow layout", () => {
  test("switches between Browse, Explore and Compare on one persistent selection", async ({
    page,
  }) => {
    await openStudio(page, { width: 390, height: 844 });
    const workspace = page.getByTestId("studio-workspace");
    await expect(workspace).toHaveAttribute("data-layout", "narrow");
    // One view at a time: only the current view's surface is mounted.
    await expect(page.getByTestId("studio-browse")).toBeVisible();
    await expect(page.getByTestId("studio-explore")).toHaveCount(0);
    await expect(page.getByTestId("studio-compare")).toHaveCount(0);
    await expect(page.locator(".snap-motion-coverflow")).toHaveCount(1);

    await studio.tile(page, "traverse").click();
    await expect(studio.activeName(page)).toHaveText("Traverse");
    await page.getByTestId("studio-toggle-compare").click();
    await page.getByTestId("studio-view-explore").click();
    await expect(page.getByTestId("studio-view-explore")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("studio-browse")).toHaveCount(0);
    await expectActiveStudy(page, "traverse", "Traverse");
    await expect(studio.status(page)).toHaveText("Explore view");
    await studio.coverflow(page).focus();
    await page.keyboard.press("ArrowRight");
    await expectActiveStudy(page, "fold", "Fold");

    await page.getByTestId("studio-view-compare").click();
    await expect(studio.deck(page)).toHaveAttribute("data-active-id", "fold");
    expect(await trayNames(page)).toEqual(["Fold", "Arc", "Relay", "Traverse"]);
    await page.getByTestId("studio-deck-next").click();
    await expect(studio.deck(page)).toHaveAttribute("data-active-id", "arc");

    // Back in Browse nothing was lost, and the Grid is on the page that holds the active study.
    await page.getByTestId("studio-view-browse").click();
    await expect(studio.tile(page, "arc")).toHaveAttribute("aria-current", "true");
    await expect(studio.tile(page, "traverse")).toHaveAttribute("data-compared", "true");
    await expect(studio.summary(page)).toHaveText("12 studies · 4 in comparison");
  });

  test("the active study and its actions are present in every view", async ({ page }) => {
    await openStudio(page, { width: 390, height: 844 });
    for (const view of ["browse", "explore", "compare"]) {
      await page.getByTestId(`studio-view-${view}`).click();
      await expect(page.getByTestId("studio-inspector")).toBeVisible();
      await expect(page.getByTestId("studio-toggle-compare")).toBeVisible();
      await expect(page.getByTestId("studio-inspect")).toBeVisible();
    }
  });

  test("Compare keeps its states when the comparison is emptied and refilled", async ({ page }) => {
    await openStudio(page, { width: 390, height: 844 });
    await page.getByTestId("studio-view-compare").click();
    for (const id of ["arc", "relay", "fold"])
      await page.getByTestId(`studio-remove-${id}`).click();
    await expect(page.getByTestId("studio-compare-empty")).toBeVisible();
    await page.getByRole("button", { name: "Browse the collection" }).click();
    await expect(page.getByTestId("studio-view-browse")).toHaveAttribute("aria-pressed", "true");
    await expect(studio.grid(page)).toBeFocused();
    await studio.tile(page, "orbit").click();
    await page.getByTestId("studio-toggle-compare").click();
    await page.getByTestId("studio-view-compare").click();
    await expect(page.getByTestId("studio-compare-single")).toBeVisible();
  });

  test("a surface settling while the view changes does not lose the selection", async ({
    page,
  }) => {
    await openStudio(page, { width: 390, height: 844, reducedMotion: "no-preference" });
    await page.getByTestId("studio-view-explore").click();
    await expect(studio.coverflow(page)).toHaveAttribute("data-phase", "idle");
    await page.getByTestId("studio-coverflow-next").click();
    await page.getByTestId("studio-coverflow-next").click();
    // The rail is still travelling when the visitor leaves.
    await page.getByTestId("studio-view-browse").click();
    await expect(studio.tile(page, "drift")).toHaveAttribute("aria-current", "true");
    await page.getByTestId("studio-view-explore").click();
    await expectActiveStudy(page, "drift", "Drift");
  });
});

test.describe("interruption", () => {
  test("a Coverflow gesture can be caught and reversed, and the workspace follows its last intent", async ({
    page,
  }) => {
    await openStudio(page, { reducedMotion: "no-preference" });
    const coverflow = studio.coverflow(page);
    await studio.tile(page, "orbit").click();
    await expectActiveStudy(page, "orbit", "Orbit");
    // Send the rail to Relay, catch it while it travels, and drag it back the other way.
    await studio.tile(page, "relay").click();
    await expect(coverflow).not.toHaveAttribute("data-phase", "idle");
    await dragMouseBy(page, coverflow, 160, 0, { steps: 6, stepDelay: 12 });
    await expect(coverflow).toHaveAttribute("data-phase", "idle", { timeout: 10_000 });
    // Whichever study the rail settled on, every surface agrees on it.
    const settled = (await coverflow.getAttribute("data-active-id"))!;
    await expect(
      page.locator('[data-testid^="studio-tile-"][aria-current="true"]'),
    ).toHaveAttribute("data-study-id", settled);
    await expect(studio.inspector(page)).toBeVisible();
    await expect(studio.tile(page, settled)).toHaveAttribute("aria-current", "true");
  });

  test("rapid selections end on the last one on every surface", async ({ page }) => {
    await openStudio(page, { reducedMotion: "no-preference" });
    for (const id of ["orbit", "relay", "traverse", "fold", "orbit", "relay"])
      await studio.tile(page, id).click({ delay: 0 });
    await expectActiveStudy(page, "relay", "Relay");
    await expect(studio.deck(page)).toHaveAttribute("data-active-id", "relay");
    await expect(studio.tile(page, "relay")).toHaveAttribute("aria-current", "true");
  });

  test("changing the preset while a surface is moving keeps it responsive", async ({ page }) => {
    await openStudio(page, { reducedMotion: "no-preference" });
    await studio.tile(page, "orbit").click();
    await section(page, "studio").getByTestId("preset-heavy").click();
    await expectEveryBarShows(page, "heavy");
    await expect(studio.coverflow(page)).toHaveAttribute("data-active-id", "orbit");
    await expect(studio.coverflow(page)).toHaveAttribute("data-phase", "idle", { timeout: 10_000 });
    await studio.tile(page, "relay").click();
    await expectActiveStudy(page, "relay", "Relay");
  });

  test("a Deck exchange and a removal can interleave", async ({ page }) => {
    await openStudio(page, { reducedMotion: "no-preference" });
    await page.getByTestId("studio-deck-next").click();
    await page.getByTestId("studio-remove-relay").click();
    await expect(studio.deck(page)).toHaveAttribute("data-phase", "idle", { timeout: 10_000 });
    expect(await trayNames(page)).toEqual(["Fold", "Arc"]);
    const current = await deckCardName(page);
    expect(["Fold", "Arc"]).toContain(current);
  });
});

test.describe("document-level listeners", () => {
  test("activating the Studio and cycling its overlays leave no listener behind", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "Listener inventories use the Chromium protocol.");
    await openStudio(page);
    const client = await page.context().newCDPSession(page);

    async function inventory() {
      const result: Record<string, Record<string, number>> = {};
      for (const target of ["window", "document", "document.documentElement", "document.body"]) {
        const { result: handle } = await client.send("Runtime.evaluate", { expression: target });
        const { listeners } = await client.send("DOMDebugger.getEventListeners", {
          objectId: handle.objectId!,
        });
        const byType: Record<string, number> = {};
        for (const { type } of listeners) byType[type] = (byType[type] ?? 0) + 1;
        result[target] = byType;
      }
      return result;
    }

    async function cycle() {
      await page.getByTestId("studio-inspect").click();
      await expectGalleryOpen(page, "Fold — Study plate");
      await page.keyboard.press("Escape");
      await expectGalleryClosed(page);
      await page.getByTestId("studio-details").click();
      await expect(studio.sheet(page)).toBeVisible();
      await page.getByTestId("studio-sheet-plate-timing").click();
      await expectGalleryOpen(page, "Fold — Timing");
      await page.keyboard.press("Escape");
      await expectGalleryClosed(page);
      await studio.tile(page, "orbit").click();
      await page.getByTestId("studio-toggle-compare").click();
      await page.getByTestId("studio-toggle-compare").click();
      await studio.tile(page, "fold").click();
      await page.getByTestId("studio-density-compact").click();
      await page.getByTestId("studio-density-comfortable").click();
      await section(page, "studio").getByTestId("preset-heavy").click();
      await section(page, "studio").getByTestId("preset-balanced").click();
    }

    async function settledInventory() {
      let previous = JSON.stringify(await inventory());
      for (let attempt = 0; attempt < 20; attempt += 1) {
        await page.evaluate(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
            ),
        );
        const next = JSON.stringify(await inventory());
        if (next === previous) return JSON.parse(next) as Awaited<ReturnType<typeof inventory>>;
        previous = next;
      }
      throw new Error("The page's document-level listeners never settled.");
    }

    await cycle();
    const before = await settledInventory();
    expect(before.document?.focus ?? 0).toBe(0);
    for (let run = 0; run < 3; run += 1) await cycle();
    expect(await settledInventory()).toEqual(before);
    expect(await focusedTestId(page)).not.toBeNull();
  });
});
