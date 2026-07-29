import { useTimeoutFn } from "@vueuse/core";
import { onScopeDispose, ref } from "vue";

import { elementOwnsSnapMotionWheel, horizontalWheelDelta } from "./carousel-wheel-policy";

export interface WheelInputOptions {
  disabled?: () => boolean;
  pageSize: () => number;
  settleDelay?: number;
  onDelta: (delta: number, event: WheelEvent) => void;
  onSettle: (gesture: WheelGesture) => void;
}

export interface WheelGesture {
  delta: number;
  eventCount: number;
}

export function useHorizontalWheel(options: WheelInputOptions) {
  const isWheeling = ref(false);
  let gestureDelta = 0;
  let gestureEventCount = 0;

  const settleTimer = useTimeoutFn(
    () => {
      isWheeling.value = false;
      const gesture = {
        delta: gestureDelta,
        eventCount: gestureEventCount,
      };
      gestureDelta = 0;
      gestureEventCount = 0;
      options.onSettle(gesture);
    },
    () => Math.max(0, options.settleDelay ?? 90),
    { immediate: false },
  );

  function clearSettleTimer() {
    settleTimer.stop();
  }

  function stopWheel() {
    clearSettleTimer();
    isWheeling.value = false;
    gestureDelta = 0;
    gestureEventCount = 0;
  }

  function scheduleSettle() {
    settleTimer.start();
  }

  function onWheel(event: WheelEvent) {
    if (
      event.defaultPrevented ||
      elementOwnsSnapMotionWheel(event.target) ||
      options.disabled?.()
    ) {
      return;
    }

    const delta = horizontalWheelDelta(event, options.pageSize());
    if (delta === undefined) {
      return;
    }

    event.preventDefault();
    isWheeling.value = true;
    gestureDelta += delta;
    gestureEventCount += 1;
    options.onDelta(delta, event);
    scheduleSettle();
  }

  onScopeDispose(stopWheel);

  return {
    isWheeling,
    onWheel,
    stopWheel,
  };
}
