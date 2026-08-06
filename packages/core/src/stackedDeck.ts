import { assertFiniteNumber, assertNonNegative } from "./bounds";
import type { ControllerPhase } from "./types";

export type StackedDeckProfile = "compact" | "medium" | "wide";
export type StackedDeckRole = "top" | "target" | "backing" | "hidden";
export type StackedDeckTraversalPhase = "idle" | "neutral" | "traversing" | "elastic";

/**
 * Presentation state for the one-anchor segment containing the controller's continuous position.
 * Selection remains controller-owned; visualTopIndex advances only after a complete local pitch.
 */
export interface StackedDeckTraversal {
  readonly settledIndex: number;
  readonly visualTopIndex: number;
  readonly segmentOriginIndex: number;
  readonly segmentTargetIndex: number | null;
  readonly direction: -1 | 0 | 1;
  readonly signedLocalDistance: number;
  readonly localProgress: number;
  readonly phase: StackedDeckTraversalPhase;
}

/** Mutable storage for allocation-free traversal resolution. */
export interface MutableStackedDeckTraversal {
  settledIndex: number;
  visualTopIndex: number;
  segmentOriginIndex: number;
  segmentTargetIndex: number | null;
  direction: -1 | 0 | 1;
  signedLocalDistance: number;
  localProgress: number;
  phase: StackedDeckTraversalPhase;
}

export interface ResolveStackedDeckTraversalOptions {
  readonly controllerPhase: ControllerPhase;
  readonly itemCount: number;
  readonly physicalIndex: number;
  readonly settledIndex: number;
}

export interface ResolveStackedDeckTuningOptions {
  readonly stageWidth: number;
  readonly stageHeight: number;
  readonly reducedMotion?: boolean;
}

export interface StackedDeckTuning {
  readonly profile: StackedDeckProfile;
  readonly cardWidth: number;
  readonly cardHeight: number;
  readonly motionPitch: number;
  readonly maximumBackingLayers: number;
  readonly backingOffsetX: number;
  readonly backingOffsetY: number;
  readonly backingScaleStep: number;
  readonly backingRotate: number;
  readonly topTravelY: number;
  readonly topRotate: number;
  readonly topScaleReduction: number;
}

export interface StackedDeckPose {
  readonly translateX: number;
  readonly translateY: number;
  readonly scale: number;
  readonly rotate: number;
  readonly opacity: number;
  readonly layer: number;
  readonly stackDepth: number;
  readonly role: StackedDeckRole;
  readonly shadowStrength: number;
  readonly visible: boolean;
  readonly interactive: boolean;
}

/** Explicit mutable storage for allocation-free frame resolution. */
export interface MutableStackedDeckPose {
  translateX: number;
  translateY: number;
  scale: number;
  rotate: number;
  opacity: number;
  layer: number;
  stackDepth: number;
  role: StackedDeckRole;
  shadowStrength: number;
  visible: boolean;
  interactive: boolean;
}

export interface StackedDeckFrame extends StackedDeckTraversal {
  readonly poses: readonly StackedDeckPose[];
}

/** Caller-owned storage mutated by {@link resolveStackedDeckFrame}. */
export interface MutableStackedDeckFrame extends MutableStackedDeckTraversal {
  poses: MutableStackedDeckPose[];
}

export interface ResolveStackedDeckFrameOptions {
  readonly itemCount: number;
  readonly traversal: StackedDeckTraversal;
  readonly tuning: StackedDeckTuning;
}

interface ProfileValues {
  readonly cardWidthRatio: number;
  readonly cardWidthMax: number;
  readonly motionPitchRatio: number;
  readonly backingOffsetXRatio: number;
  readonly backingOffsetYRatio: number;
  readonly topTravelYRatio: number;
}

const SCREEN_ASPECT_RATIO = 1.6;
const MAXIMUM_BACKING_LAYERS = 3;
const BACKING_SCALE_STEP = 0.012;
const BACKING_ROTATE = 0.38;
const TOP_ROTATE = 2.2;
const TOP_SCALE_REDUCTION = 0.025;
const TOP_LAYER = 500;
const TARGET_LAYER = 400;
const BACKING_LAYER_STEP = 100;
const TRAVERSAL_EPSILON = 0.000_001;
const TUNING_NUMBER_KEYS = [
  "cardWidth",
  "cardHeight",
  "motionPitch",
  "maximumBackingLayers",
  "backingOffsetX",
  "backingOffsetY",
  "backingScaleStep",
  "backingRotate",
  "topTravelY",
  "topRotate",
  "topScaleReduction",
] as const;

const PROFILE_VALUES: Record<StackedDeckProfile, ProfileValues> = {
  wide: {
    cardWidthRatio: 0.61,
    cardWidthMax: 680,
    motionPitchRatio: 0.42,
    backingOffsetXRatio: 0.009,
    backingOffsetYRatio: 0.018,
    topTravelYRatio: 0.018,
  },
  medium: {
    cardWidthRatio: 0.62,
    cardWidthMax: 520,
    motionPitchRatio: 0.32,
    backingOffsetXRatio: 0.01,
    backingOffsetYRatio: 0.019,
    topTravelYRatio: 0.016,
  },
  compact: {
    cardWidthRatio: 0.6,
    cardWidthMax: 300,
    motionPitchRatio: 0.55,
    backingOffsetXRatio: 0.011,
    backingOffsetYRatio: 0.02,
    topTravelYRatio: 0.014,
  },
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function mix(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}

function smoothstep(value: number): number {
  const clamped = clamp(value, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
}

function assertItemCount(itemCount: number): void {
  assertNonNegative(itemCount, "itemCount");
  if (!Number.isInteger(itemCount)) throw new RangeError("itemCount must be an integer");
}

function assertIndex(index: number, itemCount: number, name: string): void {
  assertFiniteNumber(index, name);
  if (!Number.isInteger(index) || index < 0 || index >= itemCount) {
    throw new RangeError(`${name} must identify an item`);
  }
}

function profileForWidth(stageWidth: number): StackedDeckProfile {
  if (stageWidth >= 960) return "wide";
  if (stageWidth >= 600) return "medium";
  return "compact";
}

/** Pure responsive tuning for the direct-manipulation deck compositor. */
export function resolveStackedDeckTuning(
  options: ResolveStackedDeckTuningOptions,
): StackedDeckTuning {
  assertFiniteNumber(options.stageWidth, "stageWidth");
  assertFiniteNumber(options.stageHeight, "stageHeight");
  if (options.stageWidth <= 0 || options.stageHeight <= 0) {
    throw new RangeError("deck stage must be positive");
  }

  const profile = profileForWidth(options.stageWidth);
  const values = PROFILE_VALUES[profile];
  const reducedMotion = options.reducedMotion ?? false;
  const heightLimitedWidth = options.stageHeight * SCREEN_ASPECT_RATIO * 0.9;
  const cardWidth = Math.round(
    clamp(
      Math.min(options.stageWidth * values.cardWidthRatio, heightLimitedWidth),
      Math.min(160, options.stageWidth),
      values.cardWidthMax,
    ),
  );
  const cardHeight = Math.round(cardWidth / SCREEN_ASPECT_RATIO);

  return {
    profile,
    cardWidth,
    cardHeight,
    motionPitch: Math.max(1, Math.round(cardWidth * values.motionPitchRatio)),
    maximumBackingLayers: MAXIMUM_BACKING_LAYERS,
    backingOffsetX: cardWidth * values.backingOffsetXRatio,
    backingOffsetY: cardHeight * values.backingOffsetYRatio,
    backingScaleStep: BACKING_SCALE_STEP,
    backingRotate: reducedMotion ? 0 : BACKING_ROTATE,
    topTravelY: reducedMotion ? 0 : cardHeight * values.topTravelYRatio,
    topRotate: reducedMotion ? 0 : TOP_ROTATE,
    topScaleReduction: reducedMotion ? 0 : TOP_SCALE_REDUCTION,
  };
}

/** Creates traversal storage whose visual owner initially agrees with controller selection. */
export function createStackedDeckTraversal(
  initialIndex: number,
  itemCount: number,
): MutableStackedDeckTraversal {
  assertItemCount(itemCount);
  if (itemCount === 0) {
    if (initialIndex !== -1) throw new RangeError("empty deck initialIndex must be -1");
  } else {
    assertIndex(initialIndex, itemCount, "initialIndex");
  }
  return {
    settledIndex: initialIndex,
    visualTopIndex: initialIndex,
    segmentOriginIndex: initialIndex,
    segmentTargetIndex: null,
    direction: 0,
    signedLocalDistance: 0,
    localProgress: 0,
    phase: "idle",
  };
}

function resetTraversal(
  output: MutableStackedDeckTraversal,
  settledIndex: number,
): MutableStackedDeckTraversal {
  output.settledIndex = settledIndex;
  output.visualTopIndex = settledIndex;
  output.segmentOriginIndex = settledIndex;
  output.segmentTargetIndex = null;
  output.direction = 0;
  output.signedLocalDistance = 0;
  output.localProgress = 0;
  output.phase = "idle";
  return output;
}

/**
 * Consumes continuous physical index without changing controller state. Each complete pitch moves
 * visual ownership to the crossed anchor; residual travel immediately becomes the next segment.
 */
export function resolveStackedDeckTraversal(
  options: ResolveStackedDeckTraversalOptions,
  output: MutableStackedDeckTraversal,
): StackedDeckTraversal {
  assertItemCount(options.itemCount);
  assertFiniteNumber(options.physicalIndex, "physicalIndex");
  if (options.itemCount === 0) return resetTraversal(output, -1);
  assertIndex(options.settledIndex, options.itemCount, "settledIndex");
  if (options.controllerPhase === "idle") {
    return resetTraversal(output, options.settledIndex);
  }

  if (output.visualTopIndex < 0 || output.visualTopIndex >= options.itemCount) {
    resetTraversal(output, options.settledIndex);
  }

  let visualTopIndex = output.visualTopIndex;
  while (
    visualTopIndex < options.itemCount - 1 &&
    options.physicalIndex - visualTopIndex >= 1 - TRAVERSAL_EPSILON
  ) {
    visualTopIndex += 1;
  }
  while (visualTopIndex > 0 && options.physicalIndex - visualTopIndex <= -1 + TRAVERSAL_EPSILON) {
    visualTopIndex -= 1;
  }

  const rawLocalDistance = options.physicalIndex - visualTopIndex;
  const signedLocalDistance =
    Math.abs(rawLocalDistance) <= TRAVERSAL_EPSILON ? 0 : rawLocalDistance;
  const direction = Math.sign(signedLocalDistance) as -1 | 0 | 1;
  const candidate = visualTopIndex + direction;
  const segmentTargetIndex =
    direction !== 0 && candidate >= 0 && candidate < options.itemCount ? candidate : null;

  output.settledIndex = options.settledIndex;
  output.visualTopIndex = visualTopIndex;
  output.segmentOriginIndex = visualTopIndex;
  output.segmentTargetIndex = segmentTargetIndex;
  output.direction = direction;
  output.signedLocalDistance = signedLocalDistance;
  output.localProgress = clamp(Math.abs(signedLocalDistance), 0, 1);
  output.phase =
    direction === 0 ? "neutral" : segmentTargetIndex === null ? "elastic" : "traversing";
  return output;
}

function validateTuning(tuning: StackedDeckTuning): void {
  if (tuning.profile !== "compact" && tuning.profile !== "medium" && tuning.profile !== "wide") {
    throw new RangeError("invalid deck profile");
  }
  for (const key of TUNING_NUMBER_KEYS) assertFiniteNumber(tuning[key], key);
  if (tuning.cardWidth <= 0 || tuning.cardHeight <= 0 || tuning.motionPitch <= 0) {
    throw new RangeError("invalid deck dimensions");
  }
  if (!Number.isInteger(tuning.maximumBackingLayers) || tuning.maximumBackingLayers < 1) {
    throw new RangeError("invalid deck layers");
  }
  if (tuning.backingScaleStep < 0 || tuning.topScaleReduction < 0) {
    throw new RangeError("invalid deck tuning");
  }
}

function validateTraversal(traversal: StackedDeckTraversal, itemCount: number): void {
  assertFiniteNumber(traversal.signedLocalDistance, "signedLocalDistance");
  assertFiniteNumber(traversal.localProgress, "localProgress");
  if (itemCount === 0) return;
  assertIndex(traversal.settledIndex, itemCount, "settledIndex");
  assertIndex(traversal.visualTopIndex, itemCount, "visualTopIndex");
  assertIndex(traversal.segmentOriginIndex, itemCount, "segmentOriginIndex");
  if (traversal.segmentOriginIndex !== traversal.visualTopIndex) {
    throw new RangeError("segment origin must be the visual top");
  }
  if (traversal.localProgress < 0 || traversal.localProgress > 1) {
    throw new RangeError("invalid local progress");
  }
  if (traversal.phase === "idle" || traversal.phase === "neutral") {
    if (
      traversal.direction !== 0 ||
      traversal.segmentTargetIndex !== null ||
      traversal.signedLocalDistance !== 0 ||
      traversal.localProgress !== 0
    ) {
      throw new RangeError("invalid neutral deck traversal");
    }
    if (traversal.phase === "idle" && traversal.visualTopIndex !== traversal.settledIndex) {
      throw new RangeError("idle visual top must equal settled selection");
    }
    return;
  }
  if (
    traversal.direction === 0 ||
    Math.sign(traversal.signedLocalDistance) !== traversal.direction ||
    Math.abs(traversal.localProgress - clamp(Math.abs(traversal.signedLocalDistance), 0, 1)) >
      TRAVERSAL_EPSILON
  ) {
    throw new RangeError("invalid active deck traversal");
  }
  if (traversal.phase === "traversing") {
    if (
      traversal.segmentTargetIndex === null ||
      traversal.segmentTargetIndex - traversal.segmentOriginIndex !== traversal.direction
    ) {
      throw new RangeError("active deck segment must be adjacent");
    }
  } else if (traversal.segmentTargetIndex !== null) {
    throw new RangeError("elastic traversal cannot invent a target");
  }
}

function createPose(): MutableStackedDeckPose {
  return {
    translateX: 0,
    translateY: 0,
    scale: 1,
    rotate: 0,
    opacity: 0,
    layer: 0,
    stackDepth: 0,
    role: "hidden",
    shadowStrength: 0,
    visible: false,
    interactive: false,
  };
}

/** Creates reusable storage for {@link resolveStackedDeckFrame}. */
export function createStackedDeckFrame(itemCount: number): MutableStackedDeckFrame {
  assertItemCount(itemCount);
  const initialIndex = itemCount === 0 ? -1 : 0;
  return {
    ...createStackedDeckTraversal(initialIndex, itemCount),
    poses: Array.from({ length: itemCount }, createPose),
  };
}

function resetPose(pose: MutableStackedDeckPose): void {
  pose.translateX = 0;
  pose.translateY = 0;
  pose.scale = 1;
  pose.rotate = 0;
  pose.opacity = 0;
  pose.layer = 0;
  pose.stackDepth = 0;
  pose.role = "hidden";
  pose.shadowStrength = 0;
  pose.visible = false;
  pose.interactive = false;
}

function convergedBackingDistance(depth: number): number {
  return 1 + (1 - 0.58 ** Math.max(0, depth - 1)) / (1 - 0.58);
}

function setBackingPose(
  pose: MutableStackedDeckPose,
  depth: number,
  direction: -1 | 1,
  tuning: StackedDeckTuning,
): void {
  const distance = convergedBackingDistance(depth);
  pose.translateX = direction * tuning.backingOffsetX * distance;
  pose.translateY = tuning.backingOffsetY * distance;
  pose.scale = 1 - tuning.backingScaleStep * depth;
  pose.rotate = direction * (depth % 2 === 0 ? -0.55 : 1) * tuning.backingRotate;
  pose.opacity = 1;
  pose.layer = TOP_LAYER - depth * BACKING_LAYER_STEP;
  pose.stackDepth = depth;
  pose.role = "backing";
  pose.shadowStrength = clamp(0.72 - depth * 0.12, 0.3, 0.72);
  pose.visible = true;
  pose.interactive = false;
}

function setTopPose(pose: MutableStackedDeckPose, interactive: boolean): void {
  pose.translateX = 0;
  pose.translateY = 0;
  pose.scale = 1;
  pose.rotate = 0;
  pose.opacity = 1;
  pose.layer = TOP_LAYER;
  pose.stackDepth = 0;
  pose.role = "top";
  pose.shadowStrength = 1;
  pose.visible = true;
  pose.interactive = interactive;
}

function cyclicDepth(
  index: number,
  originIndex: number,
  direction: -1 | 1,
  itemCount: number,
): number {
  return direction === 1
    ? (index - originIndex + itemCount) % itemCount
    : (originIndex - index + itemCount) % itemCount;
}

function setTraversalPair(
  top: MutableStackedDeckPose,
  target: MutableStackedDeckPose,
  traversal: StackedDeckTraversal,
  tuning: StackedDeckTuning,
): void {
  const progress = traversal.localProgress;
  const shaped = smoothstep(progress);
  const arc = Math.sin(progress * Math.PI);
  const direction = traversal.direction as -1 | 1;

  top.translateX = -traversal.signedLocalDistance * tuning.motionPitch;
  top.translateY = -tuning.topTravelY * arc;
  top.scale = 1 - tuning.topScaleReduction * arc;
  top.rotate = -direction * tuning.topRotate * arc;
  top.opacity = progress < 1 ? 1 : 0;
  top.layer = TOP_LAYER;
  top.stackDepth = 0;
  top.role = "top";
  top.shadowStrength = 1 - 0.45 * shaped;
  top.visible = progress < 1;
  top.interactive = false;

  target.translateX = direction * tuning.backingOffsetX * (1 - shaped);
  target.translateY = tuning.backingOffsetY * (1 - shaped);
  target.scale = mix(1 - tuning.backingScaleStep, 1, shaped);
  target.rotate = direction * tuning.backingRotate * (1 - shaped);
  target.opacity = 1;
  target.layer = TARGET_LAYER;
  target.stackDepth = 1;
  target.role = "target";
  target.shadowStrength = mix(0.6, 1, shaped);
  target.visible = progress > 0;
  target.interactive = false;
}

function copyTraversal(output: MutableStackedDeckFrame, traversal: StackedDeckTraversal): void {
  output.settledIndex = traversal.settledIndex;
  output.visualTopIndex = traversal.visualTopIndex;
  output.segmentOriginIndex = traversal.segmentOriginIndex;
  output.segmentTargetIndex = traversal.segmentTargetIndex;
  output.direction = traversal.direction;
  output.signedLocalDistance = traversal.signedLocalDistance;
  output.localProgress = traversal.localProgress;
  output.phase = traversal.phase;
}

/**
 * Resolves one compact pile from the active local segment. The visual top follows controller
 * displacement exactly in screen space; the adjacent target stays underneath and reaches the
 * precise top-card rest geometry before ownership crosses to it.
 */
export function resolveStackedDeckFrame(
  options: ResolveStackedDeckFrameOptions,
  output: MutableStackedDeckFrame,
): StackedDeckFrame {
  assertItemCount(options.itemCount);
  validateTuning(options.tuning);
  validateTraversal(options.traversal, options.itemCount);
  if (output.poses.length !== options.itemCount) {
    throw new RangeError("invalid deck output size");
  }

  copyTraversal(output, options.traversal);
  for (const pose of output.poses) resetPose(pose);
  if (options.itemCount === 0) return output;

  const traversal = options.traversal;
  const top = output.poses[traversal.visualTopIndex]!;
  setTopPose(top, traversal.phase === "idle");

  const pileDirection = traversal.direction === 0 ? 1 : traversal.direction;
  const pileOrigin = traversal.segmentTargetIndex ?? traversal.visualTopIndex;
  for (let index = 0; index < output.poses.length; index += 1) {
    if (index === traversal.visualTopIndex || index === traversal.segmentTargetIndex) continue;
    const depth = cyclicDepth(index, pileOrigin, pileDirection, options.itemCount);
    const backingDepth = depth + (traversal.segmentTargetIndex === null ? 0 : 1);
    if (backingDepth > 0 && backingDepth <= options.tuning.maximumBackingLayers) {
      setBackingPose(output.poses[index]!, backingDepth, pileDirection, options.tuning);
    }
  }

  if (traversal.phase === "elastic") {
    top.translateX = -traversal.signedLocalDistance * options.tuning.motionPitch;
    top.interactive = false;
    return output;
  }

  if (traversal.phase === "traversing" && traversal.segmentTargetIndex !== null) {
    setTraversalPair(top, output.poses[traversal.segmentTargetIndex]!, traversal, options.tuning);
  }
  return output;
}
