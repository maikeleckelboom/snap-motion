import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

import { dragSyntheticPointerBy, openLabDemo } from "./helpers";

interface RuntimeErrors {
  readonly console: string[];
  readonly page: string[];
}

interface GeometryRect {
  readonly bottom: number;
  readonly height: number;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly width: number;
}

interface GalleryGeometry {
  readonly documentOverflow: number;
  readonly footer: GeometryRect;
  readonly header: GeometryRect;
  readonly items: Record<
    string,
    {
      readonly fittedContent: GeometryRect;
      readonly media: GeometryRect;
      readonly slot: GeometryRect;
    }
  >;
  readonly modal: GeometryRect;
  readonly viewport: GeometryRect;
  readonly viewportStyles: {
    readonly aspectRatio: string;
    readonly contain: string;
    readonly display: string;
    readonly height: string;
    readonly maxHeight: string;
    readonly minHeight: string;
    readonly overflow: string;
    readonly position: string;
  };
  readonly workspace: GeometryRect;
}

const runtimeErrors = new WeakMap<Page, RuntimeErrors>();

function harness(page: Page) {
  return page.getByTestId("media-gallery-at-harness");
}

function gallery(page: Page) {
  return page.getByTestId("snap-motion-media-gallery");
}

function trace(page: Page) {
  return page.getByTestId("at-event-trace");
}

async function traceEvents(page: Page) {
  return trace(page)
    .locator("code")
    .allTextContents()
    .then((events) => events.join(","));
}

async function selectScenario(page: Page, id: string) {
  await page.getByTestId(`at-scenario-${id}`).check();
}

async function openScenario(page: Page, id: string) {
  await selectScenario(page, id);
  await page.getByTestId("at-open-gallery").click();
  await expect(gallery(page)).toBeVisible();
}

async function closeGallery(page: Page) {
  await page.getByTestId("snap-motion-media-gallery-close").click();
  await expect(gallery(page)).not.toBeVisible();
}

async function holdButtonTransitionAtMidpoint(page: Page, direction: "next" | "previous") {
  const control = page.getByTestId(`snap-motion-media-gallery-${direction}`);
  const track = page.getByTestId("snap-motion-media-gallery-track");
  await control.click();
  await expect(gallery(page)).toHaveAttribute("data-track-state", "settling");
  await track.evaluate(async () => {
    await new Promise<void>((finishPaint) =>
      requestAnimationFrame(() => requestAnimationFrame(() => finishPaint())),
    );
  });
}

async function completeHeldButtonTransition(page: Page) {
  await page.getByTestId("snap-motion-media-gallery-track").evaluate((element) => {
    element.dispatchEvent(
      new TransitionEvent("transitionend", { bubbles: true, propertyName: "transform" }),
    );
  });
  await expect(gallery(page)).toHaveAttribute("data-track-state", "idle");
}

async function captureGalleryGeometry(page: Page, itemIds: readonly string[]) {
  return gallery(page).evaluate((dialog, ids): GalleryGeometry => {
    const required = <ElementType extends Element>(selector: string) => {
      const element = dialog.querySelector<ElementType>(selector);
      if (!element) throw new Error(`Missing gallery geometry element: ${selector}`);
      return element;
    };
    // oxlint-disable-next-line unicorn/consistent-function-scoping -- This helper must execute in the browser evaluation scope.
    const rect = (element: Element): GeometryRect => {
      const bounds = element.getBoundingClientRect();
      return {
        bottom: bounds.bottom,
        height: bounds.height,
        left: bounds.left,
        right: bounds.right,
        top: bounds.top,
        width: bounds.width,
      };
    };
    // oxlint-disable-next-line unicorn/consistent-function-scoping -- This helper must execute in the browser evaluation scope.
    const fittedContentRect = (media: HTMLImageElement): GeometryRect => {
      const bounds = media.getBoundingClientRect();
      const intrinsicWidth = Number(media.getAttribute("width"));
      const intrinsicHeight = Number(media.getAttribute("height"));
      const intrinsicRatio = intrinsicWidth / intrinsicHeight;
      const boxRatio = bounds.width / bounds.height;
      const width = intrinsicRatio > boxRatio ? bounds.width : bounds.height * intrinsicRatio;
      const height = intrinsicRatio > boxRatio ? bounds.width / intrinsicRatio : bounds.height;
      const left = bounds.left + (bounds.width - width) / 2;
      const top = bounds.top + (bounds.height - height) / 2;
      return { bottom: top + height, height, left, right: left + width, top, width };
    };

    const viewport = required<HTMLElement>(".snap-motion-media-gallery-viewport");
    const viewportStyle = getComputedStyle(viewport);
    const items = Object.fromEntries(
      ids.map((id) => {
        const slot = required<HTMLElement>(
          `.snap-motion-media-gallery-slot[data-item-id="${CSS.escape(id)}"]`,
        );
        const media = required<HTMLImageElement>(
          `.snap-motion-media-gallery-slot[data-item-id="${CSS.escape(id)}"] img`,
        );
        return [
          id,
          { fittedContent: fittedContentRect(media), media: rect(media), slot: rect(slot) },
        ];
      }),
    );

    return {
      documentOverflow: document.documentElement.scrollWidth - window.innerWidth,
      footer: rect(required(".snap-motion-media-gallery-footer")),
      header: rect(required(".snap-motion-media-gallery-header")),
      items,
      modal: rect(dialog),
      viewport: rect(viewport),
      viewportStyles: {
        aspectRatio: viewportStyle.aspectRatio,
        contain: viewportStyle.contain,
        display: viewportStyle.display,
        height: viewportStyle.height,
        maxHeight: viewportStyle.maxHeight,
        minHeight: viewportStyle.minHeight,
        overflow: viewportStyle.overflow,
        position: viewportStyle.position,
      },
      workspace: rect(required(".snap-motion-media-gallery-workspace")),
    };
  }, itemIds);
}

function expectRectStable(actual: GeometryRect, expected: GeometryRect) {
  for (const axis of ["height", "left", "top", "width"] as const) {
    expect(Math.abs(actual[axis] - expected[axis]), `${axis} changed`).toBeLessThanOrEqual(2);
  }
}

function expectSizeStable(actual: GeometryRect, expected: GeometryRect) {
  for (const axis of ["height", "width"] as const) {
    expect(Math.abs(actual[axis] - expected[axis]), `${axis} changed`).toBeLessThanOrEqual(2);
  }
}

function expectContained(inner: GeometryRect, outer: GeometryRect) {
  expect(inner.left).toBeGreaterThanOrEqual(outer.left - 1);
  expect(inner.top).toBeGreaterThanOrEqual(outer.top - 1);
  expect(inner.right).toBeLessThanOrEqual(outer.right + 1);
  expect(inner.bottom).toBeLessThanOrEqual(outer.bottom + 1);
}

async function expectNoHarnessViolations(page: Page) {
  const axe = await new AxeBuilder({ page })
    .include('[data-testid="media-gallery-at-harness"]')
    .analyze();
  expect(axe.violations.map((violation) => violation.id)).toEqual([]);
}

async function cancelPointerGesture(page: Page, target: Locator) {
  await expect(target).toBeVisible();
  const center = await target.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  });

  await target.evaluate((element, point) => {
    element.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        button: 0,
        buttons: 1,
        cancelable: true,
        clientX: point.x,
        clientY: point.y,
        isPrimary: true,
        pointerId: 91,
        pointerType: "touch",
      }),
    );
  }, center);
  await page.evaluate((point) => {
    window.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        button: 0,
        buttons: 1,
        cancelable: true,
        clientX: point.x - 120,
        clientY: point.y,
        isPrimary: true,
        pointerId: 91,
        pointerType: "touch",
      }),
    );
    window.dispatchEvent(
      new PointerEvent("pointercancel", {
        bubbles: true,
        button: 0,
        buttons: 0,
        cancelable: true,
        clientX: point.x - 120,
        clientY: point.y,
        isPrimary: true,
        pointerId: 91,
        pointerType: "touch",
      }),
    );
  }, center);
}

test.beforeEach(async ({ page }, testInfo) => {
  const errors: RuntimeErrors = { console: [], page: [] };
  runtimeErrors.set(page, errors);
  page.on("console", (message) => {
    if (message.type() === "error") errors.console.push(message.text());
  });
  page.on("pageerror", (error) => errors.page.push(error.message));
  if (testInfo.title.includes("mixed-aspect navigation")) {
    await page.addInitScript(() => {
      const nativeSetTimeout = window.setTimeout;
      window.setTimeout = ((handler: TimerHandler, timeout?: number, ...arguments_: unknown[]) => {
        if (timeout === 240) return 2_147_483_647;
        return nativeSetTimeout(handler, timeout, ...arguments_);
      }) as typeof window.setTimeout;
    });
  }
  await openLabDemo(page, "gallery-at", "reduce");
});

test.afterEach(async ({ page }) => {
  expect(runtimeErrors.get(page)).toEqual({ console: [], page: [] });
});

test("the dedicated surface exposes the complete stable matrix and a genuinely non-live trace", async ({
  page,
}) => {
  await expect(harness(page)).toContainText(
    "Prepared for manual assistive-technology certification",
  );
  await expect(
    harness(page).getByRole("heading", { name: "Media gallery AT certification harness" }),
  ).toBeVisible();
  await expect(harness(page).getByRole("radio")).toHaveCount(10);

  for (const id of [
    "baseline",
    "first-item",
    "final-item",
    "single-item",
    "preview-only",
    "delayed-full",
    "retry-success",
    "full-failure",
    "preview-failure",
    "long-localized",
  ]) {
    await expect(page.getByTestId(`at-scenario-${id}`)).toBeVisible();
  }

  await expect(page.getByTestId("at-scenario-baseline")).toBeChecked();
  const contract = page.getByTestId("at-scenario-contract");
  await expect(contract).toContainText("Expected current item");
  await expect(contract).toContainText("Wide timeline (item 2)");
  await expect(contract).toContainText("Expected item count");
  await expect(contract).toContainText("Full media exists");
  await expect(contract).toContainText("Loading expected");
  await expect(contract).toContainText("Failure expected");
  await expect(contract).toContainText("Retry expectation");

  const eventTrace = trace(page);
  await expect(eventTrace).toHaveAttribute("aria-live", "off");
  expect(
    await eventTrace.evaluate((element) => ({
      liveDescendants: element.querySelectorAll(
        '[aria-live]:not([aria-live="off"]), [role="alert"], [role="log"], [role="status"]',
      ).length,
      role: element.getAttribute("role"),
    })),
  ).toEqual({ liveDescendants: 0, role: null });
  await expect(eventTrace).toContainText("No events recorded.");
  await expectNoHarnessViolations(page);
});

test("scenario controls preserve focus, never auto-open, and clear only the trace", async ({
  page,
}) => {
  const scenario = page.getByTestId("at-scenario-first-item");
  await scenario.focus();
  await page.keyboard.press("Space");
  await expect(scenario).toBeChecked();
  await expect(scenario).toBeFocused();
  await expect(gallery(page)).not.toBeVisible();
  await expect(trace(page)).toContainText("scenario-selected");
  await expect(page.getByTestId("at-scenario-contract")).toContainText(
    "Landscape overview (item 1)",
  );

  const clear = page.getByTestId("at-clear-trace");
  await clear.click();
  await expect(trace(page)).toContainText("No events recorded.");
  await expect(scenario).toBeChecked();
  await expect(gallery(page)).not.toBeVisible();
});

test("baseline event order ends with a bounded focus-restoration trace entry", async ({ page }) => {
  const opener = page.getByTestId("at-open-gallery");
  await opener.click();

  const dialog = gallery(page);
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAccessibleName("Media gallery certification");
  await expect(page.getByTestId("snap-motion-media-gallery-close")).toBeFocused();
  await expect(page.getByTestId("snap-motion-media-gallery-position")).toHaveText("2 / 3");

  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("snap-motion-media-gallery-position")).toHaveText("3 / 3");
  await expect(page.getByTestId("snap-motion-media-gallery-status")).toHaveText(
    "Tall document, 3 of 3",
  );
  await page.keyboard.press("Escape");

  await expect(dialog).not.toBeVisible();
  await expect(opener).toBeFocused();
  await expect
    .poll(() => traceEvents(page))
    .toBe(
      "open-requested,opened,update:activeId,activeIdRequest,settled,update:open,openRequest,closed,focus-restored",
    );
  await expect(trace(page).locator("li").last()).toContainText("at-open-gallery");
  await expect(trace(page)).toContainText("reason keyboard");
  await expect(trace(page)).toContainText("reason escape");
});

test("mixed-aspect navigation preserves usable geometry through both transition directions", async ({
  browserName,
  page,
}) => {
  await page.setViewportSize({ width: 2_560, height: 1_312 });
  await page.addStyleTag({
    content:
      ".snap-motion-media-gallery-track.transitioning { transition-delay: -5s !important; transition-duration: 10s !important; }",
  });
  await page.getByTestId("reduced-motion-mode").selectOption("no-preference");
  await page.getByTestId("at-open-gallery").click();
  await expect(gallery(page)).toHaveAttribute("data-image-state", "loaded");
  await expect(gallery(page)).toHaveAttribute("data-dialog-state", "open");
  await page.getByTestId("snap-motion-media-gallery-shell").evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished));
  });

  const wideSettled = await captureGalleryGeometry(page, ["wide-timeline"]);
  expect(wideSettled.viewportStyles).toMatchObject({
    contain: "layout paint",
    display: "block",
    overflow: "hidden",
    position: "relative",
  });
  expect(wideSettled.viewport.width / wideSettled.viewport.height).toBeCloseTo(1.6, 2);
  expectContained(wideSettled.items["wide-timeline"]!.fittedContent, wideSettled.viewport);
  expectContained(wideSettled.viewport, wideSettled.workspace);
  expectContained(wideSettled.workspace, wideSettled.modal);

  await holdButtonTransitionAtMidpoint(page, "next");
  const wideToTall = await captureGalleryGeometry(page, ["wide-timeline", "tall-document"]);
  if (browserName === "chromium") {
    const artifactDirectory = resolve(".artifacts/media-gallery-at-certification");
    await mkdir(artifactDirectory, { recursive: true });
    await page.screenshot({
      path: resolve(artifactDirectory, "07-wide-to-tall-button-mid-transition.png"),
    });
  }
  expectRectStable(wideToTall.viewport, wideSettled.viewport);
  expectRectStable(wideToTall.header, wideSettled.header);
  expectRectStable(wideToTall.footer, wideSettled.footer);
  expect(
    Math.abs(wideToTall.items["tall-document"]!.slot.height - wideToTall.viewport.height),
  ).toBeLessThanOrEqual(2);
  expect(wideToTall.items["tall-document"]!.fittedContent.height).toBeGreaterThanOrEqual(
    wideToTall.viewport.height * 0.95,
  );
  expect(wideToTall.items["tall-document"]!.fittedContent.width).toBeGreaterThanOrEqual(
    wideToTall.viewport.width * 0.06,
  );
  expectContained(
    wideToTall.items["tall-document"]!.fittedContent,
    wideToTall.items["tall-document"]!.slot,
  );
  expectContained(wideToTall.viewport, wideToTall.modal);
  expect(wideToTall.documentOverflow).toBe(0);
  await completeHeldButtonTransition(page);
  await expect(page.getByTestId("snap-motion-media-gallery-position")).toHaveText("3 / 3");
  const tallSettled = await captureGalleryGeometry(page, ["tall-document"]);
  expectRectStable(tallSettled.viewport, wideSettled.viewport);
  expectRectStable(tallSettled.header, wideSettled.header);
  expectRectStable(tallSettled.footer, wideSettled.footer);
  expect(tallSettled.items["tall-document"]!.fittedContent.height).toBeGreaterThanOrEqual(
    tallSettled.viewport.height * 0.95,
  );
  expectContained(tallSettled.items["tall-document"]!.fittedContent, tallSettled.viewport);
  expectContained(tallSettled.viewport, tallSettled.modal);
  expect(tallSettled.documentOverflow).toBe(0);

  await holdButtonTransitionAtMidpoint(page, "previous");
  const tallToWide = await captureGalleryGeometry(page, ["tall-document", "wide-timeline"]);
  expectRectStable(tallToWide.viewport, tallSettled.viewport);
  expectSizeStable(
    tallToWide.items["tall-document"]!.fittedContent,
    tallSettled.items["tall-document"]!.fittedContent,
  );
  expect(tallToWide.items["wide-timeline"]!.fittedContent.width).toBeGreaterThanOrEqual(
    tallToWide.viewport.width * 0.95,
  );
  expectContained(
    tallToWide.items["wide-timeline"]!.fittedContent,
    tallToWide.items["wide-timeline"]!.slot,
  );
  expectRectStable(tallToWide.header, tallSettled.header);
  expectRectStable(tallToWide.footer, tallSettled.footer);
  expectContained(tallToWide.viewport, tallToWide.modal);
  expect(tallToWide.documentOverflow).toBe(0);

  await completeHeldButtonTransition(page);
  await expect(page.getByTestId("snap-motion-media-gallery-position")).toHaveText("2 / 3");
  const wideResettled = await captureGalleryGeometry(page, ["wide-timeline"]);
  expectRectStable(wideResettled.viewport, wideSettled.viewport);
  expectRectStable(wideResettled.header, wideSettled.header);
  expectRectStable(wideResettled.footer, wideSettled.footer);
  expectSizeStable(
    wideResettled.items["wide-timeline"]!.fittedContent,
    wideSettled.items["wide-timeline"]!.fittedContent,
  );
  expectContained(wideResettled.viewport, wideResettled.modal);
  expect(wideResettled.documentOverflow).toBe(0);
});

test("named first, final, and single-item boundaries start at their exact states", async ({
  page,
}) => {
  await openScenario(page, "first-item");
  await expect(page.getByTestId("snap-motion-media-gallery-position")).toHaveText("1 / 3");
  await expect(page.getByTestId("snap-motion-media-gallery-previous")).toBeDisabled();
  await expect(page.getByTestId("snap-motion-media-gallery-next")).toBeEnabled();
  await closeGallery(page);

  await openScenario(page, "final-item");
  await expect(page.getByTestId("snap-motion-media-gallery-position")).toHaveText("3 / 3");
  await expect(page.getByTestId("snap-motion-media-gallery-previous")).toBeEnabled();
  await expect(page.getByTestId("snap-motion-media-gallery-next")).toBeDisabled();
  await closeGallery(page);

  await openScenario(page, "single-item");
  await expect(page.getByTestId("snap-motion-media-gallery-position")).toHaveText("1 / 1");
  await expect(page.getByTestId("snap-motion-media-gallery-previous")).toBeDisabled();
  await expect(page.getByTestId("snap-motion-media-gallery-next")).toBeDisabled();
  await expect(gallery(page).getByRole("img")).toHaveCount(1);
  await expectNoHarnessViolations(page);
});

test("preview-only, delayed full, retry success, and terminal failures are deterministic", async ({
  page,
}) => {
  await openScenario(page, "preview-only");
  await expect(gallery(page)).toHaveAttribute("data-image-state", "preview");
  await expect(page.getByTestId("snap-motion-media-gallery-loading")).toHaveCount(0);
  await expect(gallery(page).getByRole("button", { name: "Retry" })).toHaveCount(0);
  await closeGallery(page);

  await openScenario(page, "delayed-full");
  await expect(gallery(page)).toHaveAttribute("data-image-state", "pending");
  await expect(page.getByTestId("snap-motion-media-gallery-loading")).toHaveText(
    "Loading full image…",
  );
  await expect(gallery(page)).toHaveAttribute("data-image-state", "loaded", { timeout: 4_000 });
  await closeGallery(page);

  await openScenario(page, "retry-success");
  await expect(gallery(page)).toHaveAttribute("data-image-state", "failed");
  await gallery(page).getByRole("button", { name: "Retry" }).click();
  await expect(gallery(page)).toHaveAttribute("data-image-state", "loaded");
  await expect(gallery(page).getByRole("button", { name: "Retry" })).toHaveCount(0);
  await closeGallery(page);

  await openScenario(page, "full-failure");
  await expect(gallery(page)).toHaveAttribute("data-image-state", "failed");
  await expect(page.getByTestId("snap-motion-media-gallery-error")).toContainText(
    "Full image unavailable. Showing the preview.",
  );
  await gallery(page).getByRole("button", { name: "Retry" }).click();
  await expect(gallery(page)).toHaveAttribute("data-image-state", "failed");
  await closeGallery(page);

  await openScenario(page, "preview-failure");
  await expect(page.getByTestId("snap-motion-media-gallery-preview-error")).toHaveText(
    "Preview unavailable.",
  );
  await expect(gallery(page).getByRole("button", { name: "Retry" })).toHaveCount(0);
  await expectNoHarnessViolations(page);
});

test("cancelled swipe emits no semantic change and close cancels pending settlement", async ({
  page,
}) => {
  await page.getByTestId("at-open-gallery").click();
  const viewport = page.getByTestId("snap-motion-media-gallery-viewport");
  await cancelPointerGesture(page, viewport);
  await expect(page.getByTestId("snap-motion-media-gallery-position")).toHaveText("2 / 3");
  expect((await traceEvents(page)).split(",")).not.toContain("activeIdRequest");
  await closeGallery(page);

  await page.getByTestId("reduced-motion-mode").selectOption("no-preference");
  await page.getByTestId("at-open-gallery").click();
  await expect(gallery(page)).toHaveAttribute("data-reduced-motion", "false");
  await gallery(page).evaluate((dialog) => {
    const next = dialog.querySelector<HTMLButtonElement>(
      '[data-testid="snap-motion-media-gallery-next"]',
    );
    const close = dialog.querySelector<HTMLButtonElement>(
      '[data-testid="snap-motion-media-gallery-close"]',
    );
    next?.click();
    close?.click();
  });
  await expect(gallery(page)).not.toBeVisible();
  await expect.poll(() => traceEvents(page)).toContain("focus-restored");
  expect((await traceEvents(page)).split(",")).toContain("activeIdRequest");
  expect((await traceEvents(page)).split(",")).not.toContain("settled");
  await expect(trace(page)).toContainText("closed");
  await expect(trace(page)).toContainText("final id");
});

test("long localized content reflows at 320 CSS pixels and 200%-equivalent geometry", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await openScenario(page, "long-localized");
  await expect(gallery(page)).toHaveAttribute("data-image-state", "loaded");
  await expect(
    gallery(page).getByRole("button", {
      name: "Mediagalerij sluiten en terugkeren naar de scenario-opener",
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => ({
      bodyOverflow: document.body.scrollWidth - window.innerWidth,
      documentOverflow: document.documentElement.scrollWidth - window.innerWidth,
    })),
  ).toEqual({ bodyOverflow: 0, documentOverflow: 0 });
  await expectNoHarnessViolations(page);
  await closeGallery(page);

  await page.setViewportSize({ width: 720, height: 480 });
  await page.getByTestId("at-open-gallery").click();
  const bounds = await gallery(page).evaluate((element) => {
    const box = element.getBoundingClientRect();
    return {
      bottom: box.bottom,
      left: box.left,
      right: box.right,
      top: box.top,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
    };
  });
  expect(bounds.left).toBeGreaterThanOrEqual(0);
  expect(bounds.top).toBeGreaterThanOrEqual(0);
  expect(bounds.right).toBeLessThanOrEqual(bounds.viewportWidth);
  expect(bounds.bottom).toBeLessThanOrEqual(bounds.viewportHeight);
  await expectNoHarnessViolations(page);
});

test("full, reduced, and system motion selections remain visibly distinct", async ({ page }) => {
  const motion = page.getByTestId("reduced-motion-mode");
  const contract = page.getByTestId("at-scenario-contract");

  await expect(contract).toContainText("Reduced");
  await page.getByTestId("at-open-gallery").click();
  await expect(gallery(page)).toHaveAttribute("data-reduced-motion", "true");
  await closeGallery(page);

  await motion.selectOption("no-preference");
  await expect(contract).toContainText("Full");
  await page.getByTestId("at-open-gallery").click();
  await expect(gallery(page)).toHaveAttribute("data-reduced-motion", "false");
  await closeGallery(page);

  await motion.selectOption("system");
  await expect(contract).toContainText("System preference");
});

test("the complete harness remains usable under forced-colors emulation", async ({
  browserName,
  page,
}) => {
  test.skip(browserName !== "chromium", "Forced-colors emulation is available in Chromium.");
  await page.emulateMedia({ forcedColors: "active" });
  await selectScenario(page, "long-localized");
  await expect(page.getByTestId("at-scenario-long-localized")).toBeFocused();
  await page.getByTestId("at-open-gallery").click();
  await expect(page.getByTestId("snap-motion-media-gallery-close")).toBeFocused();
  await expectNoHarnessViolations(page);
});

test("a sub-threshold completed swipe does not add a semantic change", async ({ page }) => {
  await page.getByTestId("at-open-gallery").click();
  await dragSyntheticPointerBy(
    page,
    page.getByTestId("snap-motion-media-gallery-viewport"),
    -24,
    0,
    { eventIntervalMs: 20, stepDelay: 0 },
  );
  await expect(page.getByTestId("snap-motion-media-gallery-position")).toHaveText("2 / 3");
  expect((await traceEvents(page)).split(",")).not.toContain("activeIdRequest");
});

test("captures the canonical visual evidence set", async ({ browserName, page }) => {
  test.skip(browserName !== "chromium", "One canonical Chromium evidence set is sufficient.");
  const artifactDirectory = resolve(".artifacts/media-gallery-at-certification");
  await mkdir(artifactDirectory, { recursive: true });

  await page.setViewportSize({ width: 1_440, height: 1_000 });
  await page.screenshot({
    fullPage: true,
    path: resolve(artifactDirectory, "01-harness-setup.png"),
  });

  await page.getByTestId("at-open-gallery").click();
  await expect(gallery(page)).toBeVisible();
  await page.screenshot({
    path: resolve(artifactDirectory, "02-standard-open.png"),
  });
  await closeGallery(page);

  await openScenario(page, "single-item");
  await page.screenshot({
    path: resolve(artifactDirectory, "03-one-item-state.png"),
  });
  await closeGallery(page);

  await openScenario(page, "full-failure");
  await expect(gallery(page)).toHaveAttribute("data-image-state", "failed");
  await page.screenshot({
    path: resolve(artifactDirectory, "04-failure-state.png"),
  });
  await closeGallery(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await selectScenario(page, "long-localized");
  await page.screenshot({
    fullPage: true,
    path: resolve(artifactDirectory, "05-mobile-harness.png"),
  });

  await page.setViewportSize({ width: 1_440, height: 1_000 });
  await selectScenario(page, "baseline");
  await page.getByTestId("at-open-gallery").click();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("snap-motion-media-gallery-position")).toHaveText("3 / 3");
  await page.keyboard.press("Escape");
  await expect.poll(() => traceEvents(page)).toContain("focus-restored");
  await trace(page).evaluate((element) => element.scrollIntoView({ block: "center" }));
  await trace(page).screenshot({
    path: resolve(artifactDirectory, "06-event-trace-after-close.png"),
  });
});
