import { expect, test, type Locator, type Page } from "@playwright/test";

import { dragSyntheticPointerBy, expectCarouselAt, openLabDemo, setNumericInput } from "./helpers";

interface PaginationVisualState {
  active: boolean;
  buttonHeight: number;
  buttonWidth: number;
  focusVisible: boolean;
  indicatorHeight: number;
  indicatorWidth: number;
  outlineOffset: number;
  outlineStyle: string;
  outlineWidth: number;
  selected: boolean;
}

function pagination(page: Page) {
  return page.getByRole("tablist", { name: "Coverflow screens" }).getByRole("tab");
}

async function visualState(dot: Locator): Promise<PaginationVisualState> {
  return dot.evaluate((element) => {
    const button = element.getBoundingClientRect();
    const indicator = element.querySelector<HTMLElement>(".dot-indicator");
    if (!indicator) throw new Error("Pagination indicator is missing.");

    const indicatorBox = indicator.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      active: document.activeElement === element,
      buttonHeight: button.height,
      buttonWidth: button.width,
      focusVisible: element.matches(":focus-visible"),
      indicatorHeight: indicatorBox.height,
      indicatorWidth: indicatorBox.width,
      outlineOffset: Number.parseFloat(style.outlineOffset),
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth),
      selected: element.getAttribute("aria-selected") === "true",
    };
  });
}

async function expectExactlyOneSelection(page: Page, index: number) {
  const dots = pagination(page);
  await expect(page.locator('.dots .dot[aria-selected="true"]')).toHaveCount(1);
  await expect(dots.nth(index)).toHaveAttribute("aria-selected", "true");
}

async function expectKeyboardFocus(dot: Locator) {
  const state = await visualState(dot);
  expect(state.active).toBe(true);
  expect(state.focusVisible).toBe(true);
  expect(state.outlineStyle).not.toBe("none");
  expect(state.outlineWidth).toBeGreaterThanOrEqual(2);
  expect(state.outlineOffset).toBeGreaterThanOrEqual(2);
}

async function returnKeyboardFocusTo(page: Page, dot: Locator) {
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expectKeyboardFocus(dot);
}

async function selectFirstThenMoveToLast(page: Page) {
  const dots = pagination(page);
  const viewport = page.getByTestId("coverflow-viewport");
  await setNumericInput(page.getByRole("spinbutton", { name: "Maximum skip", exact: true }), 5);
  await dots.first().click();
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

test("pointer drag commits one selected pill without a keyboard focus halo", async ({ page }) => {
  const dots = pagination(page);
  await selectFirstThenMoveToLast(page);

  await expectExactlyOneSelection(page, 4);
  await expect(page.locator(".dots .dot:focus-visible")).toHaveCount(0);

  const buttonBoxes = await dots.evaluateAll((elements) =>
    elements.map((element) => {
      const box = element.getBoundingClientRect();
      return { height: box.height, width: box.width };
    }),
  );
  expect(new Set(buttonBoxes.map(({ width }) => width)).size).toBe(1);
  expect(new Set(buttonBoxes.map(({ height }) => height)).size).toBe(1);
  expect(buttonBoxes[0]?.width).toBeGreaterThanOrEqual(44);
  expect(buttonBoxes[0]?.height).toBeGreaterThanOrEqual(44);

  const inactive = await visualState(dots.first());
  const selected = await visualState(dots.last());
  expect(selected.indicatorWidth).toBeGreaterThan(inactive.indicatorWidth);
  expect(selected.indicatorHeight).toBeCloseTo(inactive.indicatorHeight, 5);
  expect(selected.buttonWidth).toBeCloseTo(inactive.buttonWidth, 5);
  expect(selected.buttonHeight).toBeCloseTo(inactive.buttonHeight, 5);
});

test("pointer click focuses and selects without showing the keyboard halo", async ({ page }) => {
  const dots = pagination(page);
  await dots.last().click();
  await expectCarouselAt(page.getByTestId("coverflow-viewport"), "settings");

  const state = await visualState(dots.last());
  expect(state.selected).toBe(true);
  expect(state.focusVisible).toBe(false);
  expect(state.outlineStyle).toBe("none");
  await expectExactlyOneSelection(page, 4);
});

test("keyboard focus and selection remain distinct when they share one control", async ({
  page,
}) => {
  const dots = pagination(page);
  await dots.first().click();
  await expectCarouselAt(page.getByTestId("coverflow-viewport"), "templates");
  await returnKeyboardFocusTo(page, dots.first());

  const selected = await visualState(dots.first());
  const inactive = await visualState(dots.nth(1));
  expect(selected.selected).toBe(true);
  expect(selected.indicatorWidth).toBeGreaterThan(inactive.indicatorWidth);
  expect(selected.buttonWidth).toBeCloseTo(inactive.buttonWidth, 5);
  expect(selected.buttonHeight).toBeCloseTo(inactive.buttonHeight, 5);
  await expectExactlyOneSelection(page, 0);
});

test("keyboard-focused item stays focused while pointer drag commits a different item", async ({
  page,
}) => {
  const dots = pagination(page);
  const first = dots.first();
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

  await expectExactlyOneSelection(page, 4);
  await expect(page.locator(".dots .dot:focus-visible")).toHaveCount(1);
  await expectKeyboardFocus(first);
  const firstState = await visualState(first);
  const selectedState = await visualState(dots.last());
  expect(firstState.selected).toBe(false);
  expect(selectedState.selected).toBe(true);
  expect(selectedState.indicatorWidth).toBeGreaterThan(firstState.indicatorWidth);
  const focusedBoxAfter = await first.boundingBox();
  expect(focusedBoxAfter?.width).toBeCloseTo(focusedBoxBefore.width, 5);
  expect(focusedBoxAfter?.height).toBeCloseTo(focusedBoxBefore.height, 5);
});

test("keyboard navigation immediately restores focus visibility after pointer use", async ({
  page,
}) => {
  const dots = pagination(page);
  await dots.last().click();
  expect((await visualState(dots.last())).focusVisible).toBe(false);

  await page.keyboard.press("Shift+Tab");
  await expectKeyboardFocus(dots.nth(3));
  await page.keyboard.press("Tab");
  await expectKeyboardFocus(dots.last());
  await expectExactlyOneSelection(page, 4);
});
