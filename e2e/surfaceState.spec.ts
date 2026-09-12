import { expect, test } from "@playwright/test";

import { dragTouchBy, openLabDemo } from "./helpers";

test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

for (const surface of ["coverflow", "stacked-deck"] as const) {
  test(`${surface} retains canonical and settled emphasis after touch and focus departure`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await openLabDemo(page, surface, "no-preference");
    const root = page.getByTestId(`${surface}-viewport`);
    const active = root.locator('[data-snap-motion-item][data-active="true"]');
    await expect(active).toHaveCount(1);
    const initial = await active.getAttribute("data-item-id");
    await root.tap({ position: { x: 8, y: 8 } });
    await expect(active).toHaveAttribute("data-item-id", initial!);
    await dragTouchBy(page, active, -210, 0);
    await expect(root).toHaveAttribute("data-phase", "idle");
    await expect(active).not.toHaveAttribute("data-item-id", initial!);
    const settled = await active.getAttribute("data-item-id");
    await expect(active).toHaveAttribute("data-settled", "true");
    await expect(active).toHaveAttribute("data-visual", "true");
    await expect(root).toHaveAttribute("data-settled-id", settled!);
    expect(await root.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe("none");
    // Focus leaves the deck entirely. Selection must survive idle frames without hover or press.
    await root.evaluate((element) => (element as HTMLElement).blur());
    const observed = await root.evaluate(async (element) => {
      const states: string[] = [];
      for (let frame = 0; frame < 90; frame++) {
        await new Promise(requestAnimationFrame);
        states.push(
          [
            ...element.querySelectorAll(
              '[data-snap-motion-item][data-active="true"][data-settled="true"]',
            ),
          ]
            .map((card) => card.getAttribute("data-item-id"))
            .join(","),
        );
      }
      return states;
    });
    expect(new Set(observed)).toEqual(new Set([settled]));
    // Re-enter with native keyboard navigation; programmatic focus is not keyboard modality.
    await root.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(root).toBeFocused();
    await root.press("ArrowRight");
    await expect(root).toHaveAttribute("data-phase", "idle");
    await expect(active).not.toHaveAttribute("data-item-id", settled!);
    expect(await root.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe("solid");
    await expect(active).toHaveAttribute("data-settled", "true");
    expect(errors).toEqual([]);
  });
}
