import AxeBuilder from "@axe-core/playwright";
import { chromium, expect, test, type CDPSession, type Page } from "@playwright/test";

import { openPlayground, scrollY } from "./playgroundHelpers";
import {
  expectGalleryClosed,
  expectGalleryOpen,
  expectSheetClosed,
  openStudio,
  studio,
} from "./studioHelpers";

const widths = [320, 375, 390, 430, 768, 1024, 1440];
// The wide layout begins at 62rem.
const wideFrom = 992;

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
    wide: [...document.querySelectorAll("#studio *")]
      .filter(
        (element) =>
          element.getBoundingClientRect().right > document.documentElement.clientWidth + 1,
      )
      .filter((element) => !element.closest("[inert], dialog"))
      // The rail and the pile paint beyond their allocation by design; the document must not.
      .filter(
        (element) =>
          !element.closest(".snap-motion-coverflow, .snap-motion-stacked-deck, .grid-viewport"),
      )
      .map((element) => `${element.tagName.toLowerCase()}.${element.className}`)
      .slice(0, 6),
    // A modal's own track parks its neighbouring slots outside it; the dialog itself must fit.
    dialogs: [...document.querySelectorAll("dialog[open]")]
      .filter((dialog) => {
        const box = dialog.getBoundingClientRect();
        return box.right > document.documentElement.clientWidth + 1 || box.left < -1;
      })
      .map((dialog) => dialog.className),
  }));
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await horizontalOverflow(page);
  expect(overflow.document).toBeLessThanOrEqual(0);
  expect(overflow.body).toBeLessThanOrEqual(0);
  expect(overflow.wide).toEqual([]);
  expect(overflow.dialogs).toEqual([]);
}

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
    test(`has no horizontal overflow at ${width}px in every view and with each overlay open`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 844 });
      await openPlayground(page);
      await expectNoHorizontalOverflow(page);

      await page.getByTestId("studio-activate").click();
      const workspace = page.getByTestId("studio-workspace");
      await expect(workspace).toBeVisible();
      await expect(workspace).toHaveAttribute("data-layout", width >= wideFrom ? "wide" : "narrow");
      await expectNoHorizontalOverflow(page);

      if (width < wideFrom) {
        for (const view of ["explore", "compare", "browse"]) {
          await page.getByTestId(`studio-view-${view}`).click();
          await expect(page.getByTestId(`studio-view-${view}`)).toHaveAttribute(
            "aria-pressed",
            "true",
          );
          await expectNoHorizontalOverflow(page);
        }
      }

      await page.getByTestId("studio-details").click();
      await expect(studio.sheet(page)).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await page.keyboard.press("Escape");
      await expectSheetClosed(page);
      await page.getByTestId("studio-inspect").click();
      await expectGalleryOpen(page, "Fold — Study plate");
      await expectNoHorizontalOverflow(page);
      await page.keyboard.press("Escape");
      await expectGalleryClosed(page);
    });
  }

  for (const width of [390, 768, 1280]) {
    test(`activating the Studio moves nothing above it at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await openPlayground(page);
      const positions = () =>
        page.evaluate(() =>
          [
            "#top",
            "#coverflow",
            "#stacked-deck",
            "#paged-grid",
            "#gallery",
            "#sheet",
            "#studio",
          ].map((selector) => {
            const box = document.querySelector(selector)!.getBoundingClientRect();
            return [selector, Math.round(box.top + window.scrollY), Math.round(box.width)];
          }),
        );
      const before = await positions();
      await page.getByTestId("studio-activate").click();
      await expect(page.getByTestId("studio-workspace")).toBeVisible();
      expect(await positions()).toEqual(before);
    });
  }

  test("switching views keeps the header, the view switch and the page height steady", async ({
    page,
  }) => {
    await openStudio(page, { width: 390, height: 844 });
    const measure = () =>
      page.evaluate(() => ({
        bar: Math.round(
          document.querySelector(".studio-bar")!.getBoundingClientRect().top + scrollY,
        ),
        modes: Math.round(
          document.querySelector(".studio-modes")!.getBoundingClientRect().top + scrollY,
        ),
        height: Math.round(
          document.querySelector('[data-testid="studio-workspace"]')!.getBoundingClientRect()
            .height,
        ),
      }));
    const heights: number[] = [];
    let anchor: { bar: number; modes: number } | undefined;
    for (const view of ["browse", "explore", "compare", "browse"]) {
      await page.getByTestId(`studio-view-${view}`).click();
      await expect(page.getByTestId(`studio-view-${view}`)).toHaveAttribute("aria-pressed", "true");
      const { height, ...fixed } = await measure();
      anchor ??= fixed;
      expect(fixed).toEqual(anchor);
      heights.push(height);
    }
    // The three views are within one card of each other, so the page barely moves.
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(120);
  });

  test("keeps a visitor's place: the page does not scroll when a view or a selection changes", async ({
    page,
  }) => {
    await openStudio(page, { width: 390, height: 844 });
    // Centre the view switch so the harness has no reason to scroll when it clicks a control.
    await page
      .locator(".studio-modes")
      .evaluate((element) => element.scrollIntoView({ block: "center", behavior: "instant" }));
    const before = await scrollY(page);
    await page.getByTestId("studio-view-explore").click();
    // Drive the rail from its own focus, without the harness scrolling a control into view.
    await studio.coverflow(page).evaluate((rail) => rail.focus({ preventScroll: true }));
    await page.keyboard.press("ArrowRight");
    await expect(studio.activeName(page)).toHaveText("Relay");
    await page.getByTestId("studio-view-compare").click();
    await page.getByTestId("studio-view-browse").click();
    expect(Math.abs((await scrollY(page)) - before)).toBeLessThanOrEqual(2);
  });
});

test.describe("layout stability", () => {
  for (const width of [390, 1440]) {
    test(`the sticky header stays anchored through the Studio's overlays at ${width}px`, async ({
      page,
    }) => {
      await openStudio(page, { width, height: 900, reducedMotion: "no-preference" });
      await page.getByTestId("studio-details").scrollIntoViewIfNeeded();
      const initialScroll = await scrollY(page);
      await page.evaluate(() => {
        const positions: number[] = [];
        Reflect.set(window, "headerPositions", positions);
        Reflect.set(window, "sampleHeader", true);
        function sample() {
          positions.push(document.querySelector(".pg-bar")!.getBoundingClientRect().top);
          if (Reflect.get(window, "sampleHeader")) requestAnimationFrame(sample);
        }
        requestAnimationFrame(sample);
      });
      await page.getByTestId("studio-details").click();
      await expect(studio.sheet(page)).toHaveAttribute("data-sheet-state", "open", {
        timeout: 8_000,
      });
      await page.keyboard.press("Escape");
      await expectSheetClosed(page);
      await page.getByTestId("studio-inspect").click();
      await expectGalleryOpen(page, "Fold — Study plate");
      await page.keyboard.press("Escape");
      await expectGalleryClosed(page);
      const positions = await page.evaluate(() => {
        Reflect.set(window, "sampleHeader", false);
        return Reflect.get(window, "headerPositions") as number[];
      });
      expect(positions.length).toBeGreaterThan(2);
      expect(positions.every((top) => Math.abs(top) <= 1)).toBe(true);
      expect(await scrollY(page)).toBe(initialScroll);
    });
  }

  test("does not shift during load, activation, selection or overlays", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "Layout Instability is a Chromium API.");
    await page.addInitScript(() => {
      Reflect.set(window, "layoutShiftTotal", 0);
      new PerformanceObserver((list) => {
        // Input-driven shifts are excluded by the platform; everything else must be zero.
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
    expect(load).toBeLessThan(0.05);

    await page.getByTestId("studio-activate").click();
    await expect(page.getByTestId("studio-workspace")).toBeVisible();
    // Let the input exclusion window pass so any later shift would be counted.
    await page.waitForTimeout(700);
    const activated = await shifted();
    await studio.tile(page, "traverse").click();
    await page.getByTestId("studio-toggle-compare").click();
    await page.getByTestId("studio-details").click();
    await expect(studio.sheet(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expectSheetClosed(page);
    await page.waitForTimeout(700);
    expect((await shifted()) - activated).toBeLessThan(0.02);
  });
});

test.describe("scroll lock with real scrollbars", () => {
  test("the Studio's modals do not widen the page behind them", async ({
    baseURL,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "Classic scrollbars are forced for Chromium here.");
    const browser = await chromium.launch({ ignoreDefaultArgs: ["--hide-scrollbars"] });
    try {
      const context = await browser.newContext({
        baseURL: baseURL!,
        reducedMotion: "reduce",
        viewport: { width: 1100, height: 800 },
      });
      const page = await context.newPage();
      await openPlayground(page);
      await page.getByTestId("studio-activate").click();
      await expect(page.getByTestId("studio-workspace")).toBeVisible();
      const measure = () =>
        page.evaluate(() => ({
          main: Math.round(document.querySelector("main")!.getBoundingClientRect().width),
          workspace: Math.round(
            document.querySelector('[data-testid="studio-workspace"]')!.getBoundingClientRect()
              .width,
          ),
          coverflow: Math.round(
            document.querySelector('[data-testid="studio-coverflow"]')!.getBoundingClientRect()
              .width,
          ),
        }));
      const scrollbar = await page.evaluate(
        () => window.innerWidth - document.documentElement.clientWidth,
      );
      expect(scrollbar).toBeGreaterThan(0);
      const before = await measure();

      await page.getByTestId("studio-inspect").scrollIntoViewIfNeeded();
      await page.getByTestId("studio-inspect").click();
      await expectGalleryOpen(page, "Fold — Study plate");
      expect(await measure()).toEqual(before);
      await page.keyboard.press("Escape");
      await expectGalleryClosed(page);
      expect(await measure()).toEqual(before);

      await page.getByTestId("studio-details").click();
      await expect(studio.sheet(page)).toBeVisible();
      expect(await measure()).toEqual(before);
    } finally {
      await browser.close();
    }
  });
});

test.describe("natural scrolling", () => {
  test("vertical wheel over every Studio surface scrolls the page and leaves it alone", async ({
    page,
  }) => {
    await openStudio(page, { width: 1280, height: 800 });
    for (const [stage, attribute] of [
      [studio.coverflow(page), "data-active-id"],
      [studio.deck(page), "data-active-id"],
      [studio.grid(page), "data-active-page"],
    ] as const) {
      const initial = await stage.getAttribute(attribute);
      await stage.scrollIntoViewIfNeeded();
      const box = (await stage.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height / 2, 120));
      const before = await scrollY(page);
      await page.mouse.wheel(0, 320);
      await expect.poll(() => scrollY(page)).toBeGreaterThan(before + 200);
      expect(await stage.getAttribute(attribute)).toBe(initial);
    }
  });

  test("a horizontal wheel over the Studio's Coverflow drives it, not the page", async ({
    page,
  }) => {
    await openStudio(page, { width: 1280, height: 800, reducedMotion: "no-preference" });
    const stage = studio.coverflow(page);
    await stage.scrollIntoViewIfNeeded();
    const before = await scrollY(page);
    const box = (await stage.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(900, 0);
    await expect(stage).toHaveAttribute("data-phase", "idle", { timeout: 10_000 });
    expect(await stage.getAttribute("data-active-id")).not.toBe("fold");
    expect(await scrollY(page)).toBe(before);
    // The selection followed the rail's own request.
    await expect(studio.activeName(page)).not.toHaveText("Fold");
  });

  test.describe("touch", () => {
    test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

    test("a vertical swipe on a Studio stage scrolls the page; a horizontal one drives it", async ({
      page,
      browserName,
    }) => {
      test.skip(browserName !== "chromium", "Touch synthesis uses the Chromium protocol.");
      await openStudio(page, { width: 390, height: 844, reducedMotion: "no-preference" });
      await page.getByTestId("studio-view-explore").click();
      const client = await page.context().newCDPSession(page);
      const stage = studio.coverflow(page);
      await stage.scrollIntoViewIfNeeded();
      const box = (await stage.boundingBox())!;
      const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

      const before = await scrollY(page);
      await swipe(client, center, { x: center.x, y: center.y - 220 });
      await expect.poll(() => scrollY(page)).toBeGreaterThan(before + 60);
      await expect(stage).toHaveAttribute("data-active-id", "fold");

      await stage.scrollIntoViewIfNeeded();
      const settled = await scrollY(page);
      const next = (await stage.boundingBox())!;
      const start = { x: next.x + next.width * 0.8, y: next.y + next.height / 2 };
      await swipe(client, start, { x: start.x - 240, y: start.y });
      await expect(stage).toHaveAttribute("data-phase", "idle", { timeout: 10_000 });
      expect(await stage.getAttribute("data-active-id")).not.toBe("fold");
      expect(Math.abs((await scrollY(page)) - settled)).toBeLessThanOrEqual(2);
      await expect(studio.activeName(page)).not.toHaveText("Fold");
    });

    test("the Grid takes a tap as a selection and a vertical swipe as a scroll", async ({
      page,
      browserName,
    }) => {
      test.skip(browserName !== "chromium", "Touch synthesis uses the Chromium protocol.");
      await openStudio(page, { width: 390, height: 844 });
      const client = await page.context().newCDPSession(page);
      const tile = studio.tile(page, "orbit");
      await tile.scrollIntoViewIfNeeded();
      await tile.tap();
      await expect(studio.activeName(page)).toHaveText("Orbit");

      const grid = studio.grid(page);
      await grid.scrollIntoViewIfNeeded();
      const box = (await grid.boundingBox())!;
      const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      const before = await scrollY(page);
      await swipe(client, start, { x: start.x, y: start.y - 200 });
      await expect.poll(() => scrollY(page)).toBeGreaterThan(before + 50);
      // A swipe is not a tap: the selection did not change.
      await expect(studio.activeName(page)).toHaveText("Orbit");
    });

    test("the controls a thumb needs are comfortably large", async ({ page }) => {
      await openStudio(page, { width: 390, height: 844 });
      const small = await page.evaluate(() => {
        const controls = [
          ...document.querySelectorAll(
            ".studio-modes button, .filter button, .density button, .pager-button, .studio-inspector button, .step-controls button",
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
  test("the Studio passes axe at rest and with each overlay open", async ({ page }) => {
    await openStudio(page);
    await expectNoAxeViolations(page, "Studio at rest");

    await page.getByTestId("studio-details").click();
    await expect(studio.sheet(page)).toHaveAttribute("data-sheet-state", "open", {
      timeout: 8_000,
    });
    await expectNoAxeViolations(page, "Studio details sheet open");
    await page.keyboard.press("Escape");
    await expectSheetClosed(page);

    await page.getByTestId("studio-inspect").click();
    await expectGalleryOpen(page, "Fold — Study plate");
    await expectNoAxeViolations(page, "Studio gallery open");
  });

  test("the Studio passes axe on a phone in each view and in its empty comparison states", async ({
    page,
  }) => {
    await openStudio(page, { width: 390, height: 844 });
    for (const view of ["browse", "explore", "compare"]) {
      await page.getByTestId(`studio-view-${view}`).click();
      await expectNoAxeViolations(page, `Studio ${view} view on a phone`);
    }
    await page.getByTestId("studio-remove-arc").click();
    await expectNoAxeViolations(page, "Studio single-card comparison");
    await page.getByTestId("studio-remove-relay").click();
    await page.getByTestId("studio-remove-fold").click();
    await expect(page.getByTestId("studio-compare-empty")).toBeVisible();
    await expectNoAxeViolations(page, "Studio empty comparison");
  });

  test("the Studio is a named region with named, labelled surfaces", async ({ page }) => {
    await openStudio(page);
    await expect(page.getByRole("region", { name: "Everything in motion" })).toHaveCount(1);
    const workspace = page.getByTestId("studio-workspace");
    await expect(workspace).toHaveAccessibleName("Motion Studio");
    for (const name of ["Collection", "Spatial view", "Comparison", "Fold"] as const)
      await expect(workspace.getByRole("heading", { level: 4, name })).toHaveCount(1);
    await expect(
      workspace.getByRole("group", { name: "Motion studies, spatial view" }),
    ).toHaveCount(1);
    await expect(
      workspace.getByRole("group", { name: "Compared studies, stacked deck" }),
    ).toHaveCount(1);
    await expect(workspace.getByRole("group", { name: "Studies", exact: true })).toHaveCount(1);
    await expect(workspace.getByRole("list", { name: "Studies in comparison" })).toHaveCount(1);
    // One live region for the workspace, plus the surfaces' own settlement announcements.
    await expect(studio.status(page)).toHaveAttribute("aria-atomic", "true");
    // Heading order: the section heading, the workspace, then its regions.
    expect(
      await page
        .locator("#studio")
        .evaluate((root) =>
          [...root.querySelectorAll("h2, h3, h4")]
            .filter((heading) => !heading.closest("dialog"))
            .map((heading) => heading.tagName),
        ),
    ).toEqual(["H2", "H3", "H4", "H4", "H4", "H4", "H3"]);
  });
});
