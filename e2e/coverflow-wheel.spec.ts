import { expect, test, type Locator } from "@playwright/test";

import { openLabDemo } from "./helpers";

async function dispatchWheelStep(viewport: Locator, deltaX: number) {
  await viewport.evaluate((element, stepDelta) => {
    element.dispatchEvent(
      new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        deltaX: stepDelta,
      }),
    );
  }, deltaX);
}

test("stepped wheel targets advance monotonically through interrupted springs", async ({
  page,
}) => {
  await openLabDemo(page, "coverflow", "no-preference");
  await page.locator(".preset-control select").selectOption("heavy");

  const viewport = page.getByTestId("coverflow-viewport");
  const indicator = page.getByTestId("coverflow-pagination-indicator");
  await page
    .getByRole("group", { name: "Coverflow screens" })
    .getByRole("button", { name: /^Projectsjablonen,/ })
    .click();
  await expect(viewport).toHaveAttribute("data-active-id", "templates");

  await dispatchWheelStep(viewport, 40);
  await expect(viewport).toHaveAttribute("data-target-id", "project");
  await expect(viewport).toHaveAttribute("data-phase", "settling");
  await page.waitForTimeout(120);
  await expect(viewport).toHaveAttribute("data-phase", "settling");
  const firstStepPosition = Number(await indicator.getAttribute("data-position"));
  expect(firstStepPosition).toBeGreaterThan(0);
  expect(firstStepPosition).toBeLessThan(1);

  await dispatchWheelStep(viewport, 40);
  await expect(viewport).toHaveAttribute("data-target-id", "map");
  await expect(viewport).toHaveAttribute("data-phase", "settling");
  await page.waitForTimeout(120);
  await expect(viewport).toHaveAttribute("data-phase", "settling");

  await dispatchWheelStep(viewport, 40);
  await expect(viewport).toHaveAttribute("data-target-id", "team");
  await expect(viewport).toHaveAttribute("data-phase", "settling");
  await page.waitForTimeout(120);
  await expect(viewport).toHaveAttribute("data-phase", "settling");

  await dispatchWheelStep(viewport, -40);
  await expect(viewport).toHaveAttribute("data-target-id", "map");
  await expect(viewport).toHaveAttribute("data-active-id", "map");
  await expect(viewport).toHaveAttribute("data-phase", "idle");
  await expect(indicator).toHaveAttribute("data-position", "2.00000");
  await expect(indicator).toHaveAttribute("data-scale-x", "1.00000");
});
