import {
  createStackedDeckFrame,
  createStackedDeckTraversal,
  resolveStackedDeckFrame,
  resolveStackedDeckTraversal,
  resolveStackedDeckTuning,
  type MutableStackedDeckTraversal,
  type StackedDeckFrame,
} from "@snap-motion/core";
import { describe, expect, it } from "vitest";

import {
  isStackedDeckAuthorityStable,
  isStackedDeckInspectEligible,
  resolveStackedDeckCommandOrigin,
} from "../src/demos/stackedDeckInteraction";

const ITEM_COUNT = 5;
const TUNING = resolveStackedDeckTuning({ stageWidth: 1_120, stageHeight: 620 });

function deckAt(
  physicalIndex: number,
  options: {
    controllerPhase?: "dragging" | "idle" | "settling";
    state?: MutableStackedDeckTraversal;
  } = {},
): StackedDeckFrame {
  const state = options.state ?? createStackedDeckTraversal(2, ITEM_COUNT);
  const traversal = resolveStackedDeckTraversal(
    {
      controllerPhase: options.controllerPhase ?? "settling",
      itemCount: ITEM_COUNT,
      physicalIndex,
      settledIndex: state.settledIndex,
      traversalBounds: { minIndex: 1, maxIndex: 3 },
    },
    state,
  );
  return resolveStackedDeckFrame(
    { itemCount: ITEM_COUNT, traversal, tuning: TUNING },
    createStackedDeckFrame(ITEM_COUNT),
  );
}

function inspect(frame: StackedDeckFrame, index: number, overrides = {}) {
  return isStackedDeckInspectEligible({
    dragging: false,
    frame,
    galleryOpen: false,
    index,
    pointerOwned: false,
    ...overrides,
  });
}

describe("stacked deck interaction lifecycle", () => {
  it("treats identity as contested for exactly as long as two faces are drawn", () => {
    const state = createStackedDeckTraversal(2, ITEM_COUNT);
    // Mid-exchange: authority has moved to the incoming card, but the outgoing one is still there.
    const contested = deckAt(2.7, { state });
    expect(contested.authoritativeIndex).toBe(3);
    expect(contested.poses[2]!.visible).toBe(true);
    expect(isStackedDeckAuthorityStable(contested)).toBe(false);

    // Fully dissolved: one card, already parked. Residual travel toward the anchor is irrelevant.
    const uncontested = deckAt(2.95, { state });
    expect(uncontested.authoritativeIndex).toBe(3);
    expect(uncontested.poses[2]!.visible).toBe(false);
    expect(uncontested.poses.filter((pose) => pose.visible)).toHaveLength(1);
    expect(isStackedDeckAuthorityStable(uncontested)).toBe(true);

    // Rest is stable, and so is a segment resting exactly on its own anchor.
    expect(isStackedDeckAuthorityStable(deckAt(3, { controllerPhase: "idle", state }))).toBe(true);
    // Overdrag holds its single card off the anchor, so it is deliberately not stable.
    const stretched = deckAt(3.4, { state });
    expect(stretched.phase).toBe("elastic");
    expect(isStackedDeckAuthorityStable(stretched)).toBe(false);
  });

  it("makes inspection follow authority and ownership, never mechanical rest", () => {
    const state = createStackedDeckTraversal(2, ITEM_COUNT);
    const settling = deckAt(2.95, { state });
    // Still settling, and eligible: the card is unambiguous and nothing holds the surface.
    expect(inspect(settling, 3)).toBe(true);
    // Only the authoritative card is ever inspectable.
    expect(inspect(settling, 2)).toBe(false);
    expect(inspect(settling, 4)).toBe(false);
    // Physical ownership and an open gallery still disqualify it.
    expect(inspect(settling, 3, { dragging: true })).toBe(false);
    expect(inspect(settling, 3, { pointerOwned: true })).toBe(false);
    expect(inspect(settling, 3, { galleryOpen: true })).toBe(false);
    // A visible exchange does too.
    expect(inspect(deckAt(2.7, { state: createStackedDeckTraversal(2, ITEM_COUNT) }), 3)).toBe(
      false,
    );
  });

  it("steps relative commands from the committed destination, coalescing ambiguous input", () => {
    // Nothing in flight: the command steps from the card the user is looking at.
    expect(resolveStackedDeckCommandOrigin(2, null)).toBe(2);
    // In flight: the deck has answered, so the next distinct command steps from that answer.
    expect(resolveStackedDeckCommandOrigin(2, 3)).toBe(3);
    expect(resolveStackedDeckCommandOrigin(3, 3)).toBe(3);
    // A destination behind the authoritative card is still the destination.
    expect(resolveStackedDeckCommandOrigin(3, 2)).toBe(2);
  });
});
