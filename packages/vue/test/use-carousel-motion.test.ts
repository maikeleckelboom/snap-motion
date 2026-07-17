import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";

import { useCarouselMotion } from "../src/use-carousel-motion";
import { ManualAnimationDriver } from "./manual-driver";

type Id = "a" | "b" | "c";

afterEach(() => {
  vi.useRealTimers();
});

describe("useCarouselMotion", () => {
  it("preserves active semantic IDs across remeasurement", async () => {
    const driver = new ManualAnimationDriver();
    const viewport = ref<HTMLElement>();
    let bPosition = -100;
    let motion: ReturnType<typeof useCarouselMotion<Id>> | undefined;
    const wrapper = mount(
      defineComponent({
        setup() {
          motion = useCarouselMotion<Id>({
            anchors: [
              { id: "a", order: 0, position: 0 },
              { id: "b", order: 1, position: -100 },
              { id: "c", order: 2, position: -200 },
            ],
            bounds: { min: -200, max: 0 },
            driver,
            initialTargetId: "b",
            measure: () => ({
              anchors: [
                { id: "a", order: 0, position: 0 },
                { id: "b", order: 1, position: bPosition },
                { id: "c", order: 2, position: -300 },
              ],
              bounds: { min: -300, max: 0 },
            }),
            viewport,
          });
          return () => h("div", { ref: viewport });
        },
      }),
    );
    await nextTick();

    bPosition = -150;
    motion?.remeasure();
    expect(motion?.activeId.value).toBe("b");
    expect(motion?.position.value).toBe(-150);
    expect(motion?.trackStyle.value.transform).toBe("translate3d(-150px, 0, 0)");
    wrapper.unmount();
  });

  it("supports carousel keys without intercepting Tab", () => {
    const driver = new ManualAnimationDriver();
    const viewport = ref<HTMLElement>();
    let motion: ReturnType<typeof useCarouselMotion<Id>> | undefined;
    const wrapper = mount(
      defineComponent({
        setup() {
          const anchors = [
            { id: "a" as const, order: 0, position: 0 },
            { id: "b" as const, order: 1, position: -100 },
            { id: "c" as const, order: 2, position: -200 },
          ];
          motion = useCarouselMotion<Id>({
            anchors,
            bounds: { min: -200, max: 0 },
            driver,
            initialTargetId: "a",
            measure: () => ({ anchors, bounds: { min: -200, max: 0 } }),
            viewport,
          });
          return () => h("div", { ref: viewport, onKeydown: motion?.onKeyDown });
        },
      }),
    );

    const tab = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Tab",
    });
    wrapper.element.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(false);
    expect(driver.animations).toHaveLength(0);

    const right = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "ArrowRight",
    });
    wrapper.element.dispatchEvent(right);
    expect(right.defaultPrevented).toBe(true);
    expect(motion?.targetId.value).toBe("b");
    expect(driver.animations).toHaveLength(1);
    wrapper.unmount();
  });

  it("accumulates normalized wheel deltas before one semantic settle", async () => {
    vi.useFakeTimers();
    const driver = new ManualAnimationDriver();
    const viewport = ref<HTMLElement>();
    const reducedMotionOverride = ref<boolean | undefined>(true);
    let motion: ReturnType<typeof useCarouselMotion<Id>> | undefined;
    const anchors = [
      { id: "a" as const, order: 0, position: 0 },
      { id: "b" as const, order: 1, position: -100 },
      { id: "c" as const, order: 2, position: -200 },
    ];
    const wrapper = mount(
      defineComponent({
        setup() {
          motion = useCarouselMotion<Id>({
            anchors,
            bounds: { min: -200, max: 0 },
            driver,
            initialTargetId: "a",
            measure: () => ({ anchors, bounds: { min: -200, max: 0 } }),
            reducedMotionOverride,
            viewport,
            wheelSettleDelay: 90,
          });
          return () => h("div", { ref: viewport, onWheel: motion?.onWheel });
        },
      }),
    );
    await nextTick();

    wrapper.element.dispatchEvent(
      new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaX: 30 }),
    );
    wrapper.element.dispatchEvent(
      new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaX: 30 }),
    );
    expect(motion?.position.value).toBe(-60);
    expect(motion?.isWheeling.value).toBe(true);

    vi.advanceTimersByTime(90);
    await nextTick();
    expect(motion?.position.value).toBe(-100);
    expect(motion?.activeId.value).toBe("b");
    expect(motion?.isWheeling.value).toBe(false);
    wrapper.unmount();
  });

  it("maps RTL Arrow, drag, and wheel input onto logical semantic order", async () => {
    vi.useFakeTimers();
    const driver = new ManualAnimationDriver();
    const viewport = ref<HTMLElement>();
    const reducedMotionOverride = ref<boolean | undefined>(true);
    let motion: ReturnType<typeof useCarouselMotion<Id>> | undefined;
    const anchors = [
      { id: "a" as const, order: 0, position: 0 },
      { id: "b" as const, order: 1, position: -100 },
      { id: "c" as const, order: 2, position: -200 },
    ];
    const wrapper = mount(
      defineComponent({
        setup() {
          motion = useCarouselMotion<Id>({
            anchors,
            bounds: { min: -200, max: 0 },
            direction: "rtl",
            driver,
            initialTargetId: "b",
            measure: () => ({ anchors, bounds: { min: -200, max: 0 } }),
            reducedMotionOverride,
            viewport,
            wheelSettleDelay: 90,
          });
          return () =>
            h("div", {
              ref: viewport,
              onKeydown: motion?.onKeyDown,
              onPointerdown: motion?.onPointerDown,
              onWheel: motion?.onWheel,
            });
        },
      }),
    );
    await nextTick();

    wrapper.element.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "ArrowRight" }),
    );
    expect(motion?.activeId.value).toBe("a");
    motion?.moveTo("b");

    wrapper.element.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        button: 0,
        buttons: 1,
        cancelable: true,
        clientX: 100,
        isPrimary: true,
        pointerId: 41,
        pointerType: "mouse",
      }),
    );
    window.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        buttons: 1,
        cancelable: true,
        clientX: 40,
        isPrimary: true,
        pointerId: 41,
        pointerType: "mouse",
      }),
    );
    window.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        cancelable: true,
        clientX: 40,
        isPrimary: true,
        pointerId: 41,
        pointerType: "mouse",
      }),
    );
    expect(motion?.activeId.value).toBe("a");
    motion?.moveTo("b");

    wrapper.element.dispatchEvent(
      new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaX: 60 }),
    );
    vi.advanceTimersByTime(90);
    await nextTick();
    expect(motion?.activeId.value).toBe("a");
    wrapper.unmount();
  });
});
