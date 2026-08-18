import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { dragSyntheticPointerBy, expectCarouselAt, openLabDemo } from "./helpers";
import {
  STACKED_DECK_IDS as IDS,
  STACKED_DECK_TITLES as TITLES,
  beginHeldTraversal,
  beginPointer,
  finishPointer,
  flick,
  flingHeld,
  holdPhysicalIndex,
  holdPointerAt,
  motionPitch,
  movePointer,
  nextPointerId,
  pagination,
  readFrame,
  releaseHeldAtRest,
  viewport,
  waitForAuthority,
  type HeldTraversal,
} from "./stackedDeckHarness";

const existingResizeObserverWarning =
  /ResizeObserver loop completed with undelivered notifications\./;
const collectedPageErrors = new WeakMap<Page, string[]>();
test.describe.configure({ timeout: 60_000 });

async function readNarrowPageGeometry(page: Page) {
  return page.getByTestId("stacked-deck-overflow-root").evaluate((root) => {
    // oxlint-disable-next-line unicorn/consistent-function-scoping -- This helper must execute in the browser evaluation scope.
    const rect = (element: Element) => {
      const box = element.getBoundingClientRect();
      return {
        bottom: Number(box.bottom.toFixed(3)),
        height: Number(box.height.toFixed(3)),
        left: Number(box.left.toFixed(3)),
        right: Number(box.right.toFixed(3)),
        top: Number(box.top.toFixed(3)),
        width: Number(box.width.toFixed(3)),
      };
    };
    const dimensions = (element: HTMLElement) => ({
      clientHeight: element.clientHeight,
      clientWidth: element.clientWidth,
      rect: rect(element),
      scrollHeight: element.scrollHeight,
      scrollWidth: element.scrollWidth,
    });
    const stage = root.querySelector<HTMLElement>(".snap-motion-stacked-deck-stage")!;
    const rootStyle = getComputedStyle(root);
    const status = root.querySelector<HTMLElement>(
      "[data-testid='snap-motion-stacked-deck-status']",
    )!;
    const cards = [...root.querySelectorAll<HTMLElement>(".snap-motion-stacked-deck-card")].map(
      (card) => {
        const motion = card.querySelector<HTMLElement>(".snap-motion-stacked-deck-card-motion")!;
        const child = motion.firstElementChild as HTMLElement;
        const cardStyle = getComputedStyle(card);
        const motionStyle = getComputedStyle(motion);
        return {
          id: card.dataset.itemId ?? "",
          interactive: card.dataset.deckInteractive,
          opacity: cardStyle.opacity,
          outer: dimensions(card),
          motion: dimensions(motion),
          motionTransform: motionStyle.transform,
          role: card.dataset.deckRole,
          slottedChild: dimensions(child),
          visibility: cardStyle.visibility,
          visible: card.dataset.deckVisible,
        };
      },
    );
    return {
      activeId: root.dataset.activeId,
      cards,
      cardWidthProperty: getComputedStyle(stage)
        .getPropertyValue("--snap-motion-deck-card-width")
        .trim(),
      document: {
        bodyScrollWidth: document.body.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      },
      phase: root.dataset.phase,
      root: dimensions(root),
      rootContain: rootStyle.contain,
      rootOverflowX: rootStyle.overflowX,
      rootOverflowY: rootStyle.overflowY,
      settledId: root.dataset.settledId,
      stage: dimensions(stage),
      status: {
        dimensions: dimensions(status),
        text: status.textContent?.trim() ?? "",
      },
    };
  });
}

async function readMeasuredNarrowPageGeometry(page: Page) {
  await expect
    .poll(async () => (await readNarrowPageGeometry(page)).cardWidthProperty)
    .toBe("192px");
  return readNarrowPageGeometry(page);
}

interface NarrowPageFrame {
  readonly activeId: string;
  readonly bodyScrollWidth: number;
  readonly documentClientWidth: number;
  readonly documentScrollWidth: number;
  readonly phase: string;
  readonly rootContain: string;
  readonly rootOverflowX: string;
  readonly rootOverflowY: string;
  readonly settledId: string;
}

async function installNarrowPageTrace(page: Page, targetId: string, maxFrames = 120) {
  await page.getByTestId("stacked-deck-overflow-root").evaluate(
    (root, options) => {
      const frames: NarrowPageFrame[] = [];
      const state = { done: false, frames };
      (
        window as typeof window & {
          stackedDeckNarrowPageTrace?: typeof state;
        }
      ).stackedDeckNarrowPageTrace = state;
      let remainingFrames = options.frameBudget;
      const sample = () => {
        const phase = root.dataset.phase ?? "";
        const rootStyle = getComputedStyle(root);
        frames.push({
          activeId: root.dataset.activeId ?? "",
          bodyScrollWidth: document.body.scrollWidth,
          documentClientWidth: document.documentElement.clientWidth,
          documentScrollWidth: document.documentElement.scrollWidth,
          phase,
          rootContain: rootStyle.contain,
          rootOverflowX: rootStyle.overflowX,
          rootOverflowY: rootStyle.overflowY,
          settledId: root.dataset.settledId ?? "",
        });
        remainingFrames -= 1;
        if (
          (phase === "idle" &&
            root.dataset.activeId === options.targetId &&
            root.dataset.settledId === options.targetId) ||
          remainingFrames <= 0
        ) {
          state.done = true;
          return;
        }
        requestAnimationFrame(sample);
      };
      sample();
    },
    { frameBudget: maxFrames, targetId },
  );
}

async function readNarrowPageTrace(page: Page): Promise<readonly NarrowPageFrame[]> {
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (
              window as typeof window & {
                stackedDeckNarrowPageTrace?: { done: boolean };
              }
            ).stackedDeckNarrowPageTrace?.done,
        ),
      { timeout: 15_000 },
    )
    .toBe(true);
  return page.evaluate(
    () =>
      (
        window as typeof window & {
          stackedDeckNarrowPageTrace?: { frames: NarrowPageFrame[] };
        }
      ).stackedDeckNarrowPageTrace?.frames ?? [],
  );
}

type DeckFrame = Awaited<ReturnType<typeof readFrame>>;

function settingsPhysicalSignature(frame: DeckFrame) {
  const settings = frame.poses[4]!;
  return {
    backgroundColor: settings.backgroundColor,
    id: settings.id,
    opacity: settings.opacity,
    rotate: Number(settings.rotate.toFixed(4)),
    scale: Number(settings.scale.toFixed(4)),
    tone: settings.tone,
    translateX: Number(settings.translateX.toFixed(4)),
    translateY: Number(settings.translateY.toFixed(4)),
  };
}

function topPose(frame: DeckFrame) {
  const pose = frame.poses.find((candidate) => candidate.role === "top");
  if (!pose) throw new Error("Deck frame has no visual top card.");
  return pose;
}

function assertLocalSegment(frame: Awaited<ReturnType<typeof readFrame>>) {
  if (frame.segmentTargetIndex === null) return;
  expect(Math.abs(frame.segmentTargetIndex - frame.segmentOriginIndex)).toBe(1);
  expect(frame.segmentOriginIndex).toBe(frame.visualTopIndex);
}

interface TraversalSample {
  readonly authoritativeIndex: number;
  readonly authorityStable: boolean;
  readonly caption: string;
  readonly controllerPhase: string;
  readonly direction: number;
  readonly inspectEnabled: boolean;
  readonly interactionOriginIndex: number;
  readonly physicalIndex: number;
  readonly progress: number;
  readonly segmentOriginIndex: number;
  readonly segmentPhase: string;
  readonly segmentTargetIndex: number | null;
  readonly settledIndex: number;
  readonly visualTopIndex: number;
  readonly poses: readonly {
    readonly clipPath: string;
    readonly id: string;
    readonly layer: number;
    readonly opacity: number;
    readonly role: string;
    readonly rotate: number;
    readonly scale: number;
    readonly translateX: number;
    readonly translateY: number;
    readonly visible: boolean;
  }[];
  readonly cardWidth: number;
}

/**
 * Samples every rendered frame until the deck settles. `maxFrames` also bounds a trace that never
 * leaves idle, which is exactly what a direct absolute synchronization must look like.
 */
async function installTraversalTrace(page: Page, maxFrames = 900, minimumInteractions = 1) {
  await viewport(page).evaluate(
    (element, options) => {
      const trace: TraversalSample[] = [];
      const state = { done: false, started: false, trace };
      (
        window as typeof window & {
          stackedDeckTraversalTrace?: typeof state;
        }
      ).stackedDeckTraversalTrace = state;
      let interactionCount = 0;
      let lastInteractionOrigin = -1;
      let remainingFrames = options.frameBudget;
      const sample = () => {
        const controllerPhase = element.dataset.phase ?? "";
        if (controllerPhase !== "idle") state.started = true;
        const targetAttribute = element.getAttribute("data-segment-target-index");
        const interactionOriginIndex = Number(element.dataset.interactionOriginIndex);
        if (interactionOriginIndex >= 0 && interactionOriginIndex !== lastInteractionOrigin) {
          interactionCount += 1;
          lastInteractionOrigin = interactionOriginIndex;
        }
        trace.push({
          authoritativeIndex: Number(element.dataset.authoritativeIndex),
          authorityStable: element.dataset.authorityStable === "true",
          caption:
            document.querySelector<HTMLElement>('[data-testid="stacked-deck-caption"]')
              ?.innerText ?? "",
          cardWidth: Number(element.dataset.cardWidth),
          controllerPhase,
          direction: Number(element.dataset.segmentDirection),
          inspectEnabled: !document.querySelector<HTMLButtonElement>(
            '[data-testid="stacked-deck-inspect"]',
          )?.disabled,
          interactionOriginIndex,
          physicalIndex: Number(element.dataset.physicalIndex),
          progress: Number(element.dataset.segmentProgress),
          segmentOriginIndex: Number(element.dataset.segmentOriginIndex),
          segmentPhase: element.dataset.segmentPhase ?? "",
          segmentTargetIndex: targetAttribute === null ? null : Number(targetAttribute),
          settledIndex: Number(element.dataset.settledIndex),
          visualTopIndex: Number(element.dataset.visualTopIndex),
          poses: [...document.querySelectorAll<HTMLElement>(".snap-motion-stacked-deck-card")].map(
            (item) => {
              const surface = item.querySelector<HTMLElement>(".screen-chrome")!;
              return {
                clipPath: getComputedStyle(item).clipPath,
                id: item.dataset.itemId ?? "",
                layer: Number(item.dataset.deckLayer),
                opacity: Number(getComputedStyle(item).opacity),
                role: item.dataset.deckRole ?? "",
                rotate: Number(surface.dataset.rotate),
                scale: Number(surface.dataset.scale),
                translateX: Number(surface.dataset.translateX),
                translateY: Number(surface.dataset.translateY),
                visible: item.dataset.deckVisible === "true",
              };
            },
          ),
        });
        remainingFrames -= 1;
        if (
          (state.started &&
            controllerPhase === "idle" &&
            interactionCount >= options.minimumInteractions) ||
          remainingFrames <= 0
        ) {
          state.done = true;
          return;
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    },
    { frameBudget: maxFrames, minimumInteractions },
  );
}

async function readTraversalTrace(page: Page): Promise<TraversalSample[]> {
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (
              window as typeof window & {
                stackedDeckTraversalTrace?: { done: boolean };
              }
            ).stackedDeckTraversalTrace?.done,
        ),
      { timeout: 15_000 },
    )
    .toBe(true);
  return page.evaluate(
    () =>
      (
        window as typeof window & {
          stackedDeckTraversalTrace?: { trace: TraversalSample[] };
        }
      ).stackedDeckTraversalTrace?.trace ?? [],
  );
}

function uniqueInOrder(values: readonly number[]) {
  return values.filter((value, index) => index === 0 || value !== values[index - 1]);
}

/** Every item keeps one physical shell; painting policy for parked shells remains optimizable. */
function expectPersistentShellInventory(frame: {
  readonly poses: readonly { readonly id: string }[];
}) {
  expect(frame.poses.map((pose) => pose.id)).toEqual(IDS);
  expect(new Set(frame.poses.map((pose) => pose.id)).size).toBe(IDS.length);
}

/** The same persistent-shell inventory across a whole traced interaction. */
function expectShellInventory(trace: readonly TraversalSample[]) {
  for (const sample of trace) expectPersistentShellInventory(sample);
}

const POSE_KEYS = ["translateX", "translateY", "scale", "rotate", "opacity"] as const;

/** Per-frame movement of one pose property across a contiguous run of sampled frames. */
function stepsIn(samples: readonly TakeoverFrame[], key: string) {
  return samples
    .slice(1)
    .map((frame, index) => Math.abs(frame.pose[key]! - samples[index]!.pose[key]!));
}

interface TakeoverFrame {
  readonly authoritativeIndex: number;
  readonly interactionOriginIndex: number;
  readonly phase: string;
  readonly physicalIndex: number;
  readonly pose: Record<string, number>;
}

/**
 * Grabs `index` on the exact rendered frame the deck first names it, sampling every frame around the
 * takeover inside the page. Measuring across a round trip would let the spring advance unobserved
 * and hide — or invent — a discontinuity.
 */
async function grabOnAuthority(page: Page, index: number, pointerId: number) {
  return page.evaluate(
    ({ pointerId: id, wanted }) =>
      new Promise<{ frames: TakeoverFrame[]; grabbedAt: number }>((resolve, reject) => {
        const read = (): TakeoverFrame => {
          const card = document.querySelectorAll<HTMLElement>(".snap-motion-stacked-deck-card")[
            wanted
          ]!;
          const surface = card.querySelector<HTMLElement>(".screen-chrome")!;
          const element = document.querySelector<HTMLElement>(
            '[data-testid="stacked-deck-viewport"]',
          )!;
          return {
            authoritativeIndex: Number(element.dataset.authoritativeIndex),
            interactionOriginIndex: Number(element.dataset.interactionOriginIndex),
            phase: element.dataset.phase ?? "",
            physicalIndex: Number(element.dataset.physicalIndex),
            pose: {
              translateX: Number(surface.dataset.translateX),
              translateY: Number(surface.dataset.translateY),
              scale: Number(surface.dataset.scale),
              rotate: Number(surface.dataset.rotate),
              opacity: Number(surface.dataset.opacity),
            },
          };
        };
        const stage = document.querySelector<HTMLElement>('[data-testid="stacked-deck-viewport"]')!;
        const frames: TakeoverFrame[] = [];
        let grabbedAt = -1;
        let remainingFrames = 300;
        const tick = () => {
          frames.push(read());
          if (grabbedAt < 0 && frames.at(-1)!.authoritativeIndex === wanted) {
            grabbedAt = frames.length;
            const box = stage.getBoundingClientRect();
            stage.dispatchEvent(
              new PointerEvent("pointerdown", {
                bubbles: true,
                button: 0,
                buttons: 1,
                cancelable: true,
                clientX: box.left + box.width / 2,
                clientY: box.top + box.height / 2,
                isPrimary: true,
                pointerId: id,
                pointerType: "mouse",
              }),
            );
          } else if (grabbedAt >= 0 && frames.length >= grabbedAt + 3) {
            resolve({ frames, grabbedAt });
            return;
          }
          if ((remainingFrames -= 1) <= 0) reject(new Error(`the deck never named card ${wanted}`));
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    { pointerId, wanted: index },
  );
}

/**
 * Splits a trace into the interactions that produced it. `data-interaction-origin-index` is written
 * when an interaction takes ownership, so a change of origin is exactly a change of transaction and
 * every sample can be attributed to the gesture, command, or burst responsible for it.
 */
function interactionsIn(trace: readonly TraversalSample[]) {
  const interactions: { originIndex: number; samples: TraversalSample[] }[] = [];
  for (const sample of trace) {
    if (sample.interactionOriginIndex < 0) continue;
    const current = interactions.at(-1);
    if (current?.originIndex === sample.interactionOriginIndex) current.samples.push(sample);
    else interactions.push({ originIndex: sample.interactionOriginIndex, samples: [sample] });
  }
  return interactions;
}

/**
 * The primary regression contract, for one interaction: motion and authority stay inside the one
 * adjacent-card envelope while every physical card remains present in the compact deck.
 */
function expectInteractionBounded(interaction: ReturnType<typeof interactionsIn>[number]) {
  const { originIndex, samples } = interaction;
  for (const sample of samples) {
    expect(Math.abs(sample.visualTopIndex - originIndex)).toBeLessThanOrEqual(1);
    expect(Math.abs(sample.authoritativeIndex - originIndex)).toBeLessThanOrEqual(1);
    // Bounded overdrag is allowed; a second pitch of physical travel is not.
    expect(Math.abs(sample.physicalIndex - originIndex)).toBeLessThan(1.5);
    if (sample.segmentTargetIndex !== null) {
      expect(Math.abs(sample.segmentTargetIndex - originIndex)).toBeLessThanOrEqual(1);
    }
    expect(sample.poses.filter((pose) => pose.role === "top")).toHaveLength(1);
    expect(sample.poses.filter((pose) => pose.role === "target").length).toBeLessThanOrEqual(1);
  }
}

/**
 * The same contract across a whole trace: each interaction began where it should have and stayed
 * inside its own envelope, while the sequence as a whole is free to travel as far as it has
 * distinct interactions.
 */
function expectBoundedInteractions(trace: readonly TraversalSample[], origins: readonly number[]) {
  const interactions = interactionsIn(trace);
  expect(interactions.map((interaction) => interaction.originIndex)).toEqual(origins);
  for (const interaction of interactions) expectInteractionBounded(interaction);
  return interactions;
}

/**
 * The stacked deck's interaction contract. One transaction may resolve at most one adjacent item
 * from where it began, and the constraint operates on the physical mass, not just on the projection:
 * the controller's own position may never enter a second same-direction segment either.
 */
function expectVisitedOnly(tops: readonly number[], originIndex: number, destinationIndex: number) {
  // A starved frame budget can cost the sampler the opening frames, so the assertion is the
  // contract rather than the sampling: the only cards the deck ever showed were these two, in this
  // order, ending on the destination. Anything else — a third card, a reversal, the wrong
  // destination, or never arriving — still fails.
  expect(tops).toEqual(tops.length === 1 ? [destinationIndex] : [originIndex, destinationIndex]);
}

/**
 * Certifies the rendered exchange pair: both physical cards stay opaque and present, and neither is
 * clipped while its persistent shell crosses depth.
 */
function expectPersistentPhysicalExchange(trace: readonly TraversalSample[]) {
  let traversingFrameCount = 0;
  for (const sample of trace) {
    if (sample.segmentPhase !== "traversing") continue;
    traversingFrameCount += 1;
    const outgoing = sample.poses[sample.segmentOriginIndex]!;
    const target = sample.poses[sample.segmentTargetIndex!]!;
    expect(outgoing).toMatchObject({ opacity: 1, role: "top", visible: true });
    expect(target).toMatchObject({ role: "target", visible: true });
    expect(outgoing.clipPath).toBe("none");
    expect(target.clipPath).toBe("none");
  }
  return traversingFrameCount;
}

function expectOneCardEnvelope(trace: readonly TraversalSample[], originIndex: number) {
  const active = trace.filter((sample) => sample.controllerPhase !== "idle");
  expect(active.length).toBeGreaterThan(3);
  for (const sample of active) {
    expect(sample.visualTopIndex).toBeGreaterThanOrEqual(originIndex - 1);
    expect(sample.visualTopIndex).toBeLessThanOrEqual(originIndex + 1);
    expect(Math.abs(sample.authoritativeIndex - originIndex)).toBeLessThanOrEqual(1);
    // Bounded overdrag is allowed; a second pitch of physical travel is not.
    expect(sample.physicalIndex).toBeGreaterThan(originIndex - 1.5);
    expect(sample.physicalIndex).toBeLessThan(originIndex + 1.5);
    if (sample.segmentTargetIndex !== null) {
      expect(Math.abs(sample.segmentTargetIndex - sample.segmentOriginIndex)).toBe(1);
      expect(sample.segmentTargetIndex).toBeGreaterThanOrEqual(originIndex - 1);
      expect(sample.segmentTargetIndex).toBeLessThanOrEqual(originIndex + 1);
    }
    expect(sample.poses.filter((pose) => pose.role === "top")).toHaveLength(1);
    expect(sample.poses.filter((pose) => pose.role === "target").length).toBeLessThanOrEqual(1);
  }
  expectPersistentPhysicalExchange(trace);
  const traversal = trace.slice(trace.findIndex((sample) => sample.controllerPhase !== "idle"));
  const tops = uniqueInOrder(traversal.map((sample) => sample.visualTopIndex));
  expect(tops.length).toBeLessThanOrEqual(3);
  expect(new Set(tops.map((top) => Math.abs(top - originIndex))).has(2)).toBe(false);
  const settled = trace.at(-1)!.settledIndex;
  expect(Math.abs(settled - originIndex)).toBeLessThanOrEqual(1);
  expectShellInventory(trace);
  return { tops, settled };
}

/** Every sampled anchor crossing keeps both physical cards opaque and the promoted pose continuous. */
function expectContinuousHandoffs(trace: readonly TraversalSample[]) {
  const crossings: {
    step: number;
    scaleJump: number;
    rotateJump: number;
    translationJump: number;
  }[] = [];
  for (let index = 1; index < trace.length; index += 1) {
    const before = trace[index - 1]!;
    const after = trace[index]!;
    if (before.controllerPhase === "idle" && after.controllerPhase === "idle") continue;
    if (before.visualTopIndex === after.visualTopIndex) continue;
    const vacated = before.poses[before.visualTopIndex]!;
    const promotedBefore = before.poses[after.visualTopIndex]!;
    const promotedAfter = after.poses[after.visualTopIndex]!;
    expect(vacated.role).toBe("top");
    expect(promotedBefore.role).toBe("target");
    expect(promotedBefore.opacity).toBe(1);
    expect(after.poses[before.visualTopIndex]).toMatchObject({ opacity: 1, visible: true });
    expect(promotedAfter).toMatchObject({ opacity: 1, visible: true });
    expect(promotedAfter.layer).toBe(promotedBefore.layer);
    crossings.push({
      step: Math.abs(after.physicalIndex - before.physicalIndex),
      scaleJump: Math.abs(promotedAfter.scale - promotedBefore.scale),
      rotateJump: Math.abs(promotedAfter.rotate - promotedBefore.rotate),
      translationJump: Math.hypot(
        promotedAfter.translateX - promotedBefore.translateX,
        promotedAfter.translateY - promotedBefore.translateY,
      ),
    });
  }
  expect(crossings.length).toBeGreaterThan(0);
  for (const crossing of crossings) {
    const proportionalAllowance = Math.max(0.02, crossing.step * 0.12);
    expect(crossing.scaleJump).toBeLessThan(proportionalAllowance);
    expect(crossing.rotateJump).toBeLessThan(Math.max(0.5, crossing.step * 5));
    expect(crossing.translationJump).toBeLessThan(
      beforeCardWidth(trace) * Math.max(0.03, crossing.step * 1.25),
    );
  }
  return crossings;
}

function beforeCardWidth(trace: readonly TraversalSample[]) {
  return trace.find((sample) => sample.cardWidth > 0)?.cardWidth ?? 1;
}

function maximumShadowAlpha(value: string) {
  return Math.max(
    0,
    ...[...value.matchAll(/rgba\(([^)]+)\)/g)].map((match) => {
      const channels = match[1]!.split(",");
      return Number(channels[3] ?? 1);
    }),
  );
}

/** A shuffle moves whole physical cards through visible overflow; package-owned wrappers never clip. */
async function expectNothingIsClipped(page: Page) {
  const result = await viewport(page).evaluate((element) => {
    const cards = [...element.querySelectorAll<HTMLElement>(".snap-motion-stacked-deck-card")].map(
      (card) => {
        const motion = card.querySelector<HTMLElement>(".snap-motion-stacked-deck-card-motion");
        return {
          cardClipPath: getComputedStyle(card).clipPath,
          // Only the wrappers Snap Motion owns. Decorative material is the consumer's, and a
          // consumer is entitled to clip the inside of its own card.
          cardOverflowX: motion === null ? "visible" : getComputedStyle(card).overflowX,
          motionClipPath: motion === null ? "none" : getComputedStyle(motion).clipPath,
          role: card.dataset.deckRole ?? "",
        };
      },
    );
    return {
      backdropContainsCard: Boolean(
        document.querySelector(".stacked-deck-backdrop .snap-motion-stacked-deck-card"),
      ),
      cards,
      documentOverflow: document.documentElement.scrollWidth - innerWidth,
      segmentPhase: element.dataset.segmentPhase ?? "",
      viewportOverflowX: getComputedStyle(element).overflowX,
    };
  });
  expect(result.viewportOverflowX).toBe("visible");
  expect(result.backdropContainsCard).toBe(false);
  expect(result.documentOverflow).toBe(0);
  for (const card of result.cards) {
    expect(card.cardClipPath).toBe("none");
    expect(card.motionClipPath).toBe("none");
    expect(card.cardOverflowX).toBe("visible");
  }
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  collectedPageErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" || /hydration|unhandled promise/i.test(message.text())) {
      errors.push(`${message.type()}: ${message.text()}`);
    }
  });
  await page.setViewportSize({ width: 1_440, height: 1_000 });
  await openLabDemo(page, "stacked-deck", "no-preference");
});

test.afterEach(async ({ page }) => {
  const unexpectedErrors = (collectedPageErrors.get(page) ?? []).filter(
    (error) => !existingResizeObserverWarning.test(error),
  );
  expect(unexpectedErrors).toEqual([]);
});

test("real pointer movement maps 1:1 to the visual top in both directions", async ({ page }) => {
  const stage = viewport(page);

  const left = await beginHeldTraversal(page, 2);
  let previousMagnitude = 0;
  for (const deltaX of [-5, -40, -120]) {
    left.elapsedMs += 120;
    await movePointer(page, left.origin, deltaX, left.elapsedMs);
    const frame = await readFrame(page);
    const top = topPose(frame);
    expect(frame.visualTopIndex).toBe(2);
    expect(top.id).toBe("map");
    expect(top.translateX).toBeLessThan(0);
    expect(Math.abs(top.translateX)).toBeGreaterThan(previousMagnitude);
    expect(Math.abs(top.translateX / deltaX)).toBeGreaterThan(0.94);
    expect(Math.abs(top.translateX / deltaX)).toBeLessThan(1.06);
    previousMagnitude = Math.abs(top.translateX);
  }
  await finishPointer(page, left.origin, -120, left.elapsedMs + 100, "pointercancel");
  await expectCarouselAt(stage, "map");

  const right = await beginHeldTraversal(page, 2);
  previousMagnitude = 0;
  for (const deltaX of [5, 40, 120]) {
    right.elapsedMs += 120;
    await movePointer(page, right.origin, deltaX, right.elapsedMs);
    const frame = await readFrame(page);
    const top = topPose(frame);
    expect(frame.visualTopIndex).toBe(2);
    expect(top.id).toBe("map");
    expect(top.translateX).toBeGreaterThan(0);
    expect(top.translateX).toBeGreaterThan(previousMagnitude);
    expect(top.translateX / deltaX).toBeGreaterThan(0.94);
    expect(top.translateX / deltaX).toBeLessThan(1.06);
    previousMagnitude = top.translateX;
  }
  await finishPointer(page, right.origin, 120, right.elapsedMs + 100, "pointercancel");
  await expectCarouselAt(stage, "map");
});

test("high-contrast exchange changes depth with body clearance and no crossing shadow", async ({
  page,
}) => {
  const stage = viewport(page);
  for (const { direction, origin } of [
    { direction: 1, origin: 3 },
    { direction: -1, origin: 4 },
  ] as const) {
    const held = await beginHeldTraversal(page, origin);
    const cardWidth = Number(await stage.getAttribute("data-card-width"));
    expect(held.pitch / cardWidth).toBeGreaterThan(0.75);
    expect(held.pitch / cardWidth).toBeLessThan(0.95);

    const readings = [] as DeckFrame[];
    for (const progress of [0.45, 0.47, 0.49, 0.5, 0.51, 0.53, 0.55]) {
      const frame = await holdPhysicalIndex(page, held, origin + direction * progress);
      expect(frame.visualTopIndex).toBe(origin);
      expectPersistentShellInventory(frame);
      const outgoing = frame.poses[origin]!;
      const target = frame.poses[origin + direction]!;
      expect(outgoing).toMatchObject({ opacity: 1, visible: true });
      expect(target).toMatchObject({ opacity: 1, visible: true });
      expect(outgoing.shadowStrength).toBeLessThanOrEqual(0.025);
      expect(target.shadowStrength).toBeLessThanOrEqual(0.025);
      expect(maximumShadowAlpha(outgoing.boxShadow)).toBeLessThanOrEqual(0.01);
      expect(maximumShadowAlpha(target.boxShadow)).toBeLessThanOrEqual(0.01);
      readings.push(frame);
    }

    const before = readings[2]!;
    const crossing = readings[3]!;
    const after = readings[4]!;
    const outgoingBefore = before.poses[origin]!;
    const targetBefore = before.poses[origin + direction]!;
    const outgoingAtCrossing = crossing.poses[origin]!;
    const targetAtCrossing = crossing.poses[origin + direction]!;
    expect(outgoingBefore.layer).toBeGreaterThan(targetBefore.layer);
    expect(outgoingAtCrossing.layer).toBeLessThan(targetAtCrossing.layer);
    expect(after.poses[origin]!.layer).toBeLessThan(after.poses[origin + direction]!.layer);
    expect(
      outgoingAtCrossing.right <= targetAtCrossing.left ||
        targetAtCrossing.right <= outgoingAtCrossing.left,
    ).toBe(true);
    expect(outgoingAtCrossing.shadowStrength).toBe(0);
    expect(targetAtCrossing.shadowStrength).toBe(0);
    const settings = crossing.poses[4]!;
    expect(settings).toMatchObject({ backgroundColor: "rgb(15, 23, 42)", tone: "ink" });
    expect(crossing.poses[3]).toMatchObject({
      backgroundColor: "rgb(248, 250, 252)",
      tone: "mist",
    });

    await finishPointer(
      page,
      held.origin,
      -direction * held.pitch * 0.55,
      held.elapsedMs + 100,
      "pointercancel",
    );
    await expectCarouselAt(stage, IDS[origin]!);
  }
});

test("successive rendered frames preserve the physical exchange shells", async ({ page }) => {
  const stage = viewport(page);
  for (const direction of [1, -1] as const) {
    await pagination(page).nth(2).click();
    await expectCarouselAt(stage, "map");
    await installTraversalTrace(page);
    await page.getByTestId(direction > 0 ? "stacked-deck-next" : "stacked-deck-previous").click();
    const trace = await readTraversalTrace(page);
    expect(expectPersistentPhysicalExchange(trace)).toBeGreaterThan(0);
    expect(expectContinuousHandoffs(trace)).toHaveLength(1);
    expectShellInventory(trace);
    await expectCarouselAt(stage, IDS[2 + direction]!);
  }
});

test("ten consecutive exchanges restore the persistent shell inventory", async ({ page }) => {
  const stage = viewport(page);
  await pagination(page).nth(2).click();
  await expectCarouselAt(stage, "map");

  for (let exchange = 0; exchange < 10; exchange += 1) {
    const movingForward = exchange % 2 === 0;
    const settledIndex = movingForward ? 3 : 2;
    await page.getByTestId(movingForward ? "stacked-deck-next" : "stacked-deck-previous").click();
    await expectCarouselAt(stage, IDS[settledIndex]!);

    const frame = await readFrame(page);
    expect(frame).toMatchObject({
      authoritativeIndex: settledIndex,
      controllerPhase: "idle",
      physicalIndex: settledIndex,
      segmentTargetIndex: null,
      settledIndex,
      visualTopIndex: settledIndex,
    });
    expectPersistentShellInventory(frame);
  }
});

test("deck thickness shows where you are, from index order alone", async ({ page }) => {
  const stage = viewport(page);
  const cardWidth = Number(await stage.getAttribute("data-card-width"));
  const edge = (layer: { left: number; right: number }, stageCentre: number) =>
    Math.max(stageCentre - layer.left, layer.right - stageCentre) - cardWidth / 2;

  // Position is legible from the persistent shells: nothing behind the first screen, nothing ahead
  // of the last, and an even split in the middle.
  for (const [index, itemIds, slots] of [
    [0, ["project", "map", "team", "settings"], [1, 2, 3, 4]],
    [2, ["templates", "project", "team", "settings"], [-2, -1, 1, 2]],
    [4, ["templates", "project", "map", "team"], [-4, -3, -2, -1]],
  ] as const) {
    await pagination(page).nth(index).click();
    await expectCarouselAt(stage, IDS[index]!);
    const frame = await readFrame(page);
    expectPersistentShellInventory(frame);
    const subordinate = frame.poses.filter((pose) => pose.index !== index);
    expect(subordinate.map((pose) => pose.id)).toEqual(itemIds);
    expect(subordinate.map((pose) => pose.index - index)).toEqual([...slots]);
    expect(subordinate.every((pose) => pose.ariaHidden === "true")).toBe(true);
    const settingsCard = subordinate.find((pose) => pose.id === "settings");
    if (settingsCard !== undefined) {
      expect(settingsCard.tone).toBe("ink");
      expect(settingsCard.backgroundColor).toBe("rgb(15, 23, 42)");
    }
    const centre = (frame.stageLeft + frame.stageRight) / 2;
    for (const card of subordinate) {
      const slot = card.index - index;
      // Each shell sits on the side its own index lies on and exposes only a compact edge.
      expect(Math.sign(card.left + card.right - 2 * centre)).toBe(Math.sign(slot));
      expect(edge(card, centre)).toBeGreaterThan(0);
      expect(edge(card, centre)).toBeLessThan(cardWidth * 0.08);
    }
    // Mirrored slots are exactly as deep as one another: neither side is favoured.
    for (const card of subordinate) {
      const slot = card.index - index;
      const mirrored = subordinate.find((other) => other.index - index === -slot);
      if (mirrored) expect(edge(mirrored, centre)).toBeCloseTo(edge(card, centre), 1);
    }
  }

  // The exchange is one physical event: the adjacent target rises out of the nearest slot on its
  // own side, while the outgoing persistent card returns to the nearest far-side slot. Previous
  // mirrors Next because the item ordering is reversed, not because the gesture direction is.
  for (const direction of [1, -1] as const) {
    await pagination(page).nth(2).click();
    await expectCarouselAt(stage, "map");
    const held = await beginHeldTraversal(page, 2);
    const opening = await holdPhysicalIndex(page, held, 2 + direction * 0.05);
    expectPersistentShellInventory(opening);
    const target = opening.poses.find((pose) => pose.role === "target")!;
    expect(Math.sign(target.translateX)).toBe(direction);
    expect(
      opening.poses
        .filter((pose) => pose.index !== 2)
        .map((pose) => Number((pose.index - opening.physicalIndex).toFixed(2))),
    ).toEqual(direction > 0 ? [-2.05, -1.05, 0.95, 1.95] : [-1.95, -0.95, 1.05, 2.05]);

    // The outgoing card reaches the nearest far-side slot on the same continuous physical path.
    const exchanging = await holdPhysicalIndex(page, held, 2 + direction * 0.95);
    expectPersistentShellInventory(exchanging);
    const vacating = exchanging.poses[2]!;
    expect(Math.sign(vacating.index - exchanging.physicalIndex)).toBe(-direction);
    expect(Math.abs(vacating.index - exchanging.physicalIndex)).toBeCloseTo(0.95, 2);
    expect(vacating.opacity).toBeGreaterThan(0);

    // A completed exchange leaves exactly the resting geometry of the card it landed on.
    const landed = await holdPhysicalIndex(page, held, 2 + direction);
    expectPersistentShellInventory(landed);
    await finishPointer(
      page,
      held.origin,
      -direction * held.pitch,
      held.elapsedMs + 400,
      "pointerup",
    );
    await expectCarouselAt(stage, IDS[2 + direction]!);
    const settled = await readFrame(page);
    expect(settled.poses.map((pose) => pose.id)).toEqual(landed.poses.map((pose) => pose.id));
  }

  // Travelling either way from the same position lays the deck out as an exact mirror.
  const mirrored: number[][] = [];
  for (const direction of [1, -1] as const) {
    await pagination(page).nth(2).click();
    await expectCarouselAt(stage, "map");
    const held = await beginHeldTraversal(page, 2);
    const frame = await holdPhysicalIndex(page, held, 2 + direction * 0.3);
    mirrored.push(
      frame.poses
        .filter((pose) => pose.index !== 2)
        .map((pose) => Number((direction * (pose.index - frame.physicalIndex)).toFixed(4)))
        .toSorted((a, b) => a - b),
    );
    await finishPointer(
      page,
      held.origin,
      -direction * held.pitch * 0.3,
      held.elapsedMs + 100,
      "pointercancel",
    );
    await expectCarouselAt(stage, "map");
  }
  expect(mirrored[0]).toEqual(mirrored[1]);
});

test("the settings physical shell retraces its geometry and material through reversal", async ({
  page,
}) => {
  const held = await beginHeldTraversal(page, 4);
  const outbound = await holdPhysicalIndex(page, held, 3.05);
  expectPersistentShellInventory(outbound);
  expect(settingsPhysicalSignature(outbound)).toMatchObject({
    backgroundColor: "rgb(15, 23, 42)",
    id: "settings",
    opacity: 1,
    tone: "ink",
  });

  const returning = await holdPhysicalIndex(page, held, 3.55);
  expectPersistentShellInventory(returning);
  const retraced = await holdPhysicalIndex(page, held, 3.05);
  expectPersistentShellInventory(retraced);
  expect(settingsPhysicalSignature(retraced)).toEqual(settingsPhysicalSignature(outbound));

  await finishPointer(page, held.origin, held.pitch * 0.95, held.elapsedMs + 100, "pointercancel");
  await expectCarouselAt(viewport(page), "settings");
});

test("one held gesture cannot discard a second card however far it travels", async ({ page }) => {
  const stage = viewport(page);
  // Reproduces the rejected recording: one uninterrupted pointer session that crossed two pitches.
  for (const direction of [1, -1] as const) {
    await pagination(page).nth(2).click();
    await expectCarouselAt(stage, "map");
    await installTraversalTrace(page);
    const gesture: HeldTraversal = {
      elapsedMs: 0,
      origin: await beginPointer(stage),
      pitch: await motionPitch(stage),
      startIndex: 2,
    };

    const held = [];
    for (const factor of [0.25, 0.9, 1.2, 2.5, 4]) {
      held.push(await holdPointerAt(page, gesture, 2 + direction * factor));
    }
    // Requesting four pitches of travel yields one pitch plus bounded resistance.
    const furthest = held.at(-1)!;
    expect(furthest.interactionOriginIndex).toBe(2);
    expect(Math.abs(furthest.physicalIndex - 2)).toBeGreaterThan(1);
    expect(Math.abs(furthest.physicalIndex - 2)).toBeLessThan(1.4);
    expect(furthest).toMatchObject({
      segmentPhase: "elastic",
      segmentTargetIndex: null,
      visualTopIndex: 2 + direction,
    });
    expectPersistentShellInventory(furthest);
    // Resistance is monotone and bounded, so the interaction never dies at a frozen card.
    expect(Math.abs(furthest.physicalIndex - 2)).toBeGreaterThan(
      Math.abs(held[2]!.physicalIndex - 2),
    );
    expect(topPose(furthest).translateX * -direction).toBeGreaterThan(0);

    await finishPointer(
      page,
      gesture.origin,
      -direction * gesture.pitch * 4,
      gesture.elapsedMs + 400,
      "pointerup",
    );
    const trace = await readTraversalTrace(page);
    const { tops, settled } = expectOneCardEnvelope(trace, 2);
    expectVisitedOnly(tops, 2, 2 + direction);
    expect(settled).toBe(2 + direction);
    await expectCarouselAt(stage, IDS[2 + direction]!);
  }

  // A held touch gesture obeys the identical envelope once its horizontal intent is claimed.
  for (const direction of [1, -1] as const) {
    const held = await beginHeldTraversal(page, 2, "touch");
    const stretched = await holdPointerAt(page, held, 2 + direction * 5);
    expect(stretched).toMatchObject({
      interactionOriginIndex: 2,
      segmentPhase: "elastic",
      segmentTargetIndex: null,
      visualTopIndex: 2 + direction,
    });
    expect(Math.abs(stretched.physicalIndex - 2)).toBeLessThan(1.4);
    expectPersistentShellInventory(stretched);
    await finishPointer(
      page,
      held.origin,
      -direction * held.pitch * 5,
      held.elapsedMs + 400,
      "pointerup",
    );
    await expectCarouselAt(stage, IDS[2 + direction]!);
  }
});

test("a violent flick from a middle card still resolves exactly one adjacent card", async ({
  page,
}) => {
  const stage = viewport(page);
  await expect(page.getByRole("spinbutton", { name: "Maximum skip", exact: true })).toBeDisabled();
  await expect(page.getByTestId("physics-note-maxAnchorSkip")).toContainText("Fixed at 1");
  await expect(stage).toHaveAttribute("data-max-anchor-skip", "1");

  for (const direction of [1, -1] as const) {
    const held = await beginHeldTraversal(page, 2);
    await installTraversalTrace(page);
    await flingHeld(page, held, direction);
    const trace = await readTraversalTrace(page);
    const { settled } = expectOneCardEnvelope(trace, 2);
    expect(settled).toBe(2 + direction);
    await expectCarouselAt(stage, IDS[2 + direction]!);
  }

  // The one permitted handoff still renders continuously under a real high-velocity drag.
  await pagination(page).first().click();
  await expectCarouselAt(stage, "templates");
  const pitch = await motionPitch(stage);
  await installTraversalTrace(page);
  await dragSyntheticPointerBy(page, stage, -pitch * 0.42, 0, {
    eventIntervalMs: 3,
    stepDelay: 0,
    steps: 4,
  });
  const trace = await readTraversalTrace(page);
  const flicked = expectOneCardEnvelope(trace, 0);
  expectVisitedOnly(flicked.tops, 0, 1);
  expect(flicked.settled).toBe(1);
  expect(expectContinuousHandoffs(trace)).toHaveLength(1);
  expect(
    trace
      .filter((sample) => sample.controllerPhase !== "idle")
      .every((sample) => sample.settledIndex === 0),
  ).toBe(true);
  expect(trace.at(-1)).toMatchObject({
    caption: TITLES[1],
    controllerPhase: "idle",
    settledIndex: 1,
    visualTopIndex: 1,
  });
  await expectCarouselAt(stage, "project");
});

test("one coalesced wheel burst exchanges one card and a later burst exchanges another", async ({
  page,
}) => {
  const stage = viewport(page);
  await pagination(page).first().click();
  await expectCarouselAt(stage, "templates");
  const pitch = await motionPitch(stage);
  const wheelSamples = await stage.evaluate(async (element, deltaX) => {
    const samples: Array<{
      origin: number;
      phase: string | undefined;
      target: number | null;
      visualTop: number;
      cards: { id: string; role: string; visible: boolean; layer: number; opacity: number }[];
    }> = [];
    for (let step = 0; step < 10; step += 1) {
      element.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaX }));
      await new Promise((resolve) => setTimeout(resolve, 25));
      samples.push({
        origin: Number(element.dataset.segmentOriginIndex),
        phase: element.dataset.phase,
        target:
          element.dataset.segmentTargetIndex === undefined
            ? null
            : Number(element.dataset.segmentTargetIndex),
        visualTop: Number(element.dataset.visualTopIndex),
        cards: [...element.querySelectorAll<HTMLElement>(".snap-motion-stacked-deck-card")].map(
          (card) => ({
            id: card.dataset.itemId ?? "",
            role: card.dataset.deckRole ?? "",
            visible: card.dataset.deckVisible === "true",
            layer: Number(card.dataset.deckLayer),
            opacity: Number(card.querySelector<HTMLElement>(".screen-chrome")!.dataset.opacity),
          }),
        ),
      });
    }
    return samples;
  }, pitch * 0.23);
  // Ten deltas worth almost two and a half pitches, coalesced into one interaction, move one card.
  expect(uniqueInOrder(wheelSamples.map((sample) => sample.visualTop))).toEqual([0, 1]);
  expect(wheelSamples.every((sample) => sample.phase === "dragging")).toBe(true);
  expect(
    wheelSamples.every(
      (sample) => sample.target === null || Math.abs(sample.target - sample.origin) === 1,
    ),
  ).toBe(true);
  expect(
    wheelSamples.every((sample) => sample.cards.map((card) => card.id).join() === IDS.join()),
  ).toBe(true);
  for (let index = 1; index < wheelSamples.length; index += 1) {
    const before = wheelSamples[index - 1]!;
    const after = wheelSamples[index]!;
    if (before.visualTop === after.visualTop) continue;
    expect(before.cards[after.visualTop]!.role).toBe("target");
    expect(before.cards[after.visualTop]!.opacity).toBe(1);
    expect(after.cards[before.visualTop]).toMatchObject({ opacity: 1, visible: true });
    expect(after.cards[after.visualTop]).toMatchObject({ layer: 500, opacity: 1, visible: true });
  }
  await expectCarouselAt(stage, "project");
  expect(await readFrame(page)).toMatchObject({
    controllerPhase: "idle",
    settledIndex: 1,
    visualTopIndex: 1,
  });

  // A later, distinct wheel interaction is free to exchange the next card.
  await stage.evaluate((element, deltaX) => {
    element.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaX }));
  }, pitch * 0.6);
  await expectCarouselAt(stage, "map");
});

test("rapid relative commands never merge into one multi-card throw", async ({ page }) => {
  const stage = viewport(page);
  await pagination(page).first().click();
  await expectCarouselAt(stage, "templates");

  // Three commands in one task, so none of them can wait for the previous transaction to settle.
  await installTraversalTrace(page);
  await page.evaluate(() => {
    const next = document.querySelector<HTMLButtonElement>('[data-testid="stacked-deck-next"]')!;
    next.click();
    next.click();
    next.click();
  });
  const clicked = await readTraversalTrace(page);
  const { tops, settled } = expectOneCardEnvelope(clicked, 0);
  expectVisitedOnly(tops, 0, 1);
  expect(settled).toBe(1);
  await expectCarouselAt(stage, "project");
  await expect(page.getByTestId("snap-motion-stacked-deck-status")).toHaveText(
    "Project 24031 — Horizon, 2 of 5",
  );

  await stage.focus();
  await installTraversalTrace(page);
  await stage.evaluate((element) => {
    for (let press = 0; press < 3; press += 1) {
      element.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "ArrowRight" }),
      );
    }
  });
  const keyed = await readTraversalTrace(page);
  const keyedEnvelope = expectOneCardEnvelope(keyed, 1);
  expectVisitedOnly(keyedEnvelope.tops, 1, 2);
  expect(keyedEnvelope.settled).toBe(2);
  await expectCarouselAt(stage, "map");

  // A settled deck accepts the next command normally, one adjacent card at a time.
  await page.getByTestId("stacked-deck-previous").click();
  await expectCarouselAt(stage, "project");
});

test("non-adjacent absolute navigation synchronizes instead of throwing every card", async ({
  page,
}) => {
  const stage = viewport(page);
  await pagination(page).first().click();
  await expectCarouselAt(stage, "templates");

  await installTraversalTrace(page, 60);
  await pagination(page).last().click();
  const trace = await readTraversalTrace(page);
  // No deck animation at all: the destination is selected, never thrown through four cards.
  expect(uniqueInOrder(trace.map((sample) => sample.visualTopIndex))).toEqual([0, 4]);
  expect(trace.every((sample) => sample.controllerPhase === "idle")).toBe(true);
  expectShellInventory(trace);
  expect(trace.at(-1)).toMatchObject({
    caption: TITLES[4],
    controllerPhase: "idle",
    settledIndex: 4,
    visualTopIndex: 4,
  });
  await expect(page.getByTestId("snap-motion-stacked-deck-status")).toHaveText(
    "Werkruimte-instellingen, 5 of 5",
  );
  await expectCarouselAt(stage, "settings");

  // Home and End follow the same rule; an adjacent dot still animates one normal card.
  await stage.focus();
  await page.keyboard.press("Home");
  await expectCarouselAt(stage, "templates");
  await expect(page.getByTestId("snap-motion-stacked-deck-status")).toHaveText(
    "Projectsjablonen, 1 of 5",
  );
  await page.keyboard.press("End");
  await expectCarouselAt(stage, "settings");
  await expect(page.getByTestId("snap-motion-stacked-deck-status")).toHaveText(
    "Werkruimte-instellingen, 5 of 5",
  );

  await installTraversalTrace(page);
  await pagination(page).nth(3).click();
  const adjacent = await readTraversalTrace(page);
  const adjacentEnvelope = expectOneCardEnvelope(adjacent, 4);
  expectVisitedOnly(adjacentEnvelope.tops, 4, 3);
  expect(adjacentEnvelope.settled).toBe(3);
  await expectCarouselAt(stage, "team");
});

test("reversal retraces the same card and changes direction only through neutral", async ({
  page,
}) => {
  const stage = viewport(page);
  const held = await beginHeldTraversal(page, 2);
  const opening = await holdPhysicalIndex(page, held, 2.2);
  const forward = await holdPhysicalIndex(page, held, 2.6);
  const retraced = await holdPhysicalIndex(page, held, 2.2);
  const neutral = await holdPhysicalIndex(page, held, 2);
  const reverse = await holdPhysicalIndex(page, held, 1.8);
  expect(topPose(forward).id).toBe("map");
  expect(topPose(retraced).id).toBe("map");
  for (let index = 0; index < IDS.length; index += 1) {
    for (const key of ["translateX", "translateY", "scale", "rotate", "opacity"] as const) {
      expect(retraced.poses[index]![key]).toBeCloseTo(opening.poses[index]![key], 4);
    }
  }
  expect(neutral).toMatchObject({
    direction: 0,
    progress: 0,
    segmentPhase: "neutral",
    segmentTargetIndex: null,
    visualTopIndex: 2,
  });
  expect(topPose(neutral).id).toBe("map");
  expect(topPose(neutral).translateX).toBeCloseTo(0, 4);
  expect(reverse).toMatchObject({
    direction: -1,
    segmentOriginIndex: 2,
    segmentTargetIndex: 1,
    visualTopIndex: 2,
  });
  expect(topPose(reverse).translateX).toBeCloseTo(-topPose(opening).translateX, 2);
  expect(
    [forward, retraced, neutral, reverse].every((frame) => frame.controllerPhase === "dragging"),
  ).toBe(true);
  await finishPointer(page, held.origin, held.pitch * 0.2, held.elapsedMs + 100, "pointercancel");
  await expectCarouselAt(stage, "map");
});

test("one gesture reverses freely across its whole envelope but never past it", async ({
  page,
}) => {
  const stage = viewport(page);
  const held = await beginHeldTraversal(page, 2);
  // Past the completed handoff, back across the origin, and out to the opposite adjacent card.
  const overdragged = await holdPointerAt(page, held, 6);
  expect(overdragged).toMatchObject({
    segmentPhase: "elastic",
    segmentTargetIndex: null,
    visualTopIndex: 3,
  });
  const retraced = await holdPhysicalIndex(page, held, 2.6);
  expect(retraced).toMatchObject({
    segmentOriginIndex: 3,
    segmentTargetIndex: 2,
    visualTopIndex: 3,
  });
  const neutral = await holdPhysicalIndex(page, held, 2);
  expect(neutral).toMatchObject({ segmentPhase: "neutral", visualTopIndex: 2 });
  const opposite = await holdPhysicalIndex(page, held, 1.4);
  expect(opposite).toMatchObject({
    segmentOriginIndex: 2,
    segmentTargetIndex: 1,
    visualTopIndex: 2,
  });
  const oppositeOverdrag = await holdPointerAt(page, held, -6);
  expect(oppositeOverdrag).toMatchObject({
    segmentPhase: "elastic",
    segmentTargetIndex: null,
    visualTopIndex: 1,
  });
  const frames = [overdragged, retraced, neutral, opposite, oppositeOverdrag];
  expect(frames.every((frame) => frame.controllerPhase === "dragging")).toBe(true);
  expect(frames.every((frame) => frame.interactionOriginIndex === 2)).toBe(true);
  expect(frames.every((frame) => Math.abs(frame.visualTopIndex - 2) <= 1)).toBe(true);
  expect(frames.every((frame) => Math.abs(frame.physicalIndex - 2) < 1.5)).toBe(true);
  frames.forEach(assertLocalSegment);
  // Release without adding a new throw: the gesture resolves the adjacent card it is resting on.
  await finishPointer(page, held.origin, held.pitch * 8, held.elapsedMs + 400, "pointerup");
  await expectCarouselAt(stage, "project");
});

test("a re-grab is a new gesture with its own envelope and no surviving velocity", async ({
  page,
}) => {
  const stage = viewport(page);

  // Release short of the segment midpoint, so the deck settles back to "map" and authority never
  // leaves it. Re-grabbing there is a fresh gesture from the same card.
  const thrown = await beginHeldTraversal(page, 2);
  await releaseHeldAtRest(page, thrown, 2.35);
  const regrab: HeldTraversal = {
    elapsedMs: 0,
    origin: await beginPointer(stage),
    pitch: thrown.pitch,
    startIndex: 2,
  };
  const beforeBoundary = await readFrame(page);
  expect(beforeBoundary.visualTopIndex).toBe(2);
  expect(beforeBoundary.interactionOriginIndex).toBe(2);
  const stretched = await holdPointerAt(page, regrab, 7);
  expect(stretched).toMatchObject({ visualTopIndex: 3, segmentTargetIndex: null });
  expect(stretched.physicalIndex).toBeLessThan(3.5);
  // Reversal inside the fresh envelope still works, so no interrupted velocity survived: the same
  // gesture crosses back over its origin and reaches the opposite adjacent card, and stops there.
  const reversed = await holdPointerAt(page, regrab, -3);
  expect(reversed).toMatchObject({ visualTopIndex: 1, segmentTargetIndex: null });
  expect(reversed.physicalIndex).toBeGreaterThan(0.5);
  // Release without a fresh throw so the gesture resolves where it is resting.
  await finishPointer(page, regrab.origin, regrab.pitch * 5, regrab.elapsedMs + 400, "pointerup");
  await expectCarouselAt(stage, "project");

  // Re-grab after visual ownership has already transferred takes the new card as its origin.
  const crossed = await beginHeldTraversal(page, 2);
  await holdPhysicalIndex(page, crossed, 2.95);
  await finishPointer(
    page,
    crossed.origin,
    -crossed.pitch * 0.95,
    crossed.elapsedMs + 400,
    "pointerup",
  );
  await expectCarouselAt(stage, "team");
  const afterHandoff: HeldTraversal = {
    elapsedMs: 0,
    origin: await beginPointer(stage),
    pitch: crossed.pitch,
    startIndex: 3,
  };
  expect((await readFrame(page)).interactionOriginIndex).toBe(3);
  expect(await holdPointerAt(page, afterHandoff, 8)).toMatchObject({
    visualTopIndex: 4,
    segmentTargetIndex: null,
  });
  await finishPointer(
    page,
    afterHandoff.origin,
    -afterHandoff.pitch * 5,
    afterHandoff.elapsedMs + 400,
    "pointerup",
  );
  await expectCarouselAt(stage, "settings");
});

test("fast successive gestures each resolve one card with no settlement cooldown", async ({
  page,
}) => {
  const stage = viewport(page);
  await pagination(page).first().click();
  await expectCarouselAt(stage, "templates");
  const pitch = await motionPitch(stage);

  await installTraversalTrace(page, 1_800, 3);
  for (let gesture = 0; gesture < 3; gesture += 1) {
    await flick(page, 1, pitch);
    // The next gesture starts the moment the deck names the new card, which is a small fraction of
    // the way into the previous spring. Waiting on that rather than on a clock keeps the test
    // measuring the contract instead of one engine's frame budget.
    if (gesture < 2) await waitForAuthority(page, gesture + 1);
  }
  const trace = await readTraversalTrace(page);

  // Three gestures, three origins, three cards — and no interaction that reached beyond its own.
  const interactions = expectBoundedInteractions(trace, [0, 1, 2]);
  expect(interactions).toHaveLength(3);
  expect(uniqueInOrder(trace.map((sample) => sample.visualTopIndex))).toEqual([0, 1, 2, 3]);
  // Each later gesture began while the previous one was still settling: never at rest.
  for (const interaction of interactions.slice(1)) {
    expect(interaction.samples[0]!.controllerPhase).not.toBe("idle");
  }
  // Cards beyond the reachable run remain parked rather than becoming traversal targets.
  expect(trace.every((sample) => sample.poses[4]!.role === "hidden")).toBe(true);
  await expectCarouselAt(stage, "team");
  expectShellInventory(trace);
});

test("a reverse gesture during settlement takes the card back immediately", async ({ page }) => {
  const stage = viewport(page);
  const pitch = await motionPitch(stage);

  await installTraversalTrace(page, 1_800, 3);
  await flick(page, 1, pitch);
  await waitForAuthority(page, 3);
  await flick(page, -1, pitch);
  await waitForAuthority(page, 2);
  await flick(page, 1, pitch);
  const trace = await readTraversalTrace(page);

  // Each reversal is answered immediately. Every gesture's origin is the card the deck named when
  // that gesture began, so the origin sequence is itself the proof that authority went 2 → 3 → 2
  // while the physical mass never completed a single pitch.
  const interactions = expectBoundedInteractions(trace, [2, 3, 2]);
  expect(interactions).toHaveLength(3);
  for (const interaction of interactions.slice(1)) {
    expect(interaction.samples[0]!.controllerPhase).not.toBe("idle");
  }
  expect(trace.every((sample) => sample.visualTopIndex === 2 || sample.visualTopIndex === 3)).toBe(
    true,
  );
  await expectCarouselAt(stage, "team");
});

test("a re-grab during settlement rebases without a jump and cannot inherit momentum", async ({
  page,
}) => {
  const stage = viewport(page);
  const pitch = await motionPitch(stage);

  // Throw hard toward "team", then grab the card back on the frame the deck first names it. The
  // sampler is armed before the throw so the grab lands on that frame and not a round trip later.
  const pointerId = nextPointerId();
  const takeover = grabOnAuthority(page, 3, pointerId);
  await flick(page, 1, pitch);
  const { frames, grabbedAt } = await takeover;
  const settling = frames.slice(0, grabbedAt).filter((frame) => frame.phase === "settling");
  const grabbed = frames.slice(grabbedAt);
  expect(settling.length).toBeGreaterThan(2);
  expect(settling.at(-1)).toMatchObject({ authoritativeIndex: 3, phase: "settling" });
  // Ownership transfers on the frame of the grab: origin, envelope, and phase are all fresh.
  expect(grabbed[0]).toMatchObject({
    authoritativeIndex: 3,
    interactionOriginIndex: 3,
    phase: "dragging",
  });

  // Nothing teleported: no property of the grabbed card moves further across the takeover than it
  // was already moving under free settlement, and the spring stops driving it underneath the hand.
  for (const key of POSE_KEYS) {
    const freeStep = Math.max(...stepsIn(settling, key), 0);
    const takeoverStep = Math.abs(grabbed[0]!.pose[key]! - settling.at(-1)!.pose[key]!);
    expect(takeoverStep).toBeLessThanOrEqual(freeStep + 1e-9);
    expect(Math.max(...stepsIn(grabbed, key), 0)).toBe(0);
  }
  expect(grabbed.every((frame) => frame.physicalIndex === grabbed[0]!.physicalIndex)).toBe(true);

  const regrab: HeldTraversal = {
    elapsedMs: 0,
    origin: await stage.evaluate((element, id) => {
      const box = element.getBoundingClientRect();
      return {
        pointerId: id,
        pointerType: "mouse" as const,
        timestamp: performance.now(),
        x: box.left + box.width / 2,
        y: box.top + box.height / 2,
      };
    }, pointerId),
    pitch,
    startIndex: 3,
  };

  // The fresh envelope is [2, 4] around the card the user grabbed, not [1, 3] around the old one.
  const forward = await holdPointerAt(page, regrab, 9);
  expect(forward).toMatchObject({ visualTopIndex: 4, segmentTargetIndex: null });
  expect(forward.physicalIndex).toBeLessThan(4.5);
  // No interrupted velocity survived: the same gesture crosses back to the opposite adjacent card.
  const backward = await holdPointerAt(page, regrab, -4);
  expect(backward).toMatchObject({ visualTopIndex: 2, segmentTargetIndex: null });
  expect(backward.physicalIndex).toBeGreaterThan(1.5);
  // Release without a fresh throw, so the gesture resolves the adjacent card it is resting on.
  await finishPointer(page, regrab.origin, regrab.pitch * 7, regrab.elapsedMs + 400, "pointerup");
  await expectCarouselAt(stage, "map");
});

test("inspection follows the authoritative card instead of waiting for mechanical rest", async ({
  page,
}) => {
  const stage = viewport(page);
  const inspect = page.getByTestId("stacked-deck-inspect");
  const pitch = await motionPitch(stage);

  await installTraversalTrace(page, 1_800);
  await flick(page, 1, pitch);
  const trace = await readTraversalTrace(page);

  const activeAt = trace.findIndex((sample) => sample.controllerPhase !== "idle");
  const enabledAt = trace.findIndex(
    (sample) => sample.inspectEnabled && sample.controllerPhase === "settling",
  );
  const restAt = trace.findIndex(
    (sample, index) => index > activeAt && sample.controllerPhase === "idle",
  );
  expect(activeAt).toBeGreaterThanOrEqual(0);
  expect(enabledAt).toBeGreaterThan(activeAt);
  expect(restAt).toBeGreaterThan(enabledAt);
  // Availability arrives while the controller is still measurably short of the anchor and the
  // durable selection has not committed — not as a rounding error on the last frame.
  expect(trace[enabledAt]!).toMatchObject({
    authoritativeIndex: 3,
    caption: TITLES[3],
    settledIndex: 2,
  });
  expect(trace[enabledAt]!.physicalIndex).toBeLessThan(2.99);
  // It never enables and then disables again on the way to rest.
  expect(trace.slice(enabledAt).every((sample) => sample.inspectEnabled)).toBe(true);
  // It is never available before physical and semantic authority agree.
  expect(trace.every((sample) => !sample.inspectEnabled || sample.authorityStable)).toBe(true);
  expect(trace.slice(activeAt, enabledAt).every((sample) => !sample.inspectEnabled)).toBe(true);
  await expectCarouselAt(stage, "team");

  // Opening during residual settlement synchronizes exactly, announces nothing wrong, and returns
  // focus to the control it came from.
  await pagination(page).nth(2).click();
  await expectCarouselAt(stage, "map");
  await flick(page, 1, pitch);
  const openedDuring = await stage.evaluate(
    (element) =>
      new Promise<{ caption: string; phase: string; position: number }>((resolve) => {
        const control = document.querySelector<HTMLButtonElement>(
          '[data-testid="stacked-deck-inspect"]',
        )!;
        const tick = () => {
          if (control.disabled) {
            requestAnimationFrame(tick);
            return;
          }
          const state = {
            caption:
              document.querySelector<HTMLElement>('[data-testid="stacked-deck-caption"]')
                ?.innerText ?? "",
            phase: element.dataset.phase ?? "",
            position: Number(element.dataset.position),
          };
          control.click();
          resolve(state);
        };
        requestAnimationFrame(tick);
      }),
  );
  expect(openedDuring.phase).toBe("settling");
  expect(openedDuring.caption).toBe(TITLES[3]);
  const gallery = page.getByTestId("snap-motion-media-gallery");
  await expect(gallery).toBeVisible();
  await expect(gallery).toHaveAttribute("data-gallery-index", "3");
  await expect(page.getByTestId("snap-motion-media-gallery-title")).toHaveText(TITLES[3]);
  await expect(page.getByTestId("snap-motion-media-gallery-close")).toBeFocused();
  await page.getByTestId("snap-motion-media-gallery-close").click();
  await expect(inspect).toBeFocused();
  // Synchronization landed on the anchor it named, with no leftover motion or disagreement.
  const after = await readFrame(page);
  expect(after).toMatchObject({
    authoritativeIndex: 3,
    controllerPhase: "idle",
    settledIndex: 3,
    visualTopIndex: 3,
  });
  await expectCarouselAt(stage, "team");
});

test("an accepted arrow from the inspection control preserves deterministic focus", async ({
  page,
}) => {
  const stage = viewport(page);
  const inspect = page.getByTestId("stacked-deck-inspect");
  await inspect.focus();
  await expect(inspect).toBeFocused();

  await inspect.press("ArrowRight");
  await expect(stage).toHaveAttribute("data-phase", "settling");
  await expect(stage).toBeFocused();
  expect(
    await page.evaluate(() => ({
      activeTestId: (document.activeElement as HTMLElement | null)?.dataset.testid ?? "",
      activeTag: document.activeElement?.tagName.toLowerCase() ?? "",
    })),
  ).toEqual({ activeTag: "div", activeTestId: "stacked-deck-viewport" });

  await expectCarouselAt(stage, "team");
  await expect(stage).toBeFocused();
  await stage.press("ArrowRight");
  await expectCarouselAt(stage, "settings");
  await expect(stage).toBeFocused();
});

test("distinct rapid commands, keys, and wheel bursts each resolve one card", async ({ page }) => {
  const stage = viewport(page);
  await pagination(page).first().click();
  await expectCarouselAt(stage, "templates");

  // Distinct clicks, each in its own task and each far inside the previous spring.
  await installTraversalTrace(page, 1_800);
  for (let click = 0; click < 3; click += 1) {
    await page.getByTestId("stacked-deck-next").click();
    if (click < 2) await page.waitForTimeout(50);
  }
  const clicked = await readTraversalTrace(page);
  expect(expectBoundedInteractions(clicked, [0, 1, 2])).toHaveLength(3);
  await expectCarouselAt(stage, "team");
  await expect(page.getByTestId("snap-motion-stacked-deck-status")).toHaveText(
    "Team & rollen, 4 of 5",
  );

  // Arrow keys obey the identical contract.
  await stage.focus();
  await installTraversalTrace(page, 1_800);
  for (let press = 0; press < 2; press += 1) {
    await page.keyboard.press("ArrowLeft");
    if (press < 1) await page.waitForTimeout(50);
  }
  const keyed = await readTraversalTrace(page);
  expect(expectBoundedInteractions(keyed, [3, 2])).toHaveLength(2);
  await expectCarouselAt(stage, "project");

  // A distinct later burst interrupts the previous spring; both remain one card each.
  const pitch = await motionPitch(stage);
  await installTraversalTrace(page, 1_800);
  await stage.evaluate(async (element, deltaX) => {
    const burst = async () => {
      for (let step = 0; step < 4; step += 1) {
        element.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaX }));
        await new Promise((resolve) => setTimeout(resolve, 16));
      }
      // Longer than the coalescing window, shorter than the spring: a genuinely new burst.
      await new Promise((resolve) => setTimeout(resolve, 130));
    };
    await burst();
    await burst();
  }, pitch * 0.3);
  const wheeled = await readTraversalTrace(page);
  // Two bursts, two cards, and every interaction the trace caught stayed inside its own envelope.
  // The outcome carries the count rather than the sampling: a starved frame budget can miss a whole
  // burst window, but it cannot move the deck two cards without two one-card interactions.
  const bursts = interactionsIn(wheeled);
  expect(bursts.length).toBeGreaterThan(0);
  expect(bursts.every((burst) => burst.originIndex === 1 || burst.originIndex === 2)).toBe(true);
  for (const burst of bursts) expectInteractionBounded(burst);
  await expectCarouselAt(stage, "team");
});

test("cancel, lost capture, edge elasticity, and reduced motion restore coherently", async ({
  page,
}) => {
  const stage = viewport(page);
  const first = await beginHeldTraversal(page, 0);
  first.elapsedMs += 100;
  await movePointer(page, first.origin, first.pitch * 0.22, first.elapsedMs);
  const firstEdge = await readFrame(page);
  expect(firstEdge).toMatchObject({
    segmentPhase: "elastic",
    segmentTargetIndex: null,
    visualTopIndex: 0,
  });
  expect(firstEdge.physicalIndex).toBeLessThan(0);
  expect(firstEdge.physicalIndex).toBeGreaterThan(-0.22);
  expect(topPose(firstEdge).translateX).toBeGreaterThan(0);
  await finishPointer(
    page,
    first.origin,
    first.pitch * 0.22,
    first.elapsedMs + 100,
    "pointercancel",
  );
  await expectCarouselAt(stage, "templates");

  const last = await beginHeldTraversal(page, 4);
  last.elapsedMs += 100;
  await movePointer(page, last.origin, -last.pitch * 0.22, last.elapsedMs);
  const lastEdge = await readFrame(page);
  expect(lastEdge).toMatchObject({
    segmentPhase: "elastic",
    segmentTargetIndex: null,
    visualTopIndex: 4,
  });
  expect(lastEdge.physicalIndex).toBeGreaterThan(4);
  expect(lastEdge.physicalIndex).toBeLessThan(4.22);
  expect(topPose(lastEdge).translateX).toBeLessThan(0);
  await finishPointer(page, last.origin, -last.pitch * 0.22, last.elapsedMs + 100, "pointercancel");
  await expectCarouselAt(stage, "settings");

  await pagination(page).nth(2).click();
  await expectCarouselAt(stage, "map");
  const lostPitch = await motionPitch(stage);
  const lostBox = (await stage.boundingBox())!;
  await stage.evaluate((element) => {
    element.addEventListener(
      "pointerdown",
      (event) => {
        (window as typeof window & { stackedDeckPointerId?: number }).stackedDeckPointerId =
          event.pointerId;
      },
      { once: true },
    );
  });
  await page.mouse.move(lostBox.x + lostBox.width / 2, lostBox.y + lostBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    lostBox.x + lostBox.width / 2 - lostPitch * 0.45,
    lostBox.y + lostBox.height / 2,
  );
  await expect(stage).toHaveAttribute("data-phase", "dragging");
  const ownedPointerId = await page.evaluate(
    () => (window as typeof window & { stackedDeckPointerId?: number }).stackedDeckPointerId,
  );
  expect(ownedPointerId).toBeDefined();
  expect(
    await stage.evaluate(
      (element, pointerId) => element.hasPointerCapture(pointerId!),
      ownedPointerId,
    ),
  ).toBe(true);
  await stage.evaluate(
    (element, pointerId) => element.releasePointerCapture(pointerId!),
    ownedPointerId,
  );
  await page.mouse.up();
  await expectCarouselAt(stage, "map");

  // A gesture that took over a running spring still cancels back to its own settled selection, and
  // leaves no stale interaction behind.
  const takeoverPitch = await motionPitch(stage);
  await flick(page, 1, takeoverPitch);
  await waitForAuthority(page, 3);
  const cancelled: HeldTraversal = {
    elapsedMs: 0,
    origin: await beginPointer(stage),
    pitch: takeoverPitch,
    startIndex: 3,
  };
  await holdPointerAt(page, cancelled, 3.6);
  await finishPointer(
    page,
    cancelled.origin,
    -cancelled.pitch * 0.6,
    cancelled.elapsedMs + 100,
    "pointercancel",
  );
  await expectCarouselAt(stage, "team");
  expect(await readFrame(page)).toMatchObject({
    authoritativeIndex: 3,
    interactionOriginIndex: -1,
    interactionOwned: false,
    settledIndex: 3,
    visualTopIndex: 3,
  });

  // The same for capture loss taken over a running spring.
  await flick(page, -1, takeoverPitch);
  await waitForAuthority(page, 2);
  const lost: HeldTraversal = {
    elapsedMs: 0,
    origin: await beginPointer(stage),
    pitch: takeoverPitch,
    startIndex: 2,
  };
  await holdPointerAt(page, lost, 2.5);
  await finishPointer(page, lost.origin, -lost.pitch * 0.5, lost.elapsedMs + 100, "pointercancel");
  await expectCarouselAt(stage, "map");

  await page.getByTestId("reduced-motion-mode").selectOption("reduce");
  const reduced = await beginHeldTraversal(page, 2);
  const reducedFrame = await holdPhysicalIndex(page, reduced, 2.55);
  expect(topPose(reducedFrame).translateX).toBeLessThan(-reduced.pitch * 0.55);
  expect(reducedFrame.poses.every((pose) => pose.rotate === 0)).toBe(true);
  expect(topPose(reducedFrame).translateY).toBeGreaterThan(0);
  expect(topPose(reducedFrame).scale).toBeGreaterThan(0.95);
  expect(topPose(reducedFrame).scale).toBeLessThan(1);
  // Ownership still has to migrate, and depth still has to read as a pile.
  expect(topPose(reducedFrame)).toMatchObject({ visible: true });
  expect(topPose(reducedFrame).opacity).toBe(1);
  expect(topPose(reducedFrame).clipPath).toBe("none");
  expect(reducedFrame.poses.find((pose) => pose.role === "target")!.scale).toBeLessThan(1);
  expectPersistentShellInventory(reducedFrame);

  // Reduced motion keeps the same interaction span: one adjacent card, then bounded resistance.
  const reducedSecond = await holdPointerAt(page, reduced, 3.6);
  expect(reducedSecond).toMatchObject({
    visualTopIndex: 3,
    segmentOriginIndex: 3,
    segmentTargetIndex: null,
    segmentPhase: "elastic",
  });
  expect(reducedSecond.physicalIndex).toBeLessThan(3.5);
  expectPersistentShellInventory(reducedSecond);
  expect(
    reducedSecond.poses.filter(
      (pose) =>
        pose.index !== reducedSecond.visualTopIndex && pose.index < reducedSecond.physicalIndex,
    ),
  ).toHaveLength(3);
  const reducedThird = await holdPointerAt(page, reduced, 6);
  expect(reducedThird.visualTopIndex).toBe(3);
  expectPersistentShellInventory(reducedThird);
  await finishPointer(
    page,
    reduced.origin,
    -reduced.pitch * 4,
    reduced.elapsedMs + 100,
    "pointercancel",
  );
  // A cancelled gesture restores the settled selection and cannot leave the deck two cards away.
  await expectCarouselAt(stage, "map");
});

test("responsive bleed surface avoids internal clipping and page overflow", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium",
    "Chromium owns the full responsive geometry matrix.",
  );
  const stage = viewport(page);
  for (const width of [360, 390, 768, 1_024, 1_440]) {
    await page.setViewportSize({ width, height: width < 600 ? 900 : 1_000 });
    await pagination(page).nth(2).click();
    await expectCarouselAt(stage, "map");
    await expectNothingIsClipped(page);

    for (const direction of [-1, 1] as const) {
      const held = await beginHeldTraversal(page, 2);
      // The opening response remains direct and fully opaque at every responsive tuning profile.
      const direct = await holdPhysicalIndex(page, held, 2 + direction * 0.2);
      const directTop = topPose(direct);
      expect(directTop.opacity).toBe(1);
      expect(Math.sign(directTop.translateX)).toBe(-direction);
      expect(Math.abs(directTop.translateX / (held.pitch * 0.2))).toBeLessThan(1.08);

      // The depth swap occurs at spatial clearance, then the target remains inside its stage while
      // the outgoing physical card returns behind it without creating document overflow.
      const crossing = await holdPhysicalIndex(page, held, 2 + direction * 0.5);
      const crossingTop = topPose(crossing);
      const crossingTarget = crossing.poses.find((pose) => pose.role === "target")!;
      expect(crossingTop.layer).toBeLessThan(crossingTarget.layer);
      expect(
        crossingTop.right <= crossingTarget.left || crossingTarget.right <= crossingTop.left,
      ).toBe(true);
      const late = await holdPhysicalIndex(page, held, 2 + direction * 0.96);
      const lateTop = topPose(late);
      const target = late.poses.find((pose) => pose.role === "target")!;
      expect(lateTop.opacity).toBe(1);
      expect(target.opacity).toBe(1);
      expect(target.layer).toBeGreaterThan(lateTop.layer);
      expect(target.left).toBeGreaterThanOrEqual(late.stageLeft - 0.75);
      expect(target.right).toBeLessThanOrEqual(late.stageRight + 0.75);
      // The parked physical shells compact continuously rather than sitting still behind the pair.
      expect(late.poses.map((pose) => pose.translateX)).not.toEqual(
        direct.poses.map((pose) => pose.translateX),
      );
      expectPersistentShellInventory(late);
      expectPersistentShellInventory(direct);
      await expectNothingIsClipped(page);
      await finishPointer(
        page,
        held.origin,
        -direction * held.pitch * 0.96,
        held.elapsedMs + 100,
        "pointercancel",
      );
      await expectCarouselAt(stage, "map");
    }

    // A held drag far past one pitch resists inside the stage instead of starting a second discard.
    const overdrag = await beginHeldTraversal(page, 2);
    const stretched = await holdPointerAt(page, overdrag, 8);
    expect(stretched).toMatchObject({ visualTopIndex: 3, segmentTargetIndex: null });
    expectPersistentShellInventory(stretched);
    expect(topPose(stretched).left).toBeGreaterThanOrEqual(stretched.stageLeft - 0.75);
    expect(topPose(stretched).right).toBeLessThanOrEqual(stretched.stageRight + 0.75);
    await expectNothingIsClipped(page);
    await finishPointer(
      page,
      overdrag.origin,
      -overdrag.pitch * 6,
      overdrag.elapsedMs + 100,
      "pointercancel",
    );
    await expectCarouselAt(stage, "map");

    await pagination(page).first().click();
    await expectCarouselAt(stage, "templates");
    await installTraversalTrace(page, 60);
    await pagination(page).last().click();
    const trace = await readTraversalTrace(page);
    expect(uniqueInOrder(trace.map((sample) => sample.visualTopIndex))).toEqual([0, 4]);
    await expectNothingIsClipped(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  }
});

test("three-card narrow consumers contain document width through every exchange frame", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openLabDemo(page, "stacked-deck-overflow", "reduce");
  const root = page.getByTestId("stacked-deck-overflow-root");
  const reports: Array<{
    direction: "initial" | "next" | "previous";
    frames: readonly NarrowPageFrame[];
    geometry: Awaited<ReturnType<typeof readNarrowPageGeometry>>;
    variant: "media" | "minimal";
  }> = [];
  for (const variant of ["media", "minimal"] as const) {
    await page.getByTestId(`stacked-deck-overflow-${variant}`).click();
    await expect(root).toHaveAttribute("data-active-id", "template-editor");
    await expect(root).toHaveAttribute("data-settled-id", "template-editor");
    await expect(root).toHaveAttribute("data-phase", "idle");
    reports.push({
      direction: "initial",
      frames: [],
      geometry: await readMeasuredNarrowPageGeometry(page),
      variant,
    });

    await installNarrowPageTrace(page, "project-detail");
    await root.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(root).toHaveAttribute("data-active-id", "project-detail");
    await expect(root).toHaveAttribute("data-settled-id", "project-detail");
    await expect(root).toHaveAttribute("data-phase", "idle");
    await expect(page.getByTestId("snap-motion-stacked-deck-status")).toHaveText(
      "Projectdetail met projectinformatie, locatie en dossierstatus, 1 of 3",
    );
    reports.push({
      direction: "previous",
      frames: await readNarrowPageTrace(page),
      geometry: await readMeasuredNarrowPageGeometry(page),
      variant,
    });

    await page.getByTestId("stacked-deck-overflow-reset").click();
    await expect(root).toHaveAttribute("data-active-id", "template-editor");
    await expect(root).toHaveAttribute("data-settled-id", "template-editor");
    await installNarrowPageTrace(page, "review-activity");
    await root.focus();
    await page.keyboard.press("ArrowRight");
    await expect(root).toHaveAttribute("data-active-id", "review-activity");
    await expect(root).toHaveAttribute("data-settled-id", "review-activity");
    await expect(root).toHaveAttribute("data-phase", "idle");
    reports.push({
      direction: "next",
      frames: await readNarrowPageTrace(page),
      geometry: await readMeasuredNarrowPageGeometry(page),
      variant,
    });
  }

  await testInfo.attach("stacked-deck-narrow-page-geometry", {
    body: JSON.stringify(reports, null, 2),
    contentType: "application/json",
  });
  for (const report of reports) {
    expect(
      report.geometry.root.clientWidth,
      `${report.variant} ${report.direction} root width`,
    ).toBe(280);
    expect(
      report.geometry.stage.clientWidth,
      `${report.variant} ${report.direction} stage width`,
    ).toBe(280);
    expect(report.geometry.cardWidthProperty).toBe("192px");
    expect(report.geometry.rootContain).toBe("layout");
    expect(report.geometry.rootOverflowX).toBe("visible");
    expect(report.geometry.rootOverflowY).toBe("visible");
    expect(
      report.geometry.document.scrollWidth,
      `${report.variant} ${report.direction} document width`,
    ).toBe(report.geometry.document.clientWidth);
    expect(
      report.geometry.document.bodyScrollWidth,
      `${report.variant} ${report.direction} body width`,
    ).toBe(report.geometry.document.clientWidth);
    for (const card of report.geometry.cards) {
      expect(card.outer.clientWidth).toBe(report.geometry.root.clientWidth);
      if (card.visible === "true") {
        expect(card.outer.scrollWidth).toBe(card.outer.clientWidth);
        expect(card.motion.rect.left).toBeGreaterThanOrEqual(report.geometry.root.rect.left);
        expect(card.motion.rect.right).toBeLessThanOrEqual(report.geometry.root.rect.right);
      }
      expect(card.slottedChild.scrollWidth).toBeLessThanOrEqual(card.motion.clientWidth);
    }
    if (report.direction !== "initial") {
      const expectedSettledId =
        report.direction === "previous" ? "project-detail" : "review-activity";
      expect(
        report.frames.length,
        `${report.variant} ${report.direction} sampled reduced-motion exchange frames`,
      ).toBeGreaterThanOrEqual(2);
      expect(report.frames[0]).toMatchObject({
        activeId: "template-editor",
        settledId: "template-editor",
      });
      expect(report.frames.at(-1)).toMatchObject({
        activeId: expectedSettledId,
        phase: "idle",
        settledId: expectedSettledId,
      });
      for (const [frameIndex, frame] of report.frames.entries()) {
        const label = `${report.variant} ${report.direction} frame ${frameIndex}`;
        expect(frame.rootContain, `${label} layout containment`).toBe("layout");
        expect(frame.rootOverflowX, `${label} horizontal overflow`).toBe("visible");
        expect(frame.rootOverflowY, `${label} vertical overflow`).toBe("visible");
        expect(frame.documentScrollWidth, `${label} document width`).toBe(
          frame.documentClientWidth,
        );
        expect(frame.bodyScrollWidth, `${label} body width`).toBe(frame.documentClientWidth);
      }
    }
  }
});

test("named metadata follows visual authority, ownership follows the anchor", async ({ page }) => {
  const stage = viewport(page);
  const held = await beginHeldTraversal(page, 2);
  const midway = await holdPhysicalIndex(page, held, 2.4);
  expect(midway).toMatchObject({
    authoritativeIndex: 2,
    authorityStable: false,
    caption: TITLES[2],
    counter: "3",
    visualTopIndex: 2,
  });
  expect(topPose(midway)).toMatchObject({ id: "map", opacity: 1, role: "top" });

  // Just short of the midpoint the outgoing card still occupies the slot, so it keeps its name.
  const contested = await holdPhysicalIndex(page, held, 2.52);
  expect(contested).toMatchObject({
    authoritativeIndex: 2,
    authorityStable: false,
    caption: TITLES[2],
    counter: "3",
    visualTopIndex: 2,
  });

  // Past it the incoming card is both semantically authoritative and physically above the outgoing
  // card, even though settled selection and the mechanical anchor remain behind.
  const migrated = await holdPhysicalIndex(page, held, 2.56);
  expect(migrated).toMatchObject({
    authoritativeIndex: 3,
    caption: TITLES[3],
    counter: "4",
    settledIndex: 2,
    visualTopIndex: 2,
  });
  expect(
    await page
      .locator(".snap-motion-stacked-deck-card[aria-current='true']")
      .getAttribute("data-item-id"),
  ).toBe("team");
  expect(migrated.authorityStable).toBe(true);
  expect(topPose(migrated).visible).toBe(true);

  // Near the anchor both persistent cards remain opaque; depth, not opacity, keeps the target
  // physically authoritative while the outgoing card returns to its compact pile slot.
  const uncontested = await holdPhysicalIndex(page, held, 2.95);
  expect(uncontested).toMatchObject({
    authoritativeIndex: 3,
    authorityStable: true,
    caption: TITLES[3],
    settledIndex: 2,
    visualTopIndex: 2,
  });
  expect(topPose(uncontested)).toMatchObject({ id: "map", opacity: 1, role: "top", visible: true });
  const promoted = uncontested.poses.find((pose) => pose.role === "target")!;
  expect(promoted.layer).toBeGreaterThan(topPose(uncontested).layer);
  expect(Math.abs(promoted.translateX)).toBeLessThan(4);
  expect(promoted.scale).toBeGreaterThan(0.997);
  // The pointer still holds the deck, so inspection stays unavailable for that reason alone.
  await expect(page.getByTestId("stacked-deck-inspect")).toBeDisabled();

  const after = await holdPhysicalIndex(page, held, 3);
  expect(after).toMatchObject({
    authoritativeIndex: 3,
    caption: TITLES[3],
    counter: "4",
    visualTopIndex: 3,
  });
  expect(after.settledIndex).toBe(2);
  await expect(page.getByTestId("snap-motion-stacked-deck-status")).toBeEmpty();
  await releaseHeldAtRest(page, held, 3);
  await expectCarouselAt(stage, "team");
  await expect(page.getByTestId("snap-motion-stacked-deck-status")).toHaveText(
    "Team & rollen, 4 of 5",
  );
  await expect(page.getByTestId("stacked-deck-inspect")).toBeEnabled();
});

test("authority holds through jitter around the handoff instead of oscillating", async ({
  page,
}) => {
  const held = await beginHeldTraversal(page, 2);
  // Below the band, at it, and above it: identity changes exactly where it is meant to.
  expect((await holdPhysicalIndex(page, held, 2.45)).authoritativeIndex).toBe(2);
  expect((await holdPhysicalIndex(page, held, 2.52)).authoritativeIndex).toBe(2);
  expect((await holdPhysicalIndex(page, held, 2.56)).authoritativeIndex).toBe(3);
  // Having crossed, the incoming card keeps identity across the dead band and everything past it,
  // so a hand shaking on the boundary cannot rename the deck.
  for (const physicalIndex of [2.5, 2.48, 2.7, 2.47, 2.95, 2.52, 2.9]) {
    const frame = await holdPhysicalIndex(page, held, physicalIndex);
    expect(frame).toMatchObject({ authoritativeIndex: 3, caption: TITLES[3], visualTopIndex: 2 });
  }
  // Retracing clear of the band hands identity back, once, and it stays back through the same band.
  expect((await holdPhysicalIndex(page, held, 2.44)).authoritativeIndex).toBe(2);
  expect((await holdPhysicalIndex(page, held, 2.5)).authoritativeIndex).toBe(2);
  expect((await holdPhysicalIndex(page, held, 2.53)).authoritativeIndex).toBe(2);
  expect((await holdPhysicalIndex(page, held, 2.6)).authoritativeIndex).toBe(3);
  // Reversing through neutral into the opposite segment cannot leave authority stranded.
  expect((await holdPhysicalIndex(page, held, 2)).authoritativeIndex).toBe(2);
  expect((await holdPhysicalIndex(page, held, 1.5)).authoritativeIndex).toBe(2);
  expect((await holdPhysicalIndex(page, held, 1.4)).authoritativeIndex).toBe(1);
  await finishPointer(page, held.origin, held.pitch * 0.6, held.elapsedMs + 400, "pointercancel");
  await expectCarouselAt(viewport(page), "map");
});

test("inspection, visual semantics, and accessibility expose one authoritative card", async ({
  page,
}) => {
  const stage = viewport(page);
  const inspect = page.getByTestId("stacked-deck-inspect");
  await expect(inspect).toHaveAttribute(
    "aria-label",
    "Inspect Locatie & planning in screen gallery, 3 of 5",
  );
  const held = await beginHeldTraversal(page, 2);
  await holdPhysicalIndex(page, held, 3);
  const semanticCards = await page.locator(".snap-motion-stacked-deck-card").evaluateAll((cards) =>
    cards.map((item) => ({
      current: item.getAttribute("aria-current"),
      hidden: item.getAttribute("aria-hidden"),
      id: (item as HTMLElement).dataset.itemId,
    })),
  );
  expect(semanticCards.filter((item) => item.current === "true")).toEqual([
    { current: "true", hidden: "true", id: "team" },
  ]);
  // Pointer ownership keeps every card inert until the gesture releases, even though visual
  // identity has already migrated to one unambiguous card.
  expect(semanticCards.filter((item) => item.hidden === "true")).toHaveLength(5);
  await releaseHeldAtRest(page, held, 3);
  await expectCarouselAt(stage, "team");
  await expect(
    page.locator(".snap-motion-stacked-deck-card[aria-current='true']"),
  ).not.toHaveAttribute("aria-hidden", "true");
  await inspect.click();
  await expect(page.getByTestId("snap-motion-media-gallery")).toBeVisible();
  await expect(page.getByTestId("snap-motion-media-gallery-close")).toBeFocused();
  await page.getByTestId("snap-motion-media-gallery-close").click();
  await expect(inspect).toBeFocused();

  const accessibility = await new AxeBuilder({ page }).include(".stacked-deck-demo").analyze();
  expect(accessibility.violations).toEqual([]);
});
