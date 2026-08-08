import { describe, expect, it } from "vitest";

import { PAGINATION_INDICATOR_TUNING } from "../src/pagination";
import {
  resolveAdjacentIndex,
  resolveCommandOriginIndex,
  resolveHystereticIndex,
  SettledSelection,
} from "../src/selection";

describe("visual index hysteresis", () => {
  it("follows the nearest physical item with a narrow midpoint dead band", () => {
    expect(resolveHystereticIndex(2.53, 2, 5)).toBe(2);
    expect(resolveHystereticIndex(2.541, 2, 5)).toBe(3);
    expect(resolveHystereticIndex(2.47, 3, 5)).toBe(3);
    expect(resolveHystereticIndex(2.459, 3, 5)).toBe(2);
  });

  it("prevents midpoint chatter without perceptible source retention", () => {
    const switchPoint = 0.5 + PAGINATION_INDICATOR_TUNING.visualHysteresis;
    expect(switchPoint).toBeLessThanOrEqual(0.55);
    expect(resolveHystereticIndex(switchPoint - 0.001, 0, 5)).toBe(0);
    expect(resolveHystereticIndex(switchPoint + 0.001, 0, 5)).toBe(1);
    expect(resolveHystereticIndex(3.8, 0, 5)).toBe(4);
  });
});

describe("settled selection", () => {
  it("keeps settled selection independent until final idle", () => {
    const selection = new SettledSelection(0, 5);

    expect(selection.update({ phase: "settling", targetIndex: 4, activeIndex: 1 })).toBeNull();
    expect(selection.settledIndex).toBe(0);
    expect(selection.update({ phase: "settling", targetIndex: 4, activeIndex: 3 })).toBeNull();
    expect(selection.settledIndex).toBe(0);
    expect(selection.update({ phase: "idle", targetIndex: 4, activeIndex: 4 })).toBe(4);
    expect(selection.settledIndex).toBe(4);
    expect(selection.update({ phase: "idle", targetIndex: 4, activeIndex: 4 })).toBeNull();
  });

  it("cancels obsolete pending announcements on re-grab and retarget", () => {
    const selection = new SettledSelection(0, 5);

    selection.update({ phase: "settling", targetIndex: 4, activeIndex: 1 });
    expect(selection.pendingTargetIndex).toBe(4);
    selection.update({ phase: "dragging", targetIndex: null, activeIndex: 1 });
    expect(selection.pendingTargetIndex).toBeNull();
    expect(selection.settledIndex).toBe(0);

    selection.update({ phase: "settling", targetIndex: 4, activeIndex: 2 });
    selection.update({ phase: "settling", targetIndex: 2, activeIndex: 2 });
    expect(selection.pendingTargetIndex).toBe(2);
    expect(selection.update({ phase: "idle", targetIndex: 2, activeIndex: 2 })).toBe(2);
  });
});

describe("relative command origin", () => {
  it("resolves previous and next as exactly one adjacent item", () => {
    expect(resolveAdjacentIndex(2, -1, 5)).toBe(1);
    expect(resolveAdjacentIndex(2, 1, 5)).toBe(3);
  });

  it("keeps boundary actions as no-ops", () => {
    expect(resolveAdjacentIndex(0, -1, 5)).toBe(0);
    expect(resolveAdjacentIndex(4, 1, 5)).toBe(4);
  });

  it("steps from the committed destination, coalescing ambiguous input", () => {
    // Nothing in flight: the command steps from the item the user is looking at.
    expect(resolveCommandOriginIndex(2, null)).toBe(2);
    // In flight: the surface has answered, so the next distinct command steps from that answer.
    expect(resolveCommandOriginIndex(2, 3)).toBe(3);
    expect(resolveCommandOriginIndex(3, 3)).toBe(3);
    // A destination behind the current item is still the destination.
    expect(resolveCommandOriginIndex(3, 2)).toBe(2);
  });
});
