import { expect, type Page, test, type Locator } from "@playwright/test";

import { openLabDemo } from "./helpers";

interface InFlightSample {
  phase: string | undefined;
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
 * Dispatch one wheel step and read the stage while its spring is still
 * travelling, entirely from inside the page.
 *
 * A wheel step spends about 120ms in `dragging` before the gesture resolves
 * into a committed target, and the heavy spring then travels for roughly
 * 400ms. Waiting out the first interval from the runner costs scheduling and
 * IPC on top of its own duration, so under parallel load it eats the second
 * one too and the spring lands before anyone looks. Waiting on the page's own
 * frame clock spends the budget where it belongs: dwell until the target is
 * committed, then hold just long enough for the spring to advance visibly.
 */
async function stepWheelInFlight(page: Page, deltaX: number) {
  const commitFrameBudget = 180;
  const travelFrames = 3;

  return page.evaluate(
    ({ commitBudget, delta, travel }) =>
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
          phase: viewport.dataset.phase,
          position: Number(indicator.dataset.position),
          targetId: viewport.dataset.targetId,
        });

        viewport.dispatchEvent(
          new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaX: delta }),
        );

        let commitFramesLeft = commitBudget;
        let travelFramesLeft = travel;

        const onFrame = () => {
          const sample = read();
          if (sample.phase === "settling" && sample.targetId !== undefined) {
            travelFramesLeft -= 1;
            if (travelFramesLeft <= 0) {
              resolve(read());
              return;
            }
            requestAnimationFrame(onFrame);
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
    { commitBudget: commitFrameBudget, delta: deltaX, travel: travelFrames },
  );
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

  const firstStep = await stepWheelInFlight(page, 40);
  expect(firstStep.targetId).toBe("project");
  expect(firstStep.phase).toBe("settling");
  expect(firstStep.position).toBeGreaterThan(0);
  expect(firstStep.position).toBeLessThan(1);

  const secondStep = await stepWheelInFlight(page, 40);
  expect(secondStep.targetId).toBe("map");
  expect(secondStep.phase).toBe("settling");
  expect(secondStep.position).toBeGreaterThan(firstStep.position);
  expect(secondStep.position).toBeLessThan(2);

  const thirdStep = await stepWheelInFlight(page, 40);
  expect(thirdStep.targetId).toBe("team");
  expect(thirdStep.phase).toBe("settling");
  expect(thirdStep.position).toBeGreaterThan(secondStep.position);
  expect(thirdStep.position).toBeLessThan(3);

  await dispatchWheelStep(viewport, -40);
  await expect(viewport).toHaveAttribute("data-target-id", "map");
  await expect(viewport).toHaveAttribute("data-active-id", "map");
  await expect(viewport).toHaveAttribute("data-phase", "idle");
  await expect(indicator).toHaveAttribute("data-position", "2.00000");
  await expect(indicator).toHaveAttribute("data-scale-x", "1.00000");
});
