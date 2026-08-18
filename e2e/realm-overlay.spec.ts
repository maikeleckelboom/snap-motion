import { expect, test } from "@playwright/test";

test("Gallery restores focus to an opener from an iframe realm", async ({ page }) => {
  await page.goto("./?demo=realm-overlay");
  const frame = page.getByTestId("realm-frame").contentFrame();
  const opener = frame.getByTestId("realm-parent-opener");

  await opener.click();
  const gallery = page.getByTestId("snap-motion-media-gallery");
  await expect(gallery).toHaveAttribute("open", "");
  await gallery.getByRole("button", { name: "Close gallery" }).click();
  await expect(gallery).not.toHaveAttribute("open", "");
  await expect(opener).toBeFocused();
});

test("adopted-document Gallery images promote full media and release scroll lock", async ({
  page,
}) => {
  await page.goto("./?demo=realm-overlay");
  const frame = page.getByTestId("realm-frame").contentFrame();
  const opener = frame.getByTestId("realm-adopted-opener");

  await opener.click();
  const gallery = frame.getByTestId("snap-motion-media-gallery");
  await expect(gallery).toHaveAttribute("open", "");
  await expect(gallery).toHaveAttribute("data-image-state", "loaded");
  await expect(gallery.getByRole("img")).toHaveAccessibleName("A neutral cross-realm image proof");
  await expect
    .poll(() => frame.locator("html").evaluate((element) => element.style.overflow))
    .toBe("hidden");

  await gallery.getByRole("button", { name: "Close gallery" }).click();
  await expect(gallery).not.toHaveAttribute("open", "");
  await expect(opener).toBeFocused();
  await expect
    .poll(() => frame.locator("html").evaluate((element) => element.style.overflow))
    .toBe("");
});
