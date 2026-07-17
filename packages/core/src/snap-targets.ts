import { assertFiniteNumber, assertNonNegative, clampToBounds, createBounds } from "./bounds.js";
import { projectPosition } from "./projection.js";
import type {
  ReleaseTargetPolicy,
  ScalarBounds,
  SemanticId,
  SnapAnchor,
  SnapDirection,
} from "./types.js";

const DISTANCE_EPSILON = 1e-9;

export interface NearestAnchorOptions<Id extends SemanticId = SemanticId> {
  readonly activeId?: Id | null;
  readonly direction?: SnapDirection | null;
}

export interface ReleaseTargetInput<Id extends SemanticId = SemanticId> {
  readonly anchors: readonly SnapAnchor<Id>[];
  readonly position: number;
  readonly velocity: number;
  readonly activeId?: Id | null;
  readonly policy: ReleaseTargetPolicy;
}

export interface ProgrammaticTargetInput<Id extends SemanticId = SemanticId> {
  readonly anchors: readonly SnapAnchor<Id>[];
  readonly activeId: Id;
  readonly direction: SnapDirection;
  readonly steps?: number;
}

function validateDirection(direction: SnapDirection): void {
  if (direction !== -1 && direction !== 1) {
    throw new RangeError("direction must be -1 or 1");
  }
}

function validateAnchor<Id extends SemanticId>(anchor: SnapAnchor<Id>): void {
  if (typeof anchor.id !== "string" || anchor.id.length === 0) {
    throw new TypeError("anchor.id must be a non-empty string");
  }
  assertFiniteNumber(anchor.position, `anchor(${anchor.id}).position`);
  assertFiniteNumber(anchor.order, `anchor(${anchor.id}).order`);
}

export function sortAnchors<Id extends SemanticId>(
  anchors: readonly SnapAnchor<Id>[],
): readonly SnapAnchor<Id>[] {
  const ids = new Set<Id>();
  const indexed = anchors.map((anchor, index) => {
    validateAnchor(anchor);
    if (ids.has(anchor.id)) {
      throw new RangeError(`anchor id must be unique: ${anchor.id}`);
    }
    ids.add(anchor.id);
    return { anchor: { ...anchor }, index };
  });

  indexed.sort((left, right) => left.anchor.order - right.anchor.order || left.index - right.index);
  return indexed.map(({ anchor }) => anchor);
}

export function clampAnchorsToBounds<Id extends SemanticId>(
  anchors: readonly SnapAnchor<Id>[],
  bounds: ScalarBounds,
): readonly SnapAnchor<Id>[] {
  const validBounds = createBounds(bounds.min, bounds.max);
  return sortAnchors(anchors).map((anchor) => ({
    ...anchor,
    position: clampToBounds(anchor.position, validBounds),
  }));
}

export function findAnchorById<Id extends SemanticId>(
  anchors: readonly SnapAnchor<Id>[],
  id: Id | null | undefined,
): SnapAnchor<Id> | null {
  if (id === null || id === undefined) {
    return null;
  }
  return anchors.find((anchor) => anchor.id === id) ?? null;
}

export function nearestAnchor<Id extends SemanticId>(
  anchors: readonly SnapAnchor<Id>[],
  position: number,
  options: NearestAnchorOptions<Id> = {},
): SnapAnchor<Id> | null {
  assertFiniteNumber(position, "position");
  const ordered = sortAnchors(anchors);
  let closest: SnapAnchor<Id> | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const anchor of ordered) {
    const distance = Math.abs(anchor.position - position);
    if (distance < closestDistance - DISTANCE_EPSILON) {
      closest = anchor;
      closestDistance = distance;
      continue;
    }

    if (Math.abs(distance - closestDistance) > DISTANCE_EPSILON || closest === null) {
      continue;
    }

    const anchorIsActive = anchor.id === options.activeId;
    const closestIsActive = closest.id === options.activeId;
    if (anchorIsActive !== closestIsActive) {
      if (anchorIsActive) closest = anchor;
      continue;
    }

    if (options.direction === 1 && anchor.order > closest.order) {
      closest = anchor;
    } else if (options.direction === -1 && anchor.order < closest.order) {
      closest = anchor;
    }
  }

  return closest;
}

export function directionalAnchor<Id extends SemanticId>(
  anchors: readonly SnapAnchor<Id>[],
  activeId: Id,
  direction: SnapDirection,
  steps = 1,
): SnapAnchor<Id> | null {
  validateDirection(direction);
  assertNonNegative(steps, "steps");
  if (!Number.isInteger(steps)) {
    throw new RangeError("steps must be an integer");
  }

  const ordered = sortAnchors(anchors);
  const currentIndex = ordered.findIndex((anchor) => anchor.id === activeId);
  if (currentIndex < 0) {
    return null;
  }

  const targetIndex = Math.min(ordered.length - 1, Math.max(0, currentIndex + direction * steps));
  return ordered[targetIndex] ?? null;
}

export function validateReleaseTargetPolicy(policy: ReleaseTargetPolicy): void {
  assertNonNegative(policy.projectionSeconds, "policy.projectionSeconds");
  assertNonNegative(policy.flingVelocity, "policy.flingVelocity");
  assertNonNegative(policy.maxAnchorSkip, "policy.maxAnchorSkip");
  if (!Number.isInteger(policy.maxAnchorSkip)) {
    throw new RangeError("policy.maxAnchorSkip must be an integer");
  }
  validateDirection(policy.forwardSign);
}

export function resolveReleaseTarget<Id extends SemanticId>(
  input: ReleaseTargetInput<Id>,
): SnapAnchor<Id> | null {
  const { position, velocity, policy } = input;
  assertFiniteNumber(position, "position");
  assertFiniteNumber(velocity, "velocity");
  validateReleaseTargetPolicy(policy);

  const ordered = sortAnchors(input.anchors);
  if (ordered.length === 0) {
    return null;
  }

  const base =
    findAnchorById(ordered, input.activeId) ??
    nearestAnchor<Id>(
      ordered,
      position,
      input.activeId === undefined ? {} : { activeId: input.activeId },
    );
  if (base === null) {
    return null;
  }

  if (Math.abs(velocity) < policy.flingVelocity) {
    return nearestAnchor<Id>(ordered, position, { activeId: base.id });
  }

  if (policy.maxAnchorSkip === 0) {
    return base;
  }

  const direction: SnapDirection = velocity * policy.forwardSign > 0 ? 1 : -1;
  const projected = projectPosition(position, velocity, policy.projectionSeconds);
  const projectedTarget = nearestAnchor<Id>(ordered, projected, {
    activeId: base.id,
    direction,
  });
  const baseIndex = ordered.findIndex((anchor) => anchor.id === base.id);
  const projectedIndex = projectedTarget
    ? ordered.findIndex((anchor) => anchor.id === projectedTarget.id)
    : baseIndex;
  const projectedSteps = (projectedIndex - baseIndex) * direction;
  const steps = Math.min(policy.maxAnchorSkip, Math.max(1, projectedSteps));
  const targetIndex = Math.min(ordered.length - 1, Math.max(0, baseIndex + direction * steps));
  return ordered[targetIndex] ?? base;
}

export function resolveProgrammaticTarget<Id extends SemanticId>(
  input: ProgrammaticTargetInput<Id>,
): SnapAnchor<Id> | null {
  return directionalAnchor(input.anchors, input.activeId, input.direction, input.steps ?? 1);
}
