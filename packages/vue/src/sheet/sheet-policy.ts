import type { SheetAxis, SheetEdge, SheetSide } from "./sheet-contracts";
import { getSheetSideDescriptor } from "./sheet-side";

export type SheetViewportSnapId = "compact" | "comfortable" | "full";
export type SheetFixedSnapId = "open";
export type SheetOpenSnapId = SheetViewportSnapId | SheetFixedSnapId;

export interface SheetViewportPolicy {
  comfortableExtent: number;
  compactExtent: number;
  hiddenOvershoot: number;
  minimumViewportExtent: number;
  oppositeEdgeGap: number;
}

export interface SheetReleasePolicy {
  closeVelocity: number;
  expandVelocity: number;
  projectionSeconds: number;
}

export interface SheetSafeAreaInsets {
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
  readonly top: number;
}

export interface SheetMeasureContext {
  readonly axis: SheetAxis;
  readonly crossViewportExtent: number;
  readonly hiddenOvershoot: number;
  readonly intrinsicContentPrimaryExtent: number;
  readonly layoutViewportBlockSize: number;
  readonly layoutViewportInlineSize: number;
  readonly oppositeEdgeGap: number;
  readonly panelCrossExtent: number;
  readonly panelPrimaryExtent: number;
  readonly primaryViewportExtent: number;
  readonly safeAreaInsets: SheetSafeAreaInsets;
  readonly side: SheetSide;
  readonly visualViewportBlockSize: number;
  readonly visualViewportInlineSize: number;
}

/** A semantic open sheet position expressed as visible primary-axis extent. */
export interface SheetSnapPoint<Id extends string> {
  readonly disabled?: boolean | ((context: SheetMeasureContext) => boolean);
  readonly id: Id;
  readonly label: string;
  readonly resolveVisibleExtent: (context: SheetMeasureContext) => number;
}

export interface ResolvedSheetSnapPoint<Id extends string> {
  readonly disabled: boolean;
  readonly id: Id;
  readonly label: string;
  readonly order: number;
  readonly position: number;
  readonly visibleExtent: number;
}

export type SheetSnapResolver = (context: SheetMeasureContext) => number;

interface SheetSnapAnchor<Id extends string> {
  readonly id: Id;
  readonly order: number;
  readonly position: number;
}

function finiteNonNegative(value: number, fallback = 0) {
  return Number.isFinite(value) ? Math.max(0, value) : fallback;
}

export function sheetSafeAreaInset(context: SheetMeasureContext, edge: SheetEdge) {
  return finiteNonNegative(context.safeAreaInsets[edge]);
}

export function sheetPrimarySurfaceExtent(context: SheetMeasureContext) {
  return context.axis === "y"
    ? finiteNonNegative(context.primaryViewportExtent)
    : finiteNonNegative(context.panelPrimaryExtent);
}

export function sheetMaximumVisibleExtent(context: SheetMeasureContext) {
  const descriptor = getSheetSideDescriptor(context.side);
  const availableViewportExtent = Math.max(
    0,
    finiteNonNegative(context.primaryViewportExtent) -
      finiteNonNegative(context.oppositeEdgeGap) -
      sheetSafeAreaInset(context, descriptor.oppositeEdge),
  );
  return Math.min(sheetPrimarySurfaceExtent(context), availableViewportExtent);
}

function clampVisibleExtent(value: number, context: SheetMeasureContext) {
  const fallback = 0;
  return Math.min(sheetMaximumVisibleExtent(context), finiteNonNegative(value, fallback));
}

export const sheetSnapVisibleExtent = {
  pixels(extent: number): SheetSnapResolver {
    return (context) => clampVisibleExtent(extent, context);
  },
  viewportFraction(visibleFraction: number): SheetSnapResolver {
    return (context) => {
      const fraction = Math.min(1, finiteNonNegative(visibleFraction));
      return sheetPrimarySurfaceExtent(context) * fraction;
    };
  },
  intrinsicContent(context: SheetMeasureContext): number {
    return Math.min(
      sheetMaximumVisibleExtent(context),
      finiteNonNegative(context.intrinsicContentPrimaryExtent),
    );
  },
  safeArea(resolver: SheetSnapResolver): SheetSnapResolver {
    return (context) => {
      const descriptor = getSheetSideDescriptor(context.side);
      return clampVisibleExtent(
        resolver(context) + sheetSafeAreaInset(context, descriptor.attachedEdge),
        context,
      );
    };
  },
  min(...resolvers: readonly SheetSnapResolver[]): SheetSnapResolver {
    return (context) => Math.min(...resolvers.map((resolver) => resolver(context)));
  },
  max(...resolvers: readonly SheetSnapResolver[]): SheetSnapResolver {
    return (context) => Math.max(...resolvers.map((resolver) => resolver(context)));
  },
} as const;

/** Resolves semantic points to canonical positions while preserving duplicate IDs and positions. */
export function resolveSheetSnapPoints<Id extends string>(
  points: readonly SheetSnapPoint<Id>[],
  context: SheetMeasureContext,
): ResolvedSheetSnapPoint<Id>[] {
  const seen = new Set<Id>();
  const surfaceExtent = sheetPrimarySurfaceExtent(context);
  return points.map((point, order) => {
    if (!point.id || seen.has(point.id)) {
      throw new RangeError(`Sheet snap IDs must be unique non-empty strings: ${point.id}`);
    }
    seen.add(point.id);
    const disabled =
      typeof point.disabled === "function" ? point.disabled(context) : (point.disabled ?? false);
    const visibleExtent = clampVisibleExtent(point.resolveVisibleExtent(context), context);
    return {
      disabled,
      id: point.id,
      label: point.label,
      order,
      position: Math.max(0, surfaceExtent - visibleExtent),
      visibleExtent,
    };
  });
}

/** Creates the full, comfortable, and compact defaults used by vertical sheets. */
export function createViewportSheetSnapPoints(
  overrides: Partial<SheetViewportPolicy> = {},
): readonly SheetSnapPoint<SheetViewportSnapId>[] {
  const policy = { ...defaultSheetViewportPolicy, ...overrides };
  return [
    {
      id: "full",
      label: "Full",
      resolveVisibleExtent: sheetMaximumVisibleExtent,
    },
    {
      id: "comfortable",
      label: "Comfortable",
      resolveVisibleExtent: (context) =>
        Math.min(
          sheetMaximumVisibleExtent(context),
          finiteNonNegative(policy.comfortableExtent, defaultSheetViewportPolicy.comfortableExtent),
        ),
    },
    {
      id: "compact",
      label: "Compact",
      resolveVisibleExtent: (context) =>
        Math.min(
          sheetMaximumVisibleExtent(context),
          finiteNonNegative(policy.compactExtent, defaultSheetViewportPolicy.compactExtent),
        ),
    },
  ];
}

/** Creates the single fully open default used by fixed-width left and right sheets. */
export function createFixedSheetSnapPoints(): readonly SheetSnapPoint<SheetFixedSnapId>[] {
  return [{ id: "open", label: "Open", resolveVisibleExtent: sheetMaximumVisibleExtent }];
}

export function createDefaultSheetSnapPoints(
  side: SheetSide,
  overrides: Partial<SheetViewportPolicy> = {},
): readonly SheetSnapPoint<SheetOpenSnapId>[] {
  return getSheetSideDescriptor(side).axis === "y"
    ? createViewportSheetSnapPoints(overrides)
    : createFixedSheetSnapPoints();
}

export function defaultSheetOpenSnapId(side: SheetSide): SheetOpenSnapId {
  return getSheetSideDescriptor(side).axis === "y" ? "comfortable" : "open";
}

export const defaultSheetViewportPolicy: Readonly<SheetViewportPolicy> = {
  comfortableExtent: 620,
  compactExtent: 360,
  hiddenOvershoot: 160,
  minimumViewportExtent: 25,
  oppositeEdgeGap: 24,
};

export const defaultSheetReleasePolicy: Readonly<SheetReleasePolicy> = {
  closeVelocity: 1_100,
  expandVelocity: 1_100,
  projectionSeconds: 0.12,
};

export function resolveSheetSnapAnchors<Id extends string, HiddenId extends string>(
  points: readonly SheetSnapPoint<Id>[],
  context: SheetMeasureContext,
  hiddenId: HiddenId,
): readonly SheetSnapAnchor<Id | HiddenId>[] {
  const resolved = resolveSheetSnapPoints(points, context);
  const enabled = resolved.filter((point) => !point.disabled);
  if (enabled.length === 0) throw new RangeError("Sheets require at least one enabled snap point.");
  const openAnchors: SheetSnapAnchor<Id | HiddenId>[] = enabled.map((point) => ({
    id: point.id,
    order: point.order,
    position: point.position,
  }));
  const hiddenPosition =
    sheetPrimarySurfaceExtent(context) + finiteNonNegative(context.hiddenOvershoot);
  return [
    ...openAnchors,
    {
      id: hiddenId,
      order: Math.max(...resolved.map((point) => point.order)) + 1,
      position: hiddenPosition,
    },
  ];
}

function nearestAnchor<Id extends string>(
  anchors: readonly SheetSnapAnchor<Id>[],
  position: number,
) {
  const first = anchors[0];
  if (!first) throw new RangeError("Expected at least one sheet snap anchor.");
  return anchors.reduce((nearest, candidate) =>
    Math.abs(candidate.position - position) < Math.abs(nearest.position - position)
      ? candidate
      : nearest,
  );
}

export function resolveSheetReleaseAnchor<Id extends string, HiddenId extends string>(
  anchors: readonly SheetSnapAnchor<Id | HiddenId>[],
  hiddenId: HiddenId,
  position: number,
  velocity: number,
  overrides: Partial<SheetReleasePolicy> = {},
) {
  const policy = { ...defaultSheetReleasePolicy, ...overrides };
  const closeVelocity = finiteNonNegative(
    policy.closeVelocity,
    defaultSheetReleasePolicy.closeVelocity,
  );
  const expandVelocity = finiteNonNegative(
    policy.expandVelocity,
    defaultSheetReleasePolicy.expandVelocity,
  );
  const projectionSeconds = finiteNonNegative(
    policy.projectionSeconds,
    defaultSheetReleasePolicy.projectionSeconds,
  );
  const hidden = anchors.find((anchor) => anchor.id === hiddenId);
  const openAnchors = anchors.filter((anchor) => anchor.id !== hiddenId);
  const firstOpen = openAnchors[0];
  if (!hidden || !firstOpen) {
    throw new RangeError("Sheet release requires open and hidden anchors.");
  }
  const mostOpen = openAnchors.reduce((current, candidate) =>
    candidate.position < current.position ||
    (candidate.position === current.position && candidate.order < current.order)
      ? candidate
      : current,
  );
  const leastOpen = openAnchors.reduce((current, candidate) =>
    candidate.position > current.position ||
    (candidate.position === current.position && candidate.order > current.order)
      ? candidate
      : current,
  );
  if (velocity >= closeVelocity) return hidden;
  if (velocity <= -expandVelocity) return mostOpen;
  const projectedPosition = position + velocity * projectionSeconds;
  const closeBoundary = leastOpen.position + (hidden.position - leastOpen.position) / 2;
  if (projectedPosition >= closeBoundary) return hidden;
  return nearestAnchor(openAnchors, projectedPosition);
}

export function resolveSheetScrimOpacity<Id extends string, HiddenId extends string>(
  anchors: readonly SheetSnapAnchor<Id | HiddenId>[],
  hiddenId: HiddenId,
  position: number,
  maximumOpacity = 0.56,
) {
  const hidden = anchors.find((anchor) => anchor.id === hiddenId);
  const openAnchors = anchors.filter((anchor) => anchor.id !== hiddenId);
  if (!hidden || openAnchors.length === 0) return 0;
  const mostOpenPosition = Math.min(...openAnchors.map((anchor) => anchor.position));
  const range = Math.max(1, hidden.position - mostOpenPosition);
  const progress = 1 - Math.min(1, Math.max(0, (position - mostOpenPosition) / range));
  return Number((progress * finiteNonNegative(maximumOpacity)).toFixed(3));
}
