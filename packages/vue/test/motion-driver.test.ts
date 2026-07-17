import { describe, expect, it, vi } from "vitest";

import { createMotionDriver, type NumericMotionValueAdapter } from "../src/motion-driver";

function createHarness() {
  let changeListener: ((value: number) => void) | undefined;
  let completion: (() => void) | undefined;
  let velocity = 0;
  const stop = vi.fn<() => void>();
  const destroy = vi.fn<() => void>();
  const unsubscribe = vi.fn<() => void>();
  const optionsSeen: unknown[] = [];

  const adapter: NumericMotionValueAdapter = {
    animateTo(_target, options) {
      optionsSeen.push(options);
      completion = options.onComplete;
      return { stop };
    },
    destroy,
    getVelocity: () => velocity,
    onChange(listener) {
      changeListener = listener;
      return unsubscribe;
    },
  };

  return {
    adapter,
    complete: () => completion?.(),
    destroy,
    optionsSeen,
    set(value: number, nextVelocity: number) {
      velocity = nextVelocity;
      changeListener?.(value);
    },
    stop,
    unsubscribe,
  };
}

describe("Motion animation driver", () => {
  it("uses a physical spring and carries initial velocity", () => {
    const harness = createHarness();
    const onUpdate = vi.fn<(position: number, velocity: number) => void>();
    const onComplete = vi.fn<() => void>();
    const driver = createMotionDriver(() => harness.adapter);

    driver.animate({
      from: 20,
      to: 100,
      initialVelocity: 840,
      spring: {
        damping: 34,
        mass: 0.72,
        restDistance: 0.5,
        restSpeed: 8,
        stiffness: 620,
      },
      onComplete,
      onUpdate,
    });

    expect(harness.optionsSeen[0]).toMatchObject({
      type: "spring",
      velocity: 840,
      stiffness: 620,
      damping: 34,
      mass: 0.72,
      restSpeed: 8,
      restDelta: 0.5,
    });

    harness.set(60, 410);
    expect(onUpdate).toHaveBeenLastCalledWith(60, 410);

    harness.complete();
    expect(onUpdate).toHaveBeenLastCalledWith(100, 0);
    expect(onComplete).toHaveBeenCalledOnce();
    expect(harness.destroy).toHaveBeenCalledOnce();
    expect(harness.unsubscribe).toHaveBeenCalledOnce();
  });

  it("stops immediately and ignores stale completion callbacks", () => {
    const harness = createHarness();
    const onComplete = vi.fn<() => void>();
    const onStop = vi.fn<() => void>();
    const onUpdate = vi.fn<(position: number, velocity: number) => void>();
    const driver = createMotionDriver(() => harness.adapter);

    const playback = driver.animate({
      from: 0,
      to: 100,
      initialVelocity: 0,
      spring: {
        damping: 30,
        mass: 1,
        restDistance: 0.5,
        restSpeed: 8,
        stiffness: 500,
      },
      onComplete,
      onStop,
      onUpdate,
    });

    playback.stop();
    harness.set(50, 200);
    harness.complete();

    expect(harness.stop).toHaveBeenCalledOnce();
    expect(harness.destroy).toHaveBeenCalledOnce();
    expect(harness.unsubscribe).toHaveBeenCalledOnce();
    expect(onStop).toHaveBeenCalledOnce();
    expect(onUpdate).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });
});
