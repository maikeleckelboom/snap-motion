import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve as resolvePath } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { expectCarouselAt, openLabDemo, type ReducedMotionMode } from "./helpers";
import {
  STACKED_DECK_IDS,
  beginPointerAt,
  finishPointerBy,
  motionPitch,
  movePointerBy,
  pagination,
  viewport,
  waitForAuthority,
} from "./stackedDeckHarness";

async function nextFrame(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
}

async function prepareDirect(
  page: Page,
  index = 3,
  reducedMotion: ReducedMotionMode = "no-preference",
) {
  await openLabDemo(page, "stacked-deck", reducedMotion);
  const directControl = page.getByTestId("stacked-deck-exchange-direct");
  await directControl.click();
  const stage = viewport(page);
  await expect(directControl).toHaveAttribute("aria-pressed", "true");
  await pagination(page).nth(index).click();
  await expectCarouselAt(stage, STACKED_DECK_IDS[index]!);
  return stage;
}

interface ShellSample {
  readonly layer: number;
  readonly opacity: number;
  readonly role: string;
  readonly x: number;
  readonly y: number;
}

async function startShellRecorder(page: Page, id: string): Promise<void> {
  await page.evaluate((itemId) => {
    const shell = document.querySelector<HTMLElement>(
      `[data-snap-motion-stacked-deck-card][data-item-id='${itemId}']`,
    )!;
    const motion = shell.querySelector<HTMLElement>(".snap-motion-stacked-deck-card-motion")!;
    const samples: ShellSample[] = [];
    Object.assign(window, { snapMotionDirectShellSamples: samples });
    let remaining = 120;
    const record = () => {
      const matrix = new DOMMatrixReadOnly(getComputedStyle(motion).transform);
      samples.push({
        layer: Number(shell.dataset.deckLayer),
        opacity: Number(getComputedStyle(shell).opacity),
        role: shell.dataset.deckRole ?? "unknown",
        x: matrix.m41,
        y: matrix.m42,
      });
      if ((remaining -= 1) > 0) requestAnimationFrame(record);
    };
    requestAnimationFrame(record);
  }, id);
}

async function shellSamples(page: Page): Promise<readonly ShellSample[]> {
  return page.evaluate(
    () =>
      (
        window as typeof window & {
          snapMotionDirectShellSamples?: readonly ShellSample[];
        }
      ).snapMotionDirectShellSamples ?? [],
  );
}

function expectContinuousOpaqueSettlement(samples: readonly ShellSample[]): void {
  expect(samples.length).toBeGreaterThan(8);
  expect(samples.every((sample) => sample.opacity === 1)).toBe(true);
  expect(samples.some((sample) => sample.role === "hidden")).toBe(true);
}

async function grabPointError(
  page: Page,
  id: string,
  origin: { x: number; y: number },
  deltaX: number,
  deltaY: number,
) {
  return page.evaluate(
    ({ deltaX: pointerDeltaX, deltaY: pointerDeltaY, itemId, origin: pointerOrigin }) => {
      const root = document.querySelector<HTMLElement>("[data-testid='stacked-deck-viewport']")!;
      const card = document.querySelector<HTMLElement>(
        `[data-snap-motion-stacked-deck-card][data-item-id='${itemId}']`,
      )!;
      const motion = card.querySelector<HTMLElement>(".snap-motion-stacked-deck-card-motion")!;
      const rootBox = root.getBoundingClientRect();
      const box = motion.getBoundingClientRect();
      const pointerX = pointerOrigin.x + pointerDeltaX;
      const pointerY = pointerOrigin.y + pointerDeltaY;
      const grabX = pointerOrigin.x - (rootBox.left + rootBox.width / 2);
      const grabY = pointerOrigin.y - (rootBox.top + rootBox.height / 2);
      const transformedX = box.left + box.width / 2 + grabX;
      const transformedY = box.top + box.height / 2 + grabY;
      const errorX = transformedX - pointerX;
      const errorY = transformedY - pointerY;
      return {
        error: Math.hypot(errorX, errorY),
        errorX,
        errorY,
      };
    },
    { deltaX, deltaY, itemId: id, origin },
  );
}

/**
 * One rendered frame of a release, read from the DOM the way an eye reads it: painted boxes and
 * paint order, not the numbers the deck believes in.
 */
interface ReleaseShellFrame {
  readonly layer: number;
  /** Painted edges of the card body, which is what "these two overlap" is a fact about. */
  readonly left: number;
  readonly opacity: number;
  /** Deck-space translation, which is what a destination pile slot is expressed in. */
  readonly poseX: number;
  readonly poseY: number;
  readonly right: number;
  readonly role: string;
  readonly rotate: number;
  readonly scale: number;
}

interface ReleaseFrame {
  readonly authoritativeIndex: number;
  readonly incoming: ReleaseShellFrame;
  readonly originIndex: number;
  readonly outgoing: ReleaseShellFrame;
  readonly owned: boolean;
  readonly physicalIndex: number;
  readonly t: number;
}

interface ReleaseEvent {
  readonly frame: number;
  readonly sequence: number;
  readonly t: number;
  readonly type: string;
}

interface ReleaseTrace {
  readonly cardWidth: number;
  readonly events: readonly ReleaseEvent[];
  readonly frames: readonly ReleaseFrame[];
}

declare global {
  interface Window {
    snapMotionReleaseTrace?: ReleaseTrace;
  }
}

/**
 * Records every rendered frame across a release, plus the pointer events that produced them.
 *
 * Everything measured here is observable: the painted box of each shell, its paint order, and the
 * deck's own published diagnostics. That is deliberate — the defect under test is what the eye
 * sees on one frame, so the evidence has to be read from the same place.
 */
async function startReleaseTrace(
  page: Page,
  outgoingId: string,
  incomingId: string,
  frames = 160,
): Promise<void> {
  await page.evaluate(
    ({ frames: frameBudget, incomingId: incoming, outgoingId: outgoing }) => {
      const root = document.querySelector<HTMLElement>("[data-testid='stacked-deck-viewport']")!;
      const readShell = (id: string) => {
        const shell = root.querySelector<HTMLElement>(
          `[data-snap-motion-stacked-deck-card][data-item-id='${id}']`,
        )!;
        const motion = shell.querySelector<HTMLElement>(".snap-motion-stacked-deck-card-motion")!;
        const surface = shell.querySelector<HTMLElement>(".screen-chrome")!;
        // Painted boxes and published poses only. Resolving computed styles here would flush style
        // for both shells on every frame and starve the very frames this is measuring.
        const box = motion.getBoundingClientRect();
        return {
          layer: Number(shell.dataset.deckLayer),
          left: box.left,
          opacity: Number(shell.style.opacity),
          poseX: Number(surface.dataset.translateX),
          poseY: Number(surface.dataset.translateY),
          right: box.right,
          role: shell.dataset.deckRole ?? "",
          rotate: Number(surface.dataset.rotate),
          scale: Number(surface.dataset.scale),
        };
      };
      const trace = {
        cardWidth: Number(root.dataset.cardWidth),
        events: [] as unknown[],
        frames: [] as unknown[],
      };
      window.snapMotionReleaseTrace = trace as never;
      let sequence = 0;
      for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel"]) {
        window.addEventListener(
          type,
          () => {
            trace.events.push({
              frame: trace.frames.length,
              sequence: (sequence += 1),
              t: performance.now(),
              type,
            });
          },
          { capture: true },
        );
      }
      let remaining = frameBudget;
      const record = () => {
        trace.frames.push({
          authoritativeIndex: Number(root.dataset.authoritativeIndex),
          incoming: readShell(incoming),
          originIndex: Number(root.dataset.interactionOriginIndex),
          outgoing: readShell(outgoing),
          owned: root.dataset.interactionOwned === "true",
          physicalIndex: Number(root.dataset.physicalIndex),
          t: performance.now(),
        });
        if ((remaining -= 1) > 0) requestAnimationFrame(record);
      };
      requestAnimationFrame(record);
    },
    { frames, incomingId, outgoingId },
  );
}

async function readReleaseTrace(page: Page): Promise<ReleaseTrace> {
  return page.evaluate(
    () => window.snapMotionReleaseTrace ?? { cardWidth: 0, events: [], frames: [] },
  );
}

/** Painted horizontal overlap of the two card bodies. Positive means they share pixel columns. */
function bodyOverlap(frame: ReleaseFrame): number {
  return (
    Math.min(frame.outgoing.right, frame.incoming.right) -
    Math.max(frame.outgoing.left, frame.incoming.left)
  );
}

interface ReleaseReview {
  readonly crossovers: readonly {
    readonly frame: number;
    /** Milliseconds between the frame before the swap and the frame it happened on. */
    readonly intervalMs: number;
    readonly overlap: number;
    readonly overlapBefore: number;
  }[];
  readonly finalOutgoing: ReleaseShellFrame;
  readonly frameCount: number;
  /** Mean rendered frame interval across the release, in milliseconds. */
  readonly frameIntervalMs: number;
  readonly maximumStep: number;
  readonly minimumOpacity: number;
  readonly overlapAtRelease: number;
  readonly overlappedWhileInFront: number;
  readonly longestStall: number;
  readonly restIntrusions: number;
  readonly stalledFrames: number;
}

/**
 * Reduces one recorded release to the facts the physical model claims.
 *
 * A crossover is a frame where paint order between the two shells inverts. A stall is a stretch of
 * frames where a shell that has not arrived does not move at all. A rest intrusion is a frame that
 * draws the released shell at the deck's nominal rest geometry while it is still travelling —
 * which is what a presentation being cleared out from under an unfinished path looks like.
 */
function reviewRelease(trace: ReleaseTrace, restX: number, from: number): ReleaseReview {
  const frames = trace.frames.slice(from);
  const crossovers: { frame: number; overlap: number; overlapBefore: number }[] = [];
  let maximumStep = 0;
  let minimumOpacity = 1;
  let overlappedWhileInFront = 0;
  let restIntrusions = 0;
  let stalledFrames = 0;
  let longestStall = 0;
  let currentStall = 0;
  for (let index = 0; index < frames.length; index += 1) {
    const frame = frames[index]!;
    minimumOpacity = Math.min(minimumOpacity, frame.outgoing.opacity, frame.incoming.opacity);
    const behind = frame.outgoing.layer < frame.incoming.layer;
    if (!behind && bodyOverlap(frame) > 0) overlappedWhileInFront += 1;
    const previous = frames[index - 1];
    if (previous === undefined) continue;
    maximumStep = Math.max(
      maximumStep,
      Math.hypot(
        frame.outgoing.poseX - previous.outgoing.poseX,
        frame.outgoing.poseY - previous.outgoing.poseY,
      ),
    );
    if (behind !== previous.outgoing.layer < previous.incoming.layer) {
      crossovers.push({
        frame: index,
        intervalMs: frame.t - previous.t,
        overlap: bodyOverlap(frame),
        overlapBefore: bodyOverlap(previous),
      });
    }
    const arrived = Math.abs(frame.outgoing.poseX - restX) <= 0.5;
    if (
      !arrived &&
      frame.outgoing.poseX === previous.outgoing.poseX &&
      frame.outgoing.poseY === previous.outgoing.poseY
    ) {
      stalledFrames += 1;
      currentStall += 1;
      longestStall = Math.max(longestStall, currentStall);
    } else {
      currentStall = 0;
    }
    // Nominal rest is the pose the deck draws with no release in flight at all. Passing through it
    // is normal at the end; being drawn there while still hundreds of pixels of path remain is the
    // presentation having been taken away mid-flight.
    if (
      !arrived &&
      Math.abs(frame.outgoing.poseX) <= 0.5 &&
      Math.abs(previous.outgoing.poseX) > 8
    ) {
      restIntrusions += 1;
    }
  }
  return {
    crossovers,
    finalOutgoing: frames.at(-1)!.outgoing,
    frameCount: frames.length,
    frameIntervalMs: (frames.at(-1)!.t - frames[0]!.t) / Math.max(1, frames.length - 1),
    longestStall,
    maximumStep,
    minimumOpacity,
    overlapAtRelease: bodyOverlap(frames[0]!),
    overlappedWhileInFront,
    restIntrusions,
    stalledFrames,
  };
}

test("Direct keeps three local grab points attached through diagonal owned movement", async ({
  page,
}) => {
  const stage = await prepareDirect(page);
  const pitch = await motionPitch(stage);

  for (const [relativeX, relativeY] of [
    [0.5, 0.5],
    [0.2, 0.2],
    [0.8, 0.75],
  ] as const) {
    await pagination(page).nth(3).click();
    await expectCarouselAt(stage, "team");
    const card = page.locator("[data-snap-motion-stacked-deck-card][data-item-id='team']");
    const origin = await beginPointerAt(card, relativeX, relativeY);
    await movePointerBy(page, origin, -pitch * 0.42, 96, 120);
    await nextFrame(page);

    await expect(stage).toHaveAttribute("data-owned", "true");
    const error = await grabPointError(page, "team", origin, -pitch * 0.42, 96);
    expect(error.error).toBeLessThanOrEqual(0.5);

    await finishPointerBy(page, origin, -pitch * 0.42, 96, 180, "pointercancel");
    await expectCarouselAt(stage, "team");
  }
});

test("Direct reports touch catch-up and boundary resistance separately", async ({ page }) => {
  const stage = await prepareDirect(page);
  const pitch = await motionPitch(stage);
  let card = page.locator("[data-snap-motion-stacked-deck-card][data-item-id='team']");
  let origin = await beginPointerAt(card, 0.35, 0.65, "touch");
  await movePointerBy(page, origin, -pitch * 0.38, 72, 100);
  await nextFrame(page);

  const catchUp = await grabPointError(page, "team", origin, -pitch * 0.38, 72);
  expect(catchUp.error).toBeLessThanOrEqual(0.5);
  expect(Number(await stage.getAttribute("data-physical-index"))).toBeGreaterThan(3.2);
  await finishPointerBy(page, origin, -pitch * 0.38, 72, 140, "pointercancel");
  await expectCarouselAt(stage, "team");

  await pagination(page).first().click();
  await expectCarouselAt(stage, "templates");
  card = page.locator("[data-snap-motion-stacked-deck-card][data-item-id='templates']");
  origin = await beginPointerAt(card, 0.5, 0.5);
  await movePointerBy(page, origin, pitch * 0.7, 90, 100);
  await nextFrame(page);
  await expect(card).toHaveAttribute("data-deck-role", "top");
  await finishPointerBy(page, origin, pitch * 0.7, 90, 150, "pointercancel");
  await expectCarouselAt(stage, "templates");
});

test("Direct overdrag and reversal keep one stable origin with only an adjacent target", async ({
  page,
}) => {
  const stage = await prepareDirect(page);
  const pitch = await motionPitch(stage);
  const card = page.locator("[data-snap-motion-stacked-deck-card][data-item-id='team']");
  const origin = await beginPointerAt(card, 0.5, 0.5);

  for (const [deltaX, allowed] of [
    [-pitch * 3, ["team", "settings"]],
    [pitch * 3, ["map", "team"]],
  ] as const) {
    await movePointerBy(page, origin, deltaX, 60, deltaX < 0 ? 100 : 200);
    await nextFrame(page);
    await expect(card).toHaveAttribute("data-deck-role", "top");
    const exchanging = await page
      .locator("[data-snap-motion-stacked-deck-card]")
      .evaluateAll((elements) =>
        elements
          .filter((element) =>
            ["top", "target"].includes((element as HTMLElement).dataset.deckRole ?? ""),
          )
          .map((element) => (element as HTMLElement).dataset.itemId),
      );
    expect(exchanging.every((id) => id !== undefined && allowed.includes(id as never))).toBe(true);
  }

  await finishPointerBy(page, origin, pitch * 3, 60, 240, "pointercancel");
  await expectCarouselAt(stage, "team");
});

test("Direct parks opaquely behind the new top and keeps immediate reversal continuous", async ({
  page,
}) => {
  const stage = await prepareDirect(page);
  const pitch = await motionPitch(stage);
  const outgoing = page.locator("[data-snap-motion-stacked-deck-card][data-item-id='team']");
  await startShellRecorder(page, "team");
  let origin = await beginPointerAt(outgoing, 0.2, 0.75);
  await movePointerBy(page, origin, -pitch * 0.76, 180, 140);
  await nextFrame(page);
  await finishPointerBy(page, origin, -pitch * 0.76, 180, 180, "pointerup");
  await waitForAuthority(page, 4);
  await expect(outgoing).toHaveAttribute("data-deck-role", "hidden");
  const outgoingLayer = Number(await outgoing.getAttribute("data-deck-layer"));

  const incoming = page.locator("[data-snap-motion-stacked-deck-card][data-item-id='settings']");
  await expect(incoming).toHaveAttribute("data-deck-interactive", "true");
  // Depth is not handed over the moment the hand lets go. The released shell keeps the front while
  // the two bodies still overlap — that is what makes the swap invisible — and is behind the new
  // top by the time it has parked.
  const incomingLayer = Number(await incoming.getAttribute("data-deck-layer"));
  expect(outgoingLayer).toBeGreaterThanOrEqual(incomingLayer);
  await expect
    .poll(async () => Number(await outgoing.getAttribute("data-deck-layer")))
    .toBeLessThan(incomingLayer);
  origin = await beginPointerAt(incoming, 0.75, 0.25);
  await movePointerBy(page, origin, pitch * 0.22, -45, 80);
  await nextFrame(page);
  await expect(incoming).toHaveAttribute("data-deck-role", "top");
  expect(
    (await grabPointError(page, "settings", origin, pitch * 0.22, -45)).error,
  ).toBeLessThanOrEqual(0.5);
  await finishPointerBy(page, origin, pitch * 0.22, -45, 120, "pointercancel");
  await expectCarouselAt(stage, "settings");
  await page.waitForTimeout(350);

  expectContinuousOpaqueSettlement(await shellSamples(page));

  await startShellRecorder(page, "settings");
  const reverse = await beginPointerAt(incoming, 0.8, 0.25);
  await movePointerBy(page, reverse, pitch * 0.76, -180, 140);
  await nextFrame(page);
  await finishPointerBy(page, reverse, pitch * 0.76, -180, 180, "pointerup");
  await expectCarouselAt(stage, "team");
  await page.waitForTimeout(350);
  expectContinuousOpaqueSettlement(await shellSamples(page));

  await startShellRecorder(page, "team");
  const flick = await beginPointerAt(outgoing, 0.5, 0.5);
  await movePointerBy(page, flick, -pitch * 0.18, 35, 8);
  await movePointerBy(page, flick, -pitch * 0.48, 80, 16);
  await nextFrame(page);
  await finishPointerBy(page, flick, -pitch * 0.48, 80, 24, "pointerup");
  await expectCarouselAt(stage, "settings");
  await page.waitForTimeout(350);
  expectContinuousOpaqueSettlement(await shellSamples(page));
});

test("Direct keyboard, controls, wheel, and programmatic navigation share the physical model", async ({
  page,
}) => {
  for (const reducedMotion of ["no-preference", "reduce"] as const) {
    const stage = await prepareDirect(page, 2, reducedMotion);
    await stage.press("ArrowRight");
    await expectCarouselAt(stage, "team");
    await page.getByTestId("stacked-deck-previous").click();
    await expectCarouselAt(stage, "map");
    await pagination(page).nth(3).click();
    await expectCarouselAt(stage, "team");
    const pitch = await motionPitch(stage);
    await stage.evaluate((element, deltaX) => {
      element.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaX }));
    }, pitch * 0.65);
    await expectCarouselAt(stage, "settings");
    expect(
      await stage
        .locator("[data-snap-motion-stacked-deck-card]")
        .evaluateAll((cards) => cards.every((card) => getComputedStyle(card).opacity === "1")),
    ).toBe(true);
  }
});

test("Direct preserves nested controls on the new top and accepts controlled takeover", async ({
  page,
}) => {
  await openLabDemo(page, "defaults", "no-preference");
  await page.getByTestId("defaults-deck-direct").click();
  const stage = page.getByTestId("defaults-deck");
  const initialId = await stage.getAttribute("data-active-id");
  expect(initialId).not.toBeNull();
  let card = stage.locator(`[data-snap-motion-stacked-deck-card][data-item-id='${initialId}']`);
  let origin = await beginPointerAt(card, 0.5, 0.5);
  await movePointerBy(page, origin, -700, 120, 120);
  await finishPointerBy(page, origin, -700, 120, 150, "pointerup");
  await expect(stage).not.toHaveAttribute("data-active-id", initialId!);
  const nextId = await stage.getAttribute("data-active-id");
  card = stage.locator(`[data-snap-motion-stacked-deck-card][data-item-id='${nextId}']`);
  await expect(card).toHaveAttribute("data-deck-interactive", "true");
  await card
    .getByTestId("defaults-card-button")
    .evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.getByTestId("defaults-activations")).toHaveText("1");

  // External authority can take over committed parking without waiting for presentation settlement.
  await page
    .getByTestId("defaults-route-first")
    .evaluate((button: HTMLButtonElement) => button.click());
  await expect(stage).toHaveAttribute("data-active-id", STACKED_DECK_IDS[0]);
  await expect(stage).toHaveAttribute("data-phase", "idle");

  // A cancelled two-axis return is equally interruptible.
  card = stage.locator(
    `[data-snap-motion-stacked-deck-card][data-item-id='${STACKED_DECK_IDS[0]}']`,
  );
  origin = await beginPointerAt(card, 0.5, 0.5);
  await movePointerBy(page, origin, -180, 75, 90);
  await finishPointerBy(page, origin, -180, 75, 110, "pointercancel");
  await expect(card).toHaveAttribute("data-deck-role", "top");
  await page
    .getByTestId("defaults-route-last")
    .evaluate((button: HTMLButtonElement) => button.click());
  await expect(stage).toHaveAttribute("data-active-id", STACKED_DECK_IDS.at(-1)!);
  await expect(stage).toHaveAttribute("data-phase", "idle");

  card = stage.locator(
    `[data-snap-motion-stacked-deck-card][data-item-id='${STACKED_DECK_IDS.at(-1)}']`,
  );
  origin = await beginPointerAt(card, 0.5, 0.5);
  await movePointerBy(page, origin, 180, -60, 90);
  await expect(card).toHaveAttribute("data-deck-role", "top");
  await page
    .getByTestId("defaults-route-first")
    .evaluate((button: HTMLButtonElement) => button.click());
  await expect(stage).toHaveAttribute("data-active-id", STACKED_DECK_IDS[0]);
  await expect(stage).toHaveAttribute("data-phase", "idle");
  await finishPointerBy(page, origin, 180, -60, 130, "pointerup");
  await expect(stage).toHaveAttribute("data-active-id", STACKED_DECK_IDS[0]);
});

/**
 * Drives one release with every rendered frame recorded across it, and reduces the recording to the
 * physical claims the model makes. The hold before the release is deliberate: it puts the last
 * hand-owned frames in the same recording as the first parked ones, which is the seam under test.
 */
async function traceDirectRelease(
  page: Page,
  options: {
    readonly dragX: number;
    readonly dragY: number;
    readonly incomingId: string;
    readonly outgoingId: string;
    readonly startIndex: number;
  },
): Promise<{
  readonly restX: number;
  readonly review: ReleaseReview;
  readonly trace: ReleaseTrace;
}> {
  const stage = viewport(page);
  await pagination(page).nth(options.startIndex).click();
  await expectCarouselAt(stage, STACKED_DECK_IDS[options.startIndex]!);
  await page.waitForTimeout(220);
  const card = page.locator(
    `[data-snap-motion-stacked-deck-card][data-item-id='${options.outgoingId}']`,
  );
  const origin = await beginPointerAt(card, 0.35, 0.6);
  await movePointerBy(page, origin, options.dragX * 0.4, options.dragY * 0.4, 60);
  await movePointerBy(page, origin, options.dragX, options.dragY, 130);
  await startReleaseTrace(page, options.outgoingId, options.incomingId);
  await page.waitForTimeout(140);
  await finishPointerBy(page, origin, options.dragX, options.dragY, 200, "pointerup");
  await page.waitForTimeout(900);
  const trace = await readReleaseTrace(page);
  const restX = await card
    .locator(".screen-chrome")
    .evaluate((element) => Number((element as HTMLElement).dataset.translateX));
  const release = trace.events.find((event) => event.type === "pointerup");
  expect(release).toBeDefined();
  return { restX, review: reviewRelease(trace, restX, Math.max(0, release!.frame - 1)), trace };
}

function expectContinuousHandoff(review: ReleaseReview, restX: number): void {
  // One shell, always opaque, and it may never pass behind the new top more than once. Two frames
  // is the floor for comparing anything at all; a browser this harness starves below that is not
  // rendering the release, which the frame-interval gates below say plainly.
  expect(review.frameCount).toBeGreaterThanOrEqual(2);
  expect(review.minimumOpacity).toBe(1);
  expect(review.crossovers.length).toBeLessThanOrEqual(1);
  // A single repeated sample is the recorder reading a frame before the deck's own callback ran.
  // A stall is a shell that stops while it still has path left, which is what the eye reported.
  expect(review.longestStall).toBeLessThanOrEqual(2);
  // Nothing is ever drawn at nominal rest while it still has path left, either.
  expect(review.restIntrusions).toBe(0);
  // It arrives, exactly, at the slot it owns in the destination pile.
  expect(review.finalOutgoing.poseX).toBeCloseTo(restX, 1);
  expect(Number.isFinite(review.finalOutgoing.poseY)).toBe(true);

  // The rest is a claim about single frames, so it can only be judged where the browser rendered
  // the two frames it is about close enough together to be a pair. The settlement is 230ms long;
  // headless WebKit renders this harness in steps of that order, which is a jump cut whatever the
  // deck does with the frames in between.
  if (review.frameIntervalMs > 40) return;
  // Depth changes exactly once, and only on a frame where the two painted bodies share no pixel
  // column — so the swap itself repaints nothing. The frame before it may well overlap: the shell
  // is in front there, and what changes between the two frames is where the card is, not what the
  // shared pixels are made of.
  expect(review.crossovers).toHaveLength(1);
  if (review.crossovers[0]!.intervalMs > 40) return;
  expect(review.crossovers[0]!.overlap).toBeLessThanOrEqual(0);
  // A release that still overlapped the new top stays in front for as long as it does, which is
  // what makes the swap invisible. One that was already clear of it crosses over straight away.
  expect(review.overlappedWhileInFront > 0).toBe(review.overlapAtRelease > 0);
  expect(review.maximumStep).toBeLessThan(300);
}

test("Direct hands one shell over continuously and passes it behind only between clear bodies", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const stage = await prepareDirect(page);
  const pitch = await motionPitch(stage);
  const scenarios = [
    {
      dragX: -pitch * 0.72,
      dragY: 150,
      incomingId: "settings",
      name: "release-handoff-forward",
      outgoingId: "team",
      startIndex: 3,
    },
    {
      dragX: pitch * 0.72,
      dragY: -150,
      incomingId: "team",
      name: "release-handoff-reverse",
      outgoingId: "settings",
      startIndex: 4,
    },
    {
      dragX: -pitch,
      dragY: 90,
      incomingId: "settings",
      name: "full-pitch-release",
      outgoingId: "team",
      startIndex: 3,
    },
    {
      dragX: -pitch * 1.9,
      dragY: -120,
      incomingId: "settings",
      name: "overdrag-release",
      outgoingId: "team",
      startIndex: 3,
    },
  ] as const;

  const report: Record<string, unknown> = {};
  for (const scenario of scenarios) {
    const { restX, review, trace } = await traceDirectRelease(page, scenario);
    const releaseFrame = trace.events.find((event) => event.type === "pointerup")!.frame;
    expectContinuousHandoff(review, restX);
    await expectCarouselAt(stage, scenario.incomingId);
    report[scenario.name] = {
      crossovers: review.crossovers,
      events: trace.events,
      finalOutgoing: review.finalOutgoing,
      frameCount: review.frameCount,
      frameIntervalMs: review.frameIntervalMs,
      frames: trace.frames.slice(Math.max(0, releaseFrame - 2)),
      longestStall: review.longestStall,
      maximumStep: review.maximumStep,
      minimumOpacity: review.minimumOpacity,
      overlapAtRelease: review.overlapAtRelease,
      overlappedWhileInFront: review.overlappedWhileInFront,
      restIntrusions: review.restIntrusions,
      restX,
      stalledFrames: review.stalledFrames,
    };
  }

  const directory = resolvePath(
    import.meta.dirname,
    "..",
    ".artifacts",
    "stacked-deck-direct-review",
    "release-trace",
  );
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, `${testInfo.project.name}.json`),
    `${JSON.stringify(report, null, 2)}\n`,
  );
});

test("Direct release stays finite and completes after the deck itself has stopped", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const stage = await prepareDirect(page);
  const pitch = await motionPitch(stage);
  // A commit at and past a whole pitch: logical travel is already finished at the release frame, so
  // anything deriving parking from remaining scalar distance divides by nothing here.
  for (const dragX of [-pitch, -pitch * 2.4]) {
    const { restX, review, trace } = await traceDirectRelease(page, {
      dragX,
      dragY: 60,
      incomingId: "settings",
      outgoingId: "team",
      startIndex: 3,
    });
    for (const frame of trace.frames) {
      expect(Number.isFinite(frame.outgoing.poseX)).toBe(true);
      expect(Number.isFinite(frame.outgoing.poseY)).toBe(true);
      expect(Number.isFinite(frame.outgoing.scale)).toBe(true);
      expect(Number.isFinite(frame.outgoing.rotate)).toBe(true);
      expect(Number.isFinite(frame.outgoing.left)).toBe(true);
      expect(frame.outgoing.scale).toBeGreaterThan(0);
    }
    // The deck reports rest before the shell has arrived; the shell still arrives.
    expect(trace.frames.some((frame) => !frame.owned)).toBe(true);
    expect(review.longestStall).toBeLessThanOrEqual(2);
    expect(review.finalOutgoing.poseX).toBeCloseTo(restX, 1);
    await expectCarouselAt(stage, "settings");
  }
});

test("Direct grab takes ownership without a frame drawn from the wrong presentation", async ({
  page,
}) => {
  const stage = await prepareDirect(page);
  const pitch = await motionPitch(stage);
  const card = page.locator("[data-snap-motion-stacked-deck-card][data-item-id='team']");
  await startReleaseTrace(page, "team", "settings", 60);
  await page.waitForTimeout(60);
  const origin = await beginPointerAt(card, 0.4, 0.5);
  await page.waitForTimeout(60);
  await movePointerBy(page, origin, -pitch * 0.3, 40, 80);
  await page.waitForTimeout(120);
  const trace = await readReleaseTrace(page);
  const down = trace.events.find((event) => event.type === "pointerdown")!;
  // Before the press the deck is at rest: the card about to be grabbed is the top card, at rest.
  for (const frame of trace.frames.slice(0, down.frame)) {
    expect(frame.outgoing.poseX).toBeCloseTo(0, 1);
    expect(frame.outgoing.layer).toBeGreaterThan(frame.incoming.layer);
  }
  // Across the press and the first owned movement the grabbed shell keeps the front and moves only
  // where the hand moved it: no frame is drawn from the resting projection instead.
  const owned = trace.frames.slice(down.frame);
  let maximumStep = 0;
  for (let index = 1; index < owned.length; index += 1) {
    expect(owned[index]!.outgoing.layer).toBeGreaterThan(owned[index]!.incoming.layer);
    expect(owned[index]!.outgoing.opacity).toBe(1);
    maximumStep = Math.max(
      maximumStep,
      Math.abs(owned[index]!.outgoing.poseX - owned[index - 1]!.outgoing.poseX),
    );
  }
  expect(maximumStep).toBeLessThanOrEqual(pitch * 0.31 + 1);
  await finishPointerBy(page, origin, -pitch * 0.3, 40, 140, "pointercancel");
  await expectCarouselAt(stage, "team");
});
