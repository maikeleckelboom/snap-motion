import { clamp } from "./bounds";
import {
  resolveAdjacentIndex,
  resolveCommandOriginIndex,
  SettledSelection,
  type SettledSelectionUpdate,
} from "./selection";
import {
  createStackedDeckTraversal,
  isStackedDeckAuthorityStable,
  resolveStackedDeckTraversal,
  type MutableStackedDeckTraversal,
  type StackedDeckTraversal,
  type StackedDeckTraversalBounds,
} from "./stackedDeck";

/**
 * A stacked deck is a physical card transaction, not a rail: one interaction may exchange exactly
 * one adjacent screen, however far it travels. This is a presentation policy of the surface, not a
 * lowering of the generic controller's multi-anchor capability.
 */
export const STACKED_DECK_ANCHOR_SKIP = 1;

export interface StackedDeckModelOptions {
  readonly itemCount: number;
  /** Defaults to the middle of the deck, which is where a pile reads as a pile. */
  readonly initialIndex?: number;
}

/** One controller snapshot, reduced to the four numbers the deck's semantics depend on. */
export interface StackedDeckSnapshotInput {
  readonly phase: SettledSelectionUpdate["phase"];
  /** Continuous physical index, `-position / motionPitch`. */
  readonly physicalIndex: number;
  /** Index the controller is settling toward, or `null`. */
  readonly targetIndex: number | null;
  /** Index of the controller's nearest anchor. */
  readonly nearestIndex: number;
}

/**
 * Everything a deck surface needs to name, enable, announce, and draw itself.
 *
 * `currentIndex` is the single answer to "which card is current". Every part of a surface that
 * names a card — caption, counter, pagination, `aria-current`, the re-grab origin, inspection —
 * reads it, so none of them can invent its own. It equals `visualTopIndex` except inside a handoff,
 * where it names the card the eye already reads as current while the outgoing one finishes
 * vacating. `settledIndex` is the slower, durable answer route state and announcements use.
 */
export interface StackedDeckModelState {
  readonly traversal: StackedDeckTraversal;
  readonly settledIndex: number;
  readonly currentIndex: number;
  readonly visualTopIndex: number;
  readonly pendingTargetIndex: number | null;
  readonly commandOriginIndex: number;
  readonly interactionOriginIndex: number | null;
  /** True when exactly one content card is drawn, so nothing can contest its identity. */
  readonly authorityStable: boolean;
  /** Index to announce on this update, or `null`. Only mechanical rest ever produces one. */
  readonly announcementIndex: number | null;
  readonly canPrevious: boolean;
  readonly canNext: boolean;
}

/** What the deck decided a navigation request means. The adapter performs it; the model decides. */
export type StackedDeckCommand =
  | { readonly kind: "none" }
  /** One adjacent exchange, opened as its own interaction and measured from `originIndex`. */
  | { readonly kind: "traverse"; readonly originIndex: number; readonly targetIndex: number }
  /**
   * A named destination that is not one physical throw. It synchronizes directly rather than
   * animating through every intermediate card, and says so truthfully by announcing immediately.
   */
  | { readonly kind: "synchronize"; readonly targetIndex: number; readonly announce: boolean };

/**
 * Inspection eligibility: whether the named card is unambiguously the current one and nothing else
 * is holding the surface. It deliberately never asks whether the controller has reached rest — a
 * spring tail the user cannot see must not disable an action.
 *
 * Reading it off published state rather than off the model keeps an adapter's own change tracking
 * honest: the answer moves with the frame, so a surface that recomputes it can see it move.
 */
export function isStackedDeckInspectEligible(
  state: StackedDeckModelState,
  context: StackedDeckInspectContext,
): boolean {
  return !context.owned && state.currentIndex === context.index && state.authorityStable;
}

/** Facts only the surface adapter can know, because they are about input devices and rest. */
export interface StackedDeckCommandContext {
  /** True while an input device physically holds the deck. */
  readonly owned: boolean;
  /** True when the deck is mechanically at rest. */
  readonly atRest: boolean;
}

export interface StackedDeckInspectContext {
  readonly index: number;
  /** True while an input device physically holds the deck. */
  readonly owned: boolean;
}

/**
 * The stacked deck's product model: selection, authority, interaction envelopes, command policy,
 * and direct synchronization, resolved from controller snapshots without touching a controller.
 *
 * It composes the deck traversal primitive rather than replacing it. The primitive keeps its
 * generic multi-anchor capability; the model is what makes a *deck* out of it by opening one
 * bounded transaction per interaction and refusing to let a single command become a multi-card
 * throw.
 */
export class StackedDeckModel {
  readonly itemCount: number;

  readonly #traversalStorage: MutableStackedDeckTraversal;
  readonly #selection: SettledSelection;
  #settledIndex: number;
  #pendingTargetIndex: number | null = null;
  #interactionOriginIndex: number | null = null;
  #announcementIndex: number | null = null;
  #suppressedAnnouncementIndex: number | undefined;

  constructor(options: StackedDeckModelOptions) {
    const itemCount = Math.max(0, Math.trunc(options.itemCount));
    const initialIndex =
      itemCount === 0
        ? -1
        : clamp(
            Math.trunc(options.initialIndex ?? Math.floor(itemCount / 2)),
            0,
            Math.max(0, itemCount - 1),
          );
    this.itemCount = itemCount;
    this.#traversalStorage = createStackedDeckTraversal(initialIndex, itemCount);
    this.#selection = new SettledSelection(Math.max(0, initialIndex), itemCount);
    this.#settledIndex = Math.max(0, initialIndex);
  }

  /**
   * The envelope one interaction may resolve inside, or `undefined` outside an interaction — where
   * the projection stays free, so the underlying primitive keeps its generic capability.
   */
  get traversalBounds(): StackedDeckTraversalBounds | undefined {
    const originIndex = this.#interactionOriginIndex;
    if (originIndex === null || this.itemCount === 0) return undefined;
    const lastIndex = this.itemCount - 1;
    return {
      minIndex: clamp(originIndex - STACKED_DECK_ANCHOR_SKIP, 0, lastIndex),
      maxIndex: clamp(originIndex + STACKED_DECK_ANCHOR_SKIP, 0, lastIndex),
    };
  }

  get state(): StackedDeckModelState {
    const traversal = this.#traversalStorage;
    const currentIndex = traversal.authoritativeIndex;
    const commandOriginIndex = resolveCommandOriginIndex(currentIndex, this.#pendingTargetIndex);
    return {
      traversal,
      settledIndex: this.#settledIndex,
      currentIndex,
      visualTopIndex: traversal.visualTopIndex,
      pendingTargetIndex: this.#pendingTargetIndex,
      commandOriginIndex,
      interactionOriginIndex: this.#interactionOriginIndex,
      authorityStable: isStackedDeckAuthorityStable(traversal),
      announcementIndex: this.#announcementIndex,
      canPrevious: commandOriginIndex > 0,
      canNext: commandOriginIndex < this.itemCount - 1,
    };
  }

  /**
   * Opens an interaction and reports the anchor the controller must measure it from.
   *
   * Passing the interaction-authoritative card rather than the nearest anchor keeps the drag
   * envelope, the release cap, and the card under the hand on one origin — including during a
   * re-grab made while the previous spring is still running, where the two would otherwise be a
   * whole card apart. The next distinct interaction *replaces* this one rather than queueing behind
   * it: a previous interaction's spring tail is never a reason to refuse the next input.
   */
  beginInteraction(): number {
    const originIndex = this.state.currentIndex;
    this.#interactionOriginIndex = originIndex;
    return originIndex;
  }

  /** Opens an interaction on an explicit origin, which is how a relative command claims one. */
  openInteraction(originIndex: number): void {
    this.#interactionOriginIndex = clamp(originIndex, 0, Math.max(0, this.itemCount - 1));
  }

  /** Closes the current interaction. Mechanical rest is the only thing that may do this. */
  endInteraction(): void {
    this.#interactionOriginIndex = null;
  }

  /** Consumes one controller snapshot and republishes the deck's whole semantic state. */
  update(input: StackedDeckSnapshotInput): StackedDeckModelState {
    if (this.itemCount === 0) return this.state;
    const announcement = this.#selection.update({
      phase: input.phase,
      targetIndex: input.targetIndex,
      activeIndex: input.nearestIndex,
    });
    this.#settledIndex = this.#selection.settledIndex;
    this.#pendingTargetIndex = this.#selection.pendingTargetIndex;

    const traversalBounds = this.traversalBounds;
    resolveStackedDeckTraversal(
      {
        controllerPhase: input.phase,
        itemCount: this.itemCount,
        physicalIndex: input.physicalIndex,
        settledIndex: this.#selection.settledIndex,
        ...(traversalBounds === undefined ? {} : { traversalBounds }),
      },
      this.#traversalStorage,
    );

    if (announcement === null) {
      this.#announcementIndex = null;
    } else {
      const suppressed = announcement === this.#suppressedAnnouncementIndex;
      this.#suppressedAnnouncementIndex = undefined;
      this.#announcementIndex = suppressed ? null : announcement;
    }
    return this.state;
  }

  /**
   * One relative command is one adjacent card, measured from the destination the deck is committed
   * to. It re-bases the spring rather than queueing, so distinct rapid commands each resolve their
   * own card without ever letting a single command travel further than one.
   */
  resolveRelativeCommand(
    direction: -1 | 1,
    context: Pick<StackedDeckCommandContext, "owned">,
  ): StackedDeckCommand {
    if (context.owned || this.itemCount === 0) return { kind: "none" };
    const originIndex = this.state.commandOriginIndex;
    const targetIndex = resolveAdjacentIndex(originIndex, direction, this.itemCount);
    if (targetIndex === originIndex) return { kind: "none" };
    return { kind: "traverse", originIndex, targetIndex };
  }

  /**
   * Absolute navigation names a destination; it is not a throw. An adjacent destination may still
   * use the normal one-card interaction, but anything further synchronizes directly instead of
   * animating through every intermediate card.
   */
  resolveAbsoluteCommand(index: number, context: StackedDeckCommandContext): StackedDeckCommand {
    if (this.itemCount === 0) return { kind: "none" };
    const targetIndex = clamp(index, 0, this.itemCount - 1);
    const distance = targetIndex - this.state.commandOriginIndex;
    if (distance === 0 && context.atRest) return { kind: "none" };
    if (!context.owned && Math.abs(distance) === 1) {
      return this.resolveRelativeCommand(distance as -1 | 1, context);
    }
    return { kind: "synchronize", targetIndex, announce: true };
  }

  /**
   * Adopts a destination without traversing to it: the deck simply *is* there on the next frame.
   *
   * A silent synchronization is for a change another surface already reported — returning from an
   * inspection gallery, for instance. An announced one is a navigation the user asked this deck
   * for, and it announces immediately and truthfully because it is not a traversal.
   */
  synchronize(index: number, options: { readonly announce?: boolean } = {}): number {
    const targetIndex = clamp(index, 0, Math.max(0, this.itemCount - 1));
    this.#interactionOriginIndex = null;
    this.#settledIndex = targetIndex;
    this.#pendingTargetIndex = null;
    this.#selection.pendingTargetIndex = null;
    if (options.announce !== true) this.#suppressedAnnouncementIndex = targetIndex;
    resolveStackedDeckTraversal(
      {
        controllerPhase: "idle",
        itemCount: this.itemCount,
        physicalIndex: targetIndex,
        settledIndex: targetIndex,
      },
      this.#traversalStorage,
    );
    this.#announcementIndex = null;
    return targetIndex;
  }

  /** {@link isStackedDeckInspectEligible} against this model's current state. */
  isInspectEligible(context: StackedDeckInspectContext): boolean {
    if (context.index < 0 || context.index >= this.itemCount) return false;
    return isStackedDeckInspectEligible(this.state, context);
  }
}
