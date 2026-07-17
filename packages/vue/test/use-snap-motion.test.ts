import type { ControllerSnapshot } from "@snap-motion/core";
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";

import { useSnapMotion, type UseSnapMotionOptions } from "../src/use-snap-motion";
import { ManualAnimationDriver } from "./manual-driver";

type Id = "a" | "b" | "c";

function options(
  driver: ManualAnimationDriver,
  overrides: Partial<UseSnapMotionOptions<Id>> = {},
): UseSnapMotionOptions<Id> {
  return {
    anchors: [
      { id: "a", order: 0, position: 0 },
      { id: "b", order: 1, position: -100 },
      { id: "c", order: 2, position: -200 },
    ],
    axis: "x",
    bounds: { min: -200, max: 0 },
    driver,
    initialTargetId: "a",
    releasePolicy: {
      projectionSeconds: 0.18,
      flingVelocity: 500,
      maxAnchorSkip: 2,
      forwardSign: -1,
    },
    ...overrides,
  };
}

describe("useSnapMotion", () => {
  it("mirrors controller state and ignores stale completion after interruption", () => {
    const driver = new ManualAnimationDriver();
    let motion: ReturnType<typeof useSnapMotion<Id>> | undefined;
    const wrapper = mount(
      defineComponent({
        setup() {
          motion = useSnapMotion(options(driver));
          return () => h("div");
        },
      }),
    );

    motion?.moveTo("b");
    const first = driver.latest;
    first?.update(-40, -300);
    expect(motion?.position.value).toBe(-40);

    motion?.moveTo("c");
    const second = driver.latest;
    expect(first?.stopped).toBe(true);

    first?.complete();
    expect(motion?.targetId.value).toBe("c");
    second?.complete();
    expect(motion?.activeId.value).toBe("c");
    expect(motion?.position.value).toBe(-200);

    wrapper.unmount();
  });

  it("finishes an active settle immediately when reduced motion is enabled", async () => {
    const driver = new ManualAnimationDriver();
    const reducedMotionOverride = ref<boolean>();
    let motion: ReturnType<typeof useSnapMotion<Id>> | undefined;
    const wrapper = mount(
      defineComponent({
        setup() {
          motion = useSnapMotion(options(driver, { reducedMotionOverride }));
          return () => h("div");
        },
      }),
    );

    motion?.moveTo("b");
    expect(motion?.phase.value).toBe("settling");
    reducedMotionOverride.value = true;
    await nextTick();

    expect(driver.latest?.stopped).toBe(true);
    expect(motion?.phase.value).toBe("idle");
    expect(motion?.activeId.value).toBe("b");
    expect(motion?.position.value).toBe(-100);
    wrapper.unmount();
  });

  it("stops playback and callbacks when its Vue scope is disposed", () => {
    const driver = new ManualAnimationDriver();
    const onChange = vi.fn<(snapshot: ControllerSnapshot<Id>) => void>();
    let motion: ReturnType<typeof useSnapMotion<Id>> | undefined;
    const wrapper = mount(
      defineComponent({
        setup() {
          motion = useSnapMotion(options(driver, { onChange }));
          return () => h("div");
        },
      }),
    );

    motion?.moveTo("b");
    const animation = driver.latest;
    wrapper.unmount();
    const callsAfterUnmount = onChange.mock.calls.length;
    animation?.update(-80, -100);
    animation?.complete();

    expect(animation?.stopped).toBe(true);
    expect(onChange).toHaveBeenCalledTimes(callsAfterUnmount);
  });
});
