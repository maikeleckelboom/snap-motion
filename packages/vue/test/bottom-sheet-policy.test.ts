import { describe, expect, it } from "vitest";

import {
  resolveBottomSheetReleaseAnchor,
  resolveBottomSheetScrimOpacity,
  resolveBottomSheetSnapAnchors,
} from "../src/bottom-sheet-policy";

describe("bottom-sheet viewport policy", () => {
  it("resolves full, comfortable, compact, and hidden anchors", () => {
    expect(resolveBottomSheetSnapAnchors(800)).toEqual([
      { id: "full", order: 0, position: 24 },
      { id: "comfortable", order: 1, position: 180 },
      { id: "compact", order: 2, position: 440 },
      { id: "hidden", order: 3, position: 960 },
    ]);
  });

  it("preserves semantic identities when open anchors share a position", () => {
    expect(resolveBottomSheetSnapAnchors(300)).toEqual([
      { id: "full", order: 0, position: 24 },
      { id: "comfortable", order: 1, position: 24 },
      { id: "compact", order: 2, position: 24 },
      { id: "hidden", order: 3, position: 460 },
    ]);
  });

  it("normalizes invalid viewport input without a phantom panel height", () => {
    expect(resolveBottomSheetSnapAnchors(Number.NaN)).toEqual(resolveBottomSheetSnapAnchors(25));
  });

  it("falls back from non-finite viewport policy overrides", () => {
    expect(
      resolveBottomSheetSnapAnchors(800, {
        minimumViewportHeight: Number.NaN,
        topGap: Number.POSITIVE_INFINITY,
      }),
    ).toEqual(resolveBottomSheetSnapAnchors(800));
  });

  it("projects release velocity in pixels per second", () => {
    const anchors = resolveBottomSheetSnapAnchors(800);

    expect(resolveBottomSheetReleaseAnchor(anchors, 240, 700).id).toBe("compact");
    expect(resolveBottomSheetReleaseAnchor(anchors, 360, -700).id).toBe("comfortable");
  });

  it("uses decisive flings for close and full expansion", () => {
    const anchors = resolveBottomSheetSnapAnchors(800);

    expect(resolveBottomSheetReleaseAnchor(anchors, 260, 1_200).id).toBe("hidden");
    expect(resolveBottomSheetReleaseAnchor(anchors, 520, -1_200).id).toBe("full");
  });

  it("falls back from non-finite release policy overrides", () => {
    const anchors = resolveBottomSheetSnapAnchors(800);

    expect(
      resolveBottomSheetReleaseAnchor(anchors, 260, 1_200, {
        closeVelocity: Number.NaN,
        expandVelocity: Number.NaN,
        projectionSeconds: Number.NaN,
      }).id,
    ).toBe("hidden");
  });

  it("keeps the scrim coupled to physical sheet position", () => {
    const anchors = resolveBottomSheetSnapAnchors(800);

    expect(resolveBottomSheetScrimOpacity(anchors, 24)).toBe(0.56);
    expect(resolveBottomSheetScrimOpacity(anchors, 960)).toBe(0);
    expect(resolveBottomSheetScrimOpacity(anchors, 492)).toBe(0.28);
  });
});
