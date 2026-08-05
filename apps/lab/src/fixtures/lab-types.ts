import type { SnapAnchor } from "@snap-motion/core";

export type LabPresetName = "tight" | "balanced" | "heavy" | "loose";

export interface LabPhysicsSettings {
  damping: number;
  elasticResistance: number;
  flingVelocity: number;
  mass: number;
  maxAnchorSkip: number;
  maxElasticDistance: number;
  programmaticImpulse: number;
  projectionSeconds: number;
  restDistance: number;
  restSpeed: number;
  stiffness: number;
}

export interface LabDiagnostics {
  activeId?: string;
  anchors: readonly SnapAnchor<string>[];
  bodyClientBlockExtent?: number;
  bodyScrollBlockExtent?: number;
  bodyScrollOffset?: number;
  bounds: { min: number; max: number };
  centerInfluence?: number;
  canonicalPosition?: number;
  focusedPaginationIndex?: number;
  indicatorScale?: number;
  indicatorX?: number;
  intrinsicContentPrimaryExtent?: number;
  isAnimating: boolean;
  keyboardTargetIndex?: number;
  kineticFocus?: number;
  maxAnchorSkip?: number;
  maximumBodyScrollOffset?: number;
  measuredChromeBlockExtent?: number;
  motionPitch?: number;
  ownerIndex?: number;
  pairFraction?: number;
  passingLane?: number;
  phase: string;
  physicalTransform?: number;
  physicalIndex?: number;
  pointerOwned: boolean;
  position: number;
  reducedMotion: boolean;
  releaseVelocityCapActive?: boolean;
  settledIndex?: number;
  settledness?: number;
  speedInCards?: number;
  targetId?: string;
  targetIndex?: number;
  trackExtent: number;
  tuningProfile?: string;
  velocity: number;
  visiblePrimaryExtent?: number;
  visualIndex?: number;
  visualViewportPrimaryExtent?: number;
  viewportSize: number;
}

export type ReducedMotionMode = "system" | "reduce" | "no-preference";
