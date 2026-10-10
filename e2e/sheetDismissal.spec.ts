import { expect, test, type Page } from "@playwright/test";

import { openLabDemo, setNumericInput } from "./helpers";
import { openEditor, openPlayground } from "./playgroundHelpers";

async function configure(page: Page, values: Record<string, number>) {
  for (const [name, value] of Object.entries(values)) {
    const field = page.getByRole("spinbutton", { name, exact: true });
    if (!(await field.isVisible())) {
      await page
        .locator(".physics-group")
        .filter({ hasText: name === "Control impulse" ? "Buttons & keys" : "Settling precision" })
        .locator("summary")
        .click();
    }
    await setNumericInput(field, value);
  }
}

const springs = {
  slow: {
    Stiffness: 50,
    Damping: 28,
    Mass: 4,
    "Rest speed": 0.1,
    "Rest distance": 0.01,
    "Control impulse": 0,
  },
  bounce: {
    Stiffness: 50,
    Damping: 1,
    Mass: 4,
    "Rest speed": 0.1,
    "Rest distance": 0.01,
    "Control impulse": 0,
  },
  balanced: {},
};

for (const side of ["top", "right", "bottom", "left"] as const) {
  for (const [spring, values] of Object.entries(springs)) {
    test(`${side} ${spring} releases the native modal at its rendered exit boundary`, async ({
      page,
    }) => {
      await page.clock.install();
      await openLabDemo(page, "sheet", "reduce");
      await configure(page, values);
      await page.getByTestId("sheet-side-select").selectOption(side);
      await page.getByTestId("open-sheet").click();
      // Start from canonical open geometry, then observe the physical close frame by frame.
      const dialog = page.getByTestId("sheet");
      await expect(dialog).toHaveAttribute("data-sheet-state", "open");
      await page.getByTestId("reduced-motion-mode").evaluate((element) => {
        (element as HTMLSelectElement).value = "no-preference";
        element.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await expect(dialog).toHaveAttribute("data-reduced-motion", "false");
      await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 1000)));
      await dialog.evaluate((element) => {
        const nativeClose = (element as HTMLDialogElement).close.bind(element);
        (element as HTMLDialogElement).close = () => {
          const panel = element.querySelector<HTMLElement>(".snap-motion-sheet-panel")!;
          const box = panel.getBoundingClientRect();
          const clip = element.getBoundingClientRect();
          const attachedSide = element.getAttribute("data-sheet-side");
          const overlap =
            attachedSide === "bottom"
              ? clip.bottom - box.top
              : attachedSide === "top"
                ? box.bottom - clip.top
                : attachedSide === "right"
                  ? clip.right - box.left
                  : box.right - clip.left;
          element.setAttribute("data-exit-overlap", String(overlap));
          element.setAttribute(
            "data-exit-position",
            panel.style.getPropertyValue("--snap-motion-sheet-canonical-position"),
          );
          nativeClose();
        };
      });
      await page.keyboard.press("Escape");
      let frames = 0;
      for (; frames < 1000; frames++) {
        await page.clock.runFor(16);
        if (!(await dialog.evaluate((element) => (element as HTMLDialogElement).open))) break;
        // While any meaningful part remains, the document still belongs to the native modal.
        expect(await dialog.evaluate((element) => element.matches(":modal"))).toBe(true);
      }
      expect(frames).toBeLessThan(1000);
      expect(Number(await dialog.getAttribute("data-exit-overlap"))).toBeLessThanOrEqual(0.5);
      const final = await dialog.locator(".snap-motion-sheet-panel").evaluate((element) => {
        const style = (element as HTMLElement).style;
        return {
          position: parseFloat(style.getPropertyValue("--snap-motion-sheet-canonical-position")),
          extent: parseFloat(style.getPropertyValue("--snap-motion-sheet-primary-surface-extent")),
          hint: style.willChange,
        };
      });
      expect(final.position).toBe(final.extent + 1);
      expect(final.hint).toBe("auto");
      if (spring === "slow" || spring === "bounce") {
        // The published exit frame precedes exact mathematical rest, even at high velocity.
        expect(parseFloat((await dialog.getAttribute("data-exit-position"))!)).not.toBe(
          final.position,
        );
      }
      await page.clock.runFor(32);
      await expect(page.getByTestId("open-sheet")).toBeFocused();
      await page.getByTestId("sheet-side-select").selectOption(side === "left" ? "right" : "left");
      await expect(dialog).toHaveAttribute("data-sheet-side", side === "left" ? "right" : "left");
      expect(
        await page.evaluate(() => getComputedStyle(document.documentElement).overflow),
      ).not.toBe("hidden");
    });
  }
}

for (const width of [1280, 390]) {
  test(`public slow exit preserves sticky header, gutter and scroll position at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await openPlayground(page, "no-preference");
    await openEditor(page, "sheet");
    await configure(page, springs.slow);
    await page.getByRole("button", { name: "Close editor", exact: true }).click();
    await page.getByTestId("open-sheet").scrollIntoViewIfNeeded();
    const measure = () =>
      page.evaluate(() => ({
        scroll: scrollY,
        width: document.documentElement.clientWidth,
        header: document.querySelector(".pg-bar")?.getBoundingClientRect().top,
        body: getComputedStyle(document.body).overflowY,
      }));
    const before = await measure();
    await page.getByTestId("open-sheet").click();
    await expect(page.getByTestId("sheet")).toHaveAttribute("data-sheet-state", "open", {
      timeout: 15000,
    });
    const during = await measure();
    expect(during).toEqual(before);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("sheet")).not.toBeVisible();
    await expect(page.getByTestId("open-sheet")).toBeFocused();
    expect(await measure()).toEqual(before);
    await page.mouse.wheel(0, -300);
    await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(before.scroll);
  });
}
