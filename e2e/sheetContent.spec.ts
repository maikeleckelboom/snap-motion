import { expect, test, type Page } from "@playwright/test";

import { dragSyntheticPointerBy, expectSheetOpenAt } from "./helpers";

type Side = "top" | "bottom" | "left" | "right";
type Snap = "full" | "partial" | "content";

const errors = new WeakMap<Page, string[]>();
const dialog = (page: Page) => page.getByTestId("content-sheet");
const body = (page: Page) => dialog(page).locator(".snap-motion-sheet-body");
const panel = (page: Page) => dialog(page).locator(".snap-motion-sheet-panel");
const close = (page: Page) => dialog(page).locator(".snap-motion-sheet-close");
const opener = (page: Page) => page.getByTestId("content-open");

test("top opening starts concealed and fades a viewport scrim independently of panel travel", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: "no-preference", colorScheme: "dark" });
  await fixture(page);
  await page.getByTestId("content-snap").selectOption("partial");
  const trace = await page.evaluate(async () => {
    const target = document.querySelector<HTMLDialogElement>('[data-testid="content-sheet"]')!;
    const surface = target.querySelector<HTMLElement>(".snap-motion-sheet-panel")!;
    const scrim = target.querySelector<HTMLElement>(".snap-motion-sheet-scrim")!;
    const start = performance.now();
    function sample() {
      const rect = scrim.getBoundingClientRect();
      const style = getComputedStyle(scrim);
      return {
        time: performance.now() - start,
        state: target.dataset.sheetState,
        visibility: getComputedStyle(surface).visibility,
        position: new DOMMatrixReadOnly(getComputedStyle(surface).transform).m42,
        opacity: Number(style.opacity),
        color: style.backgroundColor,
        transform: style.transform,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      };
    }
    const original = target.showModal;
    let first: ReturnType<typeof sample> | undefined;
    target.showModal = function () {
      original.call(this);
      first = sample();
    };
    const frames: ReturnType<typeof sample>[] = [];
    document.querySelector<HTMLButtonElement>('[data-testid="content-open"]')!.click();
    await new Promise<void>((resolve) => {
      function frame() {
        frames.push(sample());
        if (target.dataset.sheetState === "open" || performance.now() - start > 5000) resolve();
        else requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
    target.showModal = original;
    return { first, frames };
  });
  expect(trace.first?.visibility).toBe("hidden");
  expect(trace.first?.opacity).toBe(0);
  expect(trace.frames.at(-1)?.state).toBe("open");
  expect(trace.frames.at(-1)?.opacity).toBeCloseTo(0.56, 3);
  expect(trace.frames.some((frame) => frame.opacity > 0 && frame.opacity < 0.56)).toBe(true);
  expect(trace.frames.some((frame) => frame.state === "opening" && frame.opacity >= 0.559)).toBe(
    true,
  );
  for (const frame of trace.frames) {
    expect(frame.rect).toEqual({ x: 0, y: 0, width: 390, height: 844 });
    expect(frame.transform).toBe("none");
    expect(frame.color).toBe("rgb(0, 0, 0)");
  }
  await testInfo.attach("top-sheet-opening.json", {
    body: JSON.stringify(trace, null, 2),
    contentType: "application/json",
  });
  await testInfo.attach("top-sheet-open.png", {
    body: await page.screenshot(),
    contentType: "image/png",
  });
  // Touch/drag geometry must not take over the lifecycle fade after it has completed.
  const start = await grabHandle(page);
  await moveHandle(page, start, -80, 200);
  await expect
    .poll(() =>
      dialog(page)
        .locator(".snap-motion-sheet-scrim")
        .evaluate((element) => Number(getComputedStyle(element).opacity)),
    )
    .toBe(0.56);
  await moveHandle(page, start, -80, 220, "pointercancel");
  await close(page).click();
  await expect(dialog(page).locator(".snap-motion-sheet-scrim")).toHaveCSS(
    "transition-duration",
    "0.18s",
  );
  await expect(dialog(page)).not.toBeVisible();
  await page.emulateMedia({ colorScheme: "light" });
  await openSheet(page, "partial");
  await expect
    .poll(() =>
      dialog(page)
        .locator(".snap-motion-sheet-scrim")
        .evaluate((element) => getComputedStyle(element).backgroundColor),
    )
    .toBe("rgb(0, 0, 0)");
});

test("Sheet scrim obeys live system preference and explicit motion overrides", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await fixture(page);
  await openSheet(page, "partial");
  const scrim = dialog(page).locator(".snap-motion-sheet-scrim");
  await expect(scrim).toHaveCSS("transition-duration", "0s");
  await expect(scrim).toHaveCSS("opacity", "0.56");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(scrim).toHaveCSS("transition-duration", "0.24s");
  await page.getByTestId("content-live-preference").selectOption("reduce");
  await expect(scrim).toHaveCSS("transition-duration", "0s");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByTestId("content-live-preference").selectOption("animate");
  await expect(scrim).toHaveCSS("transition-duration", "0.24s");
  await page.getByTestId("content-live-preference").selectOption("system");
  await expect(scrim).toHaveCSS("transition-duration", "0s");
  await close(page).click();
  await expect(dialog(page)).not.toBeVisible();
  await expect(opener(page)).toBeFocused();
});

test.beforeEach(async ({ page }) => {
  const messages: string[] = [];
  errors.set(page, messages);
  page.on("pageerror", (error) => messages.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" || /hydration|resizeobserver loop/i.test(message.text())) {
      messages.push(message.text());
    }
  });
  await page.setViewportSize({ width: 390, height: 844 });
});

test.afterEach(async ({ page }) => {
  expect(errors.get(page) ?? []).toEqual([]);
});

async function fixture(page: Page, content = "menu", side: Side = "top", checks = true) {
  await page.goto(`./?demo=sheet-content&view=fixtures${checks ? "&checks=1" : ""}`);
  await expect(page.getByTestId("sheet-content-fixture")).toBeVisible();
  await page.getByTestId("hidden-travel").selectOption("responsive");
  await page.getByTestId("content-treatment").selectOption("control");
  await page.getByTestId("content-kind").selectOption(content);
  await page.getByTestId("content-side").selectOption(side);
}

async function openSheet(page: Page, snap: Snap = "full") {
  await page.getByTestId("content-snap").selectOption(snap);
  await opener(page).click();
  await expectSheetOpenAt(dialog(page), snap);
}

async function nativeTabsToLinks(page: Page) {
  // Native selective tabbing can skip plain anchors. Establish this context's browser policy
  // independently so Sheet must preserve the actual native order on Windows and in CI alike.
  const reference = await page.context().newPage();
  try {
    await reference.setContent(
      '<div tabindex="0">Body</div><a href="#next">Next</a><select><option>Language</option></select>',
    );
    await reference.locator("div").focus();
    await reference.keyboard.press("Tab");
    const tag = await reference.evaluate(() => document.activeElement?.tagName);
    expect(["A", "SELECT"]).toContain(tag);
    return tag === "A";
  } finally {
    await reference.close();
  }
}

async function presentation(page: Page) {
  return page.getByTestId("presented-body").evaluate((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const bodyElement = element.closest(".snap-motion-sheet-body")!;
    const panelElement = element.closest(".snap-motion-sheet-panel")!;
    return {
      animations: element.getAnimations().length,
      height: rect.height,
      opacity: style.opacity,
      scrollHeight: bodyElement.scrollHeight,
      scrollTop: bodyElement.scrollTop,
      transform: style.transform,
      width: rect.width,
      willChange: getComputedStyle(panelElement).willChange,
    };
  });
}

async function expectUnchangedPresentation(page: Page) {
  const value = await presentation(page);
  expect(value.opacity).toBe("1");
  expect(value.transform).toBe("none");
  expect(value.animations).toBe(0);
  expect(value.willChange).toBe("auto");
  return value;
}

async function grabHandle(page: Page) {
  return dialog(page)
    .locator(".snap-motion-sheet-drag-region")
    .evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const start = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        time: performance.now(),
      };
      const event = new PointerEvent("pointerdown", {
        bubbles: true,
        button: 0,
        buttons: 1,
        cancelable: true,
        clientX: start.x,
        clientY: start.y,
        isPrimary: true,
        pointerId: 91,
        pointerType: "mouse",
      });
      Object.defineProperty(event, "timeStamp", { value: start.time });
      element.dispatchEvent(event);
      return start;
    });
}

async function moveHandle(
  page: Page,
  start: { x: number; y: number; time: number },
  deltaY: number,
  elapsed: number,
  type: "pointermove" | "pointerup" | "pointercancel" = "pointermove",
) {
  await page.evaluate(
    ({ point, offset, time, eventType }) => {
      const event = new PointerEvent(eventType, {
        bubbles: true,
        button: 0,
        buttons: eventType === "pointermove" ? 1 : 0,
        cancelable: true,
        clientX: point.x,
        clientY: point.y + offset,
        isPrimary: true,
        pointerId: 91,
        pointerType: "mouse",
      });
      Object.defineProperty(event, "timeStamp", { value: point.time + time });
      window.dispatchEvent(event);
    },
    { point: start, offset: deltaY, time: elapsed, eventType: type },
  );
}

async function panelY(page: Page) {
  return panel(page).evaluate(
    (element) => new DOMMatrixReadOnly(getComputedStyle(element).transform).m42,
  );
}

test.describe("Sheet content presentation", () => {
  test("preserves user scroll when reversing a close before native dismissal", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.setViewportSize({ width: 390, height: 520 });
    await fixture(page);
    await openSheet(page);
    await body(page).evaluate((element) => element.scrollTo(0, 50));
    await expect.poll(() => body(page).evaluate((element) => element.scrollTop)).toBe(50);
    await close(page).dispatchEvent("click");
    // Intentional close/reopen interaction interval, not a readiness wait.
    await page.waitForTimeout(65);
    await expect(dialog(page)).toHaveAttribute("data-sheet-state", "closing");
    await page.getByTestId("content-reopen").dispatchEvent("click");
    await expectSheetOpenAt(dialog(page), "full");
    await expect.poll(() => body(page).evaluate((element) => element.scrollTop)).toBe(50);
    await expect(close(page)).toBeFocused();
    await expectUnchangedPresentation(page);
  });

  test("makes the body visibly available to immediate Tab during opening", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const tabsToLinks = await nativeTabsToLinks(page);
    await fixture(page, "menu", "top", false);
    await opener(page).focus();
    await opener(page).dispatchEvent("click");
    await page.keyboard.press("Tab");
    await expect(body(page)).toBeFocused();
    // The focused region must be visible on this keyboard step, not only after eventual settling.
    const focusedBody = await body(page).evaluate((element) => ({
      height: element.clientHeight,
      hidden: element.closest("[inert], [aria-hidden='true']") !== null,
      opacity: getComputedStyle(element).opacity,
    }));
    expect(focusedBody.height).toBeGreaterThan(0);
    expect(focusedBody.hidden).toBe(false);
    expect(focusedBody.opacity).toBe("1");
    await page.keyboard.press("Tab");
    const nextTarget = tabsToLinks
      ? dialog(page).getByRole("link", { name: "Overview", exact: true })
      : dialog(page).getByLabel("Language");
    await expect(nextTarget).toBeFocused();
  });

  test("makes a custom initial body focus target visible before waiting for the entrance", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await fixture(page, "menu", "top", false);
    await page.getByTestId("content-initial-focus").selectOption("body");
    await opener(page).focus();
    await opener(page).dispatchEvent("click");
    const target = dialog(page).getByRole("link", { name: "Overview", exact: true });
    await expect(target).toBeFocused();
    const focusedRegion = await target.evaluate((element) => {
      const scrollport = element.closest(".snap-motion-sheet-body")!;
      const region = scrollport.getBoundingClientRect();
      const rect = element.getBoundingClientRect();
      return {
        height: scrollport.clientHeight,
        fullyVisible: rect.top >= region.top && rect.bottom <= region.bottom,
      };
    });
    expect(focusedRegion.height).toBeGreaterThan(0);
    expect(focusedRegion.fullyVisible).toBe(true);
    await expect(page.getByTestId("presented-body")).toHaveCSS("opacity", "1");
  });

  test("reveals the wrapped target of immediate Shift+Tab on a short viewport", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.setViewportSize({ width: 390, height: 520 });
    await fixture(page, "menu", "top", false);
    await opener(page).focus();
    await opener(page).dispatchEvent("click");
    await page.keyboard.press("Shift+Tab");
    await expect(page.getByTestId("content-add")).toBeFocused();
    await expect(page.getByTestId("content-add")).toBeInViewport({ ratio: 1 });
    await expect(dialog(page)).toHaveAttribute("data-sheet-state", "open");
  });

  for (const side of ["top", "bottom", "left", "right"] as const) {
    test(`${side} keeps content fully presented and measured identically across usable snaps`, async ({
      page,
    }) => {
      await fixture(page, "short", side);
      await openSheet(page);
      const initial = await expectUnchangedPresentation(page);
      for (const snap of ["partial", "content", "full"] as const) {
        await page.getByTestId("content-live-snap").selectOption(snap);
        await expectSheetOpenAt(dialog(page), snap);
        const current = await expectUnchangedPresentation(page);
        expect(current.width).toBeCloseTo(initial.width, 0);
        expect(current.height).toBeCloseTo(initial.height, 0);
        // Native scrollHeight is integral; the rendered intrinsic box can be fractional.
        expect(current.scrollHeight).toBeGreaterThanOrEqual(Math.floor(current.height));
      }
      await page.keyboard.press("Escape");
      await expect(dialog(page)).not.toBeVisible();
      await expect(opener(page)).toBeFocused();
    });
  }

  for (const content of ["form", "prose", "media"] as const) {
    test(`${content} preserves authored content, wrapping, and native overflow on a short viewport`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 390, height: 460 });
      await fixture(page, content);
      await openSheet(page, "partial");
      if (content === "form") {
        await dialog(page).getByRole("textbox", { name: "Your name" }).fill("Retained input");
      }
      const initial = await expectUnchangedPresentation(page);
      await body(page).evaluate((element) => element.scrollTo(0, element.scrollHeight));
      await expect
        .poll(() => body(page).evaluate((element) => element.scrollTop))
        .toBeGreaterThan(0);
      await expectUnchangedPresentation(page);
      await page.getByTestId("content-live-snap").selectOption("full");
      await expectSheetOpenAt(dialog(page), "full");
      const current = await expectUnchangedPresentation(page);
      expect(current.width).toBeCloseTo(initial.width, 0);
      expect(current.height).toBeCloseTo(initial.height, 0);
      if (content === "form") {
        await expect(dialog(page).getByRole("textbox", { name: "Your name" })).toHaveValue(
          "Retained input",
        );
      } else if (content === "media") {
        await expect(dialog(page).getByRole("img", { name: "Architectural study" })).toBeVisible();
      }
      await close(page).click();
      await expect(dialog(page)).not.toBeVisible();
    });
  }

  test("keeps immediate Escape, Tab, Shift+Tab, and early navigation in the local modal lifecycle", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const tabsToLinks = await nativeTabsToLinks(page);
    await fixture(page, "menu", "top", false);
    const initialUrl = page.url();
    await opener(page).focus();
    await opener(page).dispatchEvent("click");
    await expect(close(page)).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog(page)).not.toBeVisible();
    await expect(opener(page)).toBeFocused();

    await opener(page).dispatchEvent("click");
    await expect(close(page)).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(body(page)).toBeFocused();
    await page.keyboard.press("Tab");
    const nextTarget = tabsToLinks
      ? dialog(page).getByRole("link", { name: "Overview", exact: true })
      : dialog(page).getByLabel("Language");
    await expect(nextTarget).toBeFocused();
    await expect(page.getByTestId("presented-body")).toHaveCSS("opacity", "1");
    await page.keyboard.press("Shift+Tab");
    await expect(body(page)).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(close(page)).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect
      .poll(() => dialog(page).evaluate((element) => element.contains(document.activeElement)))
      .toBe(true);
    await dialog(page).getByRole("link", { name: "Projects", exact: true }).dispatchEvent("click");
    await expect(dialog(page)).not.toBeVisible();
    await expect(page.getByRole("heading", { name: "Projects", exact: true })).toBeVisible();
    await expect(opener(page)).toBeFocused();
    expect(page.url()).toBe(initialUrl);
  });

  test("reopens an active close continuously and ignores obsolete completion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await fixture(page);
    await opener(page).focus();
    await opener(page).dispatchEvent("click");
    await expect(dialog(page)).toHaveAttribute("data-sheet-state", "opening");
    await close(page).dispatchEvent("click");
    await expect(dialog(page)).toHaveAttribute("data-sheet-state", "closing");
    const before = await panel(page).evaluate((element) => {
      const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
      return matrix.m42;
    });
    await page.getByTestId("content-reopen").dispatchEvent("click");
    await expect(dialog(page)).toHaveAttribute("open", "");
    const after = await panel(page).evaluate((element) => {
      const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
      return matrix.m42;
    });
    // Browser commands span frames; a full-surface teleport is distinguishable from spring travel.
    expect(Math.abs(after - before)).toBeLessThan(160);
    await expectSheetOpenAt(dialog(page), "full");
    await expectUnchangedPresentation(page);
    await expect(close(page)).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog(page)).not.toBeVisible();
    await expect(opener(page)).toBeFocused();
  });

  for (const system of ["reduce", "no-preference"] as const) {
    test(`honors an omitted override under ${system}, explicit overrides, and live system changes`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: system });
      await fixture(page);
      await openSheet(page);
      await expect(dialog(page)).toHaveAttribute(
        "data-reduced-motion",
        String(system === "reduce"),
      );
      await page.getByTestId("content-live-preference").selectOption("reduce");
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await expect(dialog(page)).toHaveAttribute("data-reduced-motion", "true");
      await page.getByTestId("content-live-preference").selectOption("animate");
      await page.emulateMedia({ reducedMotion: "reduce" });
      await expect(dialog(page)).toHaveAttribute("data-reduced-motion", "false");
      await page.getByTestId("content-live-preference").selectOption("system");
      await expect(dialog(page)).toHaveAttribute("data-reduced-motion", "true");
      await expectUnchangedPresentation(page);
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await expect(dialog(page)).toHaveAttribute("data-reduced-motion", "false");
      await close(page).dispatchEvent("click");
      await expect(dialog(page)).toHaveAttribute("data-sheet-state", "closing");
      await page.emulateMedia({ reducedMotion: "reduce" });
      await expect(dialog(page)).not.toBeVisible();
      await expect(opener(page)).toBeFocused();
    });
  }

  test("reconciles resize, side changes, dynamic content, and zoom without replacing form state", async ({
    page,
  }) => {
    await fixture(page, "form");
    await openSheet(page);
    const input = dialog(page).getByRole("textbox", { name: "Your name" });
    await input.fill("Persistent state");
    const height = (await presentation(page)).height;
    await page.getByTestId("content-add").click();
    await expect(dialog(page)).toContainText("Note 4");
    expect((await presentation(page)).height).toBeGreaterThan(height);
    await expectUnchangedPresentation(page);
    await page.setViewportSize({ width: 430, height: 460 });
    for (const side of ["right", "left", "bottom", "top"] as const) {
      await page.getByTestId("content-live-side").selectOption(side);
      await expect(dialog(page)).toHaveAttribute("data-sheet-side", side);
      await expectSheetOpenAt(dialog(page), "full");
      await expect(input).toHaveValue("Persistent state");
      await expectUnchangedPresentation(page);
    }
    // Existing package zoom coverage uses CSS zoom: this is layout zoom, not device certification.
    await page.locator("html").evaluate((element) => (element.style.zoom = "1.25"));
    await page.setViewportSize({ width: 420, height: 480 });
    await expect(input).toHaveValue("Persistent state");
    await expectUnchangedPresentation(page);
    await page.keyboard.press("Escape");
    await expect(dialog(page)).not.toBeVisible();
  });

  test("keeps drag cancellation responsive, and dismisses through the handle", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await fixture(page);
    await openSheet(page);
    const handle = dialog(page).locator(".snap-motion-sheet-drag-region");
    await dragSyntheticPointerBy(page, handle, 0, -100, {
      steps: 4,
      stepDelay: 0,
      eventIntervalMs: 50,
      beforeRelease: async () => {
        await expect(dialog(page)).toHaveAttribute("data-sheet-state", "dragging");
        await expect(page.getByTestId("presented-body")).toHaveCSS("opacity", "1");
        await page.evaluate(() =>
          window.dispatchEvent(new PointerEvent("pointercancel", { pointerId: 83, bubbles: true })),
        );
      },
    });
    await expectSheetOpenAt(dialog(page), "full");
    await expectUnchangedPresentation(page);
    await dragSyntheticPointerBy(page, handle, 0, -720, {
      steps: 8,
      stepDelay: 0,
      eventIntervalMs: 20,
    });
    await expect(dialog(page)).not.toBeVisible();
    await expect(opener(page)).toBeFocused();
  });

  test("allows direct drag takeover during opening and continuous reversal before release", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await fixture(page);
    await opener(page).focus();
    await opener(page).dispatchEvent("click");
    await expect(dialog(page)).toHaveAttribute("data-sheet-state", "opening");
    const openingGrab = await grabHandle(page);
    await expect(dialog(page)).toHaveAttribute("data-sheet-state", "dragging");
    const origin = await panelY(page);
    await moveHandle(page, openingGrab, 80, 100);
    expect(await panelY(page)).toBeCloseTo(origin + 80, 0);
    await moveHandle(page, openingGrab, 25, 200);
    expect(await panelY(page)).toBeCloseTo(origin + 25, 0);
    await expect(page.getByTestId("presented-body")).toHaveCSS("opacity", "1");
    await moveHandle(page, openingGrab, 25, 220, "pointercancel");
    await expectSheetOpenAt(dialog(page), "full");

    const restingGrab = await grabHandle(page);
    const rest = await panelY(page);
    await moveHandle(page, restingGrab, -220, 200);
    expect(await panelY(page)).toBeCloseTo(rest - 220, 0);
    await moveHandle(page, restingGrab, -80, 400);
    expect(await panelY(page)).toBeCloseTo(rest - 80, 0);
    await moveHandle(page, restingGrab, 0, 600);
    expect(await panelY(page)).toBeCloseTo(rest, 0);
    await moveHandle(page, restingGrab, 0, 650, "pointerup");
    await expectSheetOpenAt(dialog(page), "full");
    await expectUnchangedPresentation(page);
  });
});
