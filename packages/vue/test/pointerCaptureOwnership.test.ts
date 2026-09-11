import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { h, nextTick, ref } from "vue";

import { usePointerDrag, type PointerDragOptions } from "../src/internal/input/pointer-drag";
import {
  useSurfaceGesture,
  type SurfaceGestureOptions,
} from "../src/internal/input/surface-gesture";

function surface(pointerType = "touch") {
  const onBegin = vi.fn<PointerDragOptions["onBegin"]>();
  const onCancel = vi.fn<PointerDragOptions["onCancel"]>();
  const onEnd = vi.fn<PointerDragOptions["onEnd"]>();
  const onMove = vi.fn<PointerDragOptions["onMove"]>();
  const onResolved = vi.fn<SurfaceGestureOptions["onResolved"]>();
  const captured = new Set<number>();
  let drag!: ReturnType<typeof usePointerDrag>;
  let gesture!: ReturnType<typeof useSurfaceGesture>;
  const root = ref<HTMLElement>();
  const wrapper = mount(
    {
      setup() {
        drag = usePointerDrag({
          axis: "x",
          intent: "horizontal",
          onBegin,
          onCancel,
          onEnd,
          onMove,
        });
        gesture = useSurfaceGesture({
          root,
          itemSelector: "[data-item-index]",
          resolveIndex: () => 0,
          isOpenEligible: () => true,
          forwardPointerDown: drag.onPointerDown,
          onResolved,
        });
        return () =>
          h(
            "div",
            {
              ref: root,
              onPointerdown: gesture.onPointerDown,
              onLostpointercapture: gesture.onLostPointerCapture,
            },
            [h("div", { "data-item-index": 0 }, [h("img")])],
          );
      },
    },
    { attachTo: document.body },
  );
  const owner = wrapper.element as HTMLElement;
  owner.setPointerCapture = vi.fn<HTMLElement["setPointerCapture"]>((id) => {
    captured.add(id);
  });
  owner.releasePointerCapture = vi.fn<HTMLElement["releasePointerCapture"]>((id) => {
    captured.delete(id);
  });
  owner.hasPointerCapture = vi.fn<HTMLElement["hasPointerCapture"]>((id) => captured.has(id));
  const child = wrapper.get("img").element;
  function dispatch(target: EventTarget, type: string, clientX = 0, pointerId = 1) {
    target.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: type === "pointerup" ? 0 : 1,
        isPrimary: pointerId === 1,
        pointerId,
        pointerType,
        clientX,
      }),
    );
  }
  function begin() {
    dispatch(child, "pointerdown");
    dispatch(window, "pointermove", 30);
    expect(drag.isDragging.value).toBe(true);
    expect(captured.has(1)).toBe(true);
  }
  return {
    wrapper,
    root,
    owner,
    child,
    captured,
    drag,
    gesture,
    dispatch,
    begin,
    onBegin,
    onCancel,
    onEnd,
    onMove,
    onResolved,
  };
}

describe("shared pointer capture ownership", () => {
  it("retires a cancelled secondary pointer without ending the primary or masking its next contact", async () => {
    const view = surface();
    try {
      for (let sequence = 0; sequence < 2; sequence++) {
        view.begin();
        view.dispatch(view.child, "pointerdown", 30, 2);
        view.dispatch(view.child, "pointercancel", 30, 2);
        await nextTick();
        expect(view.drag.isDragging.value).toBe(true);
        expect(view.onCancel).not.toHaveBeenCalled();
        expect(view.onResolved).toHaveBeenCalledTimes(sequence);
        view.dispatch(window, "pointerup", 120);
        await nextTick();
        expect(view.onEnd).toHaveBeenCalledTimes(sequence + 1);
        expect(view.onResolved).toHaveBeenLastCalledWith(
          expect.objectContaining({ action: "none" }),
          expect.objectContaining({ cancelled: false }),
        );
      }
    } finally {
      view.wrapper.unmount();
    }
  });

  for (const pointerType of ["touch", "mouse", "pen"]) {
    it(`continues ${pointerType} movement and release after a descendant loses capture`, async () => {
      const view = surface(pointerType);
      try {
        view.begin();
        view.dispatch(view.child, "lostpointercapture", 30);
        await nextTick();
        expect(view.drag.isDragging.value).toBe(true);
        expect(view.onCancel).not.toHaveBeenCalled();
        expect(view.onResolved).not.toHaveBeenCalled();
        view.dispatch(window, "pointermove", 120);
        view.dispatch(window, "pointerup", 120);
        await nextTick();
        expect(view.onMove).toHaveBeenLastCalledWith(
          expect.objectContaining({ delta: 120 }),
          expect.any(PointerEvent),
        );
        expect(view.onEnd).toHaveBeenCalledOnce();
        expect(view.onResolved).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({ action: "swipe" }),
          expect.objectContaining({ cancelled: false }),
        );
        expect(view.drag.isDragging.value).toBe(false);
        expect(view.captured.size).toBe(0);
      } finally {
        view.wrapper.unmount();
      }
    });
  }

  it("does not abandon pending intent when a descendant loses implicit capture", async () => {
    const view = surface();
    try {
      view.dispatch(view.child, "pointerdown");
      view.dispatch(view.child, "lostpointercapture");
      await nextTick();
      expect(view.onResolved).not.toHaveBeenCalled();
      expect(view.drag.pointerInteractionActive.value).toBe(true);
      expect(view.drag.isDragging.value).toBe(false);
      view.dispatch(window, "pointermove", 30);
      expect(view.onBegin).toHaveBeenCalledOnce();
    } finally {
      view.wrapper.unmount();
    }
  });

  for (const terminal of ["pointercancel", "lostpointercapture"]) {
    it(`cancels both recognizers on genuine ${terminal}`, async () => {
      const view = surface();
      try {
        view.begin();
        if (terminal === "lostpointercapture") view.captured.delete(1);
        view.dispatch(view.owner, terminal, 50);
        await nextTick();
        expect(view.onCancel).toHaveBeenCalledOnce();
        expect(view.onResolved).toHaveBeenCalledExactlyOnceWith(
          expect.anything(),
          expect.objectContaining({ cancelled: true }),
        );
        expect(view.drag.isDragging.value).toBe(false);
        view.dispatch(window, "pointermove", 120);
        view.dispatch(window, "pointerup", 120);
        await nextTick();
        expect(view.onMove).toHaveBeenCalledOnce();
        expect(view.onEnd).not.toHaveBeenCalled();
        expect(view.onResolved).toHaveBeenCalledOnce();
      } finally {
        view.wrapper.unmount();
      }
    });
  }

  it("ignores an old owner's loss while that owner has capture again", async () => {
    const view = surface();
    try {
      view.begin();
      view.gesture.cancel();
      view.drag.stop();
      view.begin();
      view.dispatch(view.owner, "lostpointercapture", 30);
      await nextTick();
      expect(view.drag.isDragging.value).toBe(true);
      expect(view.onCancel).not.toHaveBeenCalled();
      expect(view.onResolved).not.toHaveBeenCalled();
    } finally {
      view.wrapper.unmount();
    }
  });

  it("keeps the pointerdown owner authoritative when the surface ref changes", async () => {
    const view = surface();
    try {
      view.begin();
      view.root.value = document.createElement("div");
      view.captured.delete(1);
      view.dispatch(view.owner, "lostpointercapture", 30);
      await nextTick();
      expect(view.onCancel).toHaveBeenCalledOnce();
      expect(view.onResolved).toHaveBeenCalledExactlyOnceWith(
        expect.anything(),
        expect.objectContaining({ cancelled: true }),
      );
    } finally {
      view.wrapper.unmount();
    }
  });

  for (const terminal of ["pointerup", "pointercancel", "lostpointercapture"]) {
    it(`ignores another pointer's ${terminal}`, async () => {
      const view = surface();
      try {
        view.begin();
        view.dispatch(view.owner, terminal, 30, 2);
        await nextTick();
        expect(view.drag.isDragging.value).toBe(true);
        expect(view.onCancel).not.toHaveBeenCalled();
        expect(view.onEnd).not.toHaveBeenCalled();
        expect(view.onResolved).not.toHaveBeenCalled();
        view.dispatch(window, "pointerup", 120);
        await nextTick();
        expect(view.onEnd).toHaveBeenCalledOnce();
        expect(view.onResolved).toHaveBeenCalledOnce();
      } finally {
        view.wrapper.unmount();
      }
    });
  }
});
