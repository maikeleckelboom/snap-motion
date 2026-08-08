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
  /** True for the durable selection, which changes only at mechanical rest. */
  readonly settled: boolean;
  /** True when a tap on this card would open it on another surface. */
  readonly inspectable: boolean;
  /** Which part this card plays in the current frame. */
  readonly role: StackedDeckRole;
  readonly pose: StackedDeckPose;
}

/**
 * One decorative depth layer: one screen still in the deck, on the side of the current card it is
 * waiting on. A layer carries no item identity — nothing about it names, reveals, or lets a caller
 * act on the screen it accounts for — only that the deck has one more card that way.
 */
export interface StackedDeckPileLayer {
  readonly key: string;
  readonly side: -1 | 1;
  readonly slot: number;
  readonly layer: number;
  readonly opacity: number;
  readonly shadowStrength: number;
  readonly transform: string;
}

export type { StackedDeckPose, StackedDeckRole };
