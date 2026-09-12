import { useEventListener } from "@vueuse/core";
import type { Ref } from "vue";

import { isElement } from "../dom/realm";

/** Preserve focus-visible styling while a prevented pointer gesture transfers focus by script. */
export function useSurfaceFocus(surface: Ref<HTMLElement | undefined>) {
  // A Tab arriving from outside must clear a prior tap that never transferred focus to this root.
  useEventListener(
    () => surface.value?.ownerDocument,
    "keydown",
    () => {
      surface.value?.removeAttribute("data-snap-motion-pointer-focus");
    },
    { capture: true },
  );
  useEventListener(
    surface,
    ["pointerdown", "focusout"],
    (event) => {
      if (
        event.type === "focusout" &&
        "relatedTarget" in event &&
        isElement(event.relatedTarget) &&
        surface.value?.contains(event.relatedTarget)
      )
        return;
      surface.value?.toggleAttribute(
        "data-snap-motion-pointer-focus",
        event.type === "pointerdown",
      );
    },
    { capture: true },
  );
}
