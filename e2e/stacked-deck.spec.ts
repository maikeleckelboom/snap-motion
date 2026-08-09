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
const TONES = ["light", "mist", "light", "mist", "ink"] as const;
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
    const poses = [...document.querySelectorAll<HTMLElement>(".snap-motion-stacked-deck-card")].map(
      (item) => {
        const motion = item.querySelector<HTMLElement>(".snap-motion-stacked-deck-card-motion")!;
        const surface = item.querySelector<HTMLElement>(".screen-chrome")!;
        const box = surface.getBoundingClientRect();
        const style = getComputedStyle(item);
        return {
          ariaCurrent: item.getAttribute("aria-current"),
          ariaHidden: item.getAttribute("aria-hidden"),
          bottom: box.bottom,
          height: box.height,
          id: item.dataset.itemId ?? "",
          interactive: item.dataset.deckInteractive === "true",
          layer: Number(item.dataset.deckLayer),
          left: box.left,
          motionClipPath: getComputedStyle(motion).clipPath,
          opacity: Number(surface.dataset.opacity),
          pointerEvents: style.pointerEvents,
          right: box.right,
          role: item.dataset.deckRole ?? "",
          rotate: Number(surface.dataset.rotate),
          scale: Number(surface.dataset.scale),
          shadowStrength: Number(surface.dataset.shadowStrength),
          top: box.top,
          translateX: Number(surface.dataset.translateX),
          translateY: Number(surface.dataset.translateY),
          visibility: style.visibility,
          visible: item.dataset.deckVisible === "true",
          width: box.width,
        };
      },
    );
    const pile = [
      ...document.querySelectorAll<HTMLElement>(".snap-motion-stacked-deck-pile-layer"),
    ].map((item) => {
      const box = item.getBoundingClientRect();
      const surface = item.querySelector<HTMLElement>(".stacked-deck-pile-surface")!;
      const layerStyle = getComputedStyle(item);
      return {
        id: item.dataset.pileItemId ?? "",
        index: Number(item.dataset.pileItemIndex),
        slot: Number(item.dataset.pileSlot),
        side: Number(item.dataset.pileSide),
        opacity: Number(layerStyle.opacity),
        layer: Number(layerStyle.zIndex),
        left: Number(box.left.toFixed(3)),
        right: Number(box.right.toFixed(3)),
        top: Number(box.top.toFixed(3)),
        bottom: Number(box.bottom.toFixed(3)),
        ariaHidden: item.getAttribute("aria-hidden"),
        inert: item.hasAttribute("inert"),
        backgroundColor: getComputedStyle(surface).backgroundColor,
        tone: surface.dataset.pileTone ?? "",
        pointerEvents: layerStyle.pointerEvents,
      };
    });
    const targetAttribute = element.getAttribute("data-segment-target-index");
    return {
      authoritativeIndex: Number(element.dataset.authoritativeIndex),
      authorityStable: element.dataset.authorityStable === "true",
      caption:
        document.querySelector<HTMLElement>('[data-testid="stacked-deck-caption"]')?.innerText ??
        "",
      cardWidth: Number(element.dataset.cardWidth),
      controllerPhase: element.dataset.phase ?? "",
      counter:
        document.querySelector<HTMLElement>('[data-testid="stacked-deck-counter"]')?.innerText ??
        "",
      inspectEnabled: !document.querySelector<HTMLButtonElement>(
        '[data-testid="stacked-deck-inspect"]',
      )?.disabled,
      interactionOwned: element.dataset.interactionOwned === "true",
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
  readonly pileIdentity: readonly {
    readonly id: string;
    readonly index: number;
    readonly tone: string;
    readonly opacity: number;
    readonly slot: number;
  }[];
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
        authoritativeIndex: Number(element.dataset.authoritativeIndex),
        authorityStable: element.dataset.authorityStable === "true",
        caption:
          document.querySelector<HTMLElement>('[data-testid="stacked-deck-caption"]')?.innerText ??
          "",
        cardWidth: Number(element.dataset.cardWidth),
        controllerPhase,
        direction: Number(element.dataset.segmentDirection),
        inspectEnabled: !document.querySelector<HTMLButtonElement>(
          '[data-testid="stacked-deck-inspect"]',
        )?.disabled,
        interactionOriginIndex: Number(element.dataset.interactionOriginIndex),
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
              id: item.dataset.itemId ?? "",
              layer: Number(item.dataset.deckLayer),
              opacity: Number(surface.dataset.opacity),
              role: item.dataset.deckRole ?? "",
              rotate: Number(surface.dataset.rotate),
              scale: Number(surface.dataset.scale),
              translateX: Number(surface.dataset.translateX),
              translateY: Number(surface.dataset.translateY),
              visible: item.dataset.deckVisible === "true",
            };
          },
        ),
        pile: [
          ...document.querySelectorAll<HTMLElement>(".snap-motion-stacked-deck-pile-layer"),
        ].flatMap((item) => [
          Number(item.dataset.pileSlot),
          Number(getComputedStyle(item).opacity),
        ]),
        pileIdentity: [
          ...document.querySelectorAll<HTMLElement>(".snap-motion-stacked-deck-pile-layer"),
        ].map((item) => {
          const surface = item.querySelector<HTMLElement>(".stacked-deck-pile-surface");
          return {
            id: item.dataset.pileItemId ?? "",
            index: Number(item.dataset.pileItemIndex),
            tone: surface?.dataset.pileTone ?? "",
            opacity: Number(getComputedStyle(item).opacity),
            slot: Number(item.dataset.pileSlot),
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
 * The deck is exactly as thick as the screens it is not drawing. Summing how present everything is —
 * every backing layer plus every card face — therefore accounts for the whole deck exactly once on
 * every frame, including through the exchange, where one screen is part dissolving face and part
 * materialising layer and the two halves add up to it.
 */
function expectDeckPresence(layers: readonly number[], faces: readonly number[]) {
  expect(layers.length).toBeLessThanOrEqual(IDS.length - 1);
  expect([...layers, ...faces].reduce((total, presence) => total + presence, 0)).toBeCloseTo(
    IDS.length,
    2,
  );
}

function expectFrameAccountsForEveryScreen(frame: DeckFrame) {
  expectDeckPresence(
    frame.pile.map((layer) => layer.opacity),
    frame.poses.map((pose) => pose.opacity),
  );
}

function expectIdentityPresence(
  layers: readonly { id: string; index: number; tone: string; opacity: number }[],
  faces: readonly { id: string; opacity: number }[],
) {
  const presence = new Map<string, number>(IDS.map((id) => [id, 0]));
  for (const face of faces) presence.set(face.id, (presence.get(face.id) ?? 0) + face.opacity);
  for (const layer of layers) {
    const expectedIndex = IDS.indexOf(layer.id as (typeof IDS)[number]);
    expect(layer.index).toBe(expectedIndex);
    expect(layer.tone).toBe(TONES[expectedIndex]);
    presence.set(layer.id, (presence.get(layer.id) ?? 0) + layer.opacity);
  }
  for (const id of IDS) expect(presence.get(id)).toBeCloseTo(1, 2);
}

function expectFrameAccountsForEveryScreenByIdentity(frame: DeckFrame) {
  expectIdentityPresence(frame.pile, frame.poses);
  for (const layer of frame.pile) {
    expect(layer.ariaHidden).toBe("true");
    expect(layer.inert).toBe(true);
    expect(layer.pointerEvents).toBe("none");
  }
}

function pileIdentitySignature(frame: DeckFrame) {
  return frame.pile.map((layer) => ({
    id: layer.id,
    index: layer.index,
    opacity: Number(layer.opacity.toFixed(4)),
    slot: Number(layer.slot.toFixed(4)),
    tone: layer.tone,
  }));
}

/** The same accounting across a whole traced interaction rather than one sampled frame. */
function expectPileAccountsForEveryScreen(trace: readonly TraversalSample[]) {
  for (const sample of trace) {
    // Traced layers are two numbers each: the slot it occupies and how present it is.
    expectDeckPresence(
      sample.pile.filter((_unused, index) => index % 2 === 1),
      sample.poses.map((pose) => pose.opacity),
    );
    expectIdentityPresence(sample.pileIdentity, sample.poses);
  }
}

/** Resolves on the first rendered frame that names `index`, without waiting for mechanical rest. */
async function waitForAuthority(page: Page, index: number) {
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

/** A complete throw with no waiting: press, accelerate, release. */
async function flick(page: Page, direction: -1 | 1, pitch: number) {
  const origin = await beginPointer(viewport(page));
  const travel = -direction * pitch * 0.45;
  await movePointer(page, origin, travel * 0.4, 8);
  await movePointer(page, origin, travel, 16);
  await finishPointer(page, origin, travel, 24, "pointerup");
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
 * The primary regression contract, for one interaction: it is bounded to one adjacent card from its
 * own origin — projection, physical mass, authority, and rendered faces alike.
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
    for (const [index, pose] of sample.poses.entries()) {
      if (pose.visible) expect(Math.abs(index - originIndex)).toBeLessThanOrEqual(1);
    }
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
  expectPileAccountsForEveryScreen(trace);
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
    const motion = document.querySelector<HTMLElement>(".snap-motion-stacked-deck-card-motion")!;
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
        document.querySelector(".stacked-deck-backdrop .snap-motion-stacked-deck-card"),
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

test("deck thickness shows where you are, from index order alone", async ({ page }) => {
  const stage = viewport(page);
  const cardWidth = Number(await stage.getAttribute("data-card-width"));
  const edge = (layer: { left: number; right: number }, stageCentre: number) =>
    Math.max(stageCentre - layer.left, layer.right - stageCentre) - cardWidth / 2;

  // Position is legible from thickness alone: nothing behind the first screen, nothing ahead of the
  // last, an even split in the middle — and always one backing card per remaining screen.
  for (const [index, itemIds, slots] of [
    [0, ["project", "map", "team", "settings"], [1, 2, 3, 4]],
    [2, ["templates", "project", "team", "settings"], [-2, -1, 1, 2]],
    [4, ["templates", "project", "map", "team"], [-4, -3, -2, -1]],
  ] as const) {
    await pagination(page).nth(index).click();
    await expectCarouselAt(stage, IDS[index]!);
    const frame = await readFrame(page);
    expect(frame.pile.map((layer) => layer.id)).toEqual(itemIds);
    expect(frame.pile.map((layer) => layer.slot)).toEqual([...slots]);
    expect(frame.pile.every((layer) => layer.ariaHidden === "true")).toBe(true);
    expectFrameAccountsForEveryScreenByIdentity(frame);
    const settingsLayer = frame.pile.find((layer) => layer.id === "settings");
    if (settingsLayer !== undefined) {
      expect(settingsLayer.tone).toBe("ink");
      expect(settingsLayer.backgroundColor).toBe("rgb(15, 23, 42)");
    }
    expect(frame.poses.filter((pose) => pose.visible)).toHaveLength(1);
    const centre = (frame.stageLeft + frame.stageRight) / 2;
    for (const layer of frame.pile) {
      // Each layer sits on the side its own index lies on, and shows only an edge.
      expect(Math.sign(layer.left + layer.right - 2 * centre)).toBe(Math.sign(layer.slot));
      expect(edge(layer, centre)).toBeGreaterThan(0);
      expect(edge(layer, centre)).toBeLessThan(cardWidth * 0.08);
    }
    // Mirrored slots are exactly as deep as one another: neither side is favoured.
    for (const layer of frame.pile) {
      const mirrored = frame.pile.find((other) => other.slot === -layer.slot);
      if (mirrored) expect(edge(mirrored, centre)).toBeCloseTo(edge(layer, centre), 1);
    }
  }

  // The exchange is one physical event: the adjacent target rises out of the nearest slot on its
  // own side, and the card it replaces materialises into the nearest slot on the far side. Previous
  // mirrors Next because the item ordering is reversed, not because the gesture direction is.
  for (const direction of [1, -1] as const) {
    await pagination(page).nth(2).click();
    await expectCarouselAt(stage, "map");
    const held = await beginHeldTraversal(page, 2);
    const opening = await holdPhysicalIndex(page, held, 2 + direction * 0.05);
    expectFrameAccountsForEveryScreenByIdentity(opening);
    const target = opening.poses.find((pose) => pose.role === "target")!;
    expect(Math.sign(target.translateX)).toBe(direction);
    expect(opening.pile.map((layer) => layer.slot)).toEqual(
      direction > 0 ? [-2.05, -1.05, 1.95] : [-1.95, 1.05, 2.05],
    );

    // Past the midpoint the vacated card is materialising into the far side, part-present.
    const exchanging = await holdPhysicalIndex(page, held, 2 + direction * 0.75);
    expectFrameAccountsForEveryScreenByIdentity(exchanging);
    const vacating = exchanging.pile.find((layer) => layer.opacity < 1)!;
    expect(vacating.id).toBe("map");
    expect(Math.sign(vacating.slot)).toBe(-direction);
    expect(Math.abs(vacating.slot)).toBeCloseTo(0.75, 2);
    expect(vacating.opacity).toBeGreaterThan(0);

    // A completed exchange leaves exactly the resting geometry of the card it landed on.
    const landed = await holdPhysicalIndex(page, held, 2 + direction);
    expectFrameAccountsForEveryScreenByIdentity(landed);
    await finishPointer(
      page,
      held.origin,
      -direction * held.pitch,
      held.elapsedMs + 400,
      "pointerup",
    );
    await expectCarouselAt(stage, IDS[2 + direction]!);
    expect((await readFrame(page)).pile.map((layer) => layer.slot)).toEqual(
      landed.pile.map((layer) => Number(layer.slot.toFixed(0))),
    );
  }

  // Travelling either way from the same position lays the deck out as an exact mirror.
  const mirrored: number[][] = [];
  for (const direction of [1, -1] as const) {
    await pagination(page).nth(2).click();
    await expectCarouselAt(stage, "map");
    const held = await beginHeldTraversal(page, 2);
    const frame = await holdPhysicalIndex(page, held, 2 + direction * 0.3);
    mirrored.push(
      frame.pile
        .map((layer) => Number((direction * layer.slot).toFixed(4)))
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

test("decorative pile identity retraces the ordered screen through reversal", async ({ page }) => {
  const held = await beginHeldTraversal(page, 4);
  const outbound = await holdPhysicalIndex(page, held, 3.25);
  expectFrameAccountsForEveryScreenByIdentity(outbound);
  const outgoingSettings = outbound.pile.find((layer) => layer.id === "settings")!;
  expect(outgoingSettings).toMatchObject({ index: 4, tone: "ink", side: 1 });
  expect(outgoingSettings.opacity).toBeGreaterThan(0);
  expect(outgoingSettings.backgroundColor).toBe("rgb(15, 23, 42)");
  const signature = pileIdentitySignature(outbound);

  const returning = await holdPhysicalIndex(page, held, 3.55);
  expectFrameAccountsForEveryScreenByIdentity(returning);
  const retraced = await holdPhysicalIndex(page, held, 3.25);
  expectFrameAccountsForEveryScreenByIdentity(retraced);
  expect(pileIdentitySignature(retraced)).toEqual(signature);

  await finishPointer(page, held.origin, held.pitch * 0.75, held.elapsedMs + 100, "pointercancel");
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
        pile: [
          ...element.querySelectorAll<HTMLElement>(".snap-motion-stacked-deck-pile-layer"),
        ].flatMap((layer) => {
          const box = layer.getBoundingClientRect();
          return [Number(box.left.toFixed(2)), Number(box.top.toFixed(2))];
        }),
        target:
          element.dataset.segmentTargetIndex === undefined
            ? null
            : Number(element.dataset.segmentTargetIndex),
        visualTop: Number(element.dataset.visualTopIndex),
        visibleCount: [
          ...element.querySelectorAll<HTMLElement>(".snap-motion-stacked-deck-card"),
        ].filter((card) => getComputedStyle(card).visibility === "visible").length,
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
  expect(wheelSamples.every((sample) => sample.visibleCount <= 2)).toBe(true);
  // Wheel traversal uses the same projection: one deck, one top, one adjacent target, no rail. The
  // deck is never thicker than the screens left in it, and never loses one either.
  expect(
    wheelSamples.every((sample) => {
      const layers = sample.pile.length / 2;
      return layers >= IDS.length - 2 && layers <= IDS.length - 1;
    }),
  ).toBe(true);
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
  expect(trace.every((sample) => sample.poses.filter((pose) => pose.visible).length === 1)).toBe(
    true,
  );
  expectPileAccountsForEveryScreen(trace);
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

  await installTraversalTrace(page, 1_800);
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
  // No card beyond the reachable run was ever projected.
  expect(trace.every((sample) => !sample.poses[4]!.visible)).toBe(true);
  await expectCarouselAt(stage, "team");
  expectPileAccountsForEveryScreen(trace);
});

test("a reverse gesture during settlement takes the card back immediately", async ({ page }) => {
  const stage = viewport(page);
  const pitch = await motionPitch(stage);

  await installTraversalTrace(page, 1_800);
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
  const pointerId = nextPointerId++;
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
  // It is never available while a second face is on screen, and never before the handoff completes.
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
  expect(topPose(reducedFrame).translateX).toBeCloseTo(-reduced.pitch * 0.55, 2);
  expect(reducedFrame.poses.every((pose) => pose.rotate === 0)).toBe(true);
  expect(topPose(reducedFrame)).toMatchObject({ translateY: 0, scale: 1 });
  // Ownership still has to migrate, and depth still has to read as a pile.
  expect(topPose(reducedFrame).opacity).toBeLessThan(1);
  expect(reducedFrame.poses.find((pose) => pose.role === "target")!.scale).toBeLessThan(1);
  // The deck still accounts for every screen: drawn faces plus the rest as backing edges.
  expectFrameAccountsForEveryScreen(reducedFrame);

  // Reduced motion keeps the same interaction span: one adjacent card, then bounded resistance.
  const reducedSecond = await holdPointerAt(page, reduced, 3.6);
  expect(reducedSecond).toMatchObject({
    visualTopIndex: 3,
    segmentOriginIndex: 3,
    segmentTargetIndex: null,
    segmentPhase: "elastic",
  });
  expect(reducedSecond.physicalIndex).toBeLessThan(3.5);
  // Overdrag draws no target, so every remaining screen is a backing layer again.
  expect(reducedSecond.pile).toHaveLength(IDS.length - 1);
  expect(reducedSecond.pile.filter((layer) => layer.slot < 0)).toHaveLength(3);
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
      // The deck travels with the exchange rather than sitting still behind it.
      expect(late.pile.map((layer) => layer.slot)).not.toEqual(
        dominant.pile.map((layer) => layer.slot),
      );
      expectFrameAccountsForEveryScreen(late);
      expectFrameAccountsForEveryScreen(dominant);
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

  // Past it the incoming card is the nearer one, so every name follows it immediately even though
  // ownership, settled selection, and the anchor itself are all most of a pitch behind.
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
  // Both faces are still drawn, so identity is nameable but not yet uncontested.
  expect(migrated.authorityStable).toBe(false);
  expect(topPose(migrated).visible).toBe(true);

  // Fully dissolved: one card on screen, already parked within a fraction of a pixel of rest. That
  // is the point at which actions opening another surface become safe, not mechanical rest.
  const uncontested = await holdPhysicalIndex(page, held, 2.95);
  expect(uncontested).toMatchObject({
    authoritativeIndex: 3,
    authorityStable: true,
    caption: TITLES[3],
    settledIndex: 2,
    visualTopIndex: 2,
  });
  expect(topPose(uncontested)).toMatchObject({
    id: "map",
    opacity: 0,
    role: "top",
    visible: false,
  });
  expect(dominance(uncontested).targetVisibility).toBeGreaterThan(0.95);
  const promoted = uncontested.poses.find((pose) => pose.role === "target")!;
  expect(Math.abs(promoted.translateX)).toBeLessThan(1);
  expect(promoted.scale).toBeGreaterThan(0.999);
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
