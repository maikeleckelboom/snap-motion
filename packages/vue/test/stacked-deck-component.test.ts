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
  canNext: boolean;
  canPrevious: boolean;
  currentId: ScreenId | undefined;
  isInspectEligible: (index: number) => boolean;
  next: () => boolean;
  previous: () => boolean;
  requestId: (id: ScreenId) => boolean;
  settledId: ScreenId | undefined;
  synchronizeId: (id: ScreenId, announce?: boolean) => boolean;
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
    // Only the current card is drawn at rest; the rest of the deck is depth, not content.
    expect(cards[1]!.attributes("data-deck-visible")).toBe("true");
    expect(cards[0]!.attributes("data-deck-visible")).toBe("false");
    expect(cards[1]!.attributes("data-deck-role")).toBe("top");
    wrapper.unmount();
  });

  it("draws the deck's remaining thickness as inert layers that carry no identity", async () => {
    const wrapper = mountDeck();
    await nextTick();

    const layers = wrapper.findAll(".snap-motion-stacked-deck-pile-layer");
    expect(layers).toHaveLength(screens.length - 1);
    for (const layer of layers) {
      expect(layer.attributes("aria-hidden")).toBe("true");
      expect(layer.text()).toBe("");
    }
    expect(new Set(layers.map((layer) => layer.attributes("data-pile-side")))).toEqual(
      new Set(["-1", "1"]),
    );
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
    // Reduced motion completes the settle synchronously, so this is the settled result.
    expect(deck.settledId).toBe("outcome");
    expect(wrapper.emitted("update:activeId")).toEqual([["outcome"]]);
    expect(wrapper.emitted("settled")).toEqual([["outcome"]]);
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

    expect(deck.synchronizeId("overview")).toBe(true);
    await nextTick();
    expect(deck.settledId).toBe("overview");
    expect(deck.currentId).toBe("overview");
    expect(wrapper.get('[data-testid="snap-motion-stacked-deck-status"]').text()).toBe("");
    wrapper.unmount();
  });

  it("refuses every input while disabled", async () => {
    const wrapper = mountDeck({ disabled: true });
    await nextTick();
    const deck = wrapper.vm as unknown as DeckInstance;

    expect(deck.next()).toBe(false);
    expect(deck.requestId("overview")).toBe(false);
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
