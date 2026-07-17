import { describe, expect, it } from "vitest";

import {
  calculateFixedCellSize,
  createFixedStageGeometry,
  createPagedGridGeometry,
  createVariableWidthGeometry,
  type MeasuredItemBox,
} from "../src";

describe("fixed-stage geometry", () => {
  it("creates one viewport-sized stage per semantic item", () => {
    const geometry = createFixedStageGeometry({
      viewportSize: 320,
      itemIds: ["one", "two", "three"],
    });
    expect(geometry.trackExtent).toBe(960);
    expect(geometry.bounds).toEqual({ min: -640, max: 0 });
    expect(geometry.anchors.map((anchor) => anchor.position)).toEqual([0, -320, -640]);
  });

  it("accounts for an explicit inter-stage gap exactly once", () => {
    const geometry = createFixedStageGeometry({
      viewportSize: 300,
      itemIds: ["one", "two"],
      gap: 12,
    });
    expect(geometry.trackExtent).toBe(612);
    expect(geometry.anchors[1]?.position).toBe(-312);
  });

  it("normalizes the one-item and empty cases", () => {
    expect(createFixedStageGeometry({ viewportSize: 300, itemIds: ["one"] }).bounds).toEqual({
      min: 0,
      max: 0,
    });
    expect(createFixedStageGeometry({ viewportSize: 300, itemIds: [] })).toMatchObject({
      trackExtent: 0,
      bounds: { min: 0, max: 0 },
      anchors: [],
    });
  });
});

describe("explicit paged-grid geometry", () => {
  it("uses the correct occupied-gap arithmetic", () => {
    expect(calculateFixedCellSize(300, 2, 12)).toBe(144);
    expect(calculateFixedCellSize(320, 3, 10)).toBe(100);
  });

  it("makes every page exactly one stage wide with no leaked inter-page gap", () => {
    const geometry = createPagedGridGeometry({
      viewportSize: 300,
      itemIds: ["a", "b", "c", "d", "e"],
      rows: 2,
      columns: 2,
      gap: 12,
    });
    expect(geometry.cellSize).toBe(144);
    expect(geometry.pageCount).toBe(2);
    expect(geometry.trackExtent).toBe(600);
    expect(geometry.bounds).toEqual({ min: -300, max: 0 });
    expect(geometry.anchors.map((anchor) => anchor.position)).toEqual([0, -300]);
  });

  it("gives a partial final page a stable semantic ID and legal final anchor", () => {
    const geometry = createPagedGridGeometry({
      viewportSize: 400,
      itemIds: ["a", "b", "c", "d", "e"],
      rows: 2,
      columns: 2,
      gap: 16,
      getPageId: ({ itemIds }) => `page-starting-${itemIds[0]}`,
    });
    expect(geometry.pageSize).toBe(4);
    expect(geometry.anchors).toEqual([
      { id: "page-starting-a", order: 0, position: 0 },
      { id: "page-starting-e", order: 1, position: -400 },
    ]);
  });

  it("keeps a partially populated first page at one legal stage", () => {
    const geometry = createPagedGridGeometry({
      viewportSize: 300,
      itemIds: ["a"],
      rows: 2,
      columns: 2,
      gap: 12,
    });
    expect(geometry.trackExtent).toBe(300);
    expect(geometry.bounds).toEqual({ min: 0, max: 0 });
    expect(geometry.anchors[0]?.id).toBe("page:a");
  });
});

describe("variable-width measured geometry", () => {
  const items: readonly MeasuredItemBox[] = [
    { id: "first", start: 20, size: 100 },
    { id: "middle", start: 180, size: 160 },
    { id: "last", start: 580, size: 100 },
  ];

  it("builds start-aligned anchors in one track coordinate system", () => {
    const geometry = createVariableWidthGeometry({
      viewportSize: 300,
      trackExtent: 700,
      items,
      alignment: "start",
      startGutter: 20,
      endGutter: 20,
    });
    expect(geometry.bounds).toEqual({ min: -400, max: 0 });
    expect(geometry.anchors.map((anchor) => anchor.position)).toEqual([0, -160, -400]);
  });

  it("centers measured boxes and legally clamps the first and last items", () => {
    const geometry = createVariableWidthGeometry({
      viewportSize: 300,
      trackExtent: 700,
      items,
      alignment: "center",
      endGutter: 20,
    });
    expect(geometry.anchors.map((anchor) => anchor.position)).toEqual([0, -110, -400]);
  });

  it("supports a last item narrower or wider than the viewport", () => {
    const narrower = createVariableWidthGeometry({
      viewportSize: 300,
      trackExtent: 700,
      items: [{ id: "last", start: 600, size: 100 }],
      alignment: "center",
    });
    const wider = createVariableWidthGeometry({
      viewportSize: 300,
      trackExtent: 700,
      items: [{ id: "last", start: 300, size: 400 }],
      alignment: "center",
    });
    expect(narrower.anchors[0]?.position).toBe(-400);
    expect(wider.anchors[0]?.position).toBe(-350);
  });

  it("preserves semantic IDs when multiple end alignments clamp to one position", () => {
    const geometry = createVariableWidthGeometry({
      viewportSize: 300,
      trackExtent: 700,
      items: [
        { id: "penultimate", start: 560, size: 80 },
        { id: "last", start: 620, size: 80 },
      ],
      alignment: "start",
    });
    expect(geometry.anchors).toEqual([
      { id: "penultimate", order: 0, position: -400 },
      { id: "last", order: 1, position: -400 },
    ]);
  });

  it("is independent from transformed or overflowing visual descendants", () => {
    const visuallyOversized = [
      { id: "a", start: 0, size: 300, visualDescendantExtent: 12_000 },
      { id: "b", start: 300, size: 300, visualScale: 4 },
    ];
    const plain = visuallyOversized.map(({ id, start, size }) => ({ id, start, size }));
    const options = { viewportSize: 300, trackExtent: 600, alignment: "start" as const };
    expect(createVariableWidthGeometry({ ...options, items: visuallyOversized })).toEqual(
      createVariableWidthGeometry({ ...options, items: plain }),
    );
  });
});
