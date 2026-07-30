import { expect, test, type Page } from "@playwright/test";

import {
  dragMouseBy,
  dragSyntheticPointerBy,
  expectSheetOpenAt,
  openLabDemo,
  setNumericInput,
} from "./helpers";

type OpenSnapId = "compact" | "comfortable" | "full";

interface SheetGeometrySnapshot {
  bodyBottom: number;
  bodyClientHeight: number;
  bodyScrollHeight: number;
  bodyScrollTop: number;
  bodyTop: number;
  chromeHeight: number;
  finalBottom?: number;
  finalTop?: number;
  maximumScrollTop: number;
  panelTop: number;
  viewportBottom: number;
  viewportHeight: number;
  viewportTop: number;
  visualViewportHeight: number;
}

const collectedPageErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  collectedPageErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" ||
      /hydration|resizeobserver loop|unhandled promise/i.test(message.text())
    ) {
      errors.push(`${message.type()}: ${message.text()}`);
    }
  });
});

test.afterEach(async ({ page }) => {
  expect(collectedPageErrors.get(page) ?? []).toEqual([]);
});

function sheetPanel(page: Page) {
  return page.locator(".snap-motion-sheet-panel");
}

function sheetBody(page: Page) {
  return page.locator(".snap-motion-sheet-body");
}

function sheetHandle(page: Page) {
  return page.locator(".snap-motion-sheet-drag-region");
}

function sheetScrim(page: Page) {
  return page.locator(".snap-motion-sheet-scrim");
}

function sheetClose(page: Page) {
  return page.locator(".snap-motion-sheet-close");
}

function snapControl(page: Page, id: OpenSnapId) {
  return page.getByTestId("bottom-sheet").locator(`input[type="radio"][value="${id}"]`);
}

async function openSheet(page: Page) {
  const opener = page.getByTestId("open-sheet");
  const dialog = page.getByTestId("bottom-sheet");
  await opener.click();
  await expectSheetOpenAt(dialog, "comfortable");
  return { dialog, opener };
}

async function geometrySnapshot(page: Page): Promise<SheetGeometrySnapshot> {
  return page.getByTestId("bottom-sheet").evaluate((dialog) => {
    const panel = dialog.querySelector<HTMLElement>(".snap-motion-sheet-panel");
    const viewport = dialog.querySelector<HTMLElement>(".snap-motion-sheet-viewport");
    const chrome = dialog.querySelector<HTMLElement>(".snap-motion-sheet-chrome");
    const body = dialog.querySelector<HTMLElement>(".snap-motion-sheet-body");
    const finalRow = dialog.querySelector<HTMLElement>('[data-testid="final-note-row"]');
    if (!panel || !viewport || !chrome || !body) {
      throw new Error("Expected the complete bottom-sheet geometry structure.");
    }
    const panelRect = panel.getBoundingClientRect();
    const viewportRect = viewport.getBoundingClientRect();
    const chromeRect = chrome.getBoundingClientRect();
    const bodyRect = body.getBoundingClientRect();
    const finalRect = finalRow?.getBoundingClientRect();
    return {
      bodyBottom: bodyRect.bottom,
      bodyClientHeight: body.clientHeight,
      bodyScrollHeight: body.scrollHeight,
      bodyScrollTop: body.scrollTop,
      bodyTop: bodyRect.top,
      chromeHeight: chromeRect.height,
      ...(finalRect ? { finalBottom: finalRect.bottom, finalTop: finalRect.top } : {}),
      maximumScrollTop: Math.max(0, body.scrollHeight - body.clientHeight),
      panelTop: panelRect.top,
      viewportBottom: viewportRect.bottom,
      viewportHeight: viewportRect.height,
      viewportTop: viewportRect.top,
      visualViewportHeight: window.visualViewport?.height ?? window.innerHeight,
    };
  });
}

function expectedPhysicalY(id: OpenSnapId, viewportHeight: number, topGap = 24) {
  if (id === "full") return topGap;
  if (id === "comfortable") return Math.max(topGap, viewportHeight - 620);
  return Math.max(topGap, viewportHeight - 360);
}

async function expectSettledGeometry(page: Page, id: OpenSnapId, topGap = 24) {
  const dialog = page.getByTestId("bottom-sheet");
  await expectSheetOpenAt(dialog, id);
  const geometry = await geometrySnapshot(page);
  const expectedY = expectedPhysicalY(id, geometry.visualViewportHeight, topGap);

  expect(Math.abs(geometry.panelTop - expectedY), `${id} physical panel top`).toBeLessThanOrEqual(
    2,
  );
  expect(
    Math.abs(geometry.viewportTop - expectedY),
    `${id} visible viewport top`,
  ).toBeLessThanOrEqual(2);
  expect(
    Math.abs(geometry.viewportBottom - geometry.visualViewportHeight),
    `${id} visible viewport bottom`,
  ).toBeLessThanOrEqual(2);
  expect(
    Math.abs(geometry.bodyClientHeight - (geometry.viewportHeight - geometry.chromeHeight)),
    `${id} body client height`,
  ).toBeLessThanOrEqual(2);
  return geometry;
}

async function scrollFinalRowIntoView(page: Page) {
  const body = sheetBody(page);
  await body.evaluate((element) => element.scrollTo(0, element.scrollHeight));
  await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  const geometry = await geometrySnapshot(page);

  expect(
    Math.abs(geometry.bodyScrollTop - geometry.maximumScrollTop),
    "native maximum scroll offset",
  ).toBeLessThanOrEqual(1);
  expect(geometry.finalTop, "final row top").toBeGreaterThanOrEqual(geometry.bodyTop - 1);
  expect(geometry.finalBottom, "final row bottom").toBeLessThanOrEqual(geometry.bodyBottom + 1);
  return geometry;
}

test.describe("bottom sheet", () => {
  test("aligns the native scrollport with Full, Comfortable, and Compact visible geometry", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1_000, height: 800 });
    await openLabDemo(page, "sheet");
    await openSheet(page);

    const scrollHeights: number[] = [];
    const clientHeights: number[] = [];
    for (const id of ["full", "comfortable", "compact"] as const) {
      await snapControl(page, id).check();
      const geometry = await expectSettledGeometry(page, id);
      scrollHeights.push(geometry.bodyScrollHeight);
      clientHeights.push(geometry.bodyClientHeight);
      await scrollFinalRowIntoView(page);
      await sheetBody(page).evaluate((element) => element.scrollTo(0, 120));
    }

    expect(Math.max(...scrollHeights) - Math.min(...scrollHeights)).toBeLessThanOrEqual(1);
    expect(clientHeights[0]).toBeGreaterThan(clientHeights[1]!);
    expect(clientHeights[1]).toBeGreaterThan(clientHeights[2]!);

    await snapControl(page, "comfortable").check();
    await expectSettledGeometry(page, "comfortable");
    await sheetBody(page).evaluate((element) => element.scrollTo(0, 120));
    const beforeSnap = (await geometrySnapshot(page)).bodyScrollTop;
    await snapControl(page, "compact").check();
    const afterCompact = (await expectSettledGeometry(page, "compact")).bodyScrollTop;
    await snapControl(page, "full").check();
    const afterFull = (await expectSettledGeometry(page, "full")).bodyScrollTop;
    expect(Math.abs(afterCompact - beforeSnap)).toBeLessThanOrEqual(1);
    expect(Math.abs(afterFull - beforeSnap)).toBeLessThanOrEqual(1);

    await snapControl(page, "compact").check();
    await sheetBody(page).evaluate((element) => element.scrollTo(0, 0));
    await sheetBody(page).focus();
    await page.keyboard.press("End");
    await expect
      .poll(async () => {
        const geometry = await geometrySnapshot(page);
        return Math.abs(geometry.bodyScrollTop - geometry.maximumScrollTop);
      })
      .toBeLessThanOrEqual(1);
    await expectSheetOpenAt(page.getByTestId("bottom-sheet"), "compact");
  });

  test("renders a custom top snap at 80px and preserves bounded top elasticity", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 900, height: 800 });
    await openLabDemo(page, "sheet");
    await page.getByTestId("sheet-snap-mode").selectOption("custom-top");
    const { dialog } = await openSheet(page);

    await snapControl(page, "full").check();
    await expectSettledGeometry(page, "full", 80);

    await dragSyntheticPointerBy(page, sheetHandle(page), 0, -180, {
      beforeRelease: async () => {
        await expect(dialog).toHaveAttribute("data-sheet-state", "dragging");
        const geometry = await geometrySnapshot(page);
        expect(geometry.panelTop).toBeLessThan(80);
        expect(geometry.panelTop).toBeGreaterThan(20);
        expect(
          Math.abs(geometry.viewportBottom - geometry.visualViewportHeight),
        ).toBeLessThanOrEqual(2);
        const continuation = await sheetPanel(page).evaluate((element) => {
          const style = getComputedStyle(element);
          return {
            backgroundColor: style.backgroundColor,
            height: Number.parseFloat(style.height),
          };
        });
        expect(continuation.height).toBeGreaterThanOrEqual(1_600);
      },
      stepDelay: 35,
      steps: 9,
    });
    await expectSettledGeometry(page, "full", 80);
  });

  test("keeps slow drag snapping and native body scrolling independently owned", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 900, height: 800 });
    await openLabDemo(page, "sheet");
    const { dialog } = await openSheet(page);

    await dragMouseBy(page, sheetHandle(page), 0, 260, { stepDelay: 55, steps: 13 });
    await expectSettledGeometry(page, "compact");

    const body = sheetBody(page);
    const panelTopBeforeScroll = (await geometrySnapshot(page)).panelTop;
    await body.hover();
    await page.mouse.wheel(0, 600);
    await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await expectSheetOpenAt(dialog, "compact");
    expect(
      Math.abs((await geometrySnapshot(page)).panelTop - panelTopBeforeScroll),
    ).toBeLessThanOrEqual(2);

    await dragMouseBy(page, sheetHandle(page), 0, -420, { stepDelay: 55, steps: 14 });
    await expectSettledGeometry(page, "full");
  });

  test("responds to wrapped, custom, and hidden chrome using actual measured height", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openLabDemo(page, "sheet");
    await page.locator("html").evaluate((element) => {
      element.style.fontSize = "200%";
    });

    await page.getByTestId("sheet-picker-mode").selectOption("standard");
    let opened = await openSheet(page);
    await snapControl(page, "full").check();
    const standard = await expectSettledGeometry(page, "full");
    await sheetClose(page).click();
    await expect(opened.dialog).not.toBeVisible();

    await page.getByTestId("sheet-picker-mode").selectOption("custom");
    opened = await openSheet(page);
    await snapControl(page, "full").check();
    const custom = await expectSettledGeometry(page, "full");
    await sheetClose(page).click();
    await expect(opened.dialog).not.toBeVisible();

    await page.getByTestId("sheet-picker-mode").selectOption("hidden");
    opened = await openSheet(page);
    const hidden = await expectSettledGeometry(page, "comfortable");

    expect(standard.chromeHeight).toBeGreaterThan(hidden.chromeHeight);
    expect(custom.chromeHeight).toBeGreaterThan(hidden.chromeHeight);
    expect(standard.bodyClientHeight).toBeLessThan(standard.viewportHeight);
    expect(custom.bodyClientHeight).toBeLessThan(custom.viewportHeight);
    expect(hidden.bodyClientHeight).toBeLessThan(hidden.viewportHeight);
    await scrollFinalRowIntoView(page);
    await sheetClose(page).click();
    await expect(opened.dialog).not.toBeVisible();
  });

  test("remeasures dynamically inserted content and leaves short content unpadded", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1_000, height: 800 });
    await openLabDemo(page, "sheet");
    let opened = await openSheet(page);
    const before = await geometrySnapshot(page);

    await page.getByTestId("add-sheet-note").click();
    await expect
      .poll(() => geometrySnapshot(page).then((geometry) => geometry.bodyScrollHeight))
      .toBeGreaterThan(before.bodyScrollHeight);
    await scrollFinalRowIntoView(page);
    await sheetClose(page).click();
    await expect(opened.dialog).not.toBeVisible();

    await page.getByTestId("sheet-content-mode").selectOption("short");
    opened = await openSheet(page);
    await snapControl(page, "full").check();
    const short = await expectSettledGeometry(page, "full");
    expect(short.bodyScrollHeight - short.bodyClientHeight).toBeLessThanOrEqual(1);
    await sheetBody(page).evaluate((element) => element.scrollTo(0, element.scrollHeight));
    expect((await geometrySnapshot(page)).bodyScrollTop).toBe(0);
  });

  test("preserves geometry through desktop, tablet, phone, and orientation changes", async ({
    page,
  }) => {
    for (const viewport of [
      { width: 1_280, height: 900 },
      { width: 768, height: 900 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await openLabDemo(page, "sheet");
      const { dialog } = await openSheet(page);
      await expectSettledGeometry(page, "comfortable");
      await scrollFinalRowIntoView(page);
      await sheetClose(page).click();
      await expect(dialog).not.toBeVisible();
    }

    await page.setViewportSize({ width: 844, height: 390 });
    await openLabDemo(page, "sheet");
    await openSheet(page);
    await snapControl(page, "compact").check();
    await expectSettledGeometry(page, "compact");

    await page.setViewportSize({ width: 390, height: 844 });
    await expectSettledGeometry(page, "compact");
    await scrollFinalRowIntoView(page);
  });

  test("closes from high release velocity, scrim, close button, and Escape while restoring focus", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 900, height: 760 });
    await openLabDemo(page, "sheet");
    await setNumericInput(page.getByLabel("Fling threshold"), 100);

    let opened = await openSheet(page);
    await expect(sheetClose(page)).toBeFocused();
    await dragSyntheticPointerBy(page, sheetHandle(page), 0, 600, {
      eventIntervalMs: 12,
      stepDelay: 0,
      steps: 2,
    });
    await expect(opened.dialog).not.toBeVisible();
    await expect(opened.opener).toBeFocused();

    opened = await openSheet(page);
    await sheetScrim(page).click({ position: { x: 8, y: 8 } });
    await expect(opened.dialog).not.toBeVisible();
    await expect(opened.opener).toBeFocused();

    opened = await openSheet(page);
    await sheetClose(page).click();
    await expect(opened.dialog).not.toBeVisible();
    await expect(opened.opener).toBeFocused();

    opened = await openSheet(page);
    await page.keyboard.press("Escape");
    await expect(opened.dialog).not.toBeVisible();
    await expect(opened.opener).toBeFocused();
  });

  test("reduced motion produces the same final geometry while full motion remains interruptible", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 900, height: 800 });
    await openLabDemo(page, "sheet");
    let opened = await openSheet(page);

    await snapControl(page, "full").check();
    const reduced = await expectSettledGeometry(page, "full");
    await sheetClose(page).click();
    await expect(opened.dialog).not.toBeVisible();

    await page.getByTestId("reduced-motion-mode").selectOption("no-preference");
    await page.getByLabel("Preset").selectOption("loose");
    opened = await openSheet(page);
    await snapControl(page, "full").check();
    await expect(opened.dialog).toHaveAttribute("data-sheet-state", "settling");
    const fullMotion = await expectSettledGeometry(page, "full");
    expect(Math.abs(fullMotion.viewportBottom - reduced.viewportBottom)).toBeLessThanOrEqual(2);
    expect(Math.abs(fullMotion.bodyClientHeight - reduced.bodyClientHeight)).toBeLessThanOrEqual(2);

    await snapControl(page, "compact").check();
    await expectSettledGeometry(page, "compact");

    await snapControl(page, "full").check();
    await expect(opened.dialog).toHaveAttribute("data-sheet-state", "settling");
    await dragSyntheticPointerBy(page, sheetHandle(page), 0, 40, {
      beforeRelease: async () => {
        await expect(opened.dialog).toHaveAttribute("data-sheet-state", "dragging");
      },
      stepDelay: 20,
      steps: 4,
    });
    await expect(opened.dialog).toHaveAttribute("data-sheet-state", "open", {
      timeout: 8_000,
    });
    const interrupted = await geometrySnapshot(page);
    expect(
      Math.abs(interrupted.viewportBottom - interrupted.visualViewportHeight),
    ).toBeLessThanOrEqual(2);
  });
});
