import { expect, test } from "@playwright/test";

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

  await page.getByRole("button", { name: "Refuse requests" }).evaluate((element) => {
    (element as HTMLButtonElement).click();
  });
  await page.getByRole("button", { name: "Next item" }).click();
  await expect(page.getByTestId("router-authority")).toHaveAttribute(
    "data-request-sequence",
    "system,outcome",
  );
  await expect(page).toHaveURL(/\/work\/factif\/media\/system$/);
  await expect(page.locator(".snap-motion-carousel-viewport")).toHaveAttribute(
    "data-active-id",
    "system",
  );
  await expect(page.locator(".snap-motion-carousel [role='status']")).toContainText(
    "System detail",
  );
  await expect(page.getByTestId("router-authority")).toHaveAttribute(
    "data-settled-sequence",
    "system",
  );

  await page.getByRole("button", { name: "Delay requests" }).evaluate((element) => {
    (element as HTMLButtonElement).click();
  });
  await page.getByRole("button", { name: "Next item" }).click();
  await expect(page.getByTestId("router-authority")).toHaveAttribute(
    "data-request-sequence",
    "system,outcome,outcome",
  );
  await expect(page).toHaveURL(/\/work\/factif\/media\/system$/);
  await expect(page.locator(".snap-motion-carousel-viewport")).toHaveAttribute(
    "data-active-id",
    "system",
  );
  await expect(page.getByTestId("router-authority")).toHaveAttribute(
    "data-settled-sequence",
    "system",
  );
  await page.evaluate(() => window.dispatchEvent(new Event("snap-motion:resolve-pending")));
  await expect(page).toHaveURL(/\/work\/factif\/media\/outcome$/);
  await expect(page.locator(".snap-motion-carousel-viewport")).toHaveAttribute(
    "data-active-id",
    "outcome",
  );
  await expect(page.getByTestId("router-authority")).toHaveAttribute(
    "data-settled-sequence",
    "system,outcome",
  );

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

  await page.getByRole("button", { name: "Refuse requests" }).evaluate((element) => {
    (element as HTMLButtonElement).click();
  });
  await page.getByRole("button", { name: "Next item" }).click();
  await expect(page.getByTestId("nuxt-authority")).toHaveAttribute(
    "data-request-sequence",
    "system,outcome",
  );
  await expect(page).toHaveURL(/\?media=system$/);
  await expect(
    page.locator('dialog[open][data-testid="snap-motion-media-gallery"]'),
  ).toHaveAttribute("data-active-id", "system");
  await expect(gallery.getByTestId("snap-motion-media-gallery-status")).not.toContainText(
    "Measured outcome",
  );
  await expect(gallery).toHaveAttribute("data-settled-id", "system");
  await expect(gallery).toHaveAttribute("data-track-state", "idle");
  await expect(page.getByTestId("nuxt-authority")).toHaveAttribute(
    "data-settled-sequence",
    "system",
  );

  await page.getByRole("button", { name: "Delay requests" }).evaluate((element) => {
    (element as HTMLButtonElement).click();
  });
  await page.getByRole("button", { name: "Next item" }).click();
  await expect(page.getByTestId("nuxt-authority")).toHaveAttribute(
    "data-request-sequence",
    "system,outcome,outcome",
  );
  await expect(page).toHaveURL(/\?media=system$/);
  await expect(gallery).toHaveAttribute("data-active-id", "system");
  await expect(page.getByTestId("nuxt-authority")).toHaveAttribute(
    "data-settled-sequence",
    "system",
  );
  await page.evaluate(() => window.dispatchEvent(new Event("snap-motion:resolve-pending")));
  await expect(page).toHaveURL(/\?media=outcome$/);
  await expect(gallery).toHaveAttribute("data-active-id", "outcome");
  await expect(gallery).toHaveAttribute("data-settled-id", "outcome");
  await expect(page.getByTestId("nuxt-authority")).toHaveAttribute(
    "data-settled-sequence",
    "system,outcome",
  );

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
