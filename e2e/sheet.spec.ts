import { expect, test, type Page } from "@playwright/test";

import {
  dragMouseBy,
  dragSyntheticPointerBy,
  dragTouchBy,
  expectSheetOpenAt,
  openLabDemo,
  setNumericInput,
} from "./helpers";

type SheetSide = "top" | "right" | "bottom" | "left";

interface RectSnapshot {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
}

interface SheetSnapshot {
  bodyBottom: number;
  bodyClientHeight: number;
  bodyScrollHeight: number;
  bodyScrollTop: number;
  contentShells: { left: number; width: number }[];
  dialog: RectSnapshot;
  finalRowBottom?: number;
  handle: RectSnapshot;
  handleBlockSize: number;
  handleInlineSize: number;
  panel: RectSnapshot;
  panelTransform: string;
  panelWillChange: string;
  proseHeight?: number;
  proseWidth?: number;
  viewport: RectSnapshot;
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

function dialog(page: Page) {
  return page.getByTestId("sheet");
}

function panel(page: Page) {
  return dialog(page).locator(".snap-motion-sheet-panel");
}

function body(page: Page) {
  return dialog(page).locator(".snap-motion-sheet-body");
}

function handle(page: Page) {
  return dialog(page).locator(".snap-motion-sheet-drag-region");
}

function scrim(page: Page) {
  return dialog(page).locator(".snap-motion-sheet-scrim");
}

function closeButton(page: Page) {
  return dialog(page).locator(".snap-motion-sheet-close");
}

function snapControl(page: Page, id: string) {
  return dialog(page).locator(`input[type="radio"][value="${id}"]`);
}

function physicalDrag(side: SheetSide, extent: number) {
  if (side === "bottom") return { x: 0, y: extent };
  if (side === "top") return { x: 0, y: -extent };
  if (side === "right") return { x: extent, y: 0 };
  return { x: -extent, y: 0 };
}

async function selectSide(page: Page, side: SheetSide) {
  await page.getByTestId("sheet-side-select").selectOption(side);
}

async function openSheet(page: Page, side: SheetSide = "bottom") {
  await selectSide(page, side);
  await expect(dialog(page)).toHaveAttribute("data-sheet-side", side);
  const opener = page.getByTestId("open-sheet");
  await opener.click();
  await expectSheetOpenAt(
    dialog(page),
    side === "left" || side === "right" ? "open" : "comfortable",
  );
  return { dialog: dialog(page), opener };
}

async function snapshot(page: Page): Promise<SheetSnapshot> {
  return dialog(page).evaluate((element) => {
    const panelElement = element.querySelector<HTMLElement>(".snap-motion-sheet-panel");
    const viewport = element.querySelector<HTMLElement>(".snap-motion-sheet-viewport");
    const bodyElement = element.querySelector<HTMLElement>(".snap-motion-sheet-body");
    const handleElement = element.querySelector<HTMLElement>(".snap-motion-sheet-drag-region");
    if (!panelElement || !viewport || !bodyElement || !handleElement) {
      throw new Error("Expected the complete sheet geometry structure.");
    }
    const finalRow = element.querySelector<HTMLElement>('[data-testid="final-note-row"]');
    const prose = element.querySelector<HTMLElement>(".sheet-lede");
    return {
      bodyBottom: bodyElement.getBoundingClientRect().bottom,
      bodyClientHeight: bodyElement.clientHeight,
      bodyScrollHeight: bodyElement.scrollHeight,
      bodyScrollTop: bodyElement.scrollTop,
      contentShells: [
        ...element.querySelectorAll<HTMLElement>(".snap-motion-sheet-content-shell"),
      ].map((shell) => {
        const rect = shell.getBoundingClientRect();
        return { left: rect.left, width: rect.width };
      }),
      dialog: element.getBoundingClientRect().toJSON() as RectSnapshot,
      ...(finalRow ? { finalRowBottom: finalRow.getBoundingClientRect().bottom } : {}),
      handle: handleElement.getBoundingClientRect().toJSON() as RectSnapshot,
      handleBlockSize: handleElement.getBoundingClientRect().height,
      handleInlineSize: handleElement.getBoundingClientRect().width,
      panel: panelElement.getBoundingClientRect().toJSON() as RectSnapshot,
      panelTransform: getComputedStyle(panelElement).transform,
      panelWillChange: getComputedStyle(panelElement).willChange,
      ...(prose
        ? {
            proseHeight: prose.getBoundingClientRect().height,
            proseWidth: prose.getBoundingClientRect().width,
          }
        : {}),
      viewport: viewport.getBoundingClientRect().toJSON() as RectSnapshot,
    };
  });
}

async function expectAttached(page: Page, side: SheetSide) {
  const geometry = await snapshot(page);
  const tolerance = 2;
  if (side === "bottom") {
    expect(Math.abs(geometry.viewport.bottom - geometry.dialog.bottom)).toBeLessThanOrEqual(
      tolerance,
    );
  } else if (side === "top") {
    expect(Math.abs(geometry.viewport.top - geometry.dialog.top)).toBeLessThanOrEqual(tolerance);
  } else if (side === "right") {
    expect(Math.abs(geometry.panel.right - geometry.dialog.right)).toBeLessThanOrEqual(tolerance);
  } else {
    expect(Math.abs(geometry.panel.left - geometry.dialog.left)).toBeLessThanOrEqual(tolerance);
  }
  return geometry;
}

test.describe("multi-edge Sheet", () => {
  test("opens every physical side with stable attributes, handle geometry, and no idle compositor hint", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1_000, height: 800 });
    await openLabDemo(page, "sheet");

    for (const side of ["top", "right", "bottom", "left"] as const) {
      const opened = await openSheet(page, side);
      const axis = side === "top" || side === "bottom" ? "y" : "x";
      await expect(opened.dialog).toHaveAttribute("data-sheet-side", side);
      await expect(opened.dialog).toHaveAttribute("data-sheet-axis", axis);
      const geometry = await expectAttached(page, side);
      expect(geometry.panelWillChange).toBe("auto");
      if (axis === "y") {
        expect(geometry.handleInlineSize).toBeGreaterThan(geometry.handleBlockSize);
      } else {
        expect(geometry.handleBlockSize).toBeGreaterThan(geometry.handleInlineSize);
        await expect(dialog(page).locator(".snap-motion-sheet-picker")).toHaveCount(0);
      }
      await closeButton(page).click();
      await expect(opened.dialog).not.toBeVisible();
      await expect(opened.opener).toBeFocused();
    }
  });

  test("keeps mirrored slow drags, high-velocity closing, and touch input semantic", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 900, height: 800 });
    await openLabDemo(page, "sheet");

    for (const side of ["bottom", "top"] as const) {
      await openSheet(page, side);
      const outward = physicalDrag(side, 270);
      await dragMouseBy(page, handle(page), outward.x, outward.y, { stepDelay: 45, steps: 12 });
      await expectSheetOpenAt(dialog(page), "compact");
      const inward = physicalDrag(side, -430);
      await dragTouchBy(page, handle(page), inward.x, inward.y, { stepDelay: 30, steps: 12 });
      await expectSheetOpenAt(dialog(page), "full");
      await closeButton(page).click();
    }

    await setNumericInput(page.getByLabel("Fling threshold"), 100);
    for (const side of ["top", "right", "bottom", "left"] as const) {
      const opened = await openSheet(page, side);
      const outward = physicalDrag(side, 180);
      await dragSyntheticPointerBy(page, handle(page), outward.x, outward.y, {
        eventIntervalMs: 10,
        steps: 2,
      });
      await expect(opened.dialog).not.toBeVisible();
      await expect(opened.opener).toBeFocused();
    }
  });

  test("preserves vertical multi-snap geometry, native scrolling, dynamic and short content", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1_000, height: 800 });
    await openLabDemo(page, "sheet");
    await openSheet(page);

    const clientHeights: number[] = [];
    const scrollHeights: number[] = [];
    for (const id of ["full", "comfortable", "compact"] as const) {
      await snapControl(page, id).check();
      await expectSheetOpenAt(dialog(page), id);
      const geometry = await expectAttached(page, "bottom");
      clientHeights.push(geometry.bodyClientHeight);
      scrollHeights.push(geometry.bodyScrollHeight);
      await body(page).evaluate((element) => element.scrollTo(0, element.scrollHeight));
      await expect
        .poll(() => body(page).evaluate((element) => element.scrollTop))
        .toBeGreaterThan(0);
      const scrolled = await snapshot(page);
      expect(scrolled.finalRowBottom).toBeLessThanOrEqual(scrolled.bodyBottom);
      expect(scrolled.bodyBottom - (scrolled.finalRowBottom ?? 0)).toBeLessThanOrEqual(32);
    }
    expect(clientHeights[0]).toBeGreaterThan(clientHeights[1]!);
    expect(clientHeights[1]).toBeGreaterThan(clientHeights[2]!);
    expect(Math.max(...scrollHeights) - Math.min(...scrollHeights)).toBeLessThanOrEqual(1);

    const beforeDynamic = (await snapshot(page)).bodyScrollHeight;
    await page.getByTestId("add-sheet-note").click();
    await expect
      .poll(() => snapshot(page).then((value) => value.bodyScrollHeight))
      .toBeGreaterThan(beforeDynamic);
    await page.keyboard.press("Escape");

    await page.getByTestId("sheet-content-mode").selectOption("short");
    await openSheet(page);
    await snapControl(page, "full").check();
    await expectSheetOpenAt(dialog(page), "full");
    const short = await snapshot(page);
    expect(short.bodyScrollHeight - short.bodyClientHeight).toBeLessThanOrEqual(1);
  });

  test("keeps a fixed horizontal layout through partial reveal, drag, interruption, and resize", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 980, height: 720 });
    await openLabDemo(page, "sheet", "no-preference");
    await page.getByTestId("sheet-content-mode").selectOption("prose");
    await page.getByTestId("sheet-snap-mode").selectOption("custom");
    await openSheet(page, "right");

    const initial = await snapshot(page);
    const outward = physicalDrag("right", 235);
    await dragMouseBy(page, handle(page), outward.x, outward.y, {
      beforeRelease: async () => {
        const dragging = await snapshot(page);
        expect(dragging.panel.width).toBeCloseTo(initial.panel.width, 1);
        expect(dragging.proseWidth).toBeCloseTo(initial.proseWidth!, 1);
        expect(dragging.proseHeight).toBeCloseTo(initial.proseHeight!, 1);
        expect(dragging.panelWillChange).toBe("transform");
      },
      stepDelay: 40,
      steps: 10,
    });
    await expectSheetOpenAt(dialog(page), "compact");
    const partial = await snapshot(page);
    expect(partial.panel.width).toBeCloseTo(initial.panel.width, 1);
    expect(partial.proseHeight).toBeCloseTo(initial.proseHeight!, 1);
    expect(partial.panelWillChange).toBe("auto");

    await page.getByTestId("snap-open").check();
    await expect(dialog(page)).toHaveAttribute("data-sheet-state", "settling");
    await dragSyntheticPointerBy(page, handle(page), 45, 0, { stepDelay: 20, steps: 4 });
    await expect(dialog(page)).toHaveAttribute("data-sheet-state", "open", { timeout: 8_000 });

    await page.keyboard.press("Escape");
    await expect(dialog(page)).not.toBeVisible();
    await page.getByTestId("sheet-content-mode").selectOption("tall");
    await openSheet(page, "right");
    await body(page).evaluate((element) => element.scrollTo(0, element.scrollHeight));
    await expect.poll(() => body(page).evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await page.setViewportSize({ width: 760, height: 900 });
    await expectSheetOpenAt(dialog(page), "open");
    const resized = await expectAttached(page, "right");
    expect(resized.panel.width).toBeLessThanOrEqual(480);
  });

  test("changes side atomically while open, dragging, settling, and closed", async ({ page }) => {
    await page.setViewportSize({ width: 960, height: 800 });
    await openLabDemo(page, "sheet", "no-preference");
    await page.getByLabel("Preset").selectOption("loose");

    await selectSide(page, "top");
    await expect(dialog(page)).toHaveAttribute("data-sheet-side", "top");
    const opened = await openSheet(page, "bottom");
    await selectSide(page, "top");
    await expectSheetOpenAt(opened.dialog, "comfortable");
    await expect(opened.dialog).toHaveAttribute("data-sheet-axis", "y");
    await expectAttached(page, "top");

    const outward = physicalDrag("top", 120);
    await dragSyntheticPointerBy(page, handle(page), outward.x, outward.y, {
      beforeRelease: async () => selectSide(page, "right"),
      stepDelay: 25,
      steps: 5,
    });
    await expectSheetOpenAt(opened.dialog, "open");
    await expect(opened.dialog).toHaveAttribute("data-sheet-axis", "x");
    await expectAttached(page, "right");

    await selectSide(page, "left");
    await expectSheetOpenAt(opened.dialog, "open");
    await expectAttached(page, "left");

    await selectSide(page, "bottom");
    await snapControl(page, "full").check();
    await expect(opened.dialog).toHaveAttribute("data-sheet-state", "settling");
    await selectSide(page, "top");
    await expectSheetOpenAt(opened.dialog, "full");
    const coherent = await snapshot(page);
    expect(coherent.panelTransform).toMatch(/^matrix\(1, 0, 0, 1, 0, -/);
  });

  test("keeps full-bleed surfaces and one centered content measure without elastic gaps", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1_100, height: 800 });
    await openLabDemo(page, "sheet");
    await page.getByTestId("sheet-content-mode").selectOption("prose");
    await openSheet(page, "bottom");
    await snapControl(page, "full").check();
    await expectSheetOpenAt(dialog(page), "full");
    const geometry = await snapshot(page);
    expect(geometry.panel.width).toBeCloseTo(1_100, 0);
    expect(geometry.contentShells).toHaveLength(3);
    for (const shell of geometry.contentShells.slice(1)) {
      expect(shell.left).toBeCloseTo(geometry.contentShells[0]!.left, 0);
      expect(shell.width).toBeCloseTo(geometry.contentShells[0]!.width, 0);
    }
    expect(geometry.contentShells[0]!.width).toBeLessThanOrEqual(768);

    await dragSyntheticPointerBy(page, handle(page), 0, -180, {
      beforeRelease: async () => {
        const during = await snapshot(page);
        expect(Math.abs(during.viewport.bottom - during.dialog.bottom)).toBeLessThanOrEqual(2);
        const continuation = await panel(page).evaluate((element) => {
          const pseudo = getComputedStyle(element, "::after");
          return {
            background: pseudo.backgroundColor,
            blockSize: Number.parseFloat(pseudo.height),
          };
        });
        expect(continuation.background).not.toBe("rgba(0, 0, 0, 0)");
        expect(continuation.blockSize).toBeGreaterThanOrEqual(800);
      },
      stepDelay: 30,
      steps: 8,
    });
  });

  test("maps all four safe areas independently from physical attachment and the content gutter", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 900, height: 800 });
    await openLabDemo(page, "sheet");
    await page.addStyleTag({
      content: `.snap-motion-sheet {
        --snap-motion-sheet-safe-area-top: 11px;
        --snap-motion-sheet-safe-area-right: 13px;
        --snap-motion-sheet-safe-area-bottom: 17px;
        --snap-motion-sheet-safe-area-left: 19px;
      }`,
    });

    await openSheet(page, "bottom");
    await snapControl(page, "full").check();
    await expectSheetOpenAt(dialog(page), "full");
    expect((await snapshot(page)).panel.top).toBeCloseTo(35, 0);
    await page.keyboard.press("Escape");

    await openSheet(page, "top");
    await snapControl(page, "full").check();
    await expectSheetOpenAt(dialog(page), "full");
    expect((await snapshot(page)).panel.top).toBeCloseTo(-41, 0);
    await page.keyboard.press("Escape");

    await openSheet(page, "right");
    const rightPadding = await dialog(page)
      .locator(".snap-motion-sheet-header-region")
      .evaluate((element) => {
        const style = getComputedStyle(element);
        return { left: style.paddingLeft, right: style.paddingRight };
      });
    expect(rightPadding).toEqual({ left: "63px", right: "13px" });
    await page.keyboard.press("Escape");

    await openSheet(page, "left");
    const leftPadding = await dialog(page)
      .locator(".snap-motion-sheet-header-region")
      .evaluate((element) => {
        const style = getComputedStyle(element);
        return { left: style.paddingLeft, right: style.paddingRight };
      });
    expect(leftPadding).toEqual({ left: "19px", right: "57px" });
  });

  test("keeps physical left and right placement in RTL and closes through every modal path", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 900, height: 760 });
    await openLabDemo(page, "sheet");
    await page.locator("html").evaluate((element) => {
      element.dir = "rtl";
    });

    await openSheet(page, "left");
    await expectAttached(page, "left");
    await page.keyboard.press("Escape");
    await expect(dialog(page)).not.toBeVisible();

    let opened = await openSheet(page, "right");
    await expectAttached(page, "right");
    await scrim(page).click({ position: { x: 8, y: 8 } });
    await expect(opened.dialog).not.toBeVisible();
    await expect(opened.opener).toBeFocused();

    opened = await openSheet(page, "right");
    await closeButton(page).click();
    await expect(opened.dialog).not.toBeVisible();
    await expect(opened.opener).toBeFocused();
  });

  test("certifies host-owned adaptive composition, state preservation, focus transfer, and rapid resize", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 600, height: 800 });
    await openLabDemo(page, "adaptive-sheet");
    await expect(page.getByTestId("adaptive-sheet-trigger")).toBeVisible();
    await expect(page.getByTestId("inline-supporting-pane")).toHaveCount(0);

    await page.getByTestId("adaptive-sheet-trigger").click();
    await expect(page.getByTestId("adaptive-sheet")).toHaveAttribute("data-sheet-side", "bottom");
    await page.getByTestId("inspector-name").fill("Preserved inspector state");
    await page.setViewportSize({ width: 900, height: 800 });
    await expect(page.getByTestId("adaptive-sheet")).toHaveAttribute("data-sheet-side", "right");
    await expect(page.getByTestId("inspector-name")).toHaveValue("Preserved inspector state");

    await page.setViewportSize({ width: 1_280, height: 800 });
    await expect(page.getByTestId("inline-supporting-pane")).toBeVisible();
    await expect(page.getByTestId("adaptive-sheet")).toHaveCount(0);
    await expect(page.getByTestId("inspector-name")).toHaveValue("Preserved inspector state");
    await expect(page.getByTestId("inline-inspector-heading")).toBeFocused();

    await page.setViewportSize({ width: 600, height: 800 });
    await expect(page.getByTestId("adaptive-sheet-trigger")).toBeVisible();
    await expect(page.getByTestId("adaptive-sheet")).not.toBeVisible();
    for (const width of [1_200, 850, 560, 1_260, 700]) {
      await page.setViewportSize({ width, height: 800 });
    }
    await expect(page.getByTestId("adaptive-sheet-trigger")).toBeVisible();
    await expect(page.getByTestId("inline-supporting-pane")).toHaveCount(0);

    const ids = await page
      .locator("[id]")
      .evaluateAll((elements) => elements.map((item) => item.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("retains forced-colors structure and modal tab containment", async ({ page }, testInfo) => {
    await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
    await page.setViewportSize({ width: 800, height: 700 });
    await openLabDemo(page, "sheet");
    await openSheet(page, "right");
    await expect(closeButton(page)).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(dialog(page)).toContainText("Motion tuning notes");
    if (testInfo.project.name !== "webkit") {
      await expect(handle(page).locator(".snap-motion-sheet-handle")).toHaveCSS(
        "forced-color-adjust",
        "none",
      );
    }
  });
});
