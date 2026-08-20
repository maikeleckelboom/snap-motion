import { clamp } from "./bounds";
import { OrderedIdCollection, resolvePreservedIndex } from "./item-collection";
import { tightPreset } from "./presets";
import {
  resolveCommandOriginIndex,
  SettledSelection,
  type SettledSelectionAdoption,
  type SettledSelectionUpdate,
} from "./selection";
import {
  createStackedDeckTraversal,
  isStackedDeckAuthorityStable,
  resolveStackedDeckNeighbor,
  resolveStackedDeckTraversal,
  type MutableStackedDeckTraversal,
  type StackedDeckTraversal,
} from "./stackedDeck";
import type { ElasticityOptions, ReleaseTargetPolicy, SemanticId } from "./types";

/**
 * A stacked deck is a physical card transaction, not a rail: one interaction may exchange exactly
 * one adjacent screen, however far it travels. This is a presentation policy of the surface, not a
 * lowering of the generic controller's multi-anchor capability.
 */
export const STACKED_DECK_ANCHOR_SKIP = 1;

/**
 * The part of the generic release policy a stacked deck leaves to its consumer.
 *
 * `maxAnchorSkip` is absent on purpose. The deck fixes it at {@link STACKED_DECK_ANCHOR_SKIP},
 * because one interaction exchanging one adjacent screen *is* the product; a surface that accepted
 * the value and then overwrote it would be documenting a knob that does nothing. Omitting it says
 * the same thing in the type system, where a consumer finds out at the keyboard instead of by
 * wondering why their configuration had no effect.
 */
export type StackedDeckReleasePolicy = Partial<Omit<ReleaseTargetPolicy, "maxAnchorSkip">>;

/**
 * The deck's product default for travel past the adjacent anchor.
 *
 * The one-card envelope is a semantic limit, not a wall: a hand that keeps going has to feel it
 * resist and come back, or the surface reads as broken rather than as decided. Without an explicit
 * interior elasticity the generic controller paints that limit as a hard stop, so a zero-config
 * deck would not be the product this package documents. The numbers are the default preset's own
 * resistance, which keeps the one-card envelope materially consistent with other tight surfaces.
 */
export const STACKED_DECK_INTERIOR_ELASTICITY: ElasticityOptions = tightPreset.elasticity;

export interface StackedDeckModelOptions<Id extends SemanticId = SemanticId> {
  /** The ordered semantic items the deck is about. */
  readonly ids: readonly Id[];
  /** Defaults deterministically to the middle semantic ordinal; every ordinal has the same ring shape. */
  readonly initialId?: Id;
}

/** One controller snapshot, reduced to the four numbers the deck's semantics depend on. */
export interface StackedDeckSnapshotInput {
  readonly phase: SettledSelectionUpdate["phase"];
  /** Interaction-local physical position in cards, with the transaction origin at zero. */
  readonly physicalPosition: number;
  /** Index the controller is settling toward, or `null`. */
  readonly targetIndex: number | null;
  /** Index of the controller's nearest anchor. */
  readonly nearestIndex: number;
}

/**
 * Everything a deck surface needs to name, enable, announce, and draw itself.
 *
 * `currentIndex` is the single answer to "which card is current". Every part of a surface that
 * names a card — caption, `aria-current`, the re-grab origin, inspection —
 * reads it, so none of them can invent its own. It equals `visualTopIndex` except inside a handoff,
 * where it names the card the eye already reads as current while the outgoing one finishes
 * vacating. `settledIndex` is the slower mechanical-rest answer announcements and inspection use.
 */
export interface StackedDeckModelState {
  /**
   * Every index here is an ordinal into the deck's own collection, and `-1` is the one answer for
   * "no item" — the state an empty deck is in, and the state an unknown ID resolves to. No layer
   * above this one substitutes item zero for it.
   */
  readonly traversal: StackedDeckTraversal;
  readonly settledIndex: number;
  readonly currentIndex: number;
  readonly visualTopIndex: number;
  readonly pendingTargetIndex: number | null;
  readonly commandOriginIndex: number;
  readonly interactionOriginIndex: number | null;
  /** Physical transaction direction, independent from semantic ordinal delta. */
  readonly interactionDirection: -1 | 0 | 1;
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
  | {
      readonly kind: "traverse";
      readonly direction: -1 | 1;
      readonly originIndex: number;
      readonly targetIndex: number;
    }
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
 * The stacked deck's product model: the ordered items, selection, authority, interaction envelopes,
 * command policy, and direct synchronization, resolved from controller snapshots without touching
 * a controller.
 *
 * It composes the deck traversal primitive rather than replacing it. The primitive keeps its
 * generic multi-anchor capability; the model is what makes a *deck* out of it by opening one
 * bounded transaction per interaction and refusing to let a single command become a multi-card
 * throw.
 *
 * The model owns its item collection, so a deck that gains, loses, or reorders screens is one
 * {@link StackedDeckModel.reconfigure} away from being correct rather than a surface holding
 * indexes that quietly stopped meaning anything.
 */
export class StackedDeckModel<Id extends SemanticId = SemanticId> {
  readonly #items: OrderedIdCollection<Id>;

  #traversalStorage: MutableStackedDeckTraversal;
  #selection: SettledSelection;
  #interactionOriginIndex: number | null = null;
  #interactionDirection: -1 | 0 | 1 = 0;
  #announcementIndex: number | null = null;

  constructor(options: StackedDeckModelOptions<Id>) {
    this.#items = new OrderedIdCollection(options.ids, "deck item");
    const initialIndex = this.#items.resolveInitialIndex(options.initialId);
    this.#traversalStorage = createStackedDeckTraversal(initialIndex, this.#items.size);
    this.#selection = new SettledSelection(initialIndex, this.#items.size);
  }

  get itemCount(): number {
    return this.#items.size;
  }

  get ids(): readonly Id[] {
    return this.#items.ids;
  }

  /** The item at a position, or `undefined`. Geometry stays ordinal; identity stays semantic. */
  idAt(index: number): Id | undefined {
    return this.#items.at(index);
  }

  /** An item's current position, or `-1`. An unknown ID never resolves to a neighbouring card. */
  indexOf(id: Id): number {
    return this.#items.indexOf(id);
  }

  /**
   * Adopts a new item collection and reports where the deck now stands.
   *
   * The semantic item the deck was on is preserved wherever it moved to. Everything downstream of
   * ordering — the traversal storage, the settled selection, a pending destination, and any
   * interaction envelope opened against the old ordering — is rebuilt rather than carried over,
   * because none of it can be trusted to still describe this deck.
   */
  reconfigure(nextIds: readonly Id[]): number {
    const previousIndex = this.state.currentIndex;
    const previousId = this.#items.at(previousIndex);
    this.#items.replace(nextIds, "deck item");
    const nextIndex = resolvePreservedIndex(this.#items, previousId, previousIndex);
    this.#traversalStorage = createStackedDeckTraversal(nextIndex, this.#items.size);
    // The rebuilt selection already treats the preserved item as announced, so a reconfiguration
    // never speaks for a change the user did not make.
    this.#selection = new SettledSelection(nextIndex, this.#items.size);
    this.#interactionOriginIndex = null;
    this.#interactionDirection = 0;
    this.#announcementIndex = null;
    return nextIndex;
  }

  get state(): StackedDeckModelState {
    const traversal = this.#traversalStorage;
    const currentIndex = traversal.authoritativeIndex;
    const pendingTargetIndex = this.#selection.pendingTargetIndex;
    const commandOriginIndex = resolveCommandOriginIndex(currentIndex, pendingTargetIndex);
    return {
      traversal,
      settledIndex: this.#selection.settledIndex,
      currentIndex,
      visualTopIndex: traversal.visualTopIndex,
      pendingTargetIndex,
      commandOriginIndex,
      interactionOriginIndex: this.#interactionOriginIndex,
      interactionDirection: this.#interactionDirection,
      authorityStable: isStackedDeckAuthorityStable(traversal),
      announcementIndex: this.#announcementIndex,
      canPrevious: this.itemCount > 1,
      canNext: this.itemCount > 1,
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
    this.#interactionOriginIndex = originIndex < 0 ? null : originIndex;
    this.#interactionDirection = 0;
    return originIndex;
  }

  /** Opens an interaction on an explicit origin, which is how a relative command claims one. */
  openInteraction(originIndex: number, direction: -1 | 1): void {
    this.#interactionOriginIndex =
      this.itemCount === 0 ? null : clamp(originIndex, 0, this.itemCount - 1);
    this.#interactionDirection = this.#interactionOriginIndex === null ? 0 : direction;
  }

  /** Closes the current interaction. Mechanical rest is the only thing that may do this. */
  endInteraction(): void {
    this.#interactionOriginIndex = null;
    this.#interactionDirection = 0;
  }

  /** Consumes one controller snapshot and republishes the deck's whole semantic state. */
  update(input: StackedDeckSnapshotInput): StackedDeckModelState {
    if (this.itemCount === 0) return this.state;
    if (this.#interactionOriginIndex !== null && this.itemCount > 1) {
      const physicalDirection = Math.sign(input.physicalPosition) as -1 | 0 | 1;
      // A direction-authoritative command may publish a zero-travel frame before its spring moves.
      // Zero is geometrically neutral, not evidence that the transaction forgot its direction.
      if (physicalDirection !== 0) this.#interactionDirection = physicalDirection;
    }
    this.#announcementIndex = this.#selection.update({
      phase: input.phase,
      targetIndex: input.targetIndex,
      activeIndex: input.nearestIndex,
    });

    const originIndex = this.#interactionOriginIndex ?? this.#selection.settledIndex;
    resolveStackedDeckTraversal(
      {
        controllerPhase: input.phase,
        itemCount: this.itemCount,
        originIndex,
        physicalPosition: input.physicalPosition,
        settledIndex: this.#selection.settledIndex,
      },
      this.#traversalStorage,
    );
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
    if (context.owned || this.itemCount < 2) return { kind: "none" };
    const originIndex = this.state.commandOriginIndex;
    const targetIndex = resolveStackedDeckNeighbor(originIndex, direction, this.itemCount);
    return { kind: "traverse", direction, originIndex, targetIndex };
  }

  /**
   * Absolute navigation names a destination; it is not a throw. An adjacent destination may still
   * use the normal one-card interaction, but anything further synchronizes directly instead of
   * animating through every intermediate card.
   *
   * An index that names no item is refused outright. A deck asked to go somewhere that does not
   * exist has been asked a question with no answer, and going to item zero is not that answer.
   */
  resolveAbsoluteCommand(index: number, context: StackedDeckCommandContext): StackedDeckCommand {
    if (!this.#items.contains(index)) return { kind: "none" };
    const originIndex = this.state.commandOriginIndex;
    if (index === originIndex && context.atRest) return { kind: "none" };
    if (!context.owned && this.itemCount > 2) {
      if (index === resolveStackedDeckNeighbor(originIndex, 1, this.itemCount)) {
        return this.resolveRelativeCommand(1, context);
      }
      if (index === resolveStackedDeckNeighbor(originIndex, -1, this.itemCount)) {
        return this.resolveRelativeCommand(-1, context);
      }
    }
    return { kind: "synchronize", targetIndex: index, announce: true };
  }

  /**
   * Adopts a destination without traversing to it: the deck simply *is* there on the next frame.
   *
   * A silent synchronization is for a change another surface already reported — returning from an
   * inspection gallery, for instance. An announced one is a navigation the user asked this deck
   * for, and it announces immediately and truthfully because it is not a traversal: the
   * announcement is published on this state, not left for whichever snapshot happens to arrive
   * next. The durable selection is rebased in one operation, so the very next snapshot may be a
   * drag or a settle without reviving the destination the deck has already left.
   *
   * Returns the adopted index, or `-1` when the index names no item and nothing was adopted.
   */
  synchronize(index: number, options: SettledSelectionAdoption = {}): number {
    if (!this.#items.contains(index)) return -1;
    this.#interactionOriginIndex = null;
    this.#interactionDirection = 0;
    this.#announcementIndex = this.#selection.adopt(index, options);
    resolveStackedDeckTraversal(
      {
        controllerPhase: "idle",
        itemCount: this.itemCount,
        originIndex: index,
        physicalPosition: 0,
        settledIndex: index,
      },
      this.#traversalStorage,
    );
    return index;
  }

  /** {@link isStackedDeckInspectEligible} against this model's current state. */
  isInspectEligible(context: StackedDeckInspectContext): boolean {
    if (!this.#items.contains(context.index)) return false;
    return isStackedDeckInspectEligible(this.state, context);
  }
}
