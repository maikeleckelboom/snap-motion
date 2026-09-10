import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { h, nextTick } from "vue";

import * as motionDriver from "../src/motion/motion-driver";
import Sheet from "../src/sheet/components/Sheet.vue";
import type { SheetDiagnostics } from "../src/sheet/sheetDiagnostics";
import { ManualAnimationDriver } from "./manual-driver";

interface SheetInstance {
  diagnostics: SheetDiagnostics;
  navigateTo: (id: string) => boolean;
}

function systemMotionPreference(initial: boolean) {
  const listeners = new Set<EventListenerOrEventListenerObject>();
  let matches = initial;
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

function mountSheet(override: "omitted" | boolean = "omitted") {
  const driver = new ManualAnimationDriver();
  vi.spyOn(motionDriver, "createMotionDriver").mockReturnValue(driver);
  const wrapper = mount(Sheet, {
    props: {
      open: true,
      side: "top",
      snapPoints: [
        { id: "menu", label: "Menu", resolveVisibleExtent: () => 320 },
        { id: "expanded", label: "Expanded", resolveVisibleExtent: () => 560 },
      ],
      // An absent key exercises Vue's Boolean prop casting, unlike an explicit undefined value.
      ...(override === "omitted" ? {} : { reducedMotionOverride: override }),
    },
    slots: { title: () => "Menu", default: () => h("button", "Navigation") },
    attachTo: document.body,
  });
  const sheet = wrapper.vm as unknown as SheetInstance;
  return { driver, sheet, wrapper };
}

afterEach(() => vi.restoreAllMocks());

describe("Sheet component motion preference", () => {
  it.each([
    [false, "omitted", false],
    [true, "omitted", true],
    [false, true, true],
    [true, true, true],
    [false, false, false],
    [true, false, false],
  ] as const)(
    "opens with system=%s override=%s resolved=%s at the real component boundary",
    async (system, override, reduced) => {
      const preference = systemMotionPreference(system);
      const { driver, sheet, wrapper } = mountSheet(override);
      try {
        await nextTick();
        await nextTick();

        expect(sheet.diagnostics.reducedMotion).toBe(reduced);
        expect(sheet.diagnostics.sheetState).toBe(reduced ? "open" : "opening");
        expect(sheet.diagnostics.isAnimating).toBe(!reduced);
        expect(driver.animations).toHaveLength(reduced ? 0 : 1);
        expect(wrapper.emitted("opened")).toEqual([[]]);
        expect(document.activeElement).toBe(wrapper.get(".snap-motion-sheet-title").element);
      } finally {
        wrapper.unmount();
      }
      expect(preference.listeners.size).toBe(0);
    },
  );

  it("follows changes while open, honors explicit overrides, and resumes system ownership", async () => {
    const preference = systemMotionPreference(true);
    const { driver, sheet, wrapper } = mountSheet();
    try {
      await nextTick();
      await nextTick();
      expect(sheet.diagnostics.reducedMotion).toBe(true);
      expect(sheet.diagnostics.sheetState).toBe("open");
      const position = sheet.diagnostics.position;

      preference.set(false);
      await nextTick();
      expect(sheet.diagnostics.reducedMotion).toBe(false);
      expect(sheet.diagnostics.position).toBe(position);
      expect(driver.animations).toHaveLength(0);

      await wrapper.setProps({ reducedMotionOverride: true });
      preference.set(true);
      await nextTick();
      preference.set(false);
      await nextTick();
      expect(sheet.diagnostics.reducedMotion).toBe(true);

      await wrapper.setProps({ reducedMotionOverride: false });
      preference.set(true);
      await nextTick();
      expect(sheet.diagnostics.reducedMotion).toBe(false);
      await wrapper.setProps({ reducedMotionOverride: undefined });
      expect(sheet.diagnostics.reducedMotion).toBe(true);
      expect(sheet.diagnostics.position).toBe(position);
      expect(driver.animations).toHaveLength(0);
      expect(wrapper.emitted("opened")).toEqual([[]]);
      expect(wrapper.emitted("closed")).toBeUndefined();
    } finally {
      wrapper.unmount();
    }
    expect(preference.listeners.size).toBe(0);
  });

  it("finishes the current opening and closing target when system reduction changes during motion", async () => {
    const preference = systemMotionPreference(false);
    const { driver, sheet, wrapper } = mountSheet();
    try {
      await nextTick();
      await nextTick();
      const opening = driver.latest!;
      opening.update((opening.request.from + opening.request.to) / 2, -100);
      expect(sheet.diagnostics.sheetState).toBe("opening");
      expect(sheet.diagnostics.isAnimating).toBe(true);

      preference.set(true);
      await nextTick();
      expect(opening.stopped).toBe(true);
      expect(sheet.diagnostics.reducedMotion).toBe(true);
      expect(sheet.diagnostics.sheetState).toBe("open");
      expect(sheet.diagnostics.isAnimating).toBe(false);
      expect(sheet.diagnostics.position).toBe(opening.request.to);
      opening.complete();
      expect(wrapper.emitted("opened")).toEqual([[]]);

      preference.set(false);
      await nextTick();
      await wrapper.setProps({ open: false });
      const closing = driver.latest!;
      expect(closing).not.toBe(opening);
      closing.update((closing.request.from + closing.request.to) / 2, 100);
      expect(sheet.diagnostics.sheetState).toBe("closing");

      preference.set(true);
      await nextTick();
      await nextTick();
      expect(closing.stopped).toBe(true);
      expect(sheet.diagnostics.sheetState).toBe("closed");
      expect(sheet.diagnostics.isAnimating).toBe(false);
      expect(sheet.diagnostics.position).toBe(closing.request.to);
      expect(wrapper.get("dialog").attributes("open")).toBeUndefined();
      expect(wrapper.emitted("closed")).toEqual([[]]);
      closing.complete();
      await nextTick();
      expect(wrapper.emitted("closed")).toEqual([[]]);
      expect(wrapper.emitted("openRequest")).toBeUndefined();
    } finally {
      wrapper.unmount();
    }
    expect(preference.listeners.size).toBe(0);
  });

  it("settles the same accepted open snap once when system reduction interrupts snap motion", async () => {
    const preference = systemMotionPreference(true);
    const { driver, sheet, wrapper } = mountSheet();
    try {
      await nextTick();
      await nextTick();
      expect(sheet.diagnostics.reducedMotion).toBe(true);
      preference.set(false);
      await nextTick();
      expect(sheet.navigateTo("expanded")).toBe(true);
      const moving = driver.latest!;
      moving.update((moving.request.from + moving.request.to) / 2, -100);
      expect(sheet.diagnostics.sheetState).toBe("settling");

      preference.set(true);
      await nextTick();
      await nextTick();
      expect(moving.stopped).toBe(true);
      expect(sheet.diagnostics.sheetState).toBe("open");
      expect(sheet.diagnostics.targetId).toBe("expanded");
      expect(sheet.diagnostics.position).toBe(moving.request.to);
      expect(wrapper.emitted("settled")).toEqual([["expanded", { reason: "programmatic" }]]);
      moving.complete();
      await nextTick();
      expect(wrapper.emitted("settled")).toEqual([["expanded", { reason: "programmatic" }]]);
      expect(wrapper.emitted("opened")).toEqual([[]]);
    } finally {
      wrapper.unmount();
    }
    expect(preference.listeners.size).toBe(0);
  });
});
