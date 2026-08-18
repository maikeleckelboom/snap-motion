import { clamp } from "./bounds";
import { PAGINATION_INDICATOR_TUNING } from "./pagination";
import type { ControllerPhase } from "./types";

export interface SettledSelectionUpdate {
  readonly phase: ControllerPhase;
  /** Index the controller is settling toward, or `null` when it is not settling. */
  readonly targetIndex: number | null;
  /** Index of the controller's nearest anchor. */
  readonly activeIndex: number;
}

export interface SettledSelectionAdoption {
  /**
   * Whether this adoption is itself the change to report.
   *
   * A silent adoption is a change some other surface already made and already announced. An
   * announced one is a navigation this surface was asked for, and because a direct adoption is not
   * a traversal there is no later moment at which it would become true — so it is reported here.
   */
  readonly announce?: boolean | undefined;
}

/**
 * Durable selection for a snapping surface, separated from whatever the surface currently draws.
 *
 * Two things a presentation constantly conflates live here explicitly: the selection a route,
 * a caption, or an announcement may rely on — which changes only at mechanical rest — and the
 * destination the surface is already committed to, which a relative command must step from so
 * distinct rapid commands chain one item each instead of all resolving to the same neighbour.
 *
 * An empty collection has no selection, and says so with `-1` rather than by naming an item that
 * does not exist. That is the same answer the ordinal primitives above this class already give.
 */
export class SettledSelection {
  settledIndex: number;
  pendingTargetIndex: number | null = null;

  readonly #itemCount: number;
  #lastAnnouncedIndex: number;
  #settlingTargetIndex: number | null = null;

  constructor(initialIndex: number, itemCount: number) {
    this.#itemCount = Math.max(0, itemCount);
    this.settledIndex = this.#resolve(initialIndex);
    this.#lastAnnouncedIndex = this.settledIndex;
  }

  /**
   * Returns the index to announce only when the controller reaches idle. Drag feedback,
   * intermediate items, obsolete targets, and autonomous retargets never write to the live region.
   */
  update(input: SettledSelectionUpdate): number | null {
    if (this.#itemCount === 0) return null;

    if (input.phase === "dragging") {
      this.pendingTargetIndex = null;
      this.#settlingTargetIndex = null;
      return null;
    }

    if (input.phase === "settling") {
      if (input.targetIndex !== this.#settlingTargetIndex) {
        this.#settlingTargetIndex = input.targetIndex;
        this.pendingTargetIndex = input.targetIndex;
      }
      return null;
    }

    this.pendingTargetIndex = null;
    this.#settlingTargetIndex = null;
    this.settledIndex = this.#resolve(input.activeIndex);
    if (this.settledIndex === this.#lastAnnouncedIndex) {
      return null;
    }

    this.#lastAnnouncedIndex = this.settledIndex;
    return this.settledIndex;
  }

  /**
   * Adopts a semantic destination outright: the selection simply *is* there from now on.
   *
   * This is one operation on purpose. Rebasing the durable selection without also retiring the
   * pending destination, the settling target, and what has already been announced leaves a machine
   * that agrees with the new destination only until its next snapshot — a drag or a settle then
   * restores the selection the surface has already moved away from, and the first idle repair
   * announces a change nobody made. Owning all four here is what makes a synchronization survive
   * whatever the controller reports next, with no repair pass in between.
   *
   * Returns the index to announce, or `null` when the adoption is silent.
   */
  adopt(index: number, options: SettledSelectionAdoption = {}): number | null {
    const adopted = this.#resolve(index);
    this.settledIndex = adopted;
    this.pendingTargetIndex = null;
    this.#settlingTargetIndex = null;
    this.#lastAnnouncedIndex = adopted;
    return options.announce === true && adopted >= 0 ? adopted : null;
  }

  #resolve(index: number): number {
    return this.#itemCount === 0 ? -1 : clamp(index, 0, this.#itemCount - 1);
  }
}

/** One semantic step, clamped to the collection. Boundaries return the index they started on. */
export function resolveAdjacentIndex(
  currentIndex: number,
  direction: -1 | 1,
  itemCount: number,
): number {
  return clamp(currentIndex + direction, 0, Math.max(0, itemCount - 1));
}

/**
 * The item a relative command steps from.
 *
 * A throw acts on the item under the hand, but Previous/Next name a semantic neighbour, so they
 * step from the destination the surface has already committed to. That is what lets distinct rapid
 * taps chain one item each — while keeping every single command exactly one adjacent item from its
 * own origin. A pending target is only published once the surface has acknowledged the previous
 * command, so commands issued inside one event-loop turn share an origin and coalesce, which is
 * the correct reading of input that arrived before the surface could answer the first.
 */
export function resolveCommandOriginIndex(
  currentIndex: number,
  pendingTargetIndex: number | null,
): number {
  return pendingTargetIndex ?? currentIndex;
}

/**
 * Follows the nearest physical item with a narrow dead band around the midpoint. The dead band is
 * symmetric, so a reversal retraces the same small threshold instead of retaining source authority.
 */
export function resolveHystereticIndex(
  physicalIndex: number,
  currentIndex: number,
  itemCount: number,
  hysteresis: number = PAGINATION_INDICATOR_TUNING.visualHysteresis,
): number {
  const maximumIndex = Math.max(0, itemCount - 1);
  const position = clamp(Number.isFinite(physicalIndex) ? physicalIndex : 0, 0, maximumIndex);
  let nextIndex = clamp(currentIndex, 0, maximumIndex);
  const boundary = 0.5 + hysteresis;

  while (nextIndex < maximumIndex && position >= nextIndex + boundary) {
    nextIndex += 1;
  }
  while (nextIndex > 0 && position <= nextIndex - boundary) {
    nextIndex -= 1;
  }
  return nextIndex;
}
