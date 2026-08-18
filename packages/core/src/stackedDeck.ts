import { assertFiniteNumber, assertNonNegative, clamp, mix, smoothstep } from "./bounds";
import type { ControllerPhase } from "./types";

export type StackedDeckProfile = "compact" | "medium" | "wide";
export type StackedDeckRole = "top" | "target" | "hidden";
export type StackedDeckTraversalPhase = "idle" | "neutral" | "traversing" | "elastic";

/**
 * Presentation state for the one-anchor segment containing the controller's continuous position.
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
  /**
   * Continuous slot distance from the card at the centre of the deck, signed by which side of it
   * the screen sits on: negative before, positive after. It is `index - centre` and nothing else,
   * so a reversal retraces the same slots rather than mirroring the deck.
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
 * boundary slopes into exact crossover clearance, then gives the longer return route the remaining
 * half of the gesture so it joins the pile deliberately rather than rushing through one shoulder.
 */
function exchangeDetour(progress: number, directRatio: number): number {
  const directEnvelope = progress * (1 - progress ** 4) ** 2;
  const middleWeight =
    progress <= 0.5 ? smoothstep((progress - 0.2) / 0.3) : smoothstep((1 - progress) / 0.5);
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
  const centre = frame.visualTopIndex + frame.signedLocalDistance;
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
    const slot = index - centre;
    poses.push({
      itemIndex: index,
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
  return {
    settledIndex: initialIndex,
    visualTopIndex: initialIndex,
    authoritativeIndex: initialIndex,
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

  const localProgress = clamp(Math.abs(signedLocalDistance), 0, 1);

  output.settledIndex = options.settledIndex;
  output.visualTopIndex = visualTopIndex;
  output.authoritativeIndex = resolveAuthority(
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
    throw new RangeError("invalid deck profile");
  }
  for (const key of TUNING_NUMBER_KEYS) assertFiniteNumber(tuning[key], key);
  if (tuning.cardWidth <= 0 || tuning.cardHeight <= 0 || tuning.motionPitch <= 0) {
    throw new RangeError("invalid deck dimensions");
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
  // Authority is bound to two already-validated indices, which is also the whole invariant: the
  // current card is either the one that still owns the surface or the one taking it.
  if (
    traversal.authoritativeIndex !== traversal.visualTopIndex &&
    traversal.authoritativeIndex !== traversal.segmentTargetIndex
  ) {
    throw new RangeError("authority must name a card of the active segment");
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

/**
 * The neutral pose: hidden, at exact rest geometry. It is the single definition of "not rendered",
 * so both frame storage and every per-frame reset start from the same numbers.
 */
function resetPose(pose: MutableStackedDeckPose): MutableStackedDeckPose {
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
  pose.opacity = 1;
  pose.layer = TOP_LAYER;
  pose.role = "top";
  pose.shadowStrength = 1;
  pose.visible = true;
  pose.interactive = interactive;
}

/**
 * Places one persistent card in the compact pile at a possibly fractional slot. Identity, material,
 * transform, shadow, and depth all stay on this pose for its entire lifetime.
 */
function setPilePose(pose: MutableStackedDeckPose, slot: number, tuning: StackedDeckTuning): void {
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
  pose.layer = Math.round(TARGET_LAYER - distance * PILE_LAYER_STEP);
  pose.role = "hidden";
  pose.shadowStrength = pileShadow(distance);
  pose.visible = true;
  pose.interactive = false;
}

/**
 * Exchanges two persistent cards. The target follows its fractional pile slot to the top. The
 * outgoing card follows the same pile endpoint through a lateral shuffle that clears the target at
 * the midpoint; only there does depth order change. Every term depends on progress alone, so a
 * reversal evaluates the identical poses in reverse and the exact anchor equals resting geometry.
 */
function setExchangePair(
  outgoing: MutableStackedDeckPose,
  target: MutableStackedDeckPose,
  traversal: StackedDeckTraversal,
  tuning: StackedDeckTuning,
): void {
  const progress = traversal.localProgress;
  const promotion = smoothstep(progress);
  const direction = traversal.direction as -1 | 1;
  const middle = Math.sin(Math.PI * progress);
  const initialPileDerivative =
    tuning.pileOffsetX * (-Math.log(PILE_SLOT_DECAY) / (1 - PILE_SLOT_DECAY));
  const directRatio = (tuning.motionPitch - initialPileDerivative) / tuning.cardWidth;
  const detour = exchangeDetour(progress, directRatio);
  const targetDominant = progress >= AUTHORITY_MIDPOINT;
  const exchangeElevation = crossoverElevation(progress);

  outgoing.translateX -= direction * tuning.cardWidth * detour;
  outgoing.translateY += tuning.topDropY * middle;
  outgoing.scale -= tuning.topScaleReduction * middle;
  outgoing.rotate -= direction * tuning.topRotate * middle;
  outgoing.opacity = 1;
  outgoing.layer = targetDominant ? TARGET_LAYER - 1 : TOP_LAYER;
  outgoing.role = "top";
  outgoing.shadowStrength = mix(1, pileShadow(1), promotion) * exchangeElevation;
  outgoing.visible = true;
  outgoing.interactive = false;

  target.opacity = 1;
  target.layer = targetDominant ? TOP_LAYER : TARGET_LAYER;
  target.role = "target";
  target.shadowStrength = mix(pileShadow(1), 1, promotion) * exchangeElevation;
  target.visible = true;
  target.interactive = false;
}

function copyTraversal(output: MutableStackedDeckFrame, traversal: StackedDeckTraversal): void {
  output.settledIndex = traversal.settledIndex;
  output.visualTopIndex = traversal.visualTopIndex;
  output.authoritativeIndex = traversal.authoritativeIndex;
  output.segmentOriginIndex = traversal.segmentOriginIndex;
  output.segmentTargetIndex = traversal.segmentTargetIndex;
  output.direction = traversal.direction;
  output.signedLocalDistance = traversal.signedLocalDistance;
  output.localProgress = traversal.localProgress;
  output.phase = traversal.phase;
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
    throw new RangeError("invalid deck output size");
  }

  copyTraversal(output, options.traversal);
  for (const pose of output.poses) resetPose(pose);
  if (options.itemCount === 0) return output;

  const traversal = options.traversal;
  const centre =
    traversal.phase === "traversing"
      ? traversal.visualTopIndex + traversal.signedLocalDistance
      : traversal.visualTopIndex;
  for (let index = 0; index < output.poses.length; index += 1) {
    setPilePose(output.poses[index]!, index - centre, options.tuning);
  }
  const top = output.poses[traversal.visualTopIndex]!;
  if (traversal.phase !== "traversing") setTopPose(top, traversal.phase === "idle");

  if (traversal.phase === "elastic") {
    top.translateX = -traversal.signedLocalDistance * options.tuning.motionPitch;
    return output;
  }
  if (traversal.phase === "traversing" && traversal.segmentTargetIndex !== null) {
    setExchangePair(top, output.poses[traversal.segmentTargetIndex]!, traversal, options.tuning);
  }
  return output;
}
