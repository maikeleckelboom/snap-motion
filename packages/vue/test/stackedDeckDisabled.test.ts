import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { h, nextTick } from "vue";

import StackedDeck from "../src/stacked-deck/components/StackedDeck.vue";
import type {
  StackedDeckDirectDebug,
  StackedDeckHandle,
} from "../src/stacked-deck/use-stacked-deck-motion";

const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
const TypedStackedDeck = StackedDeck<(typeof items)[number]>;

function pointer(type: string, clientX: number, pointerType = "mouse") {
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    buttons: type === "pointerup" ? 0 : 1,
    clientX,
    isPrimary: true,
    pointerId: 57,
    pointerType,
  });
}

function mountDeck(exchange: "shuffle" | "direct", reducedMotionOverride = true) {
  const wrapper = mount(TypedStackedDeck, {
    props: { items, exchange, label: "Disabled lifecycle", reducedMotionOverride },
    slots: { card: ({ item }) => h("div", item.id) },
    attachTo: document.body,
  });
  const deck = wrapper.vm as unknown as StackedDeckHandle<string>;
  const stage = wrapper.get(".snap-motion-stacked-deck").element as HTMLElement;
  stage.setPointerCapture = () => {};
  stage.releasePointerCapture = () => {};
  const card = wrapper.get('[data-item-id="b"]').element;
  return { wrapper, deck, stage, card };
}

function frameClock() {
  let now = 0;
  let handle = 0;
  let callbacks = new Map<number, FrameRequestCallback>();
  vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((callback) => {
    callbacks.set(++handle, callback);
    return handle;
  });
  vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation((id) => {
    callbacks.delete(id);
  });
  vi.spyOn(performance, "now").mockImplementation(() => now);
  return async () => {
    now += 16;
    const pending = callbacks;
    callbacks = new Map();
    for (const callback of pending.values()) callback(now);
    await nextTick();
  };
}

afterEach(() => vi.useRealTimers());

describe.each(["shuffle", "direct"] as const)("StackedDeck %s disabled lifecycle", (exchange) => {
  it("returns an owned gesture on its physical path with ordinary motion", async () => {
    const step = frameClock();
    const { wrapper, deck, card } = mountDeck(exchange, false);
    try {
      await nextTick();
      card.dispatchEvent(pointer("pointerdown", 0));
      window.dispatchEvent(pointer("pointermove", -deck.pitch * 0.7));
      await nextTick();
      await nextTick();
      const releasedX = deck.frame.poses[1]!.translateX;
      await wrapper.setProps({ disabled: true });
      expect(deck.owned).toBe(false);
      expect(deck.frame.poses[1]!.translateX).toBe(releasedX);

      for (let frame = 0; frame < 120 && deck.diagnostics.phase !== "idle"; frame += 1) {
        await step();
      }
      expect(deck.diagnostics.phase).toBe("idle");
      expect(deck.settledId).toBe("b");
      expect(deck.frame.poses[1]!.translateX).toBe(0);
      expect(wrapper.emitted("activeIdRequest")).toBeUndefined();
      expect(wrapper.emitted("settled")).toBeUndefined();
    } finally {
      wrapper.unmount();
    }
  });

  it.each(["mouse", "touch"])(
    "returns an owned %s gesture and rejects its later release",
    async (pointerType) => {
      const { wrapper, deck, card } = mountDeck(exchange);
      try {
        await nextTick();
        card.dispatchEvent(pointer("pointerdown", 0, pointerType));
        window.dispatchEvent(pointer("pointermove", -deck.pitch * 0.7, pointerType));
        await nextTick();
        expect(deck.owned).toBe(true);

        await wrapper.setProps({ disabled: true });
        expect(deck.owned).toBe(false);
        expect(deck.diagnostics.pointerInteractionActive).toBe(false);
        expect(deck.settledId).toBe("b");
        const disabledFrame = JSON.stringify(deck.frame);

        window.dispatchEvent(pointer("pointermove", -deck.pitch * 1.2, pointerType));
        window.dispatchEvent(pointer("pointerup", -deck.pitch * 1.2, pointerType));
        await nextTick();
        expect(JSON.stringify(deck.frame)).toBe(disabledFrame);
        expect(wrapper.emitted("activeIdRequest")).toBeUndefined();
        expect(wrapper.emitted("settled")).toBeUndefined();

        await wrapper.setProps({ disabled: false });
        expect(deck.next()).toBe(true);
        await nextTick();
        expect(deck.settledId).toBe("c");
      } finally {
        wrapper.unmount();
      }
    },
  );

  it("abandons pending touch recognition before later movement can acquire ownership", async () => {
    const { wrapper, deck, card } = mountDeck(exchange);
    try {
      await nextTick();
      card.dispatchEvent(pointer("pointerdown", 0, "touch"));
      await nextTick();
      expect(deck.diagnostics.pointerInteractionActive).toBe(true);
      expect(deck.owned).toBe(false);
      await wrapper.setProps({ disabled: true });
      expect(deck.diagnostics.pointerInteractionActive).toBe(false);

      window.dispatchEvent(pointer("pointermove", -deck.pitch, "touch"));
      window.dispatchEvent(pointer("pointerup", -deck.pitch, "touch"));
      await nextTick();
      expect(deck.owned).toBe(false);
      expect(deck.settledId).toBe("b");
      expect(wrapper.emitted("activeIdRequest")).toBeUndefined();
    } finally {
      wrapper.unmount();
    }
  });

  it("preserves accepted navigation when disabled during unowned touch recognition", async () => {
    const step = frameClock();
    const { wrapper, deck } = mountDeck(exchange, false);
    try {
      await nextTick();
      expect(deck.next()).toBe(true);
      for (
        let frame = 0;
        frame < 120 &&
        (exchange === "direct"
          ? deck.frame.poses[2]?.interactive !== true
          : deck.physicalIndex === 0);
        frame += 1
      ) {
        await step();
      }
      expect(deck.diagnostics.phase).toBe("settling");
      wrapper
        .get(exchange === "direct" ? '[data-item-id="c"]' : ".snap-motion-stacked-deck")
        .element.dispatchEvent(pointer("pointerdown", 0, "touch"));
      await nextTick();
      expect(deck.diagnostics.pointerInteractionActive).toBe(true);
      expect(deck.owned).toBe(false);
      const { position } = deck.diagnostics;
      await wrapper.setProps({ disabled: true });
      expect(deck.diagnostics.pointerInteractionActive).toBe(false);
      expect(deck.diagnostics.position).toBe(position);
      expect(deck.diagnostics.targetId).toBe("c");

      for (let frame = 0; frame < 120 && deck.diagnostics.phase !== "idle"; frame += 1)
        await step();
      expect(deck.settledId).toBe("c");
      expect(wrapper.emitted("activeIdRequest")).toEqual([["c", { reason: "next" }]]);
    } finally {
      wrapper.unmount();
    }
  });

  it("cancels an owned wheel burst and its delayed destination", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { wrapper, deck, stage } = mountDeck(exchange);
    try {
      await nextTick();
      stage.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaX: 90 }));
      await nextTick();
      expect(deck.owned).toBe(true);
      await wrapper.setProps({ disabled: true });
      expect(deck.owned).toBe(false);
      await vi.advanceTimersByTimeAsync(100);
      await nextTick();
      expect(deck.settledId).toBe("b");
      expect(wrapper.emitted("activeIdRequest")).toBeUndefined();
      expect(wrapper.emitted("settled")).toBeUndefined();

      await wrapper.setProps({ disabled: false });
      stage.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaX: 90 }));
      await vi.advanceTimersByTimeAsync(100);
      await nextTick();
      expect(deck.settledId).toBe("c");
    } finally {
      wrapper.unmount();
    }
  });
});

it("preserves an independent committed Direct landing while disabling a newer held gesture", async () => {
  const step = frameClock();
  const { wrapper, deck, card, stage } = mountDeck("direct");
  try {
    await nextTick();
    const debug = (stage as HTMLElement & { snapMotionDirectDebug: StackedDeckDirectDebug })
      .snapMotionDirectDebug;
    card.dispatchEvent(pointer("pointerdown", 0));
    window.dispatchEvent(pointer("pointermove", -deck.pitch * 1.1));
    await nextTick();
    window.dispatchEvent(pointer("pointerup", -deck.pitch * 1.1));
    await nextTick();
    expect(deck.settledId).toBe("c");

    wrapper.get('[data-item-id="c"]').element.dispatchEvent(pointer("pointerdown", 0));
    window.dispatchEvent(pointer("pointermove", -deck.pitch * 0.3));
    await nextTick();
    const landing = debug.landings?.[0];
    expect(landing?.itemIndex).toBe(1);
    expect(deck.owned).toBe(true);
    await wrapper.setProps({ disabled: true });
    expect(deck.owned).toBe(false);
    expect(deck.settledId).toBe("c");
    expect(debug.landings?.[0]).toBe(landing);
    expect(wrapper.get('[data-item-id="b"]').attributes("data-deck-interactive")).toBe("false");

    for (let frame = 0; frame < 30 && debug.landings!.length > 0; frame += 1) await step();
    expect(debug.landings).toHaveLength(0);
    expect(wrapper.emitted("activeIdRequest")).toEqual([["c", { reason: "drag" }]]);
  } finally {
    wrapper.unmount();
  }
});
