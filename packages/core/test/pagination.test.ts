import { describe, expect, it } from "vitest";

import {
  createPaginationIndicatorState,
  PAGINATION_INDICATOR_TUNING,
  resolvePaginationIndicator,
} from "../src/pagination";

const CARD_PITCH = 300;
const slotPitch = PAGINATION_INDICATOR_TUNING.slotSize + PAGINATION_INDICATOR_TUNING.slotGap;

function indicator(physicalIndex: number, physicalVelocityInCards = 0, itemCount = 5) {
  return resolvePaginationIndicator(
    physicalIndex,
    -physicalVelocityInCards * CARD_PITCH,
    CARD_PITCH,
    itemCount,
    createPaginationIndicatorState(),
  );
}

describe("fluid pagination indicator", () => {
  it("aligns every resting index exactly with scale one", () => {
    for (let index = 0; index < 5; index += 1) {
      const resolved = indicator(index);
      expect(resolved.position).toBe(index);
      expect(resolved.x).toBe(index * slotPitch);
      expect(resolved.scaleX).toBe(1);
      expect(resolved.stretchRatio).toBe(0);
    }
  });

  it("places halfway physical positions halfway between fixed slot centers", () => {
    expect(indicator(1.5).x).toBe(1.5 * slotPitch);
  });

  it("remains continuous across integer boundaries", () => {
    const before = indicator(0.999).x;
    const after = indicator(1.001).x;
    expect(after - before).toBeCloseTo(slotPitch * 0.002, 10);
  });

  it("is symmetric for positive and negative physical travel", () => {
    const restingX = indicator(2).x;
    const forward = indicator(2, 3);
    const backward = indicator(2, -3);

    expect(forward.scaleX).toBeCloseTo(backward.scaleX, 10);
    expect(forward.x - restingX).toBeCloseTo(restingX - backward.x, 10);
    expect(forward.softDirection).toBeCloseTo(-backward.softDirection, 10);
  });

  it("increases stretch smoothly with speed and keeps it bounded", () => {
    const resting = indicator(2, 0);
    const low = indicator(2, 0.75);
    const medium = indicator(2, 2.5);
    const high = indicator(2, 8);

    expect(resting.stretchRatio).toBe(0);
    expect(low.stretchRatio).toBeGreaterThan(0);
    expect(low.stretchRatio).toBeLessThan(medium.stretchRatio);
    expect(medium.stretchRatio).toBeLessThan(high.stretchRatio);
    expect(high.stretchRatio).toBe(PAGINATION_INDICATOR_TUNING.maximumStretchRatio);
    expect(high.scaleX).toBeLessThanOrEqual(1 + PAGINATION_INDICATOR_TUNING.maximumStretchRatio);
  });

  it("reverses its directional edge bias", () => {
    const forward = indicator(2, 3);
    const backward = indicator(2, -3);

    expect(forward.rightStretch).toBeGreaterThan(forward.leftStretch);
    expect(backward.leftStretch).toBeGreaterThan(backward.rightStretch);
    expect(forward.rightStretch).toBeCloseTo(backward.leftStretch, 10);
    expect(forward.leftStretch).toBeCloseTo(backward.rightStretch, 10);
  });

  it("crosses zero velocity without a directional discontinuity", () => {
    const barelyForward = indicator(2, 0.001);
    const barelyBackward = indicator(2, -0.001);

    expect(barelyForward.x).toBeCloseTo(barelyBackward.x, 10);
    expect(barelyForward.scaleX).toBeCloseTo(barelyBackward.scaleX, 10);
  });

  it("clamps physical position at the first and last item", () => {
    expect(indicator(-0.5).position).toBe(0);
    expect(indicator(-0.5).x).toBe(0);
    expect(indicator(4.5).position).toBe(4);
    expect(indicator(4.5).x).toBe(4 * slotPitch);
  });
});
