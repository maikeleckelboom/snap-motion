import { mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { h, nextTick } from "vue";

import StackedDeck from "../src/stacked-deck/components/StackedDeck.vue";
import type { StackedDeckCardState } from "../src/stacked-deck/stacked-deck-contracts";

/**
 * Collection reconciliation, measured on what the component actually rendered.
 *
 * Membership may change at once; the cards may not. Every frame here is read back from the DOM the
 * real component produced — inline transform, z-index, shadow strength, inertness — on one
 * hand-advanced clock that every RAF consumer of the deck runs on, so a failure is a frame a user
 * could have recorded.
 */

interface Screen {
  readonly id: string;
  readonly title: string;
}
const all: readonly Screen[] = ["a", "b", "c", "d", "e", "f"].map((id) => ({
  id,
  title: id.toUpperCase(),
}));
const pick = (...ids: string[]) => ids.map((id) => all.find((screen) => screen.id === id)!);
const TypedStackedDeck = StackedDeck<Screen>;

interface Body {
  readonly id: string;
  readonly exiting: boolean;
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly rotate: number;
  readonly layer: number;
  readonly shadow: number;
  readonly willChange: string;
  readonly inert: boolean;
  readonly ariaHidden: string | null;
  readonly role: string | null;
  readonly isItem: boolean;
}

interface RenderedFrame {
  readonly tick: number;
  readonly reconciling: boolean;
  readonly bodies: readonly Body[];
}

const clocks: { restore(): void }[] = [];
afterEach(() => {
  while (clocks.length > 0) clocks.pop()!.restore();
  document.body.innerHTML = "";
});

/** One deterministic frame clock every animated part of the deck runs on. */
function installClock() {
  let now = 1_000;
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
  const clock = {
    async step(milliseconds = 16) {
      now += milliseconds;
      const pending = queue;
      queue = new Map();
      for (const callback of pending.values()) callback(now);
      await nextTick();
      await nextTick();
    },
    restore() {
      globalThis.requestAnimationFrame = realRaf;
      globalThis.cancelAnimationFrame = realCancel;
      performance.now = realNow;
    },
  };
  clocks.push(clock);
  return clock;
}

const TRANSFORM =
  /translate3d\(-50%, -50%, 0\) translate3d\((-?[\d.]+)px, (-?[\d.]+)px, 0\) scale\((-?[\d.]+)\) rotate\((-?[\d.]+)deg\)/;

function read(root: Element, tick: number): RenderedFrame {
  const bodies: Body[] = [];
  for (const shell of root.querySelectorAll<HTMLElement>(
    ".snap-motion-stacked-deck-card, .snap-motion-stacked-deck-exit",
  )) {
    const motion = shell.firstElementChild as HTMLElement;
    const match = TRANSFORM.exec(motion.style.transform);
    if (match === null) throw new Error(`unreadable transform ${motion.style.transform}`);
    if (shell.style.visibility === "hidden") continue;
    bodies.push({
      id: shell.dataset.itemId!,
      exiting: shell.dataset.deckExiting === "true",
      x: Number(match[1]),
      y: Number(match[2]),
      scale: Number(match[3]),
      rotate: Number(match[4]),
      layer: Number(shell.style.zIndex),
      shadow: Number(motion.style.getPropertyValue("--snap-motion-deck-shadow-strength")),
      willChange: motion.style.willChange || "auto",
      inert: shell.hasAttribute("inert"),
      ariaHidden: shell.getAttribute("aria-hidden"),
      role: shell.getAttribute("role"),
      isItem: shell.hasAttribute("data-snap-motion-stacked-deck-card"),
    });
  }
  return {
    tick,
    reconciling: (root as HTMLElement).dataset.reconciling === "true",
    bodies,
  };
}

function mountDeck(
  items: readonly Screen[],
  props: Record<string, unknown> = {},
): {
  wrapper: VueWrapper;
  clock: ReturnType<typeof installClock>;
  root: HTMLElement;
  view: {
    next(): boolean;
    previous(): boolean;
    tuning: { cardWidth: number; cardHeight: number };
    frame: { poses: readonly { translateX: number }[] };
    pitch: number;
    settledId: string;
    reconciling: boolean;
  };
} {
  const clock = installClock();
  const wrapper = mount(TypedStackedDeck, {
    props: {
      items,
      itemLabel: (item: Screen) => item.title,
      label: "Reconciliation",
      reducedMotionOverride: false,
      ...props,
    },
    slots: {
      card: (card: StackedDeckCardState<Screen, string>) =>
        h("button", { class: "screen", "data-exiting": String(card.exiting) }, card.item.title),
    },
    attachTo: document.body,
  });
  const root = wrapper.get(".snap-motion-stacked-deck").element as HTMLElement;
  root.setPointerCapture = () => {};
  root.releasePointerCapture = () => {};
  return { wrapper, clock, root, view: wrapper.vm as never };
}

async function settle(deck: ReturnType<typeof mountDeck>, limit = 200) {
  for (let index = 0; index < limit; index += 1) {
    await deck.clock.step();
    if (
      deck.root.dataset.phase === "idle" &&
      deck.root.dataset.reconciling !== "true" &&
      deck.root.querySelector(".snap-motion-stacked-deck-exit") === null
    ) {
      return;
    }
  }
  throw new Error("the deck never came to rest");
}

/** Records every rendered frame from just before `mutate` until the deck rests again. */
async function recordMutation(
  deck: ReturnType<typeof mountDeck>,
  mutate: () => Promise<void> | void,
  options: { framesBeforeSecond?: number; second?: () => Promise<void> | void } = {},
) {
  const frames: RenderedFrame[] = [read(deck.root, 0)];
  await mutate();
  await nextTick();
  frames.push(read(deck.root, 1));
  let tick = 1;
  let mutationTicks = [1];
  for (let index = 0; index < 200; index += 1) {
    await deck.clock.step();
    tick += 1;
    frames.push(read(deck.root, tick));
    if (options.second !== undefined && index + 1 === options.framesBeforeSecond) {
      await options.second();
      await nextTick();
      tick += 1;
      mutationTicks = [...mutationTicks, tick];
      frames.push(read(deck.root, tick));
    }
    const last = frames.at(-1)!;
    if (
      deck.root.dataset.phase === "idle" &&
      !last.reconciling &&
      last.bodies.every((body) => !body.exiting) &&
      index > (options.framesBeforeSecond ?? 0) + 1
    ) {
      break;
    }
  }
  return { frames, mutationTicks };
}

function contains(body: Body, x: number, y: number, width: number, height: number) {
  if (body.scale <= 0) return false;
  const radians = (-body.rotate * Math.PI) / 180;
  const dx = x - body.x;
  const dy = y - body.y;
  return (
    Math.abs((dx * Math.cos(radians) + dy * Math.sin(radians)) / body.scale) <= width / 2 &&
    Math.abs((-dx * Math.sin(radians) + dy * Math.cos(radians)) / body.scale) <= height / 2
  );
}

/** The body painted at a point: highest z-index, ties by document order, as a browser paints. */
function ownerAt(bodies: readonly Body[], x: number, y: number, width: number, height: number) {
  let owner: Body | undefined;
  for (const body of bodies) {
    if (!contains(body, x, y, width, height)) continue;
    if (owner === undefined || body.layer >= owner.layer) owner = body;
  }
  return owner;
}

/**
 * A pixel may change owner only because a body edge moved through it. Two bodies that both cover a
 * point on two consecutive frames may never swap paint order there.
 */
function paintSwaps(frames: readonly RenderedFrame[], width: number, height: number) {
  const swaps: string[] = [];
  for (let index = 1; index < frames.length; index += 1) {
    const before = frames[index - 1]!;
    const after = frames[index]!;
    for (let x = -width * 1.6; x <= width * 1.6; x += width / 24) {
      for (let y = -height; y <= height; y += height / 14) {
        const a = ownerAt(before.bodies, x, y, width, height);
        const b = ownerAt(after.bodies, x, y, width, height);
        if (a === undefined || b === undefined || a.id === b.id) continue;
        const aAfter = after.bodies.find((body) => body.id === a.id);
        const bBefore = before.bodies.find((body) => body.id === b.id);
        if (aAfter === undefined || bBefore === undefined) continue;
        if (!contains(aAfter, x, y, width, height) || !contains(bBefore, x, y, width, height))
          continue;
        swaps.push(
          `${before.tick}->${after.tick} at (${x.toFixed(0)},${y.toFixed(0)}): ${a.id}->${b.id}`,
        );
      }
    }
  }
  return swaps;
}

/**
 * A card may only stop being drawn, or start being drawn, where none of it can be seen: every sampled
 * point of its body is owned by something in front of it on the frame it is present.
 */
function visibleAppearances(frames: readonly RenderedFrame[], width: number, height: number) {
  const found: string[] = [];
  const owns = (frame: RenderedFrame, id: string) => {
    for (let x = -width * 1.6; x <= width * 1.6; x += width / 48) {
      for (let y = -height; y <= height; y += height / 28) {
        if (ownerAt(frame.bodies, x, y, width, height)?.id === id) return true;
      }
    }
    return false;
  };
  for (let index = 1; index < frames.length; index += 1) {
    const before = frames[index - 1]!;
    const after = frames[index]!;
    for (const body of before.bodies) {
      if (!after.bodies.some((candidate) => candidate.id === body.id) && owns(before, body.id)) {
        found.push(`${body.id} vanished while visible at ${before.tick}->${after.tick}`);
      }
    }
    for (const body of after.bodies) {
      if (!before.bodies.some((candidate) => candidate.id === body.id) && owns(after, body.id)) {
        found.push(`${body.id} appeared while visible at ${before.tick}->${after.tick}`);
      }
    }
  }
  return found;
}

/** Largest single-frame displacement of any card corner, per surviving identity. */
function largestJump(
  before: RenderedFrame,
  after: RenderedFrame,
  width: number,
  height: number,
  survivorsOnly = true,
) {
  const radius = Math.hypot(width, height) / 2;
  let largest = { distance: 0, shadow: 0, id: "" };
  for (const body of after.bodies) {
    const previous = before.bodies.find((candidate) => candidate.id === body.id);
    if (previous === undefined || (survivorsOnly && body.exiting)) continue;
    const distance = Math.max(
      Math.hypot(body.x - previous.x, body.y - previous.y),
      Math.abs(body.scale - previous.scale) * radius,
      Math.abs(body.rotate - previous.rotate) * (Math.PI / 180) * radius,
    );
    const shadow = Math.abs(body.shadow - previous.shadow);
    if (distance > largest.distance) largest = { ...largest, distance, id: body.id };
    largest.shadow = Math.max(largest.shadow, shadow);
  }
  return largest;
}

/**
 * The fastest any card moves through an ordinary Shuffle exchange of the same deck, per frame.
 * Reconciliation is held to the deck's own material: no card may move faster than that.
 */
let measuredExchangeSpeed = Number.NaN;
const exchangeSpeed = (_width: number, _height: number) => measuredExchangeSpeed;
beforeAll(async () => {
  const deck = mountDeck(pick("a", "b", "c", "d", "e"), { activeId: "c" });
  await settle(deck);
  const { cardWidth: width, cardHeight: height } = deck.view.tuning;
  let previous = read(deck.root, 0);
  let fastest = 0;
  for (const step of [() => deck.view.next(), () => deck.view.previous()]) {
    step();
    for (let index = 0; index < 120; index += 1) {
      await deck.clock.step();
      const current = read(deck.root, index);
      fastest = Math.max(fastest, largestJump(previous, current, width, height).distance);
      previous = current;
      if (deck.root.dataset.phase === "idle") break;
    }
  }
  deck.wrapper.unmount();
  clocks.pop()!.restore();
  measuredExchangeSpeed = fastest;
});

function canonicalFrame(items: readonly Screen[], activeId: string, exchange = "shuffle") {
  const reference = mountDeck(items, { activeId, exchange });
  const frame = read(reference.root, 0);
  reference.wrapper.unmount();
  return frame;
}

const placement = (frame: RenderedFrame) =>
  frame.bodies
    .map(({ id, x, y, scale, rotate, shadow }) => ({ id, x, y, scale, rotate, shadow }))
    .sort((left, right) => left.id.localeCompare(right.id));
// Paint order is compared as an order, because reconciliation does not promise z-index numbers.
const paintOrder = (frame: RenderedFrame) =>
  frame.bodies
    .map((body, index) => ({ ...body, index }))
    // oxlint-disable-next-line unicorn/no-array-sort -- ES2022 package types; this mapped array is private.
    .sort((left, right) => left.layer - right.layer || left.index - right.index)
    .map((body) => body.id);
const promoted = (frame: RenderedFrame) =>
  frame.bodies
    .filter((body) => body.willChange === "transform")
    .map((body) => body.id)
    .sort();

function expectSamePlacement(actual: RenderedFrame, expected: RenderedFrame) {
  expect(placement(actual)).toEqual(placement(expected));
  expect(paintOrder(actual)).toEqual(paintOrder(expected));
}

const scenarios: readonly {
  readonly name: string;
  readonly from: readonly string[];
  readonly active: string;
  readonly to: readonly string[];
  readonly nextActive: string;
}[] = [
  {
    name: "removes the current card (3 → 2)",
    from: ["f", "a", "c"],
    active: "a",
    to: ["f", "c"],
    nextActive: "c",
  },
  {
    name: "removes a card behind the current one (3 → 2)",
    from: ["f", "a", "c"],
    active: "a",
    to: ["a", "c"],
    nextActive: "a",
  },
  {
    name: "removes the first member (5 → 4)",
    from: ["a", "b", "c", "d", "e"],
    active: "c",
    to: ["b", "c", "d", "e"],
    nextActive: "c",
  },
  {
    name: "removes the last member (5 → 4)",
    from: ["a", "b", "c", "d", "e"],
    active: "c",
    to: ["a", "b", "c", "d"],
    nextActive: "c",
  },
  {
    name: "removes the current card (5 → 4)",
    from: ["a", "b", "c", "d", "e"],
    active: "c",
    to: ["a", "b", "d", "e"],
    nextActive: "d",
  },
  {
    name: "removes the current card (4 → 3)",
    from: ["a", "b", "c", "d"],
    active: "b",
    to: ["a", "c", "d"],
    nextActive: "c",
  },
  {
    name: "reduces to one card (2 → 1)",
    from: ["a", "c"],
    active: "c",
    to: ["a"],
    nextActive: "a",
  },
  {
    name: "reduces to one card behind (2 → 1)",
    from: ["a", "c"],
    active: "c",
    to: ["c"],
    nextActive: "c",
  },
  {
    name: "adds a card behind (2 → 3)",
    from: ["a", "c"],
    active: "c",
    to: ["a", "c", "e"],
    nextActive: "c",
  },
  {
    name: "adds a card that becomes current (3 → 4)",
    from: ["a", "b", "c"],
    active: "b",
    to: ["a", "b", "c", "e"],
    nextActive: "e",
  },
  {
    name: "adds a second card that becomes current (1 → 2)",
    from: ["a"],
    active: "a",
    to: ["a", "c"],
    nextActive: "c",
  },
  {
    name: "reorders and replaces at once",
    from: ["a", "b", "c", "d"],
    active: "b",
    to: ["d", "e", "b", "a"],
    nextActive: "b",
  },
];

describe("Stacked Deck collection reconciliation", () => {
  for (const exchange of ["shuffle", "direct"] as const) {
    for (const scenario of scenarios) {
      it(`${exchange}: ${scenario.name} continuously and lands exactly`, async () => {
        const deck = mountDeck(pick(...scenario.from), { activeId: scenario.active, exchange });
        await settle(deck);
        const { cardWidth: width, cardHeight: height } = deck.view.tuning;
        const settled: string[] = [];
        deck.wrapper.vm.$.vnode.props!.onSettled = (id: string) => settled.push(id);

        const { frames } = await recordMutation(deck, () =>
          deck.wrapper.setProps({ items: pick(...scenario.to), activeId: scenario.nextActive }),
        );

        // Membership is immediate: exactly the new items are items from the first frame.
        const first = frames[1]!;
        expect(
          first.bodies
            .filter((body) => body.isItem)
            .map((body) => body.id)
            // oxlint-disable-next-line unicorn/no-array-sort -- ES2022 package types; mapped and private.
            .sort(),
          // oxlint-disable-next-line unicorn/no-array-sort -- ES2022 package types; a private copy.
        ).toEqual([...scenario.to].sort());
        // Every surviving card begins exactly where it was drawn.
        for (const body of first.bodies) {
          const before = frames[0]!.bodies.find((candidate) => candidate.id === body.id);
          if (before === undefined) continue;
          expect({
            id: body.id,
            x: body.x,
            y: body.y,
            scale: body.scale,
            rotate: body.rotate,
            shadow: body.shadow,
          }).toEqual({
            id: before.id,
            x: before.x,
            y: before.y,
            scale: before.scale,
            rotate: before.rotate,
            shadow: before.shadow,
          });
        }
        // No surviving card teleports, and no shadow snaps, on any frame.
        for (let index = 1; index < frames.length; index += 1) {
          const jump = largestJump(frames[index - 1]!, frames[index]!, width, height);
          expect(jump.distance, `frame ${frames[index]!.tick} ${jump.id}`).toBeLessThanOrEqual(
            exchangeSpeed(width, height),
          );
          expect(jump.shadow, `frame ${frames[index]!.tick}`).toBeLessThan(0.2);
        }
        // Depth never changes where two bodies both still are.
        expect(paintSwaps(frames, width, height)).toEqual([]);
        expect(visibleAppearances(frames, width, height)).toEqual([]);
        // Departures are presentation only, and are gone once contained.
        for (const frame of frames) {
          for (const body of frame.bodies.filter((candidate) => candidate.exiting)) {
            expect(body.inert).toBe(true);
            expect(body.ariaHidden).toBe("true");
            expect(body.role).toBeNull();
            expect(body.isItem).toBe(false);
          }
        }
        const last = frames.at(-1)!;
        expect(last.bodies.some((body) => body.exiting)).toBe(false);
        // Arrival is the exact canonical rest of the new collection.
        expectSamePlacement(
          last,
          canonicalFrame(pick(...scenario.to), scenario.nextActive, exchange),
        );
        // Settlement speaks only for the new collection, never for one that no longer exists.
        expect(settled.every((id) => scenario.to.includes(id))).toBe(true);
        deck.wrapper.unmount();
      });
    }
  }

  it("continues from the drawn state when a second change interrupts the first", async () => {
    const deck = mountDeck(pick("a", "b", "c", "d", "e"), { activeId: "c" });
    await settle(deck);
    const { cardWidth: width, cardHeight: height } = deck.view.tuning;
    const { frames, mutationTicks } = await recordMutation(
      deck,
      () => deck.wrapper.setProps({ items: pick("a", "b", "d", "e"), activeId: "d" }),
      {
        framesBeforeSecond: 9,
        second: () => deck.wrapper.setProps({ items: pick("a", "d", "e", "c"), activeId: "c" }),
      },
    );
    const second = frames.findIndex((frame) => frame.tick === mutationTicks[1]);
    // The second change starts from the frame the first one had reached, not from its start.
    for (const body of frames[second]!.bodies) {
      const before = frames[second - 1]!.bodies.find((candidate) => candidate.id === body.id);
      if (before === undefined) continue;
      expect([body.id, body.x, body.y, body.scale, body.rotate]).toEqual([
        before.id,
        before.x,
        before.y,
        before.scale,
        before.rotate,
      ]);
    }
    for (let index = 1; index < frames.length; index += 1) {
      expect(
        largestJump(frames[index - 1]!, frames[index]!, width, height).distance,
      ).toBeLessThanOrEqual(exchangeSpeed(width, height));
    }
    expect(paintSwaps(frames, width, height)).toEqual([]);
    expect(visibleAppearances(frames, width, height)).toEqual([]);
    expectSamePlacement(frames.at(-1)!, canonicalFrame(pick("a", "d", "e", "c"), "c"));
    deck.wrapper.unmount();
  });

  for (const long of [150, 250, 400]) {
    it(`draws a ${long}ms frame that would step over the depth midpoint at the midpoint`, async () => {
      const deck = mountDeck(pick("a", "b", "c", "d", "e"), { activeId: "c" });
      await settle(deck);
      const { cardWidth: width, cardHeight: height } = deck.view.tuning;
      const frames: RenderedFrame[] = [read(deck.root, 0)];
      await deck.wrapper.setProps({ items: pick("a", "b", "d", "e"), activeId: "d" });
      await nextTick();
      frames.push(read(deck.root, 1));
      await deck.clock.step(16);
      frames.push(read(deck.root, 2));
      // A browser that stalls: one frame long enough to carry the whole route past its midpoint.
      await deck.clock.step(long);
      frames.push(read(deck.root, 3));
      for (let index = 0; index < 60 && deck.view.reconciling; index += 1) {
        await deck.clock.step(16);
        frames.push(read(deck.root, frames.length));
      }
      expect(paintSwaps(frames, width, height)).toEqual([]);
      expect(visibleAppearances(frames, width, height)).toEqual([]);
      expectSamePlacement(frames.at(-1)!, canonicalFrame(pick("a", "b", "d", "e"), "d"));
      deck.wrapper.unmount();
    });
  }

  it("re-admits a departing card from wherever its departure has carried it", async () => {
    const deck = mountDeck(pick("a", "b", "c"), { activeId: "b" });
    await settle(deck);
    const { cardWidth: width, cardHeight: height } = deck.view.tuning;
    const { frames } = await recordMutation(
      deck,
      () => deck.wrapper.setProps({ items: pick("a", "c"), activeId: "c" }),
      {
        framesBeforeSecond: 6,
        second: () => deck.wrapper.setProps({ items: pick("a", "c", "b"), activeId: "b" }),
      },
    );
    for (let index = 1; index < frames.length; index += 1) {
      expect(
        largestJump(frames[index - 1]!, frames[index]!, width, height, false).distance,
      ).toBeLessThanOrEqual(exchangeSpeed(width, height));
    }
    expect(paintSwaps(frames, width, height)).toEqual([]);
    expect(visibleAppearances(frames, width, height)).toEqual([]);
    expectSamePlacement(frames.at(-1)!, canonicalFrame(pick("a", "c", "b"), "b"));
    deck.wrapper.unmount();
  });

  for (const exchange of ["shuffle", "direct"] as const) {
    it(`${exchange}: continues an exchange still in flight from the frame it was drawn at`, async () => {
      const deck = mountDeck(pick("a", "b", "c", "d"), { exchange });
      await settle(deck);
      const { cardWidth: width, cardHeight: height } = deck.view.tuning;
      deck.view.next();
      for (let index = 0; index < 5; index += 1) await deck.clock.step();
      expect(deck.root.dataset.phase).not.toBe("idle");
      const current = deck.view.settledId;
      const remaining = ["a", "b", "c", "d"].filter((id) => id !== "a");
      const { frames } = await recordMutation(deck, () =>
        deck.wrapper.setProps({ items: pick(...remaining) }),
      );
      for (const body of frames[1]!.bodies) {
        const before = frames[0]!.bodies.find((candidate) => candidate.id === body.id)!;
        expect([body.x, body.y, body.scale, body.rotate]).toEqual([
          before.x,
          before.y,
          before.scale,
          before.rotate,
        ]);
      }
      for (let index = 1; index < frames.length; index += 1) {
        expect(
          largestJump(frames[index - 1]!, frames[index]!, width, height).distance,
        ).toBeLessThanOrEqual(exchangeSpeed(width, height));
      }
      expect(paintSwaps(frames, width, height)).toEqual([]);
      expect(visibleAppearances(frames, width, height)).toEqual([]);
      expect(current).toBeDefined();
      deck.wrapper.unmount();
    });
  }

  for (const exchange of ["shuffle", "direct"] as const) {
    for (const removed of ["incoming", "outgoing"] as const) {
      for (const elapsed of [2, 4, 6, 8, 10, 13, 16]) {
        it(`${exchange}: removes the ${removed} card of a two-card exchange ${elapsed} frames in`, async () => {
          const deck = mountDeck(pick("a", "b"), { exchange, activeId: "a" });
          await settle(deck);
          const { cardWidth: width, cardHeight: height } = deck.view.tuning;
          deck.view.next();
          // The application accepts the destination as the exchange requests it.
          await deck.wrapper.setProps({ activeId: "b" });
          for (let index = 0; index < elapsed; index += 1) await deck.clock.step();
          expect(deck.root.dataset.phase).not.toBe("idle");
          const survivor = removed === "incoming" ? "a" : "b";
          const { frames } = await recordMutation(deck, () =>
            deck.wrapper.setProps({ items: pick(survivor), activeId: survivor }),
          );
          for (let index = 1; index < frames.length; index += 1) {
            expect(
              largestJump(frames[index - 1]!, frames[index]!, width, height).distance,
            ).toBeLessThanOrEqual(exchangeSpeed(width, height));
          }
          expect(paintSwaps(frames, width, height)).toEqual([]);
          expect(visibleAppearances(frames, width, height)).toEqual([]);
          expectSamePlacement(frames.at(-1)!, canonicalFrame(pick(survivor), survivor, exchange));
          deck.wrapper.unmount();
        });
      }
    }
  }

  it("continues a held Direct card from under the hand, and the hand no longer owns it", async () => {
    const deck = mountDeck(pick("a", "b", "c", "d"), { exchange: "direct", activeId: "b" });
    await settle(deck);
    const { cardWidth: width, cardHeight: height } = deck.view.tuning;
    const held = deck.root.querySelector<HTMLElement>("[data-item-id='b']")!;
    held.dispatchEvent(pointer("pointerdown", 0));
    window.dispatchEvent(pointer("pointermove", -deck.view.pitch * 0.3));
    await Promise.resolve();
    await nextTick();
    await deck.clock.step();
    expect(deck.root.dataset.owned).toBe("true");
    const { frames } = await recordMutation(deck, () =>
      deck.wrapper.setProps({ items: pick("a", "b", "c") }),
    );
    expect(deck.root.dataset.owned).toBe("false");
    for (const body of frames[1]!.bodies) {
      const before = frames[0]!.bodies.find((candidate) => candidate.id === body.id)!;
      expect([body.x, body.y, body.scale, body.rotate]).toEqual([
        before.x,
        before.y,
        before.scale,
        before.rotate,
      ]);
    }
    for (let index = 1; index < frames.length; index += 1) {
      expect(
        largestJump(frames[index - 1]!, frames[index]!, width, height).distance,
      ).toBeLessThanOrEqual(exchangeSpeed(width, height));
    }
    expect(paintSwaps(frames, width, height)).toEqual([]);
    expect(visibleAppearances(frames, width, height)).toEqual([]);
    window.dispatchEvent(pointer("pointerup", 0));
    deck.wrapper.unmount();
  });

  it("adopts the new collection at once under reduced motion", async () => {
    const deck = mountDeck(pick("a", "b", "c"), { activeId: "b", reducedMotionOverride: true });
    await settle(deck);
    await deck.wrapper.setProps({ items: pick("a", "c"), activeId: "c" });
    await nextTick();
    const frame = read(deck.root, 1);
    expect(frame.reconciling).toBe(false);
    expect(frame.bodies.some((body) => body.exiting)).toBe(false);
    expectSamePlacement(
      frame,
      (() => {
        const reference = mountDeck(pick("a", "c"), { activeId: "c", reducedMotionOverride: true });
        const result = read(reference.root, 0);
        reference.wrapper.unmount();
        return result;
      })(),
    );
    deck.wrapper.unmount();
  });

  it("refuses inspection while cards are still arriving, and moves focus off a departing card", async () => {
    const deck = mountDeck(pick("a", "b", "c"), { activeId: "b" });
    await settle(deck);
    const activations: string[] = [];
    deck.wrapper.vm.$.vnode.props!.onActivate = (item: Screen) => activations.push(item.id);
    const focused = deck.root.querySelector<HTMLElement>("[data-item-id='b'] .screen")!;
    focused.focus();
    expect(document.activeElement).toBe(focused);
    await deck.wrapper.setProps({ items: pick("a", "c"), activeId: "c" });
    await nextTick();
    expect(document.activeElement).toBe(deck.root);
    expect(deck.view.reconciling).toBe(true);
    expect(
      [...deck.root.querySelectorAll("[data-snap-motion-stacked-deck-card]")].every(
        (card) => card.getAttribute("data-deck-interactive") === "false",
      ),
    ).toBe(true);
    await settle(deck);
    expect(deck.view.reconciling).toBe(false);
    expect(
      deck.root.querySelector("[data-item-id='c']")!.getAttribute("data-deck-interactive"),
    ).toBe("true");
    expect(activations).toEqual([]);
    deck.wrapper.unmount();
  });
});

describe("Stacked Deck compositor promotion", () => {
  for (const exchange of ["shuffle", "direct"] as const) {
    it(`${exchange}: does not change any card's promotion on the frame the deck comes to rest`, async () => {
      const deck = mountDeck(pick("a", "b", "c", "d", "e"), { exchange });
      await settle(deck);
      expect(read(deck.root, 0).bodies.filter((body) => body.willChange !== "auto")).toEqual([]);
      const frames: RenderedFrame[] = [read(deck.root, 0)];
      deck.view.next();
      await nextTick();
      for (let index = 0; index < 200 && deck.root.dataset.phase !== "idle"; index += 1) {
        await deck.clock.step();
        frames.push(read(deck.root, index + 1));
      }
      for (let index = 0; index < 5; index += 1) {
        await deck.clock.step();
        frames.push(read(deck.root, frames.length));
      }
      // A card is promoted from the frame it begins to move, and only cards this exchange moves.
      for (const frame of frames) {
        expect(promoted(frame).every((id) => id === "c" || id === "d")).toBe(true);
      }
      const paired = frames.findIndex((frame) => promoted(frame).length === 2);
      expect(paired).toBeGreaterThan(0);
      // Once the exchange has named its pair, promotion never changes again: not mid-flight, and
      // not on the frame it settles, nor after it.
      for (const frame of frames.slice(paired)) expect(promoted(frame)).toEqual(["c", "d"]);
      // The next transaction takes promotion over on the frame it begins to move a new card.
      deck.view.next();
      await nextTick();
      const handover: { promoted: string[]; phase: string | undefined }[] = [];
      for (let index = 0; index < 8; index += 1) {
        await deck.clock.step();
        handover.push({ promoted: promoted(read(deck.root, 0)), phase: deck.root.dataset.phase });
      }
      expect(handover.every((frame) => frame.promoted.length <= 2)).toBe(true);
      const handedOver = handover.find((frame) => frame.promoted.join() === "d,e");
      expect(handedOver?.phase).toBe("settling");
      await settle(deck);
      deck.wrapper.unmount();
    });
  }
});

function pointer(type: string, clientX: number) {
  return new PointerEvent(type, {
    bubbles: true,
    buttons: type === "pointerdown" || type === "pointermove" ? 1 : 0,
    cancelable: true,
    clientX,
    clientY: 0,
    isPrimary: true,
    pointerId: 7,
    pointerType: "mouse",
  });
}
