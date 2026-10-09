import AxeBuilder from "@axe-core/playwright";
import { chromium, expect, test, type CDPSession, type Page } from "@playwright/test";

import { expectCarouselAt, expectSheetOpenAt } from "./helpers";
import {
  editor,
  openEditor,
  openPlayground,
  scrollY,
  section,
  sectionIds,
} from "./playgroundHelpers";

const widths = [320, 375, 390, 430, 768, 1024, 1440];
const stageTestIds = ["coverflow-viewport", "stacked-deck-viewport", "paged-grid"];

async function expectNoAxeViolations(page: Page, context: string) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.map((node) => node.target),
    })),
    context,
  ).toEqual([]);
}

async function horizontalOverflow(page: Page) {
  return page.evaluate(() => ({
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.documentElement.clientWidth,
    wide: [...document.querySelectorAll("main *")]
      .filter(
        (element) =>
          element.getBoundingClientRect().right > document.documentElement.clientWidth + 1,
      )
      .filter((element) => !element.closest("[inert], dialog:not([open])"))
      .filter(
        (element) =>
          !element.closest(".snap-motion-coverflow, .snap-motion-stacked-deck, .grid-viewport"),
      )
      .map((element) => `${element.tagName.toLowerCase()}.${element.className}`)
      .slice(0, 6),
  }));
}

// A negative value is a reserved scrollbar gutter, not overflow.
async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await horizontalOverflow(page);
  expect(overflow.document).toBeLessThanOrEqual(0);
  expect(overflow.body).toBeLessThanOrEqual(0);
  expect(overflow.wide).toEqual([]);
}

async function boxes(page: Page) {
  return Object.fromEntries(
    await Promise.all(
      stageTestIds.map(async (testid) => {
        const box = await page.getByTestId(testid).boundingBox();
        return [testid, box && { x: Math.round(box.x), width: Math.round(box.width) }] as const;
      }),
    ),
  );
}

/** A touch drag by protocol, so the page sees real touch pointers rather than synthetic events. */
async function swipe(
  client: CDPSession,
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  const steps = 12;
  await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [from] });
  for (let step = 1; step <= steps; step += 1) {
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        {
          x: from.x + ((to.x - from.x) * step) / steps,
          y: from.y + ((to.y - from.y) * step) / steps,
        },
      ],
    });
  }
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

test.describe("responsive composition", () => {
  for (const width of widths) {
    test(`has no horizontal overflow at ${width}px, closed and with an editor open`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 844 });
      await openPlayground(page);
      await expectNoHorizontalOverflow(page);

      await openEditor(page, "stacked-deck");
      await section(page, "coverflow").getByTestId("preset-loose").click();
      await expectNoHorizontalOverflow(page);

      // Every number field and slider stays inside the editor at this width.
      const escaped = await editor(page).evaluate((panel) => {
        const bounds = panel.getBoundingClientRect();
        return [...panel.querySelectorAll("input, button, summary")].filter((element) => {
          const box = element.getBoundingClientRect();
          return box.width > 0 && (box.left < bounds.left - 1 || box.right > bounds.right + 1);
        }).length;
      });
      expect(escaped).toBe(0);
    });
  }

  test("shows the first interactive surface early on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openPlayground(page);
    const box = await page.getByTestId("coverflow-viewport").boundingBox();
    expect(box).not.toBeNull();
    // The stage begins in the upper two thirds of the first screen, with real height to use.
    expect(box!.y).toBeLessThan(600);
    expect(box!.height).toBeGreaterThan(200);
  });

  test("keeps all five sections reachable on a phone without a horizontal nav strip", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await openPlayground(page);
    const nav = page.getByRole("navigation", { name: "Playground sections" });
    const list = nav.getByRole("list");
    expect(await list.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    for (const link of await nav.getByRole("link").all()) {
      await expect(link).toBeVisible();
      const box = (await link.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(320);
      expect(box.width).toBeGreaterThanOrEqual(24);
    }
    // The intro names them where the bar can only number them.
    const index = page.getByRole("navigation", { name: "Five surfaces" });
    await expect(index.getByRole("link")).toHaveText([
      /Coverflow/,
      /Stacked Deck/,
      /Paged Grid/,
      /Gallery/,
      /Sheet/,
    ]);

    await index.getByRole("link", { name: /Paged Grid/ }).click();
    await expect(page).toHaveURL(/#paged-grid$/);
    const top = await section(page, "paged-grid").evaluate(
      (element) => element.getBoundingClientRect().top,
    );
    expect(top).toBeGreaterThanOrEqual(0);
    expect(top).toBeLessThan(100);
  });

  test("the desktop bar names the sections, so the intro index is not repeated", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openPlayground(page);
    await expect(page.getByRole("navigation", { name: "Five surfaces" })).toBeHidden();
    await expect(
      page
        .getByRole("navigation", { name: "Playground sections" })
        .getByRole("link", { name: /Stacked Deck/ }),
    ).toBeVisible();
  });

  for (const width of [390, 1280]) {
    test(`opening an editor does not move or resize any stage at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await openPlayground(page);
      const before = await boxes(page);

      // Open the Deck's editor, then the Grid's: the first collapses above the second.
      await openEditor(page, "stacked-deck");
      expect(await boxes(page)).toEqual(before);
      const deckStage = await page.getByTestId("stacked-deck-viewport").boundingBox();

      const customize = section(page, "paged-grid").getByTestId("tuning-customize");
      await customize.scrollIntoViewIfNeeded();
      const anchored = (await customize.boundingBox())!.y;
      await customize.click();
      await expect(editor(page)).toHaveCount(1);
      await expect(customize).toHaveAttribute("aria-expanded", "true");
      // The control being operated stays where the visitor's pointer is.
      expect(Math.abs((await customize.boundingBox())!.y - anchored)).toBeLessThanOrEqual(1);
      expect(await boxes(page)).toEqual(before);

      await section(page, "stacked-deck").getByTestId("tuning-customize").scrollIntoViewIfNeeded();
      expect((await page.getByTestId("stacked-deck-viewport").boundingBox())!.width).toBe(
        deckStage!.width,
      );
    });
  }

  test("a surface still works after its neighbour's editor reflows the page", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openPlayground(page);
    await openEditor(page, "coverflow");
    await openEditor(page, "gallery");
    await section(page, "coverflow").getByTestId("coverflow-next").click();
    await expectCarouselAt(page.getByTestId("coverflow-viewport"), "team");
    await page.getByTestId("open-sheet").click();
    await expectSheetOpenAt(page.getByTestId("sheet"), "comfortable");
  });
});

test.describe("natural scrolling", () => {
  test("vertical wheel over every stage scrolls the page and leaves the surface alone", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openPlayground(page);

    for (const [id, testid] of [
      ["coverflow", "coverflow-viewport"],
      ["stacked-deck", "stacked-deck-viewport"],
      ["paged-grid", "paged-grid"],
    ] as const) {
      const stage = page.getByTestId(testid);
      const initial = await stage.getAttribute("data-active-id");
      await section(page, id).scrollIntoViewIfNeeded();
      await stage.scrollIntoViewIfNeeded();
      const box = (await stage.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height / 2, 200));
      const before = await scrollY(page);
      await page.mouse.wheel(0, 320);
      await expect.poll(() => scrollY(page)).toBeGreaterThan(before + 200);
      expect(await stage.getAttribute("data-active-id")).toBe(initial);
    }
  });

  test("a horizontal wheel over a stage drives the surface, not the page", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openPlayground(page, "no-preference");
    const stage = page.getByTestId("coverflow-viewport");
    await stage.scrollIntoViewIfNeeded();
    const before = await scrollY(page);
    const box = (await stage.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(900, 0);
    await expectCarouselAt(stage, "team");
    expect(await scrollY(page)).toBe(before);
  });

  test.describe("touch", () => {
    test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

    test("a vertical swipe on a stage scrolls the page; a horizontal one drives the surface", async ({
      page,
      browserName,
    }) => {
      test.skip(browserName !== "chromium", "Touch synthesis uses the Chromium protocol.");
      await openPlayground(page, "no-preference");
      const client = await page.context().newCDPSession(page);
      const stage = page.getByTestId("coverflow-viewport");
      await stage.scrollIntoViewIfNeeded();
      const box = (await stage.boundingBox())!;
      const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

      const before = await scrollY(page);
      await swipe(client, center, { x: center.x, y: center.y - 220 });
      await expect.poll(() => scrollY(page)).toBeGreaterThan(before + 60);
      await expect(stage).toHaveAttribute("data-active-id", "map");

      await stage.scrollIntoViewIfNeeded();
      const settled = await scrollY(page);
      const next = (await stage.boundingBox())!;
      const start = { x: next.x + next.width * 0.8, y: next.y + next.height / 2 };
      await swipe(client, start, { x: start.x - 240, y: start.y });
      // A quick swipe is a fling, and the Balanced release may carry it past one card.
      await expect(stage).toHaveAttribute("data-phase", "idle");
      expect(["team", "settings"]).toContain(await stage.getAttribute("data-active-id"));
      expect(Math.abs((await scrollY(page)) - settled)).toBeLessThanOrEqual(2);
    });

    test("gives every tuning control a comfortable touch target", async ({ page }) => {
      await openPlayground(page);
      await openEditor(page, "coverflow");
      const small = await page.evaluate(() => {
        const controls = [
          ...document.querySelectorAll(
            ".pg-bar a, #coverflow .tuning button, #coverflow .tuning select, #coverflow .tuning-panel input[type='number'], #coverflow .tuning-panel summary",
          ),
        ];
        return controls
          .map((element) => {
            const box = element.getBoundingClientRect();
            return {
              name: (element.textContent ?? "").trim().slice(0, 24),
              width: box.width,
              height: box.height,
            };
          })
          .filter(({ width, height }) => width > 0 && (height < 43.5 || width < 24));
      });
      expect(small).toEqual([]);
    });
  });
});

test.describe("automated accessibility certification", () => {
  test("the page passes axe at rest, with an editor, and with each modal open", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openPlayground(page);
    await expectNoAxeViolations(page, "playground initial");

    await openEditor(page, "stacked-deck");
    await expectNoAxeViolations(page, "playground with the Deck editor open");

    await section(page, "gallery").getByTestId("open-lightbox").click();
    await expect(page.getByTestId("media-lightbox")).toBeVisible();
    await expectNoAxeViolations(page, "gallery open");
    await page.keyboard.press("Escape");

    await page.getByTestId("open-sheet").click();
    await expectSheetOpenAt(page.getByTestId("sheet"), "comfortable");
    await expectNoAxeViolations(page, "sheet open");
  });

  test("a surface's own inspection gallery passes axe inside the page", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openPlayground(page);
    await section(page, "coverflow").getByTestId("coverflow-inspect").click();
    await expect(section(page, "coverflow").locator("dialog[open]")).toBeVisible();
    await expectNoAxeViolations(page, "coverflow inspection gallery open");
  });

  test("forced colours keep the pressed segment and the current section distinguishable", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "Forced-colours emulation is verified in Chromium.");
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.emulateMedia({ forcedColors: "active" });
    await openPlayground(page);
    const paint = (selector: string) =>
      page
        .locator(selector)
        .first()
        .evaluate((element) => {
          const style = getComputedStyle(element);
          return `${style.backgroundColor}|${style.color}|${style.textDecorationLine}`;
        });

    const pressed = section(page, "coverflow").getByTestId("preset-balanced");
    const other = section(page, "coverflow").getByTestId("preset-tight");
    await expect(pressed).toHaveAttribute("aria-pressed", "true");
    const pressedPaint = await pressed.evaluate((element) => {
      const style = getComputedStyle(element);
      return `${style.backgroundColor}|${style.color}`;
    });
    const otherPaint = await other.evaluate((element) => {
      const style = getComputedStyle(element);
      return `${style.backgroundColor}|${style.color}`;
    });
    expect(pressedPaint).not.toBe(otherPaint);

    await page.getByTestId("nav-paged-grid").click();
    await expect(page.getByTestId("nav-paged-grid")).toHaveAttribute("aria-current", "location");
    expect(await paint('[data-testid="nav-paged-grid"]')).toContain("underline");
    expect(await paint('[data-testid="nav-sheet"]')).not.toContain("underline");
  });

  test("the page passes axe on a phone and at 200% zoom", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openPlayground(page);
    await openEditor(page, "paged-grid");
    await expectNoAxeViolations(page, "playground mobile with an editor");
    for (const zoom of [2, 4]) {
      await page.locator("html").evaluate((element, value) => {
        element.style.zoom = String(value);
      }, zoom);
      await expectNoAxeViolations(page, `playground ${zoom * 100}% zoom`);
    }
  });

  test("every section is a named region and every tuning bar a named group", async ({ page }) => {
    await openPlayground(page);
    for (const id of sectionIds) {
      const region = section(page, id);
      await expect(region).toHaveAttribute("aria-labelledby", `${id}-title`);
      await expect(region.getByRole("group", { name: "Base preset" })).toHaveCount(1);
      await expect(region.getByRole("button", { name: "Customize" })).toHaveCount(1);
    }
  });
});

test.describe("document-level listeners", () => {
  test("dialogs, editors, presets and inspections leave no listener behind", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "Listener inventories use the Chromium protocol.");
    await page.setViewportSize({ width: 1280, height: 900 });
    await openPlayground(page);
    const client = await page.context().newCDPSession(page);

    async function inventory() {
      const result: Record<string, Record<string, number>> = {};
      for (const target of ["window", "document", "document.documentElement", "document.body"]) {
        const { result: handle } = await client.send("Runtime.evaluate", { expression: target });
        const { listeners } = await client.send("DOMDebugger.getEventListeners", {
          objectId: handle.objectId!,
        });
        const byType: Record<string, number> = {};
        for (const { type } of listeners) byType[type] = (byType[type] ?? 0) + 1;
        result[target] = byType;
      }
      return result;
    }

    async function cycle() {
      const lightbox = page.getByTestId("media-lightbox");
      await page.getByTestId("open-lightbox").scrollIntoViewIfNeeded();
      await page.getByTestId("open-lightbox").click();
      await expect(lightbox).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(lightbox).not.toBeVisible();

      const sheet = page.getByTestId("sheet");
      await page.getByTestId("open-sheet").scrollIntoViewIfNeeded();
      await page.getByTestId("open-sheet").click();
      await expectSheetOpenAt(sheet, "comfortable");
      await page.keyboard.press("Escape");
      await expect(sheet).not.toBeVisible();

      for (const id of sectionIds) {
        await section(page, id).getByTestId("tuning-customize").click();
        await expect(editor(page)).toHaveCount(1);
      }
      await section(page, "sheet").getByTestId("tuning-customize").click();
      await expect(editor(page)).toHaveCount(0);
      for (const preset of ["heavy", "loose", "tight", "balanced"])
        await section(page, "coverflow").getByTestId(`preset-${preset}`).click();

      const inspect = section(page, "coverflow").getByTestId("coverflow-inspect");
      await inspect.scrollIntoViewIfNeeded();
      await inspect.click();
      await expect(section(page, "coverflow").locator("dialog[open]")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(section(page, "coverflow").locator("dialog[open]")).toHaveCount(0);
    }

    // A closing dialog briefly holds a document-level focus listener until its `close` event is
    // consumed, so measure only a settled page: two consecutive inventories must agree.
    async function settledInventory() {
      let previous = JSON.stringify(await inventory());
      for (let attempt = 0; attempt < 20; attempt += 1) {
        await page.evaluate(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
            ),
        );
        const next = JSON.stringify(await inventory());
        if (next === previous) return JSON.parse(next) as Awaited<ReturnType<typeof inventory>>;
        previous = next;
      }
      throw new Error("The page's document-level listeners never settled.");
    }

    // The first interaction makes the test harness install its own page-level listeners.
    await cycle();
    const before = await settledInventory();
    // Five mounted surfaces own their own gesture listeners; this proves they hold a fixed set.
    expect(before.window?.pointerdown ?? 0).toBeLessThanOrEqual(1);
    expect(before.document?.focus ?? 0).toBe(0);
    for (let run = 0; run < 3; run += 1) await cycle();
    expect(await settledInventory()).toEqual(before);
  });
});

test.describe("layout stability", () => {
  test("does not shift during load, editor use or preset changes", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "Layout Instability is a Chromium API.");
    await page.addInitScript(() => {
      Reflect.set(window, "layoutShiftTotal", 0);
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as unknown as {
          value: number;
          hadRecentInput: boolean;
        }[])
          if (!entry.hadRecentInput)
            Reflect.set(
              window,
              "layoutShiftTotal",
              Reflect.get(window, "layoutShiftTotal") + entry.value,
            );
      }).observe({ type: "layout-shift", buffered: true });
    });
    const shifted = () => page.evaluate(() => Number(Reflect.get(window, "layoutShiftTotal")));
    await page.setViewportSize({ width: 1280, height: 900 });
    await openPlayground(page);
    await page.waitForTimeout(500);
    const load = await shifted();

    await section(page, "coverflow").getByTestId("preset-heavy").click();
    await openEditor(page, "coverflow");
    await openEditor(page, "gallery");
    await page.waitForTimeout(300);
    const total = await shifted();
    // Opening an editor adds content below the viewer's position, which is not a shift.
    expect(load).toBeLessThan(0.05);
    expect(total - load).toBeLessThan(0.02);
  });
});

test.describe("scroll lock with real scrollbars", () => {
  test("a modal does not widen the page behind it", async ({ baseURL, browserName }) => {
    test.skip(browserName !== "chromium", "Classic scrollbars are forced for Chromium here.");
    // Headless Chromium hides scrollbars by default, which would make a lock that removes the
    // gutter undetectable. This browser keeps them, as a desktop visitor's does.
    const browser = await chromium.launch({ ignoreDefaultArgs: ["--hide-scrollbars"] });
    try {
      const context = await browser.newContext({
        baseURL: baseURL!,
        viewport: { width: 1000, height: 800 },
      });
      const page = await context.newPage();
      await openPlayground(page);
      const measure = () =>
        page.evaluate(() => ({
          main: Math.round(document.querySelector("main")!.getBoundingClientRect().width),
          stage: Math.round(
            document.querySelector('[data-testid="coverflow-viewport"]')!.getBoundingClientRect()
              .width,
          ),
        }));
      const scrollbar = await page.evaluate(
        () => window.innerWidth - document.documentElement.clientWidth,
      );
      // The scrollbar is real, so a lock that removed it would visibly widen the page.
      expect(scrollbar).toBeGreaterThan(0);
      const before = await measure();

      await page.getByTestId("open-lightbox").scrollIntoViewIfNeeded();
      await page.getByTestId("open-lightbox").click();
      await expect(page.getByTestId("media-lightbox")).toBeVisible();
      expect(await measure()).toEqual(before);
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("media-lightbox")).not.toBeVisible();

      await page.getByTestId("open-sheet").scrollIntoViewIfNeeded();
      await page.getByTestId("open-sheet").click();
      await expectSheetOpenAt(page.getByTestId("sheet"), "comfortable");
      expect(await measure()).toEqual(before);
    } finally {
      await browser.close();
    }
  });
});
