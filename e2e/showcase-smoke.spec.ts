import { expect, test, type Page } from "@playwright/test";

import { expectCarouselAt, expectSheetOpenAt } from "./helpers";

type ShowcaseDemo = "coverflow" | "grid" | "media" | "sheet" | "stacked-deck";

async function openShowcase(page: Page, demo: ShowcaseDemo) {
  await page.goto(`./?demo=${demo}`);
  await expect(page.locator(`#nav-${demo}`)).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(`#panel-${demo}`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Showcase", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator(".lab-inspector")).toHaveCount(0);
  await expect(page.getByTestId("diagnostics")).not.toBeVisible();
}

test.describe("showcase product path", () => {
  test("Coverflow presents at full workspace width and accepts its normal control", async ({
    page,
  }) => {
    await openShowcase(page, "coverflow");

    const viewport = page.getByTestId("coverflow-viewport");
    const box = await viewport.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(600);
    await page.getByTestId("coverflow-next").click();
    await expectCarouselAt(viewport, "team");
    await expect(page.getByTestId("coverflow-counter")).toHaveText("4");
  });

  test("Stacked Deck exchanges one card from its presentation control", async ({ page }) => {
    await openShowcase(page, "stacked-deck");

    const viewport = page.getByTestId("stacked-deck-viewport");
    await page.getByTestId("stacked-deck-next").click();
    await expectCarouselAt(viewport, "team");
    await expect(page.getByTestId("stacked-deck-counter")).toHaveText("4");
  });

  test("Paged Grid keeps default keyboard paging operational", async ({ page }) => {
    await openShowcase(page, "grid");

    const viewport = page.getByTestId("paged-grid");
    await viewport.focus();
    await page.keyboard.press("ArrowRight");
    await expectCarouselAt(viewport, "page-2");
  });

  test("Gallery opens and closes its dialog with focus return", async ({ page }) => {
    await openShowcase(page, "media");

    const opener = page.getByTestId("open-lightbox");
    const dialog = page.getByTestId("media-lightbox");
    await opener.click();
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId("close-lightbox")).toBeFocused();
    await page.getByTestId("close-lightbox").click();
    await expect(dialog).not.toBeVisible();
    await expect(opener).toBeFocused();
  });

  test("Sheet opens and closes from the default presentation with focus return", async ({
    page,
  }) => {
    await openShowcase(page, "sheet");

    const opener = page.getByTestId("open-sheet");
    const dialog = page.getByTestId("sheet");
    await opener.click();
    await expectSheetOpenAt(dialog, "comfortable");
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(opener).toBeFocused();
  });
});
