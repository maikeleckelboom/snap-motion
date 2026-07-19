export type SemanticId = string;

export type SnapDirection = -1 | 1;

export type ControllerPhase = "idle" | "dragging" | "settling";

export interface ScalarBounds {
  readonly min: number;
  readonly max: number;
}

export interface SnapAnchor<Id extends SemanticId = SemanticId> {
  readonly id: Id;
  readonly position: number;
  readonly order: number;
}

export interface SpringConfiguration {
  readonly stiffness: number;
  readonly damping: number;
  readonly mass: number;
  readonly restSpeed: number;
  readonly restDistance: number;
}

export interface ReleaseTargetPolicy {
  /** Projection time in seconds. */
  readonly projectionSeconds: number;
  /** Absolute release velocity in CSS pixels per second that constitutes a fling. */
  readonly flingVelocity: number;
  /** Maximum logical anchor distance selected by any pointer release. */
  readonly maxAnchorSkip: number;
  /** Physical position sign corresponding to increasing logical anchor order. */
  readonly forwardSign: SnapDirection;
}

export interface ElasticBoundaryOptions {
  /** Values above one make the boundary progressively firmer. */
  readonly resistance: number;
  readonly maxDistance: number;
}

export interface ElasticityOptions {
  readonly min?: ElasticBoundaryOptions | false;
  readonly max?: ElasticBoundaryOptions | false;
}

export type MotionPresetName = "tight" | "balanced" | "heavy" | "loose";

export interface MotionPreset {
  readonly name: MotionPresetName;
  readonly spring: SpringConfiguration;
  readonly release: ReleaseTargetPolicy;
  readonly elasticity: ElasticityOptions;
  readonly programmaticImpulse: number;
}

export interface ControllerSnapshot<Id extends SemanticId = SemanticId> {
  readonly phase: ControllerPhase;
  readonly position: number;
  readonly velocity: number;
  readonly target: SnapAnchor<Id> | null;
  readonly active: SnapAnchor<Id> | null;
  readonly bounds: ScalarBounds;
  readonly anchors: readonly SnapAnchor<Id>[];
  readonly reducedMotion: boolean;
  readonly isAnimating: boolean;
}

export interface ControllerMeasurement<Id extends SemanticId = SemanticId> {
  readonly bounds: ScalarBounds;
  readonly anchors: readonly SnapAnchor<Id>[];
  readonly activeId?: Id;
}

export interface ControllerMoveOptions {
  readonly initialVelocity?: number;
}

export interface ControllerMoveByOptions extends ControllerMoveOptions {
  readonly steps?: number;
}

export interface ControllerConfiguration {
  readonly spring: SpringConfiguration;
  readonly releasePolicy: ReleaseTargetPolicy;
  readonly elasticity: ElasticityOptions;
  readonly programmaticImpulse: number;
}

export interface ControllerConfigurationUpdate {
  readonly spring?: Partial<SpringConfiguration>;
  readonly releasePolicy?: Partial<ReleaseTargetPolicy>;
  readonly elasticity?: ElasticityOptions;
  readonly programmaticImpulse?: number;
}
