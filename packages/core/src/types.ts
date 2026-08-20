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
  /**
   * Preserve the scalar offset from this anchor while replacing the coordinate system.
   *
   * Ordinary layout remeasurement leaves a settling mass at its rendered pixel position. A local
   * physical topology may instead rotate its finite anchors around the same semantic item. In
   * that case the item's anchor displacement is a coordinate-system change, not visible travel,
   * and the mass must move by the same displacement atomically.
   */
  readonly rebaseFromId?: Id;
}

export interface ControllerDragOptions<Id extends SemanticId = SemanticId> {
  /**
   * Anchor the gesture is measured from. It defines the temporary drag envelope and the base the
   * release target is capped against. Defaults to the current active anchor, which is what a plain
   * carousel wants; presentations that keep visual authority on a different anchor than the nearest
   * one pass it explicitly so rendered and controller position cannot diverge.
   */
  readonly originId?: Id;
  /**
   * Establish the origin anchor itself as scalar displacement zero.
   *
   * The default preserves the mass's current scalar position, which is what ordinary interruption
   * wants. A renderer that has independently captured the current physical frame may instead start
   * a genuinely new transaction at its semantic anchor while using that capture for visual
   * continuity. This resets position and velocity; it never preserves prior travel as new input.
   */
  readonly resetPositionToOrigin?: boolean;
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
  /**
   * Resistance applied at the interior limits of a gesture's temporary drag envelope, the range
   * `maxAnchorSkip` anchors either side of the drag origin. The default `{}` keeps those limits hard
   * paint boundaries; supplying boundaries turns overdrag past them into bounded resistance instead
   * of a dead stop. Physical bounds always use {@link ControllerConfiguration.elasticity}.
   */
  readonly dragEnvelopeElasticity: ElasticityOptions;
  readonly programmaticImpulse: number;
}

export interface ControllerConfigurationUpdate {
  readonly spring?: Partial<SpringConfiguration>;
  readonly releasePolicy?: Partial<ReleaseTargetPolicy>;
  readonly elasticity?: ElasticityOptions;
  readonly dragEnvelopeElasticity?: ElasticityOptions;
  readonly programmaticImpulse?: number;
}
