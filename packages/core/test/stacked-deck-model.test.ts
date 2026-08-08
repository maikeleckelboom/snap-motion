import { describe, expect, it } from "vitest";

import {
  STACKED_DECK_ANCHOR_SKIP,
  StackedDeckModel,
  type StackedDeckSnapshotInput,
} from "../src/stacked-deck-model";
import {
  createStackedDeckFrame,
  createStackedDeckTraversal,
  isStackedDeckAuthorityStable,
  resolveStackedDeckFrame,
  resolveStackedDeckTraversal,
  resolveStackedDeckTuning,
} from "../src/stackedDeck";

const ITEM_COUNT = 5;
const DECK_IDS = ["a", "b", "c", "d", "e"] as const;
type DeckId = (typeof DECK_IDS)[number];
const TUNING = resolveStackedDeckTuning({ stageWidth: 1_120, stageHeight: 620 });

function model(initialIndex = 2) {
  return new StackedDeckModel<DeckId>({ ids: DECK_IDS, initialId: DECK_IDS[initialIndex]! });
}

/** One controller snapshot. Anything not stated is what an unattended deck would report. */
function snapshot(
  physicalIndex: number,
  overrides: Partial<StackedDeckSnapshotInput> = {},
): StackedDeckSnapshotInput {
  return {
    phase: "dragging",
    physicalIndex,
    targetIndex: null,
    nearestIndex: Math.round(physicalIndex),
    ...overrides,
  };
}

/** Rest exactly on one card, which is the only thing that publishes a durable selection. */
function restAt(index: number): StackedDeckSnapshotInput {
  return { phase: "idle", physicalIndex: index, targetIndex: index, nearestIndex: index };
}

describe("stacked deck authority stability", () => {
  it("treats identity as contested for exactly as long as two faces are drawn", () => {
    const storage = createStackedDeckTraversal(2, ITEM_COUNT);
    const frameStorage = createStackedDeckFrame(ITEM_COUNT);
    const at = (physicalIndex: number, phase: "dragging" | "idle" | "settling" = "settling") => {
      const traversal = resolveStackedDeckTraversal(
        {
          controllerPhase: phase,
          itemCount: ITEM_COUNT,
          physicalIndex,
          settledIndex: 2,
          traversalBounds: { minIndex: 1, maxIndex: 3 },
        },
        storage,
      );
      return resolveStackedDeckFrame(
        { itemCount: ITEM_COUNT, traversal, tuning: TUNING },
        frameStorage,
      );
    };

    // Mid-exchange: authority has moved to the incoming card, but the outgoing one is still there.
    const contested = at(2.7);
    expect(contested.authoritativeIndex).toBe(3);
    expect(contested.poses[2]!.visible).toBe(true);
    expect(isStackedDeckAuthorityStable(contested)).toBe(false);

    // Fully dissolved: one card, already parked. Residual travel toward the anchor is irrelevant.
    const uncontested = at(2.95);
    expect(uncontested.authoritativeIndex).toBe(3);
    expect(uncontested.poses[2]!.visible).toBe(false);
    expect(uncontested.poses.filter((pose) => pose.visible)).toHaveLength(1);
    expect(isStackedDeckAuthorityStable(uncontested)).toBe(true);

    // Rest is stable, and so is a segment resting exactly on its own anchor.
    expect(isStackedDeckAuthorityStable(at(3, "idle"))).toBe(true);
    // Overdrag holds its single card off the anchor, so it is deliberately not stable.
    const stretched = at(3.4);
    expect(stretched.phase).toBe("elastic");
    expect(isStackedDeckAuthorityStable(stretched)).toBe(false);
  });

  it("makes inspection follow authority and ownership, never mechanical rest", () => {
    const deck = model();
    deck.beginInteraction();
    deck.update(snapshot(2.95, { phase: "settling", targetIndex: 3 }));

    // Still settling, and eligible: the card is unambiguous and nothing holds the surface.
    expect(deck.state.currentIndex).toBe(3);
    expect(deck.isInspectEligible({ index: 3, owned: false })).toBe(true);
    // Only the authoritative card is ever inspectable.
    expect(deck.isInspectEligible({ index: 2, owned: false })).toBe(false);
    expect(deck.isInspectEligible({ index: 4, owned: false })).toBe(false);
    // Physical ownership still disqualifies it.
    expect(deck.isInspectEligible({ index: 3, owned: true })).toBe(false);

    // A visible exchange does too.
    deck.update(snapshot(2.7, { phase: "settling", targetIndex: 3 }));
    expect(deck.isInspectEligible({ index: 3, owned: false })).toBe(false);
  });
});

describe("stacked deck interaction envelope", () => {
  it("bounds one interaction to one adjacent card however far it travels", () => {
    const deck = model();
    expect(deck.traversalBounds).toBeUndefined();

    expect(deck.beginInteraction()).toBe(2);
    expect(deck.traversalBounds).toEqual({
      minIndex: 2 - STACKED_DECK_ANCHOR_SKIP,
      maxIndex: 2 + STACKED_DECK_ANCHOR_SKIP,
    });

    deck.update(snapshot(3));
    expect(deck.state.visualTopIndex).toBe(3);

    // Four cards of travel inside one interaction still exposes exactly one adjacent card.
    const far = deck.update(snapshot(6));
    expect(far.visualTopIndex).toBe(3);
    expect(far.traversal.phase).toBe("elastic");
    expect(far.traversal.segmentTargetIndex).toBeNull();
    expect(far.currentIndex).toBe(3);
  });

  it("reverses freely inside its own envelope but never past it", () => {
    const deck = model();
    deck.beginInteraction();
    expect(deck.update(snapshot(3)).visualTopIndex).toBe(3);
    expect(deck.update(snapshot(1)).visualTopIndex).toBe(1);
    expect(deck.update(snapshot(-2)).traversal.phase).toBe("elastic");
    expect(deck.state.visualTopIndex).toBe(1);
  });

  it("lets the next interaction start from the card already on top", () => {
    const deck = model();
    deck.beginInteraction();
    deck.update(snapshot(2.95, { phase: "settling", targetIndex: 3 }));
    // Re-grabbing mid-settlement measures from the card the eye already reads as current.
    expect(deck.beginInteraction()).toBe(3);
    expect(deck.traversalBounds).toEqual({ minIndex: 2, maxIndex: 4 });
  });

  it("frees the projection again once the interaction ends", () => {
    const deck = model();
    deck.beginInteraction();
    deck.endInteraction();
    expect(deck.traversalBounds).toBeUndefined();
  });
});

describe("stacked deck command policy", () => {
  it("steps one adjacent card from the destination already committed to", () => {
    const deck = model();
    expect(deck.resolveRelativeCommand(1, { owned: false })).toEqual({
      kind: "traverse",
      originIndex: 2,
      targetIndex: 3,
    });

    // Committed to 3: the next distinct command chains from there rather than repeating.
    deck.update(snapshot(2.2, { phase: "settling", targetIndex: 3, nearestIndex: 2 }));
    expect(deck.state.pendingTargetIndex).toBe(3);
    expect(deck.resolveRelativeCommand(1, { owned: false })).toEqual({
      kind: "traverse",
      originIndex: 3,
      targetIndex: 4,
    });
  });

  it("refuses relative travel at a boundary and while an input device holds the deck", () => {
    const deck = model(0);
    deck.update(restAt(0));
    expect(deck.resolveRelativeCommand(-1, { owned: false })).toEqual({ kind: "none" });
    expect(deck.resolveRelativeCommand(1, { owned: true })).toEqual({ kind: "none" });
    expect(deck.state.canPrevious).toBe(false);
    expect(deck.state.canNext).toBe(true);
  });

  it("treats an adjacent destination as one throw and anything further as a synchronization", () => {
    const deck = model();
    deck.update(restAt(2));
    expect(deck.resolveAbsoluteCommand(3, { owned: false, atRest: true })).toEqual({
      kind: "traverse",
      originIndex: 2,
      targetIndex: 3,
    });
    expect(deck.resolveAbsoluteCommand(0, { owned: false, atRest: true })).toEqual({
      kind: "synchronize",
      targetIndex: 0,
      announce: true,
    });
    // The current card is a no-op only when there is nothing left to settle.
    expect(deck.resolveAbsoluteCommand(2, { owned: false, atRest: true })).toEqual({
      kind: "none",
    });
    expect(deck.resolveAbsoluteCommand(2, { owned: false, atRest: false })).toEqual({
      kind: "synchronize",
      targetIndex: 2,
      announce: true,
    });
    // A held deck cannot be thrown by a command, but it can still be synchronized to a destination.
    expect(deck.resolveAbsoluteCommand(3, { owned: true, atRest: false })).toEqual({
      kind: "synchronize",
      targetIndex: 3,
      announce: true,
    });
  });
});

describe("stacked deck announcements", () => {
  it("announces only durable settlement, never a transient visual top", () => {
    const deck = model();
    deck.beginInteraction();
    expect(deck.update(snapshot(2.7)).announcementIndex).toBeNull();
    expect(
      deck.update(snapshot(2.95, { phase: "settling", targetIndex: 3 })).announcementIndex,
    ).toBeNull();
    expect(deck.update(restAt(3)).announcementIndex).toBe(3);
    expect(deck.update(restAt(3)).announcementIndex).toBeNull();
  });

  it("keeps a silent synchronization silent and an asked-for one immediate", () => {
    const deck = model();
    deck.synchronize(4);
    expect(deck.state.settledIndex).toBe(4);
    expect(deck.state.currentIndex).toBe(4);
    expect(deck.state.interactionOriginIndex).toBeNull();
    expect(deck.update(restAt(4)).announcementIndex).toBeNull();

    deck.synchronize(0, { announce: true });
    expect(deck.update(restAt(0)).announcementIndex).toBe(0);
  });

  it("refuses a synchronization to an index that names no card", () => {
    const deck = model();
    expect(deck.synchronize(99)).toBe(-1);
    expect(deck.synchronize(-4)).toBe(-1);
    expect(deck.state.settledIndex).toBe(2);
  });
});

describe("empty stacked deck", () => {
  it("resolves nothing rather than inventing an item", () => {
    const deck = new StackedDeckModel<DeckId>({ ids: [] });
    expect(deck.traversalBounds).toBeUndefined();
    expect(deck.resolveRelativeCommand(1, { owned: false })).toEqual({ kind: "none" });
    expect(deck.resolveAbsoluteCommand(0, { owned: false, atRest: true })).toEqual({
      kind: "none",
    });
    expect(deck.isInspectEligible({ index: 0, owned: false })).toBe(false);
  });
});
