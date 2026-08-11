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
    flushAll() {
      let remaining = 20;
      while (callbacks.size > 0 && remaining > 0) {
        const entry = callbacks.entries().next().value as
          | [number, FrameRequestCallback]
          | undefined;
        if (!entry) break;
        callbacks.delete(entry[0]);
        entry[1](0);
        remaining -= 1;
      }
      if (callbacks.size > 0) throw new Error("Focus verification exceeded its frame bound");
    },
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
  it("completes a stable synchronous handoff within its bounded frame window", () => {
    const frames = useControlledAnimationFrames();
    const opener = document.createElement("button");
    document.body.append(opener);

    scheduleVerifiedFocusRestore({ isCurrent: () => true, opener, fallback: undefined });
    expect(document.activeElement).toBe(opener);
    frames.flushAll();

    expect(document.activeElement).toBe(opener);
    expect(frames.pending()).toBe(0);
  });

  it("repairs later native cleanup and verifies a stable frame", () => {
    const frames = useControlledAnimationFrames();
    const opener = document.createElement("button");
    document.body.append(opener);

    scheduleVerifiedFocusRestore({ isCurrent: () => true, opener, fallback: undefined });
    expect(document.activeElement).toBe(opener);

    opener.blur();
    expect(document.activeElement).toBe(document.body);
    expect(frames.flushNext()).toBe(true);
    expect(document.activeElement).toBe(opener);
    expect(frames.flushNext()).toBe(true);
    expect(frames.flushNext()).toBe(true);
    expect(frames.pending()).toBe(0);
    expect(document.activeElement).toBe(opener);
  });

  it("does not reclaim the opener after a keyboard-like focus handoff", () => {
    const frames = useControlledAnimationFrames();
    const opener = document.createElement("button");
    const nextControl = document.createElement("button");
    document.body.append(opener, nextControl);

    scheduleVerifiedFocusRestore({ isCurrent: () => true, opener, fallback: undefined });
    expect(document.activeElement).toBe(opener);

    opener.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));
    nextControl.focus();
    expect(frames.flushNext()).toBe(true);

    expect(document.activeElement).toBe(nextControl);
    expect(frames.pending()).toBe(0);
  });

  it("does not reclaim the opener after a pointer-like focus handoff", () => {
    const frames = useControlledAnimationFrames();
    const opener = document.createElement("button");
    const clickedControl = document.createElement("button");
    document.body.append(opener, clickedControl);

    scheduleVerifiedFocusRestore({ isCurrent: () => true, opener, fallback: undefined });
    clickedControl.dispatchEvent(new PointerEvent("pointerdown"));
    clickedControl.focus();
    expect(frames.flushNext()).toBe(true);

    expect(document.activeElement).toBe(clickedControl);
    expect(frames.pending()).toBe(0);
  });

  it("does not reclaim the opener after an application focus handoff", () => {
    const frames = useControlledAnimationFrames();
    const opener = document.createElement("button");
    const applicationTarget = document.createElement("button");
    document.body.append(opener, applicationTarget);

    scheduleVerifiedFocusRestore({ isCurrent: () => true, opener, fallback: undefined });
    applicationTarget.focus();
    expect(frames.flushNext()).toBe(true);

    expect(document.activeElement).toBe(applicationTarget);
    expect(frames.pending()).toBe(0);
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
    frames.flushAll();
    expect(frames.pending()).toBe(0);
  });

  it("uses fallback only after a connected opener exhausts its bounded recovery", () => {
    const frames = useControlledAnimationFrames();
    const opener = document.createElement("button");
    const fallback = document.createElement("button");
    const fallbackResolver = vi.fn<() => HTMLButtonElement>(() => fallback);
    opener.disabled = true;
    document.body.append(opener, fallback);

    scheduleVerifiedFocusRestore({ isCurrent: () => true, opener, fallback: fallbackResolver });
    expect(fallbackResolver).not.toHaveBeenCalled();
    frames.flushAll();

    expect(fallbackResolver).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(fallback);
    expect(frames.pending()).toBe(0);
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

  it("stops when its lifecycle becomes obsolete after the handoff", () => {
    const frames = useControlledAnimationFrames();
    const opener = document.createElement("button");
    let current = true;
    document.body.append(opener);

    scheduleVerifiedFocusRestore({ isCurrent: () => current, opener, fallback: undefined });
    expect(document.activeElement).toBe(opener);
    current = false;
    opener.blur();
    expect(frames.flushNext()).toBe(true);

    expect(document.activeElement).toBe(document.body);
    expect(frames.pending()).toBe(0);
  });

  it("respects focus acquired by another open overlay during verification", () => {
    const frames = useControlledAnimationFrames();
    const opener = document.createElement("button");
    const newerDialog = document.createElement("dialog");
    const newerOverlayTarget = document.createElement("button");
    newerDialog.append(newerOverlayTarget);
    document.body.append(opener, newerDialog);
    newerDialog.setAttribute("open", "");

    scheduleVerifiedFocusRestore({ isCurrent: () => true, opener, fallback: undefined });
    newerOverlayTarget.focus();
    expect(frames.flushNext()).toBe(true);

    expect(document.activeElement).toBe(newerOverlayTarget);
    expect(frames.pending()).toBe(0);
  });

  it("repairs focus stranded in a closed native dialog", () => {
    const frames = useControlledAnimationFrames();
    const opener = document.createElement("button");
    const closedDialog = document.createElement("dialog");
    const cleanupTarget = document.createElement("button");
    closedDialog.append(cleanupTarget);
    document.body.append(opener, closedDialog);

    scheduleVerifiedFocusRestore({ isCurrent: () => true, opener, fallback: undefined });
    cleanupTarget.focus();
    expect(document.activeElement).toBe(cleanupTarget);
    expect(frames.flushNext()).toBe(true);

    expect(document.activeElement).toBe(opener);
    frames.flushAll();
    expect(frames.pending()).toBe(0);
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
