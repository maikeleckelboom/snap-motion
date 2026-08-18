import { mount } from "@vue/test-utils";
import { describe, expect, expectTypeOf, it } from "vitest";
import { h, nextTick } from "vue";

import StackedDeck from "../src/stacked-deck/components/StackedDeck.vue";
import type {
  StackedDeckCardState,
  StackedDeckPileLayerSlotState,
} from "../src/stacked-deck/stacked-deck-contracts";

const screens = [
  { id: "overview", title: "Overview" },
  { id: "system", title: "System" },
  { id: "outcome", title: "Outcome" },
] as const;

type ScreenId = (typeof screens)[number]["id"];
type Screen = (typeof screens)[number];
type PileSlotState = StackedDeckPileLayerSlotState<Screen>;

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

/**
 * What each screen is currently drawn from: its own face, and the decorative material it is made of
 * while it waits in the deck. Those are different pictures — the deck renders them from different
 * slots — so which one an item uses is a visible property, and it must never change in one step.
 */
function readOpacity(style: string | undefined) {
  const opacity = /(?:^|[^-\w])opacity:\s*([\d.]+)/.exec(style ?? "")?.[1];
  return opacity === undefined ? 1 : Number(opacity);
}

function materialWeights(wrapper: ReturnType<typeof mountDeck>) {
  const weights: Record<string, { face: number; material: number }> = {};
  for (const card of wrapper.findAll(".snap-motion-stacked-deck-card")) {
    const id = card.attributes("data-item-id") ?? "";
    weights[id] ??= { face: 0, material: 0 };
    weights[id]!.face =
      card.attributes("data-deck-visible") === "true" ? readOpacity(card.attributes("style")) : 0;
  }
  for (const layer of wrapper.findAll(".snap-motion-stacked-deck-pile-layer")) {
    const id = layer.attributes("data-pile-item-id") ?? "";
    weights[id] ??= { face: 0, material: 0 };
    weights[id]!.material = readOpacity(layer.attributes("style"));
  }
  return weights;
}

type MaterialWeights = ReturnType<typeof materialWeights>;

/** Largest single-step change any screen makes in either of its representations. */
function largestMaterialStep(before: MaterialWeights, after: MaterialWeights) {
  let largest = { id: "", change: 0 };
  for (const id of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const was = before[id] ?? { face: 0, material: 0 };
    const now = after[id] ?? { face: 0, material: 0 };
    for (const key of ["face", "material"] as const) {
      const change = Math.abs(now[key] - was[key]);
      if (change > largest.change) largest = { id, change };
    }
  }
  return largest;
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
    // A swipe removes a card by thinning it out, never by cutting it, so nothing carries a clip.
    expect(wrapper.html()).not.toContain("clip-path");
    expect(
      wrapper
        .findAll(".snap-motion-stacked-deck-card")
        .every((card) => card.find(".snap-motion-stacked-deck-card-motion").exists()),
    ).toBe(true);
    wrapper.unmount();
  });

  it("never switches what a backing card is made of when a segment starts or turns", async () => {
    const wrapper = mountDeck({ reducedMotionOverride: false });
    await nextTick();
    const deck = wrapper.vm as unknown as DeckInstance & { pitch: number };
    const stage = wrapper.get(".snap-motion-stacked-deck").element as HTMLElement;
    stage.setPointerCapture = () => {};
    stage.releasePointerCapture = () => {};

    stage.dispatchEvent(pointerDrag("pointerdown", 0));
    await nextTick();
    let previous = materialWeights(wrapper);
    // At rest every screen is drawn entirely from one representation or the other.
    for (const weight of Object.values(previous)) {
      expect(Math.max(weight.face, weight.material)).toBeCloseTo(1, 5);
    }

    // The smallest nudges that produce a direction at all, each way, and then a hand shaking on
    // the boundary — which flips which neighbour is named the target on every crossing.
    for (const progress of [0.002, 0.02, 0.05, 0, -0.002, -0.02, -0.05, 0, 0.02, -0.02, 0.02]) {
      window.dispatchEvent(pointerDrag("pointermove", -deck.pitch * progress));
      await nextTick();
      const current = materialWeights(wrapper);
      const step = largestMaterialStep(previous, current);
      expect(step.change, `${step.id} changed representation at progress ${progress}`).toBeLessThan(
        0.1,
      );
      previous = current;
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

  it("keeps visually associated pile layers inert and outside slide semantics", async () => {
    const wrapper = mountDeck();
    await nextTick();

    const layers = wrapper.findAll(".snap-motion-stacked-deck-pile-layer");
    expect(layers).toHaveLength(screens.length - 1);
    for (const layer of layers) {
      expect(layer.attributes("aria-hidden")).toBe("true");
      expect(layer.element.hasAttribute("inert")).toBe(true);
      expect(layer.attributes("role")).toBeUndefined();
      expect(layer.attributes("tabindex")).toBeUndefined();
      expect(layer.text()).toBe("");
    }
    expect(layers.map((layer) => layer.attributes("data-pile-item-id"))).toEqual([
      "overview",
      "outcome",
    ]);
    expect(layers.map((layer) => layer.attributes("data-pile-item-index"))).toEqual(["0", "2"]);
    expect(new Set(layers.map((layer) => layer.attributes("data-pile-side")))).toEqual(
      new Set(["-1", "1"]),
    );
    expect(wrapper.findAll('[aria-roledescription="slide"]')).toHaveLength(screens.length);
    wrapper.unmount();
  });

  it("passes only item identity and pile placement to a decorative pile slot", async () => {
    expectTypeOf<PileSlotState["id"]>().toEqualTypeOf<ScreenId>();

    const wrapper = mount(TypedStackedDeck, {
      props: {
        items: screens,
        label: "Project screens",
        reducedMotionOverride: true,
      },
      slots: {
        card: () => h("div", { class: "screen" }),
        "pile-layer": (layer: PileSlotState) =>
          h(
            "button",
            {
              class: "pile-surface",
              "data-slot-id": layer.id,
              "data-slot-index": layer.index,
              "data-slot-item": layer.item.title,
              "data-slot-keys": Object.keys(layer).join(","),
              "data-slot-side": layer.side,
              "data-slot-slot": layer.slot,
            },
            layer.item.title,
          ),
      },
    });
    await nextTick();

    const surfaces = wrapper.findAll(".pile-surface");
    expect(surfaces.map((surface) => surface.attributes("data-slot-id"))).toEqual([
      "overview",
      "outcome",
    ]);
    expect(surfaces.map((surface) => surface.attributes("data-slot-index"))).toEqual(["0", "2"]);
    expect(surfaces.map((surface) => surface.attributes("data-slot-item"))).toEqual([
      "Overview",
      "Outcome",
    ]);
    expect(surfaces.map((surface) => surface.attributes("data-slot-side"))).toEqual(["-1", "1"]);
    expect(surfaces.map((surface) => surface.attributes("data-slot-slot"))).toEqual(["-1", "1"]);
    expect(
      new Set(
        surfaces.flatMap((surface) => (surface.attributes("data-slot-keys") ?? "").split(",")),
      ),
    ).toEqual(new Set(["id", "index", "item", "side", "slot"]));
    expect(
      surfaces.every(
        (surface) => (surface.attributes("data-slot-keys") ?? "").split(",").length === 5,
      ),
    ).toBe(true);
    expect(wrapper.findAll('[aria-roledescription="slide"]')).toHaveLength(screens.length);
    expect(surfaces.every((surface) => surface.element.closest("[inert]") !== null)).toBe(true);

    await wrapper.setProps({ items: [screens[2], screens[1], screens[0]] });
    await nextTick();
    expect(
      wrapper
        .findAll(".pile-surface")
        .map((surface) => [
          surface.attributes("data-slot-id"),
          surface.attributes("data-slot-index"),
          surface.attributes("data-slot-item"),
        ]),
    ).toEqual([
      ["outcome", "0", "Outcome"],
      ["overview", "2", "Overview"],
    ]);
    wrapper.unmount();
  });

  it("keeps pile slot item, id, and index coherent through collection reconfiguration", async () => {
    interface ReconfigurableScreen {
      readonly id: string;
      readonly title: string;
    }

    const collections: readonly (readonly ReconfigurableScreen[])[] = [
      [
        { id: "alpha", title: "Alpha" },
        { id: "beta", title: "Beta" },
        { id: "gamma", title: "Gamma" },
        { id: "delta", title: "Delta" },
      ],
      [
        { id: "alpha", title: "Alpha" },
        { id: "gamma", title: "Gamma" },
        { id: "delta", title: "Delta" },
      ],
      [
        { id: "alpha", title: "Alpha" },
        { id: "gamma", title: "Gamma" },
      ],
      [
        { id: "before", title: "Before" },
        { id: "alpha", title: "Alpha" },
        { id: "gamma", title: "Gamma" },
        { id: "after", title: "After" },
      ],
      [
        { id: "red", title: "Red" },
        { id: "green", title: "Green" },
        { id: "blue", title: "Blue" },
      ],
    ];
    const ReconfigurableStackedDeck = StackedDeck<ReconfigurableScreen>;
    const wrapper = mount(ReconfigurableStackedDeck, {
      props: { items: collections[0]!, reducedMotionOverride: true },
      slots: {
        card: () => h("div"),
        "pile-layer": (layer: StackedDeckPileLayerSlotState<ReconfigurableScreen>) =>
          h("div", {
            class: "pile-surface",
            "data-slot-id": layer.id,
            "data-slot-index": layer.index,
            "data-slot-item-id": layer.item.id,
          }),
      },
    });
    expect(wrapper.find(".snap-motion-stacked-deck").exists()).toBe(true);

    function expectCoherentPile(collection: readonly ReconfigurableScreen[]) {
      const surfaces = wrapper.findAll(".pile-surface");
      expect(surfaces).toHaveLength(Math.max(0, collection.length - 1));
      for (const surface of surfaces) {
        const id = surface.attributes("data-slot-id");
        const itemId = surface.attributes("data-slot-item-id");
        const index = Number(surface.attributes("data-slot-index"));
        expect(id).toBe(itemId);
        expect(collection[index]?.id).toBe(id);
      }
    }

    await nextTick();
    expectCoherentPile(collections[0]!);
    for (const collection of collections.slice(1)) {
      await wrapper.setProps({ items: collection });
      expectCoherentPile(collection);
    }
    wrapper.unmount();
  });

  it("updates pile identity after item reordering and controlled selection changes", async () => {
    const wrapper = mountDeck();
    await nextTick();
    const pileIds = () =>
      wrapper
        .findAll(".snap-motion-stacked-deck-pile-layer")
        .map((layer) => layer.attributes("data-pile-item-id"));

    await wrapper.setProps({ items: [screens[2], screens[1], screens[0]] });
    await nextTick();
    expect(pileIds()).toEqual(["outcome", "overview"]);

    await wrapper.setProps({ activeId: "overview" });
    await nextTick();
    expect(pileIds()).toEqual(["outcome", "system"]);

    await wrapper.setProps({ activeId: "outcome" });
    await nextTick();
    expect(pileIds()).toEqual(["system", "overview"]);
    wrapper.unmount();
  });

  it("keeps each visible pile node bound to its item while its physical slot changes", async () => {
    const wrapper = mountDeck();
    await nextTick();
    const outcomeLayer = wrapper.get('[data-pile-item-id="outcome"]').element;

    await wrapper.setProps({ activeId: "overview" });
    await nextTick();
    expect(wrapper.get('[data-pile-item-id="outcome"]').element).toBe(outcomeLayer);
    expect(wrapper.get('[data-pile-item-id="system"]').element).not.toBe(outcomeLayer);
    wrapper.unmount();
  });

  it("renders no pile identity for zero or one item and exactly one for two", async () => {
    const wrapper = mount(TypedStackedDeck, {
      props: { items: [screens[0]], reducedMotionOverride: true },
      slots: { card: () => h("div") },
    });
    await nextTick();
    expect(wrapper.findAll(".snap-motion-stacked-deck-pile-layer")).toHaveLength(0);

    await wrapper.setProps({ items: [] });
    await nextTick();
    expect(wrapper.findAll(".snap-motion-stacked-deck-pile-layer")).toHaveLength(0);

    await wrapper.setProps({ items: [screens[0], screens[1]] });
    await nextTick();
    const layers = wrapper.findAll(".snap-motion-stacked-deck-pile-layer");
    expect(layers).toHaveLength(1);
    expect(layers[0]!.attributes("data-pile-item-id")).toBe("system");
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
