import { clamp } from "./bounds";
import { OrderedIdCollection, resolvePreservedIndex } from "./item-collection";
import {
  resolveAdjacentIndex,
  resolveHystereticIndex,
  SettledSelection,
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
  #settledIndex: number;
  #pendingTargetIndex: number | null = null;
  #commandIndex: number;
  #announcementIndex: number | null = null;
  #suppressedAnnouncementIndex: number | undefined;

  constructor(options: CoverflowModelOptions<Id>) {
    this.#items = new OrderedIdCollection(options.ids, "coverflow item");
    const initialIndex = this.#resolveInitialIndex(options.initialId);
    this.#selection = new SettledSelection(Math.max(0, initialIndex), this.#items.size);
    this.#physicalIndex = initialIndex;
    this.#visualIndex = initialIndex;
    this.#settledIndex = initialIndex;
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
    const previousId = this.#items.at(this.#settledIndex);
    const previousIndex = this.#settledIndex;
    this.#items.replace(nextIds, "coverflow item");
    const nextIndex = resolvePreservedIndex(this.#items, previousId, previousIndex);
    this.#selection = new SettledSelection(Math.max(0, nextIndex), this.#items.size);
    this.#physicalIndex = nextIndex;
    this.#visualIndex = nextIndex;
    this.#settledIndex = nextIndex;
    this.#commandIndex = nextIndex;
    this.#pendingTargetIndex = null;
    this.#announcementIndex = null;
    this.#suppressedAnnouncementIndex = undefined;
    return nextIndex;
  }

  get state(): CoverflowModelState {
    return {
      physicalIndex: this.#physicalIndex,
      visualIndex: this.#visualIndex,
      settledIndex: this.#settledIndex,
      pendingTargetIndex: this.#pendingTargetIndex,
      commandIndex: this.#commandIndex,
      announcementIndex: this.#announcementIndex,
      canPrevious: this.#commandIndex > 0,
      canNext: this.#commandIndex < this.itemCount - 1,
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
    const announcement = this.#selection.update({
      phase: input.phase,
      targetIndex: input.targetIndex,
      activeIndex: input.nearestIndex,
    });
    this.#settledIndex = this.#selection.settledIndex;
    this.#pendingTargetIndex = this.#selection.pendingTargetIndex;
    this.#commandIndex = clamp(input.targetIndex ?? input.nearestIndex, 0, maximumIndex);

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

  /** The same policy, named semantically. Returns `{ kind: "none" }` for an unknown item. */
  resolveIdCommand(id: Id, context: { readonly owned: boolean }): CoverflowCommand {
    return this.resolveNavigationCommand(this.#items.indexOf(id), context);
  }

  /**
   * Adopts a destination without travelling to it, and never announces a change it did not make.
   * Returns the adopted index, or `-1` when the index names no item and nothing was adopted.
   */
  synchronize(index: number, options: { readonly announce?: boolean } = {}): number {
    if (!this.#items.contains(index)) return -1;
    this.#physicalIndex = index;
    this.#visualIndex = index;
    this.#settledIndex = index;
    this.#commandIndex = index;
    this.#pendingTargetIndex = null;
    this.#selection.pendingTargetIndex = null;
    if (options.announce !== true) this.#suppressedAnnouncementIndex = index;
    this.#announcementIndex = null;
    return index;
  }

  #resolveInitialIndex(initialId: Id | undefined): number {
    if (this.#items.size === 0) return -1;
    if (initialId === undefined) return Math.floor(this.#items.size / 2);
    const index = this.#items.indexOf(initialId);
    if (index < 0) throw new RangeError(`initialId must identify a coverflow item: ${initialId}`);
    return index;
  }
}
