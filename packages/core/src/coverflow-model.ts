import { clamp } from "./bounds";
import {
  resolveAdjacentIndex,
  resolveHystereticIndex,
  SettledSelection,
  type SettledSelectionUpdate,
} from "./selection";

export interface CoverflowModelOptions {
  readonly itemCount: number;
  /** Defaults to the middle of the rail, which is where a coverflow reads as a coverflow. */
  readonly initialIndex?: number;
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
export class CoverflowModel {
  readonly itemCount: number;

  readonly #selection: SettledSelection;
  #physicalIndex: number;
  #visualIndex: number;
  #settledIndex: number;
  #pendingTargetIndex: number | null = null;
  #commandIndex: number;
  #announcementIndex: number | null = null;
  #suppressedAnnouncementIndex: number | undefined;

  constructor(options: CoverflowModelOptions) {
    const itemCount = Math.max(0, Math.trunc(options.itemCount));
    const initialIndex = clamp(
      Math.trunc(options.initialIndex ?? Math.floor(itemCount / 2)),
      0,
      Math.max(0, itemCount - 1),
    );
    this.itemCount = itemCount;
    this.#selection = new SettledSelection(initialIndex, itemCount);
    this.#physicalIndex = initialIndex;
    this.#visualIndex = initialIndex;
    this.#settledIndex = initialIndex;
    this.#commandIndex = initialIndex;
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

  /** One named destination. A rail may travel any distance, so this is never a synchronization. */
  resolveNavigationCommand(index: number, context: { readonly owned: boolean }): CoverflowCommand {
    if (context.owned || this.itemCount === 0) return { kind: "none" };
    const targetIndex = clamp(index, 0, this.itemCount - 1);
    if (targetIndex === this.#commandIndex) return { kind: "none" };
    return { kind: "move", targetIndex };
  }

  resolveRelativeCommand(
    direction: -1 | 1,
    context: { readonly owned: boolean },
  ): CoverflowCommand {
    return this.resolveNavigationCommand(
      resolveAdjacentIndex(this.#commandIndex, direction, this.itemCount),
      context,
    );
  }

  /** Adopts a destination without travelling to it, and never announces a change it did not make. */
  synchronize(index: number, options: { readonly announce?: boolean } = {}): number {
    const targetIndex = clamp(index, 0, Math.max(0, this.itemCount - 1));
    this.#physicalIndex = targetIndex;
    this.#visualIndex = targetIndex;
    this.#settledIndex = targetIndex;
    this.#commandIndex = targetIndex;
    this.#pendingTargetIndex = null;
    this.#selection.pendingTargetIndex = null;
    if (options.announce !== true) this.#suppressedAnnouncementIndex = targetIndex;
    this.#announcementIndex = null;
    return targetIndex;
  }
}
