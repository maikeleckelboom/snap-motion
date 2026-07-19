import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";

import { useHorizontalWheel } from "../src/carousel/carousel-wheel";

afterEach(() => {
  vi.useRealTimers();
});

describe("horizontal wheel binding", () => {
  it("settles after horizontal input and ignores ordinary vertical scroll", () => {
    vi.useFakeTimers();
    const onDelta = vi.fn<(delta: number, event: WheelEvent) => void>();
    const onSettle = vi.fn<() => void>();
    const wrapper = mount(
      defineComponent({
        setup() {
          const wheel = useHorizontalWheel({
            pageSize: () => 800,
            settleDelay: 90,
            onDelta,
            onSettle,
          });
          return () => h("div", { onWheel: wheel.onWheel }, [h("textarea", { id: "owner" })]);
        },
      }),
    );

    wrapper.element.dispatchEvent(
      new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaX: 20, deltaY: 2 }),
    );
    wrapper.element.dispatchEvent(
      new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaX: 2, deltaY: 20 }),
    );
    wrapper
      .get("#owner")
      .element.dispatchEvent(
        new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaX: 20 }),
      );
    const prevented = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaX: 20 });
    prevented.preventDefault();
    wrapper.element.dispatchEvent(prevented);

    expect(onDelta).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(90);
    expect(onSettle).toHaveBeenCalledOnce();
  });

  it("cancels a pending settle on unmount", () => {
    vi.useFakeTimers();
    const onSettle = vi.fn<() => void>();
    const wrapper = mount(
      defineComponent({
        setup() {
          const wheel = useHorizontalWheel({
            pageSize: () => 800,
            onDelta: vi.fn<(delta: number, event: WheelEvent) => void>(),
            onSettle,
          });
          return () => h("div", { onWheel: wheel.onWheel });
        },
      }),
    );

    wrapper.element.dispatchEvent(
      new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaX: 20 }),
    );
    wrapper.unmount();
    vi.runAllTimers();

    expect(onSettle).not.toHaveBeenCalled();
  });

  it("clears its active state when a wheel gesture is stopped", () => {
    vi.useFakeTimers();
    let wheel: ReturnType<typeof useHorizontalWheel> | undefined;
    const wrapper = mount(
      defineComponent({
        setup() {
          wheel = useHorizontalWheel({
            pageSize: () => 800,
            onDelta: vi.fn<(delta: number, event: WheelEvent) => void>(),
            onSettle: vi.fn<() => void>(),
          });
          return () => h("div", { onWheel: wheel?.onWheel });
        },
      }),
    );

    wrapper.element.dispatchEvent(
      new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaX: 20 }),
    );
    expect(wheel?.isWheeling.value).toBe(true);

    wheel?.stopWheel();
    expect(wheel?.isWheeling.value).toBe(false);
    vi.runAllTimers();
    wrapper.unmount();
  });
});
