import { useEventListener, useResizeObserver } from "@vueuse/core";
import { computed, onMounted, type Ref } from "vue";

export interface RemeasurementOptions {
  additionalTargets?: readonly Readonly<Ref<Element | undefined>>[];
  target: Readonly<Ref<Element | undefined>>;
  measure: () => void;
}

export function useRemeasurement(options: RemeasurementOptions) {
  function remeasure() {
    options.measure();
  }

  const targets = [options.target, ...(options.additionalTargets ?? [])];
  const observedTargets = computed(() =>
    targets
      .map((target) => target.value)
      .filter(
        (target): target is HTMLElement | SVGElement =>
          typeof Element !== "undefined" &&
          Boolean(target) &&
          (target instanceof HTMLElement || target instanceof SVGElement),
      ),
  );
  useResizeObserver(observedTargets, remeasure);
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

  return { remeasure };
}
