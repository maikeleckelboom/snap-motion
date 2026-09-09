import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { h, nextTick } from "vue";

import StackedDeck from "../src/stacked-deck/components/StackedDeck.vue";

const items = [{ id: "first" }, { id: "second" }, { id: "third" }];
const TypedStackedDeck = StackedDeck<(typeof items)[number]>;

afterEach(() => vi.restoreAllMocks());

describe("StackedDeck motion preference", () => {
  it.each(["shuffle", "direct"] as const)(
    "follows the system when the override is omitted and resumes it after an override (%s)",
    async (exchange) => {
      const listeners = new Set<EventListenerOrEventListenerObject>();
      let matches = true;
      vi.spyOn(window, "matchMedia").mockImplementation(
        (media) =>
          ({
            get matches() {
              return media === "(prefers-reduced-motion: reduce)" && matches;
            },
            media,
            onchange: null,
            addEventListener(_type: string, listener: EventListenerOrEventListenerObject) {
              if (media === "(prefers-reduced-motion: reduce)") listeners.add(listener);
            },
            removeEventListener(_type: string, listener: EventListenerOrEventListenerObject) {
              listeners.delete(listener);
            },
            addListener() {},
            removeListener() {},
            dispatchEvent: () => true,
          }) satisfies MediaQueryList,
      );
      function setPreference(value: boolean) {
        matches = value;
        const event = new Event("change");
        Object.defineProperty(event, "matches", { value });
        for (const listener of listeners) {
          if (typeof listener === "function") listener(event);
          else listener.handleEvent(event);
        }
      }

      // No override key at all: passing `undefined` would bypass Vue's Boolean casting.
      const wrapper = mount(TypedStackedDeck, {
        props: { exchange, items, label: "Chapters" },
        slots: { card: ({ item }: { item: (typeof items)[number] }) => h("p", item.id) },
      });
      await nextTick();
      const root = wrapper.get(".snap-motion-stacked-deck");
      expect(root.attributes("data-reduced-motion")).toBe("true");

      setPreference(false);
      await nextTick();
      expect(root.attributes("data-reduced-motion")).toBe("false");
      await wrapper.setProps({ reducedMotionOverride: true });
      expect(root.attributes("data-reduced-motion")).toBe("true");
      await wrapper.setProps({ reducedMotionOverride: false });
      setPreference(true);
      await nextTick();
      expect(root.attributes("data-reduced-motion")).toBe("false");
      await wrapper.setProps({ reducedMotionOverride: undefined });
      expect(root.attributes("data-reduced-motion")).toBe("true");

      wrapper.unmount();
      expect(listeners.size).toBe(0);
    },
  );
});
