import { describe, expect, it } from "vitest";
import {
  nearestBottomSheetSnapTarget,
  releasedBottomSheetSnapTarget,
  resolveElasticDragOffset,
  resolveBottomSheetSnapTargets,
} from "./useBottomSheetMotion";

describe("bottom sheet snap motion", () => {
  it("resolves full, comfortable, compact, and hidden viewport offsets", () => {
    expect(
      resolveBottomSheetSnapTargets({
        panelHeight: 600,
        viewportHeight: 800,
      }),
    ).toEqual([
      { name: "full", offset: 24 },
      { name: "comfortable", offset: 180 },
      { name: "compact", offset: 440 },
      { name: "hidden", offset: 960 },
    ]);
  });

  it("does not move a visible snap target beyond the viewport top gap", () => {
    expect(
      resolveBottomSheetSnapTargets({
        panelHeight: 300,
        viewportHeight: 300,
      }),
    ).toEqual([
      { name: "full", offset: 24 },
      { name: "comfortable", offset: 24 },
      { name: "compact", offset: 24 },
      { name: "hidden", offset: 460 },
    ]);
  });

  it("finds the nearest snap target for slow releases", () => {
    const targets = resolveBottomSheetSnapTargets({
      panelHeight: 600,
      viewportHeight: 800,
    });

    expect(nearestBottomSheetSnapTarget(targets, 260).name).toBe("comfortable");
    expect(nearestBottomSheetSnapTarget(targets, 520).name).toBe("compact");
    expect(releasedBottomSheetSnapTarget(targets, 260, 0.2).name).toBe(
      "comfortable",
    );
  });

  it("projects velocity before resolving the release snap", () => {
    const targets = resolveBottomSheetSnapTargets({
      panelHeight: 600,
      viewportHeight: 800,
    });

    expect(releasedBottomSheetSnapTarget(targets, 240, 0.7).name).toBe("compact");
    expect(releasedBottomSheetSnapTarget(targets, 360, -0.7).name).toBe(
      "comfortable",
    );
  });

  it("clamps upward overdragged release geometry before choosing a snap", () => {
    const targets = resolveBottomSheetSnapTargets({
      panelHeight: 600,
      viewportHeight: 800,
    });

    expect(releasedBottomSheetSnapTarget(targets, -120, -1).name).toBe("full");
  });

  it("skips intermediate snap points for high-velocity flings", () => {
    const targets = resolveBottomSheetSnapTargets({
      panelHeight: 600,
      viewportHeight: 800,
    });

    expect(releasedBottomSheetSnapTarget(targets, 260, 1.2).name).toBe(
      "hidden",
    );
    expect(releasedBottomSheetSnapTarget(targets, 520, -1.2).name).toBe("full");
  });

  it("closes when release projects beyond compact", () => {
    const targets = resolveBottomSheetSnapTargets({
      panelHeight: 600,
      viewportHeight: 800,
    });

    expect(releasedBottomSheetSnapTarget(targets, 720, 0).name).toBe("hidden");
    expect(releasedBottomSheetSnapTarget(targets, 620, 0).name).toBe("compact");
  });

  it("bounds positive elastic drag offsets normally", () => {
    expect(resolveElasticDragOffset(180, 24, 800)).toBe(180);
    expect(resolveElasticDragOffset(920, 24, 800)).toBe(800);
  });

  it("keeps the minimum legal drag offset at the top gap", () => {
    expect(resolveElasticDragOffset(24, 24, 800)).toBe(24);
  });

  it("turns upward raw drag into limited elastic overscroll", () => {
    const offset = resolveElasticDragOffset(-40, 24, 800, {
      elasticResistance: 64,
      maxElasticOverscroll: 32,
    });

    expect(offset).toBeLessThan(24);
    expect(offset).toBeGreaterThan(-40);
  });

  it("never moves elastic overscroll beyond the configured max", () => {
    const offset = resolveElasticDragOffset(-100_000, 24, 800, {
      elasticResistance: 64,
      maxElasticOverscroll: 32,
    });

    expect(offset).toBeLessThan(24);
    expect(offset).toBeGreaterThanOrEqual(-8);
  });

  it("resolves release from elastic overscroll back to full", () => {
    const targets = resolveBottomSheetSnapTargets({
      panelHeight: 600,
      viewportHeight: 800,
    });

    expect(releasedBottomSheetSnapTarget(targets, -24, -0.8).name).toBe(
      "full",
    );
    expect(releasedBottomSheetSnapTarget(targets, -24, 0.8).name).toBe("full");
  });
});
