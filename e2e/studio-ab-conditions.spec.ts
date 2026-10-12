import { expect, test, type Locator, type Page } from "@playwright/test";

import { dragMouseBy } from "./helpers";
import { nameOf, openStudio, shortlistCandidate, studio } from "./studioHelpers";

/**
 * The conditions of an A/B comparison: both stages are on the same screen when a run begins, a
 * change of role cannot silently leave one of them behind, a replay always begins from the same
 * defined position, and nothing a replay scheduled outlives the thing that invalidated it.
 *
 * Every assertion reads the surfaces' own published state (`data-visual-id`, `data-settled-id`,
 * `data-phase`) rather than a timer, so each holds at any frame rate.
 */

const collectedErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  collectedErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" || /\[Vue warn\]/.test(message.text()))
      errors.push(`${message.type()}: ${message.text()}`);
  });
});

test.afterEach(async ({ page }) => {
  expect(collectedErrors.get(page) ?? []).toEqual([]);
});

interface StageState {
  phase: string | null;
  settled: string | null;
  visual: string | null;
}

type Stage = "reference" | "candidate";

const surface = (page: Page, stage: Stage): Locator => page.getByTestId(`studio-${stage}-surface`);

async function stateOf(page: Page, stage: Stage): Promise<StageState> {
  return surface(page, stage).evaluate((node) => ({
    phase: node.getAttribute("data-phase"),
    settled: node.getAttribute("data-settled-id"),
    visual: node.getAttribute("data-visual-id"),
  }));
}

async function both(page: Page) {
  return { a: await stateOf(page, "reference"), b: await stateOf(page, "candidate") };
}

/** Both stages at rest on one and the same screen, and nothing still travelling toward another. */
async function expectLevelAtRest(page: Page): Promise<string> {
  await expect
    .poll(async () => {
      const { a, b } = await both(page);
      return (
        a.phase === "idle" &&
        b.phase === "idle" &&
        a.settled === b.settled &&
        a.visual === a.settled &&
        b.visual === b.settled
      );
    })
    .toBe(true);
  return (await stateOf(page, "reference")).settled!;
}

/** Both stages at rest, wherever they are. */
async function expectBothAtRest(page: Page) {
  await expect
    .poll(async () => {
      const { a, b } = await both(page);
      return a.phase === "idle" && b.phase === "idle";
    })
    .toBe(true);
}

interface Frame {
  aPhase: string | null;
  aSettled: string | null;
  aVisual: string | null;
  /** Which element stood for B in this frame, so a remount is visible as a new number. */
  bElement: number;
  bPhase: string | null;
  bSettled: string | null;
  bVisual: string | null;
  note: string;
}

/** Samples both stages every animation frame until stopped. */
async function startFrames(page: Page) {
  await page.evaluate(() => {
    const identities = new WeakMap<Element, number>();
    let elements = 0;
    const frames: Frame[] = [];
    const state = { running: true, frames };
    // oxlint-disable-next-line unicorn/consistent-function-scoping -- runs in the page, so it cannot be hoisted out of this callback
    const attr = (node: Element | null, name: string) => node?.getAttribute(name) ?? null;
    const sample = () => {
      if (!state.running) return;
      const a = document.querySelector('[data-testid="studio-reference-surface"]');
      const b = document.querySelector('[data-testid="studio-candidate-surface"]');
      if (b !== null && !identities.has(b)) {
        elements += 1;
        identities.set(b, elements);
      }
      frames.push({
        aPhase: attr(a, "data-phase"),
        aSettled: attr(a, "data-settled-id"),
        aVisual: attr(a, "data-visual-id"),
        bElement: b === null ? 0 : identities.get(b)!,
        bPhase: attr(b, "data-phase"),
        bSettled: attr(b, "data-settled-id"),
        bVisual: attr(b, "data-visual-id"),
        note:
          document.querySelector('[data-testid="studio-driver-note"]')?.textContent?.trim() ?? "",
      });
      requestAnimationFrame(sample);
    };
    (window as unknown as { snapMotionFrames: typeof state }).snapMotionFrames = state;
    sample();
  });
}

async function stopFrames(page: Page): Promise<Frame[]> {
  return page.evaluate(() => {
    const state = (
      window as unknown as { snapMotionFrames: { running: boolean; frames: unknown[] } }
    ).snapMotionFrames;
    state.running = false;
    return state.frames as never;
  });
}

/**
 * The run starts only after both stages came to rest on the defined screen: in the first frame that
 * reports it, both are on that screen. And no stage ever jumps: a surface's durable selection
 * changes only after the card has visually arrived, so a frame in which the selection changes
 * while the card in front did not already match it is a snap, not a spring.
 */
function expectRunBeganAtRest(frames: Frame[], home: string) {
  const first = frames.findIndex(({ note }) => note.startsWith("Replaying"));
  expect(first).toBeGreaterThan(0);
  expect(frames[first]).toMatchObject({ aSettled: home, bSettled: home });
  expectNoSnap(frames);
}

function expectNoSnap(frames: Frame[]) {
  const snaps = frames.flatMap((frame, index) => {
    const before = frames[index - 1];
    if (before === undefined) return [];
    const found: string[] = [];
    if (frame.aSettled !== before.aSettled && before.aVisual !== frame.aSettled)
      found.push(`A selected ${frame.aSettled} from ${before.aVisual} in one frame`);
    if (
      frame.bElement === before.bElement &&
      frame.bSettled !== before.bSettled &&
      before.bVisual !== frame.bSettled
    )
      found.push(`B selected ${frame.bSettled} from ${before.bVisual} in one frame`);
    return found;
  });
  expect(snaps).toEqual([]);
}

/** The frames in which the second element stood for B: B as the visitor first met it. */
function frameSpan(frames: Frame[], element: number) {
  const span = frames.filter((frame) => frame.bElement === element);
  return { first: span[0], visuals: [...new Set(span.map(({ bVisual }) => bVisual))] };
}

async function withDeck(page: Page) {
  await shortlistCandidate(page, "rail-balanced");
  await expect(studio.deck(page)).toHaveAttribute("data-deck-state", "deck");
}

async function setB(page: Page, id: Parameters<typeof nameOf>[0]) {
  await page.getByTestId(`studio-compare-${id}`).click();
  await expect(studio.bName(page)).toHaveText(nameOf(id));
}

test.describe("a change of role keeps the stages level", () => {
  test("changing B after the stages were stepped lands B on A's screen", async ({ page }) => {
    await openStudio(page);
    await withDeck(page);
    const home = await expectLevelAtRest(page);
    await page.getByTestId("studio-driver-next").click();
    await page.getByTestId("studio-driver-next").click();
    const stepped = await expectLevelAtRest(page);
    expect(stepped).not.toBe(home);

    await setB(page, "rail-balanced");
    expect(await expectLevelAtRest(page)).toBe(stepped);
    await setB(page, "rail-loose");
    expect(await expectLevelAtRest(page)).toBe(stepped);
  });

  test("changing B while A's spring is unfinished lands B where A is going, and B never travels", async ({
    page,
  }) => {
    await openStudio(page, { reducedMotion: "no-preference" });
    await withDeck(page);
    const home = await expectLevelAtRest(page);

    await startFrames(page);
    await page.getByTestId("studio-driver-next").click();
    await page.getByTestId("studio-compare-rail-balanced").click();
    await expect(studio.bName(page)).toHaveText(nameOf("rail-balanced"));
    const target = await expectLevelAtRest(page);
    const frames = await stopFrames(page);

    expect(target).not.toBe(home);
    const mounted = Math.max(...frames.map(({ bElement }) => bElement));
    expect(mounted).toBeGreaterThan(1);
    const { first, visuals } = frameSpan(frames, mounted);
    // A was still on its way when B arrived, and B arrived on the screen A was going to...
    expect(first!.aPhase).not.toBe("idle");
    expect(visuals).toEqual([target]);
  });

  test("pinning a new A while B is mid-spring lands A where B is going and leaves B alone", async ({
    page,
  }) => {
    await openStudio(page, { reducedMotion: "no-preference" });
    await withDeck(page);
    const before = await expectLevelAtRest(page);
    const keptB = await surface(page, "candidate").elementHandle();

    await page.getByTestId("studio-driver-next").click();
    await page.getByTestId("studio-pin-rail-balanced").click();
    await expect(studio.aName(page)).toHaveText(nameOf("rail-balanced"));
    const target = await expectLevelAtRest(page);

    expect(target).not.toBe(before);
    // B was not remounted by the change of A.
    expect(await keptB!.evaluate((node) => node.isConnected)).toBe(true);
    await expect(studio.bName(page)).toHaveText(nameOf("rail-loose"));
  });

  test("swapping the roles keeps both stages on one screen, before and after the swap", async ({
    page,
  }) => {
    await openStudio(page);
    await withDeck(page);
    await page.getByTestId("studio-driver-next").click();
    const stepped = await expectLevelAtRest(page);

    await page.getByTestId("studio-swap").click();
    await expect(studio.aName(page)).toHaveText(nameOf("rail-loose"));
    await expect(studio.bName(page)).toHaveText(nameOf("rail-tight"));
    expect(await expectLevelAtRest(page)).toBe(stepped);
    await expect(page.getByTestId("studio-stages-apart")).toHaveCount(0);

    // A run from there moves both by the same step.
    await page.getByTestId("studio-driver-next").click();
    const next = await expectLevelAtRest(page);
    expect(next).not.toBe(stepped);
  });

  test("on a phone, choosing B from the comparison keeps the stages level", async ({ page }) => {
    await openStudio(page, { width: 390, height: 844 });
    await shortlistCandidate(page, "rail-balanced");
    await page.getByTestId("studio-view-compare").click();
    await expect(studio.deck(page)).toHaveAttribute("data-deck-state", "deck");
    await page.getByTestId("studio-driver-next").click();
    const stepped = await expectLevelAtRest(page);
    await setB(page, "rail-balanced");
    expect(await expectLevelAtRest(page)).toBe(stepped);
  });
});

test.describe("a replay always begins from the same place", () => {
  test("from a disturbed state both stages return to the defined screen, then run, and repeat", async ({
    page,
  }) => {
    await openStudio(page, { reducedMotion: "no-preference" });
    const home = await expectLevelAtRest(page);
    const replay = page.getByTestId("studio-driver-replay");

    const ends: string[] = [];
    for (const disturb of ["drag", "step", "none"] as const) {
      if (disturb === "drag") {
        await dragMouseBy(page, surface(page, "reference"), -260, 0);
        await expectBothAtRest(page);
        await expect(page.getByTestId("studio-stages-apart")).toBeVisible();
      } else if (disturb === "step") {
        await page.getByTestId("studio-driver-next").click();
        await page.getByTestId("studio-driver-next").click();
        await expectBothAtRest(page);
      }
      await startFrames(page);
      await replay.click();
      await expect(replay).toHaveAttribute("aria-pressed", "true");
      await expect(replay).toHaveAttribute("aria-pressed", "false");
      ends.push(await expectLevelAtRest(page));
      expectRunBeganAtRest(await stopFrames(page), home);
    }
    // Forward twice, back once, forward once, whatever came before.
    expect(new Set(ends).size).toBe(1);
    expect(ends[0]).not.toBe(home);
  });

  test("a replay started while the springs are still moving waits for them", async ({ page }) => {
    await openStudio(page, { reducedMotion: "no-preference" });
    const home = await expectLevelAtRest(page);

    await startFrames(page);
    await page.getByTestId("studio-driver-next").click();
    await page.getByTestId("studio-driver-next").click();
    await page.getByTestId("studio-driver-replay").click();
    await expect(page.getByTestId("studio-driver-replay")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("studio-driver-replay")).toHaveAttribute("aria-pressed", "false");
    const end = await expectLevelAtRest(page);
    const frames = await stopFrames(page);

    expect(end).not.toBe(home);
    const notes = new Set(frames.map(({ note }) => note.split(" ")[0]));
    expect(notes).toContain("Returning");
    expectRunBeganAtRest(frames, home);
  });

  test("a drag while the stages are returning ends the replay before it starts", async ({
    page,
  }) => {
    await openStudio(page, { reducedMotion: "no-preference" });
    const home = await expectLevelAtRest(page);
    await page.getByTestId("studio-driver-next").click();
    await page.getByTestId("studio-driver-next").click();
    const replay = page.getByTestId("studio-driver-replay");
    await replay.click();
    await expect(page.getByTestId("studio-driver-note")).toContainText("Returning");
    await dragMouseBy(page, surface(page, "reference"), -200, 0);
    await expect(replay).toHaveAttribute("aria-pressed", "false");
    await expectBothAtRest(page);
    // B was never driven by the replay it was part of: it came home and stayed.
    const { b } = await both(page);
    expect(b.settled).toBe(home);
  });
});

/**
 * The replay tests run on a paused clock that is advanced by hand, so what a replay has scheduled
 * and what has been delivered is exact rather than a matter of how long Playwright took to act.
 */
async function advanceUntil(page: Page, done: () => Promise<boolean>) {
  await expect
    .poll(async () => {
      await page.clock.runFor(50);
      return done();
    })
    .toBe(true);
}

async function bShows(page: Page, id: Parameters<typeof nameOf>[0]) {
  await advanceUntil(page, async () => (await studio.bName(page).textContent()) === nameOf(id));
}

async function atRest(page: Page) {
  await advanceUntil(page, async () => {
    const { a, b } = await both(page);
    return a.phase === "idle" && b.phase === "idle";
  });
}

test.describe("nothing a replay scheduled outlives what invalidated it", () => {
  const interruptions: {
    name: string;
    act: (page: Page) => Promise<void>;
    needsDeck: boolean;
  }[] = [
    {
      name: "changing B",
      needsDeck: true,
      act: async (page) => {
        await page.getByTestId("studio-compare-rail-balanced").click();
        await bShows(page, "rail-balanced");
      },
    },
    {
      name: "pinning a new A",
      needsDeck: true,
      act: async (page) => {
        await page.getByTestId("studio-pin-rail-balanced").click();
        await expect(studio.aName(page)).toHaveText(nameOf("rail-balanced"));
      },
    },
    {
      name: "swapping the roles",
      needsDeck: false,
      act: async (page) => {
        await page.getByTestId("studio-swap").click();
        await expect(studio.aName(page)).toHaveText(nameOf("rail-loose"));
      },
    },
    {
      name: "a drag on A",
      needsDeck: false,
      act: async (page) => {
        await dragMouseBy(page, surface(page, "reference"), -220, 0);
      },
    },
    {
      name: "a drag on B",
      needsDeck: false,
      act: async (page) => {
        await dragMouseBy(page, surface(page, "candidate"), 220, 0);
      },
    },
    {
      name: "an arrow key on B",
      needsDeck: false,
      act: async (page) => {
        await surface(page, "candidate").focus();
        await page.keyboard.press("ArrowRight");
      },
    },
  ];

  for (const { act, name, needsDeck } of interruptions) {
    test(`${name} during a replay leaves no step waiting`, async ({ page }) => {
      await page.clock.install();
      await openStudio(page);
      if (needsDeck) await withDeck(page);
      await expectBothAtRest(page);
      await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 50);

      const replay = page.getByTestId("studio-driver-replay");
      await replay.click();
      await expect(replay).toHaveAttribute("aria-pressed", "true");
      // Far enough in for a step to have landed and the next to be waiting.
      await page.clock.runFor(450);
      await atRest(page);

      await act(page);
      await expect(replay).toHaveAttribute("aria-pressed", "false");
      await atRest(page);
      const settledThen = await both(page);

      // The rest of the run would have delivered two more steps in this time.
      await page.clock.runFor(5_000);
      await atRest(page);
      expect(await both(page)).toEqual(settledThen);
    });
  }
});

test.describe("independent exploration stays possible and is never silent", () => {
  test("dragging one stage says the stages are apart, and one control puts them back", async ({
    page,
  }) => {
    await openStudio(page);
    const home = await expectLevelAtRest(page);
    const apart = page.getByTestId("studio-stages-apart");
    await expect(apart).toHaveCount(0);

    await dragMouseBy(page, surface(page, "reference"), -260, 0);
    await expectBothAtRest(page);
    const { a, b } = await both(page);
    expect(a.settled).not.toBe(b.settled);
    expect(b.settled).toBe(home);

    await expect(apart).toBeVisible();
    await expect(page.getByTestId("studio-driver-note")).toContainText("different screens");
    await expect(studio.status(page)).toContainText("A is on");
    const realign = page.getByTestId("studio-realign");
    await expect(realign).toBeVisible();

    // It is an ordinary button: the keyboard reaches it and activates it.
    await realign.focus();
    await page.keyboard.press("Enter");
    expect(await expectLevelAtRest(page)).toBe(home);
    await expect(apart).toHaveCount(0);
  });

  test("the notice follows the stages, not the last input: stepping A back by hand clears it", async ({
    page,
  }) => {
    await openStudio(page);
    await expectLevelAtRest(page);
    await surface(page, "reference").focus();
    await page.keyboard.press("ArrowRight");
    await expectBothAtRest(page);
    const apart = page.getByTestId("studio-stages-apart");
    await expect(apart).toBeVisible();
    await page.keyboard.press("ArrowLeft");
    await expectBothAtRest(page);
    await expect(apart).toHaveCount(0);
  });

  test("a deck wraps where a rail ends, and the stages say so instead of pretending", async ({
    page,
  }) => {
    await openStudio(page);
    await shortlistCandidate(page, "deck-shuffle");
    await page.getByTestId("studio-compare-deck-shuffle").click();
    await expect(studio.bName(page)).toHaveText(nameOf("deck-shuffle"));
    await expectLevelAtRest(page);
    for (let press = 0; press < 3; press += 1) {
      await page.getByTestId("studio-driver-next").click();
      await expectBothAtRest(page);
    }
    // The rail stopped at its last screen; the deck went around to its first.
    const { a, b } = await both(page);
    expect(a.settled).not.toBe(b.settled);
    await expect(page.getByTestId("studio-stages-apart")).toBeVisible();
    await page.getByTestId("studio-realign").click();
    await expectLevelAtRest(page);
  });

  test("the notice fits a phone and is reachable there", async ({ page }) => {
    await openStudio(page, { width: 390, height: 844 });
    await page.getByTestId("studio-view-compare").click();
    await expectLevelAtRest(page);
    await dragMouseBy(page, surface(page, "reference"), -200, 0);
    await expectBothAtRest(page);
    const apart = page.getByTestId("studio-stages-apart");
    await expect(apart).toBeVisible();
    const box = (await apart.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    const button = (await page.getByTestId("studio-realign").boundingBox())!;
    expect(button.height).toBeGreaterThanOrEqual(44);
    await page.getByTestId("studio-realign").click();
    await expectLevelAtRest(page);
  });
});
