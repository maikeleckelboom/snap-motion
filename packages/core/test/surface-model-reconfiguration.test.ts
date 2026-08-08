import { describe, expect, it } from "vitest";

import { CoverflowModel } from "../src/coverflow-model";
import { StackedDeckModel } from "../src/stacked-deck-model";

type Id = "a" | "b" | "c" | "d" | "e";
const IDS = ["a", "b", "c", "d", "e"] as const satisfies readonly Id[];

function deck(initialId: Id = "c") {
  return new StackedDeckModel<Id>({ ids: IDS, initialId });
}

function rail(initialId: Id = "c") {
  return new CoverflowModel<Id>({ ids: IDS, initialId });
}

/** Rest exactly on one card, which is the only thing that publishes a durable selection. */
function restAt(index: number) {
  return { phase: "idle", physicalIndex: index, targetIndex: index, nearestIndex: index } as const;
}

describe("stacked deck item reconfiguration", () => {
  it("names items semantically and refuses an ID it does not have", () => {
    const model = deck();
    expect(model.indexOf("d")).toBe(3);
    expect(model.indexOf("z" as Id)).toBe(-1);
    expect(model.idAt(3)).toBe("d");
    expect(
      model.resolveAbsoluteCommand(model.indexOf("z" as Id), { owned: false, atRest: true }),
    ).toEqual({ kind: "none" });
    // The whole point: an unknown destination is refused, not rounded down to item zero.
    expect(model.resolveAbsoluteCommand(-1, { owned: false, atRest: true })).toEqual({
      kind: "none",
    });
    expect(model.state.settledIndex).toBe(2);
  });

  it("refuses to start on an item it does not contain", () => {
    expect(() => new StackedDeckModel<Id>({ ids: IDS, initialId: "z" as Id })).toThrow(RangeError);
    expect(() => new StackedDeckModel<Id>({ ids: ["a", "a"] as unknown as Id[] })).toThrow(
      RangeError,
    );
  });

  it("keeps the current screen across a same-length reorder", () => {
    const model = deck();
    model.update(restAt(2));
    expect(model.reconfigure(["e", "d", "c", "b", "a"])).toBe(2);
    expect(model.idAt(model.state.settledIndex)).toBe("c");

    expect(model.reconfigure(["c", "a", "b", "d", "e"])).toBe(0);
    expect(model.idAt(model.state.settledIndex)).toBe("c");
    expect(model.state.canPrevious).toBe(false);
    expect(model.state.canNext).toBe(true);
  });

  it("keeps the current screen when items are added or removed around it", () => {
    const model = deck();
    expect(model.reconfigure(["x" as Id, "a", "b", "c", "d", "e"])).toBe(3);
    expect(model.idAt(model.state.settledIndex)).toBe("c");
    expect(model.itemCount).toBe(6);

    expect(model.reconfigure(["c", "d"])).toBe(0);
    expect(model.idAt(model.state.settledIndex)).toBe("c");
  });

  it("holds its ordinal place when the current screen disappears", () => {
    const model = deck("e");
    model.update(restAt(4));
    // "e" is gone; index 4 no longer exists, so the deck stands on the last item it has.
    expect(model.reconfigure(["a", "b", "c"])).toBe(2);
    expect(model.idAt(model.state.settledIndex)).toBe("c");
  });

  it("survives emptying and repopulating without naming a card it does not have", () => {
    const model = deck();
    expect(model.reconfigure([])).toBe(-1);
    expect(model.itemCount).toBe(0);
    expect(model.state.canPrevious).toBe(false);
    expect(model.state.canNext).toBe(false);
    expect(model.traversalBounds).toBeUndefined();
    expect(model.resolveAbsoluteCommand(0, { owned: false, atRest: true })).toEqual({
      kind: "none",
    });

    expect(model.reconfigure(["a", "b"])).toBe(0);
    expect(model.idAt(model.state.settledIndex)).toBe("a");
    expect(model.state.canNext).toBe(true);
    expect(model.update(restAt(1)).settledIndex).toBe(1);
  });

  it("discards an interaction envelope opened against the old ordering", () => {
    const model = deck();
    model.openInteraction(2);
    expect(model.traversalBounds).toEqual({ minIndex: 1, maxIndex: 3 });
    model.reconfigure(["a", "b", "c"]);
    expect(model.traversalBounds).toBeUndefined();
    expect(model.state.pendingTargetIndex).toBeNull();
  });

  it("rejects a duplicate reconfiguration and stays on the collection it had", () => {
    const model = deck();
    expect(() => model.reconfigure(["a", "b", "b"])).toThrow(RangeError);
    expect(model.ids).toEqual([...IDS]);
    expect(model.idAt(model.state.settledIndex)).toBe("c");
  });
});

describe("coverflow item reconfiguration", () => {
  it("names items semantically and refuses an ID it does not have", () => {
    const model = rail();
    expect(model.indexOf("z" as Id)).toBe(-1);
    expect(model.resolveNavigationCommand(model.indexOf("z" as Id), { owned: false })).toEqual({
      kind: "none",
    });
    expect(model.resolveNavigationCommand(9, { owned: false })).toEqual({ kind: "none" });
    expect(model.synchronize(-1)).toBe(-1);
    expect(model.state.settledIndex).toBe(2);
  });

  it("refuses to start on an item it does not contain", () => {
    expect(() => new CoverflowModel<Id>({ ids: IDS, initialId: "z" as Id })).toThrow(RangeError);
  });

  it("keeps the current card across reorder, addition, and removal", () => {
    const model = rail();
    expect(model.reconfigure(["e", "d", "c", "b", "a"])).toBe(2);
    expect(model.idAt(model.state.settledIndex)).toBe("c");
    expect(model.reconfigure(["c", "b"])).toBe(0);
    expect(model.idAt(model.state.settledIndex)).toBe("c");
    expect(model.reconfigure(["a", "c", "b"])).toBe(1);
    expect(model.idAt(model.state.settledIndex)).toBe("c");
  });

  it("holds its ordinal place when the current card disappears", () => {
    const model = rail("a");
    expect(model.reconfigure(["b", "c", "d"])).toBe(0);
    expect(model.idAt(model.state.settledIndex)).toBe("b");
  });

  it("survives emptying and repopulating", () => {
    const model = rail();
    expect(model.reconfigure([])).toBe(-1);
    expect(model.itemCount).toBe(0);
    expect(model.state.canNext).toBe(false);
    expect(model.resolveRelativeCommand(1, { owned: false })).toEqual({ kind: "none" });

    expect(model.reconfigure(["a", "b", "c"])).toBe(0);
    expect(model.state.settledIndex).toBe(0);
    expect(model.resolveRelativeCommand(1, { owned: false })).toEqual({
      kind: "move",
      targetIndex: 1,
    });
  });

  it("rejects a duplicate reconfiguration and stays on the collection it had", () => {
    const model = rail();
    expect(() => model.reconfigure(["a", "a"])).toThrow(RangeError);
    expect(model.ids).toEqual([...IDS]);
  });
});
