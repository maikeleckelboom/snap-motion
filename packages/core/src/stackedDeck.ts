import { assertFiniteNumber, assertNonNegative } from "./bounds";

export type StackedDeckProfile = "compact" | "medium" | "wide";
export type StackedDeckRole = "top" | "incoming" | "outgoing" | "backing" | "hidden";
export type StackedDeckTransitionPhase = "idle" | "peel" | "handoff" | "settle";

export interface StackedDeckTransition {
  readonly settledIndex: number;
  readonly fromIndex: number;
  readonly toIndex: number;
  readonly direction: -1 | 0 | 1;
  readonly progress: number;
  readonly phase: StackedDeckTransitionPhase;
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
  readonly forwardPeelX: number;
  readonly forwardPeelY: number;
  readonly forwardRotate: number;
  readonly forwardConcealStart: number;
  readonly reverseExcursionX: number;
  readonly reverseExcursionY: number;
  readonly reverseRotate: number;
}

export interface StackedDeckPose {
  readonly translateX: number;
  readonly translateY: number;
  readonly scale: number;
  readonly rotate: number;
  readonly opacity: number;
  readonly reveal: number;
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
  reveal: number;
  layer: number;
  stackDepth: number;
  role: StackedDeckRole;
  shadowStrength: number;
  visible: boolean;
  interactive: boolean;
}

export interface StackedDeckFrame {
  readonly settledIndex: number;
  readonly fromIndex: number;
  readonly toIndex: number;
  readonly direction: -1 | 0 | 1;
  readonly progress: number;
  readonly phase: StackedDeckTransitionPhase;
  readonly poses: readonly StackedDeckPose[];
}

/** Caller-owned storage mutated by {@link resolveStackedDeckFrame}. */
export interface MutableStackedDeckFrame {
  settledIndex: number;
  fromIndex: number;
  toIndex: number;
  direction: -1 | 0 | 1;
  progress: number;
  phase: StackedDeckTransitionPhase;
  poses: MutableStackedDeckPose[];
}

export interface ResolveStackedDeckFrameOptions {
  readonly itemCount: number;
  readonly transition: StackedDeckTransition;
  readonly tuning: StackedDeckTuning;
}

interface ProfileValues {
  readonly cardWidthRatio: number;
  readonly cardWidthMax: number;
  readonly motionPitchRatio: number;
  readonly backingOffsetXRatio: number;
  readonly backingOffsetYRatio: number;
  readonly forwardPeelXRatio: number;
  readonly forwardPeelYRatio: number;
  readonly reverseExcursionXRatio: number;
  readonly reverseExcursionYRatio: number;
}

const SCREEN_ASPECT_RATIO = 1.6;
const MAXIMUM_BACKING_LAYERS = 3;
const BACKING_SCALE_STEP = 0.012;
const BACKING_ROTATE = 0.42;
const FORWARD_ROTATE = -6;
const REVERSE_ROTATE = -3.4;
const FORWARD_CONCEAL_START = 0.94;
const TOP_LAYER = 500;
const EXCHANGE_UNDER_LAYER = 400;
const BACKING_LAYER_STEP = 100;
const TUNING_NUMBER_KEYS = [
  "cardWidth",
  "cardHeight",
  "motionPitch",
  "maximumBackingLayers",
  "backingOffsetX",
  "backingOffsetY",
  "backingScaleStep",
  "backingRotate",
  "forwardPeelX",
  "forwardPeelY",
  "forwardRotate",
  "forwardConcealStart",
  "reverseExcursionX",
  "reverseExcursionY",
  "reverseRotate",
] as const;

const PROFILE_VALUES: Record<StackedDeckProfile, ProfileValues> = {
  wide: {
    cardWidthRatio: 0.61,
    cardWidthMax: 680,
    motionPitchRatio: 0.42,
    backingOffsetXRatio: 0.009,
    backingOffsetYRatio: 0.018,
    forwardPeelXRatio: 1.16,
    forwardPeelYRatio: -0.075,
    reverseExcursionXRatio: -0.14,
    reverseExcursionYRatio: -0.045,
  },
  medium: {
    cardWidthRatio: 0.74,
    cardWidthMax: 600,
    motionPitchRatio: 0.4,
    backingOffsetXRatio: 0.01,
    backingOffsetYRatio: 0.019,
    forwardPeelXRatio: 1.14,
    forwardPeelYRatio: -0.065,
    reverseExcursionXRatio: -0.13,
    reverseExcursionYRatio: -0.04,
  },
  compact: {
    cardWidthRatio: 0.9,
    cardWidthMax: 420,
    motionPitchRatio: 0.38,
    backingOffsetXRatio: 0.011,
    backingOffsetYRatio: 0.02,
    forwardPeelXRatio: 1.1,
    forwardPeelYRatio: -0.055,
    reverseExcursionXRatio: -0.11,
    reverseExcursionYRatio: -0.035,
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

function profileForWidth(stageWidth: number): StackedDeckProfile {
  if (stageWidth >= 960) return "wide";
  if (stageWidth >= 600) return "medium";
  return "compact";
}

/** Pure responsive tuning for the physical deck compositor. */
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
      Math.min(240, options.stageWidth),
      values.cardWidthMax,
    ),
  );
  const cardHeight = Math.round(cardWidth / SCREEN_ASPECT_RATIO);
  const displacementMultiplier = reducedMotion ? 0.45 : 1;

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
    forwardPeelX: cardWidth * values.forwardPeelXRatio * displacementMultiplier,
    forwardPeelY: cardHeight * values.forwardPeelYRatio * displacementMultiplier,
    forwardRotate: reducedMotion ? 0 : FORWARD_ROTATE,
    forwardConcealStart: FORWARD_CONCEAL_START,
    reverseExcursionX: cardWidth * values.reverseExcursionXRatio * displacementMultiplier,
    reverseExcursionY: cardHeight * values.reverseExcursionYRatio * displacementMultiplier,
    reverseRotate: reducedMotion ? 0 : REVERSE_ROTATE,
  };
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
  if (
    tuning.backingScaleStep < 0 ||
    tuning.forwardConcealStart <= 0 ||
    tuning.forwardConcealStart >= 1
  ) {
    throw new RangeError("invalid deck tuning");
  }
}

function validateTransition(transition: StackedDeckTransition, itemCount: number): void {
  assertFiniteNumber(transition.settledIndex, "settledIndex");
  assertFiniteNumber(transition.fromIndex, "fromIndex");
  assertFiniteNumber(transition.toIndex, "toIndex");
  assertFiniteNumber(transition.progress, "progress");
  if (
    !Number.isInteger(transition.settledIndex) ||
    !Number.isInteger(transition.fromIndex) ||
    !Number.isInteger(transition.toIndex)
  ) {
    throw new RangeError("invalid deck indices");
  }
  if (
    itemCount > 0 &&
    (transition.settledIndex < 0 ||
      transition.settledIndex >= itemCount ||
      transition.fromIndex < 0 ||
      transition.fromIndex >= itemCount ||
      transition.toIndex < 0 ||
      transition.toIndex >= itemCount)
  ) {
    throw new RangeError("deck index out of range");
  }
  if (transition.progress < 0 || transition.progress > 1) {
    throw new RangeError("invalid deck progress");
  }
  if (transition.phase === "idle") {
    if (
      transition.direction !== 0 ||
      transition.progress !== 0 ||
      transition.fromIndex !== transition.settledIndex ||
      transition.toIndex !== transition.settledIndex
    ) {
      throw new RangeError("invalid idle deck transition");
    }
    return;
  }
  if (
    transition.direction === 0 ||
    transition.fromIndex !== transition.settledIndex ||
    transition.toIndex === transition.fromIndex ||
    Math.sign(transition.toIndex - transition.fromIndex) !== transition.direction
  ) {
    throw new RangeError("invalid active deck transition");
  }
}

function createPose(): MutableStackedDeckPose {
  return {
    translateX: 0,
    translateY: 0,
    scale: 1,
    rotate: 0,
    opacity: 0,
    reveal: 1,
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
    settledIndex: initialIndex,
    fromIndex: initialIndex,
    toIndex: initialIndex,
    direction: 0,
    progress: 0,
    phase: "idle",
    poses: Array.from({ length: itemCount }, createPose),
  };
}

function resetPose(pose: MutableStackedDeckPose): void {
  pose.translateX = 0;
  pose.translateY = 0;
  pose.scale = 1;
  pose.rotate = 0;
  pose.opacity = 0;
  pose.reveal = 1;
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
  tuning: StackedDeckTuning,
): void {
  const distance = convergedBackingDistance(depth);
  pose.translateX = tuning.backingOffsetX * distance;
  pose.translateY = tuning.backingOffsetY * distance;
  pose.scale = 1 - tuning.backingScaleStep * depth;
  pose.rotate = (depth % 2 === 0 ? -0.55 : 1) * tuning.backingRotate;
  pose.opacity = 1;
  pose.reveal = 1;
  pose.layer = TOP_LAYER - depth * BACKING_LAYER_STEP;
  pose.stackDepth = depth;
  pose.role = "backing";
  pose.shadowStrength = clamp(0.72 - depth * 0.12, 0.3, 0.72);
  pose.visible = true;
  pose.interactive = false;
}

function cyclicDepth(index: number, topIndex: number, itemCount: number): number {
  return (index - topIndex + itemCount) % itemCount;
}

function setTopPose(pose: MutableStackedDeckPose): void {
  pose.translateX = 0;
  pose.translateY = 0;
  pose.scale = 1;
  pose.rotate = 0;
  pose.opacity = 1;
  pose.reveal = 1;
  pose.layer = TOP_LAYER;
  pose.stackDepth = 0;
  pose.role = "top";
  pose.shadowStrength = 1;
  pose.visible = true;
  pose.interactive = true;
}

function setForwardPair(
  outgoing: MutableStackedDeckPose,
  incoming: MutableStackedDeckPose,
  progress: number,
  tuning: StackedDeckTuning,
): void {
  // Restrained at contact, strongest through the middle, and unit-bounded at release.
  const outgoingProgress = progress * progress * (2 - progress);
  const incomingProgress = smoothstep(clamp((progress - 0.18) / 0.82, 0, 1));
  setBackingPose(incoming, 1, tuning);
  const backingX = incoming.translateX;
  const backingY = incoming.translateY;
  const backingScale = incoming.scale;
  const backingRotate = incoming.rotate;
  const backingShadow = incoming.shadowStrength;

  outgoing.translateX = tuning.forwardPeelX * outgoingProgress;
  outgoing.translateY = tuning.forwardPeelY * Math.sin(progress * Math.PI * 0.82);
  outgoing.scale = 1 - 0.12 * smoothstep(progress);
  outgoing.rotate = tuning.forwardRotate * smoothstep(progress);
  outgoing.opacity =
    progress <= tuning.forwardConcealStart
      ? 1
      : 1 - smoothstep((progress - tuning.forwardConcealStart) / (1 - tuning.forwardConcealStart));
  outgoing.reveal = 1;
  outgoing.layer = TOP_LAYER;
  outgoing.stackDepth = 0;
  outgoing.role = "outgoing";
  outgoing.shadowStrength = 1 - 0.42 * smoothstep(progress);
  outgoing.visible = outgoing.opacity > 0.001;
  outgoing.interactive = false;

  incoming.translateX = mix(backingX, 0, incomingProgress);
  incoming.translateY = mix(backingY, 0, incomingProgress);
  incoming.scale = mix(backingScale, 1, incomingProgress);
  incoming.rotate = mix(backingRotate, 0, incomingProgress);
  incoming.opacity = 1;
  incoming.reveal = 1;
  incoming.layer = EXCHANGE_UNDER_LAYER;
  incoming.stackDepth = 0;
  incoming.role = "incoming";
  incoming.shadowStrength = mix(backingShadow, 1, incomingProgress);
  incoming.visible = progress > 0;
  incoming.interactive = false;
}

function setBackwardPair(
  outgoing: MutableStackedDeckPose,
  incoming: MutableStackedDeckPose,
  progress: number,
  tuning: StackedDeckTuning,
): void {
  const settlement = smoothstep(progress);
  setBackingPose(outgoing, 1, tuning);
  const currentX = outgoing.translateX;
  const currentY = outgoing.translateY;
  const currentScale = outgoing.scale;
  const currentRotate = outgoing.rotate;
  const currentShadow = outgoing.shadowStrength;
  setBackingPose(incoming, tuning.maximumBackingLayers, tuning);
  const retrievedX = incoming.translateX;
  const retrievedY = incoming.translateY;
  const retrievedScale = incoming.scale;
  const retrievedRotate = incoming.rotate;

  outgoing.translateX = mix(0, currentX, settlement);
  outgoing.translateY = mix(0, currentY, settlement);
  outgoing.scale = mix(1, currentScale, settlement);
  outgoing.rotate = mix(0, currentRotate, settlement);
  outgoing.opacity = 1;
  outgoing.reveal = 1;
  outgoing.layer = EXCHANGE_UNDER_LAYER;
  outgoing.stackDepth = 1;
  outgoing.role = "outgoing";
  outgoing.shadowStrength = mix(1, currentShadow, settlement);
  outgoing.visible = true;
  outgoing.interactive = false;

  const excursionProgress = smoothstep(clamp(progress / 0.25, 0, 1));
  const returnProgress = smoothstep(clamp((progress - 0.25) / 0.75, 0, 1));
  const excursionX = mix(retrievedX, tuning.reverseExcursionX, excursionProgress);
  const excursionY = mix(retrievedY, tuning.reverseExcursionY, excursionProgress);
  const excursionScale = mix(retrievedScale, 0.982, excursionProgress);
  const excursionRotate = mix(retrievedRotate, tuning.reverseRotate, excursionProgress);
  incoming.translateX = mix(excursionX, 0, returnProgress);
  incoming.translateY = mix(excursionY, 0, returnProgress);
  incoming.scale = mix(excursionScale, 1, returnProgress);
  incoming.rotate = mix(excursionRotate, 0, returnProgress);
  incoming.opacity = 1;
  // This is the aperture lift, not a card-local crop. The presentation keeps the boundary fixed
  // to the pile until the retrieved card has completed its outward excursion.
  incoming.reveal = smoothstep(clamp((progress - 0.28) / 0.58, 0, 1));
  incoming.layer = TOP_LAYER;
  incoming.stackDepth = 0;
  incoming.role = "incoming";
  incoming.shadowStrength = mix(0.64, 1, settlement);
  incoming.visible = progress > 0;
  incoming.interactive = false;
}

/**
 * Resolves a compact physical pile from explicit exchange roles. No item receives a horizontal
 * carousel slot. At rest one top card covers a bounded backing stack. During a forward exchange
 * the outgoing card remains above the centered incoming card until it is visually concealed.
 * During a backward exchange the retrieved card owns one uninterrupted upper layer, but begins
 * fully clipped while it still belongs behind the pile.
 */
export function resolveStackedDeckFrame(
  options: ResolveStackedDeckFrameOptions,
  output: MutableStackedDeckFrame,
): StackedDeckFrame {
  assertItemCount(options.itemCount);
  validateTuning(options.tuning);
  validateTransition(options.transition, options.itemCount);
  if (output.poses.length !== options.itemCount) {
    throw new RangeError("invalid deck output size");
  }

  const transition = options.transition;
  output.settledIndex = transition.settledIndex;
  output.fromIndex = transition.fromIndex;
  output.toIndex = transition.toIndex;
  output.direction = transition.direction;
  output.progress = transition.progress;
  output.phase = transition.phase;

  for (const pose of output.poses) resetPose(pose);
  if (options.itemCount === 0) return output;

  if (transition.phase === "idle") {
    setTopPose(output.poses[transition.settledIndex]!);
    for (let index = 0; index < output.poses.length; index += 1) {
      if (index === transition.settledIndex) continue;
      const depth = cyclicDepth(index, transition.settledIndex, options.itemCount);
      if (depth > 0 && depth <= options.tuning.maximumBackingLayers) {
        setBackingPose(output.poses[index]!, depth, options.tuning);
      }
    }
    return output;
  }

  const backingTopIndex = transition.direction === 1 ? transition.fromIndex : transition.toIndex;
  for (let index = 0; index < output.poses.length; index += 1) {
    if (index === transition.fromIndex || index === transition.toIndex) continue;
    const depth = cyclicDepth(index, backingTopIndex, options.itemCount);
    if (depth > 0 && depth <= options.tuning.maximumBackingLayers) {
      setBackingPose(output.poses[index]!, depth, options.tuning);
      output.poses[index]!.layer -= BACKING_LAYER_STEP;
    }
  }

  const outgoing = output.poses[transition.fromIndex]!;
  const incoming = output.poses[transition.toIndex]!;
  if (transition.direction === 1) {
    setForwardPair(outgoing, incoming, transition.progress, options.tuning);
  } else {
    setBackwardPair(outgoing, incoming, transition.progress, options.tuning);
  }

  return output;
}
