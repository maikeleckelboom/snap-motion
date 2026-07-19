import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";

import { useRemeasurement } from "../src/internal/layout/remeasurement";

describe("remeasurement lifecycle", () => {
  it("observes element, window, and visual viewport resize and cleans up", async () => {
    const measure = vi.fn<() => void>();
    const disconnect = vi.fn<ResizeObserver["disconnect"]>();
    const observe = vi.fn<ResizeObserver["observe"]>();
    let observerCallback: ResizeObserverCallback | undefined;
    class ResizeObserverMock {
      constructor(callback: ResizeObserverCallback) {
        observerCallback = callback;
      }
      disconnect = disconnect;
      observe = observe;
      unobserve = vi.fn<ResizeObserver["unobserve"]>();
    }

    const visualViewport = new EventTarget();
    Object.defineProperty(window, "ResizeObserver", {
      configurable: true,
      value: ResizeObserverMock,
    });
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: visualViewport,
    });

    const wrapper = mount(
      defineComponent({
        setup() {
          const target = ref<Element>();
          useRemeasurement({ target, measure });
          return () => h("div", { ref: target });
        },
      }),
    );
    await nextTick();

    expect(observe).toHaveBeenCalledWith(wrapper.element, {});
    expect(measure).toHaveBeenCalled();

    observerCallback?.([], {} as ResizeObserver);
    window.dispatchEvent(new Event("resize"));
    window.dispatchEvent(new Event("orientationchange"));
    visualViewport.dispatchEvent(new Event("resize"));
    expect(measure.mock.calls.length).toBeGreaterThanOrEqual(5);

    wrapper.unmount();
    const callsAfterUnmount = measure.mock.calls.length;
    window.dispatchEvent(new Event("resize"));
    window.dispatchEvent(new Event("orientationchange"));
    visualViewport.dispatchEvent(new Event("resize"));

    expect(disconnect).toHaveBeenCalled();
    expect(measure).toHaveBeenCalledTimes(callsAfterUnmount);
  });
});
