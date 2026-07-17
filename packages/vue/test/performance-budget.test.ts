import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { effectScope, h, nextTick, ref } from "vue";

import budgets from "../../../config/performance-budgets.json";
import { useCarouselWindow } from "../src/carousel-window";
import CarouselRoot from "../src/components/CarouselRoot.vue";
import { useSnapMotion } from "../src/use-snap-motion";
import { useHorizontalWheel } from "../src/wheel";
import { ManualAnimationDriver } from "./manual-driver";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Vue performance proxy budgets", () => {
  it.each([1, 20, 100, 1_000])("bounds the render window for %i semantic items", (count) => {
    const ids = Array.from({ length: count }, (_, index) => `item-${index}`);
    const activeId = ref(ids[Math.floor(count / 2)]);
    const window = useCarouselWindow(ids, activeId, {
      mountAfter: 2,
      mountBefore: 2,
      preloadAfter: 4,
      preloadBefore: 4,
    });

    expect(window.mountedIds.value.size).toBeLessThanOrEqual(budgets.maxMountedWindowItems);
    expect(window.preloadIds.value.size).toBeLessThanOrEqual(budgets.maxPreloadWindowItems);
  });

  it("does not accumulate keyboard listeners across repeated carousel mount cycles", async () => {
    const add = vi.spyOn(HTMLElement.prototype, "addEventListener");
    const remove = vi.spyOn(HTMLElement.prototype, "removeEventListener");

    for (let index = 0; index < budgets.simultaneousInstances; index += 1) {
      const wrapper = mount(CarouselRoot, {
        props: { activeId: "one", ids: ["one"], reducedMotionOverride: true },
        slots: { default: () => h("span", "One") },
      });
      await nextTick();
      wrapper.unmount();
    }

    const addedKeydown = add.mock.calls.filter(([type]) => type === "keydown").length;
    const removedKeydown = remove.mock.calls.filter(([type]) => type === "keydown").length;
    expect(addedKeydown).toBeGreaterThan(0);
    expect(removedKeydown).toBe(addedKeydown);
  });

  it("publishes one reactive snapshot per drag sample and disposes active playback", () => {
    const driver = new ManualAnimationDriver();
    let publications = 0;
    const scope = effectScope();
    const motion = scope.run(() =>
      useSnapMotion({
        anchors: [
          { id: "one", order: 0, position: 0 },
          { id: "two", order: 1, position: -100 },
        ],
        axis: "x",
        bounds: { min: -100, max: 0 },
        driver,
        initialTargetId: "one",
        onChange: () => {
          publications += 1;
        },
      }),
    );
    expect(motion).toBeDefined();
    motion!.controller.beginDrag();
    for (let sample = 1; sample <= 120; sample += 1) motion!.controller.dragTo(-sample / 2);
    motion!.controller.release(-200);

    expect(publications).toBeLessThanOrEqual(120 + budgets.dragPublicationOverhead);
    scope.stop();
    expect(driver.latest?.stopped).toBe(true);
  });

  it("coalesces a wheel burst to one settle callback", async () => {
    vi.useFakeTimers();
    const scope = effectScope();
    const onDelta = vi.fn<(delta: number, event: WheelEvent) => void>();
    const onSettle = vi.fn<() => void>();
    const wheel = scope.run(() =>
      useHorizontalWheel({ onDelta, onSettle, pageSize: () => 100, settleDelay: 90 }),
    );
    for (let index = 0; index < budgets.navigationBurstActions; index += 1) {
      wheel!.onWheel(new WheelEvent("wheel", { cancelable: true, deltaX: 10 }));
    }
    await vi.advanceTimersByTimeAsync(90);

    expect(onDelta).toHaveBeenCalledTimes(budgets.navigationBurstActions);
    expect(onSettle).toHaveBeenCalledOnce();
    scope.stop();
  });
});
