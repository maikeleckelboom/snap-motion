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
