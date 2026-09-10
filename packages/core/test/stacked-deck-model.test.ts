import { describe, expect, it } from "vitest";

import {
  createStackedDeckFrame,
  createStackedDeckTraversal,
  resolveStackedDeckDepth,
  resolveStackedDeckFrame,
  resolveStackedDeckNeighbor,
  resolveStackedDeckOrder,
  resolveStackedDeckTraversal,
  resolveStackedDeckTuning,
  type StackedDeckDirectProjection,
  type StackedDeckSnapshotInput,
  StackedDeckModel,
} from "../src";

const IDS = ["a", "b", "c", "d", "e"] as const;
type Id = (typeof IDS)[number];
const TUNING = resolveStackedDeckTuning({ stageWidth: 1_120, stageHeight: 620 });
const SAMPLES = [0.05, 0.2, 0.49, 0.5, 0.73, 0.95] as const;

function model(initialIndex = 2, ids: readonly Id[] = IDS) {
  const initialId = ids[initialIndex];
  return new StackedDeckModel<Id>({
    ids,
    ...(initialId === undefined ? {} : { initialId }),
  });
}

function snapshot(
  physicalPosition: number,
  overrides: Partial<StackedDeckSnapshotInput> = {},
): StackedDeckSnapshotInput {
  return {
    phase: "dragging",
    physicalPosition,
    targetIndex: null,
    nearestIndex: 2,
    ...overrides,
  };
}

function restAt(index: number): StackedDeckSnapshotInput {
  return { phase: "idle", physicalPosition: 0, targetIndex: index, nearestIndex: index };
}

function normalizedFrame(
  originIndex: number,
  direction: -1 | 1,
  progress: number,
  exchange: "shuffle" | "direct",
): readonly Record<string, number | string | boolean>[] {
  const targetIndex = resolveStackedDeckNeighbor(originIndex, direction, IDS.length);
  const traversal = resolveStackedDeckTraversal(
    {
      controllerPhase: "dragging",
      itemCount: IDS.length,
      originIndex,
      physicalPosition: direction * progress,
      settledIndex: originIndex,
    },
    createStackedDeckTraversal(originIndex, IDS.length),
  );
  const direct: StackedDeckDirectProjection | undefined =
    exchange === "direct"
      ? {
          direction,
          originIndex,
          phase: "held",
          settlement: 0,
          signedTravel: direction * progress,
          targetIndex,
          translateX: -direction * progress * TUNING.motionPitch,
          translateY: progress * 70,
        }
      : undefined;
  const frame = resolveStackedDeckFrame(
    {
      itemCount: IDS.length,
      traversal,
      tuning: TUNING,
      ...(direct === undefined ? {} : { direct }),
    },
    createStackedDeckFrame(IDS.length),
  );
  return resolveStackedDeckOrder(originIndex, IDS.length).map((itemIndex) => {
    const pose = frame.poses[itemIndex]!;
    return {
      depth: resolveStackedDeckDepth(originIndex, itemIndex, IDS.length),
      interactive: pose.interactive,
      layer: pose.layer,
      opacity: Number(pose.opacity.toFixed(8)),
      role: pose.role,
      rotate: Number(pose.rotate.toFixed(8)),
      scale: Number(pose.scale.toFixed(8)),
      shadowStrength: Number(pose.shadowStrength.toFixed(8)),
      translateX: Number(pose.translateX.toFixed(8)),
      translateY: Number(pose.translateY.toFixed(8)),
      visible: pose.visible,
    };
  });
}

function perform(deck: StackedDeckModel<Id>, direction: -1 | 1): Id {
  const command = deck.resolveRelativeCommand(direction, { owned: false });
  expect(command.kind).toBe("traverse");
  if (command.kind !== "traverse") throw new Error("expected traversal");
  deck.openInteraction(command.originIndex, command.direction);
  deck.update(
    snapshot(direction, {
      phase: "settling",
      targetIndex: command.targetIndex,
      nearestIndex: command.targetIndex,
    }),
  );
  deck.update(restAt(command.targetIndex));
  deck.endInteraction();
  return deck.idAt(command.targetIndex)!;
}

describe("Stacked Deck canonical ring", () => {
  it("resolves cyclic neighbours and rotated physical order", () => {
    expect(IDS.map((_id, index) => resolveStackedDeckNeighbor(index, 1, IDS.length))).toEqual([
      1, 2, 3, 4, 0,
    ]);
    expect(IDS.map((_id, index) => resolveStackedDeckNeighbor(index, -1, IDS.length))).toEqual([
      4, 0, 1, 2, 3,
    ]);
    expect(resolveStackedDeckOrder(2, IDS.length)).toEqual([2, 3, 4, 0, 1]);
    expect(resolveStackedDeckOrder(4, IDS.length)).toEqual([4, 0, 1, 2, 3]);
    expect(IDS.map((_id, index) => resolveStackedDeckDepth(2, index, IDS.length))).toEqual([
      3, 4, 0, 1, 2,
    ]);
  });

  it("makes forward and backward exact topology inverses from every ordinal", () => {
    for (let start = 0; start < IDS.length; start += 1) {
      const forward = resolveStackedDeckNeighbor(start, 1, IDS.length);
      const restored = resolveStackedDeckNeighbor(forward, -1, IDS.length);
      expect(restored).toBe(start);
      expect(resolveStackedDeckOrder(restored, IDS.length)).toEqual(
        resolveStackedDeckOrder(start, IDS.length),
      );
    }
  });

  it("keeps interior and ordinal-wrap geometry equivalent after identity remapping", () => {
    for (const exchange of ["shuffle", "direct"] as const) {
      for (const direction of [-1, 1] as const) {
        const interiorOrigin = direction === 1 ? 2 : 3;
        const wrapOrigin = direction === 1 ? 4 : 0;
        for (const progress of SAMPLES) {
          expect(normalizedFrame(wrapOrigin, direction, progress, exchange)).toEqual(
            normalizedFrame(interiorOrigin, direction, progress, exchange),
          );
        }
      }
    }
  });
});

describe("Stacked Deck local traversal", () => {
  it("treats wrapped neighbours as one local pitch in both directions", () => {
    for (const [originIndex, direction, targetIndex] of [
      [4, 1, 0],
      [0, -1, 4],
    ] as const) {
      const crossing = resolveStackedDeckTraversal(
        {
          controllerPhase: "dragging",
          itemCount: IDS.length,
          originIndex,
          physicalPosition: direction * 0.7,
          settledIndex: originIndex,
        },
        createStackedDeckTraversal(originIndex, IDS.length),
      );
      expect(crossing).toMatchObject({
        direction,
        segmentOriginIndex: originIndex,
        segmentTargetIndex: targetIndex,
        visualTopIndex: originIndex,
      });
      expect(crossing.authoritativeIndex).toBe(targetIndex);
    }
  });

  it("consumes one card and turns all remaining travel into finite overdrag", () => {
    const overdrag = resolveStackedDeckTraversal(
      {
        controllerPhase: "dragging",
        itemCount: IDS.length,
        originIndex: 4,
        physicalPosition: 8,
        settledIndex: 4,
      },
      createStackedDeckTraversal(4, IDS.length),
    );
    expect(overdrag).toMatchObject({
      authoritativeIndex: 0,
      phase: "elastic",
      segmentTargetIndex: null,
      visualTopIndex: 0,
    });
    expect(overdrag.localProgress).toBe(1);
    expect(Number.isFinite(overdrag.signedLocalDistance)).toBe(true);
  });

  it("reverses through the origin without opening a second card", () => {
    const storage = createStackedDeckTraversal(4, IDS.length);
    const at = (physicalPosition: number) =>
      resolveStackedDeckTraversal(
        {
          controllerPhase: "dragging",
          itemCount: IDS.length,
          originIndex: 4,
          physicalPosition,
          settledIndex: 4,
        },
        storage,
      );
    expect(at(1.4).visualTopIndex).toBe(0);
    expect(at(0)).toMatchObject({ direction: 0, visualTopIndex: 4 });
    expect(at(-0.7)).toMatchObject({ direction: -1, segmentTargetIndex: 3 });
    expect(at(-5)).toMatchObject({ phase: "elastic", visualTopIndex: 3 });
  });
});

describe("Stacked Deck command semantics", () => {
  it("keeps next and previous available everywhere when more than one item exists", () => {
    for (let start = 0; start < IDS.length; start += 1) {
      const deck = model(start);
      expect(deck.state.canNext).toBe(true);
      expect(deck.state.canPrevious).toBe(true);
      expect(deck.resolveRelativeCommand(1, { owned: false })).toMatchObject({
        direction: 1,
        originIndex: start,
        targetIndex: (start + 1) % IDS.length,
      });
      expect(deck.resolveRelativeCommand(-1, { owned: false })).toMatchObject({
        direction: -1,
        originIndex: start,
        targetIndex: (start - 1 + IDS.length) % IDS.length,
      });
    }
  });

  it("keeps direction explicit for a two-item deck", () => {
    const deck = model(0, ["a", "b"]);
    expect(deck.resolveRelativeCommand(1, { owned: false })).toEqual({
      kind: "traverse",
      direction: 1,
      originIndex: 0,
      targetIndex: 1,
    });
    expect(deck.resolveRelativeCommand(-1, { owned: false })).toEqual({
      kind: "traverse",
      direction: -1,
      originIndex: 0,
      targetIndex: 1,
    });
    expect(deck.resolveAbsoluteCommand(1, { owned: false, atRest: true })).toEqual({
      kind: "synchronize",
      targetIndex: 1,
      announce: true,
    });

    for (const direction of [-1, 1] as const) {
      const directed = model(0, ["a", "b"]);
      directed.openInteraction(0, direction);
      expect(
        directed.update(snapshot(0, { phase: "settling", nearestIndex: 0, targetIndex: 1 }))
          .interactionDirection,
      ).toBe(direction);
    }
  });

  it("animates only unambiguous cyclic adjacency and synchronizes other named destinations", () => {
    const deck = model(4);
    expect(deck.resolveAbsoluteCommand(0, { owned: false, atRest: true })).toMatchObject({
      kind: "traverse",
      direction: 1,
      originIndex: 4,
      targetIndex: 0,
    });
    expect(deck.resolveAbsoluteCommand(3, { owned: false, atRest: true })).toMatchObject({
      kind: "traverse",
      direction: -1,
      originIndex: 4,
      targetIndex: 3,
    });
    expect(deck.resolveAbsoluteCommand(1, { owned: false, atRest: true })).toEqual({
      kind: "synchronize",
      targetIndex: 1,
      announce: true,
    });
  });

  it("refuses relative commands while owned and for empty or one-item decks", () => {
    expect(model().resolveRelativeCommand(1, { owned: true })).toEqual({ kind: "none" });
    for (const ids of [[], ["a"]] as const) {
      const deck = new StackedDeckModel<Id>({ ids });
      expect(deck.state.canNext).toBe(false);
      expect(deck.state.canPrevious).toBe(false);
      expect(deck.resolveRelativeCommand(1, { owned: false })).toEqual({ kind: "none" });
      expect(deck.resolveRelativeCommand(-1, { owned: false })).toEqual({ kind: "none" });
    }
  });

  it("cycles for more than one revolution without ring or scalar state drift", () => {
    const forward = model(0);
    expect(Array.from({ length: 7 }, () => perform(forward, 1))).toEqual([
      "b",
      "c",
      "d",
      "e",
      "a",
      "b",
      "c",
    ]);
    expect(forward.state.traversal.signedLocalDistance).toBe(0);
    expect(forward.state.interactionOriginIndex).toBeNull();

    const backward = model(0);
    expect(Array.from({ length: 7 }, () => perform(backward, -1))).toEqual([
      "e",
      "d",
      "c",
      "b",
      "a",
      "e",
      "d",
    ]);
    expect(backward.state.traversal.signedLocalDistance).toBe(0);
  });
});

describe("Stacked Deck selection, authority, and reconfiguration", () => {
  it("publishes visual authority at crossover and durable selection only at rest", () => {
    const deck = model(4);
    deck.beginInteraction();
    expect(deck.update(snapshot(0.4, { nearestIndex: 4 })).currentIndex).toBe(4);
    const crossed = deck.update(
      snapshot(0.7, { phase: "settling", targetIndex: 0, nearestIndex: 0 }),
    );
    expect(crossed.currentIndex).toBe(0);
    expect(crossed.settledIndex).toBe(4);
    expect(crossed.interactionDirection).toBe(1);
    expect(deck.isInspectEligible({ index: 0, owned: false })).toBe(true);
    expect(deck.update(restAt(0)).announcementIndex).toBe(0);
  });

  it("chains rapid commands from the pending cyclic target", () => {
    const deck = model(4);
    deck.update(snapshot(0.2, { phase: "settling", targetIndex: 0, nearestIndex: 4 }));
    expect(deck.resolveRelativeCommand(1, { owned: false })).toMatchObject({
      direction: 1,
      originIndex: 0,
      targetIndex: 1,
    });
  });

  it("preserves semantic current ID and rebuilds canonical order after additions and reorder", () => {
    const deck = model(2);
    expect(deck.idAt(deck.state.currentIndex)).toBe("c");
    expect(deck.reconfigure(["a", "b", "c", "d", "e"])).toBe(2);
    expect(
      resolveStackedDeckOrder(deck.state.currentIndex, deck.itemCount).map((i) => deck.idAt(i)),
    ).toEqual(["c", "d", "e", "a", "b"]);
    expect(deck.reconfigure(["e", "c", "a", "d", "b"])).toBe(1);
    expect(
      resolveStackedDeckOrder(deck.state.currentIndex, deck.itemCount).map((i) => deck.idAt(i)),
    ).toEqual(["c", "a", "d", "b", "e"]);
    expect(deck.state.announcementIndex).toBeNull();
  });

  it("keeps empty synchronization and repopulation truthful", () => {
    const deck = new StackedDeckModel<Id>({ ids: [] });
    expect(deck.state).toMatchObject({
      canNext: false,
      canPrevious: false,
      currentIndex: -1,
      settledIndex: -1,
      visualTopIndex: -1,
    });
    expect(deck.beginInteraction()).toBe(-1);
    expect(deck.synchronize(0)).toBe(-1);
    expect(deck.reconfigure(["a"])).toBe(0);
    expect(deck.state.canNext).toBe(false);
    expect(deck.state.announcementIndex).toBeNull();
  });
});
