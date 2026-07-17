import { onMounted, onScopeDispose, watch, type Ref } from "vue";

export interface RemeasurementOptions {
  additionalTargets?: readonly Readonly<Ref<Element | undefined>>[];
  target: Readonly<Ref<Element | undefined>>;
  measure: () => void;
}

export function useRemeasurement(options: RemeasurementOptions) {
  let resizeObserver: ResizeObserver | undefined;
  let stopTargetWatch: (() => void) | undefined;

  function observeTargets(targets: readonly (Element | undefined)[]) {
    resizeObserver?.disconnect();
    for (const target of targets) {
      if (target) {
        resizeObserver?.observe(target);
      }
    }
  }

  function remeasure() {
    options.measure();
  }

  onMounted(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (typeof window.ResizeObserver === "function") {
      resizeObserver = new window.ResizeObserver(remeasure);
    }
    const targetRefs = [options.target, ...(options.additionalTargets ?? [])];
    stopTargetWatch = watch(() => targetRefs.map((target) => target.value), observeTargets, {
      immediate: true,
    });
    window.addEventListener("resize", remeasure);
    window.addEventListener("orientationchange", remeasure);
    window.visualViewport?.addEventListener("resize", remeasure);
    remeasure();
  });

  onScopeDispose(() => {
    stopTargetWatch?.();
    resizeObserver?.disconnect();
    if (typeof window !== "undefined") {
      window.removeEventListener("resize", remeasure);
      window.removeEventListener("orientationchange", remeasure);
      window.visualViewport?.removeEventListener("resize", remeasure);
    }
  });

  return { remeasure };
}
