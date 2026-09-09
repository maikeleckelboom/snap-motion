import { mount } from "@vue/test-utils";
import { expect, it, vi } from "vitest";
import { h, nextTick } from "vue";

import StackedDeck from "../src/stacked-deck/components/StackedDeck.vue";
import type { StackedDeckHandle } from "../src/stacked-deck/use-stacked-deck-motion";

const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
const TypedStackedDeck = StackedDeck<(typeof items)[number]>;

function pointer(type: string, clientX: number) {
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    buttons: type === "pointerup" ? 0 : 1,
    clientX,
    pointerId: 11,
    pointerType: "mouse",
    isPrimary: true,
  });
}

it("withholds inspection of the current card while its committed shell is still landing", async () => {
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
  const wrapper = mount(TypedStackedDeck, {
    props: { items, exchange: "direct", reducedMotionOverride: true },
    slots: {
      card: ({ item, inspectable }) => h("div", { "data-inspectable": inspectable }, item.id),
    },
    attachTo: document.body,
  });
  const deck = wrapper.vm as unknown as StackedDeckHandle<string>;
  const stage = wrapper.get(".snap-motion-stacked-deck").element as HTMLElement;
  stage.setPointerCapture = () => {};
  stage.releasePointerCapture = () => {};
  try {
    await nextTick();
    wrapper.get('[data-item-id="b"]').element.dispatchEvent(pointer("pointerdown", 0));
    window.dispatchEvent(pointer("pointermove", -deck.pitch * 1.1));
    await nextTick();
    window.dispatchEvent(pointer("pointerup", -deck.pitch * 1.1));
    await nextTick();
    expect(deck.settledId).toBe("c");

    expect(deck.previous()).toBe(true);
    await nextTick();
    expect(deck.settledId).toBe("b");
    const card = wrapper.get('[data-item-id="b"]');
    expect(card.attributes("data-deck-interactive")).toBe("false");
    expect(card.attributes("aria-hidden")).toBe("true");
    expect(deck.isInspectEligible(1)).toBe(false);
    expect(card.get("[data-inspectable]").attributes("data-inspectable")).toBe("false");

    for (let frame = 0; frame < 30 && !deck.isInspectEligible(1); frame += 1) {
      now += 16;
      const pending = callbacks;
      callbacks = new Map();
      for (const callback of pending.values()) callback(now);
      await nextTick();
    }
    expect(wrapper.get('[data-item-id="b"]').element).toBe(card.element);
    expect(card.attributes("data-deck-interactive")).toBe("true");
    expect(deck.isInspectEligible(1)).toBe(true);
    expect(card.get("[data-inspectable]").attributes("data-inspectable")).toBe("true");
  } finally {
    wrapper.unmount();
  }
});
