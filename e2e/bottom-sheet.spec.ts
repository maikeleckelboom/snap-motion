import { expect, test } from "@playwright/test";

import {
  dragMouseBy,
  dragSyntheticPointerBy,
  expectSheetOpenAt,
  openLabDemo,
  setNumericInput,
} from "./helpers";

async function openSheet(page: Parameters<typeof openLabDemo>[0]) {
  const opener = page.getByTestId("open-sheet");
  const dialog = page.getByTestId("bottom-sheet");
  await opener.click();
  await expectSheetOpenAt(dialog, "comfortable");
  return { dialog, opener };
}

async function panelTop(page: Parameters<typeof openLabDemo>[0]) {
  const box = await page.getByTestId("sheet-panel").boundingBox();
  if (!box) {
    throw new Error("Bottom-sheet panel has no layout box.");
  }
  return box.y;
}

async function scrimOpacity(page: Parameters<typeof openLabDemo>[0]) {
  return page
    .getByTestId("sheet-scrim")
    .evaluate((element) => Number.parseFloat(getComputedStyle(element).opacity));
}

test.describe("bottom sheet", () => {
  test("opens at comfortable, exposes semantic snaps, and derives scrim opacity from position", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1_000, height: 800 });
    await openLabDemo(page, "sheet");
    const { dialog } = await openSheet(page);

    expect(Math.abs((await panelTop(page)) - 180)).toBeLessThanOrEqual(3);
    const comfortableOpacity = await scrimOpacity(page);

    await page.getByTestId("snap-full").click();
    await expectSheetOpenAt(dialog, "full");
    expect(Math.abs((await panelTop(page)) - 24)).toBeLessThanOrEqual(3);
    const fullOpacity = await scrimOpacity(page);

    await page.getByTestId("snap-compact").click();
    await expectSheetOpenAt(dialog, "compact");
    expect(Math.abs((await panelTop(page)) - 440)).toBeLessThanOrEqual(3);
    const compactOpacity = await scrimOpacity(page);

    expect(fullOpacity).toBeGreaterThan(comfortableOpacity);
    expect(comfortableOpacity).toBeGreaterThan(compactOpacity);
    expect(compactOpacity).toBeGreaterThan(0);
  });

  test("supports slow snap drags and bounded top elasticity", async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 800 });
    await openLabDemo(page, "sheet");
    const { dialog } = await openSheet(page);
    const handle = page.getByTestId("sheet-handle");

    await dragMouseBy(page, handle, 0, 260, { stepDelay: 55, steps: 13 });
    await expectSheetOpenAt(dialog, "compact");

    await dragMouseBy(page, handle, 0, -420, { stepDelay: 55, steps: 14 });
    await expectSheetOpenAt(dialog, "full");

    await dragSyntheticPointerBy(page, handle, 0, -180, {
      beforeRelease: async () => {
        await expect(dialog).toHaveAttribute("data-sheet-state", "dragging");
        const overdraggedTop = await panelTop(page);
        expect(overdraggedTop).toBeLessThan(24);
        expect(overdraggedTop).toBeGreaterThan(-100);
      },
      stepDelay: 35,
      steps: 9,
    });
    await expectSheetOpenAt(dialog, "full");
  });

  test("closes from high release velocity, scrim, and Escape while restoring focus", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 900, height: 760 });
    await openLabDemo(page, "sheet");
    await setNumericInput(page.getByLabel("Fling threshold"), 100);

    let opened = await openSheet(page);
    await expect(page.getByTestId("close-sheet")).toBeFocused();
    await dragMouseBy(page, page.getByTestId("sheet-handle"), 0, 90, {
      stepDelay: 0,
      steps: 1,
    });
    await expect(opened.dialog).not.toBeVisible();
    await expect(opened.opener).toBeFocused();

    opened = await openSheet(page);
    await page.getByTestId("sheet-scrim").click({ position: { x: 8, y: 8 } });
    await expect(opened.dialog).not.toBeVisible();
    await expect(opened.opener).toBeFocused();

    opened = await openSheet(page);
    await page.keyboard.press("Escape");
    await expect(opened.dialog).not.toBeVisible();
    await expect(opened.opener).toBeFocused();
  });

  test("preserves the compact semantic snap through resize and keeps body scrolling independent", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 900, height: 800 });
    await openLabDemo(page, "sheet");
    const { dialog } = await openSheet(page);

    await page.getByTestId("snap-compact").click();
    await expectSheetOpenAt(dialog, "compact");
    expect(Math.abs((await panelTop(page)) - 440)).toBeLessThanOrEqual(3);

    const body = page.getByTestId("sheet-body");
    const bodySizes = await body.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }));
    expect(bodySizes.scrollHeight).toBeGreaterThan(bodySizes.clientHeight);
    await body.hover();
    await page.mouse.wheel(0, 600);
    await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await expectSheetOpenAt(dialog, "compact");

    await page.setViewportSize({ width: 800, height: 600 });
    await expectSheetOpenAt(dialog, "compact");
    expect(Math.abs((await panelTop(page)) - 240)).toBeLessThanOrEqual(3);

    await page.setViewportSize({ width: 600, height: 900 });
    await expectSheetOpenAt(dialog, "compact");
    expect(Math.abs((await panelTop(page)) - 540)).toBeLessThanOrEqual(3);
  });

  test("reduced motion completes immediately while full motion remains interruptible", async ({
    page,
  }) => {
    await openLabDemo(page, "sheet");
    let opened = await openSheet(page);

    await page.getByTestId("snap-full").click();
    await expectSheetOpenAt(opened.dialog, "full");
    await page.getByTestId("close-sheet").click();
    await expect(opened.dialog).not.toBeVisible();

    await page.getByTestId("reduced-motion-mode").selectOption("no-preference");
    await page.getByLabel("Preset").selectOption("loose");
    opened = await openSheet(page);

    await page.getByTestId("snap-full").click();
    await expect(opened.dialog).toHaveAttribute("data-sheet-state", "settling");
    await page.getByTestId("snap-compact").click();
    await expectSheetOpenAt(opened.dialog, "compact");

    await page.getByTestId("snap-full").click();
    await expect(opened.dialog).toHaveAttribute("data-sheet-state", "settling");
    await dragSyntheticPointerBy(page, page.getByTestId("sheet-handle"), 0, 40, {
      beforeRelease: async () => {
        await expect(opened.dialog).toHaveAttribute("data-sheet-state", "dragging");
      },
      stepDelay: 20,
      steps: 4,
    });
    await expect(opened.dialog).toHaveAttribute("data-sheet-state", "open", {
      timeout: 8_000,
    });
    await expect(opened.dialog).toBeVisible();
  });
});
