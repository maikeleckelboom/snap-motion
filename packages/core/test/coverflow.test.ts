import { describe, expect, it } from "vitest";

import type { CoverflowPresentation } from "../src";
import {
  createCoverflowGeometry,
  resolveCoverflowPresentation,
  resolveCoverflowProgress,
} from "../src";

describe("coverflow geometry", () => {
  it("places equal-pitch anchors on one scalar axis", () => {
    const geometry = createCoverflowGeometry({
      itemIds: ["a", "b", "c"],
      pitch: 240,
      viewportSize: 800,
    });
    expect(geometry.pitch).toBe(240);
    expect(geometry.bounds).toEqual({ min: -480, max: 0 });
    expect(geometry.anchors.map((anchor) => anchor.position)).toEqual([0, -240, -480]);
  });
});

describe("coverflow presentation", () => {
  it("keeps progress linear with controller position", () => {
    expect(resolveCoverflowProgress({ position: -120, anchorPosition: 0, pitch: 240 })).toBeCloseTo(
      -0.5,
    );
    expect(
      resolveCoverflowProgress({ position: -120, anchorPosition: -240, pitch: 240 }),
    ).toBeCloseTo(0.5);
  });

  it("keeps the center face solid and clear of side bleed", () => {
    const center = resolveCoverflowPresentation({ progress: 0, sidePeakX: 200 });
    expect(center.opacity).toBe(1);
    expect(center.translateX).toBe(0);
    expect(center.rotateY).toBe(0);
    expect(center.scale).toBe(1);
  });

  it("parks the first side card at the rail, then stacks deeper cards behind it", () => {
    const side = resolveCoverflowPresentation({
      progress: 1,
      sidePeakX: 200,
      stackGapX: 30,
      maxRotateY: 50,
      sideDepth: -120,
      stackGapZ: -40,
    });
    const deeper = resolveCoverflowPresentation({
      progress: 2,
      sidePeakX: 200,
      stackGapX: 30,
      maxRotateY: 50,
      sideDepth: -120,
      stackGapZ: -40,
    });

    expect(side.translateX).toBeCloseTo(200);
    expect(Math.abs(side.rotateY)).toBeCloseTo(50);
    expect(deeper.translateX).toBeCloseTo(230);
    expect(Math.abs(deeper.rotateY)).toBeCloseTo(50);
    expect(deeper.translateZ).toBeLessThan(side.translateZ);
    expect(deeper.zIndex).toBeLessThan(side.zIndex);
  });

  it("clears the center during the first half-step instead of piling cards", () => {
    const half = resolveCoverflowPresentation({
      progress: 0.5,
      sidePeakX: 200,
      maxRotateY: 50,
      sideOpacity: 1,
    });
    expect(half.translateX).toBeGreaterThan(50);
    expect(Math.abs(half.rotateY)).toBeGreaterThan(10);
    expect(half.opacity).toBe(1);
  });

  describe("rail projection", () => {
    const rail = {
      sidePeakX: 200,
      stackGapX: 40,
      sideDepth: -300,
      stackGapZ: -200,
      sideScale: 1,
    } as const;
    const perspective = 900;
    const projectedX = (panel: { translateX: number; translateZ: number }) =>
      (panel.translateX * perspective) / (perspective - panel.translateZ);

    it("lands the parked slot exactly where it was asked to land on screen", () => {
      const parked = resolveCoverflowPresentation({ progress: 1, ...rail, perspective });
      expect(projectedX(parked)).toBeCloseTo(200);
    });

    it("misses that slot without a camera distance, which is why the option exists", () => {
      // Pre-perspective units: the card is 300px back, so a nominal 200 arrives as 150 and the
      // whole fan sits tighter than it was specified.
      const parked = resolveCoverflowPresentation({ progress: 1, ...rail });
      expect(projectedX(parked)).toBeCloseTo(150);
    });

    it("lets the stack behind it converge the way real depth does", () => {
      // Compensation applies to travel only. A physical stack narrows as it recedes; forcing
      // even on-screen spacing all the way back would flatten exactly the cue we want.
      const slots = [1, 2, 3].map((progress) =>
        projectedX(
          resolveCoverflowPresentation({
            progress,
            ...rail,
            perspective,
            stackGap: 100,
            maxRotateY: 40,
          }),
        ),
      ) as [number, number, number];
      const [first, second, third] = slots;
      expect(second - first).toBeGreaterThan(12);
      expect(third - second).toBeGreaterThan(12);
      expect(third - second).toBeLessThan(second - first);
    });

    it("keeps the focused face tracking the pointer 1:1 on screen", () => {
      // Compensation is what makes this true: the card is receding as it leaves center, so
      // only the projected X — the one the finger is chasing — stays linear in progress.
      for (const progress of [0.15, 0.3, 0.6, 1]) {
        const panel = resolveCoverflowPresentation({ progress, ...rail, perspective });
        expect(projectedX(panel)).toBeCloseTo(progress * 200, 6);
      }
    });

    it("rejects a non-positive camera distance", () => {
      expect(() => resolveCoverflowPresentation({ progress: 1, perspective: 0 })).toThrow(
        RangeError,
      );
    });
  });

  it("tracks the pointer 1:1 across the first pitch", () => {
    for (const progress of [0.25, 0.5, 0.75, 1]) {
      const at = resolveCoverflowPresentation({ progress, sidePeakX: 200 });
      expect(at.translateX).toBeCloseTo(progress * 200);
    }
  });

  it("keeps yaw flat inside the center band without freezing translation", () => {
    const inside = resolveCoverflowPresentation({
      progress: 0.08,
      flatZone: 0.1,
      maxRotateY: 50,
      sidePeakX: 200,
    });
    expect(inside.rotateY).toBe(0);
    expect(inside.translateX).toBeCloseTo(16);

    const outside = resolveCoverflowPresentation({
      progress: 0.3,
      flatZone: 0.1,
      maxRotateY: 50,
      sidePeakX: 200,
    });
    expect(Math.abs(outside.rotateY)).toBeGreaterThan(0);
  });

  it("moves every channel monotonically, so nothing doubles back mid-step", () => {
    // A card that is approaching must only approach. A peaked crossover multiplier separates
    // the rails just as well on paper but makes an incoming card back away ~40px before it
    // comes forward — invisible in a still, a visible hitch at the start of every transition.
    for (const side of [1, -1]) {
      const path = Array.from({ length: 61 }, (_, step) =>
        resolveCoverflowPresentation({
          progress: (side * step) / 60,
          sideDepth: -300,
          maxRotateY: 40,
        }),
      );
      const reversals = path.filter((panel, index) => {
        const previous = path[index - 1];
        if (!previous) return false;
        return (
          panel.translateZ > previous.translateZ + 1e-9 ||
          Math.abs(panel.rotateY) < Math.abs(previous.rotateY) - 1e-9 ||
          Math.abs(panel.translateX) < Math.abs(previous.translateX) - 1e-9
        );
      });
      expect(reversals).toEqual([]);
    }
  });

  it("parks the stack as parallel panels on the rail plane", () => {
    // Offsets derived from the parked angle, so successive cards stay on the plane their own
    // yaw describes rather than diving off it at an unrelated rate.
    const rail = { maxRotateY: 40, sideDepth: -300, stackGap: 100, sidePeakX: 200 } as const;
    const [first, second, third] = [1, 2, 3].map((progress) =>
      resolveCoverflowPresentation({ progress, ...rail }),
    ) as [CoverflowPresentation, CoverflowPresentation, CoverflowPresentation];

    expect(second.rotateY).toBeCloseTo(first.rotateY);
    expect(third.rotateY).toBeCloseTo(first.rotateY);

    const stepX = second.translateX - first.translateX;
    const stepZ = second.translateZ - first.translateZ;
    expect(third.translateX - second.translateX).toBeCloseTo(stepX);
    expect(third.translateZ - second.translateZ).toBeCloseTo(stepZ);
    // The step is along the plane's normal: its angle matches the parked yaw.
    expect(Math.atan2(stepX, -stepZ) * (180 / Math.PI)).toBeCloseTo(40);
    expect(Math.hypot(stepX, stepZ)).toBeCloseTo(100);
  });

  it("breaks the mirror at the crossover so panels never share a silhouette", () => {
    const outgoing = resolveCoverflowPresentation({ progress: -0.5 });
    const incoming = resolveCoverflowPresentation({ progress: 0.5 });

    // Same |progress|, so a mirrored model would give identical depth and yaw magnitude — and
    // two mirrored panels meeting mid-overlap intersect along their shared centre line.
    expect(incoming.translateZ).toBeGreaterThan(outgoing.translateZ);
    expect(Math.abs(incoming.rotateY)).toBeLessThan(Math.abs(outgoing.rotateY));
    // Both panels are still whole rectangles at the same X magnitude.
    expect(incoming.translateX).toBeCloseTo(-outgoing.translateX);
  });

  it("keeps settled rails symmetric", () => {
    for (const step of [1, 2, 3]) {
      const left = resolveCoverflowPresentation({ progress: -step });
      const right = resolveCoverflowPresentation({ progress: step });
      expect(right.translateZ).toBeCloseTo(left.translateZ);
      expect(right.rotateY).toBeCloseTo(-left.rotateY);
      expect(right.scale).toBeCloseTo(left.scale);
    }
  });

  it("hands the foreground over exactly once across a step", () => {
    let handoffs = 0;
    let previous = 0;
    for (let step = 1; step < 100; step += 1) {
      const t = step / 100;
      const outgoing = resolveCoverflowPresentation({ progress: -t });
      const incoming = resolveCoverflowPresentation({ progress: 1 - t });
      const order = Math.sign(outgoing.zIndex - incoming.zIndex);
      expect(order).not.toBe(0);
      if (previous !== 0 && order !== previous) handoffs += 1;
      previous = order;
    }
    expect(handoffs).toBe(1);
  });

  it("keeps paint order consistent with the depth it reports", () => {
    // A preserve-3d renderer sorts on the transform, not on zIndex. If the two disagree, the
    // overlap flickers between orderings and reads as one folded sheet rather than two panels.
    for (let step = 1; step < 40; step += 1) {
      const t = step / 40;
      const outgoing = resolveCoverflowPresentation({ progress: -t });
      const incoming = resolveCoverflowPresentation({ progress: 1 - t });
      expect(Math.sign(outgoing.translateZ - incoming.translateZ)).toBe(
        Math.sign(outgoing.zIndex - incoming.zIndex),
      );
    }
  });

  it("never lets the two rails become mirror images at equal distance from center", () => {
    // The widest overlap is the frame where a mirrored pair would meet along a shared centre
    // line and read as a fold. The skew guarantees they are at different depths there.
    for (const t of [0.3, 0.5, 0.7]) {
      const left = resolveCoverflowPresentation({ progress: -t, sideDepth: -300 });
      const right = resolveCoverflowPresentation({ progress: t, sideDepth: -300 });
      expect(Math.abs(left.translateZ - right.translateZ)).toBeGreaterThan(20);
      expect(left.translateX).toBeCloseTo(-right.translateX, 6);
    }
  });

  it("never ties two panels on the same depth plane", () => {
    const planes = new Set<number>();
    for (let step = -6; step <= 6; step += 1) {
      planes.add(resolveCoverflowPresentation({ progress: step / 2 }).zIndex);
    }
    expect(planes.size).toBe(13);
  });

  it("reports orientation-dependent material cues", () => {
    const right = resolveCoverflowPresentation({ progress: 1, maxRotateY: 50 });
    const left = resolveCoverflowPresentation({ progress: -1, maxRotateY: 50 });
    const center = resolveCoverflowPresentation({ progress: 0 });

    expect(right.rotateY).toBeLessThan(0);
    expect(right.edgeSide).toBe(1);
    expect(left.edgeSide).toBe(-1);
    expect(center.edgeSide).toBe(0);
    expect(center.edgeStrength).toBe(0);
    expect(right.edgeStrength).toBeCloseTo(Math.sin((50 * Math.PI) / 180));
    expect(right.yaw).toBeCloseTo(-1);
    expect(right.depth).toBeCloseTo(1);
  });

  it("stacks yaw and scale past the first side slot", () => {
    const side = resolveCoverflowPresentation({
      progress: 1,
      maxRotateY: 30,
      stackGapRotateY: 5,
      sideScale: 0.94,
      stackGapScale: -0.05,
    });
    const deeper = resolveCoverflowPresentation({
      progress: 2,
      maxRotateY: 30,
      stackGapRotateY: 5,
      sideScale: 0.94,
      stackGapScale: -0.05,
    });

    expect(Math.abs(side.rotateY)).toBeCloseTo(30);
    expect(Math.abs(deeper.rotateY)).toBeCloseTo(35);
    expect(side.scale).toBeCloseTo(0.94);
    expect(deeper.scale).toBeCloseTo(0.89);
  });

  it("rejects out-of-range shaping options", () => {
    expect(() => resolveCoverflowPresentation({ progress: 0, flatZone: 1 })).toThrow(RangeError);
    expect(() => resolveCoverflowPresentation({ progress: 0, crossoverBias: -0.1 })).toThrow(
      RangeError,
    );
    expect(() =>
      resolveCoverflowPresentation({ progress: 0, crossoverBias: 0.2, crossoverYawBias: 0.3 }),
    ).toThrow(RangeError);
  });

  it("flattens under reduced motion", () => {
    const reduced = resolveCoverflowPresentation({
      progress: 1,
      reducedMotion: true,
      sidePeakX: 200,
    });
    expect(reduced.rotateY).toBe(0);
    expect(reduced.translateZ).toBe(0);
    expect(reduced.translateX).toBeCloseTo(200);
    expect(reduced.yaw).toBe(0);
    expect(reduced.edgeSide).toBe(0);
    expect(reduced.edgeStrength).toBe(0);
  });
});
