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
  bodyClientHeight?: number;
  bodyScrollHeight?: number;
  bodyScrollTop?: number;
  bounds: { min: number; max: number };
  centerInfluence?: number;
  chromeHeight?: number;
  focusedPaginationIndex?: number;
  indicatorScale?: number;
  indicatorX?: number;
  intrinsicSheetHeight?: number;
  isAnimating: boolean;
  keyboardTargetIndex?: number;
  kineticFocus?: number;
  maxAnchorSkip?: number;
  maximumScrollTop?: number;
  motionPitch?: number;
  ownerIndex?: number;
  pairFraction?: number;
  passingLane?: number;
  phase: string;
  physicalSheetY?: number;
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
  visibleSheetHeight?: number;
  visualIndex?: number;
  visualViewportHeight?: number;
  viewportSize: number;
}

export type ReducedMotionMode = "system" | "reduce" | "no-preference";
