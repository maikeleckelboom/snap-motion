import type { ControllerPhase } from "@snap-motion/core";
import { computed, inject, type ComputedRef } from "vue";

import type { NavigationReason } from "../motion/motion-contracts";
import { carouselContextKey, type CarouselContext } from "./carousel-context";

export interface PublicCarouselContext<Id extends string = string> {
  readonly activeId: ComputedRef<Id | undefined>;
  readonly canNext: ComputedRef<boolean>;
  readonly canPrevious: ComputedRef<boolean>;
  readonly count: ComputedRef<number>;
  readonly direction: ComputedRef<"ltr" | "rtl">;
  readonly ids: ComputedRef<readonly Id[]>;
  readonly navigate: (id: Id, reason?: NavigationReason) => void;
  readonly next: (reason?: NavigationReason) => void;
  readonly phase: ComputedRef<ControllerPhase>;
  readonly previous: (reason?: NavigationReason) => void;
}

/** Returns the stable read-only carousel facade available to controls and slots. */
export function useCarouselContext<Id extends string = string>(): PublicCarouselContext<Id> {
  const context = inject(carouselContextKey) as CarouselContext<Id> | undefined;
  if (!context) throw new Error("useCarouselContext must be used inside CarouselRoot.");
  return {
    activeId: computed(() => context.activeId.value),
    canNext: computed(() => context.canNext.value),
    canPrevious: computed(() => context.canPrevious.value),
    count: computed(() => context.count.value),
    direction: computed(() => context.direction.value),
    ids: computed(() => [...context.ids.value]),
    navigate: (id, reason = "picker") => context.navigate(id, reason),
    next: context.next,
    phase: computed(() => context.phase.value),
    previous: context.previous,
  };
}
