import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { h, nextTick } from "vue";

import Coverflow from "../src/coverflow/components/Coverflow.vue";
import type { CoverflowHandle } from "../src/coverflow/use-coverflow-motion";
import * as boundedSpring from "../src/motion/bounded-spring-driver";
import { ManualAnimationDriver } from "./manual-driver";

const items = [{ id: "first" }, { id: "second" }, { id: "third" }];
const TypedCoverflow = Coverflow<(typeof items)[number]>;

function systemPreference(initial: boolean) {
  let matches = initial;
  const listeners = new Set<EventListenerOrEventListenerObject>();
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
  return {
    listeners,
    set(value: boolean) {
      matches = value;
      const event = new Event("change");
      Object.defineProperty(event, "matches", { value });
      for (const listener of listeners) {
        if (typeof listener === "function") listener(event);
        else listener.handleEvent(event);
      }
    },
  };
}

function mountRail(override: "omitted" | boolean = "omitted") {
  const driver = new ManualAnimationDriver();
  vi.spyOn(boundedSpring, "useBoundedSpringDriver").mockReturnValue(driver);
  const wrapper = mount(TypedCoverflow, {
    props: {
      items,
      label: "Cases",
      // An absent key exercises Boolean casting; explicit undefined does not.
      ...(override === "omitted" ? {} : { reducedMotionOverride: override }),
    },
    slots: { card: ({ item }: { item: (typeof items)[number] }) => h("p", item.id) },
  });
  return { driver, wrapper, rail: wrapper.vm as unknown as CoverflowHandle<string> };
}

afterEach(() => vi.restoreAllMocks());

describe("Coverflow component motion preference", () => {
  it.each([
    [false, "omitted", false],
    [true, "omitted", true],
    [false, true, true],
    [true, true, true],
    [false, false, false],
    [true, false, false],
  ] as const)(
    "navigates with system=%s override=%s resolved=%s",
    async (system, override, reduced) => {
      const preference = systemPreference(system);
      const { driver, wrapper, rail } = mountRail(override);
      try {
        await nextTick();
        expect(rail.diagnostics.reducedMotion).toBe(reduced);
        expect(rail.next()).toBe(true);
        await nextTick();
        await nextTick();
        expect(driver.animations).toHaveLength(reduced ? 0 : 1);
        expect(rail.diagnostics.phase).toBe(reduced ? "idle" : "settling");
        expect(rail.settledId).toBe(reduced ? "third" : "second");
        expect(wrapper.emitted("settled")).toEqual(
          reduced ? [["third", { reason: "next" }]] : undefined,
        );
      } finally {
        wrapper.unmount();
      }
      expect(preference.listeners.size).toBe(0);
    },
  );

  it("finishes an active target on system reduction and preserves explicit override ownership", async () => {
    const preference = systemPreference(false);
    const { driver, wrapper, rail } = mountRail();
    try {
      await nextTick();
      expect(rail.next()).toBe(true);
      const animation = driver.latest!;
      animation.update((animation.request.from + animation.request.to) / 2, 100);
      preference.set(true);
      await nextTick();
      await nextTick();
      expect(animation.stopped).toBe(true);
      expect(rail.diagnostics.reducedMotion).toBe(true);
      expect(rail.diagnostics.phase).toBe("idle");
      expect(rail.settledId).toBe("third");
      animation.complete();
      await nextTick();
      expect(wrapper.emitted("settled")).toEqual([["third", { reason: "next" }]]);

      await wrapper.setProps({ reducedMotionOverride: false });
      expect(rail.diagnostics.reducedMotion).toBe(false);
      await wrapper.setProps({ reducedMotionOverride: true });
      preference.set(false);
      await nextTick();
      expect(rail.diagnostics.reducedMotion).toBe(true);
      await wrapper.setProps({ reducedMotionOverride: undefined });
      expect(rail.diagnostics.reducedMotion).toBe(false);
      preference.set(true);
      await nextTick();
      expect(rail.diagnostics.reducedMotion).toBe(true);
      expect(driver.animations).toHaveLength(1);
    } finally {
      wrapper.unmount();
    }
    expect(preference.listeners.size).toBe(0);
  });
});
