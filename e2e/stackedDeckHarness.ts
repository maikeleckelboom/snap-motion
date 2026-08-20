import { expect, type Locator, type Page } from "@playwright/test";

import { expectCarouselAt } from "./helpers";

export const STACKED_DECK_IDS = ["templates", "project", "map", "team", "settings"] as const;
export const STACKED_DECK_TITLES = [
  "Projectsjablonen",
  "Project 24031 — Horizon",
  "Locatie & planning",
  "Team & rollen",
  "Werkruimte-instellingen",
] as const;

let nextPointerIdValue = 617;

export function nextPointerId() {
  return nextPointerIdValue++;
}

export function viewport(page: Page) {
  return page.getByTestId("stacked-deck-viewport");
}

export function destinations(page: Page) {
  const select = page.getByTestId("stacked-deck-destination");
  const at = (index: number) => ({
    click: () => select.selectOption(STACKED_DECK_IDS[index]!),
  });
  return {
    first: () => at(0),
    last: () => at(STACKED_DECK_IDS.length - 1),
    nth: at,
  };
}

export async function motionPitch(target: Locator) {
  const pitch = Number(await target.getAttribute("data-motion-pitch"));
  if (!Number.isFinite(pitch) || pitch <= 0) {
    throw new Error(`Expected a positive stacked-deck motion pitch, received ${pitch}.`);
  }
  return pitch;
}

export interface PointerOrigin {
  readonly pointerId: number;
  readonly pointerType: "mouse" | "pen" | "touch";
  readonly timestamp: number;
  readonly x: number;
  readonly y: number;
}

export async function beginPointer(
  target: Locator,
  pointerType: PointerOrigin["pointerType"] = "mouse",
): Promise<PointerOrigin> {
  return beginPointerAt(target, 0.5, 0.5, pointerType);
}

export async function beginPointerAt(
  target: Locator,
  relativeX: number,
  relativeY: number,
  pointerType: PointerOrigin["pointerType"] = "mouse",
): Promise<PointerOrigin> {
  return target.evaluate(
    (element, input) => {
      const box = element.getBoundingClientRect();
      const origin = {
        pointerId: input.pointerId,
        pointerType: input.pointerType,
        timestamp: performance.now(),
        x: box.left + box.width * input.relativeX,
        y: box.top + box.height * input.relativeY,
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
    { pointerId: nextPointerId(), pointerType, relativeX, relativeY },
  );
}

export async function movePointer(
  page: Page,
  origin: PointerOrigin,
  deltaX: number,
  elapsedMs: number,
) {
  return movePointerBy(page, origin, deltaX, 0, elapsedMs);
}

export async function movePointerBy(
  page: Page,
  origin: PointerOrigin,
  deltaX: number,
  deltaY: number,
  elapsedMs: number,
) {
  await page.evaluate(
    ({ deltaX: moveX, deltaY: moveY, elapsedMs: elapsed, origin: start }) => {
      const event = new PointerEvent("pointermove", {
        bubbles: true,
        button: 0,
        buttons: 1,
        cancelable: true,
        clientX: start.x + moveX,
        clientY: start.y + moveY,
        isPrimary: true,
        pointerId: start.pointerId,
        pointerType: start.pointerType,
      });
      Object.defineProperty(event, "timeStamp", { value: start.timestamp + elapsed });
      window.dispatchEvent(event);
    },
    { deltaX, deltaY, elapsedMs, origin },
  );
}

export async function finishPointer(
  page: Page,
  origin: PointerOrigin,
  deltaX: number,
  elapsedMs: number,
  type: "pointerup" | "pointercancel",
) {
  return finishPointerBy(page, origin, deltaX, 0, elapsedMs, type);
}

export async function finishPointerBy(
  page: Page,
  origin: PointerOrigin,
  deltaX: number,
  deltaY: number,
  elapsedMs: number,
  type: "pointerup" | "pointercancel",
) {
  await page.evaluate(
    ({ deltaX: moveX, deltaY: moveY, elapsedMs: elapsed, origin: start, type: eventType }) => {
      const event = new PointerEvent(eventType, {
        bubbles: true,
        button: 0,
        buttons: 0,
        cancelable: true,
        clientX: start.x + moveX,
        clientY: start.y + moveY,
        isPrimary: true,
        pointerId: start.pointerId,
        pointerType: start.pointerType,
      });
      Object.defineProperty(event, "timeStamp", { value: start.timestamp + elapsed });
      window.dispatchEvent(event);
    },
    { deltaX, deltaY, elapsedMs, origin, type },
  );
}

export interface HeldTraversal {
  elapsedMs: number;
  readonly origin: PointerOrigin;
  readonly pitch: number;
  readonly startIndex: number;
}

export async function beginHeldTraversal(
  page: Page,
  startIndex: number,
  pointerType: PointerOrigin["pointerType"] = "mouse",
): Promise<HeldTraversal> {
  const stage = viewport(page);
  await destinations(page).nth(startIndex).click();
  await expectCarouselAt(stage, STACKED_DECK_IDS[startIndex]!);
  return {
    elapsedMs: 0,
    origin: await beginPointer(stage, pointerType),
    pitch: await motionPitch(stage),
    startIndex,
  };
}

export async function holdPhysicalIndex(
  page: Page,
  held: HeldTraversal,
  physicalIndex: number,
  elapsedMs = 100,
) {
  const frame = await holdPointerAt(page, held, physicalIndex, elapsedMs);
  expect(frame.physicalIndex).toBeCloseTo(physicalIndex, 3);
  return frame;
}

/**
 * Requests a physical index without asserting it. Beyond the interaction envelope the deck resists
 * rather than following, so the request and the result deliberately diverge.
 */
export async function holdPointerAt(
  page: Page,
  held: HeldTraversal,
  physicalIndex: number,
  elapsedMs = 100,
) {
  held.elapsedMs += elapsedMs;
  await movePointer(
    page,
    held.origin,
    (held.startIndex - physicalIndex) * held.pitch,
    held.elapsedMs,
  );
  return readFrame(page);
}

/** Releases with a violent same-direction throw the release resolver cannot honour twice. */
export async function flingHeld(page: Page, held: HeldTraversal, direction: -1 | 1) {
  const deltaX = -direction * held.pitch * 6;
  held.elapsedMs += 8;
  await movePointer(page, held.origin, deltaX, held.elapsedMs);
  held.elapsedMs += 8;
  await movePointer(page, held.origin, deltaX * 1.5, held.elapsedMs);
  held.elapsedMs += 8;
  await finishPointer(page, held.origin, deltaX * 1.5, held.elapsedMs, "pointerup");
}

export async function releaseHeldAtRest(page: Page, held: HeldTraversal, physicalIndex: number) {
  const deltaX = (held.startIndex - physicalIndex) * held.pitch;
  held.elapsedMs += 600;
  await movePointer(page, held.origin, deltaX, held.elapsedMs);
  await finishPointer(page, held.origin, deltaX, held.elapsedMs + 40, "pointerup");
}

export async function readFrame(page: Page) {
  return viewport(page).evaluate((element) => {
    const diagnostics = new Map(
      [...document.querySelectorAll("dt")].map((term) => [
        term.textContent?.trim() ?? "",
        term.nextElementSibling?.textContent?.trim() ?? "",
      ]),
    );
    const anchors = [...document.querySelectorAll<HTMLElement>(".anchor-table li")].map((row) => {
      const fields = [...row.children].map((field) => field.textContent?.trim() ?? "");
      return {
        id: fields[0] ?? "",
        order: Number(fields[2]?.replace("#", "")),
        position: Number(fields[1]),
      };
    });
    const semanticIds = [
      ...element.querySelectorAll<HTMLElement>("[data-snap-motion-stacked-deck-card]"),
    ].map((card) => card.dataset.itemId ?? "");
    const stageBox = element.getBoundingClientRect();
    const interactionOriginIndex = Number(element.dataset.interactionOriginIndex);
    const settledIndex = Number(element.dataset.settledIndex);
    const localPhysicalPosition = Number(element.dataset.physicalIndex);
    const diagnosticOrigin = interactionOriginIndex >= 0 ? interactionOriginIndex : settledIndex;
    const poses = [...document.querySelectorAll<HTMLElement>(".snap-motion-stacked-deck-card")].map(
      (item, index) => {
        const motion = item.querySelector<HTMLElement>(".snap-motion-stacked-deck-card-motion")!;
        const surface = item.querySelector<HTMLElement>(".screen-chrome")!;
        const box = surface.getBoundingClientRect();
        const style = getComputedStyle(item);
        const surfaceStyle = getComputedStyle(surface);
        return {
          ariaCurrent: item.getAttribute("aria-current"),
          ariaHidden: item.getAttribute("aria-hidden"),
          backgroundColor: surfaceStyle.backgroundColor,
          bottom: box.bottom,
          boxShadow: getComputedStyle(motion).boxShadow,
          clipPath: getComputedStyle(item).clipPath,
          faceCarriesScreenshot: surface.querySelector("img") !== null,
          height: box.height,
          id: item.dataset.itemId ?? "",
          index,
          interactive: item.dataset.deckInteractive === "true",
          layer: Number(item.dataset.deckLayer),
          left: box.left,
          modelOpacity: Number(surface.dataset.opacity),
          motionClipPath: getComputedStyle(motion).clipPath,
          opacity: Number(style.opacity),
          pointerEvents: style.pointerEvents,
          right: box.right,
          role: item.dataset.deckRole ?? "",
          rotate: Number(surface.dataset.rotate),
          scale: Number(surface.dataset.scale),
          shadowStrength: Number(surface.dataset.shadowStrength),
          top: box.top,
          tone: ["light", "mist", "ink"].find((tone) => surface.classList.contains(`tone-${tone}`)),
          translateX: Number(surface.dataset.translateX),
          translateY: Number(surface.dataset.translateY),
          visibility: style.visibility,
          visible: item.dataset.deckVisible === "true",
          width: box.width,
        };
      },
    );
    const targetAttribute = element.getAttribute("data-segment-target-index");
    return {
      activeId: element.dataset.activeId ?? "",
      authoritativeIndex: Number(element.dataset.authoritativeIndex),
      authorityStable: element.dataset.authorityStable === "true",
      caption:
        document.querySelector<HTMLElement>('[data-testid="stacked-deck-caption"]')?.innerText ??
        "",
      cardWidth: Number(element.dataset.cardWidth),
      commandOriginIndex: Number(element.dataset.keyboardTargetIndex),
      controllerActiveId: diagnostics.get("Nearest anchor") ?? null,
      controllerAnchors: anchors,
      controllerPhase: element.dataset.phase ?? "",
      controllerPosition: Number(element.dataset.position),
      controllerTargetId: element.dataset.targetId ?? "",
      controllerVelocity: Number.parseFloat(diagnostics.get("Velocity") ?? "NaN"),
      inspectEnabled: !document.querySelector<HTMLButtonElement>(
        '[data-testid="stacked-deck-inspect"]',
      )?.disabled,
      interactionOwned: element.dataset.interactionOwned === "true",
      interactionOriginIndex,
      maxAnchorSkip: Number(element.dataset.maxAnchorSkip),
      pendingTargetIndex: Number(element.dataset.pendingIndex),
      physicalCoordinate: {
        ids: anchors.toSorted((left, right) => left.order - right.order).map((anchor) => anchor.id),
        originIndex: diagnosticOrigin,
        originOrder:
          anchors.find((anchor) => anchor.id === semanticIds[diagnosticOrigin])?.order ?? null,
      },
      direction: Number(element.dataset.segmentDirection),
      physicalIndex: diagnosticOrigin + localPhysicalPosition,
      physicalPosition: localPhysicalPosition,
      progress: Number(element.dataset.segmentProgress),
      segmentOriginIndex: Number(element.dataset.segmentOriginIndex),
      segmentPhase: element.dataset.segmentPhase ?? "",
      segmentTargetIndex: targetAttribute === null ? null : Number(targetAttribute),
      settledIndex,
      settledId: element.dataset.settledId ?? "",
      signedLocalDistance: Number(element.dataset.signedLocalDistance),
      stageBottom: stageBox.bottom,
      stageLeft: stageBox.left,
      stageRight: stageBox.right,
      stageTop: stageBox.top,
      stageWidth: stageBox.width,
      visualTopIndex: Number(element.dataset.visualTopIndex),
      visualId: element.dataset.visualId ?? "",
      poses,
    };
  });
}

/** Resolves on the first rendered frame that names `index`, without waiting for mechanical rest. */
export async function waitForAuthority(page: Page, index: number) {
  await viewport(page).evaluate(
    (element, wanted) =>
      new Promise<void>((resolve, reject) => {
        let remainingFrames = 300;
        const tick = () => {
          if (Number(element.dataset.authoritativeIndex) === wanted) {
            resolve();
          } else if ((remainingFrames -= 1) <= 0) {
            reject(new Error(`the deck never named card ${wanted}`));
          } else {
            requestAnimationFrame(tick);
          }
        };
        requestAnimationFrame(tick);
      }),
    index,
  );
}

/** A complete throw with no waiting: press, accelerate, release. */
export async function flick(page: Page, direction: -1 | 1, pitch: number) {
  const origin = await beginPointer(viewport(page));
  const travel = -direction * pitch * 0.45;
  await movePointer(page, origin, travel * 0.4, 8);
  await movePointer(page, origin, travel, 16);
  await finishPointer(page, origin, travel, 24, "pointerup");
}

/**
 * A hand fast enough that the deck is still travelling when the next press lands.
 *
 * Two samples inside ten milliseconds, against the hundred and forty of an ordinary release. It is
 * pressed at the deck's centre rather than on a named card, so the surface hit-tests the press
 * exactly as it would a real one — including deciding, as it would, that a deck still in flight has
 * no card to press on.
 */
export async function fastFlick(page: Page, direction: -1 | 1, pitch: number) {
  const origin = await beginPointer(viewport(page));
  const travel = -direction * pitch * 0.4;
  await movePointerBy(page, origin, travel * 0.4, 8, 4);
  await movePointerBy(page, origin, travel, 16, 8);
  await finishPointerBy(page, origin, travel, 16, 11, "pointerup");
}
