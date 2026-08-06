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

const POINTER_ID = 617;
test.describe.configure({ timeout: 45_000 });
const existingResizeObserverWarning =
  /ResizeObserver loop completed with undelivered notifications\./;
const collectedPageErrors = new WeakMap<Page, string[]>();

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

async function endPointer(page: Page, origin: PointerOrigin, deltaX: number, elapsedMs: number) {
  await page.evaluate(
    ({ deltaX: moveX, elapsedMs: elapsed, origin: start }) => {
      const event = new PointerEvent("pointerup", {
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
    { deltaX, elapsedMs, origin },
  );
}

async function cancelPointer(page: Page, origin: PointerOrigin, deltaX: number, elapsedMs: number) {
  await page.evaluate(
    ({ deltaX: moveX, elapsedMs: elapsed, origin: start }) => {
      const event = new PointerEvent("pointercancel", {
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
    { deltaX, elapsedMs, origin },
  );
}

async function readFrame(page: Page) {
  return viewport(page).evaluate((element) => {
    const stageBox = element.getBoundingClientRect();
    const cards = [...document.querySelectorAll<HTMLElement>(".stacked-deck-card")];
    const poses = cards.map((item) => {
      const surface = item.querySelector<HTMLElement>(".screen-chrome")!;
      const box = surface.getBoundingClientRect();
      return {
        id: item.dataset.screenId ?? "",
        interactive: item.dataset.interactive === "true",
        layer: Number(item.dataset.layer),
        left: box.left,
        projectedScale: Number(item.dataset.projectedScale),
        right: box.right,
        role: item.dataset.role ?? "",
        rotateY: Number(item.dataset.rotateY),
        shadowStrength: Number(item.dataset.shadowStrength),
        translateX: Number(item.dataset.translateX),
        veil: Number(item.dataset.veil),
        virtualZ: Number(item.dataset.virtualZ),
        visible: item.dataset.visible === "true",
        width: box.width,
      };
    });
    return {
      cardWidth: Number(element.dataset.cardWidth),
      handoffBackward: Number(element.dataset.handoffBackward),
      handoffForward: Number(element.dataset.handoffForward),
      ownerIndex: Number(element.dataset.ownerIndex),
      pairFraction: Number(element.dataset.pairFraction),
      pairStartIndex: Number(element.dataset.pairStartIndex),
      physicalIndex: Number(element.dataset.physicalIndex),
      poses,
      stageCenterX: stageBox.left + stageBox.width / 2,
    };
  });
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
  await expectCarouselAt(stage, ["templates", "project", "map", "team", "settings"][startIndex]!);
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

function activePair(frame: Awaited<ReturnType<typeof readFrame>>) {
  return [frame.poses[frame.pairStartIndex]!, frame.poses[frame.pairStartIndex + 1]!] as const;
}

function visibleOverlapRatio(frame: Awaited<ReturnType<typeof readFrame>>) {
  const [outgoing, incoming] = activePair(frame);
  const intersection = Math.max(
    0,
    Math.min(outgoing.right, incoming.right) - Math.max(outgoing.left, incoming.left),
  );
  return intersection / Math.min(outgoing.width, incoming.width);
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

async function paintedCardAtStageCenter(page: Page) {
  return viewport(page).evaluate((element) => {
    const box = element.getBoundingClientRect();
    return document
      .elementsFromPoint(box.left + box.width / 2, box.top + box.height / 2)
      .map((hit) => hit.closest<HTMLElement>(".stacked-deck-card")?.dataset.screenId)
      .find(Boolean);
  });
}

async function visibleCardPoint(target: Locator) {
  return target.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    for (let xStep = 1; xStep < 20; xStep += 1) {
      for (let yStep = 2; yStep < 18; yStep += 1) {
        const x = rect.left + (rect.width * xStep) / 20;
        const y = rect.top + (rect.height * yStep) / 20;
        const hitCard = document
          .elementsFromPoint(x, y)
          .map((hit) => hit.closest(".stacked-deck-card"))
          .find(Boolean);
        if (hitCard === element) return { x, y };
      }
    }
    throw new Error("The stacked card has no exposed hit-test point.");
  });
}

interface WheelSample {
  readonly phase: string | undefined;
  readonly physicalIndex: number;
  readonly targetId: string | undefined;
}

async function stepWheelInFlight(page: Page, deltaX: number) {
  return page.evaluate(
    ({ delta }) =>
      new Promise<WheelSample>((resolve) => {
        const stage = document.querySelector<HTMLElement>('[data-testid="stacked-deck-viewport"]');
        if (!stage) throw new Error("Stacked deck stage is not mounted.");
        stage.dispatchEvent(
          new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaX: delta }),
        );
        let commitFrames = 180;
        let travelFrames = 3;
        const read = (): WheelSample => ({
          phase: stage.dataset.phase,
          physicalIndex: Number(stage.dataset.physicalIndex),
          targetId: stage.dataset.targetId,
        });
        const onFrame = () => {
          const sample = read();
          if (sample.phase === "settling" && sample.targetId !== undefined) {
            travelFrames -= 1;
            if (travelFrames === 0) {
              resolve(read());
              return;
            }
          } else {
            commitFrames -= 1;
            if (commitFrames === 0) {
              resolve(sample);
              return;
            }
          }
          requestAnimationFrame(onFrame);
        };
        requestAnimationFrame(onFrame);
      }),
    { delta: deltaX },
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
  await page.setViewportSize({ width: 1_600, height: 1_000 });
  await openLabDemo(page, "stacked-deck", "no-preference");
});

test.afterEach(async ({ page }) => {
  const unexpectedErrors = (collectedPageErrors.get(page) ?? []).filter(
    (error) => !existingResizeObserverWarning.test(error),
  );
  expect(unexpectedErrors).toEqual([]);
});

test("settled desktop, tablet, phone, and reduced-motion frames meet the deck contract", async ({
  page,
}) => {
  const stage = viewport(page);
  await page.getByRole("button", { name: "Desktop", exact: true }).click();
  await expect(stage).toHaveAttribute("data-profile", "wide");
  const desktop = await stage.evaluate((element) => {
    const stageBox = element.getBoundingClientRect();
    const cards = [...document.querySelectorAll<HTMLElement>(".stacked-deck-card")];
    const boxes = cards.map((item) => item.getBoundingClientRect());
    const styles = cards.map((item) => getComputedStyle(item));
    const centerSurface = cards[2]!.querySelector<HTMLElement>(".screen-chrome")!;
    return {
      centerFilter: getComputedStyle(centerSurface).filter,
      centerOpacity: styles[2]!.opacity,
      centerRatio: boxes[2]!.width / stageBox.width,
      centerVeil: Number(cards[2]!.dataset.veil),
      layers: styles.map((style) => Number(style.zIndex)),
      leftExposure: (boxes[2]!.left - boxes[1]!.left) / boxes[1]!.width,
      neighborScale: boxes[1]!.width / boxes[2]!.width,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      realAssets: cards.every((item) => item.querySelector("img[src*='coverflow-gallery']")),
      rightExposure: (boxes[3]!.right - boxes[2]!.right) / boxes[3]!.width,
      yaw: Math.abs(Number(cards[1]!.dataset.rotateY)),
    };
  });
  expect(desktop.centerRatio).toBeGreaterThanOrEqual(0.58);
  expect(desktop.centerRatio).toBeLessThanOrEqual(0.62);
  expect(desktop.leftExposure).toBeGreaterThanOrEqual(0.27);
  expect(desktop.leftExposure).toBeLessThanOrEqual(0.33);
  expect(desktop.rightExposure).toBeGreaterThanOrEqual(0.27);
  expect(desktop.rightExposure).toBeLessThanOrEqual(0.33);
  expect(desktop.neighborScale).toBeGreaterThanOrEqual(0.7);
  expect(desktop.neighborScale).toBeLessThanOrEqual(0.78);
  expect(desktop.yaw).toBeGreaterThan(0);
  expect(desktop.yaw).toBeLessThanOrEqual(15);
  expect(desktop.centerOpacity).toBe("1");
  expect(desktop.centerFilter).toBe("none");
  expect(desktop.centerVeil).toBe(0);
  expect(desktop.realAssets).toBe(true);
  expect(new Set(desktop.layers).size).toBe(desktop.layers.length);
  expect(desktop.overflow).toBe(0);

  await page.getByRole("button", { name: "Tablet", exact: true }).click();
  await expect(stage).toHaveAttribute("data-profile", "medium");
  await expect(stage).toHaveAttribute("data-card-width", "538");

  await page.getByRole("button", { name: "Phone", exact: true }).click();
  await expect(stage).toHaveAttribute("data-profile", "compact");
  const compact = await stage.evaluate((element) => {
    const stageBox = element.getBoundingClientRect();
    const cards = [...document.querySelectorAll<HTMLElement>(".stacked-deck-card")];
    const centerBox = cards[2]!.getBoundingClientRect();
    return {
      centerRatio: centerBox.width / stageBox.width,
      farCards: [cards[0], cards[4]].map((item) => ({
        pointerEvents: getComputedStyle(item!).pointerEvents,
        visibility: getComputedStyle(item!).visibility,
        willChange: getComputedStyle(item!).willChange,
      })),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      yaw: Math.abs(Number(cards[1]!.dataset.rotateY)),
    };
  });
  expect(compact.centerRatio).toBeGreaterThanOrEqual(0.85);
  expect(compact.centerRatio).toBeLessThanOrEqual(0.89);
  expect(compact.yaw).toBeLessThanOrEqual(6);
  expect(compact.farCards).toEqual([
    { pointerEvents: "none", visibility: "hidden", willChange: "auto" },
    { pointerEvents: "none", visibility: "hidden", willChange: "auto" },
  ]);
  expect(compact.overflow).toBe(0);

  await page.getByTestId("reduced-motion-mode").selectOption("reduce");
  const reduced = await readFrame(page);
  expect(reduced.poses.every((pose) => pose.rotateY === 0)).toBe(true);
  expect(new Set(reduced.poses.map((pose) => pose.layer)).size).toBe(reduced.poses.length);
  await expect(card(page, "map").locator(".screen-chrome")).toHaveCSS("filter", "none");

  const reducedPitch = await motionPitch(stage);
  const reducedOrigin = await beginPointer(stage);
  await movePointer(page, reducedOrigin, -reducedPitch * 0.4, 120);
  const reducedHeld = await readFrame(page);
  expect(reducedHeld.physicalIndex).toBeCloseTo(2.4, 3);
  expect(reducedHeld.poses.every((pose) => pose.rotateY === 0)).toBe(true);
  expect(visibleOverlapRatio(reducedHeld)).toBeGreaterThanOrEqual(0.45);
  await cancelPointer(page, reducedOrigin, -reducedPitch * 0.4, 240);
  await expect(stage).not.toHaveAttribute("data-phase", "dragging");
  await expect(page.getByTestId("snap-motion-media-gallery")).not.toBeVisible();
});

test("asymmetric top-card shuffle holds overlap, visual center, and hysteretic ownership", async ({
  page,
}) => {
  const stage = viewport(page);
  const held = await beginHeldTransition(page, 0);
  const initial = await readFrame(page);
  const preHandoff = initial.handoffForward - 0.005;
  const postHandoff = initial.handoffForward + 0.005;

  for (const physicalIndex of [0.2, 0.4, preHandoff]) {
    const frame = await holdPhysicalIndex(page, held, physicalIndex);
    const [outgoing, incoming] = activePair(frame);
    expect(frame.ownerIndex).toBe(0);
    expect(outgoing.role).toBe("foreground");
    expect(incoming.role).toBe("incoming");
    expect(outgoing.projectedScale).toBeGreaterThan(incoming.projectedScale);
    expect(outgoing.virtualZ).toBeGreaterThan(incoming.virtualZ);
    expect(outgoing.veil).toBeLessThan(incoming.veil);
    expect(visibleOverlapRatio(frame)).toBeGreaterThanOrEqual(0.45);
    expect(
      Math.min(Math.abs(outgoing.translateX), Math.abs(incoming.translateX)),
    ).toBeLessThanOrEqual(frame.cardWidth * 0.12);
    expect(incoming.translateX - outgoing.translateX).toBeLessThanOrEqual(held.pitch + 0.5);
    expect(new Set(frame.poses.map((pose) => pose.layer)).size).toBe(frame.poses.length);
    expect(frame.poses[frame.ownerIndex]!.layer).toBe(
      Math.max(...frame.poses.map((pose) => pose.layer)),
    );
  }
  expect(await paintedCardAtStageCenter(page)).toBe("templates");

  const after = await holdPhysicalIndex(page, held, postHandoff);
  const [outgoingAfter, incomingAfter] = activePair(after);
  expect(after.ownerIndex).toBe(1);
  expect(outgoingAfter.role).toBe("outgoing");
  expect(incomingAfter.role).toBe("foreground");
  expect(visibleOverlapRatio(after)).toBeGreaterThanOrEqual(0.45);
  expect(await paintedCardAtStageCenter(page)).toBe("project");

  for (const physicalIndex of [initial.handoffForward - 0.01, initial.handoffBackward + 0.01]) {
    const reversed = await holdPhysicalIndex(page, held, physicalIndex);
    expect(reversed.ownerIndex).toBe(1);
  }
  const reversedPastBand = await holdPhysicalIndex(page, held, initial.handoffBackward - 0.005);
  expect(reversedPastBand.ownerIndex).toBe(0);

  await holdPhysicalIndex(page, held, 0.7);
  await endPointer(page, held.origin, -held.pitch * 0.7, held.elapsedMs + 100);
  await expectCarouselAt(stage, "project");
  const settled = await readFrame(page);
  expect(settled.poses[1]).toMatchObject({
    role: "foreground",
    projectedScale: 1,
    translateX: 0,
    veil: 0,
    virtualZ: 0,
  });
});

test("held forward and reverse frames remain a top-card shuffle", async ({ page }, testInfo) => {
  const captureVisuals = testInfo.project.name === "chromium";
  const artifactDirectory = resolvePath(
    process.cwd(),
    ".artifacts",
    "stacked-deck-held-frames",
    testInfo.project.name,
  );
  await mkdir(artifactDirectory, { recursive: true });
  if (captureVisuals) await stageScreenshot(page, artifactDirectory, "settled-wide");
  const forward = await beginHeldTransition(page, 0);
  const thresholds = await readFrame(page);
  const forwardPositions = [
    0,
    0.2,
    0.4,
    thresholds.handoffForward - 0.005,
    thresholds.handoffForward + 0.005,
    0.7,
    0.85,
    1,
  ];

  for (const position of forwardPositions) {
    const frame = await holdPhysicalIndex(page, forward, position);
    const [outgoing, incoming] = activePair(frame);
    expect(visibleOverlapRatio(frame)).toBeGreaterThanOrEqual(0.45);
    expect(
      Math.min(Math.abs(outgoing.translateX), Math.abs(incoming.translateX)),
    ).toBeLessThanOrEqual(frame.cardWidth * 0.12);
    expect(incoming.translateX - outgoing.translateX).toBeLessThanOrEqual(forward.pitch + 0.5);
    if (captureVisuals) {
      await stageScreenshot(page, artifactDirectory, `forward-${position.toFixed(3)}`);
    }
  }
  await endPointer(page, forward.origin, -forward.pitch, forward.elapsedMs + 100);
  await expectCarouselAt(viewport(page), "project");

  const reverse = await beginHeldTransition(page, 1);
  const reversePositions = [
    1,
    0.85,
    0.7,
    thresholds.handoffBackward + 0.005,
    thresholds.handoffBackward - 0.005,
    0.4,
    0.2,
    0,
  ];
  for (const position of reversePositions) {
    const frame = await holdPhysicalIndex(page, reverse, position);
    const [outgoing, incoming] = activePair(frame);
    expect(visibleOverlapRatio(frame)).toBeGreaterThanOrEqual(0.45);
    expect(
      Math.min(Math.abs(outgoing.translateX), Math.abs(incoming.translateX)),
    ).toBeLessThanOrEqual(frame.cardWidth * 0.12);
    expect(incoming.translateX - outgoing.translateX).toBeLessThanOrEqual(reverse.pitch + 0.5);
    if (captureVisuals) {
      await stageScreenshot(page, artifactDirectory, `reverse-${position.toFixed(3)}`);
    }
  }
  await endPointer(page, reverse.origin, reverse.pitch, reverse.elapsedMs + 100);
  await expectCarouselAt(viewport(page), "templates");
});

test("fast traversal and re-grab preserve bounded catch-up with unique layers", async ({
  page,
}) => {
  const stage = viewport(page);
  await setNumericInput(page.getByRole("spinbutton", { name: "Maximum skip", exact: true }), 5);
  await pagination(page).first().click();
  await expectCarouselAt(stage, "templates");

  await dragSyntheticPointerBy(page, stage, -250, 0, {
    eventIntervalMs: 3,
    stepDelay: 0,
    steps: 3,
  });
  await expect(stage).toHaveAttribute("data-target-id", "settings");
  await expect(stage).toHaveAttribute("data-phase", "settling");

  await dragSyntheticPointerBy(page, stage, 180, 0, {
    eventIntervalMs: 40,
    stepDelay: 0,
    steps: 3,
    async beforeRelease() {
      await expect(stage).toHaveAttribute("data-phase", "dragging");
      const frame = await readFrame(page);
      expect(new Set(frame.poses.map((pose) => pose.layer)).size).toBe(frame.poses.length);
      expect(Number.isFinite(frame.physicalIndex)).toBe(true);
    },
  });
  await expect(stage).toHaveAttribute("data-phase", "idle", { timeout: 8_000 });
});

test("interrupted wheel springs, keyboard, and pagination stay synchronized", async ({ page }) => {
  const stage = viewport(page);
  await pagination(page).first().click();
  await expectCarouselAt(stage, "templates");
  await page.locator(".preset-control select").selectOption("heavy");
  const firstWheel = await stepWheelInFlight(page, 40);
  const secondWheel = await stepWheelInFlight(page, 40);
  const thirdWheel = await stepWheelInFlight(page, 40);
  expect(firstWheel).toMatchObject({ phase: "settling", targetId: "project" });
  expect(secondWheel).toMatchObject({ phase: "settling", targetId: "map" });
  expect(thirdWheel).toMatchObject({ phase: "settling", targetId: "team" });
  expect(secondWheel.physicalIndex).toBeGreaterThan(firstWheel.physicalIndex);
  expect(thirdWheel.physicalIndex).toBeGreaterThan(secondWheel.physicalIndex);

  await page.locator(".preset-control select").selectOption("balanced");
  await stage.focus();
  await page.keyboard.press("Home");
  await expectCarouselAt(stage, "templates");
  await page.keyboard.press("End");
  await expectCarouselAt(stage, "settings");
  await page.keyboard.press("ArrowLeft");
  await expectCarouselAt(stage, "team");
  await expect(page.getByTestId("stacked-deck-pagination-indicator")).toHaveAttribute(
    "data-position",
    "3.00000",
  );
  await expect(pagination(page).nth(3)).toHaveAttribute("aria-current", "true");
  await expect(page.getByTestId("stacked-deck-status")).toHaveText("Team & rollen, 4 of 5");
});

test("exposed strips select, covered regions reject input, and gallery close synchronizes exactly", async ({
  page,
}) => {
  const stage = viewport(page);
  const neighbor = card(page, "team");
  const coveredHit = await neighbor.evaluate((element) => {
    const neighborBox = element.getBoundingClientRect();
    const centerBox = document
      .querySelector<HTMLElement>('.stacked-deck-card[data-screen-id="map"]')!
      .getBoundingClientRect();
    const x = Math.max(neighborBox.left, centerBox.left) + 12;
    const y = Math.max(neighborBox.top, centerBox.top) + 40;
    return document
      .elementsFromPoint(x, y)
      .map((hit) => hit.closest<HTMLElement>(".stacked-deck-card")?.dataset.screenId)
      .find(Boolean);
  });
  expect(coveredHit).toBe("map");

  const exposedPoint = await visibleCardPoint(neighbor);
  await page.mouse.click(exposedPoint.x, exposedPoint.y);
  await expectCarouselAt(stage, "team");
  await expect(page.getByTestId("stacked-deck-caption")).toHaveText("Team & rollen");
  await expect(page.getByTestId("snap-motion-media-gallery")).not.toBeVisible();

  await card(page, "team").click();
  await expect(page.getByTestId("snap-motion-media-gallery")).toBeVisible();
  await expect(page.getByTestId("snap-motion-media-gallery-close")).toBeFocused();
  await page.getByTestId("snap-motion-media-gallery-next").click();
  await expect(page.getByTestId("snap-motion-media-gallery-position")).toHaveText("5 / 5");
  await expect(page.getByTestId("snap-motion-media-gallery")).toHaveAttribute(
    "data-track-state",
    "idle",
  );
  await page.getByTestId("snap-motion-media-gallery-close").click();
  await expectCarouselAt(stage, "settings");
  await expect(page.getByTestId("stacked-deck-inspect")).toBeFocused();
  await expect(page.getByTestId("stacked-deck-counter")).toHaveText("5");

  const accessibility = await new AxeBuilder({ page }).include(".stacked-deck-demo").analyze();
  expect(accessibility.violations).toEqual([]);

  await dragSyntheticPointerBy(page, stage, 170, 0, {
    eventIntervalMs: 30,
    stepDelay: 0,
    steps: 4,
  });
  await expect(page.getByTestId("snap-motion-media-gallery")).not.toBeVisible();
});

test("touch, pen, and elastic boundaries preserve direct manipulation and exact settlement", async ({
  page,
}) => {
  const stage = viewport(page);
  const pitch = await motionPitch(stage);
  await setNumericInput(page.getByRole("spinbutton", { name: "Maximum skip", exact: true }), 1);
  await dragTouchBy(page, stage, -pitch * 0.62, 0, { stepDelay: 0, steps: 6 });
  await expectCarouselAt(stage, "team");

  const penOrigin = await beginPointer(stage, "pen");
  await movePointer(page, penOrigin, pitch * 0.62, 200);
  await endPointer(page, penOrigin, pitch * 0.62, 300);
  await expectCarouselAt(stage, "map");

  await pagination(page).first().click();
  await expectCarouselAt(stage, "templates");
  const startOrigin = await beginPointer(stage);
  await movePointer(page, startOrigin, 120, 100);
  expect(Number(await stage.getAttribute("data-physical-index"))).toBeLessThan(0);
  await endPointer(page, startOrigin, 120, 200);
  await expectCarouselAt(stage, "templates");

  await pagination(page).last().click();
  await expectCarouselAt(stage, "settings");
  const endOrigin = await beginPointer(stage);
  await movePointer(page, endOrigin, -120, 100);
  expect(Number(await stage.getAttribute("data-physical-index"))).toBeGreaterThan(4);
  await endPointer(page, endOrigin, -120, 200);
  await expect(stage).toHaveAttribute("data-phase", "idle", { timeout: 15_000 });
  await expect(stage).toHaveAttribute("data-active-id", "settings");
});
