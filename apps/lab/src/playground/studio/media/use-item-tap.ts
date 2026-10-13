import { DIRECT_MANIPULATION_TUNING, resolveDirectManipulationGesture } from "@snap-motion/core";
import { useEventListener } from "@vueuse/core";
import type { Ref } from "vue";

/**
 * Which item a completed pointer gesture meant to open, if any.
 *
 * The carousel's drag recogniser belongs to the package and decides whether a gesture moved the
 * strip. A strip of items also needs the other half: whether a gesture that did not move it was a
 * tap, and on which item. The package already states that rule once for its own surfaces, in core's
 * `resolveDirectManipulationGesture`, so this reuses it rather than inventing a second threshold:
 *
 * - a press that travelled past the activation threshold manipulated the strip and opens nothing,
 *   wherever it was released;
 * - a press that did not is a tap on the item it began on;
 * - a press that began while the strip was still moving is a catch, not a tap. It stops the strip
 *   (the recogniser does that) and must not also open whatever slid under the finger;
 * - a second finger joining ends the question.
 *
 * The decision is made from where the press began, never from where the strip ended up.
 */
export interface ItemTapOptions {
  readonly viewport: Ref<HTMLElement | undefined>;
  /** The item under a press, or `undefined` for the gap between items. */
  readonly itemAt: (target: EventTarget | null) => { id: string; element: HTMLElement } | undefined;
  /** Whether the strip is moving right now. Read before the recogniser interrupts it. */
  readonly isMoving: () => boolean;
  readonly onTap: (id: string, element: HTMLElement) => void;
}

interface Press {
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  readonly id: string | undefined;
  readonly element: HTMLElement | undefined;
  readonly movingAtStart: boolean;
  deltaX: number;
  deltaY: number;
  maximumDisplacement: number;
  multiple: boolean;
}

export function useItemTap(options: ItemTapOptions) {
  let press: Press | undefined;

  useEventListener(
    options.viewport,
    "pointerdown",
    (event: PointerEvent) => {
      if (press) {
        press.multiple = true;
        return;
      }
      if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
      const hit = options.itemAt(event.target);
      press = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        id: hit?.id,
        element: hit?.element,
        movingAtStart: options.isMoving(),
        deltaX: 0,
        deltaY: 0,
        maximumDisplacement: 0,
        multiple: false,
      };
    },
    // Capture: the strip's own handler interrupts the motion this has to read first.
    { capture: true },
  );

  useEventListener(
    () => (typeof window === "undefined" ? undefined : window),
    "pointermove",
    (event: PointerEvent) => {
      if (!press || event.pointerId !== press.pointerId) return;
      press.deltaX = event.clientX - press.startX;
      press.deltaY = event.clientY - press.startY;
      press.maximumDisplacement = Math.max(
        press.maximumDisplacement,
        Math.hypot(press.deltaX, press.deltaY),
      );
    },
    { passive: true },
  );

  function finish(event: PointerEvent, cancelled: boolean) {
    const tracked = press;
    if (!tracked || event.pointerId !== tracked.pointerId) return;
    press = undefined;
    const resolution = resolveDirectManipulationGesture({
      cancelled,
      crossedDragThreshold:
        tracked.maximumDisplacement >= DIRECT_MANIPULATION_TUNING.activationThreshold,
      horizontalIntent:
        Math.abs(tracked.deltaX) >=
        Math.abs(tracked.deltaY) * DIRECT_MANIPULATION_TUNING.horizontalIntentRatio,
      involvedMultiplePointers: tracked.multiple,
      openEligibleAtStart: tracked.id !== undefined && !tracked.movingAtStart,
      releasedOnOrigin: true,
    });
    if (resolution.action === "open" && tracked.id !== undefined && tracked.element) {
      options.onTap(tracked.id, tracked.element);
    }
  }

  useEventListener(
    () => (typeof window === "undefined" ? undefined : window),
    "pointerup",
    (event: PointerEvent) => finish(event, false),
  );
  useEventListener(
    () => (typeof window === "undefined" ? undefined : window),
    "pointercancel",
    (event: PointerEvent) => finish(event, true),
  );

  return { cancel: () => (press = undefined) };
}
