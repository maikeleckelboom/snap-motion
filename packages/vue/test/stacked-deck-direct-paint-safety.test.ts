import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { h, nextTick } from "vue";

import StackedDeck from "../src/stacked-deck/components/StackedDeck.vue";
import type { StackedDeckCardState } from "../src/stacked-deck/stacked-deck-contracts";

/**
 * Rendered-material safety for the Direct projection.
 *
 * The invariant is physical rather than semantic: a rendered pixel may change hands only because a
 * body moved through it. Two card bodies that both cover the same point on two consecutive rendered
 * frames may therefore never exchange paint order at that point — there is no geometry in such a
 * frame pair that could account for the change, so whatever produced it was a state field.
 *
 * Every frame here is a real rendered frame of the real component, driven by real pointer events on
 * a hand-advanced frame clock, so a failure is a failure a user could have recorded.
 */

const screens = [
  { id: "a", title: "A" },
  { id: "b", title: "B" },
  { id: "c", title: "C" },
  { id: "d", title: "D" },
  { id: "e", title: "E" },
] as const;
type Screen = { readonly id: string; readonly title: string };
const TypedStackedDeck = StackedDeck<Screen>;

interface Pose {
  readonly translateX: number;
  readonly translateY: number;
  readonly scale: number;
  readonly rotate: number;
  readonly opacity: number;
  readonly layer: number;
  readonly role: string;
  readonly shadowStrength: number;
  readonly visible: boolean;
  readonly interactive: boolean;
}

interface Frame {
  readonly tick: number;
  readonly poses: readonly Pose[];
  readonly controllerPhase: string;
  readonly pointerId: number | null;
  readonly pointerInteractionActive: boolean;
  readonly pointerOwned: boolean;
  readonly physicalIndex: number;
  readonly physicalPosition: number;
  readonly traversalDirection: -1 | 0 | 1;
  readonly interactionDirection: -1 | 0 | 1;
  readonly localProgress: number;
  readonly authoritativeIndex: number;
  readonly visualTopIndex: number;
  readonly projectionDirection: -1 | 0 | 1;
  readonly targetIndex: number | null;
  readonly originIndex: number;
  readonly signedTravel: number;
  readonly phase: string;
  readonly sourceX: number;
  readonly sourceY: number;
  readonly centreCoveringIds: readonly string[];
  readonly centreOwnerId: string | null;
  readonly sourceCoversCentre: boolean;
  readonly landings: readonly { itemIndex: number; settlement: number; releaseOrder: number }[];
}

function nonHeldRenderedPoseState(frame: Frame, heldIndex: number) {
  return frame.poses
    .filter((_pose, index) => index !== heldIndex)
    .map(
      ({
        interactive,
        layer,
        opacity,
        role,
        rotate,
        scale,
        shadowStrength,
        translateX,
        translateY,
        visible,
      }) => ({
        interactive,
        layer,
        opacity,
        role,
        rotate,
        scale,
        shadowStrength,
        translateX,
        translateY,
        visible,
      }),
    );
}

/** One deterministic frame clock every animated part of the deck runs on. */
function installClock() {
  let now = 0;
  let handle = 1;
  let queue = new Map<number, FrameRequestCallback>();
  const realRaf = globalThis.requestAnimationFrame;
  const realCancel = globalThis.cancelAnimationFrame;
  const realNow = performance.now.bind(performance);
  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
    const id = handle++;
    queue.set(id, callback);
    return id;
  }) as typeof globalThis.requestAnimationFrame;
  globalThis.cancelAnimationFrame = ((id: number) => {
    queue.delete(id);
  }) as typeof globalThis.cancelAnimationFrame;
  performance.now = () => now;
  return {
    async step() {
      now += 16;
      const pending = queue;
      queue = new Map();
      for (const callback of pending.values()) callback(now);
      await nextTick();
    },
    restore() {
      globalThis.requestAnimationFrame = realRaf;
      globalThis.cancelAnimationFrame = realCancel;
      performance.now = realNow;
    },
  };
}

function pointerEvent(type: string, clientX: number, pointerId: number, clientY = 0) {
  return new PointerEvent(type, {
    bubbles: true,
    buttons: type === "pointerdown" || type === "pointermove" ? 1 : 0,
    cancelable: true,
    clientX,
    clientY,
    isPrimary: true,
    pointerId,
    pointerType: "mouse",
  });
}

/** Whether one transformed card body contains a stage point. */
function contains(pose: Pose, x: number, y: number, width: number, height: number) {
  if (!pose.visible || pose.opacity <= 0 || pose.scale <= 0) return false;
  const radians = (-pose.rotate * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const dx = x - pose.translateX;
  const dy = y - pose.translateY;
  return (
    Math.abs((dx * cosine + dy * sine) / pose.scale) <= width / 2 &&
    Math.abs((-dx * sine + dy * cosine) / pose.scale) <= height / 2
  );
}

/** The card whose face is painted at a point: highest z-index, ties by DOM order as the browser. */
function ownerAt(poses: readonly Pose[], x: number, y: number, width: number, height: number) {
  let owner = -1;
  let layer = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < poses.length; index += 1) {
    const pose = poses[index]!;
    if (!contains(pose, x, y, width, height)) continue;
    if (pose.layer >= layer) {
      layer = pose.layer;
      owner = index;
    }
  }
  return owner;
}

interface Violation {
  fromTick: number;
  toTick: number;
  before: number;
  after: number;
  points: number;
  shift: number;
  x: number;
  y: number;
}

interface PoseJump {
  readonly distance: number;
  readonly rotateDistance: number;
  readonly scaleDistance: number;
  readonly shellIndex: number;
  readonly translateDistance: number;
}

interface ContinuityProbe {
  readonly after: Frame;
  readonly before: Frame;
  readonly epsilon: number;
  readonly jump: PoseJump;
  readonly kind: "diagonal" | "landing-retirement" | "vertical";
  readonly pointerDelta: number;
}

/**
 * The deck configuration one press found, recorded at the frame it pressed on.
 *
 * The accepted Direct kernel exchanges depth between a source physically covering the pile and the
 * neighbour it uncovers. That premise is a property of the frame an interaction opens on, so it is
 * captured there rather than inferred afterwards from where the deck ended up.
 */
interface AcceptedOrigin {
  readonly tick: number;
  /** The card the hand actually went down on. */
  readonly pressedIndex: number;
  /** The card the deck then opened its hand-owned transaction from. */
  readonly index: number;
  readonly interactiveIndices: readonly number[];
  readonly landingIndices: readonly number[];
}

/** Everything an accepted Direct origin has to be able to say for itself. */
function premiseBreaches(origins: readonly AcceptedOrigin[]): string[] {
  const breaches: string[] = [];
  for (const origin of origins) {
    if (origin.index !== origin.pressedIndex) {
      breaches.push(
        `frame ${origin.tick}: pressed card ${origin.pressedIndex}, opened on card ${origin.index}`,
      );
    }
    if (origin.landingIndices.includes(origin.index)) {
      breaches.push(`frame ${origin.tick}: card ${origin.index} was still a release in the air`);
    }
    if (!origin.interactiveIndices.includes(origin.index)) {
      breaches.push(`frame ${origin.tick}: card ${origin.index} was not an interactive card`);
    }
    if (origin.interactiveIndices.length !== 1) {
      breaches.push(
        `frame ${origin.tick}: ${origin.interactiveIndices.length} cards were interactive at once`,
      );
    }
  }
  return breaches;
}

function paintViolations(frames: readonly Frame[], width: number, height: number): Violation[] {
  const points: { x: number; y: number }[] = [];
  for (let x = -width; x <= width; x += width / 16) {
    for (let y = -height; y <= height; y += height / 10) points.push({ x, y });
  }
  const found = new Map<string, Violation>();
  for (let index = 1; index < frames.length; index += 1) {
    const previous = frames[index - 1]!;
    const current = frames[index]!;
    for (const point of points) {
      const before = ownerAt(previous.poses, point.x, point.y, width, height);
      const after = ownerAt(current.poses, point.x, point.y, width, height);
      if (before === after || before < 0 || after < 0) continue;
      // A body edge that crossed this point explains the change. Nothing else does.
      if (!contains(current.poses[before]!, point.x, point.y, width, height)) continue;
      if (!contains(previous.poses[after]!, point.x, point.y, width, height)) continue;
      const key = `${previous.tick}->${current.tick}:${before}->${after}`;
      const seen = found.get(key);
      if (seen !== undefined) {
        seen.points += 1;
        continue;
      }
      found.set(key, {
        fromTick: previous.tick,
        toTick: current.tick,
        before,
        after,
        points: 1,
        shift: Math.hypot(
          current.poses[before]!.translateX - previous.poses[before]!.translateX,
          current.poses[before]!.translateY - previous.poses[before]!.translateY,
        ),
        x: point.x,
        y: point.y,
      });
    }
  }
  return [...found.values()];
}

/** Positive raw-Y travel at which this transformed card ceases to contain the deck centre. */
function verticalCentreBoundary(pose: Pose, width: number, height: number) {
  const radians = (-pose.rotate * Math.PI) / 180;
  const horizontalFactor = Math.abs(Math.sin(radians));
  const verticalFactor = Math.abs(Math.cos(radians));
  const horizontalBoundary =
    horizontalFactor <= Number.EPSILON
      ? Number.POSITIVE_INFINITY
      : (width * pose.scale) / (2 * horizontalFactor);
  const verticalBoundary =
    verticalFactor <= Number.EPSILON
      ? Number.POSITIVE_INFINITY
      : (height * pose.scale) / (2 * verticalFactor);
  return Math.min(horizontalBoundary, verticalBoundary);
}

/** Largest physical pose change, with scale and rotation converted to card-corner displacement. */
function largestPoseJump(
  before: Frame,
  after: Frame,
  width: number,
  height: number,
  excludedIndices: readonly number[] = [],
): PoseJump {
  const radius = Math.hypot(width, height) / 2;
  let largest: PoseJump = {
    distance: 0,
    rotateDistance: 0,
    scaleDistance: 0,
    shellIndex: -1,
    translateDistance: 0,
  };
  for (let index = 0; index < before.poses.length; index += 1) {
    if (excludedIndices.includes(index)) continue;
    const previous = before.poses[index]!;
    const current = after.poses[index]!;
    const translateDistance = Math.hypot(
      current.translateX - previous.translateX,
      current.translateY - previous.translateY,
    );
    const scaleDistance = Math.abs(current.scale - previous.scale) * radius;
    const rotateDistance = Math.abs(current.rotate - previous.rotate) * (Math.PI / 180) * radius;
    const distance = Math.max(translateDistance, scaleDistance, rotateDistance);
    if (distance > largest.distance) {
      largest = { distance, rotateDistance, scaleDistance, shellIndex: index, translateDistance };
    }
  }
  return largest;
}

/**
 * One released Direct transaction owns one adjacent exchange, on the side its hand was on.
 *
 * The spring settling it may cross its own origin; that is the same transaction being given back
 * with momentum still in it, and it may not become an exchange with the opposite neighbour.
 */
function envelopeBreaches(frames: readonly Frame[]) {
  const breaches: string[] = [];
  let previous: { direction: number; targetIndex: number | null } | null = null;
  for (const frame of frames) {
    if (frame.phase !== "parking" && frame.phase !== "returning") {
      previous = null;
      continue;
    }
    if (previous !== null) {
      if (frame.projectionDirection !== previous.direction) {
        breaches.push(
          `frame ${frame.tick}: released direction ${previous.direction} became ${frame.projectionDirection}`,
        );
      }
      if (frame.targetIndex !== previous.targetIndex) {
        breaches.push(
          `frame ${frame.tick}: released target ${previous.targetIndex} became ${frame.targetIndex}`,
        );
      }
    }
    previous = { direction: frame.projectionDirection, targetIndex: frame.targetIndex };
  }
  return breaches;
}

/** No hand crosses the stage in one frame; 120px per frame is already a very fast flick. */
const MAX_HAND_STEP = 120;

function deck(items: readonly Screen[] = screens, activeId?: string) {
  const clock = installClock();
  const wrapper = mount(TypedStackedDeck, {
    props: {
      items,
      itemLabel: (item: Screen) => item.title,
      label: "Direct paint safety",
      exchange: "direct" as const,
      ...(activeId === undefined ? {} : { activeId }),
    },
    slots: {
      card: (card: StackedDeckCardState<Screen, string>) =>
        h("div", { class: "screen" }, card.item.title),
    },
    attachTo: document.body,
  });
  const view = wrapper.vm as unknown as {
    frame: { poses: readonly Pose[] };
    tuning: { cardWidth: number; cardHeight: number; motionPitch: number };
    diagnostics: {
      phase: string;
      pointerInteractionActive: boolean;
      pointerOwned: boolean;
    };
    physicalIndex: number;
    state: {
      interactionDirection: -1 | 0 | 1;
      interactionOriginIndex: number | null;
      traversal: {
        authoritativeIndex: number;
        direction: -1 | 0 | 1;
        localProgress: number;
        visualTopIndex: number;
      };
    };
    root: HTMLElement & { snapMotionDirectDebug?: unknown };
    settledId: string;
    next: () => boolean;
  };
  const stage = wrapper.get(".snap-motion-stacked-deck").element as HTMLElement;
  stage.setPointerCapture = () => {};
  stage.releasePointerCapture = () => {};

  const frames: Frame[] = [];
  const origins: AcceptedOrigin[] = [];
  /** A press the deck has not (yet) opened a hand-owned transaction from. */
  let pendingPress: Omit<AcceptedOrigin, "index"> | undefined;
  let tick = 0;
  let hand = 0;
  let handY = 0;
  let pointerId = 900;
  let maxLandings = 0;
  let sawAirborneCapture = false;
  let sawAirborneOrigin = false;
  let sawExposedSymmetricPile = false;
  let sawRetirementUnderInteraction = false;
  let previousLandingCount = 0;

  function capture() {
    const debug = view.root?.snapMotionDirectDebug as
      | {
          landings?: readonly { itemIndex: number; settlement: number; releaseOrder: number }[];
          projection?: {
            direction: -1 | 0 | 1;
            targetIndex: number | null;
            originIndex: number;
            signedTravel: number;
            phase?: string;
          };
        }
      | undefined;
    const projection = debug?.projection;
    const landings = (debug?.landings ?? []).map((landing) => ({ ...landing }));
    maxLandings = Math.max(maxLandings, landings.length);
    const poses = view.frame.poses.map((pose) => ({ ...pose }));
    const originIndex = projection?.originIndex ?? -1;
    const signedTravel = projection?.signedTravel ?? 0;
    const centreCovering = poses.flatMap((pose, index) =>
      contains(pose, 0, 0, view.tuning.cardWidth, view.tuning.cardHeight) ? [index] : [],
    );
    const centreOwner = centreCovering.reduce<number | null>((owner, index) => {
      if (owner === null) return index;
      const ownerLayer = poses[owner]!.layer;
      const candidateLayer = poses[index]!.layer;
      return candidateLayer > ownerLayer || (candidateLayer === ownerLayer && index > owner)
        ? index
        : owner;
    }, null);
    const modelState = view.state;
    const pointerOwned = view.diagnostics.pointerOwned;
    // A hand holding a shell its own interaction has not moved, while that shell is nowhere near
    // the deck, is a hand that took it already in the air.
    if (
      projection?.phase === "held" &&
      Math.abs(signedTravel) < 1e-6 &&
      Math.abs(poses[originIndex]?.translateX ?? 0) > 40
    ) {
      sawAirborneCapture = true;
    }
    // The same fact stated from the records rather than from the geometry: a shell an unfinished
    // release still owns, being used as the source of an exchange by whatever owns the deck now.
    if (
      projection?.phase !== undefined &&
      landings.some((landing) => landing.itemIndex === originIndex)
    ) {
      sawAirborneOrigin = true;
    }
    // A press becomes an accepted Direct origin at the frame a hand owns a shell because of it.
    // Until then it is only a press, and it may yet turn out to be one the deck refused.
    if (pendingPress !== undefined && projection?.phase === "held") {
      origins.push({ ...pendingPress, index: originIndex });
      pendingPress = undefined;
    }
    // Both exchange bodies away from the deck's centre, leaving two pile shells of equal depth
    // covering it: the arrangement whose paint order has no body over it to hide it.
    const covering = poses.filter((pose) => contains(pose, 0, 0, 680, 425));
    const frontLayer = Math.max(...covering.map((pose) => pose.layer), Number.NEGATIVE_INFINITY);
    if (frontLayer < 400 && covering.filter((pose) => pose.layer === frontLayer).length > 1) {
      sawExposedSymmetricPile = true;
    }
    // One release reaching its slot and being retired while the deck is still owned by something
    // else — another hand, or another release still in the air.
    if (landings.length < previousLandingCount && projection?.phase !== undefined) {
      sawRetirementUnderInteraction = true;
    }
    previousLandingCount = landings.length;
    frames.push({
      tick: tick++,
      poses,
      controllerPhase: view.diagnostics.phase,
      pointerId: pointerOwned ? pointerId : null,
      pointerInteractionActive: view.diagnostics.pointerInteractionActive,
      pointerOwned,
      physicalIndex:
        (modelState.interactionOriginIndex ?? modelState.traversal.visualTopIndex) +
        view.physicalIndex,
      physicalPosition: view.physicalIndex,
      traversalDirection: modelState.traversal.direction,
      interactionDirection: modelState.interactionDirection,
      localProgress: modelState.traversal.localProgress,
      authoritativeIndex: modelState.traversal.authoritativeIndex,
      visualTopIndex: modelState.traversal.visualTopIndex,
      projectionDirection: projection?.direction ?? 0,
      targetIndex: projection?.targetIndex ?? null,
      originIndex,
      signedTravel,
      phase: projection?.phase ?? "none",
      sourceX: poses[originIndex]?.translateX ?? 0,
      sourceY: poses[originIndex]?.translateY ?? 0,
      centreCoveringIds: centreCovering.map((index) => screens[index]?.id ?? `${index}`),
      centreOwnerId: centreOwner === null ? null : (screens[centreOwner]?.id ?? `${centreOwner}`),
      sourceCoversCentre: centreCovering.includes(originIndex),
      landings,
    });
  }

  capture();

  async function pressCard(index: number) {
    const debug = view.root?.snapMotionDirectDebug as
      | { landings?: readonly { itemIndex: number }[] }
      | undefined;
    pendingPress = {
      tick,
      pressedIndex: index,
      interactiveIndices: view.frame.poses.flatMap((pose, at) => (pose.interactive ? [at] : [])),
      landingIndices: (debug?.landings ?? []).map((landing) => landing.itemIndex),
    };
    pointerId += 1;
    hand = 0;
    handY = 0;
    (
      wrapper.findAll("[data-snap-motion-stacked-deck-card]")[index]!.element as HTMLElement
    ).dispatchEvent(pointerEvent("pointerdown", 0, pointerId, 0));
    await nextTick();
    return index;
  }

  return {
    frames,
    async step(count = 1) {
      for (let index = 0; index < count; index += 1) {
        await clock.step();
        capture();
      }
    },
    /** Presses whichever card the deck currently offers, which is what a hand can reach. */
    async press() {
      const index = view.frame.poses.findIndex((pose) => pose.interactive);
      if (index < 0) return -1;
      return pressCard(index);
    },
    /**
     * Presses one named card whether or not the deck is offering it.
     *
     * A finger does not consult a pose before it lands. This is the only way to ask what a press on
     * a shell the deck is not offering actually does, which is a different question from what a
     * press on the card it *is* offering does.
     */
    pressCard,
    /** The cards the deck is offering right now. */
    interactiveIndices: () =>
      view.frame.poses.flatMap((pose, index) => (pose.interactive ? [index] : [])),
    /** Every release still in the air right now, as its own record. */
    landings: () =>
      (
        (
          view.root?.snapMotionDirectDebug as
            | {
                landings?: readonly {
                  itemIndex: number;
                  settlement: number;
                  releaseOrder: number;
                }[];
              }
            | undefined
        )?.landings ?? []
      ).map((landing) => ({ ...landing })),
    settledId: () => view.settledId,
    settledIndex: () => screens.findIndex((screen) => screen.id === view.settledId),
    /** One adjacent card forward, as a command rather than a hand. */
    next: () => view.next(),
    /** Every press that has so far become a hand-owned Direct source. */
    acceptedOrigins: (): readonly AcceptedOrigin[] => origins,
    tuning: () => ({ ...view.tuning }),
    async drag(to: number) {
      while (Math.abs(to - hand) > MAX_HAND_STEP) {
        hand += Math.sign(to - hand) * MAX_HAND_STEP;
        window.dispatchEvent(pointerEvent("pointermove", hand, pointerId));
        await nextTick();
        await clock.step();
        capture();
      }
      hand = to;
      window.dispatchEvent(pointerEvent("pointermove", hand, pointerId));
      await nextTick();
      await clock.step();
      capture();
    },
    /** Drives the same owned pointer in both axes and records repeated stationary rendered frames. */
    async drag2d(toX: number, toY: number, stationaryFrames = 0) {
      while (Math.hypot(toX - hand, toY - handY) > MAX_HAND_STEP) {
        const remaining = Math.hypot(toX - hand, toY - handY);
        const fraction = MAX_HAND_STEP / remaining;
        hand += (toX - hand) * fraction;
        handY += (toY - handY) * fraction;
        window.dispatchEvent(pointerEvent("pointermove", hand, pointerId, handY));
        await nextTick();
        await clock.step();
        capture();
      }
      hand = toX;
      handY = toY;
      for (let frame = 0; frame <= stationaryFrames; frame += 1) {
        window.dispatchEvent(pointerEvent("pointermove", hand, pointerId, handY));
        await nextTick();
        await clock.step();
        capture();
      }
      return frames.at(-1)!;
    },
    async release() {
      window.dispatchEvent(pointerEvent("pointerup", hand, pointerId, handY));
      await nextTick();
    },
    /** The other way a pointer sequence can end: the browser taking it away. */
    async cancel() {
      window.dispatchEvent(pointerEvent("pointercancel", hand, pointerId, handY));
      await nextTick();
    },
    finish() {
      const tuning = view.tuning;
      const settledId = view.settledId;
      wrapper.unmount();
      clock.restore();
      return {
        frames,
        origins,
        settledId,
        maxLandings,
        sawAirborneCapture,
        sawAirborneOrigin,
        sawExposedSymmetricPile,
        sawRetirementUnderInteraction,
        breaches: envelopeBreaches(frames),
        premise: premiseBreaches(origins),
        violations: paintViolations(frames, tuning.cardWidth, tuning.cardHeight),
      };
    },
  };
}

type Result = ReturnType<ReturnType<typeof deck>["finish"]>;

/**
 * Everything a run of rendered frames has to be able to say for itself, as the empty list it is
 * when the deck was physical the whole way through.
 *
 * The origin premise is checked here rather than in one dedicated scenario, because it is what
 * makes the accepted depth handoff correct in every one of them: an exchange measured from a shell
 * that is not covering the pile is the defect, whatever gesture produced it.
 */
function complaints(result: Result): string[] {
  return [
    ...result.violations.map(
      (violation) =>
        `frame ${violation.fromTick}->${violation.toTick}: card ${violation.before} gave ${violation.points} sampled points to card ${violation.after} after ${violation.shift.toFixed(2)}px of motion`,
    ),
    ...result.breaches,
    ...result.premise,
    ...(result.sawExposedSymmetricPile
      ? ["an exposed pile left its front material to equal-layer DOM order"]
      : []),
  ];
}

/** Browser paint order, including the DOM fallback that equal layers would otherwise conceal. */
function relativePaintOrder(poses: readonly Pose[], first: number, second: number): -1 | 1 {
  const layerDifference = poses[first]!.layer - poses[second]!.layer;
  if (layerDifference !== 0) return layerDifference > 0 ? 1 : -1;
  return first > second ? 1 : -1;
}

function firstViolationReport(
  frames: readonly Frame[],
  violations: readonly Violation[],
  width: number,
  height: number,
) {
  const violation = violations[0];
  if (violation === undefined) return "no physical paint violation";
  const currentAt = frames.findIndex((frame) => frame.tick === violation.toTick);
  const previous = frames[currentAt - 1]!;
  const current = frames[currentAt]!;
  const changed = {
    after: relativePaintOrder(current.poses, violation.before, violation.after),
    before: relativePaintOrder(previous.poses, violation.before, violation.after),
    first: violation.before,
    second: violation.after,
  };
  const pair = [changed.first, changed.second] as const;
  const containsPair = (frame: Frame) =>
    pair.every((index) => contains(frame.poses[index]!, violation.x, violation.y, width, height));
  const coveredByHigherBody = (frame: Frame) =>
    frame.poses.some(
      (pose, index) =>
        !pair.includes(index) &&
        contains(pose, violation.x, violation.y, width, height) &&
        relativePaintOrder(frame.poses, index, pair[0]) > 0 &&
        relativePaintOrder(frame.poses, index, pair[1]) > 0,
    );
  const telemetry = frames
    .slice(Math.max(0, currentAt - 2), Math.min(frames.length, currentAt + 3))
    .map((frame) => ({
      authoritativeIndex: frame.authoritativeIndex,
      centreCoveringIds: frame.centreCoveringIds,
      centreOwnerId: frame.centreOwnerId,
      controllerPhase: frame.controllerPhase,
      interactionDirection: frame.interactionDirection,
      localProgress: frame.localProgress,
      phase: frame.phase,
      physicalIndex: frame.physicalIndex,
      physicalPosition: frame.physicalPosition,
      pointerId: frame.pointerId,
      pointerInteractionActive: frame.pointerInteractionActive,
      pointerOwned: frame.pointerOwned,
      projectionDirection: frame.projectionDirection,
      sourceCoversCentre: frame.sourceCoversCentre,
      sourceX: frame.sourceX,
      sourceY: frame.sourceY,
      shells: frame.poses.map((pose, index) => ({ id: screens[index]?.id ?? `${index}`, ...pose })),
      signedTravel: frame.signedTravel,
      targetIndex: frame.targetIndex,
      tick: frame.tick,
      traversalDirection: frame.traversalDirection,
      visualTopIndex: frame.visualTopIndex,
    }));
  return JSON.stringify(
    {
      firstViolation: {
        ...violation,
        afterId: screens[violation.after]?.id,
        beforeId: screens[violation.before]?.id,
        firstRelativePaintOrderChange: {
          ...changed,
          firstId: screens[changed.first]?.id,
          secondId: screens[changed.second]?.id,
        },
        higherBodyOccludedAfter: coveredByHigherBody(current),
        higherBodyOccludedBefore: coveredByHigherBody(previous),
        overlapAfter: containsPair(current),
        overlapBefore: containsPair(previous),
      },
      frames: telemetry,
    },
    null,
    2,
  );
}

function continuityReport(
  boundary: number,
  probes: readonly ContinuityProbe[],
  frames: readonly Frame[],
  violations: readonly Violation[],
) {
  const frameRecord = (frame: Frame) => ({
    centreOwnerId: frame.centreOwnerId,
    interactionDirection: frame.interactionDirection,
    landings: frame.landings,
    phase: frame.phase,
    pointerId: frame.pointerId,
    pointerOwned: frame.pointerOwned,
    projectionDirection: frame.projectionDirection,
    shells: frame.poses.map((pose, index) => ({ id: screens[index]?.id ?? `${index}`, ...pose })),
    signedTravel: frame.signedTravel,
    sourceX: frame.sourceX,
    sourceY: frame.sourceY,
    targetIndex: frame.targetIndex,
    tick: frame.tick,
  });
  return JSON.stringify(
    {
      boundary,
      firstPaintViolation: violations[0],
      firstPaintViolationFrames:
        violations[0] === undefined
          ? []
          : frames
              .filter(
                (frame) =>
                  frame.tick >= violations[0]!.fromTick - 1 &&
                  frame.tick <= violations[0]!.toTick + 1,
              )
              .map(frameRecord),
      probes: probes.map((probe) => ({
        after: frameRecord(probe.after),
        before: frameRecord(probe.before),
        epsilon: probe.epsilon,
        jump: {
          ...probe.jump,
          shellId:
            probe.jump.shellIndex < 0
              ? null
              : (screens[probe.jump.shellIndex]?.id ?? `${probe.jump.shellIndex}`),
        },
        kind: probe.kind,
        pointerDelta: probe.pointerDelta,
      })),
      retirementFrames: frames.slice(-4).map(frameRecord),
    },
    null,
    2,
  );
}

/** One gesture: press whatever the deck offers, follow a hand path, let go, let it settle. */
async function gesture(path: readonly number[], settleFrames: number) {
  const surface = deck();
  await surface.press();
  await surface.step();
  for (const to of path) await surface.drag(to);
  await surface.release();
  await surface.step(settleFrames);
  return surface.finish();
}

describe("StackedDeck Direct rendered material", () => {
  it("keeps every non-held rendered pose invariant across raw Y", async () => {
    const surface = deck(screens, "d");
    expect(surface.settledId(), "the raw-Y proof did not start on team").toBe("d");
    expect(await surface.press(), "the team shell was not interactive").toBe(3);
    await surface.step();

    const tuning = surface.tuning();
    const held = surface.frames.at(-1)!;
    const boundary = verticalCentreBoundary(held.poses[3]!, tuning.cardWidth, tuning.cardHeight);
    const travel = -0.3;
    const pointerX = -travel * tuning.motionPitch;
    const epsilon = 0.001;
    const rawYValues = [
      0,
      epsilon,
      -epsilon,
      1,
      -1,
      tuning.cardHeight / 8,
      -tuning.cardHeight / 8,
      tuning.cardHeight / 4,
      -tuning.cardHeight / 4,
      boundary - epsilon,
      -(boundary - epsilon),
      boundary + epsilon,
      -(boundary + epsilon),
      tuning.cardHeight * 2,
      -tuning.cardHeight * 2,
    ];
    let baseline: ReturnType<typeof nonHeldRenderedPoseState> | undefined;

    for (const translateY of rawYValues) {
      const frame = await surface.drag2d(pointerX, translateY, 2);
      expect(frame.sourceX, `held source X at raw Y ${translateY}`).toBeCloseTo(pointerX, 8);
      expect(frame.sourceY, `held source Y at raw Y ${translateY}`).toBeCloseTo(translateY, 8);
      expect(frame.signedTravel, `scalar travel at raw Y ${translateY}`).toBeCloseTo(travel, 8);
      expect(frame).toMatchObject({
        controllerPhase: "dragging",
        phase: "held",
        pointerInteractionActive: true,
        pointerOwned: true,
        projectionDirection: -1,
        targetIndex: 2,
      });
      const nonHeld = nonHeldRenderedPoseState(frame, 3);
      baseline ??= nonHeld;
      expect(nonHeld, `raw Y ${translateY} changed a non-held rendered pose`).toEqual(baseline);
    }

    await surface.cancel();
    await surface.step(60);
    const result = surface.finish();
    expect(result.settledId, "pointercancel changed the semantic card").toBe("d");
    expect(complaints(result)).toEqual([]);
  }, 120_000);

  it("keeps a vertically exposed held deck continuous when its target landing retires", async () => {
    // Throw map into the team pile, then immediately take team and reverse toward that still-airborne
    // map shell. The same pointer remains stationary while map reaches its exact slot and its record
    // is retired on the following RAF.
    const surface = deck(screens, "c");
    expect(await surface.press(), "map was not the initial source").toBe(2);
    await surface.step();
    await surface.drag(-560);
    await surface.release();
    await surface.step(2);
    expect(await surface.press(), "team did not take over the release").toBe(3);
    await surface.step();
    expect(
      surface.landings().some((landing) => landing.itemIndex === 2),
      "map was not an unfinished landing",
    ).toBe(true);

    const tuning = surface.tuning();
    const held = surface.frames.at(-1)!;
    const boundary = verticalCentreBoundary(held.poses[3]!, tuning.cardWidth, tuning.cardHeight);
    const travel = -0.3;
    await surface.drag2d(-travel * tuning.motionPitch, boundary + 24, 3);
    const seamStart = surface.frames.length - 1;
    for (
      let frame = 0;
      frame < 32 && surface.landings().some((landing) => landing.itemIndex === 2);
      frame += 1
    ) {
      await surface.step();
    }

    const seamFrames = surface.frames.slice(seamStart);
    const retirementAt = seamFrames.findIndex(
      (frame, index) =>
        index > 0 &&
        seamFrames[index - 1]!.landings.some((landing) => landing.itemIndex === 2) &&
        !frame.landings.some((landing) => landing.itemIndex === 2),
    );
    expect(
      retirementAt,
      "the target landing never retired under the held interaction",
    ).toBeGreaterThan(0);
    const before = seamFrames[retirementAt - 1]!;
    const after = seamFrames[retirementAt]!;
    const jump = largestPoseJump(before, after, tuning.cardWidth, tuning.cardHeight);
    const probe: ContinuityProbe = {
      after,
      before,
      epsilon: 0,
      jump,
      kind: "landing-retirement",
      pointerDelta: 0,
    };
    const violations = paintViolations(seamFrames, tuning.cardWidth, tuning.cardHeight);
    const diagnostic = continuityReport(boundary, [probe], seamFrames, violations);
    await surface.cancel();
    surface.finish();

    expect(before.landings.find((landing) => landing.itemIndex === 2)?.settlement).toBe(1);
    expect(before.phase).toBe("held");
    expect(after.phase).toBe("held");
    expect(before.targetIndex).toBe(2);
    expect(after.targetIndex).toBe(2);
    expect(before.pointerId).toBe(after.pointerId);
    expect(before.pointerOwned && after.pointerOwned).toBe(true);
    expect(before.sourceX).toBeCloseTo(after.sourceX, 8);
    expect(before.sourceY).toBeCloseTo(after.sourceY, 8);
    if (jump.distance > 0.05 || violations.length > 0) throw new Error(diagnostic);
    expect(jump.distance).toBeLessThanOrEqual(0.05);
    expect(violations).toEqual([]);
  }, 120_000);

  it("keeps an exposed held two-axis reversal physically continuous", async () => {
    const surface = deck(screens, "d");
    expect(surface.settledId(), "the regression did not start on team").toBe("d");
    expect(await surface.press(), "the team shell was not interactive").toBe(3);
    await surface.step();
    const heldStart = surface.frames.length;

    const tuning = surface.tuning();
    const verticalClearance = tuning.cardHeight / 2 + Math.max(32, tuning.cardHeight * 0.12);
    await surface.drag2d(0, verticalClearance, 2);
    const path = [
      0.7, 0.6, 0.56, 0.54, 0.5, 0.2, 0.05, 0.02, 0.005, 0, -0.005, -0.02, -0.05, -0.2, -0.5, -0.54,
      -0.56, -0.6, -0.7,
    ] as const;
    const reversePath = path.map((_travel, index) => path[path.length - 1 - index]!);
    const requested = [...path, ...reversePath];
    const sampled: { frame: Frame; travel: number }[] = [];
    for (const travel of requested) {
      sampled.push({
        frame: await surface.drag2d(-travel * tuning.motionPitch, verticalClearance, 2),
        travel,
      });
    }

    const heldFrames = surface.frames.slice(heldStart);
    expect(
      heldFrames.some((frame) => frame.phase === "held"),
      "Direct never became held",
    ).toBe(true);
    expect(
      heldFrames.every(
        (frame) =>
          frame.phase === "held" &&
          frame.controllerPhase === "dragging" &&
          frame.pointerOwned &&
          frame.pointerInteractionActive,
      ),
      "the crossing left uninterrupted held pointer ownership",
    ).toBe(true);
    expect(
      [...new Set(heldFrames.map((frame) => frame.pointerId))],
      "more than one pointer owned the crossing",
    ).toEqual([heldFrames[0]!.pointerId]);
    expect(heldFrames[0]!.pointerId, "the crossing had no pointer owner").not.toBeNull();
    expect(
      surface.acceptedOrigins(),
      "the gesture opened more than one Direct origin",
    ).toHaveLength(1);
    expect(surface.acceptedOrigins()[0]!.index, "the held origin was not team").toBe(3);

    for (const { frame, travel } of sampled) {
      expect(frame.sourceX, `team X at ${travel}`).toBeCloseTo(-travel * tuning.motionPitch, 5);
      expect(frame.sourceY, `team Y at ${travel}`).toBeCloseTo(verticalClearance, 5);
      expect(frame.physicalPosition, `physical travel at ${travel}`).toBeCloseTo(travel, 5);
      expect(frame.signedTravel, `projection travel at ${travel}`).toBeCloseTo(travel, 5);
      expect(frame.sourceCoversCentre, `team covered the centre at ${travel}`).toBe(false);
    }
    const modelDirections = new Set(heldFrames.map((frame) => frame.interactionDirection));
    expect(
      modelDirections.has(-1) && modelDirections.has(1),
      "model direction did not visit both signs",
    ).toBe(true);
    const projectionDirections = new Set(heldFrames.map((frame) => frame.projectionDirection));
    expect(
      projectionDirections.has(-1) && projectionDirections.has(1),
      "projection direction did not visit both signs",
    ).toBe(true);
    const targetIndices = new Set(heldFrames.map((frame) => frame.targetIndex));
    expect(
      targetIndices.has(2) && targetIndices.has(4),
      "Direct target did not visit settings and map",
    ).toBe(true);
    expect(
      heldFrames.every((frame) => frame.landings.length === 0),
      "a held reversal opened a landing lifecycle",
    ).toBe(true);

    const violations = paintViolations(heldFrames, tuning.cardWidth, tuning.cardHeight);
    const diagnostic = firstViolationReport(
      heldFrames,
      violations,
      tuning.cardWidth,
      tuning.cardHeight,
    );
    await surface.cancel();
    const result = surface.finish();
    expect(result.settledId, "pointercancel changed the semantic card").toBe("d");
    if (violations.length > 0) throw new Error(diagnostic);
    expect(violations).toEqual([]);
  }, 120_000);

  /**
   * The recorded defect, exactly.
   *
   * A hand pulls one way, changes its mind and draws back, and lets go with the deck a third of a
   * card off its origin. The release resolved the other way, so the deck's own mass travelled back
   * across the origin — and on the two frames either side of that crossing the two shells beside the
   * deck's centre, 68px apart on a 680px card, completely exchanged paint order after under 3px of
   * motion, with the card that had been thrown too far off to hide either of them.
   */
  it("keeps a released transaction on the side its hand let go on", async () => {
    const result = await gesture([400, 200], 12);
    expect(complaints(result), "recorded reversal-flick release").toEqual([]);
    // Its own side or its own origin, and this one gave the exchange back.
    expect(result.settledId).toBe("c");
  }, 60_000);

  it("holds every reversal-flick release to one physical answer", async () => {
    for (const out of [200, 300, 400, 511, 600, 700]) {
      for (const fraction of [0, 0.2, 0.35, 0.5, 0.65, 0.8]) {
        const result = await gesture([out, Math.round(out * fraction)], 10);
        expect(complaints(result), `hand out ${out}`).toEqual([]);
        const result2 = await gesture([-out, Math.round(-out * fraction)], 10);
        expect(complaints(result2), `hand out ${-out}`).toEqual([]);
      }
    }
  }, 300_000);

  it("carries a slow Direct exchange with no landings at all", async () => {
    for (const path of [[120], [300], [560], [-120], [-300], [-560]]) {
      const result = await gesture(path, 24);
      expect(complaints(result), `slow exchange to ${path[0]}`).toEqual([]);
      expect(result.maxLandings).toBe(0);
    }
  }, 120_000);

  it("holds the cyclic seam to the same answer as an interior exchange", async () => {
    // Four exchanges the same way walk the deck's own fold past the hand.
    const surface = deck();
    for (let index = 0; index < 4; index += 1) {
      await surface.press();
      await surface.step();
      await surface.drag(-560);
      await surface.release();
      await surface.step(20);
    }
    expect(complaints(surface.finish()), "cyclic fold").toEqual([]);
  }, 120_000);

  it("keeps one interrupted release physical while a new hand owns the deck", async () => {
    const surface = deck();
    await surface.press();
    await surface.step();
    await surface.drag(-420);
    await surface.release();
    await surface.step(2);
    await surface.press();
    await surface.step();
    await surface.drag(360);
    await surface.release();
    await surface.step(24);
    const result = surface.finish();
    expect(complaints(result), "one landing under a new hand").toEqual([]);
    expect(result.maxLandings).toBeGreaterThanOrEqual(1);
  }, 120_000);

  it("keeps two and three concurrent releases physical", async () => {
    for (const [settle, expected] of [
      [1, 3],
      [2, 2],
    ] as const) {
      const surface = deck();
      for (let index = 0; index < 6; index += 1) {
        await surface.press();
        await surface.step();
        await surface.drag(-560);
        await surface.release();
        // Short enough that earlier releases are still in the air when the next hand presses.
        await surface.step(settle);
      }
      // Long enough that each one reaches its slot and is retired while the deck still moves.
      await surface.step(40);
      const result = surface.finish();
      expect(complaints(result), `${expected} concurrent releases`).toEqual([]);
      expect(result.maxLandings).toBeGreaterThanOrEqual(expected);
      expect(
        result.sawRetirementUnderInteraction,
        "no landing retired while the deck was still owned",
      ).toBe(true);
    }
  }, 180_000);

  /**
   * The recorded airborne-capture defect, at the gesture that produced it.
   *
   * A subordinate pile shell takes the exchange's depth on the first frame the exchange has any
   * geometry at all. What makes that invisible is the shell being lifted: at that frame it is still
   * over the deck, covering the whole pile, and a depth change under an opaque body is not a change.
   *
   * A hand that catches a shell already in the air never lifts anything off this deck. Its
   * interaction-local zero was a frame where the deck's own top was hundreds of pixels away and the
   * pile uncovered, so the same write landed in the open — two shells beside the deck's centre
   * exchanging paint order after under 3px of motion. The premise the accepted kernel needs was
   * simply false there, and no choreography over the top of it could make it true.
   *
   * So the state is gone rather than decorated: a release still in the air is a presentation until
   * it arrives, and this gesture — four rapid throws, each pressing one frame after the last let
   * go — now produces no capture, no origin-less transaction, and no unearned pixel.
   */
  it("never lets a hand catch a shell in mid-air", async () => {
    const surface = deck();
    for (const to of [-420, 380, -340, 300]) {
      await surface.press();
      await surface.step();
      await surface.drag(to);
      await surface.release();
      await surface.step(1);
    }
    await surface.step(40);
    const result = surface.finish();
    // The scenario still reaches the state it exists to test: shells were genuinely in the air
    // when the next hands pressed.
    expect(result.maxLandings, "no release was ever in the air").toBeGreaterThanOrEqual(1);
    expect(result.sawAirborneOrigin, "a landing shell was used as an exchange source").toBe(false);
    expect(result.sawAirborneCapture, "a shell was caught in the air").toBe(false);
    expect(complaints(result), "rapid chained throws").toEqual([]);
  }, 120_000);

  /**
   * A shell still finishing its release stays a release.
   *
   * The hand here goes down on that exact shell — the deck is drawing it hundreds of pixels off
   * centre, so a finger can reach it — and then drags a full card's worth. Nothing about that may
   * turn it into a source: it is not offered, so the press opens nothing, and its own landing keeps
   * the clock and the path it already had. The deck it is falling into is untouched.
   */
  it("refuses a pointer that goes down on a shell still in the air", async () => {
    const surface = deck();
    // Two throws in quick succession, so the first is handed to its own clock and is genuinely a
    // record of a release in the air rather than the exchange the deck is currently performing.
    for (let throwIndex = 0; throwIndex < 2; throwIndex += 1) {
      await surface.press();
      await surface.step();
      await surface.drag(-560);
      await surface.release();
      await surface.step(1);
    }
    const airborne = surface.landings();
    expect(airborne, "no release was in the air to press").not.toHaveLength(0);
    const shell = airborne[0]!;
    expect(surface.interactiveIndices(), "the airborne shell was offered").not.toContain(
      shell.itemIndex,
    );
    const acceptedBefore = surface.acceptedOrigins().length;
    const framesBefore = surface.frames.length;

    await surface.pressCard(shell.itemIndex);
    await surface.step();
    await surface.drag(100);
    await surface.release();
    await surface.step(1);

    // Still travelling, on its own clock, from its own release — neither cancelled nor held.
    const stillFlying = surface.landings().find((landing) => landing.itemIndex === shell.itemIndex);
    expect(stillFlying, "the landing was cancelled by the press").toBeDefined();
    expect(stillFlying!.releaseOrder, "the landing was re-released").toBe(shell.releaseOrder);
    expect(stillFlying!.settlement, "the landing was frozen").toBeGreaterThan(shell.settlement);
    // No hand ever took hold of anything, so no transaction opened.
    expect(surface.acceptedOrigins(), "the press opened a transaction").toHaveLength(
      acceptedBefore,
    );
    expect(
      surface.frames.slice(framesBefore).every((frame) => frame.phase !== "held"),
      "a hand owned a shell it had pressed in mid-air",
    ).toBe(true);

    await surface.step(40);
    const result = surface.finish();
    expect(result.sawAirborneOrigin, "a landing shell was used as an exchange source").toBe(false);
    expect(result.sawAirborneCapture, "a shell was caught in the air").toBe(false);
    expect(complaints(result), "press on an airborne shell").toEqual([]);
  }, 120_000);

  /**
   * The same invariant where there is no pose for a hand to consult.
   *
   * A reversal can commit the deck back to the very shell it threw, so the card the model names is
   * still hundreds of pixels away with its own release carrying it home. A keyboard or programmatic
   * exchange measured from there would hand depth between bodies that are not where the kernel
   * assumes — the pointer path refuses it because nothing is offered, and this path has to refuse it
   * for the same physical reason.
   *
   * It is availability, not a timer: the frame that release arrives, the same command is accepted.
   */
  it("refuses a command whose source is still a release in the air", async () => {
    const surface = deck();
    // Throw one shell, then reverse the next hand back onto it so the deck commits to it again.
    await surface.press();
    await surface.step();
    await surface.drag(-560);
    await surface.release();
    await surface.step(2);
    await surface.press();
    await surface.step();
    await surface.drag(560);
    await surface.release();
    await surface.step(1);

    const settled = surface.settledIndex();
    expect(
      surface.landings().map((landing) => landing.itemIndex),
      "the deck did not commit back to the shell it threw",
    ).toContain(settled);
    expect(surface.next(), "a command exchanged a deck the shell had not reached").toBe(false);
    await surface.step(2);
    expect(surface.settledIndex(), "the refused command moved the deck").toBe(settled);

    // Arrived. Nothing was queued, and the very same command is now an ordinary exchange.
    await surface.step(20);
    expect(surface.landings(), "the release never arrived").toHaveLength(0);
    expect(surface.next(), "an arrived shell was still refused").toBe(true);
    await surface.step(30);
    expect(complaints(surface.finish()), "command after an airborne source").toEqual([]);
  }, 120_000);

  /**
   * A press the deck refused has nothing to take back.
   *
   * Cancellation is how a gesture undoes itself, and a gesture that never took the deck did not do
   * anything to undo. Letting the browser take a refused press away must therefore leave the
   * exchange already in flight exactly where it was going — it was never that press's to abort.
   */
  it("lets a refused press be cancelled without aborting the exchange in flight", async () => {
    const surface = deck();
    await surface.press();
    await surface.step();
    await surface.drag(-560);
    await surface.release();
    await surface.step(2);

    // A pile shell, pressed while the committed exchange is still settling, then taken away.
    const offered = surface.interactiveIndices();
    const pile = [0, 1, 2, 3, 4].find((index) => !offered.includes(index))!;
    await surface.pressCard(pile);
    await surface.step();
    await surface.drag(-300);
    await surface.cancel();
    await surface.step(40);

    const result = surface.finish();
    // Only the first hand ever opened anything, and this press was not it.
    expect(
      result.origins.map((origin) => origin.pressedIndex),
      "the refused press opened a transaction",
    ).not.toContain(pile);
    expect(result.origins, "more than the one real hand opened a transaction").toHaveLength(1);
    // The exchange the first hand committed to still arrived.
    expect(result.settledId, "the cancelled press took the exchange back").toBe("d");
    expect(complaints(result), "cancelled refused press").toEqual([]);
  }, 120_000);

  /**
   * The same pointer gesture, on a card the deck is not offering.
   *
   * A pile shell at rest is visible and has a box a finger can land in, but it is not a card this
   * deck is offering, and the exchange the Direct kernel performs has no meaning measured from it.
   * Forwarding that press anyway would open a transaction whose origin is only wherever the
   * controller happened to be resting — the same gesture getting a different release model for
   * having landed a few pixels off the top card.
   */
  it("refuses a pointer that goes down on a pile shell the deck is not offering", async () => {
    const surface = deck();
    const offered = surface.interactiveIndices();
    expect(offered, "the resting deck offers exactly one card").toHaveLength(1);
    const pile = [0, 1, 2, 3, 4].find((index) => index !== offered[0])!;
    const settledBefore = surface.settledId();

    await surface.pressCard(pile);
    await surface.step();
    await surface.drag(-520);
    await surface.release();
    await surface.step(24);

    const result = surface.finish();
    expect(result.origins, "a press the deck does not offer opened a transaction").toEqual([]);
    expect(
      result.frames.every((frame) => frame.phase === "none"),
      "the deck was held by a press it had refused",
    ).toBe(true);
    expect(result.settledId, "the deck moved").toBe(settledBefore);
    expect(complaints(result), "press on a pile shell").toEqual([]);
  }, 120_000);
});
