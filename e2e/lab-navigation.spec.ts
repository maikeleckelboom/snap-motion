import { expect, test, type Page } from "@playwright/test";

async function expectLabLocation(
  page: Page,
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
});
