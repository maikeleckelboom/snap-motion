import { clamp } from "./bounds";
import { OrderedIdCollection, resolvePreservedIndex } from "./item-collection";
import {
  resolveAdjacentIndex,
  resolveHystereticIndex,
  SettledSelection,
  type SettledSelectionAdoption,
  type SettledSelectionUpdate,
} from "./selection";
import type { SemanticId } from "./types";

export interface CoverflowModelOptions<Id extends SemanticId = SemanticId> {
  /** The ordered semantic items the rail is about. */
  readonly ids: readonly Id[];
  /** Defaults to the middle of the rail, which is where a coverflow reads as a coverflow. */
  readonly initialId?: Id;
}

/** One controller snapshot, reduced to the numbers a coverflow rail's semantics depend on. */
export interface CoverflowSnapshotInput {
  readonly phase: SettledSelectionUpdate["phase"];
  /** Continuous physical index, `-position / pitch`. */
  readonly physicalIndex: number;
  /** Index the controller is settling toward, or `null`. */
  readonly targetIndex: number | null;
  /** Index of the controller's nearest anchor. */
  readonly nearestIndex: number;
}

/**
 * A coverflow rail names two different cards on purpose.
 *
 * `visualIndex` is the face in the clearing: it follows the physical mass through a narrow dead
 * band, so a caption and a counter track the gesture instead of lagging a whole spring behind it.
 * `settledIndex` is the durable selection — what a route, an announcement, or opening another
 * surface on "the current card" must mean, and it changes only at mechanical rest.
 */
export interface CoverflowModelState {
  /**
   * Every index here is an ordinal into the rail's own collection, and `-1` is the one answer for
   * "no item" — the state an empty rail is in, and the state an unknown ID resolves to. No layer
   * above this one substitutes item zero for it.
   */
  readonly physicalIndex: number;
  readonly visualIndex: number;
  readonly settledIndex: number;
  readonly pendingTargetIndex: number | null;
  /** The card a relative command steps from: the destination already requested, else the nearest. */
  readonly commandIndex: number;
  readonly announcementIndex: number | null;
  readonly canPrevious: boolean;
  readonly canNext: boolean;
}

export type CoverflowCommand =
  | { readonly kind: "none" }
  | { readonly kind: "move"; readonly targetIndex: number };

/** Whether the surface is exactly parked on one anchor, with nothing left to render. */
export interface SettledOnAnchorInput {
  readonly phase: SettledSelectionUpdate["phase"];
  readonly index: number;
  readonly settledIndex: number;
  readonly physicalIndex: number;
  readonly position: number;
  readonly anchorPosition: number | undefined;
  readonly velocity: number;
  readonly restDistance: number;
  readonly restSpeed: number;
  /** Semantic agreement: both the settled selection and the controller must name this item. */
  readonly activeMatches: boolean;
  readonly targetMatches: boolean;
}

/**
 * True when the surface is at rest on exactly the named item, physically and semantically.
 *
 * A rail does not decouple card pose from controller position, so unlike a stacked deck it really
 * must wait for mechanical rest before another surface may claim the item: any remaining travel is
 * travel the eye can still follow.
 */
export function isSettledOnAnchor(input: SettledOnAnchorInput): boolean {
  return (
    input.phase === "idle" &&
    input.activeMatches &&
    input.targetMatches &&
    input.settledIndex === input.index &&
    Math.abs(input.physicalIndex - input.index) <= Number.EPSILON * 16 &&
    input.anchorPosition !== undefined &&
    Math.abs(input.position - input.anchorPosition) <= Math.max(0, input.restDistance) &&
    Math.abs(input.velocity) <= Math.max(0, input.restSpeed)
  );
}

/**
 * The coverflow rail's product model: visual hysteresis, durable selection, pending destinations,
 * command origin, announcements, and direct synchronization.
 *
 * It owns no geometry and no physics. Presentation reads scalar position through the rail
 * resolver; this is only the semantic layer above the same scalar controller every surface shares.
 */
export class CoverflowModel<Id extends SemanticId = SemanticId> {
  readonly #items: OrderedIdCollection<Id>;

  #selection: SettledSelection;
  #physicalIndex: number;
  #visualIndex: number;
  #commandIndex: number;
  #announcementIndex: number | null = null;

  constructor(options: CoverflowModelOptions<Id>) {
    this.#items = new OrderedIdCollection(options.ids, "coverflow item");
    const initialIndex = this.#items.resolveInitialIndex(options.initialId);
    this.#selection = new SettledSelection(initialIndex, this.#items.size);
    this.#physicalIndex = initialIndex;
    this.#visualIndex = initialIndex;
    this.#commandIndex = initialIndex;
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
   * Adopts a new item collection and reports where the rail now stands.
   *
   * The semantic item the rail was on is preserved wherever it moved to; a pending destination and
   * the durable selection are rebuilt against the new ordering rather than carried over as indexes
   * that no longer name what they used to.
   */
  reconfigure(nextIds: readonly Id[]): number {
    const previousIndex = this.#selection.settledIndex;
    const previousId = this.#items.at(previousIndex);
    this.#items.replace(nextIds, "coverflow item");
    const nextIndex = resolvePreservedIndex(this.#items, previousId, previousIndex);
    // The rebuilt selection already treats the preserved item as announced, so a reconfiguration
    // never speaks for a change the user did not make.
    this.#selection = new SettledSelection(nextIndex, this.#items.size);
    this.#physicalIndex = nextIndex;
    this.#visualIndex = nextIndex;
    this.#commandIndex = nextIndex;
    this.#announcementIndex = null;
    return nextIndex;
  }

  get state(): CoverflowModelState {
    return {
      physicalIndex: this.#physicalIndex,
      visualIndex: this.#visualIndex,
      settledIndex: this.#selection.settledIndex,
      pendingTargetIndex: this.#selection.pendingTargetIndex,
      commandIndex: this.#commandIndex,
      announcementIndex: this.#announcementIndex,
      canPrevious: this.#commandIndex > 0,
      canNext: this.#commandIndex >= 0 && this.#commandIndex < this.itemCount - 1,
    };
  }

  update(input: CoverflowSnapshotInput): CoverflowModelState {
    if (this.itemCount === 0) return this.state;
    const maximumIndex = this.itemCount - 1;
    this.#physicalIndex = clamp(
      Number.isFinite(input.physicalIndex) ? input.physicalIndex : 0,
      0,
      maximumIndex,
    );
    this.#visualIndex = resolveHystereticIndex(
      this.#physicalIndex,
      this.#visualIndex,
      this.itemCount,
    );
    this.#announcementIndex = this.#selection.update({
      phase: input.phase,
      targetIndex: input.targetIndex,
      activeIndex: input.nearestIndex,
    });
    this.#commandIndex = clamp(input.targetIndex ?? input.nearestIndex, 0, maximumIndex);
    return this.state;
  }

  /**
   * One named destination. A rail may travel any distance, so this is never a synchronization.
   *
   * An index that names no item is refused rather than clamped: a rail asked to go somewhere that
   * does not exist must not answer by going to item zero.
   */
  resolveNavigationCommand(index: number, context: { readonly owned: boolean }): CoverflowCommand {
    if (context.owned || !this.#items.contains(index)) return { kind: "none" };
    if (index === this.#commandIndex) return { kind: "none" };
    return { kind: "move", targetIndex: index };
  }

  resolveRelativeCommand(
    direction: -1 | 1,
    context: { readonly owned: boolean },
  ): CoverflowCommand {
    if (this.itemCount === 0) return { kind: "none" };
    return this.resolveNavigationCommand(
      resolveAdjacentIndex(this.#commandIndex, direction, this.itemCount),
      context,
    );
  }

  /**
   * Adopts a destination without travelling to it, and never announces a change it did not make.
   *
   * The durable selection is rebased in one operation, so the very next snapshot may be a drag or a
   * settle without reviving the destination the rail has already left. An announced adoption
   * publishes its announcement here, because a direct adoption is not travel and there is no later
   * arrival at which it would become true.
   *
   * Returns the adopted index, or `-1` when the index names no item and nothing was adopted.
   */
  synchronize(index: number, options: SettledSelectionAdoption = {}): number {
    if (!this.#items.contains(index)) return -1;
    this.#physicalIndex = index;
    this.#visualIndex = index;
    this.#commandIndex = index;
    this.#announcementIndex = this.#selection.adopt(index, options);
    return index;
  }
}
