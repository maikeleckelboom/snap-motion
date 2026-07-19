import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";

import { useBottomSheetMotion } from "../src/bottom-sheet/use-bottom-sheet-motion";
import { ManualAnimationDriver } from "./manual-driver";

describe("useBottomSheetMotion", () => {
  it("opens with a velocity-bearing spring and preserves its semantic snap on resize", async () => {
    const driver = new ManualAnimationDriver();
    const panel = ref<HTMLElement>();
    let viewportHeight = 800;
    let motion: ReturnType<typeof useBottomSheetMotion> | undefined;
    const wrapper = mount(
      defineComponent({
        setup() {
          motion = useBottomSheetMotion({
            driver,
            getViewportHeight: () => viewportHeight,
            panel,
          });
          return () => h("section", { ref: panel });
        },
      }),
    );
    await nextTick();

    motion?.open();
    expect(motion?.sheetState.value).toBe("opening");
    expect(driver.latest?.request.to).toBe(180);
    expect(driver.latest?.request.initialVelocity).toBeLessThan(0);
    driver.latest?.complete();
    expect(motion?.sheetState.value).toBe("open");
    expect(motion?.activeSnapId.value).toBe("comfortable");

    viewportHeight = 900;
    motion?.remeasure();
    expect(motion?.activeSnapId.value).toBe("comfortable");
    expect(motion?.position.value).toBe(280);
    wrapper.unmount();
  });

  it("opens immediately under a deterministic reduced-motion override", async () => {
    const driver = new ManualAnimationDriver();
    const panel = ref<HTMLElement>();
    const reducedMotionOverride = ref<boolean | undefined>(true);
    let motion: ReturnType<typeof useBottomSheetMotion> | undefined;
    const wrapper = mount(
      defineComponent({
        setup() {
          motion = useBottomSheetMotion({
            driver,
            panel,
            reducedMotionOverride,
          });
          return () => h("section", { ref: panel });
        },
      }),
    );
    await nextTick();

    motion?.open();
    expect(driver.animations).toHaveLength(0);
    expect(motion?.sheetState.value).toBe("open");
    expect(motion?.activeSnapId.value).toBe("comfortable");
    wrapper.unmount();
  });

  it("closes to hidden and reports completion", async () => {
    const driver = new ManualAnimationDriver();
    const panel = ref<HTMLElement>();
    const onHidden = vi.fn<() => void>();
    let motion: ReturnType<typeof useBottomSheetMotion> | undefined;
    const wrapper = mount(
      defineComponent({
        setup() {
          motion = useBottomSheetMotion({ driver, onHidden, panel });
          return () => h("section", { ref: panel });
        },
      }),
    );
    await nextTick();

    motion?.open();
    driver.latest?.complete();
    motion?.close();
    expect(motion?.sheetState.value).toBe("closing");
    driver.latest?.complete();

    expect(motion?.sheetState.value).toBe("closed");
    expect(motion?.activeSnapId.value).toBeUndefined();
    expect(onHidden).toHaveBeenCalledOnce();
    wrapper.unmount();
  });
});
