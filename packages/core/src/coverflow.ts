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
   * Typically ~0.42–0.55 × card width so the center face stays clear.
   */
  readonly sidePeakX?: number;
  /** Extra X added per full step once a card is already in the side rail. */
  readonly stackGapX?: number;
  /** Peak |rotateY| in degrees for a parked side card. */
  readonly maxRotateY?: number;
  /** translateZ of a parked side card (negative recedes). */
  readonly sideDepth?: number;
  /** Extra depth per stacked step beyond the first side slot. */
  readonly stackGapZ?: number;
  /** Scale of a parked side card. */
  readonly sideScale?: number;
  /** Opacity of a parked side card. Center is always fully opaque. */
  readonly sideOpacity?: number;
  /** Hide slides past this absolute progress. */
  readonly hideAfter?: number;
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
 * Classic coverflow placement:
 * - `|progress| ≤ 1`: card travels between center face and the side rail
 * - `|progress| > 1`: card stays angled in that rail and stacks deeper
 *
 * The center face (`progress ≈ 0`) is always fully opaque so neighbors never bleed through it.
 */
export function resolveCoverflowPresentation(
  options: CoverflowPresentationOptions,
): CoverflowPresentation {
  assertFiniteNumber(options.progress, "progress");
  const sidePeakX = options.sidePeakX ?? 220;
  const stackGapX = options.stackGapX ?? 28;
  const maxRotateY = options.maxRotateY ?? 54;
  const sideDepth = options.sideDepth ?? -140;
  const stackGapZ = options.stackGapZ ?? -36;
  const sideScale = options.sideScale ?? 0.9;
  const sideOpacity = options.sideOpacity ?? 0.92;
  const hideAfter = options.hideAfter ?? 3.5;
  const reducedMotion = options.reducedMotion ?? false;

  assertFiniteNumber(sidePeakX, "sidePeakX");
  assertFiniteNumber(stackGapX, "stackGapX");
  assertFiniteNumber(maxRotateY, "maxRotateY");
  assertFiniteNumber(sideDepth, "sideDepth");
  assertFiniteNumber(stackGapZ, "stackGapZ");
  assertFiniteNumber(sideScale, "sideScale");
  assertFiniteNumber(sideOpacity, "sideOpacity");
  assertFiniteNumber(hideAfter, "hideAfter");
  if (sidePeakX < 0) {
    throw new RangeError("sidePeakX must be greater than or equal to zero");
  }
  if (stackGapX < 0) {
    throw new RangeError("stackGapX must be greater than or equal to zero");
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

  const progress = finiteOrZero(options.progress);
  const magnitude = Math.abs(progress);
  const direction = progress === 0 ? 0 : Math.sign(progress);
  const isCenter = magnitude < 0.001;
  const visible = magnitude <= hideAfter;

  // Smoothstep the first pitch so the center face clears before neighbors park.
  const railT = clamp(magnitude, 0, 1);
  const ease = railT * railT * (3 - 2 * railT);
  const stackT = Math.max(0, magnitude - 1);

  const translateX = finiteOrZero(direction * (lerp(0, sidePeakX, ease) + stackT * stackGapX));
  const rotateY =
    reducedMotion || direction === 0 ? 0 : finiteOrZero(-direction * maxRotateY * ease);
  const translateZ = reducedMotion
    ? 0
    : finiteOrZero(lerp(0, sideDepth, ease) + stackT * stackGapZ);
  const scale = lerp(1, sideScale, ease);
  // Center stays solid. Only settled side cards dip slightly — never enough to read through.
  const opacity = !visible ? 0 : magnitude < 0.08 ? 1 : lerp(1, sideOpacity, ease);
  const zIndex = Math.round(1_000 - magnitude * 100);

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
  };
}
