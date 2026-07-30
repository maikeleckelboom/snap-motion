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
  await page.getByRole("tab", { name: "Projectsjablonen", exact: true }).click();
  await expect(viewport).toHaveAttribute("data-active-id", "templates");

  await dispatchWheelStep(viewport, 40);
  await expect(viewport).toHaveAttribute("data-target-id", "project");
  await expect(viewport).toHaveAttribute("data-phase", "settling");
  await page.waitForTimeout(120);
  await expect(viewport).toHaveAttribute("data-phase", "settling");

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
});
