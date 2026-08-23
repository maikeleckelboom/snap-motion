import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { h, nextTick } from "vue";

import StackedDeck from "../src/stacked-deck/components/StackedDeck.vue";
import type { StackedDeckCardState } from "../src/stacked-deck/stacked-deck-contracts";

/**
 * A Direct gesture that resolves back to the card it began on.
 *
 * There are exactly two ways a Direct pointer sequence ends. One releases the shell it was holding
 * into the deck and the deck keeps the neighbour; the other gives the deck back exactly as it was
 * found. Only the first is a release, and only a release owns the tuck a released shell performs on
 * its own clock. The second never let go of anything: it is the exchange the hand had already
 * opened, running backwards to the rest it started from.
 *
 * So the claim here is about *one movement*. The controller owns a spring that carries the deck's
 * scalar back to interaction-local zero, and every physical value the exchange is showing — the
 * held shell's two-axis vector, the neighbour's reveal, the pile behind it — has to be a function
 * of that one return. A second clock running beside it is the defect, whatever it looks like.
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
  readonly visible: boolean;
  readonly interactive: boolean;
  readonly role: string;
}

interface Projection {
  readonly phase?: string;
  readonly settlement: number;
  readonly signedTravel: number;
  readonly direction: -1 | 0 | 1;
  readonly targetIndex: number | null;
  readonly originIndex: number;
  readonly translateX: number;
  readonly translateY: number;
}

interface Frame {
  readonly tick: number;
  readonly phase: string;
  readonly settlement: number;
  readonly signedTravel: number;
  readonly direction: -1 | 0 | 1;
  readonly targetIndex: number | null;
  readonly landings: number;
  readonly poses: readonly Pose[];
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

function pointerEvent(type: string, clientX: number, clientY: number) {
  return new PointerEvent(type, {
    bubbles: true,
    buttons: type === "pointerdown" || type === "pointermove" ? 1 : 0,
    cancelable: true,
    clientX,
    clientY,
    isPrimary: true,
    pointerId: 401,
    pointerType: "mouse",
  });
}

/**
 * Exact comparison apart from the sign of zero, which no transform can express, and the last bits
 * a pitch multiplication leaves behind — a hand reaching a travel and a spring reaching the same
 * travel arrive at it by different arithmetic, and nothing renders differently for it.
 */
function exact(value: number) {
  return Number(value.toFixed(9)) || 0;
}

/** Geometry alone: what the eye reads, with none of the ordering a paint-order check owns. */
function geometry(poses: readonly Pose[]) {
  return poses.map(({ opacity, rotate, scale, translateX, translateY }) => ({
    opacity: exact(opacity),
    rotate: exact(rotate),
    scale: exact(scale),
    translateX: exact(translateX),
    translateY: exact(translateY),
  }));
}

function deck() {
  const clock = installClock();
  const wrapper = mount(TypedStackedDeck, {
    props: {
      items: screens,
      itemLabel: (item: Screen) => item.title,
      label: "Direct origin return",
      exchange: "direct" as const,
    },
    slots: {
      card: (card: StackedDeckCardState<Screen, string>) =>
        h("div", { class: "screen" }, card.item.title),
    },
    attachTo: document.body,
  });
  const view = wrapper.vm as unknown as {
    frame: { poses: readonly Pose[] };
    physicalIndex: number;
    pitch: number;
    settledId: string;
    root: HTMLElement & { snapMotionDirectDebug?: { landings?: readonly unknown[] } };
  };
  const stage = wrapper.get(".snap-motion-stacked-deck").element as HTMLElement;
  stage.setPointerCapture = () => {};
  stage.releasePointerCapture = () => {};

  const pitch = view.pitch;
  const restPoses = view.frame.poses.map((pose) => ({ ...pose }));
  // A browser reports a hand back on the press point as that coordinate, never as its negative
  // zero; only multiplying a requested physical index by a pitch can produce one.
  const handXFor = (physical: number) => (physical === 0 ? 0 : -physical * pitch);

  const frames: Frame[] = [];
  let tick = 0;

  function projection(): Projection | undefined {
    return (view.root?.snapMotionDirectDebug as { projection?: Projection } | undefined)
      ?.projection;
  }
  function landingCount(): number {
    return (view.root?.snapMotionDirectDebug?.landings ?? []).length;
  }
  function capture() {
    const live = projection();
    frames.push({
      tick: tick++,
      phase: live?.phase ?? "none",
      settlement: live?.settlement ?? 0,
      signedTravel: live?.signedTravel ?? 0,
      direction: live?.direction ?? 0,
      targetIndex: live?.targetIndex ?? null,
      landings: landingCount(),
      poses: view.frame.poses.map((pose) => ({ ...pose })),
    });
  }

  capture();

  return {
    frames,
    pitch,
    restPoses,
    projection,
    view,
    async step(count = 1) {
      for (let index = 0; index < count; index += 1) {
        await clock.step();
        capture();
      }
    },
    /** Presses whichever card the deck is offering, which is what a hand can reach. */
    async press() {
      const index = view.frame.poses.findIndex((pose) => pose.interactive);
      expect(index, "the deck offered no card to press").toBeGreaterThanOrEqual(0);
      (
        wrapper.findAll("[data-snap-motion-stacked-deck-card]")[index]!.element as HTMLElement
      ).dispatchEvent(pointerEvent("pointerdown", 0, 0));
      await nextTick();
      return index;
    },
    /** Moves the hand to an exact interaction-local physical index, one rendered frame per step. */
    async hold(physical: number, verticalHand = 0) {
      window.dispatchEvent(pointerEvent("pointermove", handXFor(physical), verticalHand));
      await nextTick();
      await clock.step();
      capture();
    },
    /**
     * Keeps the hand exactly where it is for a few frames, which is what makes the release slow.
     * A hand that stops before it lets go releases with no velocity to carry.
     */
    async settleHand(physical: number, verticalHand = 0, frameCount = 10) {
      for (let index = 0; index < frameCount; index += 1) {
        await this.hold(physical, verticalHand);
      }
    },
    async release(physical: number, verticalHand = 0) {
      window.dispatchEvent(pointerEvent("pointerup", handXFor(physical), verticalHand));
      await nextTick();
    },
    settledId: () => view.settledId,
    finish() {
      const settledId = view.settledId;
      const poses = view.frame.poses.map((pose) => ({ ...pose }));
      wrapper.unmount();
      clock.restore();
      return { frames, settledId, finalPoses: poses, restPoses, pitch };
    },
  };
}

/** One held Direct frame at an exact physical index, for comparing a return against a drag. */
async function heldFrameAt(physical: number) {
  const surface = deck();
  await surface.press();
  await surface.step();
  await surface.hold(physical);
  const poses = surface.view.frame.poses.map((pose) => ({ ...pose }));
  const travel = surface.projection()?.signedTravel ?? 0;
  surface.finish();
  return { geometry: geometry(poses), travel };
}

/** Drives one gesture out to `physical`, stops the hand, and lets go. */
async function originReturn(physical: number, verticalHand = 0, viaReversal = false) {
  const surface = deck();
  await surface.press();
  await surface.step();
  if (viaReversal) {
    // Out past where it ends up and then partly back, so the release resolves the origin from a
    // hand that has already changed its mind once.
    for (const at of [physical * 1.6, physical * 1.3, physical])
      await surface.hold(at, verticalHand);
  } else {
    for (const at of [physical / 3, (physical * 2) / 3, physical]) {
      await surface.hold(at, verticalHand);
    }
  }
  await surface.settleHand(physical, verticalHand);
  const atRelease = {
    poses: surface.view.frame.poses.map((pose) => ({ ...pose })),
    projection: { ...surface.projection()! },
  };
  const releaseFrame = surface.frames.length;
  await surface.release(physical, verticalHand);
  // Long enough for any settlement, independent or otherwise, to have finished.
  await surface.step(60);
  return { ...surface.finish(), atRelease, releaseFrame };
}

type Return = Awaited<ReturnType<typeof originReturn>>;

/** Everything a return has to be able to say for itself, as the empty list it is when it holds. */
function complaints(result: Return, label: string): string[] {
  const found: string[] = [];
  const after = result.frames.slice(result.releaseFrame);
  const releaseTravel = result.atRelease.projection.signedTravel;
  const releaseX = result.atRelease.projection.translateX;
  const releaseY = result.atRelease.projection.translateY;
  const direction = result.atRelease.projection.direction;
  const releaseDistance = Math.min(Math.max(releaseTravel * direction, 0), 1);

  let previousSource = Number.POSITIVE_INFINITY;
  let previousDistance = Number.POSITIVE_INFINITY;
  for (const frame of after) {
    if (frame.phase === "parking") {
      found.push(`${label} frame ${frame.tick}: released into the deck as a parking exchange`);
    }
    if (frame.landings > 0) {
      found.push(`${label} frame ${frame.tick}: a return created ${frame.landings} landing(s)`);
    }
    // The shell the hand was holding only ever comes home. The rest of the picture is asserted by
    // retracing the held path instead, because the ring's own fold shell crosses behind the deck
    // and is meant to pass back through that crossing exactly as the hand drew it going out.
    const source = frame.poses[result.atRelease.projection.originIndex]!;
    const fromRest = Math.hypot(source.translateX, source.translateY);
    if (fromRest > previousSource + 1e-6) {
      found.push(
        `${label} frame ${frame.tick}: the held shell moved back away from rest, ${previousSource.toFixed(3)} -> ${fromRest.toFixed(3)}`,
      );
    }
    previousSource = fromRest;

    const distance = Math.min(Math.max(frame.signedTravel * direction, 0), 1);
    if (distance > previousDistance + 1e-9) {
      found.push(
        `${label} frame ${frame.tick}: travel grew again, ${previousDistance.toFixed(6)} -> ${distance.toFixed(6)}`,
      );
    }
    previousDistance = distance;

    // One movement. Whatever the controller has left of its own return is exactly what the held
    // frame has left of its hand vector — in both axes, from the exact pointer-up vector.
    if (frame.phase === "none") continue;
    const remaining = releaseDistance <= 0 ? 0 : distance / releaseDistance;
    const toleranceX = Math.max(1e-6, Math.abs(releaseX) * 1e-6);
    const toleranceY = Math.max(1e-6, Math.abs(releaseY) * 1e-6);
    if (Math.abs(source.translateX - releaseX * remaining) > toleranceX) {
      found.push(
        `${label} frame ${frame.tick}: source x ${source.translateX.toFixed(3)} is not ${(releaseX * remaining).toFixed(3)}, which is what ${(remaining * 100).toFixed(1)}% of the return left`,
      );
    }
    if (Math.abs(source.translateY - releaseY * remaining) > toleranceY) {
      found.push(
        `${label} frame ${frame.tick}: source y ${source.translateY.toFixed(3)} is not ${(releaseY * remaining).toFixed(3)}`,
      );
    }
  }

  // A second clock is exactly a frame where the presentation advanced and the deck did not.
  for (let index = 1; index < after.length; index += 1) {
    const previous = after[index - 1]!;
    const frame = after[index]!;
    if (frame.phase === "none" || previous.phase === "none") continue;
    if (
      Math.abs(frame.signedTravel - previous.signedTravel) < 1e-12 &&
      Math.abs(frame.settlement - previous.settlement) > 1e-9
    ) {
      found.push(
        `${label} frame ${previous.tick}->${frame.tick}: settlement advanced ${previous.settlement.toFixed(4)} -> ${frame.settlement.toFixed(4)} while the deck did not move`,
      );
    }
  }
  return found;
}

describe("StackedDeck Direct origin return", () => {
  it.each([0.2, 0.35, 0.45])(
    "unwinds a %s-pitch hold that resolves its own origin",
    async (fraction) => {
      const result = await originReturn(fraction);
      // The premise: this gesture really did resolve back to the card it began on.
      expect(result.settledId, `hold at ${fraction}`).toBe("c");
      expect(complaints(result, `hold ${fraction}`)).toEqual([]);
      // And it ends exactly where the deck rests, not nearly.
      expect(geometry(result.finalPoses)).toEqual(geometry(result.restPoses));
    },
    60_000,
  );

  it("unwinds a reversed hold that resolves its own origin", async () => {
    const result = await originReturn(0.3, 0, true);
    expect(result.settledId).toBe("c");
    expect(complaints(result, "reversed")).toEqual([]);
    expect(geometry(result.finalPoses)).toEqual(geometry(result.restPoses));
  }, 60_000);

  it("returns the vertical hand with the card rather than dropping it at pointer-up", async () => {
    const result = await originReturn(0.3, 90);
    expect(result.settledId).toBe("c");
    expect(result.atRelease.projection.translateY, "the hand never carried the card down").toBe(90);
    expect(complaints(result, "diagonal")).toEqual([]);
    expect(geometry(result.finalPoses)).toEqual(geometry(result.restPoses));
  }, 60_000);

  it("never opens an independent release settlement for a return", async () => {
    const result = await originReturn(0.35);
    const after = result.frames.slice(result.releaseFrame);
    // Nothing was released, so nothing parks and nothing lands.
    expect(after.every((frame) => frame.phase !== "parking")).toBe(true);
    expect(after.every((frame) => frame.landings === 0)).toBe(true);
    // And the presentation does not outlive the deck's own movement: the frame the controller
    // stops is the frame the exchange is handed back, with no tuck still to run.
    const stopped = after.findIndex((frame) => Math.abs(frame.signedTravel) < 1e-9);
    expect(stopped, "the deck never returned to its own zero").toBeGreaterThanOrEqual(0);
    expect(
      after.slice(stopped).every((frame) => frame.phase === "none"),
      "a presentation kept running after the deck had stopped",
    ).toBe(true);
    // And it does not run ahead of the deck either. A clock of its own shows up as the held shell
    // arriving home while the deck it belongs to is still travelling — which is the same defect
    // seen from the other side.
    const origin = result.atRelease.projection.originIndex;
    const early = after.filter(
      (frame) =>
        frame.phase === "returning" &&
        Math.hypot(frame.poses[origin]!.translateX, frame.poses[origin]!.translateY) < 1e-9 &&
        Math.abs(frame.signedTravel) > 1e-9,
    );
    expect(
      early.map((frame) => frame.tick),
      "the held shell was home before the deck was",
    ).toEqual([]);
  }, 60_000);

  /**
   * The strongest statement of "one movement": the return is indistinguishable from the same hand
   * dragging the card back itself.
   *
   * Sampled by the deck's own travel rather than by time, because the spring and a hand do not
   * arrive at a given scalar at the same moment — and the claim is about the picture at a scalar,
   * not about when it gets there.
   */
  it("draws the same frames a hand dragging back through the same travel would", async () => {
    const result = await originReturn(0.45);
    const direction = result.atRelease.projection.direction;
    const after = result.frames.slice(result.releaseFrame);
    const sampled = [0.3, 0.2, 0.1];
    for (const wanted of sampled) {
      // The nearest rendered frame to that travel, because a spring does not land on round
      // numbers and the claim is about the picture at a scalar rather than at a moment.
      const frame = after
        .filter((candidate) => candidate.phase === "returning")
        .reduce<Frame | undefined>((best, candidate) => {
          if (best === undefined) return candidate;
          const bestGap = Math.abs(best.signedTravel * direction - wanted);
          const gap = Math.abs(candidate.signedTravel * direction - wanted);
          return gap < bestGap ? candidate : best;
        }, undefined);
      expect(frame, `the return never passed through ${wanted} of a pitch`).toBeDefined();
      expect(
        Math.abs(frame!.signedTravel * direction - wanted),
        `the return skipped over ${wanted} of a pitch`,
      ).toBeLessThan(0.05);
      // Drive a held hand to the exact travel this returning frame is at, then compare pictures.
      const equivalent = await heldFrameAt(frame!.signedTravel);
      expect(equivalent.travel, `held travel for ${wanted}`).toBeCloseTo(frame!.signedTravel, 6);
      expect(geometry(frame!.poses), `return at ${wanted} of a pitch`).toEqual(equivalent.geometry);
    }
  }, 120_000);
});
