import type { ControllerSnapshot } from "@snap-motion/core";
import type { ComputedRef, InjectionKey, Ref } from "vue";

import type { SnapMotionMessages } from "../localization/messages";

export interface CarouselContext<Id extends string = string> {
  activeId: ComputedRef<Id | undefined>;
  canNext: ComputedRef<boolean>;
  canPrevious: ComputedRef<boolean>;
  count: ComputedRef<number>;
  direction: ComputedRef<"ltr" | "rtl">;
  ids: ComputedRef<readonly Id[]>;
  instructionId: string;
  messages: ComputedRef<SnapMotionMessages>;
  /** Internal discrete picker selection. Public imperative navigation is `programmatic`. */
  pick: (id: Id) => boolean;
  /** Public imperative navigation with fixed `programmatic` provenance. */
  request: (id: Id) => boolean;
  next: () => boolean;
  onKeyDown: (event: KeyboardEvent) => void;
  onPointerDown: (event: PointerEvent) => void;
  onWheel: (event: WheelEvent) => void;
  phase: ComputedRef<ControllerSnapshot<Id>["phase"]>;
  previous: () => boolean;
  registerSlide: (id: string, label: string, element: HTMLElement | undefined) => void;
  registerTrack: (element: HTMLElement | undefined) => void;
  registerViewport: (element: HTMLElement | undefined) => void;
  unregisterSlide: (id: string) => void;
  statusId: string;
  statusText: Ref<string>;
  surfaceStyle: { touchAction: string };
  trackStyle: ComputedRef<Record<string, string>>;
}

export const carouselContextKey = Symbol("snap-motion-carousel") as InjectionKey<CarouselContext>;
