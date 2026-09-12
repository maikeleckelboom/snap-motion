import { useEventListener } from "@vueuse/core";
import { onScopeDispose, ref } from "vue";

import type { PointerIntent } from "../../contracts/motion-contracts";
import { isHTMLElement } from "../dom/realm";
import {
  elementOwnsSnapMotionDrag,
  isAuthoritativeCaptureLoss,
  isSupportedPrimaryPointerStart,
  resolvePointerIntent,
} from "./pointer-policy";

export interface PointerDragSample {
  delta: number;
  position: number;
  time: number;
}

export interface PointerDragOptions {
  axis: "x" | "y" | (() => "x" | "y");
  intent?: "immediate" | "horizontal";
  onBegin: (sample: PointerDragSample, event: PointerEvent) => void;
  onCancel: (sample: PointerDragSample, event: PointerEvent) => void;
  onEnd: (sample: PointerDragSample, event: PointerEvent) => void;
  onMove: (sample: PointerDragSample, event: PointerEvent) => void;
}

function eventPosition(event: PointerEvent, axis: "x" | "y") {
  return axis === "x" ? event.clientX : event.clientY;
}

function preventNativeDrag(event: DragEvent) {
  event.preventDefault();
}

export function usePointerDrag(options: PointerDragOptions) {
  const isDragging = ref(false);
  const pointerInteractionActive = ref(false);
  const pointerIntent = ref<PointerIntent>("pending");
  const pointerOwned = ref(false);

  let captureTarget: HTMLElement | undefined;
  let pointerId: number | undefined;
  let startX = 0;
  let startY = 0;
  let previousUserSelect: string | undefined;
  let removeListeners: Array<() => void> = [];
  let activeAxis = currentAxis();

  function currentAxis() {
    return typeof options.axis === "function" ? options.axis() : options.axis;
  }

  function sample(event: PointerEvent): PointerDragSample {
    const position = eventPosition(event, activeAxis);
    return {
      delta: position - (activeAxis === "x" ? startX : startY),
      position,
      time: event.timeStamp,
    };
  }

  function setSelectionSuppressed(suppressed: boolean) {
    const root = captureTarget?.ownerDocument.documentElement;
    if (!root) {
      return;
    }

    if (suppressed) {
      previousUserSelect = root.style.userSelect;
      root.style.userSelect = "none";
      return;
    }

    root.style.userSelect = previousUserSelect ?? "";
    previousUserSelect = undefined;
  }

  function safelyCapturePointer() {
    if (!captureTarget || pointerId === undefined || pointerOwned.value) {
      return;
    }

    try {
      captureTarget.setPointerCapture(pointerId);
      removeListeners.push(useEventListener(captureTarget, "lostpointercapture", onPointerEnd));
      pointerOwned.value = true;
    } catch {
      pointerOwned.value = false;
    }
  }

  function claim(event: PointerEvent) {
    if (isDragging.value) {
      return;
    }

    pointerIntent.value = activeAxis === "x" ? "horizontal" : "vertical";
    isDragging.value = true;
    safelyCapturePointer();
    setSelectionSuppressed(true);
    options.onBegin(sample(event), event);
  }

  function cleanup() {
    for (const remove of removeListeners) remove();
    removeListeners = [];
    setSelectionSuppressed(false);

    if (captureTarget && pointerId !== undefined && pointerOwned.value) {
      try {
        captureTarget.releasePointerCapture(pointerId);
      } catch {
        // Capture may already have been released by the browser.
      }
    }

    captureTarget = undefined;
    pointerId = undefined;
    isDragging.value = false;
    pointerInteractionActive.value = false;
    pointerOwned.value = false;
    pointerIntent.value = "pending";
  }

  function onPointerMove(event: PointerEvent) {
    if (event.pointerId !== pointerId) {
      return;
    }

    if (isDragging.value && event.pointerType === "mouse" && event.buttons === 0) {
      options.onEnd(sample(event), event);
      cleanup();
      return;
    }

    if (!isDragging.value && options.intent === "horizontal" && event.pointerType === "touch") {
      const intent = resolvePointerIntent(event.clientX - startX, event.clientY - startY);
      pointerIntent.value = intent;
      if (intent === "vertical") {
        cleanup();
        return;
      }
      if (intent === "horizontal") {
        claim(event);
      }
    }

    if (!isDragging.value) {
      return;
    }

    event.preventDefault();
    options.onMove(sample(event), event);
  }

  function onPointerEnd(event: PointerEvent) {
    if (
      event.pointerId !== pointerId ||
      (event.type === "lostpointercapture" &&
        !isAuthoritativeCaptureLoss(event, captureTarget, pointerId))
    ) {
      return;
    }

    if (isDragging.value) {
      if (event.type === "pointerup") {
        event.preventDefault();
        options.onEnd(sample(event), event);
      } else {
        options.onCancel(sample(event), event);
      }
    }
    cleanup();
  }

  function onPointerDown(event: PointerEvent) {
    if (
      !isSupportedPrimaryPointerStart(event) ||
      pointerId !== undefined ||
      elementOwnsSnapMotionDrag(event.target)
    ) {
      return;
    }

    const target = event.currentTarget;
    if (!isHTMLElement(target) || typeof window === "undefined") {
      return;
    }

    captureTarget = target;
    pointerId = event.pointerId;
    pointerInteractionActive.value = true;
    activeAxis = currentAxis();
    startX = event.clientX;
    startY = event.clientY;
    pointerIntent.value = "pending";
    removeListeners = [
      useEventListener(window, "pointermove", onPointerMove, { passive: false }),
      useEventListener(window, ["pointerup", "pointercancel"], onPointerEnd),
    ];

    const shouldDeferTouch = options.intent === "horizontal" && event.pointerType === "touch";
    if (!shouldDeferTouch) {
      event.preventDefault();
      claim(event);
    }
  }

  onScopeDispose(cleanup);

  return {
    isDragging,
    onNativeDragStart: preventNativeDrag,
    onPointerDown,
    pointerInteractionActive,
    pointerIntent,
    pointerOwned,
    stop: cleanup,
  };
}
