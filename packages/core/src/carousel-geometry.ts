import { assertFiniteNumber, assertNonNegative, clampToBounds, getTrackBounds } from "./bounds.js";
import type { ScalarBounds, SemanticId, SnapAnchor } from "./types.js";

export interface MeasuredItemBox<Id extends SemanticId = SemanticId> {
  readonly id: Id;
  /** Layout start relative to the track content origin, in CSS pixels. */
  readonly start: number;
  /** Layout size in CSS pixels. Visual descendants are deliberately not represented. */
  readonly size: number;
  readonly order?: number;
}

export interface CarouselGeometry<Id extends SemanticId = SemanticId> {
  readonly viewportSize: number;
  readonly trackExtent: number;
  readonly bounds: ScalarBounds;
  readonly anchors: readonly SnapAnchor<Id>[];
}

export interface FixedStageGeometry<
  Id extends SemanticId = SemanticId,
> extends CarouselGeometry<Id> {
  readonly stageSize: number;
  readonly gap: number;
}

export interface PagedGridPageContext<ItemId extends SemanticId = SemanticId> {
  readonly pageIndex: number;
  readonly itemIds: readonly ItemId[];
}

export interface PagedGridGeometryOptions<ItemId extends SemanticId = SemanticId> {
  readonly viewportSize: number;
  readonly itemIds: readonly ItemId[];
  readonly rows: number;
  readonly columns: number;
  readonly gap: number;
  readonly getPageId?: (context: PagedGridPageContext<ItemId>) => SemanticId;
}

export interface PagedGridGeometry extends CarouselGeometry<SemanticId> {
  readonly rows: number;
  readonly columns: number;
  readonly gap: number;
  readonly cellSize: number;
  readonly pageSize: number;
  readonly pageCount: number;
}

export interface VariableWidthGeometryOptions<Id extends SemanticId = SemanticId> {
  readonly viewportSize: number;
  readonly trackExtent: number;
  readonly items: readonly MeasuredItemBox<Id>[];
  readonly alignment: "start" | "center";
  readonly startGutter?: number;
  readonly endGutter?: number;
}

function assertPositiveInteger(value: number, name: string): void {
  assertFiniteNumber(value, name);
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer`);
  }
}

function assertUniqueIds(ids: readonly SemanticId[], name: string): void {
  const seen = new Set<SemanticId>();
  for (const id of ids) {
    if (typeof id !== "string" || id.length === 0) {
      throw new TypeError(`${name} ids must be non-empty strings`);
    }
    if (seen.has(id)) {
      throw new RangeError(`${name} ids must be unique: ${id}`);
    }
    seen.add(id);
  }
}

export function calculateFixedCellSize(viewportSize: number, columns: number, gap: number): number {
  assertNonNegative(viewportSize, "viewportSize");
  assertPositiveInteger(columns, "columns");
  assertNonNegative(gap, "gap");
  const occupiedGaps = gap * (columns - 1);
  if (occupiedGaps > viewportSize) {
    throw new RangeError("column gaps must not exceed the viewport size");
  }
  return (viewportSize - occupiedGaps) / columns;
}

export function createFixedStageGeometry<Id extends SemanticId>(options: {
  readonly viewportSize: number;
  readonly itemIds: readonly Id[];
  readonly gap?: number;
}): FixedStageGeometry<Id> {
  const gap = options.gap ?? 0;
  assertNonNegative(options.viewportSize, "viewportSize");
  assertNonNegative(gap, "gap");
  assertUniqueIds(options.itemIds, "item");

  const count = options.itemIds.length;
  const trackExtent = count === 0 ? 0 : count * options.viewportSize + (count - 1) * gap;
  const bounds = getTrackBounds(options.viewportSize, trackExtent);
  const anchors = options.itemIds.map((id, order) => ({
    id,
    order,
    position: clampToBounds(-order * (options.viewportSize + gap), bounds),
  }));

  return {
    viewportSize: options.viewportSize,
    trackExtent,
    bounds,
    anchors,
    stageSize: options.viewportSize,
    gap,
  };
}

export function createPagedGridGeometry<ItemId extends SemanticId>(
  options: PagedGridGeometryOptions<ItemId>,
): PagedGridGeometry {
  assertNonNegative(options.viewportSize, "viewportSize");
  assertPositiveInteger(options.rows, "rows");
  assertPositiveInteger(options.columns, "columns");
  assertNonNegative(options.gap, "gap");
  assertUniqueIds(options.itemIds, "item");

  const cellSize = calculateFixedCellSize(options.viewportSize, options.columns, options.gap);
  const pageSize = options.rows * options.columns;
  const pageCount = Math.ceil(options.itemIds.length / pageSize);
  // Pages are explicit stage-width groups. Cell gaps remain inside each page and never
  // leak into the distance between semantic page anchors.
  const trackExtent = pageCount * options.viewportSize;
  const bounds = getTrackBounds(options.viewportSize, trackExtent);
  const anchors: SnapAnchor<SemanticId>[] = [];

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const pageItems = options.itemIds.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);
    const id = options.getPageId?.({ pageIndex, itemIds: pageItems }) ?? `page:${pageItems[0]}`;
    const pageStart = pageIndex * options.viewportSize;
    anchors.push({ id, order: pageIndex, position: clampToBounds(-pageStart, bounds) });
  }

  assertUniqueIds(
    anchors.map((anchor) => anchor.id),
    "page",
  );

  return {
    viewportSize: options.viewportSize,
    trackExtent,
    bounds,
    anchors,
    rows: options.rows,
    columns: options.columns,
    gap: options.gap,
    cellSize,
    pageSize,
    pageCount,
  };
}

export function createVariableWidthGeometry<Id extends SemanticId>(
  options: VariableWidthGeometryOptions<Id>,
): CarouselGeometry<Id> {
  assertNonNegative(options.viewportSize, "viewportSize");
  assertNonNegative(options.trackExtent, "trackExtent");
  const startGutter = options.startGutter ?? 0;
  const endGutter = options.endGutter ?? 0;
  assertNonNegative(startGutter, "startGutter");
  assertNonNegative(endGutter, "endGutter");
  if (startGutter + endGutter > options.trackExtent) {
    throw new RangeError("gutters must fit inside trackExtent");
  }

  assertUniqueIds(
    options.items.map((item) => item.id),
    "item",
  );
  const bounds = getTrackBounds(options.viewportSize, options.trackExtent);
  const anchors = options.items.map((item, index) => {
    assertNonNegative(item.start, `item(${item.id}).start`);
    assertNonNegative(item.size, `item(${item.id}).size`);
    const itemEnd = item.start + item.size;
    if (itemEnd + endGutter > options.trackExtent + Number.EPSILON) {
      throw new RangeError(`item(${item.id}) lies outside trackExtent`);
    }

    const rawPosition =
      options.alignment === "start"
        ? startGutter - item.start
        : options.viewportSize / 2 - (item.start + item.size / 2);
    return {
      id: item.id,
      order: item.order ?? index,
      position: clampToBounds(rawPosition, bounds),
    };
  });

  return {
    viewportSize: options.viewportSize,
    trackExtent: options.trackExtent,
    bounds,
    anchors,
  };
}
