import { computed, onMounted, onScopeDispose, ref, type Ref } from "vue";

const reducedMotionQuery = "(prefers-reduced-motion: reduce)";

export interface ReducedMotionOptions {
  override?: Readonly<Ref<boolean | undefined>>;
}

export function useReducedMotionPreference(options: ReducedMotionOptions = {}) {
  const systemPreference = ref(false);
  let mediaQuery: MediaQueryList | undefined;

  function syncPreference() {
    systemPreference.value = mediaQuery?.matches ?? false;
  }

  onMounted(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    mediaQuery = window.matchMedia(reducedMotionQuery);
    syncPreference();
    mediaQuery.addEventListener("change", syncPreference);
  });

  onScopeDispose(() => {
    mediaQuery?.removeEventListener("change", syncPreference);
    mediaQuery = undefined;
  });

  return computed(() => options.override?.value ?? systemPreference.value);
}
