import { describe, expect, it, vi } from "vitest";

import {
  SnapController,
  type ControllerSnapshot,
  type SnapAnchor,
  type SnapControllerOptions,
} from "../src";
import { DeterministicAnimationDriver } from "./fake-animation-driver";

type TestId = "a" | "b" | "c" | "d";

const anchors: readonly SnapAnchor<TestId>[] = [
  { id: "a", order: 0, position: 0 },
  { id: "b", order: 1, position: -100 },
  { id: "c", order: 2, position: -200 },
  { id: "d", order: 3, position: -300 },
];

function createController(overrides: Partial<Omit<SnapControllerOptions<TestId>, "driver">> = {}) {
  const driver = new DeterministicAnimationDriver();
  const controller = new SnapController<TestId>({
    driver,
    bounds: { min: -300, max: 0 },
    anchors,
    initialTargetId: "a",
    ...overrides,
  });
  return { controller, driver };
}

describe("SnapController", () => {
  it("starts idle with a legal semantic target and defensive snapshots", () => {
    const { controller } = createController();
    const snapshot = controller.getSnapshot();
    expect(snapshot).toMatchObject({
      phase: "idle",
      position: 0,
      velocity: 0,
      target: { id: "a" },
      active: { id: "a" },
      isAnimating: false,
    });
    expect(snapshot.anchors).not.toBe(anchors);
  });

  it("writes direct in-bounds drag movement and nonlinear boundary elasticity", () => {
    const { controller } = createController();
    controller.beginDrag();
    controller.dragBy(-40);
    expect(controller.snapshot).toMatchObject({ phase: "dragging", position: -40, velocity: 0 });

    controller.dragTo(40);
    expect(controller.position).toBeGreaterThan(0);
    expect(controller.position).toBeLessThan(40);
  });

  it("selects a release target and passes measured px/s velocity to the driver", () => {
    const onComplete = vi.fn<NonNullable<SnapControllerOptions<TestId>["onComplete"]>>();
    const { controller, driver } = createController({ onComplete });
    controller.beginDrag();
    controller.dragBy(-60);
    expect(controller.release(-240)?.id).toBe("b");
    expect(controller.snapshot).toMatchObject({ phase: "settling", target: { id: "b" } });
    expect(driver.latest.request).toMatchObject({ from: -60, to: -100, initialVelocity: -240 });

    driver.update(-85, -120);
    expect(controller.snapshot).toMatchObject({ position: -85, velocity: -120 });
    driver.complete();
    expect(controller.snapshot).toMatchObject({
      phase: "idle",
      position: -100,
      velocity: 0,
      target: { id: "b" },
      active: { id: "b" },
    });
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("interrupts settling immediately at the actual rendered position", () => {
    const { controller, driver } = createController();
    controller.next();
    driver.update(-37, -140);
    controller.interrupt();
    expect(driver.latest.stopped).toBe(true);
    expect(controller.snapshot).toMatchObject({
      phase: "idle",
      position: -37,
      velocity: 0,
      target: { id: "a" },
    });
  });

  it("ignores stale updates and completion after an interrupted animation", () => {
    const onComplete = vi.fn<NonNullable<SnapControllerOptions<TestId>["onComplete"]>>();
    const { controller, driver } = createController({ onComplete });
    controller.next();
    const staleRun = driver.latest;
    driver.update(-40, -200, staleRun);
    controller.previous();
    const currentRun = driver.latest;

    staleRun.request.onUpdate(-999, -999);
    staleRun.request.onComplete();
    expect(controller.position).toBe(-40);
    expect(controller.snapshot.target?.id).toBe("a");
    expect(onComplete).not.toHaveBeenCalled();

    driver.complete(currentRun);
    expect(controller.position).toBe(0);
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("resolves reduced-motion navigation synchronously without removing drag", () => {
    const onComplete = vi.fn<NonNullable<SnapControllerOptions<TestId>["onComplete"]>>();
    const { controller, driver } = createController({ reducedMotion: true, onComplete });
    controller.beginDrag();
    controller.dragBy(-20);
    expect(controller.snapshot.phase).toBe("dragging");
    controller.release(0);
    expect(driver.runs).toHaveLength(0);
    expect(controller.snapshot).toMatchObject({ phase: "idle", position: 0, target: { id: "a" } });
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("finishes an in-flight target immediately when reduced motion becomes active", () => {
    const onComplete = vi.fn<NonNullable<SnapControllerOptions<TestId>["onComplete"]>>();
    const { controller, driver } = createController({ onComplete });
    controller.next();
    driver.update(-25, -80);
    controller.setReducedMotion(true);
    expect(driver.latest.stopped).toBe(true);
    expect(controller.snapshot).toMatchObject({
      reducedMotion: true,
      phase: "idle",
      position: -100,
      target: { id: "b" },
    });
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("uses the intended target for rapid repeated programmatic navigation", () => {
    const { controller, driver } = createController();
    expect(controller.next()?.id).toBe("b");
    const firstRun = driver.latest;
    expect(controller.next()?.id).toBe("c");
    expect(firstRun.stopped).toBe(true);
    expect(driver.latest.request.to).toBe(-200);
    expect(driver.latest.request.from).toBe(0);
  });

  it("applies a controlled directional impulse to previous and next actions", () => {
    const { controller, driver } = createController({ initialTargetId: "b" });
    controller.next();
    expect(driver.latest.request.initialVelocity).toBeLessThan(0);
    driver.update(-130, -50);
    controller.previous();
    expect(driver.latest.request.initialVelocity).toBeGreaterThan(0);
  });

  it("remeasures idle state by stable semantic ID, not stale pixels", () => {
    const { controller } = createController({ initialTargetId: "b" });
    controller.remeasure({
      bounds: { min: -500, max: 0 },
      anchors: [
        { id: "a", order: 0, position: 0 },
        { id: "b", order: 1, position: -180 },
        { id: "c", order: 2, position: -360 },
      ],
    });
    expect(controller.snapshot).toMatchObject({
      phase: "idle",
      position: -180,
      target: { id: "b" },
      active: { id: "b" },
    });
  });

  it("retargets settling from rendered position while preserving rendered velocity", () => {
    const { controller, driver } = createController();
    controller.moveTo("b");
    const oldRun = driver.latest;
    driver.update(-40, -123);

    controller.remeasure({
      bounds: { min: -600, max: 0 },
      anchors: [
        { id: "a", order: 0, position: 0 },
        { id: "b", order: 1, position: -220 },
        { id: "c", order: 2, position: -440 },
      ],
    });

    expect(oldRun.stopped).toBe(true);
    expect(driver.latest.request).toMatchObject({ from: -40, to: -220, initialVelocity: -123 });
    expect(controller.snapshot).toMatchObject({
      phase: "settling",
      position: -40,
      target: { id: "b" },
    });
  });

  it("preserves semantic drag displacement and rebases subsequent pointer deltas", () => {
    const { controller } = createController({ initialTargetId: "b" });
    controller.beginDrag();
    controller.dragBy(-20);
    expect(controller.position).toBe(-120);

    controller.remeasure({
      bounds: { min: -600, max: 0 },
      anchors: [
        { id: "a", order: 0, position: 0 },
        { id: "b", order: 1, position: -200 },
        { id: "c", order: 2, position: -400 },
      ],
    });
    expect(controller.snapshot).toMatchObject({ phase: "dragging", position: -220 });

    controller.dragBy(-30);
    expect(controller.position).toBe(-230);
  });

  it("falls back deterministically when the semantic anchor disappears", () => {
    const { controller } = createController({ initialTargetId: "b" });
    const target = controller.remeasure({
      bounds: { min: -300, max: 0 },
      anchors: [
        { id: "a", order: 0, position: 0 },
        { id: "c", order: 2, position: -200 },
      ],
    });
    expect(target?.id).toBe("a");
    expect(controller.position).toBe(0);
  });

  it("retunes a settling spring without remounting and preserves velocity", () => {
    const { controller, driver } = createController();
    controller.next();
    const oldRun = driver.latest;
    driver.update(-20, -75);
    controller.configure({ spring: { stiffness: 900, damping: 60 } });

    expect(oldRun.stopped).toBe(true);
    expect(driver.latest.request).toMatchObject({ from: -20, to: -100, initialVelocity: -75 });
    expect(driver.latest.request.spring).toMatchObject({ stiffness: 900, damping: 60 });
  });

  it("updates release, elasticity, and impulse configuration defensively", () => {
    const { controller } = createController();
    controller.configure({
      releasePolicy: { projectionSeconds: 0.4, maxAnchorSkip: 1 },
      elasticity: { min: false, max: { resistance: 4, maxDistance: 20 } },
      programmaticImpulse: 111,
    });
    const configuration = controller.configuration;
    expect(configuration).toMatchObject({
      releasePolicy: { projectionSeconds: 0.4, maxAnchorSkip: 1 },
      elasticity: { min: false, max: { resistance: 4, maxDistance: 20 } },
      programmaticImpulse: 111,
    });
    (configuration.spring as { stiffness: number }).stiffness = 1;
    expect(controller.configuration.spring.stiffness).not.toBe(1);
  });

  it("publishes every driver update and calls completion only for the winning target", () => {
    const onChange = vi.fn<NonNullable<SnapControllerOptions<TestId>["onChange"]>>();
    const onComplete = vi.fn<NonNullable<SnapControllerOptions<TestId>["onComplete"]>>();
    const { controller, driver } = createController({ onChange, onComplete });
    const listener = vi.fn<(snapshot: ControllerSnapshot<TestId>) => void>();
    const unsubscribe = controller.subscribe(listener);
    expect(listener).toHaveBeenCalledOnce();

    controller.next();
    driver.update(-20, -100);
    driver.update(-70, -50);
    driver.complete();
    expect(onChange).toHaveBeenCalled();
    expect(listener.mock.calls.some(([snapshot]) => snapshot.position === -20)).toBe(true);
    expect(listener.mock.calls.some(([snapshot]) => snapshot.position === -70)).toBe(true);
    expect(onComplete).toHaveBeenCalledOnce();

    unsubscribe();
    const calls = listener.mock.calls.length;
    controller.beginDrag();
    expect(listener).toHaveBeenCalledTimes(calls);
  });

  it("stops playback and rejects new work after disposal", () => {
    const { controller, driver } = createController();
    controller.next();
    controller.dispose();
    expect(driver.latest.stopped).toBe(true);
    expect(() => controller.beginDrag()).toThrow(/disposed/);
  });
});
