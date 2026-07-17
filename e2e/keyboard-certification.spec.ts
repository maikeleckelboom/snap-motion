import { expect, test } from "@playwright/test";

import { expectCarouselAt, expectSheetOpenAt, openLabDemo } from "./helpers";

test.describe("keyboard certification", () => {
  test("lightbox keeps viewport focus, leaves button focus stable, wraps Tab, and restores opener", async ({
    page,
  }) => {
    await openLabDemo(page, "media");
    const opener = page.getByTestId("open-lightbox");
    await opener.focus();
    await page.keyboard.press("Enter");

    const close = page.getByTestId("close-lightbox");
    const previous = page.getByTestId("media-previous");
    const viewport = page.getByTestId("media-carousel");
    await expect(close).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(viewport).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expectCarouselAt(viewport, "extremely-wide");
    await expect(viewport).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(previous).toBeFocused();
    await page.keyboard.press("Space");
    await expectCarouselAt(viewport, "regular");
    await expect(previous).toBeFocused();
    await viewport.focus();
    await page.keyboard.press("End");
    await expectCarouselAt(viewport, "delayed");
    await page.keyboard.press("Tab");
    await expect(close).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(opener).toBeFocused();
  });

  test("bottom-sheet radio group supplies the non-drag Arrow-key path", async ({ page }) => {
    await openLabDemo(page, "sheet");
    await page.getByTestId("open-sheet").click();
    const full = page.getByTestId("snap-full");
    const comfortable = page.getByTestId("snap-comfortable");
    const compact = page.getByTestId("snap-compact");
    const dialog = page.getByTestId("bottom-sheet");

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
