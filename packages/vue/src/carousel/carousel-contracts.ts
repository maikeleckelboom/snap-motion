import type {
  ControllerConfigurationUpdate,
  ControllerMoveByOptions,
  ControllerMoveOptions,
  ControllerPhase,
  ControllerSnapshot,
  SnapAnchor,
  SnapController,
  SnapDirection,
} from "@snap-motion/core";
import type { PointerIntent } from "@snap-motion/vue/motion";
import type { ComputedRef, Ref, ShallowRef } from "vue";

/** Controls where automatic Arrow-key carousel navigation is active. */
export type CarouselKeyboardScope = "auto" | "carousel" | "dialog" | "off";

/** Logical inline direction for transform-driven carousel interaction. */
export type SnapMotionDirection = "auto" | "ltr" | "rtl";

/**
 * One scalar carousel controller bound to a browser: its state, its input handlers, and its
 * imperative navigation.
 *
 * Written out rather than inferred, because it is what the surface products hand a consumer as
 * their escape hatch. An inferred shape would publish whichever internal types happened to be
 * reachable through it, and would change silently whenever an implementation detail did.
 */
export interface CarouselMotion<Id extends string> {
  readonly activeId: ComputedRef<Id | undefined>;
  readonly canNext: ComputedRef<boolean>;
  readonly canPrevious: ComputedRef<boolean>;
  readonly controller: SnapController<Id>;
  /**
   * The writing direction as of the last time it was resolved. Presentation may read it; input
   * must call {@link CarouselMotion.resolveDirection} instead.
   */
  readonly direction: ComputedRef<"ltr" | "rtl">;
  readonly isAnimating: ComputedRef<boolean>;
  readonly isDragging: Ref<boolean>;
  readonly isWheeling: Ref<boolean>;
  readonly phase: ComputedRef<ControllerPhase>;
  /** True from an accepted pointerdown until that contact is ended, cancelled, or aborted. */
  readonly pointerInteractionActive: Ref<boolean>;
  readonly pointerIntent: Ref<PointerIntent>;
  readonly pointerOwned: Ref<boolean>;
  readonly position: ComputedRef<number>;
  readonly reducedMotion: ComputedRef<boolean>;
  readonly snapshot: ShallowRef<ControllerSnapshot<Id>>;
  readonly surfaceStyle: { readonly touchAction: string };
  readonly targetId: ComputedRef<Id | undefined>;
  readonly trackStyle: ComputedRef<{ transform: string; willChange: string }>;
  readonly velocity: ComputedRef<number>;
  configure(update: ControllerConfigurationUpdate): void;
  interrupt(): void;
  moveBy(direction: SnapDirection, options?: ControllerMoveByOptions): SnapAnchor<Id> | null;
  moveTo(id: Id, options?: ControllerMoveOptions): SnapAnchor<Id> | null;
  next(options?: ControllerMoveByOptions): SnapAnchor<Id> | null;
  onKeyDown(event: KeyboardEvent): void;
  onNativeDragStart(event: DragEvent): void;
  onPointerDown(event: PointerEvent): void;
  onWheel(event: WheelEvent): void;
  previous(options?: ControllerMoveByOptions): SnapAnchor<Id> | null;
  remeasure(): SnapAnchor<Id> | null;
  /**
   * The writing direction as it is right now. Input handling must ask rather than read a cached
   * answer: `auto` resolves against computed style, which nothing reactive tracks, so a surface
   * that mirrored its keys off {@link CarouselMotion.direction} would keep mirroring by whatever
   * the page happened to be when it first rendered.
   */
  resolveDirection(): "ltr" | "rtl";
}
