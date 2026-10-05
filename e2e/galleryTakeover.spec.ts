import { expect, test } from "@playwright/test";

import { openLabDemo } from "./helpers";

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
      await page.clock.install();
      await page.clock.pauseAt(new Date());
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
