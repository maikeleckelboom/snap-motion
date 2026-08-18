import { expect, test, type Locator, type Page } from "@playwright/test";

import { expectCarouselAt, openLabDemo } from "./helpers";

const POINTER_ID = 97;

function pagination(page: Page) {
  return page.getByRole("group", { name: "Coverflow screens" }).getByRole("button");
}

async function coverflowPitch(viewport: Locator) {
  const pitch = Number(await viewport.getAttribute("data-motion-pitch"));
  if (!Number.isFinite(pitch) || pitch <= 0) {
    throw new Error(`Expected a positive canonical Coverflow motion pitch, received ${pitch}.`);
  }
  return pitch;
}

async function beginPointer(viewport: Locator) {
  return viewport.evaluate((element, pointerId) => {
    const box = element.getBoundingClientRect();
    const point = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    element.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        button: 0,
        buttons: 1,
        cancelable: true,
        clientX: point.x,
        clientY: point.y,
        isPrimary: true,
        pointerId,
        pointerType: "mouse",
      }),
    );
    return { ...point, timestamp: performance.now() };
  }, POINTER_ID);
}

async function movePointer(
  page: Page,
  origin: { x: number; y: number; timestamp: number },
  deltaX: number,
  elapsed: number,
) {
  await page.evaluate(
    ({ deltaX: moveDeltaX, elapsed: moveElapsed, origin: pointerOrigin, pointerId }) => {
      const event = new PointerEvent("pointermove", {
        bubbles: true,
        button: 0,
        buttons: 1,
        cancelable: true,
        clientX: pointerOrigin.x + moveDeltaX,
        clientY: pointerOrigin.y,
        isPrimary: true,
        pointerId,
        pointerType: "mouse",
      });
      Object.defineProperty(event, "timeStamp", {
        value: pointerOrigin.timestamp + moveElapsed,
      });
      window.dispatchEvent(event);
    },
    { deltaX, elapsed, origin, pointerId: POINTER_ID },
  );
}

async function endPointer(
  page: Page,
  origin: { x: number; y: number; timestamp: number },
  deltaX: number,
  elapsed: number,
) {
  await page.evaluate(
    ({ deltaX: endDeltaX, elapsed: endElapsed, origin: pointerOrigin, pointerId }) => {
      const event = new PointerEvent("pointerup", {
        bubbles: true,
        button: 0,
        buttons: 0,
        cancelable: true,
        clientX: pointerOrigin.x + endDeltaX,
        clientY: pointerOrigin.y,
        isPrimary: true,
        pointerId,
        pointerType: "mouse",
      });
      Object.defineProperty(event, "timeStamp", {
        value: pointerOrigin.timestamp + endElapsed,
      });
      window.dispatchEvent(event);
    },
    { deltaX, elapsed, origin, pointerId: POINTER_ID },
  );
}

async function indicatorGeometry(page: Page) {
  return page.getByTestId("coverflow-pagination-indicator").evaluate((element) => {
    const box = element.getBoundingClientRect();
    const transform = getComputedStyle(element).transform;
    return {
      centerX: box.left + box.width / 2,
      position: Number(element.dataset.position),
      scaleX: Number(element.dataset.scaleX),
      transform,
    };
  });
}

async function buttonCenterX(button: Locator) {
  const box = await button.boundingBox();
  if (!box) throw new Error("Pagination button has no layout box.");
  return box.x + box.width / 2;
}

async function moveAndRead(
  page: Page,
  viewport: Locator,
  origin: { x: number; y: number; timestamp: number },
  deltaX: number,
  elapsed: number,
) {
  await movePointer(page, origin, deltaX, elapsed);
  await expect(viewport).toHaveAttribute("data-phase", "dragging");
  return {
    caption: (await page.getByTestId("coverflow-caption").textContent())?.trim(),
    counter: Number(await page.getByTestId("coverflow-counter").textContent()),
    indicator: await indicatorGeometry(page),
    physicalIndex: Number(await viewport.getAttribute("data-physical-index")),
    visualIndex: Number(await viewport.getAttribute("data-visual-index")),
  };
}

test.beforeEach(async ({ page }) => {
  await openLabDemo(page, "coverflow", "no-preference");
});

test("slow drag, midpoint crossing, and both reversals stay physically continuous", async ({
  page,
}) => {
  const viewport = page.getByTestId("coverflow-viewport");
  const buttons = pagination(page);
  await buttons.first().click();
  await expectCarouselAt(viewport, "templates");
  const pitch = await coverflowPitch(viewport);
  const firstCenter = await buttonCenterX(buttons.first());
  const secondCenter = await buttonCenterX(buttons.nth(1));
  const origin = await beginPointer(viewport);

  const beforeMidpoint = await moveAndRead(page, viewport, origin, -pitch * 0.4, 100);
  const reversedBeforeMidpoint = await moveAndRead(page, viewport, origin, -pitch * 0.2, 200);
  expect(reversedBeforeMidpoint.indicator.position).toBeLessThan(beforeMidpoint.indicator.position);
  expect(reversedBeforeMidpoint.indicator.centerX).toBeLessThan(beforeMidpoint.indicator.centerX);

  const midpoint = await moveAndRead(page, viewport, origin, -pitch * 0.5, 300);
  expect(midpoint.physicalIndex).toBeCloseTo(0.5, 3);
  expect(midpoint.indicator.position).toBeCloseTo(0.5, 3);
  expect(Math.abs(midpoint.indicator.centerX - (firstCenter + secondCenter) / 2)).toBeLessThan(3);
  expect(midpoint.indicator.transform).not.toBe("none");

  const afterMidpoint = await moveAndRead(page, viewport, origin, -pitch * 0.56, 400);
  expect(afterMidpoint.visualIndex).toBe(1);
  expect(afterMidpoint.counter).toBe(2);
  expect(afterMidpoint.caption).toContain("Project 24031");

  const reversedAfterMidpoint = await moveAndRead(page, viewport, origin, -pitch * 0.44, 500);
  expect(reversedAfterMidpoint.visualIndex).toBe(0);
  expect(reversedAfterMidpoint.counter).toBe(1);
  expect(reversedAfterMidpoint.caption).toBe("Projectsjablonen");
  expect(reversedAfterMidpoint.indicator.position).toBeLessThan(afterMidpoint.indicator.position);

  await movePointer(page, origin, -pitch * 0.62, 600);
  await endPointer(page, origin, -pitch * 0.62, 700);
  await expectCarouselAt(viewport, "project");
  await expect(page.getByTestId("coverflow-pagination-indicator")).toHaveAttribute(
    "data-position",
    "1.00000",
  );
  await expect(page.getByTestId("coverflow-pagination-indicator")).toHaveAttribute(
    "data-scale-x",
    "1.00000",
  );
});

test("elastic end drags keep the capsule inside the fixed navigation rail", async ({ page }) => {
  const viewport = page.getByTestId("coverflow-viewport");
  const buttons = pagination(page);
  const indicator = page.getByTestId("coverflow-pagination-indicator");
  await buttons.first().click();
  await expectCarouselAt(viewport, "templates");

  let origin = await beginPointer(viewport);
  await movePointer(page, origin, 120, 100);
  await expect(indicator).toHaveAttribute("data-position", "0.00000");
  const firstIndicatorBox = await indicator.boundingBox();
  const firstButtonBox = await buttons.first().boundingBox();
  expect(firstIndicatorBox?.x).toBeGreaterThanOrEqual(firstButtonBox?.x ?? 0);
  await endPointer(page, origin, 120, 200);
  await expectCarouselAt(viewport, "templates");

  await buttons.last().click();
  await expectCarouselAt(viewport, "settings");
  origin = await beginPointer(viewport);
  await movePointer(page, origin, -120, 100);
  await expect(indicator).toHaveAttribute("data-position", "4.00000");
  const lastIndicatorBox = await indicator.boundingBox();
  const lastButtonBox = await buttons.last().boundingBox();
  expect((lastIndicatorBox?.x ?? 0) + (lastIndicatorBox?.width ?? 0)).toBeLessThanOrEqual(
    (lastButtonBox?.x ?? 0) + (lastButtonBox?.width ?? 0),
  );
  await endPointer(page, origin, -120, 200);
  await expectCarouselAt(viewport, "settings");
});

test("a swipe gives the stage keyboard ownership without disturbing retained in-component focus", async ({
  page,
}) => {
  const viewport = page.getByTestId("coverflow-viewport");
  const pitch = await coverflowPitch(viewport);
  const origin = await beginPointer(viewport);
  await movePointer(page, origin, -pitch * 0.62, 800);
  await endPointer(page, origin, -pitch * 0.62, 900);
  await expectCarouselAt(viewport, "team");

  await expect(viewport).toBeFocused();
  await expect(page.locator(".dots .dot:focus-visible")).toHaveCount(0);
  await page.keyboard.press("ArrowRight");
  await expect(viewport).toHaveAttribute("data-target-id", "settings");
  await expectCarouselAt(viewport, "settings");
});

test("an interrupted Arrow transition announces only the settlement it earns", async ({ page }) => {
  const viewport = page.getByTestId("coverflow-viewport");
  const status = page.getByTestId("snap-motion-coverflow-status");
  const buttons = pagination(page);
  await buttons.first().click();
  await expectCarouselAt(viewport, "templates");
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(buttons.first()).toBeFocused();

  await status.evaluate((element) => {
    const messages: string[] = [];
    const observer = new MutationObserver(() => {
      messages.push(element.textContent?.trim() ?? "");
    });
    observer.observe(element, { characterData: true, childList: true, subtree: true });
    (
      window as typeof window & {
        coverflowKeyboardAnnouncements?: { messages: string[]; observer: MutationObserver };
      }
    ).coverflowKeyboardAnnouncements = { messages, observer };
  });

  await page.evaluate(async () => {
    const target = document.activeElement;
    if (!(target instanceof HTMLElement))
      throw new Error("Coverflow keyboard target is not focused.");
    for (let index = 0; index < 2; index += 1) {
      target.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "ArrowRight",
        }),
      );
      // Let Vue publish the host's controlled confirmation before the next request, without
      // allowing an animation frame in which the first transition could settle.
      await Promise.resolve();
    }
  });
  await expect(viewport).toHaveAttribute("data-target-id", "map");
  await expectCarouselAt(viewport, "map");
  await expect(buttons.first()).toBeFocused();
  await expect(buttons.nth(2)).toHaveAttribute("aria-current", "true");
  await expect(status).toContainText("Locatie & planning, 3 of 5");

  const announcements = await page.evaluate(() => {
    const trace = (
      window as typeof window & {
        coverflowKeyboardAnnouncements?: { messages: string[]; observer: MutationObserver };
      }
    ).coverflowKeyboardAnnouncements;
    trace?.observer.disconnect();
    return trace?.messages ?? [];
  });
  expect(announcements).toEqual(["Locatie & planning, 3 of 5"]);

  await page.keyboard.press("Home");
  await expect(viewport).toHaveAttribute("data-target-id", "templates");
  await expectCarouselAt(viewport, "templates");
  await page.keyboard.press("ArrowRight");
  await expect(viewport).toHaveAttribute("data-active-id", "project");
  await page.keyboard.press("ArrowLeft");
  await expect(viewport).toHaveAttribute("data-target-id", "templates");
  await expectCarouselAt(viewport, "templates");
});

test("fully settled sequential Arrow transitions each announce exactly once", async ({ page }) => {
  const viewport = page.getByTestId("coverflow-viewport");
  const status = page.getByTestId("snap-motion-coverflow-status");
  const buttons = pagination(page);
  await buttons.first().click();
  await expectCarouselAt(viewport, "templates");
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(buttons.first()).toBeFocused();

  await status.evaluate((element) => {
    const messages: string[] = [];
    const observer = new MutationObserver(() => {
      messages.push(element.textContent?.trim() ?? "");
    });
    observer.observe(element, { characterData: true, childList: true, subtree: true });
    (
      window as typeof window & {
        coverflowSequentialAnnouncements?: { messages: string[]; observer: MutationObserver };
      }
    ).coverflowSequentialAnnouncements = { messages, observer };
  });

  await page.keyboard.press("ArrowRight");
  await expectCarouselAt(viewport, "project");
  await page.keyboard.press("ArrowRight");
  await expectCarouselAt(viewport, "map");

  const announcements = await page.evaluate(() => {
    const trace = (
      window as typeof window & {
        coverflowSequentialAnnouncements?: { messages: string[]; observer: MutationObserver };
      }
    ).coverflowSequentialAnnouncements;
    trace?.observer.disconnect();
    return trace?.messages ?? [];
  });
  expect(announcements).toEqual(["Project 24031 — Horizon, 2 of 5", "Locatie & planning, 3 of 5"]);
});

test("boundaries, Home/End, native buttons, and form controls keep their keyboard contracts", async ({
  page,
}) => {
  const viewport = page.getByTestId("coverflow-viewport");
  const buttons = pagination(page);
  await buttons.first().click();
  await expectCarouselAt(viewport, "templates");
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  const scrollBefore = await page.evaluate(() => scrollY);
  await page.keyboard.press("ArrowLeft");
  expect(await page.evaluate(() => scrollY)).toBe(scrollBefore);
  await expect(viewport).toHaveAttribute("data-target-id", "templates");

  await page.keyboard.press("End");
  await expectCarouselAt(viewport, "settings");
  await page.keyboard.press("Home");
  await expectCarouselAt(viewport, "templates");

  const next = page.getByTestId("coverflow-next");
  await next.focus();
  await page.keyboard.press("Enter");
  await expectCarouselAt(viewport, "project");
  const previous = page.getByTestId("coverflow-previous");
  await previous.focus();
  await page.keyboard.press("Space");
  await expectCarouselAt(viewport, "templates");

  const numberInput = page.getByRole("spinbutton", { name: "Maximum skip", exact: true });
  const numberBefore = Number(await numberInput.inputValue());
  await numberInput.focus();
  await page.keyboard.press("ArrowRight");
  expect(Number(await numberInput.inputValue())).toBe(numberBefore);
  await expect(viewport).toHaveAttribute("data-target-id", "templates");

  const range = page.getByRole("slider", { name: "Stage width", exact: true });
  const rangeBefore = Number(await range.inputValue());
  await range.focus();
  await page.keyboard.press("ArrowRight");
  expect(Number(await range.inputValue())).toBeGreaterThan(rangeBefore);
  await expect(viewport).toHaveAttribute("data-target-id", "templates");
});
