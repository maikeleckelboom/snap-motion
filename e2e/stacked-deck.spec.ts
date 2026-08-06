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
  readonly pointerType: "mouse" | "pen";
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

async function beginHeldTraversal(page: Page, startIndex: number): Promise<HeldTraversal> {
  const stage = viewport(page);
  await pagination(page).nth(startIndex).click();
  await expectCarouselAt(stage, IDS[startIndex]!);
  return {
    elapsedMs: 0,
    origin: await beginPointer(stage),
    pitch: await motionPitch(stage),
    startIndex,
  };
}

async function holdPhysicalIndex(page: Page, held: HeldTraversal, physicalIndex: number) {
  held.elapsedMs += 100;
  await movePointer(
    page,
    held.origin,
    (held.startIndex - physicalIndex) * held.pitch,
    held.elapsedMs,
  );
  const frame = await readFrame(page);
  expect(frame.physicalIndex).toBeCloseTo(physicalIndex, 3);
  return frame;
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
        stackDepth: Number(item.dataset.stackDepth),
        top: box.top,
        translateX: Number(item.dataset.translateX),
        translateY: Number(item.dataset.translateY),
        visibility: style.visibility,
        visible: item.dataset.visible === "true",
        width: box.width,
      };
    });
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
      poses,
    };
  });
}

function topPose(frame: Awaited<ReturnType<typeof readFrame>>) {
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
  readonly caption: string;
  readonly controllerPhase: string;
  readonly direction: number;
  readonly physicalIndex: number;
  readonly progress: number;
  readonly segmentOriginIndex: number;
  readonly segmentPhase: string;
  readonly segmentTargetIndex: number | null;
  readonly settledIndex: number;
  readonly visualTopIndex: number;
  readonly poses: readonly {
    readonly id: string;
    readonly opacity: number;
    readonly role: string;
    readonly translateX: number;
    readonly visible: boolean;
  }[];
}

async function installTraversalTrace(page: Page) {
  await viewport(page).evaluate((element) => {
    const trace: TraversalSample[] = [];
    const state = { done: false, started: false, trace };
    (
      window as typeof window & {
        stackedDeckTraversalTrace?: typeof state;
      }
    ).stackedDeckTraversalTrace = state;
    let remainingFrames = 900;
    const sample = () => {
      const controllerPhase = element.dataset.phase ?? "";
      if (controllerPhase !== "idle") state.started = true;
      const targetAttribute = element.getAttribute("data-segment-target-index");
      trace.push({
        caption:
          document.querySelector<HTMLElement>('[data-testid="stacked-deck-caption"]')?.innerText ??
          "",
        controllerPhase,
        direction: Number(element.dataset.segmentDirection),
        physicalIndex: Number(element.dataset.physicalIndex),
        progress: Number(element.dataset.segmentProgress),
        segmentOriginIndex: Number(element.dataset.segmentOriginIndex),
        segmentPhase: element.dataset.segmentPhase ?? "",
        segmentTargetIndex: targetAttribute === null ? null : Number(targetAttribute),
        settledIndex: Number(element.dataset.settledIndex),
        visualTopIndex: Number(element.dataset.visualTopIndex),
        poses: [...document.querySelectorAll<HTMLElement>(".stacked-deck-card")].map((item) => ({
          id: item.dataset.screenId ?? "",
          opacity: Number(item.dataset.opacity),
          role: item.dataset.role ?? "",
          translateX: Number(item.dataset.translateX),
          visible: item.dataset.visible === "true",
        })),
      });
      remainingFrames -= 1;
      if ((state.started && controllerPhase === "idle") || remainingFrames <= 0) {
        state.done = true;
        return;
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
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

function expectSequentialTraversal(
  trace: readonly TraversalSample[],
  expectedTops: readonly number[],
) {
  const active = trace.filter((sample) => sample.controllerPhase !== "idle");
  const traversalStart = trace.findIndex((sample) => sample.controllerPhase !== "idle");
  const traversal = trace.slice(traversalStart);
  expect(active.length).toBeGreaterThan(3);
  expect(
    active.every(
      (sample) =>
        sample.segmentTargetIndex === null ||
        Math.abs(sample.segmentTargetIndex - sample.segmentOriginIndex) === 1,
    ),
  ).toBe(true);
  expect(active.every((sample) => sample.segmentPhase !== "idle")).toBe(true);
  expect(uniqueInOrder(traversal.map((sample) => sample.visualTopIndex))).toEqual(expectedTops);
  expect(active.every((sample) => sample.poses.filter((pose) => pose.visible).length <= 4)).toBe(
    true,
  );
  expect(
    active.every((sample) =>
      sample.poses.every(
        (pose) =>
          !pose.visible || pose.role === "top" || pose.role === "target" || pose.role === "backing",
      ),
    ),
  ).toBe(true);
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

test("the default release policy permits a two-card flick and renders both handoffs", async ({
  page,
}) => {
  const stage = viewport(page);
  await pagination(page).first().click();
  await expectCarouselAt(stage, "templates");
  await expect(page.getByRole("spinbutton", { name: "Maximum skip", exact: true })).toHaveValue(
    "2",
  );
  const pitch = await motionPitch(stage);
  await installTraversalTrace(page);
  await dragSyntheticPointerBy(page, stage, -pitch * 0.42, 0, {
    eventIntervalMs: 3,
    stepDelay: 0,
    steps: 4,
  });
  const trace = await readTraversalTrace(page);
  expectSequentialTraversal(trace, [0, 1, 2]);
  expect(
    trace
      .filter((sample) => sample.controllerPhase !== "idle")
      .every((sample) => sample.settledIndex === 0),
  ).toBe(true);
  expect(trace.at(-1)).toMatchObject({
    caption: TITLES[2],
    controllerPhase: "idle",
    settledIndex: 2,
    visualTopIndex: 2,
  });
  await expectCarouselAt(stage, "map");
});

test("one continuous wheel burst crosses adjacent visual segments without a rail", async ({
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
      visibleCount: number;
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
        visibleCount: [...element.querySelectorAll<HTMLElement>(".stacked-deck-card")].filter(
          (card) => getComputedStyle(card).visibility === "visible",
        ).length,
      });
    }
    return samples;
  }, pitch * 0.23);
  expect(uniqueInOrder(wheelSamples.map((sample) => sample.visualTop))).toEqual([0, 1, 2]);
  expect(wheelSamples.every((sample) => sample.phase === "dragging")).toBe(true);
  expect(
    wheelSamples.every(
      (sample) => sample.target === null || Math.abs(sample.target - sample.origin) === 1,
    ),
  ).toBe(true);
  expect(wheelSamples.every((sample) => sample.visibleCount <= 4)).toBe(true);
  await expectCarouselAt(stage, "map");
  expect(await readFrame(page)).toMatchObject({
    controllerPhase: "idle",
    settledIndex: 2,
    visualTopIndex: 2,
  });
});

test("programmatic first-to-last movement traverses four adjacent deck segments", async ({
  page,
}) => {
  const stage = viewport(page);
  await pagination(page).first().click();
  await expectCarouselAt(stage, "templates");
  await installTraversalTrace(page);
  await pagination(page).last().click();
  const trace = await readTraversalTrace(page);
  expectSequentialTraversal(trace, [0, 1, 2, 3, 4]);
  const active = trace.filter((sample) => sample.controllerPhase !== "idle");
  expect(active.every((sample) => sample.controllerPhase === "settling")).toBe(true);
  expect(active.every((sample) => sample.settledIndex === 0)).toBe(true);
  const traversal = trace.slice(trace.findIndex((sample) => sample.controllerPhase !== "idle"));
  const captions = uniqueInOrder(traversal.map((sample) => sample.visualTopIndex)).map(
    (index) => traversal.find((sample) => sample.visualTopIndex === index)?.caption,
  );
  expect(captions).toEqual([...TITLES]);
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

test("reversal after completed handoffs unwinds adjacent segments without idle", async ({
  page,
}) => {
  const stage = viewport(page);
  const held = await beginHeldTraversal(page, 2);
  const positions = [2.7, 3.2, 3.7, 3.2, 3, 2.7, 2, 1.8];
  const frames = [];
  for (const position of positions) frames.push(await holdPhysicalIndex(page, held, position));
  expect(frames.map((frame) => frame.visualTopIndex)).toEqual([2, 3, 3, 3, 3, 3, 2, 2]);
  expect(frames[1]).toMatchObject({ segmentOriginIndex: 3, segmentTargetIndex: 4 });
  expect(frames[4]).toMatchObject({ segmentPhase: "neutral", visualTopIndex: 3 });
  expect(frames[5]).toMatchObject({ segmentOriginIndex: 3, segmentTargetIndex: 2 });
  expect(frames[6]).toMatchObject({ segmentPhase: "neutral", visualTopIndex: 2 });
  expect(frames[7]).toMatchObject({ segmentOriginIndex: 2, segmentTargetIndex: 1 });
  expect(frames.every((frame) => frame.controllerPhase === "dragging")).toBe(true);
  frames.forEach(assertLocalSegment);
  await finishPointer(page, held.origin, held.pitch * 0.2, held.elapsedMs + 100, "pointercancel");
  await expectCarouselAt(stage, "map");
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
  await finishPointer(
    page,
    reduced.origin,
    -reduced.pitch * 0.55,
    reduced.elapsedMs + 100,
    "pointercancel",
  );
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
      const dominant = await holdPhysicalIndex(page, held, 2 + direction * 0.65);
      const dominantTop = topPose(dominant);
      expect(dominantTop.left).toBeGreaterThanOrEqual(-0.75);
      expect(dominantTop.right).toBeLessThanOrEqual(width + 0.75);
      const late = await holdPhysicalIndex(page, held, 2 + direction * 0.96);
      const lateTop = topPose(late);
      const target = late.poses.find((pose) => pose.role === "target")!;
      expect(lateTop).toMatchObject({ opacity: 1, role: "top", visible: true });
      expect(target.left).toBeGreaterThanOrEqual(late.stageLeft - 0.75);
      expect(target.right).toBeLessThanOrEqual(late.stageRight + 0.75);
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

    await pagination(page).first().click();
    await expectCarouselAt(stage, "templates");
    await installTraversalTrace(page);
    await pagination(page).last().click();
    const trace = await readTraversalTrace(page);
    expectSequentialTraversal(trace, [0, 1, 2, 3, 4]);
    await expectNoInternalCardClip(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  }
});

test("visual metadata follows completed handoffs while settlement announces once", async ({
  page,
}) => {
  const stage = viewport(page);
  const held = await beginHeldTraversal(page, 2);
  const before = await holdPhysicalIndex(page, held, 2.92);
  expect(before).toMatchObject({ caption: TITLES[2], counter: "3", visualTopIndex: 2 });
  expect(topPose(before)).toMatchObject({ id: "map", opacity: 1, role: "top" });
  await expect(page.getByTestId("stacked-deck-inspect")).toBeDisabled();
  const after = await holdPhysicalIndex(page, held, 3.08);
  expect(after).toMatchObject({ caption: TITLES[3], counter: "4", visualTopIndex: 3 });
  expect(after.settledIndex).toBe(2);
  await expect(page.getByTestId("stacked-deck-status")).toBeEmpty();
  await releaseHeldAtRest(page, held, 3.08);
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
  await holdPhysicalIndex(page, held, 3.08);
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
  await releaseHeldAtRest(page, held, 3.08);
  await expectCarouselAt(stage, "team");
  await inspect.click();
  await expect(page.getByTestId("snap-motion-media-gallery")).toBeVisible();
  await expect(page.getByTestId("snap-motion-media-gallery-close")).toBeFocused();
  await page.getByTestId("snap-motion-media-gallery-close").click();
  await expect(inspect).toBeFocused();

  const accessibility = await new AxeBuilder({ page }).include(".stacked-deck-demo").analyze();
  expect(accessibility.violations).toEqual([]);
});
