import { expect, test, type Locator, type Page } from "@playwright/test";

async function setRequestPolicy(
  page: Page,
  authority: Locator,
  policy: "accept" | "delay" | "refuse",
) {
  await page.evaluate((nextPolicy) => {
    window.dispatchEvent(new CustomEvent("snap-motion:set-request-policy", { detail: nextPolicy }));
  }, policy);
  await expect(authority).toHaveAttribute("data-policy", policy);
}

test("Vue Router owns push, replacement, Back closure, and direct-entry fallback", async ({
  page,
}) => {
  await page.goto("http://127.0.0.1:4174/work/factif");
  await page.getByRole("button", { name: "Open media" }).click();
  await expect(page).toHaveURL(/\/work\/factif\/media\/overview$/);
  await expect(page.getByRole("dialog")).toBeVisible();

  await page.getByRole("button", { name: "Next item" }).click();
  await expect(page).toHaveURL(/\/work\/factif\/media\/system$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/work\/factif$/);
  await expect(page.getByRole("dialog")).not.toBeVisible();

  await page.goto("http://127.0.0.1:4174/work/factif/media/outcome");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(page).toHaveURL(/\/work\/factif$/);
});

test("Vue Router can delay and refuse controlled navigation and close requests", async ({
  page,
}) => {
  await page.goto("http://127.0.0.1:4174/work/factif");
  await page.getByRole("button", { name: "Delay requests" }).click();
  await page.getByRole("button", { name: "Open media" }).click();
  await expect(page).toHaveURL(/\/work\/factif\/media\/overview$/);
  await page.getByRole("button", { name: "Next item" }).click();

  await expect(page.getByRole("button", { name: "Resolve pending request" })).toBeEnabled();
  await expect(page).toHaveURL(/\/work\/factif\/media\/overview$/);
  await expect(page.getByTestId("router-authority")).toHaveAttribute("data-active-id", "overview");
  await expect(page.locator(".snap-motion-carousel-viewport")).toHaveAttribute(
    "data-active-id",
    "overview",
  );
  await expect(page.locator(".snap-motion-carousel [role='status']")).toHaveText("");

  await page.evaluate(() => window.dispatchEvent(new Event("snap-motion:resolve-pending")));
  await expect(page).toHaveURL(/\/work\/factif\/media\/system$/);
  await expect(page.getByTestId("router-authority")).toHaveAttribute("data-active-id", "system");
  await expect(page.locator(".snap-motion-carousel [role='status']")).toContainText(
    "System detail",
  );
  await expect(page.getByTestId("router-authority")).toHaveAttribute(
    "data-settled-sequence",
    "system",
  );

  const authority = page.getByTestId("router-authority");
  await setRequestPolicy(page, authority, "refuse");
  await page.getByRole("button", { name: "Next item" }).click();
  await expect(authority).toHaveAttribute("data-request-sequence", "system,outcome");
  await expect(page).toHaveURL(/\/work\/factif\/media\/system$/);
  await expect(page.locator(".snap-motion-carousel-viewport")).toHaveAttribute(
    "data-active-id",
    "system",
  );
  await expect(page.locator(".snap-motion-carousel [role='status']")).toContainText(
    "System detail",
  );
  await expect(authority).toHaveAttribute("data-settled-sequence", "system");

  await setRequestPolicy(page, authority, "delay");
  await page.getByRole("button", { name: "Next item" }).click();
  await expect(authority).toHaveAttribute("data-request-sequence", "system,outcome,outcome");
  await expect(page).toHaveURL(/\/work\/factif\/media\/system$/);
  await expect(page.locator(".snap-motion-carousel-viewport")).toHaveAttribute(
    "data-active-id",
    "system",
  );
  await expect(authority).toHaveAttribute("data-settled-sequence", "system");
  await page.evaluate(() => window.dispatchEvent(new Event("snap-motion:resolve-pending")));
  await expect(page).toHaveURL(/\/work\/factif\/media\/outcome$/);
  await expect(page.locator(".snap-motion-carousel-viewport")).toHaveAttribute(
    "data-active-id",
    "outcome",
  );
  await expect(authority).toHaveAttribute("data-settled-sequence", "system,outcome");

  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page).toHaveURL(/\/work\/factif\/media\/outcome$/);
  await page.evaluate(() => window.dispatchEvent(new Event("snap-motion:resolve-pending")));
  await expect(page).toHaveURL(/\/work\/factif$/);
  await expect(page.getByRole("dialog")).not.toBeVisible();

  await page.getByRole("button", { name: "Refuse requests" }).click();
  await page.getByRole("button", { name: "Open media" }).click();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page).toHaveURL(/\/work\/factif\/media\/overview$/);
  await page.evaluate(() => window.dispatchEvent(new Event("snap-motion:resolve-pending")));
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("Nuxt hydrates a query-controlled overlay without warnings", async ({ page }) => {
  const hydrationMessages: string[] = [];
  page.on("console", (message) => {
    if (/hydration/i.test(message.text())) hydrationMessages.push(message.text());
  });
  page.on("pageerror", (error) => hydrationMessages.push(error.message));

  const response = await page.goto("http://127.0.0.1:4175/work/factif?media=system");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText("System detail", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Close gallery" }).click();
  await expect(page).toHaveURL(/\/work\/factif$/);
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect(hydrationMessages).toEqual([]);
});

test("Nuxt can delay controlled gallery navigation and close without hydration drift", async ({
  page,
}) => {
  const hydrationMessages: string[] = [];
  page.on("console", (message) => {
    if (/hydration|mismatch/i.test(message.text())) hydrationMessages.push(message.text());
  });
  page.on("pageerror", (error) => hydrationMessages.push(error.message));

  await page.goto("http://127.0.0.1:4175/work/factif");
  await page.getByRole("button", { name: "Delay requests" }).click();
  await page.getByRole("button", { name: "Open media overlay" }).click();
  await expect(page).toHaveURL(/\?media=overview$/);
  await page.getByRole("button", { name: "Next item" }).click();
  await expect(page.getByRole("button", { name: "Resolve pending request" })).toBeEnabled();
  await expect(page).toHaveURL(/\?media=overview$/);
  await expect(page.getByTestId("nuxt-authority")).toHaveAttribute("data-active-id", "overview");
  await expect(
    page.locator('dialog[open][data-testid="snap-motion-media-gallery"]'),
  ).toHaveAttribute("data-active-id", "overview");

  await page.evaluate(() => window.dispatchEvent(new Event("snap-motion:resolve-pending")));
  await expect(page).toHaveURL(/\?media=system$/);
  await expect(page.getByTestId("nuxt-authority")).toHaveAttribute("data-active-id", "system");
  const gallery = page.locator('dialog[open][data-testid="snap-motion-media-gallery"]');
  await expect(gallery).toHaveAttribute("data-settled-id", "system");
  await expect(gallery).toHaveAttribute("data-track-state", "idle");
  await expect(page.getByTestId("nuxt-authority")).toHaveAttribute(
    "data-settled-sequence",
    "system",
  );

  const authority = page.getByTestId("nuxt-authority");
  const nextItem = page.getByRole("button", { name: "Next item" });
  await setRequestPolicy(page, authority, "refuse");
  await nextItem.click();
  await expect(authority).toHaveAttribute("data-request-sequence", "system,outcome");
  // `idle` is also the pre-navigation value. Observe the refused transition itself before
  // treating its rollback as complete, or a fast runner can issue the repeated target request
  // inside the first request's still-open navigation epoch.
  await expect(gallery).toHaveAttribute("data-track-state", "settling");
  await expect(page).toHaveURL(/\?media=system$/);
  await expect(
    page.locator('dialog[open][data-testid="snap-motion-media-gallery"]'),
  ).toHaveAttribute("data-active-id", "system");
  await expect(gallery.getByTestId("snap-motion-media-gallery-status")).not.toContainText(
    "Measured outcome",
  );
  await expect(gallery).toHaveAttribute("data-settled-id", "system");
  await expect(authority).toHaveAttribute("data-settled-sequence", "system");
  await expect(gallery).toHaveAttribute("data-track-state", "idle");

  await setRequestPolicy(page, authority, "delay");
  await expect(nextItem).toBeEnabled();
  await nextItem.click();
  await expect(authority).toHaveAttribute("data-request-sequence", "system,outcome,outcome");
  await expect(page).toHaveURL(/\?media=system$/);
  await expect(gallery).toHaveAttribute("data-active-id", "system");
  await expect(authority).toHaveAttribute("data-settled-sequence", "system");
  await page.evaluate(() => window.dispatchEvent(new Event("snap-motion:resolve-pending")));
  await expect(page).toHaveURL(/\?media=outcome$/);
  await expect(gallery).toHaveAttribute("data-active-id", "outcome");
  await expect(gallery).toHaveAttribute("data-settled-id", "outcome");
  await expect(authority).toHaveAttribute("data-settled-sequence", "system,outcome");

  await page.getByRole("button", { name: "Close gallery" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page).toHaveURL(/\?media=outcome$/);
  await page.evaluate(() => window.dispatchEvent(new Event("snap-motion:resolve-pending")));
  await expect(page).toHaveURL(/\/work\/factif$/);
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect(hydrationMessages).toEqual([]);
});

test("Nuxt full media route remains meaningful without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  const response = await page.goto("http://127.0.0.1:4175/work/factif/media/system");

  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "System detail" })).toBeVisible();
  await expect(
    page.getByText("This full-page route remains meaningful without JavaScript."),
  ).toBeVisible();
  await context.close();
});

test("Nuxt adaptive sheet hydrates one host and transfers focused state inline", async ({
  page,
}) => {
  const hydrationMessages: string[] = [];
  page.on("console", (message) => {
    if (/hydration|mismatch/i.test(message.text())) hydrationMessages.push(message.text());
  });
  page.on("pageerror", (error) => hydrationMessages.push(error.message));

  await page.setViewportSize({ width: 600, height: 800 });
  const response = await page.goto("http://127.0.0.1:4175/sheet");
  expect(response?.status()).toBe(200);
  await expect(page.getByTestId("nuxt-sheet-trigger")).toBeVisible();
  await expect(page.getByTestId("nuxt-inline-inspector")).toHaveCount(0);

  await page.getByTestId("nuxt-sheet-trigger").click();
  await page.getByTestId("nuxt-inspector-name").fill("Preserved through hosts");
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.getByTestId("nuxt-inline-inspector")).toBeVisible();
  await expect(page.getByTestId("nuxt-sheet")).toHaveCount(0);
  await expect(page.getByTestId("nuxt-inspector-name")).toHaveValue("Preserved through hosts");
  await expect(page.getByTestId("nuxt-inline-heading")).toBeFocused();
  expect(hydrationMessages).toEqual([]);
});
