import type { FocusReturnOptions } from "../../contracts/focus-contracts";
import { captureFocusOpener, restoreFocus } from "./focus";

export interface FocusRestoreVerification {
  cancel(): void;
}

function focusTarget(target: HTMLElement | undefined) {
  restoreFocus({ opener: target });
}

/**
 * Returns focus when the close lifecycle has not already handed it elsewhere, then verifies the
 * current owner across rendering opportunities. Native dialog cleanup can run around the close
 * event handler, so a successful focus handoff is not yet proof that its owner retained focus.
 */
export function scheduleVerifiedFocusRestore(options: {
  fallback: FocusReturnOptions["fallback"] | undefined;
  isCurrent: () => boolean;
  opener: HTMLElement | undefined;
}): FocusRestoreVerification {
  const view =
    options.opener?.ownerDocument.defaultView ??
    (typeof window === "undefined" ? undefined : window);
  const documentTarget = view?.document;
  let frame: number | undefined;
  let restoreTarget = options.opener;
  let transferred = false;
  // Four retries form a bounded browser-cleanup verification window: enough to observe native
  // dialog cleanup, retry a temporarily unavailable opener, and confirm one stable frame without
  // turning focus return into an animation-duration wait.
  let remainingAttempts = 4;
  // The retries plus two stable-owner observations also cap the listener lifetime when application
  // code keeps moving focus throughout the cleanup window.
  let remainingFrames = 6;
  let observedStableFrame = false;
  let stopped = false;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (frame !== undefined) view?.cancelAnimationFrame(frame);
    frame = undefined;
    documentTarget?.removeEventListener("focusin", onFocusIn, true);
  };
  const onFocusIn = () => {
    if (!options.isCurrent()) {
      stop();
      return;
    }
    const owner = captureFocusOpener(documentTarget);
    if (!owner || owner === restoreTarget) return;
    // Once focus has moved away from the returned opener, native dialog cleanup must not transfer
    // verification ownership back to it. The verifier may repair the new owner, never reclaim it.
    if (transferred && owner === options.opener) return;
    restoreTarget = owner;
    transferred ||= owner !== options.opener;
    observedStableFrame = false;
  };

  const schedule = () => {
    if (!view || stopped) return;
    if (remainingFrames === 0) {
      stop();
      return;
    }
    remainingFrames--;
    frame = view.requestAnimationFrame(verify);
  };
  const verify = () => {
    frame = undefined;
    if (stopped || !options.isCurrent()) {
      stop();
      return;
    }
    const target = restoreTarget;
    if (transferred && !target?.isConnected) {
      stop();
      return;
    }
    if (target?.isConnected && target.ownerDocument.activeElement === target) {
      if (observedStableFrame) {
        stop();
        return;
      }
      observedStableFrame = true;
      schedule();
      return;
    }
    // Before ownership transfers, body/document focus and focus stranded in a closed native dialog
    // are browser cleanup worth repairing. A connected element establishes the short-lived owner.
    const owner = captureFocusOpener(documentTarget);
    if (transferred) {
      if (owner && owner !== options.opener) {
        restoreTarget = owner;
        observedStableFrame = false;
        schedule();
        return;
      }
      if (owner === options.opener && target?.isConnected && remainingAttempts > 0) {
        remainingAttempts--;
        focusTarget(target);
        observedStableFrame = false;
        schedule();
        return;
      }
      // A transferred target owns the bounded cleanup window. Losing it to body/document focus or
      // disconnection is an application handoff too, so verification ends without a fallback.
      stop();
      return;
    }
    if (owner) {
      restoreTarget = owner;
      transferred = owner !== options.opener;
      observedStableFrame = false;
      schedule();
      return;
    }
    observedStableFrame = false;
    if (target?.isConnected && remainingAttempts > 0) {
      remainingAttempts--;
      focusTarget(target);
      schedule();
      return;
    }
    stop();
    restoreFocus({ fallback: options.fallback });
  };

  if (!view || !documentTarget || !options.isCurrent()) {
    return { cancel: stop };
  }
  documentTarget.addEventListener("focusin", onFocusIn, true);
  const initialOwner = captureFocusOpener(documentTarget);
  if (
    initialOwner &&
    initialOwner !== options.opener &&
    (!(initialOwner instanceof HTMLDialogElement) ||
      !initialOwner.open ||
      !options.opener ||
      !initialOwner.contains(options.opener))
  ) {
    restoreTarget = initialOwner;
    transferred = true;
  } else {
    focusTarget(options.opener);
  }
  schedule();
  return {
    cancel: stop,
  };
}
