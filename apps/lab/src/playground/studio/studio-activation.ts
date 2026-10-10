import type { InjectionKey } from "vue";

/** Lets the load-error state ask the activation boundary to try again. */
export const studioRetryKey: InjectionKey<() => void> = Symbol("motion-studio-retry");
