import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { expectCarouselAt, expectSheetOpenAt, openLabDemo } from "./helpers";

async function expectNoAxeViolations(page: Page, context: string) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.map((node) => node.target),
    })),
    context,
  ).toEqual([]);
}

test.describe("automated accessibility certification", () => {
  test("lightbox passes closed, open, every active slide, and one-item states", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await openLabDemo(page, "media");
    await expectNoAxeViolations(page, "closed lightbox");

    await page.getByTestId("open-lightbox").click();
    await expectNoAxeViolations(page, "open lightbox");

    const carousel = page.getByTestId("media-carousel");
    for (const id of ["extremely-wide", "extremely-tall", "transformed", "delayed"] as const) {
      await page.getByTestId("media-next").click();
      await expectCarouselAt(carousel, id);
      await expectNoAxeViolations(page, `lightbox slide ${id}`);
    }

    await page.getByTestId("close-lightbox").click();
    await page.getByTestId("media-fixture-mode").selectOption("one");
    await page.getByTestId("open-lightbox").click();
    await expect(page.getByTestId("media-previous")).toBeDisabled();
    await expect(page.getByTestId("media-next")).toBeDisabled();
    await expectNoAxeViolations(page, "one-item lightbox");
  });

  test("paged grid passes active, inert, mobile, and zoomed layouts", async ({ page }) => {
    await openLabDemo(page, "grid");
    await expectNoAxeViolations(page, "paged grid initial");
    await page.getByTestId("grid-next").click();
    await expectCarouselAt(page.getByTestId("paged-grid"), "page-2");
    await expectNoAxeViolations(page, "paged grid with inert pages");

    await page.setViewportSize({ width: 390, height: 844 });
    await expectNoAxeViolations(page, "paged grid mobile");
    for (const zoom of [2, 4]) {
      await page.locator("html").evaluate((element, value) => {
        element.style.zoom = String(value);
      }, zoom);
      await expectNoAxeViolations(page, `paged grid ${zoom * 100}% zoom`);
    }
  });

  test("bottom sheet passes every snap and reduced-motion state", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openLabDemo(page, "sheet", "reduce");
    await page.getByTestId("open-sheet").click();
    const dialog = page.getByTestId("bottom-sheet");

    for (const id of ["full", "comfortable", "compact"] as const) {
      await page.getByTestId(`snap-${id}`).check();
      await expectSheetOpenAt(dialog, id);
      await expectNoAxeViolations(page, `bottom sheet ${id}`);
    }
  });

  test("base controls retain automated semantics and focus in forced colors", async ({
    browserName,
    page,
  }) => {
    test.skip(browserName !== "chromium", "Forced-colors emulation is certified in Chromium.");
    await page.emulateMedia({ forcedColors: "active" });
    await openLabDemo(page, "media");
    await page.getByTestId("open-lightbox").click();
    const close = page.getByTestId("close-lightbox");
    await close.focus();
    await expect(close).toBeFocused();
    await expectNoAxeViolations(page, "forced-colors lightbox");
  });
});
