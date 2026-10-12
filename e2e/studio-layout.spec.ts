import AxeBuilder from "@axe-core/playwright";
import { chromium, expect, test, type Page } from "@playwright/test";

import { openPlayground, scrollY } from "./playgroundHelpers";
import { expectSheetClosed, openStudio, studio } from "./studioHelpers";

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
      .filter((element) => !element.closest(".snap-motion-coverflow, .snap-motion-stacked-deck"))
      .map((element) => `${element.tagName.toLowerCase()}.${element.className}`)
      .slice(0, 6),
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

test.describe("responsive composition", () => {
  for (const width of widths) {
    test(`has no horizontal overflow at ${width}px in every view and with the sheet open`, async ({
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
        for (const view of ["compare", "candidates"]) {
          await page.getByTestId(`studio-view-${view}`).click();
          await expect(page.getByTestId(`studio-view-${view}`)).toHaveAttribute(
            "aria-pressed",
            "true",
          );
          await expectNoHorizontalOverflow(page);
        }
        await page.getByTestId("studio-open-deck-direct").click();
        await expect(studio.detail(page)).toBeVisible();
        await expectNoHorizontalOverflow(page);
        await page.getByTestId("studio-detail-back").click();
        await page.getByTestId("studio-view-compare").click();
      } else {
        await page.getByTestId("studio-open-deck-direct").click();
        await expect(studio.detail(page)).toBeVisible();
        await expectNoHorizontalOverflow(page);
        await page.getByTestId("studio-detail-back").click();
      }

      await page.getByTestId("studio-choose-a").click();
      await page.getByTestId("studio-open-implementation").click();
      await expect(studio.sheet(page)).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await page.keyboard.press("Escape");
      await expectSheetClosed(page);
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
      const after = await positions();
      // Everything above and including the Studio keeps its place and width; the Studio grows down.
      expect(after).toEqual(before);
    });
  }

  test("changing view or opening a detail never moves the page by more than the content itself", async ({
    page,
  }) => {
    await openStudio(page, { width: 390, height: 844 });
    const top = () =>
      page.evaluate(() =>
        Math.round(document.querySelector("#studio")!.getBoundingClientRect().top + scrollY),
      );
    const before = await top();
    await page.getByTestId("studio-view-compare").click();
    await page.getByTestId("studio-view-candidates").click();
    await page.getByTestId("studio-open-rail-balanced").click();
    await page.getByTestId("studio-detail-back").click();
    // The Studio's own top edge, in the document, is where it was: nothing above it reflowed.
    expect(await top()).toBe(before);
  });
});

test.describe("touch and pointer", () => {
  test("every control is at least 44px in each dimension on a phone", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    await openPlayground(page);
    await page.getByTestId("studio-activate").click();
    await expect(page.getByTestId("studio-workspace")).toBeVisible();
    const small = async () =>
      page.evaluate(() =>
        [
          ...document.querySelectorAll<HTMLElement>(
            "#studio button, #studio a, #studio textarea, #studio [role='button']",
          ),
        ]
          .filter((element) => !element.closest("[inert], dialog"))
          .map((element) => ({ element, box: element.getBoundingClientRect() }))
          .filter(
            ({ element, box }) =>
              box.width > 0 &&
              !element.classList.contains("sr-only") &&
              (box.height < 43.5 || box.width < 43.5),
          )
          .map(
            ({ element, box }) =>
              `${element.textContent?.trim().slice(0, 24)} ${Math.round(box.width)}x${Math.round(box.height)}`,
          ),
      );
    expect(await small(), "candidates view").toEqual([]);
    await page.getByTestId("studio-view-compare").click();
    expect(await small(), "compare view").toEqual([]);
    await context.close();
  });
});

test.describe("scroll lock", () => {
  test("opening the sheet does not shift the Studio with real scrollbars", async () => {
    const browser = await chromium.launch({ ignoreDefaultArgs: ["--hide-scrollbars"] });
    try {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        reducedMotion: "reduce",
      });
      const page = await context.newPage();
      await page.goto(
        new URL("./playground/", `http://127.0.0.1:${process.env.SNAP_MOTION_TEST_PORT ?? "4173"}`)
          .href,
      );
      await page.getByTestId("studio-activate").click();
      await expect(page.getByTestId("studio-workspace")).toBeVisible();
      await page
        .getByTestId("studio-choose-a")
        .evaluate((element) => element.scrollIntoView({ block: "center" }));
      const left = () =>
        page.evaluate(() => {
          const box = document.querySelector("#studio")!.getBoundingClientRect();
          return [Math.round(box.left), Math.round(box.width)];
        });
      const before = await left();
      const y = await scrollY(page);
      await page.getByTestId("studio-choose-a").click();
      await page.getByTestId("studio-open-implementation").click();
      await expect(page.getByTestId("studio-sheet")).toBeVisible();
      expect(await left()).toEqual(before);
      expect(await scrollY(page)).toBeGreaterThanOrEqual(y - 1);
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("studio-sheet")).not.toBeVisible();
      expect(await left()).toEqual(before);
      await context.close();
    } finally {
      await browser.close();
    }
  });
});

test.describe("accessibility", () => {
  // One scan per test: axe on the whole page is the most expensive thing here, and separate tests run
  // on separate workers and name the state that failed.
  test("passes axe at rest on a wide layout", async ({ page }) => {
    await openStudio(page);
    await expectNoAxeViolations(page, "wide at rest");
  });

  test("passes axe with a detail open and with a decision made", async ({ page }) => {
    await openStudio(page);
    await page.getByTestId("studio-open-deck-shuffle").click();
    await expect(studio.detail(page)).toBeVisible();
    await expectNoAxeViolations(page, "detail");
    await page.getByTestId("studio-detail-back").click();
    await page.getByTestId("studio-choose-b").click();
    await expectNoAxeViolations(page, "decided");
  });

  test("passes axe with the implementation sheet open", async ({ page }) => {
    await openStudio(page);
    await page.getByTestId("studio-choose-a").click();
    await page.getByTestId("studio-open-implementation").click();
    await expect(studio.sheet(page)).toBeVisible();
    await expectNoAxeViolations(page, "sheet");
  });

  test("passes axe with only a reference, and with nothing shortlisted", async ({ page }) => {
    await openStudio(page);
    await page.getByTestId("studio-remove-rail-loose").click();
    await expectNoAxeViolations(page, "reference only");
    await page.getByTestId("studio-remove-rail-tight").click();
    await expectNoAxeViolations(page, "empty");
  });

  for (const view of ["candidates", "compare", "detail"] as const) {
    test(`passes axe on a phone in the ${view} view`, async ({ page }) => {
      await openStudio(page, { width: 390, height: 844 });
      if (view === "compare") await page.getByTestId("studio-view-compare").click();
      if (view === "detail") {
        await page.getByTestId("studio-open-deck-shuffle").click();
        await expect(studio.detail(page)).toBeVisible();
      }
      await expectNoAxeViolations(page, view);
    });
  }
});

test.describe("document-level listeners", () => {
  test("cycling the Studio's views, details, shortlist and sheet leaves no listener behind", async ({
    page,
  }) => {
    await openStudio(page);
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
      await page.getByTestId("studio-open-deck-direct").click();
      await expect(studio.detail(page)).toBeVisible();
      await page.getByTestId("studio-detail-shortlist").click();
      await page.getByTestId("studio-detail-back").click();
      await page.getByTestId("studio-shortlist-rail-balanced").click();
      await page.getByTestId("studio-swap").click();
      await page.getByTestId("studio-driver-replay").click();
      await page.getByTestId("studio-driver-replay").click();
      await page.getByTestId("studio-remove-deck-direct").click();
      await page.getByTestId("studio-remove-rail-balanced").click();
      await page.getByTestId("studio-swap").click();
      await page.getByTestId("studio-choose-a").click();
      await page.getByTestId("studio-open-implementation").click();
      await expect(studio.sheet(page)).toBeVisible();
      await page.keyboard.press("Escape");
      await expectSheetClosed(page);
      await page.getByTestId("studio-revise").click();
      await page.locator("#studio [data-testid='preset-heavy']").click();
      await page.locator("#studio [data-testid='preset-balanced']").click();
    }

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

    await cycle();
    const before = await settledInventory();
    expect(before.document?.focus ?? 0).toBe(0);
    for (let run = 0; run < 3; run += 1) await cycle();
    expect(await settledInventory()).toEqual(before);
  });
});
