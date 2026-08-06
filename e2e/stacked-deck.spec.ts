import { mkdir } from "node:fs/promises";
import { resolve as resolvePath } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  dragSyntheticPointerBy,
  dragTouchBy,
  expectCarouselAt,
  openLabDemo,
  setNumericInput,
} from "./helpers";

const IDS = ["templates", "project", "map", "team", "settings"] as const;
const POINTER_ID = 617;
const existingResizeObserverWarning =
  /ResizeObserver loop completed with undelivered notifications\./;
const collectedPageErrors = new WeakMap<Page, string[]>();
test.describe.configure({ timeout: 45_000 });

function viewport(page: Page) {
  return page.getByTestId("stacked-deck-viewport");
}

function card(page: Page, id: string) {
  return page.locator(`.stacked-deck-card[data-screen-id="${id}"]`);
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
    { pointerId: POINTER_ID, pointerType },
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

interface HeldTransition {
  elapsedMs: number;
  readonly origin: PointerOrigin;
  readonly pitch: number;
  readonly startIndex: number;
}

async function beginHeldTransition(page: Page, startIndex: number): Promise<HeldTransition> {
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

async function holdPhysicalIndex(page: Page, held: HeldTransition, physicalIndex: number) {
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

async function readFrame(page: Page) {
  return viewport(page).evaluate((element) => {
    const stageBox = element.getBoundingClientRect();
    const poses = [...document.querySelectorAll<HTMLElement>(".stacked-deck-card")].map((item) => {
      const surface = item.querySelector<HTMLElement>(".screen-chrome")!;
      const box = surface.getBoundingClientRect();
      const style = getComputedStyle(item);
      return {
        ariaCurrent: item.getAttribute("aria-current"),
        ariaHidden: item.getAttribute("aria-hidden"),
        apertureBoundary: Number(item.dataset.apertureBoundary),
        apertureExposure: Number(item.dataset.apertureExposure),
        apertureClipPath: getComputedStyle(
          item.querySelector<HTMLElement>(".stacked-deck-aperture")!,
        ).clipPath,
        bottom: box.bottom,
        height: box.height,
        id: item.dataset.screenId ?? "",
        interactive: item.dataset.interactive === "true",
        layer: Number(item.dataset.layer),
        left: box.left,
        opacity: Number(item.dataset.opacity),
        pointerEvents: style.pointerEvents,
        reveal: Number(item.dataset.reveal),
        right: box.right,
        role: item.dataset.role ?? "",
        rotate: Number(item.dataset.rotate),
        rotateY: Number(item.dataset.rotateY),
        scale: Number(item.dataset.scale),
        stackDepth: Number(item.dataset.stackDepth),
        top: box.top,
        translateX: Number(item.dataset.translateX),
        translateY: Number(item.dataset.translateY),
        visibility: style.visibility,
        visible: item.dataset.visible === "true",
        width: box.width,
        cardClipPath: getComputedStyle(
          item.querySelector<HTMLElement>(".stacked-deck-card-motion")!,
        ).clipPath,
      };
    });
    return {
      caption: document.querySelector<HTMLElement>('[data-testid="stacked-deck-caption"]')
        ?.innerText,
      cardWidth: Number(element.dataset.cardWidth),
      controllerPhase: element.dataset.phase ?? "",
      counter: document.querySelector<HTMLElement>('[data-testid="stacked-deck-counter"]')
        ?.innerText,
      direction: Number(element.dataset.transitionDirection),
      fromIndex: Number(element.dataset.transitionFromIndex),
      physicalIndex: Number(element.dataset.physicalIndex),
      paginationCurrentIndex: [
        ...document.querySelectorAll<HTMLElement>('[aria-label="Stacked deck screens"] button'),
      ].findIndex((button) => button.getAttribute("aria-current") === "true"),
      paginationPosition: Number(
        document.querySelector<HTMLElement>('[data-testid="stacked-deck-pagination-indicator"]')
          ?.dataset.position,
      ),
      poses,
      profile: element.dataset.profile ?? "",
      progress: Number(element.dataset.transitionProgress),
      settledIndex: Number(element.dataset.settledIndex),
      stageCenterX: stageBox.left + stageBox.width / 2,
      stageCenterY: stageBox.top + stageBox.height / 2,
      stageWidth: stageBox.width,
      toIndex: Number(element.dataset.transitionToIndex),
      transitionPhase: element.dataset.transitionPhase ?? "",
    };
  });
}

function visiblePile(frame: Awaited<ReturnType<typeof readFrame>>) {
  return frame.poses.filter((pose) => pose.visible);
}

function exposedAreaRatio(
  top: Awaited<ReturnType<typeof readFrame>>["poses"][number],
  backing: Awaited<ReturnType<typeof readFrame>>["poses"][number],
) {
  const overlapWidth = Math.max(
    0,
    Math.min(top.right, backing.right) - Math.max(top.left, backing.left),
  );
  const overlapHeight = Math.max(
    0,
    Math.min(top.bottom, backing.bottom) - Math.max(top.top, backing.top),
  );
  return 1 - (overlapWidth * overlapHeight) / (backing.width * backing.height);
}

async function stageScreenshot(page: Page, directory: string, name: string) {
  const box = await viewport(page).boundingBox();
  if (!box) throw new Error("Stacked deck viewport is not rendered for screenshot capture.");
  await page.screenshot({
    animations: "disabled",
    clip: box,
    path: resolvePath(directory, `${name}.png`),
  });
}

interface ProgrammaticSample {
  readonly caption: string;
  readonly controllerPhase: string;
  readonly paginationPosition: number;
  readonly progress: number;
  readonly settledIndex: number;
  readonly transitionPhase: string;
  readonly toIndex: number;
  readonly poses: readonly {
    readonly apertureExposure: number;
    readonly bottom: number;
    readonly height: number;
    readonly id: string;
    readonly left: number;
    readonly layer: number;
    readonly opacity: number;
    readonly right: number;
    readonly role: string;
    readonly top: number;
    readonly translateX: number;
    readonly width: number;
  }[];
}

async function installProgrammaticTrace(page: Page) {
  await viewport(page).evaluate((element) => {
    const trace: ProgrammaticSample[] = [];
    const state = { done: false, started: false, trace };
    (
      window as typeof window & {
        stackedDeckProgrammaticTrace?: typeof state;
      }
    ).stackedDeckProgrammaticTrace = state;
    let remainingFrames = 600;
    const sample = () => {
      const controllerPhase = element.dataset.phase ?? "";
      if (controllerPhase !== "idle") state.started = true;
      trace.push({
        caption:
          document.querySelector<HTMLElement>('[data-testid="stacked-deck-caption"]')?.innerText ??
          "",
        controllerPhase,
        paginationPosition: Number(
          document.querySelector<HTMLElement>('[data-testid="stacked-deck-pagination-indicator"]')
            ?.dataset.position,
        ),
        progress: Number(element.dataset.transitionProgress),
        settledIndex: Number(element.dataset.settledIndex),
        transitionPhase: element.dataset.transitionPhase ?? "",
        toIndex: Number(element.dataset.transitionToIndex),
        poses: [...document.querySelectorAll<HTMLElement>(".stacked-deck-card")].map((item) => {
          const box = item
            .querySelector<HTMLElement>(".stacked-deck-card-motion")!
            .getBoundingClientRect();
          return {
            apertureExposure: Number(item.dataset.apertureExposure),
            bottom: box.bottom,
            height: box.height,
            id: item.dataset.screenId ?? "",
            left: box.left,
            layer: Number(item.dataset.layer),
            opacity: Number(item.dataset.opacity),
            right: box.right,
            role: item.dataset.role ?? "",
            top: box.top,
            translateX: Number(item.dataset.translateX),
            width: box.width,
          };
        }),
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

async function readProgrammaticTrace(page: Page): Promise<ProgrammaticSample[]> {
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (
              window as typeof window & {
                stackedDeckProgrammaticTrace?: { done: boolean };
              }
            ).stackedDeckProgrammaticTrace?.done,
        ),
      { timeout: 12_000 },
    )
    .toBe(true);
  return page.evaluate(
    () =>
      (
        window as typeof window & {
          stackedDeckProgrammaticTrace?: { trace: ProgrammaticSample[] };
        }
      ).stackedDeckProgrammaticTrace?.trace ?? [],
  );
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

test("idle composition is one semantic top card over a compact pile at every required width", async ({
  page,
}) => {
  const stage = viewport(page);
  for (const width of [360, 390, 768, 1_024, 1_440]) {
    await page.setViewportSize({ width, height: width < 600 ? 900 : 1_000 });
    await expect(stage).toHaveAttribute("data-transition-phase", "idle");
    const frame = await readFrame(page);
    const top = frame.poses.find((pose) => pose.role === "top")!;
    const backing = frame.poses.filter((pose) => pose.role === "backing");
    expect(frame.settledIndex).toBe(2);
    expect(frame.caption).toBe("Locatie & planning");
    expect(frame.counter).toBe("3");
    expect(visiblePile(frame)).toHaveLength(4);
    expect(backing).toHaveLength(3);
    expect(frame.poses.filter((pose) => pose.role === "hidden")).toHaveLength(1);
    expect(frame.poses.filter((pose) => pose.ariaCurrent === "true")).toHaveLength(1);
    expect(frame.poses.filter((pose) => pose.ariaHidden === "true")).toHaveLength(4);
    expect(frame.poses.filter((pose) => pose.interactive)).toEqual([top]);
    expect(backing.every((pose) => pose.translateX > 0 && pose.translateY > 0)).toBe(true);
    expect(backing.every((pose) => Math.abs(pose.translateX) < frame.cardWidth * 0.03)).toBe(true);
    expect(backing.every((pose) => exposedAreaRatio(top, pose) < 0.09)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
  }
});

test("responsive full and reduced motion preserve the physical exchange topology", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Chromium owns deterministic visual evidence.");
  const artifactDirectory = resolvePath(
    process.cwd(),
    ".artifacts",
    "physical-deck-responsive-frames",
    testInfo.project.name,
  );
  await mkdir(artifactDirectory, { recursive: true });

  for (const width of [360, 390, 768, 1_024, 1_440]) {
    await page.setViewportSize({ width, height: width < 600 ? 900 : 1_000 });
    await page.getByTestId("reduced-motion-mode").selectOption("no-preference");

    const forward = await beginHeldTransition(page, 2);
    const forwardFrame = await holdPhysicalIndex(page, forward, 2.45);
    expect(forwardFrame.paginationPosition).toBeCloseTo(2.45, 4);
    expect(forwardFrame.paginationCurrentIndex).toBe(2);
    expect(forwardFrame.poses[2]).toMatchObject({ role: "outgoing", layer: 500 });
    await stageScreenshot(page, artifactDirectory, `${width}-forward-full`);
    await finishPointer(
      page,
      forward.origin,
      -forward.pitch * 0.45,
      forward.elapsedMs + 100,
      "pointercancel",
    );
    await expectCarouselAt(viewport(page), "map");

    const backward = await beginHeldTransition(page, 3);
    const backwardFrame = await holdPhysicalIndex(page, backward, 2.55);
    const fullRetrieved = backwardFrame.poses[2]!;
    expect(fullRetrieved).toMatchObject({ role: "incoming", layer: 500, cardClipPath: "none" });
    expect(fullRetrieved.apertureBoundary).toBeCloseTo(backwardFrame.stageWidth, 3);
    expect(Math.abs(fullRetrieved.rotateY)).toBeGreaterThan(20);
    await stageScreenshot(page, artifactDirectory, `${width}-backward-full`);
    await finishPointer(
      page,
      backward.origin,
      backward.pitch * 0.45,
      backward.elapsedMs + 100,
      "pointercancel",
    );
    await expectCarouselAt(viewport(page), "team");

    await page.getByTestId("reduced-motion-mode").selectOption("reduce");
    const reducedBackward = await beginHeldTransition(page, 3);
    const reducedFrame = await holdPhysicalIndex(page, reducedBackward, 2.55);
    const reducedRetrieved = reducedFrame.poses[2]!;
    expect(reducedRetrieved.rotate).toBe(0);
    expect(Math.abs(reducedRetrieved.rotateY)).toBeGreaterThan(0);
    expect(Math.abs(reducedRetrieved.rotateY)).toBeLessThan(Math.abs(fullRetrieved.rotateY));
    expect(reducedRetrieved.apertureBoundary).toBeCloseTo(reducedFrame.stageWidth, 3);
    await stageScreenshot(page, artifactDirectory, `${width}-backward-reduced`);
    await finishPointer(
      page,
      reducedBackward.origin,
      reducedBackward.pitch * 0.45,
      reducedBackward.elapsedMs + 100,
      "pointercancel",
    );
    await expectCarouselAt(viewport(page), "team");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
  }
});

test("held forward and backward exchanges preserve explicit roles, layers, and committed metadata", async ({
  page,
}, testInfo) => {
  await page.locator(".preset-control select").selectOption("heavy");
  const artifactDirectory = resolvePath(
    process.cwd(),
    ".artifacts",
    "physical-deck-held-frames",
    testInfo.project.name,
  );
  await mkdir(artifactDirectory, { recursive: true });

  const forward = await beginHeldTransition(page, 2);
  let previousOutgoingX = 0;
  for (const [index, progress] of [0.1, 0.25, 0.5, 0.75, 0.85, 0.9, 0.97].entries()) {
    const frame = await holdPhysicalIndex(page, forward, 2 + progress);
    const outgoing = frame.poses[2]!;
    const incoming = frame.poses[3]!;
    const backing = frame.poses.filter((pose) => pose.role === "backing");
    expect(frame).toMatchObject({
      caption: "Locatie & planning",
      counter: "3",
      direction: 1,
      fromIndex: 2,
      settledIndex: 2,
      toIndex: 3,
    });
    expect(frame.paginationPosition).toBeCloseTo(2 + frame.progress, 4);
    expect(frame.paginationCurrentIndex).toBe(2);
    expect(outgoing).toMatchObject({ role: "outgoing", layer: 500 });
    expect(incoming).toMatchObject({ role: "incoming", layer: 400 });
    expect(outgoing.translateX).toBeGreaterThanOrEqual(previousOutgoingX);
    if (progress <= 0.25) {
      expect(outgoing.translateX).toBeLessThan(frame.cardWidth * 0.16);
    }
    if (progress === 0.5) {
      expect(outgoing.translateX).toBeLessThan(frame.cardWidth * 0.45);
    }
    if (progress >= 0.75) {
      expect(outgoing.translateX).toBeGreaterThan(frame.cardWidth * 0.75);
      expect(outgoing.scale).toBeLessThan(0.92);
    }
    expect(Math.abs(incoming.translateX)).toBeLessThan(frame.cardWidth * 0.012);
    expect(backing.every((pose) => pose.layer < 400)).toBe(true);
    expect(backing.every((pose) => Math.abs(pose.translateX) < frame.cardWidth * 0.03)).toBe(true);
    previousOutgoingX = outgoing.translateX;
    if (testInfo.project.name === "chromium") {
      await stageScreenshot(page, artifactDirectory, `forward-${index}-${progress}`);
    }
  }
  await finishPointer(
    page,
    forward.origin,
    -forward.pitch * 0.94,
    forward.elapsedMs + 100,
    "pointerup",
  );
  await expectCarouselAt(viewport(page), "team");
  await expect(page.getByTestId("stacked-deck-caption")).toHaveText("Team & rollen");

  const reverse = await beginHeldTransition(page, 3);
  let previousReveal = 0;
  for (const [index, progress] of [
    0.05, 0.2, 0.27, 0.28, 0.29, 0.4, 0.65, 0.85, 0.9, 0.97,
  ].entries()) {
    const frame = await holdPhysicalIndex(page, reverse, 3 - progress);
    const outgoing = frame.poses[3]!;
    const incoming = frame.poses[2]!;
    expect(frame).toMatchObject({
      caption: "Team & rollen",
      counter: "4",
      direction: -1,
      fromIndex: 3,
      settledIndex: 3,
      toIndex: 2,
    });
    expect(frame.paginationPosition).toBeCloseTo(3 - frame.progress, 4);
    expect(frame.paginationCurrentIndex).toBe(3);
    expect(incoming).toMatchObject({ role: "incoming", layer: 500 });
    expect(outgoing).toMatchObject({ role: "outgoing", layer: 400, stackDepth: 1 });
    expect(Math.abs(incoming.translateX)).toBeLessThan(frame.cardWidth * 0.15);
    expect(incoming.cardClipPath).toBe("none");
    expect(incoming.apertureClipPath).toContain("inset");
    if (incoming.reveal < 0.01) {
      expect(incoming.apertureBoundary).toBeCloseTo((frame.stageWidth - frame.cardWidth) / 2, 3);
      expect(incoming.apertureExposure).toBeLessThan(0.16);
    } else {
      expect(incoming.reveal).toBeGreaterThanOrEqual(previousReveal);
      expect(incoming.apertureBoundary).toBeCloseTo(frame.stageWidth, 3);
      if (progress < 0.9) {
        expect(Math.abs(incoming.rotateY)).toBeGreaterThan(0);
      }
    }
    expect(
      frame.poses.filter((pose) => pose.role === "backing").every((pose) => pose.layer < 400),
    ).toBe(true);
    previousReveal = incoming.reveal;
    if (testInfo.project.name === "chromium") {
      await stageScreenshot(page, artifactDirectory, `backward-${index}-${progress}`);
    }
  }
  await finishPointer(
    page,
    reverse.origin,
    reverse.pitch * 0.94,
    reverse.elapsedMs + 100,
    "pointerup",
  );
  await expectCarouselAt(viewport(page), "map");
  await expect(page.getByTestId("stacked-deck-caption")).toHaveText("Locatie & planning");
});

test("button settlement has no layer pop and commits metadata exactly once", async ({
  page,
}, testInfo) => {
  const stage = viewport(page);
  await page.locator(".preset-control select").selectOption("heavy");
  await installProgrammaticTrace(page);
  await page.getByTestId("stacked-deck-next").click();
  if (testInfo.project.name === "chromium") {
    const artifactDirectory = resolvePath(
      process.cwd(),
      ".artifacts",
      "physical-deck-button-frames",
      testInfo.project.name,
    );
    await mkdir(artifactDirectory, { recursive: true });
    for (const [name, progress] of [
      ["early-peel", 0.12],
      ["mid-exchange", 0.5],
      ["late-conceal", 0.9],
      ["final-active", 0.97],
    ] as const) {
      const captureState = await page.waitForFunction((minimumProgress) => {
        const element = document.querySelector<HTMLElement>(
          '[data-testid="stacked-deck-viewport"]',
        );
        if (Number(element?.dataset.transitionProgress) >= minimumProgress) return "reached";
        return element?.dataset.phase === "idle" ? "settled" : false;
      }, progress);
      if ((await captureState.jsonValue()) === "reached") {
        await stageScreenshot(page, artifactDirectory, name);
      }
    }
  }
  const trace = await readProgrammaticTrace(page);
  const active = trace.filter((sample) => sample.controllerPhase !== "idle");
  expect(active.length).toBeGreaterThan(2);
  expect(active.every((sample) => sample.transitionPhase !== "idle")).toBe(true);
  expect(active.every((sample) => sample.settledIndex === 2)).toBe(true);
  expect(active.every((sample) => sample.caption === "Locatie & planning")).toBe(true);
  expect(
    active.every((sample) => {
      const outgoing = sample.poses.find((pose) => pose.role === "outgoing");
      const incoming = sample.poses.find((pose) => pose.role === "incoming");
      const backing = sample.poses.filter((pose) => pose.role === "backing");
      return (
        outgoing?.id === "map" &&
        outgoing.layer === 500 &&
        incoming?.id === "team" &&
        incoming.layer === 400 &&
        Math.abs(incoming.translateX) < 8 &&
        backing.every((pose) => pose.layer < 400 && Math.abs(pose.translateX) < 20)
      );
    }),
  ).toBe(true);
  const settledChanges = trace
    .map((sample) => sample.settledIndex)
    .filter((value, index, values) => index === 0 || value !== values[index - 1]);
  expect(settledChanges).toEqual([2, 3]);
  expect(trace.at(-1)).toMatchObject({
    caption: "Team & rollen",
    controllerPhase: "idle",
    settledIndex: 3,
    transitionPhase: "idle",
  });
  const finalActive = trace.findLast((sample) => sample.controllerPhase !== "idle")!;
  const firstIdle = trace.at(-1)!;
  const finalActiveCard = finalActive.poses.find((pose) => pose.id === "team")!;
  const firstIdleCard = firstIdle.poses.find((pose) => pose.id === "team")!;
  for (const edge of ["left", "right", "top", "bottom", "width", "height"] as const) {
    expect(Math.abs(finalActiveCard[edge] - firstIdleCard[edge])).toBeLessThan(0.75);
  }
  expect(Math.abs(finalActive.paginationPosition - firstIdle.paginationPosition)).toBeLessThan(
    0.01,
  );
  await expect(page.getByTestId("stacked-deck-status")).toHaveText("Team & rollen, 4 of 5");

  const settledBox = await card(page, "team").locator(".stacked-deck-card-motion").boundingBox();
  await page.waitForTimeout(100);
  const stableBox = await card(page, "team").locator(".stacked-deck-card-motion").boundingBox();
  expect(stableBox).toEqual(settledBox);
  await expect(stage).toHaveAttribute("data-active-id", "team");
});

test("reversal, cancellation, and pointer-capture loss restore the committed item continuously", async ({
  page,
}) => {
  const stage = viewport(page);
  const held = await beginHeldTransition(page, 2);
  const forward = await holdPhysicalIndex(page, held, 2.58);
  const reversed = await holdPhysicalIndex(page, held, 2.24);
  const crossed = await holdPhysicalIndex(page, held, 1.88);
  const concealed = await holdPhysicalIndex(page, held, 1.86);
  const reverse = await holdPhysicalIndex(page, held, 1.78);
  expect(forward.progress).toBeGreaterThan(reversed.progress);
  expect(reversed).toMatchObject({ direction: 1, fromIndex: 2, toIndex: 3 });
  expect(crossed).toMatchObject({ direction: 1, fromIndex: 2, toIndex: 3, progress: 0 });
  expect(crossed.poses[3]!.apertureExposure).toBe(0);
  expect(concealed).toMatchObject({ direction: -1, fromIndex: 2, toIndex: 1, progress: 0 });
  expect(concealed.poses[1]!.apertureExposure).toBe(0);
  expect(reverse.progress).toBeGreaterThan(0);
  expect(reverse.paginationPosition).toBeCloseTo(2 - reverse.progress, 4);
  await finishPointer(page, held.origin, held.pitch * 0.12, held.elapsedMs + 100, "pointercancel");
  await expectCarouselAt(stage, "map");
  await expect(page.getByTestId("stacked-deck-caption")).toHaveText("Locatie & planning");

  const lost = await beginPointer(stage);
  const pitch = await motionPitch(stage);
  await movePointer(page, lost, -pitch * 0.45, 120);
  await stage.evaluate((element, pointerId) => {
    element.dispatchEvent(
      new PointerEvent("lostpointercapture", {
        bubbles: true,
        pointerId,
        pointerType: "mouse",
      }),
    );
  }, lost.pointerId);
  await expectCarouselAt(stage, "map");
  await expect(stage).toHaveAttribute("data-transition-phase", "idle");
});

test("a second command and a re-grab resolve from the rendered exchange without an idle reset", async ({
  page,
}) => {
  const stage = viewport(page);
  await page.locator(".preset-control select").selectOption("heavy");
  await installProgrammaticTrace(page);
  await page.getByTestId("stacked-deck-next").click();
  await expect(stage).toHaveAttribute("data-phase", "settling");
  await stage.evaluate(
    (element) =>
      new Promise<void>((resolve, reject) => {
        let remainingFrames = 600;
        const issueSecondCommand = () => {
          if (
            element.dataset.phase === "settling" &&
            Number(element.dataset.transitionProgress) > 0.3
          ) {
            const next = document.querySelector<HTMLButtonElement>(
              '[data-testid="stacked-deck-next"]',
            );
            if (!next || next.disabled) {
              reject(new Error("The second deck command was not available during settlement."));
              return;
            }
            next.click();
            resolve();
            return;
          }
          remainingFrames -= 1;
          if (remainingFrames <= 0) {
            reject(new Error("The first deck exchange did not reach the interruption point."));
            return;
          }
          requestAnimationFrame(issueSecondCommand);
        };
        requestAnimationFrame(issueSecondCommand);
      }),
  );
  const trace = await readProgrammaticTrace(page);
  const active = trace.filter((sample) => sample.controllerPhase !== "idle");
  expect(active.some((sample) => sample.toIndex === 3)).toBe(true);
  expect(active.some((sample) => sample.toIndex === 4)).toBe(true);
  expect(active.every((sample) => sample.transitionPhase !== "idle")).toBe(true);
  expect(active.every((sample) => sample.settledIndex === 2)).toBe(true);
  const redirectedIndex = active.findIndex((sample) => sample.toIndex === 4);
  expect(redirectedIndex).toBeGreaterThan(0);
  const beforeRedirect = active[redirectedIndex - 1]!;
  const redirected = active[redirectedIndex]!;
  const oldSubordinate = beforeRedirect.poses.find((pose) => pose.id === "team")!;
  const newSubordinate = redirected.poses.find((pose) => pose.id === "settings")!;
  expect(beforeRedirect.toIndex).toBe(3);
  expect(oldSubordinate.apertureExposure).toBe(0);
  expect(redirected.progress).toBe(0);
  expect(newSubordinate.apertureExposure).toBe(0);
  expect(redirected.paginationPosition).toBe(2);
  await expectCarouselAt(stage, "settings");

  await pagination(page).nth(2).click();
  await expectCarouselAt(stage, "map");

  await installProgrammaticTrace(page);
  await page.getByTestId("stacked-deck-next").click();
  await expect
    .poll(async () => Number(await stage.getAttribute("data-transition-progress")))
    .toBeGreaterThan(0.3);
  await pagination(page).nth(1).click();
  const reverseRetargetTrace = await readProgrammaticTrace(page);
  const reverseActive = reverseRetargetTrace.filter((sample) => sample.controllerPhase !== "idle");
  const reverseRedirectedIndex = reverseActive.findIndex((sample) => sample.toIndex === 1);
  expect(reverseRedirectedIndex).toBeGreaterThan(0);
  const beforeReverseRedirect = reverseActive[reverseRedirectedIndex - 1]!;
  const reverseRedirected = reverseActive[reverseRedirectedIndex]!;
  expect(beforeReverseRedirect.toIndex).toBe(3);
  expect(beforeReverseRedirect.poses.find((pose) => pose.id === "team")?.apertureExposure).toBe(0);
  expect(reverseRedirected.progress).toBe(0);
  expect(reverseRedirected.poses.find((pose) => pose.id === "project")?.apertureExposure).toBe(0);
  await expectCarouselAt(stage, "project");

  await pagination(page).nth(2).click();
  await expectCarouselAt(stage, "map");
  await installProgrammaticTrace(page);
  await page.getByTestId("stacked-deck-next").click();
  await expect
    .poll(async () => Number(await stage.getAttribute("data-transition-progress")))
    .toBeGreaterThan(0.3);
  await page.getByTestId("stacked-deck-previous").click();
  const cancelledCommandTrace = await readProgrammaticTrace(page);
  const cancelledActive = cancelledCommandTrace.filter(
    (sample) => sample.controllerPhase !== "idle",
  );
  expect(cancelledActive.every((sample) => sample.settledIndex === 2)).toBe(true);
  expect(Math.max(...cancelledActive.map((sample) => sample.paginationPosition))).toBeGreaterThan(
    2.2,
  );
  expect(cancelledCommandTrace.at(-1)?.paginationPosition).toBe(2);
  await expectCarouselAt(stage, "map");

  await page.getByTestId("stacked-deck-next").click();
  await expect(stage).toHaveAttribute("data-phase", "settling");
  await expect
    .poll(async () => Number(await stage.getAttribute("data-transition-progress")))
    .toBeGreaterThan(0.12);
  const regrabEvidence = await stage.evaluate((element, pointerId) => {
    const box = element.getBoundingClientRect();
    const origin = {
      pointerId,
      pointerType: "mouse" as const,
      timestamp: performance.now(),
      x: box.left + box.width / 2,
      y: box.top + box.height / 2,
    };
    const readRenderedExchange = () => ({
      phase: element.dataset.transitionPhase,
      progress: element.dataset.transitionProgress,
      transforms: Array.from(
        element.querySelectorAll<HTMLElement>(".stacked-deck-card-motion"),
      ).map((cardElement) => cardElement.style.transform),
    });
    const before = readRenderedExchange();
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
    return { after: readRenderedExchange(), before, origin };
  }, POINTER_ID);
  expect(regrabEvidence.before.phase).not.toBe("idle");
  expect(Number(regrabEvidence.before.progress)).toBeGreaterThan(0);
  expect(regrabEvidence.after).toEqual(regrabEvidence.before);
  const afterRegrab = await readFrame(page);
  expect(afterRegrab.transitionPhase).not.toBe("idle");
  expect(afterRegrab.progress).toBeGreaterThan(0);
  await finishPointer(page, regrabEvidence.origin, 0, 80, "pointercancel");
  await expectCarouselAt(stage, "map");
});

test("flick, below-threshold release, touch, pen, keyboard, and reduced motion keep the deck coherent", async ({
  page,
}) => {
  const stage = viewport(page);
  const pitch = await motionPitch(stage);
  await setNumericInput(page.getByRole("spinbutton", { name: "Maximum skip", exact: true }), 1);

  await dragSyntheticPointerBy(page, stage, -pitch * 0.2, 0, {
    eventIntervalMs: 80,
    stepDelay: 0,
    steps: 4,
  });
  await expectCarouselAt(stage, "map");

  await dragSyntheticPointerBy(page, stage, -pitch * 0.4, 0, {
    eventIntervalMs: 3,
    stepDelay: 0,
    steps: 3,
  });
  await expectCarouselAt(stage, "team");

  await dragTouchBy(page, stage, pitch * 0.62, 0, { stepDelay: 0, steps: 6 });
  await expectCarouselAt(stage, "map");

  const pen = await beginPointer(stage, "pen");
  await movePointer(page, pen, -pitch * 0.65, 200);
  await finishPointer(page, pen, -pitch * 0.65, 300, "pointerup");
  await expectCarouselAt(stage, "team");

  await stage.focus();
  await page.keyboard.press("ArrowRight");
  await expectCarouselAt(stage, "settings");
  await page.keyboard.press("Home");
  await expectCarouselAt(stage, "templates");
  await page.keyboard.press("End");
  await expectCarouselAt(stage, "settings");
  await expect(page.getByTestId("stacked-deck-inspect")).toBeEnabled();

  await page.getByTestId("reduced-motion-mode").selectOption("reduce");
  const reduced = await beginHeldTransition(page, 2);
  const reducedFrame = await holdPhysicalIndex(page, reduced, 2.55);
  expect(reducedFrame.poses.every((pose) => pose.rotate === 0)).toBe(true);
  expect(
    reducedFrame.poses.filter((pose) => pose.role === "backing").every((pose) => pose.layer < 400),
  ).toBe(true);
  await finishPointer(
    page,
    reduced.origin,
    -reduced.pitch * 0.55,
    reduced.elapsedMs + 100,
    "pointerup",
  );
  await expectCarouselAt(stage, "team");
});

test("inspection, focus, and accessibility expose only the committed card", async ({ page }) => {
  const stage = viewport(page);
  const inspect = page.getByTestId("stacked-deck-inspect");
  await expect(inspect).toHaveAttribute(
    "aria-label",
    "Inspect Locatie & planning in screen gallery, 3 of 5",
  );
  await inspect.click();
  await expect(page.getByTestId("snap-motion-media-gallery")).toBeVisible();
  await expect(page.getByTestId("snap-motion-media-gallery-close")).toBeFocused();
  await page.getByTestId("snap-motion-media-gallery-next").click();
  await expect(page.getByTestId("snap-motion-media-gallery-position")).toHaveText("4 / 5");
  await page.getByTestId("snap-motion-media-gallery-close").click();
  await expectCarouselAt(stage, "team");
  await expect(inspect).toBeFocused();
  await expect(page.getByTestId("stacked-deck-caption")).toHaveText("Team & rollen");

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

  const accessibility = await new AxeBuilder({ page }).include(".stacked-deck-demo").analyze();
  expect(accessibility.violations).toEqual([]);
});
