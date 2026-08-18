import { describe, expect, it } from "vitest";

import { resolveDirectManipulationGesture, resolveSnapKeyboardAction } from "../src/gestures";

describe("direct manipulation arbitration", () => {
  it("opens only an already-inspectable item released on its origin", () => {
    expect(
      resolveDirectManipulationGesture({
        cancelled: false,
        crossedDragThreshold: false,
        horizontalIntent: false,
        involvedMultiplePointers: false,
        openEligibleAtStart: true,
        releasedOnOrigin: true,
      }),
    ).toEqual({ action: "open", shouldFocusStage: false });
  });

  it("selects an inactive item and focuses only a genuine horizontal swipe", () => {
    expect(
      resolveDirectManipulationGesture({
        cancelled: false,
        crossedDragThreshold: false,
        horizontalIntent: false,
        involvedMultiplePointers: false,
        openEligibleAtStart: false,
        releasedOnOrigin: true,
      }),
    ).toEqual({ action: "select", shouldFocusStage: false });
    expect(
      resolveDirectManipulationGesture({
        cancelled: false,
        crossedDragThreshold: true,
        horizontalIntent: true,
        involvedMultiplePointers: false,
        openEligibleAtStart: true,
        releasedOnOrigin: true,
      }),
    ).toEqual({ action: "swipe", shouldFocusStage: true });
  });

  it.each([
    ["vertical movement", false, true, false, true],
    ["pointer cancellation", true, true, false, true],
    ["multiple pointers", false, true, true, true],
    ["a different release item", false, false, false, false],
  ])(
    "does nothing after %s",
    (_label, cancelled, crossedDragThreshold, involvedMultiplePointers, releasedOnOrigin) => {
      expect(
        resolveDirectManipulationGesture({
          cancelled,
          crossedDragThreshold,
          horizontalIntent: false,
          involvedMultiplePointers,
          openEligibleAtStart: true,
          releasedOnOrigin,
        }),
      ).toEqual({ action: "none", shouldFocusStage: false });
    },
  );
});

describe("keyboard navigation policy", () => {
  it("maps arrows, Home, and End while leaving unrelated keys untouched", () => {
    expect(resolveSnapKeyboardAction({ key: "ArrowLeft" })).toBe("previous");
    expect(resolveSnapKeyboardAction({ key: "ArrowRight" })).toBe("next");
    expect(resolveSnapKeyboardAction({ key: "Home" })).toBe("home");
    expect(resolveSnapKeyboardAction({ key: "End" })).toBe("end");
    expect(resolveSnapKeyboardAction({ key: "PageDown" })).toBeUndefined();
  });

  it("declines a claimed, modified, or already-handled press", () => {
    expect(
      resolveSnapKeyboardAction({ key: "ArrowRight", ownedByDescendant: true }),
    ).toBeUndefined();
    expect(
      resolveSnapKeyboardAction({ key: "ArrowRight", defaultPrevented: true }),
    ).toBeUndefined();
    expect(resolveSnapKeyboardAction({ key: "ArrowRight", metaKey: true })).toBeUndefined();
    expect(resolveSnapKeyboardAction({ key: "ArrowRight", altKey: true })).toBeUndefined();
    expect(resolveSnapKeyboardAction({ key: "ArrowRight", ctrlKey: true })).toBeUndefined();
  });
});
