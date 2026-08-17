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
  visualId: string | undefined;
  diagnostics: { pointerInteractionActive: boolean };
  next: () => boolean;
  previous: () => boolean;
  navigateTo: (id: string) => boolean;
  settledId: string | undefined;
  state: { settledIndex: number; currentIndex: number; commandOriginIndex: number };
  synchronizeTo: (id: string) => boolean;
}

interface RailInstance {
  canNext: boolean;
  canPrevious: boolean;
  next: () => boolean;
  navigateTo: (id: string) => boolean;
  settledId: string | undefined;
  state: { settledIndex: number; visualIndex: number; commandIndex: number };
  synchronizeTo: (id: string) => boolean;
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
    deck.navigateTo("a");
    await nextTick();

    expect(wrapper.emitted("activeIdRequest")).toEqual([
      ["d", { reason: "next" }],
      ["c", { reason: "previous" }],
      ["d", { reason: "keyboard" }],
      // An imperative request is not a person choosing a card. `picker` is reserved for that.
      ["a", { reason: "programmatic" }],
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

    expect(wrapper.emitted("activeIdRequest")).toEqual([["d", { reason: "drag" }]]);
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

    expect(wrapper.emitted("activeIdRequest")).toEqual([["d", { reason: "wheel" }]]);
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
    rail.navigateTo("e");
    await nextTick();

    expect(wrapper.emitted("activeIdRequest")).toEqual([
      ["d", { reason: "next" }],
      ["a", { reason: "keyboard" }],
      ["e", { reason: "programmatic" }],
    ]);
    wrapper.unmount();
  });

  it("reports a tap on a card as a picker", async () => {
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    const wrapper = mountRail();
    await nextTick();
    const card = wrapper.findAll(".snap-motion-coverflow-card")[1]!.element as HTMLElement;

    card.dispatchEvent(pointerEvent("pointerdown", { buttons: 1 }));
    card.dispatchEvent(pointerEvent("pointerup"));
    await Promise.resolve();
    frames.forEach((frame) => frame(0));
    await nextTick();

    expect(wrapper.emitted("activeIdRequest")).toEqual([["b", { reason: "picker" }]]);
    wrapper.unmount();
  });
});

describe("navigation reasons cannot be forged", () => {
  it("keeps an existing spring's reason when a press is refused by a nested control", async () => {
    const wrapper = mount(TypedStackedDeck, {
      props: {
        items: screens,
        label: "Screens",
        reducedMotionOverride: true,
      },
      slots: { card: () => h("button", { class: "card-button", type: "button" }, "Act") },
      attachTo: document.body,
    });
    await nextTick();
    const deck = wrapper.vm as unknown as DeckInstance;

    deck.next();
    // The press never becomes a drag: the button owns its own pointer. It is not evidence of one.
    const button = wrapper.get(".card-button").element as HTMLElement;
    button.dispatchEvent(pointerEvent("pointerdown", { buttons: 1 }));
    button.dispatchEvent(pointerEvent("pointerup"));
    await Promise.resolve();
    await nextTick();

    expect(wrapper.emitted("activeIdRequest")).toEqual([["d", { reason: "next" }]]);
    wrapper.unmount();
  });

  it("never lets a synchronization inherit whatever was in flight before it", async () => {
    const wrapper = mountDeck();
    await nextTick();
    const deck = wrapper.vm as unknown as DeckInstance;

    // Something the user did is in flight, and then authoritative state arrives.
    deck.next();
    expect(deck.synchronizeTo("a")).toBe(true);
    await nextTick();

    // Mechanical settlement is published by the adoption itself, without a live announcement.
    expect(wrapper.emitted("settled")).toEqual([["a", { reason: "external" }]]);
    expect(deck.settledId).toBe("a");
    // ...and it carries `external`, so it is never echoed back as a user request — least of all as
    // the `next` that the adoption interrupted.
    expect(wrapper.emitted("activeIdRequest")).toEqual([["d", { reason: "next" }]]);
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
      expect(card.attributes("data-semantic")).toBe(hidden ? "false" : "true");
    }
    expect(
      wrapper
        .findAll(".snap-motion-coverflow-card")
        .some(
          (card) =>
            card.attributes("data-visible") === "true" &&
            card.attributes("data-semantic") === "false",
        ),
    ).toBe(true);
    wrapper.unmount();
  });

  it.each([
    ["deck", TypedStackedDeck, ".snap-motion-stacked-deck-card"],
    ["coverflow", TypedCoverflow, ".snap-motion-coverflow-card"],
  ] as const)(
    "moves focus out of %s content before navigation makes that content inert",
    async (_name, component, cardSelector) => {
      const wrapper = mount(component, {
        attachTo: document.body,
        props: {
          items: screens,
          itemLabel: (item: Screen) => item.title,
          label: "Screens",
          reducedMotionOverride: true,
        },
        slots: {
          card: ({ item }: { item: Screen }) =>
            h("button", { class: `inspect-${item.id}`, type: "button" }, `Inspect ${item.title}`),
        },
      });
      await nextTick();
      const handle = wrapper.vm as unknown as DeckInstance | RailInstance;
      const root = wrapper.element as HTMLElement;
      const currentCard = wrapper.get(`${cardSelector}[aria-current='true']`);
      const inspect = currentCard.get("button").element as HTMLButtonElement;
      inspect.focus();
      expect(document.activeElement).toBe(inspect);

      expect(handle.next()).toBe(true);
      await nextTick();
      // Coverflow can keep the immediately adjacent card semantic while it remains a genuine
      // near-centre target. Moving once more proves the exact update where it leaves that set.
      expect(handle.next()).toBe(true);
      await nextTick();

      expect(currentCard.attributes()).toHaveProperty("inert");
      expect(document.activeElement).toBe(root);
      wrapper.unmount();
    },
  );
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
