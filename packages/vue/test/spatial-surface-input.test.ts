import {
  nonlinearElasticDistance,
  STACKED_DECK_INTERIOR_ELASTICITY,
  type ElasticBoundaryOptions,
} from "@snap-motion/core";
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { h, nextTick } from "vue";

import Coverflow from "../src/coverflow/components/Coverflow.vue";
import StackedDeck from "../src/stacked-deck/components/StackedDeck.vue";

const screens = [
  { id: "a", title: "Alpha" },
  { id: "b", title: "Bravo" },
  { id: "c", title: "Charlie" },
  { id: "d", title: "Delta" },
  { id: "e", title: "Echo" },
] as const;

type Screen = (typeof screens)[number];
type ScreenId = Screen["id"];

const TypedStackedDeck = StackedDeck<Screen>;
const TypedCoverflow = Coverflow<Screen>;

interface DeckInstance {
  canNext: boolean;
  canPrevious: boolean;
  currentId: ScreenId | undefined;
  diagnostics: { phase: string; targetId: ScreenId | undefined };
  owned: boolean;
  physicalIndex: number;
  pitch: number;
  settledId: ScreenId | undefined;
  state: { traversal: { phase: string; segmentTargetIndex: number | null } };
}

interface RailInstance {
  settledId: ScreenId | undefined;
  visualId: ScreenId | undefined;
}

function pointerEvent(type: string, init: PointerEventInit = {}) {
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    isPrimary: true,
    pointerId: 1,
    pointerType: "mouse",
    clientX: 0,
    clientY: 0,
    ...init,
  });
}

function keyEvent(key: string) {
  return new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key });
}

function wheelEvent(deltaX: number) {
  return new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaX, deltaY: 0 });
}

/** A drag that stays down, so the surface can be inspected mid-manipulation. */
function pressAndMove(element: HTMLElement, toX: number) {
  element.dispatchEvent(pointerEvent("pointerdown", { buttons: 1, clientX: 0 }));
  element.dispatchEvent(pointerEvent("pointermove", { buttons: 1, clientX: toX }));
}

function releaseAt(element: HTMLElement, atX: number) {
  element.dispatchEvent(pointerEvent("pointerup", { clientX: atX }));
}

/** Zero-config: the documented happy path, with no physics of the consumer's own anywhere. */
function mountDefaultDeck(props: Record<string, unknown> = {}) {
  return mount(TypedStackedDeck, {
    props: { items: screens, label: "Screens", ...props },
    slots: { card: () => h("div", { class: "screen" }) },
    attachTo: document.body,
  });
}

function mountDeck(props: Record<string, unknown> = {}) {
  return mountDefaultDeck({ reducedMotionOverride: true, ...props });
}

function mountRail(props: Record<string, unknown> = {}) {
  return mount(TypedCoverflow, {
    props: { items: screens, label: "Screens", reducedMotionOverride: true, ...props },
    slots: { card: () => h("div", { class: "screen" }) },
    attachTo: document.body,
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("stacked deck default physics", () => {
  it("resists travel past the adjacent screen instead of stopping dead at it", async () => {
    // No `elasticity`, no `spring`, no `releasePolicy`: exactly what the package documents.
    const wrapper = mountDefaultDeck();
    await nextTick();
    const deck = wrapper.vm as unknown as DeckInstance;
    const pitch = deck.pitch;
    const travel = pitch + 302;

    pressAndMove(wrapper.element as HTMLElement, -travel);
    await nextTick();

    // One whole pitch of travel exchanges exactly one screen...
    expect(deck.currentId).toBe("d");
    // ...and everything past it is bounded resistance, not free travel and not a wall.
    const boundary = STACKED_DECK_INTERIOR_ELASTICITY.min as ElasticBoundaryOptions;
    const resisted = nonlinearElasticDistance(302, boundary);
    expect(resisted).toBeLessThan(302);
    expect(deck.physicalIndex).toBeGreaterThan(3);
    expect(deck.physicalIndex).toBeCloseTo(3 + resisted / pitch, 5);
    expect(deck.physicalIndex).toBeLessThan(3 + boundary.maxDistance / pitch);

    // A single interaction never opens a second exchange, however far it is pushed.
    expect(deck.state.traversal.phase).toBe("elastic");
    expect(deck.state.traversal.segmentTargetIndex).toBeNull();

    releaseAt(wrapper.element as HTMLElement, -travel);
    wrapper.unmount();
  });

  it("keeps the one-card invariant when a consumer customizes the resistance", async () => {
    const wrapper = mountDefaultDeck({
      elasticity: {
        min: { resistance: 1.2, maxDistance: 200 },
        max: { resistance: 1.2, maxDistance: 200 },
      },
    });
    await nextTick();
    const deck = wrapper.vm as unknown as DeckInstance;
    const travel = deck.pitch + 302;

    pressAndMove(wrapper.element as HTMLElement, -travel);
    await nextTick();

    // A looser boundary travels further than the default, and still exchanges exactly one screen.
    const softer = nonlinearElasticDistance(302, { resistance: 1.2, maxDistance: 200 });
    expect(softer).toBeGreaterThan(
      nonlinearElasticDistance(302, STACKED_DECK_INTERIOR_ELASTICITY.min as ElasticBoundaryOptions),
    );
    expect(deck.physicalIndex).toBeCloseTo(3 + softer / deck.pitch, 5);
    expect(deck.currentId).toBe("d");
    expect(deck.state.traversal.segmentTargetIndex).toBeNull();

    releaseAt(wrapper.element as HTMLElement, -travel);
    wrapper.unmount();
  });
});

describe("right-to-left agreement", () => {
  it("mirrors deck arrow keys and leaves Home and End absolute", async () => {
    const wrapper = mountDeck();
    await nextTick();
    const deck = wrapper.vm as unknown as DeckInstance;
    const root = wrapper.element as HTMLElement;

    root.dispatchEvent(keyEvent("ArrowRight"));
    await nextTick();
    expect(deck.settledId).toBe("d");

    root.style.direction = "rtl";
    root.dispatchEvent(keyEvent("ArrowRight"));
    await nextTick();
    expect(deck.settledId).toBe("c");
    root.dispatchEvent(keyEvent("ArrowLeft"));
    await nextTick();
    expect(deck.settledId).toBe("d");

    root.dispatchEvent(keyEvent("Home"));
    await nextTick();
    expect(deck.settledId).toBe("a");
    root.dispatchEvent(keyEvent("End"));
    await nextTick();
    expect(deck.settledId).toBe("e");
    wrapper.unmount();
  });

  it("mirrors coverflow arrow keys on the same terms", async () => {
    const wrapper = mountRail();
    await nextTick();
    const rail = wrapper.vm as unknown as RailInstance;
    const root = wrapper.element as HTMLElement;

    root.dispatchEvent(keyEvent("ArrowLeft"));
    await nextTick();
    expect(rail.settledId).toBe("b");

    root.style.direction = "rtl";
    root.dispatchEvent(keyEvent("ArrowLeft"));
    await nextTick();
    expect(rail.settledId).toBe("c");

    root.dispatchEvent(keyEvent("Home"));
    await nextTick();
    expect(rail.settledId).toBe("a");
    wrapper.unmount();
  });

  it("mirrors the pointer with the writing direction", async () => {
    const ltr = mountDeck();
    await nextTick();
    const ltrDeck = ltr.vm as unknown as DeckInstance;
    pressAndMove(ltr.element as HTMLElement, -200);
    await nextTick();
    expect(ltrDeck.physicalIndex).toBeGreaterThan(2);
    releaseAt(ltr.element as HTMLElement, -200);
    ltr.unmount();

    const rtl = mountDeck();
    await nextTick();
    const rtlDeck = rtl.vm as unknown as DeckInstance;
    (rtl.element as HTMLElement).style.direction = "rtl";
    pressAndMove(rtl.element as HTMLElement, -200);
    await nextTick();
    // The same physical movement resolves toward the other neighbour under RTL.
    expect(rtlDeck.physicalIndex).toBeLessThan(2);
    releaseAt(rtl.element as HTMLElement, -200);
    rtl.unmount();
  });

  it("mirrors a stepped wheel notch with the writing direction", async () => {
    vi.useFakeTimers();
    const ltr = mountDeck();
    await nextTick();
    (ltr.element as HTMLElement).dispatchEvent(wheelEvent(200));
    vi.advanceTimersByTime(150);
    await nextTick();
    expect((ltr.vm as unknown as DeckInstance).settledId).toBe("d");
    ltr.unmount();

    const rtl = mountDeck();
    await nextTick();
    (rtl.element as HTMLElement).style.direction = "rtl";
    (rtl.element as HTMLElement).dispatchEvent(wheelEvent(200));
    vi.advanceTimersByTime(150);
    await nextTick();
    expect((rtl.vm as unknown as DeckInstance).settledId).toBe("b");
    rtl.unmount();
  });
});

describe("interactive descendant ownership", () => {
  function mountDeckWithControls() {
    return mount(TypedStackedDeck, {
      props: { items: screens, label: "Screens", reducedMotionOverride: true },
      slots: {
        card: () =>
          h("div", [
            h("a", { href: "#detail", class: "card-link" }, "Detail"),
            h("button", { class: "card-button", type: "button" }, "Act"),
            h("input", { class: "card-input", type: "text" }),
            h("div", { class: "card-ignored", "data-snap-motion-ignore-drag": "" }, "Handleless"),
          ]),
      },
      attachTo: document.body,
    });
  }

  it("leaves arrow keys to a control the consumer put inside a card", async () => {
    const wrapper = mountDeckWithControls();
    await nextTick();
    const deck = wrapper.vm as unknown as DeckInstance;

    for (const selector of [".card-link", ".card-button", ".card-input"]) {
      const event = keyEvent("ArrowRight");
      wrapper.get(selector).element.dispatchEvent(event);
      await nextTick();
      expect(event.defaultPrevented).toBe(false);
      expect(deck.settledId).toBe("c");
    }

    // The surface still owns arrow keys everywhere it legitimately does.
    const surfaceEvent = keyEvent("ArrowRight");
    (wrapper.element as HTMLElement).dispatchEvent(surfaceEvent);
    await nextTick();
    expect(surfaceEvent.defaultPrevented).toBe(true);
    expect(deck.settledId).toBe("d");
    wrapper.unmount();
  });

  it("never takes pointer ownership from a control or an opted-out descendant", async () => {
    const wrapper = mountDeckWithControls();
    await nextTick();
    const deck = wrapper.vm as unknown as DeckInstance;

    for (const selector of [".card-link", ".card-button", ".card-input", ".card-ignored"]) {
      const target = wrapper.get(selector).element as HTMLElement;
      target.dispatchEvent(pointerEvent("pointerdown", { buttons: 1, clientX: 0 }));
      await nextTick();
      expect(deck.owned).toBe(false);
      expect(deck.physicalIndex).toBeCloseTo(2, 6);
      target.dispatchEvent(pointerEvent("pointerup", { clientX: 0 }));
    }
    wrapper.unmount();
  });

  it("lets an ordinary click through, and cancels only the click a drag produced", async () => {
    const wrapper = mountDeckWithControls();
    await nextTick();
    const link = wrapper.get(".card-link").element as HTMLElement;

    const plainClick = new MouseEvent("click", { bubbles: true, cancelable: true });
    link.dispatchEvent(plainClick);
    expect(plainClick.defaultPrevented).toBe(false);

    const root = wrapper.element as HTMLElement;
    pressAndMove(root, -240);
    releaseAt(root, -240);
    const draggedClick = new MouseEvent("click", { bubbles: true, cancelable: true });
    link.dispatchEvent(draggedClick);
    expect(draggedClick.defaultPrevented).toBe(true);

    // Suppression is spent on exactly one click, never latched.
    const nextClick = new MouseEvent("click", { bubbles: true, cancelable: true });
    link.dispatchEvent(nextClick);
    expect(nextClick.defaultPrevented).toBe(false);
    wrapper.unmount();
  });
});

function deckHints(wrapper: ReturnType<typeof mountDeck>) {
  return wrapper
    .findAll(".snap-motion-stacked-deck-card-motion")
    .map((card) => (card.element as HTMLElement).style.willChange);
}

describe("compositor hinting", () => {
  it("hints only while the deck is actually moving", async () => {
    const wrapper = mountDeck();
    await nextTick();
    expect(new Set(deckHints(wrapper))).toEqual(new Set(["auto"]));

    const root = wrapper.element as HTMLElement;
    pressAndMove(root, -120);
    await nextTick();
    expect(deckHints(wrapper)).toContain("transform");

    releaseAt(root, -120);
    await nextTick();
    expect(new Set(deckHints(wrapper))).toEqual(new Set(["auto"]));
    wrapper.unmount();
  });

  it("hints only while the rail is actually moving", async () => {
    const wrapper = mountRail();
    await nextTick();
    const hints = () =>
      wrapper
        .findAll(".snap-motion-coverflow-card")
        .map((card) => (card.element as HTMLElement).style.willChange);
    expect(new Set(hints())).toEqual(new Set(["auto"]));

    const root = wrapper.element as HTMLElement;
    pressAndMove(root, -120);
    await nextTick();
    expect(hints()).toContain("transform");

    releaseAt(root, -120);
    await nextTick();
    expect(new Set(hints())).toEqual(new Set(["auto"]));
    wrapper.unmount();
  });
});

describe("gesture lifecycle ownership", () => {
  it("returns a deck to the card its interaction began on when pointer capture is lost", async () => {
    // Real motion, so the surface is still settling when the cancelled gesture is resolved — which
    // is the situation the restore exists for.
    const wrapper = mountDefaultDeck();
    await nextTick();
    const deck = wrapper.vm as unknown as DeckInstance;
    const root = wrapper.element as HTMLElement;

    pressAndMove(root, -300);
    root.dispatchEvent(pointerEvent("lostpointercapture", { clientX: -300 }));
    await Promise.resolve();
    await nextTick();

    expect(deck.owned).toBe(false);
    expect(deck.diagnostics.targetId).toBe("c");
    wrapper.unmount();
  });

  it("abandons a rail gesture when pointer capture is lost, rather than resolving it later", async () => {
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    const wrapper = mountRail();
    await nextTick();
    const root = wrapper.element as HTMLElement;
    const card = wrapper.findAll(".snap-motion-coverflow-card")[1]!.element as HTMLElement;

    card.dispatchEvent(pointerEvent("pointerdown", { buttons: 1 }));
    root.dispatchEvent(pointerEvent("lostpointercapture"));
    await Promise.resolve();
    card.dispatchEvent(pointerEvent("pointerup"));
    await Promise.resolve();

    // Without the binding the stale gesture would survive the lost capture and this release would
    // still be read as a selection, scheduling a deferred move.
    expect(frames).toHaveLength(0);
    expect((wrapper.vm as unknown as RailInstance).settledId).toBe("c");
    wrapper.unmount();
  });

  it("says nothing about a gesture whose surface was unmounted before it resolved", async () => {
    const wrapper = mountDeck();
    await nextTick();
    const root = wrapper.element as HTMLElement;

    pressAndMove(root, -300);
    releaseAt(root, -300);
    // The release resolves on a microtask; the surface disappears first.
    wrapper.unmount();
    await expect(Promise.resolve().then(() => nextTick())).resolves.not.toThrow();
  });

  it("cancels a rail's deferred selection frame when it unmounts", async () => {
    const frames: FrameRequestCallback[] = [];
    const cancelled: number[] = [];
    vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation((handle) => {
      cancelled.push(handle);
    });

    const wrapper = mountRail();
    await nextTick();
    const card = wrapper.findAll(".snap-motion-coverflow-card")[1]!.element as HTMLElement;

    card.dispatchEvent(pointerEvent("pointerdown", { buttons: 1 }));
    card.dispatchEvent(pointerEvent("pointerup"));
    await Promise.resolve();
    expect(frames).toHaveLength(1);

    wrapper.unmount();
    expect(cancelled).toEqual([1]);
  });
});
