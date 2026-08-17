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

  test("sheet passes every vertical snap and reduced-motion state", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openLabDemo(page, "sheet", "reduce");
    await page.getByTestId("open-sheet").click();
    const dialog = page.getByTestId("sheet");

    for (const id of ["full", "comfortable", "compact"] as const) {
      await dialog.locator(`input[type="radio"][value="${id}"]`).check();
      await expectSheetOpenAt(dialog, id);
      await expectNoAxeViolations(page, `sheet ${id}`);
    }
  });
});
