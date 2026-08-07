import { assertFiniteNumber, assertNonNegative } from "./bounds";
import type { ControllerPhase } from "./types";

export type StackedDeckProfile = "compact" | "medium" | "wide";
export type StackedDeckRole = "top" | "target" | "hidden";
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

/**
 * Inclusive index range visual authority may occupy. A presentation that limits one interaction to
 * a single adjacent exchange passes the envelope its interaction began with; the projection then
 * stops promoting at the limit and renders any remaining physical travel as elastic overdrag rather
 * than opening a second same-direction segment.
 */
export interface StackedDeckTraversalBounds {
  readonly minIndex: number;
  readonly maxIndex: number;
}

export interface ResolveStackedDeckTraversalOptions {
  readonly controllerPhase: ControllerPhase;
  readonly itemCount: number;
  readonly physicalIndex: number;
  readonly settledIndex: number;
  /** Defaults to the whole deck, which keeps the projection free to complete every crossed anchor. */
  readonly traversalBounds?: StackedDeckTraversalBounds;
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
  readonly pileLayers: number;
  readonly pileOffsetX: number;
  readonly pileOffsetY: number;
  readonly pileScaleStep: number;
  readonly pileRotate: number;
  readonly topDropY: number;
  readonly topRotate: number;
  readonly topScaleReduction: number;
}

/**
 * One decorative depth layer. The pile communicates physical thickness only: it carries no item
 * identity, so neither traversal direction nor segment changes can reorder or mirror it.
 */
export interface StackedDeckPilePose {
  readonly depth: number;
  readonly translateX: number;
  readonly translateY: number;
  readonly scale: number;
  readonly rotate: number;
  readonly layer: number;
  readonly shadowStrength: number;
}

export interface StackedDeckPose {
  readonly translateX: number;
  readonly translateY: number;
  readonly scale: number;
  readonly rotate: number;
  readonly opacity: number;
  readonly layer: number;
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
  readonly pileOffsetXRatio: number;
  readonly pileOffsetYRatio: number;
  readonly topDropYRatio: number;
}

const SCREEN_ASPECT_RATIO = 1.6;
const PILE_LAYERS = 3;
const PILE_SCALE_STEP = 0.05;
const PILE_ROTATE = 0.62;
const PILE_ROTATION_STEPS = [1, -0.62, 0.34];
const TOP_ROTATE = 4;
const TOP_SCALE_REDUCTION = 0.11;
const TOP_LAYER = 500;
const TARGET_LAYER = 400;
const PILE_LAYER_STEP = 100;
/**
 * Local progress that keeps the outgoing card fully opaque. The pitch clears most of the target
 * before the dissolve begins, so the two faces never share a broad half-transparent overlap.
 */
const OUTGOING_OPACITY_HOLD = 0.5;
/**
 * Local progress at which the outgoing card is fully dissolved. Completing before the anchor keeps
 * a skipped-frame crossing continuous: the fastest permitted travel still samples inside the tail.
 */
const OUTGOING_OPACITY_END = 0.92;
const TRAVERSAL_EPSILON = 0.000_001;
const TUNING_NUMBER_KEYS = [
  "cardWidth",
  "cardHeight",
  "motionPitch",
  "pileLayers",
  "pileOffsetX",
  "pileOffsetY",
  "pileScaleStep",
  "pileRotate",
  "topDropY",
  "topRotate",
  "topScaleReduction",
] as const;

const PROFILE_VALUES: Record<StackedDeckProfile, ProfileValues> = {
  wide: {
    cardWidthRatio: 0.61,
    cardWidthMax: 680,
    motionPitchRatio: 0.88,
    pileOffsetXRatio: 0.05,
    pileOffsetYRatio: 0.04,
    topDropYRatio: 0.075,
  },
  medium: {
    cardWidthRatio: 0.62,
    cardWidthMax: 520,
    motionPitchRatio: 0.86,
    pileOffsetXRatio: 0.051,
    pileOffsetYRatio: 0.041,
    topDropYRatio: 0.072,
  },
  compact: {
    cardWidthRatio: 0.6,
    cardWidthMax: 300,
    motionPitchRatio: 0.8,
    pileOffsetXRatio: 0.053,
    pileOffsetYRatio: 0.043,
    topDropYRatio: 0.068,
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

/**
 * Outgoing subordination. Flat at the segment start so early direct manipulation stays dominant,
 * then monotonically complete at the handoff so ownership never transfers to a normal-looking card.
 */
function subordination(progress: number): number {
  return progress * progress;
}

/** Outgoing opacity: held, then dissolved to exactly zero before the handoff so nothing can pop. */
function outgoingOpacity(progress: number): number {
  return (
    1 -
    smoothstep((progress - OUTGOING_OPACITY_HOLD) / (OUTGOING_OPACITY_END - OUTGOING_OPACITY_HOLD))
  );
}

function pileRotationStep(depth: number): number {
  return PILE_ROTATION_STEPS[(depth - 1) % PILE_ROTATION_STEPS.length]!;
}

function pileShadow(depth: number): number {
  return clamp(0.58 - (depth - 1) * 0.13, 0.24, 0.58);
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
    pileLayers: PILE_LAYERS,
    pileOffsetX: cardWidth * values.pileOffsetXRatio,
    pileOffsetY: cardHeight * values.pileOffsetYRatio,
    pileScaleStep: PILE_SCALE_STEP,
    pileRotate: reducedMotion ? 0 : PILE_ROTATE,
    topDropY: reducedMotion ? 0 : cardHeight * values.topDropYRatio,
    topRotate: reducedMotion ? 0 : TOP_ROTATE,
    topScaleReduction: reducedMotion ? 0 : TOP_SCALE_REDUCTION,
  };
}

/**
 * Resolves the deterministic decorative pile. It depends only on tuning, so no gesture direction,
 * segment change, or reversal can mirror, reorder, or re-identify a backing layer.
 */
export function resolveStackedDeckPile(tuning: StackedDeckTuning): readonly StackedDeckPilePose[] {
  validateTuning(tuning);
  return Array.from({ length: tuning.pileLayers }, (_unused, offset) => {
    const depth = offset + 1;
    return {
      depth,
      translateX: tuning.pileOffsetX * depth,
      translateY: tuning.pileOffsetY * depth,
      scale: 1 - tuning.pileScaleStep * depth,
      rotate: tuning.pileRotate * pileRotationStep(depth),
      layer: TARGET_LAYER - depth * PILE_LAYER_STEP,
      shadowStrength: pileShadow(depth),
    };
  });
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
 * Consumes continuous physical index without changing controller state. Each complete pitch inside
 * the traversal bounds moves visual ownership to the crossed anchor; residual travel immediately
 * becomes the next segment, or elastic overdrag once the bounds are reached.
 */
export function resolveStackedDeckTraversal(
  options: ResolveStackedDeckTraversalOptions,
  output: MutableStackedDeckTraversal,
): StackedDeckTraversal {
  assertItemCount(options.itemCount);
  assertFiniteNumber(options.physicalIndex, "physicalIndex");
  if (options.itemCount === 0) return resetTraversal(output, -1);
  assertIndex(options.settledIndex, options.itemCount, "settledIndex");
  const envelope = options.traversalBounds;
  let minIndex = 0;
  let maxIndex = options.itemCount - 1;
  if (envelope !== undefined) {
    assertIndex(envelope.minIndex, options.itemCount, "minIndex");
    assertIndex(envelope.maxIndex, options.itemCount, "maxIndex");
    if (envelope.minIndex > envelope.maxIndex) throw new RangeError("invalid traversal bounds");
    minIndex = envelope.minIndex;
    maxIndex = envelope.maxIndex;
  }
  if (options.controllerPhase === "idle") {
    return resetTraversal(output, options.settledIndex);
  }

  if (output.visualTopIndex < 0 || output.visualTopIndex >= options.itemCount) {
    resetTraversal(output, options.settledIndex);
  }

  let visualTopIndex = clamp(output.visualTopIndex, minIndex, maxIndex);
  while (
    visualTopIndex < maxIndex &&
    options.physicalIndex - visualTopIndex >= 1 - TRAVERSAL_EPSILON
  ) {
    visualTopIndex += 1;
  }
  while (
    visualTopIndex > minIndex &&
    options.physicalIndex - visualTopIndex <= -1 + TRAVERSAL_EPSILON
  ) {
    visualTopIndex -= 1;
  }

  const rawLocalDistance = options.physicalIndex - visualTopIndex;
  const signedLocalDistance =
    Math.abs(rawLocalDistance) <= TRAVERSAL_EPSILON ? 0 : rawLocalDistance;
  const direction = Math.sign(signedLocalDistance) as -1 | 0 | 1;
  const candidate = visualTopIndex + direction;
  const segmentTargetIndex =
    direction !== 0 && candidate >= minIndex && candidate <= maxIndex ? candidate : null;

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
  if (!Number.isInteger(tuning.pileLayers) || tuning.pileLayers < 1) {
    throw new RangeError("invalid deck layers");
  }
  if (tuning.pileScaleStep < 0 || tuning.topScaleReduction < 0) {
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
  pose.role = "hidden";
  pose.shadowStrength = 0;
  pose.visible = false;
  pose.interactive = false;
}

function setTopPose(pose: MutableStackedDeckPose, interactive: boolean): void {
  pose.translateX = 0;
  pose.translateY = 0;
  pose.scale = 1;
  pose.rotate = 0;
  pose.opacity = 1;
  pose.layer = TOP_LAYER;
  pose.role = "top";
  pose.shadowStrength = 1;
  pose.visible = true;
  pose.interactive = interactive;
}

/**
 * Migrates visual authority across one local segment. The outgoing card keeps exact 1:1 translation
 * while every other property decreases monotonically to a fully subordinate handoff pose; the target
 * rises from the deterministic first pile slot to exact top rest geometry. Both boundaries are met
 * before ownership changes, so a crossing only confirms the hierarchy the eye already reads.
 */
function setExchangePair(
  outgoing: MutableStackedDeckPose,
  target: MutableStackedDeckPose,
  traversal: StackedDeckTraversal,
  tuning: StackedDeckTuning,
): void {
  const progress = traversal.localProgress;
  const recession = subordination(progress);
  const promotion = smoothstep(progress);
  const remaining = 1 - promotion;
  const direction = traversal.direction as -1 | 1;
  const opacity = outgoingOpacity(progress);

  outgoing.translateX = -traversal.signedLocalDistance * tuning.motionPitch;
  outgoing.translateY = tuning.topDropY * recession;
  outgoing.scale = 1 - tuning.topScaleReduction * recession;
  outgoing.rotate = -direction * tuning.topRotate * recession;
  outgoing.opacity = opacity;
  outgoing.layer = TOP_LAYER;
  outgoing.role = "top";
  outgoing.shadowStrength = mix(1, 0.2, recession);
  outgoing.visible = opacity > 0;
  outgoing.interactive = false;

  target.translateX = tuning.pileOffsetX * remaining;
  target.translateY = tuning.pileOffsetY * remaining;
  target.scale = 1 - tuning.pileScaleStep * remaining;
  target.rotate = tuning.pileRotate * PILE_ROTATION_STEPS[0]! * remaining;
  target.opacity = 1;
  target.layer = TARGET_LAYER;
  target.role = "target";
  target.shadowStrength = mix(pileShadow(1), 1, promotion);
  target.visible = true;
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
 * Resolves the content-bearing cards of one deck frame. At most one manipulated top and one
 * adjacent target are ever rendered; depth belongs to {@link resolveStackedDeckPile}.
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

  if (traversal.phase === "elastic") {
    top.translateX = -traversal.signedLocalDistance * options.tuning.motionPitch;
    return output;
  }
  if (traversal.phase === "traversing" && traversal.segmentTargetIndex !== null) {
    setExchangePair(top, output.poses[traversal.segmentTargetIndex]!, traversal, options.tuning);
  }
  return output;
}
