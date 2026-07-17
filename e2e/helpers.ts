import { expect, type Locator, type Page } from "@playwright/test";

export type DemoId = "grid" | "media" | "sheet";
export type ReducedMotionMode = "no-preference" | "reduce" | "system";

interface DragOptions {
  beforeRelease?: () => Promise<void> | void;
  eventIntervalMs?: number;
  stepDelay?: number;
  steps?: number;
}

interface Point {
  x: number;
  y: number;
}

function centerOf(box: NonNullable<Awaited<ReturnType<Locator["boundingBox"]>>>): Point {
  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  };
}

export async function openLabDemo(
  page: Page,
  demo: DemoId,
  reducedMotion: ReducedMotionMode = "reduce",
) {
  await page.goto("/");
  await page.getByTestId("reduced-motion-mode").selectOption(reducedMotion);

  const tab = page.locator(`#tab-${demo}`);
  await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(`#panel-${demo}`)).toBeVisible();
}

export async function expectCarouselAt(carousel: Locator, id: string) {
  await expect(carousel).toHaveAttribute("data-active-id", id);
  await expect(carousel).toHaveAttribute("data-phase", "idle", { timeout: 8_000 });
}

export async function expectSheetOpenAt(dialog: Locator, id: string) {
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("data-sheet-snap", id);
  await expect(dialog).toHaveAttribute("data-sheet-state", "open", { timeout: 8_000 });
}

export async function dragMouseBy(
  page: Page,
  target: Locator,
  deltaX: number,
  deltaY: number,
  options: DragOptions = {},
) {
  await expect(target).toBeVisible();
  const box = await target.boundingBox();
  if (!box) {
    throw new Error("Cannot drag an element without a layout box.");
  }

  const start = centerOf(box);
  const steps = Math.max(1, options.steps ?? 10);
  const stepDelay = Math.max(0, options.stepDelay ?? 20);

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  try {
    for (let step = 1; step <= steps; step += 1) {
      await page.mouse.move(start.x + (deltaX * step) / steps, start.y + (deltaY * step) / steps);
      if (stepDelay > 0) {
        await page.waitForTimeout(stepDelay);
      }
    }
    await options.beforeRelease?.();
  } finally {
    await page.mouse.up();
  }
}

export async function dragTouchBy(
  page: Page,
  target: Locator,
  deltaX: number,
  deltaY: number,
  options: Omit<DragOptions, "beforeRelease"> = {},
) {
  await expect(target).toBeVisible();
  const box = await target.boundingBox();
  if (!box) {
    throw new Error("Cannot drag an element without a layout box.");
  }

  const start = centerOf(box);
  const pointerId = 71;
  const steps = Math.max(2, options.steps ?? 10);
  const stepDelay = Math.max(0, options.stepDelay ?? 24);

  await target.evaluate(
    (element, point) => {
      element.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          button: 0,
          buttons: 1,
          cancelable: true,
          clientX: point.x,
          clientY: point.y,
          isPrimary: true,
          pointerId: point.pointerId,
          pointerType: "touch",
        }),
      );
    },
    { ...start, pointerId },
  );

  for (let step = 1; step <= steps; step += 1) {
    await page.evaluate(
      (point) => {
        window.dispatchEvent(
          new PointerEvent("pointermove", {
            bubbles: true,
            button: 0,
            buttons: 1,
            cancelable: true,
            clientX: point.x,
            clientY: point.y,
            isPrimary: true,
            pointerId: point.pointerId,
            pointerType: "touch",
          }),
        );
      },
      {
        x: start.x + (deltaX * step) / steps,
        y: start.y + (deltaY * step) / steps,
        pointerId,
      },
    );
    if (stepDelay > 0) {
      await page.waitForTimeout(stepDelay);
    }
  }

  await page.evaluate(
    (point) => {
      window.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          button: 0,
          buttons: 0,
          cancelable: true,
          clientX: point.x,
          clientY: point.y,
          isPrimary: true,
          pointerId: point.pointerId,
          pointerType: "touch",
        }),
      );
    },
    { x: start.x + deltaX, y: start.y + deltaY, pointerId },
  );
}

export async function dragSyntheticPointerBy(
  page: Page,
  target: Locator,
  deltaX: number,
  deltaY: number,
  options: DragOptions = {},
) {
  await expect(target).toBeVisible();
  const start = await target.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  });
  const pointerId = 83;
  const steps = Math.max(1, options.steps ?? 8);
  const stepDelay = Math.max(0, options.stepDelay ?? 20);
  const baseTimestamp = await page.evaluate(() => performance.now());
  const eventIntervalMs = options.eventIntervalMs;

  await target.evaluate(
    (element, point) => {
      const event = new PointerEvent("pointerdown", {
        bubbles: true,
        button: 0,
        buttons: 1,
        cancelable: true,
        clientX: point.x,
        clientY: point.y,
        isPrimary: true,
        pointerId: point.pointerId,
        pointerType: "mouse",
      });
      if (point.timestamp !== undefined) {
        Object.defineProperty(event, "timeStamp", { value: point.timestamp });
      }
      element.dispatchEvent(event);
    },
    {
      ...start,
      pointerId,
      timestamp: eventIntervalMs === undefined ? undefined : baseTimestamp,
    },
  );

  for (let step = 1; step <= steps; step += 1) {
    await page.evaluate(
      (point) => {
        const event = new PointerEvent("pointermove", {
          bubbles: true,
          button: 0,
          buttons: 1,
          cancelable: true,
          clientX: point.x,
          clientY: point.y,
          isPrimary: true,
          pointerId: point.pointerId,
          pointerType: "mouse",
        });
        if (point.timestamp !== undefined) {
          Object.defineProperty(event, "timeStamp", { value: point.timestamp });
        }
        window.dispatchEvent(event);
      },
      {
        x: start.x + (deltaX * step) / steps,
        y: start.y + (deltaY * step) / steps,
        pointerId,
        timestamp:
          eventIntervalMs === undefined ? undefined : baseTimestamp + eventIntervalMs * step,
      },
    );
    if (stepDelay > 0) {
      await page.waitForTimeout(stepDelay);
    }
  }

  await options.beforeRelease?.();
  await page.evaluate(
    (point) => {
      const event = new PointerEvent("pointerup", {
        bubbles: true,
        button: 0,
        buttons: 0,
        cancelable: true,
        clientX: point.x,
        clientY: point.y,
        isPrimary: true,
        pointerId: point.pointerId,
        pointerType: "mouse",
      });
      if (point.timestamp !== undefined) {
        Object.defineProperty(event, "timeStamp", { value: point.timestamp });
      }
      window.dispatchEvent(event);
    },
    {
      x: start.x + deltaX,
      y: start.y + deltaY,
      pointerId,
      timestamp:
        eventIntervalMs === undefined ? undefined : baseTimestamp + eventIntervalMs * (steps + 1),
    },
  );
}

export async function setNumericInput(input: Locator, value: number) {
  await input.fill(String(value));
  await input.blur();
}
