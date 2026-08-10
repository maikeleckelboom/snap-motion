import { expect, test } from "@playwright/test";

test.describe("lab audience navigation", () => {
  test("opens as a focused showcase and progressively discloses the workbench", async ({
    page,
  }) => {
    await page.goto("./");

    await expect(page.getByRole("navigation", { name: "Showcase surfaces" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Coverflow", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.getByRole("button", { name: "Default Surfaces" })).toHaveCount(0);
    await expect(page.getByRole("spinbutton", { name: "Stiffness" })).not.toBeVisible();
    await expect(page.getByTestId("diagnostics")).not.toBeVisible();

    await page.getByRole("button", { name: "Inspect motion" }).click();
    await expect(page).toHaveURL(/view=workbench/);
    await expect(page.getByText("Live telemetry")).toBeVisible();
    await expect(page.getByText("Full diagnostics")).toBeVisible();
    await expect(page.getByText("Advanced physics")).toBeVisible();
    await expect(page.getByRole("spinbutton", { name: "Stiffness" })).not.toBeVisible();

    await page.getByText("Advanced physics").click();
    await expect(page.getByRole("spinbutton", { name: "Stiffness" })).toBeVisible();
  });

  test("keeps media certification controls in the workbench", async ({ page }) => {
    await page.goto("./?demo=media");
    await expect(page.getByTestId("media-fixture-mode")).toHaveCount(0);
    await page.getByTestId("open-lightbox").click();
    await expect(page.getByTestId("media-test-rail")).toHaveCount(0);
    await page.getByTestId("close-lightbox").click();

    await page.getByRole("button", { name: "Inspect motion" }).click();
    await expect(page.getByTestId("media-fixture-mode")).toBeVisible();
    await page.getByTestId("open-lightbox").click();
    await expect(page.getByTestId("media-test-rail")).toBeVisible();
  });

  test("keeps certification and geometry fixtures out of showcase navigation", async ({ page }) => {
    await page.goto("./");
    await page.getByRole("button", { name: "Fixtures", exact: true }).click();

    await expect(page.getByRole("navigation", { name: "Engineering fixtures" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Default Surfaces" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.getByRole("button", { name: "Coverflow", exact: true })).toHaveCount(0);
    await expect(page.getByTestId("defaults-deck")).toBeVisible();

    await page.getByRole("button", { name: "Variable Rail" }).click();
    await expect(page.getByTestId("variable-rail")).toBeVisible();
    await expect(page.getByTestId("paged-grid")).toHaveCount(0);

    await page.getByRole("button", { name: "Render Window" }).click();
    await expect(page.getByTestId("render-window-mounted").locator("li")).toHaveCount(3);
  });

  test("infers fixture view for compatible direct demo URLs", async ({ page }) => {
    await page.goto("./?demo=gallery-at");

    await expect(page.getByRole("button", { name: "Fixtures", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByTestId("media-gallery-at-harness")).toBeVisible();
    await expect(page).toHaveURL(/demo=gallery-at/);
  });
});
