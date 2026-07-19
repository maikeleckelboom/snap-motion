import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick } from "vue";

import { usePointerDrag, type PointerDragOptions } from "../src/internal/input/pointer-drag";

const pointerCallback = () => vi.fn<PointerDragOptions["onMove"]>();

function pointerEvent(type: string, init: PointerEventInit & { isPrimary?: boolean } = {}) {
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    isPrimary: true,
    pointerId: 1,
    pointerType: "mouse",
    ...init,
  });
}

describe("pointer drag binding", () => {
  it("captures a primary left pointer and releases it after drag", async () => {
    const onBegin = pointerCallback();
    const onMove = pointerCallback();
    const onEnd = pointerCallback();
    const onCancel = pointerCallback();
    let owned = false;

    const wrapper = mount(
      defineComponent({
        setup() {
          const drag = usePointerDrag({
            axis: "x",
            onBegin,
            onMove,
            onEnd,
            onCancel,
          });
          return () => h("div", { onPointerdown: drag.onPointerDown });
        },
      }),
    );
    await nextTick();

    const element = wrapper.element as HTMLElement;
    element.setPointerCapture = vi.fn<HTMLElement["setPointerCapture"]>(() => {
      owned = true;
    });
    element.releasePointerCapture = vi.fn<HTMLElement["releasePointerCapture"]>(() => {
      owned = false;
    });

    element.dispatchEvent(pointerEvent("pointerdown", { buttons: 1, clientX: 10 }));
    window.dispatchEvent(pointerEvent("pointermove", { buttons: 1, clientX: 42 }));
    window.dispatchEvent(pointerEvent("pointerup", { clientX: 42 }));

    expect(onBegin).toHaveBeenCalledOnce();
    expect(onMove.mock.calls[0]?.[0]).toMatchObject({ delta: 32, position: 42 });
    expect(onEnd).toHaveBeenCalledOnce();
    expect(element.setPointerCapture).toHaveBeenCalledWith(1);
    expect(element.releasePointerCapture).toHaveBeenCalledWith(1);
    expect(owned).toBe(false);
    expect(document.documentElement.style.userSelect).toBe("");
  });

  it("ends a mouse drag when a move reports that the button is no longer held", () => {
    const onEnd = pointerCallback();
    const wrapper = mount(
      defineComponent({
        setup() {
          const drag = usePointerDrag({
            axis: "x",
            onBegin: pointerCallback(),
            onMove: pointerCallback(),
            onEnd,
            onCancel: pointerCallback(),
          });
          return () => h("div", { onPointerdown: drag.onPointerDown });
        },
      }),
    );
    const element = wrapper.element as HTMLElement;
    element.setPointerCapture = vi.fn<HTMLElement["setPointerCapture"]>();
    element.releasePointerCapture = vi.fn<HTMLElement["releasePointerCapture"]>();

    element.dispatchEvent(pointerEvent("pointerdown", { buttons: 1, clientX: 10 }));
    window.dispatchEvent(pointerEvent("pointermove", { buttons: 0, clientX: 42 }));

    expect(onEnd).toHaveBeenCalledOnce();
    expect(document.documentElement.style.userSelect).toBe("");
    wrapper.unmount();
  });

  it("ignores secondary and non-primary pointer starts", () => {
    const onBegin = pointerCallback();
    const wrapper = mount(
      defineComponent({
        setup() {
          const drag = usePointerDrag({
            axis: "x",
            onBegin,
            onMove: pointerCallback(),
            onEnd: pointerCallback(),
            onCancel: pointerCallback(),
          });
          return () => h("div", { onPointerdown: drag.onPointerDown });
        },
      }),
    );

    wrapper.element.dispatchEvent(pointerEvent("pointerdown", { button: 2 }));
    wrapper.element.dispatchEvent(pointerEvent("pointerdown", { isPrimary: false }));

    expect(onBegin).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("releases capture and reports cancellation", () => {
    const onCancel = pointerCallback();
    const wrapper = mount(
      defineComponent({
        setup() {
          const drag = usePointerDrag({
            axis: "x",
            onBegin: pointerCallback(),
            onMove: pointerCallback(),
            onEnd: pointerCallback(),
            onCancel,
          });
          return () => h("div", { onPointerdown: drag.onPointerDown });
        },
      }),
    );
    const element = wrapper.element as HTMLElement;
    element.setPointerCapture = vi.fn<HTMLElement["setPointerCapture"]>();
    element.releasePointerCapture = vi.fn<HTMLElement["releasePointerCapture"]>();

    element.dispatchEvent(pointerEvent("pointerdown", { clientX: 10 }));
    window.dispatchEvent(pointerEvent("pointercancel", { clientX: 24 }));

    expect(onCancel).toHaveBeenCalledOnce();
    expect(element.releasePointerCapture).toHaveBeenCalledWith(1);
    expect(document.documentElement.style.userSelect).toBe("");
    wrapper.unmount();
  });

  it("arbitrates touch intent before claiming horizontal movement", () => {
    const onBegin = pointerCallback();
    const onMove = pointerCallback();
    const component = defineComponent({
      setup() {
        const drag = usePointerDrag({
          axis: "x",
          intent: "horizontal",
          onBegin,
          onMove,
          onEnd: pointerCallback(),
          onCancel: pointerCallback(),
        });
        return () => h("div", { onPointerdown: drag.onPointerDown });
      },
    });

    const vertical = mount(component);
    const verticalElement = vertical.element as HTMLElement;
    verticalElement.setPointerCapture = vi.fn<HTMLElement["setPointerCapture"]>();
    verticalElement.dispatchEvent(
      pointerEvent("pointerdown", {
        clientX: 0,
        clientY: 0,
        pointerType: "touch",
      }),
    );
    window.dispatchEvent(
      pointerEvent("pointermove", {
        clientX: 2,
        clientY: 20,
        pointerType: "touch",
      }),
    );
    expect(onBegin).not.toHaveBeenCalled();
    vertical.unmount();

    const horizontal = mount(component);
    const horizontalElement = horizontal.element as HTMLElement;
    horizontalElement.setPointerCapture = vi.fn<HTMLElement["setPointerCapture"]>();
    horizontalElement.releasePointerCapture = vi.fn<HTMLElement["releasePointerCapture"]>();
    horizontalElement.dispatchEvent(
      pointerEvent("pointerdown", {
        clientX: 0,
        clientY: 0,
        pointerId: 2,
        pointerType: "touch",
      }),
    );
    window.dispatchEvent(
      pointerEvent("pointermove", {
        clientX: 20,
        clientY: 2,
        pointerId: 2,
        pointerType: "touch",
      }),
    );

    expect(onBegin).toHaveBeenCalledOnce();
    expect(onMove).toHaveBeenCalledOnce();
    expect(horizontalElement.setPointerCapture).toHaveBeenCalledWith(2);
    horizontal.unmount();
  });

  it("removes window listeners and selection suppression on unmount", () => {
    const onMove = pointerCallback();
    const wrapper = mount(
      defineComponent({
        setup() {
          const drag = usePointerDrag({
            axis: "x",
            onBegin: pointerCallback(),
            onMove,
            onEnd: pointerCallback(),
            onCancel: pointerCallback(),
          });
          return () => h("div", { onPointerdown: drag.onPointerDown });
        },
      }),
    );

    const element = wrapper.element as HTMLElement;
    element.setPointerCapture = vi.fn<HTMLElement["setPointerCapture"]>();
    element.releasePointerCapture = vi.fn<HTMLElement["releasePointerCapture"]>();
    element.dispatchEvent(pointerEvent("pointerdown", { clientX: 10 }));
    wrapper.unmount();
    window.dispatchEvent(pointerEvent("pointermove", { clientX: 40 }));

    expect(onMove).not.toHaveBeenCalled();
    expect(document.documentElement.style.userSelect).toBe("");
  });
});
