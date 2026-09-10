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
  visualId: ScreenId | undefined;
  diagnostics: { phase: string; targetId: ScreenId | undefined };
  owned: boolean;
  physicalIndex: number;
  pitch: number;
  settledId: ScreenId | undefined;
  state: { traversal: { phase: string; segmentTargetIndex: number | null } };
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

describe("right-to-left agreement", () => {
  it("mirrors the pointer with the writing direction", async () => {
    const ltr = mountDeck();
    await nextTick();
    const ltrDeck = ltr.vm as unknown as DeckInstance;
    pressAndMove(ltr.element as HTMLElement, -200);
    await nextTick();
    expect(ltrDeck.physicalIndex).toBeGreaterThan(0);
    releaseAt(ltr.element as HTMLElement, -200);
    ltr.unmount();

    const rtl = mountDeck();
    await nextTick();
    const rtlDeck = rtl.vm as unknown as DeckInstance;
    (rtl.element as HTMLElement).style.direction = "rtl";
    pressAndMove(rtl.element as HTMLElement, -200);
    await nextTick();
    // The same physical movement resolves toward the other neighbour under RTL.
    expect(rtlDeck.physicalIndex).toBeLessThan(0);
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
    // This is a different control, not the compatibility click produced by the drag.
    const draggedClick = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      clientX: -240,
      detail: 1,
    });
    link.dispatchEvent(draggedClick);
    expect(draggedClick.defaultPrevented).toBe(false);

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
});

describe("gesture lifecycle ownership", () => {
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
