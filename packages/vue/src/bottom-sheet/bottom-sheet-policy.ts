/** Semantic viewport and release policy for the bottom-sheet feature. */
export type BottomSheetOpenSnapId = "compact" | "comfortable" | "full";
export type BottomSheetSnapId = BottomSheetOpenSnapId | "hidden";

export interface BottomSheetSnapAnchor {
  id: BottomSheetSnapId;
  order: number;
  position: number;
}

export interface BottomSheetViewportPolicy {
  comfortableHeight: number;
  compactHeight: number;
  hiddenOvershoot: number;
  minimumViewportHeight: number;
  topGap: number;
}

export interface BottomSheetReleasePolicy {
  closeVelocity: number;
  expandVelocity: number;
  projectionSeconds: number;
}

export interface BottomSheetMeasureContext {
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly visualViewportHeight: number;
  readonly panelIntrinsicSize: number;
  readonly safeAreaTop: number;
  readonly safeAreaBottom: number;
  readonly topGap: number;
  readonly closedOffset: number;
}

/** A semantic open bottom-sheet position. Hidden remains an internal closing state. */
export interface BottomSheetSnapPoint<Id extends string> {
  readonly id: Id;
  readonly label: string;
  readonly resolve: (context: BottomSheetMeasureContext) => number;
  readonly disabled?: boolean | ((context: BottomSheetMeasureContext) => boolean);
}

export interface ResolvedBottomSheetSnapPoint<Id extends string> {
  readonly disabled: boolean;
  readonly id: Id;
  readonly label: string;
  readonly order: number;
  readonly position: number;
}

export type BottomSheetSnapResolver = (context: BottomSheetMeasureContext) => number;

function finitePosition(value: number, fallback: number) {
  return Number.isFinite(value) ? Math.max(0, value) : fallback;
}

export const bottomSheetSnapPosition = {
  pixels(position: number): BottomSheetSnapResolver {
    return () => finitePosition(position, 0);
  },
  viewportFraction(visibleFraction: number): BottomSheetSnapResolver {
    return (context) => {
      const fraction = Math.min(1, Math.max(0, finitePosition(visibleFraction, 0)));
      return context.visualViewportHeight * (1 - fraction);
    };
  },
  intrinsicContent(context: BottomSheetMeasureContext): number {
    return Math.max(
      context.topGap + context.safeAreaTop,
      context.visualViewportHeight - context.panelIntrinsicSize - context.safeAreaBottom,
    );
  },
  safeArea(resolver: BottomSheetSnapResolver): BottomSheetSnapResolver {
    return (context) =>
      Math.max(context.topGap + context.safeAreaTop, resolver(context) - context.safeAreaBottom);
  },
  min(...resolvers: readonly BottomSheetSnapResolver[]): BottomSheetSnapResolver {
    return (context) => Math.min(...resolvers.map((resolver) => resolver(context)));
  },
  max(...resolvers: readonly BottomSheetSnapResolver[]): BottomSheetSnapResolver {
    return (context) => Math.max(...resolvers.map((resolver) => resolver(context)));
  },
} as const;

/** Resolves semantic snap points while retaining duplicate physical positions and disabled IDs. */
export function resolveBottomSheetSnapPoints<Id extends string>(
  points: readonly BottomSheetSnapPoint<Id>[],
  context: BottomSheetMeasureContext,
): ResolvedBottomSheetSnapPoint<Id>[] {
  const seen = new Set<Id>();
  return points.map((point, order) => {
    if (!point.id || seen.has(point.id)) {
      throw new RangeError(`Bottom-sheet snap IDs must be unique non-empty strings: ${point.id}`);
    }
    seen.add(point.id);
    const disabled =
      typeof point.disabled === "function" ? point.disabled(context) : (point.disabled ?? false);
    return {
      disabled,
      id: point.id,
      label: point.label,
      order,
      position: finitePosition(point.resolve(context), context.topGap),
    };
  });
}

/** Creates the built-in full, comfortable, and compact viewport preset. */
export function createViewportBottomSheetSnapPoints(
  overrides: Partial<BottomSheetViewportPolicy> = {},
): readonly BottomSheetSnapPoint<BottomSheetOpenSnapId>[] {
  const policy = { ...defaultBottomSheetViewportPolicy, ...overrides };
  return [
    {
      id: "full",
      label: "Full",
      resolve: (context) => context.topGap,
    },
    {
      id: "comfortable",
      label: "Comfortable",
      resolve: (context) =>
        Math.max(context.topGap, context.visualViewportHeight - policy.comfortableHeight),
    },
    {
      id: "compact",
      label: "Compact",
      resolve: (context) =>
        Math.max(context.topGap, context.visualViewportHeight - policy.compactHeight),
    },
  ];
}

export const defaultBottomSheetViewportPolicy: Readonly<BottomSheetViewportPolicy> = {
  comfortableHeight: 620,
  compactHeight: 360,
  hiddenOvershoot: 160,
  minimumViewportHeight: 25,
  topGap: 24,
};

export const defaultBottomSheetReleasePolicy: Readonly<BottomSheetReleasePolicy> = {
  closeVelocity: 1_100,
  expandVelocity: 1_100,
  projectionSeconds: 0.12,
};

function finiteNonNegative(value: number, fallback: number) {
  return Number.isFinite(value) ? Math.max(0, value) : fallback;
}

function normalizedViewportHeight(viewportHeight: number, policy: BottomSheetViewportPolicy) {
  const topGap = finiteNonNegative(policy.topGap, defaultBottomSheetViewportPolicy.topGap);
  const minimumViewportHeight = finiteNonNegative(
    policy.minimumViewportHeight,
    defaultBottomSheetViewportPolicy.minimumViewportHeight,
  );
  const minimum = Math.max(topGap + 1, minimumViewportHeight);
  return Math.max(minimum, Math.round(finiteNonNegative(viewportHeight, minimum)));
}

export function resolveBottomSheetSnapAnchors(
  viewportHeight: number,
  overrides: Partial<BottomSheetViewportPolicy> = {},
): BottomSheetSnapAnchor[] {
  const policy = { ...defaultBottomSheetViewportPolicy, ...overrides };
  const viewport = normalizedViewportHeight(viewportHeight, policy);
  const topGap = finiteNonNegative(policy.topGap, defaultBottomSheetViewportPolicy.topGap);
  const maximumVisibleHeight = Math.max(1, viewport - topGap);
  const comfortableHeight = Math.min(
    finiteNonNegative(policy.comfortableHeight, 620),
    maximumVisibleHeight,
  );
  const compactHeight = Math.min(
    finiteNonNegative(policy.compactHeight, 360),
    maximumVisibleHeight,
  );
  const hiddenOvershoot = finiteNonNegative(policy.hiddenOvershoot, 160);

  return [
    { id: "full", order: 0, position: topGap },
    { id: "comfortable", order: 1, position: viewport - comfortableHeight },
    { id: "compact", order: 2, position: viewport - compactHeight },
    { id: "hidden", order: 3, position: viewport + hiddenOvershoot },
  ];
}

function anchorById(anchors: readonly BottomSheetSnapAnchor[], id: BottomSheetSnapId) {
  const anchor = anchors.find((candidate) => candidate.id === id);
  if (!anchor) {
    throw new Error(`Missing bottom-sheet snap anchor: ${id}`);
  }
  return anchor;
}

function nearestOpenAnchor(anchors: readonly BottomSheetSnapAnchor[], position: number) {
  const openAnchors = anchors.filter((anchor) => anchor.id !== "hidden");
  const first = openAnchors[0];
  if (!first) {
    throw new Error("Expected at least one open bottom-sheet snap anchor.");
  }

  return openAnchors.reduce((nearest, candidate) => {
    const nearestDistance = Math.abs(nearest.position - position);
    const candidateDistance = Math.abs(candidate.position - position);
    return candidateDistance < nearestDistance ? candidate : nearest;
  }, first);
}

export function resolveBottomSheetReleaseAnchor(
  anchors: readonly BottomSheetSnapAnchor[],
  position: number,
  velocity: number,
  overrides: Partial<BottomSheetReleasePolicy> = {},
) {
  const policy = { ...defaultBottomSheetReleasePolicy, ...overrides };
  const closeVelocity = finiteNonNegative(
    policy.closeVelocity,
    defaultBottomSheetReleasePolicy.closeVelocity,
  );
  const expandVelocity = finiteNonNegative(
    policy.expandVelocity,
    defaultBottomSheetReleasePolicy.expandVelocity,
  );
  const projectionSeconds = finiteNonNegative(
    policy.projectionSeconds,
    defaultBottomSheetReleasePolicy.projectionSeconds,
  );
  const full = anchorById(anchors, "full");
  const compact = anchorById(anchors, "compact");
  const hidden = anchorById(anchors, "hidden");

  if (velocity >= closeVelocity) {
    return hidden;
  }
  if (velocity <= -expandVelocity) {
    return full;
  }

  const projectedPosition = position + velocity * projectionSeconds;
  const closeBoundary = compact.position + (hidden.position - compact.position) / 2;
  if (projectedPosition >= closeBoundary) {
    return hidden;
  }

  return nearestOpenAnchor(
    anchors,
    Math.max(full.position, Math.min(projectedPosition, hidden.position)),
  );
}

export function resolveBottomSheetScrimOpacity(
  anchors: readonly BottomSheetSnapAnchor[],
  position: number,
  maximumOpacity = 0.56,
) {
  const full = anchorById(anchors, "full");
  const hidden = anchorById(anchors, "hidden");
  const range = Math.max(1, hidden.position - full.position);
  const progress = 1 - Math.min(1, Math.max(0, (position - full.position) / range));
  const opacity = finiteNonNegative(maximumOpacity, 0);
  return Number((progress * opacity).toFixed(3));
}
