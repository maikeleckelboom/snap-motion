import type { ControllerSnapshot } from "@snap-motion/core";
import type { ComputedRef, InjectionKey, Ref } from "vue";

import type { NavigationReason } from "./contracts";

export interface CarouselContext<Id extends string = string> {
  activeId: ComputedRef<Id | undefined>;
  canNext: ComputedRef<boolean>;
  canPrevious: ComputedRef<boolean>;
  instructionId: string;
  navigate: (id: Id, reason: NavigationReason) => void;
  next: (reason?: NavigationReason) => void;
  onKeyDown: (event: KeyboardEvent) => void;
  onPointerDown: (event: PointerEvent) => void;
  onWheel: (event: WheelEvent) => void;
  phase: ComputedRef<ControllerSnapshot<Id>["phase"]>;
  previous: (reason?: NavigationReason) => void;
  registerSlide: (id: string, label: string) => void;
  registerTrack: (element: HTMLElement | undefined) => void;
  registerViewport: (element: HTMLElement | undefined) => void;
  unregisterSlide: (id: string) => void;
  statusId: string;
  statusText: Ref<string>;
  surfaceStyle: { touchAction: string };
  trackStyle: ComputedRef<Record<string, string>>;
}

export const carouselContextKey = Symbol("snap-motion-carousel") as InjectionKey<CarouselContext>;
