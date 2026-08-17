import { expect, test } from "@playwright/test";

import { expectCarouselAt, expectSheetOpenAt, openLabDemo } from "./helpers";

test.describe("keyboard certification", () => {
  test("sheet radio group supplies the non-drag Arrow-key path", async ({ page }) => {
    await openLabDemo(page, "sheet");
    await page.getByTestId("open-sheet").click();
    const dialog = page.getByTestId("sheet");
    const full = dialog.locator('input[type="radio"][value="full"]');
    const comfortable = dialog.locator('input[type="radio"][value="comfortable"]');
    const compact = dialog.locator('input[type="radio"][value="compact"]');

    await comfortable.focus();
    await expect(comfortable).toBeChecked();
    await page.keyboard.press("ArrowRight");
    await expect(compact).toBeChecked();
    await expectSheetOpenAt(dialog, "compact");
    await page.keyboard.press("ArrowLeft");
    await expect(comfortable).toBeChecked();
    await expectSheetOpenAt(dialog, "comfortable");
    await page.keyboard.press("ArrowLeft");
    await expect(full).toBeChecked();
    await expectSheetOpenAt(dialog, "full");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("open-sheet")).toBeFocused();
  });

  test("interactive grid descendants keep directional keys and outgoing focus never becomes inert", async ({
    page,
  }) => {
    await openLabDemo(page, "grid");
    const viewport = page.getByTestId("paged-grid");
    const inspect = page.locator('[data-page-id="page-1"] button').first();
    await inspect.focus();
    await page.keyboard.press("ArrowRight");
    await expectCarouselAt(viewport, "page-1");
    await expect(inspect).toBeFocused();

    await page.getByTestId("grid-next").focus();
    await page.keyboard.press("Enter");
    await expectCarouselAt(viewport, "page-2");
    await expect(page.getByTestId("grid-next")).toBeFocused();
    await expect(page.locator('[data-page-id="page-1"]')).toHaveAttribute("inert", "");
  });
});
