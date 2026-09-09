import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { h, nextTick, ref } from "vue";

import {
  useSurfaceGesture,
  type SurfaceGestureOptions,
} from "../src/internal/input/surface-gesture";

function pointer(type: string, clientX = 0) {
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    buttons: type === "pointerup" ? 0 : 1,
    clientX,
    isPrimary: true,
    pointerId: 6,
    pointerType: "mouse",
  });
}

function surface() {
  const resolved = vi.fn<SurfaceGestureOptions["onResolved"]>();
  const sampled = vi.fn<NonNullable<SurfaceGestureOptions["onPointerSample"]>>();
  let gesture: ReturnType<typeof useSurfaceGesture>;
  const wrapper = mount(
    {
      setup() {
        const root = ref<HTMLElement>();
        gesture = useSurfaceGesture({
          root,
          itemSelector: "[data-item-index]",
          resolveIndex: (element) => Number(element.dataset.itemIndex),
          isOpenEligible: () => true,
          forwardPointerDown: () => {},
          onResolved: resolved,
          onPointerSample: sampled,
        });
        return () =>
          h("div", { ref: root, onPointerdown: gesture.onPointerDown }, [
            h("div", { "data-item-index": 0 }, "First"),
            h("div", { "data-item-index": 1 }, "Second"),
          ]);
      },
    },
    { attachTo: document.body },
  );
  return {
    wrapper,
    resolved,
    sampled,
    cancel: () => gesture.cancel(),
    item: (index: number) => wrapper.get(`[data-item-index="${index}"]`).element,
  };
}

describe("surface gesture deferred publication", () => {
  it("retires a completed action when authority cancels it before publication", async () => {
    const view = surface();
    try {
      view.item(0).dispatchEvent(pointer("pointerdown"));
      view.item(0).dispatchEvent(pointer("pointerup"));
      view.cancel();
      await nextTick();
      expect(view.resolved).not.toHaveBeenCalled();
      expect(view.sampled).not.toHaveBeenCalled();
    } finally {
      view.wrapper.unmount();
    }
  });

  it("publishes only the new gesture when a completed sequence is replaced before its microtask", async () => {
    const view = surface();
    try {
      view.item(0).dispatchEvent(pointer("pointerdown"));
      view.item(0).dispatchEvent(pointer("pointerup"));
      view.item(1).dispatchEvent(pointer("pointerdown"));
      view.item(1).dispatchEvent(pointer("pointerup"));
      await nextTick();
      expect(view.resolved).toHaveBeenCalledTimes(1);
      expect(view.resolved).toHaveBeenCalledWith(
        expect.objectContaining({ action: "open" }),
        expect.objectContaining({ originIndex: 1 }),
      );
      expect(view.sampled).toHaveBeenCalledTimes(1);
    } finally {
      view.wrapper.unmount();
    }
  });

  it("retires queued movement when the contact is cancelled", async () => {
    const view = surface();
    try {
      view.item(0).dispatchEvent(pointer("pointerdown"));
      window.dispatchEvent(pointer("pointermove", 80));
      view.cancel();
      await nextTick();
      expect(view.sampled).not.toHaveBeenCalled();
    } finally {
      view.wrapper.unmount();
    }
  });

  it("publishes neither a queued sample nor an action after unmount", async () => {
    const view = surface();
    view.item(0).dispatchEvent(pointer("pointerdown"));
    view.item(0).dispatchEvent(pointer("pointerup"));
    view.wrapper.unmount();
    await nextTick();
    expect(view.sampled).not.toHaveBeenCalled();
    expect(view.resolved).not.toHaveBeenCalled();
  });
});
