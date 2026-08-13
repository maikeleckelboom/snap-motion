import { afterEach, describe, expect, it, vi } from "vitest";

import {
  observeFocusHandoffFromOpener,
  scheduleVerifiedFocusRestore,
} from "../src/internal/accessibility/focus-restore";

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

function useFocusListenerLifecycle(type = "focusin") {
  const addEventListener = vi.spyOn(document, "addEventListener");
  const removeEventListener = vi.spyOn(document, "removeEventListener");

  return {
    expectNotAdded() {
      expect(addEventListener.mock.calls.some(([eventType]) => eventType === type)).toBe(false);
    },
    expectRemoved() {
      const registration = addEventListener.mock.calls.find(([eventType]) => eventType === type);
      if (!registration) throw new Error("Focus verification listener was not registered");
      expect(removeEventListener).toHaveBeenCalledWith(type, registration[1], true);
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("verified focus restoration", () => {
  it("observes only an explicit-opener application handoff before native close finalizes", () => {
    const opener = document.createElement("button");
    const directCleanupOwner = document.createElement("button");
    const applicationTarget = document.createElement("button");
    document.body.append(opener, directCleanupOwner, applicationTarget);
    const listener = useFocusListenerLifecycle("focus");
    const observation = observeFocusHandoffFromOpener(opener);

    directCleanupOwner.focus();
    opener.addEventListener("focus", () => applicationTarget.focus(), { once: true });
    opener.focus();
    directCleanupOwner.focus();

    expect(observation.consume()).toBe(applicationTarget);
    listener.expectRemoved();
  });

  it("ignores invalid pre-close handoff owners and cancels obsolete observations", () => {
    const opener = document.createElement("button");
    const applicationTarget = document.createElement("button");
    const closedDialog = document.createElement("dialog");
    const closedDialogTarget = document.createElement("button");
    closedDialog.append(closedDialogTarget);
    document.body.append(opener, applicationTarget, closedDialog);
    const listener = useFocusListenerLifecycle("focus");
    const observation = observeFocusHandoffFromOpener(opener);

    opener.dispatchEvent(new FocusEvent("focus"));
    document.body.dispatchEvent(new FocusEvent("focus"));
    closedDialogTarget.dispatchEvent(new FocusEvent("focus"));
    applicationTarget.dispatchEvent(new FocusEvent("focus"));
    observation.cancel();

    expect(observation.consume()).toBeUndefined();
    listener.expectRemoved();
  });

  it("completes a stable synchronous handoff within its bounded frame window", () => {
    const frames = useControlledAnimationFrames();
    const opener = document.createElement("button");
    document.body.append(opener);
    const listener = useFocusListenerLifecycle();

    scheduleVerifiedFocusRestore({ isCurrent: () => true, opener, fallback: undefined });
    expect(document.activeElement).toBe(opener);
    frames.flushAll();

    expect(document.activeElement).toBe(opener);
    expect(frames.pending()).toBe(0);
    listener.expectRemoved();
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

  it("preserves a keyboard-like focus handoff across later native cleanup", () => {
    const frames = useControlledAnimationFrames();
    const listener = useFocusListenerLifecycle();
    const opener = document.createElement("button");
    const nextControl = document.createElement("button");
    document.body.append(opener, nextControl);

    scheduleVerifiedFocusRestore({ isCurrent: () => true, opener, fallback: undefined });
    expect(document.activeElement).toBe(opener);

    opener.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));
    nextControl.focus();
    opener.focus();
    frames.flushAll();

    expect(document.activeElement).toBe(nextControl);
    expect(frames.pending()).toBe(0);
    listener.expectRemoved();
  });

  it("preserves a pointer-like focus handoff across later native cleanup", () => {
    const frames = useControlledAnimationFrames();
    const opener = document.createElement("button");
    const clickedControl = document.createElement("button");
    document.body.append(opener, clickedControl);

    scheduleVerifiedFocusRestore({ isCurrent: () => true, opener, fallback: undefined });
    clickedControl.dispatchEvent(new PointerEvent("pointerdown"));
    clickedControl.focus();
    opener.focus();
    frames.flushAll();

    expect(document.activeElement).toBe(clickedControl);
    expect(frames.pending()).toBe(0);
  });

  it("preserves an application focus-event handoff across later native cleanup", () => {
    const frames = useControlledAnimationFrames();
    const opener = document.createElement("button");
    const applicationTarget = document.createElement("button");
    document.body.append(opener, applicationTarget);
    opener.addEventListener("focus", () => applicationTarget.focus(), { once: true });

    scheduleVerifiedFocusRestore({ isCurrent: () => true, opener, fallback: undefined });
    expect(document.activeElement).toBe(applicationTarget);
    opener.focus();
    frames.flushAll();

    expect(document.activeElement).toBe(applicationTarget);
    expect(frames.pending()).toBe(0);
  });

  it("preserves application focus acquired before verification starts", () => {
    const frames = useControlledAnimationFrames();
    const listener = useFocusListenerLifecycle();
    const opener = document.createElement("button");
    const applicationTarget = document.createElement("button");
    document.body.append(opener, applicationTarget);
    applicationTarget.focus();

    scheduleVerifiedFocusRestore({ isCurrent: () => true, opener, fallback: undefined });
    frames.flushAll();

    expect(document.activeElement).toBe(applicationTarget);
    expect(frames.pending()).toBe(0);
    listener.expectRemoved();
  });

  it("returns to an explicit opener despite an initial native cleanup owner", () => {
    const frames = useControlledAnimationFrames();
    const opener = document.createElement("button");
    const cleanupOwner = document.createElement("section");
    cleanupOwner.tabIndex = -1;
    document.body.append(opener, cleanupOwner);
    cleanupOwner.focus();

    scheduleVerifiedFocusRestore({
      explicitOpener: true,
      fallback: undefined,
      isCurrent: () => true,
      opener,
    });
    frames.flushAll();

    expect(document.activeElement).toBe(opener);
    expect(frames.pending()).toBe(0);
  });

  it("repairs a pre-close explicit-opener handoff through later native cleanup", () => {
    const frames = useControlledAnimationFrames();
    const opener = document.createElement("button");
    const applicationTarget = document.createElement("button");
    document.body.append(opener, applicationTarget);
    opener.focus();

    scheduleVerifiedFocusRestore({
      explicitOpener: true,
      fallback: undefined,
      initialTransferredOwner: applicationTarget,
      isCurrent: () => true,
      opener,
    });
    expect(document.activeElement).toBe(applicationTarget);
    opener.focus();
    expect(document.activeElement).toBe(opener);
    frames.flushAll();

    expect(document.activeElement).toBe(applicationTarget);
    expect(frames.pending()).toBe(0);
  });

  it("preserves a synchronous focus-event application handoff from an explicit opener", () => {
    const frames = useControlledAnimationFrames();
    const opener = document.createElement("button");
    const applicationTarget = document.createElement("button");
    document.body.append(opener, applicationTarget);
    opener.addEventListener("focus", () => applicationTarget.focus(), { once: true });

    scheduleVerifiedFocusRestore({
      explicitOpener: true,
      fallback: undefined,
      isCurrent: () => true,
      opener,
    });
    expect(document.activeElement).toBe(applicationTarget);
    opener.focus();
    expect(document.activeElement).toBe(opener);
    frames.flushAll();

    expect(document.activeElement).toBe(applicationTarget);
    expect(frames.pending()).toBe(0);
  });

  it("records a focus-event owner after activeElement has already changed", () => {
    const frames = useControlledAnimationFrames();
    const opener = document.createElement("button");
    const applicationTarget = document.createElement("button");
    document.body.append(opener, applicationTarget);

    scheduleVerifiedFocusRestore({
      explicitOpener: true,
      fallback: undefined,
      isCurrent: () => true,
      opener,
    });
    applicationTarget.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(document.activeElement).toBe(opener);
    frames.flushAll();

    expect(document.activeElement).toBe(applicationTarget);
    expect(frames.pending()).toBe(0);
  });

  it("repairs initial WebKit cleanup focus on an opener's still-open parent dialog", () => {
    const frames = useControlledAnimationFrames();
    const parentDialog = document.createElement("dialog");
    const opener = document.createElement("button");
    parentDialog.append(opener);
    document.body.append(parentDialog);
    parentDialog.setAttribute("open", "");
    parentDialog.tabIndex = -1;
    parentDialog.focus();

    scheduleVerifiedFocusRestore({ isCurrent: () => true, opener, fallback: undefined });
    frames.flushAll();

    expect(document.activeElement).toBe(opener);
    expect(frames.pending()).toBe(0);
  });

  it("preserves an initial control owner inside the opener's parent dialog", () => {
    const frames = useControlledAnimationFrames();
    const parentDialog = document.createElement("dialog");
    const opener = document.createElement("button");
    const applicationTarget = document.createElement("button");
    parentDialog.append(opener, applicationTarget);
    document.body.append(parentDialog);
    parentDialog.setAttribute("open", "");
    applicationTarget.focus();

    scheduleVerifiedFocusRestore({ isCurrent: () => true, opener, fallback: undefined });
    frames.flushAll();

    expect(document.activeElement).toBe(applicationTarget);
    expect(frames.pending()).toBe(0);
  });

  it("does not reclaim after a transferred owner stabilizes and later blurs", () => {
    const frames = useControlledAnimationFrames();
    const listener = useFocusListenerLifecycle();
    const opener = document.createElement("button");
    const applicationTarget = document.createElement("button");
    document.body.append(opener, applicationTarget);

    scheduleVerifiedFocusRestore({ isCurrent: () => true, opener, fallback: undefined });
    applicationTarget.focus();
    frames.flushAll();
    listener.expectRemoved();
    const focusTarget = vi.spyOn(applicationTarget, "focus");
    applicationTarget.blur();
    opener.focus();

    expect(document.activeElement).toBe(opener);
    expect(focusTarget).not.toHaveBeenCalled();
    expect(frames.pending()).toBe(0);
  });

  it("ends a transferred verification when its owner disconnects", () => {
    const frames = useControlledAnimationFrames();
    const listener = useFocusListenerLifecycle();
    const opener = document.createElement("button");
    const applicationTarget = document.createElement("button");
    const fallback = document.createElement("button");
    document.body.append(opener, applicationTarget, fallback);

    scheduleVerifiedFocusRestore({ isCurrent: () => true, opener, fallback });
    applicationTarget.focus();
    const fallbackFocus = vi.spyOn(fallback, "focus");
    applicationTarget.remove();
    frames.flushAll();

    expect(fallbackFocus).not.toHaveBeenCalled();
    expect(frames.pending()).toBe(0);
    listener.expectRemoved();
  });

  it("does not reclaim after a transferred owner stabilizes and later disconnects", () => {
    const frames = useControlledAnimationFrames();
    const listener = useFocusListenerLifecycle();
    const opener = document.createElement("button");
    const applicationTarget = document.createElement("button");
    document.body.append(opener, applicationTarget);

    scheduleVerifiedFocusRestore({ isCurrent: () => true, opener, fallback: undefined });
    applicationTarget.focus();
    frames.flushAll();
    listener.expectRemoved();
    applicationTarget.remove();
    opener.focus();

    expect(document.activeElement).toBe(opener);
    expect(frames.pending()).toBe(0);
  });

  it("bounds verification when application focus ownership keeps changing", () => {
    const frames = useControlledAnimationFrames();
    const listener = useFocusListenerLifecycle();
    const opener = document.createElement("button");
    const firstTarget = document.createElement("button");
    const secondTarget = document.createElement("button");
    document.body.append(opener, firstTarget, secondTarget);

    scheduleVerifiedFocusRestore({ isCurrent: () => true, opener, fallback: undefined });
    firstTarget.focus();
    let flushed = 0;
    while (frames.flushNext()) {
      flushed += 1;
      (document.activeElement === firstTarget ? secondTarget : firstTarget).focus();
    }

    expect(flushed).toBe(6);
    expect(frames.pending()).toBe(0);
    listener.expectRemoved();
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
    const listener = useFocusListenerLifecycle();
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
    listener.expectRemoved();
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
    const listener = useFocusListenerLifecycle();
    const opener = document.createElement("button");
    const newerOverlayTarget = document.createElement("button");
    document.body.append(opener, newerOverlayTarget);
    newerOverlayTarget.focus();

    scheduleVerifiedFocusRestore({ isCurrent: () => false, opener, fallback: undefined });

    expect(document.activeElement).toBe(newerOverlayTarget);
    expect(frames.flushNext()).toBe(false);
    expect(frames.pending()).toBe(0);
    expect(document.activeElement).toBe(newerOverlayTarget);
    listener.expectNotAdded();
  });

  it("stops when its lifecycle becomes obsolete after the handoff", () => {
    const frames = useControlledAnimationFrames();
    const listener = useFocusListenerLifecycle();
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
    listener.expectRemoved();
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
    const listener = useFocusListenerLifecycle();
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
    listener.expectRemoved();
  });
});
