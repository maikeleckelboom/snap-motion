import { expect, test } from "@playwright/test";

import { expectCarouselAt, expectSheetOpenAt, openLabDemo } from "./helpers";

test.describe("keyboard certification", () => {
  test("lightbox keeps focus stable through zoom and carousel controls, then restores the opener", async ({
    page,
  }) => {
    await openLabDemo(page, "media");
    const opener = page.getByTestId("open-lightbox");
    await opener.focus();
    await page.keyboard.press("Enter");

    const close = page.getByTestId("close-lightbox");
    const previous = page.getByTestId("media-previous");
    const zoomIn = page.getByTestId("media-zoom-in");
    const viewport = page.getByTestId("media-carousel");
    await expect(close).toBeFocused();

    await page.keyboard.press("ArrowRight");
    await expectCarouselAt(viewport, "extremely-wide");
    await expect(close).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expectCarouselAt(viewport, "regular");
    await expect(close).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(zoomIn).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expectCarouselAt(viewport, "extremely-wide");
    await expect(zoomIn).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expectCarouselAt(viewport, "regular");
    await expect(zoomIn).toBeFocused();
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
    await page.getByTestId("ownership-end").focus();
    await page.keyboard.press("Tab");
    await expect(close).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(opener).toBeFocused();
  });

  test("dialog controls navigate while input, radio, video, and active-slide children retain keys", async ({
    page,
  }) => {
    await openLabDemo(page, "media");
    await page.getByTestId("open-lightbox").click();
    const viewport = page.getByTestId("media-carousel");

    const next = page.getByTestId("media-next");
    await next.focus();
    await page.keyboard.press("ArrowRight");
    await expectCarouselAt(viewport, "extremely-wide");
    await expect(next).toBeFocused();

    const caption = page.getByTestId("caption-action");
    await caption.focus();
    await page.keyboard.press("ArrowRight");
    await expectCarouselAt(viewport, "extremely-tall");
    await expect(caption).toBeFocused();

    for (const testId of [
      "caption-input",
      "caption-radio",
      "media-controls",
      "slide-action-extremely-tall",
    ]) {
      const owner = page.getByTestId(testId);
      await owner.focus();
      await page.keyboard.press("ArrowRight");
      await expectCarouselAt(viewport, "extremely-tall");
      await expect(owner).toBeFocused();
    }
  });

  test("dialog-wide keys map physical direction in RTL while retaining close focus", async ({
    page,
  }) => {
    await openLabDemo(page, "media");
    await page.getByTestId("media-direction-mode").selectOption("rtl");
    await page.getByTestId("open-lightbox").click();

    const close = page.getByTestId("close-lightbox");
    const viewport = page.getByTestId("media-carousel");
    await expect(close).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expectCarouselAt(viewport, "extremely-wide");
    const centerOffset = await viewport.evaluate((element) => {
      const active = element.querySelector<HTMLElement>('[data-slide-id="extremely-wide"]');
      if (!active) return Number.POSITIVE_INFINITY;
      const viewportBox = element.getBoundingClientRect();
      const activeBox = active.getBoundingClientRect();
      return Math.abs(viewportBox.left - activeBox.left);
    });
    expect(centerOffset).toBeLessThanOrEqual(1.5);
    await expect(close).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expectCarouselAt(viewport, "regular");
    await expect(close).toBeFocused();
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
