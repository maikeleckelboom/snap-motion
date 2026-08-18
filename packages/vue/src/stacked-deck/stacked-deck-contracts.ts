import type { StackedDeckPose, StackedDeckRole } from "@snap-motion/core";

/** Slot state for one deck card. */
export interface StackedDeckCardState<TItem, TId extends string> {
  readonly item: TItem;
  readonly id: TId;
  readonly index: number;
  /**
   * True for the card the deck currently names — the one a caption, a counter, and a new gesture
   * all mean. Inside a handoff that is the incoming card, before ownership has formally moved.
   */
  readonly active: boolean;
  /** True for the card currently dominant in the physical projection. */
  readonly visual: boolean;
  /** True for the card at mechanical rest. */
  readonly settled: boolean;
  /** True when a tap on this card would open it on another surface. */
  readonly inspectable: boolean;
  /** Which part this card plays in the current frame. */
  readonly role: StackedDeckRole;
  readonly pose: StackedDeckPose;
}

/**
 * Full physical projection for one non-dominant card from {@link useStackedDeckMotion}. Custom
 * renderers and diagnostics receive the same geometry as the persistent card pose; the high-level
 * `StackedDeck` component renders that card through its single `#card` shell.
 *
 * The ordered item association grants no item semantics, interaction, selection, focus, or
 * accessibility ownership.
 */
export interface StackedDeckPileLayer<Id extends string = string> {
  readonly id: Id;
  readonly index: number;
  /** Stable physical-card key. Follows item identity while the resolved slot owns placement. */
  readonly key: string;
  readonly side: -1 | 1;
  readonly slot: number;
  readonly layer: number;
  readonly opacity: number;
  readonly shadowStrength: number;
  readonly transform: string;
}

export type { StackedDeckPose, StackedDeckRole };
