import { describe, expect, it } from "vitest";

import {
  StackedDeckTransitionState,
  type StackedDeckTransitionInput,
} from "../src/demos/stackedDeckTransition";

function input(overrides: Partial<StackedDeckTransitionInput> = {}): StackedDeckTransitionInput {
  return {
    controllerPhase: "idle",
    itemCount: 5,
    physicalIndex: 2,
    settledIndex: 2,
    targetIndex: 2,
    ...overrides,
  };
}

describe("StackedDeckTransitionState", () => {
  it("keeps the settled item authoritative while a forward drag is incomplete", () => {
    const state = new StackedDeckTransitionState(2, 5);
    const transition = state.update(
      input({ controllerPhase: "dragging", physicalIndex: 2.42, targetIndex: null }),
    );
    expect(transition).toMatchObject({
      settledIndex: 2,
      fromIndex: 2,
      toIndex: 3,
      direction: 1,
      phase: "handoff",
    });
    expect(transition.progress).toBeCloseTo(0.42);
  });

  it("caps direct drag ownership below completion until release", () => {
    const state = new StackedDeckTransitionState(2, 5);
    const transition = state.update(
      input({ controllerPhase: "dragging", physicalIndex: 3.4, targetIndex: null }),
    );
    expect(transition.progress).toBe(0.88);
    expect(transition.settledIndex).toBe(2);
    expect(transition.phase).toBe("settle");
  });

  it("maps a programmatic multi-item command onto one explicit exchange", () => {
    const state = new StackedDeckTransitionState(0, 5);
    const early = state.update(
      input({ controllerPhase: "settling", physicalIndex: 0.8, settledIndex: 0, targetIndex: 4 }),
    );
    const late = state.update(
      input({ controllerPhase: "settling", physicalIndex: 3.2, settledIndex: 0, targetIndex: 4 }),
    );
    expect(early).toMatchObject({ fromIndex: 0, toIndex: 4, direction: 1, progress: 0.2 });
    expect(late).toMatchObject({ fromIndex: 0, toIndex: 4, direction: 1, progress: 0.8 });
  });

  it("reverses the actual partial exchange and crosses direction only through concealment", () => {
    const state = new StackedDeckTransitionState(2, 5);
    const forward = state.update(
      input({ controllerPhase: "dragging", physicalIndex: 2.6, targetIndex: null }),
    );
    const returning = state.update(
      input({ controllerPhase: "dragging", physicalIndex: 2.1, targetIndex: null }),
    );
    const reverse = state.update(
      input({ controllerPhase: "dragging", physicalIndex: 1.9, targetIndex: null }),
    );
    expect(forward.progress).toBeCloseTo(0.6);
    expect(returning).toMatchObject({ fromIndex: 2, toIndex: 3, direction: 1 });
    expect(returning.progress).toBeCloseTo(0.1);
    expect(reverse).toMatchObject({ fromIndex: 2, toIndex: 1, direction: -1 });
    expect(reverse.progress).toBeCloseTo(0.1);
  });

  it("restores the same roles continuously when release or cancellation targets the settled item", () => {
    const state = new StackedDeckTransitionState(2, 5);
    const held = state.update(
      input({ controllerPhase: "dragging", physicalIndex: 2.62, targetIndex: null }),
    );
    const restoring = state.update(
      input({ controllerPhase: "settling", physicalIndex: 2.5, targetIndex: 2 }),
    );
    const nearlyRestored = state.update(
      input({ controllerPhase: "settling", physicalIndex: 2.1, targetIndex: 2 }),
    );
    expect(restoring.fromIndex).toBe(held.fromIndex);
    expect(restoring.toIndex).toBe(held.toIndex);
    expect(restoring.progress).toBeCloseTo(held.progress);
    expect(nearlyRestored.progress).toBeLessThan(restoring.progress);
    expect(
      state.update(input({ controllerPhase: "idle", physicalIndex: 2, targetIndex: 2 })),
    ).toMatchObject({ phase: "idle", settledIndex: 2, fromIndex: 2, toIndex: 2 });
  });

  it("preserves rendered progress when a spring is re-grabbed", () => {
    const state = new StackedDeckTransitionState(0, 5);
    const settling = state.update(
      input({ controllerPhase: "settling", physicalIndex: 0.45, settledIndex: 0, targetIndex: 1 }),
    );
    const regrabbed = state.update(
      input({
        controllerPhase: "dragging",
        physicalIndex: 0.45,
        settledIndex: 0,
        targetIndex: null,
      }),
    );
    expect(regrabbed).toEqual(settling);
    expect(regrabbed.phase).not.toBe("idle");
  });

  it("conceals an exposed incoming card before adopting a second command", () => {
    const state = new StackedDeckTransitionState(0, 5);
    state.update(
      input({ controllerPhase: "settling", physicalIndex: 0.6, settledIndex: 0, targetIndex: 1 }),
    );
    const interrupted = state.update(
      input({ controllerPhase: "settling", physicalIndex: 0.65, settledIndex: 0, targetIndex: 2 }),
    );
    const concealing = state.update(
      input({ controllerPhase: "settling", physicalIndex: 0.82, settledIndex: 0, targetIndex: 2 }),
    );
    const redirected = state.update(
      input({ controllerPhase: "settling", physicalIndex: 0.98, settledIndex: 0, targetIndex: 2 }),
    );
    expect(interrupted).toMatchObject({ fromIndex: 0, toIndex: 1 });
    expect(interrupted.phase).not.toBe("idle");
    expect(concealing.progress).toBeLessThan(interrupted.progress);
    expect(redirected).toMatchObject({ fromIndex: 0, toIndex: 2, direction: 1 });
    expect(redirected.progress).toBeCloseTo(0.18);
  });

  it("commits only when the owner supplies a new settled index at idle", () => {
    const state = new StackedDeckTransitionState(2, 5);
    state.update(input({ controllerPhase: "settling", physicalIndex: 2.95, targetIndex: 3 }));
    expect(state.transition.settledIndex).toBe(2);
    const committed = state.update(
      input({ controllerPhase: "idle", physicalIndex: 3, settledIndex: 3, targetIndex: 3 }),
    );
    const repeated = state.update(
      input({ controllerPhase: "idle", physicalIndex: 3, settledIndex: 3, targetIndex: 3 }),
    );
    expect(committed).toMatchObject({ phase: "idle", settledIndex: 3 });
    expect(repeated).toEqual(committed);
  });

  it("rejects invalid state input", () => {
    expect(() => new StackedDeckTransitionState(5, 5)).toThrow(RangeError);
    const state = new StackedDeckTransitionState(0, 5);
    expect(() => state.update(input({ physicalIndex: Number.NaN }))).toThrow(TypeError);
    expect(() => state.update(input({ settledIndex: 7 }))).toThrow(RangeError);
  });
});
