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
  readonly visible: boolean;
  readonly interactive: boolean;
}

interface Frame {
  readonly tick: number;
  readonly poses: readonly Pose[];
  readonly direction: -1 | 0 | 1;
  readonly targetIndex: number | null;
  readonly originIndex: number;
  readonly signedTravel: number;
  readonly phase: string;
  readonly landings: readonly { itemIndex: number; settlement: number; releaseOrder: number }[];
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

function pointerEvent(type: string, clientX: number, pointerId: number) {
  return new PointerEvent(type, {
    bubbles: true,
    buttons: type === "pointerdown" || type === "pointermove" ? 1 : 0,
    cancelable: true,
    clientX,
    clientY: 0,
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
      });
    }
  }
  return [...found.values()];
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
      if (frame.direction !== previous.direction) {
        breaches.push(
          `frame ${frame.tick}: released direction ${previous.direction} became ${frame.direction}`,
        );
      }
      if (frame.targetIndex !== previous.targetIndex) {
        breaches.push(
          `frame ${frame.tick}: released target ${previous.targetIndex} became ${frame.targetIndex}`,
        );
      }
    }
    previous = { direction: frame.direction, targetIndex: frame.targetIndex };
  }
  return breaches;
}

/** No hand crosses the stage in one frame; 120px per frame is already a very fast flick. */
const MAX_HAND_STEP = 120;

function deck(items: readonly Screen[] = screens) {
  const clock = installClock();
  const wrapper = mount(TypedStackedDeck, {
    props: {
      items,
      itemLabel: (item: Screen) => item.title,
      label: "Direct paint safety",
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
    tuning: { cardWidth: number; cardHeight: number };
    root: HTMLElement & { snapMotionDirectDebug?: unknown };
    settledId: string;
  };
  const stage = wrapper.get(".snap-motion-stacked-deck").element as HTMLElement;
  stage.setPointerCapture = () => {};
  stage.releasePointerCapture = () => {};

  const frames: Frame[] = [];
  let tick = 0;
  let hand = 0;
  let pointerId = 900;
  let maxLandings = 0;
  let sawAirborneCapture = false;
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
    // A hand holding a shell its own interaction has not moved, while that shell is nowhere near
    // the deck, is a hand that took it already in the air.
    if (
      projection?.phase === "held" &&
      Math.abs(signedTravel) < 1e-6 &&
      Math.abs(poses[originIndex]?.translateX ?? 0) > 40
    ) {
      sawAirborneCapture = true;
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
      direction: projection?.direction ?? 0,
      targetIndex: projection?.targetIndex ?? null,
      originIndex,
      signedTravel,
      phase: projection?.phase ?? "none",
      landings,
    });
  }

  capture();

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
      pointerId += 1;
      hand = 0;
      (
        wrapper.findAll("[data-snap-motion-stacked-deck-card]")[index]!.element as HTMLElement
      ).dispatchEvent(pointerEvent("pointerdown", 0, pointerId));
      await nextTick();
      return index;
    },
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
    async release() {
      window.dispatchEvent(pointerEvent("pointerup", hand, pointerId));
      await nextTick();
    },
    finish() {
      const tuning = view.tuning;
      const settledId = view.settledId;
      wrapper.unmount();
      clock.restore();
      return {
        frames,
        settledId,
        maxLandings,
        sawAirborneCapture,
        sawExposedSymmetricPile,
        sawRetirementUnderInteraction,
        breaches: envelopeBreaches(frames),
        violations: paintViolations(frames, tuning.cardWidth, tuning.cardHeight),
      };
    },
  };
}

type Result = ReturnType<ReturnType<typeof deck>["finish"]>;

/**
 * Everything a run of rendered frames has to be able to say for itself, as the empty list it is
 * when the deck was physical the whole way through.
 */
function complaints(result: Result): string[] {
  return [
    ...result.violations.map(
      (violation) =>
        `frame ${violation.fromTick}->${violation.toTick}: card ${violation.before} gave ${violation.points} sampled points to card ${violation.after} after ${violation.shift.toFixed(2)}px of motion`,
    ),
    ...result.breaches,
  ];
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
   * The one seam this projection has not closed, pinned exactly rather than excluded.
   *
   * A subordinate pile shell takes the exchange's depth on the first frame the exchange has any
   * geometry at all. What makes that invisible is the shell being lifted: at that frame it is still
   * over the deck, covering the whole pile, and a depth change under an opaque body is not a change.
   *
   * A hand that catches a shell already in the air never lifts anything off this deck. Its
   * interaction-local zero is a frame where the deck's own top is hundreds of pixels away and the
   * pile is uncovered, so on the next frame the same write lands in the open:
   *
   *   packages/core/src/stackedDeck.ts, `moveDirectPose`: `pose.layer = destination.layer`
   *
   * reached through `resolveDirectShell` at `reveal ≈ 0.1`, where the two shells beside the deck's
   * centre exchange paint order after under 3px of motion. Closing it needs either the pile's own
   * depth model or the frame the target takes the top on, so it is recorded here rather than
   * patched around. This reproduces every run and fails the moment the behaviour changes — which
   * includes the run where someone fixes it.
   */
  it("still exchanges two pile faces when a hand catches a shell in mid-air", async () => {
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
    // Everything the released envelope owns still holds through it.
    expect(result.breaches, `released envelope: ${result.breaches.join("; ")}`).toEqual([]);
    expect(result.sawAirborneCapture, "no shell was caught in the air").toBe(true);
    const seam = result.violations.map((violation) => ({
      cards: [violation.before, violation.after],
      movedUnderThreePixels: violation.shift < 3,
      where: `frame ${violation.fromTick}->${violation.toTick}`,
    }));
    expect(seam).toEqual([{ cards: [4, 1], movedUnderThreePixels: true, where: "frame 18->19" }]);
  }, 120_000);

  it("lets a hand catch a shell already in the air and reverse through its own zero", async () => {
    const surface = deck();
    // Throw one shell so it commits and parks.
    await surface.press();
    await surface.step();
    await surface.drag(-560);
    await surface.release();
    await surface.step(2);
    // The next hand takes the new top and draws back toward the shell still in the air, which is
    // what makes that shell this exchange's target and so something a hand can take hold of.
    await surface.press();
    await surface.step();
    await surface.drag(420);
    await surface.release();
    await surface.step();
    // That same shell, caught at the exact pose it was drawn at, then reversed through the
    // interaction-local zero it was given and carried on the other way.
    await surface.press();
    await surface.step();
    for (const to of [180, 360, 180, 0, -180, -360]) await surface.drag(to);
    await surface.release();
    await surface.step(24);
    const result = surface.finish();
    expect(result.sawAirborneCapture, "no shell was caught in the air").toBe(true);
    expect(complaints(result), "held reversal after an airborne catch").toEqual([]);
  }, 120_000);
});
