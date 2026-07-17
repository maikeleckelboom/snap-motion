import { onScopeDispose, ref } from "vue";

import { horizontalWheelDelta } from "./input-policy";

export interface WheelInputOptions {
  disabled?: () => boolean;
  pageSize: () => number;
  settleDelay?: number;
  onDelta: (delta: number, event: WheelEvent) => void;
  onSettle: () => void;
}

export function useHorizontalWheel(options: WheelInputOptions) {
  const isWheeling = ref(false);
  let settleTimer: ReturnType<typeof setTimeout> | undefined;

  function clearSettleTimer() {
    if (settleTimer !== undefined) {
      clearTimeout(settleTimer);
      settleTimer = undefined;
    }
  }

  function stopWheel() {
    clearSettleTimer();
    isWheeling.value = false;
  }

  function scheduleSettle() {
    clearSettleTimer();
    settleTimer = setTimeout(
      () => {
        settleTimer = undefined;
        isWheeling.value = false;
        options.onSettle();
      },
      Math.max(0, options.settleDelay ?? 90),
    );
  }

  function onWheel(event: WheelEvent) {
    if (options.disabled?.()) {
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
