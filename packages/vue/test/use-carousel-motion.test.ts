import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";

import { useCarouselMotion } from "../src/carousel/use-carousel-motion";
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

  it("measures a pointer drag and a coalesced wheel burst from the declared drag origin", async () => {
    vi.useFakeTimers();
    const driver = new ManualAnimationDriver();
    const viewport = ref<HTMLElement>();
    const reducedMotionOverride = ref<boolean | undefined>(true);
    const origin = ref<"a" | "b" | "c" | "d">("b");
    const resolveDragOrigin = vi.fn<() => "a" | "b" | "c" | "d">(() => origin.value);
    let motion: ReturnType<typeof useCarouselMotion<"a" | "b" | "c" | "d">> | undefined;
    const anchors = [
      { id: "a" as const, order: 0, position: 0 },
      { id: "b" as const, order: 1, position: -100 },
      { id: "c" as const, order: 2, position: -200 },
      { id: "d" as const, order: 3, position: -300 },
    ];
    const wrapper = mount(
      defineComponent({
        setup() {
          motion = useCarouselMotion<"a" | "b" | "c" | "d">({
            anchors,
            bounds: { min: -300, max: 0 },
            driver,
            initialTargetId: "a",
            measure: () => ({ anchors, bounds: { min: -300, max: 0 } }),
            reducedMotionOverride,
            releasePolicy: {
              projectionSeconds: 0.18,
              flingVelocity: 500,
              maxAnchorSkip: 1,
              forwardSign: -1,
            },
            resolveDragOrigin,
            viewport,
            wheelSettleDelay: 90,
          });
          return () =>
            h("div", {
              ref: viewport,
              onPointerdown: motion?.onPointerDown,
              onWheel: motion?.onWheel,
            });
        },
      }),
    );
    await nextTick();

    // A long burst is one drag: it opens one origin and cannot walk past that origin's envelope.
    // The controller's own anchor is "a" here, so stopping at "c" proves the declared origin won.
    for (let step = 0; step < 12; step += 1) {
      wrapper.element.dispatchEvent(
        new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaX: 120 }),
      );
    }
    expect(resolveDragOrigin).toHaveBeenCalledTimes(1);
    expect(motion?.position.value).toBe(-200);
    vi.advanceTimersByTime(90);
    await nextTick();
    expect(motion?.activeId.value).toBe("c");

    wrapper.element.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        button: 0,
        buttons: 1,
        cancelable: true,
        clientX: 0,
        isPrimary: true,
        pointerId: 57,
        pointerType: "mouse",
      }),
    );
    expect(resolveDragOrigin).toHaveBeenCalledTimes(2);
    window.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        buttons: 1,
        cancelable: true,
        clientX: 4_000,
        isPrimary: true,
        pointerId: 57,
        pointerType: "mouse",
      }),
    );
    // The declared origin is still "b", so a violent drag resolves to "a" even though the
    // controller's nearest anchor when the gesture began was "c".
    expect(motion?.position.value).toBeGreaterThan(-100);
    window.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        cancelable: true,
        clientX: 4_000,
        isPrimary: true,
        pointerId: 57,
        pointerType: "mouse",
      }),
    );
    expect(motion?.activeId.value).toBe("a");
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

  it("advances isolated wheel steps from the pending target while preserving interruption", async () => {
    vi.useFakeTimers();
    const driver = new ManualAnimationDriver();
    const viewport = ref<HTMLElement>();
    let motion: ReturnType<typeof useCarouselMotion<Id>> | undefined;
    const selected: Id[] = [];
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
            onTargetSelected: (id) => selected.push(id),
            viewport,
            wheelSettleDelay: 90,
          });
          return () => h("div", { ref: viewport, onWheel: motion?.onWheel });
        },
      }),
    );
    await nextTick();

    wrapper.element.dispatchEvent(
      new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaX: 40 }),
    );
    await vi.advanceTimersByTimeAsync(90);
    expect(motion?.targetId.value).toBe("b");
    expect(selected).toEqual(["b"]);

    driver.latest?.update(-20, -120);
    wrapper.element.dispatchEvent(
      new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaX: 40 }),
    );
    expect(motion?.position.value).toBe(-60);
    await vi.advanceTimersByTimeAsync(90);

    expect(driver.animations[0]?.stopped).toBe(true);
    expect(driver.latest?.request.from).toBe(-60);
    expect(motion?.targetId.value).toBe("c");
    expect(selected).toEqual(["b", "c"]);
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
