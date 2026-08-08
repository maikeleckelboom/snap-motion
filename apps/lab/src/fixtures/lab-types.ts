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
  /** The card an interaction acts on, which leads the visual top through a handoff. */
  authoritativeIndex?: number;
  /** True when exactly one content card is rendered and it is the authoritative one, at rest. */
  authorityStable?: boolean;
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
  /** The surface fixes its own effective skip, so the shared control does not govern it. */
  maxAnchorSkipFixed?: boolean;
  maximumBodyScrollOffset?: number;
  measuredChromeBlockExtent?: number;
  motionPitch?: number;
  ownerIndex?: number;
  pairFraction?: number;
  phase: string;
  physicalTransform?: number;
  physicalIndex?: number;
  pointerOwned: boolean;
  position: number;
  reducedMotion: boolean;
  releaseVelocityCapActive?: boolean;
  segmentDirection?: number;
  segmentOriginIndex?: number;
  segmentPhase?: string;
  segmentProgress?: number;
  segmentTargetIndex?: number;
  settledIndex?: number;
  settledness?: number;
  signedLocalDistance?: number;
  speedInCards?: number;
  targetId?: string;
  targetIndex?: number;
  trackExtent: number;
  tuningProfile?: string;
  velocity: number;
  visiblePrimaryExtent?: number;
  visualIndex?: number;
  visualTopIndex?: number;
  visualViewportPrimaryExtent?: number;
  viewportSize: number;
}

export type ReducedMotionMode = "system" | "reduce" | "no-preference";
