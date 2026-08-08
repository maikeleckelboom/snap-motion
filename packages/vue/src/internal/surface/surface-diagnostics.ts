import type {
  ControllerPhase,
  ControllerSnapshot,
  ScalarBounds,
  SemanticId,
  SnapAnchor,
} from "@snap-motion/core";

/**
 * A read-only view of what a spatial surface's motion is doing right now.
 *
 * High-level components publish this instead of their controller. Everything a consumer legitimately
 * needs in order to *observe* a surface — a diagnostics panel, a debug overlay, a test assertion —
 * is here, and nothing here can be used to move the surface. That is the whole point: a product
 * surface owns a transaction model, and a handle that hands out the controller hands out a way
 * around it.
 */
export interface SurfaceMotionDiagnostics<Id extends SemanticId = SemanticId> {
  /** Nearest anchor the controller currently names. */
  readonly activeId: Id | undefined;
  readonly anchors: readonly SnapAnchor<Id>[];
  readonly bounds: ScalarBounds;
  readonly isAnimating: boolean;
  readonly phase: ControllerPhase;
  readonly position: number;
  /** True while the surface has taken pointer capture. */
  readonly pointerOwned: boolean;
  readonly reducedMotion: boolean;
  /** Anchor the controller is settling toward, or `undefined`. */
  readonly targetId: Id | undefined;
  readonly velocity: number;
}

export interface SurfaceDiagnosticsInput<Id extends SemanticId> {
  readonly snapshot: ControllerSnapshot<Id>;
  readonly pointerOwned: boolean;
  readonly reducedMotion: boolean;
}

export function resolveSurfaceDiagnostics<Id extends SemanticId>(
  input: SurfaceDiagnosticsInput<Id>,
): SurfaceMotionDiagnostics<Id> {
  const snapshot = input.snapshot;
  return {
    activeId: snapshot.active?.id,
    anchors: snapshot.anchors,
    bounds: snapshot.bounds,
    isAnimating: snapshot.isAnimating,
    phase: snapshot.phase,
    position: snapshot.position,
    pointerOwned: input.pointerOwned,
    reducedMotion: input.reducedMotion,
    targetId: snapshot.target?.id,
    velocity: snapshot.velocity,
  };
}
