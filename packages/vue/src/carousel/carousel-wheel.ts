import { useTimeoutFn } from "@vueuse/core";
import { onScopeDispose, ref } from "vue";

import { elementOwnsSnapMotionWheel, horizontalWheelDelta } from "./carousel-wheel-policy";

export interface WheelInputOptions {
  disabled?: () => boolean;
  pageSize: () => number;
  settleDelay?: number;
  onDelta: (delta: number, event: WheelEvent) => void;
  onSettle: () => void;
}

export function useHorizontalWheel(options: WheelInputOptions) {
  const isWheeling = ref(false);

  const settleTimer = useTimeoutFn(
    () => {
      isWheeling.value = false;
      options.onSettle();
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
