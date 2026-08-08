import { describe, expect, it } from "vitest";

import {
  CoverflowModel,
  isSettledOnAnchor,
  type SettledOnAnchorInput,
} from "../src/coverflow-model";

const RAIL_IDS = ["a", "b", "c", "d", "e"] as const;
type RailId = (typeof RAIL_IDS)[number];

const settledOnMap: SettledOnAnchorInput = {
  phase: "idle",
  index: 2,
  settledIndex: 2,
  physicalIndex: 2,
  position: -560,
  anchorPosition: -560,
  velocity: 0,
  restDistance: 0.6,
  restSpeed: 10,
  activeMatches: true,
  targetMatches: true,
};

function model(initialIndex = 2) {
  return new CoverflowModel<RailId>({ ids: RAIL_IDS, initialId: RAIL_IDS[initialIndex]! });
}

describe("coverflow rail selection", () => {
  it("names the face in the clearing immediately and the durable selection only at rest", () => {
    const rail = model();
    const dragging = rail.update({
      phase: "dragging",
      physicalIndex: 2.6,
      targetIndex: null,
      nearestIndex: 3,
    });
    expect(dragging.visualIndex).toBe(3);
    expect(dragging.settledIndex).toBe(2);
    expect(dragging.announcementIndex).toBeNull();

    const settling = rail.update({
      phase: "settling",
      physicalIndex: 3.4,
      targetIndex: 4,
      nearestIndex: 3,
    });
    expect(settling.settledIndex).toBe(2);
    expect(settling.pendingTargetIndex).toBe(4);
    expect(settling.commandIndex).toBe(4);

    const settled = rail.update({
      phase: "idle",
      physicalIndex: 4,
      targetIndex: 4,
      nearestIndex: 4,
    });
    expect(settled.settledIndex).toBe(4);
    expect(settled.announcementIndex).toBe(4);
    expect(settled.canNext).toBe(false);
    expect(settled.canPrevious).toBe(true);
  });

  it("clamps a physical index that has run past a bound", () => {
    const rail = model();
    expect(
      rail.update({ phase: "dragging", physicalIndex: 9, targetIndex: null, nearestIndex: 4 })
        .physicalIndex,
    ).toBe(4);
    expect(
      rail.update({ phase: "dragging", physicalIndex: -3, targetIndex: null, nearestIndex: 0 })
        .physicalIndex,
    ).toBe(0);
  });
});

describe("coverflow rail commands", () => {
  it("moves to any named destination, because a rail may travel any distance", () => {
    const rail = model();
    expect(rail.resolveNavigationCommand(0, { owned: false })).toEqual({
      kind: "move",
      targetIndex: 0,
    });
    expect(rail.resolveRelativeCommand(1, { owned: false })).toEqual({
      kind: "move",
      targetIndex: 3,
    });
  });

  it("refuses a destination it is already committed to, or any command while held", () => {
    const rail = model();
    expect(rail.resolveNavigationCommand(2, { owned: false })).toEqual({ kind: "none" });
    expect(rail.resolveNavigationCommand(0, { owned: true })).toEqual({ kind: "none" });

    rail.update({ phase: "settling", physicalIndex: 2.5, targetIndex: 4, nearestIndex: 3 });
    expect(rail.resolveNavigationCommand(4, { owned: false })).toEqual({ kind: "none" });
    expect(rail.resolveRelativeCommand(-1, { owned: false })).toEqual({
      kind: "move",
      targetIndex: 3,
    });
  });

  it("adopts a synchronized destination without announcing a move it did not make", () => {
    const rail = model();
    rail.synchronize(4);
    const state = rail.state;
    expect(state.visualIndex).toBe(4);
    expect(state.settledIndex).toBe(4);
    expect(state.commandIndex).toBe(4);
    expect(state.pendingTargetIndex).toBeNull();
    expect(
      rail.update({ phase: "idle", physicalIndex: 4, targetIndex: 4, nearestIndex: 4 })
        .announcementIndex,
    ).toBeNull();
  });

  it("refuses a synchronization to an index that names no card", () => {
    const rail = model();
    expect(rail.synchronize(12)).toBe(-1);
    expect(rail.synchronize(-8)).toBe(-1);
    expect(rail.state.settledIndex).toBe(2);
  });
});

describe("coverflow synchronization is atomic", () => {
  it("holds its adopted selection through the very next dragging snapshot", () => {
    const rail = model();
    rail.synchronize(4);

    // No remeasure in between: the controller is still reporting from where it was.
    const dragged = rail.update({
      phase: "dragging",
      physicalIndex: 3.6,
      targetIndex: null,
      nearestIndex: 2,
    });
    expect(dragged.settledIndex).toBe(4);
    expect(dragged.pendingTargetIndex).toBeNull();
    expect(dragged.announcementIndex).toBeNull();
  });

  it("holds it through a settling snapshot and through the command that follows", () => {
    const rail = model();
    rail.synchronize(0);

    const settling = rail.update({
      phase: "settling",
      physicalIndex: 0.5,
      targetIndex: 1,
      nearestIndex: 0,
    });
    expect(settling.settledIndex).toBe(0);
    expect(settling.pendingTargetIndex).toBe(1);
    expect(settling.commandIndex).toBe(1);
    expect(rail.resolveRelativeCommand(1, { owned: false })).toEqual({
      kind: "move",
      targetIndex: 2,
    });
  });

  it("announces an asked-for adoption at once, and only once", () => {
    const rail = model();
    rail.synchronize(0, { announce: true });
    expect(rail.state.announcementIndex).toBe(0);
    expect(rail.state.settledIndex).toBe(0);

    const dragged = rail.update({
      phase: "dragging",
      physicalIndex: 0.4,
      targetIndex: null,
      nearestIndex: 0,
    });
    expect(dragged.settledIndex).toBe(0);
    expect(dragged.announcementIndex).toBeNull();
    expect(
      rail.update({ phase: "idle", physicalIndex: 0, targetIndex: 0, nearestIndex: 0 })
        .announcementIndex,
    ).toBeNull();
  });
});

describe("empty coverflow rail", () => {
  it("names no item at all, on every index it publishes", () => {
    const rail = new CoverflowModel<RailId>({ ids: [] });
    const state = rail.state;
    expect(state.settledIndex).toBe(-1);
    expect(state.visualIndex).toBe(-1);
    expect(state.physicalIndex).toBe(-1);
    expect(state.commandIndex).toBe(-1);
    expect(state.pendingTargetIndex).toBeNull();
    expect(state.canPrevious).toBe(false);
    expect(state.canNext).toBe(false);
    expect(rail.resolveRelativeCommand(1, { owned: false })).toEqual({ kind: "none" });
    expect(rail.resolveNavigationCommand(0, { owned: false })).toEqual({ kind: "none" });
    expect(rail.synchronize(0)).toBe(-1);
  });

  it("survives being emptied and repopulated, and never announces the repopulation", () => {
    const rail = model();
    rail.update({ phase: "idle", physicalIndex: 2, targetIndex: 2, nearestIndex: 2 });

    expect(rail.reconfigure([])).toBe(-1);
    expect(rail.state.settledIndex).toBe(-1);
    expect(
      rail.update({ phase: "idle", physicalIndex: 0, targetIndex: 0, nearestIndex: 0 })
        .settledIndex,
    ).toBe(-1);

    expect(rail.reconfigure(["a", "b"])).toBe(0);
    expect(rail.state.settledIndex).toBe(0);
    expect(rail.state.visualIndex).toBe(0);
    expect(
      rail.update({ phase: "idle", physicalIndex: 0, targetIndex: 0, nearestIndex: 0 })
        .announcementIndex,
    ).toBeNull();
    expect(rail.state.canNext).toBe(true);
  });
});

describe("coverflow inspection eligibility", () => {
  it("requires the exact settled identity and physical state", () => {
    expect(isSettledOnAnchor(settledOnMap)).toBe(true);
    expect(isSettledOnAnchor({ ...settledOnMap, phase: "settling" })).toBe(false);
    expect(isSettledOnAnchor({ ...settledOnMap, physicalIndex: 2.01 })).toBe(false);
    expect(isSettledOnAnchor({ ...settledOnMap, velocity: 12 })).toBe(false);
    expect(isSettledOnAnchor({ ...settledOnMap, activeMatches: false })).toBe(false);
    expect(isSettledOnAnchor({ ...settledOnMap, targetMatches: false })).toBe(false);
    expect(isSettledOnAnchor({ ...settledOnMap, anchorPosition: undefined })).toBe(false);
    expect(isSettledOnAnchor({ ...settledOnMap, position: -540 })).toBe(false);
  });
});
