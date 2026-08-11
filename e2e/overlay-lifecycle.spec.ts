import { expect, test, type Page } from "@playwright/test";

interface OverlayProof {
  readonly id: "gallery" | "modal" | "sheet";
  readonly dialog: string;
}

const overlays: readonly OverlayProof[] = [
  { id: "modal", dialog: ".snap-motion-dialog" },
  { id: "sheet", dialog: ".snap-motion-sheet" },
  { id: "gallery", dialog: ".snap-motion-media-gallery" },
];

async function yieldTwoRenderOpportunities(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

test.describe("overlay lifecycle generations", () => {
  for (const overlay of overlays) {
    test(`${overlay.id} ignores stale native close delivery`, async ({ page }) => {
      await page.goto("./?demo=overlay-lifecycle");
      const dialog = page.locator(overlay.dialog);
      const lifecycle = page.getByTestId(`${overlay.id}-lifecycle`);
      const opener = page.getByTestId(`${overlay.id}-open`);

      await opener.focus();
      await expect(opener).toBeFocused();
      await opener.click();
      await expect(dialog).toHaveAttribute("open", "");
      await expect(lifecycle).toHaveAttribute("data-opened", "1");

      await page.evaluate((id) => {
        window.dispatchEvent(
          new CustomEvent("snap-motion-overlay-lifecycle", { detail: { action: "reopen", id } }),
        );
      }, overlay.id);
      await expect(dialog).toHaveAttribute("open", "");
      await expect(lifecycle).toHaveAttribute("data-opened", "2");
      await yieldTwoRenderOpportunities(page);
      await expect(lifecycle).toHaveAttribute("data-closed", "0");
      await expect(dialog.locator(":focus")).toHaveCount(1);

      await page.evaluate((id) => {
        window.dispatchEvent(
          new CustomEvent("snap-motion-overlay-lifecycle", { detail: { action: "race", id } }),
        );
      }, overlay.id);
      await expect(dialog).not.toHaveAttribute("open", "");
      await expect(lifecycle).toHaveAttribute("data-opened", "3");
      await expect(lifecycle).toHaveAttribute("data-closed", "1");
      await expect(opener).toBeFocused();

      if (overlay.id === "gallery") {
        await expect
          .poll(() => page.evaluate(() => document.documentElement.style.overflow))
          .toBe("");
      }
    });
  }
});
