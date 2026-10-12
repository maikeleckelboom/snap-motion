import { expect, test, type Page } from "@playwright/test";

import { openPlayground, scrollY } from "./playgroundHelpers";
import { expectStudioIdle, studio } from "./studioHelpers";

/**
 * The Studio's native View Transitions.
 *
 * Calling `document.startViewTransition()` is not evidence of a transition: the page can skip it, or
 * run it and animate nothing. These tests wrap the real API from the outside, so the Studio runs
 * unmodified against it, and read back what the browser did: which names the snapshot held, whether
 * the transition became ready, and which pseudo-element animations it actually ran. A transition
 * counts as visible only if its shared element's group is seen travelling between two different
 * boxes.
 */

interface Entry {
  /** Names on elements when the browser took the old snapshot. */
  namedAtStart: string[];
  /** Names on elements right after the update, when the new snapshot is taken. */
  namedAfterUpdate: string[];
  dataset: Record<string, string>;
  ready?: boolean;
  readyError?: string;
  finished?: boolean;
  animations: string[];
}

declare global {
  interface Window {
    snapMotionTransitions: Entry[];
  }
}

/** Wraps the real API before the page runs. It changes nothing about how the Studio behaves. */
async function installProbe(page: Page) {
  await page.addInitScript(() => {
    window.snapMotionTransitions = [];
    const original = document.startViewTransition?.bind(document);
    if (!original) return;
    // oxlint-disable-next-line unicorn/consistent-function-scoping -- This helper must execute in the browser's init-script scope.
    const names = () =>
      [...document.querySelectorAll<HTMLElement>("*")]
        .map((element) => element.style.getPropertyValue("view-transition-name"))
        .filter((name) => name !== "");
    document.startViewTransition = ((callback?: () => Promise<void> | void) => {
      const entry: Entry = {
        namedAtStart: names(),
        namedAfterUpdate: [],
        dataset: { ...document.documentElement.dataset },
        animations: [],
      };
      window.snapMotionTransitions.push(entry);
      const transition = original(async () => {
        await callback?.();
        entry.namedAfterUpdate = names();
      });
      void (async () => {
        try {
          await transition.ready;
          entry.ready = true;
          entry.animations = document
            .getAnimations()
            .map((animation) => (animation.effect as KeyframeEffect | null)?.pseudoElement ?? "")
            .filter((pseudo) => pseudo.startsWith("::view-transition"));
        } catch (error) {
          entry.readyError = String(error);
        }
      })();
      void (async () => {
        await transition.finished.catch(() => {});
        entry.finished = true;
      })();
      return transition;
    }) as typeof document.startViewTransition;
  });
}

async function openStudioForTransitions(
  page: Page,
  options: { width?: number; height?: number; motion?: "no-preference" | "reduce" } = {},
) {
  await installProbe(page);
  await page.setViewportSize({ width: options.width ?? 1280, height: options.height ?? 900 });
  await openPlayground(page, options.motion ?? "no-preference");
  await page.getByTestId("studio-activate").click();
  await expect(page.getByTestId("studio-workspace")).toBeFocused();
  await expectStudioIdle(page);
}

const entries = (page: Page) => page.evaluate(() => window.snapMotionTransitions);

async function residue(page: Page) {
  return page.evaluate(() => ({
    names: document.querySelectorAll('[style*="view-transition-name"]').length,
    marks: Object.keys(document.documentElement.dataset).filter((key) => key.startsWith("studio")),
  }));
}

function duplicates(names: readonly string[]) {
  return names.filter((name, index) => names.indexOf(name) !== index);
}

test.describe("opening and leaving a candidate's detail", () => {
  test("is a real transition with the candidate's glyph as the shared element", async ({
    page,
  }) => {
    await openStudioForTransitions(page);
    await page.getByTestId("studio-open-rail-balanced").click();
    await expect(studio.detail(page)).toBeVisible();
    await expect.poll(async () => (await entries(page)).at(0)?.finished).toBe(true);
    const [opening] = await entries(page);

    // The browser's own transition, started once, and it became ready: it was not skipped.
    expect((await entries(page)).length).toBe(1);
    expect(opening!.ready).toBe(true);
    expect(opening!.readyError).toBeUndefined();
    // The old snapshot held the region and the clicked row's glyph, once each.
    expect(opening!.namedAtStart.toSorted()).toEqual(["studio-detail", "studio-glyph"]);
    expect(duplicates(opening!.namedAtStart)).toEqual([]);
    // The new one holds them once each too: the glyph's name moved to the detail's.
    expect(opening!.namedAfterUpdate.toSorted()).toEqual(["studio-detail", "studio-glyph"]);
    expect(duplicates(opening!.namedAfterUpdate)).toEqual([]);
    expect(opening!.dataset).toMatchObject({
      studioTransition: "detail",
      studioDirection: "forward",
    });
    // It ran animations on the shared element's own group, not merely on the page.
    expect(opening!.animations).toContain("::view-transition-group(studio-glyph)");
    expect(opening!.animations).toContain("::view-transition-new(studio-glyph)");
    expect(opening!.animations).toContain("::view-transition-old(studio-glyph)");

    // And the state it presented is the real one, with focus where a visitor expects it.
    await expect(page.getByTestId("studio-detail-name")).toBeFocused();
    expect(await residue(page)).toEqual({ names: 0, marks: [] });
  });

  test("the shared element visibly travels from the row to the detail", async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== "chromium",
      "Only Chromium reports a view-transition pseudo-element's computed geometry to the page",
    );
    await openStudioForTransitions(page);
    const source = await page
      .locator("[data-candidate-row='rail-balanced'] [data-shared-glyph]")
      .boundingBox();
    // Hold the transition at its start and at its end, and read where the glyph's group is drawn.
    const geometry = await page.evaluate(async () => {
      // oxlint-disable-next-line unicorn/consistent-function-scoping -- This helper must execute in the browser evaluation scope.
      const read = () => {
        const style = getComputedStyle(
          document.documentElement,
          "::view-transition-group(studio-glyph)",
        );
        return { width: parseFloat(style.width), height: parseFloat(style.height) };
      };
      const ready = new Promise<{
        start: { width: number; height: number };
        end: { width: number; height: number };
      }>((resolve) => {
        const original = document.startViewTransition.bind(document);
        document.startViewTransition = ((callback?: () => Promise<void> | void) => {
          const transition = original(callback);
          void (async () => {
            await transition.ready;
            const animations = document
              .getAnimations()
              .filter(
                (animation) =>
                  (animation.effect as KeyframeEffect).pseudoElement ===
                  "::view-transition-group(studio-glyph)",
              );
            for (const animation of animations) {
              animation.pause();
              animation.currentTime = 0;
            }
            const start = read();
            for (const animation of animations) {
              animation.currentTime = animation.effect!.getComputedTiming().endTime as number;
            }
            const end = read();
            for (const animation of animations) animation.play();
            resolve({ start, end });
          })();
          return transition;
        }) as typeof document.startViewTransition;
      });
      document.querySelector<HTMLElement>("[data-testid='studio-open-rail-balanced']")!.click();
      return ready;
    });
    const destination = (await page
      .locator("[data-testid='studio-detail'] [data-shared-glyph]")
      .boundingBox())!;
    // At its start the group is the row's glyph; at its end it is the detail's. They are different
    // boxes, so something really moved between them.
    expect(Math.abs(geometry.start.width - source!.width)).toBeLessThan(2);
    expect(Math.abs(geometry.end.width - destination.width)).toBeLessThan(2);
    expect(Math.abs(geometry.end.width - geometry.start.width)).toBeGreaterThan(20);
  });

  test("leaving the detail runs the transition back, and focus returns to the row", async ({
    page,
  }) => {
    await openStudioForTransitions(page);
    await page.getByTestId("studio-open-rail-balanced").click();
    await expect.poll(async () => (await entries(page)).at(0)?.finished).toBe(true);
    await page.getByTestId("studio-detail-back").click();
    await expect.poll(async () => (await entries(page)).at(1)?.finished).toBe(true);
    const [, leaving] = await entries(page);
    expect(leaving!.ready).toBe(true);
    expect(leaving!.dataset).toMatchObject({ studioDirection: "back" });
    expect(leaving!.namedAtStart.toSorted()).toEqual(["studio-detail", "studio-glyph"]);
    expect(leaving!.namedAfterUpdate.toSorted()).toEqual(["studio-detail", "studio-glyph"]);
    await expect(page.getByTestId("studio-open-rail-balanced")).toBeFocused();
    expect(await residue(page)).toEqual({ names: 0, marks: [] });
  });

  test("keeps the page where it was", async ({ page }) => {
    await openStudioForTransitions(page);
    await page
      .getByTestId("studio-open-rail-balanced")
      .evaluate((element) => element.scrollIntoView({ block: "center" }));
    const before = await scrollY(page);
    await page.getByTestId("studio-open-rail-balanced").click();
    await expect(studio.detail(page)).toBeVisible();
    await expect.poll(async () => (await entries(page)).at(0)?.finished).toBe(true);
    expect(Math.abs((await scrollY(page)) - before)).toBeLessThanOrEqual(1);
    await page.getByTestId("studio-detail-back").click();
    await expect(studio.detail(page)).toHaveCount(0);
    await expect.poll(async () => (await entries(page)).at(1)?.finished).toBe(true);
    expect(Math.abs((await scrollY(page)) - before)).toBeLessThanOrEqual(1);
  });
});

test.describe("moving between the views on a phone", () => {
  test("transitions the one region that changes, in the direction of travel", async ({ page }) => {
    await openStudioForTransitions(page, { width: 390, height: 844 });
    await page.getByTestId("studio-view-compare").click();
    await expect(studio.compare(page)).toBeVisible();
    await expect.poll(async () => (await entries(page)).at(0)?.finished).toBe(true);
    await page.getByTestId("studio-view-candidates").click();
    await expect(page.getByTestId("studio-candidate-list")).toBeVisible();
    await expect.poll(async () => (await entries(page)).at(1)?.finished).toBe(true);
    const [forward, back] = await entries(page);
    for (const entry of [forward!, back!]) {
      expect(entry.ready).toBe(true);
      expect(entry.namedAtStart).toEqual(["studio-view"]);
      expect(entry.namedAfterUpdate).toEqual(["studio-view"]);
      expect(entry.animations).toContain("::view-transition-group(studio-view)");
    }
    expect(forward!.dataset).toMatchObject({
      studioTransition: "view",
      studioDirection: "forward",
    });
    expect(back!.dataset).toMatchObject({ studioDirection: "back" });
    expect(await residue(page)).toEqual({ names: 0, marks: [] });
  });

  test("a rapid run of changes ends in the last state, leaving no name, mark or error behind", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error" || /\[Vue warn\]/.test(message.text()))
        errors.push(message.text());
    });
    await openStudioForTransitions(page, { width: 390, height: 844 });
    const compare = page.getByTestId("studio-view-compare");
    const candidates = page.getByTestId("studio-view-candidates");
    // Faster than any transition can finish.
    for (let round = 0; round < 3; round += 1) {
      await compare.click();
      await candidates.click();
    }
    await compare.click();
    await expect(compare).toHaveAttribute("aria-pressed", "true");
    await expect(studio.compare(page)).toBeVisible();
    await expect
      .poll(async () => (await entries(page)).every((entry) => entry.finished))
      .toBe(true);
    await expect.poll(async () => residue(page)).toEqual({ names: 0, marks: [] });
    // At no moment did one snapshot hold a name twice.
    for (const entry of await entries(page)) {
      expect(duplicates(entry.namedAtStart)).toEqual([]);
      expect(duplicates(entry.namedAfterUpdate)).toEqual([]);
    }
    // The Compare view is intact: two stages and a decision.
    await expect(page.getByTestId("studio-stage-a")).toBeVisible();
    await expect(page.getByTestId("studio-choose-a")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("a rapid open and close of a detail also settles, with focus on the row", async ({
    page,
  }) => {
    await openStudioForTransitions(page, { width: 390, height: 844 });
    const open = page.getByTestId("studio-open-deck-direct");
    await open.click();
    await page.getByTestId("studio-detail-back").click();
    await open.click();
    await page.getByTestId("studio-detail-back").click();
    await expect(page.getByTestId("studio-candidate-list")).toBeVisible();
    await expect(studio.detail(page)).toHaveCount(0);
    await expect
      .poll(async () => (await entries(page)).every((entry) => entry.finished))
      .toBe(true);
    await expect.poll(async () => residue(page)).toEqual({ names: 0, marks: [] });
    await expect(open).toBeFocused();
  });
});

test.describe("when a transition must not run", () => {
  test("without the API the Studio changes state exactly the same way", async ({ page }) => {
    await page.addInitScript(() => {
      // An engine without the API: not a stub, the property is simply absent.
      delete (Document.prototype as unknown as { startViewTransition?: unknown })
        .startViewTransition;
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await openPlayground(page, "no-preference");
    expect(await page.evaluate(() => typeof document.startViewTransition)).toBe("undefined");
    await page.getByTestId("studio-activate").click();
    await page.getByTestId("studio-view-compare").click();
    await expect(studio.compare(page)).toBeVisible();
    await page.getByTestId("studio-view-candidates").click();
    await page.getByTestId("studio-open-deck-direct").click();
    await expect(page.getByTestId("studio-detail-name")).toBeFocused();
    await page.getByTestId("studio-detail-back").click();
    await expect(page.getByTestId("studio-open-deck-direct")).toBeFocused();
    expect(await residue(page)).toEqual({ names: 0, marks: [] });
  });

  test("under reduced motion nothing is started, and the state still changes", async ({ page }) => {
    await openStudioForTransitions(page, { motion: "reduce" });
    await page.getByTestId("studio-open-rail-balanced").click();
    await expect(page.getByTestId("studio-detail-name")).toBeFocused();
    await page.getByTestId("studio-detail-back").click();
    await expect(page.getByTestId("studio-open-rail-balanced")).toBeFocused();
    expect(await entries(page)).toEqual([]);
  });

  test("never runs over a Deck exchange, a rail step or the Sheet", async ({ page }) => {
    await openStudioForTransitions(page);
    await page.getByTestId("studio-shortlist-rail-balanced").click();
    await expect(studio.deck(page)).toHaveAttribute("data-deck-state", "deck");
    await page.getByTestId("studio-deck-next").click();
    await expect(studio.deck(page)).toHaveAttribute("data-phase", "idle", { timeout: 8_000 });
    await page.getByTestId("studio-driver-next").click();
    await page.getByTestId("studio-shortlist-rail-balanced").click();
    await page.getByTestId("studio-choose-a").click();
    await page.getByTestId("studio-open-implementation").click();
    await expect(studio.sheet(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(studio.sheet(page)).not.toBeVisible();
    expect(await entries(page)).toEqual([]);
  });
});
