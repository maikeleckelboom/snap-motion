import { expect, test, type Page } from "@playwright/test";

interface OverlayProof {
  readonly closeName: string;
  readonly id: "gallery" | "modal" | "sheet";
  readonly dialog: string;
  readonly focusTarget: string;
  readonly followUp: string;
}

const overlays: readonly OverlayProof[] = [
  {
    closeName: "Close dialog",
    id: "modal",
    dialog: "[data-testid='modal-lifecycle-dialog']",
    focusTarget: "[data-testid='modal-focus-target']",
    followUp: "[data-testid='modal-follow-up']",
  },
  {
    closeName: "Close sheet",
    id: "sheet",
    dialog: ".snap-motion-sheet",
    focusTarget: "[data-testid='sheet-focus-target']",
    followUp: "[data-testid='sheet-follow-up']",
  },
  {
    closeName: "Close gallery",
    id: "gallery",
    dialog: "[data-testid='gallery-lifecycle-dialog']",
    focusTarget: ".snap-motion-media-gallery-header h2",
    followUp: "[data-testid='gallery-follow-up']",
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

async function installFocusVerificationFrameGate(page: Page) {
  await page.evaluate(() => {
    const view = window as typeof window & {
      snapMotionFocusFrameGate?: {
        flushAll(): void;
        pending(): number;
        restore(): void;
      };
    };
    const originalRequest = window.requestAnimationFrame.bind(window);
    const originalCancel = window.cancelAnimationFrame.bind(window);
    const callbacks = new Map<number, FrameRequestCallback>();
    let nextFrame = 1_000_000;
    window.requestAnimationFrame = (callback) => {
      const frame = nextFrame;
      nextFrame += 1;
      callbacks.set(frame, callback);
      return frame;
    };
    window.cancelAnimationFrame = (frame) => {
      if (!callbacks.delete(frame)) originalCancel(frame);
    };
    view.snapMotionFocusFrameGate = {
      flushAll() {
        let remaining = 20;
        while (callbacks.size > 0 && remaining > 0) {
          const entries = [...callbacks.entries()];
          callbacks.clear();
          for (const [, callback] of entries) callback(performance.now());
          remaining -= 1;
        }
        if (callbacks.size > 0) throw new Error("Focus verification exceeded its frame bound.");
      },
      pending: () => callbacks.size,
      restore() {
        window.requestAnimationFrame = originalRequest;
        window.cancelAnimationFrame = originalCancel;
        delete view.snapMotionFocusFrameGate;
      },
    };
  });
}

async function flushFocusVerificationFrames(page: Page) {
  return page.evaluate(() => {
    const gate = (
      window as typeof window & {
        snapMotionFocusFrameGate?: {
          flushAll(): void;
          pending(): number;
          restore(): void;
        };
      }
    ).snapMotionFocusFrameGate;
    if (!gate) throw new Error("Focus verification frame gate is not installed.");
    gate.flushAll();
    const pending = gate.pending();
    gate.restore();
    return pending;
  });
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

    test(`${overlay.id} hands returned focus to immediate keyboard, pointer, and application owners`, async ({
      browserName,
      page,
    }) => {
      await page.goto("./?demo=overlay-lifecycle");
      const dialog = page.locator(overlay.dialog);
      const opener = page.getByTestId(`${overlay.id}-open`);
      const followUp = page.locator(overlay.followUp);
      const close = () => dialog.getByRole("button", { name: overlay.closeName, exact: true });

      await opener.click();
      await expect(dialog).toHaveAttribute("open", "");
      await installFocusVerificationFrameGate(page);
      await close().click();
      await expect(dialog).not.toHaveAttribute("open", "");
      await expect(opener).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(followUp).toBeFocused();
      expect(await flushFocusVerificationFrames(page)).toBe(0);
      await expect(followUp).toBeFocused();

      await opener.click();
      await expect(dialog).toHaveAttribute("open", "");
      await installFocusVerificationFrameGate(page);
      await close().click();
      await expect(dialog).not.toHaveAttribute("open", "");
      await expect(opener).toBeFocused();
      await followUp.click();
      expect(await flushFocusVerificationFrames(page)).toBe(0);
      await expect(followUp).toBeFocused();

      await opener.click();
      await expect(dialog).toHaveAttribute("open", "");
      await opener.evaluate((element, followUpSelector) => {
        const view = window as typeof window & { snapMotionFocusTrace?: string[] };
        view.snapMotionFocusTrace = [];
        document.addEventListener(
          "focusin",
          (event) => {
            const target = event.target as HTMLElement;
            view.snapMotionFocusTrace?.push(target.dataset.testid ?? target.tagName);
          },
          true,
        );
        const applicationTarget = document.querySelector<HTMLElement>(followUpSelector);
        if (!applicationTarget) {
          throw new Error(`Missing focus handoff target: ${followUpSelector}`);
        }
        element.addEventListener("focus", () => queueMicrotask(() => applicationTarget.focus()), {
          once: true,
        });
      }, overlay.followUp);
      await installFocusVerificationFrameGate(page);
      await close().click();
      await expect(dialog).not.toHaveAttribute("open", "");
      await page.evaluate(() => Promise.resolve());
      await opener.focus();
      expect(await flushFocusVerificationFrames(page)).toBe(0);
      await expect(followUp).toBeFocused();
      if (browserName === "chromium") {
        const trace = await page.evaluate(
          () =>
            (window as typeof window & { snapMotionFocusTrace?: string[] }).snapMotionFocusTrace ??
            [],
        );
        const handoffIndex = trace.indexOf(`${overlay.id}-follow-up`);
        expect(handoffIndex).toBeGreaterThan(-1);
        expect(trace.slice(0, handoffIndex)).toContain(`${overlay.id}-open`);
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

    await installFocusVerificationFrameGate(page);
    await galleryOpener.click();
    await expect(gallery).toHaveAttribute("open", "");
    expect(await flushFocusVerificationFrames(page)).toBe(0);
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

    await page.keyboard.press("Tab");
    const modalClose = modal.getByRole("button", { name: "Close dialog", exact: true });
    await expect(modalClose).toBeFocused();
    await yieldTwoRenderOpportunities(page);
    await expect(modalClose).toBeFocused();

    await modalClose.click();
    await expect(modal).not.toHaveAttribute("open", "");
    await expect(pageOpener).toBeFocused();
  });
});
