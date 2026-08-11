import type { FocusReturnOptions } from "../../contracts/focus-contracts";
import { restoreFocus } from "./focus";

export interface FocusRestoreVerification {
  cancel(): void;
}

/**
 * Restores focus immediately, then verifies it across rendering opportunities. WebKit can apply
 * native dialog focus cleanup after the close event handler, so a successful synchronous focus is
 * not yet proof that the opener retained ownership.
 */
export function scheduleVerifiedFocusRestore(options: {
  fallback: FocusReturnOptions["fallback"] | undefined;
  isCurrent: () => boolean;
  opener: HTMLElement | undefined;
}): FocusRestoreVerification {
  const view =
    options.opener?.ownerDocument.defaultView ??
    (typeof window === "undefined" ? undefined : window);
  let frame: number | undefined;
  // Four retries form a bounded browser-cleanup verification window: enough to observe native
  // dialog cleanup, retry a temporarily unavailable opener, and confirm one stable frame without
  // turning focus return into an animation-duration wait.
  let remainingAttempts = 4;
  let observedStableFrame = false;
  let cancelled = false;

  const schedule = () => {
    if (!view || cancelled) return;
    frame = view.requestAnimationFrame(verify);
  };
  const verify = () => {
    frame = undefined;
    if (cancelled || !options.isCurrent()) return;
    const opener = options.opener;
    if (opener?.isConnected && opener.ownerDocument.activeElement === opener) {
      if (observedStableFrame) return;
      observedStableFrame = true;
      schedule();
      return;
    }
    observedStableFrame = false;
    if (opener?.isConnected && remainingAttempts > 0) {
      remainingAttempts -= 1;
      restoreFocus({ opener });
      schedule();
      return;
    }
    restoreFocus({ fallback: options.fallback });
  };

  if (options.isCurrent()) restoreFocus({ opener: options.opener });
  schedule();
  return {
    cancel() {
      cancelled = true;
      if (frame !== undefined) view?.cancelAnimationFrame(frame);
      frame = undefined;
    },
  };
}
