import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { h, nextTick } from "vue";

import StackedDeck from "../src/stacked-deck/components/StackedDeck.vue";
import type { StackedDeckCardState } from "../src/stacked-deck/stacked-deck-contracts";

const screens = [
  { id: "overview", title: "Overview" },
  { id: "system", title: "System" },
  { id: "outcome", title: "Outcome" },
] as const;

type ScreenId = (typeof screens)[number]["id"];
type Screen = (typeof screens)[number];

/** Instantiating the generic component up front is what lets the harness keep the item type. */
const TypedStackedDeck = StackedDeck<Screen>;

interface DeckInstance {
  activeId: ScreenId | undefined;
  canNext: boolean;
  canPrevious: boolean;
  visualId: ScreenId | undefined;
  isInspectEligible: (index: number) => boolean;
  next: () => boolean;
  previous: () => boolean;
  navigateTo: (id: ScreenId) => boolean;
  settledId: ScreenId | undefined;
  synchronizeTo: (id: ScreenId, announce?: boolean) => boolean;
}

function pointerDrag(type: string, clientX: number) {
  return new PointerEvent(type, {
    bubbles: true,
    buttons: type === "pointerdown" || type === "pointermove" ? 1 : 0,
    cancelable: true,
    clientX,
    isPrimary: true,
    pointerId: 1,
    pointerType: "mouse",
  });
}

function mountDeck(props: Record<string, unknown> = {}) {
  return mount(TypedStackedDeck, {
    props: {
      items: screens,
      itemLabel: (item: Screen) => item.title,
      label: "Project screens",
      reducedMotionOverride: true,
      ...props,
    },
    slots: {
      card: (card: StackedDeckCardState<Screen, ScreenId>) =>
        h("div", { class: "screen", "data-screen-role": card.role }, card.item.title),
    },
  });
}

describe("StackedDeck", () => {
  it("renders one accessible card per item and starts on the middle screen", async () => {
    const wrapper = mountDeck();
    await nextTick();

    const root = wrapper.get(".snap-motion-stacked-deck");
    const cards = wrapper.findAll(".snap-motion-stacked-deck-card");
    expect(cards).toHaveLength(screens.length);
    expect(root.attributes("aria-roledescription")).toBe("carousel");
    expect(root.attributes("aria-label")).toBe("Project screens");
    expect(root.attributes("data-active-id")).toBe("system");
    expect(root.attributes("data-settled-id")).toBe("system");
    expect(root.attributes("data-phase")).toBe("idle");
    expect(cards[1]!.attributes("aria-current")).toBe("true");
    expect(cards[1]!.attributes("aria-label")).toBe("System, 2 of 3");
    expect(cards[0]!.attributes("aria-hidden")).toBe("true");
    // Every item owns one persistent shell; only the current card participates in semantics.
    expect(cards[1]!.attributes("data-deck-visible")).toBe("true");
    expect(cards[1]!.attributes("data-deck-role")).toBe("top");
    expect(wrapper.html()).not.toContain("clip-path");
    expect(
      wrapper
        .findAll(".snap-motion-stacked-deck-card")
        .every((card) => card.find(".snap-motion-stacked-deck-card-motion").exists()),
    ).toBe(true);
    wrapper.unmount();
  });

  it("keeps omitted exchange byte-for-byte equivalent to explicit Shuffle", async () => {
    async function sample(exchange?: "shuffle") {
      const wrapper = mountDeck(exchange === undefined ? {} : { exchange });
      await nextTick();
      const deck = wrapper.vm as unknown as DeckInstance & {
        frame: unknown;
        pitch: number;
      };
      const stage = wrapper.get(".snap-motion-stacked-deck").element as HTMLElement;
      stage.setPointerCapture = () => {};
      stage.releasePointerCapture = () => {};
      const frames = [JSON.stringify(deck.frame)];

      stage.dispatchEvent(pointerDrag("pointerdown", 0));
      window.dispatchEvent(pointerDrag("pointermove", -deck.pitch * 0.62));
      await nextTick();
      frames.push(JSON.stringify(deck.frame));
      window.dispatchEvent(pointerDrag("pointerup", -deck.pitch * 0.62));
      await nextTick();
      frames.push(JSON.stringify(deck.frame));
      wrapper.unmount();
      return frames;
    }

    expect(await sample()).toEqual(await sample("shuffle"));
  });

  it("keeps one physical shell per item through direction changes", async () => {
    const wrapper = mountDeck({ reducedMotionOverride: false });
    await nextTick();
    const deck = wrapper.vm as unknown as DeckInstance & { pitch: number };
    const stage = wrapper.get(".snap-motion-stacked-deck").element as HTMLElement;
    stage.setPointerCapture = () => {};
    stage.releasePointerCapture = () => {};
    const physicalShells = new Map(
      wrapper
        .findAll(".snap-motion-stacked-deck-card")
        .map((card) => [
          card.attributes("data-item-id"),
          card.get(".snap-motion-stacked-deck-card-motion").element,
        ]),
    );

    stage.dispatchEvent(pointerDrag("pointerdown", 0));
    await nextTick();
    for (const progress of [0.002, 0.02, 0.05, 0, -0.002, -0.02, -0.05, 0, 0.02, -0.02, 0.02]) {
      window.dispatchEvent(pointerDrag("pointermove", -deck.pitch * progress));
      await nextTick();
      const cards = wrapper.findAll(".snap-motion-stacked-deck-card");
      for (const card of cards) {
        const id = card.attributes("data-item-id")!;
        expect(card.get(".snap-motion-stacked-deck-card-motion").element).toBe(
          physicalShells.get(id),
        );
      }
      const exchangeCards = cards.filter((card) =>
        ["top", "target"].includes(card.attributes("data-deck-role") ?? ""),
      );
      expect(
        exchangeCards.every(
          (card) =>
            card.attributes("data-deck-visible") === "true" &&
            card.attributes("style")?.includes("opacity: 1"),
        ),
      ).toBe(true);
    }

    window.dispatchEvent(pointerDrag("pointercancel", 0));
    await nextTick();
    wrapper.unmount();
  });

  it("keeps controlled semantics authoritative when a navigation request is ignored", async () => {
    const wrapper = mountDeck({ activeId: "system" });
    await nextTick();
    const deck = wrapper.vm as unknown as DeckInstance;

    expect(deck.next()).toBe(true);
    await Promise.resolve();
    await nextTick();

    expect(wrapper.emitted("activeIdRequest")).toEqual([["outcome", { reason: "next" }]]);
    expect(wrapper.emitted("settled")).toBeUndefined();
    expect(deck.activeId).toBe("system");
    expect(deck.settledId).toBe("system");
    expect(wrapper.get('[data-testid="snap-motion-stacked-deck-status"]').text()).toBe("");
    expect(deck.synchronizeTo("outcome")).toBe(false);
    wrapper.unmount();
  });

  it("lets external authority replace a pending request after an accepted destination", async () => {
    let acceptedFirstRequest = false;
    let wrapper: ReturnType<typeof mountDeck>;
    wrapper = mountDeck({
      activeId: "overview",
      "onUpdate:activeId": (id: ScreenId) => {
        if (!acceptedFirstRequest && id === "system") {
          acceptedFirstRequest = true;
          void wrapper.setProps({ activeId: "system" });
        } else if (id === "outcome") {
          void wrapper.setProps({ activeId: "overview" });
        }
      },
    });
    await nextTick();
    const deck = wrapper.vm as unknown as DeckInstance;

    expect(deck.next()).toBe(true);
    await Promise.resolve();
    await nextTick();
    expect(deck.settledId).toBe("system");

    expect(deck.next()).toBe(true);
    await Promise.resolve();
    await nextTick();
    await Promise.resolve();
    await nextTick();

    expect(deck.activeId).toBe("overview");
    expect(deck.visualId).toBe("overview");
    expect(deck.settledId).toBe("overview");
    expect(wrapper.emitted("settled") ?? []).not.toContainEqual(["outcome", { reason: "next" }]);
    expect(wrapper.get('[data-testid="snap-motion-stacked-deck-status"]').text()).not.toContain(
      "Outcome",
    );
    wrapper.unmount();
  });

  it("rolls back to a valid deck anchor while controlled authority is unavailable", async () => {
    const wrapper = mountDeck({ activeId: "future" });
    await nextTick();
    const deck = wrapper.vm as unknown as DeckInstance;

    expect(deck.next()).toBe(true);
    await Promise.resolve();
    await nextTick();
    expect(deck.next()).toBe(true);
    await Promise.resolve();
    await nextTick();

    expect(wrapper.emitted("activeIdRequest")).toEqual([
      ["outcome", { reason: "next" }],
      ["outcome", { reason: "next" }],
    ]);
    expect(wrapper.emitted("settled")).toBeUndefined();
    expect((deck as unknown as { activeId: string }).activeId).toBe("future");
    expect(deck.settledId).toBe("system");
    expect(wrapper.get('[data-testid="snap-motion-stacked-deck-status"]').text()).toBe("");
    wrapper.unmount();
  });

  it("bounds explicit compositor hints to the exchanging pair in a larger deck", async () => {
    const items = Array.from({ length: 40 }, (_unused, index) => ({
      id: `screen-${index}`,
      title: `Screen ${index}`,
    }));
    const LargeStackedDeck = StackedDeck<(typeof items)[number]>;
    const wrapper = mount(LargeStackedDeck, {
      props: { items, reducedMotionOverride: false },
      slots: { card: ({ item }) => h("div", { class: "screen" }, item.title) },
    });
    await nextTick();
    const deck = wrapper.vm as unknown as { pitch: number };
    const stage = wrapper.get(".snap-motion-stacked-deck").element as HTMLElement;
    stage.setPointerCapture = () => {};
    stage.releasePointerCapture = () => {};
    const promotedCount = () =>
      wrapper
        .findAll(".snap-motion-stacked-deck-card-motion")
        .filter((card) => card.attributes("style")?.includes("will-change: transform")).length;

    expect(wrapper.findAll(".snap-motion-stacked-deck-card")).toHaveLength(items.length);
    expect(wrapper.findAll(".screen")).toHaveLength(items.length);
    expect(promotedCount()).toBe(0);
    stage.dispatchEvent(pointerDrag("pointerdown", 0));
    window.dispatchEvent(pointerDrag("pointermove", -deck.pitch * 0.25));
    await nextTick();
    expect(promotedCount()).toBe(2);

    window.dispatchEvent(pointerDrag("pointercancel", 0));
    await nextTick();
    wrapper.unmount();
  });

  it("keeps Direct collection replacement valid during owned movement", async () => {
    const wrapper = mountDeck({ exchange: "direct", reducedMotionOverride: false });
    await nextTick();
    const deck = wrapper.vm as unknown as DeckInstance & { pitch: number };
    const stage = wrapper.get(".snap-motion-stacked-deck").element as HTMLElement;
    stage.setPointerCapture = () => {};
    stage.releasePointerCapture = () => {};
    const origin = wrapper.get("[data-item-id='system']").element as HTMLElement;

    origin.dispatchEvent(pointerDrag("pointerdown", 0));
    window.dispatchEvent(pointerDrag("pointermove", -deck.pitch * 0.4));
    // Raw Direct publication intentionally waits one microtask so touch ownership resolves first.
    await Promise.resolve();
    await nextTick();
    expect(wrapper.get(".snap-motion-stacked-deck").attributes("data-owned")).toBe("true");
    expect(wrapper.get("[data-item-id='system']").attributes("data-deck-role")).toBe("top");

    await expect(wrapper.setProps({ items: [screens[0], screens[1]] })).resolves.toBeUndefined();
    await nextTick();
    expect(
      wrapper
        .findAll(".snap-motion-stacked-deck-card")
        .map((card) => card.attributes("data-item-id")),
    ).toEqual(["overview", "system"]);
    expect(["overview", "system"]).toContain(deck.visualId);

    const reorderedOrigin = wrapper.get("[data-item-id='system']").element as HTMLElement;
    reorderedOrigin.dispatchEvent(pointerDrag("pointerdown", 0));
    window.dispatchEvent(pointerDrag("pointermove", deck.pitch * 0.35));
    await Promise.resolve();
    await nextTick();
    await expect(wrapper.setProps({ items: [screens[2], screens[0]] })).resolves.toBeUndefined();
    await nextTick();
    expect(
      wrapper
        .findAll(".snap-motion-stacked-deck-card")
        .map((card) => card.attributes("data-item-id")),
    ).toEqual(["outcome", "overview"]);
    expect(["outcome", "overview"]).toContain(deck.visualId);
    expect(
      wrapper
        .findAll(".snap-motion-stacked-deck-card")
        .every((card) => card.attributes("style")?.includes("opacity: 1")),
    ).toBe(true);
    wrapper.unmount();
  });

  it("bounds Direct compositor hints in a 40-card deck", async () => {
    const items = Array.from({ length: 40 }, (_unused, index) => ({
      id: `screen-${index}`,
      title: `Screen ${index}`,
    }));
    const LargeStackedDeck = StackedDeck<(typeof items)[number]>;
    const wrapper = mount(LargeStackedDeck, {
      props: { exchange: "direct", items, reducedMotionOverride: false },
      slots: { card: ({ item }) => h("div", { class: "screen" }, item.title) },
    });
    await nextTick();
    const deck = wrapper.vm as unknown as { pitch: number };
    const stage = wrapper.get(".snap-motion-stacked-deck").element as HTMLElement;
    stage.setPointerCapture = () => {};
    stage.releasePointerCapture = () => {};
    const origin = wrapper.get("[data-item-id='screen-20']").element as HTMLElement;

    origin.dispatchEvent(pointerDrag("pointerdown", 0));
    window.dispatchEvent(pointerDrag("pointermove", -deck.pitch * 0.35));
    await nextTick();
    const promoted = wrapper
      .findAll(".snap-motion-stacked-deck-card-motion")
      .filter((card) => card.attributes("style")?.includes("will-change: transform"));
    expect(promoted.length).toBeLessThanOrEqual(2);
    expect(wrapper.findAll(".snap-motion-stacked-deck-card")).toHaveLength(40);

    window.dispatchEvent(pointerDrag("pointercancel", -deck.pitch * 0.35));
    wrapper.unmount();
  });

  it("passes the consumer's own item through the card slot", async () => {
    const wrapper = mountDeck();
    await nextTick();
    expect(wrapper.findAll(".screen").map((screen) => screen.text())).toEqual([
      "Overview",
      "System",
      "Outcome",
    ]);
    wrapper.unmount();
  });

  it("publishes durable selection only once, and only on settlement", async () => {
    const wrapper = mountDeck();
    await nextTick();
    const deck = wrapper.vm as unknown as DeckInstance;

    expect(deck.next()).toBe(true);
    await nextTick();
    await nextTick();
    // Reduced motion rests synchronously; publication waits one Vue flush for controlled authority.
    expect(deck.settledId).toBe("outcome");
    expect(wrapper.emitted("update:activeId")).toEqual([["outcome"]]);
    expect(wrapper.emitted("settled")).toEqual([["outcome", { reason: "next" }]]);
    expect(wrapper.get('[data-testid="snap-motion-stacked-deck-status"]').text()).toBe(
      "Outcome, 3 of 3",
    );
    expect(deck.canNext).toBe(false);
    expect(deck.canPrevious).toBe(true);
    expect(deck.next()).toBe(false);
    wrapper.unmount();
  });

  it("synchronizes a non-adjacent destination without announcing a traversal", async () => {
    const wrapper = mountDeck();
    await nextTick();
    const deck = wrapper.vm as unknown as DeckInstance;

    expect(deck.synchronizeTo("overview")).toBe(true);
    await nextTick();
    expect(deck.settledId).toBe("overview");
    expect(deck.visualId).toBe("overview");
    expect(wrapper.get('[data-testid="snap-motion-stacked-deck-status"]').text()).toBe("");
    wrapper.unmount();
  });

  it("refuses every input while disabled", async () => {
    const wrapper = mountDeck({ disabled: true });
    await nextTick();
    const deck = wrapper.vm as unknown as DeckInstance;

    expect(deck.next()).toBe(false);
    expect(deck.navigateTo("overview")).toBe(false);
    expect(deck.isInspectEligible(1)).toBe(false);
    expect(deck.settledId).toBe("system");
    wrapper.unmount();
  });

  it("follows a controlled active ID supplied by the consumer", async () => {
    const wrapper = mountDeck({ activeId: "overview" });
    await nextTick();
    const deck = wrapper.vm as unknown as DeckInstance;
    expect(deck.settledId).toBe("overview");

    await wrapper.setProps({ activeId: "outcome" });
    await nextTick();
    expect(deck.settledId).toBe("outcome");
    wrapper.unmount();
  });

  it("labels items by their semantic ID when no label accessor is supplied", async () => {
    const wrapper = mount(TypedStackedDeck, {
      props: { items: screens, reducedMotionOverride: true },
      slots: { card: () => h("div") },
    });
    await nextTick();
    expect(wrapper.findAll(".snap-motion-stacked-deck-card")[1]!.attributes("aria-label")).toBe(
      "system, 2 of 3",
    );
    wrapper.unmount();
  });
});
