import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { h, nextTick } from "vue";

import StackedDeck from "../src/stacked-deck/components/StackedDeck.vue";
import type { StackedDeckCardState } from "../src/stacked-deck/stacked-deck-contracts";

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
}

interface DeckHandle {
  readonly frame: { readonly poses: readonly Pose[] };
  readonly physicalIndex: number;
  readonly pitch: number;
  readonly state: {
    readonly interactionDirection: -1 | 0 | 1;
    readonly interactionOriginIndex: number | null;
    readonly currentIndex: number;
    readonly settledIndex: number;
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
    pointerId: 73,
    pointerType: "mouse",
  });
}

/** Rounds off the last bits of floating-point noise a pitch multiplication leaves behind. */
function round(value: number) {
  return Number(value.toFixed(9)) || 0;
}

/** Exact comparison apart from the sign of zero, which no transform can express. */
function exact(value: number) {
  return value === 0 ? 0 : value;
}

/**
 * Geometry alone: what the eye reads, with none of the ordering a paint-order check owns.
 *
 * Comparison is exact apart from the sign of zero, which a transform cannot express: a pile slot
 * left of centre reaches a rotation of nought by multiplying a negative slot, and the same pose
 * reached by interpolation reaches it by adding. Nothing renders differently for it.
 */
function geometry(poses: readonly Pose[]) {
  return poses.map(({ opacity, rotate, scale, translateX, translateY }) => ({
    opacity: exact(opacity),
    rotate: exact(rotate),
    scale: exact(scale),
    translateX: exact(translateX),
    translateY: exact(translateY),
  }));
}

/**
 * Relative paint order, which is the only thing a layer number means. Reported pair by pair so a
 * renumbering that preserves every relative order reads as the same order, because it is one.
 */
function paintOrder(poses: readonly { readonly layer: number }[]) {
  const order: string[] = [];
  for (let first = 0; first < poses.length; first += 1) {
    for (let second = first + 1; second < poses.length; second += 1) {
      const difference = poses[first]!.layer - poses[second]!.layer;
      order.push(`${first}${difference === 0 ? "=" : difference > 0 ? ">" : "<"}${second}`);
    }
  }
  return order;
}

/**
 * One held Direct interaction over a five-screen deck, driven by absolute hand positions.
 *
 * Physical forward travel is a leftward hand, so a requested physical index maps to a negative
 * client X. The press lands on the top card's own hit surface, because that is what makes the deck
 * hand-owned rather than autonomous.
 */
function heldDirect(
  items: readonly Screen[] = screens,
  initialId?: string,
  exchange: "direct" | "shuffle" = "direct",
) {
  const wrapper = mount(TypedStackedDeck, {
    props: {
      items,
      itemLabel: (item: Screen) => item.title,
      label: "Direct reversal",
      exchange,
      reducedMotionOverride: true,
      ...(initialId === undefined ? {} : { initialId }),
    },
    slots: {
      card: (card: StackedDeckCardState<Screen, string>) =>
        h("div", { class: "screen" }, card.item.title),
    },
  });
  const deck = wrapper.vm as unknown as DeckHandle;
  const stage = wrapper.get(".snap-motion-stacked-deck").element as HTMLElement;
  stage.setPointerCapture = () => {};
  stage.releasePointerCapture = () => {};

  const rest = { geometry: geometry(deck.frame.poses), paintOrder: paintOrder(deck.frame.poses) };
  const originIndex = deck.state.currentIndex;
  const pitch = deck.pitch;
  let handY = 0;
  // A browser reports a hand back on the press point as that coordinate, never as its negative
  // zero; only multiplying a requested physical index by a pitch can produce one.
  const handXFor = (physical: number) => (physical === 0 ? 0 : -physical * pitch);

  function press() {
    const card = wrapper.findAll("[data-snap-motion-stacked-deck-card]")[originIndex]!
      .element as HTMLElement;
    card.dispatchEvent(pointerEvent("pointerdown", 0, 0));
  }

  async function hold(physical: number, verticalHand = 0) {
    handY = verticalHand;
    window.dispatchEvent(pointerEvent("pointermove", handXFor(physical), verticalHand));
    await nextTick();
    return deck;
  }

  return {
    deck,
    handXFor,
    handY: () => handY,
    hold,
    originIndex,
    pitch,
    press,
    rest,
    unmount: () => wrapper.unmount(),
  };
}

const DENSE_REVERSAL = [
  0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1, 0.02, 0, -0.02, -0.1, -0.2, -0.3, -0.4,
  -0.5, -0.6,
] as const;

describe("StackedDeck Direct held reversal", () => {
  it("returns the physical scalar to the hand through every reversal shape", async () => {
    const held = heldDirect();
    held.press();

    for (const trajectory of [
      DENSE_REVERSAL,
      [0.35, -0.2, 0.2, -0.35],
      [0.9, 0.4, -0.2, -0.9, -0.4, 0.2],
      [0.65, -0.65, 0.65, -0.65, 0.2, 0],
    ] as const) {
      for (const physical of trajectory) {
        const deck = await held.hold(physical);
        expect(deck.physicalIndex, `hand at ${physical}`).toBeCloseTo(physical, 9);
      }
    }
    held.unmount();
  });

  it("never lets resisted overdrag become a permanent origin offset", async () => {
    const held = heldDirect();
    held.press();

    const inside: { hand: number; scalar: number }[] = [];
    const resisted: { hand: number; scalar: number }[] = [];
    const neutrals: number[] = [];
    for (const trajectory of [
      [1.8, 1.2, 0.4, -0.2],
      [1.8, -0.25],
      [-1.8, 0.25],
      [2.4, -2.4, 0.15],
    ] as const) {
      for (const physical of trajectory) {
        const scalar = (await held.hold(physical)).physicalIndex;
        (Math.abs(physical) <= 1 ? inside : resisted).push({ hand: physical, scalar });
      }
      neutrals.push((await held.hold(0)).physicalIndex);
    }
    held.unmount();

    expect(inside.map((entry) => ({ hand: entry.hand, scalar: round(entry.scalar) }))).toEqual(
      inside.map((entry) => ({ hand: entry.hand, scalar: entry.hand })),
    );
    // Past the one-card envelope the deck resists rather than following, but it may never travel
    // further than the hand asked for, and it stays on the hand's own side.
    expect(
      resisted.filter(
        (entry) =>
          Math.abs(entry.scalar) >= Math.abs(entry.hand) ||
          Math.sign(entry.scalar) !== Math.sign(entry.hand),
      ),
    ).toEqual([]);
    // Whatever resistance did, the press point is still the origin.
    expect(neutrals).toEqual([0, 0, 0, 0]);
  });

  it("keeps the hand-owned shell pointer-locked in both axes across sign changes", async () => {
    const held = heldDirect();
    held.press();

    for (const [physical, verticalHand] of [
      [0.4, 12],
      [0.02, -6],
      [-0.02, -6],
      [-0.4, 24],
      [1.8, 3],
      [-0.25, 3],
      [0, 0],
    ] as const) {
      const deck = await held.hold(physical, verticalHand);
      const top = deck.frame.poses[held.originIndex]!;
      expect(top.translateX, `hand X at ${physical}`).toBe(held.handXFor(physical));
      expect(top.translateY, `hand Y at ${physical}`).toBe(verticalHand);
    }
    held.unmount();
  });

  it("meets the canonical source ring exactly at the neutral crossing", async () => {
    const held = heldDirect();
    held.press();

    for (const approach of [
      [0.6, 0.3, 0.02, 0],
      [-0.6, -0.3, -0.02, 0],
      [1.8, 0.4, 0],
    ] as const) {
      for (const physical of approach) await held.hold(physical);
      const deck = held.deck;
      expect(deck.physicalIndex).toBe(0);
      expect(geometry(deck.frame.poses)).toEqual(held.rest.geometry);
      expect(paintOrder(deck.frame.poses)).toEqual(held.rest.paintOrder);
    }
    held.unmount();
  });

  it("draws one physical frame per scalar, whatever the hand visited first", async () => {
    const held = heldDirect();
    held.press();

    async function frameAt(path: readonly number[]) {
      for (const physical of path) await held.hold(physical);
      return geometry(held.deck.frame.poses);
    }

    const forwardDirect = await frameAt([0, 0.3]);
    const backwardDirect = await frameAt([0, -0.3]);
    expect(await frameAt([0, 0.6, 0.3])).toEqual(forwardDirect);
    expect(await frameAt([0, -0.8, 0.6, 0.3])).toEqual(forwardDirect);
    expect(await frameAt([0, -0.6, -0.3])).toEqual(backwardDirect);
    expect(await frameAt([0, 1.8, -0.6, -0.3])).toEqual(backwardDirect);
    held.unmount();
  });

  it("keeps every shell the crossing does not exchange continuous through it", async () => {
    const held = heldDirect();
    held.press();
    const neighbours = new Set([
      (held.originIndex + 1) % screens.length,
      (held.originIndex - 1 + screens.length) % screens.length,
    ]);

    let previous = geometry((await held.hold(0.3)).frame.poses);
    let previousPhysical = 0.3;
    for (let step = 29; step >= -30; step -= 1) {
      const physical = step / 100;
      const deck = await held.hold(physical);
      const current = geometry(deck.frame.poses);
      const handStep = Math.abs(physical - previousPhysical) * held.pitch;
      for (let index = 0; index < current.length; index += 1) {
        if (index === held.originIndex || neighbours.has(index)) continue;
        expect(
          Math.abs(current[index]!.translateX - previous[index]!.translateX),
          `shell ${index} at ${physical}`,
        ).toBeLessThanOrEqual(handStep);
      }
      previous = current;
      previousPhysical = physical;
    }
    held.unmount();
  });

  it("keeps the cyclic boundary invisible to a held reversal", async () => {
    for (const initialId of ["a", "e"]) {
      const held = heldDirect(screens, initialId);
      held.press();
      for (const physical of DENSE_REVERSAL) {
        const deck = await held.hold(physical);
        expect(deck.physicalIndex, `${initialId} at ${physical}`).toBeCloseTo(physical, 9);
      }
      expect((await held.hold(0)).physicalIndex).toBe(0);
      expect(geometry(held.deck.frame.poses)).toEqual(held.rest.geometry);
      held.unmount();
    }
  });

  it("hands Shuffle the same reversal scalar it hands Direct", async () => {
    const held = heldDirect(screens, undefined, "shuffle");
    held.press();

    const inside: { hand: number; scalar: number }[] = [];
    for (const physical of [...DENSE_REVERSAL, 1.8, 0.4, -0.2, -1.8, 0.25]) {
      const scalar = (await held.hold(physical)).physicalIndex;
      if (Math.abs(physical) <= 1) inside.push({ hand: physical, scalar: round(scalar) });
    }
    expect(inside).toEqual(inside.map((entry) => ({ hand: entry.hand, scalar: entry.hand })));
    expect((await held.hold(0)).physicalIndex).toBe(0);
    expect(geometry(held.deck.frame.poses)).toEqual(held.rest.geometry);
    held.unmount();
  });

  it("keeps two-item explicit direction physical through a held reversal", async () => {
    const held = heldDirect([screens[0], screens[1]]);
    held.press();

    for (const [physical, direction] of [
      [0.4, 1],
      [0.2, 1],
      [0, 1],
      [-0.2, -1],
      [-0.4, -1],
      [-0.05, -1],
      [0.3, 1],
      [1.6, 1],
      [-0.3, -1],
    ] as const) {
      const deck = await held.hold(physical);
      expect(
        Math.abs(physical) > 1 ? physical : round(deck.physicalIndex),
        `two-item hand at ${physical}`,
      ).toBe(physical);
      // Both directions name the same semantic card; only the explicit direction separates them.
      expect(deck.state.interactionDirection, `two-item direction at ${physical}`).toBe(direction);
      expect(deck.frame.poses[held.originIndex]!.translateX).toBe(held.handXFor(physical));
    }
    expect((await held.hold(0)).physicalIndex).toBe(0);
    expect(geometry(held.deck.frame.poses)).toEqual(held.rest.geometry);
    held.unmount();
  });
});
