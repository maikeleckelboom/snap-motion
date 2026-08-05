import { assertFiniteNumber, assertNonNegative } from "./bounds";

export type StackedCoverflowProfile = "compact" | "medium" | "wide";

export interface ResolveStackedCoverflowTuningOptions {
  readonly stageWidth: number;
  readonly stageHeight: number;
  readonly reducedMotion?: boolean;
}

export interface StackedCoverflowTuning {
  readonly profile: StackedCoverflowProfile;
  readonly perspective: number;
  readonly cardWidth: number;
  readonly cardHeight: number;
  readonly motionPitch: number;
  readonly sideProjectedX: number;
  readonly sideRotateY: number;
  readonly sideLift: number;
  readonly sideVirtualZ: number;
  readonly passingX: number;
  readonly passingRotateY: number;
  readonly passingRecess: number;
  readonly stackStrideX: number;
  readonly stackStrideY: number;
  readonly stackStrideZ: number;
  readonly sideVeil: number;
  readonly stackVeil: number;
  readonly sideBlur: number;
  readonly hideAfter: number;
  readonly handoffLower: number;
  readonly handoffUpper: number;
}

export interface StackedCoverflowPose {
  readonly translateX: number;
  readonly translateY: number;
  readonly projectedScale: number;
  readonly rotateY: number;
  readonly virtualZ: number;
  readonly layer: number;
  readonly veil: number;
  readonly blur: number;
  readonly visible: boolean;
  readonly interactive: boolean;
}

/** Explicit mutable storage for allocation-free frame resolution. */
export interface MutableStackedCoverflowPose {
  translateX: number;
  translateY: number;
  projectedScale: number;
  rotateY: number;
  virtualZ: number;
  layer: number;
  veil: number;
  blur: number;
  visible: boolean;
  interactive: boolean;
}

export interface StackedCoverflowFrame {
  readonly physicalIndex: number;
  readonly pairStartIndex: number;
  readonly pairFraction: number;
  readonly passingLane: number;
  readonly ownerIndex: number;
  readonly poses: readonly StackedCoverflowPose[];
}

/**
 * Caller-owned storage mutated by {@link resolveStackedCoverflowFrame}. Allocate once, then retain
 * its `ownerIndex` between frames so the paint handoff keeps its hysteresis state.
 */
export interface MutableStackedCoverflowFrame {
  physicalIndex: number;
  pairStartIndex: number;
  pairFraction: number;
  passingLane: number;
  ownerIndex: number;
  poses: MutableStackedCoverflowPose[];
}

export interface ResolveStackedCoverflowFrameOptions {
  readonly physicalIndex: number;
  readonly itemCount: number;
  readonly tuning: StackedCoverflowTuning;
  readonly previousOwnerIndex?: number;
}

interface ProfileValues {
  readonly cardWidthRatio: number;
  readonly cardWidthMax: number;
  readonly sideProjectedXRatio: number;
  readonly sideRotateY: number;
  readonly sideLiftRatio: number;
  readonly sideVirtualZ: number;
  readonly passingXRatio: number;
  readonly passingRotateY: number;
  readonly passingRecess: number;
  readonly stackStrideXRatio: number;
  readonly stackStrideYRatio: number;
  readonly stackStrideZ: number;
  readonly sideVeil: number;
  readonly stackVeil: number;
  readonly hideAfter: number;
}

const PERSPECTIVE = 900;
const SCREEN_ASPECT_RATIO = 1.6;
const HANDOFF_LOWER = 0.46;
const HANDOFF_UPPER = 0.54;
const FAR_STACK_CONVERGENCE = 0.62;
const PASSING_LANE_MAXIMUM_SLOPE = 3.08;

const PROFILE_VALUES: Record<StackedCoverflowProfile, ProfileValues> = {
  wide: {
    cardWidthRatio: 0.6,
    cardWidthMax: 680,
    sideProjectedXRatio: 0.35,
    sideRotateY: 12,
    sideLiftRatio: -0.07,
    sideVirtualZ: -300,
    passingXRatio: 0.105,
    passingRotateY: 5,
    passingRecess: 30,
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
    passingXRatio: 0.085,
    passingRotateY: 4,
    passingRecess: 24,
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
    passingXRatio: 0.05,
    passingRotateY: 2.5,
    passingRecess: 14,
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

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function assertItemCount(itemCount: number): void {
  assertNonNegative(itemCount, "itemCount");
  if (!Number.isInteger(itemCount)) {
    throw new RangeError("itemCount must be an integer");
  }
}

function profileForWidth(stageWidth: number): StackedCoverflowProfile {
  if (stageWidth >= 960) return "wide";
  if (stageWidth >= 600) return "medium";
  return "compact";
}

/** Pure responsive tuning for the deterministic stacked compositor. */
export function resolveStackedCoverflowTuning(
  options: ResolveStackedCoverflowTuningOptions,
): StackedCoverflowTuning {
  assertFiniteNumber(options.stageWidth, "stageWidth");
  assertFiniteNumber(options.stageHeight, "stageHeight");
  if (options.stageWidth <= 0 || options.stageHeight <= 0) {
    throw new RangeError("stageWidth and stageHeight must be greater than zero");
  }

  const profile = profileForWidth(options.stageWidth);
  const values = PROFILE_VALUES[profile];
  const heightLimitedWidth = options.stageHeight * SCREEN_ASPECT_RATIO * 0.92;
  const cardWidth = Math.round(
    clamp(
      Math.min(options.stageWidth * values.cardWidthRatio, heightLimitedWidth),
      Math.min(240, options.stageWidth),
      values.cardWidthMax,
    ),
  );
  const cardHeight = Math.round(cardWidth / SCREEN_ASPECT_RATIO);
  const reducedMotion = options.reducedMotion ?? false;
  const sideVirtualZ = reducedMotion ? Math.max(values.sideVirtualZ, -120) : values.sideVirtualZ;
  const sideProjectedX = Math.round(cardWidth * values.sideProjectedXRatio);

  return {
    profile,
    perspective: PERSPECTIVE,
    cardWidth,
    cardHeight,
    motionPitch: Math.max(1, sideProjectedX),
    sideProjectedX,
    sideRotateY: reducedMotion ? 0 : values.sideRotateY,
    sideLift: values.sideLiftRatio * cardHeight * (reducedMotion ? 0.5 : 1),
    sideVirtualZ,
    passingX: reducedMotion ? 0 : values.passingXRatio * cardWidth,
    passingRotateY: reducedMotion ? 0 : values.passingRotateY,
    passingRecess: reducedMotion ? 0 : values.passingRecess,
    stackStrideX: values.stackStrideXRatio * cardWidth,
    stackStrideY: values.stackStrideYRatio * cardHeight * (reducedMotion ? 0.5 : 1),
    stackStrideZ: reducedMotion ? Math.max(values.stackStrideZ, -24) : values.stackStrideZ,
    sideVeil: reducedMotion ? Math.min(values.sideVeil, 0.24) : values.sideVeil,
    stackVeil: values.stackVeil,
    sideBlur: 0,
    hideAfter: values.hideAfter,
    handoffLower: HANDOFF_LOWER,
    handoffUpper: HANDOFF_UPPER,
  };
}

function validateTuning(tuning: StackedCoverflowTuning): void {
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
  assertFiniteNumber(tuning.passingX, "passingX");
  assertFiniteNumber(tuning.passingRotateY, "passingRotateY");
  assertFiniteNumber(tuning.passingRecess, "passingRecess");
  assertFiniteNumber(tuning.stackStrideX, "stackStrideX");
  assertFiniteNumber(tuning.stackStrideY, "stackStrideY");
  assertFiniteNumber(tuning.stackStrideZ, "stackStrideZ");
  assertFiniteNumber(tuning.sideVeil, "sideVeil");
  assertFiniteNumber(tuning.stackVeil, "stackVeil");
  assertFiniteNumber(tuning.sideBlur, "sideBlur");
  assertFiniteNumber(tuning.hideAfter, "hideAfter");
  assertFiniteNumber(tuning.handoffLower, "handoffLower");
  assertFiniteNumber(tuning.handoffUpper, "handoffUpper");

  if (
    tuning.sideProjectedX < 0 ||
    tuning.passingX < 0 ||
    tuning.passingRecess < 0 ||
    tuning.sideBlur < 0 ||
    tuning.hideAfter <= 0
  ) {
    throw new RangeError("stacked coverflow distances, blur, and visibility must be non-negative");
  }
  if (tuning.sideVeil < 0 || tuning.sideVeil > 1 || tuning.stackVeil < 0 || tuning.stackVeil > 1) {
    throw new RangeError("stacked coverflow veil strengths must be in [0, 1]");
  }
  if (
    tuning.handoffLower <= 0 ||
    tuning.handoffLower >= 0.5 ||
    tuning.handoffUpper <= 0.5 ||
    tuning.handoffUpper >= 1 ||
    tuning.handoffLower >= tuning.handoffUpper
  ) {
    throw new RangeError("stacked coverflow handoff thresholds must straddle 0.5");
  }
  if (tuning.passingX * PASSING_LANE_MAXIMUM_SLOPE > tuning.sideProjectedX + 1e-9) {
    throw new RangeError("passingX is too large to preserve monotonic horizontal travel");
  }
}

function createPose(): MutableStackedCoverflowPose {
  return {
    translateX: 0,
    translateY: 0,
    projectedScale: 1,
    rotateY: 0,
    virtualZ: 0,
    layer: 0,
    veil: 0,
    blur: 0,
    visible: false,
    interactive: false,
  };
}

/** Creates reusable storage for {@link resolveStackedCoverflowFrame}. */
export function createStackedCoverflowFrame(itemCount: number): MutableStackedCoverflowFrame {
  assertItemCount(itemCount);
  return {
    physicalIndex: 0,
    pairStartIndex: itemCount === 0 ? -1 : 0,
    pairFraction: 0,
    passingLane: 0,
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
  pose: MutableStackedCoverflowPose,
  relativeIndex: number,
  tuning: StackedCoverflowTuning,
): void {
  const magnitude = Math.abs(relativeIndex);
  if (magnitude === 0) {
    pose.translateX = 0;
    pose.translateY = 0;
    pose.rotateY = 0;
    pose.virtualZ = 0;
    pose.projectedScale = 1;
    pose.veil = 0;
    pose.blur = 0;
    return;
  }
  const direction = relativeIndex === 0 ? 0 : Math.sign(relativeIndex);
  if (magnitude <= 1) {
    const shaped = smoothstep(magnitude);
    pose.translateX = direction * tuning.sideProjectedX * magnitude;
    pose.translateY = tuning.sideLift * shaped;
    pose.rotateY = -direction * tuning.sideRotateY * shaped;
    pose.virtualZ = tuning.sideVirtualZ * shaped;
    pose.veil = tuning.sideVeil * shaped;
    pose.blur = tuning.sideBlur * shaped;
  } else {
    const stackDistance = magnitude - 1;
    const convergedDistance = convergedStackDistance(stackDistance);
    pose.translateX = direction * (tuning.sideProjectedX + tuning.stackStrideX * convergedDistance);
    pose.translateY = tuning.sideLift + tuning.stackStrideY * convergedDistance;
    pose.rotateY = -direction * tuning.sideRotateY;
    pose.virtualZ = tuning.sideVirtualZ + tuning.stackStrideZ * stackDistance;
    pose.veil = clamp(tuning.sideVeil + tuning.stackVeil * convergedDistance, 0, 0.82);
    pose.blur = tuning.sideBlur;
  }
  pose.projectedScale = projectedScale(tuning.perspective, pose.virtualZ);
}

function resolvePairDepthFraction(t: number, tuning: StackedCoverflowTuning): number {
  if (t < tuning.handoffLower) {
    return smoothstep(t / tuning.handoffLower) * 0.5;
  }
  if (t <= tuning.handoffUpper) return 0.5;
  return 0.5 + smoothstep((t - tuning.handoffUpper) / (1 - tuning.handoffUpper)) * 0.5;
}

function resolvePairPose(
  pose: MutableStackedCoverflowPose,
  depthFraction: number,
  direction: -1 | 1,
  translateX: number,
  lane: number,
  tuning: StackedCoverflowTuning,
): void {
  pose.translateX = translateX === 0 ? 0 : translateX;
  pose.translateY = tuning.sideLift * depthFraction;
  if (pose.translateY === 0) pose.translateY = 0;
  pose.rotateY = -direction * (tuning.sideRotateY * depthFraction + tuning.passingRotateY * lane);
  pose.virtualZ = tuning.sideVirtualZ * depthFraction - tuning.passingRecess * lane;
  if (pose.virtualZ === 0) pose.virtualZ = 0;
  pose.projectedScale = projectedScale(tuning.perspective, pose.virtualZ);
  pose.veil = tuning.sideVeil * depthFraction;
  pose.blur = tuning.sideBlur * depthFraction;
}

function resolveOwnerIndex(
  physicalIndex: number,
  pairStartIndex: number,
  pairFraction: number,
  previousOwnerIndex: number,
  itemCount: number,
  tuning: StackedCoverflowTuning,
): number {
  if (itemCount === 0) return -1;
  const maximumIndex = itemCount - 1;
  if (physicalIndex <= 0) return 0;
  if (physicalIndex >= maximumIndex) return maximumIndex;

  const nextIndex = pairStartIndex + 1;
  if (previousOwnerIndex <= pairStartIndex) {
    return pairFraction >= tuning.handoffUpper ? nextIndex : pairStartIndex;
  }
  if (previousOwnerIndex >= nextIndex) {
    return pairFraction <= tuning.handoffLower ? pairStartIndex : nextIndex;
  }
  return pairFraction < 0.5 ? pairStartIndex : nextIndex;
}

/**
 * Resolves the complete visible deck against one live physical index. The caller-provided output
 * is mutated in place; no arrays, poses, or sort keys are allocated on the frame path.
 */
export function resolveStackedCoverflowFrame(
  options: ResolveStackedCoverflowFrameOptions,
  output: MutableStackedCoverflowFrame,
): StackedCoverflowFrame {
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
    options.itemCount > 1 && options.physicalIndex >= 0 && options.physicalIndex <= maximumIndex;
  const passingLane = inRangeTransition ? 16 * pairFraction ** 2 * (1 - pairFraction) ** 2 : 0;
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
  output.passingLane = passingLane;
  output.ownerIndex = ownerIndex;

  for (let index = 0; index < output.poses.length; index += 1) {
    const pose = output.poses[index]!;
    const relativeIndex = index - options.physicalIndex;
    resolveBasePose(pose, relativeIndex, options.tuning);

    if (
      inRangeTransition &&
      pairStartIndex >= 0 &&
      (index === pairStartIndex || index === pairStartIndex + 1)
    ) {
      const pairDepthFraction = resolvePairDepthFraction(pairFraction, options.tuning);
      if (index === pairStartIndex) {
        resolvePairPose(
          pose,
          pairDepthFraction,
          -1,
          -options.tuning.sideProjectedX * pairFraction - options.tuning.passingX * passingLane,
          passingLane,
          options.tuning,
        );
      } else {
        resolvePairPose(
          pose,
          1 - pairDepthFraction,
          1,
          options.tuning.sideProjectedX * (1 - pairFraction) +
            options.tuning.passingX * passingLane,
          passingLane,
          options.tuning,
        );
      }
    }

    const magnitude = Math.abs(relativeIndex);
    pose.visible = magnitude <= options.tuning.hideAfter;
    pose.interactive = pose.visible && (index === ownerIndex || magnitude <= 1.001);
    const ownerDistance = Math.abs(index - ownerIndex);
    pose.layer = 1_000 + (options.itemCount - ownerDistance) * 2 - (index > ownerIndex ? 1 : 0);
  }

  return output;
}
