import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";

import { bottomSheetSnapPosition } from "../src/bottom-sheet/bottom-sheet-policy";
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

  it("derives visible height from every current physical position", async () => {
    const driver = new ManualAnimationDriver();
    const panel = ref<HTMLElement>();
    let motion: ReturnType<typeof useBottomSheetMotion> | undefined;
    const wrapper = mount(
      defineComponent({
        setup() {
          motion = useBottomSheetMotion({
            driver,
            getViewportHeight: () => 800,
            panel,
          });
          return () => h("section", { ref: panel });
        },
      }),
    );
    await nextTick();

    motion?.open("comfortable");
    driver.latest?.update(440, 0);
    expect(motion?.physicalPosition.value).toBe(440);
    expect(motion?.visibleSheetHeight.value).toBe(360);

    driver.latest?.update(-24, 0);
    expect(motion?.visibleSheetHeight.value).toBe(824);
    expect((motion?.physicalPosition.value ?? 0) + (motion?.visibleSheetHeight.value ?? 0)).toBe(
      800,
    );
    wrapper.unmount();
  });

  it("renders a custom topmost snap at its resolved physical coordinate", async () => {
    const panel = ref<HTMLElement>();
    const reducedMotionOverride = ref<boolean | undefined>(true);
    let motion: ReturnType<typeof useBottomSheetMotion<"full" | "peek">> | undefined;
    const wrapper = mount(
      defineComponent({
        setup() {
          motion = useBottomSheetMotion({
            getViewportHeight: () => 800,
            panel,
            reducedMotionOverride,
            snapPoints: [
              {
                id: "full",
                label: "Full",
                resolve: bottomSheetSnapPosition.pixels(80),
              },
              {
                id: "peek",
                label: "Peek",
                resolve: bottomSheetSnapPosition.pixels(600),
              },
            ],
          });
          return () => h("section", { ref: panel });
        },
      }),
    );
    await nextTick();

    motion?.open("full");
    expect(motion?.position.value).toBe(80);
    expect(motion?.visibleSheetHeight.value).toBe(720);
    expect(motion?.transform.value).toBe("translate3d(0, 80px, 0)");
    expect(motion?.panelStyle.value["--snap-motion-sheet-full-y"]).toBe("80px");
    wrapper.unmount();
  });

  it("updates semantic anchors and visible height from visualViewport resize", async () => {
    const originalVisualViewport = window.visualViewport;
    const visualViewport = new EventTarget() as VisualViewport;
    Object.defineProperty(visualViewport, "height", { configurable: true, value: 800 });
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: visualViewport,
    });
    const panel = ref<HTMLElement>();
    const reducedMotionOverride = ref<boolean | undefined>(true);
    let motion: ReturnType<typeof useBottomSheetMotion> | undefined;
    const wrapper = mount(
      defineComponent({
        setup() {
          motion = useBottomSheetMotion({ panel, reducedMotionOverride });
          return () => h("section", { ref: panel });
        },
      }),
    );
    await nextTick();

    motion?.open("compact");
    expect(motion?.position.value).toBe(440);
    expect(motion?.visibleSheetHeight.value).toBe(360);

    Object.defineProperty(visualViewport, "height", { configurable: true, value: 600 });
    visualViewport.dispatchEvent(new Event("resize"));
    await nextTick();

    expect(motion?.activeSnapId.value).toBe("compact");
    expect(motion?.position.value).toBe(240);
    expect(motion?.visibleSheetHeight.value).toBe(360);

    wrapper.unmount();
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: originalVisualViewport,
    });
  });

  it("remeasures intrinsic chrome and body content without observing the motion shell", async () => {
    let observerCallback: ResizeObserverCallback | undefined;
    const observe = vi.fn<ResizeObserver["observe"]>();
    class ResizeObserverMock {
      constructor(callback: ResizeObserverCallback) {
        observerCallback = callback;
      }
      disconnect = vi.fn<ResizeObserver["disconnect"]>();
      observe = observe;
      unobserve = vi.fn<ResizeObserver["unobserve"]>();
    }
    Object.defineProperty(window, "ResizeObserver", {
      configurable: true,
      value: ResizeObserverMock,
    });

    const panel = ref<HTMLElement>();
    const chrome = ref<HTMLElement>();
    const intrinsicBodyContent = ref<HTMLElement>();
    let motion: ReturnType<typeof useBottomSheetMotion> | undefined;
    const wrapper = mount(
      defineComponent({
        setup() {
          motion = useBottomSheetMotion({ chrome, intrinsicBodyContent, panel });
          return () =>
            h("section", { ref: panel }, [
              h("div", { ref: chrome }),
              h("div", { ref: intrinsicBodyContent }),
            ]);
        },
      }),
    );
    await nextTick();

    let contentHeight = 900;
    const chromeRect = vi
      .spyOn(chrome.value!, "getBoundingClientRect")
      .mockImplementation(() => ({ height: 140 }) as DOMRect);
    const contentRect = vi
      .spyOn(intrinsicBodyContent.value!, "getBoundingClientRect")
      .mockImplementation(() => ({ height: contentHeight }) as DOMRect);
    observerCallback?.([], {} as ResizeObserver);

    expect(observe).toHaveBeenCalledWith(chrome.value, {});
    expect(observe).toHaveBeenCalledWith(intrinsicBodyContent.value, {});
    expect(observe).not.toHaveBeenCalledWith(panel.value, {});
    await vi.waitFor(() => {
      expect(motion?.measuredChromeHeight.value).toBe(140);
      expect(motion?.intrinsicBodyContentHeight.value).toBe(900);
      expect(motion?.panelIntrinsicSize.value).toBe(1_040);
    });

    contentHeight = 1_120;
    observerCallback?.([], {} as ResizeObserver);
    await vi.waitFor(() => {
      expect(motion?.panelIntrinsicSize.value).toBe(1_260);
    });
    expect(chromeRect).toHaveBeenCalledTimes(2);
    expect(contentRect).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });

  it("performs no layout reads in the direct pointer-move path", async () => {
    const driver = new ManualAnimationDriver();
    const panel = ref<HTMLElement>();
    const chrome = ref<HTMLElement>();
    const intrinsicBodyContent = ref<HTMLElement>();
    let motion: ReturnType<typeof useBottomSheetMotion> | undefined;
    const wrapper = mount(
      defineComponent({
        setup() {
          motion = useBottomSheetMotion({
            chrome,
            driver,
            getViewportHeight: () => 800,
            intrinsicBodyContent,
            panel,
          });
          return () =>
            h("section", { ref: panel }, [
              h("div", { ref: chrome }),
              h("div", { ref: intrinsicBodyContent }),
            ]);
        },
      }),
      { attachTo: document.body },
    );
    await nextTick();

    const chromeRect = vi.spyOn(chrome.value!, "getBoundingClientRect");
    const contentRect = vi.spyOn(intrinsicBodyContent.value!, "getBoundingClientRect");
    chromeRect.mockClear();
    contentRect.mockClear();
    const panelScrollHeight = vi.fn<() => number>(() => 2_000);
    Object.defineProperty(panel.value!, "scrollHeight", {
      configurable: true,
      get: panelScrollHeight,
    });

    const pointerDown = new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      buttons: 1,
      clientY: 200,
      isPrimary: true,
      pointerId: 9,
      pointerType: "mouse",
    });
    Object.defineProperty(pointerDown, "currentTarget", { value: panel.value });
    Object.defineProperty(pointerDown, "target", { value: panel.value });
    motion?.onPointerDown(pointerDown);
    window.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        buttons: 1,
        clientY: 260,
        isPrimary: true,
        pointerId: 9,
        pointerType: "mouse",
      }),
    );

    expect(chromeRect).not.toHaveBeenCalled();
    expect(contentRect).not.toHaveBeenCalled();
    expect(panelScrollHeight).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});
