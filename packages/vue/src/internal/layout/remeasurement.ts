/** Coalesced DOM and visual-viewport measurement lifecycle. */
import { useEventListener, useResizeObserver } from "@vueuse/core";
import { computed, onMounted, onScopeDispose, type Ref } from "vue";

import { isHTMLElement, isSVGElement } from "../dom/realm";

export interface RemeasurementOptions {
  additionalTargets?: readonly Readonly<Ref<Element | undefined>>[];
  deferResizeObserver?: boolean;
  target: Readonly<Ref<Element | undefined>>;
  measure: () => void;
}

export function useRemeasurement(options: RemeasurementOptions) {
  let resizeFrame: number | undefined;

  function remeasure() {
    options.measure();
  }

  function onResizeObserver() {
    if (!options.deferResizeObserver || typeof window === "undefined") {
      remeasure();
      return;
    }
    if (resizeFrame !== undefined) return;
    resizeFrame = window.requestAnimationFrame(() => {
      resizeFrame = undefined;
      remeasure();
    });
  }

  const targets = [options.target, ...(options.additionalTargets ?? [])];
  const observedTargets = computed(() =>
    targets
      .map((target) => target.value)
      .filter(
        (target): target is HTMLElement | SVGElement =>
          isHTMLElement(target) || isSVGElement(target),
      ),
  );
  useResizeObserver(observedTargets, onResizeObserver);
  useEventListener(
    () => (typeof window === "undefined" ? undefined : window),
    ["resize", "orientationchange"],
    remeasure,
  );
  useEventListener(
    () => (typeof window === "undefined" ? undefined : window.visualViewport),
    "resize",
    remeasure,
  );

  onMounted(() => {
    remeasure();
  });
  onScopeDispose(() => {
    if (resizeFrame !== undefined && typeof window !== "undefined") {
      window.cancelAnimationFrame(resizeFrame);
    }
  });

  return { remeasure };
}
