import { afterEach, describe, expect, it, vi } from "vitest";

import { scheduleVerifiedFocusRestore } from "../src/internal/accessibility/focus-restore";

function useControlledAnimationFrames() {
  let nextFrame = 1;
  const callbacks = new Map<number, FrameRequestCallback>();
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    const frame = nextFrame;
    nextFrame += 1;
    callbacks.set(frame, callback);
    return frame;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((frame) => {
    callbacks.delete(frame);
  });

  return {
    flushNext() {
      const entry = callbacks.entries().next().value as [number, FrameRequestCallback] | undefined;
      if (!entry) return false;
      callbacks.delete(entry[0]);
      entry[1](0);
      return true;
    },
    pending: () => callbacks.size,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("verified focus restoration", () => {
  it("repairs later native cleanup and verifies a stable frame", () => {
    const frames = useControlledAnimationFrames();
    const opener = document.createElement("button");
    const nativeCleanupTarget = document.createElement("button");
    document.body.append(opener, nativeCleanupTarget);

    scheduleVerifiedFocusRestore({ isCurrent: () => true, opener, fallback: undefined });
    expect(document.activeElement).toBe(opener);

    nativeCleanupTarget.focus();
    expect(frames.flushNext()).toBe(true);
    expect(document.activeElement).toBe(opener);
    expect(frames.flushNext()).toBe(true);
    expect(frames.flushNext()).toBe(true);
    expect(frames.pending()).toBe(0);
    expect(document.activeElement).toBe(opener);
  });

  it("retries a temporarily disabled opener before falling back", () => {
    const frames = useControlledAnimationFrames();
    const opener = document.createElement("button");
    const fallback = document.createElement("button");
    opener.disabled = true;
    document.body.append(opener, fallback);

    scheduleVerifiedFocusRestore({ isCurrent: () => true, opener, fallback });
    expect(document.activeElement).not.toBe(fallback);
    expect(frames.flushNext()).toBe(true);
    expect(document.activeElement).not.toBe(fallback);

    opener.disabled = false;
    expect(frames.flushNext()).toBe(true);
    expect(document.activeElement).toBe(opener);
  });

  it("evaluates fallback only after a disconnected opener cannot recover", () => {
    const frames = useControlledAnimationFrames();
    const opener = document.createElement("button");
    const fallback = document.createElement("button");
    const fallbackResolver = vi.fn<() => HTMLButtonElement>(() => fallback);
    document.body.append(opener, fallback);

    scheduleVerifiedFocusRestore({ isCurrent: () => true, opener, fallback: fallbackResolver });
    expect(fallbackResolver).not.toHaveBeenCalled();
    opener.remove();
    expect(frames.flushNext()).toBe(true);
    expect(fallbackResolver).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(fallback);
  });

  it("does not steal focus when its lifecycle is already obsolete", () => {
    const frames = useControlledAnimationFrames();
    const opener = document.createElement("button");
    const newerOverlayTarget = document.createElement("button");
    document.body.append(opener, newerOverlayTarget);
    newerOverlayTarget.focus();

    scheduleVerifiedFocusRestore({ isCurrent: () => false, opener, fallback: undefined });

    expect(document.activeElement).toBe(newerOverlayTarget);
    expect(frames.flushNext()).toBe(true);
    expect(frames.pending()).toBe(0);
    expect(document.activeElement).toBe(newerOverlayTarget);
  });

  it("cancels scheduled verification work", () => {
    const frames = useControlledAnimationFrames();
    const opener = document.createElement("button");
    document.body.append(opener);
    const verification = scheduleVerifiedFocusRestore({
      isCurrent: () => true,
      opener,
      fallback: undefined,
    });
    expect(frames.pending()).toBe(1);

    verification.cancel();
    expect(frames.pending()).toBe(0);
  });
});
