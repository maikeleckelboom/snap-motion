import { describe, expect, it } from "vitest";

import {
  createStackedDeckFrame,
  createStackedDeckTraversal,
  resolveStackedDeckFrame,
  resolveStackedDeckNeighbor,
  resolveStackedDeckTraversal,
  resolveStackedDeckTuning,
  type StackedDeckPose,
} from "../src/stackedDeck";

const tuning = resolveStackedDeckTuning({ stageWidth: 912, stageHeight: 510.72 });

function sample(
  landingSettlement: number,
  options: {
    itemCount?: number;
    originIndex?: number;
    direction?: -1 | 1;
    signedTravel?: number;
    parkingSettlement?: number;
    rawY?: number;
    landing?: boolean;
  } = {},
) {
  const itemCount = options.itemCount ?? 5;
  const originIndex = options.originIndex ?? 4;
  const direction = options.direction ?? -1;
  const signedTravel = options.signedTravel ?? direction * 0.9684817737866358;
  const targetIndex = resolveStackedDeckNeighbor(originIndex, direction, itemCount);
  const traversal = createStackedDeckTraversal(originIndex, itemCount);
  resolveStackedDeckTraversal(
    {
      controllerPhase: "settling",
      itemCount,
      originIndex,
      physicalPosition: signedTravel,
      settledIndex: originIndex,
    },
    traversal,
  );
  return resolveStackedDeckFrame(
    {
      itemCount,
      tuning,
      traversal,
      direct: {
        originIndex,
        targetIndex,
        direction,
        signedTravel,
        phase: "parking",
        settlement: options.parkingSettlement ?? 0.7218047092956379,
        translateX: -direction * 223.947,
        translateY: options.rawY ?? 0,
      },
      ...(options.landing === false
        ? {}
        : {
            landings: [
              {
                itemIndex: targetIndex,
                releaseOrder: 32,
                translateX: direction * 447,
                translateY: 100,
                settlement: landingSettlement,
              },
            ],
          }),
    },
    createStackedDeckFrame(itemCount),
  );
}

function contains(pose: StackedDeckPose, x: number, y: number) {
  const radians = (-pose.rotate * Math.PI) / 180;
  const dx = x - pose.translateX;
  const dy = y - pose.translateY;
  return (
    pose.visible &&
    pose.opacity > 0 &&
    pose.scale > 0 &&
    Math.abs((dx * Math.cos(radians) - dy * Math.sin(radians)) / pose.scale) <
      tuning.cardWidth / 2 &&
    Math.abs((dx * Math.sin(radians) + dy * Math.cos(radians)) / pose.scale) < tuning.cardHeight / 2
  );
}

function ownerAt(poses: readonly StackedDeckPose[], x: number, y: number) {
  let owner = -1;
  for (let index = 0; index < poses.length; index += 1) {
    if (
      contains(poses[index]!, x, y) &&
      (owner < 0 || poses[index]!.layer >= poses[owner]!.layer)
    ) {
      owner = index;
    }
  }
  return owner;
}

describe("Direct landing and departing-source paint handoff", () => {
  it("does not exchange exposed material when a delayed neutral shell changes depth", () => {
    // Reduced from a computed paint-order trace failure. These adjacent values straddle the
    // neutral shell's exact layer change while its geometry is identical at machine precision.
    const before = sample(0.9616696540409815);
    const after = sample(0.9616696540409816);
    const { translateX: x, translateY: y } = before.poses[0]!;
    expect(contains(before.poses[4]!, x, y)).toBe(true);
    expect(contains(after.poses[4]!, x, y)).toBe(true);
    expect(contains(before.poses[3]!, x, y)).toBe(false);
    expect(contains(after.poses[3]!, x, y)).toBe(false);
    expect(ownerAt(before.poses, x, y)).toBe(ownerAt(after.poses, x, y));
  });

  it("keeps cyclic neutral-cover depth changes occluded across parking and landing progress", () => {
    const failures: string[] = [];
    for (const itemCount of [3, 5, 8]) {
      for (const originIndex of [0, itemCount - 1]) {
        const neutralIndex = resolveStackedDeckNeighbor(originIndex, 1, itemCount);
        for (const parkingSettlement of [0.1, 0.4, 0.5, 0.72, 0.97, 1]) {
          for (const rawY of [-200, 0, 250]) {
            const options = {
              itemCount,
              originIndex,
              direction: -1 as const,
              parkingSettlement,
              rawY,
            };
            let beforeSettlement = 0;
            let afterSettlement = 1;
            const initialLayer = sample(0, options).poses[neutralIndex]!.layer;
            // Find the actual rank boundary, including a delayed landing's nonlinear availability.
            for (let iteration = 0; iteration < 60; iteration += 1) {
              const middle = (beforeSettlement + afterSettlement) / 2;
              if (sample(middle, options).poses[neutralIndex]!.layer === initialLayer) {
                beforeSettlement = middle;
              } else {
                afterSettlement = middle;
              }
            }
            const before = sample(beforeSettlement, options).poses;
            const after = sample(afterSettlement, options).poses;
            for (const pose of [...before, ...after]) {
              const { translateX: x, translateY: y } = pose;
              const previousOwner = ownerAt(before, x, y);
              const nextOwner = ownerAt(after, x, y);
              if (previousOwner !== nextOwner) {
                failures.push(
                  `${itemCount}/${originIndex}/${parkingSettlement}/${rawY}: ${previousOwner}->${nextOwner} at ${x},${y}`,
                );
              }
            }
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it("preserves raw-Y independence and exact landing retirement in both cyclic directions", () => {
    for (const itemCount of [2, 3, 5, 8]) {
      for (const originIndex of [0, itemCount - 1]) {
        for (const direction of [-1, 1] as const) {
          for (const signedTravel of [
            direction * 0.15,
            direction * 0.5,
            direction * 0.97,
            direction,
          ]) {
            for (const parkingSettlement of [0.1, 0.5, 0.72, 1]) {
              const options = {
                itemCount,
                originIndex,
                direction,
                signedTravel,
                parkingSettlement,
              };
              const withoutLanding = sample(1, { ...options, landing: false }).poses;
              const arrived = sample(1, options).poses;
              for (let index = 0; index < itemCount; index += 1) {
                const { interactive: _beforeInteractive, ...before } = arrived[index]!;
                const { interactive: _afterInteractive, ...after } = withoutLanding[index]!;
                expect(before).toEqual(after);
              }
              for (const settlement of [0, 0.25, 0.5, 0.75, 0.95, 1]) {
                const level = sample(settlement, options).poses;
                const vertical = sample(settlement, { ...options, rawY: 250 }).poses;
                expect(level.filter((_pose, index) => index !== originIndex)).toEqual(
                  vertical.filter((_pose, index) => index !== originIndex),
                );
              }
            }
          }
        }
      }
    }
  });
});
