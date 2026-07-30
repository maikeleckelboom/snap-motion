import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { openLabDemo } from "./helpers";

function harness(page: Page) {
  return page.getByTestId("media-gallery-at-harness");
}

function gallery(page: Page) {
  return page.getByTestId("snap-motion-media-gallery");
}

async function expectNoHarnessViolations(page: Page) {
  const axe = await new AxeBuilder({ page })
    .include('[data-testid="media-gallery-at-harness"]')
    .analyze();
  expect(axe.violations.map((violation) => violation.id)).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await openLabDemo(page, "gallery-at", "reduce");
});

test("the dedicated surface exposes stable scenarios and a genuinely non-live trace", async ({
  page,
}) => {
  await expect(harness(page)).toContainText(
    "Prepared for manual assistive-technology certification",
  );
  await expect(
    harness(page).getByRole("heading", { name: "Media gallery AT certification harness" }),
  ).toBeVisible();
  await expect(harness(page).getByRole("radio")).toHaveCount(4);
  await expect(page.getByTestId("at-scenario-baseline")).toBeChecked();
  await expect(page.getByTestId("at-scenario-contract")).toContainText("baseline");
  await expect(page.getByTestId("at-scenario-contract")).toContainText("2 of 3");

  const trace = page.getByTestId("at-event-trace");
  await expect(trace).toHaveAttribute("aria-live", "off");
  expect(
    await trace.evaluate((element) => ({
      liveDescendants: element.querySelectorAll(
        '[aria-live]:not([aria-live="off"]), [role="alert"], [role="log"], [role="status"]',
      ).length,
      role: element.getAttribute("role"),
    })),
  ).toEqual({ liveDescendants: 0, role: null });
  await expect(trace).toContainText("No events recorded.");
  await expectNoHarnessViolations(page);
});

test("baseline navigation, event order, modal containment, and focus return remain deterministic", async ({
  page,
}) => {
  const opener = page.getByTestId("at-open-gallery");
  await opener.click();

  const dialog = gallery(page);
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("data-dialog-state", "open");
  await expect(dialog).toHaveAccessibleName("Media gallery certification");
  await expect(page.getByTestId("snap-motion-media-gallery-close")).toBeFocused();
  await expect(page.getByTestId("snap-motion-media-gallery-position")).toHaveText("2 / 3");
  await expect(dialog.getByRole("img")).toHaveCount(1);
  await expect(dialog.getByRole("img")).toHaveAccessibleName(
    "Wide blue timeline test card with a 12000 by 1600 size marker.",
  );

  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("snap-motion-media-gallery-position")).toHaveText("3 / 3");
  await expect(page.getByTestId("snap-motion-media-gallery-status")).toHaveText(
    "Tall document, 3 of 3",
  );
  await expect(page.getByTestId("snap-motion-media-gallery-close")).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(opener).toBeFocused();
  await expect
    .poll(() =>
      page
        .getByTestId("at-event-trace")
        .locator("code")
        .allTextContents()
        .then((events) => events.join(",")),
    )
    .toBe("open-requested,opened,indexChanged,requestClose,update:open,closed");
  await expect(page.getByTestId("at-event-trace")).toContainText("reason next");
  await expect(page.getByTestId("at-event-trace")).toContainText("reason escape");
});

test("boundary and deterministic failure scenarios preserve the expected semantic fallback", async ({
  page,
}) => {
  await page.getByTestId("at-scenario-single-item").check();
  await page.getByTestId("at-open-gallery").click();
  await expect(page.getByTestId("snap-motion-media-gallery-position")).toHaveText("1 / 1");
  await expect(page.getByTestId("snap-motion-media-gallery-previous")).toBeDisabled();
  await expect(page.getByTestId("snap-motion-media-gallery-next")).toBeDisabled();
  await expect(gallery(page).getByRole("img")).toHaveCount(1);
  await expect(gallery(page).getByRole("img")).toHaveAccessibleName(
    "Blue landscape test card labelled regular landscape, with a 1600 by 1000 size marker.",
  );
  await page.getByTestId("snap-motion-media-gallery-close").click();
  await expect(gallery(page)).not.toBeVisible();

  await page.getByTestId("at-scenario-full-failure").check();
  await page.getByTestId("at-open-gallery").click();
  await expect(gallery(page)).toHaveAttribute("data-image-state", "failed");
  await expect(page.getByTestId("snap-motion-media-gallery-error")).toContainText(
    "Full image unavailable. Showing the preview.",
  );
  await expect(gallery(page).getByRole("img")).toHaveAccessibleName(
    "Blue landscape test card labelled regular landscape, with a 1600 by 1000 size marker.",
  );
  await expect(gallery(page).getByRole("button", { name: "Retry" })).toBeVisible();
  await expectNoHarnessViolations(page);
  await page.getByTestId("snap-motion-media-gallery-close").click();
  await expect(gallery(page)).not.toBeVisible();

  await page.getByTestId("at-scenario-preview-failure").check();
  await page.getByTestId("at-open-gallery").click();
  await expect(page.getByTestId("snap-motion-media-gallery-preview-error")).toHaveText(
    "Preview unavailable.",
  );
  await expect(gallery(page).getByRole("button", { name: "Retry" })).toHaveCount(0);
  await expect(page.getByTestId("snap-motion-media-gallery-close")).toBeEnabled();
  await expectNoHarnessViolations(page);
});
