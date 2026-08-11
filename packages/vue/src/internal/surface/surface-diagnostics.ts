import type { SemanticId } from "@snap-motion/core";

import type {
  SurfaceDiagnosticsInput,
  SurfaceMotionDiagnostics,
} from "../../contracts/motion-contracts";

export function resolveSurfaceDiagnostics<Id extends SemanticId>(
  input: SurfaceDiagnosticsInput<Id>,
): SurfaceMotionDiagnostics<Id> {
  const snapshot = input.snapshot;
  return {
    anchors: snapshot.anchors,
    bounds: snapshot.bounds,
    isAnimating: snapshot.isAnimating,
    nearestId: snapshot.active?.id,
    phase: snapshot.phase,
    pointerInteractionActive: input.pointerInteractionActive,
    pointerOwned: input.pointerOwned,
    position: snapshot.position,
    reducedMotion: input.reducedMotion,
    targetId: snapshot.target?.id,
    velocity: snapshot.velocity,
  };
}
