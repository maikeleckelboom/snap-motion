import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

import { dragSyntheticPointerBy, expectCarouselAt, openLabDemo } from "./helpers";

const IDS = ["templates", "project", "map", "team", "settings"] as const;
const TITLES = [
  "Projectsjablonen",
  "Project 24031 — Horizon",
  "Locatie & planning",
  "Team & rollen",
  "Werkruimte-instellingen",
] as const;
let nextPointerId = 617;
const existingResizeObserverWarning =
  /ResizeObserver loop completed with undelivered notifications\./;
const collectedPageErrors = new WeakMap<Page, string[]>();
test.describe.configure({ timeout: 60_000 });

function viewport(page: Page) {
  return page.getByTestId("stacked-deck-viewport");
}

function pagination(page: Page) {
  return page.getByRole("group", { name: "Stacked deck screens" }).getByRole("button");
}

async function motionPitch(target: Locator) {
  const pitch = Number(await target.getAttribute("data-motion-pitch"));
  if (!Number.isFinite(pitch) || pitch <= 0) {
    throw new Error(`Expected a positive stacked-deck motion pitch, received ${pitch}.`);
  }
  return pitch;
}

interface PointerOrigin {
  readonly pointerId: number;
  readonly pointerType: "mouse" | "pen" | "touch";
  readonly timestamp: number;
  readonly x: number;
  readonly y: number;
}

async function beginPointer(
  target: Locator,
  pointerType: PointerOrigin["pointerType"] = "mouse",
): Promise<PointerOrigin> {
  return target.evaluate(
    (element, input) => {
      const box = element.getBoundingClientRect();
      const origin = {
        pointerId: input.pointerId,
        pointerType: input.pointerType,
        timestamp: performance.now(),
        x: box.left + box.width / 2,
        y: box.top + box.height / 2,
      };
      const event = new PointerEvent("pointerdown", {
        bubbles: true,
        button: 0,
        buttons: 1,
        cancelable: true,
        clientX: origin.x,
        clientY: origin.y,
        isPrimary: true,
        pointerId: origin.pointerId,
        pointerType: origin.pointerType,
      });
      Object.defineProperty(event, "timeStamp", { value: origin.timestamp });
      element.dispatchEvent(event);
      return origin;
    },
    { pointerId: nextPointerId++, pointerType },
  );
}

async function movePointer(page: Page, origin: PointerOrigin, deltaX: number, elapsedMs: number) {
  await page.evaluate(
    ({ deltaX: moveX, elapsedMs: elapsed, origin: start }) => {
      const event = new PointerEvent("pointermove", {
        bubbles: true,
        button: 0,
        buttons: 1,
        cancelable: true,
        clientX: start.x + moveX,
        clientY: start.y,
        isPrimary: true,
        pointerId: start.pointerId,
        pointerType: start.pointerType,
      });
      Object.defineProperty(event, "timeStamp", { value: start.timestamp + elapsed });
      window.dispatchEvent(event);
    },
    { deltaX, elapsedMs, origin },
  );
}

async function finishPointer(
  page: Page,
  origin: PointerOrigin,
  deltaX: number,
  elapsedMs: number,
  type: "pointerup" | "pointercancel",
) {
  await page.evaluate(
    ({ deltaX: moveX, elapsedMs: elapsed, origin: start, type: eventType }) => {
      const event = new PointerEvent(eventType, {
        bubbles: true,
        button: 0,
        buttons: 0,
        cancelable: true,
        clientX: start.x + moveX,
        clientY: start.y,
        isPrimary: true,
        pointerId: start.pointerId,
        pointerType: start.pointerType,
      });
      Object.defineProperty(event, "timeStamp", { value: start.timestamp + elapsed });
      window.dispatchEvent(event);
    },
    { deltaX, elapsedMs, origin, type },
  );
}

interface HeldTraversal {
  elapsedMs: number;
  readonly origin: PointerOrigin;
  readonly pitch: number;
  readonly startIndex: number;
}

async function beginHeldTraversal(
  page: Page,
  startIndex: number,
  pointerType: PointerOrigin["pointerType"] = "mouse",
): Promise<HeldTraversal> {
  const stage = viewport(page);
  await pagination(page).nth(startIndex).click();
  await expectCarouselAt(stage, IDS[startIndex]!);
  return {
    elapsedMs: 0,
    origin: await beginPointer(stage, pointerType),
    pitch: await motionPitch(stage),
    startIndex,
  };
}

async function holdPhysicalIndex(page: Page, held: HeldTraversal, physicalIndex: number) {
  const frame = await holdPointerAt(page, held, physicalIndex);
  expect(frame.physicalIndex).toBeCloseTo(physicalIndex, 3);
  return frame;
}

/**
 * Requests a physical index without asserting it. Beyond the interaction envelope the deck resists
 * rather than following, so the request and the result deliberately diverge.
 */
async function holdPointerAt(page: Page, held: HeldTraversal, physicalIndex: number) {
  held.elapsedMs += 100;
  await movePointer(
    page,
    held.origin,
    (held.startIndex - physicalIndex) * held.pitch,
    held.elapsedMs,
  );
  return readFrame(page);
}

/** Releases with a violent same-direction throw the release resolver cannot honour twice. */
async function flingHeld(page: Page, held: HeldTraversal, direction: -1 | 1) {
  const deltaX = -direction * held.pitch * 6;
  held.elapsedMs += 8;
  await movePointer(page, held.origin, deltaX, held.elapsedMs);
  held.elapsedMs += 8;
  await movePointer(page, held.origin, deltaX * 1.5, held.elapsedMs);
  held.elapsedMs += 8;
  await finishPointer(page, held.origin, deltaX * 1.5, held.elapsedMs, "pointerup");
}

async function releaseHeldAtRest(page: Page, held: HeldTraversal, physicalIndex: number) {
  const deltaX = (held.startIndex - physicalIndex) * held.pitch;
  held.elapsedMs += 600;
  await movePointer(page, held.origin, deltaX, held.elapsedMs);
  await finishPointer(page, held.origin, deltaX, held.elapsedMs + 40, "pointerup");
}

async function readFrame(page: Page) {
  return viewport(page).evaluate((element) => {
    const stageBox = element.getBoundingClientRect();
    const poses = [...document.querySelectorAll<HTMLElement>(".stacked-deck-card")].map((item) => {
      const motion = item.querySelector<HTMLElement>(".stacked-deck-card-motion")!;
      const surface = item.querySelector<HTMLElement>(".screen-chrome")!;
      const box = surface.getBoundingClientRect();
      const style = getComputedStyle(item);
      return {
        ariaCurrent: item.getAttribute("aria-current"),
        ariaHidden: item.getAttribute("aria-hidden"),
        bottom: box.bottom,
        height: box.height,
        id: item.dataset.screenId ?? "",
        interactive: item.dataset.interactive === "true",
        layer: Number(item.dataset.layer),
        left: box.left,
        motionClipPath: getComputedStyle(motion).clipPath,
        opacity: Number(item.dataset.opacity),
        pointerEvents: style.pointerEvents,
        right: box.right,
        role: item.dataset.role ?? "",
        rotate: Number(item.dataset.rotate),
        scale: Number(item.dataset.scale),
        shadowStrength: Number(item.dataset.shadowStrength),
        top: box.top,
        translateX: Number(item.dataset.translateX),
        translateY: Number(item.dataset.translateY),
        visibility: style.visibility,
        visible: item.dataset.visible === "true",
        width: box.width,
      };
    });
    const pile = [...document.querySelectorAll<HTMLElement>(".stacked-deck-pile-layer")].map(
      (item) => {
        const box = item.getBoundingClientRect();
        return {
          depth: Number(item.dataset.pileDepth),
          layer: Number(item.dataset.pileLayer),
          left: Number(box.left.toFixed(3)),
          right: Number(box.right.toFixed(3)),
          top: Number(box.top.toFixed(3)),
          bottom: Number(box.bottom.toFixed(3)),
          ariaHidden: item.getAttribute("aria-hidden"),
        };
      },
    );
    const targetAttribute = element.getAttribute("data-segment-target-index");
    return {
      caption:
        document.querySelector<HTMLElement>('[data-testid="stacked-deck-caption"]')?.innerText ??
        "",
      cardWidth: Number(element.dataset.cardWidth),
      controllerPhase: element.dataset.phase ?? "",
      counter:
        document.querySelector<HTMLElement>('[data-testid="stacked-deck-counter"]')?.innerText ??
        "",
      interactionBusy: element.dataset.interactionBusy === "true",
      interactionOriginIndex: Number(element.dataset.interactionOriginIndex),
      maxAnchorSkip: Number(element.dataset.maxAnchorSkip),
      direction: Number(element.dataset.segmentDirection),
      physicalIndex: Number(element.dataset.physicalIndex),
      progress: Number(element.dataset.segmentProgress),
      segmentOriginIndex: Number(element.dataset.segmentOriginIndex),
      segmentPhase: element.dataset.segmentPhase ?? "",
      segmentTargetIndex: targetAttribute === null ? null : Number(targetAttribute),
      settledIndex: Number(element.dataset.settledIndex),
      signedLocalDistance: Number(element.dataset.signedLocalDistance),
      stageBottom: stageBox.bottom,
      stageLeft: stageBox.left,
      stageRight: stageBox.right,
      stageTop: stageBox.top,
      stageWidth: stageBox.width,
      visualTopIndex: Number(element.dataset.visualTopIndex),
      pile,
      poses,
    };
  });
}

type DeckFrame = Awaited<ReturnType<typeof readFrame>>;

function topPose(frame: DeckFrame) {
  const pose = frame.poses.find((candidate) => candidate.role === "top");
  if (!pose) throw new Error("Deck frame has no visual top card.");
  return pose;
}

/**
 * Rendered dominance of the active exchange, measured from real boxes rather than pose numbers.
 * `targetVisibility` is the share of the target shown at full strength; `outgoingDominance` is the
 * outgoing card's remaining rendered weight.
 */
function dominance(frame: DeckFrame) {
  const outgoing = topPose(frame);
  const target = frame.poses.find((candidate) => candidate.role === "target");
  if (!target) throw new Error("Deck frame has no adjacent target.");
  const overlap = Math.max(
    0,
    Math.min(outgoing.right, target.right) - Math.max(outgoing.left, target.left),
  );
  const exposed = 1 - overlap / target.width;
  return {
    exposed,
    targetVisibility: 1 - (1 - exposed) * outgoing.opacity,
    outgoingDominance: outgoing.opacity * outgoing.scale * outgoing.scale,
  };
}

function assertLocalSegment(frame: Awaited<ReturnType<typeof readFrame>>) {
  if (frame.segmentTargetIndex === null) return;
  expect(Math.abs(frame.segmentTargetIndex - frame.segmentOriginIndex)).toBe(1);
  expect(frame.segmentOriginIndex).toBe(frame.visualTopIndex);
}

interface TraversalSample {
  readonly caption: string;
  readonly controllerPhase: string;
  readonly direction: number;
  readonly interactionOriginIndex: number;
  readonly physicalIndex: number;
  readonly progress: number;
  readonly segmentOriginIndex: number;
  readonly segmentPhase: string;
  readonly segmentTargetIndex: number | null;
  readonly settledIndex: number;
  readonly visualTopIndex: number;
  readonly poses: readonly {
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
  readonly pile: readonly number[];
  readonly cardWidth: number;
}

/**
 * Samples every rendered frame until the deck settles. `maxFrames` also bounds a trace that never
 * leaves idle, which is exactly what a direct absolute synchronization must look like.
 */
async function installTraversalTrace(page: Page, maxFrames = 900) {
  await viewport(page).evaluate((element, frameBudget) => {
    const trace: TraversalSample[] = [];
    const state = { done: false, started: false, trace };
    (
      window as typeof window & {
        stackedDeckTraversalTrace?: typeof state;
      }
    ).stackedDeckTraversalTrace = state;
    let remainingFrames = frameBudget;
    const sample = () => {
      const controllerPhase = element.dataset.phase ?? "";
      if (controllerPhase !== "idle") state.started = true;
      const targetAttribute = element.getAttribute("data-segment-target-index");
      trace.push({
        caption:
          document.querySelector<HTMLElement>('[data-testid="stacked-deck-caption"]')?.innerText ??
          "",
        cardWidth: Number(element.dataset.cardWidth),
        controllerPhase,
        direction: Number(element.dataset.segmentDirection),
        interactionOriginIndex: Number(element.dataset.interactionOriginIndex),
        physicalIndex: Number(element.dataset.physicalIndex),
        progress: Number(element.dataset.segmentProgress),
        segmentOriginIndex: Number(element.dataset.segmentOriginIndex),
        segmentPhase: element.dataset.segmentPhase ?? "",
        segmentTargetIndex: targetAttribute === null ? null : Number(targetAttribute),
        settledIndex: Number(element.dataset.settledIndex),
        visualTopIndex: Number(element.dataset.visualTopIndex),
        poses: [...document.querySelectorAll<HTMLElement>(".stacked-deck-card")].map((item) => ({
          id: item.dataset.screenId ?? "",
          layer: Number(item.dataset.layer),
          opacity: Number(item.dataset.opacity),
          role: item.dataset.role ?? "",
          rotate: Number(item.dataset.rotate),
          scale: Number(item.dataset.scale),
          translateX: Number(item.dataset.translateX),
          translateY: Number(item.dataset.translateY),
          visible: item.dataset.visible === "true",
        })),
        pile: [...document.querySelectorAll<HTMLElement>(".stacked-deck-pile-layer")].flatMap(
          (item) => {
            const box = item.getBoundingClientRect();
            return [
              Number(box.left.toFixed(2)),
              Number(box.top.toFixed(2)),
              Number(box.width.toFixed(2)),
            ];
          },
        ),
      });
      remainingFrames -= 1;
      if ((state.started && controllerPhase === "idle") || remainingFrames <= 0) {
        state.done = true;
        return;
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }, maxFrames);
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

/**
 * The stacked deck's interaction contract. One transaction may resolve at most one adjacent item
 * from where it began, and the constraint operates on the physical mass, not just on the projection:
 * the controller's own position may never enter a second same-direction segment either.
 */
function expectOneCardEnvelope(trace: readonly TraversalSample[], originIndex: number) {
  const active = trace.filter((sample) => sample.controllerPhase !== "idle");
  expect(active.length).toBeGreaterThan(3);
  for (const sample of active) {
    expect(sample.visualTopIndex).toBeGreaterThanOrEqual(originIndex - 1);
    expect(sample.visualTopIndex).toBeLessThanOrEqual(originIndex + 1);
    // Bounded overdrag is allowed; a second pitch of physical travel is not.
    expect(sample.physicalIndex).toBeGreaterThan(originIndex - 1.5);
    expect(sample.physicalIndex).toBeLessThan(originIndex + 1.5);
    if (sample.segmentTargetIndex !== null) {
      expect(Math.abs(sample.segmentTargetIndex - sample.segmentOriginIndex)).toBe(1);
      expect(sample.segmentTargetIndex).toBeGreaterThanOrEqual(originIndex - 1);
      expect(sample.segmentTargetIndex).toBeLessThanOrEqual(originIndex + 1);
    }
    // Never a second target and never a second promoted face.
    expect(sample.poses.filter((pose) => pose.visible).length).toBeLessThanOrEqual(2);
    expect(
      sample.poses.every((pose) => !pose.visible || pose.role === "top" || pose.role === "target"),
    ).toBe(true);
  }
  const traversal = trace.slice(trace.findIndex((sample) => sample.controllerPhase !== "idle"));
  const tops = uniqueInOrder(traversal.map((sample) => sample.visualTopIndex));
  expect(tops.length).toBeLessThanOrEqual(3);
  expect(new Set(tops.map((top) => Math.abs(top - originIndex))).has(2)).toBe(false);
  const settled = trace.at(-1)!.settledIndex;
  expect(Math.abs(settled - originIndex)).toBeLessThanOrEqual(1);
  // The decorative pile is a persistent object throughout.
  expect(new Set(trace.map((sample) => JSON.stringify(sample.pile))).size).toBe(1);
  return { tops, settled };
}

/**
 * Every handoff in a real rendered trace must confirm a hierarchy the eye already reads.
 *
 * Structural continuity is asserted at every crossing. The perceptual dominance relationship is
 * asserted on crossings whose sampling gap is one the renderer can actually produce: the default
 * release policy caps travel near a fifth of a pitch per frame, so a wider gap only appears when
 * the harness itself starves requestAnimationFrame under parallel load.
 */
const RENDERABLE_STEP = 0.35;

function expectContinuousHandoffs(trace: readonly TraversalSample[]) {
  const crossings: {
    step: number;
    exposed: number;
    vacatedOpacity: number;
    targetVisibility: number;
    outgoingDominance: number;
    scaleJump: number;
    rotateAround: number;
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
    expect(after.poses[before.visualTopIndex]!.visible).toBe(false);
    expect(promotedAfter.layer).toBeGreaterThan(promotedBefore.layer);
    const half = (extent: { scale: number; translateX: number }) =>
      (before.cardWidth * extent.scale) / 2;
    const overlap = Math.max(
      0,
      Math.min(
        vacated.translateX + half(vacated),
        promotedBefore.translateX + half(promotedBefore),
      ) -
        Math.max(
          vacated.translateX - half(vacated),
          promotedBefore.translateX - half(promotedBefore),
        ),
    );
    const exposed = 1 - overlap / (half(promotedBefore) * 2);
    crossings.push({
      step: Math.abs(after.physicalIndex - before.physicalIndex),
      exposed,
      vacatedOpacity: vacated.opacity,
      targetVisibility: 1 - (1 - exposed) * vacated.opacity,
      outgoingDominance: vacated.opacity * vacated.scale * vacated.scale,
      scaleJump: Math.abs(promotedAfter.scale - promotedBefore.scale),
      rotateAround: Math.max(Math.abs(promotedBefore.rotate), Math.abs(promotedAfter.rotate)),
    });
  }
  expect(crossings.length).toBeGreaterThan(0);
  const rotationRange = Math.max(
    ...trace.flatMap((sample) => sample.poses.map((pose) => Math.abs(pose.rotate))),
  );
  expect(rotationRange).toBeGreaterThan(1);
  const renderable = crossings.filter((crossing) => crossing.step <= RENDERABLE_STEP);
  expect(renderable.length).toBeGreaterThan(0);
  for (const crossing of renderable) {
    // Authority has already migrated: the target reads as the top before ownership moves.
    expect(crossing.targetVisibility).toBeGreaterThan(crossing.outgoingDominance * 1.5);
    // The vacated card is never a normal foreground card at the moment it loses ownership.
    expect(crossing.vacatedOpacity).toBeLessThan(0.6);
    expect(crossing.exposed).toBeGreaterThan(0.55);
    expect(crossing.scaleJump).toBeLessThan(0.02);
    // The promoted card passes through neutral rotation; it cannot snap back from a tilt.
    expect(crossing.rotateAround).toBeLessThan(rotationRange * 0.25);
  }
  return crossings;
}

async function expectNoInternalCardClip(page: Page) {
  const result = await viewport(page).evaluate((element) => {
    const motion = document.querySelector<HTMLElement>(".stacked-deck-card-motion")!;
    const ancestors: { className: string; clipPath: string; overflowX: string }[] = [];
    let current: HTMLElement | null = motion;
    while (current && current !== element.parentElement) {
      const style = getComputedStyle(current);
      ancestors.push({
        className: current.className,
        clipPath: style.clipPath,
        overflowX: style.overflowX,
      });
      current = current.parentElement;
    }
    return {
      ancestors,
      backdropContainsCard: Boolean(
        document.querySelector(".stacked-deck-backdrop .stacked-deck-card"),
      ),
      documentOverflow: document.documentElement.scrollWidth - innerWidth,
      viewportOverflowX: getComputedStyle(element).overflowX,
    };
  });
  expect(result.viewportOverflowX).toBe("visible");
  expect(result.backdropContainsCard).toBe(false);
  expect(result.documentOverflow).toBe(0);
  expect(
    result.ancestors.every(
      (ancestor) =>
        ancestor.clipPath === "none" &&
        ancestor.overflowX !== "hidden" &&
        ancestor.overflowX !== "clip",
    ),
  ).toBe(true);
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

test("visual authority migrates to the target before ownership changes", async ({ page }) => {
  const stage = viewport(page);
  for (const direction of [1, -1] as const) {
    const held = await beginHeldTraversal(page, 2);
    const cardWidth = Number(await stage.getAttribute("data-card-width"));
    // A full pitch must clear most of a card width; the rejected build handed over near 0.4.
    expect(held.pitch / cardWidth).toBeGreaterThan(0.75);
    expect(held.pitch / cardWidth).toBeLessThan(0.95);

    const readings = [];
    for (const progress of [0.1, 0.25, 0.5, 0.7, 0.85, 0.95]) {
      const frame = await holdPhysicalIndex(page, held, 2 + direction * progress);
      expect(frame.visualTopIndex).toBe(2);
      readings.push({ progress, ...dominance(frame) });
    }

    const early = readings[0]!;
    expect(early.outgoingDominance).toBeGreaterThan(early.targetVisibility * 3);
    const late = readings.at(-2)!;
    expect(late.targetVisibility).toBeGreaterThan(late.outgoingDominance * 3);
    const final = readings.at(-1)!;
    expect(final.outgoingDominance).toBeLessThan(0.05);
    expect(final.exposed).toBeGreaterThan(0.75);

    for (let index = 1; index < readings.length; index += 1) {
      expect(readings[index]!.targetVisibility).toBeGreaterThan(
        readings[index - 1]!.targetVisibility,
      );
      expect(readings[index]!.outgoingDominance).toBeLessThan(
        readings[index - 1]!.outgoingDominance,
      );
    }
    // No sampled instant may show two full-strength competing faces.
    expect(
      readings.every(
        (reading) => Math.min(reading.targetVisibility, reading.outgoingDominance) < 0.75,
      ),
    ).toBe(true);
    const crossing = readings.findIndex(
      (reading) => reading.targetVisibility >= reading.outgoingDominance,
    );
    expect(crossing).toBeGreaterThan(0);
    expect(readings[crossing]!.progress).toBeLessThan(0.8);

    await finishPointer(
      page,
      held.origin,
      -direction * held.pitch * 0.95,
      held.elapsedMs + 100,
      "pointercancel",
    );
    await expectCarouselAt(stage, "map");
  }
});

test("the pile is a persistent object that gesture direction cannot flip", async ({ page }) => {
  const stage = viewport(page);
  await pagination(page).nth(2).click();
  await expectCarouselAt(stage, "map");
  const idle = await readFrame(page);
  expect(idle.pile).toHaveLength(3);
  expect(idle.pile.every((layer) => layer.ariaHidden === "true")).toBe(true);
  expect(idle.poses.filter((pose) => pose.visible)).toHaveLength(1);
  for (let index = 1; index < idle.pile.length; index += 1) {
    expect(idle.pile[index]!.left).toBeGreaterThan(idle.pile[index - 1]!.left);
    expect(idle.pile[index]!.right).toBeGreaterThan(idle.pile[index - 1]!.right);
    expect(idle.pile[index]!.layer).toBeLessThan(idle.pile[index - 1]!.layer);
  }

  const geometry: Record<string, unknown>[] = [];
  const targets: { id: string; translateX: number; translateY: number; scale: number }[] = [];
  for (const direction of [-1, 1] as const) {
    const held = await beginHeldTraversal(page, 2);
    const frame = await holdPhysicalIndex(page, held, 2 + direction * 0.12);
    geometry.push(...frame.pile);
    const target = frame.poses.find((pose) => pose.role === "target")!;
    targets.push({
      id: target.id,
      translateX: target.translateX,
      translateY: target.translateY,
      scale: target.scale,
    });
    await finishPointer(
      page,
      held.origin,
      -direction * held.pitch * 0.12,
      held.elapsedMs + 100,
      "pointercancel",
    );
    await expectCarouselAt(stage, "map");
  }

  const left = geometry.slice(0, 3);
  const right = geometry.slice(3);
  expect(left).toEqual(idle.pile);
  expect(right).toEqual(idle.pile);
  // Only the target's identity may change with direction; its pose comes from the same slot.
  expect(targets[0]!.id).not.toBe(targets[1]!.id);
  expect(targets[0]!.translateX).toBeCloseTo(targets[1]!.translateX, 6);
  expect(targets[0]!.translateY).toBeCloseTo(targets[1]!.translateY, 6);
  expect(targets[0]!.scale).toBeCloseTo(targets[1]!.scale, 6);
  expect(targets[0]!.translateX).toBeGreaterThan(0);
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
    expect(furthest.poses.filter((pose) => pose.visible)).toHaveLength(1);
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
    expect(tops).toEqual([2, 2 + direction]);
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
    expect(stretched.poses.filter((pose) => pose.visible)).toHaveLength(1);
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
  expect(expectOneCardEnvelope(trace, 0)).toMatchObject({ tops: [0, 1], settled: 1 });
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
      pile: number[];
      target: number | null;
      visualTop: number;
      visibleCount: number;
      cards: { id: string; role: string; visible: boolean; layer: number; opacity: number }[];
    }> = [];
    for (let step = 0; step < 10; step += 1) {
      element.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaX }));
      await new Promise((resolve) => setTimeout(resolve, 25));
      samples.push({
        origin: Number(element.dataset.segmentOriginIndex),
        phase: element.dataset.phase,
        pile: [...element.querySelectorAll<HTMLElement>(".stacked-deck-pile-layer")].flatMap(
          (layer) => {
            const box = layer.getBoundingClientRect();
            return [Number(box.left.toFixed(2)), Number(box.top.toFixed(2))];
          },
        ),
        target:
          element.dataset.segmentTargetIndex === undefined
            ? null
            : Number(element.dataset.segmentTargetIndex),
        visualTop: Number(element.dataset.visualTopIndex),
        visibleCount: [...element.querySelectorAll<HTMLElement>(".stacked-deck-card")].filter(
          (card) => getComputedStyle(card).visibility === "visible",
        ).length,
        cards: [...element.querySelectorAll<HTMLElement>(".stacked-deck-card")].map((card) => ({
          id: card.dataset.screenId ?? "",
          role: card.dataset.role ?? "",
          visible: card.dataset.visible === "true",
          layer: Number(card.dataset.layer),
          opacity: Number(card.dataset.opacity),
        })),
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
  expect(wheelSamples.every((sample) => sample.visibleCount <= 2)).toBe(true);
  // Wheel traversal uses the same projection: one pile, one top, one adjacent target, no rail.
  expect(new Set(wheelSamples.map((sample) => JSON.stringify(sample.pile))).size).toBe(1);
  expect(
    wheelSamples.every((sample) =>
      sample.cards.every((card) => !card.visible || card.role === "top" || card.role === "target"),
    ),
  ).toBe(true);
  for (let index = 1; index < wheelSamples.length; index += 1) {
    const before = wheelSamples[index - 1]!;
    const after = wheelSamples[index]!;
    if (before.visualTop === after.visualTop) continue;
    expect(before.cards[after.visualTop]!.role).toBe("target");
    expect(before.cards[after.visualTop]!.opacity).toBe(1);
    expect(after.cards[before.visualTop]!.visible).toBe(false);
    expect(after.cards[after.visualTop]!.layer).toBeGreaterThan(
      before.cards[after.visualTop]!.layer,
    );
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
  expect(tops).toEqual([0, 1]);
  expect(settled).toBe(1);
  await expectCarouselAt(stage, "project");
  await expect(page.getByTestId("stacked-deck-status")).toHaveText(
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
  expect(expectOneCardEnvelope(keyed, 1)).toMatchObject({ tops: [1, 2], settled: 2 });
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
  expect(trace.every((sample) => sample.poses.filter((pose) => pose.visible).length === 1)).toBe(
    true,
  );
  expect(new Set(trace.map((sample) => JSON.stringify(sample.pile))).size).toBe(1);
  expect(trace.at(-1)).toMatchObject({
    caption: TITLES[4],
    controllerPhase: "idle",
    settledIndex: 4,
    visualTopIndex: 4,
  });
  await expect(page.getByTestId("stacked-deck-status")).toHaveText(
    "Werkruimte-instellingen, 5 of 5",
  );
  await expectCarouselAt(stage, "settings");

  // Home and End follow the same rule; an adjacent dot still animates one normal card.
  await stage.focus();
  await page.keyboard.press("Home");
  await expectCarouselAt(stage, "templates");
  await expect(page.getByTestId("stacked-deck-status")).toHaveText("Projectsjablonen, 1 of 5");
  await page.keyboard.press("End");
  await expectCarouselAt(stage, "settings");
  await expect(page.getByTestId("stacked-deck-status")).toHaveText(
    "Werkruimte-instellingen, 5 of 5",
  );

  await installTraversalTrace(page);
  await pagination(page).nth(3).click();
  const adjacent = await readTraversalTrace(page);
  expect(expectOneCardEnvelope(adjacent, 4)).toMatchObject({ tops: [4, 3], settled: 3 });
  await expectCarouselAt(stage, "team");
});

test("reversal retraces the same card and changes direction only through neutral", async ({
  page,
}) => {
  const stage = viewport(page);
  const held = await beginHeldTraversal(page, 2);
  const forward = await holdPhysicalIndex(page, held, 2.6);
  const retraced = await holdPhysicalIndex(page, held, 2.2);
  const neutral = await holdPhysicalIndex(page, held, 2);
  const reverse = await holdPhysicalIndex(page, held, 1.8);
  expect(topPose(forward).id).toBe("map");
  expect(topPose(forward).translateX).toBeCloseTo(-held.pitch * 0.6, 4);
  expect(topPose(retraced).id).toBe("map");
  expect(topPose(retraced).translateX).toBeCloseTo(-held.pitch * 0.2, 4);
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
  expect(topPose(reverse).translateX).toBeCloseTo(held.pitch * 0.2, 2);
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

  // Throw toward "team", then re-grab before the handoff boundary and drag hard the same way.
  const thrown = await beginHeldTraversal(page, 2);
  await holdPhysicalIndex(page, thrown, 2.35);
  await finishPointer(
    page,
    thrown.origin,
    -thrown.pitch * 0.35,
    thrown.elapsedMs + 20,
    "pointerup",
  );
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

  await page.getByTestId("reduced-motion-mode").selectOption("reduce");
  const reduced = await beginHeldTraversal(page, 2);
  const reducedFrame = await holdPhysicalIndex(page, reduced, 2.55);
  expect(topPose(reducedFrame).translateX).toBeCloseTo(-reduced.pitch * 0.55, 2);
  expect(reducedFrame.poses.every((pose) => pose.rotate === 0)).toBe(true);
  expect(topPose(reducedFrame)).toMatchObject({ translateY: 0, scale: 1 });
  // Ownership still has to migrate, and depth still has to read as a pile.
  expect(topPose(reducedFrame).opacity).toBeLessThan(1);
  expect(reducedFrame.poses.find((pose) => pose.role === "target")!.scale).toBeLessThan(1);
  expect(reducedFrame.pile).toHaveLength(3);

  // Reduced motion keeps the same interaction span: one adjacent card, then bounded resistance.
  const reducedSecond = await holdPointerAt(page, reduced, 3.6);
  expect(reducedSecond).toMatchObject({
    visualTopIndex: 3,
    segmentOriginIndex: 3,
    segmentTargetIndex: null,
    segmentPhase: "elastic",
  });
  expect(reducedSecond.physicalIndex).toBeLessThan(3.5);
  expect(reducedSecond.pile).toEqual(reducedFrame.pile);
  const reducedThird = await holdPointerAt(page, reduced, 6);
  expect(reducedThird.visualTopIndex).toBe(3);
  expect(reducedThird.poses.filter((pose) => pose.visible)).toHaveLength(1);
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
    await expectNoInternalCardClip(page);

    for (const direction of [-1, 1] as const) {
      const held = await beginHeldTraversal(page, 2);
      // While the outgoing card is still opaque and dominant it stays on screen.
      const dominant = await holdPhysicalIndex(page, held, 2 + direction * 0.35);
      const dominantTop = topPose(dominant);
      expect(dominantTop.opacity).toBe(1);
      expect(dominantTop.left).toBeGreaterThanOrEqual(-0.75);
      expect(dominantTop.right).toBeLessThanOrEqual(width + 0.75);

      // Late in the segment the outgoing card may bleed past the physical browser edge, but only
      // once it is already subordinate, and the target must stay wholly inside the stage.
      const late = await holdPhysicalIndex(page, held, 2 + direction * 0.96);
      const lateTop = topPose(late);
      const target = late.poses.find((pose) => pose.role === "target")!;
      expect(lateTop.opacity).toBe(0);
      expect(dominance(late).exposed).toBeGreaterThan(0.75);
      expect(target.left).toBeGreaterThanOrEqual(late.stageLeft - 0.75);
      expect(target.right).toBeLessThanOrEqual(late.stageRight + 0.75);
      expect(late.pile).toEqual(dominant.pile);
      await expectNoInternalCardClip(page);
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
    expect(stretched.poses.filter((pose) => pose.visible)).toHaveLength(1);
    expect(topPose(stretched).left).toBeGreaterThanOrEqual(stretched.stageLeft - 0.75);
    expect(topPose(stretched).right).toBeLessThanOrEqual(stretched.stageRight + 0.75);
    await expectNoInternalCardClip(page);
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
    await expectNoInternalCardClip(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  }
});

test("visual metadata follows completed handoffs while settlement announces once", async ({
  page,
}) => {
  const stage = viewport(page);
  const held = await beginHeldTraversal(page, 2);
  const midway = await holdPhysicalIndex(page, held, 2.4);
  expect(midway).toMatchObject({ caption: TITLES[2], counter: "3", visualTopIndex: 2 });
  expect(topPose(midway)).toMatchObject({ id: "map", opacity: 1, role: "top" });
  const before = await holdPhysicalIndex(page, held, 2.92);
  expect(before).toMatchObject({ caption: TITLES[2], counter: "3", visualTopIndex: 2 });
  // Visual authority already belongs to the target while the counter still names the owner.
  expect(topPose(before)).toMatchObject({ id: "map", opacity: 0, role: "top", visible: false });
  expect(dominance(before).targetVisibility).toBeGreaterThan(0.95);
  await expect(page.getByTestId("stacked-deck-inspect")).toBeDisabled();
  const after = await holdPhysicalIndex(page, held, 3);
  expect(after).toMatchObject({ caption: TITLES[3], counter: "4", visualTopIndex: 3 });
  expect(after.settledIndex).toBe(2);
  await expect(page.getByTestId("stacked-deck-status")).toBeEmpty();
  await releaseHeldAtRest(page, held, 3);
  await expectCarouselAt(stage, "team");
  await expect(page.getByTestId("stacked-deck-status")).toHaveText("Team & rollen, 4 of 5");
  await expect(page.getByTestId("stacked-deck-inspect")).toBeEnabled();
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
  const semanticCards = await page.locator(".stacked-deck-card").evaluateAll((cards) =>
    cards.map((item) => ({
      current: item.getAttribute("aria-current"),
      hidden: item.getAttribute("aria-hidden"),
      id: (item as HTMLElement).dataset.screenId,
    })),
  );
  expect(semanticCards.filter((item) => item.current === "true")).toEqual([
    { current: "true", hidden: null, id: "team" },
  ]);
  expect(semanticCards.filter((item) => item.hidden === "true")).toHaveLength(4);
  await releaseHeldAtRest(page, held, 3);
  await expectCarouselAt(stage, "team");
  await inspect.click();
  await expect(page.getByTestId("snap-motion-media-gallery")).toBeVisible();
  await expect(page.getByTestId("snap-motion-media-gallery-close")).toBeFocused();
  await page.getByTestId("snap-motion-media-gallery-close").click();
  await expect(inspect).toBeFocused();

  const accessibility = await new AxeBuilder({ page }).include(".stacked-deck-demo").analyze();
  expect(accessibility.violations).toEqual([]);
});
