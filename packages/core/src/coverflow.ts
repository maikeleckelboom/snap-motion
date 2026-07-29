import { assertFiniteNumber, assertNonNegative, clampToBounds, getTrackBounds } from "./bounds";
import type { CarouselGeometry } from "./carousel-geometry";
import type { SemanticId, SnapAnchor } from "./types";

export interface CoverflowGeometryOptions<Id extends SemanticId = SemanticId> {
  readonly itemIds: readonly Id[];
  /** Distance between adjacent snap anchors, in CSS pixels. */
  readonly pitch: number;
  readonly viewportSize: number;
}

export interface CoverflowGeometry<
  Id extends SemanticId = SemanticId,
> extends CarouselGeometry<Id> {
  readonly pitch: number;
}

export interface CoverflowProgressOptions {
  /** Live controller position in CSS pixels. */
  readonly position: number;
  /** Anchor position for the slide being styled. */
  readonly anchorPosition: number;
  /** Distance between adjacent snap anchors, in CSS pixels. */
  readonly pitch: number;
}

/**
 * @deprecated Prefer linear {@link resolveCoverflowProgress}.
 */
export interface CoverflowModularProgressOptions {
  readonly position: number;
  readonly index: number;
  readonly count: number;
  readonly pitch: number;
}

export interface CoverflowPresentationOptions {
  /**
   * Signed slide offset from the focused plane in pitch units.
   * `0` is centered. Continuous with drag; do not wrap.
   */
  readonly progress: number;
  /**
   * Absolute X of the first side slot (the parked left/right rail).
   * Set this equal to the geometry pitch for literal 1:1 pointer tracking.
   */
  readonly sidePeakX?: number;
  /** Extra X added per full step once a card is already in the side rail. */
  readonly stackGapX?: number;
  /** Extra depth per stacked step beyond the first side slot. */
  readonly stackGapZ?: number;
  /**
   * Spacing between successive parked cards, measured along the rail plane's own normal —
   * the way a stack of records in a crate is spaced.
   *
   * When set it replaces `stackGapX`/`stackGapZ`, which are independent knobs and so let the
   * stack drift off the plane its own yaw describes: cards parked at 40° but arranged along a
   * line that dives back four times steeper than they are tilted cannot read as parallel panels,
   * however carefully each one is drawn. Deriving both offsets from the parked angle keeps every
   * card in the rail genuinely parallel and genuinely evenly spaced, and the natural convergence
   * of the projection is then the only thing narrowing the rail.
   */
  readonly stackGap?: number;
  /**
   * Camera distance in CSS pixels — the same number the stage uses for `perspective`.
   *
   * Without it, `sidePeakX` and `stackGapX` are pre-perspective model units, so every pixel of
   * depth quietly eats into the rail: recede a card and the projection pulls it back toward the
   * vanishing point faster than `stackGapX` pushes it outward, until the rail collapses into a
   * pile of slivers behind the focused face and neighbouring panels butt edge-to-edge. Supplying
   * the camera distance makes both options mean *projected* pixels — X is pre-divided by the
   * foreshortening, so a rail keeps the spacing it was given however deep the stack runs.
   */
  readonly perspective?: number;
  /** Peak |rotateY| in degrees for a parked side card. */
  readonly maxRotateY?: number;
  /** Extra |rotateY| in degrees per stacked step beyond the first side slot. */
  readonly stackGapRotateY?: number;
  /** translateZ of a parked side card (negative recedes). */
  readonly sideDepth?: number;
  /** Scale of a parked side card. */
  readonly sideScale?: number;
  /** Extra scale delta per stacked step beyond the first side slot. Usually negative. */
  readonly stackGapScale?: number;
  /** Opacity of a parked side card. Center is always fully opaque. */
  readonly sideOpacity?: number;
  /** Hide slides past this absolute progress. */
  readonly hideAfter?: number;
  /**
   * Absolute progress kept visually frontal so the focused face reads as magnetically stable.
   * Yaw stays at zero inside this band while X keeps tracking the pointer.
   */
  readonly flatZone?: number;
  /**
   * How much the two rails differ in how quickly they give up depth, as an exponent skew.
   * Zero makes them exact mirrors, and two mirrored panels meeting mid-overlap intersect along
   * their shared centre line — which is precisely the folded-sheet read.
   *
   * The skew is applied to the shaped depth as an exponent rather than as a multiplier, so each
   * card's path stays **strictly monotonic**: an incoming card only ever approaches, and an
   * outgoing one only ever recedes. A multiplier peaked mid-step separates the rails just as
   * well but makes the incoming card back away before it comes forward, which is a visible
   * hitch at the start of every transition. Because any exponent of `1` is `1`, the skew also
   * vanishes on its own at every resting slot, leaving a settled fan symmetric.
   */
  readonly crossoverBias?: number;
  /**
   * Matching skew for yaw. Keep it well under `crossoverBias`; it exists to break mirrored
   * foreshortening, not to reorder depth.
   */
  readonly crossoverYawBias?: number;
  /** When true, flatten to a 2D stacked rail. */
  readonly reducedMotion?: boolean;
}

export interface CoverflowPresentation {
  readonly progress: number;
  readonly rotateY: number;
  readonly scale: number;
  readonly translateX: number;
  readonly translateZ: number;
  readonly opacity: number;
  readonly zIndex: number;
  readonly isCenter: boolean;
  readonly visible: boolean;
  readonly transform: string;
  /** Shaped distance from the focused plane. `0` centered, `1` parked, higher when stacked. */
  readonly depth: number;
  /** `rotateY` normalised against `maxRotateY`, signed. Drives directional lighting. */
  readonly yaw: number;
  /** How much of a side surface the current yaw exposes, `0`–`1`. */
  readonly edgeStrength: number;
  /** Which side surface the yaw exposes: `-1` left, `1` right, `0` none. */
  readonly edgeSide: -1 | 0 | 1;
}

function assertUniqueIds(ids: readonly SemanticId[], name: string): void {
  const seen = new Set<SemanticId>();
  for (const id of ids) {
    if (typeof id !== "string" || id.length === 0) {
      throw new TypeError(`${name} ids must be non-empty strings`);
    }
    if (seen.has(id)) {
      throw new RangeError(`${name} ids must be unique: ${id}`);
    }
    seen.add(id);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function finiteOrZero(value: number): number {
  return Object.is(value, -0) || !Number.isFinite(value) ? 0 : value;
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * Equal-pitch geometry for a coverflow stage. Anchors sit on one horizontal scalar
 * so drag, fling, elasticity, and settle stay owned by the controller.
 */
export function createCoverflowGeometry<Id extends SemanticId>(
  options: CoverflowGeometryOptions<Id>,
): CoverflowGeometry<Id> {
  assertNonNegative(options.viewportSize, "viewportSize");
  assertFiniteNumber(options.pitch, "pitch");
  if (options.pitch <= 0) {
    throw new RangeError("pitch must be greater than zero");
  }
  assertUniqueIds(options.itemIds, "item");

  const count = options.itemIds.length;
  const trackExtent = count === 0 ? 0 : (count - 1) * options.pitch + options.viewportSize;
  const bounds = getTrackBounds(options.viewportSize, trackExtent);
  const anchors: SnapAnchor<Id>[] = options.itemIds.map((id, order) => ({
    id,
    order,
    position: clampToBounds(-order * options.pitch, bounds),
  }));

  return {
    viewportSize: options.viewportSize,
    trackExtent,
    bounds,
    anchors,
    pitch: options.pitch,
  };
}

/**
 * Linear progress of one slide relative to the live track position.
 * Dragging one pitch moves every slide's progress by exactly 1.
 */
export function resolveCoverflowProgress(options: CoverflowProgressOptions): number {
  assertFiniteNumber(options.position, "position");
  assertFiniteNumber(options.anchorPosition, "anchorPosition");
  assertFiniteNumber(options.pitch, "pitch");
  if (options.pitch <= 0) {
    throw new RangeError("pitch must be greater than zero");
  }
  return (options.position - options.anchorPosition) / options.pitch;
}

/**
 * @deprecated Prefer linear {@link resolveCoverflowProgress}.
 */
export function resolveCoverflowModularProgress(options: CoverflowModularProgressOptions): number {
  assertFiniteNumber(options.position, "position");
  assertFiniteNumber(options.pitch, "pitch");
  assertNonNegative(options.index, "index");
  assertNonNegative(options.count, "count");
  if (options.pitch <= 0) {
    throw new RangeError("pitch must be greater than zero");
  }
  if (!Number.isInteger(options.index) || !Number.isInteger(options.count)) {
    throw new RangeError("index and count must be integers");
  }
  if (options.count === 0) {
    return 0;
  }

  const floatIndex = -options.position / options.pitch;
  let delta = options.index - floatIndex;
  delta = ((delta % options.count) + options.count) % options.count;
  if (delta > options.count / 2) {
    delta -= options.count;
  }
  return delta;
}

/**
 * Classic coverflow placement of one rigid panel:
 * - `|progress| ≤ 1`: card travels between center face and the side rail
 * - `|progress| > 1`: card stays angled in that rail and stacks deeper
 *
 * Every card keeps a whole, undeformed silhouette at all times — nothing is revealed by
 * clipping, so a half-way frame reads as two solid panels trading the foreground rather than
 * one sheet folding down the middle. X tracks the pointer directly; yaw, depth, and scale are
 * shaped, and the two rails skew apart so their silhouettes never mirror mid-overlap.
 *
 * Every channel is monotonic in `|progress|`. A card that is approaching only approaches and a
 * card that is leaving only leaves — no channel doubles back mid-step, which is what separates
 * motion that reads as an object moving from motion that reads as values being animated.
 *
 * The center face (`progress ≈ 0`) is always fully opaque so neighbors never bleed through it.
 */
export function resolveCoverflowPresentation(
  options: CoverflowPresentationOptions,
): CoverflowPresentation {
  assertFiniteNumber(options.progress, "progress");
  const sidePeakX = options.sidePeakX ?? 220;
  const stackGapX = options.stackGapX ?? 28;
  const stackGap = options.stackGap;
  const perspective = options.perspective;
  const maxRotateY = options.maxRotateY ?? 54;
  const stackGapRotateY = options.stackGapRotateY ?? 0;
  const sideDepth = options.sideDepth ?? -140;
  const stackGapZ = options.stackGapZ ?? -36;
  const sideScale = options.sideScale ?? 0.9;
  const stackGapScale = options.stackGapScale ?? 0;
  const sideOpacity = options.sideOpacity ?? 0.92;
  const hideAfter = options.hideAfter ?? 3.5;
  const flatZone = options.flatZone ?? 0.1;
  const crossoverBias = options.crossoverBias ?? 0.45;
  const crossoverYawBias = options.crossoverYawBias ?? 0.15;
  const reducedMotion = options.reducedMotion ?? false;

  assertFiniteNumber(sidePeakX, "sidePeakX");
  assertFiniteNumber(stackGapX, "stackGapX");
  assertFiniteNumber(maxRotateY, "maxRotateY");
  assertFiniteNumber(stackGapRotateY, "stackGapRotateY");
  assertFiniteNumber(sideDepth, "sideDepth");
  assertFiniteNumber(stackGapZ, "stackGapZ");
  assertFiniteNumber(sideScale, "sideScale");
  assertFiniteNumber(stackGapScale, "stackGapScale");
  assertFiniteNumber(sideOpacity, "sideOpacity");
  assertFiniteNumber(hideAfter, "hideAfter");
  assertFiniteNumber(flatZone, "flatZone");
  assertFiniteNumber(crossoverBias, "crossoverBias");
  assertFiniteNumber(crossoverYawBias, "crossoverYawBias");
  if (sidePeakX < 0) {
    throw new RangeError("sidePeakX must be greater than or equal to zero");
  }
  if (stackGapX < 0) {
    throw new RangeError("stackGapX must be greater than or equal to zero");
  }
  if (stackGap !== undefined) {
    assertFiniteNumber(stackGap, "stackGap");
    if (stackGap < 0) {
      throw new RangeError("stackGap must be greater than or equal to zero");
    }
  }
  if (perspective !== undefined) {
    assertFiniteNumber(perspective, "perspective");
    if (perspective <= 0) {
      throw new RangeError("perspective must be greater than zero");
    }
  }
  if (sideScale <= 0 || sideScale > 1) {
    throw new RangeError("sideScale must be in (0, 1]");
  }
  if (sideOpacity < 0 || sideOpacity > 1) {
    throw new RangeError("sideOpacity must be in [0, 1]");
  }
  if (hideAfter <= 0) {
    throw new RangeError("hideAfter must be greater than zero");
  }
  if (flatZone < 0 || flatZone >= 1) {
    throw new RangeError("flatZone must be in [0, 1)");
  }
  if (crossoverBias < 0 || crossoverBias >= 1) {
    throw new RangeError("crossoverBias must be in [0, 1)");
  }
  if (crossoverYawBias < 0 || crossoverYawBias > crossoverBias) {
    throw new RangeError("crossoverYawBias must be in [0, crossoverBias]");
  }

  const progress = finiteOrZero(options.progress);
  const magnitude = Math.abs(progress);
  const direction = progress === 0 ? 0 : Math.sign(progress);
  const isCenter = magnitude < 0.001;
  const visible = magnitude <= hideAfter;

  const railT = clamp(magnitude, 0, 1);
  const stackT = Math.max(0, magnitude - 1);
  // Depth and scale ease so the card settles into its rail instead of arriving at constant rate.
  const depthEase = smoothstep(railT);
  // Yaw holds a flat band around center: the focused panel stays frontal without ever
  // decoupling from the gesture.
  const yawEase = smoothstep(clamp((railT - flatZone) / (1 - flatZone), 0, 1));
  // Skew the two rails apart as an exponent, never as a peaked multiplier: `x ** k` is monotonic
  // in x, so an incoming card only ever approaches and an outgoing one only ever recedes, while
  // `1 ** k === 1` still returns both rails to the same place at every resting slot.
  const depthShape = depthEase ** (1 + direction * crossoverBias);
  const yawShape = yawEase ** (1 + direction * crossoverYawBias);

  // A parked rail is a plane. Spacing the stack along that plane's own normal keeps every card
  // in it parallel and evenly spaced, instead of drifting off the surface its yaw describes.
  const parkedYaw = (maxRotateY * Math.PI) / 180;
  const stackStepX = stackGap === undefined ? stackGapX : stackGap * Math.sin(parkedYaw);
  const stackStepZ = stackGap === undefined ? stackGapZ : -stackGap * Math.cos(parkedYaw);

  const rotateY =
    reducedMotion || direction === 0
      ? 0
      : finiteOrZero(-direction * (maxRotateY * yawShape + stackT * stackGapRotateY));
  const railDepth = reducedMotion ? 0 : sideDepth * depthShape;
  const translateZ = reducedMotion ? 0 : finiteOrZero(railDepth + stackT * stackStepZ);

  // Travel stays literal so the focused face lives under the pointer. When the camera distance
  // is known, undo the perspective divide the card is about to go through — but only for the
  // travel, so the stack behind it keeps converging the way real depth does.
  const projectionRelief = perspective === undefined ? 1 : (perspective - railDepth) / perspective;
  const travelX = direction * railT * sidePeakX * projectionRelief;
  const translateX = finiteOrZero(travelX + direction * stackT * stackStepX);
  const scale = Math.max(0.01, lerp(1, sideScale, depthEase) + stackT * stackGapScale);
  // Center stays solid. Only settled side cards dip slightly — never enough to read through.
  const opacity = !visible ? 0 : magnitude <= flatZone ? 1 : lerp(1, sideOpacity, depthEase);

  const depth = depthEase + stackT;
  // Paint order reads off the same skewed depth the transform describes, so a flattened consumer
  // and a `preserve-3d` renderer agree on which panel is in front, and the crossing pair hands
  // the foreground over exactly once without ever tying.
  const orderKey = reducedMotion ? magnitude : depthShape + stackT;
  const zIndex = Math.round(1_000 - orderKey * 100) * 2 + (direction > 0 ? 0 : 1);

  const yaw = maxRotateY === 0 ? 0 : finiteOrZero(rotateY / maxRotateY);
  const edgeStrength = Math.abs(Math.sin((rotateY * Math.PI) / 180));
  const edgeSide: -1 | 0 | 1 = rotateY < 0 ? 1 : rotateY > 0 ? -1 : 0;

  if (reducedMotion) {
    return {
      progress,
      rotateY: 0,
      scale,
      translateX,
      translateZ: 0,
      opacity,
      zIndex,
      isCenter,
      visible,
      transform: `translate3d(${translateX.toFixed(3)}px, 0, 0) scale(${scale.toFixed(4)})`,
      depth,
      yaw: 0,
      edgeStrength: 0,
      edgeSide: 0,
    };
  }

  return {
    progress,
    rotateY,
    scale,
    translateX,
    translateZ,
    opacity,
    zIndex,
    isCenter,
    visible,
    transform: `translate3d(${translateX.toFixed(3)}px, 0, ${translateZ.toFixed(3)}px) rotateY(${rotateY.toFixed(3)}deg) scale(${scale.toFixed(4)})`,
    depth,
    yaw,
    edgeStrength,
    edgeSide,
  };
}
