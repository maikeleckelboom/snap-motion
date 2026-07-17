import { usePreferredReducedMotion } from "@vueuse/core";
import { computed, type Ref } from "vue";

export interface ReducedMotionOptions {
  override?: Readonly<Ref<boolean | undefined>>;
}

export function useReducedMotionPreference(options: ReducedMotionOptions = {}) {
  const systemPreference = usePreferredReducedMotion();
  return computed(() => options.override?.value ?? systemPreference.value === "reduce");
}
