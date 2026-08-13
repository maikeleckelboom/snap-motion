import {
  DIRECT_MANIPULATION_TUNING,
  resolveDirectManipulationGesture,
  type DirectManipulationResolution,
} from "@snap-motion/core";
import { useEventListener } from "@vueuse/core";
import { onScopeDispose, type Ref } from "vue";

import { isElement } from "../dom/realm";
import { elementOwnsSnapMotionDrag, isSupportedPrimaryPointerStart } from "./pointer-policy";

export interface SurfaceGestureOptions {
  /** The element that owns the surface, used to decide whether focus began outside it. */
  readonly root: Ref<HTMLElement | undefined>;
  /** Selector identifying one content item's hit surface. */
  readonly itemSelector: string;
  /** Index of the item an element belongs to, or `-1`. */
  readonly resolveIndex: (element: HTMLElement) => number;
  /** Whether a tap on this item would open it rather than select it. */
  readonly isOpenEligible: (index: number) => boolean;
  readonly disabled?: () => boolean;
  /** Forwards a pointer that has been accepted, so the controller can take ownership. */
  readonly forwardPointerDown: (event: PointerEvent) => void;
  readonly onResolved: (
    resolution: DirectManipulationResolution,
    gesture: CompletedSurfaceGesture,
  ) => void;
}

export interface CompletedSurfaceGesture {
  readonly cancelled: boolean;
  readonly focusWasOutside: boolean;
  readonly originIndex: number | undefined;
}

/**
 * How long an armed suppression may wait for the click it exists to cancel.
 *
 * A browser dispatches the compatibility click immediately after the release that produced it, in
 * the same task or the next one. Anything that has not arrived by then is not that click — it is
 * some later, unrelated one — and consuming it would silently break a control the surface never
 * touched. This is a lifetime, not a debounce: nothing waits on it.
 */
const CLICK_SUPPRESSION_LIFETIME_MS = 300;

/** What a completed gesture asked for. The decision itself stays in core. */
function resolutionFor(tracked: TrackedGesture, onOrigin: boolean): DirectManipulationResolution {
  const horizontalIntent =
    Math.abs(tracked.deltaX) >=
    Math.abs(tracked.deltaY) * DIRECT_MANIPULATION_TUNING.horizontalIntentRatio;
  return resolveDirectManipulationGesture({
    cancelled: tracked.cancelled,
    crossedDragThreshold:
      tracked.maximumDisplacement >= DIRECT_MANIPULATION_TUNING.activationThreshold,
    horizontalIntent,
    involvedMultiplePointers: tracked.involvedMultiplePointers,
    openEligibleAtStart: tracked.openEligibleAtStart,
    releasedOnOrigin: onOrigin,
  });
}

function trackMovement(tracked: TrackedGesture, event: PointerEvent) {
  tracked.deltaX = event.clientX - tracked.startX;
  tracked.deltaY = event.clientY - tracked.startY;
  tracked.maximumDisplacement = Math.max(
    tracked.maximumDisplacement,
    Math.hypot(tracked.deltaX, tracked.deltaY),
  );
}

interface TrackedGesture {
  readonly focusWasOutside: boolean;
  readonly openEligibleAtStart: boolean;
  readonly originElement: HTMLElement | undefined;
  readonly originTarget: Element | undefined;
  readonly originIndex: number | undefined;
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  cancelled: boolean;
  deltaX: number;
  deltaY: number;
  involvedMultiplePointers: boolean;
  maximumDisplacement: number;
}

interface ArmedClickSuppression {
  readonly expiresAt: number;
  readonly originTarget: Element | undefined;
  readonly releaseTarget: Element | undefined;
  readonly releaseX: number;
  readonly releaseY: number;
}

/**
 * Tracks one direct-manipulation gesture over a surface of discrete items, and reports what it
 * asked for once it completes.
 *
 * Everything here is a browser question the framework-neutral arbitration cannot answer: which item
 * the finger went down on, whether the release landed on that same item once the surface has moved
 * under it, whether a second pointer joined, and where focus was when the gesture began. The
 * decision itself stays in core.
 */
export function useSurfaceGesture(options: SurfaceGestureOptions) {
  const activePointers = new Set<number>();
  let gesture: TrackedGesture | undefined;
  let disposed = false;
  /** Evidence tying one compatibility click to the swipe that armed its suppression. */
  let clickSuppression: ArmedClickSuppression | undefined;

  // Resolution is deferred by a microtask so a release and the controller's answer to it cannot
  // interleave. A scope torn down inside that window must not be spoken for afterwards.
  onScopeDispose(() => {
    disposed = true;
    gesture = undefined;
    clickSuppression = undefined;
    activePointers.clear();
  });

  /**
   * Items under a point, innermost first. `elementsFromPoint` is universal in browsers but absent
   * from the DOM implementations consumers run their own tests in, and a hit test that cannot be
   * performed is simply a hit test that found nothing — never a thrown gesture.
   */
  function itemsAtPoint(document: Document | undefined, x: number, y: number): HTMLElement[] {
    if (typeof document?.elementsFromPoint !== "function") return [];
    return document
      .elementsFromPoint(x, y)
      .map((element) => element.closest<HTMLElement>(options.itemSelector))
      .filter((element): element is HTMLElement => element !== null);
  }

  function cardAt(event: PointerEvent): HTMLElement | undefined {
    const direct = isElement(event.target)
      ? (event.target.closest<HTMLElement>(options.itemSelector) ?? undefined)
      : undefined;
    if (direct) return direct;
    return itemsAtPoint(options.root.value?.ownerDocument, event.clientX, event.clientY)[0];
  }

  /**
   * Whether the release landed on the item the gesture began on. Hit testing comes first because
   * the surface may have moved; the origin's own box is only consulted when nothing was hit at all.
   */
  function releasedOnOrigin(tracked: TrackedGesture, event: PointerEvent): boolean {
    const origin = tracked.originElement;
    if (!origin) return false;
    const releaseCard = isElement(event.target)
      ? (event.target.closest<HTMLElement>(options.itemSelector) ?? undefined)
      : undefined;
    if (releaseCard) return releaseCard === origin;
    const hitCards = itemsAtPoint(origin.ownerDocument, event.clientX, event.clientY);
    if (hitCards.some((element) => element === origin)) return true;
    if (hitCards.length > 0) return false;
    const rect = origin.getBoundingClientRect();
    return (
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom
    );
  }

  function publish(tracked: TrackedGesture, resolution: DirectManipulationResolution) {
    if (disposed) return;
    options.onResolved(resolution, {
      cancelled: tracked.cancelled,
      focusWasOutside: tracked.focusWasOutside,
      originIndex: tracked.originIndex,
    });
  }

  /**
   * Arms — or immediately disarms — the one-click suppression.
   *
   * Displacement alone is not grounds to consume a click. A vertical touch scroll displaces the
   * pointer by hundreds of pixels without this surface having moved at all, and eating the click
   * that follows it would take a button press away from a control the surface never touched. The
   * only thing that earns a suppression is a manipulation this surface actually consumed, which is
   * exactly what the core resolver calls a swipe.
   */
  function clearClickSuppression() {
    clickSuppression = undefined;
  }

  function armClickSuppression(
    tracked: TrackedGesture,
    resolution: DirectManipulationResolution,
    event: PointerEvent,
  ) {
    if (resolution.action !== "swipe") {
      clearClickSuppression();
      return;
    }
    clickSuppression = {
      expiresAt: Date.now() + CLICK_SUPPRESSION_LIFETIME_MS,
      originTarget: tracked.originTarget,
      releaseTarget: isElement(event.target) ? event.target : undefined,
      releaseX: event.clientX,
      releaseY: event.clientY,
    };
  }

  function onPointerDown(event: PointerEvent) {
    if (options.disabled?.() || disposed) return;
    // A new press supersedes whatever the previous one asked the browser to suppress.
    clearClickSuppression();
    // A control inside a consumer's item owns its own pointer. The low-level drag recognizer
    // already refuses these; the surface recognizer has to agree, or a press on a nested link
    // would still be tracked as a gesture and resolved as a selection when it is released.
    if (elementOwnsSnapMotionDrag(event.target)) return;
    if (gesture && !activePointers.has(event.pointerId)) {
      gesture.involvedMultiplePointers = true;
      activePointers.add(event.pointerId);
      options.forwardPointerDown(event);
      return;
    }
    if (!isSupportedPrimaryPointerStart(event)) return;

    const root = options.root.value;
    const activeElement = root?.ownerDocument.activeElement;
    const originElement = cardAt(event);
    const originIndex = originElement ? options.resolveIndex(originElement) : -1;
    gesture = {
      focusWasOutside: Boolean(root && (!activeElement || !root.contains(activeElement))),
      openEligibleAtStart: originIndex >= 0 && options.isOpenEligible(originIndex),
      originElement,
      originTarget: isElement(event.target) ? event.target : undefined,
      originIndex: originIndex >= 0 ? originIndex : undefined,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      cancelled: false,
      deltaX: 0,
      deltaY: 0,
      involvedMultiplePointers: false,
      maximumDisplacement: 0,
    };
    activePointers.add(event.pointerId);
    options.forwardPointerDown(event);
  }

  function abandon(event: PointerEvent) {
    const tracked = gesture;
    if (!tracked || event.pointerId !== tracked.pointerId) return;
    activePointers.delete(event.pointerId);
    tracked.cancelled = true;
    gesture = undefined;
    // A gesture that undid itself consumed nothing, so it leaves no suppression behind.
    clearClickSuppression();
    const resolution = resolutionFor(tracked, false);
    queueMicrotask(() => publish(tracked, resolution));
  }

  useEventListener(
    "pointermove",
    (event: PointerEvent) => {
      const tracked = gesture;
      if (!tracked || event.pointerId !== tracked.pointerId) return;
      trackMovement(tracked, event);
    },
    { passive: true },
  );

  useEventListener("pointerup", (event: PointerEvent) => {
    activePointers.delete(event.pointerId);
    const tracked = gesture;
    if (!tracked || event.pointerId !== tracked.pointerId) return;
    trackMovement(tracked, event);
    const resolution = resolutionFor(tracked, releasedOnOrigin(tracked, event));
    // Decided synchronously, because the browser's click follows this release before the deferred
    // publication runs — but decided from the same resolution the surface is about to act on, so
    // what suppresses a click is exactly what moved the surface.
    armClickSuppression(tracked, resolution, event);
    gesture = undefined;
    queueMicrotask(() => publish(tracked, resolution));
  });

  useEventListener("pointercancel", abandon);

  /**
   * Aborts the browser-side record without publishing a gesture result.
   *
   * Authoritative state has already decided what the surface means, so the old contact is not a
   * cancelled user navigation to resolve later. Clearing both the gesture and its suppression is
   * what keeps the high- and low-level recognizers in agreement after takeover.
   */
  function cancel() {
    gesture = undefined;
    activePointers.clear();
    clearClickSuppression();
  }

  /**
   * Cancels exactly one browser click, and only the one a manipulation this surface consumed
   * produced.
   *
   * A drag that ends over a link would otherwise both move the surface and follow the link. That is
   * the only reason this exists, so it is deliberately not a blanket `preventDefault` on the item:
   * a `#card` slot is arbitrary application content, and its buttons, links, and forms have to keep
   * working exactly as they would anywhere else.
   *
   * An armed suppression the browser never spends expires rather than waiting. Some manipulations
   * produce no compatibility click at all, and a suppression that outlived its own gesture would
   * silently swallow whatever the user clicked next — minutes later, on a control that has nothing
   * to do with the drag that armed it.
   */
  function onClick(event: MouseEvent) {
    const armed = clickSuppression;
    if (!armed) return;
    if (Date.now() > armed.expiresAt) {
      clearClickSuppression();
      return;
    }
    // Keyboard activation reports detail zero and no meaningful pointer coordinates.
    if (event.detail <= 0 || event.button !== 0) return;
    if (Math.hypot(event.clientX - armed.releaseX, event.clientY - armed.releaseY) > 4) return;
    const target = isElement(event.target) ? event.target : undefined;
    if (!target || (target !== armed.originTarget && target !== armed.releaseTarget)) return;

    clearClickSuppression();
    event.preventDefault();
    event.stopPropagation();
  }

  return {
    cancel,
    onClick,
    onPointerDown,
    onLostPointerCapture: abandon,
  };
}
