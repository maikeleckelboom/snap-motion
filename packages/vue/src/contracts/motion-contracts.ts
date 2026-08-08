import type {
  ControllerPhase,
  ControllerSnapshot,
  ScalarBounds,
  SemanticId,
  SnapAnchor,
} from "@snap-motion/core";

/** Observable lifecycle of a horizontal pointer before and after the surface claims it. */
export type PointerIntent = "horizontal" | "pending" | "vertical";

/**
 * What caused a surface to change its durable selection.
 *
 * Each value names an actual origin, and a surface only reports one once that origin has been
 * accepted as the movement now in flight. `drag` and `wheel` in particular are not "a pointer went
 * down" or "a wheel event arrived" — they are "this manipulation is what the surface is now
 * resolving", which is a question only the motion layer can answer.
 *
 * `picker` is a discrete selection: a tap on an item, a pagination dot. `programmatic` is an
 * imperative request from the application — `requestId()` and friends — which is a different thing
 * from a person choosing an item, and `route` is authoritative state the application already had.
 */
export type NavigationReason =
  | "previous"
  | "next"
  | "keyboard"
  | "drag"
  | "wheel"
  | "picker"
  | "programmatic"
  | "route";

/**
 * A read-only view of what a spatial surface's motion is doing right now.
 *
 * High-level components publish this instead of their controller. It deliberately distinguishes
 * an active pointer interaction (including unresolved touch intent) from pointer ownership/capture.
 */
export interface SurfaceMotionDiagnostics<Id extends SemanticId = SemanticId> {
  readonly activeId: Id | undefined;
  readonly anchors: readonly SnapAnchor<Id>[];
  readonly bounds: ScalarBounds;
  readonly isAnimating: boolean;
  readonly phase: ControllerPhase;
  readonly pointerInteractionActive: boolean;
  readonly pointerOwned: boolean;
  readonly position: number;
  readonly reducedMotion: boolean;
  readonly targetId: Id | undefined;
  readonly velocity: number;
}

export interface SurfaceDiagnosticsInput<Id extends SemanticId> {
  readonly snapshot: ControllerSnapshot<Id>;
  readonly pointerInteractionActive: boolean;
  readonly pointerOwned: boolean;
  readonly reducedMotion: boolean;
}
