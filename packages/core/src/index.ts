/**
 * Framework-neutral semantic snap geometry and scalar motion controller.
 *
 * @packageDocumentation
 */

export type {
  AnimationDriver,
  AnimationPlaybackControls,
  ScalarAnimationRequest,
} from "./animation-driver";
export {
  clampToBounds,
  createBounds,
  getTrackBounds,
  isWithinBounds,
  normalizeBounds,
} from "./bounds";
export {
  calculateFixedCellSize,
  createFixedStageGeometry,
  createPagedGridGeometry,
  createVariableWidthGeometry,
} from "./carousel-geometry";
export type {
  CarouselGeometry,
  FixedStageGeometry,
  MeasuredItemBox,
  PagedGridGeometry,
  PagedGridGeometryOptions,
  PagedGridPageContext,
  VariableWidthGeometryOptions,
} from "./carousel-geometry";
export { SnapController } from "./controller";
export type { ControllerListener, SnapControllerOptions } from "./controller";
export { applyElasticity, createSymmetricElasticity, nonlinearElasticDistance } from "./elastic";
export {
  balancedPreset,
  DEFAULT_MOTION_PRESET,
  heavyPreset,
  loosePreset,
  MOTION_PRESETS,
  tightPreset,
} from "./presets";
export { projectPosition } from "./projection";
export {
  clampAnchorsToBounds,
  directionalAnchor,
  findAnchorById,
  nearestAnchor,
  resolveProgrammaticTarget,
  resolveReleaseTarget,
  sortAnchors,
} from "./snap-targets";
export type {
  NearestAnchorOptions,
  ProgrammaticTargetInput,
  ReleaseTargetInput,
} from "./snap-targets";
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
} from "./types";
export { VelocityTracker } from "./velocity";
export type { VelocitySample, VelocityTrackerOptions } from "./velocity";
