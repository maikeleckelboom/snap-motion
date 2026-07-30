import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

import { dragSyntheticPointerBy, expectCarouselAt, openLabDemo } from "./helpers";

const CENTER_ID = "map";

function carousel(page: Page) {
  return page.getByTestId("coverflow-viewport");
}

function gallery(page: Page) {
  return page.getByTestId("coverflow-gallery");
}

function card(page: Page, id: string) {
  return page.locator(`.coverflow-card[data-screen-id="${id}"]`);
}

async function openGallery(page: Page) {
  await page.getByTestId("coverflow-inspect").click();
  await expect(gallery(page)).toBeVisible();
  await expect(gallery(page)).toHaveAttribute("data-dialog-state", "open");
}

async function visibleCardPoint(target: Locator) {
  return target.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    for (let xStep = 1; xStep < 10; xStep += 1) {
      for (let yStep = 1; yStep < 10; yStep += 1) {
        const x = rect.left + (rect.width * xStep) / 10;
        const y = rect.top + (rect.height * yStep) / 10;
        const hitCard = document
          .elementsFromPoint(x, y)
          .map((hit) => hit.closest(".coverflow-card"))
          .find(Boolean);
        if (hitCard === element) return { x, y };
      }
    }
    throw new Error("The card has no uncovered hit-test point.");
  });
}

async function clickVisibleCard(page: Page, target: Locator) {
  const point = await visibleCardPoint(target);
  await page.mouse.click(point.x, point.y);
}

interface PointerGestureOptions {
  readonly cancel?: boolean;
  readonly deltaX?: number;
  readonly deltaY?: number;
  readonly elapsedMs?: number;
  readonly pointerId?: number;
  readonly pointerType?: "mouse" | "pen" | "touch";
  readonly releaseTarget?: Locator;
}

async function pointerGesture(
  page: Page,
  target: Locator,
  {
    cancel = false,
    deltaX = 0,
    deltaY = 0,
    elapsedMs = 240,
    pointerId = 211,
    pointerType = "touch",
    releaseTarget,
  }: PointerGestureOptions = {},
) {
  const point = await target.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  const timestamp = await page.evaluate(() => performance.now());
  await target.evaluate(
    (element, input) => {
      const event = new PointerEvent("pointerdown", {
        bubbles: true,
        button: 0,
        buttons: 1,
        cancelable: true,
        clientX: input.x,
        clientY: input.y,
        isPrimary: true,
        pointerId: input.pointerId,
        pointerType: input.pointerType,
      });
      Object.defineProperty(event, "timeStamp", { value: input.timestamp });
      element.dispatchEvent(event);
    },
    { ...point, pointerId, pointerType, timestamp },
  );
  await page.evaluate(
    (input) => {
      const event = new PointerEvent("pointermove", {
        bubbles: true,
        button: 0,
        buttons: 1,
        cancelable: true,
        clientX: input.x + input.deltaX,
        clientY: input.y + input.deltaY,
        isPrimary: true,
        pointerId: input.pointerId,
        pointerType: input.pointerType,
      });
      Object.defineProperty(event, "timeStamp", {
        value: input.timestamp + input.elapsedMs / 2,
      });
      window.dispatchEvent(event);
    },
    { ...point, deltaX, deltaY, elapsedMs, pointerId, pointerType, timestamp },
  );
  if (cancel) {
    await page.evaluate(
      (input) => {
        window.dispatchEvent(
          new PointerEvent("pointercancel", {
            bubbles: true,
            cancelable: true,
            clientX: input.x + input.deltaX,
            clientY: input.y + input.deltaY,
            isPrimary: true,
            pointerId: input.pointerId,
            pointerType: input.pointerType,
          }),
        );
      },
      { ...point, deltaX, deltaY, pointerId, pointerType },
    );
    return;
  }
  const endTarget = releaseTarget ?? page.locator("body");
  await endTarget.evaluate(
    (element, input) => {
      const event = new PointerEvent("pointerup", {
        bubbles: true,
        button: 0,
        buttons: 0,
        cancelable: true,
        clientX: input.x + input.deltaX,
        clientY: input.y + input.deltaY,
        isPrimary: true,
        pointerId: input.pointerId,
        pointerType: input.pointerType,
      });
      Object.defineProperty(event, "timeStamp", {
        value: input.timestamp + input.elapsedMs,
      });
      element.dispatchEvent(event);
    },
    { ...point, deltaX, deltaY, elapsedMs, pointerId, pointerType, timestamp },
  );
}

async function expectDialogFocus(page: Page) {
  expect(
    await gallery(page).evaluate(
      (dialog, activeElement) => activeElement instanceof Element && dialog.contains(activeElement),
      await page.evaluateHandle(() => document.activeElement),
    ),
  ).toBe(true);
}

test.beforeEach(async ({ page }) => {
  await openLabDemo(page, "coverflow", "no-preference");
});

test("settled card, side card, touch tap, cancellation, and stage focus resolve once", async ({
  page,
}) => {
  const viewport = carousel(page);
  await card(page, CENTER_ID).click();
  await expect(gallery(page)).toBeVisible();
  await expect(page.getByTestId("coverflow-gallery-close")).toBeFocused();
  await expect(viewport).not.toBeFocused();
  await page.getByTestId("coverflow-gallery-close").click();
  await expect(gallery(page)).not.toBeVisible();

  await clickVisibleCard(page, card(page, "team"));
  await expect(gallery(page)).not.toBeVisible();
  await expectCarouselAt(viewport, "team");
  await expect(viewport).not.toBeFocused();
  await clickVisibleCard(page, card(page, "team"));
  await expect(gallery(page)).toBeVisible();
  await page.getByTestId("coverflow-gallery-close").click();
  await expect(gallery(page)).not.toBeVisible();

  await pointerGesture(page, card(page, "team"));
  await expect(gallery(page)).toBeVisible();
  await page.getByTestId("coverflow-gallery-close").click();
  await expect(gallery(page)).not.toBeVisible();

  await pointerGesture(page, card(page, "team"), {
    cancel: true,
    deltaX: 18,
    pointerId: 212,
  });
  await expect(gallery(page)).not.toBeVisible();
  await expect(viewport).not.toBeFocused();

  await dragSyntheticPointerBy(page, card(page, "team"), -180, 0, {
    eventIntervalMs: 45,
    stepDelay: 0,
  });
  await expect(gallery(page)).not.toBeVisible();
  await expect(viewport).toBeFocused();
});

test("shared inspect control opens directly without starting a carousel drag", async ({ page }) => {
  const viewport = carousel(page);
  const inspect = page.getByTestId("coverflow-inspect");
  const before = {
    phase: await viewport.getAttribute("data-phase"),
    position: await viewport.getAttribute("data-position"),
  };
  await inspect.dispatchEvent("pointerdown", {
    button: 0,
    buttons: 1,
    isPrimary: true,
    pointerId: 301,
    pointerType: "mouse",
  });
  await expect(viewport).toHaveAttribute("data-phase", before.phase ?? "idle");
  await expect(viewport).toHaveAttribute("data-position", before.position ?? "0");
  await inspect.dispatchEvent("pointerup", {
    button: 0,
    buttons: 0,
    isPrimary: true,
    pointerId: 301,
    pointerType: "mouse",
  });
  await inspect.click();
  await expect(gallery(page)).toBeVisible();
  await expect(page.locator("dialog[open]")).toHaveCount(1);
});

test("dialog entrance and directional track expose rendered intermediate states", async ({
  page,
}) => {
  const inspect = page.getByTestId("coverflow-inspect");
  const entrance = await inspect.evaluate(async (button: HTMLButtonElement) => {
    button.click();
    await Promise.resolve();
    await Promise.resolve();
    const dialog = document.querySelector<HTMLDialogElement>('[data-testid="coverflow-gallery"]');
    const shell = dialog?.querySelector<HTMLElement>('[data-testid="coverflow-gallery-shell"]');
    const initial = {
      dialogOpen: dialog?.open,
      opacity: shell ? Number(getComputedStyle(shell).opacity) : -1,
      state: dialog?.dataset.dialogState,
    };
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const animations = shell?.getAnimations() ?? [];
    if (animations.length === 0) throw new Error("Dialog opening transition did not start.");
    for (const animation of animations) {
      animation.pause();
      animation.currentTime = 110;
    }
    const style = shell ? getComputedStyle(shell) : undefined;
    return {
      initial,
      midpoint: {
        opacity: style ? Number(style.opacity) : -1,
        transform: style?.transform ?? "none",
      },
    };
  });
  expect(entrance.initial).toEqual({ dialogOpen: true, opacity: 0, state: "opening" });
  const dialog = gallery(page);
  expect(entrance.midpoint.opacity).toBeGreaterThan(0);
  expect(entrance.midpoint.opacity).toBeLessThan(1);
  expect(entrance.midpoint.transform).not.toBe("none");
  await page.getByTestId("coverflow-gallery-shell").evaluate((element) => {
    for (const animation of element.getAnimations()) animation.finish();
  });
  await expect(dialog).toHaveAttribute("data-dialog-state", "open");

  const galleryTrack = page.getByTestId("coverflow-gallery-track");
  const continuity = await galleryTrack.evaluate(async (element) => {
    const viewportElement = element.parentElement;
    if (!viewportElement) throw new Error("Gallery viewport is unavailable.");
    const viewport = viewportElement.getBoundingClientRect();
    const pointerId = 881;
    viewportElement.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        button: 0,
        buttons: 1,
        cancelable: true,
        clientX: viewport.left + viewport.width / 2,
        clientY: viewport.top + viewport.height / 2,
        isPrimary: true,
        pointerId,
        pointerType: "touch",
      }),
    );
    window.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        button: 0,
        buttons: 1,
        cancelable: true,
        clientX: viewport.left,
        clientY: viewport.top + viewport.height / 2,
        isPrimary: true,
        pointerId,
        pointerType: "touch",
      }),
    );
    await Promise.resolve();
    const visibleSlots = [...element.querySelectorAll<HTMLElement>(".coverflow-gallery-slot")]
      .map((slot) => {
        const rect = slot.getBoundingClientRect();
        const visibleWidth = viewport
          ? Math.max(0, Math.min(rect.right, viewport.right) - Math.max(rect.left, viewport.left))
          : 0;
        return {
          id: slot.dataset.itemId,
          left: rect.left,
          position: slot.dataset.slotPosition,
          previewVisible:
            getComputedStyle(slot.querySelector<HTMLElement>(".gallery-image-placeholder")!)
              .display !== "none",
          visibleWidth,
          right: rect.right,
        };
      })
      .filter((slot) => slot.visibleWidth > 0);
    return visibleSlots;
  });
  expect(continuity.map((slot) => slot.id)).toEqual(expect.arrayContaining(["map", "team"]));
  expect(continuity.every((slot) => slot.previewVisible)).toBe(true);
  const currentSlot = continuity.find((slot) => slot.id === "map");
  const nextSlot = continuity.find((slot) => slot.id === "team");
  expect(Math.abs((currentSlot?.right ?? 0) - (nextSlot?.left ?? 0))).toBeLessThan(1);
  expect(
    await page.getByTestId("coverflow-gallery-viewport").evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width / rect.height;
    }),
  ).toBeCloseTo(1.6, 2);
  await page.evaluate(() => {
    window.dispatchEvent(
      new PointerEvent("pointercancel", {
        bubbles: true,
        cancelable: true,
        isPrimary: true,
        pointerId: 881,
        pointerType: "touch",
      }),
    );
  });
  await expect(dialog).toHaveAttribute("data-track-state", "idle");
  await page.getByTestId("coverflow-gallery-next").click();
  await expect(page.getByTestId("coverflow-gallery-position")).toHaveText("4 / 5");
  await expect(dialog).toHaveAttribute("data-track-state", "idle");
  await expect(page.locator('[data-slot-position="0"]')).toHaveAttribute("data-item-id", "team");
});

test("native modal contains focus, guards the background, and restores scroll styles", async ({
  page,
}) => {
  const viewport = carousel(page);
  const rootStyles = await page.locator("html").evaluate((element) => ({
    overflow: element.style.overflow,
    paddingInlineEnd: element.style.paddingInlineEnd,
  }));
  await openGallery(page);
  expect(await gallery(page).evaluate((element) => element.matches(":modal"))).toBe(true);
  await expectDialogFocus(page);

  await page.getByTestId("coverflow-next").evaluate((button: HTMLButtonElement) => button.click());
  await expect(viewport).toHaveAttribute("data-active-id", CENTER_ID);
  await expect(viewport).toHaveAttribute("data-phase", "idle");

  for (let step = 0; step < 12; step += 1) {
    await page.keyboard.press("Tab");
    await expectDialogFocus(page);
  }
  for (let step = 0; step < 12; step += 1) {
    await page.keyboard.press("Shift+Tab");
    await expectDialogFocus(page);
  }

  await page.keyboard.press("Escape");
  await expect(gallery(page)).not.toBeVisible();
  await expect(page.getByTestId("coverflow-inspect")).toBeFocused();
  expect(
    await page.locator("html").evaluate((element) => ({
      overflow: element.style.overflow,
      paddingInlineEnd: element.style.paddingInlineEnd,
    })),
  ).toEqual(rootStyles);
});

test("backdrop closes only a true backdrop sequence and not an image gesture", async ({ page }) => {
  await openGallery(page);
  const dialog = gallery(page);
  await dialog.dispatchEvent("pointerdown", {
    button: 0,
    buttons: 1,
    clientX: 2,
    clientY: 2,
    isPrimary: true,
    pointerId: 401,
    pointerType: "mouse",
  });
  await dialog.dispatchEvent("pointerup", {
    button: 0,
    buttons: 0,
    clientX: 2,
    clientY: 2,
    isPrimary: true,
    pointerId: 401,
    pointerType: "mouse",
  });
  await expect(dialog).not.toBeVisible();

  await openGallery(page);
  await pointerGesture(page, page.getByTestId("coverflow-gallery-viewport"), {
    deltaX: -110,
    elapsedMs: 500,
    pointerId: 402,
    releaseTarget: dialog,
  });
  await expect(dialog).toBeVisible();
});

test("close synchronizes every carousel owner and resumes navigation without catch-up", async ({
  page,
}) => {
  const viewport = carousel(page);
  const pagination = page.getByRole("group", { name: "Coverflow screens" }).getByRole("button");
  await pagination.nth(1).click();
  await expectCarouselAt(viewport, "project");
  await openGallery(page);

  await page.getByTestId("coverflow-status").evaluate((element) => {
    const messages: string[] = [];
    const observer = new MutationObserver(() => {
      messages.push(element.textContent?.trim() ?? "");
    });
    observer.observe(element, { characterData: true, childList: true, subtree: true });
    (
      window as typeof window & {
        coverflowGalleryCloseTrace?: { messages: string[]; observer: MutationObserver };
      }
    ).coverflowGalleryCloseTrace = { messages, observer };
  });

  await page.keyboard.press("End");
  await expect(page.getByTestId("coverflow-gallery-position")).toHaveText("5 / 5");
  await expect(page.getByTestId("coverflow-gallery-next")).toBeDisabled();
  await page.getByTestId("coverflow-gallery-close").click();
  await expect(gallery(page)).not.toBeVisible();

  await expect(viewport).toHaveAttribute("data-active-id", "settings");
  await expect(viewport).toHaveAttribute("data-target-id", "settings");
  await expect(viewport).toHaveAttribute("data-visual-id", "settings");
  await expect(viewport).toHaveAttribute("data-physical-index", "4");
  await expect(viewport).toHaveAttribute("data-visual-index", "4");
  await expect(viewport).toHaveAttribute("data-settled-index", "4");
  await expect(viewport).toHaveAttribute("data-speed-in-cards", "0");
  await expect(viewport).toHaveAttribute("data-phase", "idle");
  await expect(page.getByTestId("coverflow-pagination-indicator")).toHaveAttribute(
    "data-position",
    "4.00000",
  );
  await expect(page.getByTestId("coverflow-counter")).toHaveText("5");
  await expect(page.getByTestId("coverflow-caption")).toContainText("Werkruimte-instellingen");
  await expect(page.getByTestId("coverflow-inspect")).toBeFocused();
  const trace = await page.evaluate(() => {
    const current = (
      window as typeof window & {
        coverflowGalleryCloseTrace?: { messages: string[]; observer: MutationObserver };
      }
    ).coverflowGalleryCloseTrace;
    current?.observer.disconnect();
    return current?.messages ?? [];
  });
  expect(trace).toEqual([]);

  await page.keyboard.press("ArrowLeft");
  await expectCarouselAt(viewport, "team");
  await expect(page.getByTestId("coverflow-status")).toContainText("Team & rollen, 4 of 5");
});

test("buttons, keys, announcements, and item changes own bounded gallery navigation", async ({
  page,
}) => {
  await openGallery(page);
  const status = page.getByTestId("coverflow-gallery-status");
  await page.getByTestId("coverflow-gallery-zoom-in").click();
  await expect(gallery(page)).toHaveAttribute("data-scale", "1.5000");
  await page.getByTestId("coverflow-gallery-next").click();
  await expect(page.getByTestId("coverflow-gallery-position")).toHaveText("4 / 5");
  await expect(gallery(page)).toHaveAttribute("data-scale", "1.0000");
  await expect(gallery(page)).toHaveAttribute("data-pan-x", "0.000");
  await expect(gallery(page)).toHaveAttribute("data-pan-y", "0.000");
  await expect(status).toHaveText("Team & rollen, 4 of 5");

  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("coverflow-gallery-position")).toHaveText("3 / 5");
  await page.keyboard.press("Home");
  await expect(page.getByTestId("coverflow-gallery-position")).toHaveText("1 / 5");
  await expect(page.getByTestId("coverflow-gallery-previous")).toBeDisabled();
  await page.keyboard.press("End");
  await expect(page.getByTestId("coverflow-gallery-position")).toHaveText("5 / 5");
  await expect(page.getByTestId("coverflow-gallery-next")).toBeDisabled();
});

test("discrete, focal, touch, and wheel zoom preserve the canonical fit state", async ({
  page,
}) => {
  await openGallery(page);
  const dialog = gallery(page);
  const viewport = page.getByTestId("coverflow-gallery-viewport");
  const zoomIn = page.getByTestId("coverflow-gallery-zoom-in");
  const zoomOut = page.getByTestId("coverflow-gallery-zoom-out");
  const reset = page.getByTestId("coverflow-gallery-reset");
  await expect(zoomOut).toBeDisabled();
  await expect(reset).toBeDisabled();

  await zoomIn.click();
  await expect(dialog).toHaveAttribute("data-scale", "1.5000");
  await zoomOut.click();
  await expect(dialog).toHaveAttribute("data-scale", "1.0000");
  await page.keyboard.press("+");
  await expect(dialog).toHaveAttribute("data-scale", "1.5000");
  await page.keyboard.press("-");
  await expect(dialog).toHaveAttribute("data-scale", "1.0000");

  const box = await viewport.boundingBox();
  if (!box) throw new Error("Gallery viewport is not measurable.");
  await viewport.dblclick({
    position: { x: box.width * 0.75, y: box.height * 0.4 },
  });
  await expect(dialog).toHaveAttribute("data-scale", "2.0000");
  expect(Math.abs(Number(await dialog.getAttribute("data-pan-x")))).toBeGreaterThan(1);
  await viewport.dblclick({
    position: { x: box.width * 0.75, y: box.height * 0.4 },
  });
  await expect(dialog).toHaveAttribute("data-scale", "1.0000");
  await expect(dialog).toHaveAttribute("data-pan-x", "0.000");
  await page
    .locator('[data-slot-position="0"] .coverflow-gallery-transform')
    .evaluate(async (element) => {
      await Promise.all(element.getAnimations().map((animation) => animation.finished));
    });

  await viewport.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const point = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const baseTimestamp = performance.now();
    for (const [pointerId, offset] of [
      [501, 0],
      [502, 180],
    ] as const) {
      const down = new PointerEvent("pointerdown", {
        bubbles: true,
        button: 0,
        buttons: 1,
        cancelable: true,
        clientX: point.x,
        clientY: point.y,
        isPrimary: true,
        pointerId,
        pointerType: "touch",
      });
      Object.defineProperty(down, "timeStamp", { value: baseTimestamp + offset });
      element.dispatchEvent(down);
      const up = new PointerEvent("pointerup", {
        bubbles: true,
        button: 0,
        buttons: 0,
        cancelable: true,
        clientX: point.x,
        clientY: point.y,
        isPrimary: true,
        pointerId,
        pointerType: "touch",
      });
      Object.defineProperty(up, "timeStamp", { value: baseTimestamp + offset + 40 });
      window.dispatchEvent(up);
    }
  });
  await expect(dialog).toHaveAttribute("data-scale", "2.0000");

  await page.keyboard.press("0");
  await expect(dialog).toHaveAttribute("data-scale", "1.0000");
  const browserZoomPrevented = await dialog.evaluate((element) => {
    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      key: "+",
    });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(browserZoomPrevented).toBe(false);
  await expect(dialog).toHaveAttribute("data-scale", "1.0000");
  const wheelPrevented = await viewport.evaluate((element) => {
    const event = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: -120,
    });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(wheelPrevented).toBe(false);
  await expect(dialog).toHaveAttribute("data-scale", "1.0000");

  for (let step = 0; step < 6; step += 1) await zoomIn.click();
  await expect(dialog).toHaveAttribute("data-scale", "4.0000");
  await expect(zoomIn).toBeDisabled();
  await reset.click();
  await expect(dialog).toHaveAttribute("data-scale", "1.0000");
});

test("fit swipe, zoomed pan, pinch, cancellation, and resize keep exclusive ownership", async ({
  page,
}) => {
  await openGallery(page);
  const dialog = gallery(page);
  const viewport = page.getByTestId("coverflow-gallery-viewport");

  await pointerGesture(page, viewport, {
    deltaX: -180,
    deltaY: 8,
    elapsedMs: 480,
    pointerId: 601,
  });
  await expect(page.getByTestId("coverflow-gallery-position")).toHaveText("4 / 5");
  await pointerGesture(page, viewport, {
    deltaX: 20,
    deltaY: 150,
    elapsedMs: 480,
    pointerId: 602,
  });
  await expect(page.getByTestId("coverflow-gallery-position")).toHaveText("4 / 5");
  await expect(dialog).toBeVisible();

  await page.getByTestId("coverflow-gallery-zoom-in").click();
  await page
    .locator('[data-slot-position="0"] .coverflow-gallery-transform')
    .evaluate((element) => {
      const animation = element.getAnimations()[0];
      if (!animation) throw new Error("Discrete zoom transition did not start.");
      animation.pause();
      animation.currentTime = 90;
    });
  await pointerGesture(page, viewport, {
    deltaX: 260,
    deltaY: -180,
    elapsedMs: 500,
    pointerId: 603,
  });
  await expect(page.getByTestId("coverflow-gallery-position")).toHaveText("4 / 5");
  expect(Math.abs(Number(await dialog.getAttribute("data-pan-x")))).toBeGreaterThan(0);
  const clamped = await dialog.evaluate((element) => {
    const imageViewport = element.querySelector<HTMLElement>(
      '[data-testid="coverflow-gallery-viewport"]',
    );
    const scale = Number(element.dataset.scale);
    const panX = Math.abs(Number(element.dataset.panX));
    const panY = Math.abs(Number(element.dataset.panY));
    const rect = imageViewport?.getBoundingClientRect();
    return {
      panX,
      panY,
      maxX: rect ? (rect.width * (scale - 1)) / 2 : 0,
      maxY: rect ? (rect.height * (scale - 1)) / 2 : 0,
    };
  });
  expect(clamped.panX).toBeLessThanOrEqual(clamped.maxX + 1);
  expect(clamped.panY).toBeLessThanOrEqual(clamped.maxY + 1);

  await page.getByTestId("coverflow-gallery-reset").click();
  await viewport.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const dispatch = (
      type: string,
      pointerId: number,
      x: number,
      y: number,
      isPrimary: boolean,
    ) => {
      const event = new PointerEvent(type, {
        bubbles: true,
        button: 0,
        buttons: type === "pointerup" ? 0 : 1,
        cancelable: true,
        clientX: rect.left + x,
        clientY: rect.top + y,
        isPrimary,
        pointerId,
        pointerType: "touch",
      });
      (type === "pointerdown" ? element : window).dispatchEvent(event);
    };
    dispatch("pointerdown", 611, rect.width * 0.4, rect.height * 0.5, true);
    dispatch("pointerdown", 612, rect.width * 0.6, rect.height * 0.5, false);
    dispatch("pointermove", 611, rect.width * 0.25, rect.height * 0.45, true);
    dispatch("pointermove", 612, rect.width * 0.75, rect.height * 0.55, false);
  });
  expect(Number(await dialog.getAttribute("data-scale"))).toBeGreaterThan(2);
  await page.evaluate(() => {
    window.dispatchEvent(
      new PointerEvent("pointercancel", {
        bubbles: true,
        cancelable: true,
        isPrimary: true,
        pointerId: 611,
        pointerType: "touch",
      }),
    );
  });
  await expect(viewport).toHaveAttribute("data-pointer-mode", "idle");

  await page.setViewportSize({ width: 720, height: 540 });
  await expect(viewport).toBeVisible();
  const resized = await dialog.evaluate((element) => ({
    panX: Number(element.dataset.panX),
    panY: Number(element.dataset.panY),
    scale: Number(element.dataset.scale),
  }));
  expect(Number.isFinite(resized.panX)).toBe(true);
  expect(Number.isFinite(resized.panY)).toBe(true);
  expect(resized.scale).toBeGreaterThanOrEqual(1);
});

test("loading preserves geometry, requests adjacent images, and reveals decoded content", async ({
  page,
}) => {
  await page.goto("about:blank");
  const fullRequests = new Set<string>();
  page.on("request", (request) => {
    if (request.url().includes("/coverflow-gallery/") && request.url().includes("?full")) {
      fullRequests.add(new URL(request.url()).pathname.split("/").at(-1) ?? "");
    }
  });
  const mapFullPattern = "**/coverflow-gallery/map.svg?full*";
  let releaseRetry: (() => void) | undefined;
  const retryHold = new Promise<void>((resolve) => {
    releaseRetry = resolve;
  });
  await page.route(mapFullPattern, async (route) => {
    if (route.request().url().includes("retry=")) {
      await retryHold;
      await route.continue();
    } else {
      await route.abort("failed");
    }
  });
  await openLabDemo(page, "coverflow", "no-preference");
  await page.getByTestId("coverflow-inspect").click();
  await expect(gallery(page)).toHaveAttribute("data-image-state", "failed");

  const viewport = page.getByTestId("coverflow-gallery-viewport");
  const before = await viewport.boundingBox();
  await page.locator(".gallery-media-status").getByRole("button", { name: "Retry" }).click();
  await expect(page.getByTestId("coverflow-gallery-loading")).toBeVisible();
  if (!releaseRetry) throw new Error("Retry request hold was not initialized.");
  releaseRetry();
  await expect(gallery(page)).toHaveAttribute("data-image-state", "loaded", {
    timeout: 8_000,
  });
  const after = await viewport.boundingBox();
  expect(Math.abs((after?.width ?? 0) - (before?.width ?? 0))).toBeLessThan(1);
  expect(Math.abs((after?.height ?? 0) - (before?.height ?? 0))).toBeLessThan(1);
  expect(fullRequests).toEqual(new Set(["project.svg", "map.svg", "team.svg"]));
  await expect(page.locator('[data-slot-position="0"] .gallery-image-full.revealed')).toHaveCount(
    1,
  );
});

test("a failed full image retains its preview and leaves navigation and close usable", async ({
  page,
}) => {
  await page.route("**/coverflow-gallery/map.svg?full", async (route) => {
    await route.abort("failed");
  });
  await openLabDemo(page, "coverflow", "no-preference");
  await openGallery(page);
  await expect(gallery(page)).toHaveAttribute("data-image-state", "failed");
  await expect(page.getByTestId("coverflow-gallery-error")).toContainText("Full image unavailable");
  await expect(page.locator('[data-slot-position="0"] .gallery-image-placeholder')).toHaveAttribute(
    "alt",
    /Location and planning screen/,
  );
  const failureBox = await page.getByTestId("coverflow-gallery-error").boundingBox();
  const mediaBox = await page.getByTestId("coverflow-gallery-viewport").boundingBox();
  expect(failureBox?.y).toBeGreaterThanOrEqual((mediaBox?.y ?? 0) + (mediaBox?.height ?? 0));
  await page.getByTestId("coverflow-gallery-next").click();
  await expect(page.getByTestId("coverflow-gallery-position")).toHaveText("4 / 5");
  await page.getByTestId("coverflow-gallery-close").click();
  await expect(gallery(page)).not.toBeVisible();
});

test("semantics, focus visibility, coarse discovery, reduced motion, and reflow remain usable", async ({
  page,
}) => {
  await expect(page.locator(".coverflow-expand")).toHaveCount(0);
  await expect(page.getByTestId("coverflow-inspect")).toHaveAccessibleName(
    "Inspect Locatie & planning in screen gallery, 3 of 5",
  );
  const inspectBox = await page.getByTestId("coverflow-inspect").boundingBox();
  expect(inspectBox?.width).toBeGreaterThanOrEqual(44);
  expect(inspectBox?.height).toBeGreaterThanOrEqual(44);
  await page.getByTestId("reduced-motion-mode").selectOption("reduce");
  await openGallery(page);
  const dialog = gallery(page);
  await expect(dialog).toHaveAccessibleName("Screen gallery");
  await expect(dialog).toHaveAttribute("data-reduced-motion", "true");
  await page.getByTestId("coverflow-gallery-zoom-in").click();
  await expect(dialog).toHaveAttribute("data-scale", "1.5000");
  expect(
    await page
      .locator('[data-slot-position="0"] .coverflow-gallery-transform')
      .evaluate((element) => Number.parseFloat(getComputedStyle(element).transitionDuration)),
  ).toBeLessThan(0.001);
  await page.getByTestId("coverflow-gallery-reset").click();
  await expect(page.locator('[data-slot-position="0"]').getByRole("img")).toHaveAccessibleName(
    "Location and planning screen with a map, route lines, and a selected location.",
  );
  for (const testId of [
    "coverflow-gallery-close",
    "coverflow-gallery-previous",
    "coverflow-gallery-next",
    "coverflow-gallery-zoom-in",
  ]) {
    const control = page.getByTestId(testId);
    const box = await control.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
  const close = page.getByTestId("coverflow-gallery-close");
  await close.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(close).toBeFocused();
  expect(await close.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe(
    "none",
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("coverflow-gallery-viewport")).toBeVisible();
  const reflow = await dialog.evaluate((element) => ({
    horizontalOverflow: element.scrollWidth - element.clientWidth,
    shellHeight: element.querySelector<HTMLElement>(".coverflow-gallery-shell")?.offsetHeight,
  }));
  expect(reflow.horizontalOverflow).toBeLessThanOrEqual(1);
  expect(reflow.shellHeight).toBeLessThanOrEqual(844);
  expect(
    await page
      .locator('meta[name="viewport"]')
      .getAttribute("content")
      .then((content) => /maximum-scale|user-scalable\s*=\s*no/i.test(content ?? "")),
  ).toBe(false);

  const axe = await new AxeBuilder({ page }).include('[data-testid="coverflow-gallery"]').analyze();
  expect(axe.violations.map((violation) => violation.id)).toEqual([]);
  await close.click();
  await expect(dialog).not.toBeVisible();
});

test("focus restoration falls back to the stage when the logical control is unavailable", async ({
  page,
}) => {
  await openGallery(page);
  await page.getByTestId("coverflow-inspect").evaluate((control) => control.remove());
  await page.getByTestId("coverflow-gallery-close").click();
  await expect(gallery(page)).not.toBeVisible();
  await expect(page.getByTestId("coverflow-inspect")).toHaveCount(0);
  await expect(carousel(page)).toBeFocused();
});
