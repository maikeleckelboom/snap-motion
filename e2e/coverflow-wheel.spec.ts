import { expect, type Page, test, type Locator } from "@playwright/test";

import { openLabDemo } from "./helpers";

interface InFlightSample {
  position: number;
  targetId: string | undefined;
}

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

/*
 * Dispatch one wheel step and read the accepted destination from inside the page.
 *
 * A wheel step spends about 120ms in `dragging` before it accepts a destination.
 * Under parallel cross-browser load the spring can complete between two animation
 * frames, so settlement phase is not a deterministic observation boundary. The
 * semantic destination and monotonic projection remain contractual in either case.
 */
async function stepWheelInFlight(page: Page, deltaX: number) {
  const commitFrameBudget = 180;

  return page.evaluate(
    ({ commitBudget, delta }) =>
      new Promise<InFlightSample>((resolve, reject) => {
        const viewport = document.querySelector<HTMLElement>('[data-testid="coverflow-viewport"]');
        const indicator = document.querySelector<HTMLElement>(
          '[data-testid="coverflow-pagination-indicator"]',
        );
        if (!viewport || !indicator) {
          reject(new Error("Coverflow stage is not mounted."));
          return;
        }

        const read = (): InFlightSample => ({
          position: Number(indicator.dataset.position),
          targetId: viewport.dataset.targetId,
        });
        const initialTargetId = viewport.dataset.targetId;

        viewport.dispatchEvent(
          new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaX: delta }),
        );

        let commitFramesLeft = commitBudget;

        const onFrame = () => {
          const sample = read();
          if (sample.targetId !== undefined && sample.targetId !== initialTargetId) {
            resolve(sample);
            return;
          }

          commitFramesLeft -= 1;
          // Out of budget: resolve anyway so the assertion reports the phase it
          // actually got instead of a bare timeout.
          if (commitFramesLeft <= 0) {
            resolve(sample);
            return;
          }
          requestAnimationFrame(onFrame);
        };
        requestAnimationFrame(onFrame);
      }),
    { commitBudget: commitFrameBudget, delta: deltaX },
  );
}

test("stepped wheel destinations advance monotonically and reverse exactly", async ({ page }) => {
  await openLabDemo(page, "coverflow", "no-preference");
  await page.locator(".preset-control select").selectOption("heavy");

  const viewport = page.getByTestId("coverflow-viewport");
  const indicator = page.getByTestId("coverflow-pagination-indicator");
  await page
    .getByRole("group", { name: "Coverflow screens" })
    .getByRole("button", { name: /^Projectsjablonen,/ })
    .click();
  await expect(viewport).toHaveAttribute("data-active-id", "templates");

  const firstStep = await stepWheelInFlight(page, 40);
  expect(firstStep.targetId).toBe("project");
  expect(firstStep.position).toBeGreaterThan(0);
  expect(firstStep.position).toBeLessThanOrEqual(1);

  const secondStep = await stepWheelInFlight(page, 40);
  expect(secondStep.targetId).toBe("map");
  expect(secondStep.position).toBeGreaterThan(firstStep.position);
  expect(secondStep.position).toBeLessThanOrEqual(2);

  const thirdStep = await stepWheelInFlight(page, 40);
  expect(thirdStep.targetId).toBe("team");
  expect(thirdStep.position).toBeGreaterThan(secondStep.position);
  expect(thirdStep.position).toBeLessThanOrEqual(3);

  await dispatchWheelStep(viewport, -40);
  await expect(viewport).toHaveAttribute("data-target-id", "map");
  await expect(viewport).toHaveAttribute("data-active-id", "map");
  await expect(viewport).toHaveAttribute("data-phase", "idle");
  await expect(indicator).toHaveAttribute("data-position", "2.00000");
  await expect(indicator).toHaveAttribute("data-scale-x", "1.00000");
});
