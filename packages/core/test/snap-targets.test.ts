import { describe, expect, it } from "vitest";

import {
  clampAnchorsToBounds,
  directionalAnchor,
  nearestAnchor,
  projectPosition,
  resolveProgrammaticTarget,
  resolveReleaseTarget,
  sortAnchors,
  type ReleaseTargetPolicy,
  type SnapAnchor,
} from "../src";

type AnchorId = "a" | "b" | "c" | "d";

const anchors: readonly SnapAnchor<AnchorId>[] = [
  { id: "a", order: 0, position: 0 },
  { id: "b", order: 1, position: -100 },
  { id: "c", order: 2, position: -200 },
  { id: "d", order: 3, position: -300 },
];

const policy: ReleaseTargetPolicy = {
  projectionSeconds: 0.2,
  flingVelocity: 400,
  maxAnchorSkip: 2,
  forwardSign: -1,
};

describe("projection", () => {
  it("uses CSS pixels, pixels per second, and seconds without hidden conversion", () => {
    expect(projectPosition(-100, -500, 0.2)).toBe(-200);
    expect(projectPosition(40, 1200, 0)).toBe(40);
  });

  it("rejects a negative projection duration", () => {
    expect(() => projectPosition(0, 10, -0.1)).toThrow(/durationSeconds/);
  });
});

describe("semantic anchor policies", () => {
  it("sorts by logical order while preserving stable input order for equal orders", () => {
    const sorted = sortAnchors([
      { id: "c", order: 2, position: -200 },
      { id: "a", order: 0, position: 0 },
      { id: "b", order: 2, position: -100 },
    ] as const);
    expect(sorted.map((anchor) => anchor.id)).toEqual(["a", "c", "b"]);
  });

  it("keeps distinct semantic IDs when legal clamping creates duplicate positions", () => {
    const clamped = clampAnchorsToBounds(
      [
        { id: "a", order: 0, position: 0 },
        { id: "b", order: 1, position: -200 },
        { id: "c", order: 2, position: -300 },
      ] as const,
      { min: -150, max: 0 },
    );
    expect(clamped).toHaveLength(3);
    expect(clamped.map((anchor) => anchor.position)).toEqual([0, -150, -150]);
    expect(clamped.map((anchor) => anchor.id)).toEqual(["a", "b", "c"]);
  });

  it("uses active identity, direction, then lower logical order for stable ties", () => {
    expect(nearestAnchor(anchors, -50)?.id).toBe("a");
    expect(nearestAnchor(anchors, -50, { direction: 1 })?.id).toBe("b");
    expect(nearestAnchor(anchors, -50, { activeId: "b", direction: -1 })?.id).toBe("b");
  });

  it("moves directionally without looping at either boundary", () => {
    expect(directionalAnchor(anchors, "b", 1)?.id).toBe("c");
    expect(directionalAnchor(anchors, "a", -1)?.id).toBe("a");
    expect(directionalAnchor(anchors, "d", 1)?.id).toBe("d");
  });

  it("returns the nearest anchor for a slow release", () => {
    expect(
      resolveReleaseTarget({
        anchors,
        position: -135,
        velocity: -50,
        activeId: "b",
        policy,
      })?.id,
    ).toBe("b");
    expect(
      resolveReleaseTarget({
        anchors,
        position: -165,
        velocity: -50,
        activeId: "b",
        policy,
      })?.id,
    ).toBe("c");
  });

  it("advances at least one semantic anchor for a decisive fling", () => {
    expect(
      resolveReleaseTarget({
        anchors,
        position: -100,
        velocity: -450,
        activeId: "b",
        policy: { ...policy, projectionSeconds: 0 },
      })?.id,
    ).toBe("c");
  });

  it("resolves forward and backward velocity using the explicit physical sign", () => {
    expect(
      resolveReleaseTarget({
        anchors,
        position: -100,
        velocity: -900,
        activeId: "b",
        policy,
      })?.id,
    ).toBe("d");
    expect(
      resolveReleaseTarget({
        anchors,
        position: -200,
        velocity: 900,
        activeId: "c",
        policy,
      })?.id,
    ).toBe("a");
  });

  it("caps fling skips and clamps non-looping ends", () => {
    expect(
      resolveReleaseTarget({
        anchors,
        position: 0,
        velocity: -10_000,
        activeId: "a",
        policy: { ...policy, maxAnchorSkip: 1 },
      })?.id,
    ).toBe("b");
    expect(
      resolveReleaseTarget({
        anchors,
        position: -300,
        velocity: -10_000,
        activeId: "d",
        policy,
      })?.id,
    ).toBe("d");
  });

  it("advances semantically across duplicate physical positions", () => {
    const duplicates = [
      { id: "a", order: 0, position: 0 },
      { id: "b", order: 1, position: 0 },
      { id: "c", order: 2, position: -100 },
    ] as const;
    expect(nearestAnchor(duplicates, 0, { activeId: "b" })?.id).toBe("b");
    expect(
      resolveReleaseTarget({
        anchors: duplicates,
        position: 0,
        velocity: -500,
        activeId: "a",
        policy: { ...policy, projectionSeconds: 0, maxAnchorSkip: 1 },
      })?.id,
    ).toBe("b");
  });

  it("resolves programmatic steps by semantic order", () => {
    expect(resolveProgrammaticTarget({ anchors, activeId: "a", direction: 1, steps: 2 })?.id).toBe(
      "c",
    );
    expect(resolveProgrammaticTarget({ anchors, activeId: "d", direction: -1, steps: 8 })?.id).toBe(
      "a",
    );
  });
});
