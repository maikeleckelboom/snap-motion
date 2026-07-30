import { expect, test, type Locator, type Page } from "@playwright/test";

import { dragSyntheticPointerBy, expectCarouselAt, openLabDemo, setNumericInput } from "./helpers";

interface PaginationButtonState {
  active: boolean;
  buttonHeight: number;
  buttonWidth: number;
  current: boolean;
  dotBackground: string;
  dotHeight: number;
  dotWidth: number;
  focusVisible: boolean;
  outlineOffset: number;
  outlineStyle: string;
  outlineWidth: number;
}

interface IndicatorState {
  centerX: number;
  height: number;
  position: number;
  scaleX: number;
  transition: string;
  width: number;
}

function pagination(page: Page) {
  return page.getByRole("group", { name: "Coverflow screens" }).getByRole("button");
}

async function buttonState(button: Locator): Promise<PaginationButtonState> {
  return button.evaluate((element) => {
    const buttonBox = element.getBoundingClientRect();
    const dot = element.querySelector<HTMLElement>(".dot-indicator");
    if (!dot) throw new Error("Inactive pagination dot is missing.");

    const dotBox = dot.getBoundingClientRect();
    const buttonStyle = getComputedStyle(element);
    return {
      active: document.activeElement === element,
      buttonHeight: buttonBox.height,
      buttonWidth: buttonBox.width,
      current: element.getAttribute("aria-current") === "true",
      dotBackground: getComputedStyle(dot).backgroundColor,
      dotHeight: dotBox.height,
      dotWidth: dotBox.width,
      focusVisible: element.matches(":focus-visible"),
      outlineOffset: Number.parseFloat(buttonStyle.outlineOffset),
      outlineStyle: buttonStyle.outlineStyle,
      outlineWidth: Number.parseFloat(buttonStyle.outlineWidth),
    };
  });
}

async function indicatorState(page: Page): Promise<IndicatorState> {
  return page.getByTestId("coverflow-pagination-indicator").evaluate((element) => {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      centerX: box.left + box.width / 2,
      height: box.height,
      position: Number(element.dataset.position),
      scaleX: Number(element.dataset.scaleX),
      transition: style.transition,
      width: box.width,
    };
  });
}

async function expectExactlyOneCurrent(page: Page, index: number) {
  const buttons = pagination(page);
  await expect(page.locator('.dots .dot[aria-current="true"]')).toHaveCount(1);
  await expect(buttons.nth(index)).toHaveAttribute("aria-current", "true");
}

async function expectKeyboardFocus(button: Locator) {
  const state = await buttonState(button);
  expect(state.active).toBe(true);
  expect(state.focusVisible).toBe(true);
  expect(state.outlineStyle).not.toBe("none");
  expect(state.outlineWidth).toBeGreaterThanOrEqual(2);
  expect(state.outlineOffset).toBeGreaterThanOrEqual(2);
}

async function returnKeyboardFocusTo(page: Page, button: Locator) {
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expectKeyboardFocus(button);
}

async function buttonCenterX(button: Locator) {
  const box = await button.boundingBox();
  if (!box) throw new Error("Pagination control has no layout box.");
  return box.x + box.width / 2;
}

async function selectFirstThenMoveToLast(page: Page) {
  const buttons = pagination(page);
  const viewport = page.getByTestId("coverflow-viewport");
  await setNumericInput(page.getByRole("spinbutton", { name: "Maximum skip", exact: true }), 5);
  await buttons.first().click();
  await expectCarouselAt(viewport, "templates");
  await dragSyntheticPointerBy(page, viewport, -250, 0, {
    eventIntervalMs: 3,
    stepDelay: 0,
    steps: 3,
  });
  await expectCarouselAt(viewport, "settings");
}

test.beforeEach(async ({ page }) => {
  await openLabDemo(page, "coverflow", "no-preference");
});

test("pointer drag leaves one exact capsule and no keyboard focus halo", async ({ page }) => {
  const buttons = pagination(page);
  await selectFirstThenMoveToLast(page);

  await expectExactlyOneCurrent(page, 4);
  await expect(page.locator(".dots .dot:focus-visible")).toHaveCount(0);
  await expect(page.getByTestId("coverflow-pagination-indicator")).toHaveCount(1);

  const buttonBoxes = await buttons.evaluateAll((elements) =>
    elements.map((element) => {
      const box = element.getBoundingClientRect();
      return { height: box.height, width: box.width };
    }),
  );
  expect(new Set(buttonBoxes.map(({ width }) => width)).size).toBe(1);
  expect(new Set(buttonBoxes.map(({ height }) => height)).size).toBe(1);
  expect(buttonBoxes[0]?.width).toBeGreaterThanOrEqual(44);
  expect(buttonBoxes[0]?.height).toBeGreaterThanOrEqual(44);

  const buttonStates = await Promise.all(
    Array.from({ length: await buttons.count() }, (_, index) => buttonState(buttons.nth(index))),
  );
  expect(new Set(buttonStates.map(({ dotWidth }) => dotWidth)).size).toBe(1);
  expect(new Set(buttonStates.map(({ dotHeight }) => dotHeight)).size).toBe(1);
  expect(new Set(buttonStates.map(({ dotBackground }) => dotBackground)).size).toBe(1);

  const indicator = await indicatorState(page);
  expect(indicator.position).toBe(4);
  expect(indicator.scaleX).toBe(1);
  expect(indicator.transition).toBe("none");
  expect(indicator.width).toBeGreaterThan(buttonStates[0]!.dotWidth);
  expect(indicator.height).toBeCloseTo(buttonStates[0]!.dotHeight, 3);
  expect(Math.abs(indicator.centerX - (await buttonCenterX(buttons.last())))).toBeLessThan(0.02);
});

test("pointer click selects without showing the keyboard halo", async ({ page }) => {
  const buttons = pagination(page);
  await buttons.last().click();
  await expectCarouselAt(page.getByTestId("coverflow-viewport"), "settings");

  const state = await buttonState(buttons.last());
  expect(state.current).toBe(true);
  expect(state.focusVisible).toBe(false);
  expect(state.outlineStyle).toBe("none");
  await expectExactlyOneCurrent(page, 4);
});

test("keyboard focus and selection remain distinct on the same control", async ({ page }) => {
  const buttons = pagination(page);
  await buttons.first().click();
  await expectCarouselAt(page.getByTestId("coverflow-viewport"), "templates");
  await returnKeyboardFocusTo(page, buttons.first());

  await expectKeyboardFocus(buttons.first());
  await expectExactlyOneCurrent(page, 0);
  const indicator = await indicatorState(page);
  expect(Math.abs(indicator.centerX - (await buttonCenterX(buttons.first())))).toBeLessThan(0.02);
  expect(indicator.width).toBeGreaterThan((await buttonState(buttons.first())).dotWidth);
});

test("item one keeps keyboard focus while the capsule settles on item five", async ({ page }) => {
  const buttons = pagination(page);
  const first = buttons.first();
  await setNumericInput(page.getByRole("spinbutton", { name: "Maximum skip", exact: true }), 5);
  await first.click();
  await expectCarouselAt(page.getByTestId("coverflow-viewport"), "templates");
  await returnKeyboardFocusTo(page, first);

  const focusedBoxBefore = await first.boundingBox();
  if (!focusedBoxBefore) throw new Error("Focused pagination control has no layout box.");
  await dragSyntheticPointerBy(page, page.getByTestId("coverflow-viewport"), -250, 0, {
    eventIntervalMs: 3,
    stepDelay: 0,
    steps: 3,
  });
  await expectCarouselAt(page.getByTestId("coverflow-viewport"), "settings");

  await expectExactlyOneCurrent(page, 4);
  await expect(page.locator(".dots .dot:focus-visible")).toHaveCount(1);
  await expectKeyboardFocus(first);
  expect((await buttonState(first)).current).toBe(false);
  expect((await buttonState(buttons.last())).current).toBe(true);
  expect(
    Math.abs((await indicatorState(page)).centerX - (await buttonCenterX(buttons.last()))),
  ).toBeLessThan(0.02);
  const focusedBoxAfter = await first.boundingBox();
  expect(focusedBoxAfter?.width).toBeCloseTo(focusedBoxBefore.width, 5);
  expect(focusedBoxAfter?.height).toBeCloseTo(focusedBoxBefore.height, 5);
});

test("keyboard traversal immediately restores focus visibility after pointer use", async ({
  page,
}) => {
  const buttons = pagination(page);
  await buttons.last().click();
  expect((await buttonState(buttons.last())).focusVisible).toBe(false);

  await page.keyboard.press("Shift+Tab");
  await expectKeyboardFocus(buttons.nth(3));
  await page.keyboard.press("Tab");
  await expectKeyboardFocus(buttons.last());
  await expectExactlyOneCurrent(page, 4);
});
