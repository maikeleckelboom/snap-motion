/**
 * Framework-neutral semantic snap geometry and scalar motion controller.
 *
 * @packageDocumentation
 */

export type {
  AnimationDriver,
  AnimationPlaybackControls,
  ScalarAnimationRequest,
} from "./animation-driver.js";
export {
  assertFiniteNumber,
  assertNonNegative,
  clampToBounds,
  createBounds,
  getTrackBounds,
  isWithinBounds,
  normalizeBounds,
} from "./bounds.js";
export {
  calculateFixedCellSize,
  createFixedStageGeometry,
  createPagedGridGeometry,
  createVariableWidthGeometry,
} from "./carousel-geometry.js";
export type {
  CarouselGeometry,
  FixedStageGeometry,
  MeasuredItemBox,
  PagedGridGeometry,
  PagedGridGeometryOptions,
  PagedGridPageContext,
  VariableWidthGeometryOptions,
} from "./carousel-geometry.js";
export { SnapController } from "./controller.js";
export type { ControllerListener, SnapControllerOptions } from "./controller.js";
export {
  applyElasticity,
  createSymmetricElasticity,
  nonlinearElasticDistance,
  validateElasticityOptions,
} from "./elastic.js";
export {
  balancedPreset,
  DEFAULT_MOTION_PRESET,
  heavyPreset,
  loosePreset,
  MOTION_PRESETS,
  tightPreset,
} from "./presets.js";
export { projectPosition } from "./projection.js";
export {
  clampAnchorsToBounds,
  directionalAnchor,
  findAnchorById,
  nearestAnchor,
  resolveProgrammaticTarget,
  resolveReleaseTarget,
  sortAnchors,
  validateReleaseTargetPolicy,
} from "./snap-targets.js";
export type {
  NearestAnchorOptions,
  ProgrammaticTargetInput,
  ReleaseTargetInput,
} from "./snap-targets.js";
export type {
  ControllerConfiguration,
  ControllerConfigurationUpdate,
  ControllerMeasurement,
  ControllerMoveByOptions,
  ControllerMoveOptions,
  ControllerPhase,
  ControllerSnapshot,
  ElasticBoundaryOptions,
  ElasticityOptions,
  MotionPreset,
  MotionPresetName,
  ReleaseTargetPolicy,
  ScalarBounds,
  SemanticId,
  SnapAnchor,
  SnapDirection,
  SpringConfiguration,
} from "./types.js";
export { VelocityTracker } from "./velocity.js";
export type { VelocitySample, VelocityTrackerOptions } from "./velocity.js";
