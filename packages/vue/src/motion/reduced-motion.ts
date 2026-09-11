/** Domain reduced-motion state with a deterministic test/application override. */
import { useMounted, usePreferredReducedMotion } from "@vueuse/core";
import { computed, getCurrentInstance, type Ref } from "vue";

export interface ReducedMotionOptions {
  override?: Readonly<Ref<boolean | undefined>>;
}

export function useReducedMotionPreference(options: ReducedMotionOptions = {}) {
  const systemPreference = usePreferredReducedMotion();
  const componentOwned = getCurrentInstance() !== null;
  const mounted = useMounted();
  // Browser preferences cannot participate in a component's first hydrating render. Keep the
  // server fallback until mount, then adopt the live VueUse query through the existing controller
  // watcher. Standalone effect scopes have no hydration lifecycle and may adopt immediately.
  return computed(
    () =>
      options.override?.value ??
      ((!componentOwned || mounted.value) && systemPreference.value === "reduce"),
  );
}
