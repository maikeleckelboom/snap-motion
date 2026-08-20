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
export {
  COVERFLOW_KINETIC_TUNING,
  createCoverflowGeometry,
  createCoverflowKineticState,
  resolveCoverflowKinetics,
  resolveCoverflowPresentation,
  resolveCoverflowProgress,
  resolveCoverflowTuning,
} from "./coverflow";
export type {
  CoverflowGeometry,
  CoverflowGeometryOptions,
  CoverflowKineticState,
  CoverflowPresentation,
  CoverflowPresentationOptions,
  CoverflowProgressOptions,
  CoverflowTuning,
  ResolveCoverflowTuningOptions,
} from "./coverflow";
export { CoverflowModel, isSettledOnAnchor } from "./coverflow-model";
export type {
  CoverflowCommand,
  CoverflowModelOptions,
  CoverflowModelState,
  CoverflowSnapshotInput,
  SettledOnAnchorInput,
} from "./coverflow-model";
export {
  DIRECT_MANIPULATION_TUNING,
  resolveDirectManipulationGesture,
  resolveSnapKeyboardAction,
} from "./gestures";
export type {
  DirectManipulationAction,
  DirectManipulationInput,
  DirectManipulationResolution,
  SnapKeyboardAction,
  SnapKeyboardInput,
} from "./gestures";
export {
  advanceBoundedSpring,
  BOUNDED_SPRING_TUNING,
  resolveAutonomousReleaseVelocity,
  resolveSpeedInCards,
} from "./kinetics";
export type { MutableSpringState } from "./kinetics";
export type {
  ActiveIdRequestDetails,
  NavigationReason,
  SettlementDetails,
} from "./interactionContracts";
export {
  createPaginationIndicatorState,
  PAGINATION_INDICATOR_TUNING,
  resolvePaginationIndicator,
} from "./pagination";
export type { PaginationIndicatorState } from "./pagination";
export {
  resolveAdjacentIndex,
  resolveCommandOriginIndex,
  resolveHystereticIndex,
  SettledSelection,
} from "./selection";
export type { SettledSelectionAdoption, SettledSelectionUpdate } from "./selection";
export {
  createStackedDeckFrame,
  createStackedDeckTraversal,
  isStackedDeckAuthorityStable,
  resolveStackedDeckDepth,
  resolveStackedDeckFrame,
  resolveStackedDeckNeighbor,
  resolveStackedDeckOrder,
  resolveStackedDeckPile,
  resolveStackedDeckTraversal,
  resolveStackedDeckTuning,
} from "./stackedDeck";
export type {
  MutableStackedDeckFrame,
  MutableStackedDeckPose,
  MutableStackedDeckTraversal,
  ResolveStackedDeckFrameOptions,
  ResolveStackedDeckPileOptions,
  ResolveStackedDeckTraversalOptions,
  ResolveStackedDeckTuningOptions,
  StackedDeckFrame,
  StackedDeckDirectProjection,
  StackedDeckExchange,
  StackedDeckPilePose,
  StackedDeckPose,
  StackedDeckProfile,
  StackedDeckRole,
  StackedDeckTraversal,
  StackedDeckTraversalPhase,
  StackedDeckTuning,
} from "./stackedDeck";
export {
  isStackedDeckInspectEligible,
  STACKED_DECK_ANCHOR_SKIP,
  STACKED_DECK_INTERIOR_ELASTICITY,
  StackedDeckModel,
} from "./stacked-deck-model";
export type {
  StackedDeckCommand,
  StackedDeckCommandContext,
  StackedDeckInspectContext,
  StackedDeckModelOptions,
  StackedDeckModelState,
  StackedDeckReleasePolicy,
  StackedDeckSnapshotInput,
} from "./stacked-deck-model";
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
  ControllerDragOptions,
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
