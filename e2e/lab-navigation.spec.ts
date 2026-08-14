import { expect, test } from "@playwright/test";

import { openLabDemo } from "./helpers";

async function expectLabLocation(
  page: Parameters<typeof openLabDemo>[0],
  expected: { demo: string; view: "fixtures" | "showcase" | "workbench" },
) {
  await expect(page.locator(`#nav-${expected.demo}`)).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(`#panel-${expected.demo}`)).toBeVisible();
  const viewLabel =
    expected.view === "showcase"
      ? "Showcase"
      : expected.view === "workbench"
        ? "Workbench"
        : "Fixtures";
  await expect(page.getByRole("button", { name: viewLabel, exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect
    .poll(() => {
      const url = new URL(page.url());
      return {
        demo: url.searchParams.get("demo"),
        view: url.searchParams.get("view"),
      };
    })
    .toEqual({
      demo: expected.demo,
      view: expected.view === "showcase" ? null : expected.view,
    });
}

test.describe("lab audience navigation", () => {
  test("opens as a focused showcase and progressively discloses the workbench", async ({
    page,
  }) => {
    await page.goto("./");

    await expect(page.getByRole("group", { name: "Showcase surfaces" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Coverflow", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByRole("button", { name: "Coverflow", exact: true })).toHaveAttribute(
      "aria-controls",
      "panel-coverflow",
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
    await expect(page.getByTestId("media-lightbox")).toHaveAttribute("data-open-state", "open");
    await expect(page.getByTestId("media-test-rail")).toHaveCount(0);
    await page.getByTestId("close-lightbox").click();
    await expect(page.getByTestId("media-lightbox")).toHaveAttribute("data-open-state", "closed");

    await page.getByRole("button", { name: "Inspect motion" }).click();
    await expectLabLocation(page, { demo: "media", view: "workbench" });
    await expect(page.getByTestId("media-fixture-mode")).toBeVisible();
    await page.getByTestId("open-lightbox").press("Enter");
    await expect(page.getByTestId("media-lightbox")).toHaveAttribute("data-open-state", "open");
    await expect(page.getByTestId("media-test-rail")).toBeVisible();
  });

  test("keeps certification and geometry fixtures out of showcase navigation", async ({ page }) => {
    await page.goto("./");
    await page.getByRole("button", { name: "Fixtures", exact: true }).click();

    await expect(page.getByRole("group", { name: "Engineering fixtures" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Default Surfaces" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByRole("button", { name: "Coverflow", exact: true })).toHaveCount(0);
    await expect(page.getByTestId("defaults-deck")).toBeVisible();

    await page.getByRole("button", { name: "Variable Rail" }).click();
    await expect(page.getByTestId("variable-rail")).toBeVisible();
    await expect(page.getByTestId("paged-grid")).toHaveCount(0);

    await openLabDemo(page, "render-window");
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

  test("normalizes valid, incomplete, invalid, and conflicting direct URLs", async ({ page }) => {
    const cases = [
      {
        query: "?demo=stacked-deck&view=workbench",
        expected: { demo: "stacked-deck", view: "workbench" as const },
      },
      {
        query: "?view=fixtures",
        expected: { demo: "defaults", view: "fixtures" as const },
      },
      {
        query: "?demo=unknown&view=unknown",
        expected: { demo: "coverflow", view: "showcase" as const },
      },
      {
        query: "?demo=unknown&view=fixtures",
        expected: { demo: "defaults", view: "fixtures" as const },
      },
      {
        query: "?demo=coverflow&view=fixtures",
        expected: { demo: "coverflow", view: "showcase" as const },
      },
      {
        query: "?demo=gallery-at&view=workbench",
        expected: { demo: "gallery-at", view: "fixtures" as const },
      },
    ];

    for (const { query, expected } of cases) {
      await page.goto(`./${query}`);
      await expectLabLocation(page, expected);
    }
  });

  test("keeps history-driven search parameter changes coherent", async ({ page }) => {
    await page.goto("./?demo=coverflow&view=workbench");
    await expectLabLocation(page, { demo: "coverflow", view: "workbench" });

    await page.evaluate(() => {
      history.pushState({}, "", "?demo=gallery-at&view=workbench");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await expectLabLocation(page, { demo: "gallery-at", view: "fixtures" });

    await page.evaluate(() => {
      history.pushState({}, "", "?demo=coverflow&view=fixtures");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await expectLabLocation(page, { demo: "coverflow", view: "showcase" });
  });

  test("does not fall through unowned shell props to fixture roots", async ({ page }) => {
    const cases = [
      { demo: "defaults" as const, root: page.locator(".defaults-demo") },
      { demo: "gallery-at" as const, root: page.getByTestId("media-gallery-at-harness") },
      { demo: "adaptive-sheet" as const, root: page.getByTestId("adaptive-sheet-fixture") },
      { demo: "render-window" as const, root: page.locator(".render-window-fixture") },
    ];

    for (const { demo, root } of cases) {
      await openLabDemo(page, demo);
      const attributes = await root.evaluate((element) =>
        Array.from(element.attributes, ({ name, value }) => ({ name, value })),
      );
      expect(attributes.map(({ name }) => name)).not.toEqual(
        expect.arrayContaining([
          "reduced-motion-override",
          "reducedmotionoverride",
          "settings",
          "stage-width",
          "stagewidth",
        ]),
      );
      expect(attributes.map(({ value }) => value)).not.toContain("[object Object]");
    }
  });
});
