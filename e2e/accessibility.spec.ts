import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { expectCarouselAt, expectSheetOpenAt, openLabDemo } from "./helpers";
import { mediaFixtureIds } from "./mediaFixtureAssertions";

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
    const carousel = page.getByTestId("media-carousel");
    await expect(page.getByTestId("caption-input")).toBeVisible();
    await expect(page.getByTestId("caption-radio")).toBeVisible();
    await expect(page.getByTestId("media-controls")).toBeVisible();
    await expect(page.getByTestId("ownership-end")).toBeVisible();

    for (const [index, id] of mediaFixtureIds.entries()) {
      if (index > 0) {
        await page.getByTestId("media-next").click();
      }
      await expectCarouselAt(carousel, id);
      await expect(page.getByTestId(`media-frame-${id}`)).toHaveAttribute(
        "data-media-state",
        "loaded",
      );
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

  test("lightbox reflows at browser-zoom-equivalent 200 and 400 percent viewports", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 720, height: 480 });
    await openLabDemo(page, "media");
    await page.getByTestId("open-lightbox").click();

    for (const { height, label, width } of [
      { height: 480, label: "200%", width: 720 },
      { height: 240, label: "400%", width: 360 },
    ]) {
      await page.setViewportSize({ width, height });
      const reflow = await page.getByTestId("media-lightbox").evaluate((dialog) => {
        const stage = dialog.querySelector<HTMLElement>('[data-testid="media-stage-instrument"]');
        const stageRect = stage?.getBoundingClientRect();
        const dialogRect = dialog.getBoundingClientRect();
        return {
          dialogOverflow: dialog.scrollWidth - dialog.clientWidth,
          stageInside:
            stageRect !== undefined &&
            stageRect.left >= dialogRect.left - 1 &&
            stageRect.right <= dialogRect.right + 1,
        };
      });

      expect(reflow.dialogOverflow, `${label} horizontal reflow`).toBeLessThanOrEqual(1);
      expect(reflow.stageInside, `${label} stage containment`).toBe(true);
      await expect(page.getByTestId("caption-input")).toBeVisible();
      await expect(page.getByTestId("caption-radio")).toBeVisible();
      await expect(page.getByTestId("media-controls")).toBeVisible();
      await expect(page.getByTestId("ownership-end")).toBeVisible();
      await expectNoAxeViolations(page, `lightbox ${label} reflow`);
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
