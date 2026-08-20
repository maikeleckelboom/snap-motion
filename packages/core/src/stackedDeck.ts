import { assertFiniteNumber, assertNonNegative, clamp, mix, smoothstep } from "./bounds";
import type { ControllerPhase } from "./types";

export type StackedDeckProfile = "compact" | "medium" | "wide";
/** Physical exchange presentation. Omitted values resolve to the accepted Shuffle projection. */
export type StackedDeckExchange = "shuffle" | "direct";
export type StackedDeckRole = "top" | "target" | "hidden";
export type StackedDeckTraversalPhase = "idle" | "neutral" | "traversing" | "elastic";

/**
 * Transient input for the Direct projection. The adapter keeps identity and pointer lifecycle;
 * core remains the sole owner of the geometry rendered for that state.
 */
export interface StackedDeckDirectProjection {
  /** Stable interaction origin, resolved against the adapter's current ordered collection. */
  readonly originIndex: number;
  /** Explicit ring direction. It remains authoritative when both directions name the same ID. */
  readonly direction: -1 | 0 | 1;
  /** Semantic neighbour selected by `direction`, or `null` when no exchange is available. */
  readonly targetIndex: number | null;
  /** Signed interaction-local travel from the origin, before presentation easing. */
  readonly signedTravel: number;
  /** Pointer lifecycle; omitted autonomous exchanges park directly along scalar travel. */
  readonly phase?: "held" | "parking" | "returning";
  /** Hand-owned shell translation in stage coordinates. Ignored for autonomous movement. */
  readonly translateX: number;
  /** Raw hand-owned vertical translation; it never affects scalar target or pile geometry. */
  readonly translateY: number;
  /**
   * Bounded presentation settlement of the released shell: `0` is the exact frame the hand let go
   * of it and `1` is the exact frame it owns at the end of its release. It stays `0` for as long
   * as a hand still holds the shell, which has not been released from anything yet.
   *
   * It is owned by the presentation and never derived from remaining logical travel. Logical
   * navigation can complete a whole pitch while the pointer-locked shell is still hundreds of
   * pixels from the slot it is parking into, so scalar completion cannot express — and must never
   * divide — physical parking completion.
   */
  readonly settlement: number;
  /**
   * Optional interruption anchor. A new interaction resolves from the already-rendered physical
   * frame rather than first teleporting a still-parking shell to nominal rest geometry.
   */
  readonly continuity?: null | {
    /** Endpoint interpolation progress of the new interaction at the captured frame. */
    readonly progress: number;
    /** Complete resolved pile at interruption; captured once when the new hand takes ownership. */
    readonly poses: readonly StackedDeckPose[];
  };
}

/**
 * Presentation state for one bounded interaction-local ring exchange.
 * Selection remains controller-owned; visualTopIndex advances only after a complete local pitch.
 *
 * `visualTopIndex` names the card at the segment origin, and `authoritativeIndex` names the card the
 * eye already reads as current. They differ only while the persistent physical cards exchange
 * depth; no renderer ownership changes with either value.
 */
export interface StackedDeckTraversal {
  readonly settledIndex: number;
  readonly visualTopIndex: number;
  readonly authoritativeIndex: number;
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
  authoritativeIndex: number;
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
  /** Semantic item at interaction-local position zero. */
  readonly originIndex: number;
  /** Signed physical travel in cards from `originIndex`; one interaction never changes its zero. */
  readonly physicalPosition: number;
  readonly settledIndex: number;
}

export interface ResolveStackedDeckTuningOptions {
  readonly stageWidth: number;
  readonly stageHeight: number;
  readonly reducedMotion?: boolean;
}

export interface ResolveStackedDeckPileOptions {
  /** The frame the pile completes, so the deck's thickness is exactly the screens it does not draw. */
  readonly frame: StackedDeckFrame;
  readonly tuning: StackedDeckTuning;
}

export interface StackedDeckTuning {
  readonly profile: StackedDeckProfile;
  readonly cardWidth: number;
  readonly cardHeight: number;
  readonly motionPitch: number;
  readonly pileOffsetX: number;
  readonly pileOffsetY: number;
  readonly pileScaleStep: number;
  readonly pileRotate: number;
  readonly topDropY: number;
  readonly topRotate: number;
  readonly topScaleReduction: number;
}

/**
 * Compatibility projection of one non-dominant physical card. High-level rendering uses the same
 * persistent card shell for face and depth; custom renderers can continue consuming this projection
 * without it implying a second physical owner.
 */
export interface StackedDeckPilePose {
  /** Ordered collection index whose persistent physical card occupies this layer. */
  readonly itemIndex: number;
  /** Forward ring distance behind the current physical top. */
  readonly depth: number;
  /**
   * Compact visual slot derived from ring depth. Its sign chooses the pile side; it never owns
   * physical depth or semantic identity.
   */
  readonly slot: number;
  readonly translateX: number;
  readonly translateY: number;
  readonly scale: number;
  readonly rotate: number;
  readonly opacity: number;
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
  /** Present only while Direct has an interaction-specific physical owner. */
  readonly direct?: StackedDeckDirectProjection;
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
/**
 * Ratio between successive slot steps. The total spread converges to `1 / (1 - decay)` steps, which
 * is what keeps a deck of any length an edge-and-depth stack rather than a widening rail.
 */
const PILE_SLOT_DECAY = 0.7;
const PILE_SCALE_STEP = 0.05;
/**
 * The nearest hidden shell needs a visibly independent outer edge. Its angle is intentionally
 * larger than a decorative lean, while depth growth is bounded separately in `setPilePose` so a
 * long deck remains a compact stack rather than becoming a fan.
 */
const PILE_ROTATE = 2;
const TOP_ROTATE = 4;
const TOP_SCALE_REDUCTION = 0.11;
const TOP_LAYER = 500;
/**
 * Paint order of a shell physical ownership has not finished with: the one under the hand, and the
 * one just released that has not yet passed behind the new top.
 */
const HAND_LAYER = TOP_LAYER + 1;
const TARGET_LAYER = 400;
const PILE_LAYER_STEP = 10;
/**
 * Local progress at which the incoming card is nearer the top slot than the card vacating it, and
 * so becomes the one a user would name and act on. This threshold affects semantics only; physical
 * card geometry remains a continuous function of progress on either side of it.
 */
const AUTHORITY_MIDPOINT = 0.5;
/**
 * Dead band around that midpoint. Identity then changes once per crossing rather than once per
 * jitter, so a hand shaking on the boundary cannot rename the deck.
 */
const AUTHORITY_HYSTERESIS = 0.04;
const TRAVERSAL_EPSILON = 0.000_001;
/**
 * Settlement by which a released shell has passed behind the new top: the apex of its parking path,
 * which is the point that path is built to stand clear of the card that replaced it at. It may
 * cross earlier — on the first frame that is actually clear — and never later.
 */
const CROSSOVER_SETTLEMENT = 0.5;
/**
 * Lateral distance between two card centres at which their bodies share no pixel, as a margin on
 * one whole card width.
 *
 * A width apart is exact for the two poses that matter — the released card as the hand left it and
 * the new top at rest are both unrotated and unscaled — and conservative everywhere else on the
 * path: a shell partway into the pile has given up more to scale recession than its two degrees of
 * lean can add back, so its true bound is always inside this one. The margin itself is not tuning.
 * Transforms are written rounded and edges are rasterised with antialiasing, so a swap decided at
 * exact tangency would still be deciding the colour of a shared column of pixels.
 *
 * Depth is a lateral question alone. Raw vertical hand travel already never moves target or pile
 * geometry, and letting it decide paint order would make the same gesture swap at a different
 * moment for no reason the eye could read.
 */
const CROSSOVER_CLEARANCE = 2;
/**
 * Background shells first recede beneath the exchanging target, stay behind it while folded depth
 * changes, and only then re-emerge. The shell remains opaque and rendered; the smaller body is
 * physical backside recession, not a visibility effect.
 */
const PILE_OCCLUSION_ENTER = 0.25;
const PILE_OCCLUSION_EXIT = 0.75;
const PILE_OCCLUDED_SCALE = 0.72;
// The rear target changes depth inside numerical rest, while the source still covers every pixel;
// by the first perceptible hand movement it is ready to be revealed as the Direct destination.
const DIRECT_TARGET_CONTAINED = TRAVERSAL_EPSILON ** 2;
const DIRECT_TARGET_RETURNED = TRAVERSAL_EPSILON * 3;
const TUNING_NUMBER_KEYS = [
  "cardWidth",
  "cardHeight",
  "motionPitch",
  "pileOffsetX",
  "pileOffsetY",
  "pileScaleStep",
  "pileRotate",
  "topDropY",
  "topRotate",
  "topScaleReduction",
] as const;

/**
 * The shallow vertical step works with scale recession and rotation: the outer bottom corner
 * crosses the top card while the inner corner remains occluded. The resulting wedge identifies a
 * second rectangle without outlining the foreground card's whole bottom edge.
 */
const PROFILE_VALUES: Record<StackedDeckProfile, ProfileValues> = {
  wide: {
    cardWidthRatio: 0.61,
    cardWidthMax: 680,
    motionPitchRatio: 0.88,
    pileOffsetXRatio: 0.05,
    pileOffsetYRatio: 0.026,
    topDropYRatio: 0.075,
  },
  medium: {
    cardWidthRatio: 0.62,
    cardWidthMax: 520,
    motionPitchRatio: 0.86,
    pileOffsetXRatio: 0.051,
    pileOffsetYRatio: 0.027,
    topDropYRatio: 0.072,
  },
  compact: {
    cardWidthRatio: 0.6,
    cardWidthMax: 300,
    motionPitchRatio: 0.8,
    pileOffsetXRatio: 0.053,
    pileOffsetYRatio: 0.028,
    topDropYRatio: 0.068,
  },
};

/**
 * Lateral shuffle path of the card leaving the top. The direct envelope follows the pointer through
 * the opening fifth of the gesture, then returns with zero endpoint velocity so it joins the pile
 * without a path kink. The corner envelope leaves that direct opening untouched, rises with flat
 * boundary slopes into exact crossover clearance, then gives the longer return route a broad rate
 * envelope so it remains visibly in motion behind the incoming card before settling into the pile.
 */
function exchangeReturnWeight(progress: number): number {
  const phase = (progress - 0.5) / 0.5;
  const centred = phase * 2 - 1;
  // The normalized rate is `5 / 4 * (1 - centred ** 4)`: zero at both joins, broad through the
  // traversal, and unit-area so the exact endpoint is unchanged. Its 1.25 peak replaces the
  // smoothstep rate's narrower 1.5 shoulder without introducing a new timing or state dependency.
  return 1 - (5 / 4) * (phase - (centred ** 5 + 1) / 10);
}

function exchangeDetour(progress: number, directRatio: number): number {
  const directEnvelope = progress * (1 - progress ** 4) ** 2;
  const middleWeight =
    progress <= 0.5 ? smoothstep((progress - 0.2) / 0.3) : exchangeReturnWeight(progress);
  const midpointDirect = directRatio * 0.5 * (1 - 0.5 ** 4) ** 2;
  return directRatio * directEnvelope + (0.9 - midpointDirect) * middleWeight;
}

/**
 * How far out slot `depth` sits, as a multiple of one step. A geometric series rather than a plain
 * multiple: the first slot is exactly one step out, which is where every target rises from, while a
 * deck of any length stays a pile that thickens instead of a fan that walks off the stage.
 */
function pileSlotSpread(depth: number): number {
  return (1 - PILE_SLOT_DECAY ** depth) / (1 - PILE_SLOT_DECAY);
}

function pileShadow(depth: number): number {
  return clamp(0.58 - (depth - 1) * 0.13, 0.24, 0.58);
}

/**
 * Relative cast-shadow elevation while two cards pass. Both cards meet the depth crossover with no
 * cast shadow, so changing their discrete paint order cannot move one shadow across the other card.
 * The smooth symmetric envelope has zero slope at the crossover and depends on progress alone.
 */
function crossoverElevation(progress: number): number {
  return smoothstep(Math.abs(progress * 2 - 1));
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

/** One semantic neighbour in the consumer's canonical Stacked Deck ring. */
export function resolveStackedDeckNeighbor(
  index: number,
  direction: -1 | 1,
  itemCount: number,
): number {
  assertItemCount(itemCount);
  if (itemCount === 0) return -1;
  assertIndex(index, itemCount, "index");
  if (itemCount === 1) return index;
  return (index + direction + itemCount) % itemCount;
}

/** Forward physical depth of `itemIndex` behind `topIndex`. */
export function resolveStackedDeckDepth(
  topIndex: number,
  itemIndex: number,
  itemCount: number,
): number {
  assertItemCount(itemCount);
  if (itemCount === 0) return -1;
  assertIndex(topIndex, itemCount, "topIndex");
  assertIndex(itemIndex, itemCount, "itemIndex");
  return (itemIndex - topIndex + itemCount) % itemCount;
}

/** Canonical physical pile order, rotated so `topIndex` is first. */
export function resolveStackedDeckOrder(topIndex: number, itemCount: number): readonly number[] {
  assertItemCount(itemCount);
  if (itemCount === 0) return [];
  assertIndex(topIndex, itemCount, "topIndex");
  return Array.from({ length: itemCount }, (_unused, depth) => (topIndex + depth) % itemCount);
}

/**
 * Signed compact visual slot for a forward depth. The far half folds onto the opposite side of the
 * pile while `depth` continues to own physical ordering.
 */
function signedRingSlot(depth: number, itemCount: number): number {
  if (depth === 0) return 0;
  return depth <= Math.floor(itemCount / 2) ? depth : depth - itemCount;
}

function profileForWidth(stageWidth: number): StackedDeckProfile {
  if (stageWidth >= 960) return "wide";
  if (stageWidth >= 600) return "medium";
  return "compact";
}

/** Pure responsive tuning for the direct-manipulation deck projection. */
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
 * Projects every non-dominant persistent card through the legacy pile surface. Geometry is copied
 * from the authoritative frame, so this compatibility view cannot invent a second path, shadow, or
 * material owner. The high-level Vue component nests pile-slot material inside the matching card
 * shell instead of rendering these poses as sibling physical cards.
 */
export function resolveStackedDeckPile(
  options: ResolveStackedDeckPileOptions,
): readonly StackedDeckPilePose[] {
  const { frame } = options;
  const dominantIndex =
    frame.phase === "traversing" &&
    frame.segmentTargetIndex !== null &&
    frame.localProgress >= AUTHORITY_MIDPOINT
      ? frame.segmentTargetIndex
      : frame.visualTopIndex;
  const poses: StackedDeckPilePose[] = [];
  for (let index = 0; index < frame.poses.length; index += 1) {
    if (index === dominantIndex) continue;
    const pose = frame.poses[index]!;
    const depth = resolveStackedDeckDepth(dominantIndex, index, frame.poses.length);
    const slot = signedRingSlot(depth, frame.poses.length);
    poses.push({
      itemIndex: index,
      depth,
      slot,
      translateX: pose.translateX,
      translateY: pose.translateY,
      scale: pose.scale,
      rotate: pose.rotate,
      opacity: pose.opacity,
      layer: pose.layer,
      shadowStrength: pose.shadowStrength,
    });
  }
  return poses;
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
  // Fresh storage settled on one card is what `resetTraversal` already means, so it is the one
  // definition of an idle traversal rather than a second copy of the same nine fields.
  return resetTraversal({} as MutableStackedDeckTraversal, initialIndex);
}

function resetTraversal(
  output: MutableStackedDeckTraversal,
  settledIndex: number,
): MutableStackedDeckTraversal {
  output.settledIndex = settledIndex;
  output.visualTopIndex = settledIndex;
  output.authoritativeIndex = settledIndex;
  output.segmentOriginIndex = settledIndex;
  output.segmentTargetIndex = null;
  output.direction = 0;
  output.signedLocalDistance = 0;
  output.localProgress = 0;
  output.phase = "idle";
  return output;
}

/**
 * Which card a new interaction, or a control that names "the current card", must act on.
 *
 * Ownership of the surface still changes at the anchor, which is a whole pitch of travel later. This
 * is deliberately not that: it is the card the eye reads as current, resolved as soon as the segment
 * passes its midpoint and latched across the dead band so a crossing renames the deck exactly once.
 */
function resolveAuthority(
  previousAuthority: number,
  visualTopIndex: number,
  segmentTargetIndex: number | null,
  localProgress: number,
): number {
  if (segmentTargetIndex === null) return visualTopIndex;
  const held = previousAuthority === segmentTargetIndex ? -1 : 1;
  return localProgress >= AUTHORITY_MIDPOINT + held * AUTHORITY_HYSTERESIS
    ? segmentTargetIndex
    : visualTopIndex;
}

/**
 * Consumes one interaction-local physical coordinate without changing controller state. The
 * semantic origin is fixed for the transaction; crossing one pitch promotes exactly one cyclic
 * neighbour and all remaining travel is elastic overdrag, never a second exchange.
 */
export function resolveStackedDeckTraversal(
  options: ResolveStackedDeckTraversalOptions,
  output: MutableStackedDeckTraversal,
): StackedDeckTraversal {
  assertItemCount(options.itemCount);
  assertFiniteNumber(options.physicalPosition, "physicalPosition");
  if (options.itemCount === 0) return resetTraversal(output, -1);
  assertIndex(options.settledIndex, options.itemCount, "settledIndex");
  assertIndex(options.originIndex, options.itemCount, "originIndex");
  if (options.controllerPhase === "idle") {
    return resetTraversal(output, options.settledIndex);
  }

  const rawDirection = Math.sign(options.physicalPosition) as -1 | 0 | 1;
  const targetIndex =
    rawDirection === 0 || options.itemCount < 2
      ? null
      : resolveStackedDeckNeighbor(options.originIndex, rawDirection, options.itemCount);
  const crossed =
    targetIndex !== null && Math.abs(options.physicalPosition) >= 1 - TRAVERSAL_EPSILON;
  const visualTopIndex = crossed ? targetIndex : options.originIndex;
  const rawLocalDistance = crossed
    ? options.physicalPosition - rawDirection
    : options.physicalPosition;
  const signedLocalDistance =
    Math.abs(rawLocalDistance) <= TRAVERSAL_EPSILON ? 0 : rawLocalDistance;
  const direction = Math.sign(signedLocalDistance) as -1 | 0 | 1;
  const segmentTargetIndex = crossed || direction === 0 ? null : targetIndex;
  const localProgress = clamp(Math.abs(signedLocalDistance), 0, 1);

  output.settledIndex = options.settledIndex;
  output.visualTopIndex = visualTopIndex;
  output.authoritativeIndex = crossed
    ? visualTopIndex
    : resolveAuthority(
        output.authoritativeIndex,
        visualTopIndex,
        segmentTargetIndex,
        localProgress,
      );
  output.segmentOriginIndex = visualTopIndex;
  output.segmentTargetIndex = segmentTargetIndex;
  output.direction = direction;
  output.signedLocalDistance = signedLocalDistance;
  output.localProgress = localProgress;
  output.phase =
    direction === 0 ? "neutral" : segmentTargetIndex === null ? "elastic" : "traversing";
  return output;
}

/**
 * True once an active exchange has crossed its physical depth boundary and the incoming card owns
 * semantic authority too. Before that boundary the transaction remains contested for inspection,
 * even though the outgoing card is still on top. Physical shells remain continuous on both sides.
 */
export function isStackedDeckAuthorityStable(traversal: StackedDeckTraversal): boolean {
  if (traversal.phase !== "traversing") return traversal.phase !== "elastic";
  return traversal.authoritativeIndex === traversal.segmentTargetIndex;
}

function validateTuning(tuning: StackedDeckTuning): void {
  if (tuning.profile !== "compact" && tuning.profile !== "medium" && tuning.profile !== "wide") {
    throw new RangeError("deck profile");
  }
  for (const key of TUNING_NUMBER_KEYS) assertFiniteNumber(tuning[key], key);
  if (tuning.cardWidth <= 0 || tuning.cardHeight <= 0 || tuning.motionPitch <= 0) {
    throw new RangeError("deck dimensions");
  }
  if (tuning.pileScaleStep < 0 || tuning.topScaleReduction < 0) {
    throw new RangeError("deck tuning");
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
    throw new RangeError("invalid segment origin");
  }
  // Authority is bound to two already-validated indices, which is also the whole invariant: the
  // current card is either the one that still owns the surface or the one taking it.
  if (
    traversal.authoritativeIndex !== traversal.visualTopIndex &&
    traversal.authoritativeIndex !== traversal.segmentTargetIndex
  ) {
    throw new RangeError("invalid deck authority");
  }
  if (traversal.localProgress < 0 || traversal.localProgress > 1) {
    throw new RangeError("local progress");
  }
  if (traversal.phase === "idle" || traversal.phase === "neutral") {
    if (
      traversal.direction !== 0 ||
      traversal.segmentTargetIndex !== null ||
      traversal.signedLocalDistance !== 0 ||
      traversal.localProgress !== 0
    ) {
      throw new RangeError("invalid neutral traversal");
    }
    if (traversal.phase === "idle" && traversal.visualTopIndex !== traversal.settledIndex) {
      throw new RangeError("invalid idle top");
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
      resolveStackedDeckNeighbor(traversal.segmentOriginIndex, traversal.direction, itemCount) !==
        traversal.segmentTargetIndex
    ) {
      throw new RangeError("nonadjacent deck segment");
    }
  } else if (traversal.segmentTargetIndex !== null) {
    throw new RangeError("invalid elastic target");
  }
}

/**
 * The neutral pose: hidden, at exact rest geometry. It is the single definition of "not rendered",
 * so both frame storage and every per-frame reset start from the same numbers.
 */
function resetPose(pose: MutableStackedDeckPose): MutableStackedDeckPose {
  // Every channel a card can be measured in is zero here; scale is the one that reads as identity
  // at one rather than at nothing.
  pose.translateX =
    pose.translateY =
    pose.rotate =
    pose.opacity =
    pose.layer =
    pose.shadowStrength =
      0;
  pose.scale = 1;
  pose.role = "hidden";
  pose.visible = pose.interactive = false;
  return pose;
}

/** Creates reusable storage for {@link resolveStackedDeckFrame}. */
export function createStackedDeckFrame(itemCount: number): MutableStackedDeckFrame {
  assertItemCount(itemCount);
  const initialIndex = itemCount === 0 ? -1 : 0;
  return {
    ...createStackedDeckTraversal(initialIndex, itemCount),
    poses: Array.from({ length: itemCount }, () => resetPose({} as MutableStackedDeckPose)),
  };
}

/**
 * Reveals a pose the frame has just reset. Rest translation, rotation, and scale are the neutral
 * values already written, so a top card only has to state what makes it the top card.
 */
function setTopPose(pose: MutableStackedDeckPose, interactive: boolean): void {
  pose.opacity = pose.shadowStrength = 1;
  pose.layer = TOP_LAYER;
  pose.role = "top";
  pose.visible = true;
  pose.interactive = interactive;
}

/**
 * Places one persistent card in the compact pile at a possibly fractional slot. Identity, material,
 * transform, shadow, and depth all stay on this pose for its entire lifetime.
 *
 * Like {@link setTopPose} it completes a pose the frame has just reset, so what a hidden card is
 * already — not the deck's top, and not something input can reach — is stated once, by the reset.
 */
function setPilePose(
  pose: MutableStackedDeckPose,
  slot: number,
  tuning: StackedDeckTuning,
  depth = Math.abs(slot),
): void {
  const distance = Math.abs(slot);
  if (distance <= TRAVERSAL_EPSILON) {
    setTopPose(pose, false);
    return;
  }
  const side = slot < 0 ? -1 : 1;
  const spread = pileSlotSpread(distance);
  const rotationSpread = Math.sqrt(spread);
  pose.translateX = side * tuning.pileOffsetX * spread;
  pose.translateY = tuning.pileOffsetY * spread;
  pose.scale = 1 - tuning.pileScaleStep * spread;
  // Angular separation grows more slowly than positional depth. The first exposed corner stays
  // legible, but successive shells converge instead of accumulating fan-like rotation.
  pose.rotate = side * tuning.pileRotate * rotationSpread;
  pose.opacity = 1;
  pose.layer = Math.round(TARGET_LAYER - depth * PILE_LAYER_STEP);
  pose.shadowStrength = pileShadow(depth);
  pose.visible = true;
}

/** Exact resting pose for one persistent shell in the ring rotated to `topIndex`. */
function setRingPose(
  pose: MutableStackedDeckPose,
  topIndex: number,
  itemIndex: number,
  itemCount: number,
  tuning: StackedDeckTuning,
): void {
  const depth = resolveStackedDeckDepth(topIndex, itemIndex, itemCount);
  setPilePose(pose, signedRingSlot(depth, itemCount), tuning, depth);
}

function setFrameRing(
  output: MutableStackedDeckFrame,
  topIndex: number,
  tuning: StackedDeckTuning,
): void {
  for (let index = 0; index < output.poses.length; index += 1) {
    setRingPose(resetPose(output.poses[index]!), topIndex, index, output.poses.length, tuning);
  }
}

const projectionDestinationPose = resetPose({} as MutableStackedDeckPose);
const shufflePairPose = resetPose({} as MutableStackedDeckPose);
const occludedPilePose = resetPose({} as MutableStackedDeckPose);

function movePoseGeometry(
  pose: MutableStackedDeckPose,
  destination: StackedDeckPose,
  progress: number,
): void {
  pose.translateX = mix(pose.translateX, destination.translateX, progress);
  pose.translateY = mix(pose.translateY, destination.translateY, progress);
  pose.scale = mix(pose.scale, destination.scale, progress);
  pose.rotate = mix(pose.rotate, destination.rotate, progress);
  pose.shadowStrength = mix(pose.shadowStrength, destination.shadowStrength, progress);
}

/** A persistent opaque shell fully contained by the physical card above it. */
function setOccludedPilePose(pose: MutableStackedDeckPose, cover: StackedDeckPose): void {
  pose.translateX = cover.translateX;
  pose.translateY = cover.translateY;
  pose.scale = cover.scale * PILE_OCCLUDED_SCALE;
  pose.rotate = cover.rotate;
  pose.shadowStrength = 0;
}

/**
 * Reorganizes one non-participating shell without independently interpolating two folded layouts.
 * Every subordinate shell recedes beneath `cover`; any side or depth relationship changes only
 * while that shell is physically contained.
 */
function movePileShell(
  pose: MutableStackedDeckPose,
  destination: StackedDeckPose,
  cover: StackedDeckPose,
  progress: number,
): void {
  const sourceLayer = pose.layer;
  setOccludedPilePose(occludedPilePose, cover);
  movePoseGeometry(
    pose,
    occludedPilePose,
    smoothstep(Math.min(1, progress / PILE_OCCLUSION_ENTER)),
  );
  movePoseGeometry(
    pose,
    destination,
    smoothstep(Math.max(0, (progress - PILE_OCCLUSION_EXIT) / (1 - PILE_OCCLUSION_EXIT))),
  );
  // All subordinate depths rotate by the same one-step delta. Switching their absolute layer band
  // together preserves every relative order, and every subordinate shell is contained here.
  pose.layer = progress < AUTHORITY_MIDPOINT ? sourceLayer : destination.layer;
}

/**
 * The accepted Shuffle detour clears the exchanging pair. Its midpoint is extended only as far as
 * necessary to clear the complete pile, so the old top can take rear depth without crossing any
 * exposed background material.
 */
function clearShuffleFromPile(
  moving: MutableStackedDeckPose,
  itemCount: number,
  progress: number,
  tuning: StackedDeckTuning,
): void {
  const envelope = 1 - smoothstep(Math.abs(progress - AUTHORITY_MIDPOINT) / 0.12);
  if (envelope <= 0) return;
  const clearTranslateX = Math.min(moving.translateX, -wholePileClearSeparation(itemCount, tuning));
  moving.translateX = mix(moving.translateX, clearTranslateX, envelope);
}

/**
 * Resolves the canonical forward top-to-rear Shuffle exchange. Backward traversal evaluates this
 * same function from the opposite endpoint with reversed progress, making the physical operations
 * exact inverses without a second choreography.
 */
function setShuffleFrame(
  output: MutableStackedDeckFrame,
  traversal: StackedDeckTraversal,
  tuning: StackedDeckTuning,
): void {
  const originIndex = traversal.segmentOriginIndex;
  const targetIndex = traversal.segmentTargetIndex!;
  const forward = traversal.direction === 1;
  const forwardOriginIndex = forward ? originIndex : targetIndex;
  const forwardTargetIndex = resolveStackedDeckNeighbor(forwardOriginIndex, 1, output.poses.length);
  const progress = forward ? traversal.localProgress : 1 - traversal.localProgress;
  const promotion = smoothstep(progress);
  const middle = Math.sin(Math.PI * progress);
  const initialPileDerivative =
    tuning.pileOffsetX * (-Math.log(PILE_SLOT_DECAY) / (1 - PILE_SLOT_DECAY));
  const directRatio = (tuning.motionPitch - initialPileDerivative) / tuning.cardWidth;
  const detour = exchangeDetour(progress, directRatio);
  const targetDominant =
    progress > AUTHORITY_MIDPOINT || (forward && progress === AUTHORITY_MIDPOINT);
  const exchangeElevation = crossoverElevation(progress);
  const movingDestinationLayer =
    TARGET_LAYER -
    resolveStackedDeckDepth(forwardTargetIndex, forwardOriginIndex, output.poses.length) *
      PILE_LAYER_STEP;

  const moving = output.poses[forwardOriginIndex]!;
  const incoming = output.poses[forwardTargetIndex]!;
  // The two exchange bodies retain the accepted pile-slot path. In particular, the exposed card's
  // first derivative plus the calibrated detour is one motion pitch per physical pitch; the other
  // shells interpolate between the two exact canonical ring rests behind them.
  setPilePose(resetPose(shufflePairPose), -progress, tuning);
  movePoseGeometry(moving, shufflePairPose, 1);
  setPilePose(resetPose(shufflePairPose), 1 - progress, tuning);
  movePoseGeometry(incoming, shufflePairPose, 1);
  moving.translateX -= tuning.cardWidth * detour;
  moving.translateY += tuning.topDropY * middle;
  moving.scale -= tuning.topScaleReduction * middle;
  moving.rotate -= tuning.topRotate * middle;
  clearShuffleFromPile(moving, output.poses.length, progress, tuning);
  moving.layer = targetDominant ? movingDestinationLayer : TOP_LAYER;
  moving.shadowStrength =
    mix(1, pileShadow(output.poses.length - 1), promotion) * exchangeElevation;

  incoming.layer = targetDominant ? TOP_LAYER : TARGET_LAYER;
  incoming.shadowStrength = mix(pileShadow(1), 1, promotion) * exchangeElevation;

  for (let index = 0; index < output.poses.length; index += 1) {
    if (index === forwardOriginIndex || index === forwardTargetIndex) continue;
    const pose = output.poses[index]!;
    setRingPose(resetPose(pose), forwardOriginIndex, index, output.poses.length, tuning);
    setRingPose(
      resetPose(projectionDestinationPose),
      forwardTargetIndex,
      index,
      output.poses.length,
      tuning,
    );
    movePileShell(pose, projectionDestinationPose, incoming, progress);
  }

  // A completed transaction is the canonical destination ring, even where two items name the
  // same neighbour in both explicit directions. Direction owns the route; it cannot make endpoint
  // geometry depend on which side the hand used to reach that neighbour.
  if (traversal.localProgress >= 1 - TRAVERSAL_EPSILON) {
    setFrameRing(output, targetIndex, tuning);
  }

  // Roles describe this interaction's semantic source and target even when backward traversal is
  // evaluating the canonical forward path in reverse.
  output.poses[originIndex]!.role = "top";
  output.poses[targetIndex]!.role = "target";
}

const directOutgoingDestinationPose = resetPose({} as MutableStackedDeckPose);
const directTopPose = resetPose({} as MutableStackedDeckPose);
const directCompactPose = resetPose({} as MutableStackedDeckPose);

/** Conservative centre separation that clears the complete compact pile, not only its top body. */
function wholePileClearSeparation(itemCount: number, tuning: StackedDeckTuning): number {
  const maximumSlot = Math.max(1, Math.floor(itemCount / 2));
  return tuning.cardWidth + tuning.pileOffsetX * pileSlotSpread(maximumSlot) + CROSSOVER_CLEARANCE;
}

function directClearanceEnvelope(progress: number): number {
  return 4 * progress * (1 - progress);
}

/**
 * A backward Direct target begins at the rear of the ring. It first recedes beneath the nearly
 * stationary hand-owned source, changes paint order while that source contains its complete body,
 * then expands into the newly vacated top position. This keeps the target reveal subordinate to the
 * source's direct translation; it does not borrow Shuffle's top-card detour.
 */
function moveDirectTarget(
  target: MutableStackedDeckPose,
  sourceSlot: number,
  progress: number,
  continuityPose?: StackedDeckPose,
  continuityProgress = 0,
): void {
  setTopPose(resetPose(directTopPose), false);
  let role: StackedDeckRole = progress < 1 - TRAVERSAL_EPSILON ? "target" : "top";
  if (
    continuityPose !== undefined &&
    continuityProgress > TRAVERSAL_EPSILON &&
    progress <= continuityProgress
  ) {
    const sourceLayer = target.layer;
    movePoseGeometry(target, continuityPose, Math.min(1, progress / continuityProgress));
    target.layer = progress < continuityProgress ? sourceLayer : continuityPose.layer;
    role = progress < continuityProgress ? "hidden" : continuityPose.role;
  } else if (continuityPose !== undefined && continuityProgress > TRAVERSAL_EPSILON) {
    movePoseGeometry(target, continuityPose, 1);
    const resumedProgress = (progress - continuityProgress) / (1 - continuityProgress);
    movePoseGeometry(target, directTopPose, smoothstep(resumedProgress));
    target.layer = resumedProgress <= TRAVERSAL_EPSILON ? continuityPose.layer : TOP_LAYER;
  } else if (sourceSlot > 0) {
    // The forward neighbour already owns the highest subordinate depth. Raising its numeric layer
    // changes no relative paint order, so it can retain the compact Direct reveal without a detour.
    movePoseGeometry(target, directTopPose, progress);
    target.layer = TOP_LAYER;
  } else {
    const sourceLayer = target.layer;
    setOccludedPilePose(occludedPilePose, directTopPose);
    movePoseGeometry(
      target,
      occludedPilePose,
      smoothstep(Math.min(1, progress / DIRECT_TARGET_CONTAINED)),
    );
    const returned =
      (progress - DIRECT_TARGET_CONTAINED) / (DIRECT_TARGET_RETURNED - DIRECT_TARGET_CONTAINED);
    movePoseGeometry(target, directTopPose, smoothstep(clamp(returned, 0, 1)));
    target.layer = progress <= DIRECT_TARGET_CONTAINED ? sourceLayer : TOP_LAYER;
  }
  target.role = role;
}

function moveDirectBackground(
  pose: MutableStackedDeckPose,
  destination: StackedDeckPose,
  cover: StackedDeckPose,
  remainOccluded: boolean,
  initialProgress: number,
  continuityProgress: number,
  continuityPose?: StackedDeckPose,
): void {
  let progress = initialProgress;
  if (continuityPose !== undefined && continuityProgress > TRAVERSAL_EPSILON) {
    if (progress > continuityProgress) {
      movePoseGeometry(pose, continuityPose, 1);
      pose.layer = continuityPose.layer;
      progress = (progress - continuityProgress) / (1 - continuityProgress);
    } else {
      const sourceLayer = pose.layer;
      movePoseGeometry(pose, continuityPose, Math.min(1, progress / continuityProgress));
      pose.layer = progress < continuityProgress ? sourceLayer : continuityPose.layer;
      return;
    }
  }
  if (remainOccluded) {
    const sourceLayer = pose.layer;
    setOccludedPilePose(occludedPilePose, cover);
    movePoseGeometry(
      pose,
      occludedPilePose,
      smoothstep(Math.min(1, progress / PILE_OCCLUSION_ENTER)),
    );
    pose.layer = progress < AUTHORITY_MIDPOINT ? sourceLayer : destination.layer;
  } else {
    movePileShell(pose, destination, cover, progress);
  }
}

/**
 * Projects Direct from one stable interaction origin. The target and remaining pile depend only on
 * scalar traversal; the hand-owned shell alone may read the raw two-axis translation.
 *
 */
function setDirectFrame(
  output: MutableStackedDeckFrame,
  projection: StackedDeckDirectProjection,
  tuning: StackedDeckTuning,
): void {
  const targetIndex =
    projection.direction === 0 || projection.targetIndex === projection.originIndex
      ? null
      : projection.targetIndex;
  const distance = clamp(Math.abs(projection.signedTravel), 0, 1);
  const reveal = smoothstep(distance);
  const outgoing = output.poses[projection.originIndex]!;
  const phase = projection.phase;
  // A direction-authoritative command publishes before its spring has moved. That frame is the
  // exact source rest: declaring the hidden neighbour top before any geometry changes would be a
  // one-frame material handoff with no physical exchange to justify it.
  if (phase === undefined && distance <= TRAVERSAL_EPSILON) return;
  // Bounded, and bounded away from anything a transform cannot express. One invalid number in a
  // transform does not degrade gracefully — the whole declaration is dropped, the shell keeps
  // whatever it last painted, and the deck reads as frozen rather than as broken — so a settlement
  // that is not a number is the release frame rather than a shell nothing can move again.
  const settlement = clamp(projection.settlement, 0, 1) || 0;
  if (targetIndex !== null) {
    const continuity = projection.continuity;
    setRingPose(
      resetPose(directOutgoingDestinationPose),
      targetIndex,
      projection.originIndex,
      output.poses.length,
      tuning,
    );
    if (phase === undefined || phase === "parking") {
      const progress = phase === "parking" ? settlement : reveal;
      if (phase === "parking") {
        outgoing.translateX = projection.translateX;
        outgoing.translateY = projection.translateY;
      }
      movePoseGeometry(outgoing, directOutgoingDestinationPose, progress);
      const clearance = Math.max(
        0,
        wholePileClearSeparation(output.poses.length, tuning) - Math.abs(outgoing.translateX),
      );
      outgoing.translateX +=
        (phase === undefined
          ? -projection.direction
          : Math.sign(
              projection.translateX ||
                directOutgoingDestinationPose.translateX ||
                -projection.direction,
            )) *
        clearance *
        directClearanceEnvelope(progress);
      outgoing.layer =
        progress < CROSSOVER_SETTLEMENT ? HAND_LAYER : directOutgoingDestinationPose.layer;
      outgoing.role = progress < 1 - TRAVERSAL_EPSILON ? "top" : "hidden";
    } else {
      // Held and given back are the same expression: no released shell can take rear depth.
      const retained = 1 - settlement;
      outgoing.translateX = projection.translateX * retained;
      outgoing.translateY = projection.translateY * retained;
      outgoing.layer = HAND_LAYER;
      outgoing.role = "top";
    }

    const target = output.poses[targetIndex]!;
    const targetSourceDepth = resolveStackedDeckDepth(
      projection.originIndex,
      targetIndex,
      output.poses.length,
    );
    const targetSourceSlot = signedRingSlot(targetSourceDepth, output.poses.length);
    moveDirectTarget(
      target,
      targetSourceSlot,
      reveal,
      continuity?.poses[targetIndex],
      continuity?.progress,
    );
    target.interactive =
      (phase === undefined || phase === "parking") && output.authoritativeIndex === targetIndex;

    const outgoingDestinationDepth = resolveStackedDeckDepth(
      targetIndex,
      projection.originIndex,
      output.poses.length,
    );

    for (let index = 0; index < output.poses.length; index += 1) {
      if (index === projection.originIndex || index === targetIndex) continue;
      const pose = output.poses[index]!;
      const destinationDepth = resolveStackedDeckDepth(targetIndex, index, output.poses.length);
      setRingPose(
        resetPose(projectionDestinationPose),
        targetIndex,
        index,
        output.poses.length,
        tuning,
      );
      if (phase === undefined) {
        movePileShell(pose, projectionDestinationPose, target, reveal);
        continue;
      }

      const compactDepth =
        destinationDepth > outgoingDestinationDepth ? destinationDepth - 1 : destinationDepth;
      const compactSlot = signedRingSlot(compactDepth, output.poses.length - 1);
      const destinationSlot = signedRingSlot(destinationDepth, output.poses.length);
      setPilePose(resetPose(directCompactPose), compactSlot, tuning, compactDepth);
      moveDirectBackground(
        pose,
        directCompactPose,
        target,
        Math.sign(compactSlot) !== Math.sign(destinationSlot),
        reveal,
        continuity?.progress ?? 0,
        continuity?.poses[index],
      );
      if (phase === "parking") {
        movePileShell(pose, projectionDestinationPose, target, settlement);
      }
    }
    if (
      (phase === undefined && distance >= 1 - TRAVERSAL_EPSILON) ||
      (phase === "parking" && settlement >= 1 - TRAVERSAL_EPSILON)
    ) {
      setFrameRing(output, targetIndex, tuning);
      output.poses[targetIndex]!.interactive = output.authoritativeIndex === targetIndex;
    }
    return;
  }
  // No directed target: only the hand-owned source may move, and it cannot change depth.
  const retained = 1 - settlement;
  outgoing.translateX = projection.translateX * retained;
  outgoing.translateY = projection.translateY * retained;
  outgoing.layer = HAND_LAYER;
  outgoing.role = "top";
}

/**
 * Resolves every persistent physical card in one deck frame. The frame is the sole owner of card
 * geometry; {@link resolveStackedDeckPile} is only a compatibility projection of these poses.
 */
export function resolveStackedDeckFrame(
  options: ResolveStackedDeckFrameOptions,
  output: MutableStackedDeckFrame,
): StackedDeckFrame {
  assertItemCount(options.itemCount);
  validateTuning(options.tuning);
  validateTraversal(options.traversal, options.itemCount);
  if (output.poses.length !== options.itemCount) {
    throw new RangeError("frame");
  }
  // A frame is exactly a traversal plus the poses it resolves, which is what the interface says,
  // so the traversal half of it is copied as the whole readonly record rather than field by field.
  Object.assign(output, options.traversal);
  if (options.itemCount === 0) return output;

  const traversal = options.traversal;
  const direct = options.direct;
  if (direct !== undefined) {
    assertIndex(direct.originIndex, options.itemCount, "direct.originIndex");
    if (direct.direction !== -1 && direct.direction !== 0 && direct.direction !== 1) {
      throw new RangeError("direct.direction");
    }
    if (direct.targetIndex !== null) {
      assertIndex(direct.targetIndex, options.itemCount, "direct.targetIndex");
    }
    const expectedDirectTarget =
      direct.direction === 0 || options.itemCount < 2
        ? null
        : resolveStackedDeckNeighbor(direct.originIndex, direct.direction, options.itemCount);
    if (direct.targetIndex !== expectedDirectTarget) {
      throw new RangeError("direct.targetIndex is not the directed cyclic neighbour");
    }
    assertFiniteNumber(direct.signedTravel, "direct.signedTravel");
  }
  const sourceTopIndex =
    direct?.originIndex ??
    (traversal.phase === "traversing" ? traversal.segmentOriginIndex : traversal.visualTopIndex);
  for (let index = 0; index < output.poses.length; index += 1) {
    setRingPose(
      resetPose(output.poses[index]!),
      sourceTopIndex,
      index,
      output.poses.length,
      options.tuning,
    );
  }
  if (options.itemCount === 1) {
    output.poses[0]!.interactive = direct === undefined && traversal.phase === "idle";
    return output;
  }
  if (direct !== undefined) {
    setDirectFrame(output, direct, options.tuning);
    return output;
  }
  const top = output.poses[traversal.visualTopIndex]!;
  // The pile pass already posed the deck's centre slot as the top card. The one thing it cannot
  // know is whether the deck is holding still enough to be operated.
  if (traversal.phase === "idle") top.interactive = true;

  if (traversal.phase === "elastic") {
    top.translateX = -traversal.signedLocalDistance * options.tuning.motionPitch;
  } else if (traversal.phase === "traversing" && traversal.segmentTargetIndex !== null) {
    setShuffleFrame(output, traversal, options.tuning);
  }
  return output;
}
