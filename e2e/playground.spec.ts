import { expect, test, type Page } from "@playwright/test";

import { playgroundSections } from "../apps/lab/src/playground/sections";
import { MOTION_PRESETS } from "../packages/core/src/index";
import {
  dragMouseBy,
  dragSyntheticPointerBy,
  expectCarouselAt,
  expectSheetOpenAt,
} from "./helpers";
import {
  duplicateIds,
  editor,
  expectEveryBarShows,
  expectedFieldValues,
  field,
  openEditor,
  openPlayground,
  presetNames,
  scrollY,
  section,
  sectionIds,
  tuningState,
} from "./playgroundHelpers";

const collectedErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  collectedErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    // A controller that rejects a configuration throws inside a Vue watcher, which Vue reports as a
    // warning before the patch that follows fails.
    if (message.type() === "error" || /\[Vue warn\]/.test(message.text()))
      errors.push(`${message.type()}: ${message.text()}`);
  });
});

test.afterEach(async ({ page }) => {
  expect(collectedErrors.get(page) ?? []).toEqual([]);
});

test.describe("public Playground page", () => {
  test("uses original public screens with the established identities in both surfaces", async ({
    page,
  }) => {
    await openPlayground(page);
    const publicSources: string[][] = [];
    for (const testid of ["coverflow-viewport", "stacked-deck-viewport"]) {
      const images = page.getByTestId(testid).locator("img");
      await expect(images).toHaveCount(5);
      await expect
        .poll(() =>
          images.evaluateAll((nodes) =>
            nodes.every((node) => (node as HTMLImageElement).naturalWidth > 0),
          ),
        )
        .toBe(true);
      publicSources.push(
        await images.evaluateAll((nodes) =>
          nodes.map((node) => (node as HTMLImageElement).currentSrc),
        ),
      );
    }
    expect(new Set(publicSources[0]).size).toBe(5);
    expect(publicSources[1]).toEqual(publicSources[0]);
    for (const source of publicSources[0]!) {
      const asset = await page.request.get(source);
      expect(asset.ok()).toBe(true);
      const svg = await asset.text();
      expect(svg).toContain("SNAP MOTION");
      expect(svg).not.toMatch(/Yoot|Portaal|Project 24031|Werkruimte|Standaard project/i);
    }
    await expect(page.locator("body")).not.toContainText(/Yoot|Portaal|Project 24031|Werkruimte/);
    for (const [id, title] of [
      ["templates", "Collection library"],
      ["project", "Sequence editor"],
      ["map", "Motion atlas"],
      ["team", "Signal monitor"],
      ["settings", "Surface settings"],
    ]) {
      await section(page, "coverflow")
        .getByRole("button", { name: new RegExp(`^${title},`) })
        .click();
      await expectCarouselAt(page.getByTestId("coverflow-viewport"), id!);
      await expect(page.getByTestId("coverflow-caption")).toHaveText(title!);
    }
    for (const [id, title] of [
      ["team", "Signal monitor"],
      ["settings", "Surface settings"],
      ["templates", "Collection library"],
      ["project", "Sequence editor"],
      ["map", "Motion atlas"],
    ]) {
      await page.getByTestId("stacked-deck-next").click();
      await expectCarouselAt(page.getByTestId("stacked-deck-viewport"), id!);
      await expect(page.getByTestId("stacked-deck-caption")).toHaveText(title!);
    }
  });

  test("the Lab keeps its Yoot screens and screen inspection assets", async ({ page }) => {
    await page.goto("./?demo=coverflow&view=showcase");
    await expect(page.getByTestId("coverflow-viewport")).toContainText(
      "Yoot Project Structuur V2.1",
    );
    await expect(page.getByTestId("coverflow-caption")).toHaveText("Locatie & planning");
    await page.goto("./?demo=stacked-deck&view=showcase");
    await expect(page.getByTestId("stacked-deck-caption")).toHaveText("Locatie & planning");
    const sources = await page
      .getByTestId("stacked-deck-viewport")
      .locator("img")
      .evaluateAll((images) => images.map((image) => (image as HTMLImageElement).src));
    expect(sources).toHaveLength(5);
    for (const source of sources) {
      const response = await page.request.get(source);
      expect(response.ok()).toBe(true);
      const svg = await response.text();
      expect(svg).toContain(">Y</text>");
      expect(svg).not.toContain("SNAP MOTION");
    }
  });

  test("is served at /playground/ with one page heading and ordered sections", async ({ page }) => {
    await openPlayground(page);

    await expect(page).toHaveTitle("Snap Motion Playground");
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.getByRole("banner")).toHaveCount(1);
    await expect(page.getByRole("main")).toHaveCount(1);
    await expect(page.getByRole("contentinfo")).toHaveCount(1);

    const titles = await page.getByRole("heading", { level: 2 }).allTextContents();
    expect(titles).toEqual([...playgroundSections.map(({ title }) => title), "Under the hood"]);

    const nav = page.getByRole("navigation", { name: "Playground sections" });
    await expect(nav.getByRole("link")).toHaveCount(5);
    for (const [index, { id }] of playgroundSections.entries()) {
      await expect(nav.getByRole("link").nth(index)).toHaveAttribute("href", `#${id}`);
      await expect(section(page, id)).toHaveCount(1);
    }
  });

  test("redirects /playground to the directory entry instead of falling through to the Lab", async ({
    page,
  }) => {
    await page.goto("./playground");
    expect(new URL(page.url()).pathname).toMatch(/\/playground\/$/);
    await expect(page).toHaveTitle("Snap Motion Playground");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  for (const { id } of playgroundSections) {
    test(`a cold deep link to #${id} lands on that section`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(`./playground/#${id}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByTestId("coverflow-viewport")).toHaveAttribute("data-phase", "idle");
      await expect
        .poll(async () =>
          section(page, id).evaluate((element) => Math.round(element.getBoundingClientRect().top)),
        )
        .toBeLessThan(120);
      expect(
        await section(page, id).evaluate((element) => element.getBoundingClientRect().top),
      ).toBeGreaterThanOrEqual(-2);
      await expect(page.getByTestId("section-menu-toggle")).toContainText(
        playgroundSections.find((entry) => entry.id === id)!.title,
      );
    });
  }

  test("leaves the engineering Lab at its root with its query URLs", async ({ page }) => {
    await page.goto("./");
    await expect(page.locator(".lab-app")).toBeVisible();
    await expect(page.locator("#panel-coverflow")).toBeVisible();

    await page.goto("./?demo=sheet&view=workbench");
    await expect(page.locator("#panel-sheet")).toBeVisible();
    await expect(page.getByText("Advanced physics", { exact: true })).toBeVisible();

    await page.goto("./?view=fixtures");
    await expect(page.locator("#panel-defaults")).toBeVisible();
  });

  test("renders the five real surfaces without Lab-only chrome", async ({ page }) => {
    await openPlayground(page);

    await expect(section(page, "coverflow").getByTestId("coverflow-viewport")).toBeVisible();
    await expect(section(page, "stacked-deck").getByTestId("stacked-deck-viewport")).toBeVisible();
    await expect(section(page, "paged-grid").getByTestId("paged-grid")).toBeVisible();
    await expect(
      section(page, "gallery").locator("button[data-testid^='media-thumbnail-']"),
    ).toHaveCount(6);
    await expect(section(page, "sheet").getByTestId("open-sheet")).toBeVisible();

    // Telemetry, test rails and non-functional controls belong to the Lab.
    await expect(page.getByTestId("diagnostics")).toHaveCount(0);
    await expect(page.getByTestId("media-test-rail")).toHaveCount(0);
    await expect(page.locator("[data-testid^='slide-action-']")).toHaveCount(0);
    await expect(page.getByTestId("caption-action")).toHaveCount(0);
    await expect(section(page, "paged-grid").getByRole("button", { name: "Inspect" })).toHaveCount(
      0,
    );
    await expect(page.getByTestId("stacked-deck-two-items")).toHaveCount(0);
  });

  test("gives every section a secondary Workbench path that is not required to tune", async ({
    page,
  }) => {
    await openPlayground(page);
    for (const { id, workbench, title } of playgroundSections) {
      const link = section(page, id).getByRole("link", {
        name: `Inspect ${title} in the Workbench`,
      });
      await expect(link).toHaveAttribute(
        "href",
        new RegExp(`\\?demo=${workbench}&view=workbench$`),
      );
    }
    await section(page, "paged-grid")
      .getByRole("link", { name: /Workbench/ })
      .click();
    await expect(page.locator("#panel-grid")).toBeVisible();
    await expect(page.getByText("Advanced physics", { exact: true })).toBeVisible();
  });
});

test.describe("live surfaces", () => {
  test("the public collection retains study identities when items and geometry change", async ({
    page,
  }) => {
    await openPlayground(page);
    const collection = section(page, "paged-grid");
    const first = collection.locator('[data-item-id="item-1"]');
    await expect(first).toContainText("Orbit");
    await page.getByTestId("grid-rows").fill("3");
    await page.getByTestId("grid-columns").fill("3");
    await page.getByTestId("grid-gap").fill("8");
    await expect(page.getByTestId("paged-grid")).toHaveAttribute("data-page-count", "1");
    await page.getByTestId("add-grid-item").click();
    await expect(page.getByTestId("paged-grid")).toHaveAttribute("data-page-count", "2");
    await expect(first).toContainText("Orbit");
    await page.getByTestId("grid-next").click();
    await expectCarouselAt(page.getByTestId("paged-grid"), "page-2");
    await expect(collection.locator('[data-item-id="item-10"]')).toContainText("Orbit");
    await page.getByTestId("remove-grid-item").click();
    await expectCarouselAt(page.getByTestId("paged-grid"), "page-1");
    await expect(collection.locator('[data-item-id="item-10"]')).toHaveCount(0);
    await expect(first).toContainText("Orbit");
  });

  test("Grid studies adapt to allocated cell width and keep their full accessible names", async ({
    page,
  }) => {
    await openPlayground(page);
    await page.getByTestId("grid-rows").fill("1");
    await page.getByTestId("grid-columns").fill("3");
    const cells = section(page, "paged-grid").locator(".grid-item");
    // Fixed content-box boundary probes on real Grid cells, independent of the viewport.
    for (const [index, width] of [95, 96, 97].entries()) {
      const cell = cells.nth(index);
      await cell.evaluate((element, value) => {
        (element as HTMLElement).style.width = `${value}px`;
      }, width);
      expect(await cell.evaluate((element) => element.clientWidth)).toBe(width);
      if (width < 96) await expect(cell.locator(".study-kind")).not.toBeVisible();
      else await expect(cell.locator(".study-kind")).toBeVisible();
    }
    await expect(cells.nth(1).getByText("Traverse", { exact: true })).toHaveText("Traverse");
    // The Sheet placement has no Grid query owner and keeps its complete presentation.
    await expect(section(page, "sheet").locator(".study-kind").first()).toBeVisible();

    await page.setViewportSize({ width: 320, height: 844 });
    await cells.evaluateAll((elements) => {
      for (const element of elements) (element as HTMLElement).style.removeProperty("width");
    });
    await page.getByTestId("grid-rows").fill("3");
    await page.getByTestId("grid-columns").fill("4");
    await expect(cells).toHaveCount(9);
    const escaped = await cells.evaluateAll(
      (elements) =>
        elements.flatMap((element) => {
          const bounds = element.getBoundingClientRect();
          return [...element.querySelectorAll(".study-reference, svg, strong")].filter((child) => {
            const box = child.getBoundingClientRect();
            return (
              box.left < bounds.left - 1 ||
              box.right > bounds.right + 1 ||
              box.bottom > bounds.bottom + 1
            );
          });
        }).length,
    );
    expect(escaped).toBe(0);
    await expect(cells.nth(1).getByText("Traverse", { exact: true })).toBeVisible();
  });

  test("public Sheet content works on all four edges with both snap policies", async ({ page }) => {
    await openPlayground(page);
    const dialog = page.getByTestId("sheet");
    const opener = page.getByTestId("open-sheet");
    for (const [side, mode] of [
      ["bottom", "tall"],
      ["left", "short"],
      ["right", "prose"],
      ["top", "tall"],
    ] as const) {
      await page.getByTestId(`sheet-side-${side}`).click();
      await page.getByTestId(`sheet-content-${mode}`).click();
      await page
        .getByTestId(`sheet-snap-${side === "top" || side === "left" ? "custom" : "default"}`)
        .click();
      await opener.click();
      await expectSheetOpenAt(dialog, side === "left" || side === "right" ? "open" : "comfortable");
      await expect(dialog).toHaveAttribute("data-sheet-side", side);
      await expect(dialog.locator(`[data-content-mode="${mode}"]`)).toBeVisible();
      if (mode === "tall") {
        await expect(dialog.getByRole("heading", { level: 3 })).toHaveCount(8);
        const body = dialog.locator(".snap-motion-sheet-body");
        expect(await body.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
        await body.evaluate((node) => {
          node.scrollTop = node.scrollHeight;
        });
        await expect(dialog.getByTestId("final-note-row")).toBeInViewport();
      } else if (mode === "short") {
        const body = dialog.locator(".snap-motion-sheet-body");
        expect(
          await body.evaluate((node) => node.scrollHeight - node.clientHeight),
        ).toBeLessThanOrEqual(1);
      }
      await page.keyboard.press("Escape");
      await expect(dialog).not.toBeVisible();
      await expect(opener).toBeFocused();
    }
  });

  test("every surface responds and keeps its own state", async ({ page }) => {
    await openPlayground(page);

    await section(page, "coverflow").getByTestId("coverflow-next").click();
    await section(page, "coverflow").getByTestId("coverflow-next").click();
    await expectCarouselAt(page.getByTestId("coverflow-viewport"), "settings");

    await section(page, "stacked-deck").getByTestId("stacked-deck-next").click();
    await expectCarouselAt(page.getByTestId("stacked-deck-viewport"), "team");

    const grid = page.getByTestId("paged-grid");
    await grid.focus();
    await page.keyboard.press("ArrowRight");
    await expectCarouselAt(grid, "page-2");

    // Each surface kept the position it was driven to; none was moved by another.
    await expectCarouselAt(page.getByTestId("coverflow-viewport"), "settings");
    await expectCarouselAt(page.getByTestId("stacked-deck-viewport"), "team");
    await expect(page.getByTestId("media-lightbox")).not.toBeVisible();
    await expect(page.getByTestId("sheet")).not.toBeVisible();
  });

  test("a pointer drag moves only the surface it started on", async ({ page }) => {
    await openPlayground(page);
    const coverflow = page.getByTestId("coverflow-viewport");
    await dragMouseBy(page, coverflow, -420, 0, { steps: 12 });
    await expect(coverflow).toHaveAttribute("data-phase", "idle");
    expect(await coverflow.getAttribute("data-active-id")).not.toBe("map");

    await expectCarouselAt(page.getByTestId("stacked-deck-viewport"), "map");
    await expect(page.getByTestId("paged-grid")).toHaveAttribute("data-active-id", "page-1");
    await expect(page.getByTestId("media-lightbox")).not.toBeVisible();

    const deck = page.getByTestId("stacked-deck-viewport");
    await dragMouseBy(page, deck, -260, 0, { steps: 12 });
    await expect(deck).toHaveAttribute("data-phase", "idle");
    await expect(page.getByTestId("paged-grid")).toHaveAttribute("data-active-id", "page-1");
  });

  test("a surface's Inspect control opens its own gallery and returns focus", async ({ page }) => {
    await openPlayground(page);
    for (const [id, testid] of [
      ["coverflow", "coverflow-inspect"],
      ["stacked-deck", "stacked-deck-inspect"],
    ] as const) {
      const inspect = section(page, id).getByTestId(testid);
      await inspect.scrollIntoViewIfNeeded();
      await expect(inspect).toBeEnabled();
      await inspect.click();
      const dialog = section(page, id).locator("dialog[open]");
      await expect(dialog).toBeVisible();
      expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(
        true,
      );
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(inspect).toBeFocused();
    }
  });

  test("modals do not touch history and closed galleries load no full images", async ({ page }) => {
    await openPlayground(page);
    const history = () => page.evaluate(() => window.history.length);
    const start = await history();
    // Closed dialogs hold no media: images appear only when a gallery opens.
    await expect(page.locator("dialog img")).toHaveCount(0);

    await page.getByTestId("open-lightbox").scrollIntoViewIfNeeded();
    await page.getByTestId("open-lightbox").click();
    await expect(page.getByTestId("media-lightbox")).toBeVisible();
    expect(await page.locator("dialog[open] img").count()).toBeGreaterThan(0);
    await page.keyboard.press("Escape");
    await page.getByTestId("open-sheet").scrollIntoViewIfNeeded();
    await page.getByTestId("open-sheet").click();
    await expectSheetOpenAt(page.getByTestId("sheet"), "comfortable");
    await page.keyboard.press("Escape");

    expect(await history()).toBe(start);
    await expect(page.locator("dialog img")).toHaveCount(0);
  });

  test("arrow keys move only the surface that owns focus", async ({ page }) => {
    await openPlayground(page);

    await page.getByTestId("coverflow-viewport").focus();
    await page.keyboard.press("ArrowRight");
    await expectCarouselAt(page.getByTestId("coverflow-viewport"), "team");
    await expectCarouselAt(page.getByTestId("stacked-deck-viewport"), "map");
    await expect(page.getByTestId("paged-grid")).toHaveAttribute("data-active-id", "page-1");

    await page.getByTestId("stacked-deck-viewport").focus();
    await page.keyboard.press("ArrowLeft");
    await expectCarouselAt(page.getByTestId("stacked-deck-viewport"), "project");
    await expectCarouselAt(page.getByTestId("coverflow-viewport"), "team");
  });

  test("Stacked Deck switches between Shuffle and Direct and keeps exchanging", async ({
    page,
  }) => {
    await openPlayground(page);
    const shuffle = page.getByTestId("stacked-deck-exchange-shuffle");
    const direct = page.getByTestId("stacked-deck-exchange-direct");
    await expect(shuffle).toHaveAttribute("aria-pressed", "true");
    await expect(direct).toHaveAttribute("aria-pressed", "false");

    await direct.click();
    await expect(direct).toHaveAttribute("aria-pressed", "true");
    await expect(shuffle).toHaveAttribute("aria-pressed", "false");
    await expect(section(page, "stacked-deck")).toContainText("stays attached to the point");

    await page.getByTestId("stacked-deck-next").click();
    await expectCarouselAt(page.getByTestId("stacked-deck-viewport"), "team");
  });

  test("Paged Grid re-measures around rows, columns, gap and item count", async ({ page }) => {
    await openPlayground(page);
    const grid = page.getByTestId("paged-grid");
    await expect(grid).toHaveAttribute("data-page-count", "3");

    await page.getByTestId("grid-rows").fill("1");
    await page.getByTestId("grid-columns").fill("3");
    await expect(grid).toHaveAttribute("data-rows", "1");
    await expect(grid).toHaveAttribute("data-columns", "3");
    await expect(grid).toHaveAttribute("data-page-count", "3");

    await page.getByTestId("add-grid-item").click();
    await expect(section(page, "paged-grid")).toContainText("10 items");
    await expect(grid).toHaveAttribute("data-page-count", "4");
    await expect(grid).toHaveAttribute("data-phase", "idle");
  });

  test("Gallery opens from a thumbnail, contains focus and returns it", async ({ page }) => {
    await openPlayground(page);
    const thumbnail = page.getByTestId("media-thumbnail-long-range");
    await thumbnail.scrollIntoViewIfNeeded();
    const before = await scrollY(page);

    await thumbnail.click();
    const dialog = page.getByTestId("media-lightbox");
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("data-open-state", "open");
    await expectCarouselAt(page.getByTestId("media-carousel"), "long-range");
    await expect(page.getByTestId("media-title")).toHaveText("Long range");
    await expect(page.getByTestId("media-count")).toHaveText("2 / 6");
    await expect(page.getByTestId("close-lightbox")).toBeFocused();

    // Tab stays inside the modal; the page behind it is inert.
    for (let press = 0; press < 14; press += 1) {
      await page.keyboard.press("Tab");
      expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(
        true,
      );
    }
    // Wheel over a modal does not scroll the page behind it.
    await dialog.hover();
    await page.mouse.wheel(0, 600);
    expect(await scrollY(page)).toBe(before);

    await page.getByTestId("media-next").click();
    await expectCarouselAt(page.getByTestId("media-carousel"), "moon-over-ridges");
    await expect(page.getByTestId("media-count")).toHaveText("3 / 6");

    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    // Focus returns to the control that opened it, and the page is where the visitor left it.
    await expect(thumbnail).toBeFocused();
    expect(Math.abs((await scrollY(page)) - before)).toBeLessThanOrEqual(2);
  });

  test("Gallery decodes every plate", async ({ page }) => {
    await openPlayground(page);
    await page.getByTestId("open-lightbox").scrollIntoViewIfNeeded();
    await page.getByTestId("open-lightbox").click();
    const carousel = page.getByTestId("media-carousel");
    const ids = await page
      .locator("[data-testid^='media-thumbnail-image-']")
      .evaluateAll((images) =>
        images.map((image) =>
          image.getAttribute("data-testid")!.replace("media-thumbnail-image-", ""),
        ),
      );
    expect(ids).toHaveLength(6);
    for (const [index, id] of ids.entries()) {
      if (index > 0) await page.getByTestId("media-next").click();
      await expectCarouselAt(carousel, id);
      await expect(page.getByTestId(`media-frame-${id}`)).toHaveAttribute(
        "data-media-state",
        "loaded",
      );
      const natural = await page
        .getByTestId(`media-image-${id}`)
        .evaluate((image: HTMLImageElement) => image.naturalWidth);
      expect(natural).toBeGreaterThan(0);
    }
  });

  test("Sheet opens on its chosen side, keeps the page still and returns focus", async ({
    page,
  }) => {
    await openPlayground(page);
    const opener = page.getByTestId("open-sheet");
    await opener.scrollIntoViewIfNeeded();
    const before = await scrollY(page);

    await expect(opener).toHaveText("Open bottom sheet");
    await opener.click();
    const dialog = page.getByTestId("sheet");
    await expectSheetOpenAt(dialog, "comfortable");
    await dialog.hover();
    await page.mouse.wheel(0, 600);
    expect(await scrollY(page)).toBe(before);
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(opener).toBeFocused();
    expect(Math.abs((await scrollY(page)) - before)).toBeLessThanOrEqual(2);

    await page.getByTestId("sheet-side-left").click();
    await expect(page.getByTestId("sheet-side-left")).toHaveAttribute("aria-pressed", "true");
    await expect(opener).toHaveText("Open left sheet");
    await opener.click();
    await expectSheetOpenAt(dialog, "open");
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
  });

  test("a held drag on the Grid edge follows the shared elasticity from any section", async ({
    page,
  }) => {
    await openPlayground(page);
    const grid = page.getByTestId("paged-grid");

    async function heldOverdrag(): Promise<number> {
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
            .locator(".page-track")
            .evaluate((track) => new DOMMatrix(getComputedStyle(track).transform).m41);
        },
        steps: 8,
      });
      await expectCarouselAt(grid, "page-1");
      return held;
    }

    const balanced = await heldOverdrag();
    expect(balanced).toBeGreaterThan(8);

    // The edit is made in the Sheet section's editor, not next to the Grid.
    await openEditor(page, "sheet");
    await field(page, "Elastic limit").fill("0");
    await field(page, "Elastic limit").blur();
    await expect(tuningState(page, "paged-grid")).toHaveText("Modified (1)");
    expect(await heldOverdrag()).toBe(0);

    await section(page, "paged-grid").getByTestId("preset-loose").click();
    await expectEveryBarShows(page, "loose");
    expect(await heldOverdrag()).toBeGreaterThan(balanced);
  });
});

test.describe("shared Motion Tuning", () => {
  test("collapsed tuning exposes presets and Customize without repeating editor detail", async ({
    page,
  }) => {
    await openPlayground(page);
    for (const id of sectionIds) {
      const bar = section(page, id).getByRole("group", { name: "Motion tuning", exact: true });
      await expect(bar.getByRole("button", { name: "Customize", exact: true })).toBeVisible();
      await expect(bar.getByRole("button", { name: "Balanced", exact: true })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await expect(bar).not.toContainText(
        /Stiffness|Between Tight and Loose|Shared by all five surfaces/,
      );
    }
    await openEditor(page, "sheet");
    await expect(editor(page)).toContainText("Between Tight and Loose");
    await field(page, "Mass").fill("1.1");
    for (const id of sectionIds) {
      await expect(tuningState(page, id)).toBeVisible();
      await expect(section(page, id).getByTestId("tuning-reset")).toBeVisible();
    }
  });
  test("every section shows the same preset and a preset change reaches them all", async ({
    page,
  }) => {
    await openPlayground(page);
    await expectEveryBarShows(page, "balanced");

    for (const name of presetNames) {
      // Click in a different section each time: any bar is a valid entry point.
      const entry = sectionIds[presetNames.indexOf(name) % sectionIds.length]!;
      await section(page, entry).getByTestId(`preset-${name}`).click();
      await expectEveryBarShows(page, name);
      for (const id of sectionIds) {
        for (const other of presetNames) {
          await expect(section(page, id).getByTestId(`preset-${other}`)).toHaveAttribute(
            "aria-pressed",
            String(other === name),
          );
        }
      }
    }
  });

  test("the editor shows exactly the selected preset's engine values", async ({ page }) => {
    await openPlayground(page);
    await openEditor(page, "coverflow");
    for (const name of presetNames) {
      await section(page, "coverflow").getByTestId(`preset-${name}`).click();
      for (const [label, value] of Object.entries(expectedFieldValues(name))) {
        await expect(field(page, label)).toHaveValue(String(value));
      }
    }
    // Tight stays the package default; Balanced stays the lab's starting choice.
    expect(MOTION_PRESETS.tight.spring.stiffness).toBe(520);
  });

  test("only one detailed editor exists, and each section keeps its own entry point", async ({
    page,
  }) => {
    await openPlayground(page);
    await expect(editor(page)).toHaveCount(0);

    for (const id of ["coverflow", "paged-grid", "gallery"]) {
      await openEditor(page, id);
      await expect(editor(page)).toHaveCount(1);
      await expect(section(page, id).getByTestId("tuning-panel")).toHaveCount(1);
      for (const other of sectionIds.filter((candidate) => candidate !== id)) {
        await expect(section(page, other).getByTestId("tuning-customize")).toHaveAttribute(
          "aria-expanded",
          "false",
        );
      }
    }

    await section(page, "gallery").getByTestId("tuning-customize").click();
    await expect(editor(page)).toHaveCount(0);
  });

  test("Close editor returns focus to Customize", async ({ page }) => {
    await openPlayground(page);
    await openEditor(page, "stacked-deck");
    await editor(page).getByRole("button", { name: "Close editor" }).click();
    await expect(editor(page)).toHaveCount(0);
    await expect(section(page, "stacked-deck").getByTestId("tuning-customize")).toBeFocused();
  });

  test("edits mark every section Modified, Reset restores exactly, and a preset replaces edits", async ({
    page,
  }) => {
    await openPlayground(page);
    for (const id of sectionIds)
      await expect(section(page, id).getByTestId("tuning-reset")).toBeDisabled();

    await openEditor(page, "coverflow");
    await field(page, "Stiffness").fill("500");
    await field(page, "Damping").fill("30");
    await expectEveryBarShows(page, "balanced", 2);
    for (const id of sectionIds)
      await expect(section(page, id).getByTestId("tuning-reset")).toBeEnabled();

    await section(page, "sheet").getByTestId("tuning-reset").click();
    await expectEveryBarShows(page, "balanced");
    await expect(field(page, "Stiffness")).toHaveValue("400");
    await expect(field(page, "Damping")).toHaveValue("36");

    await field(page, "Mass").fill("2");
    await expectEveryBarShows(page, "balanced", 1);
    await section(page, "gallery").getByTestId("preset-heavy").click();
    await expectEveryBarShows(page, "heavy");
    await expect(field(page, "Mass")).toHaveValue(String(MOTION_PRESETS.heavy.spring.mass));
  });

  test("numeric entry validates, bounds, discards and reflects a slider", async ({ page }) => {
    await openPlayground(page);
    await openEditor(page, "coverflow");
    const stiffness = field(page, "Stiffness");
    const slider = editor(page).getByRole("slider", { name: "Stiffness slider", exact: true });

    await stiffness.fill("");
    await expect(page.getByTestId("physics-error-stiffness")).toBeVisible();
    await expect(tuningState(page, "coverflow")).toHaveText("Preset");

    await stiffness.fill("99999");
    await expect(page.getByTestId("physics-error-stiffness")).toBeVisible();
    await stiffness.blur();
    await expect(stiffness).toHaveValue("900");
    await expect(slider).toHaveValue("900");
    await expect(tuningState(page, "coverflow")).toHaveText("Modified (1)");

    await stiffness.fill("12");
    await stiffness.press("Escape");
    await expect(stiffness).toHaveValue("900");

    await slider.focus();
    await slider.press("Home");
    await expect(stiffness).toHaveValue("50");
    await expect(slider).toHaveValue("50");

    // Integer-only field: a fractional skip is never accepted.
    const skip = field(page, "Maximum skip");
    await skip.fill("2.5");
    await expect(page.getByTestId("physics-error-maxAnchorSkip")).toBeVisible();
    await skip.blur();
    await expect(skip).toHaveValue("2");
  });

  test("Stacked Deck's fixed skip is explained while the stored value stays shared", async ({
    page,
  }) => {
    await openPlayground(page);
    await openEditor(page, "coverflow");
    await field(page, "Maximum skip").fill("3");
    await field(page, "Maximum skip").blur();
    await expectEveryBarShows(page, "balanced", 1);

    await openEditor(page, "stacked-deck");
    const skip = field(page, "Maximum skip");
    await expect(skip).toBeDisabled();
    await expect(skip).toHaveValue("1");
    await expect(page.getByTestId("physics-note-maxAnchorSkip")).toContainText("Fixed at 1");
    await expect(page.getByTestId("physics-note-maxAnchorSkip")).toContainText("Stored value: 3");
    await expect(editor(page).getByRole("slider", { name: "Maximum skip slider" })).toHaveCount(0);

    // Another surface still reads and edits the stored value.
    await openEditor(page, "paged-grid");
    await expect(field(page, "Maximum skip")).toBeEnabled();
    await expect(field(page, "Maximum skip")).toHaveValue("3");
  });

  test("live edits reach mounted surfaces without remounting any of them", async ({ page }) => {
    await openPlayground(page);
    const roots = [
      ".coverflow-demo",
      ".stacked-deck-demo",
      ".grid-demo",
      ".media-demo",
      ".sheet-demo",
    ];
    for (const selector of roots) {
      await page.locator(selector).evaluate((element) => {
        (element as HTMLElement).dataset.mountProbe = "original";
      });
    }
    const thumbnails = await page.locator(".media-thumbnail-visual img").elementHandles();

    await section(page, "gallery").getByTestId("preset-loose").click();
    await openEditor(page, "sheet");
    await field(page, "Stiffness").fill("333");
    await section(page, "coverflow").getByTestId("preset-heavy").click();
    await expectEveryBarShows(page, "heavy");

    for (const selector of roots) {
      await expect(page.locator(selector)).toHaveAttribute("data-mount-probe", "original");
    }
    const after = await page.locator(".media-thumbnail-visual img").elementHandles();
    expect(after).toHaveLength(thumbnails.length);
    for (const [index, handle] of thumbnails.entries()) {
      expect(await handle.evaluate((node, other) => node === other, after[index])).toBe(true);
    }
  });

  test("tuning controls keep focus while the configuration changes", async ({ page }) => {
    await openPlayground(page);
    const heavy = section(page, "paged-grid").getByTestId("preset-heavy");
    await heavy.focus();
    await page.keyboard.press("Enter");
    await expectEveryBarShows(page, "heavy");
    await expect(heavy).toBeFocused();

    await openEditor(page, "paged-grid");
    const stiffness = field(page, "Stiffness");
    await stiffness.click();
    await stiffness.press("ControlOrMeta+a");
    await page.keyboard.type("450");
    await expect(stiffness).toBeFocused();
    await expect(tuningState(page, "paged-grid")).toHaveText("Modified (1)");
    await expect(stiffness).toHaveValue("450");
  });
});

test.describe("reduced motion", () => {
  test("a system reduced-motion preference is stated and can be overridden", async ({ page }) => {
    await openPlayground(page, "reduce");
    for (const id of sectionIds)
      await expect(section(page, id).getByRole("note")).toContainText("Reduced motion is on");

    await openEditor(page, "coverflow");
    await expect(page.getByTestId("spring-preview")).toHaveAttribute("data-skipped", "true");
    await expect(page.getByTestId("motion-system")).toHaveAttribute("aria-pressed", "true");

    await section(page, "gallery").getByRole("button", { name: "Play full motion" }).click();
    for (const id of sectionIds) await expect(section(page, id).getByRole("note")).toHaveCount(0);
    await expect(page.getByTestId("motion-full")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("spring-preview")).toHaveAttribute("data-skipped", "false");
    await expect(page.getByTestId("coverflow-viewport")).toHaveAttribute(
      "data-reduced-motion",
      "false",
    );
  });

  test("full motion springs, and Reduced resolves the same target without them", async ({
    page,
  }) => {
    await openPlayground(page, "no-preference");
    for (const id of sectionIds) await expect(section(page, id).getByRole("note")).toHaveCount(0);

    const coverflow = page.getByTestId("coverflow-viewport");
    await expect(coverflow).toHaveAttribute("data-reduced-motion", "false");
    await section(page, "coverflow").getByTestId("coverflow-next").click();
    await expectCarouselAt(coverflow, "team");

    await openEditor(page, "coverflow");
    await page.getByTestId("motion-reduced").click();
    await expect(coverflow).toHaveAttribute("data-reduced-motion", "true");
    for (const id of sectionIds)
      await expect(section(page, id).getByRole("note")).toContainText("Reduced motion is on");
    await section(page, "coverflow").getByTestId("coverflow-next").click();
    await expectCarouselAt(coverflow, "settings");
  });

  test("the spring preview describes the spring and states its limits", async ({ page }) => {
    await openPlayground(page, "no-preference");
    await openEditor(page, "coverflow");
    const readout = page.getByTestId("spring-readout");
    await expect(readout).toContainText(/Settles in \d+\.\d{2} s/);

    await field(page, "Damping").fill("6");
    await expect(readout).toContainText(/Overshoot \d+%/);
    await field(page, "Damping").fill("100");
    await expect(readout).toContainText("No overshoot");
    await expect(page.getByTestId("spring-preview")).toContainText("Release velocity");
  });
});

test.describe("document structure", () => {
  test("jump selection closes native disclosure before its deferred toggle event", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openPlayground(page);
    const nav = page.getByRole("navigation", { name: "Playground sections" });
    // Native disclosure state changes before its queued toggle event reaches Vue. Selecting an
    // anchor in that interval must close the actual disclosure even when the model is still false.
    await nav.evaluate((element) => {
      element.querySelector<HTMLDetailsElement>("details")!.open = true;
      element.querySelector<HTMLAnchorElement>('a[href="#stacked-deck"]')!.click();
    });
    await expect(page).toHaveURL(/#stacked-deck$/);
    await expect(nav.locator("details")).toHaveJSProperty("open", false);
    await expect(nav.getByRole("link")).toHaveCount(0);
    const toggle = page.getByTestId("section-menu-toggle");
    await toggle.press("Enter");
    await expect(nav.getByRole("link")).toHaveCount(5);
    await page.keyboard.press("Escape");
    await expect(toggle).toBeFocused();
    await expect(nav.getByRole("link")).toHaveCount(0);
  });

  for (const width of [320, 375, 390, 430, 768]) {
    test(`named mobile navigation reaches every surface at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await openPlayground(page);
      const toggle = page.getByTestId("section-menu-toggle");
      const nav = page.getByRole("navigation", { name: "Playground sections" });
      await expect(toggle).toHaveAccessibleName(/Jump to a component, current: Coverflow/);
      for (const { id, title } of playgroundSections) {
        await toggle.focus();
        await toggle.press("Enter");
        await expect(nav.getByRole("link")).toHaveCount(5);
        const link = nav.getByRole("link", { name: new RegExp(title) });
        await link.focus();
        await link.press("Enter");
        await expect(page).toHaveURL(new RegExp(`#${id}$`));
        await expect(toggle).toContainText(title);
        await expect(nav.getByRole("link")).toHaveCount(0);
        await expect(section(page, id)).toBeFocused();
      }
      await toggle.focus();
      await toggle.press("Space");
      await expect(nav.getByRole("link")).toHaveCount(5);
      await nav.getByRole("link").first().focus();
      await page.keyboard.press("Escape");
      await expect(toggle).toBeFocused();
      await expect(nav.getByRole("link")).toHaveCount(0);
      await page
        .getByRole("banner")
        .getByRole("link", { name: "Snap Motion", exact: true })
        .click();
      await expect(toggle).toContainText("Coverflow");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      ).toBeLessThanOrEqual(0);
    });
  }

  test("keeps every id unique while editors and modals are open", async ({ page }) => {
    await openPlayground(page);
    expect(await duplicateIds(page)).toEqual([]);

    await openEditor(page, "paged-grid");
    expect(await duplicateIds(page)).toEqual([]);

    await page.getByTestId("open-lightbox").click();
    await expect(page.getByTestId("media-lightbox")).toBeVisible();
    expect(await duplicateIds(page)).toEqual([]);
    await page.keyboard.press("Escape");

    await page.getByTestId("open-sheet").click();
    await expectSheetOpenAt(page.getByTestId("sheet"), "comfortable");
    expect(await duplicateIds(page)).toEqual([]);
  });

  test("section navigation uses real anchors and browser history", async ({ page }) => {
    await openPlayground(page);
    const start = await scrollY(page);

    await page.getByTestId("nav-paged-grid").click();
    await expect(page).toHaveURL(/#paged-grid$/);
    const top = await section(page, "paged-grid").evaluate(
      (element) => element.getBoundingClientRect().top,
    );
    expect(top).toBeGreaterThanOrEqual(0);
    expect(top).toBeLessThan(120);
    await expect(page.getByTestId("nav-paged-grid")).toHaveAttribute("aria-current", "location");

    await page.getByTestId("nav-sheet").click();
    await expect(page).toHaveURL(/#sheet$/);

    await page.goBack();
    await expect(page).toHaveURL(/#paged-grid$/);
    await page.goBack();
    await expect(page).not.toHaveURL(/#/);
    await expect.poll(() => scrollY(page)).toBeLessThan(start + 40);
    await page.goForward();
    await expect(page).toHaveURL(/#paged-grid$/);
  });

  test("shows visible keyboard focus on the page's own controls", async ({ page, browserName }) => {
    await openPlayground(page);
    const skip = page.getByRole("link", { name: "Skip to the demonstrations" });
    // WebKit keeps links out of the Tab order unless the user opts in, so reach it directly there.
    if (browserName === "webkit") await skip.focus();
    else await page.keyboard.press("Tab");
    await expect(skip).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#coverflow$/);

    for (const locator of [
      section(page, "coverflow").getByTestId("preset-tight"),
      section(page, "coverflow").getByTestId("tuning-customize"),
    ]) {
      await locator.focus();
      await page.keyboard.press("Shift+Tab");
      await page.keyboard.press("Tab");
      await expect(locator).toBeFocused();
      const outline = await locator.evaluate((element) => {
        const style = getComputedStyle(element);
        return { width: Number.parseFloat(style.outlineWidth), style: style.outlineStyle };
      });
      expect(outline.style).not.toBe("none");
      expect(outline.width).toBeGreaterThanOrEqual(2);
    }

    // Customize is a real disclosure button operable from the keyboard.
    const customize = section(page, "coverflow").getByTestId("tuning-customize");
    await customize.focus();
    await page.keyboard.press("Enter");
    await expect(customize).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Space");
    await expect(customize).toHaveAttribute("aria-expanded", "false");
  });
});
