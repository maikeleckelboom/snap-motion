import type { CoverflowTuning } from "@snap-motion/core";

/**
 * One card's resolved place on the rail, plus the normalized material signals a product theme
 * reads to light it. Every signal is a function of the panel's own orientation, never of raw
 * gesture progress, so a theme built on them cannot disagree with the geometry.
 */
export interface CoverflowCardPresentation {
  /** Signed offset from the focused plane, in pitch units. `0` is centered. */
  readonly progress: number;
  readonly rotateY: number;
  readonly scale: number;
  readonly translateX: number;
  readonly translateZ: number;
  readonly zIndex: number;
  readonly visible: boolean;
  /** Whether this card may receive pointer input at its current place on the rail. */
  readonly interactive: boolean;
  /** Shaped distance from the focused plane: `0` centered, `1` parked, higher when stacked. */
  readonly depth: number;
  /** How far into the deep stack the card has gone, `0`–`1`. */
  readonly deepRail: number;
  /** `rotateY` normalised against the parked angle, signed. */
  readonly yaw: number;
  /** How much of a side surface the current yaw exposes, `0`–`1`. */
  readonly edgeStrength: number;
  /** Which side surface the yaw exposes: `-1` left, `1` right, `0` none. */
  readonly edgeSide: -1 | 0 | 1;
  /** In-plane offset, in CSS pixels, that lands a drawn edge on the turned-toward side. */
  readonly edgeOffset: number;
  /** Unsigned yaw, which is how strongly incident light rakes across the face. */
  readonly sheen: number;
  /** How much of the focused clearing this card occupies, `0`–`1`. */
  readonly centerInfluence: number;
  /** How much visual commitment the surface's speed is currently taking away, `0`–`1`. */
  readonly kineticFocus: number;
  /** The inverse: how settled the surface reads, `0`–`1`. */
  readonly settledness: number;
  /** Strength of the contact shadow a settled, centered card casts, `0`–`1`. */
  readonly contactShadow: number;
  /** How much the neighbouring panel darkens this one's near edge, `0`–`1`. */
  readonly occlusion: number;
}

/** Slot state for one coverflow card. */
export interface CoverflowCardState<TItem, TId extends string> {
  readonly item: TItem;
  readonly id: TId;
  readonly index: number;
  /** True for the application-authoritative semantic selection. */
  readonly active: boolean;
  /** True for the face currently dominant in the clearing. */
  readonly visual: boolean;
  /** True for the item at mechanical rest. */
  readonly settled: boolean;
  /** True when a tap on this card would open it rather than select it. */
  readonly inspectable: boolean;
  readonly presentation: CoverflowCardPresentation;
}

export type { CoverflowTuning };
