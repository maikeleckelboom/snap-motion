import { expect, test, type Page } from "@playwright/test";

interface OverlayProof {
  readonly id: "gallery" | "modal" | "sheet";
  readonly dialog: string;
  readonly focusTarget: string;
}

const overlays: readonly OverlayProof[] = [
  {
    id: "modal",
    dialog: "[data-testid='modal-lifecycle-dialog']",
    focusTarget: "[data-testid='modal-focus-target']",
  },
  {
    id: "sheet",
    dialog: ".snap-motion-sheet",
    focusTarget: "[data-testid='sheet-focus-target']",
  },
  {
    id: "gallery",
    dialog: "[data-testid='gallery-lifecycle-dialog']",
    focusTarget: ".snap-motion-media-gallery-header h2",
  },
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

    test(`${overlay.id} reapplies focus policy when an unexpected native close is refused`, async ({
      page,
    }) => {
      await page.goto("./?demo=overlay-lifecycle");
      const dialog = page.locator(overlay.dialog);
      const focusTarget = dialog.locator(overlay.focusTarget);
      const lifecycle = page.getByTestId(`${overlay.id}-lifecycle`);
      const opener = page.getByTestId(`${overlay.id}-open`);

      await opener.click();
      await expect(dialog).toHaveAttribute("open", "");
      await expect(focusTarget).toBeFocused();
      await expect(lifecycle).toHaveAttribute("data-opened", "1");

      for (let attempt = 0; attempt < 2; attempt += 1) {
        await page.evaluate((id) => {
          window.dispatchEvent(
            new CustomEvent("snap-motion-overlay-lifecycle", {
              detail: { action: "refuse-native-close", id },
            }),
          );
        }, overlay.id);
        await dialog.evaluate((element) => (element as HTMLDialogElement).close());

        await expect(dialog).toHaveAttribute("open", "");
        await expect(focusTarget).toBeFocused();
        await yieldTwoRenderOpportunities(page);
        await expect(focusTarget).toBeFocused();
        await expect(lifecycle).toHaveAttribute("data-opened", "1");
        await expect(lifecycle).toHaveAttribute("data-closed", "0");
      }

      if (overlay.id === "gallery") {
        await expect
          .poll(() => page.evaluate(() => document.documentElement.style.overflow))
          .toBe("hidden");
      }
    });
  }

  test("a gallery can close back into an underlying modal without losing either focus return", async ({
    page,
  }) => {
    await page.goto("./?demo=overlay-lifecycle");
    const pageOpener = page.getByTestId("nested-modal-open");
    const modal = page.getByTestId("nested-modal");
    const galleryOpener = page.getByTestId("nested-gallery-open");
    const gallery = page.getByTestId("nested-gallery");

    await pageOpener.click();
    await expect(modal).toHaveAttribute("open", "");
    await expect(galleryOpener).toBeFocused();

    await galleryOpener.click();
    await expect(gallery).toHaveAttribute("open", "");
    await expect(page.locator("dialog[open]")).toHaveCount(2);
    await expect(gallery.locator(":focus")).toHaveCount(1);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.style.overflow))
      .toBe("hidden");

    await gallery.getByRole("button", { name: "Close gallery" }).click();
    await expect(gallery).not.toHaveAttribute("open", "");
    await expect(modal).toHaveAttribute("open", "");
    await expect(galleryOpener).toBeFocused();
    await expect.poll(() => page.evaluate(() => document.documentElement.style.overflow)).toBe("");

    await modal.getByRole("button", { name: "Close" }).click();
    await expect(modal).not.toHaveAttribute("open", "");
    await expect(pageOpener).toBeFocused();
  });
});
