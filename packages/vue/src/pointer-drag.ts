import { onScopeDispose, ref } from "vue";

import {
  isSupportedPrimaryPointerStart,
  resolvePointerIntent,
  type PointerIntent,
} from "./input-policy";

export interface PointerDragSample {
  delta: number;
  position: number;
  time: number;
}

export interface PointerDragOptions {
  axis: "x" | "y";
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
  const pointerIntent = ref<PointerIntent>("pending");
  const pointerOwned = ref(false);

  let captureTarget: HTMLElement | undefined;
  let pointerId: number | undefined;
  let startPosition = 0;
  let startX = 0;
  let startY = 0;
  let previousUserSelect: string | undefined;

  function sample(event: PointerEvent): PointerDragSample {
    const position = eventPosition(event, options.axis);
    return {
      delta: position - startPosition,
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
      captureTarget.addEventListener("lostpointercapture", onLostPointerCapture);
      pointerOwned.value = true;
    } catch {
      pointerOwned.value = false;
    }
  }

  function claim(event: PointerEvent) {
    if (isDragging.value) {
      return;
    }

    pointerIntent.value = options.axis === "x" ? "horizontal" : "vertical";
    isDragging.value = true;
    safelyCapturePointer();
    setSelectionSuppressed(true);
    options.onBegin(sample(event), event);
  }

  function removeWindowListeners() {
    if (typeof window === "undefined") {
      return;
    }

    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerCancel);
  }

  function cleanup() {
    removeWindowListeners();
    setSelectionSuppressed(false);

    if (captureTarget) {
      captureTarget.removeEventListener("lostpointercapture", onLostPointerCapture);
    }
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

  function onPointerUp(event: PointerEvent) {
    if (event.pointerId !== pointerId) {
      return;
    }

    if (isDragging.value) {
      event.preventDefault();
      options.onEnd(sample(event), event);
    }
    cleanup();
  }

  function onPointerCancel(event: PointerEvent) {
    if (event.pointerId !== pointerId) {
      return;
    }

    if (isDragging.value) {
      options.onCancel(sample(event), event);
    }
    cleanup();
  }

  function onLostPointerCapture(event: Event) {
    if (!(event instanceof PointerEvent) || event.pointerId !== pointerId) {
      return;
    }

    if (isDragging.value) {
      options.onCancel(sample(event), event);
    }
    cleanup();
  }

  function onPointerDown(event: PointerEvent) {
    if (!isSupportedPrimaryPointerStart(event) || pointerId !== undefined) {
      return;
    }

    const target = event.currentTarget;
    if (!(target instanceof HTMLElement) || typeof window === "undefined") {
      return;
    }

    captureTarget = target;
    pointerId = event.pointerId;
    startPosition = eventPosition(event, options.axis);
    startX = event.clientX;
    startY = event.clientY;
    pointerIntent.value = "pending";
    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);

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
    pointerIntent,
    pointerOwned,
    stop: cleanup,
  };
}
