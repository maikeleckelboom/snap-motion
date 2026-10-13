import { expect, test, type CDPSession, type Page } from "@playwright/test";

import {
  aspectRatio,
  sharedMediaData,
} from "../apps/lab/src/playground/studio/media/shared-media-data";
import { openPlayground, scrollY } from "./playgroundHelpers";
import { centreOnScreen, expectStudioIdle, openStudio } from "./studioHelpers";

/**
 * Chromium-only evidence for the item carousel: a real touch device (swipes and taps dispatched as
 * touch input, not as mouse events), a stage that is resized under a running strip, and the native
 * View Transition between a photo and its viewer.
 */

const surface = (page: Page, role: "reference" | "candidate" = "reference") =>
  page.getByTestId(`studio-${role}-surface`);
const viewer = (page: Page) => page.getByTestId("studio-media-viewer");
const titleOf = (id: string) => sharedMediaData.find((item) => item.id === id)!.title;
const selected = async (page: Page, role: "reference" | "candidate" = "reference") =>
  (await surface(page, role).getAttribute("data-active-id"))!;

async function itemBox(page: Page, id: string, role: "reference" | "candidate" = "reference") {
  return (await surface(page, role).locator(`[data-media-id="${id}"]`).boundingBox())!;
}

const fingers = new WeakMap<Page, CDPSession>();

/** One protocol session per page: a finger is dispatched through it, never through a fresh one. */
async function finger(page: Page) {
  let session = fingers.get(page);
  if (!session) {
    session = await page.context().newCDPSession(page);
    fingers.set(page, session);
  }
  return session;
}

/** A finger: real touch input through the protocol, with the pace of a hand. */
async function swipe(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  steps = 10,
) {
  const cdp = await finger(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: from.x, y: from.y }],
  });
  for (let step = 1; step <= steps; step += 1) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        {
          x: from.x + ((to.x - from.x) * step) / steps,
          y: from.y + ((to.y - from.y) * step) / steps,
        },
      ],
    });
    await page.waitForTimeout(16);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

async function centreOf(page: Page, role: "reference" | "candidate" = "reference") {
  // Centred, not merely in view (at an edge it can sit under the sticky navigation), and still.
  await centreOnScreen(page, surface(page, role));
  const box = (await surface(page, role).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, box };
}

test.describe("on a touch phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  async function phone(page: Page) {
    await finger(page);
    await openStudio(page, { width: 390, height: 844, reducedMotion: "no-preference" });
    await page.getByTestId("studio-view-compare").click();
    await expect(surface(page)).toHaveAttribute("data-phase", "idle");
    // Changing view is a native View Transition, which holds the page still while it runs: a touch
    // that lands during it is cancelled by the browser, as for any page. Wait for it to end.
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.studioTransition ?? ""))
      .toBe("");
  }

  test("a swipe moves the strip and flicks past a photo, and opens nothing", async ({ page }) => {
    await phone(page);
    const before = await selected(page);
    const { x, y, box } = await centreOf(page);
    await swipe(page, { x: x + box.width * 0.3, y }, { x: x - box.width * 0.3, y }, 8);
    await expect(surface(page)).toHaveAttribute("data-phase", "idle", { timeout: 8_000 });
    expect(await selected(page)).not.toBe(before);
    await expect(viewer(page)).not.toBeVisible();
    // It ended centred on a photo, not between two.
    const current = await itemBox(page, await selected(page));
    expect(Math.abs(current.x + current.width / 2 - (box.x + box.width / 2))).toBeLessThanOrEqual(
      1,
    );
  });

  test("a swipe the other way returns, and a short drag settles back where it was", async ({
    page,
  }) => {
    await phone(page);
    const start = await selected(page);
    const { x, y } = await centreOf(page);
    await swipe(page, { x: x + 80, y }, { x: x - 80, y }, 8);
    await expect(surface(page)).toHaveAttribute("data-phase", "idle", { timeout: 8_000 });
    expect(await selected(page)).not.toBe(start);
    await swipe(page, { x: x - 80, y }, { x: x + 80, y }, 8);
    await expect(surface(page)).toHaveAttribute("data-phase", "idle", { timeout: 8_000 });
    expect(await selected(page)).toBe(start);
    // A nudge that does not reach the next photo springs back to the one it began on.
    await swipe(page, { x, y }, { x: x - 12, y }, 4);
    await expect(surface(page)).toHaveAttribute("data-phase", "idle", { timeout: 8_000 });
    expect(await selected(page)).toBe(start);
  });

  test("a vertical swipe on the strip scrolls the page and does not turn the strip", async ({
    page,
  }) => {
    await phone(page);
    const before = await selected(page);
    const y0 = await scrollY(page);
    const { x, y } = await centreOf(page);
    await swipe(page, { x, y: Math.min(y + 160, 800) }, { x, y: Math.max(y - 140, 40) }, 10);
    await page.waitForTimeout(300);
    expect(await selected(page)).toBe(before);
    expect(await scrollY(page)).toBeGreaterThan(y0);
    await expect(viewer(page)).not.toBeVisible();
  });

  test("a tap on a partly visible neighbour opens it", async ({ page }) => {
    await phone(page);
    const current = await selected(page);
    const ids = sharedMediaData.map(({ id }) => id);
    const next = ids[ids.indexOf(current) + 1]!;
    await centreOf(page);
    const strip = (await surface(page).boundingBox())!;
    const item = await itemBox(page, next);
    const left = Math.max(item.x, strip.x);
    const right = Math.min(item.x + item.width, strip.x + strip.width);
    await page.touchscreen.tap((left + right) / 2, strip.y + strip.height / 2);
    await expect(viewer(page)).toBeVisible();
    await expect(page.getByTestId("studio-media-title")).toHaveText(titleOf(next));
    await expect(surface(page)).toHaveAttribute("data-active-id", next);
    await page.getByRole("button", { name: "Close photo" }).click();
    await expect(viewer(page)).not.toBeVisible();
    await expect(surface(page)).toHaveAttribute("data-phase", "idle", { timeout: 8_000 });
  });

  test("a tap is not a swipe: after one, the very next tap still opens", async ({ page }) => {
    await phone(page);
    const { x, y, box } = await centreOf(page);
    await swipe(page, { x: x + box.width * 0.3, y }, { x: x - box.width * 0.3, y }, 8);
    await expect(surface(page)).toHaveAttribute("data-phase", "idle", { timeout: 8_000 });
    await expect(viewer(page)).not.toBeVisible();
    const current = await itemBox(page, await selected(page));
    await page.touchscreen.tap(current.x + current.width / 2, current.y + current.height / 2);
    await expect(viewer(page)).toBeVisible();
  });

  test("every control is a finger's size and nothing overflows the page sideways", async ({
    page,
  }) => {
    await phone(page);
    for (const id of [
      "studio-reference-previous",
      "studio-reference-next",
      "studio-reference-open",
    ]) {
      const box = (await page.getByTestId(id).boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });

  test("on a phone B can be a stacked deck as well, and the same swipe turns it", async ({
    page,
  }) => {
    await phone(page);
    await page.getByTestId("tune-surface-deck").tap();
    await expect(page.getByTestId("studio-preview-candidate")).toHaveAttribute(
      "data-surface",
      "deck",
    );
    await expect(surface(page, "candidate")).toHaveAttribute("data-phase", "idle");
    const before = await selected(page, "candidate");
    const { x, y } = await centreOf(page, "candidate");
    await swipe(page, { x: x + 90, y }, { x: x - 90, y }, 8);
    await expect(surface(page, "candidate")).toHaveAttribute("data-phase", "idle", {
      timeout: 8_000,
    });
    expect(await selected(page, "candidate")).not.toBe(before);
    await expect(viewer(page)).not.toBeVisible();
  });
});

test.describe("variable widths and remeasurement", () => {
  test("every item's width follows its own shape, until the next photo's peek caps it", async ({
    page,
  }) => {
    await openStudio(page);
    const widths = await surface(page).evaluate((element) =>
      [...element.querySelectorAll<HTMLElement>("[data-media-id]")].map((item) => ({
        id: item.dataset.mediaId!,
        width: item.getBoundingClientRect().width,
        height: item.getBoundingClientRect().height,
        cap: element.getBoundingClientRect().width * 0.58,
      })),
    );
    for (const item of widths) {
      const aspect = aspectRatio(sharedMediaData.find(({ id }) => id === item.id)!);
      const natural = item.height * aspect;
      // Either the item is exactly its shape, or it was held to the cap or the floor.
      const capped = natural > item.cap + 1 || item.width <= 64.5;
      if (!capped) expect(Math.abs(item.width - natural)).toBeLessThanOrEqual(1.5);
      else expect(item.width).toBeLessThanOrEqual(Math.max(item.cap, 64) + 1);
    }
    expect(new Set(widths.map(({ width }) => Math.round(width))).size).toBeGreaterThanOrEqual(5);
  });

  test("resizing the stage remeasures: the selected photo stays centred and steps land centred", async ({
    page,
  }) => {
    await openStudio(page, { width: 1440, height: 900 });
    const centred = async () => {
      const box = (await surface(page).boundingBox())!;
      const item = await itemBox(page, await selected(page));
      return Math.abs(item.x + item.width / 2 - (box.x + box.width / 2));
    };
    await surface(page).focus();
    await page.keyboard.press("ArrowRight");
    await expect(surface(page)).toHaveAttribute("data-phase", "idle");
    await expect.poll(centred).toBeLessThanOrEqual(1);
    const before = (await itemBox(page, await selected(page))).width;

    for (const width of [1100, 1000, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await expect.poll(centred, { timeout: 4_000 }).toBeLessThanOrEqual(1);
      await expect(surface(page)).toHaveAttribute("data-phase", "idle");
    }
    // The items really were laid out again at each width, not merely moved.
    const after = (await itemBox(page, await selected(page))).width;
    expect(Math.abs(after - before)).toBeGreaterThan(1);

    // And the anchors are the new ones: stepping lands the next photo in the middle too.
    await page.getByTestId("studio-reference-next").click();
    await expect(surface(page)).toHaveAttribute("data-phase", "idle", { timeout: 8_000 });
    await expect.poll(centred).toBeLessThanOrEqual(1);
  });

  test("a resize while the strip is travelling retargets the same photo", async ({ page }) => {
    await openStudio(page, { width: 1280, height: 900, reducedMotion: "no-preference" });
    await expect(surface(page, "candidate")).toHaveAttribute("data-phase", "idle");
    const start = await selected(page, "candidate");
    const ids = sharedMediaData.map(({ id }) => id);
    await page.getByTestId("studio-candidate-next").click();
    await expect(surface(page, "candidate")).not.toHaveAttribute("data-phase", "idle");
    await page.setViewportSize({ width: 1060, height: 900 });
    await expect(surface(page, "candidate")).toHaveAttribute("data-phase", "idle", {
      timeout: 8_000,
    });
    expect(await selected(page, "candidate")).toBe(ids[ids.indexOf(start) + 1]);
    const box = (await surface(page, "candidate").boundingBox())!;
    const item = await itemBox(page, await selected(page, "candidate"), "candidate");
    expect(Math.abs(item.x + item.width / 2 - (box.x + box.width / 2))).toBeLessThanOrEqual(1);
  });
});

// -------------------------------------------------------------------------- View Transitions

interface Probe {
  namedAtStart: string[];
  namedAfterUpdate: string[];
  ready?: boolean;
  animations: string[];
  finished?: boolean;
}

declare global {
  interface Window {
    snapMotionPhotoTransitions: Probe[];
  }
}

async function probe(page: Page) {
  await page.addInitScript(() => {
    window.snapMotionPhotoTransitions = [];
    const original = document.startViewTransition?.bind(document);
    if (!original) return;
    // oxlint-disable-next-line unicorn/consistent-function-scoping -- This helper must execute in the browser's init-script scope.
    const names = () =>
      [...document.querySelectorAll<HTMLElement>("*")]
        .map((element) => element.style.getPropertyValue("view-transition-name"))
        .filter((name) => name !== "");
    document.startViewTransition = ((callback?: () => Promise<void> | void) => {
      const entry: Probe = { namedAtStart: names(), namedAfterUpdate: [], animations: [] };
      window.snapMotionPhotoTransitions.push(entry);
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
        } catch {
          entry.ready = false;
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

const transitions = (page: Page) => page.evaluate(() => window.snapMotionPhotoTransitions);

async function openForTransitions(page: Page, motion: "no-preference" | "reduce") {
  await probe(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await openPlayground(page, motion);
  await page.getByTestId("studio-activate").click();
  await expect(page.getByTestId("studio-workspace")).toBeFocused();
  await expectStudioIdle(page);
}

test.describe("opening a photo from its thumbnail", () => {
  test("is a native View Transition with the photo as the shared element, going and returning", async ({
    page,
  }) => {
    await openForTransitions(page, "no-preference");
    const id = await selected(page);
    const box = await itemBox(page, id);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(viewer(page)).toBeVisible();
    await expect.poll(async () => (await transitions(page)).at(0)?.finished).toBe(true);

    const [opening] = await transitions(page);
    expect(opening!.ready).toBe(true);
    // Old snapshot: the thumbnail's picture, once. New snapshot: the viewer's, once. Never both.
    expect(opening!.namedAtStart).toEqual(["studio-photo"]);
    expect(opening!.namedAfterUpdate).toEqual(["studio-photo"]);
    expect(opening!.animations).toContain("::view-transition-group(studio-photo)");

    await page.getByRole("button", { name: "Close photo" }).click();
    await expect(viewer(page)).not.toBeVisible();
    await expect.poll(async () => (await transitions(page)).at(1)?.finished).toBe(true);
    const [, closing] = await transitions(page);
    expect(closing!.ready).toBe(true);
    expect(closing!.namedAtStart).toEqual(["studio-photo"]);
    expect(closing!.namedAfterUpdate).toEqual(["studio-photo"]);
    // Nothing is left named once it is over, so the page's stacking is as it was.
    await expect.poll(() => page.locator('[style*="view-transition-name"]').count()).toBe(0);
    await expect(surface(page)).toBeFocused();
  });

  test("never over a photo that has to travel: a tap on a neighbour opens with no transition", async ({
    page,
  }) => {
    await openForTransitions(page, "no-preference");
    const current = await selected(page);
    const ids = sharedMediaData.map(({ id }) => id);
    const next = ids[ids.indexOf(current) + 1]!;
    const strip = (await surface(page).boundingBox())!;
    const box = await itemBox(page, next);
    const left = Math.max(box.x, strip.x);
    const right = Math.min(box.x + box.width, strip.x + strip.width);
    await page.mouse.click((left + right) / 2, strip.y + strip.height / 2);
    await expect(viewer(page)).toBeVisible();
    await expect(page.getByTestId("studio-media-title")).toHaveText(titleOf(next));
    expect(await transitions(page)).toEqual([]);
    // The strip is travelling behind the modal, and no snapshot has replaced it.
    await expect(surface(page)).toHaveAttribute("data-active-id", next);
  });

  test("never over a strip that is still moving", async ({ page }) => {
    await openForTransitions(page, "no-preference");
    await page.getByTestId("studio-candidate-next").click();
    await expect(surface(page, "candidate")).not.toHaveAttribute("data-phase", "idle");
    await page.getByTestId("studio-candidate-open").click();
    await expect(viewer(page)).toBeVisible();
    expect(await transitions(page)).toEqual([]);
  });

  test("and it closes plainly when the thumbnail it left is no longer at rest", async ({
    page,
  }) => {
    await openForTransitions(page, "no-preference");
    await page.getByTestId("studio-candidate-open").click();
    await expect(viewer(page)).toBeVisible();
    await expect.poll(async () => (await transitions(page)).at(0)?.finished).toBe(true);
    // Nothing in the page can change behind a native modal, so the thumbnail is still at rest and the
    // return is a transition; what matters is that it is a pair of snapshots of one named element.
    await page.keyboard.press("Escape");
    await expect(viewer(page)).not.toBeVisible();
    await expect.poll(async () => (await transitions(page)).length).toBeGreaterThanOrEqual(2);
    await expect.poll(() => page.locator('[style*="view-transition-name"]').count()).toBe(0);
  });

  test("under reduced motion it opens and closes with no transition at all", async ({ page }) => {
    await openForTransitions(page, "reduce");
    const box = await itemBox(page, await selected(page));
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(viewer(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(viewer(page)).not.toBeVisible();
    expect(await transitions(page)).toEqual([]);
  });

  test("a stacked deck's front photo opens the same way", async ({ page }) => {
    await openForTransitions(page, "no-preference");
    await page.getByTestId("tune-surface-deck").click();
    await expect(surface(page, "candidate")).toHaveAttribute("data-phase", "idle");
    const before = (await transitions(page)).length;
    const front = surface(page, "candidate").locator("[data-visual='true']");
    await front.click();
    await expect(viewer(page)).toBeVisible();
    await expect(page.getByTestId("studio-media-title")).toHaveText(
      titleOf(await selected(page, "candidate")),
    );
    await expect.poll(async () => (await transitions(page)).length).toBeGreaterThan(before);
    const entry = (await transitions(page)).at(-1)!;
    expect(entry.namedAtStart).toEqual(["studio-photo"]);
  });
});
