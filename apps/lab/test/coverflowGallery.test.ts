import { describe, expect, it } from "vitest";

import {
  isCoverflowGalleryEligible,
  resolveCoverflowGesture,
  resolveCoverflowSynchronization,
  type CoverflowOpenEligibilityInput,
} from "../src/demos/coverflowGallery";

const settledEligibility: CoverflowOpenEligibilityInput = {
  activeId: "map",
  expectedId: "map",
  index: 2,
  phase: "idle",
  physicalIndex: 2,
  position: -560,
  settledIndex: 2,
  targetId: "map",
  velocity: 0,
  restDistance: 0.6,
  restSpeed: 10,
  targetPosition: -560,
};

describe("coverflow gallery launcher arbitration", () => {
  it("opens only a settled active card released on its origin", () => {
    expect(
      resolveCoverflowGesture({
        cancelled: false,
        crossedDragThreshold: false,
        horizontalIntent: false,
        involvedMultiplePointers: false,
        openEligibleAtStart: true,
        releasedOnOrigin: true,
      }),
    ).toEqual({ action: "open", shouldFocusStage: false });
  });

  it("selects an inactive card and focuses only a genuine horizontal swipe", () => {
    expect(
      resolveCoverflowGesture({
        cancelled: false,
        crossedDragThreshold: false,
        horizontalIntent: false,
        involvedMultiplePointers: false,
        openEligibleAtStart: false,
        releasedOnOrigin: true,
      }),
    ).toEqual({ action: "select", shouldFocusStage: false });
    expect(
      resolveCoverflowGesture({
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
    ["different release card", false, false, false, false],
  ])(
    "does nothing after %s",
    (_label, cancelled, crossedDragThreshold, involvedMultiplePointers, releasedOnOrigin) => {
      expect(
        resolveCoverflowGesture({
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

describe("coverflow gallery synchronization", () => {
  it("requires the exact settled identity and physical state", () => {
    expect(isCoverflowGalleryEligible(settledEligibility)).toBe(true);
    expect(isCoverflowGalleryEligible({ ...settledEligibility, phase: "settling" })).toBe(false);
    expect(isCoverflowGalleryEligible({ ...settledEligibility, physicalIndex: 2.01 })).toBe(false);
    expect(isCoverflowGalleryEligible({ ...settledEligibility, velocity: 12 })).toBe(false);
  });

  it("canonicalizes every coverflow owner to the final gallery index", () => {
    expect(resolveCoverflowSynchronization(4, 5)).toEqual({
      physicalIndex: 4,
      settledIndex: 4,
      targetIndex: 4,
      velocity: 0,
      visualIndex: 4,
    });
    expect(resolveCoverflowSynchronization(12, 5).targetIndex).toBe(4);
    expect(resolveCoverflowSynchronization(-8, 5).targetIndex).toBe(0);
    expect(resolveCoverflowSynchronization(8, 0).targetIndex).toBe(0);
  });
});
