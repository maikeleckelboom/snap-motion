import { expect, test } from "@playwright/test";

import { openLabDemo } from "./helpers";

test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

for (const exchange of ["shuffle", "direct"] as const) {
  for (const ending of ["release", "cancel", "capture-loss"] as const) {
    test(`native touch StackedDeck ${exchange} retains transferred capture until ${ending}`, async ({
      page,
    }, testInfo) => {
      await openLabDemo(page, "stacked-deck", "no-preference");
      await page.getByTestId(`stacked-deck-exchange-${exchange}`).click();
      const root = page.getByTestId("stacked-deck-viewport");
      const active = root.locator('[data-snap-motion-item][data-active="true"]');
      const initialId = await active.getAttribute("data-item-id");
      const ids = await root
        .locator("[data-snap-motion-item]")
        .evaluateAll((cards) => cards.map((card) => card.getAttribute("data-item-id")));
      const nextId = ids[(ids.indexOf(initialId) + 1) % ids.length]!;
      const image = active.locator("img").first();
      // The lab opts decorative previews out of hit testing. Consumer card images need not do so.
      await image.evaluate((element) => {
        element.style.pointerEvents = "auto";
      });
      await image.scrollIntoViewIfNeeded();
      const box = await image.boundingBox();
      expect(box).not.toBeNull();
      const start = { x: box!.x + box!.width * 0.75, y: box!.y + box!.height / 2 };
      const trace = await root.evaluateHandle((element) => {
        const entries: {
          type: string;
          pointerId: number;
          target: string;
          targetCaptured: boolean;
          surfaceCaptured: boolean;
          phase: string | null;
          trusted: boolean;
          clientX: number;
        }[] = [];
        for (const type of [
          "pointerdown",
          "gotpointercapture",
          "lostpointercapture",
          "pointermove",
          "pointerup",
          "pointercancel",
        ]) {
          element.addEventListener(
            type,
            (event) => {
              const pointer = event as PointerEvent;
              const target = pointer.target as Element;
              entries.push({
                type,
                pointerId: pointer.pointerId,
                target: target === element ? "surface" : target.tagName.toLowerCase(),
                targetCaptured: target.hasPointerCapture(pointer.pointerId),
                surfaceCaptured: element.hasPointerCapture(pointer.pointerId),
                phase: element.getAttribute("data-phase"),
                trusted: event.isTrusted,
                clientX: pointer.clientX,
              });
            },
            { capture: true },
          );
        }
        return entries;
      });
      const session = await page.context().newCDPSession(page);
      const move = (delta: number) =>
        session.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x: start.x + delta, y: start.y, id: 1 }],
        });
      try {
        await session.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ ...start, id: 1 }],
        });
        expect(await trace.jsonValue()).toContainEqual(
          expect.objectContaining({
            type: "pointerdown",
            target: "img",
            targetCaptured: true,
            surfaceCaptured: false,
          }),
        );
        await move(-30);
        await expect(root).toHaveAttribute("data-phase", "dragging");
        // Processing the next native event delivers the pending child -> surface capture transfer.
        await move(-60);
        await expect
          .poll(async () =>
            (await trace.jsonValue()).some(
              (entry) => entry.type === "lostpointercapture" && entry.target === "img",
            ),
          )
          .toBe(true);
        await expect(root).toHaveAttribute("data-phase", "dragging");
        const transferred = await trace.jsonValue();
        expect(transferred).toContainEqual(
          expect.objectContaining({
            type: "gotpointercapture",
            target: "img",
            targetCaptured: true,
          }),
        );
        expect(transferred).toContainEqual(
          expect.objectContaining({
            type: "lostpointercapture",
            target: "img",
            surfaceCaptured: true,
          }),
        );
        expect(transferred).toContainEqual(
          expect.objectContaining({
            type: "gotpointercapture",
            target: "surface",
            surfaceCaptured: true,
          }),
        );
        for (const delta of [-100, -150, -210]) {
          await move(delta);
          await expect
            .poll(
              async () =>
                (await trace.jsonValue()).filter((entry) => entry.type === "pointermove").at(-1)
                  ?.clientX,
            )
            .toBeCloseTo(start.x + delta, 1);
          await expect(root).toHaveAttribute("data-phase", "dragging");
        }
        if (ending === "capture-loss") {
          const pointerId = (await trace.jsonValue())[0]!.pointerId;
          await root.evaluate((element, id) => element.releasePointerCapture(id), pointerId);
          await move(-220);
          await expect
            .poll(async () =>
              (await trace.jsonValue()).some(
                (entry) =>
                  entry.type === "lostpointercapture" &&
                  entry.target === "surface" &&
                  !entry.surfaceCaptured,
              ),
            )
            .toBe(true);
          await expect(root).not.toHaveAttribute("data-phase", "dragging");
        }
        await session.send("Input.dispatchTouchEvent", {
          type: ending === "cancel" ? "touchCancel" : "touchEnd",
          touchPoints: [],
        });
        await expect(root).toHaveAttribute("data-phase", "idle");
        const settledId = ending === "release" ? nextId : initialId!;
        await expect(root).toHaveAttribute("data-active-id", settledId);
        await expect(root).toHaveAttribute("data-settled-id", settledId);
        const entries = await trace.jsonValue();
        expect(entries.every((entry) => entry.trusted)).toBe(true);
        expect(new Set(entries.map((entry) => entry.pointerId)).size).toBe(1);
        expect(entries.some((entry) => entry.type === "pointercancel")).toBe(ending === "cancel");
        if (ending !== "capture-loss") {
          expect(entries).toContainEqual(
            expect.objectContaining({
              type: ending === "cancel" ? "pointercancel" : "pointerup",
              target: "surface",
              phase: "dragging",
            }),
          );
        }
      } finally {
        await testInfo.attach("native-pointer-lifecycle", {
          body: JSON.stringify(
            {
              events: await trace.jsonValue(),
              result: {
                phase: await root.getAttribute("data-phase"),
                current: await root.getAttribute("data-active-id"),
                settled: await root.getAttribute("data-settled-id"),
              },
            },
            null,
            2,
          ),
          contentType: "application/json",
        });
        await session.detach();
      }
    });
  }
}
