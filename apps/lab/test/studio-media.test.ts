import { describe, expect, it } from "vitest";

import {
  itemWidthCss,
  stripMeasurement,
  type StripBox,
} from "../src/playground/studio/media/media-strip";
import {
  aspectRatio,
  homeMediaId,
  sharedMediaData,
} from "../src/playground/studio/media/shared-media-data";

describe("the shared media", () => {
  it("is one collection with unique ids and complete, fictional messages", () => {
    const ids = sharedMediaData.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const item of sharedMediaData) {
      expect(item.title).not.toBe("");
      expect(item.alt.length).toBeGreaterThan(20);
      expect(item.sender).not.toBe("");
      expect(item.sentAt).toMatch(/^(Fri|Sat|Sun) \d\d:\d\d$/);
      expect(item.message).not.toBe("");
    }
  });

  it("varies in shape, so item widths are genuinely unequal", () => {
    const ratios = sharedMediaData.map(aspectRatio);
    expect(Math.min(...ratios)).toBeLessThan(0.7);
    expect(Math.max(...ratios)).toBeGreaterThan(2.5);
    expect(new Set(ratios.map((ratio) => ratio.toFixed(2))).size).toBeGreaterThanOrEqual(5);
  });

  it("starts in the middle, which has a neighbour each way", () => {
    const home = homeMediaId();
    const index = sharedMediaData.findIndex(({ id }) => id === home);
    expect(index).toBeGreaterThan(0);
    expect(index).toBeLessThan(sharedMediaData.length - 1);
  });

  it("borrows nothing: no product or brand name appears in any text", () => {
    const text = JSON.stringify(sharedMediaData).toLowerCase();
    expect(text).not.toMatch(/whatsapp|facebook|telegram/);
  });
});

/** A strip of unequal items laid out with the insets that centre the first and last. */
function layout(sizes: readonly number[], viewportSize: number, gap = 10) {
  const insetStart = (viewportSize - sizes[0]!) / 2;
  const insetEnd = (viewportSize - sizes.at(-1)!) / 2;
  let start = insetStart;
  const boxes: StripBox[] = sizes.map((size, index) => {
    const box = { id: `item-${index}`, size, start };
    start += size + gap;
    return box;
  });
  return { boxes, trackExtent: start - gap + insetEnd, viewportSize };
}

describe("the strip's geometry", () => {
  it("centres every item, the first and last included, with no two anchors on one position", () => {
    const measurement = layout([90, 180, 120, 260, 100, 150], 300);
    const { anchors, bounds } = stripMeasurement(measurement);
    expect(anchors).toHaveLength(6);
    const positions = anchors.map(({ position }) => position);
    expect(new Set(positions).size).toBe(positions.length);
    measurement.boxes.forEach((box, index) => {
      expect(anchors[index]!.position).toBeCloseTo(300 / 2 - (box.start + box.size / 2), 6);
    });
    expect(bounds.max).toBe(0);
    expect(anchors[0]!.position).toBeCloseTo(0, 6);
    expect(anchors.at(-1)!.position).toBeCloseTo(bounds.min, 6);
  });

  it("steps by item centres, not by an equal pitch", () => {
    const { anchors } = stripMeasurement(layout([90, 260, 140], 300));
    const steps = anchors
      .slice(1)
      .map((anchor, index) => anchors[index]!.position - anchor.position);
    expect(steps[0]).not.toBeCloseTo(steps[1]!, 3);
    expect(anchors.map(({ order }) => order)).toEqual([0, 1, 2]);
  });

  it("re-derives its anchors when item widths change, as they do when the stage is resized", () => {
    const before = stripMeasurement(layout([100, 200, 100], 300));
    const after = stripMeasurement(layout([140, 280, 140], 300));
    expect(after.anchors[1]!.position).not.toBe(before.anchors[1]!.position);
    expect(after.anchors[0]!.position).toBeCloseTo(0, 6);
    expect(after.anchors.at(-1)!.position).toBeCloseTo(after.bounds.min, 6);
  });

  it("tolerates a track a pixel shorter than its content", () => {
    const measurement = layout([100, 200, 100], 300);
    expect(() =>
      stripMeasurement({ ...measurement, trackExtent: measurement.trackExtent - 1 }),
    ).not.toThrow();
  });

  it("measures nothing before there is a layout", () => {
    expect(stripMeasurement({ boxes: [], trackExtent: 0, viewportSize: 0 }).anchors).toEqual([]);
  });

  it("derives an item's width from its aspect ratio, capped and floored", () => {
    const css = itemWidthCss("1.5");
    expect(css).toContain("var(--strip-item-height) * 1.5");
    expect(css).toContain("var(--strip-max-item)");
    expect(css).toContain("var(--strip-min-item)");
  });
});
