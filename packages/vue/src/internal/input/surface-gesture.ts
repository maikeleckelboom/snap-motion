import {
  DIRECT_MANIPULATION_TUNING,
  resolveDirectManipulationGesture,
  type DirectManipulationResolution,
} from "@snap-motion/core";
import { useEventListener } from "@vueuse/core";
import type { Ref } from "vue";

import { isSupportedPrimaryPointerStart } from "./pointer-policy";

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

  function cardAt(event: PointerEvent): HTMLElement | undefined {
    const direct =
      event.target instanceof Element
        ? (event.target.closest<HTMLElement>(options.itemSelector) ?? undefined)
        : undefined;
    if (direct) return direct;
    return options.root.value?.ownerDocument
      .elementsFromPoint(event.clientX, event.clientY)
      .map((element) => element.closest<HTMLElement>(options.itemSelector))
      .find((element): element is HTMLElement => element !== null);
  }

  /**
   * Whether the release landed on the item the gesture began on. Hit testing comes first because
   * the surface may have moved; the origin's own box is only consulted when nothing was hit at all.
   */
  function releasedOnOrigin(tracked: TrackedGesture, event: PointerEvent): boolean {
    const origin = tracked.originElement;
    if (!origin) return false;
    const releaseCard =
      event.target instanceof Element
        ? (event.target.closest<HTMLElement>(options.itemSelector) ?? undefined)
        : undefined;
    if (releaseCard) return releaseCard === origin;
    const hitCards = origin.ownerDocument
      .elementsFromPoint(event.clientX, event.clientY)
      .map((element) => element.closest<HTMLElement>(options.itemSelector))
      .filter((element): element is HTMLElement => element !== null);
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

  function resolve(tracked: TrackedGesture, onOrigin: boolean) {
    const horizontalIntent =
      Math.abs(tracked.deltaX) >=
      Math.abs(tracked.deltaY) * DIRECT_MANIPULATION_TUNING.horizontalIntentRatio;
    const resolution = resolveDirectManipulationGesture({
      cancelled: tracked.cancelled,
      crossedDragThreshold:
        tracked.maximumDisplacement >= DIRECT_MANIPULATION_TUNING.activationThreshold,
      horizontalIntent,
      involvedMultiplePointers: tracked.involvedMultiplePointers,
      openEligibleAtStart: tracked.openEligibleAtStart,
      releasedOnOrigin: onOrigin,
    });
    options.onResolved(resolution, {
      cancelled: tracked.cancelled,
      focusWasOutside: tracked.focusWasOutside,
      originIndex: tracked.originIndex,
    });
  }

  function onPointerDown(event: PointerEvent) {
    if (options.disabled?.()) return;
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
    queueMicrotask(() => resolve(tracked, false));
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
    const onOrigin = releasedOnOrigin(tracked, event);
    gesture = undefined;
    queueMicrotask(() => resolve(tracked, onOrigin));
  });

  useEventListener("pointercancel", abandon);

  return {
    onPointerDown,
    onLostPointerCapture: abandon,
  };
}
