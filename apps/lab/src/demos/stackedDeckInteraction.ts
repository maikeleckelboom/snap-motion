import type { StackedDeckFrame } from "@snap-motion/core";

/**
 * The stacked deck's interaction lifecycle, kept separate from the compositor it reads.
 *
 * Three concepts the deck used to conflate live here explicitly:
 *
 * - **Physical ownership** — an input device is currently driving the deck. Only ownership can
 *   refuse a competing input.
 * - **Interaction authority** — which card the user is acting on. `StackedDeckTraversal` resolves
 *   it from the same dissolve the compositor paints, so it migrates to the incoming card the moment
 *   the outgoing one stops being rendered, well before the controller reaches the anchor.
 * - **Mechanical rest** — the spring has stopped. It governs durable selection and announcements,
 *   and nothing else: a spring tail the user cannot see must never disable an action.
 */

export interface StackedDeckInspectInput {
  readonly dragging: boolean;
  readonly frame: StackedDeckFrame;
  readonly galleryOpen: boolean;
  readonly index: number;
  readonly pointerOwned: boolean;
}

/**
 * True when the deck renders exactly one content card, so its identity cannot be contested.
 *
 * This is read straight off the rendered frame rather than re-derived: a handoff draws two faces
 * until the outgoing one is fully dissolved, and by that point the promotion curve has already
 * parked the incoming card within a fraction of a pixel of rest. That is why remaining spring
 * travel is not disqualifying — exact synchronization from here cannot move anything the eye can
 * follow. Elastic overdrag is excluded because its single card is deliberately held off its anchor.
 */
export function isStackedDeckAuthorityStable(frame: StackedDeckFrame): boolean {
  if (frame.phase !== "traversing") return frame.phase !== "elastic";
  return frame.poses[frame.visualTopIndex]?.visible === false;
}

/**
 * Inspection eligibility. It asks whether the named card is unambiguously the current one and
 * whether anything else is holding the surface — never whether the controller has reached rest.
 */
export function isStackedDeckInspectEligible(input: StackedDeckInspectInput): boolean {
  return (
    !input.galleryOpen &&
    !input.dragging &&
    !input.pointerOwned &&
    input.frame.authoritativeIndex === input.index &&
    isStackedDeckAuthorityStable(input.frame)
  );
}

/**
 * The card a relative command steps from.
 *
 * A throw acts on the card under the hand, but Previous/Next name a semantic neighbour, so they
 * step from the destination the deck has already committed to. That is what lets distinct rapid
 * taps chain one card each instead of all resolving to the same neighbour — while keeping every
 * single command exactly one adjacent card from its own origin.
 *
 * `pendingTargetIndex` is only published once the deck has acknowledged the previous command, so
 * commands issued inside one event-loop turn share an origin and coalesce, which is the correct
 * reading of input that arrived before the deck could answer the first.
 */
export function resolveStackedDeckCommandOrigin(
  authoritativeIndex: number,
  pendingTargetIndex: number | null,
): number {
  return pendingTargetIndex ?? authoritativeIndex;
}
