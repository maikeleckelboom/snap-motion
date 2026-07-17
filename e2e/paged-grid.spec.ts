import { expect, test } from "@playwright/test";

import { dragMouseBy, expectCarouselAt, openLabDemo, setNumericInput } from "./helpers";

test.describe("paged grid", () => {
  test("uses explicit two-by-two pages with correct gap geometry and a partial final page", async ({
    page,
  }) => {
    await openLabDemo(page, "grid");

    const grid = page.getByTestId("paged-grid");
    await expect(grid).toHaveAttribute("data-rows", "2");
    await expect(grid).toHaveAttribute("data-columns", "2");
    await expect(grid).toHaveAttribute("data-gap", "16");
    await expect(grid).toHaveAttribute("data-page-count", "3");
    await expect(page.locator('[data-page-id="page-1"] .grid-item')).toHaveCount(4);
    await expect(page.locator('[data-page-id="page-3"] .grid-item')).toHaveCount(1);

    async function readFirstPageGeometry() {
      return page.locator('[data-page-id="page-1"] .item-grid').evaluate((itemGrid) => {
        const items = Array.from(itemGrid.querySelectorAll<HTMLElement>(".grid-item"));
        const style = getComputedStyle(itemGrid);
        return {
          columnGap: Number.parseFloat(style.columnGap),
          gridWidth: itemGrid.getBoundingClientRect().width,
          itemWidths: items.slice(0, 2).map((item) => item.getBoundingClientRect().width),
        };
      });
    }

    const initial = await readFirstPageGeometry();
    expect(initial.columnGap).toBe(16);
    expect(initial.itemWidths).toHaveLength(2);
    expect(
      Math.abs(
        initial.itemWidths[0]! + initial.itemWidths[1]! + initial.columnGap - initial.gridWidth,
      ),
    ).toBeLessThanOrEqual(1.5);

    await setNumericInput(page.getByTestId("grid-gap"), 24);
    await expect(grid).toHaveAttribute("data-gap", "24");
    const changed = await readFirstPageGeometry();
    expect(changed.columnGap).toBe(24);
    expect(
      Math.abs(
        changed.itemWidths[0]! + changed.itemWidths[1]! + changed.columnGap - changed.gridWidth,
      ),
    ).toBeLessThanOrEqual(1.5);
  });

  test("supports direct drag, keyboard paging, final-boundary resistance, and normal Tab traversal", async ({
    page,
  }) => {
    await openLabDemo(page, "grid");

    const grid = page.getByTestId("paged-grid");
    const box = await grid.boundingBox();
    if (!box) {
      throw new Error("Paged grid has no layout box.");
    }

    await dragMouseBy(page, grid, -box.width * 0.62, 0, {
      stepDelay: 35,
      steps: 12,
    });
    await expectCarouselAt(grid, "page-2");

    await grid.focus();
    await page.keyboard.press("ArrowRight");
    await expectCarouselAt(grid, "page-3");
    await expect(page.getByTestId("grid-next")).toBeDisabled();

    await dragMouseBy(page, grid, -box.width * 0.45, 0, {
      stepDelay: 25,
      steps: 8,
    });
    await expectCarouselAt(grid, "page-3");

    await grid.focus();
    await page.keyboard.press("Home");
    await expectCarouselAt(grid, "page-1");
    await page.keyboard.press("Tab");

    const focused = await page.evaluate(() => {
      const element = document.activeElement;
      return {
        tagName: element?.tagName,
      };
    });
    expect(focused.tagName).toBe("BUTTON");
    await expect(grid).toHaveAttribute("data-active-id", "page-1");
  });

  test("remeasures across stage and column changes while preserving a valid semantic page", async ({
    page,
  }) => {
    await openLabDemo(page, "grid");

    const grid = page.getByTestId("paged-grid");
    await page.getByTestId("grid-next").click();
    await expectCarouselAt(grid, "page-2");

    await page.getByRole("button", { name: "Phone" }).click();
    await setNumericInput(page.getByTestId("grid-columns"), 1);
    await setNumericInput(page.getByTestId("grid-rows"), 2);
    await expect(grid).toHaveAttribute("data-page-count", "5");
    await expectCarouselAt(grid, "page-2");
    const phoneWidth = await grid.evaluate((element) => element.clientWidth);

    await page.getByRole("button", { name: "Desktop" }).click();
    await setNumericInput(page.getByTestId("grid-columns"), 3);
    await expect(grid).toHaveAttribute("data-page-count", "2");
    await expectCarouselAt(grid, "page-2");

    const viewportWidth = await grid.evaluate((element) => element.clientWidth);
    expect(viewportWidth).toBeGreaterThan(phoneWidth);
  });

  test("retargets safely as items are added and removed, including the one-item boundary", async ({
    page,
  }) => {
    await openLabDemo(page, "grid");

    const grid = page.getByTestId("paged-grid");
    const add = page.getByTestId("add-grid-item");
    const remove = page.getByTestId("remove-grid-item");

    await grid.focus();
    await page.keyboard.press("End");
    await expectCarouselAt(grid, "page-3");

    await remove.click();
    await expect(grid).toHaveAttribute("data-page-count", "2");
    await expectCarouselAt(grid, "page-2");

    await add.click();
    await expect(grid).toHaveAttribute("data-page-count", "3");
    await expectCarouselAt(grid, "page-2");

    for (let remaining = 8; remaining > 0; remaining -= 1) {
      await remove.click();
    }
    await expect(page.getByText("1 items", { exact: true })).toBeVisible();
    await expect(grid).toHaveAttribute("data-page-count", "1");
    await expectCarouselAt(grid, "page-1");
    await expect(page.getByTestId("grid-previous")).toBeDisabled();
    await expect(page.getByTestId("grid-next")).toBeDisabled();
    await expect(remove).toBeDisabled();
  });
});
