import { describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";

import { whenReady } from "../src/playground/studio/studio-replay";

/**
 * A subscription that outlives its wait shows up as the condition being read again when its source
 * changes, so each test counts reads of the condition as well as calls of the callback.
 */
function condition(initial: boolean) {
  const source = ref(initial);
  const read = vi.fn<() => boolean>();
  read.mockImplementation(() => source.value);
  return { read, source };
}

async function turnOffAndOn(source: { value: boolean }) {
  source.value = false;
  await nextTick();
  source.value = true;
  await nextTick();
}

describe("whenReady", () => {
  it("calls back at once when the condition already holds, and holds no subscription afterwards", async () => {
    const { read, source } = condition(true);
    const onReady = vi.fn<() => void>();

    whenReady(read, onReady);
    expect(onReady).toHaveBeenCalledTimes(1);
    const reads = read.mock.calls.length;

    // A visitor moves a stage away and brings it back. Nothing is waiting, so nothing reads or calls.
    await turnOffAndOn(source);
    expect(read).toHaveBeenCalledTimes(reads);
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it("waits for the condition, calls back once, and stops watching", async () => {
    const { read, source } = condition(false);
    const onReady = vi.fn<() => void>();

    whenReady(read, onReady);
    expect(onReady).not.toHaveBeenCalled();

    source.value = true;
    await nextTick();
    expect(onReady).toHaveBeenCalledTimes(1);
    const reads = read.mock.calls.length;

    await turnOffAndOn(source);
    expect(read).toHaveBeenCalledTimes(reads);
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it("is cancelled by the function it returns", async () => {
    const { read, source } = condition(false);
    const onReady = vi.fn<() => void>();

    const cancel = whenReady(read, onReady);
    cancel();
    const reads = read.mock.calls.length;
    source.value = true;
    await nextTick();

    expect(onReady).not.toHaveBeenCalled();
    expect(read).toHaveBeenCalledTimes(reads);
  });

  it("can be cancelled after it has finished", () => {
    const { read } = condition(true);
    const onReady = vi.fn<() => void>();

    const cancel = whenReady(read, onReady);
    cancel();
    cancel();
    expect(onReady).toHaveBeenCalledTimes(1);
  });
});
