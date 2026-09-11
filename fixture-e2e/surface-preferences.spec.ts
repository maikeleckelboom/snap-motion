import { expect, test } from "@playwright/test";

import { certifySurfaceFocus } from "../scripts/certifySurfacePreferences.ts";

test("spatial surfaces distinguish pointer, keyboard and forced-colors focus", async ({ page }) => {
  await page.goto("http://127.0.0.1:4175/surfaces");
  await page.locator("[data-preference-ready]").waitFor();
  await certifySurfaceFocus(page);
});

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`Nuxt wide Coverflow hydrates with ${reducedMotion} before navigation`, async ({ page }) => {
    const diagnostics: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error" || /hydration|mismatch/i.test(message.text()))
        diagnostics.push(message.text());
    });
    page.on("pageerror", (error) => diagnostics.push(error.message));
    await page.emulateMedia({ reducedMotion });
    await page.goto("http://127.0.0.1:4175/surfaces?width=720");
    await page.locator("[data-preference-ready]").waitFor();
    const rail = page.locator(".snap-motion-coverflow");
    await expect(rail).toHaveAttribute("data-reduced-motion", String(reducedMotion === "reduce"));
    expect(
      await rail.evaluate((element) =>
        Number.parseFloat(
          getComputedStyle(element).getPropertyValue("--snap-motion-coverflow-card-width"),
        ),
      ),
    ).toBeGreaterThan(420);
    await rail.focus();
    await page.keyboard.press("ArrowRight");
    await expect(rail).toHaveAttribute("data-active-id", "team");
    await expect(rail).toHaveAttribute("data-settled-id", "team");
    await expect(rail).toBeFocused();
    expect(diagnostics).toEqual([]);
  });
}
