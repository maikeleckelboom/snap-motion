import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";

import { sheetSnapVisibleExtent } from "../src/sheet/sheet-policy";
import { useSheetMotion } from "../src/sheet/use-sheet-motion";
import { ManualAnimationDriver } from "./manual-driver";

function fixedViewport(inlineSize = 400, blockSize = 800) {
  return {
    layoutViewportBlockSize: blockSize,
    layoutViewportInlineSize: inlineSize,
    visualViewportBlockSize: blockSize,
    visualViewportInlineSize: inlineSize,
  };
}

describe("useSheetMotion", () => {
  it("uses deterministic initial viewport geometry and adopts the browser only on measurement", () => {
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(1000);
    let firstPosition = 0;
    let motion: ReturnType<typeof useSheetMotion> | undefined;
    const panel = ref<HTMLElement>();
    const wrapper = mount(
      defineComponent({
        setup() {
          motion = useSheetMotion({ panel, driver: new ManualAnimationDriver() });
          firstPosition = motion.position.value;
          return () => h("section", { ref: panel });
        },
      }),
    );
    try {
      expect(firstPosition).toBe(801);
      motion!.remeasure();
      expect(motion!.primarySurfaceExtent.value).toBe(1000);
    } finally {
      wrapper.unmount();
    }
  });

  it.each(["top", "bottom", "left", "right"] as const)(
    "starts %s at the physical edge and closes without a hidden travel segment",
    async (side) => {
      const driver = new ManualAnimationDriver();
      const panel = ref<HTMLElement>();
      const onHidden = vi.fn<() => void>();
      let motion: ReturnType<typeof useSheetMotion> | undefined;
      const wrapper = mount(
        defineComponent({
          setup() {
            motion = useSheetMotion({
              driver,
              getMeasureContext: () => fixedViewport(),
              onHidden,
              panel,
              side,
            });
            return () => h("section", { ref: panel });
          },
        }),
      );
      try {
        await nextTick();
        const surface = motion!.primarySurfaceExtent.value;
        expect(motion!.position.value).toBeGreaterThan(surface);
        expect(motion!.position.value - surface).toBeLessThanOrEqual(1);
        expect(motion!.visiblePrimaryExtent.value).toBe(0);

        motion!.open();
        const opening = driver.latest!;
        // Even a small first physical movement must expose the surface, not traverse dead space.
        opening.update(opening.request.from - 2, -120);
        expect(motion!.visiblePrimaryExtent.value).toBeGreaterThan(0);
        opening.complete();
        expect(motion!.sheetState.value).toBe("open");

        motion!.close();
        const closing = driver.latest!;
        expect(closing.request.to - surface).toBeGreaterThan(0);
        expect(closing.request.to - surface).toBeLessThanOrEqual(1);
        closing.update(surface, 120);
        expect(motion!.visiblePrimaryExtent.value).toBe(0);
        expect(onHidden).not.toHaveBeenCalled();
        closing.complete();
        expect(motion!.sheetState.value).toBe("closed");
        expect(onHidden).toHaveBeenCalledOnce();
      } finally {
        wrapper.unmount();
      }
    },
  );

  it("retains an explicit hidden overshoot without changing open snaps", async () => {
    const driver = new ManualAnimationDriver();
    const panel = ref<HTMLElement>();
    let motion: ReturnType<typeof useSheetMotion> | undefined;
    const wrapper = mount(
      defineComponent({
        setup() {
          motion = useSheetMotion({
            driver,
            getMeasureContext: () => fixedViewport(),
            panel,
            viewportPolicy: { hiddenOvershoot: 160 },
          });
          return () => h("section", { ref: panel });
        },
      }),
    );
    try {
      await nextTick();
      expect(motion!.position.value).toBe(960);
      expect(
        motion!.resolvedSnapPoints.value.map(({ id, position }) => ({ id, position })),
      ).toEqual([
        { id: "full", position: 24 },
        { id: "comfortable", position: 180 },
        { id: "compact", position: 440 },
      ]);
      motion!.open();
      driver.latest!.complete();
      motion!.close();
      expect(driver.latest!.request.to).toBe(960);
    } finally {
      wrapper.unmount();
    }
  });

  it.each(["top", "bottom", "left", "right"] as const)(
    "retargets %s open/close/reopen from the current rendered position and velocity",
    async (side) => {
      const driver = new ManualAnimationDriver();
      const panel = ref<HTMLElement>();
      const onHidden = vi.fn<() => void>();
      let motion: ReturnType<typeof useSheetMotion> | undefined;
      const wrapper = mount(
        defineComponent({
          setup() {
            motion = useSheetMotion({
              driver,
              getMeasureContext: () => fixedViewport(),
              onHidden,
              panel,
              side,
            });
            return () => h("section", { ref: panel });
          },
        }),
      );
      try {
        await nextTick();
        motion!.open();
        const opening = driver.latest!;
        const openingPosition = (opening.request.from + opening.request.to) / 2;
        opening.update(openingPosition, -250);

        motion!.close();
        const closing = driver.latest!;
        expect(opening.stopped).toBe(true);
        expect(closing.request.from).toBe(openingPosition);
        expect(closing.request.initialVelocity).toBe(-250);
        expect(motion!.position.value).toBe(openingPosition);
        expect(motion!.sheetState.value).toBe("closing");

        const closingPosition = (closing.request.from + closing.request.to) / 2;
        closing.update(closingPosition, 180);
        motion!.open();
        const reopening = driver.latest!;
        expect(closing.stopped).toBe(true);
        expect(reopening.request.from).toBe(closingPosition);
        expect(reopening.request.initialVelocity).toBe(180);
        expect(motion!.position.value).toBe(closingPosition);
        expect(motion!.sheetState.value).toBe("opening");

        opening.complete();
        closing.complete();
        expect(onHidden).not.toHaveBeenCalled();
        expect(motion!.sheetState.value).toBe("opening");
        reopening.complete();
        expect(motion!.sheetState.value).toBe("open");
        expect(motion!.position.value).toBe(reopening.request.to);
      } finally {
        wrapper.unmount();
      }
    },
  );

  it("opens with velocity and preserves its semantic snap on resize", async () => {
    const driver = new ManualAnimationDriver();
    const panel = ref<HTMLElement>();
    let blockSize = 800;
    let motion: ReturnType<typeof useSheetMotion> | undefined;
    const wrapper = mount(
      defineComponent({
        setup() {
          motion = useSheetMotion({
            driver,
            getMeasureContext: () => fixedViewport(400, blockSize),
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
    expect(motion?.activeSnapId.value).toBe("comfortable");

    blockSize = 900;
    motion?.remeasure();
    expect(motion?.activeSnapId.value).toBe("comfortable");
    expect(motion?.position.value).toBe(280);
    wrapper.unmount();
  });

  it("opens immediately under reduced motion and closes through internal hidden state", async () => {
    const driver = new ManualAnimationDriver();
    const panel = ref<HTMLElement>();
    const reducedMotionOverride = ref<boolean | undefined>(true);
    const onHidden = vi.fn<() => void>();
    let motion: ReturnType<typeof useSheetMotion> | undefined;
    const wrapper = mount(
      defineComponent({
        setup() {
          motion = useSheetMotion({ driver, onHidden, panel, reducedMotionOverride });
          return () => h("section", { ref: panel });
        },
      }),
    );
    await nextTick();

    motion?.open();
    expect(driver.animations).toHaveLength(0);
    expect(motion?.activeSnapId.value).toBe("comfortable");
    motion?.close();
    expect(motion?.sheetState.value).toBe("closed");
    expect(motion?.activeSnapId.value).toBeUndefined();
    expect(onHidden).toHaveBeenCalledOnce();
    wrapper.unmount();
  });

  it.each([
    ["bottom", "translate3d(0, 440px, 0)"],
    ["top", "translate3d(0, -440px, 0)"],
  ] as const)("derives vertical visible extent and %s transform", async (side, transform) => {
    const driver = new ManualAnimationDriver();
    const panel = ref<HTMLElement>();
    let motion: ReturnType<typeof useSheetMotion> | undefined;
    const wrapper = mount(
      defineComponent({
        setup() {
          motion = useSheetMotion({
            driver,
            getMeasureContext: () => fixedViewport(),
            panel,
            side,
          });
          return () => h("section", { ref: panel });
        },
      }),
    );
    await nextTick();

    motion?.open("compact");
    driver.latest?.update(440, 0);
    expect(motion?.visiblePrimaryExtent.value).toBe(360);
    expect(motion?.transform.value).toBe(transform);
    driver.latest?.update(-24, 0);
    expect(motion?.visiblePrimaryExtent.value).toBe(824);
    wrapper.unmount();
  });

  it.each([
    ["right", "translate3d(256px, 0, 0)"],
    ["left", "translate3d(-256px, 0, 0)"],
  ] as const)("keeps a fixed horizontal surface for %s partial reveal", async (side, transform) => {
    const panel = ref<HTMLElement>();
    const reducedMotionOverride = ref<boolean | undefined>(true);
    let motion: ReturnType<typeof useSheetMotion<"open" | "peek">> | undefined;
    const wrapper = mount(
      defineComponent({
        setup() {
          motion = useSheetMotion({
            getMeasureContext: () => ({ ...fixedViewport(600, 800), panelPrimaryExtent: 416 }),
            panel,
            reducedMotionOverride,
            side,
            snapPoints: [
              {
                id: "open",
                label: "Open",
                resolveVisibleExtent: sheetSnapVisibleExtent.pixels(416),
              },
              {
                id: "peek",
                label: "Peek",
                resolveVisibleExtent: sheetSnapVisibleExtent.pixels(160),
              },
            ],
          });
          return () => h("section", { ref: panel });
        },
      }),
    );
    await nextTick();

    motion?.open("peek");
    expect(motion?.primarySurfaceExtent.value).toBe(416);
    expect(motion?.visiblePrimaryExtent.value).toBe(160);
    expect(motion?.transform.value).toBe(transform);
    expect(motion?.panelStyle.value["--snap-motion-sheet-primary-surface-extent"]).toBe("416px");
    wrapper.unmount();
  });

  it("uses explicit intrinsic content extent as authoritative", async () => {
    const panel = ref<HTMLElement>();
    let motion: ReturnType<typeof useSheetMotion> | undefined;
    const wrapper = mount(
      defineComponent({
        setup() {
          motion = useSheetMotion({
            getMeasureContext: () => ({
              ...fixedViewport(),
              intrinsicContentPrimaryExtent: 1_200,
            }),
            panel,
          });
          return () => h("section", { ref: panel });
        },
      }),
    );
    await nextTick();

    motion?.remeasure();
    expect(motion?.intrinsicContentPrimaryExtent.value).toBe(1_200);
    expect(motion?.geometry.value.intrinsicContentPrimaryExtent).toBe(1_200);
    wrapper.unmount();
  });

  it("atomically remaps semantic IDs and deterministic fallbacks when side changes", async () => {
    const panel = ref<HTMLElement>();
    const reducedMotionOverride = ref<boolean | undefined>(true);
    let motion: ReturnType<typeof useSheetMotion> | undefined;
    const wrapper = mount(
      defineComponent({
        setup() {
          motion = useSheetMotion({
            getMeasureContext: () => fixedViewport(),
            panel,
            reducedMotionOverride,
          });
          return () => h("section", { ref: panel });
        },
      }),
    );
    await nextTick();

    motion?.open("comfortable");
    expect(motion?.setSide("top", "comfortable")?.id).toBe("comfortable");
    expect(motion?.transform.value).toBe("translate3d(0, -180px, 0)");
    expect(motion?.setSide("right")?.id).toBe("open");
    expect(motion?.axis.value).toBe("x");
    expect(motion?.setSide("left", "open")?.id).toBe("open");
    expect(motion?.transform.value).toBe("translate3d(0px, 0, 0)");
    motion?.close();
    expect(motion?.setSide("bottom")).toBeNull();
    expect(motion?.remeasure()).toBeNull();
    expect(motion?.sheetState.value).toBe("closed");
    expect(motion?.activeSnapId.value).toBeUndefined();
    wrapper.unmount();
  });

  it("remeasures chrome, body content, and fixed panel without observing continuation surfaces", async () => {
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
    let motion: ReturnType<typeof useSheetMotion> | undefined;
    const wrapper = mount(
      defineComponent({
        setup() {
          motion = useSheetMotion({ chrome, intrinsicBodyContent, panel });
          return () =>
            h("section", { ref: panel }, [
              h("div", { ref: chrome }),
              h("div", { ref: intrinsicBodyContent }),
            ]);
        },
      }),
    );
    await nextTick();

    const panelRect = vi
      .spyOn(panel.value!, "getBoundingClientRect")
      .mockImplementation(() => ({ height: 800, width: 400 }) as DOMRect);
    vi.spyOn(chrome.value!, "getBoundingClientRect").mockImplementation(
      () => ({ height: 140 }) as DOMRect,
    );
    vi.spyOn(intrinsicBodyContent.value!, "getBoundingClientRect").mockImplementation(
      () => ({ height: 900 }) as DOMRect,
    );
    observerCallback?.([], {} as ResizeObserver);

    expect(observe).toHaveBeenCalledWith(panel.value, {});
    expect(observe).toHaveBeenCalledWith(chrome.value, {});
    expect(observe).toHaveBeenCalledWith(intrinsicBodyContent.value, {});
    await vi.waitFor(() => {
      expect(motion?.measuredChromeBlockExtent.value).toBe(140);
      expect(motion?.intrinsicBodyContentBlockExtent.value).toBe(900);
      expect(motion?.intrinsicContentPrimaryExtent.value).toBe(1_040);
    });
    expect(panelRect).toHaveBeenCalled();
    wrapper.unmount();
  });

  it("performs no layout reads in the direct pointer-move path", async () => {
    const driver = new ManualAnimationDriver();
    const panel = ref<HTMLElement>();
    const chrome = ref<HTMLElement>();
    const intrinsicBodyContent = ref<HTMLElement>();
    let motion: ReturnType<typeof useSheetMotion> | undefined;
    const wrapper = mount(
      defineComponent({
        setup() {
          motion = useSheetMotion({
            chrome,
            driver,
            getMeasureContext: () => fixedViewport(),
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

    const panelRect = vi.spyOn(panel.value!, "getBoundingClientRect");
    const chromeRect = vi.spyOn(chrome.value!, "getBoundingClientRect");
    const contentRect = vi.spyOn(intrinsicBodyContent.value!, "getBoundingClientRect");
    panelRect.mockClear();
    chromeRect.mockClear();
    contentRect.mockClear();

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

    expect(panelRect).not.toHaveBeenCalled();
    expect(chromeRect).not.toHaveBeenCalled();
    expect(contentRect).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});
