import { describe, expect, it } from "vitest";

import budgets from "../../../config/performance-budgets.json";
import { SnapController, type SnapAnchor } from "../src";
import { DeterministicAnimationDriver } from "./fake-animation-driver";

function anchorsFor(count: number): SnapAnchor<string>[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `item-${index}`,
    order: index,
    position: index * -100,
  }));
}

function createMeasuredController(itemCount: number) {
  const driver = new DeterministicAnimationDriver();
  let publications = 0;
  const controller = new SnapController({
    anchors: anchorsFor(itemCount),
    bounds: { min: Math.min(0, (itemCount - 1) * -100), max: 0 },
    driver,
    initialTargetId: "item-0",
    onChange: () => {
      publications += 1;
    },
  });
  return { controller, driver, publications: () => publications };
}

function activeAnimationCount(driver: DeterministicAnimationDriver) {
  return driver.runs.filter((run) => !run.completed && !run.stopped).length;
}

describe("controller performance proxy budgets", () => {
  it.each([60, 120])(
    "publishes at most once per %i Hz drag sample plus lifecycle overhead",
    (hz) => {
      const { controller, driver, publications } = createMeasuredController(20);
      controller.beginDrag();
      for (let sample = 1; sample <= hz; sample += 1) controller.dragTo(-sample * 2);
      controller.release(-240);

      expect(publications()).toBeLessThanOrEqual(hz + budgets.dragPublicationOverhead);
      expect(activeAnimationCount(driver)).toBeLessThanOrEqual(
        budgets.maxActiveAnimationsPerController,
      );
    },
  );

  it("keeps interruption bursts to one active animation", () => {
    const { controller, driver } = createMeasuredController(1_000);
    for (let action = 0; action < budgets.navigationBurstActions; action += 1) {
      if (action % 2 === 0) controller.next();
      else controller.previous();
      driver.update(action % 2 === 0 ? -25 : -75, action % 2 === 0 ? -200 : 200);
      expect(activeAnimationCount(driver)).toBeLessThanOrEqual(
        budgets.maxActiveAnimationsPerController,
      );
    }
  });

  it.each([1, 20, 100, 1_000])("keeps navigation state bounded for %i semantic items", (count) => {
    const { controller, driver } = createMeasuredController(count);
    for (let action = 0; action < Math.min(count, 100); action += 1) controller.next();
    expect(controller.snapshot.anchors).toHaveLength(count);
    expect(activeAnimationCount(driver)).toBeLessThanOrEqual(
      budgets.maxActiveAnimationsPerController,
    );
  });

  it("retargets resize and mutation storms without accumulating playback", () => {
    const { controller, driver, publications } = createMeasuredController(100);
    controller.moveTo("item-50");
    for (let index = 0; index < budgets.stormIterations; index += 1) {
      const itemCount = index % 2 === 0 ? 100 : 99;
      const scale = 100 + (index % 3);
      controller.remeasure({
        anchors: anchorsFor(itemCount).map((anchor) => ({
          ...anchor,
          position: anchor.order * -scale,
        })),
        bounds: { min: (itemCount - 1) * -scale, max: 0 },
      });
      expect(activeAnimationCount(driver)).toBeLessThanOrEqual(
        budgets.maxActiveAnimationsPerController,
      );
    }
    expect(publications()).toBeLessThanOrEqual(budgets.stormIterations * 3 + 4);
  });

  it("keeps simultaneous controllers independently bounded", () => {
    const instances = Array.from({ length: budgets.simultaneousInstances }, () =>
      createMeasuredController(20),
    );
    for (const { controller } of instances) controller.next();
    expect(
      instances.every(
        ({ driver }) => activeAnimationCount(driver) <= budgets.maxActiveAnimationsPerController,
      ),
    ).toBe(true);
  });
});
