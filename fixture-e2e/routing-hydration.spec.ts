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
  await page.getByRole("button", { name: "Close dialog" }).click();
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
