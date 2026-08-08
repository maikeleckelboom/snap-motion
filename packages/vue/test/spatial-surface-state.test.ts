import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { h, nextTick } from "vue";

import Coverflow from "../src/coverflow/components/Coverflow.vue";
import StackedDeck from "../src/stacked-deck/components/StackedDeck.vue";

interface Screen {
  id: string;
  title: string;
}

const screens: Screen[] = [
  { id: "a", title: "Alpha" },
  { id: "b", title: "Bravo" },
  { id: "c", title: "Charlie" },
  { id: "d", title: "Delta" },
  { id: "e", title: "Echo" },
];

const TypedStackedDeck = StackedDeck<Screen>;
const TypedCoverflow = Coverflow<Screen>;

interface DeckInstance {
  canNext: boolean;
  canPrevious: boolean;
  currentId: string | undefined;
  next: (reason?: string) => boolean;
  previous: (reason?: string) => boolean;
  requestId: (id: string, reason?: string) => boolean;
  settledId: string | undefined;
  synchronizeId: (id: string, announce?: boolean) => boolean;
}

interface RailInstance {
  next: () => boolean;
  requestId: (id: string) => boolean;
  settledId: string | undefined;
  synchronizeId: (id: string, announce?: boolean) => boolean;
  visualId: string | undefined;
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

function mountDeck(props: Record<string, unknown> = {}) {
  return mount(TypedStackedDeck, {
    props: {
      items: screens,
      itemLabel: (item: Screen) => item.title,
      label: "Screens",
      reducedMotionOverride: true,
      ...props,
    },
    slots: { card: () => h("div", { class: "screen" }) },
    attachTo: document.body,
  });
}

function mountRail(props: Record<string, unknown> = {}) {
  return mount(TypedCoverflow, {
    props: {
      items: screens,
      itemLabel: (item: Screen) => item.title,
      label: "Screens",
      reducedMotionOverride: true,
      ...props,
    },
    slots: { card: () => h("div", { class: "screen" }) },
    attachTo: document.body,
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("item reconfiguration through the public component", () => {
  it("keeps the semantic screen across a same-length reorder", async () => {
    const wrapper = mountDeck();
    await nextTick();
    const deck = wrapper.vm as unknown as DeckInstance;
    expect(deck.settledId).toBe("c");

    await wrapper.setProps({ items: screens.toReversed() });
    await nextTick();

    expect(deck.settledId).toBe("c");
    expect(
      wrapper.findAll(".snap-motion-stacked-deck-card").map((c) => c.attributes("data-item-id")),
    ).toEqual(["e", "d", "c", "b", "a"]);
    // Indexes moved, identity did not: the card the deck names is still the one it named.
    expect(
      wrapper.get(".snap-motion-stacked-deck-card[aria-current='true']").attributes("data-item-id"),
    ).toBe("c");
    wrapper.unmount();
  });

  it("resizes its frame storage when items are added and removed", async () => {
    const wrapper = mountDeck();
    await nextTick();
    const deck = wrapper.vm as unknown as DeckInstance;

    await wrapper.setProps({ items: [{ id: "z", title: "Zero" }, ...screens] });
    await nextTick();
    expect(wrapper.findAll(".snap-motion-stacked-deck-card")).toHaveLength(6);
    expect(deck.settledId).toBe("c");

    await wrapper.setProps({ items: screens.slice(2, 4) });
    await nextTick();
    expect(wrapper.findAll(".snap-motion-stacked-deck-card")).toHaveLength(2);
    expect(deck.settledId).toBe("c");
    expect(deck.canPrevious).toBe(false);
    expect(deck.canNext).toBe(true);
    wrapper.unmount();
  });

  it("holds an ordinal place when the current screen is replaced outright", async () => {
    const wrapper = mountDeck();
    await nextTick();
    const deck = wrapper.vm as unknown as DeckInstance;

    await wrapper.setProps({
      items: [
        { id: "p", title: "P" },
        { id: "q", title: "Q" },
      ],
    });
    await nextTick();
    // "c" is gone and index 2 no longer exists, so the deck stands on the last item it has.
    expect(deck.settledId).toBe("q");
    wrapper.unmount();
  });

  it("survives emptying and repopulating without a range error", async () => {
    const wrapper = mountDeck();
    await nextTick();
    const deck = wrapper.vm as unknown as DeckInstance;

    await wrapper.setProps({ items: [] });
    await nextTick();
    expect(wrapper.findAll(".snap-motion-stacked-deck-card")).toHaveLength(0);
    expect(deck.canNext).toBe(false);
    expect(deck.canPrevious).toBe(false);

    await wrapper.setProps({ items: screens.slice(0, 3) });
    await nextTick();
    expect(wrapper.findAll(".snap-motion-stacked-deck-card")).toHaveLength(3);
    expect(deck.settledId).toBe("a");
    expect(deck.next()).toBe(true);
    await nextTick();
    expect(deck.settledId).toBe("b");
    wrapper.unmount();
  });

  it("keeps the rail's semantic card across reorder and removal", async () => {
    const wrapper = mountRail();
    await nextTick();
    const rail = wrapper.vm as unknown as RailInstance;
    expect(rail.settledId).toBe("c");

    await wrapper.setProps({ items: screens.toReversed() });
    await nextTick();
    expect(rail.settledId).toBe("c");
    expect(rail.visualId).toBe("c");

    await wrapper.setProps({ items: [screens[2]!, screens[0]!] });
    await nextTick();
    expect(rail.settledId).toBe("c");
    expect(rail.requestId("a")).toBe(true);
    await nextTick();
    expect(rail.settledId).toBe("a");
    wrapper.unmount();
  });
});

describe("unknown semantic identifiers", () => {
  it("never resolves an unknown deck ID to the first card", async () => {
    const wrapper = mountDeck();
    await nextTick();
    const deck = wrapper.vm as unknown as DeckInstance;

    expect(deck.requestId("nope")).toBe(false);
    expect(deck.synchronizeId("nope")).toBe(false);
    await nextTick();
    expect(deck.settledId).toBe("c");
    expect(deck.currentId).toBe("c");
    expect(wrapper.emitted("update:activeId")).toBeUndefined();
    wrapper.unmount();
  });

  it("never resolves an unknown rail ID to the first card", async () => {
    const wrapper = mountRail();
    await nextTick();
    const rail = wrapper.vm as unknown as RailInstance;

    expect(rail.requestId("nope")).toBe(false);
    expect(rail.synchronizeId("nope")).toBe(false);
    await nextTick();
    expect(rail.settledId).toBe("c");
    expect(rail.visualId).toBe("c");
    wrapper.unmount();
  });

  it("ignores a controlled ID the collection does not contain", async () => {
    const wrapper = mountDeck({ activeId: "c" });
    await nextTick();
    const deck = wrapper.vm as unknown as DeckInstance;

    await wrapper.setProps({ activeId: "nope" });
    await nextTick();
    expect(deck.settledId).toBe("c");
    wrapper.unmount();
  });
});

describe("controlled selection is not user input", () => {
  it("applies a controlled change while the surface is refusing input", async () => {
    const wrapper = mountDeck({ activeId: "c", disabled: true });
    await nextTick();
    const deck = wrapper.vm as unknown as DeckInstance;

    // A user command is still refused while disabled...
    expect(deck.next()).toBe(false);
    expect(deck.requestId("a")).toBe(false);

    // ...and the application's own state is not a user command.
    await wrapper.setProps({ activeId: "e" });
    await nextTick();
    expect(deck.settledId).toBe("e");
    expect(deck.currentId).toBe("e");
    wrapper.unmount();
  });

  it("applies a controlled change while an input device holds the surface", async () => {
    const wrapper = mountDeck({ activeId: "c" });
    await nextTick();
    const deck = wrapper.vm as unknown as DeckInstance;
    const root = wrapper.element as HTMLElement;

    root.dispatchEvent(pointerEvent("pointerdown", { buttons: 1, clientX: 0 }));
    root.dispatchEvent(pointerEvent("pointermove", { buttons: 1, clientX: -200 }));
    await nextTick();

    await wrapper.setProps({ activeId: "a" });
    await nextTick();
    expect(deck.settledId).toBe("a");

    root.dispatchEvent(pointerEvent("pointerup", { clientX: -200 }));
    wrapper.unmount();
  });

  it("applies a controlled change to the rail while it is refusing input", async () => {
    const wrapper = mountRail({ activeId: "c", disabled: true });
    await nextTick();
    const rail = wrapper.vm as unknown as RailInstance;

    expect(rail.next()).toBe(false);
    await wrapper.setProps({ activeId: "a" });
    await nextTick();
    expect(rail.settledId).toBe("a");
    wrapper.unmount();
  });

  it("never echoes a controlled change back as a user request", async () => {
    const wrapper = mountDeck({ activeId: "c" });
    await nextTick();

    await wrapper.setProps({ activeId: "d" });
    await nextTick();
    await wrapper.setProps({ activeId: "a" });
    await nextTick();

    expect((wrapper.vm as unknown as DeckInstance).settledId).toBe("a");
    expect(wrapper.emitted("requestActiveId")).toBeUndefined();
    expect(wrapper.emitted("update:activeId")).toBeUndefined();
    wrapper.unmount();
  });
});

describe("navigation reasons tell the truth", () => {
  it("reports the exact reason for each way a deck can be moved", async () => {
    const wrapper = mountDeck();
    await nextTick();
    const deck = wrapper.vm as unknown as DeckInstance;

    deck.next();
    await nextTick();
    deck.previous();
    await nextTick();
    (wrapper.element as HTMLElement).dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "ArrowRight" }),
    );
    await nextTick();
    deck.requestId("a");
    await nextTick();

    expect(wrapper.emitted("requestActiveId")).toEqual([
      ["d", "next"],
      ["c", "previous"],
      ["d", "keyboard"],
      ["a", "picker"],
    ]);
    wrapper.unmount();
  });

  it("reports a drag as a drag", async () => {
    const wrapper = mountDeck();
    await nextTick();
    const root = wrapper.element as HTMLElement;

    root.dispatchEvent(pointerEvent("pointerdown", { buttons: 1, clientX: 0 }));
    root.dispatchEvent(pointerEvent("pointermove", { buttons: 1, clientX: -400 }));
    root.dispatchEvent(pointerEvent("pointerup", { clientX: -400 }));
    await nextTick();

    expect(wrapper.emitted("requestActiveId")).toEqual([["d", "drag"]]);
    wrapper.unmount();
  });

  it("reports a wheel burst as a wheel", async () => {
    vi.useFakeTimers();
    const wrapper = mountDeck();
    await nextTick();

    (wrapper.element as HTMLElement).dispatchEvent(
      new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaX: 200, deltaY: 0 }),
    );
    vi.advanceTimersByTime(150);
    await nextTick();

    expect(wrapper.emitted("requestActiveId")).toEqual([["d", "wheel"]]);
    wrapper.unmount();
  });

  it("reports the exact reason for each way a rail can be moved", async () => {
    const wrapper = mountRail();
    await nextTick();
    const rail = wrapper.vm as unknown as RailInstance;

    rail.next();
    await nextTick();
    (wrapper.element as HTMLElement).dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Home" }),
    );
    await nextTick();
    rail.requestId("e");
    await nextTick();

    expect(wrapper.emitted("requestActiveId")).toEqual([
      ["d", "next"],
      ["a", "keyboard"],
      ["e", "picker"],
    ]);
    wrapper.unmount();
  });
});

describe("accessible structure", () => {
  it("gives the deck a role its carousel role description is valid on", async () => {
    const wrapper = mountDeck();
    await nextTick();
    const root = wrapper.get(".snap-motion-stacked-deck");

    expect(root.element.tagName).toBe("DIV");
    expect(root.attributes("role")).toBe("group");
    expect(root.attributes("aria-roledescription")).toBe("carousel");
    expect(root.attributes("aria-label")).toBe("Screens");
    wrapper.unmount();
  });

  it("publishes a landmark only when a consumer asks for one", async () => {
    const wrapper = mountDeck({ landmark: true });
    await nextTick();
    const root = wrapper.get(".snap-motion-stacked-deck");

    expect(root.element.tagName).toBe("SECTION");
    expect(root.attributes("role")).toBe("region");
    expect(root.attributes("aria-label")).toBe("Screens");
    wrapper.unmount();
  });

  it("gives the rail the same root contract", async () => {
    const plain = mountRail();
    await nextTick();
    expect(plain.get(".snap-motion-coverflow").attributes("role")).toBe("group");
    expect(plain.get(".snap-motion-coverflow").attributes("aria-roledescription")).toBe("carousel");
    plain.unmount();

    const landmark = mountRail({ landmark: true });
    await nextTick();
    expect(landmark.get(".snap-motion-coverflow").element.tagName).toBe("SECTION");
    expect(landmark.get(".snap-motion-coverflow").attributes("role")).toBe("region");
    landmark.unmount();
  });

  it("makes every card a labelled slide", async () => {
    const wrapper = mountDeck();
    await nextTick();
    const cards = wrapper.findAll(".snap-motion-stacked-deck-card");

    for (const card of cards) {
      expect(card.attributes("role")).toBe("group");
      expect(card.attributes("aria-roledescription")).toBe("slide");
      expect(card.attributes("data-snap-motion-item")).toBeDefined();
    }
    expect(cards[2]!.attributes("aria-label")).toBe("Charlie, 3 of 5");
    wrapper.unmount();
  });

  it("keeps hidden deck cards out of the tab order as well as out of the tree", async () => {
    const wrapper = mount(TypedStackedDeck, {
      props: { items: screens, label: "Screens", reducedMotionOverride: true },
      slots: { card: () => h("button", { class: "card-button", type: "button" }, "Act") },
      attachTo: document.body,
    });
    await nextTick();
    const cards = wrapper.findAll(".snap-motion-stacked-deck-card");

    for (const [index, card] of cards.entries()) {
      const hidden = card.attributes("aria-hidden") === "true";
      // Inertness and AT-hiddenness are the same claim, so they are never allowed to disagree.
      expect(card.attributes("inert") !== undefined).toBe(hidden);
      expect(hidden).toBe(index !== 2);
    }
    wrapper.unmount();
  });

  it("keeps hidden rail cards out of the tab order as well as out of the tree", async () => {
    const wrapper = mountRail();
    await nextTick();

    for (const card of wrapper.findAll(".snap-motion-coverflow-card")) {
      const hidden = card.attributes("aria-hidden") === "true";
      expect(card.attributes("inert") !== undefined).toBe(hidden);
      expect(card.attributes("data-visible")).toBe(hidden ? "false" : "true");
    }
    wrapper.unmount();
  });
});

describe("the public handle is a product surface", () => {
  it("offers no controller a consumer could navigate around the model with", async () => {
    const deck = mountDeck();
    await nextTick();
    const deckHandle = deck.vm as unknown as Record<string, unknown>;
    expect(deckHandle.motion).toBeUndefined();
    expect(deckHandle.model).toBeUndefined();
    expect(deckHandle.requestIndex).toBeUndefined();
    expect(deckHandle.synchronizeIndex).toBeUndefined();
    // What it does offer is read-only telemetry.
    expect(deckHandle.diagnostics).toMatchObject({ phase: "idle", reducedMotion: true });
    deck.unmount();

    const rail = mountRail();
    await nextTick();
    const railHandle = rail.vm as unknown as Record<string, unknown>;
    expect(railHandle.motion).toBeUndefined();
    expect(railHandle.model).toBeUndefined();
    expect(railHandle.diagnostics).toMatchObject({ phase: "idle" });
    rail.unmount();
  });
});
