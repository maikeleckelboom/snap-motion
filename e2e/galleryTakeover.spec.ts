import { expect, test } from "@playwright/test";

import { openLabDemo } from "./helpers";

test("compounded programmatic retargets and reversals retain a painted physical corridor", async ({
  page,
}) => {
  await openLabDemo(page, "gallery-at", "no-preference");
  await page.getByTestId("at-scenario-corridor").click();
  await page.getByTestId("at-open-gallery").click();
  const dialog = page.getByTestId("snap-motion-media-gallery");
  await expect(dialog).toHaveAttribute("data-dialog-state", "open");
  await page.getByTestId("snap-motion-media-gallery-shell").evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished));
  });
  await expect
    .poll(() =>
      dialog
        .locator("img")
        .evaluateAll((images) =>
          images.every(
            (image) =>
              image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0,
          ),
        ),
    )
    .toBe(true);
  const clockTime = new Date("2026-01-01T00:00:00Z");
  await page.clock.install({ time: clockTime });
  await page.clock.pauseAt(new Date(clockTime.getTime() + 1000));
  await dialog.evaluate((element) => {
    const viewport = element.querySelector<HTMLElement>(
      '[data-testid="snap-motion-media-gallery-viewport"]',
    )!;
    const bounds = () => {
      const rect = viewport.getBoundingClientRect();
      return [...element.querySelectorAll<HTMLImageElement>("img")].flatMap((image) => {
        if (!image.complete || !image.naturalWidth || Number(getComputedStyle(image).opacity) === 0)
          return [];
        const box = image.getBoundingClientRect();
        // object-fit: contain leaves empty space inside the transformed image element's box.
        const fit = Math.min(box.width / image.naturalWidth, box.height / image.naturalHeight);
        const width = image.naturalWidth * fit;
        const height = image.naturalHeight * fit;
        const left = box.x + (box.width - width) / 2;
        const top = box.y + (box.height - height) / 2;
        return left < rect.right &&
          left + width > rect.left &&
          top < rect.bottom &&
          top + height > rect.top
          ? [
              {
                image,
                x: box.x,
                position: image.closest("[data-slot-position]")?.getAttribute("data-slot-position"),
              },
            ]
          : [];
      });
    };
    const trace = {
      samples: 0,
      blanks: 0,
      maximum: 0,
      before: [] as ReturnType<typeof bounds>,
      sample() {
        this.samples += 1;
        if (!bounds().length) this.blanks += 1;
        this.maximum = Math.max(
          this.maximum,
          element.querySelectorAll("[data-slot-position]").length,
        );
      },
      capture() {
        this.before = bounds();
      },
      takeover() {
        return this.before.every(
          ({ image, x, position }) =>
            image.isConnected &&
            image.closest("[data-slot-position]")?.getAttribute("data-slot-position") ===
              position &&
            Math.abs(image.getBoundingClientRect().x - x) < 0.1,
        );
      },
    };
    (window as typeof window & { corridorTrace: typeof trace }).corridorTrace = trace;
    const frame = () => {
      trace.sample();
      if (element.isConnected) requestAnimationFrame(frame);
    };
    frame();
  });
  const sample = async () => {
    const blanks = await page.evaluate(() => {
      const trace = (
        window as typeof window & { corridorTrace: { sample: () => void; blanks: number } }
      ).corridorTrace;
      trace.sample();
      return trace.blanks;
    });
    expect(blanks).toBe(0);
  };
  const advance = async (milliseconds: number) => {
    for (let elapsed = 0; elapsed < milliseconds; elapsed += 8) {
      await page.clock.runFor(Math.min(8, milliseconds - elapsed));
      await sample();
    }
  };
  const command = async (index: number) => {
    await page.getByTestId(`at-retarget-${index}`).dispatchEvent("click");
    await sample();
  };
  const viewport = page.getByTestId("snap-motion-media-gallery-viewport");
  const box = await viewport.boundingBox();
  if (!box) throw new Error("Missing corridor viewport");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const swipe = async (delta: number) => {
    await page.mouse.move(x, y);
    await page.evaluate(() =>
      (
        window as typeof window & { corridorTrace: { capture: () => void } }
      ).corridorTrace.capture(),
    );
    await page.mouse.down();
    expect(
      await page.evaluate(() =>
        (
          window as typeof window & { corridorTrace: { takeover: () => boolean } }
        ).corridorTrace.takeover(),
      ),
    ).toBe(true);
    await expect(viewport).toHaveAttribute("data-pointer-mode", "pending");
    for (let step = 1; step <= 12; step += 1) {
      await page.mouse.move(x + (delta * box.width * step) / 12, y);
      await sample();
    }
    await page.mouse.up();
    await sample();
  };
  await command(3);
  await swipe(0.5);
  await command(4);
  await advance(81);
  await command(1);
  await swipe(0.25);
  await swipe(-0.75);
  await advance(60);
  await swipe(0.75);
  await expect(dialog).toHaveAttribute("data-active-id", "item-0");
  await expect(dialog).toHaveAttribute("data-settled-id", "item-0");
  await expect(
    page.getByTestId("at-event-trace").locator("li").filter({ hasText: "settled" }),
  ).toHaveCount(0);
  await advance(240);
  await expect(dialog).toHaveAttribute("data-track-state", "idle");
  await expect(
    page.getByTestId("at-event-trace").locator("li").filter({ hasText: "settled" }),
  ).toHaveCount(1);
  const result = await page.evaluate(() => {
    const trace = (
      window as typeof window & {
        corridorTrace: { samples: number; blanks: number; maximum: number };
      }
    ).corridorTrace;
    return { samples: trace.samples, blanks: trace.blanks, maximum: trace.maximum };
  });
  expect(result.samples).toBeGreaterThan(100);
  expect(result.blanks).toBe(0);
  expect(result.maximum).toBeLessThanOrEqual(8);
});

test("window blur resolves a partially dragged takeover exactly once", async ({ page }) => {
  await openLabDemo(page, "gallery-at", "no-preference");
  await page.getByTestId("at-scenario-first-item").click();
  await page.getByTestId("at-open-gallery").click();
  const dialog = page.getByTestId("snap-motion-media-gallery");
  await expect(dialog).toHaveAttribute("data-dialog-state", "open");
  await page.getByTestId("snap-motion-media-gallery-shell").evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished));
  });
  const clockTime = new Date("2026-01-01T00:00:00Z");
  await page.clock.install({ time: clockTime });
  await page.clock.pauseAt(new Date(clockTime.getTime() + 1000));
  const viewport = page.getByTestId("snap-motion-media-gallery-viewport");
  const box = await viewport.boundingBox();
  if (!box) throw new Error("Missing gallery viewport");
  const x = box.x + box.width * 0.65;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - box.width * 0.25, y);
  await page.mouse.up();
  await page.clock.runFor(32);
  await expect(dialog).toHaveAttribute("data-track-state", "settling");
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - box.width * 0.08, y);
  await expect(viewport).toHaveAttribute("data-pointer-mode", "swipe");
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(viewport).toHaveAttribute("data-pointer-mode", "idle");
  await expect(dialog).toHaveAttribute("data-track-state", "settling");
  await page.mouse.up();
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.clock.runFor(600);
  await expect(dialog).toHaveAttribute("data-track-state", "idle");
  await expect(dialog).toHaveAttribute("data-active-id", "wide-timeline");
  await expect(dialog).toHaveAttribute("data-settled-id", "wide-timeline");
  await expect(page.getByTestId("snap-motion-media-gallery-position")).toHaveText("2 / 3");
  expect(
    await page
      .getByTestId("snap-motion-media-gallery-track")
      .evaluate((element) => element.style.getPropertyValue("--_gallery-track-x")),
  ).toBe("0.000px");
  await expect(
    page.getByTestId("at-event-trace").locator("li").filter({ hasText: "settled" }),
  ).toHaveCount(1);
});

for (const pointer of ["mouse", "touch"] as const) {
  for (const age of [32, 144]) {
    test(`${pointer} takes over at ${age}ms, chains three destinations and reverses`, async ({
      page,
      browserName,
    }) => {
      test.skip(
        pointer === "touch" && browserName !== "chromium",
        "Native touch uses Chromium CDP.",
      );
      await openLabDemo(page, "coverflow", "no-preference");
      await page.getByTestId("coverflow-inspect").click();
      const dialog = page.getByTestId("snap-motion-media-gallery");
      await expect(dialog).toHaveAttribute("data-dialog-state", "open");
      await page.getByTestId("snap-motion-media-gallery-shell").evaluate(async (element) => {
        await Promise.all(element.getAnimations().map((animation) => animation.finished));
      });
      await page.keyboard.press("Home");
      await expect(dialog).toHaveAttribute("data-track-state", "idle");
      await expect(dialog).toHaveAttribute("data-settled-id", "templates");
      const clockTime = new Date("2026-01-01T00:00:00Z");
      await page.clock.install({ time: clockTime });
      await page.clock.pauseAt(new Date(clockTime.getTime() + 1000));
      const viewport = page.getByTestId("snap-motion-media-gallery-viewport");
      const box = await viewport.boundingBox();
      if (!box) throw new Error("Missing gallery viewport");
      const x = box.x + box.width * 0.65;
      const y = box.y + box.height / 2;
      const distance = box.width * 0.2;
      const cdp = pointer === "touch" ? await page.context().newCDPSession(page) : undefined;
      const down = async () => {
        if (cdp)
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchStart",
            touchPoints: [{ x, y }],
          });
        else {
          await page.mouse.move(x, y);
          await page.mouse.down();
        }
      };
      const move = async (delta: number) => {
        if (cdp)
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [{ x: x + delta, y }],
          });
        else await page.mouse.move(x + delta, y);
      };
      const up = async () => {
        if (cdp) await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        else await page.mouse.up();
      };
      await down();
      await move(-distance);
      await up();
      for (const [direction, expected] of [
        [-1, "map"],
        [-1, "team"],
        [1, "map"],
      ] as const) {
        await page.clock.runFor(age);
        await expect(dialog).toHaveAttribute("data-track-state", "settling");
        const id = await dialog.getAttribute("data-active-id");
        const item = dialog.locator(`[data-item-id="${id}"] img`).first();
        const before = await item.boundingBox();
        if (!before) throw new Error("Missing incoming image");
        await down();
        await expect(viewport).toHaveAttribute("data-pointer-mode", "pending");
        const after = await item.boundingBox();
        if (!after) throw new Error("Takeover removed the incoming image");
        expect(Math.abs(after.x - before.x)).toBeLessThan(0.1);
        await move(direction * distance);
        const moved = await item.boundingBox();
        if (!moved) throw new Error("Dragging removed the incoming image");
        expect(moved.x - after.x).toBeCloseTo(direction * distance, 0);
        await up();
        await expect(dialog).toHaveAttribute("data-active-id", expected);
      }
      await page.clock.runFor(600);
      await expect(dialog).toHaveAttribute("data-track-state", "idle");
      await expect(dialog).toHaveAttribute("data-settled-id", "map");
      await expect(page.getByTestId("snap-motion-media-gallery-position")).toHaveText("3 / 5");
      await cdp?.detach();
    });
  }
}

test("mixed-aspect images retain their nodes and positions through snap-back takeover and final rebase", async ({
  page,
}) => {
  await openLabDemo(page, "gallery-at", "no-preference");
  await page.getByTestId("at-scenario-first-item").click();
  await page.getByTestId("at-open-gallery").click();
  const dialog = page.getByTestId("snap-motion-media-gallery");
  await expect(dialog).toHaveAttribute("data-dialog-state", "open");
  await page.getByTestId("snap-motion-media-gallery-shell").evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished));
  });
  const result = await dialog.evaluate(async (element) => {
    const viewport = element.querySelector<HTMLElement>(
      '[data-testid="snap-motion-media-gallery-viewport"]',
    )!;
    const rect = viewport.getBoundingClientRect();
    const frame = () =>
      new Promise<void>((resolve) =>
        element.ownerDocument.defaultView!.requestAnimationFrame(() => resolve()),
      );
    let time = performance.now();
    const send = (type: string, delta: number) => {
      const event = new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerType: "mouse",
        pointerId: 77,
        button: 0,
        clientX: rect.left + rect.width / 2 + delta,
        clientY: rect.top + rect.height / 2,
      });
      Object.defineProperty(event, "timeStamp", { value: time });
      viewport.dispatchEvent(event);
    };
    send("pointerdown", 0);
    time += 240;
    send("pointermove", -15);
    send("pointerup", -15);
    await frame();
    const samples: { state: string | null; jump: number; movement: number; same: boolean }[] = [];
    for (const id of ["landscape-overview", "wide-timeline"]) {
      const image = element.querySelector<HTMLImageElement>(`[data-item-id="${id}"] img`)!;
      const before = image.getBoundingClientRect().x;
      const state = element.getAttribute("data-track-state");
      send("pointerdown", 0);
      await Promise.resolve();
      const after = image.getBoundingClientRect().x;
      send("pointermove", -rect.width * 0.25);
      await Promise.resolve();
      const movement = image.getBoundingClientRect().x - after;
      time += 240;
      send("pointerup", -rect.width * 0.25);
      samples.push({ state, jump: after - before, movement, same: image.isConnected });
      await frame();
    }
    return { samples, distance: rect.width * 0.25 };
  });
  for (const sample of result.samples) {
    expect(sample.state).toBe("settling");
    expect(Math.abs(sample.jump)).toBeLessThan(0.1);
    expect(sample.movement).toBeCloseTo(-result.distance, 0);
    expect(sample.same).toBe(true);
  }
  await expect(dialog).toHaveAttribute("data-track-state", "idle");
  await expect(dialog).toHaveAttribute("data-settled-id", "tall-document");
  await expect(page.getByTestId("snap-motion-media-gallery-title")).toHaveText("Tall document");
});
