import { expect, test, type Page } from "@playwright/test";

import { openLabDemo } from "./helpers";

async function expectActiveItemCentered(page: Page, id: string) {
  const viewport = page.getByTestId("variable-rail");
  await expect(viewport).toHaveAttribute("data-active-id", id);
  await expect
    .poll(() =>
      viewport.evaluate((element, activeId) => {
        const item = element.querySelector<HTMLElement>(`[data-rail-id="${activeId}"]`);
        if (!item) return Number.POSITIVE_INFINITY;
        const viewportBox = element.getBoundingClientRect();
        const itemBox = item.getBoundingClientRect();
        return Math.abs(
          viewportBox.left + viewportBox.width / 2 - (itemBox.left + itemBox.width / 2),
        );
      }, id),
    )
    .toBeLessThanOrEqual(1);
}

test("unequal-width rail advances by measured centers and preserves edge insets", async ({
  page,
}) => {
  await openLabDemo(page, "grid");
  await expectActiveItemCentered(page, "rail-alpha");

  const next = page.getByTestId("variable-next");
  await next.click();
  await expectActiveItemCentered(page, "rail-beta");
  await next.click();
  await expectActiveItemCentered(page, "rail-gamma");
  await next.click();
  await expectActiveItemCentered(page, "rail-delta");
  await next.click();
  await expectActiveItemCentered(page, "rail-epsilon");
  await expect(next).toBeDisabled();
});
