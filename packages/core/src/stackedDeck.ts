import { assertFiniteNumber, assertNonNegative } from "./bounds";

export type StackedDeckProfile = "compact" | "medium" | "wide";
export type StackedDeckRole = "foreground" | "incoming" | "outgoing" | "rear";

export interface ResolveStackedDeckTuningOptions {
  readonly stageWidth: number;
  readonly stageHeight: number;
  readonly reducedMotion?: boolean;
}

export interface StackedDeckTuning {
  readonly profile: StackedDeckProfile;
  readonly perspective: number;
  readonly cardWidth: number;
  readonly cardHeight: number;
  readonly motionPitch: number;
  readonly sideProjectedX: number;
  readonly sideRotateY: number;
  readonly sideLift: number;
  readonly sideVirtualZ: number;
  readonly stackStrideX: number;
  readonly stackStrideY: number;
  readonly stackStrideZ: number;
  readonly sideVeil: number;
  readonly stackVeil: number;
  readonly hideAfter: number;
  readonly handoffBackward: number;
  readonly handoffForward: number;
}

export interface StackedDeckPose {
  readonly translateX: number;
  readonly translateY: number;
  readonly projectedScale: number;
  readonly rotateY: number;
  readonly virtualZ: number;
  readonly layer: number;
  readonly role: StackedDeckRole;
  readonly veil: number;
  readonly shadowStrength: number;
  readonly visible: boolean;
  readonly interactive: boolean;
}

/** Explicit mutable storage for allocation-free frame resolution. */
export interface MutableStackedDeckPose {
  translateX: number;
  translateY: number;
  projectedScale: number;
  rotateY: number;
  virtualZ: number;
  layer: number;
  role: StackedDeckRole;
  veil: number;
  shadowStrength: number;
  visible: boolean;
  interactive: boolean;
}

export interface StackedDeckFrame {
  readonly physicalIndex: number;
  readonly pairStartIndex: number;
  readonly pairFraction: number;
  readonly ownerIndex: number;
  readonly poses: readonly StackedDeckPose[];
}

/**
 * Caller-owned storage mutated by {@link resolveStackedDeckFrame}. Retain the frame between
 * resolutions so `ownerIndex` supplies the narrow paint-ownership hysteresis state.
 */
export interface MutableStackedDeckFrame {
  physicalIndex: number;
  pairStartIndex: number;
  pairFraction: number;
  ownerIndex: number;
  poses: MutableStackedDeckPose[];
}

export interface ResolveStackedDeckFrameOptions {
  readonly physicalIndex: number;
  readonly itemCount: number;
  readonly tuning: StackedDeckTuning;
  readonly previousOwnerIndex?: number;
}

interface ProfileValues {
  readonly cardWidthRatio: number;
  readonly cardWidthMax: number;
  readonly sideProjectedXRatio: number;
  readonly sideRotateY: number;
  readonly sideLiftRatio: number;
  readonly sideVirtualZ: number;
  readonly stackStrideXRatio: number;
  readonly stackStrideYRatio: number;
  readonly stackStrideZ: number;
  readonly sideVeil: number;
  readonly stackVeil: number;
  readonly hideAfter: number;
}

const PERSPECTIVE = 900;
const SCREEN_ASPECT_RATIO = 1.6;
const HANDOFF_BACKWARD = 0.62;
const HANDOFF_FORWARD = 0.66;
const HANDOFF_CENTER = (HANDOFF_BACKWARD + HANDOFF_FORWARD) / 2;
const FAR_STACK_CONVERGENCE = 0.62;
const OUTGOING_X_EXPONENT = 2.3;
const INCOMING_X_EXPONENT = 1.85;
const OUTGOING_DEPTH_AT_HANDOFF = 0.14;
const INCOMING_DEPTH_AT_HANDOFF = 0.16;

const PROFILE_VALUES: Record<StackedDeckProfile, ProfileValues> = {
  wide: {
    cardWidthRatio: 0.6,
    cardWidthMax: 680,
    sideProjectedXRatio: 0.35,
    sideRotateY: 12,
    sideLiftRatio: -0.07,
    sideVirtualZ: -300,
    stackStrideXRatio: 0.055,
    stackStrideYRatio: -0.014,
    stackStrideZ: -60,
    sideVeil: 0.34,
    stackVeil: 0.13,
    hideAfter: 2.6,
  },
  medium: {
    cardWidthRatio: 0.7,
    cardWidthMax: 620,
    sideProjectedXRatio: 0.34,
    sideRotateY: 10,
    sideLiftRatio: -0.055,
    sideVirtualZ: -285,
    stackStrideXRatio: 0.045,
    stackStrideYRatio: -0.012,
    stackStrideZ: -54,
    sideVeil: 0.36,
    stackVeil: 0.14,
    hideAfter: 2.25,
  },
  compact: {
    cardWidthRatio: 0.87,
    cardWidthMax: 420,
    sideProjectedXRatio: 0.3,
    sideRotateY: 6,
    sideLiftRatio: -0.035,
    sideVirtualZ: -220,
    stackStrideXRatio: 0.032,
    stackStrideYRatio: -0.008,
    stackStrideZ: -42,
    sideVeil: 0.3,
    stackVeil: 0.16,
    hideAfter: 1.45,
  },
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function smoothstep(value: number): number {
  return value * value * (3 - 2 * value);
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

/** Pure responsive tuning for the deterministic stacked-deck compositor. */
export function resolveStackedDeckTuning(
  options: ResolveStackedDeckTuningOptions,
): StackedDeckTuning {
  assertFiniteNumber(options.stageWidth, "stageWidth");
  assertFiniteNumber(options.stageHeight, "stageHeight");
  if (options.stageWidth <= 0 || options.stageHeight <= 0) {
    throw new RangeError("stageWidth and stageHeight must be greater than zero");
  }

  const profile = profileForWidth(options.stageWidth);
  const values = PROFILE_VALUES[profile];
  const reducedMotion = options.reducedMotion ?? false;
  const heightLimitedWidth = options.stageHeight * SCREEN_ASPECT_RATIO * 0.92;
  const cardWidth = Math.round(
    clamp(
      Math.min(options.stageWidth * values.cardWidthRatio, heightLimitedWidth),
      Math.min(240, options.stageWidth),
      values.cardWidthMax,
    ),
  );
  const cardHeight = Math.round(cardWidth / SCREEN_ASPECT_RATIO);
  const sideProjectedX = Math.round(cardWidth * values.sideProjectedXRatio);

  return {
    profile,
    perspective: PERSPECTIVE,
    cardWidth,
    cardHeight,
    motionPitch: Math.max(1, sideProjectedX),
    sideProjectedX,
    sideRotateY: reducedMotion ? 0 : values.sideRotateY,
    sideLift: values.sideLiftRatio * cardHeight * (reducedMotion ? 0.35 : 1),
    sideVirtualZ: reducedMotion ? Math.max(values.sideVirtualZ, -108) : values.sideVirtualZ,
    stackStrideX: values.stackStrideXRatio * cardWidth * (reducedMotion ? 0.7 : 1),
    stackStrideY: values.stackStrideYRatio * cardHeight * (reducedMotion ? 0.35 : 1),
    stackStrideZ: reducedMotion ? Math.max(values.stackStrideZ, -20) : values.stackStrideZ,
    sideVeil: reducedMotion ? Math.min(values.sideVeil, 0.22) : values.sideVeil,
    stackVeil: values.stackVeil,
    hideAfter: values.hideAfter,
    handoffBackward: HANDOFF_BACKWARD,
    handoffForward: HANDOFF_FORWARD,
  };
}

function validateTuning(tuning: StackedDeckTuning): void {
  if (tuning.profile !== "compact" && tuning.profile !== "medium" && tuning.profile !== "wide") {
    throw new RangeError("tuning.profile must be compact, medium, or wide");
  }
  assertFiniteNumber(tuning.perspective, "perspective");
  assertFiniteNumber(tuning.cardWidth, "cardWidth");
  assertFiniteNumber(tuning.cardHeight, "cardHeight");
  assertFiniteNumber(tuning.motionPitch, "motionPitch");
  if (tuning.perspective <= 0) throw new RangeError("perspective must be greater than zero");
  if (tuning.cardWidth <= 0) throw new RangeError("cardWidth must be greater than zero");
  if (tuning.cardHeight <= 0) throw new RangeError("cardHeight must be greater than zero");
  if (tuning.motionPitch <= 0) throw new RangeError("motionPitch must be greater than zero");
  assertFiniteNumber(tuning.sideProjectedX, "sideProjectedX");
  assertFiniteNumber(tuning.sideRotateY, "sideRotateY");
  assertFiniteNumber(tuning.sideLift, "sideLift");
  assertFiniteNumber(tuning.sideVirtualZ, "sideVirtualZ");
  assertFiniteNumber(tuning.stackStrideX, "stackStrideX");
  assertFiniteNumber(tuning.stackStrideY, "stackStrideY");
  assertFiniteNumber(tuning.stackStrideZ, "stackStrideZ");
  assertFiniteNumber(tuning.sideVeil, "sideVeil");
  assertFiniteNumber(tuning.stackVeil, "stackVeil");
  assertFiniteNumber(tuning.hideAfter, "hideAfter");
  assertFiniteNumber(tuning.handoffBackward, "handoffBackward");
  assertFiniteNumber(tuning.handoffForward, "handoffForward");
  if (tuning.sideProjectedX < 0 || tuning.hideAfter <= 0) {
    throw new RangeError("stacked deck distances and visibility must be non-negative");
  }
  if (tuning.sideVeil < 0 || tuning.sideVeil > 1 || tuning.stackVeil < 0 || tuning.stackVeil > 1) {
    throw new RangeError("stacked deck veil strengths must be in [0, 1]");
  }
  if (
    tuning.handoffBackward <= 0.5 ||
    tuning.handoffForward >= 1 ||
    tuning.handoffBackward >= tuning.handoffForward
  ) {
    throw new RangeError("stacked deck handoff thresholds must form a late, ordered band");
  }
}

function createPose(): MutableStackedDeckPose {
  return {
    translateX: 0,
    translateY: 0,
    projectedScale: 1,
    rotateY: 0,
    virtualZ: 0,
    layer: 0,
    role: "rear",
    veil: 0,
    shadowStrength: 1,
    visible: false,
    interactive: false,
  };
}

/** Creates reusable storage for {@link resolveStackedDeckFrame}. */
export function createStackedDeckFrame(itemCount: number): MutableStackedDeckFrame {
  assertItemCount(itemCount);
  return {
    physicalIndex: 0,
    pairStartIndex: itemCount === 0 ? -1 : 0,
    pairFraction: 0,
    ownerIndex: itemCount === 0 ? -1 : 0,
    poses: Array.from({ length: itemCount }, createPose),
  };
}

function projectedScale(perspective: number, virtualZ: number): number {
  return perspective / (perspective - virtualZ);
}

function convergedStackDistance(distance: number): number {
  if (distance <= 0) return 0;
  return (1 - FAR_STACK_CONVERGENCE ** distance) / (1 - FAR_STACK_CONVERGENCE);
}

function resolveBasePose(
  pose: MutableStackedDeckPose,
  relativeIndex: number,
  tuning: StackedDeckTuning,
): void {
  const magnitude = Math.abs(relativeIndex);
  pose.role = "rear";
  if (magnitude === 0) {
    pose.translateX = 0;
    pose.translateY = 0;
    pose.rotateY = 0;
    pose.virtualZ = 0;
    pose.projectedScale = 1;
    pose.veil = 0;
    pose.shadowStrength = 1;
    return;
  }

  const direction = Math.sign(relativeIndex);
  if (magnitude <= 1) {
    const shaped = smoothstep(magnitude);
    pose.translateX = direction * tuning.sideProjectedX * magnitude;
    pose.translateY = tuning.sideLift * shaped;
    pose.rotateY = -direction * tuning.sideRotateY * shaped;
    pose.virtualZ = tuning.sideVirtualZ * shaped;
    pose.veil = tuning.sideVeil * shaped;
    pose.shadowStrength = 1 - shaped * 0.56;
  } else {
    const stackDistance = magnitude - 1;
    const convergedDistance = convergedStackDistance(stackDistance);
    pose.translateX = direction * (tuning.sideProjectedX + tuning.stackStrideX * convergedDistance);
    pose.translateY = tuning.sideLift + tuning.stackStrideY * convergedDistance;
    pose.rotateY = -direction * tuning.sideRotateY;
    pose.virtualZ = tuning.sideVirtualZ + tuning.stackStrideZ * stackDistance;
    pose.veil = clamp(tuning.sideVeil + tuning.stackVeil * convergedDistance, 0, 0.82);
    pose.shadowStrength = 0.36;
  }
  pose.projectedScale = projectedScale(tuning.perspective, pose.virtualZ);
}

function resolveOutgoingDepth(pairFraction: number): number {
  if (pairFraction <= HANDOFF_CENTER) {
    const progress = smoothstep(pairFraction / HANDOFF_CENTER);
    return OUTGOING_DEPTH_AT_HANDOFF * progress;
  }
  const progress = smoothstep((pairFraction - HANDOFF_CENTER) / (1 - HANDOFF_CENTER));
  return OUTGOING_DEPTH_AT_HANDOFF + (1 - OUTGOING_DEPTH_AT_HANDOFF) * progress;
}

function resolveIncomingDepth(pairFraction: number): number {
  if (pairFraction <= HANDOFF_CENTER) {
    const progress = smoothstep(pairFraction / HANDOFF_CENTER);
    return 1 - (1 - INCOMING_DEPTH_AT_HANDOFF) * progress;
  }
  const progress = smoothstep((pairFraction - HANDOFF_CENTER) / (1 - HANDOFF_CENTER));
  return INCOMING_DEPTH_AT_HANDOFF * (1 - progress);
}

function resolveOutgoingShadow(pairFraction: number): number {
  if (pairFraction <= HANDOFF_CENTER) {
    return 1 - 0.38 * smoothstep(pairFraction / HANDOFF_CENTER);
  }
  return 0.62 - 0.18 * smoothstep((pairFraction - HANDOFF_CENTER) / (1 - HANDOFF_CENTER));
}

function resolveIncomingShadow(pairFraction: number): number {
  if (pairFraction <= HANDOFF_CENTER) {
    return 0.44 + 0.18 * smoothstep(pairFraction / HANDOFF_CENTER);
  }
  return 0.62 + 0.38 * smoothstep((pairFraction - HANDOFF_CENTER) / (1 - HANDOFF_CENTER));
}

function resolvePairPose(
  pose: MutableStackedDeckPose,
  translateX: number,
  depthFraction: number,
  rotateY: number,
  shadowStrength: number,
  tuning: StackedDeckTuning,
): void {
  pose.translateX = translateX === 0 ? 0 : translateX;
  pose.translateY = tuning.sideLift * depthFraction;
  if (pose.translateY === 0) pose.translateY = 0;
  pose.rotateY = rotateY === 0 ? 0 : rotateY;
  pose.virtualZ = tuning.sideVirtualZ * depthFraction;
  if (pose.virtualZ === 0) pose.virtualZ = 0;
  pose.projectedScale = projectedScale(tuning.perspective, pose.virtualZ);
  pose.veil = tuning.sideVeil * depthFraction;
  pose.shadowStrength = shadowStrength;
}

function resolveOwnerIndex(
  physicalIndex: number,
  pairStartIndex: number,
  pairFraction: number,
  previousOwnerIndex: number,
  itemCount: number,
  tuning: StackedDeckTuning,
): number {
  if (itemCount === 0) return -1;
  const maximumIndex = itemCount - 1;
  if (physicalIndex <= 0) return 0;
  if (physicalIndex >= maximumIndex) return maximumIndex;
  const nextIndex = pairStartIndex + 1;
  if (pairFraction === 0) return pairStartIndex;
  if (pairFraction === 1) return nextIndex;
  if (previousOwnerIndex <= pairStartIndex) {
    return pairFraction >= tuning.handoffForward ? nextIndex : pairStartIndex;
  }
  if (previousOwnerIndex >= nextIndex) {
    return pairFraction <= tuning.handoffBackward ? pairStartIndex : nextIndex;
  }
  return pairFraction < HANDOFF_CENTER ? pairStartIndex : nextIndex;
}

/**
 * Resolves the whole physical deck against one live scalar index. The active pair follows an
 * asymmetric top-card shuffle: the outgoing card yields space slowly while the incoming card
 * approaches center beneath it. Only the integer paint layer changes discretely, inside heavy
 * overlap after both material paths have converged near the handoff.
 */
export function resolveStackedDeckFrame(
  options: ResolveStackedDeckFrameOptions,
  output: MutableStackedDeckFrame,
): StackedDeckFrame {
  assertFiniteNumber(options.physicalIndex, "physicalIndex");
  assertItemCount(options.itemCount);
  validateTuning(options.tuning);
  if (output.poses.length !== options.itemCount) {
    throw new RangeError("output pose count must equal itemCount");
  }

  const previousOwnerIndex = options.previousOwnerIndex ?? output.ownerIndex;
  if (
    !Number.isInteger(previousOwnerIndex) ||
    previousOwnerIndex < -1 ||
    previousOwnerIndex >= Math.max(1, options.itemCount)
  ) {
    throw new RangeError("previousOwnerIndex must identify an item or be -1");
  }

  const maximumIndex = Math.max(0, options.itemCount - 1);
  const clampedPhysicalIndex = clamp(options.physicalIndex, 0, maximumIndex);
  const pairStartIndex =
    options.itemCount <= 1
      ? options.itemCount - 1
      : Math.min(maximumIndex - 1, Math.floor(clampedPhysicalIndex));
  const pairFraction =
    options.itemCount <= 1 ? 0 : clamp(clampedPhysicalIndex - pairStartIndex, 0, 1);
  const inRangeTransition =
    options.itemCount > 1 &&
    options.physicalIndex >= 0 &&
    options.physicalIndex <= maximumIndex &&
    pairFraction > 0 &&
    pairFraction < 1;
  const ownerIndex = resolveOwnerIndex(
    options.physicalIndex,
    Math.max(0, pairStartIndex),
    pairFraction,
    previousOwnerIndex,
    options.itemCount,
    options.tuning,
  );

  output.physicalIndex = options.physicalIndex;
  output.pairStartIndex = pairStartIndex;
  output.pairFraction = pairFraction;
  output.ownerIndex = ownerIndex;

  let outgoingDepth = 0;
  let incomingDepth = 0;
  let outgoingShadow = 1;
  let incomingShadow = 1;
  if (inRangeTransition) {
    outgoingDepth = resolveOutgoingDepth(pairFraction);
    incomingDepth = resolveIncomingDepth(pairFraction);
    outgoingShadow = resolveOutgoingShadow(pairFraction);
    incomingShadow = resolveIncomingShadow(pairFraction);
  }

  for (let index = 0; index < output.poses.length; index += 1) {
    const pose = output.poses[index]!;
    const relativeIndex = index - options.physicalIndex;
    resolveBasePose(pose, relativeIndex, options.tuning);

    if (inRangeTransition && index === pairStartIndex) {
      resolvePairPose(
        pose,
        -options.tuning.sideProjectedX * pairFraction ** OUTGOING_X_EXPONENT,
        outgoingDepth,
        options.tuning.sideRotateY * pairFraction ** 2,
        outgoingShadow,
        options.tuning,
      );
      pose.role = ownerIndex === index ? "foreground" : "outgoing";
    } else if (inRangeTransition && index === pairStartIndex + 1) {
      resolvePairPose(
        pose,
        options.tuning.sideProjectedX * (1 - pairFraction) ** INCOMING_X_EXPONENT,
        incomingDepth,
        -options.tuning.sideRotateY * (1 - pairFraction) ** 1.55,
        incomingShadow,
        options.tuning,
      );
      pose.role = ownerIndex === index ? "foreground" : "incoming";
    } else if (index === ownerIndex) {
      pose.role = "foreground";
    }

    const magnitude = Math.abs(relativeIndex);
    pose.visible = magnitude <= options.tuning.hideAfter;
    pose.interactive = pose.visible && (index === ownerIndex || magnitude <= 1.001);
    const ownerDistance = Math.abs(index - ownerIndex);
    const layerBase = 1_000 + (options.itemCount - ownerDistance) * 3;
    pose.layer = layerBase + (index === ownerIndex ? 2 : index < ownerIndex ? 1 : 0);
  }

  return output;
}
